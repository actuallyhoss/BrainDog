/**
 * A use case's record as it is made: the modules carry the use case's
 * example rows or none, People goes in without Projects, a relative day in an example is counted from the day
 * the record is made, and the Home a use case declares opens with every block readable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEEDS_PER_REGISTER, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { USE_CASES, modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, homePageOf, moduleDocument, moduleExamples, moduleManifest } from '../src/usecases/install.ts';

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
async function made(id: string, said: string | null = null): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const { k, sql } = await record();
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  const carried = carriedDocument(u, TODAY, said, { examples: true });
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
  /* AND MONEY'S LEDGER, which an organisation's page draws only where the record holds it. */
  assert.deepEqual([...manifest.links], ['register.things', 'register.transactions']);

  const { k, sql } = await record();
  const alone = moduleDocument(useCase('student')!, 'people', { today: TODAY, holds: ['people'], examples: true }) as { declarations: { register?: string; fields?: { id: string }[] }[] };
  await put(k, alone);
  const people = alone.declarations.find((d) => d.register === 'people');
  assert.ok(people && !people.fields?.some((f) => f.id === 'projects'), 'people points at a list the record does not hold');
  assert.equal(k.count('people'), 0, 'a use case with no example for People gets none');
  sql.close();

  const whole = firstPartyDocument('people') as { declarations: { fields?: { id: string }[]; page?: string; blocks?: { heading?: string }[] }[] };
  assert.ok(whole.declarations.some((d) => d.fields?.some((f) => f.id === 'projects')), 'with no holds given, the document is as it always was');
  const withProjects = firstPartyDocument('people', { holds: ['people', 'things'] }) as typeof whole;
  const lists = (doc: typeof whole) => doc.declarations.filter((d) => !('page' in d));
  assert.deepEqual(lists(withProjects), lists(whole), 'a record holding projects gets the link');
  /* AND AN ORGANISATION'S PAGE GAINS ITS PROJECTS, which the document with no holds leaves out. */
  const relation = (doc: typeof whole) => doc.declarations.find((d) => d.page === 'relation')?.blocks?.map((b) => b.heading);
  assert.ok(relation(withProjects)?.includes('Projects') && !relation(whole)?.includes('Projects'));
});

test('WITH NO USE CASE, A MODULE CARRIES THE SAMPLE ROWS AS IT ALWAYS DID', () => {
  for (const id of ['portfolio', 'people', 'money-core', 'estate', 'work'])
    assert.deepEqual(moduleDocument(null, id, { today: TODAY, examples: true }), firstPartyDocument(id), id);
});

test('A MODULE EXAMPLE IS FOR A LIST OF A MODULE THE USE CASE NAMES, at most eight per list', () => {
  for (const u of USE_CASES) {
    /* SMALL BUSINESS NAMES NO MODULE: its modules are whichever the sentence asked for, and the install plants an example
       only into a list the module it is installing holds, so its examples are read against every first-party list. */
    const modules = u.modules.length > 0 ? u.modules : (FIRST_PARTY as readonly string[]);
    const lists = new Set(
      modules.flatMap((m) => (m === 'agents' ? [] : firstPartyManifest(m as never).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice(9)))),
    );
    const registers = moduleExamples(u).map((e) => String(e.register));
    for (const r of new Set(registers)) assert.ok(registers.filter((x) => x === r).length <= SEEDS_PER_REGISTER, `${u.usecase} gives ${r} more than ${SEEDS_PER_REGISTER} examples`);
    for (const r of registers) assert.ok(lists.has(r), `${u.usecase} gives ${r} an example, and names no module that holds it`);
  }
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

test("A PERSON'S MONEY IS HELD TO A PERSON'S SUMS, not a studio's, and a founder's keeps Money's own", () => {
  const targetOf = (u: ReturnType<typeof useCase> | null, metric: string): unknown =>
    ((moduleDocument(u ?? null, 'money-core', { today: TODAY, examples: true }) as { declarations: { metric?: string; target?: unknown }[] }).declarations.find((d) => d.metric === metric) ?? {}).target;
  /* SINCE money-core 3.0.0 A SUM OF MONEY STARTS EMPTY for everybody, since neither the module nor a use case knows the
     record's currency: the figure names its setting and holds no bound until a person types one. */
  assert.deepEqual(targetOf(useCase('personal'), 'out-30d'), { setting: 'most_out_30d' });
  assert.deepEqual(targetOf(useCase('personal'), 'every-month-out'), { setting: 'most_out_every_month' });
  assert.deepEqual(targetOf(useCase('founder'), 'out-30d'), { setting: 'most_out_30d' });
  assert.deepEqual(targetOf(null, 'out-30d'), { setting: 'most_out_30d' });
  /* EACH TARGET IS A SETTING A PERSON CHANGES LATER; a number of days starts at the use case's own. */
  const configOf = (u: ReturnType<typeof useCase> | null) => (moduleDocument(u ?? null, 'money-core', { today: TODAY, examples: true }) as { config: Record<string, { type: string; default?: unknown }> }).config;
  /* IN THE PLAIN WORDS: a person is not "owed by" anybody, they have bills to pay. */
  assert.deepEqual(configOf(useCase('personal')).most_out_30d, { type: 'money', label: 'Most to pay in 30 days', note: 'Held to this as soon as it is saved.' });
  assert.deepEqual(configOf(useCase('personal')).most_days_late?.default, 3);
  assert.equal(configOf(useCase('founder')).most_out_30d?.default, undefined);
  /* AND ITS WORDS: the late knob is called by this figure, so a person's pay, not a business's money in. */
  const nameOf = (u: ReturnType<typeof useCase> | null, metric: string): unknown =>
    ((moduleDocument(u ?? null, 'money-core', { today: TODAY, examples: true }) as { declarations: { metric?: string; name?: unknown }[] }).declarations.find((d) => d.metric === metric) ?? {}).name;
  assert.equal(nameOf(useCase('personal'), 'days-late-in'), 'Pay comes in late by');
  assert.equal(nameOf(useCase('founder'), 'days-late-in'), 'Money in arrives late by');
});

type Drawn = { heading?: string; kind: string; rows?: Row[]; refusals?: unknown[]; readings?: { metric: string; reading: { value: number | null } | null; refusal?: unknown }[] };

test("A USE CASE'S HOME OPENS, every block readable, with its headings in the record's voice", async () => {
  const student = await made('student');
  const home = value<{ blocks: Drawn[] }>(student.k.page(homePageOf('usecase-student'))).blocks;
  /* THE CAPTURE FIRST, SINCE STUDENT 1.3.0, and no example row under anything. */
  /* THE LINE FIRST FROM STUDENT 1.5.0 TO 1.8.0 (3 Nov, "i dont like those briefs at all, remove them"): the capture
     opens Home again, and no line counts the work to hand in over the lists that show it. */
  assert.deepEqual(home.map((b) => b.heading), ['Add homework', 'Due this week', 'This week', 'Study done', 'Coming up']);
  assert.equal(home.some((b) => (b as { lead?: boolean }).lead === true), false, "a student's Home still opens on a line");
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(home[1]!.rows?.length ?? 0, 0, 'a new student record has nothing due');
  student.sql.close();

  const founder = await made('founder');
  const blocks = value<{ blocks: Drawn[] }>(founder.k.page(homePageOf('founder'))).blocks;
  /* WHAT IS DUE AND WHAT IS LAPSING SIT UNDER THE FIGURES SINCE FOUNDER 1.5.0 (`founder-home.test.ts`), AND HOME LEADS
     WITH WHAT YOU HAVE SINCE 1.7.0: the money there is, by book once there are two
     or by organisation, then the week's numbers, then what is due, lapsing and working now. `page.home-founder` holds
     one pair of blocks each for "what you have" and "Numbers this week", gated by `when` on how many books there are
     and whether a project has reported, so a record with one book and no report draws the first of each pair; the
     other member of each pair is read here with `drawn`, not left out, the same way the guide's Home is above. Both
     are empty on a new record: the example bill falls due in nine days, one past the week, and no example service is
     lapsing. So the row count below is found by heading, because by position it had come to read "Due this week" and
     counted nothing. */
  const drawnBlocks = blocks.filter((b) => (b as { drawn?: boolean }).drawn !== false);
  /* SINCE FOUNDER 1.11.0 THE LINE LEADS, and Due this week and Lapsing are drawn only while they hold something: on a
     new record neither does, so neither is drawn. SINCE FOUNDER 1.16.0 the way in for money waits for a record with no
     cash, and the week's numbers for one, so a new record reads its line and how to bring its numbers in. Working now
     is left out while no run is working, by the record's own look, which hides a block that drew nothing
     (`composeLook` in `packages/kernel/src/compose.ts`). */
  assert.deepEqual(drawnBlocks.map((b) => b.heading), [undefined, 'Bring your numbers in']);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const hidden = blocks.filter((b) => (b as { drawn?: boolean }).drawn === false).map((b) => b.heading);
  /* NO MONEY BY ORGANISATION SINCE FOUNDER 2.0.0: the organisations are People's, which names no account. */
  for (const heading of ['Due this week', 'Lapsing', 'Bring your money in', 'Numbers this week', 'Working now']) assert.ok(hidden.includes(heading), hidden.join(', '));
  assert.ok(!blocks.some((b) => b.heading === 'What you have, by organisation'), 'Home still adds up an organisation\'s accounts');
  founder.sql.close();
});

test('TEAM BOARD AND THE GUIDE OPEN ON THEIR OWN HOME, and the guide on its six milestones', async () => {
  const team = await made('team');
  const board = value<{ blocks: Drawn[] }>(team.k.page(homePageOf('team'))).blocks;
  /* HOW THE CYCLE IS GOING FOLDED UNDER THE REST, SINCE TEAM 2.10.0. And Gone quiet first, inside 2.21.0 (batch 88),
     declared here and drawn only while something is quiet. NO LINE OVER IT SINCE TEAM 2.31.0 (3 Nov): it counted the
     tickets the lists under it show. */
  assert.equal(board.some((b) => (b as { lead?: boolean }).lead === true), false, "the team's Home still opens on a line");
  assert.deepEqual(board.map((b) => b.heading), [
    'Gone quiet', 'Agents suggest', 'In flight', 'Blocked', 'Due this week', 'Bring the team in', 'How the sprint is going', 'This sprint', 'Open tickets, each morning',
  ]);
  for (const b of board) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const under = (heading: string) => board.find((b) => b.heading === heading)!;
  assert.equal(under('In flight').rows?.length, 2, 'two tickets are in flight');
  assert.equal(under('Blocked').rows?.length, 1, 'one ticket is blocked');
  /* ONE, AND THE SECOND OF THE TWO WAS THE BLOCKED TICKET DRAWN TWICE. Home asks the same tickets
     three questions in a row, and `Due this week` used to answer about rows `Blocked` and `In flight`
     had already drawn, so this count was the double count. */
  assert.equal(under('Due this week').rows?.length, 1, 'what is due that the two headings above have not drawn');
  const agentWork = value<{ blocks: Drawn[] }>(team.k.page('agent-work')).blocks;
  assert.deepEqual(agentWork.map((b) => b.kind), ['cards', 'table', 'agents', 'table']);
  for (const b of agentWork) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  team.sql.close();

  /* THE GUIDE CARRIES NO EXAMPLE ROWS SINCE personal-and-guide-99: its plan is formed from what the person said. */
  const guide = await made('guide', 'I want to restore an old wooden boat and sail it next summer');
  assert.equal(guide.k.count('milestones'), 6, 'the guide opens on the six milestones a project passes');
  assert.equal(guide.k.count('steps'), 3);
  const home = value<{ blocks: Drawn[] }>(guide.k.page(homePageOf('guide'))).blocks;
  /* BLOCKED APPEARS WHEN A STEP IS (`when:`), so a new guide's Home is every other block. */
  /* AND SINCE GUIDE 1.5.0 a decision is drawn only while one is asked. THE LINE LED FROM 1.5.0 TO 1.8.0 (3 Nov), and the
     path opens Home now. */
  assert.deepEqual(home.filter((b) => (b as { drawn?: boolean }).drawn !== false).map((b) => b.heading), ['Where you are', 'Next three steps', 'Waiting on you', 'Resources']);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(home[0]!.rows?.length, 6, 'the path draws the six milestones');
  guide.sql.close();
});

test('A PERSONAL HOME OPENS ON WHAT I HAVE, WHAT IS COMING UP, THE BUDGET LEFT, PROJECTS AND GOALS, and every page reads', async () => {
  const { k, sql } = await made('personal');
  const home = value<{ blocks: (Drawn & { kind: string })[] }>(k.page(homePageOf('personal'))).blocks;
  /* SINCE PERSONAL 2.2.0: the line where What I have stood, what needs you first, one list of what falls due, and what
     changed folded shut; the feed under the fold carries no heading of its own. */
  assert.deepEqual(home.map((b) => b.heading), [undefined, 'Worth a look', 'Bring your money in', 'Name something you are saving for', 'Name something you are making', 'Coming up', 'Budget left', 'My projects', 'Goals', 'Habits this week', 'Since you last looked', undefined]);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  for (const slug of ['money', 'goals', 'portfolio']) {
    const page = value<{ blocks: Drawn[] }>(k.page(slug)).blocks;
    for (const b of page) assert.deepEqual(b.refusals ?? [], [], `${slug}: ${b.heading} was refused`);
  }
  /* NO LIST OF ITS OWN FOR SPENDING OR A BUDGET SINCE PERSONAL 2.0.0: Money's ledger and categories carry both. */
  assert.ok(!held(k).includes('spending') && !held(k).includes('budgets'), 'Personal declared a list Money already holds');
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
  assert.ok(!headings.includes('Money') && !headings.includes('Services'), 'a team record holds no money or services');
  /* WHAT IS HANDED BACK IS THE WORK TILE'S WITH YOU SINCE team 2.25.0: the page declares the shape's parts,
     which the app draws from its read of the product, and its own tile of the same tasks went. */
  /* AND SINCE team 2.28.0 (the project page of 27 October) THREE BLOCKS: the hero beside its lane's tile, its numbers
     beside its work, and its dates, people, agents, what was decided and what happened. */
  assert.deepEqual(page.blocks.filter((b) => b.kind === 'project').map((b) => (b as { parts?: string[] }).parts), [['hero', 'side'], ['numbers', 'what-is-open'], ['dates', 'who-is-on-it', 'runs-on', 'agents-here', 'decisions', 'happened']]);
  assert.ok(!headings.includes('Handed back or blocked'), 'what is handed back is said twice');
  const held = k.list({ register: 'tasks', where: `thing is things#${product.seq}, state is review or blocked` } as never);
  assert.ok(held.ok);
  assert.deepEqual(held.value.rows.map((r) => r.fields.what), ['Review the store listing'], 'the Work tile has the task to say');
  /* THE ROW OF FIGURES IS MADE UP FROM ITS TICKETS, with money left out: open, due soon, in review, done this week. */
  const glance = page.blocks.find((b) => b.heading === 'At a glance')! as unknown as { readings: { label?: string; reading: { value: number } | null }[] };
  assert.deepEqual(glance.readings.map((r) => [r.label, r.reading?.value]), [['Open', 1], ['Due soon', 0], ['In review', 1], ['Done this week', 0]]);
  sql.close();
});


test('HOME IS NOT ON THE RAIL: a use case declares its Home page with no nav', () => {
  for (const id of ['student', 'founder', 'team', 'guide', 'personal']) {
    const doc = carriedDocument(useCase(id)!, TODAY, null, { examples: true }) as { declarations: { page?: string; nav?: unknown }[] };
    const home = doc.declarations.find((d) => d.page === homePageOf(id));
    assert.ok(home, `${id} declares no Home`);
    assert.equal(home.nav, undefined);
  }
});

test('THE AGENTS PACK IS A MODULE ONBOARDING CAN ADD, with what it needs said and no example rows', async () => {
  const manifest = moduleManifest('agents');
  assert.ok(manifest, 'agents is a module');
  /* PROJECTS IS NOT NEEDED SINCE Agents 1.32.0 (31f31f175): where it is held, a skill links to it. `agents-pack.test.ts` holds the link. */
  assert.deepEqual([...manifest.requires], []);
  assert.ok(manifest.provides.includes('register.skills'));
  assert.equal(moduleManifest('usecase-team'), null);
  const { k, sql } = await record();
  await put(k, moduleDocument(useCase('team')!, 'portfolio', { today: TODAY, examples: true }));
  const doc = moduleDocument(useCase('team')!, 'agents', { today: TODAY, examples: true });
  assert.equal(doc?.seeds, undefined, 'the agents pack brings nobody else\'s rows');
  await put(k, doc);
  assert.equal(k.count('skills'), 0);
  sql.close();
});
