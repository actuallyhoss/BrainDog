/**
 * RF6: THE PAGE ASKED BEFORE THE APP ARRIVED HAS ONE SHORT CHANCE. The first page read of the tab takes it or lets it
 * go, whatever it asks, and one asked longer ago than `EARLY_PAGE_MS` is let go, so a later plain read of that page is
 * never handed the answer from when the tab opened.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EARLY_PAGE_MS, earlyPage } from './page-live.ts';

const BASE = 'https://app.brain.dog/studio';
const URL_OF = (slug: string) => `${BASE}/api/page?slug=${slug}&shape=1`;
const g = globalThis as { __bdPage?: unknown };
const asked = (slug: string, t: number) => (g.__bdPage = { url: URL_OF(slug), at: Promise.resolve(new Response('{"ok":true,"value":{}}')), t });

test('THE FIRST READ OF THE SAME ADDRESS, SOON, IS HANDED IT, and only once', async () => {
  const now = 1_000_000;
  asked('money', now - 1_000);
  const io = earlyPage(BASE, 'money', now);
  assert.ok(io);
  assert.equal(g.__bdPage, undefined);
  assert.equal(earlyPage(BASE, 'money', now), null);
});

test('A FIRST READ OF ANOTHER PAGE LETS IT GO, so the page read after it is not handed the old answer', () => {
  const now = 1_000_000;
  asked('money', now);
  assert.equal(earlyPage(BASE, 'work', now), null);
  assert.equal(g.__bdPage, undefined);
  assert.equal(earlyPage(BASE, 'money', now + 60_000), null);
});

test('ONE ASKED TOO LONG AGO, OR WITH NO TIME ON IT, IS LET GO', () => {
  const now = 1_000_000;
  asked('money', now - EARLY_PAGE_MS - 1);
  assert.equal(earlyPage(BASE, 'money', now), null);
  g.__bdPage = { url: URL_OF('money'), at: Promise.resolve(new Response('{}')) };
  assert.equal(earlyPage(BASE, 'money', now), null);
  assert.equal(g.__bdPage, undefined);
});
