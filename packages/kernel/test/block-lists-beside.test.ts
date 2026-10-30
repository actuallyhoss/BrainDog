/**
 * The lists a block reads BESIDE its source, named, and the block keys once found unread or unheld.
 *
 * `registersOf` is what the record holds a block by, and it named only a block's `source`. Four reads went round it,
 * each measured before this file: a card's `as: next` and `as: ring` read every row of the list of steps under the
 * cards; `as: scope` and `inherit: true` read the titles of the projects list; a `sessions.live` block names each
 * run's project from that same list; and a progress block's `spent:` and `toward:` read a figure whose list nothing
 * named. So a member invited to Areas alone was drawn a hidden list's `salary`, the title of a project she may not
 * open, and a Payroll total to the unit.
 *
 * THE LISTS BESIDE A SOURCE ARE DECLARATIONS, NOT THE BLOCK'S OWN WORDS, so `registersOf` is handed a reader of them
 * (`ListsBeside`), the way it is handed `metric` for a figure's list. Without one it names what it always named.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS } from '../src/block-keys.ts';
import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { registersOf, registersOfBlock, type PageBlock, type PageDecl } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);

const page = (...blocks: PageBlock[]): PageDecl => ({ page: 'p', title: 'P', blocks });

/** Steps under Areas, projects that notes are scoped to, and the runs' projects in Things. */
const BESIDE = {
  stepsOf: (register: string) => (register === 'areas' ? [{ register: 'steps', of: 'area', done: 'done' }, { register: 'chores', of: 'area', done: 'done' }] : []),
  scopeOf: (register: string) => (register === 'notes' ? { field: 'project', to: 'things' } : null),
  projects: () => 'things',
};

/* ── the lists a card reads beside its own ────────────────────────────────────────────────────────────── */

test('A CARD WHOSE COLUMN IS as: next OR as: ring NAMES EVERY LIST OF STEPS UNDER ITS CARDS, which it reads whole', () => {
  for (const as of ['next', 'ring'] as const) {
    const cards = { kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }, { field: 'salary', as }], empty: 'None.' } as PageBlock;
    assert.deepEqual(registersOf(page(cards), undefined, BESIDE).sort(), ['areas', 'chores', 'steps'], `as: ${as}`);
    assert.deepEqual(registersOfBlock(cards, undefined, BESIDE).sort(), ['areas', 'chores', 'steps'], `as: ${as}, one block`);
  }
  /* A CARD WITH NEITHER READS NO STEPS, and a table has no card to put a step on. */
  assert.deepEqual(registersOf(page({ kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }], empty: 'None.' } as PageBlock), undefined, BESIDE), ['areas']);
  assert.deepEqual(registersOf(page({ kind: 'table', source: 'register.areas', columns: [{ field: 'name', as: 'next' }], empty: 'None.' } as PageBlock), undefined, BESIDE), ['areas']);
});

test('as: scope AND inherit: true NAME THE PROJECTS LIST, whose titles the block draws beside each row', () => {
  const scoped = { kind: 'table', source: 'register.notes', columns: [{ field: 'what' }, { field: 'project', as: 'scope' }], empty: 'None.' } as PageBlock;
  assert.deepEqual(registersOf(page(scoped), undefined, BESIDE).sort(), ['notes', 'things']);
  const inherited = { kind: 'table', source: 'register.notes', inherit: true, where: 'project is Kiln', empty: 'None.' } as PageBlock;
  assert.deepEqual(registersOf(page(inherited), undefined, BESIDE).sort(), ['notes', 'things']);
  assert.deepEqual(registersOf(page({ kind: 'table', source: 'register.notes', empty: 'None.' } as PageBlock), undefined, BESIDE), ['notes']);
});

test('THE LIVE RUNS NAME THE LIST THEIR PROJECTS ARE ROWS OF, which is where each run is named from', () => {
  assert.deepEqual(registersOf(page({ kind: 'cards', source: 'sessions.live', empty: 'None.' } as PageBlock), undefined, BESIDE).sort(), ['session', 'things']);
  /* A RECORD WITH NO PROJECTS NAMES THE RUNS ALONE, as it did. */
  assert.deepEqual(registersOf(page({ kind: 'cards', source: 'sessions.live', empty: 'None.' } as PageBlock), undefined, { projects: () => null }), ['session']);
});

test("A PROGRESS BLOCK'S spent: AND toward: NAME THE LIST THEIR FIGURE COUNTS, as a cell's figure does", () => {
  const metric = (id: string) => (id === 'pay-by-kind' ? ({ metric: id, source: 'register.payroll' } as never) : null);
  for (const key of ['spent', 'toward'] as const) {
    const block = { kind: 'progress', source: 'register.budgets', [key]: 'pay-by-kind', columns: [{ field: 'name' }, { field: 'limit' }], empty: 'None.' } as PageBlock;
    assert.deepEqual(registersOf(page(block), metric).sort(), ['budgets', 'payroll'], key);
  }
});

/* ── `where:` on inputs, which nothing read ───────────────────────────────────────────────────────────── */

const CHECKS: Declaration = {
  id: 'register.checks',
  kind: 'register',
  body: { id: 'checks', name: 'Checks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'price', type: 'int' }] } as never,
};
const inputsPage = (block: Record<string, unknown>): Declaration => ({
  id: 'page.check',
  kind: 'page',
  body: { page: 'check', title: 'Check', requires: ['register.checks'], blocks: [{ kind: 'inputs', register: 'checks', columns: [{ field: 'price' }], ...block }] } as never,
});

test('where: ON AN inputs BLOCK IS REFUSED AT INSTALL AND AT READ, because the row it edits is the one row: names', async () => {
  const lint = validateDeclaration(inputsPage({ where: 'name is Two' }));
  assert.equal(lint?.code, 'DECLARATION_INVALID', JSON.stringify(lint));
  assert.match(lint!.fix, /row:/);
  assert.equal(validateDeclaration(inputsPage({ row: 'checks#2' })), null);

  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([CHECKS])).ok);
  assert.ok(k.create('checks', { name: 'One' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('checks', { name: 'Two' }, { actor: 'p_1' }).ok);
  /* A BLOCK MADE BY HAND, as a page installed before this check carries it: refused, and no row handed to a writer. */
  const read = k.block({ kind: 'inputs', register: 'checks', where: 'name is Two', columns: [{ field: 'price' }] } as never);
  assert.equal(read.refusals[0]?.code, 'DECLARATION_INVALID', JSON.stringify(read.refusals));
  assert.equal(read.refusals[0]?.at, 'where');
  assert.deepEqual(read.rows, []);
});

/* ── what a read answers, in one list ────────────────────────────────────────────────────────────────── */

test('EVERY KEY A READ ANSWERS IS IN ANSWER_KEYS, so a steps block read back with its open count is not refused for it', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([
    { id: 'register.areas', kind: 'register', body: { id: 'areas', name: 'Areas', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
    {
      id: 'register.steps',
      kind: 'register',
      body: { id: 'steps', name: 'Steps', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'area', type: 'ref', to: 'areas' }, { id: 'done', type: 'bool' }], steps: { of: 'area', done: 'done' } },
    },
  ] as never);
  assert.ok(out.ok, JSON.stringify(out));
  for (const what of ['One', 'Two', 'Three']) assert.ok(k.create('steps', { what, done: what === 'One' }, { actor: 'p_1' }).ok);
  const drawn = k.block({ kind: 'steps', source: 'register.steps', first: 1, empty: 'None.' } as never);
  assert.deepEqual(drawn.refusals, []);
  assert.equal(drawn.open, 2);
  /* `key` is declared on every block and answered as its stable hash when the author wrote none (`blockKeyOf`). */
  const declared = new Set(['kind', 'source', 'first', 'empty', 'key']);
  const answered = Object.keys(drawn).filter((key) => !declared.has(key));
  assert.deepEqual(answered.filter((key) => !ANSWER_KEYS.includes(key)), [], 'a key the read answered is missing from ANSWER_KEYS');
  const again = k.block(drawn as never);
  assert.deepEqual(again.refusals, [], 'a block read back was refused for a key its own read answered');
});
