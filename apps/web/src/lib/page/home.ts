/**
 * What a declared page does differently when it is a home: the blocks that hold nothing are not drawn, a long block is
 * folded in place, and the keys walk the rows of every block rather than the blocks.
 *
 * ONE RULE FOR EVERY HOME, AND NOT A LIST OF SOURCES. Home hid its figures when no pack pinned one and its runs when no
 * agent was working, by name (`lib/home/default-home.ts` `homeBlocks`). Today drawn as a declared page has more blocks
 * that are empty on most days, and a use case's home has its own, so the rule is said once about any block: a block
 * that holds nothing is not drawn, and the one sentence its author wrote for that is drawn only where it is what the
 * page leads with (`leadOf`). DIRECTION §35: an empty or unused part is not drawn; §37: one empty line a page.
 *
 * PURE, AND NODE LOADS IT (type imports only), so `home.test.ts` holds each rule without a component.
 */

import type { Metric } from '../record/api.ts';
import type { LiveBlock } from '../record/page-live.ts';

/**
 * THE KINDS WHOSE EMPTINESS IS THE POINT, never hidden: a sentence, a heading, a field to type into, and the kinds whose
 * rows are written on the declaration rather than read from a list. A capture with nothing under it is the way to add
 * the first thing; a path with no steps is where the first step is added.
 */
const KEPT = new Set(['note', 'section', 'capture', 'inputs', 'steps', 'quote', 'code', 'tree', 'embed', 'link', 'gallery']);

/** A block the record refused, or this build cannot draw: it draws its own sentence and is never called empty. */
export const says = (b: LiveBlock): boolean => b.refusals.length > 0 || b.cannot !== undefined;

/**
 * A FIGURE THAT SAYS NOTHING ON A PAGE BEING READ: one that adds up a field no row has filled in (`unsaid`), and one over
 * a list that holds no row at all (`nothingHeld`), whose zero the record calls not news. A row of figures drops each,
 * and a row of nothing else holds nothing.
 */
const idle = (m: Metric): boolean => m.unsaid === true || m.nothingHeld === true;

/**
 * Whether a block answered nothing at all: no row, figure, question, line of the feed, step of a walk or version.
 *
 * EVERY SHAPE AN ANSWER COMES IN IS ASKED, because a kind holds what it holds in its own field: a stat its `metrics`,
 * a queue its `queue`, a forecast its `walk`. A block a registered kind draws (`answer`) is never called empty here,
 * because only its own module can read what it holds.
 */
export function holdsNothing(b: LiveBlock): boolean {
  if (b.answer !== undefined) return false;
  /* A BLOCK WITH NO SOURCE IS DRAWN FROM ITS DECLARATION (its `body`), so it holds what its author wrote. */
  if (typeof b.body === 'string' && b.body.trim() !== '') return false;
  return (
    b.rows.length === 0 &&
    b.entries.length === 0 &&
    b.total === 0 &&
    (b.metrics ?? []).every(idle) &&
    (b.measures?.length ?? 0) === 0 &&
    (b.readOnce?.length ?? 0) === 0 &&
    (b.queue?.length ?? 0) === 0 &&
    (b.feed?.length ?? 0) === 0 &&
    (b.actions?.length ?? 0) === 0 &&
    (b.history?.length ?? 0) === 0 &&
    (b.walks?.length ?? 0) === 0 &&
    b.walk == null &&
    b.bars == null &&
    /* A FIGURE THAT READ NO ROW, no part and no whole, holds nothing as a list of none does. */
    (b.parts == null || (b.parts.groups.length === 0 && !b.parts.value))
  );
}

/** Whether a block has nothing to draw but its `empty:` line: it holds nothing, and is not a kind whose emptiness is the point. */
export const bare = (b: LiveBlock): boolean => !says(b) && !KEPT.has(b.kind) && holdsNothing(b);

/** Whether the author wrote what the block says when it holds nothing. A blank sentence says nothing. */
const saysEmpty = (b: LiveBlock): boolean => typeof b.empty === 'string' && b.empty.trim() !== '';

/** A value somebody wrote: not nothing, not an empty string and not an empty list. */
const isSet = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/**
 * THE COLUMNS A CHART IS MADE OF, by place: a bar and a split name each part by the first and add up the second, chips
 * count by the first, and a gauge and a progress fill by the second. A list draws its rows' names whatever else is
 * empty, so a list is never one of these.
 */
const PICTURED: Readonly<Record<string, readonly number[]>> = { bar: [0, 1], split: [0, 1], chips: [0], gauge: [1], progress: [1] };

/**
 * A RANGE IS MADE OF ITS BANDS, the low and the high (`range: true`, `label | spent | low | high`). What was spent is a
 * mark on a band that may not be there yet, which the band says as "Not spent", so a range nothing is spent on is still
 * every band it was given.
 */
const BANDS: readonly number[] = [2, 3];

/**
 * WHETHER A BLOCK READS WHAT NO ROW HAS SAID: a chart over rows of which not one holds a column the chart is made of, or
 * a figure's parts when no row the figure read sits in any part. It draws one part that is all of it, "Not said yet",
 * or a bar of nothing over its empty line, and both say only that a field is empty on every row. On the founder's
 * Projects, no project has a health, a revenue or a day it aims for (the import kept those in each note), and "How
 * they are going" was one grey track of eleven over "Not said yet" (`loop/research-real-record.md`). DIRECTION §35: an
 * empty or unused part is not drawn.
 *
 * A COLUMN THAT NAMES NO FIELD IS NOT ASKED ABOUT, and a block the record refused, or drew from a registered kind's
 * answer, is not this rule's to judge.
 *
 * AND A ROW OF FIGURES EVERY ONE OF WHICH ADDS UP A FIELD NOBODY FILLED IN (`Metric.unsaid`): "Earning £0" over projects
 * none of which says what it earns. A row with some such figures keeps the others (`emptyHidden`).
 */
export function unsaid(b: LiveBlock): boolean {
  if (says(b) || b.answer !== undefined) return false;
  if (b.parts) {
    /* ROWS READ AND NONE IN A PART: a whole and no group. A figure that read no row at all holds nothing (`holdsNothing`),
       and keeps its empty line where it leads the page. */
    const { groups, value } = b.parts;
    if (groups.length === 0) return typeof value === 'number' && value !== 0;
    return groups.every((g) => g.value === null && !g.parts?.length);
  }
  if (b.metrics?.length) return b.metrics.every((m) => m.unsaid === true);
  const at = b.kind === 'progress' && (b as { range?: unknown }).range === true ? BANDS : PICTURED[b.kind];
  if (!at || b.matched.length === 0) return false;
  return at.some((n) => {
    const field = b.columns[n]?.field;
    return typeof field === 'string' && field !== '' && !b.matched.some((e) => isSet(e.fields[field]));
  });
}

/** The kinds that frame a page rather than say anything on it: a heading over blocks, and a field to type into. */
const FRAME = new Set(['section', 'capture', 'inputs']);

/**
 * Whether a page being read leaves a block out wherever it stands: this build cannot draw it from the record yet, or
 * what it reads no row has said (`unsaid`).
 *
 * A BLOCK THIS BUILD CANNOT DRAW IS NOT THE READER'S TO FIX, so outside authoring it is not drawn: "This part of the
 * page cannot be drawn from the record yet" under "Working now" told a person about our build, not their record. A
 * block the record REFUSED is still drawn, because its sentence names the fix in the declaration and somebody has to
 * see it. While a page is arranged every block is drawn, `PageBody` does not ask this then.
 */
const gone = (b: LiveBlock): boolean => (b.cannot !== undefined && b.refusals.length === 0) || unsaid(b);

/**
 * THE PAGE'S LEAD, WHICH IS THE ONE BLOCK THAT MAY SAY IT IS EMPTY: the first block the record drew that says anything,
 * a heading and a field to type into aside, whether that is what it holds or the `empty:` line its author wrote. `-1`
 * when no block says anything.
 *
 * ONE EMPTY LINE A PAGE, NEVER ONE A TILE (DIRECTION §37). Every block on Work carries an `empty:`, so a list with
 * nothing in it drew eight to twelve tiles each saying it held nothing ("Nothing due today.", "Nothing of yours is
 * late.", "No agent holds a task."), and Today drew "No organisation lists an account yet" under the cash it had just
 * said. A page whose lead holds something draws no empty line at all; a page whose lead holds nothing draws that one,
 * with the field to add the first thing, and nothing else that is empty.
 */
export function leadOf(blocks: readonly LiveBlock[]): number {
  return blocks.findIndex((b) => b.drawn && !FRAME.has(b.kind) && !gone(b) && (!bare(b) || saysEmpty(b)));
}

/**
 * THE BLOCKS AS A PAGE IS READ, a home or any other: the same list at the same indexes, a block that holds nothing or
 * cannot be drawn marked not drawn, as a block whose `when:` said no already is. The indexes stay, because every write and every id on the page is keyed by
 * the block's place in the declaration. A block that holds nothing keeps its `empty:` line only where it is the page's
 * lead (`leadOf`).
 *
 * A PAGE AT ITS OWN ADDRESS (`own`) IS NEVER EMPTIED BY THIS: one whose every block would go keeps the first the record
 * drew, which says its one sentence ("Nothing in Tasks yet."), so a list page with nothing in it yet says so rather than
 * drawing a title over nothing. It kept every block it had, each saying it held nothing.
 *
 * A SECTION OVER NOTHING GOES WITH ITS BLOCKS: a heading whose every block, up to the next section, is not drawn
 * heads nothing. A section with no block after it at all is the author's own divider and stays.
 */
export function emptyHidden<B extends LiveBlock>(blocks: readonly B[], own = false): B[] {
  const lead = leadOf(blocks);
  /* A FIGURE OVER A FIELD NOBODY FILLED IN, OR OVER A LIST THAT HOLDS NOTHING, GOES FROM ITS ROW, and the figures beside
     it stay. A row of nothing but such figures keeps none, and says its `empty:` line in their place. */
  const told = (b: B): B => (b.metrics?.some(idle) ? { ...b, metrics: b.metrics.filter((m) => !idle(m)) } : b);
  const out = blocks.map((b, n) => {
    if (!b.drawn) return b;
    if (gone(b) || (bare(b) && !(n === lead && saysEmpty(b)))) return { ...b, drawn: false };
    return told(b);
  });
  /* A HEADING IS NOT WHAT A PAGE SAYS, and one over nothing goes below, so it does not count as something drawn. */
  if (own && !out.some((b) => b.drawn && b.kind !== 'section')) {
    const first = blocks.findIndex((b) => b.drawn && !FRAME.has(b.kind) && !gone(b));
    if (first >= 0) out[first] = told(blocks[first]!);
  }
  out.forEach((b, n) => {
    if (b.kind !== 'section' || !b.drawn || says(b)) return;
    const end = out.findIndex((x, m) => m > n && x.kind === 'section');
    const under = out.slice(n + 1, end === -1 ? undefined : end);
    if (under.length > 0 && under.every((x) => !x.drawn)) out[n] = { ...b, drawn: false };
  });
  return out;
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
