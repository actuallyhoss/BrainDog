/**
 * How a person keeps a list: the field its board is laid out by, and the default it opens on. Both turn on their
 * arguments alone, so the list below is written here, and the device's storage is a map or one that throws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, RegisterDecl } from '../../../../lib/record/schema.ts';
import {
  arrivedAt,
  defaultFrom,
  defaultKey,
  defaultParams,
  laneChoicesOf,
  laneFieldOf,
  lanesOf,
  readDefault,
  sameDefault,
  standOf,
  viewOf,
  writeDefault,
  type Keep,
} from './list.ts';

const tasks = {
  id: 'tasks',
  name: 'Tasks',
  one: 'task',
  title: 'what',
  mobile: ['what', 'due'],
  state: 'state',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'due', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['open', 'doing', 'done'] },
    { id: 'priority', type: 'enum', values: ['high', 'low'] },
    { id: 'kind', type: 'enum', values: ['one'] },
    { id: 'old', type: 'enum', values: ['a', 'b'], retired: true },
    { id: 'bucket', type: 'enum', values: Array.from({ length: 13 }, (_, i) => `b${i}`) },
  ],
} as unknown as RegisterDecl;

/* A list with no state, whose only choice is how hot a lead is. */
const leads = {
  id: 'leads',
  name: 'Leads',
  one: 'lead',
  title: 'name',
  mobile: ['name'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'heat', type: 'enum', values: ['cold', 'warm', 'hot'] },
  ],
} as unknown as RegisterDecl;

let seq = 0;
const row = (fields: Entry['fields']): Entry => ({ seq: ++seq, fields, version: 1, created: '2026-09-20T09:00:00.000Z', by: '' });

test('the lanes on offer are every live choice of two to twelve values, the state first', () => {
  assert.deepEqual(
    laneChoicesOf(tasks).map((f) => f.id),
    ['state', 'priority'],
  );
  assert.deepEqual(laneChoicesOf(undefined), []);
});

test('a chosen lane field lays the board out by it, and a field that is not a choice falls back to the state', () => {
  assert.equal(laneFieldOf(tasks)?.id, 'state');
  assert.equal(laneFieldOf(tasks, 'priority')?.id, 'priority');
  assert.equal(laneFieldOf(tasks, 'kind')?.id, 'state');
  assert.equal(laneFieldOf(tasks, 'bucket')?.id, 'state');
  assert.equal(laneFieldOf(tasks, 'old')?.id, 'state');

  const rows = [row({ what: 'Bake', priority: 'low' }), row({ what: 'Ship', priority: 'high' }), row({ what: 'Plan' })];
  const lanes = lanesOf(tasks, rows, 'priority');
  assert.deepEqual(
    lanes.map((l) => [l.value, l.entries.map((e) => e.fields.what)]),
    [
      ['high', ['Ship']],
      ['low', ['Bake']],
      [null, ['Plan']],
    ],
  );
});

test('a list with no state is a board by its first choice field', () => {
  assert.equal(laneFieldOf(leads)?.id, 'heat');
  assert.equal(viewOf('board', leads), 'board');
  const people = { ...leads, fields: [{ id: 'name', type: 'text' }] } as unknown as RegisterDecl;
  assert.equal(viewOf('board', people), 'table');
});

/* A list of people that says which organisation each is with: `meets:` naming an `org` that links to one row. */
const contacts = {
  ...leads,
  id: 'contacts',
  meets: { name: 'name', org: 'org' },
  fields: [
    { id: 'name', type: 'text' },
    { id: 'org', type: 'ref', to: 'companies' },
  ],
} as unknown as RegisterDecl;

test('A LIST OF PEOPLE BY ORGANISATION OPENS GROUPED, and its table is still one address away', () => {
  assert.equal(viewOf(null, contacts), 'groups');
  assert.equal(viewOf('table', contacts), 'table');
  assert.equal(viewOf('groups', contacts), 'groups');
  assert.equal(viewOf(null, leads), 'table');
  assert.equal(viewOf('groups', leads), 'table', 'a list with nothing to group by is never grouped');

  assert.equal(defaultParams({ view: 'table', hidden: [] }, contacts).params.toString(), 'view=table');
  assert.equal(defaultParams({ view: 'groups', hidden: [] }, contacts).params.toString(), '');
  assert.equal(defaultParams({ view: 'groups', hidden: [] }, leads).params.toString(), '');
  assert.equal(defaultParams({ view: 'table', hidden: [] }, leads).params.toString(), '');
  assert.deepEqual(defaultFrom(new URLSearchParams('view=table'), new Set()).view, 'table');
});

test('keeping a default and reading it back, per record, person and list', () => {
  const map = new Map<string, string>();
  const store: Keep = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  const key = defaultKey('home', 'p1', 'tasks');
  assert.notEqual(key, defaultKey('home', 'p2', 'tasks'));
  assert.notEqual(key, defaultKey('home', 'p1', 'bills'));

  const kept = defaultFrom(new URLSearchParams('sort=due:desc&view=board&lane=priority&f=state:is:open'), new Set(['due']));
  assert.deepEqual(kept, { sort: 'due:desc', view: 'board', lane: 'priority', hidden: ['due'] });
  /* A lane left behind by a board switched back to the table is not part of how the list is drawn. */
  assert.deepEqual(defaultFrom(new URLSearchParams('lane=priority'), new Set()), { sort: undefined, view: undefined, lane: undefined, hidden: [] });
  assert.ok(sameDefault(defaultFrom(new URLSearchParams('lane=priority'), new Set()), defaultFrom(new URLSearchParams(''), new Set())));
  assert.equal(writeDefault(store, key, kept), true);
  assert.ok(sameDefault(readDefault(store, key), kept));

  assert.equal(writeDefault(store, key, null), true);
  assert.equal(readDefault(store, key), null);
});

test('a device that will not keep anything opens the list in its own order and does not throw', () => {
  const broken: Keep = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.equal(readDefault(broken, 'k'), null);
  assert.equal(writeDefault(broken, 'k', { hidden: [] }), false);
  assert.equal(readDefault(null, 'k'), null);
  const junk: Keep = { getItem: () => '{nope', setItem: () => {}, removeItem: () => {} };
  assert.equal(readDefault(junk, 'k'), null);
});

test('a default is held up against what the list declares now', () => {
  const { params, hidden } = defaultParams({ sort: 'due:desc', view: 'board', lane: 'priority', hidden: ['due', 'what', 'gone'] }, tasks);
  assert.equal(params.toString(), 'sort=due%3Adesc&view=board&lane=priority');
  assert.deepEqual(hidden, ['due']);

  /* A field that left, a lane that is not a choice, and a board on a list with nothing to lay out. */
  assert.equal(defaultParams({ sort: 'gone:asc', view: 'board', lane: 'kind', hidden: [] }, tasks).params.toString(), 'view=board');
  const people = { ...leads, fields: [{ id: 'name', type: 'text' }] } as unknown as RegisterDecl;
  assert.equal(defaultParams({ sort: 'name:asc', view: 'board', hidden: [] }, people).params.toString(), 'sort=name%3Aasc');
  assert.equal(defaultParams({ hidden: [] }, tasks).params.toString(), '');
});

test('A LIST OPENED AT ITS OWN ADDRESS ARRIVES, and a first load whose `from` has no address does not throw', () => {
  const at = (path: string) => ({ url: new URL(`https://brain.dog/app/mara${path}`), params: { register: 'tasks' } });
  /* SvelteKit's first navigation in a static shell: `from` is the router's state before it had an address. */
  const nowhere = { url: null, params: null };
  assert.equal(arrivedAt(nowhere, at('/r/tasks')), 'tasks', 'a direct load is an arrival, and it threw on `from.url.pathname`');
  assert.equal(arrivedAt(null, at('/r/tasks')), 'tasks');
  assert.equal(arrivedAt({ url: new URL('https://brain.dog/app/mara/p/money'), params: null }, at('/r/tasks')), 'tasks', 'from another page');
  assert.equal(arrivedAt(at('/r/tasks'), at('/r/tasks')), null, 'a move inside the list is not an arrival');
  assert.equal(arrivedAt(nowhere, at('/r/tasks?sort=due:asc')), null, 'an address that asks already is kept');
  assert.equal(arrivedAt(nowhere, null), null);
  assert.equal(arrivedAt(nowhere, { url: null, params: null }), null);
});

test('a row stands open, done or late, by what the list declares finished and nothing else', () => {
  assert.equal(standOf(tasks, 'open', false), 'open');
  assert.equal(standOf(tasks, 'doing', false), 'open');
  assert.equal(standOf(tasks, 'done', false), 'done');
  /* LATE OUTRANKS THE WORD, and a finished row is never late, whatever its date. */
  assert.equal(standOf(tasks, 'doing', true), 'late');
  assert.equal(standOf(tasks, 'done', true), 'done');
  /* A LIST THAT DECLARES NOTHING FINISHED has every row open. */
  assert.equal(standOf(leads, 'warm', false), 'open');
});
