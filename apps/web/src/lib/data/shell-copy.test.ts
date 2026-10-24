/**
 * The shell is answered from the copy and asked for again behind it (scope 2026-10-24 A17, `shellFirst` in
 * `service-worker.ts`): the kept shell draws at once, the network's is kept behind it, and a different one (a deploy) is
 * kept and the page told. Sign-in and sign-up are never answered from the copy, and the bare start address goes to the
 * record the copy's mark names, with the Worker's entry still asked behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE } from '../at.ts';
import { COPY, KEPT, markOf } from './offline.ts';

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

test("AN ANSWER FROM THE COPY IS READ WHOLE INTO A RESPONSE OF ITS OWN, never the copy's streamed one (A31)", async () => {
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
