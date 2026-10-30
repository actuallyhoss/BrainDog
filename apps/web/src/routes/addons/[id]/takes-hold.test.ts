/**
 * The line under each setting of an add-on's page, and the toast after a save: "Takes effect now." or
 * "Takes effect when <add-on> next updates.", worked out from the add-on's file and never typed per setting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answersIn, declarationsOf, savedSaid, savingNote, takesHoldSaid, targetSaid, targetsIn } from './takes-hold.ts';

/** A made-up kiln add-on as its file writes it: a figure reads `most_open` when drawn, a page fills `heading`. */
const KILN = [
  { register: 'firings', name: 'Firings', title: 'what', fields: [{ id: 'what', type: 'text' }] },
  { metric: 'firings-open', source: 'register.firings', target: { lte: 12, setting: 'most_open' } },
  { page: 'firings', title: '{{config:heading}}', blocks: [{ kind: 'note', text: 'Every {{config:shade}} batch' }] },
  { metric: 'firings-shade', source: 'register.firings', target: { lte: 3, setting: 'shade' } },
];

test('a setting a figure reads when drawn takes hold now; one filled into a page waits; one used both ways waits', () => {
  assert.deepEqual(answersIn(KILN, ['most_open', 'heading', 'shade', 'nobody_declares_this']), {
    most_open: 'now',
    heading: 'next-update',
    shade: 'next-update',
    nobody_declares_this: 'now',
  });
});

test('the line names the add-on by its title', () => {
  assert.equal(takesHoldSaid('now', 'Kiln'), 'Takes effect now.');
  assert.equal(takesHoldSaid('next-update', 'Kiln'), 'Takes effect when Kiln next updates.');
});

test('the toast says when a saved setting takes hold only when it waits', () => {
  const saved = 'Saved Heading.';
  assert.equal(savedSaid('Saved Most open.', [{ name: 'Most open', answer: 'now' }], 'Kiln'), 'Saved Most open.');
  assert.equal(savedSaid(saved, [{ name: 'Heading', answer: 'next-update' }], 'Kiln'), 'Saved Heading. Takes effect when Kiln next updates.');
  assert.equal(
    savedSaid('Saved Heading, Most open, Shade.', [
      { name: 'Heading', answer: 'next-update' },
      { name: 'Most open', answer: 'now' },
      { name: 'Shade', answer: 'next-update' },
    ], 'Kiln'),
    'Saved Heading, Most open, Shade. Heading and Shade take effect when Kiln next updates.',
  );
  assert.equal(savedSaid('Saved Most open.', [{ name: 'Most open', answer: undefined }], 'Kiln'), 'Saved Most open.');
});

test('no em dash and no id in what a person reads', () => {
  for (const line of [takesHoldSaid('now', 'Kiln'), takesHoldSaid('next-update', 'Kiln')]) {
    assert.doesNotMatch(line, /\u2014/u);
    assert.doesNotMatch(line, /\{\{|config:|_/u);
  }
});

test("BrainDog's own use case is read from this build: a setting its pages fill waits, the rest take hold now", async () => {
  const { useCaseDocument } = await import('@braindog/seed/usecases');
  const keys = Object.keys((useCaseDocument('personal')?.config as Record<string, unknown> | undefined) ?? {});
  const read = await declarationsOf('usecase-personal', null, false);
  assert.ok(read, 'the use case has a file in this build');
  const answers = answersIn(read, keys);
  assert.deepEqual(Object.keys(answers), keys);
  /* A key its file fills is the update's, every other is now, and the file holds some of each. */
  for (const key of keys) assert.equal(answers[key], JSON.stringify(read).includes(`{{config:${key}}}`) ? 'next-update' : 'now', key);
  assert.ok(Object.values(answers).includes('next-update'));
  assert.equal(answers.speaks, 'now');
});

test('an add-on from the catalogue with no version held has no file to read', async () => {
  assert.equal(await declarationsOf('sample-kiln', null, false), null);
});

test('A LIMIT SAYS WHAT IT HOLDS: the figure that names it, by its name, and empty is no limit (AG29)', () => {
  const decls = [
    { metric: 'lapsing', name: 'Lapsing', source: 'register.services', target: { setting: 'most_lapsing' } },
    { body: { metric: 'renews-30d', name: 'Renews in 30 days', target: { setting: 'most_renewing_30d' } } },
    { metric: 'held', name: 'Services', target: { gte: 0 } },
  ];
  assert.deepEqual(targetsIn(decls, ['most_lapsing', 'most_renewing_30d', 'most_a_year']), { most_lapsing: 'Lapsing', most_renewing_30d: 'Renews in 30 days' });
  assert.equal(targetSaid('Lapsing'), 'Lapsing is marked as over once it goes past this. Leave it empty for no limit.');
  assert.equal(savingNote('Held to this as soon as it is saved.'), true);
  assert.equal(savingNote('Paid on the first of the month.'), false);
});
