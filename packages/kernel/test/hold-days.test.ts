/**
 * The seven-day hold (PRF-A18, scope 2.7): days in a row to yesterday on which every hold sign read green. Seven green
 * days read 7; a red, a `none` or a missing reading ends the run; a changed threshold ends it at the change; today is
 * never counted; the automation signs never touch it; and the hold's names are the closed list's names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HOLD_NAMES, HOLD_SIGNS, holdDays } from '../src/hold.ts';
import { openRecord } from '../src/index.ts';
import { dayBefore, ruleOf, signOf, VITAL_SIGNS } from '../src/signs.ts';
import { SIGNS_FLOW } from '../src/signs-flow.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const TODAY = '2026-10-09';

/** The rule a sign's row is stamped with: the closed list's, or a fixed one for a sign not on it yet. */
const ruleFor = (sign: string): string => {
  const s = signOf(sign);
  return s === null ? 'arrived-1' : ruleOf(s);
};

/** One row for one sign on one day. */
function put(sql: NodeSql, sign: string, day: string, state: string, rule = ruleFor(sign)): void {
  sql.exec(
    `INSERT OR REPLACE INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, ?, NULL, 'Read.', '[]', ?, 'kernel', ?)`,
    sign,
    day,
    state,
    rule,
    `${day}T22:05:00.000Z`,
  );
}

/** Every hold sign green on each of the `n` days before today. */
function greenDays(sql: NodeSql, n: number, from = TODAY): void {
  for (let i = 1; i <= n; i++) for (const s of HOLD_SIGNS) put(sql, s, dayBefore(from, i), 'green');
}

async function fresh(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(Date.UTC(2026, 9, 9, 12)));
  return sql;
}

test('SEVEN GREEN DAYS READ 7, and the run ends where the kept days start', async () => {
  const sql = await fresh();
  greenDays(sql, 7);
  const h = holdDays(sql, TODAY);
  assert.equal(h.days, 7);
  assert.equal(h.ended, 'start');
  assert.equal(h.on, '2026-10-01');
  assert.match(h.said, /^7 days in a row with every watched sign green\. The record kept no readings before 2 October\.$/);
});

test('AN EMPTY RECORD holds nothing, and says no day has been read', async () => {
  const h = holdDays(await fresh(), TODAY);
  assert.deepEqual([h.days, h.ended, h.sign], [0, 'start', null]);
  assert.match(h.said, /No day has been read yet\./);
});

test('A RED, A NONE AND A MISSING READING each end the run on their day, naming the sign by name', async () => {
  for (const [state, ended] of [['red', 'red'], ['none', 'none'], [null, 'missing']] as const) {
    const sql = await fresh();
    greenDays(sql, 9);
    const day = dayBefore(TODAY, 4);
    if (state === null) sql.exec("DELETE FROM sign_reading WHERE sign = 'model-answers' AND day = ?", day);
    else put(sql, 'model-answers', day, state);
    const h = holdDays(sql, TODAY);
    assert.equal(h.days, 3, `${ended} did not end the run`);
    assert.equal(h.ended, ended);
    assert.equal(h.on, day);
    assert.equal(h.sign, 'model-answers');
    assert.ok(h.said.includes('“The model answers”'), h.said);
    assert.ok(!h.said.includes('model-answers'), 'an id reached the sentence');
    assert.ok(!h.said.includes('—'), 'an em dash reached the sentence');
  }
});

test('A RED YESTERDAY holds 0', async () => {
  const sql = await fresh();
  greenDays(sql, 9);
  put(sql, 'arrived', dayBefore(TODAY), 'red');
  assert.deepEqual([holdDays(sql, TODAY).days, holdDays(sql, TODAY).ended], [0, 'red']);
});

test('A CHANGED THRESHOLD ends the run at the change: the days judged by the old rule do not count', async () => {
  const sql = await fresh();
  greenDays(sql, 7);
  for (let i = 5; i <= 7; i++) put(sql, 'oldest-question', dayBefore(TODAY, i), 'green', 'an-older-rule');
  const h = holdDays(sql, TODAY);
  assert.equal(h.days, 4);
  assert.equal(h.ended, 'rule');
  assert.equal(h.sign, 'oldest-question');
  assert.equal(h.on, dayBefore(TODAY, 5));
  assert.match(h.said, /The rule behind “No question waits too long” changed after 4 October\./);
});

test('TODAY IS NEVER COUNTED, and a day with every sign green but one missing is not green', async () => {
  const sql = await fresh();
  greenDays(sql, 3);
  for (const s of HOLD_SIGNS) put(sql, s, TODAY, 'green');
  assert.equal(holdDays(sql, TODAY).days, 3);
  sql.exec("DELETE FROM sign_reading WHERE sign = 'arrived' AND day = ?", dayBefore(TODAY, 2));
  assert.deepEqual([holdDays(sql, TODAY).days, holdDays(sql, TODAY).ended], [1, 'missing']);
});

test('A NIGHT THE HOST NEVER READ ends the run as missing, blaming no one sign', async () => {
  const sql = await fresh();
  greenDays(sql, 9);
  sql.exec('DELETE FROM sign_reading WHERE day = ?', dayBefore(TODAY, 3));
  const h = holdDays(sql, TODAY);
  assert.deepEqual([h.days, h.ended, h.sign, h.on], [2, 'missing', null, dayBefore(TODAY, 3)]);
  assert.match(h.said, /^2 days in a row with every watched sign green\. No sign was read on 6 October\.$/);
});

test('THE AUTOMATION SIGNS never touch the hold: red on every one of them, seven days still read 7', async () => {
  const sql = await fresh();
  greenDays(sql, 7);
  for (let i = 1; i <= 7; i++) for (const s of SIGNS_FLOW) put(sql, s.sign, dayBefore(TODAY, i), 'red');
  assert.equal(holdDays(sql, TODAY).days, 7);
});

test('THE HOLD SIGNS are the nine of 2.2 and arrived, never an automation sign, named as the closed list names them', () => {
  assert.equal(HOLD_SIGNS.length, 10);
  const flow = new Set(SIGNS_FLOW.map((s) => s.sign));
  for (const id of HOLD_SIGNS) {
    assert.ok(!flow.has(id), `${id} is an automation sign`);
    const s = signOf(id);
    if (s !== null) assert.equal(HOLD_NAMES[id], s.name, `the hold names ${id} apart from the closed list`);
  }
  /* The nine of 2.2 are on the list today; `arrived` joins it with signs-47. */
  assert.equal(HOLD_SIGNS.filter((id) => id !== 'arrived').every((id) => VITAL_SIGNS.some((s) => s.sign === id)), true);
});
