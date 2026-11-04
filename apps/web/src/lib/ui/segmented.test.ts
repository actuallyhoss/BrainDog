/**
 * The segmented control's sliding selection (`Segmented.svelte`): where the thumb sits is read from the
 * chosen segment's box and nothing else, and whether a move is drawn or jumped.
 *
 * The functions live in the component's module script, which Node cannot import, so this reads the lines between the
 * component's `thumb` marks, strips their types and runs them: the code under test is the code that ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Box = { left: number; top: number; width: number; height: number };
type Thumb = { x: number; y: number; w: number; h: number };
type Kit = {
  thumbOf: (chosen: Box | null, trackWidth: number, rtl?: boolean) => Thumb | null;
  wraps: (tops: readonly number[]) => boolean;
  slides: (move: { had: boolean; changed: boolean; wrapped: boolean; reduced: boolean }) => boolean;
  scrolls: (segments: number, needs: number, room: number) => boolean;
};

const FILE = process.env.SEGMENTED_SRC ?? join(dirname(fileURLToPath(import.meta.url)), 'Segmented.svelte');
const SOURCE = readFileSync(FILE, 'utf8');
const cut = /thumb:start[^\n]*\n([\s\S]*?)\n[^\n]*thumb:end/.exec(SOURCE);
assert.ok(cut, 'Segmented.svelte keeps its thumb marks');
const js = stripTypeScriptTypes(cut[1]!).replace(/^(\s*)export /gm, '$1');
const { thumbOf, wraps, slides, scrolls } = new Function(`${js}\nreturn { thumbOf, wraps, slides, scrolls };`)() as Kit;

/** Table, Board, Cards in a 240 track with 2 of padding and a gap of 2: the second is chosen. */
const BOARD: Box = { left: 72, top: 2, width: 76, height: 28 };

test('the thumb is the chosen segment: its left, its top, its width and its height', () => {
  assert.deepEqual(thumbOf(BOARD, 240), { x: 72, y: 2, w: 76, h: 28 });
});

test('a longer label is a wider thumb, with no number of its own', () => {
  assert.deepEqual(thumbOf({ ...BOARD, width: 131 }, 240), { x: 72, y: 2, w: 131, h: 28 });
});

test('nothing chosen is no thumb', () => {
  assert.equal(thumbOf(null, 240), null);
});

test('a segment with no box yet (the track is hidden) is no thumb', () => {
  assert.equal(thumbOf({ left: 0, top: 0, width: 0, height: 0 }, 0), null);
});

test('right to left, the thumb starts at the far edge and is moved back by what is left of the segment', () => {
  /* 240 wide, the segment's left at 72 and 76 wide: its right edge is 92 short of the track's. */
  assert.deepEqual(thumbOf(BOARD, 240, true), { x: -92, y: 2, w: 76, h: 28 });
});

test('one line does not wrap, two do, and a pixel of rounding is not a second line', () => {
  assert.equal(wraps([2, 2, 2]), false);
  assert.equal(wraps([2, 2.5, 2]), false);
  assert.equal(wraps([2, 2, 34]), true);
  assert.equal(wraps([]), false);
});

test('a new choice on one line slides', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: false, reduced: false }), true);
});

test('two wrapped lines give no transition', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: true, reduced: false }), false);
});

test('reduced motion gives no transition', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: false, reduced: true }), false);
});

test('the first placing is not a move, and neither is the same choice at a new size', () => {
  assert.equal(slides({ had: false, changed: true, wrapped: false, reduced: false }), false);
  assert.equal(slides({ had: true, changed: false, wrapped: false, reduced: false }), false);
});

test('a full track on a phone shares its width while its words fit, and scrolls when they do not or past four', () => {
  assert.equal(scrolls(3, 300, 358), false);
  assert.equal(scrolls(4, 358, 358), false);
  assert.equal(scrolls(3, 400, 358), true, 'a cut label shares instead of scrolling');
  assert.equal(scrolls(5, 200, 358), true, 'five segments squeezed into one row');
});

/**
 * A TRACK WHERE MORE THAN ONE CAN BE CHOSEN (`many`) HAS NO THUMB. One thumb under the first chosen segment slid
 * across to a second that already looked chosen when the first was switched off, a move that did not happen. A `many`
 * track draws none, and each chosen segment keeps the fill the sheet gives it.
 *
 * A TEXT TEST from here down, over the part and the sheet, as `segmented-callers.test.ts` is: there is no component
 * test in this tree.
 */

const noComments = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const PART = noComments(SOURCE);
const TRACK = /<svelte:element\b[\s\S]*?>/u.exec(PART)?.[0] ?? '';
const SHEET = noComments(readFileSync(join(dirname(FILE), 'controls.css'), 'utf8'));
const RULES = [...SHEET.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim().replaceAll(/\s+/gu, ' '), body: m[2]! }));

test('many is a prop of the part, and off unless it is asked for', () => {
  assert.match(PART, /\bmany = false,/u, 'the part takes no `many`, or it is on by default');
  assert.match(PART, /\bmany\?: boolean;/u);
});

test('full is a prop of the part, off unless asked for, and marks the track', () => {
  assert.match(PART, /\bfull = false,/u);
  assert.match(TRACK, /data-full=\{full \? '' : undefined\}/u);
  /* A STRIP THAT DOES NOT FIT SCROLLS ONLY WHERE IT IS A NAV; ANY OTHER WRAPS, every choice whole at 390. */
  assert.match(TRACK, /data-scroll=\{full && scroll && tag === 'nav' \? '' : undefined\}/u);
  assert.match(TRACK, /data-wrap=\{full && scroll && tag !== 'nav' \? '' : undefined\}/u);
});

test('on a phone a full track shares its width by its words, and one that does not fit wraps whole', () => {
  /* "Roomy" and "Doors" were cut at the edge: equal shares cut the longest word, and the strip ran past the page. */
  const style = /<style>([\s\S]*?)<\/style>/u.exec(SOURCE)?.[1] ?? '';
  const share = /\.segmented\[data-full\] > :global\(\.segment\) \{([^}]*)\}/u.exec(style)?.[1] ?? '';
  assert.match(share, /flex:\s*1 1 auto;/u);
  assert.match(share, /padding-inline:\s*var\(--sp-2\);/u);
  const wrap = /\.segmented\[data-full\]\[data-wrap\] \{([^}]*)\}/u.exec(style)?.[1] ?? '';
  assert.match(wrap, /flex-wrap:\s*wrap;/u);
});

test('a track given many is marked, and measures and draws no thumb', () => {
  assert.match(TRACK, /data-many=\{many \? '' : undefined\}/u, 'the track does not say it is one of many');
  /* It leaves before it watches a size or a mark, so nothing can place a thumb later. */
  const effect = /\$effect\(\(\) => \{([\s\S]*?)\n  \}\);/u.exec(PART)?.[1] ?? '';
  const leaves = effect.indexOf('if (many) {');
  assert.ok(leaves >= 0, 'the effect does not leave for a track of many');
  assert.match(effect.slice(leaves, effect.indexOf('}', leaves)), /thumb = null;\s*return;/u);
  assert.ok(leaves < effect.indexOf('frameResizeObserver('), 'a track of many is measured');
  assert.ok(leaves < effect.indexOf('new MutationObserver'), 'a track of many is watched');
});

test('on a track given many, each chosen segment fills itself: the raised fill and its tier, and nothing takes it off', () => {
  /* What the part draws for it: `data-slides` and `data-many`, and never `data-thumb`. */
  assert.match(TRACK, /data-slides=""/u, 'the track is no longer marked as the part\'s');
  const reach = RULES.filter((r) => /\.segment\[data-on\]$/u.test(r.selector) && !r.selector.includes('[data-thumb'));
  /* THE CHOSEN SEGMENT IS `--segment-on`, raised by `--shadow-raised` (16c348089, ops-look SPEC 3.3), and no rule takes
     either off a track of many. */
  assert.deepEqual(reach.map((r) => r.selector), ['.segment[data-on]']);
  assert.match(reach[0]!.body, /background:\s*var\(--segment-on\)/u);
  assert.match(reach[0]!.body, /box-shadow:\s*var\(--shadow-raised\)/u);
});

test('a track without many is unchanged: the thumb goes under its chosen segment and the sheet clears the fill there', () => {
  assert.match(PART, /segments\.find\(\(s\) => s\.hasAttribute\('data-on'\)\)/u);
  assert.match(TRACK, /data-thumb=\{thumb \? \(slide \? 'slide' : 'jump'\) : undefined\}/u);
  const under = RULES.find((r) => r.selector === '.segmented[data-thumb] > .segment[data-on]');
  assert.ok(under, 'the rule under the thumb is gone');
  assert.match(under.body, /background:\s*none/u);
});
