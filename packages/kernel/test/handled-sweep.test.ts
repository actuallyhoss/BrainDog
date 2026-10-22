/**
 * What already waits and is small settles itself on the next sweep (measured live on 20 Oct: "small reversible
 * questions settle themselves: none did", with 71 open on the owner's record).
 *
 * THE KINDS SEEN LIVE: an agent's "last seen" change to a tool, asked again and again as the day moved on; an agent's
 * "Mark … done?"; and older questions a newer one asks again. The hourly sweep closes each one asked again as moot,
 * answers what is left and small as `rule:handled`, one Undo on each, and leaves alone money, a run that read outside
 * text, another person's agent, a question younger than an hour, and a record that turned it off.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { HANDLED_PREF, HANDLED_RULE, SETTLE_AFTER_MS, SUPERSEDED } from '../src/govern.ts';
import type { Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);
const HOUR = 3_600_000;

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

const TOOLS: Declaration = {
  id: 'register.tools',
  kind: 'register',
  body: {
    id: 'tools',
    name: 'Tools',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'last_seen', type: 'day' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};

/** The owner's own Claude Code, on a write grant, as its host hands a call over. */
const MINE: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_mine' }, session: { client_id: 'cc-1', host: 'mac', repo: 'braindog' } };
/** Ada's agent: a member's grant on the same record. */
const ADAS: WriteContext = { actor: 'p_ada', principal: { kind: 'token', token: 't_ada' }, session: { client_id: 'cc-2', host: 'pc', repo: 'braindog' } };

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock>; run: string; adas: string }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 3 * HOUR);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS, TOOLS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_ada', 'ada@studio.test', 'Ada')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ada', 'tasks', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_mine', 'p_owner', 'h1', 'write', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, created_at) VALUES ('t_ada', 'p_ada', 'h2', 'write', '2026-10-01T00:00:00.000Z')");
  /* THE OWNER'S ROWS, made by his own agent, as the import made most of his. */
  for (const name of ['Ship', 'Test', 'Pay']) value(k.create('tasks', { name }, MINE));
  for (const name of ['posthog', 'figma']) value(k.create('tools', { name, last_seen: '2026-10-10' }, MINE));
  value(k.create('tasks', { name: 'Ada task' }, ADAS));
  const runOf = (token: string): string => {
    const seq = sql.one<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' AND json_extract(fields, '$.token_id') = ?", token)!.seq;
    return `S${seq}`;
  };
  return { k, sql, clock, run: runOf('t_mine'), adas: runOf('t_ada') };
}

const rowset = (question: string, register: string, at: string, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  question,
  body_kind: 'rowset' as const,
  body: { register, rows: [{ at, version: 1, patch }], ...extra },
});

const status = (sql: NodeSql, id: string) => sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id);
const fields = (sql: NodeSql, at: string) => {
  const [register, seq] = at.split('#');
  return JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND seq = ?', register!, Number(seq))!.fields) as Record<string, unknown>;
};

test('ON THE NEXT SWEEP, A QUESTION ASKED AGAIN CLOSES AND WHAT IS LEFT AND SMALL SETTLES, each with its Undo', async () => {
  const { k, sql, clock, run } = await record();
  /* THREE "LAST SEEN" OF ONE TOOL, a day apart, then one of the other; and "Mark Ship done?". All his agent's, all open. */
  const seen = ['2026-10-17', '2026-10-18', '2026-10-19'].map((day) =>
    value<Filed>(k.propose(rowset('Change the last seen of posthog?', 'tools', 'tools#1', { last_seen: day }), run)).id,
  );
  const figma = value<Filed>(k.propose(rowset('Change the last seen of figma?', 'tools', 'tools#2', { last_seen: '2026-10-19' }), run)).id;
  const done = value<Filed>(k.propose(rowset('Mark Ship done?', 'tasks', 'tasks#1', { state: 'done' }), run)).id;
  for (const id of [...seen, figma, done]) assert.equal(status(sql, id)?.status, 'open', 'filed by an agent, it asks first');

  clock.set(NOW);
  k.purge();

  /* THE TWO OLDER "LAST SEEN" ARE ASKED AGAIN BY THE NEWEST, so they close as moot, with the line that says so. */
  for (const id of seen.slice(0, 2)) {
    assert.deepEqual({ ...status(sql, id) }, { status: 'resolved', resolved_as: 'moot' });
    assert.equal(sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'resolve'", `suggestion:${id}`)?.note, SUPERSEDED);
  }
  /* AND THE NEWEST, FIGMA'S AND THE DONE ARE ANSWERED BY BRAINDOG'S RULE, each a decision of its own. */
  for (const id of [seen[2]!, figma, done]) assert.deepEqual({ ...status(sql, id) }, { status: 'resolved', resolved_as: 'addressed' });
  assert.equal(fields(sql, 'tools#1').last_seen, '2026-10-19');
  assert.equal(fields(sql, 'tools#2').last_seen, '2026-10-19');
  assert.equal(fields(sql, 'tasks#1').state, 'done');
  const decisions = sql.all<{ id: string; decided_by: string }>('SELECT id, decided_by FROM decision ORDER BY rowid');
  assert.equal(decisions.length, 3);
  assert.ok(decisions.every((d) => d.decided_by === HANDLED_RULE));

  /* ONE UNDO PUTS ONE BACK, as from the Handled list. */
  const last = decisions.at(-1)!.id;
  const plan = value<{ hash: string; steps: unknown[] }>(k.undoPlan({ decision: last }));
  value(k.undoApply({ decision: last }, plan.hash, 'p_owner'));
  assert.equal(fields(sql, 'tasks#1').state, 'open');
  sql.close();
});

test('MONEY, OUTSIDE TEXT, ANOTHER PERSON\'S AGENT AND A QUESTION UNDER AN HOUR OLD STILL WAIT', async () => {
  const { k, sql, clock, run, adas } = await record();
  const money = value<Filed>(k.propose(rowset('Change the cost of Pay?', 'tasks', 'tasks#3', { cost: { amount: 1200, currency: 'GBP' } }), run)).id;
  const outside = value<Filed>(
    k.propose(rowset('Mark Test done?', 'tasks', 'tasks#2', { state: 'done' }, { context: 'This run read the inbox, so its changes ask for the rest of it.', outside: true }), run),
  ).id;
  const member = value<Filed>(k.propose(rowset('Mark Ada task done?', 'tasks', 'tasks#4', { state: 'done' }), adas)).id;
  clock.set(NOW - HOUR / 2);
  const fresh = value<Filed>(k.propose(rowset('Change the last seen of figma?', 'tools', 'tools#2', { last_seen: '2026-10-20' }), run)).id;
  clock.set(NOW);
  k.purge();
  for (const id of [money, outside, member, fresh]) assert.equal(status(sql, id)?.status, 'open', id);
  assert.equal(sql.all('SELECT id FROM decision').length, 0);

  /* AND AN HOUR AFTER IT WAS FILED, THE FRESH ONE SETTLES TOO. */
  clock.set(NOW + SETTLE_AFTER_MS);
  k.purge();
  assert.equal(status(sql, fresh)?.status, 'resolved');
  for (const id of [money, outside, member]) assert.equal(status(sql, id)?.status, 'open', id);
  sql.close();
});

test('A RECORD THAT TURNED IT OFF KEEPS EVERY QUESTION, asked again or not', async () => {
  const { k, sql, clock, run } = await record();
  sql.exec('INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)', HANDLED_PREF.holder, HANDLED_PREF.key, 'false', '2026-10-20T00:00:00.000Z');
  const a = value<Filed>(k.propose(rowset('Change the last seen of posthog?', 'tools', 'tools#1', { last_seen: '2026-10-18' }), run)).id;
  const b = value<Filed>(k.propose(rowset('Change the last seen of posthog?', 'tools', 'tools#1', { last_seen: '2026-10-19' }), run)).id;
  clock.set(NOW);
  k.purge();
  for (const id of [a, b]) assert.equal(status(sql, id)?.status, 'open');
  sql.close();
});
