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
      /* NOT MONEY, and a leg is allowed to point at it. That is the whole point of the test below. */
      { id: 'effort', type: 'duration' },
      /* A FIELD THAT CAN HOLD ANYTHING, so a test can put the SHAPE of money in a row without the
         substance of it. `isMoney` used to test that the two keys were present and never what was
         under them. */
      { id: 'blob', type: 'json' },
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
  assert.match(out.refusals[0]!.fix, /Narrow what this leg reads/);
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

test('A LEG POINTED AT SOMETHING THAT IS NOT MONEY SAYS SO, rather than vanishing', async () => {
  /* `amount === null → continue` skipped the row in silence, and only unreadable DATES were counted
     — so a leg pointing at a `duration` or an `int` produced no steps and no refusals, and the page
     said nothing crosses zero. That is the one answer a cash walk must never give wrongly: it is
     read by somebody deciding whether they can pay a bill. */
  const { k, sql } = await record();
  for (const n of [1, 2, 3])
    assert.ok(
      k.create('obligations', { what: `Job ${n}`, direction: 'owed_by_me', due: day(n * 5), state: 'open', effort: 3600 }, { actor: 'p_1' }).ok,
    );

  const walk = value<Runway>(k.runway(100_000, [{ register: 'obligations', on: 'due', amount: 'effort' }], 180));
  assert.deepEqual(walk.steps, [], 'seconds were walked as money');
  assert.equal(walk.refusals.length, 1, 'three rows of the wrong type produced no steps and no sentence');
  assert.match(walk.refusals[0]?.fix ?? '', /is not money in 3 rows/);
  assert.equal(walk.refusals[0]?.at, 'amount');
  sql.close();
});

test('A VALUE THAT ONLY LOOKS LIKE MONEY IS NOT MONEY, and it used to be added as text', async () => {
  /* `isMoney` tested that `amount` and `currency` were PRESENT and never what was under them, so
     `{ amount: '500', currency: 'GBP' }` walked through: `delta` came out as the string "500", the
     running balance became "100000500" by concatenation rather than by addition, and every
     `balance < 0` after it was a string comparison. It is the guard the `not money` sentence exists
     to feed, so a value it waved through was money missing from the answer in silence. */
  const { k, sql } = await record();
  assert.ok(
    k.create(
      'obligations',
      { what: 'Looks like money', direction: 'owed_by_me', due: day(5), state: 'open', blob: { amount: '500', currency: 'GBP' } },
      { actor: 'p_1' },
    ).ok,
  );

  const walk = value<Runway>(k.runway(100_000, [{ register: 'obligations', on: 'due', amount: 'blob' }], 180));
  for (const step of walk.steps) assert.equal(typeof step.balance, 'number', `the balance is ${JSON.stringify(step.balance)}`);
  assert.deepEqual(walk.steps, [], 'a string amount was walked as money');
  assert.equal(walk.refusals.length, 1, 'the row that is not money produced no sentence');
  assert.match(walk.refusals[0]?.fix ?? '', /is not money in 1 row/);
  sql.close();
});

test('A HORIZON IS CHECKED BEFORE IT IS MULTIPLIED, and it used to be checked nowhere', async () => {
  /* `horizon` arrives on a block, so it is a number somebody typed in a declaration deciding how
     much work this function does. And a monthly charge over ten years hit a bare `64` in the middle
     of the recurrence loop and stopped in 2031 with no sentence, which is the truncation the row cap
     forty lines up refuses to do, in the one number that must never be approximately right. */
  const { k, sql } = await record();
  for (const bad of [0, -1, 1.5, 10_000, Number.NaN]) {
    const out = k.runway(100_000, LEGS, bad);
    assert.equal(out.ok, false, `a horizon of ${bad} was walked`);
  }
  assert.equal(k.runway(100_000, LEGS, 3650).ok, true, 'ten years is inside the ceiling and was refused');
  sql.close();
});

test('and a row with no amount at all is simply not a movement', async () => {
  // Absent is not wrong. A row nobody has priced yet moves no balance, and saying so on every one of
  // them would bury the leg that is actually misdeclared.
  const { k, sql } = await record();
  assert.ok(k.create('obligations', { what: 'Unpriced', direction: 'owed_by_me', due: day(5), state: 'open' }, { actor: 'p_1' }).ok);
  const walk = value<Runway>(k.runway(100_000, [{ register: 'obligations', on: 'due', amount: 'amount' }], 180));
  assert.deepEqual(walk.refusals, []);
  sql.close();
});

test('A RECURRING ROW DOES NOT CHARGE ITS PAST CYCLES AGAIN TODAY, because they already left the account', async () => {
  /* `renews` is an anchor nobody moves on. The walk started at it and clamped every cycle before now
     to today as overdue, so a monthly GBP 41.00 service anchored three months back charged GBP 164.00
     on day one, and one anchored in 2020 charged 64 times and hit the cap. */
  const sql = openSqlite();
  const now = Date.UTC(2026, 8, 16, 12);
  const k = await openRecord(sql, fixedClock(now));
  assert.ok((await k.install([OBLIGATIONS, SERVICES])).ok);
  assert.ok(k.create('services', { name: 'Hosting', cost: gbp(4_100), cycle: 'monthly', renews: '2026-06-10', state: 'live' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('services', { name: 'Domain', cost: gbp(1_000), cycle: 'monthly', renews: '2020-01-01', state: 'live' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('services', { name: 'Today', cost: gbp(500), cycle: 'monthly', renews: '2026-08-16', state: 'live' }, { actor: 'p_1' }).ok);

  const walk = value<Runway>(k.runway(50_000, [LEGS[1]!], 30));
  assert.deepEqual(
    walk.steps.map((s) => `${s.day} ${s.label}`),
    ['2026-09-16 Today', '2026-10-01 Domain', '2026-10-10 Hosting', '2026-10-16 Today'],
  );
  assert.deepEqual(walk.refusals, []);
  assert.equal(walk.crossed, null);
  sql.close();
});

test('A BILL DUE TODAY IS NOT OVERDUE IN THE AFTERNOON', async () => {
  /* `late` compared noon UTC on the due day with the clock, so a bill due today read overdue from
     12:00 UTC while `due before today` still excluded it. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 16, 15)));
  assert.ok((await k.install([OBLIGATIONS, SERVICES])).ok);
  assert.ok(k.create('obligations', { what: 'Rent', direction: 'owed_by_me', amount: gbp(100_000), due: '2026-09-16', state: 'open' }, { actor: 'p_1' }).ok);
  const walk = value<Runway>(k.runway(500_000, [LEGS[0]!], 30));
  assert.equal(walk.steps[0]?.label, 'Rent');
  assert.equal(walk.steps[0]?.day, '2026-09-16');
  sql.close();
});
