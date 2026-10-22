/**
 * The built-in figures batch 47 adds or changes (figures-47): `signs-unread` (health-words-43), `keys-in-text` by name
 * (key-scan-44), `green-days` read by the seven-day hold (PRF-A18), the two night figures `lists-shrunk` and
 * `documents-dead-paths` as words the record answers (REC-A17, REC-A13), and a miss over nothing held being no verdict
 * on the rolled and walked money figures too (audit 38-39, #11). What the night writes is `night-counts.test.ts`'s.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES, RECORD_LISTS, RECORD_PATHS, builtInFigure } from '../src/built-in-figures.ts';
import { HOLD_SIGNS } from '../src/hold.ts';
import { RECORD_KEY_SCAN } from '../src/key-scan.ts';
import { evaluateMetric, heldVerdict, sourceReaders, type EvalContext, type Reading } from '../src/metrics.ts';
import { figureLists } from '../src/money-figures.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import type { VitalSign } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const read = (sql: NodeSql, id: string, more: Partial<EvalContext> = {}): Reading => {
  const r = evaluateMetric(sql, builtInFigure(id)!, { nowMs: NOW, tz: 'UTC', schemaOf: () => null, ...more });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const signOf = (sign: string, state: 'green' | 'red' | 'none'): VitalSign => ({ sign, name: sign, state, value: null, said: '', facts: [], days: [] }) as unknown as VitalSign;

/** A kept reading, straight into the table: `arrived` and a hand mark are on no list `fileSignReading` takes. */
const keep = (sql: NodeSql, sign: string, day: string, state: 'green' | 'red' | 'none', rule = 'r1'): void => {
  sql.exec(
    `INSERT INTO sign_reading (sign, day, state, value, said, facts, rule, hand, read_at) VALUES (?, ?, ?, NULL, 'kept', '[]', ?, 'system', ?)
     ON CONFLICT (sign, day) DO UPDATE SET state = excluded.state, rule = excluded.rule`,
    sign,
    day,
    state,
    rule,
    `${day}T23:00:00.000Z`,
  );
};

const allGreen = (sql: NodeSql, day: string): void => {
  for (const s of HOLD_SIGNS) keep(sql, s, day, 'green');
};

async function record(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
}

test('SIGNS UNREAD counts the signs with nothing to judge by, and says nothing with no signs to count', async () => {
  const sql = await record();
  const signs = () => [signOf('model-answers', 'none'), signOf('tools-listed', 'green'), signOf('pages-clean', 'none'), signOf('runs-true', 'red')];
  const r = read(sql, 'signs-unread', { signs });
  assert.equal(r.value, 2);
  assert.equal(r.met, null, 'a sign not read yet was judged a miss');
  assert.equal(r.held, 1);
  assert.equal(read(sql, 'signs-unread', { signs: () => signs().map((s) => ({ ...s, state: 'green' as const })) }).value, 0);
  assert.equal(read(sql, 'signs-unread').value, null, 'a reader handed no signs guessed');
  assert.equal(read(sql, 'signs-unread', { signs: () => [] }).value, null, 'no signs read as every sign read');
});

test("SIGNS UNREAD ON A PAST DAY is that day's kept readings, and a hand mark is not a sign", async () => {
  const sql = await record();
  keep(sql, 'model-answers', '2026-10-05', 'none');
  keep(sql, 'tools-listed', '2026-10-05', 'green');
  keep(sql, 'hand', '2026-10-05', 'none');
  assert.equal(read(sql, 'signs-unread', { asOfMs: Date.parse('2026-10-05T12:00:00Z') }).value, 1);
  assert.equal(read(sql, 'signs-unread', { asOfMs: Date.parse('2026-10-04T12:00:00Z') }).value, null);
});

test('GREEN DAYS IS THE HOLD: a day counts only when every hold sign read green', async () => {
  const sql = await record();
  for (const day of ['2026-10-06', '2026-10-07', '2026-10-08']) allGreen(sql, day);
  const run = read(sql, 'green-days');
  assert.equal(run.value, 3);
  assert.equal(run.met, true);
  assert.match(run.why, /^3 days in a row with every watched sign green\./u);
  /* ONE SIGN WITH NOTHING TO JUDGE BY YESTERDAY ENDS IT, where the old count took one green and none red as a day. */
  keep(sql, 'pages-clean', '2026-10-08', 'none');
  assert.equal(read(sql, 'green-days').value, 0);
});

test('A HAND MARK OR A MOVED RULE ENDS THE RUN, and today is never counted', async () => {
  const sql = await record();
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) allGreen(sql, day);
  assert.equal(read(sql, 'green-days').value, 4);
  keep(sql, 'hand', '2026-10-06', 'none');
  assert.equal(read(sql, 'green-days').value, 2);
  keep(sql, 'model-answers', '2026-10-08', 'green', 'r2');
  assert.equal(read(sql, 'green-days').value, 1, 'a threshold moved after the 7th, so the days before it were judged by another rule');
});

test('GREEN DAYS SAYS NOTHING, NEVER NOUGHT, before any kept day held a sign green or red', async () => {
  const sql = await record();
  assert.equal(read(sql, 'green-days').value, null);
  for (const s of HOLD_SIGNS) keep(sql, s, '2026-10-08', 'none');
  assert.equal(read(sql, 'green-days').value, null, 'a record nobody has read was told its run is nought');
});

test('THE RECORD ANSWERS EACH NEW FIGURE BY NAME, by its own reader, and only a reader of every list reads it', () => {
  for (const id of ['signs-unread', 'keys-in-text', 'lists-shrunk', 'documents-dead-paths']) assert.ok(Object.hasOwn(BUILT_IN_FIGURES, id), `${id} is not built in`);
  const readers = sourceReaders();
  for (const source of [RECORD_KEY_SCAN, RECORD_LISTS, RECORD_PATHS]) assert.ok(Object.hasOwn(readers, source), `${source} has no reader`);
  for (const id of ['keys-in-text', 'lists-shrunk', 'documents-dead-paths', 'signs-unread'])
    assert.deepEqual(figureLists(BUILT_IN_FIGURES[id]!), ['*'], `${id} named a list, so a member held to one list reads it`);
});

test('THE NIGHT FIGURES SAY NOTHING, NEVER NOUGHT, before the night has kept their series', async () => {
  const sql = await record();
  for (const id of ['lists-shrunk', 'documents-dead-paths']) {
    const r = read(sql, id);
    assert.equal(r.value, null, `${id} read ${String(r.value)} before any night`);
    assert.equal(r.met, null);
    assert.equal(r.held, 0);
  }
});

test('A MISS OVER NOTHING HELD IS NO VERDICT on rolled cash too, and nought over accounts that exist still misses', async () => {
  assert.equal(heldVerdict(false, 0), null);
  assert.equal(heldVerdict(true, 0), true);
  assert.equal(heldVerdict(false, 2), false);
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const accounts: Declaration = {
    id: 'register.accounts',
    kind: 'register',
    body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }, { id: 'as_of', type: 'day', index: true }] },
  } as never;
  const moves: Declaration = {
    id: 'register.transactions',
    kind: 'register',
    body: {
      id: 'transactions',
      name: 'Transactions',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'account', type: 'ref', to: 'accounts', index: true },
        { id: 'on', type: 'day', index: true },
        { id: 'amount', type: 'money', required: true },
        { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
      ],
    },
  } as never;
  assert.ok((await k.install([accounts, moves])).ok);
  const rolled = { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } };
  const cash = { metric: 'cash', name: 'Cash now', source: 'register.accounts', value: { rolled }, format: 'money', target: { gte: 1 }, window: '30d', compare: 'none' };
  const empty = k.metric(cash as never);
  assert.ok(empty.ok, JSON.stringify(empty));
  assert.equal(empty.value.held, 0);
  assert.equal(empty.value.met, null, 'a record with no account was told its cash misses its mark');
  assert.ok(k.create('accounts', { name: 'Current', balance: { amount: 0, currency: 'USD' }, as_of: '2026-10-08' }, { actor: 'p_1' }).ok);
  const held = k.metric(cash as never);
  assert.ok(held.ok, JSON.stringify(held));
  assert.equal(held.value.met, false);
});

test("GREEN DAYS COUNTS THE RECORD'S DAYS: late on the 8th in UTC, Auckland's yesterday is already the 8th", async () => {
  const sql = await record();
  allGreen(sql, '2026-10-06');
  keep(sql, 'model-answers', '2026-10-06', 'red');
  allGreen(sql, '2026-10-07');
  allGreen(sql, '2026-10-08');
  const late = Date.UTC(2026, 9, 8, 13);
  assert.equal(read(sql, 'green-days', { nowMs: late, tz: 'UTC' }).value, 1);
  assert.equal(read(sql, 'green-days', { nowMs: late, tz: 'Pacific/Auckland' }).value, 2);
});
