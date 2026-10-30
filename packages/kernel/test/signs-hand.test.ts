/**
 * An operator's hand on the record (scope 2.7): `markHand` keeps one row a day under sign `hand`, apart from
 * the signs' own rows, so the night that rewrites those cannot lose it. Each kind of mark (a requeue by a person, a
 * restore, a replacing import) ends the hold on its day; nothing files a `hand` reading; `readSigns` never draws it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HAND_SIGN, HOLD_SIGNS, holdDays, markHand } from '../src/hold.ts';
import { openRecord } from '../src/index.ts';
import { dayBefore, fileSignReading, readSigns, ruleOf, runSignsNight, signOf } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const TZ = 'Africa/Cairo';
/* Noon in Cairo on 9 October. */
const NOW = Date.UTC(2026, 9, 9, 9);
const TODAY = '2026-10-09';
const DAY = 86_400_000;

function put(sql: NodeSql, sign: string, day: string): void {
  const s = signOf(sign);
  sql.exec(
    `INSERT OR REPLACE INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, 'green', NULL, 'Read.', '[]', ?, 'kernel', ?)`,
    sign,
    day,
    s === null ? 'arrived-1' : ruleOf(s),
    `${day}T22:05:00.000Z`,
  );
}

async function sevenGreen(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  for (let i = 1; i <= 7; i++) for (const s of HOLD_SIGNS) put(sql, s, dayBefore(TODAY, i));
  return sql;
}

const MARKS = [
  ['A person ran a stopped job again.', 'a member'],
  ['The record was put back to an earlier copy.', 'the owner'],
  ['An import replaced what the record held.', 'the owner'],
] as const;

test('EACH MARK ENDS THE RUN on its day: a requeue by a person, a restore, a replacing import', async () => {
  for (const [what, by] of MARKS) {
    const sql = await sevenGreen();
    assert.equal(holdDays(sql, TODAY).days, 7);
    /* Marked three days ago, at noon Cairo: the two days after it still count. */
    const marked = markHand(sql, what, by, NOW - 3 * DAY, TZ);
    assert.deepEqual(marked, { day: dayBefore(TODAY, 3), marks: 1 });
    const h = holdDays(sql, TODAY);
    assert.equal(h.days, 2, `${what} did not end the run`);
    assert.equal(h.ended, 'hand');
    assert.equal(h.on, dayBefore(TODAY, 3));
    assert.match(h.said, /^2 days in a row with every watched sign green\. An operator's hand touched this BrainDog on 6 October\.$/);
  }
});

test('A MARK TODAY leaves yesterday counted, and ends tomorrow’s run at today', async () => {
  const sql = await sevenGreen();
  markHand(sql, MARKS[0][0], MARKS[0][1], NOW, TZ);
  assert.equal(holdDays(sql, TODAY).days, 7);
  for (const s of HOLD_SIGNS) put(sql, s, TODAY);
  assert.deepEqual([holdDays(sql, '2026-10-10').days, holdDays(sql, '2026-10-10').ended], [0, 'hand']);
});

test('ONE ROW A DAY: later marks add to its count and its lines, the first words stand, and who did it is kept', async () => {
  const sql = await sevenGreen();
  for (let i = 0; i < 8; i++) markHand(sql, `Mark ${i + 1}.`, i === 0 ? 'a member' : 'another member', NOW + i * 60_000, TZ);
  const rows = sql.all<{ state: string; value: number; said: string; facts: string; hand: string }>(
    'SELECT state, value, said, facts, hand FROM sign_reading WHERE sign = ?',
    HAND_SIGN,
  );
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.deepEqual([r!.state, Number(r!.value), r!.said, r!.hand], ['none', 8, 'Mark 1.', 'a member']);
  assert.deepEqual(JSON.parse(r!.facts), ['Mark 1.', 'Mark 2.', 'Mark 3.', 'Mark 4.', 'Mark 5.', 'Mark 6.']);
  assert.equal(markHand(sql, '  ', ' ', NOW, TZ).marks, 9);
});

test('THE MARK IS ITS OWN ROW: nothing files it, readSigns never draws it, and the night neither rewrites nor drops it', async () => {
  const sql = await sevenGreen();
  markHand(sql, MARKS[1][0], MARKS[1][1], NOW - DAY, TZ);
  const filed = fileSignReading(sql, HAND_SIGN, { state: 'red', value: null, said: 'Touched.' }, NOW, TZ);
  assert.equal(filed.ok, false);
  assert.ok(readSigns(sql, NOW, TZ).every((s) => s.sign !== HAND_SIGN));
  /* The night of the 9th to the 10th writes the 9th; the 8th's mark stands as it was. */
  runSignsNight(sql, NOW + DAY, TZ);
  const kept = sql.one<{ said: string; hand: string }>('SELECT said, hand FROM sign_reading WHERE sign = ? AND day = ?', HAND_SIGN, dayBefore(TODAY));
  assert.deepEqual({ ...kept }, { said: MARKS[1][0], hand: MARKS[1][1] });
  assert.equal(holdDays(sql, TODAY).ended, 'hand');
});
