/**
 * Sign-up's strikes while no bot check stands in front of it (DIRECTION §42): open to strangers, and narrow until the
 * check is keyed.
 *
 * `SIGNUP_UNCHECKED` APPLIES TO BOTH KEYS a start strikes, `signup:<ip>` and `signup-email:<address>`, whenever the host
 * does not say its check ran; `SIGN_IN`'s ten in fifteen minutes applies once it does. Tried at the edges, against a
 * fixed clock, as `signin-hardened.test.ts` tries every window.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { SIGNUP_UNCHECKED, createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 9);
const MINUTE = 60_000;

function setup() {
  const clock = fixedClock(NOW);
  const d = createDirectory(openSqlite(), clock, { mac: new Uint8Array(32).fill(3), magic: true });
  return { clock, d };
}

let seq = 0;
const start = (d: ReturnType<typeof setup>['d'], ip: string, email = `p${++seq}@example.com`, checked?: boolean) =>
  d.auth({ flow: 'signup.start', email, slug: `studio-${++seq}`, ip, ...(checked === undefined ? {} : { checked }) } as never) as Promise<AuthResult>;

test('THE RULE IS THREE AN HOUR, the number the health sentence reads', () => {
  assert.deepEqual(SIGNUP_UNCHECKED, { most: 3, window: 60 * MINUTE });
});

test('UNCHECKED, ONE NETWORK ADDRESS GETS THREE STARTS AN HOUR, and the fourth is locked for the hour', async () => {
  const { clock, d } = setup();
  for (let i = 0; i < SIGNUP_UNCHECKED.most; i++) assert.equal((await start(d, '203.0.113.7', undefined, false)).status, 200, `start ${i + 1}`);
  const locked = await start(d, '203.0.113.7', undefined, false);
  assert.equal(locked.status, 429);
  assert.equal(locked.status === 429 ? locked.retryAfter : 0, 3600);
  /* ANOTHER ADDRESS IS ITS OWN COUNT. */
  assert.equal((await start(d, '203.0.113.8', undefined, false)).status, 200);
  clock.advance(60 * MINUTE - 1);
  assert.equal((await start(d, '203.0.113.7', undefined, false)).status, 429, 'still locked a millisecond before the hour');
  clock.advance(1);
  assert.equal((await start(d, '203.0.113.7', undefined, false)).status, 200, 'the lock lifts at the hour');
});

test('A START THAT SAYS NOTHING ABOUT A CHECK IS READ AS UNCHECKED', async () => {
  const { d } = setup();
  for (let i = 0; i < 3; i++) assert.equal((await start(d, '203.0.113.20')).status, 200);
  assert.equal((await start(d, '203.0.113.20')).status, 429);
});

test('UNCHECKED, ONE TYPED ADDRESS IS STRUCK THREE TIMES AN HOUR, from anywhere', async () => {
  const { d } = setup();
  for (let i = 0; i < 3; i++) assert.equal((await start(d, `203.0.113.${30 + i}`, 'target@example.com', false)).status, 200);
  assert.equal((await start(d, '203.0.113.40', 'target@example.com', false)).status, 429);
});

test('CHECKED, TODAY\'S LIMITS STAND: ten from one address in fifteen minutes, and the eleventh is locked', async () => {
  const { d } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await start(d, '203.0.113.50', undefined, true)).status, 200, `start ${i + 1}`);
  const locked = await start(d, '203.0.113.50', undefined, true);
  assert.equal(locked.status, 429);
  assert.equal(locked.status === 429 ? locked.retryAfter : 0, 15 * 60);
});
