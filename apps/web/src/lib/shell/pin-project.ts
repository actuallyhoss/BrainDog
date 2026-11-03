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
export const pinHref = (slug: string): string => `/p/${slug.replace(/^\/?p\//u, '').replace(/^\//u, '')}`;

/** Pin it, or take the pin off, and say so in a toast. A refusal puts the pin back as it was and says why. */
export async function togglePin(href: string, name: string): Promise<void> {
  const on = !navPrefs.isPinned(href);
  const out = await navPrefs.setPinned(href, on);
  if (out.from === 'refused') toasts.push(out.fix, { intent: 'warn' });
  else toasts.push(on ? pinWords.pinned(name) : pinWords.unpinned(name));
}
