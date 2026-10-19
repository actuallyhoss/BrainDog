/**
 * A row its maker kept private is left out of every read handed another viewer, and only its maker can say so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

const notes: Declaration = {
  id: 'register.jotter',
  kind: 'register',
  body: { id: 'jotter', name: 'Jotter', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function jotter() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([notes])).ok);
  const mine = k.create('jotter', { what: 'Ada private' }, { actor: 'p_ada' });
  const shared = k.create('jotter', { what: 'Ada shared' }, { actor: 'p_ada' });
  assert.ok(mine.ok && shared.ok);
  return { k, mine: (mine as { value: { id: string } }).value.id, shared: (shared as { value: { id: string } }).value.id };
}

test('A PRIVATE ROW READS AS ABSENT TO A COLLEAGUE AND PRESENT TO ITS MAKER', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  const seenBy = (viewer: string | undefined) => {
    const out = k.list({ register: 'jotter' }, undefined, viewer);
    assert.ok(out.ok);
    return (out as { value: { rows: { fields: { what: string } }[] } }).value.rows.map((r) => r.fields.what).sort();
  };
  assert.deepEqual(seenBy('p_bo'), ['Ada shared']);
  assert.deepEqual(seenBy('p_ada'), ['Ada private', 'Ada shared']);
  assert.deepEqual(seenBy(undefined), ['Ada private', 'Ada shared']);
  assert.equal(k.count('jotter', undefined, 'p_bo'), 1);
  assert.equal(k.hiddenFrom(mine, 'p_bo'), true);
  assert.equal(k.hiddenFrom(mine, 'p_ada'), false);
});

test('ONLY THE MAKER MAY KEEP A ROW PRIVATE OR SHARE IT AGAIN', async () => {
  const { k, mine } = await jotter();
  assert.equal(k.setPrivate('p_bo', mine, true).ok, false);
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  assert.equal(k.setPrivate('p_bo', mine, false).ok, false);
  assert.ok(k.setPrivate('p_ada', mine, false).ok);
  assert.equal(k.hiddenFrom(mine, 'p_bo'), false);
});
