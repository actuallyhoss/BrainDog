/**
 * `whatsNew({ cursor, everything })`: the read the browser's local copy catches up with (`apps/web/src/lib/data/local.ts`).
 *
 * It answers the lines from the cursor up, the cursor's own line included, newest first, and takes `everything` as
 * `recentHistory` does: true or its word, anything else refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };

test('A CURSOR AND everything ANSWER THE LINES FROM THE CURSOR UP; a malformed everything is refused', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 20, 12)) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_ada' } }).ok);
  const installed = await api.kernel.install([
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok((await api.create({ register: 'bills', fields: { what: 'Rent' } }, ada)).ok);

  const top = await api.recentHistory({ limit: 1, everything: true }, ada);
  assert.ok(top.ok, JSON.stringify(top));
  const newest = top.value.events[0]!;
  const cursor = newest.rowid!;

  assert.ok((await api.create({ register: 'bills', fields: { what: 'Water' } }, ada)).ok);
  const since = await api.whatsNew({ cursor, everything: true }, ada);
  assert.ok(since.ok, JSON.stringify(since));
  const ids = since.value.events.map((e) => e.id);
  assert.ok(ids.includes(newest.id), 'the cursor line itself comes back, so the copy skips it by id');
  assert.ok(since.value.events.some((e) => e.kind === 'create' && e.register === 'bills' && e.title === 'Water'));
  assert.equal(since.value.sinceCapped, false);

  const word = await api.whatsNew({ cursor, everything: 'true' }, ada);
  assert.ok(word.ok, 'the word is taken as the boolean');

  const odd = await api.whatsNew({ cursor, everything: 'yes' }, ada);
  assert.equal(odd.ok, false);
  assert.ok(!odd.ok && 'refusal' in odd && odd.refusal.code === 'VALUE_MALFORMED');
});
