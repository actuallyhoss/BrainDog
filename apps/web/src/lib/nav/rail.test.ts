/**
 * The rail's sections (DIRECTION §39): the seven places in their order, each project under Projects, Work's views left
 * to the Work screen, and the rest under More.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORK, flatNav, isHere } from '../nav.ts';
import { AGENTS_PAGE, RAIL_MOST, agentsHref, railOf } from './rail.ts';

type Entry = { title: string; href: string; icon: string; row?: true };

const page = (title: string, href: string, row?: true): Entry => ({ title, href, icon: 'doc', ...(row ? { row } : {}) });

/** The gates' record as the rail reads it: the sections in the order the reader arranged them. */
const SECTIONS: [string, Entry[]][] = [
  ['Money', [page('Money', '/p/money')]],
  ['Work', [page('Work', '/p/work'), page('Board', '/p/work-board')]],
  ['Projects', [page('Overview', '/p/portfolio'), page('Kiln', '/p/kiln', true), page('Portage', '/p/portage', true)]],
  ['Agents', [page('Agents', '/p/agents')]],
  ['People', [page('People', '/p/people')]],
  ['Services', [page('Services', '/p/estate')]],
];

const WORDS = { today: 'Today', activity: 'Activity', decide: 'Decide' };

test('the places are Today, Decide, Work, Projects, Money, People and Agents, in that order', () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Decide');
  assert.deepEqual(
    rail.places.map((i) => i.label),
    ['Today', 'Decide', 'Work', 'Projects', 'Money', 'People', 'Agents'],
  );
  assert.equal(rail.places.length, RAIL_MOST);
  assert.equal(rail.places[1]?.count, 3);
});

test('Decide is a place while nothing waits, with no count', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  const decide = rail.places.find((i) => i.key === 'decide');
  assert.ok(decide);
  assert.equal(decide.count, undefined);
  assert.equal(decide.href, '/decide');
});

test('each project is under Projects, and Work page and Board are not in the rail at all', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  assert.deepEqual(
    rail.things.map(([section, list]) => [section, list.map((e) => e.title)]),
    [['Projects', ['Kiln', 'Portage']]],
  );
  const everywhere = [...rail.places, ...rail.more].map((i) => i.href);
  assert.ok(!everywhere.includes('/p/work-board'));
  assert.equal(new Set(everywhere).size, everywhere.length, 'no place twice');
});

test("on a project's page the project is here, and Projects is not here as well", () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  const projects = rail.places.find((i) => i.label === 'Projects');
  assert.ok(projects);
  assert.ok(!isHere(projects, '/p/kiln'));
  assert.ok(isHere(projects, '/p/portfolio'));
});

test('on Board, Work is here', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  const work = rail.places.find((i) => i.label === 'Work');
  assert.ok(work);
  assert.ok(isHere(work, '/p/work-board'));
  assert.ok(isHere(work, WORK));
});

test('a place past seven and Activity are under More', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  assert.deepEqual(
    rail.more.map((i) => i.label),
    ['Services', 'Activity'],
  );
});

test('a record with fewer sections draws what it has, and an unnamed section follows the named ones', () => {
  const rail = railOf(flatNav([['Coursework', [page('Coursework', '/p/coursework')]], ['Money', [page('Money', '/p/money')]]], 0, WORDS), 'Decide');
  assert.deepEqual(
    rail.places.map((i) => i.label),
    ['Today', 'Decide', 'Money', 'Coursework'],
  );
  assert.deepEqual(rail.more.map((i) => i.label), ['Activity']);
});

test("Board is a view under Work, and the Work screen's own page is not a view of it", () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Decide');
  assert.deepEqual(
    Object.entries(rail.views).map(([key, list]) => [key, list.map((e) => e.title)]),
    [['work', ['Board']]],
  );
});

test("a section's second page is a view under its place, and a tabbed section's strip keeps its own", () => {
  type Tabbed = Entry & { tabs?: true };
  const team: [string, Tabbed[]][] = [
    ['Team', [page('Cycles', '/p/cycles'), page('Agent work', '/p/agent-work')]],
    ['Guide', [{ ...page('Guide', '/p/guide'), tabs: true }, { ...page('Steps', '/p/steps'), tabs: true }]],
  ];
  const rail = railOf(flatNav(team, 0, WORDS), 'Decide');
  assert.deepEqual(
    Object.entries(rail.views).map(([key, list]) => [key, list.map((e) => e.title)]),
    [['section:Team', ['Agent work']]],
  );
  const placed = rail.places.find((i) => i.label === 'Team');
  assert.ok(placed && isHere(placed, '/p/agent-work'));
});

test('"2 working" opens the Agents place, wherever the rail put it, and the agents page on a record without one', () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Decide');
  assert.equal(agentsHref([...rail.places, ...rail.more]), '/p/agents');
  const renamed = [{ key: 'section:Agents', href: '/p/crew', label: 'Agents', icon: 'session', near: ['/p/crew'] }];
  assert.equal(agentsHref(renamed), '/p/crew', 'the Agents place was passed over for the pack\'s page');
  assert.equal(agentsHref(rail.places.filter((i) => i.label !== 'Agents')), AGENTS_PAGE);
});
