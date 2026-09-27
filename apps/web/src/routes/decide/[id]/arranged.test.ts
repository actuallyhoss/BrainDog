/**
 * What a `pack`, `settings` or `arrange` proposal says on Decide, read from the body the record files, and what an
 * accepted one says it did, whole or in part.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appliedLines, arrangedOf, callOf, partialOf } from './arranged.ts';
import { labelSetting } from '../../../lib/voice.ts';

const STUDENT = {
  usecase: 'student',
  why: ['They added four assignments this week.', { text: 'Two courses start on Monday.', at: 'courses#2' }],
  packs: { install: ['portfolio', 'usecase-student'], disable: ['money-core'] },
  plan: [
    { pack: 'portfolio', version: '1.0.0', adds: ['register.things', 'page.projects'] },
    { pack: 'usecase-student', version: '1.0.0', adds: ['register.courses', 'register.assignments', 'page.studies', 'metric.due-this-week'], examples: 6 },
  ],
  approve: ['CALLS OUT calendar.example · every 1h · grant "Timetable feed"'],
  pages: [{ id: 'page.home-student', kind: 'page', body: { title: 'Today', nav: { section: 'Studies', order: 1 }, blocks: [{ kind: 'table', heading: 'Due this week' }] }, was: 2 }],
  settings: [{ pack: 'usecase-student', values: { voice_home: 'Today', label_things__lane__earning: 'Handed in' }, before: { voice_home: 'Today', label_things__lane__earning: '' } }],
};

test('an arrangement reads as one story, in the order a person asks it', () => {
  const out = arrangedOf('arrange', STUDENT, { pagesNow: { 'page.home-student': { title: 'Home', blocks: [{ kind: 'stat', heading: 'Right now' }] } } });
  assert.ok(out);
  assert.equal(out.lead, 'Sets this BrainDog up for Student');
  assert.deepEqual(out.parts.map((p) => p.part), ['why', 'calls', 'packs', 'appears', 'words']);
  const [why, calls, packs, appears, words] = out.parts;
  assert.deepEqual(why?.part === 'why' && why.lines[1], { text: 'Two courses start on Monday.', at: 'courses#2' });
  assert.deepEqual(calls?.part === 'calls' && calls.calls, [{ host: 'calendar.example', detail: 'every hour, with the key “Timetable feed”' }]);
  assert.deepEqual(packs?.part === 'packs' && packs.lines, ['Installs Portfolio, then Student', 'Turns off Money']);
  assert.ok(appears?.part === 'appears');
  assert.equal(appears.examples, 6);
  /* The changed page first, then pages, then lists, then the rest. */
  assert.deepEqual(
    appears.appears.map((a) => `${a.kind}: ${a.title}`),
    ['Changed page: Today', 'Also adds: '],
  );
  assert.deepEqual(appears.appears.at(-1)?.lines, [
    { label: 'Pages', value: 'Projects, Studies' },
    { label: 'Lists', value: 'Things, Courses, Assignments' },
    { label: 'Measures', value: 'Due this week' },
  ]);
  assert.deepEqual(appears.appears[0]?.lines, [
    { label: 'In the sidebar', value: 'Under Studies' },
    { label: 'Shows now', value: 'Right now' },
    { label: 'Will show', value: 'Due this week' },
  ]);
  /* A pack this same proposal installs is not on yet, so the sentence starts from the house word. */
  assert.deepEqual(words?.part === 'words' && words.lines, ['Home will be called “Today”', 'In Things, “Earning” will be called “Handed in”']);
  assert.equal(out.summary, '2 new pages, 3 new lists, 2 more changes, 2 words change');
});

test('a settings change says each word before and after, from what the record holds now', () => {
  const out = arrangedOf(
    'settings',
    { pack: 'usecase-team', values: { voice_needs_you: 'On your plate', label_tickets: 'Issues', label_tickets__state: 'Stage', week_starts: 'monday' }, before: { voice_needs_you: 'Waiting on you', label_tickets: '', week_starts: 'sunday' } },
    { lists: new Map([['tickets', 'Tickets']]) },
  );
  assert.equal(out?.lead, 'Changes the words and settings of Team board');
  assert.deepEqual(
    out?.parts.map((p) => ('lines' in p ? p.lines : [])),
    [
      ['“Waiting on you” will read “On your plate”', 'The list Tickets will be called “Issues”', 'In Tickets, State will be called “Stage”'],
      ['Team board: Week starts will be monday, where it is sunday now'],
    ],
  );
});

test('a pack turned off names the lists that leave the sidebar, and one installed with its document shows where its page lands', () => {
  const off = arrangedOf('pack', { disable: 'money-core', registers: ['obligations', 'ledger'] }, { lists: new Map([['obligations', 'Bills']]) });
  assert.equal(off?.lead, 'Turns Money off');
  assert.deepEqual(off?.parts, [{ part: 'packs', lines: ['Bills and Ledger leave the sidebar. The rows are kept.'] }]);

  const on = arrangedOf('pack', {
    install: 'work',
    kind: 'pack',
    title: 'work',
    packs: { install: ['work'] },
    plan: [{ pack: 'work', version: '1.0.0', adds: ['register.tasks', 'page.work'] }],
    approve: [],
    doc: { pack: 'work', declarations: [{ register: 'tasks', name: 'Tasks' }, { page: 'work', title: 'Work', nav: { section: 'Work' }, blocks: [{ kind: 'table', heading: 'Open tasks' }] }] },
  });
  assert.equal(on?.lead, 'Adds Work');
  const appears = on?.parts.find((p) => p.part === 'appears');
  assert.deepEqual(appears?.part === 'appears' && appears.appears[0], {
    kind: 'New page',
    title: 'Work',
    lines: [
      { label: 'In the sidebar', value: 'Under Work' },
      { label: 'Shows', value: 'Open tasks' },
    ],
  });
});

test('every other kind is not this drawing’s', () => {
  assert.equal(arrangedOf('change', {}), null);
  assert.equal(arrangedOf('rowset', {}), null);
});

test('a line that is not a CALLS OUT line is kept whole', () => {
  assert.deepEqual(callOf('pull-x runs for the project kiln and sends the key "K".'), { host: '', detail: 'pull-x runs for the project kiln and sends the key "K".' });
  assert.deepEqual(callOf('CALLS OUT api.example · when a rule runs it, at most 100 a day · grant "none" · sends amount, due'), {
    host: 'api.example',
    detail: 'when a rule runs it, at most 100 a day, with no key, sends amount, due',
  });
});

test('what was applied is said plainly, with what is new in the sidebar', () => {
  assert.deepEqual(appliedLines({ installed: ['portfolio', 'usecase-student'], pages: ['page.home-student'], settings: ['usecase-student'] }, STUDENT, ['Studies']), [
    'Installed Portfolio and Student',
    'Put in place the page Today',
    'Changed the words and settings of Student',
    'New in the sidebar: Studies',
  ]);
  assert.deepEqual(appliedLines({}, {}), ['Everything it asked for was already in place.']);
});

test('a partial apply says what was done, what was not, and why it stopped', () => {
  const fix = 'usecase-student now calls out something this proposal did not show: CALLS OUT x. Propose it again. Already applied, and kept: portfolio.';
  assert.deepEqual(partialOf('arrange', STUDENT, fix), {
    why: 'usecase-student now calls out something this proposal did not show: CALLS OUT x. Propose it again.',
    done: ['Portfolio'],
    left: ['Student', 'Money', 'the page Today', 'the words and settings of Student'],
  });
  assert.equal(partialOf('arrange', STUDENT, 'Nothing landed.'), null);
});

test('A USE CASE BESIDE THE ONE SPEAKING IS SAID, and in the same voice', () => {
  const out = arrangedOf('arrange', { usecase: 'personal', alongside: ['student'], why: ['Money and coursework.'], packs: { install: ['money-core', 'usecase-personal', 'usecase-student'] } });
  const packs = out?.parts.find((p) => p.part === 'packs');
  assert.ok(packs?.part === 'packs');
  assert.ok(packs.lines.includes('Adds Student beside it, in the same voice'), JSON.stringify(packs.lines));
});

test('a long label is said by the title filed with it, and never by its hashed setting name', () => {
  const hashed = labelSetting('obligations.category.client_work');
  const out = arrangedOf(
    'settings',
    { pack: 'usecase-personal', values: { [hashed]: 'Pay', lk_deadbeef: 'Old' }, before: { [hashed]: '' }, titles: { [hashed]: 'Label: obligations, category, client work' } },
    { lists: new Map([['obligations', 'Bills']]) },
  );
  assert.deepEqual(
    out?.parts.map((p) => ('lines' in p ? p.lines : [])),
    [['In Bills, “Client work” will be called “Pay”'], ['Personal: A label will be Old']],
  );
});

test('AN UPDATE IS SAID AS ONE, with the versions it goes from and to, before and after it is accepted', () => {
  const body = {
    install: 'usecase-personal',
    kind: 'usecase',
    title: 'Personal',
    packs: { install: ['usecase-personal'] },
    plan: [{ pack: 'usecase-personal', from: '1.0.0', version: '1.2.0', adds: ['register.goal_log'], changes: ['register.goals'] }],
    approve: [],
  };
  const out = arrangedOf('pack', body);
  assert.equal(out?.lead, 'Updates Personal from 1.0.0 to 1.2.0');
  const beside = arrangedOf('pack', { ...body, plan: [{ pack: 'usecase-personal', version: '1.2.0', adds: [] }], keeps: 'usecase-student' });
  assert.deepEqual(beside?.parts.find((p) => p.part === 'packs'), { part: 'packs', lines: ['Student keeps its voice and Home'] });
  assert.equal(out?.parts.some((p) => p.part === 'packs'), false, 'the update was said twice');
  assert.deepEqual(appliedLines({ installed: ['usecase-personal'] }, body), ['Updated Personal from 1.0.0 to 1.2.0']);

  const arranged = arrangedOf('arrange', {
    usecase: 'student',
    why: ['A newer Personal.'],
    packs: { install: ['usecase-student', 'usecase-personal'] },
    plan: [
      { pack: 'usecase-student', version: '1.1.0', adds: ['register.courses'] },
      { pack: 'usecase-personal', from: '1.0.0', version: '1.2.0', adds: ['register.goal_log'] },
    ],
  });
  const packs = arranged?.parts.find((p) => p.part === 'packs');
  assert.deepEqual(packs?.part === 'packs' && packs.lines, ['Installs Student', 'Updates Personal from 1.0.0 to 1.2.0']);
});

test('a first-party module and rule are named as a person knows them, never from their ids', () => {
  const body = { install: 'money-core', plan: [{ pack: 'money-core', version: '1.0.0', adds: ['register.obligations', 'rule.invoice-late', 'rule.cash-stale'] }] };
  const out = arrangedOf('pack', body);
  assert.equal(out?.lead, 'Adds Money');
  const appears = out?.parts.find((p) => p.part === 'appears');
  const said = JSON.stringify(appears);
  assert.match(said, /Chase late payments/u);
  assert.match(said, /Keep balances current/u);
  assert.doesNotMatch(said, /invoice|Invoice late|cash-stale/u);
  assert.equal(arrangedOf('arrange', { usecase: 'founder', alongside: ['usecase-student'] })?.lead, 'Sets this BrainDog up for Solo founder');
});

test('an update of a module under a use case already at its version is said as that update', () => {
  const body = { install: 'usecase-study', kind: 'usecase', title: 'Study', packs: { install: ['money-core'] }, plan: [{ pack: 'money-core', from: '1.0.0', version: '1.1.0', adds: [] }] };
  const out = arrangedOf('pack', body);
  assert.equal(out?.lead, 'Updates Money from 1.0.0 to 1.1.0');
  assert.deepEqual(appliedLines({ installed: ['money-core'] }, body), ['Updated Money from 1.0.0 to 1.1.0']);
});

test('LISTS AND PAGES ARE NAMED AS THE RAIL NAMES THEM: the names the record filed, then the labels the record gives now', () => {
  const body = {
    install: 'usecase-personal',
    kind: 'usecase',
    title: 'Personal',
    packs: { install: ['portfolio', 'usecase-personal'] },
    plan: [
      { pack: 'portfolio', version: '1.0.0', adds: ['register.things'] },
      { pack: 'usecase-personal', version: '1.2.0', adds: ['page.home-personal', 'page.spending', 'register.goals'] },
    ],
    names: { 'register.things': 'Projects', 'page.home-personal': 'Day to day' },
  };
  const out = arrangedOf('pack', body, { lists: new Map([['things', 'Things'], ['goals', 'Goals']]) });
  const appears = out?.parts.find((p) => p.part === 'appears');
  assert.deepEqual(appears?.part === 'appears' && appears.appears.at(-1)?.lines, [
    { label: 'Pages', value: 'Day to day, Spending' },
    { label: 'Lists', value: 'Projects, Goals' },
  ]);
  assert.doesNotMatch(JSON.stringify(out), /Home personal|Things/u);

  /* A BODY FILED BEFORE THE NAMES WERE reads the record's labels now, as the rail does. */
  const older = arrangedOf('pack', { ...body, names: undefined }, { lists: new Map([['things', 'Things']]), labels: { things: 'Projects' } });
  assert.match(JSON.stringify(older), /Projects/u);
  assert.doesNotMatch(JSON.stringify(older), /Things/u);
});

test('AN UPDATE THAT ONLY CHANGES draws what changes under Changes, and no Adds heading over nothing', () => {
  const out = arrangedOf('pack', {
    install: 'money-core',
    packs: { install: ['money-core'] },
    plan: [{ pack: 'money-core', from: '0.9.0', version: '1.0.0', adds: [], changes: ['register.obligations', 'page.money'] }],
    names: { 'register.obligations': 'Bills', 'page.money': 'Money' },
  });
  const appears = out?.parts.find((p) => p.part === 'appears');
  assert.ok(appears?.part === 'appears');
  assert.deepEqual(
    appears.appears.map((a) => a.kind),
    ['Changes'],
  );
  assert.deepEqual(appears.appears[0]?.lines, [
    { label: 'Pages', value: 'Money' },
    { label: 'Lists', value: 'Bills' },
  ]);
});

test('A CHANGED PAGE READS FROM ITS LISTS BY THE RAIL’S NAMES, and a module whose catalogue title is its id is named as the module', () => {
  const out = arrangedOf('pack', {
    install: 'money-core',
    kind: 'pack',
    title: 'money-core',
    packs: { install: ['money-core'] },
    plan: [{ pack: 'money-core', from: '1.0.0', version: '1.0.1', adds: [], changes: ['page.money'] }],
    names: { 'register.obligations': 'Bills' },
    doc: { pack: 'money-core', declarations: [{ page: 'money', title: 'Overview', nav: { section: 'Money' }, requires: ['register.obligations', 'register.accounts'], blocks: [{ kind: 'stat', heading: 'Right now' }] }] },
  }, { lists: new Map([['obligations', 'Obligations'], ['accounts', 'Accounts']]) });
  assert.equal(out?.lead, 'Updates Money from 1.0.0 to 1.0.1');
  const appears = out?.parts.find((p) => p.part === 'appears');
  assert.deepEqual(appears?.part === 'appears' && appears.appears[0]?.lines.find((l) => l.label === 'Reads from'), { label: 'Reads from', value: 'Bills, Accounts' });
});

test('A BLOCK THAT READS A USE CASE’S WORDS FROM ITS SETTINGS SAYS THE WORDS, never {{config:…}}', () => {
  const out = arrangedOf('pack', {
    install: 'usecase-study',
    kind: 'usecase',
    title: 'Term time',
    packs: { install: ['usecase-study'] },
    plan: [{ pack: 'usecase-study', version: '1.2.1', adds: ['page.home-study'] }],
    doc: {
      pack: 'usecase-study',
      config: { voice_needs_you: { type: 'text', label: 'Voice: needs you', default: 'Coming up' } },
      declarations: [{ page: 'home-study', title: 'Today', blocks: [{ kind: 'table', heading: '{{config:voice_needs_you}}' }, { kind: 'table', heading: '{{config:voice_gone}}' }, { kind: 'table', heading: 'Sessions' }] }],
    },
  });
  assert.equal(out?.lead, 'Sets this BrainDog up for Term time');
  const said = JSON.stringify(out);
  assert.doesNotMatch(said, /\{\{config:/u);
  const appears = out?.parts.find((p) => p.part === 'appears');
  assert.deepEqual(appears?.part === 'appears' && appears.appears[0]?.lines.find((l) => l.label === 'Shows'), { label: 'Shows', value: 'Coming up, Table, Sessions' });
});

test('WHAT AN UPDATE TAKES AWAY is said on its own, with the rows each list keeps', () => {
  const body = {
    install: 'usecase-club',
    kind: 'usecase',
    title: 'Reading club',
    packs: { install: ['usecase-club'] },
    names: { 'register.meetings': 'Meetings' },
    plan: [{ pack: 'usecase-club', from: '1.0.0', version: '2.0.0', adds: [], retires: [{ id: 'register.meetings', rows: 3 }, { id: 'page.club', rows: 0 }] }],
    approve: [],
  };
  const appears = arrangedOf('pack', body)?.parts.find((p) => p.part === 'appears');
  const said = JSON.stringify(appears);
  assert.match(said, /Takes away/u);
  assert.match(said, /Meetings, whose 3 rows stay/u);
  assert.doesNotMatch(said, /"Adds"/u);
});

test('A PLAN OF ROWS reads list by list, each row with the row it belongs with, counted on the queue and said once accepted', () => {
  const body = {
    why: ['Drafted by Slash from what you said the project is.'],
    packs: {},
    rows: [
      { register: 'milestones', fields: { what: 'Say what the show is about', stage: 'idea', state: 'underway', order: 1 } },
      { register: 'milestones', fields: { what: 'Record a pilot', stage: 'build', state: 'not_started', order: 2 } },
      { register: 'steps', fields: { what: 'Write one sentence', state: 'to_do', order: 1 }, links: { milestone: 0 } },
      { register: 'choices', fields: { question: 'Alone or with a co-host?', state: 'open' } },
    ],
  };
  const out = arrangedOf('arrange', body, { lists: new Map([['milestones', 'Milestones'], ['steps', 'Steps'], ['choices', 'Choices']]) });
  assert.ok(out);
  assert.equal(out.lead, 'Rearranges this BrainDog');
  assert.deepEqual(out.parts.map((p) => p.part), ['why', 'rows']);
  const rows = out.parts[1] as Extract<(typeof out.parts)[number], { part: 'rows' }>;
  assert.deepEqual(rows.lists, [
    { name: 'Milestones', lines: ['Say what the show is about', 'Record a pilot'] },
    { name: 'Steps', lines: ['Write one sentence, for “Say what the show is about”'] },
    { name: 'Choices', lines: ['Alone or with a co-host?'] },
  ]);
  assert.equal(out.summary, '4 new rows');
  assert.deepEqual(appliedLines({ rows: ['milestones#1', 'milestones#2', 'steps#1', 'choices#1'] }, body), ['Added 4 rows']);
});

/*
 * A DECLARATION AN UPDATE HANDS TO ANOTHER PACK IS NOT TAKEN AWAY. The record files it with `to` (`arrange.ts`), and this
 * read every retire alike, so the HSBC door money-core hands to `bank-hsbc-eg`, still live and answering the owner's
 * Shortcut, was listed under "Takes away" (`loop/research-batch-thirty-four-audit.md` §8, the presenter's last half).
 */
test('A DECLARATION HANDED TO ANOTHER PACK GETS ITS OWN LINE, naming the pack, and is not said as taken away', () => {
  const body = {
    install: 'money-core',
    packs: { install: ['money-core'] },
    plan: [
      {
        pack: 'money-core',
        from: '1.7.0',
        version: '1.8.0',
        adds: [],
        retires: [
          { id: 'ingest.bank-ipn-in-sms', rows: 0, to: 'bank-hsbc-eg', to_name: 'HSBC Egypt' },
          { id: 'ingest.bank-hsbc-eg-card', rows: 0 },
        ],
      },
    ],
    approve: [],
  };
  const appears = arrangedOf('pack', body)?.parts.find((p) => p.part === 'appears');
  assert.ok(appears?.part === 'appears');
  const lines = appears.appears.map((a) => `${a.kind}: ${a.title}${a.lines.map((l) => ` | ${l.label}: ${l.value}`).join('')}`);
  assert.equal(lines.filter((l) => l.includes('HSBC Egypt')).length, 1, lines.join('\n'));
  assert.match(lines.find((l) => l.includes('HSBC Egypt'))!, /moves to HSBC Egypt, which is not installed; it keeps working until you remove it/u);
  const away = lines.find((l) => l.startsWith('Takes away'));
  assert.ok(away, lines.join('\n'));
  assert.doesNotMatch(away, /ipn in sms/iu, 'the handed door was said as taken away');
  assert.match(away, /card/iu);
});
