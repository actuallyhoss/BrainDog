/**
 * A declared page's two regions, a main column and a side rail, and the boxed runs inside each.
 *
 * THE DECLARATION IS STILL ONE LIST IN ONE ORDER. `layout: { rail: 4 }` on the page says the rail is four twelfths wide,
 * and a block that says `area: rail` sits in it; everything else is main. A layout is not a page in a page (`06 §7`):
 * nothing nests, nothing is placed by coordinates, and a phone reads the same list top to bottom with the rail after
 * the main column. So this file splits one list into two and never reorders either half.
 *
 * WHY A SPLIT AND NOT SPANS. Before this the only way to put blocks side by side was `span`, and a flow aligns rows: a
 * span-4 block beside a tall span-8 block leaves a hole under the short one, so three short blocks declared "beside"
 * one tall block were drawn under it (measured). A rail is its own stack, so its height is its own.
 *
 * PURE, SO `node --test` READS IT WITH NO SVELTEKIT. `PageBody.svelte` draws what this answers and decides nothing.
 */

import { COLUMNS, floorFor, spanOf, type Area, type Slot } from '../record/arrange.ts';

export type { Area };

/** The page's layout as the kernel admits it: the rail's width in twelfths, and whether it stays in view. */
export type Layout = { rail: number; sticky: boolean };

/* THE KERNEL'S BOUNDS (`declare.ts`, RAIL_MIN and RAIL_MAX), repeated because the app cannot import the kernel's source
   and a rail it would refuse must not be drawn at a width nobody chose. */
const RAIL_FEWEST = 3;
const RAIL_MOST = 5;

/**
 * The page's `layout`, or `null` for a page drawn as one column.
 *
 * ANYTHING THE KERNEL WOULD REFUSE IS ONE COLUMN, never a guess at a width. The install refuses `rail: 13` and
 * `sticky: 'yes'`, so a body carrying either came from an older record or a hand-set declaration, and the page it has
 * always drawn is the right fallback. Only `true` keeps the rail in view, because `'yes'` is truthy wherever it is read.
 */
export function layoutOf(page: unknown): Layout | null {
  const layout = page !== null && typeof page === 'object' ? (page as { layout?: unknown }).layout : undefined;
  if (layout === null || typeof layout !== 'object') return null;
  const { rail, sticky } = layout as { rail?: unknown; sticky?: unknown };
  if (typeof rail !== 'number' || !Number.isInteger(rail) || rail < RAIL_FEWEST || rail > RAIL_MOST) return null;
  return { rail, sticky: sticky === true };
}

/** The twelfths the main column takes, which are what a main block's `span` is a share of. */
export const mainSpan = (layout: Layout): number => COLUMNS - layout.rail;

/** The area a block's own `area` names, where anything but `rail` is the main column. */
const named = (area: unknown): Area => (area === 'rail' ? 'rail' : 'main');

const areaIn = (area: unknown, layout: Layout | null): Area => (layout ? named(area) : 'main');

/** The area a drawn block sits in on this page. The app's block type does not name `area`; the page read carries it. */
export const areaOf = (block: object, layout: Layout | null): Area => areaIn((block as { area?: unknown }).area, layout);

/**
 * A SECTION THAT DRAWS A HOST PANEL AND BOXES NOTHING IS A TILE OF ITS OWN, so it keeps the width its page gave it, as a
 * list does: the Agents page's At work beside Left for the next run. A heading is the whole row because it heads the
 * blocks after it; a panel's section heads nothing but its panel. Its floor is a list's (`PANEL_TILE`).
 */
const PANEL_TILE = 'feed';
const panelTile = (block: { kind: string }): boolean => {
  const b = block as { kind: string; panel?: unknown; box?: unknown };
  return b.kind === 'section' && typeof b.panel === 'string' && b.box !== true;
};

/**
 * A declared block's slot: its declared index `i`, its span clamped to what its KIND can survive, and `area: rail` when
 * it sits in the rail.
 *
 * THE CLAMP IS FOR DECLARATIONS THAT NEVER WENT THROUGH THE ARRANGE CONTROL. A declaration arrives from a pack, and a
 * pack is a thing a stranger wrote, so a `table` that says `span: 2` is a table somebody will read as broken; the
 * renderer knows the floor per kind (13 §4.1's three width classes), and the page honours it rather than drawing eight
 * columns in a sixth of a page. The control refuses below the floor instead of clamping, because a control that
 * silently corrects you teaches nothing.
 *
 * NO `area` KEY FOR A MAIN BLOCK, so a page with no layout makes exactly the slots it always made, and a Done that moved
 * nothing compares them equal. Here and not in the reader, because the page body lays blocks out with it and the
 * arrange controls begin and add with it, and the two must agree.
 */
export function slotOf(block: { kind: string; span?: number | undefined; columns: readonly unknown[] }, i: number, layout: Layout | null): Slot {
  const span = panelTile(block) ? spanOf(PANEL_TILE, block.span) : spanOf(block.kind, block.span, block.columns.length);
  return areaOf(block, layout) === 'rail' ? { i, span, area: 'rail' } : { i, span };
}

/**
 * The blocks in each area, each in declared order.
 *
 * A PAGE WITH NO LAYOUT IS ALL MAIN, whatever its blocks say. The kernel refuses `area: rail` there, so a block that
 * carries it is from a body the install did not check, and drawing it in a rail nobody declared would put it in a
 * column the page does not have.
 *
 * `read` names where a drawn item keeps its area, because the page draws `{ slot, block }` pairs and the arrangement's
 * slot, not the declaration, is what says where a block is while somebody is moving it.
 */
export function splitAreas<T>(
  blocks: readonly T[],
  layout: Layout | null,
  read: (b: T) => unknown = (b) => (b as { area?: unknown }).area,
): { main: T[]; rail: T[] } {
  const main: T[] = [];
  const rail: T[] = [];
  for (const b of blocks) (areaIn(read(b), layout) === 'rail' ? rail : main).push(b);
  return { main, rail };
}

/** A run of blocks drawn together: on one surface when a boxed section opened it, loose otherwise. */
export type Run<T> = { box: boolean; items: T[] };

/**
 * The runs an area's blocks draw in: a `section` with `box: true` and the blocks after it up to the next section share
 * one surface; everything else is loose, as it always was.
 *
 * THE SECTION IS INSIDE ITS OWN BOX, as the box's heading. That is how a sentence and the three columns under it become
 * one block of the first screen without a page in a page: the surface is drawn round blocks that are still separate
 * blocks in the one list, each with its own query and its own failure.
 *
 * A BOX NEVER CROSSES AREAS, because this is called on one area at a time. A boxed section in the main column holds the
 * main blocks after it, and a rail block declared between them stays in the rail.
 *
 * ONLY `true` BOXES, for the reason only `true` makes a rail sticky. And a page with no boxed section comes back as one
 * loose run, which is the page as it was drawn before boxes existed.
 *
 * A BLOCK THAT `joins` IS DRAWN ON THE SURFACE OF THE ONE BEFORE IT, and the two are a box of their own that takes
 * nothing after them. Nobody declares it: Home sets it on a drawn block (`default-home.ts`, the late money under the
 * late tasks), so one tile says one thing from two reads. Inside a boxed section it is already on that surface.
 */
export function boxesOf<T>(
  blocks: readonly T[],
  read: (b: T) => { kind?: unknown; box?: unknown; joins?: unknown } = (b) => b as { kind?: unknown; box?: unknown; joins?: unknown },
): Run<T>[] {
  const runs: Run<T>[] = [];
  /* THE RUN TWO JOINED BLOCKS MADE, which ends with them. */
  let joined: Run<T> | null = null;
  for (const b of blocks) {
    const { kind, box, joins } = read(b);
    const last = runs.at(-1);
    if (joins === true && last && (last.box || last === joined)) last.items.push(b);
    else if (joins === true && last) {
      const before = last.items.pop()!;
      if (last.items.length === 0) runs.pop();
      joined = { box: true, items: [before, b] };
      runs.push(joined);
    } else if (kind === 'section' && box === true) runs.push({ box: true, items: [b] });
    else if (kind === 'section' && last?.box) runs.push({ box: false, items: [b] });
    else if (last && last !== joined) last.items.push(b);
    else runs.push({ box: false, items: [b] });
  }
  return runs;
}

/**
 * Whether the rail stays in view while the main column scrolls: asked for, measured, and no taller than the room.
 *
 * A STICKY RAIL TALLER THAN THE WINDOW HIDES ITS OWN FOOT. It stays pinned while the main column scrolls, so the blocks
 * at its end cannot be reached until the main column runs out. So `sticky: true` is a request, honoured when the rail
 * fits; `rail` is its drawn height and `room` the height it would have under the page's sticky head. Nought is a rail
 * not yet measured, which is not sticky, so the first frame draws it in the flow like any other column.
 */
export const sticks = (layout: Layout | null, rail: number, room: number): boolean =>
  layout?.sticky === true && rail > 0 && rail <= room;

/** What `widened` reads off a block in a flow: its span in force, and whether the record drew it. */
export type Placed = { readonly span: number; readonly drawn: boolean };

/**
 * The span each block of one twelve-column flow is drawn at, once the blocks the record did not draw are gone.
 *
 * A ROW THE AUTHOR FILLED STAYS FILLED. Work declares Late and This week at six each, and each says `when:` it holds a
 * task, so on a day with only one of them the other half of the row was an empty hole beside it, and the flow then
 * pulled the next row's first tile up beside it. The rows are read as the author declared them, hidden blocks
 * included, packed the way the grid packs (a block that does not fit in what is left of a row starts the next); a row
 * whose declared spans make the whole twelve, and which lost some of its blocks, gives their room to the ones still
 * drawn, each in proportion to its own span. One half left of two halves is the whole row; two thirds left of three are
 * halves.
 *
 * A ROW THAT WAS NEVER WHOLE IS LEFT AS IT WAS: a six declared alone before a twelve is half the page by choice.
 *
 * Hidden blocks keep their span (nothing draws them). PURE, so `layout.test.ts` holds the rule.
 */
export function widened(blocks: readonly Placed[], columns: number = COLUMNS): number[] {
  const out = blocks.map((b) => b.span);
  const spans = blocks.map((b) => Math.min(Math.max(1, b.span), columns));
  let row: number[] = [];
  let used = 0;
  const close = () => {
    const shown = row.filter((n) => blocks[n]!.drawn);
    const kept = shown.reduce((sum, n) => sum + spans[n]!, 0);
    if (used === columns && shown.length > 0 && shown.length < row.length) {
      let left = columns;
      shown.forEach((n, k) => {
        const span = k === shown.length - 1 ? left : Math.max(1, Math.floor((spans[n]! * columns) / kept));
        out[n] = span;
        left -= span;
      });
    }
    row = [];
    used = 0;
  };
  spans.forEach((span, n) => {
    if (used + span > columns) close();
    row.push(n);
    used += span;
  });
  close();
  return out;
}

/**
 * What `paired` reads off a block in a flow: its kind, its span in force, whether it is drawn, whether it leads the
 * page, and whether its author gave it a width of its own (`declared`), the whole row included.
 */
export type Pairable = Placed & { readonly kind: string; readonly columns?: number; readonly lead?: boolean; readonly declared?: boolean };

/**
 * THE WIDTH OF THE WORK COLUMN FROM WHICH A FLOW OF FULL-WIDTH BLOCKS IS TWO COLUMNS: a 1,512 or
 * 1,728 laptop drawn with every list as wide as the window is lines stretched across the screen, not the screen used.
 *
 * THE COLUMN'S OWN WIDTH, MEASURED, NOT THE WINDOW'S (`PageBody.svelte`): the rail and a docked panel each take a column
 * of their own beside it. 1,100 is a 1,440 window with the rail open and nothing docked, about 1,140 inside its gutters,
 * so each half is at least 540; with a panel open at 1,440 (about 700) or at 1,728 (about 950) the page is one column.
 */
export const PAIR_FROM = 1100;

/**
 * AND THE WIDTH OF THE WORK COLUMN UNDER WHICH THE PAGE IS ONE COLUMN, whatever the blocks' spans say: what a 900 window
 * gives the work inside its gutters, where every page is one column anyway (`PageBody.svelte`'s `width < 900px`).
 *
 * THE COLUMN AND NOT THE WINDOW, as with `PAIR_FROM`. A 1,280 window with a panel docked leaves the work 650 to 880, the
 * room of a window under 900, and read off the window the page set its halves 290 to 400 wide beside the panel, where the
 * same room with no panel stacks them.
 */
export const ONE_UNDER = 860;

/**
 * THE KINDS THAT ARE NEVER HALF A ROW, whatever their floor: a heading, a field to type into, the page's own controls,
 * and the pictures whose whole point is their width. Everything else that survives half a row (`floorFor` under six) may
 * sit beside its neighbour.
 */
const WHOLE_ROW = new Set(['section', 'capture', 'inputs', 'cards', 'gallery', 'heat']);

/**
 * The span each block of one twelve-column flow is drawn at on a wide screen: two blocks the author left at the whole
 * row, one after the other, and each happy at half of it, become two halves side by side.
 *
 * TWO COLUMNS OF BLOCKS, NOT STARVED LINES. The page is drawn edge to edge, so a list at the whole row
 * of a 1,728 window is a line nobody reads to its end. Paired, each keeps a measure a person reads, and the screen is
 * used; the prose inside a block still keeps its own measure (`--measure`).
 *
 * IN DECLARED ORDER, NEVER REORDERED: a block that may not be halved (a heading, a table, a forecast, the page's line)
 * stands on its own row and starts the pairing again after it, so a section's blocks pair under their heading. One left
 * over keeps the whole row rather than sitting beside a hole. A block the author gave a width of their own keeps it, and
 * a hidden block takes no place.
 *
 * `span: 12` WRITTEN DOWN IS A WIDTH OF THEIR OWN TOO (`declared`). Work declares Late at the whole row and was drawn
 * as half of one beside At a glance, a tile of one line stretched to its neighbour's height. Only a block that names
 * no width at all is the page's to halve. PURE, so `layout.test.ts` holds the rule.
 */
export function paired(blocks: readonly Pairable[], columns: number = COLUMNS): number[] {
  const out = blocks.map((b) => b.span);
  const half = columns / 2;
  let waiting: number | null = null;
  blocks.forEach((b, n) => {
    if (!b.drawn) return;
    const fits = b.span >= columns && b.declared !== true && b.lead !== true && !WHOLE_ROW.has(b.kind) && floorFor(b.kind, b.columns ?? 0) < half;
    if (!fits) {
      waiting = null;
      return;
    }
    if (waiting === null) {
      waiting = n;
      return;
    }
    out[waiting] = half;
    out[n] = half;
    waiting = null;
  });
  return out;
}

/**
 * THE WIDTHS A TILE MAY HAVE ON THE BOARD: a quarter, a third, a half, two thirds and the whole row.
 * "One board": every tile lines up with the tiles above and below it, which a page of fives and sevens never did.
 */
export const TILE_SPANS: readonly number[] = [12, 8, 6, 4, 3];

/** The nearest width a tile may have, the wider of two as near. */
const nearest = (span: number): number =>
  TILE_SPANS.reduce((best, s) => (Math.abs(s - span) < Math.abs(best - span) ? s : best), TILE_SPANS[0]!);

/**
 * The widths a row of tiles takes, as near the widths asked as the board's own allow: a row that made the whole twelve
 * still does, and one that did not stays within it. The fewest steps away wins, then the row whose narrower and wider
 * tiles are where the author put them, then the wider row. A row of more than four is quarters, and wraps, since five tiles in a row is no row the board draws.
 */
function snapRow(spans: readonly number[], columns: number): number[] {
  const asked = spans.reduce((a, b) => a + b, 0);
  if (spans.length > 4) return spans.map(() => 3);
  /* HOW FAR A ROW STRAYS FROM THE SHAPE ASKED: a narrower tile beside a wider one stays the narrower. */
  const shape = (out: readonly number[]): number =>
    out.slice(1).reduce((n, s, k) => n + Math.abs(Math.sign(s - out[k]!) - Math.sign(spans[k + 1]! - spans[k]!)), 0);
  let best: { out: number[]; off: number; bent: number; sum: number } | null = null;
  const walk = (at: number, out: number[], off: number, sum: number) => {
    if (sum > columns) return;
    if (at === spans.length) {
      if (asked === columns && sum !== columns) return;
      const bent = shape(out);
      const b = best as { off: number; bent: number; sum: number } | null;
      if (!b || off < b.off || (off === b.off && (bent < b.bent || (bent === b.bent && sum > b.sum)))) best = { out: [...out], off, bent, sum };
      return;
    }
    for (const s of TILE_SPANS) walk(at + 1, [...out, s], off + Math.abs(s - spans[at]!), sum + s);
  };
  walk(0, [], 0, 0);
  return (best as { out: number[] } | null)?.out ?? spans.map(nearest);
}

/**
 * The span each block of one twelve-column flow is drawn at on the board: the spans in force (declared, `widened`,
 * `paired`), packed into rows the way the grid packs them, each row put on the board's widths (`TILE_SPANS`). Hidden
 * blocks keep their span and take no place. PURE, so `layout.test.ts` holds the rule.
 */
export function snapped(blocks: readonly Placed[], columns: number = COLUMNS): number[] {
  const out = blocks.map((b) => b.span);
  let row: number[] = [];
  let used = 0;
  const close = () => {
    if (row.length === 0) return;
    const got = snapRow(
      row.map((n) => Math.min(Math.max(1, blocks[n]!.span), columns)),
      columns,
    );
    row.forEach((n, k) => (out[n] = got[k]!));
    row = [];
    used = 0;
  };
  blocks.forEach((b, n) => {
    if (!b.drawn) return;
    const span = Math.min(Math.max(1, b.span), columns);
    if (used + span > columns) close();
    row.push(n);
    used += span;
  });
  close();
  return out;
}

/**
 * The board's two columns on a page with a rail: two thirds and a third, whatever the declaration's rail (3 to 5) asks,
 * since a rail of five beside seven is two widths the board does not have.
 */
export const boardRail = (layout: Layout): { main: number; rail: number } => {
  const [main, rail] = snapRow([mainSpan(layout), layout.rail], COLUMNS);
  return { main: main!, rail: rail! };
};

/** What the two rules below read off a block of the main column: its kind, whether it is drawn, and how it sits. */
export type Opening = { readonly kind: string; readonly drawn: boolean; readonly lead?: unknown; readonly box?: unknown; readonly joins?: unknown };

/**
 * WHICH BLOCK IS THE LINE A PAGE OPENS ON TO TYPE INTO, which the page's header holds beside its name as Today's does
 * (`home/HeadCapture.svelte`), or `-1`. Work spent a whole tile on "What needs doing?", over everything the page is for.
 *
 * A LONE CAPTURE, FIRST: the first block the main column draws after the page's sentence, standing on its own. One
 * under a heading, on a surface with other blocks (`joins`), or further down the page is where its author put it and
 * stays there. `blocks` is the main column in the order it is read; the answer is a place in it.
 */
export function headCaptureAt(blocks: readonly Opening[]): number {
  const drawn = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.drawn);
  const at = drawn.findIndex((x) => !(x.b.kind === 'note' && x.b.lead === true));
  const first = drawn[at];
  if (at < 0 || !first || first.b.kind !== 'capture' || first.b.joins === true) return -1;
  /* ONLY THE PAGE'S SENTENCE MAY STAND BEFORE IT, and nothing joins its surface after it. */
  if (at > 1 || drawn[at + 1]?.b.joins === true) return -1;
  return first.i;
}

/** THE PICTURES A PAGE LEADS WITH: a line or bars over time, wide and short, which a phone reads whole in its one column. */
const LEAD_CHARTS = new Set(['forecast', 'series', 'lines', 'bridge']);

/**
 * WHICH BLOCK OF THE MAIN COLUMN A PHONE DRAWS BEFORE THE SIDE COLUMN, or `-1`: the chart the main column opens on.
 *
 * A PHONE DRAWS A PAGE'S SIDE COLUMN FIRST (`PageBody.svelte` `railFirst`), since its blocks are the page at a glance.
 * On Money that put when the cash runs out, the accounts and three questions over Cash ahead, the picture the page is
 * about, a screen and a half down. The chart a page opens on is the page, so it comes first, then the side column, then
 * the rest. Only a chart standing on its own: one inside a boxed section or joined to its neighbour stays with them.
 */
export function leadChartAt(blocks: readonly Opening[]): number {
  const at = blocks.findIndex((b) => b.drawn);
  const first = blocks[at];
  if (!first || !LEAD_CHARTS.has(first.kind) || first.box === true || first.joins === true) return -1;
  return blocks.slice(at + 1).find((b) => b.drawn)?.joins === true ? -1 : at;
}

/** What `railDrawn` reads off a block: the area it sits in and whether its `when:` let it be drawn. */
export type Drawn = { readonly area?: unknown; readonly drawn: boolean };

/**
 * THE TWO COLUMNS AS THEY ARE DRAWN: how many twelfths the main column takes and how many the side rail takes, where
 * `0` is a column that is not drawn at all.
 *
 * A COLUMN WHOSE EVERY BLOCK SAID NO TO `when:` IS NOT DRAWN, as an empty one is not, and the other takes the whole
 * board. A side rail whose only block is hidden is no rail: the main column is twelve wide, not eight beside a third of
 * nothing. This was the page's own arithmetic (`PageBody.svelte`) with no test at all; here it is pure, so the rule
 * sheet's Layout page and `layout.test.ts` hold it. Both drawn, the board's own two thirds and a third (`boardRail`).
 * A page with no layout is one column, whatever its blocks say.
 */
export function railDrawn(layout: Layout | null, blocks: readonly Drawn[]): { main: number; rail: number } {
  if (!layout) return { main: blocks.some((b) => b.drawn) ? COLUMNS : 0, rail: 0 };
  const shown = (area: Area): boolean => blocks.some((b) => b.drawn && areaIn(b.area, layout) === area);
  const main = shown('main');
  const rail = shown('rail');
  if (main && rail) return boardRail(layout);
  return { main: main ? COLUMNS : 0, rail: rail ? COLUMNS : 0 };
}

/** What `flowAfterRail` reads off a block of the main column: its drawn height, and its top in the column where measured. */
export type Measured = { readonly height: number; readonly top?: number };

/**
 * WHERE THE SIDE COLUMN CLOSES: the index of the first main block that starts below the rail's last tile, or
 * `main.length` when none does. "No narrow column floating in empty space": Money's side column
 * ended while its main column ran on at two thirds, so the right third of the board was bare below the first screen.
 * The blocks from here on are drawn across the whole board under both columns (`areasWithFlow`).
 *
 * A BLOCK'S `top` IS ITS MEASURED PLACE IN THE MAIN COLUMN, so two halves of one row share it and the column never
 * closes between them, nor inside a boxed run, whose blocks are measured by their one surface. A block with no `top`
 * (one already drawn after the rail, at another width) starts one `gap` under the lowest foot before it, which is
 * where it would stand back in the column. With nothing measured, every top is that stack.
 *
 * NOTHING FLOWS with no rail (`railHeight` nought), with a rail as tall as the whole main column, or at the first
 * block, since a main column with nothing beside the rail is not a column. PURE, so `layout-flow.test.ts` holds it.
 */
export function flowAfterRail(main: readonly Measured[], railHeight: number, gap: number): number {
  if (!(railHeight > 0)) return main.length;
  let foot = 0;
  for (let k = 0; k < main.length; k++) {
    const block = main[k]!;
    const top = block.top ?? (k === 0 ? 0 : foot + gap);
    if (k > 0 && top >= railHeight) return k;
    foot = Math.max(foot, top + Math.max(0, block.height));
  }
  return main.length;
}

/**
 * The main column split where the side column closes: the blocks drawn beside the rail, and the blocks after it, which
 * take all twelve columns of the board and are paired as whole rows are (`paired`). Declared order is kept: the first
 * block after is the one under the last beside. An index that flows nothing, or everything, leaves the column whole.
 */
export function areasWithFlow<T>(main: readonly T[], at: number): { beside: T[]; after: T[] } {
  if (at <= 0 || at >= main.length) return { beside: [...main], after: [] };
  return { beside: main.slice(0, at), after: main.slice(at) };
}

/**
 * WHERE EACH PAGE'S SIDE COLUMN LAST CLOSED, by page and width, for the tab: a page opened again is laid out with its column
 * closed from its first layout, and is not laid out tall and then again short (Money, 2098 then 1394 tall).
 */
export const keptFlow = new Map<string, number>();
