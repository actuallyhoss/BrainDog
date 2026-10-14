/**
 * THE PAGE EVERY LIST HAS (PGS-A23 job 1): `listPage(decl)` composes it from what the list says of itself, in the keys
 * the page grammar admits today, and the kernel's own page check finds no fault in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LIST_PAGE_ROWS, listPage, type ListPageShape } from '../src/default-pages.ts';
import { validateDeclaration, type Declaration } from '../src/index.ts';

type Block = Record<string, unknown> & { kind: string; key: string };

/** A list with a day it sorts by, a state of four values and an amount: the fullest page. */
const FULL: ListPageShape = {
  id: 'spends',
  name: 'Spends',
  title: 'what',
  state: 'stage',
  order: { field: 'on', dir: 'asc' },
  fields: [
    { id: 'what', type: 'text' },
    { id: 'on', type: 'day' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'amount', type: 'money' },
    { id: 'stage', type: 'enum', values: ['planned', 'booked', 'paid', 'void'] },
    { id: 'way', type: 'enum', values: ['in', 'out'] },
    { id: 'place', type: 'ref', to: 'places' },
    { id: 'checked', type: 'bool' },
    { id: 'source_id', type: 'text' },
    { id: 'notes', type: 'document' },
    { id: 'old', type: 'enum', values: ['a', 'b'], retired: true },
  ],
};

/** A list of one text field: nothing to sort by, lay out in lanes, place on a day or pick by. */
const BARE: ListPageShape = { id: 'jottings', name: 'Jottings', title: 'line', fields: [{ id: 'line', type: 'text' }] };

const blocksOf = (page: Record<string, unknown>): Block[] => page.blocks as Block[];
const fieldsOf = (block: Block): string[] => (block.columns as { field: string }[]).map((c) => c.field);

/** The page as a declaration, and the list it is over as what is installed, for the kernel's own check. */
const fault = (list: ListPageShape, page: Record<string, unknown>) =>
  validateDeclaration(
    { id: `page.${list.id}`, kind: 'page', body: page as never } satisfies Declaration,
    new Map([[`register.${list.id}`, { fields: list.fields } as never]]),
  );

test('a full list answers a page the kernel checks with no fault', () => {
  assert.equal(fault(FULL, listPage(FULL, { count: 217 })), null);
  assert.equal(fault(FULL, listPage(FULL)), null);
  assert.equal(fault(BARE, listPage(BARE, { count: 0 })), null);
});

test('it is pure: the same list answers the same page, and the list is left as it was', () => {
  const before = JSON.stringify(FULL);
  assert.deepEqual(listPage(FULL, { count: 3 }), listPage(FULL, { count: 3 }));
  assert.equal(JSON.stringify(FULL), before);
  const source = readFileSync(fileURLToPath(new URL('../src/default-pages.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /Date\.now|new Date|\bSql\b|\.prepare\(|Math\.random/u);
});

test('it opens on one lead line that says how many the list holds', () => {
  const page = listPage(FULL, { count: 217 });
  const [lead, ...rest] = blocksOf(page);
  assert.equal(page.title, 'Spends');
  assert.equal(lead!.kind, 'note');
  assert.equal(lead!.lead, true);
  assert.equal(lead!.body, '217 in Spends, newest first.');
  assert.equal(rest.filter((b) => b.kind === 'note').length, 0);
  assert.equal(blocksOf(listPage(FULL, { count: 1 }))[0]!.body, '1 in Spends.');
  assert.equal(blocksOf(listPage(FULL, { count: 0 }))[0]!.body, 'Nothing in Spends yet.');
  /* WITH NO COUNT IN HAND it still says one true line, and never a nought it did not read. */
  assert.equal(blocksOf(listPage(FULL))[0]!.body, 'Everything in Spends, newest first.');
  assert.doesNotMatch(JSON.stringify(page), /—/u);
});

test('its main block is one table over the list, newest first by its day, fifty at a time', () => {
  const tables = blocksOf(listPage(FULL)).filter((b) => b.kind === 'table');
  assert.equal(tables.length, 1);
  const rows = tables[0]!;
  assert.equal(rows.key, 'rows');
  assert.equal(rows.source, 'register.spends');
  assert.equal(rows.span, 12);
  assert.equal(rows.limit, 50);
  assert.equal(LIST_PAGE_ROWS, 50);
  /* THE DAY THE LIST PUTS ITSELF IN ORDER BY, read newest first whichever way the list reads it. */
  assert.deepEqual(rows.order, [{ field: 'on', dir: 'desc' }]);
  assert.deepEqual(listPage({ ...FULL, order: undefined }).requires, ['register.spends']);
});

test('a list that declares no day of its own comes newest made first', () => {
  const { order: _, ...unordered } = FULL;
  const rows = blocksOf(listPage(unordered)).find((b) => b.key === 'rows')!;
  assert.deepEqual(rows.order, [{ field: 'created_at', dir: 'desc' }]);
  /* AND ONE PUT IN ORDER BY A FIELD THAT IS NO DAY keeps its own order, and its line does not say newest. */
  const ranked: ListPageShape = { ...BARE, fields: [...BARE.fields, { id: 'rank', type: 'int' }], order: { field: 'rank' } };
  const page = listPage(ranked, { count: 4 });
  assert.deepEqual(blocksOf(page).find((b) => b.key === 'rows')!.order, [{ field: 'rank', dir: 'asc' }]);
  assert.equal(blocksOf(page)[0]!.body, '4 in Jottings.');
});

test('its columns are the short form of the list: the title first, never an id, a long text or a retired field', () => {
  const rows = blocksOf(listPage(FULL)).find((b) => b.key === 'rows')!;
  const fields = fieldsOf(rows);
  assert.deepEqual(fields.slice(0, 4), ['what', 'stage', 'on', 'amount']);
  assert.ok(fields.length <= 6);
  for (const never of ['source_id', 'notes', 'old']) assert.ok(!fields.includes(never), never);
  const ids: ListPageShape = { ...BARE, fields: [...BARE.fields, { id: 'id', type: 'text' }, { id: 'ulid', type: 'text' }, { id: 'paid', type: 'bool' }] };
  assert.deepEqual(fieldsOf(blocksOf(listPage(ids)).find((b) => b.key === 'rows')!), ['line', 'paid']);
});

test('a board is offered only when the state has an order, and a calendar only when there is a day', () => {
  const full = blocksOf(listPage(FULL));
  const board = full.find((b) => b.kind === 'board')!;
  assert.equal(board.source, 'register.spends');
  assert.deepEqual(fieldsOf(board).slice(0, 2), ['stage', 'what']);
  const calendar = full.find((b) => b.kind === 'calendar')!;
  /* THE DAY A THING IS DUE BEFORE THE DAY IT HAPPENED, and the months ahead of today. */
  assert.deepEqual(fieldsOf(calendar), ['what', 'due']);
  assert.equal(calendar.limit, undefined);

  const stateless: ListPageShape = { ...FULL, state: undefined };
  assert.equal(blocksOf(listPage(stateless)).some((b) => b.kind === 'board'), false);
  /* A STATE OF ONE VALUE HAS NO ORDER TO LAY OUT. */
  const one: ListPageShape = { ...FULL, fields: FULL.fields.map((f) => (f.id === 'stage' ? { ...f, values: ['only'] } : f)) };
  assert.equal(blocksOf(listPage(one)).some((b) => b.kind === 'board'), false);
  const dayless: ListPageShape = { ...FULL, order: undefined, fields: FULL.fields.filter((f) => f.type !== 'day') };
  assert.equal(blocksOf(listPage(dayless)).some((b) => b.kind === 'calendar'), false);
  assert.equal(fault(dayless, listPage(dayless)), null);
});

test('cards are offered only when the list marks its things or holds a picture', () => {
  assert.equal(blocksOf(listPage(FULL)).some((b) => b.kind === 'cards'), false);
  const marked: ListPageShape = {
    ...FULL,
    identity: { mark: 'sign', accent: 'hue' },
    fields: [...FULL.fields, { id: 'sign', type: 'text' }, { id: 'hue', type: 'int' }, { id: 'photo', type: 'file' }],
  };
  const page = listPage(marked);
  const cards = blocksOf(page).find((b) => b.kind === 'cards')!;
  assert.deepEqual(
    (cards.columns as { field: string; as: string }[]).filter((c) => c.as !== 'fact').map((c) => `${c.field}:${c.as}`),
    ['what:title', 'sign:mark', 'hue:hue', 'photo:picture'],
  );
  /* THE MARK AND ITS COLOUR ARE DRAWN ON THE CARD, never read as columns of the table. */
  const cols = fieldsOf(blocksOf(page).find((b) => b.key === 'rows')!);
  assert.ok(!cols.includes('sign') && !cols.includes('hue') && !cols.includes('photo'));
  assert.equal(fault(marked, page), null);
});

test('filters are on choice, link and yes-or-no fields only, the state first, four at most', () => {
  const filters = listPage(FULL).filters as { field: string; control: string }[];
  assert.deepEqual(
    filters.map((f) => f.field),
    ['stage', 'way', 'place', 'checked'],
  );
  assert.equal(filters.find((f) => f.field === 'way')!.control, 'segmented');
  assert.equal(filters.find((f) => f.field === 'place')!.control, 'chips');
  const many: ListPageShape = { ...BARE, fields: [...BARE.fields, ...['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, type: 'bool' as const }))] };
  assert.equal((listPage(many).filters as unknown[]).length, 4);
  assert.equal(listPage(BARE).filters, undefined);
});

test('every block has a key, no two the same, and the other views sit under one folded heading', () => {
  for (const list of [FULL, BARE]) {
    const keys = blocksOf(listPage(list)).map((b) => b.key);
    assert.ok(keys.every((k) => typeof k === 'string' && /^[a-z][a-z0-9_-]{0,47}$/u.test(k)));
    assert.equal(new Set(keys).size, keys.length);
  }
  const full = blocksOf(listPage(FULL));
  assert.deepEqual(
    full.map((b) => b.kind),
    ['note', 'table', 'section', 'board', 'calendar'],
  );
  assert.equal(full[2]!.fold, true);
  assert.ok(full.length <= 6);
});

test('a list of one text field answers its line, one table and nothing else', () => {
  const page = listPage(BARE, { count: 2 });
  assert.deepEqual(
    blocksOf(page).map((b) => b.kind),
    ['note', 'table'],
  );
  assert.deepEqual(fieldsOf(blocksOf(page)[1]!), ['line']);
  assert.deepEqual(Object.keys(page).sort(), ['blocks', 'page', 'requires', 'title']);
});

test('the file names no list of any add-on, and no key the grammar does not admit yet', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/default-pages.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /register\.[a-z]/u);
  for (const block of blocksOf(listPage(FULL)))
    for (const owed of ['more', 'sort', 'select', 'edit', 'views']) assert.ok(!Object.hasOwn(block, owed), owed);
});
