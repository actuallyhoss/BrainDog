/**
 * A filed question carries the address where the person answers it, `<origin>/<slug>/decide/<id>` (`decideAt`), and the
 * slug is read from a whole `boot` once and held a while for the same caller (`slugsHeld`), not built again after every
 * filing for one word of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/index.ts';
import { stub, type Ctx } from './stub.ts';

const ORIGIN = 'https://brain.dog';
const ASK = { question: 'Add Work?', body_kind: 'pack', body: { install: 'work' } };

/** A record called `mara` whose `boot` is counted, and refused while `refuse` says so. */
function record() {
  const state = { boots: 0, refuse: false };
  const { surface } = stub({
    boot: async () => {
      state.boots++;
      return state.refuse
        ? { ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } as never }
        : { ok: true as const, value: { registers: [{ id: 'obligations', name: 'Obligations' }], record: { slug: 'mara', name: 'Mara' } } as never };
    },
  });
  /* A NEW SET OF TOOLS FOR EACH MESSAGE, as `rpc.ts` builds them. */
  const file = async (ctx: Ctx) => {
    const out = await tools(surface, ORIGIN).call('propose', ASK, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as { decide?: string }).decide;
  };
  return { state, file };
}

test('THE DECIDE LINK NAMES THE RECORD, and a second filing by the same caller asks no boot for it', async () => {
  const { state, file } = record();
  assert.equal(await file({ who: 'claude' }), `${ORIGIN}/mara/decide/SG1`);
  const first = state.boots;
  assert.ok(first >= 1);
  assert.equal(await file({ who: 'claude' }), `${ORIGIN}/mara/decide/SG1`);
  assert.equal(state.boots, first * 2 - 1, 'the second filing asked boot for the slug again');
});

test('ANOTHER CALLER IS NEVER HANDED A SLUG ITS OWN BOOT DID NOT ANSWER', async () => {
  const { state, file } = record();
  assert.equal(await file({ who: 'claude' }), `${ORIGIN}/mara/decide/SG1`);
  state.refuse = true;
  assert.equal(await file({ who: 'codex' }), undefined, 'a caller refused boot was handed the slug held for another');
  /* AND A REFUSED BOOT HOLDS NOTHING: the same caller asks again, and is answered once it may. */
  const before = state.boots;
  state.refuse = false;
  assert.equal(await file({ who: 'codex' }), `${ORIGIN}/mara/decide/SG1`);
  assert.ok(state.boots > before);
});
