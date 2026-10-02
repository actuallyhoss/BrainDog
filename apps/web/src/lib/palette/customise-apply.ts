/**
 * A customise row, pressed: the change made by the writer that already makes it, and a toast that can put it back.
 *
 * NO SECOND WRITER. How it looks on this device is `pref.ts`'s `apply`, which Settings › Appearance calls; the person's
 * nav is `navPrefs`, which Settings › Pages and Navigation call. So a change made here is the same change, kept in the
 * same place, and Settings shows it as it stands.
 *
 * THE UNDO PUTS BACK WHAT WAS THERE, read before the write, rather than guessing the opposite: undoing "Dark mode" on a
 * device that matched the system puts the system back, not light.
 */

import { copy } from '../copy.ts';
import { navPrefs, type Saved } from '../nav-prefs.svelte.ts';
import * as pref from '../pref.ts';
import { redraw } from '../theme/draw.ts';
import { toasts } from '../ui/toast.svelte.ts';
import type { Change, Look } from './customise.ts';

const w = copy.customise;

/** How it looks on this device now, for `customise()` to leave out the rows that would change nothing. */
export const lookNow = (): Look => {
  const held = pref.read();
  return { scheme: held.scheme, text: held.text, density: held.density };
};

/**
 * THE PAGE MENU OF THE SCREEN BEHIND THE PALETTE (`ChangePage.svelte`), or `null` where the screen has none. Its
 * `page-more` class is the name that file gives its way in for exactly this kind of caller, so nothing here reaches
 * into a page's own state.
 */
export const pageMenu = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.page-more .menu-trigger');

/** A refusal is the record's own sentence; a change it kept says what it came to, with the way back. */
function said(saved: Saved, done: string, undo: () => void): void {
  if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
  else toasts.push(done, { undo });
}

/** One look setting, set, and set back on Undo. `system` is the scheme with no attribute, as Appearance writes it. */
function look(key: 'scheme' | 'text' | 'density', value: string, name: string): void {
  const before = pref.read()[key] ?? null;
  const put = (v: string | null) => {
    pref.apply(key, v);
    /* A DENSITY PICKED ON THIS DEVICE BEATS THE RECORD'S LOOK, so the look is drawn again without its row height. */
    if (key === 'density') redraw();
  };
  put(value === 'system' ? null : value);
  toasts.push(w.lookSet(name), { undo: () => put(before) });
}

/** Makes the change a row names. `page` and `go` and `fill` are the palette's, which owns the screen and the box. */
export function apply(change: Change): void {
  switch (change.kind) {
    case 'look':
      return look(change.key, change.value, change.name);
    case 'home': {
      const before = navPrefs.home;
      void navPrefs.setHome(change.href).then((saved) => said(saved, w.homeSet(change.name), () => void navPrefs.setHome(before)));
      return;
    }
    case 'hide':
      void navPrefs.hide(change.href).then((saved) => said(saved, w.hidden(change.name), () => void navPrefs.show(change.href)));
      return;
    case 'show':
      void navPrefs.show(change.href).then((saved) => said(saved, copy.shownInNav(change.name), () => void navPrefs.hide(change.href)));
      return;
    case 'rename': {
      const before = navPrefs.labels[change.href] ?? null;
      const back = change.to === change.own;
      void navPrefs
        .setLabel(change.href, change.to, change.own)
        .then((saved) => said(saved, back ? w.unnamed(change.own) : w.renamed(change.from, change.to), () => void navPrefs.setLabel(change.href, before, change.own)));
      return;
    }
    default:
      return;
  }
}
