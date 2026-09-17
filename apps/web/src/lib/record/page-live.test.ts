/**
 * A declared page against the record: the record's blocks drawn from its answer, the sample when there
 * is no record, a page it lacks said so, any other refusal in its own words, and a block this build
 * cannot draw from a live answer saying that in one line rather than borrowing the sample's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MISSING } from 'braindog-render';

import { METRICS } from './declared.ts';
import { ROWS, feedTable } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf, liveWords, pageReader, resolverOf, type Fetch } from './page-live.ts';

const BASE = 'http://record.test';
const AT = Date.UTC(2026, 8, 15, 12);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const refusal = (status: number, code: string, fix: string) => json(status, { ok: false, refusal: { code, fix } });

/** A fetch that answers by method name, and remembers what it was sent. */
function host(answer: ((method: string, url: URL) => Response) | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    const method = at.pathname.split('/').pop() ?? '';
    sent.push(method);
    if (!answer) throw new TypeError('fetch failed');
    return answer(method, at);
  }) as Fetch;
  return { io, sent };
}

const row = (seq: number, fields: Record<string, unknown>) => ({
  id: `01JROW${String(seq).padStart(20, '0')}`,
  register: 'obligations',
  seq,
  fields,
  state: null,
  version: 1,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-10T09:00:00.000Z',
  deleted_at: null,
});

const metric = Object.keys(METRICS)[0]!;
const obligation = ROWS.obligations![0]!.fields;
const column = Object.keys(obligation)[0]!;

const ANSWER = {
  page: 'desk',
  title: 'Desk',
  blocks: [
    { kind: 'note', body: 'Due {{due}}', values: { due: { amount: 12000, currency: 'GBP' } }, rows: [], matched: 0, refusals: [] },
    {
      kind: 'stat',
      cells: [{ metric }, { metric }],
      readings: [
        { metric, reading: { value: 3, unit: null, rows: 3, met: true, refusals: [] } },
        { metric, reading: null, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read that.' } },
      ],
      rows: [],
      matched: 0,
      refusals: [],
    },
    { kind: 'table', source: 'register.obligations', columns: [{ field: column }], rows: [row(1, obligation)], matched: 3, refusals: [] },
    { kind: 'bar', source: 'register.obligations', rows: [row(1, obligation)], matched: 3, refusals: [] },
    { kind: 'table', source: 'forecast.runway', rows: [], matched: 0, refusals: [] },
    {
      kind: 'table',
      source: 'actions',
      rows: [
        {
          id: 'crumb-stats',
          fields: {
            ingest: 'crumb-stats', channel: 'poll', project: null, host: 'api', every: '1h', key: null, state: 'paused', next: null,
            last_at: '2026-09-15T10:00:00.000Z', last_outcome: 'paused', last_status: 401, last_note: 'The key was refused.', runs: 3, failures: 1,
          },
        },
      ],
      matched: 1,
      refusals: [],
    },
    { kind: 'table', source: 'register.obligations', rows: [], matched: 0, refusals: [{ code: 'FORBIDDEN', fix: 'This key cannot read obligations.' }] },
  ],
};

const record = (method: string, url: URL): Response => {
  if (method === 'page')
    return url.searchParams.get('slug') === 'desk' || String(url).includes('desk')
      ? json(200, { ok: true, value: ANSWER })
      : refusal(404, 'PAGE_UNKNOWN', 'There is no page by that name.');
  if (method === 'pages') return json(200, { ok: true, value: [{ slug: 'desk', title: 'Desk' }, { slug: 'money', title: 'Money' }] });
  return refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.');
};

test("the record's page is drawn from its answer, and only its answer", async () => {
  const { io } = host(record);
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.now, AT);
  assert.equal(out.page.page.title, 'Desk');
  const [note, stat, table, bar, runway, actions, refused] = out.page.blocks;
  assert.equal(out.page.blocks.length, ANSWER.blocks.length, 'a sample block was mixed in');

  assert.equal(resolverOf(note!.values)('due'), resolverOf({ x: { amount: 12000, currency: 'GBP' } })('x'));

  /* A TILE IS THE RECORD'S READING, and one it could not read is a dash with the reason. */
  assert.equal(stat!.metrics?.length, 2);
  assert.notEqual(stat!.metrics![0]!.value, MISSING);
  assert.equal(stat!.metrics![0]!.tone, 'good');
  assert.equal(stat!.metrics![1]!.value, MISSING);

  /* A LIST SAYS HOW MUCH OF THE ANSWER IT DRAWS. */
  assert.equal(table!.register, 'obligations');
  assert.equal(table!.rows.length, 1);
  assert.equal(table!.shown, 1);
  assert.equal(table!.total, 3);
  assert.equal(table!.cannot, undefined);

  /* A SUM OVER A SLICE, AND A WALK, ARE NOT DRAWN FROM THE SAMPLE: they say they cannot be drawn. */
  assert.equal(bar!.cannot, liveWords.cannot);
  assert.equal(runway!.cannot, liveWords.cannot);
  assert.equal(runway!.rows.length, 0);

  assert.equal(actions!.actions?.length, 1);
  assert.deepEqual(actions!.actions![0]!.last, { at: '2026-09-15T10:00:00.000Z', outcome: 'paused', status: 401, note: 'The key was refused.' });
  assert.equal(actions!.actions![0]!.state, 'paused');

  assert.deepEqual(refused!.refusals, ['This key cannot read obligations.']);
  assert.equal(refused!.rows.length, 0);
});

test('no record here reads the sample, and does not ask again in this tab', async () => {
  const { io, sent } = host(() => refusal(401, 'UNAUTHORIZED', 'Sign in to read this record.'));
  const reader = pageReader(BASE, io);
  assert.deepEqual(await reader.read('desk'), { from: 'sample' });
  const before = sent.length;
  assert.deepEqual(await reader.read('money'), { from: 'sample' });
  assert.equal(sent.length, before);

  assert.deepEqual(await pageReader(BASE, host(null).io).read('desk'), { from: 'sample' });
});

test('nothing is put on a live page that the record did not send', async () => {
  const { io } = host(record);
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;

  /* `requires` NAMES THE REGISTERS A DECLARATION READS (`06 §1.1`), and it is the declaration's to
     say. A `[]` written here to satisfy the app's own type is this app declaring, on the record's
     behalf, that the page reads no register at all, and it travels: the page object is what the
     source view prints and what `<page>.dog` is saved from. An answer with no `requires` has none. */
  assert.equal(Object.hasOwn(out.page.page, 'requires'), false);
  /* AND NO ROW IS CLAIMED FOR A PAGE THAT IS NOT ABOUT ONE. */
  assert.equal(out.page.page.identity, undefined);
});

test("a page's own keys are the record's, and an expanded page wears the colour of the row it is about", async () => {
  const answered = { ...ANSWER, requires: ['register.obligations'], param: { register: 'projects', seq: 4, title: 'Kiln' } };
  const { io } = host((method) => (method === 'page' ? json(200, { ok: true, value: answered }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.')));
  const out = await pageReader(BASE, io, () => AT).read('kiln');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;

  assert.deepEqual(out.page.page.requires, ['register.obligations']);
  /* `identity` IS THE ROW THE PAGE IS ABOUT, which is what a project page's hue is read from. The
     record does not send that key, and it sends the row: `param` is the register, the number and the
     title the template expanded from. The sample builds both from one pair (`pages.ts`), so a live
     project page that dropped it was the same page in a different colour. */
  assert.deepEqual(out.page.page.identity, { register: 'projects', seq: 4 });
});

test('a declaration the record never checked is narrowed before it reaches the renderer', async () => {
  /* EVERY DECLARATION KEY HERE IS ONE `declare.ts` DOES NOT LOOK AT, so a pack may carry it in any
     shape and the record forwards it as a key a block may have. `blocks.ts` draws the strings with
     `escapeCell`, which is `c.replaceAll(…)`, and the authored rows with `r.cells.map(escapeCell)`,
     so the shape the app's type promises is the difference between a block that draws and a
     TypeError inside the render that takes every other block on the page with it. */
  const answered = {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'comparison', heading: 12, empty: { said: 'nothing' }, body: ['a'], target: 'soon', authored: 'two', rows: [], matched: 0, refusals: [] },
      {
        kind: 'table',
        source: 'register.obligations',
        columns: [{ field: column, as: 'sideways' }, { field: column, as: 'title' }, { field: column, as: 'scope' }],
        authored: [{ cells: ['one', 'two'], tone: 'good' }, { cells: 'no' }, { cells: ['fine'], tone: 'purple' }],
        rows: [],
        matched: 0,
        refusals: [],
      },
    ],
  };
  const { io } = host((method) => (method === 'page' ? json(200, { ok: true, value: answered }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.')));
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const [written, table] = out.page.blocks;

  /* A KEY THAT IS NOT WHAT IT CLAIMS TO BE IS LEFT OFF, so the block draws without a heading rather
     than throwing while drawing one. */
  assert.equal(written!.heading, undefined);
  assert.equal(written!.empty, undefined);
  assert.equal(written!.body, undefined);
  assert.equal(written!.target, undefined);
  assert.equal(written!.authored, undefined);
  assert.doesNotThrow(() => toSegments(written!));

  /* THE ROWS THAT ARE ROWS SURVIVE. A row whose cells are not a list of strings is left out, and a
     tone that is not one of the four is dropped while the row it was on is kept. */
  assert.deepEqual(table!.authored, [{ cells: ['one', 'two'], tone: 'good' }, { cells: ['fine'] }]);
  assert.doesNotThrow(() => toSegments(table!));

  /* AND A ROLE THIS APP DOES NOT DRAW IS DROPPED RATHER THAN ASSERTED INTO A CLOSED TYPE. `scope`
     says what a cell HOLDS, which is settled from `scopes` before a column is built. */
  assert.equal(table!.columns[0]?.as, undefined);
  assert.equal(table!.columns[1]?.as, 'title');
  assert.equal(table!.columns[2]?.as, undefined);
});

test('a page the record lacks says so, with the pages it has', async () => {
  const { io } = host(record);
  assert.deepEqual(await pageReader(BASE, io).read('nowhere'), { from: 'missing', titles: ['Desk', 'Money'] });
});

test("any other refusal is the record's own sentence", async () => {
  const { io } = host(() => refusal(403, 'FORBIDDEN', 'This key cannot read pages.'));
  assert.deepEqual(await pageReader(BASE, io).read('desk'), { from: 'refused', fix: 'This key cannot read pages.' });
});

test('a value is read from what the record sent, and nothing it did not', () => {
  const resolve = resolverOf({ count: 1200, name: 'Kiln', paid: true, note: null });
  assert.equal(resolve('name'), 'Kiln');
  assert.equal(resolve('paid'), 'yes');
  assert.ok(resolve('count')?.includes('200'));
  assert.equal(resolve('note'), null);
  assert.equal(resolve('constructor'), null);
  assert.equal(resolve('missing'), null);
  assert.equal(resolverOf(undefined)('name'), null);
});

test('the page route reads the record, waits for it, and draws what it cannot say plainly', () => {
  const route = readFileSync(new URL('../../routes/p/[slug]/+page.svelte', import.meta.url), 'utf8');
  assert.match(route, /pageReader\(location\.origin\)/);
  assert.match(route, /\{#if got === null\}/);
  assert.match(route, /block\.cannot/);
  assert.match(route, /<ActionRows /);
  assert.match(route, /<Actions project=\{param\.title\} \/>/, 'Runs on went missing from the project pages');
  assert.doesNotMatch(route, /\$effect\(\(\) => drew\('ready'\)\)/, 'the page says it drew before the record answered');
});

/* A MONEY COLUMN IS ONE THE REGISTER DECLARES AS MONEY, ON THE LIVE PATH TOO.
   This asked the field's NAME and matched `amount` or `cost`. `things.revenue` is declared money
   and is named neither, so it was drawn as ordinary text: clipped with an ellipsis, which reads as
   a smaller figure rather than as damage (13 §4.2), and passed over by `cardPlan` when it picks
   which column is a card's figure on a phone. The sample path was repaired first and this one went
   on guessing, so the two halves of the same product disagreed about the same field. */
test('a money column is one the register declares as money, not one called amount', async () => {
  const answered = {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'table', source: 'register.things', columns: [{ field: 'revenue' }, { field: 'name' }], rows: [], matched: 0, refusals: [] },
    ],
  };
  const { io } = host((method) =>
    method === 'page' ? json(200, { ok: true, value: answered }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.'),
  );
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const [table] = out.page.blocks;

  assert.equal(table!.columns[0]?.truncate, 'never');
  assert.equal(table!.columns[1]?.truncate, 'end');
});

/* A LABEL THAT IS NOT TEXT IS THE SAME CRASH THE OTHER KEYS WERE NARROWED FOR, AND IT WAS LEFT
   TRUSTED. `blocks.ts` draws a column's label and a figure's label through `escapeCell`, which is
   `c.replaceAll(...)`, so a number there is a TypeError inside the page's own render and takes every
   other block on the page with it. The kernel refuses a non-text label at install now, so a record
   on this build cannot send one. A record on an older kernel still can, and this is the path that
   reads what a record actually sent. The label falls back to the field or the metric, which is what
   a column declared without a label already gets. */
test('a label that is not text is left off rather than drawn, and the page still draws', async () => {
  const answered = {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'stat', cells: [{ metric, label: 7 }], rows: [], matched: 0, refusals: [] },
      { kind: 'table', source: 'register.things', columns: [{ field: 'revenue', label: 12 }], rows: [], matched: 0, refusals: [] },
    ],
  };
  const { io } = host((method) =>
    method === 'page' ? json(200, { ok: true, value: answered }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.'),
  );
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const [stat, table] = out.page.blocks;

  assert.equal(table!.columns[0]?.label, 'revenue');
  assert.equal(stat!.cells?.[0]?.label, metric);
  assert.doesNotThrow(() => toSegments(table!));
  assert.doesNotThrow(() => toSegments(stat!));
});

/* A CASH WALK, A FEED AND A DIFF ARE ANSWERED LIVE BY THE KERNEL, as `walk`, `feed` with `seen`, and
   `history`. This build drew each as "This block cannot be drawn from the record yet". They are now
   shaped into the rows the sample's own blocks carry, so the same renderers draw them. */
test('A WALK THE RECORD SPLIT BY CURRENCY keeps each walk’s remembered cash, and draws one set of knobs', () => {
  const now = Date.UTC(2026, 8, 16, 12);
  const step = (day: string, delta: number, balance: number) => ({ day, label: 'Hosting', delta, balance, source: 'bills', spoken: 'bills#1' });
  const block = blockOf(
    {
      kind: 'forecast', source: 'forecast.runway', heading: 'Cash ahead', horizon: 90, knobs: ['horizon', 'late'], rows: [], matched: 1, refusals: [],
      walks: [
        { from: 5000, currency: 'GBP', mixed: [], steps: [], crossed: null, days: null, horizon: 90, refusals: [], past: [{ at: '2026-09-14', value: 4800 }] },
        { from: 0, currency: 'USD', mixed: [], steps: [step('2026-09-20', -300, -300)], crossed: null, days: null, horizon: 90, refusals: [], past: [] },
      ],
      walkFx: { home: null, missing: [] },
    },
    new Map(),
    now,
  );
  assert.deepEqual(block.walks?.map((w) => w.past), [[{ at: '2026-09-14', value: 4800 }], []]);
  const forecasts = toSegments(block).filter((s) => s.type === 'block' && s.kind === 'forecast') as { rows: { cells: string[] }[] }[];
  const rows = forecasts.map((f) => f.rows.map((r) => r.cells[0]?.trim()));
  assert.deepEqual(rows.map((r) => r.filter((c) => c === 'past').length), [1, 0]);
  assert.deepEqual(rows.map((r) => r.includes('knobs')), [false, true]);
});

test('a cash walk, a feed and a diff the record answered are drawn from its answer', () => {
  const now = Date.UTC(2026, 8, 16, 12);
  const step = (day: string, delta: number, balance: number, spoken: string) => ({ day, label: `Movement ${spoken}`, delta, balance, source: spoken.split('#')[0], spoken });
  const steps = [step('2026-09-20', -3000, 2000, 'services#3'), step('2026-10-01', -4000, -2000, 'obligations#7'), step('2026-10-20', -500, -2500, 'services#3')];
  const walk = blockOf(
    {
      kind: 'table', source: 'forecast.runway', horizon: 90, limit: 2, rows: [], matched: 3, refusals: [],
      walk: { from: 5000, currency: 'GBP', mixed: [], steps, crossed: { ...steps[1] }, days: 15, horizon: 90, refusals: [] },
    },
    new Map(),
    now,
  );
  assert.equal(walk.cannot, undefined, 'a walk the record made was drawn as one it cannot');
  assert.deepEqual(walk.columns.map((c) => c.label), ['When', 'What', 'In and out', 'Balance']);
  assert.equal(walk.rows.length, 3, 'the opening row and the two steps the limit allows');
  assert.equal(walk.rows[0]!.key, 'opening');
  assert.equal(walk.rows[1]!.href, '/r/services/3');
  assert.deepEqual(walk.rows.map((r) => r.tone), [undefined, undefined, 'bad'], 'the crossing is the row the record named');
  assert.deepEqual([walk.shown, walk.total], [2, 3]);
  assert.doesNotThrow(() => toSegments(walk));

  const feed = blockOf(
    {
      kind: 'feed', source: 'activity', since: 'seen', rows: [], matched: 3, refusals: [], seen: '2026-09-16T09:00:00.000Z',
      feed: [
        { by: 'agent', who: 'S12', count: 2, kind: 'delete', target: 'things#1', note: null, at: '2026-09-16T11:00:00.000Z', thing: 'Kiln' },
        { by: 'you', who: 'p_1', count: 1, kind: 'create', target: 'obligations#7', note: 'Filed it', at: '2026-09-15T10:00:00.000Z' },
      ],
    },
    new Map(),
    now,
  );
  assert.equal(feed.cannot, undefined, 'a feed the record read was drawn as one it cannot');
  assert.deepEqual(feed.rows.map((r) => r.cells[0]), ['agent', 'seen', 'you'], 'the read mark sits under the rows newer than it');
  assert.notEqual(feed.rows[1]!.cells[1], '', 'a reader with a read mark was drawn as one who has not looked');
  assert.equal(feed.rows[0]!.cells[2], '2');
  assert.equal(feed.rows[0]!.cells[3], 'deleted Kiln', 'a row the record named was drawn by its id');
  assert.equal(feed.rows[2]!.cells[3], 'Filed it');
  assert.deepEqual([feed.shown, feed.total], [2, 3]);
  assert.doesNotThrow(() => toSegments(feed));

  const agents = blockOf(
    {
      kind: 'agents', source: 'activity', first: 5, rows: [], matched: 4, refusals: [],
      feed: [
        { by: 'agent', who: 'S12', count: 3, kind: 'edit', target: 'tickets#2', note: null, at: '2026-09-16T11:00:00.000Z', thing: 'Write the notes' },
        { by: 'agent', who: 'agent:claude', count: 1, kind: 'create', target: 'tickets#3', note: null, at: '2026-09-16T10:00:00.000Z', thing: 'Fix login' },
      ],
    },
    new Map(),
    now,
  );
  assert.equal(agents.cannot, undefined, 'what agents did was drawn as a block it cannot');
  assert.deepEqual(agents.rows.map((r) => [r.cells[1], r.cells[2]]), [['3', 'changed Write the notes'], ['1', 'added Fix login']]);
  assert.equal(agents.rows[0]!.cells.length, 4, 'who, count, what and when');
  assert.equal(agents.rows[1]!.cells[0], 'Claude', 'an agent is named as a person reads it');
  assert.deepEqual([agents.shown, agents.total], [2, 2], 'every event is on a row, so the block is never a slice');
  /* AND THE ROWS REACH THE DRAWING: a live block drew its `empty:` over the rows the reader had written. */
  const [drawn] = toSegments(agents);
  assert.equal(drawn?.type === 'block' ? drawn.rows.length : -1, 2, 'the agents block drew no rows');
  const [fed] = toSegments(feed);
  assert.ok(fed?.type === 'block' && fed.rows.length >= 2, 'the feed block drew no rows');

  const diff = blockOf(
    {
      kind: 'diff', source: 'register.obligations', row: 'obligations#7', field: 'note', rows: [], matched: 4, refusals: [],
      history: [
        { at: '2026-09-15T10:00:00.000Z', by: 'p_1', text: 'one\ntwo\nthree' },
        { at: '2026-09-10T10:00:00.000Z', by: 'p_1', text: 'one\n2\nthree' },
      ],
    },
    new Map(),
    now,
  );
  assert.equal(diff.cannot, undefined, 'a diff the record read was drawn as one it cannot');
  assert.ok(diff.rows.length >= 3, 'the two versions were not compared line by line');
  assert.deepEqual([diff.shown, diff.total], [2, 4]);
  assert.doesNotThrow(() => toSegments(diff));

  /* AND ONE THE RECORD SENT NOTHING FOR STILL SAYS SO, rather than drawing an empty walk. */
  assert.equal(blockOf({ kind: 'diff', source: 'register.obligations', rows: [], matched: 0, refusals: [] }, new Map(), now).cannot, liveWords.cannot);
});

test('a tile over a quantity is drawn as the quantity, and only a currency as money', () => {
  /* Any reading with a unit went to `money`, so 150 kg drew `KG 1.50` and 12.5 h drew `H 0.13`. */
  const reading = (value: number, unit: string) => ({ metric, reading: { value, unit, rows: 2, met: null, refusals: [] } });
  const stat = blockOf(
    {
      kind: 'stat',
      cells: [{ metric }, { metric }, { metric }],
      readings: [reading(150, 'kg'), reading(12.5, 'h'), reading(129_900, 'GBP')],
      rows: [],
      matched: 0,
      refusals: [],
    } as never,
    new Map(),
    AT,
  );
  assert.deepEqual(stat.metrics?.map((m) => m.value), ['150 kg', '12.5 h', 'GBP 1,299.00']);
});

test('A LEAD FIGURE AND ITS TREND COME THROUGH FROM THE RECORD, and reach the dialect as a form and a fourth cell', () => {
  const stat = blockOf(
    {
      kind: 'stat',
      lead: true,
      cells: [{ metric, trend: '6d' }, { metric }],
      readings: [
        { metric, reading: { value: 300_000, unit: 'GBP', rows: 2, met: true, refusals: [] }, trend: [500_000, 450_000, null, 400_000, 350_000, 300_000] },
        { metric, reading: { value: 3, unit: null, rows: 3, met: null, refusals: [] }, trend: ['not', 'a', 'day'] },
      ],
      rows: [],
      matched: 0,
      refusals: [],
    } as never,
    new Map(),
    AT,
  );
  assert.deepEqual(stat.metrics?.[0]?.trend, [500_000, 450_000, null, 400_000, 350_000, 300_000]);
  assert.equal(stat.metrics?.[1]?.trend, undefined, 'a trend that is not numbers and gaps is not drawn');
  const [segment] = toSegments(stat);
  assert.equal(segment?.type, 'block');
  const block = segment as Extract<typeof segment, { type: 'block' }>;
  assert.equal(block.form, 'lead');
  assert.equal(block.rows[0]?.cells[3], '5000 4500 - 4000 3500 3000', 'whole pounds, a gap as a dash');
  assert.equal(block.rows[1]?.cells.length, 3);
});

test('A FIGURE’S OWN NOTE IS SAID UNDER IT, each figure it names written as that figure is declared', () => {
  const now = Date.UTC(2026, 8, 16, 12);
  const tile = blockOf(
    {
      kind: 'stat', rows: [], matched: 0, refusals: [],
      cells: [{ metric: 'cash-now', label: 'Cash now', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' }],
      readings: [
        {
          metric: 'cash-now', label: 'Cash now', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}',
          reading: { value: 3_385_000, unit: 'GBP', rows: 2, met: true, refusals: [] },
        },
      ],
      /* Two accounts, and the oldest balance on 11 September 2026, as whole days since 1970. */
      values: { 'cash-accounts': 2, 'cash-as-of': Date.UTC(2026, 8, 11) / 86_400_000 },
    },
    new Map(),
    now,
  );
  assert.equal(tile.metrics?.[0]?.note, 'in 2 accounts, as of 11 Sep');
  const one = blockOf(
    {
      kind: 'stat', rows: [], matched: 0, refusals: [],
      readings: [{ metric: 'cash-now', note: 'in {{cash-accounts}} account(s)', reading: { value: 1, unit: 'GBP', rows: 1, met: true, refusals: [] } }],
      values: { 'cash-accounts': 1 },
    },
    new Map(),
    now,
  );
  assert.equal(one.metrics?.[0]?.note, 'in 1 account');
});

test("today on a live page is the record's clock when the record says what it read, and this clock when it does not", async () => {
  const pinned = '2026-03-02T09:00:00.000Z';
  const { io } = host((method) => (method === 'page' ? json(200, { ok: true, value: { ...ANSWER, read_at: pinned } }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.')));
  const out = await pageReader(BASE, io, () => AT).read('desk');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.now, Date.parse(pinned));
  assert.equal(Object.hasOwn(out.page.page, 'read_at'), false, 'the clock is not a key of the page');
  assert.ok(out.page.blocks.every((b) => b.stale_at === pinned), 'a block was read against another clock');

  const unsaid = host((method) => (method === 'page' ? json(200, { ok: true, value: { ...ANSWER, read_at: 'soon' } }) : refusal(404, 'ROUTE_UNKNOWN', 'There is no such method.')));
  const fallback = await pageReader(BASE, unsaid.io, () => AT).read('desk');
  assert.equal(fallback.from === 'live' ? fallback.now : null, AT);
});

test('a page over a list this build does not ship asks the record for that list, and draws it', async () => {
  const answer = {
    page: 'studies',
    title: 'Studies',
    blocks: [{ kind: 'table', source: 'register.homework_x', columns: [{ field: 'what' }], rows: [{ ...row(1, { what: 'Problem set 1' }), register: 'homework_x' }], matched: 1, refusals: [] }],
  };
  const { io, sent } = host((method) =>
    method === 'page'
      ? json(200, { ok: true, value: answer })
      : method === 'schema'
        ? json(200, { ok: true, value: { id: 'homework_x', name: 'Homework', one: 'piece', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } })
        : json(200, { ok: true, value: { rows: [], cursor: null } }),
  );
  const out = await pageReader(BASE, io, () => AT).read('studies');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const [table] = out.page.blocks;
  assert.equal(table!.cannot, undefined);
  assert.equal(table!.rows.length, 1);
  assert.ok(sent.includes('schema'));
});

test('a live feed names its reader as You, anybody else without an id, and a pack or a question in words', () => {
  const me = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const at = '2026-09-16T11:00:00.000Z';
  const { rows } = feedTable(
    [
      { by: 'you', who: me, count: 1, kind: 'delete', target: 'tickets#5', note: null, at, thing: 'Tidy the backlog labels' },
      { by: 'you', who: 'p_01M2PAZ28BN3FTKQB266DVT4HZ', count: 1, kind: 'suggest', target: 'suggestion:SG1', note: null, at },
      { by: 'rule', who: 'system', count: 1, kind: 'install', target: 'pack:usecase-team', note: null, at },
      { by: 'rule', who: 'system', count: 1, kind: 'install', target: 'pack:polish-log', note: null, at },
    ],
    false,
    null,
    Date.parse(at),
    me,
  );
  assert.deepEqual(
    rows.map((r) => [r.cells[1], r.cells[3]]),
    [
      ['You', 'deleted Tidy the backlog labels'],
      ['Someone on this record', 'suggested SG1'],
      ['the record itself', 'installed the Team board use case'],
      ['the record itself', 'installed the polish-log add-on'],
    ],
  );
});

test("A TILE SAYS THE RECORD'S TARGET, not the build's, so a person's Money is not held to a studio's sums", () => {
  const decl = METRICS['out-30d']!;
  const said = (target?: unknown) =>
    blockOf({ kind: 'stat', cells: [{ metric: 'out-30d' }], readings: [{ metric: 'out-30d', reading: { value: 115_749, unit: 'GBP', rows: 7, met: true, refusals: [] }, ...(target === undefined ? {} : { target }) }], rows: [], matched: 0, refusals: [] } as never, new Map(), Date.UTC(2026, 8, 17, 12)).metrics?.[0]?.note;
  assert.match(String(said({ lte: 250_000 })), /2,500\.00/u);
  assert.equal(said(), said(decl.target), 'without one, the build says its own');
});

test("a table over a use case's own lists names each link by the linked row, not as club_books#2", async () => {
  const declared: Record<string, unknown> = {
    pl_meetings: { id: 'pl_meetings', name: 'Meetings', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'book', type: 'ref', to: 'pl_books' }] },
    pl_books: { id: 'pl_books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text' }] },
  };
  const BOOK = '01JBOOK000000000000000002';
  const answer = {
    page: 'club',
    title: 'Club',
    blocks: [{ kind: 'table', source: 'register.pl_meetings', columns: [{ field: 'what' }, { field: 'book' }], rows: [{ ...row(1, { what: 'Stevens and the dinner', book: BOOK }), register: 'pl_meetings' }], matched: 1, refusals: [] }],
  };
  const { io } = host((method, url) => {
    if (method === 'page') return json(200, { ok: true, value: answer });
    if (method === 'schema') return json(200, { ok: true, value: declared[url.searchParams.get('register') ?? ''] });
    if (method === 'list' && url.searchParams.get('register') === 'pl_books')
      return json(200, { ok: true, value: { rows: [{ id: BOOK, seq: 2, fields: { name: 'The Remains of the Day' } }], cursor: null } });
    return json(200, { ok: true, value: { rows: [], cursor: null } });
  });
  const out = await pageReader(BASE, io, () => AT).read('club');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const [table] = out.page.blocks;
  assert.equal(table!.cannot, undefined);
  assert.equal(table!.rows[0]!.cells[1], 'The Remains of the Day');
});
