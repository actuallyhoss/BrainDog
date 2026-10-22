/**
 * Where a page's waiting questions sit when the page is about something else.
 *
 * A QUESTION NEVER LEADS A PAGE WHOSE SUBJECT IS SOMETHING ELSE. Money opened on three questions drawn whole, each a
 * tile of options, and its cash, its accounts and what is due were under the fold: the engine's look put the queue
 * first because it is what needs the person, and Money's own declaration did too. The questions are still on the page,
 * answered where they are shown, but drawn compact and placed where the eye meets them after the page's own figures:
 * in the side column on a page with one; on a wide page with none, as a side tile beside the figure that opens it (a
 * third of the row, the figure the rest), so the first screen holds the figure and the questions side by side; else
 * straight after the figures that open the main column.
 *
 * A PAGE THAT IS ITS QUESTIONS KEEPS THEM FIRST: a queue that says `lead: true` (Decide's lead question), and a page
 * that draws nothing else.
 *
 * A VIEW OVER THE ORDER, as the look is (`look.ts`): every block keeps its declared index, so every id and write on the
 * page still finds it. PURE, so `asks.test.ts` holds the rule.
 */

import { KINDS, isKind } from 'braindog-render';
import { COLUMNS, floorFor } from '../record/arrange.ts';

/** What the rule reads off a block: its kind, whether it is drawn, whether it leads, opens a box, joins the one before, and its column. */
export type Asked = {
  readonly kind: string;
  readonly drawn: boolean;
  readonly lead?: boolean;
  readonly box?: boolean;
  readonly joins?: boolean;
  readonly area: 'main' | 'rail';
  /** Its span in force, where the page may set the questions beside it. */
  readonly span?: number;
};

/** THE SIDE TILE ON A WIDE PAGE WITH NO SIDE COLUMN: the questions take a third of the row, the figure the rest. */
export const BESIDE = 4;

/** The blocks that open a page without being what it is about: its line, the line a row is typed into, a form. */
const opens = (b: Asked): boolean => !b.drawn || (b.kind === 'note' && b.lead === true) || b.kind === 'capture' || b.kind === 'inputs';

/** A figure or a chart of the page's own, which the questions come after. */
const isFigure = (b: Asked): boolean => isKind(b.kind) && KINDS[b.kind].purpose === 'figure' && b.kind !== 'inputs';

/** A question waiting on the reader that is not the page's own lead. */
const isAsk = (b: Asked): boolean => b.kind === 'queue' && b.lead !== true;

/**
 * The place in `list` (one column, in drawing order) the questions go after: past the page's opening, then past the
 * figures that open it, else past the first thing it draws, a heading with every block under it, a block with the one
 * it joins. `-1` where the column draws nothing to go after.
 */
function anchorIn(list: readonly number[], blocks: readonly Asked[]): number {
  let at = 0;
  while (at < list.length && opens(blocks[list[at]!]!)) at++;
  if (at >= list.length) return -1;
  const first = blocks[list[at]!]!;
  let end = at;
  if (isFigure(first)) {
    /* THE FIGURES THAT OPEN THE COLUMN, and what is not drawn among them. */
    while (end + 1 < list.length && (isFigure(blocks[list[end + 1]!]!) || !blocks[list[end + 1]!]!.drawn)) end++;
  } else if (first.kind === 'section') {
    /* A HEADING AND ITS BLOCKS, UP TO THE NEXT HEADING, so a question is never drawn inside a box or under a heading. */
    while (end + 1 < list.length && blocks[list[end + 1]!]!.kind !== 'section') end++;
  }
  /* A BLOCK THAT JOINS THE ONE BEFORE IT IS ON ITS SURFACE (`layout.ts` `boxesOf`), and stays with it. */
  while (end + 1 < list.length && blocks[list[end + 1]!]!.joins === true) end++;
  /* THE LAST DRAWN BLOCK OF THE RUN, so the questions sit straight under what the eye just read. */
  while (end > at && !blocks[list[end]!]!.drawn) end--;
  return end;
}

/**
 * The order with the page's waiting questions moved out of its lead, and which of them are drawn in the side column
 * (`rail`) and compact (`compact`), by declared index.
 *
 * `order` is the look's order (`lookOrder`); `rail` is whether the page draws a side column.
 */
export function asksAside(
  blocks: readonly Asked[],
  order: readonly number[],
  rail: boolean,
  wide = false,
): { order: number[]; rail: ReadonlySet<number>; compact: ReadonlySet<number>; spans: ReadonlyMap<number, number> } {
  const same = { order: [...order], rail: new Set<number>(), compact: new Set<number>(), spans: new Map<number, number>() };
  const asks = order.filter((i) => isAsk(blocks[i]!));
  if (!asks.some((i) => blocks[i]!.drawn)) return same;
  const rest = order.filter((i) => !isAsk(blocks[i]!));
  /* A PAGE THAT DRAWS NOTHING BUT ITS QUESTIONS IS ABOUT THEM. */
  if (!rest.some((i) => !opens(blocks[i]!))) return same;
  const side = rail ? rest.filter((i) => blocks[i]!.area === 'rail') : [];
  const toRail = side.some((i) => blocks[i]!.drawn);
  const column = toRail ? side : rest.filter((i) => blocks[i]!.area !== 'rail');
  const anchor = anchorIn(column, blocks);
  if (anchor < 0) return same;
  /* BESIDE THE FIRST FIGURE, on a wide page with no side column, when that figure has the whole row and keeps what it
     needs in two thirds of it. The first question tile takes the third; any after it go on under. */
  const first = column.find((i) => !opens(blocks[i]!));
  const lead = first === undefined ? undefined : blocks[first]!;
  const beside =
    wide && !toRail && first !== undefined && lead !== undefined && isFigure(lead) && (lead.span ?? COLUMNS) >= COLUMNS && floorFor(lead.kind) <= COLUMNS - BESIDE;
  const after = rest.indexOf(beside ? first! : column[anchor]!);
  const shown = asks.find((i) => blocks[i]!.drawn);
  return {
    order: [...rest.slice(0, after + 1), ...asks, ...rest.slice(after + 1)],
    rail: new Set(toRail ? asks.filter((i) => blocks[i]!.area !== 'rail') : []),
    compact: new Set(asks),
    spans: beside && shown !== undefined ? new Map([[first!, COLUMNS - BESIDE], [shown, BESIDE]]) : new Map(),
  };
}
