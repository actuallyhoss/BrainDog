/**
 * BACK CLOSES WHAT IS OPEN, AND ONLY THAT (mobile pass, 2 Nov).
 *
 * On a phone a sheet, a menu risen as a sheet or the search is a layer over the page, and the back gesture is the
 * first thing a thumb tries to put it away with: Android's edge swipe, its back button, the browser's own back. Each
 * of those left the page instead, so a person who opened the face menu on Money and swiped back landed on Today with
 * nothing to show where Money had gone. Measured at 390 on a local Maya: the face menu, a row's menu, New task, the
 * bell and the search all went back a page.
 *
 * SO A BACK WHILE ONE IS OPEN IS CANCELLED AND CLOSES THE TOPMOST, and the next back goes back a page as before. Kit
 * puts the history where it was when a `popstate` move is cancelled (`history.go(-delta)`), so no entry is pushed and
 * nothing is left behind for a later back to land on: a layer closed with Escape, its Close or a pull down costs no
 * extra press of back.
 *
 * NOT A BACK THAT STAYS ON THE SAME PAGE. A row peeked from a list is its own entry (`?row=`), and back is already how
 * it closes; taking that move away would leave the peek's entry behind. So only a back to another path is held.
 *
 * Called from a component's script, as `beforeNavigate` must be.
 */

import { beforeNavigate } from '$app/navigation';

/** The open layers that close on back, the newest last. */
const stack: symbol[] = [];

/**
 * Close this layer on a back gesture while it is open and on top.
 *
 * @param open whether the layer is open now, read at the moment back is pressed and by an effect that keeps its place
 * @param close puts it away the way its own Close does
 */
export function backCloses(open: () => boolean, close: () => void): void {
  const me = Symbol('layer');
  $effect(() => {
    if (!open()) return;
    stack.push(me);
    return () => {
      const i = stack.lastIndexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  });
  beforeNavigate((nav) => {
    if (nav.type !== 'popstate' || (nav.delta ?? -1) > 0 || !open() || stack.at(-1) !== me) return;
    if (nav.from === null || nav.to === null || nav.to.url.pathname === nav.from.url.pathname) return;
    nav.cancel();
    close();
  });
}
