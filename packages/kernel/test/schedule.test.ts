/**
 * Reminders, derived from the dates the record already holds.
 *
 * The failure every one of these is about: a reminder that is a separate object from the date it is
 * about. The invoice slips a week, the reminder does not, and it fires about a date that is no longer
 * true. Nobody sets a reminder here — a field declares one, and moving the date moves them with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { atMs, expandRepeat, offsetMs, openRecord, shiftFrom, type Declaration, type Kernel } from '../src/index.ts';
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
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', remind: ['-7d', '0d'] },
      { id: 'quiet', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
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
      { id: 'renews', type: 'day', remind: ['-3d'], repeat: { freq: 'month' } },
    ],
  } as never,
};

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

const pending = (sql: NodeSql) =>
  /* THE REMINDERS, and only those. Installing a declaration now also arms the rows it earns — the
     weekly `analyse`, a `digest`'s next send, a metric's snapshot — and a helper named `reminders`
     that counted every pending row would make every test below it about something else. */
  sql.all<{ key: string; due_at: string; state: string }>(
    "SELECT key, due_at, state FROM schedule WHERE kind = 'reminder' AND state = 'pending' ORDER BY due_at",
  );

const day = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

/* ── the offsets ─────────────────────────────────────────────────────────── */

test('an offset is a signed span, and anything else is not one', () => {
  assert.equal(offsetMs('-7d'), -7 * DAY);
  assert.equal(offsetMs('0d'), 0);
  assert.equal(offsetMs('+2w'), 14 * DAY);
  assert.equal(offsetMs('a week before'), null);
  assert.equal(atMs('2026-09-05'), Date.UTC(2026, 8, 5, 12), 'a day is measured at noon, so no timezone moves it');
});

/* ── the derivation ──────────────────────────────────────────────────────── */

test('A DATE THAT MOVES TAKES ITS REMINDERS WITH IT', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', due: day(30) }, { actor: 'p_1' }));

  const first = pending(sql);
  assert.equal(first.length, 2, 'two offsets, two reminders');
  assert.deepEqual(first.map((r) => r.due_at.slice(0, 10)), [day(23), day(30)]);

  value(k.update('obligations', 'obligations#1', { due: day(60) }, { actor: 'p_1' }));
  const moved = pending(sql);
  assert.equal(moved.length, 2, 'the old reminders were left behind');
  assert.deepEqual(moved.map((r) => r.due_at.slice(0, 10)), [day(53), day(60)]);
  sql.close();
});

test('a field with no `remind:` gets none, however many dates it holds', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', quiet: day(10) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0);
  sql.close();
});

test('clearing the date clears the reminders', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(10) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 2);
  value(k.update('obligations', 'obligations#1', { due: null }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0, 'a reminder outlived the date it was about');
  sql.close();
});

test('deleting the row cancels them, and restoring it brings them back', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(10) }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: day(0) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0, 'a deleted row is still going to be reminded about');
  value(k.update('obligations', 'obligations#1', { deleted_at: null }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 2);
  sql.close();
});

test('A REMINDER ALREADY PAST IS NOT DERIVED', async () => {
  // Otherwise every import and every restore fires a year of reminders at once, which is the failure
  // of every scheduler that reads "due" as "should have fired".
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'overdue', due: day(-30) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0);

  // And one whose date is past but whose reminder is not still lands.
  value(k.create('obligations', { what: 'soon', due: day(3) }, { actor: 'p_1' }));
  const rows = pending(sql);
  assert.equal(rows.length, 1, 'the -7d reminder for a date three days away is in the past');
  assert.equal(rows[0]?.due_at.slice(0, 10), day(3));
  sql.close();
});

/* ── repeats ─────────────────────────────────────────────────────────────── */

test('a monthly repeat lands in every month, and clamps rather than overflowing', () => {
  // Adding to the month number rolls 31 January into 3 March, which is not what anybody means by
  // monthly — the last day of the month they named is.
  const jan31 = Date.UTC(2026, 0, 31, 12);
  const months = expandRepeat(jan31, { freq: 'month' }, jan31, 120).map((ms) => new Date(ms).toISOString().slice(0, 10));
  assert.deepEqual(months.slice(0, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a repeat stops at its horizon, its count and its until', () => {
  const at = Date.UTC(2026, 0, 1, 12);
  assert.equal(expandRepeat(at, { freq: 'day' }, at, 10).length, 11, 'the horizon is inclusive of today');
  assert.equal(expandRepeat(at, { freq: 'day', count: 3 }, at, 400).length, 3);
  assert.equal(expandRepeat(at, { freq: 'day', until: '2026-01-05' }, at, 400).length, 5);
  // A yearly repeat with no `until` is an infinite series; the horizon is what makes it finite.
  assert.ok(expandRepeat(at, { freq: 'year' }, at, 400).length <= 2);
});

test('a weekend can be moved to the working day either side', () => {
  const saturday = Date.UTC(2026, 0, 3, 12);
  assert.equal(new Date(saturday).getUTCDay(), 6);
  const previous = expandRepeat(saturday, { freq: 'week', count: 1, workday: 'previous' }, saturday)[0]!;
  const next = expandRepeat(saturday, { freq: 'week', count: 1, workday: 'next' }, saturday)[0]!;
  assert.equal(new Date(previous).toISOString().slice(0, 10), '2026-01-02');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2026-01-05');
});

test('a repeating field derives a reminder per occurrence', async () => {
  const { k, sql } = await record();
  value(k.create('services', { name: 'Hosting', renews: day(10) }, { actor: 'p_1' }));
  const rows = pending(sql);
  assert.ok(rows.length > 10, `a monthly renewal over 400 days produced ${rows.length} reminders`);
  const row = k.get('services#1')!;
  for (const r of rows) assert.ok(r.key.startsWith(`${row.id}:renews:`), `${r.key} came from somewhere else`);
  // Each is three days before its occurrence.
  assert.equal(rows[0]?.due_at.slice(0, 10), day(7));
  sql.close();
});

/* ── the key is the derivation ───────────────────────────────────────────── */

test('THE KEY ENCODES THE DERIVATION, so re-deriving is a range and not a diff', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const row = k.get('obligations#1')!;
  for (const r of pending(sql)) {
    assert.ok(r.key.startsWith(`${row.id}:due:`), `${r.key} does not name the row and field it came from`);
    assert.ok(r.key.endsWith('d'), 'the key does not carry its offset');
  }
  sql.close();
});

test('a date moved away and back does not fire twice', async () => {
  // A `done` row keeps its key, which is `once_per: [entry, field]` as a unique index rather than a
  // rule somebody has to remember.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const key = pending(sql)[0]!.key;

  sql.exec("UPDATE schedule SET state = 'done' WHERE key = ?", key);
  value(k.update('obligations', 'obligations#1', { due: day(60) }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { due: day(30) }, { actor: 'p_1' }));

  const back = sql.all<{ state: string }>('SELECT state FROM schedule WHERE key = ?', key);
  assert.equal(back.length, 1, 'the key was written twice');
  assert.equal(back[0]?.state, 'done', 'a reminder that already fired was re-armed');
  sql.close();
});

/* ── one alarm ───────────────────────────────────────────────────────────── */

test('the record says when it next has something to do, which is one alarm per customer', async () => {
  // The alternative is a cron worker fanning out across every tenant, waking records that have
  // nothing to do in order to ask them.
  const { k, sql } = await record();
  /* NOTHING DECLARED IS ONE ALARM, THE SIGNS' NIGHT (`armSigns`): every record reads its vital signs at five past
     midnight, armed as it opens, so a record with nothing else to do still has that. The weekly analysis is the
     RECORD's row, armed when the record is created, because 09 §2 sources it from use rather than from anything being
     declared, and this helper never calls `createRecord`. */
  const armed = sql.all<{ kind: string; key: string; due_at: string }>("SELECT kind, key, due_at FROM schedule WHERE state = 'pending'");
  assert.deepEqual(armed.map((r) => [r.kind, r.key]), [['snapshot', 'signs']], 'a record with nothing to do armed more than its signs');
  assert.equal(k.pending().nextDueMs, Date.parse(armed[0]!.due_at));

  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const reminder = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'reminder' AND state = 'pending' ORDER BY due_at LIMIT 1");
  assert.equal(reminder?.due_at.slice(0, 10), day(23), 'the alarm is set for the wrong reminder');
  assert.equal(k.pending().nextDueMs, Math.min(Date.parse(armed[0]!.due_at), Date.parse(reminder.due_at)), 'the alarm is not the soonest row');

  assert.equal(k.due().filter((r) => r.kind === 'reminder').length, 0, 'a reminder in the future is due now');
  sql.close();
});

test('and hands over what is due when the time comes', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  value(k.create('obligations', { what: 'Invoice 41', due: day(10) }, { actor: 'p_1' }));

  clock.set(NOW + 4 * DAY);
  /* The reminders only: the signs' night is due every day as well (`armSigns`). */
  assert.equal(k.due().filter((r) => r.kind === 'reminder').length, 1, 'the -7d reminder for a date ten days out should be due on day three');
  const [first] = k.due().filter((r) => r.kind === 'reminder');
  const payload = JSON.parse(first!.payload) as { register: string; field: string; offset: string };
  assert.deepEqual(
    { register: payload.register, field: payload.field, offset: payload.offset },
    { register: 'obligations', field: 'due', offset: '-7d' },
    'the payload does not say what to remind somebody about',
  );

  clock.set(NOW + 11 * DAY);
  /* THE TWO REMINDERS, and only those. Eleven days out the weekly analysis is due as well — it is
     armed when a declaration lands, which is what makes the observe loop run — and counting it here
     would make this test about the alarm rather than about reminders. */
  assert.equal(k.due().filter((r) => r.kind === 'reminder').length, 2);
  sql.close();
});

test('A MONTH IS NOT THIRTY DAYS, and this file used to do both', async () => {
  /* `expandRepeat` steps months on the calendar and clamps — the 31st of a 30-day month is its 30th
     — while `remindersFor` multiplied by `30 * DAY_MS`. So `remind: ['-1m']` on 31 March fired on
     1 March instead of 28 February: three days early, on the one feature whose whole job is to be on
     the right day. Two answers for one word, in one file. */
  const march31 = Date.UTC(2026, 2, 31, 12);
  assert.equal(new Date(shiftFrom(march31, '-1m')!).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(new Date(shiftFrom(Date.UTC(2028, 2, 31, 12), '-1m')!).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(new Date(shiftFrom(Date.UTC(2026, 0, 31, 12), '+1m')!).toISOString().slice(0, 10), '2026-02-28');
});

test('and days and weeks are still exactly what they say', () => {
  const at = Date.UTC(2026, 2, 31, 12);
  assert.equal(shiftFrom(at, '-7d'), at - 7 * DAY);
  assert.equal(shiftFrom(at, '+2w'), at + 14 * DAY);
  assert.equal(shiftFrom(at, '0d'), at);
  assert.equal(shiftFrom(at, 'a week before'), null);
});

test('a month shift keeps the clock it was anchored at', () => {
  // A reminder on a dated field is noon UTC by `atMs`'s rule; one on an instant carries the time it
  // was set for, and a month's shift must not silently move it to midday.
  const at = Date.UTC(2026, 2, 31, 9, 30);
  assert.equal(new Date(shiftFrom(at, '-1m')!).toISOString(), '2026-02-28T09:30:00.000Z');
});

test('A DECLARED DIGEST IS ARMED WHEN IT IS DECLARED', async () => {
  /* `digest`, `snapshot` and `analyse` have complete handlers and nothing ever inserted a row of
     any of those kinds — an exhaustive search of every `INSERT INTO schedule` in the repository
     found six sites and none of them. So a declared Monday brief never sent, a metric's series never
     snapshotted, and the weekly analysis — the whole observe loop — never ran, with no error
     anywhere. A handler nothing schedules is a feature that exists in the code and not in the
     product. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(
    await k.install([
      { id: 'digest.monday', kind: 'digest', body: { digest: 'monday', to: 'p_1', channels: ['in-app'], schedule: { day: 'mon', at: '08:00' }, sections: [] } } as never,
    ]),
  );

  const armed = sql.one<{ kind: string; key: string; state: string }>("SELECT kind, key, state FROM schedule WHERE kind = 'digest'");
  assert.ok(armed, 'a declared digest was never armed, so it could never send');
  /* THE BARE ID IS THE KEY. `forgetPack` deletes by `substr(id, instr(id, '.') + 1)`, so a full
     `digest.monday` here would be a row an uninstall could never take with it. */
  assert.equal(armed.key, 'monday');
  assert.equal(armed.state, 'pending');

  /* AND NOT THE WEEKLY ANALYSIS, which is not a declaration's to earn. It is armed by
     `createRecord`, beside `purge/sweep` — a record whose registers arrived by `import` or
     `restore` never calls `install`, and would otherwise never be observed at all. */
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'analyse'").length, 0, 'an install armed the observe loop');
  sql.close();
});

test('A ROW THAT ALREADY FIRED IS RE-ARMED, or it can never fire again', async () => {
  /* `drainSchedule` claims `pending` only. So with `ON CONFLICT DO NOTHING`, a digest row that went
     `done` once — because its declaration was momentarily absent, which is exactly what happens
     when an uninstall and a re-install cross — could never be armed again by any number of
     re-installs. It would simply never send, for ever, with nothing anywhere saying so. 45 §5.9:
     `DO UPDATE`, "the one path 09 §1 demands". */
  const { k, sql } = await record();
  const DIGEST = {
    id: 'digest.monday',
    kind: 'digest',
    body: { digest: 'monday', to: 'p_1', channels: ['in-app'], schedule: { day: 'mon', at: '08:00' }, sections: [] },
  } as never;
  value(await k.install([DIGEST]));

  sql.exec("UPDATE schedule SET state = 'done' WHERE kind = 'digest'");
  value(await k.install([DIGEST]));
  assert.equal(
    sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'digest'")?.state,
    'pending',
    'a digest that fired once could never be armed again',
  );

  /* AND A `failed` ROW TOO, which is where the eighth attempt of anything ends up. */
  sql.exec("UPDATE schedule SET state = 'failed', attempts = 8 WHERE kind = 'digest'");
  value(await k.install([DIGEST]));
  const after = sql.one<{ state: string; attempts: number }>("SELECT state, attempts FROM schedule WHERE kind = 'digest'")!;
  assert.equal(after.state, 'pending');
  assert.equal(after.attempts, 0, 'a re-armed row is still eight rungs up its own ladder');
  sql.close();
});

test('AND A REFUSED INSTALL ARMS NOTHING, on the pack path too', async () => {
  /* THE PACK PATH STAGES AND APPLIES IN A TRANSACTION OF ITS OWN, and armed the rows whether or not
     it landed — so a refused install handed the caller a refusal and left the schedule holding a
     `digest` row for a declaration that does not exist. It fires once, finds nothing, and goes
     `done`, at which point no re-install could ever bring it back.

     A UNIQUE CONSTRAINT THE EXISTING ROWS ALREADY BREAK is the refusal that happens at APPLY rather
     than at stage, which is the one this branch is about: everything about the declaration is fine
     and the record it lands in is not. */
  const { k, sql } = await record();
  value(k.create('services', { name: 'a', renews: day(30) }, { actor: 'p_1' }));
  value(k.create('services', { name: 'a', renews: day(60) }, { actor: 'p_1' }));

  const staged = await k.stageInstall([
    { id: 'digest.monday', kind: 'digest', body: { digest: 'monday', to: 'p_1', channels: ['in-app'], schedule: { day: 'mon', at: '08:00' }, sections: [] } },
    {
      id: 'register.services',
      kind: 'register',
      body: {
        id: 'services',
        name: 'Services',
        title: 'name',
        fields: [
          { id: 'name', type: 'text', required: true, unique: true },
          { id: 'renews', type: 'day', remind: ['-3d'], repeat: { freq: 'month' } },
        ],
      },
    },
  ] as never);
  assert.ok(staged.ok, 'the batch never reached the apply, so this test proves nothing');

  const applied = staged.value() as { ok: boolean };
  assert.equal(applied.ok, false, 'two rows sharing a value accepted a unique constraint');
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'digest'").length, 0, 'a refused install armed a digest');
  sql.close();
});

test('and re-installing does not reset a schedule somebody is waiting on', async () => {
  // `ON CONFLICT (kind, key) DO NOTHING`. A pack upgrade that moved everybody's Monday brief to
  // next Monday would be a product that loses a week every time it is updated.
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const decl = { id: 'digest.monday', kind: 'digest', body: { digest: 'monday', to: 'p_1', channels: ['in-app'], schedule: { day: 'mon', at: '08:00' }, sections: [] } };
  value(await k.install([decl as never]));
  const first = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'digest'")?.due_at;

  clock.set(NOW + 3 * 86_400_000);
  value(await k.install([{ ...decl, body: { ...decl.body, sections: [] } } as never]));
  assert.equal(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'digest'")?.due_at, first);
  sql.close();
});

test('EVERY SPELLING THE DOCUMENTS USE COMPUTED AS YEARLY, and one of them is the worked example in 02 §4', () => {
  /**
   * `42 §4.4` closes `repeat.freq` at `daily weekly monthly yearly` and `02 §4`'s worked example
   * is `repeat: { freq: weekly, byday: [TU, TH], count: 12 }`. `Repeat` spelled the four
   * `day week month year` and `expandRepeat`'s if-chain ended in an `else` meaning yearly, so
   * every documented spelling and every typo alike fell into it. Measured from 2026-09-08:
   *
   *     freq: week    ->  2026-09-08, 09-15, 09-22, 09-29
   *     freq: weekly  ->  2026-09-08, 2027-09-08
   *     freq: banana  ->  2026-09-08, 2027-09-08
   *
   * A weekly standup written the way the specification writes it reminded nobody for fifty-one
   * weeks, and nothing anywhere refused it or logged it.
   */
  const anchor = Date.parse('2026-09-08T12:00:00Z');
  const days = (freq: string) =>
    expandRepeat(anchor, { freq } as never, anchor, 400)
      .slice(0, 4)
      .map((t) => new Date(t).toISOString().slice(0, 10));

  /* THE LONG SPELLING AND THE SHORT ONE ARE THE SAME ANSWER. Both are kept because a record may
     already hold either, and turning a working reminder into a refused declaration on somebody's
     next install is not a fix. */
  const PAIRS: readonly (readonly [string, string])[] = [
    ['daily', 'day'],
    ['weekly', 'week'],
    ['monthly', 'month'],
    ['yearly', 'year'],
  ];
  for (const [long, short] of PAIRS)
    assert.deepEqual(days(long), days(short), `${long} and ${short} are the same frequency and gave different dates`);

  assert.deepEqual(days('weekly'), ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
  assert.deepEqual(days('daily'), ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  assert.deepEqual(days('monthly'), ['2026-09-08', '2026-10-08', '2026-11-08', '2026-12-08']);
  assert.deepEqual(days('yearly'), ['2026-09-08', '2027-09-08']);

  /* AND A WORD THAT IS NOT A FREQUENCY DERIVES NOTHING, rather than the nearest arm. `declare`
     refuses it at install; this is what the same fact looks like to a caller holding a record
     that was installed before it did. */
  assert.deepEqual(days('banana'), [], 'an unknown frequency still armed something');
  assert.deepEqual(days(''), []);

  /* THE SKIP AGREES WITH THE WALK. `skipPast` had its own copy of the chain, so a disagreement
     would have put the first occurrence in the wrong place rather than nowhere at all, which is
     the harder failure to see. Anchored a year back, the first occurrence is not behind us. */
  const old = Date.parse('2025-09-08T12:00:00Z');
  const first = expandRepeat(old, { freq: 'weekly' } as never, anchor, 400)[0];
  assert.ok(first !== undefined && first >= anchor - 7 * 86_400_000, 'the skip and the walk disagree');
});

test('and `offsetMs` stops answering for a month, which its own comment already forbade', () => {
  /* It says DAYS AND WEEKS ONLY and admitted `m`, answering `n * 30 * DAY_MS`: a thirty-day month,
     in the same file whose `shiftFrom` clamps a month to the calendar. `shiftFrom` routes `m` past
     it so nothing in the tree got the wrong answer, but it is exported from the kernel's public
     API and the next caller would have. */
  assert.equal(offsetMs('-30m'), null);
  assert.equal(offsetMs('+2m'), null);
  assert.equal(offsetMs('-7d'), -7 * 86_400_000);
  assert.equal(offsetMs('+2w'), 14 * 86_400_000);
  /* AND `shiftFrom` STILL READS A MONTH, by the calendar, which is the whole reason for the split. */
  assert.equal(shiftFrom(Date.parse('2026-03-31T12:00:00Z'), '-1m'), Date.parse('2026-02-28T12:00:00Z'));
});

