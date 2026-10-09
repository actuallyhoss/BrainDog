/**
 * Nothing the first run writes is an example, held against the
 * documents the seed builds and the file "Make it mine" hands the record.
 *
 * WHAT IT WAS: a Personal record arrived holding 56 example rows, every one in pounds,
 * and "Start from a list" planted the sample studio's clients (Kiln, Halden) in anybody's record, because
 * `moduleDocument` with no use case left the module's own rows in. A preview may draw examples; nothing that writes asks
 * for them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, arrange } from '@braindog/seed/usecases';
import { carriedDocument, moduleDocument, moduleExamples, plantedRows } from '@braindog/seed/usecases/install';

import { fileFor, withNeeds } from '../routes/start/accept.ts';
import { firstRun } from './first-run.ts';

const TODAY = '2026-09-26';
const MODULE_IDS = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'];

const useCase = (id: string) => {
  const u = USE_CASES.find((x) => x.usecase === id);
  assert.ok(u, `there is no ${id} use case`);
  return u;
};

const seedsOf = (doc: Record<string, unknown> | null): unknown[] => (Array.isArray(doc?.seeds) ? (doc.seeds as unknown[]) : []);

test('A MODULE CARRIES NO ROWS UNLESS IT IS ASKED FOR EXAMPLES, with a use case or without one', () => {
  for (const id of MODULE_IDS) {
    assert.deepEqual(seedsOf(moduleDocument(null, id, { today: TODAY })), [], `${id} carries the sample's rows`);
    for (const u of USE_CASES) assert.deepEqual(seedsOf(moduleDocument(u, id, { today: TODAY })), [], `${id} carries ${u.usecase}'s examples`);
  }
  /* AND ASKED, THEY ARE STILL THERE, for a preview or a test to draw. The founder's, since Personal 2.0.0 gives its
     modules none. */
  const founder = useCase('founder');
  assert.ok(moduleExamples(founder).length > 0, 'the founder gives its modules no examples to draw');
  assert.ok(seedsOf(moduleDocument(founder, 'money-core', { today: TODAY, examples: true })).length > 0, 'examples: true carries nothing');
});

test('A USE CASE CARRIES ONLY THE PLAN FORMED FROM WHAT THE PERSON SAID', () => {
  for (const u of USE_CASES) assert.deepEqual(seedsOf(carriedDocument(u, TODAY)), [], `${u.usecase} carries its examples`);
  const guide = useCase('guide');
  const formed = seedsOf(carriedDocument(guide, TODAY, 'I want to start a podcast'));
  assert.ok(formed.length > 0, 'the podcast plan is not carried');
  for (const s of formed as { fields?: { tags?: unknown[] } }[]) assert.ok(s.fields?.tags?.includes('formed') === true, 'a formed row is not tagged formed');
  /* A SENTENCE THAT FORMS NOTHING PLANTS NOTHING. */
  assert.deepEqual(plantedRows(guide, TODAY, 'I send invoices').rows, []);
});

test('THE FILE MAKE IT MINE HANDS THE RECORD HOLDS NO EXAMPLE, and the modules the person kept', async () => {
  for (const u of USE_CASES) {
    const file = await fileFor(u, ['people'], TODAY, '');
    assert.ok(file, `${u.usecase} has no file`);
    const pack = file.pack as Record<string, unknown> | null;
    assert.deepEqual(seedsOf(pack), [], `${u.usecase}'s file carries its examples`);
    assert.equal(file.links, undefined, `${u.usecase}'s file links examples that are not there`);
    for (const m of u.modules) assert.ok((file.modules as string[]).includes(m), `${u.usecase}'s file leaves out ${m}, which it stands on`);
  }
  const podcast = await fileFor(useCase('guide'), [], TODAY, 'I want to start a podcast');
  assert.ok(seedsOf(podcast?.pack as Record<string, unknown>).length > 0, 'the formed plan is not in the file');
});

test('A USE CASE IS INSTALLED WITH EVERY MODULE IT STANDS ON, whatever was switched off', () => {
  const founder = useCase('founder');
  assert.deepEqual(withNeeds(founder, []), [...founder.modules]);
  assert.deepEqual(withNeeds(null, ['people']), ['people']);
});

/* AND THE ONE PLACE THE ARRANGER IS ASKED FOR ALL FOUR PEOPLE, so a use case that stops being picked
   for its own person is a failure here rather than a surprise in a browser. */
test('the four people are still heard: student, founder, team and guide', () => {
  assert.equal(arrange('I keep losing track of my coursework deadlines').pick?.usecase, 'student');
  assert.equal(arrange('I run a few companies and I send invoices').pick?.usecase, 'founder');
  assert.equal(arrange("I'm part of a team and we track tasks for a small team").pick?.usecase, 'team');
  assert.equal(arrange('I want to start a podcast and I do not know where to begin').pick?.usecase, 'guide');
});

/* AND THE FIVE STARTING POINTS /start AND /signup SHARE (use case 6, step 1): each one, alone, is heard by the arranger
   as its own person, so a chip that stops reaching its use case fails here and not on a stranger's screen. */
test('the five chips /start and /signup share each reach their own use case', () => {
  const want: Record<string, string> = {
    'I run a small shop': 'shop',
    'I freelance': 'business',
    "I'm a student": 'student',
    'I run a few companies': 'founder',
    "I'm part of a team": 'team',
  };
  assert.deepEqual([...firstRun.whoChips], Object.keys(want));
  for (const chip of firstRun.whoChips) assert.equal(arrange(chip).pick?.usecase, want[chip], chip);
});
