/**
 * A list fed by 150 patterns reads its arrivals sign as one fed by one does.
 *
 * `readArrivals` bound one value per pattern and per door, and a Durable Object refuses a statement with more than 100
 * bound values, so a record past about 97 patterns into one list threw the night's whole read of signs. `node:sqlite`
 * allows thousands, so the read here goes through a port that refuses as the Durable Object does: the old query
 * throws on it, and the one with a JSON list per `json_each` passes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Sql } from '@braindog/ports';
import { readSigns, type VitalSign } from '../src/signs.ts';
import { CARD, OWNER, record, text, used } from './ingest-tail-kit.ts';
import type { NodeSql } from './sqlite.ts';

const DAY = 86_400_000;
const PATTERNS = 150;

/** The Durable Object's limit on bound values in one statement. */
const DO_MOST = 100;

/** The record's port as a Durable Object holds it: a statement with more than 100 bound values is refused. */
const asDurableObject = (sql: NodeSql): Sql => {
  const held = (params: Param[]): void => {
    if (params.length > DO_MOST) throw new Error(`too many SQL variables: ${params.length}`);
  };
  return {
    ...sql,
    exec: (text: string, ...params: Param[]) => (held(params), sql.exec(text, ...params)),
    all: <T>(text: string, ...params: Param[]) => (held(params), sql.all<T>(text, ...params)),
    one: <T>(text: string, ...params: Param[]) => (held(params), sql.one<T>(text, ...params)),
  } as Sql;
};

/** `n` more patterns at the bank's door, each filing into Transactions, written as an install leaves them. */
const morePatterns = (sql: NodeSql, n: number): void => {
  for (let i = 1; i <= n; i++)
    sql.exec(
      "INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, 'ingest', ?, 'x', ?)",
      `ingest.shop-${i}`,
      JSON.stringify({ ingest: `shop-${i}`, channel: 'webhook', door: 'bank-sms', writes: { register: 'transactions', confidence: 'exact' } }),
      new Date(Date.UTC(2026, 9, 1)).toISOString(),
    );
};

const arrivals = (sql: Sql, at: number): VitalSign => {
  const s = readSigns(sql, at, 'Africa/Cairo').find((x) => x.sign === 'arrivals-filed');
  assert.ok(s, 'arrivals-filed is not on the list');
  return s;
};

/** A record with the bank's door and three texts held for digits no account holds, and a transaction made beside them. */
async function held(extra: number) {
  const r = await record(CARD());
  morePatterns(r.sql, extra);
  const sent = r.clock.now();
  for (let i = 0; i < 3; i++) text(r.k, used('1234', `SHOP ${i}`, `${10 + i}.00`));
  assert.ok(r.k.create('transactions', { what: 'Rent', amount: { amount: 500_000, currency: 'EGP' }, on: '2026-10-08', account: r.card }, OWNER).ok);
  return { ...r, sent };
}

test(`${PATTERNS} PATTERNS INTO ONE LIST: the read binds a JSON list, not a value a pattern, and the Durable Object takes it`, async () => {
  const r = await held(PATTERNS);
  const n = r.sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE kind = 'ingest'")!.n;
  assert.ok(n > DO_MOST, `only ${n} patterns, under the limit this is about`);

  const red = arrivals(asDurableObject(r.sql), r.sent + DAY + 60_000);
  assert.equal(red.state, 'red');
  assert.equal(red.value, 3);
  assert.equal(arrivals(asDurableObject(r.sql), r.sent + DAY - 60_000).state, 'green');
  r.sql.close();
});

test('THE SAME READING WITH ONE PATTERN AND WITH 151: a pattern more says nothing new about the list', async () => {
  const one = await held(0);
  const many = await held(PATTERNS);
  for (const after of [DAY - 60_000, DAY + 60_000]) {
    const a = arrivals(one.sql, one.sent + after);
    const b = arrivals(asDurableObject(many.sql), many.sent + after);
    assert.deepEqual([b.state, b.value, b.said, b.facts], [a.state, a.value, a.said, a.facts]);
  }
  one.sql.close();
  many.sql.close();
});
