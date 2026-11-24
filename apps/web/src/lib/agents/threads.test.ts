/**
 * WHAT HE TOLD AGENTS, AS CONVERSATIONS (`threads.ts`, the Agents page of 24 Nov): a reply inside a thread is its next
 * word and never a thread of its own, the thread says where it stands in one plain line with no ids, its changes are
 * one count, the question an agent asks is said on one line with what it is about, and a live session says what it is
 * doing now, never the first thing it said.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Thread } from '../record/instruct.ts';
import { askOf, asksYesNo, lastQuestion, nowOf, threadCardOf, threadsInOrder, threadsOf } from './threads.ts';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const ctx = { now: NOW, zone: 'UTC', runs: new Map([['S1', { agent: 'claude' }]]) as never, projects: new Map([['things#1', { key: 'things#1', name: 'Kiln', hue: null }]]) };

const word = (over: Partial<Thread> = {}): Thread => ({
  id: 'IN4',
  said: 'Merge wave 1, then stop',
  kind: 'tell',
  when: 'now',
  to: 'run',
  to_run: 'S1',
  to_agent: null,
  project: 'things#1',
  task: null,
  state: 'working',
  seen_by: 'S1',
  seen_how: 'prompt',
  seen_at: '2026-09-03T11:40:00Z',
  taken_by: 'S1',
  taken_at: '2026-09-03T11:40:00Z',
  reply: null,
  replied_at: null,
  expires_at: null,
  at: '2026-09-03T11:39:00Z',
  updated_at: '2026-09-03T11:40:00Z',
  seen: [],
  receipts: null,
  ...over,
});

test('A REPLY INSIDE A THREAD IS ITS NEXT WORD, never a thread of its own, and the thread is named by its first words', () => {
  const groups = threadsOf([
    word({ id: 'IN5', said: 'yes', thread: 'IN4', state: 'working' }),
    word({ state: 'done', replies: [{ said: 'Tests pass. Should I merge now?', state: 'needs_you', at: '2026-09-03T11:50:00Z' }] }),
    word({ id: 'IN6', said: 'Tidy the README', state: 'sent', taken_by: null, at: '2026-09-03T11:55:00Z' }),
  ]);
  assert.deepEqual(groups.map((g) => [g.key, g.words.map((w) => w.id)]), [['IN4', ['IN4', 'IN5']], ['IN6', ['IN6']]]);
  const card = threadCardOf(groups[0]!, ctx);
  assert.equal(card.title, 'Merge wave 1, then stop');
  assert.equal(card.who, 'Claude · Kiln');
  assert.equal(card.status, 'Claude took it 11:40');
  assert.deepEqual(card.messages.map((m) => [m.from, m.text]), [['you', 'Merge wave 1, then stop'], ['agent', 'Tests pass. Should I merge now?'], ['you', 'yes']]);
  assert.equal(card.close, false, 'a thread still with an agent cannot be closed');
});

test('WHERE A THREAD STANDS IS ONE PLAIN LINE, and no line names an instruction or a run by its id', () => {
  const said = [
    threadCardOf(threadsOf([word({ state: 'needs_you', reply: 'Should I merge?' })])[0]!, ctx).status,
    threadCardOf(threadsOf([word({ state: 'sent', taken_by: null, seen_by: null })])[0]!, ctx).status,
    threadCardOf(threadsOf([word({ state: 'seen', taken_by: null })])[0]!, ctx).status,
    threadCardOf(threadsOf([word({ state: 'done', replied_at: '2026-09-03T11:58:00Z', reply: 'Merged.' })])[0]!, ctx).status,
  ];
  assert.deepEqual(said, ['Claude asks you', 'Sent 11:39, waiting for Claude', 'Claude saw it 11:40, not taken yet', 'Done 11:58']);
  for (const s of said) assert.doesNotMatch(s, /\bIN\d|\bS\d|—/u);
});

test('WHAT THE RUN CHANGED IS ONE COUNT that opens What changed at that run, never its rows', () => {
  const card = threadCardOf(threadsOf([word({ state: 'done', reply: 'Fixed.', receipts: { run: 'S1', changes: 3 } as never })])[0]!, ctx);
  assert.deepEqual(card.changes, { said: '3 changes', href: '/audit?by=S1' });
  assert.equal(card.folded, true, 'a finished thread is one line until opened');
});

test('THE THREADS ARE IN THE ORDER HE ACTS ON THEM: waiting on him, with an agent, then finished', () => {
  const groups = threadsOf([
    word({ id: 'IN1', state: 'done', at: '2026-09-03T11:59:00Z' }),
    word({ id: 'IN2', state: 'working' }),
    word({ id: 'IN3', state: 'needs_you', at: '2026-09-03T09:00:00Z' }),
  ]);
  assert.deepEqual(threadsInOrder(groups).map((g) => g.key), ['IN3', 'IN2', 'IN1']);
});

test('A QUESTION AN AGENT ASKS IS SAID ON ONE LINE WITH WHAT IT IS ABOUT, and a yes or no one is answered in a press', () => {
  assert.equal(lastQuestion('Two are late: Studio Nine and Harbor Press. Should I send both a chaser today?'), 'Two are late: Studio Nine and Harbor Press. Should I send both a chaser today?');
  assert.equal(lastQuestion(`${'Done a long thing. '.repeat(12)}Should I merge?`), `${'Done a long thing. '.repeat(5)}Should I merge?`, 'as much before it as fits the line');
  assert.equal(lastQuestion('All done. Nothing else.'), 'All done.');
  assert.equal(asksYesNo('Tests pass. Should I merge now?'), true);
  assert.equal(asksYesNo('Which branch, main or next?'), false);
  assert.equal(asksYesNo('Should I merge or wait?'), false, 'an either-or is not a yes or a no');
  const ask = askOf(word({ state: 'needs_you', replies: [{ said: 'Tests pass. Should I merge now?', state: 'needs_you', at: '2026-09-03T11:50:00Z' }] }), { S1: 'claude' }, ctx.projects);
  assert.deepEqual({ ...ask }, { key: 'IN4', question: 'Tests pass. Should I merge now?', who: 'Claude · Kiln', agent: 'claude', quick: ['Yes', 'No'], name: 'Claude' });
});

test('A LIVE SESSION SAYS WHAT IT IS DOING NOW: its newest note over the first thing it said, and its question first', () => {
  const r = { doing: 'Pulled all context from the brain', doing_at: '2026-09-03T08:00:00Z', note: 'Drawing the reply box', note_at: '2026-09-03T11:58:00Z', asked: null, name: null };
  assert.equal(nowOf(r), 'Drawing the reply box');
  assert.equal(nowOf({ ...r, doing_at: '2026-09-03T11:59:00Z', doing: 'Running the tests' }), 'Running the tests');
  assert.equal(nowOf({ ...r, note: null, note_at: null, doing: 'Claude Code in kiln' }, (d) => d.startsWith('Claude Code in')), null, 'the name the record gave a run is not what it is doing');
  assert.equal(nowOf({ ...r, asked: 'Should I merge?' }), 'Asks you: “Should I merge?”');
});
