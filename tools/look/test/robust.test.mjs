/** The look's patience: screens named by --screens, and the first check tried again for a live record only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { onlyScreens } from '../capture.mjs';
import { answersOf, parse } from '../run.mjs';

test('--screens is read as a list of names', () => {
  assert.deepEqual(parse(['--screens', 'today, money']).screens, ['today', 'money']);
  assert.equal(parse([]).screens, undefined);
  assert.throws(() => parse(['--screens', ',']));
});

test('onlyScreens keeps the named screens and says a missing one', () => {
  const screens = [{ key: 'today', name: 'Today' }, { key: 'money', name: 'Money' }, { key: 'people', name: 'People' }];
  const got = onlyScreens(screens, [], ['Today', 'nothing']);
  assert.deepEqual(got.screens.map((s) => s.key), ['today']);
  assert.equal(got.missing[0].key, 'nothing');
  assert.equal(onlyScreens(screens, [], undefined).screens.length, 3);
});

test('the boot check is tried three times for live and once for the rest', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw new Error('slow');
  };
  await answersOf({ name: 'live' }, 'x', { check: flaky, backoffMs: 1 });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(answersOf({ name: 'seed' }, 'x', { check: flaky, backoffMs: 1 }));
  assert.equal(calls, 1);
  await assert.rejects(answersOf({ name: 'live' }, 'x', { check: async () => { throw new Error('down'); }, backoffMs: 1 }), /down/);
});
