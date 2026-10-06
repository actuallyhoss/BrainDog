/**
 * A page's `for:`, which makes it one page per row of a list, is `{ register, where?, fleeting? }` and nothing else.
 *
 * It installed whatever it said, so `for: 'tasks'` or `for: { list: 'tasks' }` was a page with no row behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration, type Declaration } from '../src/index.ts';

const page = (over: Record<string, unknown>): Declaration => ({
  id: 'page.invoice',
  kind: 'page',
  body: {
    page: 'invoice',
    title: 'Invoice',
    requires: ['register.obligations'],
    blocks: [{ kind: 'table', heading: 'Open', span: 12, source: 'register.obligations', columns: [{ field: 'what' }], limit: 50, empty: 'Nothing outstanding.' }],
    ...over,
  } as never,
});

test('a page for one row of a list says which list, and may narrow it and call its rows fleeting', () => {
  for (const said of [{ register: 'obligations' }, { register: 'obligations', where: 'state is open' }, { register: 'obligations', fleeting: true }, { register: 'obligations', where: 'state is open', fleeting: false }])
    assert.equal(validateDeclaration(page({ for: said })), null, `${JSON.stringify(said)} is a sound for:`);
  assert.equal(validateDeclaration(page({})), null, 'a page with no for: is a page of its own');
});

test('anything else in for: is refused at for, saying the shape', () => {
  for (const said of [
    'obligations',
    7,
    null,
    [],
    ['obligations'],
    {},
    { register: '' },
    { register: '  ' },
    { register: 7 },
    { list: 'obligations' },
    { register: 'obligations', where: { field: 'state', is: 'open' } },
    { register: 'obligations', fleeting: 'yes' },
    { register: 'obligations', by: 'what' },
  ]) {
    const r = validateDeclaration(page({ for: said }));
    assert.equal(r?.code, 'DECLARATION_INVALID', `${JSON.stringify(said)} installed as a for:`);
    assert.equal(r?.at, 'for', `${JSON.stringify(said)} was refused somewhere other than for`);
    assert.match(r?.fix ?? '', /for:/);
    assert.doesNotMatch(r?.fix ?? '', /—/, 'no dash in a sentence a person reads');
  }
});
