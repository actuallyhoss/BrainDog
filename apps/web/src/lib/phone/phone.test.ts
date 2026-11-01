/**
 * The phone's pure parts: which request is a share, the line a push says by its kind, the launch pictures' links, and
 * the two asks made once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { kindIn, kindsOff, pushLine } from './kinds.ts';
import { isShare, isSharedPhoto, photoAt } from './share.ts';
import { SCREENS, fileOf, links, mediaOf } from './splash.ts';

const SCOPE = 'https://app.brain.dog/';

test('A SHARE IS A POST TO /add UNDER THE SCOPE, and its photo is read back at its own address of this origin', () => {
  assert.equal(isShare('https://app.brain.dog/add', 'POST', SCOPE), true);
  assert.equal(isShare('https://app.brain.dog/add', 'GET', SCOPE), false);
  assert.equal(isShare('https://app.brain.dog/kiln/add', 'POST', SCOPE), false);
  assert.equal(isShare('https://elsewhere.example/add', 'POST', SCOPE), false);
  assert.equal(photoAt(SCOPE, 0), 'https://app.brain.dog/~shared/0');
  assert.equal(isSharedPhoto('https://app.brain.dog/~shared/0?v=abc', 'GET', SCOPE), true);
  assert.equal(isSharedPhoto('https://app.brain.dog/~shared/../api/boot', 'GET', SCOPE), false);
  assert.equal(isSharedPhoto('https://app.brain.dog/~shared/0', 'POST', SCOPE), false);
});

test('A PUSH SAYS ITS KIND AND NEVER WHAT IT IS ABOUT, and a push with no kind says what every push said before', () => {
  assert.equal(pushLine(null, '/kiln/decide/sg_1'), 'Something in your BrainDog needs you');
  assert.equal(pushLine('needs', '/kiln/decide'), 'Something in your BrainDog needs you');
  assert.equal(pushLine('agents', '/kiln/decide/sg_1'), 'An agent needs your answer');
  assert.equal(pushLine('agents', '/kiln/p/agents'), 'An agent finished what you gave it');
  assert.equal(pushLine('money', '/kiln/r/installments'), 'Something in your money is coming due');
  assert.equal(pushLine(null, '/kiln/agents/summary/morning'), 'Your BrainDog summary is ready');
  assert.equal(kindIn('Invoice 41'), null);
  assert.deepEqual(kindsOff(['money', 'nope', 3, 'summary']), ['money', 'summary']);
  assert.deepEqual(kindsOff(undefined), []);
});

test('EVERY LAUNCH PICTURE A LINK NAMES IS DRAWN, in both schemes, and each link names exactly one screen', () => {
  const all = links('https://app.brain.dog');
  assert.equal(all.length, SCREENS.length * 2);
  for (const s of SCREENS)
    for (const scheme of ['light', 'dark'] as const) {
      assert.ok(existsSync(new URL(`../../../static/${fileOf(s, scheme)}`, import.meta.url)), `${fileOf(s, scheme)} is named and not drawn`);
      assert.match(mediaOf(s, scheme), new RegExp(`device-width: ${s.w}px.*device-height: ${s.h}px.*ratio: ${s.ratio}.*${scheme}`, 'u'));
    }
  assert.equal(new Set(all.map((l) => l.media)).size, all.length, 'two pictures for one screen');
});
