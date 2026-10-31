/**
 * A shared page's opening line reads as the app's (`leadOf`): a clause whose figure is nought or not shown goes on its
 * own, the plurals are settled, and the line starts on a capital and ends on a stop. And the lists are read in the words
 * the speaking use case gives them (`voiced`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RegisterDecl } from '@braindog/kernel';

import { addressOnly, badSaid, leadShown, pluralsSettled, voiced } from '../src/methods/shares.ts';

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

test('Team\'s and Student\'s lines say no "(s)" and no nought on a link (AM7)', () => {
  assert.equal(leadShown('{{tickets-planned}} ticket(s) planned into sprints, {{tickets-blocked}} blocked', said({ 'tickets-planned': '0', 'tickets-blocked': '0' })), '');
  assert.equal(leadShown('{{tickets-planned}} ticket(s) planned into sprints, {{tickets-blocked}} blocked', said({ 'tickets-planned': '1', 'tickets-blocked': '0' })), '1 ticket planned into sprints.');
  assert.equal(leadShown('{{homework-open}} piece(s) of work to hand in, {{courses-held}} course(s)', said({ 'homework-open': '2', 'courses-held': '0' })), '2 pieces of work to hand in.');
});

test('a list is read in the use case\'s words: its row word, a field\'s label and its values', () => {
  const tasks = { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'state', type: 'enum', values: ['open'], labels: {} }] } as unknown as RegisterDecl;
  const lists = voiced(new Map([['tasks', tasks]]), { tasks: 'Tickets', 'tasks:one': 'ticket', 'tasks.state.open': 'To do' });
  const t = lists.get('tasks') as RegisterDecl & { one?: string };
  assert.equal(t.name, 'Tickets');
  assert.equal(t.one, 'ticket');
  assert.equal(t.fields[0]?.labels?.open, 'To do');
});

test('a sentence of the owner\'s own words that says an id is left out of the opening line (RM6)', () => {
  const fill = said({ open: '4' });
  assert.equal(leadShown('Ship D41 before Friday. {{open}} open ticket(s).', fill), '4 open tickets.');
  assert.equal(leadShown('Run S42 is late. Kept as tasks#3 for now.', fill), '');
  assert.equal(leadShown('{{open}} open ticket(s), see SG31.', fill), '');
  assert.equal(leadShown('Building a shed for the bikes. {{open}} open ticket(s).', fill), 'Building a shed for the bikes. 4 open tickets.');
});

test('a linked row named by an address or a phone number is not named on a link (RM2)', () => {
  assert.equal(addressOnly('lund@clinic.example'), true);
  assert.equal(addressOnly('Lund <lund@clinic.example>'), true);
  assert.equal(addressOnly('+44 20 7946 0958'), true);
  assert.equal(addressOnly('Mia Lund'), false);
  assert.equal(addressOnly('2026-10-31'), false);
  assert.equal(addressOnly('Run 100 km'), false);
});

test('a word in the danger colour is said as its words on a link (AN3)', () => {
  assert.equal(leadShown(badSaid('Bills {{bad:late}}: {{overdue}} to pay.'), said({ overdue: '£10,540' })), 'Bills late: £10,540 to pay.');
  assert.equal(badSaid('{{bad:{{tasks.late}} late}} and more'), '{{tasks.late}} late and more');
  assert.equal(badSaid('{{ bad : late {estimate}}}'), 'late {estimate}');
  assert.equal(badSaid('{{bad:overdue'), '{{bad:overdue');
});
