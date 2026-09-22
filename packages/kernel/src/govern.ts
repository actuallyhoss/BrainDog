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

import { keyNamed, runnerCannotOpen, type Egress } from './actions.ts';
import { instant } from './migrate.ts';
import { point } from './metrics.ts';
import { sparkMayWrite } from './spark.ts';

/** The three tables that are read like registers and are not registers. */
export const GOVERNANCE = ['suggestion', 'decision', 'prediction'] as const;
export type GovernRegister = (typeof GOVERNANCE)[number];

/**
 * The bodies a suggestion carries: the four of `33-CONTRACTS` §2, and the three that arrange a BrainDog.
 *
 * `pack`, `settings` AND `arrange` ARE HOW AN AGENT OR SPARK CHANGES WHAT A RECORD IS (`loop/research-spark.md`
 * S12, `DIRECTION.md` §11). Installing a pack and changing a pack's settings are an owner's, in a browser, and
 * no token of any scope reaches them. A proposal is the one way an agent asks for either, and the owner's
 * press is what applies it. `arrange` is several of them, and pages, as one reviewable question.
 *
 * A fifth of the original kind, `query`, is Spark's palette answer and is never filed.
 */
export const BODY_KINDS = ['options', 'pattern', 'rowset', 'change', 'pack', 'settings', 'arrange'] as const;
export type BodyKind = (typeof BODY_KINDS)[number];

/** The kinds applied by the caller after the gate says yes, because installing is asynchronous. */
export const ARRANGING = ['pack', 'settings', 'arrange'] as const;
export type Arranging = (typeof ARRANGING)[number];
const arranging = (kind: string): kind is Arranging => (ARRANGING as readonly string[]).includes(kind);

/** What a `pack` proposal asks for. Exactly one, naming one pack. */
export const PACK_VERBS = ['install', 'enable', 'disable'] as const;

/** Spark's own ceiling (`research-spark.md` §3.2, ADR-051): more open arrangements than this is a queue nobody reads. */
export const OPEN_ARRANGEMENTS = 3;

/** A pack id as `normalise` takes one. */
const PACK_ID = /^[a-z][a-z0-9-]{0,63}$/;
/** At most this many packs, pages or settings changes in one arrangement. Past it, it is a rebuild. */
const ARRANGE_CEILING = 12;
/** At most this many rows in one arrangement: a plan, not an import. */
const ARRANGE_ROWS = 60;

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
  /** A row of `register` by its spoken id or row id, deleted ones included, for a `rowset` row that updates it. */
  row: (register: string, at: string) => { id: string; deleted: boolean } | null;
  /**
   * The write path, for the rows an accepted `rowset` writes. With `update` it changes that row,
   * compare-and-set on `update.version`, and otherwise it creates one.
   */
  write: (
    register: string,
    patch: Record<string, unknown>,
    actor: string,
    batch: string,
    update?: { id: string; version: number },
  ) => Result<{ id: string; version: number }>;
  /**
   * Read a prediction's measure over a window, for the baseline frozen at acceptance.
   *
   * INJECTED RATHER THAN IMPORTED, because it is the metrics module's `evaluateMetric` with the
   * caller's own evaluation context — timezone and scope included — and this file has no business
   * knowing what those are.
   */
  measure: (m: { source: string; where?: unknown; value: unknown }, window: string) => Result<{ value: number | null }>;
  /**
   * What a `change` would send out of the record, if it declares or changes a scheduled action.
   *
   * ONE PROPOSAL, ONE PRESS (`loop/research-scheduled-actions.md` step 13). The record lints the declarations the change
   * carries, with the checks the install runs when it is accepted, and works out, from them alone, every host they call,
   * how often, the key by label and the fields sent. It answers a refusal when the declarations would not install, and
   * otherwise `null` when the change sends nothing new.
   */
  review?: (to: Record<string, unknown>) => Result<{ egress: Egress[]; approve: string[] } | null>;
  /**
   * Whether what a `change` installs is still true of the rows, asked when it is accepted.
   *
   * AT ACCEPTANCE AS WELL AS WHEN IT IS FILED, because the rows move in between: a `state` narrowed to `paid` over a
   * register with no open rows is filed cleanly, and two open rows written before the owner presses accept make it a
   * register whose rows every later edit refuses. Refused here, nothing is decided and the question stays open.
   */
  fits?: (to: Record<string, unknown>) => Refusal | null;
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

/**
 * WHICH QUESTION A DECISION SETTLED, AND WHICH DECISION SETTLED A QUESTION.
 *
 * Neither table says, so a screen paired them by the option offered and the order they were opened,
 * which two questions worded alike and answered in the same instant defeat. `decide` writes its
 * `decide` event and the question's `resolve` event one after the other in one transaction, so the
 * pair is two adjacent rows of the log, for every decision ever made and with no migration. A
 * decision that superseded another, or a question closed without one, reads `null`.
 */
const SETTLED =
  "(SELECT substr(r.target, 12) FROM event d JOIN event r ON r.rowid = d.rowid + 1 WHERE d.kind = 'decide' AND d.target = 'decision:' || decision.id AND r.kind = 'resolve' AND r.target LIKE 'suggestion:%') AS suggestion";
const SETTLED_BY =
  "(SELECT substr(d.target, 10) FROM event r JOIN event d ON d.rowid = r.rowid - 1 WHERE r.kind = 'resolve' AND r.target = 'suggestion:' || suggestion.id AND d.kind = 'decide' AND d.target LIKE 'decision:%' ORDER BY r.rowid DESC LIMIT 1) AS decision";

/**
 * WHAT AN ACCEPTED ARRANGEMENT DID, kept on its decision (`keepApplied`). It was only ever in the answer to the press, so
 * the tab that accepted said "Installed Personal" and a reload, or anybody else, read the decision without it. The newest
 * such line wins; a decision with none reads `null`.
 */
const APPLIED =
  "(SELECT a.to_v FROM event a WHERE a.kind = 'note' AND a.target = 'decision:' || decision.id AND a.target_kind = 'decision' AND a.to_v IS NOT NULL ORDER BY a.rowid DESC LIMIT 1) AS applied";

const COLUMNS: Record<GovernRegister, string> = {
  suggestion: `id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why, ${SETTLED_BY}`,
  decision: `id, question, answer, reason, decided_by, ts, supersedes, ${SETTLED}, ${APPLIED}`,
  prediction:
    'id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, observed, met, on_miss',
};

/** Newest first, because a queue nobody has answered is read from the top. */
const ORDER: Record<GovernRegister, string> = {
  suggestion: 'opened_at DESC, rowid DESC',
  decision: 'ts DESC, rowid DESC',
  prediction: 'score_at DESC, rowid DESC',
};

/** The column each register is ordered by before its rowid, for the cursor. */
const WHEN: Record<GovernRegister, string> = { suggestion: 'opened_at', decision: 'ts', prediction: 'score_at' };

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
  opts: { status?: string | undefined; limit?: number | undefined; every?: boolean | undefined; cursor?: string | undefined } = {},
): Result<Record<string, unknown>[]> {
  if (!(GOVERNANCE as readonly string[]).includes(register))
    return no('REGISTER_UNKNOWN', `${register} is not a governance register.`, { at: 'register', allowed: GOVERNANCE });

  /* `every` IS THE RECORD'S OWN, for a count held to the caller: a count read off one page stops at the page. */
  const limit = opts.every ? -1 : Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
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

  /* THE CURSOR IS THE ID OF THE LAST ROW THE PAGE ABOVE HELD, and the next page is every row after it in the one order
     this list has: its time, then the order it was written in. Keyset rather than an offset, so a question opened
     while somebody reads page two does not push a row they already saw onto page three. An id this register does not
     hold is refused, never read as the first page. */
  if (opts.cursor !== undefined) {
    const at = deps.sql.one<{ w: string; r: number }>(`SELECT COALESCE(${WHEN[register]}, '') AS w, rowid AS r FROM ${register} WHERE id = ?`, opts.cursor);
    if (!at) return no('VALUE_MALFORMED', 'A cursor is the id of the last row the page above answered with. Start from the first page.', { at: 'cursor' });
    where.push(`(COALESCE(${WHEN[register]}, '') < ? OR (COALESCE(${WHEN[register]}, '') = ? AND rowid < ?))`);
    params.push(at.w, at.w, at.r);
  }

  const rows = deps.sql.all<Record<string, unknown>>(
    `SELECT ${COLUMNS[register]} FROM ${register}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ORDER[register]} LIMIT ?`,
    ...params,
    limit,
  );
  return ok(rows.map((r) => hydrate(register, r)));
}

/**
 * How many questions are open right now, deferrals that have not come round left out.
 *
 * THE SAME TWO CONDITIONS `listGovernance` READS, in one place rather than two: a queue that draws three
 * and says "six more" is counting the same thing it listed, and a second copy of the predicate is how
 * those two numbers come to disagree.
 */
export function countOpenQuestions(deps: Pick<GovernDeps, 'sql' | 'nowMs'>): number {
  return (
    deps.sql.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?)",
      instant(deps.nowMs),
    )?.n ?? 0
  );
}

/** How many rows one governance register holds, every one of them: a count for a screen that pages. */
export function countGovernance(sql: Sql, register: GovernRegister): number {
  if (!(GOVERNANCE as readonly string[]).includes(register)) return 0;
  return sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${register}`)?.n ?? 0;
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
  for (const key of register === 'suggestion' ? ['body'] : register === 'prediction' ? ['measure'] : ['applied'])
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
 *
 * `actor` MAY BE ASKED FOR, and then it is asked only once the body has passed. A token's proposal is
 * signed by its run, and working out the run can open one: a proposal refused here must open nothing.
 */
export function propose(deps: GovernDeps, actor: string | (() => string), p: Proposal): Result<{ id: string }> {
  if (!p?.question?.trim())
    return no<{ id: string }>('REQUIRED_MISSING', 'A proposal is a question somebody can answer.', { at: 'question' });
  if (!(BODY_KINDS as readonly string[]).includes(p.body_kind))
    return no<{ id: string }>('ENUM_VALUE_UNKNOWN', `${String(p.body_kind)} is not a kind of proposal.`, {
      at: 'body_kind',
      allowed: BODY_KINDS,
    });

  const wrong = checkBody(deps, p.body_kind, p.body ?? {});
  if (wrong) return { ok: false, refusal: wrong };

  /* WHAT IT SENDS OUT IS WORKED OUT HERE, NEVER TAKEN FROM THE PROPOSER. An agent that wrote its own `egress` could
     print a friendlier host than the one it declares, so whatever it wrote is dropped and the record's own reading
     of the declarations is stored in its place. */
  let body: Record<string, unknown> = p.body ?? {};
  if (p.body_kind === 'change') {
    const { egress: _theirs, approve: _theirLines, from_version: _theirVersion, ...rest } = body;
    body = rest;
    /* AND THE VERSION IT WAS DRAWN FROM, FOR THE SAME REASON. Accepted with no version to land against, the second of two
       changes drawn from one reading replaced the first whole: `domain` went with a value still under it, and both
       decisions read "accept" (`loop/research-shell-schema.md` blocker 1, `record/test/schema-add.test.ts`). Taken from
       the proposer, the stamp is whatever it says, and one that names the version it guesses will be live at acceptance
       lands over whatever came in between. An `add` needs none: it is merged onto
       whatever is live when the owner presses. */
    if (!isAdd(body.to)) body = { ...body, from_version: liveVersion(deps.sql, String(body.declaration_id)) };
    const to = resolveTo(deps.sql, body);
    if (deps.review && to.ok) {
      const read = deps.review(to.value.to);
      if (!read.ok) return read as Result<{ id: string }>;
      if (read.value !== null) body = { ...body, egress: read.value.egress, approve: read.value.approve };
    }
  }

  const by = typeof actor === 'function' ? actor() : actor;
  const id = `SG${deps.allocate('suggestion')}`;
  const at = instant(deps.nowMs);
  deps.sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, ?, ?, 'open', ?, ?)",
    id,
    p.body_kind,
    JSON.stringify(body),
    by,
    at,
  );
  /* THE QUESTION GOES IN `to_v`, WHICH IS WHERE 45 §5.4 PUTS IT — and `note` is capped at 280 by
     the rule that a note is one sentence a human reads in six weeks. A question is not a note: it is
     the thing being asked, the `suggestion` table has no column for it, and this event is the only
     copy. So a question over 280 characters was silently cut here and the cut version became the
     immutable `decision.question` — the record's permanent answer to "what was asked", wrong, with
     the original nowhere. */
  event(deps, at, by, 'suggest', `suggestion:${id}`, 'suggestion', p.question);
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
    return checkUpdates(deps, register, rows as Record<string, unknown>[]);
  }

  if (arranging(kind)) return checkArranging(deps, kind, body);

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
  /* AND `to` IS WHAT `install` TAKES: a declaration, or `{ declarations: [...] }` of them. Asked only to be an
     object, `{ values: [...] }` was filed; accepting it committed the decision and resolved SG1 in the gate's
     transaction, and then `install([to])` threw `Cannot read properties of undefined (reading 'writes')` out of the
     record's `decide` before `reopen` could run. A decision that resolved with nothing installed behind it, from one
     malformed body any `propose` token can send. `review` below cannot catch it: it answers `null` for a batch it
     cannot read, which is right for egress and says nothing about whether the batch installs. */
  const to = resolveTo(deps.sql, body);
  if (!to.ok) return 'refusal' in to ? to.refusal : missing('to');
  const wrong = shapeFault(to.value.to) ?? namesFault(deps.sql, { ...body, to: to.value.to });
  if (wrong) return wrong;

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

const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Whether a change's `to` is what `install` takes, for the reason given where `checkBody` asks it. */
function shapeFault(to: unknown): Refusal | null {
  const bundle = (to as { declarations?: unknown }).declarations;
  const listed = Array.isArray(bundle) ? bundle : [to];
  if (Array.isArray(to) || listed.length === 0 || !listed.every((d) => isMap(d) && typeof d.id === 'string' && typeof d.kind === 'string' && isMap(d.body)))
    return {
      code: 'VALUE_MALFORMED',
      fix: 'A change is to a whole declaration, {"id":"register.<id>","kind":"register","body":{...}}, or to {"declarations":[...]} of them.',
      at: 'body.to',
    };
  return null;
}

/** Whether a change's `to` is a field-level addition, `{ add: {...} }`, rather than a whole declaration. */
const isAdd = (to: unknown): to is { add: unknown } => isMap(to) && 'add' in to;

/** The version of `id` live now, and 0 when none is, which is how `install`'s `expect` spells "drawn from nothing". */
function liveVersion(sql: Sql, id: string): number {
  return sql.one<{ version: number }>(
    'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
    id,
  )?.version ?? 0;
}

/**
 * What a change installs if it is accepted now: its `to` as filed, or an `add` merged onto the list as it is live.
 *
 * AT ACCEPTANCE AND NOT AT FILING, because resolving an `add` when it is filed turns it back into a whole body drawn
 * from one reading, which is the race it exists to end. So the stored body keeps what was asked, and this is run when it
 * is filed (to check it) and again when it is accepted (to install it). `version` is the live version it was merged onto.
 */
function resolveTo(sql: Sql, body: Record<string, unknown>): Result<{ to: Record<string, unknown>; version?: number }> {
  /* ANYTHING ELSE IS PASSED ON AS IT IS, for `shapeFault` to refuse in its own words: an array is not a declaration, and
     "needs to" would be a wrong answer to a proposer who sent one. */
  return isAdd(body.to) ? addTo(sql, body.to, body.declaration_id) : ok({ to: body.to as Record<string, unknown> });
}

const ADD_KEYS = ['register', 'fields', 'values'];

/**
 * An addition to a live list: new fields, and new values at the end of a closed list, and nothing else.
 *
 * AN AGENT THAT WANTED ONE OPTIONAL FIELD HAD TO SEND THE WHOLE LIST. `to` was a whole declaration or nothing, so adding
 * `hosting: text` to Projects meant reading twenty-odd fields, copying them and sending them back, and `{ field: {...} }`
 * was refused `VALUE_MALFORMED` (`loop/research-shell-schema.md` blocker 7). DIRECTION §22 has metadata added this way as
 * the ordinary case, by people and agents alike.
 *
 * ADDITIVE BY CONSTRUCTION. A field id the list already has, retired ones included, is refused rather than replaced, and
 * there is no key that removes anything: a retype or a removal is a whole-body change and is read as one. The merged
 * body then goes through every check a whole body does (`namesFault`, `review`, `fits`, the install's own lint).
 */
function addTo(sql: Sql, to: { add: unknown }, named: unknown): Result<{ to: Record<string, unknown>; version: number }> {
  const add = to.add;
  if (!isMap(add)) return no('VALUE_MALFORMED', 'add is {"register":"<list>","fields":[...],"values":{"<field>":[...]}}.', { at: 'body.to.add' });
  const extra = Object.keys(to).find((k) => k !== 'add') ?? Object.keys(add).find((k) => !ADD_KEYS.includes(k));
  if (extra !== undefined)
    return no('FIELD_UNKNOWN', `An addition takes register, fields and values, and nothing else, so ${extra} is not one of them. To take something away or change its type, propose the whole list.`, {
      at: `body.to.add.${extra}`,
      allowed: ADD_KEYS,
    });
  /* THE LIST IS THE ONE THE CHANGE IS FILED UNDER unless it says otherwise, so the example agents are taught in every
     turn does not spend tokens saying it twice (`mcp/src/index.ts`, measured against the 2,600 ceiling). A `register`
     that disagrees with `declaration_id` is still refused, by `namesFault`, for the reason it gives. */
  const said = add.register ?? (typeof named === 'string' && named.startsWith('register.') ? named : undefined);
  if (typeof said !== 'string') return no('REQUIRED_MISSING', 'An addition names the list it adds to, as register, or is filed under "declaration_id":"register.<list>".', { at: 'body.to.add.register' });
  const list = said.startsWith('register.') ? said.slice('register.'.length) : said;
  const id = `register.${list}`;
  const live = sql.one<{ version: number; body: string }>(
    "SELECT version, body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1",
    id,
  );
  const was = live ? parse(live.body) : null;
  if (!live || !was) return no('REGISTER_UNKNOWN', `There is no list called ${list} to add to. To make one, propose it whole.`, { at: 'body.to.add.register' });

  const fields = (Array.isArray(was.fields) ? was.fields : []).map((f) => (isMap(f) ? { ...f } : f)) as Record<string, unknown>[];
  const adding = add.fields ?? [];
  const values = add.values ?? {};
  if (!Array.isArray(adding) || !adding.every((f) => isMap(f) && typeof f.id === 'string'))
    return no('VALUE_MALFORMED', 'fields is a list of fields, each {"id":"<id>","type":"<type>"}.', { at: 'body.to.add.fields' });
  if (!isMap(values) || !Object.values(values).every((v) => Array.isArray(v) && v.every((x) => typeof x === 'string')))
    return no('VALUE_MALFORMED', 'values is {"<field>":["<value>",...]}, the values to add to each closed list.', { at: 'body.to.add.values' });
  if (adding.length === 0 && Object.keys(values).length === 0)
    return no('REQUIRED_MISSING', 'An addition names fields to add, values to add to a closed list, or both.', { at: 'body.to.add' });

  for (const f of adding as Record<string, unknown>[]) {
    if (fields.some((held) => held.id === f.id))
      return no('VALUE_MALFORMED', `${list} already has a field called ${String(f.id)}. An addition only adds; to change that field, propose the whole list.`, {
        at: 'body.to.add.fields',
      });
    fields.push(f);
  }
  for (const [field, more] of Object.entries(values) as [string, string[]][]) {
    const held = fields.find((f) => f.id === field);
    if (!held) return no('FIELD_UNKNOWN', `${list} has no field called ${field}.`, { at: `body.to.add.values.${field}` });
    if (!Array.isArray(held.values))
      return no('VALUE_MALFORMED', `${field} is not a closed list, so there are no values to add to it.`, { at: `body.to.add.values.${field}` });
    held.values = [...held.values, ...more.filter((v) => !(held.values as unknown[]).includes(v))];
  }
  return ok({ to: { id, kind: 'register', body: { ...was, fields } }, version: live.version });
}

/** Who answers a question the additive rule settles: `decision.decided_by`, and the actor on its `decide` and `resolve`. */
export const ADDITIVE_RULE = 'rule:additive';

/**
 * The keys that make an added field something other than loose metadata: it asks every writer for a value, it refuses
 * a value another row holds, or it builds an index. `search` is the full-text index, so it counts as one.
 */
const HELD_KEYS = ['required', 'required_when', 'unique', 'index', 'search'] as const;

/**
 * Why a change cannot land by the additive rule, or `null` when it can.
 *
 * THE OWNER'S ANSWER OF SEPTEMBER 22ND (DIRECTION §22): an agent's purely additive, optional field lands at once and is
 * logged, and removing, retyping, requiring or narrowing still waits for his press. `addTo` already makes an `add`
 * additive by construction (no field it names may exist, and values are only appended), so what is left to hold back is
 * a field that constrains the rows: `required` refuses every writer who does not know the new field, `unique` and
 * `index` build on the table, and all three are what "loop/research-shell-schema.md" put outside the narrow rule.
 *
 * A KEY SET TO `false` IS NOT A CONSTRAINT, so `required: false` still lands; any other value holds it back, because
 * the install's lint is the one that decides what `required: "yes"` means, and it should do so with the owner watching.
 */
export function additiveFault(body: Record<string, unknown> | null): string | null {
  if (!body || !isAdd(body.to)) return 'Only an addition lands by rule. A whole list is proposed, and waits for the owner.';
  const add = body.to.add;
  if (!isMap(add)) return 'The addition cannot be read.';
  /* AN EGRESS LINE IS SOMETHING SENT OUT, and what leaves the record is the owner's to approve whatever the shape. */
  if (Array.isArray(body.egress) && body.egress.length > 0) return 'It sends something out, and that waits for the owner.';
  for (const f of (Array.isArray(add.fields) ? add.fields : []) as Record<string, unknown>[]) {
    const held = HELD_KEYS.find((k) => isMap(f) && f[k] !== undefined && f[k] !== false);
    if (held !== undefined) return `${String(f?.id)} is ${held === 'required_when' ? 'required sometimes' : held === 'search' ? 'searched' : held}, and that waits for the owner.`;
  }
  return null;
}

/** What the decision says when the rule answered, in the words the owner reads it by in Decide. */
const ADDITIVE_REASON = 'It only adds optional fields or values, and those land without a press. Taking away, retyping or requiring anything still asks.';

/**
 * A `change` is about the declaration it names: `to` is that declaration, or a bundle that holds it.
 *
 * THE PROPOSER CHOSE WHO WAS ASKED. The record reads the list a change is about from `declaration_id` and nothing else,
 * and nothing held `to` to it, so `loop/research-batch-seventeen-audit.md` §1 filed `declaration_id: register.obligations`
 * over a new Diary from the owner's `propose` token: it was shown whole to a member invited to Obligations alone, with
 * Diary's schema in it, and accepting it installed Diary at v2. Filed the other way round, a change to Obligations was
 * held back from the member whose list it changed. The prediction a change carries is written under the same id, so a
 * grade about one list was read by whoever reads the other.
 *
 * A BUNDLE HOLDS WHAT IT IS NAMED FOR, AND UNDER A LIST'S NAME NO OTHER LIST. A bundle is several declarations under one
 * name (a pack update's two actions), so it cannot be held to one id; but a bundle named for `register.obligations`
 * that also carries `register.diary` is the same leak with one more declaration in front of it. Under a name that is
 * not a list's, the record asks only whoever reads the whole record, and nothing is shown to anybody it is not about.
 *
 * Checked when a change is filed, and again when it is accepted, for a change filed before this was.
 */
function namesFault(sql: Sql, body: Record<string, unknown>): Refusal | null {
  const named = String(body.declaration_id);
  const to = body.to as { id?: unknown; declarations?: unknown };
  const bundle = Array.isArray(to?.declarations) ? (to.declarations as { id?: unknown; kind?: unknown }[]) : null;
  if (bundle === null)
    return to?.id === named
      ? null
      : {
          code: 'VALUE_MALFORMED',
          fix: `This change installs ${String(to?.id)} and is filed as a change to ${named}, so it would be shown to whoever reads ${named}. File it with "declaration_id":"${String(to?.id)}".`,
          at: 'body.to',
        };
  const ids = bundle.map((d) => String(d?.id));
  if (!ids.includes(named))
    return {
      code: 'VALUE_MALFORMED',
      fix: `This change is filed as a change to ${named}, and ${named} is not among what it installs (${ids.join(', ')}). Name one of them in "declaration_id".`,
      at: 'body.to',
    };
  if (named.startsWith('register.')) {
    const other = ids.find((id) => id.startsWith('register.') && id !== named);
    if (other !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix: `This change is filed as a change to ${named} and also installs ${other}, so whoever reads ${named} would read ${other} in it. Propose ${other} as a change of its own.`,
        at: 'body.to',
      };
    return aboutOthers(sql, named, bundle);
  }
  return null;
}

/**
 * A declaration in a bundle filed under a list's name that reads, writes or mails another list.
 *
 * A SECOND REGISTER WAS THE ONLY THING KEPT OUT, and `loop/research-batch-nineteen-audit.md` §4 filed a rule over Diary
 * under `register.obligations` from the owner's `propose` token: the member invited to Obligations alone read the rule
 * whole in the queue, and accepting it installed it. A metric over Diary, a page with a table of it, an ingest that
 * writes it and a digest that mails its rows rode in the same way, one declaration each (`govern-bundle-scope.test.ts`
 * filed all eight before this). So each declaration is asked which lists it NAMES, not only which it declares.
 *
 * A FIGURE IS READ THROUGH ITS METRIC, and only a metric the bundle carries can be read here: this runs on the body
 * alone, when it is filed and again when it is accepted. A page of figures names no list itself, which is how the Money
 * page leaked to a one-list reader once (`pages.ts` `registersOf`), so a figure this cannot resolve is refused rather
 * than taken as harmless. Propose that page under its own name.
 */
function aboutOthers(sql: Sql, named: string, bundle: { id?: unknown; kind?: unknown; body?: unknown }[]): Refusal | null {
  const list = named.slice('register.'.length);
  const metrics = new Map<string, unknown>();
  for (const d of bundle) if (d?.kind === 'metric' && isMap(d.body) && typeof d.body.metric === 'string') metrics.set(d.body.metric, d.body);
  /* A TEMPLATE PAGE'S `{{what}}` IS ITS ROW'S FIELD, not a figure, and the bundle always carries the list it is named for. */
  const own = bundle.find((d) => d?.id === named)?.body;
  const fields = new Set(isMap(own) && Array.isArray(own.fields) ? own.fields.map((f) => (isMap(f) ? f.id : undefined)).filter((f) => typeof f === 'string') : []);
  for (const d of bundle) {
    if (d?.id === named || d?.kind === 'register') continue;
    const page = d.kind === 'page' ? { template: isMap(d.body) && d.body.for !== undefined, fields } : null;
    const { lists, unknown } = listsNamed(d.body, page, (id) => metrics.get(id));
    const other = [...lists].find((l) => l !== list);
    if (other !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix:
          other === '*'
            ? `This change is filed as a change to ${named}, and ${String(d.id)} in it reads across the whole record, so whoever reads ${named} would read all of it. Propose ${String(d.id)} as a change of its own.`
            : `This change is filed as a change to ${named}, and ${String(d.id)} in it reads register.${other}, so whoever reads ${named} would read about ${other}. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const figure = [...unknown][0];
    if (figure !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix: `This change is filed as a change to ${named}, and ${String(d.id)} in it reads the figure ${figure}, which it does not carry, so nothing here can say whose list that figure counts. Add metric.${figure} to the bundle, or propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const was = replacedAbout(sql, String(d.id), list, fields);
    if (was !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix:
          was === null
            ? `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads a figure no live metric declares, which names no list, so nothing here can say whose that is. Propose ${String(d.id)} as a change of its own.`
            : was === '*'
              ? `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads across the whole record, so whoever reads ${named} would be asked to change what everybody reads. Propose ${String(d.id)} as a change of its own.`
              : `This change is filed as a change to ${named}, and ${String(d.id)} in it replaces one that reads register.${was}, so whoever reads ${named} would be asked to change what ${was} shows. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
    const reader = d.kind === 'metric' && isMap(d.body) && typeof d.body.metric === 'string' ? pageOfOthers(sql, d.body.metric, list, bundle) : undefined;
    if (reader !== undefined)
      return {
        code: 'VALUE_MALFORMED',
        fix:
          reader.other === undefined
            ? `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which names no list, so nothing here can say whose page that is. Propose ${String(d.id)} as a change of its own.`
            : reader.other === '*'
              ? `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which reads across the whole record, so whoever reads ${named} would be asked to change what everybody reads. Propose ${String(d.id)} as a change of its own.`
              : `This change is filed as a change to ${named}, and ${String(d.id)} in it defines a figure ${reader.page} reads, which reads register.${reader.other}, so whoever reads ${named} would be asked to change what ${reader.other} shows. Propose ${String(d.id)} as a change of its own.`,
        at: 'body.to',
      };
  }
  return null;
}

/**
 * An installed page or digest not about `list` that reads `figure` while no live metric declares it, if there is one.
 *
 * A PAGE READS A FIGURE BY NAME, WHATEVER STATE ITS METRIC IS IN, and `replacedAbout` reads only a live one: with
 * `metric.diary-count` retired, or never declared, a bundle under `register.obligations` defining it over Obligations
 * replaced nothing the guard could read, was filed, and a page of Diary then showed Obligations' count
 * (`govern-bundle-scope.test.ts`, all three cases measured filed before this). So the pages are asked instead. A figure
 * with a live metric is left to `replacedAbout`: its `source` already says whose it is, and a page reading it already
 * shows that list to whoever reads the page, so a page that reads Obligations among other lists is no bar to changing
 * Obligations' own figure. A page the bundle replaces is skipped, since its new body is what gets checked. A page that
 * names no list is refused too: nothing says whose it is, and an unknown is not a licence.
 */
function pageOfOthers(
  sql: Sql,
  figure: string,
  list: string,
  bundle: { id?: unknown }[],
): { page: string; other: string | undefined } | undefined {
  const live = (at: string) =>
    sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', at)?.body;
  if (live(`metric.${figure}`) !== undefined) return undefined;
  const replaced = new Set(bundle.map((d) => d?.id));
  /* A DIGEST READS A FIGURE BY NAME TOO, as a `metric.<id>` section (`digest.ts`), and asking only the pages filed a
     Diary digest's retired figure redefined over Obligations. It is walked as the replaced digest is, with no page. */
  const readers = sql.all<{ id: string; kind: string; body: string }>(
    "SELECT id, kind, body FROM declaration WHERE kind IN ('page', 'digest') AND superseded_at IS NULL AND retired = 0 ORDER BY id",
  );
  for (const row of readers) {
    if (replaced.has(row.id)) continue;
    const body: unknown = JSON.parse(row.body);
    /* A TEMPLATE'S `{{field}}` IS ITS ROW'S, read from the list it is for as installed. */
    const forList = isMap(body) && isMap(body.for) && typeof body.for.register === 'string' ? body.for.register : undefined;
    const shape = forList === undefined ? undefined : live(`register.${forList}`);
    const own: unknown = shape === undefined ? undefined : JSON.parse(shape);
    const fields = new Set(isMap(own) && Array.isArray(own.fields) ? own.fields.map((f) => (isMap(f) ? f.id : undefined)).filter((f) => typeof f === 'string') : []);
    const { lists, unknown } = listsNamed(body, row.kind === 'page' ? { template: forList !== undefined, fields } : null, (id) => {
      if (id === figure) return undefined;
      const metric = live(`metric.${id}`);
      return metric === undefined ? undefined : JSON.parse(metric);
    });
    if (!unknown.has(figure)) continue;
    const other = [...lists].find((l) => l !== list);
    if (other !== undefined || lists.size === 0) return { page: row.id, other };
  }
  return undefined;
}

/**
 * The list other than `list` that the installed declaration under `id` is about, if there is one.
 *
 * WHAT A DECLARATION REPLACES IS ABOUT A LIST TOO, and reading only the new body let it through:
 * `loop/research-batch-twenty-two-audit.md` §7 filed `metric.diary-count` redefined over Obligations under
 * `register.obligations`, it was accepted and installed, and every page reading the Diary figure then read Obligations
 * behind a question the queue showed as a change to Obligations. A rule, a page and a digest under a Diary id with an
 * Obligations body were filed the same way (`govern-bundle-scope.test.ts`). The installed body's figures are read
 * through the installed metrics, since those are what it reads now.
 *
 * AN INSTALLED BODY WHOSE EVERY FIGURE HAS NO LIVE METRIC IS NOBODY'S TO REPLACE, and it answers `null`. This once
 * dropped the figures it could not resolve, so a stat of a retired Diary figure, a stat of one never declared, a note
 * whose prose read a retired one and a digest whose only section was one each read as about no list, and all four were
 * filed under `register.obligations`, accepted and installed with Obligations bodies (`loop/research-bundle-reads.md`
 * §2), while `pageOfOthers` refused the same figure redefined from the same question. The rule is now the one
 * `pageOfOthers` keeps: an unknown is not a licence. A body that names a list besides its dead figure is judged by that
 * list, since the page is already shown to whoever reads it and the dead figure draws nothing.
 */
function replacedAbout(sql: Sql, id: string, list: string, fields: ReadonlySet<string>): string | null | undefined {
  const installed = (at: string) =>
    sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', at)?.body;
  const was = installed(id);
  if (was === undefined) return undefined;
  const body: unknown = JSON.parse(was);
  const page = id.startsWith('page.') ? { template: isMap(body) && body.for !== undefined, fields } : null;
  const { lists, unknown } = listsNamed(body, page, (figure) => {
    const metric = installed(`metric.${figure}`);
    return metric === undefined ? undefined : JSON.parse(metric);
  });
  if (lists.size === 0 && unknown.size > 0) return null;
  return [...lists].find((l) => l !== list);
}

/** A register named in full, as a metric's `source`, a table's and a digest section's are. */
const LIST_REF = /^register\.([a-z][a-z0-9_]*)$/;
/** A page block's sources that are not a list and not a figure, and read no list outside what its legs name. */
const PAGE_SOURCES = new Set(['forecast.runway']);

/**
 * Every list a declaration body names, and every figure it reads that `metricOf` cannot resolve.
 *
 * WALKED RATHER THAN READ KIND BY KIND, because a list is named in a dozen places: a rule's `register`, a `create` or a
 * `link` inside its `then`, an ingest's `writes.register` or each leg of its route, a `lookup`, a cash walk's legs, a
 * page's `for`. A `register` key or a `register.<id>` string anywhere is a list. On a page, a source that is neither
 * (`activity`, `actions`, `governance.open`, `sessions.live`) reads across the record or the runs, and is named `*` or
 * `session` as `pages.ts` names it. That walk is not imported: `pages.ts` reads `BODY_KINDS` from here as it loads.
 */
function listsNamed(
  body: unknown,
  page: { template: boolean; fields: ReadonlySet<string> } | null,
  metricOf: (id: string) => unknown,
): { lists: Set<string>; unknown: Set<string> } {
  const lists = new Set<string>();
  const unknown = new Set<string>();
  const seen = new Set<string>();
  const figure = (said: string) => {
    /* THE FIRST COLON SEPARATES, as `pages.ts` reads a cell: `project-owed:C:\Repos` is one project's figure. */
    const at = said.indexOf(':');
    const id = at < 0 ? said : said.slice(0, at);
    if (seen.has(id)) return;
    seen.add(id);
    const metric = metricOf(id);
    if (metric !== undefined) visit(metric, undefined);
    else unknown.add(id);
  };
  const visit = (node: unknown, key: string | undefined): void => {
    if (typeof node === 'string') {
      const ref = LIST_REF.exec(node);
      if (ref) lists.add(ref[1]!);
      else if (node.startsWith('metric.')) figure(node.slice('metric.'.length));
      else if (key === 'register') lists.add(node);
      else if (key === 'metric') figure(node);
      /* A FORECAST'S `late:` AND A SERIES LINE'S `then:` AND `each:` ARE FIGURES TOO, which a check reading only `metric`
         keys let through: a forecast whose late mark counted Diary was filed under `register.obligations`. */
      else if (page && (key === 'late' || key === 'then' || key === 'each')) figure(node);
      else if (page && key === 'source' && !PAGE_SOURCES.has(node)) lists.add(node === 'sessions.live' ? 'session' : '*');
      /* AND A `{{list.count}}` OR `{{list#3.field}}` IN PROSE READS THAT LIST, as the page answer fills it. */
      for (const m of node.matchAll(/\{\{\s*(?:[a-z]+:)?\s*([a-z][a-z0-9_]*)(?:#\d+)?\.[A-Za-z]/g)) lists.add(m[1]!);
      /* A BARE `{{diary-count}}` IN A PAGE'S PROSE IS A FIGURE, as `pathOf` reads one, and it named no list here: a note
         reading an installed Diary figure was filed under `register.obligations`. A code span is text and is skipped, as
         `pathsOf` skips it, and in a template a field of the row is the row's. So is `{{spoken}}` on a template: `fill`
         answers it with the row's spoken id before it reads a field or a metric, and `declare.ts` reserves the word as a
         field id, so there it is never a figure. Read as one, it refused the seed's own `page.skill` (a diff's
         `row: '{{spoken}}'`) under `register.skills`. Outside a template nothing fills it, and it stays a figure. */
      if (page)
        for (const m of node.replace(/`[^`]*`/g, ' ').matchAll(/\{\{\s*(?:[a-z]+:\s*)?([a-z][a-z0-9_-]*)\s*\}\}/g))
          if (!(page.template && (page.fields.has(m[1]!) || m[1] === 'spoken'))) figure(m[1]!);
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) visit(n, undefined);
      return;
    }
    if (!isMap(node)) return;
    /* A BLOCK THAT MARKS WHICH ROW HAS AN AGENT ON IT READS THE RUNS, as `registersOf` says. */
    if (page && node.working === true) lists.add('session');
    for (const [k, v] of Object.entries(node)) visit(v, k);
  };
  visit(body, undefined);
  return { lists, unknown };
}

/**
 * The shape of a `pack`, `settings` or `arrange` body.
 *
 * STRUCTURE ONLY, AND THE RECORD DOES THE REST. Whether a pack exists, what installing it would add, and
 * whether a setting takes a value are the record's to work out, from its catalogue and its packs, before the
 * body reaches here. What is held here is what the gate needs to apply it: one pack per verb, settings that
 * are a map of values, and an arrangement that changes something and says why.
 */
function checkArranging(deps: GovernDeps, kind: Arranging, body: Record<string, unknown>): Refusal | null {
  const packId = (v: unknown, at: string): Refusal | null =>
    typeof v === 'string' && PACK_ID.test(v)
      ? null
      : {
          code: 'VALUE_MALFORMED',
          fix: `${JSON.stringify(v ?? null)} is not a pack id. A pack id is lower-case letters, digits and dashes, such as usecase-student.`,
          at,
        };

  const settings = (s: unknown, at: string): Refusal | null => {
    if (!isMap(s)) return { code: 'VALUE_MALFORMED', fix: 'A settings change is {"pack":"<id>","values":{"<setting>":<value>}}.', at };
    const bad = packId(s.pack, `${at}.pack`);
    if (bad) return bad;
    const values = s.values;
    if (!isMap(values) || Object.keys(values).length === 0)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A settings change names at least one setting and its new value; null puts one back to its default.',
        at: `${at}.values`,
      };
    for (const [key, v] of Object.entries(values))
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')
        return { code: 'VALUE_MALFORMED', fix: `The setting ${key} takes text, a number, true or false, or null for its default.`, at: `${at}.values.${key}` };
    return null;
  };

  if (kind === 'pack') {
    const verbs = PACK_VERBS.filter((v) => body[v] !== undefined);
    if (verbs.length !== 1)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'A pack proposal names one pack under one of install, enable or disable, such as {"install":"work"}.',
        at: 'body.install',
        allowed: PACK_VERBS,
      };
    const verb = verbs[0]!;
    const bad = packId(body[verb], `body.${verb}`);
    if (bad) return bad;
    if (body.doc !== undefined && (verb !== 'install' || !isMap(body.doc)))
      return { code: 'VALUE_MALFORMED', fix: 'doc is the pack document to install, and only install carries one.', at: 'body.doc' };
    return null;
  }

  if (kind === 'settings') return settings(body, 'body');

  /* AN ARRANGEMENT SAYS WHY. It is the one proposal that changes the shape of the whole record, and a
     person asked to accept one is owed the reasons in words: the phrases heard, or the rows it read. */
  const why = body.why;
  if (!Array.isArray(why) || why.length === 0 || why.length > ARRANGE_CEILING)
    return {
      code: 'REQUIRED_MISSING',
      fix: `An arrangement says why, as one to ${ARRANGE_CEILING} short reasons: {"why":["They added four assignments this week."]}.`,
      at: 'body.why',
    };
  for (const [i, w] of why.entries()) {
    const text = isMap(w) ? w.text : w;
    if (typeof text !== 'string' || !text.trim())
      return { code: 'VALUE_MALFORMED', fix: 'A reason is a sentence, or {"text":"...","at":"tasks#4"} when it cites a row.', at: `body.why[${i}]` };
  }

  let changes = 0;
  if (body.packs !== undefined) {
    if (!isMap(body.packs))
      return { code: 'VALUE_MALFORMED', fix: 'packs is {"install":[...],"enable":[...],"disable":[...]}, each a list of pack ids.', at: 'body.packs' };
    for (const [verb, ids] of Object.entries(body.packs)) {
      if (!(PACK_VERBS as readonly string[]).includes(verb))
        return { code: 'FIELD_UNKNOWN', fix: `packs takes ${PACK_VERBS.join(', ')}.`, at: `body.packs.${verb}`, allowed: PACK_VERBS };
      if (!Array.isArray(ids) || ids.length > ARRANGE_CEILING)
        return { code: 'VALUE_MALFORMED', fix: `packs.${verb} is a list of at most ${ARRANGE_CEILING} pack ids.`, at: `body.packs.${verb}` };
      for (const [i, id] of ids.entries()) {
        const bad = packId(id, `body.packs.${verb}[${i}]`);
        if (bad) return bad;
      }
      changes += ids.length;
    }
  }
  if (body.pages !== undefined) {
    if (!Array.isArray(body.pages) || body.pages.length > ARRANGE_CEILING)
      return {
        code: 'VALUE_MALFORMED',
        fix: `pages is a list of at most ${ARRANGE_CEILING} page declarations, each {"id":"page.<slug>","kind":"page","body":{...}}.`,
        at: 'body.pages',
      };
    for (const [i, d] of body.pages.entries())
      if (!isMap(d) || typeof d.id !== 'string' || !d.id.startsWith('page.') || d.kind !== 'page' || !isMap(d.body))
        return {
          code: 'VALUE_MALFORMED',
          fix: 'A page is {"id":"page.<slug>","kind":"page","body":{...}}. Read the page grammar for what a body holds.',
          at: `body.pages[${i}]`,
        };
    changes += body.pages.length;
  }
  if (body.settings !== undefined) {
    if (!Array.isArray(body.settings) || body.settings.length > ARRANGE_CEILING)
      return {
        code: 'VALUE_MALFORMED',
        fix: `settings is a list of at most ${ARRANGE_CEILING} changes, each {"pack":"<id>","values":{...}}.`,
        at: 'body.settings',
      };
    for (const [i, s] of body.settings.entries()) {
      const bad = settings(s, `body.settings[${i}]`);
      if (bad) return bad;
    }
    changes += body.settings.length;
  }
  /* ROWS A PLAN IS MADE OF, written in order when the arrangement is accepted. A row may point one ref field at a row
     before it in the same list of rows, by its position, because none of them has a sequence until it is written. */
  if (body.rows !== undefined) {
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > ARRANGE_ROWS)
      return {
        code: 'VALUE_MALFORMED',
        fix: `rows is a list of one to ${ARRANGE_ROWS} rows, each {"register":"<id>","fields":{...},"links":{"<field>":<position of an earlier row>}}.`,
        at: 'body.rows',
      };
    for (const [i, r] of body.rows.entries()) {
      if (!isMap(r) || typeof r.register !== 'string' || !isMap(r.fields))
        return { code: 'VALUE_MALFORMED', fix: 'A row is {"register":"<id>","fields":{...}}.', at: `body.rows[${i}]` };
      if (r.links !== undefined) {
        if (!isMap(r.links)) return { code: 'VALUE_MALFORMED', fix: 'links maps a field to the position of an earlier row.', at: `body.rows[${i}].links` };
        for (const [field, to] of Object.entries(r.links))
          if (typeof to !== 'number' || !Number.isInteger(to) || to < 0 || to >= i)
            return { code: 'VALUE_MALFORMED', fix: `A link points at an earlier row of the same arrangement, by its position from 0, and ${JSON.stringify(to)} is not one.`, at: `body.rows[${i}].links.${field}` };
      }
    }
    changes += body.rows.length;
  }
  if (changes === 0)
    return {
      code: 'REQUIRED_MISSING',
      fix: 'An arrangement changes something: packs to install, enable or disable, pages, or settings such as the voice.',
      at: 'body',
    };

  const open = deps.sql
    .all<{ id: string }>("SELECT id FROM suggestion WHERE body_kind = 'arrange' AND status = 'open' ORDER BY rowid")
    .map((r) => r.id);
  if (open.length >= OPEN_ARRANGEMENTS)
    return {
      code: 'OUT_OF_BOUNDS',
      fix: `${open.join(', ')} already wait on the person, and ${OPEN_ARRANGEMENTS} open arrangements is the most. Wait until one is answered, then propose again.`,
      at: 'body_kind',
    };
  return null;
}

/** The keys a `rowset` row that updates carries, and nothing beside them. */
const UPDATE_KEYS = ['at', 'version', 'patch'];

/**
 * The rows of a `rowset` that update: `{ at, version, patch }`, where a row without `at` creates.
 *
 * CHECKED AT FILING, for the reason every body is: the row it names exists and is live, the version
 * it was read at is there to compare against, and the patch says something. Whether the patch is
 * valid is the write path's, at acceptance, as it is for the rows a rowset creates.
 */
function checkUpdates(deps: GovernDeps, register: string, rows: readonly Record<string, unknown>[]): Refusal | null {
  const named = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (!('at' in r)) continue;
    const where = `body.rows[${i}]`;
    const row = typeof r.at === 'string' ? deps.row(register, r.at) : null;
    if (!row || row.deleted)
      return { code: 'VALUE_MALFORMED', fix: `${String(r.at)} is not a live row of ${register}.`, at: `${where}.at` };
    /* ONE UPDATE PER ROW. A second would be compared against the version the first leaves, so it
       could never apply, and the proposal would be one nobody can accept. */
    if (named.has(row.id))
      return { code: 'VALUE_MALFORMED', fix: `${String(r.at)} is updated twice. Put both changes in one patch.`, at: `${where}.at` };
    named.add(row.id);
    if (r.version === undefined)
      return {
        code: 'REQUIRED_MISSING',
        fix: 'An update carries the version its row was read at, so a row changed since is not overwritten.',
        at: `${where}.version`,
      };
    if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 1)
      return { code: 'VALUE_MALFORMED', fix: 'version is the whole number the row was read at.', at: `${where}.version` };
    const patch = r.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0)
      return { code: 'VALUE_MALFORMED', fix: 'An update carries a patch: the fields it changes, with their new values.', at: `${where}.patch` };
    const extra = Object.keys(r).find((key) => !UPDATE_KEYS.includes(key));
    if (extra !== undefined)
      return { code: 'FIELD_UNKNOWN', fix: 'A row that updates carries at, version and patch, and nothing beside them.', at: `${where}.${extra}` };
  }
  return null;
}

/**
 * One update row of an accepted `rowset`, as the person deciding, compare-and-set.
 *
 * A DELETE IS ITS OWN WRITE, after the fields. The write path logs a delete as a single event, so
 * the fields changed beside it would be missing from the history. The delete is compared against
 * the version the first write left.
 */
function applyUpdate(
  deps: GovernDeps,
  register: string,
  r: Record<string, unknown>,
  actor: string,
  batch: string,
): Result<{ id: string; version: number }> {
  const row = deps.row(register, String(r.at));
  if (!row) return no('VALUE_MALFORMED', `${String(r.at)} is no longer a row of ${register}.`, { at: 'body.rows' });
  const { deleted_at, ...fields } = r.patch as Record<string, unknown>;
  let version = Number(r.version);
  if (Object.keys(fields).length > 0) {
    const made = deps.write(register, fields, actor, batch, { id: row.id, version });
    if (!made.ok || deleted_at === undefined) return made;
    version = made.value.version;
  }
  return deps.write(register, { deleted_at }, actor, batch, { id: row.id, version });
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
  /**
   * The version an accepted `change` must find live when it installs, for the caller to pass as `install`'s `expect`:
   * the version a whole body was filed against, or the one an addition was merged onto.
   */
  expect?: { id: string; version: number };
  /**
   * An accepted `pack`, `settings` or `arrange`, for the caller to apply. Installing a pack is asynchronous,
   * like a `change`, so the gate hands the body back, and the caller reopens the question if it will not land.
   */
  apply?: { kind: Arranging; body: Record<string, unknown> };
};

export type Verdict =
  /**
   * `rows`, on accepting a `rowset` only: the rows to write, by their place in the body from 0. The rest are declined
   * with the same decision, so a proposal of seven servers can take three. Leaving it out accepts every row.
   */
  | { decide: { option: string; reason: string; rows?: number[] } }
  | { defer: { until: string; why: string } }
  | { resolved_as: 'wont-fix' | 'incorrect'; reason?: string }
  /**
   * Accepted by the additive rule and not by a person: only a `change` that `additiveFault` passes, answered as
   * `ADDITIVE_RULE` whatever `actor` says. The record sends it on an agent's own `propose`, and never from `decide`.
   */
  | { rule: 'additive' };

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

  /* THE RULE IS CHECKED HERE, NOT ONLY WHERE IT IS SENT. The gate is the one place every acceptance passes, so a caller
     that sent `rule` for a required field would otherwise have a person's accept without a person. Past this it is an
     ordinary accept, with every check an accept runs (`resolveTo`, `namesFault`, `fits`), signed by the rule. The
     resolution stays `addressed` because that is what `reopen` and the feed read as "accepted", and an install that
     will not land must come back to the queue exactly as a pressed one does. */
  if ('rule' in verdict) {
    if (verdict.rule !== 'additive')
      return no<Decided>('ENUM_VALUE_UNKNOWN', `${String(verdict.rule)} is not a rule that answers questions.`, { at: 'rule', allowed: ['additive'] });
    const why = row.body_kind === 'change' ? additiveFault(parse(row.body)) : `A ${row.body_kind} is never answered by rule.`;
    if (why !== null) return no<Decided>('TRANSITION_ILLEGAL', `${id} waits for the owner. ${why}`, { at: 'rule' });
    verdict = { decide: { option: 'accept', reason: ADDITIVE_REASON } };
    actor = ADDITIVE_RULE;
  }

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

  /* AND EVERY OTHER KIND TAKES ONE OF TWO WORDS. `Accept` with a capital, or `yes`, used to
     fall past the `accept` branch and resolve the question having done nothing — the gate silently
     answering yes and applying none of it. */
  if (row.body_kind !== 'options' && option !== 'accept' && option !== 'reject')
    return no<Decided>('ENUM_VALUE_UNKNOWN', `A ${row.body_kind} is accepted or rejected, and ${option} is neither.`, {
      at: 'option',
      allowed: ['accept', 'reject'],
    });

  /* SOME OF A ROWSET, BY PLACE. Accepted rows are written and the rest are declined by this one decision. */
  const picked = 'decide' in verdict ? verdict.decide.rows : undefined;
  let only: Set<number> | null = null;
  if (picked !== undefined) {
    const count = Array.isArray(body.rows) ? body.rows.length : 0;
    if (row.body_kind !== 'rowset' || option !== 'accept')
      return no<Decided>('VALUE_MALFORMED', 'rows picks which rows of a rowset to accept, so it goes only with accept on a rowset.', { at: 'rows' });
    if (!Array.isArray(picked) || picked.length === 0 || picked.some((n) => !Number.isInteger(n) || n < 0 || n >= count) || new Set(picked).size !== picked.length)
      return no<Decided>('OUT_OF_BOUNDS', `rows names the rows to accept by place, each once, from 0 to ${String(count - 1)}. To accept none, reject it.`, { at: 'rows' });
    only = new Set(picked);
  }

  const wrote: string[] = [];
  let install: Record<string, unknown> | undefined;
  let expect: Decided['expect'];
  let apply: Decided['apply'];

  if (option === 'accept') {
    if (row.body_kind === 'rowset') {
      const batch = deps.mint();
      const register = String(body.register);
      const mechanism = typeof body.ingest === 'string' ? `ingest:${body.ingest}` : actor;
      for (const [n, r] of ((body.rows ?? []) as Record<string, unknown>[]).entries()) {
        if (only !== null && !only.has(n)) continue;
        /* AN UPDATE IS SIGNED BY THE PERSON DECIDING, whoever drew the proposal, because changing a
           row that exists is what their press authorised. A row a rowset creates keeps the ingest's
           name when an ingest produced it. */
        const made = 'at' in r ? applyUpdate(deps, register, r, actor, batch) : deps.write(register, r, mechanism, batch);
        /* ALL THE ROWS OR NONE. Half a rowset accepted is a decision whose answer is not true of the
           record, and the caller's transaction is what undoes the rest. A stale version is the
           house conflict, and it undoes the rest the same way. */
        if (!made.ok) return made as Result<Decided>;
        wrote.push(made.value.id);
      }
    } else if (arranging(row.body_kind)) {
      apply = { kind: row.body_kind, body };
    } else if (row.body_kind === 'pattern' || row.body_kind === 'change') {
      install = (row.body_kind === 'pattern' ? body.ingest : body.to) as Record<string, unknown>;
      if (!install || typeof install !== 'object')
        return no<Decided>('VALUE_MALFORMED', `${id} carries nothing to install.`, { at: 'body' });
      /* AND A CHANGE IS HELD AT ACCEPTANCE TO WHAT IT IS HELD TO WHEN FILED, before anything is decided: a queue carried
         from an earlier build holds changes filed before those checks existed, and `fits` asks the rows as they are now.
         Refused here, the question stays open with nothing resolved, which a refusal from `install` afterwards could only
         get back to by reopening it. */
      if (row.body_kind === 'change') {
        /* AN ADDITION IS MERGED HERE, onto the list as it is at the press, and held to that version: the install is
           asynchronous, and a whole-body change landing in between is the one thing it must not quietly undo. */
        const resolved = resolveTo(deps.sql, body);
        if (!resolved.ok) return resolved as Result<Decided>;
        install = resolved.value.to;
        const wrong = shapeFault(install) ?? namesFault(deps.sql, { ...body, to: install }) ?? deps.fits?.(install) ?? null;
        if (wrong) return { ok: false, refusal: wrong };
        /* A WHOLE BODY IS HELD TO THE VERSION IT WAS FILED AGAINST. A change filed before the stamp existed carries none,
           and is installed as it always was rather than refused for a number nobody wrote. */
        const from = resolved.value.version ?? body.from_version;
        if (typeof from === 'number') expect = { id: String(isAdd(body.to) ? install.id : body.declaration_id), version: from };
      }
      /* EVERY KEY IT SENDS IS IN THE VAULT BEFORE ANYTHING IS ARMED. Accepting a call whose key is missing would arm
         it and pause it on its first run, which reads as approved and does nothing. Nothing is written until all are there. */
      if (row.body_kind === 'change' && Array.isArray(body.egress))
        for (const out of body.egress as { key?: unknown; paged?: unknown }[]) {
          const label = typeof out?.key === 'string' ? out.key : null;
          if (label === null) continue;
          const key = keyNamed(deps.sql, label);
          if (key === null)
            return no<Decided>('REQUIRED_MISSING', `Add the key called "${label}" to the vault, then accept.`, { at: 'body.egress' });
          /* AND A CONNECTOR'S KEY MUST BE ONE A RUN CAN OPEN, checked here for the same reason the
             line above checks it exists at all. `12 §6` keeps two data keys apart, and a credential
             sealed under the record's — the ordinary deposit, opened on a screen with the person
             there — is refused at `sealedGrant` on the first run. Refused then, the approval has
             already happened: armed, approved, and doing nothing. Refused here, nobody has approved
             anything yet.

             ONLY A CONNECTOR, because a `call`, a `poll` and a single-request `pull` open theirs
             through `openGrant` and the RECORD key. Holding those to the connector key would refuse
             every action in the record that does not page. */
          if (out.paged === true) {
            const cannot = runnerCannotOpen(key);
            if (cannot !== null) return no<Decided>('OUT_OF_BOUNDS', cannot, { at: 'body.egress' });
          }
        }
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

  const question = questionOf(deps.sql, id) ?? id;
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
  /* AND THE LINES THAT PRESS APPROVED, word for word, so "what did I agree to send" has an answer that does not depend
     on the declaration staying as it was. */
  const approved = option === 'accept' && row.body_kind === 'change' && Array.isArray(body.approve) ? { approved: body.approve } : {};
  event(deps, at, actor, 'decide', `decision:${decision}`, 'decision', JSON.stringify({ question, answer: option, ...approved, ...(only === null ? {} : { rows: [...only].sort((a, b) => a - b) }) }));
  event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', 'addressed', reason);

  return ok({
    decision,
    suggestion: id,
    status: 'resolved',
    wrote,
    ...(install === undefined ? {} : { install }),
    ...(expect === undefined ? {} : { expect }),
    ...(apply === undefined ? {} : { apply }),
  });
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

  const kept = point(baseline, p.unit);

  const id = `pr_${deps.mint()}`;
  const scoreAt = deps.nowMs + windowMs(p.window);
  deps.sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    forDecl,
    p.claim,
    JSON.stringify(p.measure),
    /* THE SAME INTEGER RULE THE OBSERVATION IS STORED UNDER, AND THE SAME UNIT. `Math.round` here
       and `stored()` at scoring time put a ratio of 0.375 in as `baseline: 0` and back out as
       `observed: 3750` — a ten-thousand-fold disagreement in the one row whose entire purpose is a
       before-and-after. The scale that fixed that was then applied to money as well, so a prediction
       about a figure in pounds went in ten thousand times too large with a currency on it, and
       `listGovernance` hands these rows back as they are. `point()` decides the value and the unit
       together, which is the only way the two cannot disagree. */
    kept.value,
    p.unit ?? kept.unit ?? 'count',
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
  if (row.body_kind !== 'pattern' && row.body_kind !== 'change' && !arranging(row.body_kind))
    return no<null>('TRANSITION_ILLEGAL', `A ${row.body_kind} was applied when it was accepted, and does not come back.`, {
      at: 'body_kind',
      allowed: ['pattern', 'change', ...ARRANGING],
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
 * Keep what an accepted arrangement did on the decision that accepted it: what was installed, turned on and off, and which
 * pages and settings were set, as `apply` answered it. One `note` line on the decision, which `APPLIED` reads back.
 */
export function keepApplied(deps: GovernDeps, decision: string, applied: Record<string, unknown>, actor: string): Result<null> {
  if (!deps.sql.one('SELECT id FROM decision WHERE id = ?', decision)) return no<null>('OUT_OF_BOUNDS', `There is no decision called ${decision}.`, { at: 'id' });
  event(deps, instant(deps.nowMs), actor, 'note', `decision:${decision}`, 'decision', JSON.stringify(applied), 'Applied what was accepted.');
  return ok(null);
}

/**
 * The question, from the `suggest` event that carried it — the only copy there is.
 *
 * `to_v` FIRST AND `note` AFTER IT. `to_v` is where it belongs and where it is written now; `note`
 * is where a record written by an earlier build put it, capped at 280. Reading both costs one
 * `coalesce` and means an old record's questions still answer for themselves.
 *
 * EXPORTED, because what waits on a person is read by its question: `boot` and `context` list open
 * suggestions, and an id with no question is a list nobody can answer from.
 */
export function questionOf(sql: Sql, id: string): string | null {
  return (
    sql.one<{ q: string | null }>(
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
  sparkMayWrite(actor, kind);
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
