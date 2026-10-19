/**
 * What BrainDog arranged today, on Home: the record's `handled` as a few lines with their reasons, nothing at nought or
 * on a host that does not answer the read, and the tile reached by a dynamic import only.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { HANDLED_SHOWN, HANDLED_WORDS, handledOf, handledTile, loadHandled, readHandled } from './handled.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const line = (n: number) => ({ decision: `D${String(n)}`, line: `Change the last seen of project ${String(n)}`, why: 'It only arranges your own rows.', at: '2026-10-20T08:00:00.000Z' });
const answer = (rows: unknown[], more: unknown = 0) => ({ ok: true as const, value: { rows, more } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('THE FIRST FIVE LINES, then "and N more" for the rest and what the record held back', () => {
  const tile = handledTile(handledOf(answer([1, 2, 3, 4, 5, 6, 7].map(line), 2)));
  assert.equal(HANDLED_SHOWN, 5);
  assert.equal(tile?.heading, HANDLED_WORDS.heading);
  assert.deepEqual(tile?.lines.map((l) => l.decision), ['D1', 'D2', 'D3', 'D4', 'D5']);
  assert.equal(tile?.more, 'and 4 more');
  assert.equal(handledTile(handledOf(answer([line(1)])))?.more, '');
});

test('A LINE WITH NO DECISION, NO WORDS OR AN ID FOR WORDS IS DROPPED, AND EM DASHES ARE SAID PLAINLY', () => {
  const found = handledOf(answer([{ ...line(1), decision: '' }, { ...line(2), line: '' }, { ...line(3), line: ULID }, { ...line(4), why: 'Seen today — so it moved' }, 'x', null]));
  assert.deepEqual(found?.rows.map((r) => r.decision), ['D4']);
  assert.equal(found?.rows[0]?.why, 'Seen today, so it moved');
});

test('A REFUSAL, A SHAPE OF ANOTHER KIND AND NOUGHT ARE ALL NOTHING', async () => {
  assert.equal(handledOf({ ok: false, refusal: { code: 'ROUTE_UNKNOWN' } }), null);
  assert.equal(handledOf({ ok: true, value: { rows: 'no' } }), null);
  assert.equal(handledTile(null), null);
  assert.equal(await readHandled(async () => answer([])), null);
  assert.equal(await readHandled(async () => { throw new Error('down'); }), null);
  assert.equal(await loadHandled('http://x.test', async () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } })), null);
});

test('THE TILE IS REACHED BY A DYNAMIC IMPORT, never from a file every screen loads', () => {
  const home = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /import\('\.\/handled\.ts'\)/);
  assert.doesNotMatch(home, /^\s*import .* from '\.\/handled\.ts'/mu);
});
