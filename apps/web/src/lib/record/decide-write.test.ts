/**
 * Decide's writes against the record: a decision that lands, a refusal in the record's words, a conflict that says the
 * rows moved, and no record behind the screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import type { Fetch } from './boot-live.ts';
import { answerMany, answerQuestion, parkQuestion } from './decide-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { url: URL; method: string; body: unknown };

function host(answer: ((sent: Sent) => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const one = { url: new URL(String(url)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    sent.push(one);
    if (!answer) throw new TypeError('fetch failed');
    return answer(one);
  }) as Fetch;
  return { io, sent };
}

test('an answer the record takes is written, sent as decide with the option and the trimmed reason', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { decision: 'D7', suggestion: 'SG2', status: 'resolved', wrote: [] } }));
  const out = await answerQuestion(BASE, 'SG2', 'product', '  Matches how the fonts are used.  ', io);
  assert.deepEqual(out, { from: 'written', decision: 'D7' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url.pathname, '/api/decide');
  assert.equal(sent[0]!.method, 'POST');
  assert.deepEqual(sent[0]!.body, { id: 'SG2', decide: { option: 'product', reason: 'Matches how the fonts are used.' } });
});

test('a pick that left entries changed since says so in the record\'s line, and so does a question closed with none written', async () => {
  const said = 'One was written. "Gym" was left as it is, because it changed after this was asked.';
  const left = host(() => json(200, { ok: true, value: { decision: 'D9', suggestion: 'SG4', status: 'resolved', wrote: ['01A'], skipped: { count: 1, said } } }));
  assert.deepEqual(await answerQuestion(BASE, 'SG4', 'last', undefined, left.io), { from: 'written', decision: 'D9', said });
  const line = 'All 2 entries this changes changed after this was asked, so nothing was written and the question is closed.';
  const none = host(() => json(200, { ok: true, value: { decision: null, suggestion: 'SG5', status: 'resolved', wrote: [], settled: line } }));
  assert.deepEqual(await answerQuestion(BASE, 'SG5', 'last', undefined, none.io), { from: 'written', decision: null, said: line });
});

test('parking sends the day and the why, and nothing carries approve lines of its own', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { suggestion: 'SG2', status: 'deferred' } }));
  assert.deepEqual(await parkQuestion(BASE, 'SG2', '2026-10-01', ' Waiting on the quote. ', io), { from: 'written', decision: null });
  assert.deepEqual(sent[0]!.body, { id: 'SG2', defer: { until: '2026-10-01', why: 'Waiting on the quote.' } });

  await answerQuestion(BASE, 'SG5', 'accept', 'The calls are the ones we agreed.', io);
  assert.deepEqual(Object.keys(sent[1]!.body as object).sort(), ['decide', 'id']);
});

test('an empty reason or an empty day asks the record nothing', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: {} }));
  assert.deepEqual(await answerQuestion(BASE, 'SG2', 'seat', '   ', io), { from: 'refused', fix: copy.reasonRequired });
  assert.deepEqual(await parkQuestion(BASE, 'SG2', '', 'Later.', io), { from: 'refused', fix: copy.reasonRequired });
  assert.equal(sent.length, 0);
});

test('a refusal is the record sentence', async () => {
  const { io } = host(() =>
    json(422, { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Add the key called "fenwick" to the Keychain, then accept.' } }),
  );
  assert.deepEqual(await answerQuestion(BASE, 'SG5', 'accept', 'Agreed.', io), {
    from: 'refused',
    fix: 'Add the key called "fenwick" to the Keychain, then accept.',
  });
});

test('a conflict says a row changed since it was proposed', async () => {
  const { io } = host(() => json(409, { ok: false, conflict: { version: 4, current: {}, actor: 'sami' } }));
  assert.deepEqual(await answerQuestion(BASE, 'SG4', 'accept', 'Both are right.', io), { from: 'conflict', fix: copy.decideConflict });
});

/* NO SAMPLE, SO NO `gone`. A host that does not answer, a sign-in wall and a 404 that is not JSON were `gone` at an
   address with no slug, the one place the sample used to be drawn instead of the record. They are the refusal
   they are, with its sentence, wherever the screen is. */
test('no record behind the screen is refused, with a sentence: nothing answering, a sign-in wall, a 404 that is not JSON', async () => {
  const down = await answerQuestion(BASE, 'SG2', 'seat', 'Because.', host(null).io);
  assert.equal(down.from, 'refused');
  assert.ok(down.from === 'refused' && down.fix.length > 0);

  const wall = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } }));
  assert.deepEqual(await answerQuestion(BASE, 'SG2', 'seat', 'Because.', wall.io), { from: 'refused', fix: 'Sign in.' });

  const page = host(() => new Response('<h1>Not found</h1>', { status: 404, headers: { 'content-type': 'text/html' } }));
  assert.equal((await parkQuestion(BASE, 'SG2', '2026-10-01', 'Later.', page.io)).from, 'refused');
});

test('accepting some rows of several sends their places beside the option, and accepting all sends none', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { decision: 'D8', suggestion: 'SG6', status: 'resolved', wrote: ['e_1'] } }));
  assert.deepEqual(await answerQuestion(BASE, 'SG6', 'accept', 'Only the two I use.', io, [0, 2]), { from: 'written', decision: 'D8' });
  assert.deepEqual(sent[0]!.body, { id: 'SG6', decide: { option: 'accept', reason: 'Only the two I use.', rows: [0, 2] } });
  await answerQuestion(BASE, 'SG7', 'accept', 'All of them.', io);
  assert.deepEqual(sent[1]!.body, { id: 'SG7', decide: { option: 'accept', reason: 'All of them.' } });
});

test('a group is one decide call with its ids, and says what was written, the decision to undo, and who was refused', async () => {
  const fix = 'SG3 is resolved, and a decision is made once.';
  const { io, sent } = host(() =>
    json(200, { ok: true, value: { batch: 'b1', decided: [{ id: 'SG1', decision: 'D4' }, { id: 'SG2', decision: 'D5' }], refused: [{ id: 'SG3', fix }] } }),
  );
  const out = await answerMany(BASE, ['SG1', 'SG2', 'SG3'], 'accept', undefined, io);
  assert.deepEqual(out, { from: 'written', done: 2, decision: 'D4', refused: [{ id: 'SG3', fix }] });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.body, { ids: ['SG1', 'SG2', 'SG3'], decide: { option: 'accept' } });
});
