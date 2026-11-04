/**
 * Migration 44 (`src/migrations/0044_seat.ts`): a record that ran 43 takes it with every row and line as it was, the
 * runs list's next version with the profile a run is under, the instructions list's next version with a machine and a
 * profile, and `job_place`; and the record stamps a run's profile as it opens, learns it once, and never lets a caller
 * write it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrations } from '../src/migrate.ts';
import { INSTRUCTIONS_BODY as INSTRUCTIONS_42, SESSION_BODY as SESSION_42 } from '../src/migrations/0042_agents.ts';
import { INSTRUCTIONS_BODY, SESSION_BODY } from '../src/migrations/0044_seat.ts';
import { digest, openRecord, validateDeclaration, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
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
const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};
const asToken = (token: string, session: SessionHints): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

/** Every row of the tables a migration must not touch, as plain objects. */
const snapshot = (sql: NodeSql) => ({
  entry: sql.all('SELECT * FROM entry ORDER BY id').map((r) => ({ ...r })),
  event: sql.all('SELECT * FROM event ORDER BY rowid').map((r) => ({ ...r })),
  counter: sql.all('SELECT * FROM counter ORDER BY name').map((r) => ({ ...r })),
  token: sql.all('SELECT * FROM token ORDER BY id').map((r) => ({ ...r })),
  job: sql.all('SELECT * FROM job ORDER BY id').map((r) => ({ ...r })),
});

/** Migration 45's tables taken away, so that what is left is the record as 44 left it. */
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
  sql.exec('DELETE FROM migration WHERE version >= 45');
}

/** Migration 45's work taken away, then 44's: the record as migration 43 left it. */
function before44(sql: NodeSql): void {
  before45(sql);
  sql.exec("DELETE FROM declaration WHERE id IN ('register.session', 'register.instructions') AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id IN ('register.session', 'register.instructions') AND superseded_at = ?", SEATED_44);
  sql.exec('DROP TABLE job_place');
  sql.exec("DELETE FROM dog_section WHERE table_name = 'job_place'");
  sql.exec('DELETE FROM migration WHERE version >= 44');
}

const fieldsOf = (body: string): string[] => (JSON.parse(body).fields as { id: string }[]).map((f) => f.id);

test('THE BODIES ARE CANONICAL, each a register the kernel accepts, and each checksum the one the seat writes', async () => {
  /* UNDER ANOTHER NAME EACH, as migration 42's test checks its own: the arm of `validate` that names the kernel's
     registers is about who declares them, and these bytes as `register.instructions` are checked below. */
  for (const [body, id, prefix] of [[SESSION_BODY, 'runs', 'RN'], [INSTRUCTIONS_BODY, 'told', 'TL']] as const) {
    assert.equal(JSON.stringify(JSON.parse(body)).length, body.length);
    const decl: Declaration = { id: `register.${id}`, kind: 'register', body: { ...JSON.parse(body), id, seq_prefix: prefix }, pack: 'kernel' };
    assert.equal(validateDeclaration(decl), null);
  }
  /* AND AS THE KERNEL'S OWN: 44's bytes are let through, 42's no longer. */
  const own = (body: string): Declaration => ({ id: 'register.instructions', kind: 'register', body: JSON.parse(body), pack: 'kernel' });
  assert.equal(validateDeclaration(own(INSTRUCTIONS_BODY)), null);
  assert.equal(validateDeclaration(own(INSTRUCTIONS_42))?.code, 'PROVIDES_CONFLICT');
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const rows = sql.all<{ id: string; checksum: string; body: string }>(
    "SELECT id, checksum, body FROM declaration WHERE id IN ('register.session', 'register.instructions') AND superseded_at IS NULL ORDER BY id",
  );
  assert.deepEqual(rows.map((r) => r.body), [INSTRUCTIONS_BODY, SESSION_BODY]);
  for (const r of rows) assert.equal(r.checksum, await digest(r.body));
  /* MIGRATION 42'S BODIES, AND THE NEW FIELDS IN THEIR PLACE: none taken away, none retyped. */
  assert.deepEqual(fieldsOf(SESSION_BODY), [...fieldsOf(SESSION_42), 'seat']);
  const was = fieldsOf(INSTRUCTIONS_42);
  const at = was.indexOf('repo') + 1;
  assert.deepEqual(fieldsOf(INSTRUCTIONS_BODY), [...was.slice(0, at), 'machine', 'seat', ...was.slice(at)]);
  /* NOT CALLED `profile`, which since migration 42 is the settings row a run works under. */
  assert.ok(fieldsOf(SESSION_BODY).includes('profile'));
  assert.equal(fieldsOf(SESSION_BODY).filter((f) => f === 'seat').length, 1);
  sql.close();
});

test('A RECORD THAT RAN 43 TAKES 44, and every row, line, counter, key and job is as it was', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([NOTES]));
  value(k.create('notes', { body: 'From Claude' }, asToken('t_1', { client_id: 'c-1', agent: 'claude', repo: 'braindog' })));
  before44(sql);
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW + 3_600_000));
  assert.ok(result.ok);
  assert.deepEqual(result.value.applied, [44, 45, 46, 47, 48]);
  assert.deepEqual(snapshot(sql), before, 'migration 44 changed a row, a line, a counter, a key or a job');
  const seated = (id: string) =>
    sql.all('SELECT version, superseded_at FROM declaration WHERE id = ? ORDER BY version', id).map((r) => ({ ...r }));
  assert.deepEqual(seated('register.instructions'), [
    { version: 1, superseded_at: SEATED_44 },
    { version: 2, superseded_at: null },
  ]);
  assert.deepEqual(seated('register.session').slice(-2), [
    { version: 5, superseded_at: SEATED_44 },
    { version: 6, superseded_at: null },
  ]);
  assert.deepEqual(
    sql.all("SELECT table_name, section FROM dog_section WHERE table_name = 'job_place'").map((r) => ({ ...r })),
    [{ table_name: 'job_place', section: 'local' }],
  );

  /* AND IT RUNS OVER ITSELF, changing nothing the second time. */
  const once = snapshot(sql);
  const versions = sql.all('SELECT id, version, superseded_at FROM declaration ORDER BY id, version').map((r) => ({ ...r }));
  sql.exec('DELETE FROM migration WHERE version >= 44');
  assert.deepEqual((await applyMigrations(sql, fixedClock(NOW + 7_200_000))).result, { ok: true, value: { kernel: 48, format: 1, applied: [44, 45, 46, 47, 48] } });
  assert.deepEqual(snapshot(sql), once);
  assert.deepEqual(sql.all('SELECT id, version, superseded_at FROM declaration ORDER BY id, version').map((r) => ({ ...r })), versions);
  sql.close();
});

test('A RUN’S PROFILE IS THE RECORD’S TO WRITE: stamped as it opens, learned once by a run that opened without it, never moved', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([NOTES]));

  /* STAMPED AS IT OPENS, from the run's own hint. */
  value(k.create('notes', { body: 'a' }, asToken('t_1', { client_id: 'c-1', agent: 'claude', seat: 'harbour' })));
  const s1 = k.findRun({ client_id: 'c-1' }, 't_1')!;
  assert.equal(s1.fields.seat, 'harbour');

  /* A CALLER NEVER WRITES IT, the run's own key no more than a person. */
  assert.equal(refusal(k.update('session', 'S1', { seat: 'garden' }, asToken('t_1', { client_id: 'c-1' }))).code, 'IMMUTABLE_FIELD');
  assert.equal(refusal(k.update('session', 'S1', { seat: 'garden' }, { actor: 'p_1' })).code, 'IMMUTABLE_FIELD');

  /* AND A CALL UNDER ANOTHER PROFILE DOES NOT MOVE IT: a session runs under one for its whole life. */
  value(k.create('notes', { body: 'b' }, asToken('t_1', { client_id: 'c-1', seat: 'garden' })));
  assert.equal(k.get('S1')?.fields.seat, 'harbour');

  /* A RUN OPENED WITHOUT ONE learns it from its next call that says it, with no line of its own in the history. */
  value(k.create('notes', { body: 'c' }, asToken('t_2', { client_id: 'c-2', agent: 'claude' })));
  const s2 = k.findRun({ client_id: 'c-2' }, 't_2')!;
  assert.equal(s2.fields.seat, undefined);
  const lines = sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE target = ?", `entry:${s2.id}`)!.n;
  clock.advance(60_000);
  value(k.create('notes', { body: 'd' }, asToken('t_2', { client_id: 'c-2', seat: 'default' })));
  assert.equal(k.get(`S${String(s2.seq)}`)?.fields.seat, 'default');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE target = ? AND field = 'seat'", `entry:${s2.id}`)!.n, 0);
  assert.ok(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE target = ?", `entry:${s2.id}`)!.n >= lines);

  /* AND A PULSE THAT SAYS IT TEACHES A RUN THAT HAS NONE, once, and moves no run that has one. */
  value(k.create('notes', { body: 'e' }, asToken('t_3', { client_id: 'c-3', agent: 'claude' })));
  const s3 = `S${String(k.findRun({ client_id: 'c-3' }, 't_3')!.seq)}`;
  clock.advance(60_000);
  assert.equal(k.pulseRun(s3, undefined, 'harbour'), true);
  assert.equal(k.get(s3)?.fields.seat, 'harbour');
  clock.advance(60_000);
  k.pulseRun(s3, undefined, 'garden');
  assert.equal(k.get(s3)?.fields.seat, 'harbour');
  sql.close();
});
