/**
 * Installing a declaration, which is how a record learns what it holds.
 *
 * The rule everything here turns on: a declaration row is never edited. A new version is a new row,
 * and the old one is stamped rather than replaced — because an event written two years ago is about
 * a SHAPE, and a record that cannot say what that shape was cannot read its own history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REGISTER_BODY_KEYS } from '../src/declare.ts';
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

/* ── the indexes belong to the declaration ────────────────────────── */

const indexesOn = (sql: NodeSql, register: string): string[] =>
  sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry' ORDER BY name")
    .map((r) => r.name)
    .filter((n) => n.startsWith(`entry_i_${register}__`) || n.startsWith(`entry_u_${register}__`));

const withFields = (fields: unknown[], extra: Record<string, unknown> = {}): Declaration => ({
  ...OBLIGATIONS,
  body: { ...OBLIGATIONS.body, fields, ...extra } as never,
});

/** The code a declaration is refused with, or `null` when it installs. */
const refusedWith = (decl: Declaration): string | null => validateDeclaration(decl)?.code ?? null;

test('AN INDEX IS DROPPED WHEN THE DECLARATION STOPS ASKING FOR IT', async () => {
  /* `CREATE INDEX IF NOT EXISTS` and nothing else meant the indexes outlived the declaration: take
     `unique:` off a field and the unique index went on refusing duplicates the register now allows.
     The record enforced a rule nobody had written down any more. */
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  assert.ok(indexesOn(sql, 'obligations').includes(indexName('u', 'obligations', 'ref')), 'the unique index was never built');
  value(k.create('obligations', { what: 'a', ref: 'INV-1' }, { actor: 'p_1' }));
  assert.equal(refusal(k.create('obligations', { what: 'b', ref: 'INV-1' }, { actor: 'p_1' })).code, 'ALREADY_KNOWN');

  // The same register, with `ref` no longer unique and `due` no longer indexed.
  value(
    await k.install([
      withFields([
        { id: 'what', type: 'text', required: true },
        { id: 'amount', type: 'money', index: true },
        { id: 'due', type: 'day' },
        { id: 'ref', type: 'text' },
        { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
      ]),
    ]),
  );

  const after = indexesOn(sql, 'obligations');
  assert.ok(!after.includes(indexName('u', 'obligations', 'ref')), 'a unique index outlived the `unique:` that asked for it');
  assert.ok(!after.includes(indexName('i', 'obligations', 'due')), 'an index outlived the `index:` that asked for it');
  assert.ok(after.includes(indexName('i', 'obligations', 'amount', 'amount')), 'an index that is still declared was dropped');

  // And the rule the declaration no longer makes is no longer enforced.
  value(k.create('obligations', { what: 'b', ref: 'INV-1' }, { actor: 'p_1' }));
  sql.close();
});

test('and a retired field takes its indexes with it', async () => {
  const { k, sql } = await record();
  value(await k.install([OBLIGATIONS]));
  value(
    await k.install([
      withFields([
        { id: 'what', type: 'text', required: true },
        { id: 'amount', type: 'money', index: true, retired: true },
        { id: 'due', type: 'day', index: true },
        { id: 'ref', type: 'text', unique: true },
        { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
      ]),
    ]),
  );
  const after = indexesOn(sql, 'obligations');
  assert.ok(!after.some((n) => n.includes('__amount')), `a retired field kept its indexes: ${after.join(', ')}`);
  sql.close();
});

test('a `unique:` over rows that already clash is REFUSED, not thrown', async () => {
  // SQLite raises a constraint error at CREATE INDEX, which escaped `install` as an exception — a
  // caller reading `Result` never saw it coming, and the sentence it needed was "two rows say INV-1".
  const { k, sql } = await record();
  value(
    await k.install([
      withFields([
        { id: 'what', type: 'text', required: true },
        { id: 'ref', type: 'text' },
        { id: 'state', type: 'enum', values: ['open', 'paid'] },
      ]),
    ]),
  );
  value(k.create('obligations', { what: 'a', ref: 'INV-1' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'b', ref: 'INV-1' }, { actor: 'p_1' }));

  const out = refusal(
    await k.install([
      withFields([
        { id: 'what', type: 'text', required: true },
        { id: 'ref', type: 'text', unique: true },
        { id: 'state', type: 'enum', values: ['open', 'paid'] },
      ]),
    ]),
  );
  assert.equal(out.code, 'UNIQUE_VIOLATION');
  assert.match(out.fix, /obligations[.]ref/);
  assert.match(out.fix, /INV-1/, 'the refusal does not name the value two rows share');
  // And the refused install left nothing behind: the declaration did not version.
  assert.equal(k.register('obligations')?.fields.find((f) => f.id === 'ref')?.unique, undefined);
  assert.equal(k.count('obligations'), 2, 'a refused install touched the rows');
  sql.close();
});

/* ── the state mirror ────────────────────────────────────────── */

test('MOVING `state:` TO ANOTHER FIELD RE-MIRRORS THE ROWS THAT ALREADY EXIST', async () => {
  /* `entry.state` is a copy of one field, written on write. A declaration that named a different
     field left every existing row carrying the OLD field's value — so the index on `state` and a
     `where:` over the field itself answered differently. Two readings of one record, both confident,
     is the worst shape a bug can take here. */
  const { k, sql } = await record();
  value(
    await k.install([
      withFields([
        { id: 'what', type: 'text', required: true },
        { id: 'state', type: 'enum', values: ['open', 'paid'] },
        { id: 'stage', type: 'enum', values: ['draft', 'sent'] },
      ]),
    ]),
  );
  value(k.create('obligations', { what: 'a', state: 'open', stage: 'sent' }, { actor: 'p_1' }));
  assert.equal(sql.one<{ state: string }>('SELECT state FROM entry')?.state, 'open');

  const moved: Declaration = {
    ...OBLIGATIONS,
    body: {
      ...OBLIGATIONS.body,
      state: 'stage',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'state', type: 'enum', values: ['open', 'paid'] },
        { id: 'stage', type: 'enum', values: ['draft', 'sent'] },
      ],
    } as never,
  };
  value(await k.install([moved]));
  assert.equal(sql.one<{ state: string }>('SELECT state FROM entry')?.state, 'sent', 'the mirror still holds the old field');

  // And a register that stops naming a state clears the column rather than leaving a stale word.
  value(
    await k.install([
      {
        ...OBLIGATIONS,
        body: {
          id: 'obligations',
          name: 'Obligations',
          title: 'what',
          fields: [
            { id: 'what', type: 'text', required: true },
            { id: 'state', type: 'enum', values: ['open', 'paid'] },
            { id: 'stage', type: 'enum', values: ['draft', 'sent'] },
          ],
        } as never,
      },
    ]),
  );
  assert.equal(sql.one<{ state: string | null }>('SELECT state FROM entry')?.state, null);
  sql.close();
});

/** `OBLIGATIONS` declares a `state` field; a case about something else must not inherit it. */
const NO_STATE = { state: undefined };

/* ── the checks a register did not have ─────────────────────────────────── */

test('A FIELD TYPE THAT IS NOT ONE IS REFUSED, and the refusal guesses', () => {
  /**
   * `04 §5`'s first worked example, and it installed clean: *"`register.invoices.fields[4].type
   * 'currency'` — did you mean 'money'?"*
   *
   * `FieldType` was a TypeScript union and only that. A union checks a caller inside this repository;
   * a pack is untyped text written by somebody else, which is the entire population this check
   * exists for. `type: 'currency'` reached `coerce`, fell through its switch, and the field then
   * held whatever JSON arrived — on a register somebody declared to hold money.
   */
  const said = validateDeclaration(withFields([{ id: 'what', type: 'currency' }], NO_STATE));
  assert.equal(said?.code, 'FIELD_TYPE_UNKNOWN');
  assert.match(said?.fix ?? '', /did you mean 'money'\?/, 'the refusal names no alternative');
  assert.equal(said?.at, 'what', 'a refusal names the field that was wrong (04 §5)');

  /* A FIELD WITH NO TYPE AT ALL, which is the commoner mistake and the same silence. */
  assert.equal(refusedWith(withFields([{ id: 'what' }], NO_STATE)), 'FIELD_TYPE_UNKNOWN');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 7 }], NO_STATE)), 'FIELD_TYPE_UNKNOWN');

  /**
   * AND IT GUESSES BY WHAT PEOPLE ARRIVE WITH, not by how many letters two words share.
   *
   * `currency` is not a near-miss for `money` by any string measure — the first version of this
   * answered `document`, which shares more characters. The resemblance is that somebody coming from
   * a spreadsheet, an ORM or another record tool brings THAT tool's vocabulary. Edit distance is
   * the fallback, for slips rather than for words.
   */
  const guessFor = (type: string): string =>
    /did you mean '([a-z]+)'/.exec(validateDeclaration(withFields([{ id: 'what', type }], NO_STATE))?.fix ?? '')?.[1] ?? '—';
  for (const [said, meant] of [
    ['currency', 'money'], ['string', 'text'], ['datetime', 'instant'], ['boolean', 'bool'],
    ['select', 'enum'], ['relation', 'ref'], ['attachment', 'file'], ['password', 'secret'],
    ['array', 'list'], ['float', 'decimal'], ['integer', 'int'], ['date', 'day'],
    ['markdown', 'document'],
    /* and the slips */
    ['mony', 'money'], ['tex', 'text'], ['instnt', 'instant'], ['decimel', 'decimal'],
  ] as const)
    assert.equal(guessFor(said), meant, `${said} should suggest ${meant}`);

  /* AND THE GUESS IS NOT ALWAYS THERE. Something with nothing near it says so plainly rather than
     sending somebody after the closest string by accident — a wrong suggestion is worse than none,
     because it is followed. */
  for (const noise of ['zzz', 'xylophone', 'q'])
    assert.equal(guessFor(noise), '—', `${noise} should suggest nothing`);

  /* The sixteen still install. This is the assertion that would catch a check that refuses
     everything — a gate that is red for every input is as useless as one that is never red. */
  for (const type of ['text', 'document', 'int', 'duration', 'decimal', 'money', 'quantity', 'day', 'instant', 'bool', 'ref', 'file', 'url', 'email', 'secret', 'json'])
    assert.equal(refusedWith(withFields([{ id: 'what', type }], NO_STATE)), null, `${type} is a type and was refused`);
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'enum', values: ['a'] }], NO_STATE)), null);
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list', of: 'text' }], NO_STATE)), null);
});

test('and a list says what it holds, which is never another list', () => {
  /* `list<T>` carries its element type in `of`. A list of lists is a shape the write path has no
     coercion for and the `where:` compiler cannot index. */
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list' }], NO_STATE)), 'FIELD_TYPE_UNKNOWN');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list', of: 'list' }], NO_STATE)), 'FIELD_TYPE_UNKNOWN');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list', of: 'nope' }], NO_STATE)), 'FIELD_TYPE_UNKNOWN');
});

test('AN ENUM WITH NO VALUES IS A FIELD THAT REFUSES EVERYTHING', () => {
  /* `02 §1`: an enum is *"a string in `values`"*. With no `values`, every write to it fails
     coercion — after the pack installed and the form drew a control with nothing in it. */
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'enum' }], NO_STATE)), 'DECLARATION_INVALID');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'enum', values: [] }], NO_STATE)), 'DECLARATION_INVALID');
});

test('SIXTY-FIVE FIELDS IS A DATABASE, NOT A REGISTER', () => {
  /* `02 §5`'s ceiling, and its own sentence for why. Each one becomes a control in a form, a line
     in an MCP schema and a term in a `json_extract` plan. */
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i === 0 ? 'what' : `f${i}`, type: 'text' }));
  assert.equal(refusedWith(withFields(many(64), NO_STATE)), null, 'sixty-four is the ceiling, not one past it');
  const said = validateDeclaration(withFields(many(65), NO_STATE));
  assert.equal(said?.code, 'FIELDS_OVER_CAP');
  assert.match(said?.fix ?? '', /65 fields/, 'the refusal does not say how many there were');
});

test('and nine indexed fields is one past the ceiling', () => {
  /* `02 §5`: eight, *"each a partial expression index, which costs storage and write time rather
     than a column. Unbounded indexing is how a 10 GB budget and a write-row bill disappear."* */
  const indexed = (n: number) =>
    Array.from({ length: 10 }, (_, i) => ({ id: i === 0 ? 'what' : `f${i}`, type: 'text', ...(i < n ? { index: true } : {}) }));
  assert.equal(refusedWith(withFields(indexed(8), NO_STATE)), null);
  assert.equal(refusedWith(withFields(indexed(9), NO_STATE)), 'INDEXES_OVER_CAP');

  /* `unique` COUNTS TOO, and it is the half somebody forgets: a `unique:` is an index with a
     constraint on it, and eight of each is sixteen indexes on one register. */
  const mixed = Array.from({ length: 10 }, (_, i) => ({
    id: i === 0 ? 'what' : `f${i}`,
    type: 'text',
    ...(i < 5 ? { index: true } : i < 9 ? { unique: true } : {}),
  }));
  assert.equal(refusedWith(withFields(mixed, NO_STATE)), 'INDEXES_OVER_CAP');
});

test('A STATE FIELD IS ALWAYS AN ENUM', () => {
  /* `02 §1` and `04 §5`. A `state:` naming a `text` field gives the register a lifecycle with no
     transitions the record can check — so every `move` in every rule against it is unenforceable,
     which is the one thing a state field is for. */
  const said = validateDeclaration(
    withFields([{ id: 'what', type: 'text' }, { id: 'state', type: 'text' }], { state: 'state' }),
  );
  assert.equal(said?.code, 'STATE_NOT_ENUM');
  assert.deepEqual(said?.allowed, ['enum']);
  assert.equal(
    refusedWith(withFields([{ id: 'what', type: 'text' }, { id: 'state', type: 'enum', values: ['open'] }], { state: 'state' })),
    null,
  );
});

test('AND `search:` TAKES WHAT THE INDEX CAN TAKE', () => {
  /* `02 §1` closes it at text, document, enum, url, email and `list<text>`. `04 §5`'s example is
     this one exactly: *"search names amount, which is money."* A money field named here produced an
     FTS column of `[object Object]` and a search that quietly matched nothing — the failure mode
     that looks like an empty record. */
  const said = validateDeclaration(
    withFields([{ id: 'what', type: 'text' }, { id: 'amount', type: 'money' }], { ...NO_STATE, search: ['what', 'amount'] }),
  );
  assert.equal(said?.code, 'SEARCH_FIELD_TYPE');
  assert.match(said?.fix ?? '', /which is money/);
  assert.equal(said?.at, 'amount');

  for (const type of ['text', 'document', 'url', 'email'])
    assert.equal(refusedWith(withFields([{ id: 'what', type }], { ...NO_STATE, search: ['what'] })), null, `${type} is searchable`);
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'enum', values: ['a'] }], { ...NO_STATE, search: ['what'] })), null);
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list', of: 'text' }], { ...NO_STATE, search: ['what'] })), null, 'list<text> is searchable');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'list', of: 'int' }], { ...NO_STATE, search: ['what'] })), 'SEARCH_FIELD_TYPE');

  /* AND A SEARCH FIELD THAT IS NOT A FIELD. Naming one that does not exist is the same class of
     silence: the index is built over nothing and the register searches by title alone. */
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'text' }], { ...NO_STATE, search: ['nope'] })), 'DECLARATION_INVALID');
  assert.equal(refusedWith(withFields([{ id: 'what', type: 'text' }], { ...NO_STATE, search: 'what' })), 'DECLARATION_INVALID');
});

/* ── a metric, which nothing checked at all ───────────────────────────────────── */

/** A metric that satisfies `08 §2`, with one key overridden per case. */
const metric = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'metric.unpaid',
  kind: 'metric',
  body: {
    metric: 'unpaid',
    source: 'register.obligations',
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 2_000_000 },
    window: '30d',
    ...over,
  } as never,
});

test('A METRIC WAS CHECKED BY NOTHING, and 08 §2 marks two keys required in bold', () => {
  /**
   * `validate` deep-checked a register, a digest, a connector and a rule, and returned `null` for a
   * metric — so every key in `08 §2`'s table was advisory.
   *
   * `04 §5` gives the refusal its own sentence, and it is the argument for this product having
   * metrics rather than counters: *"a number with no target is decoration; a number with no
   * comparison window cannot be acted on."*
   */
  assert.equal(refusedWith(metric()), null, 'a metric that satisfies 08 §2 was refused');

  const noTarget = validateDeclaration(metric({ target: undefined }));
  assert.equal(noTarget?.code, 'METRIC_NEEDS_TARGET_OR_WINDOW');
  assert.equal(noTarget?.at, 'target');
  assert.match(noTarget?.fix ?? '', /decoration/, 'the refusal does not carry 04 §5’s sentence');

  const noWindow = validateDeclaration(metric({ window: undefined }));
  assert.equal(noWindow?.code, 'METRIC_NEEDS_TARGET_OR_WINDOW');
  assert.equal(noWindow?.at, 'window');
});

test('and a source is a register or a series, not a bare name', () => {
  /* `08 §2`: `register.<id>` or `series.<id>` (`25 §8`). A bare register name is the commonest
     mistake and the evaluator reads it as neither. */
  assert.equal(refusedWith(metric({ source: 'series.npm-downloads' })), null);
  for (const source of ['obligations', 'register.', 'table.obligations', 7, undefined])
    assert.equal(refusedWith(metric({ source })), 'DECLARATION_INVALID', `${String(source)} is not a source`);
});

test('and money carries its currency, because 02 §3 says a bare number is not money', () => {
  /* A `format` of `money` with no currency reaches the renderer as an unresolved figure — and
     `02 §3`'s whole argument is that a bare number loses the one fact that makes a total mean
     anything. */
  assert.equal(refusedWith(metric({ format: 'money.EGP' })), null);
  for (const format of ['int', 'decimal', 'pct', 'days', 'duration'])
    assert.equal(refusedWith(metric({ format })), null, `${format} is a format`);
  for (const format of ['money', 'money.gbp', 'money.GB', 'currency', 'number', undefined])
    assert.equal(refusedWith(metric({ format })), 'DECLARATION_INVALID', `${String(format)} is not a format`);
});

test('and one dimension, because two is a report generator', () => {
  /* `04 §5`, verbatim: *"group_by takes one field. Two dimensions is a report generator."*
     `08 §2.1` is explicit that the second dimension is the line this product does not cross. */
  assert.equal(refusedWith(metric({ group_by: 'channel' })), null);
  assert.equal(refusedWith(metric({ group_by: ['channel'] })), null);
  const two = validateDeclaration(metric({ group_by: ['channel', 'client'] }));
  assert.equal(two?.code, 'GROUP_BY_TWICE');
  assert.match(two?.fix ?? '', /report generator/);
  assert.equal(refusedWith(metric({ group_by: 7 })), 'DECLARATION_INVALID');
});

test('and a bucket buckets a grouping, or it buckets nothing', () => {
  /* `08 §2.1`: *"only with a date `group_by`"*. Handed one alone, the evaluator returns the
     ungrouped figure with a bucket key nobody reads — a chart that draws one bar and looks like
     data. */
  assert.equal(refusedWith(metric({ group_by: 'due', bucket: 'week' })), null);
  assert.equal(refusedWith(metric({ bucket: 'week' })), 'DECLARATION_INVALID');
  assert.equal(refusedWith(metric({ group_by: 'due', bucket: 'fortnight' })), 'DECLARATION_INVALID');
  for (const bucket of ['day', 'week', 'month', 'quarter', 'year'])
    assert.equal(refusedWith(metric({ group_by: 'due', bucket })), null, `${bucket} is a bucket`);
});

test('and a comparison is one of the three the evaluator has an arm for', () => {
  /* `compare: 'last'` fell through the evaluator's if-chain and silently compared against nothing —
     the shape this codebase keeps producing: something complete-looking that reports success and
     does nothing. */
  for (const compare of ['previous', 'year_ago', 'none'])
    assert.equal(refusedWith(metric({ compare })), null, `${compare} is a comparison`);
  const said = validateDeclaration(metric({ compare: 'last' }));
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.deepEqual(said?.allowed, ['previous', 'year_ago', 'none']);
});

test('AND EVERY METRIC THE RECORD SHIPS SATISFIES ALL OF IT', async () => {
  /* BY PATH, because the kernel does not depend on the seed and must not — `31 §2`'s order puts
     the seed above it. This is a test reading a population, which is the same shape as the currency
     drift check one package over. */
  const { metricDeclarations } = await import('../../seed/src/index.ts');
  /* The other half of a new check: it must not refuse what already works. A rule that is red for
     every input is as useless as one that is never red, and the seed is the population this one
     will meet first. */
  const SEED_METRICS = metricDeclarations();
  for (const decl of SEED_METRICS)
    assert.equal(validateDeclaration(decl), null, `${decl.id} is a metric this record ships and the check refuses it`);
  assert.ok(SEED_METRICS.length >= 5, 'too few seeded metrics for that to mean anything');
});

/* ── a page, which installed unchecked ───────────────────────────────────── */

/** A page that satisfies `06 §1.1`, with one key overridden per case. */
const page = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'page.invoicing',
  kind: 'page',
  body: {
    page: 'invoicing',
    title: 'Invoicing',
    nav: { section: 'Money', order: 20 },
    requires: ['register.obligations'],
    blocks: [
      { kind: 'table', heading: 'Open', span: 12, source: 'register.obligations', columns: [{ field: 'what' }], limit: 50, empty: 'Nothing outstanding.' },
    ],
    ...over,
  } as never,
});

/** One block on an otherwise sound page — the shape most cases here vary. */
const block = (over: Record<string, unknown>): Declaration => page({ blocks: [{ kind: 'note', ...over }] });

/** What a declaration is refused with when the record can say what else it holds. */
const inRecord = (decl: Declaration, ...also: Declaration[]): string | null =>
  validateDeclaration(decl, new Map([[decl.id, decl.body], ...also.map((d) => [d.id, d.body] as const)]))?.code ?? null;

test('A PAGE WAS CHECKED BY NOTHING, and it is the declaration with the most ways to be quietly wrong', () => {
  /**
   * `validate` deep-checked a register, a digest, a connector and a rule and returned `null` for a
   * page — so every key in `06 §1.1`'s two tables was advisory, on the one kind whose faults all
   * RENDER. `readBlock` is written never to throw, which is right at render and is exactly why the
   * install check matters: the refusal it produces is read by whoever opens the page, weeks after
   * the person who wrote it has gone.
   */
  assert.equal(refusedWith(page()), null, 'a page that satisfies 06 §1.1 was refused');

  /* A PAGE IS NAMED ON THE SCREEN BEFORE IT IS DRAWN. */
  for (const title of [undefined, '', '   ', 7])
    assert.equal(refusedWith(page({ title })), 'DECLARATION_INVALID', `${String(title)} is not a title`);

  /* AND A PAGE WITH NO BLOCKS IS A HEADING WITH NOTHING UNDER IT. */
  assert.equal(refusedWith(page({ blocks: [] })), 'DECLARATION_INVALID');
  assert.equal(refusedWith(page({ blocks: 'a table' })), 'DECLARATION_INVALID');
  const many = (n: number) => Array.from({ length: n }, () => ({ kind: 'note' }));
  assert.equal(refusedWith(page({ blocks: many(24) })), null, 'twenty-four is the ceiling, not one past it');
  assert.match(validateDeclaration(page({ blocks: many(25) }))?.fix ?? '', /25 blocks/);
});

test('A BLOCK KIND IS ONE OF THE SIXTEEN, and the closure is what the security argument is made of', () => {
  /**
   * `04 §1`: *"the closure is load-bearing rather than tidy — the security argument in §7 is an
   * ENUMERATION, and an enumeration only works over a finite list."*
   *
   * And the failure it prevents is silence rather than an exploit: `readBlock` compares `kind` to
   * nothing, so a block whose kind is a typo takes the *"a block with no source is a written block"*
   * arm and comes back as `base` — no rows, no refusal, no mark on the page. A block that draws
   * nothing and says nothing is indistinguishable from a block whose register is empty.
   */
  const said = validateDeclaration(block({ kind: 'prose' }));
  assert.equal(said?.code, 'KIND_UNKNOWN');
  assert.equal(said?.at, 'blocks[0]', 'a refusal names the block that was wrong (04 §5)');
  assert.ok(said?.allowed?.includes('note'), 'the refusal offers no alternative');

  /* THE SIXTEEN STILL INSTALL. A gate red for every input is as useless as one never red. */
  for (const kind of ['note', 'quote', 'stat', 'bar', 'gauge', 'chips', 'spec', 'params', 'todo', 'steps', 'timeline', 'board', 'code', 'tree', 'comparison', 'table'])
    assert.equal(refusedWith(block({ kind })), null, `${kind} is one of the sixteen and was refused`);

  /* AND A SEVENTEENTH ARRIVES AS A DECLARATION, which is the whole reason the primitive layer
     exists (05 §2) — admitted by prefix, and checked as a document of its own. */
  assert.equal(refusedWith(block({ kind: 'block.invoice_card' })), null);
  assert.equal(refusedWith(block({ kind: 'block.Invoice Card' })), 'KIND_UNKNOWN');
});

test('A BLOCK HAS AN ORDER AND A WIDTH IN TWELFTHS, and no x, y or height at all', () => {
  /* `06 §1.1` gives a block its place in the list and `span: 1–12`, and that is the whole of its
     geometry. `21 §11`: a size control REFUSES below its floor rather than clamping, because a
     declaration silently clamped is a number that never reached the screen. */
  for (let span = 1; span <= 12; span++) assert.equal(refusedWith(block({ span })), null, `span ${span} is a width`);
  for (const span of [0, 13, -1, 2.5, '6', null])
    assert.equal(refusedWith(block({ span })), 'OUT_OF_BOUNDS', `${String(span)} is not a width`);
  assert.match(validateDeclaration(block({ span: 13 }))?.fix ?? '', /12 columns/);

  /* AND THE ROW COUNT, which `readBlock` reads as 50 when absent and floors at 500. Zero is a block
     that draws nothing, which is a thing somebody can mean. */
  for (const limit of [0, 1, 50, 500]) assert.equal(refusedWith(block({ kind: 'table', limit })), null, `${limit} is a row count`);
  for (const limit of [-1, 501, 1.5]) assert.equal(refusedWith(block({ kind: 'table', limit })), 'OUT_OF_BOUNDS');
});

test('and a source is one of the three forms, or the one the record computes', () => {
  /* `42 §4.5` gives three; `pages.ts`'s `COMPUTED` set adds `forecast.runway`, which the money page
     ships. A source list written from the document with the product left out would refuse the
     record's own page. */
  for (const source of ['register.obligations', 'metric.overdue', 'block.2', 'forecast.runway'])
    assert.equal(refusedWith(page({ requires: undefined, blocks: [{ kind: 'table', source, empty: 'x' }] })), null, `${source} is a source`);
  for (const source of ['obligations', 'table.obligations', 'register.', 7, null])
    assert.equal(
      refusedWith(page({ requires: undefined, blocks: [{ kind: 'table', source, empty: 'x' }] })),
      'DECLARATION_INVALID',
      `${String(source)} is not a source`,
    );
});

test('A PAGE CANNOT APPEAR WITHOUT ITS DATA, and that is what `requires:` is for', () => {
  /**
   * `06 §1`: *"a nav entry that opens an empty screen is worse than no nav entry"* — and `requires`
   * is the mechanism, because it is what takes the page out of the nav when the pack holding its
   * rows is uninstalled.
   *
   * `42 §4.5` states the coverage rule and gives it a code: *"every register any block reads must be
   * here (`DEPENDENCY_UNRESOLVED`)"*. A block reading a register the page does not require is a page
   * that OUTLIVES its data — it stays in the nav and draws an empty table under a heading that
   * promises one.
   */
  const said = validateDeclaration(
    page({ requires: ['register.obligations'], blocks: [{ kind: 'table', source: 'register.clients', empty: 'x' }] }),
  );
  assert.equal(said?.code, 'DEPENDENCY_UNRESOLVED');
  assert.ok(said?.allowed?.includes('register.obligations'), 'the refusal does not say what the page does require');
  assert.match(said?.fix ?? '', /outlives its data/);

  /* And the shape of the list itself, which is one to sixteen registers. */
  for (const requires of [[], 'register.obligations', ['obligations'], ['metric.x'], Array.from({ length: 17 }, (_, i) => `register.r${i}`)])
    assert.equal(refusedWith(page({ requires })), 'DECLARATION_INVALID', `${JSON.stringify(requires)} is not a requires`);
});

test('AND A REGISTER THAT NEVER ARRIVED IS THE HALF A DOCUMENT CANNOT ANSWER ALONE', () => {
  /* `04 §5`'s own code and own sentence. The batch is the arriving record — `04 §2`'s worked pack
     declares `register.invoices` and `page.invoicing` in one file, so resolving only against what is
     already installed would refuse every pack that ships a page with its data. */
  const OBS: Declaration = { id: 'register.obligations', kind: 'register', body: { id: 'obligations' } as never };
  assert.equal(inRecord(page(), OBS), null, 'a page whose register arrives with it was refused');
  assert.equal(inRecord(page()), 'DEPENDENCY_UNRESOLVED', 'a page requiring a register nobody has installed cleanly');
  assert.match(validateDeclaration(page(), new Map())?.fix ?? '', /not installed/);

  /* AND A CALLER WITH NO VIEW OF THE RECORD GETS THE ANSWER IT ALWAYS GOT. A refusal somebody cannot
     act on teaches them the check is broken, and `validateDeclaration` is called on a single
     document in places that have no idea what else is installed. */
  assert.equal(refusedWith(page()), null, 'a context-free check refused a page for something it cannot see');
});

test('and a figure a page draws is a metric id, parameter and all', () => {
  /* `pages.ts` splits a cell's metric on the FIRST colon — `project-owed:Kiln` is one document read
     about one project, which is what makes a project page a declaration rather than four copies. */
  const stat = (cells: unknown) => refusedWith(page({ requires: undefined, blocks: [{ kind: 'stat', cells }] }));
  assert.equal(stat([{ metric: 'overdue', label: 'Overdue' }]), null);
  assert.equal(stat([{ metric: 'project-owed:{{name}}', label: 'Owed' }]), null, 'a parameterised figure was refused');
  assert.equal(stat([]), 'DECLARATION_INVALID');
  assert.equal(stat(Array.from({ length: 7 }, () => ({ metric: 'overdue' }))), 'DECLARATION_INVALID');
  for (const metric of [undefined, 7, 'Overdue', ''])
    assert.equal(stat([{ metric }]), 'DECLARATION_INVALID', `${String(metric)} is not a figure`);

  /* AND `when:` IS ONE LEAF NAMING A METRIC (06 §1). A `when:` naming nothing is a block that is
     either always drawn or never, and both are indistinguishable from the block working. */
  assert.equal(refusedWith(block({ when: { metric: 'overdue', gt: 0 } })), null);
  for (const when of [{ gt: 0 }, { metric: 7 }, 'overdue > 0'])
    assert.equal(refusedWith(block({ when })), 'DECLARATION_INVALID', `${JSON.stringify(when)} is not a when`);
});

test('and the counted keys are counted, and a tone is one of the four', () => {
  assert.equal(refusedWith(block({ kind: 'table', columns: [{ field: 'what' }] })), null);
  for (const columns of [[], 'what', [{ label: 'What' }], Array.from({ length: 17 }, () => ({ field: 'a' }))])
    assert.equal(refusedWith(block({ kind: 'table', columns })), 'DECLARATION_INVALID', `${JSON.stringify(columns)} is not a column list`);

  assert.equal(refusedWith(block({ kind: 'table', order: [{ field: 'due', dir: 'asc' }] })), null);
  for (const order of [[], [{ field: 'due', dir: 'up' }], [{ dir: 'asc' }], [1, 2, 3, 4].map(() => ({ field: 'a' }))])
    assert.equal(refusedWith(block({ kind: 'table', order })), 'DECLARATION_INVALID', `${JSON.stringify(order)} is not an order`);

  for (const tone of ['good', 'warn', 'bad', 'info']) assert.equal(refusedWith(block({ tone })), null, `${tone} is an intent`);
  assert.equal(refusedWith(block({ tone: 'danger' })), 'DECLARATION_INVALID');
  assert.equal(refusedWith(page({ tone: 'danger' })), 'DECLARATION_INVALID');
});

test('PAGES CAN APPEAR ON THEIR OWN; NAVIGATION CANNOT', () => {
  /* `06 §3`, and both halves of a nav entry are load-bearing: an entry with no section is an item in
     no menu, and one with no order sorts against whatever the reader last wrote. Both install
     cleanly today and both produce a page reachable only by typing its slug. */
  assert.equal(refusedWith(page({ nav: undefined })), null, 'a page out of the nav is a page (06 §3, the holding pen)');
  assert.equal(refusedWith(page({ nav: { section: 'Money', order: 0 } })), null);
  for (const nav of [{ order: 20 }, { section: 'Money' }, { section: '', order: 1 }, { section: 'Money', order: 10_000 }, { section: 'Money', order: 1.5 }, 'Money'])
    assert.equal(refusedWith(page({ nav })), 'DECLARATION_INVALID', `${JSON.stringify(nav)} is not a nav entry`);
});

test('AND A BATCH IS ALL OR NOTHING ABOUT A DEPENDENCY TOO', async () => {
  /* THE END OF THE WIRE. `installDeclarations` reads the record's live declarations and unions them
     with the batch before it validates, so the page half of `DEPENDENCY_UNRESOLVED` is a fact about
     the record rather than a unit test's argument. */
  const { k, sql } = await record();
  const lone = refusal(await k.install([page({ requires: ['register.clients'], blocks: [{ kind: 'note' }] })]));
  assert.equal(lone.code, 'DEPENDENCY_UNRESOLVED');
  assert.equal(sql.all('SELECT 1 FROM declaration').length, 0, 'a page whose register is nowhere was installed');

  /* AND THE REGISTER ARRIVING BESIDE IT RESOLVES, which is what a pack is. */
  value(await k.install([OBLIGATIONS, page({ blocks: [{ kind: 'note' }] })]));
  /* AND SO DOES ONE THAT WAS ALREADY THERE, on a second install that carries only the page. */
  value(await k.install([page({ title: 'Invoicing, again', blocks: [{ kind: 'note' }] })]));
  sql.close();
});

test('AND EVERY PAGE THE RECORD SHIPS SATISFIES ALL OF IT', async () => {
  /* BY PATH, because the kernel does not depend on the seed and must not — `31 §2`'s order puts the
     seed above it, and an import through the workspace name would invert that. The metric half of
     this test has caught checks that were right about the document and wrong about the product; the
     page half is where a closed kind list and a `requires` coverage rule meet a real population for
     the first time. */
  const { declarations, pageDeclarations, metricDeclarations } = await import('../../seed/src/index.ts');
  const SEED_PAGES = pageDeclarations();
  for (const decl of SEED_PAGES)
    assert.equal(validateDeclaration(decl), null, `${decl.id} is a page this record ships and the check refuses it`);
  assert.ok(SEED_PAGES.length >= 4, 'too few seeded pages for that to mean anything');

  /* AND AS A BATCH, which is the form they install in — every `requires` resolved against the
     registers arriving beside them. */
  const batch = [...declarations(), ...pageDeclarations(), ...metricDeclarations()];
  const known = new Map(batch.map((d) => [d.id, d.body]));
  for (const decl of batch)
    assert.equal(validateDeclaration(decl, known), null, `${decl.id} is refused when the record says what it holds`);
});

/* ── a theme, whose closure a parser can answer and whose floors it cannot ─ */

/** A theme that satisfies `28 §1`, with one key overridden per case. */
const theme = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'theme.midnight',
  kind: 'theme',
  body: { theme: 'midnight', seed: { accent: '#CF413A' }, scheme: 'both', ...over } as never,
});

test('A THEME VALUE IS ONE THE COLOUR PARSER READS, and alpha is the one that looks right', () => {
  /**
   * `39 §6.2` gives `THEME_VALUE_INVALID` to *"what only the colour parser sees"*, and the dialect is
   * three forms: `#RGB`, `#RRGGBB`, `oklch(L C H)` (`parseColour`, `28 §1`).
   *
   * ALPHA IS NAMED SEPARATELY BECAUSE IT PARSES EVERYWHERE ELSE. `#0B0D0CCC` is a colour in every
   * other tool; here it is a role that is partly the surface underneath it, so every contrast number
   * measured against that role is measured against a colour that never ships. A refusal that only
   * said *not a colour* would send somebody hunting a typo in eight correct hex digits.
   */
  assert.equal(refusedWith(theme()), null, 'a theme that satisfies 28 §1 was refused');
  for (const accent of ['#CF413A', '#C43', 'oklch(0.58 0.18 27)'])
    assert.equal(refusedWith(theme({ seed: { accent } })), null, `${accent} is a colour`);

  for (const accent of ['rebeccapurple', 'rgb(207 65 58)', 'hsl(3 57% 52%)', '#GGGGGG', '#CF413', 5])
    assert.equal(refusedWith(theme({ seed: { accent } })), 'THEME_VALUE_INVALID', `${String(accent)} is not a colour this dialect reads`);

  for (const accent of ['#CF413ACC', '#C43F', 'rgba(207 65 58 / 0.8)', 'oklch(0.58 0.18 27 / 0.5)']) {
    const said = validateDeclaration(theme({ seed: { accent } }));
    assert.equal(said?.code, 'THEME_VALUE_INVALID', `${accent} carries an alpha and was admitted`);
    assert.match(said?.fix ?? '', /alpha/, 'the refusal does not say which half of the value is the problem');
  }
});

test('AN ACHROMATIC SEED HAS NO HUE TO BUILD FROM, which is 04 §5’s own worked example', () => {
  /* `28 §3` step 0: below chroma 0.02 the hue angle is numerically unstable — two greys can be 180°
     apart — so every role solved from that hue is solved from a number that means nothing. */
  const said = validateDeclaration(theme({ seed: { accent: 'oklch(0.62 0.01 262)' } }));
  assert.equal(said?.code, 'THEME_VALUE_INVALID');
  assert.equal(said?.at, 'theme.midnight.seed.accent', 'the refusal names the JSON path (39 §6.2)');
  assert.match(said?.fix ?? '', /almost grey/);

  /* A HEX WHOSE THREE CHANNELS ARE EQUAL IS GREY BY CONSTRUCTION and needs no conversion. */
  for (const accent of ['#808080', '#CCC', '#000000', '#ffffff'])
    assert.equal(refusedWith(theme({ seed: { accent } })), 'THEME_VALUE_INVALID', `${accent} is grey`);
  assert.equal(refusedWith(theme({ seed: { accent: 'oklch(0.58 0.02 27)' } })), null, '0.02 is the floor, not one under it');
  assert.equal(refusedWith(theme({ seed: { accent: '#CF413A' } })), null);
});

test('and a theme loads nothing from elsewhere, which is the pack’s refusal wherever it appears', () => {
  /* `04 §5` and `42 §4.10`: the banned substrings are `REMOTE_ASSET`, *"the same refusal wherever in
     a pack it appears"* — an image URL in a page and a `url(` in a token value are one attack, and
     it is the record id arriving in somebody's access log. `var(` is here for a different reason and
     it is not the network: it lets a token escape into another token's context. */
  for (const value of ['url(https://cdn.example/a.png)', 'image(x)', 'element(#a)', 'attr(href)', 'var(--ink)', '\\41'])
    assert.equal(refusedWith(theme({ roles: { dark: { ink: value } } })), 'REMOTE_ASSET', `${value} is not a token value`);
});

test('and the closed words and the bounded numbers of 42 §4.10', () => {
  assert.equal(refusedWith(theme({ roles: { light: { ink: '#111111' }, dark: { ink: '#EEEEEE' } } })), null);
  /* `info` IS A ROLE. `42 §4.10` lists twenty-two and `@braindog/theme`'s own `Role` union has
     twenty-seven — `info` was added when the house accent became the mark and stopped being what
     `info` resolved to. A role list closed against the stale half would refuse a role the shipped
     house theme emits, which is why the names are left to the package that owns them. */
  assert.equal(refusedWith(theme({ roles: { dark: { info: '#5B8DEF' } } })), null, 'the stale 22-role list refused a role the house theme ships');
  for (const roles of [{ midnight: { ink: '#111111' } }, { dark: { ink: 7 } }, { dark: 'ink' }, ['#111111']])
    assert.equal(refusedWith(theme({ roles })), 'THEME_VALUE_INVALID', `${JSON.stringify(roles)} is not a role map`);

  for (const scheme of ['light', 'dark', 'both']) assert.equal(refusedWith(theme({ scheme })), null);
  assert.equal(refusedWith(theme({ scheme: 'auto' })), 'THEME_VALUE_INVALID');

  for (const density of ['compact', 'comfortable', 'roomy']) assert.equal(refusedWith(theme({ scale: { density } })), null);
  assert.equal(refusedWith(theme({ scale: { density: 'cosy' } })), 'THEME_VALUE_INVALID');
  assert.equal(refusedWith(theme({ scale: { space: { base: 4 } } })), null);
  for (const base of [1, 9, 4.5, '4']) assert.equal(refusedWith(theme({ scale: { space: { base } } })), 'THEME_VALUE_INVALID');
  assert.equal(refusedWith(theme({ scale: { radius: { sm: 4, md: 6, lg: 8 } } })), null);
  assert.equal(refusedWith(theme({ scale: { radius: { lg: 25 } } })), 'THEME_VALUE_INVALID');

  assert.equal(refusedWith(theme({ seed: { accent: '#CF413A', neutral_hue: 110 } })), null);
  assert.equal(refusedWith(theme({ seed: { accent: '#CF413A', neutral_hue: 'from-accent' } })), null);
  assert.equal(refusedWith(theme({ seed: { accent: '#CF413A', neutral_hue: 400 } })), 'THEME_VALUE_INVALID');
  assert.equal(refusedWith(theme({ seed: undefined })), 'THEME_VALUE_INVALID');
});

/* ── an ingest, of which only the pull half was checked ──────────────────── */

/** An ingest that satisfies `07 §3`, with one key overridden per case. */
const ingest = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.hsbc_sms',
  kind: 'ingest',
  body: {
    ingest: 'hsbc_sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@hsbc.example' }, { field: 'subject', contains: 'transaction' }] },
    extract: { amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register: 'transactions' },
    ...over,
  } as never,
});

test('AN EXTRACTOR IS ONE OF THE THIRTEEN, and a fourteenth returns null on an arrival days later', () => {
  /**
   * `07 §3` counts them: ten extractors and three combinators. `ingest.ts` reads a form with
   * `'money' in form`, so an unknown key falls through every arm and `extract` returns `null` for
   * that field — which the write path then reports as a MISSING REQUIRED FIELD, on somebody's bank
   * email, naming the field rather than the typo that caused it. The person who could fix it wrote
   * the declaration, and by then they are looking at a stranger's payload.
   */
  const said = validateDeclaration(ingest({ extract: { amount: { regex: '\\d+' } } }));
  assert.equal(said?.code, 'EXTRACTOR_UNKNOWN');
  assert.match(said?.fix ?? '', /thirteen/);
  assert.ok(said?.allowed?.includes('money'), 'the refusal offers no alternative');

  /* `07 §3` RECORDS AN EARLIER DRAFT COLLAPSING `int` AND `decimal` INTO AN INVENTED `number`, which
     is the failure mode a stated count exists to catch. So the count is stated here too. */
  const forms: Record<string, unknown> = {
    after: { after: 'EGP' }, before: { before: ' on' }, between: { between: ['at ', ' on'] },
    money: { money: { currency: 'EGP' } }, date: { date: { format: 'DD/MM/YY' } }, text: { text: {} },
    int: { int: {} }, decimal: { decimal: { sep: '.' } }, enum: { enum: { map: { debited: 'debit' } } },
    lookup: { lookup: { register: 'accounts', by: 'last4' } },
    first: { first: [{ text: {} }, { int: {} }] }, nth: { nth: { n: 2, of: { text: {} } } },
    default: { default: { value: 0, of: { int: {} } } },
  };
  assert.equal(Object.keys(forms).length, 13, 'the thirteen are not thirteen');
  for (const [name, form] of Object.entries(forms))
    assert.equal(refusedWith(ingest({ extract: { a: form } })), null, `${name} is a form and was refused`);

  /* AND A COMBINATOR HOLDS FORMS, so the walk goes through it. `{ first: [ …, { number: {} } ] }` is
     the shape that installs cleanly and then chooses an arm that reads nothing. */
  assert.equal(refusedWith(ingest({ extract: { a: { first: [{ text: {} }, { number: {} }] } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: { nth: { n: 2, of: { number: {} } } } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: { default: { value: 0, of: { number: {} } } } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: 'money' } })), 'EXTRACTOR_UNKNOWN');
});

test("and a COMBINATOR'S OWN ARGUMENTS, which went through unread", () => {
  /* The key was checked against the thirteen and the inner forms were walked, and everything in
     between was accepted: `first: []` with no arms, `nth: { n: 0 }`, a `default` with no `value`.
     All three install, match arrivals and read nothing — the same silence the check above exists to
     break, one level in. `43 §4.3` puts the ceilings at 2–8 arms and 1–64 candidates. */
  assert.equal(refusedWith(ingest({ extract: { a: { first: [{ int: {} }] } } })), 'EXTRACTOR_UNKNOWN', 'one arm');
  assert.equal(refusedWith(ingest({ extract: { a: { first: [] } } })), 'EXTRACTOR_UNKNOWN', 'no arms');
  assert.equal(refusedWith(ingest({ extract: { a: { first: { int: {} } } } })), 'EXTRACTOR_UNKNOWN', 'not a list');
  assert.equal(
    refusedWith(ingest({ extract: { a: { first: Array.from({ length: 9 }, () => ({ int: {} })) } } })),
    'EXTRACTOR_UNKNOWN',
    'nine arms',
  );

  assert.equal(refusedWith(ingest({ extract: { a: { nth: { n: 0, of: { int: {} } } } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: { nth: { n: 1.5, of: { int: {} } } } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: { nth: { n: 65, of: { int: {} } } } } })), 'EXTRACTOR_UNKNOWN');
  assert.equal(refusedWith(ingest({ extract: { a: { nth: { of: { int: {} } } } } })), 'EXTRACTOR_UNKNOWN', 'no n');
  assert.equal(refusedWith(ingest({ extract: { a: { nth: { n: 2 } } } })), 'EXTRACTOR_UNKNOWN', 'no of');

  /* A `default` WITH NO `value` MAKES THE FIELD REQUIRED AGAIN, silently — it reads as missing
     exactly as it did before anybody wrote the fallback. */
  const said = validateDeclaration(ingest({ extract: { a: { default: { of: { int: {} } } } } }));
  assert.equal(said?.code, 'EXTRACTOR_UNKNOWN');
  assert.match(said?.fix ?? '', /only way to make one optional/);
  assert.equal(refusedWith(ingest({ extract: { a: { default: { value: null, of: { int: {} } } } } })), null, 'null is a value');

  // And the plain ten still install: the first version of this check refused every one of them.
  assert.equal(refusedWith(ingest({ extract: { a: { money: { currency: 'EGP' } } } })), null);
  assert.equal(refusedWith(ingest({ extract: { a: { int: {} } } })), null);
});

test('A MATCH IS ABOUT WHAT AN ARRIVAL HOLDS, and a field it does not hold matches nothing', () => {
  /* `42 §4.7`: `inbox_raw` holds `from to subject body channel state ts`. A `match:` naming anything
     else compiles to a predicate over a path that is never non-null — so the pattern matches
     NOTHING, and an ingest that never fires looks exactly like one that fires correctly until
     somebody notices a month of arrivals sitting untriaged. */
  const said = validateDeclaration(ingest({ match: { all: [{ field: 'amount', gt: 0 }] } }));
  assert.equal(said?.code, 'MATCH_FIELD_UNKNOWN');
  assert.equal(said?.at, 'match');
  assert.deepEqual(said?.allowed, ['from', 'to', 'subject', 'body', 'channel', 'state', 'ts']);

  for (const field of ['from', 'to', 'subject', 'body', 'channel', 'state', 'ts'])
    assert.equal(refusedWith(ingest({ match: { all: [{ field, is: 'x' }] } })), null, `${field} is what an arrival holds`);
  assert.equal(refusedWith(ingest({ match: { field: 'from', is: 'x' } })), null, 'a bare leaf is a predicate');
  assert.equal(refusedWith(ingest({ match: { any: [{ none: [{ field: 'merchant', is: 'x' }] }] } })), 'MATCH_FIELD_UNKNOWN', 'the walk does not reach a nested group');
  /* THE SENTENCE FORM IS NOT PARSED HERE, and saying so is the point: `parseWhere` needs a `Schema`
     and a clock, neither of which a context-free check has. */
  assert.equal(refusedWith(ingest({ match: 'from is alerts@hsbc.example' })), null);
});

test('and a path is 43 §4.4’s grammar, because one outside it reaches nothing rather than throwing', () => {
  /* A mapped field whose path is malformed is simply absent, so the row is written without it and
     the connector reports a successful page. */
  const pull = (map: unknown) => refusedWith(ingest({ channel: 'pull', every: '1h', match: undefined, extract: undefined, map }));
  for (const path of ['downloads', 'a.b.c', 'rows[0].value', 'rows[-1].value', 'rows[].value', '', 'a.b[]'])
    assert.equal(pull({ v: { path } }), null, `${JSON.stringify(path)} is a path`);
  for (const path of ['a b', 'a..b', 'rows[x]', 'a[0', 'a.b[].c[]', 7, Array.from({ length: 17 }, () => 'a').join('.')])
    assert.equal(pull({ v: { path } }), 'PATH_INVALID', `${JSON.stringify(path)} is not a path`);
  assert.equal(pull({ v: { path: ['a.b', 'c.d'] } }), null, 'a pair of paths is a path');
  assert.equal(pull({ v: { path: ['a.b', 'c d'] } }), 'PATH_INVALID');

  /* AND THE SAME GRAMMAR EVERYWHERE IT IS ONE (25 §3.1, 47 §4.3). */
  const fetch = (f: unknown) => refusedWith(ingest({ channel: 'pull', every: '1h', match: undefined, extract: undefined, fetch: f }));
  assert.equal(fetch({ read: { rows: 'data.rows' } }), null);
  assert.equal(fetch({ read: { rows: 'data rows' } }), 'PATH_INVALID');
  assert.equal(fetch({ expect: [{ path: 'a.b', present: true }] }), null);
  assert.equal(fetch({ expect: [{ path: 'a b', present: true }] }), 'PATH_INVALID');
  assert.equal(fetch({ page: { from: 'meta.next' } }), null);
  assert.equal(fetch({ page: { from: 'meta next' } }), 'PATH_INVALID');
  assert.equal(fetch({ probe: { read: { who: 'user.id' } } }), null);
  assert.equal(fetch({ probe: { read: { who: 'user id' } } }), 'PATH_INVALID');
});

test('and an ingest arrives by one of the five channels, and a pull is still held to its floor', () => {
  for (const channel of ['email', 'webhook', 'paste', 'api'])
    assert.equal(refusedWith(ingest({ channel })), null, `${channel} is a channel`);
  assert.equal(refusedWith(ingest({ channel: 'sms' })), 'DECLARATION_INVALID');
  /* THE ONE CHECK THIS KIND ALREADY HAD, kept: `25 §9`'s floor, refused where it is written. */
  assert.equal(refusedWith(ingest({ channel: 'pull', every: '1m', match: undefined, extract: undefined })), 'DECLARATION_INVALID');
  assert.equal(refusedWith(ingest({ channel: 'pull', every: '1h', match: undefined, extract: undefined })), null);
});

/* ── the rule checks 04 §5 names and nothing emitted ─────────────────────── */

/** A rule that satisfies `07 §6`, with one key overridden per case. */
const rule = (over: Record<string, unknown> = {}): Declaration => ({
  id: 'rule.expand_size_run',
  kind: 'rule',
  body: {
    rule: 'expand_size_run',
    register: 'runs',
    when: { field: 'state', is: 'open' },
    once_per: ['entry'],
    then: [{ create: { register: 'skus', each: ['sizes', 'colours'], bound: 500, fields: { code: '{{each.0}}' } } }],
    ...over,
  } as never,
});

/** The register a `create` crosses, whose enums are the only place the cardinality is written down. */
const RUNS: Declaration = {
  id: 'register.runs',
  kind: 'register',
  body: {
    id: 'runs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text' },
      { id: 'sizes', type: 'enum', values: ['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl', '4xl'] },
      { id: 'colours', type: 'enum', values: Array.from({ length: 12 }, (_, i) => `c${i}`) },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

test('A GENERATOR WITH NO CEILING FILLS THE RECORD, and `bound:` is what buys the whole row', () => {
  /**
   * `04 §7` is an enumeration, and the row it spends is *"declare a BOUNDED `create` rule, whose
   * ceiling is shown as SPAWNS in the diff"*. A `create` with no `bound:` is that row with its
   * condition deleted — and the diff, which is the entire trust model, cannot print `SPAWNS` for it.
   */
  const said = validateDeclaration(rule({ then: [{ create: { register: 'skus', fields: { code: 'x' } } }] }));
  assert.equal(said?.code, 'CREATE_UNBOUNDED');
  assert.equal(said?.at, 'bound');
  assert.match(said?.fix ?? '', /fills the record/);
  assert.equal(refusedWith(rule()), null, 'a bounded create was refused');
});

test('AND A BOUND ITS OWN AXES CAN EXCEED IS WRONG TODAY, not at the thousandth row', () => {
  /* `04 §5`'s worked example, and the cardinality is in the OTHER document: an `enum`'s `values` is a
     fact written down, so the product is knowable at install. That is why this check needs the batch
     — a pack declares its register and its rule in one file. */
  const known = new Map([[RUNS.id, RUNS.body]]);
  const said = validateDeclaration(
    rule({ then: [{ create: { register: 'skus', each: ['sizes', 'colours'], bound: 60, fields: { code: 'x' } } }] }),
    known,
  );
  assert.equal(said?.code, 'CREATE_OVER_BOUND');
  assert.match(said?.fix ?? '', /sizes \(8\) × colours \(12\) = 96 exceeds bound 60/);

  /* AND IT DOES NOT REFUSE A BOUND THAT HOLDS. */
  assert.equal(inRecord(rule(), RUNS), null, '96 rows under a bound of 500 was refused');

  /* A `list` HAS NO DECLARED LENGTH, so the product is unknowable and the check does not apply.
     Multiplying by nothing for it would turn the check off for `enum × list`, where half is
     knowable — and treating an unknown as zero would pass every bound there is. */
  assert.equal(
    validateDeclaration(rule({ then: [{ create: { register: 'skus', each: ['sizes', 'tags'], bound: 2, fields: { code: 'x' } } }] }), known),
    null,
    'a list axis was measured rather than left unknown',
  );

  /* AND WITHOUT THE OTHER DOCUMENT IT SAYS NOTHING, rather than guessing. */
  assert.equal(refusedWith(rule({ then: [{ create: { register: 'skus', each: ['sizes', 'colours'], bound: 1, fields: { code: 'x' } } }] })), null);
});

test('A `starts` PATTERN IS MEASURED AS THE `LIKE` PATTERN IT BECOMES, not as the literal', () => {
  /**
   * `where`'s compiler already caps a `starts`/`ends` literal at forty bytes and calls it
   * `CONTAINS_TOO_LONG` — and the string that reaches SQLite is not the literal. `starts` compiles to
   * `LIKE`, and every `\`, `%` and `_` is escaped on the way in, so twenty-one per-cent signs are a
   * forty-two-byte pattern. Its own comment says why that matters: *"one platform caps a LIKE
   * pattern at fifty bytes and the other at fifty thousand"* — the parity failure that package
   * exists to make impossible, measured on the wrong string.
   */
  const said = validateDeclaration(rule({ when: { field: 'ref', starts: '%'.repeat(21) } }));
  assert.equal(said?.code, 'PATTERN_OVER_CAP');
  assert.equal(said?.at, 'when');
  assert.match(said?.fix ?? '', /42 bytes. The cap is 40. Use 'matches'/);

  /* The same twenty-one characters that need no escaping are twenty-one bytes and install. */
  assert.equal(refusedWith(rule({ when: { field: 'ref', starts: 'a'.repeat(21) } })), null);
  assert.equal(refusedWith(rule({ when: { field: 'ref', starts: 'a'.repeat(40) } })), null, 'forty is the cap, not one under it');
  assert.equal(refusedWith(rule({ when: { field: 'ref', ends: 'a'.repeat(41) } })), 'PATTERN_OVER_CAP');
  /* AND IT WALKS THE GROUPS, because a pattern is never at the top of a real predicate. */
  assert.equal(
    refusedWith(rule({ when: { all: [{ field: 'state', is: 'open' }, { any: [{ field: 'ref', starts: '_'.repeat(21) }] }] } })),
    'PATTERN_OVER_CAP',
  );
  /* A `contains` KEEPS ITS OWN CODE AND ITS OWN CEILING: it compiles to `instr`, which has no
     pattern, so it has no platform limit and needs no escape. */
  assert.equal(refusedWith(rule({ when: { field: 'ref', contains: '%'.repeat(21) } })), null);
});

/* ── a key nothing reads ─────────────────────────────────────────────────── */

/**
 * `02 §6.1`'s OWN WORKED REGISTER, WHICH USED TO INSTALL AND LOCK NOTHING.
 *
 * The section is a whole page about the closed-period lock and does not hedge: *"A row matching the
 * predicate refuses EVERY write: field edit, state move, rule `set`, agent `update`, and `create`
 * into it … it is not a delete guard, `deleted_at` is a write, so a locked row cannot be deleted
 * either, which is the point."* Run against this build before the check below existed, the
 * declaration installed, and then a `posted` row was edited AND deleted, both accepted:
 *
 *     install ok?                    true
 *     draft -> posted, `date` unset  ACCEPTED, state=posted
 *     edit a POSTED row              ACCEPTED, narrative="Rewritten after posting"
 *     delete a POSTED row            ACCEPTED, deleted_at=2026-09-05T12:00:00.000Z
 *
 * The severity was never the missing feature. `REPORT.md` puts the kernel at about a third. It is
 * that a bookkeeping pack ships a lock in its register body, the install diff shows the register,
 * and the lock is decoration until an auditor asks.
 */
const POSTINGS: Declaration = {
  id: 'register.postings',
  kind: 'register',
  body: {
    id: 'postings',
    name: 'Postings',
    title: 'narrative',
    state: 'state',
    immutable_when: { any: [{ field: 'state', is: 'posted' }] },
    fields: [
      { id: 'narrative', type: 'text', required: true },
      { id: 'date', type: 'day' },
      {
        id: 'state',
        type: 'enum',
        values: ['draft', 'posted', 'void'],
        transitions: { draft: { to: ['posted', 'void'], requires: ['date', 'narrative'] }, posted: { to: ['void'] }, void: { to: [] } },
      },
    ],
  } as never,
};

test('`02 §6.1`’s OWN LEDGER IS REFUSED AT INSTALL, rather than installed with its lock as decoration', async () => {
  const { k, sql } = await record();

  const said = refusal(await k.install([POSTINGS]));
  assert.equal(said.code, 'NOT_IN_THIS_BUILD');
  assert.equal(said.at, 'immutable_when');
  assert.match(said.fix, /reads nowhere/);
  assert.match(said.fix, /a deploy, not an edit/);

  /* AND THE REGISTER IS NOT THERE. A refusal that still installed would be worse than silence: the
     pack author would read the refusal, the record would hold the register, and the two would
     disagree about whether the ledger exists. */
  assert.equal(k.register('postings'), undefined, 'a refused declaration installed anyway');
  assert.equal(refusal(k.create('postings', { narrative: 'Opening', state: 'draft' }, { actor: 'p_1' })).code, 'REGISTER_UNKNOWN');

  /* THE SECOND HALF OF THE SAME DECLARATION, once the lock is off: `draft -> posted` carries
     `requires: [date, narrative]`, and `index.ts` destructures `{ to: string[] }` and reads nothing
     else. Reproduced before the check existed as `draft -> posted with date empty -> ACCEPTED`. */
  const { immutable_when: _lock, ...rest } = POSTINGS.body as Record<string, unknown>;
  const half = refusal(await k.install([{ ...POSTINGS, body: rest as never }]));
  assert.equal(half.code, 'NOT_IN_THIS_BUILD');
  assert.equal(half.at, 'state.transitions.draft');
  assert.match(half.fix, /requires/);

  sql.close();
});

test('AND EVERY OTHER PUBLISHED REGISTER KEY THIS BUILD READS NOWHERE IS NAMED, one at a time', () => {
  /* Each of these was reproduced as ACCEPTED against `validate` before the closed list existed, and
     each is a rule rather than a decoration: an upsert key that duplicates yesterday, a delete
     guard that deletes, a self-join nothing runs, a predicate name no `where:` can reach, and a
     spoken prefix every id ignores. */
  const cases: [string, Record<string, unknown>][] = [
    ['seq_prefix', { seq_prefix: 'OB' }],
    ['key', { series: true, key: ['what'] }],
    ['delete', { delete: 'refuse_while_referenced' }],
    ['pairs', { pairs: { on: ['what'], opposite: 'what', across: 'what', within: '4d', mark: 'moved' } }],
    ['predicates', { predicates: { overdue: { field: 'what', is: 'x' } } }],
    ['immutable_when', { immutable_when: { any: [] } }],
  ];
  for (const [key, extra] of cases) {
    const said = validateDeclaration(withFields([{ id: 'what', type: 'text' }], { ...NO_STATE, ...extra }));
    assert.equal(said?.code, 'NOT_IN_THIS_BUILD', `${key} installed in silence`);
    assert.equal(said?.at, key);
    assert.ok(said?.allowed?.includes('fields'), `${key}'s refusal does not say what a register body takes`);
  }

  /* AND THE FIELD'S OWN SIX. `derive:` is the one `02 §5` calls the important option of the four,
     and with nothing reading it a field declaring a derivation is an ordinary writable field
     holding whatever a caller sent, so `unique: true` + `derive: { normalise }`, which `32 §4.4`
     uses as the duplicate-detection fixture, dedupes on the raw text or on nothing. */
  const onAField: [string, Record<string, unknown>][] = [
    ['derive', { derive: { normalise: 'what' } }],
    ['required_when', { required_when: { field: 'what', present: true } }],
    ['min', { min: 1 }],
    ['max', { max: 4 }],
    ['note', { note: 'a comment for the next reader' }],
    ['register', { register: 'people' }],
  ];
  for (const [key, extra] of onAField) {
    const said = validateDeclaration(withFields([{ id: 'what', type: 'text', ...extra }], NO_STATE));
    assert.equal(said?.code, 'NOT_IN_THIS_BUILD', `${key} installed in silence on a field`);
    assert.equal(said?.at, 'what');
    assert.ok(said?.allowed?.includes('type'), `${key}'s refusal does not say what a field takes`);
  }
});

test('AND `by:` IS THE ONE DOOR INTO THE LEVEL LADDER A DECLARATION CAN OPEN', () => {
  /**
   * `02 §5`'s last addition: `proposed: { to: [active], by: decide }`, and the comment on the line
   * is *"a PERSON at the `decide` level. No token grants it."* Read by nothing. `record.update`
   * gates on `guard(ctx, 'write', register)`, which a bearer token at scope `write` passes, so an agent
   * performs the one move the declaration reserved for a person and no event tells them apart.
   * `HUMAN_ONLY` is in the registry and produced by no product code.
   *
   * This is why it is refused rather than ignored: the other unread keys cost an invariant, and
   * this one costs an authorisation.
   */
  const move = (body: Record<string, unknown>) =>
    validateDeclaration(
      withFields(
        [{ id: 'what', type: 'text' }, { id: 'state', type: 'enum', values: ['proposed', 'active'], transitions: { proposed: body } }],
        { state: 'state' },
      ),
    );

  const said = move({ to: ['active'], by: 'decide' });
  assert.equal(said?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(said?.at, 'state.transitions.proposed');
  assert.match(said?.fix ?? '', /by/);

  /* `to:` ON ITS OWN IS ENFORCED AND INSTALLS, which is what makes this one key of a two-key
     structure rather than an unbuilt feature. */
  assert.equal(move({ to: ['active'] }), null, 'the half that IS enforced was refused with the half that is not');
});

test('A KEY NO DOCUMENT PUBLISHES IS `DECLARATION_INVALID`, because there the repair IS an edit', () => {
  /* The two codes answer two different questions. `NOT_IN_THIS_BUILD` says the declaration is right
     and the build is behind. `30 §6` files it beside `SCHEMA_NEWER` for that reason, and telling
     an author `immutable_when` is malformed sends them to check a spelling that is right. A key no
     document publishes has no such defence. */
  const invented = validateDeclaration(withFields([{ id: 'what', type: 'text' }], { ...NO_STATE, retry_after: '5m' }));
  assert.equal(invented?.code, 'DECLARATION_INVALID');
  assert.equal(invented?.at, 'retry_after');
  assert.match(invented?.fix ?? '', /no such key/);

  const onAField = validateDeclaration(withFields([{ id: 'what', type: 'text', nullable: true }], NO_STATE));
  assert.equal(onAField?.code, 'DECLARATION_INVALID');
  assert.match(onAField?.fix ?? '', /obligations\.what declares nullable/);

  /* AND A MISSPELT `fields` SAYS SO. It used to answer *"declares no fields, so it can hold
     nothing"*, which is true and is about the wrong thing. The list of what a register body takes
     is now in `allowed`, where a person and an agent can both read it. */
  const typo = validateDeclaration({
    ...OBLIGATIONS,
    body: { id: 'obligations', name: 'Obligations', title: 'what', feilds: [{ id: 'what', type: 'text' }] } as never,
  });
  assert.equal(typo?.code, 'DECLARATION_INVALID');
  assert.equal(typo?.at, 'feilds');
  assert.ok(typo?.allowed?.includes('fields'));
});

test('A RESERVED FIELD ID IS REFUSED AT INSTALL, and `title` is the one an author reaches for first', async () => {
  /**
   * `34 §4` reserves nine and `02 §2` repeats them; the write path has enforced the list since it
   * was written and `validate` enforced none of it. So the two halves disagreed and the register
   * between them installed and could then hold nothing. Reproduced end to end:
   *
   *     register notes { title (text, required), seq (int), body (text) }
   *     install ok?                 true
   *     create with title    -> FIELD_UNKNOWN: title is the record's, not a field you may write.
   *     create without title -> REQUIRED_MISSING: notes needs title.
   *
   * `title` is not a contrived example. It is the likeliest name an author ever gives a field, and
   * `02 §5`'s own worked register only avoids it by calling the field `what`.
   */
  const { k, sql } = await record();
  const notes: Declaration = {
    id: 'register.notes',
    kind: 'register',
    body: {
      id: 'notes',
      name: 'Notes',
      title: 'title',
      fields: [{ id: 'title', type: 'text', required: true }, { id: 'body', type: 'text' }],
    } as never,
  };

  const said = refusal(await k.install([notes]));
  assert.equal(said.code, 'FIELD_UNKNOWN');
  assert.equal(said.at, 'title');
  assert.match(said.fix, /the record's own/);
  assert.equal(k.register('notes'), undefined, 'a register that can hold no row was installed anyway');

  /* ALL NINE OF `34 §4`'s, and the same code at both moments. */
  for (const id of ['id', 'seq', 'register', 'created_at', 'updated_at', 'deleted_at', 'version', 'spoken', 'title'])
    assert.equal(
      refusedWith(withFields([{ id: 'what', type: 'text' }, { id, type: 'text' }], NO_STATE)),
      'FIELD_UNKNOWN',
      `${id} is reserved and installed anyway`,
    );

  /* AND THE UNDERSCORE KEEPS ITS OWN SENTENCE, which is a different fact about a different list. */
  const underscored = validateDeclaration(withFields([{ id: 'what', type: 'text' }, { id: '_rule', type: 'text' }], NO_STATE));
  assert.equal(underscored?.code, 'DECLARATION_INVALID');
  assert.match(underscored?.fix ?? '', /keeps for itself/);

  sql.close();
});

test('AND `state` IS RESERVED WHETHER OR NOT THE BODY POINTS AT IT', () => {
  /* `34 §4`: reserved *"unless it is an `enum`"*. The check used to sit behind `body.state` naming
     the field, so `{ id: state, type: text }` with no `state:` key installed as an ordinary field
     called `state`, and `entry.state`, the column it is named after and the one the index is on,
     stayed NULL on every row of that register for ever. */
  const said = validateDeclaration(withFields([{ id: 'what', type: 'text' }, { id: 'state', type: 'text' }], NO_STATE));
  assert.equal(said?.code, 'STATE_NOT_ENUM');
  assert.deepEqual(said?.allowed, ['enum']);
  assert.equal(
    refusedWith(withFields([{ id: 'what', type: 'text' }, { id: 'state', type: 'enum', values: ['open'] }], NO_STATE)),
    null,
    'the enum a register is allowed to call `state` was refused',
  );
});

test('THE CLOSED LISTS ARE `42 §4.4`’s OWN, and this is the test that stops them going stale', () => {
  /**
   * A HAND-TYPED LIST OF KEYS GOES STALE THE DAY THE DOCUMENTS ADD ONE, which is the failure the
   * closed list exists to fix, made again by the fix. So the document is the source and this is the
   * tripwire: `42 §4.4` publishes two tables, one for a register body and one for a field, and
   * every key in either of them must be in one of `declare.ts`'s two lists: read, or named as
   * published-and-unread. A tenth key appearing in the corpus is red here on the day it lands
   * rather than accepted in silence for a year.
   *
   * IT RUNS BOTH WAYS. A key on the unbuilt list that is in neither table would be a code inventing
   * a refusal for something nobody published; and a key the code admits and the document does not
   * publish has to be named below with a reason, so a new one cannot be slipped in beside them.
   */
  const doc = readFileSync(fileURLToPath(new URL('../../../docs/42-SPEC-DECLARE.md', import.meta.url)), 'utf8');
  const section = doc.slice(doc.indexOf('### 4.4 ·'), doc.indexOf('### 4.5 ·'));
  assert.ok(section.length > 1000, '42 §4.4 is not where this test looks for it');

  const [onRegister, onField] = section.split('**On a field**');
  assert.ok(onField, '42 §4.4 no longer has an `On a field` half, and this test reads its tables by that heading');

  /** The Key column, and a row may name two (`min` / `max`). */
  const published = (table: string): string[] =>
    [...table.matchAll(/^\|\s*`([^|]*?)`\s*\|/gmu)].flatMap((m) => [...(m[1] ?? '').matchAll(/[a-z_]+/gu)].map((k) => k[0]));

  const REG = published(onRegister ?? '');
  const FLD = published(onField);
  assert.ok(REG.includes('immutable_when') && REG.includes('fields'), `42 §4.4's register table did not parse: ${REG.join(' ')}`);
  assert.ok(FLD.includes('derive') && FLD.includes('type'), `42 §4.4's field table did not parse: ${FLD.join(' ')}`);

  const { register, registerUnbuilt, field, fieldUnbuilt, transition, transitionUnbuilt } = REGISTER_BODY_KEYS;
  const homed = (keys: readonly string[], read: readonly string[], unbuilt: readonly string[], what: string) => {
    for (const key of keys)
      assert.ok(
        read.includes(key) || unbuilt.includes(key),
        `42 §4.4 publishes ${what} \`${key}\` and declare.ts neither reads it nor names it as unread`,
      );
    for (const key of unbuilt)
      assert.ok(keys.includes(key), `declare.ts refuses ${what} \`${key}\` as published-and-unread, and 42 §4.4 does not publish it`);
  };
  homed(REG, register, registerUnbuilt, 'a register key');
  homed(FLD, field, fieldUnbuilt, 'a field key');

  /* The transition's three, which live inside the `transitions` row rather than in a table. */
  const inside = /`\{ <value>: \{([^}]*)\}/u.exec(onField)?.[1] ?? '';
  const inner = [...inside.matchAll(/([a-z_]+)\??:/gu)].map((m) => m[1] as string);
  assert.deepEqual(inner, ['to', 'requires', 'by'], `42 §4.4's transitions row did not parse: ${inside}`);
  homed(inner, transition, transitionUnbuilt, 'a transition key');

  /**
   * AND WHAT THE CODE ADMITS THAT THE DOCUMENT DOES NOT PUBLISH, written down rather than left to
   * be found. Each is a real divergence between `42 §4.4` and this build, and every one of them is
   * read by something, and refusing any would break the record the product ships with:
   *
   *   `id` · `to`        the code's spellings of `register:` on a body and on a `ref`.
   *   `state` · `done`   which field is mirrored, and which of its values mean finished.
   *   `icon` · `holds` · `label` · `deadline` · `qualifies` · `unit`  drawn by `apps/web`.
   *   `search`           on a FIELD, which is what `fts.ts` actually reads.
   *   `derived`          the kernel's own flag, which refuses a write and skips validation.
   */
  const undocumented = (mine: readonly string[], theirs: readonly string[]) => mine.filter((k) => !theirs.includes(k)).sort();
  assert.deepEqual(undocumented(register, REG), ['done', 'holds', 'icon', 'id', 'state']);
  assert.deepEqual(undocumented(field, FLD), ['deadline', 'derived', 'label', 'qualifies', 'search', 'to', 'unit']);
});
