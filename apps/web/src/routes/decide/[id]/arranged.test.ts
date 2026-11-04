/**
 * What a `pack`, `settings` or `arrange` proposal says on Decide, read from the body the record files, and what an
 * accepted one says it did, whole or in part.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appliedLines, arrangedOf, callOf, heldOf, partialOf } from './arranged.ts';
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
  /* The key the feed opens is said once, under what it needs; the hourly call is a feed, under what it starts. */
  assert.deepEqual(out.parts.map((p) => p.part), ['why', 'needs', 'starts', 'packs', 'appears', 'words']);
  const [why, needs, starts, packs, appears, words] = out.parts;
  assert.deepEqual(why?.part === 'why' && why.lines[1], { text: 'Two courses start on Monday.', at: 'courses#2' });
  assert.deepEqual(needs?.part === 'needs' && needs.keys, [{ label: 'Timetable feed', opens: 'calendar.example', scheduled: true, held: null }]);
  assert.deepEqual(starts?.part === 'starts' && starts.feeds, [{ host: 'calendar.example', detail: 'every hour', every: 'every hour', keys: ['Timetable feed'], to: {} }]);
  assert.deepEqual(packs?.part === 'packs' && packs.lines, ['Installs Projects, then Student', 'Turns off Money']);
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
  /* The screen is already called Today, so the word the use case sets is no change and no sentence. */
  assert.deepEqual(words?.part === 'words' && words.lines, ['In Things, “Earning” will be called “Handed in”']);
  assert.equal(out.summary, '1 key, 1 feed, 2 new pages, 3 new lists, 2 more changes, 1 word changes');
  /* ON ITS OWN PAGE THE CHANGE IS ONE SENTENCE, and never a list of field names. */
  assert.equal(out.said, `${out.lead}, with 1 key, 1 feed, 2 new pages, 3 new lists, 2 more changes and 1 word changes.`);
});

test('a pack this same proposal installs is not on yet, so the sentence starts from the house word, and a word it already reads is no sentence', () => {
  const said = (word: string) =>
    arrangedOf('settings', { pack: 'usecase-student', values: { voice_home: word }, before: { voice_home: 'Dashboard' } }, {})?.parts.flatMap((p) => ('lines' in p ? p.lines.map((l) => (typeof l === 'string' ? l : l.text)) : []));
  assert.deepEqual(arrangedOf('arrange', { ...STUDENT, settings: [{ pack: 'usecase-student', values: { voice_home: 'Studies' }, before: { voice_home: 'Dashboard' } }] }, {})?.parts.find((p) => p.part === 'words'), { part: 'words', lines: ['Today will be called “Studies”'] });
  assert.deepEqual(said('Dashboard'), [], 'the word it already reads is said as a change');
  assert.deepEqual(said('Studies'), ['Dashboard will be called “Studies”']);
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
  assert.deepEqual(off?.parts, [{ part: 'packs', lines: ['Bills and Ledger leave the sidebar. What is in them is kept.'] }]);

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
  assert.deepEqual(callOf('pull-x runs for the project kiln and sends the key "K".'), { host: '', detail: 'pull-x runs for the project kiln and sends the key "K".', every: '', keys: [], to: {} });
  /* A CALL ONLY A RULE MAKES is not a feed: it has no cadence, and it stays under what it calls out. */
  assert.deepEqual(callOf('CALLS OUT api.example · when a rule runs it, at most 100 a day · grant "none" · sends amount, due'), {
    host: 'api.example',
    detail: 'when a rule runs it, at most 100 a day, sends amount, due',
    every: '',
    keys: [],
    to: {},
  });
});

test('what was applied is said plainly, with what is new in the sidebar', () => {
  assert.deepEqual(appliedLines({ installed: ['portfolio', 'usecase-student'], pages: ['page.home-student'], settings: ['usecase-student'] }, STUDENT, ['Studies']), [
    'Installed Projects and Student',
    'Put in place the page Today',
    'Changed the words and settings of Student',
    'New in the sidebar: Studies',
  ]);
  assert.deepEqual(appliedLines({}, {}), ['Everything it asked for was already in place.']);
});

test('what an update carried into a page he changed is said with the rest (RJ6)', () => {
  const line = 'Your Home page takes the update\'s new words where it still had the old ones: "Saved lately". What you wrote yourself stays.';
  assert.deepEqual(appliedLines({ said: [line] }, {}), [line]);
});

test('a partial apply says what was done, what was not, and why it stopped', () => {
  const fix = 'usecase-student now calls out something this proposal did not show: CALLS OUT x. Propose it again. Already applied, and kept: portfolio.';
  assert.deepEqual(partialOf('arrange', STUDENT, fix), {
    why: 'usecase-student now calls out something this proposal did not show: CALLS OUT x. Propose it again.',
    done: ['Projects'],
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
  assert.deepEqual(beside?.parts.find((p) => p.part === 'packs'), { part: 'packs', lines: ['Student keeps its voice and Today'] });
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
  assert.match(said, /Meetings, whose 3 items stay/u);
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
  assert.equal(out.summary, '4 additions');
  assert.deepEqual(appliedLines({ rows: ['milestones#1', 'milestones#2', 'steps#1', 'choices#1'] }, body), ['Added 4 to your lists']);
});

/*
 * A DECLARATION AN UPDATE HANDS TO ANOTHER PACK IS NOT TAKEN AWAY. The record files it with `to` (`arrange.ts`), and this
 * read every retire alike, so the HSBC door money-core hands to `bank-hsbc-eg`, still live and answering the owner's
 * Shortcut, was listed under "Takes away" by the presenter's last half.
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

/* ── the sitting: what it needs, what it changes, what it starts, your choices ── */

const SITTING = {
  why: ['Your money has stood still since the move.'],
  packs: { install: ['stripe'] },
  approve: [
    'CALLS OUT api.stripe.com · every 1d · grant "Stripe"',
    'CALLS OUT api.mercury.com · every 6h · grant "Mercury"',
    'CALLS OUT hooks.example · when a rule runs it, at most 100 a day · grant "Stripe" · sends amount',
    'CALLS OUT rates.example and fx.example · every 1d · key "Rates" to rates.example, "Stripe" to the host its Keychain entry opens',
  ],
  rows: [
    { register: 'accounts', at: 'accounts#2', version: 3, patch: { last4: '7731', kind: 'card' }, before: { name: 'Credit Card', last4: '', kind: 'card' } },
    { at: 'accounts#3', version: 1, patch: { last4: '1100' } },
    { register: 'accounts', at: 'accounts#4', version: 2, patch: { name: 'Savings', open: true }, before: { name: 'HSBC', open: false } },
    { register: 'books', fields: { name: 'Harbour' } },
  ],
  parts: [
    { id: 'p1', question: 'How often should rates arrive?', suggested: 'daily', options: [{ id: 'daily', label: 'Every day', does: 'One call a day' }, { id: 'hourly', label: 'Every hour' }] },
    { id: 'p2', title: 'Install Stripe' },
  ],
};

test('THE SITTING reads in the brief’s order after why, and the queue counts keys, updates and feeds first', () => {
  const ctx = { lists: new Map([['accounts', 'Accounts'], ['books', 'Books']]), labels: { 'accounts.last4': 'Last four digits', 'accounts.kind.card': 'Card' } };
  const out = arrangedOf('arrange', SITTING, ctx);
  assert.ok(out);
  assert.deepEqual(out.parts.map((p) => p.part), ['why', 'needs', 'changes', 'rows', 'starts', 'choices', 'calls', 'packs']);
  const needs = out.parts.find((p) => p.part === 'needs');
  assert.deepEqual(needs?.part === 'needs' && needs.keys.map((k) => [k.label, k.opens]), [
    ['Stripe', 'api.stripe.com'],
    ['Mercury', 'api.mercury.com'],
    /* A script's key is said with the one host it is sent to, never the script's "a and b". */
    ['Rates', 'rates.example'],
  ]);
  const starts = out.parts.find((p) => p.part === 'starts');
  assert.deepEqual(starts?.part === 'starts' && starts.feeds.map((f) => `${f.host}: ${f.detail}`), [
    'api.stripe.com: every day',
    'api.mercury.com: every 6 hours',
    'rates.example and fx.example: every day',
  ]);
  /* The rule's call stays a call, and no call line names its key. */
  const calls = out.parts.find((p) => p.part === 'calls');
  assert.deepEqual(calls?.part === 'calls' && calls.calls.map((c) => c.detail), ['when a rule runs it, at most 100 a day, sends amount']);
  assert.equal(JSON.stringify([starts, calls]).includes('with the key'), false);
  const choices = out.parts.find((p) => p.part === 'choices');
  assert.deepEqual(choices?.part === 'choices' && choices.choices, [
    { question: 'How often should rates arrive?', options: [{ name: 'Every day', line: 'One call a day', suggested: true }, { name: 'Every hour', line: '', suggested: false }] },
  ]);
  const rows = out.parts.find((p) => p.part === 'rows');
  assert.deepEqual(rows?.part === 'rows' && rows.lists, [{ name: 'Books', lines: ['Harbour'] }]);
  assert.equal(out.summary, '3 keys, 3 updates, 3 feeds, 1 addition');
});

test('WHAT IT CHANGES says each field before and after, by the list’s words, and never an address', () => {
  const ctx = { lists: new Map([['accounts', 'Accounts']]), labels: { 'accounts.last4': 'Last four digits', 'accounts.kind.card': 'Card' } };
  const changes = arrangedOf('arrange', SITTING, ctx)?.parts.find((p) => p.part === 'changes');
  assert.ok(changes?.part === 'changes');
  assert.equal(changes.count, 3);
  assert.deepEqual(changes.lists, [
    {
      name: 'Accounts',
      changes: [
        /* `kind` is the same before and after, so it is not said. */
        { title: 'Credit Card', fields: [{ field: 'Last four digits', before: 'empty', after: '7731' }] },
        /* No before was sent and the patch has no title: said by its list, never as accounts#3. */
        { title: 'One in Accounts', fields: [{ field: 'Last four digits', before: null, after: '1100' }] },
        { title: 'HSBC', fields: [{ field: 'Name', before: 'HSBC', after: 'Savings' }, { field: 'Open', before: 'no', after: 'yes' }] },
      ],
    },
  ]);
  assert.equal(/#\d/u.test(JSON.stringify(changes)), false, 'an address reached the page');
});

test('THE KEYS IT NEEDS come from the record’s `needs` when it sends them, each said held or not from the grants', () => {
  const held = heldOf([
    { id: 'g1', label: 'Stripe', sealed_under: 'connector', revoked_at: null },
    { id: 'g2', label: 'Mercury', sealed_under: 'record', revoked_at: null },
    { id: 'g3', label: 'Rates', sealed_under: 'connector', revoked_at: '2026-10-01T00:00:00Z' },
    { id: 'g4', label: 'Mercury', sealed_under: 'record', revoked_at: null },
  ]);
  assert.deepEqual([...held], [['Stripe', 'connector'], ['Mercury', 'person']]);
  const out = arrangedOf('arrange', { ...SITTING, needs: [{ label: 'Stripe', opens: 'api.stripe.com', scheduled: true }, { label: 'Mercury', opens: 'api.mercury.com' }, 'Rates', { label: 'Mine', scheduled: false }] }, { held });
  const needs = out?.parts.find((p) => p.part === 'needs');
  assert.deepEqual(needs?.part === 'needs' && needs.keys, [
    { label: 'Stripe', opens: 'api.stripe.com', scheduled: true, held: 'connector' },
    { label: 'Mercury', opens: 'api.mercury.com', scheduled: true, held: 'person' },
    { label: 'Rates', opens: '', scheduled: true, held: 'none' },
    { label: 'Mine', opens: '', scheduled: false, held: 'none' },
  ]);
  assert.equal(out?.summary.startsWith('4 keys, '), true);
  assert.deepEqual(heldOf(null), new Map());
});

test('a call that names no host is said as one, and a script with no key needs none', () => {
  assert.deepEqual(callOf('CALLS OUT no host declared · every 1h · grant "K"'), { host: 'A service it does not name', detail: 'every hour', every: 'every hour', keys: ['K'], to: {} });
  assert.deepEqual(callOf('CALLS OUT a.example · daily at 08:00 Europe/London · no key'), { host: 'a.example', detail: 'daily at 08:00 Europe/London', every: 'daily at 08:00 Europe/London', keys: [], to: {} });
  const out = arrangedOf('arrange', { approve: ['CALLS OUT no host declared · every 1h · grant "K"'] });
  const needs = out?.parts.find((p) => p.part === 'needs');
  assert.deepEqual(needs?.part === 'needs' && needs.keys, [{ label: 'K', opens: '', scheduled: true, held: null }]);
});

test('A SCRIPT’S KEY OPENS THE ONE HOST ITS LINE SENDS IT TO, and one sent to no host it names opens nothing the page guesses', () => {
  const line = 'CALLS OUT rates.example and fx.example · every 1d · key "Rates" to rates.example, "Fx" to the host its Keychain entry opens and "Old" to no host it calls (its Keychain entry opens "x.example"), so every fetch with it is refused';
  const call = callOf(line);
  assert.deepEqual(call.keys, ['Rates', 'Fx', 'Old']);
  assert.deepEqual(call.to, { Rates: 'rates.example' });
  const needs = arrangedOf('arrange', { approve: [line] })?.parts.find((p) => p.part === 'needs');
  /* An empty `opens` is what makes the key's field ask what it opens, since the record refuses a new key without one. */
  assert.deepEqual(needs?.part === 'needs' && needs.keys.map((k) => [k.label, k.opens]), [['Rates', 'rates.example'], ['Fx', ''], ['Old', '']]);
});

test('AN ARRANGEMENT WITH NO KEY draws no section for keys, and the queue counts none', () => {
  for (const body of [
    { why: ['Tidy the home page.'], words: { home: 'Today' } },
    { approve: ['CALLS OUT a.example · when a rule runs it, at most 100 a day · grant "none"', 'CALLS OUT b.example · every 1h · no key'] },
    { needs: [], approve: [] },
  ]) {
    const out = arrangedOf('arrange', body, { held: new Map() });
    assert.equal(out?.parts.some((p) => p.part === 'needs'), false, JSON.stringify(body));
    assert.doesNotMatch(out?.summary ?? '', /\bkeys?\b/u);
  }
});

test('A CHANGE ADDRESSED BY A BARE ROW ID is said by no list and no id', () => {
  const out = arrangedOf('arrange', { rows: [{ at: '01JABCDEFGHJKMNPQRSTVWXYZ0', version: 1, patch: { last4: '1100' } }] });
  const changes = out?.parts.find((p) => p.part === 'changes');
  assert.deepEqual(changes?.part === 'changes' && changes.lists, [{ name: '', changes: [{ title: 'One of your entries', fields: [{ field: 'Last4', before: null, after: '1100' }] }] }]);
});
