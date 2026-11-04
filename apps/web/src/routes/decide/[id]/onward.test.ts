/**
 * WHERE A QUESTION WENT, AND THE WAY ON FROM `/decide/<id>`, for every state that is not an open question.
 *
 * COUNTED FROM THE MARKUP ON 22 SEPTEMBER, before the repair. The settled block drew `Next question`
 * only under `{#if committed && nextId && nextId !== question.id}`, and `nextId` was
 * `openIds[here + 1]`, so four states ended the page with nothing to press:
 *
 *   - a question answered here that was LAST in the queue's order, even with open questions above it
 *     (a card link lands anywhere in the queue, so "last" is not "nothing left");
 *   - a question the record had ALREADY decided, which a reader reaches from the Decided list on
 *     `/decide` and which never has `committed` set, so no control at all under the receipt;
 *   - a live question the record says is closed, which drew one sentence and stopped;
 *   - a question DEFERRED when it was the last one, where `goto` was skipped, the page stayed put, and
 *     the question it had just parked was drawn open again underneath the toast.
 *
 * `/decide` answers the same moment with "Nothing waits on you", the age of the last decision and the
 * inbox when something waits there. This screen now says where the question went, how many still wait,
 * and offers the next one, the queue, or the inbox, from one snippet drawn in every one of those states.
 *
 * THE MODULE HALF IS THE EASY HALF, and the queue's own test proved it (`page.test.ts` here): a test
 * that only asks the module stays green with the wiring torn out. So the second half reads the screen.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { nextOpen, stillWaiting, words } from './onward.ts';

const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

test('the next question is the one after this, then the first one above it, never this one', () => {
  assert.equal(nextOpen(['a', 'b', 'c'], 'b'), 'c');
  /* LAST IN THE ORDER IS NOT NOTHING LEFT. This was `undefined`, and the page ended. */
  assert.equal(nextOpen(['a', 'b', 'c'], 'c'), 'a');
  /* A QUESTION ALREADY DECIDED is not in the open list at all: the first open one is next. */
  assert.equal(nextOpen(['a', 'b'], 'z'), 'a');
  assert.equal(nextOpen(['c'], 'c'), undefined);
  assert.equal(nextOpen([], 'c'), undefined);
});

test('what still waits never counts the question on the screen', () => {
  assert.equal(stillWaiting(['a', 'b', 'c'], 'b'), 2);
  assert.equal(stillWaiting(['a', 'b'], 'z'), 2);
  assert.equal(stillWaiting(['c'], 'c'), 0);
});

test('the sentences say where it went and what is left, in words and not a count alone', () => {
  assert.match(words.where, /Needs you keeps it under Decided\.$/u);
  assert.equal(words.left(0), 'Nothing else waits on you.');
  assert.equal(words.left(1), 'One more question waits in Needs you.');
  assert.equal(words.left(3), '3 more questions wait in Needs you.');
});

test('one snippet draws the way on, and every state that is not an open question renders it', () => {
  assert.match(page, /import \{ nextOpen, stillWaiting, words as onwardWords \} from '\.\/onward\.ts';/u);
  assert.match(page, /\{#snippet onward\(\)\}/u, 'there is no single way on for the screen to draw');
  /* NOT FOUND AND REFUSED draw it in their heads, CLOSED AND SETTLED as the receipt's own `wayOn` (abf7ade03): four places,
     and each one draws a way on. */
  assert.equal([...page.matchAll(/\{@render onward\(\)\}/gu)].length, 2, 'not found or refused is drawn without the way on');
  assert.equal([...page.matchAll(/\{@render wayOn\(\)\}/gu)].length, 2, 'closed or settled is drawn without the way on');

  /* AND THE SETTLED BLOCK'S WAY ON IS NO LONGER CONDITIONAL ON THIS SESSION HAVING PRESSED. */
  assert.doesNotMatch(page, /\{#if committed && nextId/u, 'a decision the record already carried still ends the page');
});

test('the way on always offers somewhere, and the next question only when one waits', () => {
  const at = page.indexOf('{#snippet onward()}');
  const end = page.indexOf('{/snippet}', at);
  const snippet = page.slice(at, end);
  assert.match(snippet, /\{#if onwardTo\}/u);
  assert.match(snippet, /href="\/decide\/\{onwardTo\}"/u);
  /* THE QUEUE IS OUTSIDE EVERY CONDITION, so there is no state where the page offers nothing. */
  const back = snippet.indexOf('href="/decide" ');
  assert.ok(back > 0, 'the snippet does not offer the queue');
  const before = snippet.slice(0, back);
  const opens = (before.match(/\{#if /gu) ?? []).length;
  const shuts = (before.match(/\{\/if\}/gu) ?? []).length;
  assert.equal(opens, shuts, 'the way back to the queue is inside a condition, so some state offers nothing');
  assert.match(snippet, /href="\/inbox"/u, 'the inbox the list page offers is not offered here');
});

test('a defer leaves for the next question or the queue instead of redrawing what it parked', () => {
  /* ONE PLACE NOW, WHERE THERE WERE TWO. The sample's defer, which sent nothing, kept its own copy of this
     line, and it went with the sample; the defer that sends `decide` is what is left, and it
     must still leave. */
  const guard = /void goto\(at\(onwardTo \? `\/decide\/\$\{onwardTo\}` : '\/decide'\)\);/gu;
  assert.equal([...page.matchAll(guard)].length, 1, 'a defer still stays on a page that draws the parked question open');
  const deferAt = page.indexOf('async function deferIt() {');
  assert.ok(deferAt >= 0, 'deferIt no longer reads the way this test assumes');
  assert.ok(page.slice(deferAt).search(guard) >= 0, 'the defer that sends `decide` does not leave the page');
});

test('a record that refuses this question offers only its own queue as the way on', () => {
  /* FOUND IN REVIEW. The refused state used to draw only `Back to Decide`; it now
     draws the shared way on, and `openIds` fell back to the SAMPLE queue for every state but `live`,
     so a live record that refused one question offered `Next question` to a sample id it never held.
     The sample is gone: every way on reads the record's own queue, which is empty when
     that read was refused too, and nothing here reads the fixture module. */
  assert.doesNotMatch(page, /from '\$lib\/record\/data\.ts'/u, 'the screen reads the fixture module again');
  for (const read of ['const here = $derived(queue.indexOf(', 'nextOpen(queue, ', 'stillWaiting(queue, '])
    assert.ok(page.includes(read), `the way on no longer reads the record's queue: ${read}`);
});
