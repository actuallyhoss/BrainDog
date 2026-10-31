/**
 * A drawn widget's picture is kept per person and per BrainDog (sec-follow M3): a switch never draws another's, the
 * same person's pictures outlive a session that lapsed, and their explicit sign-out takes theirs alone (RE11).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forgetPicturesOf, keepPicture, keptPicture, pictureKey, whoseOf } from './drawn-pictures.ts';

const held = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
    get length() {
      return held.size;
    },
    key: (i: number) => [...held.keys()][i] ?? null,
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

test('AN EXPLICIT SIGN-OUT TAKES THE PERSON’S OWN PICTURES, on every BrainDog, and nobody else’s', () => {
  held.clear();
  const ada = whoseOf('https://app.brain.dog/acme/api', 'p_ada')!;
  const adaElsewhere = whoseOf('https://app.brain.dog/kiln/api', 'p_ada')!;
  const sam = whoseOf('https://app.brain.dog/acme/api', 'p_sam')!;
  keepPicture(pictureKey(ada, 'code', 's', 'light'), '<svg>ada</svg>', 120);
  keepPicture(pictureKey(adaElsewhere, 'code', 's', 'dark'), '<svg>ada</svg>', 120);
  keepPicture(pictureKey(sam, 'code', 's', 'light'), '<svg>sam</svg>', 120);
  /* one kept before the person's tag led the key, which belongs to nobody it can name */
  held.set('bd.drawn.pic.w1.abc.page.light', '{"p":"<svg/>","h":1}');
  forgetPicturesOf('p_ada');
  assert.equal(keptPicture(pictureKey(ada, 'code', 's', 'light')), null);
  assert.equal(keptPicture(pictureKey(adaElsewhere, 'code', 's', 'dark')), null);
  assert.equal(held.has('bd.drawn.pic.w1.abc.page.light'), false);
  assert.deepEqual(keptPicture(pictureKey(sam, 'code', 's', 'light')), { picture: '<svg>sam</svg>', height: 120 });
  assert.deepEqual(JSON.parse(held.get('bd.drawn.pics') ?? '[]'), [pictureKey(sam, 'code', 's', 'light')]);
});

test('A SIGN-OUT THAT CANNOT SAY WHO TAKES EVERY PICTURE', () => {
  held.clear();
  keepPicture(pictureKey(whoseOf('https://app.brain.dog/acme/api', 'p_sam')!, 'code', 's', 'light'), '<svg>sam</svg>', 120);
  forgetPicturesOf(null);
  assert.deepEqual([...held.keys()], []);
});
