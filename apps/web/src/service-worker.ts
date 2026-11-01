/**
 * The service worker: it rings, and it keeps the phone's read copy. Which request is which, and the copy's rules, are in
 * `lib/data/offline.ts`, which the page shares.
 *
 * ONE FIXED LINE, WHATEVER CAME WITH THE PUSH. `09 §3` is that a push carries no content, because it passes through a
 * push service nobody here runs and this record holds money and credentials. THE ONE THING READ IS WHERE A TAP OPENS
 * (E44 of 24 October): the Worker encrypts `{ open }` to this phone, a path in the app such as
 * `/kiln/decide/sg_...`, and it is kept only when it is under this worker's scope and made of handle characters.
 * No word of it is ever drawn: the line stays fixed, and `push.test.ts` fires a push with a title in its payload and a
 * push whose payload throws when touched. AND ITS KIND (`lib/phone/kinds.ts`), one word of a closed list, picks which
 * fixed line: "An agent needs your answer", "Your BrainDog summary is ready", never what it is about.
 *
 * THE NETWORK FIRST FOR EVERY READ AND FILE, AND THE COPY ONLY WHEN IT FAILS. Every read and every file of the app goes
 * to the network as it did before this file cached anything, and what answers is what is drawn; the copy is written on
 * the way through and read only when the network did not answer at all. A file under `_app/immutable/` is answered from
 * the copy first, because its name is its content's hash, so the copy of it cannot be stale.
 *
 * THE SHELL IS ANSWERED FROM THE COPY, AND ASKED FOR AGAIN BEHIND IT (scope 2026-10-24 A17). Network first, an open on
 * his phone waited the whole trip to the record's front (90 ms at best from Marseille, often 400) before a single pixel,
 * though the shell is the same few kilobytes every time until a deploy. Now an address of the app is answered with the
 * kept shell at once and the network's is fetched behind it: the same shell is kept again, and a different one (a
 * deploy) is kept and the page told (`{ shell }`), which reloads onto it before anybody has touched it, and the next
 * open draws it either way. The page also hears a newer build from `/api/version` and drops the kept shell
 * (`live.svelte.ts`). Sign-in and sign-up are never answered from the copy, because the Worker sends their pages a
 * different policy (Turnstile's), and the bare start address goes to the record's own address as the copy's mark names
 * it, while the Worker's entry is still asked behind it for the session it keeps.
 *
 * NO WRITE IS KEPT AND NONE WAITS. A write the network does not take is answered at once with a refusal saying it was
 * not sent (`words.notSent`), and nothing is queued to send later: `offline.ts` says why.
 *
 * THE COPY GOES ON A 401 AND ON SIGN-OUT, here, because every request a controlled page makes passes through this file:
 * the session's record answers at `/api/` and sign-out is `/auth/logout`, both inside the scope now that the app is the
 * root, and `route` passes every other door of the host to the browser untouched. The page deletes it on a record switch (`keep` in `offline.ts`).
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
/* ─── the phone lane's imports: the kinds of push and a share from another app (`lib/phone/`) ─── */
import { kindIn, pushLine } from './lib/phone/kinds.ts';
import { SHARED, isShare, takeShare } from './lib/phone/share.ts';

type Waits = { waitUntil(p: Promise<unknown>): void };
type Opened = { url: string; focus(): Promise<unknown> };
type Fetched = Waits & { request: Request; clientId: string; respondWith(r: Promise<Response>): void };
type Scope = {
  registration: {
    scope: string;
    showNotification(title: string, options?: { tag?: string; data?: { open: string } }): Promise<void>;
  };
  navigator?: { setAppBadge?(n?: number): Promise<void> };
  clients: {
    matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly Opened[]>;
    openWindow(url: string): Promise<unknown>;
    get(id: string): Promise<{ postMessage(message: unknown): void } | undefined>;
    claim(): Promise<void>;
  };
  caches: CacheStorage;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'push', fn: (e: Waits & { data?: { json(): unknown } | null }) => void): void;
  addEventListener(type: 'notificationclick', fn: (e: Waits & { notification: { close(): void; data?: unknown } }) => void): void;
  addEventListener(type: 'install' | 'activate', fn: (e: Waits) => void): void;
  addEventListener(type: 'fetch', fn: (e: Fetched) => void): void;
};

const sw = self as unknown as Scope;

/** Where a tap opens, from what came with the push or with the line: an address under this scope, or `null`. */
const openOf = (raw: unknown): string | null => {
  const path = raw && typeof raw === 'object' ? (raw as { open?: unknown }).open : undefined;
  if (typeof path !== 'string') return null;
  /* A PATH AS THE WORKER SENDS IT, OR THE ADDRESS THIS FILE KEPT ON THE LINE FROM ONE: under the scope either way. */
  const rest = path.startsWith(sw.registration.scope) ? path.slice(new URL(sw.registration.scope).origin.length) : path;
  if (!/^\/[A-Za-z0-9_/-]{1,240}$/u.test(rest) || rest.includes('//')) return null;
  const url = new URL(rest, sw.registration.scope).href;
  return url.startsWith(sw.registration.scope) ? url : null;
};

/* THE TAG MAKES A SECOND PUSH REPLACE THE FIRST LINE. Two unread lines saying the same thing are one fact drawn twice,
   and the kernel already holds urgent ones to one an hour. */
sw.addEventListener('push', (e) => {
  let open: string | null = null;
  let body: unknown = null;
  try {
    body = e.data?.json();
    open = openOf(body);
  } catch {
    open = null;
  }
  /* THE LINE IS CHOSEN BY THE PUSH'S KIND (`lib/phone/kinds.ts`), a word from a closed list the record sends beside the
     path, and still never a word of what: "An agent needs your answer", never the question. A summary says it is one:
     the 08:00 and 17:00 notes open their own screen, and are not something that needs him. A push with no kind (a
     record older than the kinds) says what every push said before. */
  const kind = kindIn(body !== null && typeof body === 'object' ? (body as { kind?: unknown }).kind : undefined);
  const path = open === null ? null : new URL(open).pathname;
  const line = pushLine(kind, path);
  /* ONE LINE PER KIND, so a summary does not replace the question waiting on him, and two of one kind are one line. */
  const tag = kind === null ? 'braindog' : `braindog-${kind}`;
  /* AND THE APP'S ICON WEARS A DOT where the platform has one (the Badging API): the push carries no count, so it is a
     dot, and the page puts the real Needs you count on it the moment the app is opened (`setBadge`). */
  const dot = kind === 'summary' ? Promise.resolve() : (sw.navigator?.setAppBadge?.() ?? Promise.resolve()).catch(() => {});
  e.waitUntil(
    Promise.all([
      sw.registration.showNotification(line, { tag, ...(open ? { data: { open } } : {}) }),
      dot,
    ]),
  );
});

/* A TAP OPENS WHAT THE PUSH NAMED, the question in Decide on the record it is about, or else THE RECORD'S HOME,
   the root of the scope, `/`, which is the record the session is on. A window already on that address is focused
   rather than opened twice, and a window on another screen is left where it is, because navigating it would throw
   away whatever was being typed there. */
sw.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const to = openOf(e.notification.data) ?? sw.registration.scope;
  e.waitUntil(
    (async () => {
      const open = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const there = open.find((w) => w.url === to);
      return there ? there.focus() : sw.clients.openWindow(to);
    })(),
  );
});

/* AT ONCE, AND OVER THE PAGE THAT REGISTERED IT. A worker waits for every tab to close before it takes over, and it
   controls no page that loaded before it; either would leave the first visit keeping nothing, which on a phone that
   goes offline on the way home is the visit that mattered. The worker answers network first, so an older page it
   takes over gets what the network gives it, as it did before. */
sw.addEventListener('install', (e) => e.waitUntil(Promise.all([sw.skipWaiting(), keepShell(Date.now())])));
sw.addEventListener('activate', (e) => e.waitUntil(Promise.all([sw.clients.claim(), sweep(Date.now())])));

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  /* ─── the phone lane: a share from another app with a photo in it (`lib/phone/share.ts`) ───
     A POST to `/add` is the Home Screen app's share target; the host has nothing to take it, so it is answered here: the
     photos wait in their own cache and the words open `/add` as a share always did. */
  if (isShare(req.url, req.method, sw.registration.scope)) return e.respondWith(takeShare(req, sw.registration.scope, sw.caches));
  const kind = route(
    { url: req.url, method: req.method, mode: req.mode, authorised: req.headers.has('authorization') },
    sw.registration.scope,
  );
  if (kind === 'pass') return;
  /* THE COPY GOES BEFORE THE SESSION DOES, whatever the sign-out answers: a sign-out that failed half way still meant
     he wanted nothing of the record left on this phone. */
  if (kind === 'out') return e.waitUntil(Promise.all([sw.caches.delete(COPY), sw.caches.delete(SHARED)]));
  /* ─── the phone lane: Today offline. Today's read is sent as a POST (`today`, a read the host marks `postRead`), so it
     was a write here, never kept, and a phone that opened offline drew Today's refusal. It is kept like a read now,
     under its address and its question. ─── */
  if (kind === 'write' && POST_READS.test(new URL(req.url).pathname) && !req.headers.has('authorization')) return e.respondWith(postRead(e, Date.now()));
  e.respondWith(answer(kind, e, Date.now()));
});

/** The address of the app kept as the one shell: `adapter-static` builds one `index.html` that every address boots. */
const shell = (): string => sw.registration.scope;

async function answer(kind: Exclude<Route, 'pass' | 'out'>, e: Fetched, now: number): Promise<Response> {
  const req = e.request;
  if (kind === 'shell') {
    const quick = await shellFirst(e, now).catch(() => null);
    if (quick !== null) return quick;
  }
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
    if (keepable && !(kind === 'shell' && !keepsShell(req.url))) e.waitUntil(put(kind === 'shell' ? shell() : req.url, net.clone(), now));
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

/* ─── the phone lane: reads sent as a POST, kept as reads ─── */

/** The reads a client sends as a POST because their question is a body (`postRead` in the host's table). */
const POST_READS = /\/api\/(?:today|previewPage)$/u;

/**
 * A read sent as a POST, answered as a read is: the network's answer, kept under its address and its question (the
 * body's mark, since the same address asked with another body is another answer); and when nothing answered, the kept
 * one for the same question, with the page told how old it is, or the refusal every write gets offline.
 */
async function postRead(e: Fetched, now: number): Promise<Response> {
  const req = e.request;
  const body = await req.clone().text().catch(() => null);
  const key = body === null ? null : `${req.url}?~asked=${markOfText(body)}`;
  const net = await network(req);
  if (net !== null) {
    const json = (net.headers.get('content-type') ?? '').includes('application/json');
    if (key !== null && net.ok && net.type === 'basic' && json) e.waitUntil(put(key, net.clone(), now));
    return net;
  }
  const held = key === null ? null : await kept(key, now);
  if (held) {
    e.waitUntil(tell(e.clientId, held.at));
    return held.res;
  }
  return new Response(JSON.stringify({ ok: false, refusal: { code: 'UNREACHABLE', fix: words.notSent } }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
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

/**
 * The answer kept under `key` and when, or nothing when there is none younger than a week. An older one is deleted.
 *
 * READ WHOLE BEFORE IT ANSWERS, AND NEVER HANDED ON AS THE COPY'S OWN RESPONSE (scope 2026-10-24 A31). Chromium, given a
 * script answered with the response `match` returns, which streams out of Cache Storage, sometimes cancels the page's
 * module loads (`ERR_ABORTED`) a few tens of milliseconds into a busy load, and the page dies on "Failed to fetch
 * dynamically imported module". Measured on 424 loads of every route in four tabs under load: 8 to 17 pages lost a
 * module with the copy's response, none with the same bytes read into a new one, and none with the worker blocked. A
 * kept answer is a few kilobytes, so reading it whole costs nothing a person sees.
 */
async function kept(key: string, now: number): Promise<{ res: Response; at: number } | null> {
  const box = await sw.caches.open(COPY);
  const res = await box.match(key, { ignoreVary: true });
  if (!res) return null;
  const at = Number(res.headers.get(KEPT));
  if (fresh(at, now)) return { res: new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }), at };
  await box.delete(key);
  return null;
}

async function tell(client: string, at: number): Promise<void> {
  if (client === '') return;
  (await sw.clients.get(client))?.postMessage({ kept: at });
}

/** Sign-in and sign-up, whose pages the Worker sends with Turnstile's policy: never answered from the copy, nor kept. */
const SIGNING = /\/(signup|signin)\/?$/u;
const keepsShell = (url: string): boolean => !SIGNING.test(new URL(url).pathname);

/**
 * An address of the app answered from the kept shell, or `null` for the network to answer as before.
 *
 * THE BARE START ADDRESS (the home screen's `start_url`) is the Worker's entry, which sends a signed-in person on to
 * their record's address. Answered from the copy it goes to the record the copy's mark names (`keep` writes it), and the
 * entry is still asked behind it, so the session it keeps is kept. With no mark naming a record's address, the network.
 */
async function shellFirst(e: Fetched & { resultingClientId?: string }, now: number): Promise<Response | null> {
  const req = e.request;
  if (!keepsShell(req.url)) return null;
  const held = await kept(shell(), now);
  if (held === null) return null;
  const url = new URL(req.url);
  const root = new URL(shell());
  if (url.pathname === root.pathname || `${url.pathname}/` === root.pathname) {
    const mark = await (await sw.caches.open(COPY)).match(markOf(shell()));
    const base = mark ? await mark.text() : '';
    const to = new URL(`${base}/`, root);
    if (to.origin !== root.origin || !/^[^/]+\/$/u.test(to.pathname.slice(root.pathname.length))) return null;
    e.waitUntil(network(req));
    return Response.redirect(`${to.href}${url.search}`, 302);
  }
  const answered = held.res.clone();
  e.waitUntil(refresh(req, answered, e.resultingClientId ?? '', now));
  return held.res;
}

/** A shell the network answered, kept if it may be: a page of this origin, 200, and HTML. */
const shellable = (res: Response): boolean => res.ok && res.type === 'basic' && /^text\/html\b/iu.test(res.headers.get('content-type') ?? '');

/**
 * The shell asked for again behind the copy that answered: kept again, and when it is not the one drawn (a deploy), the
 * page that drew the old one is told, with a short mark of the new one so it reloads onto it once.
 */
async function refresh(req: Request, answered: Response, client: string, now: number): Promise<void> {
  const net = await network(req);
  if (net === null || !shellable(net)) return;
  const [was, is] = await Promise.all([answered.text(), net.clone().text()]);
  await put(shell(), net, now);
  if (was === is || client === '') return;
  /* THE PAGE MAY NOT BE A CLIENT YET when the network answers first: asked again for a few seconds, then let go, since
     the next open draws the new shell either way. */
  for (let i = 0; i < 30; i++) {
    const page = await sw.clients.get(client);
    if (page) return page.postMessage({ shell: markOfText(is) });
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The shell kept when the worker installs, so the first open after the one that registered it is drawn from the copy. */
async function keepShell(now: number): Promise<void> {
  try {
    const net = await fetch(shell(), { credentials: 'same-origin' });
    if (shellable(net)) await put(shell(), net, now);
  } catch {
    /* No network at install keeps nothing; the next open through the worker keeps it. */
  }
}

/** A short mark of a text, to tell one shell from another: FNV-1a, 32 bits, in hex. */
function markOfText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
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
