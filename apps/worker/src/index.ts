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

import { handlersFor, hintsOf, httpStatus, serveApi, serveIngest, serveSpark, servesSpark, withSession, type SessionHints, type SparkAskDoor, type VaultGrantSeen } from '@braindog/host';
import { deriveSessionKey, relyingParty, serveAccount, serveAuth, type DeviceDoor, type InviteDoor, type Provisioned } from '@braindog/host/auth';
import { gate, serveMcp as answerMcp, unauthorized as unknownAgent } from '@braindog/mcp/http';
import { INVITE_GONE, ulids, type Arrival, type Arrived, type CreateRecordArgs, type DeviceCode, type Exchanged, type OutboxRow, type VaultGrant, type Waiting } from '@braindog/kernel';
import { createRecordApi, type CallContext, type Deposited, type IngestVerification, type Limited, type OpenedForGrant, type RecordApi, type SealTarget, type Sealed } from '@braindog/record';
import { fixOf, ok, refused } from '@braindog/ports';
import type { Auth, AuthCall, AuthResult, Param, Refusal, Result, Row, Scheduler, Sql, Who } from '@braindog/ports';

import { createDirectory, switcherAsk, type AccountUsage, type Directory as Dir, type RunUsage, type SessionAsk, type SwitcherAsk, type SwitcherRow } from '@braindog/record/directory';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';

import { ALARM_RUNS, IN_FLIGHT, actionExecutor, holding, holdingPaged, invocation, keyOpener, meterPass, pass, sharedReader, type Admissions, type Ledger, type OpenKey } from './actions.ts';
import { runScript, ScriptRuns, type ScriptCall, type ScriptExports, type ScriptReply } from './script.ts';
import { grantNamed, holdingScript, scriptReads } from '@braindog/host/script';
import { askerOf, scriptTrial } from '@braindog/host/script-try';
import { pagedRunner } from '@braindog/host/connector';

import { alarmScheduler } from './alarm.ts';
import { sparkLook, workerSparkDoor, workerSparkModel } from './spark.ts';
import { workerCatalogueOffers } from './catalogue.ts';
import { DELETED, destroyRecord } from './destroy.ts';
import { DELIVERS, makeDeliver } from './deliver.ts';
import { consume, pump } from './pump.ts';
import { appPath, asPage, atRoot, cloudIngest, copyAsked, copyRefusal, drained, ingestBudget, inward, isRecordId, legacyRedirect, servesAccount, servesApi, servesAuth, servesBuild, servesIn, servesMcp, type AppPath, type CloudIngestDeps } from './route.ts';
import { NO_MINT_SESSION, serveInbound, servesInbound } from './inbound.ts';
import { appEntry, bearerOf, doorOf, withCookie, type BearerDeps } from './session.ts';
import { httpFor } from './http.ts';
import { isBound, keyStoreOf, recordKeys, type KekBinding } from './keys.ts';
import { keylessRefusal } from './keyless.ts';
import { fleetFailure, nightlyWalk } from './nightly.ts';
import { workerSigner } from './sign.ts';
import { dumpOf, r2Snapshots, type Dump } from './snapshots.ts';
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
  /** The model name the Spark endpoint expects, when it expects one. The key is the person's own, from the vault (`spark.ts`). */
  SPARK_MODEL?: string;
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
   * `yes` to allow a record to be provisioned on a deployment with no `KEK` bound. Anything else, including
   * unset, and `/auth/provision` refuses while the key store is missing (`keyless.ts` holds the argument).
   *
   * A VAR AND NOT A SECRET, because it is a statement about what this host is for rather than a value anybody
   * could use. It exists for a test host that seals nothing; on a host that ever will, the record it makes is
   * keyless for as long as it exists.
   */
  PROVISION_WITHOUT_KEYS?: string;
  /**
   * The root key agents' keys are wrapped under, `12 §6`: 32 bytes written as 64 hex characters or base64url, put with
   * `wrangler secret put KEK --env <environment>`, or a Secrets Store binding of the same name. A different value per
   * environment. Unset, and the key doors answer `NOT_IN_THIS_BUILD` and provisioning REFUSES rather than making a
   * record that can never be given keys (`keyless.ts`, and `PROVISION_WITHOUT_KEYS` for a host that means it). Set,
   * and every record provisioned from then on is made with its three keys wrapped under it. `keys.ts` is the only
   * reader.
   */
  KEK?: KekBinding;
  /** The sender for sign-in links, on a domain Email Service sends for. Empty, or no `EMAIL`, and there are no links. */
  AUTH_MAIL_FROM?: string;
  /** The app's host name: the cookie's origin, the passkeys' relying party, and what a cookie write must come from. */
  PUBLIC_HOST?: string;
  /**
   * The passkeys' relying party, when it is a parent of `PUBLIC_HOST` rather than the host itself: `brain.dog` in
   * production and `alpha.brain.dog` in alpha. Unset or empty, and it is `PUBLIC_HOST`. A name `PUBLIC_HOST` is not
   * under switches passkeys off (`relyingParty`), which is a refusal an operator can read and not a broken button.
   */
  RP_ID?: string;
  /**
   * The names this Worker answered as before the app moved to `PUBLIC_HOST`, comma-separated: `app.brain.dog`.
   *
   * A PAGE LOAD ON ONE IS A 308 TO `https://<PUBLIC_HOST>/app<path>`, and `/api/*`, `/mcp` and `/in/*` on it are served
   * where they stand and never redirected (`legacyRedirect` in `route.ts`). Unset or empty, and nothing is a legacy
   * host, which is exactly the Worker before the move.
   */
  LEGACY_HOSTS?: string;
  /** The built web shell, `wrangler.jsonc`'s `assets`, which holds the bundled catalogue Spark reads (`catalogue.ts`). */
  ASSETS?: Fetcher;
  /**
   * Where the nightly copies go: `<record>/snapshots/nightly-<date>.brainl` and `latest.brainl` (`51 §5.12`).
   *
   * OPTIONAL, AND AN ABSENT BINDING IS A LOUD CRON RATHER THAN A QUIET ONE. A deployment without the
   * bucket keeps no copies, which is a fact the operator has to be able to read: `scheduled()` throws
   * one sentence, the cron invocation is marked failed, and nothing pretends a backup happened.
   */
  BLOBS?: R2Bucket;
  /**
   * The age recipient the cloud copy is sealed to (`12 §8`, `53 §5.4`). Named and unusable is a refusal:
   * `snapshots.ts` will not write a plaintext copy for a deployment that believes its copies are sealed.
   */
  AGE_RECIPIENT?: string;
  /**
   * The Worker Loader a person's script runs in (`script.ts`), `worker_loaders` in `wrangler.jsonc`. Workers Paid only.
   *
   * OPTIONAL, AND ABSENT IS A SCRIPT THAT SAYS SO. With no loader the pass hands a `script.run` no runner, and the kernel
   * meters it `dropped` with the sentence that this host has no sandbox, rather than the alarm failing on a binding.
   */
  LOADER?: WorkerLoader;
};

/** A `Result`'s refusal, for an RPC that hands back only the part a caller acts on. */
const refusalOf = (r: Result<unknown>): Refusal => (refused(r) ? r.refusal : { code: 'RECORD_UNAVAILABLE', fix: fixOf(r) });

/** The `Sql` port over the Durable Object's own SQLite. Storage in the same thread as the code. */
function storageSql(storage: DurableObjectStorage): Sql {
  const sql = storage.sql;
  let depth = 0;
  /**
   * A row with each BLOB as a `Uint8Array`, a view over the `ArrayBuffer` the Durable Object hands back and not a copy.
   *
   * THE ONE PLACE A BLOB CHANGES SHAPE, BECAUSE EVERY READER IN THE KERNEL TESTS FOR A `Uint8Array`, which is what
   * `node:sqlite` returns to the self-host. Without it `encode` in `packages/kernel/src/brainl.ts` wrote each
   * `ArrayBuffer` as `{}`, so every export and every nightly copy this Worker made held the rows and none of the vault:
   * signed, its manifest hashing the `{}`, and restored into another object as the text `[object Object]` with `ok`.
   * `base64` in `vault.ts` read `length` off the same buffer and handed a leased connector `""`
   * (`loop/research-batch-forty-five-audit.md` §1). THE R2 COPIES MADE BEFORE THIS LINE CARRY NO VAULT, and `decode`
   * now refuses them at import with `FILE_MALFORMED` at the column, rather than restoring them in silence.
   */
  const bytesIn = (row: Record<string, unknown>): Row => {
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (value instanceof ArrayBuffer) row[key] = new Uint8Array(value);
    }
    return row as Row;
  };
  return {
    exec: (text: string, ...params: Param[]) => void sql.exec(text, ...(params as never[])),
    all: <T = Row>(text: string, ...params: Param[]) => sql.exec(text, ...(params as never[])).toArray().map(bytesIn) as T[],
    one: <T = Row>(text: string, ...params: Param[]) =>
      (sql.exec(text, ...(params as never[])).toArray().map(bytesIn) as T[])[0],
    /**
     * `transactionSync`, and a NESTED call goes to the storage's own `transactionSync` too, because
     * on a Durable Object that IS a savepoint: measured on workerd 1.20260903.1, an inner throw undid
     * only the inner row. The kernel flattens its own nesting before it gets here, so the one caller
     * that nests is `attempt()` in `packages/kernel/src/tx.ts`, which cannot issue a raw SAVEPOINT
     * on this host and needs its refusal to roll back its own writes and nothing else. Answering it
     * with `fn()` kept those writes (`test/kernel-in-do.test.ts`, the delegating case).
     */
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return storage.transactionSync(fn);
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

/** Built once a Worker isolate, not once a record: every record on it is offered the same packs and use cases. */
const CATALOGUE = seedCatalogue();

/**
 * THE SCRIPT SANDBOX'S TWO DOORS, EXPORTED FROM THE MAIN MODULE BECAUSE THAT IS WHAT `ctx.exports` IS MADE OF. A class
 * that is only imported here has no loopback binding, and `this.ctx.exports.ScriptOutbound` would be `undefined` at the
 * first run (`script.ts`).
 */
export { ScriptOutbound, ScriptRecord } from './script.ts';

/** One customer's record. The class name is `Record$` because `Record` is a TypeScript builtin. */
export class Record$ extends DurableObject<Env> {
  #api: Promise<RecordApi> | null = null;
  /** Set by `deleteRecord`, and never cleared: every door this object has answers as a deleted record from then on. */
  #gone = false;

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
  /** Spark's door, built on the first ask and kept, because the engine it holds writes its own tables. */
  #spark: SparkAskDoor<CallContext> | undefined;

  /** The scripts running from this object's alarm, and the rules each is held to (`script.ts`). */
  #scripts = new ScriptRuns();

  /**
   * One call a running script made, from `ScriptOutbound` or `ScriptRecord`: a fetch, a list or a get.
   *
   * AN RPC INTO THE OBJECT THE RUN STARTED IN, which is still awaiting it in `#act`. The key store, the vault and the
   * record live here and nowhere the sandbox can reach, and a run id this object did not open answers with a refusal.
   */
  async script(run: string, call: ScriptCall): Promise<ScriptReply> {
    return this.#scripts.answer(run, call);
  }

  #record(): Promise<RecordApi> {
    if (this.#gone) return Promise.reject(new Error(DELETED.fix));
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
    /* SPARK'S MODEL: the endpoint the deployment names, called with the person's own vault key, or none (`spark.ts`). */
    const sparkModel = workerSparkModel(this.env, () => api);
    const sql = storageSql(this.ctx.storage);
    await this.ctx.blockConcurrencyWhile(async () => {
      api = await createRecordApi({
        sql,
        clock: { now: () => Date.now() },
        scheduler: this.#alarm,
        /**
         * WHAT SIGNS AN EXPORTED `.brain`, AND IT WAS MISSING. Measured before this line existed: a
         * hosted export carried the `dog_sig` header with no row under it, and `checkBrainl` refuses
         * an unsigned file outright, so every file this Worker wrote was one nothing would import.
         * The self-host has passed a signer since `49 §5.22`; the Worker never did.
         */
        sign: workerSigner(sql, () => keyStoreOf(this.env.KEK), () => api.kernel.identity()?.id ?? null),
        /* WHAT THIS DEPLOYMENT IS, because the record cannot know. `/api/version` answers `33 §4`'s
           six keys and two of them are facts about the host: which build is serving, and whether
           there is a Spark behind it. An empty `BRAINDOG_BUILD` becomes `null` rather than `""` —
           the record says "I was not told" and `deploy-parity` reads a missing build instead of
           comparing against the empty string and finding it merely unequal. */
        build: {
          app: this.env.BRAINDOG_BUILD ?? '',
          spark: sparkModel !== undefined,
          /* `boot` SAYS WHICH HOST THIS IS, because billing told the Cloud from a self-host by whether
             `/api/inbound/mint` answered 404 (`loop/research-held-landing.md` friction 5). This Worker is
             the Cloud and nothing else, so it is a constant and not a binding. */
          host: 'cloud',
        },
        sparkModel,
        /* WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER, so the doorbell rings for work somebody can
           do. A kind with no deliverer sits `pending` for ever — which is honest — and without
           this every write afterwards rang the queue about it. */
        delivers: DELIVERS,
        /* A SHARED FILE AT AN ADDRESS IS READ HERE, not in the tab, so a site with no CORS header still installs. */
        readAddress: sharedReader(),
        /* A DRAFT SCRIPT RUN NOW, WRITING NOTHING (`@braindog/host/script-try`), in the sandbox a scheduled run gets:
           `runScript`, a fresh Worker from `env.LOADER.load`, with this caller's reads and, for the owner only, the
           vault by label. Asked of the Directory's allowance and counted on its ledger like a run, because it is one.
           No `LOADER` is a deployment with no sandbox, which says so and runs nothing. The key is opened in the asker's
           name (`askerOf`), not as `system`, which is the alarm's because a scheduled run has nobody behind it. */
        tryScript: (d) => {
          const loader = this.env.LOADER;
          if (!loader) return Promise.resolve({ refused: { code: null, why: 'This deployment has no sandbox, so nothing ran.' }, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 } });
          const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
          const openKey = this.#openKey(api, askerOf(d));
          return scriptTrial({
            sandbox: (s, t) =>
              runScript(
                {
                  loader,
                  exports: this.ctx.exports as unknown as ScriptExports,
                  object: this.ctx.id.toString(),
                  runs: this.#scripts,
                  send: (egress) => actionExecutor(() => egress, { openKey }),
                  grant: t.grantOf,
                  read: t.reads,
                  now: () => Date.now(),
                },
                s,
              ),
            ledger: { mayRun: (r, a, p) => directory.mayRun(r, a, p), meter: (r, run) => directory.meter(r, run) },
          })({ record: d.record, body: d.body as never, input: d.input as never, reads: d.reads as never, grantOf: d.owner ? grantNamed(() => api.kernel.grants()) : null, stale: d.stale });
        },
        /* WHAT AN AGENT MAY PROPOSE INSTALLING, and the carry step an update from an older use case runs. The same list the
           self-host hands in (`@braindog/seed/usecases/catalogue`): without it a hosted Personal 1.0.0 record updated and
           left what it kept typed where nothing reads it. */
        catalogue: CATALOGUE,
        /* NEWER VERSIONS IN THE CATALOGUE BUNDLED WITH THE SHELL, for Spark to ask about on Decide, as a self-host's folder gives. */
        catalogueOffers: workerCatalogueOffers(this.env.ASSETS),
        /* AN INVITATION IS SPENT BY SIGNING IN, and nobody signs in here without the Directory's key. */
        invitations: () => ((this.env.SESSION_SECRET ?? '').length >= 32 ? null : INVITES_OFF),
        /* DELETION, `51 §5.13`. The record has checked the owner, the sign-in and the typed name; this is the alarm,
           the bytes and the names, with no request answered in between. */
        destroy: async () => {
          const id = api.kernel.identity()?.id ?? null;
          const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
          await this.ctx.blockConcurrencyWhile(async () => {
            this.#gone = true;
            this.#api = null;
            await destroyRecord(this.ctx.storage, (record) => directory.close(record), id);
          });
        },
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
    if (this.#gone) return;
    const api = await this.#record();
    await api.kernel.drain(this.#alarm);
    await this.#act(api);
    await sparkLook(api);
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
      /* ONE OPENER FOR THE ALARM, handed to the scripts' sends below as well, so KEK has one reader here and not two. */
      const openKey = this.#openKey(api);
      const inner = actionExecutor(() => api.kernel.actionOrigins(), { openKey });
      /* ONE ADMISSION COUNT FOR BOTH, so a record with one run left cannot spend it twice, and it is the runtime's
         count, so a trial in its sandbox and this pass cannot each spend the last run either. */
      const admissions = pass(IN_FLIGHT);
      const execute = holding(inner, record, (r, action, pending) => ledger.mayRun(r, action, pending), admissions);
      /* A CONNECTOR PAGES AND THE EXECUTOR ABOVE CANNOT. Without a runner the kernel finishes the
         row and meters it `dropped`, which is honest and means the hosted runtime never runs one.
         The store may be absent — `KEK` unbound is a deployment without hosted keys — and that is
         a refusal the run reports rather than a reason not to offer the runner at all. */
      const keys = (await keyStoreOf(this.env.KEK)) ?? undefined;
      const page = pagedRunner(api, { http: httpFor(), clock: { now: () => Date.now() }, keys });
      /* THE INVOCATION'S REQUESTS, RESERVED BEFORE EACH RUN RATHER THAN COUNTED AFTER IT. Cloudflare
         does not refuse the request that passes the ceiling, it ends the whole invocation — so a
         pass that checked afterwards would learn it was over from the run that was already gone,
         along with every other run in the same alarm. A connector at forty pages reserves eighty-six.

         ONE BUDGET FOR THIS ALARM, which is one invocation and one record. §2.3 puts it in `consume`
         instead, on the reading that one invocation drains every record; that is true of the outbox
         pump and not of this path, where the alarm is per object and each object is billed its own. */
      const budget = invocation();
      /* A SCRIPT ASKS THE SAME LEDGER ON THE SAME ADMISSION COUNT, so a record with one run left spends it once. */
      const script = this.#scriptRunner(api, record, openKey, (r, action, pending) => ledger.mayRun(r, action, pending), admissions);
      let out;
      try {
        out = await api.kernel.runActions(execute, {
          limit: ALARM_RUNS,
          scheduler: this.#alarm,
          page: holdingPaged(page, record, (r, action, pending) => ledger.mayRun(r, action, pending), admissions),
          budget,
          ...(script === undefined ? {} : { script }),
        });
        await meterPass((r, run) => ledger.meter(r, run), record, out.usage);
      } finally {
        /* A PASS THAT NEVER SETTLES HOLDS ITS RECORD'S RUNS FOR THE LIFE OF THE RUNTIME, so this is in a finally. */
        admissions.settle();
      }
      /* ROWS LEFT BECAUSE THE BUDGET RAN OUT, NOT BECAUSE THEY ARE NOT DUE. They are `pending` again
         and their schedule has not moved, so nothing re-arms them: this alarm has to. Now, because
         the work was due before the budget was the reason it did not happen. */
      if (out.more) await this.#alarm.set(Date.now());
    } catch (e) {
      console.error('actions:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * The one opener over `KEK` for a single-request send: the alarm's actions and scripts, and a script's trial. One
   * place, so `KEK` keeps the readers `test/vault.test.ts` names and a trial adds none. `actor` is whoever asked, and
   * absent for the alarm, where `keyOpener` signs `system`.
   */
  #openKey(api: RecordApi, actor?: string): OpenKey | null {
    return keyOpener(api, this.env.KEK, actor);
  }

  /**
   * The sandbox a `script.run` goes to, or `undefined` on a deployment with no `LOADER`, where the kernel meters the
   * run `dropped` and says this host has no sandbox.
   *
   * THE SEND IS THE SAME `actionExecutor` A `call` GETS, over the script's own declared origins rather than the
   * record's ingest origins (`actionOrigins` reads only `ingest` declarations). The key is opened by `keyOpener` in this
   * object, for one request, as `system`: a scheduled script has no asker, which is `keyOpener`'s own default.
   *
   * READS ARE THE RECORD'S OWN `list` AND `get`, asked as the script's actor with its `reads` as the ceiling, so the
   * record's `reaches` is what keeps a `get` of a spoken id inside the registers the owner approved.
   *
   * THE READS, THE KEY LOOKUP AND THE HOLD ARE `@braindog/host/script`'s, THE SELF-HOST'S OWN. This object had copies of
   * all three, and they had drifted: the self-host had no reads at all, and this lookup matched a label only and sorted
   * two grants made in the same millisecond by a comparator that answered -1 both ways round, so which key a script
   * opened rested on the order the rows came back in. `grantNamed` breaks the tie on the id, as `keyNamed` does for a
   * `call`, and `scriptReads` takes secret fields off every row before the sandbox sees it.
   */
  #scriptRunner(api: RecordApi, record: string, openKey: OpenKey | null, mayRun: Ledger['mayRun'], admissions: Admissions) {
    const loader = this.env.LOADER;
    if (!loader) return undefined;
    return holdingScript(
      (s) =>
        runScript(
          {
            loader,
            exports: this.ctx.exports as unknown as ScriptExports,
            object: this.ctx.id.toString(),
            runs: this.#scripts,
            send: (egress) => actionExecutor(() => egress, { openKey }),
            grant: grantNamed(() => api.kernel.grants()),
            read: scriptReads(api),
            now: () => Date.now(),
          },
          s,
        ),
      record,
      mayRun,
      admissions,
    );
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
    if (this.#gone) return [];
    const api = await this.#record();
    return api.kernel.leaseOutbox(DELIVERS, n);
  }

  /**
   * The whole record as a `.brain`, for the nightly copy. `51 §5.12` steps 3 and 4, in one call.
   *
   * THE OBJECT DUMPS AND SIGNS, AND THE WORKER WRITES IT DOWN. The record performs no I/O, which is
   * the same seam `lease` above draws for the outbox: the object holds the rows and the signing key,
   * the Worker holds the bucket. An R2 put from inside here would give the record a reason to hold a
   * binding, and `ADR-062` is the argument for why it must not.
   *
   * THE BOOKMARK IS TAKEN IN THE SAME CALL as the dump rather than before it, so the point-in-time
   * the copy is paired with is a moment this object was already at, and not one a round trip ago.
   * A deployment whose storage has no bookmarks answers `null`, and the copy is still a copy.
   */
  async dump(at: string): Promise<Dump> {
    if (this.#gone) throw new Error(DELETED.fix);
    const api = await this.#record();
    let bookmark: string | undefined;
    try {
      bookmark = await this.ctx.storage.getCurrentBookmark();
    } catch {
      /* PITR is not on every deployment, and a copy without a bookmark is still a copy. */
    }
    return dumpOf(api, at, bookmark);
  }

  /**
   * A bearer, checked against this record's own table.
   *
   * THE RECORD VERIFIES AND THE WORKER ROUTES, and the split is the whole of why the bearer carries
   * the record id: only the object holding that table can say whether the hash is in it, and asking
   * anywhere else would be a search across every customer.
   */
  async verify(bearer: string, surface: string): Promise<{ id: string; person_id: string; scope: string } | null> {
    if (this.#gone) return null;
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
    if (this.#gone) return null;
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
   *
   * AND THE LISTS, WHEN THERE IS NO LEVEL. This answered `access(person)?.level ?? null`, which is
   * `null` for a colleague invited to one list, so `switcherRows` dropped the record that had just
   * admitted them (`research-invite-landing.md` finding 2). `switcherAsk` is shared with the self-host
   * so the two cannot drift back apart.
   */
  async switcherRow(person: string): Promise<SwitcherAsk> {
    if (this.#gone) return { level: null, name: null };
    const api = await this.#record();
    return switcherAsk(api.kernel, person);
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

  /**
   * A payload arrived at `/in/*` for this record. `/in/webhook/<rec>/<ingest>/<token>` is the only way here.
   *
   * AN RPC AND NEVER A ROUTE, and this is the one of the four where that matters most: `arrive` performs no
   * authorisation of its own, because there is nobody to authorise. The caller is a bank's server holding no
   * credential this record ever issued, and what stands in for a principal is `verified` (`30 §5`, `12 §3`).
   * `router-groups` is what keeps it off the table.
   *
   * A SUSPENDED RECORD REFUSES AND THE SENDER IS TOLD TO COME BACK, which is what the neighbours above do and
   * is right for a different reason here: the door turns every refusal into 503 with a sentence of its own, so
   * a bank retries and nothing about this record's state crosses to whoever is holding the URL.
   */
  async arrive(args: Omit<Arrival, 'verified'> & { verified: boolean }): Promise<Result<Arrived>> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    return broken ? { ok: false, refusal: broken } : api.arrive(args);
  }

  /**
   * What verifies one webhook ingest on this record, for the `/in/*` door. AN RPC AND NEVER A ROUTE.
   *
   * A RECORD THAT CANNOT ANSWER RIGHT NOW MUST NOT ANSWER `null`, WHICH IS WHY THIS THROWS. `null` is the
   * door's 404, and a 404 is what every webhook provider treats as "this endpoint is gone": GitHub, Stripe and
   * Twilio all disable or back off a hook that answers one. A record suspended for an afternoon would come
   * back to a sender that had stopped sending. Throwing reaches `serveIngest`'s own catch, which answers 503
   * and the word retry, and that is the difference between an outage and a disconnection.
   */
  async ingestVerify(args: { ingest: string }): Promise<IngestVerification | null> {
    const api = await this.#record();
    const broken = api.kernel.refused();
    if (broken) throw new Error(broken.fix);
    return api.ingestVerify(args);
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
  async acceptInvite(args: { token: string; person?: { id: string; email: string; name?: string } }): Promise<Result<unknown>> {
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
    const out = await this.#answer(request);
    /* A BODY NOBODY READ IS READ TO ITS END BEFORE THE ANSWER GOES. Every early answer here, and `serveApi`'s 404
       and 405, returned without touching the body the router was still streaming in, and the runtime then threw
       "Can't read from request stream after response has been sent" out of the request: `POST /api/<a typo>` with
       a body, or a `PUT` to a write, broke the object and the next request to the record answered 500
       "Network connection lost". */
    return drained(request, out);
  }

  async #answer(request: Request): Promise<Response> {
    if (this.#gone) return json({ ok: false, refusal: DELETED }, 503);
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

    /* A KEPT COPY'S DOOR ANSWERS AS THE LIST DOES, and not `ROUTE_UNKNOWN`. See `copyAsked`. */
    const copy = copyAsked(request.method, new URL(request.url).pathname);
    if (copy !== null) {
      const out = await copyRefusal(copy, () => api.snapshots(ctx));
      return json(out, httpStatus(out));
    }

    /**
     * SPARK'S ASK, AND THIS BRANCH IS THE WHOLE OF WHAT WAS MISSING. Three passes added the dependency, then
     * the builder, then the door, and each reported that the thirteenth package was reached; an audit drove it
     * each time and found the only callers were the tests naming them. `spark.ts` says where the mount belongs
     * in its own words, and this is that place: beside `servesMcp`'s branch and before `serveApi`, because
     * `servesApi` is a prefix test and `/api/spark/read` reaches this object already, where `serveApi` would
     * answer it `ROUTE_UNKNOWN: There is no method called spark/read.`
     *
     * A FIELD AND NOT A LOCAL, for the reason `sparkAskDoor` caches on the door it returns: a door built per
     * request runs `createSpark`'s two `CREATE TABLE IF NOT EXISTS` and its settings insert on every question.
     */
    if (servesSpark(new URL(request.url).pathname)) {
      /* A PERSON AND NOBODY ELSE, AS THE SECOND LOCK. The router refuses a bearer at this path, but the context is
         the only thing this object is told about the caller, and `inward()` has already taken the header the door
         would look for, so a token context forwarded here by any other branch would be answered as a person. */
      if (ctx.principal.kind !== 'person') return json({ ok: false, refusal: NO_SPARK_TOKEN }, 403);
      /* AND A SIGNED-IN PERSON, NOT THE DEMO. `DEMO_CONTEXT` is a person too, `p_demo` at `read`, and this lock
         answered it 200 with one model call, which on a live host opens the owner's `spark` key and spends the
         record's `ask_cap` for somebody who never signed in (`loop/research-batch-seventeen-audit.md` finding 5,
         `test/spark-demo.test.ts`). Only the router's GET-only `demoRecord` stood in the way. A session's context
         says `credentialed: true` and the demo's says `false`, so anything short of `true` is not a session. */
      if (ctx.credentialed !== true) return json({ ok: false, refusal: NO_SPARK_DEMO }, 403);
      this.#spark ??= workerSparkDoor(
        this.env,
        () => api,
        { sql: storageSql(this.ctx.storage), clock: { now: () => Date.now() } },
        new Set([`https://${this.env.PUBLIC_HOST ?? ''}`]),
      );
      return serveSpark(request, this.#spark, ctx);
    }

    /* SPARK'S DAILY LOOK, beside the answer and not in its way: the record says whether it is due, at most once a UTC day. */
    this.ctx.waitUntil(sparkLook(api));
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
    /* `RP_ID` NAMES A PARENT OF THE HOST, so a passkey made at `app.brain.dog` is still offered at `brain.dog` once the
       app moves there (`loop/research-one-domain.md` §3.0). A name the host is not under is no passkeys at all rather
       than a ceremony every browser fails, and unset is the exact host, which is what this was. */
    const rp = host ? relyingParty(`https://${host}`, this.env.RP_ID) : null;
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
            /* A SWITCH ASKS THE RECORD ITSELF, over RPC to its own object by id: `dir_member` still lists somebody
               `removeMember` took off it, and moving their browser there would answer "opened" to a record that
               refuses every read. */
            admits: async (record, person) => (await this.env.RECORD.get(this.env.RECORD.idFromName(record)).access(person)) !== null,
          }
        : undefined,
    );
    /* `createDirectory` imported its own copy, so this was the last one held as bytes. */
    mac?.fill(0);
    this.#mac = null;
    return this.#dir;
  }

  /**
   * Sign-in, whole: `/auth/*` arrives as an `AuthCall` and leaves as an `AuthResult`. And `session` with a `slug`, which
   * is how a request under `/app/<slug>` learns whether that name is this person's before any record is addressed.
   */
  auth(call: AuthCall | SessionAsk): Promise<AuthResult> {
    return this.#directory().auth(call);
  }

  /** The live name of a record, or `null` for one with none: where `GET /app` sends a session back to. */
  slugOf(record: string): string | null {
    return this.#directory().slugOf(record);
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

  /**
   * The operator's second half, once the record exists: the name now points at it. `null` is named.
   *
   * NOT `name`, WHICH IS THE STUB'S OWN. A Durable Object stub carries `name` as a property, the name its id
   * came from, so calling it through the stub read that and threw "is not a function": every `/auth/provision` made
   * a record, answered 500, and left the Directory naming nothing.
   */
  nameRecord(slug: string, email: string, record: string): Refusal | null {
    const named = this.#directory().provision({ slug, email, record });
    return named.ok ? null : refusalOf(named);
  }

  /** A deleted record's names, released. `null` is released; a refusal is a record the Directory does not hold. */
  close(record: string): Refusal | null {
    const out = this.#directory().close(record);
    return out.ok ? null : refusalOf(out);
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

  /**
   * The record a forwarded message's token names, by the token's SHA-256 in hex, or `null`.
   *
   * `/in/email/<token>` IS THE ONE ARRIVAL WHOSE PATH NAMES NO RECORD, so this is the whole of the
   * routing for it: `arrivals` hands what comes back through the same two refusals a webhook's path
   * segment goes through before it can become an argument to `idFromName`.
   *
   * IT IS ASKED WITH A DIGEST AND NEVER WITH THE TOKEN, and that is not a courtesy to the Directory.
   * The digest is what `serveIngest` computes from the path, so the tenant map stores and is queried
   * with 64 hex characters that open nothing: a copy of the Directory's storage is not a set of
   * mailbox keys. Answering is not an oracle either, for `knows`'s reason above: the answer is 26
   * random characters, and whoever asked already had the token that produced it.
   */
  recordFor(tokenHash: string): string | null {
    return this.#directory().recordFor(tokenHash);
  }

  /**
   * A record's forwarding address, registered, rotated or taken away: a digest writes it, `null` empties it.
   * `null` back is written, and a `Refusal` is a write that did not happen.
   *
   * THE OTHER HALF OF `recordFor`, AND IT WAS MISSING FOR A DAY. `feefa3f4` put the reader above on this object
   * and left the writer off it, so the index this Worker reads on every forwarded message was one nothing in
   * the deployment could write: measured on 2026-09-21 by grepping `apps/` and `packages/` for `inbound$`, whose
   * only callers were tests. `/api/inbound/mint` is the caller that needed it (`inbound.ts`).
   *
   * IT TAKES THE DIGEST AND CANNOT BE HANDED A TOKEN, which `inbound$` refuses with a sentence rather than
   * trusting its callers. So the tenant map holds 64 hex characters that open nothing, and this RPC hop carries
   * nothing that would open a door if it were logged at either end.
   */
  inbound$(record: string, tokenHash: string | null): Refusal | null {
    const out = this.#directory().inbound$(record, tokenHash);
    return out.ok ? null : refusalOf(out);
  }

  /**
   * Every record on this deployment that is still open, a page at a time. `51 §5.12` step 1.
   *
   * THE CURSOR IS THE LAST ID AND NOT AN OFFSET. A keyset page is stable while the walk runs: a
   * record provisioned at 03:18 shifts every offset after it by one, and an `OFFSET` walk would
   * skip the record that moved across the page boundary and never say which one.
   *
   * IT READS `dir_record` DIRECTLY, AND THAT IS A SEAM THIS FILE SHOULD NOT HOLD FOR LONG.
   * `createDirectory` in `packages/record/src/directory.ts` owns every other query against these
   * tables and has no `listRecords`; adding one there was not possible in the change that needed it.
   * The SQL below is the whole of the duplication, it is over the same storage the Directory writes,
   * and it belongs in `createDirectory` the moment that file can be edited.
   */
  listRecords(cursor?: string, limit = 500): { ids: string[]; cursor?: string } {
    /* THE MIGRATION FIRST. `dir_record` is made by `createDirectory`, so a Directory object whose
       first ever call was this one would read a table that does not exist yet. */
    this.#directory();
    const rows = storageSql(this.ctx.storage).all<{ id: string }>(
      'SELECT id FROM dir_record WHERE closed_at IS NULL AND id > ? ORDER BY id LIMIT ?',
      cursor ?? '',
      limit,
    );
    const ids = rows.map((r) => r.id);
    /* A FULL PAGE MEANS THERE MAY BE MORE, and a short one means there is not. Asking for one extra
       row to be sure would be a second answer to "how big is a page" for one saved round trip a night. */
    return ids.length === limit ? { ids, cursor: ids[ids.length - 1] ?? '' } : { ids };
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

  /**
   * The person an invitation makes, found or made by address, under the name the page sent if the row is new.
   *
   * THE NAME GOES IN AND COMES BACK OUT. This called `person$(email)` with one argument and answered `{ id, email }`,
   * so a name typed on the invitation page never reached the Directory and could not reach the record's mirror,
   * which is the row People draws. `serveInvite` has already refused or cleared a hostile name before this runs.
   */
  invitee(email: string, name?: string): Result<{ id: string; email: string; name: string | null }> {
    const made = this.#directory().person$(email, name);
    return made.ok ? { ok: true, value: { id: made.value.id, email: made.value.email, name: made.value.name } } : made;
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
   * no level and no lists, which is a person the Directory still lists and the record has since
   * removed, and keeps a one-list member with `level: null` and the lists they hold.
   */
  async recordsFor(person: string): Promise<SwitcherRow[]> {
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
    /* ASKED ONLY UNDER `/app/<slug>`, to hold the path to the record the bearer names. */
    named: async (slug) => (await directory.resolve(slug))?.record ?? null,
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

  /**
   * The cron fired: the nightly walk, one copy per record. `53 §5.1`, `51 §5.12`.
   *
   * AN ABSENT BUCKET THROWS RATHER THAN RETURNS. A `scheduled()` that quietly did nothing on a
   * deployment with no `BLOBS` binding is the exact failure this whole path exists to prevent: the
   * cron shows green every night, and the absence of copies is found by the person who needed one.
   * Throwing marks the invocation failed, which is a red row in the dashboard and a line in the tail.
   *
   * WHAT IS NOT HERE YET IS 53 §5.1's OTHER FOUR STEPS: the KEK re-wrap, the erasure reconcile, the
   * billing ladder and the ops record's `log` note. They belong in `ops.ts` beside this call and
   * need `opsReport` and `rewrapKeys`, which this build does not have. The backup is the step the
   * record cannot survive without, so it is the step that landed first.
   */
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await nightly(env);
  },
};

/** The walk, wired to the Directory, the objects and the bucket. Exported from nowhere: the cron is its one caller. */
async function nightly(env: Env): Promise<void> {
  if (!env.BLOBS)
    throw new Error('The nightly copy did not run: this deployment has no BLOBS binding, so there is nowhere to put one.');
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const copies = r2Snapshots(env.BLOBS, { recipient: env.AGE_RECIPIENT ?? '' });
  /* ONE INSTANT FOR THE WHOLE WALK, so every copy taken tonight is filed under tonight's date even
     when the walk crosses midnight UTC. Two dates in one run would leave a day with two copies and
     the next with none, and the retention count would be counting nights that are not nights. */
  const at = new Date().toISOString();
  /* THE TALLY IS SAID AND NOT RETURNED. `53 §5.1` step 5 is a person reading the closing line the
     morning after; the ops record's `log` note needs a record to write it to, which is `ops.ts`'s
     half of this and not built. Nothing else reads the numbers yet. */
  const walked = await nightlyWalk({
    records: async (cursor) => directory.listRecords(cursor),
    snapshot: async (record) => copies.take(record, await env.RECORD.get(env.RECORD.idFromName(record)).dump(at)),
    say: (line) => {
      console.log(line);
    },
    moan: (line) => {
      console.error(line);
    },
    now: () => Date.now(),
  });
  /* AND A NIGHT THAT COPIED NOTHING MAKES THE INVOCATION ITSELF RED. Every per-record failure is
     already in the tail, but a tail is read by somebody who is already worried; a failed cron run
     is what tells them to be. */
  const fleet = fleetFailure(walked);
  if (fleet) throw new Error(fleet);
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    /* THE OLD HOST FIRST, AND ONLY FOR A PAGE LOAD (`loop/research-one-domain.md` §2.5). `legacyRedirect` answers
       `null` for every path this Worker serves itself, the build id and sign-in included, so an agent, a webhook
       sender and a stale tab on `app.brain.dog` are served where they stand. Unset `LEGACY_HOSTS` is no host at all. */
    const moved = legacyRedirect(request, env.LEGACY_HOSTS, env.PUBLIC_HOST);
    if (moved) return moved;
    /* THE DEPLOYMENT'S OWN BUILD ID, BEFORE ANYTHING ELSE, because it asks nothing of the Directory,
       of a record or of whoever is calling. */
    if (servesBuild(url.pathname)) return buildId(env);
    /* SIGN-IN FIRST, AND IT IS THE DIRECTORY'S: nothing under `/auth/` reaches a record. */
    if (servesAuth(url.pathname)) return signIn(request, env, ctx);
    if (servesAccount(url.pathname)) return account(request, env);
    /* AN AGENT'S MCP CLIENT, BEFORE ANY DOOR IS ASKED, so neither the cookie nor the demo is ever read for it. */
    if (servesMcp(url.pathname)) return agent(request, env);
    /* `/in/*`: SOMETHING ARRIVES FROM OUTSIDE AND NOBODY IS ASKED WHO IT IS (`33 §4`, `51 §5.4`, `12 §3`).
       BEFORE EVERY DOOR, so neither the cookie nor the public demo is read for it: an arrival is above the
       auth gate by design, and what stands in for a principal is whether the payload was verified, which
       decides only whether the stored row may match. It is also before `servesApi`'s `ROUTE_UNKNOWN`, which
       returns for everything it does not recognise, and before the app shell, which would answer a bank's
       webhook with `index.html` and a 200 that its retry logic reads as delivered. `serveIngest` holds the
       whole order from here, including the 404 for the shape this host does not serve. */
    if (servesIn(url.pathname)) return serveIngest(request, cloudIngest(arrivals(env)));
    /* THE KEY DOORS, before any door is asked: their bearer is a vault grant, and neither a cookie nor a login
       token may reach them. */
    if (servesVault(url.pathname)) return keyDoor(request, env);
    /* `/app` IS THE APP, AND `/app/<slug>/api/*` IS THAT RECORD'S API (§2.4). The slug is stripped here, because no
       route pattern can pick it out, and handed to the door, which has the Directory check it before anything is
       addressed. AFTER THE ROOT'S OWN DOORS, which none of its paths can reach: every one of them is a prefix that
       `/app` is not. Nothing routes `/app` to this Worker until `wrangler.jsonc` lists it, so this is dark until then. */
    const app = appPath(url.pathname);
    if (app !== null) return servesApi(app.rest) ? recordApi(atRoot(request, app.rest), env, app.slug) : appPage(request, env, app);
    if (!servesApi(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }, 404);
    return recordApi(request, env, null);
}

/**
 * A record method, at `/api/<method>` with `slug` null, or at `/app/<slug>/api/<method>` with the request already moved
 * to the root path by `atRoot`.
 *
 * ONE BODY FOR BOTH ADDRESSES, so the slug is one more argument to the same doors rather than a second router that
 * could drift from the first. Under a slug a cookie means that record once the Directory says it is theirs, a bearer
 * must name the same record, and the demo never answers.
 */
async function recordApi(request: Request, env: Env, slug: string | null): Promise<Response> {
    const url = new URL(request.url);
    /* THE KEY DOORS NAME THEIR RECORD BY THE GRANT, AND ONLY AT THE ROOT. A grant under a slug would be a second way to
       say which record, and the vault is the last place to accept two answers to that. */
    if (slug !== null && servesVault(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The key doors are at /api/vault/, and a grant names its own record.' } }, 404);

    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));

    /* WHICH DOOR, in `session.ts`'s order and nowhere else: a bearer, the session cookie, the public demo,
       or none. A cookie that names no session is a 401 that clears it, and never the demo. */
    const door = await doorOf(request, {
      origin: `https://${env.PUBLIC_HOST ?? ''}`,
      demo: env.DEMO_RECORD,
      session: (sid, slug) => directory.auth({ flow: 'session', sid, ...(slug === undefined ? {} : { slug }) }) as unknown as Promise<AuthResult<Who>>,
      access: (record, person) => env.RECORD.get(env.RECORD.idFromName(record)).access(person),
    }, slug);

    /* THE APP'S OWN KEY DOORS ARE A BROWSER SESSION'S AND NOBODY ELSE'S. `/api/keys/*` is not a record method, so
       it is answered here rather than forwarded; every other door reaching it is refused with the record's own
       sentence rather than with a route that does not exist. */
    const keysAsked = servesKeys(url.pathname) !== null;

    /* AND THE FORWARDING ADDRESS IS THE OTHER ONE, for the same reason and with the opposite half of the
       platform behind it: `/api/inbound/*` writes the DIRECTORY's `dir_inbound`, not the record, so it cannot
       be a record method however much its path looks like one. It is here rather than above `doorOf` because
       a mint needs to know who is asking, which is precisely what `/in/*` three branches up does not. */
    const mintAsked = servesInbound(url.pathname) !== null;

    /* THE PUBLIC DEMO: nothing the caller sent names it, and `demoRecord` says everything it opens. It skips
       the Directory on purpose. The Directory answers which record a NAME means, and this has no name,
       only the deployment's constant. */
    if (door.door === 'demo') {
      if (keysAsked) return noSession();
      /* AND THE DEMO MINTS NOTHING. `demoRecord` admits only a GET whose name is in `ROUTES`, and a mint is
         neither, so this is unreachable today and written anyway: the demo record is the one surface somebody
         reaches without signing in, and an address minted on it would be a live door into the sample. */
      if (mintAsked) return json({ ok: false, refusal: NO_MINT_SESSION }, 403);
      return env.RECORD.get(env.RECORD.idFromName(door.record)).fetch(inward(request, door.ctx));
    }

    /* A PERSON, on the record their session names, and a rotation rides back on the record's answer. The
       record authorises exactly as it does for a bearer: every check is inside `createRecordApi`. */
    if (door.door === 'session')
      return withCookie(
        keysAsked
          ? await appKeys(request, env, door.record, door.ctx)
          : mintAsked
            ? await mailAddress(request, env, door.record, door.ctx)
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

    /* NOR SPARK'S ASK, FOR THE SAME REASON AND BECAUSE THE DOOR CANNOT SAY IT HERE. `serveSpark` refuses any
       `authorization` header, but `inward()` below deletes that header, so on this host the door never saw one and
       the `Origin` check was all that stood: a read token sending the app's own origin by hand was answered 200 with a
       Reading, and each ask opened the person's own vault key and spent the month's `ask_cap` (`46 §5.2`, measured
       in `test/spark.test.ts`). A cookie reaches it above; a bearer is refused here, in the door's own words. */
    if (servesSpark(url.pathname) !== null) return json({ ok: false, refusal: NO_SPARK_TOKEN }, 403);

    /* NOR MAY AN AGENT MOVE A RECORD'S MAIL. A bearer works from anywhere for thirty days, so a token that could
       rotate the forwarding address could take over a record's incoming statements without anybody signing in,
       and a token that could revoke one could stop them arriving silently. `serveInbound` refuses the header
       itself for a host that wires it differently; this is the branch that never reaches it. */
    if (mintAsked) return json({ ok: false, refusal: NO_MINT_SESSION }, 403);

    /* A BEARER. This Worker serves MANY records, and a request that says who it is by nothing but the
       header it carries says so here, or not at all. `session.ts` holds the path, and `/mcp` takes the same one. */
    const found = await bearerOf(request, 'api', bearerDeps(env), slug);
    if ('status' in found) return found.status === 403 ? json({ ok: false, refusal: found.refusal }, 403) : unauthorized(env);

    /* THE WORKER AUTHENTICATES AND THE RECORD AUTHORISES, and neither does the other's half. Every check about
       what a caller may do is inside `createRecordApi`, so the CLI and the MCP server answer to the same ladder
       as the browser. `inward` writes the context over whatever the caller sent and drops the bearer. */
    return env.RECORD.get(env.RECORD.idFromName(found.record)).fetch(inward(request, found.ctx));
}

/**
 * A page of the app under `/app`: bare `/app` goes back to the last record, a file beside the pages is that file, and
 * everything else is the shell, which reads the path itself.
 *
 * THE WORKER DRAWS THE SHELL BECAUSE THE ASSETS NO LONGER DO. With `/app/*` in `run_worker_first` and
 * `not_found_handling: none` (`loop/research-one-domain.md` §2.2), an app navigation reaches this function and not a
 * fallback, so `/app/acme/r/tasks` has to be answered with `/app/`'s bytes here. Under a slug no file is looked for:
 * a record's page is always the shell, and the shell's `boot` under that slug is where a stranger meets sign-in.
 *
 * A FILE MISSING IS A 404, AND ONLY A PAGE IS THE SHELL. A path whose last segment has an extension is a file, and
 * answering a missing one with `index.html` and a 200 is the fault the self-host already refuses for `/_app/`.
 */
async function appPage(request: Request, env: Env, app: AppPath): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A page of the app is read; a record method is at /app/<slug>/api/<method>.' } }, 405, [['allow', 'GET, HEAD']]);
  const assets = env.ASSETS;
  if (!assets) return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This deployment serves no app, only its API.' } }, 404);
  /* EVERY ANSWER THE ASSETS GIVE HERE IS A PAGE OF THE APP, OR A FILE BESIDE ONE, and leaves with `asPage`'s four
     headers: measured on production, the shell and the sign-in page carried none (`loop/research-push-a-live.md`
     finding 1). The 302 `appEntry` answers for bare `/app` is not wrapped, because a frame follows it to the shell. */
  const shell = async () => asPage(await assets.fetch(new Request(new URL('/app/', request.url), { method: request.method })));
  if (app.slug === null && app.rest === '/') {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    return appEntry(request, {
      session: (sid) => directory.auth({ flow: 'session', sid }) as unknown as Promise<AuthResult<Who>>,
      slugOf: async (record) => directory.slugOf(record),
      shell,
    });
  }
  if (app.slug === null) {
    const file = await assets.fetch(request);
    if (file.status !== 404 || /\.[A-Za-z0-9]+$/.test(app.rest)) return asPage(file);
  }
  return shell();
}

/**
 * What every `/in/*` arrival on this isolate is counted against.
 *
 * AT MODULE SCOPE ON PURPOSE, AND IT IS THE ONLY MUTABLE STATE THIS FILE KEEPS THERE. A counter built per
 * request counts to one and refuses nothing; the budget has to outlive the request to be a budget at all.
 * What it holds is a count and a deadline per path, so an evicted isolate loses a brake and never a row,
 * and nothing about one record is readable from it by another. `route.ts`'s own header says plainly what
 * this does and does not promise: it is per isolate, which makes it a brake on a loop and not a quota.
 */
const spendArrival = ingestBudget(() => Date.now());

/**
 * The Cloud's half of the arrival door: the Directory, the object, and the brake above.
 *
 * THE DIRECTORY ANSWERS FIRST AND IT IS NOT A FORMALITY. `idFromName` on a name nobody has CREATES the
 * object, and this is the one surface reached with no credential, so an unchecked id in the path is a
 * stranger minting empty records until the account's storage runs out. `knows` also excludes a closed
 * record, so a deleted record's old webhook URL answers 404 without waking anything.
 */
function arrivals(env: Env): CloudIngestDeps {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return {
    knows: (rec) => directory.knows(rec),
    verifies: (rec, ingest) => env.RECORD.get(env.RECORD.idFromName(rec)).ingestVerify({ ingest }),
    /* THE BYTES, THE FLAG AND THE INGEST, AND NOTHING ELSE OF THE URL. The record id was the address and
       the token was the proof; the ingest is what the token was checked against, and without it the
       record offered a verified webhook to every webhook pattern in declaration order
       (test/arrive-ingest.test.ts). Mail names none. */
    arrives: (rec, arrival) =>
      env.RECORD.get(env.RECORD.idFromName(rec)).arrive({
        channel: arrival.channel,
        headers: arrival.headers,
        body: arrival.body,
        sha256: arrival.sha256,
        verified: arrival.verified,
        ...(arrival.ingest === undefined ? {} : { ingest: arrival.ingest }),
      }),
    spends: async (ask) => spendArrival(`${ask.channel}:${ask.key}`),
    /* AND THE MAIL DOOR, WHICH WAS THE ONE KEY MISSING AND THEREFORE THE WHOLE SURFACE. `cloudIngest`
       spreads no `inbound` when this object has none, and `serveIngest` then answers 404 for all of
       `/in/email/*`, the way `/auth/provision` answers `off()` with no operator key set. That is what
       the hosted Worker gave every forwarded message until 2026-09-21, measured against it: four keys
       were written here where five were needed, with the dispatch, the parse, the budget and the
       record's own `arrive` finished and green above them. `route.test.ts` now reads this file for the
       key, because the fault was invisible to every test that supplied an index of its own. */
    inbound: { recordFor: (h) => directory.recordFor(h) },
  };
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

/** What a token gets at `/api/spark/read`, from the router and from the object. The sentence is `serveSpark`'s own. */
const NO_SPARK_TOKEN: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this in the app; a token cannot ask Spark about this record.', at: 'principal' };
/** What the public demo, or any context that is not a signed-in session, gets at `/api/spark/read` from the object. */
const NO_SPARK_DEMO: Refusal = { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in to ask Spark about a record.', at: 'principal' };

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
 * `/api/inbound/*`: the record's forwarding address, for the browser session `doorOf` has already resolved.
 *
 * THE RECORD IS THE SESSION'S, as it is at `/api/keys/*`. Nothing in the request names a record, so there is no
 * way for one owner to mint an address onto somebody else's: what `inbound$` is handed is the id the cookie
 * resolved to. Which is also why this passes `id` and not a slug, since `dir_inbound.record` joins `dir_record`.
 *
 * THE DIRECTORY IS THE ONLY THING ASKED, and the record's own object is never woken. A forwarding address is a
 * fact about the tenant map rather than about the record's contents, which is what makes `/in/email/<token>`
 * resolvable before any object is addressed at all.
 */
function mailAddress(request: Request, env: Env, id: string, ctx: CallContext): Promise<Response> {
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return serveInbound(
    request,
    {
      origins: new Set([`https://${env.PUBLIC_HOST ?? ''}`]),
      registers: async (hash) => {
        const stop = await directory.inbound$(id, hash);
        return stop === null ? { ok: true, value: null } : { ok: false, refusal: stop };
      },
    },
    ctx,
  );
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
  /* THE ZONE IS READ FROM A COPY OF THE BODY, because `operated()` in `packages/host/src/auth.ts` hands `provision`
     the slug, the email and the name and drops every other field, so a `tz` in the body never arrived here and every
     record was made in `UTC` (`loop/research-first-sign-in.md` friction 12). The copy is read only inside the
     `provision` callback, which `operated()` calls after it has checked the operator key and parsed the same bytes as
     a JSON object, so an unauthenticated POST never has its copy read. When `operated()` forwards `tz` itself, this
     copy and `askedZone` go. */
  const copy = request.method === 'POST' && url.pathname.replace(/\/+$/, '') === '/auth/provision' ? request.clone() : null;
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
    operator: { key: env.PROVISION_KEY, provision: async (args) => provision(env, { ...args, tz: await askedZone(copy) }) },
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
      if (!out.ok) return out;
      const joined = (await directory.joinRecord(found.id, person.id)) as unknown as Result<null>;
      if (!joined.ok) return joined;
      /* THE SLUG OF THE RECORD JUST JOINED, so `serveInvite` can move a signed-in person's session onto it. This
         answered the join's `null`, and a colleague who owns a record of their own was told they were on the invited
         one while their cookie still opened theirs (`loop/research-invite-landing.md` finding 2,
         `test/invite-accept.test.ts`). `reaches` and not `resolve`, because the token names an id and the name is
         the Directory's to say. A record with no live name answers `null`, and the session stays where it was. */
      const slug = (await directory.reaches(person.id)).find((r) => r.record === found.id)?.slug ?? null;
      return { ok: true, value: { slug } };
    },
    known: async (email) => Boolean(await directory.inviteKnown(email)),
    person: async (email, name) => (await directory.invitee(email, name)) as unknown as Result<{ id: string; email: string; name: string | null }>,
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

/** What a provision body said at `tz`, or nothing: the copy is the request `signIn` cloned, and `null` off that route. */
async function askedZone(copy: Request | null): Promise<unknown> {
  if (!copy) return undefined;
  try {
    return (JSON.parse(await copy.text()) as { tz?: unknown } | null)?.tz;
  } catch {
    return undefined;
  }
}

/**
 * A provision body's zone in the runtime's own spelling, `UTC` when it named none, and `null` when it is not a zone.
 *
 * CHECKED BY `Intl` AND NOT BY A LIST, for the reason `createRecord` gives: a table of zones is wrong the next time a
 * government moves one. `resolvedOptions` answers the canonical name, so `europe/london` is stored as `Europe/London`
 * and `GB` as `Europe/London` too, measured on Node 24.13.
 *
 * AN OFFSET IS NOT A ZONE. `Intl` accepts `+01:00` and answers it back unchanged, and a record in `+01:00` is an hour
 * out for the half of the year London is not on summer time. It is refused here rather than stored.
 *
 * AND AN OFFSET SPELLED AS A ZONE IS AN OFFSET, SO THE SPELLING TYPED IS READ AS WELL AS THE ONE `Intl` ANSWERS.
 * Measured on Node 24.13 (ICU 77.1, tz 2025b) and in workerd (`loop/research-batch-forty-six-audit.md` §8): `Etc/GMT-3`
 * is answered back as itself and is `+03:00` under a zone's name, and `EST` is answered as `America/Panama`, which reads
 * like any region's zone and has no summer time, so a record typed `EST` from New York is an hour out from March to
 * November. The answer cannot tell `EST` from somebody who meant Panama, which is why the typed word is the test.
 * `Etc/UTC` and `Etc/GMT` stay, because UTC is not an offset from anywhere; `Intl` answers both `UTC`.
 * `SystemV/` goes whole: ICU still knows its twelve names though the tz database dropped them, answers each back as
 * itself, and `SystemV/EST5` was stored as a fixed -05:00 after the `Etc/` rule went in. The six with a summer rule are
 * not places either, and a reader outside ICU need not know them.
 */
function zoneOf(asked: unknown): string | null {
  if (asked === undefined || asked === null) return 'UTC';
  if (typeof asked !== 'string') return null;
  const typed = asked.trim().toUpperCase();
  if (OFFSET_NAMES.has(typed)) return null;
  if (typed.startsWith('ETC/') && typed !== 'ETC/UTC' && typed !== 'ETC/GMT') return null;
  if (typed.startsWith('SYSTEMV/')) return null;
  try {
    const zone = new Intl.DateTimeFormat('en', { timeZone: asked.trim() }).resolvedOptions().timeZone;
    return /^[+-]/.test(zone) ? null : zone;
  } catch {
    return null;
  }
}

/**
 * The three abbreviations the tz database keeps as fixed offsets under a name of their own, in upper case.
 *
 * NOT `EST5EDT` AND ITS KIND, which carry the rule for summer time and are answered as `America/New_York`: those are an
 * old spelling of a place and arrive at the right arithmetic. These three do not, whatever `Intl` names them.
 */
const OFFSET_NAMES: ReadonlySet<string> = new Set(['EST', 'MST', 'HST']);

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
 * WITH ITS THREE KEYS WRAPPED WHEN `KEK` IS BOUND, and refused when it is not. `createRecord` takes the keys
 * wrapped, and absent until there is something to wrap them with. A record made without them reads, writes and signs
 * people in; it cannot seal a grant or sign an export, and binding `KEK` later does not give it keys. That is the one
 * provisioning mistake with no repair short of throwing the record away, and the Directory never reissues its name,
 * so `keylessRefusal` answers for it here instead of letting it through in silence.
 *
 * THE STORE IS OPENED FIRST, so a bound value that is not a key refuses before the Directory writes anything, and so
 * the keyless guard decides before `prepare` has minted a person and claimed a slug.
 *
 * AND THE ZONE BEFORE EITHER. `createRecord` refuses a zone it cannot read, but it runs inside the record, after
 * `prepare` has written the owner as a `dir_person` row, so a mistyped zone refused there would leave a person in the
 * Directory with no record behind them. Measured by moving this check after `prepare`: `test/provision-tz.test.ts`
 * counted one more `dir_person` on `Mars/Olympus` and failed.
 */
async function provision(env: Env, args: { slug: string; email: string; name?: string; tz?: unknown }): Promise<Result<Provisioned>> {
  const tz = zoneOf(args.tz);
  if (tz === null)
    return {
      ok: false,
      refusal: {
        code: 'VALUE_MALFORMED',
        fix: 'tz takes a time zone that is a place, such as Europe/London or America/New_York, and not an offset or an abbreviation such as EST, or is left out for UTC.',
        at: 'tz',
      },
    };
  /* A NAME HOLDING `<` OR `>` IS A PLACEHOLDER NOBODY EDITED, AND IT IS KEPT FOR GOOD. `provision-check.mjs` printed
     `name = '<your name>'` to be changed by hand, the slug and the email each refused their placeholder, and this one
     was taken: `personName` in `packages/host/src/auth.ts` allows angle brackets, so the owner's `me` and his passkey's
     display name said `<your name>` (`loop/research-batch-forty-six-audit.md` §7). Refused here, before `prepare` writes
     a person, so the retry with his name is still a first provision. */
  if (args.name !== undefined && /[<>]/.test(args.name))
    return {
      ok: false,
      refusal: {
        code: 'VALUE_MALFORMED',
        fix: 'name is the owner’s name as the passkey will show it, and a name holds no < or >: type the name itself in place of the placeholder.',
        at: 'name',
      },
    };
  const store = await keyStoreOf(env.KEK);
  const keyless = keylessRefusal(store, env.PROVISION_WITHOUT_KEYS);
  if (keyless) return { ok: false, refusal: keyless };
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
    tz,
    locale: 'en',
    owner: { id: owner.id, email: owner.email, name: owner.name },
    ...(store ? { keys: await recordKeys(store, id) } : {}),
  });
  if (made) return { ok: false, refusal: made };
  const unnamed = await directory.nameRecord(args.slug, args.email, id);
  if (unnamed) return { ok: false, refusal: unnamed };
  return ok({ record: id, slug: args.slug, person: owner.id });
}
