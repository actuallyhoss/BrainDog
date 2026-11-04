/**
 * PIN A PROJECT TO THE SIDEBAR, from wherever it is offered: a project's own "⋯" menu, a card on Projects. Only pinned
 * projects are listed in the sidebar (3 Nov); every project stays on the Projects page. The pins are the person's own
 * (`nav.pins`, `nav-prefs.svelte.ts`), so a pin made on the desk is in the phone's Menu too.
 */

import { navPrefs } from '../nav-prefs.svelte.ts';
import { toasts } from '../ui/toast.svelte.ts';

export const pinWords = {
  pin: 'Pin to sidebar',
  unpin: 'Unpin from sidebar',
  pinName: (name: string) => `Pin ${name} to the sidebar`,
  unpinName: (name: string) => `Unpin ${name} from the sidebar`,
  pinned: (name: string) => `${name} is in the sidebar.`,
  unpinned: (name: string) => `${name} is out of the sidebar. It stays here on Projects.`,
  hint: 'Pin a project to keep it in the sidebar.',
} as const;

/** A project's address as the sidebar keys its pin: `/p/<its page>`. */
/**
 * THE OTHER ADDRESS A PIN MAY BE KEPT AT: a project opens on its page once the record has said which that is, and on its
 * row until then, so a pin made in between holds `/r/things/2` where the row now says `/p/kiln`. Both are the one project.
 */
const rowAddress = (key: string): string | null => {
  const m = /^([a-z][a-z0-9_]*)#([1-9]\d*)$/u.exec(key);
  return m ? `/r/${m[1]}/${m[2]}` : null;
};
const heldAt = (href: string, key: string | undefined): string[] => [href, ...(key ? [rowAddress(key)] : [])].filter((a): a is string => a !== null && navPrefs.isPinned(a));

/** Whether a project is pinned, at either address. `key` is its spoken id (`things#2`), where the caller has it. */
export const isPinnedAt = (href: string, key?: string): boolean => heldAt(href, key).length > 0;

/** Pin it, or take the pin off at whichever address holds it. */
async function setPin(href: string, key: string | undefined, on: boolean): ReturnType<typeof navPrefs.setPinned> {
  if (on) return navPrefs.setPinned(href, true);
  const held = heldAt(href, key);
  for (const a of held.slice(1)) await navPrefs.setPinned(a, false);
  return navPrefs.setPinned(held[0] ?? href, false);
}

export const pinHref = (slug: string): string => `/p/${slug.replace(/^\/?p\//u, '').replace(/^\//u, '')}`;

/** Pin it, or take the pin off, and say so in a toast. A refusal puts the pin back as it was and says why. */
export async function togglePin(href: string, name: string, key?: string): Promise<void> {
  const on = !isPinnedAt(href, key);
  const out = await setPin(href, key, on);
  if (out.from === 'refused') toasts.push(out.fix, { intent: 'warn' });
  else toasts.push(on ? pinWords.pinned(name) : pinWords.unpinned(name));
}
