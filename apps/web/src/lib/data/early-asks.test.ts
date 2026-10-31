/**
 * A read asked ahead is handed to its part once, while fresh, and never for another record (`early-asks.ts`, speed-e SE3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EARLY_FRESH_MS, askEarly, heldEarly, takeEarly } from './early-asks.ts';

test('A READ ASKED AHEAD IS ASKED ONCE AND HANDED ONCE', async () => {
  let asked = 0;
  const read = async () => (asked += 1, 'answer');
  askEarly('http://a slot', read);
  askEarly('http://a slot', read);
  assert.equal(asked, 1, 'a second ask while the first was fresh asked again');
  assert.equal(heldEarly('http://a slot'), true);
  assert.equal(await takeEarly<string>('http://a slot'), 'answer');
  assert.equal(takeEarly('http://a slot'), null, 'the answer was handed twice, so a later read would be the first one again');
  assert.equal(heldEarly('http://a slot'), false);
});

test('ANOTHER RECORD IS ANOTHER KEY, and a read that fails is no answer', async () => {
  askEarly('http://a working', async () => 'a');
  assert.equal(takeEarly('http://b working'), null);
  askEarly('http://c working', async () => {
    throw new Error('offline');
  });
  assert.equal(await takeEarly('http://c working'), null);
  askEarly('http://d working', () => {
    throw new Error('thrown before a promise');
  });
  assert.equal(takeEarly('http://d working'), null);
});

test('AN ANSWER OLDER THAN EARLY_FRESH_MS IS NOT HANDED, so a part never draws a stale first read', async () => {
  const now = Date.now;
  try {
    askEarly('http://e books', async () => 'old');
    Date.now = () => now() + EARLY_FRESH_MS + 1;
    assert.equal(heldEarly('http://e books'), false);
    assert.equal(takeEarly('http://e books'), null);
  } finally {
    Date.now = now;
  }
});

test('EVERY READ ASKED AHEAD SAYS SO TO THE CLIENT, so the rest leaves it out and the quiet mark does not (speed-f SF1)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../page/slot.ts'), /askEarly\(slotKey\(base\), \(\) => readSlot\(base, undefined, true\)\)/u);
  assert.match(read('../money/books.ts'), /askEarly\(key\(base, book\), \(\) => readBooks\(base, book, true\)\)/u);
  assert.match(read('../home/working-early.ts'), /createClient\(\{ base, ahead: true \}\)/u);
  const screen = read('../ui/screen.svelte.ts');
  assert.match(screen, /export function quiet\(\): boolean \{\s+return q\.out === 0 && q\.held === 0;/u, 'the quiet mark stopped counting reads asked ahead');
  assert.match(screen, /const still = settled\(\) !== undefined && restful\(\);/u);
});
