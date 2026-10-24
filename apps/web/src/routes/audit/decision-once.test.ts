/**
 * ONE DECISION IS ONE LINE IN ACTIVITY (the audit of 25 October, Z34).
 *
 * WHAT WAS WRONG. Answering "Keep 6 key numbers for Crumb.gg?" wrote a decision and the question's close, both by him,
 * both at 20:31, and Activity drew both: "Closed “Keep 6 key numbers…”" with "Answered in one press, with no reason
 * given", then "Decided “Keep 6 key numbers…”" (`audit-390-light.png`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AuditEvent, EventKind } from '../../lib/record/schema.ts';
import { burstsOf, oneDecision } from './lines.ts';

let seq = 500;
const ev = (at: string, kind: EventKind, target: string, note = '', by = 'you'): AuditEvent => ({ seq: seq--, at, by, kind, target, note, version: seq + 1 });

const AT = '2026-10-24T17:31:04.000Z';
const QUESTION = 'suggestion:SG290';

test('a question closed and decided in one press is drawn once, as the decision, keeping the close’s note', () => {
  const log = [ev(AT, 'resolve', QUESTION, 'Answered in one press, with no reason given.'), ev(AT, 'decide', QUESTION), ev(AT, 'create', 'key_numbers#4')];
  const drawn = burstsOf(oneDecision(log));
  const about = drawn.filter((t) => t.e.target === QUESTION);
  assert.equal(about.length, 1, 'one decision is drawn as two lines');
  assert.equal(about[0]!.e.kind, 'decide');
  assert.equal(about[0]!.note, 'Answered in one press, with no reason given.');
  assert.equal(drawn.length, 2, 'a line that was no twin went missing');
});

test('a close with no decision beside it, or somebody else’s, or a day apart, is drawn as it was', () => {
  const lapsed = [ev(AT, 'resolve', QUESTION, 'Lapsed.')];
  assert.deepEqual(oneDecision(lapsed), lapsed);
  const others = [ev(AT, 'resolve', QUESTION, '', 'agent:claude'), ev(AT, 'decide', QUESTION)];
  assert.equal(oneDecision(others).length, 2);
  const apart = [ev('2026-10-25T17:31:04.000Z', 'resolve', QUESTION), ev(AT, 'decide', QUESTION)];
  assert.equal(oneDecision(apart).length, 2);
});

test('Activity folds the log before it counts or draws a line', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /const kept = \$derived\(newestFirst\(oneDecision\(changesOf\(LOG, everything\)\)\)\);/u);
});
