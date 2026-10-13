/**
 * The briefing's cards (ENG-B12): what Today opens on. The facts are ranked, one a cause, thirty at most; a model's
 * answer is kept card by card only where it names what it was handed and types no number; and with no model the rules
 * say the top five in their own sentences.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RANK } from '../../kernel/src/compose.ts';
import { HEADLINE_MOST, SYSTEM_WORDS } from '../src/headlines.ts';
import {
  BRIEF_CARDS_MOST,
  BRIEF_FACTS_MOST,
  BRIEF_KINDS,
  BRIEF_LINE_MOST,
  BRIEF_RANK,
  BRIEF_RULES_MOST,
  briefBasis,
  briefCandidates,
  briefFault,
  briefFrom,
  briefOf,
  rulesBrief,
  type BriefFact,
} from '../src/briefing.ts';

const fact = (h: string, kind: BriefFact['kind'], title: string, more: Partial<BriefFact> = {}): BriefFact => ({
  h,
  kind,
  title,
  figures: {},
  row: `things#${h}`,
  cause: null,
  rank: BRIEF_RANK[kind],
  ...more,
});

/** A fresh record's morning: a late bill, two questions one import raised, and a run that left a next step. */
const bill = fact('b1', 'late', 'Studio rent', { figures: { amount: 'GBP 1,200.00', days: '3' }, row: 'bills#2' });
const q1 = fact('q1', 'asked', 'Is this one a refund?', { cause: 'import-7', row: 'questions#1' });
const q2 = fact('q2', 'asked', 'Who is Acme Ltd?', { cause: 'import-7', row: 'questions#2' });
const run = fact('r1', 'step', 'Tidy the contacts', { figures: { next: 'check the merged names' }, row: 'runs#5' });
const morning = [run, q2, bill, q1];

test('the ranks are the board\'s own, and every kind has one', () => {
  assert.equal(BRIEF_RANK.late, RANK.late);
  assert.equal(BRIEF_RANK.asked, RANK.needs);
  assert.equal(BRIEF_RANK.changed, RANK.changed);
  assert.deepEqual([...BRIEF_KINDS].sort(), Object.keys(BRIEF_RANK).sort());
  assert.equal(BRIEF_LINE_MOST, HEADLINE_MOST);
});

test('a late bill, two questions of one cause and a run that left a next step are three cards in that order', () => {
  const facts = briefCandidates(morning);
  assert.deepEqual(facts.map((f) => f.kind), ['late', 'asked', 'step']);
  assert.deepEqual(facts.map((f) => f.row), ['bills#2', 'questions#1', 'runs#5']);
});

test('two questions of one cause are one card with its count', () => {
  const facts = briefCandidates(morning);
  const asked = facts.filter((f) => f.kind === 'asked');
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.h, 'q1');
  assert.equal(asked[0]!.figures.count, '2');
  assert.equal(asked[0]!.cause, 'import-7');
  /* The card is the first of them by name, so it never depends on how they were gathered. */
  assert.equal(asked[0]!.title, 'Is this one a refund?');
  /* Questions of two causes, and one with none, stay apart. */
  const apart = briefCandidates([q1, fact('q3', 'asked', 'Which account?', { cause: 'import-8' }), fact('q4', 'asked', 'Keep it?')]);
  assert.equal(apart.length, 3);
  /* Gathering what was already gathered changes nothing. */
  assert.deepEqual(briefCandidates(facts), facts);
});

test('31 facts are cut to 30, the least pressing left out', () => {
  const many = [fact('c0', 'changed', 'Reading plan'), ...Array.from({ length: 30 }, (_, i) => fact(`d${i}`, 'due', `Bill ${String(i).padStart(2, '0')}`))];
  const facts = briefCandidates(many);
  assert.equal(many.length, 31);
  assert.equal(facts.length, BRIEF_FACTS_MOST);
  assert.equal(BRIEF_FACTS_MOST, 30);
  assert.ok(!facts.some((f) => f.h === 'c0'));
});

test('a higher rank leads whatever its kind, and a tie keeps the kinds\' order', () => {
  const facts = briefCandidates([fact('x', 'changed', 'Plan'), fact('y', 'exception', 'Card declined'), fact('z', 'due', 'Insurance', { rank: 9 })]);
  assert.deepEqual(facts.map((f) => f.h), ['z', 'y', 'x']);
});

test('briefFault refuses what the model was not handed or should not say', () => {
  const handed = briefCandidates(morning);
  const ok = { cards: [{ h: 'b1', line: 'Studio rent is {{days}} days late, at {{amount}}.' }, { h: 'q1', line: 'An import left {{count}} questions for you.' }] };
  assert.equal(briefFault(ok, handed), null);
  /* A handle it was not handed. */
  assert.match(briefFault({ cards: [{ h: 'zz', line: 'Something is late.' }] }, handed) ?? '', /handed/u);
  /* A typed digit, and a number in words its fact does not hold. */
  assert.match(briefFault({ cards: [{ h: 'b1', line: 'Studio rent is 3 days late.' }] }, handed) ?? '', /number/u);
  assert.match(briefFault({ cards: [{ h: 'b1', line: 'Studio rent is nine days late.' }] }, handed) ?? '', /number/u);
  /* A number its fact does hold is still a hole: in words it could sit in a wrong sentence. */
  assert.match(briefFault({ cards: [{ h: 'q1', line: 'An import left two questions for you.' }] }, handed) ?? '', /number/u);
  assert.match(briefFault({ cards: [{ h: 'q1', line: 'Two days late, an import asks.' }] }, handed) ?? '', /number/u);
  /* A hole for a figure held empty, and a line that is only a hole. */
  const bare = [fact('n1', 'late', 'Water bill', { figures: { days: ' ', amount: 'GBP 40.00' } })];
  assert.match(briefFault({ cards: [{ h: 'n1', line: 'Water bill is {{days}} days late.' }] }, bare) ?? '', /figure/u);
  assert.match(briefFault({ cards: [{ h: 'n1', line: '{{amount}}' }] }, bare) ?? '', /plain/u);
  /* A hole its fact has no figure for. */
  assert.match(briefFault({ cards: [{ h: 'r1', line: 'Tidy the contacts waits {{days}} days.' }] }, handed) ?? '', /figure/u);
  /* An eighth card. */
  const eight = briefCandidates(Array.from({ length: 8 }, (_, i) => fact(`e${i}`, 'due', `Thing ${'abcdefgh'[i]}`)));
  const cards = eight.map((f) => ({ h: f.h, line: `${f.title} is due soon.` }));
  assert.equal(BRIEF_CARDS_MOST, 7);
  assert.match(briefFault({ cards }, eight) ?? '', /more than/u);
  assert.equal(briefFault({ cards: cards.slice(0, 7) }, eight), null);
  /* A line over 140 characters, counted as it is read. */
  assert.match(briefFault({ cards: [{ h: 'b1', line: `Studio rent is late ${'and late '.repeat(15)}still.` }] }, handed) ?? '', /longer/u);
  /* A system word, which a name of their own may still hold. */
  assert.match(briefFault({ cards: [{ h: 'b1', line: 'This row is late.' }] }, handed) ?? '', /system/u);
  const own = [fact('t1', 'due', 'Fix the rows')];
  assert.equal(briefFault({ cards: [{ h: 't1', line: 'Fix the rows is due soon.' }] }, own), null);
  /* Markup, one fact said twice, and no answer at all. */
  assert.match(briefFault({ cards: [{ h: 'b1', line: '**Studio rent** is late.' }] }, handed) ?? '', /plain/u);
  assert.match(briefFault({ cards: [{ h: 'b1', line: 'Studio rent is late.' }, { h: 'b1', line: 'Pay the studio rent.' }] }, handed) ?? '', /twice/u);
  assert.notEqual(briefFault(null, handed), null);
  assert.notEqual(briefFault({ cards: 'none' }, handed), null);
  assert.notEqual(briefFault({ cards: [] }, handed), null);
});

test('briefOf keeps only the cards that pass, in the model\'s order, with their holes filled', () => {
  const handed = briefCandidates(morning);
  const cards = briefOf(
    {
      cards: [
        { h: 'q1', line: 'An import left {{count}} questions for you.' },
        { h: 'b1', line: 'Studio rent is 3 days late.' },
        { h: 'b1', line: 'Studio rent is {{days}} days late, at {{amount}}.' },
        { h: 'zz', line: 'Something else.' },
      ],
    },
    handed,
  );
  assert.deepEqual(cards, [
    { h: 'q1', line: 'An import left 2 questions for you.', row: 'questions#1', cause: 'import-7', by: 'slash' },
    { h: 'b1', line: 'Studio rent is 3 days late, at GBP 1,200.00.', row: 'bills#2', cause: null, by: 'slash' },
  ]);
  assert.deepEqual(briefOf(undefined, handed), []);
});

test('with no model answer the rules give the top five by rank, each a plain sentence with its row', () => {
  const facts = [
    ...morning,
    fact('d1', 'due', 'Car insurance', { figures: { when: 'on Friday' }, row: 'bills#9' }),
    fact('x1', 'exception', 'Card payment refused', { row: 'payments#4' }),
    fact('c1', 'changed', 'Kitchen budget', { row: 'budgets#1' }),
  ];
  const cards = rulesBrief(facts);
  assert.equal(cards.length, BRIEF_RULES_MOST);
  assert.equal(BRIEF_RULES_MOST, 5);
  assert.deepEqual(cards.map((c) => c.row), ['bills#2', 'questions#1', 'payments#4', 'runs#5', 'bills#9']);
  for (const c of cards) {
    assert.equal(c.by, 'rule');
    assert.ok(c.line.length <= BRIEF_LINE_MOST, c.line);
    assert.match(c.line, /^[^\n{}[\]*`<>—]+(?:\.|\?")$/u, c.line);
    assert.ok(!SYSTEM_WORDS.test(c.line), c.line);
  }
  assert.equal(cards[0]!.line, 'Studio rent (GBP 1,200.00) is 3 days late.');
  assert.equal(cards[1]!.line, '2 questions wait on you, starting with "Is this one a refund?"');
  assert.equal(rulesBrief([fact('q9', 'asked', 'Keep the old card.')])[0]!.line, 'A question waits on you: "Keep the old card".');
  assert.equal(cards[2]!.line, 'Card payment refused needs a look.');
  assert.equal(cards[3]!.line, 'Tidy the contacts left a next step: check the merged names.');
  assert.equal(cards[4]!.line, 'Car insurance is due on Friday.');
  /* A title too long for a line is cut, never the sentence. */
  const long = rulesBrief([fact('l1', 'changed', 'A very long name '.repeat(12))]);
  assert.ok(long[0]!.line.length <= BRIEF_LINE_MOST);
  assert.match(long[0]!.line, /changed since you last looked\.$/u);
  /* The cut never splits a character in two. */
  const wide = rulesBrief([fact('l2', 'changed', '😀'.repeat(200))]);
  assert.ok(wide[0]!.line.length <= BRIEF_LINE_MOST);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(wide[0]!.line) && wide[0]!.line.isWellFormed());
});

test('briefFrom is the whole briefing: the model\'s cards when one passes, else the rules\', with when and its basis', () => {
  const at = '2026-10-14T08:00:00.000Z';
  const ruled = briefFrom(null, morning, at);
  assert.equal(ruled.at, at);
  assert.equal(ruled.basis, briefBasis(morning));
  assert.deepEqual(ruled.cards.map((c) => [c.row, c.by]), [['bills#2', 'rule'], ['questions#1', 'rule'], ['runs#5', 'rule']]);
  const said = briefFrom({ cards: [{ h: 'r1', line: 'Tidy the contacts is waiting on a check from you.' }] }, morning, at);
  assert.deepEqual(said.cards, [{ h: 'r1', line: 'Tidy the contacts is waiting on a check from you.', row: 'runs#5', cause: null, by: 'slash' }]);
  assert.deepEqual(briefFrom({ cards: [{ h: 'zz', line: 'Nothing.' }] }, morning, at).cards, ruled.cards);
  assert.deepEqual(briefFrom(null, [], at).cards, []);
});

test('the basis moves when a fact does, and not with the order they were gathered in', () => {
  assert.equal(briefBasis(morning), briefBasis([...morning].reverse()));
  assert.notEqual(briefBasis(morning), briefBasis([bill, q1, run]));
  assert.notEqual(briefBasis(morning), briefBasis([{ ...bill, figures: { ...bill.figures, days: '4' } }, q1, q2, run]));
  assert.notEqual(briefBasis(morning), briefBasis([{ ...bill, title: 'Studio rent, October' }, q1, q2, run]));
});
