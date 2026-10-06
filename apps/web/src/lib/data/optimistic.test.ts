/**
 * A write drawn before the record answers, with no browser and no record: the runner, the overlay a list draws, and
 * which rows arrived.
 *
 * WHAT THIS PROVES is the order of things. The change is on screen before `send` has answered; a refusal takes it back
 * and says the record's sentence; a landing settles and offers Undo for six seconds; and Undo is itself drawn first.
 * What it cannot prove is that a screen wires them: `page-writes.test.ts`-style checks and the browser do that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivals, optimist, overlay, UNDO_MS, UNSENT, type Say, type Sent } from './optimistic.ts';

/** A toast stack that keeps what it was told. */
function said() {
  const lines: { text: string; intent?: string | undefined; life?: number | undefined; undo?: (() => void) | undefined }[] = [];
  const say: Say = {
    push(text, opts = {}) {
      lines.push({ text, intent: opts.intent, life: opts.life, undo: opts.undo });
      return lines.length;
    },
  };
  return { say, lines };
}

/** A send the test answers by hand. */
function later<T>() {
  let answer: (v: Sent<T>) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const promise = new Promise<Sent<T>>((r, j) => ((answer = r), (fail = j)));
  return { send: () => promise, answer, fail };
}

const settle = () => new Promise<void>((r) => setImmediate(r));

test('the change is drawn before the write answers, and a landing settles it and offers Undo for six seconds', async () => {
  const { say, lines } = said();
  const steps: string[] = [];
  const w = later<number>();
  const done = optimist(say).run({
    apply: () => steps.push('apply'),
    revert: () => steps.push('revert'),
    send: () => (steps.push('send'), w.send()),
    settle: (v) => steps.push(`settle ${v}`),
    said: (v) => `Marked Rent done at version ${v}.`,
    undo: () => ({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: 0 }) }),
  });
  assert.deepEqual(steps, ['apply', 'send'], 'drawn first, sent second, and nothing settled while it is out');
  w.answer({ ok: true, value: 8 });
  const out = await done;
  assert.deepEqual(out, { ok: true, value: 8 });
  assert.deepEqual(steps, ['apply', 'send', 'settle 8']);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.text, 'Marked Rent done at version 8.');
  assert.equal(lines[0]?.life, UNDO_MS);
  assert.equal(UNDO_MS, 6_000);
  assert.equal(typeof lines[0]?.undo, 'function');
});

test('a refusal takes the drawing back and says the record’s one sentence, and nothing settles', async () => {
  const { say, lines } = said();
  const steps: string[] = [];
  const out = await optimist(say).run({
    apply: () => steps.push('apply'),
    revert: () => steps.push('revert'),
    send: async () => ({ ok: false, fix: 'Somebody changed tasks#4 first.' }),
    settle: () => steps.push('settle'),
    said: 'Marked it done.',
  });
  assert.equal(out.ok, false);
  assert.deepEqual(steps, ['apply', 'revert']);
  assert.deepEqual(lines.map((l) => [l.text, l.intent, typeof l.undo]), [['Somebody changed tasks#4 first.', 'warn', 'undefined']]);
});

test('a write that throws is put back with a plain sentence', async () => {
  const { say, lines } = said();
  const steps: string[] = [];
  const w = later<number>();
  const done = optimist(say).run({ apply: () => steps.push('apply'), revert: () => steps.push('revert'), send: w.send });
  w.fail(new Error('Failed to fetch'));
  await done;
  assert.deepEqual(steps, ['apply', 'revert']);
  assert.equal(lines[0]?.text, UNSENT);
});

test('Undo is the way back built from what landed, drawn at once, and a refused Undo puts the change back again', async () => {
  const { say, lines } = said();
  let state = 'open';
  const run = optimist(say).run;
  await run({
    apply: () => (state = 'done'),
    revert: () => (state = 'open'),
    send: async () => ({ ok: true, value: 3 }),
    said: 'Marked it done.',
    undo: (version) => ({
      apply: () => (state = 'open'),
      revert: () => (state = 'done'),
      send: async () => (version === 3 ? { ok: false as const, fix: 'The record moved on.' } : { ok: true as const, value: 0 }),
    }),
  });
  assert.equal(state, 'done');
  lines[0]?.undo?.();
  assert.equal(state, 'open', 'Undo is drawn before its write answers');
  await settle();
  assert.equal(state, 'done', 'and a refused Undo is drawn back');
  assert.equal(lines.at(-1)?.text, 'The record moved on.');
});

test('an Undo may be the screen’s own way back, run as it is', async () => {
  const { say, lines } = said();
  let pressed = 0;
  await optimist(say).run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: 1 }), said: 'Saved.', undo: () => () => pressed++ });
  lines[0]?.undo?.();
  assert.equal(pressed, 1);
});

test('a change with no receipt says nothing when it lands', async () => {
  const { say, lines } = said();
  await optimist(say).run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: 1 }) });
  assert.equal(lines.length, 0);
});

test('AN EMPTY RECEIPT raises no toast', async () => {
  const { say, lines } = said();
  await optimist(say).run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: 1 }), said: '' });
  await optimist(say).run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: 1 }), said: () => '' });
  assert.equal(lines.length, 0);
});

test('WITH THE RECORD’S UNDO HANDED IN, a write that landed under a batch is put back by the record and read again', async () => {
  const { say, lines } = said();
  const log: string[] = [];
  const undoBatch = async (batch: string) => (log.push(`undo ${batch}`), { from: 'undone' as const, put: 2, skipped: [], said: 'Put back 2 changes.' });
  const { run } = optimist(say, { undoBatch });
  await run({
    apply: () => {},
    revert: () => {},
    send: async () => ({ ok: true, value: { seq: 4, batch: 'b9' } }),
    said: 'Marked Rent done.',
    undo: () => ({ apply: () => log.push('draw'), revert: () => log.push('drop'), send: async () => (log.push('inverse'), { ok: true, value: null }) }),
    reread: () => log.push('reread'),
  });
  lines[0]?.undo?.();
  await settle();
  await settle();
  assert.deepEqual(log, ['draw', 'undo b9', 'reread', 'drop']);
  assert.deepEqual(lines.map((l) => l.text), ['Marked Rent done.', 'Put back 2 changes.']);
});

test('WITH THE RECORD’S UNDO HANDED IN, a self-drawn way back the record replaced still has the screen read again', async () => {
  const { say, lines } = said();
  const log: string[] = [];
  const undoBatch = async () => ({ from: 'undone' as const, put: 1, skipped: [], said: 'Put back 1 change.' });
  const { run } = optimist(say, { undoBatch, reread: () => log.push('reread') });
  await run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: { batch: 'b2' } }), said: 'Archived Rent.', undo: () => () => log.push('own') });
  lines[0]?.undo?.();
  await settle();
  await settle();
  assert.deepEqual(log, ['reread']);
});

test('WITH THE RECORD’S UNDO HANDED IN, a write that said no batch is undone by the screen’s own way back', async () => {
  const { say, lines } = said();
  const asked: string[] = [];
  let pressed = 0;
  const { run } = optimist(say, { undoBatch: async (b) => (asked.push(b), { from: 'missing', fix: '' }) });
  await run({ apply: () => {}, revert: () => {}, send: async () => ({ ok: true, value: { seq: 4 } }), said: 'Saved.', undo: () => () => pressed++ });
  lines[0]?.undo?.();
  assert.equal(pressed, 1);
  assert.deepEqual(asked, []);
});

type Row = { id: string; state: string };
const key = (r: Row) => r.id;

test('the overlay draws patches, additions and removals over the answer, and dropping one is the revert', () => {
  let moved = 0;
  const o = overlay<Row>(key, () => moved++);
  const answer: Row[] = [
    { id: 'a', state: 'open' },
    { id: 'b', state: 'open' },
  ];
  const tick = o.patch('a', (r) => ({ ...r, state: 'done' }));
  const added = o.add({ id: 'new', state: 'open' });
  const gone = o.remove('b');
  assert.deepEqual(o.draw(answer), [
    { id: 'new', state: 'open' },
    { id: 'a', state: 'done' },
  ]);
  assert.equal(o.size, 3);
  o.drop(gone);
  o.drop(gone);
  assert.deepEqual(o.draw(answer).map((r) => r.id), ['new', 'a', 'b'], 'dropping twice is dropping once');
  o.drop(tick);
  o.drop(added);
  assert.deepEqual(o.draw(answer), answer);
  assert.equal(moved, 6, 'three changes and three drops each said so, and the second drop of one said nothing');
});

test('a poll that re-reads the list while a write is out still draws the change, and an added row is drawn once', () => {
  const o = overlay<Row>(key);
  o.patch('a', (r) => ({ ...r, state: 'done' }));
  o.add({ id: 'c', state: 'open' }, 'end');
  const reread: Row[] = [
    { id: 'a', state: 'open' },
    { id: 'c', state: 'open' },
  ];
  assert.deepEqual(o.draw(reread), [
    { id: 'a', state: 'done' },
    { id: 'c', state: 'open' },
  ]);
  /* A patch over a row somebody else removed is not a way to bring it back. */
  assert.deepEqual(o.draw([{ id: 'c', state: 'open' }]), [{ id: 'c', state: 'open' }]);
  o.clear();
  assert.equal(o.size, 0);
});

test('a list’s first look is its baseline, a row that arrives after it is marked for 1.5 s, and the mark then goes', () => {
  let t = 0;
  const a = arrivals(() => t);
  assert.deepEqual([...a.see('tasks', ['1', '2'])], [], 'opening a screen marks nothing');
  t = 100;
  assert.deepEqual([...a.see('tasks', ['3', '1', '2'])], ['3']);
  assert.deepEqual([...a.see('tasks', ['3', '1', '2'])], ['3'], 'the same answer drawn again keeps the mark and adds none');
  assert.deepEqual([...a.see('money', ['3'])], [], 'another list has its own baseline');
  assert.equal(a.next(), 1_600);
  t = 1_600;
  assert.deepEqual([...a.see('tasks', ['3', '1', '2'])], []);
  assert.equal(a.next(), null);
  a.forget();
  assert.deepEqual([...a.see('tasks', ['9'])], [], 'forgotten, the next look is a baseline again');
});
