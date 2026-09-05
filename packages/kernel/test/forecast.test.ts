/**
 * The cash walk: what is liquid now, then every dated movement in order, until it goes under.
 *
 * THE ONE THING THE RECORD DRAWS THAT IS ABOUT THE FUTURE. Everything else is a fact about rows
 * that exist; this is arithmetic over dates that have not happened, and the whole value of it is one
 * number — the day the balance crosses zero, and the row that does it. Which means the ways it can
 * be quietly wrong all produce a plausible date, and that is what is tested here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Leg, type Runway } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid'], index: true },
    ],
  } as never,
};

const SERVICES: Declaration = {
  id: 'register.services',
  kind: 'register',
  body: {
    id: 'services',
    name: 'Services',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'cost', type: 'money' },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly'] },
      { id: 'renews', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['live', 'cancelled'], index: true },
    ],
  } as never,
};

const LEGS: Leg[] = [
  { register: 'obligations', on: 'due', amount: 'amount', where: 'state is open or part', incoming: { field: 'direction', is: 'owed_to_me' } },
  { register: 'services', on: 'renews', amount: 'cost', where: 'state is not cancelled', every: { field: 'cycle', months: { monthly: 1, yearly: 12 } } },
];

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, SERVICES])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── both sides of the record ────────────────────────────────────────────── */

test('A FORECAST BUILT FROM INVOICES ALONE HAS FORGOTTEN THE HOSTING BILL', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'In', direction: 'owed_to_me', amount: gbp(100_000), due: day(10), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('obligations', { what: 'Out', direction: 'owed_by_me', amount: gbp(40_000), due: day(5), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('services', { name: 'Hosting', cost: gbp(1_000), cycle: 'monthly', renews: day(20), state: 'live' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(50_000, LEGS, 90));
  assert.equal(walk.currency, 'GBP');
  /* A MONTH IS A CALENDAR MONTH, not thirty-one days: the renewal on the 25th recurs on the 25th. */
  assert.deepEqual(
    walk.steps.map((s) => [s.day, s.delta]),
    [
      [day(5), -40_000],
      [day(10), 100_000],
      ['2026-09-25', -1_000],
      ['2026-10-25', -1_000],
      ['2026-11-25', -1_000],
    ],
    'a monthly service charged once, or an invoice went missing',
  );
  assert.equal(walk.steps.at(-1)?.balance, 50_000 - 40_000 + 100_000 - 3_000);
  sql.close();
});

test('and a settled row is not a movement, because the money already moved', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'Paid', direction: 'owed_to_me', amount: gbp(100_000), due: day(3), state: 'paid' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('services', { name: 'Old', cost: gbp(9_000), cycle: 'monthly', renews: day(3), state: 'cancelled' }, { actor: 'p_1' }).ok);
  assert.deepEqual(value<Runway>(k.runway(1_000, LEGS, 90)).steps, []);
  sql.close();
});

/* ── the crossing ────────────────────────────────────────────────────────── */

test('THE CROSSING IS ONE ROW, and it is the FIRST step under zero', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'Big bill', direction: 'owed_by_me', amount: gbp(80_000), due: day(10), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('obligations', { what: 'Another', direction: 'owed_by_me', amount: gbp(10_000), due: day(20), state: 'open' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(50_000, LEGS, 90));
  assert.equal(walk.crossed?.label, 'Big bill');
  assert.equal(walk.days, 10);
  assert.equal(walk.crossed?.balance, -30_000);
  sql.close();
});

test('OUTGOINGS COME BEFORE INCOMINGS ON THE SAME DAY, because a balance that dips has bounced', async () => {
  // A walk that pays you first hides exactly the day you needed to see.
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'Out', direction: 'owed_by_me', amount: gbp(60_000), due: day(4), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('obligations', { what: 'In', direction: 'owed_to_me', amount: gbp(60_000), due: day(4), state: 'open' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(50_000, LEGS, 90));
  assert.deepEqual(walk.steps.map((s) => s.label), ['Out', 'In']);
  assert.equal(walk.crossed?.label, 'Out', 'the dip was hidden by paying first');
  assert.equal(walk.steps.at(-1)?.balance, 50_000, 'and it recovers by the end of the day');
  sql.close();
});

test('AN OVERDUE MOVEMENT IS STILL A MOVEMENT, clamped to today and labelled', async () => {
  /* Dropping anything dated before today reads as "that is the past", but an unpaid invoice is money
     that has not moved yet whatever its date says. The tile that dropped them read 116 days where
     the truth was 93, and named a different row as the one that does it. */
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'Late', direction: 'owed_by_me', amount: gbp(70_000), due: day(-30), state: 'open' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(50_000, LEGS, 90));
  assert.equal(walk.steps.length, 1, 'an overdue movement was dropped');
  assert.equal(walk.steps[0]?.day, day(0), 'it kept a date in the past and broke the order');
  assert.match(walk.steps[0]?.label ?? '', /overdue/);
  assert.equal(walk.days, 0);
  sql.close();
});

test('and a zero never reaches the walk, because a row that changes nothing is a line that says nothing', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('services', { name: 'Free cert', cost: gbp(0), cycle: 'yearly', renews: day(3), state: 'live' }, { actor: 'p_1' }).ok);
  assert.deepEqual(value<Runway>(k.runway(1_000, LEGS, 90)).steps, []);
  sql.close();
});

/* ── one currency ────────────────────────────────────────────────────────── */

test('A WALK ACROSS TWO CURRENCIES PRODUCES NO STEPS AND SAYS WHY', async () => {
  // A crossing day computed across two is a real-looking date on which nothing happens.
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'a', direction: 'owed_by_me', amount: gbp(10_000), due: day(3), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(
    k.create('obligations', { what: 'b', direction: 'owed_by_me', amount: { amount: 10_000, currency: 'EUR' }, due: day(4), state: 'open' }, { actor: 'p_1' }).ok,
  );

  const walk = value<Runway>(k.runway(50_000, LEGS, 90));
  assert.deepEqual(walk.mixed, ['EUR', 'GBP']);
  assert.deepEqual(walk.steps, []);
  assert.equal(walk.crossed, null);
  assert.equal(walk.refusals[0]?.code, 'MIXED_CURRENCY');
  sql.close();
});

/* ── what it reads is declared ───────────────────────────────────────────── */

test('WHAT THE WALK READS IS DECLARED, so it is not a forecast that works for one record', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('services', { name: 'Hosting', cost: gbp(1_000), cycle: 'monthly', renews: day(1), state: 'live' }, { actor: 'p_1' }).ok);

  // The same rows, read as incomings rather than outgoings, because a leg says which.
  const out = value<Runway>(k.runway(0, [{ register: 'services', on: 'renews', amount: 'cost' }], 40));
  assert.equal(out.steps[0]?.delta, -1_000, 'a leg with no `incoming` is an outgoing, which is what a subscription is');

  const inward = value<Runway>(
    k.runway(0, [{ register: 'services', on: 'renews', amount: 'cost', incoming: { field: 'state', is: 'live' } }], 40),
  );
  assert.equal(inward.steps[0]?.delta, 1_000);

  // And a register nobody has is a refusal on the walk rather than a silently short one.
  const missing = value<Runway>(k.runway(0, [{ register: 'nothing', on: 'x', amount: 'y' }], 40));
  assert.equal(missing.refusals[0]?.code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('A MONTHLY CHARGE ON THE 31st DOES NOT DRIFT BACKWARDS THROUGH THE YEAR', async () => {
  // The same clamped arithmetic the predicate grammar uses, because the two places that step a month
  // agree by being one function.
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 0, 30, 12)));
  assert.ok((await k.install([OBLIGATIONS, SERVICES])).ok);
  assert.ok(k.create('services', { name: 'On the 31st', cost: gbp(100), cycle: 'monthly', renews: '2026-01-31', state: 'live' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(1_000, LEGS, 120));
  assert.deepEqual(walk.steps.slice(0, 4).map((s) => s.day), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  sql.close();
});

/* ── the three ways it went quietly wrong ──────────────────────────── */

const INSTANTS: Declaration = {
  id: 'register.renewals',
  kind: 'register',
  body: {
    id: 'renewals',
    name: 'Renewals',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'cost', type: 'money' },
      { id: 'renews_at', type: 'instant' },
      { id: 'state', type: 'enum', values: ['live', 'cancelled'], index: true },
    ],
  } as never,
};

test('A DATE FIELD THAT HOLDS AN INSTANT IS STILL A DATE, and not a leg that silently vanishes', async () => {
  /* `day` holds ten characters and `instant` holds twenty-four, and nothing stops a leg naming
     either. Concatenating a time onto a time is NaN, and a £500 outgoing left a walk that then said
     "you never run out" with zero refusals — which is the worst answer this module can give. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([INSTANTS])).ok);
  assert.ok(k.create('renewals', { name: 'Kiln', cost: gbp(50_000), renews_at: `${day(5)}T09:30:00.000Z`, state: 'live' }, { actor: 'p_1' }).ok);

  const out = value<Runway>(k.runway(10_000, [{ register: 'renewals', on: 'renews_at', amount: 'cost', where: 'state is live' }], 60));
  assert.equal(out.steps.length, 1, 'the leg vanished');
  assert.equal(out.steps[0]?.day, day(5), 'the step is labelled by a day, whichever the field held');
  assert.equal(out.crossed?.balance, -40_000);
  assert.deepEqual(out.refusals, []);
  sql.close();
});

test('and a date it cannot read at all is one sentence, not a silence', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  for (const what of ['A', 'B'])
    assert.ok(k.create('obligations', { what, amount: gbp(1000), due: day(3), state: 'open' }, { actor: 'p_1' }).ok);
  // A day nobody can read, put in behind the register's back — which is what an import can do.
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.due', 'sometime') WHERE register = 'obligations'");

  const out = value<Runway>(k.runway(10_000, [{ register: 'obligations', on: 'due', amount: 'amount', where: 'state is open' }], 60));
  assert.equal(out.steps.length, 0);
  assert.equal(out.refusals.length, 1);
  assert.match(out.refusals[0]!.fix, /2 rows of obligations have a due this walk could not read/);
  sql.close();
});

test('THE CAP REFUSES RATHER THAN TRUNCATING, because most of the money is not a crossing day', async () => {
  /* Two thousand and one obligations: the walk used to count two thousand of them, drop the rest,
     and still report a crossing day — the one number here that must never be approximately right. */
  const { k, sql } = await record();
  k.transaction(() => {
    for (let i = 0; i < 2001; i++) k.create('obligations', { what: `Bill ${i}`, amount: gbp(1000), due: day(1 + (i % 40)), state: 'open' }, { actor: 'p_1' });
  });

  const out = value<Runway>(k.runway(10_000, [LEGS[0]!], 90));
  assert.equal(out.steps.length, 0, 'it walked a subset');
  assert.equal(out.crossed, null);
  assert.equal(out.refusals[0]?.code, 'OUT_OF_BOUNDS');
  assert.match(out.refusals[0]!.fix, /narrow what this leg reads/);
  sql.close();
});

test('and a cycle that is not a whole number of months is refused, not rounded onto one day', async () => {
  /* `Math.round(months * n)` collapsed successive occurrences: a fortnightly £100 declared as `0.5`
     charged twice on the sixth of three months and nothing in between. */
  const { k, sql } = await record();
  assert.ok(k.create('services', { name: 'Kiln', cost: gbp(10_000), cycle: 'monthly', renews: day(1), state: 'live' }, { actor: 'p_1' }).ok);

  const out = value<Runway>(
    k.runway(100_000, [{ register: 'services', on: 'renews', amount: 'cost', every: { field: 'cycle', months: { monthly: 0.5, yearly: 12 } } }], 120),
  );
  assert.equal(out.steps.length, 0);
  assert.equal(out.refusals[0]?.code, 'VALUE_MALFORMED');
  assert.match(out.refusals[0]!.fix, /a cycle is a whole number of months/);

  // And a whole one still walks, unchanged.
  const fine = value<Runway>(k.runway(100_000, [LEGS[1]!], 120));
  assert.equal(fine.steps.length, 4);
  assert.deepEqual([...new Set(fine.steps.map((x) => x.day))].length, 4, 'two charges landed on one day');
  sql.close();
});
