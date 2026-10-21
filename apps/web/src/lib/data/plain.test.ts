/** `plain.ts`: an answer with a `Map` in it, written as plain JSON for the local copy and read back the same. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scrubbed } from './local.ts';
import { plainOf, revivedOf } from './plain.ts';

test('A MAP DEEP IN AN ANSWER COMES BACK A MAP, and the copy keeps what it would have refused', () => {
  const answer = { got: { from: 'live', page: { blocks: [{ kind: 'table', names: new Map([['people', new Map([[1, 'Ada']])]]) }] } }, news: null };
  assert.equal(scrubbed(answer), undefined, 'the copy refuses a Map');
  const plain = plainOf(answer);
  assert.notEqual(scrubbed(plain), undefined);
  const back = revivedOf<typeof answer>(JSON.parse(JSON.stringify(plain)));
  const names = back.got.page.blocks[0]!.names;
  assert.ok(names instanceof Map);
  assert.equal((names.get('people') as Map<number, string>).get(1), 'Ada');
});

test('ANYTHING BUT A PLAIN OBJECT IS LEFT AS IT IS, so the copy still refuses a Date', () => {
  const when = new Date(0);
  assert.equal((plainOf({ when }) as object).constructor, Object);
  assert.equal((plainOf({ when }) as { when: unknown }).when, when);
  assert.equal(scrubbed(plainOf({ when })), undefined);
});
