/**
 * The engine's health, read from Slash's own ledger (ENG-A02).
 *
 * WHY THIS FILE EXISTS. Settings said "All healthy" on the day a model job died eight times on the owner's record, because
 * nothing read whether a model answered. `health` reads the `slash_call` rows the engine already writes, so each state is
 * asserted here over a real ledger: the store `openStore` builds, rows written the way `core` writes them, and one ledger
 * written by real asks through `createSlash` to a model that throws.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { core, openStore } from '../src/call.ts';
import { createSlash, engineHealth, engineSaid, FAILS_DOWN, type EngineHealth } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const HOUR = 3_600_000;
const at = (ms: number): string => new Date(ms).toISOString();

const ledger = () => {
  const sql = openSqlite();
  openStore(sql);
  let n = 0;
  const row = (ms: number, status: string, code: string | null, model = '@cf/model', tier = 'a'): void =>
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
       VALUES (?, ?, 'read', ?, ?, 0, 0, 0, 0, ?, ?)`,
      `r${String(++n).padStart(4, '0')}`,
      at(ms),
      tier,
      model,
      status,
      code,
    );
  return { sql, row };
};

const MODEL = { model: true };

test('NO ROWS IS never_asked, and no model is off before the ledger is read', () => {
  const { sql } = ledger();
  const clock = fixedClock(NOW);
  assert.deepEqual(engineHealth(sql, clock, MODEL), { state: 'never_asked', last_ok: null, since: null });
  assert.equal(engineSaid(engineHealth(sql, clock, MODEL), NOW).text, 'Slash has not needed its model yet.');
  const off = engineHealth(sql, clock, { model: false });
  assert.equal(off.state, 'off');
  assert.equal(engineSaid(off, NOW).whose, null);
  /* A STORE NEVER OPENED IS READ AS EMPTY, and the read creates nothing. */
  const bare = openSqlite();
  assert.equal(engineHealth(bare, clock, MODEL).state, 'never_asked');
  assert.equal(bare.one("SELECT name FROM sqlite_master WHERE name = 'slash_call'"), undefined);
});

test('AN ANSWER IS answering, and two failures after it are still answering', () => {
  const { sql, row } = ledger();
  row(NOW - 3 * HOUR, 'ok', null);
  row(NOW - 2 * HOUR, 'error', 'UNREACHABLE');
  row(NOW - HOUR, 'error', 'UNREACHABLE', '-');
  const h = engineHealth(sql, fixedClock(NOW), MODEL);
  assert.deepEqual(h, { state: 'answering', last_ok: at(NOW - 3 * HOUR), since: null });
  assert.deepEqual(engineSaid(h, NOW), { text: "Slash's model answered 3 hours ago.", whose: null });
  /* A reply that broke its schema was still a model answering. */
  row(NOW - 30 * 60_000, 'error', 'PROPOSAL_SCHEMA');
  assert.equal(engineSaid(engineHealth(sql, fixedClock(NOW), MODEL), NOW).text, "Slash's model answered 30 minutes ago.");
});

test('THREE FAILURES AFTER THE LAST ANSWER, the newest under a day old, is not_answering since the first of them', () => {
  const { sql, row } = ledger();
  const first = Date.UTC(2026, 9, 6, 2);
  row(first - DAYS(2), 'ok', null);
  row(first, 'error', 'UNREACHABLE');
  row(first + HOUR, 'error', 'PULL_REQUEST_REFUSED');
  row(first + 2 * HOUR, 'error', 'ANSWER_UNREADABLE');
  /* A hold in flight and a budget refusal say nothing about the model. */
  row(first + 3 * HOUR, 'error', 'SLASH_PENDING');
  row(first + 4 * HOUR, 'refused', 'SLASH_BUDGET_SPENT');
  row(first + 5 * HOUR, 'nothing', null, '-');
  const clock = fixedClock(first + 6 * HOUR);
  const h = engineHealth(sql, clock, MODEL);
  assert.deepEqual(h, { state: 'not_answering', last_ok: at(first - DAYS(2)), since: at(first) });
  const s = engineSaid(h, clock.now());
  assert.deepEqual(s, {
    text: "Slash's model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules.",
    whose: 'ours',
  });
  assert.doesNotMatch(s.text, /@cf|UNREACHABLE|infer\./);
  /* A day later with nobody asking, the last answer is still true and the alarm is not kept up. */
  clock.set(first + 2 * HOUR + DAYS(1) + 1);
  assert.equal(engineHealth(sql, clock, MODEL).state, 'answering');
  /* And the next answer ends it. */
  row(first + 7 * HOUR, 'ok', null);
  clock.set(first + 8 * HOUR);
  assert.deepEqual(engineHealth(sql, clock, MODEL), { state: 'answering', last_ok: at(first + 7 * HOUR), since: null });
});

test('HIS OWN KEY TURNED AWAY, or a host that says it will not open, is key_closed and his to fix', () => {
  const { sql, row } = ledger();
  const first = Date.UTC(2026, 9, 6, 9);
  row(first - HOUR, 'ok', null, 'claude', 'b');
  row(first, 'error', 'PULL_REQUEST_REFUSED', '-', 'b');
  const clock = fixedClock(first + HOUR);
  const h: EngineHealth = engineHealth(sql, clock, { model: true, own_key: true });
  assert.deepEqual(h, { state: 'key_closed', last_ok: at(first - HOUR), since: at(first) });
  assert.deepEqual(engineSaid(h, clock.now()), {
    text: 'Your own key for Slash has not opened since 6 October. Open it in the vault, or switch to the included model.',
    whose: 'yours',
  });
  /* The same row on the included model is not his key's. */
  assert.equal(engineHealth(sql, clock, MODEL).state, 'answering');
  /* A key the vault will not open leaves no row, so the host says it. */
  const empty = ledger();
  const shut = engineHealth(empty.sql, clock, { model: true, own_key: true, key_open: false });
  assert.equal(shut.state, 'key_closed');
  assert.equal(engineSaid(shut, clock.now()).text, 'Your own key for Slash will not open. Open it in the vault, or switch to the included model.');
});

test('HOLDS IN FLIGHT ARE NEITHER, and a refusal on the included model is never his key', () => {
  const { sql, row } = ledger();
  const clock = fixedClock(NOW);
  /* Holds alone are a ledger nobody has been answered from yet, and never a failure. */
  for (let i = 3; i > 0; i--) row(NOW - i * HOUR, 'error', 'SLASH_PENDING');
  assert.equal(engineHealth(sql, clock, MODEL).state, 'never_asked');
  /* After an answer, three holds do not make three failures. */
  row(NOW - 4 * HOUR, 'ok', null);
  assert.deepEqual(engineHealth(sql, clock, MODEL), { state: 'answering', last_ok: at(NOW - 4 * HOUR), since: null });
  /* The included model turned away while he has his own key set: ours, not his. */
  for (let i = 1; i <= FAILS_DOWN; i++) row(NOW - i * 60_000, 'error', 'PULL_REQUEST_REFUSED', '-', 'a');
  const h = engineHealth(sql, clock, { model: true, own_key: true });
  assert.equal(h.state, 'not_answering');
  /* And no sentence names a model, a job or a code. */
  for (const state of ['answering', 'not_answering', 'never_asked', 'off', 'key_closed'] as const)
    assert.doesNotMatch(engineSaid({ state, last_ok: at(NOW - HOUR), since: at(NOW - HOUR) }, NOW).text, /@cf|claude|gpt|[A-Z]{2,}_[A-Z]|infer\.|rule\.|—/);
});

test('A REAL LEDGER: three asks to a model that throws, written by the engine itself, read as not_answering', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  assert.equal(engineHealth(sql, clock, MODEL).state, 'never_asked');
  for (let i = 0; i < FAILS_DOWN; i++) {
    inference.say(new Error('5016: account not allowed'));
    /* The read answers the person in its own words; what matters here is the row it settled. */
    await slash.read('what is still open', OWNER);
    clock.advance(60_000);
  }
  /* A hold written and not yet settled is passed over. */
  core(sql, clock, inference).reserve('read', 'a', '@cf/model');
  const h = engineHealth(sql, clock, MODEL);
  assert.equal(h.state, 'not_answering', JSON.stringify(sql.all('SELECT ts, kind, model, status, code FROM slash_call')));
  assert.equal(h.since, at(NOW));
  assert.equal(h.last_ok, null);
  assert.equal(engineSaid(h, clock.now()).whose, 'ours');
});

function DAYS(n: number): number {
  return n * 24 * HOUR;
}
