/**
 * The ledger on a real record: money that moved, the promise each payment discharged, the transfer
 * that is not spending, and the rule that files a category so nobody is asked what `FENWICK CLOUD` is
 * for a third time.
 *
 * WHY THIS FILE EXISTS. Before it, Money held `obligations` and `accounts` and nothing between them,
 * so the record could say what was due and what the bank said, and could not say that money had moved.
 * Every assertion here is about a row the record now holds and could not hold at all a commit ago.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { CATEGORIES, METRICS, NOW, TRANSACTIONS, day, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

const minor = (v: unknown): number => (v as { amount: number }).amount;

/** The rows of the ledger as the record holds them, in the order they were written. */
const ledger = (k: Kernel): Entry[] => {
  const out = k.list({ register: 'transactions', limit: 500 });
  assert.ok(out.ok, sayOf(out));
  return out.value.rows;
};

test('THE LEDGER HOLDS WHAT MOVED, and each payment names the promise it discharged', async () => {
  const k = await seeded();
  assert.equal(k.count('transactions'), TRANSACTIONS.length);

  /* RECONCILE IS ONE FIELD. `settles` points at the invoice, and the two amounts are the same money:
     a payment that says it settled an invoice for a different figure is the thing this link exists to
     make visible rather than to hide. */
  const paidInvoice = k.get('transactions#1')!;
  const invoice = k.get('obligations#9')!;
  assert.equal(paidInvoice.fields.settles, invoice.id, 'the payment does not point at the invoice it settled');
  assert.deepEqual(paidInvoice.fields.amount, invoice.fields.amount);
  assert.equal(invoice.fields.state, 'paid');
});

test('A TRANSFER IS NOT SPENDING, AND A PENDING ROW IS NOT A FACT, and the figure leaves both out', async () => {
  const k = await seeded();
  /* SPENT'S OWN WINDOW, `on after -30d`: `after` does not include its own day, so the thirty days are the ones after
     day -30. This said `day(-31)` and counted a day the figure does not (`loop/finish/defects.md` M16). */
  const since = day(-30);
  const counted = TRANSACTIONS.filter((t) => t.state === 'cleared' && t.transfer !== true && t.direction === 'out' && String(t.on) > since);
  const expected = counted.reduce((n, t) => n + minor(t.amount), 0);

  const read = k.metric(METRICS['spent-30d'] as never);
  assert.ok(read.ok, sayOf(read));
  assert.equal(read.value.value, expected);

  /* THE NUMBER THE SAME WINDOW GIVES WITHOUT THE TWO CLAUSES, which is higher by the payment that cleared the company
     card and the stand deposit the bank has not settled: neither is spending. */
  const naive = TRANSACTIONS.filter((t) => t.direction === 'out' && String(t.on) > since).reduce((n, t) => n + minor(t.amount), 0);
  assert.ok(naive > expected, 'the sample has no transfer and no pending row inside the window, so this proves nothing');
});

test('THE RULE FILES WHAT IT CAN AND THE FIGURE COUNTS WHAT IS LEFT, which is the job a person is given', async () => {
  const k = await seeded();
  const matched = new Map(CATEGORIES.filter((c) => typeof c.match === 'string').map((c) => [c.match as string, c.name as string]));
  assert.equal(matched.size, 5, 'the sample stopped having five merchants a category names');

  const nameOf = (id: unknown): string | null => (typeof id === 'string' ? (k.get(id)?.fields.name as string) ?? null : null);
  let filed = 0;
  let left = 0;
  for (const entry of ledger(k)) {
    if (entry.fields.state !== 'cleared' || entry.fields.transfer === true) continue;
    const want = matched.get(String(entry.fields.what));
    if (want === undefined) {
      /* A HAND-WRITTEN ROW MAY CARRY ITS OWN CATEGORY. What must never happen is a row the rule could
         not reach coming back with one out of nowhere. */
      if (entry.fields.category === null || entry.fields.category === undefined) left++;
      continue;
    }
    assert.equal(nameOf(entry.fields.category), want, `${String(entry.fields.what)} was not filed under ${want}`);
    filed++;
  }
  assert.ok(filed >= 8, `the rule filed only ${filed} rows, so the sample no longer demonstrates it`);
  assert.ok(left > 0, 'every row has a category, so the figure below is about nothing');

  const read = k.metric(METRICS['txn-uncategorised'] as never);
  assert.ok(read.ok, sayOf(read));
  assert.equal(read.value.value, left, 'the figure and the rows disagree about what is uncategorised');
});

/* THE LEDGER'S TABLE IS ON THE MONEY PAGE SINCE money-core 3.0.0, which is one page where Overview and Ledger were two. */
test('THE MONEY PAGE OPENS WITH NO BLOCK REFUSED, and What moved draws the newest rows the register holds', async () => {
  const k = await seeded();
  const page = opened(k, 'money');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);

  const moved = page.blocks.find((b) => b.heading === 'What moved');
  assert.ok(moved, 'the page has no What moved');
  assert.equal((moved.rows ?? []).length, 10, 'the newest ten, as the block asks for');
});
