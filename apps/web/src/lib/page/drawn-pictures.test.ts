/**
 * A drawn widget's picture is kept per person and per BrainDog (sec-follow M3): a switch never draws another's, and the
 * same person's pictures outlive a sign-out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keepPicture, keptPicture, pictureKey, whoseOf } from './drawn-pictures.ts';

const held = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  },
});

test('ONE PERSON’S PICTURE IS NEVER ANOTHER’S, on the same BrainDog or another', () => {
  const ada = whoseOf('https://app.brain.dog/acme/api', 'p_ada')!;
  const sam = whoseOf('https://app.brain.dog/acme/api', 'p_sam')!;
  const adaElsewhere = whoseOf('https://app.brain.dog/kiln/api', 'p_ada')!;
  assert.notEqual(ada, sam);
  assert.notEqual(ada, adaElsewhere);
  keepPicture(pictureKey(ada, 'code', 's', 'light'), '<svg>ada</svg>', 120);
  assert.deepEqual(keptPicture(pictureKey(ada, 'code', 's', 'light')), { picture: '<svg>ada</svg>', height: 120 });
  assert.equal(keptPicture(pictureKey(sam, 'code', 's', 'light')), null);
  assert.equal(keptPicture(pictureKey(adaElsewhere, 'code', 's', 'light')), null);
});

test('NOBODY TO KEEP FOR KEEPS NOTHING', () => {
  assert.equal(whoseOf('https://app.brain.dog/acme/api', null), null);
  assert.equal(whoseOf('https://app.brain.dog/acme/api', ''), null);
  assert.equal(whoseOf('', 'p_ada'), null);
});
