/**
 * `/decide/<id>/thread` is where a phone's "Someone mentioned you in a comment" opens for a name under a question
 * (leftovers 4, 2 Nov): its own path, so the phone tells it from "Someone handed you something", which opens the question
 * itself. It goes on to the question, at its thread, and the address is replaced so Back does not bounce.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

export function load({ params, url }: Pick<LoadEvent, 'url'> & { params: Record<string, string> }): void {
  redirect(307, `${at(`/decide/${encodeURIComponent(params.id ?? '')}`, url.pathname)}#thread`);
}
