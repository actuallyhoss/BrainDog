/**
 * One write on a list where every row is one amount settles in its own time, not in the time of the whole list.
 *
 * MEASURED: one create after 10,000 rows of one amount took about 3 s. The install pass had been taught to read the
 * list once (`pairs.ts`, `passOf`), and a write's own `settle` still asked every window it read by query, each query
 * reading every row of the list and each row in the window that mirrors the leg asked afresh whether it may pair. A
 * write whose windows are busy now reads the list once too (`pairs.ts`, `READ_WHOLE_AT`).
 *
 * TIMED IN CPU, NOT ON THE WALL CLOCK: the claim is about the work one write does, and a runner busy with other files
 * would otherwise fail it for waiting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { loadLeg, partnerOf, type Pairing, type PairsDecl } from '../src/pairs.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 30, 12);
const PERSON = { actor: 'p_1' };
const DAY_MS = 86_400_000;

/* MONEY-CORE 2.2.0'S CLAUSE, as `pairs-settle-speed.test.ts` installs it. */
const TIGHT: PairsDecl = {
  on: ['abs(amount)'],
  opposite: 'direction',
  across: 'account',
  within: '4d',
  mark: 'transfer',
  where: { all: [{ field: 'state', is: 'cleared' }, { field: 'party', empty: true }] },
};

const FIELDS = [
  { id: 'what', type: 'text', required: true },
  { id: 'on', type: 'day', index: true, required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'account', type: 'text', required: true },
  { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
  { id: 'party', type: 'text' },
  { id: 'transfer', type: 'bool', default: false },
];

const LEDGER = (pairs?: PairsDecl): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: { id: 'transactions', name: 'Transactions', title: 'what', ...(pairs === undefined ? {} : { pairs }), fields: FIELDS } as never,
});

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const dayOf = (d: number): string => new Date(Date.UTC(2025, 0, 1) + d * DAY_MS).toISOString().slice(0, 10);

/**
 * The measured ledger with one amount: a third of the rows the two legs of a move from CIB to HSBC a day or so apart,
 * the rest single card rows in any of four accounts, every one EGP 500.00. The same seed writes the same ledger every
 * run.
 */
function fill(write: (fields: Record<string, unknown>) => void, rows: number, days: number): void {
  let seed = 3;
  const next = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648), seed / 2_147_483_648);
  const amount = { amount: 50_000, currency: 'EGP' };
  const accounts = ['cib', 'hsbc', 'card', 'nbe'];
  for (let written = 0; written < rows; ) {
    const d = Math.floor(next() * days);
    if (next() < 0.33) {
      write({ what: 'Move', on: dayOf(d), direction: 'out', amount, account: 'cib' });
      write({ what: 'Move', on: dayOf(d + Math.floor(next() * 2)), direction: 'in', amount, account: 'hsbc' });
      written += 2;
    } else {
      write({ what: 'Card', on: dayOf(d), direction: next() < 0.6 ? 'out' : 'in', amount, account: accounts[Math.floor(next() * 4)]! });
      written += 1;
    }
  }
}

/* THE BUDGET IS 2 S OF CPU FOR THE ONE CREATE, below the 3 s L5 measured for it, so the old walk fails here on a runner
   as fast as the machine that measured it and by more on a slower one. It is a budget and not a measurement of the
   repair. */
const BUDGET_MS = 2_000;

test('ONE CREATE AFTER 10,000 ROWS OF ONE AMOUNT IN ONE YEAR settles inside its budget, and pairs as a write asking every window by query would', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* WRITTEN WITH NO `pairs:` AND THEN GIVEN ONE, so the 10,000 rows are settled by the install pass the way a record
     updated to money-core 2.2.0 was, and only the one create after them is timed. */
  assert.ok((await k.install([LEDGER()])).ok);
  k.transaction(() => fill((fields) => made(k.create('transactions', fields, PERSON)), 10_000, 365));
  assert.ok((await k.install([LEDGER(TIGHT)])).ok);

  const from = process.cpuUsage();
  const written = made(k.create('transactions', { what: 'Move', on: dayOf(181), direction: 'out', amount: { amount: 50_000, currency: 'EGP' }, account: 'cib' }, PERSON));
  const used = process.cpuUsage(from);
  const ms = (used.user + used.system) / 1000;
  assert.ok(ms < BUDGET_MS, `the create took ${(ms / 1000).toFixed(2)} s of CPU, against ${BUDGET_MS / 1000} s`);

  /* THE SAME ANSWER AS THE OLD PATH. `partnerOf` asks every window by query with no `Ledger`, as a write did before, so
     the row this create settled holds the partner that path gives it in the ledger as it now stands. */
  const p: Pairing = { sql, register: 'transactions', pairs: TIGHT, fields: FIELDS, state: undefined, done: undefined };
  const to = k.get(written.id)!.fields._pair;
  assert.equal(typeof to === 'string' ? to : null, partnerOf(p, loadLeg(p, written.id)!));
  sql.close();
});
