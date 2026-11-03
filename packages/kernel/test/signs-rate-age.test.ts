/**
 * `rate-age`, "Rates are fresh enough to match transfers" (pairs-fx-guard-62-63#4): the vital sign beside `pairs.across_currency`.
 *
 * TWO CURRENCIES PAIR BY THEMSELVES ONLY ON A RATE AT MOST `PAIR_RATE_DAYS` OLD (`pairs.ts`). Past that the two rows of
 * a move stay counted as spending and income and a person is asked, and nothing on the record said why. This sign says
 * the day the newest rate is of and how old it is, and goes red the day the matching stops.
 *
 * `signs-vitals.ts` IS IMPORTED FIRST, before the kernel: it reads `pairs.ts` at load, and `signs.ts` spreads its list
 * at load, so this file would not load at all if the one reached the other in a ring.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RATE_DAYS_MOST, SIGNS_VITALS } from '../src/signs-vitals.ts';
import { openRecord, VITAL_SIGNS, type Declaration, type Kernel } from '../src/index.ts';
import { newestRate, PAIR_RATE_DAYS } from '../src/pairs.ts';
import { ruleOf, type SignReading } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const PERSON = { actor: 'p_1' };
/** The day `n` days before the ninth of October 2026. */
const AGO = (n: number): string => new Date(Date.UTC(2026, 9, 9 - n, 12)).toISOString().slice(0, 10);

const PAIRS = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved' };
const ACROSS = { ...PAIRS, across_currency: { tolerance: 2 } };

/** A ledger as money-core shapes one, pairing as `pairs` says, or not at all. */
const LEDGER = (pairs?: unknown): Declaration => ({
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    ...(pairs === undefined ? {} : { pairs }),
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
});

/** The rates, on the list a record holds them in before any list declares `rates:`. */
const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

type Rec = { k: Kernel; sql: NodeSql };

async function record(decls: Declaration[], rates: readonly string[] = []): Promise<Rec> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  if (decls.length > 0) {
    const out = await k.install(decls);
    assert.ok(out.ok, JSON.stringify(out));
  }
  for (const as_of of rates) rate(k, as_of);
  return { k, sql };
}

function rate(k: Kernel, as_of: string): string {
  const made = k.create('fx', { currency: 'USD', base: 'EGP', rate: 48.5, as_of } as never, PERSON);
  assert.ok(made.ok, JSON.stringify(made));
  return made.value.id;
}

const reader = () => SIGNS_VITALS.find((s) => s.sign === 'rate-age');

/** The sign, read as `readSigns` reads it, with no em dash, no id and no ISO day in what a person reads. */
function sign(sql: NodeSql, nowMs = NOW, tz = 'UTC'): SignReading {
  const s = reader();
  assert.ok(s?.read, 'rate-age is not on the list');
  const got = s.read(sql, nowMs, tz);
  for (const line of [got.said, ...(got.facts ?? [])]) {
    assert.ok(line.length > 0 && !/[—]/.test(line), `an em dash in ${JSON.stringify(line)}`);
    assert.ok(!/\b(rec|p|ent)_[0-9A-Za-z]+|[0-9A-HJKMNP-TV-Z]{26}/.test(line), `an id in ${JSON.stringify(line)}`);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(line), `a day as the record stores it in ${JSON.stringify(line)}`);
    assert.ok(!/across_currency|register|\bfx\b|\bledger\b/.test(line), `a declaration's word in ${JSON.stringify(line)}`);
  }
  return got;
}

test('ON THE LIST: named in words, read by the kernel, its threshold the one the pairing holds', () => {
  const s = reader();
  assert.ok(s, 'rate-age is not on the list');
  assert.equal(s.name, 'Rates are fresh enough to match transfers');
  assert.ok(!/[a-z]+-[a-z]+/.test(s.name), 'the name is an id');
  assert.equal(s.hand, 'kernel');
  assert.equal(typeof s.read, 'function');
  /* ONE NUMBER, NOT TWO: the sign goes red the day the pairing stops, so it reads the pairing's own limit. */
  assert.equal(RATE_DAYS_MOST, PAIR_RATE_DAYS);
  assert.equal(RATE_DAYS_MOST, 2);
  assert.deepEqual(s.thresholds, { RATE_DAYS_MOST });
  assert.equal(typeof ruleOf(s), 'string');
  assert.equal(VITAL_SIGNS.filter((v) => v.sign === 'rate-age').length, 1, 'on the closed list once');
  assert.equal(SIGNS_VITALS.filter((v) => v.sign === 'rate-age').length, 1);
});

test('GREEN at two days or newer: today, one day and two days, each naming the day and the age', async () => {
  for (const [old, said] of [
    [0, 'The newest rate is from 9 October, today.'],
    [1, 'The newest rate is from 8 October, 1 day old.'],
    [2, 'The newest rate is from 7 October, 2 days old.'],
  ] as const) {
    const r = await record([LEDGER(ACROSS), FX], [AGO(9), AGO(old)]);
    const got = sign(r.sql);
    assert.equal(got.state, 'green', `${old} days read ${got.state}: ${got.said}`);
    assert.equal(got.value, old);
    assert.equal(got.said, said);
    assert.deepEqual(newestRate(r.sql, AGO(0)), { as_of: AGO(old), days: old }, 'the reading is the pairing\'s own');
    assert.ok((got.facts ?? []).some((f) => f.includes('Ledger')), `no fact names the list: ${JSON.stringify(got.facts)}`);
    r.sql.close();
  }
});

test('RED above two days, in a sentence naming the day, the age and what stopped', async () => {
  const three = await record([LEDGER(ACROSS), FX], [AGO(3)]);
  const got = sign(three.sql);
  assert.equal(got.state, 'red');
  assert.equal(got.value, 3);
  assert.equal(got.said, 'The newest rate is from 6 October, 3 days old. A move between two currencies is matched by itself only on a rate at most 2 days old. Turn on Keep rates current, on Money\'s plugin page, for a feed of rates once a day.');
  assert.ok((got.facts ?? []).some((f) => f.includes('Ledger')), `no fact names the list: ${JSON.stringify(got.facts)}`);
  /* MENDED BY THE DAY'S RATE ARRIVING, with nothing else touched. */
  rate(three.k, AGO(0));
  assert.equal(sign(three.sql).state, 'green', 'a rate for today reads green again');
  three.sql.close();

  /* A YEAR BACK says its year, as every day a sign says does. */
  const old = await record([LEDGER(ACROSS), FX], ['2025-10-09']);
  const far = sign(old.sql);
  assert.equal(far.state, 'red');
  assert.equal(far.value, 365);
  assert.match(far.said, /^The newest rate is from 9 October 2025, 365 days old\. /);
  old.sql.close();
});

test('THE NEWEST THE RECORD STILL HOLDS: a deleted rate is not read, and a rate dated ahead is not either', async () => {
  const r = await record([LEDGER(ACROSS), FX], [AGO(4)]);
  const today = rate(r.k, AGO(0));
  assert.equal(sign(r.sql).state, 'green');
  r.sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), today);
  const gone = sign(r.sql);
  assert.equal(gone.state, 'red', gone.said);
  assert.equal(gone.value, 4);
  /* A RATE FROM AFTER TODAY IS A GUESS BACKWARDS (`rateAt`): no pair is made on it, so it does not make the sign green. */
  rate(r.k, AGO(-3));
  assert.equal(sign(r.sql).value, 4);
  r.sql.close();
});

test('THE DAY IS THE RECORD\'S OWN: late in the evening in UTC is already tomorrow in Cairo', async () => {
  const r = await record([LEDGER(ACROSS), FX], [AGO(2)]);
  const late = Date.UTC(2026, 9, 9, 22, 30);
  assert.equal(sign(r.sql, late, 'UTC').state, 'green');
  const cairo = sign(r.sql, late, 'Africa/Cairo');
  assert.equal(cairo.state, 'red', cairo.said);
  assert.equal(cairo.value, 3);
  r.sql.close();
});

test('NONE, in its own words, with no rate on the record', async () => {
  const empty = await record([LEDGER(ACROSS), FX]);
  const got = sign(empty.sql);
  assert.equal(got.state, 'none');
  assert.equal(got.value, null);
  assert.equal(got.said, 'No exchange rate is kept yet, so a move between two currencies is not matched by itself.');
  empty.sql.close();
  /* AND WITH NO LIST TO HOLD ONE. */
  const bare = await record([LEDGER(ACROSS)]);
  assert.equal(sign(bare.sql).said, got.said);
  bare.sql.close();
});

test('NONE, saying the day, where every rate the record holds is dated ahead', async () => {
  /* A RATE DATED AHEAD IS HELD BUT NOT IN FORCE: "holds no rate yet" would be untrue of a record that holds one. */
  const r = await record([LEDGER(ACROSS), FX], [AGO(-3), AGO(-1)]);
  const got = sign(r.sql);
  assert.equal(got.state, 'none', got.said);
  assert.equal(got.value, null);
  assert.equal(got.said, 'The newest rate is dated 12 October, in 3 days, so none is in force yet and a move between two currencies is not matched by itself.');
  assert.ok((got.facts ?? []).some((f) => f.includes('Ledger')), `no fact names the list: ${JSON.stringify(got.facts)}`);
  assert.equal(newestRate(r.sql, AGO(0)), null, 'the pairing reads none either');
  r.sql.close();

  /* ONE DAY AHEAD IS ONE DAY, and a day in another year says its year. */
  const one = await record([LEDGER(ACROSS), FX], [AGO(-1)]);
  assert.match(sign(one.sql).said, /^The newest rate is dated 10 October, in 1 day, /);
  one.sql.close();
  const far = await record([LEDGER(ACROSS), FX], ['2027-01-04']);
  assert.match(sign(far.sql).said, /^The newest rate is dated 4 January 2027, in 87 days, /);
  far.sql.close();

  /* THE DAY IT COMES INTO FORCE the sign reads it as any other rate. */
  const due = await record([LEDGER(ACROSS), FX], [AGO(-1)]);
  const then = sign(due.sql, NOW + 24 * 3_600_000);
  assert.equal(then.state, 'green', then.said);
  assert.equal(then.said, 'The newest rate is from 10 October, today.');
  due.sql.close();
});

test('NONE, in other words, where no list matches a move between two currencies, however old its rates are', async () => {
  const said = 'No list matches a move between two currencies.';
  for (const decls of [[LEDGER(PAIRS), FX], [LEDGER(), FX], [FX]]) {
    const r = await record(decls, [AGO(40)]);
    const got = sign(r.sql);
    assert.equal(got.state, 'none', got.said);
    assert.equal(got.value, null);
    assert.equal(got.said, said);
    r.sql.close();
  }
  /* AN EMPTY FILE, as every sign reads one. */
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  assert.equal(sign(sql).state, 'none');
  assert.equal(sign(sql).said, said);
  sql.close();
});
