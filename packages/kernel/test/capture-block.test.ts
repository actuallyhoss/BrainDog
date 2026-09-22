/**
 * A `capture` block on a page: the one-line add, declared rather than built into one route.
 *
 * WHAT THE RECORD ANSWERS IS WHAT A NEW ROW WOULD BE FILLED WITH, and nothing else. A capture reads no
 * rows, so its answer is the register it writes to and the equalities its `where:` pins, which the host
 * hands to `oncapture` beside the text a person typed. `apps/web`'s sample engine answers the same
 * question from `inheritedFrom`, and `apps/web/src/lib/record/capture-block.test.ts` holds the two to one
 * answer over the seed's own tasks.
 *
 * IT IS AS NARROW AS THE GRID'S ADD, for the grid's reasons (`api.ts` `inheritedFrom`): `is` with one
 * value, on an enum or a text field, and never the title. A set, a date and a link are each a way to
 * write a value nobody chose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const OWNER = { actor: 'p_1' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['backlog', 'open', 'doing', 'done'], labels: { backlog: 'Later' }, default: 'open', required: true },
      { id: 'agent', type: 'text', index: true },
      { id: 'by', type: 'day', index: true },
      { id: 'parent', type: 'ref', to: 'tasks' },
    ],
  } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.today',
  kind: 'page',
  body: { page: 'today', title: 'Today', requires: ['register.tasks'], blocks } as never,
});

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([TASKS]);
  assert.ok(out.ok, JSON.stringify(out));
  const made = k.create('tasks', { what: 'Chase Halden' }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  return k;
}

test('A CAPTURE BLOCK INSTALLS, bound by register: to a list the page requires', () => {
  assert.equal(validateDeclaration(pageOf({ kind: 'capture', heading: 'What needs doing?', register: 'tasks', where: 'state is open' })), null);
});

test('AND A CAPTURE INTO A LIST THE PAGE DOES NOT REQUIRE, or one that also reads, is refused where it is declared', () => {
  /* A BARE CAPTURE INSTALLS, as a bare `diff` does, and its read is what refuses it (the last test here):
     `declare.test.ts` installs every kind with nothing else on it, and requiring a key per kind is not the
     install check's to decide. */
  assert.equal(validateDeclaration(pageOf({ kind: 'capture', heading: 'What needs doing?' })), null);
  assert.equal(validateDeclaration(pageOf({ kind: 'capture', register: 'Tasks!' }))?.code, 'DECLARATION_INVALID');
  assert.equal(validateDeclaration(pageOf({ kind: 'capture', register: 'people' }))?.code, 'DEPENDENCY_UNRESOLVED');
  /* A CAPTURE WRITES AND READS NOTHING, so a source on it is a second block somebody meant to declare. */
  assert.equal(validateDeclaration(pageOf({ kind: 'capture', register: 'tasks', source: 'register.tasks' }))?.code, 'DECLARATION_INVALID');
});

test('THE ANSWER IS WHAT A NEW ROW IS FILLED WITH: each `is` of one value, on an enum or a text field, in its stored form', async () => {
  const k = await record();
  const out = k.block({ kind: 'capture', heading: 'What needs doing?', register: 'tasks', where: 'state is Later, agent is claude' } as never);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.fills, { state: 'backlog', agent: 'claude' }, 'the label Later is the value backlog, as the record stores it');
  assert.deepEqual(out.rows, [], 'a capture reads no rows');
  assert.equal(out.matched, 0);
});

test('A SET, A DATE, A LINK AND THE TITLE ARE NEVER FILLED IN, because each would be a value nobody chose', async () => {
  const k = await record();
  for (const where of ['state is open or doing', 'by before today', 'parent is Chase Halden', 'what is Rent', 'state is not done']) {
    const out = k.block({ kind: 'capture', register: 'tasks', where } as never);
    assert.deepEqual(out.refusals, [], where);
    assert.deepEqual(out.fills, {}, where);
  }
  /* AND NO `where:` IS NOTHING PINNED, which is a capture into the list as its defaults leave it. */
  assert.deepEqual(k.block({ kind: 'capture', register: 'tasks' } as never).fills, {});
});

test('A CAPTURE INTO A LIST THE RECORD DOES NOT HOLD, or under a filter it cannot read, says so and fills nothing', async () => {
  const k = await record();
  const nowhere = k.block({ kind: 'capture', register: 'nowhere' } as never);
  assert.equal(nowhere.refusals[0]?.code, 'REGISTER_UNKNOWN');
  assert.equal(nowhere.fills, undefined);
  const astray = k.block({ kind: 'capture', register: 'tasks', where: 'colour is red' } as never);
  assert.equal(astray.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(astray.fills, undefined);
  const unbound = k.block({ kind: 'capture' } as never);
  assert.equal(unbound.refusals[0]?.code, 'REQUIRED_MISSING');
});

test('A CAPTURE WHOSE where: NAMES A FIELD ITS LIST LACKS IS REFUSED AT INSTALL, as a table over that list is', async () => {
  /* The install lint in `index.ts` read a block's `where:` only against a `register.` SOURCE, and a
     capture binds its list through `register:` and has no source, so this installed clean and then
     drew its refusal on every open, the failure that lint exists to prevent. Found by batch
     twenty-six's checker. */
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([TASKS, pageOf({ kind: 'capture', register: 'tasks', where: 'colour is red' })]);
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.equal((out as { refusal?: { code?: string } }).refusal?.code, 'FIELD_UNKNOWN', JSON.stringify(out));
});
