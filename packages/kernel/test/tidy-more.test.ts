/**
 * The two finders the first batch left out (AGT-C18 build 1): `questions-moot` and `faults-open`.
 *
 * WHAT WAS MEASURED BEFORE THIS. The tidy counted runs, steps and old questions, so "how good is braindog's mcp at
 * cleaning up stale stuff?" (D40.10) was answered without the two things most often stale on a record: a question that
 * no longer needs its person, and a fault still open. Both are counted here, and NEITHER ASKS OR CLOSES ANYTHING: the
 * hourly sweep's `recheck` is what closes a moot question, and a fault clears when its work goes through.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Sql } from '@braindog/ports';

import { RECHECK_BOUND, recheck } from '../src/cause.ts';
import { clearFault, openFaults, raiseFault } from '../src/fault.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { finderOf, finders, staleNow, tidy, tidyHour, type Finder, type TidyDeps } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

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

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: TidyDeps }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_1', 'p_owner', 'h1', 'propose', '2026-10-01T00:00:00.000Z')");
  for (const name of ['Ship', 'Test', 'Write up', 'Plan']) value(k.create('tasks', { name }, OWNER));
  const allocate = (name: string): number => {
    sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
    return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
  };
  return { k, sql, deps: { sql, nowMs: NOW, mint: ulids(() => NOW), allocate } };
}

/** An agent asks whether to mark these tasks done. */
const asked = (k: Kernel, question: string, ...at: string[]): string =>
  value<{ id: string }>(
    k.propose({ question, body_kind: 'rowset', body: { register: 'tasks', rows: at.map((a) => ({ at: a, version: 1, patch: { state: 'done' } })) } }, AGENT),
  ).id;

const found = (id: string, sql: Sql, nowMs = NOW) => {
  const finder = finderOf(id);
  assert.ok(finder, `no finder called ${id}`);
  return finder.find(sql, nowMs);
};
const n = (sql: NodeSql, query: string): number => Number(sql.one<{ n: number }>(query)?.n ?? 0);
const openQuestions = (sql: NodeSql): number => n(sql, "SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'");

test('the registry now holds eight finders, rows-same last, each with a name a person can read', () => {
  assert.deepEqual(
    finders().map((f) => f.id),
    ['runs-stopped', 'runs-empty', 'steps-old', 'questions-old', 'questions-moot', 'faults-open', 'keys-unopened', 'rows-same'],
  );
  assert.equal(finderOf('questions-moot')?.name, 'Questions that no longer need you');
  assert.equal(finderOf('faults-open')?.name, 'Faults still open');
  for (const f of finders()) {
    assert.equal(typeof f.name, 'string', f.id);
    assert.doesNotMatch(f.name ?? '', /—|#|\brows?\b|\bentit|SG\d|_/, f.id);
  }
});

test('questions-moot: counts the open questions already true or about deleted things, and none that still ask', async () => {
  const { k, sql } = await record();
  asked(k, 'Mark the first two done?', 'tasks#1', 'tasks#2');
  asked(k, 'Mark the third done?', 'tasks#3');
  asked(k, 'Mark the fourth done?', 'tasks#4');
  /* EVERY QUESTION STILL ASKS SOMETHING: nothing is counted. */
  assert.deepEqual(found('questions-moot', sql), { stale: 0, did: 0, ask: null });

  /* One made true by hand, one whose task is deleted, and one half true that still asks. */
  value(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  assert.equal(found('questions-moot', sql).stale, 0, 'half true is not moot');
  value(k.update('tasks', 'tasks#2', { state: 'done' }, OWNER));
  sql.exec("UPDATE entry SET deleted_at = '2026-10-13T08:00:00.000Z' WHERE register = 'tasks' AND seq = 3");
  assert.deepEqual(found('questions-moot', sql), { stale: 2, did: 0, ask: null });

  /* A choice between options is never moot, and a closed question is not counted. */
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG800', 'options', '{}', 'open', 'p_owner', ?)", iso(NOW - DAY));
  assert.equal(found('questions-moot', sql).stale, 2);
  sql.close();
});

test('questions-moot CLOSES NOTHING AND ASKS NOTHING: the sweep closes them, and the count then falls to none', async () => {
  const { k, sql, deps } = await record();
  const id = asked(k, 'Mark the first done?', 'tasks#1');
  value(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  const before = { open: openQuestions(sql), lines: n(sql, 'SELECT COUNT(*) AS n FROM event'), all: n(sql, 'SELECT COUNT(*) AS n FROM suggestion') };

  assert.equal(found('questions-moot', sql).stale, 1);
  const lines = sql.transactionSync(() => tidy(deps));
  assert.deepEqual(lines.find((l) => l.finder === 'questions-moot'), { finder: 'questions-moot', stale: 1, did: 0, asked: null });
  assert.deepEqual(lines.find((l) => l.finder === 'faults-open'), { finder: 'faults-open', stale: 0, did: 0, asked: null });
  sql.transactionSync(() => tidyHour(deps));
  assert.deepEqual(
    { open: openQuestions(sql), lines: n(sql, 'SELECT COUNT(*) AS n FROM event'), all: n(sql, 'SELECT COUNT(*) AS n FROM suggestion') },
    before,
    'a finder filed, closed or wrote something',
  );
  assert.equal(n(sql, "SELECT COUNT(*) AS n FROM suggestion WHERE cause IN ('tidy#questions-moot', 'tidy#faults-open')"), 0);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status, 'open');

  /* The sweep's own close is what clears it. `did` stays 0: this finder cleared nothing. */
  assert.deepEqual(sql.transactionSync(() => recheck(sql, NOW)).closed, [id]);
  assert.deepEqual(found('questions-moot', sql), { stale: 0, did: 0, ask: null });
  sql.close();
});

test('questions-moot reads at most the bound, and counts what the sweep would close this hour', async () => {
  const { k, sql } = await record();
  value(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  const body = JSON.stringify({ register: 'tasks', rows: [{ at: 'tasks#1', patch: { state: 'done' } }] });
  const total = RECHECK_BOUND + 30;
  for (let i = 0; i < total; i++)
    sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'rowset', ?, 'open', 'p_owner', ?)", `SG${900 + i}`, body, iso(NOW - DAY - i));
  let read = 0;
  const counting: Sql = {
    exec: (q, ...p) => sql.exec(q, ...p),
    all: (q, ...p) => {
      const rows = sql.all(q, ...p);
      if (/FROM suggestion/.test(q)) read += rows.length;
      return rows as never;
    },
    one: (q, ...p) => sql.one(q, ...p),
    transactionSync: (fn) => sql.transactionSync(fn),
  };
  assert.equal(found('questions-moot', counting).stale, RECHECK_BOUND);
  assert.ok(read <= RECHECK_BOUND, `read ${read} questions`);
  /* THE SAME ONES THE SWEEP WALKS: what it closes now is what was counted, and the rest are counted the hour after. */
  assert.equal(recheck(sql, NOW).closed.length, RECHECK_BOUND);
  assert.equal(found('questions-moot', sql, NOW + 3_600_000).stale, 30);
  sql.close();
});

test('faults-open: counts the faults open now, the unfiled ones too, and a cleared one no longer', async () => {
  const { sql } = await record();
  assert.deepEqual(found('faults-open', sql), { stale: 0, did: 0, ask: null });

  raiseFault(sql, 'outbox#notify.email', 'notify.email', 'refused', NOW - DAY);
  raiseFault(sql, 'outbox#notify.email', 'notify.email', 'refused', NOW - 3_600_000);
  raiseFault(sql, 'schedule#pull', 'pull', 'timed out', NOW - 2 * DAY);
  /* A job that died with no fault filed is a fault all the same (`openFaults`). */
  sql.exec("INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('o_1', ?, 'infer.embed', '{}', 'dead', 8)", iso(NOW - DAY));
  assert.equal(openFaults(sql).length, 3);
  assert.deepEqual(found('faults-open', sql), { stale: 3, did: 0, ask: null });

  /* IT CLEARS NOTHING: the faults are as they were after the count, and one cleared by its work is not counted. */
  assert.equal(openFaults(sql).length, 3);
  assert.equal(clearFault(sql, 'schedule#pull', NOW), true);
  assert.deepEqual(found('faults-open', sql), { stale: 2, did: 0, ask: null });
  assert.equal(found('faults-open', sql).stale, openFaults(sql).length);
  sql.close();
});

test('staleNow adds the two in, and a finder that throws does not take the others down', async () => {
  const { k, sql, deps } = await record();
  assert.equal(staleNow(sql, NOW), 0);
  asked(k, 'Mark the first done?', 'tasks#1');
  value(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  raiseFault(sql, 'schedule#pull', 'pull', 'timed out', NOW - DAY);
  raiseFault(sql, 'outbox#notify.email', 'notify.email', 'refused', NOW - DAY);
  assert.equal(staleNow(sql, NOW), 3);
  assert.equal(staleNow(sql, NOW, [finderOf('questions-moot')!]), 1);
  assert.equal(staleNow(sql, NOW, [finderOf('faults-open')!]), 2);

  const broken: Finder = {
    id: 'more-broken',
    find() {
      throw new Error('a finder that cannot count');
    },
  };
  assert.equal(staleNow(sql, NOW, [broken, ...finders()]), 3);
  assert.equal(staleNow(sql, NOW, [broken]), 0);
  /* The pass leaves the one that threw without a line and keeps every other. */
  const lines = sql.transactionSync(() => tidyHour(deps, [broken, ...finders()]));
  assert.deepEqual(lines.map((l) => l.finder), finders().map((f) => f.id));
  assert.equal(n(sql, "SELECT COUNT(*) AS n FROM tidy_line WHERE finder = 'more-broken'"), 0);

  /* A RECORD WITH NO FAULT TABLE (a bare database): faults-open cannot count, and the others still do. */
  sql.exec('DROP TABLE fault');
  assert.throws(() => found('faults-open', sql));
  assert.equal(staleNow(sql, NOW), 1);
  sql.close();
});
