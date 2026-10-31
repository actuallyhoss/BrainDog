/** What the person said to widget offers, as plain functions a test can load in Node (`widget-held.svelte.ts`). */

import { recordToday } from '../record/zone.ts';

/** What `widgets.held` holds. */
export type Held = { notNow: string[]; last?: string; forgot?: string };

/** The most Not nows kept, as the record keeps them (`WIDGETS_NOT_NOW_MOST`). */
const NOT_NOW_MOST = 40;

/** The record's day, in its own zone (AH22), as the record counts a Not now. */
export const today = (now = Date.now()): string => recordToday(now);

/** `widgets.held` as `boot` said it, held to its shape; anything else is nothing said yet. */
export function heldOf(v: unknown): Held {
  const bag = v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const notNow = Array.isArray(bag.notNow) ? bag.notNow.filter((k): k is string => typeof k === 'string') : [];
  return { notNow, ...(typeof bag.last === 'string' ? { last: bag.last } : {}), ...(typeof bag.forgot === 'string' ? { forgot: bag.forgot } : {}) };
}

/** The held words after one more answer: a Not now kept with its day, and today as the day one was answered. */
export function answered(held: Held, key: string | null, now = Date.now()): Held {
  const day = today(now);
  const notNow = key === null ? held.notNow : [...held.notNow.filter((k) => !k.startsWith(`${key}@`)), `${key}@${day}`].slice(-NOT_NOW_MOST);
  return { ...held, notNow, last: day };
}

/** The held words after Forget: what was learned before today no longer counts, and nothing waits as put off. */
export const forgotten = (held: Held, now = Date.now()): Held => ({ notNow: [], forgot: today(now), ...(held.last ? { last: held.last } : {}) });

