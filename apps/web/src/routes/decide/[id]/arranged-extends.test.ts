/**
 * Decide says what a pack lays on another pack's list, and which choices an update takes off stay on it, from the step
 * the record files (`packages/record/src/arrange.ts` `planAll`).
 *
 * THE STEPS BELOW ARE AS THE RECORD FILED THEM on the seed catalogue: Personal set up on a fresh record, and a People
 * update that sheds `registrar` from a Personal record holding one registrar row. Before the record carried `extends`
 * and `stays`, Personal's step said its own lists, pages and measures, and the five roles it lays on People were not on
 * the screen at all; the People update read "Changes: People", the same line an update that did take the choice away
 * would get.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrangedOf } from './arranged.ts';
import type { Appears } from './proposed.ts';

const ROLES = ['role.family', 'role.friend', 'role.landlord', 'role.tradesperson', 'role.adviser'];

const PERSONAL = {
  usecase: 'personal',
  why: ['You said you want your bills and savings in one place.'],
  packs: { install: ['people', 'usecase-personal'] },
  plan: [
    { pack: 'people', version: '1.0.0', adds: ['register.people', 'page.people'] },
    { pack: 'usecase-personal', version: '1.6.0', adds: ['register.spending', 'page.spending'], extends: [{ id: 'register.people', adds: ROLES }] },
  ],
  approve: [],
  names: { 'register.people': 'People', 'register.spending': 'Spending', 'page.spending': 'Spending', 'page.people': 'People' },
};

const SHEDS = {
  install: 'people',
  kind: 'pack',
  title: 'people',
  packs: { install: ['people'] },
  plan: [{ pack: 'people', from: '1.0.0', version: '1.1.0', adds: [], changes: ['register.people'], stays: [{ id: 'register.people', values: ['role.registrar'], rows: 1 }] }],
  approve: [],
};

const appearing = (out: ReturnType<typeof arrangedOf>): Appears[] => {
  const part = out?.parts.find((p) => p.part === 'appears');
  return part?.part === 'appears' ? part.appears : [];
};

test('PERSONAL SET UP SAYS WHAT IT ADDS TO PEOPLE, the five roles counted and each said as a word', () => {
  const out = arrangedOf('arrange', PERSONAL);
  const laid = appearing(out).filter((a) => a.title.includes('Family'));
  assert.deepEqual(
    laid.map((a) => `${a.kind}: ${a.title}`),
    ['Adds to a list: Personal adds 5 choices to Role in People: Family, Friend, Landlord, Tradesperson and Adviser'],
  );
  /* NO ID AND NO STORED SPELLING reaches the screen: not `role.family`, not `register.people`, not `usecase-personal`. */
  assert.doesNotMatch(JSON.stringify(out), /role\.|register\.|usecase-/u);
  assert.match(out?.summary ?? '', /1 more change/u, 'the queue line counts what is laid on People as a change');
});

test('A PEOPLE UPDATE SAYS WHICH CHOICE IT TAKES OFF STAYS, and why, with the rows named', () => {
  const out = arrangedOf('pack', SHEDS);
  const kept = appearing(out).filter((a) => a.kind === 'Kept');
  assert.deepEqual(
    kept.map((a) => a.title),
    ['People keeps the choice Registrar for Role, which this update takes off, because it holds 1 row that may use it.'],
  );
  assert.doesNotMatch(JSON.stringify(out), /role\.|register\./u);
});

test('THE OWNER’S WORDS FOR A CHOICE ARE USED, and several choices and rows are counted as several', () => {
  const out = arrangedOf(
    'pack',
    { ...SHEDS, plan: [{ ...SHEDS.plan[0], stays: [{ id: 'register.people', values: ['role.registrar', 'role.collaborator'], rows: 4 }] }] },
    { labels: { 'people.role.registrar': 'Agency', 'people.role.collaborator': 'Project partner', people: 'Contacts' } },
  );
  assert.deepEqual(
    appearing(out).filter((a) => a.kind === 'Kept').map((a) => a.title),
    ['Contacts keeps 2 choices, Agency and Project partner, for Role, which this update takes off, because it holds 4 rows that may use them.'],
  );
});

/* THE ROWS THAT HOLD IT, NOT THE LIST'S. "Because it holds 3 rows that may use it" was said of a Personal record whose
   three People rows were all Family. Where the record counts holders the
   step carries `holding`, keyed as `values` is, and the sentence gives both numbers. */
test('A CHOICE KEPT FOR THE ROWS THAT HOLD IT SAYS HOW MANY OF THE LIST’S ROWS DO', () => {
  const stays = (s: Record<string, unknown>, labels?: Record<string, string>) =>
    appearing(arrangedOf('pack', { ...SHEDS, plan: [{ ...SHEDS.plan[0], stays: [{ id: 'register.people', ...s }] }] }, labels === undefined ? {} : { labels }))
      .filter((a) => a.kind === 'Kept')
      .map((a) => a.title);
  assert.deepEqual(stays({ values: ['role.registrar'], rows: 2, holding: { 'role.registrar': 1 } }), [
    'People keeps the choice Registrar for Role, which this update takes off, because 1 of its 2 rows holds it.',
  ]);
  assert.deepEqual(stays({ values: ['role.registrar'], rows: 1, holding: { 'role.registrar': 1 } }), [
    'People keeps the choice Registrar for Role, which this update takes off, because its one row holds it.',
  ]);
  assert.deepEqual(
    stays(
      { values: ['role.registrar', 'role.collaborator'], rows: 5, holding: { 'role.registrar': 1, 'role.collaborator': 2 } },
      { 'people.role.registrar': 'Agency', 'people.role.collaborator': 'Project partner', people: 'Contacts' },
    ),
    ['Contacts keeps 2 choices, Agency and Project partner, for Role, which this update takes off, because 3 of its 5 rows hold one of them.'],
  );
  assert.deepEqual(stays({ values: ['role.registrar', 'role.collaborator'], rows: 3, holding: { 'role.registrar': 1, 'role.collaborator': 2 } }), [
    'People keeps 2 choices, Registrar and Collaborator, for Role, which this update takes off, because all 3 of its rows hold one of them.',
  ]);
});

/* A ROW IN THE BIN HOLDS ITS VALUES TOO, and the record counts it (`binned`), because taking the value off made the row's
   restore `ENUM_VALUE_UNKNOWN`. Said with the sentence above alone, a People whose one registrar row was deleted read
   "because all 0 of its rows hold it", measured before `binned` was read; beside one live client row it would say "its
   one row holds it" of a row that holds nothing of the kind. */
test('A CHOICE KEPT FOR A ROW IN THE BIN SAYS SO, apart from the live rows that hold it', () => {
  const stays = (s: Record<string, unknown>) =>
    appearing(arrangedOf('pack', { ...SHEDS, plan: [{ ...SHEDS.plan[0], stays: [{ id: 'register.people', ...s }] }] }, {}))
      .filter((a) => a.kind === 'Kept')
      .map((a) => a.title);
  assert.deepEqual(stays({ values: ['role.registrar'], rows: 0, holding: { 'role.registrar': 1 }, binned: { 'role.registrar': 1 } }), [
    'People keeps the choice Registrar for Role, which this update takes off, because a deleted row holds it, and the row could not be restored without it.',
  ]);
  assert.deepEqual(stays({ values: ['role.registrar'], rows: 1, holding: { 'role.registrar': 1 }, binned: { 'role.registrar': 1 } }), [
    'People keeps the choice Registrar for Role, which this update takes off, because a deleted row holds it, and the row could not be restored without it.',
  ]);
  assert.deepEqual(stays({ values: ['role.registrar'], rows: 3, holding: { 'role.registrar': 3 }, binned: { 'role.registrar': 2 } }), [
    'People keeps the choice Registrar for Role, which this update takes off, because 1 of its 3 rows holds it, and 2 deleted rows do too.',
  ]);
  assert.deepEqual(stays({ values: ['role.registrar', 'role.collaborator'], rows: 2, holding: { 'role.registrar': 3, 'role.collaborator': 1 }, binned: { 'role.registrar': 1 } }), [
    'People keeps 2 choices, Registrar and Collaborator, for Role, which this update takes off, because all 2 of its rows hold one of them, and 1 deleted row does too.',
  ]);
});

test('A FIELD LAID ON A LIST IS SAID AS A FIELD, and a step that lays nothing says nothing of it', () => {
  const field = arrangedOf('pack', {
    install: 'plus',
    kind: 'pack',
    title: 'Plus',
    packs: { install: ['plus'] },
    plan: [{ pack: 'plus', version: '1.0.0', adds: [], extends: [{ id: 'register.things', adds: ['domain', 'lane.sold'] }] }],
    approve: [],
    names: { 'register.things': 'Projects' },
  });
  assert.deepEqual(
    appearing(field).filter((a) => a.kind === 'Adds to a list').map((a) => a.title),
    ['Plus adds 1 field to Projects: Domain', 'Plus adds 1 choice to Lane in Projects: Sold'],
  );
  assert.equal(appearing(arrangedOf('pack', { ...SHEDS, plan: [{ ...SHEDS.plan[0], stays: [] }] })).some((a) => a.kind === 'Kept' || a.kind === 'Adds to a list'), false);
});
