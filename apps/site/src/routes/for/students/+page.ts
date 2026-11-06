/** Off whatever the flags say (`NEVER_SHOWN` in `launch.ts`). The words stay for the day it is shown. */
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
  error(404, 'Not found');
};
