/**
 * Sign-in, over the Directory's tables. `12 §3` row 49, `12 §8`, `49 §4.2` and `§5.4` to `§5.10`, `51 §5.8`.
 *
 * ONE FUNCTION, `auth(call)`, BEHIND `createDirectory(sql, clock, auth)`. A host turns HTTP into an `AuthCall`
 * and the answer back into a status, a cookie and a body; everything that decides whether somebody is who they
 * say they are is here, once, for both hosts.
 *
 * NOTHING THAT OPENS ANYTHING IS STORED. A session id, a link token and a challenge are 32 random bytes that
 * live in a browser, a mailbox or a ceremony; the tables hold HMAC-SHA-256 of each under the host's key, with a
 * prefix per kind (`s:`, `l:`, `c:`) so a value minted as one can never be looked up as another. Changing the key
 * is the fleet-wide lever `12 §8` names: every session and every link stops matching at once, and no row is
 * walked.
 *
 * EVERY MAC IS TAKEN BEFORE ANY TRANSACTION. WebCrypto is asynchronous and `transactionSync` is not, so nothing
 * inside a transaction awaits; an `await` inside one would let another request in halfway through a write.
 *
 * ONE FAILURE, WORD FOR WORD. Every sign-in that does not sign somebody in answers `401 UNAUTHORIZED`, "That did
 * not sign you in.", whatever the reason, and the reason goes to `log`. A sign-in that said "no such passkey" or
 * "that link expired" would tell whoever is guessing which half of the guess was right.
 *
 * TIMES IN THESE TABLES ARE EPOCH MILLISECONDS, unlike the ISO text the older `dir_` tables carry, because every
 * question asked of them is arithmetic against the clock in one statement: "expired", "rotated a day ago",
 * "fifteen minutes since the first strike".
 */

import type { AssertionOptions, Auth, AuthCall, AuthResult, Clock, Methods, PasskeyInfo, RegistrationOptions, Sql, Who } from '@braindog/ports';

import { assertion, b64url, clientData, registration, same, unb64url, type Alg, type PublicJwk, type Why } from './webauthn.ts';

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
type Flow = AuthCall['flow'];

/** What `log` is told: a `Why` from the verifier, or one of the Directory's own. Never an address, never a token. */
export type Reason = Why | 'session' | 'unknown' | 'key' | 'link' | 'suspended' | 'locked' | 'reserve' | 'full';

/**
 * What a host hands the Directory to switch sign-in on.
 *
 * `mac` IS THE KEY EVERY STORED HASH IS TAKEN UNDER: 32 bytes or more, derived from the KEK on a self-host and
 * from `SESSION_SECRET` on the Worker. It is imported the moment the Directory is built, and `importKey` copies
 * it, so the host may zero its own buffer straight after.
 *
 * `rp` ABSENT MEANS NO PASSKEYS: the host decides, because only it knows whether its origin is one a browser
 * will run WebAuthn on. `magic` says the host can deliver mail. `key` is the self-host's server key, absent on
 * the Worker. `log` receives the reason for every refusal, and nothing that identifies anyone.
 */
export type AuthConfig = {
  mac: Uint8Array;
  rp?: { id: string; origin: string };
  magic: boolean;
  key?: { serverKey: string };
  log?: (line: { flow: Flow; reason: Reason }) => void;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Thirty days, and a rotation after every day of use extends it: `12 §3` row 49. */
const LIFE = 30 * DAY;
const ROTATE_AFTER = DAY;
/**
 * SIXTY SECONDS FOR THE ID A ROTATION REPLACED. The app sends `boot`, `version` and a route's calls in parallel,
 * all carrying the same cookie; the first to arrive rotates it, and the rest would be 401s if the old id died on
 * the spot (`49 §4.2` as written). A minute covers the requests already in flight and nothing longer.
 */
const GRACE = MINUTE;
/** Ten attempts are compared and the eleventh locks the key for fifteen minutes; older strikes are forgotten. */
const WINDOW = 15 * MINUTE;
const CHALLENGE_LIFE = 5 * MINUTE;
/** Live challenges past which minting refuses: minting is not locked out, so this is what bounds the table. */
const CHALLENGE_CAP = 10_000;
const MAGIC_LIFE = 15 * MINUTE;
const CLAIM_LIFE = DAY;

/** Every value this file mints is 32 random bytes in base64url, which is 43 characters and nothing else. */
const MINTED = /^[A-Za-z0-9_-]{43}$/;

/**
 * The lockout: reserve before compare, sticky, capped, forgetting, and cleared by a success. `49 §5.5`, amended
 * in two places (both below, both for the specification amendments).
 *
 * RESERVE BEFORE COMPARE. The strike is written before the secret is looked at, so a thousand guesses sent at
 * once all pay, rather than all being compared against a counter that has not moved yet.
 *
 * TEN ARE COMPARED AND THE ELEVENTH IS NOT. A reservation that finds ten strikes already there sets `until` and is
 * refused. `49 §5.5` set `until` on the tenth reservation (`n + 1 >= 10`), which refused the tenth attempt itself:
 * nine compares, and somebody whose tenth try was the right one was locked out by it. That is the first
 * departure, and it is also what makes `49 §8`'s "ten starts per fifteen minutes" true for sending links.
 *
 * STICKY. While `until` is in the future the answer is 429 and nothing is compared, so a correct guess during the
 * window is refused like any other and leaves the lock exactly where it was; a lock that lifted on a correct
 * guess would be an oracle.
 *
 * AND IT FORGETS. A count whose first strike is fifteen minutes old starts again at one, so a handful of typos
 * spread over a month from one office never add up to a lock.
 *
 * A SUCCESS CLEARS THE ADDRESS. When the server key, a passkey or a link signs somebody in, that attempt's `ip:`
 * row is deleted in the same transaction as the new session (`open`). An office behind one address signs many
 * people in on a Monday morning, every one of those sign-ins reserved a strike, and without the reset the tenth
 * sign-in of the morning would lock the office out. Clearing gives an attacker nothing: an address that can
 * succeed already holds a way in, and every secret compared here but the server key is 256 random bits. This is
 * the second departure: `49 §5.5` deletes only the `email:` key on success and leaves the IP key to expire. The
 * `mint:` and `email:` keys on sending a link are never cleared, because sending a link is not a sign-in.
 *
 * `?1` the key, `?2` now, `?3` now minus fifteen minutes, `?4` now plus fifteen minutes.
 */
const LOCKOUT = `INSERT INTO dir_fail (key, n, first, until) VALUES (?1, 1, ?2, NULL)
ON CONFLICT (key) DO UPDATE SET
  n     = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN 1 ELSE MIN(n + 1, 10) END,
  first = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN ?2 ELSE first END,
  until = CASE WHEN until IS NOT NULL AND until <= ?2 THEN NULL
               WHEN until IS NULL AND first <= ?3 THEN NULL
               WHEN n >= 10 THEN COALESCE(until, ?4) ELSE until END
RETURNING n, until`;

/**
 * A live session: by its id, or by the id it had until a rotation less than a minute ago, and only for a person
 * who is not suspended. `is_current` says which of the two matched, because only the current id may rotate.
 */
const LIVE = `SELECT s.id_hash AS id_hash, s.person AS person, s.record AS record, s.rotated_at AS rotated_at,
       s.authed_at AS authed_at, p.email AS email, s.id_hash = ?1 AS is_current
  FROM dir_session s JOIN dir_person p ON p.id = s.person AND p.suspended_at IS NULL
 WHERE (s.id_hash = ?1 OR (s.prev_hash = ?1 AND s.prev_until > ?2)) AND s.expires > ?2`;

type Row = { id_hash: string; person: string; record: string | null; rotated_at: number; authed_at: number; email: string; is_current: number };
type Found = { row: Row; rotated: { sid: string } | null };
type Minted = { sid: string; hash: string };
type Person = { id: string; email: string };
type Cookie = { session?: { sid: string } | 'clear' };

const NOT_YOU = 'That did not sign you in.';

const text = (x: unknown): string => (typeof x === 'string' ? x : '');
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const bytes = (x: unknown) => (typeof x === 'string' ? unb64url(x) : null);
/** A credential id: canonical base64url of 1 to 1023 bytes, which is at most 1364 characters. */
const credentialId = (x: unknown): string | null => (typeof x === 'string' && x.length > 1 && x.length <= 1364 && unb64url(x) ? x : null);

/**
 * `auth(call)`, or with no config, a Directory that answers `methods` with "not configured" and every other flow
 * with 404. That is the Worker without `SESSION_SECRET`: it says why sign-in is off rather than failing.
 */
export function createAuth(sql: Sql, clock: Clock, config?: AuthConfig): Auth {
  const encoder = new TextEncoder();

  if (config && config.mac.length < 32) throw new Error('The sign-in MAC key must be at least 32 bytes.');
  const macKey: Promise<Key> | null = config
    ? crypto.subtle.importKey('raw', new Uint8Array(config.mac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : null;
  /* THE SERVER KEY IS HELD AS ITS DIGEST, and a presented one is digested too, so the compare is over two
     32-byte values and takes the same time whatever either of them is. */
  const wanted: Promise<ArrayBuffer> | null = config?.key ? crypto.subtle.digest('SHA-256', encoder.encode(config.key.serverKey)) : null;

  const hmac = async (kind: 's:' | 'l:' | 'c:', value: string): Promise<string> => {
    const tag = new Uint8Array(await crypto.subtle.sign('HMAC', await macKey!, encoder.encode(kind + value)));
    let out = '';
    for (const b of tag) out += b.toString(16).padStart(2, '0');
    return out;
  };

  /** 32 random bytes as base64url: how a session id, a link and a challenge are all made. */
  const fresh = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));

  const minted = async (): Promise<Minted> => {
    const sid = fresh();
    return { sid, hash: await hmac('s:', sid) };
  };

  /** The MAC of a presented session id, or `null` when what was presented cannot be one. */
  const hashOf = async (sid: unknown): Promise<string | null> => (typeof sid === 'string' && MINTED.test(sid) ? hmac('s:', sid) : null);

  const say = (flow: Flow, reason: Reason): void => {
    try {
      config?.log?.({ flow, reason });
    } catch {
      /* A log that throws must not turn a refusal into a 500. */
    }
  };

  const rejected = (flow: Flow, reason: Reason, cookie: Cookie = {}): AuthResult => {
    say(flow, reason);
    return { status: 401, refusal: { code: 'UNAUTHORIZED', fix: NOT_YOU }, ...cookie };
  };

  /** A flow this host has not switched on. It says so, because the screen already knows from `methods`. */
  const off = (): AuthResult => ({ status: 404, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' } });

  /** A rotation, carried on whatever answer the call ends with, so the cookie never falls behind the row. */
  const carry = (found: Found): Cookie => (found.rotated ? { session: found.rotated } : {});

  /**
   * One strike against `key`, before anything is compared. `null` means go on; anything else is the answer.
   *
   * FAIL CLOSED. No row back, or a statement that threw, is a 503 and never a pass: a lockout that stops
   * counting when its table misbehaves is a lockout an attacker can switch off.
   */
  const reserve = (flow: Flow, key: string, now: number): AuthResult | null => {
    let row: { n: number; until: number | null } | undefined;
    try {
      row = sql.one<{ n: number; until: number | null }>(LOCKOUT, key, now, now - WINDOW, now + WINDOW);
    } catch {
      row = undefined;
    }
    if (!row) {
      say(flow, 'reserve');
      return { status: 503 };
    }
    if (row.until !== null && Number(row.until) > now) {
      say(flow, 'locked');
      return { status: 429, retryAfter: Math.ceil((Number(row.until) - now) / 1000) };
    }
    return null;
  };

  const persons = (): number => Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_person')?.n ?? 0);

  const livePerson = (id: string): Person | undefined =>
    sql.one<Person>('SELECT id, email FROM dir_person WHERE id = ? AND suspended_at IS NULL', id);

  const whoOf = (row: Row): Who => ({ person: row.person, email: row.email, record: row.record, provedAt: Number(row.authed_at) });

  /**
   * The session a presented id belongs to, rotated if it is a day old.
   *
   * ROTATION IS A COMPARE-AND-SET ON `rotated_at`. Two requests carrying the same day-old cookie both see a
   * rotation due; the first moves the row and the second changes nothing, answers with the row it read, and its
   * cookie is still good for a minute as the previous id. `authed_at` is never touched: rotation is not a proof.
   */
  const current = async (sid: unknown, now: number): Promise<Found | null> => {
    const hash = await hashOf(sid);
    if (hash === null) return null;
    const row = sql.one<Row>(LIVE, hash, now);
    if (!row) {
      /* Expired, or its person suspended: the row can never answer again, so it goes. */
      sql.exec('DELETE FROM dir_session WHERE id_hash = ?', hash);
      return null;
    }
    if (!row.is_current || now - Number(row.rotated_at) <= ROTATE_AFTER) return { row, rotated: null };
    const next = await minted();
    const moved = sql.one(
      `UPDATE dir_session SET id_hash = ?1, prev_hash = id_hash, prev_until = ?2, rotated_at = ?3, expires = ?4
        WHERE id_hash = ?5 AND rotated_at = ?6 RETURNING id_hash`,
      next.hash,
      now + GRACE,
      now,
      now + LIFE,
      hash,
      row.rotated_at,
    );
    return { row, rotated: moved ? { sid: next.sid } : null };
  };

  /** The record a new session opens on: one this person owns, else the first they joined, and never a closed one. */
  const recordOf = (person: string): string | null =>
    sql.one<{ record: string }>(
      `SELECT m.record AS record FROM dir_member m JOIN dir_record r ON r.id = m.record AND r.closed_at IS NULL
        WHERE m.person = ? ORDER BY r.owner = m.person DESC, m.rowid LIMIT 1`,
      person,
    )?.record ?? null;

  /**
   * A new session, inside the caller's transaction.
   *
   * THE PRESENTED ONE GOES FIRST. A cookie somebody planted before sign-in is deleted rather than promoted, so
   * session fixation has nothing to fix on; a signed-in browser signing in again gets a new id the same way.
   *
   * THE ADDRESS'S STRIKES GO TOO. `strike` is the `ip:` key this sign-in reserved, and a success clears it (see
   * `LOCKOUT` for why). In the same transaction as the session, so a signed-in address and a cleared count are
   * one fact rather than two writes that can disagree.
   *
   * AND THE DEAD ROWS GO WITH IT: expired sessions and lockout keys whose window has passed. Sign-in is the one
   * write every host makes regularly and nobody makes a thousand times a second.
   */
  const open = (person: Person, presented: string | null, next: Minted, now: number, strike: string): Who => {
    if (presented !== null) sql.exec('DELETE FROM dir_session WHERE id_hash = ?1 OR (prev_hash = ?1 AND prev_until > ?2)', presented, now);
    sql.exec('DELETE FROM dir_fail WHERE key = ?', strike);
    sql.exec('DELETE FROM dir_session WHERE expires <= ?', now);
    sql.exec('DELETE FROM dir_fail WHERE COALESCE(until, first + ?1) <= ?2', WINDOW, now);
    const record = recordOf(person.id);
    sql.exec(
      'INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)',
      next.hash,
      person.id,
      record,
      now + LIFE,
      now,
      now,
    );
    return { person: person.id, email: person.email, record, provedAt: now };
  };

  /** A challenge row, or `false` when 10,000 are already live and the host should answer 503. */
  const store = (hash: string, purpose: 'register' | 'assert', person: string | null, now: number): boolean =>
    sql.transactionSync(() => {
      sql.exec('DELETE FROM dir_challenge WHERE expires <= ?', now);
      if (Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_challenge')?.n ?? 0) >= CHALLENGE_CAP) return false;
      sql.exec('INSERT INTO dir_challenge (hash, purpose, person, expires) VALUES (?, ?, ?, ?)', hash, purpose, person, now + CHALLENGE_LIFE);
      return true;
    });

  /** Single use, live, for this ceremony and this person, in one statement: a second use finds nothing to delete. */
  const consume = (hash: string, purpose: 'register' | 'assert', person: string | null, now: number): boolean =>
    sql.one('DELETE FROM dir_challenge WHERE hash = ? AND purpose = ? AND person IS ? AND expires > ? RETURNING hash', hash, purpose, person, now) !==
    undefined;

  const digest = async (value: unknown): Promise<Uint8Array> =>
    typeof value === 'string' ? new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))) : new Uint8Array(0);

  const made = (c: unknown) => {
    if (!isObject(c) || !isObject(c.response)) return null;
    const id = credentialId(c.id);
    const clientDataJSON = bytes(c.response.clientDataJSON);
    const attestationObject = bytes(c.response.attestationObject);
    return id && clientDataJSON && attestationObject ? { id, clientDataJSON, attestationObject } : null;
  };

  const asserted = (c: unknown) => {
    if (!isObject(c) || !isObject(c.response)) return null;
    const r = c.response;
    const id = credentialId(c.id);
    const clientDataJSON = bytes(r.clientDataJSON);
    const authenticatorData = bytes(r.authenticatorData);
    const signature = bytes(r.signature);
    const absent = r.userHandle === undefined || r.userHandle === null;
    const userHandle = absent ? null : bytes(r.userHandle);
    if (!id || !clientDataJSON || !authenticatorData || !signature || (!absent && !userHandle)) return null;
    return { id, clientDataJSON, authenticatorData, signature, userHandle };
  };

  const auth = async (call: AuthCall): Promise<AuthResult> => {
    const flow = call.flow;
    if (!config) {
      if (flow !== 'methods') return off();
      const body: Methods = { configured: false, passkey: false, magic: false, key: false, firstRun: false, me: null };
      return { status: 200, body };
    }
    /* THE CLOCK IS READ ONCE, so every row one call writes shares an instant however long its awaits take. */
    const now = clock.now();
    const rp = config.rp;

    switch (call.flow) {
      case 'methods': {
        const found = call.sid === undefined ? null : await current(call.sid, now);
        const body: Methods = {
          configured: true,
          passkey: rp !== undefined,
          magic: config.magic,
          /* EXACTLY ONE. With nobody in the Directory the exchange has nobody to sign in, so offering it would be a door that cannot open. */
          key: config.key !== undefined && persons() === 1,
          firstRun: Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_passkey')?.n ?? 0) === 0,
          me: found ? whoOf(found.row) : null,
        };
        /* A cookie that names no session is cleared here too: this is the first call the app makes. */
        const cookie: Cookie = found ? carry(found) : call.sid === undefined ? {} : { session: 'clear' };
        return { status: 200, body, ...cookie };
      }

      case 'session': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        return { status: 200, body: whoOf(found.row), ...carry(found) };
      }

      /**
       * The self-host's server key for a session: `49 §5.7`, and the door the first passkey is registered behind.
       *
       * REFUSED WITH MORE THAN ONE PERSON. The key is owner-level and single-user by design (`12 §3`), so on a
       * Directory that has invited somebody it would be a way into an account that is not the key-holder's.
       */
      case 'key.exchange': {
        if (!config.key || !wanted) return off();
        const [presented, next, given, expected] = await Promise.all([hashOf(call.sid), minted(), digest(call.serverKey), wanted]);
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        if (persons() > 1)
          return {
            status: 403,
            refusal: { code: 'FORBIDDEN', fix: 'The server key only signs in where BrainDog has one person, and this one has more. Sign in with a passkey.' },
          };
        if (!same(given, new Uint8Array(expected))) return rejected(flow, 'key');
        const outcome = sql.transactionSync((): Who | Reason => {
          const only = sql.one<{ id: string; email: string; suspended_at: string | null }>('SELECT id, email, suspended_at FROM dir_person LIMIT 1');
          if (!only) return 'unknown';
          return only.suspended_at === null ? open(only, presented, next, now, strike) : 'suspended';
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: outcome, session: { sid: next.sid } };
      }

      /** Registration needs a live session, which stands in for attestation (`12 §8`). */
      case 'passkey.register.options': {
        if (!rp) return off();
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const person = found.row.person;
        const challenge = fresh();
        const hash = await hmac('c:', challenge);
        if (!store(hash, 'register', person, now)) {
          say(flow, 'full');
          return { status: 503, ...carry(found) };
        }
        const name = sql.one<{ name: string | null }>('SELECT name FROM dir_person WHERE id = ?', person)?.name ?? null;
        const body: RegistrationOptions = {
          challenge,
          rp: { id: rp.id, name: 'BrainDog' },
          user: { id: b64url(encoder.encode(person)), name: found.row.email, displayName: name ?? found.row.email },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          timeout: 300000,
          attestation: 'none',
          authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
          /* The passkeys this person already has, so a device that holds one is not asked to make a second. */
          excludeCredentials: sql
            .all<{ id: string }>('SELECT id FROM dir_passkey WHERE person = ? ORDER BY created_at, id', person)
            .map((k) => ({ type: 'public-key' as const, id: k.id })),
        };
        return { status: 200, body, ...carry(found) };
      }

      case 'passkey.register': {
        if (!rp) return off();
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const keep = carry(found);
        const person = found.row.person;
        const cred = made(call.credential);
        if (!cred) return rejected(flow, 'shape', keep);
        /* The challenge the browser carried is found and consumed first, so a response is good once whatever
           happens to it after. */
        const pre = clientData(cred.clientDataJSON, { type: 'webauthn.create', origin: rp.origin });
        if (!pre.ok) return rejected(flow, pre.why, keep);
        if (!consume(await hmac('c:', pre.value.challenge), 'register', person, now)) return rejected(flow, 'challenge', keep);
        const v = await registration(cred, { origin: rp.origin, rpId: rp.id, challenge: pre.value.challenge });
        if (!v.ok) return rejected(flow, v.why, keep);
        /* The id the browser reported must be the id the authenticator attested, or this is two responses spliced. */
        if (v.value.id !== cred.id) return rejected(flow, 'shape', keep);
        const label = text(call.label).trim().slice(0, 64) || null;
        const row = sql.one(
          `INSERT INTO dir_passkey (id, person, jwk, alg, sign_count, label, backed_up, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id`,
          v.value.id,
          person,
          JSON.stringify(v.value.jwk),
          v.value.alg,
          v.value.signCount,
          label,
          v.value.backedUp ? 1 : 0,
          now,
        );
        if (!row) return rejected(flow, 'dup', keep);
        const body: PasskeyInfo = { id: v.value.id, label, alg: v.value.alg, backedUp: v.value.backedUp, createdAt: now, lastUsed: null };
        return { status: 200, body, ...keep };
      }

      case 'passkey.assert.options': {
        if (!rp) return off();
        const challenge = fresh();
        if (!store(await hmac('c:', challenge), 'assert', null, now)) {
          say(flow, 'full');
          return { status: 503 };
        }
        const body: AssertionOptions = { challenge, rpId: rp.id, timeout: 300000, userVerification: 'preferred', allowCredentials: [] };
        return { status: 200, body };
      }

      case 'passkey.assert': {
        if (!rp) return off();
        const [presented, next] = await Promise.all([hashOf(call.sid), minted()]);
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        const cred = asserted(call.credential);
        if (!cred) return rejected(flow, 'shape');
        const pre = clientData(cred.clientDataJSON, { type: 'webauthn.get', origin: rp.origin });
        if (!pre.ok) return rejected(flow, pre.why);
        if (!consume(await hmac('c:', pre.value.challenge), 'assert', null, now)) return rejected(flow, 'challenge');
        const held = sql.one<{ person: string; jwk: string; alg: number; sign_count: number }>(
          'SELECT person, jwk, alg, sign_count FROM dir_passkey WHERE id = ?',
          cred.id,
        );
        if (!held) return rejected(flow, 'unknown');
        const v = await assertion(cred, {
          origin: rp.origin,
          rpId: rp.id,
          challenge: pre.value.challenge,
          jwk: JSON.parse(held.jwk) as PublicJwk,
          alg: held.alg as Alg,
          signCount: Number(held.sign_count),
          person: held.person,
        });
        if (!v.ok) return rejected(flow, v.why);
        const outcome = sql.transactionSync((): Who | Reason => {
          const person = livePerson(held.person);
          if (!person) return 'suspended';
          /* A COMPARE-AND-SET ON THE COUNT. Two assertions that verified against the same stored count are one
             authenticator used twice or a clone; only the first may move it. */
          const moved = sql.one(
            'UPDATE dir_passkey SET sign_count = ?, backed_up = ?, last_used = ? WHERE id = ? AND sign_count = ? RETURNING id',
            v.value.signCount,
            v.value.backedUp ? 1 : 0,
            now,
            cred.id,
            held.sign_count,
          );
          return moved ? open(person, presented, next, now, strike) : 'count';
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: outcome, session: { sid: next.sid } };
      }

      /**
       * A sign-in link, after two reservations: one per address asking and one per address asked about.
       *
       * AN UNKNOWN ADDRESS GETS THE SAME 200 AND NO MAIL. Sign-up is not a side door here, and an answer that
       * differed would say who has an account. The host sends the mail without waiting, so the time taken does
       * not say it either.
       */
      case 'magic.start': {
        if (!config.magic) return off();
        const email = text(call.email).trim();
        const linkToken = fresh();
        const hash = await hmac('l:', linkToken);
        const stop = reserve(flow, `mint:${text(call.ip)}`, now) ?? reserve(flow, `email:${email.toLowerCase()}`, now);
        if (stop) return stop;
        const person = email.includes('@')
          ? sql.one<Person>('SELECT id, email FROM dir_person WHERE lower(email) = lower(?) AND suspended_at IS NULL', email)
          : undefined;
        if (!person) {
          say(flow, 'unknown');
          return { status: 200, body: {} };
        }
        sql.transactionSync(() => {
          sql.exec('DELETE FROM dir_link WHERE expires <= ?', now);
          sql.exec('INSERT INTO dir_link (hash, person, purpose, expires) VALUES (?, ?, ?, ?)', hash, person.id, 'magic', now + MAGIC_LIFE);
        });
        return { status: 200, body: {}, mail: { to: person.email, linkToken } };
      }

      /**
       * A sign-in or claim link, redeemed once. Served whether or not mail is on: a claim link is delivered out
       * of band, and a link minted while mail was on is still owed its sign-in.
       *
       * THE PURPOSE IS PART OF THE MATCH, so a claim link presented as a sign-in link finds nothing, and neither
       * burns the other.
       */
      case 'magic.redeem': {
        const claim = 'claimToken' in call;
        const token = 'claimToken' in call ? call.claimToken : call.linkToken;
        const [presented, next, hash] = await Promise.all([
          hashOf(call.sid),
          minted(),
          typeof token === 'string' && MINTED.test(token) ? hmac('l:', token) : null,
        ]);
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        if (hash === null) return rejected(flow, 'shape');
        const outcome = sql.transactionSync((): Who | Reason => {
          const link = sql.one<{ person: string }>(
            'DELETE FROM dir_link WHERE hash = ? AND purpose = ? AND expires > ? RETURNING person',
            hash,
            claim ? 'claim' : 'magic',
            now,
          );
          if (!link) return 'link';
          const person = livePerson(link.person);
          return person ? open(person, presented, next, now, strike) : 'suspended';
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: outcome, session: { sid: next.sid } };
      }

      case 'passkeys': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const body: PasskeyInfo[] = sql
          .all<{ id: string; label: string | null; alg: number; backed_up: number; created_at: number; last_used: number | null }>(
            'SELECT id, label, alg, backed_up, created_at, last_used FROM dir_passkey WHERE person = ? ORDER BY created_at, id',
            found.row.person,
          )
          .map((k) => ({
            id: k.id,
            label: k.label,
            alg: k.alg as Alg,
            backedUp: k.backed_up === 1,
            createdAt: Number(k.created_at),
            lastUsed: k.last_used === null ? null : Number(k.last_used),
          }));
        return { status: 200, body, ...carry(found) };
      }

      /** Only the person's own passkeys, and the last one too: removing a lost device must never be refused. */
      case 'passkey.remove': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const gone = sql.one('DELETE FROM dir_passkey WHERE id = ? AND person = ? RETURNING id', text(call.id), found.row.person);
        if (!gone) return { status: 422, refusal: { code: 'OUT_OF_BOUNDS', fix: 'You have no passkey with that id.', at: 'id' }, ...carry(found) };
        return { status: 200, body: {}, ...carry(found) };
      }

      /** The row goes and the cookie is cleared, and an id that names nothing is signed out just the same. */
      case 'logout': {
        const hash = await hashOf(call.sid);
        if (hash !== null) sql.exec('DELETE FROM dir_session WHERE id_hash = ?1 OR (prev_hash = ?1 AND prev_until > ?2)', hash, now);
        return { status: 200, body: {}, session: 'clear' };
      }

      /**
       * A 24-hour claim link for a person the operator has just provisioned (`51 §5.8`). The host checks the
       * operator before this call; the link goes to the person out of band.
       */
      case 'claim.mint': {
        const email = text(call.email).trim();
        const claimToken = fresh();
        const hash = await hmac('l:', claimToken);
        const person = sql.one<Person>('SELECT id, email FROM dir_person WHERE lower(email) = lower(?) AND suspended_at IS NULL', email);
        if (!person) return { status: 422, refusal: { code: 'OUT_OF_BOUNDS', fix: 'There is no live person with that address.', at: 'email' } };
        sql.transactionSync(() => {
          sql.exec('DELETE FROM dir_link WHERE expires <= ?', now);
          sql.exec('INSERT INTO dir_link (hash, person, purpose, expires) VALUES (?, ?, ?, ?)', hash, person.id, 'claim', now + CLAIM_LIFE);
        });
        return { status: 200, body: { expires: now + CLAIM_LIFE }, mail: { to: person.email, claimToken } };
      }

      default:
        return off();
    }
  };

  return auth as Auth;
}
