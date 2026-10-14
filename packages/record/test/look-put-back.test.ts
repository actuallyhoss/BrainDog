/**
 * Put back, one step back whoever wrote the look (PGS-B12, DIRECTION §38: a composition is a proposal the person can pin,
 * change or undo): `undoLook` installs the live look's version before it from the versions the kernel keeps, or gives the
 * page back to the rules when it had none, any day after. Slash's own six-second Undo goes back as it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { liveLook, undoLook, undoneFor, writeLook } from '../src/compose-look.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 24 * 60 * 60 * 1000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A refusal's code and sentence, or nothing when the answer was not refused. */
const refused = (out: object): { code?: string; fix?: string } => ('refusal' in out ? (out.refusal as { code: string; fix: string }) : {});

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
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

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([NOTES, TASKS, DESK])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'desk', name: 'Desk', tz: 'UTC', locale: 'en', owner: { id: 'p_1', name: 'Sam' } }).ok);
  assert.ok(api.kernel.create('tasks', { what: 'Send the quote' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('notes', { name: 'Ring the printer' }, { actor: 'p_1' }).ok);
  const got = await api.page({ slug: 'desk' }, owner);
  assert.ok(got.ok, JSON.stringify(got));
  const keys = (got.value as { blocks: { key?: string }[] }).blocks.map((b) => String(b.key));
  /** The person's own look, written as the app writes a pin. */
  const pin = async (pinned: string[]) => {
    const out = await api.setDeclaration({ body: { look: 'desk', basis: 'pinned', by: 'owner', order: pinned, pinned } }, owner);
    assert.ok(out.ok, JSON.stringify(out));
  };
  const back = () => undoLook(api.kernel, 'desk', 'Desk', 'p_1', sql);
  return { api, sql, clock, keys, pin, back };
}

test("THE PERSON'S PIN PUT BACK A DAY LATER brings back the look before it, and says whose it took off", async () => {
  const { api, sql, clock, keys, pin, back } = await record();
  assert.ok((await writeLook(api.kernel, 'desk', 'Desk', { look: 'desk', basis: 'b1', by: 'slash', order: [keys[2]!, keys[1]!] })).ok);
  clock.advance(DAY);
  await pin([keys[1]!, keys[2]!]);
  clock.advance(DAY);
  const out = await back();
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.restored, 'previous');
  assert.equal(out.value.was?.by, 'owner');
  assert.match(out.value.was?.at ?? '', /^2026-10-08/u);
  const now = liveLook(api.kernel, 'desk');
  assert.equal(now?.body.by, 'slash');
  assert.deepEqual(now?.body.order, [keys[2]!, keys[1]!]);
  sql.close();
});

test('PUT BACK TWICE WALKS TWO VERSIONS, and a third gives the page back to the rules', async () => {
  const { api, sql, keys, pin, back } = await record();
  await pin([keys[1]!]);
  await pin([keys[2]!]);
  await pin([keys[1]!, keys[2]!]);
  assert.equal((await back()).ok, true);
  assert.deepEqual(liveLook(api.kernel, 'desk')?.body.pinned, [keys[2]!]);
  /* NOT BACK ONTO THE ONE THE FIRST PRESS TOOK OFF. */
  assert.equal((await back()).ok, true);
  assert.deepEqual(liveLook(api.kernel, 'desk')?.body.pinned, [keys[1]!]);
  const last = await back();
  assert.ok(last.ok, JSON.stringify(last));
  assert.equal(last.value.restored, 'rules');
  assert.equal(liveLook(api.kernel, 'desk'), null);
  sql.close();
});

test('A LOOK WITH NO EARLIER VERSION RETIRES TO THE RULES, and then there is nothing to put back', async () => {
  const { api, sql, keys, pin, back } = await record();
  await pin([keys[1]!]);
  const out = await back();
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.restored, 'rules');
  assert.equal(liveLook(api.kernel, 'desk'), null);
  const again = await back();
  assert.equal(again.ok, false);
  assert.equal(refused(again).code, 'DECLARATION_UNKNOWN');
  assert.doesNotMatch(refused(again).fix ?? '', /look\.|p_1/u);
  sql.close();
});

test("A SLASH LOOK STILL GOES BACK AS BEFORE: its kept Undo, the same answer, and the no it leaves", async () => {
  const { api, sql, keys, back } = await record();
  assert.ok((await writeLook(api.kernel, 'desk', 'Desk', { look: 'desk', basis: 'b1', by: 'slash', order: [keys[2]!, keys[1]!] })).ok);
  assert.deepEqual(await back(), { ok: true, value: { restored: 'rules' } });
  assert.equal(liveLook(api.kernel, 'desk'), null);
  assert.equal(undoneFor(api.kernel, 'desk', 'b1'), true);
  sql.close();
});

test("WITHOUT THE RECORD'S VERSIONS ONLY SLASH'S UNDO IS THERE, so the person's pin is answered as it always was", async () => {
  const { api, sql, keys, pin } = await record();
  await pin([keys[1]!]);
  const out = await undoLook(api.kernel, 'desk', 'Desk', 'p_1');
  assert.equal(refused(out).code, 'DECLARATION_UNKNOWN');
  assert.deepEqual(liveLook(api.kernel, 'desk')?.body.pinned, [keys[1]!]);
  sql.close();
});
