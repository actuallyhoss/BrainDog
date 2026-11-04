/**
 * The Projects board: a headline that is a fact naming the projects, what they earn a month, this week's counts, one
 * list in three groups, and the parked folded into a strip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardOf, endedAs, names, runProject, trailOf, type BoardInput, type BoardProject } from './projects-board.ts';
import { feedAgeOf } from '../page/feed-age.ts';

test('a line is drawn from three readings, inside its box', () => {
  assert.equal(trailOf([1, 2], 80, 24), null);
  const s = trailOf([1, 3, 2], 80, 24)!;
  assert.equal(s.line, 'M2.0 22.0 L40.0 2.0 L78.0 12.0');
  assert.deepEqual(s.end, [78, 12]);
});

const NOW = Date.UTC(2026, 9, 27, 10);
const TODAY = '2026-10-27';
const usd = (minor: number) => `$${(minor / 100).toLocaleString('en-US')}`;

const project = (seq: number, name: string, lane: string, more: Partial<BoardProject> = {}): BoardProject => ({
  seq,
  id: `id${seq}`,
  spoken: `things#${seq}`,
  name,
  mark: '',
  hue: null,
  lane,
  next: '',
  health: '',
  href: `/p/${name.toLowerCase()}`,
  year: null,
  repos: [],
  ...more,
});

const base = (more: Partial<BoardInput> = {}): BoardInput => ({
  projects: [
    project(1, 'Kiln', 'earning', { repos: ['kiln-app'] }),
    project(2, 'Portage', 'building', { next: 'Write the launch post, then ship it by 30 Oct.' }),
    project(3, 'Lantern', 'building'),
    project(4, 'Tidewater', 'building'),
    project(5, 'Moss', 'parked'),
    project(6, 'Fern', 'retired'),
  ],
  tasks: [],
  moves: [],
  runs: [],
  kpis: [],
  asks: [],
  renewals: [],
  recurring: [],
  now: NOW,
  today: TODAY,
  format: (m) => usd(m),
  home: 'USD',
  hrefs: { late: '/r/tasks?late', asks: '/decide', feed: '/numbers/setup', numbers: '/p/all-numbers' },
  called: { one: 'task', many: 'tasks' },
  ...more,
});

test('nothing late, due or quiet says so, never that nothing needs a push', () => {
  const b = boardOf(base({ projects: base().projects.map((p) => ({ ...p, next: '' })) }));
  assert.equal(b.headline, 'Nothing is late, due this week or gone quiet.');
  assert.equal(b.date, 'Tuesday 27 October · 4 in play · 1 parked · 1 closed');
});

test('the headline names the late projects and the quiet numbers, and the button opens the late work', () => {
  const b = boardOf(
    base({
      tasks: [
        { seq: 10, project: 'things#1', title: 'Check the door on two phones', by: '2026-10-26', href: '/r/tasks/10' },
        { seq: 11, project: 'id3', title: 'Deploy the first wave', by: '2026-10-26', href: '/r/tasks/11' },
        { seq: 12, project: 'things#1', title: 'Send the draft', by: null, href: '/r/tasks/12' },
      ],
      kpis: [
        { project: 'things#4', name: 'Players a day', figure: '289', money: null, every: '1d', latestAt: '2026-09-28', points: [1, 2, 3], move: null, stale: '29 days old', aim: null, readings: 40 },
      ],
    }),
  );
  assert.equal(b.headline, 'Work on Kiln and Lantern is a day late, and Tidewater stopped sending numbers.');
  assert.match(b.lede ?? '', /“Check the door on two phones” was due Mon 26 Oct/u);
  assert.deepEqual(b.acts.late, { said: 'Open the 2 late tasks', href: '/r/tasks?late' });
  assert.deepEqual(b.acts.feed, { said: 'Fix the numbers feed', href: '/numbers/setup' });
  assert.equal(b.week.late.count, 2);
  assert.equal(b.week.late.said, 'tasks, 1 day over');
  assert.equal(b.week.quiet.count, 1);
  assert.equal(b.week.quiet.said, 'since 28 Sep');
  const kiln = b.groups[0]!.rows[0]!;
  assert.deepEqual(kiln.chip, { tone: 'late', text: '1 late · 2 open' });
  const tide = b.groups.flatMap((g) => g.rows).find((r) => r.name === 'Tidewater')!;
  assert.deepEqual(tide.chip, { tone: 'warn', text: 'numbers 29 days old' });
});

test('a number gone quiet counts on the quiet tile while the rest of its project still reports', () => {
  const b = boardOf(
    base({
      kpis: [
        { project: 'things#1', name: 'Studios licensed', figure: '52', money: null, every: '1w', latestAt: '2026-10-26', points: [1, 2, 3], move: null, stale: null, aim: null, readings: 12 },
        { project: 'things#1', name: 'Specimen downloads', figure: '251', money: null, every: '1w', latestAt: '2026-10-06', points: [1, 2, 3], move: null, stale: '21 days old', aim: null, readings: 6 },
      ],
    }),
  );
  assert.equal(b.week.quiet.count, 1);
  assert.equal(b.week.quiet.said, 'since 6 Oct');
  assert.deepEqual(b.week.quiet.lines[0], { day: null, project: 'Kiln', text: 'Specimen downloads, 21 days old', href: '/p/kiln' });
  /* Kiln's feed has not stopped, so nothing says it stopped sending numbers. */
  assert.doesNotMatch(b.headline, /stopped sending/u);
});

test('a day written in a next step is due this week, and puts the project among the moving', () => {
  const b = boardOf(base());
  assert.equal(b.week.due.count, 1);
  assert.deepEqual(b.week.due.lines[0], { day: 'Fri 30', project: 'Portage', text: 'Ship it', href: '/p/portage' });
  const moving = b.groups.find((g) => g.id === 'moving')!;
  assert.deepEqual(
    moving.rows.map((r) => r.name),
    ['Portage'],
  );
  assert.deepEqual(moving.rows[0]!.chip, { tone: 'plain', text: 'Fri 30 Oct' });
  assert.equal(b.headline, 'Portage has work due Fri 30 Oct.');
  const quiet = b.groups.find((g) => g.id === 'quiet')!;
  assert.deepEqual(
    quiet.rows.map((r) => r.name),
    ['Lantern', 'Tidewater'],
  );
});

test('last real work is a tagged run or a task change, never an edit of the project row', () => {
  const run = { seq: 7, agent: 'claude', project: '', repo: 'kiln-app', remote: '', cwd: '/home/dev/kiln-app', at: new Date(NOW - 30 * 60_000).toISOString(), state: 'done', closedAs: '', handed: false };
  const b = boardOf(base({ runs: [run], moves: [{ project: 'things#3', at: new Date(NOW - 2 * 86_400_000).toISOString() }] }));
  const kiln = b.groups[0]!.rows[0]!;
  assert.deepEqual(kiln.work, { agent: 'claude', said: '30 min ago', sub: 'stopped without a note', none: false });
  const lantern = b.groups.find((g) => g.id === 'moving')!.rows.find((r) => r.name === 'Lantern')!;
  assert.equal(lantern.work.said, 'Tasks changed 2 days ago');
  const tide = b.groups.find((g) => g.id === 'quiet')!.rows[0]!;
  assert.deepEqual(tide.work, { agent: null, said: 'No sessions', sub: null, none: true });
});

test('a run is placed by its tag, else loosely by its repository, remote or folder', () => {
  const ps = base().projects;
  assert.equal(runProject({ project: 'things#2', repo: '', remote: '', cwd: '' }, ps)?.name, 'Portage');
  assert.equal(runProject({ project: '', repo: '', remote: 'github.com/someone/Kiln-App.git', cwd: '' }, ps)?.name, 'Kiln');
  assert.equal(runProject({ project: '', repo: '', remote: '', cwd: 'C:\\code\\lantern' }, ps)?.name, 'Lantern');
  assert.equal(runProject({ project: '', repo: '', remote: '', cwd: '/home/dev' }, ps), null);
});

test('how a run ended is said in words', () => {
  assert.equal(endedAs({ state: 'active', closedAs: '', handed: false }).said, 'still open');
  assert.equal(endedAs({ state: 'handoff', closedAs: '', handed: true }).said, 'handed off');
  assert.equal(endedAs({ state: 'done', closedAs: 'dropped', handed: false }).said, 'dropped');
  assert.equal(endedAs({ state: 'done', closedAs: '', handed: false }).said, 'stopped without a note');
});

test('earning a month adds linked repeating money, else a monthly key number, in one currency', () => {
  const projects = [project(1, 'Kiln', 'earning'), project(2, 'Marlow', 'earning'), project(3, 'Oxbow', 'earning')];
  const b = boardOf(
    base({
      projects,
      recurring: [{ project: 'things#1', minor: 875_000, currency: 'USD', every: 'month', state: 'live', nextDue: '2026-10-31' }],
      kpis: [{ project: 'things#2', name: 'Revenue by month', figure: '$4,815', money: { minor: 481_500, currency: 'USD' }, every: '1m', latestAt: '2026-09-30', points: [], move: null, stale: null, aim: null, readings: 12 }],
    }),
  );
  assert.equal(b.earning.total, '$13,565');
  assert.deepEqual(
    b.earning.lines.map((l) => [l.name, l.said, l.status]),
    [
      ['Kiln', '$8,750', 'repeats, next pay Sat 31 Oct'],
      ['Marlow', '$4,815', 'made in Sep'],
    ],
  );
  assert.equal(b.earning.also, '1 project with no money linked');
  /* THE TILE COUNTS EVERY EARNING PROJECT, as the list's Earning group does, the one with no money linked among them. */
  assert.equal(b.earning.count, 3);
  assert.equal(b.groups[0]!.said, '3');
});

test('no money linked to an earning project says so in a line', () => {
  const b = boardOf(base());
  assert.equal(b.earning.total, null);
  assert.equal(b.earning.empty, 'No money linked yet.');
});

test('the parked ask nothing unless something of theirs is due, and the finished are a count', () => {
  const b = boardOf(base({ renewals: [{ project: 'things#5', name: 'moss.example', day: '2026-11-20', href: '/r/services/9' }] }));
  assert.deepEqual(b.parked, [{ name: 'Moss', mark: '', hue: null, href: '/p/moss', due: 'moss.example renews 20 Nov' }]);
  assert.deepEqual(b.finished, { count: 1, names: ['Fern'] });
  assert.equal(b.week.renewals.count, 1);
  assert.equal(b.headline.includes('moss.example renews in 24 days'), true);
});

test('a feed is quiet once every measure is past twice its cadence and the newest is a week old', () => {
  assert.deepEqual(feedAgeOf([{ newest: '2026-10-24', every: 1 }], TODAY), { newest: '2026-10-24', age: 3, quiet: false });
  assert.deepEqual(feedAgeOf([{ newest: '2026-10-19', every: 1 }], TODAY), { newest: '2026-10-19', age: 8, quiet: true });
  assert.deepEqual(feedAgeOf([{ newest: '2026-09-30', every: 31 }], TODAY), { newest: '2026-09-30', age: 27, quiet: false });
  /* ONE MEASURE STILL ARRIVING KEEPS THE FEED ALIVE. */
  assert.equal(feedAgeOf([{ newest: '2026-08-01', every: 31 }, { newest: '2026-10-26', every: 1 }], TODAY).quiet, false);
  assert.deepEqual(feedAgeOf([], TODAY), { newest: null, age: 0, quiet: false });
});

test('how old the numbers are is the feed\'s newest reading, not the key number it leads with (live check of 30 October, 2)', () => {
  const kpi = { project: 'things#1', name: 'Revenue by month', figure: '$3,926', money: { minor: 392_565, currency: 'USD' }, every: '1m', latestAt: '2026-08-01', points: [], move: null, stale: null, aim: null, readings: 11 };
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 7, 30 + i)).toISOString().slice(0, 10));
  const b = boardOf(base({ kpis: [kpi], readings: days.map((at) => ({ project: 'things#1', name: 'Players a day', at })) }));
  assert.match(b.lede ?? '', /Kiln has sent no numbers for 29 days\./u);
  assert.equal(b.week.quiet.said, 'since 28 Sep');
  assert.deepEqual(b.week.quiet.lines[0], { day: null, project: 'Kiln', text: 'Revenue by month, 87 days old', href: '/p/kiln' });
  /* AND THE FIGURE ITSELF SAYS ITS OWN AGE: August's revenue is 87 days old, and not added into the month. */
  const row = b.groups[0]!.rows[0]!;
  assert.equal(row.number.kind === 'kpi' && row.number.sub, '87 days old');
  assert.equal(b.earning.count, 1);
  assert.equal(b.earning.lines[0]!.left, true);
});

test('the headline counts every project with work due this week, a late one too, as the This week tile does', () => {
  const b = boardOf(
    base({
      tasks: [
        { seq: 10, project: 'things#1', title: 'Check the door on two phones', by: '2026-10-26', href: '/r/tasks/10' },
        { seq: 11, project: 'things#1', title: 'Send the draft', by: '2026-10-29', href: '/r/tasks/11' },
        { seq: 12, project: 'things#3', title: 'Deploy the first wave', by: '2026-10-28', href: '/r/tasks/12' },
      ],
    }),
  );
  /* Kiln is late and has work due; Lantern and Portage have work due. */
  assert.equal(b.week.due.said, 'across 3 projects');
  assert.match(b.headline, /three projects have work due this week/u);
});

test('THE GROUPS SAY THE RECORD’S OWN LANE WORDS: Personal’s Active, never Building over them', () => {
  const said = boardOf(base({ laneLabels: { building: 'Active', earning: 'Ongoing', parked: 'On hold', retired: 'Finished' } }));
  assert.ok(said.groups.every((g) => !/^(?:Building|Earning)/u.test(g.name)));
  assert.equal(said.groups.find((g) => g.id === 'moving')?.name, 'Active');
  assert.equal(said.groups.find((g) => g.id === 'quiet')?.name, 'Active, quiet');
  assert.deepEqual(said.said, { earning: 'Ongoing', parked: 'On hold', finished: 'Finished' });
  assert.match(said.date, / · 1 on hold · 1 finished$/u, 'the date line counts in the same words');
  const plain = boardOf(base());
  assert.equal(plain.groups.find((g) => g.id === 'moving')?.name, 'Building');
  assert.deepEqual(plain.said, { earning: 'Earning', parked: 'Parked', finished: 'Closed' });
  assert.match(plain.date, / · 1 parked · 1 closed$/u);
});
