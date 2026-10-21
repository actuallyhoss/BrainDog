/**
 * `lanes`: the window, where each span sits in it, how its time is said, and the markup both drawers write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from './parse.ts';
import { toHTML } from './html.ts';
import { KINDS } from './kinds.ts';
import { lanesFault, lanesInstant, lanesPlan, lanesSentence } from './lanes.ts';

const rows = (...r: string[][]) => r.map((cells) => ({ cells }));
const WINDOW = ['window', '2026-10-07T08:00:00+02:00', '2026-10-07T18:00:00+02:00', '2026-10-07T13:00:00+02:00'];

test('an instant reads with its offset, a bare day as its midnight, and nothing else reads', () => {
  assert.deepEqual(lanesInstant('2026-10-07T09:00:00Z'), { at: Date.UTC(2026, 9, 7, 9), offset: 0 });
  assert.deepEqual(lanesInstant('2026-10-07T11:00:00.250+02:00'), { at: Date.UTC(2026, 9, 7, 9, 0, 0, 250), offset: 120 });
  assert.deepEqual(lanesInstant('2026-10-07T04:30-04:30'), { at: Date.UTC(2026, 9, 7, 9), offset: -270 });
  assert.deepEqual(lanesInstant('2026-10-07'), { at: Date.UTC(2026, 9, 7), offset: 0 });
  assert.equal(lanesInstant('2026-10-07T09:00:00'), null, 'no offset is two instants on two machines');
  assert.equal(lanesInstant('2026-02-30T09:00:00Z'), null, 'a day the calendar does not have');
  assert.equal(lanesInstant('soon'), null);
  assert.equal(lanesInstant(''), null);
});

test('a span is placed between the two ends of the window, as percentages, and now has its line', () => {
  const plan = lanesPlan(rows(WINDOW, ['Sync', '2026-10-07T09:00:00+02:00', '2026-10-07T10:30:00+02:00'], ['Call', '2026-10-07T08:00:00Z', '2026-10-07T09:00:00Z']));
  assert.deepEqual(
    plan.lanes.map((l) => [l.at, l.span, l.when]),
    [
      ['10%', '15%', '09:00 to 10:30'],
      /* Written in another offset and placed by the instant, said on the window's clock. */
      ['20%', '10%', '10:00 to 11:00'],
    ],
  );
  assert.equal(plan.now, '50%');
  assert.equal(plan.said, '7 Oct 2026, 08:00 – 18:00');
  assert.equal(lanesSentence(plan), '2 on the timeline, 7 Oct 2026, 08:00 – 18:00');
  /* A DAY OR LESS IS NAMED AT MOST FOUR TIMES: every three hours here, on the hour where the window was written. */
  assert.deepEqual(plan.ticks.map((t) => `${t.label}@${t.at}`), ['09:00@10%', '12:00@40%', '15:00@70%', '18:00@100%']);
});

test('a span still going runs to now, one cut at an edge says so, and a single instant is a point', () => {
  const plan = lanesPlan(
    rows(
      WINDOW,
      ['Going', '2026-10-07T12:00:00+02:00', ''],
      ['Early', '2026-10-07T06:00:00+02:00', '2026-10-07T09:00:00+02:00'],
      ['Late', '2026-10-07T17:00:00+02:00', '2026-10-07T20:00:00+02:00'],
      ['Mark', '2026-10-07T15:00:00+02:00', '2026-10-07T15:00:00+02:00'],
      ['Tomorrow', '2026-10-08T09:00:00+02:00', '2026-10-08T10:00:00+02:00'],
      ['Someday', 'soon'],
      ['Half', '2026-10-07T09:00:00+02:00', 'later'],
    ),
  );
  const by = Object.fromEntries(plan.lanes.map((l) => [l.row.cells[0], l]));
  assert.deepEqual([by.Going!.at, by.Going!.span, by.Going!.open, by.Going!.when], ['40%', '10%', true, 'Since 12:00']);
  assert.deepEqual([by.Early!.at, by.Early!.span, by.Early!.before, by.Early!.after], ['0%', '10%', true, false]);
  assert.deepEqual([by.Late!.at, by.Late!.span, by.Late!.before, by.Late!.after], ['90%', '10%', false, true]);
  assert.deepEqual([by.Mark!.at, by.Mark!.span, by.Mark!.point, by.Mark!.when], ['70%', '0%', true, '15:00']);
  assert.deepEqual(plan.outside, [5]);
  assert.deepEqual(plan.skipped, [6, 7]);
});

test('an end before its start is a time that does not read, and is named with the rest', () => {
  const plan = lanesPlan(rows(WINDOW, ['Backwards', '2026-10-07T12:00:00+02:00', '2026-10-07T11:00:00+02:00'], ['Fine', '2026-10-07T12:00:00+02:00', '2026-10-07T13:00:00+02:00']));
  assert.deepEqual(plan.lanes.map((l) => l.row.cells[0]), ['Fine']);
  assert.deepEqual(plan.skipped, [1]);
});

test('with no window written, a span still going reaches the clock it was drawn at', () => {
  const plan = lanesPlan(rows(['Going', '2026-10-07T09:00:00Z', ''], ['Done', '2026-10-07T08:00:00Z', '2026-10-07T09:00:00Z']), Date.UTC(2026, 9, 7, 12));
  assert.deepEqual(plan.lanes.map((l) => [l.at, l.span]), [['25%', '75%'], ['0%', '25%']]);
  assert.equal(plan.now, '100%');
  /* A clock before the last end moves nothing. */
  assert.equal(lanesPlan(rows(['Going', '2026-10-07T08:30:00Z', ''], ['Done', '2026-10-07T08:00:00Z', '2026-10-07T09:00:00Z']), Date.UTC(2026, 9, 7, 7)).said, '7 Oct 2026, 08:00 – 09:00');
});

test('the names along the top fit the window: minutes in an hour, months and years on the calendar', () => {
  const ticks = (...r: string[][]) => lanesPlan(rows(...r)).ticks.map((t) => t.label);
  assert.deepEqual(ticks(['window', '2026-10-07T13:37:00+03:00', '2026-10-07T14:37:00+03:00']), ['13:40', '13:50', '14:00', '14:10', '14:20', '14:30']);
  assert.deepEqual(ticks(['A', '2026-09-15', '2027-02-10']), ['Oct 2026', 'Nov', 'Dec', 'Jan 2027', 'Feb']);
  assert.deepEqual(ticks(['A', '2026-03-01', '2026-09-01']), ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
  assert.deepEqual(ticks(['A', '2010-06-01', '2026-10-08']), ['2015', '2020', '2025']);
  /* One whole day is said as its day. */
  assert.equal(lanesPlan(rows(['window', '2026-10-07T00:00:00Z', '2026-10-08T00:00:00Z'])).said, '7 Oct 2026');
});

test('with no clock a span still going runs to the end of the window, and no line is drawn', () => {
  const plan = lanesPlan(rows(WINDOW.slice(0, 3), ['Going', '2026-10-07T12:00:00+02:00']));
  assert.equal(plan.now, null);
  assert.deepEqual([plan.lanes[0]!.at, plan.lanes[0]!.span], ['40%', '60%']);
  /* And the host's clock is read where the window names none. */
  assert.equal(lanesPlan(rows(WINDOW.slice(0, 3)), Date.UTC(2026, 9, 7, 11)).now, '50%');
  assert.equal(lanesPlan(rows(WINDOW.slice(0, 3)), Date.UTC(2026, 9, 9)).now, null, 'now outside the window has no line');
});

test('a block with no window takes it from its rows, and whole days are said as days', () => {
  const plan = lanesPlan(rows(['Design', '2026-09-01', '2026-09-11'], ['Build', '2026-09-06', '2026-09-21']), Date.UTC(2026, 9, 7));
  assert.deepEqual(plan.lanes.map((l) => [l.at, l.span, l.when]), [
    ['0%', '50%', '1 Sep to 11 Sep'],
    ['25%', '75%', '6 Sep to 21 Sep'],
  ]);
  assert.equal(plan.now, null);
  assert.deepEqual(plan.ticks.map((t) => t.label), ['1 Sep', '8 Sep', '15 Sep']);
  /* One instant alone is given an hour to sit in. */
  const one = lanesPlan(rows(['Only', '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z']));
  assert.deepEqual([one.lanes[0]!.at, one.lanes[0]!.point, one.said], ['0%', true, '1 Sep 2026, 09:00 – 10:00']);
  assert.equal(lanesPlan(rows(['Someday', 'soon'])).empty, true);
  assert.equal(lanesPlan([]).empty, true);
});

test('a window over several days says each time with its day', () => {
  const plan = lanesPlan(rows(['window', '2026-10-07T00:00:00Z', '2026-10-09T00:00:00Z'], ['Run', '2026-10-07T22:00:00Z', '2026-10-08T02:00:00Z'], ['Short', '2026-10-08T09:00:00Z', '2026-10-08T10:00:00Z']));
  assert.deepEqual(plan.lanes.map((l) => l.when), ['7 Oct, 22:00 to 8 Oct, 02:00', '8 Oct, 09:00 to 10:00']);
  assert.equal(plan.said, '7 Oct 2026, 00:00 – 9 Oct 2026, 00:00');
  assert.deepEqual(plan.ticks.map((t) => t.label), ['7 Oct', '06:00', '12:00', '18:00', '8 Oct', '06:00', '12:00', '18:00', '9 Oct']);
});

test('a window that does not read degrades the block and says what to write', () => {
  assert.equal(lanesFault([WINDOW]), null);
  assert.equal(lanesFault([['Sync', '2026-10-07T09:00:00Z']]), null, 'a block with no window is not at fault');
  assert.match(lanesFault([['window', 'soon', 'later']]) ?? '', /window \| from \| to \| now/u);
  assert.notEqual(lanesFault([['window', '2026-10-07T18:00:00Z', '2026-10-07T08:00:00Z']]), null, 'from after to');
  assert.notEqual(lanesFault([[...WINDOW.slice(0, 3), 'now']]), null);
  const [seg] = parse('```lanes\nwindow | soon | later\n```');
  assert.equal(seg?.type, 'degraded');
  assert.match(seg?.type === 'degraded' ? seg.fix : '', /^A lanes block has a window that does not read\./u);
});

test('a lanes fence draws an axis, a lane a row with its tone, and the rows it could not place under it', () => {
  assert.equal(KINDS.lanes.primitive, 'list', 'so a drawer that does not know the kind falls back to a dated list');
  const src =
    '```lanes | Today\n' +
    `${WINDOW.join(' | ')}\n` +
    '[Sync](/r/things/2) | 2026-10-07T09:00:00+02:00 | 2026-10-07T10:30:00+02:00\n' +
    'Export | 2026-10-07T12:00:00+02:00 |  | bad\n' +
    'Someday | soon\n```';
  const html = toHTML(parse(src), { link: () => null });
  assert.match(html, /<figure class="block block-list" data-kind="lanes" data-primitive="list">/u);
  assert.match(html, /<div class="lanes" style="--rows:2"><ol class="lanes-axis" aria-hidden="true"><li class="lanes-tick" style="--at:10%">09:00<\/li>/u);
  assert.match(html, /<li class="lanes-now" style="--at:50%"><span class="lanes-now-word">Now<\/span><\/li><\/ol>/u);
  assert.match(html, /<ol class="lanes-list" aria-label="2 on the timeline, 7 Oct 2026, 08:00 – 18:00">/u);
  assert.match(html, /<li class="lanes-item" style="--at:10%;--span:15%"><span class="lanes-title"><a [^>]*href="\/r\/things\/2"[^>]*>Sync<\/a><\/span><span class="lanes-when num">09:00 to 10:30<\/span><span class="lanes-track" aria-hidden="true"><span class="lanes-bar"><\/span><\/span><\/li>/u);
  assert.match(html, /<li class="lanes-item" data-intent="bad" data-open="" style="--at:40%;--span:10%"><span class="lanes-title">Export<\/span><span class="glyph" role="img" aria-label="wrong">[^<]+<\/span><span class="lanes-when num">Since 12:00<\/span>/u);
  assert.match(html, /<p class="lanes-skipped">Not shown, because the times do not read: Someday\.<\/p><\/div>/u);
  assert.match(toHTML(parse('```lanes\n```')), /<div class="lanes"><p class="lanes-empty">Nothing in this time\.<\/p><\/div>/u);
});

test("a section's fourth cell tones its well, and only with a word the well knows", () => {
  const draw = (row: string) => toHTML(parse('```section | Needs you\n' + row + '\n```', { page: true }));
  assert.match(draw('alert | 2 | fold | danger'), /<span class="sec-glyph" data-glyph="alert" data-tone="danger" aria-hidden="true">/u);
  assert.match(draw('alert | 2 |  | action'), /data-tone="action"/u);
  assert.match(draw('alert | 2 |  | earn'), /data-tone="earn"/u);
  assert.doesNotMatch(draw('alert | 2 | fold'), /data-tone/u);
  assert.doesNotMatch(draw('alert | 2 | fold | "><b>'), /data-tone|<b>/u);
  assert.doesNotMatch(draw(' | 2 | fold | danger'), /data-tone/u, 'no glyph, no well to tone');
});
