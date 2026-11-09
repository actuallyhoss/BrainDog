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
import { narrowFault, type Narrow } from './lens.ts';
import { instant } from './migrate.ts';

/** The three. There is no fourth, and there is deliberately no `admin`. */
export const SCOPES = ['read', 'propose', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * THE SCOPE IS THE CEILING OVER THE LADDER. The highest rung a token's agent can stand on for any kind:
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
  /** The build of the command behind it, as the command last said it (`2026.10.09+1a2b3c4`), or `null` until it does. */
  last_build: string | null;
  /** When a session on it last called a tool (`noteTool`), or `null` for one that never has. */
  last_tool_at: string | null;
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
  /** What the key is held to beyond its person (`token_lens.narrow`). Absent on a key narrowed to nothing more. */
  narrow?: Narrow;
  /**
   * The short keys minted under this one (`mintChild`), newest first, on `listTokens`'s root rows only. Absent when it has
   * none. A child is never a row of its own in the listing: it is its parent's key for an hour, and revoking the parent
   * ends it.
   */
  children?: TokenRow[];
};

const VISIBLE =
  'id, person_id, scope, reach, label, created_at, last_used_at, last_surface, last_build, last_tool_at, expires_at, revoked_at, client_id, client_kind, host';

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
 * The joins that say where a standing device grant's approver stands now: `person` for whether they are suspended, and
 * `member` for whether they still hold the whole record at owner. Read as `FROM device_grant d ${APPROVER_STANDING}`.
 *
 * ONLY AN OWNER APPROVES A GRANT, AND ONLY AN OWNER KEEPS ONE STANDING. A machine let into the keychain or enrolled as a
 * runner holds what its approver held. The checks read `suspended_at` alone, so an owner taken off the record, or made
 * a viewer, left their machine able to open every key for up to thirty days (`leaving-ends-bearers.test.ts`).
 */
export const APPROVER_STANDING = `LEFT JOIN person p ON p.id = d.approved_by
     LEFT JOIN member m ON m.person_id = d.approved_by AND m.register = '*' AND m.level = 'owner'`;

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

type Stored = Omit<TokenRow, 'reach' | 'ended_by' | 'client' | 'narrow' | 'children'> & {
  reach: string | null;
  client_id: string | null;
  client_kind: string | null;
  host: string | null;
  /** From `token_lens`, on the listing's query only. */
  parent_id?: string | null;
  narrow?: string | null;
};

/**
 * A `token_lens.narrow` column as the narrowing it holds: `null` for none, `undefined` for text that is not one.
 *
 * UNREADABLE IS NOT NONE. A narrowing that cannot be read is a key somebody meant to hold to less, so `verifyToken`
 * refuses it rather than reading it as a key held to nothing more.
 */
const narrowOf = (column: string | null | undefined): Narrow | null | undefined => {
  if (column === null || column === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(column);
    return narrowFault(parsed) === null ? (parsed as Narrow) : undefined;
  } catch {
    return undefined;
  }
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
  't.last_build AS last_build, t.last_tool_at AS last_tool_at, ' +
  't.expires_at AS expires_at, t.revoked_at AS revoked_at, t.client_id AS client_id, t.client_kind AS client_kind, ' +
  't.host AS host, COALESCE(p.name, p.email) AS person_name, l.parent_id AS parent_id, l.narrow AS narrow ' +
  'FROM token t LEFT JOIN person p ON p.id = t.person_id LEFT JOIN token_lens l ON l.token_id = t.id';

/**
 * A stored row as a listing shows it, marked when the cut-off has ended it. A revoked row is not marked: somebody ended
 * it before the operator did, and that is the reason the list already gives.
 */
const rowOf = (raw: Stored, validFrom?: string): TokenRow => {
  const { client_id: _id, client_kind: _kind, host: _host, parent_id: _parent, narrow: _narrow, ...rest } = raw;
  const client = clientOf(raw);
  const narrow = narrowOf(raw.narrow);
  return {
    ...rest,
    reach: reachOf(raw.reach),
    ...(client === undefined ? {} : { client }),
    ...(narrow === null || narrow === undefined ? {} : { narrow }),
    ...(raw.revoked_at === null && endedByCutOff(validFrom, raw.created_at) ? { ended_by: 'operator' as const } : {}),
  };
};

/** Ninety days. Long enough to be useful, short enough that a forgotten one stops working. */
export const DEFAULT_DAYS = 90;
/** A year. Past it a token is a password somebody wrote on a sticky note. */
const MAX_DAYS = 365;
/** The longest a child key lives, in minutes: an hour, which is what an OAuth app's access token is (sharing plan 2.9). */
export const CHILD_MINUTES_MOST = 60;

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
  /**
   * When this process last wrote each key's use (`verifyToken`), so a key called again inside `USE_WRITE_MS` with the same
   * door and build writes nothing. THE HOST'S, ONE PER OPEN RECORD AND KEPT IN MEMORY, never in the record. Absent, every
   * use is written, as before.
   */
  uses?: TokenUses;
};

/** The last use written per key id: when, through which door, and the build it kept (`null`, none said). */
export type TokenUses = Map<string, { at: number; surface: string | null; build: string | null }>;

/**
 * How stale a key's `last_used_at` may be: a minute. A use inside it writes nothing, so a busy agent's calls do not each
 * wait on a storage write before their answer leaves the record, and every reader of the column (the connections list,
 * a login grant's silence, "not used since March") is still right to the minute.
 */
export const USE_WRITE_MS = 60_000;

/** The most keys `uses` holds before the ones past `USE_WRITE_MS` are let go: a child key is minted every hour. */
const USES_MOST = 512;

/**
 * Whether any of `ids` needs its use written: never written by this process, written a minute ago or more, last through
 * another door, or told a build it has not kept. A door or build that changed is written at once, so the listing never
 * names the wrong one.
 */
function usesStale(uses: TokenUses, ids: readonly string[], now: number, surface: string | null, build: string | null): boolean {
  return ids.some((id) => {
    const was = uses.get(id);
    return (
      was === undefined ||
      now - was.at >= USE_WRITE_MS ||
      now < was.at ||
      was.surface !== surface ||
      (build !== null && was.build !== build && !olderBuild(build, was.build))
    );
  });
}

/** Note a use as written for `ids`, the build kept being the one said or the one already noted, whichever `verifyToken` kept. */
function usesWritten(uses: TokenUses, ids: readonly string[], now: number, surface: string | null, build: string | null): void {
  if (uses.size >= USES_MOST) for (const [id, was] of uses) if (now - was.at >= USE_WRITE_MS) uses.delete(id);
  for (const id of ids) {
    const was = uses.get(id)?.build ?? null;
    uses.set(id, { at: now, surface, build: build === null || olderBuild(build, was) ? was : build });
  }
}

/** A build bundled on a day, `2026.11.09+…`, as SQLite's `GLOB` reads it; its first ten characters are the day. */
const DATED_BUILD = '[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9][0-9]+*';

/** Whether `said` was bundled on an earlier day than `kept`, which a key does not take over it (`verifyToken`). */
function olderBuild(said: string, kept: string | null): boolean {
  const dated = /^\d{4}\.\d{2}\.\d{2}\+/u;
  return kept !== null && dated.test(said) && dated.test(kept) && said.slice(0, 10) < kept.slice(0, 10);
}

/**
 * Where a host keeps the plan's count of agents: one row of a small table the host makes, `host_meta`, under
 * `plan.agents`. Not a kernel table, so no `dog_section` row names it and no `.brain` carries it: a record exported from
 * Cloud and opened on a self-host brings no cap with it.
 *
 * ABSENT IS NO CAP. A self-host never writes it, and neither does a hosted record billing has not yet told its plan.
 * A value that cannot be read is no cap either, since a host's mistake should not stop an owner connecting their tools.
 */
export const AGENTS_KEY = 'plan.agents';

/** The plan's count, its name as a person reads it, and the plan above it, or `null` on the top one. */
export type AgentCap = { agents: number; plan: string; next: string | null };

/** The cap a host wrote, or `null` for none. */
export function agentCap(sql: Sql): AgentCap | null {
  if (!sql.one("SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'host_meta'")) return null;
  const said = sql.one<{ value: string }>('SELECT value FROM host_meta WHERE key = ?', AGENTS_KEY)?.value;
  if (said === undefined) return null;
  try {
    const v = JSON.parse(said) as Partial<AgentCap> | null;
    if (Number.isSafeInteger(v?.agents) && v!.agents! >= 0 && typeof v!.plan === 'string' && (v!.next === null || typeof v!.next === 'string'))
      return { agents: v!.agents!, plan: v!.plan, next: v!.next };
  } catch {
    /* not JSON: no cap, as above */
  }
  return null;
}

/** A job's bearer is labelled `job:` and its job's id (`jobs.ts`). */
const JOB_LABEL = 'job:';

/**
 * How many agent keys the record holds live: not revoked, not past their life, not ended by the operator's cut-off.
 *
 * TWO KINDS OF KEY ARE NOT AGENTS. A job's bearer is the enrolled machine's, minted for one run and revoked by its label
 * when the run ends, so it is left out while its job is claimed and a record at its count can still run its work. A
 * report key (`report:`, made by the record's `createReportKey` alone) sends rows to one list and reads nothing. A
 * self-host's server key and a share link are not keys of this table at all.
 */
export function liveAgents(deps: Pick<TokenDeps, 'sql' | 'nowMs' | 'validFrom'>): number {
  const jobs = deps.sql.one("SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'job'") !== undefined;
  /* A CHILD IS NOT AN AGENT EITHER: it is its parent's key for an hour, and the parent is the one counted. */
  return deps.sql
    .all<{ created_at: string }>(
      `SELECT t.created_at AS created_at FROM token t
       WHERE t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > ?)
         AND (t.label IS NULL OR substr(t.label, 1, 7) <> 'report:')
         AND NOT EXISTS (SELECT 1 FROM token_lens l WHERE l.token_id = t.id AND l.parent_id IS NOT NULL)
         ${jobs ? `AND NOT EXISTS (SELECT 1 FROM job j WHERE t.label = '${JOB_LABEL}' || j.id AND j.status = 'claimed')` : ''}`,
      instant(deps.nowMs),
    )
    .filter((t) => !endedByCutOff(deps.validFrom, t.created_at)).length;
}

/** Whether a mint is a run's bearer: labelled for a job a machine has just claimed, which holds no live bearer yet. */
function jobBearer(sql: Sql, label: string | undefined): boolean {
  if (typeof label !== 'string' || !label.startsWith(JOB_LABEL)) return false;
  if (!sql.one("SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'job'")) return false;
  return (
    sql.one("SELECT 1 AS hit FROM job WHERE id = ? AND status = 'claimed'", label.slice(JOB_LABEL.length)) !== undefined &&
    sql.one('SELECT 1 AS hit FROM token WHERE label = ? AND revoked_at IS NULL', label) === undefined
  );
}

/**
 * The sentence a mint past the count is refused with: the plan's figure in the site's words ("AI tools"), that what is
 * connected keeps working, the way on that always works (disconnect one), and the plan above where there is one.
 */
export const agentsFull = (cap: AgentCap): string =>
  `${cap.plan} connects ${cap.agents} AI tool${cap.agents === 1 ? '' : 's'} at once, and ${cap.agents === 1 ? 'it is' : 'they are'} all connected. ` +
  'Disconnect one in Settings > Agents to connect this one' +
  (cap.next === null ? '.' : `, or move to ${cap.next} in Settings > Billing for more.`);

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
  /**
   * What the key is held to beyond its person: lists, a project, a condition, rows, or one of the person's shares by id
   * (`Narrow` in `lens.ts`). ANDed into everything its person sees, so it can only take away. Left out, the key sees
   * what its person sees. The record checks it names nothing outside the minter's own reach before it gets here.
   */
  narrow?: Narrow;
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

  if (args.narrow !== undefined) {
    const bad = narrowFault(args.narrow);
    if (bad !== null) return no<Minted>('VALUE_MALFORMED', `A key is narrowed to lists, a project, a condition, rows or a share. ${bad}`, { at: 'narrow' });
  }

  const record = deps.recordId();
  if (!record)
    return no<Minted>('OUT_OF_BOUNDS', 'This BrainDog has no id yet, and a bearer carries the BrainDog it is for.', { at: 'record' });

  /* THE PLAN'S COUNT OF AGENTS, read where every key is minted: by hand, at the CLI's login, through an app's connect
     screen. A record at or over it mints none, and one moved down keeps every key it holds; nothing here revokes. A run's
     bearer is the machine's and passes, and so does a report key, which the record alone makes. */
  const cap = agentCap(deps.sql);
  const exempt = jobBearer(deps.sql, args.label) || (typeof args.label === 'string' && args.label.startsWith('report:'));
  if (cap !== null && !exempt && liveAgents(deps) >= cap.agents) return no<Minted>('FORBIDDEN', agentsFull(cap), { at: 'plan' });

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
  if (args.narrow !== undefined)
    deps.sql.exec('INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES (?, NULL, ?, ?, ?)', id, JSON.stringify(args.narrow), person, at);
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
export function listTokens(sql: Sql, validFrom?: string): TokenRow[] {
  const roots: TokenRow[] = [];
  const kids = new Map<string, TokenRow[]>();
  for (const raw of sql.all<Stored>(`${LISTED} ORDER BY t.created_at DESC, t.id`)) {
    const row = rowOf(raw, validFrom);
    const parent = raw.parent_id ?? null;
    if (parent === null) roots.push(row);
    else kids.set(parent, [...(kids.get(parent) ?? []), row]);
  }
  /* A CHILD WHOSE PARENT IS NOT LISTED IS NOT LISTED EITHER: it verifies as nothing, and the nightly prune takes it. */
  return roots.map((r) => (kids.has(r.id) ? { ...r, children: kids.get(r.id)! } : r));
}

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
  /* AND EVERY CHILD WITH IT, in the same statement's transaction and with no event of its own: a child is its parent's
     key, and the parent's revoke is the line the log keeps. `verifyToken` refuses a revoked parent's child anyway, so
     this is what the listing says, not what stops it. */
  deps.sql.exec(
    'UPDATE token SET revoked_at = ? WHERE revoked_at IS NULL AND id IN (SELECT token_id FROM token_lens WHERE parent_id = ?)',
    at,
    id,
  );
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
  /**
   * The agent the call is: the token's own id, or, for a child holding its parent's scope, the parent's, so an OAuth
   * app is one agent on the ladder and in the log however many hourly keys it has been through. A child minted to a
   * lower scope is an agent of its own, because the ladder reads a grant's scope by this id (`ladder.ts`'s `grantOf`).
   */
  id: string;
  person_id: string;
  scope: Scope;
  reach: TokenReach[];
  /** Who the app is, when its host said so at minting: what a change of client is noticed by. */
  client?: TokenClient;
  /**
   * What the key is held to beyond its person, parent's first: every one is ANDed in (`lensOf`'s token narrowing).
   * Absent for a key narrowed to nothing more. Carried, not yet applied: the sharing plan's slice 5 reads it.
   */
  narrows?: Narrow[];
  /** Present when the bearer was a child key (`mintChild`): its own id, and its parent's. */
  child?: { id: string; parent: string };
};

/** A token row as a bearer finds it, with its person's suspension and, for a child, its parent's row beside it. */
type Held = {
  id: string;
  person_id: string;
  scope: Scope;
  reach: string | null;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  suspended_at: string | null;
  client_id: string | null;
  client_kind: string | null;
  host: string | null;
  narrow: string | null;
  parent_id: string | null;
  parent_person: string | null;
  parent_scope: Scope | null;
  parent_created: string | null;
  parent_expires: string | null;
  parent_revoked: string | null;
  parent_narrow: string | null;
  /** The parent's own parent, which no key may have: children are one deep. */
  grand: string | null;
};

/**
 * The row a bearer names, if it still works, and the narrowing it carries: `null` for an unknown, revoked, expired or
 * cut-off bearer, a suspended person's, or a child whose parent no longer works.
 *
 * THE PERSON'S SUSPENSION TRAVELS WITH THE TOKEN. A token is a capability handed to an agent by a PERSON — that is the
 * whole of what the second ladder means — so a suspended person's agent must stop with them. This once joined nothing,
 * and both hosts happened to call `access` afterwards, which closed the door by accident of call order rather than by a
 * check: any caller of `verifyToken` alone re-opened it.
 *
 * AND A CHILD STOPS WITH ITS PARENT, read in the same statement: the parent revoked, run out or ended by the cut-off
 * ends every child at its next call, whatever the child's own row says. A child is the same person's as its parent and
 * one deep, and one that is not is refused as a key nobody made.
 */
async function heldBy(deps: TokenDeps, bearer: string): Promise<{ row: Held; narrows: Narrow[] } | null> {
  const cut = bearer.indexOf('.');
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  const secret = cut < 0 ? '' : bearer.slice(cut + 1);
  /* THE RECORD IS CHECKED FIRST AND THE ANSWER IS THE SAME EITHER WAY. A different sentence for "a
     token, but not for this record" would tell whoever is guessing which half they got right. */
  if (!record || !secret || record !== deps.recordId()) return null;

  const row = deps.sql.one<Held>(
    `SELECT t.id AS id, t.person_id AS person_id, t.scope AS scope, t.reach AS reach, t.label AS label, t.created_at AS created_at,
            t.expires_at AS expires_at, t.revoked_at AS revoked_at, p.suspended_at AS suspended_at,
            t.client_id AS client_id, t.client_kind AS client_kind, t.host AS host,
            l.narrow AS narrow, l.parent_id AS parent_id,
            pt.person_id AS parent_person, pt.scope AS parent_scope, pt.created_at AS parent_created,
            pt.expires_at AS parent_expires, pt.revoked_at AS parent_revoked, pl.narrow AS parent_narrow, pl.parent_id AS grand
     FROM token t LEFT JOIN person p ON p.id = t.person_id
       LEFT JOIN token_lens l ON l.token_id = t.id
       LEFT JOIN token pt ON pt.id = l.parent_id
       LEFT JOIN token_lens pl ON pl.token_id = pt.id
     WHERE t.hash = ?`,
    await deps.digest(secret),
  );
  const now = instant(deps.nowMs);
  if (!row || row.revoked_at || row.suspended_at) return null;
  if (row.expires_at && row.expires_at <= now) return null;
  /* THE OPERATOR'S CUT-OFF ANSWERS AS AN UNKNOWN BEARER DOES, so the instant cannot be found by probing: a caller
     learns only that this bearer does not work, and the operator who set the instant already knows why. */
  if (endedByCutOff(deps.validFrom, row.created_at)) return null;
  if (row.parent_id !== null) {
    if (row.parent_person === null || row.parent_person !== row.person_id || row.grand !== null) return null;
    if (row.parent_revoked !== null || (row.parent_expires !== null && row.parent_expires <= now)) return null;
    if (endedByCutOff(deps.validFrom, row.parent_created)) return null;
    if (row.parent_scope === null || rank(row.scope) > rank(row.parent_scope)) return null;
  }
  const own = narrowOf(row.narrow);
  const parents = narrowOf(row.parent_narrow);
  /* A NARROWING THAT CANNOT BE READ IS A KEY HELD TO LESS THAN ANYBODY CAN SAY, so it opens nothing. */
  if (own === undefined || parents === undefined) return null;
  return { row, narrows: [parents, own].filter((n): n is Narrow => n !== null) };
}

/** Where a scope stands in `read ⊂ propose ⊂ write`. */
const rank = (scope: Scope): number => SCOPES.indexOf(scope);

/**
 * A bearer, checked.
 *
 * THE HASH IS COMPARED AND THE SECRET IS NEVER STORED, so this is the only way a token is recognised
 * and there is no other. A revoked or expired row verifies as nothing — not as a lesser scope, and
 * not with a warning: a credential that half works is a credential nobody replaces. So does a row made
 * before the operator's cut-off, `deps.validFrom`, and a child whose parent is any of those (`heldBy`).
 *
 * AND THE USE IS RECORDED WITHOUT AN EVENT. `last_used_at` is what makes a listing say "this one has
 * not been used since March", which is how somebody decides what to revoke. An event per call would
 * be a ledger of an agent's polling. A child's use is its parent's too, so the app's row says it is in use.
 *
 * `build` IS WHAT THE COMMAND SAID IT WAS (`x-braindog-cli`), kept in the same statement, so a call costs no write more.
 * A value that is not a build (`isBuild`) is dropped and the build already kept stays: a header anybody can send is not
 * let into a column a person reads.
 *
 * AND A BUILD BUNDLED ON AN EARLIER DAY THAN THE ONE KEPT DOES NOT TAKE ITS PLACE (`olderBuild`). A bridge an agent
 * opened days ago answers with the build it started on until its session ends, beside the command updated since on the
 * same key; measured on 9 November, the MacBook's key went back and forth between 2026.11.05 from such a bridge and
 * 2026.11.09, and `arrived` read it red each time the old one called last. What the computer has installed is the
 * newest build its key has said; a checkout's (`dev+`) has no day and is kept as before.
 *
 * AT MOST ONCE A MINUTE A KEY, with `deps.uses`: the first use, a use a minute or more after the last one written, and a
 * use through another door or with a new build are written, and the rest are not (`USE_WRITE_MS`). On a busy record a
 * write per call was a storage write every answer waited for.
 */
export async function verifyToken(deps: TokenDeps, bearer: string, surface?: string, build?: string): Promise<Result<Verified>> {
  const held = await heldBy(deps, bearer);
  if (held === null) return no<Verified>('FORBIDDEN', 'That bearer is not known here.', { at: 'authorization' });
  const { row, narrows } = held;

  const door = surface ?? null;
  const kept = build !== undefined && isBuild(build) ? build : null;
  const ids = row.parent_id === null ? [row.id] : [row.id, row.parent_id];
  if (deps.uses === undefined || usesStale(deps.uses, ids, deps.nowMs, door, kept)) {
    deps.sql.exec(
      `UPDATE token SET last_used_at = ?, last_surface = ?,
         last_build = CASE WHEN ? IS NULL OR (last_build GLOB ? AND ? GLOB ? AND substr(?, 1, 10) < substr(last_build, 1, 10)) THEN last_build ELSE ? END
       WHERE id IN (?, ?)`,
      instant(deps.nowMs),
      door,
      kept,
      DATED_BUILD,
      kept,
      DATED_BUILD,
      kept,
      kept,
      row.id,
      row.parent_id ?? row.id,
    );
    if (deps.uses !== undefined) usesWritten(deps.uses, ids, deps.nowMs, door, kept);
  }
  const client = clientOf(row);
  const agent = row.parent_id !== null && row.scope === row.parent_scope ? row.parent_id : row.id;
  return ok({
    id: agent,
    person_id: row.person_id,
    scope: row.scope,
    reach: reachOf(row.reach),
    ...(client === undefined ? {} : { client }),
    ...(narrows.length === 0 ? {} : { narrows }),
    ...(row.parent_id === null ? {} : { child: { id: row.id, parent: row.parent_id } }),
  });
}

/** What a child key is minted with. `scope` and `narrow` left out are the parent's own. */
export type ChildArgs = { minutes: number; scope?: Scope; narrow?: Narrow };

/**
 * A short key under a working one (sharing plan 2.9), and the only copy of its secret. HOST-ONLY: the record's
 * `mintChild` is never a route, and the parent is proved by its bearer, never named by its id.
 *
 * NEVER MORE THAN ITS PARENT. The same person; a scope no higher; a life that ends at `minutes` from now or at the
 * parent's end, whichever is first; the parent's reach and app; and its narrowing ANDed onto the parent's
 * (`verifyToken` reads both). A child has no children (one deep), counts for nothing against the plan's agents
 * (`liveAgents`), writes no event (its parent's grant is the line the log keeps), and dies with its parent.
 */
export async function mintChild(deps: TokenDeps, bearer: string, args: ChildArgs): Promise<Result<Minted>> {
  const minutes = args?.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > CHILD_MINUTES_MOST)
    return no<Minted>('OUT_OF_BOUNDS', `A child key lasts between one minute and ${CHILD_MINUTES_MOST}, and this one asked for ${String(minutes)}.`, { at: 'minutes' });
  if (args.scope !== undefined && !(SCOPES as readonly string[]).includes(args.scope))
    return no<Minted>('ENUM_VALUE_UNKNOWN', `${String(args.scope)} is not a scope a token can hold.`, { at: 'scope', allowed: SCOPES });
  if (args.narrow !== undefined) {
    const bad = narrowFault(args.narrow);
    if (bad !== null) return no<Minted>('VALUE_MALFORMED', `A key is narrowed to lists, a project, a condition, rows or a share. ${bad}`, { at: 'narrow' });
  }

  const held = await heldBy(deps, bearer);
  if (held === null) return no<Minted>('FORBIDDEN', 'That key no longer works, so nothing can be minted under it.', { at: 'parent' });
  const parent = held.row;
  if (parent.parent_id !== null) return no<Minted>('FORBIDDEN', 'A child key has no children of its own.', { at: 'parent' });
  const scope = args.scope ?? parent.scope;
  if (rank(scope) > rank(parent.scope))
    return no<Minted>('FORBIDDEN', `A child key holds at most its parent's scope, ${parent.scope}, and this asked for ${scope}.`, { at: 'scope' });

  const record = deps.recordId()!;
  const secret = b64url(deps.random(32));
  const id = `t_${deps.mint()}`;
  const at = instant(deps.nowMs);
  const asked = deps.nowMs + minutes * 60_000;
  const ends = parent.expires_at === null ? asked : Math.min(asked, Date.parse(parent.expires_at));
  const expires = instant(ends);
  deps.sql.exec(
    'INSERT INTO token (id, person_id, hash, scope, reach, label, created_at, expires_at, client_id, client_kind, host) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    parent.person_id,
    await deps.digest(secret),
    scope,
    parent.reach,
    parent.label,
    at,
    expires,
    parent.client_id,
    parent.client_kind,
    parent.host,
  );
  deps.sql.exec(
    'INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES (?, ?, ?, ?, ?)',
    id,
    parent.id,
    args.narrow === undefined ? null : JSON.stringify(args.narrow),
    parent.person_id,
    at,
  );
  return ok({ id, bearer: `${record}.${secret}`, scope, reach: reachOf(parent.reach), expires_at: expires });
}

/**
 * Let go of child keys past their end, and their `token_lens` rows: the record's sweep runs it. A child lives an hour,
 * so an app that has been connected a month would otherwise leave seven hundred rows nobody can use. Answers how many.
 */
export function pruneChildren(sql: Sql, nowMs: number): number {
  const gone = sql.all<{ id: string }>(
    `SELECT t.id AS id FROM token t JOIN token_lens l ON l.token_id = t.id
     WHERE l.parent_id IS NOT NULL AND t.expires_at IS NOT NULL AND t.expires_at <= ?`,
    instant(nowMs),
  );
  for (const { id } of gone) {
    sql.exec('DELETE FROM token_lens WHERE token_id = ?', id);
    sql.exec('DELETE FROM token WHERE id = ?', id);
  }
  return gone.length;
}

/**
 * A command's build: the day it was bundled and its commit, `2026.10.09+1a2b3c4`, as `apps/cli/scripts/bundle.mjs`'s
 * `TUPLE` holds it, or `dev+` and a commit from a checkout that was never bundled (`dev+0000000`). Seven to forty hex
 * digits, because `git rev-parse --short=7` answers more when seven are ambiguous.
 */
const BUILD = /^(?:\d{4}\.\d{2}\.\d{2}|dev)\+[0-9a-f]{7,40}$/u;

/** Whether a value is a build a key may keep. Nothing else is: no key, no path, no host. */
export const isBuild = (value: string): boolean => BUILD.test(value);

/**
 * A session on this key called a tool: `last_tool_at` moves to `at`.
 *
 * NO EVENT, for `verifyToken`'s reason: a tool call is not history, and an event per call would be a ledger of an agent's
 * work that the work's own rows already are. One statement, and a key that is not there changes nothing.
 */
export function noteTool(sql: Sql, tokenId: string, at: string): void {
  sql.exec('UPDATE token SET last_tool_at = ? WHERE id = ?', at, tokenId);
}
