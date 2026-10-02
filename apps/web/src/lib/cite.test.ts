/**
 * Slash's braces, drawn: what `Cited.svelte` is handed for each piece of a sentence, without a browser.
 *
 * THE RULE IS ONE SENTENCE: no brace reaches a screen. A row is a link named by
 * its title, a value is drawn in its field's format, a figure is its reading, a total carries the rows it adds up, and a
 * brace the answer kept nothing for is drawn in words of its own. Each case below is one of those.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cited, citedWords, figuresIn, reasonIn, summaryTitle, words } from './cite.ts';

const FIGURES: Record<string, unknown> = {
  'ref:obligations#7': { kind: 'row', register: 'obligations', seq: 7, title: 'Office rent' },
  'obligations#7.amount': { kind: 'value', register: 'obligations', seq: 7, field: 'amount', type: 'money', value: { amount: 500500, currency: 'EGP' } },
  'obligations#7.due': { kind: 'value', register: 'obligations', seq: 7, field: 'due', type: 'day', value: '2026-11-04' },
  'runway-days': { kind: 'metric', name: 'Runway in days', value: 120, unit: null, format: 'days' },
  'paid-share': { kind: 'metric', name: 'Share paid on time', value: 0.463, unit: null, format: 'pct' },
  'sum:obligations.amount.EGP': {
    kind: 'sum',
    register: 'obligations',
    field: 'amount',
    amount: 620500,
    currency: 'EGP',
    n: 3,
    rows: [
      { register: 'obligations', seq: 7, title: 'Office rent' },
      { register: 'obligations', seq: 8, title: 'Accountant' },
    ],
  },
};

test('A ROW IS A LINK TO THE ROW, NAMED BY ITS TITLE, and the words around it are kept as they were', () => {
  assert.deepEqual(cited('Pay {{ref:obligations#7}} first.', FIGURES), [
    { kind: 'text', text: 'Pay ' },
    { kind: 'row', title: 'Office rent', href: '/r/obligations/7' },
    { kind: 'text', text: ' first.' },
  ]);
});

test('A VALUE IS DRAWN IN ITS FIELD’S FORMAT: money for `Money`, a day as a day', () => {
  const pieces = cited('{{obligations#7.amount}} by {{day:obligations#7.due}}', FIGURES);
  assert.deepEqual(pieces[0], { kind: 'money', minor: 500500, currency: 'EGP' });
  assert.deepEqual(pieces[2], { kind: 'words', text: '4 Nov 2026' });
});

test('A FIGURE IS ITS READING IN ITS DECLARED FORMAT, and a quoted amount is its own value', () => {
  assert.deepEqual(cited('{{runway-days}}', FIGURES), [{ kind: 'words', text: '120 days' }]);
  assert.deepEqual(cited('{{paid-share}}', FIGURES), [{ kind: 'words', text: '46.3%' }]);
  assert.deepEqual(cited('{{money:120000 EGP}}'), [{ kind: 'money', minor: 120000, currency: 'EGP' }]);
});

test('A TOTAL CARRIES THE ROWS IT ADDS UP, AS LINKS, and how many there were in all', () => {
  const [sum] = cited('{{sum:obligations.amount.EGP}}', FIGURES);
  assert.equal(sum?.kind, 'sum');
  if (sum?.kind !== 'sum') return;
  assert.equal(sum.minor, 620500);
  assert.equal(sum.currency, 'EGP');
  assert.equal(sum.n, 3);
  assert.deepEqual(sum.rows, [
    { title: 'Office rent', href: '/r/obligations/7' },
    { title: 'Accountant', href: '/r/obligations/8' },
  ]);
});

test('NO BRACE IS EVER DRAWN: a question filed without its figures is drawn in words of its own', () => {
  const said = citedWords('Pay {{ref:money_core#9}} from {{sum:x.y.GBP}} and {{burn-rate}}, {{ oops', {});
  assert.doesNotMatch(said, /\{\{|\}\}/u);
  /* THE LIST BY ITS NAME, never its id: this record declares none, so the name is the id in words (`listName`). */
  assert.match(said, new RegExp(words.rowIn('Money core')));
  assert.match(said, new RegExp(words.total));
  assert.match(said, /burn rate/u);
});

test('THE PLAIN WORDS SAY WHAT THE PIECES SAY, with money as `money()` writes it for `moneyInText`', () => {
  assert.equal(citedWords('Pay {{ref:obligations#7}}: {{obligations#7.amount}}.', FIGURES), 'Pay Office rent: EGP 5,005.00.');
});

test('THE REASON AS FILED IS FOUND BY THE OPTION’S ID, and the figures by the body they were filed on', () => {
  const body = { options: [{ id: 'a', label: 'Pay rent', because: 'It is {{ref:obligations#7}}.' }], figures: FIGURES };
  assert.equal(reasonIn(body, 'a'), 'It is {{ref:obligations#7}}.');
  assert.equal(reasonIn(body, 'b'), null);
  assert.equal(figuresIn(body), FIGURES);
  assert.deepEqual(figuresIn({ options: [] }), {});
});

test('A TITLE NEVER CARRIES THE SPOKEN ID the host writes in front of it', () => {
  assert.equal(summaryTitle('tasks#1 | Invoice Acme | open', 'tasks#1'), 'Invoice Acme');
  assert.equal(summaryTitle('Invoice Acme', 'tasks#1'), 'Invoice Acme');
  assert.equal(summaryTitle('tasks#1', 'tasks#1'), '');
});

/* WHAT A BRACE IS SAID AS NAMES THE PERSON'S OWN THINGS, by the name their list goes by, never a row or a list. */
test('the words for what a brace cannot resolve say no system word', () => {
  for (const line of [words.rowIn('Projects'), words.notKnown, words.total, words.sumRows(1), words.sumRows(3), words.sumMore(1), words.sumMore(4)])
    assert.doesNotMatch(line, /\b(rows?|lists?|registers?|blocks?)\b/iu, line);
  assert.equal(words.rowIn('Projects'), 'something in Projects');
  assert.equal(words.sumRows(3), 'the 3 it adds up');
});
