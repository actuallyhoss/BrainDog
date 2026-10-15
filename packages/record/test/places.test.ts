/**
 * `placesOf` (`src/places.ts`): the rail's places answered as data. The order the web's rail draws today
 * (`apps/web/src/lib/nav/rail.test.ts`) is held here as values, on a fixture of a founder's add-ons, with nothing in the
 * code that spells a section: the order is what each add-on's `nav` says, and install order where it says nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRAME_PLACES, PLACES_MOST, placesOf, type AddonNav, type PlacePage } from '../src/places.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

type Nav = { section: string; order: number; place?: number };
const page = (slug: string, title: string, icon: string, nav: Nav | null, more: Partial<PlacePage> = {}): PlacePage => ({ slug, title, icon, nav, ...more });

/**
 * A founder's add-ons, as each declares its pages: where its section sits on the rail (`place`) and each page's order in
 * it. A project's own page is about one thing, so it is no place. Listed in the reader's order the rail test uses.
 */
const declared = (ranked: boolean): PlacePage[] => {
  const at = (n: number): { place?: number } => (ranked ? { place: n } : {});
  return [
    page('money', 'Money', 'money', { section: 'Money', order: 10, ...at(40) }),
    page('work', 'Work', 'work', { section: 'Work', order: 10, ...at(10) }),
    page('work-board', 'Board', 'board', { section: 'Work', order: 20 }),
    page('portfolio', 'Overview', 'projects', { section: 'Projects', order: 5, ...at(30) }),
    page('lanternfish', PROJECTS[0], 'doc', { section: 'Projects', order: 10 }, { about: { register: 'things', seq: 1 } }),
    page('copperleaf', PROJECTS[1], 'doc', { section: 'Projects', order: 10 }, { about: { register: 'things', seq: 2 } }),
    page('agents', 'Agents', 'session', { section: 'Agents', order: 10, ...at(60) }),
    page('people', 'People', 'people', { section: 'People', order: 10, ...at(50) }),
    page('estate', 'Services', 'estate', { section: 'Services', order: 10 }),
  ];
};

/** The add-ons in the order the founder's use case installs them, then the agents add-on. */
const FOUNDER_NAVS: AddonNav[] = [
  { addon: 'portfolio', pages: ['portfolio'] },
  { addon: 'people', pages: ['people'] },
  { addon: 'money-core', pages: ['money'] },
  { addon: 'estate', pages: ['estate'] },
  { addon: 'work', pages: ['work', 'work-board'] },
  { addon: 'agents', pages: ['agents'] },
];

const names = (list: readonly { name: string }[]): string[] => list.map((p) => p.name);

test("a founder's rail is Today, Decide, Work, Projects, Money, People and Agents, and Services is under More", () => {
  const rail = placesOf({ pages: declared(true), navs: FOUNDER_NAVS });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Work', 'Projects', 'Money', 'People', 'Agents']);
  assert.equal(rail.places.length, PLACES_MOST);
  assert.deepEqual(names(rail.more), ['Services']);
  assert.deepEqual(
    rail.places.map((p) => p.page),
    ['today', 'decide', 'work', 'portfolio', 'money', 'people', 'agents'],
    'each place opens its section first page, Work its own page and never an address of the frame',
  );
  assert.deepEqual(rail.places.slice(0, 2), [...FRAME_PLACES]);
  assert.ok(rail.places.slice(2).every((p) => p.by === 'addon'));
  assert.equal(rail.places[3]?.icon, 'projects');
});

test('no place is in the rail twice: Board is a view of Work, and a project is a thing under Projects', () => {
  const rail = placesOf({ pages: declared(true), navs: FOUNDER_NAVS });
  const every = [...rail.places, ...rail.more].map((p) => p.page);
  assert.equal(new Set(every).size, every.length);
  for (const slug of ['work-board', 'lanternfish', 'copperleaf']) assert.ok(!every.includes(slug), `${slug} was drawn as a place`);
});

test('a record whose add-ons say nothing of the rail falls back to the order they were installed in', () => {
  const rail = placesOf({ pages: declared(false), navs: FOUNDER_NAVS });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Projects', 'People', 'Money', 'Services', 'Work']);
  assert.deepEqual(names(rail.more), ['Agents']);
});

/* A SHOP AFTER SIGN-UP (use case 6): its Orders ask for the place straight after Work's, so on a record without Work they
   come straight after Decide, and the phone's bar is Today, Decide, Orders, Money and People. */
const shop = (section: string): { pages: PlacePage[]; navs: AddonNav[] } => ({
  pages: [
    page('money', 'Money', 'money', { section: 'Money', order: 10, place: 40 }),
    page('people', 'People', 'people', { section: 'People', order: 10, place: 50 }),
    page('orders', 'Orders', 'orders', { section, order: 10, place: 20 }),
    page('products', 'Products', 'products', { section, order: 20 }),
  ],
  navs: [
    { addon: 'money-core', pages: ['money'] },
    { addon: 'people', pages: ['people'] },
    { addon: 'shop', pages: ['orders', 'products'] },
  ],
});

test("a shop's orders come straight after Decide, whatever its section is called", () => {
  for (const section of ['Orders', 'Shop']) {
    const rail = placesOf(shop(section));
    assert.deepEqual(names(rail.places), ['Today', 'Decide', section, 'Money', 'People']);
    assert.equal(rail.places[2]?.page, 'orders');
    assert.deepEqual(rail.more, []);
  }
});

test("a stranger's add-on that asks for a place appears with no code change, where it asked", () => {
  const tides = page('tides', 'Tides', 'wave', { section: 'Tide tables', order: 10, place: 35 });
  const rail = placesOf({ pages: [...declared(true), tides], navs: [...FOUNDER_NAVS, { addon: 'tide-tables', pages: ['tides'] }] });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Work', 'Projects', 'Tide tables', 'Money', 'People']);
  assert.deepEqual(rail.places[4], { page: 'tides', icon: 'wave', name: 'Tide tables', by: 'addon', section: 'Tide tables' });
  assert.deepEqual(names(rail.more), ['Agents', 'Services']);
  const quiet = placesOf({ pages: [page('tides', 'Tides', 'wave', { section: 'Tide tables', order: 10 })], navs: [{ addon: 'tide-tables', pages: ['tides'] }] });
  assert.deepEqual(names(quiet.places), ['Today', 'Decide', 'Tide tables'], 'an add-on that says nothing of the rail still has its place');
});

test('a section none of the add-ons rank follows the ranked ones, in install order', () => {
  const rail = placesOf({
    pages: [page('coursework', 'Coursework', 'doc', { section: 'Coursework', order: 10 }), page('money', 'Money', 'money', { section: 'Money', order: 10, place: 40 })],
    navs: [{ addon: 'study-desk', pages: ['coursework'] }, { addon: 'money-core', pages: ['money'] }],
  });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Money', 'Coursework']);
});

test('a pinned place leads, by the person, and its section is not placed again', () => {
  const rail = placesOf({ pages: declared(true), navs: FOUNDER_NAVS, pinned: ['people', 'not-a-page', 'people'] });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'People', 'Work', 'Projects', 'Money', 'Agents']);
  assert.equal(rail.places[2]?.by, 'person');
  assert.deepEqual(names(rail.more), ['Services']);
  const view = placesOf({ pages: declared(true), navs: FOUNDER_NAVS, pinned: ['work-board'] });
  assert.deepEqual(names(view.places).slice(0, 4), ['Today', 'Decide', 'Board', 'Work'], 'a pinned view is a place, and Work keeps its own');
});

test('past `most` a place goes under More, in the same order', () => {
  const rail = placesOf({ pages: declared(true), navs: FOUNDER_NAVS, most: 4 });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Work', 'Projects']);
  assert.deepEqual(names(rail.more), ['Money', 'People', 'Agents', 'Services']);
  assert.deepEqual(names(placesOf({ pages: declared(true), navs: FOUNDER_NAVS, most: 0 }).places), ['Today', 'Decide'], 'the frame is always drawn');
});

test('a record with no add-ons answers Today and Decide only', () => {
  const rail = placesOf({ pages: [], navs: [] });
  assert.deepEqual(rail.places, [...FRAME_PLACES]);
  assert.deepEqual(rail.more, []);
});

test("a page a person wrote has a place after the add-ons', and a page waiting on a starter set has none yet", () => {
  const mine = page('reading', 'Reading', 'book', { section: 'Reading', order: 10 });
  const waits = page('renewals', 'Renewals', 'estate', { section: 'Renewals', order: 10 }, { lists: null });
  const rail = placesOf({ pages: [mine, ...shop('Orders').pages, waits], navs: [...shop('Orders').navs, { addon: 'renewals', pages: ['renewals'] }] });
  assert.deepEqual(names(rail.places), ['Today', 'Decide', 'Orders', 'Money', 'People', 'Reading']);
  assert.equal(rail.places[5]?.by, 'person');
});
