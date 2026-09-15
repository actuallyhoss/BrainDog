/**
 * Erasing a person: `02 §10`'s cascade, and the proof that nothing of them is left readable anywhere in the file.
 *
 * THE PROOF IS A SCAN OF EVERY COLUMN OF EVERY TABLE, not a list of the places the erasure knows about. A store added
 * later that copies a name is found by this test the day it lands, which is the only way a list of places stays true.
 * The search index's binary segment tables are the one exception: they hold tokens, not text, and `optimize` drops the
 * deleted ones; the index is checked by asking it instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ERASED, openRecord, type Declaration, type EraseReport, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 16, 12);

const CONTACTS: Declaration = {
  id: 'register.contacts',
  kind: 'register',
  body: {
    id: 'contacts',
    name: 'Contacts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'email', type: 'text', search: true },
      { id: 'notes', type: 'text', search: true },
    ],
  },
};

const OWNER = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const said = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return `${x.refusal?.code} at ${x.refusal?.at}`;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; mara: string; invoice: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([CONTACTS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner'), ('p_mara', 'mara@quill.test', 'Mara Quill')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner'), ('p_mara', '*', 'write'), ('p_mara', 'contacts', 'decide')");
  const mara = value<{ id: string }>(k.create('contacts', { name: 'Mara Quill', email: 'mara@quill.test', notes: 'Called Mara Quill about the lease' }, OWNER)).id;
  const invoice = value<{ id: string }>(k.create('contacts', { name: 'Invoice desk', notes: 'Pays on the first' }, OWNER)).id;
  sql.exec(
    "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state) VALUES ('raw_1', ?, 'email', ?, 'Hello, this is Mara Quill.', 'abc', 'untriaged')",
    new Date(NOW).toISOString(),
    JSON.stringify({ from: 'mara@quill.test' }),
  );
  sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('search.empty', 'mara quill', '2026-09-16', 2)");
  /* THE INDEX IS WRITTEN BY THE DRAIN, not by `create`; built here so the erasure has something to take out of it. */
  k.rebuildFts();
  assert.ok((sql.one<{ n: number }>("SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH 'quill'")?.n ?? 0) > 0, 'the fixture never indexed the person');
  return { k, sql, mara, invoice };
}

/** Every readable cell in the file that still says `needle`, as `table.column`. */
function remaining(sql: NodeSql, needle: string): string[] {
  const tables = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('entry_fts_data', 'entry_fts_idx', 'entry_fts_docsize', 'entry_fts_config')")
    .map((t) => t.name);
  const found: string[] = [];
  for (const t of tables) {
    for (const c of sql.all<{ name: string }>(`SELECT name FROM pragma_table_info('${t}')`)) {
      const n = sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${t}" WHERE lower(CAST("${c.name}" AS TEXT)) LIKE ?`, `%${needle}%`)?.n ?? 0;
      if (n > 0) found.push(`${t}.${c.name}`);
    }
  }
  return found;
}

const events = (sql: NodeSql) => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n);

test('AN ERASED PERSON IS NOWHERE IN THE FILE: every column of every table, the search index, and their access', async () => {
  const { k, sql, mara, invoice } = await record();
  assert.ok(remaining(sql, 'quill').length > 0, 'the fixture never wrote the person anywhere, so the scan below proves nothing');

  const report = value<EraseReport>(await k.erase({ subjects: ['Mara Quill'], personId: 'p_mara', basis: 'Article 17 request received 2026-09-14' }, 'p_owner'));
  assert.equal(report.subjects, 2, 'the person row did not add their email to the subjects');
  assert.ok(report.rows > 0);

  assert.deepEqual(remaining(sql, 'quill'), [], 'something of the person is still readable');
  assert.deepEqual(remaining(sql, 'mara@'), []);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH 'quill'")?.n, 0, 'search still finds them');

  /* What is removed: their access, and the row that named them is gone from every read. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM member WHERE person_id = 'p_mara'")?.n, 0, 'the person kept their access');
  assert.ok(sql.one<{ deleted_at: string | null }>('SELECT deleted_at FROM entry WHERE id = ?', mara)?.deleted_at, 'the row naming them is still live');
  assert.equal(k.count('contacts'), 1);

  /* What is tombstoned: the literal, so a reader sees that something was here and was taken out. */
  assert.equal(sql.one<{ name: string; email: string }>("SELECT name, email FROM person WHERE id = 'p_mara'")?.name, ERASED);
  assert.equal(sql.one<{ state: string; body: string }>("SELECT state, body FROM inbox_raw WHERE id = 'raw_1'")?.state, 'erased');

  /* What is kept: everybody else, still readable and still found. */
  assert.equal(k.get(invoice)?.fields.name, 'Invoice desk');
  assert.ok((sql.one<{ n: number }>("SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH 'invoice'")?.n ?? 0) > 0, 'the erasure took the rest of the index with it');

  /* And one event, naming the erasure by its basis and the person only as a hash. */
  const erase = sql.all<{ target: string; to_v: string; note: string; actor: string }>("SELECT target, to_v, note, actor FROM event WHERE kind = 'erase'");
  assert.equal(erase.length, 1, `${erase.length} erase events for one erasure`);
  assert.equal(erase[0]?.target, `erase:${report.id}`);
  assert.equal(erase[0]?.actor, 'p_owner');
  assert.match(erase[0]?.note ?? '', /^Article 17 request received 2026-09-14 · \d+ rows$/);
  assert.match(erase[0]?.to_v ?? '', /^\["[0-9a-f]{64}","[0-9a-f]{64}"\]$/);
  sql.close();
});

test('AN ERASURE THAT WOULD GO WRONG WRITES NOTHING: a short subject, a basis naming them, an owner, nobody named', async () => {
  const { k, sql } = await record();
  const before = events(sql);
  const basis = 'Article 17 request';

  assert.equal(said(await k.erase({ subjects: ['ma'], basis }, 'p_owner')), 'VALUE_MALFORMED at subjects');
  assert.equal(said(await k.erase({ subjects: ['Mara Quill'], basis: '' }, 'p_owner')), 'REQUIRED_MISSING at basis');
  assert.equal(said(await k.erase({ subjects: [], basis }, 'p_owner')), 'REQUIRED_MISSING at subjects');
  assert.equal(said(await k.erase({ subjects: ['Mara Quill'], basis: 'Mara Quill asked on the phone' }, 'p_owner')), 'VALUE_MALFORMED at basis');
  assert.equal(said(await k.erase({ subjects: ['someone'], personId: 'p_nobody', basis }, 'p_owner')), 'OUT_OF_BOUNDS at personId');
  assert.equal(said(await k.erase({ subjects: ['Olu Owner'], basis }, 'p_owner')), 'LEVEL_REQUIRED at personId', 'an owner was erased by name');
  assert.equal(said(await k.erase({ subjects: 'Mara' as never, basis }, 'p_owner')), 'VALUE_MALFORMED at subjects');

  assert.equal(events(sql), before, 'a refused erasure wrote to the log');
  assert.ok(remaining(sql, 'quill').length > 0, 'a refused erasure removed something');
  sql.close();
});
