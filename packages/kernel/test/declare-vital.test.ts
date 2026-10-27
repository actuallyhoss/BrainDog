/**
 * A figure declared `vital: true` is one of the record's vital signs: red when its reading misses its target.
 *
 * A SIGN WITH NOTHING TO MISS WOULD READ NONE FOREVER while saying it watches something, so `vital` on a figure with no
 * target is refused at install with the sentence that says how to give it one. A declared sign never joins the hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl, type Reading } from '../src/index.ts';
import { readDeclaredSigns, vitalOf } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'paid', type: 'bool' }] },
} as never;

const figure = (extra: Record<string, unknown>): Declaration =>
  ({
    id: 'metric.unpaid',
    kind: 'metric',
    body: { metric: 'unpaid', name: 'Unpaid bills', source: 'register.bills', where: 'paid is false', value: { count: 'id' }, format: 'int', window: '7d', compare: 'none', ...extra },
  }) as never;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([BILLS]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

const answer = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  return x.ok ? 'installed' : `${x.refusal!.code} at ${String(x.refusal!.at)}`;
};

test('VITAL WITHOUT A TARGET IS REFUSED, with a sentence that says how to give it one', async () => {
  const { k, sql } = await record();
  const out = (await k.install([figure({ vital: true })])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(answer(out), 'METRIC_NEEDS_TARGET_OR_WINDOW at target');
  assert.match(out.refusal!.fix, /vital sign/u);
  assert.match(out.refusal!.fix, /target: \{ lte: <n> \}/u);
  /* A TARGET WITH NO BOUND IS NO TARGET TO MISS. */
  assert.equal(answer(await k.install([figure({ vital: true, target: {} })])), 'METRIC_NEEDS_TARGET_OR_WINDOW at target');
  /* ONE SPELLING: true, or left out. */
  assert.equal(answer(await k.install([figure({ vital: 'yes', target: { lte: 0 } })])), 'DECLARATION_INVALID at vital');
  assert.equal(answer(await k.install([figure({ vital: true, target: { lte: 0 } })])), 'installed');
  sql.close();
});

test('A VITAL FIGURE IS RED WHEN ITS READING MISSES ITS TARGET, green when it meets it, and never joins the hold', async () => {
  const { k, sql } = await record();
  const installed = await k.install([figure({ vital: true, target: { lte: 1 } })]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const decl = figure({ vital: true, target: { lte: 1 } }).body as unknown as MetricDecl;
  const sign = () => {
    const read = k.metric(decl) as { ok: boolean; value: Reading };
    assert.ok(read.ok);
    return vitalOf(decl, read.value);
  };

  /* NOTHING IN THE LIST: a count of none meets lte 1. */
  assert.equal(sign()?.state, 'green');
  for (const what of ['Rent', 'Power']) assert.ok(k.create('bills', { what, paid: false }, { actor: 'p_1' }).ok);
  const red = sign();
  assert.deepEqual([red?.sign, red?.state, red?.value, red?.hold], ['unpaid', 'red', 2, false]);
  assert.equal(red?.said, 'Unpaid bills misses its target.');

  /* READ ALL AT ONCE, AS HEALTH WILL: only the vital ones, each judged. */
  const plain = { ...decl, metric: 'plain', vital: undefined };
  const all = readDeclaredSigns(sql, [decl, plain], { nowMs: NOW, schemaOf: k.schemaOf } as never);
  assert.deepEqual(all.map((s) => [s.sign, s.state]), [['unpaid', 'red']]);
  sql.close();
});

test('A READING THAT CANNOT BE JUDGED IS NONE, NEVER GREEN, and a figure that is not vital is not a sign', () => {
  const decl = { metric: 'x', name: 'X', source: 'register.bills', value: { count: 'id' }, target: { lte: 0 }, vital: true } as MetricDecl;
  const reading = (value: number | null, met: boolean | null, refusals: { code: string; fix: string }[] = []) => ({ value, met, refusals });
  assert.equal(vitalOf(decl, reading(null, null))?.state, 'none');
  assert.equal(vitalOf(decl, reading(3, false, [{ code: 'CURRENCY_UNKNOWN', fix: 'no rate' }]))?.state, 'none');
  assert.equal(vitalOf(decl, null)?.state, 'none');
  assert.equal(vitalOf({ ...decl, vital: undefined }, reading(3, false)), null);
});
