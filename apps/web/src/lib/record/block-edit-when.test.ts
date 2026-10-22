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
  assert.deepEqual(whenOf('project-owed:Oxbow gg has nothing'), { metric: 'project-owed:Oxbow gg', empty: true });
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

/* ── beyond and all (the kernel's two newer forms, `pages.ts` `WhenLeaf` and `whenLeaves`) ─────────────────────────── */

test('BEYOND IS A SENTENCE: lasts beyond for a walk that never went under, and it reads back as the same leaf', () => {
  assert.deepEqual(whenOf('cash-runway lasts beyond'), { metric: 'cash-runway', beyond: true });
  assert.deepEqual(whenOf('cash-runway never runs out'), { metric: 'cash-runway', beyond: true });
  assert.deepEqual(whenOf('cash-runway  Is Beyond'), { metric: 'cash-runway', beyond: true });
  assert.deepEqual(whenOf('cash-runway does not last beyond'), { metric: 'cash-runway', beyond: false });
  assert.deepEqual(whenOf('cash-runway is not beyond'), { metric: 'cash-runway', beyond: false });
  assert.deepEqual(whenOf('project-lasts:Oxbow gg lasts beyond'), { metric: 'project-lasts:Oxbow gg', beyond: true });
  assert.equal(whenOf('lasts beyond'), null);

  for (const leaf of [
    { metric: 'cash-runway', beyond: true },
    { metric: 'cash-runway', beyond: false },
  ]) {
    const said = whenSaid(leaf);
    assert.equal(typeof said, 'string');
    assert.deepEqual(whenOf(said!), leaf);
  }
  assert.equal(whenSaid({ metric: 'cash-runway', beyond: true }), 'cash-runway lasts beyond');
  assert.equal(whenSaid({ metric: 'cash-runway', beyond: false }), 'cash-runway does not last beyond');
});

test('ALL IS A SENTENCE: its tests joined by and, in the order written, and it reads back as the same when', () => {
  const both = { all: [{ metric: 'owed', gt: 0 }, { metric: 'cash-now', empty: false }] };
  assert.equal(whenSaid(both), 'owed > 0 and cash-now has a value');
  assert.deepEqual(whenOf('owed > 0 and cash-now has a value'), both);
  assert.deepEqual(whenOf('owed > 0  AND  cash-now has a value'), both);

  const three = { all: [{ metric: 'cash-runway', beyond: true }, { metric: 'owed', lte: 2.5 }, { metric: 'cash-now', empty: true }] };
  assert.equal(whenSaid(three), 'cash-runway lasts beyond and owed <= 2.5 and cash-now has nothing');
  assert.deepEqual(whenOf(whenSaid(three)!), three);

  /* THE SAME FIGURE TWICE IS A BAND, which one leaf could never say. */
  const band = { all: [{ metric: 'owed', gt: 0 }, { metric: 'owed', lt: 9 }] };
  assert.deepEqual(whenOf(whenSaid(band)!), band);
});

test('A NAME WITH AND IN IT IS STILL ONE FIGURE, alone or inside an all', () => {
  assert.deepEqual(whenOf('project-owed:Salt and Pepper has nothing'), { metric: 'project-owed:Salt and Pepper', empty: true });
  const named = { all: [{ metric: 'project-owed:Salt and Pepper', gt: 0 }, { metric: 'cash-now', empty: false }] };
  assert.deepEqual(whenOf(whenSaid(named)!), named);
});

test('HALF AN ALL IS NOT GUESSED: every test must read, or none of it does', () => {
  for (const said of ['owed > 0 and', 'and owed > 0', 'owed > 0 and cash-now', 'owed > 0 and cash-now is big', 'owed > 0 and and cash-now has nothing'])
    assert.equal(whenOf(said), null, said);
  assert.equal(whenFits('owed > 0 and cash-now lasts beyond'), true);
  assert.equal(whenFits('owed > 0 and cash-now'), false);
});

test('AN ALL OR A BEYOND THE SHEET CANNOT SAY IS STILL KEPT, never offered in a box that would change it', () => {
  for (const when of [
    { all: [{ metric: 'owed', gt: 0 }] },
    { all: [] },
    { all: [{ metric: 'owed', gt: 0 }, { metric: 'owed', gt: 0, lt: 9 }] },
    { all: [{ metric: 'owed', gt: 0 }, { all: [{ metric: 'a', gt: 0 }, { metric: 'b', gt: 0 }] }] },
    { all: [{ metric: 'owed', gt: 0 }, { metric: 'cash-now', empty: true }], metric: 'owed' },
    { all: [{ metric: 'owed', gt: 0 }, 'cash-now has nothing'] },
    { metric: 'cash-runway', beyond: true, gt: 0 },
    { metric: 'cash-runway', beyond: true, empty: false },
    { metric: 'cash-runway', beyond: 'yes' },
  ]) {
    assert.equal(whenSaid(when), null, JSON.stringify(when));
    const block = note({ when });
    const draft = draftOf(block);
    assert.equal(draft.when, null);
    assert.deepEqual(patchOf(block, draft), {});
  }
});

test('THE SHEET SENDS BEYOND AND ALL AS THE KERNEL WRITES THEM, and an untouched one goes back as nothing changed', () => {
  const stored = { all: [{ metric: 'cash-runway', beyond: true }, { metric: 'owed', gt: 0 }] };
  const block = note({ when: stored });
  const draft = draftOf(block);
  assert.equal(draft.when, 'cash-runway lasts beyond and owed > 0');
  assert.deepEqual(patchOf(block, draft), {});

  draft.when = 'cash-runway does not last beyond';
  assert.deepEqual(patchOf(block, draft), { when: { metric: 'cash-runway', beyond: false } });

  const fresh = note();
  assert.deepEqual(patchOf(fresh, { ...draftOf(fresh), when: 'owed > 0 and cash-now has a value' }), {
    when: { all: [{ metric: 'owed', gt: 0 }, { metric: 'cash-now', empty: false }] },
  });
});

test('ONLY WHEN IT HAS NOTHING SAYS NOTHING OF SEVERAL TESTS: there is no one figure to say it about', () => {
  assert.equal(whenNothing('owed > 0 and cash-now has a value'), null);
  assert.equal(whenNothing('project-owed:Oxbow > 0 and cash-now > 1'), null);
  assert.equal(whenNothing('cash-runway lasts beyond'), 'cash-runway has nothing');
});

test('THE HELP SAYS BOTH NEW FORMS in plain words', () => {
  assert.match(blockWords.whenHelp, /lasts beyond/u);
  assert.match(blockWords.whenHelp, / and /u);
  assert.match(blockWords.whenBad, /lasts beyond/u);
});
