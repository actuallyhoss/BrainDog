/**
 * A clause Slash prints can be typed back, into either engine, and finds the rows the predicate it was printed from finds.
 *
 * BRIEF 6'S PROMISE WAS "A PRINTED CLAUSE CAN BE TYPED BACK", AND IT HELD ONLY UNDER 1,000. `whereWords` printed a number
 * with `toLocaleString('en')` and a money through `money()`, both with a thousands comma, and both engines read a comma as
 * the end of a condition. Audit sixty-five (finding 4) measured it, and this file measured it again over the seed before the
 * repair, each line the words printed and then the record's answer and the browser's:
 *
 *   amount is at least GBP 1,500.00                  FIELD_UNKNOWN (a field called 500.00)   500.00: that is not something a filter can say
 *   amount is between GBP 1,000.00 and GBP 5,000.00  VALUE_MALFORMED                         the same, and a second refusal
 *   net is at most GBP −20,000.00                    VALUE_MALFORMED (GBP −20)               the same
 *   number is between 1 and 2,500                    FIELD_UNKNOWN (a field called 500)      500: that is not something a filter can say
 *   effort is at least 17,280                        FIELD_UNKNOWN (a field called 280)      the same
 *
 * Refused and never misread, but most amounts a business asks about are over a thousand of something. So a value is
 * printed as it is typed: digits, a point and a hyphen-minus, and a money as its code and its amount in the currency's
 * own places. Each case below is asked three ways: the predicate itself and the printed words to the record, which must
 * find the same rows, and the printed words to the browser's `compile`, which must read back the predicate's bounds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';
import type { SlashWhere } from '@braindog/client';

import '../record/fixtures/fill.ts';
import { NOW } from '../record/fixtures/sample.ts';
import { compile } from '../record/where.ts';
import { whereWords } from './slash.ts';

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
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
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/** The record's rows for a predicate or a sentence, or its refusal. */
const recordSeqs = (k: Kernel, register: string, where: unknown): string => {
  const out = k.list({ register, where: where as never, limit: 500 });
  if (!out.ok) return `refused: ${'refusal' in out ? out.refusal.fix : 'a conflict'}`;
  return out.value.rows.map((r) => r.seq ?? -1).sort((a, b) => a - b).join(' ');
};

/**
 * The bounds the browser reads out of a sentence, or its refusal.
 *
 * THE BROWSER NO LONGER COUNTS ROWS (ARC-2): `compile` is the record's parser, and what it hands its readers is the
 * clause. So the browser's half of this pair is that the printed words come back as the bounds the predicate holds.
 */
const browserBounds = (register: string, sentence: string): string => {
  const w = compile(register, sentence);
  if (w.bad.length) return `refused: ${w.bad.join('; ')}`;
  return JSON.stringify(w.clauses.map((c) => [c.field, c.op, 'bounds' in c ? c.bounds : null]));
};

/** The same, from the predicate the words were printed from. */
const leafBounds = (leaf: SlashWhere): string => {
  const node = leaf as unknown as Record<string, unknown>;
  const op = Object.keys(node).find((k) => k !== 'field') ?? '';
  const v = node[op];
  const one = (x: unknown) => (typeof x === 'number' ? { n: x } : { n: (x as { amount: number }).amount, currency: (x as { currency: string }).currency });
  return JSON.stringify([[node.field, op, Array.isArray(v) ? v.map(one) : [one(v)]]]);
};

/* EVERY ORDERED OPERATOR, over a money, a negative money, a whole number and a duration, each at or past a thousand. */
const PRINTED: [string, SlashWhere, string][] = [
  ['obligations', { field: 'amount', gte: gbp(150_000) }, 'amount is at least GBP 1500.00'],
  ['obligations', { field: 'amount', lt: gbp(250_000) }, 'amount is less than GBP 2500.00'],
  ['obligations', { field: 'amount', gt: gbp(240_000) }, 'amount is more than GBP 2400.00'],
  ['obligations', { field: 'amount', lte: gbp(240_000) }, 'amount is at most GBP 2400.00'],
  ['obligations', { field: 'amount', between: [gbp(100_000), gbp(500_000)] }, 'amount is between GBP 1000.00 and GBP 5000.00'],
  ['snapshots', { field: 'net', lte: gbp(-2_000_000) }, 'net is at most GBP -20000.00'],
  ['installments', { field: 'number', lt: 1500 }, 'number is less than 1500'],
  ['installments', { field: 'number', between: [2, 2500] }, 'number is between 2 and 2500'],
  ['tasks', { field: 'effort', gte: 17_280 }, 'effort is at least 17280'],
  ['things', { field: 'progress', gte: 50.5 }, 'progress is at least 50.5'],
];

test('EVERY CLAUSE PRINTED OVER A VALUE PAST A THOUSAND TYPES BACK, into the record as the same rows and into the browser as the same bounds', async () => {
  const k = await record;
  for (const [register, leaf, words] of PRINTED) {
    const said = whereWords(leaf);
    assert.equal(said, words, 'the words a person reads');
    const asked = recordSeqs(k, register, leaf);
    assert.doesNotMatch(asked, /^refused/, `${register}: the predicate itself was refused, so this proves nothing: ${asked}`);
    assert.equal(recordSeqs(k, register, said), asked, `${register}: "${said}" typed back into the record`);
    assert.equal(browserBounds(register, said), leafBounds(leaf), `${register}: "${said}" typed back into the browser`);
  }
});

test('A CURRENCY WITH NO MINOR UNIT IS PRINTED WITH NONE, and one with three keeps all three', () => {
  /* THE CURRENCY'S OWN PLACES, as `money()` printed them: `JPY 1250.00` would be a yen amount no yen can be, and the
     grammar refuses more places than the currency has. */
  assert.equal(whereWords({ field: 'amount', gte: { amount: 125_000, currency: 'JPY' } }), 'amount is at least JPY 125000');
  assert.equal(whereWords({ field: 'amount', gte: { amount: 1_250_500, currency: 'KWD' } }), 'amount is at least KWD 1250.500');
  assert.equal(whereWords({ field: 'weight', gte: { value: 1500, unit: 'kg' } }), 'weight is at least 1500 kg');
});
