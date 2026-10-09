/**
 * `when: { metric, empty: true }` (PGS-C06): a block drawn while its figure has no value and no amount in any currency,
 * so a page can say "No balance has been typed yet" where its sentence about cash would be.
 *
 * WHAT WAS MEASURED BEFORE IT: a figure with no value met none of the comparisons, so a note under one was never drawn,
 * and a page on a fresh record had no headline at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import type { PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money' },
    ],
  },
};

const CASH_NOW: Declaration = {
  id: 'metric.cash-now',
  kind: 'metric',
  body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const PAGE: Declaration = {
  id: 'page.money',
  kind: 'page',
  body: {
    page: 'money',
    title: 'Money',
    requires: ['register.accounts'],
    blocks: [
      { kind: 'note', key: 'held', lead: true, body: 'You hold {{cash-now}}.', when: { metric: 'cash-now', gt: 0 } },
      { kind: 'note', key: 'nothing', lead: true, body: 'No balance has been typed yet.', when: { metric: 'cash-now', empty: true } },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, CASH_NOW, PAGE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

/** The key of the first lead note the page draws, which is the sentence it opens on. */
const opensOn = (k: Kernel): string | undefined => {
  const out = k.page('money');
  assert.ok(out.ok, JSON.stringify(out));
  const blocks = (out.value as { blocks: { key?: string; lead?: boolean; drawn?: boolean }[] }).blocks;
  return blocks.find((b) => b.lead === true && b.drawn !== false)?.key;
};

test('A PAGE WITH TWO LEAD NOTES ON CASH NOW OPENS ON THE EMPTY ONE, and on the other once a balance is typed', async () => {
  const { k, sql } = await record();
  assert.equal(opensOn(k), 'nothing');
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 135_000, currency: 'EGP' } }, OWNER).ok);
  assert.equal(opensOn(k), 'held');
  sql.close();
});

test('a balance of nought is a value, so the empty note is not drawn', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 0, currency: 'EGP' } }, OWNER).ok);
  const out = k.page('money');
  assert.ok(out.ok);
  const nothing = (out.value as { blocks: { key?: string; drawn?: boolean }[] }).blocks.find((b) => b.key === 'nothing');
  assert.equal(nothing?.drawn, false);
  sql.close();
});

test('empty: false holds while the figure has a value, and not before', async () => {
  const { k, sql } = await record();
  const block = { kind: 'note', body: 'Held.', when: { metric: 'cash-now', empty: false } } as PageBlock;
  assert.equal(k.block(block).drawn, false);
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 5_000, currency: 'GBP' } }, OWNER).ok);
  assert.notEqual(k.block(block).drawn, false);
  sql.close();
});

test('a figure in two currencies is not empty', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('accounts', { name: 'Cairo', balance: { amount: 135_000, currency: 'EGP' } }, OWNER).ok);
  assert.ok(k.create('accounts', { name: 'London', balance: { amount: 5_000, currency: 'GBP' } }, OWNER).ok);
  assert.equal(k.block({ kind: 'note', body: 'x', when: { metric: 'cash-now', empty: true } } as PageBlock).drawn, false);
  assert.notEqual(k.block({ kind: 'note', body: 'x', when: { metric: 'cash-now', empty: false } } as PageBlock).drawn, false);
  sql.close();
});

test('a figure nobody declared still draws nothing, empty or not', async () => {
  const { k, sql } = await record();
  for (const empty of [true, false]) assert.equal(k.block({ kind: 'note', body: 'x', when: { metric: 'nobody', empty } } as PageBlock).drawn, false);
  sql.close();
});
