/**
 * The settings each kind of agent works under (`src/agent-profile.ts`, migration 42's `agent_profile`): the nearest
 * row wins, settings only narrow, only a person writes them, and every change is a line in the log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROFILE, mayOf, openRecord, toolOn, type Profile } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.refusal ? `${x.refusal.code}: ${x.refusal.fix}` : JSON.stringify(r));
  return x.value;
};
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code: string } }).refusal?.code;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  return { sql, clock, k: await openRecord(sql, clock) };
}

test('DEFAULTS FOR A NEW AGENT before any row: Suggest, every tool on, a 700-token context, told when it took something', async () => {
  const { k, sql } = await record();
  const p = k.profileFor({ kind: 'codex', token: 't_9', host: 'MacBook' });
  assert.deepEqual(
    [p.id, p.by, p.ceiling, p.context, p.notify, p.enforce, toolOn(p, 'create')],
    ['default', 'default', 'propose', { budget: 700, lines: true }, { on: 'told', by: 'push' }, { hooks: true, channel: false }, true],
  );
  assert.deepEqual(k.profileFor({}), { ...DEFAULT_PROFILE, by: 'default' });
  sql.close();
});

test('THE NEAREST ROW WINS: the token, then the machine with the kind, then the kind, then Defaults', async () => {
  const { k, sql } = await record();
  const kind = value<Profile>(k.setProfile({ name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'write' }, 'p_1'));
  const host = value<Profile>(k.setProfile({ name: 'MacBook · Claude Code', match: { kind: 'claude', host: 'MacBook' }, ceiling: 'propose' }, 'p_1'));
  const token = value<Profile>(k.setProfile({ name: 'Claude on the runner', match: { token: 't_runner' }, ceiling: 'read' }, 'p_1'));
  const at = (who: Parameters<typeof k.profileFor>[0]) => {
    const p = k.profileFor(who);
    return [p.id, p.by];
  };
  assert.deepEqual(at({ kind: 'claude', token: 't_runner', host: 'MacBook' }), [token.id, 'token']);
  assert.deepEqual(at({ kind: 'claude', token: 't_1', host: 'MacBook' }), [host.id, 'host']);
  assert.deepEqual(at({ kind: 'claude', token: 't_1', host: 'Studio' }), [kind.id, 'kind']);
  assert.deepEqual(at({ kind: 'codex', token: 't_1', host: 'MacBook' }), ['default', 'default']);
  /* A ROW NAMING A KEY THE CALLER DID NOT SAY IS NO MATCH: the machine row does not apply to a caller naming none. */
  assert.deepEqual(at({ kind: 'claude' }), [kind.id, 'kind']);

  /* RETIRED, a row matches nothing, and the next nearest applies; brought back, it applies again. */
  value(k.setProfile({ id: host.id, retired: true }, 'p_1'));
  assert.deepEqual(at({ kind: 'claude', host: 'MacBook' }), [kind.id, 'kind']);
  assert.equal(k.agentProfiles().length, 2);
  assert.equal(k.agentProfiles(true).length, 3);
  value(k.setProfile({ id: host.id, retired: false }, 'p_1'));
  assert.deepEqual(at({ kind: 'claude', host: 'MacBook' }), [host.id, 'host']);
  sql.close();
});

test('ONLY A PERSON WRITES THEM, each change one line in the log, and a change that changes nothing writes nothing', async () => {
  const { k, sql } = await record();
  assert.equal(codeOf(k.setProfile({ name: 'Codex', match: { kind: 'codex' } }, 'S12')), 'NEEDS_BROWSER_SESSION');
  assert.equal(codeOf(k.setProfile({ name: 'Codex', match: { kind: 'codex' } }, 'system')), 'NEEDS_BROWSER_SESSION');
  const made = value<Profile>(k.setProfile({ name: 'Codex', match: { kind: 'codex' }, brief: 'Small diffs. Ask before a migration.' }, 'p_1'));
  value(k.setProfile({ id: made.id, ceiling: 'read', tools: { create: false } }, 'p_1'));
  value(k.setProfile({ id: made.id, ceiling: 'read' }, 'p_1'));
  const lines = sql
    .all<{ kind: string; actor: string; target: string; target_kind: string }>(
      "SELECT kind, actor, target, target_kind FROM event WHERE target_kind = 'agent_profile' ORDER BY rowid",
    )
    .map((r) => ({ ...r }));
  assert.deepEqual(lines, [
    { kind: 'create', actor: 'p_1', target: `agent_profile:${made.id}`, target_kind: 'agent_profile' },
    { kind: 'edit', actor: 'p_1', target: `agent_profile:${made.id}`, target_kind: 'agent_profile' },
  ]);
  const now = k.agentProfile(made.id)!;
  assert.deepEqual([now.ceiling, toolOn(now, 'create'), toolOn(now, 'get'), now.brief], ['read', false, true, 'Small diffs. Ask before a migration.']);

  /* DEFAULTS IS EDITED LIKE ANY ROW, and is never retired or matched on anything. */
  value(k.setProfile({ id: 'default', context: { budget: 400, lines: false } }, 'p_1'));
  assert.deepEqual(k.profileFor({ kind: 'cursor' }).context, { budget: 400, lines: false });
  assert.equal(codeOf(k.setProfile({ id: 'default', retired: true }, 'p_1')), 'FORBIDDEN');
  assert.equal(codeOf(k.setProfile({ id: 'default', match: { kind: 'claude' } }, 'p_1')), 'VALUE_MALFORMED');
  sql.close();
});

test('A ROW AS GIVEN IS CHECKED, and two rows never match the same agents', async () => {
  const { k, sql } = await record();
  value(k.setProfile({ name: 'Claude Code', match: { kind: 'claude' } }, 'p_1'));
  const cases: [Parameters<typeof k.setProfile>[0], string][] = [
    [{ name: 'Twice', match: { kind: 'claude' } }, 'UNIQUE_VIOLATION'],
    [{ name: 'Nothing', match: {} }, 'REQUIRED_MISSING'],
    [{ name: 'No match' }, 'REQUIRED_MISSING'],
    [{ name: 'Robot', match: { kind: 'robot' } }, 'ENUM_VALUE_UNKNOWN'],
    [{ name: 'Machine', match: { host: 'MacBook' } }, 'VALUE_MALFORMED'],
    [{ name: 'Codex', match: { kind: 'codex' }, ceiling: 'admin' as never }, 'ENUM_VALUE_UNKNOWN'],
    [{ name: 'Codex', match: { kind: 'codex' }, context: { budget: 900 as never, lines: true } }, 'VALUE_MALFORMED'],
    [{ name: 'Codex', match: { kind: 'codex' }, quiet: { from: '25:00', to: '07:00' } }, 'VALUE_MALFORMED'],
    [{ name: 'Codex', match: { kind: 'codex' }, caps: { jobs_day: -1 } }, 'OUT_OF_BOUNDS'],
    [{ name: 'Codex', match: { kind: 'codex' }, notify: { on: 'long', by: 'push' } }, 'OUT_OF_BOUNDS'],
    [{ name: 'Codex', match: { kind: 'codex' }, tools: { create: 'off' as never } }, 'VALUE_MALFORMED'],
    [{ id: 'nope', ceiling: 'read' }, 'ROW_UNKNOWN'],
  ];
  for (const [row, code] of cases) assert.equal(codeOf(k.setProfile(row, 'p_1')), code, JSON.stringify(row));
  assert.equal(k.agentProfiles().length, 1, 'a refused row was written');
  sql.close();
});

test('SETTINGS ONLY NARROW: what an agent may do is the narrower of its token and its row', () => {
  assert.equal(mayOf('write', 'propose'), 'propose');
  assert.equal(mayOf('propose', 'write'), 'propose');
  assert.equal(mayOf('read', 'write'), 'read');
  assert.equal(mayOf('write', 'write'), 'write');
});
