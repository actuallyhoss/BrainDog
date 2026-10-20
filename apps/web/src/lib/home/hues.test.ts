/**
 * Colours, on Home: the record's `huesWanted` as one tile that counts and names the rows with no colour of their own in
 * the list's own word, nothing at all at nought or on a host that does not answer the read, and one press whose answer
 * is the line the toast says ("Gave 6 colours.") with the batch its Undo takes, or the record's own sentence.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { copy } from '../copy.ts';
import { HUES_SHOWN, give, giveThrough, givenSaid, huesOf, huesSaid, huesWords, loadHues, namesSaid, readHues } from './hues.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const answer = (lists: unknown[]) => ({ ok: true as const, value: { lists } });
const STUDIOS = { list: 'studios', title: 'Studios', count: 6, names: ['Marrow Press', 'Juniper Hall', 'Lantern', 'Quillfield', 'Otterbay', 'Fernwick'] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('MANY ARE SAID IN THE LIST\'S OWN PLURAL, AND ONE IN ITS SINGULAR', () => {
  assert.equal(huesSaid({ title: 'Studios', count: 6 }), '6 studios have no colour of their own');
  assert.equal(huesSaid({ title: 'Studios', count: 1 }), '1 studio has no colour of its own');
  assert.equal(huesSaid({ title: 'Ventures', count: 2 }), '2 ventures have no colour of their own');
  /* THE RECORD'S RULE FOR ONE: only the last word turns, and an acronym keeps its letters. */
  assert.equal(huesSaid({ title: 'HSBC cards', count: 1 }), '1 HSBC card has no colour of its own');
  assert.equal(huesSaid({ title: 'Series', count: 1 }), '1 series has no colour of its own');
});

test('THE FIRST NAMES ARE SAID, AND THE REST COUNTED', () => {
  assert.equal(namesSaid(STUDIOS), 'Marrow Press, Juniper Hall, Lantern, Quillfield and 2 more');
  assert.equal(HUES_SHOWN, 4);
  assert.equal(namesSaid({ names: ['Lantern', 'Quillfield', 'Otterbay'], count: 3 }), 'Lantern, Quillfield and Otterbay');
  assert.equal(namesSaid({ names: ['Lantern'], count: 1 }), 'Lantern');
  assert.equal(namesSaid({ names: ['Lantern'], count: 5 }), 'Lantern and 4 more');
  assert.equal(namesSaid({ names: [], count: 5 }), '');
});

test('A LIST IS KEPT BY WHAT A PERSON CAN READ: a handle never drawn, a title, a count, names that are never ids', () => {
  const found = huesOf(answer([{ ...STUDIOS, names: ['Marrow Press', ULID, '  ', 'Lantern — rebuild'] }]));
  assert.deepEqual(found, { lists: [{ list: 'studios', title: 'Studios', count: 6, names: ['Marrow Press', 'Lantern, rebuild'] }] });
  /* A COUNT FEWER THAN ITS NAMES IS THE NAMES' COUNT, so "and N more" never goes below nought. */
  assert.equal(huesOf(answer([{ list: 'labs', title: 'Labs', count: 1, names: ['Fernwick', 'Otterbay'] }]))?.lists[0]?.count, 2);
  /* NO HANDLE, NO TITLE, A TITLE THAT IS AN ID, OR NOBODY WANTING: dropped. */
  assert.equal(huesOf(answer([{ ...STUDIOS, list: '' }, { ...STUDIOS, title: '' }, { ...STUDIOS, title: ULID }, { ...STUDIOS, count: 0, names: [] }, null, 'studios'])), null);
});

test('NOTHING IS DRAWN AT NOUGHT, ON A REFUSAL, OR ON AN ANSWER OF ANOTHER SHAPE', async () => {
  assert.equal(huesOf(answer([])), null);
  assert.equal(huesOf({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } }), null);
  assert.equal(huesOf({ ok: true, value: { lists: 'studios' } }), null);
  assert.equal(huesOf(null), null);
  assert.equal(await readHues(async () => answer([])), null);
  assert.equal(await readHues(async () => Promise.reject(new Error('offline'))), null);
  let asked: [string, unknown] | null = null;
  const found = await readHues(async (name, args) => {
    asked = [name, args];
    return answer([STUDIOS]);
  });
  assert.deepEqual(asked, ['huesWanted', {}]);
  assert.equal(found?.lists.length, 1);
});

test('THE PRESS\'S ANSWER IS THE LINE THE TOAST SAYS, WITH THE BATCH ITS UNDO TAKES', async () => {
  let sent: [string, unknown] | null = null;
  const out = await giveThrough(async (name, args) => {
    sent = [name, args];
    return { ok: true, value: { given: 6, batch: 'b-give' } };
  }, 'studios');
  assert.deepEqual(sent, ['giveHues', { list: 'studios' }]);
  assert.deepEqual(out, { ok: true, given: 6, batch: 'b-give', said: 'Gave 6 colours.' });
  assert.deepEqual(await giveThrough(async () => ({ ok: true, value: { given: 1, batch: 'b-one' } }), 'studios'), { ok: true, given: 1, batch: 'b-one', said: 'Gave 1 colour.' });
  /* NOTHING GIVEN IS NOTHING TO UNDO. */
  assert.deepEqual(await giveThrough(async () => ({ ok: true, value: { given: 0, batch: 'b-none' } }), 'studios'), { ok: true, given: 0, batch: '', said: 'There was nothing left to give a colour to.' });
  assert.equal(givenSaid(3), 'Gave 3 colours.');
});

test('THE RECORD\'S OWN ANSWERS ARE READ: a list\'s `name`, and a press\'s `gave` with `batch: null` at nought', async () => {
  /* AS `packages/record/src/methods/hues.ts` ANSWERS THEM, sentence and total included and ignored. */
  const read = { ok: true, value: { lists: [{ list: 'studios', name: 'Studios', count: 6, names: STUDIOS.names.slice(0, 5), said: '6 in Studios have no colour of their own.' }], total: 6 } };
  const found = huesOf(read);
  assert.deepEqual(found?.lists.map((l) => [l.list, l.title, l.count]), [['studios', 'Studios', 6]]);
  assert.equal(huesSaid(found!.lists[0]!), '6 studios have no colour of their own');
  assert.equal(namesSaid(found!.lists[0]!), 'Marrow Press, Juniper Hall, Lantern, Quillfield and 2 more');
  const gave = await giveThrough(async () => ({ ok: true, value: { list: 'studios', gave: 6, names: STUDIOS.names, batch: 'b-give' } }), 'studios');
  assert.deepEqual(gave, { ok: true, given: 6, batch: 'b-give', said: 'Gave 6 colours.' });
  const none = await giveThrough(async () => ({ ok: true, value: { list: 'studios', gave: 0, names: [], batch: null } }), 'studios');
  assert.deepEqual(none, { ok: true, given: 0, batch: '', said: 'There was nothing left to give a colour to.' });
});

test('A REFUSED PRESS SAYS THE RECORD\'S OWN SENTENCE, AND ANYTHING ELSE THAT NOTHING WAS SAVED', async () => {
  assert.deepEqual(await giveThrough(async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner gives colours.' } }), 'studios'), { ok: false, fix: 'Only the owner gives colours.' });
  assert.deepEqual(await giveThrough(async () => ({ ok: false, refusal: { code: 'FORBIDDEN' } }), 'studios'), { ok: false, fix: copy.recordNotReached });
  assert.deepEqual(await giveThrough(async () => ({ ok: true, value: { given: 'six' } }), 'studios'), { ok: false, fix: copy.recordNotReached });
  assert.deepEqual(await giveThrough(async () => Promise.reject(new Error('offline')), 'studios'), { ok: false, fix: copy.recordNotReached });
});

test('THROUGH THE RECORD AT A BASE, A DEAD LINE OR A HOST WITHOUT THE READ IS NOTHING', async () => {
  assert.equal(await loadHues('http://record.test', async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await loadHues('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadHues('http://record.test', async () => new Response('<html>', { status: 200 })), null);
  /* THE CLIENT ASKS ONLY WHAT ITS TABLE NAMES: before the route is in it the read never leaves the screen. */
  let path = '';
  const found = await loadHues('http://record.test', async (url) => {
    path = new URL(String(url)).pathname;
    return json(200, answer([STUDIOS]));
  });
  if (path !== '') assert.equal(found?.lists[0]?.title, 'Studios');
  else assert.equal(found, null);
  assert.equal((await give('http://record.test', 'studios', async () => Promise.reject(new Error('offline')))).ok, false);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('THE TILE IS FLAT, HAS NO BORDER OR SHADOW, ITS WORDS ARE 15 OR MORE, AND ITS UNDO IS THE BATCH\'S', () => {
  const part = readFileSync(new URL('./Hues.svelte', import.meta.url), 'utf8');
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  assert.match(style, /\.hues \{[^}]*border-radius: var\(--r-tile, 16px\);/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  for (const size of style.matchAll(/font-size: ([^;]+);/gu)) assert.match(size[1]!, /^var\(--fs-body(, 15px)?\)$/u);
  assert.match(style, /@media \(pointer: coarse\) \{[^@]*min-block-size: 44px;/u);
  /* UNDO GOES BACK THROUGH THE RECORD'S OWN LOG, by the batch the press answered. */
  assert.match(part, /undoChange\(apiBase\(\), batch\)/u);
  assert.match(part, /\{#if shown\.length > 0\}/u);
  /* NO EM DASH AND NO ROW IN WHAT A PERSON READS. */
  const words = [...Object.values(huesWords), huesSaid(STUDIOS), namesSaid(STUDIOS), givenSaid(6)].join(' ');
  assert.doesNotMatch(words, /—|\brows?\b/u);
  assert.doesNotMatch(bare(part).replace(/<style>[\s\S]*$/u, ''), /—/u);
});
