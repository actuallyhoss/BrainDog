/**
 * The first-screen checks on planted snapshots: for each check one screen that must pass and one that must fail, so a
 * check that stops seeing what it guards goes red here by itself, before any rig hands it a real screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkScreen, firstScreen, report, UNITS } from '../expect/first-screen.mjs';

const person = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const LAYLA = person('layla.json');
const NOUR = person('nour.json');

const nav = (...names) => names.map((name) => ({ role: 'link', name, landmark: 'navigation' }));
const START = { path: '/start', width: 390, text: ['Who are you?', 'Make it mine'], roles: [{ role: 'heading', name: 'Who are you?', landmark: 'main' }], counts: { people: 0, assignments: 0 } };
const TODAY = (over = {}) => ({
  path: '/app/laylas-studies/today',
  width: 1440,
  text: ['Today', 'Nothing is due yet', 'Layla'],
  roles: nav('Today', 'Decide', 'People', 'Assignments'),
  counts: { people: [{ name: 'Layla', tags: [] }], assignments: [{ name: 'Beta blockers essay', tags: [] }], Decide: 0 },
  ...over,
});

/** For each check: a screen it passes, and a screen it fails with the words it must say. */
const PLANTED = {
  'no-tour': { who: LAYLA, ok: START, bad: { ...START, text: ['Who are you?', 'Take the tour'] }, says: /tour/u },
  'no-count': { who: LAYLA, ok: START, bad: { ...START, text: ['Step 2 of 4'] }, says: /2 of 4/u },
  'nothing-before-press': { who: LAYLA, ok: START, bad: { ...START, counts: { people: 1, assignments: 3 } }, says: /assignments holds 3/u },
  'people-only-them': { who: LAYLA, ok: TODAY(), bad: TODAY({ counts: { people: [{ name: 'Layla' }, { name: 'Ahmed' }] } }), says: /Ahmed beside Layla/u },
  'no-example': {
    who: LAYLA,
    ok: TODAY(),
    bad: TODAY({ counts: { assignments: [{ name: 'Read chapter 1', tags: ['example'] }] } }),
    says: /Read chapter 1/u,
  },
  'rail-has-rows': {
    who: LAYLA,
    ok: TODAY(),
    bad: TODAY({ roles: nav('Today', 'Decide', 'People', 'Assignments', 'Courses'), counts: { people: 1, assignments: 2, courses: 0 } }),
    says: /Courses is in the rail with nothing in it/u,
  },
  'team-no-task': {
    who: NOUR,
    ok: TODAY({ counts: { people: [{ name: 'Nour' }], tasks: 0 } }),
    bad: TODAY({ counts: { people: [{ name: 'Nour' }], tasks: [{ name: 'Set up the board' }] } }),
    says: /1 task nobody typed/u,
  },
};

test('every check has a planted pair and a unit', () => {
  assert.deepEqual(Object.keys(PLANTED).sort(), Object.keys(firstScreen).sort());
  for (const id of Object.keys(firstScreen)) assert.match(UNITS[id] ?? '', /^USE-B\d\d$/u, id);
});

for (const [id, { who, ok, bad, says }] of Object.entries(PLANTED)) {
  test(`${id}: passes on a good screen and fails on a planted one`, () => {
    const good = firstScreen[id](ok, who);
    assert.equal(good.id, id);
    assert.equal(good.pass, true, good.saw);
    const red = firstScreen[id](bad, who);
    assert.equal(red.pass, false, red.saw);
    assert.match(red.saw, says);
  });
}

test('a progress bar with no words is still a count', () => {
  const r = firstScreen['no-count']({ ...START, roles: [{ role: 'progressbar', name: '', landmark: 'main' }] }, LAYLA);
  assert.equal(r.pass, false);
});

test('the first run draws no rail', () => {
  assert.equal(firstScreen['rail-has-rows']({ ...START, roles: nav('Today') }, LAYLA).pass, false);
  assert.equal(firstScreen['rail-has-rows'](START, LAYLA).pass, true);
});

test('a rail place is matched by its name to the list it shows', () => {
  const r = firstScreen['rail-has-rows'](TODAY({ roles: nav('Today', 'Study sessions'), counts: { study_sessions: 2 } }), LAYLA);
  assert.equal(r.pass, true, r.saw);
});

test('a rail link that is no list is never blamed for being empty', () => {
  const r = firstScreen['rail-has-rows'](TODAY({ roles: nav('Today', 'Assignments', 'New list', 'Account', '2 working') }), LAYLA);
  assert.equal(r.pass, true, r.saw);
  assert.equal(firstScreen['rail-has-rows'](TODAY({ roles: nav('Today', 'New list'), counts: {} }), LAYLA).pass, null);
});

test('after "Make it mine" the first-run page is no longer before the press', () => {
  const made = { ...START, counts: { people: 1, assignments: 3 }, roles: [{ role: 'heading', name: 'Your BrainDog is ready', landmark: 'main' }] };
  assert.equal(firstScreen['nothing-before-press'](made, LAYLA).pass, null);
  const making = { ...made, roles: [{ role: 'button', name: 'Making it', landmark: 'main' }] };
  assert.equal(firstScreen['nothing-before-press'](making, LAYLA).pass, null);
  assert.equal(firstScreen['people-only-them']({ ...made, counts: { people: [{ name: 'Layla' }] } }, LAYLA).pass, true);
});

test('before the press People is not read, so an empty People is not red', () => {
  assert.equal(firstScreen['people-only-them'](START, LAYLA).pass, null);
});

test('what she typed is hers: a client in People, a task on the board', () => {
  const mariam = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));
  const r = firstScreen['people-only-them'](TODAY({ counts: { people: [{ name: 'Mariam' }, { name: 'Nadia' }] } }), mariam);
  assert.equal(r.pass, true, r.saw);
  const t = firstScreen['team-no-task'](TODAY({ counts: { tasks: [{ name: 'Login screen' }] } }), NOUR);
  assert.equal(t.pass, true, t.saw);
  assert.equal(firstScreen['team-no-task'](TODAY({ counts: { tasks: 1 } }), NOUR).pass, false);
});

test('what the snapshot does not hold is said, never passed', () => {
  const bare = { path: '/app/x/today', width: 390, text: '', roles: [] };
  for (const r of checkScreen(bare, LAYLA).filter((x) => !['no-tour', 'no-count'].includes(x.id))) assert.equal(r.pass, null, `${r.id}: ${r.saw}`);
  assert.equal(firstScreen['team-no-task'](TODAY(), LAYLA).pass, null);
});

test('no saw holds an em dash', () => {
  for (const { who, ok, bad } of Object.values(PLANTED)) for (const r of [...checkScreen(ok, who), ...checkScreen(bad, who)]) assert.doesNotMatch(r.saw, /\u2014/u);
});

test('with no screen only the words are judged', () => {
  const { lines, code } = report(null, LAYLA);
  assert.equal(code, 0);
  assert.ok(lines.some((l) => /no-tour: green\./u.test(l)));
  assert.ok(lines.some((l) => /rail-has-rows: not seen\./u.test(l)));
  assert.match(lines.at(-1), /^7 checks: 2 green, 0 red, 5 not seen\. UNCHECKED: 5 of 7 read nothing, which is not a pass\. Exit code 0\.$/u);
});

test('a screen where every check read something says nothing of UNCHECKED', () => {
  const { lines } = report([{ ...START, text: ['Take the tour'] }], LAYLA);
  const unseen = lines.filter((l) => /: not seen\./u.test(l)).length;
  assert.equal(/UNCHECKED/u.test(lines.at(-1)), unseen > 0, lines.at(-1));
  if (unseen > 0) assert.ok(lines.at(-1).includes(`UNCHECKED: ${unseen} of `), lines.at(-1));
});

test('a tour on a screen handed in is red and the code is 1', () => {
  const { lines, code } = report([{ ...START, text: ['Take the tour'] }], LAYLA);
  assert.equal(code, 1);
  assert.ok(lines.some((l) => /no-tour: red\. .*tour/u.test(l)));
});
