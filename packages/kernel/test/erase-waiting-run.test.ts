/**
 * An erasure against a rule's run that is still waiting, handed the subject by what started it.
 *
 * WHAT IS PINNED: a run waiting out an hour after a question was decided for a person keeps its trigger, and the step
 * after the wait fills its words from it. Erased in between, the run is stopped and its trigger loses the name, so
 * nothing written after the erasure names the person again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;
const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const AFTER: Declaration = {
  id: 'rule.after',
  kind: 'rule',
  body: { rule: 'after', on: { decided: {} }, steps: [{ wait: '1h' }, { notify: { say: 'Picked: {{trigger.option}}' } }] } as never,
};
const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

test('A RUN WAITING WITH THE SUBJECT IN ITS TRIGGER IS STOPPED BY THE ERASURE, and writes nothing naming them after it', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([OBLIGATIONS, AFTER]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const filed = value(
    k.propose(
      {
        question: 'Who takes the lease?',
        body_kind: 'options',
        body: { options: [{ id: 'o1', label: 'Mara Quill', because: 'she asked' }, { id: 'o2', label: 'Nobody yet', because: 'wait' }] },
      } as never,
      'p_owner',
    ) as Result<{ id: string }>,
  );
  value(k.decide(filed.id, { decide: { option: 'o1', reason: 'Agreed on the call.' } }, 'p_owner') as Result<unknown>);
  await k.drain();
  const waiting = sql.all<{ state: string; trigger: string }>("SELECT state, trigger FROM automation_run WHERE rule = 'after'");
  assert.ok(waiting.some((r) => r.state === 'waiting' && r.trigger.toLowerCase().includes('quill')), `no run waited with the name: ${JSON.stringify(waiting)}`);

  value(await k.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request' }, 'p_owner'));
  const run = sql.one<{ state: string; trigger: string }>("SELECT state, trigger FROM automation_run WHERE rule = 'after'");
  assert.equal(run?.state, 'cancelled');
  assert.ok(!(run?.trigger ?? '').toLowerCase().includes('quill'), 'the run still holds the name in its trigger');

  clock.advance(HOUR + 60_000);
  await k.drain();
  const named = sql.all<{ note: string }>("SELECT note FROM event WHERE lower(coalesce(note, '') || coalesce(to_v, '') || coalesce(from_v, '')) LIKE '%quill%'");
  assert.deepEqual(named, [], 'something written after the erasure names the person');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE lower(payload) LIKE '%quill%'")?.n, 0);
  sql.close();
});
