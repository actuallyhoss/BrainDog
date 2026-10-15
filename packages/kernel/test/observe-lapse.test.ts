/**
 * An offer he let lapse is a no on the brake (ENG-B17 job 2): `slashBrake` counts it in the window, ordered by when it
 * lapsed, and `mayPropose` says so in its sentence.
 *
 * HOW A LAPSE IS CLOSED TODAY. The design agent's `queueOf` only computes `lapsed` (an open offer whose `lapses` day is
 * behind today); nothing in the record closes it. govern.ts `sweepLapsed` closes one as `withdrawn` with `lapsedNote`,
 * signed by its opener, after its day, and `makeRoom` closes a displaced one as `withdrawn` with `DISPLACED_NOTE` before
 * it. Slash's own offers are not swept yet (`slashMayWrite` refuses Slash a `resolve`, and the sweep is not in the
 * nightly pass), so most lapses sit open past their day. Both forms count; a displaced, moot or asked-again offer and
 * one withdrawn before its day stay out, as before.
 *
 * Over a real record's tables, with the events and questions written straight into them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mayPropose, slashBrake } from '../src/observe.ts';
import { DISPLACED_NOTE, lapsedNote } from '../src/govern.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (ms: number): string => new Date(ms).toISOString();
const day = (ms: number): string => at(ms).slice(0, 10);
const OWNER = `p_${PEOPLE[0]!.handle}`;

let n = 0;
const id = (): string => `L${String(++n).padStart(6, '0')}`;

/** A migrated record its owner used on enough days, a month back, that the floor is behind it. */
async function record(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW - 400 * DAY));
  for (const d of [30, 25, 20, 15, 10, 3, 1])
    sql.exec("INSERT INTO event (id, ts, actor, kind, note) VALUES (?, ?, ?, 'note', 'used')", id(), at(NOW - d * DAY), OWNER);
  return sql;
}

/** One of Slash's offers, answered at `ms`: `yes` taken up, `no` turned down. */
function answer(sql: NodeSql, ms: number, took: boolean): void {
  const q = id();
  const as = took ? 'addressed' : 'wont-fix';
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, 'arrange', '{}', 'resolved', 'slash', ?, ?)",
    q, at(ms - DAY), as,
  );
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'resolve', ?, 'suggestion', ?)", id(), at(ms), OWNER, `suggestion:${q}`, as);
}

/** An offer whose day was `lapses`, closed `withdrawn` at `ms` with `note`, as govern.ts's sweep or `makeRoom` writes it. */
function withdrawn(sql: NodeSql, lapses: string, ms: number, note: string): void {
  const q = id();
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, 'arrange', ?, 'resolved', 'slash', ?, 'withdrawn')",
    q, JSON.stringify({ lapses }), at(ms - 10 * DAY),
  );
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'slash', 'resolve', ?, 'suggestion', 'withdrawn', ?)", id(), at(ms), `suggestion:${q}`, note);
}

/** An offer still open, its day `lapses`, put off until `defer` where given. */
function waiting(sql: NodeSql, lapses: string, defer?: number): void {
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, defer_until) VALUES (?, 'arrange', ?, 'open', 'slash', ?, ?)",
    id(), JSON.stringify({ lapses }), at(NOW - 20 * DAY), defer === undefined ? null : at(defer),
  );
}

test('TWENTY ANSWERED, NINE LAPSED AND TWO TAKEN: braked, and the sentence counts the ones he let pass', async () => {
  const sql = await record();
  const start = NOW - 25 * DAY;
  /* nine declined, two taken, then nine he let pass: four swept after their day, five still open past it. */
  for (let i = 0; i < 9; i++) answer(sql, start + i * HOUR, false);
  answer(sql, start + 10 * HOUR, true);
  answer(sql, start + 11 * HOUR, true);
  for (let i = 0; i < 4; i++) {
    const lapses = day(start + (2 + i) * DAY);
    withdrawn(sql, lapses, start + (3 + i) * DAY + HOUR, lapsedNote(day(start + (3 + i) * DAY)));
  }
  for (let i = 0; i < 5; i++) waiting(sql, day(NOW - (5 - i) * DAY));
  assert.deepEqual(slashBrake(sql, NOW), { on: true, share: 0.1, of: 20, lapsed: 9 });
  assert.deepEqual(mayPropose(sql, NOW), {
    may: false,
    why: 'Slash stopped offering: you took up 2 of its last 20, counting the ones you let pass.',
    share: 0.1,
    of: 20,
  });
  assert.deepEqual(slashBrake(sql), { on: false, share: 2 / 15, of: 15, lapsed: 4 }, 'without a today only the swept ones count');
});

test('A LAPSE INSIDE THE WINDOW MOVES THE SHARE, and it is ordered by when it lapsed', async () => {
  const sql = await record();
  const start = NOW - 25 * DAY;
  for (let i = 0; i < 14; i++) answer(sql, start + i * HOUR, true);
  for (let i = 0; i < 6; i++) answer(sql, start + (14 + i) * HOUR, false);
  assert.deepEqual(slashBrake(sql, NOW), { on: false, share: 0.7, of: 20 });
  /* one he let pass after them: the oldest yes leaves the window and a no comes in. */
  waiting(sql, day(NOW - 3 * DAY));
  assert.deepEqual(slashBrake(sql, NOW), { on: false, share: 0.65, of: 20, lapsed: 1 });
  /* and two more swept: 0.55, under the stop. */
  withdrawn(sql, day(NOW - 2 * DAY), NOW - DAY, lapsedNote(day(NOW - DAY)));
  withdrawn(sql, day(NOW - 2 * DAY), NOW - DAY + HOUR, lapsedNote(day(NOW - DAY)));
  assert.deepEqual(slashBrake(sql, NOW), { on: true, share: 0.55, of: 20, lapsed: 3 });
});

test('A LAPSE BEFORE THE ANSWERS IT PRECEDES IS OLDER THAN THEM: the window is by when it lapsed, not when it was filed', async () => {
  const sql = await record();
  /* lapsed a fortnight ago, then twenty taken up since: it has left the window. */
  waiting(sql, day(NOW - 16 * DAY));
  for (let i = 0; i < 20; i++) answer(sql, NOW - 14 * DAY + i * HOUR, true);
  assert.deepEqual(slashBrake(sql, NOW), { on: false, share: 1, of: 20 });
});

test('WITHDRAWN BEFORE ITS DAY, DISPLACED, PUT OFF OR STILL DUE: none is a no', async () => {
  const sql = await record();
  for (let i = 0; i < 12; i++) answer(sql, NOW - 10 * DAY + i * HOUR, true);
  for (let i = 0; i < 8; i++) answer(sql, NOW - 9 * DAY + i * HOUR, false);
  const before = slashBrake(sql, NOW);
  assert.deepEqual(before, { on: false, share: 0.6, of: 20 });
  withdrawn(sql, day(NOW + 5 * DAY), NOW - 2 * DAY, DISPLACED_NOTE);
  withdrawn(sql, day(NOW + 5 * DAY), NOW - DAY, 'Taken back by the agent that asked it.');
  waiting(sql, day(NOW - 2 * DAY), NOW + 3 * DAY);
  waiting(sql, day(NOW));
  waiting(sql, day(NOW + 4 * DAY));
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, 'arrange', ?, 'resolved', 'slash', ?, 'moot')",
    id(), JSON.stringify({ lapses: day(NOW - 3 * DAY) }), at(NOW - 9 * DAY),
  );
  assert.deepEqual(slashBrake(sql, NOW), before);
  assert.deepEqual(mayPropose(sql, NOW), { may: true });
});

test('A BODY THAT IS NOT JSON IS NO LAPSE AND NO ERROR', async () => {
  const sql = await record();
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'arrange', 'not json', 'open', 'slash', ?)",
    id(), at(NOW - 3 * DAY),
  );
  assert.deepEqual(slashBrake(sql, NOW), { on: false, share: 0, of: 0 });
});

test("TODAY IS THE RECORD'S OWN: an offer whose day is today in UTC has lapsed where tomorrow has begun", async () => {
  const sql = await record();
  waiting(sql, day(NOW));
  assert.deepEqual(slashBrake(sql, NOW, 'UTC'), { on: false, share: 0, of: 0 });
  assert.deepEqual(slashBrake(sql, NOW, 'Pacific/Auckland'), { on: false, share: 0, of: 1, lapsed: 1 });
});
