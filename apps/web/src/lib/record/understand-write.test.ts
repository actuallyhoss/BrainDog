/**
 * Read what you already have, from Settings › People: a dry look first, in names, then Do it, then Undo by the batches
 * Do it answered. The record's `understandPlan` is asked first, and `understand({ dry })` where a build has no such read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Fetch } from './boot-live.ts';
import { doIt, lookFirst, lookOf, undoIt, understandWords as w } from './understand-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A host that answers by the method it was sent, and keeps every call. */
function host(answer: (method: string, body: Record<string, unknown>) => Response): { io: Fetch; sent: { method: string; body: Record<string, unknown> }[] } {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    sent.push({ method, body });
    return answer(method, body);
  }) as Fetch;
  return { io, sent };
}

const SLICE = {
  dry: true,
  kinds: [
    { kind: 'payments', looked: 40, linked: 3, refused: 0, organisations: 1 },
    { kind: 'runs', looked: 12, linked: 1, refused: 0 },
    { kind: 'services', looked: 4, linked: 0, refused: 0 },
  ],
  writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
  more: 2,
  questions: ['Which project is Fly for?'],
  asks: { 'service-project': 1 },
  done: false,
};

const refusal = (code: string, fix: string) => json(200, { ok: false, refusal: { code, fix } });

test('THE LOOK says what it would link and add in names, the first changes, what it would ask, and that there is more', () => {
  const look = lookOf(SLICE, true);
  assert.deepEqual(look, {
    said: 'This would link 3 payments to who they were with and 1 run to its project, and add 1 organisation.',
    lines: SLICE.writes,
    more: 'and 2 more',
    asks: w.wouldAsk(1),
    done: false,
    empty: false,
  });
  assert.ok(!/payments:|service-project|_/u.test([look?.said, look?.asks].join(' ')), 'no keys a person never wrote');
});

test('DONE, the same answer is said in the past, with the questions it filed', () => {
  const look = lookOf({ ...SLICE, dry: false, done: true, filed: [{ id: 'D4', question: 'Which project is Fly for?' }], undo: ['b1', 'b2'] }, false);
  assert.equal(look?.said, 'Linked 3 payments to who they were with and 1 run to its project, and added 1 organisation.');
  assert.equal(look?.asks, w.asked(1));
  assert.equal(look?.done, true);
});

test('nothing to link is said as nothing, and leaves no Do it; a shape this build cannot read is no look', () => {
  const none = lookOf({ dry: true, kinds: [{ kind: 'payments', looked: 9, linked: 0, refused: 0 }], writes: [], more: 0, questions: [], asks: {}, done: true }, true);
  assert.equal(none?.said, w.nothing);
  assert.equal(none?.empty, true);
  assert.equal(lookOf({ dry: true, kinds: [], writes: [], more: 0, questions: [], asks: {}, done: true }, true)?.said, w.nothing);
  assert.equal(lookOf({ kinds: [{ kind: 'payments', organisations: 2 }] }, true)?.said, w.wouldAdd(w.organisations(2)));
  assert.equal(lookOf(null, true), null);
  assert.equal(lookOf({ writes: [] }, true), null);
});

test('THE LOOK ASKS `understandPlan` FIRST, and nothing else when it answers', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: SLICE }));
  const out = await lookFirst(BASE, io);
  assert.equal(out.from, 'look');
  assert.deepEqual(sent.map((s) => s.method), ['understandPlan']);
});

test('a build with no `understandPlan` is asked the same look by `understand({ dry })`', async () => {
  for (const code of ['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']) {
    const { io, sent } = host((m) => (m === 'understandPlan' ? refusal(code, 'Not here.') : json(200, { ok: true, value: SLICE })));
    const out = await lookFirst(BASE, io);
    assert.equal(out.from, 'look', code);
    assert.deepEqual(sent.map((s) => [s.method, s.body.dry]), [['understandPlan', undefined], ['understand', true]], code);
  }
});

test('a refusal is the record’s own sentence, and a build with neither is missing, never a crash', async () => {
  const owner = host(() => refusal('LEVEL_REQUIRED', 'This needs owner, and you have read access.'));
  assert.deepEqual(await lookFirst(BASE, owner.io), { from: 'refused', fix: 'This needs owner, and you have read access.' });
  assert.equal(owner.sent.length, 1, 'a refusal of the read is not asked again by another name');
  const none = host(() => refusal('ROUTE_UNKNOWN', 'This BrainDog has no such door.'));
  assert.equal((await lookFirst(BASE, none.io)).from, 'missing');
});

test('DO IT sends no dry, answers what Undo takes back, and Undo sends those batches back as they came', async () => {
  const { io, sent } = host((_m, body) =>
    json(200, { ok: true, value: body.undo ? { undone: 4, said: 'Put back 4 changes.' } : { ...SLICE, dry: false, done: true, undo: ['b1', 'b2'], filed: [] } }),
  );
  const done = await doIt(BASE, io);
  assert.equal(done.from, 'done');
  assert.deepEqual(done.from === 'done' && done.undo, ['b1', 'b2']);
  const back = await undoIt(BASE, done.from === 'done' ? done.undo : [], io);
  assert.deepEqual(back, { from: 'undone', said: 'Put back 4 changes.' });
  assert.deepEqual(sent.map((s) => [s.method, s.body]), [['understand', {}], ['understand', { undo: ['b1', 'b2'] }]]);
});
