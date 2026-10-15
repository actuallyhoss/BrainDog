/**
 * A calendar's strip of weeks: `calendarStripPlan` laying rows on the days of whole weeks from this Monday, its lines,
 * and the Svelte drawer drawing the strip when the block says `weeks` and the months exactly as before when it does not.
 *
 * Read on Thursday 15 October 2026, so the strip starts on Monday the 12th. The drawer is compiled under Node's module
 * hooks, as `calendar-day.test.ts` does, and rendered on the server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { CALENDAR_TODAY, CALENDAR_WEEK_NONE, calendarOutside, calendarStripLines, calendarStripPlan } from './calendar.ts';
import { parse, type Block as BlockSegment } from './parse.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: Calendar } = (await import(new URL('../svelte/Calendar.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts?: Record<string, unknown> }>;
};

const TODAY = '2026-10-15';
const NOW = Date.UTC(2026, 9, 15, 12);

const ROWS = [
  { cells: ['Return the library books', '2026-10-13'] },
  { cells: ['Pay the plumber', '2026-10-15'] },
  { cells: ['Book the vet', '2026-10-20'] },
  { cells: ['Renew the parking permit', '2026-10-30'] },
  { cells: ['Someday', 'soon'] },
];

test('A STRIP OF TWO WEEKS IS FOURTEEN DAYS FROM THIS MONDAY, each thing on its day, today and the days gone marked', () => {
  const plan = calendarStripPlan(ROWS, TODAY, 2);
  assert.equal(plan.empty, false);
  assert.deepEqual(
    plan.weeks.map((w) => [w.from, w.label, w.days.length, w.count]),
    [
      ['2026-10-12', 'This week', 7, 2],
      ['2026-10-19', 'Week of 19 Oct', 7, 1],
    ],
  );
  const [now, next] = plan.weeks;
  assert.deepEqual(now!.days.map((d) => d.day), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  const on = (d: { items: { cells: readonly string[] }[] }) => d.items.map((r) => r.cells[0]);
  assert.deepEqual(on(now!.days[3]!), ['Pay the plumber']);
  assert.equal(now!.days[3]!.today, true);
  assert.equal(now!.days[3]!.said, 'Thu 15 Oct');
  assert.deepEqual(on(next!.days[1]!), ['Book the vet']);
  /* THE DAYS OF THIS WEEK ALREADY GONE ARE PAST, and still hold what fell on them. */
  assert.deepEqual(now!.days.map((d) => d.past), [true, true, true, false, false, false, false]);
  assert.deepEqual(on(now!.days[1]!), ['Return the library books']);
  assert.ok(next!.days.every((d) => !d.past && !d.today));
  /* A DAY PAST THE WEEKS IS COUNTED AND NOT DRAWN, and a day that does not read is skipped, as under the months. */
  assert.deepEqual(plan.outside, [3]);
  assert.deepEqual(plan.skipped, [4]);
  assert.equal(calendarOutside(1), '1 thing falls outside these weeks and is not drawn.');
});

test("A DAY'S CELL NAMES ITS FIRST THREE AND COUNTS THE REST, as a month's does", () => {
  const busy = ['Water the ferns', 'Fold the laundry', 'Call the bank', 'Order stamps'].map((t) => ({ cells: [t, '2026-10-16'] }));
  const day = calendarStripPlan(busy, TODAY, 1).weeks[0]!.days[4]!;
  assert.deepEqual([day.items.length, day.more, day.count], [3, 1, 4]);
});

test('weeks IS HELD TO 1 TO 8, and with nothing in its weeks the strip is empty', () => {
  assert.equal(calendarStripPlan(ROWS, TODAY, 12).weeks.length, 8);
  assert.equal(calendarStripPlan(ROWS, TODAY, 0).weeks.length, 1);
  assert.equal(calendarStripPlan([{ cells: ['Far off', '2027-03-01'] }], TODAY, 2).empty, true);
});

test('THE LINES SAY EACH DAY THAT HOLDS ANYTHING IN ITS WEEK, and a quiet week in a line of its own', () => {
  const lines = calendarStripLines(calendarStripPlan(ROWS.slice(0, 2), TODAY, 2));
  assert.deepEqual(
    lines.map((l) => [l.week, l.said, l.today, l.past, l.items.map((r) => r.cells[0])]),
    [
      ['This week', 'Tue 13 Oct', false, true, ['Return the library books']],
      ['This week', 'Thu 15 Oct', true, false, ['Pay the plumber']],
      ['Week of 19 Oct', CALENDAR_WEEK_NONE, false, false, []],
    ],
  );
});

const block = (weeks?: number): BlockSegment => {
  const [seg] = parse('```calendar\nPay the plumber | 2026-10-15\nBook the vet | 2026-10-20\n```', { page: true });
  assert.equal(seg?.type, 'block');
  return (weeks === undefined ? seg : { ...seg, weeks }) as BlockSegment;
};

test('THE DRAWER DRAWS THE STRIP WHEN THE BLOCK SAYS weeks, today with its word, and the months when it does not', () => {
  /* THE SERVER'S HYDRATION MARKS ARE NOT THE TREE, so they are taken out before it is read. */
  const strip = render(Calendar, { props: { block: block(2), opts: { now: NOW } } }).body.replace(/<!--[^>]*-->/gu, '');
  assert.match(strip, /class="calendar calendar-strip"/u);
  assert.equal([...strip.matchAll(/<li class="calendar-strip-day"/gu)].length, 14);
  assert.equal([...strip.matchAll(/data-today=""/gu)].length, 1);
  assert.match(strip, new RegExp(`data-today=""[^>]*><span class="calendar-strip-date num">Thu 15 Oct <span class="calendar-today">${CALENDAR_TODAY}</span>`, 'u'));
  assert.equal([...strip.matchAll(/data-past=""/gu)].length, 3);
  assert.doesNotMatch(strip, /<table/u);
  const months = render(Calendar, { props: { block: block(), opts: { now: NOW } } }).body;
  assert.match(months, /<table class="calendar-month">/u);
  assert.doesNotMatch(months, /calendar-strip/u);
});
