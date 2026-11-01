/**
 * The read copy a phone keeps, for 7 days, so a record opened on a train still draws what it drew at the last stop.
 *
 * TWO HALVES SHARE THIS FILE. `service-worker.ts` imports the pure half (which request is which, how old is too old,
 * the words a write is answered with offline), and the page imports the half that touches the browser (registering the
 * worker, claiming the copy for one record, deleting it). One file, so the cache's name and the record's mark are
 * spelt once and the worker and the page cannot disagree about them.
 *
 * READ-ONLY, AND NOTHING WAITS TO BE SENT. A write made offline is answered at once with a sentence that says it was
 * not sent, and nothing is queued: a queue replayed hours later against a record other people wrote to meanwhile would
 * land changes nobody could see being made, which is the one thing this record must never do.
 *
 * NOTHING READABLE OUTLIVES THE SESSION. The copy is deleted on a 401, on sign-out and when the phone moves to another
 * record, so a signed-out or shared phone keeps nothing of the record it was on.
 *
 * PLAIN NODE LOADS THIS FILE, because the worker imports it and `push.test.ts` runs the worker under `node --test`. So
 * it imports only a relative `.ts` file, and every browser global is read inside a function, never at the top.
 */

import { BASE, DOORS } from '../at.ts';

/** The one cache: the app's shell, its files and the record's answers, deleted together. */
export const COPY = 'braindog-copy';

/** How long an answer is drawn offline: a week. Older than this it is deleted rather than shown. */
export const WEEK = 7 * 24 * 60 * 60 * 1000;

/** The header a kept answer carries its keeping time in, in milliseconds since the epoch. */
export const KEPT = 'x-braindog-kept';

/**
 * THE HEADER A DOOR'S REFUSAL CARRIES WHEN A PERSON'S ACCESS ENDED, `x-braindog-access: ended`: their
 * last share stopped, or they were taken off the record. The copy goes on it as on a 401, so nothing of the record is
 * left on the device to draw offline.
 */
export const ACCESS = 'x-braindog-access';

/** Whether an answer's headers say the person's access ended. */
export const accessEnded = (headers: { get(name: string): string | null }): boolean => headers.get(ACCESS) === 'ended';

/**
 * AT MOST THIS MANY ANSWERS ARE KEPT. Every list he opens and every page of it is one answer, and a week of use could
 * otherwise grow the cache without end; past the ceiling the oldest go first, which are the ones least likely to be
 * opened offline.
 */
export const CEILING = 400;

/**
 * Reads that are never kept.
 *
 * `version` IS THE POLL, and it must fail offline: an old version answered from the copy would keep the hairline
 * saying the record is reachable. `sharedPage` is somebody else's page read with a share link, not this person's
 * record. `export` and `exportUseCase` are the whole record in one answer, which is a download and not a screen.
 */
const NEVER: ReadonlySet<string> = new Set(['version', 'sharedPage', 'export', 'exportUseCase']);

/**
 * What the worker does with one request.
 *
 * `pass` is left to the browser untouched. `out` is a sign-out, which deletes the copy and then goes to the network.
 * `read` is a record method read with a GET, kept and answered from the copy when the network fails. `write` is any
 * other method call, which is never kept and is answered with `notSent` when the network fails. `door` is a host
 * door under `/api/` (Slash's, the key doors) or a read that is never kept: it goes to the network, and only its 401
 * is looked at. `shell` is opening an address of the app, `asset` a file whose name carries its hash, `file` any other
 * file of the app.
 */
export type Route = 'pass' | 'out' | 'read' | 'write' | 'door' | 'shell' | 'asset' | 'file';

/** The four facts about a request `route` decides on, so a test hands it a literal and not a `Request`. */
export type Asked = { url: string; method: string; mode: string; authorised: boolean };

/**
 * Which kind of request this is, for the worker registered at `scope` (the app's root, `https://app.brain.dog/`).
 *
 * THE RECORD ANSWERS AT TWO KINDS OF ADDRESS (`apiBase` in `lib/at.ts`): `/api/<method>` for the session's record and
 * `/<slug>/api/<method>` for a named one.
 *
 * THE SCOPE IS THE WHOLE ORIGIN NOW, AND THE HOST'S DOORS ARE IN IT. While the app was under `/app` the scope kept
 * `/auth/*`, `/oauth/*` and the rest outside it; at the root they are inside, so a door's first segment (`DOORS` in
 * `lib/at.ts`) is passed to the browser untouched before anything else is decided, as it was when it was outside: a
 * sign-in's answer is never kept, and OAuth's consent page is never answered with the app's shell. An address from
 * before the move, under `/app`, is a door too, and the Worker answers it with a 308.
 *
 * A REQUEST CARRYING ITS OWN AUTHORIZATION IS NEVER KEPT. The browser's cookie is the session this copy belongs to; a
 * request that brings a bearer or a share link is somebody else's access and its answer is not his to keep.
 */
export function route(asked: Asked, scope: string): Route {
  const u = new URL(asked.url);
  const root = new URL(scope);
  if (u.origin !== root.origin) return 'pass';
  const path = u.pathname;
  if (asked.method === 'POST' && (path === '/auth/logout' || path === '/auth/logout/all')) return 'out';
  const first = /^\/([^/]*)/.exec(path)?.[1] ?? '';
  /* `_app` IS A DOOR TO AN ADDRESS, never a record's name, but its files are the app's own and kept like any other. */
  if (first !== 'api' && first !== '_app' && DOORS.has(first)) return 'pass';
  const at = path.indexOf('/api/');
  const before = at < 0 ? null : path.slice(0, at);
  /* THE SESSION'S RECORD AT THE ORIGIN'S ROOT, or a named one exactly one segment under the app's root. */
  const onRecord =
    before === '' || (before !== null && before.startsWith(root.pathname) && /^[^/]+$/.test(before.slice(root.pathname.length)));
  if (onRecord) {
    const name = path.slice(at + '/api/'.length);
    if (asked.method !== 'GET') return 'write';
    if (name.includes('/') || NEVER.has(name) || asked.authorised) return 'door';
    return 'read';
  }
  if (!path.startsWith(root.pathname) && `${path}/` !== root.pathname) return 'pass';
  if (asked.method !== 'GET') return 'pass';
  if (asked.mode === 'navigate') return 'shell';
  if (path.startsWith(`${root.pathname}_app/immutable/`)) return 'asset';
  return 'file';
}

/** Whether an answer kept at `at` may still be drawn at `now`. A missing or unreadable time is too old. */
export const fresh = (at: number, now: number): boolean => Number.isFinite(at) && at <= now && now - at < WEEK;

/** Where the record the copy belongs to is written down, inside the copy, so deleting the one deletes the other. */
export const markOf = (scope: string): string => new URL('~record', scope).href;

/**
 * The words the copy says, this module's own, because the worker says one of them and cannot
 * import the copy aggregate: the whole of every screen's words would ship inside a file whose job is two listeners.
 */
export const words = {
  /** Drawn over a screen answered from the copy, calm and plain: "Offline, showing what you last saw at 14:02." */
  from: (when: string) => `Offline, showing what you last saw at ${when}.`,
  /** Beside it: what cannot happen until the phone is back, said before anybody tries. */
  cannotSave: 'Changes can’t be saved until you’re back online.',
  /** The `fix` of every write the worker answers offline. */
  notSent: 'Not saved, because you’re offline. Nothing is kept to send later, so do it again once you’re back online.',
};

/**
 * When a copy was kept, said the way the offline line says it.
 *
 * THE TIME ALONE FOR TODAY ("from 14:02"), and the weekday with it for an older one,
 * because a copy is at most a week old and "from 14:02" on Tuesday's answer would read as this afternoon's.
 */
export function when(at: number, now: number): string {
  const kept = new Date(at);
  const time = kept.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (kept.toDateString() === new Date(now).toDateString()) return time;
  return `${kept.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/* ─── the page's half ─── */

/** The app's root, where the worker is registered and whose `~record` is the mark. */
const scopeHere = (): string => `${globalThis.location.origin}${BASE}/`;

const cachesHere = (): CacheStorage | null => (typeof caches === 'undefined' ? null : caches);

/** Delete the copy: on a 401, on sign-out, and before another record's answers are kept. */
export async function forget(): Promise<void> {
  await cachesHere()?.delete(COPY);
}

/**
 * Keep a copy for the record at `base`: register the worker, and delete whatever copy belongs to another record.
 *
 * THE WORKER IS REGISTERED HERE AND NOT ONLY BY THE PUSH TOGGLE, because a copy needs the worker whether or not he
 * turned notifications on. It is the same file at the same scope as `PushToggle.svelte` registers, so the two calls
 * name one registration and the toggle still reads its own subscription, never the registration's existence.
 *
 * NOT IN DEVELOPMENT, where Vite serves every module fresh and a worker keeping them would answer yesterday's code.
 *
 * A BASE IS A RECORD, and a different base is a switch even where both name the same record (the session's record at
 * the bare address and again under its slug): deleting a copy that was his costs one online read, and keeping one
 * that was somebody else's is the thing this rule is for.
 */
export async function keep(base: string, dev: boolean): Promise<void> {
  const box = cachesHere();
  if (box === null) return;
  const mark = markOf(scopeHere());
  const held = await box.open(COPY);
  const was = await held.match(mark);
  if ((was ? await was.text() : null) !== base) {
    await box.delete(COPY);
    await (await box.open(COPY)).put(mark, new Response(base));
  }
  if (dev || !('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register(`${BASE}/service-worker.js`, { scope: `${BASE}/`, type: 'classic' });
}

/**
 * Drop the kept shell, so the next open of the app asks the network for it: the page heard that a newer build is live
 * (`newerBuild` in `live.ts`), and the shell kept is the old one's.
 */
export async function dropShell(): Promise<void> {
  await (await cachesHere()?.open(COPY))?.delete(scopeHere());
}

/**
 * Hear the worker say the shell it drew this page from is not the one the network now answers (a deploy), with a short
 * mark of the new one (`refresh` in `service-worker.ts`).
 */
export function hearShell(fn: (mark: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const on = (e: MessageEvent<unknown>) => {
    const said = e.data;
    if (said !== null && typeof said === 'object' && 'shell' in said && typeof said.shell === 'string') fn(said.shell);
  };
  navigator.serviceWorker.addEventListener('message', on);
  navigator.serviceWorker.startMessages();
  return () => navigator.serviceWorker.removeEventListener('message', on);
}

/**
 * Hear the worker say it answered from the copy, with the time that answer was kept.
 *
 * `startMessages` BECAUSE A LISTENER ADDED WITH `addEventListener` DOES NOT OPEN THE QUEUE: messages a worker posts to
 * a page wait until `onmessage` is set or the page asks for them, and nothing here sets `onmessage`.
 */
export function hear(fn: (at: number) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const on = (e: MessageEvent<unknown>) => {
    const said = e.data;
    if (said !== null && typeof said === 'object' && 'kept' in said && typeof said.kept === 'number') fn(said.kept);
  };
  navigator.serviceWorker.addEventListener('message', on);
  navigator.serviceWorker.startMessages();
  return () => navigator.serviceWorker.removeEventListener('message', on);
}
