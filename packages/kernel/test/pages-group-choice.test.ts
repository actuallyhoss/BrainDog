/**
 * Cards and tables drawn in groups by a choice of their list or its state (`group:`, a block's own or its look's): each
 * answered row says its group by the value it holds and the choice's label for it, else the value in plain words, in
 * the order the list read them. A link groups as it did; any other field is refused in a sentence that names what may.
 * Read over a real record, through its public `list`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { readBlock, readPage, type PageBlock, type PageDecl, type PageDeps } from '../src/pages.ts';
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
    state: 'state',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'projects' },
      { id: 'state', type: 'enum', values: ['open', 'in_progress', 'done'], labels: { open: 'To do' }, default: 'open' },
      { id: 'kind', type: 'enum', values: ['bill', 'licence', 'cover'], labels: { bill: 'Bills', licence: 'Licences', cover: 'Cover' } },
      { id: 'hours', type: 'int' },
      { id: 'note', type: 'text' },
    ],
  },
};

const STATES = ['open', 'in_progress', 'done'];
const KINDS = ['bill', 'licence', 'cover'];

/** Fourteen tasks, the first of them on a project, written oldest first so the list reads the newest first. */
async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([PROJECTS, TASKS])).ok);
  const kiln = k.create('projects', { name: 'Kiln' }, OWNER);
  assert.ok(kiln.ok);
  for (let i = 0; i < 14; i++) {
    const fields: Record<string, unknown> = { what: `Thing ${i}`, hours: i, note: `Note ${i % 3}`, ...(i === 13 ? {} : { kind: KINDS[i % 3] }), ...(i === 0 ? { project: kiln.value.id } : {}) };
    const made = k.create('tasks', fields, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    if (i % 3 !== 0) assert.ok(k.update('tasks', made.value.id, { state: STATES[i % 3] }, OWNER).ok);
  }
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

const CARDS: PageBlock = { kind: 'cards', source: 'register.tasks', heading: 'Work', columns: [{ field: 'what' }], limit: 40, group: 'state' };
/** What each task's state is named, by the number in its name. */
const stateName = (i: number): string => ['To do', 'In progress', 'Done'][i % 3]!;
const numberOf = (what: unknown): number => Number(String(what).slice('Thing '.length));

test('CARDS GROUPED BY STATE ANSWER EVERY ROW WITH ITS STATE: the label it has, else the value in plain words', async () => {
  const k = await record();
  const { group: _group, ...ungrouped } = CARDS;
  const plain = readBlock(depsOver(k), ungrouped);
  const read = readBlock(depsOver(k), CARDS);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.rows.length, 14);
  assert.deepEqual(read.rows.map((r) => r.fields.what), plain.rows.map((r) => r.fields.what), 'the rows stay in the order read');
  for (const r of read.rows) {
    const i = numberOf(r.fields.what);
    assert.deepEqual(r.group, { value: STATES[i % 3], name: stateName(i) }, String(r.fields.what));
  }
  assert.equal(read.group, 'state');
  assert.equal(read.fold, 3, 'grouped cards fold as they do by a link');
  assert.equal(readBlock(depsOver(k), { ...CARDS, fold: 2 }).fold, 2);
});

test('CARDS GROUPED BY A CHOICE are named by its labels, and a card that holds none says so in the choice\'s words', async () => {
  const k = await record();
  const read = readBlock(depsOver(k), { ...CARDS, group: 'kind' });
  assert.deepEqual(read.refusals, []);
  for (const r of read.rows) {
    const i = numberOf(r.fields.what);
    const want = i === 13 ? { value: '', name: 'No kind' } : { value: KINDS[i % 3], name: ['Bills', 'Licences', 'Cover'][i % 3] };
    assert.deepEqual(r.group, want, String(r.fields.what));
  }
});

test('A TABLE GROUPED BY STATE says each row\'s group too, and folds nothing', async () => {
  const k = await record();
  const read = readBlock(depsOver(k), { ...CARDS, kind: 'table' } as PageBlock);
  assert.deepEqual(read.refusals, []);
  assert.ok(read.rows.every((r) => r.group?.name === stateName(numberOf(r.fields.what))));
  assert.equal(read.group, 'state');
  assert.equal(read.fold, undefined);
  /* OVER NO LIST A TABLE DRAWS NO GROUPS, and says so rather than drawing ungrouped. */
  const over = readBlock(depsOver(k), { kind: 'table', source: 'actions', columns: [{ field: 'what' }], group: 'state' } as PageBlock);
  assert.deepEqual(over.refusals.map((r) => [r.code, r.at]), [['DECLARATION_INVALID', 'group']]);
});

test('A WHOLE NUMBER IS REFUSED, in a sentence that names the links, the choices and the state the list may group by', async () => {
  const k = await record();
  for (const kind of ['cards', 'table']) {
    const read = readBlock(depsOver(k), { ...CARDS, kind, group: 'hours' } as PageBlock);
    assert.deepEqual(read.refusals.map((r) => [r.code, r.at]), [['DECLARATION_INVALID', 'group']], kind);
    assert.match(read.refusals[0]!.fix, /a link to another list, a choice or the list's state/u);
    assert.match(read.refusals[0]!.fix, /Group by project or state or kind\./u);
    assert.deepEqual(read.refusals[0]!.allowed, ['project', 'state', 'kind']);
    assert.deepEqual(read.rows, []);
  }
});

test('A LINK GROUPS AS IT DID: the row it points at, by its handle and its title', async () => {
  const k = await record();
  const read = readBlock(depsOver(k), { ...CARDS, group: 'project' });
  assert.deepEqual(read.refusals, []);
  for (const r of read.rows)
    assert.deepEqual(r.group, numberOf(r.fields.what) === 0 ? { value: 'projects#1', name: 'Kiln' } : { value: '', name: 'No project' });
});

test('THE STATE GROUPS WHATEVER ITS TYPE, since the list says it is its state', async () => {
  const k = await record();
  const deps = depsOver(k);
  const schemaOf = (register: string): Schema | null => {
    const s = deps.schemaOf(register);
    return s && register === 'tasks' ? { ...s, state: 'note' } : s;
  };
  const read = readBlock({ ...deps, schemaOf, ctx: { ...deps.ctx, schemaOf } }, { ...CARDS, group: 'note' });
  assert.deepEqual(read.refusals, []);
  assert.ok(read.rows.every((r) => r.group?.value === r.fields.note && r.group?.name === r.fields.note));
});

const LONG: PageDecl = {
  page: 'desk',
  title: 'Desk',
  blocks: [{ kind: 'note', lead: true, body: 'Your desk.' } as PageBlock, { kind: 'cards', source: 'register.tasks', heading: 'Everything', key: 'all', limit: 40 } as PageBlock],
};

const page = (deps: PageDeps) => {
  const out = readPage(deps, 'desk');
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('A LOOK THAT GROUPS FOURTEEN CARDS BY STATE DRAWS THEM UNDER THEIR STATE\'S NAME, stored or the rules\' own', async () => {
  const k = await record();
  const stored = { look: 'desk', basis: 'b', by: 'slash', group: { all: 'state' } };
  for (const look of [() => stored, () => null]) {
    const all = page(depsOver(k, { pages: () => [LONG], look })).blocks.find((b) => b.key === 'all')!;
    assert.equal(all.group, 'state');
    assert.equal(all.rows.length, 14);
    assert.ok(all.rows.every((r) => r.group?.name === stateName(numberOf(r.fields.what))), JSON.stringify(all.rows.map((r) => r.group)));
    assert.equal(all.fold, 3);
  }
  /* AND A LOOK OVER A FIELD THE READ CANNOT GROUP BY IS TAKEN OFF, never a refusal on a page that drew. */
  const text = page(depsOver(k, { pages: () => [LONG], look: () => ({ ...stored, group: { all: 'note' } }) })).blocks.find((b) => b.key === 'all')!;
  assert.deepEqual(text.refusals, []);
  assert.equal(text.group, undefined);
  assert.ok(text.rows.every((r) => r.group === undefined));
  assert.equal(text.fold, undefined);
});
