/**
 * Who is live and who is working, by one clock (the record's part).
 *
 * On the owner's record an agent's start card listed six other sessions, four of them dead for hours, and the rail said
 * four were working beside runs last heard from two and four hours before. So `live` answers only runs heard from inside
 * `STALE_MS`, each with where it stands (`presence`), `boot`'s `working` is the runs active and not `isQuiet`, and the
 * rows themselves are never touched: a `list` of runs answers every run exactly as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUIET_MS, STALE_MS, type Entry } from '@braindog/kernel';

import { createRecordApi, type Boot, type CallContext, type LiveRun } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const HERE = { host: 'dev-mac', repo: 'braindog', agent: 'claude' };
const agent = (client_id: string, more: Record<string, string> = {}): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { ...HERE, client_id, ...more },
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * Five runs, opened in order and each last heard from at its own time before `NOW`: one working, one gone quiet past the
 * kernel's quiet mark, one silent past the stale mark (45 minutes and more), one resting, one that left a step.
 */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 2 * STALE_MS);
  const api = await createRecordApi({ sql, clock });
  const heardAt = async (client: string, at: number, more: Record<string, string> = {}) => {
    clock.set(at);
    value(await api.attach({ source: 'startup' }, agent(client, more)));
  };
  await heardAt('c-silent', NOW - STALE_MS - MIN, { doing: 'Gone for good' });
  await heardAt('c-quiet', NOW - QUIET_MS - MIN, { doing: 'Was reading' });
  await heardAt('c-resting', NOW - 5 * MIN);
  value(await api.handoff({ state: 'idle' }, agent('c-resting')));
  await heardAt('c-left', NOW - 4 * MIN);
  value(await api.handoff({ state: 'handoff', next: 'Run the refusal gates after the build' }, agent('c-left')));
  await heardAt('c-working', NOW - 2 * MIN, { doing: 'Wiring the rail' });
  clock.set(NOW);
  return { api, sql, clock };
}

test('LIVE LISTS NO RUN SILENT FOR 45 MINUTES, and each run it keeps says where it stands', async () => {
  const { api, sql } = await record();
  const live = value<LiveRun[]>(await api.sessionsLive(undefined, owner));
  const by = new Map(live.map((r) => [r.fields.client_id, r]));
  assert.equal(by.has('c-silent'), false, 'a run silent past the stale mark is still live');
  assert.ok(live.every((r) => !r.stale));
  assert.deepEqual(
    ['c-working', 'c-quiet', 'c-resting', 'c-left'].map((c) => by.get(c)?.presence),
    ['working', 'quiet', 'quiet', 'left'],
  );
  /* AND `boot`'S SESSIONS ARE THE SAME RUNS, since they are `live` held to the caller. */
  const boot = value<Boot>(await api.boot(owner));
  assert.deepEqual(boot.sessions.map((r) => r.spoken).sort(), live.map((r) => r.spoken).sort());
  sql.close();
});

test('WORKING IS ONE CLOCK: boot counts and lists only the run active and heard from inside the quiet mark', async () => {
  const { api, sql } = await record();
  const boot = value<Boot>(await api.boot(owner));
  assert.equal(boot.waits.working, 1);
  assert.deepEqual(
    boot.working.map((w) => [w.agent, w.doing]),
    [['claude', 'Wiring the rail']],
  );
  /* NAMED, NOT AN ID: the handle is there beside the agent, and no field carries a row id. */
  assert.match(boot.working[0]!.spoken, /^S\d+$/u);
  assert.equal(boot.working[0]!.project, null);
  sql.close();
});

test('A LIST OF RUNS LEAVES EVERY RUN ROW EXACTLY AS IT WAS', async () => {
  const { api, sql } = await record();
  const before = value<{ rows: Entry[] }>(await api.list({ register: 'session', limit: 50 }, owner)).rows;
  value(await api.sessionsLive(undefined, owner));
  value(await api.boot(owner));
  const after = value<{ rows: Entry[] }>(await api.list({ register: 'session', limit: 50 }, owner)).rows;
  assert.equal(after.length, 5, 'the silent run went from the list of runs too');
  assert.deepEqual(after, before);
  /* AND NO ROW CARRIES WHAT `live` WORKS OUT: presence is said when read, never written. */
  assert.ok(after.every((r) => !('presence' in r) && !('presence' in r.fields)));
  sql.close();
});

test('A CALLER WHO MAY NOT READ RUNS IS TOLD NOBODY IS WORKING', async () => {
  const { api, sql } = await record();
  /* A COLLEAGUE INVITED TO ONE LIST, which is not the runs. */
  const held: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'] };
  const boot = value<Boot>(await api.boot(held));
  assert.deepEqual([boot.working, boot.waits.working, boot.sessions], [[], 0, []]);
  sql.close();
});
