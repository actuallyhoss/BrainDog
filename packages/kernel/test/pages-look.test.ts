/**
 * A page read under its look (DIRECTION §38, contract 17): every block answers a key, and `readPage` lays the look over
 * the page after its adds and before its headline is held.
 *
 * THE ROWS ARE A REAL RECORD'S, read through its public `list`, and the look is handed in as the host would hand the
 * live `look.<page>` declaration. A host that hands no look reader reads the page as declared, so nothing changes for
 * one that has not turned the engine on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { defaultBlockKey } from '../src/block-keys.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { readBlock, readPage, resolvePages, type BlockResult, type PageBlock, type PageDecl, type PageDeps } from '../src/pages.ts';
import type { PageAddition } from '../src/page-adds.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER = { actor: 'p_1' };

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
      { id: 'by', type: 'day', deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  },
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};

/** A note, whose `body` the page type does not name though every note has one. */
const note = (b: Record<string, unknown>): PageBlock => ({ kind: 'note', ...b }) as PageBlock;

const DESK: PageDecl = {
  page: 'desk',
  title: 'Desk',
  blocks: [
    note({ lead: true, body: 'Your desk.' }),
    { kind: 'table', source: 'register.notes', heading: 'Notes', columns: [{ field: 'name' }] },
    { kind: 'table', source: 'register.tasks', heading: 'Coming up', where: 'by after today', columns: [{ field: 'what' }, { field: 'by' }] },
    { kind: 'table', source: 'register.tasks', heading: 'Now', where: 'state is open', columns: [{ field: 'what' }, { field: 'by' }] },
  ],
};

/** One page a task, keyed before its row fills the heading. */
const TASK_PAGE: PageDecl = {
  page: 'task',
  title: '{{what}}',
  for: { register: 'tasks' },
  blocks: [note({ heading: '{{what}}', body: 'About {{what}}.' })],
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([TASKS, NOTES]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const task of [
    { what: 'Pay HSBC', by: '2026-10-03' },
    { what: 'Write the brief', by: '2026-10-09' },
  ])
    assert.ok(k.create('tasks', task, OWNER).ok);
  return k;
}

function depsOver(k: Kernel, more: Partial<PageDeps> = {}): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    if (!decl) return null;
    return { register, ...(decl.state === undefined ? {} : { state: decl.state }), fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) };
  };
  return {
    pages: () => [DESK, TASK_PAGE],
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
    lists: () =>
      ['tasks', 'notes'].map((id) => {
        const r = k.register(id)!;
        return { id, done: r.done, fields: r.fields.map((f) => ({ id: f.id, type: f.type, deadline: (f as { deadline?: boolean }).deadline })) };
      }),
    activity: () => ({ events: [], seen: '2026-10-06T00:00:00.000Z' }),
    ...more,
  };
}

const read = (deps: PageDeps, slug = 'desk') => {
  const out = readPage(deps, slug);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};
const headings = (blocks: readonly BlockResult[]) => blocks.map((b) => [b.heading ?? b.kind, b.drawn !== false]);

test('EVERY BLOCK A READ ANSWERS CARRIES ITS KEY, the same on every read, and a host with no look reader reads the page as declared', async () => {
  const k = await record();
  const page = read(depsOver(k));
  assert.equal(page.look, undefined, 'no look reader, no look');
  assert.deepEqual(headings(page.blocks), [
    ['note', true],
    ['Notes', false],
    ['Coming up', true],
    ['Now', true],
  ]);
  assert.ok(page.blocks.every((b) => typeof b.key === 'string' && b.key !== ''));
  assert.equal(new Set(page.blocks.map((b) => b.key)).size, 4);
  assert.deepEqual(
    read(depsOver(k)).blocks.map((b) => b.key),
    page.blocks.map((b) => b.key),
  );
  assert.equal(page.blocks[3]!.key, defaultBlockKey(DESK.blocks[3]));
  /* AND A BLOCK READ ON ITS OWN IS NAMED AS THE PAGE NAMES IT. */
  assert.equal(readBlock(depsOver(k), DESK.blocks[3]!).key, page.blocks[3]!.key);
  assert.equal(readBlock(depsOver(k), { ...DESK.blocks[3]!, key: 'now' }).key, 'now');
});

test("A TEMPLATE'S PAGES ANSWER ONE KEY FOR ONE BLOCK, whatever each row wrote into its heading", async () => {
  const k = await record();
  const deps = depsOver(k);
  const pages = resolvePages(deps).filter((p) => p.decl.page === 'task');
  assert.equal(pages.length, 2);
  const keys = pages.map((p) => read(deps, p.slug).blocks[0]!.key);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[0], defaultBlockKey(TASK_PAGE.blocks[0]), 'keyed from the heading as written, {{what}} and all');
  assert.notEqual(read(deps, pages[0]!.slug).blocks[0]!.heading, read(deps, pages[1]!.slug).blocks[0]!.heading);
});

test('WITH NO LOOK STORED THE RULES ANSWER ONE: the late list leads, the empty one is hidden, and the late row is the next action', async () => {
  const k = await record();
  const page = read(depsOver(k, { look: () => null }));
  assert.deepEqual(headings(page.blocks), [
    ['note', true],
    ['Now', true],
    ['Notes', false],
    ['Coming up', true],
  ]);
  const now = page.blocks[1]!;
  assert.equal(page.look?.by, 'rule');
  assert.equal(page.look?.lead, now.key);
  assert.deepEqual(page.look?.hide, [page.blocks[2]!.key]);
  assert.deepEqual(page.look?.next, { row: 'tasks#1', text: 'Pay HSBC is 3 days late' });
});

test("AN OWNER'S LOOK WINS: his pinned block stays drawn and in place, and the rules fill only what he left", async () => {
  const k = await record();
  const notes = defaultBlockKey(DESK.blocks[1]);
  const page = read(depsOver(k, { look: (p) => (p === 'desk' ? { look: 'desk', basis: 'mine', by: 'owner', pinned: [notes], headline: 'My desk' } : null) }));
  /* THE LATE LIST DOES NOT LEAD PAST HIS PIN, and it still comes before what only changed, in the places his pin left. */
  assert.deepEqual(headings(page.blocks), [
    ['note', true],
    ['Notes', true],
    ['Now', true],
    ['Coming up', true],
  ]);
  assert.deepEqual([page.look?.by, page.look?.basis, page.look?.headline, page.look?.pinned, page.look?.lead], ['owner', 'mine', 'My desk', [notes], undefined]);
  assert.deepEqual(page.look?.next, { row: 'tasks#1', text: 'Pay HSBC is 3 days late' });
});

test("A STORED LOOK IS LAID AS IT IS, over the page's adds too, and a box it empties is shut", async () => {
  const k = await record();
  const added: PageAddition = { pack: 'extra', page: 'page.desk', block: { kind: 'table', source: 'register.tasks', heading: 'From the extra pack', columns: [{ field: 'what' }] } };
  const boxed: PageDecl = {
    ...DESK,
    blocks: [
      note({ lead: true, body: 'Your desk.' }),
      { kind: 'section', heading: 'Later', box: true },
      { kind: 'table', source: 'register.tasks', heading: 'Coming up', where: 'by after today', columns: [{ field: 'what' }] },
      { kind: 'section', heading: 'Today' },
      { kind: 'table', source: 'register.tasks', heading: 'Now', columns: [{ field: 'what' }] },
    ],
  };
  const addKey = defaultBlockKey(added.block);
  const coming = defaultBlockKey(boxed.blocks[2]);
  const deps = depsOver(k, {
    pages: () => [boxed],
    adds: () => [added],
    look: () => ({ look: 'desk', basis: 'b', by: 'slash', order: [addKey, defaultBlockKey(boxed.blocks[4])], hide: [coming], next: { row: 'tasks#2', text: 'Write the brief' } }),
  });
  const page = read(deps);
  assert.deepEqual(headings(page.blocks), [
    ['note', true],
    ['Later', false],
    ['Coming up', false],
    ['Today', true],
    ['From the extra pack', true],
    ['Now', true],
  ]);
  assert.equal(page.blocks[4]!.added, 'extra');
  assert.equal(page.look?.by, 'slash');
  assert.deepEqual(page.look?.next, { row: 'tasks#2', text: 'Write the brief' });
});

/* ── a look per reader ───────────────────────────────────────────────────── */

/**
 * A member's hold, as the record's `heldBlock` holds a block over a list she may not read: blanked to its written shape,
 * keyed again without its source, with the sentence that says why.
 */
const holdFrom =
  (list: string) =>
  (b: BlockResult): BlockResult => {
    if (b.source !== `register.${list}`) return b;
    const { source: _source, columns: _columns, ...kept } = b;
    return { ...kept, key: `k${b.heading === 'Now' ? 'held1' : 'held2'}`, rows: [], matched: 0, refusals: [{ code: 'FORBIDDEN', fix: 'You may not open this list.' }] };
  };

test('A MEMBER HELD FROM A LIST LEARNS NOTHING FROM THE LOOK: it reads the same whether the list holds a late row or none', async () => {
  const full = await record();
  const bare = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await bare.install([TASKS, NOTES])).ok);
  const member = { reader: { hold: holdFrom('tasks'), seen: null } };
  const late = read(depsOver(full, { look: () => null, ...member }));
  const none = read(depsOver(bare, { look: () => null, ...member }));
  assert.deepEqual(late.look, none.look, 'the lead, the order, the hide, the next and the basis');
  assert.deepEqual(headings(late.blocks), headings(none.blocks));
  assert.equal(late.look?.lead, undefined, 'a held list never leads');
  assert.equal(late.look?.next, undefined, 'and names no row of it');
  assert.ok(late.blocks.filter((b) => b.refusals.length).every((b) => b.rows.length === 0 && b.drawn !== false), 'held, shown as held, never hidden');
  /* THE OWNER IS STILL LED BY IT. */
  assert.deepEqual(read(depsOver(full, { look: () => null })).look?.next, { row: 'tasks#1', text: 'Pay HSBC is 3 days late' });
});

test("SLASH'S LOOK IS NOT LAID FOR A READER HELD FROM A BLOCK IT WAS WRITTEN OVER: the rules answer her from what she is shown", async () => {
  const k = await record();
  const now = defaultBlockKey(DESK.blocks[3]);
  const notes = defaultBlockKey(DESK.blocks[1]);
  const slash = { look: 'desk', basis: 'b', by: 'slash', lead: now, hide: [notes], next: { row: 'tasks#1', text: 'Pay HSBC' } };
  /* SHOWN THE WHOLE PAGE, SHE IS SENT SLASH'S LOOK AS IT IS. */
  const whole = read(depsOver(k, { look: () => slash, reader: { hold: (b) => b } }));
  assert.deepEqual([whole.look?.by, whole.look?.lead, whole.look?.basis], ['slash', now, 'b']);
  const member = read(depsOver(k, { look: () => slash, reader: { hold: holdFrom('tasks') } }));
  assert.equal(member.look?.by, 'rule');
  assert.equal(member.look?.lead, undefined);
  assert.equal(member.look?.next, undefined);
  assert.notEqual(member.look?.basis, 'b');
});

test("A BLOCK THE HOLD KEYS AGAIN IS NAMED BY ITS NEW KEY, the owner's pin on it too, and two held alike are parted", async () => {
  const k = await record();
  const coming = defaultBlockKey(DESK.blocks[2]);
  const now = defaultBlockKey(DESK.blocks[3]);
  /* BOTH TASKS BLOCKS HELD UNDER ONE KEY: the first keeps it, the second is parted. */
  const same = (b: BlockResult): BlockResult => (b.source === 'register.tasks' ? { ...holdFrom('tasks')(b), key: 'kheld' } : b);
  const page = read(depsOver(k, { look: () => ({ look: 'desk', basis: 'mine', by: 'owner', pinned: [now], order: [now, coming] }), reader: { hold: same } }));
  assert.deepEqual(
    page.blocks.map((b) => b.key),
    [page.blocks[0]!.key, page.blocks[1]!.key, 'kheld-2', 'kheld'],
    'Now, parted, then Coming up, in the order he set',
  );
  assert.deepEqual(page.look?.pinned, ['kheld-2'], 'his pin follows the block');
  assert.deepEqual(page.look?.order, ['kheld-2', 'kheld']);
});

test("THE READER'S OWN MARK SAYS WHAT CHANGED SINCE THEY LOOKED, not the record's", async () => {
  const k = await record();
  const changedOnly: PageDecl = {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'table', source: 'register.notes', heading: 'Notes', columns: [{ field: 'name' }] },
      { kind: 'table', source: 'register.tasks', heading: 'Later', where: 'by after 2026-10-08', columns: [{ field: 'what' }] },
    ],
  };
  assert.ok(k.create('notes', { name: 'Call the bank' }, OWNER).ok);
  const deps = (seen: string | null | undefined) =>
    depsOver(k, { pages: () => [changedOnly], look: () => null, ...(seen === undefined ? {} : { reader: { hold: (b: BlockResult) => b, seen } }) });
  /* THE RECORD'S MARK IS BEFORE THE ROWS WERE WRITTEN, so what changed leads; hers is after, so nothing did. */
  assert.equal(read(deps(undefined)).look?.lead, defaultBlockKey(changedOnly.blocks[0]));
  assert.equal(read(deps('2026-10-07T00:00:00.000Z')).look?.lead, undefined);
});

test('A BLOCK ALREADY REFUSED AND THEN HELD STILL COUNTS AS HELD: the shell answers its one sentence in place of the old', async () => {
  const k = await record();
  const now = defaultBlockKey(DESK.blocks[3]);
  const odd: PageDecl = { ...DESK, blocks: DESK.blocks.map((b, i) => (i === 3 ? ({ ...b, size: 2 } as PageBlock) : b)) };
  const slash = { look: 'desk', basis: 'b', by: 'slash', lead: now, next: { row: 'tasks#1', text: 'Pay HSBC' } };
  const shell = (b: BlockResult): BlockResult => (b.heading === 'Now' ? { ...holdFrom('tasks')(b), refusals: [{ code: 'FORBIDDEN', fix: 'You may not open this list.' }] } : b);
  assert.equal(read(depsOver(k, { pages: () => [odd] })).blocks.find((b) => b.heading === 'Now')?.refusals.length, 1, 'refused before the hold');
  const page = read(depsOver(k, { pages: () => [odd], look: () => slash, reader: { hold: shell } }));
  assert.ok(page.blocks.some((b) => b.heading === 'Now' && b.refusals.length === 1));
  assert.equal(page.look?.by, 'rule', "Slash's look, written from the whole page, is not hers");
});

test('ON A REAL PAGE THE RULES GROUP A LONG LIST OF CARDS BY ITS STATE, which the page learns from the list as declared', async () => {
  const k = await record();
  for (let i = 0; i < 14; i++) {
    const made = k.create('tasks', { what: `Thing ${i}`, by: '2026-11-01' }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    if (i % 2 === 0) assert.ok(k.update('tasks', made.value.id, { state: 'done' }, OWNER).ok);
  }
  const long: PageDecl = {
    page: 'desk',
    title: 'Desk',
    blocks: [note({ lead: true, body: 'Your desk.' }), { kind: 'cards', source: 'register.tasks', heading: 'Everything', key: 'all', limit: 40 } as PageBlock],
  };
  const page = read(depsOver(k, { pages: () => [long], look: () => null }));
  assert.deepEqual(page.look?.group, { all: 'state' });
  assert.equal(page.blocks.find((b) => b.key === 'all')?.group, 'state');
  /* AND A LOOK STORED WITH A GROUPING IS LAID THE SAME. */
  const stored = read(depsOver(k, { pages: () => [long], look: () => ({ look: 'desk', basis: 'b', by: 'slash', group: { all: 'state' } }) }));
  assert.equal(stored.blocks.find((b) => b.key === 'all')?.group, 'state');
});
