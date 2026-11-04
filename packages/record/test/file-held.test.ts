/**
 * The files doors ask the record whether a file is kept from the caller (`fileHeld`) before handing the bytes over.
 *
 * THE DOOR CHECKED ONLY "READS FILES", so a member held off a list who knew or guessed a file's hash (or held the same
 * PDF) read the payslip on it, or confirmed it was there. A narrowed caller now gets the bytes only when a row they can
 * read names them in a field they are shown; a file no row names (just put, its row not saved yet) and a caller who reads
 * the whole record are answered as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 30, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const list = (id: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'scan', type: 'file' }] } as never,
});
const sha = (c: string) => c.repeat(64);
const file = (c: string) => ({ sha256: sha(c), mime: 'application/pdf', bytes: 10, name: `${c}.pdf` });

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'orchardline', name: 'Orchardline', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([list('payroll'), list('notes')])).ok);
  const add = async (register: string, what: string, scan: unknown) => assert.ok((await api.create({ register, fields: { what, scan } } as never, owner)).ok, `${register} ${what}`);
  await add('payroll', 'Sam, October', file('a'));
  await add('notes', 'Train receipt', file('b'));
  await add('payroll', 'Shared PDF', file('c'));
  await add('notes', 'Shared PDF', file('c'));
  return api;
}

test('A MEMBER HELD OFF A LIST DOES NOT GET A FILE ONLY THAT LIST NAMES', async () => {
  const api = await record();
  const appender: CallContext = { principal: { kind: 'person', id: 'p_book', level: 'write' }, levels: { payroll: 'append' } };
  const notesOnly: CallContext = { principal: { kind: 'person', id: 'p_note', level: null }, registers: ['notes'], levels: { notes: 'read' } };
  for (const ctx of [appender, notesOnly]) {
    assert.equal(api.fileHeld(sha('a'), ctx), true, 'the payslip was handed to somebody held off payroll');
    assert.equal(api.fileHeld(sha('b'), ctx), false, 'a file on a list they read was kept from them');
    assert.equal(api.fileHeld(sha('c'), ctx), false, 'a file also on a list they read was kept from them');
    /* A FILE NO ROW NAMES YET is the one just put, shown before its row is saved. */
    assert.equal(api.fileHeld(sha('d'), ctx), false);
  }
});

test('A FIELD HIDDEN FROM THE CALLER DOES NOT HAND THEM ITS FILE', async () => {
  const api = await record();
  const hidden: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, hides: { notes: ['scan'] } };
  assert.equal(api.fileHeld(sha('b'), hidden), true);
});

test('WHOEVER READS THE WHOLE RECORD IS ANSWERED AS BEFORE, and a name that is no hash is held', async () => {
  const api = await record();
  assert.equal(api.fileHeld(sha('a'), owner), false);
  assert.equal(api.fileHeld(sha('a'), { principal: { kind: 'person', id: 'p_admin', level: 'decide' } }), false);
  assert.equal(api.fileHeld('../etc', owner), true);
});

/* RD6: A CALLER WHO READS THE WHOLE RECORD WAS ANSWERED BEFORE ANY ROW WAS LOOKED AT, so a full member who held the same
   PDF read, or confirmed, a file on somebody else's private row. */
test('RD6: A FILE ON A PRIVATE ROW IS KEPT FROM EVERYBODY BUT ITS MAKER, AND A COPY ON A ROW THEY READ STILL OPENS', async () => {
  const api = await record();
  const ada: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
  const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'write' }, credentialed: true };
  const kept = await api.create({ register: 'notes', fields: { what: 'Private scan', scan: file('e') } } as never, ada);
  assert.ok(kept.ok);
  const seq = (kept as { value: { seq: number } }).value.seq;
  assert.ok((await api.makePrivate({ ref: `notes#${seq}` }, ada)).ok);
  assert.equal(api.fileHeld(sha('e'), bo), true, 'a full member read a file on somebody else\'s private row');
  assert.equal(api.fileHeld(sha('e'), ada), false, 'the maker lost her own file');
  /* The same bytes on a row Bo reads are his to open. */
  assert.ok((await api.create({ register: 'notes', fields: { what: 'Same scan', scan: file('e') } } as never, ada)).ok);
  assert.equal(api.fileHeld(sha('e'), bo), false);
});

/* RE6: THE MAP OF WHICH ROWS NAME WHICH FILE IS KEPT BY THE NEWEST LOG LINE AND ROW, so a write that left neither put a
   file on a private row and the map, a step behind, served it as a file no row named. */
test('RE6: A FILE PUT ON A PRIVATE ROW BY A WRITE THAT LOGS NOTHING IS STILL KEPT, and one taken off a row is no longer served by it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'orchardline', name: 'Orchardline', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([list('notes')])).ok);
  const ada: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
  const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'write' }, credentialed: true };
  const made = await api.create({ register: 'notes', fields: { what: 'Private scan', scan: file('e') } } as never, ada);
  assert.ok(made.ok);
  const { id, seq } = (made as { value: { id: string; seq: number } }).value;
  assert.ok((await api.makePrivate({ ref: `notes#${seq}` }, ada)).ok);
  const open = await api.create({ register: 'notes', fields: { what: 'Open scan', scan: file('0') } } as never, ada);
  assert.ok(open.ok);
  const openId = (open as { value: { id: string } }).value.id;
  /* THE MAP IS WALKED NOW, with the private row naming e and the open one naming g. */
  assert.equal(api.fileHeld(sha('e'), bo), true);
  assert.equal(api.fileHeld(sha('0'), bo), false);
  /* A REPAIR THAT LOGS NOTHING puts f on the private row, and moves 0 there from the open row. */
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.scan', json(?)) WHERE id = ?`, JSON.stringify([file('e'), file('f'), file('0')]), id);
  sql.exec(`UPDATE entry SET fields = json_remove(fields, '$.scan') WHERE id = ?`, openId);
  assert.equal(api.fileHeld(sha('f'), bo), true, 'a file on a private row was served because the map had not seen it');
  assert.equal(api.fileHeld(sha('0'), bo), true, 'a file now only on a private row was served by the row it left');
  assert.equal(api.fileHeld(sha('f'), ada), false, 'the maker lost her own file');
});
