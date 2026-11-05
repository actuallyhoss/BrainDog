/**
 * The shell is answered from the copy and asked for again behind it (scope 2026-10-24 A17, `shellFirst` in
 * `service-worker.ts`): the kept shell draws at once, the network's is kept behind it, and a different one (a deploy) is
 * kept and the page told. Sign-in and sign-up are never answered from the copy, and the bare start address goes to the
 * record the copy's mark names, with the Worker's entry still asked behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE } from '../at.ts';
import { COPY, DAY, FRAME_PATH, freshFor, guestHere, guestMarkOf, KEPT, markGuest, markOf, WEEK } from './offline.ts';
import { keepFrame } from '../home/kept-frame.ts';

type Listener = (e: unknown) => void;

const SCOPE = `https://brain.dog${BASE}/`;
const html = (body: string) =>
  Object.defineProperty(new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }), 'type', { value: 'basic' });

async function worker(answer: (url: string) => Response) {
  const on = new Map<string, Listener>();
  const box = new Map<string, Response>();
  const told: unknown[] = [];
  const asked: string[] = [];
  /** Every response `match` handed out, so a test can tell the copy's own from one read out of it. */
  const matched: Response[] = [];
  const cache = {
    put: async (key: string | Request, res: Response) => void box.set(typeof key === 'string' ? key : key.url, res),
    match: async (key: string | { url: string }) => {
      const res = box.get(typeof key === 'string' ? key : key.url)?.clone();
      if (res) matched.push(res);
      return res;
    },
    keys: async () => [...box.keys()].map((url) => ({ url })),
    delete: async (key: string | { url: string }) => box.delete(typeof key === 'string' ? key : key.url),
  };
  (globalThis as { self?: unknown }).self = {
    registration: { scope: SCOPE, showNotification: async () => undefined },
    clients: { matchAll: async () => [], openWindow: async () => undefined, get: async () => ({ postMessage: (m: unknown) => void told.push(m) }), claim: async () => undefined },
    caches: { open: async (name: string) => (assert.equal(name, COPY), cache), delete: async () => box.clear() },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, fn: Listener) => void on.set(type, fn),
  };
  (globalThis as { fetch?: unknown }).fetch = async (req: string | { url: string }) => {
    const url = typeof req === 'string' ? req : req.url;
    asked.push(url);
    return answer(url);
  };
  await import(`../../service-worker.ts?${Math.random()}`);
  const open = async (url: string, mode = 'navigate') => {
    const waited: Promise<unknown>[] = [];
    const held: { res: Promise<Response> | null } = { res: null };
    /* A NAVIGATION, which `new Request` cannot make outside a browser: the four facts the worker reads. */
    const request = { url, method: 'GET', mode, headers: new Headers() };
    on.get('fetch')?.({ request, clientId: '', resultingClientId: 'tab-1', waitUntil: (p: Promise<unknown>) => void waited.push(p), respondWith: (r: Promise<Response>) => void (held.res = r) });
    const out = await held.res;
    await Promise.all(waited);
    return out!;
  };
  const install = async () => {
    const waited: Promise<unknown>[] = [];
    on.get('install')?.({ waitUntil: (p: Promise<unknown>) => void waited.push(p) });
    await Promise.all(waited);
  };
  const keepShell = (body: string, at = Date.now()) => box.set(SCOPE, new Response(body, { headers: { 'content-type': 'text/html', [KEPT]: String(at) } }));
  return { box, told, asked, matched, open, install, keepShell };
}

test('THE KEPT SHELL ANSWERS FIRST, and the same shell from the network is kept again without a word to the page', async () => {
  const w = await worker(() => html('<p>build A</p>'));
  w.keepShell('<p>build A</p>', Date.now() - 60_000);
  const res = await w.open(`${SCOPE}the-studio/p/money`);
  assert.equal(await res.text(), '<p>build A</p>');
  assert.deepEqual(w.asked, [`${SCOPE}the-studio/p/money`], 'the network was still asked behind the copy');
  assert.ok(Number(w.box.get(SCOPE)!.headers.get(KEPT)) > Date.now() - 5_000, 'the shell was kept again, now');
  assert.deepEqual(w.told, []);
});

test('A DIFFERENT SHELL FROM THE NETWORK (A DEPLOY) IS KEPT, AND THE PAGE IS TOLD, so the next open draws it', async () => {
  const w = await worker(() => html('<p>build B</p>'));
  w.keepShell('<p>build A</p>');
  const res = await w.open(`${SCOPE}the-studio/`);
  assert.equal(await res.text(), '<p>build A</p>', 'this open still drew the copy at once');
  assert.equal(await w.box.get(SCOPE)!.clone().text(), '<p>build B</p>');
  assert.equal(w.told.length, 1);
  assert.match(String((w.told[0] as { shell?: unknown }).shell), /^[0-9a-f]+$/u);
  const next = await w.open(`${SCOPE}the-studio/`);
  assert.equal(await next.text(), '<p>build B</p>', 'the next open drew the new build');
});

test('WITH NO SHELL KEPT, THE NETWORK ANSWERS, and its shell is kept', async () => {
  const w = await worker(() => html('<p>build A</p>'));
  const res = await w.open(`${SCOPE}the-studio/`);
  assert.equal(await res.text(), '<p>build A</p>');
  assert.equal(await w.box.get(SCOPE)!.clone().text(), '<p>build A</p>');
});

test('SIGN-IN AND SIGN-UP ARE NEVER ANSWERED FROM THE COPY, NOR KEPT, because their pages carry another policy', async () => {
  const w = await worker(() => html('<p>sign in, with Turnstile</p>'));
  w.keepShell('<p>build A</p>');
  for (const path of ['signin', 'signup/']) assert.equal(await (await w.open(`${SCOPE}${path}`)).text(), '<p>sign in, with Turnstile</p>');
  assert.equal(await w.box.get(SCOPE)!.clone().text(), '<p>build A</p>');
});

test("THE BARE START ADDRESS GOES TO THE RECORD THE COPY'S MARK NAMES, and the entry is still asked behind it", async () => {
  const w = await worker(() => html('<p>build A</p>'));
  w.keepShell('<p>build A</p>');
  w.box.set(markOf(SCOPE), new Response(`https://brain.dog${BASE}/the-studio`));
  const res = await w.open(`${SCOPE}?from=home`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${SCOPE}the-studio/?from=home`);
  assert.deepEqual(w.asked, [`${SCOPE}?from=home`]);
});

test('A MARK THAT NAMES NO RECORD ADDRESS LEAVES THE START ADDRESS TO THE NETWORK', async () => {
  const w = await worker(() => html('<p>build A</p>'));
  w.keepShell('<p>build A</p>');
  w.box.set(markOf(SCOPE), new Response('https://brain.dog'));
  const res = await w.open(SCOPE);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<p>build A</p>');
});

test('THE WORKER KEEPS THE SHELL WHEN IT INSTALLS, so the open after the one that registered it draws from the copy', async () => {
  const w = await worker(() => html('<p>build A</p>'));
  await w.install();
  assert.deepEqual(w.asked, [SCOPE]);
  assert.equal(await w.box.get(SCOPE)!.clone().text(), '<p>build A</p>');
});

test("AN ANSWER FROM THE COPY IS READ WHOLE INTO A RESPONSE OF ITS OWN, never the copy's streamed one", async () => {
  const w = await worker(() => html('<p>build A</p>'));
  const file = `${SCOPE}_app/immutable/chunks/a1b2c3.js`;
  w.box.set(file, new Response('export const a = 1;', { headers: { 'content-type': 'text/javascript', [KEPT]: String(Date.now()) } }));
  w.keepShell('<p>build A</p>');
  for (const [url, mode, body] of [[file, 'cors', 'export const a = 1;'], [`${SCOPE}the-studio/p/money`, 'navigate', '<p>build A</p>']] as const) {
    const res = await w.open(url, mode);
    assert.equal(await res.clone().text(), body);
    assert.ok(!w.matched.includes(res), `${mode}: the page was handed the copy's own response`);
  }
  assert.deepEqual(w.asked, [`${SCOPE}the-studio/p/money`], 'a hashed file from the copy asks the network nothing');
});

/*
 * A GUEST'S COPY. The local copy held a guest to a day and their last share's end; the worker's copy of the same answers
 * stayed a week, and Today's picture of them painted on every open, on a browser a lapsed guest may keep and never use to
 * reach the record again, which is what would have told it the access had ended.
 */
test('A GUEST IS HELD TO A DAY AND THEIR LAST SHARE\'S END, AND ANYBODY ELSE TO THE WEEK', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(freshFor(now - 2 * DAY, now, null), true);
  assert.equal(freshFor(now - WEEK, now, null), false);
  assert.equal(freshFor(now - DAY / 2, now, { until: null }), true);
  assert.equal(freshFor(now - 2 * DAY, now, { until: null }), false);
  assert.equal(freshFor(now - 1000, now, { until: '2026-11-05T13:00:00Z' }), true);
  assert.equal(freshFor(now - 1000, now, { until: '2026-11-05T11:00:00Z' }), false);
  assert.equal(freshFor(now - 1000, now, { until: 'whenever' }), false, 'an end that cannot be read has passed');
});

test("THE WORKER DRAWS A GUEST'S COPY TWO DAYS OLD FOR NOBODY, AND SWEEPS IT, AND KEEPS THE MARK", async () => {
  const stale = Date.now() - 2 * DAY;
  const signedIn = await worker(() => html('network'));
  signedIn.keepShell('kept', stale);
  assert.equal(await (await signedIn.open(`${SCOPE}the-studio/p/money`)).text(), 'kept', 'somebody signed in draws a copy two days old');

  const w = await worker(() => html('network'));
  w.keepShell('kept', stale);
  const read = `${SCOPE}old-read`;
  w.box.set(read, new Response('secret', { headers: { [KEPT]: String(stale) } }));
  const mark = guestMarkOf(SCOPE);
  w.box.set(mark, new Response(JSON.stringify({ until: null })));
  assert.equal(await (await w.open(`${SCOPE}the-studio/p/money`)).text(), 'network', "a guest was drawn a copy older than their day");
  assert.equal(w.box.has(read), false, "the guest's old answer outlived the sweep");
  assert.equal(w.box.has(mark), true, 'the sweep took the mark, so the next answer would keep a week');
});

function page(): { box: Map<string, Response>; done: () => void } {
  const box = new Map<string, Response>();
  const cache = {
    put: async (key: string, res: Response) => void box.set(key, res),
    match: async (key: string) => box.get(key)?.clone(),
    delete: async (key: string) => box.delete(key),
  };
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const had = ['caches', 'location', 'navigator', 'sessionStorage'].map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)] as const);
  set('caches', { open: async () => cache });
  set('location', { origin: 'https://brain.dog' });
  set('navigator', { serviceWorker: { controller: {} } });
  set('sessionStorage', { getItem: () => null });
  return {
    box,
    done: () => {
      for (const [n, was] of had) {
        if (was) Object.defineProperty(globalThis, n, was);
        else delete (globalThis as Record<string, unknown>)[n];
      }
    },
  };
}

test("A GUEST'S TODAY IS NOT KEPT AS A PICTURE: THE MARK TAKES THE ONE THERE AND NONE IS MADE; OFF AGAIN FOR A MEMBER", async (t) => {
  const p = page();
  t.after(p.done);
  const frame = new URL(FRAME_PATH, SCOPE).href;
  p.box.set(frame, new Response('{}'));
  await markGuest({ until: null });
  assert.equal(p.box.has(frame), false, "the picture from before the share stayed");
  assert.equal(await guestHere(), true);
  /* NO `document` HERE: a keepFrame that went on past the mark would throw reading it. */
  await keepFrame();
  assert.equal(p.box.has(frame), false, 'a picture was kept for a guest');
  await markGuest(null);
  assert.equal(await guestHere(), false, 'somebody with a role stayed on a guest\'s limit');
});
