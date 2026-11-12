/**
 * WHAT A MONEY PAGE LANDS ON, KEPT BESIDE THE PAGE ITSELF (12 Nov): the ledger lookup's result, the chips and the books,
 * which a Money page waits for before it shows (`PageView.svelte` `landing`). They live in the local copy (`data/local.ts`)
 * under one answer of their own, `Money`, by the record's address, so they are kept under its rules and no others: one
 * owner at a time, wiped with the copy on a sign-out or Settings' forget, never kept or read while seeing the record as
 * somebody else, `always` (drawn at once and asked again, never taken for current). A first visit, or a copy forgotten,
 * finds nothing, and the page waits for the reads as before.
 *
 * SEEDED ON OPEN, REPLACED WHEN THE READS ANSWER: each reader keeps what it read (`keepMoney`) and takes what was kept
 * before its own read is back (`seedMoney`), so the page lands from the copy and updates in place if the record differs.
 */

import { apiBase } from '../at.ts';
import { quick } from './quick.svelte.ts';
import { looks } from './looks.svelte.ts';
import type { Ledger } from './ledger.ts';
import type { Looks } from './read.ts';

export type Book = { seq: number; name: string };

/** What is kept. A part absent was never read; a `null` ledger is a record that keeps none. */
export type KeptMoney = { ledger?: Ledger | null; looks?: Looks; books?: Record<string, Book[]> };

const NAME = 'Money';

/** THE BOOKS LAST READ, BY RECORD AND LIST (`BookScope.svelte`): in memory for the next book's page, and seeded from the copy. */
export const keptBooks = new Map<string, Book[]>();

/** What this tab holds of each record's, merged: a keep adds a part to it and writes the whole. */
const held = new Map<string, KeptMoney>();
const loading = new Map<string, Promise<void>>();

/** Take what the copy kept for `base` into the readers, once a record a tab. A reader that has an answer already keeps it. */
export function seedMoney(base: string = apiBase()): Promise<void> {
  let p = loading.get(base);
  if (p) return p;
  p = import('$lib/data/local-tab.ts')
    .then(
      (m) =>
        new Promise<void>((done) => {
          const take = (near: { value: unknown } | null): void => {
            done();
            const v = near?.value;
            if (v === null || typeof v !== 'object') return;
            const k = v as KeptMoney;
            held.set(base, { ...k, ...held.get(base), books: { ...k.books, ...held.get(base)?.books } });
            for (const [key, rows] of Object.entries(k.books ?? {})) if (!keptBooks.has(key)) keptBooks.set(key, rows);
            if (k.looks) looks.seed(k.looks);
            if (k.ledger !== undefined && quick.settled !== base) {
              quick.found(base, k.ledger);
              quick.settle(base);
            }
          };
          void m.nearLocal<KeptMoney>(NAME, base, base, take).then(take, () => done());
        }),
    )
    .catch(() => undefined);
  loading.set(base, p);
  return p;
}

/** Keep what a reader just read, beside what is kept already. */
export function keepMoney(part: KeptMoney, base: string = apiBase()): void {
  void (async () => {
    await seedMoney(base);
    const was = held.get(base);
    const next: KeptMoney = { ...was, ...part, books: { ...was?.books, ...part.books } };
    held.set(base, next);
    const [tab, local] = await Promise.all([import('$lib/data/local-tab.ts'), import('$lib/data/local.ts')]);
    /* AS PLAIN JSON: what the readers hold are reactive proxies, which the copy would refuse. */
    tab.keepLocal(NAME, base, [local.EVERY], JSON.parse(JSON.stringify(next)), tab.localTicket(), {}, { always: true });
  })().catch(() => undefined);
}
