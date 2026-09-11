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

import { handlersFor, serveApi } from '@braindog/host';
import { deriveSessionKey, relyingParty, serveAuth, type Provisioned } from '@braindog/host/auth';
import { ulids, type CreateRecordArgs, type OutboxRow } from '@braindog/kernel';
import { createRecordApi, type CallContext, type RecordApi } from '@braindog/record';
import { fixOf, ok, refused } from '@braindog/ports';
import type { Auth, AuthCall, AuthResult, Param, Refusal, Result, Row, Scheduler, Sql, Who } from '@braindog/ports';

import { createDirectory, type Directory as Dir } from '@braindog/record/directory';

import { alarmScheduler } from './alarm.ts';
import { DELIVERS, makeDeliver } from './deliver.ts';
import { consume, pump } from './pump.ts';
import { inward, isRecordId, recordOf, servesApi, servesAuth } from './route.ts';
import { doorOf, withCookie } from './session.ts';

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
   * a `.dog` file. `registers` is the ceiling and `null` is all of them.
   */
  async access(
    person: string,
  ): Promise<{ level: string | null; registers: string[] | null; levels: Record<string, string> } | null> {
    const api = await this.#record();
    return api.kernel.access(person);
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

/** Where a call came from, for the "last used" line on a token listing. */
/**
 * Where a call came from, for the "last used" line on a token listing.
 *
 * THE PATH IS THE CALLER'S TO WRITE, so it is matched at the root rather than anywhere in the
 * string. `includes('/mcp')` made `POST /api/list/mcp` record `mcp` on somebody's token before the
 * method lookup 404'd it — a forgeable line in the one place a person decides what to revoke.
 */
const surfaceOf = (url: URL): string => (/^\/+mcp(?:\/|$)/.test(url.pathname) ? 'mcp' : 'api');

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
const unauthorized = (): Response =>
  json(
    {
      ok: false,
      refusal: {
        code: 'UNAUTHORIZED',
        fix: 'This record takes a bearer token it already knows, and there is no way to be issued one yet: sign-up is not built. https://brain.dog/changelog says what is.',
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
    /* SIGN-IN FIRST, AND IT IS THE DIRECTORY'S: nothing under `/auth/` reaches a record. */
    if (servesAuth(url.pathname)) return signIn(request, env, ctx);
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

    /* THE PUBLIC DEMO: nothing the caller sent names it, and `demoRecord` says everything it opens. It skips
       the Directory on purpose. The Directory answers which record a NAME means, and this has no name,
       only the deployment's constant. */
    if (door.door === 'demo') return env.RECORD.get(env.RECORD.idFromName(door.record)).fetch(inward(request, door.ctx));

    /* A PERSON, on the record their session names, and a rotation rides back on the record's answer. The
       record authorises exactly as it does for a bearer: every check is inside `createRecordApi`. */
    if (door.door === 'session')
      return withCookie(await env.RECORD.get(env.RECORD.idFromName(door.record)).fetch(inward(request, door.ctx)), door.cookie);

    if (door.door === 'refused') {
      if (door.status === 401 && door.refusal === undefined) return unauthorized();
      const extra: [string, string][] = door.retryAfter === undefined ? [] : [['retry-after', String(door.retryAfter)]];
      const body = door.refusal !== undefined ? { ok: false, refusal: door.refusal } : door.retryAfter === undefined ? { ok: false } : { ok: false, retryAfter: door.retryAfter };
      return withCookie(json(body, door.status, extra), door.cookie);
    }

    /* A BEARER. This Worker serves MANY records, and a request that says who it is by nothing but the
       header it carries says so here, or not at all. */
    const named = recordOf(request.headers.get('authorization'));
    if (!named) return unauthorized();

    /* AND THE DIRECTORY IS ASKED WHETHER THAT ADDRESS IS ONE OF OURS, before it is used as one.
       `idFromName` on a name nobody has does not fail — it CREATES the object, and `#record()` then
       runs the migrations, which writes storage. Routing on an unverified id would be an open
       invitation to mint empty billable records, one forged bearer at a time. The id is 26 random
       characters, so answering is not an oracle: nobody guesses their way to a `true`. */
    if (!(await directory.knows(named))) return unauthorized();

    const record = env.RECORD.get(env.RECORD.idFromName(named));

    /* THE WORKER AUTHENTICATES AND THE RECORD AUTHORISES, and neither does the other's half. This
       resolves WHO is asking and at what LEVEL; every check about what they may do with it is inside
       `createRecordApi`, in one place, so the CLI and the MCP server answer to the same ladder as the
       browser.

       THE BEARER'S OWN RECORD IS CHECKED AGAIN, INSIDE. Reading the id out of it here is a claim;
       `verifyToken` refuses a bearer whose record half is not the object's own, which is what makes
       the claim safe to route on. */
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    const seen = bearer ? await record.verify(bearer, surfaceOf(url)) : null;
    if (!seen) return unauthorized();

    /* THE RECORD SAYS WHAT SOMEBODY MAY DO INSIDE IT. The Directory said which record the NAME meant
       and nothing more — a level read from there is a level `invite` and `remove` do not write, so
       removing somebody would not have stopped them writing. */
    const person = seen.person_id;
    const held = await record.access(person);
    if (!held) return json({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'You are not on this record.' } }, 403);
    const level = held.level as 'read' | 'append' | 'write' | 'decide' | 'owner';

    /* THE INTERSECTION IS THE RECORD'S TO COMPUTE. What goes over is both halves — the token's
       scope and the person's level — because a token says what its holder may do with their access
       and never what access they have. */
    const principal: CallContext['principal'] = seen
      ? { kind: 'token', id: seen.id, scope: seen.scope as 'read' | 'propose' | 'write', person, level }
      : { kind: 'person', id: person, level };

    /* THE PATH TRAVELS UNCHANGED, because there is no prefix left to strip. `serveApi` reads the
       method out of `/api/<method>` on both hosts, from the same table. */
    /* AND THE REGISTER CEILING TRAVELS WITH IT, or a person invited to one register reaches every
       one of them — which is the whole of what "invite the bookkeeper" was supposed to mean.
       `inward` writes the context over whatever the caller sent and drops the bearer, the same way
       for both doors. */
    return record.fetch(
      inward(request, {
        principal,
        ...(held.registers === null ? {} : { registers: held.registers }),
        ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels as CallContext['levels'] }),
      }),
    );
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
  });
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
 * WITHOUT VAULT KEYS UNTIL THE KEK BINDING IS LIVE. `createRecord` takes the three keys wrapped, and absent
 * until there is something to wrap them with, and this Worker has no KeyStore yet. Such a record reads,
 * writes and signs people in; it cannot seal a grant or sign an export until keys are wrapped for it.
 */
async function provision(env: Env, args: { slug: string; email: string; name?: string }): Promise<Result<Provisioned>> {
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
  });
  if (made) return { ok: false, refusal: made };
  const unnamed = await directory.name(args.slug, args.email, id);
  if (unnamed) return { ok: false, refusal: unnamed };
  return ok({ record: id, slug: args.slug, person: owner.id });
}
