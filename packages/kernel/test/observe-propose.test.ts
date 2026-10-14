/**
 * One governor for every question Slash would file (ENG-B17 job 1): `mayPropose` holds the floor of a person's own use,
 * the brake over his last twenty answers, and one arrangement offer a week, and says why in one sentence.
 *
 * Over a real record's tables, with the events and questions written straight into them, so the counts read are the
 * kernel's own columns and nothing here is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brakeOf, mayPropose, slashBrake } from '../src/observe.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const at = (ms: number): string => new Date(ms).toISOString();
/** The owner's handle as an actor: a person, so `p_`. */
const OWNER = `p_${PEOPLE[0]!.handle}`;

let n = 0;
const id = (): string => `T${String(++n).padStart(6, '0')}`;

/** A migrated record whose owner used it on each of `days` (days before now), and an agent wrote on every day of a year. */
async function record(days: readonly number[]): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW - 400 * DAY));
  const ev = (ts: number, actor: string): void =>
    sql.exec("INSERT INTO event (id, ts, actor, kind, note) VALUES (?, ?, ?, 'note', 'used')", id(), at(ts), actor);
  for (let d = 365; d > 0; d--) ev(NOW - d * DAY, 'agent:import');
  for (const d of days) ev(NOW - d * DAY, OWNER);
  return sql;
}

/** Slash's questions, answered oldest first: `true` taken up, `false` turned down, each with its resolve event. */
function answered(sql: NodeSql, answers: readonly boolean[], kind = 'options'): void {
  answers.forEach((took, i) => {
    const q = id();
    const ts = at(NOW - (answers.length - i) * 3_600_000);
    sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, ?, '{}', 'resolved', 'slash', ?, ?)",
      q, kind, ts, took ? 'addressed' : 'wont-fix',
    );
    sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'resolve', ?, 'suggestion', ?)", id(), ts, OWNER, `suggestion:${q}`, took ? 'addressed' : 'wont-fix');
  });
}

const seq = (yes: number, no: number): boolean[] => [...Array<boolean>(yes).fill(true), ...Array<boolean>(no).fill(false)];
const USED = [20, 18, 15, 10, 3, 1];

test('11 OF THE LAST 20 TAKEN UP IS BRAKED, and the sentence says how many he turned down', async () => {
  const sql = await record(USED);
  answered(sql, seq(11, 9));
  const out = mayPropose(sql, NOW);
  assert.equal(out.may, false);
  assert.ok(!out.may);
  assert.equal(out.why, 'You turned down 9 of the last 20, so Slash waits.');
  assert.equal(out.share, 0.55);
  assert.equal(out.of, 20);
  assert.deepEqual(slashBrake(sql), { on: true, share: 0.55, of: 20 });
});

test('14 OF THE LAST 20 GOES AGAIN after a brake, and 13 of 20 does not yet: off only at 0.7', async () => {
  const sql = await record(USED);
  /* After the brake, nine more taken up: the last twenty are 2 yes, 9 no, 9 yes, 11 of 20, so it still waits. */
  answered(sql, [...seq(11, 9), ...seq(9, 0)]);
  assert.equal(mayPropose(sql, NOW).may, false);
  const again = await record(USED);
  answered(again, [...seq(11, 9), ...seq(14, 6)]);
  assert.deepEqual(mayPropose(again, NOW), { may: true });
});

test('THE BRAKE HOLDS BETWEEN THE TWO THRESHOLDS: 13 of 20 after a fall is braked, after a climb is free', () => {
  assert.deepEqual(brakeOf(seq(11, 9)), { on: true, share: 0.55, of: 20 });
  assert.equal(brakeOf([...seq(11, 9), ...seq(13, 7)]).on, true, '0.65 after a brake stays braked');
  assert.equal(brakeOf(seq(13, 7)).on, false, '0.65 never braked is free');
  assert.equal(brakeOf([...seq(11, 9), ...seq(14, 6)]).on, false, '0.7 lifts it');
  assert.deepEqual(brakeOf(seq(2, 17)), { on: false, share: 2 / 19, of: 19 }, 'under twenty answers it never brakes');
  assert.deepEqual(brakeOf([]), { on: false, share: 0, of: 0 });
});

test('THE FLOOR HOLDS A TWO-DAY RECORD, whatever a year of an agent writing in it says', async () => {
  const sql = await record([1, 0]);
  const out = mayPropose(sql, NOW);
  assert.ok(!out.may);
  assert.equal(out.why, 'Slash waits until you have used BrainDog for two weeks, and you began 1 day ago.');
  const none = await record([]);
  const quiet = mayPropose(none, NOW);
  assert.ok(!quiet.may);
  assert.equal(quiet.why, 'Slash waits until you have used BrainDog for two weeks, and you have not used it yet.');
});

test('TWO WEEKS ON THREE DAYS IS STILL THE FLOOR: five days of use, counted', async () => {
  const sql = await record([20, 10, 2]);
  const out = mayPropose(sql, NOW);
  assert.ok(!out.may);
  assert.equal(out.why, 'Slash waits until you have used BrainDog on five days, and you have used it on 3 days.');
  assert.deepEqual(mayPropose(await record([20, 10, 5, 3, 2]), NOW), { may: true });
});

test('ONE ARRANGEMENT OFFER A WEEK: a second is held, a plain question is not', async () => {
  const sql = await record(USED);
  assert.deepEqual(mayPropose(sql, NOW, { arrangement: true }), { may: true });
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'arrange', '{}', 'open', 'slash', ?)", id(), at(NOW - 3 * DAY));
  const out = mayPropose(sql, NOW, { arrangement: true });
  assert.ok(!out.may);
  assert.equal(out.why, 'Slash offered a new arrangement this week, and it offers one a week.');
  assert.deepEqual(mayPropose(sql, NOW), { may: true });
  assert.deepEqual(mayPropose(sql, NOW + 5 * DAY, { arrangement: true }), { may: true }, 'eight days on, it may again');
});

test('ONLY HIS ANSWERS COUNT: a question withdrawn or moot is in no window', async () => {
  const sql = await record(USED);
  answered(sql, seq(14, 6));
  for (const as of ['withdrawn', 'moot', 'asked-again'])
    for (let i = 0; i < 10; i++)
      sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, 'options', '{}', 'resolved', 'slash', ?, ?)", id(), at(NOW), as);
  assert.deepEqual(slashBrake(sql), { on: false, share: 0.7, of: 20 });
});
