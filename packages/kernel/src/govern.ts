/**
 * The decision gate: how a proposal becomes a change, or does not.
 *
 * THE RECORD ALREADY OPENS SUGGESTIONS FROM THREE PLACES — a delivery that failed eight times, an
 * ingest whose pattern is not trusted to write, and the weekly analyser's draft — and until this
 * file existed nothing could read one, let alone answer it. Every one of them was a message in a
 * bottle. That is the failure this closes.
 *
 * A DECISION IS A ROW, NOT A SIDE EFFECT. `D41` says what was asked, what was answered, why, by whom
 * and when, and the change it authorised happened in the same transaction. A product that applied a
 * proposal and recorded the application is a product that cannot answer "who decided this and what
 * did they say", which is the only question anybody asks six months later.
 *
 * A REASON IS REQUIRED AND IS NEVER A DROPDOWN. `requires_reason` is on every options body and the
 * gate enforces it for every kind: a decision with no sentence is a decision nobody can revisit.
 *
 * AND THERE IS A THIRD VERB. `defer` is neither yes nor no — it is "not now, and here is when to ask
 * me again", and it writes no event because deferring is not a thing that happened to the record. A
 * gate with only two verbs is a gate people clear by dismissing things they meant to think about.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';
import { stored } from './metrics.ts';

/** The three tables that are read like registers and are not registers. */
export const GOVERNANCE = ['suggestion', 'decision', 'prediction'] as const;
export type GovernRegister = (typeof GOVERNANCE)[number];

/** The four bodies of `33-CONTRACTS` §2. A fifth, `query`, is Spark's palette answer and is never filed. */
export const BODY_KINDS = ['options', 'pattern', 'rowset', 'change'] as const;
export type BodyKind = (typeof BODY_KINDS)[number];

export type Suggestion = {
  id: string;
  body_kind: BodyKind;
  body: Record<string, unknown>;
  status: string;
  opened_by: string;
  opened_at: string;
  resolved_as: string | null;
  defer_until: string | null;
  defer_why: string | null;
};

export type Decision = {
  id: string;
  question: string;
  answer: string;
  reason: string;
  decided_by: string;
  ts: string;
  supersedes: string | null;
};

export type GovernDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  allocate: (name: string) => number;
  /** Whether a register exists, so a `rowset` cannot name one that does not. */
  hasRegister: (register: string) => boolean;
  /** The write path, for the rows an accepted `rowset` writes. */
  write: (register: string, patch: Record<string, unknown>, actor: string, batch: string) => Result<{ id: string }>;
  /**
   * Read a prediction's measure over a window, for the baseline frozen at acceptance.
   *
   * INJECTED RATHER THAN IMPORTED, because it is the metrics module's `evaluateMetric` with the
   * caller's own evaluation context — timezone and scope included — and this file has no business
   * knowing what those are.
   */
  measure: (m: { source: string; where?: unknown; value: unknown }, window: string) => Result<{ value: number | null }>;
};

/**
 * What a `change` promises will be true, and how the record will know.
 *
 * 24 §4.6's shape, and the product's own law applied to itself: ADR-007 says a number with no target
 * is decoration and a number with no comparison window is a number you cannot act on. A proposal
 * with no falsifiable claim is a proposal nobody can grade, which is how a self-improving loop turns
 * into a machine that fills somebody's week.
 */
export type Prediction = {
  claim: string;
  measure: { source: string; where?: unknown; value: unknown };
  target: Record<string, number>;
  /** `30d`, `90d` — the same offsets a schedule takes. */
  window: string;
  unit?: string;
  on_miss?: 'suggest' | 'none';
};

const COLUMNS: Record<GovernRegister, string> = {
  suggestion: 'id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why',
  decision: 'id, question, answer, reason, decided_by, ts, supersedes',
  prediction:
    'id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, observed, met, on_miss',
};

/** Newest first, because a queue nobody has answered is read from the top. */
const ORDER: Record<GovernRegister, string> = {
  suggestion: 'opened_at DESC, rowid DESC',
  decision: 'ts DESC, rowid DESC',
  prediction: 'score_at DESC, rowid DESC',
};

/**
 * The governance rows, read like a register.
 *
 * `open` IS THE DEFAULT VIEW OF SUGGESTIONS, and a deferred one is not open until its day comes.
 * The alternative — showing everything and letting whoever is looking filter — is a queue that
 * grows and is therefore a queue nobody reads.
 */
export function listGovernance(
  deps: Pick<GovernDeps, 'sql' | 'nowMs'>,
  register: GovernRegister,
  opts: { status?: string | undefined; limit?: number | undefined } = {},
): Result<Record<string, unknown>[]> {
  if (!(GOVERNANCE as readonly string[]).includes(register))
    return no('REGISTER_UNKNOWN', `${register} is not a governance register.`, { at: 'register', allowed: GOVERNANCE });

  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (register === 'suggestion' && opts.status !== 'all') {
    where.push('status = ?');
    params.push(opts.status ?? 'open');
    if ((opts.status ?? 'open') === 'open') {
      where.push('(defer_until IS NULL OR defer_until <= ?)');
      params.push(instant(deps.nowMs));
    }
  }

  const rows = deps.sql.all<Record<string, unknown>>(
    `SELECT ${COLUMNS[register]} FROM ${register}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ORDER[register]} LIMIT ?`,
    ...params,
    limit,
  );
  return ok(rows.map((r) => hydrate(register, r)));
}

/** One row, or `null`. A missing governance row is a value, not a refusal — 45 §13 #10. */
export function getGovernance(sql: Sql, register: GovernRegister, id: string): Record<string, unknown> | null {
  if (!(GOVERNANCE as readonly string[]).includes(register)) return null;
  const row = sql.one<Record<string, unknown>>(`SELECT ${COLUMNS[register]} FROM ${register} WHERE id = ?`, id);
  return row ? hydrate(register, row) : null;
}

/** The JSON columns come back as objects, because a caller reading `body.register` should not parse. */
function hydrate(register: GovernRegister, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of register === 'suggestion' ? ['body'] : register === 'prediction' ? ['measure'] : [])
    if (typeof out[key] === 'string') {
      try {
        out[key] = JSON.parse(out[key] as string) as unknown;
      } catch {
        /* A body this record cannot parse is still a row somebody has to see. It goes back as the
           string it is rather than as a refusal that hides the whole queue. */
      }
    }
  return out;
}

/* ── opening one ─────────────────────────────────────────────────────────── */

export type Proposal = { question: string; body_kind: BodyKind; body: Record<string, unknown> };

/** At most this many rows in one `rowset`. Past it, it is an import and wants a different verb. */
const MAX_ROWS = 200;

/**
 * Open a suggestion.
 *
 * THE BODY IS CHECKED HERE AND NOT AT THE GATE, because the person answering it should not be the
 * one who finds out it was malformed. A proposal that cannot be applied is a proposal that should
 * never have been filed.
 */
export function propose(deps: GovernDeps, actor: string, p: Proposal): Result<{ id: string }> {
  if (!p?.question?.trim())
    return no<{ id: string }>('REQUIRED_MISSING', 'A proposal is a question somebody can answer.', { at: 'question' });
  if (!(BODY_KINDS as readonly string[]).includes(p.body_kind))
    return no<{ id: string }>('ENUM_VALUE_UNKNOWN', `${String(p.body_kind)} is not a kind of proposal.`, {
      at: 'body_kind',
      allowed: BODY_KINDS,
    });

  const wrong = checkBody(deps, p.body_kind, p.body ?? {});
  if (wrong) return { ok: false, refusal: wrong };

  const id = `SG${deps.allocate('suggestion')}`;
  const at = instant(deps.nowMs);
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, ?, ?, 'open', ?, ?)",
    id,
    p.body_kind,
    JSON.stringify(p.body ?? {}),
    actor,
    at,
  );
  /* THE QUESTION GOES IN `to_v`, WHICH IS WHERE 45 §5.4 PUTS IT — and `note` is capped at 280 by
     the rule that a note is one sentence a human reads in six weeks. A question is not a note: it is
     the thing being asked, the `suggestion` table has no column for it, and this event is the only
     copy. So a question over 280 characters was silently cut here and the cut version became the
     immutable `decision.question` — the record's permanent answer to "what was asked", wrong, with
     the original nowhere. */
  event(deps, at, actor, 'suggest', `suggestion:${id}`, 'suggestion', p.question);
  return ok({ id });
}

function checkBody(deps: GovernDeps, kind: BodyKind, body: Record<string, unknown>): Refusal | null {
  const missing = (key: string): Refusal => ({
    code: 'REQUIRED_MISSING',
    fix: `A ${kind} proposal needs ${key}.`,
    at: `body.${key}`,
  });

  if (kind === 'options') {
    const options = body.options;
    /* TWO OR IT IS NOT A CHOICE. One option is an announcement wearing a question mark, and a gate
       that accepts one teaches people that answering is a formality. */
    if (!Array.isArray(options) || options.length < 2)
      return { code: 'OUT_OF_BOUNDS', fix: 'A choice is between at least two options.', at: 'body.options' };
    for (const o of options as Record<string, unknown>[])
      if (typeof o?.id !== 'string' || typeof o?.label !== 'string' || typeof o?.because !== 'string')
        return {
          code: 'REQUIRED_MISSING',
          fix: 'Every option carries an id, a label, and the because that is the reason to pick it.',
          at: 'body.options',
        };
    return null;
  }

  if (kind === 'rowset') {
    const register = body.register;
    if (typeof register !== 'string') return missing('register');
    if (!deps.hasRegister(register))
      return { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.`, at: 'body.register' };
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) return missing('rows');
    /* A ROW IS AN OBJECT OF FIELDS. `null` cleared this check and then threw out of the write path
       at the gate — the one boundary this package promises nothing throws over. */
    if (rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r)))
      return { code: 'VALUE_MALFORMED', fix: 'Every row is an object of field ids to values.', at: 'body.rows' };
    if (rows.length > MAX_ROWS)
      return {
        code: 'OUT_OF_BOUNDS',
        fix: `A rowset is at most ${MAX_ROWS} rows, and this one is ${rows.length}. More than that is an import.`,
        at: 'body.rows',
      };
    return null;
  }

  if (kind === 'pattern') {
    if (!body.ingest || typeof body.ingest !== 'object') return missing('ingest');
    /* AND THE SAMPLES IT WAS DRAWN FROM. 45 §5.4 puts `samples: [raw_id…]` in the body, and 07 §4's
       review counts hits against them — the `3/3 · 2/3 · 0/3` a reviewer reads before accepting. A
       pattern filed without them is a declaration somebody is asked to approve with nothing to check
       it against, which is the shape of proposal that gets approved because reading it is harder. */
    if (!Array.isArray(body.samples) || body.samples.length === 0)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A pattern proposal carries the arrivals it was drawn from, so whoever answers can check it against them.',
        at: 'body.samples',
      };
    return null;
  }
  if (typeof body.declaration_id !== 'string') return missing('declaration_id');
  if (!body.to || typeof body.to !== 'object') return missing('to');

  /* AND ITS PREDICTION, IF IT CARRIES ONE — checked here rather than at acceptance, for the reason
     every other body is checked here: the person answering should not be the one who finds out it
     was malformed. A `change` may be proposed by a person who is simply changing something, so a
     prediction is optional; one that is present has to be gradeable. */
  if (body.prediction !== undefined) {
    const wrong = checkPrediction(body.prediction);
    if (wrong) return wrong;
  }
  return null;
}

/**
 * Whether a prediction can be settled at all.
 *
 * `PREDICTION_UNMEASURABLE` IS THE POINT OF THE CHECK (30 §6). It kills the entire class of
 * "improvements" that are vibes: a claim with no source, no value to read and no bound to compare
 * against cannot be wrong, and a loop whose proposals cannot be wrong learns nothing from being run.
 */
function checkPrediction(raw: unknown): Refusal | null {
  const unmeasurable = (fix: string, at: string): Refusal => ({ code: 'PREDICTION_UNMEASURABLE', fix, at });
  if (!raw || typeof raw !== 'object') return unmeasurable('A prediction is an object.', 'body.prediction');
  const p = raw as Record<string, unknown>;

  if (typeof p.claim !== 'string' || !p.claim.trim())
    return unmeasurable('A prediction says in one sentence what will be true.', 'body.prediction.claim');
  const m = p.measure as { source?: unknown; value?: unknown } | undefined;
  if (!m || typeof m !== 'object' || typeof m.source !== 'string' || !m.value)
    return unmeasurable('A prediction names what to read and where to read it.', 'body.prediction.measure');
  const target = p.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== 'object' || Object.keys(target).length === 0)
    return unmeasurable('A prediction with no target cannot be met or missed.', 'body.prediction.target');
  /* AND ONE OF THE TWO BOUNDS THE SCORER CAN READ. `lt`, `gt` and `is` used to file cleanly and be
     unscoreable, and an unrecognised key silently turned off the already-true check as well. */
  const key = Object.keys(target)[0];
  if (Object.keys(target).length !== 1 || (key !== 'lte' && key !== 'gte') || typeof target[key] !== 'number')
    return {
      code: 'ENUM_VALUE_UNKNOWN',
      fix: 'A prediction takes one bound: { lte: <number> } or { gte: <number> }.',
      at: 'body.prediction.target',
      allowed: ['lte', 'gte'],
    };
  if (typeof p.window !== 'string' || !/^\d+[dhm]$/.test(p.window))
    return unmeasurable('A prediction says when to look: 30d, 90d.', 'body.prediction.window');
  if (p.on_miss !== undefined && p.on_miss !== 'suggest' && p.on_miss !== 'none')
    return { code: 'ENUM_VALUE_UNKNOWN', fix: 'One of: suggest, none.', at: 'body.prediction.on_miss', allowed: ['suggest', 'none'] };
  return null;
}

/* ── answering one ───────────────────────────────────────────────────────── */

export type Decided = {
  /** `D<n>` when it was decided, `null` when it was deferred. */
  decision: string | null;
  suggestion: string;
  status: string;
  /** Rows an accepted `rowset` wrote. */
  wrote: string[];
  /** A declaration an accepted `pattern` or `change` asks the caller to install. */
  install?: Record<string, unknown>;
};

export type Verdict =
  | { decide: { option: string; reason: string } }
  | { defer: { until: string; why: string } }
  | { resolved_as: 'wont-fix' | 'incorrect'; reason?: string };

/**
 * The gate.
 *
 * THE CHANGE AND THE DECISION ARE ONE TRANSACTION. An accepted `rowset` writes its rows here, beside
 * the `D<n>` that authorised them and wearing the same batch — so "undo this decision" is one query
 * rather than an archaeology exercise. A `pattern` or a `change` cannot be: installing a declaration
 * is asynchronous, so the caller is handed the body to install and this refuses to resolve the
 * suggestion until that has happened.
 */
export function decide(deps: GovernDeps, id: string, verdict: Verdict, actor: string): Result<Decided> {
  const row = deps.sql.one<{ id: string; body_kind: BodyKind; body: string; status: string }>(
    'SELECT id, body_kind, body, status FROM suggestion WHERE id = ?',
    id,
  );
  if (!row) return no<Decided>('OUT_OF_BOUNDS', `There is no suggestion called ${id}.`, { at: 'id' });

  const at = instant(deps.nowMs);

  /* DEFER IS NOT A DECISION AND WRITES NO EVENT. "Not now, ask me on the ninth" is a thing that
     happened to the reader, not to the record — and a gate with only yes and no is a gate people
     clear by dismissing what they meant to think about. */
  if ('defer' in verdict) {
    if (row.status !== 'open')
      return no<Decided>('TRANSITION_ILLEGAL', `${id} is ${row.status}, and only an open suggestion can be deferred.`, {
        at: 'status',
        allowed: ['open'],
      });
    if (!verdict.defer?.until || !verdict.defer?.why?.trim())
      return no<Decided>('REQUIRED_MISSING', 'Deferring says when to ask again, and why it can wait.', { at: 'defer' });
    /* AND `when` IS AN ISO DATE, because it is compared as a STRING against an instant. Checking
       that it parses is not the same check and lets both failures through: `Oct 1 2026` parses and
       sorts after every date there will ever be, so the question leaves the open queue for ever
       while the gate keeps reporting it open; `10/01/2026` parses and sorts before today, so the
       deferral is a silent no-op. Both are the outcome this check exists to prevent, which is why
       it now tests the shape rather than the parse. */
    if (!/^\d{4}-\d{2}-\d{2}/.test(verdict.defer.until) || !Number.isFinite(Date.parse(verdict.defer.until)))
      return no<Decided>('VALUE_MALFORMED', `${verdict.defer.until} is not a date. Write 2026-10-01.`, { at: 'until' });
    deps.sql.exec('UPDATE suggestion SET defer_until = ?, defer_why = ? WHERE id = ?', verdict.defer.until, verdict.defer.why, id);
    return ok({ decision: null, suggestion: id, status: 'open', wrote: [] });
  }

  if (row.status !== 'open')
    return no<Decided>('TRANSITION_ILLEGAL', `${id} is ${row.status}, and a decision is made once.`, {
      at: 'status',
      allowed: ['open'],
    });

  /* NO IS AN ANSWER AND IS RECORDED AS ONE. `incorrect` also feeds the brake: a class of proposal
     that keeps being wrong stops being proposed, and it can only learn that from being told. */
  if ('resolved_as' in verdict) {
    if (verdict.resolved_as !== 'wont-fix' && verdict.resolved_as !== 'incorrect')
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${String(verdict.resolved_as)} is not a way to resolve one.`, {
        at: 'resolved_as',
        allowed: ['wont-fix', 'incorrect'],
      });
    deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = ? WHERE id = ?", verdict.resolved_as, id);
    event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', verdict.resolved_as, verdict.reason);
    if (verdict.resolved_as === 'incorrect')
      deps.sql.exec(
        "INSERT INTO observation (kind, subject, day, n) VALUES ('suggestion.incorrect', ?, ?, 1) ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1",
        row.body_kind,
        new Date(deps.nowMs).toISOString().slice(0, 10),
      );
    return ok({ decision: null, suggestion: id, status: 'resolved', wrote: [] });
  }

  const { option, reason } = verdict.decide ?? { option: '', reason: '' };
  /* THE REASON IS NOT OPTIONAL. A decision with no sentence is a decision nobody can revisit, and
     the whole point of writing it down is that somebody will want to. */
  if (!reason?.trim()) return no<Decided>('REQUIRED_MISSING', 'A decision carries the reason for it.', { at: 'reason' });
  if (!option?.trim()) return no<Decided>('REQUIRED_MISSING', 'A decision names what was chosen.', { at: 'option' });

  const body = parse(row.body);
  /* A QUESTION THIS RECORD CANNOT READ IS NOT A QUESTION IT CAN ANSWER. It used to resolve as
     `addressed` with a `D<n>` behind it and nothing written — the gate saying yes to something it
     had not read. */
  if (!body) return no<Decided>('VALUE_MALFORMED', `${id} carries a body this record cannot read.`, { at: 'body' });

  if (row.body_kind === 'options') {
    const ids = ((body.options ?? []) as { id?: string }[]).map((o) => o.id).filter((x): x is string => typeof x === 'string');
    if (!ids.includes(option))
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${option} is not one of the options on ${id}.`, {
        at: 'option',
        allowed: ids,
      });
  }

  /* AND THE OTHER THREE KINDS TAKE ONE OF TWO WORDS. `Accept` with a capital, or `yes`, used to
     fall past the `accept` branch and resolve the question having done nothing — the gate silently
     answering yes and applying none of it. */
  if (row.body_kind !== 'options' && option !== 'accept' && option !== 'reject')
    return no<Decided>('ENUM_VALUE_UNKNOWN', `A ${row.body_kind} is accepted or rejected, and ${option} is neither.`, {
      at: 'option',
      allowed: ['accept', 'reject'],
    });

  const wrote: string[] = [];
  let install: Record<string, unknown> | undefined;

  if (option === 'accept') {
    if (row.body_kind === 'rowset') {
      const batch = deps.mint();
      const register = String(body.register);
      const mechanism = typeof body.ingest === 'string' ? `ingest:${body.ingest}` : actor;
      for (const r of (body.rows ?? []) as Record<string, unknown>[]) {
        const made = deps.write(register, r, mechanism, batch);
        /* ALL THE ROWS OR NONE. Half a rowset accepted is a decision whose answer is not true of the
           record, and the caller's transaction is what undoes the rest. */
        if (!made.ok) return made;
        wrote.push(made.value.id);
      }
    } else if (row.body_kind === 'pattern' || row.body_kind === 'change') {
      install = (row.body_kind === 'pattern' ? body.ingest : body.to) as Record<string, unknown>;
      if (!install || typeof install !== 'object')
        return no<Decided>('VALUE_MALFORMED', `${id} carries nothing to install.`, { at: 'body' });
    }

    /* THE PREDICTION, WRITTEN WITH THE DECISION AND IN THE SAME TRANSACTION.

       NOTHING WROTE ONE. `scorePrediction`, the `score` schedule handler and the brake that reads
       twenty scored rows were all built, tested and unreachable, because the table they work on had
       no writer — so the one control that stops a loop proposing nonsense could never engage. A
       loop that proposes and is never graded is the exact failure 24 §4.6 is titled after.

       ATOMIC WITH THE DECISION, because a declaration that changed with no prediction beside it is
       a change nobody can grade, and a prediction with no change behind it grades nothing. */
    if (row.body_kind === 'change' && body.prediction) {
      const wrote_ = writePrediction(deps, id, body.prediction as Prediction, String(body.declaration_id ?? id), at);
      if (!wrote_.ok) return wrote_ as Result<Decided>;
    }
  }

  const question = questionOf(deps, id) ?? id;
  const decision = `D${deps.allocate('decision')}`;
  deps.sql.exec(
    'INSERT INTO decision (id, question, answer, reason, decided_by, ts, supersedes) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    decision,
    question,
    option,
    reason,
    actor,
    at,
  );
  deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = ?", id);
  event(deps, at, actor, 'decide', `decision:${decision}`, 'decision', JSON.stringify({ question, answer: option }));
  event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', 'addressed', reason);

  return ok({ decision, suggestion: id, status: 'resolved', wrote, ...(install === undefined ? {} : { install }) });
}

/**
 * Write the prediction an accepted `change` carries, and schedule its scoring.
 *
 * THE BASELINE IS FROZEN HERE, measured over the window BEFORE acceptance. Recomputing it at scoring
 * time is grading your own homework and makes every prediction pass — 24 §4.6 says so in one line,
 * and it is the difference between a loop that learns and a loop that congratulates itself.
 *
 * AND A BASELINE THAT ALREADY MEETS ITS TARGET IS REFUSED. It is the reward-hacking control: without
 * it the cheapest way for the loop to look useful is to predict things that are already true, and
 * that is a local optimum it will find.
 */
function writePrediction(deps: GovernDeps, sg: string, p: Prediction, forDecl: string, at: string): Result<string> {
  const reading = deps.measure(p.measure, p.window);
  if (!reading.ok) return reading as Result<string>;
  const baseline = reading.value.value;
  if (baseline === null)
    return no<string>('PREDICTION_UNMEASURABLE', `${sg}'s prediction reads nothing today, so it can never be settled.`, {
      at: 'body.prediction.measure',
    });

  if (met(baseline, p.target))
    return no<string>(
      'OUT_OF_BOUNDS',
      `${sg} predicts ${p.claim}, and that is already true at ${baseline}. A prediction the record already meets grades nothing.`,
      { at: 'body.prediction.target' },
    );

  const id = `pr_${deps.mint()}`;
  const scoreAt = deps.nowMs + windowMs(p.window);
  deps.sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    forDecl,
    p.claim,
    JSON.stringify(p.measure),
    /* THE SAME INTEGER RULE THE OBSERVATION IS STORED UNDER. `Math.round` here and `stored()` at
       scoring time put a ratio of 0.375 in as `baseline: 0` and back out as `observed: 3750` — a
       ten-thousand-fold disagreement in the one row whose entire purpose is a before-and-after. */
    stored(baseline),
    p.unit ?? (Number.isInteger(baseline) ? 'count' : 'pct.bp'),
    /* THE SCORER'S GRAMMAR, NOT JSON. `targetOf` parses `<=0` and `>=3`; `Number('{"lte":0}')` is
       `NaN`, so a prediction written as JSON came back `VALUE_MALFORMED` at scoring time, never got
       a `scored_at`, and walked the retry ladder to dead. Twenty scored rows is what the brake
       needs, so the loop still could not grade itself — the writer had moved and nothing else. Two
       grammars for one column is the whole of the defect; there is one now. */
    bound(p.target),
    p.window,
    instant(scoreAt),
    p.on_miss ?? 'suggest',
  );

  /* `score_at` IS A ROW IN `schedule`, which is 24 §4.6's own note and the reason this costs no new
     infrastructure: the single alarm already drains hundreds of due rows. */
  deps.sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts)
     VALUES (?, ?, 'score', ?, ?, 'pending', 0) ON CONFLICT (kind, key) DO NOTHING`,
    deps.mint(),
    instant(scoreAt),
    `prediction:${id}`,
    JSON.stringify({ prediction: id }),
  );

  event(deps, at, 'system', 'predict', `prediction:${id}`, 'prediction', JSON.stringify({ claim: p.claim, baseline, target: p.target }));
  return ok(id);
}

/**
 * Whether a reading satisfies a bound — the TWO the target grammar admits.
 *
 * IT ACCEPTED FIVE AND THE SCORER READS TWO. `lt`, `gt` and `is` filed cleanly here, were unscoreable
 * at the other end, and — worse — an unknown key made this return `false`, which silently disabled
 * the already-true check: a prediction the record already meets was accepted because the check that
 * refuses one could not read its own target. `checkPrediction` refuses the other three now, at
 * filing, where the author can fix it.
 */
function met(value: number, target: Record<string, number>): boolean {
  if (target.lte !== undefined) return value <= target.lte;
  if (target.gte !== undefined) return value >= target.gte;
  return false;
}

/** The target as `targetOf` reads it back: `<=0`, `>=3`. One grammar, written where it is written. */
const bound = (target: Record<string, number>): string =>
  target.lte !== undefined ? `<=${target.lte}` : `>=${target.gte ?? 0}`;

/** `30d` in milliseconds. The window grammar is the schedule's, so there is one of them. */
function windowMs(window: string): number {
  const [, n = '30', unit = 'd'] = /^(\d+)([dhm])$/.exec(window) ?? [];
  const each = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return Number(n) * each;
}

/**
 * Put a resolved suggestion back in the queue.
 *
 * FOR THE ONE CASE THE GATE CANNOT HOLD IN ITS TRANSACTION: an accepted `pattern` whose declaration
 * then will not install. The decision stands — somebody did answer — and the question comes back,
 * because a suggestion resolved with nothing behind it is the gate telling a lie.
 */
export function reopen(deps: GovernDeps, id: string, why = 'What was accepted would not install.'): Result<null> {
  const row = deps.sql.one<{ status: string; resolved_as: string | null; body_kind: BodyKind }>(
    'SELECT status, resolved_as, body_kind FROM suggestion WHERE id = ?',
    id,
  );
  if (!row) return no<null>('OUT_OF_BOUNDS', `There is no suggestion called ${id}.`, { at: 'id' });

  /* ONLY WHAT WAS ACCEPTED. Reopening a `wont-fix` resurrects a question somebody answered, and
     nothing here undoes what an acceptance did. */
  if (row.status !== 'resolved' || row.resolved_as !== 'addressed')
    return no<null>('TRANSITION_ILLEGAL', `${id} is ${row.resolved_as ?? row.status}, and only an accepted one comes back.`, {
      at: 'status',
      allowed: ['addressed'],
    });

  /* AND ONLY THE TWO KINDS THIS EXISTS FOR. A `pattern` or a `change` is applied OUTSIDE the gate's
     transaction, so it is the only acceptance that can fail after the question was resolved. An
     accepted `rowset` wrote its rows in that transaction — reopening it would let a decision made
     once be applied twice, and the second copy of forty rows is not a thing anybody undoes by hand. */
  if (row.body_kind !== 'pattern' && row.body_kind !== 'change')
    return no<null>('TRANSITION_ILLEGAL', `A ${row.body_kind} was applied when it was accepted, and does not come back.`, {
      at: 'body_kind',
      allowed: ['pattern', 'change'],
    });

  /* AND THE DEFERRAL GOES WITH IT. A reopened suggestion carrying a `defer_until` from last year
     comes back invisible, which is the same as not coming back. */
  deps.sql.exec("UPDATE suggestion SET status = 'open', resolved_as = NULL, defer_until = NULL, defer_why = NULL WHERE id = ?", id);

  /* AND IT SAYS SO, because the first law of this file is that a decision is a row and not a side
     effect. Without this a resolved row went back to open with nothing between the `resolve` event
     and the reopened state — so anybody reading the log saw a suggestion resolved and open at once,
     with no account of how. The `decision` stands: somebody did answer, and this is not an undo. */
  event(deps, instant(deps.nowMs), 'system', 'suggest', `suggestion:${id}`, 'suggestion', 'reopened', why);
  return ok(null);
}

/**
 * The question, from the `suggest` event that carried it — the only copy there is.
 *
 * `to_v` FIRST AND `note` AFTER IT. `to_v` is where it belongs and where it is written now; `note`
 * is where a record written by an earlier build put it, capped at 280. Reading both costs one
 * `coalesce` and means an old record's questions still answer for themselves.
 */
function questionOf(deps: GovernDeps, id: string): string | null {
  return (
    deps.sql.one<{ q: string | null }>(
      "SELECT coalesce(to_v, note) AS q FROM event WHERE kind = 'suggest' AND target = ? ORDER BY rowid LIMIT 1",
      `suggestion:${id}`,
    )?.q ?? null
  );
}

function event(
  deps: GovernDeps,
  at: string,
  actor: string,
  kind: string,
  target: string,
  targetKind: string,
  to: string,
  note?: string,
): void {
  deps.sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    deps.mint(),
    at,
    actor,
    kind,
    target,
    targetKind,
    to,
    note === undefined ? null : note.slice(0, 280),
  );
}

const parse = (body: string): Record<string, unknown> | null => {
  try {
    const out: unknown = JSON.parse(body);
    return out && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
