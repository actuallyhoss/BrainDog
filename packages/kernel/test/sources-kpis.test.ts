/**
 * The `kpis` page source (K2-A): each key number with its points, kind,
 * chart, stale, verdict and change, for one project, for Today and for the cards, read through the record's own wiring.
 *
 * ON A REAL RECORD, declared as Portfolio declares it (`KPI_LIST`): projects with a lane and a colour, the key numbers,
 * the readings (Numbers), tasks a figure counts and a ledger a bucketed figure adds up by month. Three projects:
 *   Kiln     earning: revenue a month (off target), servers (gone quiet), open tasks (a figure), a hidden, a draft and
 *            a retired one that never show
 *   Portage  building: players (up half on last month), sign-ups (pinned), money in by month (a bucketed figure)
 *   Ember    parked: a quiet number that Today never ranks, being out of play
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, openRecord, type Declaration, type Kernel, type KpiAnswer } from '../src/index.ts';
import type { PageBlock } from '../src/pages.ts';
import { kpiTrend } from '../src/sources/kpis.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, title: string, fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields, ...more } as never,
});

const PROJECTS = list(
  'things',
  'Projects',
  'name',
  [
    { id: 'name', type: 'text', required: true },
    { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked', 'retired'] },
    { id: 'draft', type: 'bool' },
    { id: 'mark', type: 'text' },
    { id: 'hue', type: 'int' },
    { id: 'repos', type: 'list', of: 'text' },
  ],
  { scopes: { repos: 'repos' }, identity: { mark: 'mark', accent: 'hue' } },
);

/** The key numbers, field for field as `KPI_LIST` in `packages/seed/src/modules/portfolio.ts`. */
const KPIS = list('kpis', 'Key numbers', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'thing', type: 'ref', to: 'things', required: true },
  { id: 'measures', type: 'text' },
  { id: 'source', type: 'enum', values: ['numbers', 'figure', 'feed', 'agent', 'typed'] },
  { id: 'measure', type: 'text' },
  { id: 'figure', type: 'text' },
  { id: 'unit', type: 'text' },
  { id: 'kind', type: 'enum', values: ['level', 'flow', 'share', 'progress', 'count'] },
  { id: 'good', type: 'enum', values: ['up', 'down'] },
  { id: 'target', type: 'decimal' },
  { id: 'target_amount', type: 'money' },
  { id: 'target_by', type: 'day' },
  { id: 'every', type: 'enum', values: ['1h', '1d', '1w', '1m'] },
  { id: 'owner', type: 'text' },
  { id: 'today', type: 'enum', values: ['auto', 'pinned', 'hidden'] },
  { id: 'headline', type: 'bool' },
  { id: 'order', type: 'int' },
  { id: 'draft', type: 'bool' },
  { id: 'state', type: 'enum', values: ['live', 'retired'] },
]);

const NUMBERS = list('datapoints', 'Numbers', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'value', type: 'decimal' },
  { id: 'amount', type: 'money' },
  { id: 'unit', type: 'text' },
  { id: 'thing', type: 'ref', to: 'things' },
  { id: 'at', type: 'instant' },
]);

const TASKS = list('tasks', 'Tasks', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'thing', type: 'ref', to: 'things' },
]);

const LEDGER = list('ledger', 'Ledger', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'on', type: 'day', required: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'thing', type: 'ref', to: 'things' },
]);

const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body: body as never });

const SEED: Declaration[] = [
  PROJECTS,
  KPIS,
  NUMBERS,
  TASKS,
  LEDGER,
  metric({ metric: 'project-open', name: 'Open tasks', source: 'register.tasks', where: 'thing is {{it}}', value: { count: 'id' }, format: 'int', target: { lte: 5 }, window: '30d', compare: 'none' }),
  metric({
    metric: 'project-in-by-month',
    name: 'Money in, by month',
    source: 'register.ledger',
    where: 'thing is {{it}}, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: 'money',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  }),
];

const must = <T extends { ok: boolean }>(r: T, what: string): T => {
  assert.ok(r.ok, `${what}: ${JSON.stringify(r)}`);
  return r;
};
const iso = (ms: number): string => new Date(ms).toISOString();
const daysAgo = (n: number, hour = 9): string => iso(NOW - n * DAY - (12 - hour) * 3_600_000);
const gbp = (pounds: number) => ({ amount: Math.round(pounds * 100), currency: 'GBP' });

type Ids = Record<string, string>;

/** The record every test reads: three projects, their key numbers and every reading behind them. */
async function seeded(): Promise<{ k: Kernel; ids: Ids; close: () => void }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  must(await k.install(SEED), 'install');
  const ids: Ids = {};
  const row = (register: string, fields: Record<string, unknown>, as?: string): string => {
    const made = k.create(register, fields as never, OWNER);
    assert.ok(made.ok, `${register}: ${JSON.stringify(made)}`);
    const id = (made as { value: { id: string } }).value.id;
    if (as) ids[as] = id;
    return id;
  };
  row('things', { name: 'Kiln', lane: 'earning', mark: 'K', hue: 265, repos: ['kiln'] }, 'kiln');
  row('things', { name: 'Portage', lane: 'building', hue: 185, repos: ['portage'] }, 'portage');
  row('things', { name: 'Ember', lane: 'parked', repos: ['ember'] }, 'ember');

  /* KILN'S REVENUE, read as an import glued it: "Revenue, Kiln", no project on the row. One reading in USD beside. */
  for (const [at, pounds] of [['2026-07-01T00:00:00Z', 6_000], ['2026-08-01T00:00:00Z', 7_000], ['2026-09-01T00:00:00Z', 6_200], ['2026-10-01T00:00:00Z', 1_000]] as const)
    row('datapoints', { name: 'Revenue, Kiln', amount: gbp(pounds), at });
  row('datapoints', { name: 'Revenue, Kiln', amount: { amount: 50_000, currency: 'USD' }, at: '2026-09-15T00:00:00Z' });
  /* KILN'S SERVERS stopped 23 days ago; PORTAGE HAS SERVERS TOO, which are never Kiln's. */
  for (let d = 40; d >= 23; d--) row('datapoints', { name: 'Servers', value: 100 + (40 - d), thing: ids.kiln, at: daysAgo(d) });
  row('datapoints', { name: 'Servers', value: 9_999, thing: ids.portage, at: daysAgo(1) });
  /* PORTAGE'S PLAYERS, every hour of the last day and daily before: one point a day, the day's last. */
  for (let d = 40; d >= 2; d--) row('datapoints', { name: 'Players', value: d >= 28 ? 200 : 300, thing: ids.portage, at: daysAgo(d) });
  for (const hour of [1, 5, 9]) row('datapoints', { name: 'Players', value: 290 + hour, thing: ids.portage, at: daysAgo(1, hour) });
  row('datapoints', { name: 'Sign-ups', value: 40, thing: ids.portage, at: daysAgo(3) });
  row('datapoints', { name: 'Quiet', value: 1, thing: ids.ember, at: daysAgo(60) });

  for (const what of ['Fire', 'Glaze', 'Pack', 'Ship', 'Bill', 'Clean', 'Order']) row('tasks', { what, thing: ids.kiln });
  row('ledger', { what: 'August sale', on: '2026-08-12', amount: gbp(1_200), thing: ids.portage });
  row('ledger', { what: 'September sale', on: '2026-09-03', amount: gbp(800), thing: ids.portage });
  row('ledger', { what: 'October sale', on: '2026-10-02', amount: gbp(300), thing: ids.portage });

  row('kpis', { name: 'Monthly revenue', thing: ids.kiln, measure: 'Revenue', unit: 'GBP', kind: 'flow', target_amount: gbp(10_000), every: '1m', order: 1, owner: 'Sam' }, 'revenue');
  row('kpis', { name: 'Servers', thing: ids.kiln, order: 2 }, 'servers');
  row('kpis', { name: 'Open tasks', thing: ids.kiln, source: 'figure', figure: 'project-open', good: 'down', target: 5, order: 3 }, 'open');
  row('kpis', { name: 'Doc lines', thing: ids.kiln, today: 'hidden', order: 4 }, 'hidden');
  row('kpis', { name: 'Waitlist', thing: ids.kiln, draft: true }, 'draft');
  row('kpis', { name: 'Old orders', thing: ids.kiln, state: 'retired' }, 'retired');
  row('kpis', { name: 'Players', thing: ids.portage, every: '1d', headline: true, order: 2 }, 'players');
  row('kpis', { name: 'Sign-ups', thing: ids.portage, today: 'pinned', order: 1 }, 'signups');
  row('kpis', { name: 'Money in', thing: ids.portage, source: 'figure', figure: 'project-in-by-month', order: 3 }, 'moneyin');
  row('kpis', { name: 'Quiet', thing: ids.ember }, 'quiet');
  return { k, ids, close: () => sql.close() };
}

const read = (k: Kernel, block: Record<string, unknown>) => {
  const out = k.block(block as unknown as PageBlock);
  assert.deepEqual(out.refusals, [], JSON.stringify(out.refusals));
  return out as typeof out & { kpis: KpiAnswer[] };
};
const named = (kpis: readonly KpiAnswer[], name: string): KpiAnswer => {
  const found = kpis.find((x) => x.name === name);
  assert.ok(found, `${name} is answered`);
  return found;
};

const page = (blocks: Record<string, unknown>[]): Declaration => ({ id: 'page.numbers', kind: 'page', body: { page: 'numbers', title: 'Numbers', blocks } as never });

test('THE INSTALL HOLDS A kpis BLOCK TO WHAT IT IS FOR, its source and its project, and refuses for: on any other kind', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  must(await k.install(SEED), 'install');
  const refusal = async (block: Record<string, unknown>): Promise<{ code: string; at?: string }> => {
    const r = await k.install([page([block])]);
    assert.equal(r.ok, false, JSON.stringify(block));
    return (r as unknown as { refusal: { code: string; at?: string } }).refusal;
  };
  assert.match((await refusal({ kind: 'kpis', source: 'kpis' })).at ?? '', /for$/u);
  assert.match((await refusal({ kind: 'kpis', source: 'kpis', for: 'week' })).at ?? '', /for$/u);
  assert.match((await refusal({ kind: 'kpis', source: 'register.kpis', for: 'today' })).at ?? '', /source$/u);
  assert.match((await refusal({ kind: 'kpis', source: 'kpis', for: 'today', about: 'things#1' })).at ?? '', /about$/u);
  assert.equal((await refusal({ kind: 'table', source: 'register.kpis', for: 'today' })).code, 'DECLARATION_INVALID');
  for (const block of [
    { kind: 'kpis', source: 'kpis', for: 'today' },
    { kind: 'kpis', source: 'kpis', for: 'cards', limit: 8 },
    { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1', heading: 'Numbers', icon: 'gauge' },
  ])
    must(await k.install([page([block])]), JSON.stringify(block));
  sql.close();
});

test('ONE PROJECT: its live key numbers in his order, the one its card leads with marked, the hidden one kept and the draft and the retired one gone', async () => {
  const { k, ids, close } = await seeded();
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' });
  assert.deepEqual(
    out.kpis.map((x) => x.name),
    ['Monthly revenue', 'Servers', 'Open tasks', 'Doc lines'],
  );
  assert.equal(out.matched, 4);
  assert.ok(out.kpis.every((x) => x.thing === ids.kiln && x.project === 'Kiln' && x.mark === 'K' && x.hue === 265));
  /* AND THE PROJECT AS A LINK HOLDS IT, so a host opens its page from a number. */
  assert.ok(out.kpis.every((x) => x.spoken === 'things#1'));
  /* NOTHING IS MARKED, SO THE CARD LEADS WITH THE TOP ONE BY TODAY'S SCORE: off target before stale. */
  assert.deepEqual(out.kpis.filter((x) => x.headline).map((x) => x.name), ['Monthly revenue']);
  /* BY ITS ROW ID TOO, as a link may hold it. */
  assert.deepEqual(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: ids.portage }).kpis.map((x) => x.name), ['Sign-ups', 'Players', 'Money in']);
  close();
});

test('MONEY OVER TIME: a glued name matches, each point is the stored amount, another currency is kept for the drawer to leave out, and it is judged by its last whole month', async () => {
  const { k, ids, close } = await seeded();
  const revenue = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' }).kpis, 'Monthly revenue');
  assert.equal(revenue.kpi, ids.revenue);
  assert.deepEqual(
    revenue.points.map((p) => [p.at.slice(0, 10), p.amount]),
    [
      ['2026-07-01', 'GBP 6,000.00'],
      ['2026-08-01', 'GBP 7,000.00'],
      ['2026-09-01', 'GBP 6,200.00'],
      ['2026-09-15', 'USD 500.00'],
      ['2026-10-01', 'GBP 1,000.00'],
    ],
  );
  assert.ok(revenue.points.every((p) => p.value === undefined));
  assert.deepEqual(
    { unit: revenue.unit, kind: revenue.kind, target: revenue.target, every: revenue.every, owner: revenue.owner, source: revenue.source, good: revenue.good },
    { unit: 'GBP', kind: 'flow', target: 'GBP 10,000.00', every: '1m', owner: 'Sam', source: 'numbers', good: 'up' },
  );
  /* SEPTEMBER IS THE LAST WHOLE MONTH: 6,200 of 10,000 is off target, and down on August's 7,000. */
  assert.equal(revenue.verdict, 'off');
  assert.ok(Math.abs(revenue.change! - (6_200 - 7_000) / 7_000) < 1e-9, String(revenue.change));
  assert.deepEqual(revenue.latest, { at: '2026-10-01T00:00:00.000Z', amount: 'GBP 1,000.00' });
  assert.deepEqual(revenue.chart, { chart: 'line', target: 'line', trend: false });
  assert.equal(revenue.stale.stale, false);
  close();
});

test('A NUMBER THAT STOPPED IS STALE after fourteen days with no cadence, says its days and its fix, and another project’s reading of the same name is never its', async () => {
  const { k, close } = await seeded();
  const servers = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' }).kpis, 'Servers');
  assert.deepEqual(servers.stale, { stale: true, days: 23, fix: 'set-up' });
  assert.equal(servers.kind, 'level');
  assert.equal(servers.points.length, 18, 'one a day, the window holding all eighteen');
  assert.ok(servers.points.every((p) => typeof p.value === 'number' && p.value < 9_999), 'Portage’s 9,999 servers are Portage’s');
  assert.equal(servers.latest?.value, 117);
  assert.equal(servers.unit, undefined);
  assert.equal(servers.verdict, undefined, 'no target, no verdict');
  assert.deepEqual(servers.chart, { chart: 'spark', target: null, trend: true });
  close();
});

test('ONE POINT A DAY, the day’s last; a level is set against its value a month before', async () => {
  const { k, close } = await seeded();
  const players = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#2' }).kpis, 'Players');
  const days = players.points.map((p) => p.at.slice(0, 10));
  assert.equal(new Set(days).size, days.length, 'no day twice');
  assert.equal(players.points.length, 40);
  assert.deepEqual(players.latest, { at: daysAgo(1, 9), value: 299 });
  /* 299 against the 200 of 28 days before. */
  assert.ok(Math.abs(players.change! - 99 / 200) < 1e-9, String(players.change));
  assert.equal(players.every, '1d');
  assert.equal(players.stale.stale, false);
  close();
});

test('A TARGET WITH ITS DAY TO COME IS NOT MISSED YET: under it before the day is open, under it after the day is off', async () => {
  const { k, ids, close } = await seeded();
  for (const [name, by] of [['Members ahead', '2026-12-31'], ['Members behind', '2026-10-15']] as const) {
    assert.ok(k.create('datapoints', { name, value: 40, thing: ids.kiln, at: daysAgo(1) } as never, OWNER).ok);
    assert.ok(k.create('kpis', { name, thing: ids.kiln, target: 60, target_by: by, order: 9 } as never, OWNER).ok);
  }
  const kpis = read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' }).kpis;
  assert.equal(named(kpis, 'Members ahead').verdict, undefined, '40 of 60 with ten weeks to go is on its way, not off');
  assert.equal(named(kpis, 'Members behind').verdict, 'off', '40 of 60 six days after its day is off');
  close();
});

test('A FIGURE IS READ WITH ITS PROJECT FILLED IN: one number now, judged by the row’s own target, never stale', async () => {
  const { k, close } = await seeded();
  const open = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' }).kpis, 'Open tasks');
  assert.deepEqual(open.points, [{ at: iso(NOW), value: 7 }]);
  assert.equal(open.kind, 'count');
  assert.equal(open.good, 'down');
  assert.equal(open.target, 5);
  assert.equal(open.verdict, 'off', 'seven open against at most five');
  assert.equal(open.stale.stale, false);
  assert.deepEqual(open.chart, { chart: 'number', target: null, trend: false });
  assert.equal(open.refusal, undefined);
  close();
});

test('A FIGURE BUCKETED BY MONTH IS ITS OWN HISTORY, one point a month as money, its unit its currency', async () => {
  const { k, close } = await seeded();
  const money = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#2' }).kpis, 'Money in');
  const held = money.points.filter((p) => p.amount !== 'GBP 0.00');
  assert.deepEqual(
    held.map((p) => [p.at, p.amount]),
    [
      ['2026-08-01', 'GBP 1,200.00'],
      ['2026-09-01', 'GBP 800.00'],
      ['2026-10-01', 'GBP 300.00'],
    ],
  );
  assert.equal(money.unit, 'GBP');
  assert.equal(money.kind, 'flow');
  assert.ok(Math.abs(money.change! - (800 - 1_200) / 1_200) < 1e-9, String(money.change));
  close();
});

test('A FIGURE NOBODY DECLARED IS SAID ON THE NUMBER, which is drawn with no points, and the block still reads', async () => {
  const { k, ids, close } = await seeded();
  must(k.update('kpis', ids.open!, { figure: 'project-nothing' } as never, OWNER), 'rename the figure');
  const open = named(read(k, { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' }).kpis, 'Open tasks');
  assert.equal(open.refusal?.code, 'METRIC_UNKNOWN');
  assert.deepEqual([open.points, open.latest], [[], null]);
  close();
});

test('TODAY: his pin first, then one a project in play by off target, stale and change, four at most, each saying why', async () => {
  const { k, close } = await seeded();
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'today' });
  assert.deepEqual(
    out.kpis.map((x) => [x.project, x.name, x.rank, x.why]),
    [
      ['Portage', 'Sign-ups', 'pinned', 'Pinned to Today'],
      ['Kiln', 'Monthly revenue', 'off-target', 'Off target'],
      ['Portage', 'Players', 'change', 'Up 50%'],
    ],
  );
  /* EVERY ONE THAT MAY SHOW, counted: Kiln's three, Portage's three, and not Ember's, parked; never hidden, draft or retired. */
  assert.equal(out.matched, 6);
  assert.deepEqual(read(k, { kind: 'kpis', source: 'kpis', for: 'today', limit: 2 }).kpis.map((x) => x.name), ['Sign-ups', 'Monthly revenue']);
  close();
});

test('TODAY SAYS A QUIET NUMBER BY ITS DAYS, once its project’s off-target one is put aside', async () => {
  const { k, ids, close } = await seeded();
  must(k.update('kpis', ids.revenue!, { today: 'hidden' } as never, OWNER), 'hide revenue');
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'today' });
  const kiln = out.kpis.find((x) => x.project === 'Kiln')!;
  assert.deepEqual([kiln.name, kiln.rank, kiln.why], ['Open tasks', 'off-target', 'Off target']);
  must(k.update('kpis', ids.open!, { today: 'hidden' } as never, OWNER), 'hide open tasks');
  const again = read(k, { kind: 'kpis', source: 'kpis', for: 'today' }).kpis.find((x) => x.project === 'Kiln')!;
  assert.deepEqual([again.name, again.rank, again.why], ['Servers', 'stale', 'Not updated for 23 days']);
  close();
});

test('THE CARDS: one number a project, the one he marked, else its top one, with hidden ones counted, in the projects’ order', async () => {
  const { k, ids, close } = await seeded();
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'cards' });
  assert.deepEqual(
    out.kpis.map((x) => [x.project, x.name, x.rank]),
    [
      ['Kiln', 'Monthly revenue', 'off-target'],
      ['Portage', 'Players', 'change'],
      ['Ember', 'Quiet', 'stale'],
    ],
  );
  assert.equal(out.matched, 3);
  /* A CARD IS NOT TODAY: a number hidden from Today may still lead its card, when he marks it so. */
  must(k.update('kpis', ids.hidden!, { headline: true } as never, OWNER), 'mark the hidden one');
  assert.deepEqual(read(k, { kind: 'kpis', source: 'kpis', for: 'cards' }).kpis[0]?.name, 'Doc lines');
  close();
});

test('THE ANSWER IS WHAT Kpis.svelte TAKES: every KpiInput field it fills is of its type, and kpis is an answer key a block read back keeps', async () => {
  const { k, close } = await seeded();
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'today' });
  /* `KpiInput` in `packages/render/src/kpis.ts`, written out: the kernel may not import the renderer (`declare.ts`). */
  const INPUT = ['kpi', 'name', 'project', 'slot', 'measures', 'source', 'unit', 'kind', 'good', 'target', 'target_by', 'every', 'headline', 'verdict', 'why', 'points'];
  const BESIDE = ['thing', 'spoken', 'mark', 'hue', 'owner', 'today', 'order', 'latest', 'change', 'stale', 'chart', 'rank', 'refusal'];
  for (const x of out.kpis) {
    assert.deepEqual(Object.keys(x).filter((key) => !INPUT.includes(key) && !BESIDE.includes(key)), [], x.name);
    assert.ok(Array.isArray(x.points) && x.points.every((p) => typeof p.at === 'string' && (typeof p.value === 'number' || typeof p.amount === 'string')));
    assert.ok(x.verdict === undefined || x.verdict === 'met' || x.verdict === 'off');
    assert.ok(Object.values(x).every((v) => v !== undefined), 'no key is answered undefined');
  }
  assert.ok(ANSWER_KEYS.includes('kpis'));
  assert.deepEqual(k.block(out as never).refusals, [], 'read back, the block is not refused for its own answer');
  close();
});

test('A RECORD WITH NO KEY NUMBERS DRAWS NOTHING AND SAYS NOTHING', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  must(await k.install([PROJECTS, NUMBERS]), 'install');
  const out = read(k, { kind: 'kpis', source: 'kpis', for: 'today' });
  assert.deepEqual([out.kpis, out.matched], [[], 0]);
  sql.close();
});

test('WHAT THE READ REFUSES: another kind over the source, a project nobody named or nobody holds, and keys the numbers do not take', async () => {
  const { k, close } = await seeded();
  const codes = (block: Record<string, unknown>) => k.block(block as unknown as PageBlock).refusals.map((r) => [r.code, r.at]);
  /* `for:` IS A kpis BLOCK'S ALONE, so a table carrying it is told so first, and then why the source is not its. */
  assert.deepEqual(codes({ kind: 'table', source: 'kpis', for: 'today' }), [['DECLARATION_INVALID', 'for'], ['DECLARATION_INVALID', 'kind']]);
  assert.deepEqual(codes({ kind: 'table', source: 'kpis' }), [['DECLARATION_INVALID', 'kind']]);
  assert.deepEqual(codes({ kind: 'kpis', source: 'kpis' }), [['DECLARATION_INVALID', 'for']]);
  assert.deepEqual(codes({ kind: 'kpis', source: 'kpis', for: 'project' }), [['REQUIRED_MISSING', 'about']]);
  assert.deepEqual(codes({ kind: 'kpis', source: 'kpis', for: 'project', about: 'things#9' }), [['VALUE_MALFORMED', 'about']]);
  assert.deepEqual(codes({ kind: 'kpis', source: 'kpis', for: 'today', order: [{ field: 'name' }] }), [['DECLARATION_INVALID', 'order']]);
  close();
});

test('ON A PROJECT’S OWN PAGE the block names no project and reads the row the page is about', async () => {
  const { k, close } = await seeded();
  must(
    await k.install([
      {
        id: 'page.project',
        kind: 'page',
        body: {
          page: 'project',
          title: '{{name}}',
          for: { register: 'things' },
          blocks: [
            { kind: 'kpis', source: 'kpis', for: 'project', about: '{{spoken}}' },
            { kind: 'kpis', source: 'kpis', for: 'project' },
          ],
        } as never,
      },
    ]),
    'template',
  );
  const got = must(k.page('portage'), 'the page');
  const blocks = (got as unknown as { value: { blocks: { kpis?: KpiAnswer[]; refusals: unknown[] }[] } }).value.blocks;
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.deepEqual(block.refusals, []);
    assert.deepEqual(block.kpis?.map((x) => x.name), ['Sign-ups', 'Players', 'Money in']);
  }
  close();
});

test('A KEY NUMBER AS A CARD’S LINE: its own periods, a flow added up with nought for none, a level its last, another currency left out', () => {
  const flow = kpiTrend(
    {
      kind: 'flow',
      every: '1m',
      unit: 'GBP',
      points: [
        { at: '2026-07-01T00:00:00Z', amount: 'GBP 6,000.00' },
        { at: '2026-07-20T00:00:00Z', amount: 'GBP 500.50' },
        { at: '2026-09-15T00:00:00Z', amount: 'USD 500.00' },
        { at: '2026-10-01T00:00:00Z', amount: 'GBP 1,000.00' },
      ],
    },
    NOW,
    4,
  );
  assert.deepEqual(flow, [6_500.5, 0, 0, 1_000]);
  const level = kpiTrend(
    {
      kind: 'level',
      every: '1w',
      points: [
        { at: '2026-09-01T09:00:00Z', value: 5 },
        { at: '2026-10-06T09:00:00Z', value: 40 },
        { at: '2026-10-08T09:00:00Z', value: 42 },
        { at: '2026-10-20T09:00:00Z', value: 51 },
      ],
    },
    NOW,
    3,
  );
  /* THREE WEEKS FROM MONDAY 5 OCTOBER: the 8th's 42 is its week's last, nothing came the week of the 12th, and the 20th's 51 is this week's. */
  assert.deepEqual(level, [42, null, 51]);
  assert.equal(kpiTrend({ kind: 'level', every: '1d', points: [{ at: '2026-01-01T00:00:00Z', value: 3 }] }, NOW, 8), null);
});

test('A CARD’S TREND WITH kpi: headline draws the number its project leads with, and the figure only where the project leads with none', async () => {
  const { k, close } = await seeded();
  const tallow = must(k.create('things', { name: 'Tallow', lane: 'building', repos: ['tallow'] } as never, OWNER), 'Tallow');
  must(k.create('ledger', { what: 'October sale', on: '2026-10-05', amount: gbp(400), thing: (tallow as unknown as { value: { id: string } }).value.id } as never, OWNER), 'a sale on Tallow');
  const cards = (kpi: boolean): Map<string, (number | null)[] | null> => {
    const trend = { metric: 'project-in-by-month:{{name}}', as: 'trend', ...(kpi ? { kpi: 'headline' } : {}) };
    const out = k.block({ kind: 'cards', source: 'register.things', columns: [{ field: 'name', as: 'title' }, trend], order: [{ field: 'name', dir: 'asc' }] } as unknown as PageBlock);
    assert.deepEqual(out.refusals, [], JSON.stringify(out.refusals));
    return new Map(out.rows.map((r, i) => [String(r.fields.name), out.trends?.[i] ?? null]));
  };
  const led = cards(true);
  const plain = cards(false);
  /* KILN LEADS WITH ITS REVENUE A MONTH: eight months to October, added up, the dollars left out. Its figure has nothing. */
  assert.deepEqual(led.get('Kiln'), [0, 0, 0, 0, 6_000, 7_000, 6_200, 1_000]);
  assert.equal(plain.get('Kiln'), null);
  /* PORTAGE LEADS WITH PLAYERS, daily: each day's last, today's still to come. Its money in by month is not drawn beside it. */
  assert.deepEqual(led.get('Portage'), [300, 300, 300, 300, 300, 300, 299, null]);
  assert.notDeepEqual(led.get('Portage'), plain.get('Portage'));
  /* TALLOW KEEPS NO KEY NUMBER, so its card draws the figure the column names, as before. */
  assert.ok(led.get('Tallow'));
  assert.deepEqual(led.get('Tallow'), plain.get('Tallow'));
  close();
});

test('EVERY FORM NAMES THE LIST ITS NUMBERS ARE KEPT IN, so a host links All numbers to it; a record with none names nothing', async () => {
  const { k, close } = await seeded();
  for (const block of [
    { kind: 'kpis', source: 'kpis', for: 'today' },
    { kind: 'kpis', source: 'kpis', for: 'cards' },
    { kind: 'kpis', source: 'kpis', for: 'project', about: 'things#1' },
  ])
    assert.equal(read(k, block).kpi_list, 'kpis', JSON.stringify(block));
  close();
  const sql = openSqlite();
  const bare = await openRecord(sql, fixedClock(NOW));
  must(await bare.install([PROJECTS, NUMBERS]), 'install');
  assert.equal(read(bare, { kind: 'kpis', source: 'kpis', for: 'today' }).kpi_list, undefined);
  sql.close();
});

test('kpi: ON A COLUMN IS A CARD TREND’S ALONE, and says headline', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  must(await k.install(SEED), 'install');
  const install = (columns: Record<string, unknown>[]) => k.install([page([{ kind: 'cards', source: 'register.things', columns: [{ field: 'name', as: 'title' }, ...columns] }])]);
  must(await install([{ metric: 'project-in-by-month:{{name}}', kpi: 'headline', as: 'trend' }]), 'a trend that reads the lead');
  for (const column of [
    { metric: 'project-in-by-month:{{name}}', kpi: 'top', as: 'trend' },
    { field: 'lane', kpi: 'headline', as: 'fact' },
    { metric: 'project-open:{{name}}', kpi: 'headline', as: 'when' },
  ]) {
    const r = await install([column]);
    assert.equal(r.ok, false, JSON.stringify(column));
    assert.equal((r as unknown as { refusal: { code: string } }).refusal.code, 'DECLARATION_INVALID');
  }
  sql.close();
});
