/**
 * A nav section that says `tabs: true` is drawn as a strip of tabs across the top of each of its pages.
 *
 * THE STRIP IS READ FROM THE SHELL'S OWN `nav`, which is what the rail is drawn from, so the tabs and the rail cannot
 * disagree about which pages a section holds or the order they sit in. Every case here goes through `layoutOf`, the
 * function that turns the record's `boot` into that `nav`, because a strip read off a hand-made list would pass while
 * the shell threw the key away. That is not a guess: the shell built each entry field by field and had no `tabs`.
 *
 * AND THE RECORD SENDS IT. Measured on a fresh record with `nav: { section: 'Launch', order: 10, tabs: true }` installed,
 * `boot` sent `{"section":"Launch","order":10}` for every page until the kernel's `navOf` kept `tabs`. The last test
 * below reads it from the kernel's own page list, so the key dropped there again turns it red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { Boot } from '@braindog/client';
import { openRecord } from '@braindog/kernel';

import { layoutOf } from '../record/boot-live.ts';
import { TABS_SHOWN, tabsOf } from './tabs.ts';

type BootPage = NonNullable<Boot['pages']>[number];

/* A page as `boot` sends one, with `nav` carrying whatever the declaration said. */
const page = (slug: string, title: string, nav: Record<string, unknown> | null, about: { register: string; seq: number } | null = null): BootPage =>
  ({ slug, title, nav, icon: null, list: null, about }) as unknown as BootPage;

const shell = (pages: BootPage[]) => layoutOf({ registers: [], now: '2026-09-25T12:00:00.000Z', pages } as unknown as Boot);

/* THE MEASURED PACK'S SHAPE: a desk, one page per area out of a template, and a page of figures, in one tabbed
   section; and a page elsewhere that declares nothing about tabs. */
const LAUNCH = [
  page('desk', 'Desk', { section: 'Launch', order: 10, tabs: true }),
  page('product', 'Product', { section: 'Launch', order: 20, tabs: true }, { register: 'areas', seq: 1 }),
  page('box', 'Box', { section: 'Launch', order: 20, tabs: true }, { register: 'areas', seq: 2 }),
  page('numbers', 'Numbers', { section: 'Launch', order: 30, tabs: true }),
  page('money', 'Money', { section: 'Money', order: 10 }),
];

const hrefs = (strip: ReturnType<typeof tabsOf>) => strip?.shown.map((t) => t.href) ?? null;

test('A PAGE IN A TABBED SECTION IS DRAWN UNDER A STRIP OF ITS SECTION, IN NAV ORDER, WITH ITSELF CURRENT', () => {
  const strip = tabsOf(shell(LAUNCH).nav, '/p/product');
  assert.deepEqual(hrefs(strip), ['/p/desk', '/p/product', '/p/box', '/p/numbers']);
  assert.deepEqual(
    strip?.shown.filter((t) => t.current).map((t) => t.title),
    ['Product'],
  );
  assert.deepEqual(strip?.more, []);
});

test('A PAGE IN A SECTION NOBODY TABBED DRAWS NO STRIP, and neither does an address that is not in the nav', () => {
  const nav = shell(LAUNCH).nav;
  assert.equal(tabsOf(nav, '/p/money'), null);
  assert.equal(tabsOf(nav, '/p/nowhere'), null);
});

test('ONE PAGE SAYING `tabs: true` TABS ITS WHOLE SECTION, since a template and a page beside it are declared apart', () => {
  const strip = tabsOf(
    shell([
      page('desk', 'Desk', { section: 'Launch', order: 10, tabs: true }),
      page('product', 'Product', { section: 'Launch', order: 20 }, { register: 'areas', seq: 1 }),
    ]).nav,
    '/p/product',
  );
  assert.deepEqual(hrefs(strip), ['/p/desk', '/p/product']);
});

test('A SECTION OF ONE PAGE IS NO STRIP: a single tab names the page the head already names', () => {
  assert.equal(tabsOf(shell([page('desk', 'Desk', { section: 'Launch', order: 10, tabs: true })]).nav, '/p/desk'), null);
});

test('ONLY `true` TABS A SECTION: a string or a number there is not a yes', () => {
  const nav = shell([page('desk', 'Desk', { section: 'Launch', order: 10, tabs: 'yes' }), page('box', 'Box', { section: 'Launch', order: 20 })]).nav;
  assert.equal(tabsOf(nav, '/p/desk'), null);
});

test('THE READER`S OWN ARRANGEMENT ORDERS THE STRIP AS IT ORDERS THE RAIL', () => {
  const strip = tabsOf(shell(LAUNCH).nav, '/p/desk', { order: ['/p/numbers', '/p/desk'] });
  assert.deepEqual(hrefs(strip), ['/p/numbers', '/p/desk', '/p/product', '/p/box']);
});

test('A PAGE THE READER HID FROM THE RAIL IS NO TAB, unless it is the page they are reading', () => {
  const nav = shell(LAUNCH).nav;
  assert.deepEqual(hrefs(tabsOf(nav, '/p/desk', { hidden: ['/p/box'] })), ['/p/desk', '/p/product', '/p/numbers']);
  assert.deepEqual(hrefs(tabsOf(nav, '/p/box', { hidden: ['/p/box'] })), ['/p/desk', '/p/product', '/p/box', '/p/numbers']);
});

test(`PAST ${TABS_SHOWN} THE REST ARE BEHIND MORE, and the page you are on is said current wherever it sits`, () => {
  const many = Array.from({ length: 14 }, (_, i) => page(`p${i + 1}`, `Page ${i + 1}`, { section: 'Launch', order: i, tabs: true }));
  const strip = tabsOf(shell(many).nav, '/p/p14');
  assert.equal(strip?.shown.length, TABS_SHOWN);
  assert.deepEqual(
    strip?.more.map((t) => [t.href, t.current]),
    [
      ['/p/p13', false],
      ['/p/p14', true],
    ],
  );
  assert.ok(!strip?.shown.some((t) => t.current));
});

/*
 * A TABBED SECTION'S PAGES ARE NEVER CUT BY THE RAIL'S BUDGET. `layoutOf` spends the rail's five on a template's
 * pages under one heading, and the rest arrive with `cut`: the strip draws every one of them, and the rail leaves them
 * out, so a desk with seven parts and a page of figures has nine tabs.
 */
test('SEVEN PAGES OUT OF ONE TEMPLATE IN A TABBED SECTION ARE SEVEN TABS, and the two past the rail`s budget are cut from the rail', () => {
  const areas = Array.from({ length: 7 }, (_, i) => page(`a${i + 1}`, `Area ${i + 1}`, { section: 'Launch', order: 20, tabs: true }, { register: 'areas', seq: i + 1 }));
  const nav = shell([page('desk', 'Desk', { section: 'Launch', order: 10, tabs: true }), ...areas, page('numbers', 'Numbers', { section: 'Launch', order: 30, tabs: true })]).nav;
  assert.equal(tabsOf(nav, '/p/desk')?.shown.length, 9);
  assert.equal(nav.filter((e) => e.cut).length, 2);
});

test('A SECTION NOBODY TABBED IS STILL CUT BY THE BUDGET, as the rail always was', () => {
  const areas = Array.from({ length: 7 }, (_, i) => page(`a${i + 1}`, `Area ${i + 1}`, { section: 'Areas', order: 20 }, { register: 'areas', seq: i + 1 }));
  const nav = shell(areas).nav;
  assert.equal(nav.length, 5);
  assert.ok(!nav.some((e) => e.cut));
});

test('A PAGE OVER A LIST WITH NO ROW YET STAYS OFF THE RAIL UNTIL THE FIRST ONE', () => {
  const over = (count: number) =>
    layoutOf({
      registers: [{ id: 'clients', name: 'Clients', count }],
      now: '2026-09-25T12:00:00.000Z',
      pages: [{ ...page('clients', 'Clients', { section: 'Work', order: 10 }), list: 'clients' }],
    } as unknown as Boot).nav.filter((e) => !e.cut).map((e) => e.href);
  /* Off the rail means `cut`: a page that waits is still carried for the sidebar's More and the palette (9cc614088). */
  assert.deepEqual(over(0), []);
  assert.deepEqual(over(1), ['/p/clients']);
});

/* The kernel's own page list, shaped into what `boot` sends, from a record holding the declaration. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

test(
  'THE RECORD`S OWN PAGE LIST CARRIES `tabs` FROM THE DECLARATION TO THE STRIP',
  async () => {
    const k = await openRecord(openSqlite(), { now: () => Date.parse('2026-09-25T12:00:00Z') });
    const put = await k.install([
      { id: 'register.areas', kind: 'register', body: { id: 'areas', name: 'Areas', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
      { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', nav: { section: 'Launch', order: 10, tabs: true }, requires: ['register.areas'], blocks: [{ kind: 'table', source: 'register.areas' }] } },
      { id: 'page.notes', kind: 'page', body: { page: 'notes', title: 'Notes', nav: { section: 'Launch', order: 20, tabs: true }, blocks: [{ kind: 'note', body: 'A thought.' }] } },
    ] as never);
    assert.ok(put.ok, JSON.stringify(put));
    const pages = k.pages().map((p) => page(p.slug, p.title, p.nav as Record<string, unknown> | null, p.about as never));
    assert.deepEqual(hrefs(tabsOf(shell(pages).nav, '/p/desk')), ['/p/desk', '/p/notes']);
  },
);
