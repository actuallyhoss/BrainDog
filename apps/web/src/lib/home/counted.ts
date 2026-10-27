/**
 * A count and a list of names as a sentence says them, for the Projects board and the sidebar.
 *
 * ITS OWN MODULE, APART FROM `projects-board.ts`, BECAUSE THE SIDEBAR IS IN THE ROOT LAYOUT. A module shared between
 * chunks is bundled whole, so the sidebar's two words from the board put the whole board on every screen's first load.
 * `projects-board.ts` re-exports both.
 */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** A small count in words, as a sentence says it ("three projects"); a large one in figures. */
export const counted = (n: number): string => (n >= 0 && n < WORDS.length ? WORDS[n]! : n.toLocaleString('en-GB'));

/** "A", "A and B", "A, B and C", or "A, B and 2 more". */
export function names(list: readonly string[], most = 3): string {
  const all = [...new Set(list)];
  if (all.length <= 1) return all[0] ?? '';
  if (all.length <= most) return `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
  return `${all.slice(0, most - 1).join(', ')} and ${all.length - (most - 1)} more`;
}
