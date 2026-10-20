/**
 * What `arrangeTurns` proposes, read from two sentences, held against the words a founder typed in a real first run.
 *
 * RED FIRST, AND BOTH HALVES WERE. Against the screen's old reading (turn two alone, turn one only when
 * turn two picked nothing) and catalogue order for every tie, the two tests below answered `personal`
 * where each expects `founder`: walk two's own words, and the Solo founder card's summary typed back.
 * Reading both turns fixed the first and not the second, which has no turn one to lean on; breaking a
 * tie on the length of what was heard (`@braindog/seed/usecases` `arrange`) fixed the second. Breaking
 * it on the word heard first fixed it too, and sent the Etsy shop in `shape.test.ts` to Small business.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, arrange } from '@braindog/seed/usecases';
import { formedFor } from '@braindog/seed/usecases/install';
import { STARTING_POINTS } from './first-run.ts';
import { hear } from './who.ts';
import { arrangeTurns } from './arrange.ts';
import { propose } from './start/propose.ts';

const founder = USE_CASES.find((u) => u.usecase === 'founder')!;

/* Walk two's own words, as typed. */
const WHO = 'Sami. I run a few companies and use Claude and Codex on all of them.';
const ABOUT = 'My companies, the money across them, and the Claude and Codex agents I run on them';

test('THE SOLO FOUNDER CARD, TYPED BACK, IS SOLO FOUNDER, and not Personal on a one-to-one tie', () => {
  assert.equal(arrange(founder.summary).pick?.usecase, 'founder');
});

test('WALK TWO IS A FOUNDER, read from both turns, whether turn one was typed or the chip', () => {
  assert.equal(arrangeTurns(hear(WHO).bio, ABOUT).pick?.usecase, 'founder');
  assert.equal(arrangeTurns(STARTING_POINTS[1], ABOUT).pick?.usecase, 'founder');
  const both = arrangeTurns(hear(WHO).bio, ABOUT);
  assert.equal(both.ranked[0]?.score, 2, 'companies in turn one and My companies in turn two');
});

test('EACH REASON IS A PHRASE OF THE SENTENCE IT IS SAID AGAINST, which is turn two unless turn two heard nothing', () => {
  const both = arrangeTurns(hear(WHO).bio, ABOUT);
  assert.equal(both.from, ABOUT);
  for (const r of both.ranked) for (const w of r.why) assert.equal(both.from.slice(w.at, w.at + w.text.length), w.text);
  assert.deepEqual(both.ranked.find((r) => r.usecase === founder)?.why.map((w) => w.text), ['My companies']);

  const quiet = arrangeTurns("I'm a student", 'things to keep track of');
  assert.equal(quiet.pick?.usecase, 'student');
  assert.equal(quiet.from, "I'm a student");
  for (const r of quiet.ranked) for (const w of r.why) assert.equal(quiet.from.slice(w.at, w.at + w.text.length), w.text);

  assert.deepEqual(arrangeTurns('', ABOUT), { ...arrange(ABOUT), from: ABOUT }, 'with no turn one, the reading is the one it always was');
});

/* THE SENTENCE IS THE PICK'S, NOT ANY USE CASE'S. The first cut chose turn two whenever anything at all
   was heard there, so "I want to start a podcast" then "I send invoices" proposed the New project guide
   on turn one's podcast and formed it around "I send invoices", where `formedFor` finds no project: the
   podcast's milestones, steps and choices were never planted, and the screen showed no reason for the
   guide. Measured before the fix: `from` "I send invoices", `formedFor` null. */
test('THE PROPOSAL FORMS AROUND THE TURN THAT NAMED IT, when turn two only heard some other use case', () => {
  const podcast = arrangeTurns('I want to start a podcast', 'I send invoices');
  assert.equal(podcast.pick?.usecase, 'guide');
  assert.equal(podcast.from, 'I want to start a podcast');
  assert.equal(formedFor(podcast.pick!, podcast.from)?.kind, 'podcast');
  assert.deepEqual(podcast.ranked.find((r) => r.usecase === podcast.pick)?.why.map((w) => w.text), ['start a', 'podcast']);
});

/* EACH CHIP ON ITS OWN PROPOSES ITS OWN PERSON. The first run asks one question, and its chips are use case 6's five
   starting points (his word of 9 October): a shop, a freelancer, a student, a founder of a few companies and a team. */
const CHIPS: Record<string, string> = {
  'I run a small shop': 'shop',
  'I freelance': 'business',
  "I'm a student": 'student',
  'I run a few companies': 'founder',
  "I'm part of a team": 'team',
};

test('THE TABLE IS EVERY CHIP, and each is what that chip alone proposes', () => {
  assert.deepEqual(Object.keys(CHIPS), [...STARTING_POINTS]);
  for (const [chip, id] of Object.entries(CHIPS)) assert.equal(arrange(chip).pick?.usecase, id, chip);
});

/* A CATALOGUE USE CASE IS HEARD BY ITS OWN WORDS (USE-A16). No list compiled into the app holds "flats" or "tenants", so
   the landlord's sentence was Personal on "rent" twice: measured before `heard`, Personal 2 and nothing else above 0. The
   catalogue use case here is invented, and so are its words; it stands on Money, which this build ships. */
const FLATS = 'I rent out six flats to tenants and need to keep track of the rent';
const RENT_BOOK = { id: 'rent-book', title: 'Rent book', summary: 'Flats, the tenants in them and the rent each one owes.', signals: ['flats', 'tenants', 'rent'], modules: ['money-core'] };

test('A CATALOGUE USE CASE IS PROPOSED BY ITS OWN SIGNALS, counted as a shipped one is counted', () => {
  const heard = arrangeTurns(null, FLATS, [RENT_BOOK]);
  assert.equal(heard.pick?.usecase, 'rent-book');
  assert.equal(heard.pick?.title, 'Rent book');
  assert.deepEqual(heard.pick?.modules, ['money-core']);
  assert.deepEqual(heard.ranked[0]?.why.map((w) => w.text), ['rent', 'flats', 'tenants', 'rent']);
  for (const r of heard.ranked) for (const w of r.why) assert.equal(heard.from.slice(w.at, w.at + w.text.length), w.text);
  /* TWO TURNS READ IT THE SAME WAY, the catalogue's words counted in both. */
  assert.equal(arrangeTurns('I have a few flats', 'tenants and the rent', [RENT_BOOK]).pick?.usecase, 'rent-book');
  /* AN OFFER WITH NO TITLE (`heardOf`) IS SAID IN WORDS, never by its id. */
  const bare = arrangeTurns(null, FLATS, [{ id: RENT_BOOK.id, signals: RENT_BOOK.signals, modules: RENT_BOOK.modules }]);
  assert.equal(bare.pick?.title, 'Rent book');
});

test('WITH NO CATALOGUE THE SAME SENTENCE IS WHAT IT WAS, byte for byte', () => {
  assert.deepEqual(arrangeTurns(null, FLATS), { ...arrange(FLATS), from: FLATS });
  assert.equal(arrangeTurns(null, FLATS).pick?.usecase, 'personal');
  assert.deepEqual(arrangeTurns(null, FLATS, []), arrangeTurns(null, FLATS));
  assert.deepEqual(arrangeTurns(hear(WHO).bio, ABOUT, []), arrangeTurns(hear(WHO).bio, ABOUT));
});

test('A CATALOGUE ENTRY UNDER A SHIPPED ID IS PASSED OVER, as a use case or a module, and so is one with no words', () => {
  const shadow = [
    { ...RENT_BOOK, id: 'personal', title: 'Not personal' },
    { ...RENT_BOOK, id: 'money-core', title: 'Not money' },
    { ...RENT_BOOK, id: 'quiet-book', signals: [] },
  ];
  assert.deepEqual(arrangeTurns(null, FLATS, shadow), arrangeTurns(null, FLATS));
  assert.equal(arrangeTurns(null, FLATS, shadow).pick?.title, useCaseTitle('personal'));
  /* A TIE STILL GOES AS IT DID: equal words and equal length leave the shipped use case first, by catalogue order. */
  const twin = { ...RENT_BOOK, id: 'pocket-book', signals: [...(USE_CASES.find((u) => u.usecase === 'personal')?.signals ?? [])] };
  assert.equal(arrangeTurns(null, FLATS, [twin]).pick?.usecase, 'personal');
});

const useCaseTitle = (id: string): string | undefined => USE_CASES.find((u) => u.usecase === id)?.title;

/* AND THE FIRST RUN PROPOSES IT: `propose` hands the catalogue it is given to the rules, which before heard only the
   compiled words and proposed Personal for the same sentence with the same catalogue in hand. */
test('THE FIRST RUN PROPOSES THE CATALOGUE USE CASE IT IS HANDED, and the modules it stands on', () => {
  const offer = [{ id: RENT_BOOK.id, signals: RENT_BOOK.signals, modules: RENT_BOOK.modules }];
  const with_ = propose(FLATS, { zone: 'UTC', locale: 'en', catalogue: offer });
  assert.equal(with_.usecase, 'rent-book');
  assert.ok(with_.modules.includes('money-core'), with_.modules.join(', '));
  assert.ok(!with_.modules.includes('rent-book'), 'the use case is not its own module');
  for (const h of with_.heard) assert.doesNotMatch(h.became, /rent-book/u, 'said by its name, never its id');
  assert.equal(propose(FLATS, { zone: 'UTC', locale: 'en' }).usecase, 'personal');
});
