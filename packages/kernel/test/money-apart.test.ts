/**
 * A line keeps its currencies apart: `{{cash.apart}}` is the figure in each currency it holds, `{{cash.converted}}` the
 * one amount they come to at the rate, to whole units, and `{{cash.rate_on}}` the day of that rate. The last two are said
 * only where something was converted, so a record that keeps one currency reads its figure as it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 27, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  },
} as unknown as Declaration;
const FX = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  },
} as unknown as Declaration;
const CASH = { metric: 'cash', name: 'Cash', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };
const LINE = 'Cash is {{cash.apart}}, about {{cash.converted}} at {{cash.rate_on}}, and {{cash}} in all.';
const PAGE = { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'note', body: LINE }] } } as unknown as Declaration;

async function record(accounts: { name: string; balance: { amount: number; currency: string } }[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS, FX])).ok);
  for (const a of accounts) assert.ok(k.create('accounts', { ...a, as_of: '2026-10-20' }, OWNER).ok);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER).ok);
  assert.ok((await k.install([{ id: 'metric.cash', kind: 'metric', body: CASH } as never, PAGE])).ok);
  return { k, sql };
}

const valuesOf = (k: Kernel): Record<string, unknown> => {
  const out = k.page('desk') as { ok: boolean; value: { blocks: { values?: Record<string, unknown> }[] } };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks[0]!.values ?? {};
};

test('POUNDS AND DOLLARS ARE SAID APART, then about what they come to at the rate and its day', async () => {
  const { k, sql } = await record([
    { name: 'Bank', balance: { amount: 4_000_000, currency: 'EGP' } },
    { name: 'Card', balance: { amount: 1_000_050, currency: 'USD' } },
  ]);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50.5, as_of: '2026-09-28' }, OWNER).ok);
  const values = valuesOf(k);
  assert.deepEqual(values['cash.apart'], [
    { amount: 4_000_000, currency: 'EGP' },
    { amount: 1_000_050, currency: 'USD' },
  ]);
  /* 40,000 pounds and 10,000.50 dollars at 50.5 is 545,025.25 pounds: about 545,025. */
  assert.deepEqual(values.cash, { amount: 54_502_525, currency: 'EGP' });
  assert.deepEqual(values['cash.converted'], { amount: 54_502_500, currency: 'EGP' });
  assert.equal(values['cash.rate_on'], '2026-09-28');
  /* AND THE RATE ITSELF TRAVELS BESIDE THE FIGURE, so a page can say "$1 = EGP 50.50" under it. */
  const read = k.metric(CASH as never);
  assert.ok(read.ok);
  assert.deepEqual(read.value.fx?.pairs, [{ from: 'USD', rate: 50.5 }]);
  sql.close();
});

test('ONE CURRENCY IS SAID AS ONE AMOUNT: apart is that amount, with nothing converted and no day of a rate', async () => {
  const { k, sql } = await record([
    { name: 'Bank', balance: { amount: 4_000_000, currency: 'EGP' } },
    { name: 'Wallet', balance: { amount: 50_000, currency: 'EGP' } },
  ]);
  const values = valuesOf(k);
  assert.deepEqual(values.cash, { amount: 4_050_000, currency: 'EGP' });
  /* APART IS THE ONE AMOUNT, so a line that opens on it reads as it did. */
  assert.deepEqual(values['cash.apart'], { amount: 4_050_000, currency: 'EGP' });
  for (const part of ['cash.converted', 'cash.rate_on']) assert.equal(values[part], undefined, `${part} is said of one currency`);
  sql.close();
});

test('A GROUPED FIGURE COUNTS THE PARTS THAT HOLD MONEY, the ones a split of it lists, and leaves one at nought out', async () => {
  const { k, sql } = await record([
    { name: 'Bank', balance: { amount: 4_000_000, currency: 'EGP' } },
    { name: 'Wallet', balance: { amount: 0, currency: 'EGP' } },
    { name: 'Card', balance: { amount: -961, currency: 'EGP' } },
  ]);
  const BY = { ...CASH, metric: 'cash-by', group_by: 'name' };
  const page = { id: 'page.split', kind: 'page', body: { page: 'split', title: 'Split', blocks: [{ kind: 'note', body: 'Across {{cash-by.groups}} account(s).' }] } };
  assert.ok((await k.install([{ id: 'metric.cash-by', kind: 'metric', body: BY } as never, page as never])).ok);
  const out = k.page('split') as { ok: boolean; value: { blocks: { values?: Record<string, unknown> }[] } };
  assert.ok(out.ok, JSON.stringify(out));
  /* THE BANK AND THE CARD, which owes: two parts with money in them, and the wallet at nought is none. */
  assert.equal(out.value.blocks[0]!.values?.['cash-by.groups'], 2);
  sql.close();
});
