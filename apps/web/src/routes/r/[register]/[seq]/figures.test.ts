/**
 * The figures a row's page draws as tiles, and the line under each (`figures.ts`).
 *
 * Each one is drawn from what the record answered and hides itself when there is nothing to draw, so most of what is
 * held here is the empty and refused cases: a tile that should not be there is the failure that matters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aboutOf,
  comparedOf,
  comparedSaid,
  figureReader,
  figureWords,
  moneyInSaid,
  monthSaid,
  monthsOf,
  openWhere,
  openWorkOf,
  openWorkSaid,
  scalarOf,
  viaOf,
  type Fetch,
  type Via,
} from './figures.ts';

const SEPT = Date.UTC(2026, 8, 29, 12);
const pounds = (minor: number, currency: string): string => `${currency} ${(minor / 100).toFixed(0)}`;

const REVENUE = { id: 'revenue', type: 'money' };
const BEFORE = { id: 'earned_before', type: 'money' };
const NAME = { id: 'name', type: 'text' };
const label = (f: { id: string }): string => ({ revenue: 'Earned in a year', earned_before: 'Earned the year before' })[f.id] ?? f.id;

test('A ROW WITH TWO AMOUNTS IN ONE CURRENCY COMPARES THEM, the one the page leads with first and in ink', () => {
  const c = comparedOf([NAME, BEFORE, REVENUE], { revenue: { amount: 1_840_000, currency: 'GBP' }, earned_before: { amount: 1_500_000, currency: 'GBP' } }, 'revenue', label);
  assert.deepEqual(c, {
    currency: 'GBP',
    items: [
      { label: 'Earned in a year', value: 1_840_000, tone: 'ink' },
      { label: 'Earned the year before', value: 1_500_000 },
    ],
  });
  assert.equal(comparedSaid(c!), 'Earned in a year is 23% above earned the year before.');
});

test('AND NOTHING WHEN THERE IS NOTHING TO COMPARE: one amount, an unset one, or another currency', () => {
  assert.equal(comparedOf([REVENUE, BEFORE], { revenue: { amount: 100, currency: 'GBP' } }, 'revenue', label), null);
  assert.equal(comparedOf([REVENUE, BEFORE], { revenue: { amount: 100, currency: 'GBP' }, earned_before: { amount: 100, currency: 'EUR' } }, 'revenue', label), null);
  assert.equal(comparedOf([REVENUE, BEFORE], { earned_before: { amount: 100, currency: 'GBP' } }, 'revenue', label), null);
  /* A FRACTION OF A MINOR UNIT IS NOT MONEY (`02 §3`), so it is not drawn as a bar either. */
  assert.equal(comparedOf([REVENUE, BEFORE], { revenue: { amount: 1.5, currency: 'GBP' }, earned_before: { amount: 100, currency: 'GBP' } }, 'revenue', label), null);
});

test('THE COMPARISON SAYS WHICH WAY, and a share only of an amount a share can be taken of', () => {
  const said = (a: number, b: number) =>
    comparedSaid({ currency: 'GBP', items: [{ label: 'This year', value: a, tone: 'ink' }, { label: 'Last year', value: b }] });
  assert.equal(said(80, 100), 'This year is 20% below last year.');
  assert.equal(said(100, 100), 'This year is the same as last year.');
  assert.equal(said(100, 0), 'Last year was nothing.');
  assert.equal(said(100, -50), 'This year is above last year.');
});

const months = (values: (number | null)[], current = '2026-09') => ({
  value: 1,
  unit: 'GBP',
  rows: 3,
  current,
  groups: values.map((value, i) => ({ key: `2026-${String(i + 1).padStart(2, '0')}`, value, rows: value ? 1 : 0, state: value === null ? 'empty' : 'full' })),
});

test('WHAT CAME IN, MONTH BY MONTH: a month nothing came in is a zero, and the month the clock is in is marked', () => {
  const m = monthsOf(months([100, null, 300, 0, 0, 0, 0, 0, 120]));
  assert.ok(m);
  assert.equal(m.currency, 'GBP');
  assert.deepEqual(
    m.months.map((x) => [x.key, x.value, x.partial]),
    [
      ['2026-01', 100, false],
      ['2026-02', 0, false],
      ['2026-03', 300, false],
      ['2026-04', 0, false],
      ['2026-05', 0, false],
      ['2026-06', 0, false],
      ['2026-07', 0, false],
      ['2026-08', 0, false],
      ['2026-09', 120, true],
    ],
  );
  assert.equal(m.total, 520);
  assert.equal(moneyInSaid(m, SEPT, pounds), 'The best month was Mar, at GBP 3; GBP 1 so far this month.');
});

test('AND NO TILE FOR NOTHING, for a refusal, or for months in currencies that were not added up', () => {
  assert.equal(monthsOf(null), null);
  assert.equal(monthsOf({ unit: null, groups: [] }), null);
  assert.equal(monthsOf(months([0, null, 0])), null, 'a year of nothing drew a flat line');
  assert.equal(monthsOf({ ...months([100]), parts: [{ currency: 'GBP', amount: 1 }, { currency: 'EUR', amount: 1 }] }), null);
  assert.equal(monthsOf({ unit: 'GBP', groups: [{ key: '2026-01', value: null, parts: [{ currency: 'EUR', amount: 5 }] }] }), null);
});

test('A MONTH IS SAID WITHOUT ITS YEAR INSIDE THE YEAR, and with it outside', () => {
  assert.equal(monthSaid('2026-07', SEPT), 'Jul');
  assert.equal(monthSaid('2025-12', SEPT), 'Dec 2025');
});

test('ONE MONTH WITH MONEY IN IT IS SAID AS THE ONLY ONE', () => {
  const m = monthsOf(months([0, 0, 500]))!;
  assert.equal(moneyInSaid(m, SEPT, pounds), 'All of it came in Mar.');
});

const TASKS = {
  state: 'state',
  done: ['done', 'dropped'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'state', type: 'enum', values: ['backlog', 'open', 'doing', 'review', 'blocked', 'done', 'dropped'], labels: { backlog: 'Later', review: 'To check' } },
    { id: 'owner', type: 'ref', to: 'people' },
    { id: 'parent', type: 'ref', to: 'tasks' },
    { id: 'thing', type: 'ref', to: 'things' },
    { id: 'by', type: 'day', deadline: true },
  ],
};

test('THE WORK THAT POINTS AT A ROW IS FOUND BY THE FIELD THAT POINTS, for a project, a person and a task', () => {
  assert.equal(viaOf(TASKS, 'things')?.field, 'thing');
  assert.equal(viaOf(TASKS, 'people')?.field, 'owner');
  assert.equal(viaOf(TASKS, 'tasks')?.field, 'parent');
  assert.equal(viaOf(TASKS, 'services'), null, 'a list nothing in the work points at has no open work');
  assert.equal(viaOf(undefined, 'things'), null);
  assert.equal(viaOf({ ...TASKS, state: undefined }, 'things'), null, 'work with no state has nothing open to count');
  const via = viaOf(TASKS, 'things')!;
  assert.equal(via.deadline, 'by');
  assert.equal(openWhere(via, 'things#3'), 'thing is things#3, state is not done or dropped or backlog');
});

test('OPEN WORK IS COUNTED BY STATE IN THE DECLARED ORDER, with what is past its day', () => {
  const via = viaOf(TASKS, 'things')!;
  const row = (state: string, by?: string) => ({ fields: { state, ...(by ? { by } : {}) } });
  const w = openWorkOf([row('doing', '2026-09-20'), row('open'), row('review', '2026-10-02'), row('doing'), row('open', '2026-09-28'), row('open'), row('done', '2026-01-01')], via, '2026-09-29', false);
  assert.ok(w);
  assert.equal(w.total, 6, 'a finished row the read let through is not open work');
  assert.equal(w.late, 2);
  assert.deepEqual(
    w.parts.map((p) => [p.value, p.label, p.count]),
    [
      ['open', 'Open', 3],
      ['doing', 'Doing', 2],
      ['review', 'To check', 1],
    ],
  );
  assert.equal(openWorkSaid(w), '3 open, 2 doing and 1 to check.');
  assert.equal(figureWords.late(w.late), '2 are late.');
  assert.equal(openWorkOf([row('done')], via, '2026-09-29', false), null, 'nothing open draws no tile');
});

test('THE OPEN WORK SAYS HOW MUCH AN AGENT HOLDS, by the field its hand names, and none where it names none', () => {
  const held = { ...TASKS, hand: { agent: 'agent' }, fields: [...TASKS.fields, { id: 'agent', type: 'text' }] };
  const via = viaOf(held, 'things')!;
  assert.equal(via.agent, 'agent');
  const w = openWorkOf([{ fields: { state: 'open', agent: 'claude' } }, { fields: { state: 'doing', agent: ' ' } }, { fields: { state: 'open' } }], via, '2026-09-29', false)!;
  assert.equal(w.agents, 1);
  assert.equal(viaOf(TASKS, 'things')!.agent, null);
  assert.equal(viaOf({ ...TASKS, hand: { agent: 'nobody' } }, 'things')!.agent, null, 'a hand naming no field of the list is none');
});

test('PAST THREE STATES THE REST ARE COUNTED TOGETHER', () => {
  const via = viaOf(TASKS, 'things')!;
  const w = openWorkOf(['open', 'open', 'doing', 'doing', 'review', 'blocked', 'backlog'].map((state) => ({ fields: { state } })), via, '2026-09-29', false)!;
  /* A TASK KEPT FOR LATER IS NOT OPEN WORK, so the backlog row is left out of the count. */
  assert.equal(openWorkSaid(w), '2 open, 2 doing, 1 to check and 1 more.');
});

test('THE READS ASK THE RECORD ONCE EACH, AND A REFUSAL IS NO TILE', async () => {
  const asked: URL[] = [];
  const io: Fetch = async (input) => {
    const url = new URL(String(input));
    asked.push(url);
    if (url.pathname.endsWith('/api/metric')) return new Response(JSON.stringify({ ok: true, value: months([0, 250, 0]) }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/api/list'))
      return new Response(JSON.stringify({ ok: true, value: { rows: [{ id: 'a', seq: 1, fields: { state: 'open' } }], matched: 1, cursor: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  const read = figureReader('http://record.test', io);
  const m = await read.moneyIn('Kiln, the shop');
  assert.equal(m?.total, 250);
  assert.equal(asked[0]?.searchParams.get('metric'), 'project-in-by-month:Kiln, the shop');

  const via: Via = viaOf(TASKS, 'things')!;
  const w = await read.openWork('tasks', via, 'things#3', '2026-09-29');
  assert.equal(w?.total, 1);
  assert.equal(asked[1]?.searchParams.get('register'), 'tasks');
  assert.equal(JSON.parse(asked[1]?.searchParams.get('where') ?? 'null'), 'thing is things#3, state is not done or dropped or backlog');

  const refused: Fetch = async () => new Response(JSON.stringify({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'No.' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  const none = figureReader('http://record.test', refused);
  assert.equal(await none.moneyIn('Kiln'), null);
  assert.equal(await none.openWork('tasks', via, 'things#3', '2026-09-29'), null);
  const broken: Fetch = async () => {
    throw new Error('offline');
  };
  assert.equal(await figureReader('http://record.test', broken).moneyIn('Kiln'), null);
});

test("A FIGURE IS ABOUT THE LIST ITS PARAMETER'S FIELD POINTS AT, read off its declaration and never named here", () => {
  assert.deepEqual(aboutOf({ source: 'register.transactions', where: 'thing is {{it}}, state is cleared, direction is in' }), { list: 'transactions', field: 'thing' });
  assert.deepEqual(aboutOf({ source: 'register.obligations', where: 'state is open, party is {{it}}' }), { list: 'obligations', field: 'party' });
  assert.equal(aboutOf({ source: 'cash.now', where: 'thing is {{it}}' }), null, 'a figure the record computes reads no list');
  assert.equal(aboutOf({ source: 'register.transactions', where: 'state is cleared' }), null, 'a figure with no parameter is about no row');
  assert.equal(aboutOf(undefined), null);
});

test('A SCALAR MONEY READING IS DRAWN ONLY WHEN IT IS MONEY AND MORE THAN NOTHING', () => {
  assert.deepEqual(scalarOf({ value: 1250.4, unit: 'GBP' }), { value: 1250, currency: 'GBP' });
  assert.equal(scalarOf({ value: 0, unit: 'GBP' }), null);
  assert.equal(scalarOf({ value: 4, unit: null }), null);
  assert.equal(scalarOf(null), null);
});
