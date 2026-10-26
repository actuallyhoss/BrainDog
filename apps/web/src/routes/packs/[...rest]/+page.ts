/**
 * Add-ons moved from `/packs` to `/addons`, and what this record holds to Settings › Add-ons. Every old address goes
 * where it means now and keeps its query (`../../addons/moved.ts`): a shared link, a bookmark and a Decide card filed
 * before the move still land.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

import { movedFrom } from '../../addons/moved.ts';

export function load({ url, params }: Pick<LoadEvent, 'url' | 'params'>): void {
  redirect(308, at(movedFrom(String(params.rest ?? ''), url.search), url.pathname));
}
