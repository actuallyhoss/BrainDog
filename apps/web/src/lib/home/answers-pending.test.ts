/**
 * The Needs you count moves on the press (`answers-pending.ts`): taken off at once, back on Undo or a refusal, and let go
 * only by a `boot` read after the write landed, so the number never jumps back up between the press and the poll.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { heard, lessPending, pressed, takenBack, written, type Pending } from './answers-pending.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a press takes one off at once, and Undo puts it back', () => {
  let p: Pending = new Map();
  p = pressed(p, 'SG1');
  assert.equal(lessPending(9, p), 8, 'the count drops on the press, before anything is sent');
  assert.equal(lessPending(9, pressed(p, 'SG1')), 8, 'pressing the same question twice is one');
  p = takenBack(p, 'SG1');
  assert.equal(lessPending(9, p), 9, 'Undo counts it again');
});

test('a refusal puts it back, and the count never goes under nought', () => {
  const p = pressed(pressed(new Map(), 'SG1'), 'SG2');
  assert.equal(lessPending(1, p), 0);
  assert.equal(lessPending(9, takenBack(p, 'SG2')), 8, 'the refused one counts again, the other stays off');
});

test('a boot read before the write keeps it off; one read after lets it go, so nothing is taken off twice', () => {
  let p: Pending = pressed(new Map(), 'SG1');
  /* A poll while the answer is still held for its Undo: boot still counts it, so it stays taken off. */
  p = heard(p, 5);
  assert.equal(lessPending(9, p), 8);
  p = written(p, 'SG1', 7);
  assert.equal(lessPending(9, heard(p, 6)), 8, 'a read begun before the write still counts it, so it stays off');
  p = heard(p, 7);
  assert.equal(p.size, 0, 'a read begun after the write counts it gone itself');
  assert.equal(lessPending(8, p), 8, 'and the record’s own 8 is said as it is');
  assert.equal(written(new Map(), 'SG9', 3).size, 0, 'a write this tab never pressed is not taken off');
});

test('every count reads through it: the rail, the tab, Today and the Decide head all ask waitsNow, and the card says each step', () => {
  const waits = read('./waits.svelte.ts');
  assert.match(waits, /lessPending\(state\.waits\.questions, pending\)/u, 'waitsNow says the count less what was pressed');
  const card = read('../decide/DecisionCard.svelte');
  assert.match(card, /answerPressed\(question\.id\)/u, 'the press takes it off at once');
  assert.match(card, /answerTakenBack\(question\.id\)/u, 'Undo and a refusal put it back');
  assert.match(card, /answerWritten\(question\.id\)/u, 'the write is marked with its ticket');
  const layout = read('../../routes/+layout.svelte');
  assert.match(layout, /const asked = waitsTicket\(\);/u, 'the poll takes its ticket before it asks boot');
  assert.match(layout, /heardWaits\(\{ waits: m\.waitsOf\(got\.boot\), working: m\.workingOf\(got\.boot\) \}, asked\)/u);
});
