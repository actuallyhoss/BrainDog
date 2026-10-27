/**
 * The test database refuses what the Durable Object refuses.
 *
 * Three cases plant one statement past one ceiling and assert the throw names the code and the statement's first
 * line; the rest show what must still pass. If `openSqlite` stops guarding by default, those three go red on their
 * own, and so does the next list someone binds one placeholder per row.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SqlError } from '@braindog/ports';

import { openSqlite } from './sqlite.ts';

function seeded() {
  const sql = openSqlite();
  sql.exec('CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)');
  sql.exec("INSERT INTO t (id, name) VALUES ('a', 'Ada'), ('b', 'Grace')");
  return sql;
}

const refused = (code: string, line: string) => (e: unknown) =>
  e instanceof SqlError && e.code === code && e.message.includes(line);

test('a statement binding 101 parameters throws TOO_MANY_PARAMS with its first line, on all, one and exec', () => {
  const sql = seeded();
  const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
  const marks = ids.map(() => '?').join(', ');
  const text = `SELECT id FROM t\n WHERE id IN (${marks})`;
  assert.throws(() => sql.all(text, ...ids), refused('TOO_MANY_PARAMS', 'SELECT id FROM t'));
  assert.throws(() => sql.one(text, ...ids), refused('TOO_MANY_PARAMS', 'SELECT id FROM t'));
  assert.throws(() => sql.exec(`DELETE FROM t WHERE id IN (${marks})`, ...ids), refused('TOO_MANY_PARAMS', 'DELETE FROM t'));
  assert.equal(sql.all<{ n: number }>('SELECT count(*) AS n FROM t')[0]!.n, 2, 'nothing ran');
});

test('exactly 100 parameters pass, and the same list bound as one JSON array passes at any size', () => {
  const sql = seeded();
  const hundred = Array.from({ length: 100 }, (_, i) => (i === 0 ? 'a' : `id${i}`));
  assert.equal(sql.all(`SELECT id FROM t WHERE id IN (${hundred.map(() => '?').join(', ')})`, ...hundred).length, 1);
  const many = [...Array.from({ length: 500 }, (_, i) => `id${i}`), 'a', 'b'];
  assert.equal(sql.all('SELECT id FROM t WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(many)).length, 2);
});

test('a compound select of six arms throws COMPOUND_TOO_LONG; five pass', () => {
  const sql = seeded();
  const arms = (n: number) => Array.from({ length: n }, () => 'SELECT id FROM t WHERE name = ?').join(' UNION ALL ');
  const six = Array.from({ length: 6 }, () => 'Ada');
  assert.throws(() => sql.all(arms(6), ...six), refused('COMPOUND_TOO_LONG', 'SELECT id FROM t WHERE name = ?'));
  assert.equal(sql.all(arms(5), ...six.slice(1)).length, 5);
});

test('a LIKE pattern over 50 bytes throws LIKE_TOO_LONG, counted in bytes; 50 pass', () => {
  const sql = seeded();
  assert.throws(() => sql.all('SELECT id FROM t WHERE name LIKE ?', `%${'x'.repeat(50)}`), refused('LIKE_TOO_LONG', 'SELECT id FROM t WHERE name LIKE ?'));
  /* Twenty-six two-byte letters are 52 bytes in 26 characters: the Durable Object counts bytes. */
  assert.throws(() => sql.one('SELECT id FROM t WHERE name LIKE ?', 'é'.repeat(26)), refused('LIKE_TOO_LONG', 'LIKE'));
  assert.equal(sql.all('SELECT id FROM t WHERE name LIKE ?', `%${'x'.repeat(48)}%`).length, 0);
  /* A long value bound anywhere else is no pattern. */
  assert.equal(sql.all('SELECT id FROM t WHERE name = ?', 'x'.repeat(500)).length, 0);
});

test('{ raw: true } turns the guard off, and says why', () => {
  const sql = openSqlite(':memory:', { raw: true, why: 'this case measures the driver itself' });
  sql.exec('CREATE TABLE t (id TEXT)');
  const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
  assert.deepEqual(sql.all(`SELECT id FROM t WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids), []);
  assert.throws(() => openSqlite(':memory:', { raw: true, why: '  ' }), /needs a why/);
});

test('the count is of values bound, not of question marks in the text', () => {
  const sql = seeded();
  assert.equal(sql.all(`/* ${'?'.repeat(150)} */ SELECT id FROM t WHERE id = ?`, 'a').length, 1);
});

test('a script with no parameters is not counted as one statement', () => {
  const sql = openSqlite();
  sql.exec(
    'CREATE TABLE a (x); CREATE VIEW v AS SELECT x FROM a UNION SELECT x FROM a UNION SELECT x FROM a; ' +
      'CREATE VIEW w AS SELECT x FROM a UNION SELECT x FROM a UNION SELECT x FROM a UNION SELECT x FROM a;',
  );
  assert.deepEqual(sql.all('SELECT x FROM w'), []);
});
