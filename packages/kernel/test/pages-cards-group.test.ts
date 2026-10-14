/**
 * Cards drawn in groups (`group:` a link field of their list, `fold:` how many cards a group shows): each answered row
 * says its group by the handle and the title of the row it points at, in the order the list read them, and the block
 * answers its fold. Read over a real record, through its public `list`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { readBlock, registersOfBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'projects' },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  },
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([PROJECTS, TASKS])).ok);
  const made = (register: string, fields: Record<string, unknown>) => {
    const out = k.create(register, fields, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.id;
  };
  const kiln = made('projects', { name: 'Kiln' });
  const desk = made('projects', { name: 'Desk' });
  made('tasks', { what: 'Glaze', project: kiln });
  made('tasks', { what: 'Loose end' });
  made('tasks', { what: 'Chair', project: desk });
  made('tasks', { what: 'Fire', project: kiln });
  return k;
}

function depsOver(k: Kernel, more: Partial<PageDeps> = {}): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    if (!decl) return null;
    return { register, ...(decl.state === undefined ? {} : { state: decl.state }), fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) };
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    ...more,
  };
}

const CARDS: PageBlock = { kind: 'cards', source: 'register.tasks', heading: 'Work', columns: [{ field: 'what' }], group: 'project' };

test('EACH CARD SAYS ITS GROUP BY NAME AND HANDLE, in the order the list read them, and one that points at nothing says so', async () => {
  const k = await record();
  /* AS THE LIST READS THEM, the newest first. */
  const plain = readBlock(depsOver(k), { kind: 'cards', source: 'register.tasks', columns: [{ field: 'what' }] });
  assert.deepEqual(plain.rows.map((r) => r.fields.what), ['Fire', 'Chair', 'Loose end', 'Glaze']);
  const read = readBlock(depsOver(k), CARDS);
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(
    read.rows.map((r) => [r.fields.what, r.group]),
    [
      ['Fire', { value: 'projects#1', name: 'Kiln' }],
      ['Chair', { value: 'projects#2', name: 'Desk' }],
      ['Loose end', { value: '', name: 'No project' }],
      ['Glaze', { value: 'projects#1', name: 'Kiln' }],
    ],
    'a host draws a group where its first card stands',
  );
  assert.equal(read.group, 'project');
  assert.equal(read.fold, 3, 'the fold it did not say is answered');
  assert.equal(readBlock(depsOver(k), { ...CARDS, fold: 1 }).fold, 1);
  /* CARDS THAT GROUP BY NOTHING ARE READ AS THEY WERE. */
  assert.ok(plain.rows.every((r) => r.group === undefined));
  assert.equal(plain.fold, undefined);
});

test('A GROUP THAT IS NO LINK, CHOICE OR STATE OF THE LIST IS SAID ON THE BLOCK, as the install says it', async () => {
  const k = await record();
  const said = (b: PageBlock) => readBlock(depsOver(k), b).refusals.map((r) => [r.code, r.at]);
  /* A CHOICE GROUPS NOW (`pages-group-choice.test.ts`); a text does not. */
  assert.deepEqual(said({ ...CARDS, group: 'state' }), []);
  assert.deepEqual(said({ ...CARDS, group: 'what' }), [['DECLARATION_INVALID', 'group']]);
  assert.deepEqual(said({ ...CARDS, group: 'client' }), [['FIELD_UNKNOWN', 'group']]);
  assert.deepEqual(said({ ...CARDS, fold: 0 }), [['OUT_OF_BOUNDS', 'fold']]);
  assert.deepEqual(said({ kind: 'cards', source: 'register.tasks', columns: [{ field: 'what' }], fold: 2 }), [['DECLARATION_INVALID', 'fold']]);
  assert.deepEqual(said({ ...CARDS, source: 'actions' }), [['DECLARATION_INVALID', 'group']]);
  /* AND LANES CARRYING group ARE TOLD WHICH KINDS READ IT, at read as at install (`KEY_KINDS`): a table now does. */
  const lanes = readBlock(depsOver(k), { kind: 'lanes', source: 'register.tasks', columns: [{ field: 'what' }], group: 'project' } as PageBlock);
  const grouped = lanes.refusals.filter((r) => r.at === 'group');
  assert.deepEqual(grouped.map((r) => r.code), ['DECLARATION_INVALID']);
  assert.match(grouped[0]!.fix, /Draw these rows as cards or a table/u);
});

test('A READER WHO MAY NOT READ THE LIST THE GROUPS ARE NAMED FROM IS TOLD NO NAME, and the block names that list for the hold', async () => {
  const k = await record();
  const read = readBlock(depsOver(k, { ctx: { ...depsOver(k).ctx, reads: (r) => r !== 'projects' } }), CARDS);
  assert.ok(read.rows.every((r) => r.group === undefined));
  assert.ok(!JSON.stringify(read.rows).includes('Kiln'));
  const lists = () => [
    { id: 'tasks', fields: [{ id: 'project', type: 'ref', to: 'projects' }] },
    { id: 'projects', fields: [{ id: 'name', type: 'text' }] },
  ];
  assert.deepEqual(registersOfBlock(CARDS, undefined, { lists }).sort(), ['projects', 'tasks']);
  const { group: _group, ...ungrouped } = CARDS;
  assert.deepEqual(registersOfBlock(ungrouped, undefined, { lists }), ['tasks']);
});

test('A CARD IN NO GROUP SAYS SO IN ITS LINK\'S OWN WORDS, a name it spells in capitals kept as it is', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const deals: Declaration = {
    id: 'register.calls',
    kind: 'register',
    body: { id: 'calls', name: 'Calls', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'deal', label: 'CRM deal', type: 'ref', to: 'projects' }] },
  };
  assert.ok((await k.install([PROJECTS, deals])).ok);
  assert.ok(k.create('calls', { what: 'Ring Sam' }, OWNER).ok);
  const read = readBlock(depsOver(k), { kind: 'cards', source: 'register.calls', columns: [{ field: 'what' }], group: 'deal' });
  assert.deepEqual(read.rows.map((r) => r.group), [{ value: '', name: 'No CRM deal' }]);
});
