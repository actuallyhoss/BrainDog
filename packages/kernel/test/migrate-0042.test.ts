/**
 * Migration 42 (`src/migrations/0042_agents.ts`): a record that ran 41 takes it with every row and line as it was, the
 * runs list's next version and the instructions list seated, two tables and an index added; and its data step makes
 * one settings row per kind of agent the runs have used, once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrations } from '../src/migrate.ts';
import { INSTRUCTIONS_BODY, SESSION_BODY, agentsDataSteps } from '../src/migrations/0042_agents.ts';
import { SESSION_BODY as MIGRATION_28_BODY } from '../src/migrations/0028_runs.ts';
import { digest, openRecord, validateDeclaration, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const SEATED_42 = '2026-10-21T00:00:00.000Z';
const SEATED_44 = '2026-10-22T00:00:00.000Z';

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text' }] },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.refusal ? `${x.refusal.code}: ${x.refusal.fix}` : JSON.stringify(r));
  return x.value;
};
const asToken = (token: string, session: SessionHints): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

/** Every row of the tables a migration must not touch, as plain objects. */
const snapshot = (sql: NodeSql) => ({
  entry: sql.all('SELECT * FROM entry ORDER BY id').map((r) => ({ ...r })),
  event: sql.all('SELECT * FROM event ORDER BY rowid').map((r) => ({ ...r })),
  counter: sql.all('SELECT * FROM counter ORDER BY name').map((r) => ({ ...r })),
  token: sql.all('SELECT * FROM token ORDER BY id').map((r) => ({ ...r })),
});

/**
 * Migration 44's lists taken away and 42's made live again: the record as migration 43 left it, as far as the two
 * kernel registers go. A rewind past 42 needs it first, or 42's seat would seat its lists again over 44's.
 */
function before44(sql: NodeSql): void {
  sql.exec("DELETE FROM declaration WHERE id IN ('register.session', 'register.instructions') AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id IN ('register.session', 'register.instructions') AND superseded_at = ?", SEATED_44);
}

/** Migration 45's tables taken away: a record from before 45 has none. */
function before45(sql: NodeSql): void {
  sql.exec('DROP TABLE sealed_part');
  sql.exec('DROP TABLE sealed_file');
  sql.exec("DELETE FROM dog_section WHERE table_name IN ('sealed_file', 'sealed_part')");
  /* AND 46's, which came after it. */
  sql.exec('DROP TABLE key_ask');
  sql.exec('DROP TABLE key_access');
  sql.exec("DELETE FROM dog_section WHERE table_name IN ('key_access', 'key_ask')");
  /* AND 47's. */
  sql.exec('DROP TABLE observation_who');
  sql.exec("DELETE FROM dog_section WHERE table_name = 'observation_who'");
}

/** Migration 42's work taken away, and 45's and 44's before it: the record as migration 41 left it. */
function before42(sql: NodeSql): void {
  before45(sql);
  before44(sql);
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session' AND superseded_at = ?", SEATED_42);
  sql.exec("DELETE FROM declaration WHERE id = 'register.instructions'");
  sql.exec('DROP TABLE instruction_seen');
  sql.exec('DROP TABLE agent_profile');
  sql.exec('DROP TABLE job_place');
  sql.exec('DROP INDEX entry_session_pulse');
  sql.exec("DELETE FROM dog_section WHERE table_name IN ('instruction_seen', 'agent_profile', 'job_place')");
  sql.exec('DELETE FROM migration WHERE version >= 42');
}

const tableNames = (sql: NodeSql) => sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);

test('THE BODIES ARE CANONICAL, each a register the kernel accepts, and each checksum the one the seat writes', async () => {
  /* UNDER ANOTHER NAME EACH, because only the kernel's newest bytes may be `register.session` or `register.instructions`
     (migration 44's now), and that arm is about who declares them, not their shape. */
  for (const [body, id, prefix] of [[SESSION_BODY, 'runs', 'RN'], [INSTRUCTIONS_BODY, 'told', 'TL']] as const) {
    assert.equal(JSON.stringify(JSON.parse(body)).length, body.length);
    const decl: Declaration = { id: `register.${id}`, kind: 'register', body: { ...JSON.parse(body), id, seq_prefix: prefix }, pack: 'kernel' };
    assert.equal(validateDeclaration(decl), null);
  }
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const rows = sql.all<{ id: string; checksum: string; body: string }>(
    "SELECT id, checksum, body FROM declaration WHERE id IN ('register.session', 'register.instructions') AND superseded_at IS NULL ORDER BY id",
  );
  assert.deepEqual(rows.map((r) => r.id), ['register.instructions', 'register.session']);
  for (const r of rows) assert.equal(r.checksum, await digest(r.body));
  /* MIGRATION 28'S BODY, AND SIX FIELDS AFTER IT: none taken away, none retyped. */
  const was = JSON.parse(MIGRATION_28_BODY).fields as { id: string }[];
  const now = JSON.parse(SESSION_BODY).fields as { id: string }[];
  assert.deepEqual(now.slice(0, was.length), was);
  assert.deepEqual(now.slice(was.length).map((f) => f.id), ['instruction', 'task', 'profile', 'pulse_at', 'stopped', 'worktree']);
  sql.close();
});

test('A RECORD THAT RAN 41 TAKES 42, and every row, line, counter and key is as it was', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([NOTES]));
  value(k.create('notes', { body: 'From Claude' }, asToken('t_1', { client_id: 'c-1', agent: 'claude', repo: 'braindog' })));
  value(k.create('notes', { body: 'From Codex' }, asToken('t_2', { client_id: 'c-2', agent: 'codex', repo: 'braindog' })));
  before42(sql);
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW + 3_600_000));
  assert.ok(result.ok);
  assert.deepEqual(result.value.applied, [42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual(snapshot(sql), before, 'migration 42 changed a row, a line, a counter or a key');
  const seated = (id: string) =>
    sql.all('SELECT version, superseded_at FROM declaration WHERE id = ? ORDER BY version', id).map((r) => ({ ...r }));
  /* 42 seats each list, and 44 its next version over it. */
  assert.deepEqual(seated('register.instructions'), [
    { version: 1, superseded_at: SEATED_44 },
    { version: 2, superseded_at: null },
  ]);
  assert.deepEqual(seated('register.session').slice(-3), [
    { version: 4, superseded_at: SEATED_42 },
    { version: 5, superseded_at: SEATED_44 },
    { version: 6, superseded_at: null },
  ]);
  for (const t of ['instruction_seen', 'agent_profile']) assert.ok(tableNames(sql).includes(t), `${t} is missing`);
  assert.deepEqual(
    sql.all("SELECT table_name, section FROM dog_section WHERE table_name IN ('instruction_seen', 'agent_profile') ORDER BY table_name").map((r) => ({ ...r })),
    [
      { table_name: 'agent_profile', section: 'governance' },
      { table_name: 'instruction_seen', section: 'local' },
    ],
  );
  assert.ok(sql.one("SELECT 1 AS y FROM sqlite_master WHERE type = 'index' AND name = 'entry_session_pulse'"), 'the pulse index is missing');

  /* AND IT RUNS OVER ITSELF, changing nothing the second time: 44's lists taken away first, as a rewind past 42 finds
     them, and seated again under the same versions. */
  const once = snapshot(sql);
  const versions = sql.all('SELECT id, version FROM declaration ORDER BY id, version').map((r) => ({ ...r }));
  before44(sql);
  sql.exec('DELETE FROM migration WHERE version >= 42');
  assert.deepEqual((await applyMigrations(sql, fixedClock(NOW + 7_200_000))).result, { ok: true, value: { kernel: 48, format: 1, applied: [42, 43, 44, 45, 46, 47, 48] } });
  assert.deepEqual(snapshot(sql), once);
  assert.deepEqual(sql.all('SELECT id, version FROM declaration ORDER BY id, version').map((r) => ({ ...r })), versions);

  /* AND THE RECORD OPENS ON IT: the runs from before keep what they had, and an instruction can be made. */
  const reopened = await openRecord(sql, fixedClock(NOW + 7_200_000));
  assert.equal(reopened.get('S1')?.fields.agent, 'claude');
  assert.equal(value<{ id: string }>(reopened.instruct({ actor: 'p_1', principal: { kind: 'person' } }, { said: 'Merge it', to_run: 'S1' })).id, 'IN1');
  sql.close();
});

test('THE DATA STEP: a row per kind of agent the runs used, at the scope its newest run’s token holds, then Defaults, once', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([NOTES]));
  const at = new Date(NOW).toISOString();
  for (const [id, scope] of [['t_write', 'write'], ['t_propose', 'propose'], ['t_read', 'read']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES (?, 'p_1', ?, ?, ?)", id, `h_${id}`, scope, at);
  /* Claude's older run under a read key and its newest under a write key: the newest wins. */
  value(k.create('notes', { body: 'a' }, asToken('t_read', { client_id: 'c-0', agent: 'claude' })));
  clock.advance(60_000);
  value(k.create('notes', { body: 'b' }, asToken('t_write', { client_id: 'c-1', agent: 'claude' })));
  value(k.create('notes', { body: 'c' }, asToken('t_propose', { client_id: 'c-2', agent: 'codex' })));
  /* A kind whose run carries a key the record no longer holds starts at Suggest. */
  value(k.create('notes', { body: 'd' }, asToken('t_gone', { client_id: 'c-3', agent: 'cursor' })));

  assert.equal(agentsDataSteps(sql, at), 4);
  const rows = k.agentProfiles().map((p) => [p.id, p.name, p.match, p.ceiling]);
  assert.deepEqual(rows, [
    ['default', 'Defaults for new agents', {}, 'propose'],
    ['kind-claude', 'Claude Code', { kind: 'claude' }, 'write'],
    ['kind-codex', 'Codex', { kind: 'codex' }, 'propose'],
    ['kind-cursor', 'Cursor', { kind: 'cursor' }, 'propose'],
  ]);
  assert.equal(k.profileFor({ kind: 'claude', token: 't_write' }).ceiling, 'write', 'his current Claude lost its write');
  assert.equal(k.profileFor({ kind: 'gemini' }).id, 'default');

  /* ONCE: a row he retires is never made again, and the next tick is one read. */
  value(k.setProfile({ id: 'kind-codex', retired: true }, 'p_1'));
  assert.equal(agentsDataSteps(sql, at), 0);
  assert.equal(k.agentProfiles().length, 3);
  sql.close();
});
