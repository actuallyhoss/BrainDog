/**
 * ARRANGE AND CHANGE THIS PAGE ARE HANDED ONLY THE BLOCKS THE PAGE DECLARES.
 *
 * WHAT WAS MEASURED. A page with a tile converted at rates that are out of date draws one note under everything, which
 * the reader adds and the page never declared (`page-live.ts` `footed`, marked `synthetic`). The part handed Arrange
 * every block it drew, the note among them, so Done counted one more block than the page stores and the save was
 * refused as "this page changed" on a page nobody had touched. Pin this named the note's key as well.
 *
 * THE SAVE IS RUN HERE, against the count the part hands over. The handing itself is A TEXT TEST OVER MARKUP, for the
 * reason `segmented-view.test.ts` gives: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../record/fixtures/fill.ts';
import { copy } from '../copy.ts';
import { blockOf, footed, type LiveBlock } from '../record/page-live.ts';
import type { Fetch as ClientFetch } from '../record/pages-live.ts';
import { saveArrangement } from '../record/page-write.ts';

/** The part's source without its comments, so a comment quoting a call cannot fail or pass a check. */
const text = readFileSync(new URL('./PageView.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const flat = (s: string) => s.replaceAll(/\s+/gu, ' ');
const scripts = flat([...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!).join('\n'));
const markup = flat(text.replaceAll(/<style[\s\S]*?<\/style>/gu, '').replaceAll(/<script[\s\S]*?<\/script>/gu, ''));

/** Every `<Name … />` the markup draws, whole: to its own `/>`, since an attribute may hold an arrow. */
const tags = (name: string) => markup.split(`<${name} `).slice(1).map((rest) => rest.slice(0, rest.indexOf('/>')));

const NOW = Date.parse('2026-10-13T09:00:00Z');
const BASE = 'http://record.test';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The page as the record stores it: two blocks, and no note about rates. */
const BODY = {
  page: 'money',
  title: 'Money',
  blocks: [
    { kind: 'stat', heading: 'Money', cells: [{ metric: 'overdue' }] },
    { kind: 'table', source: 'register.invoices', columns: ['title'] },
  ],
};

/** The same page as the reader draws it, its one tile converted at rates that are out of date. */
function drawn(): LiveBlock[] {
  const fx = { into: 'EGP', home: 'EGP', asOf: '2026-09-28', forward: false, stale: true, missing: [] };
  const reading = { value: 4200000, unit: 'EGP', rows: 3, held: 3, met: null, refusals: [], fx };
  const answered = [
    { ...BODY.blocks[0], readings: [{ metric: 'overdue', label: 'Owed', reading }], rows: [], matched: 0, refusals: [] },
    { ...BODY.blocks[1], rows: [], matched: 0, refusals: [] },
  ] as never[];
  return footed(answered, answered.map((b) => blockOf(b, new Map(), NOW)), NOW, []);
}

/** What the part keeps of the blocks it was answered: the ones the page declares. */
const declaredOnly = (blocks: readonly LiveBlock[]) => blocks.filter((b) => !b.synthetic);

function host(): { io: ClientFetch; sets: unknown[] } {
  const sets: unknown[] = [];
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/page')) return json(200, { ok: true, value: { ...BODY, blocks: BODY.blocks.map((b) => ({ ...b, rows: [], drawn: true })) } });
    sets.push(init?.body ? JSON.parse(String(init.body)) : null);
    return json(200, { ok: true, value: { id: 'page.money' } });
  };
  return { io, sets };
}

test('a page with the note about rates saves its arrangement against the blocks it stores', async () => {
  const blocks = drawn();
  assert.equal(blocks.length, 3, 'two blocks and the note under them');
  assert.equal(blocks.at(-1)!.synthetic, true);

  /* EVERY BLOCK DRAWN, the note among them, is one more than the page stores, and nothing is written. */
  const off = host();
  assert.deepEqual(await saveArrangement(BASE, 'money', blocks.length, [{ i: 1, span: 12 }, { i: 0, span: 12 }], [], off.io), { from: 'refused', fix: copy.arrangeMoved });
  assert.equal(off.sets.length, 0);

  /* THE BLOCKS THE PAGE DECLARES are the stored body's, and Done is written. */
  const held = declaredOnly(blocks);
  assert.equal(held.length, BODY.blocks.length);
  assert.deepEqual(held, blocks.slice(0, 2), 'each declared block keeps its place, so every write still finds it');
  const on = host();
  const out = await saveArrangement(BASE, 'money', held.length, [{ i: 1, span: 12 }, { i: 0, span: 12 }], [], on.io);
  assert.equal(out.from, 'written');
  assert.deepEqual((on.sets[0] as { body: { blocks: { kind: string }[] } }).body.blocks.map((b) => b.kind), ['table', 'stat']);
});

test('the part keeps the declared blocks apart from what the reader added', () => {
  assert.match(scripts, /const declaredOnly = \(blocks: readonly LiveBlock\[\]\)(?:: LiveBlock\[\])? => blocks\.filter\(\(b\) => !b\.synthetic\);/u);
  const laid = scripts.slice(scripts.indexOf('const laidFrom'), scripts.indexOf('const own = $derived'));
  assert.match(laid, /declaredOnly\(/u, 'what the page is laid out from is what it declares');
  assert.match(scripts, /const own = \$derived<LiveBlock\[\]>\(live \? \[\.\.\.laidFrom, \.\.\.extra\.map\(\(b\) => added\(b, laidFrom\)\)\] : \[\]\);/u, 'declared, then added, and nothing between them');
});

test('Arrange is handed the declared blocks and the added ones, never the note', () => {
  const arranges = tags('Arrange');
  assert.equal(arranges.length, 2, 'the page head and the home');
  assert.match(arranges[0]!, /declared=\{declaredOnly\(live\.page\.blocks\)\}/u, 'a page at its own address, as the record answered it');
  assert.match(arranges[1]!, /declared=\{laidFrom\}/u, 'a home, over the body it reads to arrange');
  for (const tag of arranges) {
    assert.match(tag, /all=\{own\}/u, 'the slots it opens on are counted from the same blocks');
    assert.doesNotMatch(tag, /declared=\{live\.page\.blocks\}/u);
    assert.doesNotMatch(tag, /\{all\}/u);
  }
});

test('the note is drawn under everything, and not while an arrangement is in force', () => {
  const all = /const all = \$derived<LiveBlock\[\]>\((.*?)\);/u.exec(scripts)?.[1] ?? '';
  assert.match(all, /arrangement\.editing \|\| arrangement\.slots !== null \? own : \[\.\.\.own, \.\.\.feet\]/u);
  assert.match(scripts, /const feet = \$derived<LiveBlock\[\]>\(toArrange \? \[\] : \(live\?\.page\.blocks \?\? \[\]\)\.filter\(\(b\) => b\.synthetic\)\);/u);
});

test('Pin this names only the blocks the page declares', () => {
  const keys = scripts.slice(scripts.indexOf('function drawnKeys()'));
  assert.match(keys.slice(0, keys.indexOf('.map((i) => keyed[i]!)')), /const blocks = arranged\(declaredOnly\(live\?\.page\.blocks \?\? \[\]\)\);/u);
});
