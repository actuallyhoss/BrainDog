/**
 * ONE DESCRIPTION OF AN ADD-ON, said the same on the three screens that name one: its row on Installed, its own
 * page, and its row in the store. Each counted on its own: Installed counted the record's lists and the rules, the store
 * the catalogue's lists and pages, and the plugin's page summed lists and pages into one number. Now each asks this.
 *
 * A BUILT-IN IS READ FROM ITS MODULE, its lists and the pages a person opens by name (a page drawn for each row of a list
 * is not one of them); anything else from what its listing says it adds. PURE, so `node --test` holds it.
 */

/** What an add-on holds, by the two counts a person reads. */
export type Holds = { lists: number; pages: number };

/** A module as `firstPartyModules()` describes one, by the keys read here. */
type ModuleLike = { id: string; registers: readonly string[]; pages: readonly string[]; rowPages?: readonly string[] };

/** A listing as `listing.ts` describes one, by the keys read here. */
type ListingLike = { kind: string; id: string; latest?: string | null; versions: readonly { version: string; reach: { lists: readonly string[]; pages: readonly string[] } }[] };

/** What a module holds: its lists, and its pages less the ones drawn for each row. */
export const moduleHolds = (m: ModuleLike): Holds => ({
  lists: m.registers.length,
  pages: m.pages.filter((p) => !(m.rowPages ?? []).includes(p)).length,
});

/** What a listing holds: a built-in's from its module, anything else from what its newest version adds. */
export function listingHolds(l: ListingLike, modules: readonly ModuleLike[]): Holds | null {
  if (l.kind === 'module') {
    const m = modules.find((x) => x.id === l.id);
    if (m) return moduleHolds(m);
  }
  const v = l.versions.find((x) => x.version === l.latest) ?? l.versions[0];
  return v ? { lists: v.reach.lists.length, pages: v.reach.pages.length } : null;
}

const counted = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** "3 lists and 2 pages", "1 list", "4 pages", or `''` for an add-on that holds neither. */
export function describe(h: Holds | null): string {
  if (h === null) return '';
  const parts = [h.lists > 0 ? counted(h.lists, 'list', 'lists') : '', h.pages > 0 ? counted(h.pages, 'page', 'pages') : ''].filter((p) => p !== '');
  return parts.join(' and ');
}
