/**
 * A BLOB column the export wrote as `{}` is refused at import, by name, on every host.
 *
 * WHAT WENT WRONG. A Durable Object's `sql.exec(...).toArray()` hands a BLOB back as an `ArrayBuffer`, where `node:sqlite`
 * hands back a `Uint8Array`. `encode` writes `{ b64 }` only for a `Uint8Array` and passes anything else through, and
 * `JSON.stringify` writes an `ArrayBuffer` as `{}`. So every export the Worker made, the nightly copy included, carried
 * `{}` for every grant's ciphertext and every wrapped key, and was signed over those bytes and looked whole
 * (`loop/research-batch-forty-five-audit.md` §1). The adapter in `apps/worker/src/index.ts` is repaired to hand the
 * kernel a `Uint8Array`, and `apps/worker/test/kernel-in-do.test.ts` holds that on workerd.
 *
 * THIS FILE HOLDS THE OTHER HALF: A COPY WRITTEN BEFORE THE REPAIR. It exists in R2 and in whatever the owner
 * downloaded, and `decode` took `{}` as it stood. Measured in that audit, a Durable Object bound it and stored the text
 * `[object Object]` where the wrapped key was, and answered `ok`; `node:sqlite` threw "Provided value cannot be bound to
 * SQLite parameter 6", which reached the caller as `FILE_MALFORMED` with no `at` and the driver's sentence. Neither says
 * which column is empty. `decode` now refuses an object without `b64`, naming the table and the column, before any
 * driver sees it.
 *
 * THE FILE IS MADE THE WAY THE WORKER MADE IT, not edited into shape: the record is opened on a `Sql` that answers
 * `ArrayBuffer`s as the Durable Object does, so the `{}` and the signature over it are the kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Row, Sql } from '@braindog/ports';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { testSigner } from './signer.ts';

const SIGNER = testSigner();
const NOW = Date.UTC(2026, 8, 23, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const GRANT = {
  label: 'stats read',
  opens: 'stats.example.test',
  kind: 'api_token' as const,
  ciphertext: new Uint8Array([1, 2, 3]),
  nonce: new Uint8Array([9, 9]),
  kdf: 'hkdf',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_fake',
};

/** `node:sqlite` answering each BLOB as a Durable Object does, an `ArrayBuffer`, which is the Worker before the repair. */
function asDurableObject(sql: Sql): Sql {
  const row = <T>(r: T): T => {
    if (!r || typeof r !== 'object') return r;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>))
      out[k] = v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v;
    return out as T;
  };
  return {
    exec: (text: string, ...params: Param[]) => sql.exec(text, ...params),
    all: <T = Row>(text: string, ...params: Param[]) => sql.all<T>(text, ...params).map(row),
    one: <T = Row>(text: string, ...params: Param[]) => row(sql.one<T>(text, ...params)),
    transactionSync: <T>(fn: () => T) => sql.transactionSync(fn),
  };
}

async function workerExport(): Promise<string[]> {
  const k = await openRecord(asDurableObject(openSqlite()), fixedClock(NOW), { sign: SIGNER });
  const made = k.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(k.bindGrant(GRANT, 'p_1').ok);
  const out = await k.export();
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
}

test('the file the Worker wrote before the repair carries {} for a grant\'s ciphertext, which is what is being refused', async () => {
  const lines = await workerExport();
  const grant = lines.find((l) => l.includes('stats.example.test'));
  assert.ok(grant, 'the export holds no grant line');
  assert.ok(!grant.includes('"b64"'), `this Sql no longer reproduces the Worker's fault, so the case below tests nothing: ${grant}`);
  assert.match(grant, /\{\}/);
});

test('A BLOB WRITTEN AS {} IS FILE_MALFORMED AT ITS TABLE AND COLUMN, and nothing is written', async () => {
  const lines = await workerExport();
  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const out = (await target.import(lines)) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(out.ok, false, 'a file with no vault in it was imported');
  assert.equal(out.refusal?.code, 'FILE_MALFORMED');
  assert.equal(out.refusal?.at, 'grant.ciphertext', `the refusal does not say which column is empty: ${JSON.stringify(out.refusal)}`);
  assert.match(out.refusal?.fix ?? '', /grant\.ciphertext/);
  assert.doesNotMatch(out.refusal?.fix ?? '', /cannot be bound/, 'the driver\'s sentence reached the caller');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM grant')?.n, 0, 'a refused import left a grant behind');
  sql.close();
});

test('and a file written with every BLOB whole still goes in, so the refusal is about {} and not about BLOBs', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW), { sign: SIGNER });
  assert.ok(k.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  assert.ok(k.bindGrant(GRANT, 'p_1').ok);
  const lines = await k.export();
  assert.ok(lines.ok);
  assert.ok(lines.value.some((l) => l.includes('stats.example.test') && l.includes('"b64"')));
  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const out = (await target.import(lines.value)) as { ok: boolean; refusal?: unknown };
  assert.ok(out.ok, JSON.stringify(out));
  const held = sql.one<{ ciphertext: Uint8Array }>('SELECT ciphertext FROM grant');
  assert.deepEqual([...(held?.ciphertext ?? [])], [1, 2, 3]);
  sql.close();
});
