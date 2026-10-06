/**
 * A customise row, pressed: the change made by the writer that already makes it, and a toast that can put it back.
 *
 * NO SECOND WRITER. The person's look is `pref.ts`'s `apply`, kept by the record, which Settings › Appearance calls; the person's
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
import { lookSaid, type Change, type Look } from './customise.ts';

const w = copy.customise;

/** How it looks on this device now, for `customise()` to leave out the rows that would change nothing. */
export const lookNow = (): Look => {
  const held = pref.read();
  return { scheme: held.scheme, text: held.text, density: held.density };
};

/** Where a look change would be kept now, for the line under each look row. */
export const keptNow = (): 'record' | 'pending' | 'device' => pref.whereKept();

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

/** How long a look's toast waits for the record before it says "for now". */
const ANSWER_MS = 800;

/** One look setting, set, and set back on Undo. `system` is the scheme with no attribute, as Appearance writes it. */
function look(key: 'scheme' | 'text' | 'density', value: string, name: string): void {
  const before = pref.read()[key] ?? null;
  const put = (v: string | null): Promise<pref.Kept> => {
    const kept = pref.apply(key, v);
    /* A DENSITY PICKED ON THIS DEVICE BEATS THE RECORD'S LOOK, so the look is drawn again without its row height. */
    if (key === 'density') redraw();
    return kept;
  };
  /* THE PAGE CHANGES AT ONCE; THE TOAST WAITS FOR THE RECORD'S ANSWER, so it says where the change was kept and not
     where it was hoped to be. BUT NOT LONG: a send still on its way after `ANSWER_MS` is owed and goes again on the next
     boot, which is what "for now" says, and the Undo is not held back behind a slow network. */
  let late: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<pref.Kept>((resolve) => (late = setTimeout(() => resolve({ from: 'pending' }), ANSWER_MS)));
  void Promise.race([put(value === 'system' ? null : value), waited]).then((kept) => {
    clearTimeout(late);
    toasts.push(lookSaid(kept, name), { undo: () => void put(before) });
  });
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
