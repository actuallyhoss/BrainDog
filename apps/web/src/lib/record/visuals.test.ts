import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calendarOf, duesOf, lanesOf, roadmapOf, trendOf, visualsFor, type ListDecl, type Listing } from './visuals.ts';

const TODAY = '2026-10-20';
const say = (n: number, c: string) => `${c} ${n}`;

const taskDecl: ListDecl = {
  state: 'stage',
  done: ['shipped', 'cut'],
  title: 'label',
  fields: [
    { id: 'label', type: 'text' },
    { id: 'stage', type: 'enum' },
    { id: 'when', type: 'day', deadline: true },
    { id: 'milestone', type: 'bool' },
  ],
};
const task = (label: string, when: string | undefined, stage = 'open', milestone = false) => ({ label, stage, ...(when ? { when } : {}), milestone });
const tasks = (...rows: Record<string, unknown>[]): Listing => ({ decl: taskDecl, rows });

test('ROADMAP NEEDS TWO DATED TASKS AND LEAVES OUT THE REST', () => {
  assert.equal(roadmapOf([tasks(task('a', '2026-10-25'))], TODAY), null);
  assert.equal(roadmapOf([tasks(task('a', '2026-10-25'), task('b', undefined))], TODAY), null);
  assert.equal(roadmapOf([{ decl: undefined, rows: [task('a', '2026-10-25'), task('b', '2026-10-26')] }], TODAY), null);
  assert.ok(roadmapOf([tasks(task('a', '2026-10-25'), task('b', '2026-10-26'))], TODAY));
});

test('ROADMAP MARKS DONE, LATE, NEXT FEW AND LATER, IN TIME ORDER WITH THE NOW MARK BETWEEN', () => {
  const r = roadmapOf(
    [tasks(task('old', '2026-09-01', 'shipped'), task('missed', '2026-10-10'), task('n1', '2026-10-22'), task('n2', '2026-10-23'), task('n3', '2026-10-24', 'open', true), task('far', '2026-12-01'), task('gone', '2026-10-30', 'cut'))],
    TODAY,
  )!;
  assert.deepEqual(r.marks.map((m) => [m.title, m.state]), [['old', 'done'], ['missed', 'late'], ['n1', 'next'], ['n2', 'next'], ['n3', 'next'], ['far', 'later']]);
  assert.equal(r.marks.find((m) => m.title === 'n3')!.milestone, true);
  assert.ok(r.marks[0]!.at === 0 && r.marks.at(-1)!.at === 1);
  assert.ok(r.todayAt > r.marks[1]!.at && r.todayAt < r.marks[2]!.at);
});

test('ROADMAP LABELS NEVER RUN INTO EACH OTHER: one that would overlap the line above hangs on the next line down', () => {
  /* Kiln's road at 1512: four labels close together around the start of September, then two far apart. */
  const spans = [
    { left: 0, right: 150 },
    { left: 120, right: 270 },
    { left: 200, right: 360 },
    { left: 300, right: 470 },
    { left: 700, right: 840 },
    { left: 860, right: 990 },
  ];
  const lanes = lanesOf(spans);
  assert.deepEqual(lanes, [0, 1, 0, 1, 0, 0]);
  /* No two labels on one line overlap, with the gap kept between them. */
  for (let a = 0; a < spans.length; a++)
    for (let b = a + 1; b < spans.length; b++)
      if (lanes[a] === lanes[b]) assert.ok(spans[a]!.right + 12 <= spans[b]!.left || spans[b]!.right + 12 <= spans[a]!.left, `${a} and ${b} overlap`);
  assert.deepEqual(lanesOf([]), []);
});

test('ROADMAP WITH ONE DAY FOR EVERYTHING SITS IN THE MIDDLE', () => {
  const r = roadmapOf([tasks(task('a', TODAY), task('b', TODAY))], TODAY)!;
  assert.deepEqual([r.marks[0]!.at, r.todayAt], [0.5, 0.5]);
});

const repDecl: ListDecl = {
  state: 'status',
  done: ['ended'],
  title: 'what',
  fields: [
    { id: 'what', type: 'text' },
    { id: 'direction', type: 'enum' },
    { id: 'every', type: 'enum' },
    { id: 'status', type: 'enum' },
    { id: 'due', type: 'day', deadline: true },
  ],
};
const line = (what: string, due: string, every: string, direction = 'out', status = 'live') => ({ what, due, every, direction, status });

test('PAYDAYS FOLLOW THE CADENCE, A MISSED ONE IS LATE, AND MONEY IN OR ENDED LINES ARE NOT PAYDAYS', () => {
  const rows = [line('Pay', '2026-10-25', 'monthly'), line('Late pay', '2026-10-15', 'yearly'), line('Fees', '2026-10-21', 'monthly', 'in'), line('Old', '2026-10-22', 'monthly', 'out', 'ended')];
  const days = duesOf([{ decl: repDecl, rows }], TODAY);
  assert.deepEqual(days.filter((d) => d.what === 'Pay').map((d) => d.day), ['2026-10-25', '2026-11-25', '2026-12-25']);
  assert.deepEqual(days.filter((d) => d.what === 'Late pay').map((d) => [d.day, d.late]), [['2026-10-15', true]]);
  assert.equal(days.some((d) => d.what === 'Old' || d.what === 'Fees'), false);
});

test('TWICE A MONTH LANDS ON THE FIRST AND THE FIFTEENTH', () => {
  const days = duesOf([{ decl: repDecl, rows: [line('Run', '2026-10-21', 'twice_monthly')] }], TODAY).map((d) => d.day);
  assert.deepEqual(days.slice(0, 3), ['2026-10-21', '2026-11-01', '2026-11-15']);
});

test('A LIST WITHOUT A DIRECTION AND A CADENCE IS NOT DUES', () => {
  assert.deepEqual(duesOf([tasks(task('a', '2026-10-25'))], TODAY), []);
});

test('THE CALENDAR OPENS ON THE MONTH OF THE EARLIEST LATE DAY AND KEEPS THREE MONTHS', () => {
  const cal = calendarOf(duesOf([{ decl: repDecl, rows: [line('Pay', '2026-09-28', 'monthly')] }], TODAY), TODAY);
  assert.deepEqual(cal.map((m) => m.key), ['2026-09', '2026-10', '2026-11']);
  assert.equal(cal[0]!.dues.get(28)!.late, true);
  assert.equal(cal[0]!.days, 30);
  assert.deepEqual(calendarOf([], TODAY), []);
});

test('REVENUE TREND READS THE TWO EARNED FIELDS IN ONE CURRENCY AND NOTHING ELSE', () => {
  const decl: ListDecl = { fields: [{ id: 'revenue', type: 'money' }, { id: 'earned_before', type: 'money' }, { id: 'budget', type: 'money' }] };
  const m = (amount: number, currency = 'GBP') => ({ amount, currency });
  assert.deepEqual(trendOf({ decl, fields: { revenue: m(200), earned_before: m(100) } }), { currency: 'GBP', now: 200, before: 100 });
  assert.equal(trendOf({ decl, fields: { revenue: m(200), earned_before: m(100, 'USD') } }), null);
  assert.equal(trendOf({ decl, fields: { revenue: m(0), earned_before: m(0) } }), null);
  assert.equal(trendOf({ decl, fields: { revenue: m(5) } }), null);
});

test('VISUALS ARE CHOSEN BY WHAT THE PROJECT HAS, NOTHING DRAWN EMPTY', () => {
  const base = { inByMonth: null, outByMonth: null, listings: [], today: TODAY, format: say };
  assert.deepEqual(visualsFor({ fields: {}, decl: undefined }, base), []);
  const months = (...v: number[]) => ({ currency: 'GBP', total: v.reduce((a, b) => a + b, 0), months: v.map((value, i) => ({ key: `2026-0${i + 1}`, value, partial: false })) });
  const got = visualsFor({ fields: {}, decl: undefined }, { ...base, inByMonth: months(5, 7), outByMonth: months(3), listings: [{ decl: repDecl, rows: [line('Pay', '2026-10-25', 'monthly')] }] });
  assert.deepEqual(got.map((v) => v.kind), ['in', 'dues']);
  assert.equal(got[0]!.rows[0]!.detail, 'GBP 5');
});
