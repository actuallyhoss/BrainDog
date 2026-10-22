/**
 * What this tab has learnt from the record: its lists' declarations, its pages, and the name each row goes by.
 *
 * EMPTY UNTIL THE RECORD SAYS SOMETHING, AND THAT IS THE WHOLE POINT OF THE FILE. These tables were `data.ts`'s, which
 * is the sample, so a live record read the sample wherever it had not been asked yet: a list not learnt kept the seed's
 * declaration, a ref typed as `thing is Kiln` was looked up among the sample's projects and sent the record the ULID of
 * whichever of its own rows had the same number, and the new-row form offered the sample's four projects as the rows a
 * ref could point at, on a record that holds none of them.
 *
 * WHO FILLS WHAT. `learn` in `remote.ts` puts each list's declaration in `REGISTERS` as the record answers `schema`;
 * `refMapOf` there puts a list's row names in `TITLES` each time a reader walks that list to resolve its refs; and
 * `readBoot` puts each page `boot` lists in `PAGES`, by `learnPages` below. Nothing else writes here in a shipped build.
 *
 * A TEST FILLS IT WITH THE SAMPLE BY IMPORTING `fixtures/fill.ts`, and only a test may. Until the sample left the app the fixture
 * itself copied the seed's declarations here the moment anything imported it, and eleven shipped files did, so a list
 * a live tab had not learnt yet drew the seed's fields. Measured with that copy gone and no test
 * changed: 277 of 1,984 tests failed across 66 files. 61 of them import `fill.ts` now; four already did and had grown a
 * list through the fixture's own tables, which they grow through these now; the last held the build variants to the
 * fixture (`deployment.test.ts`).
 *
 * NO IMPORT BUT TYPES, so loading this file loads no sample.
 */

import type { Entry, PageDecl, RegisterDecl } from './schema.ts';

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
 * The rows of each list that are in one of its finished states (`state:` and `done:`), by number, as `refMapOf` last
 * walked them. A picker leaves them out: a closed account is not offered for a new entry.
 */
export const FINISHED = new Map<string, ReadonlySet<number>>();

/**
 * The states of a list that keep a row out of a picker: its `done:`, less the one its state field starts a new row in.
 *
 * THE STATE A ROW IS BORN IN HIDES NOTHING. A ledger entry is `cleared` the moment it is written, so leaving every
 * finished one out emptied Installments' "Paid by" of every payment that could have paid the part, and the one entry
 * it was for was never offered. Finished means "no longer offered" only for a state somebody moves a row into: a
 * closed account, a retired category, and a ledger entry made `void`.
 *
 * ONLY THE STARTING STATE IS LET BACK IN, not the whole of `done:`. The rule was all or none for a list, so a void
 * entry, one sent twice and struck out, was offered as the payment of a part beside the cleared ones. A void entry
 * moved no money and pays nothing.
 */
export function leftOut(decl: Pick<RegisterDecl, 'state' | 'done' | 'fields'> | undefined): readonly string[] {
  const done = decl?.done ?? [];
  const starts = decl?.fields?.find((f) => f.id === decl.state)?.default;
  return typeof starts === 'string' && done.includes(starts) ? done.filter((s) => s !== starts) : done;
}

/**
 * The rows a ref into `register` can point at, as a picker offers them: by name, or as its kind and number for a row
 * with none, "Book #2", as `unnamed` in `api.ts` says it. It said `books#2`, the id an agent passes, which is never what
 * a person reads.
 *
 * EMPTY UNTIL THE LIST HAS BEEN WALKED, and that is the honest answer. The new-row form offered the sample's rows here,
 * so on a record whose projects are Harbour Lane and Tidewater a new service could only be pointed at Kiln, Marlow & Co,
 * Portage and a fourth project the record never held, and the number sent was a real row of the record's.
 *
 * A ROW ITS OWN LIST CALLS FINISHED IS LEFT OUT (`FINISHED`), except `keep`, the row the form already points at, so
 * an entry on an account closed since still shows where it is. The state a list starts a new row in is never a reason
 * to leave one out (`leftOut`): a cleared ledger entry is offered, a void one is not.
 */
export const refOptions = (register: string, keep?: number | null): { value: number; label: string }[] => {
  const kind = REGISTERS[register]?.one ?? register.replace(/_/g, ' ');
  const over = FINISHED.get(register);
  return [...(TITLES.get(register) ?? [])].filter(([seq]) => seq === keep || !over?.has(seq)).map(([seq, title]) => ({ value: seq, label: title || `${kind.charAt(0).toUpperCase()}${kind.slice(1)} #${seq}` }));
};

/**
 * Each list's rows as this tab holds them past the screen that read them, by list: none, in a shipped build.
 *
 * EMPTY, AND EVERY HELPER THAT READS IT ANSWERS AS IT DOES FOR A LIST WITH NO ROWS. It was the sample's `ROWS`, read by
 * `currencyFor`, `homeCurrency`, a gauge's currency, a seeded block's first filter and target, and the browser's own
 * figure, page and cash-walk engines, so on a live record each of those answered from the sample's rows: a money field
 * on a new row was offered the currency of the sample's rows in that list, and a seeded gauge proposed a target of twice
 * the sample's sum whatever the record held. No live reader keeps a list's rows beyond its screen yet, so nothing writes here but
 * `fixtures/fill.ts`, which puts the sample's rows here for the tests that hold those engines to the kernel's.
 */
export const ROWS: Record<string, Entry[]> = {};

/** Each walked list's money values by row number, for the code a currency_from amount takes from its account. Filled by refMapOf. */
export const MONEY_HELD = new Map<string, ReadonlyMap<number, Readonly<Record<string, unknown>>>>();
