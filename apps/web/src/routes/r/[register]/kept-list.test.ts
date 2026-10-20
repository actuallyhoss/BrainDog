/** `kept-list.ts`: a list's first page goes into the local copy as plain JSON and comes back as the same names map. */

import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countsOf, keptOf, listsOf, namesOf, searchFieldsOf, searchKept, servedWhole, spotOf, walkWhole } from './kept-list.ts';
import { compile } from '@braindog/where';
import { terms } from '../../../lib/record/find.ts';
import type { RegisterDecl } from '../../../lib/record/schema.ts';

const decl = {
  id: 'tasks',
  name: 'Tasks',
  one: 'task',
  title: 'title',
  mobile: ['title', 'state', 'project'],
  fields: [
    { id: 'title', type: 'text' },
    { id: 'project', type: 'ref', to: 'projects' },
    { id: 'people', type: 'list', of: 'ref', to: 'people' },
    { id: 'parent', type: 'ref', to: 'tasks' },
  ],
} as unknown as RegisterDecl;

test('THE LISTS AN ANSWER IS READ FROM: the list, then each list a ref points at, once', () => {
  assert.deepEqual(listsOf('tasks', decl), ['tasks', 'projects', 'people']);
});

test('THE NAMES GO AS PAIRS AND COME BACK AS A MAP, marks and all', () => {
  const names = Object.assign(new Map([['projects#1', 'Kiln']]), { marks: new Map([['projects#1', { mark: 'K' }]]) });
  const kept = keptOf(decl, [], 0, names as never);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).names, [['projects#1', 'Kiln']]);
  const back = namesOf(kept);
  assert.equal(back.get('projects#1'), 'Kiln');
  assert.deepEqual(back.marks?.get('projects#1'), { mark: 'K' });
  assert.equal(namesOf({ names: [], marks: null }).marks, undefined);
});

test('THE CURSOR AND THE COUNTS ARE KEPT, and only a copy holding both is drawn without asking', () => {
  const counted = new Map([['state', new Map([['open', 3]])]]);
  const kept = keptOf(decl, [], 3, new Map() as never, { cursor: 'c1', pills: counted });
  assert.deepEqual(kept.pills, [['state', [['open', 3]]]]);
  assert.deepEqual(countsOf(kept.pills!).get('state')?.get('open'), 3);
  assert.equal(servedWhole(kept, true), true);
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never, { cursor: 'c1', pills: null }), true), false, 'counts the record withheld');
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never, { cursor: null, pills: null }), false), true, 'no bar, no counts needed');
  assert.equal(servedWhole(keptOf(decl, [], 3, new Map() as never), false), false, 'a copy kept before the cursor was');
});

test("THE PAGE'S SPOT: asked by its chips, its sort and its counted pills; a search is every field; no sort is the record's order", () => {
  const ask = { filters: [{ field: 'state', op: 'in', values: ['open'] }], q: '', sort: { field: 'due' }, twice: false };
  assert.deepEqual(spotOf('tasks', ask, ['priority']), { list: 'tasks', at: ['entries'], by: ['state', 'due', 'priority'] });
  assert.equal(spotOf('tasks', { ...ask, q: 'bank' }, []).by, null);
  assert.equal(spotOf('tasks', { ...ask, twice: true }, []).by, null);
  assert.equal(spotOf('tasks', { ...ask, sort: undefined }, []).newest, true);
});

const notes = {
  id: 'notes',
  name: 'Notes',
  one: 'note',
  title: 'title',
  fields: [
    { id: 'title', type: 'text', search: true },
    { id: 'body', type: 'text', search: true },
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'kind', type: 'enum', values: ['a', 'b'] },
  ],
} as unknown as RegisterDecl;
const row = (seq: number, fields: Record<string, unknown>) => ({ seq, fields, version: 1, created: '', by: '' }) as never;

test("A SEARCH OVER A WHOLE KEPT LIST: every word a part of a word, in the order kept, as the record's box reads it", () => {
  const kept = keptOf(notes, [row(3, { title: 'Renewals due', body: 'call Zürich' }), row(2, { title: 'Children', tags: ['school'] }), row(1, { title: 'Rent' })], 3, new Map() as never, { cursor: null });
  const seqs = (q: string) => searchKept(kept, q)?.entries.map((e) => e.seq);
  assert.deepEqual(seqs('ren'), [3, 2, 1], 'a part of a word, the middle of Children too');
  assert.deepEqual(seqs('ldr due'), [], 'every word: ldr is in Children but due is not');
  assert.deepEqual(seqs('ewa call'), [3], 'both words, any field, any order');
  assert.deepEqual(seqs('zurich'), [], 'only ASCII is folded, as lower() does');
  assert.deepEqual(seqs('sch'), [], 'a list that is not marked searchable is not searched');
  assert.equal(searchKept(kept, '  -- ')?.entries, undefined, 'nothing typed that survives is no search');
});

test("THE BROWSER AND THE RECORD GIVE THE SAME HITS: the same words run through the record's SQL over the same rows", () => {
  const rows = [
    { title: 'Renewals due', body: 'call Zürich about the kiln', kind: 'a' },
    { title: 'Children', body: '', kind: 'b' },
    { title: 'Rent', body: 'Brick-order renewal', kind: 'a' },
    { title: 'Rates', body: 'ZURICH office', kind: 'b' },
    { title: 'Kiln', body: 'ren', kind: 'b' },
    { title: 'Quiet' },
  ].map((fields, i) => row(i + 1, fields));
  const kept = keptOf(notes, rows, rows.length, new Map() as never, { cursor: null });
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE entry (seq INTEGER, fields TEXT)');
  for (const r of rows as unknown as { seq: number; fields: object }[])
    db.prepare('INSERT INTO entry (seq, fields) VALUES (?, ?)').run(r.seq, JSON.stringify(r.fields));
  const schema = { register: 'notes', fields: { title: { type: 'text' }, body: { type: 'text' } } };
  /* The record's tree for the box, as `treeOf` in remote.ts builds it (node cannot load that file). */
  const record = (q: string): number[] => {
    const words = terms(q) ?? [];
    const tree = { all: words.map((w) => ({ any: ['title', 'body'].map((field) => ({ field, contains: w })) })) };
    const c = compile(tree as never, schema as never);
    return (db.prepare(`SELECT seq FROM entry WHERE ${c.sql} ORDER BY seq DESC`).all(...c.params) as { seq: number }[]).map((x) => x.seq);
  };
  for (const q of ['ren', 'ren due', 'kiln', 'zurich', 'Zürich', 'ewal', 'a', 'brick order', 'nothing here', 'REN'])
    assert.deepEqual(searchKept(kept, q)?.entries.map((e) => e.seq), record(q), `"${q}"`);
});

test('A SEARCH IS NOT ANSWERED FROM A COPY THAT MAY NOT HOLD EVERY ROW, or reads a field otherwise than the record', () => {
  const rows = [row(1, { title: 'Rent' })];
  assert.equal(searchKept(keptOf(notes, rows, 1, new Map() as never, { cursor: 'next' }), 'ren'), null, 'a next page');
  assert.equal(searchKept(keptOf(notes, rows, 1, new Map() as never), 'ren'), null, 'kept before its cursor was');
  assert.equal(searchKept(keptOf(notes, rows, 4, new Map() as never, { cursor: null }), 'ren'), null, 'counted past the rows');
  assert.equal(searchKept(keptOf(notes, [{ ...(rows[0] as unknown as object), clipped: true } as never], 1, new Map() as never, { cursor: null }), 'ren'), null, 'a cut text');
  const reffed = { ...notes, fields: [...notes.fields, { id: 'project', type: 'ref', to: 'projects', search: true }] } as unknown as RegisterDecl;
  assert.equal(searchFieldsOf(reffed), null, 'a searchable ref');
  const plain = { ...notes, fields: [{ id: 'title', type: 'text' }, { id: 'body', type: 'text', search: true }, { id: 'old', type: 'text', search: true, retired: true }] } as unknown as RegisterDecl;
  assert.deepEqual(searchFieldsOf(plain), ['body'], 'a title is searched only if it says so, and a retired field never');
});

test('A FILTER OVER A WHOLE KEPT LIST is asked here as the record would, with or without words; a ref or a relative day is not', () => {
  const kept = keptOf(notes, [row(3, { title: 'Rent', kind: 'a' }), row(2, { title: 'Renewals', kind: 'b' }), row(1, { title: 'Rates', kind: 'a' })], 3, new Map() as never, { cursor: null });
  const seqs = (q: string, where: unknown) => searchKept(kept, q, where as never)?.entries.map((e) => e.seq);
  assert.deepEqual(seqs('', { field: 'kind', is: 'a' }), [3, 1], 'chips alone');
  assert.deepEqual(seqs('ren', { field: 'kind', is: 'a' }), [3], 'chips and words');
  assert.equal(searchKept(kept, '', null), null, 'nothing asked');
  assert.equal(seqs('', { field: 'nope', is: 'x' }), undefined, 'not a question the browser asks');
});

test("A SEARCHABLE REF IS THE RECORD'S TO SEARCH: it reads the stored id, which this copy does not hold", () => {
  const reffed = { ...notes, fields: [...notes.fields, { id: 'project', type: 'ref', to: 'projects', search: true }] } as unknown as RegisterDecl;
  const names = new Map([['projects#4', 'Kiln build']]);
  const kept = keptOf(reffed, [row(2, { title: 'Order bricks', project: 4 })], 1, names as never, { cursor: null });
  assert.equal(searchKept(kept, 'kiln'), null);
});

test('THE IDS COME WITH THE NAMES, and the page carries where they are for a create', () => {
  const names = Object.defineProperty(new Map([['projects#1', 'Kiln']]), 'ids', { value: new Map([['projects R1', 1]]), enumerable: false });
  const kept = keptOf(decl, [], 0, names as never);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)).ids, [['projects R1', 1]]);
  assert.equal(namesOf(kept).ids?.get('projects R1'), 1);
  assert.deepEqual(spotOf('tasks', { filters: [], q: '', sort: undefined, twice: false }, [], null).lands?.ids, ['ids']);
});

test('WALKED WHOLE: the pages after the first, each when idle, kept only when the count still matches', async () => {
  const page = (seqs: number[], cursor: string | null, matched = 4) => ({ entries: seqs.map((s) => row(s, { title: `r${s}` })), matched, names: new Map() as never, cursor });
  let idles = 0;
  const opts = { most: 10, idle: async () => void (idles += 1), gone: () => false };
  const whole = await walkWhole(page([4, 3], 'c1'), async (c) => (c === 'c1' ? page([2, 1], null) : null), opts);
  assert.deepEqual(whole?.entries.map((e) => e.seq), [4, 3, 2, 1]);
  assert.equal(whole?.cursor, null);
  assert.equal(idles, 1);
  assert.equal(await walkWhole(page([4, 3], 'c1'), async () => page([2], null, 4), opts), null, 'a row missed at the seam');
  assert.equal(await walkWhole(page([4, 3], 'c1'), async () => null, opts), null, 'a page refused');
  assert.equal(await walkWhole(page([4, 3], 'c1', 40), async () => page([2, 1], null, 40), opts), null, 'more than it keeps');
  assert.equal(await walkWhole(page([4, 3], 'c1'), async () => page([2, 1], null), { ...opts, gone: () => true }), null, 'the screen went');
});
