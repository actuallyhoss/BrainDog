/**
 * The spine appears as it is used, and the three bars read it from one function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BAR_SPINE, spineOf } from './spine.ts';

test('A YOUNG RECORD`S SPINE IS HOME, SLASH AND AUTOMATIONS: nothing has waited or arrived yet', () => {
  assert.deepEqual(spineOf({ decide: 0, inbox: 0, decided: 0, arrived: 0 }), ['home', 'slash', 'automations']);
});

test('DECIDE SHOWS ONCE A QUESTION HAS WAITED OR BEEN DECIDED, and stays when the queue is empty again', () => {
  assert.deepEqual(spineOf({ decide: 1, inbox: 0, decided: 0, arrived: 0 }), ['home', 'decide', 'slash', 'automations']);
  assert.deepEqual(spineOf({ decide: 0, inbox: 0, decided: 3, arrived: 0 }), ['home', 'decide', 'slash', 'automations']);
});

test('INBOX SHOWS ONCE ANYTHING HAS ARRIVED, even with nothing waiting in it now', () => {
  assert.deepEqual(spineOf({ decide: 0, inbox: 0, decided: 0, arrived: 2 }), ['home', 'inbox', 'slash', 'automations']);
});

test('A CALLER TOLD `null` ABOUT THE INBOX IS NOT SHOWN ONE', () => {
  assert.deepEqual(spineOf({ decide: 0, inbox: null, decided: 0, arrived: null }), ['home', 'slash', 'automations']);
});

test('A HOST OLDER THAN THE FIELDS IS READ FROM WHAT IT SENT, and no counts draw Home, Slash and Automations', () => {
  assert.deepEqual(spineOf({ decide: 0, inbox: 4 }), ['home', 'inbox', 'slash', 'automations']);
  assert.deepEqual(spineOf(undefined), ['home', 'slash', 'automations']);
});

test('THE BARS CARRY HOME, DECIDE AND INBOX ONLY, in the spine`s order', () => {
  const all = spineOf({ decide: 1, inbox: 1, decided: 1, arrived: 1 });
  assert.deepEqual(
    all.filter((k) => BAR_SPINE.has(k)),
    ['home', 'decide', 'inbox'],
  );
});
