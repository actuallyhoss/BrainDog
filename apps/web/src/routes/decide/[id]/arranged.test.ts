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
  assert.deepEqual(calls?.part === 'calls' && calls.calls, [{ host: 'calendar.example', detail: 'every 1h, with the key “Timetable feed”' }]);
  assert.deepEqual(packs?.part === 'packs' && packs.lines, ['Installs Portfolio, then Student', 'Turns off Money core']);
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
  assert.equal(out?.lead, 'Changes the words and settings of Team');
  assert.deepEqual(
    out?.parts.map((p) => ('lines' in p ? p.lines : [])),
    [
      ['“Waiting on you” will read “On your plate”', 'The list Tickets will be called “Issues”', 'In Tickets, State will be called “Stage”'],
      ['Team: Week starts will be monday, where it is sunday now'],
    ],
  );
});

test('a pack turned off names the lists that leave the sidebar, and one installed with its document shows where its page lands', () => {
  const off = arrangedOf('pack', { disable: 'money-core', registers: ['obligations', 'ledger'] }, { lists: new Map([['obligations', 'Bills']]) });
  assert.equal(off?.lead, 'Turns Money core off');
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
    left: ['Student', 'Money core', 'the page Today', 'the words and settings of Student'],
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
