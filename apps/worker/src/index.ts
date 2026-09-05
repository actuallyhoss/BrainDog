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
import { createRecordApi, type CallContext, type RecordApi } from '@braindog/record';
import type { Param, Row, Scheduler, Sql } from '@braindog/ports';

import { createDirectory, type Directory as Dir, type Level } from '@braindog/record/directory';

import { alarmScheduler } from './alarm.ts';
import { DELIVERS, makeDeliver } from './deliver.ts';
import { recordPath } from './route.ts';

type EmailBinding = { send(message: { to: string; subject: string; text: string }): Promise<void> };

type Env = {
  RECORD: DurableObjectNamespace<Record$>;
  DIRECTORY: DurableObjectNamespace<Directory$>;
  /** The doorbell. Its message is `{ record }` and never a payload — 51 §13 D16. */
  INGRESS: Queue<{ record: string }>;
  EMAIL?: EmailBinding;
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
    this.#api ??= (async () => {
      let api!: RecordApi;
      await this.ctx.blockConcurrencyWhile(async () => {
        api = await createRecordApi({
          sql: storageSql(this.ctx.storage),
          clock: { now: () => Date.now() },
          scheduler: this.#alarm,
        });
      });
      /* ARM FROM WHAT THE RECORD ALREADY HOLDS. An object is evicted between requests and its alarm
         survives that — but a record restored from a backup, or one whose alarm a `deleteAll` took
         with it, would otherwise wait for a write it may never get. */
      if (!api.kernel.refused()) await api.kernel.tail(this.#alarm);
      return api;
    })();
    return this.#api;
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
  async lease(n = 10): Promise<{ id: string; kind: string; payload: string; attempts: number; leasedUntil: string }[]> {
    const api = await this.#record();
    return api.kernel.leaseOutbox(DELIVERS, n);
  }

  /** How it went. The ladder walks from here, and a failed ack arms the `retry` row that tails. */
  async ack(done: { id: string; state: 'done' | 'failed'; error?: string }): Promise<void> {
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

  /** Which record this name means, or `null` if it means none. The hop, and the whole of it. */
  resolve(slug: string): { record: string; slug: string } | null {
    return this.#directory().resolve(slug);
  }

  /** What this person may do with this record, or `null`. The Worker turns it into a `CallContext`. */
  levelOf(record: string, person: string): Level | null {
    return this.#directory().levelOf(record, person);
  }
}

/**
 * One pass over one record's outbox: lease, deliver, ack.
 *
 * ONE PASS AND NOT A LOOP. The ack rings the doorbell again when anything is left, so a queue that
 * keeps filling is drained by the doorbell rather than by a `while` nobody can stop — and a
 * consumer that looped would hold one invocation open across a customer's entire backlog.
 */
async function drainOutbox(env: Env, id: string): Promise<void> {
  const record = env.RECORD.get(env.RECORD.idFromString(id));
  const deliver = makeDeliver({
    ...(env.EMAIL === undefined ? {} : { email: (m: { to: string; subject: string; text: string }) => env.EMAIL!.send(m) }),
    post: async (url: string, body: string) => {
      const out = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
      });
      return { ok: out.ok, status: out.status };
    },
  });

  for (const job of await record.lease()) {
    try {
      await deliver(job as never);
      await record.ack({ id: job.id, state: 'done' });
    } catch (e) {
      /* THE MESSAGE AND NEVER THE PAYLOAD. A digest is somebody's overdue invoices; an error line
         that quoted one has published it to wherever logs go. */
      await record.ack({ id: job.id, state: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/**
 * The slug in the path is a NAME, and the Directory says which record it means.
 *
 * `idFromName(rec_id)` AND NEVER `idFromName(slug)` (ADR-061). The address is the record id, so
 * renaming is one row in the Directory and nothing else — no migration, no copy, and no window in
 * which half the writes go to the old object. Addressing the storage by the name would make a
 * rename a data migration, which is why nobody who does it ever renames anything.
 *
 * AND A NAME THAT HAS BEEN RELEASED RESOLVES TO NOTHING. Every stale link still says the old name;
 * handing it to the next person who asks is how one of them reads another customer's record.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const routed = recordPath(url.pathname);

    if (!routed)
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record is at /r/<slug>/api/<method>.' } }, 404);

    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
    const named = await directory.resolve(routed.slug);
    if (!named)
      return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no record called ${routed.slug}.` } }, 404);

    /* The Worker authenticates and the record authorises. In a real deployment the person id comes
       from a verified session or bearer; here it is the one self-host person, and the seam is one
       line. What the Directory contributes is the LEVEL — membership is not a fact a record can
       check about a caller it has never seen. */
    const person = 'p_self';
    const level = await directory.levelOf(named.record, person);
    if (!level)
      return json({ ok: false, refusal: { code: 'FORBIDDEN', fix: `You are not on ${routed.slug}.` } }, 403);

    const record = env.RECORD.get(env.RECORD.idFromName(named.record));
    const inner = new Request(`${url.origin}${routed.rest}${url.search}`, request);
    inner.headers.set(
      'x-braindog-ctx',
      JSON.stringify({ principal: { kind: 'person', id: person, level } } satisfies CallContext),
    );
    return record.fetch(inner);
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
    /* DE-DUPLICATED WITHIN THE BATCH. Twenty writes to one record in a second ring twenty times,
       and twenty passes over one outbox is nineteen round trips for nothing. */
    for (const id of new Set(batch.messages.map((m) => m.body.record))) {
      try {
        await drainOutbox(env, id);
      } catch (e) {
        /* One record's failure is not the batch's. The rows are still `pending` and the next
           doorbell drains them. */
        console.error('drain', id, e instanceof Error ? e.message : String(e));
      }
    }
  },
};
