/**
 * WHAT A LINK FIELD'S PICKER OFFERS AND WHICH ROW A TYPED NAME MEANS (`RefPick.svelte`).
 *
 * A LINK IS PICKED BY NAME, NEVER TYPED AS A NUMBER. A ledger line's "Change category" opened a box holding `15` and
 * took only a row id or a spoken id, so "Insurance" was refused with `category takes a row id or a spoken id like
 * categories#1`. The rows come from `refOptions` (`held.ts`), the ones the new-row form offers, and the box holds the
 * chosen row's number as before, so the write goes through the conversion it always did.
 */

export type RefOption = { value: number; label: string };

/** How many rows the list draws at once: a 400-row list is narrowed by typing, not scrolled. */
export const SHOWN = 50;

const fold = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .trim();

/** The row number a held value names: `15`, or the spoken `categories#15`. `null` for nothing or anything else. */
export function seqOf(value: string): number | null {
  const m = /^(?:[a-z0-9_]+#)?(\d+)$/iu.exec(value.trim());
  return m ? Number(m[1]) : null;
}

/**
 * The rows that match what was typed, the ones whose name starts with it first, then the ones holding it, each kept in
 * the list's own order. Nothing typed is every row.
 */
export function matching(options: readonly RefOption[], typed: string): RefOption[] {
  const q = fold(typed);
  if (q === '') return [...options];
  const starts: RefOption[] = [];
  const holds: RefOption[] = [];
  for (const o of options) {
    const name = fold(o.label);
    if (name.startsWith(q)) starts.push(o);
    else if (name.includes(q)) holds.push(o);
  }
  return [...starts, ...holds];
}

/**
 * The row a box left without a pick means: the one named exactly, else the only one that matches, else none, and the
 * box goes back to the row it held.
 */
export function meant(options: readonly RefOption[], typed: string): RefOption | null {
  const q = fold(typed);
  if (q === '') return null;
  const exact = options.find((o) => fold(o.label) === q);
  if (exact) return exact;
  const found = matching(options, typed);
  return found.length === 1 ? found[0]! : null;
}

export const pickWords = {
  none: 'None',
  nothing: (list: string) => `Nothing in ${list} yet.`,
  noMatch: (typed: string) => `Nothing called “${typed.trim()}”.`,
  more: (n: number) => `${String(n)} more. Type to narrow.`,
  search: (list: string) => `Search ${list}`,
};
