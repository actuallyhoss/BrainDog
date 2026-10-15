/**
 * Each verb a page may name bound to the record method a press calls, and how it is taken back (PGS-A12). The table
 * here and the kernel's (`ACTION_VERBS`) name the same verbs and the same args. Invented lists and rows throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused } from '@braindog/ports';

import { ACTION_VERBS } from '@braindog/kernel';
import { ANSWERED_ON_PAGE, ASK_WORDS, RUNS, VERBS, undoCall, verbCall, type VerbRow } from '../src/verbs.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = '2026-10-14T09:00:00.000Z';
/* A list of shipments: a stage field whose done value is `shipped`, and a row in it. */
const SHAPE = { state: 'stage', values: ['packing', 'loading', 'shipped'], done: ['shipped'], start: 'packing' };
const ROW: VerbRow = { register: 'shipments', seq: 4, version: 2, fields: { title: PROJECTS[1], stage: 'loading' }, shape: SHAPE };

test('every kernel verb has a binding here and none extra, with the same args', () => {
  assert.deepEqual(Object.keys(VERBS).sort(), Object.keys(ACTION_VERBS).sort());
  for (const [verb, spec] of Object.entries(ACTION_VERBS))
    assert.deepEqual(Object.keys(VERBS[verb as keyof typeof VERBS].args).sort(), [...spec.args].sort(), `${verb}'s args agree`);
});

test('each first verb answers the method a press calls', () => {
  const calls = {
    'row.create': verbCall('row.create', { fields: { title: PROJECTS[0] } }, { register: 'shipments' }, NOW),
    'row.update': verbCall('row.update', { field: 'title', value: PROJECTS[2] }, ROW, NOW),
    'row.delete': verbCall('row.delete', {}, ROW, NOW),
    'row.tick': verbCall('row.tick', { done: true }, ROW, NOW),
    'row.move': verbCall('row.move', { field: 'stage', to: 'packing' }, ROW, NOW),
    'suggestion.answer': verbCall('suggestion.answer', { option: 'accept' }, { id: 'sugg_1' }, NOW),
  };
  for (const [verb, out] of Object.entries(calls)) assert.ok(out.ok, `${verb}: ${JSON.stringify(out)}`);
  const v = Object.fromEntries(Object.entries(calls).map(([k, out]) => [k, out.ok ? out.value : null]));
  assert.deepEqual(v['row.create'], { method: 'create', params: { register: 'shipments', fields: { title: PROJECTS[0] } } });
  assert.deepEqual(v['row.update'], { method: 'update', params: { register: 'shipments', seq: 4, version: 2, patch: { title: PROJECTS[2] } } });
  assert.deepEqual(v['row.delete'], { method: 'update', params: { register: 'shipments', seq: 4, version: 2, patch: { deleted_at: NOW } } });
  assert.deepEqual(v['row.tick']!.params.patch, { stage: 'shipped' });
  assert.deepEqual(v['row.move']!.params.patch, { stage: 'packing' });
  assert.deepEqual(v['suggestion.answer'], { method: 'decide', params: { id: 'sugg_1', decide: { option: 'accept', reason: ANSWERED_ON_PAGE } } });
  for (const [verb, out] of Object.entries(v)) assert.equal(out!.method, VERBS[verb as keyof typeof VERBS].method);
});

test('making a rule from arrivals answers the record\'s own refusal on this host', () => {
  const out = verbCall('rule.from_arrivals', { arrivals: ['raw_1', 'raw_2'] }, ROW, NOW);
  assert.ok(refused(out));
  assert.equal(out.refusal.code, 'NOT_IN_THIS_BUILD');
  assert.match(out.refusal.fix, /not on this host yet/u);
  assert.equal(VERBS['rule.from_arrivals'].method, null);
  assert.equal(RUNS.has('rule.from_arrivals'), false, 'so the read does not send it');
  assert.equal(RUNS.has('row.tick'), true);
});

test('an arg the press left out is refused, naming it', () => {
  const move = verbCall('row.move', { field: 'stage' }, ROW, NOW);
  assert.ok(refused(move));
  assert.equal(move.refusal.code, 'REQUIRED_MISSING');
  assert.equal(move.refusal.at, 'to');
  const answer = verbCall('suggestion.answer', {}, { id: 'sugg_1' }, NOW);
  assert.ok(refused(answer));
  assert.equal(answer.refusal.at, 'option');
  const tick = verbCall('row.tick', {}, ROW, NOW);
  assert.ok(refused(tick));
  assert.equal(tick.refusal.at, 'done');
});

test('a row verb on no row, an unknown verb and a tick on a list with no state are refused', () => {
  const none = verbCall('row.delete', {}, null, NOW);
  assert.ok(refused(none));
  assert.equal(none.refusal.at, 'row');
  const unknown = verbCall('row.launch', {}, ROW, NOW);
  assert.ok(refused(unknown));
  assert.equal(unknown.refusal.code, 'DECLARATION_UNKNOWN');
  const { shape: _gone, ...bare } = ROW;
  const tick = verbCall('row.tick', { done: true }, bare, NOW);
  assert.ok(refused(tick));
  assert.equal(tick.refusal.at, 'state');
});

test('each undo puts the row back as it was', () => {
  const made = undoCall('row.create', { fields: { title: PROJECTS[0] } }, { register: 'shipments' }, { register: 'shipments', seq: 9, version: 1 }, NOW);
  assert.deepEqual(made.ok && made.value, { method: 'update', params: { register: 'shipments', seq: 9, patch: { deleted_at: NOW } } });
  const back = undoCall('row.delete', {}, ROW, null, NOW);
  assert.deepEqual(back.ok && back.value.params, { register: 'shipments', seq: 4, patch: { deleted_at: null } });
  const untick = undoCall('row.tick', { done: true }, ROW, null, NOW);
  assert.deepEqual(untick.ok && untick.value.params.patch, { stage: 'loading' }, 'the state it held, not the first open one');
  const moved = undoCall('row.move', { field: 'stage', to: 'shipped' }, ROW, null, NOW);
  assert.deepEqual(moved.ok && moved.value.params.patch, { stage: 'loading' });
  const answered = undoCall('suggestion.answer', { option: 'accept' }, { id: 'sugg_1' }, { decision: 'D7', suggestion: 'sugg_1' }, NOW);
  assert.deepEqual(answered.ok && answered.value, { method: 'undo', params: { decision: 'D7', dry: true } }, 'by the decision, not the question');
  assert.ok(refused(undoCall('suggestion.answer', { option: 'accept' }, { id: 'sugg_1' }, null, NOW)), 'no decision answered, no way back');
  const blind = undoCall('row.update', { field: 'owner', value: PROJECTS[3] }, ROW, null, NOW);
  assert.ok(refused(blind), 'a field the row was read without has no way back');
});

/* AN ASK AS A FORM SENDS IT: an invented question about where the shipments go. */
const ASK = { question: `Ship to ${PROJECTS[0]} first?`, why: '  Both are waiting.  ', first: 'Yes, first', second: 'No, wait a week' };

test('an ask is an options question filed through propose, with the body Decide files', () => {
  const out = verbCall('question.ask', ASK, null, NOW);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.method, VERBS['question.ask'].method);
  assert.deepEqual(out.value, {
    method: 'propose',
    params: {
      question: `Ship to ${PROJECTS[0]} first?`,
      body_kind: 'options',
      body: {
        context: 'Both are waiting.',
        options: [
          { id: 'o1', label: 'Yes, first', because: '' },
          { id: 'o2', label: 'No, wait a week', because: '' },
        ],
      },
    },
  });
  /* WHY MAY BE LEFT OUT, and the body then carries no context rather than an empty one. */
  const bare = verbCall('question.ask', { ...ASK, why: '' }, null, NOW);
  assert.ok(bare.ok);
  assert.equal(Object.hasOwn(bare.value.params.body as object, 'context'), false);
  assert.equal(RUNS.has('question.ask'), true, 'so the read sends a form over it');
});

test('an ask is signed by whoever pressed: the call carries no signer of its own, and no system', () => {
  const out = verbCall('question.ask', ASK, null, NOW);
  assert.ok(out.ok);
  /* THE HOST MAKES THE CALL AS THE PRESSER, and the record signs it as theirs. A key here would let a page sign as somebody else. */
  assert.deepEqual(Object.keys(out.value.params).sort(), ['body', 'body_kind', 'question']);
  assert.doesNotMatch(JSON.stringify(out.value), /system|actor|principal|"by"/u);
});

test('an empty question or answer is refused at its field, in the record\'s own sentence', () => {
  for (const field of ['question', 'first', 'second'] as const) {
    for (const value of ['', '   ', undefined]) {
      const out = verbCall('question.ask', { ...ASK, [field]: value }, null, NOW);
      assert.ok(refused(out), `${field} ${JSON.stringify(value)} was filed`);
      assert.equal(out.refusal.code, 'REQUIRED_MISSING');
      assert.equal(out.refusal.at, field);
      assert.equal(out.refusal.fix, ASK_WORDS[field]);
    }
  }
  const same = verbCall('question.ask', { ...ASK, second: ' yes, FIRST ' }, null, NOW);
  assert.ok(refused(same));
  assert.equal(same.refusal.at, 'second');
  assert.equal(same.refusal.fix, ASK_WORDS.same);
});

test('an ask is undone by taking its question back while it is open', () => {
  const back = undoCall('question.ask', ASK, null, { id: 'SG12', state: 'open' }, NOW);
  assert.deepEqual(back.ok && back.value, { method: 'withdraw', params: { id: 'SG12' } });
  const none = undoCall('question.ask', ASK, null, null, NOW);
  assert.ok(refused(none), 'no question filed, nothing to take back');
  assert.equal(none.refusal.at, 'answered');
});
