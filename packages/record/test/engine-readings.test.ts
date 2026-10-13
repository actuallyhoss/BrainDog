/**
 * The engine's own readings (ENG-B01), counted over a call ledger this test writes.
 *
 * FOR EACH PURPOSE: how many asks reached a model in the last day, week and month; of the last day's, how many the model
 * answered, how many answers were kept and how many asks were refused; what is still owed a read and since when; and the
 * newest failure's code. Then the understanding: mentions that point at nothing, and open questions by the word their
 * cause begins with. FIGURES ONLY: no question, no provider's words, no cause's tail ever leaves the reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineReadings, OTHER, UNSAID, type LedgerCall, type ReadingsOf } from '../src/engine-readings.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

/** One ledger row as `slash_call` holds it: answered and kept unless a case says otherwise. */
/* A LEDGER ROW'S CODE, HANDED IN AND NOT WRITTEN AS A REFUSAL'S: these are what `slash_call.code` holds, a model's answer
   turned down or a hold in flight, and no refusal a caller branches on (the refusals gate reads a written code as one). */
const coded = (word: string): Pick<LedgerCall, 'code'> => ({ ['code']: word });

const call = (purpose: string, before: number, over: Partial<LedgerCall> = {}): LedgerCall => ({
  ts: ago(before),
  model: '@cf/some/model',
  status: 'ok',
  code: null,
  purpose,
  ...over,
});

const of = (over: Partial<ReadingsOf> = {}): ReadingsOf => ({ now: NOW, calls: [], owed: [], mentions: [], questions: [], ...over });
const ask = (r: ReturnType<typeof engineReadings>, purpose: string) => r.asks.find((a) => a.purpose === purpose);

test('an empty ledger reads as nothing asked and nothing open', () => {
  assert.deepEqual(engineReadings(of()), { asks: [], understanding: { unattached: 0, open_by_cause: {} } });
});

test('asked is counted by purpose over the last day, week and month', () => {
  const r = engineReadings(
    of({
      calls: [
        call('understand', HOUR),
        call('understand', 2 * HOUR),
        call('understand', 3 * DAY),
        call('understand', 20 * DAY),
        call('understand', 40 * DAY),
        call('look', 2 * DAY),
        /* After now: a clock that ran ahead wrote it, and it is in no window. */
        call('look', -HOUR),
      ],
    }),
  );
  assert.deepEqual(ask(r, 'understand')?.asked, { day: 2, week: 3, month: 4 });
  assert.deepEqual(ask(r, 'look')?.asked, { day: 0, week: 1, month: 1 });
  assert.deepEqual(
    r.asks.map((a) => a.purpose),
    ['look', 'understand'],
  );
});

test('answered, kept and refused are the last day of the ledger, each row counted once', () => {
  const r = engineReadings(
    of({
      calls: [
        call('understand', HOUR),
        call('understand', HOUR, { status: 'nothing' }),
        /* The model spoke and the check refused what it said: an answer, not kept, and a refusal. */
        call('understand', HOUR, { status: 'refused', ...coded('ANSWER_REFUSED') }),
        /* The model spoke and the answer could not be filed: still an answer. */
        call('understand', HOUR, { status: 'error', ...coded('FILE_FAILED') }),
        call('understand', HOUR, { status: 'error', code: 'UNREACHABLE' }),
        /* The month's asks were spent: no model was asked, so it is a refusal and not an ask. */
        call('understand', HOUR, { model: '-', status: 'refused', code: 'SLASH_BUDGET_SPENT' }),
        /* A hold in flight and a call that needed no model say nothing. */
        call('understand', HOUR, { status: 'error', ...coded('SLASH_PENDING') }),
        call('understand', HOUR, { model: '-', status: 'nothing' }),
        /* Yesterday's are in the week and not in the day's figures. */
        call('understand', 2 * DAY),
      ],
    }),
  );
  const u = ask(r, 'understand');
  assert.deepEqual(u?.asked, { day: 5, week: 6, month: 6 });
  assert.equal(u?.answered, 4);
  assert.equal(u?.kept, 1);
  assert.equal(u?.refused, 2);
});

test('a purpose that asked and was never answered in the day reads answered 0', () => {
  const r = engineReadings(
    of({ calls: [call('compose', HOUR, { status: 'error', code: 'UNREACHABLE' }), call('compose', 2 * HOUR, { status: 'error', code: 'ANSWER_UNREADABLE' })] }),
  );
  const c = ask(r, 'compose');
  assert.equal(c?.asked.day, 2);
  assert.equal(c?.answered, 0);
});

test('the last error is the newest failure in the month, as its code and when, and never the provider words', () => {
  const r = engineReadings(
    of({
      calls: [
        call('understand', 5 * DAY, { status: 'error', code: 'UNREACHABLE', raw: 'upstream said: quota for acct 991 exhausted' }),
        call('understand', 2 * DAY, { status: 'error', code: 'PULL_REQUEST_REFUSED', raw: 'key sk-secret refused' }),
        call('understand', HOUR),
        call('look', 40 * DAY, { status: 'error', code: 'UNREACHABLE' }),
        call('look', HOUR),
      ],
    }),
  );
  assert.deepEqual(ask(r, 'understand')?.last_error, { at: ago(2 * DAY), code: 'PULL_REQUEST_REFUSED' });
  assert.equal(ask(r, 'look')?.last_error, null);
  assert.ok(!JSON.stringify(r).includes('sk-secret'));
  assert.ok(!JSON.stringify(r).includes('quota'));
});

test('owed is what waits for a read, with the oldest of it, and a purpose with no call still shows', () => {
  const r = engineReadings(
    of({
      calls: [call('understand', HOUR)],
      owed: [
        { purpose: 'about', at: ago(3 * DAY) },
        { purpose: 'about', at: ago(50 * DAY) },
        { purpose: 'about', at: ago(HOUR) },
        { purpose: 'understand', at: ago(2 * HOUR) },
      ],
    }),
  );
  const about = ask(r, 'about');
  assert.deepEqual(about, { purpose: 'about', asked: { day: 0, week: 0, month: 0 }, answered: 0, kept: 0, refused: 0, owed: 3, oldest_owed: ago(50 * DAY), last_error: null });
  assert.equal(ask(r, 'understand')?.owed, 1);
  assert.equal(ask(r, 'understand')?.oldest_owed, ago(2 * HOUR));
  assert.equal(ask(engineReadings(of({ calls: [call('look', HOUR)] })), 'look')?.oldest_owed, null);
});

test('the understanding counts mentions that point at nothing and open questions by cause', () => {
  const r = engineReadings(
    of({
      mentions: [{ attached: false }, { attached: true }, { attached: false }],
      questions: [
        { cause: 'rowset#transactions#0123456789abcdef01234567' },
        { cause: 'rowset#people#89abcdef0123456789abcdef' },
        { cause: 'install#work' },
        { cause: 'options#aaaaaaaaaaaaaaaaaaaaaaaa' },
        { cause: null },
        { cause: '' },
      ],
    }),
  );
  assert.deepEqual(r.understanding, { unattached: 2, open_by_cause: { install: 1, options: 1, rowset: 2, [UNSAID]: 2 } });
  /* The cause's tail names a list or a pack, which is the owner's own thing and stays in the record. */
  assert.ok(!JSON.stringify(r).includes('transactions'));
  assert.ok(!JSON.stringify(r).includes('work'));
});

test('a purpose or a cause that is not a plain word is counted as other, never echoed', () => {
  const r = engineReadings(
    of({
      calls: [call('Pay Sara 400 EUR', HOUR), call('', HOUR)],
      owed: [{ purpose: 'what did Northbank say?', at: ago(HOUR) }],
      questions: [{ cause: 'Call Sara about the renewal' }, { cause: 'Renew#northwind' }],
    }),
  );
  assert.deepEqual(
    r.asks.map((a) => a.purpose),
    [OTHER],
  );
  assert.equal(ask(r, OTHER)?.asked.day, 2);
  assert.equal(ask(r, OTHER)?.owed, 1);
  assert.deepEqual(r.understanding.open_by_cause, { [OTHER]: 2 });
  assert.ok(!/Sara|Northbank|northwind/.test(JSON.stringify(r)));
});

test('a row whose time cannot be read is in no window, and an owed thing without one is still owed', () => {
  const r = engineReadings(of({ calls: [call('look', 0, { ts: 'yesterday' }), call('look', HOUR)], owed: [{ purpose: 'look', at: 'soon' }] }));
  const look = ask(r, 'look');
  assert.deepEqual(look?.asked, { day: 1, week: 1, month: 1 });
  assert.equal(look?.owed, 1);
  assert.equal(look?.oldest_owed, null);
});

test('the reader changes nothing it was handed', () => {
  const calls = Object.freeze([Object.freeze(call('look', HOUR))]);
  const owed = Object.freeze([Object.freeze({ purpose: 'look', at: ago(HOUR) })]);
  assert.doesNotThrow(() => engineReadings(of({ calls, owed })));
});
