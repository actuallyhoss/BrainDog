/**
 * Saved views: the way a list is being looked at, held by the record rather than by a page.
 *
 * WHAT IS HELD HERE IS THE DOOR. The kernel's own checks are its to test; this file holds the four methods'
 * groups and what each one refuses: a view is READ+ to read and ADMIN to write, because saving one puts it on
 * the list for everybody who opens that list. A view names fields, so a field the register does not have is
 * refused before anything is stored, and a name the register has no view for comes back with the names it does
 * have rather than with nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 16, 12);

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'who', type: 'text' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: unknown } };

const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};

const value = <T,>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, `refused: ${JSON.stringify(x.refusal)}`);
  return x.value as T;
};

type View = {
  register: string;
  id: string;
  name: string;
  filter: unknown;
  search: string | null;
  order: { field: string; dir: 'asc' | 'desc' }[];
  columns: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

async function ready() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([NOTES])).ok);
  return { api, sql, clock };
}

const OPEN_INVOICES = {
  register: 'notes',
  id: 'open-invoices',
  name: 'Open invoices',
  filter: { field: 'what', contains: 'Invoice' },
  search: 'invoice',
  order: [{ field: 'what', dir: 'asc' as const }],
  columns: ['what', 'who'],
};

/* ── it is a thing the record holds ──────────────────────────────────────── */

test('A VIEW IS SAVED, READ BACK WHOLE AND LISTED BY THE RECORD, filter, search, order and columns alike', async () => {
  const { api, sql } = await ready();

  const saved = value<View>(await api.saveView(OPEN_INVOICES, owner));
  assert.equal(saved.id, 'open-invoices');
  assert.equal(saved.name, 'Open invoices');
  assert.equal(saved.created_by, 'p_1');

  /* READ BACK WHOLE, and not as the text it was stored as: a view is data the caller may already read. */
  const one = value<View>(await api.view({ register: 'notes', id: 'open-invoices' }, owner));
  assert.deepEqual(one.filter, OPEN_INVOICES.filter);
  assert.equal(one.search, 'invoice');
  assert.deepEqual(one.order, [{ field: 'what', dir: 'asc' }]);
  assert.deepEqual(one.columns, ['what', 'who']);

  const listed = value<View[]>(await api.views({ register: 'notes' }, owner));
  assert.deepEqual(listed.map((v) => v.id), ['open-invoices']);

  /* AND WITHOUT NAMING A REGISTER, which is the screen's first call: every list this caller reads. */
  const all = value<View[]>(await api.views({}, owner));
  assert.deepEqual(all.map((v) => [v.register, v.id]), [['notes', 'open-invoices']]);

  /* THE STORED COLUMN IS `sort`, because `order` is a reserved word in SQLite. The one place the two names
     differ, asserted so a rename does not quietly take the order with it. */
  assert.equal(sql.one<{ sort: string }>('SELECT sort FROM view WHERE id = ?', 'open-invoices')?.sort, JSON.stringify(OPEN_INVOICES.order));
  sql.close();
});

test('SAVING OVER A NAME REPLACES IT AND KEEPS WHO FIRST SAVED IT, because that is an edit and not a new view', async () => {
  const { api, sql, clock } = await ready();
  const first = value<View>(await api.saveView(OPEN_INVOICES, owner));

  clock.set(NOW + 60_000);
  const again = value<View>(
    await api.saveView({ ...OPEN_INVOICES, name: 'Invoices still open', columns: ['what'] }, { principal: { kind: 'person', id: 'p_2', level: 'owner' } }),
  );

  assert.equal(again.name, 'Invoices still open');
  assert.deepEqual(again.columns, ['what']);
  assert.equal(again.created_by, 'p_1', 'saving over a view claimed it for whoever saved last');
  assert.equal(again.created_at, first.created_at);
  assert.notEqual(again.updated_at, first.updated_at);
  assert.equal(value<View[]>(await api.views({ register: 'notes' }, owner)).length, 1, 'saving over a name made a second view');
  sql.close();
});

/* ── who may reach them ──────────────────────────────────────────────────── */

test('A TOKEN READS THE SAVED VIEWS AND MAY NOT SAVE ONE, because a view goes on the list for everybody', async () => {
  const { api, sql } = await ready();
  value(await api.saveView(OPEN_INVOICES, owner));

  /* READ+: a token in scope reads them, as it reads `schema` and `page`. */
  assert.equal(value<View[]>(await api.views({ register: 'notes' }, token)).length, 1);
  assert.equal(value<View>(await api.view({ register: 'notes', id: 'open-invoices' }, token)).id, 'open-invoices');

  /* ADMIN: saving and retiring are a browser session's, which is the door `setDeclaration` already uses. */
  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, id: 'mine' }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.retireView({ register: 'notes', id: 'open-invoices' }, token)).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

/* ── what it refuses ─────────────────────────────────────────────────────── */

test('A VIEW IS HELD TO THE REGISTER IT BELONGS TO: its fields, its name, and a list this record has', async () => {
  const { api, sql } = await ready();

  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, register: 'nope' }, owner)).code, 'REGISTER_UNKNOWN');

  const order = refusal(await api.saveView({ ...OPEN_INVOICES, order: [{ field: 'nope', dir: 'asc' }] }, owner));
  assert.equal(order.code, 'FIELD_UNKNOWN');
  assert.ok(Array.isArray(order.allowed), 'the refusal did not say which fields the register has');

  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, columns: ['nope'] }, owner)).code, 'FIELD_UNKNOWN');

  /* THE FILTER IS HELD TO THE SAME GRAMMAR `list` HOLDS A QUERY TO, and the compiler's own refusal is the
     one that comes back: a view's filter cannot be a query the register could never run. */
  assert.ok(!(await api.saveView({ ...OPEN_INVOICES, filter: { field: 'nope', is: 'open' } }, owner)).ok);

  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, id: 'Open Invoices' }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, name: '' }, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, name: 'x'.repeat(81) }, owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(await api.saveView({ ...OPEN_INVOICES, colour: 'red' } as never, owner)).code, 'FIELD_UNKNOWN');

  assert.equal(value<View[]>(await api.views({ register: 'notes' }, owner)).length, 0, 'a refused view was stored anyway');
  sql.close();
});

test('A NAME THE LIST HAS NO VIEW FOR SAYS WHICH NAMES IT HAS, and retiring one leaves the rows alone', async () => {
  const { api, sql } = await ready();
  value(await api.saveView(OPEN_INVOICES, owner));
  value(await api.create({ register: 'notes', fields: { what: 'Invoice 41' }, op_id: 'op_1' }, owner));

  const missing = refusal(await api.view({ register: 'notes', id: 'overdue' }, owner));
  assert.equal(missing.code, 'VIEW_UNKNOWN');
  assert.deepEqual(missing.allowed, ['open-invoices']);

  const gone = refusal(await api.retireView({ register: 'notes', id: 'overdue' }, owner));
  assert.equal(gone.code, 'VIEW_UNKNOWN');
  assert.deepEqual(gone.allowed, ['open-invoices']);

  assert.deepEqual(value(await api.retireView({ register: 'notes', id: 'open-invoices' }, owner)), {
    register: 'notes',
    id: 'open-invoices',
    retired: true,
  });
  assert.equal(value<View[]>(await api.views({ register: 'notes' }, owner)).length, 0);

  /* A VIEW IS A QUESTION AND NOT A ROW, so taking it off takes nothing with it. */
  assert.equal(api.kernel.count('notes'), 1);
  sql.close();
});
