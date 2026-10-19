/**
 * `/download`, held until a signed Mac build exists (`HELD` in `launch.ts`). Held as `/pricing` is: prerendered on
 * every day, answering 404 while held, so the build writes no `download.html` and the site's 404 page answers it.
 */
import { error } from '@sveltejs/kit';
import { LAUNCH, held } from '../../lib/launch.ts';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
  if (held(LAUNCH)) error(404, 'Not found');
  return {};
};
