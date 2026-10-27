/**
 * THE SIDE OF ONE QUESTION'S PAGE (`side.ts`): what it says, and when there is none.
 *
 * EACH TEST FAILS ON A REVERT OF THE FIX: put "What it changes" back in the side and the first fails;
 * read a share out of a reason's words again and the last one does.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aboutLine, aboutOf, LINKED_MOST, linkedOf, sideOf, words } from './side.ts';

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
  const side = sideOf({ why: '', reasons: [{ text: 'Simple to explain.' }, { text: '' }] });
  assert.deepEqual(side, { evidence: null, links: [], more: 0, any: false });
  /* WHY IT IS ASKED IS ENOUGH FOR ONE, and so is any one of the rest. */
  assert.equal(sideOf({ why: 'Two clients asked this week.', reasons: [] }).any, true);
  /* NO EM DASH AND NO WORD OF THE SYSTEM'S in anything it says. */
  for (const line of [words.more(3), words.evidence, words.linked]) assert.doesNotMatch(line, /—|\brows?\b|\bitems?\b|\bentit/iu);
});

/* WHAT ANSWERING CHANGES IS DRAWN WHOLE UNDER THE ANSWERS, and the side said it again beside them on a wide screen. A
   question whose only news is what it changes (an arrangement, a page a proposal adds, money it moves) has no side. */
test('what answering changes is never the side’s, so it keeps no side open', () => {
  const body = { kind: 'arrange', pages: [{ title: 'Cash this month' }], options: [{ id: 'accept', because: 'Adds the Studio add-on.' }] };
  const side = sideOf({ why: '', reasons: [{ text: 'Adds the Studio add-on.' }, { text: '' }], body });
  assert.equal('changes' in side, false, 'the side holds what answering changes again');
  assert.equal(side.any, false, 'a question whose only news is what it changes draws a side');
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
  assert.equal(sideOf({ reasons: [{ text: texts[0] ?? '' }] }).any, false);
});

test('the evidence is the pair the question’s body gives as data, and never one read out of a sentence', () => {
  const said = "41 of September's 58 HSBC lines were typed in by hand.";
  const given = sideOf({ reasons: [{ text: 'Cheaper.' }], body: { evidence: { value: 41, of: 58, said } } });
  assert.deepEqual(given.evidence, { value: 41, max: 58, said });
  assert.equal(given.any, true);

  /* "2 OF 5 STEPS" IS AN AGENT'S PROSE, NOT EVIDENCE: in a reason or in why it is asked it draws no chart, and alone
     it keeps no side. */
  const prose = sideOf({ why: '2 of 5 steps are done.', reasons: [{ text: "41 of September's 58 HSBC lines were typed in by hand." }] });
  assert.equal(prose.evidence, null, 'a share was read out of the words again');
  assert.equal(sideOf({ reasons: [{ text: '2 of 5 steps are done.' }], body: { options: [] } }).any, false);
});

test('the side names the row a question is about by its list and number, and nothing for a body that names none', () => {
  assert.deepEqual(aboutOf({ about: 'recurring#7', options: [] }), { list: 'recurring', seq: 7, spoken: 'recurring#7' });
  assert.equal(aboutOf({ about: 'recurring#0' }), null);
  assert.equal(aboutOf({ about: 'not a row' }), null);
  assert.equal(aboutOf({ options: [] }), null);
  assert.equal(aboutOf(null), null);
});

test('the line under the row says its list, then the amount and how late where the question says them', () => {
  assert.equal(aboutLine('Repeating', { amount: '£39', late: '4 days late' }), 'Repeating · £39 · 4 days late');
  assert.equal(aboutLine('Tasks', null), 'Tasks');
});
