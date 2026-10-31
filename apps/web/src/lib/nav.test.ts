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

import { railOf } from './nav/rail.ts';
import { WORK, arrange, flatNav, isHere, listCounts, orderLists, placeOf, tabsOf, withOrder } from './nav.ts';

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
const WORDS = { today: 'Today', activity: 'Activity', decide: 'Needs you' };

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
  assert.deepEqual(flat.main.map((i) => i.label), ['Today', 'Work', 'Projects', 'Money', 'Activity', 'Needs you', 'People']);
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
  /* The old front doors draw Today, so Today is the place marked on them. */
  for (const old of ['overview', 'classic']) assert.ok(isHere(flat.main[0]!, placeOf('/', new URLSearchParams(old))), `/?${old} is Today`);
  /* The declared Work page is kept, under its own name, beside the Board. */
  assert.deepEqual(flat.pages.map((p) => [p.title, p.href]), [['Work page', '/p/work'], ['Board', '/p/work-board']]);
});

test('A RECORD WITH TASKS AND NO WORK SECTION STILL GETS THE ROW', () => {
  const flat = flatNav([['Coursework', [page('Coursework', '/p/coursework')]]], 0, WORDS, { work: WORK });
  assert.deepEqual(flat.main.map((i) => [i.label, i.href]), [['Today', '/'], ['Work', '/?work'], ['Coursework', '/p/coursework'], ['Activity', '/audit']]);
  assert.deepEqual(flat.pages, []);
});

test('THE PHONE`S TABS ARE THE FIVE OF 19 OCTOBER, Projects and Money first and the next place where Agents is missing', () => {
  assert.deepEqual(tabsOf(flatNav(FOUNDER, 0, WORDS).main).map((i) => i.label), ['Today', 'Projects', 'Money', 'Work', 'People']);
  assert.deepEqual(tabsOf(flatNav(FOUNDER, 2, WORDS).main).map((i) => i.label), ['Today', 'Needs you', 'Projects', 'Money', 'Work']);
});

test("A STARTER'S OWN PLACE IS ON THE PHONE'S BAR AS ON THE RAIL, by the place its page declares (FB4)", () => {
  const placed = (title: string, href: string, place: number) => ({ ...page(title, href), place });
  const personal = [
    ['Projects', [placed('Projects', '/p/projects', 30)]],
    ['Money', [placed('Money', '/p/money', 40)]],
    ['People', [placed('People', '/p/people', 50)]],
    ['Goals', [placed('Goals', '/p/goals', 20)]],
  ] as const;
  assert.deepEqual(tabsOf(flatNav(personal, 1, WORDS).main, 4).map((i) => i.label), ['Today', 'Needs you', 'Goals', 'Money']);
});

test("THE FIRST PROJECT MOVES NOTHING ON A STARTER'S BAR (AL3): Projects takes the slot after the founder's own places", () => {
  const placed = (title: string, href: string, place: number) => ({ ...page(title, href), place });
  const before = [
    ['Money', [placed('Money', '/p/money', 40)]],
    ['Dashboard', [placed('Dashboard', '/p/dashboard', 70)]],
  ] as const;
  const after = [['Projects', [placed('Projects', '/p/projects', 30)]], ...before] as const;
  const bar = (sections: typeof before | typeof after) => tabsOf(railOf(flatNav(sections, 1, WORDS), 'Needs you').places, 4).map((i) => i.label);
  assert.deepEqual(bar(before), ['Today', 'Needs you', 'Money', 'Dashboard']);
  assert.deepEqual(bar(after), ['Today', 'Needs you', 'Money', 'Dashboard']);
});

test("A FOUNDER RECORD WITH TWENTY PROJECTS KEEPS PROJECTS ON ITS BAR (RL6), and a fresh starter's first project still waits", () => {
  const placed = (title: string, href: string, place: number) => ({ ...page(title, href), place });
  const projects = (n: number) => [placed('Projects', '/p/projects', 30), ...Array.from({ length: n }, (_, i) => page(`Project ${String(i + 1)}`, `/p/project-${String(i + 1)}`, true))];
  const founder = (n: number) =>
    [
      ['Projects', projects(n)],
      ['Money', [placed('Money', '/p/money', 40)]],
      ['Agents', [placed('Agents', '/p/agents', 60)]],
      ['Dashboard', [placed('Dashboard', '/p/dashboard', 70)]],
    ] as const;
  const rail = (n: number) => railOf(flatNav(founder(n), 1, WORDS), 'Needs you');
  assert.deepEqual(tabsOf(rail(20).places, 5).map((i) => i.label), ['Today', 'Needs you', 'Projects', 'Money', 'Agents']);
  assert.equal(rail(20).places.findIndex((i) => i.label === 'Projects'), 2);
  /* A fresh Founder record's first project moves nothing it already had (AL3). */
  assert.deepEqual(tabsOf(rail(1).places, 5).map((i) => i.label), ['Today', 'Needs you', 'Money', 'Agents', 'Dashboard']);
});

test("A TEAM'S TICKETS ARE ON ITS PHONE BAR (AM6): Work in a starter's own word is its place, and an empty Agents goes to Menu", () => {
  const placed = (title: string, href: string, place: number) => ({ ...page(title, href), place });
  const team = [
    ['Tickets', [page('Work', '/p/work')]],
    ['Sprints', [placed('Sprints', '/p/cycles', 20)]],
    ['People', [placed('People', '/p/people', 50)]],
    ['Agents', [page('Agent work', '/p/agent-work')]],
  ] as const;
  const bar = tabsOf(railOf(flatNav(team, 1, WORDS, { work: WORK }), 'Needs you').places, 4).map((i) => i.label);
  assert.deepEqual(bar, ['Today', 'Needs you', 'Tickets', 'Sprints']);
});

test("PROJECTS IS COUNTED BY ITS PROJECTS, NOT ITS PAGES, AND OUTGROWS THE STARTER'S OWN PLACE BEFORE IT TAKES A SLOT (RM10)", () => {
  const placed = (title: string, href: string, place: number) => ({ ...page(title, href), place });
  const list = (id: string, name: string, count: number) => ({ id, name, count });
  const founder = [
    ['Projects', [placed('Projects', '/p/projects', 30)]],
    ['Money', [placed('Money', '/p/money', 40)]],
    ['Agents', [placed('Agents', '/p/agents', 60)]],
    ['Dashboard', [placed('Dashboard', '/p/dashboard', 70)]],
  ] as const;
  const bar = (sections: readonly (readonly [string, readonly Page[]])[], counts: Record<string, number>) =>
    tabsOf(railOf(flatNav(sections, 1, WORDS, { counts }), 'Needs you').places, 5).map((i) => i.label);
  /* His Solo founder record: twenty projects, none with a page of its own. */
  assert.deepEqual(bar(founder, listCounts([list('projects', 'Projects', 20)])), ['Today', 'Needs you', 'Projects', 'Money', 'Agents']);
  /* A fresh Founder record's first projects move nothing it already had (AL3). */
  assert.deepEqual(bar(founder, listCounts([list('projects', 'Projects', 3)])), ['Today', 'Needs you', 'Money', 'Agents', 'Dashboard']);
  /* A Personal record with twelve goals and six projects keeps Goals and Money where they were. */
  const personal = [
    ['Projects', [placed('Projects', '/p/projects', 30)]],
    ['Money', [placed('Money', '/p/money', 40)]],
    ['Goals', [placed('Goals', '/p/goals', 20)]],
  ] as const;
  assert.deepEqual(bar(personal, listCounts([list('projects', 'Projects', 6), list('goals', 'Goals', 12)])).slice(0, 4), ['Today', 'Needs you', 'Goals', 'Money']);
  assert.deepEqual(bar(personal, listCounts([list('projects', 'Projects', 13), list('goals', 'Goals', 12)])).slice(0, 4), ['Today', 'Needs you', 'Goals', 'Projects']);
});

test('HIS PHONE BAR WINS: Today, then the pages he put on it in his order, and a gone page is skipped', () => {
  const main = flatNav(FOUNDER, 2, WORDS).main;
  const money = main.find((i) => i.label === 'Money')!;
  const projects = main.find((i) => i.label === 'Projects')!;
  assert.deepEqual(tabsOf(main, 5, [money.href, '/p/gone', projects.href]).map((i) => i.label), ['Today', 'Money', 'Projects']);
  assert.deepEqual(tabsOf(main, 5, ['/p/gone']).map((i) => i.label), ['Today', 'Needs you', 'Projects', 'Money', 'Work']);
});
