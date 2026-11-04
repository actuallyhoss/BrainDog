/**
 * The Inbox's days, its sentence and its tile: grouped on the reader's own clock, red only for what has waited, and
 * every figure the record's own tally.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { dayLabel, daysOf, figureOf, sentenceOf, whoFiledOf } from './days.ts';

/* Noon on Wednesday 30 September 2026, on this machine's own clock, so every day below is a local one. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOON = at(2026, 9, 30);
const iso = (ms: number) => new Date(ms).toISOString();

test('a day is headed Today, Yesterday, then by its weekday and date, with the year only when it is not this one', () => {
  assert.equal(dayLabel('2026-09-30', '2026-09-30'), 'Today');
  assert.equal(dayLabel('2026-09-29', '2026-09-30'), 'Yesterday');
  assert.equal(dayLabel('2026-09-28', '2026-09-30'), 'Mon 28 Sep');
  assert.equal(dayLabel('2025-12-31', '2026-09-30'), 'Wed 31 Dec 2025');
});

test('arrivals are grouped by the day they came, newest first, in the order they were handed', () => {
  const items = [
    { id: 'a', arrived: iso(at(2026, 9, 30, 9)) },
    { id: 'b', arrived: iso(at(2026, 9, 30, 8)) },
    { id: 'c', arrived: iso(at(2026, 9, 29, 23)) },
    { id: 'd', arrived: iso(at(2026, 9, 27, 7)) },
  ];
  const days = daysOf(items, NOON);
  assert.deepEqual(days.map((d) => [d.label, d.items.map((i) => i.id).join('')]), [['Today', 'ab'], ['Yesterday', 'c'], ['Sun 27 Sep', 'd']]);
  assert.deepEqual(daysOf([{ id: 'x', arrived: 'not a time' }], NOON).map((d) => d.label), ['Today']);
});

test('the sentence counts what waits, adds the rules, and is red only once the oldest has waited two days', () => {
  const tally = { waiting: 3, filed: 40, archived: 2, ruled: 12 };
  assert.deepEqual(sentenceOf(tally, iso(NOON - 86_400_000), NOON), { text: '3 things wait on you; rules filed 12 this week.' });
  assert.deepEqual(sentenceOf(tally, iso(NOON - 3 * 86_400_000), NOON), { text: '3 things wait on you; rules filed 12 this week.', needs: '3 things wait on you' });
  assert.deepEqual(sentenceOf({ ...tally, waiting: 1, ruled: null }, null, NOON), { text: '1 thing waits on you.' });
  assert.deepEqual(sentenceOf({ ...tally, ruled: 0 }, null, NOON), { text: '3 things wait on you; no rule filed anything this week.' });
  assert.equal(sentenceOf({ ...tally, waiting: 0 }, null, NOON), null, 'an inbox with nothing waiting is the empty state');
  assert.equal(sentenceOf(null, null, NOON), null, 'no tally is no sentence, never a guessed count');
});

test('the tile: rules this week as the figure, what waits in ink, and filed earlier never said as a week', () => {
  const tile = whoFiledOf({ waiting: 3, filed: 40, archived: 2, ruled: 12 });
  assert.ok(tile);
  assert.equal(tile.figure, 12);
  assert.deepEqual(tile.parts.map((p) => [p.label, p.value, p.tone]), [['By rules', 12, 'g2'], ['Earlier', 28, 'g4'], ['Waiting', 3, 'ink']]);
  assert.equal(tile.reading, 'Rules filed 12 this week; 3 still wait for a person.');
  assert.equal(whoFiledOf({ waiting: 0, filed: 5, archived: 0, ruled: 9 })?.parts[1]?.value, 0, 'clamped, never negative');
  assert.equal(whoFiledOf({ waiting: 1, filed: 5, archived: 0, ruled: null }), null, 'an older host has no weekly count to draw');
  assert.equal(whoFiledOf({ waiting: 0, filed: 5, archived: 1, ruled: 0 }), null, 'nothing filed this week and nothing waiting draws no tile');
});

test('the figure is what rules filed this week, said at none too, and absent without a weekly count', () => {
  assert.deepEqual(figureOf({ waiting: 2, filed: 40, archived: 0, ruled: 17 }), { figure: 17, unit: 'filed by your rules this week', reading: '2 still wait for you.' });
  assert.equal(figureOf({ waiting: 0, filed: 0, archived: 0, ruled: 0 })?.figure, 0);
  assert.match(figureOf({ waiting: 0, filed: 0, archived: 0, ruled: 0 })?.reading ?? '', /^A rule files/u);
  assert.equal(figureOf({ waiting: 0, filed: 0, archived: 0, ruled: null }), null);
  assert.equal(figureOf(null), null);
});

test('the page keeps the gates\' hooks and the untrusted-text rule', () => {
  const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
  assert.match(page, /INBOX\.slice\(0, DOM_CAP\)/u);
  assert.match(page, /<CapLine shown=\{[^}]+\} total=\{[^}]+\} \/>/u);
  /* THE MESSAGE WITHOUT ITS ENVELOPE (0f6314941), and still a text node: `bodyText` hands back a string and nothing renders it. */
  assert.match(page, /<p class="raw">\{bodyText\(item\.body\)\}<\/p>/u);
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/gu, ''), /\{@html/u);
  for (const hook of ['id="arrival-{item.id}"', 'class="line line-tall"', 'class="pick', 'role="checkbox"', 'aria-checked=', 'data-picking=', 'aria-label={copy.inboxSelected(picked.size)}', '<Segmented class="series"'])
    assert.ok(page.includes(hook), `the page lost ${hook}`);
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/<!--[\s\S]*?-->/gu, ''), /\bNOW\b|INBOX as SAMPLE|\bSOURCES\b|from === 'sample'|notWritten|copy\.makeRule|copy\.notThisOne/u);
});
