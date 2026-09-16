/**
 * The write path, which is the only thing that changes a record.
 *
 * What is asserted here is mostly what must NOT happen: a number allocated by a write that then
 * refused, a row half written, a stale update silently winning, a refusal that leaves an event
 * behind. Each is invisible at the moment it happens and expensive to find afterwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, conflicted, fixOf } from '@braindog/ports';

import { openRecord, type Entry, type Kernel, type RegisterDecl } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: RegisterDecl = {
  id: 'obligations',
  name: 'Obligations',
  title: 'what',
  state: 'state',
  done: ['paid', 'written_off'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money' },
    { id: 'due', type: 'day' },
    { id: 'ref', type: 'text', unique: true },
    { id: 'party', type: 'text' },
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'opened', type: 'day', immutable: true },
    {
      id: 'state',
      type: 'enum',
      values: ['open', 'part', 'paid', 'written_off'],
      transitions: { open: { to: ['part', 'paid', 'written_off'] }, paid: { to: [] } },
    } as never,
  ],
};

const POINTS: RegisterDecl = {
  id: 'points',
  name: 'Points',
  title: 'at',
  series: true,
  fields: [
    { id: 'at', type: 'instant', required: true },
    { id: 'n', type: 'int' },
  ],
};

async function record(decls: RegisterDecl[] = [OBLIGATIONS]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  /* Through the real install, not an INSERT: a test that reaches around the code it is testing is a
     test that passes after the code stops working. */
  const out = await k.install(decls.map((d) => ({ id: `register.${d.id}`, kind: 'register' as const, body: d as never })));
  assert.ok(out.ok, fixOf(out));
  return { k, sql };
}

const value = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  assert.ok(r.ok, r.ok ? '' : `${(r as never as { refusal: { code: string; fix: string } }).refusal.code}: ${(r as never as { refusal: { fix: string } }).refusal.fix}`);
  return (r as never as { value: T }).value;
};
const refusal = (r: { ok: boolean }) => {
  assert.ok(!r.ok, 'the write was accepted');
  return (r as never as { refusal: { code: string; fix: string; at?: string; allowed?: string[] } }).refusal;
};

/* ── a row arrives ───────────────────────────────────────────────────────── */

test('a create makes a row with a number a person can say', async () => {
  const { k, sql } = await record();
  const row = value<{ id: string; seq: number | null; version: number; state: string | null }>(
    k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' }, state: 'open' }, { actor: 'p_1' }),
  );
  assert.equal(row.seq, 1, 'the first row of a register is #1');
  assert.equal(row.version, 1);
  assert.equal(row.state, 'open', 'the state is mirrored onto the row, not only into fields');
  assert.equal(k.count('obligations'), 1);
  assert.deepEqual(k.get('obligations#1')?.id, row.id, 'the spoken id addresses the row');
  sql.close();
});

test('numbers go up, per register, and never repeat', async () => {
  const { k, sql } = await record([OBLIGATIONS, POINTS]);
  for (const n of [1, 2, 3]) {
    const row = value<{ seq: number }>(k.create('obligations', { what: `Invoice ${n}` }, { actor: 'p_1' }));
    assert.equal(row.seq, n);
  }
  // A series has no spoken number: its rows are points, and nobody says a point out loud.
  const point = value<{ seq: number | null }>(k.create('points', { at: '2026-09-05T00:00:00Z', n: 4 }, { actor: 'p_1' }));
  assert.equal(point.seq, null);
  sql.close();
});

test('A NUMBER IS NEVER SPENT BY A WRITE THAT REFUSED', async () => {
  // The failure this prevents: a register whose numbering has holes, which is a register people stop
  // trusting — and the holes appear only under load, when a validation happens to fail.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'first' }, { actor: 'p_1' }));
  for (let i = 0; i < 5; i++) refusal(k.create('obligations', { amount: { amount: 1, currency: 'GBP' } }, { actor: 'p_1' }));
  const next = value<{ seq: number }>(k.create('obligations', { what: 'second' }, { actor: 'p_1' }));
  assert.equal(next.seq, 2, `five refused writes took the numbering to ${next.seq}`);
  sql.close();
});

test('and allocate outside a transaction throws rather than handing out a number', async () => {
  const { k, sql } = await record();
  assert.throws(() => k.allocate('seq:obligations'), /outside a transaction/);
  sql.close();
});

/* ── a refusal leaves nothing behind ─────────────────────────────────────── */

test('A REFUSED WRITE CHANGES NO ROW AND LEAVES NO EVENT', async () => {
  const { k, sql } = await record();
  const before = value<{ id: string; version: number }>(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  const events = k.history(before.id).length;

  refusal(k.update('obligations', 'obligations#1', { state: 'nonsense' }, { actor: 'p_1' }));
  refusal(k.update('obligations', 'obligations#1', { amount: { amount: 4.5, currency: 'GBP' } }, { actor: 'p_1' }));
  refusal(k.update('obligations', 'obligations#1', { nope: 'x' }, { actor: 'p_1' }));

  const after = k.get('obligations#1')!;
  assert.equal(after.version, before.version, 'a refused write bumped the version');
  assert.equal(after.fields.what, 'Invoice 41');
  assert.equal(k.history(before.id).length, events, 'a refused write left an event');
  sql.close();
});

test('a refusal says what was wrong and what may be sent instead', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));

  const unknownField = refusal(k.update('obligations', 'obligations#1', { nope: 1 }, { actor: 'p_1' }));
  assert.equal(unknownField.code, 'FIELD_UNKNOWN');
  assert.ok(unknownField.allowed?.includes('what'), 'a refusal that lists nothing is a dead end');

  const badState = refusal(k.update('obligations', 'obligations#1', { state: 'nonsense' }, { actor: 'p_1' }));
  assert.equal(badState.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(badState.allowed, ['open', 'part', 'paid', 'written_off']);

  const noRegister = refusal(k.create('atlantis', { what: 'x' }, { actor: 'p_1' }));
  assert.equal(noRegister.code, 'REGISTER_UNKNOWN');
  assert.ok(noRegister.allowed?.includes('obligations'));
  sql.close();
});

/* ── the compare-and-set ─────────────────────────────────────────────────── */

test('A STALE WRITE IS A CONFLICT, NEVER A MERGE — last-writer-wins is wrong for money', async () => {
  // Two people editing one invoice must not silently produce one of the two amounts, with no record
  // that there were two.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' } }, { actor: 'p_1' }));
  const read = k.get('obligations#1')!;

  value(k.update('obligations', 'obligations#1', { amount: { amount: 50_000, currency: 'GBP' } }, { actor: 'p_2' }));

  const stale = k.update(
    'obligations',
    'obligations#1',
    { amount: { amount: 12_000, currency: 'GBP' } },
    { actor: 'p_1', version: read.version },
  );
  assert.ok(conflicted(stale), 'a stale write came back as a refusal, which a caller cannot recover from');
  assert.equal(codeOf(stale), 'VERSION_STALE');
  assert.deepEqual(k.get('obligations#1')!.fields.amount, { amount: 50_000, currency: 'GBP' });
  sql.close();
});

test('and it hands back the row and the name of whoever moved it', async () => {
  /* THE BODY IS WHAT MAKES A 409 AN INSTRUCTION. Recovering from one means re-reading the row and
     re-applying your own patch onto it, and as a plain refusal this carried a sentence and nothing
     else — so a client could show a person that something changed and never what, or by whom. */
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' } }, { actor: 'p_ada' }));
  const read = k.get('obligations#1')!;
  value(k.update('obligations', 'obligations#1', { amount: { amount: 50_000, currency: 'GBP' } }, { actor: 'p_bo' }));

  const stale = k.update('obligations', 'obligations#1', { what: 'Invoice 41, revised' }, { actor: 'p_ada', version: read.version });
  assert.ok(conflicted(stale));
  assert.equal(stale.conflict.actor, 'p_bo', 'a 409 that will not say who changed it is a dead end');
  assert.equal(stale.conflict.version, k.get('obligations#1')!.version);
  assert.deepEqual(
    (stale.conflict.current as { fields: Record<string, unknown> }).fields.amount,
    { amount: 50_000, currency: 'GBP' },
    'the row it hands back has to be the row as it now stands, or the caller re-applies onto a guess',
  );
  // And the patch was NOT applied. A conflict is not a partial write.
  assert.equal(k.get('obligations#1')!.fields.what, 'Invoice 41');
  sql.close();
});

test('a conflict is not counted as a refused write', async () => {
  /* The observe loop counts `write.refused` to notice a DECLARATION that is wrong. Two people
     editing at once is a record being busy, and a detector that counted it would eventually propose
     changing a field because the business is doing well. */
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  const read = k.get('obligations#1')!;
  value(k.update('obligations', 'obligations#1', { what: 'Invoice 41a' }, { actor: 'p_2' }));
  k.update('obligations', 'obligations#1', { what: 'Invoice 41b' }, { actor: 'p_1', version: read.version });
  assert.equal(sql.all("SELECT 1 FROM observation WHERE kind = 'write.refused'").length, 0);
  sql.close();
});

test('a write with the current version goes through', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  const at = k.get('obligations#1')!.version;
  value(k.update('obligations', 'obligations#1', { what: 'Invoice 41, revised' }, { actor: 'p_1', version: at }));
  assert.equal(k.get('obligations#1')!.version, at + 1);
  sql.close();
});

/* ── the rules a register declares about itself ──────────────────────────── */

test('a required field is required on create, and a stale row is not refused for a rule it predates', async () => {
  const { k, sql } = await record();
  assert.equal(refusal(k.create('obligations', { amount: { amount: 1, currency: 'GBP' } }, { actor: 'p_1' })).code, 'REQUIRED_MISSING');

  value(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  // An update that does not touch `what` is fine even though the rule exists.
  value(k.update('obligations', 'obligations#1', { due: '2026-10-01' }, { actor: 'p_1' }));
  // Clearing it explicitly is not.
  assert.equal(refusal(k.update('obligations', 'obligations#1', { what: null }, { actor: 'p_1' })).code, 'REQUIRED_MISSING');
  sql.close();
});

test('a unique field is unique, and the refusal names the row that has it', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', ref: 'INV-1' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'b', ref: 'INV-2' }, { actor: 'p_1' }));
  const clash = refusal(k.update('obligations', 'obligations#2', { ref: 'INV-1' }, { actor: 'p_1' }));
  assert.equal(clash.code, 'ALREADY_KNOWN');
  assert.match(clash.fix, /obligations#1/, 'a uniqueness refusal that does not name the holder is a dead end');
  sql.close();
});

test('an immutable field is set once', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', opened: '2026-01-01' }, { actor: 'p_1' }));
  assert.equal(refusal(k.update('obligations', 'obligations#1', { opened: '2026-02-01' }, { actor: 'p_1' })).code, 'IMMUTABLE_FIELD');
  // Setting it for the first time on a row that never had it is not a change.
  value(k.create('obligations', { what: 'b' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#2', { opened: '2026-02-01' }, { actor: 'p_1' }));
  sql.close();
});

test('AN IMMUTABLE FIELD ACCEPTS THE VALUE IT ALREADY HOLDS, whatever shape that value is', async () => {
  /* The check compared the RAW patch against the STORED coerced value with `!==`. An object is never
     `===` another object, so an immutable `money` could never be re-sent — which locked out every
     client that does a read-modify-write of the whole field set, on a row it had not changed. */
  const { k, sql } = await record([{ ...OBLIGATIONS, fields: [...OBLIGATIONS.fields, { id: 'agreed', type: 'money', immutable: true }] } as RegisterDecl]);
  value(k.create('obligations', { what: 'a', agreed: { amount: 48_000, currency: 'GBP' }, opened: '2026-01-01' }, { actor: 'p_1' }));

  // The same money, sent again, is not a change.
  value(k.update('obligations', 'obligations#1', { agreed: { amount: 48_000, currency: 'GBP' } }, { actor: 'p_1' }));
  // And a value that only coercion makes equal is not a change either.
  value(k.update('obligations', 'obligations#1', { opened: '2026-01-01' }, { actor: 'p_1' }));

  // A different currency at the same amount IS a change, and the same amount is not the same money.
  assert.equal(
    refusal(k.update('obligations', 'obligations#1', { agreed: { amount: 48_000, currency: 'EUR' } }, { actor: 'p_1' })).code,
    'IMMUTABLE_FIELD',
  );
  // And clearing it is a change, which the reference comparison let through.
  assert.equal(refusal(k.update('obligations', 'obligations#1', { agreed: null }, { actor: 'p_1' })).code, 'IMMUTABLE_FIELD');
  assert.deepEqual(k.get('obligations#1')?.fields.agreed, { amount: 48_000, currency: 'GBP' });
  sql.close();
});

test('a transition the register forbids is refused, and says where the row may go', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', state: 'open' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'p_1' }));
  const back = refusal(k.update('obligations', 'obligations#1', { state: 'open' }, { actor: 'p_1' }));
  assert.equal(back.code, 'TRANSITION_ILLEGAL');
  assert.deepEqual(back.allowed, []);
  sql.close();
});

test('and a create may set any declared state, because a transition governs a MOVE', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'settled before it was recorded', state: 'paid' }, { actor: 'p_1' }));
  assert.equal(k.get('obligations#1')!.state, 'paid');
  sql.close();
});

/* ── absent is one thing ─────────────────────────────────────────────────── */

test('null, the empty string and the empty list all remove a field', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: '2026-10-01' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { due: null }, { actor: 'p_1' }));
  assert.equal('due' in k.get('obligations#1')!.fields, false, 'a cleared field is absent, not empty');
  value(k.update('obligations', 'obligations#1', { ref: '' }, { actor: 'p_1' }));
  assert.equal('ref' in k.get('obligations#1')!.fields, false);
  sql.close();
});

/* ── the version, and what changed ───────────────────────────────────────── */

test('the record’s version is the last event, and it only goes up', async () => {
  const { k, sql } = await record();
  const start = k.version();
  value(k.create('obligations', { what: 'a' }, { actor: 'p_1' }));
  const afterCreate = k.version();
  assert.ok(afterCreate > start);
  refusal(k.create('obligations', {}, { actor: 'p_1' }));
  assert.equal(k.version(), afterCreate, 'a refusal moved the record version');
  value(k.update('obligations', 'obligations#1', { what: 'b' }, { actor: 'p_1' }));
  assert.ok(k.version() > afterCreate);
  sql.close();
});

test('a row’s history is the writes that made it, in order, each with its actor', async () => {
  const { k, sql } = await record();
  const row = value<{ id: string }>(k.create('obligations', { what: 'a', state: 'open' }, { actor: 'p_1', note: 'From the invoice' }));
  value(k.update('obligations', 'obligations#1', { what: 'b' }, { actor: 'p_2', note: 'Renamed after the call' }));
  value(k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'rule:settle' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));

  const events = k.history(row.id);
  assert.deepEqual(events.map((e) => e.kind), ['create', 'edit', 'state', 'delete']);
  assert.deepEqual(events.map((e) => e.actor), ['p_1', 'p_2', 'rule:settle', 'p_1']);
  assert.equal(events[0]?.note, 'From the invoice');
  sql.close();
});

/* ── deleting is a state, not an erasure ─────────────────────────────────── */

test('a deleted row is gone from the reads and still there to restore', async () => {
  const { k, sql } = await record();
  const row = value<{ id: string }>(k.create('obligations', { what: 'a' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  assert.equal(k.get('obligations#1'), null);
  assert.equal(k.count('obligations'), 0);
  assert.ok(k.get('obligations#1', { includeDeleted: true }), 'a soft delete lost the row');

  value(k.update('obligations', 'obligations#1', { deleted_at: null }, { actor: 'p_1' }));
  assert.ok(k.get('obligations#1'));
  assert.deepEqual(k.history(row.id).map((e) => e.kind), ['create', 'delete', 'restore']);
  sql.close();
});

/* ── listing ─────────────────────────────────────────────────────────────── */

test('a list pages, newest first, and the cursor loses nothing on a shared millisecond', async () => {
  // A cursor on the timestamp alone drops every row that shares a millisecond with the page
  // boundary — which on an import is most of them, and the loss is silent.
  const { k, sql } = await record();
  for (let n = 1; n <= 25; n++) value(k.create('obligations', { what: `Invoice ${n}` }, { actor: 'p_1' }));

  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const at: string | null = cursor;
    type Page = { rows: { id: string }[]; cursor: string | null };
    const page: Page = value<Page>(k.list({ register: 'obligations', limit: 10, cursor: at }));
    for (const row of page.rows) {
      assert.ok(!seen.has(row.id), 'a row came back on two pages');
      seen.add(row.id);
    }
    cursor = page.cursor;
    pages++;
  } while (cursor && pages < 10);

  assert.equal(seen.size, 25, `paging saw ${seen.size} of 25 rows`);
  sql.close();
});

test('a list is one register, and a deleted row is not in it', async () => {
  const { k, sql } = await record([OBLIGATIONS, POINTS]);
  value(k.create('obligations', { what: 'a' }, { actor: 'p_1' }));
  value(k.create('points', { at: '2026-09-05T00:00:00Z' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  assert.equal(value<{ rows: unknown[] }>(k.list({ register: 'obligations' })).rows.length, 0);
  assert.equal(value<{ rows: unknown[] }>(k.list({ register: 'obligations', includeDeleted: true })).rows.length, 1);
  assert.equal(value<{ rows: unknown[] }>(k.list({ register: 'points' })).rows.length, 1);
  sql.close();
});

/* ── the schema refusal is sticky ────────────────────────────────────────── */

test('a record whose schema disagrees with the code refuses every write', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await openRecord(sql, clock);
  sql.exec("UPDATE migration SET checksum = 'changed after it was applied'");
  const k = await openRecord(sql, clock);
  assert.ok(k.refused(), 'the refusal did not stick');
  assert.equal(refusal(k.create('obligations', { what: 'a' }, { actor: 'p_1' })).code, 'SCHEMA_MISMATCH');
  sql.close();
});

/* ── the predicate, over real rows ───────────────────────────────────────── */

test('A LIST TAKES A PREDICATE, and it is checked against the register before it runs', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' }, due: '2026-08-01', state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Retainer', amount: { amount: 24_000, currency: 'GBP' }, due: '2026-10-01', state: 'paid' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Hosting', amount: { amount: 24_000, currency: 'EUR' }, due: '2026-09-05', state: 'open' }, { actor: 'p_1' }));

  const open = value<{ rows: { seq: number }[]; matched: number }>(
    k.list({ register: 'obligations', where: { field: 'state', is: 'open' } }),
  );
  assert.deepEqual(open.rows.map((r) => r.seq).sort(), [1, 3]);
  assert.equal(open.matched, 2, 'the matched count is the whole answer, not the page');

  // Two currencies are two quantities: the same NUMBER in EUR is a different amount.
  const gbp = value<{ rows: { seq: number }[] }>(
    k.list({ register: 'obligations', where: { field: 'amount', is: { amount: 24_000, currency: 'GBP' } } }),
  );
  assert.deepEqual(gbp.rows.map((r) => r.seq), [2]);
  sql.close();
});

test('a predicate the register cannot answer is REFUSED, not run as if it matched nothing', async () => {
  // A list that looks filtered and is not is the one failure a declarative surface must not have,
  // and the thing writing most predicates is an agent that cannot see the screen.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a' }, { actor: 'p_1' }));

  const unknown = refusal(k.list({ register: 'obligations', where: { field: 'nope', is: 'x' } }));
  assert.equal(unknown.code, 'FIELD_UNKNOWN');
  assert.ok(unknown.allowed?.includes('what'));

  const badValue = refusal(k.list({ register: 'obligations', where: { field: 'state', is: 'done' } }));
  assert.equal(badValue.code, 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(badValue.allowed, ['open', 'part', 'paid', 'written_off']);
  sql.close();
});

test('and a deleted row stays out of a filtered list too', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'b', state: 'open' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#2', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  const out = value<{ rows: unknown[]; matched: number }>(
    k.list({ register: 'obligations', where: { field: 'state', is: 'open' } }),
  );
  assert.equal(out.rows.length, 1);
  assert.equal(out.matched, 1, 'the count included a deleted row');
  sql.close();
});

/* ── a history, and not an activity feed ───────────────────────── */

test('THE LEDGER SAYS WHAT CHANGED, one row per field, or it is not a history', async () => {
  /* "Edited" is not an answer to any question anybody asks of an audit log, and append-only is
     worth nothing when what was appended is that something happened. */
  const { k, sql } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open', party: 'Acme' }, { actor: 'p_1' }));

  /* A `create` CARRIES THE WHOLE SHAPE: field null, `to_v` the row as written. */
  const born = k.history(made.id)[0]!;
  assert.equal(born.kind, 'create');
  assert.equal(born.field, null);
  assert.deepEqual(born.to, { what: 'Invoice 41', state: 'open', party: 'Acme' });

  value<Entry>(k.update('obligations', 'obligations#1', { party: 'Ravensworth', state: 'paid' }, { actor: 'p_2', note: 'Settled by phone.' }));
  const after = k.history(made.id).slice(1);

  assert.deepEqual(
    after.map((e) => `${e.kind}/${e.field}/${JSON.stringify(e.from)}→${JSON.stringify(e.to)}`),
    ['edit/party/"Acme"→"Ravensworth"', 'state/state/"open"→"paid"'],
  );
  /* THE NOTE IS ON THE FIRST ROW ONLY: it is one thing somebody said about one write, not a thing
     they said about each field. */
  assert.equal(after[0]?.note, 'Settled by phone.');
  assert.equal(after[1]?.note, null);
  assert.equal(after[1]?.batch, after[0]?.id, 'the two rows of one write are not one batch');
  sql.close();
});

test('AND A LIST CHANGES BY ELEMENT, so "when was this tagged late" has an answer', async () => {
  const { k, sql } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'a', state: 'open', tags: ['urgent'] }, { actor: 'p_1' }));
  value<Entry>(k.update('obligations', 'obligations#1', { tags: ['urgent', 'late'] }, { actor: 'p_1' }));
  value<Entry>(k.update('obligations', 'obligations#1', { tags: ['late'] }, { actor: 'p_1' }));

  assert.deepEqual(
    k.history(made.id).slice(1).map((e) => `${e.kind}/${JSON.stringify(e.to ?? e.from)}`),
    ['tag/"late"', 'untag/"urgent"'],
  );
  sql.close();
});

test('AND A MONEY FIELD IS ON THE REDACTION LIST WITHOUT ASKING', async () => {
  /* An audit log is read by everybody who can read the record, and a per-field history of what
     somebody was paid is a salary disclosed to the whole team by the feature that exists to make
     the record trustworthy. Who, when and which field are kept; the number is not. */
  const { k, sql } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'a', state: 'open', amount: { amount: 90_000, currency: 'GBP' } }, { actor: 'p_1' }));

  assert.equal((k.history(made.id)[0]!.to as Record<string, unknown>).amount, '--redacted--');
  assert.equal((k.history(made.id)[0]!.to as Record<string, unknown>).what, 'a', 'a text field was redacted too');

  value<Entry>(k.update('obligations', 'obligations#1', { amount: { amount: 12_000, currency: 'GBP' } }, { actor: 'p_1' }));
  const changed = k.history(made.id).at(-1)!;
  assert.equal(changed.field, 'amount', 'which field changed is not recorded');
  assert.equal(changed.from, '--redacted--');
  assert.equal(changed.to, '--redacted--');

  // And the number is nowhere in the ledger, which is the whole point.
  assert.equal(sql.all("SELECT 1 FROM event WHERE to_v LIKE '%90000%' OR from_v LIKE '%90000%'").length, 0);
  sql.close();
});

test('A RETRY IS ONE ROW, because an agent whose answer was lost sends it again', async () => {
  /* A dropped socket, a timeout, a queue redelivery — the ordinary case. Without the caller's own
     id the second attempt is a second row, which is the duplicate-invoice failure from the client
     side, and hashing the bytes cannot catch it: the retry is a different request with one intent. */
  const { k, sql } = await record();
  const first = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1', opId: 'op-a' }));
  const again = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1', opId: 'op-a' }));

  assert.equal(again.id, first.id, 'a retry wrote a second row');
  assert.equal(k.count('obligations'), 1);
  assert.equal(sql.all("SELECT 1 FROM event WHERE op_id = 'op-a'").length, 1, 'the id landed twice');

  // And the replay answers with the row AS IT IS NOW, not as it was — which is what a caller wants.
  value<Entry>(k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'p_2' }));
  assert.equal(value<Entry>(k.create('obligations', { what: 'x' }, { actor: 'p_1', opId: 'op-a' })).fields.state, 'paid');

  // A different id is a different write.
  value<Entry>(k.create('obligations', { what: 'Invoice 42', state: 'open' }, { actor: 'p_1', opId: 'op-b' }));
  assert.equal(k.count('obligations'), 2);
  sql.close();
});

test('A USED op_id REPLAYS ONLY THE WRITE IT WAS MINTED FOR, and never hands back another register\'s row', async () => {
  /* The key alone used to decide: a create in one register carrying an id first used in another answered with
     that other register's row, past a guard that had checked only the register it was asked about, and an update
     reusing a create's id applied nothing and answered with the created row. */
  const PAYROLL: RegisterDecl = { id: 'payroll', name: 'Payroll', title: 'who', fields: [{ id: 'who', type: 'text', required: true }, { id: 'salary', type: 'money' }] };
  const { k, sql } = await record([OBLIGATIONS, PAYROLL]);
  value<Entry>(k.create('payroll', { who: 'Ada', salary: { amount: 9_000_000, currency: 'GBP' } }, { actor: 'p_1', opId: 'shared' }));

  const across = k.create('obligations', { what: 'mine' }, { actor: 'p_2', opId: 'shared' });
  assert.equal(codeOf(across), 'VALUE_MALFORMED', 'a used key answered with a row from another register');
  assert.equal(k.count('obligations'), 0);

  const made = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1', opId: 'op-c' }));
  value<Entry>(k.create('obligations', { what: 'Invoice 42', state: 'open' }, { actor: 'p_1' }));
  const elsewhere = k.update('obligations', 'obligations#2', { party: 'Acme' }, { actor: 'p_1', opId: 'op-c' });
  assert.equal(codeOf(elsewhere), 'VALUE_MALFORMED', 'an update reusing a key on another row was answered as a replay');
  assert.equal(k.get('obligations#2')?.fields.party, undefined);

  // The same write sent again is still a replay.
  assert.equal(value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1', opId: 'op-c' })).id, made.id);
  sql.close();
});

test('A WRITE WITH NO OBJECT OF VALUES, OR A VERSION THAT IS NOT A NUMBER, IS REFUSED RATHER THAN THROWN', async () => {
  const { k, sql } = await record();
  for (const fields of [undefined, null, [1], 'what'])
    assert.equal(codeOf(k.create('obligations', fields as never, { actor: 'p_1' })), 'VALUE_MALFORMED', `create with ${JSON.stringify(fields)}`);
  value<Entry>(k.create('obligations', { what: 'a', state: 'open' }, { actor: 'p_1' }));
  assert.equal(codeOf(k.update('obligations', 'obligations#1', null as never, { actor: 'p_1' })), 'VALUE_MALFORMED');
  for (const version of ['1', null, 1.5])
    assert.equal(codeOf(k.update('obligations', 'obligations#1', { party: 'x' }, { actor: 'p_1', version: version as never })), 'VALUE_MALFORMED', `version ${JSON.stringify(version)}`);
  assert.equal(k.get('obligations#1')?.version, 1, 'a refused write moved the version');
  assert.equal(k.get({ register: undefined, seq: undefined } as never), null);
  sql.close();
});
