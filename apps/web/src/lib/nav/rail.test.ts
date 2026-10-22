/**
 * The rail's sections: the seven places in their order, each project under Projects, Work's views left
 * to the Work screen, and the rest under More.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORK, flatNav, isHere, tabsOf } from '../nav.ts';
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

const WORDS = { today: 'Today', activity: 'Activity', decide: 'Needs you' };

test('the places are Today, Needs you, Work, Projects, Money, People and Agents, in that order', () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(
    rail.places.map((i) => i.label),
    ['Today', 'Needs you', 'Work', 'Projects', 'Money', 'People', 'Agents'],
  );
  assert.equal(rail.places.length, RAIL_MOST);
  assert.equal(rail.places[1]?.count, 3);
});

test('Needs you is a place while nothing waits, with no count', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
  const decide = rail.places.find((i) => i.key === 'decide');
  assert.ok(decide);
  assert.equal(decide.count, undefined);
  assert.equal(decide.href, '/decide');
});

test('each project is under Projects, and Work page and Board are not in the rail at all', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(
    rail.things.map(([section, list]) => [section, list.map((e) => e.title)]),
    [['Projects', ['Kiln', 'Portage']]],
  );
  const everywhere = [...rail.places, ...rail.more].map((i) => i.href);
  assert.ok(!everywhere.includes('/p/work-board'));
  assert.equal(new Set(everywhere).size, everywhere.length, 'no place twice');
});

test("on a project's page the project is here, and Projects is not here as well", () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
  const projects = rail.places.find((i) => i.label === 'Projects');
  assert.ok(projects);
  assert.ok(!isHere(projects, '/p/kiln'));
  assert.ok(isHere(projects, '/p/portfolio'));
});

test('on Board, Work is here', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
  const work = rail.places.find((i) => i.label === 'Work');
  assert.ok(work);
  assert.ok(isHere(work, '/p/work-board'));
  assert.ok(isHere(work, WORK));
});

test('a place past seven and Activity are under More', () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(
    rail.more.map((i) => i.label),
    ['Services', 'Activity'],
  );
});

test('a record with fewer sections draws what it has, and an unnamed section follows the named ones', () => {
  const rail = railOf(flatNav([['Coursework', [page('Coursework', '/p/coursework')]], ['Money', [page('Money', '/p/money')]]], 0, WORDS), 'Needs you');
  assert.deepEqual(
    rail.places.map((i) => i.label),
    ['Today', 'Needs you', 'Money', 'Coursework'],
  );
  assert.deepEqual(rail.more.map((i) => i.label), ['Activity']);
});

test("Board is a view under Work, and the Work screen's own page is not a view of it", () => {
  const rail = railOf(flatNav(SECTIONS, 0, WORDS, { work: WORK }), 'Needs you');
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
  const rail = railOf(flatNav(team, 0, WORDS), 'Needs you');
  assert.deepEqual(
    Object.entries(rail.views).map(([key, list]) => [key, list.map((e) => e.title)]),
    [['section:Team', ['Agent work']]],
  );
  const placed = rail.places.find((i) => i.label === 'Team');
  assert.ok(placed && isHere(placed, '/p/agent-work'));
});

test('"2 working" opens the Agents place, wherever the rail put it, and the agents page on a record without one', () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Needs you');
  assert.equal(agentsHref([...rail.places, ...rail.more]), '/p/agents');
  const renamed = [{ key: 'section:Agents', href: '/p/crew', label: 'Agents', icon: 'session', near: ['/p/crew'] }];
  assert.equal(agentsHref(renamed), '/p/crew', 'the Agents place was passed over for the pack\'s page');
  assert.equal(agentsHref(rail.places.filter((i) => i.label !== 'Agents')), AGENTS_PAGE);
});

/* MARIAM'S RECORD AFTER SIGN-UP (use case 6): the rules gave Money and People, the shop use case its section, in the
   order they were made. The shop's section is Shop today and Orders once the use case folds; both rank the same. */
const shopOf = (name: string): [string, Entry[]] => [name, [page('Orders', '/p/orders'), page('Products', '/p/products')]];
const mariam = (name: string): [string, Entry[]][] => [['Money', [page('Money', '/p/money')]], ['People', [page('People', '/p/people')]], shopOf(name)];

test("a shop's orders come straight after Needs you, so the phone's bar is Today, Needs you, Orders, Money and People", () => {
  for (const name of ['Orders', 'Shop']) {
    const rail = railOf(flatNav(mariam(name), 0, WORDS), 'Needs you');
    assert.deepEqual(rail.places.map((i) => i.label), ['Today', 'Needs you', name, 'Money', 'People']);
    const orders = rail.places[2];
    assert.ok(orders);
    assert.equal(orders.href, '/p/orders', 'the place opens the Orders page, where the week offer is drawn');
    assert.deepEqual(tabsOf(rail.places).map((i) => i.label), ['Today', 'Needs you', name, 'Money', 'People']);
    assert.deepEqual(rail.more.map((i) => i.label), ['Activity']);
  }
});

test('a record without a shop keeps its rail, and its bar is the five of 19 October', () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(tabsOf(rail.places).map((i) => i.label), ['Today', 'Needs you', 'Projects', 'Money', 'Agents']);
  assert.deepEqual(rail.places.map((i) => i.label), ['Today', 'Needs you', 'Work', 'Projects', 'Money', 'People', 'Agents']);
  assert.deepEqual(rail.more.map((i) => i.label), ['Services', 'Activity']);
});

/* SAM'S RECORD AFTER SIGN-UP (use case 1, USE-B02): Services is a section whose list holds nothing yet. Which sections a
   record has is the shell's to say (`layoutOf` leaves out a page over a list with nothing in it), and the rail draws
   the sections it is handed and no others: it is told no counts, so it can neither keep an empty place nor drop one. */
const sam = (services: boolean): [string, Entry[]][] => [
  ['People', [page('People', '/p/people')]],
  ['Money', [page('Money', '/p/money')]],
  ...(services ? [['Services', [page('Renewals', '/p/estate')]] as [string, Entry[]]] : []),
  ['Dashboard', [page('Dashboard', '/p/dashboard')]],
];

test('a section the shell left out is no place in the rail or under More, and it is a place again once it is handed in', () => {
  const before = railOf(flatNav(sam(false), 0, WORDS), 'Needs you');
  const drawn = [...before.places, ...before.more];
  assert.deepEqual(drawn.map((i) => i.label), ['Today', 'Needs you', 'Money', 'People', 'Dashboard', 'Activity']);
  assert.ok(!drawn.some((i) => i.href === '/p/estate'), 'the rail drew a place nobody handed it');
  assert.deepEqual(Object.keys(before.views), []);
  const after = railOf(flatNav(sam(true), 0, WORDS), 'Needs you');
  assert.deepEqual([...after.places, ...after.more].map((i) => i.label), ['Today', 'Needs you', 'Money', 'People', 'Services', 'Dashboard', 'Activity']);
  assert.equal(after.places.find((i) => i.label === 'Services')?.href, '/p/estate');
});

test('the bar fills a missing place with the next one in the rail, so it is never short', () => {
  const rail = railOf(flatNav([['Work', [page('Work', '/p/work')]], ['Money', [page('Money', '/p/money')]], ['People', [page('People', '/p/people')]]], 0, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(tabsOf(rail.places).map((i) => i.label), ['Today', 'Needs you', 'Money', 'Work', 'People']);
});

test("his own pick still wins on the phone's bar, after Today", () => {
  const rail = railOf(flatNav(SECTIONS, 3, WORDS, { work: WORK }), 'Needs you');
  assert.deepEqual(tabsOf(rail.places, 5, ['/p/money', '/p/portfolio']).map((i) => i.label), ['Today', 'Money', 'Projects']);
});
