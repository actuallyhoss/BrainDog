/**
 * What came of Slash's suggestions, on /slash (ENG-A16 seen): a line a kind in whole counts with the nought
 * parts left out, the duplicates merged, and whether Slash wrote outside what it may, the fault in its own word. Every
 * number here is invented. The words are checked because a wrong count draws as correctly as a right one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BrakeClient } from './slash-brake.ts';
import { kindName, outcomeLines, outcomesOf, readOutcomes, words, type KindOutcome, type Outcomes } from './slash-outcomes.ts';

const kind = (k: string, n: Partial<Omit<KindOutcome, 'kind'>>): KindOutcome => ({
  kind: k,
  offered: 0,
  accepted: 0,
  changed: 0,
  declined: 0,
  undone: 0,
  lapsed: 0,
  share: null,
  ...n,
});

const of = (slash: KindOutcome[], folds: Outcomes['folds'] = { made: 0, undone: 0 }, outside: number | null = 0): Outcomes => ({ slash, folds, outside });

const texts = (o: Outcomes | null) => outcomeLines(o).map((l) => l.text);

test('A KIND, PLURAL: the suggested count, how each ended, then the undone, and that Slash kept to what it may', () => {
  const lines = outcomeLines(of([kind('page', { offered: 4, accepted: 2, changed: 1, declined: 1, undone: 1, share: 0.5 })], { made: 2, undone: 0 }));
  assert.deepEqual(
    lines.map((l) => l.text),
    ['Pages: 4 suggested, 2 taken as they were, 1 changed, 1 turned down. 1 was undone.', 'Duplicates this week: 2 merged, none undone.', 'Slash wrote nothing outside what it may.'],
  );
  assert.ok(lines.every((l) => l.bad === undefined), 'nothing is a fault here');
});

test('A KIND, SINGULAR: "taken as it was", "was undone", and the nought parts left out', () => {
  assert.deepEqual(texts(of([kind('skills', { offered: 1, accepted: 1, undone: 1, share: 1 })])), [
    'Skills: 1 suggested, 1 taken as it was. 1 was undone.',
    'Slash wrote nothing outside what it may.',
  ]);
  assert.deepEqual(texts(of([kind('call', { offered: 6, declined: 3, lapsed: 2, undone: 2 })])), [
    'Choices to make: 6 suggested, 3 turned down, 2 left unanswered. 2 were undone.',
    'Slash wrote nothing outside what it may.',
  ]);
});

test('EACH KIND BY ITS NAME, in the table order, and two keys of one name added into one line', () => {
  const said = [
    ['page', 'Pages'],
    ['arrange', 'Page layouts'],
    ['look', 'Page layouts'],
    ['change', 'How things are built'],
    ['rowset', 'Things in your lists'],
    ['pattern', 'Ways to read what arrives'],
    ['skill', 'Skills'],
    ['catalogue', 'Catalogue updates'],
    ['pack', 'Plugins'],
    ['settings', 'Settings'],
    ['call', 'Choices to make'],
  ] as const;
  for (const [k, name] of said) assert.equal(kindName(k), name, k);
  const lines = texts(of([kind('settings', { offered: 1, changed: 1 }), kind('arrange', { offered: 2, accepted: 1 }), kind('look', { offered: 1, accepted: 1 })], null, null));
  assert.deepEqual(lines, ['Page layouts: 3 suggested, 2 taken as they were.', 'Settings: 1 suggested, 1 changed.']);
});

test('A KIND THE TABLE DOES NOT KNOW is "Other changes", said last, never by its key', () => {
  const lines = texts(of([kind('tasks:move:done', { offered: 2, accepted: 2 }), kind('page', { offered: 1, declined: 1 }), kind('zz-new', { offered: 1, changed: 1 })], null, null));
  assert.deepEqual(lines, ['Pages: 1 suggested, 1 turned down.', 'Other changes: 3 suggested, 2 taken as they were, 1 changed.']);
  assert.ok(lines.every((t) => !t.includes('tasks') && !t.includes('zz-new')));
});

test('SUGGESTED AND NOT YET ANSWERED: said as that, never a sentence of zeros', () => {
  assert.deepEqual(texts(of([kind('page', { offered: 3 })], null, null)), ['Pages: 3 suggested, none answered yet.']);
});

test('NOTHING SUGGESTED OR MERGED: no lines, so no tile', () => {
  assert.deepEqual(outcomeLines(of([])), []);
  assert.deepEqual(outcomeLines(of([kind('page', {})], { made: 0, undone: 0 }, 0)), [], 'a kind with nought suggested is no line');
  assert.deepEqual(outcomeLines(null), []);
  assert.deepEqual(outcomeLines(undefined), []);
});

test('MERGED ONLY: the duplicates line draws the tile on its own; undone said in a count', () => {
  assert.deepEqual(texts(of([], { made: 1, undone: 1 })), ['Duplicates this week: 1 merged, 1 undone.', 'Slash wrote nothing outside what it may.']);
});

test('OUTSIDE ABOVE NOUGHT: the fault in the deeper tone with its word, said even with nothing suggested', () => {
  const lines = outcomeLines(of([kind('page', { offered: 1, accepted: 1 })], null, 3));
  assert.deepEqual(lines.at(-1), { key: 'outside', text: 'Slash wrote 3 changes outside what it may.', bad: words.bad });
  assert.deepEqual(outcomeLines(of([], null, 1)), [{ key: 'outside', text: 'Slash wrote 1 change outside what it may.', bad: 'Needs a look' }]);
});

test('NUMBERS THAT DO NOT HOLD TOGETHER drop their kind, never guessed at', () => {
  const o = outcomesOf({
    slash: [
      { kind: 'page', offered: 2, accepted: 2, changed: 1, declined: 0, undone: 0, lapsed: 0, share: 1 },
      { kind: 'skill', offered: 2.5, accepted: 0, changed: 0, declined: 0, undone: 0, lapsed: 0, share: null },
      { kind: 'settings', offered: 1, accepted: -1, changed: 0, declined: 0, undone: 0, lapsed: 0, share: null },
      { kind: 'call', offered: 2, accepted: 1, changed: 0, declined: 1, undone: 0, lapsed: 0, share: 0.5 },
    ],
    folds: { made: 1, undone: 'x' },
    outside: 0,
  });
  assert.deepEqual(o?.slash.map((k) => k.kind), ['call']);
  assert.equal(o?.folds, null);
});

const answering = (answer: unknown): BrakeClient & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    call: (async (name: string) => {
      asked.push(name);
      if (answer instanceof Error) throw answer;
      return answer;
    }) as BrakeClient['call'],
  };
};

test('READ: the outcomes from engineReadings, beside the fields it answered before', async () => {
  const client = answering({
    ok: true,
    value: { asks: [], understanding: { unattached: 0, open_by_cause: {} }, braked: null, slash: [kind('page', { offered: 2, accepted: 1, declined: 1, share: 0.5 })], folds: { made: 0, undone: 0 }, outside: 0 },
  });
  assert.deepEqual(await readOutcomes(client), of([kind('page', { offered: 2, accepted: 1, declined: 1, share: 0.5 })]));
  assert.deepEqual(client.asked, ['engineReadings']);
});

test("READ, AN OLD HOST'S ANSWER, A REFUSAL OR A THROW: null, and the tile says nothing", async () => {
  assert.equal(await readOutcomes(answering({ ok: true, value: { asks: [], understanding: { unattached: 0, open_by_cause: {} }, braked: null } })), null);
  assert.equal(await readOutcomes(answering({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such method.' } })), null);
  assert.equal(await readOutcomes(answering({ ok: true, value: null })), null);
  assert.equal(await readOutcomes(answering(new Error('offline'))), null);
});

test('READ, A HOST THAT SENDS SOME OF THE FIELDS: what it sent, the rest unread and unsaid', async () => {
  const out = await readOutcomes(answering({ ok: true, value: { outside: 2 } }));
  assert.deepEqual(out, { slash: [], folds: null, outside: 2 });
  assert.deepEqual(texts(out), ['Slash wrote 2 changes outside what it may.']);
});

test('GRADED SUGGESTIONS: one line once a prediction came due, nothing before or on numbers that do not add up', async () => {
  const out = await readOutcomes(answering({ ok: true, value: { predictions: { scored: 4, met: 3 } } }));
  assert.deepEqual(out, { slash: [], folds: null, outside: null, predictions: { scored: 4, met: 3 } });
  assert.deepEqual(texts(out), ['Of 4 suggestions graded, 3 did what they said.']);
  assert.deepEqual(texts(outcomesOf({ predictions: { scored: 1, met: 0 } })), ['Of 1 suggestion graded, 0 did what it said.']);
  assert.deepEqual(texts(outcomesOf({ outside: 0, predictions: { scored: 0, met: 0 } })), []);
  assert.equal(outcomesOf({ predictions: { scored: 2, met: 3 } }), null);
});
