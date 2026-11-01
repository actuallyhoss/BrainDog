/**
 * The lists an invitation can open, grouped by the place a person knows them by (Money, Projects, Work), so an owner
 * gives "Projects, and not Money" in two presses instead of a level on each of thirty lists.
 *
 * A LIST GOES WITH THE OTHERS ITS ADD-ON DECLARED, and the add-on's lists go to the place whose page is most made of
 * them: the share of that page's lists that are the add-on's, then how many of them it reads, then the rail's order.
 * Money's page reads one line of Tasks, and Tasks' add-on is still Work's, because Work's page is mostly Tasks.
 * Nothing here names an add-on or a list: the record says which add-on declared each list, and each place says the
 * lists its page reads. A list no place reads, and a list no add-on declared, is under "Other lists".
 */

export type InviteList = { id: string; name: string; pack?: string | undefined; kernel?: true | undefined };
export type InvitePlace = { section: string; place?: number | undefined; lists?: readonly string[] | undefined; row?: true | undefined };
export type PlaceGroup = { key: string; name: string; lists: { id: string; name: string }[] };

/** The words for the group of lists no place reads. */
export const OTHER_LISTS = 'Other lists';

export function placeGroups(lists: readonly { id: string; name: string }[], declared: readonly InviteList[], nav: readonly InvitePlace[]): PlaceGroup[] {
  const packOf = new Map(declared.map((l) => [l.id, l.pack ?? (l.kernel ? '\u0000kernel' : `\u0000${l.id}`)]));
  const places = nav
    .filter((n) => typeof n.place === 'number' && n.row !== true && Array.isArray(n.lists) && n.lists.length > 0)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const byPack = new Map<string, string[]>();
  for (const l of lists) {
    const key = packOf.get(l.id) ?? `\u0000${l.id}`;
    byPack.set(key, [...(byPack.get(key) ?? []), l.id]);
  }
  const placeOf = new Map<string, string>();
  for (const [pack, ids] of byPack) {
    let best: { section: string; share: number; n: number } | null = null;
    for (const p of places) {
      const read = p.lists!.filter((l) => ids.includes(l) || packOf.get(l) === pack).length;
      if (read === 0) continue;
      const share = read / p.lists!.length;
      if (best === null || share > best.share || (share === best.share && read > best.n)) best = { section: p.section, share, n: read };
    }
    if (best !== null) placeOf.set(pack, best.section);
  }
  const groups = new Map<string, PlaceGroup>();
  for (const l of lists) {
    const name = placeOf.get(packOf.get(l.id) ?? '') ?? OTHER_LISTS;
    const g = groups.get(name) ?? { key: name, name, lists: [] };
    g.lists.push({ id: l.id, name: l.name });
    groups.set(name, g);
  }
  /* IN THE RAIL'S ORDER, and the lists no place reads last. */
  const order = places.map((p) => p.section);
  return [...groups.values()].sort((a, b) => rank(order, a.name) - rank(order, b.name));
}

const rank = (order: readonly string[], name: string): number => (name === OTHER_LISTS ? Number.MAX_SAFE_INTEGER : order.indexOf(name) === -1 ? order.length : order.indexOf(name));
