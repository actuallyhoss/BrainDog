/**
 * An erasure, as the Cloud's nightly copy carries it: the next sealed copy of the
 * record holds nothing of the person, and neither does the search index.
 *
 * THE COPY IS THE WORKER'S OWN: `dumpOf` and `r2Snapshots` with a recipient, sealed as the night seals it and opened
 * by a reader that shares none of the sealer's code (`age-open.ts`). A cell the erasure missed is a cell a restore
 * brings back, so the proof is read out of the file a restore would read.
 *
 * AND THE LAST SIX STORES ARE SEEDED WITH THE PERSON, each where a person's words land in it: an invitation's address,
 * a saved view's name, search and filter, a rule run's variables and words and a step's answer, a token's label, an
 * uninstalled pack's kept settings, and another member's grant narrowed by a rule that names them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ERASED, openRecord, type Declaration, type EraseReport, type Kernel } from '@braindog/kernel';

import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';
import { dumpOf, r2Snapshots, type Blobs } from '../src/snapshots.ts';
import { ageOpen, identity } from './age-open.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const NOW = Date.UTC(2026, 8, 28, 3, 17);
const AT = new Date(NOW).toISOString();
const OWNER = { actor: 'p_owner' };

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

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A bucket over a Map, keeping the bytes, because a sealed copy is not text and decoding it would change it. */
function bucket(): Blobs & { held: Map<string, Uint8Array> } {
  const held = new Map<string, Uint8Array>();
  return {
    held,
    put(key, body) {
      held.set(key, typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body));
      return Promise.resolve(null);
    },
    get(key) {
      const bytes = held.get(key);
      return Promise.resolve(bytes ? { size: bytes.length, text: () => Promise.resolve(new TextDecoder().decode(bytes)) } : null);
    },
    list(options) {
      const prefix = options?.prefix ?? '';
      const objects = [...held.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, size: bytes.length }));
      return Promise.resolve({ objects, truncated: false as const });
    },
    delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) held.delete(key);
      return Promise.resolve();
    },
  };
}

/** The record's copy as the night writes it, sealed, then opened again: the text a restore would read. */
async function sealedCopy(k: Kernel): Promise<string> {
  const id = identity();
  const blobs = bucket();
  const kept = await r2Snapshots(blobs, { recipient: id.recipient }).take(REC, await dumpOf({ kernel: k }, AT));
  const stored = blobs.held.get(kept.key) ?? assert.fail('the copy was not written');
  return ageOpen(stored, id).toString('utf8').toLowerCase();
}

/** A record with the person in an entry, the search index, and each of the six stores the erasure reaches. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([CONTACTS]));
  sql.exec(
    "INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner'), ('p_mara', 'mara@quill.test', 'Mara Quill'), ('p_bo', 'bo@studio.test', 'Bo Book')",
  );
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner'), ('p_mara', '*', 'write')");
  /* ANOTHER MEMBER'S GRANT, NARROWED TO THE ROWS THAT NAME HER (migration 19). */
  sql.exec("INSERT INTO member (person_id, register, level, row_where) VALUES ('p_bo', 'contacts', 'read', ?)", JSON.stringify({ field: 'name', is: 'Mara Quill' }));
  value(k.create('contacts', { name: 'Mara Quill', email: 'mara@quill.test', notes: 'Called Mara Quill about the lease' }, OWNER));
  value(k.create('contacts', { name: 'Invoice desk', notes: 'Pays on the first' }, OWNER));

  sql.exec(
    "INSERT INTO invitation (id, hash, email, level, invited_by, created_at, expires_at) VALUES ('i_1', 'h_1', 'Mara@Quill.test', 'write', 'p_owner', ?, ?)",
    AT,
    AT,
  );
  sql.exec(
    "INSERT INTO view (register, id, name, filter, search, created_by, created_at, updated_at) VALUES ('contacts', 'mara', 'Mara Quill leads', ?, 'mara quill', 'p_owner', ?, ?)",
    JSON.stringify({ field: 'name', is: 'Mara Quill' }),
    AT,
    AT,
  );
  sql.exec(
    "INSERT INTO automation_run (id, rule, version, trigger, state, step, vars, actor, started_at, say) VALUES ('run_1', 'greet', 1, '{}', 'waiting', 1, ?, 'p_owner', ?, 'Asked Mara Quill for the rate')",
    JSON.stringify({ who: 'Mara Quill', rate: 48 }),
    AT,
  );
  sql.exec("INSERT INTO automation_step (run, n, kind, state, answer, at) VALUES ('run_1', 0, 'ask_person', 'done', 'Mara Quill says 48', ?)", AT);
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_1', 'p_owner', 'h_t', 'read', 'Mara Quill laptop', ?)", AT);
  sql.exec("INSERT INTO pack_removed (pack, version, removed_at, settings) VALUES ('crm', '1.0.0', ?, ?)", AT, JSON.stringify({ contact: 'mara@quill.test', days: 30 }));

  /* THE INDEX IS WRITTEN BY THE DRAIN, not by `create`; built here so the erasure has something to take out of it. */
  k.rebuildFts();
  assert.ok((sql.one<{ n: number }>("SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH 'quill'")?.n ?? 0) > 0, 'the fixture never indexed the person');
  return { k, sql };
}

test('AFTER AN ERASURE THE NEXT SEALED COPY HOLDS NOTHING OF THE PERSON, THE SEARCH INDEX INCLUDED', async () => {
  const { k, sql } = await record();
  assert.match(await sealedCopy(k), /quill/u, 'the copy never carried the person, so the check below proves nothing');

  const report = value<EraseReport>(await k.erase({ subjects: ['Mara Quill'], personId: 'p_mara', basis: 'Article 17 request received 2026-09-27' }, 'p_owner'));

  /* EACH OF THE SIX, AND THE GRANT'S RULE, COUNTED IN THE REPORT. */
  for (const store of ['invitation', 'view', 'automation_run', 'automation_step', 'token', 'pack_removed'])
    assert.ok((report.counts[store] ?? 0) >= 1, `${store} was not counted, so the erasure never touched it`);

  const copy = await sealedCopy(k);
  assert.doesNotMatch(copy, /quill/u, 'the sealed copy still names the person');
  assert.doesNotMatch(copy, /mara@/u, 'the sealed copy still holds their address');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry_fts WHERE entry_fts MATCH 'quill'")?.n, 0, 'search still finds them');

  /* A COLUMN A READER PARSES STAYS JSON, so a waiting run and a reinstall still read theirs. */
  const vars = JSON.parse(sql.one<{ vars: string }>("SELECT vars FROM automation_run WHERE id = 'run_1'")?.vars ?? 'null') as Record<string, unknown>;
  assert.deepEqual(vars, { who: ERASED, rate: 48 });
  const settings = JSON.parse(sql.one<{ settings: string }>("SELECT settings FROM pack_removed WHERE pack = 'crm'")?.settings ?? 'null') as Record<string, unknown>;
  assert.deepEqual(settings, { contact: ERASED, days: 30 });

  /* AND THE GRANT'S RULE GOES WHOLE, which reaches no row, rather than matching the rows just tombstoned. */
  assert.equal(sql.one<{ row_where: string }>("SELECT row_where FROM member WHERE person_id = 'p_bo'")?.row_where, ERASED);
  sql.close();
});
