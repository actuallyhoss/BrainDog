/**
 * A shared page's opening line reads as the app's (`leadOf`): a clause whose figure is nought or not shown goes on its
 * own, the plurals are settled, and the line starts on a capital and ends on a stop. And the lists are read in the words
 * the speaking use case gives them (`voiced`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RegisterDecl } from '@braindog/kernel';

import { leadShown, pluralsSettled, voiced } from '../src/methods/shares.ts';

const said = (values: Record<string, string>) => (key: string): string | undefined => values[key];

test('plurals are settled by their figures, and a verb after names agrees', () => {
  assert.equal(pluralsSettled('{{a}} goal(s) and {{b}} habit(s)', said({ a: '3', b: '1' })), '{{a}} goals and {{b}} habit');
  assert.equal(pluralsSettled('{{x.names}} need(s) a push', said({ 'x.names': 'Kiln' })), '{{x.names}} needs a push');
});

test('a clause that is nought or not shown goes alone, and the line is a sentence', () => {
  const fill = said({ cash: 'EGP 0', accounts: '0', days: '5', goals: '3', habits: '2' });
  assert.equal(leadShown('Cash is {{cash}} across {{accounts}} account(s), and on what is due it runs out in {{days}} day(s)', fill), 'On what is due it runs out in 5 days.');
  assert.equal(leadShown('{{saved}} saved so far, {{goals}} goal(s) and {{habits}} habit(s) on the go', fill), '3 goals and 2 habits on the go.');
  assert.equal(leadShown('{{none}} ticket(s) with an agent, {{zero}} finished by agents', said({ none: '0', zero: '0' })), '');
  assert.equal(leadShown('Building a shed for the bikes', fill), 'Building a shed for the bikes.');
});

test('a list is read in the use case\'s words: its row word, a field\'s label and its values', () => {
  const tasks = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'state', type: 'enum', values: ['open'], labels: {} }] } as unknown as RegisterDecl;
  const lists = voiced(new Map([['tasks', tasks]]), { tasks: 'Tickets', 'tasks:one': 'ticket', 'tasks.state.open': 'To do' });
  const t = lists.get('tasks') as RegisterDecl & { one?: string };
  assert.equal(t.name, 'Tickets');
  assert.equal(t.one, 'ticket');
  assert.equal(t.fields[0]?.labels?.open, 'To do');
});
