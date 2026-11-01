/**
 * WHAT THE READER DID STAYS WHERE THEY DID IT (skills pass 2 Nov, money2). The record's look leads a page with the block
 * that changed since the reader last looked (`composeLook` in the kernel), and the reader's own write is such a change:
 * a budget typed on Budgets lifted "This week's budgets" to the page's top and threw the field being typed in 600px down
 * the page, and a line added on the Ledger sent "Last 30 days" from the head of the page to under its 3,000px of lines.
 * The page recomposed under the reader's hand, which is the jarring change motion is meant to prevent.
 *
 * SO ONCE THE READER HAS WRITTEN DURING A VISIT, the blocks keep the order they were drawn in for the rest of it: a block
 * already on the page stays at its place, a block that arrives is put after the block it follows in the record's answer,
 * and one that left is gone. Blocks still enter, leave and change size with the page's own motion (`recompose.ts`); only
 * the order holds. A new visit (another page, another filter) opens on the record's order again, so what changed still
 * leads the next time the page is opened.
 *
 * PURE; `PageView.svelte` decides when to apply it.
 */

/**
 * `blocks` (keyed `keys`, one key a block) in the order `before` drew them. Blocks not in `before` follow the nearest block
 * before them in the answer that is, or open the page when none is. Answers `blocks` itself when nothing moves.
 */
export function heldOrder<B>(blocks: readonly B[], keys: readonly string[], before: readonly string[]): readonly B[] {
  const was = new Map(before.map((k, i) => [k, i]));
  const known: number[] = [];
  const after = new Map<number, number[]>();
  const opening: number[] = [];
  let last = -1;
  keys.forEach((k, i) => {
    if (was.has(k)) {
      known.push(i);
      last = i;
    } else if (last === -1) opening.push(i);
    else after.set(last, [...(after.get(last) ?? []), i]);
  });
  known.sort((a, b) => was.get(keys[a]!)! - was.get(keys[b]!)!);
  const order = [...opening, ...known.flatMap((i) => [i, ...(after.get(i) ?? [])])];
  return order.every((i, n) => i === n) ? blocks : order.map((i) => blocks[i]!);
}
