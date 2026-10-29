/**
 * `day-href.ts`: where a date said in a note opens. The record's Calendar page where `boot` listed one, else nowhere,
 * and the renderer then draws the date plain, never a dead anchor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, toHTML } from 'braindog-render';

import { APP_WORDS, at } from '../at.ts';
import { CALENDAR_PAGE, dayHref, isDay } from './day-href.ts';

const WITH = ['home', 'calendar', 'money'];
const WITHOUT = ['home', 'money'];

test('with the Calendar page, a date opens that day on it', () => {
  assert.equal(dayHref(WITH, '2026-11-03'), '/p/calendar?day=2026-11-03');
  /* `boot`'s own pages, before the shell keeps their slugs, read the same. */
  assert.equal(dayHref([{ slug: 'home' }, { slug: 'calendar' }], '2026-11-03'), '/p/calendar?day=2026-11-03');
  assert.equal(dayHref(WITH, ' 2026-11-03 '), '/p/calendar?day=2026-11-03');
});

test('without the page, a date goes nowhere', () => {
  assert.equal(dayHref(WITHOUT, '2026-11-03'), null);
  assert.equal(dayHref([], '2026-11-03'), null);
  assert.equal(dayHref(null, '2026-11-03'), null);
  assert.equal(dayHref(undefined, '2026-11-03'), null);
  /* A page that only sounds like it is not it. */
  assert.equal(dayHref(['calendar-2', 'my-calendar', 'Calendar'], '2026-11-03'), null);
});

test('only a day is a day: nothing else reaches an address', () => {
  for (const ok of ['2026-01-01', '2028-02-29', '2026-12-31']) assert.equal(isDay(ok), true, ok);
  for (const bad of ['', '2026-11', '2026-11-3', '2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-11-03T10:00', '2026-11-03&x=1', '../r/tasks', 'https://x/2026-11-03', 'tomorrow'])
    assert.equal(dayHref(WITH, bad), null, bad);
});

test('the address is a declared page of the record, which the app serves', () => {
  /* `/p/<slug>` is the route a declared page is drawn on; a first segment of its own (`/calendar`) is no route. */
  assert.equal(APP_WORDS.has('p'), true);
  assert.equal(APP_WORDS.has(CALENDAR_PAGE), false);
  const href = dayHref(WITH, '2026-11-03')!;
  assert.equal(at(href, '/acme/p/home'), '/acme/p/calendar?day=2026-11-03');
});

test('on a page, the renderer draws a link with the page and plain text without it', () => {
  const said = parse('Due {{date:2026-11-03}}.');
  const linked = toHTML(said, { dayHref: (iso) => dayHref(WITH, iso) });
  assert.match(linked, /<a href="\/p\/calendar\?day=2026-11-03">/);
  const plain = toHTML(said, { dayHref: (iso) => dayHref(WITHOUT, iso) });
  assert.doesNotMatch(plain, /<a /);
  assert.doesNotMatch(plain, /calendar/);
  /* The same words either way: the link adds an address and takes nothing from what is read. */
  const text = (html: string) => html.replace(/<[^>]+>/gu, '');
  assert.equal(text(linked), text(plain));
});
