/**
 * A filed sign whose `read_at` cannot be read stops standing. `nowMs - Date.parse(read_at) >
 * FILED_STANDS_MS` was false for NaN, so a malformed time kept its filing green forever; it now reads `none`, says so
 * in words, and never throws while saying when it was last read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { FILED_STANDS_MS, readSigns } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const TZ = 'Africa/Cairo';

const filedAt = async (readAt: string): Promise<NodeSql> => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  sql.exec(
    "INSERT INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES ('model-answers', '2026-10-08', 'green', 9, 'The model answered 9 of 9 asks this week.', '[]', 'x', 'host', ?)",
    readAt,
  );
  return sql;
};

const modelAnswers = (sql: NodeSql) => {
  const s = readSigns(sql, NOW, TZ).find((x) => x.sign === 'model-answers');
  assert.ok(s);
  return s;
};

for (const [what, readAt] of [
  ['a time that does not parse', 'yesterday-ish'],
  ['an empty time', ''],
] as const) {
  test(`A FILING WITH ${what.toUpperCase()} STOPS STANDING, and says it cannot tell when it was read`, async () => {
    const s = modelAnswers(await filedAt(readAt));
    assert.equal(s.state, 'none');
    assert.equal(s.value, null);
    assert.equal(s.said, 'No day it was read is known.');
    assert.deepEqual(s.facts, ['It last read green: The model answered 9 of 9 asks this week.']);
    assert.doesNotMatch(s.said, /NaN|Invalid|—/);
  });
}

test('A FILING INSIDE ITS DAY STILL STANDS, and one just past it reads none with its date', async () => {
  const fresh = modelAnswers(await filedAt(new Date(NOW - FILED_STANDS_MS).toISOString()));
  assert.equal(fresh.state, 'green');
  assert.equal(fresh.value, 9);
  const old = modelAnswers(await filedAt(new Date(NOW - FILED_STANDS_MS - 1).toISOString()));
  assert.equal(old.state, 'none');
  assert.equal(old.said, 'Not read since 7 October.');
});
