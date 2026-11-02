/**
 * The Runs tab moved to the Agents page, where every run is one list with Undo (`panel: run-list`). The old address goes
 * there and keeps its query, so a link carrying a run id still arrives with it.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';
import { agentsPlace } from '$lib/nav/rail.ts';

export async function load({ url, parent }: Pick<LoadEvent, 'url'> & Partial<Pick<LoadEvent, 'parent'>>): Promise<void> {
  /* ON A RECORD WITH NO AGENTS PAGE it goes to Settings › Agents (`agentsPlace`), never to "No page called agents". */
  const pages = parent ? ((await parent()) as { pages?: readonly string[] }).pages : undefined;
  if (Array.isArray(pages) && !pages.includes('agents')) redirect(307, at(agentsPlace(pages), url.pathname));
  redirect(307, at(`/p/agents${url.search}`, url.pathname));
}
