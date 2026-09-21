/**
 * The three decisions `/start` makes after the sentence is read, held against what four people
 * measured in a browser on 21 September (`loop/research-usability-2026-09-21.md`, findings 2, 5 and 10).
 *
 * DRIVEN FIRST AND ASSERTED SECOND. Each of the three was reproduced on a fresh self-host at 390 with
 * a coarse pointer before a line of it was changed: the student's rail carried Projects and its
 * `/p/portfolio` drew 157 words, nine empty blocks and three money figures of £0.00; a second press of
 * `Make my record` took the screen from 17 controls to 16 and the one it dropped was the only way off
 * a screen with no rail and no tab bar; and the guide's outcome called sixteen rows formed from the
 * person's own sentence "example rows". A browser leaves nothing a later reader can re-run, so the
 * rule under each reading is here, where it can go red on its own.
 *
 * AGAINST THE SEED AND THE ARRANGER THE APP SHIPS, for the reason `first-run.test.ts` gives: the
 * defect in each case is two things drifting apart, and a fixture repeating one of them would pass
 * while the screen stayed wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addedIn, firstModules, firstRun, onwardFrom } from './first-run.ts';
import { INSTALL_ORDER, LEANS_ON, shape, toTurnOn, type PackId } from './shape.ts';
import { moduleExamples } from '@braindog/seed/usecases/install';
import { USE_CASES, arrange, listsOf } from '@braindog/seed/usecases';

const useCase = (id: string) => {
  const u = USE_CASES.find((x) => x.usecase === id);
  assert.ok(u, `there is no ${id} use case`);
  return u;
};

/** The modules a sentence ends with: what the screen asks for, then the closure the screen applies. */
function modulesFor(said: string, named: boolean): PackId[] {
  const read = shape(said);
  const wanted = new Set(firstModules(toTurnOn(read, named), read.packs, named) as PackId[]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...wanted])
      for (const needs of LEANS_ON[id] ?? [])
        if (!wanted.has(needs)) {
          wanted.add(needs);
          grew = true;
        }
  }
  return INSTALL_ORDER.filter((id) => wanted.has(id));
}

test('A MODULE NOTHING IN THE SENTENCE POINTED AT DOES NOT ARRIVE: the student keeps Tasks and loses Projects', () => {
  const said = 'I keep losing track of my coursework deadlines';
  const read = shape(said);
  /* The reading this rests on: one phrase, `deadlines`, and Projects carried no phrase at all. */
  assert.deepEqual(
    read.packs.map((p) => ({ id: p.id, why: p.why.map((w) => w.text) })),
    [
      { id: 'work', why: ['deadlines'] },
      { id: 'portfolio', why: [] },
    ],
  );
  assert.deepEqual(toTurnOn(read, false), ['portfolio', 'work'], 'the reader still answers both, and this is not about that');
  assert.deepEqual(modulesFor(said, false), ['work'], 'Projects arrived on a maths student’s record with no phrase behind it');
  assert.deepEqual(modulesFor(said, true), ['people', 'work'], 'a name heard in turn 1 is the phrase behind People');
});

test('AND A MODULE SOMETHING GENUINELY LEANS ON STILL ARRIVES, so the narrowing costs no install it needed', () => {
  /* Money, Renewals and Agents each lean on Projects (`LEANS_ON`), so Projects comes back for them. */
  assert.deepEqual(modulesFor('I send invoices', false), ['portfolio', 'people', 'money-core']);
  assert.deepEqual(modulesFor('Domains and hosting', false), ['portfolio', 'estate']);
  assert.deepEqual(modulesFor('I use Claude or Codex', false), ['portfolio', 'agents']);
});

test('PRESSING MAKE MY RECORD TWICE KEEPS THE WAY OUT: the way onward is what the record holds', () => {
  const own = { id: 'study_sessions', name: 'Study sessions' };
  const first = { made: [], added: ['Courses', 'Assignments', 'Study sessions'], on: [] };
  /* The first press, which was never the broken one. */
  assert.deepEqual(onwardFrom(first, own, true, null), { register: 'study_sessions', list: 'Study sessions' });
  /* The second press changed nothing, and the record holds the lists all the same. */
  const again = { made: [], added: [], on: [] };
  assert.deepEqual(onwardFrom(again, own, true, null), { register: 'study_sessions', list: 'Study sessions' }, 'the second press left the screen with no way out of it');
  /* And a use case whose lists are NOT on the record does not get a door into them. */
  assert.equal(onwardFrom(again, own, false, null), null);
  /* A row this press wrote still wins, because it is the thing the person just did. */
  assert.deepEqual(onwardFrom({ made: [{ register: 'obligations', list: 'Money' }], added: [], on: [] }, own, true, null), { register: 'obligations', list: 'Money' });
});

test('THE OUTCOME SAYS WHAT THE LISTS IT ADDED HOLD, and calls nobody’s formed plan an example', () => {
  /* The four sentences the screen maps these groups to, which is where the defect was: one of them
     was said about every list, and two of the four people were told something untrue by it. */
  assert.ok(!firstRun.shapeAddedFormed('Milestones').includes('example'), 'a formed plan is still called an example');
  assert.ok(firstRun.shapeAddedFormed('Milestones').includes('what you said'), 'a formed plan does not say where it came from');
  assert.ok(firstRun.shapeAdded('Courses').includes('example rows'), 'a list that really carries examples stopped saying so');
  assert.equal(firstRun.shapeAddedPlain('People'), 'Added People.');
  assert.ok(firstRun.shapeAddedEmpty('Projects and Tasks').includes('nothing in them yet'));

  const guide = listsOf(useCase('guide')).map((l) => ({ name: l.name, rows: 'formed' as const }));
  assert.deepEqual(addedIn(guide), [{ rows: 'formed', names: 'Milestones, Choices, Resources and Steps' }]);

  /* A student's modules carry no rows of anybody's (`MODULE_EXAMPLES` names no student), so the one
     sentence the screen had was false about three of the six lists it named. */
  assert.equal(moduleExamples(useCase('student')).length, 0);
  assert.deepEqual(
    addedIn([
      { name: 'Projects', rows: 'empty' },
      { name: 'People', rows: 'own' },
      { name: 'Tasks', rows: 'empty' },
      { name: 'Courses', rows: 'example' },
    ]),
    [
      { rows: 'example', names: 'Courses' },
      { rows: 'own', names: 'People' },
      { rows: 'empty', names: 'Projects and Tasks' },
    ],
  );
  assert.deepEqual(addedIn([]), []);
});

test('AND A RECORD ALREADY MADE IS TOLD SO, with a way back into it', () => {
  /* `/start` on an arranged record drew 21 words, five controls and a blank "Who are you?", with no
     sign of the use case, the name and the 400 rows behind it, and nothing to press to get back. */
  for (const key of ['againMade', 'againMore', 'againBack'] as const) assert.equal(typeof firstRun[key], 'string', `there is no ${key} sentence for a record that is already made`);
  assert.ok(!firstRun.shapeDescribe.includes('business'), `the first screen offers to describe a business: ${firstRun.shapeDescribe}`);
});

/* AND THE ONE PLACE THE ARRANGER IS ASKED FOR ALL FOUR PEOPLE, so a use case that stops being picked
   for its own person is a failure here rather than a surprise in a browser. */
test('the four people are still heard: student, founder, team and guide', () => {
  assert.equal(arrange('I keep losing track of my coursework deadlines').pick?.usecase, 'student');
  assert.equal(arrange('I run a few companies and I send invoices').pick?.usecase, 'founder');
  assert.equal(arrange("I'm part of a team and we track tasks for a small team").pick?.usecase, 'team');
  assert.equal(arrange('I want to start a podcast and I do not know where to begin').pick?.usecase, 'guide');
});
