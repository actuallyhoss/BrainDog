/**
 * The self-host: one Node process, one file, the same record.
 *
 * IT IS NOT A CUT-DOWN VERSION. `01-ARCHITECTURE` §4 makes the self-host the same code as the hosted
 * product with a different storage adapter underneath: the packages are identical, and everything
 * in this file is the two things a platform actually differs on: where the bytes live, and how a
 * request arrives. If a route ever appears here and not in the Worker, one of them is a different
 * product.
 *
 * THIS FILE IS ALLOWED TO KNOW IT IS NODE. That is the other side of the line the `stack` gate draws
 * across `packages/**`: the kernel may not ask which runtime it is in, and a host must.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'node:process';

import {
  grantAad, grantKey, openSealed,
  callRoute, ROUTES, engineHealthRead, engineLedgerRead, engineProbeOf, probeWireOf, handlersFor, hintsOf, mentionsAttached, httpStatus, serveApi, serveIngest, serveKeys, serveSlash, serveKeychain, servesKeys, servesSlash, servesKeychain, sessionOf, slashRecordMeter, withSession,
  type Handler, type IngestDoor, type KeysDoor, type SlashAskDoor, type KeychainDoor, type TxtLookup,
} from '@braindog/host';
import {
  clearCookie,
  cookieMode,
  readSid,
  relyingParty,
  boundRequest,
  OTHER_REQUEST,
  sameKey,
  sameOrigin,
  serveAccount,
  serveAuth,
  heldContext,
  seeAs,
  SEE_AS_HEADER,
  accessHeaders,
  sessionContext,
  sessionCookie,
  type AccountDoor,
  type AuthDoor,
  type CookieMode,
  type EmailDoor,
  type MailNotice,
} from '@braindog/host/auth';
import { gate, serveMcp, unauthorized } from '@braindog/mcp/http';
import { withCalls } from '@braindog/mcp';
/* The oldest command this door still works with, one day for both hosts, answered at the build address. */
import { MIN_CLI } from '@braindog/mcp/build';
import { slashTools } from '@braindog/mcp/slash-tools';
import { OPERATION_METHOD, UNBOUND_REFUSED, type Execute, type OutboxKind, type OutboxRow, type PagedRun, type ScriptRunner, type Signer } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';
import { cutOffReadable, mayPropose } from '@braindog/kernel';
import { readFileSync as readWhole, existsSync as present, renameSync as moveFile, rmSync as removeTree } from 'node:fs';
import { basename as baseOf, dirname as dirOf, join as joinPath } from 'node:path';
import { keyLockout, nearPeer, ONE_PLACE, peerSlowFor, placeOf, proxied, slowedLine, type KeyLockout, type PeerSlow, type Place, type ProxyTrust } from './key-lockout.ts';
import { catalogueAnswer, catalogueFolder, catalogueOffersFrom, catalogueShelfFrom } from './catalogue.ts';
import { serveKennelTo, servesKennel, type KennelDeps } from './kennel.ts';
import { certificateNames, originFor } from './reach.ts';
import { fileSnapshots, signCopies, type FileSnapshots } from './snapshots.ts';
import { blobsFolder, eraseFile, keepAttachment, serveFiles, servesFiles } from './files.ts';
import { diskSealed } from './sealed.ts';
import { diskVisuals, pagesFolder } from './visuals.ts';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';
import { badSlug, createDirectory, leavesAsked, leftBy, switcherAsk, type Directory } from '@braindog/record/directory';
import { fixOf, type Auth, type Param, type Refusal, type Row, type Scheduler, type Sql } from '@braindog/ports';
import type { Result } from '@braindog/ports';

import {
  actionExecutor,
  holding,
  holdingPaged,
  IN_FLIGHT,
  keyOpener,
  meterPass,
  pass,
  pinFor,
  pinnedSend,
  sharedReader,
  systemResolve,
  type OpenKey,
  type Pinned,
  type RehearseOnThisMachine,
  type Resolve,
  type Send,
} from './actions.ts';
import { pagedRunner } from '@braindog/host/connector';
import { replayUsage } from '@braindog/host/actions';
import { serveAsks } from '@braindog/host/slash-answers';
import { backgroundMeter, queryVector, serveModelJobs } from '@braindog/host/model-jobs';
import { grantNamed, holdingScript } from '@braindog/host/script';
import { askerOf, scriptTrial, trialSandbox } from '@braindog/host/script-try';
import { runInQuickJs } from '@braindog/script/quickjs';
import { outboundHeld, scriptSandbox } from './script.ts';
import { httpFor } from './http.ts';
import { selfhostFacts, selfhostProbeWire, slashAnswersFor, slashDoor, slashEngineFor, slashFromEnv, slashModelFor, slashModelJobs, type SlashConfig } from './slash.ts';
import { unwrap, type KeyStore } from './keys.ts';
import { commandFor, inImage } from './how.ts';
import { shellOf } from './shell.ts';
import { signerFor } from './sign.ts';
import { keysDoor, keychainDoor } from './keychain.ts';
import { serveShape, servesShape, type ShapeDoor } from '@braindog/host/shape';
import { serveFirstRead, type FirstReadDoor } from '@braindog/host/first-read';
import { selfhostFirstReadDoor } from './first-read.ts';
/* THE SHAPE COPY'S RECORD HALF, BUILT HERE OVER THE RECORD'S KERNEL so the door answers whether or not `methods/index.ts`
   has spread it into the API yet; the same deps the record hands it, so the two cannot answer differently. */
import { methods as shapeMethods } from '@braindog/record/shape';
/* OAUTH 2.1 ON THIS HOST: the host package's doors over this process's Directory. */
import { oauthHere, servesOAuth, type OAuthHere } from './oauth.ts';
import { claimIdle, holdClaim, runnerContext } from '@braindog/host';
import { withKeychainPassphrase } from '@braindog/host';
import { rootKeysOf } from './keys.ts';
import { slashErasing } from './slash.ts';
import { ACCESS_ENDED_AT, accessEndedSaid, MEMBER_STOPPED } from '@braindog/kernel';
import { deriveShareKey, serveShared, sharedNone, shareOf, withShareLinks, type SharedDoor } from '@braindog/host';
/* NAMED APART FOR THE LINK'S DOOR, so the API door's own limiter can import the same two functions under their own
   names without this file binding one name twice. */
import { refusedFor as linkRefused, windowLimiter as linkLimiter } from '@braindog/host/limits';
/* THE FRONT DOORS: a crash answered by reference, the limiter, and the guard in front of
   every statement. */
import { crashed } from '@braindog/host';
import { PREVIEW_READ_ONLY } from '@braindog/host';
import { fileModelSign } from '@braindog/host/sign-model';
import { classOf, limitKey, refusedFor, windowLimiter, type LimitClass, type LimitDoor, type Limiter } from '@braindog/host/limits';
import { guarded } from '@braindog/ports';
import { readSetup } from '@braindog/slash/propose';

/** A statement that opens, ends or names a transaction, as `guard` in `@braindog/ports` reads one. */
const TRANSACTION = /^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * The `Sql` port over `node:sqlite`, with `guarded` in front of it (`@braindog/ports`): every statement is held to the
 * Durable Object's measured ceilings before it is sent, so a statement the Cloud would refuse is refused here too, in
 * the same named `SqlError`, and never works on one host and fails on the other. It covers every file this process opens
 * through it: the record, the Directory and Slash's ledger.
 *
 * A TRANSACTION STATEMENT GOES TO THE DRIVER AS IT CAME, AND ONLY THAT. The kernel's `attempt()` (`kernel/src/tx.ts`)
 * runs a raw `SAVEPOINT` wherever the port takes one, and this port always has; a kept copy's restore runs `BEGIN
 * IMMEDIATE` through it (`snapshots.ts`). The guard refuses all of them, as the Durable Object does, and here that would
 * have turned every refusal inside an attempt into a throw and every restore into a failure.
 */
export function openSqlite(path: string): Sql & { close(): void } {
  const raw = openDriver(path);
  const checked = guarded(raw);
  return {
    ...checked,
    exec: (text: string, ...params: Param[]) => (params.length === 0 && TRANSACTION.test(text) ? raw.exec(text) : checked.exec(text, ...params)),
  };
}

/** The `Sql` port over `node:sqlite`, as the driver answers it. `openSqlite` puts the guard in front. */
function openDriver(path: string): Sql & { close(): void } {
  /* FOREIGN KEYS OFF, and it is not a preference. `node:sqlite` defaults this ON and a Durable
     Object leaves SQLite's default OFF, so `decision.supersedes REFERENCES decision(id)` is
     enforced here and nowhere else, which is a behavioural fork between the two hosts on the write
     path. The DDL's own comment beside that column says "documentary; not enforced".
     DEFENSIVE OFF, pinned for the same reason: Node 26 turns it on by default and 24.13 does not, and under it the
     kernel's rebuild of a damaged search index is refused, so a record with one would not open (`migrate.ts`). */
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false, defensive: false } as never);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      /* A NESTED CALL IS A SAVEPOINT, as on the Durable Object, where a nested `storage.transactionSync` is one
         (measured on workerd 1.20260903.1): an inner throw undoes the inner writes and nothing else, and the outer
         transaction carries on. This answered a nested call with `fn()`, so an inner throw that its caller caught kept
         its writes here and lost them on the Cloud (the conformance suite's `transaction-nested`). Named by depth, so
         the stack of savepoints unwinds in order; `attempt()`'s own are `dog_attempt_N` and never collide. */
      const savepoint = depth > 0 ? `dog_tx_${depth}` : null;
      db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec(savepoint ? `RELEASE ${savepoint}` : 'COMMIT');
        return value;
      } catch (e) {
        /* ONLY WHILE THERE IS ONE TO ROLL BACK: an error SQLite answers by ending the transaction itself (a full disk,
           an ON CONFLICT ROLLBACK) has already undone it, and a second rollback would throw over the first error. */
        if (db.isTransaction) {
          if (savepoint) {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
          } else db.exec('ROLLBACK');
        }
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * THE NAME SLASH'S LEDGER HAD WHEN SLASH WAS CALLED SPARK, the one place this app still spells it. A self-host that ran the old
 * build has its `settings` row and its month's `call` rows in this file, and they are the only copy (`46 §4.1`).
 */
const LEDGER_BEFORE = 'spark.sqlite';

/**
 * `<dir>/slash.sqlite`, moved from `LEDGER_BEFORE` the first time a build after the rename opens the directory.
 *
 * CHECKPOINTED BEFORE IT MOVES, because `openSqlite` runs every file in WAL mode and a process that stopped between
 * checkpoints left its newest rows in the `-wal` file alone. `test/slash-file.test.ts` plants the owner's cap there and
 * nowhere else: a rename of the main file by itself opened a database with no `settings` table. Whatever `-wal` and
 * `-shm` are left after the close move with it, empty once `TRUNCATE` has run, so no name of the old file stays behind.
 *
 * NOT MOVED OVER A NEWER FILE. Where both exist the old build ran again after the new one, and the new file's month is
 * the one being metered; the old file stays until `destroy` takes it with the record.
 */
function slashLedger(dir: string): string {
  const now = joinPath(dir, 'slash.sqlite');
  const before = joinPath(dir, LEDGER_BEFORE);
  if (present(now) || !present(before)) return now;
  const old = new DatabaseSync(before);
  try {
    old.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    old.close();
  }
  for (const tail of ['', '-wal', '-shm']) if (present(before + tail)) moveFile(before + tail, now + tail);
  return now;
}

/**
 * Who is asking: a bearer, a session cookie, or, with no server key, nobody at all.
 *
 * A self-host is one person's record on one machine, and the Directory `init` wrote says who that person
 * is. Whichever way they arrive, the answer is the same `CallContext` the hosted product builds, so every
 * permission check below this line is the same code. `contextFor`, further down, is the order.
 */
/**
 * THE ONE 401 BODY: a `401` says only `unauthorized`, the Worker's body exactly. A
 * credential this record does not know (`49 §5.4` step 1) and none at all where one is needed answer the same, and which
 * of the two it was goes to the log.
 */
const UNAUTHORIZED_ONLY: Refusal = { code: 'UNAUTHORIZED', fix: 'unauthorized' };
const said401 = (why: string): { refused: Refusal } => {
  console.error(`auth: bearer refused (${why})`);
  return { refused: UNAUTHORIZED_ONLY };
};
/** A credential this record does not know. */
const UNKNOWN = (): { refused: Refusal } => said401('This BrainDog does not know that credential.');
/** None at all, where one is needed. */
const NONE = (): { refused: Refusal } => said401('This BrainDog takes a bearer token. Send it as Authorization: Bearer <token>.');

/** A credential it knows, belonging to somebody it does not. 403, and the Worker says the same. */
const OFF: Refusal = { code: 'FORBIDDEN', fix: 'This credential does not reach this BrainDog.', at: 'principal' };

/** What a person an owner has stopped reads at the session door, the Worker's words exactly (`MEMBER_STOPPED`). */
const STOPPED: Refusal = { code: 'FORBIDDEN', fix: MEMBER_STOPPED, at: 'principal' };

/** What a guest whose last share ended reads at the session door, the Worker's words exactly. */
const endedOf = (ended: { owner: string | null } | null): Refusal | null => (ended === null ? null : { code: 'FORBIDDEN', fix: accessEndedSaid(ended.owner), at: ACCESS_ENDED_AT });

/**
 * A record whose every owner is suspended.
 *
 * IT IS NOT THE CALLER'S FAULT AND THE SENTENCE SAYS SO. Answering 403 "this credential does not
 * reach this record" to an operator holding the right shared secret, on loopback, is the least
 * actionable thing this server can say: the credential is perfect and the record is the problem.
 * `49 §5.1` step 5.3 calls a record that cannot be brought up `sick`, with a `{ code, fix }`, at 503.
 */
/**
 * `RECORD_UNAVAILABLE`, AND THE NAME IT REPLACES WAS ANSWERING THE WRONG QUESTION AT THE WRONG STATUS.
 *
 * This said `SCHEMA_UNAVAILABLE`, which was never about a schema: no migration is involved, no
 * checksum, no `user_version`. The word was borrowed from `SCHEMA_MISMATCH` and `SCHEMA_NEWER`
 * because those two are the codes `httpStatus` maps to 503, and a name chosen to look like a
 * neighbour is a name that teaches the wrong thing (`10 §7`).
 *
 * AND IT DID NOT EVEN GET THE STATUS. `SCHEMA_UNAVAILABLE` was in no registry and therefore in no
 * row of `host`'s `NOT_422`, so this answered **422** (*fix your input*) to a caller whose input
 * was perfect and whose record was the problem. `49 §5.1` step 5.3 says 503 in as many words, and
 * the sentence above about "the same function the Worker uses" was true and was reading a table
 * with no row for this. `30 §6` now carries the code and `NOT_422` carries the 503 with it.
 */
const NOBODY: Refusal = {
  code: 'RECORD_UNAVAILABLE',
  fix: 'Every owner of this BrainDog is suspended, so nobody may act on it. Un-suspend one.',
  at: 'record',
};

/** Every sign-in that does not sign somebody in, including a cookie that names no session. */
const NOT_YOU: Refusal = { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' };

/** A write that a page somewhere else sent, riding on this process's ambient authority. */
const CROSS: Refusal = { code: 'FORBIDDEN', fix: 'A change here is accepted only from a page this BrainDog served.', at: 'origin' };

/**
 * A slug in the path that is not this host's record. Word for word the Directory's sentence for a name that is not the
 * caller's (`packages/record/src/identity.ts`), which the Worker answers too, so one record says one thing on both hosts.
 */
const NOT_ON: Refusal = { code: 'FORBIDDEN', fix: 'You are not on this BrainDog.' };

/**
 * `/<slug>/api/<method>`, or the old `/app/<slug>/api/<method>`: the slug a path names and the `/api/…` path the record
 * reads, or `null`.
 *
 * THE DIRECTORY'S `badSlug` SAYS WHAT A NAME IS, as the Worker's `appPath` asks it. So `/settings/api/x` and
 * `/app/api/boot` name no record and are left to the shell, and nothing here keeps a second list of the app's words.
 * THE OLD PREFIX IS READ TOO, because a CLI whose hosts file was written while the app was under `/app` calls there,
 * and it refuses every redirect; `app` is a word the Directory never hands out, so it is never read as the slug.
 */
function slugApi(pathname: string): { slug: string; rest: string } | null {
  const m = /^\/+(?:app\/+)?([^/]+)(\/+api(?:\/.*)?)$/.exec(pathname);
  if (!m || badSlug(m[1]!) !== null) return null;
  /* ONE LEADING SLASH, because `//api/boot` resolved against an origin is a URL whose host is `api`. */
  return { slug: m[1]!, rest: m[2]!.replace(/^\/+/, '/') };
}

/** Why an owner cannot invite anybody here: nobody but the owner can sign in, so the link would lead nowhere. */
const INVITES_OFF = 'Nobody else can sign in to this BrainDog yet, so an invitation link would lead nowhere. Start it with BRAINDOG_SERVER_KEY, a session key and a directory first.';

/**
 * AN ADDRESS THAT CAN ALREADY SIGN IN: a person with a passkey, or with a record. Somebody made here and never
 * finished is not one, so a link opened twice does not lock them out.
 */
const KNOWN = `SELECT 1 AS x FROM dir_person p WHERE lower(p.email) = lower(?)
  AND (EXISTS (SELECT 1 FROM dir_passkey k WHERE k.person = p.id) OR EXISTS (SELECT 1 FROM dir_member m WHERE m.person = p.id))`;

const SAFE = new Set(['GET', 'HEAD']);

type Api = Awaited<ReturnType<typeof createRecordApi>>;

/** What this host knows about itself when it decides who is asking. */
type Site = {
  api: Api;
  token: string | undefined;
  origin: string;
  /** The build this process runs (`BRAINDOG_BUILD`, or the one it was started with), `''` when it was told none. */
  build: string;
  mode: CookieMode | null;
  /** The Directory's sign-in, or `null` where this host holds no sessions: open mode, or nothing to check them with. */
  auth: Auth | null;
  /** The names a browser may reach an open self-host by: loopback at its port, and the configured origin's host. */
  hosts: ReadonlySet<string>;
  origins: ReadonlySet<string>;
  /** `/auth/*`, less the address, which is per request. */
  door: Omit<AuthDoor, 'ip'>;
  /** The key doors: a keychain grant's bearer, an agent's login token at the deposit door, and this process's key store when it has one. */
  keychain: KeychainDoor<CallContext>;
  /** The shape door: a shape grant's bearer, and the record's scrambled copy. */
  shape: ShapeDoor;
  /** The app's own key doors: a browser session on one of this host's origins, and the same key store. */
  keys: KeysDoor<CallContext>;
  /** Slash's ask, `POST /api/slash/read`, built on the first question and kept (`46 §5.2`). */
  slash: SlashAskDoor<CallContext>;
  /** `/in/*`: the arrival door (`49 §5.16`), one record and one process. Its mail half is the half that can be absent. */
  arrivals: IngestDoor;
  /** `/account/*`: the Directory's usage ledger, and the switcher's rows, for a signed-in person. */
  /** The copies kept beside the record file, `<slug>/snapshots/` (`53 §5.4`); absent for a database in memory. */
  snapshots: FileSnapshots | undefined;
  /** A record's files, `<slug>/blobs/` beside the record file (`./files.ts`); `null` for a database in memory. */
  blobs: string | null;
  /** `/account/email` and `/account/email/confirm`, where this host can mail the notices; absent where it cannot. */
  email: EmailDoor | undefined;
  /** Whether the Directory gives this record `slug` as a name it holds now, beside the one the record carries. */
  names: (slug: string) => boolean;
  /**
   * The Directory's `leave`, after a `removeMember` the record accepted. The record's `member` table and the Directory's
   * `dir_member` live in two databases, and without this the person removed stayed listed by `reaches` and `/account/records`.
   */
  leave: (person: string) => void;
  usage: AccountDoor['usage'];
  records: AccountDoor['records'];
  /** A link to one page, `Authorization: Share <token>` at `/api/sharedPage` (`@braindog/host`'s `share.ts`). */
  shared: SharedDoor;
  /**
   * The front doors' budgets: 600 reads and 120 writes a minute for one caller, as the Cloud's `RL_READ` and `RL_WRITE`
   * count, or `null` for a process that limits nobody (`start`'s `limits`). Built once, so a minute outlives the request
   * that started it.
   */
  limits: Limiter | null;
  /** `/oauth/*` and the OAuth metadata (`./oauth.ts`): on where somebody signs in from a browser, and off with its sentence. */
  oauth: OAuthHere;
  /** `POST /auth/signup/read` (`./first-read.ts`), built once so its in-memory count lasts the whole process. */
  firstRead: FirstReadDoor;
  /** The server key's lockout at `/api` and `/mcp` (`./key-lockout.ts`), built once so its count lasts the whole process. */
  keyLock: KeyLockout;
  /**
   * The wrong keys counted by the socket's own peer when a proxy's header named the place, holding that peer to one
   * compare per turn over a ceiling and never locking it (AI16, RG3, RH7): under `BRAINDOG_TRUST_PROXY=1` or a list
   * holding a range (RH10), and `null` for exact addresses.
   */
  peerSlow: PeerSlow | null;
};

/** Who is asking, a refusal, or a bare status; and the cookie the answer carries, when it carries one. */
type Seen =
  | { ctx: CallContext; cookie?: string }
  | { refused: Refusal; cookie?: string }
  | { bare: 421 | 503 }
  | { bare: 429; retryAfter: number };

/** What a bearer comes to: somebody, a refusal, or the server key's lockout (`./key-lockout.ts`). */
type Known = { ctx: CallContext } | { refused: Refusal } | { bare: 429; retryAfter: number };

/**
 * Two secrets compared in time that does not depend on either, and WITHOUT AN AWAIT: the SHA-256 of both, then
 * `timingSafeEqual`. Synchronous so the server key's lock, its compare and its strike happen with nothing between them
 * (`./key-lockout.ts`).
 */
const sameKeyNow = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/**
 * The owner, for the server key and for open mode.
 *
 * A RECORD WITH NO ELIGIBLE OWNER REFUSES, rather than inventing one. The fallback to a constant is right
 * for a file nobody has created, which is what `braindog dev` and every test against an empty file open,
 * and wrong the moment there IS a record: it would hand `owner` to a person id no `member` row names.
 *
 * AND WHETHER ANYTHING WAS PRESENTED TRAVELS WITH IT. Minting a bearer that outlives the machine needs a
 * credential, and `createToken` can tell only if it is told.
 */
function owner(api: Api, credentialed: boolean): Known {
  const who = api.kernel.created() ? api.kernel.ownerId() : 'p_self';
  if (!who) return { refused: NOBODY };
  return { ctx: { principal: { kind: 'person', id: who, level: 'owner' }, credentialed } };
}

/**
 * Whether a browser sent this write from a page somewhere else. Open mode only.
 *
 * AN `Origin` OR A `Sec-Fetch-Site` THAT NAMES ANOTHER SITE IS A FORGERY, AND A REQUEST CARRYING NEITHER IS
 * NOT A PAGE AT ALL. Every browser sends `Origin` on a POST from another origin, which is exactly the
 * `text/plain` `fetch` that could write rows as the owner here; what sends neither is the CLI, the client or
 * a test on the owner's own machine. That is looser than `sameOrigin`, which refuses a request with neither,
 * and it is looser only where no cookie is involved: a cookie is only ever sent by a browser.
 */
function forged(request: Request, origins: ReadonlySet<string>): boolean {
  const said = request.headers.get('origin');
  if (said !== null) return !origins.has(said);
  const site = request.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin' && site !== 'none';
}

/**
 * WHAT WAS ACTUALLY PRESENTED, and `undefined` when that is nothing.
 *
 * `headers.get` RETURNS `''` FOR A HEADER WITH NO VALUE, and `'' !== undefined`, so a bare
 * `Authorization:` line read as a credential. That is one byte, and it walked straight through the
 * check that had just been added to stop exactly this: a request carrying nothing minted an owner
 * bearer that works from anywhere for thirty days. `Authorization: Bearer` did it too, because the
 * strip needs whitespace after `Bearer` to match, so the word itself became the credential.
 *
 * TRIMMED AND EMPTIED TO `undefined` HERE, ONCE, so nothing below has to remember.
 */
function presented(request: Request): string | undefined {
  const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return raw ? raw : undefined;
}

/** The command's build as it sent it (`x-braindog-cli`), or `undefined`. The kernel decides whether it is one. */
function cliOf(request: Request): string | undefined {
  const said = request.headers.get('x-braindog-cli')?.trim();
  return said ? said : undefined;
}

/* ONCE PER PROCESS. An unreadable cut-off refuses every bearer, so every request would otherwise print the same line. */
let cutOffTold = false;

/**
 * `BRAINDOG_TOKENS_VALID_FROM`, the self-host's copy of the Worker's `TOKENS_VALID_FROM` (`53 §5.11` (c) step 3): an ISO
 * instant before which every agent token and device grant this record issued is refused as a bearer it does not know.
 *
 * READ AT EACH BEARER, NOT AT START, so the value in the environment file is the one in force after the restart the
 * runbook asks for and in a test that sets it. An unreadable value refuses every bearer, which is the safe way for an
 * incident lever to fail, and says why once on stderr so the operator is not left reading 401s.
 */
function validFrom(): string | undefined {
  const set = env.BRAINDOG_TOKENS_VALID_FROM;
  if (set !== undefined && !cutOffTold && !cutOffReadable(set)) {
    cutOffTold = true;
    console.error('cut-off: BRAINDOG_TOKENS_VALID_FROM is not an ISO instant with its zone, such as 2026-09-25T12:00:00Z, so every bearer is refused until it is corrected.');
  }
  return set;
}

/**
 * A bearer: the server key, or an agent token. `/api` and `/mcp` both come through here, so a token reaches
 * the same person at the same level through either, and `surface` is only what the token's listing shows as
 * where it was last used.
 */
async function bearerFor(sent: string, site: Site, surface: 'api' | 'mcp', at: Place, door?: string, cli?: string, request?: Request): Promise<Known> {
  const { api, token } = site;
  /* A BEARER SHAPED LIKE THE SERVER KEY IS COUNTED AGAINST THE PLACE IT CAME FROM (SEC5): a miss used to be a 401 and
     nothing else, so the key could be guessed in a loop. Ten misses in fifteen minutes lock the place, and a locked
     place's WRONG keys are a 429, one answer per turn. THE RIGHT KEY IS NEVER HELD BY THE LOCK (RG14): it is compared
     first and let in at once, wherever it came from, because under a loosely trusted proxy the place is a header, and
     anybody on the LAN could write the owner's own address into it with ten wrong keys and lock him out. The compare,
     the lock's read and the strike still run with no await between them. */
  const keyShaped = token !== undefined && !sent.includes('.');
  /* AND THE PEER AS WELL, WHEN A LOOSELY TRUSTED PROXY'S HEADER NAMED THE PLACE (AI16): a header is words, and the
     socket is not. Over its ceiling the peer's WRONG KEYS are held to one answer per turn, never locked (RG3, RH7): every
     caller behind the proxy shares it, the owner too. THE RIGHT KEY IS NEVER HELD (RJ2), here either. Only a miss takes a
     turn: one waits for the next and the rest are a 429 at once, so sockets and timers stay bounded. */
  const peerCount = keyShaped && at.peer !== '' && at.ip !== at.peer ? site.peerSlow : null;
  /* THE SERVER KEY IS COMPARED IN CONSTANT TIME, `49 §5.4` step 1. `!==` stops at the first byte that
     differs, so how long a wrong guess took said how much of it was right. */
  const isKey = token !== undefined && sameKeyNow(sent, token);
  if (isKey) {
    site.keyLock.clear(at.ip);
    return owner(api, true);
  }
  if (keyShaped) {
    /* A LOCKED PLACE IS NOT STRUCK AGAIN: its lock ends when it ends. A miss through a loose proxy still counts against
       the peer, so naming one locked place for every guess dodges nothing. */
    const lockedFor = site.keyLock.locked(at.ip);
    if (lockedFor === null) site.keyLock.strike(at.ip);
    if (peerCount?.strike(at.peer) === true) console.error(slowedLine(at.peer));
    const placeTurn = lockedFor === null ? { wait: 0 } : site.keyLock.turn(at.ip);
    if ('full' in placeTurn) return { bare: 429, retryAfter: Math.max(placeTurn.retryAfter, lockedFor ?? 0) };
    const peerTurn = peerCount?.turn(at.peer) ?? { wait: 0 };
    if ('full' in peerTurn) return { bare: 429, retryAfter: peerTurn.retryAfter };
    const wait = Math.max(placeTurn.wait, peerTurn.wait);
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    if (lockedFor !== null) return { bare: 429, retryAfter: site.keyLock.locked(at.ip) ?? 1 };
  }

  /* AN AGENT TOKEN IS THE SAME TABLE AND THE SAME CHECK THE WORKER USES. A self-host that recognised only
     one shared string would be a deployment where an agent cannot be given less than everything.
     `includes('.')` tells an agent token from the shared secret, and a shared secret with a dot in it
     matched above and never reaches here. */
  /* A CREDENTIAL THAT MATCHED NOTHING IS REFUSED, and never falls through to open mode: revoking a scoped
     token used to promote it to the owner, and `Authorization: x` on an open self-host was the owner. */
  if (!sent.includes('.')) return UNKNOWN();
  /* A TOKEN MADE BEFORE THE OPERATOR'S CUT-OFF IS NOT ONE THIS RECORD KNOWS, in the same sentence, and at an operation
     door it falls to `operationFor`, which holds a grant to the same instant. */
  /* `cli` IS THE COMMAND'S BUILD (`x-braindog-cli`), kept on the token row in the same write as its last use, so
     the record can say which build each key runs. The kernel drops anything that is not a build, so the header is
     handed on as sent. */
  const seen = await api.kernel.verifyToken(sent, surface, validFrom(), cli);
  if (!seen.ok) {
    if (door !== undefined && OPERATION_DOORS.has(door)) return operationFor(sent, api, request);
    /* AND A BEARER NO TOKEN ROW KNOWS MAY BE A RUNNER'S, AT THE THREE DOORS A RUNNER CALLS AND NOWHERE ELSE,
       as the Worker's `runnerOf` reads it: the record builds the runner's context from its
       own device grants, held to the same cut-off, and every method but the JOBS ones refuses it. */
    if (door !== undefined && RUNNER_DOORS.has(door)) {
      const ran = await runnerContext(api, sent, validFrom());
      return ran === null ? UNKNOWN() : { ctx: ran };
    }
    return UNKNOWN();
  }

  /* THE PERSON'S LEVEL COMES FROM THE RECORD, never from a constant, so a token outlives nothing its
     holder has lost. NOT ON THIS RECORD IS 403, and a credential this record does not know is 401. */
  /* THE KEY'S OWN ID GOES WITH THE PERSON, so the record ANDs its narrowing chain into what they hold (`token_lens`): a
     child key is narrowed by its own row and its parent's, so it is the child's id, not the agent's the principal names. */
  const held = api.kernel.access(seen.value.person_id, seen.value.child?.id ?? seen.value.id);
  if (!held) return { refused: OFF };
  /* THE REACH IS THE TOKEN ROW'S, AS `verifyToken` READ IT, and nothing in the request can add to it. The record's inbox
     gate admits a whole-record owner token that carries `inbox`; before this line no token
     principal carried a reach at all, so a token minted with it was refused like any other. Left off when empty, so a
     principal without one is the principal every older token had. */
  const reach = seen.value.reach;
  return {
    ctx: {
      principal: {
        kind: 'token',
        id: seen.value.id,
        scope: seen.value.scope,
        person: seen.value.person_id,
        level: held.level,
        ...(reach.length === 0 ? {} : { reach }),
      },
      /* WHAT THE PERSON HOLDS IS `heldContext`'s, as at every door: the ceiling, the levels, the rows of each list a
         narrowed grant reaches, and what the lens adds. */
      ...heldContext(held),
    },
  };
}

/**
 * The four record doors an operation bearer can open, by the name `/api/<method>` carries (`OPERATION_METHOD`).
 *
 * ASKED BEFORE THE GRANT IS READ, BECAUSE READING IT SPENDS IT. `operationGrant` marks the row used in the same turn it
 * finds it, so a bearer sent to `/api/boot` by mistake would be gone before anything knew it was the wrong door. Only a
 * request to one of these four is allowed to spend one; at the wrong one of the four it is spent and the record's own
 * gate refuses it, which is the approver's phone saying "import" and the request saying "export".
 */
const OPERATION_DOORS: ReadonlySet<string> = new Set(Object.values(OPERATION_METHOD));

/** The methods a runner calls, and the only doors a runner's bearer is read at. */
const RUNNER_DOORS: ReadonlySet<string> = new Set(['claimJob', 'postJobEvent', 'readCancel']);

/**
 * The deposit door's write minute for a login token, by the request that spent it: `serveKeychain` answers a refused token
 * with the keychain grant's sentence, so the 429 is put back in its place where the door is answered (`answer`), as the
 * Worker's `keyDoor` puts back its own.
 */
const keychainSpent = new WeakMap<Request, Response>();

/**
 * An agent's login token at `/api/vault/deposit`: checked as `/api` checks any bearer, and a
 * token's context or nothing. THE SERVER KEY NEVER REACHES THE DEPOSIT DOOR AS THE OWNER, and neither does anything else
 * that is not a token, because the record's `allows` admits more than a token on its rungs. A token spends its own write
 * minute here, as it does at `/api/create`.
 */
async function keychainToken(request: Request, site: Site | null): Promise<Result<CallContext>> {
  const refused: Result<CallContext> = {
    ok: false,
    refusal: { code: 'UNAUTHORIZED', fix: 'That bearer is neither a keychain grant nor a login this BrainDog knows.', at: 'authorization' },
  };
  const sent = presented(request);
  /* ONLY A LOGIN TOKEN OPENS THIS DOOR, and a token carries a `.`: anything else is refused here unread, so this door is
     no way to try the server key past its lockout (SEC5). */
  if (site === null || sent === undefined || !sent.includes('.')) return refused;
  const known = await bearerFor(sent, site, 'api', { ip: '', peer: '' }, undefined, cliOf(request));
  if (!('ctx' in known) || known.ctx.principal.kind !== 'token') return refused;
  const over = await overLimit(site, { door: 'bearer', ctx: known.ctx }, '', 'write');
  if (over !== null) {
    keychainSpent.set(request, over);
    return { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'This login has used its writes for this minute.', at: 'authorization' } };
  }
  return { ok: true, value: known.ctx };
}

/**
 * An operation bearer (`48 §5.2`): checked and spent by the record, then the approver at the level they hold NOW.
 *
 * MEASURED BEFORE THIS EXISTED (`test/operation-bearer.test.ts`): the bearer `braindog export` had just been handed by
 * `/auth/device/token` was answered 401 "This record does not know that credential." at `/api/export`, because
 * `verifyToken` reads the `token` table and an operation lives in `device_grant`. The record had been given the check and the
 * gate, and no host built the context between them.
 *
 * `operation` IS WHAT HOLDS IT TO ONE DOOR. `allows` refuses a context carrying it everywhere, and `admin` admits it only
 * for the method it names, so the approver's owner level reaches that one call and nothing a session would reach.
 */
async function operationFor(sent: string, api: Api, request?: Request): Promise<Known> {
  /* THE CUT-OFF IS A SECOND BEARER TO COVER HERE: a grant approved before it is
     refused unspent, as the token check above refuses a token. The record reads it through the `validFrom` it was
     built with, so this call and the key door's carry the same instant. */
  const grant = await api.operationGrant(sent);
  /* AN APPROVAL TIED TO NO REQUEST past the owner's date is told so, with the fix; every other failure is one sentence. */
  if (!grant.ok) return 'refusal' in grant && grant.refusal.fix === UNBOUND_REFUSED ? { refused: grant.refusal } : UNKNOWN();
  /* AND FOR ONE BODY, when the command named it at the start (`boundRequest`). A door that hands no request here names
     none, and a grant bound to a body is refused there rather than taken unchecked. */
  if (grant.value.binds !== null && (request === undefined || !(await boundRequest(request, grant.value.binds)))) return { refused: OTHER_REQUEST };
  const held = api.kernel.access(grant.value.person);
  if (!held) return { refused: OFF };
  return {
    ctx: {
      principal: { kind: 'person', id: grant.value.person, level: held.level },
      operation: grant.value.method,
      credentialed: true,
      /* `heldContext`, as the bearer path above. */
      ...heldContext(held),
    },
  };
}

/**
 * Who is asking, in the order `49 §5.4` gives, amended: a bearer, then the session cookie, then open mode.
 *
 * `host` IS THE `Host` HEADER AS THE SOCKET RECEIVED IT, because in open mode it is the check: a page that
 * rebinds its own name to 127.0.0.1 reaches this port with its own name in `Host`, and gets a 421.
 */
async function contextFor(request: Request, host: string, site: Site, at: Place, door?: string): Promise<Seen> {
  const { api, token } = site;
  const sent = presented(request);

  /* ONE · A BEARER, which is an agent, the server key or an operation, and never a browser, so the origin checks below
     do not apply to it: nothing ambient sends an `Authorization` header. `door` is the method the path names, the one
     thing an operation bearer is checked against. */
  if (sent !== undefined) return bearerFor(sent, site, 'api', at, door, cliOf(request), request);

  /* TWO · THE SESSION COOKIE. A BAD ONE IS A 401 AND IS CLEARED, AND NEVER FALLS THROUGH TO OPEN MODE: a
     cookie that names no session is somebody who thinks they are signed in, and answering them as the
     owner of an open host would be a different person's answer. */
  const sid = site.mode === null ? undefined : readSid(request, site.mode);
  if (sid !== undefined && site.mode !== null) {
    const clear = clearCookie(site.mode);
    if (!site.auth) return { refused: NOT_YOU, cookie: clear };
    const out = await site.auth({ flow: 'session', sid });
    if (out.status === 429) return { bare: 429, retryAfter: out.retryAfter };
    if (out.status === 503) return { bare: 503 };
    if (out.status !== 200) return { refused: out.refusal, cookie: clear };
    /* A rotation reaches the cookie whatever the answer is. */
    const carried = out.session === undefined ? {} : { cookie: out.session === 'clear' ? clear : sessionCookie(out.session.sid, site.mode) };
    const held = api.kernel.access(out.body.person);
    if (!held) return { refused: api.kernel.memberStopped(out.body.person) ? STOPPED : endedOf(api.kernel.accessEnded(out.body.person)) ?? OFF, ...carried };
    /* AND A COOKIE WRITE MUST COME FROM A PAGE ON THIS ORIGIN (`12 §8` CSRF). `SameSite=Lax` keeps the
       cookie off a cross-site POST; this is the half that does not depend on the browser. */
    if (!SAFE.has(request.method) && !sameOrigin(request, site.origin)) return { refused: CROSS, ...carried };
    /* SEE AS SOMEBODY: an owner's or an Admin's cookie, never as an owner, read-only. */
    const as = await seeAs(request.headers.get(SEE_AS_HEADER), out.body, held, (person) => api.kernel.access(person));
    if (as !== null && 'refusal' in as) return { refused: as.refusal, ...carried };
    return { ctx: as === null ? sessionContext(out.body, held) : (as.ctx as CallContext), ...carried };
  }

  /* THREE · OPEN MODE: no server key, one person on one machine, and the machine is the boundary. The
     `Host` check is what keeps a page that rebinds its name to 127.0.0.1 from being on the machine, and
     the origin check is what keeps a page elsewhere from writing through a browser that is. */
  if (token === undefined) {
    if (!site.hosts.has(host)) return { bare: 421 };
    if (!SAFE.has(request.method) && forged(request, site.origins)) return { refused: CROSS };
    return owner(api, false);
  }

  /* AND NOTHING AT ALL, WHERE A CREDENTIAL IS NEEDED, IS 401. */
  return NONE();
}

/**
 * What delivers one outbox job. The self-host's whole outbound surface, in one function.
 *
 * A record makes no outbound call, so somebody has to, and on a self-host that somebody is this
 * process, after the transaction committed. It returns nothing on success and throws on failure,
 * because the retry ladder is the record's and a deliverer that decided its own retries would be the
 * second ladder [09-ALARMS] spends a paragraph forbidding.
 */
export type Deliver = (job: OutboxRow, keys: PostKeys) => Promise<void>;

/** The key a post names, opened, or the sentence that says why it was not. The secret is never logged or kept. */
export type Opened = { ok: true; secret: Uint8Array } | { ok: false; why: string };

/**
 * What the poller hands a deliverer beside the job: an opener bound to THAT job's lease.
 *
 * BOUND BY THE POLLER AND NOT BUILT BY THE DELIVERER, so a deliverer can ask for the key its own leased job names and
 * for nothing else. The record's `sealedGrant` checks the lease is still this holder's and that the payload names the
 * key; the host unwraps with the KEK the record never sees (ADR-062).
 */
export type PostKeys = { open(grant: string): Promise<Opened> };

/**
 * The header a signed post carries: `sha256=` and the lower-case hex HMAC-SHA256 of the raw body, keyed by the secret.
 * The Worker's `deliver.ts` sends the same, and the inbound `verify: hmac_sha256` reads it (`49 §5.12`).
 */
export const SIGNATURE_HEADER = 'x-braindog-signature';

const hexOf = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unb64 = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'base64'));

/** Posts one body with its headers, and says what the endpoint answered. The address checks are the sender's. */
export type WebhookPost = (url: string, body: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>;

/**
 * The `notify.webhook` deliverer: the body as queued, signed with the key the payload names, or not posted at all.
 *
 * A NAMED KEY THAT DOES NOT OPEN IS A DEAD LETTER, NEVER A BARE POST. Gone, revoked, wrapped by a root key this host
 * lacks, or no key store at all: the ladder walks with the reason, because a receiver that checks signatures drops an
 * unsigned body and one that does not has been handed the owner's rows by a record that was told to sign them. A
 * payload naming no key is a declaration that chose an unsigned post (`webhook.grant` is optional, `09 §6`).
 *
 * `post` OWNS WHERE THE REQUEST MAY GO. This refuses anything but `https:`, as the Worker does; a name that resolves to
 * a private address is the pinned sender's to refuse (`./actions.ts` `webhookPost`, which `main.ts` wires).
 */
export function signedWebhooks(post: WebhookPost): Deliver {
  return async (job, keys) => {
    if (job.kind !== 'notify.webhook') throw new Error(`nothing in this deployment delivers a ${job.kind}`);
    let payload: { url?: unknown; body?: unknown; grant?: unknown };
    try {
      payload = JSON.parse(job.payload) as typeof payload;
    } catch {
      throw new Error('a notify.webhook payload this host cannot read');
    }
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    let url: URL;
    try {
      url = new URL(text(payload.url));
    } catch {
      throw new Error('a webhook goes to an https address');
    }
    if (url.protocol !== 'https:') throw new Error('a webhook goes to an https address');
    const body = text(payload.body);
    const headers: Record<string, string> = {};
    const grant = text(payload.grant);
    if (grant !== '') {
      let opened: Opened;
      try {
        opened = await keys.open(grant);
      } catch (e) {
        opened = { ok: false, why: e instanceof Error ? e.message : String(e) };
      }
      if (!opened.ok) {
        /* THE REFUSAL SENTENCE ALONE REACHES THE ERROR, taken out by name so no path from the secret to a message exists. */
        const why = opened.why;
        throw new Error(`${why} So nothing was posted.`);
      }
      try {
        const key = await crypto.subtle.importKey('raw', opened.secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        headers[SIGNATURE_HEADER] = `sha256=${hexOf(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))}`;
      } finally {
        opened.secret.fill(0);
      }
    }
    const out = await post(url.toString(), body, headers);
    if (!out.ok) throw new Error(`the endpoint answered ${out.status}`);
  };
}

/**
 * The opener the poller binds to one leased job: the record's `sealedGrant` under that lease, unwrapped with this host's
 * key store. `system` signs the `grant.read`, as it does for a scheduled call, because nobody asked.
 */
function postKeys(api: { kernel: Pick<Api['kernel'], 'sealedGrant' | 'identity'> }, store: KeyStore | undefined, job: OutboxRow): PostKeys {
  return {
    async open(grant) {
      if (!store) return { ok: false, why: 'This host has no key store, so no signing key can be opened.' };
      const record = api.kernel.identity()?.id;
      if (!record) return { ok: false, why: 'This BrainDog has not been made, so it holds no key.' };
      const out = api.kernel.sealedGrant({ outbox: job.id, leasedUntil: job.leasedUntil, grant }, 'system');
      if (!out.ok) return { ok: false, why: fixOf(out) };
      const sealed = out.value;
      const dek = await unwrap(store, record, sealed.dek.purpose, {
        wrapped: unb64(sealed.dek.wrapped),
        nonce: unb64(sealed.dek.nonce),
        kek_id: sealed.dek.kek_id,
        wrapped_by: 'kek',
      });
      if (!dek) return { ok: false, why: `The key "${grant}" is wrapped by a root key this host does not hold.` };
      try {
        const plain = await openSealed(
          await grantKey(dek, sealed.grant.grant_id),
          unb64(sealed.grant.nonce),
          grantAad(record, sealed.grant.grant_id, String(sealed.grant.version)),
          unb64(sealed.grant.ciphertext),
        );
        return plain ? { ok: true, secret: plain } : { ok: false, why: `The key "${grant}" did not open.` };
      } finally {
        dek.fill(0);
      }
    },
  };
}

/* ── /in/*: the arrival door ─────────────────────────────────────────────── */

/**
 * What one ingest may spend in a minute, and how many distinct paths are counted at once.
 *
 * A BUDGET IS NOT OPTIONAL HERE AND `IngestDoor` MAKES IT REQUIRED, which is the whole reason this
 * constant exists rather than being left to a deployment: `/in/*` is the one surface a stranger
 * reaches with no credential and still gets a write out of, and a host cannot open it without
 * having decided what a sender is allowed to spend.
 *
 * IN MEMORY AND NOT IN THE RECORD, because a self-host is one process and a counter that costs a
 * row would be a stranger writing to the database to be told they may not write to the database.
 * It resets on a restart, which is the honest cost: the ceiling is per process, as the poller's is.
 *
 * AND THE KEY TABLE IS BOUNDED, because the key is a path a stranger types. Without the ceiling a
 * flood of invented ingest ids is a map that grows until the process dies, which is a denial of
 * service paid for with no credential at all.
 */
const IN_PER_MINUTE = 120;
const IN_WINDOW_MS = 60_000;
const IN_KEYS_MOST = 1_000;

/**
 * How long a digest read from `<slug>/inbound.token` is trusted before the file is read again: the
 * longest a rotation takes to bite, and the ceiling on how often a stranger can make this process
 * touch the disk.
 *
 * A NUMBER RATHER THAN A FILE WATCH, and it is the second design. Reading the file on every mail
 * arrival is the version with no staleness at all, and measured on one machine a
 * `readFileSync` of the 43-byte token costs 275 microseconds against 15 for a `statSync` and 19 for
 * the digest itself. The budget above lets 120 arrivals a minute through for each of 1,000 distinct
 * digests, so a flood costs up to 2,000 lookups a second: at 275 microseconds of SYNCHRONOUS read
 * each, that is over half of the only thread this process has, spent by somebody with no credential
 * on a door that is answering them 404. One read a second is 0.03 percent of it.
 *
 * AND NOT A MODIFICATION TIME EITHER, which would be the cheap way to get both. Two tokens are the
 * same 43 bytes, so `size` cannot tell them apart, and a timestamp is the filesystem's to round: an
 * operator rotating twice inside one tick, or a test doing it inside one, would be served the old
 * digest with the file saying otherwise. A window that always expires depends on nothing the
 * filesystem does.
 */
export const IN_TOKEN_MS = 1_000;

/** The SHA-256 of a token, in hex: the only shape of an inbound token this process ever keeps. */
async function digestOf(text: string): Promise<string> {
  const out = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Spend one arrival against `key`: the whole seconds to wait, or `null` to let it through.
 *
 * A FULL TABLE EVICTS AND DOES NOT REFUSE, and the difference is the whole availability of `/in/*`.
 * The first cut answered an unknown key with a window's wait once the map held `IN_KEYS_MOST`
 * entries, on the reasoning that the keys already in it were the configured senders. They are not:
 * the key is built from the path, so every key in the map is one a caller chose. Measured
 * end to end against this server, 1,000 POSTs to `/in/webhook/invented-<n>` cost no
 * credential, stored no row, filled the map, and then refused 429 both the next arrival at a real
 * ingest and the next forwarded message, for the rest of the window and again every window after.
 * Anybody who can reach the port could hold the arrival door shut.
 *
 * SO THE CEILING IS A MEMORY BOUND AND NOTHING ELSE NOW, which is what it was always for. Evicting
 * the entry that was inserted first costs a flooder the per-key count of whatever it displaced, so a
 * sustained flood of invented ids can keep a real sender's counter near zero. That is the trade and
 * it is the right way round: a reset counter lets good mail through, and a refusal does not.
 */
function ingestBudget(now: () => number): (key: string) => number | null {
  const seen = new Map<string, { n: number; until: number }>();
  return (key) => {
    const at = now();
    /* SWEPT ON EVERY CALL, so a window that has passed is gone before the ceiling is counted. The
       map is at most `IN_KEYS_MOST` entries, so this is a walk of a thousand and no timer. */
    for (const [k, row] of seen) if (row.until <= at) seen.delete(k);
    const row = seen.get(key);
    if (row === undefined) {
      /* INSERTION ORDER IS THE EVICTION ORDER, which a `Map` gives for nothing: every entry carries
         the same window, so the one added first is the one closest to expiring anyway. */
      while (seen.size >= IN_KEYS_MOST) {
        const oldest = seen.keys().next();
        if (oldest.done === true) break;
        seen.delete(oldest.value);
      }
      seen.set(key, { n: 1, until: at + IN_WINDOW_MS });
      return null;
    }
    row.n += 1;
    return row.n > IN_PER_MINUTE ? Math.max(1, Math.ceil((row.until - at) / 1000)) : null;
  };
}

/**
 * The digest of whatever `<slug>/inbound.token` holds right now, or `null` for a record that takes
 * no forwarded mail: the self-host's whole implementation of the index the Cloud needs a table for.
 *
 * THE FILE IS THE INDEX, WHICH IS WHY THIS IS A FUNCTION AND NOT THE STRING IT USED TO BE. A
 * self-host serves one record, so the Cloud's lookup from digest to record collapses into a
 * comparison against one digest, and the only store that comparison needs is the file `init` wrote.
 * Reading it once at boot made that store write-only: the token a person pasted into their bank's
 * forwarding settings was the token that record had for as long as the process lived, and a
 * forwarding address is handed to third parties by definition. The answer to a leaked credential is
 * a new one, not a restart scheduled for whenever somebody next notices.
 *
 * SO ROTATION IS `write the file`, AND REVOCATION IS `delete it`, with no command to learn and no
 * restart. Both are what an operator would try first, and both were previously silent no-ops.
 *
 * AN UNREADABLE OR EMPTY FILE IS A CLOSED DOOR AND NOT AN OPEN ONE. `writeFileSync` truncates
 * before it writes, so zero bytes is a state a reader can genuinely land in mid-rotation, and the
 * digest of the empty string is a perfectly good digest: taking it would mean a secret anybody can
 * guess, saved only by `servesIngest` happening to refuse an empty path segment. Refusing here does
 * not depend on that. The trim is for the newline an editor adds.
 *
 * THE TOKEN IS NOT KEPT, only its digest, which is the same rule the boot-time read followed: after
 * this returns, nothing in the process holds a value that would open the door if it leaked.
 *
 * AND WHAT IS CACHED IS THE READ AND NOT ITS ANSWER, which is the whole reason `pending` is a
 * promise. The first cut kept the digest in a variable and stamped the window before awaiting it,
 * so a second arrival in the same tick found the window closed and was served the value from
 * before the read: measured with four callers in one tick against a file holding a
 * real token, three of the four were answered `null` and would have had a valid forwarded message
 * refused 404. Two messages arriving together is what a forwarder's queue draining looks like.
 * Holding the promise makes every caller in the window wait on the one read.
 */
function inboundDigest(file: string, now: () => number): () => Promise<string | null> {
  let pending: Promise<string | null> | null = null;
  let read = Number.NEGATIVE_INFINITY;
  const load = async (): Promise<string | null> => {
    let text: string;
    try {
      text = readWhole(file, 'utf8').trim();
    } catch {
      /* GONE, OR UNREADABLE, IS THE SAME ANSWER AS EMPTY. A door that stayed open because the read
         threw would make a revocation depend on the operator's `rm` not racing this line. */
      return null;
    }
    return text === '' ? null : digestOf(text);
  };
  return () => {
    const at = now();
    if (pending !== null && at - read < IN_TOKEN_MS) return pending;
    read = at;
    pending = load();
    return pending;
  };
}

/**
 * The self-host's half of `/in/*`: one record, one process, and `49 §5.16`'s two shapes.
 *
 * THE CLOUD'S WEBHOOK SHAPE IS SERVED HERE FOR AN INGEST THAT READS A TOKEN, AND ONLY FOR THAT ONE.
 * Every ask carrying a `rec` was once answered `null`, on the reasoning that comparing
 * the id tells whoever holds the URL what it is. That left a path token nowhere to ride:
 * `servesIngest` parses `/in/webhook/<ingest>` with no token segment and the five-segment
 * `/in/webhook/<rec>/<ingest>/<token>` with one, so measured against this server
 * (`apps/selfhost/test/shortcut-arrival.test.ts`) the right minted token answered 404 and the only
 * URL a Shortcut could post to stored the SMS `untriaged` however right the token was. And the
 * oracle it guarded against is not one: the id is in the URL the person was given, the Cloud
 * compares it the same way, and a guessed ULID is 80 random bits away from this record.
 *
 * SO `rec` MUST BE THIS RECORD'S ID AND THE INGEST MUST ANSWER `path`, OR IT IS 404. The first half
 * is what keeps a URL for somebody else's record from being a door here. The second is what keeps
 * the rule that two URLs are not one door: an ingest declaring no `verify:` has nothing that would
 * read the last segment, so it keeps the one URL it had and the Cloud-shape test in `server.test.ts`,
 * a token appended to such an ingest, is still a 404. An ingest that declares a path token and has
 * none minted is answered `none` by the record and so is a 404 here too, which is right: there is
 * no token yet that the URL could be carrying.
 *
 * A WRONG TOKEN IS STILL A ROW AND NOT A REFUSAL. `hook` compares the segment against the digest
 * the record answered and stores the arrival `untriaged` when they differ, the same as the Cloud.
 *
 * THE MAIL DOOR EXISTS ONLY WHERE THERE IS A DIRECTORY TO KEEP A TOKEN IN. `inbound` is absent for
 * a database in memory, and `serveIngest` then answers 404 for the whole `/in/email/*` surface, the
 * way `/auth/provision` answers `off()`. Everywhere else the key is present and the FILE decides:
 * a record whose `inbound.token` has not been written, or has been deleted, refuses every digest.
 * The two are one answer on the wire and the difference is which half knows it.
 *
 * WHAT THE DOOR NEVER SEES IS THE TOKEN. `serveIngest` hands across the SHA-256 of what the caller
 * sent, and this compares it against the digest of the file, so nothing in this process holds a
 * comparable copy of the secret and no index here is a credential. It is the same division
 * `cloudIngest` makes for a Worker (`apps/worker/src/route.ts`): there the digest is a key into the
 * Directory's index, here it is one comparison, and neither side is given the token.
 */
function arrivalDoor(api: Api, spend: (key: string) => number | null, inbound: (() => Promise<string | null>) | null, open: OpenKey, folder: string | null, txt: TxtLookup = dnsTxt): IngestDoor {
  return {
    /* MAIL IS CHECKED HERE, AGAINST THE SENDER'S KEYS IN DNS, AND NO LINE IN IT IS BELIEVED (SEC1). This host's mail
       door is `POST /in/email/<token>` and nothing else, so a forwarder's `Authentication-Results` arrived over the same
       door a stranger holding the token posts to, and believing it filed a forged bank debit. A forwarder that posts the
       message as it was sent keeps its DKIM signature whole, and that signature is what is read now. */
    dkim: txt,
    /* A SIGNED DOOR'S KEY IS OPENED HERE, under this host's key store, and handed to the record for the one answer:
       `keyOpener` is the opener every scheduled action uses, and its `grant.read` is the audit trail of each
       check. The Cloud-shaped URL stays a path token's alone, so a signed door has the one URL `49 §231` writes. */
    verify: async (ask) => {
      if (ask.rec === undefined) return api.ingestVerify({ ingest: ask.ingest }, open);
      const here = api.kernel.identity()?.id;
      if (here === undefined || ask.rec !== here) return null;
      const v = await api.ingestVerify({ ingest: ask.ingest });
      return v?.kind === 'path' || v?.off === true ? v : null;
    },
    /* THE RECORD TAKES THE BYTES, THE FLAG AND THE INGEST, AND NOTHING ELSE OF THE URL. `rec` is this
       process's one record and is no fact about the payload. The ingest was once dropped here too,
       and it is what the token was checked against: without it the record offered a
       verified webhook to every webhook pattern in declaration order, and `server.test.ts` measured a
       token minted for `till-b` written under `till`. Mail names none and is offered to them all. */
    arrive: (arrival) =>
      api.arrive({
        channel: arrival.channel,
        headers: arrival.headers,
        body: arrival.body,
        sha256: arrival.sha256,
        verified: arrival.verified,
        ...(arrival.ingest === undefined ? {} : { ingest: arrival.ingest }),
      }),
    limit: async (ask) => spend(`${ask.channel}:${ask.key}`),
    /* A DOOR SWITCHED OFF ANSWERS 410 AND STORES NOTHING; the record counts the arrival it turned away. */
    turnedAway: async (ask) => {
      if (ask.ingest !== undefined) api.doorTurnedAway({ ingest: ask.ingest });
    },
    ...(inbound === null
      ? {}
      : {
          /* THE DIGEST IS ASKED FOR FIRST AND COMPARED IN CONSTANT TIME, and a record this process
             has not created yet is `null` rather than an arrival with nowhere to go. */
          inbound: async (hash: string) => {
            const held = await inbound();
            return held !== null && (await sameKey(hash, held)) ? (api.kernel.identity()?.id ?? null) : null;
          },
        }),
    /* THE MAIL DOOR'S ATTACHMENTS, KEPT BY THE SAME RULE `/api/files` KEEPS A PERSON'S UPLOAD: the same
       sniffed types and the same 2 MB ceiling, over `keepAttachment` in `./files.ts`. A database in memory has no
       folder to keep a file in, so `keep` is absent there and every attachment is named and sized and nothing more,
       the same as a host with no file store (`packages/host/src/ingest.ts` `IngestDoor.keep`). */
    ...(folder === null ? {} : { keep: async ({ bytes }: { bytes: Uint8Array }) => keepAttachment(folder, bytes) }),
  };
}

/**
 * TXT records from the machine's own resolver, in the shape `dkim.ts` asks for: a name with none is `[]`, a resolver
 * that did not answer is `null` (`temperror`, so the message is stored unverified and nothing is filed from it).
 * Four seconds at most, so five signatures cannot hold a forwarder's POST for long.
 */
const dnsTxt: TxtLookup = async (name) => {
  try {
    const records = await new Resolver({ timeout: 4_000, tries: 1 }).resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === 'ENOTFOUND' || code === 'ENODATA' ? [] : null;
  }
};

export type Started = Awaited<ReturnType<typeof start>>;

/**
 * The `Scheduler` port over `setTimeout`.
 *
 * IDENTICAL SEMANTICS TO THE DURABLE OBJECT'S ALARM, which is the point: one alarm, always set to
 * the earliest pending row or not set at all. The Worker gets that from the platform and this gets
 * it from a timer, and the code above the port cannot tell.
 *
 * `wake()` IS NOT A NO-OP HERE. An earlier way of thinking about this made it one (the poller
 * shares the process, so what is there to wake?) and that is exactly wrong: sharing a process is
 * not being woken, and a job that waits fifteen seconds for the next tick when the record already
 * knows it is there is fifteen seconds of latency nobody chose.
 */
export function nodeScheduler(run: () => Promise<void>, poll: () => Promise<void>): Scheduler & { stop(): void } {
  /* Node's timer overflows past 2^31 ms and fires IMMEDIATELY, which for a yearly renewal reminder
     would be a notification a year early rather than a year late. Clamped, and re-armed on arrival. */
  const CEILING_MS = 2 ** 31 - 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let at: number | null = null;
  let stopped = false;

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    at = null;
  };

  return {
    get: () => Promise.resolve(at),
    set(atMs: number) {
      if (stopped) return Promise.resolve();
      if (timer) clearTimeout(timer);
      at = atMs;
      const delay = Math.min(Math.max(0, atMs - Date.now()), CEILING_MS);
      timer = setTimeout(() => {
        timer = null;
        at = null;
        void run();
      }, delay);
      timer.unref?.();
      return Promise.resolve();
    },
    clear: () => (clear(), Promise.resolve()),
    wake: () => (stopped ? Promise.resolve() : poll()),
    stop() {
      stopped = true;
      clear();
    },
  };
}

/** The kinds a self-host can be asked to deliver. The nine minus nothing: `deliver` decides. */
/**
 * The nine, for a deployment that really can deliver all nine.
 *
 * IT IS A CONVENIENCE AND NEVER A DEFAULT. `start` requires the list from whoever supplies the
 * deliverer, because the only host that can say what it serves is the one holding the transports.
 */
export const EVERY_KIND: OutboxKind[] = [
  'notify.email',
  'notify.push',
  'notify.webhook',
  'pull.fetch',
  'export.r2',
  'erase.r2',
  'infer.embed',
  'infer.prose',
  'infer.draft',
];

export async function start(options: {
  file: string;
  port: number;
  token?: string | undefined;
  /**
   * Which interface to listen on. Defaults to loopback when there is no token, `0.0.0.0` when there
   * is, because "no token" means "one person on one machine", and one machine is `127.0.0.1`.
   */
  host?: string | undefined;
  /** The belt under the doorbell: a tick that catches an abandoned lease. `0` turns it off. */
  pollMs?: number;
  /** Where DKIM keys are looked up for posted mail. Absent is the machine's resolver; a test hands its own keys. */
  txt?: TxtLookup | undefined;
  /**
   * The host's key store. `33 §1` port 8, `49 §2`'s `HostDeps.keys`.
   *
   * WITHOUT IT THIS RECORD'S EXPORTS ARE UNSIGNED, and `41 §5.11` step 3 will not import one,
   * which is exactly what the state was: `init` wrote three `vault_key` rows and no running process
   * ever opened the KEK, so the rows existed and nothing could use them. Optional, because a test
   * that only wants the routes should not have to mint a key file.
   */
  keys?: KeyStore | undefined;
  /**
   * What to answer `/api/version`'s `app` with, when it is not `BRAINDOG_BUILD` in the environment.
   *
   * A PARAMETER RATHER THAN A `process.env` WRITE IN THE TEST. Setting the variable to check the
   * answer makes the check order-dependent on every other test in the process, and the one thing
   * this value has to be is the value this server was started with.
   */
  build?: string | undefined;
  /** Take a shape copy on import (`--allow-shape`). Absent is no: a shape copy is refused IMPORT_SHAPE. */
  allowShape?: boolean | undefined;
  /**
   * A PINNED INSTANT, FOR A RECORD THAT IS A FIXTURE.
   *
   * The seed's rows are dated relative to one day, so a record holding it draws the right tones and
   * bands only on that day. The browser gates read the seed through this server, and a gate whose
   * findings moved with the calendar would be two runs disagreeing about one tree. `boot` then says
   * this instant too, which is how the app learns what day the record thinks it is. Absent means the
   * real clock, which is what every deployment runs.
   */
  now?: number | (() => number) | undefined;
  /** The script sandbox's meter clock (CtxHost.clock). Absent is the machine's; a test that is not about limits hands one that stands still. */
  scriptClock?: (() => number) | undefined;
  /**
   * The Directory: `<data>/directory.sqlite`, or `:memory:`. Without it nobody signs in from the app, and
   * `/auth/methods` says so. Opened here and closed with the server.
   */
  directory?: string | undefined;
  /**
   * The origin the app is served from, `BRAINDOG_ORIGIN`; `http://localhost:<port>` when it is not set.
   *
   * IT DECIDES THREE THINGS, which is why it is said once: the cookie's name, the passkeys' relying party
   * (a passkey made at one origin answers nothing at another), and the `Origin` every write must carry.
   */
  origin?: string | undefined;
  /**
   * The certificate and key this process serves TLS with, `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY`. Absent: plain http.
   *
   * BECAUSE THE ONE DEVICE THIS HAS TO WORK ON IS A PHONE, and a phone is never at loopback. Without this
   * the only reachable self-host is one with another daemon in front of it holding the certificate, and the
   * operator who has a certificate already had nowhere to put it. `reach.ts` has the measurements.
   *
   * THE ORIGIN COMES FROM THE CERTIFICATE WHEN IT IS NOT GIVEN, and a given one that the certificate does
   * not name is refused before anything listens: the relying party id and the name a browser will accept
   * without a warning are the same name, and two places to write it down is one place to get it wrong.
   */
  tls?: { cert: string; key: string } | undefined;
  /** The built app to serve for every path that is not `/api`, `/auth` or `/mcp`. Absent: those paths are 404. */
  shell?: string | undefined;
  /** A folder of published use cases served read-only under `/catalogue/` (`catalogue.ts`), or none. */
  catalogue?: string | undefined;
  /** How the public Kennel is read (`kennel.ts` `KennelDeps`), a test's own. Absent: `BRAINDOG_KENNEL` and the network, read at each ask. */
  kennel?: KennelDeps | undefined;
  /** 32 bytes for the Directory's MACs, derived from the KEK or `BRAINDOG_SESSION_SECRET`. Absent: no sessions. */
  sessionKey?: Uint8Array | undefined;
  /**
   * 32 bytes a link to one page is signed with: HKDF-SHA-256 over the key file, info `braindog/share` (contracts §3.2),
   * from the key store. Copied, so the caller may zero-fill its own once `start` answers. Absent: derived from
   * `sessionKey`, and with neither, no link is made or opened.
   */
  shareKey?: Uint8Array | undefined;
  /**
   * `BRAINDOG_TRUST_PROXY`: count the lockout against the address the proxy saw, not the proxy's own. `true` trusts a
   * peer on loopback or a private network (`nearPeer`); a function names which peers are proxies (`proxyTrustOf`). The
   * header from any other peer is ignored (AI16).
   */
  trustProxy?: boolean | ProxyTrust | undefined;
  /**
   * The front doors' limiter (`@braindog/host/limits`, `overLimit` below): 600 reads and 120 writes a minute for one
   * caller. `null` limits nobody, and a test hands in its own over a pinned clock.
   *
   * ABSENT, IT IS `windowLimiter` OVER THE WALL CLOCK, NOT THE RECORD'S. `now` above pins the record's clock for a test or
   * a gate, and a minute on a pinned clock never ends, so every request of a long run would count against one minute.
   *
   * AND ABSENT ON LOOPBACK WITH NO PROXY TRUSTED, IT IS NONE. Such a process answers one machine, which is the boundary
   * `host`'s own default already draws for a self-host with no token; the person at that machine is the only caller the
   * limit could slow. A process behind a proxy it trusts is answering whoever reaches the proxy, and is limited wherever
   * it listens.
   */
  limits?: Limiter | null | undefined;
  /**
   * Send the scheduled actions' requests, `pull`, `call` and `poll`, on this process's timer.
   *
   * OFF UNLESS ASKED, because an action sends a request to somebody else's server, and a test that installs a
   * pack should not. `main.ts` turns it on when the operator says `BRAINDOG_OUTBOUND=on`. `send` and `openKey` are for
   * tests: the defaults are `fetch` and the key store above, and `./actions.ts` says what either may send.
   *
   * ABSENT, THE PASS STILL RUNS AND HOLDS EACH ACTION with `OUTBOUND_OFF` (`./script.ts`), before anything is resolved,
   * opened or sent, so Scheduled says why it waits rather than showing an action that is due and never runs. A script
   * that needs no other server runs as it would.
   *
   * A SCRIPT RUNS HERE TOO, in `./script.ts`'s sandbox, and its `ctx.fetch` leaves through the same `send`, `resolve`
   * and `openKey`. `resolve` is for tests, as `send` is: the default is the system's name service.
   */
  actions?:
    | { send?: Send | undefined; resolve?: Resolve | undefined; openKey?: OpenKey | undefined; rehearseOnThisMachine?: RehearseOnThisMachine | undefined }
    | undefined;
  /**
   * How a shared use-case file is read from an address (`fetchUseCase`). The default is the pinned socket and the
   * system's name service; a test passes a web of its own so nothing leaves the machine.
   */
  shared?: { send?: Send | undefined; resolve?: Resolve | undefined } | undefined;
  /**
   * A model for Slash to draft with (`@braindog/host/slash`): `SLASH_ENDPOINT`, `SLASH_MODEL` and `SLASH_KEY` in the environment
   * when not given. Absent, Slash's own rules draft. The key is the environment's, else the person's own key in the keychain
   * labelled `slash`; it is opened on each call and never kept (`slash.ts`). `send` is for tests.
   */
  slash?: SlashConfig | undefined;
  /**
   * How often to ask whether Slash is due its daily look (`slashTick`, at most once a UTC day, unless the owner turned it off).
   * OFF UNLESS ASKED, as the actions are, so a test that fills a record does not find questions it did not file. `main.ts`
   * asks hourly.
   */
  slashTickMs?: number | undefined;
  /**
   * Told once, the first time a pass finds `notify.email` jobs waiting on a host that does not deliver them, with how many.
   *
   * BECAUSE THEY WAIT IN SILENCE OTHERWISE. On a self-host with no mail transport configured, a digest an automation mails
   * is queued `pending` and stays there, which is the honest state (`49 §5.12` note 1: a kind not delivered is never
   * leased), and nothing anywhere said so: measured at 1586f2a2, a job queued before `serve` started was still `pending`
   * with nothing on stderr (`test/webhook-wired.test.ts`). Once per process, because the count is the same news every
   * fifteen seconds. `main.ts` says it on stderr.
   */
  unsentMail?: ((waiting: number) => void) | undefined;
  /**
   * How this host mails a person a sign-in link, an invitation's proof or a passkey notice: called and not awaited, and
   * it never throws (`AuthDoor['mail']`). `main.ts` builds it from `BRAINDOG_SMTP_URL` (`./smtp.ts`).
   *
   * GIVEN, SIGN-IN LINKS TURN ON AND AN INVITATION TO A NEW ADDRESS CAN BE PROVED; absent, the Directory offers no link
   * and an invitation says this host sends no mail, as it always has.
   *
   * WIDENED PAST `AuthDoor['mail']` FOR THE TWO EMAIL-CHANGE LETTERS: `email.change` and `email.changed` are not
   * `MailNotice`, because `packages/ports` is not this lane's to widen, so this field takes the two kinds beside it and
   * hands them to `serveAccount`'s `email.mail`; a narrower caller (`door.mail`, `AuthDoor['mail']`) still fits it.
   */
  mail?: ((to: string, link: string, kind?: MailNotice | 'email.change' | 'email.changed', vars?: { record?: string; from?: string }) => void) | undefined;
} & (
    | {
        /**
         * What this deployment can actually deliver, and the deliverer that does it.
         *
         * THE TWO TRAVEL TOGETHER BECAUSE THE LIST IS A PROPERTY OF THE DELIVERER. This leased all
         * nine kinds and handed each row to whatever function it was given, so a self-host with no
         * model leased its `infer.embed` rows, threw "nothing in this deployment delivers a
         * infer.embed" at each of them eight times, and dead-lettered them into a fault about work
         * they never asked for. 49 §5.12 note 1 says the opposite in
         * as many words: "a kind not in `kinds` is never leased, so it waits in `pending` until the
         * host can serve it: a self-host with no model never dead-letters an `infer.embed` row",
         * and §9 has the test.
         *
         * A LIST THAT COULD BE OMITTED WOULD DEFAULT TO ONE OF THE TWO FAILURES: deliver nothing
         * silently, or dead-letter everything loudly, so it cannot be omitted. The Worker states
         * the same list as `DELIVERS` and has always leased only that.
         */
        delivers: readonly OutboxKind[];
        deliver: Deliver;
      }
    | {
        /** Omit both and nothing is delivered: jobs queue and wait, which is honest rather than lossy. */
        delivers?: undefined;
        deliver?: undefined;
      }
  )) {
  /* AN EMPTY SERVER KEY IS NO KEY: it would bind every interface and match anyone who presents nothing. */
  if (options.token !== undefined && options.token.trim() === '') throw new Error('An empty server key is no key: leave the token unset, or give it a long random value.');
  /* ONE CLOCK FOR THE RECORD AND THE DIRECTORY. A test that moves it a day forward moves both, which is how
     rotation and the keychain's fifteen minutes are tested against a real socket. */
  const pinned = options.now;
  const clock = { now: typeof pinned === 'function' ? pinned : pinned === undefined ? () => Date.now() : () => pinned };

  /* A WRONG ORIGIN OR A MISSING BUILD IS A REFUSAL BEFORE ANYTHING LISTENS, not a server that starts and
     then answers every sign-in and every screen with the wrong thing. */
  if (options.origin !== undefined) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(options.origin);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.origin === 'null')
      throw new Error('BRAINDOG_ORIGIN is an origin, such as https://studio.example or http://localhost:8080, and this is not one.');
  }
  /* AND THE CERTIFICATE IS READ HERE, FOR THE SAME REASON THE ORIGIN IS: a certificate Node cannot parse, or
     one naming a host `BRAINDOG_ORIGIN` does not, has to be a sentence before the socket exists rather than
     after. The only report of a mismatch otherwise is a certificate warning on the phone, which is the one
     device the operator is not looking at while they read this process's output.

     `port: 443` IS A PLACEHOLDER AND NEVER ESCAPES. The real port is not known until `listen` returns, and
     neither refusal depends on it: a configured origin carries its own port, and an unusable set of names is
     unusable at every port. `originFor` is pure, so calling it twice costs a parse and cannot disagree. */
  if (options.tls !== undefined) originFor({ configured: options.origin, names: certificateNames(options.tls.cert), port: 443 });
  const shell = options.shell === undefined ? null : shellOf(options.shell);

  const sql = openSqlite(options.file);
  const dirSql = openSqlite(options.directory ?? ':memory:');

  /* THE COPIES THIS HOST KEEPS, beside the record file (`53 §5.4`): `VACUUM INTO`, the whole file, six local tables
     included, because it is a backup of the instance and not an export. */
  const kept = options.file === ':memory:' ? undefined : fileSnapshots(sql, options.file, clock.now);
  /* SET ONCE THE RECORD IS DELETED: every request after that is told so, and nothing touches the closed file. */
  let gone = false;

  /**
   * Delete the record, `53 §5.9` as it applies to one file on one machine.
   *
   * THE ALARM BEFORE THE STORAGE, so no timer wakes a dead record; then the file, its sidecars and its copies; then the
   * Directory releases the name. A final snapshot is not taken: on a self-host it would sit in the directory being
   * removed, which is exactly what `53 §5.9` step 4 removes on Cloud too.
   *
   * THE DIRECTORY IS REMOVED WHOLE ONLY WHEN IT IS THE RECORD'S OWN, `<data>/<slug>/record.brain` with no installation
   * files beside it. A record served from a file elsewhere loses that file and its copies, and nothing else.
   */
  const destroy = async (): Promise<void> => {
    gone = true;
    scheduler.stop();
    if (ticker) clearInterval(ticker);
    if (slashTicker) clearInterval(slashTicker);
    const record = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')?.id;
    sql.close();
    /* SLASH'S FILE IS CLOSED BEFORE ITS DIRECTORY GOES. On Windows an open SQLite handle holds the file, and
       `rmSync` with `force` then leaves the directory behind without a word. */
    slashSql.close();
    if (record && ledger) ledger.close(record);
    const at = dirOf(options.file);
    /* EITHER NAME IS THE RECORD'S OWN. `record.dog` is what an installation made before the
       whole-record file was called `record.brain` still holds, and its directory is as much its own
       as a new one's, so removing the record removes the directory in both cases, or a self-host
       that predates the rename leaks a directory nothing will ever open again. */
    const own =
      ['record.brain', 'record.dog'].includes(baseOf(options.file)) &&
      !present(joinPath(at, 'directory.sqlite')) &&
      !present(joinPath(at, 'kek'));
    if (own) removeTree(at, { recursive: true, force: true });
    else
      for (const p of [options.file, `${options.file}-wal`, `${options.file}-shm`, joinPath(at, 'snapshots'), joinPath(at, 'blobs'), ...(slashFile ? [slashFile, joinPath(at, LEDGER_BEFORE)].flatMap((f) => [f, `${f}-wal`, `${f}-shm`]) : [])])
        removeTree(p, { recursive: true, force: true });
  };

  /* The alarm and the record refer to each other: the record arms the alarm after every write, and
     the alarm drains the record when it fires. The scheduler is built first and the record is what
     it drains, which is why this one binding is written before the thing it names exists. */
  let api!: Awaited<ReturnType<typeof createRecordApi>>;
  /* SLASH'S MODEL, when this host points at one; the record files what it drafts through the proposal door or not at all. */
  /* LIFTED OUT OF THE CALL BELOW BECAUSE BOTH PORTS MUST READ ONE CONFIG: the model that drafts an
     arrangement and the engine that answers a question are two features sharing a name (`1f85a49a`), and two
     reads of the environment are two hosts that come to disagree about which one is configured. */
  const slashConfig = options.slash ?? slashFromEnv(env);
  /* HIS OWN KEY'S CHOICE IS READ FROM SLASH'S STORE ON EACH PRESS, through a thunk because `slashSql` is opened
     below; nothing calls it before then. */
  const slashModel = slashModelFor(slashConfig, () => api, options.keys, () => slashSql);
  /* SLASH'S OWN SQLITE AND NOT THE RECORD'S (`46 §2`): the engine writes its `settings` and `call` tables into
     its own database, beside the record's rather than inside it. */
  /* BESIDE THE RECORD FILE, `<dir>/slash.sqlite`, AS `inbound.token` IS, AND IN MEMORY ONLY WHERE THE RECORD IS.
     This was `:memory:` everywhere, under a comment calling the tables a cache, and they are not one: `call` is
     the only account of what Slash was asked, and `asksUsed` counts the month's meter out of it (`46 §4.1`).
     The cost was measured: every restart began the month again, so the tier `a` cap was
     a cap per uptime, and the `settings` row an owner chose went back to the defaults. `test/slash-meter-persists`
     asks twice across a restart and reads both rows back.
     THE SNAPSHOTS DO NOT CARRY IT, and that is deliberate: `VACUUM INTO` copies the record, and a restored record
     with no ledger beside it meters from zero, which is the old behaviour on the one path that already loses
     time. `destroy` removes it with the record. */
  const slashFile = options.file === ':memory:' ? null : slashLedger(dirOf(options.file));
  const slashSql = openSqlite(slashFile ?? ':memory:');
  /* WHAT ANSWERS AN AUTOMATION'S QUESTION TO SLASH, from the same config and the same key path as `slashModel`, so the
     record's `answersSlash` below and `/api/version`'s `slash` are one fact. Before this, a self-host with a model
     refused `ask_slash` at install as if it had none (`test/slash-answers.test.ts`). */
  const answers = slashAnswersFor(slashConfig, () => api, options.keys, { sql: slashSql, clock });
  /* AND THE LEDGER THE RECORD'S OWN TWO ASKS ARE SPENT FROM, the press and the first plan, in the same Slash SQLite and
     under the same `ask_cap` a read and an automation's question are (`@braindog/host` `slashRecordMeter`). Without it
     the record asks `slashModel` unmetered, which it did on both hosts until this
     was wired. The engine is `slashEngineFor`'s, the guarded one `answers` builds, built on the first press and kept;
     a build that throws is let go, and the record reads that hold as a ledger it could not read and lets its rules draft.
     NO RATE, because this host's endpoint is its owner's and not an account this host pays neurons on: the row is
     counted against the cap and priced 0. The name is the package's routing name, the one its own tier `a` rows carry. */
  let meterEngine: ReturnType<typeof slashEngineFor> | null = null;
  const slashMeter = slashRecordMeter({
    sql: slashSql,
    clock,
    engine: () =>
      (meterEngine ??= slashEngineFor(slashConfig, () => api, options.keys, { sql: slashSql, clock }).catch((e: unknown) => {
        meterEngine = null;
        throw e;
      })),
    model: 'glm-5.3-flash',
    /* HIS SWITCH FOR SLASH READING ON ITS OWN, read each time a background ask is about to be held. */
    reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false,
  });
  /* AND WHAT ANSWERS THE RECORD'S MODEL JOBS, a pattern's draft and a digest's prose, from the same config and the same
     Slash SQLite, whose `slash_call` table the background allowance is counted out of (`@braindog/host/model-jobs`).
     Who is who is asked through `slashMeter` above, so each pair and each night's notes are a background row under
     `UNDERSTAND_ASK`. `undefined` with no model, and then the jobs wait `pending`, as they always have here. */
  const modelJobs = slashModelJobs(slashConfig, () => api, options.keys, { sql: slashSql, clock }, slashMeter);
  const jobsMeter = backgroundMeter(slashSql);
  /* WHETHER SLASH'S MODEL ANSWERS, read from the same Slash SQLite every model call settles in: the record's
     `engineHealth` and `GET /api/slash/health` both ask this one read, as the Worker's do. */
  const engineHealth = engineHealthRead({
    sql: slashSql,
    clock,
    model: slashModel !== undefined,
    load: () => import('@braindog/slash'),
    grants: () => api.kernel.grants(),
  });
  /* AND THE PROBE, as the Worker hands it: each candidate of this host's route asked on the adapter its asks
     use, settling in the same Slash SQLite, the package loaded on the press only, held to his switch for Slash reading. */
  const probeWire = selfhostProbeWire(slashConfig, () => api, options.keys);
  const engineProbe = engineProbeOf({
    facts: () => selfhostFacts(slashConfig),
    clock,
    ledger: async () => {
      const s = await import('@braindog/slash');
      s.openLedger(slashSql, { now: clock.now() });
      const c = s.ledgerCore(slashSql, clock, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
      return { reserve: c.reserve, account: c.account, release: c.release, last: () => [] };
    },
    complete: probeWireOf(probeWire),
    reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false,
  });
  /* AND WHAT THAT LEDGER HOLDS, for the record's `engineReadings`, as the Worker hands it: the same Slash
     SQLite, so the calls it counts are the ones the health above was read from, beside the questions still open, each
     by its cause. Handed whether or not a model is set, since the open questions are the record's own. The mentions are
     the record's own, each attached or not, read from the record's SQLite and never Slash's. */
  const engineLedger = engineLedgerRead({
    sql: slashSql,
    mentions: mentionsAttached(sql),
    questions: () => {
      const open = api.kernel.openSuggestions();
      return open.ok ? open.value : [];
    },
  });

  /**
   * Drain everything due, then re-arm.
   *
   * `drain` re-arms in a `finally` of its own, so a handler that throws cannot stop the schedule.
   * The loop back into itself is the batch ceiling: a hundred claimed rows leave the minimum still
   * in the past, and the alarm is set to now.
   */
  const run = async (): Promise<void> => {
    try {
      await api.kernel.drain(scheduler);
    } catch (e) {
      /* The alarm was re-armed before this reached here. Losing the process to an unhandled
         rejection would take the server with it, and the row is still `pending`. */
      console.error('drain:', e instanceof Error ? e.message : String(e));
    }
  };

  /* `pull.fetch` IS THE RUNNER'S WHEN THE RUNNER IS ON. A deliverer handed the same kind would lease a scheduled
     action's job and send it without the origin check, the redirect rule or the cap. */
  /* AND `infer.ask` IS NEVER A DELIVERER'S, WITH A MODEL OR WITHOUT ONE. A `Deliver` returns `void`, so the pump acks the
     job `done` with no `result`, and the run it answers ends on "Slash answered job ... with no text": measured in
     `test/slash-answers.test.ts`, a deliverer handed every kind was handed the question. Only `serveAsks` in `poll` leases
     it, and only where there is a model to ask. */
  /* AND A MODEL JOB IS NOT A DELIVERER'S WHERE `serveModelJobs` SERVES IT, for the same reason: acked `done` with no
     result, a draft files nothing and a digest goes without its prose. With no model the list is left as it was given. An `infer.embed` too, where the
     endpoint embeds: acked `done` with no vectors, the row would never be indexed. */
  const delivers: readonly OutboxKind[] = (options.delivers ?? []).filter(
    (k) => k !== 'infer.ask' && (!options.actions || k !== 'pull.fetch') && (!modelJobs || (k !== 'infer.draft' && k !== 'infer.prose' && k !== 'infer.resolve')) && (!modelJobs?.embed || k !== 'infer.embed'),
  );

  /**
   * One pass of the scheduled actions, never two at once.
   *
   * THE TAIL ONLY WHEN IT DID SOMETHING. The tail rings the doorbell, the doorbell is `poll`, and `poll` comes
   * back here: a pass that re-armed nothing and ran nothing stops the circle rather than spinning it.
   */
  let execute: Execute | null = null;
  /* THE CONNECTOR RUNNER IS BUILT ONCE, beside the executor and for the same reason: both hold a
     socket and a key store, and a new one per pass would resolve and unwrap on every tick. */
  let paged: PagedRun | null = null;
  /* THE SANDBOX IS BUILT ONCE TOO. Each run gets its own QuickJS instance inside it; what is kept is the socket, the
     name service and the key opener, which are the executor's. */
  let script: ScriptRunner | null = null;
  let acting = false;
  /* THE DIRECTORY IS OPENED BELOW, after the record, so a pass that fires first waits for the next one. */
  let ledger: Directory | null = null;
  let planned: string | null = null;
  /* THE UTC DAY THIS PROCESS LAST REPLAYED THE RECORD'S RUNS INTO THE LEDGER, so it does so once a day and at start. */
  let replayedOn: string | null = null;
  const act = async (): Promise<void> => {
    if (acting || !ledger) return;
    const record = api.kernel.identity()?.id;
    if (!record) return;
    acting = true;
    try {
      /* A SELF-HOST IS NEVER HELD. Its records are put on `selfhost`, which has no allowance, once per process, and
         again until the Directory knows the record: `init` provisions on that plan, and this covers a record made
         before plans existed. */
      if (planned !== record && ledger.setPlan(record, 'selfhost').ok) planned = record;
      /* THE OPERATOR'S SWITCH (`49 §5.24`). Off, `outboundHeld` answers "held" for every action and connector before
         the executor is reached, and the sandbox tells a script's `ctx.fetch` the same sentence; both write it on the
         run's event, which is what Scheduled shows. Nothing is resolved, opened or sent. */
      const on = options.actions;
      const mayRun = on ? ledger.mayRun : outboundHeld(clock.now);
      const openKey = on?.openKey ?? keyOpener(api, options.keys);
      execute ??= actionExecutor(api, {
        openKey,
        send: on?.send,
        resolve: on?.resolve,
        rehearseOnThisMachine: on?.rehearseOnThisMachine,
      });
      script ??= scriptSandbox(api, { openKey, send: on?.send, resolve: on?.resolve, now: clock.now, clock: options.scriptClock, outbound: on ? 'on' : 'off' });
      /* A CONNECTOR PAGES AND THE EXECUTOR ABOVE CANNOT. Without this the kernel finishes the row
         and meters it `dropped`, which is honest but means no self-host ever runs a connector. */
      paged ??= pagedRunner(api, {
        /* ITS OWN SOCKET AND NOT `shared`'s. `shared` is how a use-case FILE is read from an
           address; borrowing its name service here would mean a test that stubs one silently
           stubs the other. A connector's `send` comes from `actions`, beside the executor's. */
        http: httpFor({ send: on?.send }),
        clock: { now: () => Date.now() },
        keys: options.keys,
      });
      /* ONE ADMISSION COUNT FOR ALL THREE, so a record with one run left cannot spend it twice. */
      /* AND IT IS THE RUNTIME'S COUNT, so a trial in its sandbox and this pass cannot each spend the last run. */
      const admissions = pass(IN_FLIGHT);
      let out;
      try {
        out = await api.kernel.runActions(holding(execute, record, mayRun, admissions), {
          page: holdingPaged(paged, record, mayRun, admissions),
          script: holdingScript(script, record, ledger.mayRun, admissions),
        });
        /* EACH WRITE IS TRIED AGAIN AND NONE STOPS THE REST; what the ledger still would not take is said here and
           counted by the day's replay below from the record's own events. */
        const lost = await meterPass(ledger.meter, record, out.usage);
        if (lost > 0) console.error(`actions: ${String(lost)} of ${String(out.usage.length)} runs were not counted; the day's replay counts them from this record's events.`);
      } finally {
        /* A PASS THAT NEVER SETTLES HOLDS ITS RECORD'S RUNS FOR THE LIFE OF THE RUNTIME, so this is in a finally. */
        admissions.settle();
      }
      if (out.fired > 0 || out.ran > 0 || out.dropped > 0) await api.kernel.tail(scheduler);

      /* ONCE A UTC DAY, THE LAST FORTY DAYS OF THE RECORD'S RUNS INTO THE LEDGER AGAIN (`replayUsage`), the Worker's
         nightly walk on this host's clock: a pass that died before it metered, and every automation run, which no pass
         hands on, are counted by the next day. The Directory is in this process, so every read of the log and every
         batch written is a call here and not a request. NEVER HELD HERE: a self-host's records are on `selfhost`,
         which has no allowance, so its automations are counted and not asked about. AND NO DELIVERY OR ARRIVAL IS
         COUNTED HERE: those rows are the Cloud's account of work it does for a paid record (`COUNTED_ONLY`), and a
         self-host's owner pays for nothing. */
      const today = new Date(clock.now()).toISOString().slice(0, 10);
      if (replayedOn !== today) {
        replayedOn = today;
        const dir = ledger;
        try {
          const again = await replayUsage({
            record,
            read: (before, limit) => api.kernel.eventsBefore(before, limit),
            meter: (r, runs) => dir.meterMany(r, runs),
            now: clock.now(),
          });
          if (again.lost > 0) console.error(`usage: ${String(again.lost)} of ${String(again.runs)} runs could not be counted today; tomorrow's replay tries again.`);
        } catch (e) {
          console.error('usage:', e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      console.error('actions:', e instanceof Error ? e.message : String(e));
    } finally {
      acting = false;
    }
  };

  /* WHETHER THE WAITING MAIL HAS BEEN MENTIONED, which happens at most once in a process (`unsentMail`). */
  let mailTold = false;
  const tellUnsentMail = (): void => {
    if (mailTold || gone || !options.unsentMail || delivers.includes('notify.email')) return;
    let waiting = 0;
    try {
      waiting = Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'notify.email' AND state = 'pending'")?.n ?? 0);
    } catch {
      /* A file this build refuses may not have the table this build expects; that is the refusal's to say. */
      return;
    }
    if (waiting === 0) return;
    mailTold = true;
    options.unsentMail(waiting);
  };

  /**
   * Lease, deliver, ack. One pass.
   *
   * ONE PASS AND NOT A LOOP, because the ack rings the doorbell again when anything is left, so a
   * queue that keeps filling is drained by the doorbell rather than by a `while` nobody can stop.
   */
  const poll = async (): Promise<void> => {
    /* NOTHING IS LEASED OR SENT FROM A RECORD THIS BUILD REFUSES, for the reason the doors above refuse it. */
    if (api.kernel.refused()) return;
    await act();
    /* THE QUESTIONS TO SLASH, HERE AND NOT IN `act()`, which once returned on its first line when `options.actions` was
       absent, as it is for every embedder and every test that does not pass it; a pass there left a record admitting the step and
       a host that never asked it. And before the line below, because production's
       `start()` passes no `deliver` (`main.ts`). `serveAsks` catches what `answer` throws; this `try` is for the lease. */
    if (answers && !gone) {
      try {
        await serveAsks(api.kernel, answers, scheduler);
      } catch (e) {
        console.error('slash answers:', e instanceof Error ? e.message : String(e));
      }
    }
    /* AND THE RECORD'S MODEL JOBS AFTER THE QUESTIONS, the Worker's alarm order, through the one pass
       both hosts share, spent from the background allowance. A pass that leased its full five leaves the rest to the
       next poll, which the fifteen-second belt runs whether or not a bell rang. */
    if (modelJobs && !gone) {
      try {
        await serveModelJobs(api, {
          inference: modelJobs,
          meter: jobsMeter,
          now: () => clock.now(),
          scheduler,
          store: slashSql,
          /* WHETHER SLASH'S MODEL ANSWERS: while it does not, the jobs wait with their attempts kept (`model-jobs.ts`). */
          health: engineHealth,
          /* HIS SWITCH FOR SLASH READING ON ITS OWN: off, nothing is leased and no model is asked or tested. */
          reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false,
          /* THE KERNEL'S GOVERNOR: a pattern draft is held, never filed, while the floor or the brake says no. */
          mayPropose: (at) => mayPropose(sql, at),
          log: (line) => console.error('slash jobs:', line),
        });
      } catch (e) {
        console.error('slash jobs:', e instanceof Error ? e.message : String(e));
      }
    }
    tellUnsentMail();
    if (!options.deliver) return;
    let jobs: OutboxRow[];
    try {
      jobs = api.kernel.leaseOutbox(delivers, 10);
    } catch (e) {
      console.error('lease:', e instanceof Error ? e.message : String(e));
      return;
    }
    for (const job of jobs) {
      /* THE SUCCESS ACK IS OUTSIDE THE TRY WHOSE CATCH ACKS FAILURE, and the lease goes back with
         the answer. See the note on the Worker's copy: both hosts had the same two shapes. */
      let sent = false;
      let why = '';
      try {
        /* AN ERASURE'S FILE, DELETED BY ITS HASH, ON THIS HOST'S OWN DISK, never handed to `options.deliver`:
           the file is this process's own, not a transport's, so the self-host deletes it itself, as the Worker's
           `deliver.ts` does for its bucket. */
        if (job.kind === 'erase.r2') {
          const payload = JSON.parse(job.payload) as { key?: unknown; page?: unknown };
          const folder = blobsFolder(options.file);
          /* A VISUAL'S PAGE IS KEPT BESIDE THE FILES, under `pages/`, and an erasure that read it names it so. */
          eraseFile(payload.page === true && folder !== null ? pagesFolder(folder) : folder, typeof payload.key === 'string' ? payload.key : '');
        } else await options.deliver(job, postKeys(api, options.keys, job));
        sent = true;
      } catch (e) {
        why = e instanceof Error ? e.message : String(e);
      }

      try {
        api.kernel.ackOutbox(
          sent
            ? { id: job.id, state: 'done', leasedUntil: job.leasedUntil }
            : { id: job.id, state: 'failed', error: why, leasedUntil: job.leasedUntil },
        );
      } catch (e) {
        console.error('ack:', e instanceof Error ? e.message : String(e));
      }
    }

    /* AND THEN THE TAIL, because a failed ack arms a `retry` row and nothing else here would notice.
       Without this an idle record sat with `pendingWork()` reporting work to do and no alarm set:
       the retry waited for an unrelated write, and the fifteen-second belt did not rescue it because
       a lease never takes a `failed` row. */
    if (jobs.length > 0) await api.kernel.tail(scheduler);
  };

  const scheduler = nodeScheduler(run, poll);
  /* WHAT THIS PROCESS CAN ACTUALLY DELIVER. With no `deliver`, nothing leaves (jobs queue and
     wait, which is honest) and the doorbell should not ring about them on every write. */
  /**
   * The signer, resolved THE FIRST TIME SOMETHING EXPORTS and not before.
   *
   * IT CANNOT BE BUILT HERE. It needs the record's own id, and `record` is a table the migration
   * makes, which happens inside `createRecordApi`, three lines down. Reading it first threw
   * `no such table: record` on any file this process was the first to open.
   *
   * AND LAZY IS THE BETTER SHAPE ANYWAY, not a workaround: it means the KEK unwraps the record's
   * private key when a file is actually being written, so a server that runs for a month and exports
   * nothing never materialises that key at all.
   */
  /* AND NOTHING IS DECIDED BEFORE THERE IS A RECORD. The first ask used to settle the answer for the life of the process,
     so `/.well-known/braindog-key` asked before `createRecord` cached "no signer", and the record created a moment later
     answered 404 for its key and exported unsigned until a restart (measured in `test/healthz.test.ts`). */
  let resolved: Signer | null | undefined;
  const sign: Signer = async (bytes) => {
    if (resolved === undefined) {
      const identity = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1');
      if (!identity) return null;
      resolved = options.keys ? await signerFor(sql, options.keys, identity.id) : null;
    }
    return resolved ? resolved(bytes) : null;
  };
  /* EVERY COPY TAKEN THROUGH THIS CONNECTION IS SIGNED BY THE SAME KEY, the app's "Snapshot now" and the nightly copy
     `backup.ts` takes through `running.sql` alike, so `braindog verify` can check either against the record's key. */
  signCopies(sql, sign);

  /* WHETHER AN INVITATION CAN BE SPENT HERE, known once sign-in is decided below. Until then, and wherever sign-in
     is off, it cannot. */
  let invitesOff: string | null = INVITES_OFF;
  const buildApp = options.build ?? env.BRAINDOG_BUILD ?? '';
  /* THE CATALOGUE NAMED, or the one bundled in the built shell when none is. */
  const catalogueDir = catalogueFolder(options.catalogue, options.shell);
  /* WHERE THE RECORD'S FILES ARE KEPT, and its sealed files in `sealed/` inside: `null` for a record held in memory. */
  const blobs = blobsFolder(options.file);
  api = await createRecordApi({
    sql,
    clock,
    scheduler,
    /* `infer.ask` RINGS THE DOORBELL WHERE A MODEL ANSWERS IT, because the doorbell is `poll` and `poll` is where the
       pass runs; without it a queued question waited for the fifteen-second belt, which a test passing `pollMs: 0` has not
       got. The pump's own list leaves it out, above. `infer.prose` for the same reason where the model pass answers it,
       and so that a digest declaring `prose: slash` queues its two sentences here rather than going as figures. */
    delivers: [
      ...delivers,
      ...(options.actions ? (['pull.fetch'] as const) : []),
      ...(answers ? (['infer.ask'] as const) : []),
      ...(modelJobs ? (['infer.prose'] as const) : []),
    ],
    /* THE RECORD'S SWITCH FOR `ask_slash`, ON EXACTLY WHERE THE PASS ABOVE HAS SOMETHING TO ASK WITH. Off, install refuses
       the step with `NOT_IN_THIS_BUILD` (`unserved`), which is the honest answer on a host with no model. */
    answersSlash: answers !== undefined,
    allowShape: options.allowShape === true,
    sign,
    /* THE OPERATOR'S CUT-OFF, READ AT EACH CALL, for the grant readers the record holds (device, keychain, operation) and
       the owner's two listings, which mark what it ended. */
    validFrom,
    invitations: () => invitesOff,
    /* WHETHER THIS PROCESS MAKES READ-ONLY LINKS: only with a share key (below), and the owner's sentence without one. */
    /* AN AGENT'S TRIALS TODAY, from the Directory's ledger opened below (`script-try-cap.ts`); none counted before it is. */
    trialsToday: (r) => ledger?.trialsToday(r, clock.now()) ?? 0,
    shares: () => (shareKey !== null ? { can: true } : { can: false, why: 'Read-only links are switched off on this BrainDog.' }),
    /* WHAT AN AGENT MAY PROPOSE INSTALLING: the first-party packs and the starter use cases (`catalogue.ts`). */
    catalogue: seedCatalogue(),
    /* A SHARED FILE AT AN ADDRESS IS READ HERE, not in the tab, so a site with no CORS header still installs. */
    readAddress: sharedReader(options.shared),
    /* A DRAFT SCRIPT RUN NOW, WRITING NOTHING (`@braindog/host/script-try`), through the socket, name service and key
       opener a scheduled run's fetch leaves by. ONLY WHEN `actions` IS ON, for its reason: a trial sends a request to
       somebody else's server, and a self-host that was not asked to send any answers `NOT_IN_THIS_BUILD` instead. The
       ledger is the Directory's, opened below, and a trial asked before it is counted by nobody. THE KEY IS OPENED IN
       THE ASKER'S NAME, NOT THE SCHEDULED PASS'S `system` (`askerOf`), so the keychain's log can tell her trial from a run. */
    tryScript:
      options.actions === undefined
        ? undefined
        : (d) => {
            const actions = options.actions ?? {};
            return scriptTrial({
              sandbox: trialSandbox<Pinned>({
                run: runInQuickJs,
                send: actions.send ?? pinnedSend,
                pin: pinFor(actions.resolve ?? systemResolve),
                openKey: actions.openKey ?? keyOpener(api, options.keys, askerOf(d)),
                now: clock.now,
              }),
              ledger: { mayRun: (r, a, p) => (ledger ? ledger.mayRun(r, a, p) : null), meter: (r, run) => ledger?.meter(r, run) },
              now: clock.now,
            })({
              record: d.record,
              body: d.body as never,
              input: d.input as never,
              reads: d.reads as never,
              grantOf: d.owner ? grantNamed(() => api.kernel.grants()) : null,
              /* AN OWNER WHOSE PROOF IS OLD IS TOLD TO SIGN IN AGAIN, not that the record holds no key (`script-try.ts`
                 `STALE`). The record works it out from the keychain's own gate; left off here, the key stayed shut and the
                 run was told the record holds none, which sent her looking for a key that was there. */
              stale: d.stale,
            });
          },
    /* SLASH'S MODEL, when this host points at one; the record files what it drafts through the proposal door or not at all. */
    slashModel,
    slashMeter,
    /* A SEARCH'S OWN WORDS AS A VECTOR, only where the endpoint embeds, his switch for Slash reading is on and the
       month's background allowance has room; never on the ask ceiling. Absent where nothing embeds, and search is by words. */
    meaning: queryVector({ embed: modelJobs?.embed, meter: jobsMeter, now: () => clock.now(), reads: () => api.kernel.prefsOf('slash')['slash.reads'] !== false }),
    engineHealth,
    engineProbe,
    engineLedger,
    /* NEWER VERSIONS IN THIS HOST'S CATALOGUE AND THE KENNEL, for Slash to ask about on Decide, and the whole of both for
       the arranger: the folder first, then the public Kennel (`kennel.ts` `kennelReader`), so an add-on published only
       to the Kennel installs by its id here as on the Cloud. With BRAINDOG_KENNEL=off, the folder alone. */
    catalogueOffers: catalogueOffersFrom(catalogueDir, options.kennel),
    catalogueShelf: catalogueShelfFrom(catalogueDir, options.kennel),
    snapshots: kept,
    destroy,
    /* SEALED FILES' BYTES, IN `blobs/sealed/` BESIDE THE RECORD'S FILES (`sealed.ts`), and visuals' pages in `blobs/pages/`
       (`visuals.ts`). A record held in memory has no folder, so it keeps neither and says so. */
    ...(blobs === null ? {} : { sealed: diskSealed(blobs), visuals: diskVisuals(blobs) }),
    /* WHAT THIS HOST IS, for `/api/version` (`33 §4`). `BRAINDOG_BUILD` is the same variable name
       the Worker's deploy sets, so the answer has the same shape on both hosts; a self-host started
       from a checkout has none, and the record then says `app: null` rather than inventing one.
       `slash` is whether a model is behind Slash here: an endpoint, and a key to call it with or none needed.
       `host` is for `boot`, so Billing reads that this is a self-host rather than inferring it from the mail door's 404. */
    build: { app: buildApp, slash: slashModel !== undefined, host: 'self-host', min_cli: MIN_CLI, ...(inImage() ? { image: true as const } : {}) },
  });
  /* AN ERASURE REACHES SLASH'S LEDGER TOO, in `slash.sqlite` beside the record's file (`slashErasing`),
     which the kernel's erase cascade never reaches. */
  slashErasing(api, slashSql);

  /* A MODULE-LEVEL REFUSAL NO LONGER ENDS THE PROCESS. This called `process.exit(1)` from inside a library function, so a
     record whose ledger names a migration this build lacks took the process down before `/healthz` could answer, and a
     test that opened such a file died with it (`test/healthz.test.ts`). `33 §9` says the refusal is returned by every RPC
     as 503 "until a deploy fixes it, per record on a self-host", and `53 §13 #9` makes `/healthz` a 503 with its code, so
     the process stays up and says so: every record method already answers the refusal through the kernel, and
     `main.ts` prints the sentence. `api.kernel.refused()` is how an embedder asks. */

  /* `53 §13 #9`'S TUPLE, READ ONCE: the three numbers are this build's, and asked after a delete they would read a closed
     file. `/api/version` answers the same three behind a credential, from the same call. */
  const shape = await api.version({ principal: { kind: 'system', id: 'healthz' } });
  const tuple = shape.ok ? { format: shape.value.format, kernel: shape.value.kernel, primitives: shape.value.primitives } : null;

  /* THE KEY A LINK TO ONE PAGE IS SIGNED WITH, taken here, before anything listens, because `main.ts` zero-fills what it
     handed `start` once `start` has answered; so this process keeps its own copy.

     THE CONTRACT'S KEY IS `shareKey`: HKDF-SHA-256 over the key file with info `braindog/share`, derived by the key
     store while it still holds the key file's bytes (`keys.ts`) and handed here by `main.ts`, as the Worker derives its
     own from `KEK`. A new key file then closes every link, and `BRAINDOG_SESSION_SECRET` has no say in it.

     WITHOUT ONE, THE SESSION KEY IS THE MATERIAL, one HKDF step on with the same info. That serves a process whose
     embedder handed no share key, a test among them, and it is safe, because a token never crosses hosts; but it ties
     the links to `BRAINDOG_SESSION_SECRET` when that is set, which is not the contract's wording, so a key store that
     derives the share key is the one this process should be given. Neither key, as in open mode, is no key: no link is
     made and every link is the 404. */
  const shareKey =
    options.shareKey !== undefined ? new Uint8Array(options.shareKey) : options.sessionKey === undefined ? null : await deriveShareKey(options.sessionKey);

  /* THE WIRING IS SHARED, not copied. Both hosts call `handlersFor`, so a route cannot exist in one
     and not the other, and it throws at start rather than 404ing in production. `openShare`'s answer is signed into a
     link on its way out (`withShareLinks`), for the record this process holds and the origin it serves the app from. */
  /* AND THE KEYCHAIN PASSPHRASE'S TWO ROUTES ARE ANSWERED THROUGH THIS PROCESS'S KEY STORE (`withKeychainPassphrase`), which
     takes the passphrase off before the record is called. */
  const handlers = withKeychainPassphrase(
    withShareLinks(handlersFor(api), async () => {
      const record = api.kernel.identity()?.id;
      return shareKey === null || record === undefined || site === null ? null : { key: shareKey, record, origin: site.origin };
    }),
    api,
    async () => {
      const record = api.kernel.identity()?.id;
      return options.keys === undefined || record === undefined ? null : rootKeysOf(options.keys, record);
    },
  );

  /* THE BELT UNDER THE DOORBELL. A lost wake costs latency and never a job, because the row is still
     `pending`, and this tick is what makes that true. It is also what recovers a lease abandoned by
     a process that died holding it. */
  const ticker = options.pollMs === 0 ? null : setInterval(() => void poll(), options.pollMs ?? 15_000);
  ticker?.unref?.();

  /* SLASH'S DAILY LOOK. The record decides whether it is due; this only asks, now and then every `slashTickMs`. A look that
     throws is logged and waits for tomorrow, because the day was kept before the work. */
  const slash = async (): Promise<void> => {
    if (gone) return;
    try {
      await api.slashTick();
    } catch (e) {
      console.error('slash:', e instanceof Error ? e.message : String(e));
    }
    await lint();
  };
  /* AND THE RECORD LINTS ITS OWN PAGES ONCE A DAY on the same ticker, not on every hour's ask: a round draws
     every page, so the day is held here as well as in the record and the hours between ask nothing of it. */
  let lintedOn = '';
  const lint = async (): Promise<void> => {
    const today = new Date(clock.now()).toISOString().slice(0, 10);
    if (gone || lintedOn === today) return;
    lintedOn = today;
    try {
      /* A RECORD NOT YET OPENED (a fresh install at boot) is asked again next hour, not tomorrow. */
      const ran = await api.lintTick();
      if (!ran.ran && ran.why === 'unopened') lintedOn = '';
      /* AND WHETHER THE MODEL ANSWERS (`model-answers`), from Slash's own SQLite, where its ledger lives here. */
      else fileModelSign(api.kernel, slashSql, clock.now());
    } catch (e) {
      console.error('lint:', e instanceof Error ? e.message : String(e));
    }
  };
  const slashTicker = options.slashTickMs ? setInterval(() => void slash(), options.slashTickMs) : null;
  slashTicker?.unref?.();
  if (slashTicker) void slash();

  /* Arm from what the record already holds. A record reopened after a week has reminders whose time
     came while nothing was running, and an alarm nobody set is a schedule that never restarts. */
  await api.kernel.tail(scheduler);

  /* LOOPBACK UNLESS THERE IS A TOKEN. `listen(port)` with no host binds every interface, and the
     no-token case above hands `p_self` at `owner` to whoever asks, so a self-host started with no
     `BRAINDOG_SERVER_KEY`, which is the documented way to start one, served the credential index and the
     whole export to anything that could reach the machine. The two decisions are only safe
     together: no token means one person on one machine, and one machine is `127.0.0.1`.

     A deployment that wants a wider bind says so by setting a token, which is the same sentence
     read from the other end. `BRAINDOG_LISTEN` is the explicit override for the case in between: a
     container that has a token and needs `0.0.0.0` to be reachable at all. */
  /* AND "EVERY INTERFACE" IS BOTH FAMILIES. `0.0.0.0` is IPv4 alone, while every link this prints says `localhost`, which
     a machine may resolve to `::1` first: with another program on `[::]:<port>`, `curl localhost:<port>` reached that
     program and not this one (measured). `::` takes both where the machine has IPv6, and Node falls back to `0.0.0.0`
     where it has none. */
  const host = options.host ?? (options.token === undefined ? '127.0.0.1' : '::');
  const trusts: ProxyTrust | null = options.trustProxy === true ? nearPeer : typeof options.trustProxy === 'function' ? options.trustProxy : null;
  const trustProxy = trusts !== null;
  /* SET THE MOMENT THE PORT IS KNOWN, and nothing is answered before: see below. */
  let site: Site | null = null;
  /* NOTHING A REQUEST CAN DO ENDS THE PROCESS. `void answer(…)` discarded the promise and `answer`
     had no `catch`, so one throw was an unhandled rejection and Node exited, and the first throw is
     before any authentication: `new Request(url, { body })` refuses a body on a GET, so a `GET
     /api/boot` with a `Content-Length` killed the server. A client aborting mid-body did the same.
     The Worker never had this: workerd turns a throw into a 500.

     The 500 says what happened in one sentence and the socket is closed, which is the promise
     `serveApi` makes one layer down and the one this layer was breaking. */
  const answering: RequestListener = (req, res) => {
    /* `/.well-known/braindog-build`, AS THE WORKER ANSWERS IT: which build this process is, before any door and with
       no credential, `null` when it was never told. A deployment is not a record, so a deleted record does not change
       the answer, and a gate comparing hosts reads the same shape from both. `min_cli` IS THE OLDEST COMMAND THIS
       BUILD SERVES WELL (`MIN_CLI`, one day for both hosts), so a command can say it is behind before it calls. */
    if (/^\/+\.well-known\/+braindog-build\/*$/.test(new URL(req.url ?? '/', 'http://localhost').pathname)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ app: buildApp || null, min_cli: MIN_CLI }));
      return;
    }
    /* `/healthz` (`53 §13 #9`): `{ ok, app, format, kernel, primitives }` and a 200, or `{ ok, code }` and a
       503 while the kernel holds a module-level refusal, before any door and with no credential, so a container's health
       check needs no token. Never a slug: the record's name is not a fact about whether the process is well. `ok` and
       `app` are the Worker's two (`apps/worker/test/healthz.test.ts` pins them there), so one monitor reads both hosts;
       the Worker cannot add the other three without waking a record, and this host has its one record open already.
       BEFORE THE DELETED-RECORD 503, because the question is whether this process answers, and a restart loop over a
       record that was deleted on purpose would fix nothing. */
    if (/^\/+healthz\/*$/.test(new URL(req.url ?? '/', 'http://localhost').pathname)) {
      const method = req.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', allow: 'GET, HEAD' });
        res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/healthz is read with GET or HEAD.' } }));
        return;
      }
      const stopped = api.kernel.refused();
      res.writeHead(stopped ? 503 : 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(method === 'HEAD' ? undefined : JSON.stringify(stopped ? { ok: false, code: stopped.code } : { ok: true, app: buildApp || null, ...tuple }));
      return;
    }
    /* A CATALOGUE IS FILES, answered before any door, and never a record's: a deleted record does not change it. */
    const listed = catalogueAnswer(catalogueDir, req.method ?? 'GET', new URL(req.url ?? '/', 'http://localhost').pathname);
    if (listed) {
      res.writeHead(listed.status, listed.headers);
      res.end(req.method === 'HEAD' ? undefined : listed.body);
      return;
    }
    /* THE KENNEL, BESIDE THE CATALOGUE AND FOR ITS REASON (`kennel.ts`): the same folder, then the public Kennel. */
    if (servesKennel(new URL(req.url ?? '/', 'http://localhost').pathname)) return serveKennelTo(req, res, catalogueDir, options.kennel);
    /* A RECORD THIS BUILD REFUSES ANSWERS NOTHING BUT THE REFUSAL, AT 503, HERE AND NOT METHOD BY METHOD. Kept up rather
       than exited (above), the process was measured answering `GET /api/boot` 200 over a file whose ledger names a
       migration this build does not have (`test/healthz.test.ts`): not every record method asks the kernel's refusal
       first, and a method that does not reads tables this build does not know the shape of. So no door is reached, the
       sign-in and arrival doors included, and `Retry-After` is the five minutes `51 §6.1` gives this refusal. */
    const held = api.kernel.refused();
    if (held) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '300' });
      res.end(JSON.stringify({ ok: false, refusal: held }));
      return;
    }
    /* A DELETED RECORD ANSWERS NOTHING BUT THAT, and never reads a file that is no longer there. */
    if (gone) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `This BrainDog was deleted. Stop the server and make another with ${commandFor('init <name> --owner <your email>')}.` } }));
      return;
    }
    /* `/.well-known/braindog-key` (`03 §4`): the key this record's exports are signed with, `{ key_id, public_key }`, to
       anybody and with no credential, so `braindog verify --key <url>` has a place to fetch it other than the file it
       is checking. Measured at 1586f2a2 it was the router's 404 `ROUTE_UNKNOWN`. One record per process, so the root is
       the record's; the Worker serves many and answers it under the record's path instead. */
    if (/^\/+\.well-known\/+braindog-key\/*$/.test(new URL(req.url ?? '/', 'http://localhost').pathname)) {
      void keyDoor(req.method ?? 'GET', res, api).catch(() => res.destroy());
      return;
    }
    /* A CRASH IS ANSWERED BY REFERENCE AND NEVER BY ITS REASON (`crashAnswer`): this answered the thrown sentence, and a
       driver's sentence can name a row. */
    void answer(req, res, handlers, site, shell, trusts).catch((e: unknown) => {
      try {
        const [status, body] = crashAnswer(req.url ?? '/', e);
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      } catch {
        /* The socket is already gone, which is the ordinary case for an aborted request. */
        res.destroy();
      }
    });
  };
  /* TLS IS TERMINATED HERE WHEN THERE IS A CERTIFICATE TO DO IT WITH, and it is the same listener either
     way: `https.Server` differs from `http.Server` in the handshake and in nothing this file does. Both
     refusals a certificate can cause were already made above, before this socket existed. */
  /**
   * Where the inbound mail token lives, and what reads it (`49 §5.1` step 5, `§5.22`).
   *
   * `null` IS A HOST THAT CAN TAKE NO FORWARDED MAIL AT ALL, which here means a database in memory:
   * there is no directory to keep a token in, so there is no file an operator could write to change
   * that, and `/in/email/*` is 404 for everybody rather than open to anybody. Every other host gets
   * the reader, whether or not `init` has written the file yet, because on those hosts the file is
   * the answer and it can be written, replaced or deleted while this process runs.
   *
   * NOTHING IS READ HERE. `inboundDigest` reads on the first arrival and at most once every
   * `IN_TOKEN_MS` after that, so boot does not pay for a door most records never use.
   */
  const inboundMail = options.file === ':memory:' ? null : inboundDigest(joinPath(dirOf(options.file), 'inbound.token'), clock.now);

  const names = options.tls === undefined ? [] : certificateNames(options.tls.cert);
  const serverOf = () =>
    options.tls === undefined ? createServer(answering) : createTlsServer({ cert: options.tls.cert, key: options.tls.key }, answering);
  const server = serverOf();
  /* A PORT THAT IS TAKEN IS A SENTENCE, not an unhandled `error` event that ended the process with a stack. */
  const listening = (on: typeof server, at: string | undefined, port: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const failed = (e: Error): void => reject(e);
      on.once('error', failed);
      on.listen(port, at, () => {
        on.off('error', failed);
        resolve();
      });
    });
  try {
    /* THE DEFAULT WILDCARD IS NODE'S OWN, `::` with its fall back to `0.0.0.0`; one the operator named is bound as named. */
    await listening(server, options.host === undefined && host === '::' ? undefined : host, options.port);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'EADDRINUSE') throw new Error(`Port ${String(options.port)} is taken by another program, so this BrainDog did not start. Stop that program, or set PORT (and BRAINDOG_PORT under Compose) to another one.`);
    if (code === 'EADDRNOTAVAIL') throw new Error(`${host} is not an address of this machine, so this BrainDog did not start. Set BRAINDOG_LISTEN to one it has, or unset it.`);
    throw e;
  }
  /* AND LOOPBACK IS BOTH LOOPBACKS. `127.0.0.1` alone left `localhost` free to resolve to `::1` and reach whatever else
     listens there; a second socket on `[::1]` closes that. A machine with no IPv6 has nothing to close, and a program
     already on `[::1]:<port>` is said once, since this one cannot move it. */
  let second: typeof server | null = null;
  if (options.host === undefined && host === '127.0.0.1') {
    const also = serverOf();
    try {
      await listening(also, '::1', (server.address() as AddressInfo).port);
      second = also;
    } catch (e) {
      also.close();
      if ((e as { code?: string }).code === 'EADDRINUSE')
        console.error(
          `listen: another program holds [::1]:${String((server.address() as AddressInfo).port)}, so localhost may reach it rather than this BrainDog. Open it at 127.0.0.1, or stop that program.`,
        );
    }
  }

  /* THE ORIGIN IS KNOWN ONLY NOW, when the port is, and `port: 0` is how every test starts one. Nothing
     between here and `site = …` awaits, so no request is answered before it is set. */
  const port = (server.address() as AddressInfo).port;
  const origin =
    options.tls === undefined
      ? new URL(options.origin ?? `http://localhost:${port}`).origin
      : originFor({ configured: options.origin, names, port });
  const mode = cookieMode(origin);
  const rp = relyingParty(origin);

  /* WHY NOBODY SIGNS IN FROM THE APP, when nobody does: open mode has nobody to sign in as, no directory has
     nobody at all, an origin no cookie can be set on has nowhere to keep a session, and no session key has
     nothing to check one with. `null` is sign-in on. */
  const key = options.sessionKey;
  const token = options.token;
  const off: 'open' | 'directory' | 'insecure' | 'key' | null = token === undefined ? 'open' : options.directory === undefined ? 'directory' : mode === null ? 'insecure' : key === undefined ? 'key' : null;
  invitesOff = off === null ? null : INVITES_OFF;
  const directory: Directory = createDirectory(
    dirSql,
    clock,
    off === null && key !== undefined && token !== undefined
      ? {
          mac: key,
          ...(rp ? { rp } : {}),
          /* A LINK ONLY WHERE THERE IS A WAY TO MAIL IT. A link printed to a terminal is a link anybody reading the log
             can spend, so without SMTP there is none, and the sign-in screen offers passkeys and the server key. */
          magic: options.mail !== undefined,
          key: { serverKey: token },
          /* The reason a sign-in failed, for the operator. A flow and a word, never who or with what. */
          log: (line) => console.error(`auth: ${line.flow} refused (${line.reason})`),
          /* OPENING ANOTHER RECORD OPENS ONLY THE ONE THIS PROCESS SERVES, and only for somebody its own table still
             holds. The Directory may list more records under one data directory, and moving a session to one this
             process never opened would answer "opened" and keep serving this one. Asked after the session is, so a
             caller with no session learns nothing about which name this process serves. */
          admits: (record, person) => record === api.kernel.identity()?.id && api.kernel.access(person) !== null,
        }
      : undefined,
    /* A SELF-HOST SELLS NO PLAN, so the teams gate is off here: whoever the owner invites can join, whatever plan the row says. */
    { sells: false },
  );
  ledger = directory;
  const loopback = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
  /* THE ORIGINS THIS PROCESS ANSWERS FOR, WRITTEN ONCE. Open mode's cross-origin check and the app's own key
     doors ask the same question, and two lists of the same addresses would be two rules that drift.

     THE SCHEME IS THE SOCKET'S. These were `http://` unconditionally, which was true of every self-host
     until this one could hold a certificate: a TLS process would have listed three origins no browser can
     ever send, and a page it served from `https://localhost:8443` would have had its own writes refused as
     cross-origin. A hard-coded scheme beside a configurable socket is a rule that was only ever right by
     coincidence. */
  const origins = new Set([...loopback.map((h) => `${options.tls === undefined ? 'http' : 'https'}://${h}`), origin]);

  site = {
    build: buildApp,
    usage: directory.usage,
    /* THE ONE RECORD THIS PROCESS HOLDS, AND ONLY THAT ONE. `switcherRows` asks every record the
       Directory says this person can reach, and a self-host process can truthfully answer only for
       the record it has open, which is the same limit `serve()`'s own comment states for every
       other read: "a self-host serves the one record it has... answering for whichever one
       happened to sort first would be a person reading somebody else's record." Any other id gets
       `null`, which `switcherRows` reads as "not on this record" and leaves out, rather than a
       guess about a file this process never opened.

       THE ONE IT HOLDS ANSWERS THROUGH `switcherAsk`, the Worker's function too. This was
       `access(person)?.level ?? null` written out, which is `null` for a colleague invited to one
       list, so they were left out of the record they were on. */
    records: async (person) => {
      const here = api.kernel.identity()?.id;
      const rows = await directory.switcherRows(person, (record) =>
        record === here ? switcherAsk(api.kernel, person) : { level: null, name: null },
      );
      return { ok: true as const, value: rows };
    },
    api,
    token,
    origin,
    mode,
    auth: off === null ? directory.auth : null,
    hosts: new Set([...loopback, new URL(origin).host]),
    origins,
    /* AN AGENT'S LOGIN TOKEN MAY ADD A KEY AT THE DEPOSIT DOOR, checked as every `/api`
       bearer is (`keychainToken`); the record refuses anything but a token's context there. */
    keychain: keychainDoor(api, options.keys, (asked) => keychainToken(asked, site)),
    /* THE RECORD READS THE GRANT BEFORE IT READS A ROW (`shapeExport`), so the door hands the bearer on unread. */
    shape: { copy: (bearer) => shapeMethods({ kernel: api.kernel, clock, validFrom }).shapeExport(bearer) },
    keys: keysDoor(api, options.keys, origins),
    /* A CONVERSATION'S TOOLS READ THE RECORD'S OWN SQLITE for the ladder's reading of a write, which here is `sql`, apart
       from Slash's own store. */
    slash: {
      ...slashDoor(slashConfig, () => api, options.keys, { sql: slashSql, clock }, origins, (asker) =>
        slashTools(api, asker, { sql, person: asker.principal.kind === 'person' ? asker.principal.id : null }),
      ),
      health: engineHealth,
    },
    /* ONE BUDGET PER PROCESS, built here so it outlives a request and is shared by every ingest. */
    arrivals: arrivalDoor(api, ingestBudget(clock.now), inboundMail, keyOpener(api, options.keys), blobsFolder(options.file), options.txt),
    /* A LINK TO ONE PAGE, built here once so its read budget outlives a request, as the arrivals' does. */
    shared: sharedDoorOf(api, handlers, shareKey, clock.now),
    /* AND EVERY CALLER'S MINUTE, built here once for the same reason (`overLimit`), and what `limits` says of it. */
    limits:
      options.limits !== undefined
        ? options.limits
        : !trustProxy && ['127.0.0.1', '::1', 'localhost'].includes(host)
          ? null
          : windowLimiter(() => Date.now()),
    /* OAUTH, OVER THE DIRECTORY'S OWN FILE AND THE SAME SIGN-IN `/api` READS (`./oauth.ts`), built once so its decision
       about this socket is made once. An app's metadata document is read as a shared file is, through `shared`'s socket
       and name service, because both are a public document at an address somebody else names. */
    oauth: oauthHere({
      sql: dirSql,
      clock,
      api,
      origin,
      origins,
      auth: off === null ? directory.auth : null,
      mode,
      listen: host,
      trustProxy,
      names: (slug) => site !== null && site.names(slug),
      send: options.shared?.send,
      resolve: options.shared?.resolve,
    }),
    /* THE SERVER KEY'S LOCKOUT, built once so a strike outlives the request that earned it (SEC5). */
    keyLock: keyLockout(clock.now),
    peerSlow: peerSlowFor(trusts, clock.now),
    /* THE FIRST READ OF A STRANGER'S SENTENCE, built once here where the origin is known, so its count lasts the process. */
    firstRead: selfhostFirstReadDoor(env, { origin, slash: slashConfig, readSetup, catalogue: catalogueDir ?? null }),
    snapshots: kept,
    blobs: blobsFolder(options.file),
    /* THE TWO EMAIL ROUTES, GIVEN ONLY WHERE THIS HOST CAN MAIL THE LETTERS, as the magic-link door beside it is
       (`magic: options.mail !== undefined`, above). `ask` and `move` are the Directory's; `mirror` carries the change
       into the one record this process serves, and no other, because a self-host never opens a second one. */
    email: options.mail
      ? {
          ask: (person, email) => directory.emailAsk(person, email),
          move: (person, token) => directory.emailMove(person, token),
          mirror: async (record, person, change) =>
            record === api.kernel.identity()?.id
              ? api.kernel.mirrorPerson(person, change)
              : { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'This self-host serves only the one record it has open.' } },
          mail: (kind, to, link) => options.mail?.(to, link ?? '', kind),
        }
      : undefined,
    names: (slug) => {
      const here = api.kernel.identity()?.id;
      return here !== undefined && directory.namesOf(here).some((n) => n.slug === slug && n.released_at === null);
    },
    /* THE DIRECTORY REFUSES TO REMOVE THE OWNER, and that refusal stands: the record has already answered the removal. */
    leave: (person) => {
      const here = api.kernel.identity()?.id;
      if (here !== undefined) directory.leave(here, person);
    },
    door: {
      on: 'selfhost',
      origin,
      auth: directory.auth,
      open: token === undefined,
      /* THE MAIL DOOR, beside the `magic` switch above: the two are on together or off together. */
      ...(options.mail ? { mail: options.mail } : {}),
      /* AN INVITATION LINK IS SPENT BY SIGNING IN, so it is taken only where somebody can: the record says who may join,
         and the Directory makes the person and holds the session. */
      ...(off === null
        ? {
            invite: {
              look: (inviteToken: string) => api.acceptInvite({ token: inviteToken }) as never,
              accept: async (inviteToken: string, person: { id: string; email: string; name?: string }) => {
                const out = await api.acceptInvite({ token: inviteToken, person });
                if (!out.ok) return out;
                const record = inviteToken.slice(0, inviteToken.indexOf('.'));
                return directory.knows(record) ? directory.join(record, person.id) : out;
              },
              known: async (email: string) => Boolean(dirSql.one(KNOWN, email)),
              /* THE NAME IS FORWARDED. This passed the address alone, so the name the invitation page sent stopped
                 here and neither the Directory nor the record's mirror, which People draws, ever heard it. */
              person: async (email: string, name?: string) => directory.person$(email, name),
            },
          }
        : {}),
      /* A DEVICE SIGNS IN ONLY WHERE SOMEBODY CAN APPROVE IT WITH A CREDENTIAL: a session, or the server key. An
         open self-host needs no bearer, and `deviceApprove` refuses its credential-less owner anyway. One record,
         so a slug has nothing to choose between. */
      ...(token === undefined
        ? {}
        : {
            device: {
              start: ({ ip, reach, label, scope, binds, ua }) =>
                api.deviceStart({ reach, label, ...(scope === undefined ? {} : { scope }), ...(binds === undefined ? {} : { binds }), ...(ua === undefined ? {} : { ua }) }, ip),
              poll: ({ device_code }) => api.devicePoll({ device_code }),
            },
          }),
    },
  };

  /* WHAT THE BOOT LINE NAMES: the ways in that are live, from the Directory's own answer. */
  const said = off === null ? await directory.auth({ flow: 'methods' }) : null;
  const live = said?.status === 200 ? said.body : null;
  const ways = [...(live?.passkey ? ['a passkey'] : []), ...(live?.key ? ['the server key'] : [])];

  return {
    server,
    api,
    sql,
    scheduler,
    drain: run,
    poll,
    directory,
    /* THE DIRECTORY'S CONNECTION, for the nightly copy's `VACUUM INTO` (`backup.ts`), so the copy is taken through the
       handle this process already holds and closes, and never through a second one somebody has to remember. */
    directorySql: dirSql,
    signIn: { origin, ways, off },
    /* WHY OAUTH IS OFF HERE, OR NULL WHILE IT IS ON, so the start can say it: only its metadata said so before, and a
       connector that failed to connect was the first anybody heard of it. */
    oauthOff: site.oauth.off,
    close: () =>
      new Promise<void>((r) => {
        scheduler.stop();
        if (ticker) clearInterval(ticker);
        if (slashTicker) clearInterval(slashTicker);
        second?.close();
        server.close(() => (gone || (sql.close(), slashSql.close()), dirSql.close(), r()));
      }),
  };
}

/**
 * Whether a request with no app to answer it is a person at a browser: a read of the root or the sign-in page, or any
 * read that asks for HTML. A script asking anything else gets the JSON 404 it always did.
 */
const wantsPage = (method: string, path: string, headers: Headers): boolean =>
  (method === 'GET' || method === 'HEAD') && (/^\/*(?:signin\/*)?$/u.test(path) || (headers.get('accept') ?? '').includes('text/html'));

/**
 * The page a browser gets when the app was never built. The server started, the start line printed a sign-in address,
 * and that address answered a JSON 404 about record methods, which looks like a broken link rather than a missing step.
 * 503 because the address is right and the app behind it is not there yet.
 */
function unbuilt(method: string): Response {
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BrainDog is not built yet</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 16px}code{font-size:.95em}</style></head><body>' +
    '<h1>The app is not built yet</h1><p>This BrainDog is running, and its record answers, but the app it serves was never built.</p>' +
    '<p>In the repository folder run <code>pnpm --filter @braindog/web build</code>, then start the server again.</p></body></html>';
  return new Response(method === 'HEAD' ? null : page, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

const json = (status: number, body: object, extra: readonly (readonly [string, string])[] = []): Response => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const [k, v] of extra) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
};

/** Whether `ONE_PLACE` was said, so a proxied host says it once and not on every request. */
let proxyTold = false;

/**
 * The place the lockouts and limits count (`placeOf`): the socket's, or, when that socket is a proxy this host was told
 * to trust, the caller that proxy wrote at the right of `X-Forwarded-For`.
 *
 * THE RIGHT AND NOT THE LEFT. The left entry is whatever the client sent, and a proxy appends to it rather than
 * replacing it, so counting it would let anybody lock anybody out by naming them. AND ONLY FROM A TRUSTED PEER (AI16):
 * with the setting on, the header was read from any caller, so one that reached the port directly named a new place per
 * guess and was never locked.
 */
function placeAt(req: IncomingMessage, trusts: ProxyTrust | null): Place {
  const xff = req.headers['x-forwarded-for'];
  return placeOf(req.socket.remoteAddress ?? '', Array.isArray(xff) ? xff.join(', ') : xff, trusts);
}

function ipOf(req: IncomingMessage, trusts: ProxyTrust | null): string {
  return placeAt(req, trusts).ip;
}

/**
 * The door a path came through, for a crash's line: `/api/<method>`, `/mcp`, or its first segment.
 *
 * NEVER THE WHOLE PATH, because a path can carry a token (`/in/email/<token>`, `/auth/claim/<token>`) or a name a person
 * chose (`/<slug>/...`), and a log line holds neither. The Worker's `doorPath` (`apps/worker/src/oplog.ts`) draws
 * the same line; an app cannot import another, so each host keeps its own few lines of it.
 */
function crashDoor(path: string): string {
  if (/^\/+mcp\/*$/u.test(path)) return '/mcp';
  const api = /^\/+(?:app\/+[^/]+\/+)?api(?:\/+([^/]*))?(?:\/|$)/u.exec(path);
  if (api !== null) return api[1] !== undefined && /^[A-Za-z]{1,64}$/u.test(api[1]) ? `/api/${api[1]}` : '/api';
  const first = /^\/+([^/]+)/u.exec(path)?.[1];
  return first !== undefined && /^[A-Za-z.-]{1,32}$/u.test(first) ? `/${first}` : '/';
}

/**
 * A crash at this host's front door, as a status and a body: a reference and never the reason, through `crashed`
 * (`@braindog/host`), which writes the reason to one `op: 'crash'` line under the same reference.
 *
 * `/mcp` IS ANSWERED IN JSON-RPC, `-32603` with the reference in `data`, as `packages/mcp/src/rpc.ts` answers a throw one
 * layer down: an MCP client reads an `error` object. The reference is read back off the line `crashed` wrote, so the
 * answer and the log cannot name two different ones.
 */
function crashAnswer(url: string, e: unknown): [number, object] {
  const where = crashDoor(url.split('?')[0] ?? '/');
  let ref: unknown = null;
  const out = crashed(where, e, (line) => {
    console.error(line);
    ref = (JSON.parse(line) as { ref?: unknown }).ref;
  });
  return [500, where === '/mcp' ? { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'internal', data: { ref } } } : out];
}

/** The methods that read, for a door with no route table to ask: `/auth/*`. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/** Which budget a record's call spends: `ROUTES`' `writes` for `/api/<method>` (`classOf`), and a read for anything else. */
const classAt = (path: string): LimitClass => classOf(/^\/+api\/+([^/]+)\/*$/.exec(path)?.[1]);

/**
 * The front doors' limit on this host: `null` to go on, or the 429 `RATE_LIMITED` with `Retry-After` (`refusedFor`).
 *
 * THE WORKER'S RULE OVER THIS PROCESS'S OWN MINUTE (`overLimit` in `apps/worker/src/index.ts`): asked once the door is
 * known and before the record is asked, keyed by `limitKey`, so a token, a person, and for `/auth/*` an address each
 * have a minute of their own. `ip` is read only where there is no door; a caller who said who they are is counted as
 * that, from wherever they ask.
 */
async function overLimit(site: Site, door: LimitDoor | null, ip: string, cls: LimitClass): Promise<Response | null> {
  if (site.limits === null) return null;
  const said = await site.limits.limit(limitKey(door, ip), cls);
  return said.ok ? null : refusedFor(said.retryAfter);
}

/**
 * A runner's `claimJob`, asked of the record again every `CLAIM_EVERY_MS` until a job is handed over or the wait the
 * runner sent has passed (`holdClaim` in `@braindog/host`): the last answer either way.
 *
 * `request` IS NEVER READ ITSELF: each ask answers a copy, because `serveApi` consumes the body it is handed. An answer
 * that is not a 200 is a refusal, which `claimIdle` does not wait past.
 */
async function heldClaim(request: Request, handlers: Record<string, Handler>, ctx: CallContext): Promise<Response> {
  const sent = (await request.clone().json().catch(() => null)) as { wait?: unknown } | null;
  const ask = async (): Promise<{ out: Response; said: { ok: boolean; value?: unknown } | null }> => {
    const answered = await serveApi(request.clone(), handlers, ctx);
    const body = await answered.text();
    const out = new Response(body, { status: answered.status, headers: answered.headers });
    if (answered.status !== 200) return { out, said: null };
    try {
      return { out, said: JSON.parse(body) as { ok: boolean; value?: unknown } };
    } catch {
      return { out, said: null };
    }
  };
  const last = await holdClaim(ask, sent?.wait, {
    idle: (answer) => answer.said !== null && claimIdle(answer.said),
    now: () => Date.now(),
    sleep: (ms) => new Promise<void>((done) => setTimeout(done, ms)),
  });
  return last.out;
}

/**
 * A `Response` onto the socket, every `Set-Cookie` kept.
 *
 * `getSetCookie()`, BECAUSE `Object.fromEntries(out.headers)` KEPT ONE. `Headers` joins a repeated header
 * into one comma-separated value, and a cookie is the one header that cannot be split back apart, so a
 * rotation and a cleared cookie in one answer would have reached the browser as one broken cookie.
 */
async function write(res: ServerResponse, out: Response, cookie?: string): Promise<void> {
  const cookies = [...out.headers.getSetCookie(), ...(cookie === undefined ? [] : [cookie])];
  out.headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.writeHead(out.status);
  /* A STREAM OF LINES IS WRITTEN AS IT COMES (Slash's conversation), so its first step reaches the screen before its answer. */
  if (out.body !== null && (out.headers.get('content-type') ?? '').includes('ndjson')) {
    const reader = out.body.getReader();
    for (let part = await reader.read(); !part.done; part = await reader.read()) res.write(part.value);
    res.end();
    return;
  }
  res.end(Buffer.from(await out.arrayBuffer()));
}

/**
 * The most a request body to `/api`, `/auth` or `/account` may weigh: 100 MB, what Cloudflare takes before a Worker sees a
 * request, so a record answers the same on either host. `/mcp` holds its own, smaller cap.
 */
export const BODY_MOST_BYTES = 100 * 1024 * 1024;

/**
 * The most a body at `/in/*` may weigh before this process stops reading it.
 *
 * A HUNDRED MEBIBYTES IS THE RIGHT NUMBER FOR A SIGNED-IN OWNER CALLING `/api/import` AND THE WRONG
 * ONE FOR A STRANGER. `/in/*` is the only path on this server with no credential anywhere on it, and
 * the weighing above happens before routing, so, measured, an 8 MiB POST to
 * `/in/webhook/<a declared ingest>` from anybody who could reach the port was read whole into memory
 * and only then compared against the one mebibyte the channel allows. On a host bound to `0.0.0.0`,
 * which is the default once a token is set, that is a hundred megabytes of this process per
 * connection for free.
 *
 * SIX AND NOT FIVE, so the door still answers the refusal rather than the reader. `serveIngest`'s own
 * ceilings are 1 MiB for a webhook and 5 MiB for a forwarded message, and its 413 carries the exact
 * number a sender can act on; the reader's carries nothing. A mebibyte of slack means everything up
 * to the largest channel ceiling reaches the door and gets the useful sentence, and only a body past
 * every ceiling this route has is cut off unread.
 */
const IN_BODY_MOST_BYTES = 6 * 1024 * 1024;

/** A 413 for a body past the cap, and the connection closed, so nothing more of it is read. */
async function tooLarge(req: IncomingMessage, res: ServerResponse): Promise<void> {
  /* DESTROYED ONCE THE ANSWER HAS LEFT, or the socket closes under it and the caller reads a reset instead of the 413. */
  res.once('finish', () => req.destroy());
  await write(res, json(413, { ok: false }, [['connection', 'close']]));
}

/**
 * The self-host's half of a link's door (`@braindog/host`'s `share.ts`): the key, the one record this process holds, a
 * read budget and the record's own table.
 *
 * ONE RECORD, SO `knows` IS WHETHER THE LINK NAMES THIS ONE. A link signed for a record this process does not hold is the
 * 404 before anything is asked. THE BUDGET IS `windowLimiter`'s, the self-host's read limit, keyed by the link.
 * AND THE RECORD ANSWERS THROUGH `serveApi` OVER THE SAME TABLE AS EVERY OTHER CALL, so `sharedPage` is decoded, refused
 * and answered as any method is, with the link's context as its caller.
 *
 * THE EXPIRY IS READ ON THE RECORD'S CLOCK AND THE BUDGET COUNTS ON THE WALL'S, as `limits` in `start` does. `now` pins
 * the record's clock for a test or a gate, which is what a link's `exp` is measured against, and a minute on a pinned
 * clock never ends, so a budget counted on it would never be given back.
 */
function sharedDoorOf(api: Api, handlers: Record<string, Handler>, key: Uint8Array | null, now: () => number): SharedDoor {
  const limits = linkLimiter(() => Date.now());
  return {
    key: async () => key,
    knows: async (record) => record === api.kernel.identity()?.id,
    spend: async (asked) => {
      const said = await limits.limit(asked, 'read');
      return said.ok ? null : linkRefused(said.retryAfter);
    },
    now,
    answer: (_record, link, request) => serveApi(request, handlers, link),
  };
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: Record<string, Handler>,
  site: Site | null,
  shell: ((request: Request, origin: string) => Response) | null,
  trusts: ProxyTrust | null,
): Promise<void> {
  const trustProxy = trusts !== null;
  /* A PROXY IN FRONT, NOT TRUSTED, IS SAID ONCE (RD7): the lockout then counts the proxy and nobody else. */
  if (!trustProxy && !proxyTold && site?.token !== undefined && proxied(req.socket.remoteAddress ?? '', req.headers)) {
    proxyTold = true;
    console.error(ONE_PLACE);
  }
  const asked = new URL(`http://localhost${req.url ?? '/'}`);
  const method = req.method ?? 'GET';
  const headers = Object.entries(req.headers).map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]);
  if (!site) return write(res, json(503, { ok: false }));

  /* `/<slug>/api/<method>` IS `/api/<method>`, READ AT THE ROOT, AND SO IS THE OLD `/app/<slug>/api/<method>`. The web
     sends every record call under a slug there (`apps/web/src/lib/at.ts` `apiBase`), and this handed the path to the shell,
     which answered `index.html` and a 200 to a tab that then read a page as its record (`test/app-path.test.ts`). The
     path is moved before anything else reads it, because `serveApi` takes the method from the path, as the Worker's
     `atRoot` does for the same reason. A slug that is not this record's is `foreign`, and is refused below once the
     caller is known, so a request with no credential gets the root's own 401 and learns nothing about which name is here. */
  const named = slugApi(asked.pathname);
  const url = named === null ? asked.href : new URL(`${named.rest}${asked.search}`, asked.origin).href;
  /* AND A NAME THE DIRECTORY GIVES THIS RECORD IS THIS RECORD. `init <slug> --from <file>` restores a copy under the name
     it is given while the record keeps the one inside the file, because rewriting its row would make its next export a
     different file from the copy (`test/restore-from.test.ts`); the switcher hands out the Directory's name, and the
     app's calls under it were refused "You are not on this record." */
  const foreign = named !== null && named.slug !== site.api.kernel.identity()?.slug && !site.names(named.slug);

  /* FOUR DOORS, AND THEY ARE `33 §4`'S: sign-in, an agent's MCP client, the record, and the app for everything
     else. The app is what makes `/signin` the same origin as the cookie it asks for. `/mcp` is taken before a
     byte of the body is read, because it reads the body only for a bearer it knows. */
  const path = new URL(url).pathname;
  if (/^\/+mcp\/*$/.test(path)) return write(res, await agent(req, url, method, headers, site, placeAt(req, trusts)));
  /* OAUTH 2.1, BEFORE THE BODY IS WEIGHED, as `/mcp` is: its doors read at most their own few kilobytes, counted as they
     arrive, so a body is handed over unread and the hundred mebibytes below are never held for a stranger here. The
     request is built at the origin the socket was reached by (`originAt`), because the metadata names the address the
     client typed; ONE LEADING SLASH, because `//oauth/token` resolved against an origin is a URL whose host is `oauth`. */
  if (servesOAuth(path)) {
    const at = new URL(`${path.replace(/^\/+/, '/')}${asked.search}`, site.oauth.originAt(req.headers.host ?? ''));
    const init: RequestInit = SAFE.has(method) ? { method, headers } : { method, headers, body: bodyOf(req), duplex: 'half' };
    return write(res, await site.oauth.serve(new Request(at, init), ipOf(req, trusts)));
  }

  /* A BODY IS WEIGHED AS IT ARRIVES, BEFORE ANYBODY IS KNOWN. Every byte was held in memory before the credential was
     read, so anybody who could reach a host bound to every interface could send it gigabytes with no key at all.
     AND `/in/*` IS WEIGHED AGAINST ITS OWN, SMALLER CEILING, because it is the one path here with no credential on
     it at any point: the owner's hundred mebibytes is a number a signed-in person earns. */
  const cap = /^\/+in(?:\/|$)/.test(path) ? IN_BODY_MOST_BYTES : BODY_MOST_BYTES;
  const said = Number(req.headers['content-length'] ?? Number.NaN);
  if (Number.isFinite(said) && said > cap) return tooLarge(req, res);
  const chunks: Buffer[] = [];
  let weight = 0;
  for await (const chunk of req) {
    weight += (chunk as Buffer).length;
    if (weight > cap) return tooLarge(req, res);
    chunks.push(chunk as Buffer);
  }
  const request = new Request(url, { method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
  /* `reached` IS THE `Host` THE SOCKET GOT, so a device that called this process by another name is not told to
     approve itself at the configured origin. */
  if (/^\/+auth(?:\/|$)/.test(path)) {
    /* LIMITED BY ADDRESS BEFORE THE DIRECTORY IS ASKED, on top of its own lockouts: nobody at this door has said who they
       are yet, and the address the lockouts count is the one thing here a caller cannot choose (`ipOf`). */
    const ip = ipOf(req, trusts);
    const over = await overLimit(site, null, ip, SAFE_METHODS.has(method) ? 'read' : 'write');
    /* A STRANGER'S FIRST SENTENCE, READ BY THIS HOST'S MODEL (`./first-read.ts`): off until `FIRST_READ_DAILY` is set,
       and read by `readSetup`, with no record, owner or ledger. */
    if (over === null && /^\/+auth\/signup\/read\/*$/.test(path)) return write(res, await serveFirstRead(request, site.firstRead));
    return write(res, over ?? (await serveAuth(request, { ...site.door, ip, reached: req.headers.host ?? '' })));
  }
  /* `/account/*` IS THE DIRECTORY'S TOO, and reads only the session cookie. */
  if (/^\/+account(?:\/|$)/.test(path)) return write(res, await serveAccount(request, { origin: site.origin, auth: site.auth, usage: site.usage, records: site.records, email: site.email }));
  /* `/in/*`: SOMETHING ARRIVES FROM OUTSIDE, AND NOBODY IS ASKED WHO IT IS (`49 §5.16`, `12 §3`).
     It is taken before the `/api` fallback below and not after, because that fallback hands every
     path it does not recognise to the app shell: without this line `POST /in/webhook/x` answered
     `index.html` and a 200, which is worse than a 404 because a sender's retry logic reads it as
     delivered. `serveIngest` holds the whole order, including the 404 for a shape this host does
     not serve, and it is the same function the Worker calls. */
  if (/^\/+in(?:\/|$)/.test(path)) return write(res, await serveIngest(request, site.arrivals));

  if (!/^\/+api(?:\/|$)/.test(path))
    return write(
      res,
      shell
        ? shell(request, site.origin)
        : wantsPage(method, path, request.headers)
          ? unbuilt(method)
          : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }),
    );

  /* THE KEY DOORS, BEFORE ANY OTHER CREDENTIAL IS READ: their bearer is a keychain grant, which `contextFor` would
     not know, and a cookie or a login token must not reach them at all. AND ONLY AT THE ROOT: a grant names its own
     record, so a slug in front of it would be a second answer to which record, and the Worker refuses the same path in
     the same words (`apps/worker/src/index.ts` `recordApi`). */
  if (servesKeychain(path))
    return write(
      res,
      named === null
        ? /* A LOGIN TOKEN'S SPENT MINUTE IS ITS 429, put back in the place of the grant's sentence (`keychainToken`). */
          await serveKeychain(request, site.keychain).then((out) => keychainSpent.get(request) ?? out)
        : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The key doors are at /api/keychain/ (and /api/vault/), and a grant names its own record.' } }),
    );

  /* THE SHAPE DOOR, BESIDE THE KEY DOORS AND FOR THEIR REASON: its bearer is a shape grant, which `contextFor` would
     not know, it takes no cookie and no page, and it answers only at the root, since a grant names its own record. */
  if (servesShape(path))
    return write(
      res,
      named === null
        ? await serveShape(request, site.shape)
        : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The shape door is at /api/shape, and a grant names its own record.' } }),
    );

  /* A LINK TO ONE PAGE, `Authorization: Share <token>`, BEFORE ANY CREDENTIAL IS READ: `contextFor` reads any
     `Authorization` header as a bearer, and a link is not one. It opens `/api/sharedPage` at the root and nothing else,
     every way it does not open is one 404 with no body, and under a name it is that 404 too, as on the Worker
     (`apps/worker/src/index.ts` `recordApi`): the link names its own record. */
  const shared = shareOf(request.headers.get('authorization'));
  if (shared !== null) return write(res, named === null ? await serveShared(request, shared, site.shared) : sharedNone());

  /* THE DOOR IS NAMED ONLY TO A REQUEST THAT COULD WALK THROUGH IT: a POST, under this record's own name. Reading an
     operation grant spends it, and it was read for any method under any slug, so `GET /api/export` spent the grant and
     then `serveApi` answered 405, and `POST /not-this-one/api/export` spent it and then the slug was refused 403;
     either way the right request after it was 401 and the person approved on their phone again for nothing
     (`test/operation-grant-doors.test.ts`). With no door, an operation bearer on
     those requests is a credential this record does not know, 401, and is still good for the one it was minted for. It
     is not told 403 under a foreign name, because telling it that would mean spending it to learn it is real. */
  const door = method === 'POST' && !foreign ? /^\/+api\/+([A-Za-z]+)\/*$/.exec(path)?.[1] : undefined;
  const seen = await contextFor(request, req.headers.host ?? '', site, placeAt(req, trusts), door);
  /* A NAME THAT IS NOT THIS RECORD'S, TO A CALLER THIS HOST KNOWS. One record is served here, so no credential reaches
     another, and the sentence is the Directory's for a name that is not yours, whether or not it names anything. A
     caller it does not know falls through to the root's own refusal below, which never reaches the record. */
  if (foreign && 'ctx' in seen) return write(res, json(403, { ok: false, refusal: NOT_ON }), seen.cookie);
  /* THE CALLER'S MINUTE, ONCE THE DOOR SAYS WHO THEY ARE AND BEFORE ANY OF THE DOORS BELOW ASKS THE RECORD (`overLimit`).
     A cookie rotated on the way in rides back on the 429, as it does on every answer here. */
  if ('ctx' in seen) {
    const who: LimitDoor = { door: request.headers.has('authorization') ? 'bearer' : 'session', ctx: seen.ctx };
    const over = await overLimit(site, who, ipOf(req, trusts), classAt(path));
    if (over !== null) return write(res, over, seen.cookie);
  }
  /* THE SESSION HEADERS ON EVERY DOOR, checked: the record reads a token's and ignores anybody else's. */
  /* A KEPT COPY AS THE FILE IT IS (`49 §5.13`): `GET /api/snapshots/<id>`, for whoever `snapshots` answers. */
  const copyAsked = /^\/+api\/+snapshots\/+([^/]+)\/*$/.exec(path);
  if (copyAsked && method === 'GET' && 'ctx' in seen) return write(res, await copyOf(decodeURIComponent(copyAsked[1]!), seen.ctx, site), seen.cookie);
  /* `PUT /api/files` AND `GET /api/files/<sha256>`: the self-host half of the file store,
     `./files.ts`'s door, so a gallery or a card picture served on the self-host draws the picture and not only its
     caption. */
  if (servesFiles(path) && 'ctx' in seen && seen.ctx.preview !== undefined && method !== 'GET' && method !== 'HEAD')
    return write(res, json(403, { ok: false, refusal: PREVIEW_READ_ONLY }), seen.cookie);
  if (servesFiles(path) && 'ctx' in seen)
    return write(res, await serveFiles(request, withSession(seen.ctx, sessionOf(request.headers)), site.blobs, (sha256, ctx) => site.api.fileHeld(sha256, ctx)), seen.cookie);
  /* AND THE APP'S OWN KEY DOORS, AFTER THE SESSION AND NOT BEFORE IT, which is the whole difference between them
     and `/api/vault/*` above: those take a bearer `contextFor` would not know, and these take the session it just
     worked out. `serveKeys` refuses a bearer and any origin this host does not answer for; who the session is
     stays the record's question. */
  if ('ctx' in seen) {
    const ctx = withSession(seen.ctx, sessionOf(request.headers));
    /* Slash's DOOR AHEAD OF THE KEY DOORS AND BOTH AHEAD OF `serveApi`, because `serveApi` answers anything it does
       not know as `ROUTE_UNKNOWN`, which is what `POST /api/slash/read` got until this line existed. */
    const removal = method === 'POST' && /^\/+api\/+removeMember\/*$/.test(path) ? request.clone() : null;
    const leaving = leavesAsked(method, path);
    /* A RUNNER'S CLAIM IS HELD HERE UNTIL A JOB IS QUEUED OR ITS WAIT RUNS OUT (`holdClaim`), as the Worker's
       `heldClaim` holds it, and every other call is answered once. Only the runner's own principal is held, so a person
       or a token asking `claimJob` is answered at once with the record's refusal. */
    const out = servesSlash(path)
      ? await serveSlash(request, site.slash, ctx)
      : servesKeys(path)
        ? await serveKeys(request, site.keys, ctx)
        : ctx.principal.kind === 'runner' && method === 'POST' && /^\/+api\/+claimJob\/*$/.test(path)
          ? await heldClaim(request, handlers, ctx)
          : await serveApi(request, handlers, ctx);
    /* A REMOVAL THE RECORD ACCEPTED IS FOLLOWED BY THE DIRECTORY'S `leave`, as the Worker's `leftDirectory` does. */
    if (removal !== null && out.status === 200) {
      const asked = (await removal.json().catch(() => null)) as { person?: unknown } | null;
      if (typeof asked?.person === 'string' && asked.person !== '') site.leave(asked.person);
    }
    /* AND SO IS A SHARE THAT WAS SOMEBODY'S LAST (`leftBy`): the record answers who it left with nothing. */
    if (leaving && out.status === 200) for (const person of leftBy(await out.clone().json().catch(() => null))) site.leave(person);
    return write(res, out, seen.cookie);
  }
  /* AND THE STATUS COMES FROM THE SHARED TABLE. This answered one status for three different facts:
     a credential nobody minted, a credential belonging to somebody who is not on the record, and a
     record with no owner who may act, so a client could not tell which of the three to do something
     about. `httpStatus` is the same function the Worker uses, which is what keeps one record from
     behaving differently depending on where it runs. */
  if ('refused' in seen) {
    const out = { ok: false as const, refusal: seen.refused };
    return write(res, json(httpStatus(out), out, accessHeaders(seen.refused)), seen.cookie);
  }
  /* A NAME THIS PROCESS WAS NOT REACHED BY: an empty 421, which says nothing to a page that rebound its
     own name onto this port. */
  if (seen.bare === 421) return write(res, new Response(null, { status: 421, headers: { 'cache-control': 'no-store' } }));
  if (seen.bare === 429) return write(res, json(429, { ok: false, retryAfter: seen.retryAfter }, [['retry-after', String(seen.retryAfter)]]));
  return write(res, json(503, { ok: false }));
}

/**
 * `GET /.well-known/braindog-key`: `signingKey()` as `03 §4` shapes it, or a 404 that says there is no key to give.
 *
 * NO KEY IS AN ANSWER AND NOT AN ERROR. A record not yet created, a host started with no key store, and a record restored
 * from a copy wrapped by another host's root key all sign nothing, and saying so is what tells the person with a file in
 * hand that a check against this host cannot pass. It never invents a key and never reads the private half: the record
 * learns the public one by signing a fixed string no caller chooses (`packages/kernel/src/index.ts`, `signingKey`).
 */
async function keyDoor(method: string, res: ServerResponse, api: Api): Promise<void> {
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...head, allow: 'GET, HEAD' });
    res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/.well-known/braindog-key is read with GET or HEAD.' } }));
    return;
  }
  const key = await api.signingKey();
  const body = key
    ? { key_id: key.key_id, public_key: key.public_key }
    : { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This host holds no signing key for its record, so what it exports is unsigned and there is no key here to check a file against.' } };
  res.writeHead(key ? 200 : 404, head);
  res.end(method === 'HEAD' ? undefined : JSON.stringify(body));
}

/**
 * One kept copy, streamed with `Content-Disposition: attachment` (`49 §5.13`).
 *
 * THE SAME CHECK AS THE LIST. `snapshots` is an owner's in a browser, so a copy is reachable by exactly whoever may see
 * that it exists, and an id that is not in the list is refused rather than turned into a path.
 */
async function copyOf(id: string, ctx: CallContext, site: Site): Promise<Response> {
  const listed = await site.api.snapshots(ctx);
  if (!listed.ok) return json(httpStatus(listed), listed);
  const file = listed.value.some((s) => s.id === id) ? (site.snapshots?.path(id) ?? null) : null;
  if (!file) {
    const out = { ok: false as const, refusal: { code: 'OUT_OF_BOUNDS', fix: `${id} is not one of the copies kept here.`, at: 'id' } };
    return json(httpStatus(out), out);
  }
  const slug = site.api.kernel.identity()?.slug ?? 'record';
  return new Response(readWhole(file), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.sqlite3',
      'content-disposition': `attachment; filename="${slug}-${id}.brain"`,
      'cache-control': 'no-store',
    },
  });
}
/**
 * `POST /mcp`, for an agent's MCP client.
 *
 * NOTHING OF THE BODY IS READ UNTIL THE BEARER IS KNOWN. What the headers can refuse, and the bearer, are
 * decided on a request with no body at all; the socket's bytes become one only for a caller this record knows.
 *
 * A BEARER AND NOTHING ELSE: the path `/api` takes for one, and nothing that path falls back to. The cookie is
 * never read and open mode never applies, because an agent carries its own credential and a browser has the app.
 */
async function agent(req: IncomingMessage, url: string, method: string, headers: [string, string][], site: Site, at: Place): Promise<Response> {
  const head = new Request(url, { method, headers });
  const early = gate(head);
  if (early) return early;
  const sent = presented(head);
  const seen = sent === undefined ? null : await bearerFor(sent, site, 'mcp', at, undefined, cliOf(head));
  /* THE 401 NAMES WHERE TO SIGN IN, as the Worker's does, so an MCP client holding no token starts OAuth from it
     (RFC 9728): at the name this process was reached by, and not at all while OAuth is off. */
  const metadata = site.oauth.metadata(req.headers.host ?? '');
  if (seen === null) return unauthorized(metadata);
  /* THE SERVER KEY'S LOCKOUT, said as every other 429 here is said. */
  if ('bare' in seen) return json(429, { ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Too many wrong keys from here. Wait, then try again.', retry_after: seen.retryAfter } }, [['retry-after', String(seen.retryAfter)]]);
  if ('refused' in seen) {
    /* A credential this record does not know is the transport's 401. One it knows, for somebody no longer on
       the record or a record nobody may act on, gets the status and the sentence `/api` gives. */
    if (seen.refused.code === 'UNAUTHORIZED') return unauthorized(metadata);
    const out = { ok: false as const, refusal: seen.refused };
    return json(httpStatus(out), out);
  }
  /* THE TOKEN'S MINUTE BEFORE A BYTE OF THE BODY IS READ, and always the read budget: which tool is called is inside a
     body nobody has parsed yet (`classOf`), and the record still decides whether a write is allowed. A bearer is
     counted as itself, so no address is needed. */
  const over = await overLimit(site, { door: 'bearer', ctx: seen.ctx }, '', 'read');
  if (over !== null) return over;
  /* The session headers, then `_meta.session` over them key by key, both checked the same way. */
  return serveMcp(new Request(url, { method, headers, body: bodyOf(req), duplex: 'half' }), withCalls(site.api, actCalls(site.api), () => ROUTES), withSession(seen.ctx, sessionOf(head.headers)), {
    session: (ctx, said) => withSession(ctx, hintsOf(said)),
    /* WHERE THIS PROCESS SERVES THE APP (`BRAINDOG_ORIGIN`), so a filed `propose` carries its `decide` link here. */
    origin: site.origin,
    /* AND ITS BUILD, as `serverInfo.version` and the `braindog-build` header, as the Worker says its own (W1-B). */
    ...(site.build === '' ? {} : { build: site.build }),
  });
}

/** One record's calls by name for the MCP's `act`, over the handler table `/api` serves, built on the first call (as the Worker's). */
function actCalls(api: Parameters<typeof handlersFor>[0]): (name: string, args: Record<string, unknown>, ctx: never) => Promise<Result<unknown>> {
  let handlers: ReturnType<typeof handlersFor> | null = null;
  return (name, args, ctx) => callRoute((handlers ??= handlersFor(api)), name, args, ctx);
}

/**
 * The socket's bytes as a stream, read only as `serveMcp` asks for them.
 *
 * PAUSED BEFORE THE LISTENER IS ATTACHED, and `highWaterMark: 0`, so not a byte is read until a read asks
 * for one. A listener attached while flowing reads a chunk at once, and Node then leaves draining to us.
 *
 * A CANCEL DRAINS RATHER THAN DESTROYS. `serveMcp` cancels a body it refuses at 413, and destroying the
 * request would close the socket before the 413 is written. The rest is read and dropped, never held, so
 * the connection is still good for the client's next request.
 */
function bodyOf(req: IncomingMessage): ReadableStream<Uint8Array> {
  let open = true;
  const stop = (): boolean => {
    const was = open;
    open = false;
    return was;
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      req.pause();
      req.on('data', (chunk: Buffer) => {
        if (!open) return;
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 0) <= 0) req.pause();
      });
      req.once('end', () => {
        if (stop()) controller.close();
      });
      req.once('error', (e) => {
        if (stop()) controller.error(e);
      });
    },
    pull: () => void req.resume(),
    cancel: () => {
      stop();
      req.resume();
    },
  }, { highWaterMark: 0 });
}
