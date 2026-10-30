/**
 * A REQUEST ASKS WHETHER THE LOOK IS DUE AND DOES NONE OF IT (`slashDue`), and the alarm's look says when it stopped
 * with work left (`slashLook`'s answer), so the alarm is set for now and the rest is the next alarm's (F35, 30 October).
 *
 * On his record every `/api/pulse` ran the look in its `waitUntil` and spent 15 s of CPU, every 25 s, all day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tickBudget } from '@braindog/record';

import { slashDue, slashLook } from '../src/slash.ts';

test('A REQUEST\'S ASK IS `defer` AND NOTHING ELSE, and only `later` is due', async () => {
  const asked: unknown[] = [];
  const answering = (why: string) => ({ slashTick: async (opts?: unknown) => (asked.push(opts), { ran: false, why }) }) as never;
  assert.equal(await slashDue(answering('later')), true);
  assert.equal(await slashDue(answering('today')), false);
  assert.equal(await slashDue(answering('off')), false);
  assert.deepEqual(asked, [{ defer: true }, { defer: true }, { defer: true }]);
});

test('AN ASK THAT THROWS IS NOT DUE AND NEVER THROWS OUT OF THE REQUEST', async () => {
  const broken = { slashTick: async () => { throw new Error('offline'); } } as never;
  assert.equal(await slashDue(broken), false);
});

test('THE ALARM\'S LOOK HANDS ITS BUDGET ON AND ANSWERS `more` WHEN THE LOOK STOPPED WITH WORK LEFT', async () => {
  const handed: unknown[] = [];
  const looking = (out: unknown) => ({ slashTick: async (opts?: unknown) => (handed.push(opts), out) }) as never;
  const budget = tickBudget(() => 0);
  assert.equal(await slashLook(looking({ ran: true, by: 'rules', filed: [], skipped: [], dropped: [], large: false, more: true }), { budget }), true);
  assert.equal(await slashLook(looking({ ran: false, why: 'today', more: true }), { budget }), true);
  assert.equal(await slashLook(looking({ ran: false, why: 'today' }), { budget }), false);
  assert.deepEqual(handed, [{ budget }, { budget }, { budget }]);
  /* AND WITH NO BUDGET IT ASKS AS IT ALWAYS DID, with nothing. */
  handed.length = 0;
  assert.equal(await slashLook(looking({ ran: false, why: 'today' })), false);
  assert.deepEqual(handed, [undefined]);
  /* A LOOK THAT THROWS HAS NOTHING LEFT TO SAY: no more. */
  assert.equal(await slashLook({ slashTick: async () => { throw new Error('offline'); } } as never), false);
});
