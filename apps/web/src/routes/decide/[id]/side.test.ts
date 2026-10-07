/**
 * THE SIDE OF ONE QUESTION'S PAGE (`side.ts`): what it says, and when there is none.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHANGES_MOST, LINKED_MOST, changesOf, linkedOf, sideOf, words } from './side.ts';

const FIGURES = {
  'ref:invoices#7': { kind: 'row', register: 'invoices', seq: 7, title: 'Halden, September' },
  'ref:people#2': { kind: 'row', register: 'people', seq: 2, title: 'Ana Reyes' },
  'sum:expenses.amount.GBP': {
    kind: 'sum',
    amount: 129800,
    currency: 'GBP',
    n: 2,
    rows: [
      { register: 'expenses', seq: 4, title: 'Studio rent' },
      { register: 'invoices', seq: 7, title: 'Halden, September' },
    ],
  },
};

test('a question of options with no why, no share and nothing cited has no side', () => {
  const side = sideOf({ why: '', reasons: [{ text: 'Simple to explain.', suggested: true }, { text: '' }] });
  assert.deepEqual(side, { changes: [], evidence: null, links: [], more: 0, any: false });
  /* WHY IT IS ASKED IS ENOUGH FOR ONE, and so is any one of the rest. */
  assert.equal(sideOf({ why: 'Two clients asked this week.', reasons: [] }).any, true);
  assert.equal(sideOf({ reasons: [], facts: { money: 'Moves £12.98' } }).any, true);
});

test('what it changes is a line each, read from what the page already worked out', () => {
  assert.deepEqual(changesOf({}), []);
  assert.deepEqual(changesOf({ arranged: { lead: 'Adds the Studio add-on', summary: 'two pages and a list' }, money: '' }), ['Adds the Studio add-on: two pages and a list']);
  assert.deepEqual(changesOf({ arranged: { lead: 'Adds the Studio add-on', summary: '' } }), ['Adds the Studio add-on']);
  assert.deepEqual(changesOf({ appears: [{ kind: 'Page', title: 'Cash this month' }, { kind: '', title: 'Late payers' }] }), ['Page: Cash this month', 'Late payers']);
  assert.deepEqual(changesOf({ changed: 1, added: 0, list: 'Invoices', money: 'Moves £12.98' }), ['Changes one in Invoices', 'Moves £12.98']);
  assert.deepEqual(changesOf({ changed: 0, added: 1200, list: 'Expenses' }), ['Adds 1,200 to Expenses']);
  /* A COUNT WITH NO LIST TO NAME IS NOT SAID, and the lines stop at the most the side holds. */
  assert.deepEqual(changesOf({ changed: 3 }), []);
  const many = changesOf({ appears: Array.from({ length: 9 }, (_, i) => ({ kind: 'Page', title: `P${i}` })), money: 'Moves £1' });
  assert.equal(many.length, CHANGES_MOST);
  assert.equal(many.at(-1), 'Moves £1');
  /* NO EM DASH AND NO WORD OF THE SYSTEM'S in anything it says. */
  for (const line of [words.changed(2, 'Tasks'), words.added(1, 'Tasks'), words.more(3), words.evidence, words.linked]) assert.doesNotMatch(line, /—|\brows?\b|\bitems?\b|\bentit/iu);
});

test('what is linked is each cited thing once, by its own name, and never an id', () => {
  const got = linkedOf(['Chase {{ref:invoices#7}} with {{ref:people#2}}.', 'It adds up to {{sum:expenses.amount.GBP}}, and {{ref:invoices#7}} is the largest.'], FIGURES);
  assert.deepEqual(got, {
    links: [
      { title: 'Halden, September', href: '/r/invoices/7' },
      { title: 'Ana Reyes', href: '/r/people/2' },
      { title: 'Studio rent', href: '/r/expenses/4' },
    ],
    more: 0,
  });
  for (const l of got.links) assert.doesNotMatch(l.title, /#\d|\{\{/u);
  assert.deepEqual(linkedOf(['Nothing is cited here.', ''], FIGURES), { links: [], more: 0 });

  const texts = [Array.from({ length: LINKED_MOST + 3 }, (_, i) => `{{ref:tasks#${i + 1}}}`).join(' ')];
  const named = Object.fromEntries(Array.from({ length: LINKED_MOST + 3 }, (_, i) => [`ref:tasks#${i + 1}`, { kind: 'row', register: 'tasks', seq: i + 1, title: `Task ${i + 1}` }]));
  const long = linkedOf(texts, named);
  assert.equal(long.links.length, LINKED_MOST);
  assert.equal(long.more, 3);
  /* A THING THE ANSWER KEPT NO NAME FOR IS NOT LISTED: "something in Tasks" nine times is no list of links. */
  assert.deepEqual(linkedOf(texts), { links: [], more: 0 });
  assert.equal(sideOf({ reasons: [{ text: texts[0] ?? '', suggested: true }] }).any, false);
});

test('the evidence is the share the suggested answer’s reason claims, else the one why it is asked claims', () => {
  const share = "41 of September's 58 HSBC lines were typed in by hand. Accepting takes the typing away.";
  const suggested = sideOf({ why: '3 of the 12 clients asked.', reasons: [{ text: 'Cheaper.' }, { text: share, suggested: true }] });
  assert.deepEqual(suggested.evidence && { value: suggested.evidence.value, max: suggested.evidence.max }, { value: 41, max: 58 });
  assert.equal(suggested.evidence?.said, "41 of September's 58 HSBC lines were typed in by hand.");

  const asked = sideOf({ why: '3 of the 12 clients asked.', reasons: [{ text: 'Cheaper.', suggested: true }] });
  assert.equal(asked.evidence?.max, 12);

  /* A SHARE IN AN ANSWER NOBODY SUGGESTED IS NOT DRAWN: a chart beside one choice reads as an endorsement of it. */
  const none = sideOf({ reasons: [{ text: share }, { text: 'Cheaper.' }] });
  assert.equal(none.evidence, null);
  assert.equal(none.any, false);
});
