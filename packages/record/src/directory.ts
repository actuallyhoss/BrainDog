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
import type { AccountCall, AccountClosed, AuthCall, AuthResult, Suspended, Who } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { ulids } from '@braindog/kernel';

import { createAuth, signInForgotten, type AuthConfig } from './identity.ts';
import type { DirectoryAuth, SessionAsk } from './identity.ts';

export type { AuthConfig, DirectoryAuth, Reason, SessionAsk } from './identity.ts';

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

/**
 * A SHA-256 in hex, lower-cased: the only shape of an inbound mail token this file will store.
 *
 * WHAT IT REFUSES IS THE TOKEN. An inbound token is `randomBytes(32).toString('base64url')`, which is
 * 43 characters and fails this test, so a caller that handed the raw value where the digest belongs
 * is refused with a sentence instead of writing a live credential into the tenant map. The Worker
 * checks the same shape at its own door (`apps/worker/src/route.ts`) because that one is reached by
 * a stranger; this one is here because a row outlives the request that wrote it.
 */
const DIGEST = /^[0-9a-f]{64}$/;

/** Names the platform owns, or that would read as one. A slug is a path segment before it is a name. */
const RESERVED = new Set([
  /* 33 §4's own top-level surface, first: a slug that shadowed one of these would be a name the
     router reaches before the Directory does. `mcp` and `p` were missing. */
  'api', 'auth', 'mcp', 'a', 'p', 's', 'in', 'r', 'ws',
  /* And the words a name would read as the platform's rather than somebody's. */
  'admin', 'app', 'assets', 'static', 'www', 'new',
  /* AND EVERY TOP-LEVEL WORD THE APP ROUTES, because the app now lives at `brain.dog/app/<slug>/…` and the first
     segment after `/app/` is a page or a record's name by this set alone (`loop/research-one-domain.md` §2.4). A
     record called `settings` would make `/app/settings/agents` two pages at once, for ever. `fonts` and `catalogue`
     are the static folders served under `/app` beside the pages. `test/directory.test.ts` reads the app's route and
     static folders and fails for any this set does not hold, so a route added later cannot fall behind it. */
  'audit', 'automations', 'catalogue', 'connect', 'decide', 'fonts', 'inbox', 'invite', 'jobs', 'packs', 'scripts', 'search',
  'settings', 'signin', 'signup', 'slash', 'start', 't', 'usage', 'v', 'vault',
]);

/**
 * A spoken id: one to three letters and then only digits, as `D41` or `SG31` (`19 §5`).
 *
 * `/app/d41` IS THE APP OPENING DECISION 41, the same shape `apps/web/src/routes/[id]/+page.svelte` matches, so a
 * record named `d41` is a name nobody could ever reach by it. Refused as a name the day it would be claimed, which
 * costs nothing while no record holds one and is permanent afterwards.
 */
const SPOKEN = /^[a-z]{1,3}[0-9]+$/;

/**
 * Whether a string could be a record's name, and the sentence when it cannot: the grammar, the platform's words and
 * the spoken-id shape. `null` is a name.
 *
 * AT MODULE SCOPE AND EXPORTED, because the Worker asks the same question of every path under `/app/` before any
 * Directory is open: a first segment this calls a name is a record's slug, and anything else is one of the app's own
 * pages (`apps/worker/src/route.ts`, `appPath`). Two copies of the set would be two answers to which one a path is.
 */
export function badSlug(slug: string): string | null {
  if (!SLUG.test(slug))
    return `${slug} is not a name: it starts with a letter, is two to thirty-two characters of lower-case letters, digits and hyphens, and does not end with one.`;
  if (RESERVED.has(slug)) return `${slug} is a name the platform uses for something else.`;
  if (SPOKEN.test(slug)) return `${slug} reads as a spoken id, like D41, and brain.dog/app/${slug} opens that item rather than a record.`;
  return null;
}

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
  closed_at  TEXT,
  plan       TEXT NOT NULL DEFAULT 'hosted' -- 'hosted', 'plus' or 'selfhost': the monthly allowance its scheduled actions run under
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

-- USAGE. What each record's scheduled actions used, by UTC day, scope and action: the account's ledger,
-- kept here and not in the record, because billing concerns the account (loop/DIRECTION.md 0b). A month is
-- the sum of its days, and an account is the sum of the records it owns. The host counts, from each run's
-- pull event, starting from the first run.
CREATE TABLE IF NOT EXISTS dir_usage_day (
  record   TEXT NOT NULL,
  day      TEXT NOT NULL,                   -- 'YYYY-MM-DD', UTC
  scope    TEXT NOT NULL,                   -- the action's project, or 'global'
  action   TEXT NOT NULL,                   -- the ingest id
  runs     INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  bytes    INTEGER NOT NULL DEFAULT 0,
  ms       INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  held     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (record, day, scope, action)
) WITHOUT ROWID;

-- Every run already counted, by its event id, so the same run reported twice is counted once. Kept forty
-- days, and a run older than that is not counted at all, so pruning this table can never count one twice.
CREATE TABLE IF NOT EXISTS dir_usage_run (
  record TEXT NOT NULL,
  event  TEXT NOT NULL,
  at     INTEGER NOT NULL,                  -- when the run was metered, epoch milliseconds
  PRIMARY KEY (record, event)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS dir_usage_run_at ON dir_usage_run(record, at);

-- SLASH'S ASKS, BY RECORD AND UTC DAY: how many it asked and the neurons they spent of the operator's included model.
-- The record keeps every ask in its own slash_call, and that is where its ceiling is held; this is the account's copy,
-- which the host hands across whole days at a time (meterSlash below), so a day's row is a total and not a sum of calls.
-- A TABLE AND NOT A COLUMN ON dir_usage_day, for the reason dir_inbound gives below: a column is a TO_5, and a TO_5
-- makes a Worker rollback an outage (loop/finish/contracts.md X4). Created on the next open, DIRECTORY_VERSION unmoved.
CREATE TABLE IF NOT EXISTS dir_usage_slash (
  record  TEXT NOT NULL,
  day     TEXT NOT NULL,                    -- 'YYYY-MM-DD', UTC
  asks    INTEGER NOT NULL DEFAULT 0,       -- every model call Slash made, on any tier, embeddings aside
  neurons INTEGER NOT NULL DEFAULT 0,       -- what they spent of the included model; 0 on the owner's own key
  PRIMARY KEY (record, day)
) WITHOUT ROWID;

-- FORWARDED MAIL: WHICH RECORD AN /in/email/<token> ADDRESS IS FOR.
--
-- THE DIGEST IS THE KEY AND THE TOKEN IS NOWHERE IN THIS FILE. That URL carries no record id, so the
-- token IS the lookup key, and a lookup key held in the clear is a credential in whatever index holds
-- it: anybody who could read this table would be able to read the mail of every record in it. The
-- host digests what the caller sent and hands across 64 hex characters that open nothing, which is the
-- same division a self-host makes by keeping only the digest of the file init wrote.
--
-- THE DIGEST IS THE PRIMARY KEY BECAUSE IT IS AN ADDRESS. Two records holding one digest would be two
-- records at one address, and the reader would have to pick; a primary key makes that unwritable
-- rather than a tie broken by LIMIT 1. One record holds at most one, which is what makes rotation a
-- replacement: see inbound$ below.
--
-- AND IT IS CREATED HERE AND IN NO MIGRATION STEP, which is the difference every TO_n below turns on.
-- CREATE TABLE IF NOT EXISTS cannot add a COLUMN to a table that already exists, and that is why TO_2,
-- TO_3 and TO_4 are written out statement by statement; a table that does not exist at all is
-- precisely what this statement is for, so the script creates it on the next open of a directory at
-- any version. DIRECTORY_VERSION therefore did not move: an older build reads no column here it does
-- not know about and answers nothing differently for the table being present, and a bump would refuse
-- every older build a directory it can still read correctly.
CREATE TABLE IF NOT EXISTS dir_inbound (
  token_sha256 TEXT PRIMARY KEY,           -- 64 lower-case hex. Never the token.
  record       TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS dir_inbound_record ON dir_inbound(record);

-- THE ACCOUNT'S STATE: a mailbox not yet proved, who pays for which record, and the Stripe events already applied.
--
-- NEW TABLES AND NOT ONE NEW COLUMN, for the reason dir_inbound gives above: a table that does not exist is
-- what CREATE TABLE IF NOT EXISTS is for, so every Directory at version 4 gains them on its next open and
-- DIRECTORY_VERSION does not move. A bump would make an older Worker refuse the Directory, and the Directory is one
-- object for every record, so rolling a Worker back would be an outage for everybody (loop/finish/ops.md 4.0 Rule 0).
--
-- NO CHECK ON ANY OF THEM, for the same reason: a CHECK is a list an older build cannot widen. purpose and state
-- are checked in code, in billing() below and in the sign-up flows that write dir_pending.

-- A mailbox not yet proved: a sign-up, or a new address accepting an invitation. Left out of every copy with
-- dir_link, because a restore that revived a pending link would let it be spent after the person had given up on it.
CREATE TABLE IF NOT EXISTS dir_pending (
  hash       TEXT PRIMARY KEY,              -- HMAC of the link's token under the Directory's key, as dir_link
  purpose    TEXT NOT NULL,                 -- 'signup' or 'invite', checked in code
  email      TEXT NOT NULL,                 -- lower-cased and trimmed
  payload    TEXT NOT NULL DEFAULT '{}',    -- signup: slug, name, tz; invite: the invitation and a name
  expires    INTEGER NOT NULL,              -- epoch ms; 24 hours for both
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dir_pending_expires ON dir_pending(expires);

-- One row per record somebody pays for. A record with no row is not billed and never lapses: every record the
-- operator provisioned has none, and a row is written only when a Stripe checkout for that record completes.
CREATE TABLE IF NOT EXISTS dir_billing (
  record       TEXT PRIMARY KEY,            -- rec_...
  person       TEXT NOT NULL,               -- who checked out
  customer     TEXT NOT NULL,               -- Stripe cus_...
  subscription TEXT,                        -- Stripe sub_..., null until the first subscription event
  price        TEXT,                        -- Stripe price_...
  state        TEXT NOT NULL,               -- 'active', 'past_due' or 'lapsed', checked in code
  period_end   INTEGER,                     -- epoch ms
  lapsed_at    INTEGER,                     -- set on entering 'lapsed', cleared on 'active'
  told         TEXT NOT NULL DEFAULT '',    -- the ladder's notices sent in this lapse: '', '0', '0,60', '0,60,83' or '0,60,83,90'
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dir_billing_customer ON dir_billing(customer);

-- A webhook event already applied, by its evt_ id, so Stripe delivering one twice changes the account once.
-- Pruned after forty days by the write that adds the next, the window dir_usage_run keeps a counted run's id for.
CREATE TABLE IF NOT EXISTS dir_stripe_event (
  id   TEXT PRIMARY KEY,                    -- evt_...
  type TEXT NOT NULL,
  at   INTEGER NOT NULL                     -- when it was first seen, epoch ms
);
`;

export type Person = { id: string; email: string; name: string | null; created_at: string };
export type Named = { record: string; slug: string };
/** A record this person can reach. What they may DO in it is the record's answer, not this one's. */
export type Membership = { record: string; slug: string | null; closed: boolean };

/**
 * What a record answers when it is asked directly: the level this person holds there, the lists they hold when that
 * level is `null`, and the record's own name.
 *
 * `level: null` ON ITS OWN MEANT TWO THINGS, and the switcher could tell neither from the other. A person the record
 * has removed answers `null`, and so does a person invited to one list, because `kernel.access` gives somebody with
 * only register rows no record-wide level. `research-invite-landing.md` probe3 measured what that cost: a colleague
 * who owned `books-co` and accepted one list on `the-studio` was shown `[books-co]` and nothing else, so the record
 * that had just admitted them was unreachable from every screen. `lists` is the second answer: absent or empty is
 * "not on this record", and a non-empty list with a `null` level is "on it, with these lists only".
 */
export type SwitcherAsk = { level: string | null; name: string | null; lists?: readonly string[] | null };
/**
 * One row of the switcher: a record this person can reach, its name, and the level they actually hold there.
 *
 * A PERSON WHO HOLDS LISTS AND NOT THE RECORD gets `level: null`, never a level nobody granted, plus the list ids in
 * `lists` and a word for the row in `held`. The word is here rather than in the web because the web draws `level`
 * raw, and a row whose level is `null` would draw nothing where every other row names what you may do.
 */
export type SwitcherRow = { slug: string; name: string; level: string } | { slug: string; name: string; level: null; lists: string[]; held: string };

/** The word a one-list row carries in `held`. One word for one list or five, so the row does not read as a count. */
export const SOME_LISTS = 'Some lists';

/** The two reads of a record `switcherAsk` needs, which is all of `kernel` it touches. */
export type SwitcherSource = {
  access(person: string): { level: string | null; registers: readonly string[] | null } | null;
  identity(): { name?: string | null } | null | undefined;
};

/**
 * What a record answers the switcher about this person, from its own tables.
 *
 * BOTH HOSTS ASK THROUGH THIS, `Record$.switcherRow` on the Worker and the self-host's `records` callback, because
 * each had written `access(person)?.level ?? null` by hand and each had the same hole in it. One function is one
 * place for the next answer to be added, and the test in `switcher-lists.test.ts` calls this and not a copy of it.
 */
export function switcherAsk(kernel: SwitcherSource, person: string): SwitcherAsk {
  const held = kernel.access(person);
  const name = kernel.identity()?.name ?? null;
  if (held === null) return { level: null, name };
  return held.level !== null ? { level: held.level, name } : { level: null, name, lists: [...(held.registers ?? [])] };
}

export type Directory = ReturnType<typeof createDirectory>;

/* ── plans and usage ─────────────────────────────────────────────────────── */

/**
 * The plans a record can be on. `hosted` is Cloud, the record at $12 a month; `plus` is Cloud Plus, at $29 a month with
 * a larger allowance (`loop/DIRECTION.md` §33, `HOSTED_PLANS` in `apps/worker/src/billing.ts`); `selfhost` is counted
 * and never limited.
 */
export const PLANS = ['hosted', 'plus', 'selfhost'] as const;
export type Plan = (typeof PLANS)[number];

/** One month's allowance: runs, requests, bytes fetched and run time in milliseconds. Failures are never limited. */
export type Allowance = { runs: number; requests: number; bytes: number; ms: number };

/**
 * What each plan allows a record's scheduled actions in a calendar month, UTC.
 *
 * THE OWNER'S DEFAULTS until he says otherwise (`loop/research-scheduled-actions.md` §4.4 and its first
 * question): twenty hourly actions are 14,600 runs, so 15,000 is the hosted record's allowance. `null` is
 * no limit.
 */
export const ALLOWANCE: Record<Plan, Allowance | null> = {
  hosted: { runs: 15_000, requests: 150_000, bytes: 1_000_000_000, ms: 50 * 3_600_000 },
  plus: { runs: 75_000, requests: 750_000, bytes: 5_000_000_000, ms: 250 * 3_600_000 },
  selfhost: null,
};

export type UsageTotals = { runs: number; requests: number; bytes: number; ms: number; failures: number; held: number };

/** One run to count: a row of the kernel's `ActionsRun.usage`, which is the run's `pull` event. */
export type RunUsage = { event: string; at: string; ingest: string; scope: string; usage: UsageTotals };

/** One record's usage over a range, and its month so far against its allowance. */
export type RecordUsage = {
  record: string;
  slug: string | null;
  plan: Plan;
  closed: boolean;
  month: { month: string; used: UsageTotals; allowance: Allowance | null; resets: string };
  totals: UsageTotals;
  projects: ({ scope: string } & UsageTotals)[];
  actions: ({ scope: string; action: string } & UsageTotals)[];
  days: ({ day: string } & UsageTotals)[];
  /** The deliveries and arrivals over the range, by action (`COUNTED_ONLY`): counted, and in none of the totals above. */
  counted: ({ action: string } & UsageTotals)[];
  /**
   * Slash's asks over the range and the neurons they spent, by day (`dir_usage_slash`): counted, and in none of the
   * totals above, because the record's own `ask_cap` holds them and the allowance never does (`loop/finish/contracts.md` X41).
   */
  slash: { asks: number; neurons: number; days: SlashDay[] };
};

/** One UTC day of a record's Slash asks, as the record's own ledger totals it: what `meterSlash` takes and `usage` answers. */
export type SlashDay = { day: string; asks: number; neurons: number };

/** What one `meterSlash` did with the days it was handed: taken, older than the window, and not a day at all. */
export type SlashTally = { taken: number; old: number; malformed: number };

/** Everything a person owns, summed. What `GET /account/usage` answers. */
export type AccountUsage = { from: string; to: string; totals: UsageTotals; records: RecordUsage[] };

/** What one `meterMany` did with the runs it was handed: counted new, already held, too old to count, and not runs at all. */
export type MeterTally = { counted: number; already: number; old: number; malformed: number };

const DAY_MS = 86_400_000;
/** How long a counted run's id is kept, and so how old a run may be and still be counted. */
const KEEP_RUNS_MS = 40 * DAY_MS;

/**
 * The most runs one `meterMany` takes: the nightly replay's batch, and the ceiling on one transaction of the one object
 * every record shares.
 */
export const METER_MANY_MAX = 500;

/**
 * How many UTC days back a record's Slash asks are handed to the ledger, and so the most days one `meterSlash` takes.
 *
 * THE WINDOW `dir_usage_run` KEEPS A RUN'S ID FOR, so the night that hands the runs again hands the asks over the same
 * days, and a day the record stopped reporting keeps the last total it was told.
 */
export const SLASH_DAYS = 40;

/**
 * The actions a record's ledger counts and its allowance never limits, by the prefix of their name: a delivery the
 * outbox sent (`deliver:notify.email`) and an arrival at an `/in` door (`in:webhook`), written by `@braindog/host`'s
 * `deliveryRun` and `arrivalRun`.
 *
 * COUNTED SO THE ACCOUNT CAN SEE THEM, NEVER LIMITED, because neither is work the record chose to run: one is a notice
 * it owes somebody and the other is a message somebody sent it. A scheduled action's run is named by its ingest and an
 * automation's by `rule:<id>`, and both count against the allowance (`loop/finish/decisions.md` C34).
 */
export const COUNTED_ONLY = ['deliver:', 'in:'] as const;

/**
 * The prefix of the rows that remember the owner was told: `notice:near` and `notice:held`, one each a month at most,
 * on the first of the month, with every count at zero (`notice` below).
 *
 * IN THE LEDGER'S OWN TABLE, NOT A NEW ONE, because a table would be a migration and the ledger is already carried,
 * copied and kept for as long as the month it remembers. Every read below leaves these rows out.
 */
const NOTICE = 'notice:';

/** The `COUNTED_ONLY` rows, as a condition. */
const COUNTED = COUNTED_ONLY.map((prefix) => `action LIKE '${prefix}%'`).join(' OR ');

/** The rows the allowance is read against, as a condition: every action but the `COUNTED_ONLY` ones and the notices. */
const LIMITED = `NOT (${COUNTED}) AND action NOT LIKE '${NOTICE}%'`;

/**
 * How far into an allowance the owner is told it is running out: the share of any one of the four meters.
 *
 * ONE NOTE AT THIS SHARE AND ONE WHEN FIRST HELD, a month (`loop/finish/shell.md` MTR-2), so an owner hears before the
 * record stops and hears again when it has, and never once a run.
 */
export const NOTICE_AT = 0.8;

/** A note the owner of a record is owed about its month, once: nearly at the allowance, or held at it. */
export type UsageNotice = { kind: 'near' | 'held'; record: string; slug: string | null; person: string; email: string | null; say: string };

/** A run to count, checked: its time in epoch milliseconds, or `null` for a row that is not a run. */
const runAt = (run: RunUsage): number | null => {
  const at = typeof run?.at === 'string' ? Date.parse(run.at) : Number.NaN;
  const u: unknown = run?.usage;
  const whole =
    typeof u === 'object' &&
    u !== null &&
    (['runs', 'requests', 'bytes', 'ms', 'failures', 'held'] as const).every((k) => {
      const n: unknown = (u as Record<string, unknown>)[k];
      return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    });
  const named = (s: unknown): boolean => typeof s === 'string' && s !== '';
  return named(run?.event) && Number.isFinite(at) && named(run?.ingest) && named(run?.scope) && whole ? at : null;
};

/**
 * One checked run into the ledger: its id first, and its day's row only when the id was not already there. The caller
 * holds the transaction, has pruned the ids older than the window, and has said `too old` for a run older than it.
 */
const countRun = (sql: Sql, record: string, run: RunUsage, at: number): 'counted' | 'already counted' => {
  if (sql.one('SELECT 1 AS x FROM dir_usage_run WHERE record = ? AND event = ?', record, run.event)) return 'already counted';
  const u = run.usage;
  sql.exec('INSERT INTO dir_usage_run (record, event, at) VALUES (?, ?, ?)', record, run.event, at);
  sql.exec(
    `INSERT INTO dir_usage_day (record, day, scope, action, runs, requests, bytes, ms, failures, held)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (record, day, scope, action) DO UPDATE SET
       runs = runs + excluded.runs, requests = requests + excluded.requests, bytes = bytes + excluded.bytes,
       ms = ms + excluded.ms, failures = failures + excluded.failures, held = held + excluded.held`,
    record,
    dayOf(at),
    run.scope,
    run.ingest,
    u.runs,
    u.requests,
    u.bytes,
    u.ms,
    u.failures,
    u.held,
  );
  return 'counted';
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const monthStart = (ms: number): number => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), 1);
const nextMonth = (ms: number): number => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth() + 1, 1);
const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const SUMS = 'SUM(runs) AS runs, SUM(requests) AS requests, SUM(bytes) AS bytes, SUM(ms) AS ms, SUM(failures) AS failures, SUM(held) AS held';
const totalsOf = (row: Record<string, unknown> | undefined): UsageTotals => ({
  runs: Number(row?.runs ?? 0),
  requests: Number(row?.requests ?? 0),
  bytes: Number(row?.bytes ?? 0),
  ms: Number(row?.ms ?? 0),
  failures: Number(row?.failures ?? 0),
  held: Number(row?.held ?? 0),
});

/** What a record has used up, in the words the held sentence says it in. */
const SPENT: Record<keyof Allowance, (limit: number) => string> = {
  runs: (n) => `its ${thousands(n)} runs`,
  requests: (n) => `its ${thousands(n)} requests`,
  bytes: (n) => `its ${thousands(n / 1_000_000_000)} GB of fetched data`,
  ms: (n) => `its ${thousands(n / 3_600_000)} hours of run time`,
};

const planOf = (value: string | undefined): Plan => ((PLANS as readonly string[]).includes(value ?? '') ? (value as Plan) : 'hosted');

/**
 * The Directory's own schema revision. `49 §5.1` step 4.
 *
 * FOUR, and every step past one is a migration with a number: `TO_2`, `TO_3`, then `TO_4`. It is here
 * rather than nowhere because a tenant map has the same problem a record does: a build that opens one
 * written by a NEWER build reads tables whose columns it does not know about, and every answer it
 * gives is confidently wrong about which record a name means. `FORMAT_NEWER_THAN_READER` is what the
 * format layer says (`03 §11`), and this is the one place the Directory can say it.
 */
export const DIRECTORY_VERSION = 4;

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
 * From three to four: usage.
 *
 * ONE COLUMN AGAIN. `dir_usage_day` and `dir_usage_run` are new tables, which `SCHEMA` creates on every open;
 * the plan is a column on a table that already exists. Every record already there is `hosted`, which is the
 * safe reading: a self-host sets its records to `selfhost`, and a limit that should not apply is a sentence
 * somebody reads, where a limit that should apply and did not is a bill nobody can explain.
 */
const TO_4 = ["ALTER TABLE dir_record ADD COLUMN plan TEXT NOT NULL DEFAULT 'hosted'"];

/**
 * The tables a copy of the Directory carries, in the order `dump` writes them and `load` reads them back.
 * `loop/research-restore.md` §6.
 *
 * EVERYTHING THAT SAYS WHO SOMEBODY IS AND WHERE A NAME LEADS. Without these every record survives a lost Directory
 * and nobody can reach one: `idFromName(rec_id)` still opens the object, and no slug, session or passkey leads there.
 * The tombstones travel inside `dir_slug`, so a name released before the loss stays released after it. The passkeys
 * are public halves and `dir_inbound` is digests, so nothing here opens anything on its own; it does hold every
 * address, which is why the host seals the lines before they are stored (`apps/worker/src/directory-copy.ts`).
 */
export const CARRIED = [
  'dir_person',
  'dir_record',
  'dir_slug',
  'dir_member',
  'dir_meta',
  'dir_passkey',
  'dir_usage_day',
  'dir_usage_run',
  'dir_usage_slash',
  /* WHO PAYS FOR WHICH RECORD, AND THE EVENTS ALREADY APPLIED. A restore that lost `dir_billing` would leave every
     paying record unbilled and every lapsed one open, and one that lost `dir_stripe_event` would apply a redelivered
     event a second time. */
  'dir_billing',
  'dir_stripe_event',
  'dir_inbound',
] as const;

/**
 * The tables a copy leaves out: sessions, sign-in links, WebAuthn challenges, the lockout's strikes and the mailboxes
 * not yet proved.
 *
 * CREDENTIALS THAT EXPIRE IN MINUTES TO DAYS. A restore that revived them would sign back in people who had signed out,
 * and a copy kept thirty nights would hold a session for longer than the session itself lives. Named, and not merely
 * absent from `CARRIED`, so a table added to `SCHEMA` later has to be put in one list or the other: the test reads
 * `sqlite_master` and fails for a table in neither.
 */
export const LEFT_OUT = ['dir_session', 'dir_link', 'dir_challenge', 'dir_fail', 'dir_pending'] as const;

type Carried = (typeof CARRIED)[number];

/**
 * Each carried table's order in a copy.
 *
 * `rowid` WHERE THERE IS ONE, BECAUSE TWO READERS ORDER BY IT. `namesOf` lists a record's names by `rowid` and
 * `recordsOf` a person's records the same way, and a load inserts rows in the order they arrive, so dumping in `rowid`
 * order is what makes both answer the same after a restore. The `WITHOUT ROWID` tables have no `rowid` to ask for
 * and are ordered by their primary key, which makes two dumps of one Directory the same text.
 */
const COPY_ORDER: Record<Carried, string> = {
  dir_person: 'rowid',
  dir_record: 'rowid',
  dir_slug: 'rowid',
  dir_member: 'rowid',
  dir_meta: 'rowid',
  dir_passkey: 'rowid',
  dir_usage_day: 'record, day, scope, action',
  dir_usage_run: 'record, event',
  dir_usage_slash: 'record, day',
  dir_billing: 'rowid',
  dir_stripe_event: 'rowid',
  dir_inbound: 'token_sha256',
};

/** A copy's first line, then its version: `#dogdir 4`. Not `#dogl`, so `checkBrainl` and `verify` never take one for a record. */
const COPY_HEAD = '#dogdir';

/**
 * A column name as `load` will put it into SQL, which is why it is checked at all: the name is spliced into the
 * statement, and a copy is a file somebody could have edited.
 *
 * DIGITS INCLUDED. The first version of this was letters and underscores, and the round-trip test refused every copy at
 * `dir_inbound`, whose key is `token_sha256`.
 */
const COLUMN = /^[a-z][a-z0-9_]*$/;

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

/* ── billing ─────────────────────────────────────────────────────────────── */

/**
 * The states a paid record can be in, checked here because `dir_billing` carries no CHECK (see `SCHEMA`).
 *
 * A RECORD WITH NO ROW IS IN NONE OF THEM, and that is not a fourth state written down: it is not billed and never
 * lapses (`loop/finish/ops.md` 4.0 Rule 1). Every record the operator provisioned is one.
 */
const BILLING_STATES = ['active', 'past_due', 'lapsed'] as const;
export type BillingState = (typeof BILLING_STATES)[number];

/** The days of a lapse a notice goes out on, which is what `told` records: the last is the deletion's own letter. */
const LADDER_DAYS = [0, 60, 83, 90] as const;
export type LadderDay = (typeof LADDER_DAYS)[number];

/** How long an applied Stripe event's id is kept, the same forty days a counted run's id is (`KEEP_RUNS_MS`). */
const KEEP_EVENTS_MS = 40 * DAY_MS;

/**
 * The most lapsed rows one `due` answers, oldest lapse first.
 *
 * A CEILING ON THE NIGHT'S WALK, because the walk mails every row it is handed. Oldest first, so a row past the
 * ceiling is reached once the rows ahead of it have left the ladder, rather than never.
 */
const DUE_MAX = 5_000;

/** A `dir_billing` row, with the record's live name beside it: `null` for a record that is closed or has none. */
export type BillingRow = {
  record: string;
  person: string;
  customer: string;
  subscription: string | null;
  price: string | null;
  state: BillingState;
  period_end: number | null;
  lapsed_at: number | null;
  told: string;
  updated_at: number;
  slug: string | null;
};

/**
 * What `set` is handed: the record, and whichever columns this event knows. An absent key keeps what the row holds;
 * `null` empties the three columns that may be empty. `person` and `customer` are required the first time only.
 */
export type BillingSet = {
  record: string;
  person?: string;
  customer?: string;
  subscription?: string | null;
  price?: string | null;
  state?: BillingState;
  period_end?: number | null;
};

/**
 * A lapsed record the ladder walks: who paid, where to write to them, and how far the notices have got.
 *
 * `email` IS `null` WHEN THE PERSON WHO PAID HAS NO ACCOUNT ANY MORE, and it says so rather than being an empty
 * string a mailer would try to send to.
 */
export type BillingDue = { record: string; person: string; email: string | null; slug: string | null; lapsed_at: number; told: string };

/** One question of the Directory's billing group (`loop/finish/ops.md` 4.0 B). */
export type BillingCall =
  | { op: 'of'; record: string }
  | { op: 'for'; person: string }
  | { op: 'byCustomer'; customer: string }
  | { op: 'set'; row: BillingSet }
  | { op: 'seen'; id: string; type: string }
  | { op: 'due'; now: number }
  | { op: 'told'; record: string; day: LadderDay }
  | { op: 'lapsed'; record: string };

/** What each `op` answers. */
export type BillingAnswers = {
  of: BillingRow | null;
  for: BillingRow[];
  byCustomer: BillingRow[];
  set: Result<BillingRow>;
  seen: boolean;
  due: BillingDue[];
  told: Result<null>;
  lapsed: boolean;
};
export type BillingAnswer = BillingAnswers[BillingCall['op']];

const BILLING_COLUMNS = 'b.record AS record, b.person AS person, b.customer AS customer, b.subscription AS subscription, b.price AS price, b.state AS state, b.period_end AS period_end, b.lapsed_at AS lapsed_at, b.told AS told, b.updated_at AS updated_at';

type BillingStored = Omit<BillingRow, 'slug'>;

/** A nullable number column as a number or `null`, whatever form the driver handed it back in. */
const numberOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** The ladder's days as `told` writes them: once each, in the order they come. */
const toldWith = (told: string, day: LadderDay): string =>
  [...new Set([...told.split(',').filter((d) => d !== '').map(Number), day])].sort((a, b) => a - b).join(',');

/* ── a person's own name and sign-in address (GAP-7) ─────────────────────────── */

/** The longest name a person may give themselves, in code points: the kernel's `PERSON_NAME_MOST`, bounded here too. */
const PERSON_NAME_MOST = 80;

/** How long a link to a new sign-in address works: a day, as a claim link and a sign-up proof do. */
export const EMAIL_LINK_LIFE = 86_400_000;

/** An address as sign-in reads one (`identity.ts`'s `ADDRESS`): something, an at sign, a domain with a dot. */
const EMAIL_ADDRESS = /^(?=.{3,254}$)[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A token this file minted: 32 random bytes as unpadded base64url, 43 characters. Anything else is not looked up. */
const EMAIL_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A fresh link token, from the platform's random source. */
function mintedToken(): string {
  let out = '';
  for (const b of crypto.getRandomValues(new Uint8Array(32))) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The token as it is stored: an HMAC under the Directory's key, with its own prefix, so a pending row never holds the
 * link itself and a sign-in link's MAC can never be read as this one's (`identity.ts` prefixes each kind the same way).
 */
async function emailLinkHash(key: ReturnType<typeof crypto.subtle.importKey>, token: string): Promise<string> {
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', await key, new TextEncoder().encode(`e:${token}`)));
  let out = '';
  for (const b of tag) out += b.toString(16).padStart(2, '0');
  return out;
}

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
    if (version >= 1 && version < 4) for (const statement of TO_4) sql.exec(statement);
    sql.exec(
      "INSERT INTO dir_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(DIRECTORY_VERSION),
    );
  });
  if (version < DIRECTORY_VERSION) attempt(() => sql.exec(`PRAGMA user_version = ${DIRECTORY_VERSION}`));

  const mint = ulids(() => clock.now());
  const at = (): string => new Date(clock.now()).toISOString();

  const bad = badSlug;

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

  /** Whether a record is lapsed: one indexed read, and a record with no billing row never is. */
  const lapsedOn = (record: string): boolean =>
    sql.one("SELECT 1 AS x FROM dir_billing WHERE record = ? AND state = 'lapsed'", record) !== undefined;

  /**
   * Sign-in, with `lapsed: true` on a `session` answer whose record is lapsed.
   *
   * ON THE ANSWER A BROWSER REQUEST ALREADY WAITS FOR, so a lapsed record costs the Worker no second call to the
   * Directory: every request under `/app/<slug>` asks `session` before any record is addressed, and the doors that
   * cap a lapsed record read the flag from there. Absent means not lapsed, which is what every other record answers.
   */
  const signIn = createAuth(sql, clock, auth);
  /* THE KEY A NEW SIGN-IN ADDRESS'S LINK IS MACED UNDER (GAP-7), imported now and not when a link is minted, because
     the host may zero its copy of the key once the Directory is built, as `createAuth` above allows. */
  const emailKey = auth ? crypto.subtle.importKey('raw', new Uint8Array(auth.mac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) : null;
  const signInMarked = (async (call: AuthCall | SessionAsk | AccountCall): Promise<AuthResult> => {
    /* CLOSING AND SUSPENDING ARE THE ACCOUNT'S AND NOT SIGN-IN'S, so the pair beside `billing` answers them. They ride
       on `auth` because it is already the one RPC every host holds to the Directory for a person's way in. */
    if (call.flow === 'account.close') return closeAccount(call.person);
    if (call.flow === 'suspend') return suspendAccount(call.email, call.suspended);
    const out = await signIn(call);
    if (call.flow !== 'session' || out.status !== 200) return out;
    const who = out.body as Who;
    return who.record !== null && lapsedOn(who.record) ? { ...out, body: { ...who, lapsed: true } } : out;
  }) as DirectoryAuth;

  const billingOf = (stored: BillingStored): BillingRow => ({
    record: stored.record,
    person: stored.person,
    customer: stored.customer,
    subscription: stored.subscription ?? null,
    price: stored.price ?? null,
    state: stored.state,
    period_end: numberOrNull(stored.period_end),
    lapsed_at: numberOrNull(stored.lapsed_at),
    told: stored.told,
    updated_at: Number(stored.updated_at),
    slug: slugOf(stored.record),
  });

  const billingRow = (record: string): BillingRow | null => {
    const stored = sql.one<BillingStored>(`SELECT ${BILLING_COLUMNS} FROM dir_billing b WHERE b.record = ?`, record);
    return stored ? billingOf(stored) : null;
  };

  /**
   * A paid record's row, written: the first checkout makes it and every later Stripe event moves it.
   *
   * ENTERING `lapsed` STARTS THE LADDER AND STAYING THERE DOES NOT. `lapsed_at` is set only when it is empty and
   * `told` goes back to nothing, so the day-0 notice is sent for this lapse; a second event saying the same thing (a
   * redelivery, or a later invoice failing) changes neither, or the ladder would restart every time Stripe spoke.
   * ENTERING `active` CLEARS BOTH, because a record that paid is no longer in any lapse. `past_due` leaves them as they
   * were: it is the warning before a lapse, and a lapse already under way is not undone by one.
   *
   * EVERY REFUSAL HAPPENS BEFORE THE WRITE, for the reason `inbound$` gives: `transactionSync` commits whatever the
   * function returns, refusal included.
   */
  const billingSet = (row: BillingSet): Result<BillingRow> =>
    sql.transactionSync(() => {
      if (typeof row?.record !== 'string' || row.record === '') return no<BillingRow>('VALUE_MALFORMED', 'A billing row names the record it is for.', { at: 'record' });
      if (row.state !== undefined && !(BILLING_STATES as readonly string[]).includes(row.state))
        return no<BillingRow>('ENUM_VALUE_UNKNOWN', `${String(row.state)} is not a billing state. A paid record is ${BILLING_STATES.join(', ')}.`, { at: 'state' });
      for (const key of ['person', 'customer'] as const)
        if (row[key] !== undefined && (typeof row[key] !== 'string' || row[key] === ''))
          return no<BillingRow>('VALUE_MALFORMED', `${key} is an id, written as text.`, { at: key });
      for (const key of ['subscription', 'price'] as const)
        if (row[key] !== undefined && row[key] !== null && (typeof row[key] !== 'string' || row[key] === ''))
          return no<BillingRow>('VALUE_MALFORMED', `${key} is a Stripe id written as text, or null.`, { at: key });
      if (row.period_end !== undefined && row.period_end !== null && !Number.isSafeInteger(row.period_end))
        return no<BillingRow>('VALUE_MALFORMED', 'period_end is a time in whole epoch milliseconds, or null.', { at: 'period_end' });
      if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', row.record))
        return no<BillingRow>('OUT_OF_BOUNDS', `There is no record ${row.record}.`, { at: 'record' });
      if (row.person !== undefined && !sql.one('SELECT 1 AS x FROM dir_person WHERE id = ?', row.person))
        return no<BillingRow>('OUT_OF_BOUNDS', `There is no person ${row.person}.`, { at: 'person' });

      const before = sql.one<BillingStored>(`SELECT ${BILLING_COLUMNS} FROM dir_billing b WHERE b.record = ?`, row.record);
      const person = row.person ?? before?.person;
      const customer = row.customer ?? before?.customer;
      if (person === undefined || customer === undefined)
        return no<BillingRow>('VALUE_MALFORMED', 'A record paid for the first time names who checked out and their Stripe customer.', {
          at: person === undefined ? 'person' : 'customer',
        });

      /* A FIRST ROW IS `active` UNLESS IT SAYS OTHERWISE, because it is written when a checkout completes. */
      const now = clock.now();
      const state: BillingState = row.state ?? before?.state ?? 'active';
      const entering = state !== before?.state;
      const held = numberOrNull(before?.lapsed_at);
      const lapsed_at = state === 'active' ? null : state === 'lapsed' && entering ? (held ?? now) : held;
      const told = state === 'active' || (state === 'lapsed' && entering) ? '' : (before?.told ?? '');
      const pick = <T>(given: T | undefined, kept: T | undefined): T | null => (given !== undefined ? given : (kept ?? null));

      sql.exec(
        `INSERT INTO dir_billing (record, person, customer, subscription, price, state, period_end, lapsed_at, told, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (record) DO UPDATE SET
           person = excluded.person, customer = excluded.customer, subscription = excluded.subscription,
           price = excluded.price, state = excluded.state, period_end = excluded.period_end,
           lapsed_at = excluded.lapsed_at, told = excluded.told, updated_at = excluded.updated_at`,
        row.record,
        person,
        customer,
        pick(row.subscription, before?.subscription),
        pick(row.price, before?.price),
        state,
        pick(row.period_end, numberOrNull(before?.period_end) ?? undefined),
        lapsed_at,
        told,
        now,
      );
      return ok(billingRow(row.record)!);
    });

  /**
   * The billing group's one entry, as the doors and the night call it (`loop/finish/ops.md` 4.0 B). Not generic, so
   * each `op` narrows the call; `billing` below gives the caller the answer its `op` asked for.
   */
  const billingAnswer = (call: BillingCall): BillingAnswer => {
    switch (call.op) {
      case 'of':
        return billingRow(call.record);

      /* OWNED, NOT REACHED, for the reason `usage` gives: billing is the owner's, so a member of somebody else's
         record sees nothing of it here. Only records with a row: an owned record without one is unbilled, and the
         account door says so from `recordsOf`. */
      case 'for':
        return sql
          .all<BillingStored>(
            `SELECT ${BILLING_COLUMNS} FROM dir_billing b JOIN dir_record r ON r.id = b.record
              WHERE r.owner = ? ORDER BY r.created_at, r.id`,
            call.person,
          )
          .map(billingOf);

      case 'byCustomer':
        return sql.all<BillingStored>(`SELECT ${BILLING_COLUMNS} FROM dir_billing b WHERE b.customer = ? ORDER BY b.record`, call.customer).map(billingOf);

      case 'set':
        return billingSet(call.row);

      /* THE FIRST OFFER OF AN EVENT ID IS THE ONLY `true`. The check and the insert share a transaction, so two
         deliveries of one event cannot both be told to apply it. An id that is not text cannot be remembered as
         applied, so it is never applied: a verified Stripe event always carries one. The ids older than forty days
         go in the same transaction, so the table holds a window and not a history. */
      case 'seen': {
        const id: unknown = call.id;
        const type = typeof call.type === 'string' ? call.type : '';
        if (typeof id !== 'string' || id === '') return false;
        return sql.transactionSync(() => {
          const now = clock.now();
          sql.exec('DELETE FROM dir_stripe_event WHERE at < ?', now - KEEP_EVENTS_MS);
          if (sql.one('SELECT 1 AS x FROM dir_stripe_event WHERE id = ?', id)) return false;
          sql.exec('INSERT INTO dir_stripe_event (id, type, at) VALUES (?, ?, ?)', id, type, now);
          return true;
        });
      }

      /* EVERY LAPSED ROW WHOSE LAPSE HAS BEGUN BY `now`, oldest first and at most `DUE_MAX`. The days since the lapse
         and which notice is next are the walk's to work out from `lapsed_at` and `told`, against its own clock. */
      case 'due': {
        if (!Number.isFinite(call.now)) return [];
        return sql
          .all<{ record: string; person: string; email: string | null; lapsed_at: number; told: string }>(
            `SELECT b.record AS record, b.person AS person, p.email AS email, b.lapsed_at AS lapsed_at, b.told AS told
               FROM dir_billing b LEFT JOIN dir_person p ON p.id = b.person
              WHERE b.state = 'lapsed' AND b.lapsed_at IS NOT NULL AND b.lapsed_at <= ?
              ORDER BY b.lapsed_at, b.record LIMIT ?`,
            call.now,
            DUE_MAX,
          )
          .map((r) => ({ record: r.record, person: r.person, email: r.email ?? null, slug: slugOf(r.record), lapsed_at: Number(r.lapsed_at), told: r.told }));
      }

      /* A NOTICE SENT, WRITTEN WHILE THE ROW SAYS `lapsed`. A record paid for between `due` and here has left the
         ladder and `active` has emptied `told`, so there is nothing to record and the answer is still done. Closing
         the record touches `dir_record`, never this row's `state`, so day 90, the deletion's own letter, is still
         written here after the record is gone, and a failed one is retried on the same closed row the next night.
         The same day twice is written once. */
      case 'told': {
        const { record, day } = call;
        return sql.transactionSync(() => {
          if (!(LADDER_DAYS as readonly number[]).includes(day))
            return no<null>('ENUM_VALUE_UNKNOWN', `${String(day)} is not a day of the ladder. A notice goes out on day ${LADDER_DAYS.join(', ')}.`, { at: 'day' });
          const row = sql.one<{ state: string; told: string }>('SELECT state, told FROM dir_billing WHERE record = ?', record);
          if (!row) return no<null>('OUT_OF_BOUNDS', `${record} has no billing row.`, { at: 'record' });
          if (row.state === 'lapsed') sql.exec('UPDATE dir_billing SET told = ?, updated_at = ? WHERE record = ?', toldWith(row.told, day), clock.now(), record);
          return ok(null);
        });
      }

      case 'lapsed':
        return lapsedOn(call.record);

      /* AN `op` THIS BUILD DOES NOT KNOW, arriving over RPC from a newer caller, answers nothing rather than throwing
         out of the Durable Object as a bare 500. */
      default:
        return null;
    }
  };

  /* ── closing and suspending an account (OPS-21) ── */

  /**
   * An account closed: the person's ways in, their memberships and their row, in one transaction.
   *
   * THE DOOR HAS ASKED EVERYTHING BEFORE THIS (`AccountCall` says what), because whether somebody is the last owner of
   * a record is that record's own fact, which the Directory cannot read. What stays is each record's own history: the
   * person's rows, events and mirror there are the record's, and its owner can erase them.
   *
   * A BILLING ROW NAMING THEM STAYS, because the payment it records is the record's and a co-owner's to change. Its
   * person id then names nobody, which `due` already reads as a row with no address to write to.
   */
  const closeAccount = (person: string): AuthResult<AccountClosed> => {
    const none: AuthResult<AccountClosed> = { status: 404, refusal: { code: 'OUT_OF_BOUNDS', fix: 'There is no account to close.', at: 'person' } };
    if (typeof person !== 'string' || person === '') return none;
    return sql.transactionSync((): AuthResult<AccountClosed> => {
      const me = sql.one<{ email: string }>('SELECT email FROM dir_person WHERE id = ?', person);
      if (!me) return none;
      const forgotten = signInForgotten(sql, person, me.email);
      const records = Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_member WHERE person = ?', person)?.n ?? 0);
      sql.exec('DELETE FROM dir_member WHERE person = ?', person);
      sql.exec('DELETE FROM dir_person WHERE id = ?', person);
      return { status: 200, body: { ...forgotten, records } };
    });
  };

  /**
   * The operator stopping a person, or letting them in again: the one writer of `dir_person.suspended_at`.
   *
   * STOPPED MEANS EVERY SESSION ENDS NOW, not at its next use: `LIVE` in `identity.ts` already refuses a suspended
   * person's cookie, and the rows go here so Settings on another device shows nothing live. Passkeys stay, so letting
   * them in again needs no new one. A second suspension keeps the time of the first.
   */
  const suspendAccount = (email: string, suspended: boolean): AuthResult<Suspended> => {
    const typed = typeof email === 'string' ? email.trim() : '';
    const found = typed === '' ? undefined : sql.one<{ id: string }>('SELECT id FROM dir_person WHERE lower(email) = lower(?)', typed);
    if (!found) return { status: 422, refusal: { code: 'OUT_OF_BOUNDS', fix: 'There is nobody with that address.', at: 'email' } };
    const stop = suspended !== false;
    return sql.transactionSync((): AuthResult<Suspended> => {
      if (stop) {
        sql.exec('UPDATE dir_person SET suspended_at = COALESCE(suspended_at, ?) WHERE id = ?', at(), found.id);
        sql.exec('DELETE FROM dir_session WHERE person = ?', found.id);
      } else sql.exec('UPDATE dir_person SET suspended_at = NULL WHERE id = ?', found.id);
      const row = sql.one<{ suspended_at: string | null }>('SELECT suspended_at FROM dir_person WHERE id = ?', found.id);
      return { status: 200, body: { person: found.id, suspended_at: row?.suspended_at ?? null } };
    });
  };

  return {
    resolve,
    slugOf,
    personByEmail,

    /**
     * Sign-in: sessions, passkeys, links, challenges and the lockout, over the five `dir_` tables
     * above. `identity.ts` is the whole of it; this is where a host reaches it, with `lapsed` added to
     * a `session` answer here (`signInMarked`), because that is billing's fact and not sign-in's.
     */
    auth: signInMarked,

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

    /**
     * The record an inbound mail token names, by the token's SHA-256 in hex, or `null`.
     *
     * THE OTHER WAY A NAME BECOMES AN ADDRESS, and the only one where the name was minted rather than
     * chosen. `resolve` turns a slug into a `rec_id`; this turns the digest of a forwarding token into
     * one, for `/in/email/<token>`, which is the single arrival whose URL names no record. What it
     * answers becomes the argument to `idFromName`, so it is the same tenant boundary `resolve` draws.
     *
     * A CLOSED RECORD RESOLVES TO NOTHING, FOR THE REASON `resolve` GIVES THREE LINES OF ITS OWN TO.
     * Closing a record releases its names in one transaction and does not touch this table, so a bank
     * that still holds a deleted record's forwarding address would keep posting mail at it. Joining
     * here is what makes that a 404 rather than a write into storage nobody can reach, and it is the
     * fifth reader in this file to have to remember it: two of the first four did not.
     *
     * THE SHAPE OF THE KEY IS NOT CHECKED HERE. A value that is not a digest matches no row, and the
     * answer is the same `null` either way; the shape is refused where it would be STORED, in
     * `inbound$`, and at the Worker's door where a stranger supplies it.
     */
    recordFor: (tokenHash: string): string | null =>
      sql.one<{ record: string }>(
        `SELECT i.record AS record FROM dir_inbound i
           JOIN dir_record r ON r.id = i.record AND r.closed_at IS NULL
          WHERE i.token_sha256 = ?`,
        tokenHash,
      )?.record ?? null,

    /**
     * A record's forwarding address is registered, rotated or taken away.
     *
     * ONE VERB FOR ALL THREE, BECAUSE THE SELF-HOST HAS ONE. There a record's inbound token is a file:
     * writing it registers, writing it again rotates, and `rm` revokes, with no command to learn
     * (91cda54d). A digest here replaces whatever that record had, and `null` leaves it holding none.
     * Keeping the old row alongside the new one would be the one thing rotation exists to prevent: a
     * forwarding address is handed to third parties by definition, so the answer to a leaked one is a
     * new one, and a rotation that left both live answers nothing.
     *
     * IT TAKES A DIGEST AND CANNOT BE HANDED A TOKEN. `DIGEST` above says what that costs and buys.
     * This method therefore cannot mint anything, show anybody an address, or read one back: minting
     * is the caller's, and what reaches here is the half that opens nothing.
     *
     * EVERY REFUSAL HAPPENS BEFORE THE FIRST WRITE. `transactionSync` commits whatever the function
     * returns, refusal included, so a check after the `DELETE` would revoke a working address and then
     * report that nothing happened.
     */
    inbound$: (record: string, tokenHash: string | null): Result<null> =>
      sql.transactionSync(() => {
        if (tokenHash !== null && !DIGEST.test(tokenHash))
          return no<null>(
            'VALUE_MALFORMED',
            'A forwarding address is registered by the SHA-256 of its token, written as 64 lower-case hex characters. The token itself is never stored here.',
            { at: 'tokenHash' },
          );
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ? AND closed_at IS NULL', record))
          return no<null>('OUT_OF_BOUNDS', `There is no open record ${record}.`, { at: 'record' });
        /* AND AN ADDRESS ANOTHER RECORD HOLDS IS REFUSED RATHER THAN STOLEN. Two random tokens do not
           collide, so this is the caller handing the same digest twice, and the `INSERT` below would
           otherwise throw a `SQLITE_CONSTRAINT` out of a function whose whole contract is a `Result`,
           across a Durable Object RPC boundary, as a bare 500. That is the hazard `person$` and
           `provision` each spend a paragraph on. */
        const held = tokenHash === null ? undefined : sql.one<{ record: string }>('SELECT record FROM dir_inbound WHERE token_sha256 = ?', tokenHash);
        if (held !== undefined && held.record !== record)
          return no<null>('ALREADY_KNOWN', 'That forwarding address belongs to another record. Mint a new token for this one.', { at: 'tokenHash' });

        sql.exec('DELETE FROM dir_inbound WHERE record = ?', record);
        if (tokenHash !== null) sql.exec('INSERT INTO dir_inbound (token_sha256, record) VALUES (?, ?)', tokenHash, record);
        return ok(null);
      }),

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

    /* ── a person changes their own name and sign-in address (GAP-7, `loop/finish/contracts.md` §12.1) ── */

    /**
     * A person's own name, moved here after their record has accepted it (`renamePerson`), so the next record they
     * open, and the passkey chooser, read the new one.
     *
     * THE RECORD HAS ALREADY JUDGED THE NAME (`packages/kernel/src/api/person-name.ts`), and this bounds only what a
     * row may hold, so a host that called this directly still cannot store an empty or an endless name.
     */
    renamePerson: (id: string, name: string): Result<Person> =>
      sql.transactionSync(() => {
        const trimmed = name.trim();
        if (trimmed === '' || [...trimmed].length > PERSON_NAME_MOST)
          return no<Person>('VALUE_MALFORMED', `A name is 1 to ${PERSON_NAME_MOST} characters.`, { at: 'name' });
        if (!sql.one('SELECT 1 AS x FROM dir_person WHERE id = ?', id)) return no<Person>('OUT_OF_BOUNDS', 'There is no person with that id here.', { at: 'person' });
        sql.exec('UPDATE dir_person SET name = ? WHERE id = ?', trimmed, id);
        return ok(sql.one<Person>('SELECT id, email, name, created_at FROM dir_person WHERE id = ?', id)!);
      }),

    /**
     * A new sign-in address asked for: a single-use link, good for `EMAIL_LINK_LIFE`, for the host to mail to it.
     * NOTHING MOVES UNTIL IT IS PRESSED (`emailMove`), because an address nobody has proved they read is a way to
     * hand somebody's account to a mailbox they do not own.
     *
     * AN ADDRESS ANOTHER PERSON HOLDS IS REFUSED IN ONE SENTENCE THAT NAMES NOBODY. `dir_person`'s address is unique
     * (`dir_person_email`), so the move could never land, and saying so now saves the person a link that cannot work.
     *
     * ONE LIVE LINK A PERSON: asking again takes the last one back, so the newest mail is the only one that works and a
     * person who mistyped an address can put it right without the first link still standing.
     *
     * THE ROW IS `dir_pending`'s, purpose `email`, which is left out of every Directory copy with the sign-in links, so
     * a restore can never revive a link the person has since replaced. Its token is kept only as an HMAC under the
     * Directory's key, as every link's is.
     */
    emailAsk: async (person: string, email: string): Promise<Result<{ to: string; token: string }>> => {
      if (!emailKey) return no('NOT_IN_THIS_BUILD', 'This BrainDog has no sign-in switched on, so there is no sign-in address to change.', { at: 'email' });
      const to = email.trim();
      if (!EMAIL_ADDRESS.test(to)) return no('VALUE_MALFORMED', 'That is not an email address.', { at: 'email' });
      const token = mintedToken();
      const hash = await emailLinkHash(emailKey, token);
      return sql.transactionSync(() => {
        const me = sql.one<{ email: string; suspended_at: string | null }>('SELECT email, suspended_at FROM dir_person WHERE id = ?', person);
        if (!me || me.suspended_at) return no<{ to: string; token: string }>('UNAUTHORIZED', 'Sign in again to change your sign-in email.', { at: 'person' });
        if (me.email.toLowerCase() === to.toLowerCase())
          return no<{ to: string; token: string }>('VALUE_MALFORMED', 'That is already the address you sign in with.', { at: 'email' });
        const holder = personByEmail(to);
        if (holder && holder.id !== person)
          return no<{ to: string; token: string }>('ALREADY_KNOWN', 'Another account already signs in with that address. Choose a different one.', { at: 'email' });
        const now = clock.now();
        sql.exec('DELETE FROM dir_pending WHERE expires <= ?', now);
        sql.exec("DELETE FROM dir_pending WHERE purpose = 'email' AND json_extract(payload, '$.person') = ?", person);
        sql.exec(
          'INSERT INTO dir_pending (hash, purpose, email, payload, expires, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          hash,
          'email',
          to.toLowerCase(),
          JSON.stringify({ person, email: to }),
          now + EMAIL_LINK_LIFE,
          now,
        );
        return ok({ to, token });
      });
    },

    /**
     * The link pressed: the person's sign-in address moves, and the answer names every open record they belong to, for
     * the host to carry the new address into each one's mirror.
     *
     * SPENT ONLY BY THE PERSON IT WAS MINTED FOR. The row names who asked, and a link opened in somebody else's session
     * is refused and left standing, so a link forwarded by mistake is not burnt by the wrong reader. A dead, spent or
     * unknown link is the one sentence, whichever it was.
     *
     * THE ADDRESS IS CHECKED AGAIN, because a day passes between asking and pressing, and somebody else may have taken
     * it in between; the unique index would otherwise throw out of a function whose contract is a `Result`.
     */
    emailMove: async (person: string, token: string): Promise<Result<{ from: string; to: string; records: string[] }>> => {
      type Moved = { from: string; to: string; records: string[] };
      const dead = no<Moved>('UNAUTHORIZED', 'That link has been used, has run out, or was sent for another account. Ask for a new one in Settings.', { at: 'token' });
      if (!emailKey || !EMAIL_TOKEN.test(token)) return dead;
      const hash = await emailLinkHash(emailKey, token);
      return sql.transactionSync(() => {
        const row = sql.one<{ payload: string }>(
          "DELETE FROM dir_pending WHERE hash = ? AND purpose = 'email' AND expires > ? AND json_extract(payload, '$.person') = ? RETURNING payload",
          hash,
          clock.now(),
          person,
        );
        if (!row) return dead;
        let to = '';
        try {
          const held = JSON.parse(row.payload) as { email?: unknown };
          to = typeof held.email === 'string' ? held.email : '';
        } catch {
          to = '';
        }
        const me = sql.one<{ email: string }>('SELECT email FROM dir_person WHERE id = ? AND suspended_at IS NULL', person);
        if (!me || !EMAIL_ADDRESS.test(to)) return dead;
        const holder = personByEmail(to);
        if (holder && holder.id !== person)
          return no<Moved>('ALREADY_KNOWN', 'Another account started signing in with that address after the link was sent. Choose a different one.', { at: 'email' });
        sql.exec('UPDATE dir_person SET email = ? WHERE id = ?', to, person);
        const records = sql
          .all<{ record: string }>(
            `SELECT m.record AS record FROM dir_member m JOIN dir_record r ON r.id = m.record AND r.closed_at IS NULL
              WHERE m.person = ? ORDER BY m.rowid`,
            person,
          )
          .map((r) => r.record);
        return ok({ from: me.email, to, records });
      });
    },

    /**
     * A record comes into being: an address, a name for it, and somebody who owns it.
     *
     * ONE TRANSACTION, because a record with no owner is a record nobody can reach and a name with
     * no record is a 404 that looks like a bug. Naming is provisioning on the platform; here it is
     * the row that says which name the platform is given.
     */
    provision: (args: { slug: string; email: string; name?: string; record?: string; plan?: Plan }): Result<Named & { person: string }> =>
      sql.transactionSync(() => {
        const wrong = bad(args.slug);
        if (wrong) return no<Named & { person: string }>('VALUE_MALFORMED', wrong, { at: 'slug' });
        if (args.plan !== undefined && !(PLANS as readonly string[]).includes(args.plan))
          return no<Named & { person: string }>('ENUM_VALUE_UNKNOWN', `${String(args.plan)} is not a plan. A record is on ${PLANS.join(' or ')}.`, { at: 'plan' });
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
        sql.exec('INSERT INTO dir_record (id, owner, created_at, plan) VALUES (?, ?, ?, ?)', record, person.id, now, args.plan ?? 'hosted');
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
     * Every open record this person can reach, each with its name and the level they actually hold
     * there: the record switcher's rows, and the one read `recordsOf` above says it cannot answer
     * alone.
     *
     * THE DIRECTORY SAYS WHICH; THE RECORD SAYS WHAT. `recordsOf` carries no level on purpose, and
     * its own comment says why: `invite` and `join` write two tables nothing writes in one transaction,
     * so a level kept here would drift from the one the record enforces the moment anybody was
     * invited rather than joined. `ask` is how each open record answers for itself, in its own
     * words, so the level and the name here are never a second copy of either.
     *
     * A RECORD THAT ANSWERS WITH NO LEVEL AND NO LISTS IS LEFT OUT, not shown with a level nobody
     * granted. The Directory still naming somebody after the record has removed them is not a
     * contradiction to paper over: it is what "removed" looks like before the two tables agree, and
     * the row that does not lie about it is no row at all. A closed record, or one with no live name,
     * is left out the same way `recordsOf`'s own callers already filter it.
     *
     * THIS USED TO LEAVE OUT THE ONE-LIST MEMBER TOO, because a `null` level was the whole test. A
     * record that answers lists is kept with `level: null` and those lists; see `SwitcherAsk`.
     */
    switcherRows: async (person: string, ask: (record: string) => Promise<SwitcherAsk> | SwitcherAsk): Promise<SwitcherRow[]> => {
      const open = sql
        .all<{ record: string; slug: string | null; closed_at: string | null }>(
          `SELECT m.record AS record,
                  (SELECT s.slug FROM dir_slug s WHERE s.record = m.record AND s.released_at IS NULL) AS slug,
                  (SELECT r.closed_at FROM dir_record r WHERE r.id = m.record) AS closed_at
             FROM dir_member m WHERE m.person = ? ORDER BY m.rowid`,
          person,
        )
        .filter((r) => r.closed_at === null && r.slug !== null);
      const rows = await Promise.all(
        open.map(async (r): Promise<SwitcherRow | null> => {
          const held = await ask(r.record);
          const name = held.name ?? (r.slug as string);
          if (held.level !== null) return { slug: r.slug as string, name, level: held.level };
          return held.lists && held.lists.length > 0 ? { slug: r.slug as string, name, level: null, lists: [...held.lists], held: SOME_LISTS } : null;
        }),
      );
      return rows.filter((r): r is SwitcherRow => r !== null);
    },

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
     * The records closed before `cutoff` (epoch milliseconds), a page at a time, for the night's expiry of their final
     * copies (`apps/worker/src/nightly.ts`).
     *
     * THE CUTOFF IS A NUMBER AND THE COMPARISON IS DONE HERE. `closed_at` is `toISOString()` text, which sorts as time
     * only while both sides are written that way; a caller handing in `2026-09-23` or a local time would compare as a
     * string and expire the wrong records. So the caller says when, and this writes it in the column's own format.
     *
     * THE CURSOR IS THE LAST ID, as `listRecords` pages open ones: a record closed while the walk runs does not shift
     * an offset and push another record past the page it was on.
     */
    closedBefore: (cutoff: number, cursor?: string, limit = 500): { ids: string[]; cursor?: string } => {
      const before = new Date(cutoff).toISOString();
      const ids = sql
        .all<{ id: string }>(
          'SELECT id FROM dir_record WHERE closed_at IS NOT NULL AND closed_at < ? AND id > ? ORDER BY id LIMIT ?',
          before,
          cursor ?? '',
          limit,
        )
        .map((r) => r.id);
      return ids.length === limit ? { ids, cursor: ids[ids.length - 1] ?? '' } : { ids };
    },

    /**
     * The carried tables as lines: `#dogdir <version>`, then a `#table <name>` line per table and one JSON object per row.
     *
     * IN ONE TRANSACTION, so the carried tables are one instant of the Directory. A sign-up landing between the read of
     * `dir_person` and the read of `dir_record` would otherwise be a copy with a record whose owner it does not hold.
     */
    dump: (): string[] =>
      sql.transactionSync(() => {
        const out = [`${COPY_HEAD} ${String(DIRECTORY_VERSION)}`];
        for (const table of CARRIED) {
          out.push(`#table ${table}`);
          for (const row of sql.all(`SELECT * FROM ${table} ORDER BY ${COPY_ORDER[table]}`)) out.push(JSON.stringify(row));
        }
        return out;
      }),

    /**
     * A copy's lines, into this Directory, which must be empty. The rows are written in one transaction or not at all.
     *
     * EMPTY MEANS NOTHING BUT ITS OWN VERSION ROW, which `createDirectory` writes on the first open. A load over a
     * Directory anybody has used would merge two tenant maps, and the one failure a routing layer must not have is a
     * name that means two records. So every table is asked first, the left-out ones included: a Directory holding a
     * session holds a person somebody signed in as.
     *
     * THE SAME VERSION ONLY. A newer copy's columns would load as answers this build does not know the meaning of,
     * which is what `DIRECTORY_VERSION` exists to stop. An older copy is refused too, because the steps that bring an
     * old Directory forward run on a file and not on lines; the build that wrote the copy is the one to load it.
     *
     * EVERY LINE IS READ BEFORE THE FIRST WRITE, and a line that is not a row of a carried table refuses the whole copy.
     * A table the copy has no business naming is refused rather than loaded, because a copy that brought a session
     * with it would sign somebody in.
     */
    load: (lines: readonly string[]): Result<{ tables: number; rows: number }> => {
      type Loaded = { tables: number; rows: number };
      const head = new RegExp(`^${COPY_HEAD} (\\d+)$`, 'u').exec(lines[0] ?? '');
      if (!head)
        return no<Loaded>('FILE_MALFORMED', `This is not a copy of a Directory: its first line is not ${COPY_HEAD} and a version.`, { at: 'line 1' });
      const version = Number(head[1]);
      if (version > DIRECTORY_VERSION)
        return no<Loaded>(
          'FORMAT_NEWER_THAN_READER',
          `This copy was written by a newer BrainDog, at Directory version ${String(version)}, and this build reads ${String(DIRECTORY_VERSION)}. Load it with the build that wrote it.`,
          { at: 'line 1' },
        );
      if (version !== DIRECTORY_VERSION)
        return no<Loaded>(
          'FILE_MALFORMED',
          `This copy is at Directory version ${String(version)} and this build loads only version ${String(DIRECTORY_VERSION)}. Load it with the build that wrote it, which brings it forward on its next open.`,
          { at: 'line 1' },
        );

      const held = [...CARRIED, ...LEFT_OUT]
        .map((table) => ({ table, n: Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0) }))
        .filter((t) => (t.table === 'dir_meta' ? t.n > 1 : t.n > 0));
      if (held.length > 0)
        return no<Loaded>(
          'IMPORT_NOT_EMPTY',
          `This Directory already holds ${held.map((t) => `${String(t.n)} ${t.table}`).join(', ')}. A copy loads only into a Directory nothing has written to.`,
        );

      const rows: { table: Carried; row: Record<string, string | number | null>; line: number }[] = [];
      const seen = new Set<string>();
      let table: Carried | null = null;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const at = `line ${String(i + 1)}`;
        /* A BLANK LINE IS NOT A ROW, AND IT IS NOT A REASON TO REFUSE. A copy opened with `age -d` and saved usually
           ends in a newline, and this refused exactly that copy at its last line as "not a row of dir_inbound". The
           record's reader skips a blank line (`packages/kernel/src/brainl.ts`) and so does this one. */
        if (line === '') continue;
        if (line.startsWith('#table ')) {
          const name = line.slice('#table '.length);
          if (!(CARRIED as readonly string[]).includes(name) || seen.has(name))
            return no<Loaded>('FILE_MALFORMED', `A copy of a Directory carries ${CARRIED.join(', ')}, each once, and this one names ${name} here.`, { at });
          table = name as Carried;
          seen.add(name);
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          parsed = undefined;
        }
        const row = parsed as Record<string, unknown> | undefined;
        const scalar = (v: unknown): boolean => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
        if (
          table === null ||
          row === null ||
          typeof row !== 'object' ||
          Array.isArray(row) ||
          Object.keys(row).length === 0 ||
          !Object.entries(row).every(([k, v]) => COLUMN.test(k) && scalar(v))
        )
          return no<Loaded>('FILE_MALFORMED', `This line is not a row of ${table ?? 'any table'}: a row is one JSON object of column names to text, numbers or null.`, { at });
        rows.push({ table, row: row as Record<string, string | number | null>, line: i + 1 });
      }
      if (seen.size !== CARRIED.length)
        return no<Loaded>('FILE_MALFORMED', `This copy names ${String(seen.size)} of the ${String(CARRIED.length)} tables a copy carries, so it was cut short.`);

      /* A ROW THE SCHEMA REFUSES IS A THROW OUT OF THE TRANSACTION, which rolls every row before it back, and it is
         turned into a refusal here because this method's contract is a `Result`: across a Durable Object RPC boundary
         a thrown `SQLITE_CONSTRAINT` is a bare 500 with no line in it. */
      let failed = 0;
      try {
        sql.transactionSync(() => {
          for (const { table, row, line } of rows) {
            failed = line;
            const columns = Object.keys(row);
            /* `dir_meta` ALREADY HOLDS THE VERSION ROW this Directory wrote when it opened, and the copy's says the
               same number, so it is the one table a row may replace. */
            const upsert = table === 'dir_meta' ? ' ON CONFLICT (key) DO UPDATE SET value = excluded.value' : '';
            sql.exec(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})${upsert}`,
              ...Object.values(row),
            );
          }
        });
      } catch (e) {
        return no<Loaded>('FILE_MALFORMED', `The row at line ${String(failed)} would not load, so nothing was: ${e instanceof Error ? e.message : String(e)}`, {
          at: `line ${String(failed)}`,
        });
      }
      return ok({ tables: seen.size, rows: rows.length });
    },

    /**
     * Every name this record has ever had, oldest first. What a redirect would be built from.
     *
     * BY `rowid` AND NOT BY `claimed_at`: a rename and the release it causes share an instant, and
     * ordering two rows written in the same millisecond by their timestamp is ordering them by
     * nothing in particular.
     */
    namesOf: (record: string): { slug: string; claimed_at: string; released_at: string | null }[] =>
      sql.all('SELECT slug, claimed_at, released_at FROM dir_slug WHERE record = ? ORDER BY rowid', record),

    /**
     * Put a record on a plan. A self-host puts every record it serves on `selfhost`, once, at start.
     */
    setPlan: (record: string, plan: Plan): Result<null> =>
      sql.transactionSync(() => {
        if (!(PLANS as readonly string[]).includes(plan))
          return no<null>('ENUM_VALUE_UNKNOWN', `${String(plan)} is not a plan. A record is on ${PLANS.join(' or ')}.`, { at: 'plan' });
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', record))
          return no<null>('OUT_OF_BOUNDS', `There is no record ${record}.`, { at: 'record' });
        sql.exec('UPDATE dir_record SET plan = ? WHERE id = ?', plan, record);
        return ok(null);
      }),

    /**
     * Count one run, from the `pull` event the kernel wrote for it.
     *
     * THE SAME RUN TWICE IS COUNTED ONCE. The event's id goes into `dir_usage_run` first, in the same
     * transaction as the day row, and a run whose id is already there adds nothing. A host can therefore report
     * a pass again after a crash, or report from two places, and the ledger does not move.
     *
     * A RUN OLDER THAN FORTY DAYS IS NOT COUNTED, because that is how long the ids are kept: counting it after
     * its id was pruned is the one way to count it twice. The answer says so rather than pretending.
     */
    meter: (record: string, run: RunUsage): Result<'counted' | 'already counted' | 'too old'> =>
      sql.transactionSync(() => {
        type Counted = 'counted' | 'already counted' | 'too old';
        const at = runAt(run);
        if (at === null)
          return no<Counted>(
            'VALUE_MALFORMED',
            "A run to count is a row of the runner's usage: an event id, a time, an action, a scope and six whole numbers.",
            { at: 'run' },
          );
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', record))
          return no<Counted>('OUT_OF_BOUNDS', `There is no record ${record}.`, { at: 'record' });

        const cutoff = clock.now() - KEEP_RUNS_MS;
        if (at < cutoff) return ok<Counted>('too old');
        sql.exec('DELETE FROM dir_usage_run WHERE record = ? AND at < ?', record, cutoff);
        return ok<Counted>(countRun(sql, record, run, at));
      }),

    /**
     * Count up to `METER_MANY_MAX` runs of one record in one transaction: the nightly replay's call, one per batch.
     *
     * EACH RUN IS COUNTED AS `meter` COUNTS IT, once by its event id, so a batch holding runs the pass already counted
     * adds only the rest. A row in it that is not a run, or is older than the window, is tallied and passed over rather
     * than refusing the batch, because one line an older build wrote must not leave the other runs of forty days
     * uncounted. Only the call itself is refused: a record this Directory does not hold, or too many runs at once, both
     * before anything is written.
     */
    meterMany: (record: string, runs: readonly RunUsage[]): Result<MeterTally> =>
      sql.transactionSync(() => {
        if (!Array.isArray(runs)) return no<MeterTally>('VALUE_MALFORMED', "Runs to count are a list of rows of the runner's usage.", { at: 'runs' });
        if (runs.length > METER_MANY_MAX)
          return no<MeterTally>('OUT_OF_BOUNDS', `One call counts at most ${thousands(METER_MANY_MAX)} runs, and this one hands ${thousands(runs.length)}.`, { at: 'runs' });
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', record))
          return no<MeterTally>('OUT_OF_BOUNDS', `There is no record ${record}.`, { at: 'record' });

        const cutoff = clock.now() - KEEP_RUNS_MS;
        sql.exec('DELETE FROM dir_usage_run WHERE record = ? AND at < ?', record, cutoff);
        const tally: MeterTally = { counted: 0, already: 0, old: 0, malformed: 0 };
        for (const run of runs) {
          const at = runAt(run);
          if (at === null) tally.malformed++;
          else if (at < cutoff) tally.old++;
          else if (countRun(sql, record, run, at) === 'counted') tally.counted++;
          else tally.already++;
        }
        return ok(tally);
      }),

    /**
     * A record's Slash asks, a UTC day at a time, as its own ledger totals them (`slash_call`, in the record): the
     * host's nightly call, one per record, and nothing a person can reach.
     *
     * A DAY'S TOTAL AND NOT A CALL'S, SO HANDING IT TWICE CHANGES NOTHING. The record counts, and this keeps the larger
     * of what it held and what it is told: a night handed again lands once, and a record gone back to an older copy,
     * which has forgotten some of its asks, cannot take back what the account already counted. The record's ceiling is
     * the record's (`ask_cap`, the operator's neurons) and is never read here.
     *
     * A day older than `SLASH_DAYS`, or one not yet begun, is passed over and tallied, and so is a row that is not a
     * day's whole numbers, for the reason `meterMany` gives. Only the call itself is refused, before anything is written.
     */
    meterSlash: (record: string, days: readonly SlashDay[]): Result<SlashTally> =>
      sql.transactionSync(() => {
        if (!Array.isArray(days)) return no<SlashTally>('VALUE_MALFORMED', "Slash's asks to count are a list of days, each with its asks and neurons.", { at: 'days' });
        if (days.length > SLASH_DAYS)
          return no<SlashTally>('OUT_OF_BOUNDS', `One call counts at most ${thousands(SLASH_DAYS)} days of Slash's asks, and this one hands ${thousands(days.length)}.`, { at: 'days' });
        if (!sql.one('SELECT 1 AS x FROM dir_record WHERE id = ?', record))
          return no<SlashTally>('OUT_OF_BOUNDS', `There is no record ${record}.`, { at: 'record' });

        const now = clock.now();
        const oldest = dayOf(now - SLASH_DAYS * DAY_MS);
        const today = dayOf(now);
        const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
        const tally: SlashTally = { taken: 0, old: 0, malformed: 0 };
        for (const d of days) {
          const day: unknown = d?.day;
          if (typeof day !== 'string' || !DAY.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || day > today || !whole(d.asks) || !whole(d.neurons))
            tally.malformed++;
          else if (day < oldest) tally.old++;
          else {
            sql.exec(
              `INSERT INTO dir_usage_slash (record, day, asks, neurons) VALUES (?, ?, ?, ?)
               ON CONFLICT (record, day) DO UPDATE SET asks = MAX(asks, excluded.asks), neurons = MAX(neurons, excluded.neurons)`,
              record,
              day,
              d.asks,
              d.neurons,
            );
            tally.taken++;
          }
        }
        return ok(tally);
      }),

    /**
     * May this record's action run now? `null` is yes; otherwise, until when it waits, and the one sentence
     * its event says.
     *
     * ASKED BEFORE THE RUN STARTS, by the host's executor, which answers `{ held }` instead of sending. At the
     * limit the action waits for the first of the next month, UTC, and is never skipped silently: the
     * sentence names the action, the day it runs again, and what the record used up. A plan with no allowance
     * is never held, and neither is a record this directory does not know.
     */
    mayRun: (record: string, action: string, pending = 0): { until: number; say: string } | null => {
      const row = sql.one<{ plan: string }>('SELECT plan FROM dir_record WHERE id = ?', record);
      const allowance = row ? ALLOWANCE[planOf(row.plan)] : null;
      if (!allowance) return null;
      const now = clock.now();
      const until = nextMonth(now);
      /* WHAT THE RECORD RAN, AND NOT WHAT IT WAS SENT OR SENT ON: the `COUNTED_ONLY` rows are never read against it. */
      const used = totalsOf(
        sql.one(`SELECT ${SUMS} FROM dir_usage_day WHERE record = ? AND day >= ? AND day < ? AND ${LIMITED}`, record, dayOf(monthStart(now)), dayOf(until)),
      );
      /* AND THE RUNS A PASS HAS LET THROUGH AND NOT YET METERED, which the host counts and this cannot see. */
      used.runs += Math.max(0, Math.floor(Number(pending) || 0));
      const over = (['runs', 'requests', 'bytes', 'ms'] as const).find((k) => used[k] >= allowance[k]);
      if (over === undefined) return null;
      const turns = new Date(until);
      return {
        until,
        say: `${action} is waiting until ${turns.getUTCDate()} ${MONTHS[turns.getUTCMonth()] ?? ''}. This record has used ${SPENT[over](allowance[over])} for ${MONTHS[new Date(now).getUTCMonth()] ?? ''}.`,
      };
    },

    /**
     * The note this record's owner is owed about its month, once, or `null`: `near` when any meter has reached
     * `NOTICE_AT` of the allowance, `held` when a run was first held or a meter is used up.
     *
     * ASKED AFTER A PASS IS METERED, by the host (`noticePass` in `@braindog/host/actions`), which hands the note to
     * whoever tells the owner. THE ROW IS WRITTEN IN THE SAME TRANSACTION AS THE ANSWER, so two passes asking at once
     * get one note between them, and a pass asking again the same month gets none. A held month writes the `near`
     * row too: a record that jumped past both at once is told once, that it is held, and not the smaller news after it.
     * A plan with no allowance, or a record this Directory does not hold, is owed nothing.
     */
    notice: (record: string): UsageNotice | null =>
      sql.transactionSync(() => {
        const row = sql.one<{ plan: string; owner: string }>('SELECT plan, owner FROM dir_record WHERE id = ? AND closed_at IS NULL', record);
        const allowance = row ? ALLOWANCE[planOf(row.plan)] : null;
        if (!row || !allowance) return null;
        const now = clock.now();
        const first = dayOf(monthStart(now));
        const until = nextMonth(now);
        const used = totalsOf(sql.one(`SELECT ${SUMS} FROM dir_usage_day WHERE record = ? AND day >= ? AND day < ? AND ${LIMITED}`, record, first, dayOf(until)));
        const meters = ['runs', 'requests', 'bytes', 'ms'] as const;
        /* THE METER NEAREST ITS LIMIT is the one the sentence names, because it is the one that will stop the record. */
        const binding = [...meters].sort((a, b) => used[b] / allowance[b] - used[a] / allowance[a])[0] ?? 'runs';
        const share = used[binding] / allowance[binding];
        const kind = used.held > 0 || share >= 1 ? 'held' : share >= NOTICE_AT ? 'near' : null;
        if (kind === null) return null;
        const told = (k: 'near' | 'held'): boolean => sql.one('SELECT 1 AS x FROM dir_usage_day WHERE record = ? AND day = ? AND scope = ? AND action = ?', record, first, '', `${NOTICE}${k}`) !== undefined;
        if (told(kind)) return null;
        for (const k of kind === 'held' ? (['near', 'held'] as const) : (['near'] as const))
          if (!told(k))
            sql.exec(
              'INSERT INTO dir_usage_day (record, day, scope, action, runs, requests, bytes, ms, failures, held) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)',
              record,
              first,
              '',
              `${NOTICE}${k}`,
            );
        const turns = new Date(until);
        const month = MONTHS[new Date(now).getUTCMonth()] ?? '';
        const again = `${turns.getUTCDate()} ${MONTHS[turns.getUTCMonth()] ?? ''}`;
        const person = sql.one<{ email: string | null }>('SELECT email FROM dir_person WHERE id = ?', row.owner);
        return {
          kind,
          record,
          slug: slugOf(record),
          person: row.owner,
          email: person?.email ?? null,
          say:
            kind === 'held'
              ? `This record has used ${SPENT[binding](allowance[binding])} for ${month}, so its scheduled actions and automations wait until ${again}.`
              : `This record has used ${Math.floor(share * 100)}% of ${SPENT[binding](allowance[binding])} for ${month}. At the limit its scheduled actions and automations wait until ${again}.`,
        };
      }),

    /**
     * What the records this person owns used, from one UTC day to another inclusive: by project, by action
     * and by day, with each record's month so far against its allowance.
     *
     * OWNED, NOT REACHED. Usage is billing, and billing is the owner's, so a member of somebody else's record
     * sees nothing of it here. A person who owns nothing gets an empty list, not a refusal.
     */
    usage: (person: string, range: { from: string; to: string }): Result<AccountUsage> => {
      for (const key of ['from', 'to'] as const)
        if (!DAY.test(range[key] ?? '') || !Number.isFinite(Date.parse(`${range[key]}T00:00:00Z`)))
          return no<AccountUsage>('VALUE_MALFORMED', `${key} is a day written YYYY-MM-DD, and ${String(range[key])} is not.`, { at: key });
      const span = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS;
      if (span < 0 || span > 366)
        return no<AccountUsage>('OUT_OF_BOUNDS', 'A usage range runs forward from `from` to `to`, and covers at most a year and a day.', { at: 'to' });

      const now = clock.now();
      const start = dayOf(monthStart(now));
      const resets = dayOf(nextMonth(now));
      const owned = sql.all<{ id: string; plan: string; closed_at: string | null }>(
        'SELECT id, plan, closed_at FROM dir_record WHERE owner = ? ORDER BY created_at, id',
        person,
      );
      /* THE ALLOWANCE'S ROWS ONLY, in every total below, so a month's runs read the same here as in `mayRun`; the
         deliveries and arrivals are `counted`, apart. */
      const ranged = 'FROM dir_usage_day WHERE record = ? AND day >= ? AND day <= ?';
      const where = `${ranged} AND ${LIMITED}`;
      /* SLASH'S ASKS FROM THEIR OWN TABLE, by day and summed, and in no total beside them. */
      const slashOf = (id: string, span: { from: string; to: string }): RecordUsage['slash'] => {
        const days = sql
          .all<{ day: string; asks: number; neurons: number }>(
            'SELECT day, asks, neurons FROM dir_usage_slash WHERE record = ? AND day >= ? AND day <= ? ORDER BY day',
            id,
            span.from,
            span.to,
          )
          .map((d) => ({ day: d.day, asks: Number(d.asks), neurons: Number(d.neurons) }));
        return { asks: days.reduce((n, d) => n + d.asks, 0), neurons: days.reduce((n, d) => n + d.neurons, 0), days };
      };
      const records = owned.map((r): RecordUsage => {
        const plan = planOf(r.plan);
        return {
          record: r.id,
          slug: slugOf(r.id),
          plan,
          closed: r.closed_at !== null,
          month: {
            month: start.slice(0, 7),
            used: totalsOf(sql.one(`SELECT ${SUMS} FROM dir_usage_day WHERE record = ? AND day >= ? AND day < ? AND ${LIMITED}`, r.id, start, resets)),
            allowance: ALLOWANCE[plan],
            resets,
          },
          totals: totalsOf(sql.one(`SELECT ${SUMS} ${where}`, r.id, range.from, range.to)),
          projects: sql
            .all<{ scope: string }>(`SELECT scope, ${SUMS} ${where} GROUP BY scope ORDER BY scope`, r.id, range.from, range.to)
            .map((g) => ({ scope: g.scope, ...totalsOf(g) })),
          actions: sql
            .all<{ scope: string; action: string }>(`SELECT scope, action, ${SUMS} ${where} GROUP BY scope, action ORDER BY scope, action`, r.id, range.from, range.to)
            .map((g) => ({ scope: g.scope, action: g.action, ...totalsOf(g) })),
          days: sql
            .all<{ day: string }>(`SELECT day, ${SUMS} ${where} GROUP BY day ORDER BY day`, r.id, range.from, range.to)
            .map((g) => ({ day: g.day, ...totalsOf(g) })),
          counted: sql
            .all<{ action: string }>(`SELECT action, ${SUMS} ${ranged} AND (${COUNTED}) GROUP BY action ORDER BY action`, r.id, range.from, range.to)
            .map((g) => ({ action: g.action, ...totalsOf(g) })),
          slash: slashOf(r.id, range),
        };
      });
      const totals = totalsOf({});
      for (const r of records) for (const k of Object.keys(totals) as (keyof UsageTotals)[]) totals[k] += r.totals[k];
      return ok({ from: range.from, to: range.to, totals, records });
    },

    /**
     * Who pays for which record, and whether it has lapsed: one group, in the shape `auth(call)` has, so the
     * Worker's `Directory$` carries it as one RPC (`loop/finish/ops.md` 4.0 B).
     *
     * ONLY A VERIFIED STRIPE EVENT MOVES A RECORD INTO OR OUT OF A LAPSE. `set` and `seen` are called by the Worker's
     * webhook and `told` by its night, and none by anything a person can reach; a self-host opens these tables with the rest of `SCHEMA` and never
     * writes a row, so none of its records is ever billed or lapsed.
     */
    billing: <C extends BillingCall>(call: C): BillingAnswers[C['op']] => billingAnswer(call) as BillingAnswers[C['op']],
  };
}
