/**
 * The list of runs moved to the Agents page (`panel: run-list`). This address goes there and keeps its query, except for
 * `?start` and `?repo=`, which stay: "Run a job" opens its sheet here, and a project's "Runs on" link narrows this list
 * to the runs in one repository, which the Agents page does not do.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';
import { agentsPlace } from '$lib/nav/rail.ts';

export async function load({ url, parent }: Pick<LoadEvent, 'url'> & Partial<Pick<LoadEvent, 'parent'>>): Promise<void> {
  if (url.searchParams.has('start') || url.searchParams.has('repo')) return;
  /* ON A RECORD WITH NO AGENTS PAGE (a new BrainDog has no agents pack) it goes to Settings › Agents (`agentsPlace`),
     never to "No page called agents". */
  const pages = parent ? ((await parent()) as { pages?: readonly string[] }).pages : undefined;
  if (Array.isArray(pages) && !pages.includes('agents')) redirect(307, at(agentsPlace(pages), url.pathname));
  redirect(307, at(`/p/agents${url.search}`, url.pathname));
}
