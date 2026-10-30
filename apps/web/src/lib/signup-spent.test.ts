/** A spent sign-up link is remembered on the device that spent it, by a digest and never by the link (`keepSpent`). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keepSpent, SPENT_KEY, spentFor } from './signup.ts';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

test('the link spent here is known again, for whom, and no other link is', async () => {
  const s = store();
  await keepSpent(s, 'tok-1', { email: 'nadia@example.com', slug: 'nadia' }, 1000);
  assert.deepEqual(await spentFor(s, 'tok-1', 2000), { email: 'nadia@example.com', slug: 'nadia' });
  assert.equal(await spentFor(s, 'tok-2', 2000), null);
  assert.doesNotMatch(s.m.get(SPENT_KEY) ?? '', /tok-1/u, 'the link itself was kept');
});

test('and it is forgotten after a week', async () => {
  const s = store();
  await keepSpent(s, 'tok-1', { email: 'nadia@example.com', slug: 'nadia' }, 0);
  assert.equal(await spentFor(s, 'tok-1', 8 * 24 * 3600 * 1000), null);
});
