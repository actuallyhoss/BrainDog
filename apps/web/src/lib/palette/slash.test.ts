/**
 * Slash's row in the palette and what its answer draws, without a browser.
 *
 * THE RULE IS `50 §5.5` STEP 5 AND `23 §8`, and both are sentences a markup test would only prove the shape of. The row
 * reads *Ask Slash: {text}* when a model is behind Slash and the query matches no place, and without a model it does not
 * exist: absent, not disabled. The same rule holds for words, and it is the
 * one most easily broken by accident, because every other palette row is built without asking whether a model is there.
 *
 * AND THE ANSWER IS DRAWN BY CODE, NOT BY A MODEL. A `Reading` is a predicate, the rows it matched and what was read; what
 * this file checks is that the predicate comes out as words a person can check against the rows, that each row is an
 * address, and that the fold ends on the vault, refused, every time (`23 §6`), including for an engine that forgot to say so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Reading, SlashProposal, SlashStatus } from '@braindog/client';

import { copy } from '../copy.ts';
import { capLine, drawProposal, drawReading, FIGURES_TRACE, offersSlash, pass2Refused, secondPass, slashWords, whereWords } from './slash.ts';

const ASK = { slash: true, prefix: null, text: 'which invoices are late', pending: false, places: 0 };

test('THE ROW EXISTS ONLY WITH A MODEL BEHIND IT, and then only for plain text that matched no place', () => {
  assert.equal(offersSlash(ASK), 'which invoices are late');
  /* NO MODEL, NO ROW, and not a greyed one: the function answers nothing to draw. */
  assert.equal(offersSlash({ ...ASK, slash: false }), null);
  /* A PLACE MATCHED, so the question has an answer that is not a model's: the row is the fallback, never a rival. */
  assert.equal(offersSlash({ ...ASK, places: 1 }), null);
  /* A PREFIX IS A QUESTION ABOUT ONE KIND OF THING, and `>` `#` `@` `/` each have their own answer already. */
  for (const prefix of ['>', '#', '@', '/']) assert.equal(offersSlash({ ...ASK, prefix }), null, prefix);
  /* NOT WHILE THE RECORD'S OWN SEARCH IS STILL ANSWERING, or the row would appear and vanish under the pointer. */
  assert.equal(offersSlash({ ...ASK, pending: true }), null);
  /* AND NOT FOR NOTHING: a blank ask is the engine's own refusal, so it is never offered. */
  assert.equal(offersSlash({ ...ASK, text: '   ' }), null);
  /* NOR FOR ONE LETTER, which the record's search is never asked about either, so no place could have matched it. */
  assert.equal(offersSlash({ ...ASK, text: 'a' }), null);
  assert.equal(offersSlash({ ...ASK, text: '  late invoices ' }), 'late invoices');
});

test("THE ROW'S WORDS SAY SLASH AND THE QUESTION, and no row this palette draws without a model says Slash", () => {
  assert.equal(copy.askSlash('late invoices'), 'Ask Slash: late invoices');
  /* THE ROWS THAT EXIST WITHOUT A MODEL are built from these keys, and none of them may name Slash. */
  for (const key of ['paletteLabel', 'palettePlaceholder', 'noMatches', 'commands', 'destinations', 'records', 'pages', 'openById'] as const)
    assert.doesNotMatch(String(copy[key]), /Slash/u, key);
});

test('A PREDICATE COMES OUT AS WORDS, the way the rows it matched would be described by somebody reading them', () => {
  assert.equal(whereWords({ field: 'state', is: 'open' }), 'state is open');
  assert.equal(whereWords({ all: [{ field: 'state', is: 'open' }, { field: 'due', before: '2026-10-01' }] }), 'state is open and due is before 2026-10-01');
  assert.equal(whereWords({ any: [{ field: 'state', in: ['open', 'doing', 'waiting'] }, { field: 'owner', empty: true }] }), 'state is one of open, doing, waiting or owner is empty');
  assert.equal(whereWords({ none: [{ field: 'state', is: 'done' }] }), 'not (state is done)');
  assert.equal(whereWords({ field: 'amount', gte: { amount: 500500, currency: 'EGP' } }), 'amount is at least EGP 5005.00');
  assert.equal(whereWords({ field: 'due', between: ['2026-10-01', '2026-10-31'] }), 'due is between 2026-10-01 and 2026-10-31');
  /* A GROUP INSIDE A GROUP IS BRACKETED, or `a and b or c` would be read either way. */
  assert.equal(
    whereWords({ all: [{ field: 'state', is: 'open' }, { any: [{ field: 'tags', has: 'urgent' }, { field: 'late', is: true }] }] }),
    'state is open and (tags has urgent or late is yes)',
  );
  assert.equal(whereWords({ matches: 'acme' }), 'the text matches “acme”');
  assert.equal(whereWords({ field: 'name', via: 'client', starts: 'Ac' }), 'client name starts with Ac');
});

/**
 * TWO LEAVES THE ENGINE HANDS BACK AS THE MODEL DRAFTED THEM, and the words said something else. `propose.ts` returns `where`
 * untouched once `compile` accepts it, and `compile` accepts both of these because `@braindog/where`'s `splitLeaf` reads
 * them: `empty: false` is `present`, `present: false` is `empty`, and a leaf with two tests is `all` of them. Before this,
 * `{ field: 'owner', empty: false }` was drawn `owner is empty` over rows whose owner was set, and `{ field: 'n', gt: 1,
 * lt: 3 }` was drawn `n is more than 1` over a narrower set, which is the one thing the line exists to let a person check.
 */
test('A LEAF IS DRAWN AS THE RECORD READS IT: a false `empty` is set, and two tests on one field are both said', () => {
  assert.equal(whereWords({ field: 'owner', empty: false }), 'owner is set');
  assert.equal(whereWords({ field: 'owner', present: false }), 'owner is empty');
  assert.equal(whereWords({ field: 'n', gt: 1, lt: 3 }), 'n is more than 1 and n is less than 3');
  /* INSIDE A GROUP THE PAIR IS BRACKETED like any other group, or it would run into the `or` beside it. */
  assert.equal(whereWords({ any: [{ field: 'n', gt: 1, lt: 3 }, { field: 'owner', empty: true }] }), '(n is more than 1 and n is less than 3) or owner is empty');
});

const READING: Reading = {
  ask_id: '01M33H56ZCMM62YT38ARN8JRM8',
  predicate: { field: 'state', is: 'open' },
  q: null,
  read: [
    { register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' },
    { register: 'people', rows: 14, predicate: 'all' },
    { register: 'grant', rows: 0, predicate: 'refused' },
  ],
  rows: [
    { id: 'r_1', register: 'tasks', seq: 1, spoken: 'tasks#1', summary: 'Invoice Acme', fields: {} },
    { id: 'r_2', register: 'tasks', seq: 12, spoken: 'tasks#12', summary: 'Invoice Beta', fields: {} },
  ],
};

test('A READING IS DRAWN AS THE PREDICATE, THEN THE ROWS AS ADDRESSES, THEN THE FOLD', () => {
  const drawn = drawReading(READING);
  assert.equal(drawn.where, 'state is open');
  assert.equal(drawn.q, null);
  assert.deepEqual(
    drawn.rows.map((r) => [r.title, r.spoken, r.href]),
    [
      ['Invoice Acme', 'tasks#1', '/r/tasks/1'],
      ['Invoice Beta', 'tasks#12', '/r/tasks/12'],
    ],
  );
  assert.deepEqual(drawn.fold, ['tasks: 2 items, state is open', 'people: 14 items, all', copy.slashGrantRefused]);
  assert.equal(copy.slashGrantRefused, 'grant: refused');
});

test("THE FOLD'S LAST LINE IS THE VAULT, REFUSED, even when the engine left it off, and it is never said twice", () => {
  const forgot = drawReading({ ...READING, read: READING.read.slice(0, 1) });
  assert.equal(forgot.fold.at(-1), copy.slashGrantRefused);
  assert.equal(drawReading(READING).fold.filter((l) => l === copy.slashGrantRefused).length, 1);
});

test('A DRAFT THAT DID NOT FIT IS A KEYWORD SEARCH, and the drawing says which of the two it was', () => {
  const keyword = drawReading({ ...READING, predicate: null, q: 'late invoices', read: [{ register: 'grant', rows: 0, predicate: 'refused' }] });
  assert.equal(keyword.where, null);
  assert.equal(keyword.q, 'late invoices');
  /* A PREDICATE IN THE FOLD THAT IS NOT JSON is printed as it came rather than dropped, so the fold never loses a line. */
  const odd = drawReading({ ...READING, read: [{ register: 'tasks', rows: 1, predicate: 'not json' }] });
  assert.equal(odd.fold[0], 'tasks: 1 item, not json');
});

/*
 * PASS 2: what the palette asks after the rows, and what it draws from the answer.
 * The markup cannot be held here; these are the four decisions it makes, each of which `23 §6` or `23 §8` states as a rule.
 */

const FIGURES = { 'ref:tasks#1': { kind: 'row', register: 'tasks', seq: 1, title: 'Invoice Acme' } };

const PROPOSAL: SlashProposal = {
  text: 'Two invoices are open. {{ref:tasks#1}} is the older.',
  citations: ['tasks#1', 'tasks#12'],
  verbs: ['decide', 'defer', 'dismiss'],
  body_kind: 'options',
  body: { options: [], figures: FIGURES },
  model: 'glm-5.3',
  filed: 'SG14',
  read: READING.read,
};

test('PASS 2 IS ASKED ONLY WHEN PASS 1 FOUND ROWS OR A FIGURE: nothing found is zero inference (`23 §6`)', () => {
  assert.equal(secondPass(READING), true);
  assert.equal(secondPass({ ...READING, rows: [] }), false);
  /* A FIGURE READ IS SOMETHING TO TALK ABOUT, so "why is runway four months" is asked on when no row matched. */
  const figured = { ...READING, rows: [], read: [{ register: FIGURES_TRACE, rows: 1, predicate: '["runway-months"]' }, ...READING.read] };
  assert.equal(secondPass(figured), true);
  /* AND THE FOLD SAYS IT IN WORDS, never as a list's id. */
  assert.equal(drawReading(figured).fold[0], slashWords.figuresLine(1));
});

test('A ROW IS DRAWN BY ITS TITLE, never by the spoken id the host puts in front of it', () => {
  const drawn = drawReading({ ...READING, rows: [{ id: 'r_1', register: 'tasks', seq: 1, spoken: 'tasks#1', summary: 'tasks#1 | Invoice Acme | open', fields: {} }] });
  assert.equal(drawn.rows[0]?.title, 'Invoice Acme');
});

test('A PROPOSAL IS DRAWN WITH ITS MODEL IN THE FOOTER, ALWAYS, and with a way to Needs you what it filed', () => {
  const drawn = drawProposal(PROPOSAL);
  assert.equal(drawn.text, PROPOSAL.text);
  /* THE FIGURES TRAVEL WITH THE SENTENCE, so `Cited` draws the brace as the row it names. */
  assert.deepEqual(drawn.figures, FIGURES);
  assert.doesNotMatch(slashWords.decide, /SG/u);
  assert.equal(drawn.footer, slashWords.drawnBy('glm-5.3'));
  assert.match(drawn.footer, /glm-5\.3/u);
  assert.equal(drawn.decide, '/decide/SG14');
  /* NOTHING THE PACKAGE SENT IS DROPPED ON THE WAY: the verbs arrive as it sent them, in its order. */
  assert.deepEqual(drawn.verbs, ['decide', 'defer', 'dismiss']);
});

test('A PROPOSAL WHOSE MODEL IS MISSING STILL HAS A FOOTER, and the footer says the host named none', () => {
  /* `23 §8`: *"every Slash output carries the model name in its footer, always"*. A host that answered without one is a
     host fault to show, not a line to leave out: a missing footer is exactly how a downgrade goes unseen. */
  for (const model of ['', '   ', undefined as unknown as string]) {
    const drawn = drawProposal({ ...PROPOSAL, model });
    assert.equal(drawn.footer, slashWords.noModel, JSON.stringify(model));
  }
});

test('A QUERY FILES NOTHING, so there is nothing to Needs you and no link to it', () => {
  assert.equal(drawProposal({ ...PROPOSAL, body_kind: 'query', verbs: ['edit', 'save', 'open'], filed: null }).decide, null);
});

test('A FILED PROPOSAL IS DRAWN WHERE IT WAS ASKED, as the one decision card, and a query is not', () => {
  const now = Date.parse('2026-10-06T09:00:00Z');
  const rowset = { ...PROPOSAL, body_kind: 'rowset' as const, body: { register: 'tasks', rows: [{ title: 'Chase Acme' }] }, filed: 'SG21' };
  const card = drawProposal(rowset, 'what is late?', now).card;
  assert.ok(card, 'a filed rowset draws no card');
  assert.equal(card.id, 'SG21');
  assert.equal(card.who, 'slash', 'it is Slash that asks, so the line reads "Slash suggested"');
  assert.equal(card.question, 'what is late?', 'the card is the question as it was filed: the ask');
  assert.deepEqual(card.options, [], 'a rowset is accepted or declined, in the card’s own words');
  assert.equal((card as { money?: unknown }).money, undefined);

  const paying = drawProposal({ ...rowset, body: { register: 'expenses', rows: [{ title: 'Taxi', amount: { amount: 1250, currency: 'GBP' } }] } }, 'add the taxi', now).card;
  assert.deepEqual((paying as { money?: unknown }).money, [{ amount: 1250, currency: 'GBP' }], 'money a proposal writes goes on its card, so no key accepts it');

  const options = {
    ...PROPOSAL,
    body_kind: 'options' as const,
    body: { options: [{ id: 'a', label: 'Per seat', because: 'Cheaper', recommended: true }, { id: 'b', label: 'Flat' }, { label: 'no id' }] },
    filed: 'SG22',
  };
  assert.deepEqual(
    drawProposal(options, 'which plan?', now).card?.options.map((o) => [o.key, o.label, o.recommended]),
    [
      ['a', 'Per seat', true],
      ['b', 'Flat', false],
    ],
  );
  assert.equal(drawProposal({ ...PROPOSAL, body_kind: 'query', filed: null }, 'what is late?', now).card, null, 'a query files nothing');
  assert.equal(drawProposal(rowset).card, null, 'without the ask there is no question to draw');
});

test('THE 80 % LINE IS SHOWN ONCE A MONTH, ON TIER A, BELOW THE CAP, UNTIL DISMISSED FOR THAT MONTH', () => {
  const at = (used: number, cap = 80, tier: SlashStatus['tier'] = 'a'): SlashStatus => ({ tier, model: 'm', asks: { used, cap, resets: '2026-10-01T00:00:00.000Z' } });
  assert.equal(capLine(at(63), null), false);
  assert.equal(capLine(at(64), null), true);
  /* DISMISSED THIS MONTH IS GONE THIS MONTH, and back when the count resets, because the key is the reset instant. */
  assert.equal(capLine(at(64), '2026-10-01T00:00:00.000Z'), false);
  assert.equal(capLine(at(64), '2026-09-01T00:00:00.000Z'), true);
  /* AT THE CAP THE BUDGET REFUSAL SAYS IT, under the rows; the footer line would be the same fact twice. A cap of zero is
     Slash turned off, and `0 of 0 used` is not a warning about anything. */
  assert.equal(capLine(at(80), null), false);
  assert.equal(capLine(at(0, 0), null), false);
  /* OFF TIER `a` NOTHING IS COUNTED, so there is nothing to be near. */
  assert.equal(capLine(at(79, 80, 'byo'), null), false);
});

test('A SPENT BUDGET ON PASS 2 IS ITS OWN FIX, VERBATIM, THEN THE SENTENCE THAT THE ROWS WERE DRAWN WITHOUT IT', () => {
  const fix = 'Slash is out of asks until 2026-10-01. Add your own key, or wait.';
  /* `spent` IS WHAT DRAWS THE TWO BUTTONS, "Use your own key" and "Settings". */
  assert.deepEqual(pass2Refused({ code: 'SLASH_BUDGET_SPENT', fix }), { fix, without: 'Everything above this line was drawn without it.', spent: true });
  /* ANY OTHER REFUSAL IS ITS FIX ALONE: the sentence is only true of a budget stop with rows above it. */
  assert.deepEqual(pass2Refused({ code: 'PROPOSAL_NO_ROWS', fix: 'A proposal names the rows behind it, or it is not filed.' }), {
    fix: 'A proposal names the rows behind it, or it is not filed.',
    without: null,
    spent: false,
  });
});
