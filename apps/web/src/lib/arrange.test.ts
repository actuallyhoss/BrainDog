/**
 * What `/start` proposes, read from both turns, held against the words a founder typed on 22 September
 * (`loop/research-first-sign-in.md` §3, friction 3).
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
import { firstRun } from './first-run.ts';
import { hear } from './who.ts';
import { arrangeTurns } from './arrange.ts';

const founder = USE_CASES.find((u) => u.usecase === 'founder')!;

/* Walk two's own words, as typed (`loop/research-first-sign-in.md` steps 7 and 8). */
const WHO = 'Sam. I run a few companies and use Claude and Codex on all of them.';
const ABOUT = 'My companies, the money across them, and the Claude and Codex agents I run on them';

test('THE SOLO FOUNDER CARD, TYPED BACK, IS SOLO FOUNDER, and not Personal on a one-to-one tie', () => {
  assert.equal(arrange(founder.summary).pick?.usecase, 'founder');
});

test('WALK TWO IS A FOUNDER, read from both turns, whether turn one was typed or the chip', () => {
  assert.equal(arrangeTurns(hear(WHO).bio, ABOUT).pick?.usecase, 'founder');
  assert.equal(arrangeTurns(firstRun.whoChips[1], ABOUT).pick?.usecase, 'founder');
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

/* EVERY TURN-ONE CHIP AGAINST EVERY TURN-TWO CHIP (`loop/research-batch-forty-six-audit.md` §3). Turn two
   answers "What is this BrainDog for?" and turn one answers "Who are you?", so where turn two heard a use
   case it is the one proposed; turn one decides only where turn two heard nothing ("I use Claude or
   Codex", `null` below). Each chip is one signal of one use case, so a pair of chips that name two
   different ones is a one-to-one tie, and scoring the two turns as one sentence gave it to the longer
   phrase and then to catalogue order, whichever turn it came from. Measured before the fix: 6 of these
   24 failed, "I'm a student" with "Tasks for a small team" proposing Student, "I run a few companies"
   with "I send invoices" and with "Tasks for a small team" proposing Solo founder, and "I'm starting
   something new" with "Dashboards for my projects", "I send invoices" and "Tasks for a small team"
   proposing the guide. */
const TURN_TWO: Record<string, string | null> = {
  'My courses and homework': 'student',
  'Dashboards for my projects': 'founder',
  'I send invoices': 'business',
  'Tasks for a small team': 'team',
  'A new project': 'guide',
  'I use Claude or Codex': null,
};
const TURN_ONE: Record<string, string> = {
  "I'm a student": 'student',
  'I run a few companies': 'founder',
  "I'm part of a team": 'team',
  "I'm starting something new": 'guide',
};

test('THE TABLE IS EVERY CHIP, and each column is what that chip alone proposes', () => {
  assert.deepEqual(Object.keys(TURN_TWO), [...firstRun.shapeChips]);
  assert.deepEqual(Object.keys(TURN_ONE), [...firstRun.whoChips]);
  for (const [chip, id] of Object.entries(TURN_TWO)) assert.equal(arrange(chip).pick?.usecase ?? null, id, chip);
  for (const [chip, id] of Object.entries(TURN_ONE)) assert.equal(arrange(chip).pick?.usecase, id, chip);
});

for (const one of firstRun.whoChips) {
  for (const two of firstRun.shapeChips) {
    const want = TURN_TWO[two] ?? TURN_ONE[one];
    test(`TURN ONE NEVER DECIDES AGAINST TURN TWO: "${one}" then "${two}" is ${want}`, () => {
      assert.equal(arrangeTurns(one, two).pick?.usecase, want);
    });
  }
}
