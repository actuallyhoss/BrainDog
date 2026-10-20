/**
 * A SWITCH THAT IS ON IS INK; NO PROGRESS RING IS RED SHORT OF LATE.
 *
 * WHAT WAS DECIDED (20 Oct plan, kept in the UI pass). An "on" switch is ink with a knob in the tile colour, because red
 * on a page of add-ons read as six alarms; red stays for late and needs you. An off switch is the 3:1 grey
 * (`--switch-off`), so it no longer reads as on. A project's ring still goes to plan in ink and is red only off track.
 *
 * A TEXT TEST OVER THE STYLESHEETS, as `controls-segment.test.ts` is: the checked switch names ink and never red as
 * words or late; the fill of a card's ring in its resting state names no red token. The late rule is the one place a
 * ring may.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = (url: string): string => readFileSync(new URL(url, import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const rulesOf = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim().replaceAll(/\s+/gu, ' '), body: m[2]! }));

/** Every token that is the brand's red or the late red: the working accent, the brand, the danger ink and fill, late. */
const RED = /var\(--(?:action|on|brand|danger[\w-]*|status-late|late[\w-]*|chart-late[\w-]*)\)/u;

test('a checked switch is the red fill with its label on the knob, and an off switch is the 3:1 grey', () => {
  const css = rulesOf(sheet('controls.css'));
  const checked = css.filter((r) => /\.switch\[aria-checked='true'\]/u.test(r.selector));
  assert.ok(checked.length >= 2, 'the checked switch rules are gone');
  /* Never red as words or marks, never late: only the fill. */
  const WORDS = /var\(--(?:red|danger[\w-]*|status-late|late[\w-]*|chart-late[\w-]*|action-text|link)\)/u;
  for (const r of checked) assert.doesNotMatch(r.body, WORDS, `${r.selector} draws a switch in red words or late`);
  const track = checked.find((r) => r.selector === ".switch[aria-checked='true'] .switch-track");
  assert.match(track?.body ?? '', /background:\s*var\(--ink\)/u, 'the on track is not ink');
  const knob = checked.find((r) => r.selector === ".switch[aria-checked='true'] .switch-track::after");
  assert.match(knob?.body ?? '', /background:\s*var\(--tile\)/u, 'the knob on an on switch is not the tile colour');
  const off = css.find((r) => r.selector === '.switch-track');
  assert.match(off?.body ?? '', /background:\s*var\(--switch-off\)/u, 'the off track is not the 3:1 grey');
  assert.match(off?.body ?? '', /inline-size:\s*36px/u);
  assert.match(off?.body ?? '', /block-size:\s*20px/u);
});

test('a card ring goes to plan in ink, and is red only when it is off track', () => {
  const css = rulesOf(sheet('../../../../../packages/skin/kinds/cards.css'));
  const fill = css.filter((r) => /\.cards-ring-fill/u.test(r.selector));
  const resting = fill.find((r) => r.selector === '.cards-ring-fill');
  assert.ok(resting, 'the resting ring rule is gone');
  assert.doesNotMatch(resting.body, RED, 'a ring that goes to plan is red');
  assert.match(resting.body, /stroke:\s*var\(--ink\)/u);
  for (const r of fill.filter((x) => x !== resting && !/data-intent='bad'/u.test(x.selector))) assert.doesNotMatch(r.body, RED, `${r.selector} is red short of late`);
});
