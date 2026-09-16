/**
 * A page block's `where`, read at install against the register it filters.
 *
 * `declare.ts` checks only its shape, so a table filtering on a field its register lacks installed
 * and then refused on every open. The install check now compiles it, as it does a rule's `when` and a
 * metric's `where`, and leaves alone what it cannot read: a template's `{{...}}` and a computed source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'int' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'paid'], required: true },
    ],
  } as never,
};

const pageOf = (block: Record<string, unknown>, extra: Record<string, unknown> = {}): Declaration => ({
  id: 'page.invoicing',
  kind: 'page',
  body: { page: 'invoicing', title: 'Invoicing', blocks: [{ empty: 'Nothing yet.', ...block }], ...extra } as never,
});

async function install(page: Declaration) {
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 8, 9, 12)));
  return k.install([OBLIGATIONS, page]);
}

const code = (r: unknown) => (r as { ok: boolean; refusal?: { code: string } }).refusal?.code;

test('a table filtering on a field its register lacks is refused at install', async () => {
  const r = await install(pageOf({ kind: 'table', source: 'register.obligations', where: 'colour is red' }));
  assert.equal(r.ok, false);
  assert.equal(code(r), 'FIELD_UNKNOWN');
});

test('the same mistake written as a tree is refused too', async () => {
  const r = await install(pageOf({ kind: 'cards', source: 'register.obligations', where: { field: 'colour', is: 'red' } }));
  assert.equal(r.ok, false);
  assert.equal(code(r), 'FIELD_UNKNOWN');
});

test('a readable sentence installs', async () => {
  const r = await install(pageOf({ kind: 'table', source: 'register.obligations', where: 'state is open' }));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('a readable tree installs', async () => {
  const r = await install(pageOf({ kind: 'table', source: 'register.obligations', where: { field: 'state', is: 'open' } }));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("a template's placeholder is not refused before its row fills it", async () => {
  const r = await install(
    pageOf({ kind: 'table', source: 'register.obligations', where: 'what is {{what}}, due is {{due}}' }, { for: { register: 'obligations' } }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('a computed source keeps its own where, unread against any register', async () => {
  const r = await install(pageOf({ kind: 'feed', source: 'activity', where: 'colour is red' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = await install(pageOf({ kind: 'table', source: 'actions', where: 'colour is red' }));
  assert.equal(s.ok, true, JSON.stringify(s));
});
