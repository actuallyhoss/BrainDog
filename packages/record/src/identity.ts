/**
 * Sign-in, over the Directory's tables. `12 §3` row 49, `12 §8`, `49 §4.2` and `§5.4` to `§5.10`, `51 §5.8`.
 *
 * ONE FUNCTION, `auth(call)`, BEHIND `createDirectory(sql, clock, auth)`. A host turns HTTP into an `AuthCall`
 * and the answer back into a status, a cookie and a body; everything that decides whether somebody is who they
 * say they are is here, once, for both hosts.
 *
 * NOTHING THAT OPENS ANYTHING IS STORED. A session id, a link token, a challenge and a mailbox proof are 32 random
 * bytes that live in a browser, a mailbox or a ceremony; the tables hold HMAC-SHA-256 of each under the host's key,
 * with a prefix per kind (`s:`, `l:`, `c:`, `p:`, and `a:` for an app's six-digit code with its challenge) so a value
 * minted as one can never be looked up as another.
 * Changing the key is the fleet-wide lever `12 §8` names: every session and every link stops matching at once, and
 * no row is walked.
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

import type {
  AccountCall, AssertionOptions, AuthBodies, AuthCall, AuthResult, Clock, Methods, PasskeyInfo, RegistrationOptions, SignupCall, SignupName, SignupVerified, Sql, Who,
} from '@braindog/ports';
import { ACCESS_ENDED_AT, LOCK_AFTER_MOST_MS, accessEndedSaid, ulids } from '@braindog/kernel';

import { badSlug } from './directory.ts';
import { ipBucket, mailCanon } from './signup-keys.ts';

import { FRESH } from './index.ts';
import { assertion, b64url, clientData, registration, same, unb64url, type Alg, type PublicJwk, type Why } from './webauthn.ts';

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
type Flow = AuthCall['flow'] | SignupCall['flow'] | PasskeyRename['flow'];
/* Read through `AuthBodies`, which `@braindog/ports` already exports from its root, whose index names neither of these two. */
type SessionInfo = AuthBodies['sessions']['sessions'][number];
type InviteProved = AuthBodies['invite.proved'];

/**
 * What `log` is told: a `Why` from the verifier, or one of the Directory's own. Never an address, never a token.
 * `stale` is a session whose last proof is too old for the flow it asked for, which is not a failed sign-in.
 */
export type Reason = Why | 'session' | 'unknown' | 'key' | 'link' | 'code' | 'suspended' | 'locked' | 'reserve' | 'full' | 'stale';

/**
 * What a host hands the Directory to switch sign-in on.
 *
 * `mac` IS THE KEY EVERY STORED HASH IS TAKEN UNDER: 32 bytes or more, derived from the KEK on a self-host and
 * from `SESSION_SECRET` on the Worker. It is imported the moment the Directory is built, and `importKey` copies
 * it, so the host may zero its own buffer straight after.
 *
 * `rp` ABSENT MEANS NO PASSKEYS: the host decides, because only it knows whether its origin is one a browser
 * will run WebAuthn on. `rp.origins` are the other origins a ceremony may come from besides `rp.origin`: on the Worker,
 * `https://<rp.id>`, which is the origin a native app's passkey (`ASAuthorization` on the iPhone and the Mac) writes
 * into its client data. Absent, `rp.origin` alone, which is the self-host. `magic` says the host can deliver mail. `key` is the self-host's server key, absent on
 * the Worker. `log` receives the reason for every refusal, and nothing that identifies anyone.
 *
 * `admits` IS THE RECORD'S OWN ANSWER to whether a person is on it, asked before a session is moved there. The
 * Directory's `dir_member` is written by `join` and `leave` and the record's `member` table by `invite` and
 * `removeMember`, so a person removed from a record is still listed here; without it a switch would answer "opened"
 * and leave the browser on a record that refuses every read.
 */
export type AuthConfig = {
  mac: Uint8Array;
  rp?: { id: string; origin: string; origins?: readonly string[] };
  magic: boolean;
  key?: { serverKey: string };
  log?: (line: { flow: Flow; reason: Reason }) => void;
  admits?: (record: string, person: string) => boolean | Promise<boolean>;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Ninety days, and a rotation after every day of use extends it, so a browser used monthly never asks again: `12 §3` row 49. */
const LIFE = 90 * DAY;
const ROTATE_AFTER = DAY;
/**
 * NINETY DAYS FROM THE LAST PROOF, AND NO ROTATION MOVES IT. Rotation extends `LIFE` on every day of use, so without
 * this a cookie used once a month lived for ever on one passkey tap; a stolen one would too. `authed_at` moves only
 * when somebody proves who they are again, so this is the longest a copied cookie is any use.
 */
const PROOF_LIFE = 180 * DAY;
/**
 * SIXTY SECONDS FOR THE ID A ROTATION REPLACED. The app sends `boot`, `version` and a route's calls in parallel,
 * all carrying the same cookie; the first to arrive rotates it, and the rest would be 401s if the old id died on
 * the spot (`49 §4.2` as written). A minute covers the requests already in flight and nothing longer.
 */
const GRACE = MINUTE;
/** Ten attempts are compared and the eleventh locks the key for fifteen minutes; older strikes are forgotten. */
const WINDOW = 15 * MINUTE;
const CHALLENGE_LIFE = 5 * MINUTE;
/**
 * Live challenges past which minting refuses, for every address together.
 *
 * AND THE PER-ADDRESS RULE BELOW IS WHAT KEEPS ONE ADDRESS FROM REACHING IT. Minting a sign-in challenge takes no
 * secret, so it was locked out by nothing, and one script could hold ten thousand live challenges and answer every
 * tenant's sign-in 503 for five minutes at a time. Now one address holds at most `CHALLENGES.most` a minute times
 * the minutes a challenge lives, so filling the table takes many addresses rather than one.
 */
const CHALLENGE_CAP = 10_000;
const MAGIC_LIFE = 15 * MINUTE;
const CLAIM_LIFE = DAY;
/** A mailbox proof: a day, as a claim link, because it waits on a person reading their mail. */
const PENDING_LIFE = DAY;
/** The most sessions `sessions` lists for one person, newest first. Each sign-in makes one, and a list is read on a phone. */
const SESSIONS_READ = 100;
/**
 * FIVE MINUTES FOR THE ID AN APP'S OWN REFRESH REPLACED, not a rotation's one. The webview, a widget, the notification
 * extension and an intent each read the id from the shared Keychain when they start, so one already running holds the
 * old id until its next read; five minutes covers a request that was in flight and an extension that woke just before.
 */
const APP_GRACE = 5 * MINUTE;
/** An app's sign-in code: ten minutes, which is shorter than the link it rides with, and five wrong tries. */
const APP_CODE_LIFE = 10 * MINUTE;
const APP_CODE_TRIES = 5;
/**
 * AND TEN WRONG CODES FOR ONE PERSON, ACROSS EVERY CODE, THEN NONE FOR A DAY (sec2, 2 Nov). Anybody may ask for a link
 * for somebody else's address with a challenge of their own (`magic.start` with `app`), so they hold the verifier and
 * need only the six digits. Five tries a code reset with each new one: ten letters a quarter of an hour, fifty guesses,
 * from as many addresses as they liked, since a sign-in of their own clears an address's strikes. Counted on the person
 * the code would open (`appcode:<person>`), so no address spreads it; their link still signs them in, and a right code
 * or a spent link clears the count.
 */
const APP_CODE_PERSON: Rule = { most: 9, window: DAY };
const codeKey = (person: string): string => `appcode:${person}`;
/**
 * How long the sign-in sweep keeps an unlocked strike row: the longest window any limit counts over, a person's app codes
 * (a day). Longer than any other window, so a count is never forgotten before its own rule would forget it.
 */
const STRIKES_KEPT = APP_CODE_PERSON.window;
/** What an app session is listed as when the app sent no label of its own. */
const APP_LABEL = 'BrainDog app';

/** How many strikes a lockout key takes, and over how long; the lock lasts the same length again. */
export type Rule = { most: number; window: number };
/** A way in, or sending a link: ten in fifteen minutes (`49 §5.5`, amended below). */
const SIGN_IN: Rule = { most: 10, window: WINDOW };
/** Minting a passkey challenge: thirty a minute from one address, `chal:<ip>`. */
const CHALLENGES: Rule = { most: 30, window: MINUTE };
/**
 * Sign-up's two strikes, `signup:<ip, an IPv6 address as its /64>` and `signup-email:<address>`, while no bot check
 * stands in front of `start`:
 * three an hour each, and the fourth locks the key for an hour.
 *
 * TIGHTER THAN `SIGN_IN` UNTIL THE CHECK IS KEYED. Sign-up is open to strangers before Turnstile has
 * its keys, and with nothing in front of `start` these strikes are the whole brake: `SIGN_IN`'s ten in fifteen minutes
 * is forty letters an hour from one address to whoever a script types. The host says on every `start` whether its
 * check ran (`checked`), and a `start` that says nothing is read as unchecked, so a host that forgot gets the tight one.
 */
export const SIGNUP_UNCHECKED: Rule = { most: 3, window: 60 * MINUTE };

/** Every value this file mints is 32 random bytes in base64url, which is 43 characters and nothing else. */
const MINTED = /^[A-Za-z0-9_-]{43}$/;
/** A PKCE S256 challenge has the same shape: SHA-256 in base64url. */
const CHALLENGE = MINTED;
/** A PKCE verifier, as RFC 7636 spells one: 43 to 128 of its unreserved characters. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/**
 * Six digits, every one of the million equally likely: a 32-bit draw is redrawn when it falls in the last, short run
 * past the largest multiple of a million, so no code is likelier than another.
 */
const sixDigits = (): string => {
  const draw = new Uint32Array(1);
  do crypto.getRandomValues(draw);
  while (draw[0]! >= 4_294_000_000);
  return String(draw[0]! % 1_000_000).padStart(6, '0');
};

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
 * `mint:` key on sending a link is never cleared, because sending a link is not a sign-in.
 *
 * THE `email:` KEY COUNTS MAILS SENT, AND A SPENT LINK CLEARS IT. It counted every start, for any address typed,
 * so anybody could type somebody else's address ten times and keep them from being sent a link for fifteen minutes.
 * Now it is reserved only when a mail is about to go, a full count sends nothing and answers exactly as an unknown
 * address does (so it says nothing about who is here), and spending any link sent to that address clears it. It is
 * never asked when a link is spent, so a link already in the mailbox always works.
 *
 * ONE STATEMENT FOR EVERY KEY, with its rule's numbers bound: `?1` the key, `?2` now, `?3` now minus the window,
 * `?4` now plus the window, `?5` the strikes compared before the lock.
 */
const LOCKOUT = `INSERT INTO dir_fail (key, n, first, until) VALUES (?1, 1, ?2, NULL)
ON CONFLICT (key) DO UPDATE SET
  n     = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN 1 ELSE MIN(n + 1, ?5) END,
  first = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN ?2 ELSE first END,
  until = CASE WHEN until IS NOT NULL AND until <= ?2 THEN NULL
               WHEN until IS NULL AND first <= ?3 THEN NULL
               WHEN n >= ?5 THEN COALESCE(until, ?4) ELSE until END
RETURNING n, until`;

/** The `dir_fail` key that counts the mails sent to one address, however it was typed. */
const mailKey = (address: string): string => `email:${mailCanon(address)}`;

/**
 * A live session: by its id, or by the id it had until a rotation less than a minute ago, only for a person who is
 * not suspended, and only while its last proof is younger than `PROOF_LIFE` (`?3` is now minus that). `is_current`
 * says which of the two ids matched, because only the current id may rotate. `app` is an app session's device label,
 * `null` for a browser's: the row in `dir_app_session` is always under the session's current id.
 */
const LIVE = `SELECT s.id_hash AS id_hash, s.person AS person, s.record AS record, s.rotated_at AS rotated_at,
       s.authed_at AS authed_at, p.email AS email, s.id_hash = ?1 AS is_current, a.label AS app
  FROM dir_session s JOIN dir_person p ON p.id = s.person AND p.suspended_at IS NULL
  LEFT JOIN dir_app_session a ON a.id_hash = s.id_hash
 WHERE (s.id_hash = ?1 OR (s.prev_hash = ?1 AND s.prev_until > ?2)) AND s.expires > ?2 AND s.authed_at > ?3`;

/**
 * The record a live name means for this person: `?1` the person, `?2` the slug. A name that is not a live slug, a
 * closed record and a record they are not on are all no row.
 *
 * ONE STATEMENT FOR `switch` AND FOR A NAMED `session`, so moving the row and reading through the path cannot come
 * to disagree about who is on what. `switch`'s update puts the same text inside its own `WHERE`.
 */
const ON_RECORD = `SELECT s.record FROM dir_slug s
     JOIN dir_record r ON r.id = s.record AND r.closed_at IS NULL
     JOIN dir_member m ON m.record = s.record AND m.person = ?1
    WHERE s.slug = ?2 AND s.released_at IS NULL`;

/**
 * The owner of the record a live name means, when this person was taken off it (`dir_left`): `?1` the person, `?2` the
 * slug. Asked only after `ON_RECORD` found nothing, so somebody who was on a record and is not now is told their access
 * ended, and every other name keeps the one 403.
 */
const LEFT_RECORD = `SELECT p.name, p.email FROM dir_slug s
     JOIN dir_record r ON r.id = s.record AND r.closed_at IS NULL
     JOIN dir_left l ON l.record = s.record AND l.person = ?1
     LEFT JOIN dir_person p ON p.id = r.owner
    WHERE s.slug = ?2 AND s.released_at IS NULL`;

/**
 * Every way in a person had, gone: their passkeys, sessions, unspent links and challenges, the proofs still pending for
 * their address, and the count of mails sent to it. The sign-in half of closing an account, run inside the Directory's
 * transaction by `closeAccount` (`directory.ts`), which then takes their memberships and their row.
 *
 * HERE, BECAUSE THESE ARE SIGN-IN'S TABLES and this file is the one that knows every one of them and how the lockout
 * spells an address. The address keys are lower-cased as `mailKey` and `dir_pending` store them. A lockout keyed by
 * a network address is left, because it counts a place and not a person.
 */
export function signInForgotten(sql: Sql, person: string, email: string): { passkeys: number; sessions: number } {
  const count = (table: string): number => Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE person = ?`, person)?.n ?? 0);
  const passkeys = count('dir_passkey');
  const sessions = count('dir_session');
  sql.exec('DELETE FROM dir_passkey WHERE person = ?', person);
  sql.exec('DELETE FROM dir_app_session WHERE id_hash IN (SELECT id_hash FROM dir_session WHERE person = ?)', person);
  sql.exec('DELETE FROM dir_session WHERE person = ?', person);
  sql.exec('DELETE FROM dir_link WHERE person = ?', person);
  sql.exec('DELETE FROM dir_challenge WHERE person = ?', person);
  sql.exec('DELETE FROM dir_pending WHERE email = ?', email.trim().toLowerCase());
  sql.exec('DELETE FROM dir_fail WHERE key = ?', mailKey(email));
  return { passkeys, sessions };
}

/**
 * A typed name as the slug it could be, lower-cased, or `null` when no slug is spelt that way.
 *
 * ASCII BEFORE IT IS LOWERED. `toLowerCase` folds the Kelvin sign to `k` and more besides, so a name no slug can be
 * spelt with would otherwise open the record whose name it folds to.
 */
const slugTyped = (x: unknown): string | null => {
  const typed = text(x).trim();
  return /^[A-Za-z][A-Za-z0-9-]{1,31}$/.test(typed) ? typed.toLowerCase() : null;
};

/**
 * `session` with the record the request's path names. `AuthCall`'s own arm has no `slug`, and this is the one flow
 * that takes one without writing; `@braindog/ports` is where it belongs the day that file is next opened.
 */
export type SessionAsk = { flow: 'session'; sid: string; slug?: string };

/** `Auth`, and the named `session` beside it. Assignable to `Auth`, so every host that holds one is unchanged. */
export type DirectoryAuth = <C extends AuthCall | SessionAsk | SignupCall | AccountCall | PasskeyRename>(
  call: C,
) => Promise<AuthResult<DirectoryBodies[C['flow']]>>;

type Row = { id_hash: string; person: string; record: string | null; rotated_at: number; authed_at: number; email: string; is_current: number; app: string | null };
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

/** An email address as far as one can be told without mailing it: one `@`, a dot after it, no space, 254 characters at most. */
const ADDRESS = /^(?=.{3,254}$)[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The invitation and name a mailbox proof was minted with, or `null` for a payload this code did not write. */
const pendingInvite = (payload: string): { invite: string; name: string | null } | null => {
  let x: unknown = null;
  try {
    x = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isObject(x) || typeof x.invite !== 'string' || x.invite === '') return null;
  return { invite: x.invite, name: typeof x.name === 'string' && x.name !== '' ? x.name : null };
};

/**
 * The record name, person's name and zone a sign-up proof was minted with, and the hash of the sign-up code it holds,
 * or `null` for a payload this code did not write. A proof minted with no code, or before codes existed, holds none.
 */
const pendingSignup = (payload: string): { slug: string; name: string | null; tz: string | null; code: string | null } | null => {
  let x: unknown = null;
  try {
    x = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isObject(x) || typeof x.slug !== 'string' || x.slug === '') return null;
  return {
    slug: x.slug,
    name: typeof x.name === 'string' && x.name !== '' ? x.name : null,
    tz: typeof x.tz === 'string' && x.tz !== '' ? x.tz : null,
    code: typeof x.code === 'string' && /^[0-9a-f]{64}$/.test(x.code) ? x.code : null,
  };
};

/**
 * A sign-up code as `dir_invite` keeps it: SHA-256, in hex.
 *
 * UNKEYED, UNLIKE EVERY OTHER HASH HERE, because a code is 32 random bytes and a hash of one cannot be walked back, and
 * because `invite.mint` must hash what it mints on a Directory with sign-in off as readily as with it on.
 */
export async function codeHash(code: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  let out = '';
  for (const b of digest) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * `signup.start` as the Worker sends it: `checked`, whether a bot check ran in front of it (`SIGNUP_UNCHECKED` applies
 * when it did not), while sign-up is by invitation, `invite` with the `code` the page carried, and `said`, what was
 * said, for the mailed link's fragment only.
 *
 * HERE AND NOT IN `@braindog/ports`, as `SessionAsk` is, because only this file and the Worker read the four fields;
 * the port's arm is where they belong the day that file is next opened. Assignable to `SignupCall`, so `auth` takes it.
 */
export type SignupStart = Extract<SignupCall, { flow: 'signup.start' }> & { checked?: boolean; invite?: boolean; code?: string; said?: string };

/**
 * The most of what was said that rides in a sign-up link: the sentence and its one answer, as the page packs them.
 *
 * IN THE LINK'S FRAGMENT AND NOWHERE ELSE (`signup.start`), so a link opened on another device still builds from it.
 * A fragment never reaches a server, and this file never writes it to a table or a log.
 */
export const SAID_IN_LINK = 1000;

/**
 * The most of it a link carries, counted as the link writes it: bytes after percent-encoding, which is what a mail
 * client or a gateway on the way counts before it cuts an address short.
 *
 * NOT CHARACTERS. A Latin letter is one byte in a link and an Arabic one is six, so a thousand characters of Arabic
 * was a link of six thousand and more. `SAID_IN_LINK` stays as the most anybody may send at all; inside it, a sentence
 * that writes longer than this keeps its start (`saidFitted`) and is never refused for its alphabet.
 */
export const SAID_LINK_BYTES = 2000;

/**
 * What in a sentence a letter must not carry: a web address, by its scheme, `www.` or a common ending, and an email
 * address. The link is the letter's button, and a sign-up that let anybody put a link into a letter to anybody
 * else would be a way to send one. The letter shows the link in words only as far as its proof (`shown` in
 * `apps/worker/src/mail.ts`), so what is said here is never printed in it.
 *
 * THE SAME RULES AS THE PAGE'S (`apps/web/src/lib/signup.ts`, `CARRIES_NOT`), which leaves such a sentence on the device
 * rather than be refused.
 */
const NOT_IN_LINK: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|ai|app|dev|me|info|biz|xyz|ly|gl|gg|link|site|online|shop|store)\b/i,
];

/**
 * Why a sentence cannot ride in a sign-up link, or `null` when it can. Called before any strike, as a malformed address
 * is: nothing about it says who is here.
 */
export function saidRefused(said: string): string | null {
  if (said.length > SAID_IN_LINK) return 'The link carries at most 1,000 characters of what you said. Shorten it, or leave the rest for later.';
  if (NOT_IN_LINK.some((r) => r.test(said))) return 'The link cannot carry a web or email address. Take it out of what you said, and add it once your BrainDog is made.';
  try {
    encodeURIComponent(said);
  } catch {
    return 'What you said has a character a link cannot carry. Type it again.';
  }
  return null;
}

/** A start of `words` that ends on a whole character: half of one is a character no link can carry. */
const startOf = (words: string, most: number): string => words.slice(0, most).replace(/[\uD800-\uDBFF]$/u, '');

/**
 * What was said, as much of it as a link carries (`SAID_LINK_BYTES`), and whether any was left out.
 *
 * AS THE PAGE PACKS IT (`saidForLink`: the sentence under `said`, its one answer beside it), only the sentence is
 * shortened, at a word when one ends near, and the pack says so with `cut: true`, so the page the link opens can say the rest was left for
 * later. The whole of it waits on the device it was typed on, as before. Anything else is words and is shortened as
 * words. A pack that is too long with no sentence in it at all carries nothing: the link is then the proof alone.
 *
 * Only for what `saidRefused` let through, so nothing here meets a character a link cannot carry.
 */
export function saidFitted(said: string): { said: string; cut: boolean } {
  const fits = (s: string): boolean => encodeURIComponent(s).length <= SAID_LINK_BYTES;
  if (fits(said)) return { said, cut: false };
  let packed: Record<string, unknown> | null = null;
  try {
    const v: unknown = JSON.parse(said);
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { said?: unknown }).said === 'string') packed = v as Record<string, unknown>;
  } catch {
    /* Not a pack: plain words, shortened as they are. */
  }
  const whole = packed === null ? said : String(packed.said);
  const pack = (words: string): string => (packed === null ? words : JSON.stringify({ ...packed, said: words, cut: true }));
  /* THE LONGEST START THAT FITS, found by halves: a longer start never writes shorter. */
  let most = 0;
  for (let lo = 0, hi = whole.length; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (fits(pack(startOf(whole, mid)))) {
      most = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const start = startOf(whole, most);
  /* AT A WORD, WHEN ONE ENDS NEAR: writing with few spaces or none (Chinese, Thai) keeps its start to the character,
     and never loses most of itself to the one space it had. */
  const space = /\s/u.test(whole[start.length] ?? '') ? -1 : start.search(/\s\S*$/u);
  const words = (space > 0 && space >= start.length * 0.75 ? start.slice(0, space) : start).trimEnd();
  return { said: words === '' ? '' : pack(words), cut: true };
}

/** What `signup.start` answers while sign-up is by invitation and no code could be held: the Worker turns it into a 403. */
export type SignupNeeds = { needs: 'code' };

/** What `signup.start` answers, with no mail sent, when the invitation's code was mailed to the address that asked: the proof itself. */
export type SignupProof = { proof: string };

/**
 * A person giving one of their own passkeys a name of their choosing: `label` is what they typed.
 *
 * The arm `AuthCall` in `@braindog/ports` now carries too, kept here under this name for the hosts and the self-host
 * start that import it from `@braindog/record/directory`.
 */
export type PasskeyRename = { flow: 'passkey.rename'; sid: string; id: string; label: string };

/** What each flow answers on a 200: `AuthBodies`, and the renamed passkey for `passkey.rename`. */
export type DirectoryBodies = AuthBodies & { 'passkey.rename': PasskeyInfo };

/** The longest name a passkey keeps, in characters. */
export const PASSKEY_NAME_MOST = 64;

/** Whole characters as a reader sees them: a flag, a family, a skin tone, each one, however many code points it takes. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * A passkey's name as it is kept: one line, every run of spaces, tabs and line breaks one space, trimmed, and cut to
 * `PASSKEY_NAME_MOST` code points. `null` when nothing is left.
 *
 * THE CUT FALLS BETWEEN WHOLE CHARACTERS, so a flag or a family emoji at the edge is dropped whole and never halved,
 * and it counts code points, so a character stacked with marks cannot make a short name long. THE SAME AT
 * REGISTRATION AND AT A RENAME, so the platform's name a browser sends and a name a person types are kept by one rule,
 * and a name never pushes the passkey list onto a second line.
 */
export function passkeyName(x: unknown): string | null {
  const line = text(x).replace(/[\s\p{Cc}]+/gu, ' ').trim();
  let cut = '';
  let size = 0;
  for (const { segment } of GRAPHEMES.segment(line)) {
    size += Array.from(segment).length;
    if (size > PASSKEY_NAME_MOST) break;
    cut += segment;
  }
  cut = cut.trim();
  return cut === '' ? null : cut;
}

/**
 * An app session's device label as it is kept: `passkeyName`'s rule (one line, 64 code points, cut between whole
 * characters), and `APP_LABEL` when the app sent nothing that leaves a word.
 *
 * THE APP'S WORDS AND NOT A CLAIM. A label says what the person will read in Settings; nothing decides anything on it,
 * so it is kept as sent, as a passkey's name is.
 */
export const appLabel = (x: unknown): string => passkeyName(x) ?? APP_LABEL;

/**
 * Names a host gives to anybody who asks, where a passkey made for the name, or for one under it, would answer at
 * sites its operator does not own: `workers.dev`, `pages.dev`, `github.io` and the hosts like them.
 */
const SHARED_HOSTS = ['workers.dev', 'pages.dev', 'github.io', 'netlify.app', 'vercel.app', 'herokuapp.com', 'fly.dev', 'onrender.com', 'web.app', 'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'trycloudflare.com', 'ngrok.io', 'ngrok-free.app'];

/**
 * A country's shared second level, refused only as itself: `example.co.uk` is somebody's own name, `co.uk` is everybody's.
 */
const SHARED_LEVELS = ['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'co.za', 'com.br', 'co.in', 'com.cn'];

/**
 * The sentence that refuses a relying-party id on a shared public suffix, or `null` for a name an operator can own.
 *
 * A PASSKEY IS BOUND TO ITS NAME, and every site under a shared name can ask a browser for it. A BrainDog at
 * `studio.pages.dev` whose passkeys were made for `pages.dev`, or for `studio.pages.dev` itself, holds them on a name
 * the platform hands out again; the operator owns neither. So the Directory refuses to start with one, by the name,
 * and says what to do instead; the self-host's start prints the sentence. It stays strict: no setting lets a shared name
 * through, and the sentence says so, so nobody goes looking for one.
 */
export function sharedSuffix(id: string): string | null {
  const name = id.trim().toLowerCase().replace(/\.$/, '');
  const host = SHARED_HOSTS.find((s) => name === s || name.endsWith(`.${s}`));
  const level = SHARED_LEVELS.find((s) => name === s);
  const shared = host ?? level;
  if (shared === undefined) return null;
  return `Passkeys cannot use ${shared}: it is a name many sites share, so any of them could ask for your passkeys. Serve BrainDog at a domain you own and sign in there. This is on purpose, and there is no setting that allows it.`;
}

/**
 * A typed record name as it would be stored: trimmed, and lower-cased only when it is ASCII.
 *
 * ASCII BEFORE IT IS LOWERED, for the reason `slugTyped` gives: `toLowerCase` folds the Kelvin sign to `k`, and a name
 * that folded into a legal one would be checked as a name the person never typed.
 */
const signupSlug = (x: unknown): string => {
  const typed = text(x).trim();
  return /^[\x20-\x7e]*$/.test(typed) ? typed.toLowerCase() : typed;
};

/**
 * `auth(call)`, or with no config, a Directory that answers `methods` with "not configured" and every other flow
 * with 404. That is the Worker without `SESSION_SECRET`: it says why sign-in is off rather than failing.
 */
export function createAuth(sql: Sql, clock: Clock, config?: AuthConfig): DirectoryAuth {
  const encoder = new TextEncoder();
  /* A PERSON MADE BY A SIGN-UP GETS THE SAME `p_` AND ULID the Directory's own `person$` writes, off the same clock. */
  const personId = ulids(() => clock.now());

  if (config && config.mac.length < 32) throw new Error('The sign-in MAC key must be at least 32 bytes.');
  /* A PASSKEY DOMAIN ON A SHARED SUFFIX IS REFUSED AT THE START, as a short key is, and never served (`sharedSuffix`). */
  const shared = config?.rp ? sharedSuffix(config.rp.id) : null;
  if (shared !== null) throw new Error(shared);
  const macKey: Promise<Key> | null = config
    ? crypto.subtle.importKey('raw', new Uint8Array(config.mac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : null;
  /* THE SERVER KEY IS HELD AS ITS DIGEST, and a presented one is digested too, so the compare is over two
     32-byte values and takes the same time whatever either of them is. */
  /* A BLANK SERVER KEY OPENS NOTHING: its digest is the digest of a missing one. */
  const wanted: Promise<ArrayBuffer> | null = config?.key && config.key.serverKey.trim() !== '' ? crypto.subtle.digest('SHA-256', encoder.encode(config.key.serverKey)) : null;

  const hmac = async (kind: 's:' | 'l:' | 'c:' | 'p:' | 'a:', value: string): Promise<string> => {
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

  /** The S256 challenge of a PKCE verifier, as the app made it: SHA-256 of its text, in base64url. `null` for no verifier. */
  const challengeOf = async (verifier: unknown): Promise<string | null> =>
    typeof verifier === 'string' && VERIFIER.test(verifier) ? b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))) : null;

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
  const reserve = (flow: Flow, key: string, now: number, rule: Rule = SIGN_IN): AuthResult | null => {
    let row: { n: number; until: number | null } | undefined;
    try {
      row = sql.one<{ n: number; until: number | null }>(LOCKOUT, key, now, now - rule.window, now + rule.window, rule.most);
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

  /**
   * Whether `key` is locked now, counting nothing: for a question whose answer to the rightful asker must not cost them
   * a strike (`magic.whose`). Fails closed, as `reserve` does.
   */
  const lockedNow = (flow: Flow, key: string, now: number): AuthResult | null => {
    let row: { until: number | null } | undefined;
    try {
      row = sql.one<{ until: number | null }>('SELECT until FROM dir_fail WHERE key = ?', key);
    } catch {
      say(flow, 'reserve');
      return { status: 503 };
    }
    if (row !== undefined && row.until !== null && Number(row.until) > now) {
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
   * cookie is still good for a minute as the previous id. `authed_at` is never touched: rotation is not a proof,
   * and the new expiry is never past `PROOF_LIFE` from it, so the row goes when the proof runs out.
   *
   * AN APP SESSION NEVER ROTATES HERE. Its one id is shared by the app's webview, its widgets, its notification
   * extension and its intents, each reading it from the Keychain, and a rotation on read would hand the new id to
   * whichever of them asked first and leave the rest on an id that dies a minute later. The app renews it itself, once
   * a day, with `app.refresh`, so its expiry moves only then.
   */
  const current = async (sid: unknown, now: number): Promise<Found | null> => {
    const hash = await hashOf(sid);
    if (hash === null) return null;
    const row = sql.one<Row>(LIVE, hash, now, now - PROOF_LIFE);
    if (!row) {
      /* Expired, or its person suspended: the row can never answer again, so it goes. */
      sql.exec('DELETE FROM dir_session WHERE id_hash = ?', hash);
      return null;
    }
    if (!row.is_current || row.app !== null || now - Number(row.rotated_at) <= ROTATE_AFTER) return { row, rotated: null };
    const next = await minted();
    const moved = sql.one(
      `UPDATE dir_session SET id_hash = ?1, prev_hash = id_hash, prev_until = ?2, rotated_at = ?3, expires = MIN(?4, authed_at + ?7)
        WHERE id_hash = ?5 AND rotated_at = ?6 RETURNING id_hash`,
      next.hash,
      now + GRACE,
      now,
      now + LIFE,
      hash,
      row.rotated_at,
      PROOF_LIFE,
    );
    return { row, rotated: moved ? { sid: next.sid } : null };
  };

  /** The MAC the found session is stored under now: the rotated one when this call rotated it. */
  const hashNow = async (found: Found): Promise<string> => (found.rotated ? hmac('s:', found.rotated.sid) : found.row.id_hash);

  /**
   * `null` when the session proved itself within `FRESH`, or the one 401 that says it did not.
   *
   * A PASSKEY IS A WAY IN, SO ADDING OR REMOVING ONE ASKS FOR A RECENT PROOF, as the keychain does. Without it a
   * browser left signed in for a month, or a cookie copied off it, could add the taker's own passkey and keep the
   * account after the cookie was gone. The rotation still rides on the answer, and the cookie is not cleared: the
   * person is who they say they are, and signing in again is the whole of the fix.
   */
  const stale = (flow: Flow, found: Found, now: number): AuthResult | null => {
    if (now - Number(found.row.authed_at) <= FRESH) return null;
    say(flow, 'stale');
    return {
      status: 401,
      reason: 'stale',
      refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to change your passkeys. It has been more than fifteen minutes since you last did.', at: 'proof' },
      ...carry(found),
    };
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
   * AND THE DEAD ROWS GO WITH IT: expired sessions and lockout keys whose window has passed, the app labels whose
   * session has gone by any road (a sign-out, a passkey removed, a suspension, an expiry), and app codes past their
   * ten minutes. Sign-in is the one write every host makes regularly and nobody makes a thousand times a second.
   *
   * `app` MAKES IT AN APP SESSION, listed under that label and exempt from rotation on read (`current`); `null` is a
   * browser's, as every session was.
   */
  const open = (person: Person, presented: string | null, next: Minted, now: number, strike: string, app: string | null = null): Who => {
    if (presented !== null) sql.exec('DELETE FROM dir_session WHERE id_hash = ?1 OR (prev_hash = ?1 AND prev_until > ?2)', presented, now);
    sql.exec('DELETE FROM dir_fail WHERE key = ?', strike);
    sql.exec('DELETE FROM dir_session WHERE expires <= ?', now);
    sql.exec('DELETE FROM dir_app_session WHERE id_hash NOT IN (SELECT id_hash FROM dir_session)');
    sql.exec('DELETE FROM dir_app_code WHERE expires <= ?', now);
    /* EACH LIMIT KEEPS ITS OWN WINDOW (sec3, 2 Nov). This deleted every unlocked row fifteen minutes after its first
       strike, sign-in's window, so sign-up's three an hour (`SIGNUP_UNCHECKED`) and applying's ten an hour started again
       at one whenever anybody signed in. Every statement that strikes (`LOCKOUT`, `applyStrike`, oauth's `COUNT`) already
       starts a count again once its own window has passed, so the sweep is only tidying: it keeps a row for the longest
       window any limit has (`STRIKES_KEPT`), and a lock to its `until`. */
    sql.exec('DELETE FROM dir_fail WHERE COALESCE(until, first + ?1) <= ?2', STRIKES_KEPT, now);
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
    if (app !== null) sql.exec('INSERT INTO dir_app_session (id_hash, label, made_at) VALUES (?, ?, ?)', next.hash, app, now);
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

  const auth = async (call: AuthCall | SessionAsk | SignupCall | PasskeyRename): Promise<AuthResult> => {
    const flow = call.flow;
    if (!config) {
      if (flow !== 'methods') return off();
      const body: Methods = { configured: false, passkey: false, magic: false, key: false, firstRun: false, me: null };
      return { status: 200, body };
    }
    /* THE CLOCK IS READ ONCE, so every row one call writes shares an instant however long its awaits take. */
    const now = clock.now();
    const rp = config.rp;
    /* EVERY ORIGIN A CEREMONY MAY COME FROM: the host's page, and those the host added (`AuthConfig.rp`). */
    const origins: readonly string[] = rp ? [...new Set([rp.origin, ...(rp.origins ?? [])])] : [];

    switch (call.flow) {
      case 'methods': {
        const found = call.sid === undefined ? null : await current(call.sid, now);
        const body: Methods = {
          configured: true,
          passkey: rp !== undefined,
          magic: config.magic,
          /* EXACTLY ONE. With nobody in the Directory the exchange has nobody to sign in, so offering it would be a door that cannot open. */
          key: config.key !== undefined && persons() === 1,
          /* THIS PERSON'S PASSKEYS, NOT THE WHOLE DIRECTORY'S. On the Cloud somebody else always has one, so the
             whole-Directory question told every newcomer they were past their first run and never led them to add
             one. Signed out there is nobody to ask about, and "none anywhere" is the one answer still true then. */
          firstRun: found
            ? sql.one('SELECT 1 AS x FROM dir_passkey WHERE person = ? LIMIT 1', found.row.person) === undefined
            : sql.one('SELECT 1 AS x FROM dir_passkey LIMIT 1') === undefined,
          me: found ? whoOf(found.row) : null,
        };
        /* A cookie that names no session is cleared here too: this is the first call the app makes. */
        const cookie: Cookie = found ? carry(found) : call.sid === undefined ? {} : { session: 'clear' };
        return { status: 200, body, ...cookie };
      }

      /**
       * Who a cookie is, and with a slug, which record that request is for.
       *
       * THE SLUG IS THE PATH'S (`/<slug>/api/…`), AND THIS IS THE CHECK THAT RUNS BEFORE THE WORKER ADDRESSES
       * ANYTHING. It is `switch`'s own question, a live name on an open record this person is on, answered with the
       * record and never written: the session row's record stays where the last switch put it, so the bare app still
       * goes back there, and a read in one tab does not move another tab's.
       *
       * ONE 403 FOR EVERY NAME THAT IS NOT THEIRS, word for word the record's own "You are not on this record.". A
       * name nobody holds, a released one, a closed record and somebody else's are the same answer, so asking says
       * nothing about which names exist. Whether they may still read inside it is the record's `access`, asked next.
       */
      case 'session': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        /* AND WHETHER THEY HAVE A PASSKEY, so a share that widens asks them to confirm inline only when they can. */
        const passkey = sql.one('SELECT 1 AS x FROM dir_passkey WHERE person = ? LIMIT 1', found.row.person) !== undefined;
        if (!('slug' in call) || call.slug === undefined) return { status: 200, body: { ...whoOf(found.row), passkey }, ...carry(found) };
        const slug = slugTyped(call.slug);
        const on = slug === null ? undefined : sql.one<{ record: string }>(ON_RECORD, found.row.person, slug);
        if (!on) {
          /* A NAME THEY WERE TAKEN OFF SAYS THEIR ACCESS ENDED, which tells them nothing they did not know: they held it. */
          const left = slug === null ? undefined : sql.one<{ name: string | null; email: string | null }>(LEFT_RECORD, found.row.person, slug);
          const refusal = left ? { code: 'FORBIDDEN', fix: accessEndedSaid(left.name ?? left.email), at: ACCESS_ENDED_AT } : { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' };
          return { status: 403, refusal, ...carry(found) };
        }
        return { status: 200, body: { ...whoOf(found.row), record: on.record, passkey }, ...carry(found) };
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

      /** Registration needs a live session, which stands in for attestation (`12 §8`), proved within `FRESH`. */
      case 'passkey.register.options': {
        if (!rp) return off();
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const old = stale(flow, found, now);
        if (old) return old;
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
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
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
        const old = stale(flow, found, now);
        if (old) return old;
        const keep = carry(found);
        const person = found.row.person;
        const cred = made(call.credential);
        if (!cred) return rejected(flow, 'shape', keep);
        /* The challenge the browser carried is found and consumed first, so a response is good once whatever
           happens to it after. */
        const pre = clientData(cred.clientDataJSON, { type: 'webauthn.create', origin: origins });
        if (!pre.ok) return rejected(flow, pre.why, keep);
        if (!consume(await hmac('c:', pre.value.challenge), 'register', person, now)) return rejected(flow, 'challenge', keep);
        const v = await registration(cred, { origin: origins, rpId: rp.id, challenge: pre.value.challenge });
        if (!v.ok) return rejected(flow, v.why, keep);
        /* The id the browser reported must be the id the authenticator attested, or this is two responses spliced. */
        if (v.value.id !== cred.id) return rejected(flow, 'shape', keep);
        const label = passkeyName(call.label);
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
        /* THE PERSON HEARS ABOUT A NEW WAY INTO THEIR ACCOUNT, at the address on file, so one they did not add is one they can see. */
        return { status: 200, body, mail: { kind: 'passkey.added', to: found.row.email }, ...keep };
      }

      /**
       * A challenge for signing in, after a strike against the asking address (`chal:<ip>`, see `CHALLENGE_CAP`).
       *
       * NOT CLEARED BY A SUCCESS, because minting is not a sign-in: the rule is a rate, and thirty a minute is far
       * past what a person pressing a button asks for.
       */
      case 'passkey.assert.options': {
        if (!rp) return off();
        const challenge = fresh();
        const hash = await hmac('c:', challenge);
        const stop = reserve(flow, `chal:${text(call.ip)}`, now, CHALLENGES);
        if (stop) return stop;
        if (!store(hash, 'assert', null, now)) {
          say(flow, 'full');
          return { status: 503 };
        }
        const body: AssertionOptions = { challenge, rpId: rp.id, timeout: 300000, userVerification: 'required', allowCredentials: [] };
        return { status: 200, body };
      }

      /** `app` makes the session an app session under that label (`open`), for a passkey a native app asserted. */
      case 'passkey.assert': {
        if (!rp) return off();
        const [presented, next] = await Promise.all([hashOf(call.sid), minted()]);
        const app = call.app === undefined ? null : appLabel(call.app);
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        const cred = asserted(call.credential);
        if (!cred) return rejected(flow, 'shape');
        const pre = clientData(cred.clientDataJSON, { type: 'webauthn.get', origin: origins });
        if (!pre.ok) return rejected(flow, pre.why);
        if (!consume(await hmac('c:', pre.value.challenge), 'assert', null, now)) return rejected(flow, 'challenge');
        const held = sql.one<{ person: string; jwk: string; alg: number; sign_count: number }>(
          'SELECT person, jwk, alg, sign_count FROM dir_passkey WHERE id = ?',
          cred.id,
        );
        if (!held) return rejected(flow, 'unknown');
        const v = await assertion(cred, {
          origin: origins,
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
          return moved ? open(person, presented, next, now, strike, app) : 'count';
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: outcome, session: { sid: next.sid } };
      }

      /**
       * A sign-in link, after two reservations: one per address asking, and one per mailbox a link is sent to.
       *
       * AN UNKNOWN ADDRESS GETS THE SAME 200 AND NO MAIL. Sign-up is not a side door here, and an answer that
       * differed would say who has an account. The host sends the mail without waiting, so the time taken does
       * not say it either.
       *
       * AND SO DOES A MAILBOX THAT HAS HAD ITS FILL. The `email:` key is reserved only once a person is found, so a
       * 429 from it would be a 429 only a known address could earn, and that is the account oracle again. A full
       * count is the same 200 with no mail; the links already sent still work, and spending one clears the count.
       *
       * A BRAINDOG APP'S LINK CARRIES A CODE TOO. With `app`, the app's PKCE challenge, six digits are minted beside the
       * link, bound to the challenge and to the link (`dir_app_code`), and mailed with it as `appCode`, for a letter
       * opened on a device other than the one the app is on: the person types the six digits in the app, and only the
       * app holding the verifier can spend them (`app.code`). ONE ROW PER CHALLENGE: asking again from the same window
       * replaces the code, and the earlier link still works alone. The code and its MAC are made before the address is
       * looked up, as the link's are, so a known address takes no longer to answer than an unknown one.
       */
      case 'magic.start': {
        if (!config.magic) return off();
        const email = text(call.email).trim();
        const linkToken = fresh();
        const challenge = typeof call.app === 'string' && CHALLENGE.test(call.app) ? call.app : null;
        const appCode = challenge === null ? null : sixDigits();
        const [hash, codeMac] = await Promise.all([hmac('l:', linkToken), appCode === null ? null : hmac('a:', `${challenge}.${appCode}`)]);
        const stop = reserve(flow, `mint:${text(call.ip)}`, now);
        if (stop) return stop;
        const person = email.includes('@')
          ? sql.one<Person>('SELECT id, email FROM dir_person WHERE lower(email) = lower(?) AND suspended_at IS NULL', email)
          : undefined;
        if (!person) {
          say(flow, 'unknown');
          return { status: 200, body: {} };
        }
        /* `reserve` has told the log why (`locked`, or `reserve` when the table failed); either way nothing is sent. */
        if (reserve(flow, mailKey(person.email), now)) return { status: 200, body: {} };
        sql.transactionSync(() => {
          sql.exec('DELETE FROM dir_link WHERE expires <= ?', now);
          sql.exec('INSERT INTO dir_link (hash, person, purpose, expires) VALUES (?, ?, ?, ?)', hash, person.id, 'magic', now + MAGIC_LIFE);
          if (challenge !== null && codeMac !== null) {
            sql.exec('DELETE FROM dir_app_code WHERE expires <= ?', now);
            sql.exec(
              `INSERT INTO dir_app_code (challenge, code_mac, link_hash, tries, expires) VALUES (?, ?, ?, 0, ?)
               ON CONFLICT (challenge) DO UPDATE SET code_mac = excluded.code_mac, link_hash = excluded.link_hash, tries = 0, expires = excluded.expires`,
              challenge,
              codeMac,
              hash,
              now + APP_CODE_LIFE,
            );
          }
        });
        return { status: 200, body: {}, mail: { to: person.email, linkToken, ...(appCode === null ? {} : { appCode }) } };
      }

      /**
       * A sign-in or claim link, redeemed once. Served whether or not mail is on: a claim link is delivered out
       * of band, and a link minted while mail was on is still owed its sign-in.
       *
       * THE PURPOSE IS PART OF THE MATCH, so a claim link presented as a sign-in link finds nothing, and neither
       * burns the other.
       *
       * ONLY THE ASKING ADDRESS IS STRUCK, NEVER THE MAILBOX. A link already sent is always worth spending, and
       * spending it clears the mailbox's count of mails sent (`LOCKOUT`), so the person it reached can ask again.
       *
       * AND ITS APP CODE GOES WITH IT, so the link and the six digits mailed beside it are one use between them. `app`
       * (a sign-in link only, spent by a BrainDog app through `/auth/app`) opens an app session under that label.
       */
      case 'magic.redeem': {
        const claim = 'claimToken' in call;
        const app = 'linkToken' in call && call.app !== undefined ? appLabel(call.app) : null;
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
          sql.exec('DELETE FROM dir_app_code WHERE link_hash = ?', hash);
          const person = livePerson(link.person);
          if (!person) return 'suspended';
          sql.exec('DELETE FROM dir_fail WHERE key = ?', mailKey(person.email));
          if (!claim) sql.exec('DELETE FROM dir_fail WHERE key = ?', codeKey(person.id));
          return open(person, presented, next, now, strike, app);
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: outcome, session: { sid: next.sid } };
      }

      /**
       * The six digits a sign-in letter carried for a BrainDog app, typed in that app (`/auth/app/code`).
       *
       * THREE THINGS MUST AGREE: the verifier, whose S256 is the challenge the code was minted for, so only the app that
       * asked can spend it; the code, compared as a MAC in constant time; and the link it was mailed with, still unspent,
       * which goes in the same transaction, so the link and the code are one use between them.
       *
       * STRUCK TWICE OVER. The asking address pays a strike before anything is compared, as every sign-in does
       * (`reserve`), and each wrong code is counted on its row: the fifth wrong one deletes it, so a million codes are
       * never five guesses from a lucky one. Every miss is the one 401, whatever it missed on.
       */
      case 'app.code': {
        const typed = text(call.code).replace(/[\s-]/g, '');
        const [presented, next, challenge] = await Promise.all([hashOf(call.sid), minted(), challengeOf(call.verifier)]);
        const given = challenge !== null && /^\d{6}$/.test(typed) ? await hmac('a:', `${challenge}.${typed}`) : null;
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        if (challenge === null || given === null) return rejected(flow, 'shape');
        const label = appLabel(call.label);
        const outcome = sql.transactionSync((): Who | Reason => {
          const row = sql.one<{ code_mac: string; link_hash: string; tries: number }>(
            'SELECT code_mac, link_hash, tries FROM dir_app_code WHERE challenge = ? AND expires > ?',
            challenge,
            now,
          );
          if (!row) return 'link';
          /* WHOSE IT WOULD OPEN, BEFORE THE COMPARE: a person past their wrong codes is refused as a miss, compared or not. */
          const whose = sql.one<{ person: string }>("SELECT person FROM dir_link WHERE hash = ? AND purpose = 'magic' AND expires > ?", row.link_hash, now)?.person;
          if (whose === undefined) {
            sql.exec('DELETE FROM dir_app_code WHERE challenge = ?', challenge);
            return 'link';
          }
          const held = sql.one<{ until: number | null }>('SELECT until FROM dir_fail WHERE key = ?', codeKey(whose));
          if (held?.until !== null && held?.until !== undefined && Number(held.until) > now) {
            sql.exec('DELETE FROM dir_app_code WHERE challenge = ?', challenge);
            return 'code';
          }
          if (!same(encoder.encode(given), encoder.encode(row.code_mac))) {
            const tries = Number(row.tries) + 1;
            if (tries >= APP_CODE_TRIES) sql.exec('DELETE FROM dir_app_code WHERE challenge = ?', challenge);
            else sql.exec('UPDATE dir_app_code SET tries = ? WHERE challenge = ?', tries, challenge);
            const r = APP_CODE_PERSON;
            sql.one(LOCKOUT, codeKey(whose), now, now - r.window, now + r.window, r.most);
            return 'code';
          }
          sql.exec('DELETE FROM dir_app_code WHERE challenge = ?', challenge);
          const link = sql.one<{ person: string }>("DELETE FROM dir_link WHERE hash = ? AND purpose = 'magic' AND expires > ? RETURNING person", row.link_hash, now);
          if (!link) return 'link';
          const person = livePerson(link.person);
          if (!person) return 'suspended';
          sql.exec('DELETE FROM dir_fail WHERE key = ?', mailKey(person.email));
          sql.exec('DELETE FROM dir_fail WHERE key = ?', codeKey(person.id));
          return open(person, presented, next, now, strike, label);
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        return { status: 200, body: {}, session: { sid: next.sid } };
      }

      /**
       * Whose account a sign-in or claim link opens, asked by the screen before the press, and nothing spent.
       *
       * A LINK IN SOMEBODY ELSE'S HAND SIGNS YOU IN TO THEIR ACCOUNT. A stranger's own link, sent as `/signin#magic=…`,
       * put a signed-out reader into the stranger's record with one press, and what they typed next landed there (login
       * CSRF). The screen now says the address before the button, so the reader sees it is not theirs.
       *
       * THE ADDRESS IS ANSWERED ONLY TO THE LINK'S HOLDER, who could spend it and read it anyway; every miss strikes the
       * asking address as a redeem does, so the question is no cheaper way to try tokens. A locked address is refused
       * before anything is looked up.
       *
       * ONLY A MISS STRIKES (RD5). Every answer used to, on the same count as every sign-in, and only a sign-in clears
       * it: ten loads of the link page from one address (reloads, a few tabs, an office behind one address) locked every
       * way in from there for fifteen minutes, before anybody had pressed anything.
       */
      case 'magic.whose': {
        const claim = 'claimToken' in call;
        const token = 'claimToken' in call ? call.claimToken : call.linkToken;
        const hash = typeof token === 'string' && MINTED.test(token) ? await hmac('l:', token) : null;
        const strike = `ip:${text(call.ip)}`;
        const stop = lockedNow(flow, strike, now);
        if (stop) return stop;
        const miss = (reason: Reason): AuthResult => reserve(flow, strike, now) ?? rejected(flow, reason);
        if (hash === null) return miss('shape');
        const link = sql.one<{ person: string }>('SELECT person FROM dir_link WHERE hash = ? AND purpose = ? AND expires > ?', hash, claim ? 'claim' : 'magic', now);
        if (!link) return miss('link');
        const person = livePerson(link.person);
        if (!person) return miss('suspended');
        return { status: 200, body: { email: person.email } };
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

      /**
       * A new name for one of the person's own passkeys, kept by `passkeyName`'s rule; a name that leaves nothing is
       * refused with the fix, and the name stands as it was.
       *
       * NO FRESH PROOF AND NO LETTER, unlike adding or removing one: a name opens nothing and closes nothing, so a
       * person who has been signed in all month can tidy their list without signing in again. ANOTHER PERSON'S KEY IS
       * ANSWERED AS A KEY THAT IS NOT THERE, in one statement keyed on both, so the answer says nothing about whether
       * the key exists.
       */
      case 'passkey.rename': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const keep = carry(found);
        const label = passkeyName(call.label);
        if (label === null)
          return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'A passkey needs a name. Type one, such as the device it lives on.', at: 'label' }, ...keep };
        const k = sql.one<{ id: string; label: string | null; alg: number; backed_up: number; created_at: number; last_used: number | null }>(
          'UPDATE dir_passkey SET label = ? WHERE id = ? AND person = ? RETURNING id, label, alg, backed_up, created_at, last_used',
          label,
          text(call.id),
          found.row.person,
        );
        if (!k) return { status: 422, refusal: { code: 'OUT_OF_BOUNDS', fix: 'That passkey is not one of yours. Pick one from your passkeys in Settings.', at: 'id' }, ...keep };
        const body: PasskeyInfo = {
          id: k.id,
          label: k.label,
          alg: k.alg as Alg,
          backedUp: k.backed_up === 1,
          createdAt: Number(k.created_at),
          lastUsed: k.last_used === null ? null : Number(k.last_used),
        };
        return { status: 200, body, ...keep };
      }

      /**
       * Only the person's own passkeys, and the last one too: removing a lost device must never be refused. It asks
       * for a proof within `FRESH`, as adding one does, and signing in again is the whole of what that asks.
       *
       * AND EVERY OTHER SESSION THIS PERSON HAS ENDS WITH IT. A passkey is removed because a device was lost or
       * taken, the sessions that device opened are among the others, and nothing records which ones they are, so
       * all of them go; this browser, which has just proved itself, stays. In one transaction with the key, so a
       * removal that finds no key ends nothing.
       */
      case 'passkey.remove': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const old = stale(flow, found, now);
        if (old) return old;
        const mine = await hashNow(found);
        const person = found.row.person;
        const gone = sql.transactionSync((): boolean => {
          if (!sql.one('DELETE FROM dir_passkey WHERE id = ? AND person = ? RETURNING id', text(call.id), person)) return false;
          sql.exec('DELETE FROM dir_session WHERE person = ? AND id_hash <> ?', person, mine);
          return true;
        });
        if (!gone) return { status: 422, refusal: { code: 'OUT_OF_BOUNDS', fix: 'You have no passkey with that id.', at: 'id' }, ...carry(found) };
        return { status: 200, body: {}, mail: { kind: 'passkey.removed', to: found.row.email }, ...carry(found) };
      }

      /**
       * Every live session this person has, newest first, this one marked (`SESSIONS_READ` at most).
       *
       * NO ROW'S MAC LEAVES WHOLE. `ref` is its first twelve hex, enough for a person to tell two sessions apart
       * and useless as a cookie: a MAC is never looked up as an id, and twelve characters of one match nothing.
       * An app session carries its device label as `device`.
       */
      case 'sessions': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const mine = await hashNow(found);
        const body = {
          sessions: sql
            .all<{ id_hash: string; record: string | null; authed_at: number; rotated_at: number; device: string | null }>(
              `SELECT s.id_hash AS id_hash, s.record AS record, s.authed_at AS authed_at, s.rotated_at AS rotated_at, a.label AS device
                 FROM dir_session s LEFT JOIN dir_app_session a ON a.id_hash = s.id_hash
                WHERE s.person = ? AND s.expires > ? AND s.authed_at > ?
                ORDER BY s.rotated_at DESC, s.id_hash LIMIT ?`,
              found.row.person,
              now,
              now - PROOF_LIFE,
              SESSIONS_READ,
            )
            .map(
              (s): SessionInfo => ({
                ref: s.id_hash.slice(0, 12),
                current: s.id_hash === mine,
                authedAt: Number(s.authed_at),
                activeAt: Number(s.rotated_at),
                record: s.record,
                ...(s.device === null ? {} : { device: s.device }),
              }),
            ),
        };
        return { status: 200, body, ...carry(found) };
      }

      /**
       * Sign out everywhere else (`keep: 'this'`), or everywhere (`keep: 'none'`), and say how many sessions ended.
       *
       * ANYTHING BUT `none` KEEPS THIS ONE, so a caller that sent nothing, or a word this build does not know, is
       * never signed out of the browser it is pressing in. The count is of live sessions; dead rows go with them.
       */
      case 'logout.all': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const all = call.keep === 'none';
        const mine = all ? '' : await hashNow(found);
        const person = found.row.person;
        const ended = sql.transactionSync((): number => {
          const n = Number(
            sql.one<{ n: number }>(
              'SELECT COUNT(*) AS n FROM dir_session WHERE person = ? AND id_hash <> ? AND expires > ? AND authed_at > ?',
              person,
              mine,
              now,
              now - PROOF_LIFE,
            )?.n ?? 0,
          );
          sql.exec('DELETE FROM dir_session WHERE person = ? AND id_hash <> ?', person, mine);
          sql.exec('DELETE FROM dir_app_session WHERE id_hash NOT IN (SELECT id_hash FROM dir_session)');
          return n;
        });
        return { status: 200, body: { ended }, ...(all ? { session: 'clear' as const } : carry(found)) };
      }

      /**
       * End one of this person's sessions, by the `ref` `sessions` listed it under (Settings, the iPhone's End).
       *
       * BY THE ID IT HAS NOW OR THE ONE IT HAD BEFORE ITS LAST ROTATION, because a `ref` is read off a list that may be
       * a day old and a rotation in between changes it; a row keeps its previous id until its next rotation, so the list
       * the person is looking at still names it. Only the person's own rows are asked, so a `ref` of somebody else's
       * session ends nothing and says nothing about it. NONE FOUND IS A 422 and not a quiet `0`, so the page reads the
       * list again rather than say something was ended that is still signed in.
       *
       * THIS SESSION TOO, AND THEN IT IS A SIGN-OUT: the row goes and the cookie is cleared on the same answer, so the
       * app that ended its own session holds nothing that still names one.
       */
      case 'session.end': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const ref = text(call.ref).trim().toLowerCase();
        const gone: AuthResult = {
          status: 422,
          refusal: { code: 'OUT_OF_BOUNDS', fix: 'That session is not signed in any more, or it changed since the list was read. Read the list again.', at: 'ref' },
          ...carry(found),
        };
        if (!/^[0-9a-f]{12}$/.test(ref)) return gone;
        const mine = await hashNow(found);
        const person = found.row.person;
        const ended = sql.transactionSync((): string[] => {
          const rows = sql
            .all<{ id_hash: string }>(
              'SELECT id_hash FROM dir_session WHERE person = ?1 AND (substr(id_hash, 1, 12) = ?2 OR substr(prev_hash, 1, 12) = ?2)',
              person,
              ref,
            )
            .map((r) => r.id_hash);
          for (const hash of rows) {
            sql.exec('DELETE FROM dir_app_session WHERE id_hash = ?', hash);
            sql.exec('DELETE FROM dir_session WHERE id_hash = ?', hash);
          }
          return rows;
        });
        if (ended.length === 0) return gone;
        return { status: 200, body: { ended: ended.length }, ...(ended.includes(mine) ? { session: 'clear' as const } : carry(found)) };
      }

      /**
       * An app session renewed by the app, once a day (`/auth/app/refresh`): what a rotation on read does for a browser.
       *
       * A COMPARE-AND-SET ON `rotated_at`, as a rotation is, and the label moves to the new id in the same transaction.
       * The old id stays good for `APP_GRACE`, five minutes, for the extensions still holding it; the expiry is renewed
       * as a rotation renews it, `LIFE` from now and never past `PROOF_LIFE` from the last proof.
       *
       * FROM THE PREVIOUS ID TOO, WHILE IT IS STILL GOOD. A refresh whose answer was lost on the way leaves the app
       * holding the id it sent; refusing that one would sign the app out five minutes later. The row moves on from
       * the id it now has, and the one before that is gone. Two refreshes of one row at once move it once, and the
       * second is a 503 the app tries again.
       *
       * A BROWSER'S SESSION IS REFUSED, because it rotates itself on read; a rotation that falls due here still rides
       * on the refusal.
       */
      case 'app.refresh': {
        const [found, next] = await Promise.all([current(call.sid, now), minted()]);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        if (found.row.app === null)
          return {
            status: 403,
            refusal: { code: 'FORBIDDEN', fix: 'Only the BrainDog app renews its session this way. A browser renews its own as it is used.', at: 'session' },
            ...carry(found),
          };
        const moved = sql.transactionSync((): boolean => {
          const row = sql.one(
            `UPDATE dir_session SET id_hash = ?1, prev_hash = id_hash, prev_until = ?2, rotated_at = ?3, expires = MIN(?4, authed_at + ?7)
              WHERE id_hash = ?5 AND rotated_at = ?6 RETURNING id_hash`,
            next.hash,
            now + APP_GRACE,
            now,
            now + LIFE,
            found.row.id_hash,
            found.row.rotated_at,
            PROOF_LIFE,
          );
          if (!row) return false;
          sql.exec('UPDATE dir_app_session SET id_hash = ? WHERE id_hash = ?', next.hash, found.row.id_hash);
          return true;
        });
        if (!moved) return { status: 503 };
        return { status: 200, body: {}, session: { sid: next.sid } };
      }

      /**
       * Open another record, by its live name, in the browser this session is in (`51 §13 D4`, `33 §4`).
       *
       * THE RECORD IS ON THE ROW, SO THE ROW MOVES AND THE COOKIE DOES NOT. Every request after this one names the
       * record it opened, and every other browser this person is signed in on stays where it was.
       *
       * ONLY A RECORD THEY ARE ON, OPEN, UNDER A NAME IT STILL HOLDS. A released slug, a closed record and a record
       * somebody else is on are one answer, so asking names nothing about records this person cannot reach. What they
       * may do inside it is still the record's own table, asked on every request after.
       */
      case 'switch': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        const keep = carry(found);
        const refused: AuthResult = { status: 403, refusal: { code: 'FORBIDDEN', fix: 'You are on no open record by that name.', at: 'slug' }, ...keep };
        const slug = slugTyped(call.slug);
        if (slug === null) return refused;
        const live = ON_RECORD;
        const to = sql.one<{ record: string }>(live, found.row.person, slug);
        if (!to) return refused;
        /* AND THE RECORD ITSELF SAYS THEY ARE ON IT, or the browser would be moved somewhere every read refuses. */
        if (config?.admits && !(await config.admits(to.record, found.row.person))) return refused;
        /* THE ROW AS IT IS NOW. A day-old cookie was rotated by `current` above, so the hash it was read under is gone;
           and the host may have awaited `admits`, in which time another request can rotate it again. The update
           asks the same question as the select, so a name released meanwhile moves nothing. */
        const hash = found.rotated ? await hmac('s:', found.rotated.sid) : found.row.id_hash;
        const moved = sql.one<{ record: string }>(
          `UPDATE dir_session SET record = ?3 WHERE (id_hash = ?4 OR prev_hash = ?4) AND ?3 IN (${live}) RETURNING record`,
          found.row.person,
          slug,
          to.record,
          hash,
        );
        if (!moved) return refused;
        return { status: 200, body: { ...whoOf(found.row), record: to.record }, ...keep };
      }

      /**
       * Lock the keychain in this browser (`12 §6.3`, Lock now): the session's last proof is put behind the longest window
       * the keychain can be set to open for, so its next use asks for a sign-in, whatever window the owner chose.
       *
       * ONLY THIS SESSION, AND ONLY ITS PROOF. It stays signed in for everything else, its cookie and its life as they
       * were; a proof moved back by an hour is still well inside `PROOF_LIFE`. Signing in again moves `authed_at` to now,
       * which is the unlock. Every other act that asks for a recent sign-in (`FRESH`) asks for one again too, as it would
       * of a laptop left open for an hour, which is what a locked keychain says.
       */
      case 'keychain.lock': {
        const found = await current(call.sid, now);
        if (!found) return rejected(flow, 'session', { session: 'clear' });
        sql.exec('UPDATE dir_session SET authed_at = MIN(authed_at, ?) WHERE id_hash = ?', now - LOCK_AFTER_MOST_MS - 1, await hashNow(found));
        return { status: 200, body: { locked: true }, ...carry(found) };
      }

      /** The row goes and the cookie is cleared, and an id that names nothing is signed out just the same. */
      case 'logout': {
        const hash = await hashOf(call.sid);
        /* AND THE APP'S LABEL GOES WITH ITS SESSION (sec3, 2 Nov): it stayed until the next sign-in's sweep, naming a
           device that was no longer signed in. */
        if (hash !== null)
          sql.transactionSync(() => {
            sql.exec('DELETE FROM dir_session WHERE id_hash = ?1 OR (prev_hash = ?1 AND prev_until > ?2)', hash, now);
            sql.exec('DELETE FROM dir_app_session WHERE id_hash NOT IN (SELECT id_hash FROM dir_session)');
          });
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

      /**
       * A new address accepting an invitation proves it reads that mailbox before anybody is made (`dir_pending`,
       * purpose `invite`, a day).
       *
       * THE INVITATION WAS A WAY TO BECOME SOMEBODY WITHOUT PROVING ANYTHING. Whoever held the link typed nothing
       * but a name and was made the person at the invited address, so a forwarded or leaked invitation was an
       * account in somebody else's name. Now the host asks this first, mails the proof, and makes the person only
       * when `invite.proved` spends it.
       *
       * THE HOST HAS LOOKED THE INVITATION UP, and `email` is the address it was made for: this checks only that it
       * is an address, and counts it against the mails that address may be sent (`mailKey`), so a live invitation
       * cannot be used to fill somebody's mailbox. With no way to send mail there is nothing to prove with, and the
       * flow is off, as `magic.start` is.
       */
      case 'invite.prove': {
        if (!config.magic) return off();
        const email = text(call.email).trim().toLowerCase();
        if (!ADDRESS.test(email)) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'That is not an email address.', at: 'email' } };
        const invite = text(call.invite).trim();
        if (!invite || invite.length > 512) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'Open the whole invitation link, as it was sent.', at: 'invite' } };
        /* The host has checked the name with `personName`; this only bounds what a row may hold. */
        const name = text(call.name).trim() || null;
        if (name !== null && name.length > 200) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'A name is at most 200 characters.', at: 'name' } };
        const token = fresh();
        const hash = await hmac('p:', token);
        const stop = reserve(flow, mailKey(email), now);
        if (stop) return stop;
        /* THE INVITATION IS KEPT AS SENT, THE ONE VALUE HERE THAT IS NOT A MAC, because `invite.proved` hands it back
           for the host to accept. It opens nothing on its own once proving is the rule: a new address still needs the
           proof, and a known one signs in first. The row is left out of every Directory copy and goes when it is spent
           or a day is up. */
        sql.transactionSync(() => {
          sql.exec('DELETE FROM dir_pending WHERE expires <= ?', now);
          sql.exec(
            'INSERT INTO dir_pending (hash, purpose, email, payload, expires, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            hash,
            'invite',
            email,
            JSON.stringify({ invite, name }),
            now + PENDING_LIFE,
            now,
          );
        });
        return { status: 200, body: {}, mail: { kind: 'invite.prove', to: email, link: token } };
      }

      /**
       * The proof back from the mailbox, spent once: the address, the invitation it was minted for, and the name.
       *
       * THE HOST MAKES THE PERSON ONLY AFTER THIS, and only for the invitation named here, so a proof minted for one
       * invitation opens no other. A dead, spent or unknown proof is the one failure body, like a link. Spending it
       * clears the address's count of mails sent, as spending a sign-in link does.
       */
      case 'invite.proved': {
        const token = call.token;
        const hash = typeof token === 'string' && MINTED.test(token) ? await hmac('p:', token) : null;
        if (hash === null) return rejected(flow, 'shape');
        const spent = sql.transactionSync(() => {
          const row = sql.one<{ email: string; payload: string }>(
            "DELETE FROM dir_pending WHERE hash = ? AND purpose = 'invite' AND expires > ? RETURNING email, payload",
            hash,
            now,
          );
          if (row) sql.exec('DELETE FROM dir_fail WHERE key = ?', mailKey(row.email));
          return row;
        });
        if (!spent) return rejected(flow, 'link');
        const held = pendingInvite(spent.payload);
        if (!held) return rejected(flow, 'shape');
        const body: InviteProved = { email: spent.email, invite: held.invite, name: held.name };
        return { status: 200, body };
      }

      /**
       * Whether a name for a new record can be had: the Directory's grammar and words (`badSlug`), then whether any
       * record holds it or ever held it. A read, so the screen can ask it at every pause in typing.
       *
       * A RELEASED NAME IS NEVER FREE, as `claimed` says in `directory.ts`: every stale link still names it, and handing
       * it out again is how one of them would read somebody else's record.
       */
      case 'signup.name': {
        const slug = signupSlug(call.slug);
        /* THE TYPED NAME IS NOT SAID BACK AT ANY LENGTH: `badSlug` puts it in its sentence, and a page could be handed a
           kilobyte of it. */
        if (slug.length > 64) {
          const body: SignupName = { slug: '', free: false, why: 'A name is at most thirty-two characters.' };
          return { status: 200, body };
        }
        const wrong = badSlug(slug);
        if (wrong !== null) {
          const body: SignupName = { slug, free: false, why: wrong };
          return { status: 200, body };
        }
        const held = sql.one<{ released_at: string | null }>('SELECT released_at FROM dir_slug WHERE slug = ?', slug);
        const body: SignupName = held
          ? { slug, free: false, why: held.released_at ? 'That name was used before, and a name is never given out twice. Try another.' : 'That name is taken. Try another.' }
          : { slug, free: true };
        return { status: 200, body };
      }

      /**
       * A stranger asks for a record: an address, a name for the record, and optionally their own name and zone.
       *
       * THE SAME ANSWER FOR EVERY ADDRESS, so this door tells nobody who has an account. A new address is sent a proof
       * (`dir_pending`, purpose `signup`, a day); an address that can already sign in is sent a sign-in link instead,
       * `signup.known`, so the person who forgot they had one is let in from their mailbox and nobody watching the page
       * learns anything. Both mint one MAC and write one row, so neither answers faster.
       *
       * A LOCKOUT ON EACH OF ITS KEYS: `signup:<ip, an IPv6 address as its /64>` for the asking address, then
       * `signup-email:<address>` for the address typed, which is struck for known and unknown alike so a lock says
       * nothing about which it is; and
       * `email:<address>`, the count of mails sent, is reserved only when a mail is about to go. A full mail count
       * sends nothing and answers exactly as a sent one does. THE FIRST TWO TAKE `SIGNUP_UNCHECKED` unless the host
       * says its bot check ran (`checked`), so an open door with no check in front of it is a narrow one.
       *
       * BY INVITATION (`invite`), A NEW ADDRESS NEEDS A CODE: one in `dir_invite`, not spent, not ended and not held by
       * another proof. It is HELD by the proof written here, for the proof's day, so the same code typed twice is refused
       * the second time; and SPENT when `signup.verify` makes the person. A missing or unusable code answers `needs:
       * 'code'`, which the Worker says as a 403, and writes nothing. A KNOWN ADDRESS NEEDS NONE: it is sent its sign-in
       * link whatever the code, and its answer is the one a new address without a code gets, so the refusal says nothing
       * about who is here. A wrong code costs the `signup:<ip>` strike every `start` pays; a mistyped address costs
       * no strike, because the address is checked first.
       *
       * THE NAME IS CHECKED HERE AS WELL AS LIVE, because nothing about a name is secret: `signup.name` answers the same
       * question to anybody. It is checked again at checkout and once more when the record is made, where it is claimed.
       */
      case 'signup.start': {
        if (!config.magic) return off();
        const asked = call as SignupStart;
        const rule = asked.checked === true ? SIGN_IN : SIGNUP_UNCHECKED;
        const email = text(call.email).trim().toLowerCase();
        if (!ADDRESS.test(email)) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'That is not an email address.', at: 'email' } };
        /* WHAT WAS SAID RIDES IN THE LINK, NEVER IN A TABLE OR A LOG: checked here, before any strike, and read again
           only where the mail is made. None, or only spaces, is a link as it always was. */
        const said = text(asked.said).trim();
        const unsaid = said === '' ? null : saidRefused(said);
        if (unsaid !== null) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: unsaid, at: 'said' } };
        const stop = reserve(flow, `signup:${ipBucket(text(call.ip))}`, now, rule);
        if (stop) return stop;
        const slug = signupSlug(call.slug);
        if (slug.length > 64) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'A name is at most thirty-two characters.', at: 'slug' } };
        const wrong = badSlug(slug);
        if (wrong !== null) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: wrong, at: 'slug' } };
        if (sql.one('SELECT 1 AS n FROM dir_slug WHERE slug = ?', slug))
          return { status: 422, refusal: { code: 'ALREADY_KNOWN', fix: 'That name is taken. Try another.', at: 'slug' } };
        const name = text(call.name).trim() || null;
        if (name !== null && name.length > 200) return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'A name is at most 200 characters.', at: 'name' } };
        /* THE ZONE IS KEPT AS TYPED AND ONLY BOUNDED HERE: checkout and the record's making check it against the zones
           the runtime knows (`zoneOf` in the Worker), and a zone refused there is asked again on the page. */
        const tz = text(call.tz).trim() || null;
        if (tz !== null && (tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)))
          return { status: 422, refusal: { code: 'VALUE_MALFORMED', fix: 'That is not a time zone, such as Europe/London.', at: 'tz' } };

        const token = fresh();
        const [linkHash, proofHash, code] = await Promise.all([
          hmac('l:', token),
          hmac('p:', token),
          asked.invite === true && typeof asked.code === 'string' && MINTED.test(asked.code) ? codeHash(asked.code) : null,
        ]);
        const struck = reserve(flow, `signup-email:${mailCanon(email)}`, now, rule);
        if (struck) return struck;
        /* THE ONE ANSWER EVERY ADDRESS GETS: `{}`, or by invitation with no code that could be held, `needs: 'code'`. */
        const usable = (): boolean =>
          code !== null &&
          sql.one(
            'SELECT 1 AS n FROM dir_invite WHERE code_hash = ? AND spent_at IS NULL AND (ends_at IS NULL OR ends_at > ?) AND (held_until IS NULL OR held_until <= ?)',
            code,
            now,
            now,
          ) !== undefined;
        const needs = asked.invite === true && !usable();
        const same = (): AuthResult => ({ status: 200, body: needs ? ({ needs: 'code' } satisfies SignupNeeds) : {} });
        const person = sql.one<Person & { suspended: number }>(
          'SELECT id, email, suspended_at IS NOT NULL AS suspended FROM dir_person WHERE lower(email) = lower(?)',
          email,
        );
        /* A SUSPENDED PERSON IS SENT NOTHING AND IS NEVER MADE AGAIN: the address is theirs, and `dir_person` holds one
           row per address. The answer is the one every address gets. */
        if (person && Number(person.suspended) !== 0) {
          say(flow, 'suspended');
          return same();
        }
        /* NOTHING IS MINTED FOR A NEW ADDRESS WITHOUT A CODE, and its mail count is not touched, since nothing is sent. */
        if (!person && needs) return same();
        /* `reserve` has told the log why; either way nothing is sent, and the answer is the one a sent mail gets. */
        if (reserve(flow, mailKey(email), now)) return same();
        if (person) {
          sql.transactionSync(() => {
            sql.exec('DELETE FROM dir_link WHERE expires <= ?', now);
            sql.exec('INSERT INTO dir_link (hash, person, purpose, expires) VALUES (?, ?, ?, ?)', linkHash, person.id, 'magic', now + MAGIC_LIFE);
          });
          return { ...same(), mail: { kind: 'signup.known', to: person.email, link: token } } as AuthResult;
        }
        /* THE CODE IS HELD IN THE SAME TRANSACTION AS THE PROOF, and asked again inside it, so two starts with one code
           cannot both find it free. */
        const held = sql.transactionSync((): boolean => {
          if (code !== null) {
            if (!usable()) return false;
            sql.exec('UPDATE dir_invite SET held_until = ? WHERE code_hash = ?', now + PENDING_LIFE, code);
          }
          sql.exec('DELETE FROM dir_pending WHERE expires <= ?', now);
          sql.exec(
            'INSERT INTO dir_pending (hash, purpose, email, payload, expires, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            proofHash,
            'signup',
            email,
            JSON.stringify({ slug, name, tz, ...(code !== null ? { code } : {}) }),
            now + PENDING_LIFE,
            now,
          );
          return true;
        });
        if (!held) return { status: 200, body: { needs: 'code' } satisfies SignupNeeds };
        /* A CODE MAILED TO THIS ADDRESS PROVES IT: the code is 32 random bytes that only reached the inbox it was sent to,
           so a second mail to the same inbox proves nothing more. The proof is handed back to the page, which spends it
           at once, and nothing is sent. ONLY A CODE THE HOST SAYS IT MAILED THERE: a code the operator was shown to pass
           on by hand, when the letter failed, reached whoever it was handed to, and proves no mailbox. */
        if (code !== null && sql.one('SELECT 1 AS n FROM dir_invite_mailed WHERE code_hash = ? AND email = ?', code, email) !== undefined)
          return { status: 200, body: { proof: token } satisfies SignupProof };
        /* THE SENTENCE AFTER THE PROOF, in the fragment the Worker puts the proof in (`#verify=<proof>&said=<words>`),
           so the tab the link opens, on any device, builds from it. Only the letter that makes a record carries it: a
           known address is sent a sign-in link, which builds nothing. */
        /* AS MUCH OF IT AS A LINK CARRIES, by the bytes the link writes: a long sentence keeps its start. */
        const carried = said === '' ? '' : saidFitted(said).said;
        const link = carried === '' ? token : `${token}&said=${encodeURIComponent(carried)}`;
        return { status: 200, body: {}, mail: { kind: 'signup.verify', to: email, link } };
      }

      /**
       * The proof back from the mailbox, spent once: the person is made (the mailbox is now proved) and signed in.
       *
       * STRUCK AGAINST THE ASKING ADDRESS, as a sign-in link is, and never against the mailbox: a proof already sent is
       * always worth spending, and spending it clears the mailbox's count of mails sent.
       *
       * AN ADDRESS THAT BECAME A PERSON IN THE MEANTIME, by an invitation or a second sign-up, is that person: the
       * proof shows the same mailbox either way, and `dir_person` holds one row per address. No record is made here.
       * The session opens on none, and the record is made when its payment is in (`/account/billing/checkout`).
       *
       * THE SIGN-UP CODE THE PROOF HOLDS IS SPENT HERE, in the transaction that makes the person, and names them. A code
       * ended after the proof was sent is still spent: the proof was minted while it stood. A proof with no code (open
       * sign-up, or one mailed before codes) spends nothing.
       */
      case 'signup.verify': {
        const token = call.token;
        const [presented, next, hash] = await Promise.all([
          hashOf(call.sid),
          minted(),
          typeof token === 'string' && MINTED.test(token) ? hmac('p:', token) : null,
        ]);
        const strike = `ip:${text(call.ip)}`;
        const stop = reserve(flow, strike, now);
        if (stop) return stop;
        if (hash === null) return rejected(flow, 'shape');
        const made = new Date(now).toISOString();
        const outcome = sql.transactionSync((): { who: Who; held: { slug: string; name: string | null; tz: string | null; code: string | null } } | Reason => {
          const row = sql.one<{ email: string; payload: string }>(
            "DELETE FROM dir_pending WHERE hash = ? AND purpose = 'signup' AND expires > ? RETURNING email, payload",
            hash,
            now,
          );
          if (!row) return 'link';
          const held = pendingSignup(row.payload);
          if (!held) return 'shape';
          sql.exec('DELETE FROM dir_fail WHERE key = ?', mailKey(row.email));
          const known = sql.one<Person & { suspended: number }>(
            'SELECT id, email, suspended_at IS NOT NULL AS suspended FROM dir_person WHERE lower(email) = lower(?)',
            row.email,
          );
          if (known && Number(known.suspended) !== 0) return 'suspended';
          let person: Person;
          if (known) person = { id: known.id, email: known.email };
          else {
            person = { id: `p_${personId()}`, email: row.email };
            sql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', person.id, person.email, held.name, made);
          }
          if (held.code !== null)
            sql.exec('UPDATE dir_invite SET spent_at = ?, person = ?, held_until = NULL WHERE code_hash = ? AND spent_at IS NULL', now, person.id, held.code);
          return { who: open(person, presented, next, now, strike), held };
        });
        if (typeof outcome === 'string') return rejected(flow, outcome);
        const { slug, name, tz } = outcome.held;
        const body: SignupVerified = { person: outcome.who.person, email: outcome.who.email, slug, name, tz };
        return { status: 200, body, session: { sid: next.sid } };
      }

      default:
        return off();
    }
  };

  return auth as DirectoryAuth;
}
