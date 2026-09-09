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
import type { OutboxRow } from '@braindog/kernel';
import { createRecordApi, type CallContext, type RecordApi } from '@braindog/record';
import type { Param, Row, Scheduler, Sql } from '@braindog/ports';

import { createDirectory, type Directory as Dir } from '@braindog/record/directory';

import { alarmScheduler } from './alarm.ts';
import { DELIVERS, makeDeliver } from './deliver.ts';
import { consume, pump } from './pump.ts';
import { recordOf, servesApi } from './route.ts';

type EmailBinding = { send(message: { to: string; subject: string; text: string }): Promise<void> };

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
};

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

  override async fetch(request: Request): Promise<Response> {
    const api = await this.#record();

    const refused = api.kernel.refused();
    if (refused)
      return new Response(JSON.stringify({ ok: false, refusal: refused }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

    /* The context arrives from the Worker, which did the authentication. The record does the
       AUTHORISATION — every permission check is inside `createRecordApi`, one place, so the CLI and
       the MCP server answer to the same ladder as the browser. */
    const ctx = JSON.parse(request.headers.get('x-braindog-ctx') ?? 'null') as CallContext | null;
    if (!ctx)
      return new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This record needs a caller.' } }), {
        status: 401,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

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

  #directory(): Dir {
    this.#dir ??= createDirectory(storageSql(this.ctx.storage), { now: () => Date.now() });
    return this.#dir;
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
 */
const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * The one answer to every way of not being let in.
 *
 * ONE SENTENCE FOR ALL THREE — no bearer, a bearer this record does not know, and a name no record
 * has. They were three different answers, and the difference between the third and the other two is
 * readable without any credential at all: it said which names exist.
 */
const unauthorized = (): Response =>
  json({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This record needs a bearer it knows. Mint one from the app.' } }, 401);

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
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
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

async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!servesApi(url.pathname))
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }, 404);

    /* NOTHING GETS IN WITHOUT SAYING WHO IT IS. This Worker serves MANY records; an unauthenticated
       request falling back to a constant person is that person's access on whichever record was
       named, which on a multi-tenant host is not a default, it is a hole. A self-host has one person
       on one machine and can have one; this cannot.

       BROWSER SESSIONS ARE THE OTHER HALF and they are not built — sessions, passkeys and magic
       links live in the Directory (ADR-061). Until they are, a bearer is the only way in, and saying
       so is better than letting everybody in while the sentence explains why. */
    const named = recordOf(request.headers.get('authorization'));
    if (!named) return unauthorized();

    /* AND THE DIRECTORY IS ASKED WHETHER THAT ADDRESS IS ONE OF OURS, before it is used as one.
       `idFromName` on a name nobody has does not fail — it CREATES the object, and `#record()` then
       runs the migrations, which writes storage. Routing on an unverified id would be an open
       invitation to mint empty billable records, one forged bearer at a time. The id is 26 random
       characters, so answering is not an oracle: nobody guesses their way to a `true`. */
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
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
    const inner = new Request(request);
    /* AND THE REGISTER CEILING TRAVELS WITH IT, or a person invited to one register reaches every
       one of them — which is the whole of what "invite the bookkeeper" was supposed to mean. */
    inner.headers.set(
      'x-braindog-ctx',
      JSON.stringify({
        principal,
        ...(held.registers === null ? {} : { registers: held.registers }),
        ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels as CallContext['levels'] }),
      } satisfies CallContext),
    );
    /* AND THE BEARER DOES NOT TRAVEL FURTHER. The record has no use for it and every hop a
       credential takes is another place it can be logged. */
    inner.headers.delete('authorization');
    return record.fetch(inner);
}
