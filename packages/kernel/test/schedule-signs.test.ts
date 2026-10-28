/**
 * The vital signs' night, wired into the record: armed as the record opens, run at five past midnight
 * by the `snapshot` handler, armed again whatever happened, and the two verbs the record and the host call.
 *
 * What is asserted is what the owner's record does with nobody's hand: it opens, and the next morning there is a row a
 * sign for the night that ended, with no call made. The readers themselves are `signs.ts`'s and tested there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIGNS_KEY, nextSignsDue } from '../src/signs.ts';
import { VITAL_SIGNS, openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/** Midday in Cairo on 8 October, so the first night is the coming one. */
const NOW = Date.UTC(2026, 9, 8, 10);
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const signsRows = (sql: NodeSql) =>
  sql.all<{ due_at: string; payload: string; state: string }>("SELECT due_at, payload, state FROM schedule WHERE kind = 'snapshot' AND key = ?", SIGNS_KEY);

async function cairo() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  /* The record's own row, as `createRecord` writes it, in the owner's zone. */
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'r_1', 'home', 'Home', 'en', 'Africa/Cairo', 1, ?)",
    iso(NOW),
  );
  return { k, sql, clock };
}

test('ARMED AS THE RECORD OPENS, ONCE: one row keyed signs at five past midnight, and opening again moves nothing', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await openRecord(sql, clock);
  const armed = signsRows(sql);
  assert.equal(armed.length, 1);
  assert.deepEqual(JSON.parse(armed[0]!.payload), { signs: true });
  assert.equal(armed[0]!.due_at, iso(nextSignsDue(NOW, 'UTC')));
  clock.advance(3_600_000);
  await openRecord(sql, clock);
  assert.deepEqual(signsRows(sql), armed, 'opening the record again moved the night');
  sql.close();
});

test('THE NEXT MORNING THERE IS A ROW A SIGN for the night that ended, with no call made, and the night is armed again', async () => {
  const { k, sql, clock } = await cairo();
  /* Armed again on the record's own zone, as the record opens with it. */
  sql.exec("DELETE FROM schedule WHERE kind = 'snapshot' AND key = ?", SIGNS_KEY);
  const reopened = await openRecord(sql, clock);
  const due = Date.parse(signsRows(sql)[0]!.due_at);
  assert.equal(due, nextSignsDue(NOW, 'Africa/Cairo'));

  for (let night = 0; night < 3; night++) {
    clock.set(Date.parse(signsRows(sql)[0]!.due_at) + 60_000);
    await reopened.drain();
    const day = sql.all<{ day: string }>('SELECT DISTINCT day FROM sign_reading ORDER BY day').map((r) => r.day);
    assert.equal(day.length, night + 1, `night ${String(night + 1)} wrote no rows`);
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM sign_reading WHERE day = ?', day.at(-1)!)!.n, VITAL_SIGNS.length);
    const [row] = signsRows(sql);
    assert.equal(row!.state, 'pending', 'the night was not armed again');
    assert.ok(Date.parse(row!.due_at) > clock.now() && Date.parse(row!.due_at) <= clock.now() + DAY);
  }
  void k;
  sql.close();
});

test('THE TWO VERBS: signs() reads every sign now, signRead files one the record or host owns and refuses any other', async () => {
  const { k, sql } = await cairo();
  const read = k.signs();
  assert.ok(read.ok);
  assert.deepEqual(read.value.signs.map((s) => s.sign), VITAL_SIGNS.map((s) => s.sign));
  for (const s of read.value.signs) assert.equal(s.days.length, 14);

  const filed = VITAL_SIGNS.find((s) => s.read === null)!;
  const out = k.signRead(filed.sign, { state: 'green', value: 1, said: 'The model answered.' });
  assert.ok(out.ok, JSON.stringify(out));
  const after = k.signs();
  assert.ok(after.ok);
  assert.equal(after.value.signs.find((s) => s.sign === filed.sign)?.state, 'green');
  assert.equal(k.signRead('no-such-sign', { state: 'green', value: 1, said: 'x' }).ok, false);
  sql.close();
});
