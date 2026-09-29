import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS as SEED } from '@braindog/seed';

import type { RegisterDecl } from '../record/schema.ts';
import { shapeOf } from './board.ts';
import { captureOf, captureSaid, contextOf, freshFields, isQuestion, projectNamed, type CaptureContext } from './capture.ts';

/* A TUESDAY, the seed's own day. */
const ctx: CaptureContext = {
  today: '2026-09-29',
  projects: [
    { seq: 1, name: 'Kiln Type Foundry' },
    { seq: 2, name: 'Marlow & Co' },
    { seq: 3, name: 'Portage' },
  ],
  priorities: [
    { value: 'urgent', said: 'Urgent' },
    { value: 'high', said: 'High' },
    { value: 'normal', said: 'Normal' },
    { value: 'low', said: 'Low' },
  ],
  due: true,
  agent: true,
};

const read = (typed: string) => captureOf(typed, ctx);

test('a plain line is the task and nothing else', () => {
  assert.deepEqual(read('  Chase Halden on the invoice  '), { text: 'Chase Halden on the invoice', project: null, due: null, priority: null, agent: null });
});

test('the syntax files it, marks it and dates it, and leaves the words', () => {
  assert.deepEqual(read('Chase Halden tomorrow !urgent #marlow'), { text: 'Chase Halden', project: 2, due: '2026-09-30', priority: 'urgent', agent: null });
  assert.deepEqual(read('#kiln !h Kerning pass @claude'), { text: 'Kerning pass', project: 1, due: null, priority: 'high', agent: 'claude' });
});

test('a project is found by its name, the start of it, or the start of any word in it', () => {
  assert.equal(projectNamed('portage', ctx.projects), 3);
  assert.equal(projectNamed('kil', ctx.projects), 1);
  assert.equal(projectNamed('foundry', ctx.projects), 1);
  assert.equal(projectNamed('tallow', ctx.projects), null);
  assert.equal(read('Tag it #tallow').text, 'Tag it #tallow', 'a # naming no project stays in the words');
});

test('a day is read only at the end, so a weekday inside the words keeps its meaning', () => {
  assert.equal(read('Write the Monday newsletter').due, null);
  assert.equal(read('Write the Monday newsletter').text, 'Write the Monday newsletter');
  assert.equal(read('Call mum by friday').due, '2026-10-02');
  assert.equal(read('Call mum by friday').text, 'Call mum');
  assert.equal(read('Pay rent due today').due, '2026-09-29');
  assert.equal(read('Plan next week').due, '2026-10-05');
  assert.equal(read('Review in 2 weeks').due, '2026-10-13');
  assert.equal(read('Review in 2 weeks').text, 'Review');
  assert.equal(read('Book the flights in three days').due, '2026-10-02');
  assert.equal(read('File it on 2026-10-04').due, '2026-10-04');
  assert.equal(read('Stand-up tuesday').due, '2026-09-29', 'the weekday that is today is today');
  assert.equal(read('Stand-up next tuesday').due, '2026-10-06');
});

test('a line that would be left empty is not read at all', () => {
  assert.deepEqual(read('Tomorrow'), { text: 'Tomorrow', project: null, due: null, priority: null, agent: null });
  assert.equal(read('#kiln').text, '#kiln');
});

test('what the list lacks is never read', () => {
  const bare = { ...ctx, projects: [], priorities: null, due: false, agent: false };
  assert.deepEqual(captureOf('Essay tomorrow !urgent #kiln @claude', bare), {
    text: 'Essay tomorrow !urgent #kiln @claude',
    project: null,
    due: null,
    priority: null,
    agent: null,
  });
});

test('what was read is said back in a short line', () => {
  assert.deepEqual(captureSaid(read('Chase Halden tomorrow !urgent #marlow @cursor'), ctx), ['Due Wed 30 Sep', 'Marlow & Co', 'Urgent', 'Cursor']);
  assert.deepEqual(captureSaid(read('Chase Halden'), ctx), []);
});

test('a question is told from a thing to do', () => {
  assert.equal(isQuestion('What is due this week'), true);
  assert.equal(isQuestion('how much cash do I have'), true);
  assert.equal(isQuestion('Kiln revenue?'), true);
  assert.equal(isQuestion('Chase Halden on the invoice'), false);
  assert.equal(isQuestion('Call mum tomorrow'), false);
  assert.equal(isQuestion(''), false);
});

test('a new task is written with the state for new work, the line, and the filter standing in for a project', () => {
  const s = shapeOf(SEED.tasks as unknown as RegisterDecl);
  const c = contextOf(s, '2026-09-29', ctx.projects);
  assert.deepEqual(freshFields(captureOf('Chase Halden tomorrow !urgent', c), s, 2), {
    what: 'Chase Halden',
    state: 'open',
    thing: 2,
    by: '2026-09-30',
    priority: 'urgent',
  });
  assert.deepEqual(freshFields(captureOf('Chase Halden #portage', c), s, 2), { what: 'Chase Halden', state: 'open', thing: 3 });
  assert.deepEqual(freshFields(captureOf('Chase Halden', c), s, null), { what: 'Chase Halden', state: 'open' });
});
