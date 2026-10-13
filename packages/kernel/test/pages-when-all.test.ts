/**
 * A block's `when:` taking two tests, and the test a walk that never goes under meets.
 *
 * `when: { all: [leaf, leaf] }` draws a block only while every leaf holds, so "Everything is paid and you hold cash" is
 * one note and not two that each say half. `{ metric, beyond: true }` holds while the reading carries `beyond`
 * (`money-figures.ts` `beyondOf`): a walk to zero that looked as far as it walks and never went under, which is no value
 * and so met none of the comparisons, and is not `empty` either on a record that holds money.
 *
 * WHAT WAS MEASURED BEFORE IT: a `when` was one leaf. A page that wanted "lasts past the year" drew its sentence on
 * `empty: true`, which a record with no account at all meets as well.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { registersOf, type PageBlock, type PageDecl } from '../src/pages.ts';
import type { MetricDecl } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* Noon UTC on 20 September. The record has no zone, so its day is the UTC day. */
const NOW = Date.UTC(2026, 8, 20, 12);
const OWNER = { actor: 'p_1' };

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);

const RECURRING = register('recurring', 'Every month', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'every', type: 'enum', values: ['monthly', 'none'], index: true },
  { id: 'next_due', type: 'day', index: true },
]);

const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const CASH = { metric: 'cash', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };
const COMING = { metric: 'coming', name: 'Coming', source: 'register.recurring', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' };
const LASTS = {
  metric: 'lasts',
  name: 'Lasts',
  source: 'forecast.runway',
  legs: [{ register: 'recurring', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, every: { field: 'every', months: { monthly: 1 } } }],
  value: { walk: 'days_to_zero' },
  format: 'days',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
  opening: { metric: 'cash' },
};

const money = (amount: number, currency = 'EGP') => ({ amount, currency });

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([ACCOUNTS, RECURRING, metric(CASH), metric(COMING), metric(LASTS)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, sql };
}

const note = (when: unknown): PageBlock => ({ kind: 'note', body: 'Said.', when }) as PageBlock;
const drawn = (k: Kernel, when: unknown): boolean => k.block(note(when)).drawn !== false;

test('TWO TESTS DRAW ONLY WHILE BOTH HOLD: cash held and something coming, and neither alone', async () => {
  const { k, sql } = await record();
  const both = { all: [{ metric: 'cash', gt: 0 }, { metric: 'coming', gt: 0 }] };
  assert.equal(drawn(k, both), false, 'drew with neither');
  assert.ok(k.create('accounts', { name: 'Current', balance: money(135_000), as_of: '2026-09-20' }, OWNER).ok);
  assert.equal(drawn(k, both), false, 'drew on cash alone');
  assert.ok(k.create('recurring', { what: 'Rent', direction: 'out', amount: money(40_000), every: 'monthly', next_due: '2026-10-01' }, OWNER).ok);
  assert.equal(drawn(k, both), true);
  /* THE ORDER THEY ARE WRITTEN IN SAYS NOTHING, and a leaf that fails fails the block wherever it stands. */
  assert.equal(drawn(k, { all: [{ metric: 'coming', gt: 0 }, { metric: 'cash', gt: 0 }] }), true);
  assert.equal(drawn(k, { all: [{ metric: 'cash', gt: 0 }, { metric: 'coming', gt: 5 }] }), false);
  assert.equal(drawn(k, { all: [{ metric: 'coming', gt: 5 }, { metric: 'cash', gt: 0 }] }), false);
  /* EVERY TEST A LEAF HAS, an `all` has: empty beside a comparison, on two figures. */
  assert.equal(drawn(k, { all: [{ metric: 'cash', empty: false }, { metric: 'coming', is: 1 }] }), true);
  sql.close();
});

test('ONE LEAF NOBODY CAN READ DRAWS NOTHING, however true the other is', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('accounts', { name: 'Current', balance: money(135_000), as_of: '2026-09-20' }, OWNER).ok);
  assert.equal(drawn(k, { metric: 'cash', gt: 0 }), true);
  assert.equal(drawn(k, { all: [{ metric: 'cash', gt: 0 }, { metric: 'nobody', gt: 0 }] }), false);
  assert.equal(drawn(k, { all: [{ metric: 'nobody', empty: true }, { metric: 'cash', gt: 0 }] }), false);
  /* AND A LEAF WITH NO TEST IN IT IS NO CONDITION, in an `all` as alone. */
  assert.equal(drawn(k, { all: [{ metric: 'cash', gt: 0 }, { metric: 'cash' }] }), false);
  sql.close();
});

test('BEYOND HOLDS WHILE THE WALK NEVER GOES UNDER, and stops the day it does', async () => {
  const { k, sql } = await record();
  /* NO ACCOUNT AT ALL: nothing to walk from, so nothing was looked past. Empty, and not beyond. */
  assert.equal(drawn(k, { metric: 'lasts', beyond: true }), false);
  assert.ok(k.create('accounts', { name: 'Current', balance: money(900_000_000), as_of: '2026-09-20' }, OWNER).ok);
  assert.ok(k.create('recurring', { what: 'Rent', direction: 'out', amount: money(400_000), every: 'monthly', next_due: '2026-10-01' }, OWNER).ok);
  const reading = k.metric(LASTS as never);
  assert.ok(reading.ok && reading.value.value === null && reading.value.beyond, JSON.stringify(reading));
  assert.equal(drawn(k, { metric: 'lasts', beyond: true }), true);
  assert.equal(drawn(k, { metric: 'lasts', beyond: false }), false);
  /* IT MEETS NO COMPARISON, which is why the test exists. */
  assert.equal(drawn(k, { metric: 'lasts', gt: 0 }), false);
  /* AND IT IS A LEAF LIKE ANY OTHER IN AN `all`. */
  assert.equal(drawn(k, { all: [{ metric: 'lasts', beyond: true }, { metric: 'cash', gt: 0 }] }), true);

  /* A TAX PAST WHAT IS HELD: the walk goes under, the reading is a count of days, and beyond no longer holds. */
  assert.ok(k.create('recurring', { what: 'Tax', direction: 'out', amount: money(2_000_000_000), every: 'none', next_due: '2026-10-10' }, OWNER).ok);
  assert.equal(drawn(k, { metric: 'lasts', beyond: true }), false);
  assert.equal(drawn(k, { metric: 'lasts', beyond: false }), true);
  assert.equal(drawn(k, { metric: 'lasts', gt: 0 }), true);
  /* A FIGURE THAT WALKS NOTHING NEVER CARRIES IT. */
  assert.equal(drawn(k, { metric: 'cash', beyond: true }), false);
  sql.close();
});

test('A SINGLE LEAF READS AS IT DID', async () => {
  const { k, sql } = await record();
  assert.equal(drawn(k, { metric: 'cash', empty: true }), true);
  assert.equal(drawn(k, { metric: 'cash', gt: 0 }), false);
  assert.equal(drawn(k, { metric: 'cash' }), false);
  assert.equal(drawn(k, undefined), true);
  sql.close();
});

/* ── what a page may write ─────────────────────────────────────────────────────────────────────────────────────── */

const page = (when: unknown): Declaration => ({
  id: 'page.cash',
  kind: 'page',
  body: { page: 'cash', title: 'Cash', nav: { section: 'Money', order: 20 }, blocks: [{ kind: 'note', body: 'Said.', when }] } as never,
});
const refused = (when: unknown) => validateDeclaration(page(when));
const A = { metric: 'cash', gt: 0 };
const B = { metric: 'coming', gt: 0 };

test('TWO OR MORE LEAVES ARE A WHEN, and so is beyond, true or false, alone or in one', () => {
  assert.equal(refused({ all: [A, B] }), null);
  assert.equal(refused({ all: [A, B, { metric: 'lasts', beyond: true }] }), null);
  assert.equal(refused({ metric: 'lasts', beyond: true }), null);
  assert.equal(refused({ metric: 'lasts', beyond: false }), null);
  assert.equal(refused({ metric: 'project-lasts:{{name}}', beyond: true }), null);
  /* AND ONE LEAF STANDS AS IT WAS. */
  assert.equal(refused(A), null);
  assert.equal(refused({ metric: 'cash', empty: true }), null);
});

test('AN ALL OF FEWER THAN TWO IS REFUSED, and the refusal says to write the leaf alone', () => {
  for (const all of [[], [A]]) {
    const out = refused({ all });
    assert.equal(out?.code, 'DECLARATION_INVALID', `${JSON.stringify(all)} was taken`);
    assert.match(out?.fix ?? '', /two or more/);
    assert.match(out?.fix ?? '', /when: \{ metric/);
  }
  for (const all of ['cash', { metric: 'cash' }, null, 2]) assert.equal(refused({ all })?.code, 'DECLARATION_INVALID', `${JSON.stringify(all)} was taken`);
});

test('AN ALL INSIDE AN ALL IS REFUSED, and the refusal says to write them as one', () => {
  const out = refused({ all: [A, { all: [B, { metric: 'lasts', beyond: true }] }] });
  assert.equal(out?.code, 'DECLARATION_INVALID');
  assert.match(out?.fix ?? '', /all\[1\]/);
  assert.match(out?.fix ?? '', /one all/);
});

test('ALL IS THE WHOLE WHEN: a metric or a test beside it would never be read', () => {
  for (const beside of [{ metric: 'cash' }, { gt: 0 }, { empty: true }, { beyond: true }]) {
    const out = refused({ all: [A, B], ...beside });
    assert.equal(out?.code, 'DECLARATION_INVALID', `${JSON.stringify(beside)} was taken beside all`);
    assert.match(out?.fix ?? '', new RegExp(`all and ${Object.keys(beside)[0]}\\b`));
  }
});

test('A LEAF IN AN ALL IS HELD TO WHAT A LEAF ALONE IS, and the refusal says which one', () => {
  const out = refused({ all: [A, { metric: 'Cash now', gt: 0 }] });
  assert.equal(out?.code, 'DECLARATION_INVALID');
  assert.match(out?.fix ?? '', /all\[1\]/);
  assert.match(refused({ all: [A, { metric: 'cash', empty: 'yes' }] })?.fix ?? '', /all\[1\].*empty is true or false/);
  assert.match(refused({ all: [{ metric: 'cash', empty: true, gt: 0 }, B] })?.fix ?? '', /all\[0\].*empty and gt\b/);
});

test('BEYOND IS TRUE OR FALSE AND THE WHOLE TEST: beside a comparison or empty one of the two would never be read', () => {
  for (const beyond of ['yes', 1, null]) {
    const out = refused({ metric: 'lasts', beyond });
    assert.equal(out?.code, 'DECLARATION_INVALID', `${JSON.stringify(beyond)} was taken`);
    assert.match(out?.fix ?? '', /beyond is true or false/);
  }
  for (const op of ['gt', 'gte', 'lt', 'lte', 'is', 'not', 'empty']) {
    const out = refused({ metric: 'lasts', beyond: true, [op]: op === 'empty' ? true : 0 });
    assert.equal(out?.code, 'DECLARATION_INVALID', `beyond and ${op} were taken together`);
    assert.match(out?.fix ?? '', new RegExp(`beyond and ${op}\\b`));
    assert.match(out?.fix ?? '', /\{ metric, beyond: true \}/);
  }
});

test('A PAGE READS THE LISTS BEHIND EVERY LEAF, so a member who may not open one is not told what it adds up to', () => {
  const figures: Record<string, unknown> = { cash: CASH, coming: COMING };
  const lists = (when: unknown): string[] =>
    registersOf({ page: 'cash', title: 'Cash', blocks: [note(when)] } as unknown as PageDecl, (id) => (figures[id] as MetricDecl | undefined) ?? null).sort();
  assert.deepEqual(lists(A), ['accounts']);
  assert.deepEqual(lists({ all: [A, B] }), ['accounts', 'recurring']);
  assert.deepEqual(lists({ all: [{ metric: 'coming:Rent', gt: 0 }, A] }), ['accounts', 'recurring']);
});
