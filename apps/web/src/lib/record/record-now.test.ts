/**
 * One clock: `recordNow()` is the record's instant from its `boot`, ticking on, and every screen that says late,
 * today or this month reads it.
 *
 * TWO CLOCKS SAID TWO DAYS. The list measured a bill against the record's `now` and the bill's own page against the
 * browser's, so the seed's "Legal review, February" was 64 days late in the list and overdue by 111 on its page, and
 * Usage offered October on a record whose today is 3 September. These hold the clock, and hold the screens to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './fixtures/fill.ts';
import { forget, forgetNow, learnNow, readBoot, recordNow, type Fetch } from './boot-live.ts';

const SEPT = '2026-09-03T09:00:00.000Z';

test("THE RECORD'S CLOCK IS ITS BOOT'S INSTANT, ticking on from when it landed", () => {
  forgetNow();
  /* Landed 50ms ago: the clock has moved on by about that, never back and never by the browser's date. */
  learnNow(SEPT, performance.now() - 50);
  const ran = recordNow() - Date.parse(SEPT);
  assert.ok(ran >= 50, `the clock ran behind the record by ${50 - ran}ms`);
  assert.ok(ran < 1_000, `the clock ran ${ran}ms ahead`);
  forgetNow();
});

test("WITH NO BOOT IT IS THE BROWSER'S CLOCK, and a value that is not a date changes nothing", () => {
  forgetNow();
  const before = Date.now();
  assert.ok(Math.abs(recordNow() - before) < 1_000);
  learnNow(SEPT, performance.now());
  learnNow('not a day');
  learnNow(null);
  assert.ok(Math.abs(recordNow() - Date.parse(SEPT)) < 1_000, 'a bad value moved the clock');
  forgetNow();
});

test('A BOOT THAT ANSWERS SETS THE CLOCK, so the first screen is already on it', async () => {
  forget();
  forgetNow();
  const boot = { registers: [], now: SEPT, waiting: [], record: { slug: 'the-studio', name: 'The Studio', locale: 'en', currency: 'GBP' }, me: { kind: 'person', person: 'p_1', name: 'Ada', level: 'write' }, pages: [] };
  const io = (async () => new Response(JSON.stringify({ ok: true, value: boot }), { status: 200, headers: { 'content-type': 'application/json' } })) as Fetch;
  assert.equal((await readBoot('http://record.test/app', io)).from, 'live');
  assert.ok(Math.abs(recordNow() - Date.parse(SEPT)) < 5_000, `the clock read ${new Date(recordNow()).toISOString()}`);
  forget();
  forgetNow();
});

/**
 * EVERY SCREEN THE REVIEW FOUND ON THE BROWSER'S CLOCK, read as text: a `Date.now()` back in one of them is the second
 * clock coming back. Comments are taken out first, since a sentence may name the thing it replaced.
 */
const SCREENS = [
  '../../routes/r/[register]/[seq]/+page.svelte',
  '../../routes/v/[view]/+page.svelte',
  '../../routes/usage/+page.svelte',
  '../page/shape-answer.ts',
];
/* AND THE SCREENS HANDED THEIR DAY BY ONE THAT READS IT: the Path and Money of a project are drawn from the shape's read,
   on its day (`shape-hold.svelte.ts`) (proj F3), and read no clock of their own, nor
   do the parts drawn from it (`ProjectPart.svelte`). The shape itself comes with the page's own answer
   and is turned once (`shape-answer.ts`), on the record's day (scope 2026-10-24 A20). */
const HANDED = ['../page/ProjectVisuals.svelte', '../page/ProjectPart.svelte', '../page/shape-hold.svelte.ts'];

test('THE ROW PAGE, THE SAVED VIEW, USAGE AND A PROJECT READ THE RECORD’S CLOCK, never the browser’s', () => {
  for (const file of SCREENS) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    assert.doesNotMatch(code, /Date\.now\(\)|new Date\(\)/u, `${file} reads the browser's clock`);
    assert.match(code, /recordNow\(\)/u, `${file} reads no clock at all`);
  }
  for (const file of HANDED) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /Date\.now\(\)|new Date\(\)/u, `${file} reads the browser's clock`);
  }
});

test("A SCRIPT'S STATE IS SAID ON THE RECORD'S CLOCK when its caller names none", () => {
  const code = readFileSync(new URL('./scripts.ts', import.meta.url), 'utf8');
  assert.match(code, /export function stateOf\([^)]*now: number = recordNow\(\)\)/u);
});
