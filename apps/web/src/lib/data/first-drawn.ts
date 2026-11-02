/**
 * Whether the tab's first screen has drawn what it opened on, for the reads nothing over the fold waits on.
 *
 * A BROWSER KEEPS SIX REQUESTS TO ONE HOST AT ONCE, and on Today's first open the account's records for the switcher and
 * who is working now, asked again behind what `boot` said of them, took two of the six while Today's page was asked, so
 * the page and the walks of the lists its rows name waited their turn. They are asked once
 * the first screen has drawn instead, or after `FIRST_WAIT_MS` should it not, and what they fill in was drawn from
 * `boot` meanwhile, so nothing moves for the wait.
 *
 * ONCE A TAB: a later screen has drawn its first already, and nothing waits.
 *
 * AND THE NATIVE APPS ARE TOLD (`shellReady` in `shell.ts`): the iPhone's launch picture of Today sits over the page
 * until this moment and then fades, so nothing half drawn is ever seen. A browser has no shell, and is told nothing.
 */

import { shellReady } from '../shell.ts';

let heard: (() => void) | null = null;
const drawn = new Promise<void>((done) => (heard = done));

/** The first screen has drawn what it opened on. */
export function drewFirst(): void {
  if (heard === null) return;
  heard();
  heard = null;
  shellReady();
}

/** Whether the tab's first screen has drawn already: a screen opened after it is not the first open. */
export const firstDrawn = (): boolean => heard === null;

/** The longest a read waits for the first screen. */
export const FIRST_WAIT_MS = 1_500;

/** Once the first screen has drawn, or `FIRST_WAIT_MS` from now. */
export const afterFirst = (): Promise<void> => Promise.race([drawn, new Promise<void>((done) => setTimeout(done, FIRST_WAIT_MS))]);
