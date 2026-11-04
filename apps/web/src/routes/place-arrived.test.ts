/**
 * A place that comes into the rail is said once.
 *
 * A place is drawn once it has something to show, so on a new record Money is not in the rail until the first account
 * is typed. The day it comes, one toast says so: "Money is in your sidebar now." Nothing is said on the first draw of a
 * tab, nothing for a place that was already there, and the place carries no badge and no count for having come.
 *
 * THE RULE IS READ OUT OF THE SHELL AND RUN, because the shell is a `.svelte` file and this runner is `node --test`
 * (`accent.test.ts` reads the same file as text for the same reason). `arrivedIn` is one pure arrow in
 * `+layout.svelte`: it is cut out, its types are stripped, and it is called here with rails as `railOf` draws them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

import { copy } from '../lib/copy.ts';

type Item = { key: string; href: string; label: string; near: readonly string[] };
type Drawn = { keys: ReadonlySet<string>; hidden: readonly string[] };
type ArrivedIn = (was: Drawn | null, now: readonly Item[]) => string[];

const shell = readFileSync(fileURLToPath(new URL('../lib/shell/AppFrame.svelte', import.meta.url)), 'utf8');
/* Comments off first, so a paragraph about the rule cannot pass for the rule. */
const code = shell.replace(/<!--[\s\S]*?-->/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');

function ruleOf(): ArrivedIn {
  const from = code.indexOf('const arrivedIn =');
  assert.notEqual(from, -1, 'the shell has no `arrivedIn`: nothing compares the rail between draws');
  const to = code.indexOf(';\n', from);
  const plain = stripTypeScriptTypes(code.slice(from, to + 1));
  return new Function(`${plain}\nreturn arrivedIn;`)() as ArrivedIn;
}

/* A place as `flatNav` makes it: it opens on `href`, and `near` is every address it answers to, its own first. */
const item = (key: string, label: string, also: readonly string[] = []): Item => {
  const href = `/${label.toLowerCase()}`;
  return { key, href, label, near: [href, ...also] };
};
const TODAY = item('today', 'Today');
const DECIDE = item('decide', 'Needs you');
const ACTIVITY = item('activity', 'Activity');
const WORK = item('work', 'Work');
const MONEY = item('section:money', 'Money');
const PEOPLE = item('section:people', 'People');

const drawn = (items: readonly Item[], hidden: readonly string[] = []): Drawn => ({ keys: new Set(items.map((i) => i.key)), hidden });

test('the first draw in a tab says nothing', () => {
  const arrivedIn = ruleOf();
  assert.deepEqual(arrivedIn(null, [TODAY, DECIDE, WORK, MONEY, PEOPLE, ACTIVITY]), []);
});

test('a place that was there last time says nothing', () => {
  const arrivedIn = ruleOf();
  const rail = [TODAY, DECIDE, PEOPLE, ACTIVITY];
  assert.deepEqual(arrivedIn(drawn(rail), rail), []);
  /* Nor when it only moved, from under More into the first seven or back. */
  assert.deepEqual(arrivedIn(drawn(rail), [TODAY, DECIDE, ACTIVITY, PEOPLE]), []);
});

test('a place the rail gains is named, and only that one', () => {
  const arrivedIn = ruleOf();
  const before = [TODAY, DECIDE, PEOPLE, ACTIVITY];
  assert.deepEqual(arrivedIn(drawn(before), [TODAY, DECIDE, MONEY, PEOPLE, ACTIVITY]), ['Money']);
  assert.deepEqual(arrivedIn(drawn(before), [TODAY, DECIDE, WORK, MONEY, PEOPLE, ACTIVITY]), ['Work', 'Money']);
});

test('it is told by the place and not by its name, so a place somebody renamed has not come', () => {
  const arrivedIn = ruleOf();
  const before = [TODAY, DECIDE, MONEY];
  assert.deepEqual(arrivedIn(drawn(before), [TODAY, DECIDE, { ...MONEY, label: 'Finance' }]), []);
});

test('Today, Needs you and Activity are never said to have come', () => {
  const arrivedIn = ruleOf();
  assert.deepEqual(arrivedIn(drawn([TODAY]), [TODAY, DECIDE, ACTIVITY]), []);
});

test('a place the person just brought back from hidden is not news to them', () => {
  const arrivedIn = ruleOf();
  assert.deepEqual(arrivedIn(drawn([TODAY, DECIDE], [MONEY.href]), [TODAY, DECIDE, MONEY]), []);
});

test('nor is a section whose hidden page is not the one its row opens', () => {
  const arrivedIn = ruleOf();
  /* Money opens on its Overview and holds Accounts too. Accounts was the hidden one, brought back in this draw. */
  const money = item('section:money', 'Money', ['/p/accounts']);
  assert.deepEqual(arrivedIn(drawn([TODAY, DECIDE], ['/p/accounts']), [TODAY, DECIDE, money]), []);
  /* By the row's own address still, when that is the one that was hidden. */
  assert.deepEqual(arrivedIn(drawn([TODAY, DECIDE], [money.href]), [TODAY, DECIDE, money]), []);
  /* And only that section: one that came in the same draw with nothing of its own hidden is still news. */
  assert.deepEqual(arrivedIn(drawn([TODAY, DECIDE], ['/p/accounts']), [TODAY, DECIDE, money, PEOPLE]), ['People']);
});

test('a page hidden somewhere else silences nothing', () => {
  const arrivedIn = ruleOf();
  /* Something of People's is hidden and stays so. Money, with its first account typed, is still said. */
  const money = item('section:money', 'Money', ['/p/accounts']);
  assert.deepEqual(arrivedIn(drawn([TODAY, DECIDE], ['/p/team']), [TODAY, DECIDE, money]), ['Money']);
});

test('the shell hands the rule the rail as it is drawn, addresses and all', () => {
  /* `near` is `railOf`'s, so the rule reads the places and More straight off the rail and nothing is built for it. A place
     a toast just named is left out, so Turn on Money says it once (aaf26fbf3). */
  assert.match(code, /const now = \[\.\.\.rail\.places, \.\.\.rail\.rest\];\s+const names = arrivedIn\(drawn, now\.filter\(\(i\) => !i\.near\.some\(\(h\) => toasts\.wasNamed\(h\)\)\)\);/u);
});

test('the words: one sentence, the place by its name', () => {
  assert.equal(copy.placeArrived(['Money']), 'Money is in your sidebar now.');
  assert.equal(copy.placeArrived(['Work', 'Money']), 'Work and Money are in your sidebar now.');
  assert.equal(copy.placeArrived(['Work', 'Money', 'People']), 'Work, Money and People are in your sidebar now.');
});

test('the shell says it in one toast, with no mark of alarm, and only where a rail is drawn', () => {
  const from = code.indexOf('let drawn:');
  assert.notEqual(from, -1, 'the shell does not remember the rail it drew last');
  const block = code.slice(from, code.indexOf('});', from) + 3);
  /* One push for however many places came, so three places are one sentence and not three toasts. */
  assert.equal(block.split('toasts.push(').length - 1, 1);
  /* AND THE WORD FOR WHERE IT IS, under a thumb too (af6459b7d). */
  assert.match(block, /toasts\.push\(copy\.placeArrived\(names, untrack\(\(\) => \(!narrow \? 'sidebar' : names\.every\(\(n\) => phoneTabs\.some\(\(t\) => t\.label === n\)\) \? 'bar' : 'menu'\)\)\)\)/u);
  /* A screen with no rail (sign-in, the first prompt) and a record that refused draw none, so the next rail is a first draw. */
  assert.match(block, /if \(bare \|\| data\.refused\)/u);
  /* The stack is asked nowhere else for this sentence: no badge, no count, no second saying. */
  assert.equal(code.split('copy.placeArrived(').length - 1, 1);
});
