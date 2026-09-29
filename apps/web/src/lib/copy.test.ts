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

/**
 * A REFUSAL LISTS WHAT A PERSON CAN TYPE, AND THIS ONE LISTED WHAT THEY CANNOT.
 *
 * `/p/say-what-it-is-and-who-it-is-for` on a Guide record answered *"There is no page called
 * say-what-it-is-and-who-it-is-for."* over *"Pages on this record: Your project · Guide."* The
 * heading names the thing in the alphabet of the URL bar and the half underneath switches alphabets
 * without saying so: the page titled "Your project" answers at `/p/home-guide`
 * (`packages/seed/src/usecases/guide.ts:234`), and typing either of the two words offered gives the
 * same refusal again.
 *
 * `/r/<unknown>` IS WORSE, BECAUSE THE MAPPING IS NOT GUESSABLE IN EITHER DIRECTION. Of the fourteen
 * registers the seed's modules declare, seven are named something other than their address:
 * `obligations` is called Money, `transactions` Ledger, `recurring` Repeating, `things` Projects,
 * `tracks` Threads, `fx` Exchange rates, and `installments` is called Instalments, one letter away
 * and still a refusal. `/settings/<unknown>` has two of thirteen, and both are whole phrases:
 * `people` is "People & sharing" and `delete` is "Delete this record".
 *
 * `901a2bb7` is the worked example for what the sentence becomes. A row that is not there is named
 * by the number a person can say rather than by the list's title, and the button under it agrees. So
 * an entry here is an ADDRESS, and the title rides in brackets only where it is not that address in
 * other clothes, because on the seven registers and the five Home pages where they differ the title
 * is the only part a reader recognises.
 *
 * AND DE-DUPLICATION MOVES TO THE ADDRESS, which is the half of the problem that fixing the titles
 * quietly made wrong. Five pages titled Overview are five pages at five addresses, so the nine names
 * that pass reduced to six were four real pages the record holds and the refusal no longer mentions.
 * Two entries are the same entry when they answer at the same address and never because two authors
 * picked the same word. The empty branch and the title-shaped de-duplication live in
 * `copy-refusals.test.ts` with the findings they came from; this is the other half of one sentence.
 */
test('A REFUSAL NAMES ADDRESSES, because the person reading it just typed one that did not work', () => {
  /* The two pages the Guide record holds, in the order its rail draws them. */
  assert.equal(
    copy.theseExist('Pages', [
      { address: 'home-guide', title: 'Your project' },
      { address: 'guide', title: 'Guide' },
    ]),
    'Pages on this record: home-guide (Your project) · guide.',
  );

  /* A TITLE THAT IS THE ADDRESS IN OTHER CLOTHES ADDS NOTHING, and most of them are: eight of the
     seed's fourteen registers, seven of its fifteen pages and eleven of the thirteen settings areas
     differ from their address only in case or in a separator. Printing "services (Services)" on all
     of those would bury the five or six entries where the brackets carry the whole point. */
  assert.equal(
    copy.theseExist('Lists', [
      { address: 'obligations', title: 'Money' },
      { address: 'services', title: 'Services' },
      { address: 'installments', title: 'Instalments' },
      { address: 'agent-work', title: 'Agent work' },
    ]),
    'Lists on this record: obligations (Money) · services · installments (Instalments) · agent-work.',
    'a name that folds to its own address is noise, and one letter apart is not the same word',
  );

  /* AN ADDRESS ON ITS OWN IS STILL AN ENTRY, which is what `v/[view]/+page.svelte:264` has always
     passed: `client.views()` answers addresses of the shape `register.id`, and there is no second
     name for a saved view to carry. */
  assert.equal(copy.theseExist('Saved views', ['money.overdue', 'money.due']), 'Saved views on this record: money.overdue · money.due.');
  assert.equal(copy.theseExist('Pages', [{ address: 'guide' }]), 'Pages on this record: guide.');

  /* TWO ENTRIES ARE ONE ENTRY WHEN THEY ANSWER AT THE SAME ADDRESS, and never because two packs
     chose the same word. Both halves are the same measurement: the rail after `Clear the examples`
     listed nine pages of which five read Overview, and those five are five pages. */
  assert.equal(
    copy.theseExist('Pages', [
      { address: 'home-founder', title: 'Overview' },
      { address: 'home-team', title: 'Overview' },
    ]),
    'Pages on this record: home-founder (Overview) · home-team (Overview).',
    'two pages sharing a title are two pages, and the refusal that hides one sends its reader nowhere',
  );
  assert.equal(
    copy.theseExist('Pages', [
      { address: 'guide', title: 'Guide' },
      { address: 'guide', title: 'Guide' },
    ]),
    'Pages on this record: guide.',
  );

  /* AND THE HOUSE VOICE HOLDS WITH A BRACKET IN IT. `access.test.ts` walks this function with
     strings only, so the shape above is one it has never rendered. */
  for (const said of [copy.theseExist('Lists', [{ address: 'obligations', title: 'Money' }]), copy.theseExist('Pages', [])])
    assert.doesNotMatch(said, /register|declaration|projection|predicate|!|sorry|simply|just |easy/u, `"${said}" is not the house voice`);
});

test('A LIST OF NAMES IS BUILT BY `list()`, and one sentence was joining them by hand', () => {
  /* The refusal that found it, `diffRefused`, used `names.join(' and ')`, so three colliding pack
     names read "Money and Services and People". It is gone, rendered nowhere once the sample
     went; the sentences that still name several add-ons are held to the same rule. Two
     names is the common case, which is why a sentence that reads wrong at three went unnoticed. */
  assert.equal(copy.packNeededBy(['Money']), 'Needed by Money');
  assert.equal(copy.packNeededBy(['Money', 'Services']), 'Needed by Money and Services');
  assert.equal(copy.packNeededBy(['Money', 'Services', 'People']), 'Needed by Money, Services and People');
  assert.match(copy.packTurnedOffNamed(['Money', 'Services', 'People']), /^Money, Services and People are turned off/u);
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
 * any sentence typed here. Two names for it in two files is how the chip and the data drift apart,
 * which is what the assertion below holds shut.
 */
test('THE RECORD’S OWN TAGS ARE NOT KEYS OF `copy`', () => {
  for (const tag of [EXAMPLE, FORMED]) assert.deepEqual(keysHolding(tag), [], `\`${tag}\` is the record's word, not a sentence`);
});
