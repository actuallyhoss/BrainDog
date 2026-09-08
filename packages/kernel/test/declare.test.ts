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
