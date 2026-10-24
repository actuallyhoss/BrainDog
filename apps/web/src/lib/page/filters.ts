/**
 * A declared page's filters, the host's half: the strip's choices read off the record's answer, the choice kept in the
 * address (`?f.thing=12`), and the address a choice goes to. The strip itself is the renderer's (`braindog-render`
 * `Filters`), and narrowing every block is the kernel's (`readPage` with `filter`), so all this does is carry the choice
 * between the two.
 *
 * THE ADDRESS HOLDS THE CHOICE, so a filtered page is a link somebody can send, Back undoes a choice, and a reload keeps
 * it. One key a field, `f.<field>`, beside whatever else the address says (`?src=1` stays as it was).
 *
 * PURE, AND NODE LOADS IT, so `filters.test.ts` holds each rule.
 */

import type { Filter } from 'braindog-render';

/** What every filter key in the address starts with. */
const PREFIX = 'f.';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A value as the strip and the address spell it: text, and a row's number as its digits. `''` IS A VALUE, the kernel's
 * "none" (the "No project" choice, `clauseOf` in `kernel/src/pages.ts`), so it is kept and not read as no spelling.
 */
const spelt = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/**
 * The fields a page may be narrowed by, as the record answered them beside its blocks (`filters`), read rather than
 * trusted: a record on another build that sent another shape draws no strip, and a value with no spelling is left out.
 */
export function filtersOf(page: unknown): Filter[] {
  const said = isObject(page) ? page.filters : undefined;
  if (!Array.isArray(said)) return [];
  return said.flatMap((f): Filter[] => {
    if (!isObject(f) || typeof f.field !== 'string' || f.field === '' || !Array.isArray(f.values)) return [];
    const values = f.values.flatMap((v) => {
      if (!isObject(v)) return [];
      const value = spelt(v.value);
      if (value === null) return [];
      const label = typeof v.label === 'string' && v.label.trim() !== '' ? v.label : value;
      if (label === '') return [];
      /* A PROJECT'S HUE, so its chip wears the project's dot (E24). */
      const hue = typeof v.hue === 'number' && Number.isInteger(v.hue) && v.hue >= 0 && v.hue < 360 ? { hue: v.hue } : {};
      return [typeof v.count === 'number' ? { value, label, count: v.count, ...hue } : { value, label, ...hue }];
    });
    const control = f.control === 'chips' || f.control === 'segmented' ? f.control : undefined;
    return [{ field: f.field, label: typeof f.label === 'string' && f.label !== '' ? f.label : f.field, values, ...(control ? { control } : {}) }];
  });
}

/** What the address narrows the page to now, by field. `?f.thing=` is a choice too: the rows with none. */
export function filterOf(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!key.startsWith(PREFIX) || key.length === PREFIX.length) continue;
    out[key.slice(PREFIX.length)] = value;
  }
  return out;
}

/**
 * The address's query with `field` set to `value`, or let go when `value` is `null`; everything else is kept. Without
 * its `?`, which the caller writes in front, so the navigation reads as the query it is (`at-sites.test.ts`).
 */
export function filterQuery(params: URLSearchParams, field: string, value: string | null): string {
  const next = new URLSearchParams(params);
  if (value === null) next.delete(`${PREFIX}${field}`);
  else next.set(`${PREFIX}${field}`, value);
  return next.toString();
}

/** Whether two choices are the same, so a read of the page is asked again only when the choice changed. */
export const sameFilter = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/**
 * THE WORD TYPED ON THE PAGE'S HEAD (PGS-A14), as the address holds it under the head's own param (`?q=kiln`, which
 * `declared-head.ts` `searchQuery` writes): trimmed, and `null` where there is none, so an empty field asks nothing.
 * No param, a page whose head has no search, is no word.
 */
export function searchOf(params: URLSearchParams, param: string | null | undefined): string | null {
  if (!param) return null;
  const said = params.get(param)?.trim() ?? '';
  return said === '' ? null : said;
}

/**
 * THE CHOICE SENT TO THE RECORD, WITH THE WORD: the strip's fields as they were, and the word under the param's own
 * key, which the kernel reads as the page's search. No word sends the choice untouched, the same object, so a page
 * with no search is asked exactly as before. A param is never `f.`-spelt (`declared-head.ts` `PARAM`), so the word
 * never stands in a field's place.
 */
export function withSearch(filter: Readonly<Record<string, string>>, param: string | null | undefined, word: string | null): Record<string, string> {
  if (!param || word === null) return filter as Record<string, string>;
  return { ...filter, [param]: word };
}
