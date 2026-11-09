/**
 * The books Money shows ("Everything", Personal, each business), read as `BookScope.svelte` reads them, and asked with
 * Money's own first read when the ledger is known by then (`routes/p/[slug]`), so the row is drawn with the page and
 * not a round trip after it (speed-e SE3). Held for one first read (`early-asks.ts`).
 *
 * PURE ENOUGH FOR NODE: no rune, no `$lib`.
 */

import { createClient } from '@braindog/client';

import { askEarly, takeEarly } from '../data/early-asks.ts';
import type { SideList } from './ledger.ts';

/** The most books the row names. */
export const BOOKS_MOST = 12;

const key = (base: string, book: SideList): string => `${base} books ${book.list}`;

/**
 * The record's `list` of the books, IN THE ORDER THEY WERE MADE, as the row reads it; `ahead` when asked before the row
 * draws. The first book a person makes is their own money (Personal), and a business comes after it: name order put
 * an "Acme" before Personal (9 Nov, the owner: "i need the personal page to show first and then quartz").
 */
export const readBooks = (base: string, book: SideList, ahead = false) =>
  createClient({ base, ...(ahead ? { ahead } : {}) }).list({ register: book.list, limit: BOOKS_MOST, order: [{ field: 'seq', dir: 'asc' }] });

/** Ask the books now, for the row to take when it draws. */
export function askBooks(base: string, book: SideList): void {
  askEarly(key(base, book), () => readBooks(base, book, true));
}

/** The books asked ahead, handed once while fresh: `null` when the row reads for itself. */
export const takeBooks = (base: string, book: SideList): Promise<Awaited<ReturnType<typeof readBooks>> | null> | null =>
  takeEarly<Awaited<ReturnType<typeof readBooks>>>(key(base, book));
