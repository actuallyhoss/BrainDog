/**
 * Search, and the two things that make one usable.
 *
 * The first is that a register says which of its fields are worth searching. An index over
 * everything answers every query with everything, and a search whose results a person stops reading
 * is a search they stop using.
 *
 * The second is that the index is in step with the row at the moment the row lands, because the
 * window in which it is not is exactly when somebody is looking for the thing they just wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ftsQuery, openRecord, projectedText, type Declaration, type Kernel } from '../src/index.ts';
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
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
      { id: 'note', type: 'text' },
      { id: 'tags', type: 'list', of: 'text', search: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: { id: 'points', name: 'Points', title: 'at', series: true, fields: [{ id: 'at', type: 'text', search: true }] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, POINTS])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const found = (k: Kernel, q: string, registers?: string[]) =>
  k.search(q, registers ? { registers } : {}).map((h) => k.get(h.id)?.fields.what);

/* ── the projection ──────────────────────────────────────────────────────── */

test('ONLY THE FIELDS A REGISTER SAYS ARE WORTH SEARCHING', () => {
  // An index over everything answers every query with everything.
  const fields = (OBLIGATIONS.body as never as { fields: { id: string; type: string; search?: boolean }[] }).fields;
  const text = projectedText(fields, { what: 'Invoice 41', party: 'Halden', note: 'a private aside', tags: ['urgent', 'design'] });
  assert.equal(text, 'Invoice 41\nHalden\nurgent design');
  assert.ok(!text.includes('private'), 'a field nobody asked to search was indexed');
});

test('whitespace is collapsed and an empty value leaves no blank line', () => {
  // A blank line in the projection is a token boundary that means nothing.
  const fields = [{ id: 'a', type: 'text', search: true }, { id: 'b', type: 'text', search: true }];
  assert.equal(projectedText(fields, { a: 'two   words\nover lines', b: '' }), 'two words over lines');
  assert.equal(projectedText(fields, {}), '');
});

/* ── the query ───────────────────────────────────────────────────────────── */

test('A PERSON’S WORDS ARE NOT FTS5 SYNTAX, and passing them through raw is an empty result', () => {
  // A typed `"` is a syntax error and a typed `-` is an exclusion nobody asked for — from a query
  // that looked perfectly fine.
  assert.equal(ftsQuery('invoice hal'), '"invoice"* AND "hal"*');
  assert.equal(ftsQuery('"quoted" -minus NEAR(a b)'), '"quoted"* AND "minus"* AND "near"* AND "a"* AND "b"*');
  assert.equal(ftsQuery('   '), null);
  assert.equal(ftsQuery('!!!'), null);
});

/* ── it finds things ─────────────────────────────────────────────────────── */

test('a row is findable the moment it is written, by any of its searchable fields', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41 — brand system', party: 'Halden', tags: ['urgent'] }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Retainer, August', party: 'Pell & Vine' }, { actor: 'p_1' }));

  assert.deepEqual(found(k, 'invoice'), ['Invoice 41 — brand system']);
  assert.deepEqual(found(k, 'halden'), ['Invoice 41 — brand system'], 'a searchable field other than the title');
  assert.deepEqual(found(k, 'urgent'), ['Invoice 41 — brand system'], 'inside a list');
  assert.deepEqual(found(k, 'retainer'), ['Retainer, August']);
  sql.close();
});

test('every word is a prefix, because a person types the start of the word they mean', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', party: 'Halden' }, { actor: 'p_1' }));
  assert.deepEqual(found(k, 'inv'), ['Invoice 41']);
  assert.deepEqual(found(k, 'hal inv'), ['Invoice 41'], 'two prefixes are ANDed');
  assert.deepEqual(found(k, 'hal nope'), [], 'and one that matches nothing rules the row out');
  sql.close();
});

test('THE INDEX IS IN STEP WITH THE ROW, including when a value goes away', async () => {
  // A row that stays findable by text it no longer holds is the one search result nobody can
  // explain. Delete-then-insert on every write, in the same transaction.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', party: 'Halden' }, { actor: 'p_1' }));
  assert.equal(found(k, 'halden').length, 1);

  value(k.update('obligations', 'obligations#1', { party: 'Pell & Vine' }, { actor: 'p_1' }));
  assert.equal(found(k, 'halden').length, 0, 'the old value is still findable');
  assert.equal(found(k, 'pell').length, 1);

  value(k.update('obligations', 'obligations#1', { party: null }, { actor: 'p_1' }));
  assert.equal(found(k, 'pell').length, 0, 'a cleared field is still findable');
  assert.equal(found(k, 'invoice').length, 1, 'clearing one field unindexed the row');
  sql.close();
});

test('a deleted row is not findable, and a restored one is again', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  assert.equal(k.search('invoice').length, 0);
  value(k.update('obligations', 'obligations#1', { deleted_at: null }, { actor: 'p_1' }));
  assert.equal(k.search('invoice').length, 1);
  sql.close();
});

test('a series is not searched, because nobody looks for a point by typing part of it', async () => {
  const { k, sql } = await record();
  value(k.create('points', { at: 'a measurement' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'a measurement' }, { actor: 'p_1' }));
  assert.equal(k.search('measurement').length, 1);
  assert.equal(k.search('measurement')[0]?.register, 'obligations');
  sql.close();
});

/* ── the ceiling ─────────────────────────────────────────────────────────── */

test('THE CEILING IS APPLIED IN THE QUERY, not to its results', async () => {
  // Filtering afterwards gives a caller a short page whenever the matches were mostly in a register
  // they cannot see — and they cannot tell that from there having been no matches.
  const { k, sql } = await record();
  await k.install([
    { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true, search: true }] } as never },
  ]);
  for (let n = 0; n < 10; n++) value(k.create('notes', { what: `secret note ${n}` }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'secret invoice' }, { actor: 'p_1' }));

  const scoped = k.search('secret', { registers: ['obligations'], limit: 5 });
  assert.equal(scoped.length, 1, 'the page was cut before the ceiling was applied');
  assert.equal(scoped[0]?.register, 'obligations');
  assert.equal(k.search('secret', { limit: 20 }).length, 11);

  /* AND A SCOPE OF NOTHING IS AN ANSWER OF NOTHING, WHICH USED TO BE THE WHOLE RECORD. The test was
     `opts.registers?.length`, so an empty array read as though no scope had been passed at all: a
     caller that COMPUTED the list of registers somebody may read and got none handed that person
     every row. It is one character away from the caller doing everything right, and it fails in the
     worst possible direction. */
  assert.deepEqual(k.search('secret', { registers: [], limit: 20 }), []);
  sql.close();
});

test('a rebuild produces exactly what the writes produced', async () => {
  // What an import runs at the end, and the assertion that makes it trustworthy.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', party: 'Halden' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Retainer', party: 'Pell' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Gone', party: 'Nobody' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#3', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));

  const before = sql.all<{ rowid: number; text: string }>('SELECT rowid, text FROM entry_fts ORDER BY rowid');
  assert.equal(k.rebuildFts(), 2, 'a deleted row was rebuilt into the index');
  const after = sql.all<{ rowid: number; text: string }>('SELECT rowid, text FROM entry_fts ORDER BY rowid');
  assert.deepEqual(after, before, 'the rebuild disagrees with what the writes wrote');
  sql.close();
});


test('A NAME PASTED OUT OF FINDER FINDS THE ROW IT NAMES', async () => {
  /**
   * `unicode61` normalises nothing, and a combining mark is a token separator — so `mañana` stored
   * precomposed and typed DECOMPOSED, which is what macOS produces, built `"man"* AND "ana"*`: two
   * tokens, no match, for a query that is character-for-character the stored value.
   *
   * AND NORMALISING ONE END IS WORSE THAN NEITHER. `ftsQuery` composed first and `projectedText` did
   * not, which fixed Latin — where `remove_diacritics 2` folds the marks anyway — and broke Hangul
   * and kana, whose jamo and voicing marks are LETTERS rather than marks and are neither folded nor
   * split. A name stored decomposed became a different token from the same name typed composed, and
   * was findable by nothing at all.
   */
  const sql = openSqlite();
  sql.exec("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='unicode61 remove_diacritics 2')");
  const fields = [{ id: 'n', type: 'text', search: true }];

  const names = ['mañana', '김민준', 'がっこう', 'Zürich'];
  for (const name of names) for (const form of ['NFC', 'NFD'] as const) sql.exec('INSERT INTO t (x) VALUES (?)', projectedText(fields, { n: name.normalize(form) }));

  for (const name of names)
    for (const typed of ['NFC', 'NFD'] as const) {
      const q = ftsQuery(name.normalize(typed));
      assert.ok(q, `${name} in ${typed} produced no query`);
      const n = sql.one<{ n: number }>('SELECT count(*) AS n FROM t WHERE t MATCH ?', q)?.n ?? 0;
      assert.equal(n, 2, `${name} typed ${typed} found ${n} of the 2 rows holding it`);
    }
  sql.close();
});

/* ── the other spelling of the same flag ─────────────────────────────────── */

test('A REGISTER-LEVEL `search:` INDEXES THE FIELDS IT NAMES, and it used to index nothing', async () => {
  /**
   * `02 §1` publishes a register-level `search: [field, field]` and `declare` validates it
   * carefully: the names must exist, and each type must be one the index can take, with its own
   * refusal for a `money` field named there. Then nothing read it. The projection asks each FIELD
   * for its own `search: true` flag, so a register declared the documented way was indexed on
   * nothing and its rows were findable by no text at all, with every check green.
   *
   * BOTH SPELLINGS, IN ONE TEST, because the claim is that they are one flag rather than that
   * either works.
   */
  const { k, sql } = await record();
  const out = await k.install([
    {
      id: 'register.memos',
      kind: 'register' as const,
      body: {
        id: 'memos',
        name: 'Memos',
        title: 'headline',
        /* Named here and NOT flagged on the field, which is the half that did nothing. */
        search: ['headline', 'body'],
        fields: [
          { id: 'headline', type: 'text', required: true },
          { id: 'body', type: 'text' },
          { id: 'secretish', type: 'text' },
        ],
      } as never,
    },
  ]);
  assert.ok(out.ok, (out as { refusal?: { fix: string } }).refusal?.fix ?? '');

  value(k.create('memos', { headline: 'Kerning pass', body: 'lowercase done', secretish: 'zarquon' }, { actor: 'p_1' }));

  assert.equal(k.search('Kerning', { limit: 5 }).length, 1, 'the title named in `search:` was indexed on nothing');
  assert.equal(k.search('lowercase', { limit: 5 }).length, 1, 'the second field named in `search:` was indexed on nothing');

  /* AND A FIELD IT DOES NOT NAME IS STILL NOT INDEXED, so the list is a list rather than a switch
     that turns the whole row on. */
  assert.equal(k.search('zarquon', { limit: 5 }).length, 0, 'a field the register did not name was indexed anyway');
  sql.close();
});
