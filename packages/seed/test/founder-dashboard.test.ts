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
  for (const m of modulesFor(u, ['people', ...u.modules])) {
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
  /* TWO CHARTS AND NEVER BOTH SINCE founder 3.4.0 (Z20 of 25 October): one headed thirty days while the newest number
     is from this week, and one headed with how long ago it came in once it is not. */
  /* AND WHAT WENT QUIET WITH THE WAY TO FIX THE FEED SINCE founder 3.8.0 (Q51 of 29 October), drawn only while no number
     came in thirty days, so not here. */
  /* AND THE WAY TO A FIRST PROJECT AND ITS FIRST NUMBER, EACH DRAWN ONLY WHILE NONE IS THERE, SINCE founder 3.8.0 (1fdbdf110). */
  assert.deepEqual(dashboard.map((b) => b.kind), ['note', 'capture', 'note', 'link', 'note', 'table', 'link', 'lines', 'lines', 'section', 'table', 'table']);
  assert.deepEqual([dashboard[1]!.drawn, dashboard[3]!.drawn], [false, false], 'the way to a first number is said while numbers came');
  assert.deepEqual([dashboard[5]!.drawn, dashboard[6]!.drawn], [false, false], 'what went quiet is said while numbers came');
  assert.equal(dashboard[8]!.drawn, false, 'a number from today is headed with how long ago the last one came in');
  for (const b of dashboard) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* NO OPENING SENTENCE WHILE NUMBERS COME, SINCE founder 3.10.0 (62fb09138): the chart counts them, and the lines for no numbers do not draw. */
  for (const at of [0, 2, 4]) assert.equal(dashboard[at]!.drawn, false, `line ${at} for no numbers is drawn`);
  assert.notEqual(dashboard[7]!.drawn, false, 'the chart is drawn while a number came');
  assert.equal(dashboard[7]!.readings, undefined, 'the numbers are series, not figures');
  assert.deepEqual(dashboard[7]!.measures?.map((m) => m.name), ['Sign-ups'], 'the example datapoint is in no chart');
  assert.equal(dashboard[7]!.measures?.[0]?.now.at(-1), 10, 'today is the last day, and its reading the newest');
  assert.ok((dashboard[10]!.rows ?? []).some((r) => r.fields.source === 'example'), 'the latest numbers still list it, marked');
  assert.equal(dashboard[11]!.rows?.length, 2, 'the example organisation and Harbour Studio');
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
  assert.deepEqual(own.map((b) => b.heading), [undefined, 'People', 'Numbers, 30 days', 'Latest numbers', 'Send numbers here', 'Projects', 'Seen in', 'Notes', 'Where it was seen']);
  for (const b of own) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(own[0]!.rows?.length, 1, 'its card reads its own row');
  assert.equal(own[2]!.matched, 40, 'only its own numbers, the example one left out');
  assert.equal(own[3]!.rows?.length, 10, 'its latest numbers are its own');
});

/* Every number on the record was a four-week-old import, drawn under "Numbers, 30 days"
   with a sentence over it counting the last thirty days. Past a week the chart's heading says how long ago the newest
   came in. */
test('NUMBERS FOUR WEEKS OLD ARE HEADED WITH HOW LONG AGO THE LAST ONE CAME IN, not thirty days', async () => {
  const k = await founder();
  const org = value<{ id: string }>(k.create('organisations', { name: 'Saltmarsh Works', kind: 'company', domain: 'saltmarsh.example' }, OWNER));
  for (const d of [28, 27])
    value(k.create('datapoints', { name: 'Sign-ups', value: 10 + d, organisation: org.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));
  const charts = value<{ blocks: (Drawn & { values?: Record<string, unknown> })[] }>(k.page('dashboard')).blocks.filter((b) => b.kind === 'lines');
  assert.deepEqual(
    charts.map((b) => [b.heading, b.drawn !== false]),
    [
      ['Numbers, 30 days', false],
      ['Numbers, last reported {{datapoints-age}} days ago', true],
    ],
    'a month-old import was still headed thirty days',
  );
  assert.equal(charts[1]!.values?.['datapoints-age'], 27, 'the heading says another age than the newest number has');
  for (const b of charts) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
});

/* Y16 AND Y2. The Dashboard counted 52 kinds of number (twelve charts and forty listed) where
   Numbers counted 42 (two charts and forty listed), so the two pages said different counts of the same readings. Both
   draw two charts and list the rest now. And People's list leaves out a shop put away (`retired_on`) and the Dashboard's
   Organisations table still listed it. */
test('THE DASHBOARD DRAWS TWO CHARTS AND LISTS THE REST AS NUMBERS DOES, and leaves out a retired organisation', async () => {
  const k = await founder();
  const kept = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', domain: 'harbour.example' }, OWNER));
  value(k.create('organisations', { name: 'Chillout Elo', kind: 'company', retired_on: dayOf(NOW - DAY) }, OWNER));
  for (let m = 0; m < 6; m += 1)
    for (const d of [0, 1])
      value(k.create('datapoints', { name: `Measure ${m + 1}`, value: m + d, organisation: kept.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));
  const blocks = value<{ blocks: (Drawn & { latest?: unknown[] })[] }>(k.page('dashboard')).blocks;
  const chart = blocks.find((b) => b.kind === 'lines' && b.drawn !== false)!;
  assert.equal(chart.measures?.length, 2, 'two charts, as Numbers draws');
  assert.equal(chart.latest?.length, 4, 'the other four are listed beside them');
  const orgs = blocks.find((b) => b.heading === 'Organisations')!;
  const names = (orgs.rows ?? []).map((r) => r.fields.name);
  assert.ok(names.includes('Harbour Studio'), 'a kept organisation is listed');
  assert.ok(!names.includes('Chillout Elo'), 'a retired one is not');
});

/**
 * A FOUNDER'S HOME SAYS ONLY WHAT IS TRUE OF THIS RECORD, SINCE founder 1.16.0: the way to bring money
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

  /* WHAT THE BLOCK SAYS OF ITSELF: a week, six lines at most, the reading as money fifth (founder 2.5.0) and the project
     after it. */
  const declared = (useCase('founder')!.pack?.declarations as { page?: string; blocks?: Record<string, unknown>[] }[]).find((d) => d.page === 'home-founder')!.blocks!.find((b) => b.heading === 'Numbers this week')!;
  assert.deepEqual([declared.back, declared.limit, (declared.columns as { field: string }[]).map((c) => c.field)], [7, 6, ['at', 'value', 'name', 'unit', 'amount', 'thing']]);
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

test('SERVICES NAMES WHAT IS LAPSING, where it said only how many', async () => {
  const k = await founder();
  const day = (n: number) => new Date(NOW + n * DAY).toISOString().slice(0, 10);
  const blocksNow = () => value<{ blocks: Drawn[] }>(k.page('estate')).blocks;
  value(k.create('services', { name: 'kept.example', provider: 'Cove Domains', kind: 'domain', renews: day(40), cycle: 'yearly', state: 'live' }, OWNER));
  assert.equal(blocksNow().find((b) => b.heading === 'Lapsing')?.drawn, false, 'a Lapsing tile is drawn over nothing lapsing');
  for (const [name, renews] of [['lapsed.example', day(-6)], ['long-gone.example', day(-40)]] as const)
    value(k.create('services', { name, provider: 'Cove Domains', kind: 'domain', renews, cycle: 'yearly', state: 'lapsing' }, OWNER));
  const lapsing = blocksNow().find((b) => b.heading === 'Lapsing')!;
  assert.deepEqual(lapsing.refusals ?? [], []);
  assert.deepEqual(lapsing.rows?.map((r) => r.fields.name), ['long-gone.example', 'lapsed.example'], 'each lapsing one by name, the longest gone first');
  assert.equal(blocksNow().some((b) => b.heading === 'At a glance'), false, 'the count with no names is still drawn');
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
    /* THE PROJECT'S SHAPE FIRST, SINCE founder 3.3.0: the hero with Path and Money, then Work and Who is on
       it with Runs on and the agents on it, two blocks the app draws from its read of the project. */
    'Overview',
    /* AND SINCE founder 3.7.0 (the project page of 27 October) THREE BLOCKS OF ITS PARTS: the hero beside its lane's
       tile, its numbers beside its work, and its dates, who is on it, what it runs on, the agents, what was decided and
       what happened, laid in rows as they fit. */
    'Numbers and work',
    'Dates, people, agents and what happened',
    /* THE OPENING SENTENCE, which carries no heading: one note since portfolio 1.23.0, its second sentence said
       while nothing is handed back. The figures beside it sit in the rail. */
    undefined,
    'Waiting on you',
    /* THE RAIL'S COLUMN SINCE portfolio 1.10.0: the figures, where it stands and what is handed back, one above the
       other beside the chart. */
    'At a glance',
    /* TWICE SINCE portfolio 1.16.0: the typed card while somebody has said where it stands, else its own figures.
       NO HANDED BACK OR BLOCKED SINCE founder 3.3.0: the Work tile's With you says it. */
    'Where it stands',
    'Where it stands',
    /* ITS ROAD, SINCE portfolio 1.23.0: its stages in the rail, drawn only when it has any. */
    'The road',
    /* THE TEMPLATE SINCE work 1.15.0: the plan, then one More about tile holding what changed, who worked on it, its
       notes, its money and what it runs on. What is open went in 1.10.0, the plan drawing the same tasks, and Done, by
       week in founder 2.3.0, a chart of ones and twos: what was finished this week is At a glance's last figure. A
       LINE A MEASURE, SINCE founder 1.16.0, and where to send them, before the More about tile, which would otherwise
       hold them. */
    /* SINCE founder 3.7.0 THE PLAN AND THE KEY NUMBERS ARE UNDER MORE ABOUT, one press away: the tile beside the hero
       draws the dated path and the Numbers part the numbers. The Numbers lines and What changed went for those parts. */
    'More about Harbour app',
    'The plan',
    'Key numbers',
    'Agents',
    /* NO MONEY BY MONTH SINCE founder 3.3.0: the Money tile's bars say it. */
    'Notes',
    'Bills and invoices',
    'Services',
    /* SINCE founder 2.6.0's last step: what it runs on has a heading of its own, with what reaches it from everywhere. */
    'Runs on',
    'Keys',
    'Tools and servers',
    'Skills',
    'And from everywhere',
    /* WHERE ITS NUMBERS ARE SENT, FOLDED LAST SINCE founder 3.7.0, the Numbers feed's row under Runs on saying whether it is quiet. */
    'Send numbers here',
  ]);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual((blocks.find((b) => b.heading === 'At a glance') as unknown as { cells: { label: string }[] }).cells.map((c) => c.label), ['Open', 'Still to come in', 'Costs a year', 'Done this week'], 'with Estate present, what it costs a year takes the place the task figures held');
  /* ONE NOTE SINCE portfolio 1.23.0: nothing is handed back, so it says its second sentence and not the first. */
  const opening = blocks.find((b) => b.kind === 'note' && (b as { lead?: unknown }).lead === true)!;
  assert.notEqual(opening.drawn, false, 'the opening note is drawn');
  assert.doesNotMatch(String((opening as { body?: unknown }).body ?? ''), /handed back/u, 'nothing is handed back, so that sentence is not said');
  /* THE PROJECT'S NOTE, which is where an imported plan and its decisions are written, and which this example has none of. */
  /* FOUND BY HEADING, since the template's blocks move with each version and a place in the list says nothing. */
  const headed = (heading: string) => blocks.find((b) => b.heading === heading)!;
  assert.equal((headed('Notes') as unknown as { document?: boolean }).document, true);
  /* THE ONE READING IS COUNTED THIS WEEK, where nobody has said where it stands, and the Numbers part draws it beside the
     work (the record answers it with the page's shape, `project-shape.ts`). */
  const stands = blocks.find((b) => b.heading === 'Where it stands' && (b as { key?: unknown }).key === 'stands-figures') as unknown as { readings?: { label?: string; reading: { value: unknown } | null }[] };
  assert.equal(stands.readings?.find((r) => r.label === 'Numbers this week')?.reading?.value, 1, 'the one number the project reported this week');
  const rows = blocks.filter((b) => b.kind === 'project').map((b) => (b as unknown as { parts: string[] }).parts);
  assert.deepEqual(rows, [['hero', 'side'], ['numbers', 'what-is-open'], ['dates', 'who-is-on-it', 'runs-on', 'agents-here', 'decisions', 'happened']]);
});
