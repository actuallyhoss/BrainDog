/**
 * The reserved slot: one suggestion, a question about this page or its project first and BrainDog's own after it, never
 * a borrowed one, only one that one press may answer, never one the page already draws, no slot where there is nothing
 * to decide, and Not now kept on this device alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawnIn, isOwn, putAside, readSlot, setAside, slotPick, slotPlace, slotQuestion, type SlotQuestion } from './slot.ts';

const ask = (id: string, over: Partial<SlotQuestion> = {}): SlotQuestion => ({
  id,
  who: 'p_1',
  question: `Question ${id}?`,
  why: 'Because.',
  cost: 'call',
  options: [
    { key: 'yes', label: 'Yes', because: 'It fits.', recommended: true },
    { key: 'no', label: 'No', because: '', recommended: false },
  ],
  ...over,
});

const none = { page: null, drawn: new Set<string>(), dismissed: new Set<string>() };

test('a question about this page or its project comes first, then BrainDog\'s own, and never the first of Needs you', () => {
  const qs = [ask('SG1'), ask('SG2', { who: 'rule:late-bills' }), ask('SG3', { who: 'slash' }), ask('SG4', { about: 'page.money' })];
  assert.equal(slotPick(qs, none)?.question.id, 'SG2');
  assert.equal(slotPick(qs, { ...none, page: 'money' })?.question.id, 'SG4');
  assert.equal(slotPick([ask('SG1'), ask('SG5')], none), null, 'with none of its own and none about the page, nothing');
  assert.equal(slotPick(qs, none)?.own, true);
  const kiln = { spoken: 'things#1', title: 'Kiln' };
  assert.equal(slotPick([ask('SG6', { who: 'slash' }), ask('SG7', { about: 'kiln' })], { ...none, page: 'kiln', row: kiln })?.question.id, 'SG7');
  assert.equal(slotPick([ask('SG8', { about: 'things#1' })], { ...none, page: 'kiln', row: kiln })?.question.id, 'SG8');
  assert.equal(slotPick([ask('SG9', { who: 'slash' })], { ...none, own: false }), null, 'where only a question about the page may stand');
});

test('Settings, a person, a skill, a run, Health and Calendar draw no slot', () => {
  assert.equal(slotPlace({ page: 'settings' }), null);
  assert.equal(slotPlace({ page: 'health' }), null);
  assert.equal(slotPlace({ page: 'calendar' }), null);
  assert.equal(slotPlace({ page: 'mara-lindqvist', param: { register: 'people', seq: 1, title: 'Mara Lindqvist' }, look: { page: 'someone' } }), null);
  assert.equal(slotPlace({ page: 'review-pr', for: { register: 'skills' }, look: { page: 'skill' } }), null);
  assert.equal(slotPlace({ page: 'qa-run', look: { page: 'run' } }), null);
  assert.deepEqual(slotPlace({ page: 'money' }), { page: 'money', row: null });
  assert.deepEqual(slotPlace({ page: 'kiln', param: { register: 'things', seq: 1, title: 'Kiln' } }), { page: 'kiln', row: { spoken: 'things#1', title: 'Kiln' } });
});

test('only what one press may answer: one suggested answer, and never one that is hard to undo', () => {
  const two = ask('SG1', { options: [{ key: 'a', label: 'A', because: '', recommended: true }, { key: 'b', label: 'B', because: '', recommended: true }] });
  const neither = ask('SG2', { options: [{ key: 'a', label: 'A', because: '', recommended: false }] });
  const hard = ask('SG3', { cost: 'undo', who: 'slash' });
  assert.equal(slotPick([two, neither, hard], none), null);
  assert.deepEqual(slotPick([two, ask('SG4', { who: 'slash' })], none)?.answer, { key: 'yes', label: 'Yes', because: 'It fits.' });
});

test('a question the page draws, or this device set aside, is not drawn again', () => {
  const qs = [ask('SG1', { who: 'slash' }), ask('SG2', { who: 'rule:x' })];
  assert.equal(slotPick(qs, { ...none, drawn: new Set(['SG1']) })?.question.id, 'SG2');
  assert.equal(slotPick(qs, { ...none, dismissed: new Set(['SG1', 'SG2']) }), null);
});

test('a compact queue hides only what it shows, and a whole one all of it', () => {
  const blocks = [
    { kind: 'queue', source: 'governance.open', queue: [{ id: 'SG1' }, { id: 'SG2' }, { id: 'SG3' }, { id: 'SG4' }] },
    { kind: 'queue', source: 'governance.later', queue: [{ id: 'SG9' }] },
    { kind: 'queue', source: 'governance.open', drawn: false, queue: [{ id: 'SG8' }] },
  ];
  assert.deepEqual([...drawnIn(blocks, 3)], ['SG1', 'SG2', 'SG3']);
  assert.deepEqual([...drawnIn(blocks, null)], ['SG1', 'SG2', 'SG3', 'SG4']);
});

test('whose a question is: a rule, Slash, or a question Slash drafted', () => {
  assert.equal(isOwn({ who: 'rule:x' }), true);
  assert.equal(isOwn({ who: 'slash' }), true);
  assert.equal(isOwn({ who: 'agent:claude', drafted_by: 'slash:haiku' }), true);
  assert.equal(isOwn({ who: 'agent:claude' }), false);
});

test('a question the record sent is read field by field, and one with a broken answer is dropped', () => {
  assert.equal(slotQuestion(ask('SG1'))?.id, 'SG1');
  assert.equal(slotQuestion({ ...ask('SG1'), options: [{ key: 'a' }] }), null);
  assert.equal(slotQuestion('SG1'), null);
});

test('Not now is kept on this device, newest last, and storage that throws is none set aside', () => {
  const held = new Map<string, string>();
  const store = { getItem: (k: string) => held.get(k) ?? null, setItem: (k: string, v: string) => void held.set(k, v) };
  putAside('SG1', store);
  putAside('SG2', store);
  putAside('SG1', store);
  assert.deepEqual([...setAside(store)], ['SG2', 'SG1']);
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual([...setAside(broken)], []);
  assert.deepEqual([...putAside('SG3', broken)], ['SG3']);
});

test('a page with no queue reads the questions through previewPage, and a failed read is no suggestion', async () => {
  const io = (async () =>
    new Response(JSON.stringify({ ok: true, value: { blocks: [{ kind: 'queue', queue: [ask('SG7', { who: 'slash' }), { id: 'broken' }] }] } }), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  assert.deepEqual((await readSlot('https://example.test', io)).map((q) => q.id), ['SG7']);
  const down = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.deepEqual(await readSlot('https://example.test', down), []);
});
