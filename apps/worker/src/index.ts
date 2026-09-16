/**
 * The Worker, and the Durable Object a record lives in.
 *
 * NAMING IS PROVISIONING. `01-ARCHITECTURE` §2's whole argument in one line:
 * `env.RECORD.idFromName(slug)` and the object exists. There is no control-plane call to make, no
 * id to store, no half-created tenant to clean up after a signup that failed at the wrong moment —
 * which is what a database per customer costs, and it costs it at the worst time.
 *
 * ONE OBJECT PER CUSTOMER, and the two properties that follow are the reason the whole design
 * hangs off it. Writes are serialised by construction, because an object is single-threaded — so
 * the kernel's `transactionSync` is genuinely atomic rather than optimistically so. And the numbers
 * a person says out loud stay small: in a shared database the second customer's first task is
 * #4,732.
 *
 * THE WORKER ITSELF IS A ROUTER AND NOTHING ELSE. It resolves a slug to an object and forwards. It
 * holds no record logic, because a check in the router is a check the CLI can be pointed around
 * (`30-BLUEPRINT` §10) — and every route it serves comes from `handlersFor`, shared with the
 * self-host, so the two cannot drift.
 */

import { DurableObject } from 'cloudflare:workers';

import { handlersFor, hintsOf, serveApi, withSession, type SessionHints, type VaultGrantSeen } from '@braindog/host';
import { deriveSessionKey, relyingParty, serveAccount, serveAuth, type DeviceDoor, type InviteDoor, type Provisioned } from '@braindog/host/auth';
import { gate, serveMcp as answerMcp, unauthorized as unknownAgent } from '@braindog/mcp/http';
import { INVITE_GONE, ulids, type CreateRecordArgs, type DeviceCode, type Exchanged, type OutboxRow, type VaultGrant, type Waiting } from '@braindog/kernel';
import { createRecordApi, type CallContext, type Deposited, type Limited, type OpenedForGrant, type RecordApi, type SealTarget, type Sealed } from '@braindog/record';
import { fixOf, ok, refused } from '@braindog/ports';
import type { Auth, AuthCall, AuthResult, Param, Refusal, Result, Row, Scheduler, Sql, Who } from '@braindog/ports';

import { createDirectory, type AccountUsage, type Directory as Dir, type RunUsage } from '@braindog/record/directory';

import { ALARM_RUNS, actionExecutor, holding, keyOpener, meterPass } from './actions.ts';
import { alarmScheduler } from './alarm.ts';
import { DELIVERS, makeDeliver } from './deliver.ts';
import { consume, pump } from './pump.ts';
import { inward, isRecordId, servesAccount, servesApi, servesAuth, servesBuild, servesMcp } from './route.ts';
import { bearerOf, doorOf, withCookie, type BearerDeps } from './session.ts';
import { isBound, keyStoreOf, recordKeys, type KekBinding } from './keys.ts';
import { serveWorkerKeys, serveWorkerVault, servesKeys, servesVault, type KeyDeps } from './vault.ts';

/** Why an owner cannot invite anybody here: an invitation is spent by signing in, and sign-in needs its secret. */
const INVITES_OFF = 'Sign-in is off on this host until SESSION_SECRET is set, so an invitation link would lead nowhere.';

/** An address that can already sign in: a person with a passkey, or with a record. */
const KNOWN_ADDRESS = `SELECT 1 AS x FROM dir_person p WHERE lower(p.email) = lower(?)
  AND (EXISTS (SELECT 1 FROM dir_passkey k WHERE k.person = p.id) OR EXISTS (SELECT 1 FROM dir_member m WHERE m.person = p.id))`;

/**
 * Cloudflare's `send_email` binding. `from` is the sender Email Service needs; sign-in mail sets it from
 * `AUTH_MAIL_FROM`, and the outbox's `notify.email` does not pass one yet.
 */
type EmailBinding = { send(message: { from?: string; to: string; subject: string; text: string }): Promise<void> };

type Env = {
  RECORD: DurableObjectNamespace<Record$>;
  DIRECTORY: DurableObjectNamespace<Directory$>;
  /** The doorbell. Its message is `{ record }` and never a payload — 51 §13 D16. */
  INGRESS: Queue<{ record: string }>;
  EMAIL?: EmailBinding;
  /**
   * `<date>+<sha>`, overwritten at deploy time by `--var`, declared empty in `wrangler.jsonc`.
   *
   * IT IS DECLARED SO THE FAILURE IS `""`. An undefined binding is a crash at cold start on a
   * deploy that forgot the flag; an empty string is a value `deploy-parity` reads and rejects
   * (`52 §13 #17`), which is a red gate rather than a dead record.
   */
  BRAINDOG_BUILD?: string;
  /** Empty when no Spark is wired, so `/api/spark/*` is not routed at all (`33 §4`). */
  SPARK_ENDPOINT?: string;
  /**
   * The one record an anonymous GET reads, for the public demo, or empty for none. `demoRecord` in
   * `route.ts` is the whole of what it opens. Declared empty in `wrangler.jsonc`, like
   * `BRAINDOG_BUILD`, so the key exists and an unset deploy is `""` rather than a missing binding.
   */
  DEMO_RECORD?: string;
  /**
   * The Directory's MAC key: a secret, `wrangler secret put SESSION_SECRET --env <environment>`, 32 random
   * bytes or more and a different value per environment. Unset or shorter, and sign-in is off:
   * `/auth/methods` says `not-configured` and every other `/auth` route is 404. Changing it signs everybody out.
   */
  SESSION_SECRET?: string;
  /** The operator's bearer for `/auth/provision` and `/auth/claim/mint`, a secret too. Unset: both are 404. */
  PROVISION_KEY?: string;
  /**
   * The root key agents' keys are wrapped under, `12 §6`: 32 bytes written as 64 hex characters or base64url, put with
   * `wrangler secret put KEK --env <environment>`, or a Secrets Store binding of the same name. A different value per
   * environment. Unset, and the key doors answer `NOT_IN_THIS_BUILD` and provisioning makes records without wrapped
   * keys, as before. Set, and every record provisioned from then on is made with its three keys wrapped under it.
   * `keys.ts` is the only reader.
   */
  KEK?: KekBinding;
  /** The sender for sign-in links, on a domain Email Service sends for. Empty, or no `EMAIL`, and there are no links. */
  AUTH_MAIL_FROM?: string;
  /** The app's host name: the cookie's origin, the passkeys' relying party, and what a cookie write must come from. */
  PUBLIC_HOST?: string;
};

/** A `Result`'s refusal, for an RPC that hands back only the part a caller acts on. */
const refusalOf = (r: Result<unknown>): Refusal => (refused(r) ? r.refusal : { code: 'RECORD_UNAVAILABLE', fix: fixOf(r) });

/** The `Sql` port over the Durable Object's own SQLite. Storage in the same thread as the code. */
function storageSql(storage: DurableObjectStorage): Sql {
  const sql = storage.sql;
  let depth = 0;
  return {
    exec: (text: string, ...params: Param[]) => void sql.exec(text, ...(params as never[])),
    all: <T = Row>(text: string, ...params: Param[]) => sql.exec(text, ...(params as never[])).toArray() as T[],
    one: <T = Row>(text: string, ...params: Param[]) =>
      (sql.exec(text, ...(params as never[])).toArray() as T[])[0],
    /**
     * `transactionSync`, and the nesting guard is here for the same reason it is in the Node
     * adapter: a rule writing a row from inside a write shares its caller's transaction, and a
     * second BEGIN is an error rather than a savepoint (`33-CONTRACTS` §1).
     */
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      depth++;
      try {
        return storage.transactionSync(fn);
      } finally {
        depth--;
      }
    },
  };
}

/**
 * The record's `/mcp`, with `_meta.session` checked as the session headers were and put on the context
 * over them, key by key. The headers' hints are already on `ctx`: `inward` put them there.
 */
const serveMcp = (request: Request, api: RecordApi, ctx: CallContext): Promise<Response> =>
  answerMcp(request, api, ctx, { session: (c, said) => withSession(c, hintsOf(said)) });

/** One customer's record. The class name is `Record$` because `Record` is a TypeScript builtin. */
export class Record$ extends DurableObject<Env> {
  #api: Promise<RecordApi> | null = null;

  /**
   * The `Scheduler` port over this object's own alarm. One per customer, and this is the one.
   *
   * AND ITS DOORBELL RINGS THE QUEUE. `wake()` is the one piece of I/O a record performs, and it
   * carries the object's own id and nothing else: a message that copied a notification would be a
   * second copy of something that may have changed by the time it is read. A lost message costs
   * latency and never a notification, because the row is still `pending` and the next wake drains
   * it — the outbox is the source of truth and the queue is a doorbell.
   */
  #alarm: Scheduler = alarmScheduler(this.ctx.storage, () =>
    this.env.INGRESS.send({ record: this.ctx.id.toString() }),
  );

  /**
   * The migration runs under `blockConcurrencyWhile`, which is the platform's word for "no request
   * is answered until this finishes". A record that answers a read while its schema is half applied
   * is a record that returns rows nobody can interpret.
   */
  #record(): Promise<RecordApi> {
    /* AND A REJECTED PROMISE IS NOT A CACHED ANSWER. `??=` stored whatever the opener returned,
       including a rejection — so one transient failure at cold start (a queue hiccup in the tail, a
       storage read that timed out) was remembered as this record's permanent state, and every
       request until the object was evicted got the same stale error for a condition that had
       passed. Forgetting a failure is what makes the next request a retry rather than an echo. */
    this.#api ??= this.#open().catch((e: unknown) => {
      this.#api = null;
      throw e;
    });
    return this.#api;
  }

  /** Migrate, then arm. Both before any request is answered, which is what the block is for. */
  async #open(): Promise<RecordApi> {
    let api!: RecordApi;
    await this.ctx.blockConcurrencyWhile(async () => {
      api = await createRecordApi({
        sql: storageSql(this.ctx.storage),
        clock: { now: () => Date.now() },
        scheduler: this.#alarm,
        /* WHAT THIS DEPLOYMENT IS, because the record cannot know. `/api/version` answers `33 §4`'s
           six keys and two of them are facts about the host: which build is serving, and whether
           there is a Spark behind it. An empty `BRAINDOG_BUILD` becomes `null` rather than `""` —
           the record says "I was not told" and `deploy-parity` reads a missing build instead of
           comparing against the empty string and finding it merely unequal. */
        build: {
          app: this.env.BRAINDOG_BUILD ?? '',
          spark: Boolean(this.env.SPARK_ENDPOINT),
        },
        /* WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER, so the doorbell rings for work somebody can
           do. A kind with no deliverer sits `pending` for ever — which is honest — and without
           this every write afterwards rang the queue about it. */
        delivers: DELIVERS,
        /* AN INVITATION IS SPENT BY SIGNING IN, and nobody signs in here without the Directory's key. */
        invitations: () => ((this.env.SESSION_SECRET ?? '').length >= 32 ? null : INVITES_OFF),
      });

      /* ARM FROM WHAT THE RECORD ALREADY HOLDS, INSIDE THE BLOCK. An object is evicted between
         requests and its alarm survives that — but a record restored from a backup, or one whose
         alarm a `deleteAll` took with it, would otherwise wait for a write it may never get. It sat
         outside, so a request could be answered by a record whose schedule was not yet armed.

         AND ITS FAILURE IS NOT THE RECORD'S. The tail is belt-and-braces — every write arms the
         alarm on its way out — so a doorbell that would not ring is a late notification, and
         letting it through here would have been a record that refuses to open at all. */
      if (!api.kernel.refused())
        try {
          await api.kernel.tail(this.#alarm);
        } catch (e) {
          console.error('tail:', e instanceof Error ? e.message : String(e));
        }
    });
    return api;
  }

  /**
   * The alarm fired: drain everything due, then re-arm.
   *
   * RE-ARMING IS IN A `finally` INSIDE `drain`, and that is the single most important line in this
   * subsystem: a handler that throws before re-arming stops the customer's entire schedule forever,
   * and nothing anywhere says so. A hundred claimed rows leave the minimum still in the past, so the
   * alarm is set to now and the next fire drains the rest.
   */
  override async alarm(): Promise<void> {
    const api = await this.#record();
    await api.kernel.drain(this.#alarm);
    await this.#act(api);
  }

  /**
   * The scheduled actions due on this record: `pull`, `call` and `poll`, sent from this alarm (`09 §1`).
   *
   * AFTER THE DRAIN, so a row the drain just fired is a job this pass leases, and a retry the drain just released is
   * one too. `ALARM_RUNS` keeps one alarm inside `research-scheduled-actions` §2.3's ceilings, and `runActions` tails
   * the alarm when it is done, so work left over sets the next one.
   *
   * THE KEY STORE ONLY WHEN `KEK` IS BOUND. Unbound, an action that names a key sends nothing and its run event says
   * why in one sentence (`actions.ts`).
   *
   * A PASS THAT THROWS IS LOGGED AND NOT RETHROWN. The drain has already re-armed, and a throwing `alarm()` is
   * retried by the platform, which would run the drain again for a failure that was the network's.
   */
  async #act(api: RecordApi): Promise<void> {
    if (api.kernel.refused()) return;
    const record = api.kernel.identity()?.id;
    if (!record) return;
    try {
      /* THE DIRECTORY'S LEDGER, OVER RPC: asked before each run, and told every run the pass metered. A record on the
         hosted plan at its monthly allowance answers `held`, sends nothing, and waits for the first of next month. */
      const ledger = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
      const inner = actionExecutor(() => api.kernel.actionOrigins(), { openKey: keyOpener(api, this.env.KEK) });
      const execute = holding(inner, record, (r, action, pending) => ledger.mayRun(r, action, pending));
      const out = await api.kernel.runActions(execute, { limit: ALARM_RUNS, scheduler: this.#alarm });
      await meterPass((r, run) => ledger.meter(r, run), record, out.usage);
    } catch (e) {
      console.error('actions:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Claim outbox jobs for the Worker to deliver.
   *
   * THE LEASE IS THE RECORD'S AND THE DELIVERY IS THE HOST'S, and the seam is exactly here. The
   * record holds the ladder, the attempt count and the dead letter; the Worker holds the network
   * and the credentials. Doing the I/O inside the object would give the record a reason to hold a
   * key, and `ADR-062` is the argument for why it must not.
   */
  async lease(n = 10): Promise<OutboxRow[]> {
    const api = await this.#record();
    return api.kernel.leaseOutbox(DELIVERS, n);
  }

  /**
   * A bearer, checked against this record's own table.
   *
   * THE RECORD VERIFIES AND THE WORKER ROUTES, and the split is the whole of why the bearer carries
   * the record id: only the object holding that table can say whether the hash is in it, and asking
   * anywhere else would be a search across every customer.
   */
  async verify(bearer: string, surface: string): Promise<{ id: string; person_id: string; scope: string } | null> {
    const api = await this.#record();
    const out = await api.kernel.verifyToken(bearer, surface);
    return out.ok ? out.value : null;
  }

  /**
   * What this person may do inside this record, or `null` if they are not on it.
   *
   * THE RECORD'S OWN `member` TABLE, which is the table `invite` writes and the one that travels in
   * a `.brain` file. `registers` is the ceiling and `null` is all of them.
   */
  async access(
    person: string,
  ): Promise<{ level: string | null; registers: string[] | null; levels: Record<string, string> } | null> {
    const api = await this.#record();
    return api.kernel.access(person);
  }

  /**
   * The switcher's `ask`: what this person may do here, and what this record calls itself.
   *
   * BOTH FROM THIS RECORD'S OWN TABLES, and neither is a second copy of a fact held elsewhere:
   * `access` above is the same `member` table read the same way, and `kernel.identity()` is what
   * `boot` names the record by. The Directory cannot answer either question about a record that is
   * not itself.
   */
  async switcherRow(person: string): Promise<{ level: string | null; name: string | null }> {
    const api = await this.#record();
    return { level: api.kernel.access(person)?.level ?? null, name: api.kernel.identity()?.name ?? null };
  }

  /**
   * Make this record: its identity, its owner and the owner's membership. The operator's provisioning only.
   *
   * AN RPC AND NEVER A ROUTE. `createRecord` is INTERNAL, because whoever calls it becomes the owner, and the
   * only way here is `/auth/provision`, behind the operator key. `null` is made.
   */
  async create(args: CreateRecordArgs): Promise<Refusal | null> {
    const api = await this.#record();
    const made = await api.createRecord(args);
    return made.ok ? null : refusalOf(made);
  }

  /**
   * A device asks to sign in to this record, counted against its address. `/auth/device` is the only way here.
   *
   * AN RPC AND NEVER A ROUTE, like `create`: `deviceStart` and `devicePoll` are INTERNAL, because the device has
   * no credential to check yet.
   */
  async deviceStart(args: { reach: string; label: string; ua?: string; scope?: string }, ip: string): Promise<Result<DeviceCode> | Limited> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.deviceStart(args, ip);
  }

  /** The device asks again, and once approved takes its bearer, once. `/auth/device/token` only. */
  async devicePoll(args: { device_code: string }): Promise<Result<Waiting | Exchanged>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.devicePoll(args);
  }

  /** A vault grant's bearer, checked for the key doors. AN RPC AND NEVER A ROUTE: `vaultGrant` is INTERNAL. */
  async vaultGrant(bearer: string): Promise<Result<VaultGrant>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.vaultGrant(bearer);
  }

  /** The fingerprint this record's vault is wrapped by, or `null` for a record made before the key store was bound. */
/**
   * An invitation link: looked at with a token alone, or spent for the person `/auth/invite` has just made or signed in.
   *
   * AN RPC AND NEVER A ROUTE, like `create`: whoever calls it with a person puts that person on this record.
   */
  async acceptInvite(args: { token: string; person?: { id: string; email: string } }): Promise<Result<unknown>> {
    const api = await this.#record();
    return api.acceptInvite(args);
  }

    async wrappingKey(): Promise<string | null> {
    const api = await this.#record();
    return api.kernel.refused() ? null : api.kernel.wrappingKey();
  }

  /**
   * A key deposited through a key door. AN RPC AND NEVER A ROUTE: `depositGrant` is INTERNAL.
   *
   * `by` IS A VAULT GRANT OR A BROWSER SESSION, and which one it is decides what the record allows. The Worker
   * checked one or the other before calling; the gate itself is the record's, in `depositGrant`.
   *
   * `seal` IS THE WORKER'S, CALLED BACK OVER RPC. The value stays in the Worker's closure and this object receives
   * only the sealed bytes `seal` returns, which is ADR-062 across the RPC boundary.
   */
  async depositGrant(
    args: { label?: unknown; opens?: unknown; kind?: unknown; project?: unknown; credential?: unknown },
    by: VaultGrant | CallContext,
    hints: SessionHints,
    seal: (target: SealTarget) => Promise<Result<Sealed>>,
  ): Promise<Result<Deposited>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.depositGrant(args, by, hints, seal);
  }

  /** A key's sealed material, for the Worker to open. AN RPC AND NEVER A ROUTE: `openForGrant` is INTERNAL. */
  async openForGrant(args: { label?: unknown; credential?: unknown }, by: VaultGrant | CallContext, hints: SessionHints, kekId: string): Promise<Result<OpenedForGrant>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.openForGrant(args, by, hints, kekId);
  }

  /** How it went. The ladder walks from here, and a failed ack arms the `retry` row that tails. */
  /**
   * How it went, and which lease it is about.
   *
   * `leasedUntil` IS THE FENCE. Without it a stale ack completes somebody else's lease and one
   * delivery becomes eight; the record refuses one that names a lease it no longer holds.
   */
  async ack(done: { id: string; state: 'done' | 'failed'; error?: string; leasedUntil?: string }): Promise<void> {
    const api = await this.#record();
    api.kernel.ackOutbox(done);
    /* THE TAIL, because a failed ack writes a `retry` row and nothing else here would notice it —
       on an idle record `pendingWork()` would say there is work and the alarm would say `null`. */
    await api.kernel.tail(this.#alarm);
  }

  /**
   * THESE TWO GO THROUGH `json()` LIKE EVERY OTHER ANSWER THIS FILE WRITES.
   *
   * They were built by hand with a content-type and nothing else, and `route()` returns what this
   * object hands back unchanged, so they were the only two answers on the whole surface without
   * `no-store` on them: every other one either comes out of `serveApi`, which sets it, or out of
   * the helper below, which was written for exactly this rule and which these two predate. The
   * blast radius is smaller than for the router's 401, because neither 401 nor 503 is
   * heuristically cacheable and it takes an intermediary configured to store them. It is still the
   * rule stated 130 lines down, broken in the two places the sentence did not reach.
   */
  override async fetch(request: Request): Promise<Response> {
    const api = await this.#record();

    const refused = api.kernel.refused();
    if (refused) return json({ ok: false, refusal: refused }, 503);

    /* The context arrives from the Worker, which did the authentication. The record does the
       AUTHORISATION — every permission check is inside `createRecordApi`, one place, so the CLI and
       the MCP server answer to the same ladder as the browser. */
    const ctx = JSON.parse(request.headers.get('x-braindog-ctx') ?? 'null') as CallContext | null;
    if (!ctx) return json({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This record needs a caller.' } }, 401);

    /* `/mcp` READS ITS BODY HERE. The router checked the bearer from the headers alone, so nothing a stranger
       sent is parsed, and the tools reach this record through the same methods `/api` calls. */
    if (servesMcp(new URL(request.url).pathname)) return serveMcp(request, api, ctx);

    return serveApi(request, handlersFor(api), ctx);
  }
}

/**
 * The Directory: one object for the whole installation.
 *
 * ONE INSTANCE, ALWAYS `idFromName('directory')`. It is the tenant map — which name means which
 * record, and which records a person reaches — and two of them would be two maps that disagree.
 * The throughput of a single writer is the documented ceiling (ADR-061); sharding by email prefix
 * is the documented next step, and neither is a thing to build before the first customer.
 *
 * IT HOLDS NO RECORD LOGIC, and its schema is `@braindog/record/directory` so the self-host runs
 * the same file over `directory.sqlite`.
 */
export class Directory$ extends DurableObject<Env> {
  #dir: Dir | null = null;
  /** The MAC key, derived before any call is answered, or `null` when sign-in is off. */
  #mac: Uint8Array | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    /* DERIVED UNDER THE BLOCK, so the first call already has the key it is checked with: HKDF is
       asynchronous and `createDirectory` is not. Shorter than 32 characters is off, like unset, because
       every session is an HMAC under it and a short secret is a guessable one. */
    void ctx.blockConcurrencyWhile(async () => {
      const secret = env.SESSION_SECRET ?? '';
      this.#mac = secret.length >= 32 ? await deriveSessionKey(new TextEncoder().encode(secret)) : null;
    });
  }

  #directory(): Dir {
    if (this.#dir) return this.#dir;
    const mac = this.#mac;
    const host = this.env.PUBLIC_HOST ?? '';
    const rp = host ? relyingParty(`https://${host}`) : null;
    this.#dir = createDirectory(
      storageSql(this.ctx.storage),
      { now: () => Date.now() },
      mac
        ? {
            mac,
            ...(rp ? { rp } : {}),
            magic: Boolean(this.env.AUTH_MAIL_FROM && this.env.EMAIL),
            /* The reason a sign-in failed, for the operator's tail. A flow and a word, never who or with what. */
            log: (line) => console.error(`auth: ${line.flow} refused (${line.reason})`),
          }
        : undefined,
    );
    /* `createDirectory` imported its own copy, so this was the last one held as bytes. */
    mac?.fill(0);
    this.#mac = null;
    return this.#dir;
  }

  /** Sign-in, whole: `/auth/*` arrives as an `AuthCall` and leaves as an `AuthResult`. */
  auth(call: AuthCall): Promise<AuthResult> {
    return this.#directory().auth(call);
  }

  /**
   * The operator's first half: the name and the person, checked and made, before any record exists. A
   * refusal when the name cannot be had, and nothing has been written then.
   */
  prepare(slug: string, email: string, name: string | null): { person?: { id: string; email: string; name: string | null }; refusal?: Refusal } {
    const d = this.#directory();
    const wrong = d.bad(slug);
    if (wrong) return { refusal: { code: 'VALUE_MALFORMED', fix: wrong, at: 'slug' } };
    const held = d.claimed(slug);
    if (held === 'taken') return { refusal: { code: 'ALREADY_KNOWN', fix: `${slug} is already a record here.`, at: 'slug' } };
    if (held === 'released')
      return { refusal: { code: 'ALREADY_KNOWN', fix: `${slug} was the name of another record and is never given out again.`, at: 'slug' } };
    const person = d.person$(email, name ?? undefined);
    if (!person.ok) return { refusal: refusalOf(person) };
    return { person: { id: person.value.id, email: person.value.email, name: person.value.name } };
  }

  /** The operator's second half, once the record exists: the name now points at it. `null` is named. */
  name(slug: string, email: string, record: string): Refusal | null {
    const named = this.#directory().provision({ slug, email, record });
    return named.ok ? null : refusalOf(named);
  }

  /** Whether a record's scheduled action may run now: `null`, or until when it waits and why. A record's alarm asks before each run. */
  mayRun(record: string, action: string, pending = 0): { until: number; say: string } | null {
    return this.#directory().mayRun(record, action, pending);
  }

  /** Count one run a record's alarm metered. `null` is counted, already counted or too old to count; a refusal is a row that is not a run. */
  meter(record: string, run: RunUsage): Refusal | null {
    const out = this.#directory().meter(record, run);
    return out.ok ? null : refusalOf(out);
  }

  /** `GET /account/usage`: what the records this person owns used between two days. */
  usage(person: string, range: { from: string; to: string }): Result<AccountUsage> {
    return this.#directory().usage(person, range);
  }

  /**
   * Whether this address is a record this installation created, and has not closed.
   *
   * IT IS ASKED ABOUT AN ID RATHER THAN A NAME, which is why answering is safe: a slug is a word
   * somebody chose and an id is 26 random characters, so this tells a caller nothing they did not
   * already have. What it prevents is the router addressing an object that does not exist — and on
   * this platform, addressing one is creating one.
   */
  knows(record: string): boolean {
    return this.#directory().knows(record);
  }

  /** Which record this name means, or `null` if it means none. The hop, and the whole of it. */
  resolve(slug: string): { record: string; slug: string } | null {
    return this.#directory().resolve(slug);
  }

  /** An address that can already sign in: a person with a passkey or a record. `/auth/invite` sends them to sign in first. */
  inviteKnown(email: string): boolean {
    this.#directory();
    return Boolean(storageSql(this.ctx.storage).one(KNOWN_ADDRESS, email));
  }

  /** The person an invitation makes, found or made by address. */
  invitee(email: string): Result<{ id: string; email: string }> {
    const made = this.#directory().person$(email);
    return made.ok ? { ok: true, value: { id: made.value.id, email: made.value.email } } : made;
  }

  /** The record an accepted invitation names, reachable by its new member. */
  joinRecord(record: string, person: string): Result<null> {
    return this.#directory().join(record, person);
  }

  /**
   * Which records this person can reach at all. The switcher's index, and not an authorisation.
   *
   * WHAT THEY MAY DO INSIDE ONE IS THE RECORD'S OWN TABLE. Reading the level from here made `invite`
   * and `remove` write a table no authorisation path read — so removing somebody did not stop them
   * writing, and a bookkeeper given `read` on the payroll register wrote to it.
   */
  reaches(person: string): { record: string; slug: string | null }[] {
    /* AND IT NO LONGER RETURNS A LEVEL, because there is nothing keeping that level true. `invite`
       and `removeMember` write the RECORD's `member` table; `join` and `leave` write the Directory's
       `dir_member`. Nothing writes both. So the level here is whatever it was when somebody was
       first put on the record — a person removed a year ago still reads as `write`, and the field
       reads as an authorisation to anyone who finds it, which is precisely what the paragraph above
       spends four lines saying it is not. A type that cannot lie is better than a comment that says
       it does. */
    return this.#directory()
      .recordsOf(person)
      .filter((m) => !m.closed)
      .map((m) => ({ record: m.record, slug: m.slug }));
  }

  /**
   * The switcher's rows, finished: every open record this person can reach, each with its name and
   * the level they actually hold there. `GET /account/records`.
   *
   * `reaches` ABOVE STOPS AT WHICH; this asks each one what, over RPC to that record's own object,
   * through `idFromName(rec_id)` and never the slug, so a rename never changes which object answers
   * (ADR-061). `switcherRows` is `@braindog/record/directory`'s: it drops a record that answers with
   * no level, which is a person the Directory still lists and the record has since removed.
   */
  async recordsFor(person: string): Promise<{ slug: string; name: string; level: string }[]> {
    return this.#directory().switcherRows(person, (record) => this.env.RECORD.get(this.env.RECORD.idFromName(record)).switcherRow(person));
  }
}

/**
 * One pass over one record’s outbox, with this deployment’s bindings behind it.
 *
 * THE BUILDING IS HERE AND THE PASS IS IN `pump.ts`. What this function contributes is two
 * transports out of `env` — which is the only part that needs the platform — and everything that
 * can go wrong in the pass itself is a plain function a bare Node process can run.
 */
async function drainOutbox(env: Env, id: string): Promise<void> {
  const record = env.RECORD.get(env.RECORD.idFromString(id));
  const deliver = makeDeliver({
    ...(env.EMAIL === undefined ? {} : { email: (m: { to: string; subject: string; text: string }) => env.EMAIL!.send(m) }),
    /* `redirect: 'manual'` AND A TIMEOUT, and both are the difference between a validated URL and a
       validated request. `postable()` checks the address it is handed and `fetch` followed a 302
       wherever it pointed — so a webhook that answers `302 -> http://169.254.169.254/…` reached
       the metadata service, and a 307 replayed the POST BODY at it. The check would have refused
       that address; the redirect walked round the check.

       AND A REQUEST THAT NEVER RETURNS IS A LEASE THAT EXPIRES UNDER SOMEBODY. Twenty seconds is
       well inside the sixty-second notify lease, so a slow endpoint fails and retries rather than
       being delivered twice by two workers who both think they hold it. */
    post: async (url: string, body: string) => {
      const out = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
      /* A 3xx IS A FAILURE, not a success with an unread body: the endpoint that was declared is not
         the endpoint that answered. */
      return { ok: out.status >= 200 && out.status < 300, status: out.status };
    },
  });

  /* AND AN ACK THAT WOULD NOT LAND RINGS AGAIN. `pump` leaves such a job `leased` and moves on,
     because "the lease expires and the job is reclaimed" — which is true on the self-host, where a
     fifteen-second poller reclaims it. This Worker has no poller: reclaiming needs a `lease()`, which
     needs the doorbell, which `tail()` rings only when `pendingWork().outboxPending` is true — and
     that counts `pending` rows, not `leased` ones. So the job waited for the record's NEXT
     deliverable row to ring for it, which on a quiet record is indefinitely.

     ONE RING, NOT A LOOP. The lease is still held when this fires; the redelivery arrives after
     Cloudflare's own delay, by which time it has expired and `leaseOutbox` reclaims it. */
  const pass = await pump(record, deliver);
  if (pass.unacked > 0) await env.INGRESS.send({ record: id });
}

/**
 * The bearer path's three calls, over this deployment's objects.
 *
 * WHERE A CALL CAME FROM IS THE BRANCH THE ROUTER TOOK, never the path read again. A path is the caller's
 * to write, and `includes('/mcp')` once made `POST /api/list/mcp` record `mcp` on a token: a forgeable line
 * in the one place a person decides what to revoke.
 */
function bearerDeps(env: Env): BearerDeps {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const record = (id: string) => env.RECORD.get(env.RECORD.idFromName(id));
  return {
    knows: (id) => directory.knows(id),
    verify: (id, bearer, surface) => record(id).verify(bearer, surface),
    access: (id, person) => record(id).access(person),
  };
}

/**
 * `no-store`, ON THE ROUTER'S OWN ANSWERS TOO.
 *
 * 33 §4 asks for it on all of `/api/*`, and `serveApi` sets it — but the 401, 403, 404 and 500 this
 * file writes never reach `serveApi`. A cached 401 is a person who signs in and still cannot get in;
 * a cached 403 is a person invited to a record who is told for an hour that they are not on it.
 *
 * AND ON THE OBJECT'S OWN TWO, WHICH THAT SENTENCE DID NOT REACH. `Record$.fetch` refuses before
 * `serveApi` in two places, a 503 for a kernel that is refused and a 401 for a request carrying no
 * context, and both were written by hand with a content-type and nothing else. `route()` ends with
 * `return record.fetch(inner)`, so what the object writes is what the client gets: those two were
 * the only answers on the whole surface without `no-store`. They call this from above it, which is
 * where the class is; a `const` at module scope is in scope for a method body that runs long after
 * this line is evaluated.
 */
const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra],
  });

/**
 * `GET /.well-known/braindog-build`: which build this Worker version is, to anybody who asks.
 *
 * A DEPLOYMENT IS NOT A RECORD, and that distinction is the whole of why this route exists. The
 * `app` tuple also rides on `/api/version`, which is `READ+` and rightly so: that route answers what
 * changed in one customer's record, and it takes a bearer. `deploy-parity` was reading the build
 * through it, so the first production deploy that ran end to end went red with a 401 at the step
 * whose job is to prove the deploy landed. The two obvious repairs were both wrong: making a record
 * route public widens a boundary to answer a question that is not about records, and teaching the
 * check to shrug at a 401 makes a check that cannot see indistinguishable from one that found
 * nothing. So the fact moved to where it belongs instead.
 *
 * AN UNSET BUILD ANSWERS `null` AND NEVER `""`. `BRAINDOG_BUILD` is declared empty in
 * `wrangler.jsonc` so a deploy that forgot `--var` leaves an empty string rather than a missing
 * binding, and saying that out loud as `null` is what the record already does at `/api/version`. A
 * gate handed `""` reads a tuple that is merely unequal; handed `null` it reads a deployment that
 * was never told which build it is, which is the true thing.
 *
 * THROUGH `json()`, LIKE EVERY OTHER ANSWER THIS FILE WRITES, so it carries `no-store`. A cached
 * build id is a gate measuring an edge rather than the deploy, on the one request where that is the
 * entire question being asked.
 */
const buildId = (env: Env): Response => json({ app: env.BRAINDOG_BUILD || null }, 200);

/**
 * The one answer to every way of not being let in.
 *
 * ONE SENTENCE FOR ALL THREE: no bearer, a bearer this record does not know, and a name no record
 * has. They were three different answers, and the difference between the third and the other two is
 * readable without any credential at all, because it said which names exist.
 *
 * AND THE SENTENCE SAID SOMETHING NOBODY COULD DO. `Mint one from the app` was measured against the
 * live host by an audit reading it as a stranger would: whoever hits this IS at the app, there is
 * no sign-up on it, and the product's own changelog says so in as many words. So the one refusal
 * every agent and every developer meets first pointed them at a door that is not there.
 *
 * `10 §7` MAKES THE REFUSAL THE TEACHER, and what this one has to teach is which of the two
 * situations somebody is in: a token they can mint, on a record that has been provisioned, or a
 * host that is not open yet. It cannot tell them apart, because saying which record exists is the
 * thing the single sentence exists to avoid. So it says what is true of both, and names the one
 * place that is honest about which: the changelog, on the marketing site, with no credential
 * needed to read it.
 */
/* AND WHICH OF THE TWO SITUATIONS THE HOST IS IN, IT NOW KNOWS. The paragraph above was written when no
   door existed anywhere, and it stopped being true the moment `SESSION_SECRET` was set: the block at the
   bottom of this file wires the device grant and the invite door on exactly that condition, so sign-in is
   on for this deployment or off for it. That is a fact about the deployment and not about any record,
   which is why it can be said out loud. What stayed unsaid is still unsaid: neither branch admits whether
   the record named exists, because telling those apart is the thing this one sentence exists to avoid. */
const unauthorized = (env: Env): Response =>
  json(
    {
      ok: false,
      refusal: {
        code: 'UNAUTHORIZED',
        fix:
          (env.SESSION_SECRET ?? '').length >= 32
            ? 'This record takes a bearer token it already knows. If the record is yours, sign in and mint one in Settings, or run `braindog login`. https://brain.dog/changelog says what is built.'
            : 'This record takes a bearer token it already knows, and sign-in is off on this host, so there is no way to be issued one. https://brain.dog/changelog says what is built.',
      },
    },
    401,
  );

/**
 * The Worker resolves WHO is asking, and the record decides what they may do.
 *
 * `idFromName(rec_id)` AND NEVER `idFromName(slug)` (ADR-061). The address is the record id, so
 * renaming is one row in the Directory and nothing else — no migration, no copy, and no window in
 * which half the writes go to the old object. Addressing the storage by the name would make a rename
 * a data migration, which is why nobody who does it ever renames anything.
 */
export default {
  /**
   * AND NOTHING A REQUEST CAN DO ESCAPES AS A BARE 500. 33 §4: "both hosts return the `Result`
   * envelope unchanged" — and this had no guard at all, so a Directory storage error, a malformed
   * URL or an RPC that failed mid-deploy came back as workerd's own 500 with an HTML-ish body, while
   * the self-host answered the same fact as `{ ok: false, refusal }`. A client cannot have one
   * branch for a refusal when one of its two hosts sometimes speaks a different language.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      /* THE SENTENCE AND NEVER THE STACK. A trace is a map of this deployment, and a request that
         reached here is one somebody may be probing with. */
      const why = e instanceof Error ? e.message : String(e);
      console.error('fetch:', why);
      return json({ ok: false, refusal: { code: 'INTERNAL', fix: `This request could not be answered: ${why}.` } }, 500);
    }
  },

  /**
   * The doorbell rang.
   *
   * THE MESSAGE IS A NAME AND NOT A JOB. It says which record has something to send; the outbox
   * says what. A message delivered twice does one pass over a lease that is already taken and
   * finds nothing — which is why the queue can be at-least-once and the notification is still
   * sent once.
   */
  async queue(batch: MessageBatch<{ record: string }>, env: Env): Promise<void> {
    await consume(batch.messages, (id) => drainOutbox(env, id));
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    /* THE DEPLOYMENT'S OWN BUILD ID, BEFORE ANYTHING ELSE, because it asks nothing of the Directory,
       of a record or of whoever is calling. */
    if (servesBuild(url.pathname)) return buildId(env);
    /* SIGN-IN FIRST, AND IT IS THE DIRECTORY'S: nothing under `/auth/` reaches a record. */
    if (servesAuth(url.pathname)) return signIn(request, env, ctx);
    if (servesAccount(url.pathname)) return account(request, env);
    /* AN AGENT'S MCP CLIENT, BEFORE ANY DOOR IS ASKED, so neither the cookie nor the demo is ever read for it. */
    if (servesMcp(url.pathname)) return agent(request, env);
    /* THE KEY DOORS, before any door is asked: their bearer is a vault grant, and neither a cookie nor a login
       token may reach them. */
    if (servesVault(url.pathname)) return keyDoor(request, env);
    if (!servesApi(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }, 404);

    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));

    /* WHICH DOOR, in `session.ts`'s order and nowhere else: a bearer, the session cookie, the public demo,
       or none. A cookie that names no session is a 401 that clears it, and never the demo. */
    const door = await doorOf(request, {
      origin: `https://${env.PUBLIC_HOST ?? ''}`,
      demo: env.DEMO_RECORD,
      session: (sid) => directory.auth({ flow: 'session', sid }) as unknown as Promise<AuthResult<Who>>,
      access: (record, person) => env.RECORD.get(env.RECORD.idFromName(record)).access(person),
    });

    /* THE APP'S OWN KEY DOORS ARE A BROWSER SESSION'S AND NOBODY ELSE'S. `/api/keys/*` is not a record method, so
       it is answered here rather than forwarded; every other door reaching it is refused with the record's own
       sentence rather than with a route that does not exist. */
    const keysAsked = servesKeys(url.pathname) !== null;

    /* THE PUBLIC DEMO: nothing the caller sent names it, and `demoRecord` says everything it opens. It skips
       the Directory on purpose. The Directory answers which record a NAME means, and this has no name,
       only the deployment's constant. */
    if (door.door === 'demo')
      return keysAsked ? noSession() : env.RECORD.get(env.RECORD.idFromName(door.record)).fetch(inward(request, door.ctx));

    /* A PERSON, on the record their session names, and a rotation rides back on the record's answer. The
       record authorises exactly as it does for a bearer: every check is inside `createRecordApi`. */
    if (door.door === 'session')
      return withCookie(
        keysAsked
          ? await appKeys(request, env, door.record, door.ctx)
          : await env.RECORD.get(env.RECORD.idFromName(door.record)).fetch(inward(request, door.ctx)),
        door.cookie,
      );

    if (door.door === 'refused') {
      if (door.status === 401 && door.refusal === undefined) return unauthorized(env);
      const extra: [string, string][] = door.retryAfter === undefined ? [] : [['retry-after', String(door.retryAfter)]];
      const body = door.refusal !== undefined ? { ok: false, refusal: door.refusal } : door.retryAfter === undefined ? { ok: false } : { ok: false, retryAfter: door.retryAfter };
      return withCookie(json(body, door.status, extra), door.cookie);
    }

    /* AND WHAT IS LEFT AT `/api/keys/*` IS A BEARER OR NOTHING, which is the one thing those doors do not take. */
    if (keysAsked) return noSession();

    /* A BEARER. This Worker serves MANY records, and a request that says who it is by nothing but the
       header it carries says so here, or not at all. `session.ts` holds the path, and `/mcp` takes the same one. */
    const found = await bearerOf(request, 'api', bearerDeps(env));
    if ('status' in found) return found.status === 403 ? json({ ok: false, refusal: found.refusal }, 403) : unauthorized(env);

    /* THE WORKER AUTHENTICATES AND THE RECORD AUTHORISES, and neither does the other's half. Every check about
       what a caller may do is inside `createRecordApi`, so the CLI and the MCP server answer to the same ladder
       as the browser. `inward` writes the context over whatever the caller sent and drops the bearer. */
    return env.RECORD.get(env.RECORD.idFromName(found.record)).fetch(inward(request, found.ctx));
}

/**
 * `/api/vault/*`: the grant is checked by the record its bearer names, and then `vault.ts` answers.
 *
 * THE DOORS GET KEYS ONLY WHEN `KEK` IS BOUND, and the store is opened inside them, after the grant, so a key store
 * that will not open says so only to a grant holder.
 */
function keyDoor(request: Request, env: Env): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return serveWorkerVault(request, {
    knows: (id) => directory.knows(id),
    vaultGrant: async (id, bearer) => (await recordKeyHalf(env).vaultGrant(id, bearer)),
    keys: isBound(env.KEK) ? keyHalf(env) : undefined,
  });
}

/** The record's half of both doors, over RPC. One shape, so the two doors cannot drift into different calls. */
function keyHalf(env: Env): KeyDeps {
  const record = (id: string) => env.RECORD.get(env.RECORD.idFromName(id));
  return {
    store: () => keyStoreOf(env.KEK),
    wrappingKey: (id) => record(id).wrappingKey(),
    depositGrant: async (id, args, by, hints, seal) =>
      (await record(id).depositGrant(args, by as unknown as VaultGrant, hints, seal)) as unknown as Result<Deposited>,
    openForGrant: async (id, args, by, hints, kekId) =>
      (await record(id).openForGrant(args, by as unknown as VaultGrant, hints, kekId)) as unknown as Result<OpenedForGrant>,
  };
}

/** `vaultGrant` over RPC, which the vault door needs and the app's doors do not: a session is not a grant. */
const recordKeyHalf = (env: Env) => ({
  vaultGrant: async (id: string, bearer: string) =>
    (await env.RECORD.get(env.RECORD.idFromName(id)).vaultGrant(bearer)) as unknown as Result<VaultGrantSeen>,
});

/** The one sentence every caller that is not a browser session gets at `/api/keys/*`. It is the record's own. */
const noSession = (): Response =>
  json({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot reach the vault.', at: 'principal' } }, 403);

/**
 * `/api/keys/*`: the app's own key doors, for the browser session `doorOf` has already resolved.
 *
 * THE RECORD IS THE SESSION'S. Nothing in the body names one, and the host step seals for the record whose cookie
 * this is. `serveKeys` has already refused a bearer and any origin this Worker does not answer for; what is left
 * for the record to decide is whether this person may reach the vault at all, which is `vault(ctx)`.
 */
function appKeys(request: Request, env: Env, id: string, ctx: CallContext): Promise<Response> {
  return serveWorkerKeys(request, ctx, {
    origins: new Set([`https://${env.PUBLIC_HOST ?? ''}`]),
    record: id,
    keys: isBound(env.KEK) ? keyHalf(env) : undefined,
  });
}

/**
 * `POST /mcp`: what the headers can refuse, then the bearer, then the record's object reads the body.
 *
 * A BEARER AND NOTHING ELSE. This is reached before `doorOf`, so a session cookie is never read and the demo
 * never answers: an agent carries its own credential, and a person in a browser has the app. `gate` is the
 * transport's own, so the order is the self-host's: 405, 403, 415, then 401.
 */
async function agent(request: Request, env: Env): Promise<Response> {
  const early = gate(request);
  if (early) return early;
  const found = await bearerOf(request, 'mcp', bearerDeps(env));
  if ('status' in found) return found.status === 403 ? json({ ok: false, refusal: found.refusal }, 403) : unknownAgent();
  return env.RECORD.get(env.RECORD.idFromName(found.record)).fetch(inward(request, found.ctx));
}

/**
 * `/account/*`, through the same `serveAccount` the self-host runs: the Directory's usage ledger, for the session
 * cookie. Without `SESSION_SECRET` nobody signs in, so every account route is 401.
 */
async function account(request: Request, env: Env): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return serveAccount(request, {
    origin: `https://${env.PUBLIC_HOST ?? ''}`,
    auth: (env.SESSION_SECRET ?? '').length >= 32 ? (((call: AuthCall) => directory.auth(call)) as unknown as Auth) : null,
    usage: (person, range) => directory.usage(person, range) as unknown as Promise<Result<AccountUsage>>,
    records: async (person) => ({ ok: true as const, value: await directory.recordsFor(person) }),
  });
}

/**
 * `/auth/*`, through the same `serveAuth` the self-host runs, and shipped switched off.
 *
 * WITHOUT `SESSION_SECRET` THE DIRECTORY HOLDS NO KEY, so `/auth/methods` says `not-configured` and every
 * other route is 404; without `PROVISION_KEY` the two operator routes are 404 as well. The address the
 * lockout counts is `cf-connecting-ip`, which Cloudflare writes and a caller cannot.
 */
async function signIn(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const from = env.AUTH_MAIL_FROM;
  const email = env.EMAIL;
  const url = new URL(request.url);
  return serveAuth(request, {
    on: 'worker',
    origin: `https://${env.PUBLIC_HOST ?? ''}`,
    auth: ((call: AuthCall) => directory.auth(call)) as unknown as Auth,
    ip: request.headers.get('cf-connecting-ip') ?? '',
    demo: isRecordId(env.DEMO_RECORD ?? ''),
    /* MAIL ONLY WHEN BOTH ARE SET, AND NEVER AWAITED. `waitUntil` keeps the send alive after the answer has
       gone, so a known address and an unknown one answer in the same time. A failure is logged as a fact
       and never with the address or the link. */
    ...(from && email
      ? {
          mail: (to: string, link: string) =>
            ctx.waitUntil(
              email.send({ from, to, subject: 'Sign in to BrainDog', text: letter(link) }).catch(() => {
                console.error('auth: a sign-in link could not be sent');
              }),
            ),
        }
      : {}),
    operator: { key: env.PROVISION_KEY, provision: (args) => provision(env, args) },
    /* THE NAME THE REQUEST CAME BY, so a device that reached this Worker at another address is not sent to
       `PUBLIC_HOST` to be approved. Devices sign in only where sign-in is on, because approving needs a session. */
    reached: url.host,
    ...((env.SESSION_SECRET ?? '').length >= 32 ? { device: devices(env), invite: invites(env) } : {}),
  });
}

/**
 * An invitation link's two halves, over RPC: the record its token names, and the Directory.
 *
 * THE TOKEN CARRIES ITS RECORD ID, as a bearer does, so the object is found without a search. A token naming no
 * record this Directory holds is a dead link, in the same words as a spent one.
 */
function invites(env: Env): InviteDoor {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const recordOf = async (inviteToken: string) => {
    const id = inviteToken.slice(0, Math.max(0, inviteToken.indexOf('.')));
    return isRecordId(id) && (await directory.knows(id)) ? { id, stub: env.RECORD.get(env.RECORD.idFromName(id)) } : null;
  };
  const gone = { ok: false as const, refusal: { code: 'UNAUTHORIZED', fix: INVITE_GONE, at: 'token' } };
  return {
    look: async (inviteToken) => {
      const found = await recordOf(inviteToken);
      return found ? ((await found.stub.acceptInvite({ token: inviteToken })) as unknown as Result<{ email: string; expires_at: string }>) : gone;
    },
    accept: async (inviteToken, person) => {
      const found = await recordOf(inviteToken);
      if (!found) return gone;
      const out = (await found.stub.acceptInvite({ token: inviteToken, person })) as unknown as Result<unknown>;
      return out.ok ? ((await directory.joinRecord(found.id, person.id)) as unknown as Result<null>) : out;
    },
    known: async (email) => Boolean(await directory.inviteKnown(email)),
    person: async (email) => (await directory.invitee(email)) as unknown as Result<{ id: string; email: string }>,
  };
}

/**
 * The device grant's record half, over RPC: the record the slug names, or one refusal when it names none.
 *
 * THE SLUG TRAVELS ON BOTH CALLS, because a poll id says nothing about which record issued it and this Worker
 * holds many.
 */
function devices(env: Env): DeviceDoor {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const recordOf = async (slug: string | undefined) => {
    const found = slug ? await directory.resolve(slug) : null;
    return found ? env.RECORD.get(env.RECORD.idFromName(found.record)) : null;
  };
  const nowhere = {
    ok: false as const,
    refusal: { code: 'FORBIDDEN', fix: 'Name a record this BrainDog holds, as in braindog login https://<host>/<slug>.', at: 'slug' },
  };
  return {
    start: async ({ slug, ip, ...ask }) => {
      const record = await recordOf(slug);
      return record ? ((await record.deviceStart(ask, ip)) as unknown as Result<DeviceCode> | Limited) : nowhere;
    },
    poll: async ({ slug, device_code }) => {
      const record = await recordOf(slug);
      return record ? ((await record.devicePoll({ device_code })) as unknown as Result<Waiting | Exchanged>) : nowhere;
    },
  };
}

/** The one letter sign-in sends: plain text, the link on a line of its own, and what it is for. */
const letter = (link: string): string =>
  [
    'Here is your link to sign in to BrainDog. It works once, for the next fifteen minutes.',
    '',
    link,
    '',
    'If you did not ask to sign in, you can ignore this message.',
  ].join('\n');

/**
 * The operator's record: the name and the person, then the record, then the Directory row that names it.
 *
 * THE RECORD BEFORE THE NAME, `51 §13 D21`: a Directory row never points at a record that failed to be made.
 *
 * WITH ITS THREE KEYS WRAPPED WHEN `KEK` IS BOUND, and without them when it is not. `createRecord` takes the keys
 * wrapped, and absent until there is something to wrap them with. A record made without them reads, writes and signs
 * people in; it cannot seal a grant or sign an export, and binding `KEK` later does not give it keys.
 *
 * THE STORE IS OPENED FIRST, so a bound value that is not a key refuses before the Directory writes anything.
 */
async function provision(env: Env, args: { slug: string; email: string; name?: string }): Promise<Result<Provisioned>> {
  const store = await keyStoreOf(env.KEK);
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const ready = await directory.prepare(args.slug, args.email, args.name ?? null);
  if (ready.refusal) return { ok: false, refusal: ready.refusal };
  const owner = ready.person;
  if (!owner) return { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'The Directory made no person for that address.' } };
  const id = `rec_${ulids(() => Date.now())()}`;
  const made = await env.RECORD.get(env.RECORD.idFromName(id)).create({
    id,
    slug: args.slug,
    name: args.name ?? args.slug,
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner.id, email: owner.email, name: owner.name },
    ...(store ? { keys: await recordKeys(store, id) } : {}),
  });
  if (made) return { ok: false, refusal: made };
  const unnamed = await directory.name(args.slug, args.email, id);
  if (unnamed) return { ok: false, refusal: unnamed };
  return ok({ record: id, slug: args.slug, person: owner.id });
}
