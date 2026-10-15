/**
 * Run now on a scheduled action: what the press sends, and each line a person reads under the row after it.
 *
 * THE RECORD IS A FAKE FETCH that answers what `actionRun` answers: the turn, a paused action's own sentence, or the
 * door's 429. Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runNow, runNowSaid, runWords, waitWords, type RunAnswer } from './run-now.ts';

const NOW = Date.parse('2026-10-15T09:00:00.000Z');

type Sent = { url: string; init: RequestInit | undefined };

function fake(status: number, body: unknown, headers: Record<string, string> = {}) {
  const sent: Sent[] = [];
  const io = async (url: string, init?: RequestInit): Promise<Response> => {
    sent.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  return { io, sent };
}

test('a press posts the action to actionRun on the record, and nothing else', async () => {
  const { io, sent } = fake(200, { ok: true, value: { ingest: 'tide-tables', due_at: '2026-10-15T09:00:00.000Z' } });
  const out = await runNow('/r/otter', 'tide-tables', io, NOW);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, '/r/otter/api/actionRun');
  assert.equal(sent[0]?.init?.method, 'POST');
  assert.equal(sent[0]?.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), { ingest: 'tide-tables' });
  assert.deepEqual(runNowSaid(out, NOW), { line: 'Runs in a moment.', ran: true });
});

test('a run due later than a moment says when, in words', () => {
  const later: RunAnswer = { ok: true, value: { ingest: 'tide-tables', due_at: '2026-10-15T09:10:00.000Z' } };
  assert.equal(runNowSaid(later, NOW).line, 'Runs in 10 minutes.');
});

test('a sentence the record sends beside the turn is said as it wrote it', () => {
  const said: RunAnswer = { ok: true, value: { ingest: 'tide-tables', due_at: '2026-10-15T09:00:00.000Z', said: 'Tide tables runs next, after the one already going.' } };
  assert.equal(runNowSaid(said, NOW).line, 'Tide tables runs next, after the one already going.');
});

test('a paused or held action says the record’s own sentence, and did not run', async () => {
  const paused = 'Tide tables is paused: the key it uses is not in the vault. Resume it on its project’s page.';
  const { io } = fake(409, { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: paused, at: 'ingest' } });
  assert.deepEqual(runNowSaid(await runNow('', 'tide-tables', io, NOW), NOW), { line: paused, ran: false });
  const held = 'Tide tables is held: this month’s runs are used up. It runs again on the 1st.';
  assert.equal(runNowSaid({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: held } }, NOW).line, held);
});

test('a second press reads the wait from the 429, in seconds', async () => {
  const { io } = fake(429, { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Wait.', retry_after: 40 } }, { 'retry-after': '40' });
  const out = await runNow('', 'tide-tables', io, NOW);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.refusal.retry_after, 40);
  assert.equal(runNowSaid(out, NOW).line, 'Pressed a moment ago. Try again in 40 seconds.');
});

test('a 429 with no wait in its body takes it from Retry-After', async () => {
  const { io } = fake(429, '<html>slow down</html>', { 'retry-after': '25' });
  assert.equal(runNowSaid(await runNow('', 'tide-tables', io, NOW), NOW).line, 'Pressed a moment ago. Try again in 25 seconds.');
  const dated = fake(429, '', { 'retry-after': new Date(NOW + 30_000).toUTCString() });
  assert.equal(runNowSaid(await runNow('', 'tide-tables', dated.io, NOW), NOW).line, 'Pressed a moment ago. Try again in 30 seconds.');
  const bare = fake(429, '');
  assert.equal(runNowSaid(await runNow('', 'tide-tables', bare.io, NOW), NOW).line, runWords.againSoon);
});

test('the hour’s allowance is said as the record’s, in minutes, never a bare count of seconds', () => {
  const hour: RunAnswer = { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Wait.', retry_after: 1790 } };
  assert.equal(runNowSaid(hour, NOW).line, 'Run now has been pressed as often as this hour allows. Try again in 30 minutes.');
});

test('the wait in words: seconds to ninety, then minutes rounded up, then hours', () => {
  assert.equal(waitWords(1), '1 second');
  assert.equal(waitWords(0), '1 second');
  assert.equal(waitWords(40), '40 seconds');
  assert.equal(waitWords(90), '90 seconds');
  assert.equal(waitWords(91), '2 minutes');
  assert.equal(waitWords(120), '2 minutes');
  assert.equal(waitWords(3600), '60 minutes');
  assert.equal(waitWords(5401), '2 hours');
  for (const s of [91, 200, 3599, 7200]) assert.doesNotMatch(waitWords(s), /second/u);
});

test('no record, no session and an older record each say a sentence, never a code', async () => {
  const dead = async (): Promise<Response> => {
    throw new TypeError('fetch failed');
  };
  assert.equal(runNowSaid(await runNow('', 'tide-tables', dead, NOW), NOW).line, runWords.unreached);
  assert.equal(runNowSaid(await runNow('', 'tide-tables', fake(401, '').io, NOW), NOW).line, runWords.signIn);
  assert.equal(runNowSaid(await runNow('', 'tide-tables', fake(404, '<html>Not found</html>').io, NOW), NOW).line, runWords.older);
  const unknown = fake(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called actionRun.' } });
  assert.equal(runNowSaid(await runNow('', 'tide-tables', unknown.io, NOW), NOW).line, runWords.older);
  assert.equal(runNowSaid(await runNow('', 'tide-tables', fake(502, 'Bad gateway').io, NOW), NOW).line, runWords.unreached);
  assert.equal(runNowSaid({ ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: '' } }, NOW).line, runWords.refusedQuietly);
});

test('no line carries an em dash, a code or an id', () => {
  const lines = [
    runWords.soon,
    runWords.later('2 minutes'),
    runWords.again('40 seconds'),
    runWords.allowance('30 minutes'),
    runWords.againSoon,
    runWords.older,
    runWords.unreached,
    runWords.signIn,
    runWords.refusedQuietly,
  ];
  for (const l of lines) {
    assert.doesNotMatch(l, /—/u);
    assert.doesNotMatch(l, /[A-Z]{2,}_[A-Z]+/u);
  }
});
