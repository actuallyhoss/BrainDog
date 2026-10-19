import { test } from 'node:test';
import assert from 'node:assert/strict';

import { doneEffects, plannedEffects, said, windowOf, type Ev } from './task-effects.ts';

const ev = (ts: string, extra: Partial<Ev>): Ev => ({ ts: `2026-10-20T${ts}:00Z`, actor: 'agent:a', kind: 'update', ...extra });
const task = [ev('08:00', { kind: 'create', actor: 'p_1' }), ev('11:00', { field: 'state', from: 'open', to: 'done', register: 'jobs', seq: 7 })];
const win = windowOf(task, 'state', ['done']);

test('the window runs from the task creation to the line that finished it', () => {
  assert.equal(win?.actor, 'agent:a');
  assert.equal(win!.to - win!.from, 3 * 3_600_000);
  assert.equal(windowOf(task, 'state', []), null);
  assert.equal(windowOf(task.slice(0, 1), 'state', ['done']), null);
});

test('rows the finisher touched inside the window come back net, before to after', () => {
  const recent = [
    ev('09:00', { register: 'bills', seq: 2, title: 'Rent', field: 'status', from: 'due', to: 'part' }),
    ev('10:00', { register: 'bills', seq: 2, title: 'Rent', field: 'status', from: 'part', to: 'paid' }),
    ev('10:30', { register: 'bills', seq: 3, title: 'Gas', field: 'status', from: 'due', to: 'paid', actor: 'p_9' }),
    ev('12:00', { register: 'bills', seq: 4, title: 'Late', field: 'status', from: 'due', to: 'paid' }),
    ev('10:45', { register: 'jobs', seq: 7, field: 'note', from: '', to: 'x' }),
  ];
  assert.deepEqual(doneEffects({ register: 'jobs', seq: 7 }, win, recent), [{ what: 'Rent: status', before: 'due', after: 'paid' }]);
});

test('a change that nets to nothing, or has no short words, is not shown', () => {
  const recent = [
    ev('09:00', { register: 'a', seq: 1, field: 'f', from: 'x', to: 'y' }),
    ev('10:00', { register: 'a', seq: 1, field: 'f', from: 'y', to: 'x' }),
    ev('10:10', { register: 'a', seq: 2, field: 'g', from: [1], to: [2] }),
  ];
  assert.deepEqual(doneEffects({ register: 'jobs', seq: 7 }, win, recent), []);
});

test('a description that names a field change plans it; one that does not plans none', () => {
  assert.deepEqual(plannedEffects('Then set status to paid.'), [{ what: 'status', before: null, after: 'paid' }]);
  assert.deepEqual(plannedEffects('Change the due date of the invoice to 2026-11-01'), [{ what: 'due date', before: null, after: '2026-11-01' }]);
  assert.deepEqual(plannedEffects('Ring the plumber and ask about Tuesday'), []);
  assert.deepEqual(plannedEffects(null), []);
});

test('values are said short, money in its own currency, and long text is dropped', () => {
  assert.equal(said(null), 'empty');
  assert.equal(said(true), 'yes');
  assert.equal(said('on_hold'), 'on hold');
  assert.equal(said('x'.repeat(41)), null);
  assert.match(said({ amount: 2500, currency: 'GBP' }) ?? '', /25/u);
});
