/**
 * Taking back your own write is a write: a person since held to read on a list may not put its rows back either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } } as CallContext;
const before = { principal: { kind: 'person', id: 'p_m', level: 'write' } } as CallContext;
const after = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { obligations: 'read' } } as CallContext;
const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] } as never,
};

test('UNDO OWN ASKS THE LEVEL A WRITE ASKS: held to read on the list, nothing is put back', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const made = (await api.create({ register: 'obligations', fields: { what: 'Payroll run', note: 'owner note' } }, owner)) as { ok: true; value: { id: string } };
  const seq = api.kernel.get(made.value.id)!.seq!;
  const edit = (await api.update({ register: 'obligations', seq, patch: { note: 'member note' } } as never, before)) as { ok: true; value: { batch: string } };
  const mine = (await api.create({ register: 'obligations', fields: { what: 'Member row' } }, before)) as { ok: true; value: { id: string; batch: string } };
  assert.ok(edit.ok && mine.ok);

  for (const batch of [edit.value.batch, mine.value.batch]) {
    const out = (await api.undoOwn({ batch }, after)) as { ok: boolean; refusal?: { code: string } };
    assert.equal(out.ok, false, 'a person held to read put a row back');
  }
  assert.equal(api.kernel.get(made.value.id)?.fields.note, 'member note');
  assert.equal(sql.one<{ deleted_at: string | null }>('SELECT deleted_at FROM entry WHERE id = ?', mine.value.id)?.deleted_at, null);
  /* AND AT WRITE, SHE STILL MAY. */
  assert.ok(((await api.undoOwn({ batch: mine.value.batch }, before)) as { ok: boolean }).ok);
  sql.close();
});
