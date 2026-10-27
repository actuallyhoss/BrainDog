/**
 * Every list a page reads, said by the record on `boot` (`pages[].lists`), so the rail can hold a place back until one
 * of them has something in it. `list` beside it is unchanged: the one list a page draws, or `null`.
 *
 * `lists` leaves out three things. A read across the whole record (`*`), which is no list. A list this caller may not
 * read, whose id she is never handed. And a list that holds only what an add-on planted and nobody has touched, such
 * as a starter set of categories, so planted rows never count as the person's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';
import { STARTER_CATEGORIES } from '../../seed/src/modules/money/lists/categories.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const named = (register: string, name: string, more: unknown[] = []) => ({
  register,
  name,
  title: 'name',
  fields: [{ id: 'name', type: 'text', required: true }, ...more],
});

/** Three lists and four pages. Topics arrives with a starter set, as Money's categories do. */
const STUDY = {
  pack: 'study',
  version: '1.0.0',
  summary: 'Courses, marks and topics.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    named('courses', 'Courses'),
    named('marks', 'Marks'),
    named('topics', 'Topics', [{ id: 'tags', type: 'list', of: 'text' }]),
    {
      page: 'study',
      title: 'Study',
      nav: { section: 'Study', order: 10 },
      requires: ['register.courses', 'register.marks', 'register.topics'],
      blocks: [
        { kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' },
        { kind: 'table', source: 'register.marks', span: 6, empty: 'No marks yet.' },
        { kind: 'table', source: 'register.topics', span: 6, empty: 'No topics yet.' },
        { kind: 'feed', source: 'activity', span: 12, empty: 'Nothing has happened yet.' },
      ],
    },
    {
      page: 'courses',
      title: 'Courses',
      nav: { section: 'Courses', order: 20 },
      requires: ['register.courses'],
      blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
    },
    {
      page: 'topics',
      title: 'Topics',
      nav: { section: 'Topics', order: 30 },
      requires: ['register.topics'],
      blocks: [{ kind: 'table', source: 'register.topics', span: 12, empty: 'No topics yet.' }],
    },
    { page: 'welcome', title: 'Welcome', blocks: [{ kind: 'note', body: 'Welcome.' }] },
  ],
  seeds: [
    { register: 'topics', fields: { name: 'Reading' } },
    { register: 'topics', fields: { name: 'Revision' } },
  ],
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: STUDY }, owner));
  value(await api.installPack({ doc: STUDY, planHash: planned.diff.planHash, approve: [] }, owner));
  return { api, sql, clock };
}

type Api = Awaited<ReturnType<typeof record>>['api'];

const pageOf = async (api: Api, ctx: CallContext, slug: string) => {
  const page = value<Boot>(await api.boot(ctx)).pages.find((p) => p.slug === slug);
  assert.ok(page, `boot holds no page ${slug}`);
  return page;
};

test('A PAGE CARRIES EVERY LIST IT READS, and `list` says what it always said', async () => {
  const { api, sql } = await record();
  /* What the kernel names for the page, which is where `lists` is read from: three lists and the whole record. */
  const read = api.kernel.pages().find((p) => p.slug === 'study')!.registers;
  assert.deepEqual([...read].sort(), ['*', 'courses', 'marks', 'topics']);
  assert.equal(api.kernel.count('topics'), 2, 'the starter set was not planted');

  const study = await pageOf(api, owner, 'study');
  assert.deepEqual(study.lists, ['courses', 'marks'], 'the whole record or a planted list was named');
  assert.equal(study.list, null, 'a page that reads several lists names no one list');

  const courses = await pageOf(api, owner, 'courses');
  assert.equal(courses.list, 'courses');
  assert.deepEqual(courses.lists, ['courses']);

  assert.deepEqual((await pageOf(api, owner, 'welcome')).lists, [], 'a page of prose reads no list');
  sql.close();
});

test('A LIST THE CALLER MAY NOT READ IS LEFT OUT', async () => {
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_2', name: 'Cas', registers: { courses: 'read' } }, owner));
  const held = api.kernel.access('p_2')!;
  const cas: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.deepEqual((await pageOf(api, cas, 'study')).lists, ['courses']);
  sql.close();
});

test('A PLANTED LIST IS LEFT OUT UNTIL SOMEBODY MAKES IT THEIRS', async () => {
  const { api, sql } = await record();
  /* `list` is the one list a page draws, planted or not, since a saved view sits under it. `lists` is what counts. */
  const before = await pageOf(api, owner, 'topics');
  assert.equal(before.list, 'topics');
  assert.equal(before.lists, null, 'two planted topics counted as hers');

  value(await api.create({ register: 'topics', fields: { name: 'Lab reports' } }, owner));
  assert.deepEqual((await pageOf(api, owner, 'topics')).lists, ['topics']);
  assert.deepEqual((await pageOf(api, owner, 'study')).lists, ['courses', 'marks', 'topics']);
  sql.close();
});

test('AND A PLANTED ROW SOMEBODY CHANGED IS THEIRS', async () => {
  const { api, sql, clock } = await record();
  /* A day on: a change in the moment a row is made is folded into its making, and nobody renames a topic that fast. */
  /* Asked once before the change too: the planted count is kept between writes, and the change has to move it. */
  assert.equal((await pageOf(api, owner, 'topics')).lists, null);
  clock.advance(86_400_000);
  value(await api.update({ register: 'topics', seq: 1, patch: { name: 'Set reading' } }, owner));
  assert.deepEqual((await pageOf(api, owner, 'topics')).lists, ['topics']);
  sql.close();
});

test('AND SO IS THE STARTER SET MONEY SHIPS, on its own list, which declares no tags of its own', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  /* THE LIST ALONE, out of Money's document, with a page over it: the rest of Money needs lists other add-ons bring. */
  const money = firstPartyDocument('money-core', { seeds: [] }) as { declarations: { register?: string }[] };
  const doc = {
    ...STUDY,
    pack: 'what-for',
    summary: 'What money is for.',
    declarations: [
      ...money.declarations.filter((d) => d.register === 'categories'),
      { page: 'what-for', title: 'What for', nav: { section: 'What for', order: 10 }, requires: ['register.categories'], blocks: [{ kind: 'table', source: 'register.categories', span: 12, empty: 'Nothing yet.' }] },
    ],
    seeds: STARTER_CATEGORIES.map((fields) => ({ register: 'categories', fields: { ...fields } })),
  };
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
  value(await api.installPack({ doc, planHash: planned.diff.planHash, approve: [] }, owner));
  assert.equal(api.kernel.count('categories'), STARTER_CATEGORIES.length, 'the starter set was not planted');

  const before = await pageOf(api, owner, 'what-for');
  assert.equal(before.list, 'categories');
  assert.equal(before.lists, null, 'the starter set counted as hers');

  value(await api.create({ register: 'categories', fields: { name: 'Childcare', direction: 'out', state: 'live' } }, owner));
  assert.deepEqual((await pageOf(api, owner, 'what-for')).lists, ['categories']);
  sql.close();
});
