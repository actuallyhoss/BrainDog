/**
 * Where Decide's kept page holds the questions waiting, so the local copy places an answer or a withdrawal on it in
 * place (`Asks` in `lib/data/local.ts`). PURE, so `kept-decide.test.ts` runs it under `node --test`.
 */

import { QUESTIONS, type Spot } from '../../lib/data/local.ts';

type Block = { kind?: unknown; source?: unknown; queue?: unknown };

/**
 * One spot per queue of open or put-off questions, at `got.page.blocks[i]`, its total beside it and its `waiting` counts
 * (hard to undo, waited long) taken out when a question goes, since the browser cannot say which of them it was. A page
 * that also draws what was decided says so (`decided`): only a withdrawal is placed on it. Any other block over the
 * questions leaves no spots at all, so every line about them drops the page as before.
 */
export function decideSpots(got: { page: { blocks: readonly Block[] } }): Spot[] {
  const blocks = got.page.blocks;
  const decided = blocks.some((b) => b.source === 'governance.decided');
  const spots: Spot[] = [];
  for (const [i, b] of blocks.entries()) {
    if (typeof b.source !== 'string' || !b.source.startsWith('governance.') || b.source === 'governance.decided') continue;
    const queue = b.kind === 'queue' && (b.source === 'governance.open' || b.source === 'governance.later') && Array.isArray(b.queue);
    if (!queue) return [];
    const at = ['got', 'page', 'blocks', i];
    spots.push({ list: QUESTIONS, at: [...at, 'queue'], by: null, questions: { total: [...at, 'total'], decided, drops: [[...at, 'waiting']] } });
  }
  return spots;
}
