/**
 * A pattern call that reached a model settles its `call` row, whatever the record does with the filing after it answered.
 * The fourth `core.run` site.
 *
 * `538bc705` SETTLED THREE AND LEFT THIS ONE. The drafting read, the proposal and the automation's answer each write their
 * row the moment the model answers and overwrite it by the same id on the way out (`test/slash-settles.test.ts`).
 * `proposePattern` in `src/jobs.ts` runs the model, then awaits `record.propose`, and writes its only row after that
 * returns. A filing that threw left no row at all: a probe read "model calls: 1; call rows: []", on the same double
 * as `slash-settles.test.ts` case 5 with `propose` rejecting. `pattern-model.test.ts` notes that no door reaches
 * `proposePattern` today, so no stored row is missing; the day one does, a record that falls over while filing is a
 * model call nobody can see.
 *
 * NOT A HOLD, WHICH IS WHY THE SHAPE OF THE REPAIR DIFFERS FROM `propose.ts`'s. A pattern is never `reserve`d, so there is
 * no pending row for `finally` to release; the row is simply never written. Settling it is one `account('error',
 * 'RECORD_UNAVAILABLE')` after `core.run` returns, which every later exit overwrites by the call's id, as `INSERT OR
 * REPLACE` in `call.ts` does for the other three.
 *
 * RED AT `b7409d2d`, MEASURED ON 23 SEPTEMBER: three tests, two pass, one fails. Case 1 read `[]` where one row is expected,
 * with the model called once. Cases 2 and 3 passed before and after, which is their job: a filing the record REFUSED was
 * already a row, and a refusal before any model was called is still no row.
 *
 * CASE 1 PASSES WITH THE ONE `account` LINE IN `src/jobs.ts` after `core.run`, and fails without it (measured on a copy of
 * `src/` first, then in the tree).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { no } from '@braindog/ports';

import { createSlash, type RawPayload, type RecordApi } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const sample = (seq: number, amount: string): RawPayload => ({
  id: `inbox_raw#${seq}`,
  channel: 'email',
  ts: '2026-11-14T08:00:00Z',
  from: 'alerts@hsbc.com.eg',
  subject: `HSBC: You have received EGP ${amount} from ACME`,
  body: `Dear customer, your account was credited with EGP ${amount} at ACME LTD on 14 Nov.`,
});

const SAMPLES = [sample(212, '5,005.00'), sample(213, '1,200.50'), sample(214, '99.00')];

const INGEST = JSON.stringify({
  ingest: {
    match: { from: { is: 'alerts@hsbc.com.eg' }, subject: { starts: 'HSBC: You have received' } },
    extract: { merchant: { between: ['at ', ' LTD'] }, amount: { money: true } },
    writes: { register: 'obligations', confidence: 'exact' },
  },
  flagged: false,
});

/** How the record answers the filing: it files, it refuses, or it throws. And whether it will say what lists it has. */
const build = (filing: 'throw' | 'refuse', index: 'answer' | 'refuse' = 'answer') => {
  const sql = openSqlite();
  const inference = canned();
  const base = fakeRecord();
  const record: RecordApi = {
    project: (args, ctx) =>
      index === 'refuse' ? Promise.resolve(no('FORBIDDEN', 'The record would not say what lists it has.')) : base.project(args, ctx),
    propose: (args, ctx) =>
      filing === 'throw'
        ? Promise.reject(new Error('the record fell over while filing'))
        : Promise.resolve(no('FORBIDDEN', 'The record would not file that proposal.')),
  };
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record });
  const calls = () =>
    sql
      .all<{ kind: string; status: string; code: string | null; model: string }>('SELECT kind, status, code, model FROM slash_call ORDER BY rowid')
      .map((r) => ({ ...r }));
  return { sql, inference, slash, calls };
};

test(
  '(1) A PATTERN WHOSE FILING THREW AFTER THE MODEL ANSWERED STILL THROWS, AND THE CALL IS SETTLED UNDER RECORD_UNAVAILABLE',
  async () => {
    const { sql, inference, slash, calls } = build('throw');
    try {
      inference.say(INGEST);
      await assert.rejects(slash.proposePattern(SAMPLES, OWNER), /fell over while filing/u);

      assert.equal(inference.seen.length, 1);
      /* RED AT `b7409d2d`: `[]`, one model call and no row that says so. */
      assert.deepEqual(calls(), [{ kind: 'pattern', status: 'error', code: 'RECORD_UNAVAILABLE', model: 'glm-5.3-flash' }]);
    } finally {
      sql.close();
    }
  },
);

test('(2) A PATTERN WHOSE FILING THE RECORD REFUSED IS A ROW UNDER THE REFUSAL, before the repair and after it', async () => {
  const { sql, inference, slash, calls } = build('refuse');
  try {
    inference.say(INGEST);
    const out = await slash.proposePattern(SAMPLES, OWNER);

    assert.equal(out.ok, false);
    assert.equal(inference.seen.length, 1);
    assert.deepEqual(calls(), [{ kind: 'pattern', status: 'refused', code: 'FORBIDDEN', model: 'glm-5.3-flash' }]);
  } finally {
    sql.close();
  }
});

test('(3) A PATTERN REFUSED BEFORE ANY MODEL WAS ASKED IS NO ROW, which the settling line must not change', async () => {
  const { sql, inference, slash, calls } = build('throw', 'refuse');
  try {
    const out = await slash.proposePattern(SAMPLES, OWNER);

    assert.equal(out.ok, false);
    assert.equal(inference.seen.length, 0);
    assert.deepEqual(calls(), []);
  } finally {
    sql.close();
  }
});
