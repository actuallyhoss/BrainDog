/**
 * Plugins moved from `/addons` to `/plugins` (3 Nov). Every old address goes where it means now and keeps its query
 * (`../moved.ts` `pluginsFrom`): a shared link, a bookmark, a push that opens a plugin's page and a Decide card filed
 * before the move still land. The modules beside this file stay where they are; only the pages moved.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

import { pluginsFrom } from '../moved.ts';

export function load({ url, params }: Pick<LoadEvent, 'url' | 'params'>): void {
  redirect(308, at(pluginsFrom(String(params.rest ?? ''), url.search), url.pathname));
}
