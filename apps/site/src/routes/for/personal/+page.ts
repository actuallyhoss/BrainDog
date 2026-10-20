/**
 * Held from 20 October (D5, `HELD` in `launch.ts`): the slogan is about a business, and this page pulls the other way.
 * Prerendered on every day and answering 404 while held, as `/changelog` is, so the build writes no file and the
 * site's own 404 page answers the address. The page and its words stay for the day it is shown.
 */
import { error } from '@sveltejs/kit';
import { LAUNCH, held } from '../../../lib/launch.ts';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
  if (held(LAUNCH)) error(404, 'Not found');
  return {};
};
