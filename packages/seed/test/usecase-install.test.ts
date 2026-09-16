/**
 * A use case's record as it is made (`loop/research-spark.md` S10 and S13): the modules carry the use case's
 * example rows or none, People goes in without Projects, a relative day in an example is counted from the day
 * the record is made, and the Home a use case declares opens with every block readable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { USE_CASES, modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, homePageOf, moduleDocument, moduleExamples } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** The lists a record holds now. */
const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/** A record made the way onboarding makes one: each module in order, People for the person, then the use case's pack. */
async function made(id: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const { k, sql } = await record();
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  const carried = carriedDocument(u, TODAY);
  if (carried) await put(k, carried);
  return { k, sql };
}

type Row = { fields: Record<string, unknown> };
const everyRow = (k: Kernel): Row[] => held(k).flatMap((r) => value<{ rows: Row[] }>(k.list({ register: r, limit: 100 })).rows);

/** The words only the sample studio's rows use. */
const STUDIO = /Kiln|Halden|Ravensworth|Okonkwo|Marchetti|Pell & Vine|Nordhaven|Variable axis|brand system|Studio current account|kiln\.example/u;

test('PEOPLE IS NOT A DEPENDENT OF PROJECTS: "Met in" is a link, left out when the record holds no projects', async () => {
  const manifest = firstPartyManifest('people');
  assert.deepEqual([...manifest.requires], []);
  assert.deepEqual([...manifest.links], ['register.things']);

  const { k, sql } = await record();
  const alone = moduleDocument(useCase('student')!, 'people', { today: TODAY, holds: ['people'] }) as { declarations: { register?: string; fields?: { id: string }[] }[] };
  await put(k, alone);
  const people = alone.declarations.find((d) => d.register === 'people');
  assert.ok(people && !people.fields?.some((f) => f.id === 'projects'), 'people points at a list the record does not hold');
  assert.equal(k.count('people'), 0, 'a use case with no example for People gets none');
  sql.close();

  const whole = firstPartyDocument('people') as { declarations: { fields?: { id: string }[] }[] };
  assert.ok(whole.declarations.some((d) => d.fields?.some((f) => f.id === 'projects')), 'with no holds given, the document is as it always was');
  const withProjects = firstPartyDocument('people', { holds: ['people', 'things'] }) as typeof whole;
  assert.deepEqual(withProjects, whole, 'a record holding projects gets the link');
});

test('WITH NO USE CASE, A MODULE CARRIES THE SAMPLE ROWS AS IT ALWAYS DID', () => {
  for (const id of ['portfolio', 'people', 'money-core', 'estate', 'work'])
    assert.deepEqual(moduleDocument(null, id, { today: TODAY }), firstPartyDocument(id), id);
});

test('A MODULE EXAMPLE IS FOR A LIST OF A MODULE THE USE CASE NAMES, one per list', () => {
  for (const u of USE_CASES) {
    const lists = new Set(
      u.modules.flatMap((m) => (m === 'agents' ? [] : firstPartyManifest(m as never).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice(9)))),
    );
    const registers = moduleExamples(u).map((e) => String(e.register));
    assert.equal(new Set(registers).size, registers.length, `${u.usecase} gives a list two examples`);
    for (const r of registers) assert.ok(lists.has(r), `${u.usecase} gives ${r} an example, and names no module that holds it`);
  }
});

test('A STUDENT RECORD HOLDS STUDENT ROWS: a course, an assignment due this week and a study session, and nothing of the studio', async () => {
  const { k, sql } = await made('student');
  assert.ok(!held(k).includes('things'), 'a student record was given Projects');
  const rows = everyRow(k);
  assert.ok(rows.length >= 3, 'the rows were read');
  assert.ok(!rows.some((r) => STUDIO.test(JSON.stringify(r.fields))), 'a studio row reached a student record');
  assert.equal(k.count('courses'), 1);
  assert.equal(k.count('study_sessions'), 1);
  const [assignment] = value<{ rows: Row[] }>(k.list({ register: 'assignments', limit: 5 })).rows;
  assert.equal(assignment?.fields.due, dayOf(NOW + 3 * 86_400_000), 'the example is due three days after the record is made');
  sql.close();
});

test('A FOUNDER RECORD HOLDS FOUNDER ROWS in every module, and nothing of the studio', async () => {
  const { k, sql } = await made('founder');
  const rows = everyRow(k);
  assert.ok(rows.length >= 3, 'the rows were read');
  assert.ok(!rows.some((r) => STUDIO.test(JSON.stringify(r.fields))), 'a studio row reached a founder record');
  for (const list of ['things', 'accounts', 'obligations', 'tracks', 'tasks', 'organisations', 'datapoints']) assert.equal(k.count(list), 1, list);
  assert.equal(k.count('people'), 0);
  sql.close();
});

type Drawn = { heading?: string; kind: string; rows?: Row[]; refusals?: unknown[]; readings?: { metric: string; reading: { value: number | null } | null; refusal?: unknown }[] };

test("A USE CASE'S HOME OPENS, every block readable, with its headings in the record's voice", async () => {
  const student = await made('student');
  const home = value<{ blocks: Drawn[] }>(student.k.page(homePageOf('usecase-student'))).blocks;
  assert.deepEqual(home.map((b) => b.heading), ['This week', 'Study sessions', 'Coming up']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(home[0]!.rows?.length, 1, 'the assignment due this week is on Home');
  assert.equal(home[1]!.rows?.length, 1, 'the study session is on Home');
  assert.equal(home[2]!.rows?.length, 0);
  student.sql.close();

  const founder = await made('founder');
  const blocks = value<{ blocks: Drawn[] }>(founder.k.page(homePageOf('founder'))).blocks;
  assert.deepEqual(blocks.map((b) => b.heading), ['The numbers', 'Latest numbers', 'Organisations']);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  for (const cell of blocks[0]!.readings ?? []) assert.ok(cell.reading && cell.reading.value !== null && !cell.refusal, `${cell.metric} cannot be worked out`);
  assert.equal(blocks[1]!.rows?.length, 1);
  founder.sql.close();
});

test('TEAM BOARD AND THE GUIDE OPEN ON THEIR OWN HOME, and the guide on its six milestones', async () => {
  const team = await made('team');
  const board = value<{ blocks: Drawn[] }>(team.k.page(homePageOf('team'))).blocks;
  assert.deepEqual(board.map((b) => b.heading), ['In flight', 'Blocked', 'Due this week']);
  for (const b of board) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(board[0]!.rows?.length, 2, 'two tickets are in flight');
  assert.equal(board[1]!.rows?.length, 1, 'one ticket is blocked');
  assert.equal(board[2]!.rows?.length, 2, 'two tickets are due this week');
  team.sql.close();

  const guide = await made('guide');
  assert.equal(guide.k.count('milestones'), 6, 'the guide opens on the six milestones a project passes');
  assert.equal(guide.k.count('steps'), 3);
  const home = value<{ blocks: Drawn[] }>(guide.k.page(homePageOf('guide'))).blocks;
  assert.deepEqual(home.map((b) => b.heading), ['Where you are', 'Your next steps', 'Waiting on you']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(home[0]!.rows?.length, 1, 'one milestone is underway');
  guide.sql.close();
});

test('THE HOUSE HOME IS A DECLARED PAGE TOO: Money declares `home`, the figures then what is due this week', async () => {
  const { k, sql } = await record();
  for (const m of ['portfolio', 'people', 'money-core'] as const) await put(k, moduleDocument(null, m, { today: TODAY }));
  const home = value<{ blocks: Drawn[] }>(k.page('home')).blocks;
  assert.deepEqual(home.map((b) => b.heading), ['Right now', 'Due this week']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual((home[0]!.readings ?? []).map((r) => r.metric), ['owed-to-you', 'due-30d', 'overdue']);
  const doc = firstPartyDocument('money-core') as { declarations: { page?: string; nav?: unknown }[] };
  assert.equal(doc.declarations.find((d) => d.page === 'home')?.nav, undefined, 'Home is not on the rail twice');
  sql.close();
});

test('HOME IS NOT ON THE RAIL: a use case declares its Home page with no nav', () => {
  for (const id of ['student', 'founder', 'team', 'guide']) {
    const doc = carriedDocument(useCase(id)!, TODAY) as { declarations: { page?: string; nav?: unknown }[] };
    const home = doc.declarations.find((d) => d.page === homePageOf(id));
    assert.ok(home, `${id} declares no Home`);
    assert.equal(home.nav, undefined);
  }
});
