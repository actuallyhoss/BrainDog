/**
 * `doorHealth`: every connection, its app, build and last tool call, and the agent door's seven signs (AGT-A02).
 *
 * WHAT IS ASSERTED IS EACH SIGN AT THE EDGE IT EXISTS FOR: a key that opened a run today and called no tool is the week
 * his record had no tools; a key whose command never said a build reads `behind: null`, not 0, because nothing was
 * judged; a key not used in a month counts as silent; and a command built a week before `min_cli` reads 7 days behind.
 * The guard is the owner's in a browser, so a token is refused in the usual sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { openRecord } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type DoorBuild, type DoorHealth } from '../src/methods/door.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (token: string): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: `c-${token}`, agent: 'claude', host: 'studio-mac', client: 'claude-code', client_version: '2.1.4' },
});

const ok = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(r));
  return out.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const mint = async (label: string, days?: number) =>
    ok<{ id: string }>(await api.createToken({ scope: 'write', label, ...(days === undefined ? {} : { days }) }, owner)).id;
  return { api, sql, mint };
}

/** `doorHealth` through `door.ts` with the host's build handed in, as the host hands it once it is wired. */
async function withBuild(sql: NodeSql, doorBuild: DoorBuild) {
  const kernel = await openRecord(sql, fixedClock(NOW));
  const deps = { kernel, sql, no, clock: fixedClock(NOW), admin: () => null, scoped: () => null, doorBuild } as unknown as RecordDeps;
  return ok<DoorHealth>(await methods(deps).doorHealth({}, owner));
}

test('A FRESH RECORD HAS NO CONNECTION, and every sign with nothing to judge reads null rather than green', async () => {
  const { api, sql } = await record();
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.deepEqual(health.connections, []);
  assert.deepEqual(health.signs, { delivered: null, behind: null, ending: 0, silent: 0, door_used: null, runners_listening: null, jobs_lost_7d: 0 });
  assert.equal(health.min_cli, null);
  sql.close();
});

test('A TOKEN IS REFUSED: the door’s health is the owner’s, in a browser', async () => {
  const { api, sql, mint } = await record();
  const id = await mint('an agent');
  const out = (await api.doorHealth({}, agent(id))) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

test('A MEMBER WHO IS NOT THE OWNER IS REFUSED, in the ladder’s sentence, even in a browser', async () => {
  const { api, sql } = await record();
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'decide' } };
  const out = (await api.doorHealth({}, member)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'LEVEL_REQUIRED');
  assert.equal(out.refusal?.fix, 'This needs owner, and you have decide access. Ask an owner to raise your access.');
  sql.close();
});

test('A KEY WITH NO BUILD READS BEHIND NULL, and a run today with no tool call reads delivered red', async () => {
  const { api, sql, mint } = await record();
  const id = await mint('Studio Mac');
  ok(await api.attach({ source: 'startup' }, agent(id)));
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.equal(health.connections.length, 1);
  const [mac] = health.connections;
  assert.equal(mac!.app, 'claude-code');
  assert.equal(mac!.app_version, '2.1.4');
  assert.equal(mac!.where, 'Studio Mac');
  assert.equal(mac!.cli_build, null);
  assert.equal(mac!.behind, null);
  assert.equal(mac!.runs_7d, 1);
  assert.equal(health.signs.behind, null);
  assert.equal(health.signs.delivered, 1, 'a run that called no tool read green');

  /* A tool call after the run began turns it green. */
  sql.exec('UPDATE token SET last_tool_at = ? WHERE id = ?', iso(NOW), id);
  assert.equal(ok<DoorHealth>(await api.doorHealth({}, owner)).signs.delivered, 0);
  sql.close();
});

test('A KEY NOT USED IN A MONTH COUNTS AS SILENT, and one that ends within 14 days as ending', async () => {
  const { api, sql, mint } = await record();
  const quiet = await mint('Old laptop');
  sql.exec('UPDATE token SET created_at = ?, last_used_at = ? WHERE id = ?', iso(NOW - 60 * DAY), iso(NOW - 31 * DAY), quiet);
  await mint('Short one', 10);
  const signs = ok<DoorHealth>(await api.doorHealth({}, owner)).signs;
  assert.equal(signs.silent, 1);
  assert.equal(signs.ending, 1);
  sql.close();
});

test('A COMMAND BUILT A WEEK BEFORE MIN_CLI READS 7 DAYS BEHIND, and a checkout’s build is not judged', async () => {
  const { sql, mint } = await record();
  const old = await mint('Old build');
  const fresh = await mint('New build');
  const checkout = await mint('Checkout');
  sql.exec('UPDATE token SET last_build = ? WHERE id = ?', '2026.10.02+1a2b3c4', old);
  sql.exec('UPDATE token SET last_build = ? WHERE id = ?', '2026.10.09+5d6e7f8', fresh);
  sql.exec('UPDATE token SET last_build = ? WHERE id = ?', 'dev+9a8b7c6', checkout);
  const health = await withBuild(sql, { host_build: '2026.10.09+5d6e7f8', min_cli: '2026.10.09' });
  const by = new Map(health.connections.map((c) => [c.where, c.behind]));
  assert.equal(by.get('Old build'), 7);
  assert.equal(by.get('New build'), 0);
  assert.equal(by.get('Checkout'), null);
  assert.equal(health.signs.behind, 1);
  assert.equal(health.min_cli, '2026.10.09');
  sql.close();
});

test('A RUNNER HEARD FROM 20 SECONDS AGO IS LISTENING, one silent for a minute is not, and a lost job counts', async () => {
  const { api, sql } = await record();
  const grant = (id: string, used: number) =>
    sql.exec(
      "INSERT INTO device_grant (id, code_hash, status, reach, label, expires, approved_by, approved_at, last_used) VALUES (?, 'x', 'active', 'runner', ?, ?, 'p_1', ?, ?)",
      id, `Runner ${id}`, iso(NOW + 30 * DAY), iso(NOW - DAY), iso(used),
    );
  grant('a', NOW - 20_000);
  grant('b', NOW - 60_000);
  sql.exec(
    "INSERT INTO job (id, kind, args, status, runner_id, claimed_at, lease_until, created_at, expires) VALUES ('j1', 'triage', '{}', 'claimed', 'a', ?, ?, ?, ?)",
    iso(NOW - 3600_000), iso(NOW - 60_000), iso(NOW - 3600_000), iso(NOW + DAY),
  );
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.equal(health.signs.runners_listening, 1);
  assert.equal(health.signs.jobs_lost_7d, 1);
  assert.equal(health.connections.filter((c) => c.kind === 'runner').length, 2);
  sql.close();
});

test('A KEY AND A RUNNER THE OPERATOR’S CUT-OFF ENDED ARE NOT CONNECTIONS, once the host hands the cut-off in', async () => {
  const { sql, mint } = await record();
  const before = await mint('Before the cut-off');
  sql.exec('UPDATE token SET created_at = ? WHERE id = ?', iso(NOW - 2 * DAY), before);
  await mint('After the cut-off');
  sql.exec(
    "INSERT INTO device_grant (id, code_hash, status, reach, label, expires, approved_by, approved_at, last_used) VALUES ('r', 'x', 'active', 'runner', 'Old runner', ?, 'p_1', ?, ?)",
    iso(NOW + 30 * DAY), iso(NOW - 2 * DAY), iso(NOW - 5_000),
  );
  const kernel = await openRecord(sql, fixedClock(NOW));
  const deps = { kernel, sql, no, clock: fixedClock(NOW), admin: () => null, scoped: () => null, validFrom: () => iso(NOW - DAY) } as unknown as RecordDeps;
  const health = ok<DoorHealth>(await methods(deps).doorHealth({}, owner));
  assert.deepEqual(health.connections.map((c) => c.where), ['After the cut-off']);
  assert.equal(health.signs.runners_listening, null);
  sql.close();
});
