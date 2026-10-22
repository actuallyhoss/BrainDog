/**
 * The Runs tab moved to the Agents page, where every run is one list with Undo (`panel: run-list`). The old address goes
 * there and keeps its query, so a link carrying a run id still arrives with it.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  redirect(307, at(`/p/agents${url.search}`, url.pathname));
}
