/**
 * Whether two answers draw the same rows: the same rows in the same order, each at the same version and saying the same.
 *
 * A LIST OF CARDS KEEPS THE ROWS IT DREW WHEN A NEW ANSWER SAYS NOTHING NEW (`RowCards.svelte`), as the table does
 * (`sameRows` in `braindog-render`). Its cards are keyed and move with `animate:flip`, and a keyed list handed another
 * array measures every card before and after: two layouts of the whole list for rows nobody changed. PURE, so
 * `same-entries.test.ts` runs it under `node --test`.
 */

import type { Entry } from './schema.ts';

export function sameEntries(a: readonly Entry[], b: readonly Entry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as Entry;
    const y = b[i] as Entry;
    if (x === y) continue;
    if (x.seq !== y.seq || x.version !== y.version) return false;
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
