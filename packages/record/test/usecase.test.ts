/**
 * A BrainDog shared as a use case and installed on another (`loop/research-spark.md` S14): what the export carries and
 * leaves out, what a plan of the file says on a second record, that installing it is the ordinary `installPack`, and
 * that a newer version plans only what changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type CallContext, type PlannedPack } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};

const PEOPLE = {
  pack: 'people',
  version: '1.0.0',
  summary: 'People.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
};

const STUDY = useCasePack(
  (() => {
    const u = normaliseUseCase({
      usecase: 'study',
      version: '1.0.0',
      title: 'Study',
      summary: 'Courses.',
      author: 'BrainDog',
      license: 'MIT',
      audience: 'individual',
      tone: 'plain',
      modules: ['people'],
      voice: { home: 'Today', needs_you: 'Coming up' },
      labels: { courses: 'Courses' },
      pack: {
        pack: 'usecase-study',
        requires: { format: 1, primitives: 1, packs: {} },
        declarations: [
          {
            register: 'courses',
            name: 'Courses',
            title: 'name',
            fields: [
              { id: 'name', type: 'text', required: true },
              { id: 'teacher', type: 'text' },
              { id: 'tags', type: 'list', of: 'text' },
            ],
          },
          {
            page: 'home-study',
            title: 'Home',
            requires: ['register.courses'],
            blocks: [{ kind: 'table', heading: '{{config:voice_needs_you}}', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
          },
          {
            page: 'studies',
            title: 'Studies',
            nav: { section: 'Studies', order: 10 },
            requires: ['register.courses'],
            blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
          },
        ],
      },
    });
    assert.ok(u.ok);
    return u.value;
  })(),
)!;

async function install(api: Awaited<ReturnType<typeof createRecordApi>>, doc: unknown, approve: string[] = []) {
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
  return value(await api.installPack({ doc, planHash: planned.diff.planHash, approve }, owner));
}

async function recordA() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await install(api, PEOPLE);
  await install(api, STUDY);
  value(await api.setPackConfig({ id: 'usecase-study', values: { label_courses: 'Modules', voice_home: 'Desk' } }, owner));
  value(await api.setDeclaration({ body: { page: 'reading', title: 'Reading', nav: { section: 'Studies', order: 20 }, requires: ['register.courses'], blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'Nothing to read.' }] } }, owner));
  value(await api.create({ register: 'courses', fields: { name: 'Linear algebra', teacher: 'Dr Okafor' } }, owner));
  value(await api.create({ register: 'courses', fields: { name: 'Private tutoring notes', teacher: 'Me' } }, owner));
  value(await api.create({ register: 'people', fields: { name: 'My landlord' } }, owner));
  return { api, sql };
}

type Exported = { file: string; doc: Record<string, unknown> & { pack: { declarations: Record<string, unknown>[]; seeds?: unknown[] } }; bytes: number };
type Planned = { usecase: { usecase: string; version: string }; packs: PlannedPack[]; approve: string[]; enable?: string[] };

test('THE EXPORT CARRIES THE ARRANGEMENT AND NO ROW THAT WAS NOT PICKED', async () => {
  const { api, sql } = await recordA();
  const out = value<Exported>(await api.exportUseCase({ title: 'My study desk' }, owner));
  assert.equal(out.file, 'study-1.0.1.usecase.json');
  assert.deepEqual(out.doc.modules, ['people']);
  assert.deepEqual(out.doc.labels, { courses: 'Modules' });
  assert.equal((out.doc.voice as Record<string, string>).home, 'Desk');
  const ids = out.doc.pack.declarations.map((d) => String(d.register ?? d.page));
  assert.deepEqual(ids.sort(), ['courses', 'home-study', 'reading', 'studies']);
  const home = out.doc.pack.declarations.find((d) => d.page === 'home-study') as { blocks: { heading: string }[] };
  assert.equal(home.blocks[0]?.heading, '{{config:voice_needs_you}}', 'a heading the voice filled goes out as its placeholder');
  assert.equal(out.doc.pack.seeds, undefined);
  const text = JSON.stringify(out.doc);
  for (const leaked of ['Linear algebra', 'Private tutoring', 'My landlord']) assert.ok(!text.includes(leaked), `${leaked} went out unpicked`);

  const picked = value<Exported>(await api.exportUseCase({ examples: { courses: [1] } }, owner));
  assert.deepEqual(picked.doc.pack.seeds, [{ register: 'courses', fields: { name: 'Linear algebra', teacher: 'Dr Okafor' } }]);
  assert.equal(refusal(await api.exportUseCase({ examples: { people: [1] } }, owner)).at, 'examples.people');
  assert.equal(refusal(await api.exportUseCase({ examples: { courses: [9] } }, owner)).code, 'OUT_OF_BOUNDS');

  /* A TOKEN MAY SAVE THE ARRANGEMENT, as it may read it; it plans nothing. */
  assert.ok(value<Exported>(await api.exportUseCase({}, token)).doc);
  assert.equal(refusal(await api.planUseCase({ doc: out.doc }, token)).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

test('RECORD B PLANS THE FILE, INSTALLS IT THROUGH installPack, AND HOLDS WHAT A HELD; A NEWER VERSION PLANS ONLY THE DIFFERENCE', async () => {
  const a = await recordA();
  const shared = value<Exported>(await a.api.exportUseCase({ examples: { courses: [1] } }, owner));
  const text = JSON.stringify(shared.doc, null, 2);

  const sqlB = openSqlite();
  const b = await createRecordApi({ sql: sqlB, clock: fixedClock(NOW) });
  /* NO CATALOGUE HERE, as on the Worker: the module is refused by name until the app sends its document. */
  assert.equal(refusal(await b.planUseCase({ text }, owner)).code, 'DECLARATION_UNKNOWN');
  const plan = value<Planned>(await b.planUseCase({ text, modules: { people: PEOPLE } }, owner));
  assert.deepEqual(plan.packs.map((p) => [p.id, p.role, p.direction]), [['people', 'module', 'install'], ['usecase-study', 'usecase', 'install']]);
  assert.ok(plan.packs[1]?.adds.includes('page.reading'));
  assert.equal(plan.packs[1]?.examples, 1);
  assert.equal(b.kernel.packStates().length, 0, 'a plan installed something');

  for (const p of plan.packs) await install(b, p.doc, p.approve);
  const pagesOf = (api: typeof b) => api.kernel.declarations().filter((d) => d.kind !== 'register' || d.id !== 'register.people').map((d) => d.id).sort();
  assert.deepEqual(pagesOf(b), pagesOf(a.api));
  const settingsB = value<{ values: Record<string, unknown> }>(await b.packConfig({ id: 'usecase-study' }, owner));
  assert.equal(settingsB.values.label_courses, 'Modules');
  assert.equal(settingsB.values.voice_home, 'Desk');
  const courses = value<{ rows: { fields: Record<string, unknown> }[] }>(await b.list({ register: 'courses' }, owner));
  assert.deepEqual(courses.rows.map((r) => r.fields.name), ['Linear algebra']);

  /* VERSION TWO ADDS A PAGE. On B, only that page is new, and the module is already there. */
  value(await a.api.setDeclaration({ body: { page: 'terms', title: 'Terms', nav: { section: 'Studies', order: 30 }, requires: ['register.courses'], blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No terms.' }] } }, owner));
  const next = value<Exported>(await a.api.exportUseCase({ version: '1.0.2', examples: { courses: [1] } }, owner));
  const again = value<Planned>(await b.planUseCase({ doc: next.doc }, owner));
  assert.deepEqual(again.packs.map((p) => [p.id, p.direction, p.installed_version]), [['usecase-study', 'upgrade', '1.0.1']]);
  assert.deepEqual(again.packs[0]?.adds, ['page.terms']);
  assert.deepEqual(again.packs[0]?.changes, []);
  assert.deepEqual(again.packs[0]?.retires, []);
  assert.equal(again.packs[0]?.examples, 0, 'an update writes no example into a list the record already holds');
  await install(b, again.packs[0]!.doc);
  assert.equal(value<{ rows: unknown[] }>(await b.list({ register: 'courses' }, owner)).rows.length, 1);
  assert.equal(b.kernel.packStates().find((p) => p.id === 'usecase-study')?.version, '1.0.2');
  a.sql.close();
  sqlB.close();
});

test('A FILE PAST THE SIZE, A CREDENTIAL AND A KIND NOTHING DRAWS ARE EACH REFUSED WITH THEIR OWN CODE', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const base = { usecase: 'evil', version: '1.0.0', title: 'Evil', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: [] };
  const big = refusal(await api.planUseCase({ text: JSON.stringify({ ...base, summary: 'x'.repeat(300 * 1024) }) }, owner));
  assert.equal(big.code, 'PACK_OVER_CAP');
  const leaky = refusal(await api.planUseCase({ doc: { ...base, summary: `Call ${['sk', 'live', 'Q'.repeat(24)].join('_')}` } }, owner));
  assert.equal(leaky.code, 'SECRET_IN_PACK');
  const pack = { pack: 'usecase-evil', requires: { format: 1, primitives: 1, packs: {} }, declarations: [{ page: 'evil', title: 'Evil', blocks: [{ kind: 'iframe', span: 12 }] }] };
  const kind = refusal(await api.planUseCase({ doc: { ...base, pack } }, owner));
  assert.equal(kind.code, 'KIND_UNKNOWN');
  assert.equal(api.kernel.packStates().length, 0);
  sql.close();
});
