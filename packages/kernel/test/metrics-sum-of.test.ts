/**
 * A FIGURE THAT ADDS OTHER FIGURES: `{ sum_of: [{ metric }, { metric, minus: true }] }`.
 *
 * Money's net position is cash less what is owed out, and Every month's difference is what comes in less what goes out:
 * each is a sum of figures the record already has. The parts are read as any page reads them and added as any sum is,
 * so two currencies convert, are at least, or come back in parts, and are never added as they are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { PROJECTS } from '../../../fixtures/names.ts';
import { evaluateMetric, openRecord, type Declaration, type EvalContext, type MetricDecl, type Rate, type Reading } from '../src/index.ts';
import { SUM_OF_PARTS_MOST, isSumOf, sumOfFault, type SumOf } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 20, 12);

const POTS: Declaration = {
  id: 'register.pots',
  kind: 'register',
  body: {
    id: 'pots',
    name: 'Pots',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['a', 'b', 'c', 'd'], index: true },
      { id: 'amount', type: 'money', required: true },
    ],
  },
} as never;

const SCHEMA = (() => {
  const body = POTS.body as unknown as { id: string; fields: { id: string }[] };
  return { register: body.id, fields: Object.fromEntries(body.fields.map(({ id, ...field }) => [id, field])) } as unknown as Schema;
})();

const figure = (metric: string, extra: Record<string, unknown>): MetricDecl =>
  ({ metric, name: metric, source: 'register.pots', target: { gte: 0 }, window: '30d', compare: 'none', format: 'money', ...extra }) as unknown as MetricDecl;
const pot = (kind: string): MetricDecl => figure(`pot-${kind}`, { where: `kind is ${kind}`, value: { sum: 'amount' } });
const COUNTED = figure('pot-count', { value: { count: 'id' }, format: 'int' });

const sumOf = (parts: SumOf['sum_of'], extra: Record<string, unknown> = {}): MetricDecl =>
  ({ metric: 'net', name: 'Net position', source: 'register.pots', value: { sum_of: parts }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none', ...extra }) as unknown as MetricDecl;

async function record(): Promise<NodeSql> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const decl = (body: MetricDecl): Declaration => ({ id: `metric.${body.metric}`, kind: 'metric', body }) as never;
  const installed = await k.install([POTS, decl(pot('a')), decl(pot('b')), decl(pot('c')), decl(pot('d')), decl(COUNTED)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [i, kind, amount] of [
    [0, 'a', { amount: 100_000, currency: 'GBP' }],
    [1, 'b', { amount: 250_000, currency: 'GBP' }],
    [2, 'c', { amount: 40_000, currency: 'GBP' }],
    [3, 'd', { amount: 10_000, currency: 'USD' }],
  ] as const)
    assert.ok(k.create('pots', { name: PROJECTS[i], kind, amount }, { actor: 'p_1' }).ok);
  return sql;
}

const ctxWith = (home: string | null, rates: readonly Rate[] = []): EvalContext => ({
  nowMs: NOW,
  schemaOf: (id) => (id === 'pots' ? SCHEMA : null),
  fx: () => ({ home, rates }),
});

const read = (sql: NodeSql, decl: MetricDecl, ctx: EvalContext): Reading => {
  const out = evaluateMetric(sql, decl, ctx);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

const dollar: Rate = { currency: 'USD', base: 'GBP', rate: 0.8, as_of: '2026-09-19' };

test('THREE PARTS IN POUNDS, ONE TAKEN AWAY, are their signed sum, with the parts’ entries counted', async () => {
  const sql = await record();
  const net = read(sql, sumOf([{ metric: 'pot-a' }, { metric: 'pot-b' }, { metric: 'pot-c', minus: true }]), ctxWith('GBP'));
  assert.deepEqual([net.value, net.unit], [100_000 + 250_000 - 40_000, 'GBP']);
  assert.equal(net.rows, 3);
  assert.equal(net.met, true);
  assert.equal(net.delta, null);
  assert.equal(isSumOf({ sum_of: [] }), true);
  assert.equal(isSumOf({ sum: 'amount' }), false);
  sql.close();
});

test('POUNDS AND DOLLARS WITH A RATE CONVERT into the home currency', async () => {
  const sql = await record();
  const net = read(sql, sumOf([{ metric: 'pot-a' }, { metric: 'pot-d' }]), ctxWith('GBP', [dollar]));
  assert.deepEqual([net.value, net.unit], [100_000 + 8_000, 'GBP']);
  sql.close();
});

test('WITH NO RATE THE SUM IS AT LEAST, and with no home currency it comes back in parts: never one added total', async () => {
  const sql = await record();
  const least = read(sql, sumOf([{ metric: 'pot-a' }, { metric: 'pot-d' }]), ctxWith('GBP'));
  assert.equal(least.value, null);
  assert.equal(least.atLeast, true);
  assert.deepEqual(least.noRate, [{ currency: 'USD', amount: 10_000 }]);
  assert.deepEqual(least.parts?.[0], { currency: 'GBP', amount: 100_000 });
  assert.deepEqual(least.fx?.missing, ['USD to GBP']);

  const apart = read(sql, sumOf([{ metric: 'pot-a' }, { metric: 'pot-d' }]), ctxWith(null));
  assert.equal(apart.value, null);
  assert.equal(apart.atLeast, undefined);
  assert.deepEqual(apart.parts, [
    { currency: 'GBP', amount: 100_000 },
    { currency: 'USD', amount: 10_000 },
  ]);

  /* AN UNPRICED AMOUNT TAKEN AWAY IS NO LOWER BOUND, so it is parts and never at least. */
  const less = read(sql, sumOf([{ metric: 'pot-a' }, { metric: 'pot-d', minus: true }]), ctxWith('GBP'));
  assert.equal(less.atLeast, undefined);
  assert.deepEqual(less.parts, [
    { currency: 'GBP', amount: 100_000 },
    { currency: 'USD', amount: -10_000 },
  ]);
  sql.close();
});

test('A PART NOBODY INSTALLED, A COMPARISON AND A SUM OF ITSELF ARE REFUSED when read', async () => {
  const sql = await record();
  const ctx = ctxWith('GBP');
  const code = (decl: MetricDecl): string => {
    const out = evaluateMetric(sql, decl, ctx);
    return out.ok ? 'read' : 'refusal' in out ? out.refusal.code : 'conflict';
  };
  assert.equal(code(sumOf([{ metric: 'pot-a' }, { metric: 'pot-z' }])), 'METRIC_UNKNOWN');
  assert.equal(code(sumOf([{ metric: 'pot-a' }], { compare: 'previous' })), 'DECLARATION_INVALID');
  assert.equal(code(sumOf([{ metric: 'net' }])), 'DECLARATION_INVALID');
  assert.equal(code(sumOf([{ metric: 'pot-a' }, { metric: 'pot-count' }])), 'DECLARATION_INVALID');
  sql.close();
});

test('THE CHECK REFUSES ITSELF, A PART NOT INSTALLED, MONEY BESIDE A COUNT, TOO MANY PARTS AND A CHAIN FOUR DEEP', () => {
  const bodies = new Map<string, MetricDecl>([pot('a'), pot('b'), COUNTED].map((d) => [d.metric, d]));
  const chain = (id: string, of: string): MetricDecl => ({ ...sumOf([{ metric: of }]), metric: id });
  for (const [id, of] of [['one', 'pot-a'], ['two', 'one'], ['three', 'two'], ['four', 'three']] as const) bodies.set(id, chain(id, of));
  const bodyOf = (id: string): MetricDecl | null => bodies.get(id) ?? null;
  const fault = (parts: SumOf['sum_of'], self = 'net'): string | null => sumOfFault({ sum_of: parts }, self, bodyOf);

  assert.equal(fault([{ metric: 'pot-a' }, { metric: 'pot-b', minus: true }]), null);
  assert.match(fault([{ metric: 'net' }]) ?? '', /net is this one/);
  assert.match(fault([{ metric: 'pot-a:Oxbow' }], 'pot-a') ?? '', /pot-a is this one/, 'a parameter does not hide the figure itself');
  assert.match(fault([{ metric: 'pot-z' }]) ?? '', /no figure called pot-z/);
  assert.match(fault([{ metric: 'pot-a' }, { metric: 'pot-count' }]) ?? '', /pot-a is money and pot-count is not/);
  assert.match(fault(Array.from({ length: SUM_OF_PARTS_MOST + 1 }, () => ({ metric: 'pot-a' }))) ?? '', /adds 8 at most/);
  assert.match(fault([]) ?? '', /names them/);
  assert.match(fault([{ metric: 'pot-a', minus: 'yes' as never }]) ?? '', /each part is/);

  /* THREE SUMS DEEP IS A SUM: `three` adds `two`, which adds `one`. FOUR IS NOT. */
  assert.equal(fault([{ metric: 'two' }]), null);
  assert.match(fault([{ metric: 'three' }]) ?? '', /3 deep at most/);
  assert.match(sumOfFault(bodies.get('four')!.value as unknown as SumOf, 'four', bodyOf) ?? '', /3 deep at most/);

  /* A LOOP OF SUMS NAMING EACH OTHER ENDS AT THE DEPTH. */
  bodies.set('ping', chain('ping', 'pong'));
  bodies.set('pong', chain('pong', 'ping'));
  assert.match(fault([{ metric: 'ping' }]) ?? '', /deep at most/);
});
