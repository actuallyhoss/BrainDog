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

test('THE RAIL ORDER GOES OUT FOR THE PAGES AND LISTS THE FILE CARRIES, AND THE DECLARATIONS FOLLOW IT', async () => {
  const { api, sql } = await recordA();
  const out = value<Exported>(await api.exportUseCase({ nav: ['/p/reading', '/p/studies', '/r/people', '/r/courses', '/p/nowhere'] }, owner));
  assert.deepEqual(out.doc.nav, ['/p/reading', '/p/studies', '/r/courses'], 'a module list and an unknown page are not this file to order');
  const ordered = out.doc.pack.declarations.map((d) => String(d.register ?? d.page)).filter((id) => id !== 'home-study');
  assert.deepEqual(ordered, ['reading', 'studies', 'courses']);
  assert.equal(value<Exported>(await api.exportUseCase({}, owner)).doc.nav, undefined, 'no order given, none written');
  assert.equal(refusal(await api.exportUseCase({ nav: 'courses' } as never, owner)).at, 'nav');
  sql.close();
});

test('A SECOND SHARE COUNTS ON FROM THE VERSION LAST SHARED, BY A PATCH OR A MINOR', async () => {
  const { api, sql } = await recordA();
  assert.equal(value<Exported>(await api.exportUseCase({}, owner)).file, 'study-1.0.1.usecase.json');
  value(await api.setPackConfig({ id: 'usecase-study', values: { shared_version: '1.0.4' } }, owner));
  assert.equal(value<Exported>(await api.exportUseCase({}, owner)).file, 'study-1.0.5.usecase.json');
  assert.equal(value<Exported>(await api.exportUseCase({ step: 'minor' }, owner)).file, 'study-1.1.0.usecase.json');
  assert.equal(value<Exported>(await api.exportUseCase({ version: '3.0.0', step: 'minor' }, owner)).file, 'study-3.0.0.usecase.json', 'a version named wins');
  assert.equal(refusal(await api.exportUseCase({ step: 'major' } as never, owner)).code, 'ENUM_VALUE_UNKNOWN');
  sql.close();
});

test('SIGNALS AND SKILLS GO OUT WHEN TICKED, A SKILL AS ITS NAME AND TRIGGER ONLY, AND ONLY WHOLE-RECORD READERS SHARE THEM', async () => {
  const { api, sql } = await recordA();
  const SKILLS = {
    pack: 'skills-lite',
    version: '1.0.0',
    summary: 'Skills.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'skills', name: 'Skills', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'trigger', type: 'text', required: true }, { id: 'body', type: 'text' }] }],
  };
  await install(api, SKILLS);
  value(await api.create({ register: 'skills', fields: { name: 'study-planner', trigger: 'when an assignment is added', body: 'The private text of the skill.' } }, owner));
  /* A ROW CANNOT HOLD A CREDENTIAL IN THE FIRST PLACE (the kernel refuses the write); the file's own check is `declare`'s test. */
  assert.equal(refusal(await api.create({ register: 'skills', fields: { name: 'deploy', trigger: `run it with ${['sk', 'live', 'Q'.repeat(24)].join('_')}` } }, owner)).code, 'VALUE_MALFORMED');
  const out = value<Exported>(await api.exportUseCase({ signals: ['homework', 'my courses'], skills: [1] }, owner));
  assert.deepEqual(out.doc.signals, ['homework', 'my courses']);
  assert.deepEqual(out.doc.skills, [{ name: 'study-planner', trigger: 'when an assignment is added' }]);
  assert.ok(!JSON.stringify(out.doc).includes('private text'), "a skill's text went out");
  assert.equal(refusal(await api.exportUseCase({ skills: [9] }, owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(await api.exportUseCase({ skills: [1] }, { principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_owner', level: 'read' }, registers: ['courses'] } as never)).code, 'FORBIDDEN');
  sql.close();
});

test('AN ADDRESS IS READ BY THE HOST FOR AN OWNER, AND REFUSED WHERE THE HOST READS NONE OR THE ADDRESS IS PRIVATE', async () => {
  const sql = openSqlite();
  const asked: string[] = [];
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    readAddress: async (address) => {
      asked.push(address);
      return address.includes('10.0.0.1') ? { ok: false, fix: '10.0.0.1 is a private or local address, so nothing was read from it.' } : { ok: true, text: '{"usecase":"x"}', bytes: 15 };
    },
  });
  assert.deepEqual(value(await api.fetchUseCase({ url: 'https://files.example.org/study.usecase.json' }, owner)), { url: 'https://files.example.org/study.usecase.json', text: '{"usecase":"x"}', bytes: 15 });
  const privateOne = refusal(await api.fetchUseCase({ url: 'https://10.0.0.1/a.json' }, owner));
  assert.equal(privateOne.code, 'PULL_ORIGIN_REFUSED');
  assert.match(privateOne.fix, /private or local/u);
  assert.equal(refusal(await api.fetchUseCase({ url: 'https://files.example.org/a.json' }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.fetchUseCase({} as never, owner)).code, 'REQUIRED_MISSING');
  assert.equal(asked.length, 2, 'a refused caller made the host fetch');

  const bare = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.equal(refusal(await bare.fetchUseCase({ url: 'https://files.example.org/a.json' }, owner)).code, 'PULL_ORIGIN_REFUSED');
  sql.close();
});

test('A LINK BETWEEN TWO PICKED ROWS GOES OUT BY THEIR TITLES, and one to a row not picked does not', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const club = useCasePack({
    ...(normaliseUseCase({ usecase: 'club', version: '1.0.0', title: 'Club', summary: 'A reading club.', author: 'Me', license: 'MIT', audience: 'other', tone: 'plain' }) as { value: Parameters<typeof useCasePack>[0] }).value,
    pack: {
      pack: 'usecase-club',
      requires: { format: 1, primitives: 1, packs: {} },
      declarations: [
        { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'text' }] },
        { register: 'meetings', name: 'Meetings', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'book', type: 'ref', to: 'books' }, { id: 'tags', type: 'list', of: 'text' }] },
      ],
    },
  })!;
  await install(api, club);
  value(await api.create({ register: 'books', fields: { name: 'Middlemarch' } }, owner));
  value(await api.create({ register: 'books', fields: { name: 'Kept to myself' } }, owner));
  value(await api.create({ register: 'meetings', fields: { what: 'First meeting', book: 'books#1' } }, owner));
  value(await api.create({ register: 'meetings', fields: { what: 'Second meeting', book: 'books#2' } }, owner));
  const out = value<Exported>(await api.exportUseCase({ examples: { books: [1], meetings: [1, 2] } }, owner));
  assert.deepEqual(out.doc.links, [{ register: 'meetings', title: 'First meeting', field: 'book', to: 'books', target: 'Middlemarch' }]);
  const read = normaliseUseCase(out.doc);
  assert.ok(read.ok && read.value.links.length === 1, 'the file reads back with its link');
  sql.close();
});

test("A TARGET HELD TO A SETTING IS READ LIVE: a person changes it later and the figure is held to it at once", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const doc = {
    pack: 'money-lite',
    version: '1.0.0',
    summary: 'Spending, held to a sum.',
    author: 'Me',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    config: {
      most_spent: { type: 'money', label: 'Most spent', default: { amount: 10_000, currency: 'GBP' } },
      most_late: { type: 'number', label: 'Most days late', default: 3 },
    },
    declarations: [
      { register: 'spends', name: 'Spends', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }] },
      { metric: 'spent', name: 'Spent', source: 'register.spends', value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 10_000, setting: 'most_spent' }, window: '30d', compare: 'none' },
      { metric: 'count', name: 'How many', source: 'register.spends', value: { count: 'id' }, format: 'int', target: { lte: 1, setting: 'most_late' }, window: '30d', compare: 'none' },
    ],
  };
  await install(api, doc);
  value(await api.create({ register: 'spends', fields: { what: 'Rent', amount: { amount: 25_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'spends', fields: { what: 'Phone', amount: { amount: 1_000, currency: 'GBP' } } }, owner));
  type Cell = { metric: string; target?: { lte?: number }; reading: { met: boolean | null } | null };
  const cells = () => (api.kernel.block({ kind: 'stat', cells: [{ metric: 'spent' }, { metric: 'count' }] }) as { readings: Cell[] }).readings;
  assert.deepEqual(cells().map((c) => [c.target?.lte, c.reading?.met]), [[10_000, false], [3, true]], 'the defaults hold at install');

  value(await api.setPackConfig({ id: 'money-lite', values: { most_spent: { amount: 30_000, currency: 'GBP' }, most_late: 1 } }, owner));
  assert.deepEqual(cells().map((c) => [c.target?.lte, c.reading?.met]), [[30_000, true], [1, false]], 'no reinstall: the figure reads the setting now');

  /* ANOTHER CURRENCY IS NOT A SUM IN THIS FIGURE'S, so the declared target stands. */
  value(await api.setPackConfig({ id: 'money-lite', values: { most_spent: { amount: 1, currency: 'EUR' } } }, owner));
  assert.equal(cells()[0]?.target?.lte, 10_000);

  /* A TARGET HELD TO A SETTING THE PACK DOES NOT DECLARE, or one that is not a sum or a number, is refused at plan. */
  const wrong = (setting: string) => ({ ...doc, pack: 'money-wrong', declarations: [{ ...doc.declarations[1], metric: 'spent-2', target: { lte: 1, setting } }] , config: { ...doc.config, label: { type: 'text', default: 'x' } } });
  assert.equal(refusal(await api.planPack({ doc: wrong('nope') }, owner)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.planPack({ doc: wrong('label') }, owner)).code, 'VALUE_MALFORMED');
  sql.close();
});

test('A MODULE ALREADY HERE IS PLANNED IN THE USE CASE\'S WORDS WHEN ITS DOCUMENT IS SENT, and left out when that changes nothing', async () => {
  const a = await recordA();
  const text = JSON.stringify(value<Exported>(await a.api.exportUseCase({ version: '1.0.5' }, owner)).doc);
  const sql = openSqlite();
  const b = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await install(b, PEOPLE);

  /* THE SAME DOCUMENT: nothing to offer, so the module is not in the plan. */
  const same = value<Planned>(await b.planUseCase({ text, modules: { people: PEOPLE } }, owner));
  assert.deepEqual(same.packs.map((p) => p.id), ['usecase-study']);

  /* IN THIS USE CASE'S WORDS: planned as an update of what is installed, before the use case's own pack. */
  const worded = { ...PEOPLE, declarations: [{ ...PEOPLE.declarations[0], name: 'Classmates' }] };
  const offered = value<Planned>(await b.planUseCase({ text, modules: { people: worded } }, owner));
  assert.deepEqual(offered.packs.map((p) => [p.id, p.role, p.installed_version]), [['people', 'module', '1.0.0'], ['usecase-study', 'usecase', null]]);
  assert.deepEqual(offered.packs[0]?.changes, ['register.people']);
  assert.equal(offered.packs[0]?.examples, 0);
  for (const p of offered.packs) await install(b, p.doc, p.approve);
  assert.equal(JSON.parse(b.kernel.declarations().find((d) => d.id === 'register.people')!.body).name, 'Classmates');
  a.sql.close();
  sql.close();
});
