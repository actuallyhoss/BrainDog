/**
 * The approval says what a scheduled action writes ("the install shows every host an action calls, and how
 * often;"): the list, the project and each measure, by name, in one sentence under the call line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOMAINS, PROJECTS } from '../../../fixtures/names.ts';
import { namerOf, normalise, plan, writesLine, writesOf, type Installed, type Pack } from '../src/index.ts';

const PROJECT_ID = '01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NUMBERS = {
  register: 'datapoints',
  name: 'Numbers',
  title: 'name',
  fields: [
    { id: 'name', label: 'Measure', type: 'text', required: true },
    { id: 'value', label: 'Value', type: 'decimal' },
    { id: 'at', label: 'When', type: 'instant' },
  ],
};
const ORDERS = { register: 'orders', name: 'Orders', title: 'ref', fields: [{ id: 'ref', label: 'Order', type: 'text' }, { id: 'total_due', type: 'decimal' }] };

const measure = (name: string, path: string) => ({ name: { value: name }, value: { path, type: 'decimal' }, at: { arrived: true } });
const POLL = {
  ingest: 'numbers',
  channel: 'poll',
  url: `https://stats.${DOMAINS[1]}/v1/numbers`,
  every: '1h',
  project: PROJECT_ID,
  map: [measure('Revenue', 'data.mrr'), measure('Customers', 'data.customers'), measure('Orders', 'data.orders')],
  writes: { register: 'datapoints' },
};

const nameOf = namerOf(
  [
    { kind: 'register', body: { id: 'datapoints', name: 'Numbers', fields: NUMBERS.fields } },
    { kind: 'register', body: { id: 'orders', name: 'Orders', fields: ORDERS.fields } },
  ],
  [],
  (ref) => (ref === PROJECT_ID ? PROJECTS[0] : null),
);

test('A POLL WRITING THREE MEASURES ON ONE PROJECT names the list, the project and each measure', () => {
  const w = writesOf(POLL, nameOf);
  assert.deepEqual(w, { list: 'Numbers', project: PROJECTS[0], measures: ['Revenue', 'Customers', 'Orders'] });
  assert.equal(writesLine(w!), `Writes Numbers on ${PROJECTS[0]}: Revenue, Customers, Orders.`);
});

test('A PROJECT THE RECORD CANNOT NAME is never said by its row id, and an unnamed list is said in words', () => {
  const w = writesOf({ ...POLL, project: '01JZ8QK3F7R2M9V4XN6TCB5HAE', writes: { register: 'shop_numbers' } }, () => null);
  assert.equal(w!.project, 'another project');
  assert.equal(w!.list, 'shop numbers');
  assert.equal(writesOf({ ...POLL, project: 'oxbow' }, () => null)!.project, 'oxbow', 'a project written as words is said as written');
});

test('A PULL WRITING A LIST EVERYWHERE names the fields it reads by their labels, and an unlabelled one in words', () => {
  const pull = { ingest: 'orders', channel: 'pull', every: '6h', grant: 'g_1', extract: { ref: {}, total_due: {} }, writes: { register: 'orders' } };
  const w = writesOf(pull, nameOf);
  assert.deepEqual(w, { list: 'Orders', project: 'everywhere', measures: ['Order', 'total due'] });
  assert.equal(writesLine(w!), 'Writes Orders everywhere: Order, total due.');
  assert.equal(writesLine({ list: 'Orders', project: 'everywhere', measures: [] }), 'Writes Orders everywhere.');
});

test('A CALL THAT WRITES NOTHING answers null, and so does a poll with no mapping and anything that is not an action', () => {
  const call = { ingest: 'ping', channel: 'call', url: `https://hooks.${DOMAINS[2]}/in`, every: '15m', grant: 'hook key', body: { text: 'up' } };
  assert.equal(writesOf(call, nameOf), null);
  assert.equal(writesOf({ ...call, writes: { register: 'orders' } }, nameOf), null, 'a call without extract or map files nothing');
  assert.equal(writesOf({ ...POLL, map: undefined }, nameOf), null);
  assert.equal(writesOf({ script: 'rate', source: '' }, nameOf), null);
  assert.equal(writesOf(null, nameOf), null);
});

test('THE "3 MORE" CUT: past three, two measures are named and the rest counted', () => {
  const five = { ...POLL, map: ['Revenue', 'Customers', 'Orders', 'Refunds', 'Visits'].map((m, i) => measure(m, `data.m${i}`)) };
  assert.equal(writesLine(writesOf(five, nameOf)!), `Writes Numbers on ${PROJECTS[0]}: Revenue, Customers, 3 more.`);
});

test('THE PLAN CARRIES IT on the poll\'s calls_out entry, says the floor, and leaves an action that names nothing as it was', async () => {
  const doc = {
    pack: 'stats-feed',
    version: '1.0.0',
    summary: 'Numbers, hourly.',
    author: 'Example',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      NUMBERS,
      { ...POLL, every: '6h', floor: '6h' },
      { ingest: 'balance', channel: 'poll', url: `https://api.${DOMAINS[3]}/v1/balance`, every: '1h', grant: 'read', extract: {}, writes: { register: 'datapoints' } },
    ],
    seeds: [],
  };
  const pack = await normalise(doc);
  assert.ok(pack.ok, JSON.stringify(pack));
  const installed: Installed = { format: 1, primitives: 1, record_version: 3, packs: [], declarations: [], rows: {}, nameOf: (ref) => (ref === PROJECT_ID ? PROJECTS[0] : null) };
  const diff = await plan(pack.value as Pack, installed);
  const [numbers, balance] = diff.calls_out;
  assert.equal(numbers!.writes_line, `Writes Numbers on ${PROJECTS[0]}: Revenue, Customers, Orders.`);
  assert.deepEqual(numbers!.writes, { list: 'Numbers', project: PROJECTS[0], measures: ['Revenue', 'Customers', 'Orders'] });
  assert.equal(numbers!.at_floor, true);
  assert.equal('writes' in balance!, false, 'a mapping that names no field says nothing new');
  assert.equal('writes_line' in balance!, false);
  assert.equal('at_floor' in balance!, false);
});
