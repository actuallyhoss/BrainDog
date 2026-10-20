/**
 * WHAT THE HUB'S TWO SCREENS TELL THE ONE HEAD OVER THEM (`+layout.svelte`).
 *
 * `/automations` and `/automations/runs` are two pages, and a page that draws its own head draws its own tabs: going
 * to Runs took the control away and drew another, so the selection never moved, it was put down afresh. The head and
 * its tabs are drawn once, in the layout both pages sit under, and each page says here what only it has read.
 *
 * KEPT BY KIND, NOT AS "THE COUNT": the layout picks by the tab the address names, so a figure one page left behind is
 * never shown over the other.
 *
 * AND CLEARED WHEN THE TAB CHANGES (`clearHead`), so a figure a tab left behind is not shown over that same tab on
 * the way back, before it has read again.
 */

import { getContext, setContext } from 'svelte';
import { tabOf, type Sentence, type Tab } from './hub.ts';

export type HubHead = {
  /** How many automations there are, once read. */
  automations: number | undefined;
  /** The sentence under the name on the Automations tab: how many run by themselves, and which one is failing. */
  said: Sentence | null;
  /** How many runs are listed, once read. */
  runs: number | undefined;
  /** The Runs tab's sentence: said only while nothing has run, so the empty screen still says what it holds. */
  runsSaid?: string | undefined;
};

const KEY = Symbol('hub-head');

/** A head with nothing read yet. */
export const emptyHead = (): HubHead => ({ automations: undefined, said: null, runs: undefined, runsSaid: undefined });

/**
 * Nothing read yet, on the head the pages already hold. THE HEAD OUTLIVES THE PAGE UNDER IT, so a figure read on one
 * visit to a tab was still there on the next and was shown as today's while the page read again: four automations
 * over a list of three. The layout calls this when the tab changes. The object is cleared, never swapped, because
 * each page took its handle once and a new object would never hear it.
 */
export function clearHead(head: HubHead): HubHead {
  head.automations = undefined;
  head.said = null;
  head.runs = undefined;
  head.runsSaid = undefined;
  return head;
}

/** The layout shares its head (a `$state` object, so a page's write redraws it). */
export const shareHead = (head: HubHead): HubHead => setContext(KEY, head);

/** A page's handle on the head over it. */
export const hubHead = (): HubHead => getContext<HubHead>(KEY);

/** The two addresses the head is drawn over; one automation's own screen draws its own. */
const HUB_ROUTES: Readonly<Record<string, 'hub' | 'runs'>> = { '/automations': 'hub', '/automations/runs': 'runs' };

/** The tab an address is on, or null where the address is not one of the hub's two screens. */
export function tabHere(routeId: string | null, params: URLSearchParams): Tab | null {
  const screen = routeId === null ? undefined : HUB_ROUTES[routeId];
  if (screen === undefined) return null;
  return screen === 'runs' ? 'runs' : tabOf(params);
}

/** What the head shows for a tab: the count beside the name and the sentence under it. */
export function headFor(tab: Tab, head: HubHead): { count: number | undefined; sentence: string | undefined; needs: string | undefined } {
  if (tab === 'automations') return { count: head.automations, sentence: head.said?.text, needs: head.said?.needs || undefined };
  if (tab === 'runs') return { count: head.runs, sentence: head.runsSaid, needs: undefined };
  return { count: undefined, sentence: undefined, needs: undefined };
}
