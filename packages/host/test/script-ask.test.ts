/**
 * `ctx.ask` on the host's side (`scriptAsks`, add-ons phase 4): Slash's own refusal, such as a month's allowance spent,
 * reaches the script as a value it reads, and a question too long or empty never reaches the model at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ASK_CHARS, scriptAsks } from '../src/script.ts';

const run = { job: { id: 'job_1' }, scripted: { script: 'film_night' } } as never;

test('THE ALLOWANCE SPENT IS A REFUSAL THE SCRIPT READS, in Slash\'s own words', async () => {
  const asked: unknown[] = [];
  const ask = scriptAsks(async (q) => {
    asked.push(q);
    return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: "This month's asks are spent until 1 December." } };
  })(run);
  assert.deepEqual(await ask('Pick a film'), { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: "This month's asks are spent until 1 December.", at: 'ask' } });
  assert.deepEqual(asked, [{ run: 'job_1', rule: 'script.film_night', step: 0, question: 'Pick a film', shape: 'text' }]);
});

test('AN ANSWER IS { ok, text }; AN EMPTY OR TOO LONG QUESTION AND A HOST WITH NO MODEL ASK NOTHING', async () => {
  let calls = 0;
  const ask = scriptAsks(async () => {
    calls += 1;
    return { ok: true, value: { text: 'Dune' } };
  })(run);
  assert.deepEqual(await ask('Pick'), { ok: true, text: 'Dune' });
  assert.equal(((await ask('  ')) as { refusal: { code: string } }).refusal.code, 'REQUIRED_MISSING');
  assert.equal(((await ask('x'.repeat(ASK_CHARS + 1))) as { refusal: { code: string } }).refusal.code, 'OUT_OF_BOUNDS');
  assert.equal(calls, 1);
  assert.equal(((await scriptAsks(undefined)(run)('Pick')) as { refusal: { code: string } }).refusal.code, 'NOT_IN_THIS_BUILD');
});
