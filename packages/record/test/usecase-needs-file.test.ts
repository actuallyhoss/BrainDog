/**
 * A shared use case that says what it stands on (`needs`, USE-B08) goes in with those modules alone, and its own pages
 * cut to the lists they bring (`fitted` in `@braindog/seed`), where it used to bring every module it names. A file that
 * says no `needs` stands on all of them, as it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type PlannedPack } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const requires = { format: 1, primitives: 1, packs: {} };

/* THE TWO MODULES THE FILE NAMES, as a host with no catalogue is handed them (`planUseCase`'s `modules`). */
const PEOPLE = {
  pack: 'people',
  version: '1.0.0',
  summary: 'People.',
  author: 'BrainDog',
  license: 'MIT',
  requires,
  declarations: [{ register: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
};
const WORK = {
  pack: 'work',
  version: '1.0.0',
  summary: 'Work.',
  author: 'BrainDog',
  license: 'MIT',
  requires,
  declarations: [{ register: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
};

/** A reading club's file: it names People and Work, and its pages read both. */
const file = (needs?: string[]) => ({
  usecase: 'reading-club',
  version: '1.0.0',
  title: 'Reading club',
  summary: 'Books, meetings and who hosts them.',
  author: 'Someone',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain',
  modules: ['people', 'work'],
  ...(needs === undefined ? {} : { needs }),
  pack: {
    pack: 'usecase-reading-club',
    requires,
    declarations: [
      {
        register: 'meetings',
        name: 'Meetings',
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'host', type: 'ref', to: 'people' },
          { id: 'chore', type: 'ref', to: 'tasks' },
        ],
      },
      {
        page: 'home-reading-club',
        title: 'Home',
        requires: ['register.meetings', 'register.tasks'],
        blocks: [
          { kind: 'table', heading: 'Meetings', source: 'register.meetings', span: 12, columns: [{ field: 'what' }, { field: 'host' }, { field: 'chore' }] },
          { kind: 'table', heading: 'Chores', source: 'register.tasks', span: 12 },
        ],
      },
      { page: 'chores', title: 'Chores', nav: { section: 'Club', order: 10 }, requires: ['register.tasks'], blocks: [{ kind: 'table', source: 'register.tasks', span: 12 }] },
    ],
  },
});

type Planned = { packs: PlannedPack[] };
type Decl = { register?: string; page?: string; fields?: { id: string }[]; requires?: string[]; blocks?: { source?: string; columns?: { field: string }[] }[] };

/** Plans the file on a fresh record, then installs each planned document in order, as the app does after the press. */
async function planAndInstall(doc: unknown) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const planned = value<Planned>(await api.planUseCase({ doc, modules: { people: PEOPLE, work: WORK } }, owner));
  for (const p of planned.packs) {
    assert.deepEqual(p.unresolved, [], `${p.id} names no list the record will not hold`);
    const plan = value<{ diff: { planHash: string } }>(await api.planPack({ doc: p.doc }, owner));
    value(await api.installPack({ doc: p.doc, planHash: plan.diff.planHash, approve: p.approve }, owner));
  }
  return { planned, sql };
}

/** The lists a record holds, less the kernel's own. */
const listsIn = (sql: ReturnType<typeof openSqlite>): string[] =>
  [...new Set(sql.all<{ id: string }>("SELECT id FROM declaration WHERE kind = 'register'").map((r) => r.id))].filter((id) => id !== 'register.session').sort();

const carried = (planned: Planned) => planned.packs.find((p) => p.role === 'usecase')!.doc as { declarations: Decl[] };

test('A FILE WHOSE needs IS NARROWER THAN ITS modules INSTALLS ONLY needs, and its pages cut to what they bring', async () => {
  const { planned, sql } = await planAndInstall(file(['people']));
  assert.deepEqual(planned.packs.map((p) => p.id), ['people', 'usecase-reading-club'], 'Work is not installed');
  const decls = carried(planned).declarations;
  assert.deepEqual(decls.find((d) => d.register === 'meetings')?.fields?.map((f) => f.id), ['what', 'host'], 'the link to tasks goes, the link to people stays');
  assert.equal(decls.find((d) => d.page === 'chores'), undefined, 'a page over tasks alone goes');
  const home = decls.find((d) => d.page === 'home-reading-club')!;
  assert.deepEqual(home.requires, ['register.meetings']);
  assert.deepEqual(home.blocks?.map((b) => b.source), ['register.meetings'], 'the block over meetings stays');
  assert.deepEqual(home.blocks?.[0]?.columns?.map((c) => c.field), ['what', 'host']);
  const lists = listsIn(sql);
  assert.deepEqual(lists, ['register.meetings', 'register.people']);
  sql.close();
});

test('A FILE WITH NO needs INSTALLS EVERY MODULE IT NAMES, and its pack as it was written', async () => {
  const { planned, sql } = await planAndInstall(file());
  assert.deepEqual(planned.packs.map((p) => p.id), ['people', 'work', 'usecase-reading-club']);
  const decls = carried(planned).declarations;
  assert.deepEqual(decls.find((d) => d.register === 'meetings')?.fields?.map((f) => f.id), ['what', 'host', 'chore']);
  assert.ok(decls.some((d) => d.page === 'chores'));
  assert.deepEqual(decls.find((d) => d.page === 'home-reading-club')?.blocks?.map((b) => b.source), ['register.meetings', 'register.tasks']);
  const lists = listsIn(sql);
  assert.deepEqual(lists, ['register.meetings', 'register.people', 'register.tasks']);
  sql.close();
});
