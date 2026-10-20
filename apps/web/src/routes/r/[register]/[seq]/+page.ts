/**
 * A PROJECT'S ROW OPENS ON ITS PAGE (the plan of 20 October, batch 3d). A project is read on the page its list made for
 * it, where its path, money and work are drawn; its row's screen holds only its fields. So `/r/things/3` sends a reader
 * to `/p/kiln`, unless the address asks for the fields (`?fields=1`), which is how the page and a hole get there.
 *
 * ONLY A PROJECT'S: the list that declares `scopes`, read off its declaration and never its name. A person's or a run's
 * row keeps its own screen, which is where a run is read. The declaration is asked only for a row that has a page.
 *
 * AFTER THE SHELL: `boot` says which page is about which row (`learnRowPages`), and it is learnt in the root layout's
 * load, which `parent()` waits for. A row with no page, and a record that sent none, stay on the row's screen.
 */
import { redirect } from '@sveltejs/kit';
import { createClient } from '@braindog/client';

import { apiBase, at } from '../../../../lib/at.ts';
import { REGISTERS } from '../../../../lib/record/held.ts';
import { isProject } from '../../../../lib/record/project.ts';
import { learn } from '../../../../lib/record/remote.ts';
import { ownPage } from '../../../../lib/record/row-href.ts';

const asked = new Map<string, Promise<void>>();

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
  await parent();
  const to = ownPage(params.register, Number(params.seq), url.searchParams);
  if (to === null) return;
  if (REGISTERS[params.register] === undefined) await learn(createClient({ base: apiBase(url), ...(fetch ? { fetch } : {}) }).schema, params.register, asked).catch(() => undefined);
  if (isProject(REGISTERS[params.register])) redirect(307, at(to, url.pathname));
}
