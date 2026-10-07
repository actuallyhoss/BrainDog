/**
 * A founder's dashboards (`founder.ts`): the whole portfolio on one page and one page an organisation, read on a
 * founder record made as onboarding makes one, with every block answered and none refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const DAY = 86_400_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

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

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

async function founder(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: true }));
  return k;
}

type Series = { name: string; now: (number | null)[]; latest: { value: number } | null };
type Drawn = { kind: string; heading?: string; drawn?: boolean; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string; fix: string }[]; readings?: unknown[]; measures?: Series[]; matched?: number };
const OWNER = { actor: 'p_1' };

test('THE DASHBOARD AND AN ORGANISATION PAGE read every block, and the numbers a project sent are their rows', async () => {
  const k = await founder();
  /* PEOPLE'S LIST SINCE founder 2.0.0, which names no account (`ORGANISATIONS` in `modules/people.ts`). */
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', domain: 'harbour.example' }, OWNER));
  for (let d = 0; d < 40; d += 1)
    value(k.create('datapoints', { name: 'Sign-ups', value: 10 + d, organisation: org.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));

  const dashboard = value<{ blocks: Drawn[] }>(k.page('dashboard')).blocks;
  /* EVERY NUMBER AND ORGANISATION FOLDED UNDER A SECTION SINCE founder 1.11.0. NOT HOME AGAIN SINCE founder 1.16.0: no
     Cash now and how long it lasts, which are Home's line, no balance by organisation, which Home draws as What you have,
     and no tile a measure over the chart of the same measure. */
  assert.deepEqual(dashboard.map((b) => b.kind), ['note', 'note', 'lines', 'section', 'table', 'table']);
  for (const b of dashboard) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* THE OPENING SENTENCE IS THE ONE THE NUMBERS ANSWER: forty were reported, so it counts them, and the one for a
     month with none does not draw. */
  assert.notEqual(dashboard[0]!.drawn, false, 'the sentence that counts the numbers is drawn');
  assert.equal(dashboard[1]!.drawn, false, 'and the one for no numbers is not');
  assert.notEqual(dashboard[2]!.drawn, false, 'the chart is drawn while the sentence counts a number');
  assert.equal(dashboard[2]!.readings, undefined, 'the numbers are series, not figures');
  assert.deepEqual(dashboard[2]!.measures?.map((m) => m.name), ['Sign-ups'], 'the example datapoint is in no chart');
  assert.equal(dashboard[2]!.measures?.[0]?.now.at(-1), 10, 'today is the last day, and its reading the newest');
  assert.ok((dashboard[4]!.rows ?? []).some((r) => r.fields.source === 'example'), 'the latest numbers still list it, marked');
  assert.equal(dashboard[5]!.rows?.length, 2, 'the example organisation and Harbour Studio');
  const said = dashboard.flatMap((b) => [...((b as { cells?: { metric: string }[] }).cells ?? []).map((c) => c.metric), ...(b.heading ? [b.heading] : [])]);
  for (const home of ['cash-now', 'runway-days', 'Balance by organisation', 'Across your organisations', 'The numbers'])
    assert.ok(!said.includes(home), `the Dashboard says ${home} again`);

  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const harbour = pages.find((p) => p.title === 'Harbour Studio');
  assert.ok(harbour, 'an organisation has its own page');
  /* PEOPLE'S PAGE FOR IT SINCE founder 2.0.0, with this pack's numbers added after its people (`adds`), then its
     projects. NOT ITS MONEY YET: People is installed before Money, so its copy leaves out a block over a list the
     record does not hold yet (`placed` in `packs/first-party.ts`), until People is next updated. */
  const own = value<{ blocks: Drawn[] }>(k.page(harbour.slug)).blocks;
  assert.deepEqual(own.map((b) => b.heading), [undefined, 'People', 'Numbers, 30 days', 'Latest numbers', 'Send numbers here', 'Projects', 'Seen in', 'Notes']);
  for (const b of own) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(own[0]!.rows?.length, 1, 'its card reads its own row');
  assert.equal(own[2]!.matched, 40, 'only its own numbers, the example one left out');
  assert.equal(own[3]!.rows?.length, 10, 'its latest numbers are its own');
});

/**
 * A FOUNDER'S HOME SAYS ONLY WHAT IS TRUE OF THIS RECORD, SINCE founder 1.16.0 (DIRECTION §37): the way to bring money
 * in only while no account counts as cash, and the week's numbers over the week, six lines at most and the projects they
 * are about named beside them. NO MONEY BY ORGANISATION SINCE founder 2.0.0: the organisations are People's, which names
 * no account, and What you have, by book keeps a company's money apart.
 */
test('HOME DRAWS NO MONEY BY ORGANISATION, and the way in for money only while none is cash', async () => {
  const k = await founder();
  const home = () => value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  const drawn = (heading: string) => home().find((b) => b.heading === heading);
  assert.equal(drawn('What you have, by organisation'), undefined, 'Home still adds up an organisation\'s accounts');
  /* A NEW RECORD: the example account counts as cash. */
  assert.equal(drawn('Bring your money in')?.drawn, false, 'the way in for money is drawn beside an account that counts as cash');
  for (const b of home()) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);

  /* AND WITH NO ACCOUNT THAT COUNTS AS CASH, THE WAY IN IS THE ONE THING TO DO. */
  for (const r of value<{ rows: { seq: number | null; fields: Record<string, unknown> }[] }>(k.list({ register: 'accounts', limit: 50 })).rows)
    value(k.update('accounts', `accounts#${r.seq}`, { liquid: false }, OWNER));
  assert.notEqual(drawn('Bring your money in')?.drawn, false, 'a record with no cash is not shown the way to bring it in');
});

test('NUMBERS THIS WEEK ARE THE WEEK’S, six at most and each about its project, and the ways to start only before the first', async () => {
  const k = await founder();
  const blocks = () => value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  const week = () => blocks().find((b) => b.heading === 'Numbers this week')!;
  const start = () => blocks().find((b) => b.heading === 'Bring your numbers in')!;
  assert.equal(week().drawn, false, 'a record with no number reported draws the week');
  assert.notEqual(start().drawn, false, 'and is not shown how to start');

  /* A NUMBER REPORTED TEN DAYS AGO: the record has started, and this week holds nothing. */
  const project = value<{ id: string }>(k.create('things', { name: 'Harbour app', lane: 'building' }, OWNER));
  value(k.create('datapoints', { name: 'Installs', value: 3, thing: project.id, source: 'reported', at: new Date(NOW - 10 * DAY).toISOString() }, OWNER));
  assert.equal(week().drawn, false, 'a number from ten days ago is this week');
  assert.equal(start().drawn, false, 'a record that has reported a number is offered a start');

  for (let d = 0; d < 3; d += 1) value(k.create('datapoints', { name: 'Installs', value: 5 + d, thing: project.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));
  const drawnWeek = week();
  assert.notEqual(drawnWeek.drawn, false, 'three numbers this week draw no line');
  assert.deepEqual(drawnWeek.refusals ?? [], []);
  assert.deepEqual(drawnWeek.measures?.map((m) => m.name), ['Installs']);
  assert.equal(drawnWeek.measures?.[0]?.now.length, 7, 'the week is seven days');

  /* WHAT THE BLOCK SAYS OF ITSELF: a week, six lines at most, and the project as the fifth field. */
  const declared = (useCase('founder')!.pack?.declarations as { page?: string; blocks?: Record<string, unknown>[] }[]).find((d) => d.page === 'home-founder')!.blocks!.find((b) => b.heading === 'Numbers this week')!;
  assert.deepEqual([declared.back, declared.limit, (declared.columns as { field: string }[]).map((c) => c.field)], [7, 6, ['at', 'value', 'name', 'unit', 'thing']]);
});

test('LAPSING IS WHAT LAPSES WITHIN THIRTY DAYS OF TODAY, and not a name somebody chose to let go next year', async () => {
  const k = await founder();
  const day = (n: number) => new Date(NOW + n * DAY).toISOString().slice(0, 10);
  for (const [name, renews] of [['soon.example', day(12)], ['lapsed.example', day(-6)], ['next-year.example', day(300)], ['long-gone.example', day(-200)]] as const)
    value(k.create('services', { name, provider: 'Cove Domains', kind: 'domain', renews, cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  const lapsing = value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks.find((b) => b.heading === 'Lapsing')!;
  assert.deepEqual(lapsing.refusals ?? [], []);
  assert.deepEqual(lapsing.rows?.map((r) => r.fields.name), ['lapsed.example', 'soon.example'], 'the two within thirty days of today, the soonest first');
  const counted = k.metric(k.metricDecl('lapsing-30d')!);
  assert.ok(counted.ok, JSON.stringify(counted));
  assert.equal(counted.value.value, 2, 'what the block is drawn on counts what it lists');
});

test('A FOUNDER’S PROJECT HAS A PAGE, with Estate since founder 1.4.0: what is open, its money, the numbers it reports and where it sends them', async () => {
  const k = await founder();
  assert.ok(held(k).includes('services'), 'a founder keeps services since Estate joined Solo founder');
  const project = value<{ id: string }>(k.create('things', { name: 'Harbour app', lane: 'building' }, OWNER));
  value(k.create('datapoints', { name: 'Installs', value: 7, thing: project.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const page = pages.find((p) => p.title === 'Harbour app');
  assert.ok(page, 'a project has its own page');
  const blocks = value<{ blocks: Drawn[] }>(k.page(page.slug)).blocks;
  assert.deepEqual(blocks.map((b) => b.heading), [
    /* THE TWO OPENING SENTENCES FIRST, which carry no heading: nothing is handed back, and nothing is open, so the second
       draws. The figures beside them sit in the rail. */
    undefined,
    undefined,
    'Waiting on you',
    /* THE RAIL'S COLUMN SINCE portfolio 1.10.0: the figures, where it stands and what is handed back, one above the
       other beside the chart. */
    'At a glance',
    'Where it stands',
    'Handed back or blocked',
    /* THE TEMPLATE SINCE work 1.15.0: the chart and the plan, then one More about tile holding what changed, who
       worked on it, its notes, its money and what it runs on. What is open went in 1.10.0, the plan drawing the same
       tasks. A LINE A MEASURE, SINCE founder 1.16.0, and where to send them, before the More about tile, which would
       otherwise hold them. */
    'Done, by week',
    'The plan',
    'Numbers, 30 days',
    'Send numbers here',
    'More about Harbour app',
    'What changed',
    'Agents',
    'Notes',
    'Money by month',
    'Bills and invoices',
    'Keeping it alive',
    'Keys',
    'Tools and servers',
    'Skills',
  ]);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual((blocks.find((b) => b.heading === 'At a glance') as unknown as { cells: { label: string }[] }).cells.map((c) => c.label), ['Open', 'Owed to you', 'Costs a year'], 'with Estate present, what it costs a year takes the place the task figures held');
  assert.equal(blocks[0]!.drawn, false, 'nothing is handed back, so that sentence is not drawn');
  assert.notEqual(blocks[1]!.drawn, false, 'and nothing is open, so that one is');
  /* THE PROJECT'S NOTE, which is where an imported plan and its decisions are written, and which this example has none of. */
  /* FOUND BY HEADING, since the template's blocks move with each version and a place in the list says nothing. */
  const headed = (heading: string) => blocks.find((b) => b.heading === heading)!;
  assert.equal((headed('Notes') as unknown as { document?: boolean }).document, true);
  /* ONE READING IS STILL ITS LATEST: the record answers it on the block, a line or not. */
  const numbers = headed('Numbers, 30 days') as Drawn & { latest?: { measure: string; value: number }[] };
  assert.equal(numbers.matched, 1, 'the one number the project reported');
  assert.deepEqual(numbers.measures ?? [], [], 'a measure read once is drawn as a line of one dot');
  assert.deepEqual(numbers.latest?.map((l) => [l.measure, l.value]), [['Installs', 7]], 'the number the project reported is not its latest reading');
});
