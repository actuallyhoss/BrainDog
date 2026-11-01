import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  IN_MORE,
  IN_PROJECTS,
  SIDE_MAX,
  SIDE_MIN,
  SIDE_START,
  byWeek,
  countsEntry,
  countsKept,
  crumbOf,
  factOf,
  factsKept,
  holdsProjects,
  leadFirst,
  moneyLead,
  homesOf,
  lanesOf,
  litOf,
  phoneLine,
  pinsKept,
  shownName,
  sideKept,
  sideModel,
  sideOrder,
  splitOf,
  widthOf,
  type ListFacts,
  type NavPlace,
  type SideList,
} from './side.ts';

/* An invented record: a studio with Work, Money, Crew (its agents), Guests and a Services section past the places. */
const place = (key: string, label: string, href: string, near: readonly string[] = [href]): NavPlace => ({ key, href, label, icon: 'rows', near });
const TODAY: NavPlace = { key: 'today', href: '/', label: 'Today', icon: 'today', near: ['/'], exact: true };
const DECIDE = place('decide', 'Needs you', '/decide');
const WORKS = place('work', 'Work', '/?work', ['/?work', '/p/board']);
const MONEY = place('section:Money', 'Money', '/p/money');
const GUESTS = place('section:Guests', 'Guests', '/p/guests');
const CREW = place('section:Crew', 'Crew', '/p/crew');
const SERVICES = place('section:Services', 'Services', '/p/services');
const AT = { agents: CREW.key, money: MONEY.key };
const facts = (o: Partial<ListFacts> = {}): ListFacts => ({ money: false, folk: false, projects: false, ofProjects: false, ...o });
const list = (id: string, o: Partial<SideList> = {}): SideList => ({ id, name: id.toUpperCase(), icon: 'rows', count: 1, views: [], kernel: false, facts: facts(), ...o });

test('each list has one home, read off what it declares: agents, people, money, projects, then its add-on, else More', () => {
  const lists = [
    list('runs', { kernel: true, facts: null }),
    list('folk', { name: 'Guests', facts: facts({ folk: true, pack: 'hosting' }) }),
    list('orgs', { name: 'Firms', facts: facts({ folk: true, pack: 'hosting' }) }),
    list('ledger', { facts: facts({ money: true, pack: 'books' }) }),
    list('rates', { facts: facts({ pack: 'books' }) }),
    list('readings', { facts: facts({ ofProjects: true }) }),
    list('skills', { facts: facts({ pack: 'crew-skills' }) }),
    list('notes', { facts: facts() }),
    list('unread', { facts: null }),
  ];
  const homes = homesOf(lists, [TODAY, DECIDE, WORKS, MONEY, GUESTS, CREW], AT);
  assert.deepEqual(Object.fromEntries(homes), {
    runs: CREW.key,
    folk: GUESTS.key,
    orgs: GUESTS.key,
    ledger: MONEY.key,
    rates: MONEY.key,
    readings: IN_PROJECTS,
    skills: CREW.key,
    notes: IN_MORE,
    unread: IN_MORE,
  });
});

test('a list whose declaration is not read yet keeps the home this device drew it in, so nothing moves under the reader', () => {
  const homes = homesOf([list('ledger', { facts: null })], [MONEY], AT, { ledger: MONEY.key });
  assert.equal(homes.get('ledger'), MONEY.key);
  assert.equal(homesOf([list('ledger', { facts: null })], [MONEY], AT, { ledger: 'section:Gone' }).get('ledger'), IN_MORE, 'a home that is gone is More');
});

test('the agents stand straight after money, and the rest keep the rail order', () => {
  const order = sideOrder([TODAY, DECIDE, WORKS, MONEY, GUESTS, CREW], AT).map((p) => p.label);
  assert.deepEqual(order, ['Today', 'Needs you', 'Work', 'Money', 'Crew', 'Guests']);
  assert.deepEqual(sideOrder([TODAY, CREW], AT).map((p) => p.label), ['Today', 'Crew'], 'no money, no move');
});

const MODEL = () => {
  const lists = [
    list('tasks', { name: 'Tasks', count: 59 }),
    list('folk', { name: 'Guests', count: 11, facts: facts({ folk: true }), views: [{ name: 'Regulars', href: '/r/folk/v/regulars' }] }),
    list('ledger', { name: 'Ledger', count: 336, facts: facts({ money: true }) }),
    list('runs', { name: 'Agent runs', count: 930, kernel: true, facts: null }),
    list('things', { name: 'Projects', facts: facts({ projects: true }) }),
    list('readings', { name: 'Numbers', count: 2527, facts: facts({ ofProjects: true }) }),
    list('services', { name: 'Services', count: 35, open: 6 }),
    list('notes', { name: 'Notes', count: 4 }),
  ];
  const places = [TODAY, { ...DECIDE, count: 13 }, WORKS, MONEY, { ...CREW, count: 3, live: true }, GUESTS];
  return sideModel({
    places,
    others: [SERVICES],
    projects: { href: '/p/projects', label: 'Projects', things: [{ href: '/p/kiln', label: 'Kiln', icon: 'doc' }] },
    lists,
    homes: homesOf(lists, places, AT),
    views: { work: [{ href: '/p/board', label: 'Board', icon: 'doc' }] },
    tools: [{ href: '/automations', label: 'Automations', icon: 'refresh', home: CREW.key }],
    foot: [
      { href: '/packs', label: 'Add-ons', icon: 'packs' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
    counted: { work: 'tasks' },
  });
};

test('every list lives under its place, a list named as a place is that place, and what has no place is under More', () => {
  const m = MODEL();
  const kids = Object.fromEntries(m.places.map((p) => [p.label, p.kids.map((k) => k.label)]));
  assert.deepEqual(kids, {
    Today: [],
    'Needs you': [],
    Work: ['Board'],
    Money: ['Ledger'],
    Crew: ['Agent runs', 'Automations'],
    Guests: ['Regulars'],
  });
  assert.equal(m.places.find((p) => p.label === 'Work')?.list, 'tasks', 'Work counts its tasks and draws no Tasks row');
  assert.equal(m.places.find((p) => p.label === 'Guests')?.count, 11, 'one word is never two rows');
  assert.deepEqual(m.projects?.kids.map((k) => k.label), ['Numbers']);
  /* THE NUMBER IS WHAT IS STILL OPEN (Q35 of 29 October), and a list whose rows never finish shows none. */
  assert.deepEqual(m.more.map((l) => `${l.label} ${String(l.count)}`), ['Services 6', 'Notes undefined']);
});

test('A PAGE A PLACE DECLARES AND THE LIST OF THE SAME NAME ARE ONE ROW: the page, whose list is a tap away on it', () => {
  const lists = [
    list('accounts', { name: 'Accounts', count: 13, facts: facts({ money: true }) }),
    list('transactions', { name: 'Ledger', count: 336, facts: facts({ money: true }) }),
    list('filing_rules', { name: 'Filing rules', count: 15, facts: facts({ money: true }) }),
    list('categories', { name: 'Categories', count: 15, facts: facts({ money: true }) }),
  ];
  const places = [TODAY, MONEY];
  const m = sideModel({
    places,
    others: [],
    projects: null,
    lists,
    homes: homesOf(lists, places, AT),
    views: {
      [MONEY.key]: [
        { href: '/p/money-accounts', label: 'Accounts', icon: 'doc' },
        { href: '/p/money-ledger', label: 'Ledger', icon: 'doc' },
        { href: '/p/money-rules', label: 'Filing rules', icon: 'doc' },
      ],
    },
    tools: [],
    foot: [],
    counted: {},
  });
  const kids = m.places.find((p) => p.label === 'Money')?.kids ?? [];
  /* AND THE FILING RULES ARE NO ROW AT ALL (audit of 30 October, 40): they open from the Ledger they file. */
  assert.deepEqual(kids.map((k) => `${k.label} ${k.href}`), ['Accounts /p/money-accounts', 'Ledger /p/money-ledger', 'Categories /r/categories']);
  /* AND THE PAGE ANSWERS FOR ITS LIST (F33): an account's own page is placed by its list, and read "Accounts › HSBC"
     with no Money before it. */
  assert.equal(litOf('/r/accounts', m), '/p/money-accounts');
  assert.equal(litOf('/r/accounts/4', m), '/p/money-accounts');
  assert.deepEqual(crumbOf('/p/accounts%234', m, null, 'HSBC (EGP)', null, { label: 'Accounts', href: '/r/accounts' }), [
    { label: 'Money', href: '/p/money' },
    { label: 'Accounts', href: '/p/money-accounts' },
    { label: 'HSBC (EGP)' },
  ]);
});

test('EXACTLY ONE ROW IS LIT: the row the page is on most closely, a list over its place and a project over Projects', () => {
  const m = MODEL();
  assert.equal(litOf('/', m), '/');
  assert.equal(litOf('/?work', m), '/?work');
  assert.equal(litOf('/p/board', m), '/p/board', 'Board, and not Work as well');
  assert.equal(litOf('/r/ledger', m), '/r/ledger');
  assert.equal(litOf('/r/ledger/42', m), '/r/ledger', 'a row lights its list');
  assert.equal(litOf('/p/money', m), '/p/money');
  assert.equal(litOf('/p/kiln', m), '/p/kiln');
  assert.equal(litOf('/p/projects', m), '/p/projects');
  assert.equal(litOf('/settings/navigation', m), '/settings');
  assert.equal(litOf('/search', m), null, 'a page no row leads to lights none');
  assert.equal(litOf('/decide/7', m), '/decide');
});

test('the crumb says the place, then where you are, each step a link back but the last', () => {
  const m = MODEL();
  assert.deepEqual(crumbOf('/r/ledger', m, '/r/ledger', 'Ledger'), [{ label: 'Money', href: '/p/money' }, { label: 'Ledger' }]);
  assert.deepEqual(crumbOf('/p/kiln', m, '/p/kiln', 'Kiln'), [{ label: 'Projects', href: '/p/projects' }, { label: 'Kiln' }]);
  assert.deepEqual(crumbOf('/', m, '/', 'Good evening'), [{ label: 'Today' }]);
  assert.deepEqual(crumbOf('/r/ledger/42', m, '/r/ledger', 'Rent'), [{ label: 'Money', href: '/p/money' }, { label: 'Ledger', href: '/r/ledger' }, { label: 'Rent' }]);
  assert.deepEqual(crumbOf('/settings/navigation', m, '/settings', 'Navigation'), [{ label: 'Settings', href: '/settings' }, { label: 'Navigation' }]);
  assert.deepEqual(crumbOf('/search', m, null, 'Search'), [{ label: 'Search' }]);
  assert.deepEqual(crumbOf('/p/projects', m, '/p/projects', 'Projects'), [{ label: 'Projects' }]);
  assert.deepEqual(crumbOf('/', m, '/', 'Today', 'Good afternoon, Mara'), [{ label: 'Good afternoon, Mara' }]);
  assert.deepEqual(crumbOf('/r/ledger/42', m, '/r/ledger', null), [{ label: 'Money', href: '/p/money' }, { label: 'Ledger', href: '/r/ledger' }]);
  /* A ROW OF A LIST NO SIDEBAR ROW LEADS TO: its list is the trail, where the bar was empty (Q38). */
  assert.deepEqual(crumbOf('/r/handoffs/3', m, null, null, null, { label: 'Handoffs', href: '/r/handoffs' }), [{ label: 'Handoffs', href: '/r/handoffs' }]);
  assert.deepEqual(crumbOf('/r/ledger/42', m, '/r/ledger', null, null, { label: 'Ledger', href: '/r/ledger' }), [{ label: 'Money', href: '/p/money' }, { label: 'Ledger', href: '/r/ledger' }]);
  /* A PAGE ABOUT A ROW, an account's or a bill's own, sits where its list sits, and its name ends the trail. */
  assert.deepEqual(crumbOf('/p/ledger%2342', m, null, 'Rent', null, { label: 'Ledger', href: '/r/ledger' }), [
    { label: 'Money', href: '/p/money' },
    { label: 'Ledger', href: '/r/ledger' },
    { label: 'Rent' },
  ]);
  assert.deepEqual(crumbOf('/search', m, null, 'Search'), [{ label: 'Search' }]);
  /* A SECTION WHOSE ROW IS A PAGE OF ANOTHER NAME: Guests leads to a page called "Weather", and the bar says Weather. */
  assert.deepEqual(crumbOf('/p/guests', m, '/p/guests', 'Weather'), [{ label: 'Guests' }, { label: 'Weather' }]);
  assert.deepEqual(crumbOf('/p/guests', m, '/p/guests', 'Guests'), [{ label: 'Guests' }]);
  assert.deepEqual(crumbOf('/p/services', m, '/p/services', 'Bookings'), [{ label: 'Services' }, { label: 'Bookings' }], 'a section under More too');
  assert.deepEqual(crumbOf('/p/kiln', m, '/p/kiln', 'Kiln studio'), [{ label: 'Projects', href: '/p/projects' }, { label: 'Kiln' }], 'a project is named by its row');
});

test('THE PROJECTS PART IS DRAWN ONCE THERE IS A PROJECT: "Projects 0 in play" headed a new shop', () => {
  assert.equal(holdsProjects(null), false);
  assert.equal(holdsProjects({ rows: [] }), false);
  assert.equal(holdsProjects({ rows: [{ key: 'things#1' }] }), true);
});

test('what the device keeps of counts and facts is read safely, by record and person', () => {
  const raw = JSON.stringify({ v: 2, base: '/a', person: 'p_1', counts: { work: 39, folk: -1, bad: 'x' } });
  assert.deepEqual(countsKept(raw, '/a', 'p_1'), { work: 39 });
  assert.deepEqual(countsKept(raw, '/b', 'p_1'), {}, "another record's is not drawn");
  assert.deepEqual(countsKept(null, '/a', 'p_1'), {});
  assert.equal(countsKept('{', '/a', 'p_1'), null);
  /* A SHARED DEVICE (review 3, P1): the owner's counts are never drawn for the member who signs in next, nor with no
     shell kept beside them, and the old shape, every record's by base for whoever was signed in, is dropped. */
  assert.equal(countsKept(raw, '/a', 'p_2'), null);
  assert.equal(countsKept(raw, '/a', null), null);
  assert.equal(countsKept(JSON.stringify({ '/a': { work: 39 } }), '/a', 'p_1'), null);
  assert.deepEqual(JSON.parse(countsEntry(raw, '/a', 'p_1', { folk: 4 })), { v: 2, base: '/a', person: 'p_1', counts: { work: 39, folk: 4 } });
  assert.deepEqual(JSON.parse(countsEntry(raw, '/a', 'p_2', { folk: 4 })).counts, { folk: 4 }, "another person's counts are not carried over");
  assert.deepEqual(factsKept(JSON.stringify({ '/a': { ledger: { money: true, pack: 'books' }, bad: 3 } }), '/a'), { ledger: { pack: 'books', money: true, folk: false, projects: false, ofProjects: false } });
  assert.deepEqual(factsKept('nope', '/a'), {});
});

const p = (name: string, o: Partial<{ pinned: boolean; late: number; working: boolean; moved: boolean; lane: string }> = {}) => ({
  name,
  pinned: false,
  late: 0,
  working: false,
  moved: false,
  lane: 'earning',
  ...o,
});

test('a steady order: pins, then by name, whatever is late, at work or moved this week', () => {
  const list = [p('Quiet'), p('Moved', { moved: true }), p('Busy', { working: true }), p('Late', { late: 2 }), p('Pinned', { pinned: true }), p('Also quiet')];
  assert.deepEqual(
    byWeek(list).map((x) => x.name),
    ['Pinned', 'Also quiet', 'Busy', 'Late', 'Moved', 'Quiet'],
  );
});

test('the order does not move when a project turns late or an agent starts on it', () => {
  const before = [p('A'), p('B'), p('C')];
  const after = [p('A'), p('B', { late: 3, working: true }), p('C', { working: true })];
  assert.deepEqual(byWeek(before).map((x) => x.name), byWeek(after).map((x) => x.name));
});

test('the width stays between 220 and 320, and anything unreadable is the start', () => {
  assert.equal(widthOf(100), SIDE_MIN);
  assert.equal(widthOf(900), SIDE_MAX);
  assert.equal(widthOf('260.4'), 260);
  assert.equal(widthOf('wide'), SIDE_START);
  assert.equal(widthOf(undefined), SIDE_START);
});

test('parked and finished are read from the list: its done states, else retired', () => {
  const values = ['building', 'earning', 'parked', 'retired'];
  const lanes = lanesOf({}, values);
  const split = splitOf([p('A'), p('B', { lane: 'parked' }), p('C', { lane: 'retired' }), p('D', { lane: 'building' })], lanes);
  assert.deepEqual(split.play.map((x) => x.name), ['A', 'D']);
  assert.deepEqual(split.parked.map((x) => x.name), ['B']);
  assert.deepEqual(split.finished.map((x) => x.name), ['C']);
  const own = lanesOf({ done: ['shipped'] }, ['live', 'shipped']);
  assert.deepEqual([...own.finished], ['shipped']);
  assert.equal(own.parked.size, 0);
});

test('one fact a project: late first, then an agent, then money, nothing for a quiet one', () => {
  assert.deepEqual(factOf({ late: 1, working: true, moved: true }), { text: '1 late', tone: 'late' });
  assert.deepEqual(factOf({ late: 4, working: false, moved: false }), { text: '4 late', tone: 'late' });
  assert.equal(factOf({ late: 0, working: true, moved: false })?.tone, 'live');
  assert.equal(factOf({ late: 0, working: false, moved: true })?.tone, 'quiet');
  assert.equal(factOf({ late: 0, working: false, moved: false }), null);
});

test('what the device keeps is read safely', () => {
  assert.deepEqual(sideKept(null), { hidden: false, width: SIDE_START });
  assert.deepEqual(sideKept('{"hidden":true,"width":300}'), { hidden: true, width: 300 });
  assert.deepEqual(sideKept('not json'), { hidden: false, width: SIDE_START });
  assert.deepEqual(pinsKept('["/p/a","/p/a",3,"b"]'), ['/p/a']);
  assert.deepEqual(pinsKept('{'), []);
});

test('a name typed as a slug is said in words, and any other name is kept as written', () => {
  assert.equal(shownName('kiln-site'), 'Kiln site');
  assert.equal(shownName('money_core'), 'Money core');
  for (const kept of ['Glaze shop', 'Clay.co', 'PotBoard', 'iOS app', 'glaze', 'kiln.gg', 'Kiln-site']) assert.equal(shownName(kept), kept);
});

/* On the phone Projects was a
   bare list of names, while the laptop's cards said each one's lane and next step. */
test('A PROJECT ON THE PHONE SAYS ITS LANE AND ITS NEXT STEP under its name, either alone, or nothing', () => {
  const label = (lane: string): string => ({ building: 'Building', earning: 'Earning' })[lane] ?? lane;
  assert.equal(phoneLine({ lane: 'building', next: ' Ship the first build ' }, label), 'Building · Ship the first build');
  assert.equal(phoneLine({ lane: 'earning' }, label), 'Earning');
  assert.equal(phoneLine({ lane: '', next: 'Write the store listing' }, label), 'Write the store listing');
  assert.equal(phoneLine({ lane: '', next: '  ' }, label), null);
});

test("a place's kept rows stand first and the rest fold under its More without their counts", () => {
  const kids = [
    { href: '/r/snapshots', label: 'Snapshots', icon: 'doc', count: 31 },
    { href: '/p/money-ledger', label: 'Ledger', icon: 'doc' },
    { href: '/p/money-accounts', label: 'Accounts', icon: 'doc' },
    { href: '/r/categories', label: 'Categories', icon: 'doc', count: 15 },
  ];
  const got = leadFirst(kids, ['/p/money-accounts', '/p/money-ledger', '/p/money-budgets']);
  assert.equal(got.lead, 2);
  assert.deepEqual(got.kids.map((k) => k.label), ['Accounts', 'Ledger', 'Snapshots', 'Categories']);
  assert.equal(got.kids[2]?.count, undefined, 'a list under More carries no count');
});

test("MONEY'S OPEN PAGES ARE ITS FIRST FOUR IN THEIR DECLARED ORDER, less its own, and name no page", () => {
  const views = ['/p/home', '/p/a', '/p/b', '/p/c', '/p/d', '/p/e', '/p/f', '/p/g'].map((href) => ({ href }));
  assert.deepEqual(moneyLead(views, '/p/home'), ['/p/a', '/p/b', '/p/c', '/p/d']);
  assert.deepEqual(moneyLead(undefined, '/p/home'), []);
});

test('in play, earning and building are said in one place, by the lanes a list declares (live check of 30 October, 6)', async () => {
  const { inPlayOf, earningOf, buildingOf, lanesOf } = await import('./side.ts');
  for (const [lane, play, earn, build] of [
    ['earning', true, true, false],
    ['building', true, false, true],
    ['parked', false, false, false],
    ['retired', false, false, false],
  ] as const) {
    assert.equal(inPlayOf(lane), play, lane);
    assert.equal(earningOf(lane), earn, lane);
    assert.equal(buildingOf(lane), build, lane);
  }
  /* A LIST THAT CALLS ITS DONE LANE SOMETHING ELSE IS READ BY WHAT IT DECLARES. */
  const lanes = lanesOf({ done: ['shipped'] }, ['building', 'parked', 'shipped']);
  assert.equal(inPlayOf('shipped', lanes), false);
  assert.equal(inPlayOf('retired', lanes), true);
});

test('A PAGE HELD OFF THE RAIL GOES UNDER ITS PLACE, OR UNDER MORE LISTS WHERE ITS SECTION IS NO PLACE (audit 31 Oct f, AF7)', () => {
  const places = [TODAY, DECIDE, MONEY];
  const m = sideModel({
    places,
    others: [],
    projects: null,
    lists: [],
    homes: homesOf([], places, AT),
    views: { [MONEY.key]: [{ href: '/p/money-ledger', label: 'Ledger', icon: 'doc' }] },
    tools: [],
    foot: [],
    counted: {},
    waiting: [
      { href: '/p/splits', label: 'Splits', icon: 'split', home: MONEY.key },
      { href: '/p/weather', label: 'Weather', icon: 'sun', home: IN_MORE, section: 'Life' },
      { href: '/p/calendar', label: 'Calendar', icon: 'calendar', home: IN_MORE, section: 'Life' },
    ],
  });
  assert.deepEqual(m.places.find((p) => p.label === 'Money')?.kids.map((k) => k.href), ['/p/money-ledger', '/p/splits']);
  assert.ok(m.more.some((k) => k.href === '/p/weather'));
  assert.equal(litOf('/p/splits', m), '/p/splits');
  /* ITS SECTION IS DRAWN, ONCE, AS IT IS ONCE THE PAGE HOLDS SOMETHING (polish-i, PI2): "Life", opening Weather, the bar
     saying "Life › Weather"; Calendar, filed there too, answers to the same row. */
  const life = m.more.filter((k) => k.label === 'Life');
  assert.equal(life.length, 1);
  assert.equal(life[0]!.href, '/p/weather');
  assert.ok(!m.more.some((k) => k.label === 'Weather' || k.label === 'Calendar'));
  assert.deepEqual(crumbOf('/p/weather', m, litOf('/p/weather', m), 'Weather').map((c) => c.label), ['Life', 'Weather']);
  assert.deepEqual(crumbOf('/p/calendar', m, litOf('/p/calendar', m), 'Calendar').map((c) => c.label), ['Life', 'Calendar']);
});
