/**
 * A field worked out at read holds nothing in the store, so a filter or a sort over it is refused in one
 * sentence, with the code a field that cannot be asked a test gets. A stored field beside it compiles as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, derivedFault, evaluate, type Schema } from '../src/index.ts';

const SCHEMA: Schema = {
  register: 'orders',
  fields: {
    quantity: { type: 'int' },
    price: { type: 'money' },
    total: { type: 'money', derived: true },
    holder: { type: 'text', derived: true },
  },
};

const SAID = (field: string) => `${field} is worked out at read and never stored, so it cannot be filtered or sorted on.`;

test('a filter naming a derived field is refused in one sentence', () => {
  for (const [field, leaf] of [
    ['total', { field: 'total', gt: 5 }],
    ['holder', { field: 'holder', contains: 'Brightwell' }],
    ['holder', { field: 'holder', empty: true }],
  ] as const) {
    const out = compile(leaf as never, SCHEMA);
    assert.equal(out.bad.length, 1, JSON.stringify(leaf));
    assert.equal(out.bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
    assert.equal(out.bad[0]?.fix, SAID(field));
    assert.equal(out.bad[0]?.at, field);
  }
  const inside = compile({ all: [{ field: 'quantity', gt: 1 }, { field: 'total', present: true }] } as never, SCHEMA);
  assert.equal(inside.bad[0]?.fix, SAID('total'), 'inside a group too');
});

test('a sort naming a derived field is refused in the same sentence', () => {
  assert.deepEqual(derivedFault(SCHEMA, 'total'), { code: 'MATCH_OP_UNSUPPORTED', fix: SAID('total'), at: 'total' });
  assert.equal(derivedFault(SCHEMA, 'quantity'), null);
  assert.equal(derivedFault(SCHEMA, 'nosuch'), null, 'an unknown field is the caller\'s FIELD_UNKNOWN, not this');
});

test('a stored field still filters, and in memory a derived one matches nothing', () => {
  assert.equal(compile({ field: 'quantity', gt: 1 } as never, SCHEMA).bad.length, 0);
  assert.equal(evaluate({ field: 'holder', present: true } as never, { holder: 'Brightwell' }, SCHEMA), false);
});
