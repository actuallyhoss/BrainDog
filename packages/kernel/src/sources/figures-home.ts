/**
 * `figures.home`: the figures the record pins to Home.
 *
 * IT IS ANSWERED BEFORE ANY KIND READS THE BLOCK (`first`): a `stat` over it names no cells, so the stat arm would draw
 * it empty, and a kind module registered for `stat` later would have to know this source to draw it at all. It reads
 * the lists behind each pinned figure, which `registersOf` names. Moved out of `pages.ts` with its answer unchanged
 * (`sources/index.ts`).
 */

import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/**
 * A `stat` over `figures.home`: the figures the record pins to Home, each read as a `stat` reads a figure its `cells`
 * name, and labelled by the name it is declared with.
 *
 * THE RECORD CHOOSES THEM AND NOT THE PAGE, so one Home written over computed sources draws the figures each use case
 * pins (`home:` on a metric). `cells:` beside the source would be two answers to one question, so it is refused.
 */
function homeFigures(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { pinnedOf, mayRead, readBlock } = kit;
  if (block.kind !== 'stat')
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: `figures.home is drawn by a stat block, and a ${block.kind} block has no figures to draw it with.`, at: 'source' }),
    };
  if (block.cells !== undefined)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: 'figures.home draws the figures this record pins to Home, so it takes no cells:. Take the cells off, or take the source off to draw the cells.',
        at: 'cells',
      }),
    };
  if (!deps.metrics)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read the figures pinned to Home onto a page yet.', at: 'source' }) };
  const pinned = pinnedOf(deps.metrics(), (d) => mayRead(deps, d));
  /* READ BY THE STAT ARM ITSELF, handed a block of those cells and nothing else, so a pinned figure's reading, target
     and refusal are exactly what the same figure named in `cells:` answers, and there is one reading of a cell. */
  const cells = pinned.map((d) => ({ metric: d.metric, ...(typeof d.name === 'string' && d.name.trim() !== '' ? { label: d.name } : {}) }));
  const read = readBlock(deps, { kind: 'stat', cells });
  return { ...base, readings: read.readings ?? [], matched: pinned.length, refusals: also(...read.refusals) };
}

export const figuresHome: Source = { first: true, read: homeFigures };
