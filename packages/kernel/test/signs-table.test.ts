/**
 * Migration 27, `sign_reading`: one row a sign a day, three states, and it stays on this installation.
 *
 * WHAT IS HELD: the key is (sign, day), so a second reading of a day replaces or is refused rather than doubling; a state
 * outside green, red and none is refused by the table itself; `facts` is a JSON list; the table is `local` and never in
 * a `.brain` file; the migration applies again over itself, as `migrate.test.ts` rewinds it; and its bytes are canonical
 * and pinned, because an applied migration is never edited.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tables } from '../src/brainl.ts';
import { MIGRATIONS, canon, checksum } from '../src/migrate.ts';
import SIGNS_SQL from '../src/migrations/0027_signs.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);

const fresh = async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
};

const row = (state: string, facts = '[]') => [
  'INSERT INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  'arrivals-filed',
  '2026-10-07',
  state,
  3,
  '3 messages have waited more than a day.',
  facts,
  'abcd1234',
  'kernel',
  new Date(NOW).toISOString(),
] as const;

test('THE RECORD OPENS WITH THE TABLE, as migration 27 of the ledger', async () => {
  const sql = await fresh();
  assert.ok(MIGRATIONS.some((m) => m.version === 27 && m.sql === SIGNS_SQL), 'migration 27 is not the signs table');
  const cols = sql.all<{ name: string; pk: number }>("SELECT name, pk FROM pragma_table_info('sign_reading')");
  assert.deepEqual(
    cols.map((c) => c.name),
    ['sign', 'day', 'state', 'value', 'said', 'facts', 'rule', 'hand', 'read_at'],
  );
  assert.deepEqual(cols.filter((c) => c.pk > 0).map((c) => c.name), ['sign', 'day'], 'the key is not (sign, day)');
  sql.close();
});

test('ONE ROW A SIGN A DAY, and the table refuses a state that is not green, red or none', async () => {
  const sql = await fresh();
  const [text, ...args] = row('red');
  sql.exec(text, ...args);
  assert.throws(() => sql.exec(text, ...args), /UNIQUE|PRIMARY/i, 'a second row for the same sign and day went in');
  const [t2, ...a2] = row('amber');
  assert.throws(() => sql.exec(t2.replace('INSERT', 'INSERT OR REPLACE'), ...a2), /CHECK/i, 'amber went in');
  const [t3, ...a3] = row('green', '{"not":"a list"}');
  assert.throws(() => sql.exec(t3.replace('INSERT', 'INSERT OR REPLACE'), ...a3), /CHECK/i, 'facts that are not a list went in');
  for (const state of ['green', 'none']) {
    const [t, ...a] = row(state);
    sql.exec(t.replace('INSERT', 'INSERT OR REPLACE'), ...a);
  }
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM sign_reading')?.n, 1);
  sql.close();
});

test('LOCAL: a reading never travels in a .brain file, and the migration applies again over itself', async () => {
  const sql = await fresh();
  assert.equal(sql.one<{ section: string }>("SELECT section FROM dog_section WHERE table_name = 'sign_reading'")?.section, 'local');
  assert.ok(!tables(sql).some((t) => t.name === 'sign_reading'), 'the signs travel in an export');
  const [text, ...args] = row('red');
  sql.exec(text, ...args);
  sql.exec(SIGNS_SQL);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM sign_reading')?.n, 1, 'applying again lost or doubled a reading');
  sql.close();
});

test('THE BYTES ARE CANONICAL AND PINNED: no trailing space or CR for the checksum to fold away, and this checksum is theirs', async () => {
  assert.equal(canon(SIGNS_SQL), SIGNS_SQL, 'migration 27 holds bytes the checksum folds away');
  assert.equal(await checksum(SIGNS_SQL), '8582e0e0ecc06b0c24ded6e7eddacd794cd40bfaeee34f82e13a9c4e8ceb6a3e', 'migration 27 was edited after it was applied');
});
