/**
 * Paydays: the days a repeating line names, and what happens to one that falls on a rest day.
 *
 * A SALARY PAID TWICE A MONTH HAS DAYS, and every twice-a-month line of every record walked on the 1st and the 15th. A
 * line on the 30th typed in September read as "the end of the month" and walked to 31 October. And nothing moved a
 * payday off a weekend, where the reminders already did, and only for Saturday and Sunday.
 *
 * EVERY CASE IS A RECORD IN `Africa/Cairo`, whose weekend is Friday and Saturday, so a rule that read Saturday and
 * Sunday as fixed would show here. The month-end tests (`forecast-month-end.test.ts`) are unchanged: a leg naming no
 * days field walks as it did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* 13:00 IN CAIRO ON 20 SEPTEMBER 2026, so a line due on the 30th is still ahead. */
const NOW = Date.parse('2026-09-20T10:00:00Z');
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const RECURRING: Declaration = {
  id: 'register.recurring',
  kind: 'register',
  body: {
    id: 'recurring',
    name: 'Repeating',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'] },
      { id: 'amount', type: 'money' },
      { id: 'every', type: 'enum', values: ['weekly', 'twice_monthly', 'monthly'] },
      { id: 'next_due', type: 'day', index: true },
      { id: 'day_of_month', type: 'text' },
      { id: 'weekend', type: 'enum', values: ['leave', 'before', 'after'] },
    ],
  } as never,
};

/* THE LEG AS MONEY DECLARES IT, with the two fields this unit adds. */
const LEG: Leg = {
  register: 'recurring',
  on: 'next_due',
  amount: 'amount',
  incoming: { field: 'direction', is: 'in' },
  every: { field: 'every', months: { monthly: 1 }, weeks: { weekly: 1 }, twice: { twice_monthly: [1, 15] } },
  days: 'day_of_month',
  weekend: 'weekend',
};

async function cairo(now = NOW): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(now));
  assert.ok(k.createRecord({ id: 'rec_01J8ZX0000000000000000CA01', slug: 'cairo', name: 'Cairo', tz: 'Africa/Cairo', locale: 'en', owner: { id: 'p_1', name: 'Ada' } }).ok);
  assert.ok((await k.install([RECURRING])).ok);
  return k;
}

/** Money declares the record's rest days; this one sets them to Friday and Saturday, as a person in Cairo would. */
function restOn(k: Kernel, days: string): void {
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { rest_days: { type: 'text', default: 'Saturday, Sunday' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { rest_days: days }, { actor: 'p_1' }).ok);
}

/** The days one line walks on, inside `horizon` days, and what the walk said. */
function walk(k: Kernel, line: Record<string, unknown>, horizon = 75, leg: Leg = LEG): { days: string[]; said: string[] } {
  assert.ok(k.create('recurring', { what: 'Salary', direction: 'in', amount: egp(5_000_000), ...line }, { actor: 'p_1' }).ok);
  const out = k.runway(0, [leg], horizon);
  assert.ok(out.ok, JSON.stringify(out));
  return { days: out.value.steps.map((s) => s.day), said: out.value.refusals.map((r) => r.fix) };
}

test('A LINE PAID ON "15, last" WALKS TO 15 AND 31 OCTOBER, 15 AND 30 NOVEMBER', async () => {
  const { days, said } = walk(await cairo(), { every: 'twice_monthly', next_due: '2026-10-15', day_of_month: '15, last' });
  assert.deepEqual(days, ['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
  assert.deepEqual(said, []);
});

test('and before its days were set, the same line walked to the 1st and the 15th', async () => {
  const { days } = walk(await cairo(), { every: 'twice_monthly', next_due: '2026-10-15' });
  assert.deepEqual(days, ['2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01']);
});

test('A LINE ON THE 30TH WITH day_of_month 30 WALKS TO 30 OCTOBER, never the 31st', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-09-30', day_of_month: '30' }, 110);
  assert.deepEqual(days, ['2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30']);
});

test('while one with its days empty still reads the 30th of September as the month end', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-09-30' }, 110);
  assert.deepEqual(days, ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
});

test('"last" IS EACH MONTH\'S OWN LAST DAY, from a line typed on the 30th', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-09-30', day_of_month: 'last' }, 110);
  assert.deepEqual(days, ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
});

test('WITH REST DAYS FRIDAY AND SATURDAY AND "the working day before", A PAYDAY ON FRIDAY 30 OCTOBER WALKS ON THURSDAY 29', async () => {
  const k = await cairo();
  restOn(k, 'Friday, Saturday');
  const { days } = walk(k, { every: 'monthly', next_due: '2026-09-30', day_of_month: '30', weekend: 'before' }, 110);
  /* 30 September is a Wednesday and 30 November a Monday, so only October's moves. */
  assert.deepEqual(days, ['2026-09-30', '2026-10-29', '2026-11-30', '2026-12-30']);
});

test('and on the default Saturday and Sunday, Friday 30 October is a working day and stays', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-09-30', day_of_month: '30', weekend: 'before' }, 110);
  assert.deepEqual(days, ['2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30']);
});

test('"the working day after" moves Saturday 31 October on to Monday 2 November', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-09-30', day_of_month: 'last', weekend: 'after' }, 110);
  assert.deepEqual(days, ['2026-09-30', '2026-11-02', '2026-11-30', '2026-12-31']);
});

test('A LINE WITH NO RULE IS LEFT WHERE IT FALLS, whatever the rest days are', async () => {
  const k = await cairo();
  restOn(k, 'Friday, Saturday');
  const { days } = walk(k, { every: 'monthly', next_due: '2026-09-30', day_of_month: '30' }, 50);
  assert.deepEqual(days, ['2026-09-30', '2026-10-30']);
});

/* A "NEXT" ALREADY MOVED IS THAT MONTH'S PAYMENT, and the named day it stands for is not walked again. */
test('a "Next" typed as Thursday 29 October for a payday on the 30th is October\'s pay, not one more', async () => {
  const k = await cairo();
  restOn(k, 'fri sat');
  const { days } = walk(k, { every: 'monthly', next_due: '2026-10-29', day_of_month: '30', weekend: 'before' }, 80);
  assert.deepEqual(days, ['2026-10-29', '2026-11-30']);
});

test('and one typed as Monday 2 November for a payday on the last day is October\'s, so November\'s still walks', async () => {
  const { days } = walk(await cairo(), { every: 'monthly', next_due: '2026-11-02', day_of_month: 'last', weekend: 'after' }, 80);
  assert.deepEqual(days, ['2026-11-02', '2026-11-30']);
});

test('DAYS THE WALK CANNOT READ ARE SAID, and the line walks by how often alone', async () => {
  const { days, said } = walk(await cairo(), { every: 'twice_monthly', next_due: '2026-10-15', day_of_month: 'mid-month' });
  assert.deepEqual(days, ['2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01']);
  assert.equal(said.length, 1);
  assert.match(said[0]!, /^1 line of recurring has days in day_of_month that this walk could not read/);
});

test('a weekly line walks by its seven days whatever it names', async () => {
  const { days } = walk(await cairo(), { every: 'weekly', next_due: '2026-10-01', day_of_month: '15' }, 30);
  assert.deepEqual(days, ['2026-10-01', '2026-10-08', '2026-10-15']);
});

test('A LEG NAMING NO DAYS FIELD WALKS AS IT DID, rule or not', async () => {
  const { days: plain } = walk(await cairo(), { every: 'twice_monthly', next_due: '2026-10-15', day_of_month: '15, last', weekend: 'after' }, 75, {
    ...LEG,
    days: undefined as never,
    weekend: undefined as never,
  });
  assert.deepEqual(plain, ['2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01']);
});

/* 00:01 ON 10 OCTOBER IN CAIRO IS 21:01 UTC ON THE 9TH, the hours a walk that named today from UTC got wrong. */
test('A BILL DUE YESTERDAY READS LATE AT ONE MINUTE PAST MIDNIGHT LOCAL TIME, and one due today does not', async () => {
  const k = await cairo(Date.parse('2026-10-09T21:01:00Z'));
  assert.ok(k.create('recurring', { what: 'Rent', direction: 'out', amount: egp(1_000_000), next_due: '2026-10-09' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('recurring', { what: 'Power', direction: 'out', amount: egp(50_000), next_due: '2026-10-10' }, { actor: 'p_1' }).ok);
  const out = k.runway(5_000_000, [LEG], 30);
  assert.ok(out.ok, JSON.stringify(out));
  const by = Object.fromEntries(out.value.steps.map((s) => [s.spoken, s]));
  assert.equal(by['recurring#1']?.label, 'Rent · overdue');
  assert.equal(by['recurring#1']?.day, '2026-10-10');
  assert.equal(by['recurring#2']?.label, 'Power');
});

/* FEBRUARY IS THE SHORT MONTH BOTH READINGS MEET IN: "last" is its last day, and so is 30, which it has not got. */
test('IN FEBRUARY "last" AND 30 BOTH WALK TO THE 28TH, and to the 29th in a leap year', async () => {
  const common = Date.parse('2027-01-20T10:00:00Z');
  assert.deepEqual(walk(await cairo(common), { every: 'monthly', next_due: '2027-01-31', day_of_month: 'last' }, 75).days, ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(walk(await cairo(common), { every: 'monthly', next_due: '2027-01-30', day_of_month: '30' }, 75).days, ['2027-01-30', '2027-02-28', '2027-03-30']);
  const leap = Date.parse('2028-01-20T10:00:00Z');
  assert.deepEqual(walk(await cairo(leap), { every: 'monthly', next_due: '2028-01-31', day_of_month: 'last' }, 75).days, ['2028-01-31', '2028-02-29', '2028-03-31']);
  assert.deepEqual(walk(await cairo(leap), { every: 'monthly', next_due: '2028-01-30', day_of_month: '30' }, 75).days, ['2028-01-30', '2028-02-29', '2028-03-30']);
  assert.deepEqual(walk(await cairo(leap), { every: 'twice_monthly', next_due: '2028-02-15', day_of_month: '15, last' }, 75).days, ['2028-02-15', '2028-02-29', '2028-03-15', '2028-03-31']);
});

/* SUNDAY 1 NOVEMBER: Saturday's payday, paid the working day after, has not come yet. */
test('a payday moved on past a weekend still walks on the weekend day between', async () => {
  const { days } = walk(await cairo(Date.parse('2026-11-01T10:00:00Z')), { every: 'monthly', next_due: '2026-10-31', day_of_month: 'last', weekend: 'after' }, 40);
  assert.deepEqual(days, ['2026-11-02', '2026-11-30']);
});

test('DAYS THAT DO NOT FIT HOW OFTEN A LINE REPEATS ARE SAID, and it walks by how often alone', async () => {
  const twoOnMonthly = walk(await cairo(), { every: 'monthly', next_due: '2026-10-15', day_of_month: '15, last' }, 75);
  assert.deepEqual(twoOnMonthly.days, ['2026-10-15', '2026-11-15']);
  assert.match(twoOnMonthly.said.join(' '), /^1 line of recurring names days in day_of_month that do not fit how often it repeats/);
  const oneOnTwice = walk(await cairo(), { every: 'twice_monthly', next_due: '2026-10-15', day_of_month: 'last' });
  assert.deepEqual(oneOnTwice.days, ['2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01']);
  assert.equal(oneOnTwice.said.length, 1);
});
