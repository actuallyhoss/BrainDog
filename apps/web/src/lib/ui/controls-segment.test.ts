/**
 * THE CHOSEN SEGMENT IS RAISED, AND NOTHING CASTS A SHADOW (SPEC 2.A.9, frame F23, SPEC 1.9).
 *
 * WHAT WAS SEEN. In dark the chosen segment was darker than its track, so it read as pressed in; and a track written by
 * hand drew a hairline and a breath of shadow round it. The chosen segment is `--segment-on` now, white in light and a
 * step lighter than the track in dark, with the ink at 600, and the raised fill is the shape: no hairline, no shadow.
 *
 * A TEXT TEST OVER THE STYLESHEET, as `segmented-callers.test.ts` is over markup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('controls.css', import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** Every rule as its selector and its body. No rule in the sheet nests braces inside a segment's rule. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim().replaceAll(/\s+/gu, ' '), body: m[2]! }));
const chosen = rules.filter((r) => /\.segment\[data-on\]/u.test(r.selector));

test('the chosen segment is raised, in the ink at 600, on every track', () => {
  const plain = chosen.find((r) => r.selector === '.segment[data-on]');
  assert.ok(plain, 'the plain rule for a chosen segment is gone');
  assert.match(plain.body, /background:\s*var\(--segment-on\)/u);
  assert.match(plain.body, /color:\s*var\(--ink\)/u);
  assert.match(plain.body, /font-weight:\s*var\(--fw-semi\)/u);
});

/* THE OPS STYLE (16c348089, ops-look SPEC 3.2): the track and every segment are capsules, the track on the soft fill. */
test('the track is the well, a segment is a capsule inside it, and the others are the second ink', () => {
  const track = rules.find((r) => r.selector === '.segmented');
  assert.match(track?.body ?? '', /background:\s*var\(--soft-fill\)/u);
  assert.match(track?.body ?? '', /border-radius:\s*var\(--r-pill\)/u);
  const segment = rules.find((r) => r.selector === '.segment');
  assert.match(segment?.body ?? '', /border-radius:\s*var\(--r-pill\)/u);
  assert.match(segment?.body ?? '', /color:\s*var\(--ink-2\)/u);
  assert.match(segment?.body ?? '', /font-size:\s*var\(--fs-ctl\)/u);
});

/* SPEC 3.3: `--shadow-raised` is the segmented thumb's. What is chosen is raised by that tier, and nothing else casts. */
test('only what is chosen is raised, by the tier, and no other rule draws a hairline or a shadow on a segment', () => {
  const raises = new Set(['.segment[data-on]', '.segmented[data-thumb]::before']);
  for (const r of rules.filter((x) => /\.segment/u.test(x.selector))) {
    if (raises.has(r.selector)) assert.match(r.body, /box-shadow:\s*var\(--shadow-raised\), inset 0 0 0 0\.5px var\(--g-sel-line\);/u, `${r.selector} is not the raised tier`);
    else assert.doesNotMatch(r.body, /box-shadow:(?!\s*none)/u, `${r.selector} casts or rings a segment`);
  }
});

test('the thumb is the selection, and no rule is left for a second chosen one', () => {
  const under = chosen.find((r) => r.selector === '.segmented[data-thumb] > .segment[data-on]');
  assert.ok(under, 'the rule under the thumb is gone');
  assert.match(under.body, /background:\s*none/u);
  const thumb = rules.find((r) => r.selector === '.segmented[data-thumb]::before');
  assert.match(thumb?.body ?? '', /background:\s*var\(--segment-on\)/u);
  /* A track where more than one can be chosen is given `many` and draws no thumb, so nothing is chosen beside one. */
  assert.ok(!chosen.some((r) => /~\s*\.segment\[data-on\]/u.test(r.selector)), 'a rule for a second chosen segment is back');
});

test('a page-level control on a phone fills the row, and one that scrolls fades at its end', () => {
  const full = rules.find((r) => r.selector === '.segmented[data-full]');
  assert.match(full?.body ?? '', /inline-size:\s*100%/u);
  const scrolls = rules.find((r) => r.selector === '.segmented[data-full][data-scrolls]');
  assert.match(scrolls?.body ?? '', /overflow-x:\s*auto/u);
  assert.match(scrolls?.body ?? '', /scrollbar-width:\s*none/u);
  assert.match(scrolls?.body ?? '', /mask-image:\s*linear-gradient\(to right, [^,]+ calc\(100% - 24px\), transparent\)/u);
});
