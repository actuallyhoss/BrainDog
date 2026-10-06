/**
 * What a card block's rows say about themselves on a live record: each card's group, read off its own row as the record
 * answers it now (`PageRow.group`), and who changed each row last, as a byline with its Undo's batch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from './held.ts';
import { blockOf } from './page-live.ts';
import type { RegisterDecl } from './schema.ts';

REGISTERS.people = {
  id: 'people',
  name: 'People',
  one: 'person',
  title: 'name',
  mobile: ['name', 'org'],
  fields: [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'org', label: 'Organisation', type: 'ref', to: 'organisations' },
    { id: 'changed', label: 'Changed', type: 'text' },
  ],
} as unknown as RegisterDecl;

const AT = Date.UTC(2026, 9, 6, 12);
const person = (seq: number, name: string, org: string | null, group?: unknown) => ({
  id: `01JPERSON${String(seq).padStart(17, '0')}`,
  register: 'people',
  seq,
  fields: { name, ...(org ? { org } : {}) },
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T09:00:00.000Z',
  deleted_at: null,
  ...(group === undefined ? {} : { group }),
});

const cards = (rows: unknown[], more: Record<string, unknown> = {}) =>
  blockOf(
    {
      kind: 'cards',
      source: 'register.people',
      heading: 'Everyone',
      group: 'org',
      columns: [
        { field: 'name', label: 'Name', as: 'who' },
        { field: 'org', label: 'Organisation', as: 'fact' },
      ],
      rows: rows as never,
      matched: rows.length,
      refusals: [],
      ...more,
    },
    new Map(),
    AT,
  );

test('EACH CARD SAYS ITS GROUP ON ITS OWN ROW, and a card that points at nothing is no group', () => {
  const block = cards([
    person(1, 'Priya', 'A', { value: 'organisations#7', name: 'Encore' }),
    person(2, 'Jo', null, { value: '', name: 'No organisation' }),
    person(3, 'Ana', 'A', { value: 'organisations#7', name: ' Encore ' }),
  ]);
  assert.deepEqual(block.groups, ['Encore', null, 'Encore']);
});

test('A RECORD THAT PUT NO GROUP ON ANY ROW is read through the names it sent beside them, and neither is no groups', () => {
  assert.deepEqual(cards([person(1, 'Priya', 'A'), person(2, 'Jo', null)], { groups: ['Encore', 7] }).groups, ['Encore', null]);
  assert.equal(cards([person(1, 'Priya', 'A')]).groups, undefined);
  assert.equal(cards([person(1, 'Priya', 'A')], { groups: ['Encore', 'Two'] }).groups, undefined, 'names that do not line up with the rows are no names');
});

test('A GROUP THAT IS NOT THE SHAPE THE RECORD SENDS draws its card among the ungrouped', () => {
  const block = cards([person(1, 'Priya', 'A', { value: 'organisations#7', name: 7 }), person(2, 'Jo', 'A', 'Encore'), person(3, 'Ana', 'A', { value: 'organisations#7', name: 'Encore' })]);
  assert.deepEqual(block.groups, [null, null, 'Encore']);
});

test('WHO CHANGED EACH ROW LAST rides on the block as a byline, aligned with its rows, and a person’s own change carries none', () => {
  const block = cards([person(1, 'Priya', null), person(2, 'Jo', null), person(3, 'Ana', null)], {
    changes: [
      { by: 'agent', who: 'S42', agent: 'claude', for: 'Sam', at: '2026-10-06T10:00:00.000Z', batch: 'b1', run: 'S42', unseen: true },
      { by: 'you', who: 'p_owner', at: '2026-10-06T11:00:00.000Z' },
      null,
    ],
  });
  assert.equal(block.bylines?.length, 3);
  assert.deepEqual(block.bylines?.[0], {
    by: 'agent',
    name: 'Claude',
    app: null,
    for: 'Sam',
    at: '2026-10-06T10:00:00.000Z',
    batch: 'b1',
    run: 'S42',
    unseen: true,
    said: 'Claude for Sam · 2h ago',
  });
  assert.deepEqual(block.bylines?.slice(1), [null, null]);
  assert.equal(cards([person(1, 'Priya', null)], { changes: [{ by: 'you', who: 'p_owner', at: '2026-10-06T11:00:00.000Z' }] }).bylines, undefined, 'no byline on any row is no key');
});

test('A RULE IS NAMED AS ITS RULE, AND A CHANGE AFTER THE READER’S MARK IS NEW TO THEM', () => {
  const g = { value: 'organisations#7', name: 'Encore' };
  const block = cards([person(1, 'Priya', '7', g), person(2, 'Jo', '7', g)], {
    seen: '2026-10-06T09:00:00.000Z',
    changes: [
      { by: 'rule', who: 'rule:late-reply', at: '2026-10-06T08:00:00.000Z', batch: 'b2' },
      { by: 'rule', who: 'rule:late-reply', at: '2026-10-06T10:00:00.000Z', batch: 'b3' },
    ],
  });
  assert.deepEqual(block.bylines?.map((b) => [b?.by, b?.name, b?.unseen, b?.batch]), [
    ['rule', 'Late reply', false, 'b2'],
    ['rule', 'Late reply', true, 'b3'],
  ]);
  assert.deepEqual(block.groups, ['Encore', 'Encore']);
});
