/**
 * The key that signs a digest's webhook, opened on the strength of the lease on that one post (the delivery half).
 *
 * MEASURED AT afb3b1b2, BEFORE THIS FILE: `digest.ts` queues `notify.webhook { url, body, grant: 'collector' }`, and the
 * one door a host could open that grant through under the job's lease refused the job outright. `sealedGrant` read
 * `SELECT ... FROM outbox WHERE id = ? AND kind = 'pull.fetch'`, so a leased `notify.webhook` answered OUT_OF_BOUNDS,
 * "There is no connector job ob_1.", and the Worker posted the body unsigned because nothing could have signed it.
 *
 * THE DIGEST NAMES ITS KEY BY LABEL, NOT BY ID. `09 §6` calls `webhook.grant` "the keychain label of the secret that signs
 * the POST", and `digest.ts` copies it onto the payload as written. So the door resolves the label the way `keyNamed`
 * resolves a call's: by label or id, never a revoked grant, newest first and the tie on the id. A connector's
 * `pull.fetch` still names a grant id and is resolved by id alone, as before.
 *
 * AND A DIGEST'S KEY IS SEALED UNDER THE RECORD KEY. A digest is `paged: false` in `digestEgress`, so an approval takes
 * a key a person deposited at the keychain door, which is sealed `record`. Refusing that here, as a connector's door must,
 * would be an approved digest that dead-letters at its first post. So the door hands back the data key the grant was
 * sealed under and says which one, and the host unwraps that one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { grantChosen, keyNamed } from '../src/actions.ts';
import { openRecord, type GrantRow, type Kernel, type LeasedSeal } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const SIGNER = testSigner();
const NOW = Date.UTC(2026, 8, 23, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const LEASE = new Date(NOW + 60_000).toISOString();

const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

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

/** The signing secret a person deposited at the keychain door: sealed under the record key. */
const COLLECTOR = {
  label: 'collector',
  opens: 'collector.example.com',
  kind: 'api_token' as const,
  ciphertext: b(10),
  nonce: b(20),
  kdf: 'hkdf',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_2f',
  bytes: 32,
  hint: 'a 32-character secret',
  sealed_under: 'record' as const,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Sam' },
      keys: {
        record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' },
        connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' },
      },
    }),
  );
  return { k, sql };
}

/** The row `digest.ts` queues for a `webhook` channel, in the state a deliverer finds it: leased, naming its key by label. */
function leasedPost(sql: NodeSql, grant: string | null, kind = 'notify.webhook'): void {
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES ('ob_1', ?, ?, ?, 'leased', ?, 1)`,
    new Date(NOW).toISOString(),
    kind,
    JSON.stringify({ url: 'https://collector.example.com/in', body: '{"digest":"monday"}', ...(grant === null ? {} : { grant }) }),
    LEASE,
  );
}

test('A LEASED WEBHOOK OPENS THE KEY ITS PAYLOAD NAMES BY LABEL, with the record key it was sealed under', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(COLLECTOR, 'p_1'));
  leasedPost(sql, 'collector');

  const out = value<LeasedSeal>(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday'));
  /* THE GRANT ID COMES BACK, because the label is not what the host builds the key from: HKDF's `info` and the AAD are the
     id and the version, so a seal handed back without the id could not be opened by anybody. */
  assert.equal(out.grant.grant_id, made.id);
  assert.equal(out.grant.ciphertext, b64(COLLECTOR.ciphertext));
  /* THE RECORD KEY, AND SAID TO BE, since the host unwraps a DEK under an AAD that names its purpose. */
  assert.equal(out.dek.wrapped, b64(b(90)));
  assert.equal(out.dek.purpose, 'record');
  assert.equal(k.grants().find((g) => g.id === made.id)?.opened, 1);
  sql.close();
});

test('THE NEWEST LIVE KEY UNDER THE LABEL, as a call finds it, and a revoked one never', async () => {
  const { k, sql } = await record();
  const old = value<GrantRow>(k.bindGrant(COLLECTOR, 'p_1'));
  sql.exec('UPDATE grant SET created_at = ? WHERE id = ?', new Date(NOW - 86_400_000).toISOString(), old.id);
  const fresh = value<GrantRow>(k.bindGrant({ ...COLLECTOR, ciphertext: b(30) }, 'p_1'));
  leasedPost(sql, 'collector');

  assert.equal(value<LeasedSeal>(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday')).grant.grant_id, fresh.id);

  /* REVOKE THE NEWER ONE AND THE OLDER ONE SIGNS, which is what the keychain screen says: the label still has a live key. */
  value(k.revokeGrant(fresh.id, 'p_1'));
  assert.equal(value<LeasedSeal>(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday')).grant.grant_id, old.id);

  /* AND WITH NONE LIVE THE ANSWER IS THAT THE KEY WAS REVOKED, so the dead letter says why and a person knows what to add. */
  value(k.revokeGrant(old.id, 'p_1'));
  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday'));
  assert.equal(why.code, 'GRANT_REVOKED');
  assert.equal(why.at, 'grant');
  sql.close();
});

/** The grant a leased post naming `collector` opens, by its id, or the refusal's code. */
const signs = (k: Kernel): string => {
  const r = k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday') as { ok: boolean; value?: LeasedSeal; refusal?: { code: string } };
  return r.ok ? r.value!.grant.grant_id : r.refusal!.code;
};

test('A TIE ON created_at IS BROKEN BY THE ID, and the post signs with the key a call naming the label sends', async () => {
  /* BOUND IN ONE INSTANT, THE LARGER ID FIRST, so a reader that fell back to the order the rows came back in would sign
     with the smaller. This one passed before `sealedGrant` asked `grantChosen` and passes after: over ids the keychain
     mints, `ORDER BY created_at DESC, id DESC` and the chooser answer alike. */
  const { k, sql } = await record();
  const larger = value<GrantRow>(k.bindGrant({ ...COLLECTOR, sealed_for: { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5ZZZ', version: 1 } }, 'p_1'));
  const smaller = value<GrantRow>(k.bindGrant({ ...COLLECTOR, ciphertext: b(30), sealed_for: { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5AAA', version: 1 } }, 'p_1'));
  assert.equal(larger.created_at, smaller.created_at);
  leasedPost(sql, 'collector');
  assert.equal(signs(k), larger.id);
  assert.equal(keyNamed(sql, 'collector')?.id, larger.id);
  sql.close();
});

test('THE POST AND A CALL CHOOSE BY ONE ORDER, even over ids that SQL and the chooser would sort two ways', async () => {
  /* THE STATE THAT TELLS ONE ORDER FROM TWO. SQLite compares text as UTF-8 bytes and `grantChosen` compares UTF-16 code
     units, and the two disagree past the surrogates: an id ending U+FFFF is the larger in UTF-16, and one ending
     U+10000 the larger in UTF-8. No id the keychain mints holds either (`bindGrant` holds an id to `g_` and a ULID, and is
     the one writer of `grant`), so the ids are put in by SQL; what this holds is that the post does not keep an order of
     its own. Measured before the repair: the post signed with the id ending U+10000 and `keyNamed` sent the one ending
     U+FFFF. */
  const { k, sql } = await record();
  const one = value<GrantRow>(k.bindGrant(COLLECTOR, 'p_1'));
  const two = value<GrantRow>(k.bindGrant({ ...COLLECTOR, ciphertext: b(30) }, 'p_1'));
  sql.exec('UPDATE grant SET id = ?, created_at = ? WHERE id = ?', `g_${String.fromCharCode(0xffff)}`, one.created_at, one.id);
  sql.exec('UPDATE grant SET id = ?, created_at = ? WHERE id = ?', `g_${String.fromCodePoint(0x10000)}`, one.created_at, two.id);
  leasedPost(sql, 'collector');
  const call = keyNamed(sql, 'collector')?.id;
  assert.equal(call, grantChosen(k.grants(), 'collector')?.id);
  assert.equal(signs(k), call);
  sql.close();
});

test('A LABEL THE KEYCHAIN HAS NEVER HELD OPENS NOTHING, and says the label', async () => {
  const { k, sql } = await record();
  leasedPost(sql, 'collector');
  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday'));
  assert.equal(why.code, 'OUT_OF_BOUNDS');
  assert.match(why.fix, /collector/);
  sql.close();
});

test('THE SAME PAYLOAD CHECK: a lease on a post that names one key opens no other, and one that names none opens none', async () => {
  const { k, sql } = await record();
  value(k.bindGrant(COLLECTOR, 'p_1'));
  const other = value<GrantRow>(k.bindGrant({ ...COLLECTOR, label: 'stripe', opens: 'stripe.com' }, 'p_1'));
  leasedPost(sql, 'collector');

  for (const asked of ['stripe', other.id]) {
    const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: asked }, 'digest:monday'));
    assert.equal(why.code, 'FORBIDDEN', asked);
  }
  assert.equal(k.grants().find((g) => g.id === other.id)?.opened, 0);

  sql.exec("DELETE FROM outbox WHERE id = 'ob_1'");
  leasedPost(sql, null);
  assert.equal(refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday')).code, 'FORBIDDEN');
  sql.close();
});

test('AND ONLY THE TWO KINDS THAT SEND A KEY: an email job opens nothing, and a connector still needs its own key', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(COLLECTOR, 'p_1'));
  leasedPost(sql, made.id, 'notify.email');
  assert.equal(refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'digest:monday')).code, 'OUT_OF_BOUNDS');

  /* A CONNECTOR'S DOOR IS UNCHANGED: a key sealed for a person is refused to a `pull.fetch`, by id. */
  sql.exec("DELETE FROM outbox WHERE id = 'ob_1'");
  leasedPost(sql, made.id, 'pull.fetch');
  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:x'));
  assert.equal(why.code, 'OUT_OF_BOUNDS');
  assert.match(why.fix, /added for a person to use, not for a connector/);
  sql.close();
});

test('A RECORD KEY BEHIND A PASSPHRASE IS REFUSED AS THE RECORD KEY, not as a connector key the post never asked for', async () => {
  /* MEASURED BY THE CHECKER: with the record key re-wrapped under a passphrase, a leased post naming a record-sealed key
     was refused WRONG_KEY with "This record's connector key is not held by a key this host can use", which sends the
     owner to a connector that has nothing to do with the digest. */
  const { k, sql } = await record();
  value(k.bindGrant(COLLECTOR, 'p_1'));
  sql.exec("UPDATE vault_key SET wrapped_by = 'passphrase', kek_id = NULL WHERE purpose = 'record'");
  leasedPost(sql, 'collector');
  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: 'collector' }, 'digest:monday'));
  assert.equal(why.code, 'WRONG_KEY');
  assert.match(why.fix, /BrainDog’s own key/);
  assert.doesNotMatch(why.fix, /connector/);
  sql.close();
});
