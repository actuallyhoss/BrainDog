/**
 * One poll, one request, several rows (the live feed add-on, `packs/live-feed`): a poll whose `map` is a list reads each
 * number out of the same answer, and a poll of an address that needs no key names none and runs without the vault.
 *
 * The host is a stand-in, so nothing leaves the machine and no key is real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type ActionAnswer, type ActionRequest, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 9);
const HOUR = 3_600_000;

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};

const measure = (name: string, path: string) => ({ name: { value: name }, value: { path, type: 'decimal' }, at: { arrived: true } });

const POLL = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.numbers',
  kind: 'ingest',
  body: {
    ingest: 'numbers',
    channel: 'poll',
    url: 'https://stats.example.test/v1/numbers.json',
    every: '1h',
    map: [measure('Revenue', 'data.mrr'), measure('Users', 'data.users'), measure('Sign-ups', 'data.signups')],
    writes: { register: 'points' },
    ...over,
  } as never,
});

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'northwind', name: 'Northwind', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  if (decls.length) {
    const out = await k.install([POINTS, ...decls]);
    assert.ok(out.ok, fixOf(out as Result<unknown>));
  }
  return { k, sql, clock };
}

const codeOf = (r: Result<unknown>): string => (r.ok ? 'accepted' : 'refusal' in r ? r.refusal.code : 'conflict');
const said = (body: string): ActionAnswer => ({ status: 200, body, bytes: body.length, ms: 4, requests: 1 });
const points = (sql: NodeSql) =>
  sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'points' AND deleted_at IS NULL ORDER BY rowid").map((r) => JSON.parse(r.fields) as Record<string, unknown>);

test('ONE REQUEST AN INTERVAL FILLS THREE ROWS FROM THREE PATHS, with no key named or sent', async () => {
  const { k, sql, clock } = await record(POLL());
  const seen: ActionRequest[] = [];
  const body = '{"data":{"mrr":4200.5,"users":128,"signups":9}}';
  const run = await k.runActions(async (request) => (seen.push(request), said(body)));
  assert.equal(seen.length, 1, 'one address is one request');
  assert.equal(seen[0]!.grant, null, 'a poll that names no key sends none');
  assert.deepEqual({ ran: run.ran, changed: run.changed, paused: run.paused }, { ran: 1, changed: 1, paused: 0 });
  const at = new Date(NOW).toISOString();
  assert.deepEqual(points(sql), [
    { name: 'Revenue', value: 4200.5, at },
    { name: 'Users', value: 128, at },
    { name: 'Sign-ups', value: 9, at },
  ]);

  /* The next interval is one request again, and a changed answer is three more rows. */
  clock.advance(2 * HOUR);
  await k.runActions(async (request) => (seen.push(request), said('{"data":{"mrr":4300,"users":130,"signups":11}}')));
  assert.equal(seen.length, 2);
  assert.equal(points(sql).length, 6);
});

test('A MAP IN THE LIST THAT READS NOTHING IS REVIEWED ON ITS OWN, and the others are written', async () => {
  const { k, sql } = await record(POLL());
  await k.runActions(async () => said('{"data":{"mrr":10,"users":2}}'));
  assert.deepEqual(points(sql).map((p) => p.name), ['Revenue', 'Users']);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM inbox_raw WHERE state = 'review'")?.n, 1);
});

test('A LIST OF MAPS IS HELD TO WHAT ONE MAP IS, and to its length; a named key is still held to its shape', async () => {
  const { k } = await record();
  const install = async (over: Record<string, unknown>) => codeOf(await k.install([POINTS, POLL(over)]));
  assert.equal(await install({ map: [] }), 'DECLARATION_INVALID');
  assert.equal(await install({ map: Array.from({ length: 21 }, (_, i) => measure(`m${i}`, 'data.x')) }), 'DECLARATION_INVALID');
  assert.equal(await install({ map: [measure('Revenue', 'data.mrr'), { value: { path: 'a..b', type: 'decimal' } }] }), 'PATH_INVALID');
  assert.equal(await install({ map: [measure('Revenue', 'data.mrr'), 'mrr'] }), 'DECLARATION_INVALID');
  assert.equal(await install({ grant: '' }), 'ACTION_GRANT_MISSING');
  assert.equal(await install({ url: 'http://stats.example.test/v1' }), 'ACTION_NOT_HTTPS');
  assert.equal(await install({ every: '1m' }), 'ACTION_INTERVAL_TOO_SHORT');
  /* A CALL STILL NAMES ITS KEY. */
  assert.equal(codeOf(await k.install([POINTS, { id: 'ingest.push', kind: 'ingest', body: { ingest: 'push', channel: 'call', url: 'https://hooks.example.test/in', every: '1h' } as never }])), 'ACTION_GRANT_MISSING');
  assert.equal(await install({}), 'accepted');
});

test('A POLL THAT NAMES A KEY THE VAULT DOES NOT HOLD STILL PAUSES, and sends nothing', async () => {
  const { k, sql } = await record(POLL({ grant: 'stats read' }));
  let sent = 0;
  const run = await k.runActions(async () => (sent++, said('{}')));
  assert.equal(sent, 0);
  assert.equal(run.ran, 0);
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'poll' AND key = 'numbers'")?.state, 'paused');
});
