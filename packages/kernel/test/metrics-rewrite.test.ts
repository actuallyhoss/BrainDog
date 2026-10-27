/**
 * THE NIGHT CORRECTS THE LAST THREE NIGHTS.
 *
 * A bank's text for a Thursday lands on the Saturday. `snapshot` overwrote yesterday and filled every earlier day only,
 * so Thursday's point of cash stayed the cash before that entry for as long as the line lasted. Now yesterday and the
 * two days before it are read again each night and written where the answer moved; a point another writer kept is
 * never touched, and every day before the three is still filled only where it is missing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { BANKS } from '../../../fixtures/names.ts';
import { openRecord, snapshot, type Declaration, type EvalContext, type Kernel, type MetricDecl, type Snapshot } from '../src/index.ts';
import { REWRITE_DAYS } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 September, a Sunday. The record's day is the UTC day. */
const NOW = Date.UTC(2026, 8, 20, 12);
const DAY = 86_400_000;

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
  { id: 'liquid', type: 'bool' },
]);
const BALANCES = register('balances', 'Balance checks', 'source', [
  { id: 'source', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'balance', type: 'money', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);
const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], index: true },
]);

/** Cash rolled forward over the accounts: each one's balance plus its cleared moves since. */
const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  where: 'liquid is true',
  value: {
    rolled: {
      balance: 'balance',
      as_of: 'as_of',
      checks: [{ register: 'balances', by: 'account', balance: 'balance', on: 'as_of' }],
      moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'state is cleared' },
    },
  },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
} as unknown as MetricDecl;

const schemaOf = (decl: Declaration): Schema => {
  const body = decl.body as unknown as { id: string; fields: { id: string }[] };
  return { register: body.id, fields: Object.fromEntries(body.fields.map(({ id, ...field }) => [id, field])) } as unknown as Schema;
};
const SCHEMAS = new Map([ACCOUNTS, BALANCES, TRANSACTIONS].map((d) => [schemaOf(d).register, schemaOf(d)]));

const egp = (amount: number) => ({ amount, currency: 'EGP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; account: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ACCOUNTS, BALANCES, TRANSACTIONS])).ok);
  const made = k.create('accounts', { name: BANKS[0], balance: egp(10_000_000), as_of: '2026-09-01', liquid: true }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  const account = made.value.id;
  assert.ok(k.create('transactions', { what: 'in 2026-09-12', account, on: '2026-09-12', amount: egp(2_000_000), direction: 'in', state: 'cleared' }, { actor: 'p_1' }).ok);
  return { k, sql, account };
}

/** One night, `nights` after the 20th's: yesterday and ten days behind it. */
const night = (sql: NodeSql, nights = 0): Snapshot => {
  const nowMs = NOW + nights * DAY;
  const ctx: EvalContext = { nowMs, schemaOf: (id) => SCHEMAS.get(id) ?? null };
  const out = snapshot(sql, CASH, ctx, { nowAt: new Date(nowMs).toISOString(), tz: 'UTC' }, 10);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

type Kept = { value: number; source: string; wrote_at: string };
const points = (sql: NodeSql): Record<string, Kept> =>
  Object.fromEntries(
    sql
      .all<{ at: string; value: number; source: string; wrote_at: string }>("SELECT at, value, source, wrote_at FROM metric_point WHERE series = 'cash' AND grain = 'day' ORDER BY at")
      .map((p) => [p.at, { value: Number(p.value), source: p.source, wrote_at: p.wrote_at }]),
  );

const spend = (k: Kernel, account: string, on: string, amount: number): void =>
  assert.ok(k.create('transactions', { what: `out ${on}`, account, on, amount: egp(amount), direction: 'out', state: 'cleared' }, { actor: 'p_1' }).ok);

test('THE WINDOW IS THREE DAYS: yesterday and the two before it', () => {
  assert.equal(REWRITE_DAYS, 3);
});

test('AN ENTRY WRITTEN TODAY FOR TWO DAYS AGO MOVES THAT DAY’S POINT the next night, by exactly its amount', async () => {
  const { k, sql, account } = await record();
  night(sql);
  const before = points(sql);
  assert.equal(before['2026-09-18']!.value, 12_000_000);

  /* WRITTEN ON THE 20TH, DATED THE 18TH. The next night's yesterday is the 20th, so the 18th is in its window. */
  spend(k, account, '2026-09-18', 300_000);
  const next = night(sql, 1);
  const after = points(sql);
  assert.equal(after['2026-09-18']!.value, before['2026-09-18']!.value - 300_000);
  assert.equal(after['2026-09-19']!.value, before['2026-09-19']!.value - 300_000);
  assert.equal(after['2026-09-20']!.value, 12_000_000 - 300_000);
  assert.ok(next.rewrote >= 1, JSON.stringify(next));
  assert.equal(next.rewrote, 2, 'the 18th and the 19th moved; the 20th is new');
  assert.equal(next.wrote, 1);
  assert.equal(after['2026-09-17']!.value, before['2026-09-17']!.value, 'a day before the entry moved');
  sql.close();
});

test('AN ENTRY DATED FIVE DAYS AGO MOVES NO POINT OLDER THAN THREE DAYS', async () => {
  const { k, sql, account } = await record();
  night(sql);
  const before = points(sql);
  spend(k, account, '2026-09-15', 400_000);
  night(sql, 1);
  const after = points(sql);
  /* The next night's window is the 20th, 19th and 18th. The 15th, 16th and 17th keep what they said. */
  for (const day of ['2026-09-15', '2026-09-16', '2026-09-17']) assert.equal(after[day]!.value, before[day]!.value, `${day} was rewritten`);
  for (const day of ['2026-09-18', '2026-09-19']) assert.equal(after[day]!.value, before[day]!.value - 400_000, `${day} was not corrected`);
  sql.close();
});

test('A SECOND RUN WITH NOTHING CHANGED REWRITES NOTHING, and every point keeps when it was written', async () => {
  const { sql } = await record();
  night(sql);
  const before = points(sql);
  /* The same night again, an hour on: nothing moved, so nothing is written and no `wrote_at` changes. */
  const ctx: EvalContext = { nowMs: NOW, schemaOf: (id) => SCHEMAS.get(id) ?? null };
  const out = snapshot(sql, CASH, ctx, { nowAt: new Date(NOW + 3_600_000).toISOString(), tz: 'UTC' }, 10);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual({ wrote: out.value.wrote, backfilled: out.value.backfilled, rewrote: out.value.rewrote }, { wrote: 1, backfilled: 0, rewrote: 0 });
  assert.deepEqual(points(sql), before);
  sql.close();
});

test('A POINT ANOTHER WRITER KEPT IS NEVER OVERWRITTEN, even inside the window', async () => {
  const { k, sql, account } = await record();
  sql.exec(
    "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('cash', 'day', '2026-09-19', 777, 'EGP', NULL, 'import.statement', ?)",
    new Date(NOW).toISOString(),
  );
  night(sql);
  assert.deepEqual(points(sql)['2026-09-19'], { value: 777, source: 'import.statement', wrote_at: new Date(NOW).toISOString() });
  spend(k, account, '2026-09-19', 100_000);
  const next = night(sql, 1);
  assert.equal(points(sql)['2026-09-19']!.value, 777);
  assert.equal(next.rewrote, 0, 'the only day the entry moved is the other writer’s');
  sql.close();
});

test('A MISSING DAY FURTHER BACK IS STILL FILLED, and only filled', async () => {
  const { sql } = await record();
  night(sql);
  const before = points(sql);
  sql.exec("DELETE FROM metric_point WHERE series = 'cash' AND at = '2026-09-12'");
  sql.exec("UPDATE metric_point SET value = 999 WHERE series = 'cash' AND at = '2026-09-13'");
  const next = night(sql, 1);
  const after = points(sql);
  assert.equal(after['2026-09-12']!.value, before['2026-09-12']!.value);
  assert.equal(after['2026-09-13']!.value, 999, 'a kept day outside the window was rewritten');
  assert.equal(next.backfilled, 1);
  sql.close();
});
