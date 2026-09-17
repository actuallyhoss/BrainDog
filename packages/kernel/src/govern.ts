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

import { keyNamed, type Egress } from './actions.ts';
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
    const { egress: _theirs, approve: _theirLines, ...rest } = body;
    body = rest;
    if (deps.review && body.to && typeof body.to === 'object') {
      const read = deps.review(body.to as Record<string, unknown>);
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
   * An accepted `pack`, `settings` or `arrange`, for the caller to apply. Installing a pack is asynchronous,
   * like a `change`, so the gate hands the body back, and the caller reopens the question if it will not land.
   */
  apply?: { kind: Arranging; body: Record<string, unknown> };
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

  /* AND EVERY OTHER KIND TAKES ONE OF TWO WORDS. `Accept` with a capital, or `yes`, used to
     fall past the `accept` branch and resolve the question having done nothing — the gate silently
     answering yes and applying none of it. */
  if (row.body_kind !== 'options' && option !== 'accept' && option !== 'reject')
    return no<Decided>('ENUM_VALUE_UNKNOWN', `A ${row.body_kind} is accepted or rejected, and ${option} is neither.`, {
      at: 'option',
      allowed: ['accept', 'reject'],
    });

  const wrote: string[] = [];
  let install: Record<string, unknown> | undefined;
  let apply: Decided['apply'];

  if (option === 'accept') {
    if (row.body_kind === 'rowset') {
      const batch = deps.mint();
      const register = String(body.register);
      const mechanism = typeof body.ingest === 'string' ? `ingest:${body.ingest}` : actor;
      for (const r of (body.rows ?? []) as Record<string, unknown>[]) {
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
      /* EVERY KEY IT SENDS IS IN THE VAULT BEFORE ANYTHING IS ARMED. Accepting a call whose key is missing would arm
         it and pause it on its first run, which reads as approved and does nothing. Nothing is written until all are there. */
      if (row.body_kind === 'change' && Array.isArray(body.egress))
        for (const out of body.egress as { key?: unknown }[]) {
          const label = typeof out?.key === 'string' ? out.key : null;
          if (label !== null && keyNamed(deps.sql, label) === null)
            return no<Decided>('REQUIRED_MISSING', `Add the key called "${label}" to the vault, then accept.`, { at: 'body.egress' });
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
  event(deps, at, actor, 'decide', `decision:${decision}`, 'decision', JSON.stringify({ question, answer: option, ...approved }));
  event(deps, at, actor, 'resolve', `suggestion:${id}`, 'suggestion', 'addressed', reason);

  return ok({
    decision,
    suggestion: id,
    status: 'resolved',
    wrote,
    ...(install === undefined ? {} : { install }),
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
