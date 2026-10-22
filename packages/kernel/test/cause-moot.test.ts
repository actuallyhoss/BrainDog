/**
 * A question already so is closed as moot within the hour (AGT-C08 job 2).
 *
 * WHAT WAS MEASURED BEFORE THIS. A question about rows the owner then changed by hand to the very values it asked for
 * stayed open until somebody pressed something ("how good is braindog's mcp at cleaning up stale stuff?").
 * `recheck` is what the hourly sweep runs: each open question that would change nothing is closed as `moot`, with a
 * sentence the owner reads, and the agent that asked is not counted against.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Sql } from '@braindog/ports';

import { MOOT_GONE, MOOT_HELD, RECHECK_BOUND, moot, recheck } from '../src/cause.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const LATER = NOW + 40 * 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    seq_prefix: 'T',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const AGENT: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'claude-1', host: 'h', repo: 'braindog' } };
const OWNER = { actor: 'p_owner' };

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_1', 'p_owner', 'h1', 'propose', '2026-10-01T00:00:00.000Z')");
  for (const name of ['Ship', 'Test', 'Write up', 'Plan']) value(k.create('tasks', { name }, OWNER));
  return { k, sql };
}

const done = (question: string, ...at: string[]) => ({
  question,
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: at.map((a) => ({ at: a, version: 1, patch: { state: 'done' } })) },
});

const asked = (k: Kernel, p: ReturnType<typeof done>): string => value<{ id: string }>(k.propose(p, AGENT)).id;
const state = (sql: NodeSql, id: string) => sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id);
const closing = (sql: NodeSql, id: string) =>
  sql.one<{ actor: string; to_v: string; note: string }>("SELECT actor, to_v, note FROM event WHERE kind = 'resolve' AND target = ?", `suggestion:${id}`);

test('A ROWSET THE OWNER MADE TRUE BY HAND CLOSES WITHIN THE HOUR, with its reason; a half-true one stays open', async () => {
  const { k, sql } = await record();
  const whole = asked(k, done('Mark the first two done?', 'tasks#1', 'T2'));
  const half = asked(k, done('Mark the last two done?', 'tasks#3', 'tasks#4'));
  for (const at of ['tasks#1', 'tasks#2', 'tasks#3']) value(k.update('tasks', at, { state: 'done' }, OWNER));

  const out = sql.transactionSync(() => recheck(sql, LATER, ulids(() => LATER)));
  assert.deepEqual(out.closed, [whole]);
  assert.deepEqual({ ...state(sql, whole) }, { status: 'resolved', resolved_as: 'moot' });
  assert.deepEqual({ ...closing(sql, whole) }, { actor: 'system', to_v: 'moot', note: 'This already says what was asked.' });
  assert.equal(MOOT_HELD, 'This already says what was asked.');
  assert.doesNotMatch(MOOT_HELD + MOOT_GONE, /—|\brows?\b|#|SG\d/);
  assert.deepEqual({ ...state(sql, half) }, { status: 'open', resolved_as: null });
  assert.equal(closing(sql, half), undefined);

  /* COUNTED ON NO BRAKE: no decision, nothing observed as wrong. And a second tick changes nothing. */
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM decision')?.n, 0);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM observation WHERE kind = 'suggestion.incorrect'")?.n, 0);
  assert.deepEqual(recheck(sql, LATER + 3_600_000).closed, []);

  /* The other half done by hand, the next hour closes it too. */
  value(k.update('tasks', 'tasks#4', { state: 'done' }, OWNER));
  assert.deepEqual(recheck(sql, LATER + 3_600_000).closed, [half]);
});

test('A ROWSET WHOSE ROWS ARE ALL DELETED IS MOOT, and says so; one with a row still there is not', async () => {
  const { k, sql } = await record();
  const gone = asked(k, done('Close these?', 'tasks#1', 'tasks#2'));
  const some = asked(k, done('Close those?', 'tasks#3', 'tasks#4'));
  sql.exec("UPDATE entry SET deleted_at = '2026-10-09T09:10:00.000Z' WHERE register = 'tasks' AND seq IN (1, 2, 3)");
  assert.deepEqual(recheck(sql, LATER).closed, [gone]);
  assert.equal(closing(sql, gone)?.note, MOOT_GONE);
  assert.equal(state(sql, some)?.status, 'open');
});

test('A DECLARATION, A PACK OR A SETTING ALREADY AS ASKED IS MOOT; a choice between options never is', async () => {
  const { sql } = await record();
  const live = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'register.tasks' AND superseded_at IS NULL")!.body;
  const as = (body_kind: string, body: unknown) => moot({ body_kind, body: JSON.stringify(body) }, sql);
  assert.equal(as('change', { declaration_id: 'register.tasks', to: { id: 'register.tasks', kind: 'register', body: JSON.parse(live) } }), true);
  assert.equal(as('change', { declaration_id: 'register.tasks', to: { declarations: [{ id: 'register.tasks', kind: 'register', body: JSON.parse(live) }] } }), true);
  assert.equal(as('change', { declaration_id: 'register.tasks', to: { id: 'register.tasks', kind: 'register', body: { ...JSON.parse(live), name: 'Jobs' } } }), false);
  assert.equal(as('change', { declaration_id: 'register.tasks', to: { add: [{ id: 'due', type: 'day' }] } }), false);

  const manifest = JSON.stringify({ id: 'money', config: { currency: { type: 'text' }, week_starts: { type: 'text' } }, config_values: { currency: 'GBP' } });
  sql.exec("INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('money', '1.0.0', 'local', ?, '2026-10-01T00:00:00.000Z', 'x')", manifest);
  assert.equal(as('pack', { install: 'money' }), true);
  assert.equal(as('pack', { enable: 'money' }), true);
  assert.equal(as('pack', { disable: 'money' }), false);
  assert.equal(as('pack', { install: 'people' }), false);
  assert.equal(as('settings', { pack: 'money', values: { currency: 'GBP', week_starts: null } }), true);
  assert.equal(as('settings', { pack: 'money', values: { currency: 'EUR' } }), false);
  assert.equal(as('settings', { pack: 'money', values: { undeclared: null } }), false);
  sql.exec("UPDATE pack SET disabled_at = '2026-10-02T00:00:00.000Z' WHERE id = 'money'");
  assert.equal(as('pack', { disable: 'money' }), true);
  assert.equal(as('pack', { enable: 'money' }), false);

  assert.equal(as('options', { options: [{ id: 'a' }, { id: 'b' }] }), false);
  assert.equal(moot({ body_kind: 'rowset', body: 'not json' }, sql), false);
});

test('THE WALK IS BOUNDED AND TURNS, with one JSON parameter for every close, never one a question', async () => {
  const { k, sql } = await record();
  value(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  /* Questions already true filed straight in, past the bound, as an old queue would hold them. */
  const body = JSON.stringify({ register: 'tasks', rows: [{ at: 'tasks#1', patch: { state: 'done' } }] });
  const n = RECHECK_BOUND + 30;
  for (let i = 0; i < n; i++)
    sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'rowset', ?, 'open', 'p_owner', ?)", `SG${900 + i}`, body, new Date(NOW - i).toISOString());
  let most = 0;
  const counting: Sql = {
    exec: (q, ...p) => ((most = Math.max(most, p.length)), sql.exec(q, ...p)),
    all: (q, ...p) => sql.all(q, ...p),
    one: (q, ...p) => sql.one(q, ...p),
    transactionSync: (fn) => sql.transactionSync(fn),
  };
  assert.equal(recheck(counting, LATER).closed.length, RECHECK_BOUND);
  assert.ok(most <= 2, `a statement took ${most} parameters`);
  assert.equal(recheck(counting, LATER + 3_600_000).closed.length, 30);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")?.n, 0);
});

test('THE HOURLY SWEEP RUNS IT: a question made true by hand is closed by the next tick, and the record signs the close', async () => {
  const { k, sql } = await record();
  const id = asked(k, done('Mark the first done?', 'T1'));
  value(k.update('tasks', 'T1', { state: 'done' }, OWNER));
  k.purge();
  assert.deepEqual({ ...state(sql, id) }, { status: 'resolved', resolved_as: 'moot' });
  assert.deepEqual({ ...closing(sql, id) }, { actor: 'system', to_v: 'moot', note: MOOT_HELD });
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM decision')?.n, 0);
});
