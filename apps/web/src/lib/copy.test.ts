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
import { EXAMPLE, FORMED } from './record/tags.ts';

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

/** Every key of `copy` holding this exact string, nested tables and lists of words included. */
function keysHolding(said: string): string[] {
  const found: string[] = [];
  const walk = (table: Record<string, unknown>, path: string): void => {
    for (const [key, value] of Object.entries(table)) {
      const at = path === '' ? key : `${path}.${key}`;
      if (value === said) found.push(at);
      else if (Array.isArray(value)) value.forEach((v, i) => void (v === said && found.push(`${at}[${i}]`)));
      else if (value !== null && typeof value === 'object') walk(value as Record<string, unknown>, at);
    }
  };
  walk(copy, '');
  return found;
}

/**
 * TWO WORDS THIS FILE TYPED TWICE, AND THE SECOND COPY OF EACH WAS RENDERED BY NOTHING.
 *
 * `dead-copy` reported both as debts waiting on a surface, and neither was: `displayOptions` sat one
 * line above `display`, which is what `/r/<list>` draws on its Display button and on the sheet that
 * button opens (`r/[register]/+page.svelte:2329` and `:2938`); `saved` sat in a block of transport
 * words, and the word a landed write actually shows is `writeMarkSaved`, the chip a stored edit puts
 * on its own row (`r/[register]/+page.svelte:1317`). So the allow-list carried two entries for
 * sentences that were not missing anything, which is how a list of eighteen becomes a list of forty.
 *
 * NOT A RULE AGAINST EVERY REPEATED WORD, and the measurement is why: with these two gone this file
 * stores 847 strings over 811 distinct sentences, so 27 sentences are still typed more than once,
 * and most of them are one-word labels in unrelated lanes that happen to share a verb. `Done` is five keys because five screens
 * finish five different things. The two below are different: each had a renderer already, and the
 * twin was a second name for it.
 */
test('THE DISPLAY MENU AND A LANDED WRITE ARE EACH ONE WORD, TYPED ONCE', () => {
  assert.deepEqual(keysHolding('Display'), ['display']);
  assert.deepEqual(keysHolding('Saved'), ['writeMarkSaved']);
});

/**
 * A VALUE THE RECORD STORES IS NOT A SENTENCE THIS FILE TYPES.
 *
 * `example` was a key here, lower case and bare, excused as "the chip that mark would render". What
 * the bare word is is the tag the record keeps, declared in `record/tags.ts` and travelling in the
 * row's `tags` field, and a reader meets it through `shownTags` and `listLine` rather than through
 * any sentence typed here. `markExample` reads `Example` and is a narrower thing than the excuse
 * claimed: the receipt chip on the one row the empty state's offer writes, cleared when the question
 * changes, so no seeded example row has ever worn it. Two names for it in two files is how the chip
 * and the data drift apart, which is what the assertion below holds shut.
 */
test('THE RECORD’S OWN TAGS ARE NOT KEYS OF `copy`', () => {
  for (const tag of [EXAMPLE, FORMED]) assert.deepEqual(keysHolding(tag), [], `\`${tag}\` is the record's word, not a sentence`);
  assert.equal(copy.markExample, 'Example');
});
