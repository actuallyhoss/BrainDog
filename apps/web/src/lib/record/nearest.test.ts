/**
 * THE PLACES A NOT-FOUND SCREEN OFFERS (`nearest.ts`): five at most, the likeliest first, never the whole index.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NEAREST_MOST, nearest, shellPlaces, type Place } from './nearest.ts';

const PAGES: Place[] = [
  { title: 'Money', href: '/p/money', address: 'money' },
  { title: 'Filing rules', href: '/p/money-rules', address: 'money-rules' },
  { title: 'Renewals', href: '/p/estate', address: 'estate' },
  { title: 'Projects', href: '/p/portfolio', address: 'portfolio' },
  { title: 'Kiln', href: '/p/kiln', address: 'kiln' },
  { title: 'People', href: '/p/people', address: 'people' },
  { title: 'Health', href: '/p/health', address: 'health' },
  { title: 'Calendar', href: '/p/calendar', address: 'calendar' },
];

test('a mistyped name offers the page it was meant for first', () => {
  assert.equal(nearest('mony', PAGES)[0]?.title, 'Money');
  assert.equal(nearest('peeple', PAGES)[0]?.title, 'People');
  assert.equal(nearest('calender', PAGES)[0]?.title, 'Calendar');
});

test('the address a page answers at counts as well as its title', () => {
  assert.equal(nearest('portfolio', PAGES)[0]?.title, 'Projects');
  assert.equal(nearest('estate', PAGES)[0]?.title, 'Renewals');
});

test('a name holding what was typed comes before one a few letters away', () => {
  assert.equal(nearest('rules', PAGES)[0]?.title, 'Filing rules');
});

test('never more than five, each once, and nothing nameless', () => {
  const twice = [...PAGES, { title: 'Money again', href: '/p/money' }, { title: ' ', href: '/p/blank' }];
  const near = nearest('nope', twice);
  assert.equal(near.length, NEAREST_MOST);
  assert.equal(new Set(near.map((p) => p.href)).size, near.length);
  assert.ok(near.every((p) => p.title.trim() !== ''));
  assert.deepEqual(nearest('x', []), []);
});

test('a page and the list it shows are offered once, by the page (E20)', () => {
  const places = shellPlaces([{ title: 'Orders', href: '/p/orders' }, { title: 'People', href: '/p/people' }], [{ id: 'people', name: 'People' }, { id: 'orders', name: 'Orders' }]);
  const titles = nearest('orders', places).map((p) => p.title);
  assert.deepEqual(titles, ['Orders', 'People']);
  assert.equal(nearest('people', places)[0]!.href, '/p/people');
});
