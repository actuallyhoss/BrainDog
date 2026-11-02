/**
 * THE PAGES THAT HAVE A SCREEN OF THEIR OWN, sent on before anything draws.
 *
 * `/p/activity` IS THE PAGE PEOPLE DECLARES FOR WHAT CHANGED, and Activity is one screen, `/audit`, which the rail opens.
 * Two drawings of one log read differently ("Handled decided Filed 2…" on one, sentences on the other), so the page's
 * address goes to the screen, with its filters, and the address is replaced so Back does not bounce.
 *
 * Read in the record the address names (`at` keeps its slug).
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { createClient } from '@braindog/client';

import { apiBase, at } from '$lib/at.ts';
import { agentsPlace } from '$lib/nav/rail.ts';
import { REGISTERS } from '$lib/record/held.ts';
import { learn } from '$lib/record/remote.ts';
import { spokenOf } from '$lib/record/row-href.ts';

/**
 * Each page, and the screen it is drawn as.
 *
 * `/p/scripts` TOO: `/scripts` draws the People add-on's own `page.scripts` under a head of
 * its own, so the page's address was a second list of the same scripts, with a line in place of the count.
 */
const SCREENS: Readonly<Record<string, string>> = { activity: '/audit', scripts: '/scripts' };

/** The lists asked for here, once each, as the row's screen asks (`r/[register]/[seq]/+page.ts`). */
const asked = new Map<string, Promise<void>>();

export async function load({ params, url, parent, fetch }: Pick<LoadEvent, 'params' | 'url'> & Partial<Pick<LoadEvent, 'parent' | 'fetch'>>): Promise<void> {
  const to = Object.hasOwn(SCREENS, params.slug ?? '') ? SCREENS[params.slug ?? ''] : undefined;
  if (to) redirect(307, at(`${to}${url.search}`, url.pathname));
  /* A PERSON'S OR AN ORGANISATION'S PAGE BY THE ROW (`/p/people%233`) IS THEIR ROW'S SCREEN (pages polish, 2 Nov): People's
     template page drew a nameless card, "Role Contractor" and the raw sighting "commit 3f2a91c", where `/r/people/3` says
     who they are, how they are known, and the money and work with them. Every link opens the screen now (`rowHref`), and
     an address kept from before goes there too, replaced so Back does not bounce. */
  const row = spokenOf((params.slug ?? '').replace(/%23/giu, '#'));
  if (row) {
    if (parent) await parent();
    if (REGISTERS[row.register] === undefined) await learn(createClient({ base: apiBase(url), ...(fetch ? { fetch } : {}) }).schema, row.register, asked).catch(() => undefined);
    const decl = REGISTERS[row.register];
    if (decl && (decl.meets !== undefined || decl.org !== undefined)) redirect(307, at(`/r/${row.register}/${row.seq}${url.search}`, url.pathname));
  }
  /* THE AGENTS PAGE ON A RECORD THAT DOES NOT HOLD IT (empty states, 2 Nov): a new BrainDog has no agents pack, and an
     address kept from somewhere (an alert, a bookmark, an old link) answered "No page called agents". It goes to
     Settings › Agents, where an agent is connected (`agentsPlace`). Only this page waits on the shell to know. */
  if (params.slug === 'agents' && parent) {
    const shell = (await parent()) as { pages?: readonly string[] };
    if (Array.isArray(shell.pages) && !shell.pages.includes('agents')) redirect(307, at(agentsPlace(shell.pages), url.pathname));
  }
}
