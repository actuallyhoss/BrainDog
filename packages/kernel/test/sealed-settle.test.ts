/**
 * Sealed files across a copy (migration 45, `src/sealed.ts`): the names travel, the parts stay with the host, and an
 * import counts each file whole again from the parts this host holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { testSigner } from './signer.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const AT = new Date(NOW).toISOString();
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const SIGNER = testSigner();
const SHA = 'a'.repeat(64);
const OLDER = 'b'.repeat(64);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(sql: NodeSql = openSqlite()) {
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(k.createRecord({ id: ID, slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  return { k, sql };
}

/** A sealed file's row, said whole as the host that sealed it said it. */
const file = (sql: NodeSql, key: string, parts: number, size: number, sha = SHA): void =>
  sql.exec(
    'INSERT INTO sealed_file (key, parts, size, sha256, complete, made_at, updated_at, made_by) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    key,
    parts,
    size,
    sha,
    AT,
    AT,
    'p_1',
  );

/** A part this host holds. */
const part = (sql: NodeSql, key: string, n: number, bytes: number, sha = SHA): void =>
  sql.exec('INSERT INTO sealed_part (key, part, sha256, bytes, at) VALUES (?, ?, ?, ?, ?)', key, n, sha, bytes, AT);

const whole = (sql: NodeSql): Record<string, number> =>
  Object.fromEntries(sql.all<{ key: string; complete: number }>('SELECT key, complete FROM sealed_file ORDER BY key').map((r) => [r.key, Number(r.complete)]));

test('THE NAMES TRAVEL AND THE PARTS DO NOT: an export carries sealed_file and never sealed_part', async () => {
  const { k, sql } = await record();
  file(sql, 'sync/key', 1, 120);
  part(sql, 'sync/key', 0, 120);
  const lines = value<string[]>(await k.export());
  assert.ok(lines.some((l) => l.startsWith('#table sealed_file ')), 'the file names no sealed file');
  assert.ok(!lines.some((l) => l.startsWith('#table sealed_part ')), 'which parts this host holds went into the file');
  assert.ok(lines.some((l) => l.includes('sync/key')));
  sql.close();
});

test('A FILE IMPORTED INTO A NEW RECORD IS NOT WHOLE THERE until its parts are put on that host', async () => {
  const { k, sql } = await record();
  file(sql, 'sync/key', 1, 120);
  part(sql, 'sync/key', 0, 120);
  const lines = value<string[]>(await k.export());

  const to = openSqlite();
  const k2 = await openRecord(to, fixedClock(NOW), { sign: SIGNER });
  value(await k2.import(lines));
  assert.deepEqual(whole(to), { 'sync/key': 0 });
  assert.equal(to.one<{ size: number }>("SELECT size FROM sealed_file WHERE key = 'sync/key'")?.size, 120, 'the name came without its size');
  sql.close();
  to.close();
});

test('A REPLACING IMPORT COUNTS EACH FILE WHOLE AGAIN FROM THE PARTS THIS HOST KEPT', async () => {
  const { k, sql } = await record();
  for (const [key, parts, size] of [['carry/a', 2, 10], ['carry/b', 2, 10], ['carry/c', 1, 10], ['carry/d', 2, 10], ['carry/e', 1, 10]] as const)
    file(sql, key, parts, size);
  const lines = value<string[]>(await k.export());

  /* EVERY PART, UNDER THE FILE'S HASH, ADDING UP: whole. */
  part(sql, 'carry/a', 0, 4);
  part(sql, 'carry/a', 1, 6);
  /* A PART SHORT. */
  part(sql, 'carry/b', 0, 4);
  /* A PART OF AN OLDER FILE UNDER THE SAME KEY counts for nothing. */
  part(sql, 'carry/c', 0, 10, OLDER);
  /* LENGTHS THAT DO NOT ADD UP TO THE SIZE. */
  part(sql, 'carry/d', 0, 4);
  part(sql, 'carry/d', 1, 7);
  /* `carry/e` HAS NO PART HERE AT ALL. */

  value(await k.import(lines, { replace: true, by: 'p_1' }));
  assert.deepEqual(whole(sql), { 'carry/a': 1, 'carry/b': 0, 'carry/c': 0, 'carry/d': 0, 'carry/e': 0 });
  assert.equal(sql.all('SELECT 1 FROM sealed_part').length, 6, 'a replacing import let go of parts this host holds');
  sql.close();
});
