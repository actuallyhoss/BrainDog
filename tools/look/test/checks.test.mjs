/**
 * The quick checks of a look (`checks.mjs`) without a browser: counts that must agree, numbers that must say their age,
 * and the one line a batch is judged on. Each is tried on the sample record's own text and sentences, then on a planted
 * disagreement or a planted old number, so a check that went blind would be seen to.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { kpiView } from '../../../packages/render/src/kpis.ts';
import { BLANK_UNDER_WORDS, CANNOT, OLD_AFTER_DAYS, agesOf, blankOf, countsIn, dayFrom, judge, judgeAges, judgeBlank, judgeCounts, newestIn, readingOf } from '../checks.mjs';

/* ── counts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Today, Needs you and Projects as the sample record prints them (cut to the lines that count). */
const TODAY = `Thursday 3 September

8 need you. £7,200 owed to you is late, and £10,540 you owe. 2 agents are working.
More for Today
Needs you
8
Invoice 2026-041: brand system
5 more in Needs you
Projects
3
In play 3
Earning 2
Building 1
All projects
Kiln`;
const DECIDE = `Needs you

More on Needs you

3 about money, £7,239 in all. 5 quick ones.

More for Needs you
Money
3`;
const PROJECTS = `Projects
Share
Note

Portage and Kiln need a push, Marlow & Co is on track.

In play
Projects
Filter status is not Finished
In play 3
Earning 2
Building 1
Parked 1
Kiln`;
const FRAME = { badges: ['8 Open questions'], more: [{ heading: 'Projects', rows: ['Kiln', 'Marlow & Co', 'Portage'] }, { heading: 'Your things', rows: ['Work', 'People'] }] };

const at = (read) => Object.fromEntries(Object.entries(read).map(([thing, rs]) => [thing, rs.map((r) => `${r.n} ${r.at}`)]));

test('THE COUNTS ARE READ WHERE THE PRODUCT SAYS THEM: the lane bar, the Projects count, the More sheet, the badge, the line, the tile', () => {
  assert.deepEqual(at(countsIn(TODAY, FRAME)), {
    'in play': ['3 the lane bar', '3 the Projects count', '3 the More sheet'],
    'need you': ['8 the line', '8 the Needs you tile', '8 the badge'],
  });
  assert.deepEqual(at(countsIn(PROJECTS, FRAME)), { 'in play': ['3 the lane bar', '3 the More sheet'], 'need you': ['8 the badge'] });
  assert.deepEqual(at(countsIn(DECIDE, FRAME)), { 'in play': ['3 the More sheet'], 'need you': ['8 the Needs you line', '8 the badge'] });
});

test("NEEDS YOU'S LINE IS BOTH GROUPS, or the one it has", () => {
  assert.equal(countsIn('3 about money, £7,239 in all. 5 quick ones.')['need you'][0].n, 8);
  assert.equal(countsIn('5 quick ones.')['need you'][0].n, 5);
  /* THE LINE AS IT IS SAID SINCE U-A7, the count first: both readings are 8, and they agree. */
  assert.deepEqual(countsIn('8 need you: 3 about money, £7,239 in all, and 5 quick ones.')['need you'].map((c) => c.n), [8, 8]);
  assert.deepEqual(countsIn('6 need you, all quick ones.')['need you'].map((c) => c.n), [6]);
  assert.equal(countsIn('1 about money, £40 in all.')['need you'][0].n, 1);
  assert.deepEqual(countsIn('Nothing needs you today')['need you'], []);
});

test('A COUNT OVER A LANE BAR IS NOT A SENTENCE, and a sentence is one', () => {
  assert.deepEqual(at(countsIn('Projects\n13\nIn play 8\nEarning 7'))['in play'], ['8 the lane bar', '13 the Projects count']);
  assert.deepEqual(at(countsIn('Today 13 projects in play, 11 parked'))['in play'], ['13 a sentence']);
  assert.deepEqual(at(countsIn('1,204 need you. 2 questions wait on you.'))['need you'], ['1204 the line', '2 the brief']);
  assert.deepEqual(countsIn('No project in play says what it is for')['in play'], []);
});

test('A SAMPLE THE SCREEN READER IS NOT TOLD IS NOT A COUNT: Appearance previews a Today line of its own', () => {
  const previews = 'Light\nToday\n3 need you today, 1 is late.\nDark\nToday\n3 need you today, 1 is late.';
  const decor = [previews];
  assert.equal(countsIn(`Appearance\n${previews}`)['need you'].length, 2, 'unmarked, the sample reads as the line');
  assert.deepEqual(countsIn(`Appearance\n${previews}`, { decor })['need you'], []);
  assert.deepEqual(at(countsIn(`8 need you.\n${previews}`, { decor }))['need you'], ['8 the line']);
});

/** A picture's readings, as a look keeps them on each shot. */
const shot = (screen, text, frame = FRAME, width = 1512, theme = 'light') => ({ screen, name: screen[0].toUpperCase() + screen.slice(1), width, theme, counts: countsIn(text, frame) });

test('COUNTS THAT AGREE ARE SAID WITH HOW MANY KINDS OF PLACE SAID THEM', () => {
  const got = judgeCounts([shot('today', TODAY), shot('decide', DECIDE), shot('projects', PROJECTS)]);
  assert.deepEqual(got['in play'], { read: 6, places: ['the lane bar', 'the Projects count', 'the More sheet'], agree: true, values: [3] });
  assert.deepEqual(got['need you'], { read: 6, places: ['the line', 'the Needs you tile', 'the badge', 'the Needs you line'], agree: true, values: [8] });
});

test("THE AUDIT'S DISAGREEMENT IS FOUND: 13 in play, 8 on the lane bar and 5 on Projects, and 3 needing you where 8 do", () => {
  const today = TODAY.replace('Projects\n3\nIn play 3', 'Projects\n13\nIn play 8').replace('8 need you', '3 need you').replace('Needs you\n8', 'Needs you\n3');
  const projects = PROJECTS.replace('In play 3', 'In play 5');
  const frame = { badges: ['3 Open questions'], more: [{ heading: 'Projects', rows: ['Crumb.gg', 'Larkspur', 'Fern', 'Lanternfish', 'sam-site'] }] };
  const got = judgeCounts([shot('today', today, frame), shot('decide', DECIDE, frame), shot('projects', projects, frame)]);
  assert.equal(got['in play'].agree, false);
  assert.deepEqual(got['in play'].values, [13, 8, 5]);
  assert.equal(got['in play'].in, '1512 light');
  assert.deepEqual(got['in play'].seen.filter((r) => r.n === 13), [{ n: 13, at: 'the Projects count', screen: 'Today' }]);
  assert.equal(got['need you'].agree, false);
  assert.deepEqual(got['need you'].values, [8, 3]);
  assert.ok(got['need you'].seen.some((r) => r.n === 8 && r.at === 'the Needs you line'));
});

test("TWO WIDTHS THAT EACH AGREE WITH THEMSELVES DO NOT DISAGREE: a record moves between a look's first picture and its last", () => {
  const later = { badges: ['9 Open questions'], more: FRAME.more };
  const got = judgeCounts([shot('today', TODAY, FRAME, 390), shot('today', TODAY.replaceAll('8', '9'), later, 1512)]);
  assert.equal(got['need you'].agree, true);
});

test('A THING NOBODY SAID IS NOT READ, and the line says so', () => {
  const got = judgeCounts([shot('money', 'Money\nCash is £33,850', { badges: [], more: [] })]);
  assert.deepEqual(got['in play'], { read: 0, places: [], agree: true, values: [] });
  assert.match(judge([{ screen: 'money', name: 'Money', width: 1512, theme: 'light', raw: {}, counts: countsIn('Cash is £33,850'), ages: agesOf({}, Date.now()) }]).summary, /counts not read/u);
});

/* ── ages ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const NOW = Date.parse('2026-09-12T12:00:00Z');
const at9 = (day) => `${day}T09:00:00.000Z`;
const level = { name: 'Subscribers', unit: 'people', kind: 'level', points: [{ at: at9('2026-08-20'), value: 300 }, { at: at9('2026-08-26'), value: 301 }, { at: at9('2026-09-02'), value: 318 }] };
const flow = { name: 'Billed a month', unit: 'GBP', kind: 'flow', points: [{ at: at9('2026-06-20'), value: 250 }, { at: at9('2026-07-20'), value: 250 }, { at: at9('2026-08-20'), value: 300 }] };
const weekly = { name: 'Hours billed', unit: 'hours', kind: 'flow', every: '1w', points: [{ at: at9('2026-08-10'), value: 21 }, { at: at9('2026-08-17'), value: 21 }, { at: at9('2026-08-24'), value: 28 }] };
const sentence = (k) => kpiView(k, { home: 'GBP', now: new Date(NOW).toISOString() }).sentence;
const day = (label) => new Date(dayFrom(label, NOW)).toISOString().slice(0, 10);

test("A KEY NUMBER'S SENTENCE, AS THE RENDERER WRITES IT, NAMES THE READING: its day, its week's end, its month's end", () => {
  assert.deepEqual([readingOf(sentence(level), NOW)].map((r) => [r.name, new Date(r.newest).toISOString().slice(0, 10), r.label]), [['Subscribers', '2026-09-02', '2 Sep']]);
  assert.deepEqual([readingOf(sentence(flow), NOW)].map((r) => [r.name, new Date(r.newest).toISOString().slice(0, 10), r.label]), [['Billed a month', '2026-08-31', 'Aug']]);
  assert.deepEqual([readingOf(sentence(weekly), NOW)].map((r) => [r.name, new Date(r.newest).toISOString().slice(0, 10), r.label]), [['Hours billed', '2026-08-30', '24 Aug']]);
  assert.equal(new Date(readingOf('Cash now: £100 today', NOW).newest).toISOString().slice(0, 10), '2026-09-12');
});

test("A PROJECT CARD'S SENTENCE CARRIES THE SAME, behind its own words", () => {
  const card = 'Kiln, earning, at risk, Revenue a month: £2,300 in Aug, Up 28% on Jul, Target £2,000 met, 60% along, 1 late';
  assert.deepEqual([readingOf(card, NOW).name, readingOf(card, NOW).label], ['Revenue a month', 'Aug']);
  assert.equal(readingOf('Kiln, earning, 60% along', NOW), null, 'a sentence that names no reading names no age');
  assert.equal(readingOf('How far along: 60 of 100', NOW), null);
});

test("A DATE WITH NO YEAR IS THIS YEAR'S, or last year's when this year's is still to come", () => {
  assert.equal(day('28 Sep'), '2025-09-28', "on 12 Sep 2026, 28 Sep is last year's");
  assert.equal(day('2 Sep'), '2026-09-02');
  assert.equal(day('28 Sep 2024'), '2024-09-28');
  assert.equal(day('2026-09-02'), '2026-09-02');
  assert.equal(dayFrom('Septemberish', NOW), null);
});

const chart = (rows, was = [false, true]) => ({ name: 'Weekly active players', was, rows, box: '' });

test("A CHART'S NEWEST READING IS ITS LATEST DAY WITH A VALUE ON A LINE THAT IS NOT THE PERIOD BEFORE", () => {
  const rows = [['23 Aug', '5,700', '6,000'], ['28 Aug', '5,683', '6,089'], ['29 Aug', '\u2014', '6,100'], ['30 Aug', '', '6,200']];
  assert.deepEqual(newestIn(chart(rows), NOW), { newest: dayFrom('28 Aug', NOW), label: '28 Aug' });
  assert.equal(newestIn(chart([['Mon', '1', '2']]), NOW), null, 'days it cannot read are not guessed at');
  assert.equal(newestIn(chart([]), NOW), null);
});

const figure = (box, extra = {}) => ({ sentences: [{ label: sentence(level), box }], charts: [], ...extra });

test('AN OLD NUMBER THAT SAYS NOTHING OF ITS AGE IS FOUND, and one that does is not', () => {
  const noDate = agesOf(figure('Subscribers 318 people Up 5.6% since 26 Aug'), NOW);
  assert.deepEqual(noDate, { read: 1, unread: 0, old: [{ kind: 'number', name: 'Subscribers', said: '2 Sep', newest: '2026-09-02', days: 10, shown: false }] }, 'since 26 Aug dates the change, not the reading');
  for (const box of ['Subscribers 318 people Not updated since 2 Sep', 'Subscribers 318 people 2 Sep', 'Subscribers 318 people, read 10 days ago', 'Subscribers 318 people Updated yesterday'])
    assert.equal(agesOf(figure(box), NOW).old[0].shown, true, box);
  assert.deepEqual(agesOf(figure('Subscribers 318 people'), Date.parse('2026-09-05T12:00:00Z')).old, [], 'three days old is not old');
  assert.equal(agesOf(figure('Subscribers 318 people'), Date.parse('2026-09-09T12:00:00Z')).old.length, 0, `${OLD_AFTER_DAYS} days is not older than a week`);
  assert.equal(agesOf(figure('Subscribers 318 people'), Date.parse('2026-09-10T12:00:00Z')).old.length, 1, 'eight days is');
});

test("A CHART WHOSE LINE STOPS A MONTH AGO IS FOUND, as Crumb.gg's was, unless its box says so", () => {
  const rows = [['23 Aug', '5,700', '6,000'], ['28 Aug', '5,683', '6,089'], ['10 Sep', '', '6,100']];
  const lead = '5,683 −6.7% against Previous 30 days, 6,089 Weekly active players Previous 30 days 23 Aug 12 Sep';
  const got = agesOf({ sentences: [], charts: [{ ...chart(rows), box: lead }] }, NOW);
  assert.deepEqual(got.old, [{ kind: 'chart', name: 'Weekly active players', said: '28 Aug', newest: '2026-08-28', days: 15, shown: false }]);
  assert.equal(agesOf({ sentences: [], charts: [{ ...chart(rows), box: `${lead} 28 Aug` }] }, NOW).old[0].shown, true);
  assert.equal(agesOf({ sentences: [], charts: [{ ...chart(rows), box: `${lead}, last read 15 days ago` }] }, NOW).old[0].shown, true);
  assert.deepEqual(agesOf({ sentences: [], charts: [chart([['Mon', '1', '2']])] }, NOW), { read: 0, unread: 1, old: [] }, 'a chart it cannot date is counted as unread');
});

/** A picture's ages, as a look keeps them on each shot. */
const aged = (screen, old, read = old.length) => ({ screen, name: screen[0].toUpperCase() + screen.slice(1), width: 1512, theme: 'light', ages: { read, unread: 0, old } });
const oldOne = (name, shown = false) => ({ kind: 'number', name, said: '2 Sep', newest: '2026-09-02', days: 10, shown });

test('A FIGURE IS FLAGGED ONCE FOR A SCREEN, however many sizes and themes draw it', () => {
  const six = Array.from({ length: 6 }, () => aged('today', [oldOne('Subscribers'), oldOne('Specimen downloads', true)], 7));
  const got = judgeAges([...six, aged('projects', [oldOne('Subscribers')], 3)]);
  assert.deepEqual(got.flagged.map((f) => `${f.screen}: ${f.name}`), ['Today: Subscribers', 'Projects: Subscribers']);
  assert.equal(got.read, 10, 'a screen holds as many figures as its fullest picture does, not six times that');
  assert.equal(got.screens, 2);
});

/* ── the one line ───────────────────────────────────────────────────────────────────────────────────────────── */

const clean = (screen) => ({ ...shot(screen, screen === 'today' ? TODAY : screen === 'projects' ? PROJECTS : DECIDE), raw: {}, ages: { read: 4, unread: 0, old: [] } });

test('A CLEAN LOOK SAYS WHAT IT READ, so a check that went blind is not a pass', () => {
  const got = judge([clean('today'), clean('decide'), clean('projects')]);
  assert.equal(got.summary, 'words: 0; counts agree: in play 3 (3 places), need you 8 (4 places); old numbers without age: 0 (read 12 dated figures)');
  assert.equal(got.found, false);
  assert.deepEqual(got.lines, []);
  assert.deepEqual(got.cannot, CANNOT);
});

test('THE LINE THE BRIEF GAVE: "words: 12 on 5 screens; counts disagree: in play 13/8/5; old numbers without age: 4"', () => {
  const raw = (n) => ({ machine: { count: n, e: ['…your own rows, and…'] } });
  const words = ['today', 'projects', 'project', 'money', 'agents'].map((screen, i) => ({ screen, name: screen, width: 1512, theme: 'light', raw: raw([3, 3, 2, 2, 2][i]), counts: { 'in play': [], 'need you': [] }, ages: { read: 0, unread: 0, old: [] } }));
  const today = { ...words[0], counts: { 'in play': [{ at: 'the Projects count', n: 13 }, { at: 'the lane bar', n: 8 }], 'need you': [] }, ages: { read: 6, unread: 0, old: [oldOne('Subscribers'), oldOne('Revenue a month')] } };
  const projects = { ...words[1], counts: { 'in play': [{ at: 'the lane bar', n: 5 }], 'need you': [] }, ages: { read: 3, unread: 0, old: [oldOne('Subscribers'), oldOne('Revenue a month')] } };
  const got = judge([today, projects, ...words.slice(2)]);
  assert.equal(got.summary, 'words: 12 on 5 screens; counts disagree: in play 13/8/5; old numbers without age: 4');
  assert.equal(got.found, true);
  assert.equal(got.lines.length, 2 + 1 + 4, 'words once for each way the screens read alike (3 and 2), the count, and each old number');
  assert.ok(got.lines.every((l) => !l.includes('\u2014')), 'no em dash in what it says');
});

/* ── blank screens ───────────────────────────────────────────────────────────── */

const DRAWN = { heading: true, words: 240, project: false, hero: false };

test("A BLANK SCREEN IS FOUND: no name and next to nothing, or a project's page with no name or hero, as his were", () => {
  assert.equal(blankOf(DRAWN, 'today'), null, 'a named screen with words on it is drawn');
  assert.equal(blankOf({ ...DRAWN, heading: false, words: 4 }, 'money'), 'no name and 4 words');
  assert.equal(blankOf({ ...DRAWN, heading: false, words: BLANK_UNDER_WORDS }, 'money'), null, 'a screen with words and no h1 of its own is not blank');
  /* HIS PROJECT PAGES ON 25 OCTOBER: on a phone nothing under the bar, on a laptop the page opening on its blocks. */
  assert.equal(blankOf({ heading: false, words: 0, project: true, hero: false }, 'p-portage'), 'no name and 0 words');
  assert.equal(blankOf({ heading: false, words: 180, project: true, hero: false }, 'p-braindog'), 'a project page with no name or hero');
  assert.equal(blankOf({ heading: false, words: 180, project: false, hero: false }, 'project'), 'a project page with no name or hero', 'the project the look picked, whatever the page says');
  assert.equal(blankOf({ heading: true, words: 180, project: true, hero: false }, 'project'), 'a project page with no hero');
  assert.equal(blankOf({ heading: true, words: 180, project: true, hero: true }, 'project'), null);
  assert.equal(blankOf(null, 'project'), null, 'a picture whose facts were not read is not judged');
});

test('A BLANK SCREEN FAILS THE LOOK and says where; a clean look says what it always said', () => {
  const blankProject = { ...clean('projects'), screen: 'project', name: 'Portage', width: 390, theme: 'light', drawn: { heading: false, words: 0, project: true, hero: false } };
  const got = judge([{ ...clean('today'), drawn: DRAWN }, clean('decide'), clean('projects'), blankProject]);
  assert.equal(got.found, true);
  assert.match(got.summary, /; blank screens: 1$/u);
  assert.ok(got.lines.includes('Portage at 390 light is blank: no name and 0 words'), got.lines.join(' | '));
  assert.deepEqual(judgeBlank([{ ...clean('today'), drawn: DRAWN }]), { read: 1, blank: [] });
  const fine = judge([{ ...clean('today'), drawn: DRAWN }, clean('decide'), clean('projects'), { ...blankProject, drawn: { heading: true, words: 300, project: true, hero: true } }]);
  assert.equal(fine.found, false);
  assert.doesNotMatch(fine.summary, /blank/u);
});
