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
import { ROWS } from './api.ts';
import { toSegments } from './blocks.ts';
import { liveWords, pageReader, resolverOf, type Fetch } from './page-live.ts';

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
