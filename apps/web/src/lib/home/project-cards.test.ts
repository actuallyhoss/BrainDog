/**
 * Which projects are cards on the desk and what a card says: parked and retired ones are not cards, earning leads
 * building, the brief is clean, a row with no hue is drawn in its name's, and the list is found by what it declares.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hueFor } from '../ui/hue.ts';
import { REGISTERS } from '../record/held.ts';
import { learnRowPages } from '../record/row-href.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { DESK_MOST, agentsOn, cardKpiOf, cardsOf, trendsOf, projectsOf, withKpis, type CardDecl, type KpiAnswered } from './project-cards.ts';

const decl: CardDecl = {
  id: 'ventures',
  title: 'name',
  state: 'lane',
  identity: { mark: 'mark', accent: 'hue' },
  scopes: {},
  fields: [
    { id: 'name', type: 'text' },
    { id: 'revenue', type: 'money' },
  ],
};

const row = (seq: number, fields: Record<string, unknown>) => ({ seq, fields });

test('the projects list is the one that declares scopes, whatever it is called', () => {
  const other = { id: 'tasks', scopes: undefined };
  assert.equal(projectsOf([other, decl])?.id, 'ventures');
  assert.equal(projectsOf([other]), null);
});

test('retired and parked projects are not cards; earning leads building, then the rest, each by number', () => {
  const { cards, more } = cardsOf(decl, [
    row(1, { name: 'Old', lane: 'retired' }),
    row(2, { name: 'Idea', lane: 'idea' }),
    row(3, { name: 'Build', lane: 'building' }),
    row(4, { name: 'Pause', lane: 'parked' }),
    row(5, { name: 'Earn', lane: 'earning' }),
    row(6, { name: 'Earn two', lane: 'earning' }),
  ]);
  assert.deepEqual(
    cards.map((c) => c.name),
    ['Earn', 'Earn two', 'Build', 'Idea'],
  );
  assert.equal(more, 0);
  assert.equal(cards[0]?.href, '/r/ventures/5');
});

test('a row with no name is not a card, and the card count is capped with the rest counted', () => {
  const rows = [row(1, { name: '', lane: 'building' }), ...Array.from({ length: DESK_MOST + 3 }, (_, i) => row(i + 2, { name: `P${i}`, lane: 'building' }))];
  const { cards, more } = cardsOf(decl, rows);
  assert.equal(cards.length, DESK_MOST);
  assert.equal(more, 3);
});

test('the hue is the row\'s own, and an empty one is never zero but the hue its name is drawn in everywhere', () => {
  const { cards } = cardsOf(decl, [row(1, { name: 'A', lane: 'building', hue: 210 }), row(2, { name: 'B', lane: 'building', hue: null }), row(3, { name: 'C', lane: 'building' })]);
  assert.deepEqual(
    cards.map((c) => c.hue),
    [210, hueFor('B'), hueFor('C')],
  );
});

test('the brief is about, else the first clean line of the note, never an import\'s leftovers', () => {
  const { cards } = cardsOf(decl, [
    row(1, { name: 'A', lane: 'building', about: ' Rent cars between neighbours. ', note: 'Something else.' }),
    row(2, { name: 'B', lane: 'building', note: 'Status in Notion: active\n# B\nA shared calendar for bands. It has a waitlist.' }),
    row(3, { name: 'C', lane: 'building', note: '# C' }),
  ]);
  assert.equal(cards[0]?.brief, 'Rent cars between neighbours.');
  assert.equal(cards[1]?.brief, 'A shared calendar for bands.');
  assert.equal(cards[2]?.brief, null);
});

test('the next step and one money figure are kept where the row has them', () => {
  const { cards } = cardsOf(decl, [
    row(1, { name: 'A', lane: 'earning', next: ' Send the invoice ', revenue: { amount: 875000, currency: 'USD' } }),
    row(2, { name: 'B', lane: 'building', revenue: { amount: 0, currency: 'USD' } }),
  ]);
  assert.equal(cards[0]?.next, 'Send the invoice');
  assert.deepEqual(cards[0]?.figure, { minor: 875000, currency: 'USD', field: 'revenue' });
  assert.equal(cards[1]?.next, null);
  assert.equal(cards[1]?.figure, null);
});

test('a list with no state keeps every named project', () => {
  const bare: CardDecl = { ...decl, state: undefined };
  assert.equal(cardsOf(bare, [row(1, { name: 'A', lane: 'retired' })]).cards.length, 1);
});

test('a card opens the project\'s own page where its list made one, and its row screen stays one press away', () => {
  REGISTERS.ventures = decl as unknown as RegisterDecl;
  learnRowPages([{ slug: 'earn', about: { register: 'ventures', seq: 5 } }]);
  try {
    const { cards } = cardsOf(decl, [row(5, { name: 'Earn', lane: 'earning' }), row(6, { name: 'Other', lane: 'earning' })]);
    assert.deepEqual(
      cards.map((c) => [c.href, c.row]),
      [
        ['/p/earn', '/r/ventures/5?fields=1'],
        ['/r/ventures/6', '/r/ventures/6?fields=1'],
      ],
    );
  } finally {
    learnRowPages([]);
    delete REGISTERS.ventures;
  }
});

test('a page that ordered its own cards keeps that order', () => {
  const rows = [row(3, { name: 'B', lane: 'building' }), row(1, { name: 'A', lane: 'earning' })];
  assert.deepEqual(
    cardsOf(decl, rows, rows.length, true).cards.map((c) => c.name),
    ['B', 'A'],
  );
});

test('the agents on a card are the ones working on that project now, once each, by the name a person reads', () => {
  const working = [
    { agent: 'claude', project: 'Kiln' },
    { agent: 'claude', project: 'Kiln' },
    { agent: 'codex', project: 'Portage' },
  ];
  assert.deepEqual(agentsOn('Kiln', working), [{ agent: 'claude', name: 'Claude' }]);
  assert.deepEqual(agentsOn('', working), []);
});

test('a declared card\'s line is read off its drawing by its column, with three points or more and a label', () => {
  const rows = [
    { cells: ['title', 'trend: Done a week'] },
    { cells: ['Kiln', '1 2 3 4'], ref: { seq: 3 } },
    { cells: ['Portage', '1 2'], ref: { seq: 4 } },
  ];
  assert.deepEqual([...trendsOf(rows)], [[3, { values: [1, 2, 3, 4], label: 'Done a week' }]]);
  assert.equal(trendsOf([{ cells: ['title', 'trend'] }, rows[1]!]).size, 0, 'a bare line says nothing');
});

/* ── the key number a card leads with ── */

const NOW = Date.parse('2026-10-21T10:00:00Z');
const at = { home: 'GBP', now: NOW };
/** Licence revenue a month, in pounds: June to September whole, October still running. */
const revenue: KpiAnswered = {
  kpi: 'k1',
  name: 'Licence revenue',
  thing: 'row-kiln',
  project: 'Kiln',
  unit: 'GBP',
  kind: 'flow',
  every: '1m',
  headline: true,
  points: [
    { at: '2026-06-03', amount: 'GBP 1,200.00' },
    { at: '2026-07-03', amount: 'GBP 1,500.00' },
    { at: '2026-08-03', amount: 'GBP 1,400.00' },
    { at: '2026-09-03', amount: 'GBP 1,900.00' },
    { at: '2026-10-03', amount: 'GBP 600.00' },
  ],
};

test("a card leads with its key number: the name small, a flow's last whole month, how it moved and its own line", () => {
  const k = cardKpiOf(revenue, at);
  assert.equal(k?.name, 'Licence revenue');
  assert.equal(k?.figure, '£1,900', 'September, not October so far');
  assert.deepEqual(k?.move, { said: 'Up 36% on Aug', tone: 'good' });
  assert.equal(k?.stale, null);
  assert.ok(k?.line?.line.startsWith('M'), 'four whole months draw a line');
  assert.notEqual(k?.line?.partial, '', 'the month still running is its own faint dot');
});

test('a key number with under three points is the number alone, and a stale one says so instead of how it moved', () => {
  const two = cardKpiOf({ name: 'Players', unit: 'players', kind: 'level', points: [{ at: '2026-10-19', value: 1180 }, { at: '2026-10-20', value: 1240 }] }, at);
  assert.equal(two?.figure, '1,240', 'the name beside it says what it counts');
  assert.equal(two?.line, null);
  const old = cardKpiOf({ name: 'Players', unit: 'players', kind: 'level', every: '1d', points: [{ at: '2026-09-01', value: 900 }, { at: '2026-09-02', value: 950 }, { at: '2026-09-03', value: 990 }] }, at);
  assert.equal(old?.stale, 'Not updated since 3 Sep');
  assert.equal(old?.move, null);
});

test('money in another currency is never added into a key number', () => {
  const k = cardKpiOf({ ...revenue, points: [...revenue.points, { at: '2026-09-10', amount: 'USD 9,000.00' }] }, at);
  assert.equal(k?.figure, '£1,900');
});

test('cards take the key number of their own project, by its row, and a card with none keeps its money figure', () => {
  const { cards } = cardsOf(decl, [
    { seq: 1, id: 'row-kiln', fields: { name: 'Kiln', lane: 'earning', revenue: { amount: 1840000, currency: 'GBP' } } },
    { seq: 2, id: 'row-portage', fields: { name: 'Portage', lane: 'earning', revenue: { amount: 500000, currency: 'GBP' } } },
  ]);
  assert.deepEqual(
    cards.map((c) => [c.id, c.kpi]),
    [
      ['row-kiln', null],
      ['row-portage', null],
    ],
  );
  const led = withKpis(cards, [revenue], at);
  assert.equal(led[0]?.kpi?.figure, '£1,900');
  assert.deepEqual(led[0]?.figure, { minor: 1840000, currency: 'GBP', field: 'revenue' }, 'kept for when the number goes');
  assert.equal(led[1]?.kpi, null, 'Portage keeps no key number, so it says what it did');
  /* A NAME IS NO ROW: another project of the same name is matched by its row, and a card with no row by its name. */
  assert.equal(withKpis(cards, [{ ...revenue, thing: 'row-other' }], at)[0]?.kpi, null);
  assert.equal(withKpis([{ ...cards[0]!, id: null }], [revenue], at)[0]?.kpi?.name, 'Licence revenue');
});

test('a key number nothing has arrived for leaves the card as it was', () => {
  const { cards } = cardsOf(decl, [{ seq: 1, id: 'row-kiln', fields: { name: 'Kiln', lane: 'earning' } }]);
  assert.equal(cardKpiOf({ ...revenue, points: [] }, at), null);
  assert.equal(withKpis(cards, [{ ...revenue, points: [] }], at)[0]?.kpi, null);
});
