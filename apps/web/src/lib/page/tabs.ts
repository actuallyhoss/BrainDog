/**
 * The tab strip a declared page draws above itself, read from the shell's `nav` (brief D3, primitive P2).
 *
 * A SECTION IS TABBED WHEN ANY PAGE IN IT SAYS `nav.tabs: true`, not only the page you are on. A launch desk is a page
 * somebody wrote beside a template that makes one page per area, and the two are declared apart: requiring every one of
 * them to say it would draw a strip on the desk and none on the areas it links to, or the other way round.
 *
 * IT IS THE RAIL'S LIST AND THE RAIL'S ORDER. The strip reads the same `nav` the rail draws and orders it with the same
 * `arrange`, handed the same arrangement, so a reader who moved Numbers up in the rail finds it moved in the strip too.
 * A second ordering rule here would be the drift `nav.ts` already has a paragraph about.
 *
 * PURE, SO `node --test` READS IT WITH NO SVELTEKIT. `PageTabs.svelte` draws what this answers and decides nothing.
 */

import { arrange } from '../nav.ts';

/** A nav entry as the shell carries it, with the one key this reads. */
export type TabEntry = { title: string; href: string; section: string; order: number; tabs?: boolean | undefined };

export type Tab = { href: string; title: string; current: boolean };

/** The strip for one page: its section's name, the tabs drawn, and any behind More. */
export type Strip = { section: string; shown: Tab[]; more: Tab[] };

/**
 * HOW MANY TABS SIT IN THE STRIP BEFORE THE REST GO BEHIND MORE, and it is a constant rather than a measurement for the
 * reason `TopBar.svelte` gives for its own four: a strip that measured itself would put a different page behind More at
 * every window width. Twelve is the brief's number. On a phone the strip scrolls sideways well before twelve, so the
 * number only decides when a section has become too long to be a row of tabs at all.
 */
export const TABS_SHOWN = 12;

/**
 * The strip over `href`, or `null` when there is none to draw.
 *
 * NONE FOR A SECTION OF ONE PAGE. A single tab names the page the head under it already names, and is a bar with
 * nowhere to go. An address the nav does not hold draws none either, since there is no section to read.
 *
 * THE CURRENT PAGE STAYS WHERE ITS ORDER PUTS IT, behind More if that is where it falls. Pulling it forward would move
 * every tab after it each time somebody opened one, and a strip whose tabs change places is not a strip of places.
 *
 * A PAGE THE READER HID FROM THE RAIL IS NOT A TAB EITHER, the root layout's rule for the top bar and the More sheet
 * ("one nav, not two"), except the page they are on, which they reached by its address and are reading.
 */
export function tabsOf(
  nav: readonly TabEntry[],
  href: string,
  mine: { order?: readonly string[]; hidden?: readonly string[] } = {},
): Strip | null {
  const here = nav.find((e) => e.href === href);
  if (!here) return null;
  const hidden = new Set(mine.hidden ?? []);
  const siblings = nav.filter((e) => e.section === here.section && (e.href === href || !hidden.has(e.href)));
  if (siblings.length < 2 || !siblings.some((e) => e.tabs === true)) return null;
  const ordered = arrange(siblings, mine.order ?? [])[0]?.[1] ?? [];
  const tabs = ordered.map((e) => ({ href: e.href, title: e.title, current: e.href === href }));
  return { section: here.section, shown: tabs.slice(0, TABS_SHOWN), more: tabs.slice(TABS_SHOWN) };
}
