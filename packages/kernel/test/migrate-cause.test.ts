/**
 * Migration 31, a question has a cause: the columns, the indexes, the trigger, and the data step that makes
 * one question of two.
 *
 * WHAT WAS MEASURED BEFORE THIS. On the owner's record SG89 and SG90 are the same question, filed seven seconds apart by
 * one run, and both were open: nothing could tell them apart from two questions, and nothing refused the second. A
 * decision could be rewritten by any statement that reached the table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { execScript } from '../src/migrate.ts';
import cause0031, { DECISION_KEPT, causeSteps } from '../src/migrations/0031_cause.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const AT = '2026-10-09T09:00:00.000Z';

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([TASKS]);
  assert.ok(out.ok, fixOf(out as never));
  return { k, sql };
}

let minted = 0;
const mint = (): string => `01JCAUSE${String(++minted).padStart(18, '0')}`;

/** A question as a record before this migration held it: no cause, and its words in its `suggest` line. */
function filed(sql: NodeSql, id: string, by: string, at: string, body: Record<string, unknown>, kind = 'rowset', words = 'Mark it done?'): void {
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, ?, ?, 'open', ?, ?)", id, kind, JSON.stringify(body), by, at);
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'suggest', ?, 'suggestion', ?)", mint(), at, by, `suggestion:${id}`, words);
}

const state = (sql: NodeSql, id: string) => ({ ...sql.one<{ status: string; resolved_as: string | null; cause: string | null }>('SELECT status, resolved_as, cause FROM suggestion WHERE id = ?', id) });
const DONE = { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { state: 'done' } }] };

test('SG89 AND SG90: the later of two identical questions a run filed closes as merged, and its line names the one kept', async () => {
  const { sql } = await record();
  filed(sql, 'SG89', 'S4', '2026-10-05T10:00:00.000Z', DONE);
  filed(sql, 'SG90', 'S4', '2026-10-05T10:00:07.000Z', { rows: [{ patch: { state: 'done' }, version: 1, at: 'tasks#1' }], register: 'tasks' });
  assert.deepEqual(causeSteps(sql, mint, AT), { caused: 1, merged: 1 });

  const kept = state(sql, 'SG89')!;
  assert.equal(kept.status, 'open');
  assert.match(kept.cause!, /^rowset#tasks#[0-9a-f]{24}$/);
  assert.deepEqual(state(sql, 'SG90'), { status: 'resolved', resolved_as: 'merged', cause: kept.cause });
  const line = sql.one<{ actor: string; to_v: string; note: string }>("SELECT actor, to_v, note FROM event WHERE target = 'suggestion:SG90' AND kind = 'resolve'");
  assert.deepEqual({ ...line }, { actor: 'system', to_v: 'merged', note: 'Merged into SG89: the same question, asked again.' });

  /* Once: the second time finds nothing to do. */
  assert.deepEqual(causeSteps(sql, mint, AT), { caused: 0, merged: 0 });
});

test('ONLY A RUN’S QUESTIONS ARE DERIVED, and two that differ stay two', async () => {
  const { sql } = await record();
  filed(sql, 'SG1', 'rule:chase', '2026-10-05T10:00:00.000Z', DONE);
  filed(sql, 'SG2', 'rule:chase', '2026-10-05T10:00:01.000Z', DONE);
  filed(sql, 'SG3', 'S2', '2026-10-05T10:00:02.000Z', DONE);
  filed(sql, 'SG4', 'S3', '2026-10-05T10:00:03.000Z', { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { state: 'open' } }] });
  const options = { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] };
  filed(sql, 'SG5', 'S2', '2026-10-05T10:00:04.000Z', options, 'options', 'Which first?');
  filed(sql, 'SG6', 'S3', '2026-10-05T10:00:05.000Z', options, 'options', 'Which FIRST');
  assert.deepEqual(causeSteps(sql, mint, AT), { caused: 3, merged: 1 });
  assert.equal(state(sql, 'SG1')!.cause, null);
  assert.equal(state(sql, 'SG2')!.status, 'open');
  assert.notEqual(state(sql, 'SG3')!.cause, state(sql, 'SG4')!.cause);
  assert.equal(state(sql, 'SG6')!.resolved_as, 'merged');
});

test('A CAUSE A BODY ALREADY CARRIES IS COPIED FIRST, and a second open one with it is merged rather than refused', async () => {
  const { sql } = await record();
  filed(sql, 'SG7', 'ingest:bank', '2026-10-05T10:00:00.000Z', { ...DONE, cause: 'bank#hsbc#7731' });
  filed(sql, 'SG8', 'ingest:bank', '2026-10-05T11:00:00.000Z', { ...DONE, cause: 'bank#hsbc#7731' });
  sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = 'SG7'");
  filed(sql, 'SG9', 'ingest:bank', '2026-10-05T12:00:00.000Z', { ...DONE, cause: 'bank#hsbc#7731' });
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG10', 'rowset', '--erased--', 'resolved', 'S1', '2026-10-01T00:00:00.000Z')");
  const rowids = sql.all('SELECT rowid, id FROM suggestion ORDER BY rowid');

  /* The migration's text again over itself, as `migrate.test.ts` rewinds it: the copy is the first step. */
  execScript(sql, cause0031);
  assert.deepEqual(sql.all('SELECT rowid, id FROM suggestion ORDER BY rowid'), rowids);
  assert.equal(state(sql, 'SG7')!.cause, 'bank#hsbc#7731');
  assert.equal(state(sql, 'SG8')!.cause, 'bank#hsbc#7731');
  assert.equal(state(sql, 'SG9')!.cause, null);
  assert.equal(state(sql, 'SG10')!.cause, null);

  assert.deepEqual(causeSteps(sql, mint, AT), { caused: 0, merged: 1 });
  assert.deepEqual(state(sql, 'SG9'), { status: 'resolved', resolved_as: 'merged', cause: 'bank#hsbc#7731' });
});

test('THE DATABASE REFUSES A SECOND OPEN QUESTION WITH ONE CAUSE, and a closed one may share it', async () => {
  const { sql } = await record();
  const insert = (id: string, status: string) =>
    sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, cause) VALUES (?, 'rowset', '{}', ?, 'S1', ?, 'invoice-totals')", id, status, AT);
  insert('SG1', 'open');
  insert('SG2', 'resolved');
  assert.throws(() => insert('SG3', 'open'), /UNIQUE/);
  const indexes = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('suggestion_cause_open', 'decision_cause') ORDER BY name");
  assert.deepEqual(indexes.map((r) => r.name), ['decision_cause', 'suggestion_cause_open']);
});

test('A DECISION IS NEVER REWRITTEN, but erasure still turns its words into tombstones, and it keeps the cause it settled', async () => {
  const { k, sql } = await record();
  causeSteps(sql, mint, AT);
  const asked = k.propose({ question: 'Which first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'A', because: 'a' }, { id: 'b', label: 'B', because: 'b' }] }, cause: 'which-first' }, 'p_owner');
  assert.ok(asked.ok, fixOf(asked as never));
  const decided = k.decide(asked.value.id, { decide: { option: 'a', reason: 'A is due first.' } }, 'p_owner');
  assert.ok(decided.ok, fixOf(decided as never));
  const id = (decided.value as { decision: string }).decision;
  assert.equal(sql.one<{ cause: string }>('SELECT cause FROM decision WHERE id = ?', id)?.cause, 'which-first');

  assert.throws(() => sql.exec("UPDATE decision SET answer = 'b' WHERE id = ?", id), new RegExp(DECISION_KEPT));
  assert.throws(() => sql.exec("UPDATE decision SET cause = NULL WHERE id = ?", id), new RegExp(DECISION_KEPT));
  sql.exec("UPDATE decision SET question = '--erased--', reason = '--erased--' WHERE id = ?", id);
  assert.equal(sql.one<{ reason: string }>('SELECT reason FROM decision WHERE id = ?', id)?.reason, '--erased--');

  /* And the copy fills a decision's cause from the question it settled, when that question's body carried one, as a
     bank message's does. */
  sql.exec("UPDATE suggestion SET body = json_set(body, '$.cause', 'which-first') WHERE id = ?", asked.value.id);
  execScript(sql, cause0031);
  assert.equal(sql.one<{ cause: string }>('SELECT cause FROM decision WHERE id = ?', id)?.cause, 'which-first');
});

test('A RECORD OPENS WITH THE TRIGGER, because the runner runs the data step after the migration', async () => {
  const { sql } = await record();
  assert.ok(sql.one("SELECT 1 AS y FROM sqlite_master WHERE type = 'trigger' AND name = 'decision_kept'"));
});

test('ERASURE ITSELF GOES THROUGH THE TRIGGER: the words of a decision that named the person become tombstones', async () => {
  const { k, sql } = await record();
  const asked = k.propose({ question: 'Call Mara Quill first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'Yes', because: 'a' }, { id: 'b', label: 'No', because: 'b' }] }, cause: 'call-first' }, 'p_owner');
  assert.ok(asked.ok, fixOf(asked as never));
  const decided = k.decide(asked.value.id, { decide: { option: 'a', reason: 'Mara Quill is due first.' } }, 'p_owner');
  assert.ok(decided.ok, fixOf(decided as never));
  const erased = await k.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request received 2026-10-05' }, 'p_owner');
  assert.ok(erased.ok, fixOf(erased as never));
  const row = sql.one<{ question: string; reason: string; cause: string }>('SELECT question, reason, cause FROM decision');
  assert.deepEqual({ ...row }, { question: '--erased--', reason: '--erased--', cause: 'call-first' });
  /* A cause may be tombstoned too, since a filer's can carry a name; nothing else may touch it. */
  sql.exec("UPDATE decision SET cause = '--erased--'");
  assert.throws(() => sql.exec("UPDATE decision SET cause = 'other'"), new RegExp(DECISION_KEPT));
});
