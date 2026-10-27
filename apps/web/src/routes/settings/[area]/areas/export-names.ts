/**
 * The lists Export names, in its own words: the three that hold the most, then how many more. The shell's own order put "Exchange rates, Books, Updates" first on his record, two of them nearly
 * empty, while Ledger, Numbers and Agent runs hold nearly everything a copy carries.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

/** How many lists are named before "and N more". */
export const NAMED_MOST = 3;

/**
 * The names to say, biggest first: `lists` as the shell holds them, `counts` as the index counts each. A list with no
 * count sorts after those with one, in the shell's order, and the rest past three are "N more".
 */
export function biggestNames(
  lists: readonly { id: string; name: string }[],
  counts: readonly { id: string; count: number }[],
  most: number = NAMED_MOST,
): string[] {
  const held = new Map(counts.map((c) => [c.id, c.count] as const));
  const named = lists
    .map((l, i) => ({ name: l.name.trim(), count: held.get(l.id) ?? -1, i }))
    .filter((l) => l.name !== '')
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .map((l) => l.name);
  return named.length > most ? [...named.slice(0, most), `${named.length - most} more`] : named;
}
