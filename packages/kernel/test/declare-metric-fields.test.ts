/**
 * A METRIC NAMES FIELDS, AND THE REGISTER IT READS HAS TO DECLARE THEM.
 *
 * The checker of `loop/research-pack-update-edited.md` installed `value: { sum: 'nosuch' }` in an
 * ordinary install and it went in. The evaluator in `metrics.ts` has always refused that figure as
 * `FIELD_UNKNOWN` when it is READ, so the mistake installed clean and then answered a refusal on every
 * page the figure sat on, which is the author told nothing at the one moment they could fix it.
 * `unaggregatableIn` at install looked the field's type up, found none, and took "no type" as "no
 * objection". These cases are the ones the reader refuses, asked one moment earlier.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'int' },
      { id: 'party', type: 'text' },
      { id: 'kind', type: 'enum', values: ['in', 'out'] },
    ],
  },
} as never;

const metric = (extra: Record<string, unknown>): Declaration =>
  ({
    id: 'metric.total',
    kind: 'metric',
    body: { metric: 'total', name: 'Total', source: 'register.ledger', value: { sum: 'amount' }, format: 'int', target: { gte: 0 }, window: '30d', ...extra },
  }) as never;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([LEDGER]);
  assert.ok(out.ok);
  return { k, sql };
}

type Said = { code: string; fix: string; at?: string };
const answer = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: Said };
  return x.ok ? 'installed' : `${x.refusal!.code} at ${String(x.refusal!.at)}`;
};

test('A FIGURE OVER A FIELD THE REGISTER DOES NOT DECLARE IS REFUSED AT INSTALL, as the reader refuses it', async () => {
  const { k, sql } = await record();
  for (const [value, why] of [
    [{ sum: 'nosuch' }, 'sum'],
    [{ avg: 'nosuch' }, 'avg'],
    [{ min: 'nosuch' }, 'min'],
    [{ max: 'nosuch' }, 'max'],
    [{ count: 'nosuch' }, 'count'],
    [{ distinct: 'nosuch' }, 'distinct'],
    [{ ratio: { of: { sum: 'amount' }, per: { sum: 'nosuch' } } }, 'the second half of a ratio'],
    [{ diff: { of: { sum: 'nosuch' }, per: { sum: 'amount' } } }, 'the first half of a diff'],
    [{ sum: { product: ['amount', { lookup: 'rate', by: 'nosuch' }] } }, "a product's by"],
  ] as const) {
    const extra = 'sum' in value && typeof value.sum === 'object' ? { lookups: { rate: { in: 1, out: -1 } } } : {};
    assert.equal(answer(await k.install([metric({ value, ...extra })])), 'FIELD_UNKNOWN at value', why);
  }
  assert.equal(answer(await k.install([metric({ group_by: 'nosuch' })])), 'FIELD_UNKNOWN at group_by');
  sql.close();
});

/* A RETIRED FIELD IS STILL IN THE REGISTER'S BODY, and it is not in the schema the reader is handed:
   `index.ts`'s `schemaOf` drops it. Measured by the checker of this change: with the retired field
   counted as declared, `sum: 'old'` and `group_by: 'old'` both installed and then answered
   `FIELD_UNKNOWN: ledger has no field called old` on the first read, which is the defect above again. */
test('A FIELD THE REGISTER HAS RETIRED IS REFUSED AT INSTALL, because the reader no longer sees it', async () => {
  const { k, sql } = await record();
  const body = LEDGER.body as { fields: object[] };
  const retiring = { ...LEDGER, body: { ...body, fields: [...body.fields, { id: 'old', type: 'text', retired: true }] } } as never;
  assert.equal(answer(await k.install([retiring])), 'installed');
  assert.equal(answer(await k.install([metric({ value: { count: 'old' } })])), 'FIELD_UNKNOWN at value');
  assert.equal(answer(await k.install([metric({ group_by: 'old' })])), 'FIELD_UNKNOWN at group_by');
  sql.close();
});

test('A PREDICATE OVER AN UNDECLARED FIELD WAS ALREADY REFUSED, and stays so', async () => {
  const { k, sql } = await record();
  assert.match(answer(await k.install([metric({ where: { field: 'nosuch', is: 'x' } })])), /^FIELD_UNKNOWN/);
  sql.close();
});

test('WHAT THE READER ACCEPTS STILL INSTALLS: declared fields, `id`, and a register arriving in the same batch', async () => {
  const { k, sql } = await record();
  for (const extra of [
    {},
    { value: { count: 'id' } },
    { value: { ratio: { of: { sum: 'amount' }, per: { count: 'id' } } } },
    { value: { sum: { product: ['amount', { lookup: 'rate', by: 'kind' }] } }, lookups: { rate: { in: 1, out: -1 } } },
    { group_by: 'party' },
    { where: { field: 'created_at', after: '-7d' } },
  ])
    assert.equal(answer(await k.install([metric(extra)])), 'installed', JSON.stringify(extra));

  const fresh = { ...LEDGER, id: 'register.fresh', body: { ...(LEDGER.body as object), id: 'fresh', name: 'Fresh' } } as never;
  assert.equal(answer(await k.install([fresh, metric({ source: 'register.fresh' })])), 'installed');
  assert.equal(answer(await k.install([fresh, metric({ source: 'register.fresh', value: { sum: 'nosuch' } })])), 'FIELD_UNKNOWN at value');
  sql.close();
});
