/**
 * The engine's ledger on a host (ENG-B01 job 3): `engineLedgerRead` over Slash's real ledger, and the `engineReadings` route.
 *
 * WHY THIS FILE EXISTS. The record's `engineReadings` answered `null` on every host, because no host handed it a ledger:
 * what the model was asked and what it answered was counted by arithmetic nothing fed. The read built here is what a host
 * hands the record as `engineLedger`, so each case runs it over a ledger `createSlash` built, the way both hosts open one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineLedgerRead, handlersFor, ROUTES, type EngineLedger, type RecordSurface } from '../src/index.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 6, 2);
const DAY = 86_400_000;
const at = (ms: number): string => new Date(ms).toISOString();

/** A ledger the package built, holding the calls handed in. */
const ledger = (calls: readonly { id: string; ts: number; model: string; status: string; code: string | null; purpose: string }[]) => {
  const sql = openSqlite();
  createSlash({ sql, clock: fixedClock(T0), inference: { complete: () => Promise.reject(new Error('unused')) }, record: {} as never });
  for (const c of calls)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, purpose)
       VALUES (?, ?, 'read', 'a', ?, 0, 0, 0, 0, ?, ?, ?)`,
      c.id,
      at(c.ts),
      c.model,
      c.status,
      c.code,
      c.purpose,
    );
  return sql;
};

test('THE CALLS SINCE AN INSTANT, each with its model, status, code and purpose, and nothing older', async () => {
  const sql = ledger([
    { id: 'old', ts: T0 - 40 * DAY, model: 'm-1', status: 'ok', code: null, purpose: 'ask' },
    { id: 'edge', ts: T0 - 30 * DAY, model: 'm-1', status: 'ok', code: null, purpose: 'understand' },
    { id: 'bad', ts: T0 - DAY, model: 'm-1', status: 'error', code: 'UNREACHABLE', purpose: 'ask' },
    { id: 'spent', ts: T0, model: '-', status: 'refused', code: 'SLASH_BUDGET_SPENT', purpose: 'ask' },
  ]);
  const out = await engineLedgerRead({ sql })(at(T0 - 30 * DAY));
  assert.deepEqual(out, {
    calls: [
      { ts: at(T0 - 30 * DAY), model: 'm-1', status: 'ok', code: null, purpose: 'understand' },
      { ts: at(T0 - DAY), model: 'm-1', status: 'error', code: 'UNREACHABLE', purpose: 'ask' },
      { ts: at(T0), model: '-', status: 'refused', code: 'SLASH_BUDGET_SPENT', purpose: 'ask' },
    ],
    mentions: [],
    questions: [],
  } satisfies EngineLedger);
});

test('THE OPEN QUESTIONS BY THEIR CAUSE AND THE MENTIONS BY attached, and nothing else of either', async () => {
  const read = engineLedgerRead({
    sql: ledger([]),
    /* What a host reads off its record: whole rows, of which one field each is kept. */
    questions: () => [{ id: 'q1', cause: 'bank:statement', body: 'Whose is this?' }, { id: 'q2', cause: null }, { id: 'q3' }],
    mentions: async () => [{ name: 'Mona', attached: true }, { name: 'A stranger', attached: false }],
  });
  const out = await read(at(T0));
  assert.deepEqual(out.questions, [{ cause: 'bank:statement' }, { cause: null }, { cause: null }]);
  assert.deepEqual(out.mentions, [{ attached: true }, { attached: false }]);
  assert.deepEqual(out.calls, []);
});

test('A STORE NO ENGINE HAS BUILT YET answers empty, and so does a ledger older than its purpose column', async () => {
  /* Before the first question of the day has created Slash's tables. */
  assert.deepEqual(await engineLedgerRead({ sql: openSqlite() })(at(T0)), { calls: [], mentions: [], questions: [] });
  /* The questions are the record's and are still read: a missing ledger is not a missing record. */
  const quiet = await engineLedgerRead({ sql: openSqlite(), questions: () => [{ cause: 'a' }] })(at(T0));
  assert.deepEqual(quiet, { calls: [], mentions: [], questions: [{ cause: 'a' }] });
  /* A ledger from before ENG-A05 has no `purpose`: every call in it was an ask. */
  const old = openSqlite();
  old.exec('CREATE TABLE slash_call (id TEXT PRIMARY KEY, ts TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, code TEXT)');
  old.exec("INSERT INTO slash_call (id, ts, model, status, code) VALUES ('a', ?, 'm-1', 'ok', NULL)", at(T0));
  assert.deepEqual((await engineLedgerRead({ sql: old })(at(T0 - DAY))).calls, [{ ts: at(T0), model: 'm-1', status: 'ok', code: null, purpose: 'ask' }]);
});

test('engineReadings IS A READ+ ROUTE THAT WRITES NOTHING, beside engineHealth', () => {
  const route = ROUTES.find((r) => r.name === 'engineReadings');
  assert.equal(route?.group, 'READ+');
  assert.equal(route?.writes, false);
  assert.equal(ROUTES.filter((r) => r.name === 'engineReadings').length, 1);
});

test('THE ROUTE ASKS THE RECORD’S engineReadings, and a record without it says it is not in this build', async () => {
  const without = await handlersFor({} as RecordSurface)['engineReadings']!({}, {});
  assert.equal(!without.ok && 'refusal' in without && without.refusal.code, 'NOT_IN_THIS_BUILD');
  /* With the method, its answer is the route's, `null` included: a host that wired no ledger. */
  const api = { engineReadings: async () => ({ ok: true, value: null }) } as unknown as RecordSurface;
  assert.deepEqual(await handlersFor(api)['engineReadings']!({}, {}), { ok: true, value: null });
});
