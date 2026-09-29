/**
 * The rail's order, which had no test at all.
 *
 * `arrange()` is the one function that decides where a page sits in somebody's navigation, and its
 * whole subject is a disagreement: the reader has moved things, the record declares an order, and
 * neither is allowed to erase the other. It had a comment describing what it does and nothing
 * asserting it, and the comment was wrong about the case that matters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WORK, arrange, flatNav, isHere, orderLists, placeOf, tabsOf, withOrder } from './nav.ts';

type Entry = { section: string; href: string; order: number };

const at = (section: string, href: string, order: number): Entry => ({ section, href, order });

/** One section, so the assertions are about order rather than about grouping. */
const of = (entries: readonly Entry[], arrangement: readonly string[]): string[] =>
  arrange(entries, arrangement).flatMap(([, list]) => list.map((e) => e.href));

test("the reader's order wins over the record's, which is the whole point of saving one", () => {
  const held = [at('Money', '/a', 1), at('Money', '/b', 2), at('Money', '/c', 3)];
  assert.deepEqual(of(held, ['/c', '/a', '/b']), ['/c', '/a', '/b']);
});

test('and with nothing saved, the record decides', () => {
  const held = [at('Money', '/c', 3), at('Money', '/a', 1), at('Money', '/b', 2)];
  assert.deepEqual(of(held, []), ['/a', '/b', '/c']);
});

test('AN ENTRY NOBODY HAS ARRANGED SITS WHERE THE RECORD PUT IT, and it used to fall to the end', () => {
  /* THE COMMENT SAID THIS AND THE CODE DID THE OPPOSITE. Every unnamed entry ranked
     `Number.MAX_SAFE_INTEGER`, so the declaration's order only broke ties among the leftovers and a
     page a pack adds tomorrow appeared at the bottom of its section for everybody who had ever
     reordered their rail. `/new` is declared second, between `/a` and `/b`, and the reader has moved
     `/new` is declared after `/b` and before `/a`, and the reader has moved `/b` in front of `/a`:
     it belongs beside `/b`, which is where its declaration put it, and not at the bottom. */
  const held = [at('Money', '/b', 1), at('Money', '/new', 2), at('Money', '/a', 3)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/b', '/new', '/a']);
});

test('and one declared before anything the reader named comes first', () => {
  const held = [at('Money', '/new', 1), at('Money', '/a', 2), at('Money', '/b', 3)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/new', '/b', '/a']);
});

test('two unarranged neighbours keep their own order rather than swapping', () => {
  const held = [at('Money', '/b', 1), at('Money', '/x', 2), at('Money', '/y', 3), at('Money', '/a', 4)];
  assert.deepEqual(of(held, ['/b', '/a']), ['/b', '/x', '/y', '/a']);
});

test('A MOVE NEVER CROSSES A SECTION, because a section is a heading a page declares', () => {
  /* Moving an item out of its section would put a page under a title that is not its own. The
     arrangement names `/m2` first overall, and it must still sit under Money. */
  const held = [at('Money', '/m1', 1), at('Work', '/w1', 1), at('Money', '/m2', 2)];
  const out = arrange(held, ['/m2', '/w1', '/m1']);
  assert.deepEqual(
    out.map(([section, list]) => [section, list.map((e) => e.href)]),
    [
      ['Money', ['/m2', '/m1']],
      ['Work', ['/w1']],
    ],
  );
});

test('and a section holds every entry it started with, whatever the arrangement says', () => {
  /* A sort that drops or duplicates a row is the one failure a reader reports as "my rail is
     broken" and nothing else here would catch: the assertions above all read the order. */
  const held = [at('Money', '/a', 1), at('Money', '/b', 2), at('Work', '/w', 1)];
  const out = of(held, ['/zz', '/b']);
  assert.equal(out.length, held.length);
  assert.deepEqual([...out].sort(), ['/a', '/b', '/w']);
});

test('THE LISTS FOLLOW THE ARRANGEMENT TOO, and a list it does not name keeps its place', () => {
  const lists = [{ id: 'assignments' }, { id: 'books' }, { id: 'courses' }];
  assert.deepEqual(orderLists(lists, ['/r/courses', '/p/studies', '/r/assignments']).map((l) => l.id), ['courses', 'books', 'assignments']);
  assert.deepEqual(orderLists(lists, []).map((l) => l.id), ['assignments', 'books', 'courses']);
});

test("A SHARED ORDER GOES FIRST, AND WHAT THE READER HAD ARRANGED STAYS BEHIND IT", () => {
  assert.deepEqual(withOrder(['/r/courses', '/r/assignments'], ['/p/money', '/r/assignments', '/r/people']), ['/r/courses', '/r/assignments', '/p/money', '/r/people']);
});

/* ── the flat list ─────────────────────────────────────────────────────── */

type Page = { title: string; href: string; icon: string; row?: boolean };
const page = (title: string, href: string, row = false): Page => ({ title, href, icon: 'doc', ...(row ? { row: true } : {}) });
const WORDS = { today: 'Today', activity: 'Activity', decide: 'Decide' };

/** The founder's sections as the record declares them, a project's own page and a book's own page among them. */
const FOUNDER: [string, Page[]][] = [
  ['Dashboard', [page('Dashboard', '/p/dashboard'), page('Northwind Labs Ltd', '/p/org-1', true)]],
  ['Money', [page('Money', '/p/money'), page('Personal', '/p/book-1', true)]],
  ['People', [page('People', '/p/people')]],
  ['Projects', [page('Overview', '/p/projects'), page('Northwind app', '/p/project-1', true)]],
  ['Work', [page('Work', '/p/work'), page('Board', '/p/work-board')]],
  ['Services', [page('Services', '/p/services')]],
];

test('THE FOUNDER`S NAV IS ONE FLAT LIST OF SEVEN AT MOST: Today, the three sections a day runs through, Activity, then the rest', () => {
  const flat = flatNav(FOUNDER, 0, WORDS);
  assert.deepEqual(
    flat.main.map((i) => i.label),
    ['Today', 'Work', 'Projects', 'Money', 'Activity', 'People', 'Services'],
  );
  /* Each section opens on its lead page, the Overview where there is one, and never on a row's own page. */
  assert.deepEqual(flat.main.find((i) => i.label === 'Projects')?.href, '/p/projects');
  /* Today stands in for the Dashboard, which is under More with nothing else pushed there. */
  assert.deepEqual(flat.more.map((i) => i.label), ['Dashboard']);
  /* A section's other pages are under More too, and a project's, a book's or an organisation's own page is not. */
  assert.deepEqual(flat.pages.map((p) => p.href), ['/p/work-board']);
  /* The rail's More names them section by section, a project's own page with its section, in the order drawn. */
  assert.deepEqual(
    flat.groups.map(([section, list]) => [section, list.map((p) => p.href)]),
    [['Work', ['/p/work-board']], ['Projects', ['/p/project-1']], ['Money', ['/p/book-1']], ['Dashboard', ['/p/org-1']]],
  );
});

test('DECIDE IS A ROW ONLY WHILE SOMETHING WAITS, with its count, and what no longer fits folds under More', () => {
  const flat = flatNav(FOUNDER, 3, WORDS);
  assert.equal(flat.main.length, 7);
  assert.deepEqual(flat.main.map((i) => i.label), ['Today', 'Work', 'Projects', 'Money', 'Activity', 'Decide', 'People']);
  assert.equal(flat.main.find((i) => i.key === 'decide')?.count, 3);
  assert.deepEqual(flat.more.map((i) => i.label), ['Services', 'Dashboard']);
});

test('A RECORD WITH SECTIONS THE LIST DOES NOT NAME KEEPS THEM, in the reader`s order, and a project`s page is still here on it', () => {
  const flat = flatNav([['Coursework', [page('Coursework', '/p/coursework')]], ['Reading', [page('Reading', '/p/reading')]]], 0, WORDS);
  assert.deepEqual(flat.main.map((i) => i.label), ['Today', 'Coursework', 'Reading', 'Activity']);
  const projects = flatNav(FOUNDER, 0, WORDS).main.find((i) => i.label === 'Projects')!;
  assert.ok(isHere(projects, '/p/project-1'));
  assert.ok(!isHere(projects, '/p/money'));
  const today = flatNav(FOUNDER, 0, WORDS).main[0]!;
  assert.ok(isHere(today, '/') && !isHere(today, '/audit'));
});

test('ON A RECORD THAT HOLDS TASKS, WORK OPENS THE WORK SCREEN, and its old pages are under More', () => {
  const flat = flatNav(FOUNDER, 0, WORDS, { work: WORK });
  assert.deepEqual(flat.main.map((i) => i.label), ['Today', 'Work', 'Projects', 'Money', 'Activity', 'People', 'Services']);
  const work = flat.main.find((i) => i.label === 'Work')!;
  assert.equal(work.href, '/?work');
  assert.ok(isHere(work, placeOf('/', new URLSearchParams('work'))));
  assert.ok(!isHere(flat.main[0]!, placeOf('/', new URLSearchParams('work'))), 'Today is not marked on the Work screen');
  /* The declared Work page is kept, under its own name, beside the Board. */
  assert.deepEqual(flat.pages.map((p) => [p.title, p.href]), [['Work page', '/p/work'], ['Board', '/p/work-board']]);
});

test('A RECORD WITH TASKS AND NO WORK SECTION STILL GETS THE ROW', () => {
  const flat = flatNav([['Coursework', [page('Coursework', '/p/coursework')]]], 0, WORDS, { work: WORK });
  assert.deepEqual(flat.main.map((i) => [i.label, i.href]), [['Today', '/'], ['Work', '/?work'], ['Coursework', '/p/coursework'], ['Activity', '/audit']]);
  assert.deepEqual(flat.pages, []);
});

test('THE PHONE`S TABS ARE THE FIRST FIVE, with Decide beside Today while something waits on it', () => {
  assert.deepEqual(tabsOf(flatNav(FOUNDER, 0, WORDS).main).map((i) => i.label), ['Today', 'Work', 'Projects', 'Money', 'Activity']);
  assert.deepEqual(tabsOf(flatNav(FOUNDER, 2, WORDS).main).map((i) => i.label), ['Today', 'Decide', 'Work', 'Projects', 'Money']);
});
