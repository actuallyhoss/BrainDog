/**
 * The block editor's `Show it only when` box: a sentence on screen, the kernel's leaf in the record (PGS-C06).
 *
 * THE BOX SENT ITS WORDS AS TYPED, and the kernel installs only a leaf (`declare.ts` refuses `'overdue > 0'`), so every
 * condition typed into the sheet was refused, and every stored one was shown as kept. And no comparison holds of a
 * figure with no value, so "only when it has nothing" could not be said at all. Both are held here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockWords, draftOf, patchOf, whenFits, whenNothing, whenOf, whenSaid } from './block-edit.ts';
import type { BlockBody } from './pages-live.ts';

const note = (more: Record<string, unknown> = {}): BlockBody => ({ kind: 'note', body: 'No balance has been typed yet.', ...more }) as BlockBody;

test('A TYPED SENTENCE IS THE KERNEL LEAF: each comparison, and has nothing for a figure with no value', () => {
  assert.deepEqual(whenOf('owed > 0'), { metric: 'owed', gt: 0 });
  assert.deepEqual(whenOf('owed >= 2.5'), { metric: 'owed', gte: 2.5 });
  assert.deepEqual(whenOf('owed < -1'), { metric: 'owed', lt: -1 });
  assert.deepEqual(whenOf('owed <= 10'), { metric: 'owed', lte: 10 });
  assert.deepEqual(whenOf('owed = 3'), { metric: 'owed', is: 3 });
  assert.deepEqual(whenOf('owed != 3'), { metric: 'owed', not: 3 });
  assert.deepEqual(whenOf('cash-now has nothing'), { metric: 'cash-now', empty: true });
  assert.deepEqual(whenOf('cash-now  is EMPTY'), { metric: 'cash-now', empty: true });
  assert.deepEqual(whenOf('cash-now has no value'), { metric: 'cash-now', empty: true });
  assert.deepEqual(whenOf('cash-now has a value'), { metric: 'cash-now', empty: false });
  assert.deepEqual(whenOf('project-owed:Bake gg has nothing'), { metric: 'project-owed:Bake gg', empty: true });
  assert.equal(whenOf('  '), undefined);
});

test('WORDS IT CANNOT READ ARE NOT GUESSED: no figure, no number, or a name the kernel would refuse', () => {
  for (const said of ['> 0', 'owed > lots', 'Owed money > 0', 'owed', 'owed is big', 'has nothing'])
    assert.equal(whenOf(said), null, said);
  assert.equal(whenFits('owed > lots'), false);
  assert.equal(whenFits(''), true);
  assert.equal(whenFits('owed has nothing'), true);
});

test('A STORED LEAF IS SHOWN AS ITS SENTENCE, and one the sheet cannot say again is kept', () => {
  assert.equal(whenSaid(undefined), '');
  assert.equal(whenSaid({ metric: 'owed', gt: 0 }), 'owed > 0');
  assert.equal(whenSaid({ metric: 'cash-now', empty: true }), 'cash-now has nothing');
  assert.equal(whenSaid({ metric: 'cash-now', empty: false }), 'cash-now has a value');
  assert.equal(whenSaid({ metric: 'owed', gt: 0, lt: 9 }), null);
  assert.equal(whenSaid({ metric: 'owed' }), null);
  assert.equal(whenSaid({ metric: 'owed', gt: 0, all: [] }), null);
  assert.equal(whenSaid(7), null);
});

test('ONLY WHEN IT HAS NOTHING keeps the figure and changes the test', () => {
  assert.equal(whenNothing('cash-now > 0'), 'cash-now has nothing');
  assert.equal(whenNothing('cash-now'), 'cash-now has nothing');
  assert.equal(whenNothing(''), null);
  assert.equal(blockWords.whenNothing, 'Only when it has nothing');
});

test('THE SHEET SENDS THE LEAF, and a stored leaf it never touched goes back as nothing changed', () => {
  const block = note({ when: { metric: 'cash-now', gt: 0 } });
  const draft = draftOf(block);
  assert.equal(draft.when, 'cash-now > 0');
  assert.deepEqual(patchOf(block, draft), {});

  draft.when = whenNothing(draft.when!) ?? '';
  assert.deepEqual(patchOf(block, draft), { when: { metric: 'cash-now', empty: true } });

  draft.when = '';
  assert.deepEqual(patchOf(block, draft), { when: null });

  const fresh = note();
  const typed = { ...draftOf(fresh), when: 'cash-now has nothing' };
  assert.deepEqual(patchOf(fresh, typed), { when: { metric: 'cash-now', empty: true } });
});

test('WORDS IT CANNOT READ GO AS TYPED, so the record refuses them by name rather than the sheet dropping them', () => {
  const block = note();
  assert.deepEqual(patchOf(block, { ...draftOf(block), when: 'owed is big' }), { when: 'owed is big' });
});

test('A RULE THE SHEET CANNOT SAY STAYS AS WRITTEN', () => {
  const block = note({ when: { metric: 'owed', gt: 0, lt: 9 } });
  const draft = draftOf(block);
  assert.equal(draft.when, null);
  assert.deepEqual(patchOf(block, draft), {});
});

test('THE WORDS ARE PLAIN: no dash, no ids', () => {
  for (const w of [blockWords.whenHelp, blockWords.whenNothing, blockWords.whenBad]) {
    assert.doesNotMatch(w, /[\u2014\u2013]|#\d/u);
    /* "EMPTY" NOW NAMES A TEST, so an empty box is called blank. */
    assert.doesNotMatch(w, /\bEmpty\b/u);
  }
});

test('AN OLD BLOCK WITH NO WHEN, OR A STRING ONE, SAVES UNCHANGED when the box is not touched', () => {
  const bare = note();
  assert.equal(draftOf(bare).when, '');
  assert.deepEqual(patchOf(bare, draftOf(bare)), {});
  const old = note({ when: 'owed is big' });
  assert.deepEqual(patchOf(old, draftOf(old)), {});
});
