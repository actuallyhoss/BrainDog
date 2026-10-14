/**
 * The card's Waiting slot in the order waiting costs (AGT-C08 step 4): this project's questions first as before, each
 * half by Decide's own rank (`waitRank`), read from the `waits` the record said or from `waitOf` on the question, ties
 * in the order handed in, and a question with no weighing after every weighed one. Every row is made up (DIRECTION 27).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectWaiting, waitHeld } from '../src/context-caps.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const at = (ms: number): string => new Date(ms).toISOString();
const DAY = 86_400_000;

const plain = { register: 'kilns', rows: [{ at: 'kilns#1', version: 1, patch: { note: 'fire slower' } }] };
const money = { register: 'kilns', rows: [{ what: 'New shelf', price: { amount: 4200, currency: 'EUR' } }] };

test('A QUESTION OPENED YESTERDAY THAT MOVES MONEY LEADS ONE OPENED A MINUTE AGO THAT IS PLAIN', () => {
  const qs = [
    { id: 'q1', question: 'Reword the kiln note?', body_kind: 'rowset', body: plain, opened_at: at(NOW - 60_000) },
    { id: 'q2', question: 'Buy a new shelf?', body_kind: 'rowset', body: JSON.stringify(money), opened_at: at(NOW - DAY) },
    { id: 'q3', question: 'Rename the glaze list?', body_kind: 'options', body: {}, opened_at: at(NOW - 4 * DAY) },
  ];
  assert.deepEqual(projectWaiting(qs, null, 8, NOW).waiting.map((q) => q.id), ['q2', 'q3', 'q1']);
  assert.deepEqual(qs.map((q) => waitHeld(q, NOW)), ['new', 'soon', 'old']);
});

test('THE WAIT THE RECORD SAID WINS over what the body alone reads, since the record reads the rows too', () => {
  const qs = [
    { id: 'q1', question: 'Reword the kiln note?', body_kind: 'rowset', body: plain, opened_at: at(NOW - 60_000) },
    { id: 'q2', question: 'Fire on Friday?', body_kind: 'rowset', body: plain, opened_at: at(NOW - 120_000), waits: 'soon' },
  ];
  assert.deepEqual(projectWaiting(qs, null, 8, NOW).waiting.map((q) => q.id), ['q2', 'q1']);
  /* and without the instant only the said wait is read: q1 carries no weighing and keeps its place after q2 */
  assert.deepEqual(projectWaiting(qs, null).waiting.map((q) => q.id), ['q2', 'q1']);
});

test('THIS PROJECT FIRST STILL, each half by what waiting costs, and how many are here counted', () => {
  const qs = [
    { id: 'q1', question: 'Reword the kiln note?', project: 'things#1', waits: 'new' },
    { id: 'q2', question: 'Archive last year?', waits: 'soon' },
    { id: 'q3', question: 'Buy a new shelf?', projects: ['things#1'], waits: 'soon' },
    { id: 'q4', question: 'Merge two kiln logs?', waits: 'old' },
  ];
  const here = projectWaiting(qs, 'things#1', 8, NOW);
  assert.deepEqual(here.waiting.map((q) => q.id), ['q3', 'q1', 'q2', 'q4']);
  assert.equal(here.here, 2);
  assert.deepEqual(projectWaiting(qs, 'things#1', 2, NOW).waiting.map((q) => q.id), ['q3', 'q1']);
});

test('TIES KEEP THE ORDER HANDED IN, and a question with no weighing keeps its place after the weighed ones', () => {
  const qs = [
    { id: 'q1', question: 'Fire on Friday?' },
    { id: 'q2', question: 'Reword the kiln note?', waits: 'old' },
    { id: 'q3', question: 'Rename the glaze list?' },
    { id: 'q4', question: 'Merge two kiln logs?', waits: 'old' },
    { id: 'q5', question: 'Buy a new shelf?', waits: 'not a wait' },
  ];
  assert.deepEqual(projectWaiting(qs, null, 8, NOW).waiting.map((q) => q.id), ['q2', 'q4', 'q1', 'q3', 'q5']);
});

test('QUESTIONS WITH NO WEIGHING AT ALL KEEP TODAY\'S ORDER', () => {
  const qs = [
    { id: 'q1', question: 'Rename the glaze list?', project: 'things#2' },
    { id: 'q2', question: 'Merge two kiln logs?', projects: ['things#1'] },
    { id: 'q3', question: 'Archive last year?' },
  ];
  assert.deepEqual(projectWaiting(qs, 'things#1', 8, NOW).waiting.map((q) => q.id), ['q2', 'q1', 'q3']);
  assert.deepEqual(projectWaiting(qs, null, 8, NOW).waiting.map((q) => q.id), ['q1', 'q2', 'q3']);
});
