/**
 * The sentences this file BUILDS, as opposed to the ones it stores.
 *
 * `dead-copy` already asks whether every key has a reader, and `19 §9` holds the vocabulary. What
 * neither can see is whether a function that composes a sentence composes a sentence in English:
 * `captureIn` is the label AND the placeholder of the first control on every register screen, and
 * it read "Add a item" on Money, which is the first list in the rail and the first list anybody
 * opens. A grep for the string finds nothing, because the string does not exist until a register
 * declaration is handed to it.
 *
 * So this covers the composed ones, and only the composed ones, with the register nouns the seed
 * actually ships plus the ones a pack plausibly would.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from './copy.ts';

test('THE CAPTURE FIELD SPELLS ITS OWN ARTICLE, and it said "Add a item" on the first list in the rail', () => {
  /* The nine the seed ships. `item` is Money's and `update` is Updates', and both were wrong. */
  assert.equal(copy.captureIn('item'), 'Add an item');
  assert.equal(copy.captureIn('update'), 'Add an update');
  assert.equal(copy.captureIn('service'), 'Add a service');
  assert.equal(copy.captureIn('project'), 'Add a project');
  assert.equal(copy.captureIn('person'), 'Add a person');
  assert.equal(copy.captureIn('run'), 'Add a run');
  assert.equal(copy.captureIn('thread'), 'Add a thread');
  assert.equal(copy.captureIn('task'), 'Add a task');

  /* A REGISTER'S NOUN COMES FROM ITS DECLARATION, so the seed's nine are a sample and not the set.
     These are the ones a pack ships that the naive vowel test gets wrong in one direction or the
     other: sound rather than spelling decides, and `user` is the case that makes that concrete. */
  assert.equal(copy.captureIn('invoice'), 'Add an invoice', 'a plain vowel');
  assert.equal(copy.captureIn('estimate'), 'Add an estimate', 'a plain vowel');
  assert.equal(copy.captureIn('order'), 'Add an order', 'a plain vowel');
  assert.equal(copy.captureIn('agent'), 'Add an agent', 'a plain vowel');
  assert.equal(copy.captureIn('user'), 'Add a user', 'said with a y in front, so it is not an "an"');
  assert.equal(copy.captureIn('unit'), 'Add a unit', 'said with a y in front');
  assert.equal(copy.captureIn('upgrade'), 'Add an upgrade', 'the other u, and it is an "an"');
  assert.equal(copy.captureIn('hour'), 'Add an hour', 'the h is silent, so the letter is no guide');
  assert.equal(copy.captureIn('host'), 'Add a host', 'and this h is not');

  /* THE DECLARATION IS NOT GUARANTEED LOWER CASE. `one:` is a word an author typed. */
  assert.equal(copy.captureIn('Item'), 'Add an item');
  assert.equal(copy.captureIn('Service'), 'Add a service');
});

test('A LIST OF NAMES IS BUILT BY `list()`, and one sentence was joining them by hand', () => {
  /* `diffRefused` used `names.join(' and ')`, so three colliding pack names read
     "Money and Services and People" on the screen that refuses the install. Two names is the
     common case, which is why a sentence that reads wrong at three went unnoticed. */
  assert.match(copy.diffRefused(['Money']), /^Money is already a list/u);
  assert.match(copy.diffRefused(['Money', 'Services']), /^Money and Services are already lists/u);
  assert.match(copy.diffRefused(['Money', 'Services', 'People']), /^Money, Services and People are already lists/u);
  /* And the refusal still NAMES what collides, which is the only part the reader can act on. */
  assert.match(copy.diffRefused(['Money']), /cannot take a name another one owns/u);
});

test('and the two sentences that teach the keyboard describe the keyboard that is bound', () => {
  /**
   * BOTH WERE FALSE, AND THE SHEET ONE HEADS DISPROVED IT THREE SECTIONS DOWN. `keymapHint` is the
   * subtitle of the `?` sheet and said bare letters act only inside a list you have clicked into;
   * the sheet's first section is headed Anywhere and holds `/`, `g`, `?` and the goto digits.
   * `characterKeysHint` is the only sentence on `/settings/keyboard` explaining what the WCAG
   * 2.1.4 switch does, and it said single letters act on the focused list, which told a reader
   * deciding whether to turn it off that they were giving up one list. They are giving up the help
   * sheet, the palette shortcut and every goto.
   *
   * A string test cannot prove a sentence true. What it can hold is that neither one has gone back
   * to naming a list as the only place a bare key works, and that the switch's sentence still
   * names the three keys whose loss is the surprise.
   */
  assert.doesNotMatch(copy.keymapHint, /only inside a list|focused list/u);
  assert.doesNotMatch(copy.characterKeysHint, /only inside a list|focused list/u);
  for (const key of ['?', '/', 'g'])
    assert.ok(
      copy.characterKeysHint.includes(key),
      `the switch's sentence does not mention ${key}, which is one of the three it silences that a reader would not expect`,
    );
  /* AND NEITHER SELLS NOR APOLOGISES, which is the house voice at the top of the file. */
  for (const said of [copy.keymapHint, copy.characterKeysHint, copy.keymapSilenced])
    assert.doesNotMatch(said, /!|sorry|simply|just |easy|Get Started/u, `"${said}" is not the house voice`);
});

test('SIGN-IN NAMES ANOTHER WAY IN ONLY WHEN ONE IS DRAWN', () => {
  assert.doesNotMatch(copy.passkeyUnusable(false), /another way|other ways/u);
  assert.match(copy.passkeyUnusable(true), /other ways in below/u);
  assert.equal(copy.rejectedNext(false), 'Try again.');
  for (const s of [copy.passkeyUnusable(true), copy.passkeyUnusable(false), copy.rejectedNext(true)]) assert.doesNotMatch(s, /—/u);
});

test('UNINSTALL IS UNDONE RATHER THAN ASKED, and says what installing it again brings back', () => {
  /* The kernel keeps an uninstalled add-on's settings and schedules for thirty days (`pack_removed`), so the toast's Undo
     is a real way back and the question it replaced is gone. */
  assert.equal(copy.uninstalled('Money'), 'Money is uninstalled. Its rows stay, and installing it again within 30 days brings back its settings and schedules.');
  assert.equal(copy.reinstalled('Money'), 'Money is back, with its settings and schedules.');
  for (const s of [copy.uninstalled('Money'), copy.reinstalled('Money'), copy.reinstallApprove('Money')]) assert.doesNotMatch(s, /—|Are you sure/u);
});
