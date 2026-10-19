/**
 * A row its maker kept private is out of every reader the record answers another person: lists, search, history and the
 * log. A read that leaves the record (a model, a mail) is made for nobody, so the maker is not exempt there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);
const as = (id: string, level: 'owner' | 'write'): CallContext => ({ principal: { kind: 'person', id, level }, credentialed: true });

async function studio() {
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => NOW }, invitations: () => null });
  const notes = {
    id: 'register.jotter',
    kind: 'register' as const,
    body: { id: 'jotter', name: 'Jotter', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
  };
  assert.ok((await api.kernel.install([notes])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_ada', email: 'ada@example.com' } }).ok);
  const kept = await api.create({ register: 'jotter', fields: { what: 'Marigold quarterly pay' } }, as('p_ada', 'owner'));
  const open = await api.create({ register: 'jotter', fields: { what: 'Marigold open note' } }, as('p_ada', 'owner'));
  assert.ok(kept.ok && open.ok);
  const seq = (kept as { value: { seq: number } }).value.seq;
  assert.ok((await api.makePrivate({ ref: `jotter#${seq}` }, as('p_ada', 'owner'))).ok);
  return { api, seq };
}

test('A COLLEAGUE IS SHOWN ONE ROW OF TWO, IN THE LIST, THE SEARCH AND THE COUNT BESIDE IT', async () => {
  const { api } = await studio();
  const bo = as('p_bo', 'write');
  const listed = await api.list({ register: 'jotter' }, bo);
  assert.ok(listed.ok);
  assert.equal((listed as { value: { matched: number } }).value.matched, 1);
  const found = await api.search({ q: 'Marigold' }, bo);
  assert.ok(found.ok);
  const value = (found as { value: { hits: unknown[]; matched: Record<string, number> } }).value;
  assert.equal(value.hits.length, 1);
  assert.equal(value.matched.jotter, 1);
  const maker = await api.search({ q: 'Marigold' }, as('p_ada', 'owner'));
  assert.equal((maker as { value: { hits: unknown[] } }).value.hits.length, 2);
});

test('A COLLEAGUE READS NO HISTORY OF A PRIVATE ROW AND NO LINE OF IT IN THE LOG', async () => {
  const { api, seq } = await studio();
  const bo = as('p_bo', 'write');
  const history = await api.history({ register: 'jotter', seq }, bo);
  assert.deepEqual((history as { value: unknown[] }).value, []);
  const log = await api.recentHistory({}, bo);
  assert.ok(log.ok);
  assert.equal(JSON.stringify(log).includes('quarterly pay'), false);
});

test('A READ THAT LEAVES THE RECORD IS MADE FOR NOBODY, SO THE MAKER IS NOT EXEMPT', async () => {
  const { api } = await studio();
  const out = await api.list({ register: 'jotter' }, { ...as('p_ada', 'owner'), outbound: true });
  assert.equal((out as { value: { matched: number } }).value.matched, 1);
});
