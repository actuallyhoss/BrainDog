/**
 * The shared page's reading, held without a browser: the link read off the fragment and wiped from the address bar at
 * once, a link that does not open said in one sentence, and each typed cell drawn in the record's language and zone
 * with its amount in its own currency.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AMOUNT_SPACE, parse, toHTML } from 'braindog-render';

import type { SharedBlock, SharedRow } from '../../lib/record/share-write.ts';
import { cellSaid, durationSaid, figureSaid, headOf, moneySaid, noteOpts, plainSaid, pointSaid, shownBlocks, takeShared, trendLine, type Said, type Where } from './reading.ts';

const where: Where = { language: 'en-GB', zone: 'Europe/London', now: Date.parse('2026-10-15T12:00:00Z') };
/** What a cell says, with the writer's own space between a code and its figure read as a plain one. */
const said = (s: Said): string => ('money' in s ? s.money.text : s.text).replaceAll(AMOUNT_SPACE, ' ');

test('the link is read off the fragment once, and the address is wiped first', () => {
  let wiped = 0;
  assert.equal(
    takeShared('#tok_Qm2kLz', () => (wiped += 1)),
    'tok_Qm2kLz',
  );
  assert.equal(wiped, 1);
});

test('an address with no fragment is a link that does not open, and nothing is wiped', () => {
  let wiped = 0;
  assert.equal(
    takeShared('', () => (wiped += 1)),
    '',
  );
  assert.equal(
    takeShared('#  ', () => (wiped += 1)),
    '',
  );
  assert.equal(wiped, 0);
});

test('a dead or closed link reads This page is not shared., and never why', () => {
  assert.deepEqual(headOf({ from: 'shut' }), { title: 'This page is not shared.', line: 'Ask whoever sent the link for a new one.' });
});

test('a live page heads with its name and the day its link stops', () => {
  const page = { title: 'Weekly bakes', expires_at: '2026-11-14T00:00:00.000Z', read_at: '2026-10-15T12:00:00.000Z', language: 'en', zone: 'UTC', home: null, empty: null, layout: null, blocks: [] };
  /* A DAY IN THE YEAR THE RECORD IS IN IS SAID WITHOUT ITS YEAR, as the app says one. */
  assert.deepEqual(headOf({ from: 'live', page }), { title: 'Weekly bakes', line: 'This link works until 14 Nov.' });
  const east = { ...page, expires_at: '2026-11-14T03:00:00.000Z', zone: 'America/New_York' };
  assert.equal(headOf({ from: 'live', page: east }).line, 'This link works until 13 Nov.');
  const next = { ...page, expires_at: '2027-01-02T00:00:00.000Z' };
  assert.equal(headOf({ from: 'live', page: next }).line, 'This link works until 2 Jan 2027.');
});

test('a money cell is drawn whole in its own currency, and turned when its row says it went out', () => {
  const row = {
    cells: { total: { type: 'money', value: { amount: 123450, currency: 'EGP' } }, way: { type: 'enum', value: 'out', label: 'Paid out' } },
    fields: {},
    state: null,
  };
  assert.equal(said(cellSaid(row, { field: 'total' }, where)), 'EGP 1,234.50');
  assert.equal(said(cellSaid(row, { field: 'total', sign: { field: 'way', minus: 'out' } }, where)), '−EGP 1,234.50');
  assert.equal(said(cellSaid(row, { field: 'way' }, where)), 'Paid out');
  /* COMING IN, ITS PLUS KEPT AS THE APP KEEPS IT (AO9). */
  assert.equal(said(cellSaid(row, { field: 'total', sign: { field: 'way', minus: 'in' } }, where)), '+EGP 1,234.50');
  assert.equal(said(figureSaid({ metric: 'arriving-30d', value: 1_149_000, unit: 'GBP', sign: 'in' }, { ...where, home: 'GBP' })), '+£11,490');
  assert.equal(said(figureSaid({ metric: 'leaving-30d', value: 4_304_700, unit: 'GBP', sign: 'out' }, { ...where, home: 'GBP' })), '−£43,047');
  const gbp = moneySaid(999, 'GBP');
  assert.equal(gbp?.text, '£9.99', 'no home: sterling by its own sign');
});

test('a money figure says its currency, and a figure with none says so', () => {
  assert.equal(said(figureSaid({ metric: 'takings', label: 'Takings', value: 4_200_00, unit: 'EGP' }, where)), 'EGP 4,200');
  assert.equal(said(figureSaid({ metric: 'loaves', value: 1200, unit: 'loaves' }, where)), '1,200 loaves');
  assert.equal(said(figureSaid({ metric: 'loaves', value: null, unit: null }, where)), 'No figure');
});

test('numbers follow the record language with Latin digits, not the visitor device', () => {
  assert.equal(plainSaid(1234.5, { ...where, language: 'de-DE' }), '1.234,5');
  assert.equal(plainSaid(1234.5, { ...where, language: 'ar-EG' }).replace(/[^0-9]/gu, ''), '12345');
  assert.equal(plainSaid('2026-10-03', where), '3 Oct');
  assert.equal(plainSaid(true, where), 'Yes');
});

test('a list cell says each value by its type, and a row with no cells falls back to its plain value', () => {
  const row = { cells: { tags: { type: 'list', of: 'day', value: ['2026-10-01', '2026-10-02'] } }, fields: { note: 'Rye on Fridays' }, state: null };
  assert.equal(said(cellSaid(row, { field: 'tags' }, where)), '1 Oct, 2 Oct');
  assert.equal(said(cellSaid(row, { field: 'note' }, where)), 'Rye on Fridays');
});

test('a trend is drawn from three points, a gap left out, and each point said as the figure is', () => {
  const cash = { metric: 'cash', label: 'Cash', value: 8_000_00, unit: 'EGP', trend: [7_000_00, null, 7_500_00, 8_000_00] };
  const line = trendLine(cash);
  assert.equal(line?.length, 4);
  assert.ok(Number.isNaN(line?.[1]));
  assert.equal(trendLine({ ...cash, trend: [1, null, 2] }), null);
  assert.equal(trendLine({ metric: 'cash', value: 1, unit: null }), null);
  assert.equal(pointSaid(cash, 7_500_00, where), 'EGP\u00a07,500');
});

test('an amount in the home currency is its sign alone, any other its own sign, and noughts of pence go', () => {
  const home: Where = { ...where, home: 'GBP' };
  assert.equal(said(figureSaid({ metric: 'owed', value: 405_000, unit: 'GBP' }, home)), '£4,050');
  assert.equal(said(figureSaid({ metric: 'owed', value: 405_000, unit: 'USD' }, home)), '$4,050');
  assert.equal(said(figureSaid({ metric: 'owed', value: 405_000, unit: 'USD' }, { ...where, home: 'CAD' })), '$4,050 USD', 'where the sign is the home one, the code says which');
  const row = { cells: { cost: { type: 'money', value: { amount: 0, currency: 'GBP' } }, bill: { type: 'money', value: { amount: 853_000, currency: 'GBP' } }, part: { type: 'money', value: { amount: 1_240, currency: 'GBP' } } }, fields: {}, state: null };
  assert.equal(said(cellSaid(row, { field: 'cost' }, home)), '£0');
  assert.equal(said(cellSaid(row, { field: 'bill' }, home)), '£8,530');
  assert.equal(said(cellSaid(row, { field: 'part' }, home)), '£12.40');
});

test('effort is said in words, a share sits on its figure, and an agent is named', () => {
  assert.equal(durationSaid(259_200, 'd', 'en-GB'), '3 days');
  assert.equal(durationSaid(86_400, 'd', 'en-GB'), '1 day');
  assert.equal(durationSaid(17_280, 'd', 'en-GB'), '5 hours');
  assert.equal(durationSaid(129_600, 'd', 'en-GB'), '1.5 days');
  const row = {
    cells: { effort: { type: 'duration', value: 172_800, unit: 'd' }, progress: { type: 'decimal', value: 60, unit: '%' }, agent: { type: 'text', value: 'claude' } },
    fields: {},
    state: null,
  };
  assert.equal(said(cellSaid(row, { field: 'effort' }, where)), '2 days');
  assert.equal(said(cellSaid(row, { field: 'progress' }, where)), '60%');
  assert.equal(said(cellSaid(row, { field: 'agent' }, where)), 'Claude');
  assert.equal(said(figureSaid({ metric: 'done', value: 42, unit: '%' }, where)), '42%');
  /* A FIGURE SAID AS ITS FORMAT (SB1): a day held as days since 1970, a count of days, a share. */
  assert.equal(said(figureSaid({ metric: 'runs-out-on', value: 20_756, unit: null, format: 'day' }, where)), '30 Oct');
  assert.equal(said(figureSaid({ metric: 'runway-days', value: 57, unit: null, format: 'days' }, where)), '57 days');
  assert.equal(said(figureSaid({ metric: 'kept', value: 0.625, unit: null, format: 'pct' }, where)), '62.5%');
});

const block = (b: Partial<SharedBlock>): SharedBlock => ({ kind: 'table', heading: null, lead: false, body: null, empty: null, span: null, refused: null, columns: [], rows: [], matched: 0, readings: [], authored: [], area: 'main', done: null, ...b });

test('a block with nothing in it is no tile, the opening line is under the title, and a blank column or row is left out', () => {
  const keys = { cells: { scope: { type: 'text', value: 'All' } }, fields: {}, state: null };
  const tool = { cells: { name: { type: 'text', value: 'Specimen proofer' } }, fields: {}, state: null };
  const page = shownBlocks(
    [
      block({ kind: 'project', heading: 'Overview' }),
      block({ kind: 'note', lead: true, body: 'Settle how Kiln is licensed' }),
      block({ kind: 'kpis', heading: 'Key numbers' }),
      block({ kind: 'section', heading: 'Runs on' }),
      block({ kind: 'cards', heading: 'Keys', columns: [{ field: 'name', label: 'Name' }, { field: 'scope', label: 'Applies to' }], rows: [keys], matched: 1 }),
      block({ kind: 'cards', heading: 'Tools', columns: [{ field: 'name', label: 'Name' }, { field: 'note', label: 'Note' }], rows: [tool, keys], matched: 3 }),
      block({ kind: 'steps', heading: 'The road', empty: 'Kiln has no stages yet.' }),
      block({ kind: 'section', heading: 'Nothing under me' }),
    ],
    where,
  );
  assert.equal(page.lead, 'Settle how Kiln is licensed');
  /* AND AN EMPTY BLOCK'S OWN SENTENCE IS THE OWNER'S, so "The road: Kiln has no stages yet." is no tile either (AF18). */
  assert.deepEqual(page.blocks.map((s) => s.block.heading), ['Runs on', 'Tools']);
  const tools = page.blocks[1]!;
  assert.deepEqual(tools.columns.map((c) => c.label), ['Name']);
  assert.equal(tools.rows.length, 1);
  assert.equal(tools.matched, 2);
});

test('a tool or a skill filed as a handle is said by its name, as the owner reads it', () => {
  const row = (name: string) => ({ cells: { name: { type: 'text', value: name } }, fields: {}, state: null }) as unknown as SharedRow;
  assert.equal(said(cellSaid(row('outline-check'), { field: 'name' }, where)), 'Outline check');
  assert.equal(said(cellSaid(row('fenwick'), { field: 'name' }, where)), 'Fenwick');
  assert.equal(said(cellSaid(row('kiln.example'), { field: 'name' }, where)), 'kiln.example');
  assert.equal(said(cellSaid(row('Fenwick deploy key'), { field: 'name' }, where)), 'Fenwick deploy key');
});

test('a shared note never links into the record, and keeps the links that leave it', () => {
  const body = [
    'See [the plan](/r/things/1), **[the list](/r/tasks)** and [the site](https://example.com).',
    '',
    '```link',
    'Board | /r/projects/2',
    'Docs | https://docs.example.com',
    '```',
  ].join('\n');
  const html = toHTML(parse(body, { page: true }), noteOpts({ language: 'en', zone: 'UTC', now: Date.parse('2026-10-30T09:00:00Z') }));
  assert.doesNotMatch(html, /href="\/r\//u);
  assert.match(html, /the plan/u);
  assert.match(html, /Board/u);
  assert.match(html, /href="https:\/\/example\.com"/u);
  assert.match(html, /href="https:\/\/docs\.example\.com"/u);
});
