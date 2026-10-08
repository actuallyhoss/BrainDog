/**
 * A run keeps how its work went (AGT-C04, the write path): how many writes it signed, when its current stretch began,
 * when its step was written, and the run that started it.
 *
 * All four are written in place, as the heartbeat is: no version, no `updated_at` and no line of their own, because the
 * record counting a run's work is not an edit anybody made. What they decide is asserted in `runs-end.test.ts`: whether
 * a session that closes leaves a step or ends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leftFreshStep, openRecord, type Declaration, type Entry, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([TASKS])).ok);
  return { k, sql, clock };
}

const as = (session: SessionHints, note?: string): WriteContext => ({
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session,
  ...(note === undefined ? {} : { note }),
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('A RUN COUNTS ITS WRITES IN PLACE: the write that opens it is its first, each after adds one, and the run row does not move', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'One' }, as({ client_id: 'cc-1' })));
  const opened = k.get('S1')!;
  assert.deepEqual([opened.fields.wrote, opened.fields.stretch_at], [1, iso(NOW)]);
  clock.advance(5 * MIN);
  value(k.create('tasks', { what: 'Two' }, as({ client_id: 'cc-1' })));
  value(k.update('tasks', 'tasks#1', { what: 'One, again' }, as({ client_id: 'cc-1' })));
  const after = k.get('S1')!;
  assert.equal(after.fields.wrote, 3);
  assert.equal(after.fields.stretch_at, iso(NOW), 'a write inside the stretch began another');
  assert.deepEqual([after.version, after.updated_at], [opened.version, opened.updated_at], 'counting moved the run row');
  sql.close();
});

test('A RUN OPENED FOR AN ATTACH HAS WRITTEN NOTHING: no stretch until its first write, and its attach is not counted', async () => {
  const { k, sql, clock } = await record();
  const attached = value<{ run: Entry; opened: boolean }>(k.runFor(as({ client_id: 'cc-2' }), 'opened: attach'));
  assert.equal(attached.opened, true);
  assert.deepEqual([attached.run.fields.wrote, attached.run.fields.stretch_at], [0, undefined]);
  /* Its own row, written as an attach, is who it is and not work. */
  value(k.update('session', 'S1', { doing: 'Wiring the rail' }, as({ client_id: 'cc-2' }, 'attached: claude')));
  assert.deepEqual([k.get('S1')!.fields.wrote, k.get('S1')!.fields.stretch_at], [0, undefined]);
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-2' })));
  assert.deepEqual([k.get('S1')!.fields.wrote, k.get('S1')!.fields.stretch_at], [1, iso(NOW + MIN)]);
  sql.close();
});

test('ITS STEP CARRIES WHEN IT WAS WRITTEN, and a run that comes back begins a new stretch, so the step it was handed is not fresh', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Work' }, as({ client_id: 'cc-3' })));
  clock.advance(10 * MIN);
  value(k.update('session', 'S1', { next: 'Run the gates' }, as({ client_id: 'cc-3' })));
  const left = k.get('S1')!;
  assert.equal(left.fields.next_at, iso(NOW + 10 * MIN));
  assert.equal(left.fields.wrote, 2, 'writing its own step is a write');
  assert.equal(leftFreshStep(left.fields), true);

  /* It leaves the step, and is resumed and worked in the next morning. */
  value(k.update('session', 'S1', { state: 'handoff' }, { actor: 'p_owner' }));
  clock.advance(14 * HOUR);
  value(k.create('tasks', { what: 'Resumed' }, as({ client_id: 'cc-3' })));
  const back = k.get('S1')!;
  assert.equal(back.state, 'active', 'a run that left a step and writes again is not working');
  assert.equal(back.fields.stretch_at, iso(NOW + 10 * MIN + 14 * HOUR));
  assert.equal(leftFreshStep(back.fields), false, 'the step from yesterday is still the one it leaves');

  /* Writing its step again makes it fresh, and a cleared step is a change of step too. */
  clock.advance(MIN);
  value(k.update('session', 'S1', { next: 'Run the gates again' }, as({ client_id: 'cc-3' })));
  assert.equal(leftFreshStep(k.get('S1')!.fields), true);
  sql.close();
});

test('A SUBAGENT KEEPS THE RUN THAT STARTED IT, which no caller can write or move', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'Main' }, as({ client_id: 'main' })));
  value(k.create('tasks', { what: 'Helping' }, as({ client_id: 'helper', parent: 'S1' })));
  assert.equal(k.get('S2')!.fields.parent, 'S1');
  /* A parent that is no run, or not a run's name, is no parent. */
  value(k.create('tasks', { what: 'Lost' }, as({ client_id: 'lost', parent: 'S99' })));
  value(k.create('tasks', { what: 'Odd' }, as({ client_id: 'odd', parent: 'tasks#1' })));
  assert.deepEqual([k.get('S3')!.fields.parent, k.get('S4')!.fields.parent], [undefined, undefined]);
  const moved = k.update('session', 'S2', { parent: 'S3' }, as({ client_id: 'helper' }));
  assert.equal(moved.ok, false);
  assert.equal(k.get('S2')!.fields.parent, 'S1');
  sql.close();
});
