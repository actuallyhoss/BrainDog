/**
 * The record's sources for the page reader: `lists`, one row a list the reader may read with the count
 * its own `list` read answers, and `pages`, one row a page off the census. Over a real kernel on a fresh record; the
 * record's guard is stood in for by one that refuses as it does, a caller held to some lists reading only those.
 * Invented lists and names throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { HOST_SOURCES, hostSourcesOf, type HostSource } from '../src/sources/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['projects'] };

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const DECLS = [
  decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('register', 'contacts', { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('page', 'desk', {
    page: 'desk',
    title: 'Desk',
    requires: ['register.projects'],
    blocks: [{ kind: 'table', heading: 'Projects', source: 'register.projects' }],
  }),
  decl('page', 'about', { page: 'about', title: 'About', blocks: [{ kind: 'note', body: 'Plain words.' }] }),
];

const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'register' });
const readable = (ctx: CallContext, list: string): Refusal | null =>
  ctx.registers === undefined || ctx.registers === '*' || (ctx.registers as readonly string[]).includes(list) ? null : refuse('Not one of yours.');

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  for (const name of PROJECTS) assert.ok(api.kernel.create('projects', { name }, { actor: 'p_1' }).ok);
  const gone = api.kernel.create('contacts', { name: PEOPLE[0]!.name }, { actor: 'p_1' });
  assert.ok(gone.ok);
  for (const p of PEOPLE.slice(1, 4)) assert.ok(api.kernel.create('contacts', { name: p.name }, { actor: 'p_1' }).ok);
  /* A DELETED ROW IS NEVER COUNTED. */
  assert.ok(api.kernel.update('contacts', gone.value.id, { deleted_at: new Date(NOW).toISOString() }, { actor: 'p_1' }).ok);
  return api;
}

const source = (api: Awaited<ReturnType<typeof record>>, ctx: CallContext, name: string): HostSource => {
  const got = hostSourcesOf({ kernel: api.kernel, ctx, readable })(name);
  assert.ok(got, `${name} is not a source`);
  return got;
};
const rowsOf = (s: HostSource, q: Parameters<HostSource['rows']>[0] = {}) => {
  const got = s.rows(q);
  assert.ok(got.ok, JSON.stringify(got));
  return got.value.rows;
};

test('`lists` ANSWERS EACH LIST WITH THE COUNT ITS OWN READ ANSWERS, by its name, and its newest change', async () => {
  const api = await record();
  const rows = rowsOf(source(api, owner, 'lists'));
  const mine = rows.filter((r) => r.fields.list === 'projects' || r.fields.list === 'contacts');
  assert.deepEqual(
    mine.map((r) => [r.fields.list, r.fields.name, r.fields.count]),
    [
      ['projects', 'Projects', PROJECTS.length],
      ['contacts', 'Contacts', 3],
    ],
  );
  for (const r of rows) {
    const own = await api.list({ register: String(r.fields.list), limit: 1 }, owner);
    assert.ok(own.ok, JSON.stringify(own));
    assert.equal(r.fields.count, own.value.matched, `${String(r.fields.list)} counted ${String(r.fields.count)}, its read ${own.value.matched}`);
  }
  assert.equal(mine[0]!.fields.changed, new Date(NOW).toISOString());
  /* NAMES, NEVER IDS: the row's own id is the list's handle, and the name is what a person reads. */
  assert.ok(mine.every((r) => typeof r.fields.name === 'string' && r.seq === null));
});

test('`lists` IS READ AS A LIST IS: where, order and limit', async () => {
  const api = await record();
  const s = source(api, owner, 'lists');
  const big = rowsOf(s, { where: { field: 'count', gt: 3 }, order: [{ field: 'count', dir: 'desc' }], limit: 1 });
  assert.deepEqual(big.map((r) => r.fields.list), ['projects']);
  const paged = s.rows({ order: [{ field: 'list' }], limit: 1 });
  assert.ok(paged.ok && typeof paged.value.next === 'string');
});

test('A MEMBER HELD FROM A LIST DOES NOT SEE IT IN `lists`', async () => {
  const api = await record();
  const rows = rowsOf(source(api, member, 'lists'));
  assert.deepEqual(
    rows.map((r) => r.fields.list),
    ['projects'],
  );
});

test('`pages` ANSWERS ONE ROW A PAGE, off the census, and reads across the whole record', async () => {
  const api = await record();
  const s = source(api, owner, 'pages');
  assert.equal(s.whole, true);
  const rows = rowsOf(s, { limit: 500 });
  const slugs = api.kernel.pages().map((p) => p.slug);
  assert.deepEqual(rows.map((r) => r.fields.slug).sort(), [...slugs].sort());
  const desk = rows.find((r) => r.fields.slug === 'desk')!;
  assert.deepEqual(
    { title: desk.fields.title, blocks: desk.fields.blocks, drawn: desk.fields.drawn, refused: desk.fields.refused },
    { title: 'Desk', blocks: 1, drawn: 1, refused: 0 },
  );
});

test('A NAME THE RECORD HOLDS NO SOURCE FOR IS NOTHING, and the table is not read by bracket', async () => {
  const api = await record();
  const find = hostSourcesOf({ kernel: api.kernel, ctx: owner, readable });
  assert.equal(find('constructor'), undefined);
  assert.equal(find('activity'), undefined);
  assert.deepEqual(Object.keys(HOST_SOURCES), ['lists', 'pages']);
});

/* THE WIRING (integrate-102): the record hands its sources to every page read made for a caller, and the install knows
   their names, so a page over `lists` installs first try and draws, and one over `pages` is held from a member. */
test('A PAGE OVER `lists` INSTALLS AND DRAWS THROUGH `page`, and one over `pages` is held from a member', async () => {
  const api = await record();
  const put = await api.kernel.install([
    decl('page', 'all-lists', { page: 'all-lists', title: 'All lists', blocks: [{ kind: 'table', heading: 'Lists', source: 'lists' }] }),
    decl('page', 'all-pages', { page: 'all-pages', title: 'All pages', blocks: [{ kind: 'table', heading: 'Pages', source: 'pages' }] }),
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  const lists = await api.page({ slug: 'all-lists' }, owner);
  assert.ok(lists.ok, JSON.stringify(lists));
  const block = (lists.value as { blocks: { refusals: unknown[]; rows: unknown[] }[] }).blocks[0]!;
  assert.deepEqual(block.refusals, []);
  assert.ok(block.rows.length >= 2, JSON.stringify(block));
  const pages = await api.page({ slug: 'all-pages' }, { ...member, registers: ['projects'] });
  const held = pages.ok ? (pages.value as { blocks: { refusals: { code: string }[] }[] }).blocks[0]?.refusals ?? [] : [];
  assert.ok(!pages.ok || held.some((r) => r.code === 'FORBIDDEN'), JSON.stringify(pages));
});
