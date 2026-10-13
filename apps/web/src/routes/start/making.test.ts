/**
 * The record being made, watched (USE-B04, USE-B07): after the press the build's tiles each say "Making", "Made", or
 * "Not made" with the record's own sentence, read from the add-ons the record holds every 400 ms while `setup` runs.
 *
 * WHAT IS UNDER TEST IS THE READING, which is plain code (`makingStates`, `watchHeld` in `building.ts`), and the two
 * things the screen must never grow back, read off its source: a count and a bar. The tiles themselves are drawn by
 * `Making.svelte`, which only draws what it is handed.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MAKING_EVERY, making, makingStates, partsOf, casePart, stepsOf, watchHeld, type Held, type MakingPart } from './building.ts';

const source = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8');

const PARTS: MakingPart[] = [
  { id: 'usecase-shop', name: 'Shop', icon: 'home', why: ['a small candle shop'] },
  { id: 'people', name: 'People', icon: 'people' },
  { id: 'money-core', name: 'Money', icon: 'money' },
];
const on = (...ids: string[]): Held[] => ids.map((id) => ({ id, disabled_at: null }));

test('EVERY PART IS BEING MADE UNTIL THE RECORD HOLDS IT, and made the moment it does', () => {
  assert.deepEqual(makingStates(PARTS, [], null), { 'usecase-shop': 'making', people: 'making', 'money-core': 'making' });
  assert.deepEqual(makingStates(PARTS, on('people'), null), { 'usecase-shop': 'making', people: 'made', 'money-core': 'making' });
  assert.deepEqual(makingStates(PARTS, on('people', 'usecase-shop', 'money-core'), null), { 'usecase-shop': 'made', people: 'made', 'money-core': 'made' });
});

test('AN ADD-ON THE RECORD HOLDS TURNED OFF IS NOT MADE YET: the press turns it on, and the tile waits for that', () => {
  assert.equal(makingStates(PARTS, [{ id: 'people', disabled_at: '2026-10-01T09:00:00Z' }], null).people, 'making');
});

test('A PART THE RECORD REFUSED SAYS THE RECORD’S OWN SENTENCE, and the rest are made once the call has answered', () => {
  const why = 'Money needs a currency, and none was chosen.';
  const states = makingStates(PARTS, on('people'), [{ part: 'money-core', why }]);
  assert.deepEqual(states['money-core'], { refused: why });
  assert.equal(states.people, 'made');
  assert.equal(states['usecase-shop'], 'made', 'the call answered and did not refuse it, so it is in, whatever the last reading said');
  /* A USE CASE THE ANSWER NAMES BY ITS BARE ID is the same tile. */
  assert.deepEqual(makingStates(PARTS, [], [{ part: 'shop', why }])['usecase-shop'], { refused: why });
  /* NO SENTENCE FROM THE RECORD is still a sentence on the tile, never an empty one. */
  assert.deepEqual(makingStates(PARTS, [], [{ part: 'people', why: ' ' }]).people, { refused: making.noReason });
});

test('THE TILES ARE THE BUILD’S OWN: the parts that were on, in the order heard, by the ids the record holds them under', () => {
  const heard = [{ phrase: 'a small candle shop', became: 'Shop' }];
  const shop = casePart({ usecase: 'shop', title: 'Shop', summary: '', pack: null }, heard, false);
  const modules = partsOf({ offered: ['people', 'money-core', 'estate'], modules: ['people', 'money-core'], heard, rows: [], heldBy: () => null, byHand: new Set(), waiting: null });
  const tiles = stepsOf([shop, ...modules]).map((p): MakingPart => ({ id: p.id, name: p.name, icon: p.icon, why: p.why }));
  assert.deepEqual(tiles.map((t) => t.id), ['usecase-shop', 'people', 'money-core'], 'a part left off has a tile, or a part is under an id the record does not use');
  assert.deepEqual(Object.values(makingStates(tiles, on('usecase-shop', 'people', 'money-core'), null)), ['made', 'made', 'made']);
});

test('THE RECORD IS READ EVERY 400 MS WHILE THE CALL RUNS, one reading at a time, and never after the stop', async (t) => {
  assert.equal(MAKING_EVERY, 400);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seen: number[] = [];
  let reads = 0;
  const stop = watchHeld(
    async () => {
      reads++;
      /* THE THIRD READING FAILS: nothing is said for it, and the next one is still asked for. */
      if (reads === 3) throw new Error('offline');
      return on(...PARTS.slice(0, reads).map((p) => p.id));
    },
    (held) => seen.push(held.length),
  );
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  await settle();
  assert.deepEqual(seen, [1], 'the first reading waits 400 ms, so the first tile is late');
  t.mock.timers.tick(399);
  await settle();
  assert.equal(reads, 1, 'the record was read again before 400 ms had passed');
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(seen, [1, 2]);
  t.mock.timers.tick(400);
  await settle();
  assert.deepEqual(seen, [1, 2], 'a reading that failed was handed over');
  t.mock.timers.tick(400);
  await settle();
  assert.equal(reads, 4);
  stop();
  t.mock.timers.tick(4000);
  await settle();
  assert.equal(reads, 4, 'the record was read after the call answered');
});

test('A READING THAT COMES BACK AFTER THE STOP IS DROPPED, so the call’s answer is never drawn over', async () => {
  let land: (held: Held[]) => void = () => {};
  const seen: number[] = [];
  const stop = watchHeld(
    () => new Promise<Held[]>((r) => (land = r)),
    (held) => seen.push(held.length),
  );
  await Promise.resolve();
  stop();
  land(on('people'));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(seen, []);
});

test('THE MAKING STEP SAYS NO COUNT AND DRAWS NO BAR, in its words and in its source', () => {
  for (const line of Object.values(making)) {
    assert.doesNotMatch(line, /\d+\s+of\s+\d+|\b\d+\b|%/u, `a count: ${line}`);
    assert.doesNotMatch(line, /\brows?\b|\bentit(y|ies)\b|—/u, `a word a person should not read: ${line}`);
  }
  const screen = source('./Making.svelte');
  const drawn = screen.slice(screen.indexOf('<script'));
  assert.doesNotMatch(drawn, /progressbar|<progress|aria-valuenow|\.length\}|\{[^{}]+\}\s+of\s+\{/u, 'the making step counts its tiles or draws a bar');
  assert.doesNotMatch(drawn, /border:|box-shadow|gradient|backdrop-filter/u, 'a tile is flat: no border, no shadow, no glass');
  assert.match(drawn, /border-radius: var\(--r-lg\)/u, 'a tile is radius 16');
  /* A REFUSAL IS NEVER COLOUR ALONE: the words "Not made" stand beside the red. */
  assert.match(drawn, /words\.notMade/u);
});

test('BOTH PAGES MOUNT IT WITH THE SAME TWO PROPS, parts and states, and /start reads the record while the call runs', () => {
  const screen = source('./Making.svelte');
  const props = /let \{([^}]*)\}\s*:/u.exec(screen)?.[1] ?? '';
  assert.deepEqual(props.split(',').map((p) => p.trim()).filter((p) => p !== ''), ['parts', 'states']);
  const page = source('./+page.svelte');
  assert.match(page, /<Making parts=\{watched\.parts\} states=\{makingStates\(watched\.parts, watched\.held, watched\.answer\)\} \/>/u);
  assert.match(page, /watchHeld\(/u, 'the page does not read the record while setup runs');
  assert.match(page, /client\.packs\(\)/u);
  const make = page.slice(page.indexOf('async function make()'), page.indexOf('/* ── the keys'));
  assert.ok(make.indexOf('watchHeld(') < make.indexOf('await accept('), 'the reading starts after the call it is there to watch');
  assert.match(make, /finally \{\s*stop\(\);/u, 'the reading is not stopped when the call throws');
});
