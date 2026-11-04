/**
 * A ROW WITH A PAGE OF ITS OWN OPENS ON IT (the plan of 20 October, batch 3d, and things not rows). A project is read on
 * the page its list made for it, where its path, money and work are drawn, and so are an account, a bill and a service;
 * the row's screen holds only its fields. So `/r/things/3` sends a reader to `/p/kiln`, unless the address asks for the
 * fields (`?fields=1`), which is how the page's "Show the data" and a hole get there.
 *
 * ANY LIST BUT ONE OF PEOPLE (`opensOnPage`, read off its declaration and never its name), AND A RUN'S, the record's
 * own list of runs (`session`, whose name no version has changed): its page is where what it did is read and put back.
 * A person's row keeps its own screen. The declaration is asked only for a row that has a page.
 *
 * AFTER THE SHELL: `boot` says which page is about which row (`learnRowPages`), and it is learnt in the root layout's
 * load, which `parent()` waits for. A row with no page, and a record that sent none, stay on the row's screen.
 */
import { redirect } from '@sveltejs/kit';
import { createClient } from '@braindog/client';

import { apiBase, at } from '../../../../lib/at.ts';
import { REGISTERS } from '../../../../lib/record/held.ts';
import { namedOutright } from '../../../../lib/record/nearest.ts';
import { opensOnPage } from '../../../../lib/record/project.ts';
import { learn } from '../../../../lib/record/remote.ts';
import { ownPage } from '../../../../lib/record/row-href.ts';

const asked = new Map<string, Promise<void>>();

/** The record's own list of runs, which every record holds under this name. */
const RUNS = 'session';

export async function load({
  params,
  url,
  parent,
  fetch,
}: {
  params: { register: string; seq: string };
  url: URL;
  parent: () => Promise<unknown>;
  fetch?: typeof globalThis.fetch;
}): Promise<void> {
  const shell = (await parent()) as { lists?: readonly { id: string; name: string }[] } | undefined;
  /* A ROW'S ADDRESS KEPT WITH ITS LIST'S NAME IN IT (`/r/projects/4`) IS THAT LIST'S ROW, as `/r/projects` is the list. */
  const lists = shell?.lists ?? [];
  if (lists.length > 0 && !lists.some((l) => l.id === params.register)) {
    const named = namedOutright(params.register, lists.map((l) => ({ title: l.name, href: `/r/${l.id}`, address: l.id })));
    if (named) redirect(307, at(`${named.href}/${params.seq}${url.search}`, url.pathname));
  }
  const to = ownPage(params.register, Number(params.seq), url.searchParams);
  if (to === null) return;
  if (REGISTERS[params.register] === undefined) await learn(createClient({ base: apiBase(url), ...(fetch ? { fetch } : {}) }).schema, params.register, asked).catch(() => undefined);
  if (params.register === RUNS || opensOnPage(REGISTERS[params.register])) redirect(307, at(to, url.pathname));
}
