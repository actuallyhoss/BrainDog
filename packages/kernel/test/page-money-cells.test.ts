/**
 * A READING THAT IS MONEY ON A PAGE (REC-C03): a `stat` or `lines` block over a list of readings takes a fifth column,
 * the reading as money, integer minor units with its own currency. "Monthly revenue, Crumb.gg" was the decimal 4,815 with
 * a unit of text; read through the money field it is USD 48.15, and a reading in another currency is a line of its own,
 * never added to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type MeasureSeries } from '../src/index.ts';
import type { MeasureLatest } from '../src/measures.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const OWNER = { actor: 'p_1' };

const NUMBERS: Declaration = {
  id: 'register.numbers',
  kind: 'register',
  body: {
    id: 'numbers',
    name: 'Numbers',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, index: true },
      { id: 'value', type: 'decimal' },
      { id: 'unit', type: 'text' },
      { id: 'amount', type: 'money', label: 'Amount' },
      { id: 'at', type: 'instant', index: true },
    ],
  },
};

const FIVE = [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }, { field: 'amount' }];
type Drawn = { measures?: MeasureSeries[]; latest?: MeasureLatest[]; refusals: { code: string; fix: string }[] };

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([NUMBERS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const add = (fields: Record<string, unknown>) => assert.ok(k.create('numbers', fields, OWNER).ok);
  return { k, add };
}

test('THE FIFTH COLUMN READS EACH READING AS MONEY, in its own currency, and never as the bare minor units', async () => {
  const { k, add } = await record();
  add({ name: 'Monthly revenue', amount: { amount: 4815, currency: 'USD' }, at: '2026-10-08T08:00:00.000Z' });
  add({ name: 'Monthly revenue', amount: { amount: 5120, currency: 'USD' }, at: '2026-10-09T08:00:00.000Z' });
  const drawn = k.block({ kind: 'lines', source: 'register.numbers', columns: FIVE, back: 7 }) as Drawn;
  assert.deepEqual(drawn.refusals, []);
  const line = drawn.measures?.find((m) => m.name === 'Monthly revenue');
  assert.ok(line, JSON.stringify(drawn));
  assert.equal(line.unit, 'USD');
  assert.equal(line.latest?.value, 51.2, 'minor units read by the currency’s decimals');
  assert.ok(!line.now.includes(5120), 'the minor units are never drawn as the number');
});

test('without the fifth column the same block reads the decimal as before', async () => {
  const { k, add } = await record();
  add({ name: 'Sign-ups', value: 12, at: '2026-10-08T08:00:00.000Z' });
  add({ name: 'Sign-ups', value: 15, at: '2026-10-09T08:00:00.000Z' });
  const drawn = k.block({ kind: 'lines', source: 'register.numbers', columns: FIVE.slice(0, 4), back: 7 }) as Drawn;
  assert.deepEqual(drawn.refusals, []);
  assert.equal(drawn.measures?.find((m) => m.name === 'Sign-ups')?.latest?.value, 15);
});

test('two currencies under one name are two measures, never one sum', async () => {
  const { k, add } = await record();
  add({ name: 'Revenue', amount: { amount: 4815, currency: 'USD' }, at: '2026-10-08T08:00:00.000Z' });
  add({ name: 'Revenue', amount: { amount: 900, currency: 'JPY' }, at: '2026-10-09T08:00:00.000Z' });
  const drawn = k.block({ kind: 'stat', source: 'register.numbers', columns: FIVE, back: 7 }) as Drawn;
  assert.deepEqual(drawn.refusals, []);
  const units = [...(drawn.measures ?? []), ...(drawn.latest ?? [])].filter((m) => ('name' in m ? m.name : m.measure) === 'Revenue').map((m) => m.unit);
  assert.deepEqual(units.sort(), ['JPY', 'USD']);
});

test('a fifth column that is not money is refused in a sentence, and one the list lacks is unknown', async () => {
  const { k } = await record();
  const notMoney = k.block({ kind: 'stat', source: 'register.numbers', columns: [...FIVE.slice(0, 4), { field: 'unit' }] }) as Drawn;
  assert.equal(notMoney.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(notMoney.refusals[0]!.fix, /not a money field/u);
  const missing = k.block({ kind: 'stat', source: 'register.numbers', columns: [...FIVE.slice(0, 4), { field: 'takings' }] }) as Drawn;
  assert.equal(missing.refusals[0]?.code, 'FIELD_UNKNOWN');
});

/* ── a card dated by what the bank last said (REC-B03) ───────────────────── */

const reg = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = reg('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);

/* THE LEDGER, as money-core keeps it: a bank message files a row here and says the balance after it. */
const LEDGER = reg('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'balance_after', type: 'money' },
]);

const AGES: Declaration = {
  id: 'metric.account-ages',
  kind: 'metric',
  body: {
    metric: 'account-ages',
    name: 'When each account was last confirmed',
    source: 'register.accounts',
    group_by: 'name',
    value: {
      rolled: {
        balance: 'balance',
        as_of: 'as_of',
        checks: [{ register: 'transactions', by: 'account', balance: 'balance_after', on: 'on' }],
        moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' },
        read: 'as_of',
      },
    },
    format: 'day',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  } as never,
};

const COUNT: Declaration = {
  id: 'metric.account-count',
  kind: 'metric',
  body: { metric: 'account-count', name: 'Accounts', source: 'register.accounts', value: { count: 'name' }, format: 'int', target: { gte: 0 }, window: '30d' } as never,
};

const CARDS = (figure: string) =>
  ({ kind: 'cards', source: 'register.accounts', columns: [{ field: 'name' }, { field: 'as_of' }], stale: { field: 'as_of', after: '7d', figure } }) as never;

type Carded = { rows: { fields: Record<string, unknown> }[]; refusals: { code: string; fix: string }[] };

test('A CARD’S stale: MAY READ ITS DAY FROM A FIGURE’S GROUP: the bank’s last word, not the typed day', async () => {
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 8, 20, 12)));
  assert.ok((await k.install([ACCOUNTS, LEDGER, AGES, COUNT])).ok);
  const hsbc = k.create('accounts', { name: 'HSBC (USD)', balance: { amount: 500_000, currency: 'USD' }, as_of: '2026-08-21' }, OWNER);
  assert.ok(hsbc.ok);
  const dayOf = () => (k.block(CARDS('account-ages')) as Carded).rows.find((r) => r.fields.name === 'HSBC (USD)')?.fields.as_of;
  assert.equal(dayOf(), '2026-08-21', 'confirmed only by the typed day, the card says that day');
  assert.ok(
    k.create('transactions', { what: 'Card payment', account: hsbc.value.id, on: '2026-09-20', amount: { amount: 2_000, currency: 'USD' }, direction: 'out', balance_after: { amount: 498_000, currency: 'USD' } }, OWNER).ok,
  );
  assert.equal(dayOf(), '2026-09-20', 'a ledger row with a balance makes the card today’s');
  assert.equal((k.get(hsbc.value.id)?.fields as Record<string, unknown>).as_of, '2026-08-21', 'and the account row is left alone');
  const wrong = k.block(CARDS('account-count')) as Carded;
  assert.equal(wrong.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(wrong.refusals[0]!.fix, /read: as_of and group_by/u);
  assert.equal((k.block(CARDS('nothing')) as Carded).refusals[0]?.code, 'DECLARATION_INVALID');
});
