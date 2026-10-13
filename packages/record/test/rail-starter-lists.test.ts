/**
 * `boot` SAYS WHICH OF TWO EMPTY ANSWERS A PAGE'S `lists` IS. A page that reads no list this caller reads arrives with
 * `[]` and is never held back. A page whose lists are all starter sets nobody has touched arrives with `null`: it
 * reads lists, and nothing in them is the person's yet, so the rail may hold its place back. Both used to arrive as
 * `[]`, and the rail could not tell a page of prose from a place still waiting for its first row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const res = r as { ok: boolean; value?: T };
  assert.ok(res.ok, JSON.stringify(r));
  return res.value as T;
};

const named = (register: string, name: string) => ({
  register,
  name,
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'tags', type: 'list', of: 'text' },
  ],
});

const table = (page: string, title: string, lists: string[]) => ({
  page,
  title,
  nav: { section: title, order: 10 },
  requires: lists.map((l) => `register.${l}`),
  blocks: lists.map((l) => ({ kind: 'table', source: `register.${l}`, span: 12, empty: 'Nothing yet.' })),
});

/* Two lists that come with a starter set (shelves, genres), one that comes empty (books), and a page of prose. */
const LIBRARY = {
  pack: 'library',
  version: '1.0.0',
  summary: 'Books, where they sit and what kind they are.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    named('books', 'Books'),
    named('shelves', 'Shelves'),
    named('genres', 'Genres'),
    table('shelves', 'Shelves', ['shelves']),
    table('sorting', 'Sorting', ['shelves', 'genres']),
    table('reading', 'Reading', ['books', 'genres']),
    table('books', 'Books', ['books']),
    { page: 'welcome', title: 'Welcome', blocks: [{ kind: 'note', body: 'Welcome.' }] },
    {
      page: 'lately',
      title: 'Lately',
      nav: { section: 'Lately', order: 20 },
      requires: ['register.genres'],
      blocks: [
        { kind: 'table', source: 'register.genres', span: 12, empty: 'Nothing yet.' },
        { kind: 'feed', source: 'activity', span: 12, empty: 'Nothing has happened yet.' },
      ],
    },
  ],
  seeds: [
    { register: 'shelves', fields: { name: 'Hall' } },
    { register: 'shelves', fields: { name: 'Study' } },
    { register: 'genres', fields: { name: 'Crime' } },
  ],
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: LIBRARY }, owner));
  value(await api.installPack({ doc: LIBRARY, planHash: planned.diff.planHash, approve: [] }, owner));
  return { api, sql, clock };
}

type Api = Awaited<ReturnType<typeof record>>['api'];

const listsOf = async (api: Api, ctx: CallContext, slug: string) => {
  const page = value<Boot>(await api.boot(ctx)).pages.find((p) => p.slug === slug);
  assert.ok(page, `boot holds no page ${slug}`);
  return page.lists;
};

test('A PAGE OVER NOTHING BUT STARTER SETS ARRIVES `null`, one list or several', async () => {
  const { api, sql } = await record();
  assert.equal(api.kernel.count('shelves'), 2, 'the starter set was not planted');
  assert.equal(await listsOf(api, owner, 'shelves'), null);
  assert.equal(await listsOf(api, owner, 'sorting'), null, 'two starter sets and nothing else');
  sql.close();
});

test('A PAGE THAT READS NO LIST ARRIVES `[]`, and so does a page over an empty list it may be judged by', async () => {
  const { api, sql } = await record();
  assert.deepEqual(await listsOf(api, owner, 'welcome'), [], 'a page of prose reads no list');
  /* An empty list nobody planted into is the person's own and is named, so its count is what holds the page back. */
  assert.deepEqual(await listsOf(api, owner, 'books'), ['books']);
  /* One list of hers beside a starter set: the starter set is dropped and the answer is not `null`. */
  assert.deepEqual(await listsOf(api, owner, 'reading'), ['books']);
  sql.close();
});

test('ONE ROW OF HER OWN, OR ONE PLANTED ROW SHE CHANGED, AND THE PAGE ARRIVES WITH THE LIST', async () => {
  const { api, sql, clock } = await record();
  assert.equal(await listsOf(api, owner, 'shelves'), null);
  value(await api.create({ register: 'shelves', fields: { name: 'Attic' } }, owner));
  assert.deepEqual(await listsOf(api, owner, 'shelves'), ['shelves']);
  assert.deepEqual(await listsOf(api, owner, 'sorting'), ['shelves'], 'one of two made hers is enough, and only it is named');

  /* A day on, as a change in the moment a row is made is folded into its making. */
  clock.advance(86_400_000);
  value(await api.update({ register: 'genres', seq: 1, patch: { name: 'Crime and mystery' } }, owner));
  assert.deepEqual(await listsOf(api, owner, 'sorting'), ['shelves', 'genres']);
  assert.deepEqual(await listsOf(api, owner, 'reading'), ['books', 'genres']);
  sql.close();
});

test('A LIST THE CALLER MAY NOT READ IS NOT A STARTER SET HELD AGAINST THE PAGE', async () => {
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_2', name: 'Cas', registers: { books: 'read' } }, owner));
  const held = api.kernel.access('p_2')!;
  const cas: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const pages = value<Boot>(await api.boot(cas)).pages;
  /* Every page Cas is handed names only Books, and none says `null`: he reads no starter set, so none is waited on. */
  for (const page of pages) assert.notEqual(page.lists, null, `${page.slug} waits on a list Cas does not read`);
  const reading = pages.find((p) => p.slug === 'reading');
  if (reading) assert.deepEqual(reading.lists, ['books']);
  sql.close();
});

test('A READ ACROSS THE WHOLE RECORD IS NO LIST, so a starter set beside one still arrives `null`', async () => {
  const { api, sql } = await record();
  assert.ok(api.kernel.pages().find((p) => p.slug === 'lately')!.registers.includes('*'), 'the feed reads the whole record');
  assert.equal(await listsOf(api, owner, 'lately'), null);
  value(await api.create({ register: 'genres', fields: { name: 'Travel' } }, owner));
  assert.deepEqual(await listsOf(api, owner, 'lately'), ['genres']);
  sql.close();
});

test('A STARTER SET BESIDE A LIST THE CALLER MAY NOT READ IS WAITED ON ALONE', async () => {
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_3', name: 'Ines', registers: { genres: 'read' } }, owner));
  const held = api.kernel.access('p_3')!;
  const ines: CallContext = { principal: { kind: 'person', id: 'p_3', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const pages = value<Boot>(await api.boot(ines)).pages;
  /* Reading draws Books and Genres. Ines reads Genres alone, and nothing in it is anybody's yet. */
  const reading = pages.find((p) => p.slug === 'reading');
  assert.ok(reading, 'Ines is handed no page over the one list she reads');
  assert.equal(reading.lists, null);
  for (const page of pages) assert.ok(page.lists === null || page.lists.every((l) => l === 'genres'), `${page.slug} names a list Ines does not read`);
  sql.close();
});
