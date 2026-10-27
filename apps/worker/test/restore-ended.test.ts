/**
 * What the record had ended before a restore rewound it goes to the object that comes back, and not to the owner.
 *
 * The record's answer to a reopening restore carries `ended`, the credentials it had ended, and `restored` on the reopened
 * object ends them again. `afterRestore` is the hand between the two: it passes `ended` on, and the answer the owner
 * reads is the one a restore that puts rows back in place gives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { afterRestore, type Restored } from '../src/route.ts';

test('afterRestore HANDS restored WHAT THE RECORD HAD ENDED, AND THE OWNER AN ANSWER WITHOUT IT', async () => {
  const ended = { token: [{ id: 'tok_1', revoked_at: '2026-09-23T12:00:00.000Z' }], closed: [] };
  const value = { bookmark: 'nightly-2026-09-22', at: '2026-09-22T03:00:00.000Z', kept: 'before-restore-2026-09-23' };
  const out = new Response(JSON.stringify({ ok: true, value: { ...value, ended } }), { status: 200, headers: { 'content-type': 'application/json' } });

  const asked: Restored[] = [];
  const answer = await afterRestore(out, 'p_owner', {
    reset: async () => true,
    restored: async (args) => {
      asked.push(args);
      return { ok: true, value: { event: 'ev_1' } };
    },
  });

  assert.deepEqual(asked, [{ bookmark: value.bookmark, kept: value.kept, by: 'p_owner', ended }]);
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { ok: true, value });
});
