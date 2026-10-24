/**
 * What a declared page needs to be Work and Decide: a reader's own filters over every block, a queue whose first
 * question is drawn whole with what accepting it does, what was put off and what was decided, and a section whose
 * condition hides what it holds.
 *
 * Nothing here knows a person; the lists are invented, and every assertion goes through the record's own wiring
 * (`k.page`, `k.block`), because the half worth testing is what a page answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, type Schema } from '@braindog/where';

import { doesOf, openRecord, validateDeclaration, type Declaration, type Entry, type Json, type PageBlock, type PageFilter } from '../src/index.ts';
import { readPage, registersOfBlock, WHOLE_RECORD, type BlockResult, type PageDecl, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'hue', type: 'int' }] } as never,
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    state: 'state',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'done'] },
      { id: 'project', type: 'ref', to: 'projects' },
      { id: 'hold', type: 'enum', values: ['you', 'agent'] },
      { id: 'rank', type: 'int' },
    ],
  } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'text',
    fields: [
      { id: 'text', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'projects' },
    ],
  } as never,
};

const REQUIRES = ['register.tasks', 'register.notes', 'register.projects'];

const table = (register: string, field: string, more: Record<string, unknown> = {}) => ({
  kind: 'table',
  source: `register.${register}`,
  columns: [{ field }],
  order: [{ field: 'seq', dir: 'asc' }],
  empty: 'Nothing here.',
  ...more,
});

const WORK: Declaration = {
  id: 'page.work',
  kind: 'page',
  body: {
    page: 'work',
    title: 'Work',
    requires: REQUIRES,
    filters: [
      { field: 'project', control: 'chips' },
      { field: 'hold', control: 'segmented' },
    ],
    blocks: [table('tasks', 'what'), table('notes', 'text'), table('projects', 'name')],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([PROJECTS, TASKS, NOTES]));
  const made = (register: string, fields: Record<string, unknown>) => value<{ id: string; seq: number }>(k.create(register, fields, OWNER));
  const kiln = made('projects', { name: 'Kiln', hue: 24 });
  const oxbow = made('projects', { name: 'Oxbow' });
  made('projects', { name: 'Quiet' });
  made('tasks', { what: 'Fire the glaze', state: 'open', project: kiln.id, hold: 'you' });
  made('tasks', { what: 'Order clay', state: 'doing', project: kiln.id, hold: 'agent' });
  made('tasks', { what: 'Clean the shelves', state: 'done', project: kiln.id, hold: 'you' });
  made('tasks', { what: 'Proof the dough', state: 'open', project: oxbow.id, hold: 'you' });
  made('tasks', { what: 'Answer the post', state: 'open', hold: 'agent' });
  made('notes', { text: 'Cone 6 is enough', project: kiln.id });
  return { k, sql, clock };
}

const titles = (b: BlockResult | undefined, field: string): Json[] => (b?.rows ?? []).map((r) => r.fields[field] ?? null);
const filterOf = (page: { filters?: unknown }, field: string): PageFilter => {
  const found = ((page.filters ?? []) as PageFilter[]).find((f) => f.field === field);
  assert.ok(found, `no filter on ${field}`);
  return found;
};

/* ── the filters page key ────────────────────────────────────────────────── */

test('A PAGE DECLARES READER FILTERS AS { field, control }, and a filter nothing can draw is refused by name', () => {
  const page = (filters: unknown): Declaration => ({ ...WORK, body: { ...(WORK.body as object), filters } as never });
  assert.equal(validateDeclaration(WORK), null);
  assert.equal(validateDeclaration(page([])), null);
  assert.equal(validateDeclaration(page({ field: 'project' }))?.code, 'DECLARATION_INVALID');
  const picker = validateDeclaration(page([{ field: 'project', control: 'picker' }]));
  assert.equal(picker?.code, 'DECLARATION_INVALID');
  assert.deepEqual(picker?.allowed, ['chips', 'segmented']);
  assert.equal(validateDeclaration(page([{ field: 'project', control: 'chips', label: 'P' }]))?.code, 'DECLARATION_INVALID');
  assert.equal(validateDeclaration(page([{ field: 'project', control: 'chips' }, { field: 'project', control: 'segmented' }]))?.code, 'DECLARATION_INVALID');
  const five = ['a', 'b', 'c', 'd', 'e'].map((field) => ({ field, control: 'chips' }));
  assert.equal(validateDeclaration(page(five))?.code, 'OUT_OF_BOUNDS');

  /* AGAINST WHAT IS INSTALLED, the field is one of the page's lists' and one a person can pick a value of. */
  const known = new Map<string, Record<string, Json>>([
    ['register.tasks', TASKS.body as Record<string, Json>],
    ['register.notes', NOTES.body as Record<string, Json>],
    ['register.projects', PROJECTS.body as Record<string, Json>],
  ]);
  assert.equal(validateDeclaration(WORK, known), null);
  assert.equal(validateDeclaration(page([{ field: 'colour', control: 'chips' }]), known)?.code, 'FIELD_UNKNOWN');
  const rank = validateDeclaration(page([{ field: 'rank', control: 'chips' }]), known);
  assert.equal(rank?.code, 'DECLARATION_INVALID');
  assert.match(rank?.fix ?? '', /rank, which is int/);

  /* `header` IS DRAWN NOW, so a head is checked by what it says and not refused as unbuilt. */
  assert.equal(validateDeclaration({ ...WORK, body: { ...(WORK.body as object), header: { kicker: 'Work' } } as never }), null);
  assert.equal(validateDeclaration({ ...WORK, body: { ...(WORK.body as object), header: { banner: 'x' } } as never })?.code, 'DECLARATION_INVALID');
});

test('THE ANSWER SAYS WHAT EACH FILTER CAN TAKE, counting open rows only, named in the person’s own words', async () => {
  const { k, sql } = await record();
  value(await k.install([WORK]));
  const page = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(k.page('work'));

  /* KILN HOLDS TWO OPEN TASKS AND A NOTE; ITS FINISHED TASK IS NOT COUNTED. A project nothing open points at is not
     offered, and the rows that point at no project are "No project", last. */
  const project = filterOf(page, 'project');
  assert.equal(project.label, 'Project');
  assert.equal(project.control, 'chips');
  assert.equal(project.chosen, null);
  assert.deepEqual(project.reads, ['tasks', 'notes', 'projects'], 'the lists counted and the list the names come from');
  assert.deepEqual(project.values, [
    /* A PROJECT THAT HOLDS A HUE IS OFFERED WITH IT, so its chip wears the project's dot (E24); one without has none. */
    { value: '1', label: 'Kiln', count: 3, hue: 24 },
    { value: '2', label: 'Oxbow', count: 1 },
    { value: '', label: 'No project', count: 1 },
  ]);

  /* AN ENUM IN ITS OWN ORDER, over the one list that holds it. */
  assert.deepEqual(filterOf(page, 'hold').values, [
    { value: 'you', label: 'You', count: 2 },
    { value: 'agent', label: 'Agent', count: 2 },
  ]);
  assert.equal(titles(page.blocks[0], 'what').length, 5, 'nothing chosen narrows nothing');
  sql.close();
});

test('A CHOSEN VALUE IS ANDED ONTO EVERY BLOCK WHOSE LIST HAS THE FIELD, and the other counts follow it', async () => {
  const { k, sql } = await record();
  value(await k.install([WORK]));

  const kiln = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(k.page('work', { project: '1' }));
  assert.deepEqual(titles(kiln.blocks[0], 'what'), ['Fire the glaze', 'Order clay', 'Clean the shelves']);
  assert.equal(kiln.blocks[0]?.matched, 3, 'the count is of what the filter left');
  assert.deepEqual(titles(kiln.blocks[1], 'text'), ['Cone 6 is enough']);
  assert.deepEqual(titles(kiln.blocks[2], 'name'), ['Kiln', 'Oxbow', 'Quiet'], 'a list with no such field is left as it is');
  assert.equal(filterOf(kiln, 'project').chosen, '1');
  /* THE PROJECTS' OWN COUNTS ARE NOT NARROWED BY THE PROJECT CHOSEN; WHOSE WORK IT IS, IS. */
  assert.equal(filterOf(kiln, 'project').values.find((v) => v.value === '2')?.count, 1);
  assert.deepEqual(
    filterOf(kiln, 'hold').values.map((v) => [v.value, v.count]),
    [['you', 1], ['agent', 1]],
  );

  /* TWO CHOICES ARE BOTH MADE, and a spoken id is answered by the number the chip carries. */
  const both = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(k.page('work', { project: 'projects#1', hold: 'agent' }));
  assert.deepEqual(titles(both.blocks[0], 'what'), ['Order clay']);
  assert.deepEqual(titles(both.blocks[1], 'text'), ['Cone 6 is enough'], 'notes hold no hold field, so only the project narrows them');
  assert.equal(filterOf(both, 'project').chosen, '1');

  /* "NONE" IS THE ROWS THAT POINT AT NO PROJECT. */
  const none = value<{ blocks: BlockResult[] }>(k.page('work', { project: '' }));
  assert.deepEqual(titles(none.blocks[0], 'what'), ['Answer the post']);
  assert.deepEqual(titles(none.blocks[1], 'text'), []);

  /* A PROJECT WITH NOTHING OPEN IS STILL OFFERED ONCE CHOSEN, so the reader sees what they picked. */
  const quiet = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(k.page('work', { project: '3' }));
  assert.deepEqual(titles(quiet.blocks[0], 'what'), []);
  assert.deepEqual(filterOf(quiet, 'project').values.at(-1), { value: '3', label: 'Quiet', count: 0 });

  /* A VALUE THE FIELD CANNOT HOLD, OR A FIELD THE PAGE DOES NOT FILTER ON, IS NO CHOICE: an old address still opens. */
  for (const filter of [{ project: '99' }, { hold: 'nobody' }, { colour: 'red' }, { rank: '1' }]) {
    const page = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(k.page('work', filter));
    assert.equal(titles(page.blocks[0], 'what').length, 5, JSON.stringify(filter));
    assert.ok(((page.filters ?? []) as PageFilter[]).every((f) => f.chosen === null), JSON.stringify(filter));
  }
  sql.close();
});

test('A PAGE WITH NO FILTERS ANSWERS NONE, and a lone block read is never narrowed', async () => {
  const { k, sql } = await record();
  const plain: Declaration = { id: 'page.plain', kind: 'page', body: { page: 'plain', title: 'Plain', requires: REQUIRES, blocks: [table('tasks', 'what')] } as never };
  value(await k.install([plain]));
  const page = value<Record<string, unknown>>(k.page('plain', { project: '1' }));
  assert.equal(page.filters, undefined);
  assert.equal((page.blocks as BlockResult[])[0]?.rows.length, 5);
  sql.close();
});

/* ── a queue's lead ──────────────────────────────────────────────────────── */

const OPTIONS = { options: [{ id: 'raise', label: 'Raise it', because: 'Covers the overrun' }, { id: 'leave', label: 'Leave it', because: 'Keeps the quote' }] };

test('A QUEUE READS LEAD, and its first question carries what was proposed and what accepting does', async () => {
  const { k, sql } = await record();
  value(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  value(k.propose({ question: 'Add the two jobs?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Glaze test' }, { what: 'Kiln wash' }] } }, 'slash'));

  const led = k.block({ kind: 'queue', source: 'governance.open', lead: true } as PageBlock);
  assert.deepEqual(led.refusals, []);
  /* RANKED BY COST, so the rows come first and are the lead. */
  assert.equal(led.queue?.[0]?.body_kind, 'rowset');
  assert.equal(led.queue?.[0]?.does, 'Adds 2 to Tasks.');
  assert.equal(led.queue?.[1]?.does, undefined);
  assert.equal(led.queue?.[1]?.body_kind, undefined);

  /* A CHANGE TO WHAT A LIST HOLDS KEEPS ITS LINE BELOW THE LEAD, read against what the entry holds; no other kind does. */
  value(k.propose({ question: 'Change the state of Order clay?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#2', version: 1, patch: { state: 'done' } }] } }, 'slash'));
  const three = k.block({ kind: 'queue', source: 'governance.open', lead: true } as PageBlock).queue ?? [];
  assert.deepEqual(
    three.map((q) => [q.kind, q.does, q.body_kind]),
    [
      ['rowset', 'Adds 2 to Tasks.', 'rowset'],
      ['rowset', 'Changes State from doing to done in Tasks.', undefined],
      ['options', undefined, undefined],
    ],
  );

  const plain = k.block({ kind: 'queue', source: 'governance.open' } as PageBlock);
  assert.ok((plain.queue ?? []).every((q) => q.does === undefined && q.body_kind === undefined), 'a queue with no lead carries none');

  /* LEAD IS A YES OR A NO, at install as for every other block that reads it. */
  const page = (lead: unknown): Declaration => ({
    id: 'page.decide',
    kind: 'page',
    body: { page: 'decide', title: 'Decide', blocks: [{ kind: 'queue', source: 'governance.open', lead, empty: 'Nothing waits.' }] } as never,
  });
  assert.equal(validateDeclaration(page(true)), null);
  assert.equal(validateDeclaration(page('yes'))?.code, 'DECLARATION_INVALID');
  sql.close();
});

test('WHAT ACCEPTING DOES IS ONE LINE IN THE PERSON’S OWN NAMES, read off the body', () => {
  const names = { list: (id: string) => (id === 'tasks' ? 'Tasks' : null), pack: (id: string) => (id === 'money' ? 'Money' : null) };
  assert.equal(doesOf('options', OPTIONS, names), 'Records your choice and changes nothing else.');
  assert.equal(doesOf('rowset', { register: 'tasks', rows: [{ at: 'tasks#1', fields: {} }, { what: 'x' }] }, names), 'Changes 1 in Tasks and adds 1.');
  /* A QUESTION ABOUT ONE LIST NEVER NAMES THE ENTRIES, since the question above the line already does; the count is kept. */
  const titled = { ...names, list: (id: string) => (id === 'things' ? 'Projects' : null), row: (at: string) => ({ 'things#1': 'Kiln', 'things#3': 'Portage' })[at] ?? null };
  assert.equal(doesOf('rowset', { register: 'things', rows: [{ at: 'things#1', patch: {} }, { at: 'things#3', patch: {} }] }, titled), 'Changes 2 in Projects.');
  assert.equal(doesOf('rowset', { register: 'things', rows: [{ at: 'things#1', patch: {} }, { at: 'things#9', patch: {} }] }, titled), 'Changes 2 in Projects.');
  assert.equal(doesOf('pack', { disable: 'money' }, names), 'Turns off Money.');
  assert.equal(doesOf('pack', { install: 'usecase-student' }, names), 'Adds Usecase student.');
  assert.equal(doesOf('settings', { pack: 'money', values: { voice: 'calm', week: 'mon' } }, names), 'Changes 2 settings of Money.');
  assert.equal(
    doesOf('change', { declaration_id: 'page.work', from: {}, to: { id: 'page.work', kind: 'page', body: { title: 'Work' } } }, names),
    'Changes the Work page.',
  );
  assert.equal(doesOf('change', { declaration_id: 'register.tasks', to: { id: 'register.tasks', kind: 'register', body: {} } }, names), 'Adds Tasks.');
  assert.equal(
    doesOf('arrange', { why: ['x'], packs: { install: ['money'] }, pages: [{}], rows: [{ register: 'tasks', fields: {} }] }, names),
    'Adds Money, lays out one page, adds 1 to Tasks.',
  );
  /* A BODY IT CANNOT READ SAYS NOTHING RATHER THAN SOMETHING WRONG. */
  assert.equal(doesOf('rowset', 'not a body', names), '');
  assert.equal(doesOf('nonsense', {}, names), '');
  for (const kind of ['options', 'rowset', 'change', 'pack', 'settings', 'pattern', 'arrange'])
    assert.doesNotMatch(doesOf(kind, { register: 'tasks', rows: [{}], pack: 'money', values: { a: 1 }, install: 'money', why: ['x'] }, names), /\b(row|rows|register|declaration|entity)\b/u, kind);
});

/* ── later and decided ───────────────────────────────────────────────────── */

test('GOVERNANCE.LATER IS WHAT WAS PUT OFF, soonest back first, and it leaves on the day it comes back', async () => {
  const { k, sql, clock } = await record();
  const far = value<{ id: string }>(k.propose({ question: 'Renew the studio lease?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const near = value<{ id: string }>(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const open = value<{ id: string }>(k.propose({ question: 'Pay the bill?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const farDay = new Date(NOW + 3 * DAY).toISOString();
  const nearDay = new Date(NOW + DAY).toISOString();
  value(k.decide(far.id, { defer: { until: farDay, why: 'after the quarter closes' } }, 'p_1'));
  value(k.decide(near.id, { defer: { until: nearDay, why: 'when the invoice lands' } }, 'p_1'));

  const later = k.block({ kind: 'queue', source: 'governance.later' } as PageBlock);
  assert.deepEqual(later.refusals, []);
  assert.deepEqual(
    (later.queue ?? []).map((q) => [q.id, q.question, q.until, q.until_why]),
    [
      [near.id, 'Raise the retainer?', nearDay, 'when the invoice lands'],
      [far.id, 'Renew the studio lease?', farDay, 'after the quarter closes'],
    ],
  );
  assert.equal(later.matched, 2);
  assert.deepEqual(k.block({ kind: 'queue', source: 'governance.open' } as PageBlock).queue?.map((q) => q.id), [open.id]);

  /* ON ITS DAY IT IS OPEN AGAIN, and in one place only. */
  clock.set(NOW + 2 * DAY);
  assert.deepEqual(k.block({ kind: 'queue', source: 'governance.later' } as PageBlock).queue?.map((q) => q.id), [far.id]);
  assert.ok(k.block({ kind: 'queue', source: 'governance.open' } as PageBlock).queue?.some((q) => q.id === near.id));

  /* ITS ORDER IS THE RECORD'S, and it reads across the whole record, so a reader of named lists is held from it. */
  assert.equal(k.block({ kind: 'queue', source: 'governance.later', order: [{ field: 'who' }] } as PageBlock).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.deepEqual(registersOfBlock({ kind: 'queue', source: 'governance.later' }), [WHOLE_RECORD]);
  sql.close();
});

test('GOVERNANCE.DECIDED IS WHAT WAS ANSWERED, latest first, with the option chosen in its own words', async () => {
  const { k, sql, clock } = await record();
  const choice = value<{ id: string }>(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  value(k.decide(choice.id, { decide: { option: 'leave', reason: 'The quote stands.' } }, 'p_1'));
  clock.advance(60_000);
  const rows = value<{ id: string }>(k.propose({ question: 'Add the glaze test?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Glaze test' }] } }, 'slash'));
  value(k.decide(rows.id, { decide: { option: 'accept', reason: 'Needed before firing.' } }, 'p_1'));

  const block: PageBlock = { kind: 'table', source: 'governance.decided', columns: [{ field: 'question' }, { field: 'answer' }, { field: 'reason' }] };
  const decided = k.block(block);
  assert.deepEqual(decided.refusals, []);
  assert.deepEqual(
    decided.rows.map((r) => [r.fields.question, r.fields.answer, r.fields.answer_label, r.fields.reason, r.fields.who, r.fields.kind]),
    [
      ['Add the glaze test?', 'accept', null, 'Needed before firing.', 'p_1', 'rowset'],
      ['Raise the retainer?', 'leave', 'Leave it', 'The quote stands.', 'p_1', 'options'],
    ],
  );
  assert.equal(decided.matched, 2);
  assert.deepEqual(k.block({ ...block, where: 'kind is options' }).rows.map((r) => r.fields.question), ['Raise the retainer?']);
  assert.equal(k.block({ ...block, limit: 1 }).rows.length, 1);
  assert.equal(k.block({ ...block, columns: [{ field: 'colour' }] }).refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(k.block({ ...block, order: [{ field: 'at' }] }).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.deepEqual(registersOfBlock(block), [WHOLE_RECORD]);

  /* BOTH SOURCES INSTALL, as every source the read answers must. */
  const decide: Declaration = {
    id: 'page.decide',
    kind: 'page',
    body: {
      page: 'decide',
      title: 'Decide',
      blocks: [
        { kind: 'queue', source: 'governance.open', lead: true, empty: 'Nothing waits on you.' },
        { kind: 'queue', source: 'governance.later', empty: 'Nothing put off.' },
        { kind: 'table', source: 'governance.decided', columns: [{ field: 'question' }, { field: 'answer' }], empty: 'Nothing decided yet.' },
      ],
    } as never,
  };
  assert.equal(validateDeclaration(decide), null);
  value(await k.install([decide]));
  assert.ok(value<{ blocks: BlockResult[] }>(k.page('decide')).blocks.every((b) => b.refusals.length === 0));
  sql.close();
});

/* ── a section's when ────────────────────────────────────────────────────── */

test('A SECTION WHOSE WHEN SAYS NO HIDES THE BLOCKS IT HOLDS, up to the next section and in its own column', async () => {
  const { k, sql } = await record();
  const page: Declaration = {
    id: 'page.desk',
    kind: 'page',
    body: {
      page: 'desk',
      title: 'Desk',
      requires: REQUIRES,
      layout: { rail: 4 },
      blocks: [
        { kind: 'section', heading: 'Waiting on you', fold: true, when: { metric: 'questions-open', gt: 0 } },
        { kind: 'note', body: 'Something waits.' },
        { kind: 'note', area: 'rail', body: 'Always here.' },
        { kind: 'section', area: 'rail', heading: 'Beside' },
        table('tasks', 'what'),
        { kind: 'section', heading: 'The rest' },
        table('notes', 'text'),
      ],
    } as never,
  };
  value(await k.install([page]));
  const quiet = value<{ blocks: BlockResult[] }>(k.page('desk')).blocks;
  assert.deepEqual(
    quiet.map((b) => b.drawn),
    [false, false, undefined, undefined, false, undefined, undefined],
  );
  assert.deepEqual(quiet[4]?.rows, [], 'a block under a hidden section is not read, and a section in the rail does not end its fold');
  assert.deepEqual(titles(quiet[6], 'text'), ['Cone 6 is enough']);

  value(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const asked = value<{ blocks: BlockResult[] }>(k.page('desk')).blocks;
  assert.ok(asked.every((b) => b.drawn !== false));
  assert.equal(asked[4]?.rows.length, 5);
  sql.close();
});

test('A BOX WHOSE EVERY BLOCK IS HIDDEN IS NOT DRAWN, and one holding anything drawn, or nothing at all, stays', async () => {
  const { k, sql } = await record();
  const waiting = { metric: 'questions-open', gt: 0 };
  const page: Declaration = {
    id: 'page.desk',
    kind: 'page',
    body: {
      page: 'desk',
      title: 'Desk',
      requires: REQUIRES,
      layout: { rail: 4 },
      blocks: [
        { kind: 'section', heading: 'Heads up', box: true },
        { kind: 'note', body: 'Something waits.', when: waiting },
        { kind: 'note', area: 'rail', body: 'Always here.' },
        { kind: 'note', body: 'Something else waits.', when: waiting },
        { kind: 'section', heading: 'Open', box: true },
        { kind: 'note', body: 'Maybe.', when: waiting },
        table('tasks', 'what'),
        { kind: 'section', heading: 'Bare', box: true },
        { kind: 'section', heading: 'Unboxed' },
        { kind: 'note', body: 'Hidden too.', when: waiting },
      ],
    } as never,
  };
  value(await k.install([page]));
  const quiet = value<{ blocks: BlockResult[] }>(k.page('desk')).blocks;
  assert.deepEqual(
    quiet.map((b) => b.drawn),
    [false, false, undefined, false, undefined, false, undefined, undefined, false, false],
    'a block in the rail is not held by a box in the main column, and a heading over nothing goes, boxed or not',
  );

  value(k.propose({ question: 'Raise the retainer?', body_kind: 'options', body: OPTIONS }, 'slash'));
  const asked = value<{ blocks: BlockResult[] }>(k.page('desk')).blocks;
  assert.ok(asked.every((b) => b.drawn !== false));
  sql.close();
});

/* ── a host with no tally, and a reader held from a list ─────────────────── */

test('A HOST WITH NO TALLY COUNTS FROM ITS ROWS, and a list the reader may not read is neither counted nor narrowed', () => {
  const schema: Schema = {
    register: 'jobs',
    state: 'state',
    fields: { what: { type: 'text' }, state: { type: 'enum', values: ['open', 'done'] }, lane: { type: 'enum', values: ['fast', 'slow'], labels: { fast: 'Quick wins' } } },
  };
  const said: [string, string, string][] = [
    ['Sand', 'open', 'fast'],
    ['Seal', 'open', 'slow'],
    ['Ship', 'done', 'fast'],
    ['Sort', 'open', 'fast'],
  ];
  const rows: Entry[] = said.map(([what, state, lane], i) => ({
    id: `r${i}`, register: 'jobs', seq: i + 1, fields: { what, state, lane }, state, version: 1,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', deleted_at: null,
  }));
  const decl: PageDecl = {
    page: 'jobs',
    title: 'Jobs',
    filters: [{ field: 'lane', control: 'segmented' }],
    blocks: [{ kind: 'table', source: 'register.jobs', columns: [{ field: 'what' }], empty: 'None.' }],
  };
  const deps = (reads?: (r: string) => boolean): PageDeps => ({
    pages: () => [decl],
    metric: () => null,
    read: () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'none' } }),
    list: (q) => {
      const kept = q.register === 'jobs' ? rows.filter((r) => evaluate(q.where, r.fields, schema)) : [];
      return { ok: true, value: { rows: kept.slice(0, q.limit ?? 50), matched: kept.length, cursor: null } };
    },
    schemaOf: (r) => (r === 'jobs' ? schema : null),
    titleOf: () => 'what',
    runway: () => null,
    lists: () => [{ id: 'jobs', done: ['done'], fields: [] }],
    ctx: { nowMs: NOW, schemaOf: (r) => (r === 'jobs' ? schema : null), ...(reads ? { reads } : {}) },
  });

  const all = value<{ filters?: PageFilter[]; blocks: BlockResult[] }>(readPage(deps(), 'jobs'));
  assert.deepEqual(filterOf(all, 'lane').values, [
    { value: 'fast', label: 'Quick wins', count: 2 },
    { value: 'slow', label: 'Slow', count: 1 },
  ]);
  const slow = value<{ blocks: BlockResult[] }>(readPage(deps(), 'jobs', { lane: 'slow' }));
  assert.deepEqual(titles(slow.blocks[0], 'what'), ['Seal']);

  const held = value<{ filters?: PageFilter[] }>(readPage(deps(() => false), 'jobs', { lane: 'slow' }));
  assert.deepEqual(filterOf(held, 'lane'), { field: 'lane', label: 'Lane', control: 'segmented', chosen: null, values: [], reads: [] });
});
