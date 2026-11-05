/**
 * What a project's page says: a headline that is a fact and never the next step, the next step once as a checklist, the
 * tile beside the hero by lane, its numbers with their age, its dates, what it runs on, its sessions and what happened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checklistOf, datesOf, editsSaid, happenedOf, heroFactsOf, numbersOf, runSaid, runsOnOf, sessionsOf, sideOf, stripName, type FactTask, type FactsIn } from './project-facts.ts';

const NOW = Date.UTC(2026, 9, 27, 10);
const TODAY = '2026-10-27';
const fmt = (minor: number, currency: string) => `${currency === 'USD' ? '$' : `${currency} `}${(minor / 100).toLocaleString('en-US')}`;

const task = (seq: number, title: string, more: Partial<FactTask> = {}): FactTask => ({
  seq,
  title,
  state: 'open',
  by: null,
  doneOn: null,
  agent: '',
  done: false,
  waits: false,
  href: `/r/tasks/${seq}`,
  updated: null,
  created: null,
  ...more,
});

const base = (more: Partial<FactsIn> = {}): FactsIn => ({
  name: 'Lantern',
  lane: 'building',
  next: 'Answer Lena and pick the feedback asks.',
  about: 'A daily drawing game',
  since: null,
  domains: [],
  tasks: [],
  runs: [],
  services: [],
  readings: [],
  recurring: [],
  kpis: [],
  decided: [],
  history: [],
  money: { out: null, owed: null },
  now: NOW,
  today: TODAY,
  format: fmt,
  hrefs: { feed: '/feed', work: '/r/tasks?lantern' },
  called: { one: 'task', many: 'tasks' },
  ...more,
});

/** Daily readings of one measure, the last on `last`. */
const daily = (name: string, last: string, n: number, from = 100) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${last}T09:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString();
    return { name, value: from + i, amount: null, unit: '', at: d, source: 'import' };
  });

test('a measure loses the project name on its own page', () => {
  assert.equal(stripName('Players a day, Lantern', 'Lantern'), 'Players a day');
  assert.equal(stripName('Lantern: servers', 'Lantern'), 'servers');
  assert.equal(stripName('Lantern', 'Lantern'), 'Lantern');
});

test('the next step is a checklist once, late days red, and a job that is a task opens it', () => {
  const items = checklistOf('Deploy the first wave by 26 Oct, then the second wave (31 Oct)', [task(4, 'The second wave')], NOW, TODAY);
  assert.deepEqual(items, [
    { text: 'Deploy the first wave', chip: 'due 26 Oct', late: true, href: null },
    { text: 'The second wave', chip: 'Sat 31 Oct', late: false, href: '/r/tasks/4' },
  ]);
});

test('numbers stopped: the banner says so once, every cell is stale, and the headline says it, never the next step', () => {
  const readings = [...daily('Players a day, Lantern', '2026-09-28', 30), ...daily('Accounts', '2026-09-28', 30, 2000)];
  const n = numbersOf(base({ readings }));
  assert.deepEqual(n.banner, { said: 'Nothing has arrived for 29 days.', why: 'Every reading came from an import, and that stopped on 28 Sep.' });
  assert.deepEqual(
    n.cells.map((c) => [c.label, c.figure, c.stale]),
    [
      ['Players a day', '129', true],
      ['Accounts', '2,029', true],
    ],
  );
  assert.equal(n.cadence, 'Daily, last 28 Sep');
  assert.match(n.cells[0]!.sub, /^up 29 since/u);
  const hero = heroFactsOf(base({ readings }), n);
  assert.equal(hero.headline, 'No numbers have come from Lantern since 28 Sep.');
  /* THE FEED'S FIX IS THE QUIET BUTTON (Q32 of 29 October), and red is kept for late work. */
  assert.equal(hero.red, null);
  assert.deepEqual(hero.soft, { said: 'Fix the numbers feed', href: '/feed' });
});

test('late work leads the headline and the red button opens it', () => {
  const f = base({ tasks: [task(1, 'Deploy the first wave', { by: '2026-10-26' }), task(2, 'Ship the second', { by: '2026-10-31' })] });
  const hero = heroFactsOf(f, numbersOf(f));
  assert.equal(hero.headline, '“Deploy the first wave” was due Mon 26 Oct and is a day late.');
  assert.match(hero.lede ?? '', /“Ship the second” is due Sat 31 Oct\./u);
  assert.deepEqual(hero.red, { said: 'Open the late task', href: '/r/tasks/1' });
  assert.deepEqual(hero.soft, { said: 'Open all 2 tasks', href: '/r/tasks?lantern' });
});

test('an earning project leads with what it brought in, and its side tile is money', () => {
  const kpis = [
    {
      name: 'Revenue by month',
      measure: 'Revenue by month',
      unit: 'USD',
      every: '1m',
      headline: true,
      points: [
        { at: '2026-08-31', amount: 'USD 3,926.00' },
        { at: '2026-09-30', amount: 'USD 4,815.00' },
      ],
      latest: { at: '2026-09-30', amount: 'USD 4,815.00' },
      change: 0.23,
      target: null,
      targetBy: null,
    },
  ];
  const f = base({ lane: 'earning', kpis, money: { out: { minor: 120_600, currency: 'USD' }, owed: null } });
  const n = numbersOf(f);
  assert.equal(heroFactsOf(f, n).headline, 'Lantern brought in $4,815 in September, 23% more than August.');
  const side = sideOf(f, n);
  assert.equal(side.kind, 'money');
  if (side.kind === 'money') {
    assert.equal(side.figure, '$4,815');
    assert.equal(side.sub, 'in Sep');
    assert.deepEqual(side.lines, [
      { k: 'Out this month', v: '$1,206' },
      { k: 'Kept', v: 'about $3,609' },
    ]);
  }
});

test('an earning project with repeating money and no money key number leads with it a month, with it a line under one', () => {
  const recurring = [{ what: 'Store payout', direction: 'in', amount: { minor: 93_000, currency: 'USD' }, every: 'monthly', nextDue: '2026-11-15', state: 'live' }];
  const alone = sideOf(base({ lane: 'earning', recurring }), numbersOf(base()));
  assert.equal(alone.kind === 'money' && `${alone.figure} ${alone.sub}`, '$930 a month');
  const kpis = [{ name: 'Revenue', measure: 'Revenue', unit: 'USD', every: '1m', headline: true, points: [{ at: '2026-09-30', amount: 'USD 2,300.00' }], latest: { at: '2026-09-30', amount: 'USD 2,300.00' }, change: null, target: null, targetBy: null }];
  const both = sideOf(base({ lane: 'earning', recurring, kpis }), numbersOf(base()));
  assert.equal(both.kind === 'money' && both.figure, '$2,300');
  assert.deepEqual(both.kind === 'money' && both.lines.map((l) => l.k), ['Next pay', 'Store payout']);
});

test('a building project draws its dated path; with none it says how to start one', () => {
  const f = base({
    tasks: [task(1, 'Wave one', { by: '2026-10-26' }), task(2, 'Wave two', { by: '2026-10-31', agent: 'claude' }), task(3, 'Your sitting', { by: '2026-11-02', waits: true }), task(4, 'Wave zero', { by: '2026-10-20', done: true, doneOn: '2026-10-19' })],
  });
  const side = sideOf(f, numbersOf(f));
  assert.equal(side.kind, 'path');
  if (side.kind === 'path')
    assert.deepEqual(
      side.stops.map((s) => [s.day, s.title, s.tone, s.sub]),
      [
        ['19 Oct', 'Wave zero', 'done', 'done'],
        ['26 Oct', 'Wave one', 'late', 'a day late'],
        ['31 Oct', 'Wave two', 'doing', 'Claude has it'],
        ['2 Nov', 'Your sitting', 'you', 'waits on you'],
      ],
    );
  const empty = sideOf(base(), numbersOf(base()));
  assert.equal(empty.kind === 'path' && empty.empty?.startsWith('No task on Lantern has a day yet'), true);
});

test('a parked project says what it costs to keep', () => {
  const services = [
    { seq: 1, name: 'lantern.example', provider: 'Cove', kind: 'domain', renews: '2027-06-29', cost: { minor: 1_400, currency: 'USD' }, cycle: 'yearly', state: 'live', note: '', href: '/r/services/1' },
    { seq: 2, name: 'Old CI', provider: 'Hob', kind: 'saas', renews: null, cost: { minor: 2_900, currency: 'USD' }, cycle: 'monthly', state: 'cancelled', note: '', href: '/r/services/2' },
  ];
  const side = sideOf(base({ lane: 'parked', services }), numbersOf(base()));
  assert.equal(side.kind, 'keep');
  if (side.kind === 'keep') {
    assert.deepEqual(side.lines, [{ k: 'lantern.example · Cove', v: 'renews 29 Jun 2027', href: '/r/services/1' }]);
    assert.equal(side.year, '$14 a year to keep');
    assert.equal(side.domain?.name, 'lantern.example');
  }
});

test('dates put the late first, then tasks, next-step days and renewals in order', () => {
  const f = base({
    next: 'Apply to the fund (30 Oct)',
    tasks: [task(1, 'Wave one', { by: '2026-10-26' }), task(2, 'Wave two', { by: '2026-11-09' })],
    services: [{ seq: 1, name: 'lantern.example', provider: '', kind: 'domain', renews: '2026-11-25', cost: null, cycle: '', state: 'live', note: '', href: '/r/services/1' }],
  });
  assert.deepEqual(
    datesOf(f).map((d) => [d.day, d.text, d.tone]),
    [
      ['Mon 26 Oct', 'Wave one', 'late'],
      ['Fri 30 Oct', 'Apply to the fund', 'plain'],
      ['Mon 9 Nov', 'Wave two', 'plain'],
      ['Wed 25 Nov', 'lantern.example renews', 'plain'],
    ],
  );
  const lines = runsOnOf(f, numbersOf(base({ readings: daily('Players', '2026-09-28', 5) })));
  assert.deepEqual(
    lines.map((l) => [l.name, l.right, l.tone]),
    [
      ['lantern.example', 'renews 25 Nov', 'warn'],
      ['Numbers feed', 'quiet since 28 Sep', 'warn'],
    ],
  );
});

test('sessions say how each ended, and what happened folds the record edits into one line a day', () => {
  const runs = [
    { seq: 9, agent: 'claude', doing: 'Claude Code run', at: '2026-10-26T15:00:00Z', started: '2026-10-25T19:00:00Z', state: 'active', closedAs: '', next: 'Deploy from the other machine', notes: [], wrote: 3, repo: 'lantern' },
    { seq: 8, agent: 'claude', doing: 'Built the big round', at: '2026-10-22T19:00:00Z', started: '2026-10-21T22:00:00Z', state: 'done', closedAs: 'dropped', next: '', notes: [], wrote: null, repo: '' },
  ];
  assert.deepEqual(
    sessionsOf(base({ runs })).map((s) => [s.title, s.when, s.said, s.ended]),
    [
      ['Claude in lantern', '25 Oct to 26 Oct', 'Next: Deploy from the other machine', 'still open · 3 writes'],
      ['Built the big round', '21 Oct to 22 Oct', null, 'dropped'],
    ],
  );
  const history = [
    { note: 'Next step changed', by: 'Claude', at: '2026-10-25T08:00:00Z' },
    { note: 'Note rewritten', by: 'Claude', at: '2026-10-25T08:01:00Z' },
  ];
  const lines = happenedOf(base({ history }), numbersOf(base()));
  assert.deepEqual(lines, [{ at: '2026-10-25', day: '25 Oct', text: 'Its next step and note changed.', by: null, tone: 'plain', kind: 'edit' }]);
  /* A PLAN WRITTEN IN ONE SITTING IS ONE LINE, its first two tasks named. */
  const at = '2026-10-24T09:00:00Z';
  const tasks = ['Wave one', 'Wave two', 'Wave three', 'Wave four'].map((t, n) => task(n + 1, t, { created: at }));
  assert.deepEqual(
    happenedOf(base({ tasks }), numbersOf(base())).map((l) => l.text),
    ['4 tasks were added: Wave one, Wave two and 2 more.'],
  );
});

test('an edit never says a whole note: a long value is that the field changed, and several name their fields', () => {
  const page = `Cozy game.\n# Bake\n\n\`\`\`bar | Daily\n1 | 2\n\`\`\`\n${'more words '.repeat(40)}`;
  assert.equal(editsSaid([`Note from old to ${page}`]), 'Note changed.');
  assert.equal(editsSaid(['Status from open to shipped']), 'Status changed to shipped.');
  assert.equal(editsSaid([`Note from old to ${page}`, 'Status from open to shipped']), 'Its note and status changed.');
  assert.equal(editsSaid(['Note rewritten', 'Tidied the row']), '2 changes, including its note.');
  assert.equal(editsSaid(['', '']), null);
});

test('a run is said from when it was last heard: working, gone quiet, or how it ended (AG14)', () => {
  const run = (at: number, state: string) => ({ agent: 'claude', at: new Date(at).toISOString(), state, closedAs: '', next: '', notes: [] });
  assert.equal(runSaid(run(NOW - 5 * 60_000, 'active'), NOW), 'Claude is working on it now');
  assert.equal(runSaid(run(NOW - 2 * 3_600_000, 'active'), NOW), 'Claude went quiet 2h ago');
  assert.equal(runSaid(run(NOW - 2 * 3_600_000, 'idle'), NOW), 'Claude went quiet 2h ago');
  assert.equal(runSaid(run(NOW - 2 * 3_600_000, 'done'), NOW), 'Claude worked on it 2h ago, and the session stopped without a note');
});

test('an aim whose month has gone by says so and where it stands (AG24)', () => {
  const aimed = (targetBy: string) => [
    { name: 'Subscribers', measure: 'Subscribers', unit: '', every: '1w', headline: true, points: [{ at: '2026-10-20', value: 318 }], latest: { at: '2026-10-20', value: 318 }, change: null, target: 500, targetBy },
  ];
  const ahead = sideOf(base({ kpis: aimed('2026-12-01') }), numbersOf(base()));
  assert.equal(ahead.kind === 'path' && ahead.aim, 'Aim: 500 by Dec 2026');
  const gone = sideOf(base({ kpis: aimed('2026-08-01') }), numbersOf(base()));
  assert.equal(gone.kind === 'path' && gone.aim, 'Aimed for 500 by Aug; 318 now.');
});

test('a renewal day gone by reads lapsed, in the late tone (AG17)', () => {
  const services = [{ seq: 1, name: 'kilnfonts.example', provider: 'Nordhaven', kind: 'domain', renews: '2026-10-20', cost: null, cycle: 'yearly', state: 'live', note: '', href: '/r/services/1' }];
  const [line] = runsOnOf({ today: TODAY, format: fmt, services }, numbersOf(base()));
  assert.equal(line?.right, 'lapsed 20 Oct');
  assert.equal(line?.tone, 'bad');
});
