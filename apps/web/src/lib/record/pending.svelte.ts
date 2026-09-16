/**
 * Rows somebody typed on this screen that the record has not been given yet.
 *
 * THE FIRST-RUN SCREEN DID NOT PRODUCE THE ROW IT PROMISED, AND DID NOT SAY SO. A friction pass
 * measured the whole path and ranked it first of the ten things costing a person the most: four
 * clicks, twenty-five keystrokes, six decisions, three screens, and zero rows. The screen asks for
 * one true fact about your own business, takes it, and the list you arrive at holds thirty-eight
 * rows belonging to a fictional studio with yours nowhere among them.
 *
 * THE HONEST FIX IS NOT A WRITE PATH, WHICH DOES NOT EXIST YET. It is that the row somebody typed
 * is the row they then see, wearing the truth about itself. This module is where it waits: added on
 * one screen, drawn on another, marked `Not saved`, and dropped by the same `Put back` every other
 * verb in the product offers.
 *
 * IT IS NOT A CACHE AND IT IS NOT STORAGE. It lives for as long as the tab does. A row that
 * survived a reload would be a row this product had promised to keep, and it cannot keep one: an
 * unwritten row that comes back tomorrow looking saved is worse than one that is honestly gone.
 * `pref.ts` is per device and is for preferences; a row is not a preference.
 *
 * THE ROWS THEMSELVES ARE ONE FILE OVER, in `pending-held.svelte.ts`, and that file says why. This
 * one holds the clock, which is the only thing here the record has to be loaded to know.
 */

import { NOW } from './data.ts';
import { keep } from './pending-held.svelte.ts';
import type { Fields } from './schema.ts';

export { anyPending, drop, of, replace } from './pending-held.svelte.ts';

/**
 * Add one, and hand back the sequence it was given so a caller can point a receipt at it.
 *
 * `sample` IS WHAT THE SCREEN TAKING THE ROW BELIEVES IT IS LOOKING AT, and it is passed rather
 * than assumed here for the reason `pending-held.svelte.ts` sets out: every caller of this is
 * already inside its own answer to that question, the three screens do not all ask the same call,
 * and a row drawn against the wrong one is somebody else's row standing in a live business.
 */
export function add(register: string, fields: Fields, sample: boolean): number {
  return keep(register, fields, new Date(NOW).toISOString(), sample);
}
