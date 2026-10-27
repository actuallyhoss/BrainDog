/**
 * The names a block's or a page's `icon:` may give, and the three nearest when it gives one the set does not
 * draw, so an agent or a person who misspells a glyph is told the right name at once.
 *
 * A LEAF THE KERNEL MAY IMPORT. The kernel imports no renderer, so the list is the kernel's own copy: `MARK_GLYPHS` in
 * `marks.ts`, which is `GLYPH_NAMES` in `packages/render/src/glyphs/names.ts` with the keys of `ALIASES` in
 * `glyphs/aliases.ts` beside them. One copy for marks and icons alike, never a second one; `test/marks-unknown.test.ts`
 * and `apps/web/src/lib/page/glyph-pick.test.ts` hold it to the renderer's two files name for name.
 *
 * AN ALIAS ANSWERS. `invoice` installs because the drawer turns it into `receipt-text`; which glyph a word becomes is
 * the drawer's business, and that it becomes one is all the install asks.
 */

import { MARK_GLYPHS } from './marks.ts';

/** Every name the renderer draws, then every word that stands for one, in the renderer's order. */
export const GLYPH_LIST: readonly string[] = MARK_GLYPHS;

/* AS WRITTEN, NOT LOWER-CASED, for the reason `marks.ts` gives: the drawer looks a name up as it is spelled. A `Set`,
   so `constructor` in an `icon:` is no glyph. */
const KNOWN: ReadonlySet<string> = new Set(GLYPH_LIST);

/* ONLY A NAME AN `icon:` CAN BE OFFERED. The shell's spellings with a capital (`arrowUp`) fail the install's shape check,
   and each has a lower-case name for the same glyph (`arrow-up`) already in the list. */
const OFFERED: readonly string[] = GLYPH_LIST.filter((n) => /^[a-z][a-z0-9-]*$/u.test(n));

/** Whether `name` is a glyph the renderer draws, by its own name or an alias. */
export const isGlyphName = (name: string): boolean => KNOWN.has(name);

/**
 * How many single-letter edits turn `a` into `b`: an insert, a delete, a change, or two letters next to each other
 * swapped (`rokcet` is one swap from `rocket`, where counting the swap as two changes would tie it with far words).
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** The `n` names nearest to `name` by edit distance, a tie kept in the list's order. */
export function nearestGlyphs(name: string, n = 3): readonly string[] {
  return OFFERED.map((glyph, at) => ({ glyph, at, far: editDistance(name, glyph) }))
    .sort((x, y) => x.far - y.far || x.at - y.at)
    .slice(0, Math.max(0, n))
    .map((x) => x.glyph);
}

/** The refusal's code, for an `icon:` that names no glyph. */
export const GLYPH_UNKNOWN = 'GLYPH_UNKNOWN';

export type GlyphFault = { code: typeof GLYPH_UNKNOWN; fix: string; at: 'icon'; allowed: readonly string[] };

/** Three names said as a person says them: `a, b and c`. */
const said = (names: readonly string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * `null` when `name` is a glyph or an alias of one, else the refusal that names the three nearest. The install asks it
 * after the shape check; a page already stored with such a name is not refused by the read, and keeps drawing.
 */
export function glyphFault(name: string): GlyphFault | null {
  if (isGlyphName(name)) return null;
  const allowed = nearestGlyphs(name, 3);
  return {
    code: GLYPH_UNKNOWN,
    fix: `There is no glyph called ${name}. The nearest are ${said(allowed)}.`,
    at: 'icon',
    allowed,
  };
}
