/**
 * THE THREE PAGES NEAREST AN ADDRESS THAT LED NOWHERE (plan F29), as the app's not-found screen offers its nearest
 * (`apps/web/src/lib/record/nearest.ts`): somebody who typed `/pricng` wants Pricing first, not a list of every page.
 *
 * NEAREST BY THE PAGE'S NAME AND ITS ADDRESS, whichever is closer: a name or address that holds what was typed, or is
 * held in it, comes before one only a few letters away, and ties keep the site's own order. PURE, so node loads it.
 */

/** A page the 404 can offer: its name and where it is. */
export type Near = { label: string; path: string };

const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function edits(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

function distance(asked: string, name: string): number {
  if (asked === '' || name === '') return 1;
  if (asked === name) return 0;
  if (name.includes(asked) || asked.includes(name)) return 0.5 * (1 - Math.min(asked.length, name.length) / Math.max(asked.length, name.length));
  return 0.5 + 0.5 * (edits(asked, name) / Math.max(asked.length, name.length));
}

/** The `most` pages nearest the address `path`, nearest first; none for an address with no words in it. */
export function nearestPages(path: string, pages: readonly Near[], most = 3): Near[] {
  const asked = fold(path);
  if (asked === '') return [];
  return pages
    .filter((p) => p.path !== '/')
    .map((p, n) => ({ p, n, d: Math.min(distance(asked, fold(p.label)), distance(asked, fold(p.path))) }))
    .sort((a, b) => a.d - b.d || a.n - b.n)
    .slice(0, most)
    .map((x) => x.p);
}
