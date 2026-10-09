/**
 * A page's cards in groups, as People's list is grouped: a `cards` block that says `group:` draws each organisation as a
 * quiet heading where its most recent person stands, that person under it and the rest folded behind a line to the
 * organisation's page. And a row folded into another by a merge never shows: not as a card, and not as a name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Column, TableRow } from 'braindog-render/svelte';
import type { BlockResult } from './api.ts';
import { toSegments } from './blocks.ts';
import { REGISTERS } from './held.ts';
import { survivorsOf } from './names.ts';
import { foldedTo, groupCards, type GroupKey } from './people.ts';
import { refMapOf } from './remote.ts';
import type { Entry, Fields, RegisterDecl } from './schema.ts';

REGISTERS.people = {
  id: 'people',
  name: 'People',
  one: 'person',
  title: 'name',
  mobile: ['name', 'role', 'org'],
  meets: { name: 'name', org: 'org', merged_into: 'merged_into', in_touch: 'in_touch' },
  fields: [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'role', label: 'Role', type: 'text' },
    { id: 'org', label: 'Organisation', type: 'ref', to: 'organisations' },
    { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'people' },
    { id: 'in_touch', label: 'Last in touch', type: 'day' },
  ],
} as unknown as RegisterDecl;

REGISTERS.organisations = {
  id: 'organisations',
  name: 'Organisations',
  one: 'organisation',
  title: 'name',
  mobile: ['name', 'kind', 'domain'],
  org: { name: 'name', merged_into: 'merged_into' },
  fields: [
    { id: 'name', label: 'Organisation', type: 'text' },
    { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'organisations' },
  ],
} as unknown as RegisterDecl;

const k = (key: string, ref: number | null = null): GroupKey => ({ key, name: key, ref });

test('A GROUP STANDS WHERE ITS FIRST CARD STOOD, and a run of cards in no group is one run', () => {
  const runs = groupCards([k('a', 1), null, k('b', 2), k('a', 1), null, k('a', 1)], true);
  assert.deepEqual(runs, [
    { kind: 'group', key: 'a', name: 'a', ref: 1, rows: [0, 3, 5], total: 3 },
    { kind: 'loose', rows: [1, 2, 4] },
  ]);
});

test('A GROUP OF MORE THAN THREE SHOWS ITS MOST RECENT; a number shows that many; a group named by words alone shows all', () => {
  assert.equal(foldedTo(24, true), 1);
  assert.equal(foldedTo(3, true), 3);
  assert.equal(foldedTo(24, 2), 2);
  assert.equal(foldedTo(24, false), 24);
  const keys = Array.from({ length: 5 }, () => k('x', 7));
  assert.deepEqual(groupCards(keys, true)[0], { kind: 'group', key: 'x', name: 'x', ref: 7, rows: [0], total: 5 });
  const words = Array.from({ length: 5 }, () => k('x'));
  assert.equal(groupCards(words, true)[0]?.rows.length, 5, 'nowhere to open the rest, so none is folded away');
  assert.deepEqual(groupCards([k('x', 7), k('x', 7)], true, new Set([1])), [{ kind: 'loose', rows: [0] }], 'a card that is gone leaves one, which is no group');
});

/* ── a block, drawn ──────────────────────────────────────────────────────── */

const columns = [
  { field: 'name', label: 'Name', as: 'who' },
  { field: 'role', label: 'Role', as: 'fact' },
  { field: 'org', label: 'Organisation', as: 'fact' },
  { field: 'in_touch', label: 'Last in touch', as: 'when' },
] as unknown as Column[];

let seq = 0;
const person = (fields: Fields): Entry => ({ seq: ++seq, fields, version: 1, created: '2026-09-01T00:00:00Z', by: 'p_owner' });
const rowOf = (e: Entry, org: string | null): TableRow =>
  ({ key: `people#${e.seq}`, href: `/r/people/${e.seq}`, cells: [String(e.fields.name), String(e.fields.role ?? ''), org, String(e.fields.in_touch ?? '')] }) as TableRow;

function block(entries: Entry[], extra: Partial<BlockResult> = {}): BlockResult {
  const names = new Map([
    ['organisations#7', 'Brightwell'],
    ['organisations#9', 'Halden Type Co'],
  ]);
  const said = (e: Entry) => (typeof e.fields.org === 'number' ? (names.get(`organisations#${e.fields.org}`) ?? null) : null);
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
    rows: entries.map((e) => rowOf(e, said(e))),
    refusals: [],
    shown: entries.length,
    total: entries.length,
    drawn: true,
    stale_at: '2026-10-06T12:00:00Z',
    names: names as never,
    groups: entries.map(said),
    ...extra,
  } as BlockResult;
}

const text = (segments: ReturnType<typeof toSegments>): string[] =>
  segments.map((s) => (s.type === 'block' ? `cards: ${s.rows.slice(1).map((r) => r.cells[0]).join(', ')}` : s.type === 'markdown' ? s.text.trim() : s.type));

test('TWENTY-FOUR COLLEAGUES OF ONE COMPANY ARE ONE HEADING AND ONE CARD, the rest a line away on its page', () => {
  seq = 0;
  const teodor = person({ name: 'Teodor', role: 'Contractor', org: 7, in_touch: '2026-10-05' });
  const jo = person({ name: 'Jo', in_touch: '2026-10-04' });
  const brightwell = Array.from({ length: 23 }, (_, i) => person({ name: `Colleague ${i}`, org: 7, in_touch: '2026-09-20' }));
  const ana = person({ name: 'Ana', org: 9, in_touch: '2026-09-02' });
  const segments = toSegments(block([teodor, jo, ...brightwell, ana]));
  assert.deepEqual(text(segments), [
    '**[Brightwell](/r/organisations/7)** · 24 people',
    'cards: [Teodor](/r/people/1)',
    '[Show all 24 people at Brightwell](/r/organisations/7)',
    'cards: [Jo](/r/people/2), [Ana](/r/people/26)',
  ]);
  const card = segments[1];
  assert.ok(card?.type === 'block' && card.rows[1]?.cells[2] === '', 'under its heading a card does not say Brightwell again');
  const loose = segments[3];
  assert.ok(loose?.type === 'block' && loose.rows[2]?.cells[2] === 'Halden Type Co', 'a person alone with their company still names it');
});

test('A BLOCK THAT DOES NOT SAY group: IS DRAWN AS IT WAS, and the names come from the rows when the record sent none', () => {
  seq = 0;
  const a = person({ name: 'A', org: 9, in_touch: '2026-10-01' });
  const b = person({ name: 'B', org: 9, in_touch: '2026-09-01' });
  const plain = toSegments(block([a, b], { group: undefined } as never));
  assert.deepEqual(text(plain), ['cards: [A](/r/people/1), [B](/r/people/2)']);
  const unsaid = toSegments(block([a, b], { groups: undefined } as never));
  assert.equal(text(unsaid)[0], '**[Halden Type Co](/r/organisations/9)** · 2 people');
  assert.equal(text(unsaid).length, 2, 'two people show both, with nothing folded');
});

test('A PERSON FOLDED INTO ANOTHER IS NO CARD, so a merged duplicate never makes a group of one person twice', () => {
  seq = 0;
  const teodor = person({ name: 'Teodor', org: 7, in_touch: '2026-10-05' });
  const dup = person({ name: 'teodor', org: 7, in_touch: '2026-10-06', merged_into: 1 });
  assert.deepEqual(text(toSegments(block([dup, teodor]))), ['cards: [Teodor](/r/people/1)']);
});

test('A BLOCK THAT IS A SLICE OF ITS LIST DOES NOT COUNT A GROUP FROM THE SLICE, and one whose every card was merged away is blank', () => {
  seq = 0;
  const brightwell = Array.from({ length: 5 }, (_, i) => person({ name: `Colleague ${i}`, org: 7, in_touch: '2026-09-20' }));
  assert.deepEqual(text(toSegments(block(brightwell, { total: 80 }))), ['**[Brightwell](/r/organisations/7)**', 'cards: [Colleague 0](/r/people/1)', '[Show everyone at Brightwell](/r/organisations/7)']);
  seq = 0;
  const dup = person({ name: 'teodor', org: 7, merged_into: 9 });
  assert.deepEqual(toSegments(block([dup])), []);
});

/* ── a name, through a merge ─────────────────────────────────────────────── */

test('A REF TO A FOLDED ROW READS AS THE ROW IT WAS FOLDED INTO, followed to the end, and a circle is left alone', () => {
  const rows = [
    { id: 'A', seq: 1, fields: { name: 'Joaquin Herrera' } },
    { id: 'B', seq: 2, fields: { name: 'joaquinherrera', merged_into: 'A' } },
    { id: 'C', seq: 3, fields: { name: 'S. Herrera', merged_into: 'people#2' } },
    { id: 'D', seq: 4, fields: { name: 'Loop one', merged_into: 'E' } },
    { id: 'E', seq: 5, fields: { name: 'Loop two', merged_into: 'D' } },
    { id: 'F', seq: 6, fields: { name: 'Jo', merged_into: 'Joaquin Herrera' } },
  ];
  assert.deepEqual([...survivorsOf('people', rows)], [
    ['B', 'A'],
    ['C', 'A'],
    ['F', 'A'],
  ]);
  const map = refMapOf('people', rows);
  assert.equal(map.seqOf.get('B'), 1, 'what pointed at the folded row opens the one that stayed');
  assert.equal(map.titleOf.get(2), 'Joaquin Herrera', 'and its number is said by that one name');
  assert.equal(map.idOf.get(2), 'B', 'its own number still names its own row, for a write that means it');
  assert.equal(map.seqOf.get('D'), 4);
  const tasks = { ...REGISTERS.people!, meets: undefined } as unknown as RegisterDecl;
  REGISTERS.plain = { ...tasks, id: 'plain' };
  assert.equal(survivorsOf('plain', rows).size, 0, 'a list that declares no merge folds nothing');
});
