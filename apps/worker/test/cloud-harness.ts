/**
 * The Cloud as `src/index.ts` wires it, in one process: `src/index.ts` bundled, a real `Directory$`, real `Record$` objects over
 * `node:sqlite`, an R2 bucket over a Map, and the two PITR methods of a Durable Object's storage.
 *
 * MINIFLARE IS NOT USED, AND FOR A MEASURED REASON. Local workerd answers `getCurrentBookmark` and throws "does not
 * implement point-in-time recovery" for `onNextSessionRestoreBookmark`, so a
 * restore run there stops at the first of `51 D15`'s two calls and proves nothing about the second. Here the storage
 * records which bookmark was armed and `ctx.abort()` starts a fresh `Record$` over the same rows, which is what the
 * platform does with everything except the rewind itself. WHETHER THE OBJECT COMES BACK AT THAT BOOKMARK IS PROVED ON
 * ALPHA AND NOWHERE ELSE: the rows here are the rows as they were before the abort, and a test that read them as
 * restored would be reading the harness.
 */

import { bundled, objectStorage, type Bundle } from './bundled-worker.ts';

export const HOST = 'app.example.test';
export const ORIGIN = `https://${HOST}`;
/* NOT A SECRET. It keys a Directory that lives in this process for a second. */
export const SESSION_SECRET = 'cloud-harness-session-secret-not-a-secret-0123456789';

export type Held = Map<string, { bytes: Uint8Array; meta: Record<string, string> }>;

/**
 * R2's methods over a Map. `customMetadata` comes back from `list` only when asked for, as R2's does.
 * `fail` refuses one call by name and key, which is how a sweep that fails is made to fail.
 */
export function bucket(fail?: (call: 'put' | 'delete', key: string) => boolean) {
  const held: Held = new Map();
  return {
    held,
    keys: (prefix = '') => [...held.keys()].filter((k) => k.startsWith(prefix)).sort(),
    async put(key: string, value: string | Uint8Array, options?: { customMetadata?: Record<string, string> }) {
      if (fail?.('put', key)) throw new Error(`the bucket refused ${key}`);
      held.set(key, { bytes: typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value), meta: options?.customMetadata ?? {} });
      return null;
    },
    async get(key: string) {
      const object = held.get(key);
      return object
        ? {
            size: object.bytes.length,
            httpMetadata: {},
            body: new Blob([object.bytes]).stream(),
            text: async () => new TextDecoder().decode(object.bytes),
            arrayBuffer: async () => object.bytes.slice().buffer,
          }
        : null;
    },
    async head(key: string) {
      const object = held.get(key);
      return object ? { size: object.bytes.length, httpMetadata: {} } : null;
    },
    async list(options?: { prefix?: string; cursor?: string; include?: string[] }) {
      const meta = options?.include?.includes('customMetadata') ?? false;
      const objects = [...held.entries()]
        .filter(([key]) => key.startsWith(options?.prefix ?? ''))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, o]) => ({ key, size: o.bytes.length, ...(meta ? { customMetadata: o.meta } : {}) }));
      return { objects, truncated: false };
    },
    async delete(keys: string | string[]) {
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        if (fail?.('delete', key)) throw new Error(`the bucket refused to delete ${key}`);
        held.delete(key);
      }
    },
  };
}

export type Bucket = ReturnType<typeof bucket>;

/** `objectStorage()` with `deleteAll`, and the two PITR methods a record's copies call, counting what they were asked. */
export function recordStorage() {
  const base = objectStorage();
  let n = 0;
  const pitr = { armed: [] as string[] };
  return Object.assign(base, {
    pitr,
    async deleteAll() {
      const tables = base.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").toArray() as { name: string }[];
      for (const { name } of tables) base.sql.exec(`DROP TABLE IF EXISTS "${name}"`);
      await base.deleteAlarm();
    },
    async getCurrentBookmark() {
      return `bm-${String(++n).padStart(4, '0')}`;
    },
    async onNextSessionRestoreBookmark(bookmark: string) {
      pitr.armed.push(bookmark);
      return `undo-${bookmark}`;
    },
  });
}

export type RecordStorage = ReturnType<typeof recordStorage>;

/**
 * A record's object with the RPC methods the suites call, loosely typed: their real signatures are `src/index.ts`'s,
 * which Node cannot typecheck.
 *
 * NAMED AND NOT AN INDEX SIGNATURE. This was `Record<string, (...args) => Promise<unknown>>`, and under
 * `noUncheckedIndexedAccess` every method read through it is "possibly undefined": nine TS2722 errors from
 * `pnpm -C apps/worker typecheck` at the builder's hand-off, with every test green, because Node strips the types
 * it would have refused.
 */
type Obj = InstanceType<Bundle['Record$']> & {
  deviceStart(args: object, ip: string): Promise<unknown>;
  devicePoll(args: object): Promise<unknown>;
};

/** The Directory's RPC methods the suites call beyond `DirectoryObject`'s, loosely typed for the same reason. */
type Dir = InstanceType<Bundle['Directory$']> & {
  knows(record: string): Promise<boolean> | boolean;
  close(record: string): unknown;
  resolve(slug: string): Promise<{ record: string; slug: string } | null> | { record: string; slug: string } | null;
  drill(call: { op: 'read' } | { op: 'put'; drill: object }): unknown;
};

/**
 * A deployment: the bundle's handler, its Directory, and a record namespace whose objects restart on `ctx.abort()`.
 *
 * EACH RECORD'S STORAGE OUTLIVES ITS OBJECT, as a Durable Object's does. `abort` throws, as the platform's call does
 * for the caller, and the next `get` answers a new `Record$` over the same storage: a second call to the old object
 * would still reach the old one, which is the stub rule the Worker has to follow.
 */
export async function cloud(extra: Record<string, unknown> = {}) {
  const bundle = await bundled();
  const { Record$, Directory$ } = bundle;
  const blobs = bucket();
  const env: Record<string, unknown> = { PUBLIC_HOST: HOST, SESSION_SECRET, INGRESS: { send: async () => {} }, BLOBS: blobs, AGE_RECIPIENT: '', ...extra };
  const storages = new Map<string, RecordStorage>();
  const objects = new Map<string, Obj>();
  const log: string[] = [];
  /* WHAT A RECORD HANDED `ctx.waitUntil` (the ask whether the look is due, beside a request), kept so a test can let it
     finish (`settle`); the look itself is the alarm's (`wake`). */
  const waits: Promise<unknown>[] = [];
  const open = (id: string): Obj => {
    const storage = storages.get(id) ?? recordStorage();
    storages.set(id, storage);
    const state = {
      storage,
      id: { toString: () => id },
      blockConcurrencyWhile: (f: () => unknown) => f(),
      waitUntil: (p: unknown) => void waits.push(Promise.resolve(p).catch(() => {})),
      abort: (reason?: string) => {
        log.push(`abort ${id}`);
        objects.set(id, open(id));
        throw new Error(reason ?? 'The Durable Object was reset.');
      },
    };
    const object = new Record$(state, env) as Obj;
    objects.set(id, object);
    return object;
  };
  env['RECORD'] = { idFromName: (n: string) => n, get: (id: string) => objects.get(id) ?? open(id) };

  /* THE DIRECTORY'S KEY-VALUE HALF, over a Map: its sign-in letter count (`letterSent`, `lettersDown`) and its night
     read `ctx.storage.get` and `put`, which `objectStorage()` does not have, so the count was never kept. */
  const dirKept = new Map<string, unknown>();
  const dirStorage = Object.assign(objectStorage(), {
    async get(key: string) {
      return dirKept.get(key);
    },
    async put(key: string, value: unknown) {
      dirKept.set(key, value);
    },
  });
  const blocked: Promise<unknown>[] = [];
  const dirState = { storage: dirStorage, id: { toString: () => 'directory' }, blockConcurrencyWhile: (f: () => Promise<unknown>) => (blocked.push(f()), blocked.at(-1)), waitUntil: () => {} };
  const directory = new Directory$(dirState, env) as Dir;
  await Promise.all(blocked);
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => directory };

  /** A record named `slug`, owned by `email`, made the way `provision` makes one, minus the operator key. */
  const provision = async (id: string, slug: string, email: string, args: Record<string, unknown> = {}) => {
    const ready = directory.prepare(slug, email, null);
    if (!ready.person) throw new Error(`the Directory made no person: ${JSON.stringify(ready.refusal)}`);
    const made = await (env['RECORD'] as { get: (id: string) => Obj }).get(id).create({
      id,
      slug,
      name: slug,
      tz: 'UTC',
      locale: 'en',
      owner: { id: ready.person.id, email, name: null },
      ...args,
    });
    if (made !== null) throw new Error(`the record was not made: ${JSON.stringify(made)}`);
    const named = directory.nameRecord(slug, email, id);
    if (named !== null) throw new Error(`the name was not given: ${JSON.stringify(named)}`);
    return ready.person.id;
  };

  /** A session cookie for `email`, spent from a claim link as a first sign-in is. */
  const signIn = async (email: string): Promise<string> => {
    const claim = await directory.auth({ flow: 'claim.mint', email });
    const signed = await directory.auth({ flow: 'magic.redeem', claimToken: claim.mail?.claimToken, ip: '' });
    if (!signed.session || signed.session === 'clear') throw new Error(`no session: ${JSON.stringify(signed)}`);
    return `__Host-bd_s=${signed.session.sid}`;
  };

  /** A request through the Worker's own `fetch`, as a browser on this origin sends it. */
  const ask = (path: string, init: RequestInit & { cookie?: string; bearer?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.cookie) headers.set('cookie', init.cookie);
    if (init.bearer) headers.set('authorization', `Bearer ${init.bearer}`);
    if (init.method === 'POST') {
      headers.set('origin', ORIGIN);
      headers.set('content-type', 'application/json');
    }
    return bundle.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env, { waitUntil: () => {} });
  };

  /** How many rows of one event kind a record's storage holds. */
  const events = (id: string, kind: string): number =>
    Number((storages.get(id)?.sql.exec('SELECT count(*) AS n FROM event WHERE kind = ?', kind as never).toArray()[0] as { n: number } | undefined)?.n ?? 0);

  /** Every `waitUntil` a record was handed so far, finished, so a mocked clock moved next is not read by work still under way. */
  const settle = async (): Promise<void> => {
    while (waits.length > 0) await Promise.all(waits.splice(0));
  };

  /**
   * The record's alarm, fired while it is due, as the platform fires one set for now: what a request hands the alarm
   * (the look, `slashDue`) is done here, a slice an alarm, until no alarm is due or `most` alarms ran. Answers how many.
   */
  const wake = async (id: string, most = 50): Promise<number> => {
    await settle();
    let ran = 0;
    for (; ran < most; ran++) {
      const at = await storages.get(id)?.getAlarm();
      if (at === null || at === undefined || at > Date.now()) break;
      await ((env['RECORD'] as { get: (id: string) => Obj }).get(id) as unknown as { alarm(): Promise<void> }).alarm();
      await settle();
    }
    return ran;
  };

  return { bundle, env, blobs, directory, dirStorage, storages, objects, log, open, provision, signIn, ask, events, settle, wake, record: (id: string) => (env['RECORD'] as { get: (id: string) => Obj }).get(id) };
}
