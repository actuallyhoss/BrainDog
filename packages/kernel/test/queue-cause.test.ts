/**
 * A QUESTION ON A PAGE CARRIES ITS FAMILY (AGT-C07 job d): `cause`, the one key for what it is about, and `alike`, how
 * many open questions share it, so Decide draws one card for a family. The record fills both; the page carries them
 * through the queue, open or put off, and leaves off a count of a family that has no name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { readBlock, type PageBlock, type PageDeps, type QueueQuestion } from '../src/pages.ts';

const NOW = Date.UTC(2026, 9, 9, 7);

const question = (id: string, more: Partial<QueueQuestion> = {}): QueueQuestion => ({
  id,
  who: 'slash',
  at: '2026-10-08T09:00:00.000Z',
  kind: 'rowset',
  question: 'File these bank texts?',
  why: '',
  cost: 'rows',
  options: [],
  about: 'transactions#4',
  ...more,
});

const OPEN = [
  question('q1', { cause: 'pattern#bank-texts', alike: 3 }),
  question('q2', { cause: 'pattern#bank-texts', alike: 3, kind: 'options', cost: 'call' }),
  question('q3', { question: 'Raise the retainer?', about: 'obligations#2' }),
  question('q4', { cause: '  ', alike: 2 }),
  question('q5', { cause: 'write#tasks#9#ab12', alike: 0 }),
];

function depsWith(more: Partial<PageDeps>): PageDeps {
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    ...more,
  };
}

const QUEUE: PageBlock = { kind: 'queue', source: 'governance.open', limit: 10 };
const family = (q: QueueQuestion) => [q.id, q.cause ?? null, q.alike ?? null];

test('AN OPEN QUESTION CARRIES ITS CAUSE AND HOW MANY SHARE IT, and one with no cause carries neither', () => {
  const read = readBlock(depsWith({ openQuestions: () => ({ questions: OPEN, open: OPEN.length }) }), QUEUE);
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.queue?.map(family), [
    ['q1', 'pattern#bank-texts', 3],
    ['q2', 'pattern#bank-texts', 3],
    ['q3', null, null],
    ['q4', null, null],
    ['q5', 'write#tasks#9#ab12', null],
  ]);
  const q3 = read.queue?.find((q) => q.id === 'q3');
  assert.ok(q3 && !('cause' in q3) && !('alike' in q3), 'nothing said is left off, never written as null');
});

test('A BLANK CAUSE IS NO CAUSE, and a count below one, or not whole, is no count: a question is always one of its own family', () => {
  const read = readBlock(
    depsWith({ openQuestions: () => ({ questions: [question('q6', { cause: 'x', alike: 1.5 }), question('q7', { cause: 'y', alike: 1 })], open: 2 }) }),
    QUEUE,
  );
  assert.deepEqual(read.queue?.map(family), [
    ['q6', 'x', null],
    ['q7', 'y', 1],
  ]);
});

test('A FILTER ON THE QUEUE KEEPS THE FAMILY, and the lead question carries it beside what accepting does', () => {
  const read = readBlock(
    depsWith({ openQuestions: () => ({ questions: OPEN.map((q) => (q.id === 'q2' ? { ...q, does: 'Files 3 bank texts.' } : q)), open: OPEN.length }) }),
    { ...QUEUE, where: 'kind is options', lead: true },
  );
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.queue?.map(family), [['q2', 'pattern#bank-texts', 3]]);
  assert.equal(read.queue?.[0]?.does, 'Files 3 bank texts.');
});

test('A QUESTION PUT OFF KEEPS ITS FAMILY TOO, so it comes back as one of its kind', () => {
  const later = [question('q8', { cause: 'pattern#bank-texts', alike: 2, until: '2026-10-12', until_why: 'After payday.' })];
  const read = readBlock(depsWith({ laterQuestions: () => ({ questions: later, later: 1 }) }), { kind: 'queue', source: 'governance.later' });
  assert.deepEqual(read.queue?.map(family), [['q8', 'pattern#bank-texts', 2]]);
});
