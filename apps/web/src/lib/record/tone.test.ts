/**
 * A row's tone says something, or the row has none.
 *
 * `toneOf` answered `good` for every row in one of its list's done states, so the Ledger, whose ordinary row is
 * `cleared`, drew a green dot on every line. A done state is good news where a row had to get there. A list whose state
 * field declares a done state as its default writes its rows already done: done there means recorded, and those rows
 * carry no tone. A late row keeps its tone either way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { REGISTERS, toRows, toneOf } from './api.ts';
import type { Entry, RegisterDecl } from './schema.ts';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const row = (fields: Record<string, unknown>): Entry => ({ seq: 1, fields }) as Entry;

/** A list declared here and taken away again, so the rule is held on a declaration and not on a seeded name. */
function declared<T>(decl: RegisterDecl, run: () => T): T {
  REGISTERS[decl.id] = decl;
  try {
    return run();
  } finally {
    delete REGISTERS[decl.id];
  }
}

const list = (id: string, born: string, due = false): RegisterDecl => ({
  id,
  name: id,
  one: id,
  title: 'what',
  mobile: ['what', 'state', 'what'],
  state: 'state',
  done: ['closed', 'void'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'state', type: 'enum', values: ['open', 'closed', 'void'], default: born },
    { id: 'due', type: 'day', ...(due ? { deadline: true } : {}) },
  ] as RegisterDecl['fields'],
});

test('A CLEARED TRANSACTION HAS NO TONE, and neither does a void one', () => {
  const ledger = REGISTERS.transactions;
  assert.ok(ledger?.done?.includes('cleared'), 'the Ledger no longer declares cleared as done');
  assert.equal(toneOf('transactions', row({ what: 'Rent', state: 'cleared', on: '2026-09-01' }), NOW), undefined);
  assert.equal(toneOf('transactions', row({ what: 'Refund', state: 'void', on: '2026-09-01' }), NOW), undefined);
  const [drawn] = toRows('transactions', [row({ what: 'Rent', state: 'cleared', on: '2026-09-01' })], [], NOW);
  assert.equal(drawn?.tone, undefined, 'the table still tones a cleared row');
});

test('A DONE TASK IS STILL GOOD, late or not', () => {
  assert.equal(toneOf('tasks', row({ what: 'Send the quote', state: 'done', by: '2026-09-01' }), NOW), 'good');
  assert.equal(toneOf('tasks', row({ what: 'Send the quote', state: 'done' }), NOW), 'good');
  const [drawn] = toRows('tasks', [row({ what: 'Send the quote', state: 'done' })], [], NOW);
  assert.equal(drawn?.tone, 'good');
});

test('A LATE ROW KEEPS ITS TONE, and one due soon keeps its own', () => {
  assert.equal(toneOf('tasks', row({ what: 'Send the quote', state: 'open', by: '2026-10-01' }), NOW), 'bad');
  assert.equal(toneOf('tasks', row({ what: 'Send the quote', state: 'open', by: '2026-10-20' }), NOW), 'warn');
  assert.equal(toneOf('tasks', row({ what: 'Send the quote', state: 'open', by: '2027-03-01' }), NOW), undefined);
});

test('EVERY SEEDED LIST BUT ONE BORN DONE KEEPS ITS GOOD TONE', () => {
  for (const r of Object.values(REGISTERS)) {
    if (!r.state || !r.done?.length) continue;
    const born = r.fields.find((f) => f.id === r.state)?.default;
    const recorded = typeof born === 'string' && r.done.includes(born);
    for (const state of r.done) assert.equal(toneOf(r.id, row({ [r.state]: state }), NOW), recorded ? undefined : 'good', `${r.name}, ${state}`);
  }
});

test('THE DECLARATION DECIDES, NOT THE NAME: a list whose rows start out done has no done tone, and its late rows keep theirs', () => {
  const shut = row({ what: 'a', state: 'closed' });
  declared(list('tone_work', 'open'), () => {
    assert.equal(toneOf('tone_work', shut, NOW), 'good', 'a list whose rows start open lost its good tone');
  });
  declared(list('tone_recorded', 'closed'), () => {
    assert.equal(toneOf('tone_recorded', shut, NOW), undefined, 'a list whose rows start out done toned them');
    assert.equal(toneOf('tone_recorded', row({ what: 'a', state: 'void' }), NOW), undefined);
  });
  declared(list('tone_recorded_due', 'closed', true), () => {
    assert.equal(toneOf('tone_recorded_due', shut, NOW), undefined);
    assert.equal(toneOf('tone_recorded_due', row({ what: 'a', state: 'open', due: '2026-10-01' }), NOW), 'bad', 'a late row lost its tone');
    assert.equal(toneOf('tone_recorded_due', row({ what: 'a', state: 'open', due: '2026-10-20' }), NOW), 'warn');
  });
});
