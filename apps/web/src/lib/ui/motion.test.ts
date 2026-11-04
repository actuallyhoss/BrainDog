/**
 * That a motion token reads in milliseconds whatever unit the minified skin writes it in (VERIFY H1: `.18s` was read
 * as 0.18, so rows never visibly moved).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ms, msIn } from './motion.ts';

test('seconds and milliseconds both read as milliseconds', () => {
  assert.equal(msIn('.18s', 0), 180);
  assert.equal(msIn(' 0.18s ', 0), 180);
  assert.equal(msIn('180ms', 0), 180);
  assert.equal(msIn('1.5s', 0), 1500);
  assert.equal(msIn('0s', 99), 0);
});

test('an unset or unreadable token is the fallback', () => {
  assert.equal(msIn('', 180), 180);
  assert.equal(msIn('fast', 220), 220);
});

test('with no document the fallback stands', () => {
  assert.equal(ms('--d-rows', 180), 180);
});

/* A TYPED LINE AND THE RECORD'S ROW THAT LANDS FOR IT ARE ONE ROW (fluid F9): while the swap is drawn nothing leaves,
   opens or slides, and the next change moves as ever. */
test('a swap in place draws still, and is lifted once it has been drawn', async () => {
  const { rowIn, rowOut, settle, swapInPlace } = await import('./motion.ts');
  const node = { offsetHeight: 40 } as unknown as Element;
  assert.ok((rowIn(node).duration ?? 0) > 0, 'a row added moves');
  assert.ok((rowOut(node).duration ?? 0) > 0, 'a row taken away moves');
  swapInPlace();
  assert.equal(rowIn(node).duration, 0, 'the landed row does not open');
  assert.equal(rowOut(node).duration, 0, 'the typed line does not close');
  assert.equal(settle().duration, 0, 'the rows beside them do not slide');
  await new Promise((done) => setTimeout(done, 5));
  assert.ok((rowIn(node).duration ?? 0) > 0, 'the next row added moves again');
  assert.ok(settle().duration > 0);
});

test('the typed line is swapped in place only when the record has answered it', () => {
  const page = readFileSync(fileURLToPath(new URL('../../routes/r/[register]/+page.svelte', import.meta.url)), 'utf8');
  assert.match(page, /const \{ out, made: madePerson \} = await orderWrite\(writes\(\), id, fields, person\);\n[^]*?\s+\/\*[^]*?\*\/\n\s+if \(out\.ok && asked === was\) swapInPlace\(\);\n\s+unline\(\);/u);
});

/* A PLACE'S FIRST DRAW, WHERE ONE STILL ARRIVES, IS IN ORDER AND STILL BY 450ms (fluid F6): six at most, 40ms apart. TODAY
   NO LONGER RISES ON AN OPEN AT ALL (audit 11-01, AP5): a load, a reload and a new tab draw it as it is. */
test('the arrival steps are six 40ms apart and done by 450ms, and Today draws still on an open', async () => {
  const { ARRIVAL, arrivalDelay } = await import('./motion.ts');
  const tokens = readFileSync(fileURLToPath(new URL('../../../../../packages/skin/tokens.css', import.meta.url)), 'utf8');
  assert.match(tokens, /--d-stagger: 40ms;/u);
  assert.match(tokens, /--d-page: 200ms;/u);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(arrivalDelay), [0, 40, 80, 120, 160, 200, null, null]);
  assert.ok((arrivalDelay(ARRIVAL.most - 1) ?? 0) + ARRIVAL.page <= ARRIVAL.by, 'the last tile is still by 450ms');

  const home = readFileSync(fileURLToPath(new URL('../home/Home.svelte', import.meta.url)), 'utf8');
  assert.doesNotMatch(home, /animation: tile-in/u, 'no tile rises in on an open');
  assert.doesNotMatch(home, /data-enter=/u);
});
