/**
 * A ROW WHOSE LIST MADE IT A PAGE OPENS ON THAT PAGE (the plan of 20 October, batch 3d). A project is read on its page,
 * where its path, money and work are drawn; its row's screen holds only its fields. So `/r/things/3` sends a reader to
 * `/p/kiln`, unless the address asks for the fields (`?fields=1`), which is how the page and a hole get there.
 *
 * AFTER THE SHELL: `boot` says which page is about which row (`learnRowPages`), and it is learnt in the root layout's
 * load, which `parent()` waits for. A row with no page, and a record that sent none, stay on the row's screen.
 */
import { redirect } from '@sveltejs/kit';

import { at } from '../../../../lib/at.ts';
import { ownPage } from '../../../../lib/record/row-href.ts';

export async function load({ params, url, parent }: { params: { register: string; seq: string }; url: URL; parent: () => Promise<unknown> }): Promise<void> {
  await parent();
  const to = ownPage(params.register, Number(params.seq), url.searchParams);
  if (to !== null) redirect(307, at(to, url.pathname));
}
