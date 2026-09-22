/**
 * AN ID THE READER CAN SAY IS PRINTED, AND A HANDLE IS NOT.
 *
 * `loop/research-hidden-questions.md` measured a one-list member reading `SG6`, `D4` and the rest off
 * the record: every number she was handed told her how many questions she was not shown. The record's
 * half of the repair hands her `q.<ULID>` and `d.<ULID>` instead, and a handle is 28 characters that
 * mean nothing read aloud. So where `/decide` and `/decide/<id>` printed `q.id`, they print it only
 * when it is spoken, and an owner, who is still handed `SG12` and `D4`, sees the line he saw before.
 *
 * THE MODULE HALF IS THE EASY HALF, as `[id]/onward.test.ts` learned: a test that only asks the helper
 * stays green with the markup still printing `{q.id}`. So the second half reads the screen.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { spoken } from './spoken.ts';

const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

test('a question or decision number is spoken, and a handle is not', () => {
  assert.equal(spoken('SG12'), true);
  assert.equal(spoken('D4'), true);
  assert.equal(spoken('q.01M8Z3K4T5V6W7X8Y9Z0ABCDEF'), false);
  assert.equal(spoken('d.01M8Z3K4T5V6W7X8Y9Z0ABCDEF'), false);
  /* THE SAMPLE RECORD'S OWN IDS STILL PRINT: only the two handle shapes are held back, so an id this
     helper has never heard of is shown rather than silently dropped. */
  assert.equal(spoken('in_8f21'), true);
  assert.equal(spoken(''), false);
});

test('the queue line and the Decided ledger print the id only when it is spoken', () => {
  assert.match(page, /import \{ spoken \} from '\.\/spoken\.ts';/u);
  /* A BARE `{q.id}` INSIDE EITHER SPAN is exactly the handle the record now hands a one-list member. */
  assert.doesNotMatch(page, /(?<!\{#if spoken\(q\.id\)\})<span class="q-id">/u, 'the queue line still prints a handle');
  assert.doesNotMatch(page, /(?<!\{#if spoken\(q\.id\)\})<span class="decided-id">/u, 'the Decided ledger still prints a handle');
  assert.match(page, /\{#if spoken\(q\.id\)\}<span class="q-id">\{q\.id\}<\/span>\{\/if\}/u);
  assert.match(page, /\{#if spoken\(q\.id\)\}<span class="decided-id">\{q\.id\}<\/span>\{\/if\}/u);
});
