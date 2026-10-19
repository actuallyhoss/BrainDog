/**
 * `POST /api/step` (`src/step.ts`): answers 204 to everything, and marks a step only with counting on, from a session,
 * for a step on the closed list, with the record taken from the session and never from the body.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STEPS, servesStep, stepDoor, type StepDeps } from '../src/step.ts';

function ask(body: string, over: Partial<StepDeps> = {}, method = 'POST') {
  const marks: unknown[] = [];
  const deps: StepDeps = { on: true, record: 'rec_a', mark: async (call) => void marks.push(call), ...over };
  const request = new Request('https://example.dog/api/step', { method, body: method === 'POST' ? body : null });
  return stepDoor(request, deps).then((answer) => ({ answer, marks }));
}

test('the path is /api/step and nothing near it', () => {
  assert.equal(servesStep('/api/step'), true);
  assert.equal(servesStep('/api/step/'), true);
  assert.equal(servesStep('/api/steps'), false);
  assert.equal(servesStep('/api/seen'), false);
});

test('a step on the list is marked for the session\'s record', async () => {
  for (const step of STEPS) {
    const { answer, marks } = await ask(JSON.stringify({ step, record: 'rec_other' }));
    assert.equal(answer.status, 204);
    assert.deepEqual(marks, [{ flow: 'step.mark', record: 'rec_a', step }]);
  }
});

test('counting off, no session, a wrong method, a step off the list or a bad body each mark nothing and still say 204', async () => {
  const cases: [string, Partial<StepDeps>, string?][] = [
    [JSON.stringify({ step: 'saw_connect' }), { on: false }],
    [JSON.stringify({ step: 'saw_connect' }), { record: null }],
    [JSON.stringify({ step: 'saw_connect' }), {}, 'GET'],
    [JSON.stringify({ step: 'a project name' }), {}],
    ['not json', {}],
    ['[]', {}],
    [JSON.stringify({ step: 'x'.repeat(400) }), {}],
  ];
  for (const [body, over, method] of cases) {
    const { answer, marks } = await ask(body, over, method);
    assert.equal(answer.status, 204);
    assert.deepEqual(marks, []);
  }
});

test('a Directory that fails is one step not counted, and the answer is the same', async () => {
  const { answer } = await ask(JSON.stringify({ step: 'saw_connect' }), {
    mark: async () => {
      throw new Error('down');
    },
  });
  assert.equal(answer.status, 204);
});
