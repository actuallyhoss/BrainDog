/**
 * The client. One `fetch`, the route table, and the same `Result` at both ends.
 *
 * IT IS TYPED FROM THE SAME TABLE THE SERVER SERVES. `ROUTES` says which methods exist and which of
 * them write, so a client that calls a method the server does not have fails at the type level
 * rather than at a 404 in production — and a method added to the table without a client is a compile
 * error in the app that uses it.
 *
 * NOTHING THROWS FOR A REFUSAL. A refused call is a value with a code and a sentence, exactly as it
 * is inside the record: a client that throws on 422 makes every caller write a try/catch to read a
 * message that was already structured, and the message loses its shape on the way through.
 *
 * A THROW IS RESERVED FOR THE NETWORK, because that is the one failure the record has no opinion
 * about — and even then it comes back as a refusal, so a caller has exactly one branch to write.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ROUTES } from '@braindog/host';

export type ClientOptions = {
  /**
   * Where the host is. `https://braindog.example` or `http://127.0.0.1:8787` — the method is
   * appended as `/api/<method>`, which is 33 §4's surface and the same on both hosts.
   *
   * WHICH RECORD IS THE TOKEN'S TO SAY, not the URL's. A bearer is `<rec_id>.<secret>` and the host
   * routes on the half in front of the dot; there is no slug in the path, because `/r/<register>` is
   * the app's own register list and a tenant prefix there would take every link in the product with
   * it.
   */
  base: string;
  /** Sent as a bearer. Absent on a self-host that was started without one. */
  token?: string | undefined;
  /** Injectable so a test can drive the client without a socket, and a Worker can pass its own. */
  fetch?: typeof globalThis.fetch;
};

const WRITES = new Set(ROUTES.filter((r) => r.writes).map((r) => r.name));
const NAMES = new Set(ROUTES.map((r) => r.name));

const unreachable = (why: string): Refusal => ({
  code: 'UNREACHABLE',
  /* The one refusal the record does not produce, so it says which side failed: a caller told "the
     record refused" for a DNS failure looks for a problem with their arguments. */
  fix: `The record could not be reached: ${why}`,
});

/**
 * Call one method.
 *
 * The verb follows the route table rather than the caller's guess, so a write is a POST because the
 * table says it changes something — the same rule the server enforces, read from the same list.
 */
export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.base.replace(/\/+$/, '');

  async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
    if (!NAMES.has(name))
      return {
        ok: false,
        refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${name}.`, allowed: [...NAMES] },
      };

    const writes = WRITES.has(name);
    const url = new URL(`${base}/api/${name}`);
    if (!writes)
      for (const [key, value] of Object.entries(args)) {
        if (value === undefined) continue;
        /* JSON per value, so a predicate survives the query string and a plain string stays one. */
        url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }

    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method: writes ? 'POST' : 'GET',
        headers: {
          ...(writes ? { 'content-type': 'application/json' } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        ...(writes ? { body: JSON.stringify(args) } : {}),
      });
    } catch (e) {
      return { ok: false, refusal: unreachable(e instanceof Error ? e.message : String(e)) };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, refusal: unreachable(`${res.status} with a body that is not JSON`) };
    }

    /* THE SHAPE IS CHECKED, not assumed. A proxy that returns its own error page with a 200 would
       otherwise arrive as a successful call whose value is an HTML string, and the first thing that
       reads a field off it fails somewhere unrelated. */
    if (body === null || typeof body !== 'object' || !('ok' in body))
      return { ok: false, refusal: unreachable(`${res.status} with an answer this client does not recognise`) };

    /* AND A NOT-OK ANSWER HAS TO BE ONE OF THE TWO. There are three arms and only two of them are
       failures; an `{ ok: false }` carrying neither a refusal nor a conflict would reach a caller
       that reads `.refusal.fix` off it and fail somewhere unrelated, with a 422 in the log and a
       `TypeError` on the screen. */
    if (body.ok === false && !('refusal' in body) && !('conflict' in body))
      return { ok: false, refusal: unreachable(`${res.status} with a failure carrying neither a refusal nor a conflict`) };

    return body as Result<T>;
  }

  return {
    call,
    boot: () => call<{ registers: { id: string; name: string; count: number }[] }>('boot'),
    version: () => call<number>('version'),
    schema: (register: string) => call<unknown>('schema', { register }),
    get: (register: string, seq: number) => call<unknown>('get', { register, seq }),
    list: (args: { register: string; where?: unknown; limit?: number; cursor?: string | null }) =>
      call<{ rows: unknown[]; matched: number; cursor: string | null }>('list', args as Record<string, unknown>),
    search: (q: string, limit?: number) =>
      call<{ register: string; seq: number | null; title: string }[]>('search', { q, ...(limit === undefined ? {} : { limit }) }),
    history: (register: string, seq: number) => call<unknown[]>('history', { register, seq }),
    create: (args: { register: string; fields: Record<string, unknown>; note?: string }) =>
      call<unknown>('create', args as Record<string, unknown>),
    update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string }) =>
      call<unknown>('update', args as Record<string, unknown>),
  };
}

export type Client = ReturnType<typeof createClient>;
