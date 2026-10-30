/**
 * A payee's tally counts payments, not the parts of a split one (review of 30 October, R14).
 *
 * AS SEEN: one £90 payment split across three categories drew "3 times · last 24 Aug" on its payee's bar, in the record's
 * grouped read and in the walk alike, since both add a split row up as its parts and counted each part as a row. The
 * amount is right as parts; the count is of rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { readBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 3, 12);

const SPENDS: Declaration = {
  id: 'register.spends',
  kind: 'register',
  body: {
    id: 'spends',
    name: 'Spends',
    title: 'payee',
    fields: [
      { id: 'payee', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'category', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'parts', type: 'json', parts_of: 'amount' },
    ],
  } as never,
};

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

type Line = { label: unknown; rows: number; last?: string };
type Answered = { refusals?: unknown[]; wholeRead?: { rows: Line[] } };

test('ONE SPLIT PAYMENT IS ONCE ON ITS PAYEE’S BAR, in the grouped read and in the walk', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([SPENDS])).ok);
  const split = k.create(
    'spends',
    {
      payee: 'Corner Shop',
      on: '2026-08-24',
      amount: gbp(9_000),
      parts: [
        { category: 'Food', amount: gbp(4_000) },
        { category: 'Home', amount: gbp(3_000) },
        { category: 'Gifts', amount: gbp(2_000) },
      ],
    },
    { actor: 'p_1' },
  );
  assert.ok(split.ok, JSON.stringify(split));
  assert.ok(k.create('spends', { payee: 'Corner Shop', on: '2026-08-20', category: 'Food', amount: gbp(500) }, { actor: 'p_1' }).ok);

  const block = { kind: 'bar', source: 'register.spends', columns: [{ field: 'payee' }, { field: 'amount' }], tally: true } as never;
  const grouped = k.block(block) as Answered;
  assert.deepEqual(grouped.refusals, []);
  const shop = grouped.wholeRead?.rows.find((r) => r.label === 'Corner Shop');
  assert.equal(shop?.rows, 2, 'the split payment is one row, and the plain one another');
  assert.equal(shop?.last, '2026-08-24');

  const deps = {
    pages: () => [],
    metric: () => null,
    read: () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no such figure.' } }),
    list: (q: Record<string, unknown>) => {
      const out = k.list(q as never);
      return out.ok ? { ok: true, value: { rows: out.value.rows, matched: out.value.matched, cursor: out.value.cursor } } : out;
    },
    schemaOf: (register: string) => k.schemaOf(register),
    titleOf: () => 'payee',
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: (register: string) => k.schemaOf(register) },
  } as unknown as PageDeps;
  const walk = readBlock(deps, block) as Answered;
  assert.deepEqual(walk.refusals, []);
  assert.equal(walk.wholeRead?.rows.find((r) => r.label === 'Corner Shop')?.rows, 2);
  sql.close();
});
