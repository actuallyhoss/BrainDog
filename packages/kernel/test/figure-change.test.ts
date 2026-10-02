/**
 * `{{cash-now.change}}`: how far a figure moved since its window ago, against what the record remembered.
 *
 * WHAT WAS MEASURED BEFORE IT: Money's headline could not say "down 8% since 1 Sep", because nothing declared could name
 * a figure's change. Cash now's own comparison is empty, its rows read a month back are today's balances again, so the
 * change is set against the night's remembered point.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
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
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'state', type: 'enum', values: ['open', 'change'], default: 'open' },
    ],
  },
};

const CASH: Declaration = {
  id: 'metric.cash-now',
  kind: 'metric',
  body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([ACCOUNTS, CASH]));
  value(k.create('accounts', { name: 'HSBC', balance: { amount: 460_000, currency: 'GBP' } }, OWNER));
  return { k, sql };
}

const put = (sql: NodeSql, at: string, v: number, unit = 'GBP') =>
  sql.exec(
    "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('cash-now', 'day', ?, ?, ?, 1, 'register.accounts', ?)",
    at,
    v,
    unit,
    '2026-10-02T00:05:00Z',
  );

const LEAD = { kind: 'note', lead: true, body: 'Cash is {{cash-now}}, {{cash-now.change}} on a month ago.' } as never;
const change = (k: Kernel) => k.block(LEAD).values?.['cash-now.change'];

test('A FIGURE WITH HISTORY SAYS HOW FAR IT MOVED, signed, against the point its window ago', async () => {
  const { k, sql } = await record();
  /* Thirty days before 2 October is 2 September; the newest point on or before it is the one read. */
  put(sql, '2026-08-30', 1);
  put(sql, '2026-09-01', 500_000);
  put(sql, '2026-09-20', 9);
  assert.equal(change(k), '−8%', 'GBP 4,600 against GBP 5,000 is down 8%');
  sql.exec('DELETE FROM metric_point');
  put(sql, '2026-09-02', 400_000);
  assert.equal(change(k), '+15%');
  sql.exec('DELETE FROM metric_point');
  put(sql, '2026-09-02', 460_000);
  assert.equal(change(k), '0%', 'no move is nought, which a lead drops');
  assert.equal(k.block(LEAD).values?.['cash-now'] !== undefined, true, 'the figure itself is still filled');
  sql.close();
});

test('WITH NOTHING TRUE TO SAY IT SAYS NOTHING: no history, too old, another currency, or a point at nought', async () => {
  const { k, sql } = await record();
  assert.equal(change(k), undefined, 'a figure with no history moved by nothing anybody knows');
  put(sql, '2026-08-20', 500_000);
  assert.equal(change(k), undefined, 'a point more than a week before the window is not a month ago');
  put(sql, '2026-09-01', 500_000, 'EGP');
  assert.equal(change(k), undefined, 'two currencies are never set against each other');
  put(sql, '2026-09-02', 0);
  assert.equal(change(k), undefined, 'no percent is of nought');
  sql.close();
});

test('A LIST WITH A STATE CALLED change IS STILL COUNTED when no figure has the name', async () => {
  const { k, sql } = await record();
  value(k.create('accounts', { name: 'Old', balance: { amount: 1, currency: 'GBP' }, state: 'change' }, OWNER));
  assert.equal(k.block({ kind: 'note', body: '{{accounts.change}} to look at.' } as never).values?.['accounts.change'], 1);
  sql.close();
});

test('A FIGURE WITH NO UNIT IS SET AGAINST ITS POINT AS THE NIGHT STORED IT, a count bare and a fraction in basis points', async () => {
  const { k, sql } = await record();
  const avg: Declaration = {
    id: 'metric.accounts-held',
    kind: 'metric',
    body: { metric: 'accounts-held', name: 'Accounts held', source: 'register.accounts', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
  };
  value(await k.install([avg]));
  value(k.create('accounts', { name: 'Monzo', balance: { amount: 1, currency: 'GBP' } }, OWNER));
  /* Two accounts now against one a month ago, written bare as the night writes a whole count. */
  sql.exec("INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('accounts-held', 'day', '2026-09-02', 1, '', 1, 'register.accounts', '2026-10-02T00:05:00Z')");
  assert.equal(k.block({ kind: 'note', body: '{{accounts-held.change}}' } as never).values?.['accounts-held.change'], '+100%');
  /* And a fraction a month ago, 1.6 as 16000 basis points: two against it is up 25%, not a figure with another unit. */
  sql.exec("UPDATE metric_point SET value = 16000, unit = 'pct.bp' WHERE series = 'accounts-held'");
  assert.equal(k.block({ kind: 'note', body: '{{accounts-held.change}}' } as never).values?.['accounts-held.change'], '+25%');
  sql.close();
});
