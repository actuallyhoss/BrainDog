/**
 * What a declared page does differently when it is a home: a long block is folded in place, and the keys walk the rows
 * of every block rather than the blocks. And, until the kernel exports it, the rule for what a page draws.
 *
 * THE RULE IS THE RECORD'S NOW (`packages/kernel/src/drawn.ts`, DIRECTION §35: an empty or unused part is not drawn;
 * §37: one empty line a page). The record marks each block it leaves out `drawn: false` with `why`, so an agent reading
 * a page, a shared page and an export draw what the screen draws. Every caller here reads that flag: `emptyHidden`
 * keeps a block the record left out as it came and judges only what the record drew, which is also what a record on an
 * older kernel sends, and what this build alone knows (a block it `cannot` draw, a figure over a field nobody filled).
 *
 * WHAT FOLLOWS, DOWN TO THE FOLD, IS `drawn.ts` WORD FOR WORD, but for `registered`. The app may not import a package's
 * file by a relative path (`tools/gates/graph.mjs`), and `@braindog/kernel` does not export `drawn.ts` until its
 * `index.ts` says so (batch 39). On that day this section becomes one `export { ... } from '@braindog/kernel'` line,
 * and `home.test.ts` holds the same answers the kernel's `drawn.test.ts` does.
 *
 * PURE, AND NODE LOADS IT (no imports at all), so `home.test.ts` holds each rule without a component.
 */

/**
 * Why a block is not drawn: it holds nothing (`empty`), what it reads no row has said (`unsaid`), its `when:` said no
 * (`when`), or the reader cannot draw it (`cannot`).
 */
export type Why = 'empty' | 'unsaid' | 'when' | 'cannot';
export const WHY: readonly Why[] = ['empty', 'unsaid', 'when', 'cannot'];

/** The `empty:` an author writes for a block that keeps its nought: a ledger wants its zeros. */
export const KEEP = 'keep';

/**
 * WHAT THE RULE READS OF A BLOCK, in either shape. Every key but the four it cannot do without is `unknown` and narrowed
 * where it is read, so the record's block and the app's both fit without a cast.
 */
export type Drawable = {
  kind: string;
  drawn?: boolean | undefined;
  why?: Why | undefined;
  refusals: readonly unknown[];
  rows: readonly unknown[];
  empty?: unknown;
  body?: unknown;
  cannot?: unknown;
  answer?: unknown;
  entries?: unknown;
  matched?: unknown;
  total?: unknown;
  metrics?: unknown;
  readings?: unknown;
  parts?: unknown;
  source?: unknown;
  cells?: unknown;
  columns?: unknown;
  range?: unknown;
  measures?: unknown;
  latest?: unknown;
  readOnce?: unknown;
  queue?: unknown;
  feed?: unknown;
  actions?: unknown;
  history?: unknown;
  walks?: unknown;
  walk?: unknown;
  bars?: unknown;
  area?: unknown;
  panel?: unknown;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const none = (v: unknown): boolean => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** Drawn unless something said it is not: the record's block leaves `drawn` out where no `when:` was asked. */
const on = (b: Drawable): boolean => b.drawn !== false;

/**
 * THE KINDS WHOSE EMPTINESS IS THE POINT, never hidden: a sentence, a heading, a field to type into, and the kinds whose
 * rows are written on the declaration rather than read from a list. A capture with nothing under it is the way to add
 * the first thing; a path with no steps is where the first step is added.
 */
const KEPT = new Set(['note', 'section', 'capture', 'inputs', 'steps', 'quote', 'code', 'tree', 'embed', 'link', 'gallery']);

/** The kinds that frame a page rather than say anything on it: a heading over blocks, and a field to type into. */
const FRAME = new Set(['section', 'capture', 'inputs']);

/** Whether the author asked for the block's nought (`empty: keep`): it is never left out for holding nothing. */
export const keeps = (b: Drawable): boolean => b.empty === KEEP;

/** A block the record refused, or the reader cannot draw: it draws its own sentence and is never called empty. */
export const says = (b: Drawable): boolean => b.refusals.length > 0 || b.cannot !== undefined;

/**
 * A BLOCK A REGISTERED KIND DRAWS (`kinds/index.ts`) is never judged here, because only its own module can read what it
 * holds. The app marks one by the `answer` it keeps whole, which is the one line that is not the kernel's.
 */
const registered = (b: Drawable): boolean => b.answer !== undefined;

/** Whether the author wrote what the block says when it holds nothing. A blank sentence, and `keep`, say nothing. */
const saysEmpty = (b: Drawable): boolean => typeof b.empty === 'string' && b.empty.trim() !== '' && b.empty !== KEEP;

/** A value somebody wrote: not nothing, not an empty string and not an empty list. Nought is a value. */
const isSet = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** How many rows the block matched: the app's rows, or the record's count. */
const matchedCount = (b: Drawable): number => (Array.isArray(b.matched) ? b.matched.length : typeof b.matched === 'number' ? b.matched : 0);

/**
 * The rows a chart is asked about: every row the app was handed, or the rows the record answered, cut to `limit`. The
 * record's cut is the one place the two can differ, and only on a block longer than its limit.
 */
const matchedRows = (b: Drawable): readonly unknown[] => (Array.isArray(b.matched) ? b.matched : b.rows);
const fieldsOf = (row: unknown): Obj => (isObj(row) && isObj(row.fields) ? row.fields : {});

/**
 * A FIGURE'S PARTS, where the block draws one figure split by a word: the app's `parts`, or the record's one reading of
 * a `metric.` source with no `cells:`. A stat over a figure is its tiles and never its parts, as the app reads it.
 */
function partsOf(b: Drawable): { groups: readonly unknown[]; value: unknown } | null {
  if (isObj(b.parts)) return Array.isArray(b.parts.groups) ? { groups: b.parts.groups, value: b.parts.value } : null;
  if (b.kind === 'stat' || b.cells !== undefined || typeof b.source !== 'string' || !b.source.startsWith('metric.')) return null;
  const cell = list(b.readings)[0];
  const reading = isObj(cell) ? cell.reading : null;
  return isObj(reading) ? { groups: list(reading.groups), value: reading.value } : null;
}

/** A block's figures, one a tile: the app's `metrics`, or the record's `readings` where they are not one figure's parts. */
const figuresOf = (b: Drawable): readonly unknown[] => (Array.isArray(b.metrics) ? b.metrics : partsOf(b) ? [] : list(b.readings));

/** Whether a figure adds up a field no row has filled in: the app's tile says so, and so may the record's reading. */
const unsaidFigure = (f: unknown): boolean => isObj(f) && (f.unsaid === true || (isObj(f.reading) && f.reading.unsaid === true));

/**
 * A FIGURE THAT SAYS NOTHING ON A PAGE BEING READ: one that adds up a field no row has filled in (`unsaidFigure`), and
 * one over a list that holds no row at all, whose zero the record calls not news (the app's `nothingHeld`, the record's
 * `held: 0`). A figure the record refused says why, and is never idle.
 */
function idle(f: unknown): boolean {
  if (!isObj(f) || f.refusal !== undefined) return false;
  if (unsaidFigure(f) || f.nothingHeld === true) return true;
  return isObj(f.reading) && f.reading.held === 0;
}

/**
 * THE BLOCK WITH ITS IDLE FIGURES TAKEN FROM ITS ROW, and the figures beside them kept. A row of nothing but such figures
 * keeps none, and says its `empty:` line in their place. `empty: keep` keeps every one: a ledger wants its zeros.
 */
function told<B extends Drawable>(b: B): B {
  if (keeps(b)) return b;
  if (Array.isArray(b.metrics)) return b.metrics.some(idle) ? ({ ...b, metrics: b.metrics.filter((f) => !idle(f)) } as B) : b;
  if (Array.isArray(b.readings) && !partsOf(b) && b.readings.some(idle)) return { ...b, readings: b.readings.filter((f) => !idle(f)) } as B;
  return b;
}

/**
 * Whether a block answered nothing at all: no row, figure, question, line of the feed, step of a walk or version.
 *
 * EVERY SHAPE AN ANSWER COMES IN IS ASKED, because a kind holds what it holds in its own field: a stat its figures, a
 * queue its `queue`, a forecast its `walk`. A block a registered kind draws is never called empty here.
 */
export function holdsNothing(b: Drawable): boolean {
  if (registered(b)) return false;
  /* A BLOCK WITH NO SOURCE IS DRAWN FROM ITS DECLARATION (its `body`), so it holds what its author wrote. */
  if (typeof b.body === 'string' && b.body.trim() !== '') return false;
  const parts = partsOf(b);
  return (
    b.rows.length === 0 &&
    none(b.entries) &&
    matchedCount(b) === 0 &&
    (typeof b.total !== 'number' || b.total === 0) &&
    figuresOf(b).every(idle) &&
    none(b.measures) &&
    none(b.latest) &&
    none(b.readOnce) &&
    none(b.queue) &&
    none(b.feed) &&
    none(b.actions) &&
    none(b.history) &&
    none(b.walks) &&
    b.walk == null &&
    b.bars == null &&
    /* A FIGURE THAT READ NO ROW, no part and no whole, holds nothing as a list of none does. */
    (parts === null || (parts.groups.length === 0 && !parts.value))
  );
}

/**
 * Whether a block has nothing to draw but its `empty:` line: it holds nothing, is not a kind whose emptiness is the
 * point, and its author did not ask for its nought.
 */
export const bare = (b: Drawable): boolean => !says(b) && !KEPT.has(b.kind) && !keeps(b) && holdsNothing(b);

/**
 * THE COLUMNS A CHART IS MADE OF, by place: a bar and a split name each part by the first and add up the second, chips
 * count by the first, and a gauge and a progress fill by the second. A list draws its rows' names whatever else is
 * empty, so a list is never one of these.
 */
const PICTURED: Readonly<Record<string, readonly number[]>> = { bar: [0, 1], split: [0, 1], chips: [0], gauge: [1], progress: [1] };

/**
 * A RANGE IS MADE OF ITS BANDS, the low and the high (`range: true`, `label | spent | low | high`). What was spent is a
 * mark on a band that may not be there yet, so a range nothing is spent on is still every band it was given.
 */
const BANDS: readonly number[] = [2, 3];

const columnField = (b: Drawable, n: number): string | null => {
  const c = list(b.columns)[n];
  return isObj(c) && typeof c.field === 'string' && c.field !== '' ? c.field : null;
};

/**
 * WHETHER A BLOCK READS WHAT NO ROW HAS SAID: a chart over rows of which not one holds a column the chart is made of, a
 * figure's parts when no row the figure read sits in any part, or a row of figures every one of which adds up a field
 * nobody filled in. Each draws only that a field is empty on every row: "How they are going" was one grey track of
 * eleven over "Not said yet" on the founder's Projects (`loop/research-real-record.md`).
 *
 * A COLUMN THAT NAMES NO FIELD IS NOT ASKED ABOUT, and a block the record refused, a registered kind's, or one whose
 * author keeps its nought, is not this rule's to judge.
 */
export function unsaid(b: Drawable): boolean {
  if (says(b) || registered(b) || keeps(b)) return false;
  const parts = partsOf(b);
  if (parts) {
    /* ROWS READ AND NONE IN A PART: a whole and no group. A figure that read no row at all holds nothing (`holdsNothing`),
       and keeps its empty line where it leads the page. */
    if (parts.groups.length === 0) return typeof parts.value === 'number' && parts.value !== 0;
    return parts.groups.every((g) => isObj(g) && g.value === null && none(g.parts));
  }
  const figures = figuresOf(b);
  if (figures.length > 0) return figures.every(unsaidFigure);
  const at = b.kind === 'progress' && b.range === true ? BANDS : PICTURED[b.kind];
  const rows = matchedRows(b);
  if (!at || rows.length === 0) return false;
  return at.some((n) => {
    const field = columnField(b, n);
    return field !== null && !rows.some((r) => isSet(fieldsOf(r)[field]));
  });
}

/**
 * WHY A PAGE BEING READ LEAVES A BLOCK OUT WHEREVER IT STANDS, or `null`: the reader cannot draw it, or what it reads no
 * row has said. A BLOCK THE READER CANNOT DRAW IS NOT THE READER'S TO FIX: "This part of the page cannot be drawn from
 * the record yet" told a person about a build, not their record. A block the record REFUSED is still drawn, because its
 * sentence names the fix in the declaration and somebody has to see it.
 */
function goneWhy(b: Drawable): Why | null {
  if (b.cannot !== undefined && b.refusals.length === 0) return 'cannot';
  return unsaid(b) ? 'unsaid' : null;
}

/** Whether a page being read leaves a block out wherever it stands (`goneWhy`). */
export const gone = (b: Drawable): boolean => goneWhy(b) !== null;

/**
 * THE PAGE'S LEAD, WHICH IS THE ONE BLOCK THAT MAY SAY IT IS EMPTY: the first drawn block that says anything, a heading
 * and a field to type into aside, whether that is what it holds or the `empty:` line its author wrote. `-1` when no
 * block says anything.
 *
 * ONE EMPTY LINE A PAGE, NEVER ONE A TILE (DIRECTION §37). Every block on Work carries an `empty:`, so a list with
 * nothing in it drew eight to twelve tiles each saying it held nothing. A page whose lead holds something draws no empty
 * line at all; a page whose lead holds nothing draws that one, and nothing else that is empty.
 */
export function leadOf(blocks: readonly Drawable[]): number {
  return blocks.findIndex((b) => on(b) && !FRAME.has(b.kind) && !gone(b) && (!bare(b) || saysEmpty(b)));
}

const areaOf = (b: Drawable): 'main' | 'rail' => (b.area === 'rail' ? 'rail' : 'main');

/** The blocks a section heads: those after it in its own column, up to the next section there. */
function headed(blocks: readonly Drawable[], at: number): Drawable[] {
  const held: Drawable[] = [];
  const area = areaOf(blocks[at]!);
  for (const next of blocks.slice(at + 1)) {
    if (areaOf(next) !== area) continue;
    if (next.kind === 'section') break;
    held.push(next);
  }
  return held;
}

/**
 * THE BLOCKS AS A PAGE IS READ: the same list at the same indexes, each block left out marked `drawn: false` with its
 * `why`. The indexes stay, because every write and every id on a page is keyed by the block's place in the declaration.
 * A block already not drawn is kept as it came, so a reader that runs this over the record's answer reads the record's
 * flag and judges only what the record drew.
 *
 * A PAGE AT ITS OWN ADDRESS (`own`) IS NEVER EMPTIED BY THIS: one whose every block would go keeps the first that says
 * anything, so a list page with nothing in it yet says its one sentence ("Nothing in Tasks yet.") under its title.
 *
 * A SECTION OVER NOTHING GOES WITH ITS BLOCKS: a heading whose every block in its column, up to the next section, is not
 * drawn heads nothing, a box included (the record's `emptyBoxesShut`, which this replaces). A section with no block
 * after it is the author's own divider, and one carrying a host panel holds that panel; both stay.
 */
export function emptyHidden<B extends Drawable>(blocks: readonly B[], own = false): B[] {
  const lead = leadOf(blocks);
  const out = blocks.map((b, n): B => {
    if (!on(b)) return b;
    const why = goneWhy(b) ?? (bare(b) && !(n === lead && saysEmpty(b)) ? 'empty' : null);
    return why ? ({ ...b, drawn: false, why } as B) : told(b);
  });
  /* A HEADING IS NOT WHAT A PAGE SAYS, and one over nothing goes below, so it does not count as something drawn. */
  if (own && !out.some((b) => on(b) && b.kind !== 'section')) {
    const first = blocks.findIndex((b) => on(b) && !FRAME.has(b.kind) && !gone(b));
    if (first >= 0) out[first] = told(blocks[first]!);
  }
  out.forEach((b, n) => {
    if (b.kind !== 'section' || !on(b) || says(b) || typeof b.panel === 'string') return;
    const under = headed(out, n);
    if (under.length > 0 && under.every((x) => !on(x))) out[n] = { ...b, drawn: false, why: 'empty' } as B;
  });
  return out;
}

/**
 * THE RECORD'S ANSWER, MARKED: `emptyHidden` at the page's own address, and a block its `when:` turned off saying so
 * (`why: 'when'`), so every reader of the answer, an agent's as much as the screen, draws the same blocks.
 */
export function markDrawn<B extends Drawable>(blocks: readonly B[], own = true): B[] {
  return emptyHidden(blocks.map((b) => (on(b) || b.why !== undefined ? b : ({ ...b, why: 'when' } as B))), own);
}

/**
 * ARRANGING STILL DRAWS EVERY BLOCK: while a page is arranged, or previewed as a change, a block that is empty today is
 * still one somebody is placing, so each block this rule left out is drawn again. A block whose `when:` said no stays
 * out, as it always has.
 */
export function arranged<B extends Drawable>(blocks: readonly B[]): B[] {
  return blocks.map((b) => {
    if (on(b) || b.why === undefined || b.why === 'when') return b;
    const { why: _left, ...rest } = b;
    return { ...rest, drawn: true } as unknown as B;
  });
}

/* ── the fold ──────────────────────────────────────────────────────────────── */

/** How many rows a block on a home draws before the rest fold under "N more", as Today folds its list. */
export const FOLD_AT = 8;

/** The kinds that are a list of rows, and so fold. A figure, a chart or a board is one picture and never cut. */
const FOLDS = new Set(['todo', 'timeline', 'feed', 'table', 'agents', 'list']);

/**
 * How many of `count` rows a block of `kind` draws, and how many are folded under it; `null` where nothing folds.
 *
 * NOT FOR ONE ROW: "1 more" under eight rows is a press that saves nobody any reading, so a block folds only when two or
 * more rows would go under the fold.
 */
export function foldOf(kind: string, count: number, open: boolean): { shown: number; more: number } | null {
  if (open || !FOLDS.has(kind) || count < FOLD_AT + 2) return null;
  return { shown: FOLD_AT, more: count - FOLD_AT };
}

/* ── the row cursor ────────────────────────────────────────────────────────── */

/**
 * The key the cursor holds each row by, in the order the page draws them: its block and its own id, or its place in the
 * block where it has none (`@n`).
 *
 * ONE KEY PER ROW, EVEN WHEN TWO LISTS IN ONE BLOCK NUMBER THEIR ROWS ALIKE. A prose block with two lists in it draws
 * `0 1 2` twice, and the cursor finds its row by key, so the fourth row read as the first and `j` went round the same
 * six rows of Kiln's notes for ever. A repeat is told apart by its place in the block, which no id can collide with.
 */
export function rowKeys(rows: readonly { slot: string; row: string | undefined }[]): string[] {
  const seen = new Set<string>();
  const n = new Map<string, number>();
  return rows.map(({ slot, row }) => {
    const at = n.get(slot) ?? 0;
    n.set(slot, at + 1);
    let key = `${slot}|${row ?? `@${at}`}`;
    if (seen.has(key)) key = `${slot}|@${at}`;
    seen.add(key);
    return key;
  });
}

/** The key of a block the cursor stops on as a whole, beside the rows' own (`rowKeys`). `@`, so no row id is it. */
export const wholeKey = (slot: string): string => `${slot}|@block`;

/**
 * The row `by` steps from `at` in a list of `count`, as Today moves: from nowhere, down is the first and up the last,
 * and the ends hold. `-1` is nowhere, and stays nowhere in an empty list.
 */
export function stepRow(count: number, at: number, by: number): number {
  if (count === 0) return -1;
  if (at < 0 || at >= count) return by > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, at + by));
}

/** The option a digit key answers, `1` to `9` as `0` to `8`, or `null` for any other key. */
export function optionOf(key: string): number | null {
  return /^[1-9]$/u.test(key) ? Number(key) - 1 : null;
}

/**
 * Where a row opens: the address it carries (`data-open`), else a row id of the shape `register#seq` or
 * `register:seq` as that row's own page, else nothing.
 */
export function openOf(open: string | undefined, row: string | undefined): string | null {
  if (open) return open;
  const m = row?.match(/^([a-z][\w-]*)[#:](\d+)$/u);
  return m ? `/r/${m[1]}/${m[2]}` : null;
}
