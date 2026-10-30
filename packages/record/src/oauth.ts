/**
 * OAuth's store: the apps that may ask, the sign-ins waiting for a person, and the one-time codes that finish them.
 *
 * ON THE DIRECTORY'S SQL, BECAUSE NONE OF IT IS A RECORD'S. A client, a waiting request and a code exist before the
 * person has said which record they are for, so they cannot live inside one. The Cloud runs this over the Directory
 * object's storage and a self-host over its `directory.sqlite`, through the one `Sql` port.
 *
 * ITS OWN TABLES, MADE ON FIRST USE, AND `directory.ts` NEVER NAMES THEM. They are not in `SCHEMA`, `CARRIED` or
 * `LEFT_OUT`: `load()` counts the rows of every listed table, which would throw on a table a Directory that never saw
 * an OAuth client has not made. A Directory restored from a copy therefore comes back without them, and that loses
 * nothing a person holds: a client registers again (RFC 7591), and a request or a code lives for minutes. No CHECK
 * constraint either, because a closed list written into SQL is one the `closed-lists` gate reads, and every value here
 * is checked in `packages/host/src/oauth.ts` before it is written.
 *
 * NO COLUMN HOLDS A PERSON'S WORDS. A client's name and redirect addresses are the app's; a request holds the app's
 * PKCE challenge and its `state`; a code holds the record's id and a bearer sealed under the code itself, so this table
 * alone opens nothing (`packages/host/src/oauth.ts`, `sealBearer`). Erasure has nothing to take here (contracts §7.2).
 *
 * ONE CALL SHAPE, `answerOAuth(sql, clock, call)`, so the Cloud crosses to the Directory object in one RPC method, as
 * `billing` does, and the self-host calls the same function in its own process.
 */

import type { Clock, Sql } from '@braindog/ports';

/** An app that may ask a person for a token: registered by the app itself (`dcr`), or read from its metadata document (`cimd`). */
export type OAuthClient = { client_id: string; name: string; redirect_uris: string[]; source: 'dcr' | 'cimd'; created_at: number };

/** A sign-in held for ten minutes between the app's authorize and the person's answer. `scope` is the highest the app asked, or `''`. */
export type HeldRequest = { id: string; client_id: string; redirect_uri: string; challenge: string; scope: string; state: string; expires: number };

/** What a code finishes: the request it answers, as JSON of the four fields the token endpoint checks. */
export type CodeRequest = { client_id: string; redirect_uri: string; challenge: string; scope: string };

/** A one-time code, kept by its SHA-256 and never as itself, with the bearer sealed under the code. */
export type CodeRow = { code_hash: string; request: CodeRequest; record: string; bearer_sealed: string; expires: number };

/**
 * One refresh family: the app's long-lived way back to a bearer. Only hashes of the refresh tokens are kept, and the
 * bearer is sealed under each token that may open it, so this table alone opens nothing.
 */
export type RefreshRow = {
  id: string;
  client_id: string;
  record: string;
  scope: string;
  cur_hash: string;
  cur_sealed: string;
  prev_hash: string | null;
  prev_sealed: string | null;
  prev_until: number;
  /** When the family dies unless it is used: moved forward on every use, never past `ends`. */
  expires: number;
  /** When the bearer itself ends, which no refresh can move. */
  ends: number;
};

export type OAuthCall =
  | { op: 'family'; row: RefreshRow }
  | { op: 'refresh_get'; hash: string }
  | { op: 'refresh_rotate'; id: string; expect_cur: string; next: Pick<RefreshRow, 'cur_hash' | 'cur_sealed' | 'prev_hash' | 'prev_sealed' | 'prev_until' | 'expires'> }
  | { op: 'refresh_retry'; id: string; hash: string; expect_cur?: string }
  | { op: 'refresh_drop'; id: string }
  | { op: 'client'; client_id: string }
  | { op: 'register'; client: OAuthClient }
  | { op: 'hold'; request: HeldRequest }
  | { op: 'held'; id: string }
  | { op: 'take'; id: string }
  | { op: 'code'; row: CodeRow }
  | { op: 'redeem'; code_hash: string }
  | { op: 'count'; key: string; most?: number };

/** What each `op` answers. `full` is a table at its ceiling, and nothing was written. `count` answers the seconds to wait, or `null`. */
export type OAuthAnswers = {
  family: 'ok' | 'full';
  refresh_get: (RefreshRow & { which: 'current' | 'previous' }) | null;
  refresh_rotate: boolean;
  refresh_retry: boolean;
  refresh_drop: 'ok';
  client: OAuthClient | null;
  register: 'ok' | 'full';
  hold: 'ok' | 'full';
  held: HeldRequest | null;
  take: HeldRequest | null;
  code: 'ok' | 'full';
  redeem: CodeRow | null;
  count: number | null;
};
export type OAuthAnswer = OAuthAnswers[OAuthCall['op']];

/**
 * The ceilings on what a stranger can make this store hold, each a named number.
 *
 * A request lives ten minutes and a code sixty seconds, and each is pruned before a new one is written, so their
 * ceilings bound what one burst can hold rather than what a day can.
 *
 * A CLIENT THAT NEVER CONNECTED IS PRUNED NOW (SEC8). Registrations were never pruned, so fifty thousand of them, each
 * a few thousand characters of addresses, answered `full` to every app after for good. A registered client is what an
 * app reconnects with after its token ends, so one that has a live family, or connected within `CLIENT_USED_KEEP`, is
 * kept; one registered `CLIENT_UNUSED_KEEP` ago that never connected is junk, and goes. A metadata document's row is a
 * copy the host reads again after a day (`DOCUMENT_LIFE` in `packages/host/src/oauth.ts`), so past it, with no family,
 * it goes too.
 */
const CLIENTS_MOST = 50_000;
const REQUESTS_MOST = 10_000;
const CODES_MOST = 10_000;
const FAMILIES_MOST = 50_000;
/**
 * The most sign-ins one registered app may have waiting at once (SEC8). One app on one machine waits on one person;
 * a hundred is a stranger holding the deployment's room with one client id. A metadata document's id is not held to it,
 * because one such id (an app like Claude's) is shared by everybody who uses that app, and a cap on it would be a way to
 * shut that app out for all of them; those are held by the per-place counts at the door instead.
 */
const REQUESTS_PER_CLIENT = 100;
const DAY = 86_400_000;
const CLIENT_UNUSED_KEEP = 30 * DAY;
const CLIENT_USED_KEEP = 180 * DAY;
const DOCUMENT_KEEP = DAY;
/** At most this many clients are pruned on one registration, so the prune is one bounded statement. */
const PRUNE_MOST = 500;

/**
 * What one address may ask of `/oauth/register` or `/oauth/authorize` in a window, as device starts are counted, and
 * then a wait until the window that began with the first one ends. Each door counts under its own key, so connecting
 * one app, which registers and then authorizes, spends one of each.
 */
const COUNTED_MOST = 10;
const COUNTED_WINDOW = 15 * 60_000;

/**
 * The tables, made on first use. `IF NOT EXISTS`, so running this on every call writes nothing once they exist.
 *
 * EVERY CALL RUNS IT, AND THAT IS CHEAPER THAN IT READS. Remembering "made" in a flag would be a flag that is wrong
 * after the Directory is restored from a copy, which comes back without these tables; SQLite answers `IF NOT EXISTS`
 * from the schema it already holds in memory.
 */
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS oauth_client (client_id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS oauth_request (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, scope TEXT NOT NULL, state TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS oauth_request_expires ON oauth_request(expires)',
  'CREATE TABLE IF NOT EXISTS oauth_code (code_hash TEXT PRIMARY KEY, request TEXT NOT NULL, record TEXT NOT NULL, bearer_sealed TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS oauth_code_expires ON oauth_code(expires)',
  'CREATE TABLE IF NOT EXISTS oauth_refresh (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, record TEXT NOT NULL, scope TEXT NOT NULL, cur_hash TEXT NOT NULL, cur_sealed TEXT NOT NULL, prev_hash TEXT, prev_sealed TEXT, prev_until INTEGER NOT NULL, expires INTEGER NOT NULL, ends INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS oauth_refresh_cur ON oauth_refresh(cur_hash)',
  'CREATE INDEX IF NOT EXISTS oauth_refresh_prev ON oauth_refresh(prev_hash)',
  'CREATE INDEX IF NOT EXISTS oauth_refresh_expires ON oauth_refresh(expires)',
  'CREATE INDEX IF NOT EXISTS oauth_refresh_client ON oauth_refresh(client_id)',
  'CREATE INDEX IF NOT EXISTS oauth_request_client ON oauth_request(client_id)',
  /* WHEN A CLIENT LAST STARTED A FAMILY, so a client that connected is told apart from junk that never did (SEC8). */
  'CREATE TABLE IF NOT EXISTS oauth_client_used (client_id TEXT PRIMARY KEY, at INTEGER NOT NULL)',
  /* THE TOKENS A FAMILY HAS LEFT BEHIND (SEC11, RD4), by hash only: the last `OLD_KEPT` of them, so one that comes back
     ends the family however many times the family has moved on since. */
  'CREATE TABLE IF NOT EXISTS oauth_refresh_old (hash TEXT PRIMARY KEY, id TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS oauth_refresh_old_id ON oauth_refresh_old(id)',
  /* WHAT THIS STORE HAS DONE ONCE, by name: today only `client_used`, below. */
  'CREATE TABLE IF NOT EXISTS oauth_once (what TEXT PRIMARY KEY)',
];

/**
 * THE CLIENTS REGISTERED BEFORE `oauth_client_used` WAS KEPT COUNT AS USED WHEN THEY REGISTERED, once (RD10). The table
 * started empty, so the first registration after it shipped pruned every month-old client with no live family, and a
 * connector whose family had ended (removed, or idle) was told `invalid_client` and had to be added again. Done once
 * and not on every prune, because doing it every time would keep a junk registration half a year instead of a month.
 */
function seedClientUsed(sql: Sql): void {
  if (sql.one<{ one: number }>("SELECT 1 AS one FROM oauth_once WHERE what = 'client_used'") !== undefined) return;
  sql.exec("INSERT INTO oauth_client_used (client_id, at) SELECT client_id, created_at FROM oauth_client WHERE source = 'dcr' ON CONFLICT (client_id) DO NOTHING");
  sql.exec("INSERT INTO oauth_once (what) VALUES ('client_used') ON CONFLICT (what) DO NOTHING");
}

/**
 * How many tokens a family remembers past the one just replaced. Remembering only that one let a thief roll past it: a
 * replay inside the grace handed over the current token, two quick refreshes pushed the app's copy out of the previous
 * slot, and the app's next refresh was a plain `invalid_grant` that left the thief holding the family.
 */
const OLD_KEPT = 8;

/** A family gone, with the tokens it left behind. */
function dropFamily(sql: Sql, id: string): void {
  sql.exec('DELETE FROM oauth_refresh_old WHERE id = ?', id);
  sql.exec('DELETE FROM oauth_refresh WHERE id = ?', id);
}

/**
 * The clients nothing holds on to: a registration that never connected and is a month old, one that last connected half
 * a year ago, and a metadata document's copy a day old, each with no family, no waiting sign-in and no code.
 */
const PRUNE = `DELETE FROM oauth_client WHERE rowid IN (
  SELECT c.rowid FROM oauth_client c
   WHERE ((c.source = 'dcr' AND c.created_at <= ?1) OR (c.source = 'cimd' AND c.created_at <= ?2))
     AND NOT EXISTS (SELECT 1 FROM oauth_refresh r WHERE r.client_id = c.client_id)
     AND NOT EXISTS (SELECT 1 FROM oauth_request q WHERE q.client_id = c.client_id)
     AND NOT EXISTS (SELECT 1 FROM oauth_code k WHERE json_extract(k.request, '$.client_id') = c.client_id)
     AND NOT EXISTS (SELECT 1 FROM oauth_client_used u WHERE u.client_id = c.client_id AND u.at > ?3)
   LIMIT ?4)`;

/**
 * One strike for a key in the Directory's `dir_fail`, in one statement, answering the count and when the window began.
 *
 * THE LOCKOUT'S OWN TABLE AND ITS OWN FOUR COLUMNS, WITH A KEY NOBODY ELSE WRITES. `identity.ts` keeps its statement to
 * itself, so this is a second statement over the same table rather than a call into it, and `until` is left `NULL`:
 * the sign-in path's pruning (`COALESCE(until, first + window) <= now`) then clears these rows after the same fifteen
 * minutes, and this file prunes its own as well. The count stops one past the ceiling, so a flood holds one row.
 * `?1` the key, `?2` now, `?3` now minus the window, `?4` the ceiling.
 */
const COUNT = `INSERT INTO dir_fail (key, n, first, until) VALUES (?1, 1, ?2, NULL)
ON CONFLICT (key) DO UPDATE SET
  n     = CASE WHEN first <= ?3 THEN 1 ELSE MIN(n + 1, ?4 + 1) END,
  first = CASE WHEN first <= ?3 THEN ?2 ELSE first END
RETURNING n, first`;

/** The prefix every key this file counts under starts with, so its own pruning touches nothing of sign-in's. */
const COUNTED_PREFIX = 'oauth.';

type ClientRow = { client_id: string; name: string; redirect_uris: string; source: string; created_at: number };
type CodeStored = { code_hash: string; request: string; record: string; bearer_sealed: string; expires: number };

/** A stored list of addresses, read back as the list it was, and empty for anything else. */
const urisOf = (text: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
};

const clientOf = (row: ClientRow | undefined): OAuthClient | null =>
  row === undefined ? null : { client_id: row.client_id, name: row.name, redirect_uris: urisOf(row.redirect_uris), source: row.source === 'cimd' ? 'cimd' : 'dcr', created_at: row.created_at };

/** A stored code's request, or `null` for text that is not the four fields this file wrote. */
const codeRequestOf = (text: string): CodeRequest | null => {
  try {
    const x = JSON.parse(text) as Record<string, unknown>;
    const { client_id, redirect_uri, challenge, scope } = x;
    if (typeof client_id !== 'string' || typeof redirect_uri !== 'string' || typeof challenge !== 'string' || typeof scope !== 'string') return null;
    return { client_id, redirect_uri, challenge, scope };
  } catch {
    return null;
  }
};

const HELD = 'id, client_id, redirect_uri, challenge, scope, state, expires';

const count = (sql: Sql, table: 'oauth_client' | 'oauth_request' | 'oauth_code'): number => Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);

/**
 * One call against the store. Synchronous, so a Durable Object answers it without yielding between the read and the
 * write that depends on it: `take` and `redeem` delete what they return in the same statement, so a request is answered
 * once and a code is spent once, however many callers race for it.
 */
export function answerOAuth<C extends OAuthCall>(sql: Sql, clock: Clock, call: C): OAuthAnswers[C['op']];
export function answerOAuth(sql: Sql, clock: Clock, call: OAuthCall): OAuthAnswer {
  for (const statement of SCHEMA) sql.exec(statement);
  const now = clock.now();
  switch (call.op) {
    case 'family': {
      const r = call.row;
      return sql.transactionSync(() => {
        sql.exec('DELETE FROM oauth_refresh_old WHERE id IN (SELECT id FROM oauth_refresh WHERE expires <= ?)', now);
        sql.exec('DELETE FROM oauth_refresh WHERE expires <= ?', now);
        if (Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM oauth_refresh')?.n ?? 0) >= FAMILIES_MOST) return 'full' as const;
        sql.exec(
          'INSERT INTO oauth_refresh (id, client_id, record, scope, cur_hash, cur_sealed, prev_hash, prev_sealed, prev_until, expires, ends) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          r.id, r.client_id, r.record, r.scope, r.cur_hash, r.cur_sealed, r.prev_hash, r.prev_sealed, r.prev_until, r.expires, r.ends,
        );
        sql.exec('INSERT INTO oauth_client_used (client_id, at) VALUES (?, ?) ON CONFLICT (client_id) DO UPDATE SET at = excluded.at', r.client_id, now);
        return 'ok' as const;
      });
    }
    case 'refresh_get': {
      const row = sql.one<RefreshRow>('SELECT id, client_id, record, scope, cur_hash, cur_sealed, prev_hash, prev_sealed, prev_until, expires, ends FROM oauth_refresh WHERE (cur_hash = ?1 OR prev_hash = ?1) AND expires > ?2 AND ends > ?2', call.hash, now);
      if (row === undefined) {
        /* A TOKEN THE FAMILY LEFT BEHIND, BACK AGAIN, is a copy in somebody else's hands: the family goes (SEC11). */
        const left = sql.one<{ id: string }>('SELECT id FROM oauth_refresh_old WHERE hash = ?', call.hash);
        if (left !== undefined) dropFamily(sql, left.id);
        return null;
      }
      if (row.cur_hash === call.hash) return { ...row, which: 'current' as const };
      /* THE PREVIOUS TOKEN AFTER ITS GRACE IS A REPLAY, so the whole family goes: whoever holds a copy loses it, and the
         app signs in again. Inside the grace it is a client that never saw our answer and is retrying. */
      if (row.prev_until > now) return { ...row, which: 'previous' as const };
      dropFamily(sql, row.id);
      return null;
    }
    case 'refresh_rotate': {
      const n = call.next;
      return sql.transactionSync(() => {
        const was = sql.one<{ cur_hash: string; prev_hash: string | null }>('SELECT cur_hash, prev_hash FROM oauth_refresh WHERE id = ?', call.id);
        /* COMPARE-AND-SET ON THE CURRENT HASH, so two retries racing make one new token and the loser looks again. */
        const moved = sql.one<{ id: string }>(
          'UPDATE oauth_refresh SET cur_hash = ?, cur_sealed = ?, prev_hash = ?, prev_sealed = ?, prev_until = ?, expires = MIN(?, ends) WHERE id = ? AND cur_hash = ? RETURNING id',
          n.cur_hash, n.cur_sealed, n.prev_hash, n.prev_sealed, n.prev_until, n.expires, call.id, call.expect_cur,
        );
        if (moved === undefined || was === undefined) return false;
        /* WHAT THE ROTATION PUSHED OUT is remembered, the newest `OLD_KEPT` of it, so its return ends the family. */
        for (const left of [was.prev_hash, was.cur_hash]) {
          if (left === null || left === n.cur_hash || left === n.prev_hash) continue;
          sql.exec('INSERT INTO oauth_refresh_old (hash, id) VALUES (?, ?) ON CONFLICT (hash) DO NOTHING', left, call.id);
        }
        sql.exec(
          'DELETE FROM oauth_refresh_old WHERE id = ?1 AND rowid NOT IN (SELECT rowid FROM oauth_refresh_old WHERE id = ?1 ORDER BY rowid DESC LIMIT ?2)',
          call.id, OLD_KEPT,
        );
        return true;
      });
    }
    case 'refresh_retry': {
      /* A RETRY INSIDE THE GRACE IS ANSWERED WHILE THE FAMILY HAS NOT MOVED SINCE (RE3 of the review of 30 Oct, e). It was
         answered once (RD4), so three calls hitting expiry together with one token signed the app out: the first
         rotated, the second spent the grace and the third ended the family. A family that has moved on still ends when
         the replaced token comes back (the host's check), and so does any token a rotation pushed out
         (`oauth_refresh_old`), which is the takeover RD4 was about. Nothing is written, so this only says the retry's
         answer is still the family's. */
      const still = sql.one<{ id: string }>(
        'SELECT id FROM oauth_refresh WHERE id = ?1 AND prev_hash = ?2 AND prev_until > ?3 AND (?4 IS NULL OR cur_hash = ?4)',
        call.id, call.hash, now, call.expect_cur ?? null,
      );
      return still !== undefined;
    }
    case 'refresh_drop':
      dropFamily(sql, call.id);
      return 'ok';
    case 'client':
      return clientOf(sql.one<ClientRow>('SELECT client_id, name, redirect_uris, source, created_at FROM oauth_client WHERE client_id = ?', call.client_id));
    case 'register': {
      const c = call.client;
      /* A METADATA DOCUMENT READ AGAIN REPLACES ITS OWN ROW, which is how a day-old copy is refreshed. A registered
         client's id is minted fresh by the host, so for one of those the conflict never happens. */
      const known = sql.one<{ one: number }>('SELECT 1 AS one FROM oauth_client WHERE client_id = ?', c.client_id) !== undefined;
      if (!known) {
        seedClientUsed(sql);
        sql.exec(PRUNE, now - CLIENT_UNUSED_KEEP, now - DOCUMENT_KEEP, now - CLIENT_USED_KEEP, PRUNE_MOST);
        sql.exec('DELETE FROM oauth_client_used WHERE at <= ? AND client_id NOT IN (SELECT client_id FROM oauth_client)', now - CLIENT_USED_KEEP);
      }
      if (!known && count(sql, 'oauth_client') >= CLIENTS_MOST) return 'full';
      sql.exec(
        `INSERT INTO oauth_client (client_id, name, redirect_uris, source, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (client_id) DO UPDATE SET name = excluded.name, redirect_uris = excluded.redirect_uris, source = excluded.source, created_at = excluded.created_at`,
        c.client_id,
        c.name,
        JSON.stringify(c.redirect_uris),
        c.source,
        c.created_at,
      );
      return 'ok';
    }
    case 'hold': {
      const r = call.request;
      return sql.transactionSync(() => {
        sql.exec('DELETE FROM oauth_request WHERE expires <= ?', now);
        if (count(sql, 'oauth_request') >= REQUESTS_MOST) return 'full' as const;
        /* ONE REGISTERED APP HOLDS AT MOST ITS SHARE (SEC8): one client and a thousand addresses held every request. */
        const dcr = sql.one<{ one: number }>("SELECT 1 AS one FROM oauth_client WHERE client_id = ? AND source = 'dcr'", r.client_id) !== undefined;
        if (dcr && Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM oauth_request WHERE client_id = ?', r.client_id)?.n ?? 0) >= REQUESTS_PER_CLIENT)
          return 'full' as const;
        sql.exec(`INSERT INTO oauth_request (${HELD}) VALUES (?, ?, ?, ?, ?, ?, ?)`, r.id, r.client_id, r.redirect_uri, r.challenge, r.scope, r.state, r.expires);
        return 'ok' as const;
      });
    }
    case 'held':
      return sql.one<HeldRequest>(`SELECT ${HELD} FROM oauth_request WHERE id = ? AND expires > ?`, call.id, now) ?? null;
    case 'take':
      return sql.one<HeldRequest>(`DELETE FROM oauth_request WHERE id = ? AND expires > ? RETURNING ${HELD}`, call.id, now) ?? null;
    case 'code': {
      const r = call.row;
      return sql.transactionSync(() => {
        sql.exec('DELETE FROM oauth_code WHERE expires <= ?', now);
        if (count(sql, 'oauth_code') >= CODES_MOST) return 'full' as const;
        sql.exec(
          'INSERT INTO oauth_code (code_hash, request, record, bearer_sealed, expires) VALUES (?, ?, ?, ?, ?)',
          r.code_hash,
          JSON.stringify(r.request),
          r.record,
          r.bearer_sealed,
          r.expires,
        );
        return 'ok' as const;
      });
    }
    case 'redeem': {
      /* SPENT BY BEING ASKED, LIVE OR NOT. The row goes whatever the host then finds wrong with the exchange, so a code
         that failed once can never be tried again with a better guess at the verifier. */
      const row = sql.one<CodeStored>('DELETE FROM oauth_code WHERE code_hash = ? RETURNING code_hash, request, record, bearer_sealed, expires', call.code_hash);
      if (row === undefined || row.expires <= now) return null;
      const request = codeRequestOf(row.request);
      return request === null ? null : { code_hash: row.code_hash, request, record: row.record, bearer_sealed: row.bearer_sealed, expires: row.expires };
    }
    case 'count': {
      const key = `${COUNTED_PREFIX}${call.key}`;
      sql.exec(`DELETE FROM dir_fail WHERE key LIKE '${COUNTED_PREFIX}%' AND until IS NULL AND first <= ?`, now - COUNTED_WINDOW);
      const row = sql.one<{ n: number; first: number }>(COUNT, key, now, now - COUNTED_WINDOW, call.most ?? COUNTED_MOST);
      /* FAIL CLOSED: a count that could not be read is a wait of the whole window, as the record's `counted` answers. */
      if (row === undefined) return Math.ceil(COUNTED_WINDOW / 1000);
      return row.n > (call.most ?? COUNTED_MOST) ? Math.max(1, Math.ceil((row.first + COUNTED_WINDOW - now) / 1000)) : null;
    }
  }
}
