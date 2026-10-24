/**
 * The pulse and live presence, through the record (agents and MCP plan §2.3 C, §4.4, §8.2; W2-A).
 *
 * WHAT IS HELD: a pulse moves the run's `pulse_at` and nothing else, no version and no line in its history, opens no
 * run, and answers what the bridge's inbox file holds: the stamp, what is pending in his voice, and what stops the run;
 * the ids it says were shown are seen "on a prompt"; the same stamp is answered as nothing changed. `presence` reads
 * the sessions open now with where each is, its worktree, its helpers, its live word and how a stop reaches it, and a
 * session nobody has pulsed or heard from in two minutes is gone and not a row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hintsOf } from '../../host/src/session.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import type { PresenceRow, Pulse } from '../src/methods/agents.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
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

const agent = (client: string, session: CallContext['session'] = {}, kind = 'claude'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: kind, client_id: client, ...session },
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

type Api = Awaited<ReturnType<typeof record>>['api'];
const opened = async (api: Api, ctx: CallContext): Promise<string> => value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
const rowOf = (sql: NodeSql, spoken: string) =>
  sql.one<{ id: string; version: number; fields: string }>("SELECT id, version, fields FROM entry WHERE register = 'session' AND seq = ?", Number(spoken.slice(1)))!;
const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

test('A PULSE IS NOT A WRITE: pulse_at moves, the version and the history stay, and no run is opened', async () => {
  const { api, sql, clock } = await record();
  const runs = (): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n;
  const seeded = runs();
  assert.deepEqual(value<Pulse>(await api.pulse({}, agent('c-none'))), { run: null, stamp: null, changed: false, pending: [], stop: null, lines: [] });
  assert.equal(runs(), seeded, 'a pulse opened a run');

  const ctx = agent('c-pulse');
  const run = await opened(api, ctx);
  const was = rowOf(sql, run);
  const before = lines(sql, was.id);
  clock.advance(30_000);
  const first = value<Pulse>(await api.pulse({}, ctx));
  assert.equal(first.run, run);
  const now = rowOf(sql, run);
  assert.equal((JSON.parse(now.fields) as { pulse_at?: string }).pulse_at, new Date(clock.now()).toISOString());
  assert.deepEqual([now.version, lines(sql, now.id)], [was.version, before]);

  /* THE SAME STAMP IS NOTHING NEW. */
  clock.advance(15_000);
  const again = value<Pulse>(await api.pulse({ stamp: first.stamp! }, ctx));
  assert.deepEqual([again.changed, again.lines], [false, []]);

  assert.equal(refusal(await api.pulse({ shown: 'IN1' } as never, ctx)).at, 'shown');
  assert.equal(refusal(await api.pulse({ how: 'telepathy' } as never, ctx)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(await api.pulse({ extra: 1 } as never, ctx)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.pulse({}, owner)).code, 'FORBIDDEN');
  sql.close();
});

test('A PULSE HEARS WHAT HE SAID: pending in his voice, new lines once, shown ids seen on a prompt, and a stop', async () => {
  const { api, sql, clock } = await record();
  const ctx = agent('c-hear');
  const run = await opened(api, ctx);
  const quiet = value<Pulse>(await api.pulse({}, ctx));
  value(await api.instruct({ said: 'Look at the bounce numbers', project: 'Portage', when: 'now' }, owner));
  clock.advance(15_000);
  const heard = value<Pulse>(await api.pulse({ stamp: quiet.stamp! }, ctx));
  assert.equal(heard.changed, true);
  assert.deepEqual(heard.pending.map((i) => [i.id, i.kind, i.to]), [['IN1', 'tell', 'anyone']]);
  assert.match(heard.lines[0]!, /^Teodor said in BrainDog \(IN1\): "Look at the bounce numbers"\./u);

  clock.advance(15_000);
  value(await api.pulse({ stamp: heard.stamp!, shown: ['IN1'] }, ctx));
  const thread = value<{ rows: { id: string; state: string; seen_how: string | null; seen: { run: string; how: string }[] }[] }>(await api.instructionList({}, owner));
  assert.deepEqual([thread.rows[0]!.state, thread.rows[0]!.seen_how, thread.rows[0]!.seen.map((s) => [s.run, s.how])], ['seen', 'prompt', [[run, 'prompt']]]);

  value(await api.instruct({ said: 'Stop now', kind: 'stop', to_run: run }, owner));
  clock.advance(15_000);
  const stopped = value<Pulse>(await api.pulse({ stamp: heard.stamp! }, ctx));
  assert.deepEqual(stopped.stop && [stopped.stop.kind, stopped.stop.id], ['stop', 'IN2']);
  assert.match(stopped.lines[0]!, /^Teodor stopped this run in BrainDog \(IN2\): "Stop now"\. Reply with instructions, then end\.$/u);
  sql.close();
});

test('PRESENCE READS WHO IS HERE NOW: place, worktree, helpers, the live word and how a stop reaches it', async () => {
  const { api, sql, clock } = await record();
  /* THE HOST HANDS THE WORKTREE ON, held to its grammar: a folder's name, never a path. */
  assert.deepEqual(hintsOf({ worktree: 'builder-2', repo: 'portage' }), { repo: 'portage', worktree: 'builder-2' });
  assert.deepEqual(hintsOf({ worktree: '../etc' }), {});

  const lead = agent('c-lead');
  const leadRun = await opened(api, lead);
  const helper = agent('c-helper', { parent: leadRun, worktree: 'builder-2', branch: 'w2-a' });
  const helperRun = await opened(api, helper);
  const codex = agent('c-codex', { repo: 'kiln-type' }, 'codex');
  const codexRun = await opened(api, codex);

  const rows = value<PresenceRow[]>(await api.presence({}, owner));
  const by = new Map(rows.map((r) => [r.run, r]));
  assert.deepEqual(by.get(leadRun)?.helpers, [helperRun]);
  assert.equal(by.get(helperRun)?.worktree, 'builder-2');
  assert.equal(by.get(helperRun)?.parent, leadRun);
  assert.equal(by.get(leadRun)?.state, 'working');
  assert.equal(by.get(leadRun)?.reach, 'hooks');
  assert.equal(by.get(codexRun)?.reach, 'next_call');
  assert.equal(by.get(leadRun)?.machine, 'kiln-mbp');

  /* ONE PLACE, BY ITS REPOSITORY. */
  const there = value<PresenceRow[]>(await api.presence({ repo: 'kiln-type' }, owner));
  assert.ok(there.some((r) => r.run === codexRun) && there.every((r) => r.repo === 'kiln-type'), JSON.stringify(there.map((r) => [r.run, r.repo])));

  /* OPEN AND PULSED, NO CALL IN FIVE MINUTES, IS THINKING; NOTHING HEARD FOR TWO MINUTES IS GONE. */
  clock.advance(5 * MIN);
  value(await api.pulse({}, lead));
  const later = new Map(value<PresenceRow[]>(await api.presence({}, owner)).map((r) => [r.run, r]));
  assert.equal(later.get(leadRun)?.state, 'thinking');
  value(await api.pulse({}, codex));
  clock.advance(3 * MIN);
  value(await api.pulse({}, lead));
  const gone = new Set(value<PresenceRow[]>(await api.presence({}, owner)).map((r) => r.run));
  assert.ok(gone.has(leadRun));
  assert.ok(!gone.has(codexRun), 'a run nobody pulsed for three minutes is still a row');

  /* A STOP IS ON THE ROW. */
  value(await api.instruct({ said: 'Wait', kind: 'pause', to_run: leadRun }, owner));
  assert.equal(new Map(value<PresenceRow[]>(await api.presence({}, owner)).map((r) => [r.run, r])).get(leadRun)?.stopped, 'pause');

  assert.equal(refusal(await api.presence({ wat: 1 } as never, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.presence({}, { ...lead, registers: ['tasks'] })).code, 'FORBIDDEN');
  sql.close();
});

test('A RESUMED RUN COUNTS ITS TIME FROM THE RESUME: twelve hours after it stopped, it is at it for minutes', async () => {
  const { api, sql, clock } = await record();
  const ctx = agent('c-resume');
  const run = await opened(api, ctx);
  clock.advance(20 * MIN);
  value(await api.handoff({ state: 'idle', doing: 'Working' }, ctx));
  clock.advance(12 * 60 * MIN);
  value(await api.attach({ source: 'resume' }, ctx));
  clock.advance(5 * MIN);
  value(await api.pulse({}, ctx));
  const row = value<PresenceRow[]>(await api.presence({}, owner)).find((r) => r.run === run);
  assert.ok(row, 'the resumed run is not a row');
  assert.equal(row.for_s, 5 * 60, `for ${String(row.for_s)} s, counted from when it first opened`);
  sql.close();
});

test('A SESSION LEFT OPEN AND SILENT FOR HOURS that calls again is at it from that call, not from when it opened', async () => {
  const { api, sql, clock } = await record();
  const ctx = agent('c-open');
  const run = await opened(api, ctx);
  value(await api.beat({}, ctx));
  /* OPEN ALL AFTERNOON, ITS BRIDGE PULSING, AND NO CALL. */
  clock.advance(5 * 60 * MIN);
  value(await api.pulse({}, ctx));
  value(await api.beat({}, ctx));
  clock.advance(10 * MIN);
  value(await api.pulse({}, ctx));
  value(await api.beat({}, ctx));
  const row = value<PresenceRow[]>(await api.presence({}, owner)).find((r) => r.run === run);
  assert.ok(row, 'the open run is not a row');
  assert.equal(row.for_s, 10 * 60, `for ${String(row.for_s)} s, counted from when it opened five hours ago`);
  sql.close();
});
