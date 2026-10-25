import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clock, describeLanes, FOLD_BELOW, hourTicks, swimlanes, tickStep, type Lane } from './swimlanes.ts';

/* Local times, so the ticks fall where this machine's clock says, whatever its timezone. */
const at = (h: number, m = 0): number => new Date(2026, 8, 29, h, m).getTime();
const START = at(0);
const END = at(10);
const NOW = at(9, 40);

const LANES: Lane[] = [
  {
    label: 'claude',
    spans: [
      { from: at(0, 20), to: at(1, 40) },
      { from: at(4, 40), to: at(6, 2) },
      { from: at(8, 58), to: at(8, 58), live: true },
    ],
  },
  { label: 'codex', spans: [{ from: at(1, 50), to: at(2, 10) }] },
];

const opts = (width: number) => ({ start: START, end: END, now: NOW, width });

test('a span maps to x in proportion to its time, after the label gutter', () => {
  const g = swimlanes(LANES, opts(533));
  const plot = 533 - g.gutter;
  const first = g.lanes[0]?.spans[0];
  assert.ok(first);
  assert.ok(Math.abs(first.x - (g.gutter + (20 / 600) * plot)) < 0.02);
  assert.ok(Math.abs(first.w - (80 / 600) * plot) < 0.02);
  assert.equal(first.live, false);
});

test('a live span runs to now whatever its end says', () => {
  const g = swimlanes(LANES, opts(533));
  const live = g.lanes[0]?.spans[2];
  assert.ok(live && g.now);
  assert.equal(live.live, true);
  assert.ok(Math.abs(live.x + live.w - g.now.x) < 0.02);
});

test('spans are clipped to the window, never under 4px, and a span wholly outside is dropped', () => {
  const g = swimlanes(
    [
      {
        label: 'x',
        spans: [
          { from: at(-3), to: at(1) },
          { from: at(5), to: at(5, 0) },
          { from: at(11), to: at(12) },
        ],
      },
    ],
    opts(533),
  );
  const spans = g.lanes[0]?.spans ?? [];
  assert.equal(spans.length, 2);
  assert.equal(spans[0]?.x, g.gutter);
  assert.equal(spans[1]?.w, 4);
  assert.ok(spans.every((s) => s.rx <= s.w / 2));
});

test('lanes sit 28 apart with the axis under the last, as Main draws them', () => {
  const g = swimlanes([...LANES, { label: 'cursor', spans: [] }], opts(533));
  assert.deepEqual(
    g.lanes.map((l) => l.y),
    [32, 60, 88],
  );
  assert.equal(g.axisY, 110.5);
  assert.equal(g.tickY, 126);
});

test('ticks fall on whole local hours, spaced so their labels never touch', () => {
  assert.equal(tickStep(46), 2);
  assert.equal(tickStep(10), 6);
  assert.equal(tickStep(0), 24);
  const ticks = hourTicks(START, END, 2);
  assert.deepEqual(ticks.map(clock), ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00']);
  assert.deepEqual(hourTicks(at(0, 30), at(3), 1).map(clock), ['01:00', '02:00', '03:00']);
  assert.deepEqual(hourTicks(END, START, 1), []);
});

test('the last tick is anchored at its end so it stays in the box', () => {
  const g = swimlanes(LANES, opts(533));
  assert.equal(g.ticks[g.ticks.length - 1]?.anchor, 'end');
  assert.equal(g.ticks[1]?.anchor, 'middle');
});

test('the now pill says the time and stays inside the chart', () => {
  const g = swimlanes(LANES, { ...opts(533), now: END });
  assert.ok(g.now);
  assert.equal(g.now.text, 'now 10:00');
  assert.ok(g.now.pillX + g.now.pillW <= 533);
  assert.equal(swimlanes(LANES, { ...opts(533), now: at(11) }).now, null);
});

test('a mark is a dashed rule, and its words give way to the now pill', () => {
  const g = swimlanes(LANES, { ...opts(533), marks: [{ at: at(5), label: 'you left' }, { at: at(9, 35), label: 'here' }] });
  assert.equal(g.marks.length, 2);
  assert.equal(g.marks[0]?.label, 'you left');
  assert.equal(g.marks[1]?.label, null);
});

test('at phone width the labels go above their lanes and the lanes take the width', () => {
  const g = swimlanes(LANES, opts(FOLD_BELOW - 1));
  assert.equal(g.folded, true);
  assert.equal(g.gutter, 0);
  const lane = g.lanes[0];
  assert.ok(lane && lane.labelY < lane.y);
  assert.ok(g.ticks.length <= 6);
});

test('it reads as a sentence', () => {
  assert.equal(
    describeLanes(LANES, { start: START, end: END, now: NOW }, 'Agent sessions'),
    'Agent sessions from 00:00 to 10:00. claude: 00:20 to 01:40, 04:40 to 06:02 and since 08:58. codex: 01:50 to 02:10. Now is 09:40.',
  );
  assert.equal(
    describeLanes([{ label: 'cursor', spans: [] }], { start: START, end: END, now: at(12) }),
    'Sessions from 00:00 to 10:00. cursor: nothing.',
  );
});
