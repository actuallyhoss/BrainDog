import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roadmapLabelAt, roadmapLines, roadmapPlan, roadmapWhen, type RoadmapRow } from './roadmap.ts';

const TODAY = '2026-09-22';
const win = (start: string, end: string, title = `${start} to ${end}`): RoadmapRow => ({ start, end, title });
const on = (end: string, title = end): RoadmapRow => ({ start: '', end, title });

/* ── packing ──────────────────────────────────────────────────────────────── */

test('windows pack first-fit, so a window that fits after an earlier one shares its track', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-10'), win('2026-09-05', '2026-09-20'), win('2026-09-12', '2026-09-30')], TODAY);
  assert.equal(plan.tracks, 2);
  assert.deepEqual(plan.bars.map((b) => [b.row, b.track]), [[0, 0], [1, 1], [2, 0]]);
});

test('a window ends at the end of its last day, so one starting that same day overlaps it', () => {
  // `by` is the day a task is due and it is worked on that day, so a task due on the 10th and the
  // next one starting on the 10th are both in hand on the 10th.
  assert.equal(roadmapPlan([win('2026-09-01', '2026-09-10'), win('2026-09-10', '2026-09-20')], TODAY).tracks, 2);
  assert.equal(roadmapPlan([win('2026-09-01', '2026-09-10'), win('2026-09-11', '2026-09-20')], TODAY).tracks, 1);
});

test('the order rows arrive in does not change the packing, and every bar keeps its row', () => {
  const rows = [win('2026-09-12', '2026-09-30', 'C'), win('2026-09-05', '2026-09-20', 'B'), win('2026-09-01', '2026-09-10', 'A')];
  const plan = roadmapPlan(rows, TODAY);
  const by = Object.fromEntries(plan.bars.map((b) => [b.title, b]));
  assert.deepEqual([by.A!.track, by.B!.track, by.C!.track], [0, 1, 0]);
  assert.deepEqual([by.A!.row, by.B!.row, by.C!.row], [2, 1, 0]);
});

test('the number of tracks is the most windows in hand on any one day', () => {
  // First-fit in order of start is optimal for intervals, so the track count is a measure of
  // overlap and not an artefact of the order. Checked against a brute count over seeded windows.
  let seed = 7;
  const rand = (n: number): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % n;
  };
  const day = (n: number): string => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10);
  for (let round = 0; round < 40; round++) {
    const spans: [number, number][] = Array.from({ length: 2 + rand(12) }, () => {
      const s = rand(60);
      return [s, s + rand(20)];
    });
    let most = 0;
    for (let d = 0; d < 90; d++) most = Math.max(most, spans.filter(([s, e]) => s <= d && d <= e).length);
    const plan = roadmapPlan(spans.map(([s, e]) => win(day(s), day(e))), TODAY);
    assert.equal(plan.tracks, most, `round ${round}`);
    for (let t = 0; t < plan.tracks; t++) {
      const mine = plan.bars.filter((b) => b.track === t).sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < mine.length; i++) assert.ok(mine[i - 1]!.end < mine[i]!.start, 'two windows on one track overlap');
    }
  }
});

/* ── the span and its months ──────────────────────────────────────────────── */

test('the span never starts before the first of the earliest month, and a bar runs from the start of its first day to the end of its last', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-10')], TODAY);
  assert.deepEqual([plan.from, plan.to], ['2026-09-01', '2026-10-01']);
  assert.deepEqual([plan.bars[0]!.x, plan.bars[0]!.width], ['0', '333.33']);
});

test('month bands cover the span, alternate, and name the year on the first band and every January', () => {
  const plan = roadmapPlan([win('2026-11-15', '2027-02-10')], TODAY);
  /* 106 days from the first bar to 1 Mar, so the span starts three days ahead of it, 3% of them. */
  assert.deepEqual([plan.from, plan.to], ['2026-11-12', '2027-03-01']);
  assert.deepEqual(plan.bands.map((b) => b.label), ['Nov 2026', 'Dec', 'Jan 2027', 'Feb']);
  assert.deepEqual(plan.bands.map((b) => b.odd), [false, true, false, true]);
  assert.equal(plan.bands[0]!.x, '0');
  const ends = plan.bands.map((b) => Number(b.x) + Number(b.width));
  assert.ok(Math.abs(ends.at(-1)! - 1000) < 0.02, 'the last band ends at the edge');
  // 109 days in the span: November's last 19 are that share of it.
  assert.equal(plan.bands[0]!.width, String(Math.round((19 / 109) * 1000 * 100) / 100));
});

test('THE SPAN STARTS JUST BEFORE THE FIRST THING, not at an empty month, and a sliver of a month at the edge is not named', () => {
  /* Kiln's plan: the first bar ends on 30 Aug and the rest run on from September, so August was drawn empty. */
  const plan = roadmapPlan([win('2026-08-29', '2026-08-30'), win('2026-09-05', '2026-09-21'), win('2026-10-01', '2026-11-20')], '2026-09-02');
  assert.equal(plan.from, '2026-08-26', 'three days ahead, 3% of the 94 from the first bar to 1 Dec');
  assert.deepEqual(plan.bands.map((b) => b.label), ['', 'Sep 2026', 'Oct', 'Nov'], 'six days of August are too narrow to name, and the year goes on');
  const wide = roadmapPlan([win('2026-08-29', '2026-08-30'), win('2026-09-05', '2026-09-21')], '2026-09-02');
  assert.deepEqual(wide.bands.map((b) => b.label), ['Aug 2026', 'Sep'], 'in a span of five weeks the same five days hold their name');
  assert.ok(Number(plan.bars[0]!.x) > 0, 'the first bar does not stand on the edge');
  assert.ok(plan.today !== null, 'and today is still on the chart');
  /* TODAY INSIDE THE FIRST MONTH, ahead of the first thing, keeps its line: the span starts ahead of today instead. */
  const early = roadmapPlan([win('2026-09-20', '2026-09-25')], '2026-09-10');
  assert.equal(early.from, '2026-09-08');
  assert.ok(early.today !== null);
});

test('the today line sits in the middle of today, and is absent when today is not in the span', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-30')], TODAY);
  assert.equal(plan.today, String(Math.round(((21.5 / 30) * 1000) * 100) / 100));
  // A plan wholly next year does not stretch back to take in today: ten months of empty track
  // would squeeze the plan itself into a sliver at the far edge.
  assert.equal(roadmapPlan([win('2027-07-01', '2027-07-20')], TODAY).today, null);
});

/* ── single dates ─────────────────────────────────────────────────────────── */

test('an empty start is a single date, drawn as a stem at the middle of its day and not packed', () => {
  const plan = roadmapPlan([on('2026-09-15', 'Launch'), win('2026-09-01', '2026-09-30')], TODAY);
  assert.equal(plan.tracks, 1, 'a stem takes no track');
  assert.equal(plan.stems.length, 1);
  assert.deepEqual([plan.stems[0]!.row, plan.stems[0]!.day, plan.stems[0]!.title], [0, '2026-09-15', 'Launch']);
  assert.equal(plan.stems[0]!.x, '483.33');
});

test('stem labels that would overlap drop to the next line, and a far one goes back to the first', () => {
  const plan = roadmapPlan([on('2026-09-10'), on('2026-09-11'), on('2026-09-12'), on('2026-09-25')], TODAY, 150);
  assert.deepEqual(plan.stems.map((s) => s.label.line), [0, 1, 2, 0]);
  assert.equal(plan.lines, 3);
});

test('a stem label near the end edge is pulled inside it rather than cut off', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-02'), on('2026-09-30', 'Due')], TODAY, 150);
  assert.equal(plan.stems[0]!.label.x, '850');
  assert.equal(plan.stems[0]!.x, '983.33', 'the stem itself stays on its day');
});

/* ── what goes wrong ──────────────────────────────────────────────────────── */

test('a row whose dates cannot be read, or that ends before it starts, is named as skipped rather than guessed', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-10'), win('soon', '2026-09-10'), win('2026-09-20', '2026-09-10'), on('')], TODAY);
  assert.deepEqual(plan.skipped, [1, 2, 3]);
  assert.equal(plan.bars.length, 1);
  assert.equal(plan.empty, false);
});

test('a date with space around it is read as the date, and the space never reaches the arithmetic', () => {
  // The start was trimmed to decide whether it was a day and then used untrimmed: ` 2026-09-01`
  // made the span start at ` 2026-0-01`, every x and width came out NaN, and ten month bands were
  // drawn from a month labelled `undefined  202`.
  const plan = roadmapPlan([{ start: ' 2026-09-01', end: '2026-09-10 ', title: 'A' }, { start: ' ', end: ' 2026-09-15', title: 'B' }], TODAY);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual([plan.from, plan.to, plan.bands.length], ['2026-09-01', '2026-10-01', 1]);
  assert.deepEqual([plan.bars[0]!.start, plan.bars[0]!.end, plan.bars[0]!.x, plan.bars[0]!.width], ['2026-09-01', '2026-09-10', '0', '333.33']);
  assert.deepEqual([plan.stems[0]!.day, plan.stems[0]!.x], ['2026-09-15', '483.33']);
});

test('nothing drawable is empty, with no span to draw', () => {
  const plan = roadmapPlan([on('whenever')], TODAY);
  assert.equal(plan.empty, true);
  assert.deepEqual([plan.bars, plan.stems, plan.bands, plan.today, plan.tracks], [[], [], [], null, 0]);
  assert.equal(roadmapPlan([], TODAY).empty, true);
});

test('every position is measured from the start edge, inside the 1000 box', () => {
  // Right-to-left is the drawer's to mirror (`1000 - x - width`); the plan never does it, so the
  // arithmetic and its tests are one set whichever way the page reads.
  const plan = roadmapPlan([win('2026-09-01', '2026-10-31'), on('2026-10-31')], '2026-10-31');
  for (const b of plan.bars) assert.ok(Number(b.x) >= 0 && Number(b.x) + Number(b.width) <= 1000);
  assert.equal(plan.bars[0]!.width, '1000');
  assert.ok(Number(plan.today) < 1000);
});

/* ── names that fit, and lanes when they do not ─────────────────────────── */

test('NAMES THAT FIT STAY OVER THEIR BARS ON THE TRACKS, each with the room before the next window', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-10'), win('2026-09-20', '2026-09-30')], TODAY);
  assert.equal(plan.lanes, false);
  assert.equal(plan.laneCount, plan.tracks);
  assert.deepEqual(plan.bars.map((b) => [b.lane, b.label.side]), [[0, 'over'], [0, 'over']]);
  assert.equal(plan.bars[0]!.label.room, plan.bars[1]!.x, 'the first name may run as far as the second window');
});

test('KILN\'S PLAN: SHORT WINDOWS END TO END TAKE A LANE EACH, with the name beside the bar and never on top of the next', () => {
  /* Seven tasks of a day or three each, end to end on one track: every name sat on one line over the next one. */
  const rows = [
    win('2026-08-30', '2026-08-30', 'Turn auto-renew back on'),
    win('2026-09-04', '2026-09-06', 'Variable axis QA'),
    win('2026-09-09', '2026-09-09', 'Decide the licensing tier split'),
    win('2026-09-11', '2026-09-13', 'Illustrations'),
    win('2026-09-15', '2026-09-15', 'Rotate the deploy key'),
    win('2026-09-20', '2026-09-21', 'Write the specimen page'),
  ];
  const plan = roadmapPlan(rows, TODAY);
  assert.equal(plan.tracks, 1, 'the packing is unchanged: nothing overlaps');
  assert.equal(plan.lanes, true);
  assert.equal(plan.laneCount, 6);
  assert.deepEqual(plan.bars.map((b) => b.lane), [0, 1, 2, 3, 4, 5], 'a lane each, in order of start');
  for (const b of plan.bars) {
    assert.notEqual(b.label.side, 'over', `${b.title} is too short to hold its name`);
    if (b.label.side === 'after') assert.ok(Math.abs(Number(b.label.x) - Number(b.x) - Number(b.width)) < 0.02, 'it starts where its bar ends');
    else assert.equal(b.label.x, b.x);
    assert.ok(Number(b.label.room) > 0);
  }
});

test('A NAME NEAR THE END EDGE GOES BEFORE ITS BAR, where the room is', () => {
  const plan = roadmapPlan([win('2026-09-01', '2026-09-02', 'A'), win('2026-09-04', '2026-09-05', 'C'), win('2026-09-06', '2026-09-28', 'B'), win('2026-09-29', '2026-09-30', 'Last')], TODAY);
  const last = plan.bars.find((b) => b.title === 'Last')!;
  assert.equal(plan.lanes, true);
  assert.equal(last.label.side, 'before');
  assert.equal(last.label.room, last.x);
  const wide = plan.bars.find((b) => b.title === 'B')!;
  assert.equal(wide.label.side, 'over', 'a bar as wide as a name keeps it over itself');
  assert.equal(roadmapLabelAt(last, { x: '500', width: '20' }), '500');
});

test('A WINDOW IS SAID AS ONE SPAN OF DAYS, the month and the year once where both ends share them', () => {
  assert.equal(roadmapWhen('2026-09-04', '2026-09-06'), '4 – 6 Sep 2026');
  assert.equal(roadmapWhen('2026-08-30', '2026-09-06'), '30 Aug – 6 Sep 2026');
  assert.equal(roadmapWhen('2026-12-28', '2027-01-03'), '28 Dec 2026 – 3 Jan 2027');
  assert.equal(roadmapWhen('2026-09-09', '2026-09-09'), '9 Sep 2026');
  const plan = roadmapPlan([win('2026-09-01', '2026-09-15', 'Build'), on('2026-09-30', 'Launch')], TODAY);
  assert.deepEqual(
    roadmapLines(plan).map((l) => [l.title, l.when, l.at, l.span]),
    [
      ['Build', '1 – 15 Sep 2026', '0', '0.5'],
      ['Launch', '30 Sep 2026', '0.9833', '0'],
    ],
  );
});
