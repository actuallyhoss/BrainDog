/** `phone-ask.ts`: a phone asks Today without the widgets its board hides, and puts them back with nothing drawn. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leftBlock, phoneAsk, withLeft } from './phone-ask.ts';

const BODY = {
  page: 'today',
  title: 'Today',
  board: true,
  phone: { order: ['needs-you', 'late', 'numbers', 'projects'], sizes: { late: 'large', projects: 'wide' }, hidden: ['numbers', 'projects'] },
  blocks: [
    { kind: 'capture', heading: 'Add a task' },
    { kind: 'queue', key: 'needs-you', size: 'large' },
    { kind: 'todo', key: 'late', size: 'large' },
    { kind: 'kpis', key: 'numbers', size: 'full' },
    { kind: 'cards', key: 'projects', size: 'full' },
  ],
};

test('THE PHONE ASKS NO WIDGET IT HIDES, and its arrangement names only what it still asks', () => {
  const { asked, left } = phoneAsk(BODY);
  assert.deepEqual(asked.blocks.map((b) => b.key ?? b.kind), ['capture', 'needs-you', 'late']);
  assert.deepEqual(left.map((b) => b.key), ['numbers', 'projects']);
  assert.deepEqual(asked.phone.order, ['needs-you', 'late']);
  assert.deepEqual(asked.phone.sizes, { late: 'large' });
  assert.deepEqual(asked.phone.hidden, []);
  /* THE BODY ITSELF IS NOT CHANGED: it is what the board is kept from. */
  assert.equal(BODY.blocks.length, 5);
});

test('A BODY THAT HIDES NOTHING ON THE PHONE IS ASKED AS IT IS', () => {
  const plain = { ...BODY, phone: { ...BODY.phone, hidden: [] } };
  assert.equal(phoneAsk(plain).asked, plain);
  assert.deepEqual(phoneAsk(plain).left, []);
});

test('WHAT WAS LEFT OUT IS PUT BACK WHERE THE BODY HAS IT, with nothing drawn', () => {
  const { asked, left } = phoneAsk(BODY);
  const drawn: { kind: string; key?: string; drawn: boolean }[] = asked.blocks.map((b) => ({ ...b, drawn: true }));
  const all = withLeft(drawn, BODY.blocks, left, (b) => leftBlock(b, 0));
  assert.deepEqual(all.map((b) => [b.key ?? b.kind, b.drawn]), [['capture', true], ['needs-you', true], ['late', true], ['numbers', false], ['projects', false]]);
  /* AN ANSWER OF ANOTHER LENGTH KEEPS ITS OWN ORDER and has the left ones at its end. */
  assert.deepEqual(withLeft(drawn.slice(1), BODY.blocks, left, (b) => leftBlock(b, 0)).map((b) => b.key ?? b.kind), ['needs-you', 'late', 'numbers', 'projects']);
});
