/**
 * The self-host: one Node process, one file, the same record.
 *
 * IT IS NOT A CUT-DOWN VERSION. `01-ARCHITECTURE` §4 makes the self-host the same code as the hosted
 * product with a different storage adapter underneath — the packages are identical, and everything
 * in this file is the two things a platform actually differs on: where the bytes live, and how a
 * request arrives. If a route ever appears here and not in the Worker, one of them is a different
 * product.
 *
 * THIS FILE IS ALLOWED TO KNOW IT IS NODE. That is the other side of the line the `stack` gate draws
 * across `packages/**`: the kernel may not ask which runtime it is in, and a host must.
 */

import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'node:process';

import {
  grantAad, grantKey, openSealed,
  handlersFor, hintsOf, httpStatus, serveApi, serveIngest, serveKeys, serveSpark, serveVault, servesKeys, servesSpark, servesVault, sessionOf, withSession,
  type Handler, type IngestDoor, type KeysDoor, type SparkAskDoor, type VaultDoor,
} from '@braindog/host';
import {
  clearCookie,
  cookieMode,
  readSid,
  relyingParty,
  sameKey,
  sameOrigin,
  serveAccount,
  serveAuth,
  sessionContext,
  sessionCookie,
  type AccountDoor,
  type AuthDoor,
  type CookieMode,
} from '@braindog/host/auth';
import { gate, serveMcp, unauthorized } from '@braindog/mcp/http';
import { OPERATION_METHOD, type Execute, type OutboxKind, type OutboxRow, type PagedRun, type ScriptRunner, type Signer } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';
import { readFileSync as readWhole, existsSync as present, rmSync as removeTree } from 'node:fs';
import { basename as baseOf, dirname as dirOf, join as joinPath } from 'node:path';
import { catalogueAnswer, catalogueFolder, catalogueOffersFrom } from './catalogue.ts';
import { certificateNames, originFor } from './reach.ts';
import { fileSnapshots, type FileSnapshots } from './snapshots.ts';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';
import { badSlug, createDirectory, switcherAsk, type Directory } from '@braindog/record/directory';
import { fixOf, type Auth, type Param, type Refusal, type Row, type Scheduler, type Sql } from '@braindog/ports';

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
import { serveAsks } from '@braindog/host/spark-answers';
import { grantNamed, holdingScript } from '@braindog/host/script';
import { askerOf, scriptTrial, trialSandbox } from '@braindog/host/script-try';
import { runInQuickJs } from '@braindog/script/quickjs';
import { scriptSandbox } from './script.ts';
import { httpFor } from './http.ts';
import { sparkAnswersFor, sparkDoor, sparkFromEnv, sparkModelFor, type SparkConfig } from './spark.ts';
import { unwrap, type KeyStore } from './keys.ts';
import { shellOf } from './shell.ts';
import { signerFor } from './sign.ts';
import { keysDoor, vaultDoor } from './vault.ts';

/** The `Sql` port over `node:sqlite`. The one thing this file exists to supply. */
export function openSqlite(path: string): Sql & { close(): void } {
  /* FOREIGN KEYS OFF, and it is not a preference. `node:sqlite` defaults this ON and a Durable
     Object leaves SQLite's default OFF — so `decision.supersedes REFERENCES decision(id)` is
     enforced here and nowhere else, which is a behavioural fork between the two hosts on the write
     path. The DDL's own comment beside that column says "documentary; not enforced". */
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
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
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * Who is asking: a bearer, a session cookie, or, with no server key, nobody at all.
 *
 * A self-host is one person's record on one machine, and the Directory `init` wrote says who that person
 * is. Whichever way they arrive, the answer is the same `CallContext` the hosted product builds, so every
 * permission check below this line is the same code. `contextFor`, further down, is the order.
 */
/** A credential this record does not know. 401, `49 §5.4` step 1. */
const UNKNOWN: Refusal = { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' };

/** None at all, where one is needed. The same 401, saying what to send rather than that it was not known. */
const NONE: Refusal = { code: 'UNAUTHORIZED', fix: 'This record takes a bearer token. Send it as Authorization: Bearer <token>.', at: 'authorization' };

/** A credential it knows, belonging to somebody it does not. 403, and the Worker says the same. */
const OFF: Refusal = { code: 'FORBIDDEN', fix: 'This credential does not reach this record.', at: 'principal' };

/**
 * A record whose every owner is suspended.
 *
 * IT IS NOT THE CALLER'S FAULT AND THE SENTENCE SAYS SO. Answering 403 "this credential does not
 * reach this record" to an operator holding the right shared secret, on loopback, is the least
 * actionable thing this server can say — the credential is perfect and the record is the problem.
 * `49 §5.1` step 5.3 calls a record that cannot be brought up `sick`, with a `{ code, fix }`, at 503.
 */
/**
 * `RECORD_UNAVAILABLE`, AND THE NAME IT REPLACES WAS ANSWERING THE WRONG QUESTION AT THE WRONG STATUS.
 *
 * This said `SCHEMA_UNAVAILABLE`, which was never about a schema — no migration is involved, no
 * checksum, no `user_version`. The word was borrowed from `SCHEMA_MISMATCH` and `SCHEMA_NEWER`
 * because those two are the codes `httpStatus` maps to 503, and a name chosen to look like a
 * neighbour is a name that teaches the wrong thing (`10 §7`).
 *
 * AND IT DID NOT EVEN GET THE STATUS. `SCHEMA_UNAVAILABLE` was in no registry and therefore in no
 * row of `host`'s `NOT_422`, so this answered **422** — *fix your input* — to a caller whose input
 * was perfect and whose record was the problem. `49 §5.1` step 5.3 says 503 in as many words, and
 * the sentence above about "the same function the Worker uses" was true and was reading a table
 * with no row for this. `30 §6` now carries the code and `NOT_422` carries the 503 with it.
 */
const NOBODY: Refusal = {
  code: 'RECORD_UNAVAILABLE',
  fix: 'Every owner of this record is suspended, so nobody may act on it. Un-suspend one.',
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
const NOT_ON: Refusal = { code: 'FORBIDDEN', fix: 'You are not on this record.' };

/**
 * `/app/<slug>/api/<method>`: the slug a path names and the `/api/…` path the record reads, or `null`.
 *
 * THE DIRECTORY'S `badSlug` SAYS WHAT A NAME IS, as the Worker's `appPath` asks it. So `/app/settings/api/x` and
 * `/app/api/boot` name no record and are left to the shell, and nothing here keeps a second list of the app's words.
 */
function slugApi(pathname: string): { slug: string; rest: string } | null {
  const m = /^\/+app\/+([^/]+)(\/+api(?:\/.*)?)$/.exec(pathname);
  if (!m || badSlug(m[1]!) !== null) return null;
  /* ONE LEADING SLASH, because `//api/boot` resolved against an origin is a URL whose host is `api`. */
  return { slug: m[1]!, rest: m[2]!.replace(/^\/+/, '/') };
}

/** Why an owner cannot invite anybody here: nobody but the owner can sign in, so the link would lead nowhere. */
const INVITES_OFF = 'Nobody else can sign in to this BrainDog yet, so an invitation link would lead nowhere. Start it with BRAINDOG_TOKEN, a session key and a directory first.';

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
  mode: CookieMode | null;
  /** The Directory's sign-in, or `null` where this host holds no sessions: open mode, or nothing to check them with. */
  auth: Auth | null;
  /** The names a browser may reach an open self-host by: loopback at its port, and the configured origin's host. */
  hosts: ReadonlySet<string>;
  origins: ReadonlySet<string>;
  /** `/auth/*`, less the address, which is per request. */
  door: Omit<AuthDoor, 'ip'>;
  /** The key doors: a vault grant's bearer, and this process's key store when it has one. */
  vault: VaultDoor;
  /** The app's own key doors: a browser session on one of this host's origins, and the same key store. */
  keys: KeysDoor<CallContext>;
  /** Spark's ask, `POST /api/spark/read`, built on the first question and kept (`46 §5.2`). */
  spark: SparkAskDoor<CallContext>;
  /** `/in/*`: the arrival door (`49 §5.16`), one record and one process. Its mail half is the half that can be absent. */
  arrivals: IngestDoor;
  /** `/account/*`: the Directory's usage ledger, and the switcher's rows, for a signed-in person. */
  /** The copies kept beside the record file, `<slug>/snapshots/` (`53 §5.4`); absent for a database in memory. */
  snapshots: FileSnapshots | undefined;
  /** Whether the Directory gives this record `slug` as a name it holds now, beside the one the record carries. */
  names: (slug: string) => boolean;
  usage: AccountDoor['usage'];
  records: AccountDoor['records'];
};

/** Who is asking, a refusal, or a bare status; and the cookie the answer carries, when it carries one. */
type Seen =
  | { ctx: CallContext; cookie?: string }
  | { refused: Refusal; cookie?: string }
  | { bare: 421 | 503 }
  | { bare: 429; retryAfter: number };

/** What a bearer comes to: somebody, or a refusal. Never a bare status, because nothing ambient sends one. */
type Known = { ctx: CallContext } | { refused: Refusal };

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
 * `headers.get` RETURNS `''` FOR A HEADER WITH NO VALUE, and `'' !== undefined` — so a bare
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

/**
 * A bearer: the server key, or an agent token. `/api` and `/mcp` both come through here, so a token reaches
 * the same person at the same level through either, and `surface` is only what the token's listing shows as
 * where it was last used.
 */
async function bearerFor(sent: string, site: Site, surface: 'api' | 'mcp', door?: string): Promise<Known> {
  const { api, token } = site;
  /* THE SERVER KEY IS COMPARED IN CONSTANT TIME, `49 §5.4` step 1. `!==` stops at the first byte that
     differs, so how long a wrong guess took said how much of it was right. */
  const isKey = token !== undefined && (await sameKey(sent, token));
  if (isKey) return owner(api, true);

  /* AN AGENT TOKEN IS THE SAME TABLE AND THE SAME CHECK THE WORKER USES. A self-host that recognised only
     one shared string would be a deployment where an agent cannot be given less than everything.
     `includes('.')` tells an agent token from the shared secret, and a shared secret with a dot in it
     matched above and never reaches here. */
  /* A CREDENTIAL THAT MATCHED NOTHING IS REFUSED, and never falls through to open mode: revoking a scoped
     token used to promote it to the owner, and `Authorization: x` on an open self-host was the owner. */
  if (!sent.includes('.')) return { refused: UNKNOWN };
  const seen = await api.kernel.verifyToken(sent, surface);
  if (!seen.ok) return door !== undefined && OPERATION_DOORS.has(door) ? operationFor(sent, api) : { refused: UNKNOWN };

  /* THE PERSON'S LEVEL COMES FROM THE RECORD, never from a constant, so a token outlives nothing its
     holder has lost. NOT ON THIS RECORD IS 403, and a credential this record does not know is 401. */
  const held = api.kernel.access(seen.value.person_id);
  if (!held) return { refused: OFF };
  return {
    ctx: {
      principal: { kind: 'token', id: seen.value.id, scope: seen.value.scope, person: seen.value.person_id, level: held.level },
      ...(held.registers === null ? {} : { registers: held.registers }),
      ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
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

/**
 * An operation bearer (`48 §5.2`): checked and spent by the record, then the approver at the level they hold NOW.
 *
 * MEASURED BEFORE THIS EXISTED (`test/operation-bearer.test.ts`): the bearer `braindog export` had just been handed by
 * `/auth/device/token` was answered 401 "This record does not know that credential." at `/api/export`, because
 * `verifyToken` reads the `token` table and an operation lives in `device_grant`. W55-2 gave the record the check and the
 * gate, and no host built the context between them.
 *
 * `operation` IS WHAT HOLDS IT TO ONE DOOR. `allows` refuses a context carrying it everywhere, and `admin` admits it only
 * for the method it names, so the approver's owner level reaches that one call and nothing a session would reach.
 */
async function operationFor(sent: string, api: Api): Promise<Known> {
  const grant = await api.operationGrant(sent);
  if (!grant.ok) return { refused: UNKNOWN };
  const held = api.kernel.access(grant.value.person);
  if (!held) return { refused: OFF };
  return {
    ctx: {
      principal: { kind: 'person', id: grant.value.person, level: held.level },
      operation: grant.value.method,
      credentialed: true,
      ...(held.registers === null ? {} : { registers: held.registers }),
      ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
    },
  };
}

/**
 * Who is asking, in the order `49 §5.4` gives, amended: a bearer, then the session cookie, then open mode.
 *
 * `host` IS THE `Host` HEADER AS THE SOCKET RECEIVED IT, because in open mode it is the check: a page that
 * rebinds its own name to 127.0.0.1 reaches this port with its own name in `Host`, and gets a 421.
 */
async function contextFor(request: Request, host: string, site: Site, door?: string): Promise<Seen> {
  const { api, token } = site;
  const sent = presented(request);

  /* ONE · A BEARER, which is an agent, the server key or an operation, and never a browser, so the origin checks below
     do not apply to it: nothing ambient sends an `Authorization` header. `door` is the method the path names, the one
     thing an operation bearer is checked against. */
  if (sent !== undefined) return bearerFor(sent, site, 'api', door);

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
    if (!held) return { refused: OFF, ...carried };
    /* AND A COOKIE WRITE MUST COME FROM A PAGE ON THIS ORIGIN (`12 §8` CSRF). `SameSite=Lax` keeps the
       cookie off a cross-site POST; this is the half that does not depend on the browser. */
    if (!SAFE.has(request.method) && !sameOrigin(request, site.origin)) return { refused: CROSS, ...carried };
    return { ctx: sessionContext(out.body, held), ...carried };
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
  return { refused: NONE };
}

/**
 * What delivers one outbox job. The self-host's whole outbound surface, in one function.
 *
 * A record makes no outbound call, so somebody has to — and on a self-host that somebody is this
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
      if (!record) return { ok: false, why: 'This record has not been created, so it holds no key.' };
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
 * arrival is the version with no staleness at all, and measured on this machine on 2026-09-20 a
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
 * the key is built from the path, so every key in the map is one a caller chose. Measured on
 * 2026-09-20 end to end against this server, 1,000 POSTs to `/in/webhook/invented-<n>` cost no
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
 * before the read: measured on 2026-09-20 with four callers in one tick against a file holding a
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
 * Until 22 September every ask carrying a `rec` was answered `null`, on the reasoning that comparing
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
function arrivalDoor(api: Api, spend: (key: string) => number | null, inbound: (() => Promise<string | null>) | null): IngestDoor {
  return {
    verify: async (ask) => {
      if (ask.rec === undefined) return api.ingestVerify({ ingest: ask.ingest });
      const here = api.kernel.identity()?.id;
      if (here === undefined || ask.rec !== here) return null;
      const v = await api.ingestVerify({ ingest: ask.ingest });
      return v?.kind === 'path' ? v : null;
    },
    /* THE RECORD TAKES THE BYTES, THE FLAG AND THE INGEST, AND NOTHING ELSE OF THE URL. `rec` is this
       process's one record and is no fact about the payload. The ingest was dropped here too until
       22 September, and it is what the token was checked against: without it the record offered a
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
  };
}

export type Started = Awaited<ReturnType<typeof start>>;

/**
 * The `Scheduler` port over `setTimeout`.
 *
 * IDENTICAL SEMANTICS TO THE DURABLE OBJECT'S ALARM, which is the point: one alarm, always set to
 * the earliest pending row or not set at all. The Worker gets that from the platform and this gets
 * it from a timer, and the code above the port cannot tell.
 *
 * `wake()` IS NOT A NO-OP HERE. An earlier way of thinking about this made it one — the poller
 * shares the process, so what is there to wake? — and that is exactly wrong: sharing a process is
 * not being woken, and a job that waits fifteen seconds for the next tick when the record already
 * knows it is there is fifteen seconds of latency nobody chose.
 */
function nodeScheduler(run: () => Promise<void>, poll: () => Promise<void>): Scheduler & { stop(): void } {
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
   * is — because "no token" means "one person on one machine", and one machine is `127.0.0.1`.
   */
  host?: string | undefined;
  /** The belt under the doorbell: a tick that catches an abandoned lease. `0` turns it off. */
  pollMs?: number;
  /**
   * The host's key store. `33 §1` port 8, `49 §2`'s `HostDeps.keys`.
   *
   * WITHOUT IT THIS RECORD'S EXPORTS ARE UNSIGNED, and `41 §5.11` step 3 will not import one —
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
  /** A folder of published use cases served read-only under `/app/catalogue/` (`catalogue.ts`), or none. */
  catalogue?: string | undefined;
  /** 32 bytes for the Directory's MACs, derived from the KEK or `BRAINDOG_SESSION_SECRET`. Absent: no sessions. */
  sessionKey?: Uint8Array | undefined;
  /** `BRAINDOG_TRUST_PROXY=1`: count the lockout against the address the proxy saw, not the proxy's own. */
  trustProxy?: boolean | undefined;
  /**
   * Run the scheduled actions, `pull`, `call` and `poll`, on this process's timer (`loop/DIRECTION.md` §0b).
   *
   * OFF UNLESS ASKED, because an action sends a request to somebody else's server, and a test that installs a
   * pack should not. `main.ts` turns it on. `send` and `openKey` are for tests: the defaults are `fetch` and
   * the key store above, and `./actions.ts` says what either may send.
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
   * A model for Spark to draft with (`@braindog/host/spark`): `SPARK_ENDPOINT`, `SPARK_MODEL` and `SPARK_KEY` in the environment
   * when not given. Absent, Spark's own rules draft. The key is the environment's, else the person's own key in the vault
   * labelled `spark`; it is opened on each call and never kept (`spark.ts`). `send` is for tests.
   */
  spark?: SparkConfig | undefined;
  /**
   * How often to ask whether Spark is due its daily look (`sparkTick`, at most once a UTC day, unless the owner turned it off).
   * OFF UNLESS ASKED, as the actions are, so a test that fills a record does not find questions it did not file. `main.ts`
   * asks hourly.
   */
  sparkTickMs?: number | undefined;
  /**
   * Told once, the first time a pass finds `notify.email` jobs waiting on a host that does not deliver them, with how many.
   *
   * BECAUSE THEY WAIT IN SILENCE OTHERWISE. A self-host has no mail transport until W61, so a digest an automation mails
   * is queued `pending` and stays there, which is the honest state (`49 §5.12` note 1: a kind not delivered is never
   * leased), and nothing anywhere said so: measured at 1586f2a2, a job queued before `serve` started was still `pending`
   * with nothing on stderr (`test/webhook-wired.test.ts`). Once per process, because the count is the same news every
   * fifteen seconds. `main.ts` says it on stderr.
   */
  unsentMail?: ((waiting: number) => void) | undefined;
} & (
    | {
        /**
         * What this deployment can actually deliver, and the deliverer that does it.
         *
         * THE TWO TRAVEL TOGETHER BECAUSE THE LIST IS A PROPERTY OF THE DELIVERER. This leased all
         * nine kinds and handed each row to whatever function it was given — so a self-host with no
         * model leased its `infer.embed` rows, threw "nothing in this deployment delivers a
         * infer.embed" at each of them eight times, and dead-lettered them with a suggestion asking
         * somebody to decide about work they never asked for. 49 §5.12 note 1 says the opposite in
         * as many words: "a kind not in `kinds` is never leased, so it waits in `pending` until the
         * host can serve it — a self-host with no model never dead-letters an `infer.embed` row",
         * and §9 has the test.
         *
         * A LIST THAT COULD BE OMITTED WOULD DEFAULT TO ONE OF THE TWO FAILURES — deliver nothing
         * silently, or dead-letter everything loudly — so it cannot be omitted. The Worker states
         * the same list as `DELIVERS` and has always leased only that.
         */
        delivers: readonly OutboxKind[];
        deliver: Deliver;
      }
    | {
        /** Omit both and nothing is delivered — jobs queue and wait, which is honest rather than lossy. */
        delivers?: undefined;
        deliver?: undefined;
      }
  )) {
  /* ONE CLOCK FOR THE RECORD AND THE DIRECTORY. A test that moves it a day forward moves both, which is how
     rotation and the vault's fifteen minutes are tested against a real socket. */
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
    if (sparkTicker) clearInterval(sparkTicker);
    const record = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1')?.id;
    sql.close();
    /* SPARK'S FILE IS CLOSED BEFORE ITS DIRECTORY GOES. On Windows an open SQLite handle holds the file, and
       `rmSync` with `force` then leaves the directory behind without a word. */
    sparkSql.close();
    if (record && ledger) ledger.close(record);
    const at = dirOf(options.file);
    /* EITHER NAME IS THE RECORD'S OWN. `record.dog` is what an installation made before the
       whole-record file was called `record.brain` still holds, and its directory is as much its own
       as a new one's — so removing the record removes the directory in both cases, or a self-host
       that predates the rename leaks a directory nothing will ever open again. */
    const own =
      ['record.brain', 'record.dog'].includes(baseOf(options.file)) &&
      !present(joinPath(at, 'directory.sqlite')) &&
      !present(joinPath(at, 'kek'));
    if (own) removeTree(at, { recursive: true, force: true });
    else
      for (const p of [options.file, `${options.file}-wal`, `${options.file}-shm`, joinPath(at, 'snapshots'), ...(sparkFile ? [sparkFile, `${sparkFile}-wal`, `${sparkFile}-shm`] : [])])
        removeTree(p, { recursive: true, force: true });
  };

  /* The alarm and the record refer to each other: the record arms the alarm after every write, and
     the alarm drains the record when it fires. The scheduler is built first and the record is what
     it drains, which is why this one binding is written before the thing it names exists. */
  let api!: Awaited<ReturnType<typeof createRecordApi>>;
  /* SPARK'S MODEL, when this host points at one; the record files what it drafts through the proposal door or not at all. */
  /* LIFTED OUT OF THE CALL BELOW BECAUSE BOTH PORTS MUST READ ONE CONFIG: the model that drafts an
     arrangement and the engine that answers a question are two features sharing a name (`1f85a49a`), and two
     reads of the environment are two hosts that come to disagree about which one is configured. */
  const sparkConfig = options.spark ?? sparkFromEnv(env);
  const sparkModel = sparkModelFor(sparkConfig, () => api, options.keys);
  /* SPARK'S OWN SQLITE AND NOT THE RECORD'S (`46 §2`): the engine writes its `settings` and `call` tables into
     its own database, beside the record's rather than inside it. */
  /* BESIDE THE RECORD FILE, `<dir>/spark.sqlite`, AS `inbound.token` IS, AND IN MEMORY ONLY WHERE THE RECORD IS.
     This was `:memory:` everywhere, under a comment calling the tables a cache, and they are not one: `call` is
     the only account of what Spark was asked, and `asksUsed` counts the month's meter out of it (`46 §4.1`).
     `loop/research-spark-seam.md` measured the cost: every restart began the month again, so the tier `a` cap was
     a cap per uptime, and the `settings` row an owner chose went back to the defaults. `test/spark-meter-persists`
     asks twice across a restart and reads both rows back.
     THE SNAPSHOTS DO NOT CARRY IT, and that is deliberate: `VACUUM INTO` copies the record, and a restored record
     with no ledger beside it meters from zero, which is the old behaviour on the one path that already loses
     time. `destroy` removes it with the record. */
  const sparkFile = options.file === ':memory:' ? null : joinPath(dirOf(options.file), 'spark.sqlite');
  const sparkSql = openSqlite(sparkFile ?? ':memory:');
  /* WHAT ANSWERS AN AUTOMATION'S QUESTION TO SPARK, from the same config and the same key path as `sparkModel`, so the
     record's `answersSpark` below and `/api/version`'s `spark` are one fact. Before this, a self-host with a model
     refused `ask_spark` at install as if it had none (`test/spark-answers.test.ts`). */
  const answers = sparkAnswersFor(sparkConfig, () => api, options.keys, { sql: sparkSql, clock });

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
     job `done` with no `result`, and the run it answers ends on "Spark answered job ... with no text": measured in
     `test/spark-answers.test.ts`, a deliverer handed every kind was handed the question. Only `serveAsks` in `poll` leases
     it, and only where there is a model to ask. */
  const delivers: readonly OutboxKind[] = (options.delivers ?? []).filter((k) => k !== 'infer.ask' && (!options.actions || k !== 'pull.fetch'));

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
  const act = async (): Promise<void> => {
    if (!options.actions || acting || !ledger) return;
    const record = api.kernel.identity()?.id;
    if (!record) return;
    acting = true;
    try {
      /* A SELF-HOST IS NEVER HELD. Its records are put on `selfhost`, which has no allowance, once per process, and
         again until the Directory knows the record: `init` provisions on that plan, and this covers a record made
         before plans existed. */
      if (planned !== record && ledger.setPlan(record, 'selfhost').ok) planned = record;
      const openKey = options.actions.openKey ?? keyOpener(api, options.keys);
      execute ??= actionExecutor(api, {
        openKey,
        send: options.actions.send,
        resolve: options.actions.resolve,
        rehearseOnThisMachine: options.actions.rehearseOnThisMachine,
      });
      script ??= scriptSandbox(api, { openKey, send: options.actions.send, resolve: options.actions.resolve, now: clock.now });
      /* A CONNECTOR PAGES AND THE EXECUTOR ABOVE CANNOT. Without this the kernel finishes the row
         and meters it `dropped`, which is honest but means no self-host ever runs a connector. */
      paged ??= pagedRunner(api, {
        /* ITS OWN SOCKET AND NOT `shared`'s. `shared` is how a use-case FILE is read from an
           address; borrowing its name service here would mean a test that stubs one silently
           stubs the other. A connector's `send` comes from `actions`, beside the executor's. */
        http: httpFor({ send: options.actions.send }),
        clock: { now: () => Date.now() },
        keys: options.keys,
      });
      /* ONE ADMISSION COUNT FOR ALL THREE, so a record with one run left cannot spend it twice. */
      /* AND IT IS THE RUNTIME'S COUNT, so a trial in its sandbox and this pass cannot each spend the last run. */
      const admissions = pass(IN_FLIGHT);
      let out;
      try {
        out = await api.kernel.runActions(holding(execute, record, ledger.mayRun, admissions), {
          page: holdingPaged(paged, record, ledger.mayRun, admissions),
          script: holdingScript(script, record, ledger.mayRun, admissions),
        });
        await meterPass(ledger.meter, record, out.usage);
      } finally {
        /* A PASS THAT NEVER SETTLES HOLDS ITS RECORD'S RUNS FOR THE LIFE OF THE RUNTIME, so this is in a finally. */
        admissions.settle();
      }
      if (out.fired > 0 || out.ran > 0 || out.dropped > 0) await api.kernel.tail(scheduler);
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
   * ONE PASS AND NOT A LOOP, because the ack rings the doorbell again when anything is left — so a
   * queue that keeps filling is drained by the doorbell rather than by a `while` nobody can stop.
   */
  const poll = async (): Promise<void> => {
    /* NOTHING IS LEASED OR SENT FROM A RECORD THIS BUILD REFUSES, for the reason the doors above refuse it. */
    if (api.kernel.refused()) return;
    await act();
    /* THE QUESTIONS TO SPARK, HERE AND NOT IN `act()`, which returns on its first line when `options.actions` is absent,
       as it is for every embedder and every test that does not pass it; a pass there left a record admitting the step and
       a host that never asked it (`loop/research-infer-ask-next.md` §5). And before the line below, because production's
       `start()` passes no `deliver` (`main.ts`). `serveAsks` catches what `answer` throws; this `try` is for the lease. */
    if (answers && !gone) {
      try {
        await serveAsks(api.kernel, answers, scheduler);
      } catch (e) {
        console.error('spark answers:', e instanceof Error ? e.message : String(e));
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
        await options.deliver(job, postKeys(api, options.keys, job));
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
  /* WHAT THIS PROCESS CAN ACTUALLY DELIVER. With no `deliver`, nothing leaves — jobs queue and
     wait, which is honest — and the doorbell should not ring about them on every write. */
  /**
   * The signer, resolved THE FIRST TIME SOMETHING EXPORTS and not before.
   *
   * IT CANNOT BE BUILT HERE. It needs the record's own id, and `record` is a table the migration
   * makes — which happens inside `createRecordApi`, three lines down. Reading it first threw
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

  /* WHETHER AN INVITATION CAN BE SPENT HERE, known once sign-in is decided below. Until then, and wherever sign-in
     is off, it cannot. */
  let invitesOff: string | null = INVITES_OFF;
  const buildApp = options.build ?? env.BRAINDOG_BUILD ?? '';
  /* THE CATALOGUE NAMED, or the one bundled in the built shell when none is. */
  const catalogueDir = catalogueFolder(options.catalogue, options.shell);
  api = await createRecordApi({
    sql,
    clock,
    scheduler,
    /* `infer.ask` RINGS THE DOORBELL WHERE A MODEL ANSWERS IT, because the doorbell is `poll` and `poll` is where the
       pass runs; without it a queued question waited for the fifteen-second belt, which a test passing `pollMs: 0` has not
       got. The pump's own list leaves it out, above. */
    delivers: [...delivers, ...(options.actions ? (['pull.fetch'] as const) : []), ...(answers ? (['infer.ask'] as const) : [])],
    /* THE RECORD'S SWITCH FOR `ask_spark`, ON EXACTLY WHERE THE PASS ABOVE HAS SOMETHING TO ASK WITH. Off, install refuses
       the step with `NOT_IN_THIS_BUILD` (Brief A's `unserved`), which is the honest answer on a host with no model. */
    answersSpark: answers !== undefined,
    sign,
    invitations: () => invitesOff,
    /* WHAT AN AGENT MAY PROPOSE INSTALLING: the first-party packs and the starter use cases (`catalogue.ts`). */
    catalogue: seedCatalogue(),
    /* A SHARED FILE AT AN ADDRESS IS READ HERE, not in the tab, so a site with no CORS header still installs. */
    readAddress: sharedReader(options.shared),
    /* A DRAFT SCRIPT RUN NOW, WRITING NOTHING (`@braindog/host/script-try`), through the socket, name service and key
       opener a scheduled run's fetch leaves by. ONLY WHEN `actions` IS ON, for its reason: a trial sends a request to
       somebody else's server, and a self-host that was not asked to send any answers `NOT_IN_THIS_BUILD` instead. The
       ledger is the Directory's, opened below, and a trial asked before it is counted by nobody. THE KEY IS OPENED IN
       THE ASKER'S NAME, NOT THE SCHEDULED PASS'S `system` (`askerOf`), so the vault's log can tell her trial from a run. */
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
                 `STALE`). The record works it out from the vault's own gate; left off here, the key stayed shut and the
                 run was told the record holds none, which sent her looking for a key that was there. */
              stale: d.stale,
            });
          },
    /* SPARK'S MODEL, when this host points at one; the record files what it drafts through the proposal door or not at all. */
    sparkModel,
    /* NEWER VERSIONS IN THIS HOST'S CATALOGUE, for Spark to ask about on Decide. */
    ...(catalogueDir === undefined ? {} : { catalogueOffers: catalogueOffersFrom(catalogueDir) }),
    snapshots: kept,
    destroy,
    /* WHAT THIS HOST IS, for `/api/version` (`33 §4`). `BRAINDOG_BUILD` is the same variable name
       the Worker's deploy sets, so the answer has the same shape on both hosts; a self-host started
       from a checkout has none, and the record then says `app: null` rather than inventing one.
       `spark` is whether a model is behind Spark here: an endpoint, and a key to call it with or none needed.
       `host` is for `boot`, so Billing reads that this is a self-host rather than inferring it from the mail door's 404. */
    build: { app: buildApp, spark: sparkModel !== undefined, host: 'self-host' },
  });

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

  /* THE WIRING IS SHARED, not copied. Both hosts call `handlersFor`, so a route cannot exist in one
     and not the other — and it throws at start rather than 404ing in production. */
  const handlers = handlersFor(api);

  /* THE BELT UNDER THE DOORBELL. A lost wake costs latency and never a job, because the row is still
     `pending` — and this tick is what makes that true. It is also what recovers a lease abandoned by
     a process that died holding it. */
  const ticker = options.pollMs === 0 ? null : setInterval(() => void poll(), options.pollMs ?? 15_000);
  ticker?.unref?.();

  /* SPARK'S DAILY LOOK. The record decides whether it is due; this only asks, now and then every `sparkTickMs`. A look that
     throws is logged and waits for tomorrow, because the day was kept before the work. */
  const spark = async (): Promise<void> => {
    if (gone) return;
    try {
      await api.sparkTick();
    } catch (e) {
      console.error('spark:', e instanceof Error ? e.message : String(e));
    }
  };
  const sparkTicker = options.sparkTickMs ? setInterval(() => void spark(), options.sparkTickMs) : null;
  sparkTicker?.unref?.();
  if (sparkTicker) void spark();

  /* Arm from what the record already holds. A record reopened after a week has reminders whose time
     came while nothing was running, and an alarm nobody set is a schedule that never restarts. */
  await api.kernel.tail(scheduler);

  /* LOOPBACK UNLESS THERE IS A TOKEN. `listen(port)` with no host binds every interface, and the
     no-token case above hands `p_self` at `owner` to whoever asks — so a self-host started with no
     `BRAINDOG_TOKEN`, which is the documented way to start one, served the credential index and the
     whole export to anything that could reach the machine. The two decisions are only safe
     together: no token means one person on one machine, and one machine is `127.0.0.1`.

     A deployment that wants a wider bind says so by setting a token, which is the same sentence
     read from the other end. `BRAINDOG_HOST` is the explicit override for the case in between — a
     container that has a token and needs `0.0.0.0` to be reachable at all. */
  const host = options.host ?? (options.token === undefined ? '127.0.0.1' : '0.0.0.0');
  const trustProxy = options.trustProxy === true;
  /* SET THE MOMENT THE PORT IS KNOWN, and nothing is answered before: see below. */
  let site: Site | null = null;
  /* NOTHING A REQUEST CAN DO ENDS THE PROCESS. `void answer(…)` discarded the promise and `answer`
     had no `catch`, so one throw was an unhandled rejection and Node exited — and the first throw is
     before any authentication: `new Request(url, { body })` refuses a body on a GET, so a `GET
     /api/boot` with a `Content-Length` killed the server. A client aborting mid-body did the same.
     The Worker never had this: workerd turns a throw into a 500.

     The 500 says what happened in one sentence and the socket is closed, which is the promise
     `serveApi` makes one layer down and the one this layer was breaking. */
  const answering: RequestListener = (req, res) => {
    /* `/.well-known/braindog-build`, AS THE WORKER ANSWERS IT: which build this process is, before any door and with
       no credential, `null` when it was never told. A deployment is not a record, so a deleted record does not change
       the answer, and a gate comparing hosts reads the same shape from both. */
    if (/^\/+\.well-known\/+braindog-build\/*$/.test(new URL(req.url ?? '/', 'http://localhost').pathname)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ app: buildApp || null }));
      return;
    }
    /* `/healthz` (ROADMAP W55, `53 §13 #9`): `{ ok, app, format, kernel, primitives }` and a 200, or `{ ok, code }` and a
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
      res.end(JSON.stringify({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'This record was deleted. Create another with braindog init.' } }));
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
    void answer(req, res, handlers, site, shell, trustProxy).catch((e: unknown) => {
      const why = e instanceof Error ? e.message : String(e);
      try {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, refusal: { code: 'INTERNAL', fix: `This request could not be read: ${why}.` } }));
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
  const server =
    options.tls === undefined ? createServer(answering) : createTlsServer({ cert: options.tls.cert, key: options.tls.key }, answering);
  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));

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
          /* NO LINK UNTIL THERE IS SMTP. A link printed to a terminal is a link anybody reading the log can spend. */
          magic: false,
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
    vault: vaultDoor(api, options.keys),
    keys: keysDoor(api, options.keys, origins),
    spark: sparkDoor(sparkConfig, () => api, options.keys, { sql: sparkSql, clock }, origins),
    /* ONE BUDGET PER PROCESS, built here so it outlives a request and is shared by every ingest. */
    arrivals: arrivalDoor(api, ingestBudget(clock.now), inboundMail),
    snapshots: kept,
    names: (slug) => {
      const here = api.kernel.identity()?.id;
      return here !== undefined && directory.namesOf(here).some((n) => n.slug === slug && n.released_at === null);
    },
    door: {
      on: 'selfhost',
      origin,
      auth: directory.auth,
      open: token === undefined,
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
              start: ({ ip, reach, label, scope, ua }) =>
                api.deviceStart({ reach, label, ...(scope === undefined ? {} : { scope }), ...(ua === undefined ? {} : { ua }) }, ip),
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
    close: () =>
      new Promise<void>((r) => {
        scheduler.stop();
        if (ticker) clearInterval(ticker);
        if (sparkTicker) clearInterval(sparkTicker);
        server.close(() => (gone || (sql.close(), sparkSql.close()), dirSql.close(), r()));
      }),
  };
}

const json = (status: number, body: object, extra: readonly (readonly [string, string])[] = []): Response => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const [k, v] of extra) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
};

/**
 * The address the lockout counts against: the socket's, or, behind a proxy this host was told to trust
 * (`BRAINDOG_TRUST_PROXY=1`), the last `X-Forwarded-For` entry, which is the one that proxy wrote.
 *
 * THE LAST AND NOT THE FIRST. The first entry is whatever the client sent, and a proxy appends to it rather
 * than replacing it, so counting the first would let anybody lock anybody out by naming them. Without the
 * setting the header is ignored, for the same reason.
 */
function ipOf(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim() : '';
  return forwarded || req.socket.remoteAddress || '';
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
 * the weighing above happens before routing, so measured on 2026-09-20 an 8 MiB POST to
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

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: Record<string, Handler>,
  site: Site | null,
  shell: ((request: Request) => Response) | null,
  trustProxy: boolean,
): Promise<void> {
  const asked = new URL(`http://localhost${req.url ?? '/'}`);
  const method = req.method ?? 'GET';
  const headers = Object.entries(req.headers).map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]);
  if (!site) return write(res, json(503, { ok: false }));

  /* `/app/<slug>/api/<method>` IS `/api/<method>`, READ AT THE ROOT (`loop/research-one-domain.md` §2.4). The web sends
     every record call under a slug there (`apps/web/src/lib/at.ts` `apiBase`), and this handed the path to the shell,
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
  if (/^\/+mcp\/*$/.test(path)) return write(res, await agent(req, url, method, headers, site));

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
  if (/^\/+auth(?:\/|$)/.test(path))
    return write(res, await serveAuth(request, { ...site.door, ip: ipOf(req, trustProxy), reached: req.headers.host ?? '' }));
  /* `/account/*` IS THE DIRECTORY'S TOO, and reads only the session cookie. */
  if (/^\/+account(?:\/|$)/.test(path)) return write(res, await serveAccount(request, { origin: site.origin, auth: site.auth, usage: site.usage, records: site.records }));
  /* `/in/*`: SOMETHING ARRIVES FROM OUTSIDE, AND NOBODY IS ASKED WHO IT IS (`49 §5.16`, `12 §3`).
     It is taken before the `/api` fallback below and not after, because that fallback hands every
     path it does not recognise to the app shell: without this line `POST /in/webhook/x` answered
     `index.html` and a 200, which is worse than a 404 because a sender's retry logic reads it as
     delivered. `serveIngest` holds the whole order, including the 404 for a shape this host does
     not serve, and it is the same function the Worker calls. */
  if (/^\/+in(?:\/|$)/.test(path)) return write(res, await serveIngest(request, site.arrivals));

  if (!/^\/+api(?:\/|$)/.test(path))
    return write(res, shell ? shell(request) : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }));

  /* THE KEY DOORS, BEFORE ANY OTHER CREDENTIAL IS READ: their bearer is a vault grant, which `contextFor` would
     not know, and a cookie or a login token must not reach them at all. AND ONLY AT THE ROOT: a grant names its own
     record, so a slug in front of it would be a second answer to which record, and the Worker refuses the same path in
     the same words (`apps/worker/src/index.ts` `recordApi`). */
  if (servesVault(path))
    return write(
      res,
      named === null
        ? await serveVault(request, site.vault)
        : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The key doors are at /api/vault/, and a grant names its own record.' } }),
    );

  /* THE DOOR IS NAMED ONLY TO A REQUEST THAT COULD WALK THROUGH IT: a POST, under this record's own name. Reading an
     operation grant spends it, and it was read for any method under any slug, so `GET /api/export` spent the grant and
     then `serveApi` answered 405, and `POST /app/not-this-one/api/export` spent it and then the slug was refused 403;
     either way the right request after it was 401 and the person approved on their phone again for nothing
     (`test/operation-grant-doors.test.ts`, audit fifty-seven findings 4 and 5). With no door, an operation bearer on
     those requests is a credential this record does not know, 401, and is still good for the one it was minted for. It
     is not told 403 under a foreign name, because telling it that would mean spending it to learn it is real. */
  const door = method === 'POST' && !foreign ? /^\/+api\/+([A-Za-z]+)\/*$/.exec(path)?.[1] : undefined;
  const seen = await contextFor(request, req.headers.host ?? '', site, door);
  /* A NAME THAT IS NOT THIS RECORD'S, TO A CALLER THIS HOST KNOWS. One record is served here, so no credential reaches
     another, and the sentence is the Directory's for a name that is not yours, whether or not it names anything. A
     caller it does not know falls through to the root's own refusal below, which never reaches the record. */
  if (foreign && 'ctx' in seen) return write(res, json(403, { ok: false, refusal: NOT_ON }), seen.cookie);
  /* THE SESSION HEADERS ON EVERY DOOR, checked: the record reads a token's and ignores anybody else's. */
  /* A KEPT COPY AS THE FILE IT IS (`49 §5.13`): `GET /api/snapshots/<id>`, for whoever `snapshots` answers. */
  const copyAsked = /^\/+api\/+snapshots\/+([^/]+)\/*$/.exec(path);
  if (copyAsked && method === 'GET' && 'ctx' in seen) return write(res, await copyOf(decodeURIComponent(copyAsked[1]!), seen.ctx, site), seen.cookie);
  /* AND THE APP'S OWN KEY DOORS, AFTER THE SESSION AND NOT BEFORE IT, which is the whole difference between them
     and `/api/vault/*` above: those take a bearer `contextFor` would not know, and these take the session it just
     worked out. `serveKeys` refuses a bearer and any origin this host does not answer for; who the session is
     stays the record's question. */
  if ('ctx' in seen) {
    const ctx = withSession(seen.ctx, sessionOf(request.headers));
    /* SPARK AHEAD OF THE KEY DOORS AND BOTH AHEAD OF `serveApi`, because `serveApi` answers anything it does
       not know as `ROUTE_UNKNOWN`, which is what `POST /api/spark/read` got until this line existed. */
    const out = servesSpark(path)
      ? await serveSpark(request, site.spark, ctx)
      : servesKeys(path)
        ? await serveKeys(request, site.keys, ctx)
        : await serveApi(request, handlers, ctx);
    return write(res, out, seen.cookie);
  }
  /* AND THE STATUS COMES FROM THE SHARED TABLE. This answered one status for three different facts —
     a credential nobody minted, a credential belonging to somebody who is not on the record, and a
     record with no owner who may act — so a client could not tell which of the three to do something
     about. `httpStatus` is the same function the Worker uses, which is what keeps one record from
     behaving differently depending on where it runs. */
  if ('refused' in seen) {
    const out = { ok: false as const, refusal: seen.refused };
    return write(res, json(httpStatus(out), out), seen.cookie);
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
    const out = { ok: false as const, refusal: { code: 'OUT_OF_BOUNDS', fix: `${id} is not one of the copies this record keeps.`, at: 'id' } };
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
 * `POST /mcp`, for an agent's MCP client (`loop/research-agent-path.md` §1.3, §1.7).
 *
 * NOTHING OF THE BODY IS READ UNTIL THE BEARER IS KNOWN. What the headers can refuse, and the bearer, are
 * decided on a request with no body at all; the socket's bytes become one only for a caller this record knows.
 *
 * A BEARER AND NOTHING ELSE: the path `/api` takes for one, and nothing that path falls back to. The cookie is
 * never read and open mode never applies, because an agent carries its own credential and a browser has the app.
 */
async function agent(req: IncomingMessage, url: string, method: string, headers: [string, string][], site: Site): Promise<Response> {
  const head = new Request(url, { method, headers });
  const early = gate(head);
  if (early) return early;
  const sent = presented(head);
  const seen = sent === undefined ? null : await bearerFor(sent, site, 'mcp');
  if (seen === null) return unauthorized();
  if ('refused' in seen) {
    /* A credential this record does not know is the transport's 401. One it knows, for somebody no longer on
       the record or a record nobody may act on, gets the status and the sentence `/api` gives. */
    if (seen.refused.code === 'UNAUTHORIZED') return unauthorized();
    const out = { ok: false as const, refusal: seen.refused };
    return json(httpStatus(out), out);
  }
  /* The session headers, then `_meta.session` over them key by key, both checked the same way. */
  return serveMcp(new Request(url, { method, headers, body: bodyOf(req), duplex: 'half' }), site.api, withSession(seen.ctx, sessionOf(head.headers)), {
    session: (ctx, said) => withSession(ctx, hintsOf(said)),
  });
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
