/**
 * Capture from the phone in one press: the manifest offers "Add a task" and "Ask" on a long press of the Home
 * Screen icon and takes a share, and what a share hands becomes the palette's first words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SEED_MOST, sharedSeed } from './seed.ts';

type Manifest = {
  scope: string;
  shortcuts?: { name: string; url: string }[];
  share_target?: { action: string; method: string; enctype?: string; params: Record<string, unknown> };
};
const manifest = JSON.parse(readFileSync(new URL('../../../static/manifest.webmanifest', import.meta.url), 'utf8')) as Manifest;

test('A LONG PRESS OFFERS "Add a task" AND "Ask", each inside the app and opening its add sheet or the palette', () => {
  assert.deepEqual(manifest.shortcuts?.map((s) => s.name), ['Add a task', 'Ask']);
  for (const s of manifest.shortcuts ?? []) assert.ok(s.url.startsWith(manifest.scope), `${s.name} opens outside the app`);
  /* NO RECORD'S NAME IN THE ADDRESS: a page word at the root is the record the session is on (`appPath`). */
  assert.equal(manifest.shortcuts?.[0]?.url, '/r/tasks?new=1');
  assert.equal(manifest.shortcuts?.[1]?.url, '/add');
});

test('A SHARE FROM ANOTHER APP OPENS /add WITH WHAT IT SHARED, a photo too', () => {
  /* A POST, BECAUSE A PHOTO IS A FILE AND A GET CARRIES NONE. The service worker takes it (`share.ts`) and opens
     `/add` with the words as the GET did, so the palette's first words are read as before. */
  assert.deepEqual(manifest.share_target, {
    action: '/add',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'photo', accept: ['image/*'] }] },
  });
});

test('WHAT A SHARE HANDS IS THE PALETTE\'S FIRST WORDS: each once, in order, and cut short', () => {
  assert.equal(sharedSeed(new URLSearchParams('')), '');
  assert.equal(sharedSeed(new URLSearchParams({ title: 'Rates page', url: 'https://example.com/rates' })), 'Rates page https://example.com/rates');
  assert.equal(sharedSeed(new URLSearchParams({ text: 'Call the  bank\nabout fees', url: '' })), 'Call the bank about fees');
  assert.equal(sharedSeed(new URLSearchParams({ text: 'see https://x.test', url: 'https://x.test' })), 'see https://x.test');
  assert.equal(sharedSeed(new URLSearchParams({ text: 'a'.repeat(900) })).length, SEED_MOST);
});
