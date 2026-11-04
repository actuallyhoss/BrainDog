import { test } from 'node:test';
import assert from 'node:assert/strict';

import { doneEffects, plannedEffects, said, windowOf, type Ev } from './task-effects.ts';

const ev = (ts: string, extra: Partial<Ev>): Ev => ({ ts: `2026-10-20T${ts}:00Z`, actor: 'agent:a', kind: 'update', ...extra });
/* FINISHED BY AN AGENT'S RUN, which is what says a window's changes are the task's (1ca2e89d2). */
const task = [ev('08:00', { kind: 'create', actor: 'p_1' }), ev('11:00', { field: 'state', from: 'open', to: 'done', register: 'jobs', seq: 7, run_by: { run: 'S1' } })];
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

  /* A PERSON'S HAND ACROSS THE SAME HOURS IS EVERYTHING THEY DID, so a task a person finished says nothing of it. */
  const byHand = windowOf([task[0]!, ev('11:00', { actor: 'p_1', field: 'state', from: 'open', to: 'done', register: 'jobs', seq: 7 })], 'state', ['done']);
  assert.equal(byHand?.run, null);
  assert.deepEqual(doneEffects({ register: 'jobs', seq: 7 }, byHand, recent.map((e) => ({ ...e, actor: 'p_1' }))), []);
});

test('a change that nets to nothing, or has no short words, is not shown', () => {
  const recent = [
    ev('09:00', { register: 'a', seq: 1, field: 'f', from: 'x', to: 'y' }),
    ev('10:00', { register: 'a', seq: 1, field: 'f', from: 'y', to: 'x' }),
    ev('10:10', { register: 'a', seq: 2, field: 'g', from: [1], to: [2] }),
    ev('10:20', { register: 'a', seq: 3, field: 'h', from: 'x', to: 'y' }),
  ];
  assert.equal(doneEffects({ register: 'jobs', seq: 7 }, win, recent).length, 1, 'and one that does change is shown, so this reads the window at all');
  recent.pop();
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
