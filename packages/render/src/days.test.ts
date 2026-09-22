import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayDots, dayStrip, heatGrid, isDay, monthGrid, washSteps, weekStart } from './days.ts';

/* 22 September 2026 is a Tuesday, and its week starts on Monday the 21st. */
const TODAY = '2026-09-22';

/* ── the week ─────────────────────────────────────────────────────────────── */

test('a week starts on the Monday on or before, where the kernel buckets start it', () => {
  // `packages/kernel/src/buckets.ts` files 17 September 2026 under the Monday 14 September. A heat
  // grid whose columns began on Sunday would put that Sunday's work in a different week from the
  // `tasks-done-by-week` bar drawn beside it, and the two would disagree about the same rows.
  assert.equal(weekStart('2026-09-17'), '2026-09-14');
  assert.equal(weekStart('2026-09-14'), '2026-09-14');
  assert.equal(weekStart('2026-09-20'), '2026-09-14', 'a Sunday is the last day of its week');
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'across a year');
});

test('only a real day is a day', () => {
  assert.equal(isDay('2026-09-22'), true);
  assert.equal(isDay('2026-02-30'), false, 'a date the calendar does not have');
  assert.equal(isDay('2026-9-22'), false);
  assert.equal(isDay('2026-09-22T10:00:00Z'), false);
  assert.equal(isDay(''), false);
});

/* ── heat: weeks by weekday ───────────────────────────────────────────────── */

test('a heat grid is weeks across and weekdays down, ending on the week that holds today', () => {
  const grid = heatGrid(TODAY, 12);
  assert.equal(grid.weeks.length, 12);
  assert.equal(grid.weeks[11], '2026-09-21');
  assert.equal(grid.weeks[0], '2026-07-06', 'eleven whole weeks before this one');
  assert.equal(grid.cells.length, 84);
  assert.deepEqual(grid.cells[0], { day: '2026-07-06', col: 0, row: 0, today: false, future: false, inside: true });

  const today = grid.cells.filter((c) => c.today);
  assert.equal(today.length, 1, 'exactly one cell is outlined');
  assert.deepEqual([today[0]!.day, today[0]!.col, today[0]!.row], [TODAY, 11, 1]);
});

test('the days after today are future, not zero', () => {
  // Wednesday to Sunday of this week have not happened. Drawn as the palest wash they would claim
  // nothing was done on days nobody has lived yet.
  const future = heatGrid(TODAY, 12).cells.filter((c) => c.future);
  assert.deepEqual(future.map((c) => c.day), ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  assert.ok(future.every((c) => c.col === 11));
});

test('the narrow window is eight weeks', () => {
  const grid = heatGrid(TODAY, 8);
  assert.equal(grid.cells.length, 56);
  assert.equal(grid.weeks[0], '2026-08-03');
});

/* ── calendar: a month and a strip ────────────────────────────────────────── */

test('a month grid is whole weeks, and the days of the months either side are marked outside', () => {
  const grid = monthGrid('2026-09', TODAY);
  assert.equal(grid.month, '2026-09');
  assert.equal(grid.label, 'September 2026');
  assert.equal(grid.weeks, 5);
  assert.equal(grid.cells.length, 35);
  assert.deepEqual(grid.cells[0], { day: '2026-08-31', col: 0, row: 0, today: false, future: false, inside: false });
  assert.equal(grid.cells.at(-1)!.day, '2026-10-04');
  assert.equal(grid.cells.filter((c) => c.inside).length, 30);
  const today = grid.cells.find((c) => c.today)!;
  assert.deepEqual([today.day, today.col, today.row], [TODAY, 1, 3]);
  assert.equal(grid.cells.find((c) => c.day === '2026-09-23')!.future, true);
});

test('a month that starts on a Monday and has twenty-eight days is four rows, and any day in it names it', () => {
  const feb = monthGrid('2027-02-14', TODAY);
  assert.equal(feb.month, '2027-02');
  assert.equal(feb.weeks, 4);
  assert.ok(feb.cells.every((c) => c.inside));
  assert.ok(feb.cells.every((c) => !c.today), 'today is not in February');

  // And the same length of month starting on a Sunday needs five rows, six days before it and one after.
  const earlier = monthGrid('2026-02', TODAY);
  assert.equal(earlier.weeks, 5);
  assert.equal(earlier.cells.filter((c) => !c.inside).length, 7);
});

test('the strip is fourteen days from today, crossing the month', () => {
  const strip = dayStrip(TODAY);
  assert.equal(strip.length, 14);
  assert.deepEqual(strip[0], { day: TODAY, col: 0, row: 1, today: true, future: false, inside: true });
  assert.equal(strip[13]!.day, '2026-10-05');
  assert.deepEqual(strip.map((c) => c.col), [...Array(14).keys()]);
  assert.equal(strip[6]!.row, 0, 'row is the weekday, so the drawer can name it; the strip is one line');
  assert.ok(strip.slice(1).every((c) => c.future && !c.today));
});

/* ── the wash ─────────────────────────────────────────────────────────────── */

test('a missing day is a gap and never a zero', () => {
  const days = ['2026-09-14', '2026-09-15', '2026-09-16'];
  assert.deepEqual(washSteps({ '2026-09-14': 0, '2026-09-16': 3 }, days), [0, null, 4]);
});

test('four steps, scaled to the busiest day in view', () => {
  const days = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(washSteps({ a: 1, b: 2, c: 3, d: 4, e: 6, f: 8 }, days), [1, 1, 2, 2, 3, 4]);
});

test('one thing done is never drawn as nothing done', () => {
  // With a busy day of 100 in view, a day of 1 is 1% of it. Rounded, it would wash as zero and the
  // grid would say that day was empty; it was not.
  assert.deepEqual(washSteps({ a: 1, b: 100 }, ['a', 'b']), [1, 4]);
});

test('a run of zeros divides by nothing and draws as zeros', () => {
  assert.deepEqual(washSteps({ a: 0, b: 0 }, ['a', 'b']), [0, 0]);
});

test('a count that is not a count is a gap', () => {
  assert.deepEqual(washSteps({ a: -2, b: Number.NaN, c: null, d: 2 }, ['a', 'b', 'c', 'd']), [null, null, null, 4]);
});

/* ── dots ─────────────────────────────────────────────────────────────────── */

test('up to three dots a day in the order given, and a count of the rest', () => {
  const items = ['one', 'two', 'three', 'four', 'five'].map((title) => ({ day: TODAY, title }));
  items.push({ day: '2026-09-23', title: 'next' });
  const dots = dayDots(items);
  assert.deepEqual(dots.get(TODAY)!.dots.map((d) => d.title), ['one', 'two', 'three']);
  assert.equal(dots.get(TODAY)!.more, 2);
  assert.deepEqual(dots.get('2026-09-23'), { dots: [items[5]], more: 0 });
  assert.equal(dots.has('2026-09-24'), false);
});

test('an item with no readable day is not placed on any day', () => {
  const dots = dayDots([{ day: 'soon' }, { day: '2026-02-30' }]);
  assert.equal(dots.size, 0);
});

/* ── what goes wrong ──────────────────────────────────────────────────────── */

test('a today that is not a day draws nothing rather than a grid about some other day', () => {
  assert.deepEqual(heatGrid('yesterday'), { weeks: [], cells: [] });
  assert.equal(monthGrid('2026-13', TODAY).cells.length, 0);
  assert.deepEqual(dayStrip(''), []);
});

test('the grid is the same in every time zone', () => {
  // Everything is UTC, as `buckets.ts` is. Node reads `TZ` on every date call, so this is a real
  // change of zone: at UTC+14 local midnight on the 22nd is still the 21st in UTC.
  const before = process.env.TZ;
  const utc = JSON.stringify([heatGrid(TODAY), monthGrid('2026-09', TODAY), dayStrip(TODAY)]);
  try {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(JSON.stringify([heatGrid(TODAY), monthGrid('2026-09', TODAY), dayStrip(TODAY)]), utc, zone);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
