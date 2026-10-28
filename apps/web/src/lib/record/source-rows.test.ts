/**
 * A SOURCE THIS BUILD HAS NEVER HEARD OF DRAWS BY ITS FIELDS. Before, a block over any source with no arm
 * in `page-live.ts` came back as the line saying it cannot be drawn, so the record's `lists` (every list with its count)
 * drew nothing until somebody wrote an arm for it. These hold that a planted `lists` answer lays out as three columns,
 * name, count and changed, with whole counts; that money goes through the one money writer; that a record that sent no
 * types is read by each value; and that no cell or link is ever an id.
 *
 * Invented names only, written here: the lists are a kiln log, glaze tests and firings.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeAmount } from 'braindog-render';

import './fixtures/fill.ts';
import { blockOf } from './page-live.ts';
import { cellOf, sourceRows, typeOfValue } from './source-rows.ts';

const AT = Date.parse('2026-10-15T12:00:00.000Z');
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/u;

const row = (id: string, fields: Record<string, unknown>, seq: number | null = null, register = 'lists') => ({
  id,
  register,
  seq,
  fields,
  state: null,
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-15T09:00:00.000Z',
  deleted_at: null,
});

/* THE SHAPE `lists` ANSWERS: `list` the handle, `name` what a person reads, `count` and `changed`. */
const LISTS = {
  kind: 'table',
  heading: 'What the record holds',
  source: 'lists',
  rows: [
    row('lists:kiln_log', { list: 'kiln_log', name: 'Kiln log', count: 2527, changed: '2026-10-15T08:00:00.000Z' }),
    row('lists:glaze_tests', { list: 'glaze_tests', name: 'Glaze tests', count: 217, changed: '2026-10-14T12:00:00.000Z' }),
    row('lists:firings', { list: 'firings', name: 'Firings', count: 752, changed: null }),
  ],
  matched: 3,
  refusals: [],
  types: { list: 'text', name: 'text', count: 'int', changed: 'instant' },
};

test('A PLANTED `lists` ANSWER LAYS OUT AS THREE COLUMNS, name, count and changed, with whole counts', () => {
  const laid = sourceRows(LISTS, LISTS, { now: AT });
  assert.ok(laid);
  assert.deepEqual(
    laid.columns.map((c) => [c.field, c.label, c.type]),
    [
      ['name', 'Name', 'text'],
      ['count', 'Count', 'int'],
      ['changed', 'Changed', 'instant'],
    ],
  );
  assert.deepEqual(
    laid.rows.map((r) => r.slice(0, 2)),
    [
      ['Kiln log', '2,527'],
      ['Glaze tests', '217'],
      ['Firings', '752'],
    ],
  );
  /* A LIST NEVER CHANGED SAYS NOTHING, never a made-up day. */
  assert.equal(laid.rows[2]![2], null);
  assert.equal(typeof laid.rows[0]![2], 'string');
  /* NO ROW OF `lists` IS A ROW OF A LIST, so none links anywhere. */
  assert.deepEqual(laid.links, [null, null, null]);
});

test('A MONEY COLUMN GOES THROUGH THE ONE MONEY WRITER, in the record home currency', () => {
  const answer = {
    source: 'spend.by_kiln',
    rows: [row('k1', { kiln: 'Small kiln', spent: { amount: 1_240_050, currency: 'GBP' } }, null, 'spend.by_kiln'), row('k2', { kiln: 'Big kiln', spent: { amount: -5000, currency: 'EUR' } }, null, 'spend.by_kiln')],
    types: { kiln: 'text', spent: 'money' },
  };
  const laid = sourceRows(answer, answer, { now: AT, home: 'GBP' });
  assert.ok(laid);
  assert.deepEqual(
    laid.rows.map((r) => r[1]),
    [writeAmount({ minor: 1_240_050, currency: 'GBP' }, 'GBP', 'exact')!.text, writeAmount({ minor: -5000, currency: 'EUR' }, 'GBP', 'exact')!.text],
  );
  /* A float is no amount of money: said as nothing, never rounded to a penny nobody has. */
  assert.equal(cellOf('money', { amount: 1.5, currency: 'GBP' }), null);
});

test('WITH NO TYPES SENT, EACH COLUMN IS READ BY ITS VALUES, and a day is said in the house words', () => {
  const answer = {
    source: 'firings.next',
    rows: [row('f1', { firing: 'Bisque', on: '2026-10-20', pots: 14, cost: { amount: 3000, currency: 'GBP' }, ready: true }, null, 'firings.next')],
  };
  const laid = sourceRows(answer, answer, { now: AT, home: 'GBP' });
  assert.ok(laid);
  assert.deepEqual(
    laid.columns.map((c) => c.type),
    ['text', 'day', 'int', 'money', 'bool'],
  );
  assert.equal(laid.rows[0]![1], '20 Oct 2026');
  assert.equal(laid.rows[0]![2], '14');
  assert.equal(typeOfValue('2026-10-15T09:00:00.000Z'), 'instant');
  assert.equal(typeOfValue(2.5), 'decimal');
  /* A NEGATIVE DECIMAL WEARS THE HOUSE MINUS, as a whole number does, never a hyphen. */
  assert.equal(cellOf('decimal', -2.5), '\u22122.5');
  assert.equal(cellOf('int', -3), '\u22123');
});

test('NEVER AN ID: a link field and a row id are no column, and a value that is an id draws as nothing', () => {
  const answer = {
    source: 'glazes.used',
    rows: [row('g1', { glaze: 'Celadon', pot: '01JPOTAAAAAAAAAAAAAAAAAAAA', id: 'g1' }, null, 'glazes.used')],
    types: { glaze: 'text', pot: 'ref', id: 'text' },
  };
  const laid = sourceRows(answer, answer);
  assert.ok(laid);
  assert.deepEqual(laid.columns.map((c) => c.field), ['glaze']);
  /* Even a column the block names itself says nothing for an id. */
  const named = sourceRows(answer, { source: 'glazes.used', columns: [{ field: 'glaze', label: 'Glaze' }, { field: 'pot', label: 'Pot' }] });
  assert.ok(named);
  assert.deepEqual(named.rows, [['Celadon', null]]);
  assert.deepEqual(named.columns.map((c) => c.label), ['Glaze', 'Pot']);
});

test('A ROW OF A LIST LINKS TO ITS OWN PAGE; a row with no number does not', () => {
  const answer = {
    source: 'pots.cracked',
    rows: [row('01JPOTBBBBBBBBBBBBBBBBBBBB', { name: 'Tall jug' }, 12, 'pots'), row('01JPOTCCCCCCCCCCCCCCCCCCCC', { name: 'Low bowl' }, null, 'pots')],
    types: { name: 'text' },
  };
  assert.deepEqual(sourceRows(answer, answer)!.links, ['/r/pots/12', null]);
});

test('nothing to read is no layout, so the block says it cannot be drawn as before', () => {
  assert.equal(sourceRows({ rows: 'nope' }, {}), null);
  assert.equal(sourceRows({ rows: [row('x', { id: 'x' })], source: 'lists' }, { source: 'lists' }), null);
});

/* ── through the page reader ─────────────────────────────────────────────── */

test('A TABLE OVER `lists` IS DRAWN BY THE PAGE, three columns and whole counts, no line saying it cannot be', () => {
  const block = blockOf(LISTS as never, new Map(), AT);
  assert.equal(block.cannot, undefined);
  assert.deepEqual(block.columns.map((c) => c.label), ['Name', 'Count', 'Changed']);
  assert.deepEqual(block.rows.map((r) => r.cells[1]), ['2,527', '217', '752']);
  assert.equal(block.columns[1]!.align, 'end');
  assert.equal(block.shown, 3);
  assert.ok(block.rows.every((r) => r.href === undefined));
  const cells = block.rows.flatMap((r) => r.cells).filter((c): c is string => c !== null);
  assert.ok(!cells.some((c) => ULID.test(c) || c.startsWith('lists:')), cells.join(' | '));
});

test('THE PAGE WRITES MONEY IN THE HOME CURRENCY THE RECORD ANSWERED on the block', () => {
  const answer = {
    kind: 'table',
    source: 'spend.by_kiln',
    home: 'EUR',
    rows: [row('k1', { kiln: 'Small kiln', spent: { amount: -5000, currency: 'EUR' } }, null, 'spend.by_kiln')],
    types: { kiln: 'text', spent: 'money' },
    matched: 1,
    refusals: [],
  };
  const block = blockOf(answer as never, new Map(), AT);
  assert.equal(block.rows[0]!.cells[1], writeAmount({ minor: -5000, currency: 'EUR' }, 'EUR', 'exact')!.text);
  assert.equal(block.columns[1]!.align, 'end');
});

test('a kind that is not a table, list or rows over an unknown source still says it cannot be drawn', () => {
  const block = blockOf({ ...LISTS, kind: 'bar' } as never, new Map(), AT);
  assert.equal(typeof block.cannot, 'string');
});
