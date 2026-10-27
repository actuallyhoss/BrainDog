/**
 * Held from 23 October (his call 10; `HELD` in `launch.ts`): brain.dog holds invitations, so a team that signed up
 * from this page could not do what it shows. Prerendered on every day and answering 404 while held, as the students'
 * page is, so the build writes no file and the site's own 404 page answers the address. The page and its words stay for
 * the day teams open.
 */
import { error } from '@sveltejs/kit';
import { FOR_SHOWN } from '../../../lib/launch.ts';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
  if (!FOR_SHOWN.includes('/for/teams')) error(404, 'Not found');
  return {};
};
