/**
 * When the ladder arrives, existing write tokens keep what they were doing (research-trust-16-17, "Calls taken"), and
 * a token can say which app holds it.
 *
 * Before the ladder a write token wrote anything its scope let it, so starting every grant at Ask would have turned
 * yesterday's work into a wall of questions overnight. Migration 25 gives each live write token Do and tell on the
 * kinds it used in the last thirty days that are not on the floor, and nothing else: new grants, propose tokens and
 * every floor kind start at Ask.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { rungOf, seedLadder } from '../src/change-kind.ts';
import { applyMigrations } from '../src/migrate.ts';
import { openRecord, type Declaration, type WriteContext } from '../src/index.ts';
import { createToken, listTokens, verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 9);
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

const as = (token: string, client: string): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session: { client_id: client, host: 'h', repo: 'braindog' } });

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

const ladder = (sql: NodeSql) =>
  sql.all<{ agent: string; kind: string; rung: string }>('SELECT agent, kind, rung FROM ladder ORDER BY agent, kind').map((r) => ({ ...r }));

test('MIGRATION 25 KEEPS DO AND TELL FOR WHAT EACH WRITE TOKEN DID IN THE LAST THIRTY DAYS, and nothing on the floor', async () => {
  const sql = openSqlite();
  /* SIX WEEKS AGO, a write that is too old to count. */
  const old = await openRecord(sql, fixedClock(NOW - 42 * DAY));
  value(await old.install([TASKS]));
  for (const [id, scope] of [['t_write', 'write'], ['t_ask', 'propose'], ['t_gone', 'write']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES (?, 'p_owner', ?, ?, '2026-08-01T00:00:00.000Z')", id, `h${id}`, scope);
  value(old.create('tasks', { name: 'Long ago' }, as('t_write', 'old')));

  const k = await openRecord(sql, fixedClock(NOW - DAY));
  const made = value<{ id: string; version: number }>(k.create('tasks', { name: 'Ship' }, as('t_write', 'cc')));
  value(k.update('tasks', made.id, { state: 'done' }, { ...as('t_write', 'cc'), version: made.version }));
  value(k.create('tasks', { name: 'Paid', cost: { amount: 500, currency: 'GBP' } }, as('t_write', 'cc')));
  const gone = value<{ id: string; version: number }>(k.create('tasks', { name: 'Dropped' }, as('t_write', 'cc')));
  value(k.update('tasks', gone.id, { deleted_at: true }, { ...as('t_write', 'cc'), version: gone.version }));
  value(k.create('tasks', { name: 'From a revoked key' }, as('t_gone', 'cd')));
  sql.exec("UPDATE token SET revoked_at = '2026-10-05T00:00:00.000Z' WHERE id = 't_gone'");

  /* THE LEDGER REWOUND TO BEFORE 25, so the migration runs over a record that has history. */
  sql.exec('DROP TABLE ladder');
  sql.exec('DELETE FROM migration WHERE version >= 25');
  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result as never));
  assert.deepEqual(result.value.applied, [25]);

  /* ADDING AND MARKING DONE CARRY ON; the costed task (money) and the delete ask, and so does every other token. */
  assert.deepEqual(ladder(sql), [
    { agent: 't_write', kind: 'tasks:add', rung: 'tell' },
    { agent: 't_write', kind: 'tasks:move:done', rung: 'tell' },
  ]);
  assert.equal(rungOf(sql, 't_write', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: null }), 'tell');
  assert.equal(rungOf(sql, 't_write', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: 'money' }), 'ask');
  assert.equal(rungOf(sql, 't_ask', { key: 'tasks:add', list: 'tasks', verb: 'add', floor: null }), 'ask');

  /* AND IT IS ONCE: the owner's own change to a rung is not put back by another pass. */
  sql.exec("UPDATE ladder SET rung = 'ask' WHERE kind = 'tasks:add'");
  assert.equal(seedLadder(sql, NOW), 0);
  assert.equal(ladder(sql)[0]?.rung, 'ask');
  sql.close();
});

test('A TOKEN SAYS WHICH APP HOLDS IT, when its host said so, and a bad one is refused before anything is written', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  let n = 0;
  const deps: TokenDeps = {
    sql,
    nowMs: NOW,
    mint: () => `0${(n += 1).toString().padStart(4, '0')}`,
    recordId: () => 'rec_1',
    digest: async (text) => `h:${text}`,
    random: () => new Uint8Array(32).fill(n),
  };
  const client = { id: 'https://claude.ai/oauth/claude-code-client-metadata', kind: 'cimd' as const, host: 'claude.ai' };
  const minted = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'propose', label: 'Claude', client }));
  assert.deepEqual(value<{ client?: unknown }>(await verifyToken(deps, minted.bearer)).client, client);
  assert.deepEqual(listTokens(sql).find((t) => t.id === minted.id)?.client, client);

  /* ONE MINTED WITH NO APP SAYS NOTHING ABOUT ONE. */
  const bare = value<{ id: string; bearer: string }>(await createToken(deps, 'p_owner', { scope: 'read' }));
  assert.equal('client' in value<object>(await verifyToken(deps, bare.bearer)), false);

  const before = sql.all('SELECT id FROM token').length;
  const wrong = await createToken(deps, 'p_owner', { scope: 'read', client: { id: 'x', kind: 'oauth' as never, host: null } });
  assert.equal(wrong.ok, false);
  assert.equal(sql.all('SELECT id FROM token').length, before);
  sql.close();
});
