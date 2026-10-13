/**
 * WHAT A CHANGE CHANGES, under a question that already names the entry (batch 79, "'Change <name>?' cards say nothing").
 *
 * A filed change to a skill read "Changes ponytail-review in Skills." under "Change ponytail-review?": the entry twice
 * and the change never. The line is read off the patch and what the entry holds now: each field by the label the
 * record shows, a short value from what it was to what it becomes, a long text as lines added and removed, and a value
 * that is never said (a secret, a file) as its label alone. The entry's own name is the question's, never the line's.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doesOf, type DoesNames } from '../src/does.ts';

const LISTS: Readonly<Record<string, string>> = { skills: 'Skills', things: 'Projects', tasks: 'Tasks', invoices: 'Invoices', vault: 'Keys' };
const LABELS: Readonly<Record<string, string>> = { body: 'Text', rev: 'Revision', stage: 'Stage', amount: 'Amount', token: 'Token', due: 'Due on', plan: 'The plan', thing: 'Project', done: 'Done', folder: 'Folder' };
const TITLES: Readonly<Record<string, string>> = { 'things#1': 'Kiln', 'things#3': 'Portage', 'skills#2': 'ponytail-review' };

/** A record that holds `held` (by `<at>.<field>`); a `token` is a secret, so what it holds is never handed over. */
const names = (held: Readonly<Record<string, unknown>> = {}, over: DoesNames = {}): DoesNames => ({
  list: (id) => LISTS[id] ?? null,
  row: (at) => TITLES[at] ?? null,
  field: (_list, field) => LABELS[field] ?? null,
  before: (at, field) => (field === 'token' ? undefined : (held[`${at}.${field}`] ?? null)),
  ...over,
});

const one = (register: string, at: string, patch: Record<string, unknown>): Record<string, unknown> => ({ register, rows: [{ at, version: 3, patch }] });

test('a skill whose text and revision change says lines added and removed, and the revision from and to', () => {
  const held = { 'skills#2.body': 'Review the diff.\nName what to delete.\nOne line a finding.\nNo praise.', 'skills#2.rev': 4 };
  const body = one('skills', 'skills#2', { body: 'Review the diff.\nName what to cut.\nOne line a finding.\nNo praise.\nStop at ten.', rev: 5 });
  assert.equal(doesOf('rowset', body, names(held)), 'Adds 2 lines to Text and removes 1, changes Revision from 4 to 5 in Skills.');
});

test('the entry is never named, though the record can name it', () => {
  const line = doesOf('rowset', one('things', 'things#1', { stage: 'Live' }), names({ 'things#1.stage': 'Building' }));
  assert.equal(line, 'Changes Stage from Building to Live in Projects.');
  assert.ok(!line.includes('Kiln'));
});

test('money is said in its own currency, from and to', () => {
  const held = { 'invoices#7.amount': { amount: 129900, currency: 'GBP' } };
  const body = one('invoices', 'invoices#7', { amount: { amount: 150000, currency: 'GBP' } });
  assert.equal(doesOf('rowset', body, names(held)), 'Changes Amount from GBP 1,299.00 to GBP 1,500.00 in Invoices.');
});

test('a secret is named by its label and its value is never said', () => {
  const line = doesOf('rowset', one('vault', 'vault#1', { token: 'sk_live_9f2c' }), names());
  assert.equal(line, 'Changes Token in Keys.');
  assert.ok(!line.includes('sk_live'));
});

test('three entries given the same value say it once, and three given different ones say the field', () => {
  const rows = (stage: (i: number) => string) => ({ register: 'things', rows: [1, 3, 5].map((n, i) => ({ at: `things#${n}`, patch: { stage: stage(i) } })) });
  assert.equal(doesOf('rowset', rows(() => 'Live'), names()), 'Sets Stage to Live on 3 in Projects.');
  assert.equal(doesOf('rowset', rows((i) => ['Live', 'Raw', 'Ready'][i]!), names()), 'Changes Stage on 3 in Projects.');
});

test('a field that was empty is set, and one emptied is cleared', () => {
  assert.equal(doesOf('rowset', one('things', 'things#1', { stage: 'Live' }), names()), 'Sets Stage to Live in Projects.');
  assert.equal(doesOf('rowset', one('things', 'things#1', { stage: null }), names({ 'things#1.stage': 'Live' })), 'Clears Stage in Projects.');
  assert.equal(doesOf('rowset', one('tasks', 'tasks#4', { done: true }), names({ 'tasks#4.done': false })), 'Changes Done from no to yes in Tasks.');
});

test('a day is said as a day, never as the record keeps it', () => {
  const body = one('tasks', 'tasks#4', { due: '2026-10-20' });
  assert.equal(doesOf('rowset', body, names({ 'tasks#4.due': '2026-10-13' })), 'Changes Due on from 13 October 2026 to 20 October 2026 in Tasks.');
});

/* AUDIT 79, CLAIM 2. The day was cut off the front of an instant, which is its day in UTC: 22:30 on the 13th there is
   the 14th in Cairo, and the line said the 13th. Nothing here knows the reader's zone, so no day is said. */
test('an instant is not said as a day: its day depends on where the reader is, so its field is named and no more', () => {
  const moved = one('tasks', 'tasks#4', { due: '2026-10-13T22:30:00.000Z' });
  assert.equal(doesOf('rowset', moved, names({ 'tasks#4.due': '2026-10-13T06:00:00.000Z' })), 'Changes Due on in Tasks.');
  assert.equal(doesOf('rowset', moved, names({ 'tasks#4.due': '2026-10-13' })), 'Changes Due on in Tasks.');
  assert.equal(doesOf('rowset', one('tasks', 'tasks#4', { due: '2026-10-20T09:00:00+03:00' }), names()), 'Changes Due on in Tasks.');
});

/* AUDIT 79, CLAIM 1. Only a text that was a handle whole was held back, so an address, a handle inside a title and a
   bare host were each quoted to the person, and to an agent reading the queue. */
test('an address, a handle inside a text and a bare host are never quoted: the field is named and no more', () => {
  const said = (now: string, was: string | null = null) => doesOf('rowset', one('tasks', 'tasks#4', { stage: now }), names(was === null ? {} : { 'tasks#4.stage': was }));
  assert.equal(said('a@b.com', 'old@x.com'), 'Changes Stage in Tasks.');
  assert.equal(said('Fix tasks#8'), 'Changes Stage in Tasks.');
  assert.equal(said('example.com'), 'Changes Stage in Tasks.');
  assert.equal(said('api.example.co.uk', 'Live'), 'Changes Stage in Tasks.');
  /* AND WORDS THAT ONLY LOOK NEAR ONE ARE STILL SAID: a figure with a point, a sentence with a full stop, a number sign. */
  assert.equal(said('Version 1.25', 'Version 1.24'), 'Changes Stage from Version 1.24 to Version 1.25 in Tasks.');
  assert.equal(said('Done. Ship it', 'Draft'), 'Changes Stage from Draft to Done. Ship it in Tasks.');
  assert.equal(said('Number 8', 'Number 7'), 'Changes Stage from Number 7 to Number 8 in Tasks.');
});

/* AUDIT 79, CLAIM 3. What several entries held is never said, and it was read of every one of them for every field. */
test('several entries are not each read for what they held: one is asked whether the field may be valued, and that is all', () => {
  let reads = 0;
  const counted = names({}, { before: (_at, field) => ((reads += 1), field === 'token' ? undefined : 'Raw') });
  const rows = (patch: Record<string, unknown>) => ({ register: 'things', rows: Array.from({ length: 500 }, (_, i) => ({ at: `things#${i + 1}`, patch })) });
  assert.equal(doesOf('rowset', rows({ stage: 'Live', folder: 'North' }), counted), 'Sets Stage to Live, sets Folder to North on 500 in Projects.');
  assert.equal(reads, 2);
  /* A SECRET IS STILL NEVER VALUED over several entries: the one asked says so for all of them. */
  assert.equal(doesOf('rowset', { register: 'vault', rows: [1, 2].map((n) => ({ at: `vault#${n}`, patch: { token: 'sk_live_9f2c' } })) }, counted), 'Changes Token on 2 in Keys.');
  /* AND AN ENTRY THAT IS NOT SENT THE FIELD stops the value being said for all, with no read at all. */
  reads = 0;
  const mixed = { register: 'things', rows: [{ at: 'things#1', patch: { stage: 'Live' } }, { at: 'things#3', patch: { folder: 'North' } }] };
  assert.equal(doesOf('rowset', mixed, counted), 'Changes Stage and Folder on 2 in Projects.');
  assert.equal(reads, 0);
});

test('a field that holds several says how many it gains and loses', () => {
  const held = { 'things#1.plan': ['Draw it', 'Build it'] };
  assert.equal(doesOf('rowset', one('things', 'things#1', { plan: ['Draw it', 'Ship it', 'Sell it'] }), names(held)), 'Adds 2 to The plan and removes 1 in Projects.');
  assert.equal(doesOf('rowset', one('things', 'things#1', { plan: ['Draw it'] }), names(held)), 'Removes 1 from The plan in Projects.');
});

test('a long text written for the first time is its lines, and one line rewritten says so', () => {
  assert.equal(doesOf('rowset', one('skills', 'skills#2', { body: 'One.\nTwo.\nThree.' }), names()), 'Adds 3 lines to Text in Skills.');
  const long = 'A sentence that runs well past what one short line under a question can hold, word after word.';
  assert.equal(doesOf('rowset', one('skills', 'skills#2', { body: `${long} And more.` }), names({ 'skills#2.body': long })), 'Rewrites Text in Skills.');
});

test('a link is said by the title the record reads it as, and never as where it is', () => {
  const body = one('tasks', 'tasks#4', { thing: 'things#3' });
  const held = { 'tasks#4.thing': 'things#1' };
  const read: DoesNames = { value: (_list, field, raw) => (field === 'thing' && typeof raw === 'string' ? TITLES[raw] : raw) };
  assert.equal(doesOf('rowset', body, names(held, read)), 'Changes Project from Kiln to Portage in Tasks.');
  assert.equal(doesOf('rowset', body, names(held)), 'Changes Project in Tasks.');
  assert.equal(doesOf('rowset', one('things', 'things#1', { folder: 'work/kiln/site' }), names({ 'things#1.folder': 'kiln' })), 'Changes Folder in Projects.');
});

/* AUDIT 79, CLAIM 6. Any text with a slash in it was held back as a path, so a stage of "Q3/Q4" said no value. */
test('a path is told by its shape and never quoted, and words with a slash between them are said', () => {
  const said = (now: string, was: string | null = 'Raw') => doesOf('rowset', one('tasks', 'tasks#4', { stage: now }), names(was === null ? {} : { 'tasks#4.stage': was }));
  const PATHS = ['/Users/sam/notes', '~/notes', '~', './build', '../build', 'C:\\Work\\Kiln', 'D:/Work', '\\\\share\\kiln', 'https://example.com/a', 'see ftp://files', 'docs/review.md', 'docs\\review.md', 'src/lib/kiln', 'work/', 'example.com/pricing', '/My Files/plan one'];
  for (const path of PATHS) assert.equal(said(path), 'Changes Stage in Tasks.', path);
  const WORDS = ['Q3/Q4', 'N/A', '24/7', 'and/or', 'Rent / bills', '13/10/2026', 'Paid 1/2 now', 'AC\\DC', '~5 minutes', 'Yes/no. Ask'];
  for (const words of WORDS) assert.equal(said(words), `Changes Stage from Raw to ${words} in Tasks.`, words);
  assert.equal(said('Q3/Q4', null), 'Sets Stage to Q3/Q4 in Tasks.');
});

/* A SENTENCE THAT NAMES A FILE. Only a text with no space was read for a path, so a note was quoted with its file. */
test('a sentence that names a file or a folder is not quoted either, and one with a slash between words still is', () => {
  const said = (now: string) => doesOf('rowset', one('tasks', 'tasks#4', { stage: now }), names({}));
  const NAMES_ONE = ['Read docs/plan.md first.', 'Approve the review (see docs/review.md)', 'Moved to src/lib/kiln, as agreed', 'Look in ~/notes today', 'It is at "C:\\Work\\Kiln".', 'Priced on example.com/pricing now'];
  for (const text of NAMES_ONE) assert.equal(said(text), 'Changes Stage in Tasks.', text);
  const WORDS = ['Rent / bills and food', 'Paid 1/2 now', 'Yes/no. Ask', 'Open 24/7 from May', 'Due 13/10/2026 at noon', 'About 5 ~ 6 days', 'Either and/or both.'];
  for (const text of WORDS) assert.equal(said(text), `Sets Stage to ${text} in Tasks.`, text);
});

/* AUDIT 79, CLAIM 4. A field the list lacks was named by its id read as words, "Changes Zzz internal in Tasks.", under
   a question whose title left it out. Writing it is refused, so the yes changes nothing there. */
test('a field the list does not have is not named, and a field it has with no label still is', () => {
  const HAS = new Set(['stage', 'due', 'effort_hours']);
  const held: DoesNames = { holds: (_list, field) => HAS.has(field) };
  const line = doesOf('rowset', one('tasks', 'tasks#4', { zzz_internal: 'x', stage: 'Live' }), names({ 'tasks#4.stage': 'Raw' }, held));
  assert.equal(line, 'Changes Stage from Raw to Live in Tasks.');
  assert.ok(!/zzz/iu.test(line));
  /* NOTHING BUT FIELDS IT LACKS keeps the count, as a patch of nothing does: the line never says an id. */
  assert.equal(doesOf('rowset', one('tasks', 'tasks#4', { zzz_internal: 'x' }), names({}, held)), 'Changes 1 in Tasks.');
  /* A FIELD THE LIST HOLDS AND GAVE NO LABEL is still named, by its id read as words: no label is not no field. */
  assert.equal(doesOf('rowset', one('tasks', 'tasks#4', { effort_hours: 3 }), names({ 'tasks#4.effort_hours': 2 }, held)), 'Changes Effort hours from 2 to 3 in Tasks.');
  /* SEVERAL ENTRIES: the field is left out of each, and is not read of any. */
  let reads = 0;
  const counted = names({}, { ...held, before: () => ((reads += 1), 'Raw') });
  const rows = { register: 'tasks', rows: [4, 5].map((n) => ({ at: `tasks#${n}`, patch: { stage: 'Live', zzz_internal: n } })) };
  assert.equal(doesOf('rowset', rows, counted), 'Sets Stage to Live on 2 in Tasks.');
  assert.equal(reads, 1);
  /* WITHOUT `holds` every field a patch sends is named, as before. */
  assert.equal(doesOf('rowset', one('tasks', 'tasks#4', { zzz_internal: 'x' }), names()), 'Sets Zzz internal to x in Tasks.');
});

test('without what the entry holds now, the fields are named and no value is said', () => {
  const bare: DoesNames = { list: (id) => LISTS[id] ?? null };
  assert.equal(doesOf('rowset', one('things', 'things#1', { stage: 'Live', due_on: '2026-10-20' }), bare), 'Changes Stage and Due on in Projects.');
});

test('many fields say the first three in full and name the rest', () => {
  const held = { 'tasks#4.stage': 'Raw', 'tasks#4.rev': 1, 'tasks#4.done': false, 'tasks#4.due': '2026-10-13', 'tasks#4.amount': { amount: 500, currency: 'JPY' } };
  const body = one('tasks', 'tasks#4', { stage: 'Ready', rev: 2, done: true, due: '2026-10-20', amount: { amount: 900, currency: 'JPY' } });
  assert.equal(doesOf('rowset', body, names(held)), 'Changes Stage from Raw to Ready, changes Revision from 1 to 2, changes Done from no to yes, changes Due on and Amount in Tasks.');
});

test('adding keeps its words, a delete and a bring back say so, and a patch of nothing keeps the count', () => {
  assert.equal(doesOf('rowset', { register: 'tasks', rows: [{ what: 'a' }, { what: 'b' }, { what: 'c' }] }, names()), 'Adds 3 to Tasks.');
  const mixed = { register: 'things', rows: [{ at: 'things#1', patch: { stage: 'Live' } }, { name: 'Quay' }, { name: 'Weir' }] };
  assert.equal(doesOf('rowset', mixed, names({ 'things#1.stage': 'Building' })), 'Changes Stage from Building to Live in Projects and adds 2.');
  assert.equal(doesOf('rowset', one('things', 'things#1', { deleted_at: '2026-10-13T09:00:00.000Z' }), names()), 'Deletes one from Projects.');
  assert.equal(doesOf('rowset', one('things', 'things#1', { deleted_at: null }), names()), 'Brings one back to Projects.');
  assert.equal(doesOf('rowset', { register: 'things', rows: [{ at: 'things#1', patch: {} }, { at: 'things#3', patch: {} }] }, names()), 'Changes 2 in Projects.');
});
