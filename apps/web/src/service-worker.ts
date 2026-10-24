/**
 * The service worker: it rings, and it keeps the phone's read copy. Which request is which, and the copy's rules, are in
 * `lib/data/offline.ts`, which the page shares.
 *
 * ONE FIXED LINE, WHATEVER CAME WITH THE PUSH. `09 §3` is that a push carries no content, because it passes through a
 * push service nobody here runs and this record holds money and credentials. The Worker sends no body at all,
 * and the kernel's `notify.push` job still writes `{ title, url }`, so this file is the place that guarantees it: the
 * payload is never read, and `push.test.ts` fires a push whose payload throws when touched.
 *
 * THE NETWORK FIRST, ALWAYS, AND THE COPY ONLY WHEN IT FAILS. Every read, every address of the app and every file of it
 * goes to the network as it did before this file cached anything, and what answers is what is drawn; the copy is
 * written on the way through and read only when the network did not answer at all. So a deploy is never hidden behind
 * a stale shell while he is online. The one exception is a file under `_app/immutable/`, whose name is its content's
 * hash, so the copy of it cannot be stale and is answered first.
 *
 * NO WRITE IS KEPT AND NONE WAITS. A write the network does not take is answered at once with a refusal saying it was
 * not sent (`words.notSent`), and nothing is queued to send later: `offline.ts` says why.
 *
 * THE COPY GOES ON A 401 AND ON SIGN-OUT, here, because every request a controlled page makes passes through this file,
 * including the ones outside its scope: the session's record answers at `/api/` and sign-out is `/auth/logout`, and
 * neither is under `/app/`. The page deletes it on a record switch (`keep` in `offline.ts`).
 *
 * A MODULE TO TYPESCRIPT, AND NOTHING EXPORTED TO THE BROWSER. With no import and no export the file was a script, and a
 * script's top-level names are globals of the whole program `svelte-check` reads, which includes this file by name.
 * The import below makes it a module now; the empty `export {}` at the foot is kept so that stays true if the import
 * ever goes.
 *
 * THE EMPTY `export {}` EXPORTS NOTHING, so the bundle SvelteKit builds from this file carries no `export` statement.
 * That matters because the page registers the result as a classic script outside development, where an `export` is a
 * syntax error and the worker never installs. The import is bundled into the file, so it adds no statement either.
 *
 * The types below are the members of `ServiceWorkerGlobalScope` it touches, declared here rather than by pulling the
 * `webworker` library into a program that is otherwise the DOM's, where the two declare `self` differently.
 */

import { CEILING, COPY, KEPT, accessEnded, fresh, markOf, route, words, type Route } from './lib/data/offline.ts';

type Waits = { waitUntil(p: Promise<unknown>): void };
type Opened = { url: string; focus(): Promise<unknown> };
type Fetched = Waits & { request: Request; clientId: string; respondWith(r: Promise<Response>): void };
type Scope = {
  registration: { scope: string; showNotification(title: string, options?: { tag?: string }): Promise<void> };
  clients: {
    matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly Opened[]>;
    openWindow(url: string): Promise<unknown>;
    get(id: string): Promise<{ postMessage(message: unknown): void } | undefined>;
    claim(): Promise<void>;
  };
  caches: CacheStorage;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'push', fn: (e: Waits) => void): void;
  addEventListener(type: 'notificationclick', fn: (e: Waits & { notification: { close(): void } }) => void): void;
  addEventListener(type: 'install' | 'activate', fn: (e: Waits) => void): void;
  addEventListener(type: 'fetch', fn: (e: Fetched) => void): void;
};

const sw = self as unknown as Scope;

/* THE TAG MAKES A SECOND PUSH REPLACE THE FIRST LINE. Two unread lines saying the same thing are one fact drawn twice,
   and the kernel already holds urgent ones to one an hour. */
sw.addEventListener('push', (e) => {
  e.waitUntil(sw.registration.showNotification('Something in your BrainDog needs you', { tag: 'braindog' }));
});

/* THE RECORD'S HOME IS THE ROOT OF THE SCOPE, `/app/`, which is the record the session is on. The push names no record,
   so this cannot open a slug; a Home already open is focused rather than opened twice, and a window on another screen
   is left where it is, because navigating it would throw away whatever was being typed there. */
sw.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const home = sw.registration.scope;
  e.waitUntil(
    (async () => {
      const open = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const there = open.find((w) => w.url === home);
      return there ? there.focus() : sw.clients.openWindow(home);
    })(),
  );
});

/* AT ONCE, AND OVER THE PAGE THAT REGISTERED IT. A worker waits for every tab to close before it takes over, and it
   controls no page that loaded before it; either would leave the first visit keeping nothing, which on a phone that
   goes offline on the way home is the visit that mattered. The worker answers network first, so an older page it
   takes over gets what the network gives it, as it did before. */
sw.addEventListener('install', (e) => e.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate', (e) => e.waitUntil(Promise.all([sw.clients.claim(), sweep(Date.now())])));

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const kind = route(
    { url: req.url, method: req.method, mode: req.mode, authorised: req.headers.has('authorization') },
    sw.registration.scope,
  );
  if (kind === 'pass') return;
  /* THE COPY GOES BEFORE THE SESSION DOES, whatever the sign-out answers: a sign-out that failed half way still meant
     he wanted nothing of the record left on this phone. */
  if (kind === 'out') return e.waitUntil(sw.caches.delete(COPY));
  e.respondWith(answer(kind, e, Date.now()));
});

/** The address of the app kept as the one shell: `adapter-static` builds one `index.html` that every address boots. */
const shell = (): string => sw.registration.scope;

async function answer(kind: Exclude<Route, 'pass' | 'out'>, e: Fetched, now: number): Promise<Response> {
  const req = e.request;
  if (kind === 'asset') {
    const held = await kept(req.url, now);
    if (held) return held.res;
  }
  /* SEVERAL READS SENT AS ONE (`reads`) ARE KEPT ONE BY ONE, each under the address it would have been asked at alone,
     so offline each is answered from the copy as it always was (the client asks them one at a time when `reads` cannot
     be sent). Its body is read before the network takes it. */
  const several = kind === 'write' && READS.test(new URL(req.url).pathname) && !req.headers.has('authorization') ? req.clone().text() : null;
  const net = await network(req);
  if (net !== null) {
    const json = (net.headers.get('content-type') ?? '').includes('application/json');
    const keepable = net.ok && net.type === 'basic' && (kind === 'read' ? json : kind !== 'write' && kind !== 'door');
    if (keepable) e.waitUntil(put(kind === 'shell' ? shell() : req.url, net.clone(), now));
    if (several !== null && net.ok && net.type === 'basic' && json) e.waitUntil(putEach(several, net.clone(), now));
    if (kind === 'shell' && now - swept > HOUR) e.waitUntil(sweep(now));
    return net;
  }
  if (kind === 'write')
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'UNREACHABLE', fix: words.notSent } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  if (kind === 'door') return Response.error();
  const held = await kept(kind === 'shell' ? shell() : req.url, now);
  if (!held) return Response.error();
  /* THE PAGE IS TOLD HOW OLD WHAT IT DRAWS IS, which is the "from 14:02" of the offline line. Only for a read: the shell
     and the app's files are the same whenever they were kept, and the page's answers are what can be old. */
  if (kind === 'read') e.waitUntil(tell(e.clientId, held.at));
  return held.res;
}

/**
 * The network's answer, or `null` when nothing answered.
 *
 * A 401 FROM ANYTHING DELETES THE COPY. The session this copy was read with is over, whether it was signed out on
 * another device, expired, or revoked from Settings, and a phone that can no longer read the record online must not
 * go on drawing it offline. AND SO DOES A REFUSAL SAYING THEIR ACCESS ENDED (`x-braindog-access: ended`, a 403): a
 * guest whose last share stopped is still signed in, and the record they can no longer read must not stay here either.
 */
async function network(req: Request): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetch(req);
  } catch {
    return null;
  }
  if (res.status === 401 || accessEnded(res.headers)) await sw.caches.delete(COPY);
  return res;
}

/** The address several reads are sent to as one, under the session's record or a named one. */
const READS = /\/api\/reads$/u;

/**
 * Each read of a `reads` answered 200, kept under the address it names (`at`) as that read asked alone would have been:
 * only an address this worker would keep a read at (`route` says `read`), and nothing when either body does not parse.
 */
async function putEach(asked: Promise<string>, res: Response, now: number): Promise<void> {
  try {
    const calls = (JSON.parse(await asked) as { calls?: { at?: unknown }[] }).calls ?? [];
    const answers = ((await res.json()) as { value?: { answers?: { status?: unknown; body?: unknown }[] } }).value?.answers ?? [];
    await Promise.all(
      calls.map((c, i) => {
        const a = answers[i];
        if (typeof c.at !== 'string' || a?.status !== 200) return undefined;
        if (route({ url: c.at, method: 'GET', mode: 'cors', authorised: false }, sw.registration.scope) !== 'read') return undefined;
        return put(c.at, new Response(JSON.stringify(a.body), { status: 200, headers: { 'content-type': 'application/json' } }), now);
      }),
    );
  } catch {
    /* A body that is not what `reads` answers keeps nothing; each read is asked alone next time anyway. */
  }
}

/** Keep an answer under `key`, stamped with the time it was kept. */
async function put(key: string, res: Response, now: number): Promise<void> {
  const headers = new Headers(res.headers);
  headers.set(KEPT, String(now));
  const body = await res.blob();
  await (await sw.caches.open(COPY)).put(key, new Response(body, { status: res.status, statusText: res.statusText, headers }));
}

/** The answer kept under `key` and when, or nothing when there is none younger than a week. An older one is deleted. */
async function kept(key: string, now: number): Promise<{ res: Response; at: number } | null> {
  const box = await sw.caches.open(COPY);
  const res = await box.match(key, { ignoreVary: true });
  if (!res) return null;
  const at = Number(res.headers.get(KEPT));
  if (fresh(at, now)) return { res, at };
  await box.delete(key);
  return null;
}

async function tell(client: string, at: number): Promise<void> {
  if (client === '') return;
  (await sw.clients.get(client))?.postMessage({ kept: at });
}

const HOUR = 60 * 60 * 1000;
/** When the copy was last swept, by this run of the worker. A worker woken again starts at zero and sweeps once. */
let swept = 0;

/**
 * Delete every answer older than a week, and the oldest past `CEILING`.
 *
 * ON ACTIVATE AND AT MOST ONCE AN HOUR AFTER THAT, on opening an address of the app, so the walk over the copy is paid
 * once per visit and not once per read. It walks at most `CEILING` answers plus whatever one hour of reading added.
 * The record's mark is not an answer and is never swept.
 */
async function sweep(now: number): Promise<void> {
  swept = now;
  const box = await sw.caches.open(COPY);
  const mark = markOf(sw.registration.scope);
  const keys = (await box.keys()).filter((k) => k.url !== mark);
  /* OLDEST FIRST, because a cache lists its entries in the order they were put, and a put over a key moves it last. */
  const over = keys.length - CEILING;
  for (const [i, key] of keys.entries()) {
    const res = i < over ? undefined : await box.match(key);
    if (!res || !fresh(Number(res.headers.get(KEPT)), now)) await box.delete(key);
  }
}

/* THE MODULE MARKER. The import above already makes this a module; the header says why the marker stays. */
export {};
