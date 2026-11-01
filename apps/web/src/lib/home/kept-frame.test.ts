/**
 * The kept picture of Today (`kept-frame.ts`) is read back by a line of script in `app.html` that has no module to
 * import, so the two spell the copy's name, the picture's address and its version apart. This holds them equal, and
 * holds the template to the rules the module says it keeps: a controlled page only, never while seeing as somebody,
 * the same address, width and scheme, a week at most, and gone once the app's own screen has drawn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { COPY, WEEK } from '../data/offline.ts';
import { FRAME_PATH, FRAME_VERSION, KEPT_SAY_MS } from './kept-frame.ts';

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../app.html', import.meta.url)), 'utf8');
const SCRIPT = [...TEMPLATE.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!).find((s) => s.includes('kept-frame')) ?? '';

test('the template reads the picture where the module keeps it', () => {
  assert.ok(SCRIPT !== '', 'app.html no longer paints the kept picture');
  assert.ok(SCRIPT.includes(`caches.open('${COPY}')`), "the template's copy name drifted from COPY");
  assert.ok(SCRIPT.includes(`location.origin+'/${FRAME_PATH}'`), "the template's address drifted from FRAME_PATH");
  assert.ok(SCRIPT.includes(`f.v!==${FRAME_VERSION}`), "the template's version drifted from FRAME_VERSION");
});

test('the template keeps the module’s rules', () => {
  assert.ok(SCRIPT.includes('N.controller'), 'a page the worker does not control must not paint it');
  assert.ok(SCRIPT.includes("sessionStorage.getItem('braindog.see-as')"), 'never while seeing the record as somebody else');
  const week = /n-f\.at<([0-9e]+)/u.exec(SCRIPT)?.[1];
  assert.equal(Number(week), WEEK, 'a week at most');
  const say = /n-f\.at>=([0-9e]+)/u.exec(SCRIPT)?.[1];
  assert.equal(Number(say), KEPT_SAY_MS, 'it says when it is from past a minute, as Today does');
  assert.ok(SCRIPT.includes("#main[data-screen]"), "it goes once the app's own screen has drawn");
  assert.ok(SCRIPT.includes('e.inert=true') && SCRIPT.includes("'aria-hidden','true'"), 'nothing in it can be pressed or read out');
});
