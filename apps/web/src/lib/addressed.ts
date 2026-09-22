/**
 * The links `braindog-render` draws, put under the app after they are drawn.
 *
 * A STOPGAP, AND IT SAYS SO. Every link this app renders itself goes through `at()`, and `lib/at-sites.test.ts` holds
 * that. The block renderer is another package: it reads a queue's "N more", a table row's link, a capture line's list
 * and a note's `[label](/r/x)` out of the record's own cells and draws each as a plain `<a href="/…">`, which under
 * `paths.base = '/app'` is outside the app, so a press loads `brain.dog/decide`, the marketing site's 404. The repair
 * that belongs is a link hook in `braindog-render`'s `RenderOptions`, beside the `link` and `cellHref` it already
 * takes; until it has one, this rewrites the attribute, so the address stays real for a new tab and a copied link,
 * which is why it is not a click handler.
 */

import { at } from './at.ts';

/** Put every root-path anchor under `root` under the app. `at` leaves one it has already addressed as it is. */
export function readdress(root: ParentNode): void {
  for (const a of root.querySelectorAll('a[href^="/"]')) {
    const was = a.getAttribute('href') ?? '';
    const to = at(was);
    if (to !== was) a.setAttribute('href', to);
  }
}

/**
 * An attachment for `<main>`: once now, and again whenever a block draws or redraws a link.
 *
 * THE OBSERVER SEES ITS OWN WRITE, and that is why `readdress` compares before it sets: the second pass finds every
 * `href` already addressed, writes nothing, and so wakes nothing.
 */
export function addressed(node: HTMLElement): () => void {
  readdress(node);
  const seen = new MutationObserver(() => readdress(node));
  seen.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  return () => seen.disconnect();
}
