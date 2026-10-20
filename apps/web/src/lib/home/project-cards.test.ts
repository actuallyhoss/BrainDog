/**
 * Which projects are cards on the desk and what a card says: parked and retired ones are not cards, earning leads
 * building, the brief is clean, a row with no hue is drawn in none, and the list is found by what it declares.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REGISTERS } from '../record/held.ts';
import { learnRowPages } from '../record/row-href.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { DESK_MOST, agentsOn, cardsOf, trendsOf, projectsOf, type CardDecl } from './project-cards.ts';

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

test('the hue is the row\'s own and an empty one is none, never zero', () => {
  const { cards } = cardsOf(decl, [row(1, { name: 'A', lane: 'building', hue: 210 }), row(2, { name: 'B', lane: 'building', hue: null }), row(3, { name: 'C', lane: 'building' })]);
  assert.deepEqual(
    cards.map((c) => c.hue),
    [210, null, null],
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
