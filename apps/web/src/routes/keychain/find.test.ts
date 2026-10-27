/**
 * A Keychain of 176 keys is found by typing: one list 22,900 px long on a phone, no search,
 * "Kept elsewhere" under every row, and the keys Health calls "here twice" unmarked. A box finds a key as it is typed,
 * each project's keys fold under its name, the twins wear a mark, and a word every row shares is said once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { KeyRow } from '../../lib/record/keychain.ts';
import { foldsOpen, groupsOf, keysFor, sharedState, twinsOf, words } from './tiles.ts';

const key = (over: Partial<KeyRow>): KeyRow => ({
  id: over.label ?? 'k',
  spoken: null,
  label: 'Key',
  opens: '',
  project: null,
  scope: null,
  sealed: false,
  opened: 0,
  lastOpened: null,
  grant: null,
  kept: true,
  ...over,
});

const LARKSPUR = { spoken: 'things#4', name: 'Larkspur', mark: null, hue: null };
const TIDEWELL = { spoken: 'things#5', name: 'Tidewell', mark: null, hue: null };

const KEYS = [
  key({ id: 'a', spoken: 'credentials#1', label: 'larkspur-site.env', opens: 'The shop front', scope: LARKSPUR, project: 'Larkspur', provider: 'Cloudflare' }),
  key({ id: 'b', spoken: 'credentials#2', label: 'larkspur-deploy', opens: 'Deploys the shop', scope: LARKSPUR, project: 'Larkspur', provider: 'GitHub' }),
  key({ id: 'c', spoken: 'credentials#3', label: 'tidewell-mail', opens: 'Sends the newsletter', scope: TIDEWELL, project: 'Tidewell' }),
  key({ id: 'd', spoken: 'credentials#4', label: 'tidewell-mail', opens: 'Sends the newsletter', scope: TIDEWELL, project: 'Tidewell' }),
];

test('A KEY IS FOUND BY TYPING: its name, what it opens or who it is with, any case', () => {
  assert.deepEqual(keysFor(KEYS, 'DEPLOY').map((k) => k.id), ['b']);
  assert.deepEqual(keysFor(KEYS, 'cloudflare').map((k) => k.id), ['a']);
  assert.deepEqual(keysFor(KEYS, '  ').length, 4);
  assert.equal(words.find, 'Find a key');
});

test('EACH PROJECT FOLDS UNDER ITS NAME, and opens while a search is typed or where there is only one', () => {
  const groups = groupsOf(KEYS);
  assert.equal(groups.length, 2);
  assert.equal(foldsOpen(groups, ''), false, 'two projects open folded');
  assert.equal(foldsOpen(groups, 'mail'), true, 'a search shows what it found');
  assert.equal(foldsOpen(groupsOf(KEYS.slice(0, 2)), ''), true, 'one project has nothing to fold');
  assert.equal(words.keysIn(1), '1 key');
  assert.equal(words.keysIn(12), '12 keys');
});

test('THE KEYS HERE TWICE WEAR A MARK, by the numbers the record says are twins', () => {
  const twins = twinsOf(KEYS, [3, 4]);
  assert.deepEqual([...twins].sort(), ['c', 'd']);
  assert.equal(twinsOf(KEYS, []).size, 0);
  assert.equal(words.twice, 'Here twice');
});

test('A WORD EVERY KEY WITHOUT A VALUE HERE SHARES IS SAID ONCE, not under every row', () => {
  assert.equal(sharedState(KEYS), words.keptElsewhere);
  assert.equal(words.sharedSaid(words.keptElsewhere), 'Keys with no value here are kept elsewhere.');
  const mixed = [...KEYS, key({ id: 'e', label: 'loose', kept: false })];
  assert.equal(sharedState(mixed), null, 'two different words stay on their rows');
  assert.equal(sharedState([KEYS[0]!]), null, 'one key says its own word');
  assert.equal(sharedState(KEYS.map((k) => ({ ...k, sealed: true }))), null, 'a saved value draws no word at all');
  assert.equal(sharedState([key({ id: 'x', kept: false }), key({ id: 'y', kept: false })]), null, 'a key that needs a value keeps its ring and words');
});

test('THE KEYCHAIN DRAWS THE BOX, THE FOLDS, THE MARK AND THE ONE SHARED LINE', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /type="search"/u);
  assert.match(page, /<details class="key-group"/u);
  assert.match(page, /twins\.has\(k\.id\)/u);
  assert.match(page, /sharedSaid\(/u);
  assert.match(page, /heldTwice/u);
});
