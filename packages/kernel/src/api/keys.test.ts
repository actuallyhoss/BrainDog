/**
 * `rewrapKeys` and `wrappedKeys` (`api/keys.ts`, `loop/finish/contracts.md` §2.6): a root key rotation, walked through
 * the record the way a host walks it (`53 §5.6`).
 *
 * THE HOST'S HALF IS WRITTEN OUT HERE, OVER WEBCRYPTO, because the kernel never holds a key and a kernel test cannot
 * import a host. It wraps as both hosts do, AES-256-GCM with `record ‖ 0x1F ‖ purpose` as the additional data, and it
 * offers `openGrant` the id the record's keys are wrapped under while it holds that key, as both hosts' `offeredId`
 * does. What is proved is the record's half: the grant opens under the old id until the re-wrap, the re-wrap moves every
 * key at once and only once, and afterwards the new key alone opens everything. The hosts' own code, their key stores,
 * `offeredId` and their re-wraps, is walked over a real record in `apps/worker/test/ops-walk.test.ts` and
 * `apps/selfhost/test/ops-walk.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../index.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';
import { testSigner } from '../../test/signer.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const PURPOSES = ['record', 'connector', 'signing'] as const;
type Purpose = (typeof PURPOSES)[number];

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
type Root = { id: string; key: Key };

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A root key as a host holds it: its fingerprint, the first 18 hex of SHA-256, and the key. */
async function rootKey(): Promise<Root> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const id = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 18);
  return { id, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}

const aad = (purpose: Purpose): Uint8Array => utf8(`${ID}\u001f${purpose}`);

async function wrapUnder(root: Root, purpose: Purpose, bytes: Uint8Array) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(purpose) }, root.key, bytes));
  return { wrapped, nonce };
}

/** Opened with whichever of `held` the row names, or `null`: a host's `byId` and `unwrap` in one. */
async function openWith(held: readonly Root[], row: { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string }) {
  const root = held.find((r) => r.id === row.kek_id);
  if (!root) return null;
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.nonce, additionalData: aad(row.purpose) }, root.key, row.wrapped));
  } catch {
    return null;
  }
}

/** The id a host offers `openGrant`: the one the record is wrapped under while it holds it, else its current one. */
const offered = (held: readonly Root[], wrapping: string | null): string =>
  wrapping !== null && held.some((r) => r.id === wrapping) ? wrapping : (held[0]?.id ?? '');

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

type Held = { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string; wrapped_by?: 'kek' | 'passphrase' };

async function record(keys: Partial<Record<Purpose, Held>>) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  value(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Ada' },
      keys,
    }),
  );
  const rotations = () =>
    sql.all<{ actor: string; from_v: string; to_v: string; note: string }>(
      "SELECT actor, from_v, to_v, note FROM event WHERE kind = 'grant.rotate' AND target_kind = 'vault_key'",
    );
  return { k, sql, rotations };
}

const GRANT = {
  label: 'Kiln deploy',
  opens: 'kiln.example',
  kind: 'api_token' as const,
  ciphertext: new Uint8Array([10, 11, 12, 255]),
  nonce: new Uint8Array([20, 21, 22, 255]),
  kdf: 'hkdf-sha256',
  wrapped_by: 'kek' as const,
  bytes: 64,
  hint: 'a 64-character value',
};

test('UNDER KEY B WITH A BESIDE IT, A GRANT OPENS BEFORE THE RE-WRAP, ONE RE-WRAP MOVES EVERY KEY, AND B ALONE OPENS THEM AFTER', async () => {
  const a = await rootKey();
  const b = await rootKey();
  const inner = Object.fromEntries(PURPOSES.map((p) => [p, crypto.getRandomValues(new Uint8Array(32))])) as Record<Purpose, Uint8Array>;
  const keys: Partial<Record<Purpose, Held>> = {};
  for (const p of PURPOSES) keys[p] = { ...(await wrapUnder(a, p, inner[p])), kek_id: a.id };
  const { k, sql, rotations } = await record(keys);
  const grant = value<{ id: string }>(k.bindGrant({ ...GRANT, kek_id: a.id }, 'p_1')).id;

  /* THE ROTATION: B is current and A is kept beside it. */
  const rotated = [b, a];
  assert.equal(k.wrappingKey(), a.id);
  assert.equal(refusal(k.openGrant({ id: grant, kek_id: b.id }, 'S1')).code, 'WRONG_KEY', 'offering the current id alone opened a record still under A');
  value(k.openGrant({ id: grant, kek_id: offered(rotated, k.wrappingKey()) }, 'S1'));

  /* THE HOST'S HALF: every key under A unwrapped with the store that holds both, and wrapped under B. */
  const held = k.wrappedKeys();
  assert.deepEqual(held.map((r) => r.kek_id), [a.id, a.id, a.id]);
  const rows: { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array }[] = [];
  for (const row of held) {
    const inside = (await openWith(rotated, row)) ?? assert.fail(`${row.purpose} did not open under A`);
    rows.push({ purpose: row.purpose, ...(await wrapUnder(b, row.purpose, inside)) });
  }
  const moved = value<{ moved: string[] }>(k.rewrapKeys({ from: a.id, to: b.id, rows })).moved;
  assert.deepEqual([...moved].sort(), [...PURPOSES].sort());

  /* AFTER: every key names B and opens under B alone, to the same bytes it held before. */
  const after = k.wrappedKeys();
  assert.deepEqual(after.map((r) => r.kek_id), [b.id, b.id, b.id]);
  for (const row of after) assert.deepEqual(await openWith([b], row), inner[row.purpose], `${row.purpose} changed or did not open under B`);
  assert.equal(k.wrappingKey(), b.id);
  value(k.openGrant({ id: grant, kek_id: offered([b], k.wrappingKey()) }, 'S1'));
  assert.equal(sql.one<{ kek_id: string }>('SELECT kek_id FROM grant WHERE id = ?', grant)?.kek_id, b.id);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM vault_key WHERE rewrapped_at IS NULL')?.n, 0);

  /* ONE EVENT OF A KIND THAT EXISTS, naming both ids and signed by nobody who asked. */
  const said = rotations();
  assert.equal(said.length, 1);
  assert.equal(said[0]?.actor, 'system');
  assert.equal(said[0]?.from_v, a.id);
  assert.equal(said[0]?.to_v, b.id);

  /* A SECOND RE-WRAP RACING THE FIRST CHANGES NOTHING: every row names B now, so no compare holds. */
  assert.deepEqual(value<{ moved: string[] }>(k.rewrapKeys({ from: a.id, to: b.id, rows })).moved, []);
  assert.equal(rotations().length, 1, 'a re-wrap that moved nothing wrote an event');
  for (const row of k.wrappedKeys()) assert.deepEqual(await openWith([b], row), inner[row.purpose]);
  sql.close();
});

test('A KEY BEHIND A PASSPHRASE IS LEFT ALONE, and is not handed out to be re-wrapped', async () => {
  const a = await rootKey();
  const b = await rootKey();
  const behind = await wrapUnder(a, 'record', crypto.getRandomValues(new Uint8Array(32)));
  const connector = await wrapUnder(a, 'connector', crypto.getRandomValues(new Uint8Array(32)));
  const { k, sql } = await record({
    record: { ...behind, kek_id: a.id, wrapped_by: 'passphrase' },
    connector: { ...connector, kek_id: a.id },
  });

  assert.deepEqual(k.wrappedKeys().map((r) => r.purpose), ['connector']);
  const fresh = { wrapped: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([4, 5, 6]) };
  const moved = value<{ moved: string[] }>(
    k.rewrapKeys({ from: a.id, to: b.id, rows: [{ purpose: 'record', ...fresh }, { purpose: 'connector', ...fresh }] }),
  ).moved;
  assert.deepEqual(moved, ['connector']);
  const kept = sql.one<{ wrapped: Uint8Array; kek_id: string; rewrapped_at: string | null }>(
    "SELECT wrapped, kek_id, rewrapped_at FROM vault_key WHERE purpose = 'record'",
  );
  assert.deepEqual(new Uint8Array(kept?.wrapped ?? []), behind.wrapped, 'the passphrase row was overwritten');
  assert.equal(kept?.kek_id, a.id);
  assert.equal(kept?.rewrapped_at, null);
  sql.close();
});

test('A RE-WRAP THAT DOES NOT SAY WHAT IT MOVES IS REFUSED, and writes nothing', async () => {
  const a = await rootKey();
  const { k, sql, rotations } = await record({ record: { ...(await wrapUnder(a, 'record', new Uint8Array(32))), kek_id: a.id } });
  const row = { purpose: 'record' as const, wrapped: new Uint8Array([1]), nonce: new Uint8Array([2]) };

  assert.equal(refusal(k.rewrapKeys({ from: '', to: 'x', rows: [row] })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.rewrapKeys({ from: a.id, to: a.id, rows: [row] })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(k.rewrapKeys({ from: a.id, to: 'x', rows: [] })).at, 'rows');
  assert.equal(refusal(k.rewrapKeys({ from: a.id, to: 'x', rows: [row, row] })).at, 'rows');
  assert.equal(refusal(k.rewrapKeys({ from: a.id, to: 'x', rows: [{ ...row, purpose: 'other' as never }] })).at, 'rows');
  assert.equal(refusal(k.rewrapKeys({ from: a.id, to: 'x', rows: [{ ...row, wrapped: new Uint8Array() }] })).at, 'rows');

  assert.equal(rotations().length, 0);
  assert.equal(k.wrappedKeys()[0]?.kek_id, a.id);
  sql.close();
});

test('A RE-WRAP THAT LEAVES A KEY BEHIND MOVES NONE OF THEM, so the record never names two root keys', async () => {
  const a = await rootKey();
  const b = await rootKey();
  const keys: Partial<Record<Purpose, Held>> = {};
  for (const p of PURPOSES) keys[p] = { ...(await wrapUnder(a, p, crypto.getRandomValues(new Uint8Array(32)))), kek_id: a.id };
  const { k, sql, rotations } = await record(keys);
  const grant = value<{ id: string }>(k.bindGrant({ ...GRANT, kek_id: a.id }, 'p_1')).id;

  /* THE HOST WHOSE `record` KEY DID NOT OPEN, sending the two that did. */
  const fresh = { wrapped: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([4, 5, 6]) };
  const out = refusal(k.rewrapKeys({ from: a.id, to: b.id, rows: [{ purpose: 'connector', ...fresh }, { purpose: 'signing', ...fresh }] }));
  assert.equal(out.code, 'VALUE_MALFORMED');
  assert.equal(out.at, 'rows');
  assert.match(out.fix, /record key behind/);

  assert.deepEqual(k.wrappedKeys().map((r) => r.kek_id), [a.id, a.id, a.id], 'a row moved on a refused re-wrap');
  assert.equal(k.wrappingKey(), a.id);
  assert.equal(sql.one<{ kek_id: string }>('SELECT kek_id FROM grant WHERE id = ?', grant)?.kek_id, a.id);
  assert.equal(rotations().length, 0);
  value(k.openGrant({ id: grant, kek_id: offered([b, a], k.wrappingKey()) }, 'S1'));
  sql.close();
});
