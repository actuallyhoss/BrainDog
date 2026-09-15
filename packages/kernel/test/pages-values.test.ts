/**
 * A page's live figures, answered by the record.
 *
 * `{{path}}` outside a template was the browser's to fill, from numbers it worked out from its own copy
 * of the record. The page answer carries them now: a metric's reading, a row's field by spoken id, and a
 * register's count. Nothing else, and never a property the row does not own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
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
