/**
 * The brake's sentence on the Slash tile (ENG-B17): said in whole answers when it is on, nothing when it is off or was
 * not read, and nothing on a refusal. The words are checked because a wrong count draws as correctly as a right one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brakeLine, readBrake, type BrakeClient } from './slash-brake.ts';

test('ON: the sentence counts what he turned down out of the answers it was read from', () => {
  assert.equal(
    brakeLine({ on: true, share: 0.3, of: 10 }),
    'Slash is asking less: you turned down 7 of its last 10 suggestions. It asks again as you accept more.',
  );
  assert.equal(
    brakeLine({ on: true, share: 0.35, of: 20 }),
    'Slash is asking less: you turned down 13 of its last 20 suggestions. It asks again as you accept more.',
  );
});

test('ON, ONE TURNED DOWN OF MANY: the count is one and the window still plural', () => {
  assert.equal(brakeLine({ on: true, share: 0.95, of: 20 }), 'Slash is asking less: you turned down 1 of its last 20 suggestions. It asks again as you accept more.');
});

test('ON, A WINDOW OF ONE: the singular words, never "1 of its last 1 suggestions"', () => {
  assert.equal(brakeLine({ on: true, share: 0, of: 1 }), 'Slash is asking less: you turned down its last suggestion. It asks again as you accept more.');
});

test('OFF, UNREAD, OR NUMBERS THAT DO NOT HOLD TOGETHER: nothing is said', () => {
  assert.equal(brakeLine({ on: false, share: 0.3, of: 20 }), null);
  assert.equal(brakeLine(null), null);
  assert.equal(brakeLine(undefined), null);
  assert.equal(brakeLine({ on: true, share: 1.4, of: 20 }), null);
  assert.equal(brakeLine({ on: true, share: 0.3, of: 0 }), null);
  assert.equal(brakeLine({ on: true, share: 0.3, of: 2.5 }), null);
  assert.equal(brakeLine({ on: true, share: Number.NaN, of: 20 }), null);
  assert.equal(brakeLine({ on: true, share: 1, of: 20 }), null, 'on with nothing turned down is no reading');
});

const answering = (answer: unknown): BrakeClient & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    call: (async (name: string) => {
      asked.push(name);
      return answer;
    }) as BrakeClient['call'],
  };
};

test('READ: the brake from engineReadings, on or off as the record has it', async () => {
  const on = answering({ ok: true, value: { asks: [], understanding: { unattached: 0, open_by_cause: {} }, braked: { on: true, share: 0.3, of: 20 } } });
  assert.deepEqual(await readBrake(on), { on: true, share: 0.3, of: 20 });
  assert.deepEqual(on.asked, ['engineReadings']);
  const off = answering({ ok: true, value: { asks: [], understanding: { unattached: 0, open_by_cause: {} }, braked: { on: false, share: 0.8, of: 20 } } });
  assert.deepEqual(await readBrake(off), { on: false, share: 0.8, of: 20 });
});

test('READ, A REFUSAL, NO READINGS OR A THROW: null, and the tile says nothing', async () => {
  assert.equal(await readBrake(answering({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner reads this.' } })), null);
  assert.equal(await readBrake(answering({ ok: true, value: null })), null);
  assert.equal(await readBrake(answering({ ok: true, value: { braked: null } })), null);
  const throws: BrakeClient = { call: (async () => { throw new Error('offline'); }) as BrakeClient['call'] };
  assert.equal(await readBrake(throws), null);
});
