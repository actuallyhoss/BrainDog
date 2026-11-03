/**
 * Opening the send sheet from anywhere: a row's button, its `s`, a long press on a phone, a selection, a Decide card,
 * Slash's own footer.
 *
 * THE SHEET IS ITS OWN CHUNK, fetched on the first press, and mounted on the page's body rather than in the layout, so
 * nothing of it is on a screen's first load. One sheet at a time: opening another closes the one that was open.
 */

import { mount, unmount } from 'svelte';

import type { Attached } from './send.ts';

/** Which target the sheet opens on: Auto, Slash, the first machine, or one target by its id. */
export type Preset = 'auto' | 'slash' | 'mac' | { id: string };

export type SheetAsk = {
  /** The kind of thing it starts from, whose last target the sheet's send becomes (a row's list, `decide`, `run`, `sign`). */
  kind: string;
  attach: Attached[];
  /** What opened it. The sheet is mounted inside the dialog this is in, where there is one; it no longer hangs from it. */
  anchor?: Element | null | undefined;
  preset?: Preset | undefined;
  /** The project the thing is on, by its ref, so Auto can say a session working on it takes it. */
  project?: string | null | undefined;
  /** The note it opens with. */
  note?: string | undefined;
  /** The question Slash is asked when no note is written. */
  fallback?: string | undefined;
};

let shown: { app: Record<string, unknown>; back: Element | null } | null = null;

/** Close the open sheet and give the focus back to what opened it. */
export function closeSheet(): void {
  const was = shown;
  shown = null;
  if (!was) return;
  void unmount(was.app);
  if (was.back instanceof HTMLElement && was.back.isConnected) was.back.focus({ preventScroll: true });
}

export async function openSheet(ask: SheetAsk): Promise<void> {
  const back = document.activeElement;
  const { default: SendSheet } = await import('./SendSheet.svelte');
  closeSheet();
  /* INSIDE THE DIALOG IT WAS OPENED FROM, where there is one: a modal dialog (the row's panel as a sheet, the palette)
     makes everything outside it inert, so a sheet on the body could not be pressed. */
  const target = ask.anchor?.closest('dialog[open]') ?? document.body;
  /* ITS OWN CLOSE TAKES ONLY ITSELF AWAY: it lands after the drawer has gone, by which time another may be open. */
  const app: Record<string, unknown> = mount(SendSheet, { target, props: { ask, onclose: () => shown?.app === app && closeSheet() } });
  shown = { app, back };
}
