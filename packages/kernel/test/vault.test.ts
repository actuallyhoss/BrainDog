/**
 * The vault: what a key opens, never the key.
 *
 * Every assertion here is about something NOT happening. The sealed bytes not coming back through a
 * list. The label not appearing in an audit trail. The record not being able to decrypt what it
 * holds. A vault whose tests only checked that a credential goes in and comes out would pass while
 * being a database of plaintext secrets with a nice name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, spanMs, type GrantRow, type Kernel, type SealedGrant } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

/**
 * ONE SIGNING KEY FOR THIS FILE'S RECORDS. `41 §5.11` step 3 refuses a file with no `dog_sig` row,
 * so every record that exports here needs a signer — which is what a real record has: a wrapped
 * Ed25519 private half in `vault_key`, opened by the host under its KEK.
 */
const SIGNER = testSigner();

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);

type Clockish = ReturnType<typeof fixedClock>;

async function vault(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { sign: SIGNER });
  value(
    k.createRecord({
      id: ID,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Sam' },
      keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' } },
    }),
  );
  return { k, sql, clock };
}

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
};

/* ── what a person sees ──────────────────────────────────────────────────── */

test('A GRANT IS AN INDEX OF WHAT A KEY OPENS, and the key is not in it', async () => {
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));

  assert.match(made.id, /^g_[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(made.label, 'Stripe, live');
  assert.equal(made.opens, 'stripe.com');
  assert.equal(made.hint, 'a 64-character token');
  assert.equal(made.version, 1);
  assert.equal(made.opened, 0);

  /* THE SEALED BYTES ARE NOT IN THE ROW A PERSON READS. Not under another name, not as base64, not
     as an empty string that a later change might fill in. */
  const shown = JSON.stringify(k.grants());
  for (const forbidden of ['ciphertext', 'nonce', 'prev_'])
    assert.ok(!shown.includes(forbidden), `${forbidden} came back through the list`);
  assert.equal(Object.keys(k.grants()[0] ?? {}).length, Object.keys(made).length);

  // And they ARE in the table, because the record is holding them for somebody.
  assert.ok(sql.one<{ n: number }>('SELECT length(ciphertext) AS n FROM grant')!.n > 0);
  sql.close();
});

test('the things that are not a grant are refused with the sentence', async () => {
  const { k, sql } = await vault();
  assert.equal(refusal(k.bindGrant({ ...STRIPE, kind: 'passphrase' as never }, 'p_1')).at, 'kind');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, label: '  ' }, 'p_1')).at, 'label');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, opens: '' }, 'p_1')).at, 'opens');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, ciphertext: new Uint8Array() }, 'p_1')).at, 'ciphertext');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, id: 'stripe' }, 'p_1')).at, 'id');

  /* A HINT LONG ENOUGH TO BE THE THING IT HINTS AT is a credential written down in plain text, on a
     screen, in the one place the product promises it is not. */
  const long = refusal(k.bindGrant({ ...STRIPE, hint: 'sk_live_'.padEnd(80, 'x') }, 'p_1'));
  assert.equal(long.at, 'hint');
  assert.match(long.fix, /what the thing IS/);
  assert.equal(k.grants().length, 0, 'a refused bind wrote a grant anyway');
  sql.close();
});

/* ── the audit trail ─────────────────────────────────────────────────────── */

test('AN EVENT NAMES THE GRANT AND ITS KIND, and never the label or what it opens', async () => {
  /* An audit trail that says "Stripe, live" on every read tells whoever can read events exactly
     which credential is worth taking — and events are readable at a lower level than the vault. */
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  value(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1'));
  value(k.bindGrant({ ...STRIPE, id: made.id, ciphertext: b(30), nonce: b(40) }, 'p_1'));
  value(k.revokeGrant(made.id, 'p_1'));

  const events = sql.all<{ kind: string; actor: string; note: string; target: string }>(
    "SELECT kind, actor, note, target FROM event WHERE target_kind = 'grant' ORDER BY rowid",
  );
  assert.deepEqual(
    events.map((e) => e.kind),
    ['grant.add', 'grant.read', 'grant.rotate', 'grant.revoke'],
  );
  for (const e of events) {
    assert.equal(e.actor, 'p_1', 'the trail does not say who');
    assert.equal(e.target, `grant:${made.id}`);
    assert.equal(e.note, `${made.id} api_token`);
    assert.ok(!e.note.includes('Stripe'), 'the label reached the audit trail');
    assert.ok(!e.note.includes('stripe.com'), 'what it opens reached the audit trail');
  }
  sql.close();
});

test('every opening is counted, and WHO opened it is the event rather than a column', async () => {
  // A column holds one answer and the question is a list.
  const { k, sql, clock } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));

  clock.set(NOW + DAY);
  value(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1'));
  value(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_2'));

  const row = k.grant(made.id)!;
  assert.equal(row.opened, 2);
  assert.equal(row.last_opened?.slice(0, 10), new Date(NOW + DAY).toISOString().slice(0, 10));
  assert.deepEqual(
    sql.all<{ actor: string }>("SELECT actor FROM event WHERE kind = 'grant.read' ORDER BY rowid").map((e) => e.actor),
    ['p_1', 'p_2'],
  );
  sql.close();
});

/* ── the record cannot open what it holds ────────────────────────────────── */

test('OPENING A GRANT HANDS BACK SEALED BYTES AND THE KEY THAT WRAPS THEM, both still sealed', async () => {
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  const out = value<SealedGrant>(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1'));

  assert.deepEqual(Array.from(out.ciphertext), Array.from(b(10)));
  assert.deepEqual(Array.from(out.key.wrapped), Array.from(b(90)), 'the record key did not travel with it');

  /* THE AAD BINDS THE CIPHERTEXT TO THIS ROW OF THIS RECORD. Without it, bytes lifted from one grant
     and pasted into another decrypt cleanly; the version in it is why a stale copy of a rotated
     credential fails rather than quietly working. */
  /* `0x1F`, THE BYTE. `12 §6` says "wherever this corpus writes ‖ it means that byte", and both the
     code and this assertion carried a literal U+2016 — three bytes of UTF-8 — so the test agreed
     with the bug. The first cross-host restore would have failed as an `OperationError`,
     indistinguishable from a wrong key. */
  assert.equal(out.aad, `${ID}\x1f${made.id}\x1f1`);
  assert.equal([...new TextEncoder().encode(out.aad)].filter((b) => b === 0x1f).length, 2, '12 §6: two separators, one byte each');
  const rotated = value<GrantRow>(k.bindGrant({ ...STRIPE, id: made.id, ciphertext: b(30), nonce: b(40) }, 'p_1'));
  assert.equal(value<SealedGrant>(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1')).aad, `${ID}\x1f${made.id}\x1f2`);
  assert.equal(rotated.version, 2);
  sql.close();
});

test('A ROTATED WRAPPING KEY IS `WRONG_KEY`, never corruption', async () => {
  // They look identical from inside a failed decrypt, and the difference is everything: one is "try
  // the other key" and the other is "your credentials are gone".
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  const out = refusal(k.openGrant({ id: made.id, kek_id: 'kek_ff' }, 'p_1'));
  assert.equal(out.code, 'WRONG_KEY');
  assert.match(out.fix, /kek_2f/);
  assert.equal(k.grant(made.id)?.opened, 0, 'a refused open was counted as one');

  /* AND OMITTING THE KEY IS NOT PASSING THE CHECK. It used to skip the comparison entirely, so the
     one guard on a credential path was satisfied by not asking — the wrong default anywhere, and the
     wrongest place for it. */
  const silent = refusal(k.openGrant({ id: made.id }, 'p_1'));
  assert.equal(silent.code, 'WRONG_KEY');
  assert.match(silent.fix, /offered no key/);
  assert.equal(k.grant(made.id)?.opened, 0);
  sql.close();
});

/* ── rotation and revocation ─────────────────────────────────────────────── */

test('A ROTATION KEEPS EXACTLY ONE PRIOR VERSION, which is what the schema says', async () => {
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  value(k.bindGrant({ ...STRIPE, id: made.id, ciphertext: b(30), nonce: b(40) }, 'p_1'));
  value(k.bindGrant({ ...STRIPE, id: made.id, ciphertext: b(50), nonce: b(60) }, 'p_1'));

  const row = sql.one<{ version: number; ciphertext: Uint8Array; prev_ciphertext: Uint8Array | null; rotated_at: string }>(
    'SELECT version, ciphertext, prev_ciphertext, rotated_at FROM grant WHERE id = ?',
    made.id,
  )!;
  assert.equal(row.version, 3);
  assert.deepEqual(Array.from(row.ciphertext), Array.from(b(50)));
  assert.deepEqual(Array.from(row.prev_ciphertext ?? []), Array.from(b(30)), 'the prior version is the wrong one');
  assert.ok(row.rotated_at);
  sql.close();
});

test('REVOKING DESTROYS THE BYTES AND KEEPS THE ROW, because what it opened is a fact', async () => {
  // "This used to reach the production database" is the sentence somebody needs a year later.
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant({ ...STRIPE, rotate_every: '90d' }, 'p_1'));
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'rotate'").length, 1);

  value(k.revokeGrant(made.id, 'p_1'));

  const row = sql.one<{ ciphertext: Uint8Array | null; prev_ciphertext: Uint8Array | null; revoked_at: string; label: string }>(
    'SELECT ciphertext, prev_ciphertext, revoked_at, label FROM grant WHERE id = ?',
    made.id,
  )!;
  assert.equal(row.ciphertext, null);
  assert.equal(row.prev_ciphertext, null, 'a revocation left the previous copy behind');
  assert.ok(row.revoked_at);
  assert.equal(row.label, 'Stripe, live', 'the row went with the bytes');

  // And the reminders it derived, because a rotation notice about a revoked credential asks
  // somebody to do a thing that cannot be done.
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'rotate' AND state = 'pending'").length, 0);

  // Neither opened nor rotated after that, and the refusal says which of the two it is.
  assert.equal(refusal(k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1')).code, 'GRANT_REVOKED');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, id: made.id }, 'p_1')).code, 'GRANT_REVOKED');
  assert.equal(refusal(k.revokeGrant(made.id, 'p_1')).code, 'GRANT_REVOKED');
  assert.equal(refusal(k.openGrant({ id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAD', kek_id: 'kek_2f' }, 'p_1')).code, 'OUT_OF_BOUNDS');
  sql.close();
});

/* ── the reminders it derives ────────────────────────────────────────────── */

test('NOBODY SETS A ROTATION REMINDER: `rotate_every` and `expires_at` derive them', async () => {
  const { k, sql, clock } = await vault();
  const made = value<GrantRow>(
    k.bindGrant({ ...STRIPE, rotate_every: '90d', expires_at: new Date(NOW + 120 * DAY).toISOString().slice(0, 10) }, 'p_1'),
  );

  const rows = sql.all<{ key: string; due_at: string; payload: string }>(
    "SELECT key, due_at, payload FROM schedule WHERE kind = 'rotate' ORDER BY due_at",
  );
  assert.deepEqual(rows.map((r) => r.key), [`grant:${made.id}`, `grant:${made.id}:expires`]);
  assert.equal(Date.parse(rows[0]!.due_at) - NOW, 90 * DAY);
  /* FORTY-EIGHT HOURS BEFORE IT EXPIRES, because a credential announced at the moment it stops
     working is announced to nobody. */
  assert.equal(Date.parse(rows[1]!.due_at), Date.parse(`${new Date(NOW + 120 * DAY).toISOString().slice(0, 10)}T12:00:00Z`) - 48 * 3_600_000);
  assert.equal((JSON.parse(rows[1]!.payload) as { urgent: boolean }).urgent, true);

  // A rotation re-derives them rather than arming a second set beside the first.
  clock.set(NOW + 10 * DAY);
  value(k.bindGrant({ ...STRIPE, id: made.id, rotate_every: '30d' }, 'p_1'));
  const after = sql.all<{ key: string; due_at: string }>("SELECT key, due_at FROM schedule WHERE kind = 'rotate' ORDER BY due_at");
  assert.equal(after.length, 2, `${after.length} reminders for one grant`);
  assert.equal(Date.parse(after[0]!.due_at) - (NOW + 10 * DAY), 30 * DAY, 'the old cycle is still armed');
  sql.close();
});

test('and when one fires it says the id and the kind, not the label', async () => {
  const { k, sql, clock } = await vault();
  const made = value<GrantRow>(k.bindGrant({ ...STRIPE, rotate_every: '90d' }, 'p_1'));

  clock.set(NOW + 91 * DAY);
  const drained = await k.drain();
  assert.ok(drained.done >= 1);
  assert.equal(drained.dead, 0, '`rotate` is a kind nothing handles');

  const note = sql.one<{ note: string; actor: string; target: string }>(
    "SELECT note, actor, target FROM event WHERE kind = 'note' AND target_kind = 'grant'",
  )!;
  assert.equal(note.note, `credential ${made.id} (api_token) is due for rotation`);
  assert.ok(!note.note.includes('Stripe'), 'a notification named the credential');
  assert.equal(note.target, `grant:${made.id}`);

  // And it recurs on its own cycle, which is what `rotate_every` means.
  const again = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE key = ?", `grant:${made.id}`)!;
  assert.equal(again.state, 'pending');
  assert.equal(Date.parse(again.due_at) - (NOW + 91 * DAY), 90 * DAY);
  sql.close();
});

test('a rotate row about a revoked grant is dropped rather than fired', async () => {
  const { k, sql, clock } = await vault();
  const made = value<GrantRow>(k.bindGrant({ ...STRIPE, rotate_every: '90d' }, 'p_1'));
  // Revoke leaves no pending row, so reach past it: the drain is the last line of defence.
  sql.exec("UPDATE grant SET revoked_at = ? WHERE id = ?", new Date(NOW).toISOString(), made.id);

  clock.set(NOW + 91 * DAY);
  const drained = await k.drain();
  assert.equal(drained.dead, 0, 'a revoked credential was a failure rather than a drop');
  assert.equal(drained.failed, 0);
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'note' AND target_kind = 'grant'").length, 0);
  sql.close();
});

test('a span is a span, and anything else is a refusal', async () => {
  assert.equal(spanMs('90d'), 90 * DAY);
  assert.equal(spanMs('12w'), 84 * DAY);
  assert.equal(spanMs('1y'), 365 * DAY);
  assert.equal(spanMs('quarterly'), null);
  assert.equal(spanMs('90'), null);

  const { k, sql } = await vault();
  assert.equal(refusal(k.bindGrant({ ...STRIPE, rotate_every: 'quarterly' }, 'p_1')).at, 'rotate_every');
  assert.equal(refusal(k.bindGrant({ ...STRIPE, expires_at: 'next spring' }, 'p_1')).at, 'expires_at');
  assert.equal(k.grants().length, 0, 'a refused bind left a grant behind');
  sql.close();
});

/* ── the file it travels in ──────────────────────────────────────────────── */

test('A GRANT TRAVELS IN A `.brain` FILE, SEALED, and comes back as itself', async () => {
  // Sealed material travels because a record you can take with you that leaves the credentials index
  // behind is not the record. It travels SEALED, which is what makes that safe.
  const source = await vault();
  value<GrantRow>(source.k.bindGrant(STRIPE, 'p_1'));
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));

  const there = k.grants()[0]!;
  assert.equal(there.label, 'Stripe, live');
  assert.equal(there.hint, 'a 64-character token');
  const sealed = value<SealedGrant>(k.openGrant({ id: there.id, kek_id: 'kek_2f' }, 'p_1'));
  assert.deepEqual(Array.from(sealed.ciphertext), Array.from(b(10)), 'the sealed bytes did not survive the file');
  assert.equal(sealed.aad, `${ID}\x1f${there.id}\x1f1`, 'the AAD names a different record than the file said');
  sql.close();
  source.sql.close();
});

test('A RECORD THAT WILL NOT NAME ITS WRAPPING KEY OPENS NOTHING', async () => {
  /* The check was `key.kek_id !== (args.kek_id ?? null)`, and the column is nullable with nothing
     validating it at provision — so a record wrapped by a KEK whose id was never written stored
     NULL, and `null !== null` is false: `openGrant` with no key at all sailed past the guard and
     returned the sealed bytes. That is the opt-out the comment above it says was removed, arrived
     at through the check written to remove it. An empty string failed closed; only NULL failed open. */
  const { k, sql } = await vault();
  const made = value<GrantRow>(k.bindGrant(STRIPE, 'p_1'));
  sql.exec("UPDATE vault_key SET kek_id = NULL WHERE wrapped_by = 'kek'");

  const tried = k.openGrant({ id: made.id, kek_id: 'kek_2f' }, 'p_1');
  assert.equal(refusal(tried).code, 'WRONG_KEY');
  assert.match(refusal(tried).fix, /does not say which one/);
  sql.close();
});
