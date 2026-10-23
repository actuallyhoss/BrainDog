/**
 * WHAT ONE TRANSACTION HOLDS (`moment` in `index.ts`), and the batch read beside it (`getEach`).
 *
 * `boot` and a briefing ask which lists hold rows private from the reader, and a row's spoken name, once a question, a
 * line and a row: inside one transaction the kernel now answers each once. A write made inside that same transaction
 * must be seen at once, so these hold the answers to what a fresh read would say after each write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 23, 12);
const MAKER = { actor: 'p_1' };

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([NOTES]));
  return k;
}

test('A ROW MADE PRIVATE INSIDE A TRANSACTION IS HIDDEN AT ONCE, though the list was read as holding none a moment before', async () => {
  const k = await record();
  const row = value(k.create('notes', { what: 'Mine alone' }, MAKER)) as Entry;
  k.transaction(() => {
    assert.equal(k.anyHiddenFrom('p_2', 'notes'), false);
    assert.equal(k.anyHiddenFrom('p_2', 'notes'), false, 'asked twice in one moment');
    value(k.setPrivate('p_1', row.id, true));
    assert.equal(k.anyHiddenFrom('p_2', 'notes'), true, 'the write inside the moment was not seen');
    assert.equal(k.anyHiddenFrom('p_1', 'notes'), false, 'its maker is held back from her own row');
  });
  assert.equal(k.anyHiddenFrom('p_2', 'notes'), true);
});

test("A ROW'S NAME HELD FOR ONE TRANSACTION IS THE STORE'S, before and after a write inside it", async () => {
  const k = await record();
  const ids: string[] = [];
  k.transaction(() => {
    const made = value(k.create('notes', { what: 'First' }, MAKER)) as Entry;
    ids.push(made.id);
    assert.equal(k.nameOf(made.id), 'notes#1');
    value(k.update('notes', made.id, { deleted_at: new Date(NOW).toISOString() } as never, MAKER));
    /* A ROW GONE IS STILL NAMED, as `nameOf` names a deleted row; what matters is that the answer is the store's now. */
    assert.equal(k.nameOf(made.id), 'notes#1');
    assert.equal(k.nameOf('01ZZZZZZZZZZZZZZZZZZZZZZZZ'), '01ZZZZZZZZZZZZZZZZZZZZZZZZ');
  });
  assert.equal(k.nameOf(ids[0]!), 'notes#1');
});

test('getEach ANSWERS EACH ID AS get DOES: a live row, a deleted one, one that is not there and a spoken one', async () => {
  const k = await record();
  const kept = value(k.create('notes', { what: 'Kept' }, MAKER)) as Entry;
  const gone = value(k.create('notes', { what: 'Gone' }, MAKER)) as Entry;
  value(k.update('notes', gone.id, { deleted_at: new Date(NOW).toISOString() } as never, MAKER));
  const refs = [kept.id, gone.id, '01ZZZZZZZZZZZZZZZZZZZZZZZZ', 'notes#1', kept.id, ''];
  for (const includeDeleted of [false, true]) {
    const each = k.getEach(refs, { includeDeleted });
    for (const ref of refs) assert.deepEqual(each.get(ref), k.get(ref, { includeDeleted }), `${ref} with includeDeleted ${String(includeDeleted)}`);
  }
});
