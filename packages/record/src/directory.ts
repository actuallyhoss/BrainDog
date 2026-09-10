/**
 * The Directory: who somebody is, and which record a name means.
 *
 * ONE OBJECT FOR THE WHOLE INSTALLATION, and it holds exactly what a record cannot (ADR-061). A
 * record answers questions about itself; nobody inside one can answer *which records does this
 * email own*, because that question is about all of them at once. Putting identity tables in every
 * record would make that a fan-out across every customer, which is the shape that stops working at
 * the size where it starts to matter.
 *
 * A SLUG IS A NAME AND `rec_id` IS THE ADDRESS. `idFromName(rec_id)` is where the storage lives, so
 * renaming a record is a row in this table and nothing else — no migration, no copy, no window
 * where half the writes go to the old object. The Worker resolves the slug here first and hands the
 * `rec_id` to the platform, which is the whole of the hop.
 *
 * AND A RELEASED SLUG IS NEVER RE-CLAIMABLE. If `the-studio` renames itself to `halden` and the old
 * name goes back in the pool, every stale bookmark, saved link and API caller that still says
 * `the-studio` starts reading somebody else's record. That is the one failure a routing layer must
 * not have, and the price of preventing it is a tombstone row — which is cheap, because names are
 * not scarce. It is the same argument as never reusing a person's account handle.
 *
 * THE SAME SCHEMA ON BOTH HOSTS. On Cloud it is a Durable Object; on a self-host it is
 * `directory.sqlite` in the same process. One `Sql` port, so this file does not know which.
 */

import type { Clock, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { ulids } from '@braindog/kernel';

import { createAuth, type AuthConfig } from './identity.ts';

export type { AuthConfig, Reason } from './identity.ts';

/** The five a person can hold on a record. The record's own ladder, mirrored where membership lives. */
export const LEVELS = ['read', 'append', 'write', 'decide', 'owner'] as const;
export type Level = (typeof LEVELS)[number];

/**
 * The grammar of a slug, and it is `34-GRAMMARS` line 348's: `^[a-z][a-z0-9-]{1,31}$`.
 *
 * TWO TO THIRTY-TWO CHARACTERS, STARTING WITH A LETTER. The looser shape this held — anything
 * alphanumeric, up to sixty-three — accepted `2024`, accepted `x`, and accepted a forty-character
 * name, and 34 names the two places a slug lands that make each of those permanent: the inbound
 * email local part `<slug>@in.brain.dog`, and `<data>/<slug>/` on a self-host. There is no repair
 * path — a released name is a tombstone for ever — so the grammar is checked before the row.
 *
 * AND NOT ENDING IN A HYPHEN, which is the one place this is STRICTER than 34. `studio-@in.brain.dog`
 * is a name somebody has to type and read back over a phone. Refusing is recoverable in the second
 * before the row exists; accepting is not recoverable at all.
 *
 * IT IS CHECKED HERE AS WELL AS AT THE ROUTE, because this is where a name becomes durable. A route
 * that let something through would write it, and the row would outlive the bug.
 */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/** The address `provision` writes, when the caller has already created the object it names. */
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

/** Names the platform owns, or that would read as one. A slug is a path segment before it is a name. */
const RESERVED = new Set([
  /* 33 §4's own top-level surface, first: a slug that shadowed one of these would be a name the
     router reaches before the Directory does. `mcp` and `p` were missing. */
  'api', 'auth', 'mcp', 'a', 'p', 's', 'in', 'r', 'ws',
  /* And the words a name would read as the platform's rather than somebody's. */
  'admin', 'app', 'assets', 'static', 'www', 'new',
]);

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS dir_person (
  id         TEXT PRIMARY KEY,              -- 'p_01J…'
  email      TEXT NOT NULL,                 -- as typed; matched lower-cased
  name       TEXT,
  created_at TEXT NOT NULL,
  suspended_at TEXT                         -- set: every session refused, every sign-in refused
);
CREATE UNIQUE INDEX IF NOT EXISTS dir_person_email ON dir_person(lower(email));

CREATE TABLE IF NOT EXISTS dir_record (
  id         TEXT PRIMARY KEY,              -- 'rec_01J…' — the argument to idFromName. It NEVER changes.
  owner      TEXT NOT NULL DEFAULT '',      -- the founding owner. 33 §593: record_dir.owner_person
  created_at TEXT NOT NULL,
  closed_at  TEXT
);

-- A slug is a name for a record and a record has one live name. A released row stays as a tombstone:
-- re-issuing a name is how a stale link reads somebody else's record.
CREATE TABLE IF NOT EXISTS dir_slug (
  slug        TEXT PRIMARY KEY,
  record      TEXT NOT NULL,
  claimed_at  TEXT NOT NULL,
  released_at TEXT
);
CREATE INDEX IF NOT EXISTS dir_slug_record ON dir_slug(record, released_at);

-- WHICH RECORDS A PERSON CAN REACH, AND NOT WHAT THEY MAY DO THERE.
--
-- IT CARRIED A LEVEL AND THAT WAS A SECOND COPY OF ONE. The record's own member table is written by
-- invite and removeMember; this one was written by join and leave; the two live in databases that
-- cannot be written in one transaction, so the moment anybody was invited they disagreed and
-- nothing reconciled them. A level here is a promise the Directory cannot keep.
--
-- 33 §593 settles it: person_record is (person_id, rec_id) and nothing else. The Directory answers
-- WHICH record, the record answers WHAT MAY BE DONE -- which is what both hosts already did, since
-- each builds its CallContext level from kernel.access(person).
CREATE TABLE IF NOT EXISTS dir_member (
  person   TEXT NOT NULL,
  record   TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (person, record)
);

-- THE SCHEMA REVISION, IN A ROW, BECAUSE A PRAGMA IS NOT AVAILABLE EVERYWHERE.
-- This read PRAGMA user_version and wrote it, unguarded, and a Durable Object's SQLite
-- authorizer refuses the statement: "not authorized: SQLITE_AUTH", thrown out of the first line
-- of createDirectory. Since the Directory is opened on the FIRST call, the whole tenant map was
-- unreachable on the Cloud host, and a well-formed bearer for a record nobody has came back
-- 500 INTERNAL instead of 401. The kernel had already met this and wrapped its own PRAGMA in a
-- try/catch with the reason beside it ("a driver may not expose PRAGMA"); this is the same
-- lesson, learned in the one place that had not had it. The row is the truth, the pragma is a
-- courtesy to sqlite3 on a self-host's file, and neither is load-bearing alone.
CREATE TABLE IF NOT EXISTS dir_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- SIGN-IN. Five tables, and not one of them holds a value that opens anything: every id, link and
-- challenge is stored as an HMAC under the host's key (identity.ts), so a copy of this file signs
-- nobody in. Times are epoch milliseconds, because every question asked of them is arithmetic
-- against the clock.

-- A passkey: the public half, as the JWK WebCrypto imports. The private half never left the device.
CREATE TABLE IF NOT EXISTS dir_passkey (
  id         TEXT PRIMARY KEY,              -- the credential id, base64url, as the authenticator made it
  person     TEXT NOT NULL,
  jwk        TEXT NOT NULL,
  alg        INTEGER NOT NULL CHECK (alg IN (-7, -257)),
  sign_count INTEGER NOT NULL DEFAULT 0,
  label      TEXT,
  backed_up  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used  INTEGER
);
CREATE INDEX IF NOT EXISTS dir_passkey_person ON dir_passkey(person);

-- A browser session. The record column is the record it was opened on, so the browser holds one
-- opaque cookie rather than an id and a slug. prev_hash is the id a rotation replaced, good until
-- prev_until so requests already in flight with it are not refused.
CREATE TABLE IF NOT EXISTS dir_session (
  id_hash    TEXT PRIMARY KEY,
  person     TEXT NOT NULL,
  record     TEXT,
  expires    INTEGER NOT NULL,
  rotated_at INTEGER NOT NULL,
  authed_at  INTEGER NOT NULL,              -- the last proof: rotation never moves it
  prev_hash  TEXT,
  prev_until INTEGER
);
CREATE INDEX IF NOT EXISTS dir_session_prev ON dir_session(prev_hash);
CREATE INDEX IF NOT EXISTS dir_session_expires ON dir_session(expires);

-- A sign-in link (15 minutes) or a claim link (24 hours). Deleted by the statement that uses it.
CREATE TABLE IF NOT EXISTS dir_link (
  hash    TEXT PRIMARY KEY,
  person  TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('magic', 'claim')),
  expires INTEGER NOT NULL
);

-- A WebAuthn challenge, five minutes, for one ceremony and (on registration) one person. In a table
-- rather than in memory, because a Durable Object evicted mid-ceremony forgets its memory.
CREATE TABLE IF NOT EXISTS dir_challenge (
  hash    TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'assert')),
  person  TEXT,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dir_challenge_expires ON dir_challenge(expires);

-- The lockout: strikes per key (ip:, mint:, email:), capped at ten, locked for fifteen minutes.
CREATE TABLE IF NOT EXISTS dir_fail (
  key   TEXT PRIMARY KEY,
  n     INTEGER NOT NULL,
  first INTEGER NOT NULL,
  until INTEGER
);
`;

export type Person = { id: string; email: string; name: string | null; created_at: string };
export type Named = { record: string; slug: string };
/** A record this person can reach. What they may DO in it is the record's answer, not this one's. */
export type Membership = { record: string; slug: string | null; closed: boolean };

export type Directory = ReturnType<typeof createDirectory>;

/**
 * The Directory's own schema revision. `49 §5.1` step 4.
 *
 * THREE, and every step past one is a migration with a number: `TO_2`, then `TO_3`. It is here
 * rather than nowhere because a tenant map has the same problem a record does: a build that opens one
 * written by a NEWER build reads tables whose columns it does not know about, and every answer it
 * gives is confidently wrong about which record a name means. `FORMAT_NEWER_THAN_READER` is what the
 * format layer says (`03 §11`), and this is the one place the Directory can say it.
 */
export const DIRECTORY_VERSION = 3;

/**
 * From one to two: the level leaves `dir_member` and the founding owner joins `dir_record`.
 *
 * WRITTEN OUT RATHER THAN RE-CREATED. `CREATE TABLE IF NOT EXISTS` is a no-op over an existing
 * table, so a directory written by version 1 keeps its `level` column for ever unless something
 * says otherwise — which is the same silent-upgrade failure the version gate above exists to stop,
 * arriving from the other direction.
 *
 * THE OWNER IS RECOVERED FROM THE LEVEL BEFORE IT GOES. Version 1 wrote exactly one `owner` row per
 * record, in `provision`, and that person is what `dir_record.owner` now holds. A record whose owner
 * cannot be recovered keeps `''`, which `leave` reads as "this directory does not know who owns
 * this" and refuses on — the safe answer, and one somebody can fix by hand.
 */
const TO_2 = [
  /* THE COLUMN FIRST, because `CREATE TABLE IF NOT EXISTS` did not add it — which is the whole
     reason this list exists and was the first thing its own test caught. */
  `ALTER TABLE dir_record ADD COLUMN owner TEXT NOT NULL DEFAULT ''`,
  `UPDATE dir_record SET owner = COALESCE(
     (SELECT m.person FROM dir_member m WHERE m.record = dir_record.id AND m.level = 'owner' LIMIT 1), '')
   WHERE owner = ''`,
  'ALTER TABLE dir_member DROP COLUMN level',
];

/**
 * From two to three: sign-in.
 *
 * ONE COLUMN, BECAUSE THE FIVE NEW TABLES NEED NO MIGRATION. `SCHEMA` creates `dir_passkey`,
 * `dir_session`, `dir_link`, `dir_challenge` and `dir_fail` with `IF NOT EXISTS` on every open, and on
 * a version-2 file none of them exists yet. What `IF NOT EXISTS` cannot do is add a column to a table
 * that is already there, and `dir_person` is.
 */
const TO_3 = ['ALTER TABLE dir_person ADD COLUMN suspended_at TEXT'];

/**
 * Run it, and answer `null` when the driver will not.
 *
 * A NARROW HELPER AND NOT A GENERAL ONE. It wraps exactly the two statements whose availability
 * differs between `node:sqlite` and a Durable Object, and `null` is "this driver could not answer"
 * rather than "the answer is nothing" — which is why every caller of it says what to do with the
 * `null` rather than treating it as a zero.
 */
const attempt = <T>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/**
 * The Directory over one `Sql`.
 *
 * `auth` SWITCHES SIGN-IN ON, and without it `auth()` answers `methods` with "not configured" and
 * every other flow with 404. The tenant map does not need it, and a host that has no key to take the
 * MACs under must not be able to sign anybody in by accident.
 */
export function createDirectory(sql: Sql, clock: Clock, auth?: AuthConfig) {
  /* THE VERSION IS READ BEFORE THE DDL RUNS. `CREATE TABLE IF NOT EXISTS` over a newer schema is
     silent: every statement is a no-op, the object opens, and the first `resolve` answers from
     columns this build does not know the meaning of. A record refuses in that situation and the
     tenant map — which is the thing that decides WHICH record anybody reaches — did not.

     BOTH READS THROW ON THE HOST THEY ARE NOT FOR, so both are guarded. `dir_meta` does not exist
     until the DDL below has run once, and `PRAGMA user_version` is refused outright by a Durable
     Object's authorizer — which is what made this function throw `SQLITE_AUTH` out of its first
     line on the Cloud host, taking the whole tenant map with it.

     THE HIGHER OF THE TWO, and not the row in preference to the pragma. A newer build writes both,
     so either one reading high is a directory this build must not open; taking the row alone would
     let a downgrade past the check by reading the one source the newer build had also written low.
     A missing source is `0` here rather than a veto, because 0 is what a fresh directory is. */
  const stored = attempt(() => {
    const row = sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'");
    return row ? Number(row.value) : null;
  });
  const pragma = attempt(() => Number(sql.one<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0));
  const version = Math.max(stored ?? 0, pragma ?? 0);
  if (version > DIRECTORY_VERSION)
    throw new Error(
      `This directory was written by a newer BrainDog: it is at version ${version} and this build reads ${DIRECTORY_VERSION}. Upgrade, or point at a different data directory.`,
    );

  /* ONE SCRIPT, not split on semicolons: the comments in it carry the argument for the tombstone,
     and a naive split would cut one in half. Both adapters run a multi-statement script. */
  sql.exec(SCHEMA);

  /* AND AN OLDER ONE IS BROUGHT FORWARD. `IF NOT EXISTS` leaves an existing table exactly as it was,
     so the DDL above is the shape of a NEW directory and this is the only thing that changes an old
     one. Each step runs for the versions below it, `TO_2` before `TO_3`.

     THE VERSION ROW IS WRITTEN IN THE SAME TRANSACTION AS THE STEPS. Both steps hold a statement that
     throws when run twice (`DROP COLUMN`, `ADD COLUMN`), so a migration that committed while the row
     still said the old number would make the next open throw out of `createDirectory`.

     THE ROW IS WRITTEN EVERY TIME AND THE PRAGMA IS BEST EFFORT. Unconditional, because a directory
     that has been running on a version this build already reads may still have no `dir_meta` row —
     it was a pragma until today — and the row is what the next open reads first. */
  sql.transactionSync(() => {
    if (version === 1) for (const statement of TO_2) sql.exec(statement);
    if (version >= 1 && version < 3) for (const statement of TO_3) sql.exec(statement);
    sql.exec(
      "INSERT INTO dir_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(DIRECTORY_VERSION),
    );
  });
  if (version < DIRECTORY_VERSION) attempt(() => sql.exec(`PRAGMA user_version = ${DIRECTORY_VERSION}`));

  const mint = ulids(() => clock.now());
  const at = (): string => new Date(clock.now()).toISOString();

  const bad = (slug: string): string | null => {
    if (!SLUG.test(slug))
      return `${slug} is not a name: it starts with a letter, is two to thirty-two characters of lower-case letters, digits and hyphens, and does not end with one.`;
    if (RESERVED.has(slug)) return `${slug} is a name the platform uses for something else.`;
    return null;
  };

  /**
   * A name, resolved to the record it addresses.
   *
   * THE ONE FUNCTION THE ROUTER CALLS, and the reason it exists: the string it returns is the
   * argument to `idFromName`, and that string IS the tenant boundary. A released name resolves to
   * nothing — never to the record that used to hold it, and never to whoever asked for it next.
   */
  const resolve = (slug: string): Named | null => {
    /* AND A CLOSED RECORD RESOLVES TO NOTHING EITHER. `close()` releases every live slug in the same
       transaction, so today this join can only ever agree with `released_at` — which is exactly why
       it belongs here rather than in `close()`'s head. Two of the four readers checked and two did
       not, and the one thing standing between the other two and a wrong answer was that one method
       remembers to do both halves. */
    const row = sql.one<{ record: string; released_at: string | null; closed_at: string | null }>(
      `SELECT s.record AS record, s.released_at AS released_at,
              (SELECT r.closed_at FROM dir_record r WHERE r.id = s.record) AS closed_at
         FROM dir_slug s WHERE s.slug = ?`,
      slug,
    );
    if (!row || row.released_at || row.closed_at) return null;
    return { record: row.record, slug };
  };

  /* AND A CLOSED RECORD HAS NO NAME EITHER — the fourth reader, and the one the sweep missed. */
  const slugOf = (record: string): string | null =>
    sql.one<{ slug: string }>(
      `SELECT s.slug AS slug FROM dir_slug s
         JOIN dir_record r ON r.id = s.record AND r.closed_at IS NULL
        WHERE s.record = ? AND s.released_at IS NULL`,
      record,
    )?.slug ?? null;

  const personByEmail = (email: string): Person | null =>
    sql.one<Person>('SELECT id, email, name, created_at FROM dir_person WHERE lower(email) = lower(?)', email) ?? null;

  return {
    resolve,
    slugOf,
    personByEmail,

    /**
     * Sign-in: sessions, passkeys, links, challenges and the lockout, over the five `dir_` tables
     * above. `identity.ts` is the whole of it; this is where a host reaches it.
     */
    auth: createAuth(sql, clock, auth),

    /**
     * Whether a string is a name at all, and the sentence when it is not.
     *
     * EXPORTED SO THERE IS ONE ANSWER. `init` carried a third copy of the grammar that knew the
     * shape and not the reserved words, so `braindog init api` passed its regex, built a record, and
     * was refused here — at the end, with the directory and thirty-one tables already on disk.
     */
    bad,

    /**
     * Whether a name can be had, and if not, which kind of no it is.
     *
     * BEFORE ANYTHING IS WRITTEN, which is the whole reason it is a read of its own. `provision`
     * refuses a taken name correctly — and it refuses at the END of a sequence that has already
     * created a directory, a database and thirty-one tables. So a name somebody could never have had
     * cost them a half-made record on disk, and the retry hit "is already a record".
     *
     * THREE ANSWERS AND NOT TWO, because a tombstone is a different sentence: `taken` is a name to
     * choose around, and `released` is a name nobody will ever be given again — every stale link
     * still says it, and handing it out is how one of them reads another customer's record.
     */
    claimed: (slug: string): 'free' | 'taken' | 'released' => {
      const row = sql.one<{ released_at: string | null }>('SELECT released_at FROM dir_slug WHERE slug = ?', slug);
      return !row ? 'free' : row.released_at ? 'released' : 'taken';
    },

    /**
     * Whether this address is a record this installation created, and has not closed.
     *
     * THE ROUTER'S FIRST QUESTION WHEN THE BEARER CARRIES THE ADDRESS. `idFromName` on a name nobody
     * has creates the object rather than failing, so a router that addressed an unverified id would
     * let a forged bearer mint an empty, migrated, billable record — one per guess. Asked about an
     * id rather than a name, it is not an oracle: 26 random characters are not guessed.
     */
    knows: (record: string): boolean =>
      sql.one<{ n: number }>('SELECT 1 AS n FROM dir_record WHERE id = ? AND closed_at IS NULL', record) !== undefined,

    /** One person, by id. */
    person: (id: string): Person | null =>
      sql.one<Person>('SELECT id, email, name, created_at FROM dir_person WHERE id = ?', id) ?? null,

    /**
     * Somebody signs up, or signs in for the first time from an invitation.
     *
     * BY EMAIL, CASE-INSENSITIVELY, and the row is idempotent: two sign-ups from `Ada@x` and `ada@x`
     * are one person. Mail is case-insensitive in the half of it anybody types, and a product that
     * disagreed would give one human two accounts and two sets of records.
     */
    person$: (email: string, name?: string): Result<Person> =>
      /* IN A TRANSACTION, like every other write here. It is a check and then an insert, and the
         index behind it is `UNIQUE (lower(email))` — so the losing side of a race is a
         `SQLITE_CONSTRAINT` thrown out of a function whose entire contract is a `Result`, across a
         Durable Object RPC boundary, as a bare 500. Both hosts are single-threaded today and it
         cannot fire; it is one `await` in the wrong place away from firing for ever after. */
      sql.transactionSync(() => {
        const trimmed = email.trim();
        if (!trimmed.includes('@')) return no<Person>('VALUE_MALFORMED', `${email} is not an address.`, { at: 'email' });

        const already = personByEmail(trimmed);
        if (already) return ok(already);

        const id = `p_${mint()}`;
        sql.exec(
          'INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)',
          id,
          trimmed,
          name ?? null,
          at(),
        );
        return ok(sql.one<Person>('SELECT id, email, name, created_at FROM dir_person WHERE id = ?', id)!);
      }),

    /**
     * A record comes into being: an address, a name for it, and somebody who owns it.
     *
     * ONE TRANSACTION, because a record with no owner is a record nobody can reach and a name with
     * no record is a 404 that looks like a bug. Naming is provisioning on the platform; here it is
     * the row that says which name the platform is given.
     */
    provision: (args: { slug: string; email: string; name?: string; record?: string }): Result<Named & { person: string }> =>
      sql.transactionSync(() => {
        const wrong = bad(args.slug);
        if (wrong) return no<Named & { person: string }>('VALUE_MALFORMED', wrong, { at: 'slug' });
        if (args.record !== undefined && !REC_ID.test(args.record))
          return no<Named & { person: string }>(
            'VALUE_MALFORMED',
            `A record id is rec_ plus a 26-character ULID. ${args.record} is not.`,
            { at: 'record' },
          );

        /* `ALREADY_KNOWN` AND NOT `UNIQUE_VIOLATION`. 30's register puts the taken name here — "also
           a taken slug at sign-up (41; 51)" — and reserves `UNIQUE_VIOLATION` for the index as a
           backstop, which this is not: nothing was inserted, and the row was read on purpose. 51
           §5.8 says the sign-up route answers 422 `ALREADY_KNOWN` at `slug`, which is what a form
           branches on to say "pick another".

           ONE CODE, TWO SENTENCES. A tombstone is not the same fact as a name somebody holds, and
           the sentence says which — but what whoever is typing must do about it is identical, and a
           code they cannot act on differently only splits the client. */
        const taken = sql.one<{ released_at: string | null }>('SELECT released_at FROM dir_slug WHERE slug = ?', args.slug);
        if (taken)
          return no<Named & { person: string }>(
            'ALREADY_KNOWN',
            taken.released_at
              ? `${args.slug} was the name of another record and cannot be given out again.`
              : `${args.slug} is already somebody's record.`,
            { at: 'slug' },
          );

        /* AND THE ADDRESS IS CHECKED TOO, or the `INSERT` below violates the primary key and throws
           a `SQLITE_CONSTRAINT` out of a function whose entire contract is a `Result` — across a
           Durable Object RPC boundary, as a bare 500. That is the exact hazard `person$` above
           spends five lines arguing against, and this method INVITES it: re-running a half-done
           provision with the same id is the recovery path it advertises. */
        if (args.record !== undefined && sql.one('SELECT 1 FROM dir_record WHERE id = ?', args.record))
          return no<Named & { person: string }>(
            'ALREADY_KNOWN',
            `${args.record} is already a record here. It may need a name, but it does not need creating.`,
            { at: 'record' },
          );

        const person = personByEmail(args.email);
        if (!person) return no<Named & { person: string }>('OUT_OF_BOUNDS', `${args.email} has no account yet.`, { at: 'email' });

        /* THE CALLER MAY NAME THE RECORD, and on the hosted path it must. 51 §5.8 and §13 D21 both
           say sign-up writes the RECORD before the Directory rows — "a Directory row never points at
           a record that failed to initialise" — and that ordering was impossible to express while
           this minted the id itself and handed it back: the caller could not know what to create
           until this had already written all three rows.

           IT ALSO MAKES THE HALF-DONE CASE RECOVERABLE. Re-running a provision that failed after the
           object was created is the same call with the same id, rather than a second record and a
           name that can never be issued again. */
        const record = args.record ?? `rec_${mint()}`;
        const now = at();
        sql.exec('INSERT INTO dir_record (id, owner, created_at) VALUES (?, ?, ?)', record, person.id, now);
        sql.exec('INSERT INTO dir_slug (slug, record, claimed_at) VALUES (?, ?, ?)', args.slug, record, now);
        sql.exec('INSERT INTO dir_member (person, record, added_at) VALUES (?, ?, ?)', person.id, record, now);
        return ok({ record, slug: args.slug, person: person.id });
      }),

    /**
     * A record is renamed.
     *
     * THE STORAGE DOES NOT MOVE, and that is the whole point of the hop: `rec_id` is the address and
     * a slug is a label on it. The old name becomes a tombstone rather than going back in the pool —
     * every link anybody saved still says the old name, and giving it to somebody else is how one of
     * those links reads another customer's record.
     */
    rename: (from: string, to: string): Result<Named> =>
      sql.transactionSync(() => {
        const wrong = bad(to);
        if (wrong) return no<Named>('VALUE_MALFORMED', wrong, { at: 'slug' });

        const live = resolve(from);
        if (!live) return no<Named>('OUT_OF_BOUNDS', `There is no record called ${from}.`, { at: 'slug' });
        if (from === to) return ok(live);

        const taken = sql.one<{ released_at: string | null }>('SELECT released_at FROM dir_slug WHERE slug = ?', to);
        if (taken)
          return no<Named>(
            'ALREADY_KNOWN',
            taken.released_at ? `${to} was the name of another record and cannot be given out again.` : `${to} is already somebody's record.`,
            { at: 'slug' },
          );

        const now = at();
        sql.exec('UPDATE dir_slug SET released_at = ? WHERE slug = ?', now, from);
        sql.exec('INSERT INTO dir_slug (slug, record, claimed_at) VALUES (?, ?, ?)', to, live.record, now);
        return ok({ record: live.record, slug: to });
      }),

    /**
     * Which records this person can reach, and at what level.
     *
     * THE QUESTION THE DIRECTORY EXISTS FOR. It cannot be answered from inside a record without
     * asking every record there is, which is the shape that stops working at the size where the
     * question starts to matter.
     */
    recordsOf: (person: string): Membership[] =>
      sql
        .all<{ record: string; slug: string | null; closed_at: string | null }>(
          `SELECT m.record AS record,
                  (SELECT s.slug FROM dir_slug s WHERE s.record = m.record AND s.released_at IS NULL) AS slug,
                  (SELECT r.closed_at FROM dir_record r WHERE r.id = m.record) AS closed_at
             FROM dir_member m WHERE m.person = ? ORDER BY m.rowid`,
          person,
        )
        .map((r) => ({ record: r.record, slug: r.slug, closed: r.closed_at !== null })),

    /**
     * Can this person reach this record at all?
     *
     * THE WORKER'S SECOND QUESTION, after the slug — and the whole of it. It used to answer with a
     * LEVEL, which is a fact the Directory cannot keep true: the record's own `member` table is
     * written by `invite` and `removeMember`, this one by `join` and `leave`, and the two live in
     * databases that cannot be written in one transaction. The moment anybody was invited they
     * disagreed.
     *
     * BOTH HOSTS ALREADY IGNORED IT. The self-host builds its `CallContext` from
     * `kernel.access(person)` and the Worker does the same — with a comment on each saying the level
     * comes from the record and never from a constant. So this was a second answer to a question
     * nothing asked twice, kept correct by nothing.
     */
    reaches: (record: string, person: string): boolean =>
      sql.one(
        `SELECT 1 AS x FROM dir_member m
           JOIN dir_record r ON r.id = m.record AND r.closed_at IS NULL
          WHERE m.record = ? AND m.person = ?`,
        record,
        person,
      ) !== undefined,

    /**
     * Somebody can reach this record.
     *
     * IT TOOK A LEVEL AND NO LONGER DOES. What a person may do is `invite`'s to say, in the record,
     * where the levels are per register and the audit trail is an event. This says only that the
     * record is theirs to open — which is the question the Directory is for.
     */
    join: (record: string, person: string): Result<null> =>
      sql.transactionSync(() => {
        /* AND A CLOSED RECORD TAKES NOBODY. Its name is released and its storage is the platform's
           to delete; adding somebody mints access to a record whose name may already have been
           handed back, and `levelOf` is what the Worker builds a caller's context from. */
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ? AND closed_at IS NULL', record))
          return no<null>('OUT_OF_BOUNDS', `There is no open record ${record}.`, { at: 'record' });
        if (!sql.one('SELECT 1 AS x FROM dir_person WHERE id = ?', person))
          return no<null>('OUT_OF_BOUNDS', `There is no person ${person}.`, { at: 'person' });

        sql.exec(
          `INSERT INTO dir_member (person, record, added_at) VALUES (?, ?, ?)
           ON CONFLICT (person, record) DO NOTHING`,
          person,
          record,
          at(),
        );
        return ok(null);
      }),

    /**
     * Remove somebody.
     *
     * NEVER THE OWNER. A record its owner cannot reach is a record nobody can grant access to,
     * invite anybody into, or close — and the only way out of that is somebody with a database.
     *
     * THE OWNER IS `dir_record.owner` NOW, not the highest level in this table. That is the whole
     * gain: one row names one person, written once by `provision`, and it cannot drift from a level
     * somebody edited in the record. Moving ownership is a verb nothing has yet; when it exists, it
     * is the thing that writes this column.
     */
    leave: (record: string, person: string): Result<null> =>
      sql.transactionSync(() => {
        if (!sql.one('SELECT 1 AS x FROM dir_member WHERE record = ? AND person = ?', record, person)) return ok(null);
        const owner = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', record)?.owner;
        if (owner === person || owner === '' || owner === undefined)
          return no<null>(
            'LEVEL_REQUIRED',
            owner === person
              ? 'A record keeps its owner. Hand it over first.'
              : `This directory does not know who owns ${record}, so it cannot say who may be removed from it.`,
            { at: 'person' },
          );
        sql.exec('DELETE FROM dir_member WHERE record = ? AND person = ?', record, person);
        return ok(null);
      }),

    /**
     * A record is closed.
     *
     * THE NAME IS RELEASED AND THE ADDRESS IS KEPT. The storage is the platform's to delete, and
     * this row is what stops the name being handed to the next person who asks for it.
     */
    close: (record: string): Result<null> =>
      sql.transactionSync(() => {
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', record))
          return no<null>('OUT_OF_BOUNDS', `There is no record ${record}.`, { at: 'record' });
        const now = at();
        sql.exec('UPDATE dir_record SET closed_at = ? WHERE id = ? AND closed_at IS NULL', now, record);
        sql.exec('UPDATE dir_slug SET released_at = ? WHERE record = ? AND released_at IS NULL', now, record);
        return ok(null);
      }),

    /**
     * Every name this record has ever had, oldest first. What a redirect would be built from.
     *
     * BY `rowid` AND NOT BY `claimed_at`: a rename and the release it causes share an instant, and
     * ordering two rows written in the same millisecond by their timestamp is ordering them by
     * nothing in particular.
     */
    namesOf: (record: string): { slug: string; claimed_at: string; released_at: string | null }[] =>
      sql.all('SELECT slug, claimed_at, released_at FROM dir_slug WHERE record = ? ORDER BY rowid', record),
  };
}
