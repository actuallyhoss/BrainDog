/**
 * WHAT EACH OPTION OF ONE QUESTION IS, ON ITS OWN PAGE (`option-visual.ts`).
 *
 * EACH TEST FAILS ON A REVERT: hand `visualOf` no way to a file again and the picture test fails; write a swatch
 * straight from the body and the swatch test does; ask the record for a file nobody named and the last ones do.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import { queueOf } from '../../../lib/decide/card.ts';
import { visualOf as drawingOf } from '../../../lib/decide/option-visual.ts';
import { filesNamed, readFiles, visualsOf } from './option-visual.ts';

const SHA = 'a'.repeat(64);
const OPTIONS = [
  { id: 'warm', label: 'Warm', shows: { swatch: ['#aa3311', '#ffeecc'] } },
  { id: 'photo', label: 'The oak one', shows: { file: { row: 'parts#2', field: 'photo' } } },
  { id: 'cheap', label: 'The cheap one', shows: { figure: '£12' } },
  { id: 'plain', label: 'Neither' },
];

test('a picture option carries the address the page serves its file at', () => {
  const seen = visualsOf(OPTIONS, (row, field) => (row === 'parts#2' && field === 'photo' ? `/ana/api/files/${SHA}` : null));
  assert.deepEqual(seen.get('photo'), { file: { row: 'parts#2', field: 'photo', src: `/ana/api/files/${SHA}` } });
  assert.deepEqual(seen.get('warm'), { swatch: ['#aa3311', '#ffeecc'] });
  assert.deepEqual(seen.get('cheap'), { figure: '£12' });
  assert.equal(seen.has('plain'), false);
});

test('with no way to a file, a picture option reads by its name and the others are drawn', () => {
  const seen = visualsOf(OPTIONS);
  assert.equal(seen.has('photo'), false);
  assert.deepEqual([...seen.keys()], ['warm', 'cheap']);
});

test('a file served by another host is left out', () => {
  for (const src of ['https://elsewhere.example/p.png', '//elsewhere.example/p.png', '/\\elsewhere.example/p.png'])
    assert.equal(visualsOf(OPTIONS, () => src).has('photo'), false, src);
});

test('a swatch is held to the renderer\'s reading before it reaches a style', () => {
  const seen = visualsOf([
    { id: 'a', shows: { swatch: ['red'] } },
    { id: 'b', shows: { swatch: ['#aa3311;background:url(//x)'] } },
    { id: 'c', shows: { swatch: [' #AA3311 '] } },
  ]);
  assert.deepEqual([...seen], [['c', { swatch: ['#AA3311'] }]]);
});

test('options that are not options draw nothing', () => {
  assert.equal(visualsOf(undefined).size, 0);
  assert.equal(visualsOf('warm').size, 0);
  assert.equal(visualsOf([null, 'warm', { shows: { figure: '3' } }, { id: 7, shows: { figure: '3' } }]).size, 0);
});

test('the files a question names, once each', () => {
  const twice = [...OPTIONS, { id: 'again', shows: { file: { row: 'parts#2', field: 'photo' } } }, { id: 'bad', shows: { file: { row: '../x', field: 'photo' } } }];
  assert.deepEqual(filesNamed(twice), [{ row: 'parts#2', field: 'photo', list: 'parts', seq: 2 }]);
  assert.deepEqual(filesNamed(OPTIONS.filter((o) => o.id !== 'photo')), []);
});

test('a file is found in what the record holds and placed under the record', async () => {
  const asked: string[] = [];
  const get = async (list: string, seq: number) => {
    asked.push(`${list}#${seq}`);
    return { ok: true as const, value: { register: 'parts', seq: 2, version: 1, fields: { photo: { sha256: SHA, name: 'oak.png' } } } };
  };
  const file = await readFiles(get, OPTIONS, (path) => `/ana${path}`);
  assert.deepEqual(asked, ['parts#2']);
  assert.equal(file('parts#2', 'photo'), `/ana/api/files/${SHA}`);
  assert.equal(file('parts#2', 'other'), null);
  assert.equal(file('parts#3', 'photo'), null);
  assert.deepEqual(visualsOf(OPTIONS, file).get('photo'), { file: { row: 'parts#2', field: 'photo', src: `/ana/api/files/${SHA}` } });
});

test('a refused read, another list, and a value that is no file all leave the picture out', async () => {
  const place = (path: string) => path;
  const refused = await readFiles(async () => ({ ok: false as const }), OPTIONS, place);
  assert.equal(refused('parts#2', 'photo'), null);
  const other = await readFiles(async () => ({ ok: true as const, value: { register: 'people', seq: 2, fields: { photo: { sha256: SHA } } } }), OPTIONS, place);
  assert.equal(other('parts#2', 'photo'), null);
  for (const photo of ['oak.png', { sha256: '../../auth/session' }, { sha256: SHA.toUpperCase() }, null]) {
    const file = await readFiles(async () => ({ ok: true as const, value: { seq: 2, fields: { photo } } }), OPTIONS, place);
    assert.equal(file('parts#2', 'photo'), null);
  }
  const thrown = await readFiles(async () => Promise.reject(new Error('offline')), OPTIONS, place);
  assert.equal(thrown('parts#2', 'photo'), null);
});

test('a question with no picture asks the record for nothing', async () => {
  let asked = 0;
  await readFiles(async () => ((asked += 1), { ok: false as const }), OPTIONS.filter((o) => o.id !== 'photo'), (p) => p);
  assert.equal(asked, 0);
});

test('THE OPTIONS STAND SIDE BY SIDE, EACH WITH ITS DRAWING, and each card’s own button says its answer (today F9)', () => {
  /* AN OPTION AS IT WAS FILED, carrying the day it sets: the page hands it with its key and draws the date it moves to. */
  const q = queueOf({ id: 'SG2', title: 'Retire Tallow?', band: 'call', opened: '2026-10-01T00:00:00Z', options: [{ key: 'park', title: 'Park it', body: '' }, { key: 'retire', title: 'Retire it', body: '' }] });
  const drawn = drawingOf(q, { id: 'park', key: 'park', due: '2026-11-01' } as { key: string }, { now: Date.parse('2026-10-20T09:00:00Z'), home: null });
  assert.equal(drawn?.kind, 'date');
  assert.equal(drawingOf(q, { key: 'retire' }, { now: 0, home: null }), null, 'an option with nothing to draw draws nothing');

  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /data-across=\{question\.options\.length <= 2 \? '' : undefined\}/u, 'two options are a list again');
  assert.match(page, /<OptionVisual visual=\{drawn\} \/>/u, 'an option is drawn without its picture');
  assert.match(page, /\.dc-options \{\n\s+display: grid;\n\s+grid-template-columns: repeat\(auto-fit, minmax\(240px, 1fr\)\);/u);
  assert.match(page, /onclick=\{\(\) => void press\(option\.key\)\}\n\s+onkeydown=\{\(e\) => onChoiceKey\(e, option\.key\)\}\n\s+>\{#if bare\}\{said\}\{:else\}\{gate\.choose\}/u, 'a card’s button says its own answer, or Choose beside the name the card carries');
  assert.doesNotMatch(page, /id="gate-decide"/u, 'an Answer button under the cards gives the one chosen again');
});
