import { test } from 'node:test';
import assert from 'node:assert/strict';

import { barRect, bars, describeBars, ROW_ALONE, ROW_PAIRED } from './bars.ts';

const SPEND = [
  { label: 'Household', value: 9800 },
  { label: 'Outing', value: 7400, note: '+40%' },
  { label: 'Transfers', value: 6000 },
];
const AUGUST = [11200, 5300, 12000];

test('the largest value fills the bar space, and the rest are in proportion', () => {
  const g = bars(SPEND, { width: 400 });
  const [a, b] = g.rows;
  assert.ok(a && b);
  assert.ok(g.track);
  assert.equal(a.bar.w, g.track.w - (g.track.w - a.bar.w)); // sanity
  assert.ok(Math.abs(a.bar.w + a.bar.x - (g.track.x + g.track.w)) < 0.01);
  assert.ok(Math.abs(b.bar.w / a.bar.w - 7400 / 9800) < 0.01);
});

test('paired bars share one scale, the larger of the two periods', () => {
  const g = bars(SPEND, { width: 400, paired: AUGUST });
  const t = g.rows[2];
  assert.ok(t?.pair);
  assert.ok(Math.abs(t.bar.w / t.pair.w - 0.5) < 0.01);
  assert.equal(g.track, null);
  assert.equal(g.height, 2 * ROW_PAIRED + 17);
});

test('a fixed max is the scale, and a value past it is a full bar', () => {
  const g = bars([{ label: 'a', value: 50 }, { label: 'b', value: 500 }], { width: 300, max: 100 });
  const [a, b] = g.rows;
  assert.ok(a && b);
  assert.ok(Math.abs(b.bar.w / a.bar.w - 2) < 0.01);
});

test('rows sit a pitch apart and the values are anchored at the right edge', () => {
  const g = bars(SPEND, { width: 400 });
  assert.deepEqual(
    g.rows.map((r) => r.textY),
    [13, 13 + ROW_ALONE, 13 + 2 * ROW_ALONE],
  );
  assert.equal(g.valueX, 400);
  assert.equal(g.rows[0]?.value, '9,800');
});

test('the label column is never more than two fifths of a narrow chart', () => {
  const g = bars([{ label: 'A label far too long for a phone to give it its whole width', value: 1 }], { width: 320 });
  assert.equal(g.rows[0]?.bar.x, 128);
});

test('a bar above zero is at least 2px, zero is nothing, and the radius never passes half', () => {
  assert.equal(barRect(0, 0, 0.001, 100, 200, 8).w, 2);
  assert.equal(barRect(0, 0, 0, 100, 200, 8).w, 0);
  assert.equal(barRect(0, 0, -5, 100, 200, 8).w, 0);
  assert.equal(barRect(0, 0, 1, 100, 200, 8).rx, 1);
  assert.equal(barRect(0, 0, 100, 100, 200, 8).rx, 3);
  assert.equal(barRect(0, 0, 5, 0, 200, 8).w, 0);
});

test('a note starts just past the longer bar', () => {
  const g = bars(SPEND, { width: 400, paired: AUGUST });
  const o = g.rows[1];
  assert.ok(o?.pair);
  assert.equal(o.noteX, Math.round((o.bar.x + Math.max(o.bar.w, o.pair.w) + 6) * 100) / 100);
});

test('it reads as a sentence, notes and all', () => {
  assert.equal(
    describeBars(SPEND.slice(0, 2), 'September against August, in pounds', AUGUST),
    'September against August, in pounds: Household 9,800 against 11,200; Outing 7,400 against 5,300, +40%',
  );
  assert.equal(describeBars([], 'Spend'), 'Spend: nothing yet');
});
