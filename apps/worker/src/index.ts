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

import { alarmScheduler } from './alarm.ts';
import { recordPath } from './route.ts';

type Env = { RECORD: DurableObjectNamespace<Record$> };

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

  /** The `Scheduler` port over this object's own alarm. One per customer, and this is the one. */
  #alarm: Scheduler = alarmScheduler(this.ctx.storage);

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
 * The slug in the path is the record. `/r/the-studio/api/list` is one object and one method.
 *
 * A real deployment resolves a slug to a `rec_id` through the Directory object first (ADR-061), so a
 * renamed record keeps its storage. That hop is the next iteration; the shape of this file does not
 * change when it arrives, because the only thing it alters is the string handed to `idFromName`.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const routed = recordPath(url.pathname);

    if (!routed)
      return new Response(
        JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record is at /r/<slug>/api/<method>.' } }),
        { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );

    /* NAMING IS PROVISIONING: this line is the whole of creating a customer. */
    const record = env.RECORD.get(env.RECORD.idFromName(routed.slug));

    const inner = new Request(`${url.origin}${routed.rest}${url.search}`, request);
    /* The Worker authenticates and the record authorises. In a real deployment this context is
       built from a verified session or token; here it is the owner, and the seam is one function. */
    inner.headers.set(
      'x-braindog-ctx',
      JSON.stringify({ principal: { kind: 'person', id: 'p_self', level: 'owner' } } satisfies CallContext),
    );
    return record.fetch(inner);
  },
};
