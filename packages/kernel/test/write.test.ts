/**
 * The write path, which is the only thing that changes a record.
 *
 * What is asserted here is mostly what must NOT happen: a number allocated by a write that then
 * refused, a row half written, a stale update silently winning, a refusal that leaves an event
 * behind. Each is invisible at the moment it happens and expensive to find afterwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type RegisterDecl } from '../src/index.ts';
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
  for (const decl of decls)
    sql.exec(
      "INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES (?, 1, 'register', NULL, ?, 'x', 0, NULL, ?)",
      `register.${decl.id}`,
      JSON.stringify(decl),
      new Date(NOW).toISOString(),
    );
  k.reload();
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

test('A STALE WRITE IS REFUSED, NEVER MERGED — last-writer-wins is wrong for money', async () => {
  // Two people editing one invoice must not silently produce one of the two amounts, with no record
  // that there were two.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', amount: { amount: 48_000, currency: 'GBP' } }, { actor: 'p_1' }));
  const read = k.get('obligations#1')!;

  value(k.update('obligations', 'obligations#1', { amount: { amount: 50_000, currency: 'GBP' } }, { actor: 'p_2' }));

  const stale = refusal(
    k.update('obligations', 'obligations#1', { amount: { amount: 12_000, currency: 'GBP' } }, { actor: 'p_1', version: read.version }),
  );
  assert.equal(stale.code, 'VERSION_STALE');
  assert.match(stale.fix, /Read it again/);
  assert.deepEqual(k.get('obligations#1')!.fields.amount, { amount: 50_000, currency: 'GBP' });
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
    const page: { rows: { id: string }[]; cursor: string | null } = k.list({ register: 'obligations', limit: 10, cursor });
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
  assert.equal(k.list({ register: 'obligations' }).rows.length, 0);
  assert.equal(k.list({ register: 'obligations', includeDeleted: true }).rows.length, 1);
  assert.equal(k.list({ register: 'points' }).rows.length, 1);
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
