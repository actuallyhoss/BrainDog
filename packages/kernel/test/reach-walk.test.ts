/**
 * `touches`, the one walk the filing check and Decide both ask, over each kind of declaration it places.
 *
 * IT COULD NOT BE RED FIRST: the export did not exist. The red half is `govern-bundle-scope.test.ts` (six riders filed
 * under `register.obligations` at `bccc7ea8`, and a rule saying `{{trigger.row.what}}` refused as reading
 * `register.trigger`) and the record's `decide-change-reach.test.ts`. What this file pins is the table itself, one row
 * each, so a kind taught to one reader and not the other shows up here rather than as a leak.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACROSS, ANY_LIST, touches, type ReachResolve } from '../src/index.ts';

const DOORS: Record<string, unknown> = {
  payroll: { ingest: 'payroll', channel: 'email', writes: { register: 'money' } },
};
const METRICS: Record<string, unknown> = {
  'inbox-count': { metric: 'inbox-count', source: 'register.inbox', value: { count: 'what' } },
};
const FIELDS: Record<string, string[]> = { inbox: ['what', 'from'] };

const resolve: ReachResolve = {
  figure: (id) => [METRICS[id]],
  door: (id) => DOORS[id],
  fields: (list) => new Set(FIELDS[list] ?? []),
};

/** The names, sorted, with the unknown figures after a bar, so one assertion says the whole answer. */
const said = (id: string, body: unknown): string => {
  const { lists, unknown } = touches(id, body, resolve);
  return [...[...lists].sort(), ...(unknown.size > 0 ? ['|', ...[...unknown].sort()] : [])].join(' ');
};

test('a register names its own id and nothing else, a ref field included', () => {
  assert.equal(said('register.inbox', { id: 'inbox', fields: [{ id: 'what', type: 'text' }, { id: 'payer', type: 'ref', to: 'register.money' }] }), 'inbox');
});

test("a rule names its row's list and every list the walk finds, and skips the run's own scope", () => {
  assert.equal(said('rule.seen', { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] }), 'inbox');
  assert.equal(said('rule.file-it', { rule: 'file-it', register: 'inbox', then: [{ create: { register: 'money', bound: 1 } }] }), 'inbox money');
  /* `{{trigger.row.what}}` was a list called `trigger` to the filing check. */
  assert.equal(said('rule.says', { rule: 'says', on: { written: { register: 'inbox' } }, steps: [{ notify: { say: '{{trigger.row.what}} and {{vars.x}} and {{each.0}}' } }] }), 'inbox');
  /* An arrival's row is the list its door writes, read through `resolve`. */
  assert.equal(said('rule.arrived', { rule: 'arrived', on: { arrival: { ingest: 'payroll' } }, steps: [{ notify: { say: 'In.' } }] }), 'money');
  /* A rule on a clock has no row, and `automations` shows it only to whoever reads every list. */
  assert.equal(said('rule.nightly', { rule: 'nightly', on: { every: '1d' }, steps: [{ notify: { say: 'Night.' } }] }), ANY_LIST);
});

test('a script names its reads and writes, or any list when both are empty, and its source is not walked', () => {
  assert.equal(said('script.peek', { script: 'peek', reads: ['money'], writes: [], source: 'ctx.record.list("inbox")' }), 'money');
  assert.equal(said('script.post', { script: 'post', reads: [], writes: ['money'] }), 'money');
  assert.equal(said('script.ping', { script: 'ping', reads: [], writes: [] }), ANY_LIST);
});

test('a page names its lists, each figure through its metric, the runs, and a read across the record', () => {
  assert.equal(said('page.inbox', { page: 'inbox', blocks: [{ kind: 'table', source: 'register.inbox' }] }), 'inbox');
  assert.equal(said('page.figures', { page: 'figures', blocks: [{ kind: 'stat', cells: [{ metric: 'inbox-count' }] }] }), 'inbox');
  assert.equal(said('page.said', { page: 'said', blocks: [{ kind: 'note', body: '{{inbox-count}} rows, `{{money-count}}` is text' }] }), 'inbox');
  assert.equal(said('page.runs', { page: 'runs', blocks: [{ kind: 'table', source: 'sessions.live' }] }), 'session');
  assert.equal(said('page.working', { page: 'working', blocks: [{ kind: 'table', source: 'register.inbox', working: true }] }), 'inbox session');
  /* A log block reads across the record, and `page` refuses it to anybody who does not read all of it. */
  assert.equal(said('page.feed', { page: 'feed', blocks: [{ kind: 'feed', source: 'activity' }] }), ACROSS);
  assert.equal(said('page.ahead', { page: 'ahead', blocks: [{ kind: 'forecast', source: 'forecast.runway', from: [{ register: 'money' }] }] }), 'money');
  /* Prose that counts nothing names nothing, which the record reads as the record as a whole. */
  assert.equal(said('page.about', { page: 'about', blocks: [{ kind: 'note', body: 'Nothing here counts.' }] }), '');
  assert.equal(said('page.lost', { page: 'lost', blocks: [{ kind: 'stat', cells: [{ metric: 'nowhere-count' }] }] }), '| nowhere-count');
});

test("a template's {{field}} is the row's, resolved through the list it is for, and {{spoken}} is too", () => {
  /* The record read `{{from}}` as a figure nothing resolved, and held the bundle from Inbox's readers. */
  assert.equal(said('page.each-letter', { page: 'each-letter', for: { register: 'inbox' }, blocks: [{ kind: 'note', body: '{{from}} as {{spoken}}' }] }), 'inbox');
  assert.equal(said('page.each-letter', { page: 'each-letter', for: { register: 'inbox' }, blocks: [{ kind: 'note', body: '{{salary}}' }] }), 'inbox | salary');
  assert.equal(said('page.said', { page: 'said', blocks: [{ kind: 'note', body: 'This is {{spoken}}.' }] }), '| spoken');
});

test('a door names every list it writes, and a read across the record when it calls out', () => {
  assert.equal(said('ingest.payroll', DOORS.payroll), 'money');
  assert.equal(said('ingest.split', { ingest: 'split', channel: 'email', route: [{ writes: { register: 'money' } }, { writes: { register: 'inbox' } }] }), 'inbox money');
  /* `actions` refuses the gold door's host to anybody who does not read the whole record. */
  for (const channel of ['pull', 'call', 'poll']) assert.equal(said('ingest.gold', { ingest: 'gold', channel, writes: { register: 'inbox' } }), `${ACROSS} inbox`, channel);
});

test("a figure names its source's list, or any list when it names none, and so does a prediction's measure", () => {
  assert.equal(said('metric.omar', { metric: 'omar', source: 'register.money', where: { field: 'payee', is: 'Omar' } }), 'money');
  assert.equal(said('metric.', { source: 'register.inbox', value: { count: 'what' } }), 'inbox');
  assert.equal(said('metric.', { source: 'activity', value: { count: 'id' } }), ANY_LIST);
});

test('a digest, a theme and a block name every list and figure the walk finds', () => {
  assert.equal(said('digest.weekly', { digest: 'weekly', sections: [{ source: 'register.inbox' }, { source: 'metric.inbox-count' }] }), 'inbox');
  assert.equal(said('theme.plain', { theme: 'plain', tokens: { accent: '#335' } }), '');
  assert.equal(said('block.owed', { block: 'owed', source: 'register.money' }), 'money');
});

test('neither sentinel can be the id of a list, since a list called any installs', () => {
  for (const s of [ACROSS, ANY_LIST]) assert.doesNotMatch(s, /^[a-z][a-z0-9_]*$/);
  assert.equal(said('register.any', { id: 'any' }), 'any');
  assert.equal(said('page.x', 'not a map'), '');
});
