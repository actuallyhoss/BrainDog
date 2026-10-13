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
 *             turns a pack off, it moves money, it retypes a field that holds answers, it adds a
 *             field to a list that holds rows, it changes a value the history withholds, or every
 *             option it offers is one its proposer marked hard. The other button tomorrow does not
 *             return the record to where it was.
 * - `shape` — accepting it changes what everyone sees: a pack installed or turned on, a pack's
 *             settings, a page, a declaration that is new or replaces one. Reversible, and not quietly: everyone
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
/** A change that retypes or narrows a field and nothing else, as `govern.ts`'s `isRetype` reads one. */
const retypes = (to: unknown): boolean => {
  const t = obj(to);
  return ('retype' in t || 'narrow' in t) && !('add' in t) && !('retire' in t);
};

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
    /* A DECLARATION THAT EXISTS IS REPLACED, AND PUT BACK RESTORES THE ONE IT REPLACED (batch 62). The old version is
       kept: the new one goes in beside it and the old is stamped `superseded_at` (`declare.ts`). Since batch 62 the
       undo of such a decision has a step for it (`undo.ts`, `declaredIn`): the earlier body is installed again as a
       new version, through the record's `undo`, which makes it ready first and writes it second. So a change is
       `shape`, with a `from` or without one. Batches 58 to 61 held it at `undo` while a plan for it had no step
       (audit 58, claim 2).
       A RETYPE WITH A `from` STAYS `undo`: it rewrites the answers under the field, and `undo.ts` leaves it
       with a sentence. `retypes` is `govern.ts`'s `isRetype`.
       AND SO DOES A FIELD ADDED TO A LIST THAT HOLDS ROWS (audit 62, claim 5). Put back takes the field off again only
       until somebody fills it; after that it leaves the step and says the field holds answers now (`undo.ts`,
       `filledSince`), and on a list in use that is the common case, so the question says so before the press and not
       after. A list with no row yet has nothing to fill, and stays `shape`. */
    case 'change':
      if (b.from !== undefined && b.from !== null && retypes(b.to)) return 'undo';
      return addsToHeld(b, rows) ? 'undo' : 'shape';
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
    /* AN OPTION THAT WRITES (`patches`, govern-47) IS A ROWSET ON THE PICK, so it is weighed as one (`optionCost`); one
       that only says a choice is a call.
       AN OPTION ITS PROPOSER MARKED `hard: true` IS ONE THAT CANNOT BE TAKEN BACK ONCE PICKED, AND IT IS THAT OPTION
       THAT IS HARD, NOT THE QUESTION (audit 62, claim 6). Batches 60 to 63 weighed the question by its worst option,
       so a pack update that offered "Keep my pages" beside "Take the update's page" was counted and ranked as the worst
       kind, and keeping was worded as hard. `optionCost` and `pickCost` say each option's own band.
       THE QUESTION IS `undo` ONLY WHEN NO PICK AVOIDS IT: every option it offers is marked. Otherwise it is weighed by
       what the options that can be taken back would do. Only the boolean `true` marks an option.
       AND AN OPTION THAT MOVES MONEY, OR PATCHES A VALUE THE HISTORY WITHHOLDS, IS HARD BY WHAT IT WRITES (batch 66), so
       it counts with the marked ones here: a question that offers nothing else has no pick that avoids it. */
    case 'options': {
      const offered = arr(b.options).map((o) => optionCost(o, rows));
      if (offered.length > 0 && offered.every((c) => c === 'undo')) return 'undo';
      return offered.includes('rows') ? 'rows' : 'call';
    }
    default:
      return 'call';
  }
}

/** An entry by its spoken id, `recurring#5`, whose list is the part before the `#`, as `govern.ts` reads one. */
const SPOKEN_AT = /^([a-z][a-z0-9_-]{0,31})#[1-9]\d*$/u;

/** The list one of an option's patches is about: its `register`, or else the list its spoken `at` names (`govern.ts`, `patchLists`). */
const patchList = (p: Record<string, unknown>): string | null =>
  typeof p.register === 'string' ? p.register : typeof p.at === 'string' ? (SPOKEN_AT.exec(p.at)?.[1] ?? null) : null;

/**
 * What an option's `patches` weigh, which is what `rowsetCost` says of the same writes filed as a rowset: `undo` when
 * one of them writes a money value, or patches a field its list's history withholds, and `rows` otherwise. One such
 * patch is enough, since a pick applies them all or none (`govern.ts`, `applyPatches`). The patches name their own
 * lists, so they are read a list at a time; one that does not say which list it is in is weighed by what it says alone.
 * An option carries no more than a rowset may, and its pick is one press, so twenty of them are not raised to `shape`.
 */
function patchesCost(patches: unknown[], rows?: CostRows): Cost {
  if (movesMoney({ rows: patches })) return 'undo';
  if (rows === undefined) return 'rows';
  const lists = new Map<string, unknown[]>();
  for (const p of patches) {
    const list = patchList(obj(p));
    if (list !== null) lists.set(list, [...(lists.get(list) ?? []), p]);
  }
  for (const [register, of] of lists) if (patchesWithheld({ register, rows: of }, rows)) return 'undo';
  return 'rows';
}

/**
 * What it would cost to have picked this one option of an `options` question, which is the band its own line on the
 * card wears: `undo` when its proposer marked it `hard: true`, what its patches weigh when it writes on the pick
 * (`patchesCost`: `undo` or `rows`), and `call` when it only says a choice. Hard stands above what its patches say.
 * Lenient as `costOf` is: what is not an option is `call`.
 *
 * `rows` is the record, as `costOf` takes it. Without it money is still read, since the patch itself says it, and a
 * withheld field is not, since only the list's declarations say that.
 */
export function optionCost(option: unknown, rows?: CostRows): Cost {
  const o = obj(option);
  if (o.hard === true) return 'undo';
  return Array.isArray(o.patches) ? patchesCost(o.patches, rows) : 'call';
}

/** Every option an `options` question offers, by its id, with its own band, in the order they are offered. */
export function optionCosts(body: unknown, rows?: CostRows): { id: string; cost: Cost }[] {
  return arr(obj(body).options).flatMap((o) => (typeof obj(o).id === 'string' ? [{ id: obj(o).id as string, cost: optionCost(o, rows) }] : []));
}

/**
 * What it would cost to have given this answer to this question, for the words beside the press: of an `options`
 * question it is the picked option's own band, and of any other kind it is the question's band for `accept`. An answer
 * that writes nothing (`reject`, or an option the question does not offer) is `call`.
 */
export function pickCost(bodyKind: string, body: unknown, option: string, rows?: CostRows): Cost {
  if (bodyKind !== 'options') return option === 'accept' ? costOf(bodyKind, body, rows) : 'call';
  return optionCosts(body, rows).find((o) => o.id === option)?.cost ?? 'call';
}

/** `movesMoney` as SQL over the array at `path` of the JSON `src` names; its caller has already seen that it is an array. */
const movesMoneySql = (src: string, path: string): string => `EXISTS (SELECT 1 FROM json_each(${src}, '${path}') AS r, json_each(CASE
      WHEN r.type <> 'object' THEN NULL
      WHEN json_type(r.value, '$.at') IS NULL THEN r.value
      WHEN json_type(r.value, '$.patch') = 'object' THEN json_extract(r.value, '$.patch') END) AS f
    WHERE f.type = 'object' AND json_type(f.value, '$.amount') = 'integer' AND json_type(f.value, '$.currency') = 'text'
      AND json_extract(f.value, '$.currency') GLOB '[A-Z][A-Z][A-Z]' AND length(json_extract(f.value, '$.currency')) = 3)`;

/**
 * `movesMoney` as SQL over a `suggestion` row. It stands above `COST_SQL` and `WAIT_SQL`, which both read it, and
 * `kernel/index.ts`'s `BAND_SQL` is `COST_SQL`; its caller has already seen that `$.rows` is an array.
 */
const MOVES_MONEY_SQL = movesMoneySql('body', '$.rows');

/**
 * What `costOf` reads of the record: the fields of a list whose values the history withholds, and whether a list
 * holds a row. `held` may be left out, by a caller written before it: a change is then weighed by its body alone.
 */
export type CostRows = { withheld: (register: string) => readonly string[]; held?: ((register: string) => boolean) | undefined };

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
  return {
    withheld: (register) => sql.all<{ id: string }>(withheldIdsSql('?'), register).map((r) => r.id),
    held: (register) => sql.all(`SELECT 1 AS y WHERE ${heldRowSql('?')}`, register).length > 0,
  };
}

/** Whether the list named by `register` (an SQL expression) holds a row that is not removed. `costRows` and `COST_SQL` both read through it. */
const heldRowSql = (register: string): string => `EXISTS (SELECT 1 FROM entry e WHERE e.register = ${register} AND e.deleted_at IS NULL)`;

/**
 * The list a change adds fields to, or `null` when it adds none: `to.add.fields` with a field in it, on the list
 * `to.add.register` names or else the one the change is filed under, as `govern.ts`'s `listNamed` reads it. Values
 * added to a closed list are not a field, and are not read here.
 */
function addsTo(body: Record<string, unknown>): string | null {
  const add = obj(obj(body.to).add);
  if (arr(add.fields).length === 0) return null;
  const filed = typeof body.declaration_id === 'string' && body.declaration_id.startsWith('register.') ? body.declaration_id : undefined;
  const list = add.register ?? filed;
  if (typeof list !== 'string') return null;
  return list.startsWith('register.') ? list.slice('register.'.length) : list;
}

/** This change adds a field to a list that holds rows, so Put back takes it off only until somebody fills it. */
function addsToHeld(body: Record<string, unknown>, rows?: CostRows): boolean {
  if (rows?.held === undefined) return false;
  const list = addsTo(body);
  return list !== null && rows.held(list);
}

/** `addsTo` as SQL over a `suggestion` row: the list's name, or NULL. */
const ADDS_TO_SQL = `(SELECT CASE WHEN substr(l.n, 1, 9) = 'register.' THEN substr(l.n, 10) ELSE l.n END FROM (SELECT CASE
      WHEN COALESCE(json_array_length(body, '$.to.add.fields'), 0) = 0 THEN NULL
      WHEN json_type(body, '$.to.add.register') = 'text' THEN json_extract(body, '$.to.add.register')
      WHEN COALESCE(json_type(body, '$.to.add.register'), 'null') = 'null' AND json_type(body, '$.declaration_id') = 'text'
        AND substr(json_extract(body, '$.declaration_id'), 1, 9) = 'register.' THEN json_extract(body, '$.declaration_id') END AS n) AS l)`;

/** `addsToHeld` as SQL over a `suggestion` row. */
const ADDS_TO_HELD_SQL = heldRowSql(ADDS_TO_SQL);

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

/** The `at` of one of an option's patches, `p`. */
const PATCH_AT_SQL = `json_extract(p.value, '$.at')`;

/**
 * `patchList` as SQL over one of an option's patches, `p`, which its caller has seen is an object: its `register`, or
 * the list its spoken `at` names, or NULL. The four GLOBs are `SPOKEN_AT`.
 */
const PATCH_LIST_SQL = `(CASE
      WHEN json_type(p.value, '$.register') = 'text' THEN json_extract(p.value, '$.register')
      WHEN json_type(p.value, '$.at') = 'text' AND instr(${PATCH_AT_SQL}, '#') BETWEEN 2 AND 33
        AND ${PATCH_AT_SQL} GLOB '[a-z]*#[1-9]*' AND substr(${PATCH_AT_SQL}, 1, instr(${PATCH_AT_SQL}, '#') - 1) NOT GLOB '*[^a-z0-9_-]*'
        AND substr(${PATCH_AT_SQL}, instr(${PATCH_AT_SQL}, '#') + 1) GLOB '[1-9]*' AND substr(${PATCH_AT_SQL}, instr(${PATCH_AT_SQL}, '#') + 1) NOT GLOB '*[^0-9]*'
        THEN substr(${PATCH_AT_SQL}, 1, instr(${PATCH_AT_SQL}, '#') - 1) END)`;

/**
 * Whether one option, `o`, is `undo` in `optionCost` handed `costRows`, as SQL; its caller has seen that `o` is an
 * object. Never NULL, so its caller may say NOT of it.
 */
const OPTION_UNDO_SQL = `(COALESCE(json_type(o.value, '$.hard'), '') = 'true' OR (COALESCE(json_type(o.value, '$.patches'), '') = 'array' AND (${movesMoneySql('o.value', '$.patches')}
      OR EXISTS (SELECT 1 FROM json_each(o.value, '$.patches') AS p, json_each(CASE WHEN p.type <> 'object' THEN NULL
        WHEN json_type(p.value, '$.at') IS NOT NULL AND json_type(p.value, '$.patch') = 'object' THEN json_extract(p.value, '$.patch') END) AS f
      WHERE f.key IN (${withheldIdsSql(PATCH_LIST_SQL)})))))`;

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
    WHEN 'change' THEN (CASE
      WHEN COALESCE(json_type(body, '$.from'), 'null') <> 'null' AND (json_type(body, '$.to.retype') IS NOT NULL OR json_type(body, '$.to.narrow') IS NOT NULL)
        AND json_type(body, '$.to.add') IS NULL AND json_type(body, '$.to.retire') IS NULL THEN 'undo'
      WHEN ${ADDS_TO_HELD_SQL} THEN 'undo'
      ELSE 'shape' END)
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
    WHEN 'options' THEN (CASE
      WHEN json_type(body, '$.options') = 'array' AND json_array_length(body, '$.options') > 0
        AND NOT EXISTS (SELECT 1 FROM json_each(body, '$.options') o WHERE CASE WHEN o.type <> 'object' THEN 1 ELSE NOT ${OPTION_UNDO_SQL} END) THEN 'undo'
      WHEN json_type(body, '$.options') = 'array' AND EXISTS (SELECT 1 FROM json_each(body, '$.options') o WHERE CASE WHEN o.type <> 'object' THEN 0
        ELSE json_type(o.value, '$.patches') = 'array' AND NOT ${OPTION_UNDO_SQL} END) THEN 'rows'
      ELSE 'call' END)
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
