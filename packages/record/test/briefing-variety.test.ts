/**
 * The briefing says what matters, not Decide over again (ENG-B12): however many questions are open, they take two of
 * the cards where anything else is worth saying and three where nothing is. The first is the count of all the card
 * beside it does not say, and the places left go to what is late, what a run left, what is due and what changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRIEF_ASKED_ALONE,
  BRIEF_ASKED_MOST,
  BRIEF_FACTS_MOST,
  BRIEF_RANK,
  BRIEF_RULES_MOST,
  briefBasis,
  briefCandidates,
  briefFrom,
  briefInput,
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

/** How pressing one is within its kind, as the gatherer spreads it (`within` in `methods/briefing.ts`): the first the most. */
const within = (at: number, of: number): number => (0.4 * (of - at)) / of;

const two = (n: number): string => String(n + 1).padStart(2, '0');

/** Open questions, the longest waiting first, each raised by a cause of its own. */
const questions = (of: number): BriefFact[] =>
  Array.from({ length: of }, (_, n) =>
    fact(`q${two(n)}`, 'asked', `Renew plan ${two(n)}?`, { cause: `cause-${two(n)}`, row: `questions#${n + 1}`, rank: BRIEF_RANK.asked + within(n, of) }),
  );

const rent = fact('l1', 'late', 'Studio rent', { figures: { days: '3' }, row: 'bills#1', rank: BRIEF_RANK.late + within(0, 2) });
const water = fact('l2', 'late', 'Water bill', { figures: { days: '9' }, row: 'bills#2', rank: BRIEF_RANK.late + within(1, 2) });
const insurance = fact('d1', 'due', 'Car insurance', { figures: { when: 'on Friday' }, row: 'bills#3' });
const tidy = fact('s1', 'step', 'Tidy the contacts', { figures: { next: 'check the merged names' }, row: 'runs#1', rank: BRIEF_RANK.step + 0.5 });
const quiet = fact('c1', 'changed', 'Kitchen budget', { row: 'budgets#1' });

/** A lived record's morning: twenty questions, two things late, one due, a step a run left and a thing that changed. */
const lived = [quiet, ...questions(20).reverse(), insurance, tidy, water, rent];

const kindOf = (facts: readonly BriefFact[], h: string): BriefFact['kind'] => facts.find((f) => f.h === h)!.kind;
const askedIn = (facts: readonly BriefFact[], cards: readonly { h: string }[]): number => cards.filter((c) => kindOf(facts, c.h) === 'asked').length;

test('twenty questions beside other things are two cards, the count first and then one question', () => {
  const cards = rulesBrief(lived);
  assert.equal(cards.length, BRIEF_RULES_MOST);
  assert.equal(BRIEF_ASKED_MOST, 2);
  assert.equal(askedIn(lived, cards), 2);
  /* The places in rank order: both late, the questions, and what a run left. */
  assert.deepEqual(cards.map((c) => c.row), ['bills#1', 'bills#2', 'questions#1', 'questions#2', 'runs#1']);
  /* The count card stands for every question the card beside it does not say, so the two add up to all twenty. */
  assert.equal(cards[2]!.line, '19 questions wait on you, starting with "Renew plan 01?"');
  assert.equal(cards[3]!.line, 'A question waits on you: "Renew plan 02?"');
  assert.equal(cards[4]!.line, 'Tidy the contacts left a next step: check the merged names.');
});

test('the places the questions gave up go to late, a step, due and changed, in rank order', () => {
  const facts = briefCandidates(lived);
  assert.deepEqual(facts.map((f) => f.h), ['l1', 'l2', 'q01', 'q02', 's1', 'd1', 'c1']);
  assert.deepEqual(facts.map((f) => f.kind), ['late', 'late', 'asked', 'asked', 'step', 'due', 'changed']);
  /* With one thing late, the due card has a place the questions used to take. */
  const cards = rulesBrief(lived.filter((f) => f.h !== 'l2'));
  assert.deepEqual(cards.map((c) => c.row), ['bills#1', 'questions#1', 'questions#2', 'runs#1', 'bills#3']);
  assert.equal(cards[1]!.line, '19 questions wait on you, starting with "Renew plan 01?"');
});

test('with only questions on the record the cards are the count and two questions, never five', () => {
  const only = questions(20);
  const cards = rulesBrief(only);
  assert.equal(BRIEF_ASKED_ALONE, 3);
  assert.deepEqual(cards.map((c) => c.line), [
    '18 questions wait on you, starting with "Renew plan 01?"',
    'A question waits on you: "Renew plan 02?"',
    'A question waits on you: "Renew plan 03?"',
  ]);
  /* Three or fewer are said as they are, each its own card. */
  assert.deepEqual(rulesBrief(questions(3)).map((c) => c.line), [
    'A question waits on you: "Renew plan 01?"',
    'A question waits on you: "Renew plan 02?"',
    'A question waits on you: "Renew plan 03?"',
  ]);
  /* And two beside something else are not folded either. */
  assert.deepEqual(rulesBrief([rent, ...questions(2)]).map((c) => c.row), ['bills#1', 'questions#1', 'questions#2']);
});

test('questions one cause raised are counted whole, and a card beside the count is always one question', () => {
  /* Seventeen of one cause, then four of their own, as the lived record had them: one count card and the oldest single. */
  const pile = Array.from({ length: 17 }, (_, n) => fact(`p${two(n)}`, 'asked', `Is ${two(n)} a refund?`, { cause: 'import-7', row: `questions#${n + 1}`, rank: BRIEF_RANK.asked + within(n, 23) }));
  const pair = [17, 18].map((n) => fact(`g${two(n)}`, 'asked', `Keep ${two(n)}?`, { cause: 'import-8', row: `questions#${n + 1}`, rank: BRIEF_RANK.asked + within(n, 23) }));
  const single = [19, 20, 21, 22].map((n) => fact(`r${two(n)}`, 'asked', `Renew plan ${two(n)}?`, { row: `questions#${n + 1}`, rank: BRIEF_RANK.asked + within(n, 23) }));
  const facts = briefCandidates([rent, ...single, ...pair, ...pile]);
  assert.deepEqual(facts.map((f) => f.h), ['l1', 'p01', 'r20']);
  /* The pair of another cause is inside the count, never a second count card. */
  assert.equal(facts[1]!.figures.count, '22');
  assert.equal(facts[1]!.cause, 'import-7');
  assert.equal(facts[2]!.figures.count, undefined);
  assert.deepEqual(rulesBrief([rent, ...single, ...pair, ...pile]).map((c) => c.line), [
    'Studio rent is 3 days late.',
    '22 questions wait on you, starting with "Is 01 a refund?"',
    'A question waits on you: "Renew plan 20?"',
  ]);
  /* With no question of its own to say, the count card stands alone and holds them all. */
  const groups = briefCandidates([rent, ...pile, ...pair, fact('g30', 'asked', 'Which account?', { cause: 'import-9' }), fact('g31', 'asked', 'Which bank?', { cause: 'import-9' })]);
  assert.deepEqual(groups.map((f) => [f.h, f.figures.count]), [['l1', undefined], ['p01', '21']]);
});

test('the cut is the same however the facts were gathered, and gathering it again changes nothing', () => {
  const facts = briefCandidates(lived);
  assert.deepEqual(briefCandidates([...lived].reverse()), facts);
  assert.deepEqual(briefCandidates(facts), facts);
  assert.equal(briefBasis(lived), briefBasis(facts));
  /* One more question moves the count, and so the basis a kept briefing stands on. */
  assert.notEqual(briefBasis([...lived, fact('q99', 'asked', 'Zebra crossing?', { cause: 'cause-99', rank: BRIEF_RANK.asked })]), briefBasis(lived));
});

test('forty questions no longer push what is due out of the thirty a model is handed', () => {
  const dues = Array.from({ length: 28 }, (_, n) => fact(`d${two(n)}`, 'due', `Bill ${two(n)}`, { rank: BRIEF_RANK.due + within(n, 28) }));
  const facts = briefCandidates([...questions(40), ...dues]);
  assert.equal(facts.length, BRIEF_FACTS_MOST);
  assert.deepEqual(facts.slice(0, 2).map((f) => [f.h, f.figures.count]), [['q01', '39'], ['q02', '1']]);
  assert.equal(facts.filter((f) => f.kind === 'due').length, 28);
  /* The model is handed the same two, the first with the count it may leave a hole for. */
  const input = briefInput([...questions(40), ...dues], '2026-10-14');
  assert.deepEqual(input.facts.filter((f) => f.kind === 'asked').map((f) => [f.h, f.figures.count]), [['q01', '39'], ['q02', '1']]);
});

test('a model\'s cards are held to the same cap', () => {
  const at = '2026-10-14T08:00:00.000Z';
  /* Handed the facts as they were gathered, a model that writes five question cards keeps two, in its order. */
  /* EACH IN ITS OWN WORDS: a briefing never says one sentence twice (`briefing.test.ts`), so lines alike would be one. */
  const said: Record<string, string> = {
    q05: 'The lease is still waiting on you.',
    q04: 'The refund is still waiting on you.',
    q03: 'The supplier is still waiting on you.',
    q02: 'The invoice is still waiting on you.',
    q01: 'The contract is still waiting on you.',
  };
  const five = { cards: ['q05', 'q04', 'l1', 'q03', 'q02', 'q01'].map((h) => ({ h, line: h === 'l1' ? 'Studio rent is {{days}} days late.' : said[h]! })) };
  const kept = briefOf(five, lived);
  assert.deepEqual(kept.map((c) => c.h), ['q05', 'q04', 'l1']);
  /* With nothing but questions handed, three stand. */
  assert.deepEqual(briefOf(five, questions(20)).map((c) => c.h), ['q05', 'q04', 'q03']);
  /* Through the whole briefing the model can only name the two it was handed, and the count is the record's. */
  const brief = briefFrom({ cards: [...five.cards, { h: 'q01', line: '{{count}} questions are still open.' }] }, lived, at);
  assert.deepEqual(brief.cards.map((c) => [c.h, c.line, c.by]), [
    ['l1', 'Studio rent is 3 days late.', 'slash'],
    ['q02', 'The invoice is still waiting on you.', 'slash'],
    ['q01', 'The contract is still waiting on you.', 'slash'],
  ]);
  assert.equal(askedIn(lived, briefFrom(null, lived, at).cards), 2);
});
