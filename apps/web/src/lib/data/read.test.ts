/**
 * The one read's state machine, with no browser, no rune and no record.
 *
 * WHAT THIS PROVES is the part every screen now shares: which of the five states an answer becomes, that an answer for
 * a key the screen has left is dropped, that asking again keeps a good answer on screen while a failure goes back to
 * waiting, and that the record moving asks again exactly once. What it cannot prove is that `read.svelte.ts` brackets
 * each call for the readiness contract or that `ReadState` draws each state: those are the browser gates' to see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reader, settle, type Result } from './read.ts';

const yes = <T>(value: T): Result<T> => ({ ok: true, value });
const no = (code: string, fix: string): Result<never> => ({ ok: false, refusal: { code, fix } });

test('a read starts waiting, and asking for nothing asks nothing', () => {
  const m = reader<string[]>();
  assert.deepEqual(m.now(), { state: 'waiting', value: null, refusal: null });
  assert.equal(m.ask(null), null);
  assert.equal(m.now().state, 'waiting');
});

test('an answer is ready, and an answer the screen calls empty is empty with its value kept', () => {
  const m = reader<string[]>((rows) => rows.length === 0);
  const first = m.ask('obligations');
  assert.ok(first);
  assert.equal(m.answer(first, yes(['rent'])), true);
  assert.deepEqual(m.now(), { state: 'ready', value: ['rent'], refusal: null });

  const again = m.ask('obligations');
  assert.ok(again);
  m.answer(again, yes([]));
  assert.deepEqual(m.now(), { state: 'empty', value: [], refusal: null });
});

test("a refusal is the record's sentence, and only the client's own code is offline", () => {
  assert.deepEqual(settle(no('FORBIDDEN', 'Ask the owner for access.')), {
    state: 'refused',
    value: null,
    refusal: 'Ask the owner for access.',
  });
  assert.deepEqual(settle(no('UNREACHABLE', 'The record could not be reached: timeout')), {
    state: 'offline',
    value: null,
    refusal: 'The record could not be reached: timeout',
  });
  /* The client's `unreachable()` says the sentence in `fix` and the reason in `detail`; the reason is what folds. */
  const sentence = 'BrainDog could not reach this record.';
  assert.deepEqual(settle<number>({ ok: false, refusal: { code: 'UNREACHABLE', fix: sentence, detail: 'timeout' } }), {
    state: 'offline',
    value: null,
    refusal: 'timeout',
  });
  /* A conflict cannot happen on a read; it is still the record saying no, and it carries no sentence. */
  assert.deepEqual(settle<number>({ ok: false, conflict: {} }), { state: 'refused', value: null, refusal: null });
});

test('a call that throws is offline, with what threw kept as the reason', () => {
  const m = reader<number>();
  const t = m.ask('usage');
  assert.ok(t);
  assert.equal(m.failed(t, 'Failed to fetch'), true);
  assert.deepEqual(m.now(), { state: 'offline', value: null, refusal: 'Failed to fetch' });
});

test('an answer for a key the screen has left is dropped', () => {
  const m = reader<string>();
  const left = m.ask('a');
  const here = m.ask('b');
  assert.ok(left && here);
  assert.equal(m.answer(left, yes('from a')), false);
  assert.equal(m.failed(left, 'late'), false);
  assert.equal(m.now().state, 'waiting');
  assert.equal(m.answer(here, yes('from b')), true);
  assert.equal(m.now().value, 'from b');
});

test("a new key never shows the last key's answer, and a null key drops the question", () => {
  const m = reader<string>();
  const a = m.ask('a');
  assert.ok(a);
  m.answer(a, yes('from a'));
  m.ask('b');
  assert.deepEqual(m.now(), { state: 'waiting', value: null, refusal: null });

  const b = m.ask('b');
  assert.ok(b);
  m.ask(null);
  assert.equal(m.answer(b, yes('from b')), false);
  assert.equal(m.now().state, 'waiting');
});

test('asking the same key again keeps a good answer on screen, and a failure goes back to waiting', () => {
  const m = reader<string>();
  const first = m.ask('a');
  assert.ok(first);
  m.answer(first, yes('kept'));
  m.ask('a');
  assert.deepEqual(m.now(), { state: 'ready', value: 'kept', refusal: null });

  const second = m.ask('a');
  assert.ok(second);
  m.answer(second, no('UNREACHABLE', 'The record could not be reached: offline'));
  assert.equal(m.now().state, 'offline');
  m.ask('a');
  assert.deepEqual(m.now(), { state: 'waiting', value: null, refusal: null });
});

test('the record moving asks again once, and the version the screen opened on is not news', () => {
  const m = reader<string>(undefined, 7);
  assert.equal(m.heard(8), false, 'nothing has been asked yet, so there is nothing to ask again');
  m.ask('a');
  assert.equal(m.heard(8), false, 'the same version twice is one change');
  assert.equal(m.heard(3), true, 'a hash can come back smaller, and it is still a change');
  assert.equal(m.heard(3), false);
  assert.equal(m.heard(null), false);

  const opened = reader<string>(undefined, 7);
  opened.ask('a');
  assert.equal(opened.heard(7), false);
});

test('a quiet ask the record moving made keeps a good answer on screen when it fails, and a loud one does not', () => {
  const m = reader<string>();
  const first = m.ask('a');
  assert.ok(first);
  m.answer(first, yes('kept'));

  const quiet = m.ask('a', true);
  assert.ok(quiet);
  assert.equal(m.answer(quiet, no('UNREACHABLE', 'The record could not be reached: offline')), true);
  assert.deepEqual(m.now(), { state: 'ready', value: 'kept', refusal: null }, 'a failed background re-read keeps the rows');
  const thrown = m.ask('a', true);
  assert.ok(thrown);
  m.failed(thrown, 'Failed to fetch');
  assert.equal(m.now().state, 'ready', 'and so does one that threw');

  const answered = m.ask('a', true);
  assert.ok(answered);
  m.answer(answered, yes('newer'));
  assert.equal(m.now().value, 'newer', 'an answer still lands');

  const loud = m.ask('a');
  assert.ok(loud);
  m.answer(loud, no('FORBIDDEN', 'Ask the owner for access.'));
  assert.equal(m.now().state, 'refused', 'a re-read somebody asked for still shows its refusal');
});

test('a late copy fills a question still waiting, a failure behind it keeps it, and an answer replaces it', () => {
  const m = reader<string>();
  const t = m.ask('today');
  assert.ok(t);
  assert.equal(m.fill('elsewhere', 'copy'), false, 'another question');
  assert.equal(m.fill('today', 'copy'), true);
  assert.deepEqual(m.now(), { state: 'ready', value: 'copy', refusal: null });
  assert.equal(m.answer(t, no('UNREACHABLE', 'offline')), true);
  assert.equal(m.now().value, 'copy', 'the record not reached keeps the copy');
  const again = m.ask('today');
  assert.ok(again);
  assert.equal(m.answer(again, yes('record')), true);
  assert.equal(m.now().value, 'record');
});

test('a late copy never replaces the record', () => {
  const m = reader<string>();
  const t = m.ask('today');
  assert.ok(t);
  m.answer(t, yes('record'));
  assert.equal(m.fill('today', 'copy'), false);
  assert.equal(m.now().value, 'record');
  const r = m.ask('other');
  assert.ok(r);
  m.answer(r, no('FORBIDDEN', 'No.'));
  assert.equal(m.fill('other', 'copy'), false, 'nor a refusal');
});
