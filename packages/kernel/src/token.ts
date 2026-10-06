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

import type { Rung } from './change-kind.ts';
import { instant } from './migrate.ts';

/** The three. There is no fourth, and there is deliberately no `admin`. */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * THE SCOPE IS THE CEILING OVER THE LADDER (DIRECTION §37). The highest rung a token's agent can stand on for any kind:
 * a read token writes nothing, so it has no rung at all; a propose token always asks, however often the owner kept what
 * it asked; and only a write token lets a kind climb to Do and tell or Do quietly. A rung read from the ladder is held
 * under this, never above it, so taking a grant down to Suggest stops every kind it had earned at once.
 */
export const CEILING: Readonly<Record<Scope, Rung | null>> = { read: null, propose: 'ask', write: 'quiet' };

/** The rung a token of `scope` stands on for a kind its ladder puts at `rung`: the lower of the two, `null` for none. */
export function ceilingOf(scope: Scope, rung: Rung): Rung | null {
  const top = CEILING[scope];
  if (top === null) return null;
  const order: readonly Rung[] = ['ask', 'tell', 'quiet'];
  return order.indexOf(rung) <= order.indexOf(top) ? rung : top;
}

/**
 * How the app holding a token came to have it, closed in the column's CHECK (migration 25): `cimd` came with a metadata
 * document the server fetched itself, which is the one that proves its name; `dcr` registered itself and names itself;
 * `device` is the CLI's login; `key` was minted by hand for a script.
 */
export const CLIENT_KINDS = ['cimd', 'dcr', 'device', 'key'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Who the app is: its client id, how it came, and the host its metadata names. Only a host passes it, never a caller. */
export type TokenClient = { id: string; kind: ClientKind; host: string | null };

/**
 * What a token may open beyond its scope, named by the owner when they mint it. One so far.
 *
 * A CLOSED LIST, AND THE RECORD HOLDS THE SAME ONE (`TOKEN_REACHES` in `packages/record`), because the record is where
 * each reach is enforced and the kernel is where it is kept. The kernel cannot import the record, so the two lists are
 * two lines; a reach added to one and not the other is either refused at mint or never admitted at the gate, and
 * `test/token-reach.test.ts` pins this one.
 *
 * `inbox` IS THE MONEY INBOX: an owner's whole-record token that carries it reads `inbox`, which is otherwise the
 * owner's alone. It opens that read and nothing beside it.
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
  /**
   * Present on a token nobody revoked that the operator's cut-off has ended (`endedByCutOff`), so the owner's list can
   * say why it stopped. Absent on every other row, and on every row when the listing was not handed the cut-off.
   */
  ended_by?: 'operator';
  /**
   * Whose token it is, as the owner knows them: the person's name, or their address when they gave none, and `null`
   * for a person this record's mirror does not hold. On `listTokens`'s rows only, because a colleague may mint their
   * own (`createOwnToken` in `packages/record`) and the owner's list has to say whose each one is before Revoke means
   * anything.
   */
  person_name?: string | null;
  /** Who the app is, on a token whose host said so when it was minted. Absent on every other, and every older one. */
  client?: TokenClient;
};

const VISIBLE = 'id, person_id, scope, reach, label, created_at, last_used_at, last_surface, expires_at, revoked_at, client_id, client_kind, host';

/**
 * An ISO instant with its zone: `2026-09-25T12:00:00Z`, the seconds and up to three digits of fraction optional.
 *
 * A DATE ALONE IS NOT ONE, and neither is a time without a zone. `Date.parse` reads `2026-09-25` as midnight in UTC and
 * `2026-09-25T12:00` as noon wherever the host happens to run, so an operator who wrote either would have ended tokens
 * at a moment they did not name. Held to this pattern first, the value is read one way on every host.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The operator's cut-off as milliseconds: `null` when there is none, `NaN` when it is set and cannot be read.
 *
 * BLANK IS UNSET. A self-host's environment file often carries a name with nothing after the `=`, and that is somebody
 * who has not set the lever, not somebody who set it to something unreadable.
 */
const cutOffMs = (validFrom: string | undefined): number | null => {
  const said = validFrom?.trim() ?? '';
  if (said === '') return null;
  return ISO_INSTANT.test(said) ? Date.parse(said) : Number.NaN;
};

/**
 * Whether a host's cut-off is one this kernel reads: unset, blank, or an ISO instant with its zone.
 *
 * FOR THE HOST'S ONE LOG LINE AND NOTHING ELSE. An unreadable cut-off refuses every bearer (`endedByCutOff`), which is
 * the safe way for an incident lever to fail, and the host says why once so the operator is not left reading 401s.
 */
export const cutOffReadable = (validFrom: string | undefined): boolean => !Number.isNaN(cutOffMs(validFrom) ?? 0);

/**
 * Whether the operator's cut-off (`TOKENS_VALID_FROM`, `53 §5.11` (c) step 3) ends a credential made at `made`.
 *
 * MADE BEFORE THE INSTANT IS ENDED, AND MADE AT IT IS NOT. An operator who sets it to the moment a compromise began
 * means everything minted earlier, and a token minted in that same millisecond by the person re-minting is theirs.
 *
 * FAIL CLOSED. A cut-off that is set and cannot be read ends everything, and so does a row with no moment to compare,
 * because a lever pulled in an incident that silently does nothing is worse than one that refuses too much for the
 * few minutes it takes to correct. NOTHING IS WRITTEN: setting an earlier instant gives back every token it ended,
 * which is how a wrong value is corrected (`53 §5.11`, "Rollback").
 */
export function endedByCutOff(validFrom: string | undefined, made: string | null): boolean {
  const from = cutOffMs(validFrom);
  if (from === null) return false;
  const at = made === null ? Number.NaN : Date.parse(made);
  /* `NaN` on either side is not "at or after", so both fail-closed cases fall out of the one comparison. */
  return !(at >= from);
}

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

type Stored = Omit<TokenRow, 'reach' | 'ended_by' | 'client'> & {
  reach: string | null;
  client_id: string | null;
  client_kind: string | null;
  host: string | null;
};

/** The three client columns as one value, or `undefined` when the token was minted with none. */
const clientOf = (raw: { client_id: string | null; client_kind: string | null; host: string | null }): TokenClient | undefined =>
  raw.client_id !== null && (CLIENT_KINDS as readonly (string | null)[]).includes(raw.client_kind)
    ? { id: raw.client_id, kind: raw.client_kind as ClientKind, host: raw.host }
    : undefined;

/**
 * The listing's columns, each named from the token table, with whose it is from the person mirror beside them.
 *
 * QUALIFIED, BECAUSE `person` HAS AN `id` TOO, and an unqualified `id` in a join is either ambiguous or the wrong one.
 * A LEFT JOIN, so a token whose person the mirror has lost is still listed and still revocable.
 */
const LISTED =
  'SELECT t.id AS id, t.person_id AS person_id, t.scope AS scope, t.reach AS reach, t.label AS label, ' +
  't.created_at AS created_at, t.last_used_at AS last_used_at, t.last_surface AS last_surface, ' +
  't.expires_at AS expires_at, t.revoked_at AS revoked_at, t.client_id AS client_id, t.client_kind AS client_kind, ' +
  't.host AS host, COALESCE(p.name, p.email) AS person_name ' +
  'FROM token t LEFT JOIN person p ON p.id = t.person_id';

/**
 * A stored row as a listing shows it, marked when the cut-off has ended it. A revoked row is not marked: somebody ended
 * it before the operator did, and that is the reason the list already gives.
 */
const rowOf = (raw: Stored, validFrom?: string): TokenRow => {
  const { client_id: _id, client_kind: _kind, host: _host, ...rest } = raw;
  const client = clientOf(raw);
  return {
    ...rest,
    reach: reachOf(raw.reach),
    ...(client === undefined ? {} : { client }),
    ...(raw.revoked_at === null && endedByCutOff(validFrom, raw.created_at) ? { ended_by: 'operator' as const } : {}),
  };
};

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
  /**
   * The operator's cut-off, `TOKENS_VALID_FROM` on the Worker and `BRAINDOG_TOKENS_VALID_FROM` on the self-host: an ISO
   * instant before which every token and device grant is refused (`endedByCutOff`). Absent is the epoch.
   *
   * THE HOST'S, HANDED IN PER CALL, because it is a fact about the deployment and not about the record: the same record
   * opened by a test, the CLI or another host has none, and a value kept in the record would travel in its `.brain`.
   */
  validFrom?: string | undefined;
};

export type Minted = { id: string; bearer: string; scope: Scope; reach: TokenReach[]; expires_at: string };

/** What minting takes. `reach` is left out, or empty, for a token that opens nothing beyond its scope. */
export type CreateTokenArgs = {
  scope: Scope;
  label?: string;
  days?: number;
  reach?: readonly TokenReach[];
  /**
   * Who the app is, from the host's own door (OAuth, the CLI's login) and never from a field a person or an agent sends:
   * the record's methods take it from a host-only context. Left out, the token says nothing about its app.
   */
  client?: TokenClient;
};

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

  /* THE CLIENT IS CHECKED WHOLE TOO, for the reach's reason: a kind the column's CHECK would refuse is refused here,
     with its sentence, rather than thrown out of the insert. */
  const client = args.client;
  if (
    client !== undefined &&
    (typeof client?.id !== 'string' ||
      client.id.trim() === '' ||
      !(CLIENT_KINDS as readonly unknown[]).includes(client.kind) ||
      (client.host !== null && typeof client.host !== 'string'))
  )
    return no<Minted>('VALUE_MALFORMED', `A token's app is { id, kind, host }, its kind one of ${CLIENT_KINDS.join(', ')}, and this was ${JSON.stringify(client)}.`, {
      at: 'client',
      allowed: CLIENT_KINDS,
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
    'INSERT INTO token (id, person_id, hash, scope, reach, label, created_at, expires_at, client_id, client_kind, host) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    person,
    await deps.digest(secret),
    args.scope,
    reach.length === 0 ? null : JSON.stringify(reach),
    args.label ?? null,
    at,
    expires,
    client?.id ?? null,
    client?.kind ?? null,
    client?.host ?? null,
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

/**
 * Every token, with a revoke button's worth of information and nothing a hash needs.
 *
 * `validFrom` IS THE HOST'S CUT-OFF, as `TokenDeps.validFrom`, and marks each token it has ended, so a token that stopped
 * working in an incident says so on the owner's list rather than looking live. Each row says whose it is
 * (`person_name`), since a colleague may hold tokens of their own.
 */
export const listTokens = (sql: Sql, validFrom?: string): TokenRow[] =>
  sql.all<Stored>(`${LISTED} ORDER BY t.created_at DESC, t.id`).map((raw) => rowOf(raw, validFrom));

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
export type Verified = {
  id: string;
  person_id: string;
  scope: Scope;
  reach: TokenReach[];
  /** Who the app is, when its host said so at minting: what a change of client is noticed by. */
  client?: TokenClient;
};

/**
 * A bearer, checked.
 *
 * THE HASH IS COMPARED AND THE SECRET IS NEVER STORED, so this is the only way a token is recognised
 * and there is no other. A revoked or expired row verifies as nothing — not as a lesser scope, and
 * not with a warning: a credential that half works is a credential nobody replaces. So does a row made
 * before the operator's cut-off, `deps.validFrom`.
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
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    suspended_at: string | null;
    client_id: string | null;
    client_kind: string | null;
    host: string | null;
  }>(
    `SELECT t.id AS id, t.person_id AS person_id, t.scope AS scope, t.reach AS reach, t.created_at AS created_at,
            t.expires_at AS expires_at, t.revoked_at AS revoked_at, p.suspended_at AS suspended_at,
            t.client_id AS client_id, t.client_kind AS client_kind, t.host AS host
     FROM token t LEFT JOIN person p ON p.id = t.person_id WHERE t.hash = ?`,
    await deps.digest(secret),
  );
  if (!row || row.revoked_at || row.suspended_at) return wrong;
  if (row.expires_at && row.expires_at <= instant(deps.nowMs)) return wrong;
  /* THE OPERATOR'S CUT-OFF ANSWERS AS AN UNKNOWN BEARER DOES, so the instant cannot be found by probing: a caller
     learns only that this bearer does not work, and the operator who set the instant already knows why. Checked before
     the use is written, because a refused bearer was not used. */
  if (endedByCutOff(deps.validFrom, row.created_at)) return wrong;

  deps.sql.exec(
    'UPDATE token SET last_used_at = ?, last_surface = ? WHERE id = ?',
    instant(deps.nowMs),
    surface ?? null,
    row.id,
  );
  const client = clientOf(row);
  return ok({ id: row.id, person_id: row.person_id, scope: row.scope, reach: reachOf(row.reach), ...(client === undefined ? {} : { client }) });
}
