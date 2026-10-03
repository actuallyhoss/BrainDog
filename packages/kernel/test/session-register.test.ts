/**
 * The kernel's one register, and the spoken prefix that makes its rows `S1`, `S2`.
 *
 * Migrations 2 and 22 write the `register.session` rows by hand, because a migration's text cannot call the code that
 * installs declarations. So each row is held here to what `installDeclarations` writes for the same body: the canonical
 * bytes `jcs` makes, the checksum `digest` takes of them, the next version stamped at the instant the one before is
 * superseded, and the indexes `indexesFor` implies. A hand-written copy that drifts from the code path fails here.
 *
 * MIGRATION 2'S ROW IS WORKED OUT FROM THOSE FUNCTIONS, NOT BY INSTALLING. `validate` lets `register.session` through
 * only as the kernel's newest bytes, because migration 2's installed over 22's would write the older body back as a newer
 * version. Migration 22's row is installed by code too, over a record with 22's work taken away, and compared whole.
 * `session.test.ts` installs the kernel's own declaration over a record and checks that nothing changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDeclarations } from '../src/declare.ts';
import { execScript } from '../src/migrate.ts';
import { SESSION_BODY as MIGRATION_2_BODY } from '../src/migrations/0002_session.ts';
import { SEAT_SESSION, SESSION_BODY } from '../src/migrations/0022_session_client.ts';
import {
  digest, indexesFor, jcs, openRecord, sessionDeclaration, validateDeclaration,
  type Declaration, type Entry, type Kernel, type SessionHints, type WriteContext,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

/** The instants migrations 2 and 22 seat their versions at; the second is also when the first was superseded. */
const DECLARED_2 = '2026-09-11T00:00:00.000Z';
const SEATED = '2026-10-02T00:00:00.000Z';

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const VERSIONS =
  "SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at FROM declaration WHERE id = 'register.session' ORDER BY version";
/** Every version of the register, oldest first, with when each was written, as plain objects. */
const versions = (sql: NodeSql) => sql.all<Record<string, unknown>>(VERSIONS).map((r) => ({ ...r }));
/** The session register's indexes, by name and statement, as plain objects. */
const indexes = (sql: NodeSql) =>
  sql
    .all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .filter((r) => r.name.startsWith('entry_u_session__') || r.name.startsWith('entry_i_session__'))
    .map((r) => ({ name: r.name, sql: r.sql }));

/** The indexes installDeclarations builds for a body, as SQLite keeps them: by name, without `IF NOT EXISTS`. */
const implied = (body: string) =>
  indexesFor('session', JSON.parse(body).fields)
    .map((statement) => ({ name: /INDEX IF NOT EXISTS (\S+)/.exec(statement)![1]!, sql: statement.replace(' IF NOT EXISTS', '') }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** A version of the register as installDeclarations writes it: the canonical bytes, and the checksum of exactly those. */
const written = async (version: number, body: string, created_at: string, superseded_at: string | null) => ({
  id: 'register.session',
  version,
  kind: 'register',
  pack_id: 'kernel',
  body: jcs(JSON.parse(body)),
  checksum: await digest(jcs(JSON.parse(body))),
  retired: 0,
  superseded_at,
  created_at,
});

/** Migration 22's work taken away again: the record as migration 21 left it, with migration 2's row the live one. */
function before22(sql: NodeSql): void {
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session' AND superseded_at = ?", SEATED);
}

/* ── the rows the migrations write ───────────────────────────────────────── */

test('both bodies are canonical, and each is a shape the kernel accepts as a register', () => {
  for (const body of [MIGRATION_2_BODY, SESSION_BODY]) {
    assert.equal(jcs(JSON.parse(body)), body, 'the stored bytes are not the canonical form of themselves');
    /* UNDER ANOTHER NAME, because the arm of `validate` that names `register.session` is about who may declare it and
       which bytes are the kernel's own, not about its shape: everything else a register is checked for is checked. */
    const runs: Declaration = { id: 'register.runs', kind: 'register', body: { ...JSON.parse(body), id: 'runs', seq_prefix: 'RN' }, pack: 'kernel' };
    assert.equal(validateDeclaration(runs), null);
  }
});

test('MIGRATIONS 2 AND 22 WRITE WHAT installDeclarations WRITES: each version in turn, superseded at one instant, and the indexes its body implies', async () => {
  const { sql } = await record();
  assert.deepEqual(versions(sql), [await written(1, MIGRATION_2_BODY, DECLARED_2, SEATED), await written(2, SESSION_BODY, SEATED, null)]);
  /* THE SAME EIGHT INDEXES FOR BOTH BODIES, because neither new field is indexed, so migration 22 builds none. */
  assert.equal(indexes(sql).length, 8);
  assert.deepEqual(indexes(sql), implied(MIGRATION_2_BODY));
  assert.deepEqual(indexes(sql), implied(SESSION_BODY));
  sql.close();
});

test('AND INSTALLED BY CODE, the kernel’s declaration writes what migration 22 wrote, and migration 2’s bytes are no longer the kernel’s', async () => {
  const migrated = await record();
  const byHand = versions(migrated.sql);
  const byHandIndexes = indexes(migrated.sql);

  /* The same record with migration 22's work and the indexes taken away, then the kernel's declaration installed by
     code at 22's instant. */
  const fresh = await record();
  before22(fresh.sql);
  for (const { name } of indexes(fresh.sql)) fresh.sql.exec(`DROP INDEX ${name}`);
  value(await installDeclarations(fresh.sql, Date.parse(SEATED), [sessionDeclaration()], (fn) => fresh.sql.transactionSync(fn)));
  assert.deepEqual(versions(fresh.sql), byHand);
  assert.deepEqual(indexes(fresh.sql), byHandIndexes);

  /* MIGRATION 2'S BYTES ARE REFUSED NOW, even as the kernel's: over 22's they would be the newest version, and every
     run opened after it would lose its app again. */
  const older = await installDeclarations(fresh.sql, NOW, [{ ...sessionDeclaration(), body: JSON.parse(MIGRATION_2_BODY) }], (fn) =>
    fresh.sql.transactionSync(fn),
  );
  assert.equal(refusal(older).code, 'PROVIDES_CONFLICT');
  assert.deepEqual(versions(fresh.sql), byHand, 'migration 2’s bytes were written over 22’s');
  migrated.sql.close();
  fresh.sql.close();
});

test('THE SEAT AN IMPORT RUNS writes migration 22’s row where migration 2’s is live, and nothing where it is already', async () => {
  const { sql } = await record();
  const seated = versions(sql);
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), seated, 'seating it a second time wrote a version');

  /* A file written before migration 22 carries migration 2's row as the live one. */
  before22(sql);
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), seated, 'the seat did not write what migration 22 writes');

  /* And a file older than migration 2 carries none at all, so this body is its first version. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.session'");
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), [{ ...seated[1], version: 1 }]);
  sql.close();
});

test('a new record holds the register, owned by the kernel and named as the seed names it', async () => {
  const { k, sql } = await record();
  assert.equal(k.register('session')?.name, 'Agent runs');
  assert.equal(k.register('session')?.seq_prefix, 'S');
  assert.equal(k.declarations().find((d) => d.id === 'register.session')?.pack_id, 'kernel');
  sql.close();
});

/* ── what a run keeps ────────────────────────────────────────────────────── */

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const as = (token: string, session: SessionHints): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

test('A RUN KEEPS THE APP IT IS IN and its version, and a Gemini, Copilot or Windsurf run is one', async () => {
  const { k, sql } = await record();
  value(await k.install([TASKS]));
  const said: [string, SessionHints][] = [
    ['t_1', { client: 'claude-code', client_version: '2.1.4' }],
    ['t_2', { client: 'gemini-cli-mcp-client', client_version: '0.8.1' }],
    ['t_3', { agent: 'copilot', client: 'GitHub Copilot' }],
    ['t_4', { agent: 'windsurf' }],
  ];
  for (const [token, session] of said) value(k.create('tasks', { what: token }, as(token, session)));
  assert.deepEqual(
    said.map((_, i) => {
      const run = k.get(`S${i + 1}`) ?? assert.fail(`S${i + 1} was not opened`);
      return [run.fields.agent, run.fields.client, run.fields.client_version];
    }),
    [
      ['claude', 'claude-code', '2.1.4'],
      ['gemini', 'gemini-cli-mcp-client', '0.8.1'],
      ['copilot', 'GitHub Copilot', undefined],
      ['windsurf', undefined, undefined],
    ],
  );
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM observation WHERE kind = 'write.refused'")?.n ?? 0, 0, 'a run failed to open');
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
