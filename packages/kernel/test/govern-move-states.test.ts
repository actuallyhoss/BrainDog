/**
 * A proposal that moves a row's state is asked, when it is filed, whether its list makes that move.
 *
 * WHAT WAS MEASURED BEFORE THIS. A rowset asking to move a lesson to `retired` was filed cleanly, because a patch's
 * values were the write path's to check at the press. The list closes a lesson as `superseded` or `reverted`, each with
 * a why, so the yes was refused and the question could never be answered as asked. Now it is refused when it is filed,
 * in the list's own words: the states it moves to from where the row is, its finished ones, and what they need.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import type { Filed } from '../src/govern.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 6);

const LESSONS: Declaration = {
  id: 'register.lessons',
  kind: 'register',
  body: {
    id: 'lessons',
    name: 'Lessons',
    title: 'lesson',
    state: 'state',
    done: ['superseded', 'reverted'],
    fields: [
      { id: 'lesson', type: 'text', required: true },
      {
        id: 'state',
        type: 'enum',
        values: ['active', 'superseded', 'reverted'],
        default: 'active',
        required: true,
        transitions: {
          active: { to: ['superseded', 'reverted'], requires: ['why'] },
          superseded: { to: ['active'], by: 'decide' },
          reverted: { to: ['active'], by: 'decide' },
        },
      },
      { id: 'why', type: 'text' },
    ],
  } as never,
};

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false, 'this was supposed to be refused');
  return (out as unknown as { refusal: { code: string; fix: string; at?: string; allowed?: string[] } }).refusal;
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([LESSONS]));
  value(k.create('lessons', { lesson: 'Read the file before changing it.' }, { actor: 'p_owner' }));
  return k;
}

const moving = (patch: Record<string, unknown>) => ({
  question: 'Close the lesson about reading files first?',
  body_kind: 'rowset' as const,
  body: { register: 'lessons', rows: [{ at: 'lessons#1', version: 1, patch }] },
});

test('A STATE THE LIST DOES NOT HOLD IS REFUSED WHEN FILED, naming the ones it closes with and what they need', async () => {
  const k = await record();
  const no = refusal(k.propose(moving({ state: 'retired' }), 'S1'));
  assert.equal(no.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(no.at, 'body.rows[0].patch.state');
  assert.deepEqual(no.allowed, ['superseded', 'reverted']);
  assert.match(no.fix, /no state called retired/u);
  assert.match(no.fix, /superseded or reverted, with why filled/u);
  assert.match(no.fix, /To close it, use superseded or reverted\./u);
});

test('A MOVE WITHOUT WHAT IT NEEDS IS REFUSED WHEN FILED, and with it the question files and its yes lands', async () => {
  const k = await record();
  const no = refusal(k.propose(moving({ state: 'superseded' }), 'S1'));
  assert.equal(no.code, 'REQUIRED_MISSING');
  assert.equal(no.at, 'body.rows[0].patch.why');
  const filed = value<Filed>(k.propose(moving({ state: 'superseded', why: 'A newer lesson says it better.' }), 'S1'));
  value(k.decide(filed.id, { decide: { option: 'accept', reason: 'Yes.' } }, 'p_owner'));
  assert.equal(k.get('lessons#1')?.state, 'superseded');
});

test('A MOVE THE LIST DOES NOT DECLARE FROM WHERE THE ROW IS IS REFUSED, in an option too', async () => {
  const k = await record();
  const no = refusal(
    k.propose(
      {
        question: 'Close it?',
        body_kind: 'options',
        body: {
          options: [
            { id: 'close', label: 'Close it', because: 'It is done.', patches: [{ at: 'lessons#1', version: 1, patch: { state: 'retired' } }] },
            { id: 'keep', label: 'Keep it', because: 'It still holds.' },
          ],
        },
      },
      'S1',
    ),
  );
  assert.equal(no.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(no.at, 'body.options[0].patches[0].patch.state');
});
