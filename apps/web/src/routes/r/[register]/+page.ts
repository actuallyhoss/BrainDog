/**
 * A LIST WITH A PAGE OF ITS OWN OPENS ON IT. A page that says `list: <id>` is that list's page, where its rows are
 * read the way they are meant to be: Numbers grouped by project, each kind of number once. So `/r/datapoints` sends a
 * reader to `/p/numbers`, and the list's own screen, its rows as a table, is one word away (`?rows=1`), as is every
 * address that asks for anything of the list (a row, a view, a filter).
 *
 * AND A READER ALREADY ON THE LIST STAYS ON IT: the screen clears its own words from the address as a sheet closes or a
 * view goes back to the table, and that bare address is the same list and not a visit to it. The tab's address is still
 * the one being left while this runs, so a load from the same list's screen is told by its path.
 *
 * AFTER THE SHELL: `boot` says which page is which list's (`learnRowPages`), learnt in the root layout's load, which
 * `parent()` waits for. A list with no page, and a record that sent none, stay on the list's screen.
 *
 * AND AN ADDRESS THAT NAMES A LIST BY ITS NAME OPENS IT (`namedOutright`): `/r/Projects`, `/r/projects`, on a record whose
 * list's id is `things`. `/r/_new` is the new-list sheet's own address (`MAKE_ID`), never a name.
 */
import { redirect } from '@sveltejs/kit';

import { at } from '../../../lib/at.ts';
import { MAKE_ID } from '../../../lib/record/list-write.ts';
import { namedOutright } from '../../../lib/record/nearest.ts';
import { listPage } from '../../../lib/record/row-href.ts';

/** Whether the tab is on this list's screen already, and moving within it (the address it is leaving is the list's too). */
function within(url: URL, from: { pathname: string; search: string } | null): boolean {
  return from !== null && from.pathname === url.pathname && from.search !== url.search;
}

export async function load({
  params,
  url,
  parent,
  from = typeof location === 'undefined' ? null : location,
}: {
  params: { register: string };
  url: URL;
  parent: () => Promise<unknown>;
  from?: { pathname: string; search: string } | null;
}): Promise<void> {
  const shell = (await parent()) as { lists?: readonly { id: string; name: string }[] } | undefined;
  const lists = shell?.lists ?? [];
  if (params.register !== MAKE_ID && lists.length > 0 && !lists.some((l) => l.id === params.register)) {
    const named = namedOutright(params.register, lists.map((l) => ({ title: l.name, href: `/r/${l.id}`, address: l.id })));
    if (named) redirect(307, at(`${named.href}${url.search}`, url.pathname));
  }
  if (within(url, from)) return;
  const to = listPage(params.register, url.searchParams);
  if (to !== null) redirect(307, at(to, url.pathname));
}
