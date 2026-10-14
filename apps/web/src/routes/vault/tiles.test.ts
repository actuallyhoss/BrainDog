/**
 * `/vault`'s figures and sentences: counts and names only, and nothing drawn that the record did not give.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { KeyRow, UsedByRun } from '../../lib/record/vault.ts';
import { BARS, cameFromOf, clip, hintOf, opensOf, readingOf, rowAction, rowPath, sentenceOf, stateOf, words } from './tiles.ts';

const NOW = Date.parse('2026-09-30T12:00:00Z');

const key = (over: Partial<KeyRow>): KeyRow => ({
  id: over.label ?? 'k',
  spoken: null,
  label: 'Key',
  opens: '',
  project: null,
  scope: null,
  sealed: true,
  opened: 0,
  lastOpened: null,
  grant: 'g',
  ...over,
});

const KEYS = [
  key({ id: 'a', label: 'Payments service', opened: 12, lastOpened: '2026-09-28T09:00:00Z' }),
  key({ id: 'b', label: 'Registrar', opened: 3, lastOpened: '2026-09-20T09:00:00Z' }),
  key({ id: 'c', label: 'Backups bucket', opened: 0 }),
  key({ id: 'd', label: 'Kept in a password manager', sealed: false, grant: null }),
];

test('THE SENTENCE SAYS HOW MANY AND HOW OFTEN, and has no red while nobody is asking', () => {
  const s = sentenceOf({ keys: KEYS, listed: true, counts: true, asking: 0, seesMachines: true });
  assert.deepEqual(s, { text: '4 keys, 3 sealed here, opened 15 times.', needs: undefined });
});

test('A MACHINE ASKING IS THE RED PHRASE, and it is a phrase the sentence holds', () => {
  const s = sentenceOf({ keys: KEYS.slice(0, 3), listed: true, counts: true, asking: 1, seesMachines: true });
  assert.equal(s?.text, '3 keys sealed, opened 15 times. A machine is asking to open them.');
  assert.ok(s?.needs && s.text.includes(s.needs));
  assert.equal(sentenceOf({ keys: [], listed: true, counts: true, asking: 2, seesMachines: true })?.text, '2 machines are asking to open your keys.');
});

test('A READER REFUSED THE MACHINES IS NOT TOLD HOW MANY ARE ASKING, and a refused count is not said as zero', () => {
  const s = sentenceOf({ keys: KEYS.slice(0, 2), listed: true, counts: false, asking: 1, seesMachines: false });
  assert.deepEqual(s, { text: '2 keys sealed.', needs: undefined });
  assert.equal(sentenceOf({ keys: [], listed: false, counts: false, asking: 0, seesMachines: false }), null);
});

test('NEVER "THIS MONTH": the count is a lifetime one, and the sentence does not pretend otherwise', () => {
  const s = sentenceOf({ keys: KEYS, listed: true, counts: true, asking: 0, seesMachines: true });
  assert.doesNotMatch(s?.text ?? '', /month/u);
});

test('THE TILE COUNTS SEALED KEYS ONLY, the most opened first in ink and the rest grey', () => {
  const t = opensOf(KEYS, new Map(), true, NOW);
  assert.ok(t);
  assert.equal(t.total, 15);
  assert.deepEqual(
    t.bars.map((b) => [b.label, b.value, b.tone ?? null]),
    [
      ['Payments service', 12, 'ink'],
      ['Registrar', 3, null],
      ['Backups bucket', 0, null],
    ],
  );
  assert.equal(t.bars[2]?.note, words.never);
});

test('NO TILE WITHOUT A COUNT: a refused listGrants, or nothing sealed, draws nothing rather than zeros', () => {
  assert.equal(opensOf(KEYS, new Map(), false, NOW), null);
  assert.equal(opensOf([KEYS[3]!], new Map(), true, NOW), null);
});

test('AT MOST SIX BARS; the rest are the list under the tile', () => {
  const many = Array.from({ length: 9 }, (_, i) => key({ id: `k${i}`, label: `Key ${i}`, opened: i }));
  assert.equal(opensOf(many, new Map(), true, NOW)?.bars.length, BARS);
});

test('THE READING NAMES WHO OPENED THE TOP KEY LAST, and how many were never opened', () => {
  const by: UsedByRun = { run: 'S47', agent: 'claude', machine: null, at: '2026-09-28T09:00:00Z', count: 1 };
  const line = readingOf(KEYS.slice(0, 3), new Map([['a', by]]), NOW);
  assert.match(line, /^Payments service was opened 12 times, last by claude .+ ago, and 1 key has never been opened\.$/u);
  assert.equal(readingOf([key({ label: 'Registrar' })], new Map(), NOW), 'Nobody has opened Registrar yet.');
});

test('NO VALUE, NO EM DASH: every string built here is names and counts', () => {
  const t = opensOf(KEYS, new Map(), true, NOW);
  for (const line of [t?.reading ?? '', ...Object.values(words as Record<string, unknown>).filter((w): w is string => typeof w === 'string')]) assert.ok(!line.includes('—'), line);
});

test('A KEY SAYS WHETHER IT IS SEALED, taken out of service, or kept somewhere else', () => {
  assert.deepEqual(stateOf(KEYS[0]!), { word: words.sealedHere, sealed: true });
  assert.deepEqual(stateOf(key({ sealed: false, grant: 'g' })), { word: words.retired, sealed: false });
  assert.deepEqual(stateOf(KEYS[3]!), { word: words.elsewhere, sealed: false });
});

test('A LONG NAME IS CLIPPED FOR ITS BAR, and a key row links to its row page by its spoken id', () => {
  assert.equal(clip('A name far too long to sit beside its own bar'), 'A name far too long to…');
  assert.equal(clip('Registrar'), 'Registrar');
  assert.equal(rowPath(key({ spoken: 'credentials#3' })), '/r/credentials/3');
  assert.equal(rowPath(key({ spoken: null })), null);
});

test('A SEALED KEY SAYS ITS HINT UNOPENED, and a key with no value, an older seal or one out of service says none', () => {
  assert.equal(hintOf(key({ bytes: 40, hint: 'a 40-character value' })), 'a 40-character value');
  assert.equal(hintOf(key({})), null, 'a seal older than the hint has none, and none is made up from nothing');
  assert.equal(hintOf(key({ bytes: 40 })), null, 'a size alone is not a sentence this screen writes');
  assert.equal(hintOf(key({ hint: '   ' })), null);
  assert.equal(hintOf(key({ sealed: false, grant: null, hint: 'a 40-character value' })), null, 'no value, so nothing to hint at');
  assert.equal(hintOf(key({ sealed: false, grant: 'g', hint: 'a 40-character value' })), null);
});

test('THE ROW HAS ONE BUTTON: Reveal where a value is sealed, "Seal a value" where there is none', () => {
  assert.equal(words.sealValue, 'Seal a value');
  assert.deepEqual(rowAction(KEYS[0]!), { act: 'reveal' });
  assert.deepEqual(rowAction(KEYS[3]!), { act: 'seal', word: 'Seal a value' }, 'kept somewhere else: one press seals it onto this row');
  assert.deepEqual(rowAction(key({ sealed: false, grant: 'g' })), { act: 'seal', word: 'Seal a value' }, 'out of service: the same row takes a new value');
  /* A row a briefing already knew is sealed and names no grant to open, so it has neither: there is a value, and no door to it here. */
  assert.equal(rowAction(key({ sealed: true, grant: null })), null);
});

test('A KEY SAYS WHERE IT CAME FROM when its row does, by the row and never by a guess', () => {
  assert.equal(words.cameFrom, 'Came from');
  const from = cameFromOf([
    { id: 'a', fields: { label: 'A', origin: '  the registrar, at sign-up ' } },
    { id: 'b', fields: { label: 'B', origin: '' } },
    { id: 'c', fields: { label: 'C' } },
    { id: 'd', fields: { label: 'D', origin: 7 } },
  ]);
  assert.deepEqual([...from], [['a', 'the registrar, at sign-up']]);
  assert.equal(words.cameFromSaid('the registrar, at sign-up'), 'Came from the registrar, at sign-up');
  assert.equal(cameFromOf([]).size, 0);
});

test('EVERY KEY IS COUNTED, however many: 405 handed is 405 said, not the first page of them', () => {
  const many = Array.from({ length: 405 }, (_, i) => key({ id: `k${i}`, label: `Key ${i}`, opened: 1, ...(i < 90 ? { sealed: false, grant: null } : {}) }));
  const s = sentenceOf({ keys: many, listed: true, counts: true, asking: 0, seesMachines: true });
  assert.equal(s?.text, '405 keys, 315 sealed here, opened 315 times.');
  assert.equal(sentenceOf({ keys: many.slice(90), listed: true, counts: false, asking: 0, seesMachines: false })?.text, '315 keys sealed.');
});

test('MORE KEYS THAN WERE READ IS SAID, and a read that got them all says nothing', () => {
  assert.equal(words.moreKeys(405), 'The first 405 keys are listed. This record holds more.');
  assert.ok(!words.moreKeys(1).includes('—'));
});
