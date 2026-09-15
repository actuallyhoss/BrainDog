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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { argv, env, exit } from 'node:process';

import { handlersFor, hintsOf, httpStatus, serveApi, serveVault, servesVault, sessionOf, withSession, type Handler, type VaultDoor } from '@braindog/host';
import {
  clearCookie,
  cookieMode,
  readSid,
  relyingParty,
  sameKey,
  sameOrigin,
  serveAuth,
  sessionContext,
  sessionCookie,
  type AuthDoor,
  type CookieMode,
} from '@braindog/host/auth';
import { gate, serveMcp, unauthorized } from '@braindog/mcp/http';
import type { OutboxKind, OutboxRow, Signer } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';
import { createDirectory, type Directory } from '@braindog/record/directory';
import type { Auth, Param, Refusal, Row, Scheduler, Sql } from '@braindog/ports';

import type { KeyStore } from './keys.ts';
import { shellOf } from './shell.ts';
import { signerFor } from './sign.ts';
import { vaultDoor } from './vault.ts';

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
/** A credential this record does not know, or none where one is needed. 401 — `49 §5.4` step 1. */
const UNKNOWN: Refusal = { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' };

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
async function bearerFor(sent: string, site: Site, surface: 'api' | 'mcp'): Promise<Known> {
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
  if (!seen.ok) return { refused: UNKNOWN };

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
 * Who is asking, in the order `49 §5.4` gives, amended: a bearer, then the session cookie, then open mode.
 *
 * `host` IS THE `Host` HEADER AS THE SOCKET RECEIVED IT, because in open mode it is the check: a page that
 * rebinds its own name to 127.0.0.1 reaches this port with its own name in `Host`, and gets a 421.
 */
async function contextFor(request: Request, host: string, site: Site): Promise<Seen> {
  const { api, token } = site;
  const sent = presented(request);

  /* ONE · A BEARER, which is an agent or the server key and never a browser, so the origin checks below do
     not apply to it: nothing ambient sends an `Authorization` header. */
  if (sent !== undefined) return bearerFor(sent, site, 'api');

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
  return { refused: UNKNOWN };
}

/**
 * What delivers one outbox job. The self-host's whole outbound surface, in one function.
 *
 * A record makes no outbound call, so somebody has to — and on a self-host that somebody is this
 * process, after the transaction committed. It returns nothing on success and throws on failure,
 * because the retry ladder is the record's and a deliverer that decided its own retries would be the
 * second ladder [09-ALARMS] spends a paragraph forbidding.
 */
export type Deliver = (job: OutboxRow) => Promise<void>;

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
  /** The built app to serve for every path that is not `/api`, `/auth` or `/mcp`. Absent: those paths are 404. */
  shell?: string | undefined;
  /** 32 bytes for the Directory's MACs, derived from the KEK or `BRAINDOG_SESSION_SECRET`. Absent: no sessions. */
  sessionKey?: Uint8Array | undefined;
  /** `BRAINDOG_TRUST_PROXY=1`: count the lockout against the address the proxy saw, not the proxy's own. */
  trustProxy?: boolean | undefined;
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
  const shell = options.shell === undefined ? null : shellOf(options.shell);

  const sql = openSqlite(options.file);
  const dirSql = openSqlite(options.directory ?? ':memory:');

  /* The alarm and the record refer to each other: the record arms the alarm after every write, and
     the alarm drains the record when it fires. The scheduler is built first and the record is what
     it drains, which is why this one binding is written before the thing it names exists. */
  let api!: Awaited<ReturnType<typeof createRecordApi>>;

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

  /**
   * Lease, deliver, ack. One pass.
   *
   * ONE PASS AND NOT A LOOP, because the ack rings the doorbell again when anything is left — so a
   * queue that keeps filling is drained by the doorbell rather than by a `while` nobody can stop.
   */
  const poll = async (): Promise<void> => {
    if (!options.deliver) return;
    let jobs: OutboxRow[];
    try {
      jobs = api.kernel.leaseOutbox(options.delivers, 10);
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
        await options.deliver(job);
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
  let resolved: Signer | null | undefined;
  const sign: Signer = async (bytes) => {
    if (resolved === undefined) {
      const identity = sql.one<{ id: string }>('SELECT id FROM record WHERE singleton = 1');
      resolved = options.keys && identity ? await signerFor(sql, options.keys, identity.id) : null;
    }
    return resolved ? resolved(bytes) : null;
  };

  api = await createRecordApi({
    sql,
    clock,
    scheduler,
    delivers: options.delivers ?? [],
    sign,
    /* WHAT THIS HOST IS, for `/api/version` (`33 §4`). `BRAINDOG_BUILD` is the same variable name
       the Worker's deploy sets, so the answer has the same shape on both hosts; a self-host started
       from a checkout has none, and the record then says `app: null` rather than inventing one.
       No `SPARK_ENDPOINT`: `31 §2` has this host at rank 21 and `spark` at 13 and unbuilt, so
       claiming a Spark here would be claiming something nothing serves. */
    build: { app: options.build ?? env.BRAINDOG_BUILD ?? '', spark: false },
  });

  const refused = api.kernel.refused();
  if (refused) {
    console.error(`${refused.code}: ${refused.fix}`);
    exit(1);
  }

  /* THE WIRING IS SHARED, not copied. Both hosts call `handlersFor`, so a route cannot exist in one
     and not the other — and it throws at start rather than 404ing in production. */
  const handlers = handlersFor(api);

  /* THE BELT UNDER THE DOORBELL. A lost wake costs latency and never a job, because the row is still
     `pending` — and this tick is what makes that true. It is also what recovers a lease abandoned by
     a process that died holding it. */
  const ticker = options.pollMs === 0 ? null : setInterval(() => void poll(), options.pollMs ?? 15_000);
  ticker?.unref?.();

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
  const server = createServer((req, res) => {
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
  });
  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));

  /* THE ORIGIN IS KNOWN ONLY NOW, when the port is, and `port: 0` is how every test starts one. Nothing
     between here and `site = …` awaits, so no request is answered before it is set. */
  const port = (server.address() as AddressInfo).port;
  const origin = new URL(options.origin ?? `http://localhost:${port}`).origin;
  const mode = cookieMode(origin);
  const rp = relyingParty(origin);

  /* WHY NOBODY SIGNS IN FROM THE APP, when nobody does: open mode has nobody to sign in as, no directory has
     nobody at all, an origin no cookie can be set on has nowhere to keep a session, and no session key has
     nothing to check one with. `null` is sign-in on. */
  const key = options.sessionKey;
  const token = options.token;
  const off: 'open' | 'directory' | 'insecure' | 'key' | null = token === undefined ? 'open' : options.directory === undefined ? 'directory' : mode === null ? 'insecure' : key === undefined ? 'key' : null;
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
        }
      : undefined,
  );
  const loopback = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
  site = {
    api,
    token,
    origin,
    mode,
    auth: off === null ? directory.auth : null,
    hosts: new Set([...loopback, new URL(origin).host]),
    origins: new Set([...loopback.map((h) => `http://${h}`), origin]),
    vault: vaultDoor(api, options.keys),
    door: {
      on: 'selfhost',
      origin,
      auth: directory.auth,
      open: token === undefined,
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
    signIn: { origin, ways, off },
    close: () =>
      new Promise<void>((r) => {
        scheduler.stop();
        if (ticker) clearInterval(ticker);
        server.close(() => (sql.close(), dirSql.close(), r()));
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

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: Record<string, Handler>,
  site: Site | null,
  shell: ((request: Request) => Response) | null,
  trustProxy: boolean,
): Promise<void> {
  const url = `http://localhost${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  const headers = Object.entries(req.headers).map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]);
  if (!site) return write(res, json(503, { ok: false }));

  /* FOUR DOORS, AND THEY ARE `33 §4`'S: sign-in, an agent's MCP client, the record, and the app for everything
     else. The app is what makes `/signin` the same origin as the cookie it asks for. `/mcp` is taken before a
     byte of the body is read, because it reads the body only for a bearer it knows. */
  const path = new URL(url).pathname;
  if (/^\/+mcp\/*$/.test(path)) return write(res, await agent(req, url, method, headers, site));

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = new Request(url, { method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
  /* `reached` IS THE `Host` THE SOCKET GOT, so a device that called this process by another name is not told to
     approve itself at the configured origin. */
  if (/^\/+auth(?:\/|$)/.test(path))
    return write(res, await serveAuth(request, { ...site.door, ip: ipOf(req, trustProxy), reached: req.headers.host ?? '' }));
  if (!/^\/+api(?:\/|$)/.test(path))
    return write(res, shell ? shell(request) : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }));

  /* THE KEY DOORS, BEFORE ANY OTHER CREDENTIAL IS READ: their bearer is a vault grant, which `contextFor` would
     not know, and a cookie or a login token must not reach them at all. */
  if (servesVault(path)) return write(res, await serveVault(request, site.vault));

  const seen = await contextFor(request, req.headers.host ?? '', site);
  /* THE SESSION HEADERS ON EVERY DOOR, checked: the record reads a token's and ignores anybody else's. */
  if ('ctx' in seen) return write(res, await serveApi(request, handlers, withSession(seen.ctx, sessionOf(request.headers))), seen.cookie);
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
