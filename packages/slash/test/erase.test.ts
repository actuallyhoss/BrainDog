/**
 * `eraseSlash`: an erased person's words leave Slash's ledger, and the ledger's count of what was spent stays.
 *
 * THE KERNEL'S RULE, HELD HERE ON SLASH'S OWN STORE. A subject is matched trimmed and lower-cased as a substring, a matched
 * value becomes `--erased--`, and every row stays with its time, kind, tier, model and counts. The name is written with an
 * accent and asked for in another case on purpose: SQLite's `lower()` folds ASCII alone, and a walk in SQL would miss it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSlash, eraseSlash } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, openSqlite, type TestSql } from './double.ts';

const ERASED = '--erased--';

const put = (sql: TestSql, table: string, id: string, question: string, predicate: string, read: string) =>
  sql.exec(
    `INSERT INTO ${table} (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, predicate, read)
     VALUES (?, '2026-11-02T09:00:00.000Z', 'read', 'a', 'glm-5.3-flash', 10, 2, 1, 5, 'ok', ?, ?, ?)`,
    id,
    question,
    predicate,
    read,
  );

test('A QUESTION, A DRAFTED FILTER AND A TRACE NAMING THE SUBJECT ARE ERASED; the row, its counts and every other row stay', () => {
  const sql = openSqlite();
  try {
    const slash = createSlash({ sql, clock: fixedClock(NOW), inference: canned(), record: fakeRecord() });
    put(
      sql,
      'slash_call',
      'c_named',
      'What does Émile Durand still owe?',
      '{"registers":["people"],"where":{"field":"name","is":"Émile Durand"},"q":null}',
      JSON.stringify([{ register: 'people', rows: 1, predicate: 'name is Émile Durand' }]),
    );
    put(sql, 'slash_call', 'c_other', 'What is still open?', '{"registers":["tasks"],"where":null,"q":null}', JSON.stringify([{ register: 'tasks', rows: 3, predicate: 'all' }]));
    const before = slash.status().asks.used;

    assert.equal(eraseSlash(sql, ['  ÉMILE durand ']), 1);

    const rows = sql.all<{ id: string; question: string; predicate: string; read: string; tokens_in: number; model: string }>(
      'SELECT id, question, predicate, read, tokens_in, model FROM slash_call ORDER BY id',
    );
    const named = rows.find((r) => r.id === 'c_named');
    assert.deepEqual(
      { question: named?.question, predicate: named?.predicate, read: JSON.parse(named?.read ?? '[]') as unknown, tokens_in: named?.tokens_in, model: named?.model },
      { question: ERASED, predicate: ERASED, read: [{ register: 'people', rows: 1, predicate: ERASED }], tokens_in: 10, model: 'glm-5.3-flash' },
    );
    const other = rows.find((r) => r.id === 'c_other');
    assert.equal(other?.question, 'What is still open?');
    assert.equal(slash.status().asks.used, before, 'the erasure changed the count of what was spent');

    /* AND ASKED AGAIN, THERE IS NOTHING LEFT THAT NAMES THEM. */
    assert.equal(eraseSlash(sql, ['émile durand']), 0);
  } finally {
    sql.close();
  }
});

test('A STORE WITH NO LEDGER ERASES NOTHING AND CREATES NOTHING', () => {
  const sql = openSqlite();
  try {
    assert.equal(eraseSlash(sql, ['émile durand']), 0);
    assert.deepEqual(sql.all("SELECT name FROM sqlite_master WHERE type = 'table'"), []);
  } finally {
    sql.close();
  }
});

test('A LEDGER STILL UNDER ITS VERSION 1 NAME IS BROUGHT FORWARD AND ERASED, not missed by its old name', () => {
  const sql = openSqlite();
  try {
    sql.exec(`CREATE TABLE call (
      id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL,
      tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL, status TEXT NOT NULL, code TEXT, question TEXT,
      predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT
    )`);
    put(sql, 'call', 'c_old', 'Where is Kiln Ltd on the list?', '{"registers":["people"],"where":null,"q":"Kiln Ltd"}', '[]');

    assert.equal(eraseSlash(sql, ['kiln ltd']), 1);
    const row = sql.one<{ question: string; predicate: string }>("SELECT question, predicate FROM slash_call WHERE id = 'c_old'");
    assert.deepEqual({ ...row }, { question: ERASED, predicate: ERASED });
    assert.equal(sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'call'"), undefined);
  } finally {
    sql.close();
  }
});
