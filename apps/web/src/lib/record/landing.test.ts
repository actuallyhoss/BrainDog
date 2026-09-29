/**
 * WHERE A COLLEAGUE INVITED TO SOME LISTS, AND NOT TO THE RECORD, LANDS.
 *
 * MEASURED THROUGH THE REAL SEED: a bookkeeper given
 * `write` on one empty list opened the product to "Nothing in the record yet." and `Start here`, and
 * `Start here` led to tiles that set up a brand new record and that the record then refused. Their
 * list answered `list` and `create` the whole time; nothing on any screen pointed at it. This is the
 * one answer every screen asks, so Home and `/start` cannot come to two different conclusions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutOf } from './boot-live.ts';
import { landing } from './landing.ts';

const NOW = '2026-09-22T09:00:00.000Z';
const person = (level: string | null) => ({ kind: 'person', person: 'p_9', name: null, level });

test('a colleague invited to one list lands on that list, by its name', () => {
  const shell = layoutOf({ registers: [{ id: 'expenses', name: 'Expenses', count: 0 }], me: person(null), now: NOW } as never);
  assert.deepEqual(landing(shell), { kind: 'list', href: '/r/expenses', name: 'Expenses' });
});

test('a colleague invited to two lists is offered both, in the order the record sent them', () => {
  const shell = layoutOf({
    registers: [
      { id: 'tasks', name: 'Tasks', count: 27 },
      { id: 'expenses', name: 'Expenses', count: 0 },
    ],
    me: person(null),
    now: NOW,
  } as never);
  assert.deepEqual(landing(shell), {
    kind: 'lists',
    lists: [
      { href: '/r/tasks', name: 'Tasks' },
      { href: '/r/expenses', name: 'Expenses' },
    ],
  });
});

test('an owner and a reader of the whole record land nowhere in particular', () => {
  const regs = [{ id: 'expenses', name: 'Expenses', count: 0 }];
  assert.equal(landing(layoutOf({ registers: regs, me: person('owner'), now: NOW } as never)), null);
  assert.equal(landing(layoutOf({ registers: regs, me: person('read'), now: NOW } as never)), null);
  /* A TOKEN WITH NO LEVEL IS NOT A COLLEAGUE, and no screen should greet it as one. */
  assert.equal(landing(layoutOf({ registers: regs, me: { kind: 'token', person: null, name: null, level: null }, now: NOW } as never)), null);
  /* AND A PERSON THE RECORD ANSWERED WITH NO LISTS AT ALL HAS NOTHING TO BE SENT TO. */
  assert.equal(landing(layoutOf({ registers: [], me: person(null), now: NOW } as never)), null);
});

test('the list is called by the name the shell calls it, which is the voice the record speaks in', () => {
  const shell = layoutOf({ registers: [{ id: 'expenses', name: 'Expenses', count: 0 }], me: person(null), now: NOW } as never);
  /* `+layout.ts` renames `lists` to the use case's words after `layoutOf`, so the landing reads them there. */
  shell.lists = [{ id: 'expenses', name: 'Receipts' }];
  assert.deepEqual(landing(shell), { kind: 'list', href: '/r/expenses', name: 'Receipts' });
});
