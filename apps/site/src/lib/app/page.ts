/**
 * What the drawn page decides, as plain functions: where a segment sits, where an in-window link goes,
 * and which of a page's questions are still open.
 *
 * KEPT OUT OF `Page.svelte` for the reason the renderer keeps its plans out of its drawers: none of it
 * is markup, and a function a Node test can import is a function somebody can check without a DOM.
 */
import { kindSpec, parse, symbolText, type Block, type Segment } from 'braindog-render';
import type { Span } from '../examples/types.ts';
import { CURRENCY } from '../plans.ts';

/**
 * THE HOME CURRENCY THE DRAWN APP IS TOLD, the plans' own. Not told one, the renderer spells a dollar `US$` so no reader
 * can take it for another's, and the copy beside it says `$`: two spellings of one currency on one page. Told it, every
 * figure is the one writer's (`writeAmount`): `$4,800` for the home's dollars, and a pound or a pound of Egypt in an
 * example keeps its own mark with its code after, as on a record whose home is dollars. `Page.svelte` hands the same
 * to the renderer, so a tile and a sentence beside it spell a figure alike.
 */
export const HOME = CURRENCY;

/**
 * THE PREFIX OF A LINK THAT STAYS INSIDE THE WINDOW. A figure's `cellHref` answers `#go:<page-id>`,
 * which the page catches and hands to `go` instead of letting the browser follow it, so pressing a
 * tile opens another page of the drawn app and the reader's own page never moves.
 */
export const GO = '#go:';

/** The page an in-window link opens, or `null` for a link that is not one. */
export const goTarget = (href: string | null): string | null =>
  href !== null && href.startsWith(GO) && href.length > GO.length ? href.slice(GO.length) : null;

/** The widths a span may take, narrowest first. */
const COLS: readonly Span['cols'][] = [3, 4, 6, 8, 12];

/**
 * Where a segment sits: the span `layout` gives it, or its kind's `minSpan` rounded up to a width
 * the grid draws. Prose and a degraded fence take the whole row, because both are read as text and
 * a quarter of a page is no measure for a paragraph.
 */
export function spanOf(segment: Segment, at: number, layout: readonly Span[] = []): Span {
  const set = layout.find((s) => s.at === at);
  if (set) return set;
  const min = segment.type === 'block' ? (kindSpec(segment.kind)?.minSpan ?? 12) : 12;
  return { at, cols: COLS.find((c) => c >= min) ?? 12 };
}

/** The question a queue row belongs to: its second cell, on a question and on each of its options alike. */
const questionOf = (cells: readonly string[]): string => (cells[1] ?? '').trim();

/** Whether a row is a question or one of its options, and so can be answered away. */
const answerable = (cells: readonly string[]): boolean => {
  const word = (cells[0] ?? '').trim();
  return word === 'q' || word === 'opt';
};

/**
 * A queue with the questions already answered here taken out, options and all.
 *
 * AN ANSWERED QUESTION LEAVES THE QUEUE, as it leaves Decide in the product, rather than staying with
 * its buttons greyed: a control that can no longer act is absent (`19 §6`). When the last one goes,
 * the queue's drawer says its own sentence for an empty queue.
 */
export function withoutAnswered(block: Block, answered: ReadonlySet<string>): Block {
  if (block.kind !== 'queue' || answered.size === 0) return block;
  return { ...block, rows: block.rows.filter((r) => !(answerable(r.cells) && answered.has(questionOf(r.cells)))) };
}

/** The ids of every question the queues of a page's source ask, in order. */
export function questionsIn(src: string): string[] {
  const ids: string[] = [];
  for (const s of parse(src, { page: true })) {
    if (s.type !== 'block' || s.kind !== 'queue') continue;
    for (const r of s.rows) if ((r.cells[0] ?? '').trim() === 'q') ids.push(questionOf(r.cells));
  }
  return ids;
}

/** A question's words and the label of the option pressed, read off the block that drew them. */
export function answerOf(block: Block, question: string, option: string): { question: string; label: string } {
  let asked = '';
  let label = option;
  for (const r of block.rows) {
    if (questionOf(r.cells) !== question) continue;
    const word = (r.cells[0] ?? '').trim();
    if (word === 'q') asked = (r.cells[4] ?? '').trim();
    else if (word === 'opt' && (r.cells[2] ?? '').trim() === option) label = (r.cells[3] ?? '').trim() || option;
  }
  return { question: asked, label };
}

/** Whether a segment is the page's opening sentence, a `note lead`, which the drawn app says in its title row. */
export const isLead = (segment: Segment): boolean => segment.type === 'block' && segment.kind === 'note' && segment.form === 'lead';

/**
 * THE PAGE'S OPENING SENTENCE, as plain words: the first `note lead` in its source, or `''` when it has none. The new
 * app says it under the page's title (the design system's sentence), so the drawn app reads it off the same text the page
 * is drawn from rather than keeping a second copy.
 */
export function leadOf(src: string): string {
  for (const s of parse(src, { page: true })) {
    if (s.type === 'block' && isLead(s)) return symbolText(s.rows.map((r) => r.cells.join(' ')).join(' ').trim(), true, HOME);
  }
  return '';
}

/**
 * A SENTENCE AS THE APP SAYS IT: every figure in it with its symbol and no `.00`, `$1,312.40 is left`, never
 * `USD 1,312.40`. The text keeps the code, because money is never a bare number; this is only how it is drawn.
 */
export const said = (text: string): string => symbolText(text, true, HOME);

/**
 * A BLOCK WITH ITS MONEY DRAWN AS THE APP DRAWS IT. A note says its sentence the way a headline does. Every other
 * block's cells say each stored amount the way the one writer does for the plans' home (`HOME`), exact: `$42.00`,
 * never `USD 42.00`. A progress row keeps its pence in every cell, `$245.10 of $300.00`, because what is left is
 * worked out from them (a goal of `$300` would say `$55 left` where `$54.90` is left), and a range's high is its
 * fourth cell, so `$50.00 to $120` would sit where `$50.00 to $120.00` belongs.
 *
 * EVERY KIND, AND NOT ONLY THE TWO THAT PRINTED A CELL AS WRITTEN ONCE. Since the drawer was told the home (batch 101),
 * a figure it works out is `$2,360.00`, while a timeline's line, an agent's step, a choice's price and a chart's own
 * buckets still printed the source's `USD 2,840.00` beside it: one currency by its sign and by its code on one page
 * (`two-spellings`, the layout gate). A table and a stat already wrote theirs through the writer, so saying them here
 * first changes nothing they draw.
 */
export function inSymbols(block: Block): Block {
  const each = (say: (c: string) => string): Block => ({ ...block, rows: block.rows.map((r) => ({ ...r, cells: r.cells.map(say) })) });
  return block.kind === 'note' ? each(said) : each((c) => symbolText(c, false, HOME));
}
