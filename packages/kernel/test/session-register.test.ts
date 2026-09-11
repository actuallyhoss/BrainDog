/**
 * The kernel's one register, and the spoken prefix that makes its rows `S1`, `S2`.
 *
 * Migration 2 writes the `register.session` row by hand, because a migration's text cannot call the
 * code that installs declarations. So the two are compared here: the row, its checksum and its
 * indexes must be exactly what `installDeclarations` writes for the same body, or the hand-written
 * copy and the code path have drifted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDeclarations } from '../src/declare.ts';
import { SESSION_BODY } from '../src/migrations/0002_session.ts';
import { jcs, openRecord, validateDeclaration, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

const SESSION: Declaration = { id: 'register.session', kind: 'register', body: JSON.parse(SESSION_BODY), pack: 'kernel' };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ROW = 'SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at FROM declaration WHERE id = ?';
/** The session register's indexes, by name and statement, as plain objects. */
const indexes = (sql: NodeSql) =>
  sql
    .all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .filter((r) => r.name.startsWith('entry_u_session__') || r.name.startsWith('entry_i_session__'))
    .map((r) => ({ name: r.name, sql: r.sql }));

/* ── the row the migration writes ────────────────────────────────────────── */

test('the body is canonical, and it is a declaration the kernel itself accepts', () => {
  assert.equal(jcs(JSON.parse(SESSION_BODY)), SESSION_BODY, 'the stored bytes are not the canonical form of themselves');
  assert.equal(validateDeclaration(SESSION), null);
});

test('MIGRATION 2 WRITES WHAT installDeclarations WRITES, the row and its indexes alike', async () => {
  const migrated = await record();
  const byHand = migrated.sql.one<Record<string, unknown>>(ROW, 'register.session');
  const byHandIndexes = indexes(migrated.sql);
  assert.ok(byHand, 'a new record has no register.session');
  assert.equal(byHandIndexes.length, 8);

  /* The same record with the migration's work taken away, then the declaration installed by code. */
  const fresh = await record();
  fresh.sql.exec("DELETE FROM declaration WHERE id = 'register.session'");
  for (const { name } of indexes(fresh.sql)) fresh.sql.exec(`DROP INDEX ${name}`);
  value(await installDeclarations(fresh.sql, NOW, [SESSION], (fn) => fresh.sql.transactionSync(fn)));

  assert.deepEqual(fresh.sql.one<Record<string, unknown>>(ROW, 'register.session'), byHand);
  assert.deepEqual(indexes(fresh.sql), byHandIndexes);
  migrated.sql.close();
  fresh.sql.close();
});

test('a new record holds the register, owned by the kernel and named as the seed names it', async () => {
  const { k, sql } = await record();
  assert.equal(k.register('session')?.name, 'Agent runs');
  assert.equal(k.register('session')?.seq_prefix, 'S');
  assert.equal(k.declarations().find((d) => d.id === 'register.session')?.pack_id, 'kernel');
  sql.close();
});

/* ── and the prefix it speaks ────────────────────────────────────────────── */

test('`S1` RESOLVES to the first session, as `session#1` does', async () => {
  const { k, sql } = await record();
  const first = value<Entry>(k.create('session', { doing: 'Wire the device routes' }, { actor: 'p_1' }));
  assert.equal(first.seq, 1);

  assert.equal(k.get('S1')?.id, first.id);
  assert.equal(k.get('session#1')?.id, first.id);
  for (const nothing of ['S2', 'S0', 'S01', 'D1', 'SG1', 's1', '#1'])
    assert.equal(k.get(nothing), null, `${nothing} resolved to a row`);

  /* The write path addresses a row through the same lookup, so a session can be updated by what a
     person says. */
  const moved = value<Entry>(k.update('session', 'S1', { next: 'Wire the self-host' }, { actor: 'p_1', version: first.version }));
  assert.equal(moved.fields.next, 'Wire the self-host');
  sql.close();
});

test('AND `S12` IS ROW 12, which the spoken pattern alone reads as the prefix `S1` and row 2', async () => {
  const { k, sql } = await record();
  const made = Array.from({ length: 12 }, (_, i) => value<Entry>(k.create('session', { doing: `run ${i + 1}` }, { actor: 'p_1' })));
  assert.equal(k.get('S12')?.id, made[11]!.id);
  assert.equal(k.get('S2')?.id, made[1]!.id);
  sql.close();
});

test('a register with its own prefix is spoken beside the session register', async () => {
  const { k, sql } = await record();
  value(
    await k.install([
      {
        id: 'register.learnings',
        kind: 'register',
        body: { id: 'learnings', name: 'Learnings', title: 'lesson', seq_prefix: 'LN', fields: [{ id: 'lesson', type: 'text' }] },
      },
    ]),
  );
  const lesson = value<Entry>(k.create('learnings', { lesson: 'Run the gates one at a time.' }, { actor: 'p_1' }));
  const run = value<Entry>(k.create('session', { doing: 'Gates' }, { actor: 'p_1' }));
  assert.equal(k.get('LN1')?.id, lesson.id);
  assert.equal(k.get('S1')?.id, run.id);
  assert.equal(k.get('learnings#1')?.id, lesson.id);
  sql.close();
});
