/**
 * NO SWITCH AND NO PROGRESS RING IS RED (batch 6, the Settings and Projects looks).
 *
 * WHAT WAS SEEN. Every "on" switch and every project's ring was the working accent, which is the brand's red, so a page of
 * add-ons read as a page of alarms and a project going to plan drew the colour that means late. Red means late or needs
 * you and nothing else (DIRECTION 42): an "on" switch and a ring that goes to plan are ink, a ring at risk is amber, and
 * only a ring that is off track is the late red.
 *
 * A TEXT TEST OVER THE STYLESHEETS, as `controls-segment.test.ts` is: every rule that draws a checked switch, or the
 * fill of a card's ring in its resting state, must name no red token. The late rule is the one place a ring may.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = (url: string): string => readFileSync(new URL(url, import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const rulesOf = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim().replaceAll(/\s+/gu, ' '), body: m[2]! }));

/** Every token that is the brand's red or the late red: the working accent, the brand, the danger ink and fill, late. */
const RED = /var\(--(?:action|on|brand|danger[\w-]*|status-late|late[\w-]*|chart-late[\w-]*)\)/u;

test('a checked switch is ink, on its track and on its thumb', () => {
  const css = rulesOf(sheet('controls.css'));
  const checked = css.filter((r) => /\.switch\[aria-checked='true'\]/u.test(r.selector));
  assert.ok(checked.length >= 2, 'the checked switch rules are gone');
  for (const r of checked) assert.doesNotMatch(r.body, RED, `${r.selector} draws a red switch`);
  const track = checked.find((r) => r.selector === ".switch[aria-checked='true'] .switch-track");
  assert.match(track?.body ?? '', /background:\s*var\(--ink\)/u, 'the on track is not ink');
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
