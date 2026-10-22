/**
 * The list of runs moved to the Agents page (`panel: run-list`). This address goes there and keeps its query, except for
 * `?start` and `?repo=`, which stay: "Run a job" opens its sheet here, and a project's "Runs on" link narrows this list
 * to the runs in one repository, which the Agents page does not do.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  if (url.searchParams.has('start') || url.searchParams.has('repo')) return;
  redirect(307, at(`/p/agents${url.search}`, url.pathname));
}
