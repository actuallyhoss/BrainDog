/**
 * A hashed file the network failed is asked for twice more before the page hears of it (`service-worker.ts`,
 * `networkAgain`): one chunk answered 500 for a few minutes on 24 November and the page that imported it could not
 * recover, because a browser keeps a failed module for the life of the document. A 404 is an answer and is not asked
 * again, and an answer that is not ok is never kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE } from '../at.ts';

type Listener = (e: unknown) => void;

/** The worker against a stand-in for its global scope, with the network answering from `answers` in order. */
async function worker(answers: (() => Response)[]) {
  const on = new Map<string, Listener>();
  const box = new Map<string, Response>();
  const asked: number[] = [];
  const scope = `https://brain.dog${BASE}/`;
  const cache = {
    put: async (key: string | Request, res: Response) => void box.set(typeof key === 'string' ? key : key.url, res),
    match: async (key: string) => box.get(key)?.clone(),
    keys: async () => [...box.keys()].map((url) => ({ url })),
    delete: async (key: string | { url: string }) => box.delete(typeof key === 'string' ? key : key.url),
  };
  (globalThis as { self?: unknown }).self = {
    registration: { scope, showNotification: async () => undefined },
    clients: { matchAll: async () => [], openWindow: async () => undefined, get: async () => undefined, claim: async () => undefined },
    caches: { open: async () => cache, delete: async () => box.clear() },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, fn: Listener) => void on.set(type, fn),
  };
  const started = Date.now();
  (globalThis as { fetch?: unknown }).fetch = async () => {
    asked.push(Date.now() - started);
    const next = answers.shift();
    if (next === undefined) throw new TypeError('no more answers');
    return next();
  };
  await import(`../../service-worker.ts?${Math.random()}`);
  const send = async (url: string) => {
    const waited: Promise<unknown>[] = [];
    const held: { res: Promise<Response> | null } = { res: null };
    const request = new Request(url);
    on.get('fetch')?.({ request, clientId: '', waitUntil: (p: Promise<unknown>) => void waited.push(p), respondWith: (r: Promise<Response>) => void (held.res = r) });
    const out = await held.res;
    await Promise.all(waited);
    return out;
  };
  return { box, asked, send };
}

const CHUNK = `https://brain.dog${BASE}/_app/immutable/chunks/zU68EGhN.js`;
/** An answer as a browser hands one back from its own origin, `basic`, which is the only kind the worker keeps. */
const file = (status: number) => () =>
  Object.defineProperty(new Response(status === 200 ? 'export {}' : 'no', { status, headers: { 'content-type': 'text/javascript' } }), 'type', { value: 'basic' });
const down = () => {
  throw new TypeError('Failed to fetch');
};

test('A HASHED FILE THAT ANSWERS 500 IS ASKED AGAIN, and the good answer is the one drawn and kept', async () => {
  const w = await worker([file(500), down, file(200)]);
  const res = await w.send(CHUNK);
  assert.equal(res?.status, 200);
  assert.equal(w.asked.length, 3);
  /* About 300 ms, then a second, between the tries. */
  assert.ok(w.asked[1]! - w.asked[0]! >= 250, `the second try waited ${w.asked[1]! - w.asked[0]!} ms`);
  assert.ok(w.asked[2]! - w.asked[1]! >= 900, `the third try waited ${w.asked[2]! - w.asked[1]!} ms`);
  assert.deepEqual([...w.box.keys()], [CHUNK]);
});

test('THREE FAILURES AND THE LAST ONE GOES TO THE PAGE, NOTHING KEPT; A 404 IS NOT ASKED AGAIN', async () => {
  const w = await worker([file(500), file(502), file(503)]);
  assert.equal((await w.send(CHUNK))?.status, 503);
  assert.equal(w.asked.length, 3);
  assert.deepEqual([...w.box.keys()], []);

  const gone = await worker([file(404), file(200)]);
  assert.equal((await gone.send(CHUNK))?.status, 404);
  assert.equal(gone.asked.length, 1);
  assert.deepEqual([...gone.box.keys()], []);
});

test('ANY OTHER FILE OF THE APP IS ASKED ONCE, as before', async () => {
  const w = await worker([file(500), file(200)]);
  assert.equal((await w.send(`https://brain.dog${BASE}/manifest.webmanifest`))?.status, 500);
  assert.equal(w.asked.length, 1);
});
