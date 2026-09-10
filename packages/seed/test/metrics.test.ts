/**
 * The record's own figures, read two ways over the same rows.
 *
 * THIS IS A DIFFERENTIAL TEST, and it is the strongest kind available here. The kernel answers a
 * metric by compiling its predicate to SQL and running one aggregate; the reference below walks the
 * seed's rows in TypeScript with `evaluate` and adds them up. Two implementations that share only a
 * declaration and a set of rows, and if they disagree one of them is wrong — which is a thing a
 * single implementation can never tell you about itself.
 *
 * The nine declarations are the ones the product ships with, not fixtures written to pass. Three of
 * them carry `{{it}}` and are read once per project, which is the whole argument for a metric being
 * a document: four project pages over one declaration rather than twelve documents.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Entry, type Kernel, type MetricDecl, type Reading } from '@braindog/kernel';
import { evaluate, parseWhere, type Schema } from '@braindog/where';
import type { Param, Row, Sql } from '@braindog/ports';
import { fixOf, sayOf } from '@braindog/ports';

import { LOOKUPS, METRICS, NOW, REGISTERS, ROWS, THINGS, installSeed, type SeedMetric } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void } }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW }, { lookups: LOOKUPS });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql };
}

const schemaOf = (register: string): Schema => ({
  register,
  fields: Object.fromEntries((REGISTERS[register]?.fields ?? []).map((f) => [f.id, f as never])),
});

/**
 * The reference reading: the same declaration, over the same rows, in TypeScript.
 *
 * It knows nothing about SQL and shares no code with the evaluator beyond `parseWhere` and
 * `evaluate` — which are themselves checked against `compile` by that package's own differential
 * test, so agreement here is agreement all the way down.
 */
function byHand(k: Kernel, decl: SeedMetric): { value: number | null; unit: string | null } {
  const register = decl.source.slice('register.'.length);
  const schema = schemaOf(register);
  const said = parseWhere(decl.where, schema, {
    nowMs: NOW,
    refByTitle: (to, title) => {
      const seq = (ROWS[to] ?? []).findIndex((r) => r[REGISTERS[to]!.title] === title);
      return seq < 0 ? null : (k.get(`${to}#${seq + 1}`)?.id ?? null);
    },
  });
  assert.deepEqual(said.bad, [], `${decl.metric}: ${said.bad[0]?.fix ?? ''}`);

  /**
   * EVERY ROW, FILTERED IN MEMORY, AND IT USED TO ASK THE COMPILER FOR THE SET FIRST.
   *
   * This file's header says the reference "walks the seed's rows" and "shares no code with the
   * evaluator beyond `parseWhere` and `evaluate`". It did not: it asked `k.list({ where })`, which
   * compiles the predicate with the same `compile` the metric evaluator uses, and then filtered
   * what came back. `.filter(evaluate)` can only REMOVE rows the SQL admitted, so a compiled
   * predicate that wrongly drops a row produces the identical wrong figure on both sides and the
   * differential sees nothing. Measured over all eighteen readings, `evaluate` removed zero rows,
   * so only the arithmetic was ever being compared.
   *
   * SO THE SET COMES FROM THE ROWS. `limit` is the register's whole size because the point is that
   * nothing between the seed and this line decides which rows count except `evaluate`.
   */
  const held = (k.list({ register, limit: 1000 }) as { ok: true; value: { rows: Entry[] } }).value.rows;
  const rows = held.filter((e) => evaluate(said.predicate, e.fields, schema));

  const v = decl.value as Record<string, unknown>;
  if ('count' in v) {
    const field = v.count as string;
    return { value: field === 'id' ? rows.length : rows.filter((e) => e.fields[field] !== undefined).length, unit: null };
  }

  const operand = (v.sum ?? v.avg ?? v.min ?? v.max) as string | { product: [string, { lookup: string; by: string }] };
  const product = typeof operand === 'object' ? operand.product : null;
  const field = product ? product[0] : (operand as string);

  const units = new Set<string>();
  const values: number[] = [];
  for (const e of rows) {
    const raw = e.fields[field];
    if (raw === null || raw === undefined) continue;
    const amount = typeof raw === 'object' ? (raw as { amount: number }).amount : Number(raw);
    if (typeof raw === 'object') units.add((raw as { currency: string }).currency);
    const factor = product ? LOOKUPS[product[1].lookup]?.[String(e.fields[product[1].by] ?? '')] : 1;
    if (factor === undefined) continue;
    values.push(Math.round(amount * factor));
  }
  assert.ok(units.size <= 1, `${decl.metric} reads two currencies, so this reference cannot answer it either`);

  const unit = [...units][0] ?? null;
  if ('sum' in v) return { value: values.reduce((a, n) => a + n, 0), unit };
  if (values.length === 0) return { value: null, unit };
  if ('avg' in v) return { value: values.reduce((a, n) => a + n, 0) / values.length, unit };
  if ('min' in v) return { value: Math.min(...values), unit };
  return { value: Math.max(...values), unit };
}

const filled = (decl: SeedMetric, it: string): MetricDecl =>
  JSON.parse(JSON.stringify(decl).replaceAll('{{it}}', it)) as MetricDecl;

/* ── the two readings agree ──────────────────────────────────────────────── */

test('EVERY DECLARED METRIC READS THE SAME IN SQL AND IN TYPESCRIPT', async () => {
  const { k, sql } = await seeded();
  let checked = 0;

  for (const decl of Object.values(METRICS)) {
    const params = JSON.stringify(decl).includes('{{it}}') ? THINGS.map((t) => String(t.name)) : [null];
    for (const it of params) {
      const one = it === null ? (decl as MetricDecl) : filled(decl, it);
      const read = k.metric(one);
      assert.ok(read.ok, `${one.metric}${it ? `:${it}` : ''} — ${sayOf(read)}`);

      const hand = byHand(k, one as SeedMetric);
      assert.equal(
        read.value.value,
        hand.value,
        `${one.metric}${it ? `:${it}` : ''}: SQL says ${read.value.value} and the walk says ${hand.value}`,
      );
      assert.equal(read.value.unit, hand.unit, `${one.metric}: the two readings disagree about the currency`);
      checked++;
    }
  }

  assert.ok(checked >= 12, `only ${checked} readings were compared, so this proves little`);
  sql.close();
});

test('and the figures are the ones the record actually holds', async () => {
  /**
   * SPOT-CHECKED AGAINST THE ROWS, and it used to say that while asking the same engine.
   *
   * The comment claimed the figure was checked against the rows rather than against the other
   * implementation, "so a shared mistake in both would still be caught here". It then asked
   * `k.list({ where: 'state is open or part, direction is owed to me' })`, which parses that
   * sentence and compiles it with exactly the code the metric evaluator uses: a shared mistake
   * would have been shared by the check.
   *
   * THE ROWS AND A PREDICATE WRITTEN OUT BY HAND, which is what the sentence above always meant.
   */
  const { k, sql } = await seeded();

  const owed = k.metric(METRICS['owed-to-you'] as MetricDecl);
  assert.ok(owed.ok);
  const all = (k.list({ register: 'obligations', limit: 1000 }) as { ok: true; value: { rows: Entry[] } }).value.rows;
  const truth = all
    .filter((e) => (e.fields.state === 'open' || e.fields.state === 'part') && e.fields.direction === 'owed_to_me')
    .reduce((a, e) => a + (e.fields.amount as { amount: number }).amount, 0);
  assert.equal(owed.value.value, truth);
  assert.equal(owed.value.unit, 'GBP');
  assert.ok(truth > 0, 'a seed with nothing owed cannot show what the product is for');
  sql.close();
});

test('A COST PER CYCLE IS ANNUALISED, and the naive sum is 9.25 times too low', async () => {
  /* The bug this metric exists to have fixed: `cost` is per CYCLE, so a yearly domain and a monthly
     subscription are two different units. The factor was written out longhand in one metric and
     omitted from another, and Kiln's annual cost came out GBP 112.00 against a true GBP 1,036.00,
     under the word "year". */
  const { k, sql } = await seeded();
  const read = k.metric(filled(METRICS['project-cost']!, 'Kiln'));
  assert.ok(read.ok, fixOf(read));

  /* THE ROWS AND A PREDICATE WRITTEN OUT BY HAND, for the reason the test above it gives: asking
     `k.list` with a sentence compiles it with the code this figure is being checked against. */
  const listed = k.list({ register: 'services', limit: 1000 });
  assert.ok(listed.ok, sayOf(listed));
  const kiln = k.get('things#1')?.id;
  const rows = listed.value.rows.filter((e) => e.fields.thing === kiln && e.fields.state !== 'cancelled');
  assert.ok(rows.length > 0, 'no service is on Kiln, so the comparison below is against nothing');
  const naive = rows.reduce((a, e) => a + (e.fields.cost as { amount: number }).amount, 0);

  assert.ok(read.value.value !== null && read.value.value > naive * 2, `${read.value.value} is not an annualised figure`);
  sql.close();
});

test('a template read without its parameter is a refusal, not a figure about every project', async () => {
  // `thing is {{it}}` would fail the register's value check and report "there is no thing called
  // {{it}}" — technically true and useless. It is named for what it is instead.
  const { k, sql } = await seeded();
  const out = k.metric(METRICS['project-owed'] as MetricDecl);
  assert.equal(out.ok, false);
  sql.close();
});

test('THE NINE ARE ALL READABLE, so the record ships with no tile it cannot answer', async () => {
  const { k, sql } = await seeded();
  const unreadable: string[] = [];
  for (const decl of Object.values(METRICS)) {
    const one = JSON.stringify(decl).includes('{{it}}') ? filled(decl, String(THINGS[0]!.name)) : (decl as MetricDecl);
    const read = k.metric(one);
    if (!read.ok) unreadable.push(`${one.metric}: ${sayOf(read)}`);
  }
  assert.deepEqual(unreadable, []);
  assert.ok(Object.keys(METRICS).length >= 9);
  sql.close();
});
