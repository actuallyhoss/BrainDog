/**
 * The keychain: what a key opens, never the key.
 *
 * THE RECORD NEVER DECRYPTS. It holds sealed bytes and the fingerprint of the key that wrapped them,
 * and it has no way to open either — the unwrapping key lives somewhere the record cannot reach. That
 * is what makes "we cannot read your record" a fact about the code rather than a promise about our
 * intentions, and it is the reason every function here hands ciphertext straight back out.
 *
 * SO WHAT THE RECORD ACTUALLY HOLDS IS AN INDEX. `label`, `opens`, `kind`, `bytes`, `hint`, `scopes`
 * — a person can read "Stripe, live · stripe.com · api_token · a 64-character token" and know what
 * they have without anybody being able to use it. The rows are worth having on their own: the
 * question "what would break if this machine were lost" is answerable from them.
 *
 * TWO VERSIONS, AND THE SCHEMA SAYS SO. A rotation keeps exactly one prior copy — enough to finish
 * the requests already in flight when the key changed, and not a history of every credential the
 * customer has ever held. `prev_ciphertext` and `prev_nonce` are two columns, not a table.
 *
 * NEITHER THE LABEL NOR WHAT IT OPENS GOES IN AN EVENT. A `grant.read` row says the id and the kind
 * and nothing else: an audit trail that names "Stripe, live" for every read is an audit trail that
 * tells whoever can read events exactly which credential is worth stealing.
 */

import type { Result, Sql } from '@braindog/ports';
import { clash, no, ok } from '@braindog/ports';

import { grantChosen, heldHost, type GrantChoosable } from './actions.ts';
import { ulids } from './ids.ts';
import { instant } from './migrate.ts';
import { attempt } from './tx.ts';

/** The columns a person may see. `ciphertext`, `nonce` and the two `prev_` are absent by design. */
const VISIBLE =
  'id, label, opens, kind, version, kdf, wrapped_by, scopes, kek_id, bytes, hint, opened, last_opened, created_at, expires_at, rotate_every, stale_at, rotated_at, revoked_at, sealed_under';

export type GrantKind = 'api_token' | 'password' | 'ssh_key' | 'recovery_codes' | 'note';
export const GRANT_KINDS: readonly GrantKind[] = ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'];

/**
 * A kind with its article, as a sentence says it: "an api_token", "an ssh_key", "a password".
 *
 * BY HOW THE WORD IS SAID, NOT BY ITS FIRST LETTER. The rotation refusal wrote `is a ${kind}`, so a token read "is a
 * api_token"; `ssh_key` is said "ess-ess-aitch" and takes "an" too, which a vowel test on the letter would miss.
 */
const aKind = (kind: GrantKind): string => `${kind === 'api_token' || kind === 'ssh_key' ? 'an' : 'a'} ${kind}`;
const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export type GrantRow = {
  id: string;
  label: string;
  opens: string;
  kind: GrantKind;
  version: number;
  kdf: string;
  wrapped_by: string;
  scopes: string | null;
  kek_id: string;
  bytes: number | null;
  hint: string | null;
  opened: number;
  last_opened: string | null;
  created_at: string;
  expires_at: string | null;
  rotate_every: string | null;
  stale_at: string | null;
  rotated_at: string | null;
  revoked_at: string | null;
  /** Which data key sealed the bytes. `12 §6` keeps the two apart; this says which one a row used. */
  sealed_under: 'record' | 'connector';
};

/** What the host needs to unwrap. The kernel assembles it and cannot use it. */
export type SealedGrant = {
  id: string;
  version: number;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  kdf: string;
  wrapped_by: string;
  kek_id: string;
  /**
   * `record_id ‖ grant_id ‖ version`, additional authenticated data.
   *
   * IT BINDS THE CIPHERTEXT TO THIS ROW OF THIS RECORD. Without it, sealed bytes lifted from one
   * grant and pasted into another decrypt cleanly — and the version in it is why a stale copy of a
   * rotated credential fails rather than quietly working.
   */
  aad: string;
  /** The record's own wrapped key, so the host can unwrap without a second round trip. */
  key: { wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null; salt: Uint8Array | null };
  /**
   * Which of the record's two data keys `key` is, the grant's own `sealed_under`: the host unwraps it under that name
   * (`purposeOf` in `@braindog/host`), since the name is half of what the wrapping binds. OPTIONAL IN THE TYPE ONLY,
   * so a host's test double that hands a record key reads as one; `openGrant` always says it.
   */
  purpose?: 'record' | 'connector';
};

export type BindGrantArgs = {
  /** Absent mints a grant; present rotates the one named, keeping exactly one prior version. */
  id?: string;
  label: string;
  /** What the key OPENS — a host, an account, a machine. Never the key. */
  opens: string;
  kind: GrantKind;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  kdf: string;
  wrapped_by: 'kek' | 'passphrase';
  kek_id: string;
  /** The PROVEN scopes, from a bind-time probe. Absent keeps what the row already claimed. */
  scopes?: string | null;
  bytes?: number | null;
  /** "a 64-character token", "a 3.2 KB env file" — what it is, unopened. */
  hint?: string | null;
  expires_at?: string | null;
  /** `90d`, `1y` — puts a `rotate` row in the schedule. */
  rotate_every?: string | null;
  /**
   * Which of the record's two data keys sealed these bytes (`12 §6`). `record` is the default and
   * the ordinary case: a credential a person deposited, opened on a screen with that person there.
   *
   * `connector` IS THE ONE A SCHEDULED RUN CAN OPEN, and it is not a preference — the bytes either
   * were sealed under that key or they were not, and saying the wrong one here produces a decrypt
   * that throws in the host rather than a refusal that names the cause. Whoever sealed the bytes
   * says which key they used; nothing infers it.
   */
  sealed_under?: 'record' | 'connector';
  /**
   * The grant id and version a host sealed these bytes for, when it sealed them before the bind.
   *
   * THE AAD NAMES BOTH, so bytes stored under any other id or version would never open. A bind that
   * would do that is refused, or answered as a conflict when another deposit moved the grant first.
   *
   * `wrapping` IS THE NONCE OF THE DATA KEY'S WRAPPING THE HOST WAS HANDED TO SEAL UNDER. Putting the passphrase on
   * replaces the record key (`rewrapRecordKey`), and a deposit sealed while that change was under way would otherwise
   * bind bytes only the old key opens: kept, and opened by nothing the record holds. Every wrapping draws a fresh nonce,
   * so a nonce that is no longer the row's is answered as a conflict and the caller seals again.
   */
  sealed_for?: { id: string; version: number; wrapping?: Uint8Array };
};

export type KeychainDeps = {
  /**
   * Send one interrupt, if the record has not already had one this hour. `09 §4`.
   *
   * INJECTED, because routing a notification is `digest.ts`'s — it knows what a channel is — and
   * this file is the keychain. A second copy of the rate limit here would be a second answer to "have
   * we interrupted this person already", and the two would disagree on the day it mattered.
   */
  interrupt: (said: { actor: string; say: string; because?: string; url?: string; cause?: string }) => void;
  mint: () => string;
  nowMs: number;
  /**
   * Who is asking. A token writes as the PERSON who holds it, never as itself — and the whole point
   * of the `grant.read` row is that it names somebody.
   */
  actor: string;
  /** The record's own id, which is the first third of the AAD. */
  recordId: string | null;
};

const ID = /^g_[0-9A-HJKMNP-TV-Z]{26}$/;

/** Every grant, in the order a person reads them. Sealed bytes never leave through here. */
export const listGrants = (sql: Sql): GrantRow[] => sql.all<GrantRow>(`SELECT ${VISIBLE} FROM grant ORDER BY label`);

export const getGrant = (sql: Sql, id: string): GrantRow | null =>
  sql.one<GrantRow>(`SELECT ${VISIBLE} FROM grant WHERE id = ?`, id) ?? null;

/**
 * Mint a grant, or rotate one.
 *
 * ONE FUNCTION, because the two differ by one column and a version number, and a record that took
 * two paths to the same row is a record where one of them forgets the schedule.
 */
export function bindGrant(
  sql: Sql,
  deps: KeychainDeps,
  args: BindGrantArgs,
  transaction: <T>(fn: () => T) => T,
): Result<GrantRow> {
  if (!GRANT_KINDS.includes(args.kind))
    return no<GrantRow>('ENUM_VALUE_UNKNOWN', `${args.kind} is not a kind of grant.`, {
      at: 'kind',
      allowed: GRANT_KINDS,
    });
  /* REFUSED WITH A SENTENCE BEFORE THE TABLE'S CHECK THROWS ONE. The value arrives over a host's RPC from a body, and a
     constraint failure several layers down names a column and not what to send. */
  if (args.sealed_under !== undefined && args.sealed_under !== 'record' && args.sealed_under !== 'connector')
    return no<GrantRow>('ENUM_VALUE_UNKNOWN', 'A key is sealed for a person to use (record) or for a scheduled connector (connector).', {
      at: 'sealed_under',
      allowed: ['record', 'connector'],
    });
  if (!args.label.trim()) return no<GrantRow>('REQUIRED_MISSING', 'A grant has a label a person would say.', { at: 'label' });
  if (!args.opens.trim())
    return no<GrantRow>('REQUIRED_MISSING', 'A grant says what it opens: a host, an account, a machine.', { at: 'opens' });
  if (args.ciphertext.length === 0)
    return no<GrantRow>('REQUIRED_MISSING', 'A grant carries sealed bytes. Seal them before binding.', { at: 'ciphertext' });
  /* THE HINT IS NOT THE SECRET. It is read on a screen by whoever the record belongs to, and a hint
     long enough to be the thing it hints at is a credential written down in plain text. */
  if (args.hint && args.hint.length > 60)
    return no<GrantRow>('OUT_OF_BOUNDS', 'A hint says what the thing IS, unopened: sixty characters, not the value.', {
      at: 'hint',
    });
  if (args.id !== undefined && !ID.test(args.id))
    return no<GrantRow>('VALUE_MALFORMED', `A grant id is g_ plus a 26-character ULID. ${args.id} is not.`, { at: 'id' });
  const sealed = args.sealed_for;
  if (sealed !== undefined && (!ID.test(sealed.id) || !Number.isInteger(sealed.version) || sealed.version < 1))
    return no<GrantRow>('VALUE_MALFORMED', 'The bytes were sealed for a grant id and version BrainDog cannot hold.', { at: 'sealed_for' });
  /* AN `ArrayBuffer` TOO, because that is what the Durable Object's SQLite hands back for the nonce a deposit read. */
  if (sealed?.wrapping !== undefined && !((sealed.wrapping as unknown) instanceof Uint8Array || (sealed.wrapping as unknown) instanceof ArrayBuffer))
    return no<GrantRow>('VALUE_MALFORMED', 'The bytes name the key wrapping they were sealed under by its nonce, as bytes.', { at: 'sealed_for' });
  /* Sealed for a fresh grant while another deposit gave the row one: that deposit arrived first. */
  if (sealed !== undefined && args.id !== undefined && sealed.id !== args.id)
    return clash<GrantRow>(0, { id: args.id }, 'system');

  /* THE SPANS ARE CHECKED BEFORE THE FIRST WRITE. `attempt` below would roll a late refusal back
     anyway — that is what it is for — but a refusal that arrives before anything was tried is the
     one that needs no machinery to be correct. */
  if (args.rotate_every && spanMs(args.rotate_every) === null)
    return no<GrantRow>('VALUE_MALFORMED', `${args.rotate_every} is not a span: write 90d, 12w or 1y.`, {
      at: 'rotate_every',
    });
  if (args.expires_at && !Number.isFinite(dayMs(args.expires_at)))
    return no<GrantRow>('VALUE_MALFORMED', `${args.expires_at} is not a date.`, { at: 'expires_at' });

  const at = instant(deps.nowMs);

  return attempt(sql, transaction, () => {
    const id = args.id ?? sealed?.id ?? `g_${deps.mint()}`;
    const rotating = args.id !== undefined;

    /* SEALED FOR A VERSION THIS BIND WOULD NOT WRITE. The host sealed against what it was told the grant
       was, and another deposit got there first: a conflict, so the caller seals again for what is there now. */
    if (sealed !== undefined) {
      const now = sql.one<{ version: number }>('SELECT version FROM grant WHERE id = ?', id);
      const next = rotating ? (now ? now.version + 1 : 0) : now ? 0 : 1;
      if (next !== sealed.version && (now || !rotating)) {
        const by = sql.one<{ actor: string }>('SELECT actor FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1', `grant:${id}`);
        return clash<GrantRow>(now?.version ?? 0, { id, version: now?.version ?? 0 }, by?.actor ?? 'system');
      }
      /* SEALED UNDER A KEY THE RECORD NO LONGER HOLDS. The passphrase went on while the host sealed, and that replaces the
         record key: these bytes would open under nothing the record keeps. A conflict, so the caller seals again. */
      if (sealed.wrapping !== undefined && !sql.one('SELECT 1 AS x FROM vault_key WHERE purpose = ? AND nonce = ?', args.sealed_under ?? 'record', sealed.wrapping)) {
        const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target_kind = 'vault_key' ORDER BY rowid DESC LIMIT 1");
        return clash<GrantRow>(now?.version ?? 0, { id, version: now?.version ?? 0 }, by?.actor ?? 'system');
      }
    }

    if (rotating) {
      /* A DIFFERENT KIND IS A DIFFERENT GRANT. The rotate UPDATE writes fourteen columns and `kind`
         is not one of them, so a rotation that named another kind kept the row's and wrote the
         caller's into the audit event — a trail saying an SSH key was rotated where a token was. */
      const held = sql.one<{ kind: GrantKind }>('SELECT kind FROM grant WHERE id = ?', id);
      if (held && held.kind !== args.kind)
        return no<GrantRow>(
          'IMMUTABLE_FIELD',
          `${id} is ${aKind(held.kind)}. ${upper(aKind(args.kind))} is a different grant, not a rotation of this one.`,
          { at: 'kind', allowed: [held.kind] },
        );

      /* ONE PRIOR VERSION, and the schema is what says so: two columns rather than a table. Enough
         to finish the requests already in flight when the key changed, and not a history of every
         credential the customer has ever held.

         `sealed_under` MOVES WITH THE BYTES. A rotation seals a new value, and whoever sealed it says under which key,
         as a first bind does. Left as it was, a key a person replaced from the Keys screen and turned into a connector's
         kept saying `record` over bytes the connector key sealed, and the run that opened it was refused for the old
         answer; turned back, the row said `connector` over bytes only the record key opens. Unsaid is `record`, the
         insert's own default, because a caller that says nothing sealed with the record key. */
      const moved = sql.all<{ id: string }>(
        `UPDATE grant SET prev_ciphertext = ciphertext, prev_nonce = nonce,
           ciphertext = ?, nonce = ?, version = version + 1, kdf = ?, wrapped_by = ?, kek_id = ?,
           bytes = ?, hint = ?, label = ?, opens = ?,
           scopes = COALESCE(?, scopes), rotated_at = ?, stale_at = NULL, sealed_under = ?
         WHERE id = ? AND revoked_at IS NULL
         RETURNING id`,
        args.ciphertext,
        args.nonce,
        args.kdf,
        args.wrapped_by,
        args.kek_id,
        args.bytes ?? null,
        args.hint ?? null,
        args.label,
        args.opens,
        args.scopes ?? null,
        at,
        args.sealed_under ?? 'record',
        id,
      );
      /* A REVOKED GRANT IS NOT ROTATABLE, and the refusal says which of the two it is: an id that
         never existed and one that was deliberately taken out of service are different mistakes. */
      if (moved.length === 0)
        return sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)
          ? no<GrantRow>('GRANT_REVOKED', `${id} was revoked. A revoked grant is not rotated; bind a new one.`, { at: 'id' })
          : no<GrantRow>('OUT_OF_BOUNDS', `There is no grant ${id}.`, { at: 'id' });
      event(sql, deps, 'grant.rotate', id, args.kind);
    } else {
      sql.exec(
        `INSERT INTO grant (id, label, opens, kind, version, ciphertext, nonce, kdf, wrapped_by, scopes, kek_id, bytes, hint, opened, created_at, expires_at, rotate_every, sealed_under)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        id,
        args.label,
        args.opens,
        args.kind,
        args.ciphertext,
        args.nonce,
        args.kdf,
        args.wrapped_by,
        args.scopes ?? null,
        args.kek_id,
        args.bytes ?? null,
        args.hint ?? null,
        at,
        args.expires_at ?? null,
        args.rotate_every ?? null,
        args.sealed_under ?? 'record',
      );
      event(sql, deps, 'grant.add', id, args.kind);
    }

    /* THE REMINDERS ARE DERIVED FROM THE ROW, like every other one in the record: nobody sets them,
       and a `rotate_every` that changes moves them. Both are re-derived on every bind, so a rotation
       that shortens the cycle does not leave the old one armed beside the new. */
    sql.exec("DELETE FROM schedule WHERE kind = 'rotate' AND state = 'pending' AND key IN (?, ?)", `grant:${id}`, `grant:${id}:expires`);

    /* AN EXPLICIT `null` IS A CHANGE, not an omission. `??` read "take this cycle off" as "leave it
       alone", so the column went to NULL and the old reminder stayed armed — the row saying no cycle
       while the schedule held one derived from the cycle just removed. */
    const every = args.rotate_every !== undefined ? args.rotate_every : rotating ? (getGrant(sql, id)?.rotate_every ?? null) : null;
    const span = every ? spanMs(every) : null;
    if (span !== null) arm(sql, deps, `grant:${id}`, deps.nowMs + span, { grant: id });

    const expires = args.expires_at !== undefined ? args.expires_at : rotating ? (getGrant(sql, id)?.expires_at ?? null) : null;
    if (expires) {
      /* FORTY-EIGHT HOURS BEFORE, because a credential that expires at midnight and is announced at
         midnight is announced to nobody. */
      arm(sql, deps, `grant:${id}:expires`, dayMs(expires) - 48 * 3_600_000, { grant: id, urgent: true });
    }

    /* A ROTATION THAT CHANGES THE CYCLE has to write it, or the reminder above is armed for a span
       the row does not claim — and a person reading the row would see the old one. */
    if (rotating && args.rotate_every !== undefined)
      sql.exec('UPDATE grant SET rotate_every = ? WHERE id = ?', args.rotate_every, id);
    if (rotating && args.expires_at !== undefined)
      sql.exec('UPDATE grant SET expires_at = ? WHERE id = ?', args.expires_at, id);

    const row = getGrant(sql, id);
    return row ? ok(row) : no<GrantRow>('OUT_OF_BOUNDS', `There is no grant ${id}.`, { at: 'id' });
  });
}

/**
 * Hand the sealed bytes out, and count the reading.
 *
 * EVERY DECRYPT IS COUNTED AND VISIBLE. `opened` and `last_opened` are columns rather than an
 * inference from the event log, because "how often is this actually used" is the question that
 * decides whether a credential should still exist — and WHO opened it is the `grant.read` event,
 * never a column, because a column holds one answer and the question is a list.
 */
export function openGrant(
  sql: Sql,
  deps: KeychainDeps,
  args: { id: string; kek_id?: string | undefined },
  transaction: <T>(fn: () => T) => T,
): Result<SealedGrant> {
  const row = sql.one<{
    id: string;
    kind: GrantKind;
    version: number;
    ciphertext: Uint8Array | null;
    nonce: Uint8Array | null;
    kdf: string;
    wrapped_by: string;
    kek_id: string;
    revoked_at: string | null;
    sealed_under: 'record' | 'connector';
  }>('SELECT id, kind, version, ciphertext, nonce, kdf, wrapped_by, kek_id, revoked_at, sealed_under FROM grant WHERE id = ?', args.id);

  if (!row) return no<SealedGrant>('OUT_OF_BOUNDS', `There is no grant ${args.id}.`, { at: 'id' });
  if (row.revoked_at)
    return no<SealedGrant>('GRANT_REVOKED', `${args.id} was revoked on ${row.revoked_at.slice(0, 10)}, and its bytes are gone.`, {
      at: 'id',
    });
  if (!row.ciphertext || !row.nonce)
    return no<SealedGrant>('GRANT_REVOKED', `${args.id} carries no sealed bytes.`, { at: 'id' });

  /* THE KEY THE BYTES WERE SEALED UNDER. A key added for a connector is sealed under the connector key, so its owner
     reading it back, or a scheduled `call` sending it, is handed that key and told so in `purpose`; handed the record
     key, the host's decrypt failed and read as the host's key store being wrong. */
  const key = sql.one<{
    wrapped: Uint8Array;
    nonce: Uint8Array;
    wrapped_by: string;
    kek_id: string | null;
    salt: Uint8Array | null;
  }>('SELECT wrapped, nonce, wrapped_by, kek_id, salt FROM vault_key WHERE purpose = ?', row.sealed_under);
  if (!key)
    return no<SealedGrant>('OUT_OF_BOUNDS', 'This BrainDog has no wrapped key, so nothing in it can be opened.', {
      at: 'id',
    });

  /* A ROTATED WRAPPING KEY READS AS `WRONG_KEY`, NEVER AS CORRUPTION. They look identical from
     inside a failed decrypt, and the difference is everything: one is "try the other key" and the
     other is "your credentials are gone". */
  /* THE CHECK IS NOT OPT-OUT. Omitting `kek_id` skipped it entirely, so the guard on a credential
     path was satisfied by not asking — which is the wrong default for anything, and this is the
     wrongest place for it. */
  /* AND A RECORD WITH NO `kek_id` IS NOT A RECORD THAT NEEDS NO KEY. The column is nullable and
     nothing validates it at provision, so a record wrapped by a KEK whose id was never written
     stored NULL — and `null !== (undefined ?? null)` is false, so `openGrant` with no key at all
     sailed past the guard and returned sealed bytes. That is the opt-out two lines up, arrived at
     through the check written to remove it: an empty string failed closed and only NULL failed
     open. A wrapping this record cannot name is a wrapping it cannot verify. */
  if (key.wrapped_by === 'kek' && (key.kek_id === null || key.kek_id === undefined))
    return no<SealedGrant>(
      'WRONG_KEY',
      'This BrainDog says it is wrapped by a key and does not say which one, so nothing can be opened until it does.',
      { at: 'kek_id' },
    );

  if (key.wrapped_by === 'kek' && key.kek_id !== (args.kek_id ?? null))
    return no<SealedGrant>(
      'WRONG_KEY',
      args.kek_id === undefined
        ? `This BrainDog is wrapped by ${key.kek_id}, and you offered no key.`
        : `This BrainDog is wrapped by ${key.kek_id}, and you offered ${args.kek_id}.`,
      { at: 'kek_id' },
    );

  return attempt(sql, transaction, () => {
    sql.exec('UPDATE grant SET opened = opened + 1, last_opened = ? WHERE id = ?', instant(deps.nowMs), args.id);
    event(sql, deps, 'grant.read', args.id, row.kind);
    return ok({
      id: row.id,
      version: row.version,
      ciphertext: row.ciphertext!,
      nonce: row.nonce!,
      kdf: row.kdf,
      wrapped_by: row.wrapped_by,
      kek_id: row.kek_id,
      /* `0x1F`, THE BYTE — not the character that looks like it in the spec. `12 §6` says in as
         many words "wherever this corpus writes ‖ it means that byte", and this line carried a
         literal U+2016: three bytes of UTF-8, `e2 80 96`, in the additional data that binds a grant
         to its record. Nothing decrypts a grant yet, which is exactly why it would have been found
         late — as an `OperationError` from `subtle.decrypt`, indistinguishable from a wrong key, on
         the first restore that crossed a host. */
      aad: `${deps.recordId ?? 'self'}\u001f${row.id}\u001f${row.version}`,
      key,
      purpose: row.sealed_under,
    });
  });
}

/* ── handing a credential to a runner ────────────────────────────────────── */

/**
 * What a leased runner is handed: the sealed credential and the wrapped key that opens it.
 *
 * BASE64 AND NOT BYTES, because this goes into an outbox payload, which is JSON, and then to a
 * runner that may be another process. `@braindog/connect` reads exactly these two shapes.
 */
export type LeasedSeal = {
  grant: { ciphertext: string; nonce: string; kek_id: string; grant_id: string; version: number };
  /**
   * `purpose` IS WHICH DATA KEY THIS IS, because the host unwraps it under an AAD that names its purpose and a wrong
   * guess is an `OperationError` indistinguishable from a wrong KEK. A connector's is always `connector`; a webhook's
   * signing key is whichever key sealed it, which for a key a person deposited is `record`.
   */
  dek: { wrapped: string; nonce: string; kek_id: string; purpose: 'record' | 'connector' };
};

/** The two jobs that send a key under their lease: a connector's pull, and a post that is signed. */
const SENDS_A_KEY = ['pull.fetch', 'notify.webhook'] as const;
type SendsAKey = (typeof SENDS_A_KEY)[number];

/**
 * Hand a credential to whoever is holding a live lease on the job that needs it.
 *
 * WHY THIS IS NOT `openGrant`. `openGrant` answers a PERSON: somebody on a screen pressed a button,
 * and the thing that authorises it is that they are a member who may. A connector run has nobody on
 * a screen. What authorises it is narrower and better: it is holding an unexpired lease on an
 * outbox row, and that row names the credential it may open. So the lease is the authorisation, and
 * it authorises exactly one credential for exactly as long as the lease lasts.
 *
 * THE LEASE IS CHECKED THREE WAYS, and each one is a different attack. The row must still be
 * `leased`, or a job that was finished is being replayed. `leased_until` must match what the caller
 * was handed, or the caller is holding a lease another host has since taken and renewed. And that
 * instant must still be in the future, or the lease has lapsed and the row is anybody's — which is
 * the same double-run a lease exists to prevent, except this one would also hand out a credential.
 *
 * AND THE ROW MUST NAME THE GRANT. Without this the whole thing collapses: a lease on any job would
 * open any credential in the keychain, and the narrow authorisation above would be a wide one wearing
 * its clothes.
 *
 * THE RECORD STILL NEVER DECRYPTS. Sealed bytes and a wrapped key go out, exactly as they do to a
 * person. The host unwraps, because the host is where the KEK is.
 *
 * AND A SIGNED POST IS THE SECOND JOB THAT MAY ASK. A `notify.webhook` whose payload names `grant` is a
 * digest whose POST is signed with that key (`09 §6`, `49 §5.12`), so the deliverer holding its lease
 * opens it here under the same three lease checks and the same payload check. It names the key by
 * label, and `test/keychain-webhook-grant.test.ts` holds what that changes.
 */
export function sealedGrant(
  sql: Sql,
  deps: KeychainDeps,
  args: { outbox: string; leasedUntil: string; grant: string },
  transaction: <T>(fn: () => T) => T,
): Result<LeasedSeal> {
  /* TWO KINDS AND NO MORE. A `notify.webhook` names the key that signs its body (`09 §6`, `digest.ts`), and this once
     read `kind = 'pull.fetch'` alone, so the one door a deliverer could open that key through answered "There is no
     connector job" and the post went unsigned. An email or a push names no key, and a lease on one opens nothing, which
     is the same refusal it always was. */
  const job = sql.one<{ kind: SendsAKey; state: string; leased_until: string | null; payload: string }>(
    `SELECT kind, state, leased_until, payload FROM outbox WHERE id = ? AND kind IN (${SENDS_A_KEY.map(() => '?').join(', ')})`,
    args.outbox,
    ...SENDS_A_KEY,
  );
  if (!job) return no<LeasedSeal>('OUT_OF_BOUNDS', `There is no connector job or signed post ${args.outbox}.`, { at: 'outbox' });
  if (job.state !== 'leased' || job.leased_until === null)
    return no<LeasedSeal>('PULL_LEASE_EDGE', `${args.outbox} is ${job.state}, not leased, so nothing is opened for it.`, {
      at: 'outbox',
    });
  if (job.leased_until !== args.leasedUntil)
    return no<LeasedSeal>(
      'PULL_LEASE_EDGE',
      `${args.outbox} was leased again since you took it, so this run is no longer the one holding it.`,
      { at: 'leasedUntil' },
    );
  if (Date.parse(job.leased_until) <= deps.nowMs)
    return no<LeasedSeal>(
      'PULL_LEASE_EDGE',
      `The lease on ${args.outbox} ran out at ${job.leased_until}. Take it again before opening anything.`,
      { at: 'leasedUntil' },
    );

  /* THE JOB NAMES THE CREDENTIAL, and this is the line that makes a lease narrow. A malformed
     payload names nothing, which refuses rather than matching anything. */
  let named: unknown;
  try {
    named = (JSON.parse(job.payload) as { grant?: unknown }).grant;
  } catch {
    named = undefined;
  }
  if (typeof named !== 'string' || named !== args.grant)
    return no<LeasedSeal>(
      'FORBIDDEN',
      `${args.outbox} does not send ${args.grant}, so holding it opens nothing.`,
      { at: 'grant' },
    );

  type Held = {
    id: string;
    kind: GrantKind;
    version: number;
    ciphertext: Uint8Array | null;
    nonce: Uint8Array | null;
    kek_id: string;
    revoked_at: string | null;
    sealed_under: 'record' | 'connector';
  };
  const COLUMNS = 'id, kind, version, ciphertext, nonce, kek_id, revoked_at, sealed_under';
  /* A POST NAMES ITS KEY BY LABEL AND A CONNECTOR BY ID. `09 §6` makes `webhook.grant` a keychain label and `digest.ts`
     copies it as written, so it resolves as `keyNamed` resolves a call's key: label or id, never a revoked grant,
     newest first and the tie on the id. Only when nothing live answers is a revoked row read, so the refusal can say
     the key was revoked rather than that it never existed.

     THE ORDER IS `grantChosen`'s, NOT A CLAUSE OF ITS OWN. `deb5b703` wrote `ORDER BY created_at DESC, id DESC` here
     twice, one commit before `grantChosen` said the order was written once, and a second copy is the one the next
     change to the chooser misses. Nor were the two one comparison: SQLite orders text by its UTF-8 bytes and the
     chooser by UTF-16 code units, so over two ids that tie on `created_at` and differ past U+FFFF the post signed with
     one key and a call naming the same label sent the other (`keychain-webhook-grant.test.ts`). No id the keychain mints
     reaches that, since `bindGrant` holds every id to `g_` and a ULID. The filter stays in SQL, as `liveNamed`'s does,
     and the revoked fallback asks the same chooser over the same rows read as if live, so the date the refusal names is
     that of the grant the order would have chosen.

     A CONNECTOR'S JOB IS READ THE SAME WAY, because a label reaches here too. The fire writes the id it resolved, but a
     job queued before the fire resolved names, or one a runner re-sent as the connector declared it, carries the label
     its `fetch.auth.grant` says, and read by id alone it was refused as a key that does not exist. An id still finds
     exactly its own row, since the chooser matches on the id as well as the label. */
  const row = ((): Held | undefined => {
    const named = sql.all<Held & GrantChoosable>(`SELECT ${COLUMNS}, label, created_at FROM grant WHERE label = ? OR id = ?`, args.grant, args.grant);
    const chosen = grantChosen(named, args.grant) ?? grantChosen(named.map((g) => ({ ...g, revoked_at: null })), args.grant);
    return chosen === undefined ? undefined : named.find((g) => g.id === chosen.id);
  })();
  if (!row)
    return no<LeasedSeal>(
      'OUT_OF_BOUNDS',
      job.kind === 'notify.webhook'
        ? `There is no key "${args.grant}" in the keychain, so the post it signs is not sent.`
        : `There is no grant ${args.grant}.`,
      { at: 'grant' },
    );
  /* REVOKED BETWEEN THE FIRE AND THE RUN is the ordinary case, not an exotic one: a person revokes a
     key precisely when they have decided the thing using it should stop. */
  if (row.revoked_at)
    return no<LeasedSeal>('GRANT_REVOKED', `${args.grant} was revoked on ${row.revoked_at.slice(0, 10)}.`, { at: 'grant' });
  if (!row.ciphertext || !row.nonce)
    return no<LeasedSeal>('GRANT_REVOKED', `${args.grant} carries no sealed bytes.`, { at: 'grant' });
  /* SEALED UNDER THE RECORD KEY IS NOT SEALED FOR A RUNNER. This function hands back the connector
     DEK, and pairing it with bytes the record key sealed is a decrypt that throws several layers
     away in the host, with nothing here saying why. It is also the more important half: a
     credential a person deposited to open on a screen, with themselves present, is not one a
     scheduled run may have. Re-seal it under the connector key; nothing else converts it. */
  if (job.kind === 'pull.fetch' && row.sealed_under !== 'connector')
    return no<LeasedSeal>(
      'OUT_OF_BOUNDS',
      `${args.grant} was added for a person to use, not for a connector. Replace its value on the Keys screen with "For a scheduled connector" on, and the next run opens it.`,
      { at: 'grant' },
    );

  /* THE CONNECTOR DEK, NOT THE RECORD'S. `12 §6` keeps them apart so that what a connector run can
     open is only ever a connector's credential, even if a runner were compromised outright.

     A SIGNED POST GETS THE KEY ITS GRANT WAS SEALED UNDER. A digest is `paged: false` in `digestEgress`, so its
     approval takes a key a person deposited at the keychain door, and that key is sealed `record`. The key that door
     opens for a scheduled `call` is the same record key (`keyOpener`, `openGrant`), so this hands out nothing a
     scheduled run could not already open, and it hands it out under a lease on the one post that names it. Refusing
     it here would be a digest that was approved and dead-letters on its first post. */
  const purpose: 'record' | 'connector' = job.kind === 'pull.fetch' ? 'connector' : row.sealed_under;
  const dek = sql.one<{ wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null }>(
    'SELECT wrapped, nonce, wrapped_by, kek_id FROM vault_key WHERE purpose = ?',
    purpose,
  );
  if (!dek)
    return no<LeasedSeal>(
      'OUT_OF_BOUNDS',
      purpose === 'connector'
        ? 'This BrainDog has no connector key, so a connector cannot open anything.'
        : 'This BrainDog has no record key, so the key that signs this post cannot be opened.',
      { at: 'grant' },
    );
  /* A CONNECTOR KEY IS ALWAYS WRAPPED BY A KEK (ADR-052), so a passphrase here is a record whose
     connector key nobody can supply without a person present, which is the one thing a scheduled
     run does not have. Say so rather than hand out bytes no runner can open.

     A RECORD KEY CAN BE BEHIND A PASSPHRASE, and a signed post is refused by the key it asked for. This sentence said
     "connector key" for both, so an owner whose digest dead-lettered here was sent to a connector the post never used. */
  if (dek.wrapped_by !== 'kek' || !dek.kek_id)
    return no<LeasedSeal>(
      'WRONG_KEY',
      purpose === 'connector'
        ? 'This BrainDog’s connector key is not held by a key this host can use, so scheduled runs cannot open it.'
        : 'This BrainDog’s own key is behind a passphrase or a key this host cannot use, so the key that signs this post cannot be opened without a person present.',
      { at: 'kek_id' },
    );

  return attempt(sql, transaction, () => {
    /* A RUN IS A READING. `opened` answers "is this credential actually used", and a count that left
       out every automated use would answer it wrongly for exactly the credentials that are. */
    sql.exec('UPDATE grant SET opened = opened + 1, last_opened = ? WHERE id = ?', instant(deps.nowMs), row.id);
    event(sql, deps, 'grant.read', row.id, row.kind);
    return ok({
      grant: {
        ciphertext: base64(row.ciphertext!),
        nonce: base64(row.nonce!),
        kek_id: row.kek_id,
        grant_id: row.id,
        version: row.version,
      },
      dek: { wrapped: base64(dek.wrapped), nonce: base64(dek.nonce), kek_id: dek.kek_id!, purpose },
    });
  });
}

/**
 * Take a grant out of service, and destroy the bytes.
 *
 * THE ROW STAYS AND THE CIPHERTEXT GOES. What the key opened is a fact worth keeping — "this used to
 * reach the production database" is the sentence somebody needs a year later — and the sealed value
 * is the thing that must not survive. Both prior versions go too: a revocation that left the
 * previous copy behind would be a revocation in name.
 */
export function revokeGrant(sql: Sql, deps: KeychainDeps, id: string, transaction: <T>(fn: () => T) => T): Result<null> {
  return attempt(sql, transaction, () => {
    const row = sql.one<{ kind: GrantKind }>('SELECT kind FROM grant WHERE id = ? AND revoked_at IS NULL', id);
    if (!row)
      return sql.one('SELECT 1 AS x FROM grant WHERE id = ?', id)
        ? no<null>('GRANT_REVOKED', `${id} was already revoked.`, { at: 'id' })
        : no<null>('OUT_OF_BOUNDS', `There is no grant ${id}.`, { at: 'id' });

    sql.exec(
      'UPDATE grant SET ciphertext = NULL, nonce = NULL, prev_ciphertext = NULL, prev_nonce = NULL, revoked_at = ? WHERE id = ?',
      instant(deps.nowMs),
      id,
    );
    /* And the reminders it derived, because a rotation reminder about a revoked credential is a
       notification asking somebody to do something that cannot be done. */
    sql.exec(
      "DELETE FROM schedule WHERE kind = 'rotate' AND state = 'pending' AND key IN (?, ?)",
      `grant:${id}`,
      `grant:${id}:expires`,
    );
    event(sql, deps, 'grant.revoke', id, row.kind);
    return ok(null);
  });
}

/**
 * Hold a key whose keychain entry names no host to the host an approved action sends it to, from now on.
 *
 * THE APPROVAL THAT FIRST USES IT WRITES THE HOST, and nothing later can. An entry whose `opens` was "the Oxbow
 * test account" opened no host, so the host had nothing to hold the key to; once an approval sends it to
 * `oxbow.example`, `opens` says `oxbow.example` and the executor refuses every other host with "This key opens
 * oxbow.example only." An entry that already names a host is left as it is, whichever host this names, so a pin never
 * moves a key: answering `pinned: false` says nothing was written.
 *
 * NOTHING SECRET IS READ OR WRITTEN: the label, the row's `opens` and the host. The words the person typed are replaced
 * by the host, which is what they meant once an action sends the key there. The event is `grant.bind`, the key bound to
 * a host (the record has forty kinds and no forty-first), and says the id and the kind, as every keychain event does, and
 * never the label or what it opens.
 */
export function pinHost(
  sql: Sql,
  label: string,
  host: string,
  nowMs: number,
  actor = 'system',
): Result<{ id: string; host: string; pinned: boolean }> {
  const to = heldHost(host);
  if (to === null) return no('VALUE_MALFORMED', `"${host}" is not a host a key can be held to. Name the host the action calls.`, { at: 'host' });
  const live = sql.all<{ id: string; label: string; opens: string; kind: GrantKind; revoked_at: string | null; created_at: string }>(
    'SELECT id, label, opens, kind, revoked_at, created_at FROM grant WHERE (label = ? OR id = ?) AND revoked_at IS NULL',
    label,
    label,
  );
  const row = grantChosen(live, label);
  if (row === undefined) return no('REQUIRED_MISSING', `There is no key called "${label}" to hold to ${to}. Add it to the keychain first.`, { at: 'label' });
  const held = heldHost(row.opens);
  if (held !== null) return ok({ id: row.id, host: held, pinned: false });
  sql.exec('UPDATE grant SET opens = ? WHERE id = ? AND revoked_at IS NULL', to, row.id);
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'grant.bind', ?, 'grant', ?)",
    ulids(() => nowMs)(),
    instant(nowMs),
    actor,
    `grant:${row.id}`,
    `${row.id} ${row.kind}`,
  );
  return ok({ id: row.id, host: to, pinned: true });
}

/**
 * A `rotate` row firing: say that a credential is due, without saying which one it is.
 *
 * `credential g_01J… (api_token) is due for rotation` — the id and the kind, never the label and
 * never what it opens. A notification that names "Stripe, live" is a notification that tells
 * whoever can see it exactly which credential is worth taking.
 */
export function rotateDue(sql: Sql, deps: KeychainDeps, payload: string): number | null {
  /* `urgent` WAS DESTRUCTURED AWAY. `bindGrant` arms this row forty-eight hours before a credential
     expires and writes `{ grant, urgent: true }` — 09 §5 names an expiring credential as one of the
     three things urgent BY DEFAULT — and this read only `{ grant }`. So the record wrote a `note`
     event about a key that stops working the day after tomorrow, and nothing left the record. */
  const { grant, urgent } = JSON.parse(payload) as { grant?: string; urgent?: boolean };
  if (!grant) return null;
  const row = sql.one<{ kind: GrantKind; rotate_every: string | null; revoked_at: string | null }>(
    'SELECT kind, rotate_every, revoked_at FROM grant WHERE id = ?',
    grant,
  );
  /* A GRANT THAT IS GONE IS NOT REMINDED ABOUT. Same rule as a reminder whose row was deleted: the
     thing the reminder is about is not true any more, and firing it anyway is the failure the whole
     derived-reminder design exists to avoid. */
  if (!row || row.revoked_at) return null;

  /* THE ID AND THE KIND, NEVER THE LABEL. A notification naming "Stripe, live" tells whoever can see
     it exactly which credential is worth taking — and an urgent one is read on a lock screen. */
  const say = `credential ${grant} (${row.kind}) is due for rotation`;
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, 'system', 'note', ?, 'grant', ?)",
    deps.mint(),
    instant(deps.nowMs),
    `grant:${grant}`,
    say,
  );

  if (urgent) deps.interrupt({ actor: `grant:${grant}`, say, url: '/vault' });

  const span = row.rotate_every ? spanMs(row.rotate_every) : null;
  return span === null ? null : deps.nowMs + span;
}

/* ── the keychain password: the record's own key behind a second factor ──── */

/**
 * How the record's own key is wrapped now, as a host needs it to open or re-wrap that key. Never the key.
 *
 * ONLY THE `record` ROW. A passphrase guards the key a person's credentials are sealed under, and nothing else:
 * the connector key stays on the root key because a scheduled run has nobody there to type anything (ADR-052), and
 * the signing key stays on it because the nightly copy is signed with nobody there either (`12 §6`).
 *
 * `beside` IS THE ROOT KEY THE RECORD'S OTHER KEYS ARE WRAPPED UNDER, or `null` when none names one. A host taking
 * the passphrase off wraps the record key under that one while it still holds it, so the record never names two root
 * keys at once, which is the state `api/keys.ts` refuses to leave behind and `openGrant` would answer `WRONG_KEY` to.
 */
export type RecordWrapping = {
  wrapped: Uint8Array;
  nonce: Uint8Array;
  wrapped_by: 'kek' | 'passphrase';
  kek_id: string | null;
  salt: Uint8Array | null;
  beside: string | null;
};

/** One sealed value as `openGrant` would hand it out: the bytes, their nonce, and the additional data they open with. */
export type SealedValue = { ciphertext: Uint8Array; nonce: Uint8Array; aad: string };

/**
 * One grant whose bytes the record key may have sealed, handed to the host that replaces the key.
 *
 * `current` IS THE VALUE IN USE, when the record key sealed it (`sealed_under = 'record'`); a connector's is sealed under
 * the connector key, which no passphrase reaches, and is `null` here. `prev` IS THE ONE PRIOR VERSION, whichever key
 * sealed it, because `sealed_under` moves with the bytes: a key turned into a connector's can still hold a prior version
 * the record key sealed. The host re-seals what the old key opens and leaves the rest. `label` is for the one sentence
 * that names a key the old key does not open; `sealed_under` is for the compare-and-set, and the host does not read it.
 */
export type SealedUnderRecord = {
  id: string;
  label: string;
  version: number;
  sealed_under: 'record' | 'connector';
  current: SealedValue | null;
  prev: SealedValue | null;
};

/** What a host hands back for one grant: its value and its prior version sealed again under the new key, each `null` when left as it was. */
export type Resealed = {
  id: string;
  current: { ciphertext: Uint8Array; nonce: Uint8Array } | null;
  prev: { ciphertext: Uint8Array; nonce: Uint8Array } | null;
};

/**
 * One re-wrap of the record's key, as a host made it: under a key derived from the passphrase, with the salt it was
 * derived with, or back under a root key, with that key's id.
 *
 * PUTTING THE PASSPHRASE ON MAKES A NEW KEY (`rewrapRecordKey`), so that change carries every value the old key sealed,
 * sealed again under the new one (`resealed`). Absent reads as none, which is right only for a keychain with nothing in
 * it, and `rewrapRecordKey` refuses it anywhere else. Taking it off keeps the key, and carries nothing.
 *
 * THE SAME TWO SHAPES `packages/host/src/passphrase.ts` BUILDS, written out again here because the kernel may not
 * import the host. The step reaches the record's method through `withKeychainPassphrase`, which types it loosely, so no
 * compiler holds the two copies together: `rewrapRecordKey` checks every field it writes before it writes it.
 */
export type WrappingChange =
  | { to: 'passphrase'; wrapped: Uint8Array; nonce: Uint8Array; salt: Uint8Array; resealed?: readonly Resealed[] }
  | { to: 'kek'; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };

/** PBKDF2's salt, `12 §6`: sixteen random bytes, held in `vault_key.salt` beside the one wrapping it salts. */
export const PASSPHRASE_SALT_BYTES = 16;

/**
 * Wrong passphrases compared before the keychain waits, and how long it waits: the limits sign-in keeps for a wrong
 * key or link (`dir_fail`, whose strikes and `WINDOW` are bound in `packages/record/src/identity.ts`).
 *
 * THE RECORD'S OWN `auth_fail`, NOT THE DIRECTORY'S, because the record is the one place both hosts can count in the
 * same object as the compare, and the Directory is another object on the Cloud. `auth_fail` is a local table, so the
 * count never travels in an export.
 */
export const PASSPHRASE_TRIES = 10;
export const PASSPHRASE_WAIT_MS = 15 * 60_000;

/** The one `auth_fail` key a passphrase is counted under. */
const STRIKES = 'keychain:passphrase';

/**
 * One strike reserved, before anything is compared: the first opens a window of `PASSPHRASE_WAIT_MS`, and the strike
 * past `PASSPHRASE_TRIES` locks the keychain for that long from then. The count stops one past the limit, so waiting out a lock
 * is never pushed further away by asking again. `?1` the key, `?2` now plus the wait, `?3` the tries.
 */
const RESERVE = `INSERT INTO auth_fail (key, n, until) VALUES (?1, 1, ?2)
ON CONFLICT (key) DO UPDATE SET
  n     = MIN(n + 1, ?3 + 1),
  until = CASE WHEN n = ?3 THEN ?2 ELSE until END
RETURNING n, until`;

/** The record key's wrapping, or `null` for a record made before its host had a key store. */
export function recordWrapping(sql: Sql): RecordWrapping | null {
  const row = sql.one<{ wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: string; kek_id: string | null; salt: Uint8Array | null }>(
    "SELECT wrapped, nonce, wrapped_by, kek_id, salt FROM vault_key WHERE purpose = 'record'",
  );
  if (!row) return null;
  const beside =
    sql.one<{ kek_id: string }>(
      "SELECT kek_id FROM vault_key WHERE purpose <> 'record' AND wrapped_by = 'kek' AND kek_id IS NOT NULL ORDER BY purpose LIMIT 1",
    )?.kek_id ?? null;
  return {
    wrapped: row.wrapped,
    nonce: row.nonce,
    wrapped_by: row.wrapped_by === 'passphrase' ? 'passphrase' : 'kek',
    kek_id: row.kek_id ?? null,
    salt: row.salt ?? null,
    beside,
  };
}

const bytesOf = (x: unknown, length?: number): boolean =>
  x instanceof Uint8Array && x.length > 0 && (length === undefined || x.length === length);

/**
 * Every value the record key may have sealed, for a host about to replace that key: each live grant's value when the
 * record key sealed it, and each live grant's one prior version, with the additional data each opens with.
 *
 * THE ADDITIONAL DATA IS `openGrant`'S, `record ‖ grant ‖ version`, and the prior version's names the version before,
 * which is the one it was sealed at: a rotation moves the bytes across and counts up by one (`bindGrant`, `keepRotated`).
 * A revoked grant holds no bytes (`revokeGrant`), and a value without its nonce opens nowhere, so neither is here.
 */
export function sealedUnderRecord(sql: Sql, recordId: string | null): SealedUnderRecord[] {
  const aad = (id: string, version: number): string => `${recordId ?? 'self'}\u001f${id}\u001f${version}`;
  return sql
    .all<{
      id: string;
      label: string;
      version: number;
      sealed_under: 'record' | 'connector';
      ciphertext: Uint8Array | null;
      nonce: Uint8Array | null;
      prev_ciphertext: Uint8Array | null;
      prev_nonce: Uint8Array | null;
    }>(
      `SELECT id, label, version, sealed_under, ciphertext, nonce, prev_ciphertext, prev_nonce FROM grant
        WHERE revoked_at IS NULL
          AND ((sealed_under = 'record' AND ciphertext IS NOT NULL AND nonce IS NOT NULL)
            OR (prev_ciphertext IS NOT NULL AND prev_nonce IS NOT NULL))
        ORDER BY id`,
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      version: Number(row.version),
      sealed_under: row.sealed_under,
      current:
        row.sealed_under === 'record' && row.ciphertext !== null && row.nonce !== null
          ? { ciphertext: row.ciphertext, nonce: row.nonce, aad: aad(row.id, Number(row.version)) }
          : null,
      prev:
        row.prev_ciphertext !== null && row.prev_nonce !== null
          ? { ciphertext: row.prev_ciphertext, nonce: row.prev_nonce, aad: aad(row.id, Number(row.version) - 1) }
          : null,
    }));
}

/** The live grants whose value the record key sealed: what a new record key must have sealed again, every one. */
const RECORD_SEALED = "SELECT count(*) AS n FROM grant WHERE revoked_at IS NULL AND sealed_under = 'record' AND ciphertext IS NOT NULL AND nonce IS NOT NULL";

/** A host's re-sealed values, checked against what it was handed, or the sentence saying what is wrong with them. */
function resealedOf(change: unknown, sealed: readonly SealedUnderRecord[]): Resealed[] | string {
  const given = (change as { resealed?: unknown }).resealed ?? [];
  if (!Array.isArray(given)) return 'The keys sealed again under the new key come as a list.';
  const handed = new Map(sealed.map((one) => [one.id, one]));
  const seen = new Set<string>();
  const pair = (x: unknown): boolean => {
    const p = x as { ciphertext?: unknown; nonce?: unknown };
    return typeof x === 'object' && x !== null && bytesOf(p.ciphertext) && bytesOf(p.nonce);
  };
  for (const one of given as unknown[]) {
    const r = one as Partial<Resealed>;
    const was = typeof r?.id === 'string' ? handed.get(r.id) : undefined;
    if (was === undefined || seen.has(was.id)) return 'Each key sealed again is one the host was handed, once.';
    if (r.current !== null && (was.current === null || !pair(r.current))) return 'A key sealed again carries its bytes and their nonce, and only for a value the old key sealed.';
    if (r.prev !== null && (was.prev === null || !pair(r.prev))) return 'A prior version sealed again carries its bytes and their nonce, and only where there was one.';
    seen.add(was.id);
  }
  /* EVERY VALUE THE OLD KEY SEALED, OR NONE IS WRITTEN: one left behind would open under nothing the record keeps. */
  const again = new Set((given as Resealed[]).filter((r) => r.current !== null).map((r) => r.id));
  if (sealed.some((one) => one.current !== null && !again.has(one.id))) return 'The host did not seal every key again under the new key.';
  return given as Resealed[];
}

/**
 * Swap the record key's one wrapping for the one a host made, in one transaction with one `grant.rotate` event, and
 * when the passphrase goes on, every value the old key sealed for the same values sealed under the new one.
 *
 * EXACTLY ONE WRAPPING, BEFORE AND AFTER (`12 §6`, "the optional second factor"). The row the root key could open is
 * overwritten by the row only the passphrase opens, in the statement that writes it, so from the commit on there is
 * no copy in the record that the operator's key opens. Taking the passphrase off is the same statement the other way.
 *
 * PUTTING IT ON IS A NEW KEY, NOT ONLY A NEW WRAPPING. A copy of the record taken before (a nightly copy, a restore point,
 * an export) holds the old key wrapped under the root key, and with that key every value sealed after the change would
 * open, if it were the same key. So the host makes a new key, opens every value in `sealed` under the old one and seals
 * it again under the new, and hands back the new key wrapped under the passphrase with the values (`resealed`). They are
 * written here with the wrapping or not at all: from the commit on, nothing in the record opens under the old key, and
 * nothing sealed afterwards ever will. Taking the passphrase off keeps the key it was put on with, wrapped again under
 * the root key, so it carries no values; changing the passphrase is taking it off and putting it on, which is a new key.
 *
 * A COMPARE-AND-SET ON THE VERY WRAPPING THE HOST WAS HANDED, inside the transaction that sets it: how it was wrapped
 * and the nonce it was wrapped with (`heldNonce`, from `recordWrapping`). The host re-wrapped the key it was handed
 * and awaited its own crypto in between, so a second change that landed first leaves the row as that change left it,
 * and this one is answered as a conflict to be asked again. The nonce is in the compare because every wrapping draws a
 * new one: a slow change made against an old passphrase would otherwise still see `wrapped_by = 'passphrase'` after
 * that passphrase was taken off and a new one put on, and take the new one off.
 *
 * AND ONE ON EVERY VALUE, for the same await. Each is written only while its grant is still at the version, the key and
 * the nonce it was handed at, and once they are written no value of the record key's may be left that this change did
 * not seal: a key put away, replaced or revoked while the host worked is a conflict, and nothing is written. A deposit
 * that sealed under the old key and binds after this commits is the other half, refused by its own `sealed_for`.
 */
export function rewrapRecordKey(
  sql: Sql,
  deps: Pick<KeychainDeps, 'mint' | 'nowMs' | 'actor'>,
  change: WrappingChange,
  heldNonce: Uint8Array,
  transaction: <T>(fn: () => T) => T,
  sealed: readonly SealedUnderRecord[] = [],
): Result<{ wrapped_by: 'kek' | 'passphrase' }> {
  type Done = { wrapped_by: 'kek' | 'passphrase' };
  if (!bytesOf(change.wrapped) || !bytesOf(change.nonce))
    return no<Done>('VALUE_MALFORMED', 'A re-wrapped key carries its wrapped bytes and their nonce, as bytes.', { at: 'wrapped' });
  if (change.to === 'passphrase' && !bytesOf(change.salt, PASSPHRASE_SALT_BYTES))
    return no<Done>('VALUE_MALFORMED', `A key wrapped under a passphrase carries the ${PASSPHRASE_SALT_BYTES}-byte salt it was derived with.`, { at: 'salt' });
  if (change.to === 'kek' && (typeof change.kek_id !== 'string' || change.kek_id === ''))
    return no<Done>('VALUE_MALFORMED', 'A key wrapped under a root key names that key by its id.', { at: 'kek_id' });
  /* TAKING IT OFF KEEPS THE KEY. Values sealed again under some other key, written beside a wrapping of this one, would
     open under nothing the record holds, so a change that carries them is refused rather than half applied. */
  if (change.to === 'kek' && (change as { resealed?: unknown }).resealed !== undefined)
    return no<Done>('VALUE_MALFORMED', 'Taking the passphrase off keeps the key it was put on with, so nothing is sealed again.', { at: 'resealed' });
  const resealed = change.to === 'passphrase' ? resealedOf(change, sealed) : [];
  if (typeof resealed === 'string') return no<Done>('VALUE_MALFORMED', `${resealed} Nothing was changed.`, { at: 'resealed' });

  const from = change.to === 'passphrase' ? 'kek' : 'passphrase';
  const at = instant(deps.nowMs);
  return attempt(sql, transaction, () => {
    const moved = sql.all<{ purpose: string }>(
      `UPDATE vault_key SET wrapped = ?, nonce = ?, wrapped_by = ?, kek_id = ?, salt = ?, rewrapped_at = ?
        WHERE purpose = 'record' AND wrapped_by = ? AND nonce = ?
        RETURNING purpose`,
      change.wrapped,
      change.nonce,
      change.to,
      change.to === 'kek' ? change.kek_id : null,
      change.to === 'passphrase' ? change.salt : null,
      at,
      from,
      heldNonce,
    );
    if (moved.length === 0) {
      const now = sql.one<{ wrapped_by: string }>("SELECT wrapped_by FROM vault_key WHERE purpose = 'record'");
      const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = 'vault_key:record' ORDER BY rowid DESC LIMIT 1");
      return clash<Done>(0, { wrapped_by: now?.wrapped_by ?? null }, by?.actor ?? 'system');
    }

    if (change.to === 'passphrase') {
      /* A KEY THAT MOVED WHILE THE HOST WORKED is somebody else's change, and the one who made it is named. */
      const raced = (): Result<Done> => {
        const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target_kind = 'grant' ORDER BY rowid DESC LIMIT 1");
        return clash<Done>(0, { wrapped_by: from }, by?.actor ?? 'system');
      };
      const handed = new Map(sealed.map((one) => [one.id, one]));
      for (const r of resealed) {
        const was = handed.get(r.id);
        if (was === undefined) return raced();
        const sets: string[] = [];
        const values: Uint8Array[] = [];
        const held: Uint8Array[] = [];
        let compare = '';
        if (r.current !== null && was.current !== null) {
          sets.push('ciphertext = ?', 'nonce = ?');
          values.push(r.current.ciphertext, r.current.nonce);
          compare += ' AND nonce = ?';
          held.push(was.current.nonce);
        }
        if (r.prev !== null && was.prev !== null) {
          sets.push('prev_ciphertext = ?', 'prev_nonce = ?');
          values.push(r.prev.ciphertext, r.prev.nonce);
          compare += ' AND prev_nonce = ?';
          held.push(was.prev.nonce);
        }
        if (sets.length === 0) continue;
        const hit = sql.all<{ id: string }>(
          `UPDATE grant SET ${sets.join(', ')}
            WHERE id = ? AND version = ? AND sealed_under = ? AND revoked_at IS NULL${compare}
            RETURNING id`,
          ...values,
          was.id,
          was.version,
          was.sealed_under,
          ...held,
        );
        if (hit.length === 0) return raced();
      }
      /* NONE OF THE OLD KEY'S LEFT: as many live values sealed under the record key as this change sealed again. */
      const left = Number(sql.one<{ n: number }>(RECORD_SEALED)?.n ?? 0);
      if (left !== resealed.filter((r) => r.current !== null).length) return raced();
    }

    /* A KIND THAT EXISTS: `grant.rotate`, on the record key, saying which wrapping it left and which it went to, and
       when the key is new, how many keys were sealed again under it. The salt, the bytes and the keys' names are not in
       it, because the event log is read by more people than the keychain is. */
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, 'grant.rotate', 'vault_key:record', 'vault_key', 'wrapped_by', ?, ?, ?)",
      deps.mint(),
      at,
      deps.actor,
      from,
      change.to,
      change.to === 'passphrase' ? `a new key, ${resealed.length} sealed again` : null,
    );
    return ok<Done>({ wrapped_by: change.to });
  });
}

/**
 * Reserve one strike before a passphrase is compared: the whole seconds to wait while the keychain is locked, or `null`
 * to go on and compare.
 *
 * RESERVED BEFORE THE COMPARE, AS SIGN-IN DOES, so a compare that is never reported back still counted. A right
 * passphrase clears the count (`passphraseCleared`); a request refused for another reason before anything was compared
 * hands its strike back (`passphraseRefund`). FAIL CLOSED: a count that cannot be read or written locks for the whole
 * wait, because a limit that stops when its table misbehaves is a limit anybody can switch off.
 */
export function passphraseStrike(sql: Sql, nowMs: number): number | null {
  try {
    sql.exec('DELETE FROM auth_fail WHERE key = ? AND until <= ?', STRIKES, instant(nowMs));
    const row = sql.one<{ n: number; until: string }>(RESERVE, STRIKES, instant(nowMs + PASSPHRASE_WAIT_MS), PASSPHRASE_TRIES);
    if (!row) return Math.ceil(PASSPHRASE_WAIT_MS / 1000);
    return Number(row.n) > PASSPHRASE_TRIES ? Math.max(1, Math.ceil((Date.parse(row.until) - nowMs) / 1000)) : null;
  } catch {
    return Math.ceil(PASSPHRASE_WAIT_MS / 1000);
  }
}

/** The passphrase was right: the count starts again from nothing. */
export function passphraseCleared(sql: Sql): void {
  sql.exec('DELETE FROM auth_fail WHERE key = ?', STRIKES);
}

/** Nothing was compared after all: the strike reserved for it is handed back, and a lock is never lifted by it. */
export function passphraseRefund(sql: Sql): void {
  sql.exec('UPDATE auth_fail SET n = n - 1 WHERE key = ? AND n > 0 AND n <= ?', STRIKES, PASSPHRASE_TRIES);
}

/* ── the small parts ─────────────────────────────────────────────────────── */

/**
 * Bytes as base64, with padding.
 *
 * STANDARD ALPHABET AND NOT base64url, and it does not matter which: `unb64url` on the other side
 * accepts either alphabet and either padding, on purpose, because a store may hold either. Written
 * in a chunk rather than one `String.fromCharCode(...bytes)` because a spread of a large ciphertext
 * is a stack overflow, and a credential is exactly the kind of value that is large once.
 */
function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const SPAN = /^(\d{1,4})([dwmy])$/;

/** `90d`, `12w`, `1y` as milliseconds. `null` when it is not a span, which is a refusal. */
export function spanMs(text: string): number | null {
  const m = SPAN.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const DAY = 86_400_000;
  return n * (m[2] === 'd' ? DAY : m[2] === 'w' ? 7 * DAY : m[2] === 'm' ? 30 * DAY : 365 * DAY);
}

/** A day or an instant as milliseconds, measured at noon so a timezone cannot move a date by one. */
const dayMs = (text: string): number => Date.parse(text.length === 10 ? `${text}T12:00:00Z` : text);

/** One schedule row, through the same `ON CONFLICT` every other insertion uses. */
function arm(sql: Sql, deps: KeychainDeps, key: string, dueMs: number, payload: unknown): void {
  /* A DATE ALREADY PAST IS STILL ARMED. A credential that expired last week is more urgent than one
     expiring next month, not less — and dropping it is how a lapsed key goes unmentioned. */
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'rotate', ?, ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
    deps.mint(),
    instant(dueMs),
    key,
    JSON.stringify(payload),
  );
}

/** The id and the kind. Never the label, never what it opens. */
function event(sql: Sql, deps: KeychainDeps, kind: string, id: string, grantKind: GrantKind): void {
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, ?, ?, 'grant', ?)",
    deps.mint(),
    instant(deps.nowMs),
    deps.actor,
    kind,
    `grant:${id}`,
    `${id} ${grantKind}`,
  );
}

/* ── keychain access: which machine may open which key, and the asks waiting on the owner ── */

/**
 * What one key says to one machine (migration 46): open it, ask the owner first, or refuse it.
 *
 * NO ROW IS `always`, AND THAT IS TODAY'S BEHAVIOUR. A key nobody set a rule on opens for every keychain grant that
 * reaches it, exactly as every key did before keychain access existed, so an installed CLI on such a key sees nothing new.
 */
export const KEY_RULES = ['always', 'ask', 'deny'] as const;
export type KeyRule = (typeof KEY_RULES)[number];

/** The owner's three answers to an ask: this once, from now on (which writes the machine's rule), or not this time. */
export const KEY_ANSWERS = ['once', 'always', 'deny'] as const;
export type KeyAnswer = (typeof KEY_ANSWERS)[number];

/** The machine a key's own default is kept under. A handle is sixteen hex characters, so it is never this. */
export const EVERY_MACHINE = '*';

/**
 * How long an ask waits for the owner, and how long a `once` answer waits to be spent.
 *
 * TEN MINUTES, LONGER THAN THE CLI WAITS. The CLI gives up after two, and an owner who answers at minute five has
 * still allowed the next try, which then opens without asking again.
 */
export const KEY_ASK_LIFE_MS = 10 * 60_000;

/** How long an answered or spent ask is kept before it is cleared away: a week, enough for the screen's recent asks. */
const KEY_ASK_KEPT_MS = 7 * 86_400_000;

export type KeyAccessRow = { credential: string; machine: string; rule: KeyRule; set_by: string; set_at: string };
export type KeyAskStatus = 'pending' | 'once' | 'always' | 'denied' | 'used';
export type KeyAskRow = {
  id: string;
  credential: string;
  machine: string;
  run: string | null;
  status: KeyAskStatus;
  asked_at: string;
  expires: string;
  answered_by: string | null;
  answered_at: string | null;
};

const ASK_COLUMNS = 'id, credential, machine, run, status, asked_at, expires, answered_by, answered_at';

/** The rule that holds for one key and one machine: the machine's own row, else the key's `*` row, else `always`. */
export function keyRule(sql: Sql, credential: string, machine: string): KeyRule {
  const row = sql.one<{ rule: KeyRule }>(
    "SELECT rule FROM key_access WHERE credential = ? AND machine IN (?, '*') ORDER BY machine = '*' LIMIT 1",
    credential,
    machine,
  );
  return row?.rule ?? 'always';
}

/** Every rule set, or every rule on one key, the key's default first and then each machine by handle. */
export function keyAccessRows(sql: Sql, credential?: string): KeyAccessRow[] {
  return credential === undefined
    ? sql.all<KeyAccessRow>("SELECT credential, machine, rule, set_by, set_at FROM key_access ORDER BY credential, machine <> '*', machine")
    : sql.all<KeyAccessRow>("SELECT credential, machine, rule, set_by, set_at FROM key_access WHERE credential = ? ORDER BY machine <> '*', machine", credential);
}

/**
 * Set one key's rule for one machine, or its default with `*`, or with `null` take the row away (the machine then
 * follows the key's default, and the default `always`). The caller has checked who may and that the key is there.
 */
export function setKeyAccess(sql: Sql, deps: KeychainDeps, args: { credential: string; machine: string; rule: KeyRule | null }): KeyAccessRow | null {
  if (args.rule === null) {
    sql.exec('DELETE FROM key_access WHERE credential = ? AND machine = ?', args.credential, args.machine);
    return null;
  }
  const at = instant(deps.nowMs);
  sql.exec(
    `INSERT INTO key_access (credential, machine, rule, set_by, set_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (credential, machine) DO UPDATE SET rule = excluded.rule, set_by = excluded.set_by, set_at = excluded.set_at`,
    args.credential,
    args.machine,
    args.rule,
    deps.actor,
    at,
  );
  return { credential: args.credential, machine: args.machine, rule: args.rule, set_by: deps.actor, set_at: at };
}

/** The asks still waiting on the owner, newest first; with `recent`, every ask of the last week as well. */
export function keyAsks(sql: Sql, nowMs: number, recent = false): KeyAskRow[] {
  return recent
    ? sql.all<KeyAskRow>(`SELECT ${ASK_COLUMNS} FROM key_ask WHERE asked_at > ? ORDER BY asked_at DESC, id DESC`, instant(nowMs - KEY_ASK_KEPT_MS))
    : sql.all<KeyAskRow>(`SELECT ${ASK_COLUMNS} FROM key_ask WHERE status = 'pending' AND expires > ? ORDER BY asked_at DESC, id DESC`, instant(nowMs));
}

/** What one machine's open of one key came to: it may open, or it was refused (the ask filed, waiting, or denied). */
export type KeyGate = { open: true } | { open: false; refusal: { code: string; fix: string; at: string } };

/** The one sentence an agent waiting on the owner reads, on the first ask and on every try while it waits. */
const ASKED = 'The owner has been asked to allow this machine to open that key. Try again once they answer in BrainDog.';

/**
 * Whether one keychain grant's machine may open one key now, asking the owner when the key's rule says so. INTERNAL:
 * the record's `openForGrant` calls it for an agent's keychain grant, after it found the key within the grant's reach.
 *
 * `always` (or no rule) OPENS. `deny` IS REFUSED `FORBIDDEN` AT `credential`, in a sentence that names no other key.
 *
 * `ask` SPENDS AN ANSWER OR FILES A QUESTION. A `once` answer still live is spent by this open (`used`); a `deny` answer
 * still live refuses this open and is spent with it, so the next try asks again; an ask still pending is answered
 * `KEY_ASKED` again and the owner is not told twice, because the CLI asks every three seconds while it waits. Anything
 * else files a new ask, tells the owner once (`cause`, the ask's id) and answers `KEY_ASKED`. An `always` answer has
 * already written the machine's rule, so it never reaches here.
 *
 * NOT FOR SCHEDULED RUNS OR LEASES, which never come here: a scheduled `call`, `poll` or `pull` opens its key through the
 * host's `keyOpener` and `openGrant`, and a leased runner through `sealedGrant`. Nobody is at the keyboard for either,
 * so neither could wait for an answer, and both keep the behaviour they always had.
 *
 * `spoken` IS THE CREDENTIAL'S SPOKEN ID, never the key's label: an alert is read on a lock screen.
 */
export function keyGate(
  sql: Sql,
  deps: KeychainDeps,
  args: { credential: string; machine: string; run: string | null; spoken: string; machineName: string | null },
  transaction: <T>(fn: () => T) => T,
): KeyGate {
  const rule = keyRule(sql, args.credential, args.machine);
  if (rule === 'always') return { open: true };
  if (rule === 'deny')
    return { open: false, refusal: { code: 'FORBIDDEN', fix: 'The owner does not let this machine open that key. Ask them to change its access in BrainDog.', at: 'credential' } };
  const now = instant(deps.nowMs);
  const asked: KeyGate = { open: false, refusal: { code: 'KEY_ASKED', fix: ASKED, at: 'credential' } };
  return transaction((): KeyGate => {
    const live = sql.one<{ id: string; status: KeyAskStatus }>(
      "SELECT id, status FROM key_ask WHERE credential = ? AND machine = ? AND status IN ('pending', 'once', 'denied') AND expires > ? ORDER BY asked_at DESC, id DESC LIMIT 1",
      args.credential,
      args.machine,
      now,
    );
    if (live?.status === 'once') {
      sql.exec("UPDATE key_ask SET status = 'used' WHERE id = ?", live.id);
      return { open: true };
    }
    if (live?.status === 'denied') {
      sql.exec('UPDATE key_ask SET expires = ? WHERE id = ?', now, live.id);
      return { open: false, refusal: { code: 'FORBIDDEN', fix: 'The owner said no to this machine opening that key.', at: 'credential' } };
    }
    if (live?.status === 'pending') return asked;
    sql.exec("DELETE FROM key_ask WHERE status <> 'pending' AND asked_at < ?", instant(deps.nowMs - KEY_ASK_KEPT_MS));
    const id = `ka_${deps.mint()}`;
    sql.exec(
      "INSERT INTO key_ask (id, credential, machine, run, status, asked_at, expires) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      id,
      args.credential,
      args.machine,
      args.run,
      now,
      instant(deps.nowMs + KEY_ASK_LIFE_MS),
    );
    const who = args.machineName ?? 'A machine';
    deps.interrupt({
      actor: `key_ask:${id}`,
      say: `${who} asks to use ${args.spoken}`,
      because: `${who}${args.run ? `, in ${args.run},` : ''} asked to open ${args.spoken}, which is set to ask first. Allow it once, always, or deny it in BrainDog.`,
      url: `/keychain?ask=${id}`,
      cause: `key_ask:${id}`,
    });
    return asked;
  });
}

/**
 * The owner's answer to one ask: `once`, `always` (which also writes the machine's rule for that key) or `deny`. An ask
 * that is not pending, or has run out, is refused, so a second press on an old alert changes nothing.
 */
export function answerKeyAsk(sql: Sql, deps: KeychainDeps, args: { id: string; answer: KeyAnswer }, transaction: <T>(fn: () => T) => T): Result<KeyAskRow> {
  const now = instant(deps.nowMs);
  return transaction((): Result<KeyAskRow> => {
    const row = sql.one<KeyAskRow>(`SELECT ${ASK_COLUMNS} FROM key_ask WHERE id = ?`, args.id);
    if (!row) return no('REF_UNKNOWN', 'There is no ask by that id. The list of asks names each one.', { at: 'id' });
    if (row.status !== 'pending' || row.expires <= now)
      return no('FORBIDDEN', 'That ask was already answered or has run out. The machine asks again when it next tries.', { at: 'id' });
    const status: KeyAskStatus = args.answer === 'deny' ? 'denied' : args.answer;
    sql.exec('UPDATE key_ask SET status = ?, answered_by = ?, answered_at = ? WHERE id = ?', status, deps.actor, now, row.id);
    if (args.answer === 'always') setKeyAccess(sql, deps, { credential: row.credential, machine: row.machine, rule: 'always' });
    return ok({ ...row, status, answered_by: deps.actor, answered_at: now });
  });
}

/* ── the keychain locks itself: how long a sign-in opens it for ── */

/** The three windows an owner may choose, in minutes. Fifteen is the default, the fixed window before this setting. */
export const LOCK_AFTER_MINUTES = [5, 15, 60] as const;
export type LockAfter = (typeof LOCK_AFTER_MINUTES)[number];
export const LOCK_AFTER_DEFAULT: LockAfter = 15;
/** The longest window, which `lockKeychain` puts a session's proof behind so the next keychain act asks again. */
export const LOCK_AFTER_MOST_MS = Math.max(...LOCK_AFTER_MINUTES) * 60_000;

/**
 * WHERE THE WINDOW IS KEPT: one `pref` row (migration 9) under the record's own holder, `keychain`, which no person id
 * is, because the keychain is the record's and every owner opens the same one. No migration, and nothing a copy carries.
 */
const LOCK_HOLDER = 'keychain';
const LOCK_KEY = 'lock_after';

/** The record's window in minutes: the one set, or fifteen. A value that is not one of the three reads as fifteen. */
export function lockAfter(sql: Sql): LockAfter {
  const raw = sql.one<{ value: string }>('SELECT value FROM pref WHERE person_id = ? AND key = ?', LOCK_HOLDER, LOCK_KEY)?.value;
  let n: unknown = null;
  try {
    n = raw === undefined ? null : JSON.parse(raw);
  } catch {
    n = null;
  }
  return (LOCK_AFTER_MINUTES as readonly unknown[]).includes(n) ? (n as LockAfter) : LOCK_AFTER_DEFAULT;
}

/** Set the window. The caller has checked the value is one of the three and who may set it. */
export function setLockAfter(sql: Sql, nowMs: number, minutes: LockAfter): LockAfter {
  sql.exec(
    `INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (person_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    LOCK_HOLDER,
    LOCK_KEY,
    JSON.stringify(minutes),
    instant(nowMs),
  );
  return minutes;
}
