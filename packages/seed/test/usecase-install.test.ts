/**
 * A use case's record as it is made (`loop/research-spark.md` S10 and S13): the modules carry the use case's
 * example rows or none, People goes in without Projects, a relative day in an example is counted from the day
 * the record is made, and the Home a use case declares opens with every block readable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEEDS_PER_REGISTER, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { USE_CASES, modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, homePageOf, moduleDocument, moduleExamples, moduleManifest } from '../src/usecases/install.ts';
import { linkExamples, type LinkIo } from '../src/usecases/links.ts';

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

test('A MODULE EXAMPLE IS FOR A LIST OF A MODULE THE USE CASE NAMES, at most eight per list', () => {
  for (const u of USE_CASES) {
    const lists = new Set(
      u.modules.flatMap((m) => (m === 'agents' ? [] : firstPartyManifest(m as never).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice(9)))),
    );
    const registers = moduleExamples(u).map((e) => String(e.register));
    for (const r of new Set(registers)) assert.ok(registers.filter((x) => x === r).length <= SEEDS_PER_REGISTER, `${u.usecase} gives ${r} more than ${SEEDS_PER_REGISTER} examples`);
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

test('A PERSONAL RECORD HOLDS ROWS OF A PERSON: accounts, bills, spending, a budget, goals and projects, and no business words', async () => {
  const { k, sql } = await made('personal');
  const rows = everyRow(k);
  assert.ok(!rows.some((r) => STUDIO.test(JSON.stringify(r.fields))), 'a studio row reached a personal record');
  /* A CATEGORY IS AN ID (`client_work`), drawn as the person's word the use case gives it, so only the words are read. */
  assert.ok(!rows.some((r) => /client|invoice|runway|contractor/iu.test(JSON.stringify({ ...r.fields, category: null }))), 'a business word reached a personal record');
  const bills = value<{ rows: Row[] }>(k.list({ register: 'obligations', limit: 100 })).rows;
  assert.ok(bills.length > 0 && bills.every((r) => typeof r.fields.category === 'string'), 'every example bill has a category');
  const counts = Object.fromEntries(['accounts', 'obligations', 'things', 'spending', 'budgets', 'savings_goals', 'goals', 'project_steps', 'people'].map((l) => [l, k.count(l)]));
  assert.deepEqual(counts, { accounts: 3, obligations: 8, things: 3, spending: 8, budgets: 6, savings_goals: 3, goals: 4, project_steps: 7, people: 0 });
  sql.close();
});

test("A PERSON'S MONEY IS HELD TO A PERSON'S SUMS, not a studio's, and a founder's keeps Money's own", () => {
  const targetOf = (u: ReturnType<typeof useCase> | null, metric: string): unknown =>
    ((moduleDocument(u ?? null, 'money-core', { today: TODAY }) as { declarations: { metric?: string; target?: unknown }[] }).declarations.find((d) => d.metric === metric) ?? {}).target;
  assert.deepEqual(targetOf(useCase('personal'), 'out-30d'), { lte: 250_000, setting: 'most_out_30d' });
  assert.deepEqual(targetOf(useCase('personal'), 'every-month-out'), { lte: 150_000, setting: 'most_out_every_month' });
  assert.deepEqual(targetOf(useCase('founder'), 'out-30d'), { lte: 5_000_000, setting: 'most_out_30d' });
  assert.deepEqual(targetOf(null, 'out-30d'), { lte: 5_000_000, setting: 'most_out_30d' });
  /* EACH TARGET IS A SETTING A PERSON CHANGES LATER, starting at the use case's sum. */
  const configOf = (u: ReturnType<typeof useCase> | null) => (moduleDocument(u ?? null, 'money-core', { today: TODAY }) as { config: Record<string, { type: string; default: unknown }> }).config;
  assert.deepEqual(configOf(useCase('personal')).most_out_30d, { type: 'money', label: 'Most going out in 30 days', note: 'Held to this as soon as it is saved.', default: { amount: 250_000, currency: 'GBP' } });
  assert.deepEqual(configOf(useCase('personal')).most_days_late?.default, 3);
  assert.deepEqual(configOf(useCase('founder')).most_out_30d?.default, { amount: 5_000_000, currency: 'GBP' });
  /* AND ITS WORDS: the late knob is called by this figure, so a person's pay, not a business's money in. */
  const nameOf = (u: ReturnType<typeof useCase> | null, metric: string): unknown =>
    ((moduleDocument(u ?? null, 'money-core', { today: TODAY }) as { declarations: { metric?: string; name?: unknown }[] }).declarations.find((d) => d.metric === metric) ?? {}).name;
  assert.equal(nameOf(useCase('personal'), 'days-late-in'), 'Pay comes in late by');
  assert.equal(nameOf(useCase('founder'), 'days-late-in'), 'Money in arrives late by');
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
  const agentWork = value<{ blocks: Drawn[] }>(team.k.page('agent-work')).blocks;
  assert.deepEqual(agentWork.map((b) => b.kind), ['table', 'agents', 'cards', 'table']);
  for (const b of agentWork) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  team.sql.close();

  const guide = await made('guide');
  assert.equal(guide.k.count('milestones'), 6, 'the guide opens on the six milestones a project passes');
  assert.equal(guide.k.count('steps'), 3);
  const home = value<{ blocks: Drawn[] }>(guide.k.page(homePageOf('guide'))).blocks;
  /* BLOCKED APPEARS WHEN A STEP IS (`when:`), so a new guide's Home is the three that have something in them. */
  assert.deepEqual(home.filter((b) => (b as { drawn?: boolean }).drawn !== false).map((b) => b.heading), ['Where you are', 'Your next steps', 'Waiting on you']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(home[0]!.rows?.length, 1, 'one milestone is underway');
  guide.sql.close();
});

test('A PERSONAL HOME OPENS ON THE MONTH, THE BUDGET, THE BILLS OF THE WEEK, GOALS AND PROJECTS, and every page reads', async () => {
  const { k, sql } = await made('personal');
  const home = value<{ blocks: (Drawn & { kind: string })[] }>(k.page(homePageOf('personal'))).blocks;
  assert.deepEqual(home.map((b) => b.heading), ['This month', 'Spending against your budget', 'Bills due this week', 'Savings goals', 'Projects in motion', 'Habits this week', 'Goals', 'Next steps']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const cells = new Map((home[0]!.readings ?? []).map((r) => [r.metric, r.reading?.value ?? null]));
  /* THE MONTH STARTS ON ITS FIRST DAY: the record is made on 3 September, so the shop on the 1st counts and the cinema on
     31 August does not. */
  assert.equal(cells.get('spent-this-month'), 2_135 + 1_860 + 6_420);
  assert.equal(cells.get('budget-each-month'), 30_000 + 8_000 + 6_000 + 5_000 + 4_000 + 5_000);
  assert.equal(cells.get('bills-this-week'), 85_000 + 1_800 + 1_099);
  assert.equal(home[2]!.rows?.length, 3, 'rent, the phone and the streaming subscription are due this week');
  for (const slug of ['money', 'spending', 'goals', 'portfolio', 'restore-the-old-road-bike']) {
    const page = value<{ blocks: Drawn[] }>(k.page(slug)).blocks;
    for (const b of page) assert.deepEqual(b.refusals ?? [], [], `${slug}: ${b.heading} was refused`);
  }
  /* ONE PROJECTS PAGE ON THE RAIL: Projects' Overview, and no second one of the use case's own beside it. */
  const rail = (k.pages() as unknown as { slug: string; title: string; nav: { section?: string } | null }[]).filter((p) => p.nav?.section === 'Projects');
  assert.ok(rail.some((p) => p.slug === 'portfolio'), 'Projects has its Overview');
  assert.deepEqual(rail.filter((p) => p.slug !== 'portfolio' && !['restore-the-old-road-bike', 'a-collection-of-short-stories'].includes(p.slug)).map((p) => p.slug), []);
  sql.close();
});

test('A PERSONAL PROJECT IS AS FAR ALONG AS ITS STEPS ARE DONE, on the Overview, and a typed number still wins', async () => {
  const { k, sql } = await made('personal');
  const io: LinkIo = {
    rows: async (register) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner', cascade: false }).ok,
  };
  await linkExamples(io, 'personal');
  type Carded = Drawn & { heading: string; rows?: Row[]; rings?: (number | null)[] };
  const ringBy = (b: Carded) => Object.fromEntries((b.rows ?? []).map((r, i) => [String(r.fields.name ?? r.fields.next), b.rings?.[i] ?? null]));
  const inPlay = value<{ blocks: Carded[] }>(k.page('portfolio')).blocks.find((b) => b.heading === 'In play')!;
  assert.deepEqual(inPlay.refusals ?? [], []);
  const rings = ringBy(inPlay);
  assert.equal(rings['Restore the old road bike'], 50, JSON.stringify(rings));
  assert.equal(rings['A collection of short stories'], 33, JSON.stringify(rings));

  /* A NUMBER SOMEBODY TYPED IS WHAT THEY SAID, so the steps do not overrule it. */
  const bike = (k.list({ register: 'things', where: 'name is Restore the old road bike', limit: 1 }) as { value: { rows: { seq: number }[] } }).value.rows[0]!;
  value(k.update('things', `things#${bike.seq}`, { progress: 80 }, { actor: 'p_owner' }));
  const typed = ringBy(value<{ blocks: Carded[] }>(k.page('portfolio')).blocks.find((b) => b.heading === 'In play')!);
  assert.equal(typed['Restore the old road bike'], null, 'the typed 80 is drawn from the field');
  assert.equal(typed['A collection of short stories'], 33);
  sql.close();
});

test('A TEAM’S PRODUCT IN PLAY HAS A PAGE: where it stands, its tickets and its agents, with nothing over money or services', async () => {
  const { k, sql } = await made('team');
  const product = value<{ seq: number }>(k.create('things', { name: 'Mobile app', lane: 'building', health: 'at_risk', next: 'Cut the release branch' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'Review the store listing', state: 'review', thing: `things#${product.seq}` }, { actor: 'agent:claude' }));
  const page = value<{ blocks: (Drawn & { kind: string; rows?: Row[] })[] }>(k.page('mobile-app'));
  for (const b of page.blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const headings = page.blocks.map((b) => b.heading);
  assert.ok(headings.includes('Where it stands') && headings.includes('Waiting on you') && headings.includes('Agents'), headings.join(', '));
  assert.ok(!headings.includes('Money') && !headings.includes('Keeping it alive'), 'a team record holds no money or services');
  assert.deepEqual(page.blocks.find((b) => b.heading === 'Waiting on you')!.rows?.map((r) => r.fields.what), ['Review the store listing']);
  /* THE ROW OF FIGURES IS MADE UP FROM ITS TICKETS, with money left out: open, due soon, in review, done this week. */
  const glance = page.blocks.find((b) => b.heading === 'At a glance')! as unknown as { readings: { label?: string; reading: { value: number } | null }[] };
  assert.deepEqual(glance.readings.map((r) => [r.label, r.reading?.value]), [['Open', 1], ['Due soon', 0], ['In review', 1], ['Done this week', 0]]);
  sql.close();
});

test('A RUN OR A SAVING IS A ROW THAT MOVES ITS GOAL, and a habit counts only this week', async () => {
  const { k, sql } = await made('personal');
  const io: LinkIo = {
    rows: async (register) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner', cascade: false }).ok,
  };
  await linkExamples(io, 'personal');
  type Toward = Omit<Drawn, 'rows'> & { rows?: (Row & { id: string })[] };
  const blocks = value<{ blocks: Toward[] }>(k.page('goals')).blocks;
  const partsOf = (heading: string): Record<string, number | null> => {
    const b = blocks.find((x) => x.heading === heading)!;
    assert.deepEqual(b.refusals ?? [], [], heading);
    const names = new Map((b.rows ?? []).map((r) => [r.id, String(r.fields.what ?? r.fields.name)]));
    const reading = (b.readings?.[0]?.reading ?? {}) as { groups?: { key: string; value: number | null }[] };
    return Object.fromEntries((reading.groups ?? []).flatMap((g) => (names.has(g.key) ? [[names.get(g.key)!, g.value]] : [])));
  };
  assert.deepEqual(partsOf('Savings goals'), { 'Rainy day fund': 185_000, 'Trip to Lisbon': 42_000, 'New laptop': 15_000 });
  assert.deepEqual(partsOf('Goals'), { 'Run 100 km before the half marathon': 27, 'Read 12 books this year': 1 });
  /* THE RECORD IS MADE ON A THURSDAY, so Tuesday's run is this week and nothing logged before Monday counts. */
  assert.deepEqual(partsOf('Habits this week'), { 'Run three times a week': 2, 'Cook at home five nights a week': 2 });
  const later = value<{ rows: Row[] }>(k.list({ register: 'goals', limit: 10 })).rows;
  assert.ok(later.every((g) => g.fields.done === undefined || g.fields.done === null), 'nothing on a goal is typed as so far');
  sql.close();
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
  for (const id of ['student', 'founder', 'team', 'guide', 'personal']) {
    const doc = carriedDocument(useCase(id)!, TODAY) as { declarations: { page?: string; nav?: unknown }[] };
    const home = doc.declarations.find((d) => d.page === homePageOf(id));
    assert.ok(home, `${id} declares no Home`);
    assert.equal(home.nav, undefined);
  }
});

test('THE AGENTS PACK IS A MODULE ONBOARDING CAN ADD, with what it needs said and no example rows', async () => {
  const manifest = moduleManifest('agents');
  assert.ok(manifest, 'agents is a module');
  assert.deepEqual([...manifest.requires], ['register.things']);
  assert.ok(manifest.provides.includes('register.skills'));
  assert.equal(moduleManifest('usecase-team'), null);
  const { k, sql } = await record();
  await put(k, moduleDocument(useCase('team')!, 'portfolio', { today: TODAY }));
  const doc = moduleDocument(useCase('team')!, 'agents', { today: TODAY });
  assert.equal(doc?.seeds, undefined, 'the agents pack brings nobody else\'s rows');
  await put(k, doc);
  assert.equal(k.count('skills'), 0);
  sql.close();
});
