/**
 * Installing a declaration, which is how a record learns what it holds.
 *
 * The rule everything here turns on: a declaration row is never edited. A new version is a new row,
 * and the old one is stamped rather than replaced — because an event written two years ago is about
 * a SHAPE, and a record that cannot say what that shape was cannot read its own history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { indexesFor, indexName, jcs, openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true },
      { id: 'ref', type: 'text', unique: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.ok(!x.ok, 'the declaration was accepted');
  return x.refusal;
};

/* ── it installs ─────────────────────────────────────────────────────────── */

test('a register arrives as a document, and the record can then hold its rows', async () => {
  const { k, sql } = await record();
  const out = value<{ id: string; version: number; changed: boolean }[]>(await k.install([OBLIGATIONS]));
  assert.deepEqual(out, [{ id: 'register.obligations', version: 1, changed: true }]);

  assert.ok(k.register('obligations'), 'the cache was not rebuilt, so the write path still refuses');
  const row = value<{ seq: number }>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.equal(row.seq, 1);
  sql.close();
});

test('THE SAME BYTES ARE NOT A NEW VERSION, whatever order the keys arrive in', async () => {
  // Otherwise every deploy bumps every register, and a version number stops being a fact about the
  // shape and becomes a count of deploys.
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));

  const reordered: Declaration = {
    ...OBLIGATIONS,
    body: { title: 'what', name: 'Obligations', state: 'state', fields: (OBLIGATIONS.body as never as { fields: unknown[] }).fields, id: 'obligations' } as never,
  };
  const again = value<{ version: number; changed: boolean }[]>(await k.install([reordered]));
  assert.deepEqual(again, [{ id: 'register.obligations', version: 1, changed: false }]);
  assert.equal(sql.all('SELECT version FROM declaration').length, 1, 'a second row was written for identical bytes');
  sql.close();
});

test('A NEW VERSION IS A NEW ROW, and the old one is stamped rather than replaced', async () => {
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));

  const withNote: Declaration = {
    ...OBLIGATIONS,
    body: {
      ...(OBLIGATIONS.body as never as Record<string, unknown>),
      fields: [...(OBLIGATIONS.body as never as { fields: unknown[] }).fields, { id: 'note', type: 'text' }],
    } as never,
  };
  const out = value<{ version: number; changed: boolean }[]>(await k.install([withNote]));
  assert.deepEqual(out, [{ id: 'register.obligations', version: 2, changed: true }]);

  const rows = sql.all<{ version: number; superseded_at: string | null }>(
    'SELECT version, superseded_at FROM declaration WHERE id = ? ORDER BY version',
    'register.obligations',
  );
  assert.equal(rows.length, 2, 'the first version was edited instead of superseded');
  assert.ok(rows[0]?.superseded_at, 'the old row was not stamped');
  assert.equal(rows[1]?.superseded_at, null);

  // And the new field is writable, which is the point of the version.
  value(k.create('obligations', { what: 'a', note: 'said on the call' }, { actor: 'p_1' }));
  sql.close();
});

test('a retired declaration keeps its row and stops being active', async () => {
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  assert.equal(value<number>(k.retire(['register.obligations'])), 1);
  assert.equal(k.register('obligations'), undefined, 'a retired register is still active');
  assert.equal(sql.all('SELECT 1 FROM declaration').length, 1, 'retiring deleted the row');
  assert.equal(refusal(k.create('obligations', { what: 'a' }, { actor: 'p_1' })).code, 'REGISTER_UNKNOWN');
  sql.close();
});

/* ── the indexes ─────────────────────────────────────────────────────────── */

test('the indexes are part of the install, and a money field takes two', async () => {
  // A money value is an object, so its number and its currency are two paths — and a comparison
  // binds both, so both have to be indexed or the currency half is a scan.
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  const names = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'entry_%'")
    .map((r) => r.name);

  assert.ok(names.includes(indexName('i', 'obligations', 'amount', 'amount')), names.join(', '));
  assert.ok(names.includes(indexName('i', 'obligations', 'amount', 'currency')), names.join(', '));
  assert.ok(names.includes(indexName('i', 'obligations', 'due')));
  assert.ok(names.includes(indexName('u', 'obligations', 'ref')));
  assert.ok(!names.includes(indexName('i', 'obligations', 'what')), 'a field nobody indexed got an index');
  sql.close();
});

test('AN INDEX AND A PREDICATE SPELL THE PATH THE SAME WAY, or the index is never used', async () => {
  // The symptom of a mismatch is that the record got slow, a year later, with nothing pointing at
  // the cause. Both come from `jsonPath`, and this is the assertion that says so.
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  value(k.create('obligations', { what: 'a', due: '2026-08-01', state: 'open' }, { actor: 'p_1' }));

  const plan = sql
    .all<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT id FROM entry WHERE register = 'obligations' AND deleted_at IS NULL AND json_extract(fields, '$.due') = '2026-08-01'",
    )
    .map((r) => r.detail)
    .join(' ');
  assert.match(plan, /entry_i_obligations__due/, `the index was not used: ${plan}`);
  sql.close();
});

test('a unique index is unique, and it is the backstop rather than the check', async () => {
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  value(k.create('obligations', { what: 'a', ref: 'INV-1' }, { actor: 'p_1' }));
  // The write path refuses first, with a sentence that names the row that holds it.
  assert.equal(refusal(k.create('obligations', { what: 'b', ref: 'INV-1' }, { actor: 'p_1' })).code, 'ALREADY_KNOWN');
  // And the index would have stopped it anyway.
  assert.throws(() =>
    sql.exec(
      "INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES ('X', 'obligations', 99, '{\"ref\":\"INV-1\"}', 1, '', '')",
    ),
  );
  sql.close();
});

/* ── it refuses what it cannot inline ────────────────────────────────────── */

test('AN ID BECOMES SQL, so an id that is not an id is refused', async () => {
  // The register id and every field id are inlined into index names and `json_extract` paths — the
  // one place in this package where an identifier is not a bound parameter.
  for (const id of ['Obligations', '1st', 'obl igations', "x'; DROP TABLE entry; --", ''])
    assert.equal(
      validateDeclaration({ id: `register.${id}`, kind: 'register', body: { id, title: 'a', fields: [{ id: 'a', type: 'text' }] } as never })?.code,
      'DECLARATION_INVALID',
      `${id} was accepted as a register id`,
    );

  const badField = validateDeclaration({
    id: 'register.x',
    kind: 'register',
    body: { id: 'x', title: 'a', fields: [{ id: 'a', type: 'text' }, { id: 'NOPE', type: 'text' }] } as never,
  });
  assert.equal(badField?.code, 'DECLARATION_INVALID');
});

test('an underscore is the kernel’s, a duplicate field is a defect, and a title must exist', async () => {
  const decl = (fields: unknown[], extra: Record<string, unknown> = {}) =>
    validateDeclaration({ id: 'register.x', kind: 'register', body: { id: 'x', title: 'a', fields, ...extra } as never });

  assert.match(decl([{ id: '_rule', type: 'text' }])?.fix ?? '', /keeps for itself/);
  assert.match(decl([{ id: 'a', type: 'text' }, { id: 'a', type: 'int' }])?.fix ?? '', /twice/);
  assert.match(decl([{ id: 'b', type: 'text' }])?.fix ?? '', /as its title/);
  assert.match(decl([{ id: 'a', type: 'text' }], { state: 'nope' })?.fix ?? '', /as its state/);
  assert.equal(decl([{ id: 'a', type: 'text' }]), null);
});

test('a declaration whose id does not match its body is refused', async () => {
  const wrong = validateDeclaration({
    id: 'register.something_else',
    kind: 'register',
    body: { id: 'obligations', title: 'a', fields: [{ id: 'a', type: 'text' }] } as never,
  });
  assert.match(wrong?.fix ?? '', /is its kind and its own id/);
});

test('a batch is all or nothing, so a page never names a register that failed to arrive', async () => {
  const { k, sql } = await record();
  const broken: Declaration = { id: 'register.bad', kind: 'register', body: { id: 'bad', title: 'x', fields: [] } as never };
  assert.equal(refusal(await k.install([OBLIGATIONS, broken])).code, 'DECLARATION_INVALID');
  assert.equal(sql.all('SELECT 1 FROM declaration').length, 0, 'half the batch was installed');
  sql.close();
});

/* ── canonical bytes ─────────────────────────────────────────────────────── */

test('the canonical form sorts keys and holds no whitespace', async () => {
  assert.equal(jcs({ b: 1, a: 2 } as never), '{"a":2,"b":1}');
  assert.equal(jcs({ a: [3, { d: 1, c: 2 }] } as never), '{"a":[3,{"c":2,"d":1}]}');
  assert.equal(jcs(null), 'null');
  // The whole point: two spellings of one declaration are one declaration.
  assert.equal(jcs({ x: 1, y: [1, 2] } as never), jcs({ y: [1, 2], x: 1 } as never));
});

test('indexesFor names what it builds, and skips a retired field', async () => {
  const built = indexesFor('obligations', [
    { id: 'a', type: 'text', index: true },
    { id: 'b', type: 'money', index: true },
    { id: 'c', type: 'text', unique: true },
    { id: 'd', type: 'text', index: true, retired: true },
    { id: 'e', type: 'text' },
  ]);
  assert.equal(built.length, 4, built.join('\n'));
  assert.ok(built.some((s) => s.includes('entry_u_obligations__c') && s.includes('UNIQUE')));
  assert.ok(built.every((s) => s.includes('deleted_at IS NULL')), 'an index over deleted rows is pages nobody touches');
  assert.ok(!built.some((s) => s.includes('__d')), 'a retired field was indexed');
});
