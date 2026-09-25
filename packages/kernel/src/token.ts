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

/**
 * What a token may open beyond its scope, named by the owner when they mint it. One so far.
 *
 * A CLOSED LIST, AND THE RECORD HOLDS THE SAME ONE (`TOKEN_REACHES` in `packages/record`), because the record is where
 * each reach is enforced and the kernel is where it is kept. The kernel cannot import the record, so the two lists are
 * two lines; a reach added to one and not the other is either refused at mint or never admitted at the gate, and
 * `test/token-reach.test.ts` pins this one.
 *
 * `inbox` IS THE MONEY INBOX: an owner's whole-record token that carries it reads `inbox`, which is otherwise the
 * owner's alone (DIRECTION section 30, P2). It opens that read and nothing beside it.
 */
export const TOKEN_REACHES = ['inbox'] as const;
export type TokenReach = (typeof TOKEN_REACHES)[number];

/** What a listing shows. Never the hash, and never anything a hash could be rebuilt from. */
export type TokenRow = {
  id: string;
  person_id: string;
  scope: Scope;
  /** What the owner let it open beyond its scope. Empty for a token that reaches nothing more, and every older one. */
  reach: TokenReach[];
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_surface: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const VISIBLE = 'id, person_id, scope, reach, label, created_at, last_used_at, last_surface, expires_at, revoked_at';

/**
 * A `reach` column as the list it stands for.
 *
 * PARSED HERE AND FILTERED TO THE CLOSED LIST, because every reader downstream matches on it. The column is text until
 * somebody parses it, and the record's gate once admitted the text "no-inbox" through a string's `includes`
 * (d41ec831). A value this build does not name is dropped rather than passed on, so no principal carries a reach that
 * nothing checked.
 */
const reachOf = (column: string | null): TokenReach[] => {
  if (column === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(column);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? TOKEN_REACHES.filter((r) => parsed.includes(r)) : [];
};

type Stored = Omit<TokenRow, 'reach'> & { reach: string | null };
const rowOf = (raw: Stored): TokenRow => ({ ...raw, reach: reachOf(raw.reach) });

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

export type Minted = { id: string; bearer: string; scope: Scope; reach: TokenReach[]; expires_at: string };

/** What minting takes. `reach` is left out, or empty, for a token that opens nothing beyond its scope. */
export type CreateTokenArgs = { scope: Scope; label?: string; days?: number; reach?: readonly TokenReach[] };

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
  args: CreateTokenArgs,
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

  /* THE REACH IS CHECKED WHOLE, BEFORE ANYTHING IS WRITTEN, and a list with one unknown name in it is refused rather
     than trimmed: the owner asked for a token that opens something, and handing back one that opens less would be a
     token that fails later for a reason nobody was told. A string is not a list, because `'inbox'` read as one would
     be the substring match the record's gate once let through. */
  const asked: unknown = args.reach ?? [];
  if (!Array.isArray(asked) || asked.some((r) => !(TOKEN_REACHES as readonly unknown[]).includes(r)))
    return no<Minted>('ENUM_VALUE_UNKNOWN', `A token can reach ${TOKEN_REACHES.join(', ')} beyond its scope, named in a list, and this asked for ${JSON.stringify(asked)}.`, {
      at: 'reach',
      allowed: TOKEN_REACHES,
    });
  const reach = TOKEN_REACHES.filter((r) => asked.includes(r));

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
    'INSERT INTO token (id, person_id, hash, scope, reach, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    person,
    await deps.digest(secret),
    args.scope,
    reach.length === 0 ? null : JSON.stringify(reach),
    args.label ?? null,
    at,
    expires,
  );
  /* THE REACH GOES IN `field`, WHICH IS WHAT A GRANT IS ON. A person's level names the list it is held to there, and a
     token's names what it opens beyond its scope, so who let an agent read the inbox, and when, is one query over the
     log. `to_v` stays the scope, which is what Home's sentence for a new key reads. */
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note) VALUES (?, ?, ?, 'access.grant', ?, 'token', ?, ?, ?)",
    deps.mint(),
    at,
    person,
    `token:${id}`,
    reach.length === 0 ? null : reach.join(','),
    args.scope,
    (args.label ?? '').slice(0, 280) || null,
  );

  /* THE ONLY TIME THE SECRET EXISTS OUTSIDE THIS FUNCTION. The row holds its hash; nothing here or
     anywhere else can produce it again. */
  return ok({ id, bearer: `${record}.${secret}`, scope: args.scope, reach, expires_at: expires });
}

/** Every token, with a revoke button's worth of information and nothing a hash needs. */
export const listTokens = (sql: Sql): TokenRow[] =>
  sql.all<Stored>(`SELECT ${VISIBLE} FROM token ORDER BY created_at DESC, id`).map(rowOf);

/**
 * Revoke one.
 *
 * IDEMPOTENT, and the second call says the same thing as the first. Somebody revoking a token twice
 * is somebody who was not sure it worked, and answering the second one with an error is the product
 * making them less sure.
 */
export function revokeToken(deps: TokenDeps, person: string, id: string): Result<TokenRow> {
  const held = deps.sql.one<Stored>(`SELECT ${VISIBLE} FROM token WHERE id = ?`, id);
  const row = held ? rowOf(held) : null;
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

/**
 * A bearer that checked, and what it may do.
 *
 * `reach` IS WHAT A HOST PUTS ON THE TOKEN PRINCIPAL, read from this row and never from anything the caller sent. The
 * record's inbox gate trusts it for exactly that reason.
 */
export type Verified = { id: string; person_id: string; scope: Scope; reach: TokenReach[] };

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

  /* THE PERSON'S SUSPENSION TRAVELS WITH THE TOKEN. A token is a capability handed to an agent by a
     PERSON — that is the whole of what the second ladder means — so a suspended person's agent must
     stop with them. This joined nothing, and both hosts happened to call `access` afterwards, which
     closed the door by accident of call order rather than by a check: any caller of `verifyToken`
     alone re-opened it. */
  const row = deps.sql.one<{
    id: string;
    person_id: string;
    scope: Scope;
    reach: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    suspended_at: string | null;
  }>(
    `SELECT t.id AS id, t.person_id AS person_id, t.scope AS scope, t.reach AS reach, t.expires_at AS expires_at,
            t.revoked_at AS revoked_at, p.suspended_at AS suspended_at
     FROM token t LEFT JOIN person p ON p.id = t.person_id WHERE t.hash = ?`,
    await deps.digest(secret),
  );
  if (!row || row.revoked_at || row.suspended_at) return wrong;
  if (row.expires_at && row.expires_at <= instant(deps.nowMs)) return wrong;

  deps.sql.exec(
    'UPDATE token SET last_used_at = ?, last_surface = ? WHERE id = ?',
    instant(deps.nowMs),
    surface ?? null,
    row.id,
  );
  return ok({ id: row.id, person_id: row.person_id, scope: row.scope, reach: reachOf(row.reach) });
}
