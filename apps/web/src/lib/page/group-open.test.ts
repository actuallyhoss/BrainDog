/**
 * A folded group opens where it is (`group-open.ts`): the block's folded drawing and its open one walked side by side,
 * the press in place of the line that went to the organisation's page, and the whole group once it is pressed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Column, TableRow } from 'braindog-render/svelte';
import type { BlockResult } from '../record/api.ts';
import { toSegments } from '../record/blocks.ts';
import { REGISTERS } from '../record/held.ts';
import type { Entry, Fields, RegisterDecl } from '../record/schema.ts';
import { openInPlace, restOf, type Opening } from './group-open.ts';

REGISTERS.people = {
  id: 'people',
  name: 'People',
  one: 'person',
  title: 'name',
  mobile: ['name', 'org'],
  meets: { name: 'name', org: 'org', merged_into: 'merged_into', in_touch: 'in_touch' },
  fields: [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'org', label: 'Organisation', type: 'ref', to: 'organisations' },
    { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'people' },
    { id: 'in_touch', label: 'Last in touch', type: 'day' },
  ],
} as unknown as RegisterDecl;

const columns = [
  { field: 'name', label: 'Name', as: 'who' },
  { field: 'org', label: 'Organisation', as: 'fact' },
] as unknown as Column[];

let seq = 0;
const person = (fields: Fields): Entry => ({ seq: ++seq, fields, version: 1, created: '2026-09-01T00:00:00Z', by: 'p_owner' });
const names = new Map([
  ['organisations#7', 'Brightwell'],
  ['organisations#9', 'Halden Type Co'],
]);
const orgOf = (e: Entry): string | null => (typeof e.fields.org === 'number' ? (names.get(`organisations#${e.fields.org}`) ?? null) : null);

function block(entries: Entry[], extra: Partial<BlockResult> = {}): BlockResult {
  return {
    kind: 'cards',
    heading: 'Everyone',
    source: 'register.people',
    register: 'people',
    group: 'org',
    fold: true,
    columns,
    entries,
    matched: entries,
    rows: entries.map((e) => ({ key: `people#${e.seq}`, href: `/r/people/${e.seq}`, cells: [String(e.fields.name), orgOf(e)] }) as unknown as TableRow),
    refusals: [],
    shown: entries.length,
    total: entries.length,
    drawn: true,
    stale_at: '2026-10-06T12:00:00Z',
    names: names as never,
    groups: entries.map(orgOf),
    ...extra,
  } as BlockResult;
}

type Seg = ReturnType<typeof toSegments>[number];

/** What is drawn, in words: a block as the names on its cards, a line as its text, and a press as what it says. */
const said = (drawn: Opening<Seg>[]): string[] =>
  drawn.map((d) =>
    d.kind === 'open'
      ? `press: ${d.label}`
      : d.segment.type === 'block'
        ? `cards: ${d.segment.rows
            .slice(1)
            .map((r) => r.cells[0])
            .join(', ')}`
        : d.segment.type === 'markdown'
          ? d.segment.text.trim()
          : d.segment.type,
  );

function people() {
  seq = 0;
  return [
    person({ name: 'Teodor', org: 7 }),
    person({ name: 'Jo' }),
    person({ name: 'Mia', org: 7 }),
    person({ name: 'Lee', org: 7 }),
    person({ name: 'Raf', org: 7 }),
    person({ name: 'Ana', org: 9 }),
    person({ name: 'Kit', org: 9 }),
  ];
}

test('A FOLDED GROUP SHOWS ITS MOST RECENT AND A PRESS FOR THE REST, where a line to its page stood', () => {
  const b = block(people());
  const drawn = openInPlace(toSegments(b), toSegments({ ...b, fold: false }), new Set());
  assert.ok(drawn, 'the two drawings line up');
  assert.deepEqual(said(drawn), [
    '**[Brightwell](/r/organisations/7)** · 4 people',
    'cards: [Teodor](/r/people/1)',
    'press: Show all 4 people at Brightwell',
    'cards: [Jo](/r/people/2)',
    '**[Halden Type Co](/r/organisations/9)** · 2 people',
    'cards: [Ana](/r/people/6), [Kit](/r/people/7)',
  ]);
});

test('PRESSED, THE GROUP OPENS IN PLACE with every person in it, and the others stay as they were', () => {
  const b = block(people());
  const drawn = openInPlace(toSegments(b), toSegments({ ...b, fold: false }), new Set(['/r/organisations/7']));
  assert.ok(drawn);
  assert.deepEqual(said(drawn), [
    '**[Brightwell](/r/organisations/7)** · 4 people',
    'cards: [Teodor](/r/people/1), [Mia](/r/people/3), [Lee](/r/people/4), [Raf](/r/people/5)',
    'cards: [Jo](/r/people/2)',
    '**[Halden Type Co](/r/organisations/9)** · 2 people',
    'cards: [Ana](/r/people/6), [Kit](/r/people/7)',
  ]);
  assert.equal(drawn[0]?.kind === 'segment' && drawn[0].segment.type === 'markdown' && drawn[0].segment.text.includes('(/r/organisations/7)'), true, "the organisation's name is still the door to its page");
});

test('A BLOCK WITH NOTHING FOLDED IS DRAWN AS IT WAS, and two drawings that do not line up answer nothing', () => {
  seq = 0;
  const b = block([person({ name: 'Ana', org: 9 }), person({ name: 'Kit', org: 9 })]);
  const drawn = openInPlace(toSegments(b), toSegments({ ...b, fold: false }), new Set());
  assert.ok(drawn);
  assert.ok(drawn.every((d) => d.kind === 'segment'), 'no press where nothing is folded');

  const folded = toSegments(block(people()));
  assert.equal(openInPlace(folded, [], new Set()), null);
  assert.equal(openInPlace(folded, folded.slice(1), new Set()), null);
});

test('ONLY A LINK ALONE ON ITS LINE IS A LINE TO THE REST', () => {
  assert.deepEqual(restOf({ type: 'markdown', text: '[Show all 4 people at Brightwell](/r/organisations/7)\n' }), { label: 'Show all 4 people at Brightwell', group: '/r/organisations/7' });
  assert.equal(restOf({ type: 'markdown', text: '**[Brightwell](/r/organisations/7)** · 4 people' }), null);
  assert.equal(restOf({ type: 'markdown', text: '[x](https://example.com)' }), null, 'an address elsewhere is no group of this record');
  assert.equal(restOf({ type: 'block' }), null);
});
