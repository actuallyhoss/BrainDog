/**
 * A declared vital sign over a list it could not read is `none` and says so, never green (audit 36-37, finding 9).
 *
 * `lte: 0` is the shape of "none of these may happen", and a reading that could not be taken answered 0 or nothing,
 * which was one step from passing. What is asserted: a count of none over a list that exists is judged, and green; a
 * list that is not there, a source this build does not read, and a reading with a refusal on it are `none`, with no
 * number and a sentence that says the figure could not be read; a figure with no rows to average is still the quiet
 * list's "nothing to judge by yet".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl } from '../src/index.ts';
import { readDeclaredSigns, vitalOf } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'paid', type: 'bool' }] },
} as never;

const late = (source: string, extra: Record<string, unknown> = {}): MetricDecl =>
  ({ metric: 'late', name: 'Late bills', source, value: { count: 'id' }, format: 'int', window: '7d', compare: 'none', target: { lte: 0 }, vital: true, ...extra }) as never;

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([BILLS]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

const read = (k: Kernel, sql: NodeSql, decl: MetricDecl) => {
  const [sign, ...rest] = readDeclaredSigns(sql, [decl], { nowMs: NOW, schemaOf: k.schemaOf } as never);
  assert.equal(rest.length, 0);
  assert.ok(sign, 'a vital figure read as no sign');
  return sign;
};

test('A COUNT OF NONE OVER A LIST THAT EXISTS IS JUDGED: lte 0 over an empty list is green, and one row turns it red', async () => {
  const { k, sql } = await record();
  const green = read(k, sql, late('register.bills'));
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'Late bills meets its target.']);

  assert.ok(k.create('bills', { what: 'Rent', paid: false }, { actor: 'p_1' }).ok);
  const red = read(k, sql, late('register.bills'));
  assert.deepEqual([red.state, red.value, red.said], ['red', 1, 'Late bills misses its target.']);
  sql.close();
});

test('A LIST THAT IS NOT THERE, OR A SOURCE THIS BUILD DOES NOT READ, IS NONE: no number, and it says it could not be read', async () => {
  const { k, sql } = await record();
  for (const source of ['register.gone', 'feed.bank']) {
    const s = read(k, sql, late(source));
    assert.deepEqual([s.state, s.value, s.said], ['none', null, 'Late bills could not be read, so it is not judged.'], source);
  }
  sql.close();
});

test('A READING WITH A REFUSAL ON IT IS NONE, whatever its number and whether or not it met the target', () => {
  const decl = late('register.bills');
  for (const met of [true, false, null]) {
    const s = vitalOf(decl, { value: 0, met, refusals: [{ code: 'CURRENCY_UNKNOWN', fix: 'late: no rate for USD' }] });
    assert.deepEqual([s?.state, s?.value, s?.said], ['none', null, 'Late bills could not be read, so it is not judged.'], String(met));
  }
  const nothing = vitalOf(decl, { value: null, met: null, refusals: [] });
  assert.deepEqual([nothing?.state, nothing?.said], ['none', 'Late bills has nothing to judge by yet.']);
  for (const s of [vitalOf(decl, null)!, nothing!]) assert.doesNotMatch(s.said, /—|register\.|feed\./);
});
