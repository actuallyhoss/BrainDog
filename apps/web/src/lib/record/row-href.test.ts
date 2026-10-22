/**
 * `row-href.ts`: where a row said by its spoken id opens, on a declared page and on a row's screen alike.
 *
 * `{{ref:tasks#241}}` is a link, and a link has one address whoever draws it: the row's own page when its list has a
 * template that made one for it, else the row's screen. A list this tab does not hold answers nothing, and the
 * renderer then draws the words plain, never a dead anchor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from './held.ts';
import { holePlace, holePlaceIn, holeSentence, learnRowPages, rowHref, rowHrefIn, rowPagesOf, spokenOf } from './row-href.ts';
/* THE SAMPLE'S DECLARATIONS, which a live tab learns from the record. */
import './fixtures/fill.ts';

const PAGES = [
  { slug: 'home', about: null },
  { slug: 'oxbow-gg', about: { register: 'things', seq: 3 } },
  /* A TEMPLATE'S PAGE FOR A ROW WITH NO NUMBER YET is nobody's own page. */
  { slug: 'things-0', about: { register: 'things', seq: null } },
];

test('a spoken id is a list and a number, and nothing else is one', () => {
  assert.deepEqual(spokenOf('tasks#241'), { register: 'tasks', seq: 241 });
  assert.deepEqual(spokenOf(' tasks#241 '), { register: 'tasks', seq: 241 });
  for (const bad of ['', 'tasks', 'tasks#', '#241', 'tasks#0', 'tasks#2.5', 'Tasks#241', 'tasks#241/x', 'tasks#241?x=1', '../r#1', 'https://x#1'])
    assert.equal(spokenOf(bad), null, bad);
});

test('a row whose list has no template opens on the row screen', () => {
  assert.ok(REGISTERS.tasks, 'the sample holds a list of tasks');
  learnRowPages(PAGES);
  assert.equal(rowHref('tasks#241'), '/r/tasks/241');
});

test('a row its list made a page for opens on its own page', () => {
  assert.ok(REGISTERS.things, 'the sample holds a list of projects');
  learnRowPages(PAGES);
  assert.equal(rowHref('things#3'), '/p/oxbow-gg');
  /* THE TEMPLATE TOOK ONLY SOME ROWS (`for: { where }`): a row it left out still has its screen. */
  assert.equal(rowHref('things#4'), '/r/things/4');
});

test('a list this tab does not hold answers nothing', () => {
  learnRowPages(PAGES);
  assert.equal(rowHref('nonesuch#1'), null);
  assert.equal(rowHref('not a row'), null);
});

test('a record that sends no pages still opens every row on its screen', () => {
  learnRowPages([]);
  assert.equal(rowHref('things#3'), '/r/things/3');
  learnRowPages(undefined);
  assert.equal(rowHref('things#3'), '/r/things/3');
});

test('the address is worked out from what it is handed, so a host can ask for another record', () => {
  const pages = rowPagesOf(PAGES);
  assert.equal(pages.size, 1);
  const held = (list: string) => list === 'things';
  assert.equal(rowHrefIn('things#3', held, pages), '/p/oxbow-gg');
  assert.equal(rowHrefIn('tasks#241', held, pages), null);
  /* A SLUG IS ONE SEGMENT OF AN ADDRESS, whatever a row was named. */
  assert.equal(rowHrefIn('things#9', held, rowPagesOf([{ slug: 'a b/c', about: { register: 'things', seq: 9 } }])), '/p/a%20b%2Fc');
});

/* ── a hole ──────────────────────────────────────────────────────────────── */

const ASK = {
  held: (list: string) => list === 'tasks' || list === 'things',
  field: (list: string, field: string) => list === 'things' && field === 'budget',
  figure: (id: string) => (id === 'owed' ? '/r/invoices?state=sent' : null),
};

test('a missing value of a row said by its id is filled on that row', () => {
  assert.equal(holePlaceIn('tasks#4.due', null, ASK), '/r/tasks/4?fields=1');
  assert.equal(holePlaceIn('tasks#4.project.name', null, ASK), '/r/tasks/4?fields=1');
  assert.equal(holePlaceIn('nonesuch#4.due', null, ASK), null);
});

test('on a page drawn for one row, a field of that row is filled on the row', () => {
  assert.equal(holePlaceIn('budget', { register: 'things', seq: 3 }, ASK), '/r/things/3?fields=1');
  assert.equal(holePlaceIn('budget.currency', { register: 'things', seq: 3 }, ASK), '/r/things/3?fields=1');
  /* NOT A FIELD OF IT, and no page is drawn for a row: nothing to open. */
  assert.equal(holePlaceIn('colour', { register: 'things', seq: 3 }, ASK), null);
  assert.equal(holePlaceIn('budget', null, ASK), null);
});

test('a figure opens the rows it is worked out over, by its id or as a module says it', () => {
  assert.equal(holePlaceIn('owed', null, ASK), '/r/invoices?state=sent');
  assert.equal(holePlaceIn('owed.change', null, ASK), '/r/invoices?state=sent');
  assert.equal(holePlaceIn('money.owed', null, ASK), '/r/invoices?state=sent');
});

test('a list and a state opens the list, and a path that names nothing opens nowhere', () => {
  assert.equal(holePlaceIn('tasks.late', null, ASK), '/r/tasks');
  assert.equal(holePlaceIn('weather.tomorrow', null, ASK), null);
  assert.equal(holePlaceIn('', null, ASK), null);
});

test('on this record a hole asks the lists and figures the tab holds', () => {
  assert.equal(holePlace('tasks#4.due'), '/r/tasks/4?fields=1');
  assert.equal(holePlace('tasks.late'), '/r/tasks');
  assert.equal(holePlace('nonesuch.figure'), null);
});

test('the sentence a hole sat in is one line, without the dash, and no longer than a title', () => {
  assert.equal(holeSentence('  The rent is\n  rent —  a month '), 'The rent is rent a month');
  assert.equal(holeSentence(null), '');
  const long = holeSentence('word '.repeat(80));
  assert.ok(long.length <= 161 && long.endsWith('…') && !long.includes('  '), long);
});
