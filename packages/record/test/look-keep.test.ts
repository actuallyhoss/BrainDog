/**
 * The app's two answers to Slash arranging a page while the person looks at it (its 6-second Undo):
 * `undoLook` puts back what Slash replaced, and `keepLook`, once the Undo has passed, says who kept it, which the page
 * read answers as `look.kept` so the history line survives a reload. Both are the owner's, from the app.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { liveLook, writeLook } from '../src/compose-look.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' } };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const DESK: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'note', lead: true, body: 'Your desk.' },
      { kind: 'table', source: 'register.notes', heading: 'Notes', columns: [{ field: 'name' }] },
      { kind: 'table', source: 'register.tasks', heading: 'Tasks', columns: [{ field: 'what' }] },
    ],
  } as never,
};

type Look = { by?: string; order?: string[]; kept?: string | null } | undefined;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([TASKS, NOTES, DESK]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'desk', name: 'Desk', tz: 'UTC', locale: 'en', owner: { id: 'p_1', name: 'Sam' } }).ok);
  assert.ok(api.kernel.create('tasks', { what: 'Send the quote' }, { actor: 'p_1' }).ok);
  const read = async (): Promise<{ look: Look; keys: string[] }> => {
    const got = await api.page({ slug: 'desk' }, owner);
    assert.ok(got.ok, JSON.stringify(got));
    const v = got.value as { look?: Look; blocks: { key?: string }[] };
    return { look: v.look, keys: v.blocks.map((b) => String(b.key)) };
  };
  return { api, sql, read };
}

test("KEEPING SLASH'S ARRANGEMENT IS ANSWERED AS look.kept ON THE NEXT READ, and a token cannot keep one", async () => {
  const { api, sql, read } = await record();
  const { keys } = await read();
  const order = [keys[2]!, keys[1]!];
  const wrote = await writeLook(api.kernel, 'desk', 'Desk', { look: 'desk', basis: 'b1', by: 'slash', order });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const before = (await read()).look;
  assert.equal(before?.by, 'slash');
  assert.equal(before?.kept, null);

  assert.equal((await api.keepLook({ page: 'desk' }, token)).ok, false);
  assert.ok((await api.keepLook({ page: 'desk' }, owner)).ok);
  /* BY NAME, never the id it was written under. */
  assert.equal((await read()).look?.kept, 'Sam');
  sql.close();
});

test("UNDO PUTS THE PAGE BACK AS IT WAS BEFORE SLASH ARRANGED IT, once", async () => {
  const { api, sql, read } = await record();
  const { keys } = await read();
  assert.ok((await writeLook(api.kernel, 'desk', 'Desk', { look: 'desk', basis: 'b1', by: 'slash', order: [keys[2]!, keys[1]!] })).ok);
  assert.equal((await api.undoLook({ page: '' }, owner)).ok, false);
  assert.equal((await api.undoLook({ page: 'desk' }, token)).ok, false);
  const undone = await api.undoLook({ page: 'desk' }, owner);
  assert.deepEqual(undone, { ok: true, value: { restored: 'rules' } });
  assert.equal(liveLook(api.kernel, 'desk'), null);
  assert.notEqual((await read()).look?.by, 'slash');
  assert.equal((await api.undoLook({ page: 'desk' }, owner)).ok, false);
  sql.close();
});
