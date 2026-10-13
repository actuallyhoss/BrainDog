/**
 * What it would cost to get one open question wrong, as a band the record computes.
 *
 * WHY THIS EXISTS. `19 §6` names the decision gate becoming a rubber stamp as risk 6 — the
 * differentiator evaporating — and lists four countermeasures against it. Three were built: two
 * deliberate acts, a mandatory reason in an empty field, a recommendation that never pre-selects,
 * and `Defer` with a date. The fourth, *"the queue ranked by cost of being wrong"*, was not, and
 * for a week `queue.ts` said it was while `governance.open` ordered by recency. This is the fourth.
 *
 * IT IS COMPUTED, NEVER DECLARED, and that is the whole design. A field on a suggestion saying how
 * important it is would be a field its proposer fills in, and a queue ranked by self-declared
 * importance is a queue in which everything is urgent by the second week: the proposer is the party
 * with an interest in being read first, which is exactly the party a ranking must not ask. So the
 * band comes off what ACCEPTING the proposal would do, which the body already says, and no writer
 * can assert it about itself. Nothing is stored and there is no migration: the band is a function of
 * a row that is already there, so an old record ranks the moment this ships.
 *
 * WHAT IT IS NOT. It is not urgency, and it is not how much the record thinks the question matters.
 * It is the size of the hole a wrong answer leaves — the axis a person cannot recover by pressing
 * the other button tomorrow. A question that adds twelve rows is cheap to get wrong because the rows
 * can be deleted; one that turns a pack off takes a register off everybody's screen.
 *
 * FOUR BANDS AND NOT SEVEN, one per body kind, because a band a reader cannot hold in their head is
 * a sort order they cannot predict, and a queue whose order cannot be predicted reads as arbitrary.
 * Four is the number `TONES` settled on for the same reason.
 *
 * THE WORDS A PERSON READS ARE NOT HERE. This package owns the FACT, the way `ingest.ts` owns
 * `CONFIDENCES`; `packages/render/src/queue.ts` owns the words a queue draws for it, the way
 * `kinds.ts` owns `TONES`. A kernel that held English would be a kernel with a reader in it.
 */

/**
 * The four, worst first — which is the order they are ranked in, and the order they are compared in.
 *
 * - `undo`  — accepting it is hard to take back, because Put back has nothing to go back to: it
 *             turns a pack off, it moves money, it replaces a declaration that exists, or it changes
 *             a value the history withholds. The other button tomorrow does not return the record
 *             to where it was.
 * - `shape` — accepting it changes what everyone sees: a pack installed or turned on, a pack's
 *             settings, a page, a declaration that is new. Reversible, and not quietly: everyone
 *             who opens the record meets it.
 * - `rows`  — accepting it adds rows, changes or removes rows that exist, or adds a rule that will
 *             add them. Deletable, put back or restored, one at a time.
 * - `call`  — a judgement with nothing attached. Accepting it writes a decision and its reason and
 *             changes no part of the record, which is what makes it the cheapest to get wrong and
 *             the one most worth thinking about last.
 */
export const COSTS = ['undo', 'shape', 'rows', 'call'] as const;

export type Cost = (typeof COSTS)[number];

/** Where a band sits in the order, lowest first. Out of the set sorts last rather than throwing. */
export const costRank = (c: string): number => {
  const at = (COSTS as readonly string[]).indexOf(c);
  return at < 0 ? COSTS.length : at;
};

/** The dearer of two bands, for a body that is several proposals at once. */
export const worseCost = (a: Cost, b: Cost): Cost => (costRank(a) <= costRank(b) ? a : b);

/**
 * ENOUGH ROWS THAT ARRIVING IS ITSELF THE EVENT. A `rowset` may carry up to `MAX_ROWS` (200), and
 * twenty rows landing in a register at once is not "some rows were added" to the person who opens it
 * next — it is the register looking different. Below this the band is what it is; at or above it,
 * `rows` is raised to `shape`. The number is the same order as `QUEUE_CEILING` for the same reason:
 * it is where a list stops being read and starts being scrolled.
 */
export const MANY_ROWS = 20;

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A `rowset`: every row that carries `at` is an update of a row that exists, and the rest are new.
 *
 * AN UPDATE IS NOT HARD TO UNDO, AND UNTIL BATCH 58 IT WAS SAID TO BE. Every field a write changes is an `edit`
 * line in the history with what it said before (`event.from_v`), and Put back on the decision writes those values in
 * again, so the record keeps the way back and the band says so: an update weighs what a new row weighs. A row removed
 * is the same (`patch.deleted_at`): it is kept and marked, and Put back restores it (`undo.ts`).
 *
 * MONEY IS THE ONE WRITE THAT IS. A figure a row carries is read by a balance, a report and whoever was told the
 * number the moment it lands, and putting the row back does not un-tell them. `movesMoney` is the rule `waitOf` reads
 * below, on a new row or a patch alike, and one such row is enough: `decide` applies a rowset all-or-nothing
 * (`govern.ts`), so it cannot be taken separately.
 *
 * AND SO IS A VALUE THE HISTORY WITHHOLDS (batch 60). A field any version of its list has typed `secret` or `money`,
 * or marked `redact: true`, is written to the history as `--redacted--`, and Put back says of such a line that it
 * cannot put the value back (`undo.ts`). So an update that patches one is `undo`, whatever it writes there. It is read
 * from the list's declarations, which a body alone does not carry: `rows` hands them in, and without it only what the
 * body says is weighed, as `waitOf` does without its own.
 */
function rowsetCost(body: Record<string, unknown>, rows?: CostRows): Cost {
  if (movesMoney(body) || patchesWithheld(body, rows)) return 'undo';
  return arr(body.rows).length >= MANY_ROWS ? 'shape' : 'rows';
}

/**
 * An `arrange` is several proposals as one question, so its band is the dearest of its parts.
 *
 * It starts at `rows` rather than at `call` because `govern.ts` refuses an arrangement that changes
 * nothing: there is always a part, and the parts are all writes.
 */
function arrangeCost(body: Record<string, unknown>): Cost {
  const packs = obj(body.packs);
  let cost: Cost = 'rows';
  if (arr(packs.disable).length > 0) return 'undo';
  if (arr(packs.install).length > 0 || arr(packs.enable).length > 0) cost = worseCost(cost, 'shape');
  if (arr(body.pages).length > 0 || arr(body.settings).length > 0) cost = worseCost(cost, 'shape');
  if (arr(body.rows).length >= MANY_ROWS) cost = worseCost(cost, 'shape');
  return cost;
}

/**
 * What it would cost to get this question wrong, from the body its proposer wrote.
 *
 * Lenient about the body's shape on purpose, for the reason `queuePlan` is: the row comes out of a
 * database column that a build two versions old may have written, and a ranking that throws on a
 * body it does not recognise is a queue that will not draw. An unknown kind is `call`, the cheapest
 * band, because the one thing that is certainly true of a proposal this build cannot read is that
 * this build is not going to apply it.
 */
export function costOf(bodyKind: string, body: unknown, rows?: CostRows): Cost {
  const b = obj(body);
  switch (bodyKind) {
    case 'rowset':
      return rowsetCost(b, rows);
    /* A DECLARATION THAT EXISTS IS REPLACED, AND PUT BACK CANNOT RESTORE THE ONE IT REPLACES. The old version is kept:
       the new one goes in beside it and the old is stamped `superseded_at` (`declare.ts`). But keeping it is not a way
       back. Put back walks the lines the history holds about rows and nothing else (`undo.ts`), no line is written
       for a declaration, and nothing clears `superseded_at`, so a plan for such a decision has no step in it. Batch
       58 read "the old one is kept" as "it can be undone" and lowered this to `shape`; the card then promised a way
       back the record does not have (audit 58, claim 2). `from` present is what says one is being replaced, and it
       is `undo` again UNTIL PUT BACK CAN RESTORE A SUPERSEDED DECLARATION, which is the day this goes back to
       `shape`. `test/weigh-skill-58.test.ts` holds the plan to having no step, so that day shows there first. */
    case 'change':
      return b.from === undefined || b.from === null ? 'shape' : 'undo';
    /* `disable` TAKES A REGISTER OFF EVERY SCREEN IT IS ON. Install and enable add one. */
    case 'pack':
      return typeof b.disable === 'string' ? 'undo' : 'shape';
    case 'settings':
      return 'shape';
    case 'arrange':
      return arrangeCost(b);
    /* A RULE THAT WILL ADD ROWS, which is the rowset it writes every time it matches from here on. */
    case 'pattern':
      return 'rows';
    /* AN OPTION THAT WRITES (`patches`, govern-47) IS A ROWSET ON THE PICK, so it is weighed as rows; one that only says
       a choice is a call. */
    case 'options':
      return arr(b.options).some((o) => Array.isArray(obj(o).patches)) ? 'rows' : 'call';
    default:
      return 'call';
  }
}

/**
 * `movesMoney` as SQL over a `suggestion` row. It stands above `COST_SQL` and `WAIT_SQL`, which both read it, and
 * `kernel/index.ts`'s `BAND_SQL` is `COST_SQL`; its caller has already seen that `$.rows` is an array.
 */
const MOVES_MONEY_SQL = `EXISTS (SELECT 1 FROM json_each(body, '$.rows') AS r, json_each(CASE
      WHEN r.type <> 'object' THEN NULL
      WHEN json_type(r.value, '$.at') IS NULL THEN r.value
      WHEN json_type(r.value, '$.patch') = 'object' THEN json_extract(r.value, '$.patch') END) AS f
    WHERE f.type = 'object' AND json_type(f.value, '$.amount') = 'integer' AND json_type(f.value, '$.currency') = 'text'
      AND json_extract(f.value, '$.currency') GLOB '[A-Z][A-Z][A-Z]' AND length(json_extract(f.value, '$.currency')) = 3)`;

/** What `costOf` reads of the record: the fields of a list whose values the history withholds. */
export type CostRows = { withheld: (register: string) => readonly string[] };

/**
 * The fields of the list named by `register` (an SQL expression) that the history withholds: typed `secret` or `money`,
 * as a value or as a list of them, or marked `redact: true`, by ANY version of the list's declaration and not the live
 * one alone. That is the rule the write path redacts by (`index.ts`, `redactedFields`): once withheld, always, since a
 * row written under an older version holds the value still. `costRows` and `COST_SQL` both read through it.
 */
const withheldIdsSql = (register: string): string =>
  `SELECT json_extract(df.value, '$.id') AS id FROM declaration d,
      json_each(CASE WHEN json_valid(d.body) THEN (CASE WHEN json_type(d.body, '$.fields') = 'array' THEN d.body END) END, '$.fields') AS df
    WHERE d.id = 'register.' || ${register} AND d.kind = 'register' AND df.type = 'object' AND json_type(df.value, '$.id') = 'text'
      AND (json_type(df.value, '$.redact') = 'true' OR (CASE WHEN json_type(df.value, '$.type') = 'text' AND json_extract(df.value, '$.type') = 'list'
        THEN json_extract(df.value, '$.of') ELSE json_extract(df.value, '$.type') END) IN ('secret', 'money'))`;

/** `CostRows` over the record, through the very SQL `COST_SQL` reads, so the two cannot drift apart. */
export function costRows(sql: WaitSql): CostRows {
  return { withheld: (register) => sql.all<{ id: string }>(withheldIdsSql('?'), register).map((r) => r.id) };
}

/** An update in this rowset patches a field whose value the history withholds, so Put back cannot write it in again. */
function patchesWithheld(body: Record<string, unknown>, rows?: CostRows): boolean {
  if (rows === undefined || typeof body.register !== 'string') return false;
  let withheld: readonly string[] | null = null;
  return arr(body.rows).some((r) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return false;
    const row = r as Record<string, unknown>;
    if (row.at === undefined) return false;
    const patch = writeOf(row);
    if (patch === null) return false;
    withheld ??= rows.withheld(body.register as string);
    return Object.keys(patch).some((f) => (withheld as readonly string[]).includes(f));
  });
}

/** `patchesWithheld` as SQL over a `suggestion` row; its caller has already seen that `$.rows` is an array. */
const PATCHES_WITHHELD_SQL = `EXISTS (SELECT 1 FROM json_each(body, '$.register') AS g, json_each(body, '$.rows') AS r, json_each(CASE
      WHEN r.type = 'object' AND json_type(r.value, '$.at') IS NOT NULL AND json_type(r.value, '$.patch') = 'object' THEN json_extract(r.value, '$.patch') END) AS f
    WHERE json_type(body, '$.register') = 'text' AND f.key IN (${withheldIdsSql('g.value')}))`;

/**
 * `costOf` as SQL over a `suggestion` row's `body_kind` and `body` columns, so a queue counts and ranks every open
 * question without reading one body into this process (audit 16, M5). Each arm is `costOf`'s own, in its order, and
 * `test/weigh-sql.test.ts` holds the two to the same answer over every shape `costOf` reads.
 *
 * IT READS THE `declaration` TABLE AS WELL (batch 60), for the fields a list's history withholds, so it is `costOf`
 * handed `costRows`: a caller that weighs in this process and wants the queue's own answer hands `costOf` the same.
 *
 * A BODY THAT IS NOT A JSON OBJECT IS READ AS `{}`, as `obj` reads it, and never handed to `json_extract`, which throws
 * on text that is not JSON. `json_array_length` answers 0 for a value that is not an array, which is `arr`'s `[]`.
 */
export const COST_SQL = `(CASE
  WHEN json_valid(body) AND json_type(body) = 'object' THEN (CASE body_kind
    WHEN 'rowset' THEN (CASE
      WHEN json_type(body, '$.rows') = 'array' AND (${MOVES_MONEY_SQL} OR ${PATCHES_WITHHELD_SQL}) THEN 'undo'
      WHEN COALESCE(json_array_length(body, '$.rows'), 0) >= ${MANY_ROWS} THEN 'shape'
      ELSE 'rows' END)
    WHEN 'change' THEN (CASE WHEN COALESCE(json_type(body, '$.from'), 'null') = 'null' THEN 'shape' ELSE 'undo' END)
    WHEN 'pack' THEN (CASE WHEN json_type(body, '$.disable') = 'text' THEN 'undo' ELSE 'shape' END)
    WHEN 'settings' THEN 'shape'
    WHEN 'arrange' THEN (CASE
      WHEN json_type(body, '$.packs') = 'object' AND COALESCE(json_array_length(body, '$.packs.disable'), 0) > 0 THEN 'undo'
      WHEN (json_type(body, '$.packs') = 'object' AND (COALESCE(json_array_length(body, '$.packs.install'), 0) > 0 OR COALESCE(json_array_length(body, '$.packs.enable'), 0) > 0))
        OR COALESCE(json_array_length(body, '$.pages'), 0) > 0
        OR COALESCE(json_array_length(body, '$.settings'), 0) > 0
        OR COALESCE(json_array_length(body, '$.rows'), 0) >= ${MANY_ROWS} THEN 'shape'
      ELSE 'rows' END)
    WHEN 'pattern' THEN 'rows'
    WHEN 'options' THEN (CASE WHEN EXISTS (SELECT 1 FROM json_each(body, '$.options') o WHERE o.type = 'object' AND json_type(o.value, '$.patches') = 'array') THEN 'rows' ELSE 'call' END)
    ELSE 'call' END)
  ELSE (CASE body_kind WHEN 'rowset' THEN 'rows' WHEN 'change' THEN 'shape' WHEN 'pack' THEN 'shape' WHEN 'settings' THEN 'shape'
    WHEN 'arrange' THEN 'rows' WHEN 'pattern' THEN 'rows' ELSE 'call' END)
END)`;

/** A band's place in the order, as SQL over `COST_SQL`'s answer, for an `ORDER BY` that ranks as `costRank` does. */
export const COST_RANK_SQL = `(CASE ${COST_SQL} ${COSTS.map((c, i) => `WHEN '${c}' THEN ${i}`).join(' ')} ELSE ${COSTS.length} END)`;

/* ── How long a question can wait (AGT-C08 job 3) ── */

/**
 * Whether an open question can wait, as a word the record computes, ranked first in the queue: "the ranking is a
 * saved-view sort" (P.84), and nothing in the order knew that something falls due tomorrow.
 *
 * - `soon` — a row it would change carries a deadline day inside 48 hours (a field declared `deadline: true`, typed a
 *            day, in the row as it is or in what the question would write), or it moves money, as `BAND_SQL` reads
 *            money (`kernel/index.ts`). A question that cannot wait is met first.
 * - `old`  — open for more than three days.
 * - `new`  — the rest.
 *
 * COMPUTED, NEVER DECLARED, for the reason at the top of this file: a proposer that could say its question is urgent
 * would say so every time. Nothing is stored, so an old record ranks the moment this ships. The words a person reads
 * for each are `packages/render`'s, as the bands' are.
 */
export const WAITS = ['soon', 'old', 'new'] as const;

export type Wait = (typeof WAITS)[number];

/** How far ahead a deadline makes a question `soon`: 48 hours, read as the days they reach. */
export const SOON_MS = 48 * 3_600_000;

/** How long a question is open before it is `old`: three days. */
export const OLD_MS = 3 * 86_400_000;

/** An open question as `waitOf` reads it: its kind, its body (stored JSON text or already read), and when it was asked. */
export type WaitingQuestion = { body_kind: string; body: unknown; opened_at: string };

/** What `waitOf` reads of the record: a list's deadline fields, and a live row's fields by the `at` a rowset names. */
export type WaitRows = {
  deadlines: (register: string) => readonly string[];
  held: (register: string, at: string) => Record<string, unknown> | null;
};

/** `?` parameters `WAIT_SQL` and `WAIT_RANK_SQL` take, in order: the first and last day `soon` reaches, and the instant before which a question is `old`. */
export function waitParams(nowMs: number): [string, string, string] {
  return [day(nowMs), day(nowMs + SOON_MS), new Date(nowMs - OLD_MS).toISOString()];
}

/**
 * How long this question can wait, at `nowMs`. Without `rows` only what the body itself says is read (money, and the
 * deadline days it would write), which is all a caller with no record can know; the queue reads the rows too.
 */
export function waitOf(question: WaitingQuestion, nowMs: number, rows?: WaitRows): Wait {
  const body = typeof question.body === 'string' ? readJson(question.body) : obj(question.body);
  const [from, to, oldBefore] = waitParams(nowMs);
  if (question.body_kind === 'rowset' && (movesMoney(body) || dueInside(body, from, to, rows))) return 'soon';
  return typeof question.opened_at === 'string' && question.opened_at < oldBefore ? 'old' : 'new';
}

/** A wait's place in the order, lowest first; out of the set sorts last. */
export const waitRank = (w: string): number => {
  const at = (WAITS as readonly string[]).indexOf(w);
  return at < 0 ? WAITS.length : at;
};

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const readJson = (text: string): Record<string, unknown> => {
  try {
    return obj(JSON.parse(text));
  } catch {
    return {};
  }
};

/** What one rowset row would write: a new row itself, or an update's patch. */
const writeOf = (r: Record<string, unknown>): Record<string, unknown> | null =>
  r.at === undefined ? r : r.patch !== null && typeof r.patch === 'object' && !Array.isArray(r.patch) ? (r.patch as Record<string, unknown>) : null;

/** A money value as the record holds one: an integer amount in minor units and a three-letter currency. */
const isMoney = (v: unknown): boolean => {
  const m = obj(v);
  return Number.isInteger(m.amount) && typeof m.currency === 'string' && /^[A-Z]{3}$/.test(m.currency);
};

function movesMoney(body: Record<string, unknown>): boolean {
  return arr(body.rows).some((r) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return false;
    const w = writeOf(r as Record<string, unknown>);
    return w !== null && Object.values(w).some(isMoney);
  });
}

/** A day, or an instant read as its day, from `from` to `to`. */
const inside = (v: unknown, from: string, to: string): boolean =>
  typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(v) && v.slice(0, 10) >= from && v.slice(0, 10) <= to;

function dueInside(body: Record<string, unknown>, from: string, to: string, rows?: WaitRows): boolean {
  if (rows === undefined || typeof body.register !== 'string' || !Array.isArray(body.rows)) return false;
  const register = body.register;
  const deadlines = rows.deadlines(register);
  if (deadlines.length === 0) return false;
  return body.rows.some((r) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return false;
    const row = r as Record<string, unknown>;
    const held = typeof row.at === 'string' ? rows.held(register, row.at) : null;
    return [writeOf(row), held].some((w) => w !== null && deadlines.some((f) => Object.hasOwn(w, f) && inside(w[f], from, to)));
  });
}

/**
 * A list's deadline fields as SQL, for the list named by `register` (an SQL expression): declared `deadline: true`,
 * typed a day, not retired, on the live declaration. `waitRows` and `WAIT_SQL` both read through it.
 */
const deadlineIdsSql = (register: string): string =>
  `SELECT json_extract(df.value, '$.id') AS id FROM declaration d, json_each(CASE WHEN json_valid(d.body) THEN d.body END, '$.fields') AS df
    WHERE d.id = 'register.' || ${register} AND d.superseded_at IS NULL AND d.retired = 0 AND df.type = 'object'
      AND json_type(df.value, '$.id') = 'text' AND json_type(df.value, '$.deadline') = 'true' AND json_extract(df.value, '$.type') = 'day'
      AND COALESCE(json_type(df.value, '$.retired'), '') <> 'true'`;

/**
 * The live row a rowset names, as SQL: its row id, its spoken id (`tasks#4`), or its list's prefix and number (`S4`),
 * each matched exactly, each a search by the row id or by list and number. `waitRows` and `WAIT_SQL` both read through it.
 */
const heldSql = (register: string, at: string): string => {
  const prefix = `(SELECT json_extract(d.body, '$.seq_prefix') FROM declaration d WHERE d.id = 'register.' || ${register} AND d.superseded_at IS NULL
    AND d.retired = 0 AND json_valid(d.body) AND json_type(d.body, '$.seq_prefix') = 'text' AND json_extract(d.body, '$.seq_prefix') <> '#' ORDER BY d.version DESC LIMIT 1)`;
  /* THREE SCALAR READS AND NOT ONE WITH AN OR: SQLite met the OR by walking every live row of the list, once a row a
     question names, on every draw of the queue. Each read here is a search by the row id or by list and number. */
  const live = `e.register = ${register} AND e.deleted_at IS NULL AND json_valid(e.fields)`;
  return `COALESCE(
      (SELECT e.fields FROM entry e WHERE e.id = ${at} AND ${live}),
      (SELECT e.fields FROM entry e WHERE e.seq = CAST(substr(${at}, length(${register}) + 2) AS INTEGER) AND ${at} = ${register} || '#' || e.seq AND ${live}),
      (SELECT e.fields FROM entry e WHERE e.seq = CAST(substr(${at}, length(${prefix}) + 1) AS INTEGER) AND ${at} = ${prefix} || e.seq AND ${live}))`;
};

/** The structural SQL port `waitRows` reads by, so this file imports none. */
export type WaitSql = { all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] };

/** `WaitRows` over the record, through the very SQL `WAIT_SQL` reads, so the two cannot drift apart. */
export function waitRows(sql: WaitSql): WaitRows {
  return {
    deadlines: (register) =>
      sql.all<{ id: string }>(deadlineIdsSql('?'), register).map((r) => r.id),
    held: (register, at) => {
      const fields = sql.all<{ f: string | null }>(`SELECT ${heldSql('g.value', 'a.value')} AS f FROM json_each(?) AS g, json_each(?) AS a`, JSON.stringify(register), JSON.stringify(at))[0]?.f;
      return typeof fields === 'string' ? readJson(fields) : null;
    },
  };
}

/** `dueInside` as SQL: a deadline day from the first `?` to the second, in what a row would write or in the row as it is. */
const DUE_SQL = `EXISTS (SELECT 1 FROM json_each(body, '$.register') AS g, json_each(body, '$.rows') AS r,
      json_each(json_array(
        CASE WHEN r.type <> 'object' THEN NULL WHEN json_type(r.value, '$.at') IS NULL THEN json(r.value)
          WHEN json_type(r.value, '$.patch') = 'object' THEN json_extract(r.value, '$.patch') END,
        CASE WHEN r.type = 'object' AND json_type(r.value, '$.at') = 'text' THEN json(${heldSql('g.value', "json_extract(r.value, '$.at')")}) END)) AS w,
      json_each(CASE WHEN w.type = 'object' THEN w.value END) AS f
    WHERE json_type(body, '$.register') = 'text' AND f.type = 'text' AND f.value GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
      AND substr(f.value, 1, 10) BETWEEN ? AND ? AND f.key IN (${deadlineIdsSql('g.value')}))`;

/**
 * `waitOf` as SQL over a `suggestion` row's `body_kind`, `body` and `opened_at`, reading the rows the way `waitRows`
 * does. It takes `waitParams(nowMs)` as its three `?`, in order, at the place it is written in the statement.
 * `test/weigh-sql.test.ts` holds it to `waitOf`'s answer on one set of questions. A body that is not a JSON object
 * reads as `{}`, as `waitOf` reads it.
 */
export const WAIT_SQL = `(CASE
  WHEN (CASE WHEN body_kind = 'rowset' AND json_valid(body) AND json_type(body) = 'object' AND json_type(body, '$.rows') = 'array'
    THEN (${MOVES_MONEY_SQL} OR ${DUE_SQL}) ELSE 0 END) THEN 'soon'
  WHEN opened_at < ? THEN 'old'
  ELSE 'new' END)`;

/**
 * A wait's place in the order as SQL, for an `ORDER BY` that ranks as `waitRank` does: `soon` first. Like `WAIT_SQL`,
 * it takes `waitParams(nowMs)` as its three `?`. `openQuestions` orders by it, then by band, then oldest first.
 */
export const WAIT_RANK_SQL = `(CASE ${WAIT_SQL} ${WAITS.map((w, i) => `WHEN '${w}' THEN ${i}`).join(' ')} ELSE ${WAITS.length} END)`;
