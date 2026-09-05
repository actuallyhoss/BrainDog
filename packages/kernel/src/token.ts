/**
 * Agent tokens: how something that is not a person reaches this record.
 *
 * THE SECRET IS SHOWN ONCE AND STORED NEVER. What the record keeps is `sha256(secret)`, so a copy of
 * the database is a copy of the hashes and not a set of working keys. A product that can show you a
 * token you created last month is a product whose database is a keyring, and the day it leaks is the
 * day every one of them has to be rotated by hand.
 *
 * AND THE WIRE FORMAT CARRIES THE RECORD. `<rec_id>.<secret>` — because the host has to know WHICH
 * record's table to look the hash up in before it can look anything up at all, and a bearer that did
 * not say would make the lookup a search across every customer.
 *
 * THERE IS NO `admin` SCOPE (ADR-060). Three words — `read ⊂ propose ⊂ write` — and the ladder stops
 * below `decide`. An agent may put a question in front of a person; it may not answer its own, and
 * that is not a scope anybody can be issued.
 *
 * A TOKEN IS ALWAYS SOMEBODY'S. It carries the person who minted it, writes as them, and can never
 * do more than they can — the intersection, not the maximum. A token outliving the access of the
 * person who made it is how a colleague who left last year is still writing.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';

/** The three. There is no fourth, and there is deliberately no `admin`. */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a listing shows. Never the hash, and never anything a hash could be rebuilt from. */
export type TokenRow = {
  id: string;
  person_id: string;
  scope: Scope;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_surface: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const VISIBLE = 'id, person_id, scope, label, created_at, last_used_at, last_surface, expires_at, revoked_at';

/** Ninety days. Long enough to be useful, short enough that a forgotten one stops working. */
export const DEFAULT_DAYS = 90;
/** A year. Past it a token is a password somebody wrote on a sticky note. */
const MAX_DAYS = 365;

export type TokenDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  /** The record's own id, which the bearer carries so a host knows where to look. */
  recordId: () => string | null;
  /** `sha256` of the secret, hex. The host's, because the record has no crypto of its own. */
  digest: (text: string) => Promise<string>;
  /** Bytes a stranger cannot guess. Injected so a fixture is deterministic. */
  random: (n: number) => Uint8Array;
};

export type Minted = { id: string; bearer: string; scope: Scope; expires_at: string };

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Mint one, and hand back the only copy of the secret there will ever be.
 *
 * THE EXPIRY IS NOT OPTIONAL. A token with no end is a credential somebody has to remember to
 * revoke, and the whole history of this failure is that nobody remembers. Ninety days by default and
 * a year at the outside, said in the sentence rather than assumed.
 */
export async function createToken(
  deps: TokenDeps,
  person: string,
  args: { scope: Scope; label?: string; days?: number },
): Promise<Result<Minted>> {
  if (!(SCOPES as readonly string[]).includes(args?.scope))
    return no<Minted>('ENUM_VALUE_UNKNOWN', `${String(args?.scope)} is not a scope a token can hold.`, {
      at: 'scope',
      allowed: SCOPES,
    });

  const days = Math.floor(args.days ?? DEFAULT_DAYS);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS)
    return no<Minted>('OUT_OF_BOUNDS', `A token lasts between one day and ${MAX_DAYS}, and this one asked for ${String(args.days)}.`, {
      at: 'days',
    });

  const record = deps.recordId();
  if (!record)
    return no<Minted>('OUT_OF_BOUNDS', 'This record has no id yet, and a bearer carries the record it is for.', { at: 'record' });

  /* THIRTY-TWO BYTES. The secret is the whole of the security of this path, and a shorter one is a
     number somebody can walk through faster than the lockout can count. */
  const secret = b64url(deps.random(32));
  const id = `t_${deps.mint()}`;
  const at = instant(deps.nowMs);
  const expires = instant(deps.nowMs + days * 86_400_000);

  deps.sql.exec(
    'INSERT INTO token (id, person_id, hash, scope, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    person,
    await deps.digest(secret),
    args.scope,
    args.label ?? null,
    at,
    expires,
  );
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'access.grant', ?, 'token', ?, ?)",
    deps.mint(),
    at,
    person,
    `token:${id}`,
    args.scope,
    (args.label ?? '').slice(0, 280) || null,
  );

  /* THE ONLY TIME THE SECRET EXISTS OUTSIDE THIS FUNCTION. The row holds its hash; nothing here or
     anywhere else can produce it again. */
  return ok({ id, bearer: `${record}.${secret}`, scope: args.scope, expires_at: expires });
}

/** Every token, with a revoke button's worth of information and nothing a hash needs. */
export const listTokens = (sql: Sql): TokenRow[] =>
  sql.all<TokenRow>(`SELECT ${VISIBLE} FROM token ORDER BY created_at DESC, id`);

/**
 * Revoke one.
 *
 * IDEMPOTENT, and the second call says the same thing as the first. Somebody revoking a token twice
 * is somebody who was not sure it worked, and answering the second one with an error is the product
 * making them less sure.
 */
export function revokeToken(deps: TokenDeps, person: string, id: string): Result<TokenRow> {
  const row = deps.sql.one<TokenRow>(`SELECT ${VISIBLE} FROM token WHERE id = ?`, id);
  if (!row) return no<TokenRow>('OUT_OF_BOUNDS', `There is no token called ${id}.`, { at: 'id' });
  if (row.revoked_at) return ok(row);

  const at = instant(deps.nowMs);
  deps.sql.exec('UPDATE token SET revoked_at = ? WHERE id = ?', at, id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'access.revoke', ?, 'token', ?)",
    deps.mint(),
    at,
    person,
    `token:${id}`,
    row.scope,
  );
  return ok({ ...row, revoked_at: at });
}

export type Verified = { id: string; person_id: string; scope: Scope };

/**
 * A bearer, checked.
 *
 * THE HASH IS COMPARED AND THE SECRET IS NEVER STORED, so this is the only way a token is recognised
 * and there is no other. A revoked or expired row verifies as nothing — not as a lesser scope, and
 * not with a warning: a credential that half works is a credential nobody replaces.
 *
 * AND THE USE IS RECORDED WITHOUT AN EVENT. `last_used_at` is what makes a listing say "this one has
 * not been used since March", which is how somebody decides what to revoke. An event per call would
 * be a ledger of an agent's polling.
 */
export async function verifyToken(deps: TokenDeps, bearer: string, surface?: string): Promise<Result<Verified>> {
  const cut = bearer.indexOf('.');
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  const wrong = no<Verified>('FORBIDDEN', 'That bearer is not one this record knows.', { at: 'authorization' });

  /* THE RECORD IS CHECKED FIRST AND THE ANSWER IS THE SAME EITHER WAY. A different sentence for "a
     token, but not for this record" would tell whoever is guessing which half they got right. */
  if (!record || !secret || record !== deps.recordId()) return wrong;

  const row = deps.sql.one<{ id: string; person_id: string; scope: Scope; expires_at: string | null; revoked_at: string | null }>(
    'SELECT id, person_id, scope, expires_at, revoked_at FROM token WHERE hash = ?',
    await deps.digest(secret),
  );
  if (!row || row.revoked_at) return wrong;
  if (row.expires_at && row.expires_at <= instant(deps.nowMs)) return wrong;

  deps.sql.exec(
    'UPDATE token SET last_used_at = ?, last_surface = ? WHERE id = ?',
    instant(deps.nowMs),
    surface ?? null,
    row.id,
  );
  return ok({ id: row.id, person_id: row.person_id, scope: row.scope });
}
