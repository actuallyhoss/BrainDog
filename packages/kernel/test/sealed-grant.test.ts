/**
 * Handing a credential to a runner, on the strength of a lease.
 *
 * EVERY TEST HERE IS ABOUT SOMETHING NOT COMING OUT. `sealedGrant` is the one door in the vault that
 * no person walks through: a scheduled connector run asks for a credential with nobody on a screen
 * to say yes, and what stands in for that person is an unexpired lease on the job that needs it.
 * If the lease can be weakened — held on the wrong job, held after it lapsed, held after another
 * host took it — then the door is not a door, and the failure is a credential handed to whoever
 * asked. So four of the six tests below assert a refusal.
 *
 * WHAT IS NOT TESTED HERE, because it is not this file's: whether the bytes actually decrypt. That
 * needs the KEK, which the record does not have and never will, and `packages/connect`'s `auth`
 * tests drive it with one. What this asserts is that the right ciphertext, the right version and
 * the right wrapped key come back, which is everything the record can know.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type GrantRow, type Kernel, type LeasedSeal } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const SIGNER = testSigner();
const NOW = Date.UTC(2026, 8, 19, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const LEASE = new Date(NOW + 300_000).toISOString();

const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

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

const STRIPE = {
  label: 'Stripe, live',
  opens: 'stripe.com',
  kind: 'api_token' as const,
  ciphertext: b(10),
  nonce: b(20),
  kdf: 'hkdf',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_2f',
  bytes: 64,
  hint: 'a 64-character token',
  /* THE KEY THAT SEALED IT, and a connector credential is sealed under the connector key. Without
     this the fixture is a credential a person deposited, and the door below is right to refuse it —
     which is the assertion two tests down. */
  sealed_under: 'connector' as const,
};

/** A record with both keys wrapped, which is what a record that runs connectors actually has. */
async function record(keys: 'both' | 'no connector' = 'both'): Promise<{ k: Kernel; sql: NodeSql }> {
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
        ...(keys === 'both' ? { connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' } } : {}),
      },
    }),
  );
  return { k, sql };
}

/** A `pull.fetch` row in the state a runner finds it in: leased, and naming the key it sends. */
function leased(sql: NodeSql, grant: string | null, opts: { until?: string; state?: string } = {}): string {
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES ('ob_1', ?, 'pull.fetch', ?, ?, ?, 1)`,
    new Date(NOW).toISOString(),
    JSON.stringify({ channel: 'pull', ingest: 'stripe-charges', ...(grant === null ? {} : { grant }) }),
    opts.state ?? 'leased',
    opts.until ?? LEASE,
  );
  return 'ob_1';
}

/* ── the one case that succeeds ──────────────────────────────────────────── */

test('A LIVE LEASE OPENS THE CREDENTIAL ITS OWN JOB NAMES, sealed, with the connector key', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  leased(sql, made.id);

  const out = value<LeasedSeal>(
    k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, `ingest:stripe-charges`),
  );

  /* THE CIPHERTEXT AS STORED, base64 of the same four bytes, and the version with it: the version
     is in the AAD the host builds, so a seal handed back at the wrong one would never open. */
  assert.equal(out.grant.ciphertext, btoa(String.fromCharCode(...STRIPE.ciphertext)));
  assert.equal(out.grant.nonce, btoa(String.fromCharCode(...STRIPE.nonce)));
  assert.equal(out.grant.grant_id, made.id);
  assert.equal(out.grant.version, 1);
  assert.equal(out.grant.kek_id, 'kek_2f');

  /* THE CONNECTOR KEY AND NOT THE RECORD'S. They are different bytes on purpose here, because a
     function that reached for `purpose = 'record'` would pass every other assertion in this file. */
  assert.equal(out.dek.wrapped, btoa(String.fromCharCode(...b(70))));
  assert.equal(out.dek.nonce, btoa(String.fromCharCode(...b(60))));

  /* A RUN IS A READING, counted like any other, and the event says who without saying what. */
  assert.equal(k.grants().find((g) => g.id === made.id)?.opened, 1);
  const read = sql.one<{ actor: string; note: string }>(
    "SELECT actor, note FROM event WHERE kind = 'grant.read' ORDER BY rowid DESC LIMIT 1",
  );
  assert.equal(read?.actor, 'ingest:stripe-charges');
  assert.equal(read?.note, `${made.id} api_token`);
  assert.ok(!read?.note.includes('Stripe'), 'the label reached an event');
  sql.close();
});

/* ── and the five that do not ────────────────────────────────────────────── */

test('A LEASE ON A JOB THAT SENDS ANOTHER KEY OPENS NOTHING', async () => {
  const { k, sql } = await record();
  const stripe = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  const other = value<GrantRow>(k.bindGrant({ ...STRIPE, label: 'AWS', opens: 'aws.example' }, 'p_1'));
  /* The job sends the Stripe key. The caller asks for the other one. */
  leased(sql, stripe.id);

  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: other.id }, 'ingest:stripe-charges'));
  assert.equal(why.code, 'FORBIDDEN');
  assert.equal(why.at, 'grant');
  /* AND NOTHING WAS COUNTED, because a refusal that still recorded a reading would put a credential
     nobody opened into the "is this actually used" answer. */
  assert.equal(k.grants().find((g) => g.id === other.id)?.opened, 0);
  sql.close();
});

test('A LAPSED LEASE OPENS NOTHING, which is the double run a lease exists to stop', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  /* Expired one second ago. The row is anybody's now, so this caller is not the one holding it. */
  leased(sql, made.id, { until: new Date(NOW - 1000).toISOString() });

  const why = refusal(
    k.sealedGrant({ outbox: 'ob_1', leasedUntil: new Date(NOW - 1000).toISOString(), grant: made.id }, 'ingest:stripe-charges'),
  );
  assert.equal(why.code, 'PULL_LEASE_EDGE');
  sql.close();
});

test('A LEASE ANOTHER HOST HAS SINCE RENEWED OPENS NOTHING', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  /* The row says one instant; this runner was handed an earlier one, so it is a stale holder. */
  leased(sql, made.id, { until: new Date(NOW + 900_000).toISOString() });

  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:stripe-charges'));
  assert.equal(why.code, 'PULL_LEASE_EDGE');
  assert.equal(why.at, 'leasedUntil');
  sql.close();
});

test('a job that is finished, and a grant revoked since it was fired, each open nothing', async () => {
  const { k, sql } = await record();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  leased(sql, made.id, { state: 'done' });
  assert.equal(
    refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:stripe-charges')).code,
    'PULL_LEASE_EDGE',
  );

  /* REVOKED BETWEEN THE FIRE AND THE RUN is the ordinary case: a person revokes a key exactly when
     they have decided the thing using it should stop. */
  sql.exec("UPDATE outbox SET state = 'leased' WHERE id = 'ob_1'");
  value(k.revokeGrant(made.id, 'p_1'));
  assert.equal(
    refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:stripe-charges')).code,
    'GRANT_REVOKED',
  );
  sql.close();
});

test('a record with no connector key says so rather than handing out the record key', async () => {
  const { k, sql } = await record('no connector');
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  leased(sql, made.id);

  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:stripe-charges'));
  assert.equal(why.code, 'OUT_OF_BOUNDS');
  assert.ok(why.fix.includes('connector'), why.fix);
  sql.close();
});

test('A CREDENTIAL SEALED FOR A PERSON IS NOT OPENED FOR A RUNNER, whatever the lease says', async () => {
  const { k, sql } = await record();
  /* The ordinary deposit: somebody typed a password in and it was sealed under the record key, to
     be opened on a screen with them there. Every other check in this file passes for it. */
  const mine = value<GrantRow>(k.bindGrant({ ...STRIPE, label: 'My bank', sealed_under: 'record' }, 'p_1'));
  leased(sql, mine.id);

  const why = refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: mine.id }, 'ingest:stripe-charges'));
  assert.equal(why.code, 'OUT_OF_BOUNDS');
  assert.equal(why.at, 'grant');
  /* AND IT SAYS WHAT TO DO, because the alternative — the connector DEK handed back beside bytes
     the record key sealed — is a decrypt that throws in the host with nothing naming the cause. */
  assert.match(why.fix, /connector/);
  assert.equal(k.grants().find((g) => g.id === mine.id)?.opened, 0, 'a refusal counted a reading');
  sql.close();
});

test('and a grant bound without saying which key sealed it belongs to the person, not the runner', async () => {
  /* THE DEFAULT IS THE SAFE ONE, in both directions: every grant that existed before the column
     did was sealed under the record key, and a default of `connector` would be claiming a fact
     about those rows that nobody checked and that is wrong in the direction that matters. */
  const { k, sql } = await record();
  const { sealed_under: _omitted, ...unsaid } = STRIPE;
  const made = value<GrantRow>(k.bindGrant(unsaid, 'p_1'));
  assert.equal(made.sealed_under, 'record');
  leased(sql, made.id);
  assert.equal(
    refusal(k.sealedGrant({ outbox: 'ob_1', leasedUntil: LEASE, grant: made.id }, 'ingest:stripe-charges')).code,
    'OUT_OF_BOUNDS',
  );
  sql.close();
});
