/**
 * What this tab has learnt from the record: its lists' declarations, its pages, and the name each row goes by.
 *
 * EMPTY UNTIL THE RECORD SAYS SOMETHING, AND THAT IS THE WHOLE POINT OF THE FILE. These tables were `data.ts`'s, which
 * is the sample, so a live record read the sample wherever it had not been asked yet: a list not learnt kept the seed's
 * declaration, a ref typed as `thing is Kiln` was looked up among the sample's projects and sent the record the ULID of
 * whichever of its own rows had the same number, and the new-row form offered the sample's four projects as the rows a
 * ref could point at, on a record that holds none of them (`loop/research-no-sample.md` 1d, wave B3).
 *
 * WHO FILLS WHAT. `learn` in `remote.ts` puts each list's declaration in `REGISTERS` as the record answers `schema`;
 * `refMapOf` there puts a list's row names in `TITLES` each time a reader walks that list to resolve its refs; and
 * `readBoot` puts each page `boot` lists in `PAGES`, by `learnPages` below. Nothing else writes here in a shipped build
 * but the copy the next paragraph is about.
 *
 * `data.ts` STILL COPIES THE SEED'S DECLARATIONS INTO `REGISTERS` AND `PAGES`, because it is the fixture every mock
 * reader in `api.ts` and some seventy test files are built over, and it still ships until wave C1 moves it under
 * `fixtures/`. Measured on 25 September with that copy removed: 449 of 1,965 tests fail across about seventy files. It
 * does NOT copy the sample's row names into `TITLES`; a test that asks the mirror about a row by its title imports
 * `fixtures/fill.ts`, so no shipped screen can reach a sample row's name through here.
 *
 * NO IMPORT BUT TYPES, so loading this file loads no sample.
 */

import type { PageDecl, RegisterDecl } from './schema.ts';

/** Each list's declaration, by id, as the record last answered `schema` for it. */
export const REGISTERS: Record<string, RegisterDecl> = {};

/** Each page's declaration, by slug, as far as the record has said it to this tab. */
export const PAGES: Record<string, PageDecl> = {};

/**
 * The pages `boot` lists, kept by slug with the title the record gives each one.
 *
 * `boot` SAYS WHAT A PAGE IS CALLED AND NOT WHAT IS ON IT, so a page first heard of here holds no blocks, and a page this
 * tab already held keeps the blocks it had: nothing that draws a page reads them from here, because a live page's blocks
 * arrive evaluated with every read (`page-live.ts`). What reads this table is a title, and the audit log printed the
 * sample's title for `page.money` on a record that calls its money page something else, or has none.
 */
export function learnPages(said: readonly { slug: string; title: string }[]): void {
  for (const p of said) PAGES[p.slug] = { ...(PAGES[p.slug] ?? { requires: [], blocks: [] }), page: p.slug, title: p.title };
}

/**
 * The name each row of a list goes by, by list and then by number: its declared title, or `''` for a row with none.
 *
 * A LIST HERE IS THE RECORD'S LIST AS IT WAS LAST WALKED, because the readers that call `refMapOf` walk to the end of
 * the cursor, so a number missing from it is a row the record did not have then. A row with no title is kept with an
 * empty name rather than left out, because "is there a row #4" and "what is it called" are two questions `where.ts`
 * asks of the same map.
 */
export const TITLES = new Map<string, ReadonlyMap<number, string>>();

/** The first row of `register` this tab knows by exactly this name, compared by `same`, or `null`. */
export function seqTitled(register: string, said: string, same: (a: string, b: string) => boolean = (a, b) => a === b): number | null {
  for (const [seq, title] of TITLES.get(register) ?? []) if (title !== '' && same(title, said)) return seq;
  return null;
}

/**
 * The rows a ref into `register` can point at, as a picker offers them: by name, or `<list>#<number>` for a row with none.
 *
 * EMPTY UNTIL THE LIST HAS BEEN WALKED, and that is the honest answer. The new-row form offered the sample's rows here,
 * so on a record whose projects are Harbour Lane and Tidewater a new service could only be pointed at Kiln, Marlow & Co,
 * Portage and a fourth project the record never held, and the number sent was a real row of the record's.
 */
export const refOptions = (register: string): { value: number; label: string }[] =>
  [...(TITLES.get(register) ?? [])].map(([seq, title]) => ({ value: seq, label: title || `${register}#${seq}` }));
