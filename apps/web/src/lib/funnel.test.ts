/**
 * The app's funnel (`funnel.ts`): the step's name is all that is sent, once a step, and the list is the Directory's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STEPS as DIRECTORY } from '@braindog/record/directory';
import { STEPS, step } from './funnel.ts';

test('the steps are the Directory\'s, in its order', () => {
  assert.deepEqual([...STEPS], [...DIRECTORY]);
});

test('a step is sent once, as its name alone, to this origin', () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => void sent.push({ url, init })) as unknown as typeof globalThis.fetch;
  step('saw_connect', { fetch, base: 'https://example.dog' });
  step('saw_connect', { fetch, base: 'https://example.dog' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, 'https://example.dog/api/step');
  assert.equal(sent[0]?.init.body, JSON.stringify({ step: 'saw_connect' }));
  assert.equal(sent[0]?.init.credentials, 'same-origin');
});
