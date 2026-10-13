/**
 * The rail's edge cue (`Sidebar.svelte`): which edges of its scroller fade, said from `scrollTop`, `clientHeight` and
 * `scrollHeight` alone, and how far a row the keyboard lands on is scrolled to be seen.
 *
 * The two functions live in the component's module script, which Node cannot import, so this reads the lines between
 * the component's `edge-cue` marks, strips their types and runs them: the code under test is the code that ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Cue = { above: boolean; below: boolean };
type Kit = {
  EDGE_FADE: number;
  edgeCue: (scrollTop: number, clientHeight: number, scrollHeight: number) => Cue;
  focusShift: (top: number, bottom: number, viewTop: number, viewBottom: number, fade?: number) => number;
};

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Sidebar.svelte'), 'utf8');
const cut = /edge-cue:start[^\n]*\n([\s\S]*?)\n[^\n]*edge-cue:end/.exec(SOURCE);
assert.ok(cut, 'Sidebar.svelte keeps its edge-cue marks');
const js = stripTypeScriptTypes(cut[1]!).replace(/^(\s*)export /gm, '$1');
const { EDGE_FADE, edgeCue, focusShift } = new Function(`${js}\nreturn { EDGE_FADE, edgeCue, focusShift };`)() as Kit;

/** The rail at 1512x900 with a group cut off: 620 of room for 780 of rows. */
const ROOM = 620;
const ROWS = 780;

test('nothing is drawn when everything fits', () => {
  assert.deepEqual(edgeCue(0, ROOM, ROOM), { above: false, below: false });
  assert.deepEqual(edgeCue(0, ROOM, 400), { above: false, below: false });
});

test('a rail with more below fades at the foot, and only there, before it is scrolled', () => {
  assert.deepEqual(edgeCue(0, ROOM, ROWS), { above: false, below: true });
});

test('part way down, both edges say there is more', () => {
  assert.deepEqual(edgeCue(80, ROOM, ROWS), { above: true, below: true });
});

test('the foot cue goes at the end', () => {
  assert.deepEqual(edgeCue(ROWS - ROOM, ROOM, ROWS), { above: true, below: false });
});

test('a fraction of a pixel is not more: a zoomed page rests short of the end, and overhangs by less than one', () => {
  assert.deepEqual(edgeCue(ROWS - ROOM - 0.5, ROOM, ROWS), { above: true, below: false });
  assert.deepEqual(edgeCue(0.4, ROOM, ROWS), { above: false, below: true });
  assert.deepEqual(edgeCue(0, ROOM, ROOM + 1), { above: false, below: false });
});

test('a rubber-band overscroll past either end draws no cue on that side', () => {
  assert.deepEqual(edgeCue(-30, ROOM, ROWS), { above: false, below: true });
  assert.deepEqual(edgeCue(ROWS - ROOM + 30, ROOM, ROWS), { above: true, below: false });
});

test('a scroller not laid out yet (every number 0, or not a number) draws nothing', () => {
  assert.deepEqual(edgeCue(0, 0, 0), { above: false, below: false });
  assert.deepEqual(edgeCue(Number.NaN, Number.NaN, Number.NaN), { above: false, below: false });
});

test('the CSS fades as far as the function clears', () => {
  assert.equal(EDGE_FADE, 24);
  assert.match(SOURCE, /--edge: 24px;/);
});

test('a focused row below the view is scrolled up clear of the foot fade', () => {
  // The view is 100 to 720; a 36-tall row starts at 730.
  assert.equal(focusShift(730, 766, 100, 720), 766 - (720 - EDGE_FADE));
});

test('a focused row under the foot fade, though inside the view, is still taken clear of it', () => {
  assert.equal(focusShift(690, 726, 100, 720) > 0, true);
  assert.equal(focusShift(700, 716, 100, 720), 716 - 696);
});

test('a focused row above the view is scrolled down clear of the head fade', () => {
  assert.equal(focusShift(60, 96, 100, 720), 60 - (100 + EDGE_FADE));
});

test('a focused row already in the clear does not move the rail', () => {
  assert.equal(focusShift(300, 336, 100, 720), 0);
  assert.equal(focusShift(100 + EDGE_FADE, 720 - EDGE_FADE, 100, 720), 0);
});

test('a row taller than the clear part is taken to its top, never past it', () => {
  // 700 tall in a 620 view: scrolling by the whole overhang would hide its top.
  assert.equal(focusShift(200, 900, 100, 720), 200 - (100 + EDGE_FADE));
});

/* THE FIRST PAINT (batch 60). The owner's rail at 1512x900 stopped 3px into the Dashboard group's first row, with the
   rest of that 34px row and nothing else below, and no cue drew until somebody scrolled. */

/** Everything in the component's own script, where the measure is wired. */
const SCRIPT = SOURCE.slice(SOURCE.indexOf('<script lang="ts">'), SOURCE.indexOf('<style>'));
/** The effect that watches the scroller, from its first line to the next function. */
const WATCH = SCRIPT.slice(SCRIPT.indexOf('$effect(() => {\n    const el = scroller;'), SCRIPT.indexOf('function seen('));

test('one row cut off at the foot is more below, before any scroll', () => {
  assert.deepEqual(edgeCue(0, 446, 446 + 31), { above: false, below: true });
  assert.deepEqual(edgeCue(0, 446, 446 + 2), { above: false, below: true });
});

test('the same rail in a taller window, where the last group fits, draws nothing', () => {
  assert.deepEqual(edgeCue(0, 664, 477), { above: false, below: false });
  assert.deepEqual(edgeCue(0, 477, 477), { above: false, below: false });
});

test('a rail that grows after it was measured says so on the next measure, with no scroll between', () => {
  // The rows before the faces and the tokens are in, then after: the box is the same, the content is not.
  assert.deepEqual(edgeCue(0, 446, 430), { above: false, below: false });
  assert.deepEqual(edgeCue(0, 446, 477), { above: false, below: true });
});

test('the measure runs on mount, on the frame after, and on resize, not only on a scroll', () => {
  assert.ok(WATCH.length > 0, 'the watching effect is where this test looks for it');
  assert.match(WATCH, /untrack\(\(\) => \{\s*watch\(\);\s*measure\(\);/);
  assert.match(WATCH, /requestAnimationFrame\(measure\)/);
  assert.match(WATCH, /addEventListener\('resize', measure\)/);
  assert.match(WATCH, /removeEventListener\('resize', measure\)/);
});

test('the size watch is on the scroller and on every group in it, so rows that grow are measured again', () => {
  assert.match(WATCH, /new ResizeObserver\(measure\)/);
  assert.match(WATCH, /size\?\.observe\(el\);\s*for \(const group of el\.children\) size\?\.observe\(group\);/);
  // A group that arrives later is watched too.
  assert.match(WATCH, /new MutationObserver\(\(\) => \{\s*watch\(\);\s*measure\(\);/);
});

test('the foot draws a painted mark as well as the fade, off until there is more below', () => {
  assert.match(SOURCE, /<span class="more-below" aria-hidden="true" data-on=\{edges\.below \? '' : undefined\}>/);
  const rule = /\n  \.more-below \{([^}]*)\}/.exec(SOURCE)?.[1] ?? '';
  assert.match(rule, /opacity: 0;/);
  assert.match(rule, /block-size: 0;/, 'it takes no room, so nothing moves when it comes and goes');
  assert.match(SOURCE, /\.more-below\[data-on\] \{\s*opacity: 1;/);
  assert.match(SOURCE, /\.more-below::before \{[^}]*border-block-start: 1px solid var\(--rule\);/);
});

test('the painted mark names roles, never a colour', () => {
  const from = SOURCE.indexOf("/* THE FOOT'S PAINTED CUE");
  const css = SOURCE.slice(from, SOURCE.indexOf('/* AN AUTHOR RULE', from));
  assert.ok(from > 0 && css.length > 0);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i);
});
