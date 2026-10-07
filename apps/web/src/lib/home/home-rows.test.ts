/**
 * Today's two lists of things that fall due, in one shape: what is late as one list, and what comes up by day.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayGroups, lateLines, linesIn } from './home-rows.ts';
import type { LiveBlock } from '../record/page-live.ts';

const TODAY = '2026-10-02';

/** A block as the record answers it, with its rows' cells and its entries' fields one for one. */
function block(kind: string, columns: string[], rows: { cells: string[]; fields: Record<string, unknown>; href?: string }[]): LiveBlock {
  return {
    kind,
    columns: columns.map((field) => ({ field, label: '', width: '' })),
    rows: rows.map((r, n) => ({ key: `r${n}`, cells: r.cells, ...(r.href ? { href: r.href } : {}) })),
    entries: rows.map((r, n) => ({ seq: n + 1, fields: r.fields, version: 1, created: '', by: '' })),
    total: rows.length,
    shown: rows.length,
  } as unknown as LiveBlock;
}

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

test('LATE IS ONE LIST: tasks then money, how late each is, an amount where there is one and which way it goes', () => {
  const tasks = block('todo', ['what', 'by'], [
    { cells: ['Renew the domain', '30 Sep 2026'], fields: { by: '2026-09-30' }, href: '/r/tasks/4' },
    { cells: ['Send the proofs', '2 Oct 2026'], fields: { by: '2026-10-02' } },
  ]);
  const money = block('spec', ['title', 'amount', 'day'], [
    { cells: ['Legal review', '−GBP 9,190.00', '3 months late'], fields: { day: '2026-07-01', amount: gbp(919000), direction: 'out' }, href: '/r/obligations/2' },
    { cells: ['Invoice 2026-041', '+GBP 4,800.00', '5 weeks late'], fields: { day: '2026-08-28', amount: gbp(480000), direction: 'in' } },
    { cells: ['Certificate', '−GBP 0.00', '1 day late'], fields: { day: '2026-10-01', amount: gbp(0), direction: 'out' } },
  ]);
  const lines = lateLines([tasks, money], TODAY);
  assert.deepEqual(
    lines.map((l) => [l.title, l.when, l.amount ?? null, l.late, l.tick ?? null, l.href ?? null]),
    [
      ['Renew the domain', '2 days late', null, true, 1, '/r/tasks/4'],
      ['Send the proofs', 'Due today', null, false, 2, null],
      ['Legal review', '3 months late', { text: '−GBP 9,190.00', dir: 'out' }, true, null, '/r/obligations/2'],
      ['Invoice 2026-041', '5 weeks late', { text: '+GBP 4,800.00', dir: 'in' }, true, null, null],
      /* NOTHING TO PAY IS NO AMOUNT. */
      ['Certificate', '1 day late', null, true, null, null],
    ],
  );
  assert.equal(linesIn({ kind: 'late', lines }), 5);
});

test('AN AMOUNT WHOSE WAY IS NOT KNOWN IS NOT MONEY COMING IN: said unsigned, in the ink', () => {
  const due = block('timeline', ['title', 'amount'], [
    { cells: ['Retainer', '+GBP 500.00'], fields: { day: '2026-09-01', amount: gbp(50000), direction: null } },
    { cells: ['Refund', '+GBP 20.00'], fields: { day: '2026-09-01', amount: gbp(2000), direction: 'in' } },
    { cells: ['Rent', '−GBP 900.00'], fields: { day: '2026-09-01', amount: gbp(90000), direction: 'out' } },
  ]);
  assert.deepEqual(
    lateLines([due], TODAY).map((l) => l.amount),
    [
      { text: 'GBP 500.00', dir: 'out' },
      { text: '+GBP 20.00', dir: 'in' },
      { text: '−GBP 900.00', dir: 'out' },
    ],
  );
});

test('A BLOCK WHOSE ROWS AND ENTRIES ARE NOT ONE FOR ONE says nothing it could put on the wrong line', () => {
  const torn = { ...block('todo', ['what'], [{ cells: ['A'], fields: {} }]), entries: [] } as unknown as LiveBlock;
  assert.deepEqual(lateLines([torn], TODAY), []);
  assert.deepEqual(dayGroups(torn, TODAY), []);
});

test('COMING UP IS BY DAY: one chip a day, today marked, and a row with no day left out', () => {
  const due = block('timeline', ['day', 'title', 'amount'], [
    { cells: ['2 Oct', 'Proofing press', '−GBP 1,875.00'], fields: { day: '2026-10-02', amount: gbp(187500), direction: 'out' } },
    { cells: ['2 Oct', 'Halden licence', '+GBP 2,400.00'], fields: { day: '2026-10-02', amount: gbp(240000), direction: 'in' } },
    { cells: ['', 'Undated', ''], fields: {} },
    { cells: ['5 Oct', 'Studio cleaning', '−GBP 45.00'], fields: { day: '2026-10-05', amount: gbp(4500), direction: 'out' } },
  ]);
  const days = dayGroups(due, TODAY);
  assert.deepEqual(
    days.map((d) => [d.weekday, d.date, d.label, d.today, d.lines.map((l) => [l.title, l.amount?.dir ?? null])]),
    [
      [
        'Fri',
        '2',
        'Friday 2 October',
        true,
        [
          ['Proofing press', 'out'],
          ['Halden licence', 'in'],
        ],
      ],
      ['Mon', '5', 'Monday 5 October', false, [['Studio cleaning', 'out']]],
    ],
  );
  assert.equal(linesIn({ kind: 'days', days }), 3);
});
