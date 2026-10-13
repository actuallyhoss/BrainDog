/**
 * A page's live figures, answered by the record.
 *
 * `{{path}}` outside a template was the browser's to fill, from numbers it worked out from its own copy
 * of the record. The page answer carries them now: a metric's reading, a row's field by spoken id, and a
 * register's count. Nothing else, and never a property the row does not own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { pathsOf, type PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'notes', type: 'document' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], required: true },
    ],
  } as never,
};

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const OPEN_COUNT: Declaration = {
  id: 'metric.open-count',
  kind: 'metric',
  body: { metric: 'open-count', name: 'Open', source: 'register.obligations', where: 'state is open', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.obligations'], blocks } as never,
});

const TEMPLATE: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things' },
    requires: ['register.things'],
    blocks: [{ kind: 'note', heading: '{{constructor}} of {{name}}', body: 'x' }],
  } as never,
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([OBLIGATIONS, THINGS, OPEN_COUNT, ...decls]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const row of [
    { what: 'Rent', amount: gbp(120_000), due: '2026-09-01', notes: 'A long paragraph about the lease.', state: 'open' },
    { what: 'Paid one', amount: gbp(900), due: '2026-08-01', state: 'paid' },
  ])
    assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Kiln' }, { actor: 'p_1' }).ok);
  return { k, sql };
}

const blocksOf = (r: unknown): Record<string, unknown>[] => (r as { ok: true; value: { blocks: Record<string, unknown>[] } }).value.blocks;

test('A PAGE’S LIVE FIGURES COME WITH THE ANSWER, keyed by the path as written', async () => {
  const { k, sql } = await record(
    pageOf({
      kind: 'note',
      heading: 'Open: {{open-count}}',
      body: 'Rent is {{obligations#1.amount}}, due {{ago:obligations#1.due}}, one of {{obligations.count}}.',
    }),
  );
  const out = k.page('desk');
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(blocksOf(out)[0]?.values, {
    'open-count': 1,
    'obligations#1.amount': gbp(120_000),
    'obligations#1.due': '2026-09-01',
    'obligations.count': 2,
  });
  sql.close();
});

test('and only what the record holds, read from the row’s own properties', async () => {
  const body = [
    '{{obligations#1.constructor}}',
    '{{obligations#1.__proto__}}',
    '{{obligations#1.notes}}',
    '{{obligations#9.what}}',
    '{{obligations.oldest_unpaid}}',
    '{{nobody#1.what}}',
    '{{no-such-figure}}',
    '{{toString}}',
    '`{{obligations#1.what}}`',
    '{{money:1840000 GBP}}',
    '{{ref:obligations#1}}',
  ].join(' ');
  const block = { kind: 'note', body };
  const { k, sql } = await record(pageOf(block));
  assert.equal(blocksOf(k.page('desk'))[0]?.values, undefined, 'a path the record holds nothing for was answered');

  /* A CODE SPAN IS TEXT, and a typed form's literal is the author's value, so neither is asked. */
  const asked = pathsOf(block as PageBlock);
  assert.ok(!asked.includes('obligations#1.what'), 'a path inside backticks was asked');
  assert.ok(!asked.some((p) => p.includes('1840000') || p === 'obligations#1'), 'a literal was read as a path');
  sql.close();
});

test('a block that does not draw reads no figures', async () => {
  const { k, sql } = await record(pageOf({ kind: 'note', body: '{{open-count}}', when: { metric: 'open-count', gt: 99 } }));
  const [block] = blocksOf(k.page('desk'));
  assert.equal(block?.drawn, false);
  assert.equal(block?.values, undefined);
  sql.close();
});

test('a figure in a block names its register, so a scoped page can blank it', async () => {
  const { k, sql } = await record();
  assert.deepEqual(k.blockRegisters({ kind: 'note', body: '{{obligations#1.what}}' } as PageBlock), ['obligations']);
  assert.deepEqual(k.blockRegisters({ kind: 'note', heading: '{{open-count}}' } as PageBlock), ['obligations']);
  assert.deepEqual(k.blockRegisters({ kind: 'note', empty: 'None of {{things.count}}' } as PageBlock), ['things']);
  sql.close();
});

test('A TEMPLATE FILLS FROM THE ROW’S OWN FIELDS, and says which row its page is about', async () => {
  const { k, sql } = await record(TEMPLATE);
  const out = k.page('kiln');
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual((out.value as { param?: unknown }).param, { register: 'things', seq: 1, title: 'Kiln' });
  assert.equal(blocksOf(out)[0]?.heading, '{{constructor}} of Kiln', 'a name the row does not own was filled from the prototype');
  sql.close();
});

/* ── how a figure in a sentence was converted (rates-foot-note-80) ───────────────────────────────── */

const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const OWED: Declaration = {
  id: 'metric.owed',
  kind: 'metric',
  body: { metric: 'owed', name: 'Owed', source: 'register.obligations', where: 'state is open', value: { sum: 'amount' }, format: 'money', target: { lte: 99_999_999 }, window: '30d' } as never,
};

const SENTENCE = pageOf({ kind: 'note', body: 'You owe {{owed}} over {{open-count}} bills.' });

/** The record above with a home currency of pounds and, when `dollars`, an open bill in dollars beside the rent. */
async function abroad(dollars: boolean, rateDay?: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const { k, sql } = await record(FX, OWED, SENTENCE);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' }).ok);
  if (dollars) assert.ok(k.create('obligations', { what: 'Hosting', amount: { amount: 10_000, currency: 'USD' }, due: '2026-09-20', state: 'open' }, { actor: 'p_1' }).ok);
  if (rateDay !== undefined) assert.ok(k.create('fx', { currency: 'USD', base: 'GBP', rate: 0.5, as_of: rateDay }, { actor: 'p_1' }).ok);
  return { k, sql };
}

test('A FIGURE IN A SENTENCE SAYS HOW IT WAS CONVERTED, beside its amount: the day of its oldest rate, and whether that is out of date', async () => {
  const old = await abroad(true, '2026-08-01');
  const [stale] = blocksOf(old.k.page('desk'));
  assert.deepEqual(stale?.values, { owed: gbp(125_000), 'open-count': 2 });
  const how = stale?.values_fx as Record<string, { asOf: string | null; stale: boolean; into: string | null; missing: string[] }>;
  /* ONLY THE PATH THAT WAS CONVERTED, by the path as written. A count used no rate, so it says nothing. */
  assert.deepEqual(Object.keys(how), ['owed']);
  assert.deepEqual([how.owed!.asOf, how.owed!.stale, how.owed!.into, how.owed!.missing], ['2026-08-01', true, 'GBP', []]);
  old.sql.close();

  const fresh = await abroad(true, '2026-09-14');
  const [live] = blocksOf(fresh.k.page('desk'));
  const now = live?.values_fx as Record<string, { asOf: string | null; stale: boolean }>;
  assert.deepEqual([now.owed!.asOf, now.owed!.stale], ['2026-09-14', false]);
  fresh.sql.close();
});

test('NOTHING IS SAID OF A FIGURE NO RATE WENT INTO: one currency, a figure left in parts, or a record with no home currency', async () => {
  /* EVERY AMOUNT ALREADY IN POUNDS: the sum used no rate, so it has no day to be out of date at. */
  const home = await abroad(false, '2026-08-01');
  const [plain] = blocksOf(home.k.page('desk'));
  assert.deepEqual(plain?.values, { owed: gbp(120_000), 'open-count': 1 });
  assert.equal(plain?.values_fx, undefined);
  home.sql.close();

  /* NO RATE FOR THE DOLLARS: the figure is each of its amounts, and a figure in parts is never said as converted. */
  const none = await abroad(true);
  const [parts] = blocksOf(none.k.page('desk'));
  assert.ok(Array.isArray(parts?.values && (parts.values as Record<string, unknown>).owed), JSON.stringify(parts?.values));
  assert.equal(parts?.values_fx, undefined);
  none.sql.close();

  /* AND THE RECORD AT THE TOP OF THIS FILE, with no home currency, sends none on any block. */
  const { k, sql } = await record(pageOf({ kind: 'note', body: 'Rent is {{obligations#1.amount}} of {{open-count}}.' }));
  assert.equal(blocksOf(k.page('desk'))[0]?.values_fx, undefined);
  sql.close();
});
