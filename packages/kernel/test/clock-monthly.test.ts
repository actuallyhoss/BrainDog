/**
 * An automation's clock that keeps the calendar: every month, or every few, on a day of the month at a time in the
 * record's zone.
 *
 * MEASURED BEFORE THIS: `flow-lint.ts` refused `every: 1mo`, `1M`, `1month` and `1y` as "a clock is a number and one of
 * m, h, d or w", `day: last` on a weekly clock as "a day is mon to sun", and on a daily one as "day: has nothing to
 * choose". So a bill due on the last day of each month could only be carried as a task somebody copies forward by hand.
 * A daily or four-weekly clock is no substitute: it leaves the date within a month, and a date that drifts is the wrong
 * day on a bill.
 *
 * THE ORACLE IS THE CALENDAR, WRITTEN OUT BY HAND. Every expected instant below is a `Date.UTC` somebody can check
 * against a wall calendar and the zone's published change dates, never the output of the code under test. London
 * goes to BST on 28 March 2027 and New York to EDT on 14 March 2027 and back on 7 November 2027.
 *
 * `clock.ts` IS IMPORTED INSIDE EACH TEST that reads it, so that before it existed each of those failed on its own line
 * rather than taking the lint tests down with it at the import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });
const clocked = (on: Record<string, unknown>) => validateDeclaration(rule({ rule: 'next_rent', on, then: [{ stop: true }] }));
const code = (on: Record<string, unknown>): string | null => clocked(on)?.code ?? null;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/* ── what the lint takes ──────────────────────────────────────────────── */

test('A MONTHLY CLOCK INSTALLS on a day of the month or on the last one, at a time', () => {
  assert.equal(code({ every: '1mo', day: 'last', at: '09:00' }), null, clocked({ every: '1mo', day: 'last', at: '09:00' })?.fix);
  assert.equal(code({ every: '1mo', day: 1, at: '09:00' }), null);
  assert.equal(code({ every: '1mo', day: 31, at: '23:30' }), null);
  /* EVERY FEW MONTHS NAMES THE MONTH IT COUNTS FROM, so the months it falls in are written in the rule and not in
     whichever day it happened to be installed or last edited on. */
  assert.equal(code({ every: '3mo', day: 1, at: '09:00', month: 'jan' }), null);
  assert.equal(code({ every: '1y', day: 29, at: '09:00', month: 'feb' }), null);
  assert.equal(code({ every: '12mo', day: 'last', at: '09:00', month: 'dec' }), null);
});

test('A MONTHLY CLOCK THAT CANNOT BE READ ONE WAY IS REFUSED, each with the sentence that says what to write', () => {
  /* `m` IS MINUTES ON THIS CLOCK, as on a connector, so a month has a spelling of its own and the others stay refused. */
  for (const every of ['1M', '1month', '1 mo', '0mo'])
    assert.match(clocked({ every, day: 1, at: '09:00' })?.fix ?? '', /1mo/u, `${every} was taken as a clock`);
  /* A COUNT OF MONTHS THAT DOES NOT DIVIDE THE YEAR falls in different months each year, and has no month to count from
     that stays true. */
  for (const every of ['5mo', '2y', '24mo']) assert.equal(code({ every, day: 1, at: '09:00', month: 'jan' }), 'DECLARATION_INVALID', every);
  assert.equal(code({ every: '1mo', at: '09:00' }), 'REQUIRED_MISSING');
  assert.equal(clocked({ every: '1mo', at: '09:00' })?.at, 'on.day');
  assert.equal(code({ every: '1mo', day: 'last' }), 'REQUIRED_MISSING');
  assert.equal(code({ every: '1mo' }), 'REQUIRED_MISSING');
  for (const day of [0, 32, 1.5, 'mon', '15', 'first'])
    assert.match(clocked({ every: '1mo', day, at: '09:00' })?.fix ?? '', /1 to 31, or last/u, `day: ${JSON.stringify(day)} was taken`);
  assert.equal(code({ every: '1mo', day: 1, at: '25:00' }), 'DECLARATION_INVALID');
  assert.equal(code({ every: '1mo', day: 1, at: '09:00', month: 'jan' }), 'DECLARATION_INVALID');
  assert.equal(code({ every: '3mo', day: 1, at: '09:00' }), 'REQUIRED_MISSING');
  assert.equal(clocked({ every: '3mo', day: 1, at: '09:00' })?.at, 'on.month');
  assert.equal(code({ every: '3mo', day: 1, at: '09:00', month: 'january' }), 'DECLARATION_INVALID');
  /* AND A MONTH ON A CLOCK THAT HAS NONE IS REFUSED, where before it was refused as a stray key. */
  assert.equal(code({ every: '1w', day: 'mon', at: '09:00', month: 'jan' }), 'DECLARATION_INVALID');
});

test('A DAY OF THE MONTH ON A DAILY OR WEEKLY CLOCK POINTS AT THE MONTHLY ONE, and the old sentences still say what they said', () => {
  assert.match(clocked({ every: '1w', at: '08:00', day: 'last' })?.fix ?? '', /a day is mon to sun.*every: 1mo/u);
  assert.match(clocked({ every: '1d', at: '08:00', day: 'last' })?.fix ?? '', /day: has nothing to choose.*every: 1mo/u);
  assert.equal(code({ every: '1w', at: '08:00', day: 'mon' }), null);
});

test('A CREATE ON A MONTHLY CLOCK IS BOUNDED AS ONE ON A WEEKLY CLOCK IS: bound: takes it, and none is CREATE_UNBOUNDED', () => {
  const creates = (on: Record<string, unknown>, bound: Record<string, unknown>) =>
    validateDeclaration(rule({ rule: 'next_rent', on, then: [{ create: { register: 'obligations', fields: { what: 'Rent' }, ...bound } }] }));
  for (const on of [{ every: '1w', day: 'mon', at: '09:00' }, { every: '1mo', day: 'last', at: '09:00' }]) {
    assert.equal(creates(on, { bound: 1 }), null, `${on.every}: ${creates(on, { bound: 1 })?.fix}`);
    assert.equal(creates(on, {})?.code, 'CREATE_UNBOUNDED', on.every);
  }
});

/* ── when it next runs, from the calendar ─────────────────────────────── */

test('THE 31ST FALLS ON EACH MONTH\'S LAST DAY WHERE IT HAS NONE, and comes back to the 31st the month after', async () => {
  const { calendarOf, nextCalendar } = await import('../src/clock.ts');
  const cal = calendarOf({ every: '1mo', day: 31, at: '09:00' });
  assert.ok(cal);
  /* A YEAR WALKED ONE RUN AT A TIME, each from the instant the one before was due, which is how `onClock` asks. A clock
     that added thirty days, or stepped from the day it last landed on, would be on the 28th by March and stay there. */
  const days: number[] = [];
  let at = Date.UTC(2027, 0, 1);
  for (let i = 0; i < 12; i++) {
    at = nextCalendar(cal, at, 'UTC')!;
    assert.equal(new Date(at).getUTCHours(), 9);
    days.push(new Date(at).getUTCDate());
  }
  assert.deepEqual(days, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
});

test('THE LAST DAY IS THE CALENDAR\'S: the 28th of February, the 29th in a leap year, the 30th of April', async () => {
  const { calendarOf, nextCalendar } = await import('../src/clock.ts');
  const last = calendarOf({ every: '1mo', day: 'last', at: '09:00' })!;
  assert.equal(iso(nextCalendar(last, Date.UTC(2027, 1, 1), 'UTC')), '2027-02-28T09:00:00.000Z');
  assert.equal(iso(nextCalendar(last, Date.UTC(2028, 1, 1), 'UTC')), '2028-02-29T09:00:00.000Z');
  assert.equal(iso(nextCalendar(last, Date.UTC(2027, 3, 1), 'UTC')), '2027-04-30T09:00:00.000Z');
  /* STRICTLY AFTER. Asked at the very instant it was due, the answer is next month, or the drain would run it twice. */
  assert.equal(iso(nextCalendar(last, Date.UTC(2027, 3, 30, 9), 'UTC')), '2027-05-31T09:00:00.000Z');
  assert.equal(iso(nextCalendar(last, Date.UTC(2027, 3, 30, 8, 59), 'UTC')), '2027-04-30T09:00:00.000Z');
  /* AND A 30TH IN FEBRUARY DOES NOT CARRY INTO MARCH as the 2nd, which is what `Date.UTC(2027, 1, 30)` answers. */
  const thirtieth = calendarOf({ every: '1mo', day: 30, at: '09:00' })!;
  assert.equal(iso(nextCalendar(thirtieth, Date.UTC(2027, 1, 1), 'UTC')), '2027-02-28T09:00:00.000Z');
  assert.equal(iso(nextCalendar(thirtieth, Date.UTC(2027, 1, 28, 9), 'UTC')), '2027-03-30T09:00:00.000Z');
});

test('THE TIME IS THE RECORD\'S WALL CLOCK ACROSS A CHANGE OF OFFSET, and the day is the zone\'s own', async () => {
  const { calendarOf, nextCalendar } = await import('../src/clock.ts');
  const fifteenth = calendarOf({ every: '1mo', day: 15, at: '09:00' })!;
  /* LONDON: 09:00 GMT in March, 09:00 BST in April, which is an hour earlier in UTC. */
  assert.equal(iso(nextCalendar(fifteenth, Date.UTC(2027, 2, 1), 'Europe/London')), '2027-03-15T09:00:00.000Z');
  assert.equal(iso(nextCalendar(fifteenth, Date.UTC(2027, 2, 15, 9), 'Europe/London')), '2027-04-15T08:00:00.000Z');
  /* THE LAST DAY OF MARCH IN LONDON, the first last day after the change, measured on the wall. */
  const last = calendarOf({ every: '1mo', day: 'last', at: '09:00' })!;
  assert.equal(iso(nextCalendar(last, Date.UTC(2027, 1, 28, 9), 'Europe/London')), '2027-03-31T08:00:00.000Z');
  /* A ZONE AHEAD OF UTC: the last day of the month at 00:30 in Tokyo is the day before in UTC, and still the last day
     of Tokyo's month, not of UTC's. */
  const late = calendarOf({ every: '1mo', day: 'last', at: '00:30' })!;
  assert.equal(iso(nextCalendar(late, Date.UTC(2027, 3, 1), 'Asia/Tokyo')), '2027-04-29T15:30:00.000Z');
  /* A TIME THE ZONE SKIPS: 02:30 on 14 March 2027 does not exist in New York, and the run is at the first minute the
     wall shows past it, 03:30 EDT, rather than the day after or not at all. */
  const skipped = calendarOf({ every: '1mo', day: 14, at: '02:30' })!;
  assert.equal(iso(nextCalendar(skipped, Date.UTC(2027, 2, 1), 'America/New_York')), '2027-03-14T07:30:00.000Z');
  /* A TIME THE ZONE SAYS TWICE: 01:30 on 7 November 2027 is once in EDT and again in EST, and the run is the first. */
  const twice = calendarOf({ every: '1mo', day: 7, at: '01:30' })!;
  assert.equal(iso(nextCalendar(twice, Date.UTC(2027, 10, 1), 'America/New_York')), '2027-11-07T05:30:00.000Z');
});

test('EVERY FEW MONTHS FALLS IN THE MONTHS COUNTED FROM ITS MONTH, and a year is twelve of them', async () => {
  const { calendarOf, nextCalendar } = await import('../src/clock.ts');
  const quarterly = calendarOf({ every: '3mo', day: 1, at: '09:00', month: 'jan' })!;
  const runs: string[] = [];
  let at = Date.UTC(2027, 1, 10);
  for (let i = 0; i < 4; i++) runs.push(iso((at = nextCalendar(quarterly, at, 'UTC')!))!.slice(0, 10));
  assert.deepEqual(runs, ['2027-04-01', '2027-07-01', '2027-10-01', '2028-01-01']);
  /* THE 29TH OF FEBRUARY, once a year: the 28th in a common year and the 29th in a leap one. */
  const yearly = calendarOf({ every: '1y', day: 29, at: '09:00', month: 'feb' })!;
  assert.equal(iso(nextCalendar(yearly, Date.UTC(2027, 2, 1), 'UTC')), '2028-02-29T09:00:00.000Z');
  assert.equal(iso(nextCalendar(yearly, Date.UTC(2028, 2, 1), 'UTC')), '2029-02-28T09:00:00.000Z');
  assert.deepEqual(calendarOf({ every: '12mo', day: 29, at: '09:00', month: 'feb' }), yearly);
});

/* ── through the record ───────────────────────────────────────────────── */

async function withRuns(sql: NodeSql): Promise<void> {
  if (sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) return;
  const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
  sql.db.exec(ddl);
}

test('A RULE ON THE LAST DAY OF EACH MONTH IS ARMED FOR IT, RUNS ON IT, AND IS ARMED FOR THE NEXT, in the record\'s zone', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2027, 0, 20, 12));
  const k = await openRecord(sql, clock);
  await withRuns(sql);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'Europe/London', locale: 'en', owner: { id: 'p_1' } }).ok);
  const rent = rule({ rule: 'next_rent', on: { every: '1mo', day: 'last', at: '09:00' }, steps: [{ notify: { say: 'Rent is due today.' } }] });
  const done = await k.install([OBLIGATIONS, rent]);
  assert.ok(done.ok, JSON.stringify(done));

  const due = (): string | undefined => sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = 'flow.every:next_rent' AND state = 'pending'")?.due_at;
  const made = (): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'note' AND actor = 'rule:next_rent'")!.n;
  assert.equal(due(), '2027-01-31T09:00:00.000Z');

  /* EACH TURN IS TAKEN AT THE INSTANT IT WAS DUE, and London moves to BST on 28 March, so March's run is at 08:00 UTC. */
  const expected = ['2027-02-28T09:00:00.000Z', '2027-03-31T08:00:00.000Z', '2027-04-30T08:00:00.000Z'];
  for (const [i, next] of expected.entries()) {
    clock.set(Date.parse(due()!));
    await k.drain();
    assert.equal(made(), i + 1, `turn ${i + 1} ran nothing`);
    assert.equal(due(), next);
  }

  /* A DRAIN THAT COMES LATE TAKES EVERY TURN IT MISSED, each as its own run, and is armed for the next one ahead. It
     once took the first and folded the rest into it: here a host back on 2 July took the turn of 30 April and none of
     31 May or 30 June, and said nothing. Three turns after the three above. */
  clock.set(Date.UTC(2027, 6, 2, 12));
  await k.drain();
  assert.equal(made(), 6);
  assert.deepEqual(
    sql.all<{ at: string }>("SELECT json_extract(trigger, '$.at') AS at FROM automation_run WHERE rule = 'next_rent' ORDER BY started_at, rowid").slice(-3).map((r) => r.at),
    ['2027-04-30T08:00:00.000Z', '2027-05-31T08:00:00.000Z', '2027-06-30T08:00:00.000Z'],
  );
  assert.equal(due(), '2027-07-31T08:00:00.000Z');
});

/* A CREATE ON ANY CLOCK INSTALLED AND THEN FAILED EVERY RUN, the weekly one included. Measured with
   `then: [{ create: { register: obligations, fields: { what: Rent }, bound: 1 } }]` on `every: 1w` and on `every: 1mo`:
   both armed, both ran on time, and both runs failed with "rule.<id>'s create step acts on a row, and this run has none
   to act on." (`flow.ts` `act`, where a step with no subject reached `runRules`, which fills a create from the row that
   fired it). The clock was not the gap; making the next task each month also needed a create that stands on no row,
   which `rules.ts`'s `createAlone` is. `clock-create.test.ts` holds what such a create refuses. */
test('A CREATE ON A CLOCK MAKES ITS ROW AT EACH TURN, weekly and monthly, one row a turn and the run done', async () => {
  for (const on of [{ every: '1w', day: 'mon', at: '09:00' }, { every: '1mo', day: 'last', at: '09:00' }]) {
    const sql = openSqlite();
    const clock = fixedClock(Date.UTC(2027, 0, 20, 12));
    const k = await openRecord(sql, clock);
    await withRuns(sql);
    assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'Europe/London', locale: 'en', owner: { id: 'p_1' } }).ok);
    const next = rule({ rule: 'next_rent', on, then: [{ create: { register: 'obligations', fields: { what: 'Rent' }, bound: 1 } }] });
    const done = await k.install([OBLIGATIONS, next]);
    assert.ok(done.ok, JSON.stringify(done));

    const due = (): string => sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = 'flow.every:next_rent' AND state = 'pending'")!.due_at;
    const rows = (): string[] => sql.all<{ what: string }>("SELECT json_extract(fields, '$.what') AS what FROM entry WHERE register = 'obligations' AND deleted_at IS NULL").map((r) => r.what);
    const said = (): (string | null)[] => sql.all<{ say: string | null }>("SELECT say FROM automation_run WHERE rule = 'next_rent' ORDER BY started_at, rowid").map((r) => r.say);

    for (const turn of [1, 2]) {
      clock.set(Date.parse(due()));
      await k.drain();
      assert.deepEqual(said(), Array(turn).fill(null), `${on.every} turn ${turn}: ${said().join(' | ')}`);
      assert.deepEqual(rows(), Array(turn).fill('Rent'), `${on.every} turn ${turn} made ${rows().length} rows`);
    }
    sql.close();
  }
});
