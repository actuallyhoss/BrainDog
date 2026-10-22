/**
 * Profile and machine on a run, through the record (migration 44): a run carries the Claude Code profile its headers
 * name, an instruction he aims at a machine or a profile reaches only the runs there, his composer is offered the
 * machines and profiles his runs are on, and a settings row may match a profile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

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

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

/** A token's call from one session in Portage's repository, on a machine and under a profile. */
const agent = (client: string, session: CallContext['session'] = {}): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client, ...session },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  clock.advance(MIN);
  return { api, sql, clock };
}

const opened = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext): Promise<string> =>
  value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;

test('AN INSTRUCTION AIMED AT A MACHINE AND A PROFILE reaches only the run that is both, and the composer is offered both', async () => {
  const { api, sql, clock } = await record();
  const harbour = agent('c-harbour', { seat: 'harbour' });
  const other = agent('c-default', { seat: 'default' });
  const studio = agent('c-studio', { seat: 'harbour', host: 'kiln-studio' });
  const runHarbour = await opened(api, harbour);
  await opened(api, other);
  await opened(api, studio);
  assert.equal(api.kernel.get(runHarbour)?.fields.seat, 'harbour');

  clock.advance(MIN);
  const told = value<{ id: string; machine: string | null; seat: string | null }>(
    await api.instruct({ said: 'Ship the invoice page', to: 'anyone', when: 'now', machine: 'kiln-mbp', seat: 'harbour' }, owner),
  );
  assert.deepEqual([told.machine, told.seat], ['kiln-mbp', 'harbour']);
  const pending = async (ctx: CallContext) => value<{ pending: { id: string }[] }>(await api.instructionsMine({}, ctx)).pending.map((i) => i.id);
  assert.deepEqual(await pending(harbour), [told.id]);
  assert.deepEqual(await pending(other), []);
  assert.deepEqual(await pending(studio), []);

  /* A NAME AND NEVER A FOLDER; and text, where text is asked. */
  assert.equal(refusal(await api.instruct({ said: 'x', seat: '/Users/teo/.claude-harbour' }, owner)).at, 'seat');
  assert.equal(refusal(await api.instruct({ said: 'x', machine: 7 } as never, owner)).at, 'machine');

  /* HIS COMPOSER IS OFFERED THE MACHINES AND PROFILES HIS RUNS ARE ON, newest heard first, and names only. */
  const list = value<{ places: { machines: string[]; seats: string[] } }>(await api.instructionList({}, owner));
  for (const machine of ['kiln-mbp', 'kiln-studio']) assert.ok(list.places.machines.includes(machine), machine);
  assert.deepEqual([...list.places.seats].sort(), ['default', 'harbour']);
  assert.ok([...list.places.machines, ...list.places.seats].every((n) => !n.includes('/')));
  sql.close();
});

test('A SESSION WITH NO RUN YET sees what waits for its machine and profile at start, and nothing aimed elsewhere', async () => {
  const { api, sql, clock } = await record();
  value(await api.instruct({ said: 'Read the brief first', to: 'agent', to_agent: 'claude', seat: 'harbour' }, owner));
  value(await api.instruct({ said: 'Only on the studio', to: 'agent', to_agent: 'claude', machine: 'kiln-studio' }, owner));
  clock.advance(MIN);
  const said = async (ctx: CallContext) => (value<{ told?: { said: string }[] }>(await api.context({}, ctx)).told ?? []).map((i) => i.said);
  assert.deepEqual(await said(agent('c-new', { seat: 'harbour' })), ['Read the brief first']);
  assert.deepEqual(await said(agent('c-elsewhere', { seat: 'default' })), []);
  sql.close();
});

test('A PULSE TEACHES A RUN ITS PROFILE ONCE, presence says it, and a settings row may match it', async () => {
  const { api, sql, clock } = await record();
  const ctx = agent('c-pulse');
  const run = await opened(api, ctx);
  assert.equal(api.kernel.get(run)?.fields.seat, undefined);
  clock.advance(MIN);
  value(await api.pulse({}, { ...ctx, session: { ...ctx.session, seat: 'garden' } }));
  assert.equal(api.kernel.get(run)?.fields.seat, 'garden');
  const rows = value<{ run: string; seat: string | null }[]>(await api.presence({}, owner));
  assert.equal(rows.find((r) => r.run === run)?.seat, 'garden');

  /* A ROW FOR CLAUDE CODE AS GARDEN applies to this run, and says where it was heard. */
  const row = value<{ id: string; seats: string[] }>(await api.setAgentProfile({ name: 'Claude Code as garden', match: { kind: 'claude', seat: 'garden' }, ceiling: 'read' }, owner));
  assert.deepEqual(row.seats, ['garden']);
  assert.equal(api.kernel.profileFor({ kind: 'claude', seat: 'garden' }).id, row.id);
  assert.equal(refusal(await api.setAgentProfile({ name: 'Bad', match: { kind: 'claude', seat: '~/.claude-garden' } }, owner)).at, 'match.seat');
  sql.close();
});
