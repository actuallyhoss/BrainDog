/**
 * `/pricing`, held until BrainDog is priced (`HELD` in `launch.ts`, his word on 17 October: "hide pricing page since
 * it's not priced yet").
 *
 * Held as `/changelog` is (`routes/changelog/+page.ts`): prerendered on every day, answering 404 while held, so the
 * build writes no `pricing.html` and the site's own 404 page answers the address. The page and its words stay, so the
 * day it is shown nothing has to be restored.
 */
import { error } from '@sveltejs/kit';
import { LAUNCH, held } from '../../lib/launch.ts';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
  if (held(LAUNCH)) error(404, 'Not found');
  return {};
};
