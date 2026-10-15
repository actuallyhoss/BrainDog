/**
 * The walk passes over a model that keeps failing (ENG-A06 jobs 2 and 7): "Rules are the fallback, not the engine." (D35.43)
 *
 * A CANDIDATE THAT FAILED THREE TIMES IN TEN MINUTES IS SKIPPED FOR TEN MINUTES, and one its provider does not serve for a
 * day, read from its own last rows in the ledger and from nothing held in memory: every case builds the engine afresh, as
 * both hosts do per request. The skip is one row under `-` that spends nothing and says why. The last candidate is always
 * asked, and his own key is never walked. Every model is canned and the clock is the test's.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { core, openStore, type Core } from '../src/call.ts';
import { NOT_SERVED, paused, pausedFor, LAST_ROWS_SQL, type LastRow } from '../src/paused.ts';
import { palette } from '../src/propose.ts';
import type { SlashCandidate } from '../src/types.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite, type Canned } from './double.ts';

const PREDICATE = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });
const SLOTS = { '%INDEX%': 'obligations', '%FIGURES%': 'none', '%QUESTION%': 'What is still open?' };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Line = { model: string; status: string; code: string | null; spends: string; candidate: string | null; neurons: number; tokens_in: number; raw: string | null };

/** One ledger and one clock, and an engine built afresh for each ask, as a host builds one per request. */
const build = (tier: 'a' | 'b' = 'a') => {
  const sql = openSqlite();
  openStore(sql);
  sql.exec("INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, NULL, NULL, 80, '2026-11-14')", tier);
  const clock = fixedClock(NOW);
  const first = canned();
  const second = canned();
  const routed: string[] = [];
  const route = (purpose: string): readonly SlashCandidate[] => {
    routed.push(purpose);
    return [
      { id: 'flash', model: 'glm-5.3-flash', inference: first },
      { id: 'small', model: 'llama-3.2-1b', inference: second },
    ];
  };
  const fallback = canned();
  const engine = (): Core => core(sql, clock, fallback, ['a'], ['a', 'b', 'byo'], route);
  const rows = () =>
    sql.all<Line>('SELECT model, status, code, spends, candidate, neurons, tokens_in, raw FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  const run = () => engine().run({ id: 'predicate', slots: SLOTS, inference: fallback });
  return { sql, clock, first, second, fallback, routed, engine, rows, run };
};

/** A failure on `who` as the walk writes one: no model answered, so it spends nothing, a minute after the last. */
const failOn = (c: Core, who: { id: string; model: string }, raw?: string) =>
  c.account({ id: c.mint(), kind: 'read', tier: 'a', model: who.model, usage: { in: 10, out: 0 }, ms: 5, status: 'error', code: 'UNREACHABLE', purpose: 'ask', spends: 'none', served: false, candidate: who.id, raw });

const FLASH = { id: 'flash', model: 'glm-5.3-flash' };
const SMALL = { id: 'small', model: 'llama-3.2-1b' };

test('THREE FAILURES IN TEN MINUTES SKIP THE FIRST CANDIDATE FOR TEN MINUTES, and then it is asked again', async () => {
  const b = build();
  for (let n = 0; n < 3; n++) {
    b.first.say(new Error('the provider did not answer'));
    b.second.say(PREDICATE);
    assert.ok((await b.run()).out.ok, 'the second candidate answered while the first failed');
    b.clock.advance(MINUTE);
  }
  assert.equal(b.first.seen.length, 3);

  b.second.say(PREDICATE);
  const ran = await b.run();
  assert.ok(ran.out.ok);
  assert.equal(ran.candidate, 'small');
  assert.equal(b.first.seen.length, 3, 'the first candidate was not asked: it is paused');
  const skip = b.rows().at(-1);
  assert.deepEqual(
    { model: skip?.model, status: skip?.status, code: skip?.code, spends: skip?.spends, candidate: skip?.candidate, neurons: skip?.neurons, tokens_in: skip?.tokens_in },
    { model: '-', status: 'nothing', code: 'UNREACHABLE', spends: 'none', candidate: 'flash', neurons: 0, tokens_in: 0 },
  );
  assert.match(skip?.raw ?? '', /paused after three failures/u);
  assert.equal(b.sql.all(LAST_ROWS_SQL, 'flash', 'glm-5.3-flash').length, 3, 'the skip is not one of the rows the pause reads');

  /* Eight minutes after the newest failure it is still paused; ten after it, it is asked again. */
  b.clock.advance(7 * MINUTE);
  b.second.say(PREDICATE);
  await b.run();
  assert.equal(b.first.seen.length, 3, 'still paused inside the ten minutes');
  b.clock.advance(2 * MINUTE);
  b.first.say(PREDICATE);
  const back = await b.run();
  assert.equal(b.first.seen.length, 4, 'asked again once the ten minutes are over');
  assert.equal(back.candidate, 'flash');
});

test('A MODEL ITS PROVIDER DOES NOT SERVE IS SKIPPED FOR A DAY, and its row keeps the words the pause reads back', async () => {
  const b = build();
  b.first.say(Object.assign(new Error(`No model answered for 'glm-5.3-flash': ${NOT_SERVED}.`), { why: NOT_SERVED, raw: 'no such model on this account' }));
  b.second.say(PREDICATE);
  await b.run();
  const failed = b.rows()[0];
  assert.equal(failed?.model, 'glm-5.3-flash');
  assert.equal(failed?.raw, `${NOT_SERVED}: no such model on this account`, 'the row starts with the phrase the pause reads');

  b.clock.advance(23 * HOUR);
  b.second.say(PREDICATE);
  await b.run();
  assert.equal(b.first.seen.length, 1, 'one failure was enough: skipped for the day');
  assert.match(b.rows().at(-1)?.raw ?? '', /not served/u);

  b.clock.advance(HOUR);
  b.first.say(PREDICATE);
  assert.equal((await b.run()).candidate, 'flash', 'asked again the next day');
});

test('THE LAST CANDIDATE IS ASKED EVEN WHEN PAUSED, so an ask always reaches a model', async () => {
  const b = build();
  const c = b.engine();
  for (let n = 0; n < 3; n++) {
    failOn(c, FLASH);
    failOn(c, SMALL);
    b.clock.advance(MINUTE);
  }
  assert.ok(paused(b.sql.all<LastRow>(LAST_ROWS_SQL, 'small', 'llama-3.2-1b'), b.clock.now()), 'both are paused by their rows');
  b.second.say(PREDICATE);
  const ran = await b.run();
  assert.ok(ran.out.ok);
  assert.equal(ran.candidate, 'small');
  assert.equal(b.first.seen.length, 0, 'the paused first candidate was skipped');
  assert.equal(b.second.seen.length, 1, 'the paused last candidate was asked');
});

test('A SKIPPED ATTEMPT SPENDS NOTHING: one question on a paused route is one ask', async () => {
  const b = build();
  const c = b.engine();
  for (let n = 0; n < 3; n++) {
    failOn(c, FLASH);
    b.clock.advance(MINUTE);
  }
  b.second.say(PREDICATE);
  const engine = b.engine();
  const out = await palette(engine, fakeRecord(), b.fallback).read('What is still open?', OWNER);
  assert.ok(out.ok);
  const [skip, answered] = b.rows().slice(3);
  assert.equal(skip?.spends, 'none');
  assert.equal(skip?.neurons, 0);
  assert.equal(answered?.candidate, 'small');
  assert.equal(answered?.spends, 'person');
  assert.equal(engine.asksUsed(), 1, 'the skip is not an ask');
});

test('HIS OWN KEY IS NOT WALKED: on tier b a paused candidate is not read and the route is not asked', async () => {
  const b = build('b');
  const c = b.engine();
  for (let n = 0; n < 3; n++) {
    failOn(c, FLASH);
    b.clock.advance(MINUTE);
  }
  b.fallback.say(PREDICATE);
  const ran = await b.run();
  assert.ok(ran.out.ok);
  assert.deepEqual(b.routed, [], 'no route was asked for');
  assert.equal(b.fallback.seen.length, 1, 'his own adapter was asked');
  assert.equal(b.rows().length, 3, 'no skip was written');
});

test('THE RULE: a run of failures ends at the first answer, a model under another name is its own, a skip is never read', () => {
  const at = (min: number) => new Date(NOW + min * MINUTE).toISOString();
  const fail = (min: number, raw: string | null = null): LastRow => ({ ts: at(min), status: 'error', code: 'UNREACHABLE', raw });
  const now = NOW + 3 * MINUTE;
  assert.equal(pausedFor([fail(2), fail(1), fail(0)], now), 'failed');
  assert.equal(pausedFor([fail(2), fail(1)], now), null, 'two failures are a blip');
  assert.equal(pausedFor([fail(2), { ts: at(1), status: 'ok', code: null, raw: null }, fail(0), fail(-1)], now), null, 'an answer since ends the run');
  assert.equal(pausedFor([fail(20), fail(5), fail(0)], NOW + 21 * MINUTE), null, 'spread over more than ten minutes');
  assert.equal(pausedFor([fail(0, NOT_SERVED)], NOW + 23 * HOUR), 'not_served');
  assert.equal(pausedFor([], now), null);
  const b = build();
  const c = b.engine();
  for (let n = 0; n < 3; n++) {
    failOn(c, { id: 'flash', model: 'glm-5.3-flash-b' });
    b.clock.advance(MINUTE);
  }
  assert.deepEqual(b.sql.all(LAST_ROWS_SQL, 'flash', 'glm-5.3-flash'), [], 'the same handle on another model reads none of its rows');
});

test('A THROW THAT SENT NOTHING NEVER PAUSES, and the words a failure keeps are scrubbed of anything like a key', async () => {
  const b = build();
  for (let n = 0; n < 3; n++) {
    b.first.say(Object.assign(new Error('no adapter on this host'), { sent: false }));
    b.second.say(PREDICATE);
    await b.run();
    b.clock.advance(MINUTE);
  }
  assert.deepEqual(b.sql.all(LAST_ROWS_SQL, 'flash', 'glm-5.3-flash'), [], 'a throw that reached no model is under `-` and not read');
  b.first.say(Object.assign(new Error('the provider did not answer'), { why: 'the provider did not answer', raw: 'denied for Bearer sk-invented0123456789' }));
  b.second.say(PREDICATE);
  await b.run();
  assert.equal(b.first.seen.length, 4, 'asked every time: three throws that sent nothing are no pause');
  const kept = b.rows().find((r) => r.model === 'glm-5.3-flash')?.raw ?? '';
  assert.match(kept, /denied for/u);
  assert.doesNotMatch(kept, /sk-invented/u, 'the key-like words are cut before the row is written');
});
