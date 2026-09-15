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

/**
 * The wire shapes, written here because this is the side that reads them.
 *
 * THEY ARE NOT IMPORTED FROM `@braindog/record`. `31 §2` gives this package two edges, `ports` and
 * `host`, and the record is neither: the client sits above a route TABLE, which is a list of names,
 * and the shapes behind those names are the contract it is asserting rather than a type it is
 * borrowing. `apps/selfhost/test/client.test.ts` is where the two sides are held together, because
 * only an app may name a runtime and the check needs a server to answer.
 */

/** `boot`, and `now` is the record's own instant. See `Boot` in `@braindog/record`. */
export type Boot = {
  registers: { id: string; name: string; count: number }[];
  /** ISO 8601, UTC. What day the record thinks it is, which is not always what day the reader does. */
  now: string;
  /* OPTIONAL, because a host older than the session register answers without them. */
  /** The runs that are live now, as `sessionsLive` answers. */
  sessions?: LiveRun[];
  /** Open suggestions, newest first, each with its question: what waits on a person. */
  waiting?: { id: string; body_kind: string; opened_by: string; opened_at: string; question?: string }[];
};

/**
 * One row as `context` shows it: its spoken id, version, scope, state, and its register's mobile fields.
 * A key's secret field is `{ sealed, opened, last_opened, last_by }`, never a value.
 */
export type Brief = { spoken: string; version: number; scope: 'project' | 'global'; state: string | null } & Record<string, unknown>;

/** `context`: where an agent stands, in one call. See `Context` in `@braindog/record`. */
export type Context = {
  session: { spoken: string; state: string | null } | null;
  project: { spoken: string; name: string; mark: string | null; hue: number | null; how: 'remote' | 'folder' | 'repo' } | null;
  ambiguous: string[];
  handoff: { from: string; age_s: number; next: string; tried: string[]; head: string | null } | null;
  live: { same_repo: LiveBrief[]; elsewhere: LiveBrief[] };
  waiting: { id: string; question: string }[];
  registers: { id: string; name: string; rows: Brief[]; inherited: Brief[]; truncated: boolean }[];
  people: Brief[];
  faded: number;
  next: string;
};

/** Another run that is live now, as `context` shows it. */
export type LiveBrief = {
  spoken: string;
  state: string | null;
  doing: string | null;
  agent: string | null;
  repo: string | null;
  project: string | null;
  stale: boolean;
  age_s: number;
};

/** One live run: the row, its spoken id, and what is worked out when it is read. */
export type LiveRun = {
  id: string;
  seq: number;
  spoken: string;
  state: string | null;
  version: number;
  fields: Record<string, unknown>;
  /** Not heard from in 45 minutes. */
  stale: boolean;
  /** Seconds since it was last heard from. */
  age_s: number;
  /** Its repository is the one the caller said it is in. */
  same_repo: boolean;
};

/** `attach`: the run this agent is, and whether it was already there. */
export type Attached = {
  session: { id: string; seq: number; state: string | null; version: number; fields: Record<string, unknown> };
  spoken: string;
  resumed: boolean;
  /** The project the run is placed in, by spoken id, or `null` for none. */
  project: string | null;
  /** The briefing for where the run stands. Optional, because a host older than `context` sends none. */
  context?: Context;
};

/** `meet`: who they turned out to be, whether they were added or linked, and the merge question it opened. */
export type Met = { person: string; created: boolean; linked: boolean; merge: string | null };

/** `packs`: one pack, on or off. `version` is `null` for a pack the seed owns by its bodies. See `PackState` in `@braindog/kernel`. */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/** `disablePack` and `enablePack`: the packs that turned, and the declarations that went or came back. */
export type PackToggle = { id: string; state: 'enabled' | 'disabled'; changed: boolean; packs: string[]; declarations: string[]; said: string };

/** `33 §4` line 356, six keys. `app` is `null` on a host that was not told what it is running. */
export type Version = {
  version: number;
  format: number;
  kernel: number;
  primitives: number;
  app: string | null;
  spark: boolean;
};

/** `listDevices` and `revokeDevice`: one device grant, by its handle and never its poll id. See `DeviceRow` in `@braindog/kernel`. */
export type DeviceRow = {
  handle: string;
  status: 'pending' | 'approved' | 'active' | 'expired' | 'denied' | 'revoked';
  reach: 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token' | 'vault';
  scope: string | null;
  label: string | null;
  ua: string | null;
  tries: number;
  expires: string;
  approved_by: string | null;
  approved_at: string | null;
  last_used: string | null;
};

/** `deviceApprove`: the device that was let in, as the person approving it should see it. */
export type DeviceApproved = Pick<DeviceRow, 'handle' | 'reach' | 'scope' | 'label' | 'ua'>;

/** One page of rows, with the keyset cursor that reaches the next one. */
export type Page<T> = { rows: T[]; matched: number; cursor: string | null };

const WRITES = new Set(ROUTES.filter((r) => r.writes).map((r) => r.name));
const NAMES = new Set(ROUTES.map((r) => r.name));

/**
 * The one refusal the record does not produce, and `30 §6` now says so rather than leaving it to be
 * invented here.
 *
 * IT SAYS WHICH SIDE FAILED. A caller told "the record refused" for a DNS failure goes looking for a
 * problem with their arguments; there is not one, and every minute spent there is a minute the
 * network is still down. That argument was already written here and the code it produced —
 * `UNREACHABLE` — was in no registry, which meant the one refusal a client is guaranteed to meet
 * was the one refusal it could not look up.
 *
 * AND `30 §6` HAD RULED ON THE HALF OF THIS IT COULD SEE. The `Http` port's four error names —
 * `PrivateRange` · `TooLarge` · `Timeout` · `Network` — are a **vocabulary**, mapped onto exactly one
 * code, `PULL_ORIGIN_REFUSED`, for the record's OUTBOUND calls. The record's inbound half, which is
 * this file, had no such code, so it made one. The amendment gives it the same treatment the
 * outbound half already had: one code, named, for the whole vocabulary of ways a socket fails.
 */
const unreachable = (why: string): Refusal => ({
  code: 'UNREACHABLE',
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
        /* AND `null` IS ABSENT TOO, BECAUSE A QUERY STRING HAS NO `null` TO SEND. `cursor: null` is
           how a caller says "from the beginning", and it went out as the four letters `null` and
           came back as the value only because the host was guessing JSON out of every value it
           read. The host now reads a cursor as the text the record minted, so a word that means
           nothing there must not be written at all: `?cursor=null` would be a position, and it
           sorts above every timestamp, so the first page would be handed back forever. */
        if (value === undefined || value === null) continue;
        /* JSON per value, so a predicate survives the query string and a plain string stays one.
           THE SECOND HALF OF THAT SENTENCE WAS NOT TRUE, AND THIS LINE WAS NOT WHERE IT WAS WRONG.
           The host `JSON.parse`d every value and kept the raw text only when the parse threw, so a
           string whose text happens to be valid JSON changed type in flight: `"2026"` arrived as
           the number 2026, `"true"` as the boolean. A page really declared at the slug `2026` was
           advertised by `pages` and then answered `REQUIRED_MISSING`, "A page is asked for by its
           slug", to a caller that had sent one, and `get('true', 1)` was a 500 out of SQLite.
           `ROUTES` now says which arguments are structured and the host decodes only those, which
           fixes it for a browser following a link as well as for this client, so the line means
           what it says. */
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
    boot: () => call<Boot>('boot'),
    version: () => call<Version>('version'),
    schema: (register: string) => call<unknown>('schema', { register }),
    get: (register: string, seq: number) => call<unknown>('get', { register, seq }),
    list: (args: {
      register: string;
      where?: unknown;
      limit?: number;
      cursor?: string | null;
      order?: { field: string; dir?: 'asc' | 'desc' }[];
    }) => call<Page<unknown>>('list', args as Record<string, unknown>),
    search: (q: string, limit?: number) =>
      call<{ register: string; seq: number; title: string }[]>('search', { q, ...(limit === undefined ? {} : { limit }) }),
    history: (register: string, seq: number) => call<unknown[]>('history', { register, seq }),
    create: (args: { register: string; fields: Record<string, unknown>; note?: string }) =>
      call<unknown>('create', args as Record<string, unknown>),
    update: (args: { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string }) =>
      call<unknown>('update', args as Record<string, unknown>),

    /* THE READ+ METHODS THE APP NEEDS AND HAD NO NAME FOR.
       `call(name, args)` already reached all of these — it validates the name against the table and
       picks the verb from it — so this was never a reachability gap, it was a typing one. A screen
       written against `call('governance', { … })` gets no help with the argument name and no error
       when the route is renamed, which is the whole reason the table is typed at all. */
    pages: () => call<unknown[]>('pages'),
    page: (slug: string) => call<unknown>('page', { slug }),
    metric: (metric: string) => call<unknown>('metric', { metric }),
    packs: () => call<PackState[]>('packs'),
    /* ADMIN, SO A BROWSER SESSION. Nothing cascades: `alsoDisable` names what a `PACK_REQUIRED` listed. */
    disablePack: (args: { id: string; alsoDisable?: string[] }) => call<PackToggle>('disablePack', args as Record<string, unknown>),
    enablePack: (args: { id: string }) => call<PackToggle>('enablePack', args as Record<string, unknown>),
    governance: (args: { register?: string; id?: string; status?: string; limit?: number } = {}) =>
      call<unknown>('governance', args as Record<string, unknown>),
    members: () => call<unknown[]>('members'),
    listTokens: () => call<unknown[]>('listTokens'),
    /* ADMIN, SO A BROWSER SESSION, and approving also asks for a sign-in in the last fifteen minutes. */
    listDevices: () => call<DeviceRow[]>('listDevices'),
    deviceApprove: (args: { user_code: string }) => call<DeviceApproved>('deviceApprove', args as Record<string, unknown>),
    revokeDevice: (args: { handle: string }) => call<DeviceRow>('revokeDevice', args as Record<string, unknown>),
    listGrants: () => call<unknown[]>('listGrants'),
    whoami: () => call<unknown>('whoami'),
    planPack: (args: { doc: unknown; source?: { kind: string; ref?: string } }) =>
      call<unknown>('planPack', args as Record<string, unknown>),

    /* THE TWO DATA WRITES A SCREEN MAKES WITHOUT CHANGING A ROW. `markRead` moves the reader's own
       mark and nothing else, and with no `upTo` the record uses its own newest event, so a caller
       never has to know a number to say "I have seen this". `log` is a note against a row: it is a
       write, and it leaves the row's version where it was. */
    markRead: (upTo?: number) =>
      call<{ upTo: number; seen_at: unknown }>('markRead', upTo === undefined ? {} : { upTo }),
    log: (args: { register: string; seq: number; note?: string }) => call<unknown>('log', args as Record<string, unknown>),

    /* A RUN'S THREE. `attach` and `handoff` are an agent's, and the host reads which run from the session
       headers the caller's own `fetch` sends; `sessionsLive` is anybody's who may read the register. */
    attach: (args: {
      source: 'startup' | 'resume' | 'clear' | 'compact' | 'cli';
      client_id?: string;
      doing?: string;
      branch?: string;
      head?: string;
    }) => call<Attached>('attach', args as Record<string, unknown>),
    handoff: (args: {
      next?: string;
      tried?: string;
      note?: string;
      doing?: string;
      state?: string;
      branch?: string;
      head?: string;
      session?: string;
    }) => call<unknown>('handoff', args as Record<string, unknown>),
    sessionsLive: () => call<LiveRun[]>('sessionsLive'),
    /** Where the caller stands: its run, its project, the last handoff, who is live, and what applies. */
    context: () => call<Context>('context'),
    /** Someone met in the work, a commit author or a sender, as the caller's run. */
    meet: (args: { name?: string; email?: string; handle?: string; where: string }) => call<Met>('meet', args as Record<string, unknown>),
  };
}

export type Client = ReturnType<typeof createClient>;
