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
 * NEGATIVE SEQUENCES, so a pending row can never collide with one the record has. The spoken id is
 * what every screen addresses a row by, and two rows answering to `obligations#7` is the one
 * collision that would put a receipt, a menu or an edit on the wrong one.
 */

import { SvelteMap } from 'svelte/reactivity';

import type { Entry, Fields } from './schema.ts';
import { NOW } from './data.ts';

/**
 * `SvelteMap`, AND IT WAS A PLAIN `Map` IN `$state`, WHICH IS NOT REACTIVE.
 *
 * `$state` proxies plain objects and arrays and hands anything else back unchanged, so every
 * `rows.set` and `rows.delete` below wrote to a `Map` nothing was watching. The whole module was
 * inert: the capture line emptied its box and drew no row, `Put back` on a pending row left it
 * there, and the first-run screen appeared to work only because arriving at the list is a fresh
 * mount that reads the map once.
 *
 * THE RULE WAS ALREADY WRITTEN DOWN IN THIS DIRECTORY, in a file added the same afternoon:
 * `answer.ts` says "a helper that mutated in place would work in a test and draw nothing in a
 * browser". This is that, one file over, and it is the shape this repository exists to catch:
 * three screens took a row from a person, reported success, and changed nothing they could see.
 */
const rows = new SvelteMap<string, Entry[]>();

let next = 0;

/** Add one, and hand back the sequence it was given so a caller can point a receipt at it. */
export function add(register: string, fields: Fields): number {
  next -= 1;
  const seq = next;
  const row: Entry = { seq, version: 1, created: new Date(NOW).toISOString(), by: 'you', fields };
  rows.set(register, [row, ...(rows.get(register) ?? [])]);
  return seq;
}

/** What is waiting for one register, newest first. Empty for a register nobody has typed into. */
export function of(register: string): Entry[] {
  return rows.get(register) ?? [];
}

/**
 * Put different fields on a row that is already waiting, and say whether there was one.
 *
 * THE FIRST-RUN SCREEN ADDED A SECOND ROW EVERY TIME THE BUTTON WAS PRESSED. It stays on its own
 * outcome by design, with the form still filled in and the button still live, so correcting a typo
 * and pressing again is the ordinary thing for somebody to do: three presses left three rows in the
 * list that screen then offers to open, the first two of them the wrong answer, and nothing said so.
 *
 * A ROW THAT IS NOT THERE IS NOT REPLACED, and the caller is told. That is what makes this safe to
 * call after `Put back` has taken the row away: the answer is `false` and the caller adds instead of
 * silently writing a row back that somebody had just removed.
 */
export function replace(register: string, seq: number, fields: Fields): boolean {
  const held = rows.get(register);
  if (!held) return false;
  const at = held.findIndex((r) => r.seq === seq);
  const was = held[at];
  if (!was) return false;
  const next = [...held];
  next[at] = { ...was, fields, version: was.version + 1 };
  rows.set(register, next);
  return true;
}

/** Take one back out. The inverse of `add`, which is what `Put back` calls. */
export function drop(register: string, seq: number): void {
  const held = rows.get(register);
  if (!held) return;
  const left = held.filter((r) => r.seq !== seq);
  if (left.length === 0) rows.delete(register);
  else rows.set(register, left);
}

/**
 * Whether anything is waiting anywhere.
 *
 * FOR THE ONE SENTENCE THAT HAS TO BE TRUE ACROSS SCREENS. A person who typed a row on the first
 * run and then went somewhere else has an unwritten row in this product, and no screen but the one
 * it belongs to would otherwise say so.
 */
export const anyPending = (): number => [...rows.values()].reduce((n, r) => n + r.length, 0);
