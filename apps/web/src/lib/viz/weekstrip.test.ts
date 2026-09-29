import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayName, dayNumber, describeWeek, dotsFor, MIN_COLUMN, weekdayOf, weekstrip, type WeekDay } from './weekstrip.ts';

const BAKE = '#B35F1F';
const ACME = '#3F5FD4';

/** 14 days from Tue 29 Sep 2026, Main.dc.html's "Coming up". */
function fortnight(): WeekDay[] {
  const base = dayNumber('2026-09-29');
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date((base + i) * 86_400_000).toISOString().slice(0, 10);
    const items =
      i === 0
        ? [{ colour: BAKE, label: 'the Cat Yard commission' }]
        : i === 1
          ? [{ colour: BAKE, late: true }, { colour: ACME }]
          : [];
    return { date, items };
  });
}

test('dates are calendar dates: Monday is 0, and no timezone moves a day', () => {
  assert.equal(weekdayOf('2026-09-28'), 0);
  assert.equal(weekdayOf('2026-09-29'), 1);
  assert.equal(weekdayOf('2026-10-04'), 6);
  assert.equal(dayName('2026-09-29'), 'Tue 29 Sep');
  assert.equal(dayNumber('2026-09-30') - dayNumber('2026-09-29'), 1);
  assert.ok(Number.isNaN(dayNumber('soon')));
});

test('one row where it fits: a column a day, a hairline before each Monday', () => {
  const g = weekstrip(fortnight(), '2026-09-29', 416);
  assert.equal(g.folded, false);
  assert.equal(g.cells.length, 14);
  assert.equal(g.heads[0]?.text, 'Tu');
  assert.ok(Math.abs((g.cells[1]?.x ?? 0) - (g.cells[0]?.x ?? 0) - 416 / 14) < 0.02);
  /* 5 Oct and 12 Oct are Mondays, the 7th and 14th columns. */
  assert.equal(g.rules.length, 2);
  assert.ok(Math.abs((g.rules[0]?.x1 ?? 0) - (6 * 416) / 14 - 0.5) < 0.02);
});

test('today, the past and the weekend are told apart', () => {
  const g = weekstrip(fortnight(), '2026-09-30', 416);
  assert.equal(g.cells[0]?.past, true);
  assert.equal(g.cells[1]?.today, true);
  assert.equal(g.cells[4]?.weekend, true);
  assert.equal(g.cells[4]?.date, '2026-10-03');
});

test('the first of a month says its month when the column is wide enough', () => {
  const wide = weekstrip(fortnight(), '2026-09-29', 14 * 60);
  assert.equal(wide.cells[2]?.text, '1 Oct');
  assert.ok((wide.cells[2]?.discW ?? 0) > 28);
  assert.equal(weekstrip(fortnight(), '2026-09-29', 416).cells[2]?.text, '1');
});

test('a late thing keeps its dot, marked late, and dots centre under the date', () => {
  const g = weekstrip(fortnight(), '2026-09-29', 416);
  const wed = g.cells[1];
  assert.ok(wed);
  assert.equal(wed.dots.length, 2);
  assert.equal(wed.dots[0]?.late, true);
  assert.ok(Math.abs(((wed.dots[0]?.x ?? 0) + (wed.dots[1]?.x ?? 0)) / 2 - wed.x) < 0.02);
});

test('at phone width it folds into a week a row, Monday first', () => {
  const g = weekstrip(fortnight(), '2026-09-29', 14 * MIN_COLUMN - 1);
  assert.equal(g.folded, true);
  assert.deepEqual(
    g.heads.map((h) => h.text),
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  );
  /* Tue 29 Sep sits in the second column of the first week; Mon 5 Oct starts the second week. */
  const tue = g.cells[0];
  const mon = g.cells[6];
  assert.ok(tue && mon);
  assert.equal(tue.x, g.heads[1]?.x);
  assert.equal(mon.x, g.heads[0]?.x);
  assert.ok(mon.top > tue.top);
  /* Three weeks touched (29 Sep to 12 Oct), so two hairlines between them. */
  assert.equal(g.rules.length, 2);
  assert.equal(g.rules[0]?.y1, g.rules[0]?.y2);
});

test('a week or less never folds', () => {
  assert.equal(weekstrip(fortnight().slice(0, 7), '2026-09-29', 200).folded, false);
});

test('a column draws what fits and says the rest as "+n"', () => {
  const items = Array.from({ length: 9 }, () => ({ colour: BAKE }));
  const { dots, more } = dotsFor(items, 20, 50, 30);
  /* 3 a row, 2 rows: 5 dots and "+4". */
  assert.equal(dots.length, 5);
  assert.equal(more, 4);
  assert.equal(dotsFor(items.slice(0, 2), 20, 50, 30).more, 0);
});

test('it reads as a sentence, naming what it can and counting the rest', () => {
  assert.equal(
    describeWeek(fortnight().slice(0, 3), '2026-09-29'),
    '3 days from Tue 29 Sep; today is Tue 29 Sep. Tue 29 Sep, today: the Cat Yard commission. Wed 30 Sep: 2 things, 1 late.',
  );
  assert.equal(describeWeek(fortnight().slice(2, 4), '2026-09-29', 'Coming up'), 'Coming up; today is Tue 29 Sep. Nothing is dated.');
});
