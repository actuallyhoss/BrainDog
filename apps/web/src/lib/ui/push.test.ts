/**
 * The phone half of Web Push: the key the host hands the browser, whether a toggle
 * is drawn at all, what a press sends and what it says, and the service worker that shows the one line.
 *
 * WHAT A BROWSER TEST WOULD MISS IS THE REFUSAL. `pushManager.subscribe` throws a `NotAllowedError` when notifications are
 * blocked, and `Notification.requestPermission` answers `denied` without asking anybody once they have been blocked
 * before, so the most common thing a person meets on this row is a failure that a click-through in an unblocked browser
 * never reaches. Each of them is held below as a sentence, never as a throw.
 *
 * THE SERVICE WORKER RUNS HERE, AGAINST A STAND-IN FOR ITS GLOBAL SCOPE. A service worker does not register under
 * `node --test`, but the file is two listeners on `self`, so the test puts an object with the same four members on
 * `globalThis.self`, imports the file, and fires the events at what it registered. That is how "reads nothing of a push"
 * is held by behaviour rather than by a pattern over the source: a push whose payload throws when read still shows the
 * line. The read copy's listeners are registered too and never fired here.
 *
 * THE SUBSCRIPTION'S SHAPE IS `37 §2.3`'s `PushSubscription`, `{ endpoint, keys: { p256dh, auth } }`, and the two method
 * names are the ones the record's push methods add. Neither was in the host table when this was written, so both are held by
 * doubles, as `webhook-doors.test.ts` holds a read written alongside its screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

import { BASE } from '../at.ts';
import { copy } from '../copy.ts';
import { hostKey, keyBytes, offerOf, sendTest, startOf, testWords, turnOff, turnOn, type Manager, type Ports, type Sub } from './push.ts';
import type { Call } from './webhook-doors.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '../..');
const WEB = join(SRC, '..');

/** A real P-256 public key, exported raw and spelled base64url, which is what a VAPID public key is. */
async function vapidPublic(): Promise<{ key: string; raw: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { key: Buffer.from(raw).toString('base64url'), raw };
}

const ENDPOINT = 'https://push.example/send/f1Xq9';
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

/** A browser subscription double that records whether it was taken back. */
function sub(key: Uint8Array<ArrayBuffer> | null = null): Sub & { dropped: boolean } {
  const s = {
    endpoint: ENDPOINT,
    dropped: false,
    options: { applicationServerKey: key ? key.buffer : null },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { ...KEYS } }),
    unsubscribe: async () => {
      s.dropped = true;
      return true;
    },
  };
  return s;
}

/** A push manager double: what it holds, what it was asked, and an optional failure for `subscribe`. */
function manager(held: Sub | null, fail?: Error): Manager & { asked: { userVisibleOnly: boolean; applicationServerKey: BufferSource }[]; made: ReturnType<typeof sub>[] } {
  const asked: { userVisibleOnly: boolean; applicationServerKey: BufferSource }[] = [];
  const made: ReturnType<typeof sub>[] = [];
  return {
    asked,
    made,
    getSubscription: async () => held,
    subscribe: async (o) => {
      asked.push(o);
      if (fail) throw fail;
      const s = sub(new Uint8Array(o.applicationServerKey as ArrayBuffer));
      made.push(s);
      return s;
    },
  };
}

/** A caller double: answers each method by name and writes down what it was asked. */
function caller(answers: Record<string, unknown>): { call: Call; asked: [string, unknown][] } {
  const asked: [string, unknown][] = [];
  const call: Call = async (name, args = {}) => {
    asked.push([name, args]);
    const a = answers[name];
    if (a instanceof Error) throw a;
    return a as never;
  };
  return { call, asked };
}

const ports = (permission: string, m: Manager, call: Call): Ports & { prompted: number } => {
  const p = {
    prompted: 0,
    permission: async () => {
      p.prompted += 1;
      return permission;
    },
    manager: async () => m,
    call,
  };
  return p;
};

/* ─── the key ─── */

test('THE HOST\'S BASE64URL PUBLIC KEY BECOMES THE 65 BYTES `applicationServerKey` TAKES, the uncompressed P-256 point', async () => {
  const { key, raw } = await vapidPublic();
  const bytes = keyBytes(key);
  assert.ok(bytes, 'a real VAPID public key was refused');
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04, 'an uncompressed point starts 0x04');
  assert.deepEqual([...bytes], [...raw]);
  /* A KEY PASTED WITH A NEWLINE OR PADDING IS THE SAME KEY. A host's variable is typed by a person, and `=` is what a
     base64 tool that does not know the url alphabet leaves on the end. */
  assert.deepEqual([...(keyBytes(`  ${key}=\n`) ?? [])], [...raw]);
});

test('A KEY THAT IS NOT A P-256 POINT IS NO KEY, so the browser is never handed bytes the push service will refuse', async () => {
  const { key } = await vapidPublic();
  /* THE RECORD'S OWN SIGNING KEY IS THE LIKELY MIX-UP. It is also a base64url public key on the host, 43 characters of
     Ed25519, and `subscribe` would take its 32 bytes and fail at the push service with nothing said. */
  const ed25519 = Buffer.from(new Uint8Array(32).fill(7)).toString('base64url');
  const compressed = Buffer.from([0x02, ...new Uint8Array(32).fill(9)]).toString('base64url');
  /* SIXTY-FIVE BYTES THAT ARE NOT A POINT. Every other case above is refused by its length alone, so with the `0x04`
     check deleted this list still passed in full; this one is the case only that check refuses. */
  const notAPoint = Buffer.from(new Uint8Array(65).fill(7)).toString('base64url');
  for (const bad of [null, undefined, '', '   ', ed25519, compressed, notAPoint, `${key.slice(0, -2)}+/`, key.slice(1), 'not a key'])
    assert.equal(keyBytes(bad), null, JSON.stringify(bad));
});

/* ─── whether a toggle is drawn ─── */

const EVERY = { worker: true, push: true, notify: true };

test('A HOST WITH NO KEY DRAWS NO TOGGLE AT ALL, not a switch that could only fail', async () => {
  /* UNTIL THE OWNER HAS PUT THE KEYS IN, `DELIVERS` has no `notify.push` and nothing would ever arrive, so the row
     is absent rather than disabled: a control that turns on and is never used to deliver anything is a lie told once. */
  for (const none of [null, undefined, '', 'short'] as const) assert.equal(offerOf(none, EVERY), null, String(none));
});

test('A HOST WITH A KEY OFFERS THE TOGGLE WITH ITS BYTES, and a browser that cannot push is told why in one sentence', async () => {
  const { key, raw } = await vapidPublic();
  const offer = offerOf(key, EVERY);
  assert.ok(offer?.can === true);
  assert.deepEqual([...offer.key], [...raw]);
  /* SAFARI ON AN IPHONE HAS NO `PushManager` UNTIL THE SITE IS ON THE HOME SCREEN, so a missing one is the place to say
     so, and it is the one fact that turns this row from nothing into something on that phone. */
  for (const lacks of ['worker', 'push', 'notify'] as const)
    assert.deepEqual(offerOf(key, { ...EVERY, [lacks]: false }), { can: false, line: copy.pushUnsupported }, lacks);
});

test('A BROWSER THAT HAS BLOCKED NOTIFICATIONS STARTS BY SAYING SO, before anybody presses anything', async () => {
  const held = (yes: boolean) => async () => yes;
  assert.deepEqual(await startOf('denied', held(false)), { on: false, line: copy.pushDenied });
  assert.deepEqual(await startOf('granted', held(true)), { on: true, line: '' });
  assert.deepEqual(await startOf('default', held(false)), { on: false, line: '' });
});

test('A BROWSER THAT WILL NOT SAY WHETHER IT IS SUBSCRIBED STARTS OFF WITH A SENTENCE, and the read never throws at the screen', async () => {
  /* THE COMPONENT CHAINED `getRegistration().then(...)` WITH NO CATCH. Both halves of that read are promises the specs
     allow to reject: `getRegistration` with `SecurityError` where the origin may not use service workers, and
     `getSubscription` with `AbortError` when the browser cannot reach its own push store. Neither was provoked in a
     browser here. What was certain is the shape: a rejection there went to the console as an unhandled one and left the
     row with no line, where every other failure on this row is a sentence. */
  const refuses = async (): Promise<boolean> => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  assert.deepEqual(await startOf('granted', refuses), { on: false, line: copy.pushUnread });
  assert.deepEqual(await startOf('default', refuses), { on: false, line: copy.pushUnread });
  /* BLOCKED STILL WINS, because it is the one sentence that tells a person what to change, and it needs no read. */
  assert.deepEqual(await startOf('denied', refuses), { on: false, line: copy.pushDenied });
});

/* ─── the host's key ─── */

/** A `fetch` double that answers one response for every address and writes down what it was asked. */
function getter(answer: (() => Response) | Error): { get: (url: string) => Promise<Response>; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get: async (url) => {
      asked.push(url);
      if (answer instanceof Error) throw answer;
      return answer();
    },
  };
}

test('THE KEY IS ASKED OF `<apiBase>/api/push/key` AND IS WHAT ITS `key` SAYS', async () => {
  const { key } = await vapidPublic();
  const { get, asked } = getter(() => Response.json({ key }));
  assert.equal(await hostKey('https://brain.dog/acme', get), key);
  assert.deepEqual(asked, ['https://brain.dog/acme/api/push/key']);
});

test('THE ADDRESS THE KEY IS ASKED AT IS ONE THE WORKER ANSWERS, read out of the Worker rather than typed again here', async () => {
  /* THIS ROW ONCE ASKED `<apiBase>/push/key`, WITH NO `/api`, and this file held that same wrong address, so every test
     here passed while the Worker, which answers `/api/push/key` and nothing else, was never asked. On brain.dog that
     address is not the Worker's and the answer is not a key, so the row was never drawn for anybody. The Worker's own
     test asks `/the-studio/api/push/key` and gets the key: it moves the slug to the root before it matches, which is
     why the slug is taken off below. Read as text, because `graph` refuses an import across the two apps. */
  const vapid = readFileSync(join(WEB, '../worker/src/vapid.ts'), 'utf8');
  const source = /servesPushKey = \(pathname: string\): boolean => \/(.+)\/\.test\(pathname\)/u.exec(vapid)?.[1];
  assert.ok(source, '`servesPushKey` is no longer spelled as this test reads it; read it again and fix the pattern');
  const serves = new RegExp(source);
  for (const base of ['https://brain.dog', 'https://brain.dog/acme']) {
    const { get, asked } = getter(() => Response.json({ key: null }));
    await hostKey(base, get);
    const path = new URL(asked[0] ?? '').pathname.replace(/^\/acme(?=\/)/u, '');
    assert.equal(serves.test(path), true, `${asked[0]} is not an address the Worker answers`);
  }
});

test('A HOST WITH NO KEY, NO ROUTE OR NO ANSWER GIVES NO KEY, so the row is not drawn and nothing is thrown', async () => {
  /* THE STATIC DEMO ANSWERS EVERY ADDRESS WITH THE SHELL. `adapter-static`'s fallback is `index.html` at 200, so on a host
     with no Worker behind it `/api/push/key` is a page of HTML that says `ok`, and reading it as JSON throws. That is the
     one of these a browser meets on the public demo, which is why it is here beside the 404. */
  const cases: [string, (() => Response) | Error][] = [
    ['a key the host has not set', () => Response.json({ key: null })],
    ['a host that predates the route', () => new Response('Not found', { status: 404 })],
    ['a host that failed', () => Response.json({ key: 'BAAA' }, { status: 500 })],
    ['the static shell', () => new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } })],
    ['a body with no key in it', () => Response.json({})],
    ['a key that is not a string', () => Response.json({ key: 42 })],
    ['nothing answered', new TypeError('fetch failed')],
  ];
  for (const [what, answer] of cases) assert.equal(await hostKey('https://brain.dog', getter(answer).get), null, what);
});

/* ─── nothing changes for anybody who never presses it ─── */

test('SVELTEKIT DOES NOT REGISTER THE WORKER ON EVERY PAGE LOAD, so a person who never turns this on never gets one', async () => {
  /* MEASURED IN THE GENERATED `.svelte-kit/generated/server/internal.js`: `service_worker: true` while the config left
     `serviceWorker.register` at its default, which puts `navigator.serviceWorker.register(...)` in the shell's inline
     boot script on `load` for every visitor to every page. The toggle registers the worker itself on the press. */
  const config = (await import(pathToFileURL(join(WEB, 'svelte.config.js')).href)) as {
    default: { kit: { serviceWorker?: { register?: boolean } } };
  };
  assert.equal(config.default.kit.serviceWorker?.register, false);
});

test('THE SERVICE WORKER IS A MODULE, so its names stay in its own scope and not in the app\'s global one', () => {
  /* A `.ts` FILE WITH NO IMPORT AND NO EXPORT IS A SCRIPT TO TYPESCRIPT, and every top-level name in it is declared on the
     global scope of the whole program the app is checked as: `Waits`, `Opened`, `Scope` and `sw` were visible, as
     globals, in every Svelte component. `isExternalModule` is the compiler's own answer to the question. */
  const path = join(SRC, 'service-worker.ts');
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ts.isExternalModule(file), true);
});

/* ─── turning it on ─── */

test('A DENIED PERMISSION IS SAID AS A SENTENCE AND NOT THROWN, and nothing is subscribed or sent', async () => {
  const { key } = await vapidPublic();
  const m = manager(null);
  const { call, asked } = caller({});
  const said = await turnOn(ports('denied', m, call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'denied', line: copy.pushDenied });
  assert.equal(m.asked.length, 0);
  assert.deepEqual(asked, []);
});

test('A QUESTION CLOSED WITHOUT AN ANSWER IS NOT A BLOCK, and says so differently, because asking again still works', async () => {
  const { key } = await vapidPublic();
  const said = await turnOn(ports('default', manager(null), caller({}).call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'denied', line: copy.pushDismissed });
});

test('A SUBSCRIBE THE BROWSER REFUSES WITH NotAllowedError IS THE SAME SENTENCE AS A DENIED PERMISSION, not an exception', async () => {
  /* PERMISSION CAN BE GRANTED AND SUBSCRIBE STILL REFUSED: Chrome answers `NotAllowedError` when the site setting changed
     between the two calls, and Brave does it with push messaging turned off, with the permission reading `granted`. */
  const { key } = await vapidPublic();
  const m = manager(null, new DOMException('Registration failed - permission denied', 'NotAllowedError'));
  const said = await turnOn(ports('granted', m, caller({}).call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'denied', line: copy.pushDenied });
});

test('A PUSH SERVICE THAT DOES NOT ANSWER IS ITS OWN SENTENCE, and still nothing is thrown', async () => {
  const { key } = await vapidPublic();
  const m = manager(null, new DOMException('Registration failed - push service error', 'AbortError'));
  const said = await turnOn(ports('granted', m, caller({}).call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'failed', line: copy.pushNoService });
});

test('GRANTED, IT SUBSCRIBES WITH THE HOST\'S KEY AND userVisibleOnly, and hands the record `37 §2.3`\'s shape', async () => {
  const { key, raw } = await vapidPublic();
  const m = manager(null);
  const { call, asked } = caller({ subscribePush: { ok: true, value: null } });
  const said = await turnOn(ports('granted', m, call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'on' });
  assert.equal(m.asked.length, 1);
  assert.equal(m.asked[0]?.userVisibleOnly, true, 'Chrome refuses a subscription that may push without showing anything');
  assert.deepEqual([...new Uint8Array(m.asked[0]?.applicationServerKey as ArrayBuffer)], [...raw]);
  assert.deepEqual(asked, [['subscribePush', { endpoint: ENDPOINT, keys: KEYS }]]);
});

test('A SUBSCRIPTION THIS BROWSER ALREADY HOLDS UNDER THE SAME KEY IS SENT AGAIN, not replaced', async () => {
  const { key } = await vapidPublic();
  const bytes = keyBytes(key)!;
  const held = sub(bytes);
  const m = manager(held);
  const { call, asked } = caller({ subscribePush: { ok: true, value: null } });
  assert.deepEqual(await turnOn(ports('granted', m, call), bytes), { kind: 'on' });
  assert.equal(m.asked.length, 0);
  assert.equal(held.dropped, false);
  assert.deepEqual(asked, [['subscribePush', { endpoint: ENDPOINT, keys: KEYS }]]);
});

test('ONE HELD UNDER AN OLD KEY IS DROPPED FIRST, because `subscribe` with a new key throws InvalidStateError over it', async () => {
  const old = await vapidPublic();
  const now = await vapidPublic();
  const held = sub(keyBytes(old.key));
  const m = manager(held);
  const said = await turnOn(ports('granted', m, caller({ subscribePush: { ok: true, value: null } }).call), keyBytes(now.key)!);
  assert.deepEqual(said, { kind: 'on' });
  assert.equal(held.dropped, true);
  assert.equal(m.asked.length, 1);
});

test('A RECORD THAT REFUSES THE ADDRESS TAKES THE BROWSER\'S SUBSCRIPTION BACK, so the toggle never reads on for nothing', async () => {
  /* THE HOST TABLE HAD NO `subscribePush` WHEN THIS WAS WRITTEN, and the client answers `ROUTE_UNKNOWN` before it fetches
     anything. Left subscribed, the browser holds an endpoint the record never heard of: `getSubscription` answers it,
     the row reads on, and nothing will ever arrive. */
  const { key } = await vapidPublic();
  const m = manager(null);
  const { call } = caller({ subscribePush: { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called subscribePush.' } } });
  const said = await turnOn(ports('granted', m, call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'refused', fix: copy.pushNoRoute });
  assert.equal(m.made[0]?.dropped, true);
});

test('A STALE SIGN-IN IS THE RECORD\'S OWN SENTENCE, and so is no sign-in at all', async () => {
  const { key } = await vapidPublic();
  const fix = 'Sign in again to do this.';
  const stale = await turnOn(ports('granted', manager(null), caller({ subscribePush: { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix } } }).call), keyBytes(key)!);
  assert.deepEqual(stale, { kind: 'signin', fix });
  /* A 401 WITH NO SLUG IN THE ADDRESS WAS THE SAMPLE, and the row answered it with the demo's sentence about having no
     account. There is no sample now: a 401 is a person who is not signed in, wherever they are. */
  const m = manager(null);
  const none = await turnOn(ports('granted', m, caller({ subscribePush: { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in to this record first.' } } }).call), keyBytes(key)!);
  assert.deepEqual(none, { kind: 'signin', fix: 'Sign in to this record first.' });
  assert.equal(m.made[0]?.dropped, true, 'a refused address leaves the browser subscribed');
});

test('A RECORD THAT WAS NOT REACHED SAYS SO, in the row\'s own sentence and not the client\'s status line', async () => {
  /* The client's `UNREACHABLE` sentence names a status and a parse ("200 with a body that is not JSON"), which is true
     and says nothing a person can act on. `pushNotSent` is the sentence the row already said for a call that threw. */
  const { key } = await vapidPublic();
  const said = await turnOn(ports('granted', manager(null), caller({ subscribePush: { ok: false, refusal: { code: 'UNREACHABLE', fix: 'The record could not be reached: 200 with a body that is not JSON' } } }).call), keyBytes(key)!);
  assert.deepEqual(said, { kind: 'refused', fix: copy.pushNotSent });
});

test('THE ROW SAYS NOTHING ABOUT A DEMO, because there is none', () => {
  const source = readFileSync(join(HERE, 'PushToggle.svelte'), 'utf8');
  assert.doesNotMatch(source, /notOnDemo|'sample'/u);
  assert.doesNotMatch(readFileSync(join(HERE, 'push.ts'), 'utf8'), /'sample'|noRecord/u);
});

test('A CALL THAT THROWS IS STILL A SENTENCE, and the subscription goes back', async () => {
  const { key } = await vapidPublic();
  const m = manager(null);
  const said = await turnOn(ports('granted', m, caller({ subscribePush: new TypeError('fetch failed') }).call), keyBytes(key)!);
  assert.equal(said.kind, 'refused');
  assert.equal(m.made[0]?.dropped, true);
});

/* ─── turning it off ─── */

test('OFF DROPS THE BROWSER\'S SUBSCRIPTION FIRST AND THEN TELLS THE RECORD, so a record that cannot be reached still stops', async () => {
  /* THE BROWSER'S HALF IS THE ONE THAT GUARANTEES SILENCE. Once it is gone the push service answers 410 for the endpoint
     and the record drops the row itself (`51 §5`), so a record offline at the moment of the press costs nothing. */
  const held = sub();
  const { call, asked } = caller({ unsubscribePush: new TypeError('fetch failed') });
  const said = await turnOff({ permission: async () => 'granted', manager: async () => manager(held), call });
  assert.deepEqual(said, { kind: 'off' });
  assert.equal(held.dropped, true);
  assert.deepEqual(asked, [['unsubscribePush', { endpoint: ENDPOINT }]]);
});

test('OFF WITH NOTHING HELD SENDS NOTHING', async () => {
  const { call, asked } = caller({});
  assert.deepEqual(await turnOff({ permission: async () => 'granted', manager: async () => manager(null), call }), { kind: 'off' });
  assert.deepEqual(asked, []);
});

/* ─── the service worker ─── */

type Listener = (e: unknown) => void;

async function worker(open: { url: string }[] = []) {
  const on = new Map<string, Listener>();
  const shown: [string, unknown][] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const waited: Promise<unknown>[] = [];
  const scope = `https://brain.dog${BASE}/`;
  (globalThis as { self?: unknown }).self = {
    registration: {
      scope,
      showNotification: async (title: string, options?: unknown) => void shown.push([title, options]),
    },
    clients: {
      matchAll: async () => open.map((c) => ({ ...c, focus: async () => void focused.push(c.url) })),
      openWindow: async (url: string) => void opened.push(url),
    },
    addEventListener: (type: string, fn: Listener) => {
      assert.equal(on.has(type), false, `${type} listened for twice`);
      on.set(type, fn);
    },
  };
  /* A FRESH MODULE EACH TIME, so each test's stand-in is the `self` the file registers on. */
  await import(`../../service-worker.ts?${Math.random()}`);
  const fire = async (type: string, extra: Record<string, unknown> = {}) => {
    on.get(type)?.({ waitUntil: (p: Promise<unknown>) => void waited.push(p), ...extra });
    await Promise.all(waited);
  };
  return { on, shown, opened, focused, waited, fire, scope };
}

test('A PUSH WITH A PATH SHOWS THE SAME LINE AND A TAP OPENS THAT PATH, never a word that came with it', async () => {
  const w = await worker();
  await w.fire('push', { data: { json: () => ({ open: `${BASE}/kiln/decide/sg_01JQ`, title: 'Invoice 41 is late' }) } });
  assert.equal(w.shown[0]?.[0], 'Something in your BrainDog needs you');
  assert.deepEqual(w.shown[0]?.[1], { tag: 'braindog', data: { open: `https://brain.dog${BASE}/kiln/decide/sg_01JQ` } });
  assert.doesNotMatch(JSON.stringify(w.shown), /Invoice/u, 'a word that came with the push was drawn');
  await w.fire('notificationclick', { notification: { close: () => {}, data: w.shown[0]?.[1] && (w.shown[0][1] as { data: unknown }).data } });
  assert.deepEqual(w.opened, [`https://brain.dog${BASE}/kiln/decide/sg_01JQ`]);
  /* AN ADDRESS OUT OF THE SCOPE OPENS HOME. The scope is the whole origin since the app moved to the root, so out of it
     is another origin. */
  const other = await worker();
  await other.fire('push', { data: { json: () => ({ open: 'https://elsewhere.example/x' }) } });
  assert.deepEqual(other.shown[0]?.[1], { tag: 'braindog' });
});

test('A PUSH THAT NAMES ITS KIND SAYS THE KIND\'S LINE, ON A LINE OF ITS OWN, and still no word that came with it', async () => {
  const w = await worker();
  await w.fire('push', { data: { json: () => ({ open: `${BASE}/kiln/decide/sg_01JQ`, kind: 'agents', title: 'Invoice 41 is late' }) } });
  assert.equal(w.shown[0]?.[0], 'An agent needs your answer');
  assert.deepEqual(w.shown[0]?.[1], { tag: 'braindog-agents', data: { open: `https://brain.dog${BASE}/kiln/decide/sg_01JQ` } });
  assert.doesNotMatch(JSON.stringify(w.shown), /Invoice/u, 'a word that came with the push was drawn');
  const money = await worker();
  await money.fire('push', { data: { json: () => ({ open: `${BASE}/kiln/r/installments`, kind: 'money' }) } });
  assert.equal(money.shown[0]?.[0], 'Something in your money is coming due');
  /* A KIND THAT IS NOT ONE IS NO KIND, and the line every push said before. */
  const odd = await worker();
  await odd.fire('push', { data: { json: () => ({ open: `${BASE}/kiln/decide`, kind: 'Invoice 41' }) } });
  assert.equal(odd.shown[0]?.[0], 'Something in your BrainDog needs you');
  assert.deepEqual(odd.shown[0]?.[1], { tag: 'braindog', data: { open: `https://brain.dog${BASE}/kiln/decide` } });
});

test('A PUSH SHOWS ONE FIXED LINE AND READS NOTHING THAT CAME WITH IT', async () => {
  const w = await worker();
  /* A PAYLOAD THAT THROWS WHEN TOUCHED. Today's kernel writes `{ title, url }` into `notify.push`, and `09 §3` is that a
     push carries no content, so if anything in the worker read it this test would fail rather than the line change. */
  const data = {
    get json() {
      throw new Error('the worker read the payload');
    },
    get text() {
      throw new Error('the worker read the payload');
    },
  };
  await w.fire('push', { data });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0]?.[0], 'Something in your BrainDog needs you');
  assert.equal(w.waited.length, 1, 'the notification was not kept alive with waitUntil, so the browser may kill it first');
  /* NO BODY, and a tag so a second push replaces the first line instead of stacking two identical ones. */
  assert.deepEqual(w.shown[0]?.[1], { tag: 'braindog' });
});

test('THE WORKER LISTENS FOR PUSH, A CLICK, AND THE READ COPY\'S THREE EVENTS, each once', async () => {
  /* THE READ COPY ADDED `install`, `activate` and `fetch`; `lib/data/offline.ts` holds which request is which. */
  const w = await worker();
  assert.deepEqual([...w.on.keys()].sort(), ['activate', 'fetch', 'install', 'notificationclick', 'push']);
});

test('A CLICK CLOSES THE LINE AND OPENS THE RECORD\'S HOME, the root of the scope the worker was registered at', async () => {
  const w = await worker();
  let closed = false;
  await w.fire('notificationclick', { notification: { close: () => void (closed = true) } });
  assert.equal(closed, true);
  assert.deepEqual(w.opened, [w.scope]);
  assert.equal(w.scope, `https://brain.dog${BASE}/`);
});

test('A HOME ALREADY OPEN IS FOCUSED RATHER THAN OPENED TWICE, and a window on another screen is left as it is', async () => {
  const home = `https://brain.dog${BASE}/`;
  const w = await worker([{ url: `https://brain.dog${BASE}/r/tasks` }, { url: home }]);
  await w.fire('notificationclick', { notification: { close: () => {} } });
  assert.deepEqual(w.focused, [home]);
  assert.deepEqual(w.opened, []);
});

/* ─── the manifest ─── */

test('THE MANIFEST IS STANDALONE AND SCOPED TO THE APP, which is what iOS needs before it delivers a push at all', () => {
  const manifest = JSON.parse(readFileSync(join(SRC, '../static/manifest.webmanifest'), 'utf8')) as {
    display: string;
    scope: string;
    start_url: string;
    id: string;
    name: string;
    icons: { src: string }[];
  };
  assert.equal(manifest.display, 'standalone');
  /* `BASE` IS HELD EQUAL TO `paths.base` BY `at.test.ts`, so this is the app's root and not the marketing site's. */
  assert.equal(manifest.scope, `${BASE}/`);
  assert.equal(manifest.start_url, `${BASE}/`);
  assert.equal(manifest.id, `${BASE}/`);
  assert.equal(manifest.name, 'BrainDog');
  /* EVERY ICON IS A FILE THAT SHIPS. `static/` is copied under the base, so `/x` is `static/x`. */
  assert.ok(manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith(`${BASE}/`), icon.src);
    assert.ok(existsSync(join(SRC, '../static', icon.src.slice(BASE.length + 1))), `${icon.src} is not in static/`);
  }
});

test('THE SHELL LINKS THE MANIFEST THROUGH THE ASSETS PATH, as it links the mark', () => {
  const shell = readFileSync(join(SRC, 'app.html'), 'utf8');
  const assets = ['%sveltekit', 'assets%'].join('.');
  assert.ok(shell.includes(`<link rel="manifest" href="${assets}/manifest.webmanifest" />`), 'app.html does not link the manifest');
});

test('THE SHELL NAMES A HOME SCREEN ICON IOS WILL USE, a square PNG that ships, because iOS reads no icon from the manifest', () => {
  /* SAFARI TAKES THE HOME SCREEN ICON FROM `apple-touch-icon` AND NOWHERE ELSE, and it takes a PNG: the manifest's SVG
     icon was the only one the app had, so adding BrainDog to an iPhone, which is the step `offerOf` tells that phone to
     take, gave it no icon of ours. 180 is the size Apple asks for on current iPhones. */
  const shell = readFileSync(join(SRC, 'app.html'), 'utf8');
  const assets = ['%sveltekit', 'assets%'].join('.');
  const link = /<link rel="apple-touch-icon" href="([^"]+)" \/>/u.exec(shell);
  const href = link?.[1] ?? '';
  assert.ok(href, 'app.html has no apple-touch-icon link');
  assert.ok(href.startsWith(`${assets}/`), `${href} is not under the assets path`);
  const png = readFileSync(join(SRC, '../static', href.slice(assets.length + 1)));
  assert.deepEqual([...png.subarray(1, 4)], [...Buffer.from('PNG')], 'the icon is not a PNG');
  /* IHDR'S WIDTH AND HEIGHT, the first two big-endian words after the eight-byte signature and the chunk's header. */
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180]);
});

test('A TEST PRESS SAYS WHAT THE RECORD SENT, and never that nothing was turned on (pushTest)', async () => {
  const line = 'Sent to 2 devices. It should arrive within a minute.';
  assert.deepEqual(await sendTest(caller({ pushTest: { ok: true, value: { devices: 2, line } } }).call), { kind: 'sent', line });
  assert.deepEqual(await sendTest(caller({ pushTest: { ok: true, value: { devices: 1 } } }).call), { kind: 'sent', line: testWords.sent(1) });
  /* NONE ON THE RECORD IS THE DEAD SUBSCRIPTION THE TEST IS FOR, said as a failure. */
  assert.deepEqual(await sendTest(caller({ pushTest: { ok: true, value: { devices: 0 } } }).call), { kind: 'failed', line: testWords.none });
  /* A PRESS INSIDE THE MINUTE IS THE RECORD'S, and its fix already says when the next may go. */
  const fix = 'The last test went a moment ago. The next can go in a minute.';
  assert.deepEqual(await sendTest(caller({ pushTest: { ok: false, refusal: { code: 'RATE_LIMITED', fix } } }).call), { kind: 'refused', fix });
  assert.deepEqual(await sendTest(caller({ pushTest: { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no such call' } } }).call), { kind: 'refused', fix: testWords.noRoute });
  assert.deepEqual(await sendTest(caller({ pushTest: new Error('offline') }).call), { kind: 'refused', fix: testWords.notReached });
});
