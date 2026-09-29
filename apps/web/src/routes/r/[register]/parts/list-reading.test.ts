/**
 * What the list says about itself (SYSTEM §5, §6): the sentence under its title, the lanes of its board, and the
 * figures its summary tile draws. Every one turns on its arguments alone, so the register below is written here rather
 * than read from a module, and the record's instant is fixed: 29 September 2026 at 09:00 UTC.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, RegisterDecl } from '../../../../lib/record/schema.ts';
import { byStateOf, dayWord, dueOf, figureOf, figureSaid, figureSplit, isLate, lanesOf, readingOf, stateReading, viewOf } from './list.ts';

const NOW = Date.UTC(2026, 8, 29, 9);

const bills = {
  id: 'bills',
  name: 'Bills',
  one: 'bill',
  title: 'what',
  mobile: ['what', 'amount', 'due'],
  state: 'state',
  done: ['paid'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'amount', type: 'money' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['open', 'sent', 'paid'], labels: { sent: 'Chased' } },
  ],
} as unknown as RegisterDecl;

const people = {
  id: 'people',
  name: 'People',
  one: 'person',
  title: 'name',
  mobile: ['name', 'role', 'rate'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'role', type: 'text' },
  ],
} as unknown as RegisterDecl;

let seq = 0;
const row = (fields: Entry['fields'], created = '2026-09-20T09:00:00.000Z'): Entry => ({ seq: ++seq, fields, version: 1, created, by: '' });
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const WHOLE = { whole: true, filtered: false, matched: 0, total: 0 };

test('the sentence says what is open, what is late in red, and when the next thing falls due', () => {
  const rows = [
    row({ what: 'Rent', amount: gbp(120_000), due: '2026-09-20', state: 'open' }),
    row({ what: 'Water', amount: gbp(4_000), due: '2026-09-30', state: 'sent' }),
    row({ what: 'Power', amount: gbp(9_000), due: '2026-10-08', state: 'open' }),
    row({ what: 'Phone', amount: gbp(3_000), due: '2026-09-01', state: 'paid' }),
  ];
  assert.deepEqual(readingOf(bills, rows, NOW, WHOLE), { before: '3 open, ', needs: '1 late', after: ', the next due tomorrow.' });
});

test('nothing late is said calmly, with no phrase in red', () => {
  const rows = [row({ what: 'Power', due: '2026-10-02', state: 'open' }), row({ what: 'Gas', due: '2026-11-20', state: 'open' })];
  assert.deepEqual(readingOf(bills, rows, NOW, WHOLE), { before: '2 open, none late, the next due in 3 days.', needs: '', after: '' });
  const done = [row({ what: 'Gas', due: '2026-09-01', state: 'paid' })];
  assert.deepEqual(readingOf(bills, done, NOW, WHOLE)?.before, 'Nothing is open.');
});

test('a list with neither state nor deadline says how many and how new', () => {
  const rows = [row({ name: 'Ada' }, '2026-09-26T09:00:00.000Z'), row({ name: 'Bo' }, '2026-09-10T09:00:00.000Z')];
  assert.equal(readingOf(people, rows, NOW, WHOLE)?.before, '2 people, newest 3d ago.');
  assert.equal(readingOf(people, rows.slice(0, 1), NOW, WHOLE)?.before, '1 person, newest 3d ago.');
});

test('filtered, it says how many match; paging, it says nothing', () => {
  assert.equal(readingOf(bills, [], NOW, { whole: false, filtered: true, matched: 3, total: 38 })?.before, '3 of 38 match.');
  assert.equal(readingOf(bills, [], NOW, { whole: true, filtered: true, matched: 1, total: 38 })?.before, '1 of 38 matches.');
  assert.equal(readingOf(bills, [row({ state: 'open' })], NOW, { ...WHOLE, whole: false }), null);
  assert.equal(readingOf(bills, [], NOW, WHOLE), null);
});

test('a day in a sentence is a word close by and a date further out', () => {
  assert.equal(dayWord('2026-09-29', NOW), 'today');
  assert.equal(dayWord('2026-09-30', NOW), 'tomorrow');
  assert.equal(dayWord('2026-10-06', NOW), 'in 7 days');
  assert.match(dayWord('2026-12-01', NOW), /^on 1 Dec/u);
  assert.equal(dayWord('2027-03-01', NOW), 'on 1 Mar 2027');
});

test('a card says how late a row is, and when one that is not falls due', () => {
  assert.deepEqual(dueOf(bills, row({ due: '2026-09-27', state: 'open' }), NOW), { text: '2 days late', late: true });
  assert.deepEqual(dueOf(bills, row({ due: '2026-09-28', state: 'open' }), NOW), { text: '1 day late', late: true });
  assert.deepEqual(dueOf(bills, row({ due: '2026-09-30', state: 'sent' }), NOW), { text: 'Due tomorrow', late: false });
  assert.equal(dueOf(bills, row({ due: '2026-09-01', state: 'paid' }), NOW), null);
  assert.equal(dueOf(people, row({ name: 'Ada' }), NOW), null);
});

test('late is the dot’s clock: past the deadline and not finished', () => {
  assert.equal(isLate(bills, row({ due: '2026-09-28', state: 'open' }), NOW), true);
  assert.equal(isLate(bills, row({ due: '2026-09-28', state: 'paid' }), NOW), false);
  assert.equal(isLate(bills, row({ due: '2026-09-29', state: 'open' }), NOW), false);
  assert.equal(isLate(people, row({ name: 'Ada' }), NOW), false);
});

test('a board lays rows out by declared state, and keeps a row whose state is none of them', () => {
  const rows = [row({ state: 'paid' }), row({ state: 'open' }), row({ state: 'gone' }), row({ state: 'open' })];
  const lanes = lanesOf(bills, rows);
  assert.deepEqual(
    lanes.map((l) => [l.value, l.entries.map((e) => e.fields.state)]),
    [
      ['open', ['open', 'open']],
      ['sent', []],
      ['paid', ['paid']],
      [null, ['gone']],
    ],
  );
  assert.deepEqual(lanesOf(people, rows), []);
});

test('the view is the table unless the address asks for another the list can draw', () => {
  assert.equal(viewOf(null, bills), 'table');
  assert.equal(viewOf('board', bills), 'board');
  assert.equal(viewOf('board', people), 'table');
  assert.equal(viewOf('cards', people), 'cards');
  assert.equal(viewOf('nonsense', bills), 'table');
});

test('by state counts each declared value and says what the bar means', () => {
  const rows = [
    row({ due: '2026-09-01', state: 'open' }),
    row({ due: '2026-10-20', state: 'open' }),
    row({ due: '2026-10-20', state: 'sent' }),
    row({ due: '2026-09-01', state: 'paid' }),
  ];
  const parts = byStateOf(bills, rows)!;
  assert.deepEqual(parts, [
    { value: 'open', count: 2, done: false },
    { value: 'sent', count: 1, done: false },
    { value: 'paid', count: 1, done: true },
  ]);
  const label = (v: string) => v;
  assert.equal(stateReading(bills, parts, rows, NOW, label), 'Most are still open; 1 is late.');
  const paid = [row({ state: 'paid' })];
  assert.equal(stateReading(bills, byStateOf(bills, paid)!, paid, NOW, label), 'The one here is finished.');
  assert.equal(byStateOf(people, rows), null);
  assert.equal(byStateOf(bills, [row({ state: 'gone' })]), null);
});

test('the number column is totalled in one currency, and never across two', () => {
  const rows = [row({ what: 'Rent', amount: gbp(120_000), state: 'open' }), row({ what: 'Water', amount: gbp(4_000), state: 'paid' })];
  const fig = figureOf(bills, rows)!;
  assert.equal(fig.field.id, 'amount');
  assert.equal(fig.total, 124_000);
  assert.equal(fig.currency, 'GBP');
  assert.equal(figureSaid(fig, fig.total), '£1,240.00');
  assert.equal(figureOf(bills, [...rows, row({ amount: { amount: 100, currency: 'EUR' } })]), null);
  assert.equal(figureOf(bills, [row({ what: 'Nothing yet' })]), null);
  assert.equal(figureOf(people, rows), null);
});

test('the number is split by state where there is one, and by its largest rows where there is not', () => {
  const rows = [row({ what: 'Rent', amount: gbp(120_000), state: 'open' }), row({ what: 'Water', amount: gbp(40_000), state: 'paid' })];
  const fig = figureOf(bills, rows)!;
  const split = figureSplit(bills, fig, rows, (v) => (v === 'open' ? 'Open' : 'Paid'), (e) => String(e.fields.what))!;
  assert.deepEqual(split.items, [
    { label: 'Open', value: 120_000 },
    { label: 'Paid', value: 40_000 },
  ]);
  assert.equal(split.reading, 'Open holds 75% of it.');

  const plainList = { ...bills, state: undefined } as unknown as RegisterDecl;
  const byRow = figureSplit(plainList, figureOf(plainList, rows)!, rows, (v) => v, (e) => String(e.fields.what))!;
  assert.deepEqual(byRow.items.map((i) => i.label), ['Rent', 'Water']);
  assert.equal(byRow.reading, 'Rent is the largest, 75% of the total.');
});
