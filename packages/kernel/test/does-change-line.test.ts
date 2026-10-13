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
  assert.equal(doesOf('rowset', body, names({ 'tasks#4.due': '2026-10-13T09:00:00.000Z' })), 'Changes Due on from 13 October 2026 to 20 October 2026 in Tasks.');
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
  assert.equal(doesOf('rowset', one('things', 'things#1', { folder: 'work/kiln' }), names({ 'things#1.folder': 'kiln' })), 'Changes Folder in Projects.');
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
