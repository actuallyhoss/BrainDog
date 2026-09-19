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
 * - `undo`  — accepting it is hard to take back: it changes rows somebody already has, replaces a
 *             declaration that exists, or turns a pack off. The other button tomorrow does not
 *             return the record to where it was.
 * - `shape` — accepting it changes what everyone sees: a pack installed or turned on, a pack's
 *             settings, a page. Reversible, and not quietly: everyone who opens the record meets it.
 * - `rows`  — accepting it adds rows or a rule that will add them. Deletable, one at a time.
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
 * ONE UPDATE IS ENOUGH TO MAKE IT THE DEARER BAND. A batch of a hundred creates and one update is
 * still a batch that changes something somebody already has, and `decide` applies a rowset
 * all-or-nothing (`govern.ts`), so the one update cannot be taken separately either.
 */
function rowsetCost(body: Record<string, unknown>): Cost {
  const rows = arr(body.rows);
  if (rows.some((r) => typeof obj(r).at === 'string')) return 'undo';
  return rows.length >= MANY_ROWS ? 'shape' : 'rows';
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
export function costOf(bodyKind: string, body: unknown): Cost {
  const b = obj(body);
  switch (bodyKind) {
    case 'rowset':
      return rowsetCost(b);
    /* A DECLARATION THAT EXISTS IS REPLACED, and the one it replaces is not kept: `from` is what says
       there is something under it. A `change` proposing a declaration that is new only adds one. */
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
    case 'options':
    default:
      return 'call';
  }
}
