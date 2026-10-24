/**
 * Several reads sent as one (`reads`) are kept one by one in the phone's copy (`service-worker.ts`, `putEach`): each
 * answer under the address its read would have been asked at alone, so offline the client's one-at-a-time asks are
 * answered from the copy as before. A read refused, an address the worker would not keep and a request with a bearer
 * keep nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE } from '../at.ts';

type Listener = (e: unknown) => void;

async function worker(answer: (req: Request) => Response) {
  const on = new Map<string, Listener>();
  const box = new Map<string, Response>();
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
  (globalThis as { fetch?: unknown }).fetch = async (req: Request) => answer(req);
  await import(`../../service-worker.ts?${Math.random()}`);
  const send = async (req: Request) => {
    const waited: Promise<unknown>[] = [];
    const held: { res: Promise<Response> | null } = { res: null };
    on.get('fetch')?.({ request: req, clientId: '', waitUntil: (p: Promise<unknown>) => void waited.push(p), respondWith: (r: Promise<Response>) => void (held.res = r) });
    const out = await held.res;
    await Promise.all(waited);
    return out;
  };
  return { box, send };
}

const at = (path: string) => `https://brain.dog/api/${path}`;
/** An answer as a browser hands one back from its own origin, `basic`, which is the only kind the worker keeps. */
const json = (body: unknown, status = 200) =>
  Object.defineProperty(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }), 'type', { value: 'basic' });
const asked = (calls: unknown[], headers: Record<string, string> = {}) =>
  new Request(at('reads'), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ calls }) });

test('EACH READ ANSWERED 200 IS KEPT UNDER ITS OWN ADDRESS, and a refused one is not', async () => {
  const things = { ok: true, value: { rows: [{ seq: 1 }] } };
  const w = await worker(() =>
    json({ ok: true, value: { answers: [{ status: 200, body: things }, { status: 404, body: { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No.' } } }] } }),
  );
  const res = await w.send(asked([{ method: 'list', args: { register: 'things' }, at: at('list?register=things') }, { method: 'list', args: { register: 'nowhere' }, at: at('list?register=nowhere') }]));
  assert.equal(res?.status, 200);
  assert.deepEqual([...w.box.keys()], [at('list?register=things')]);
  assert.deepEqual(await w.box.get(at('list?register=things'))!.json(), things);
});

test('NOTHING IS KEPT FOR A BEARER, OR AT AN ADDRESS THE WORKER WOULD NOT KEEP A READ AT', async () => {
  const ok = { status: 200, body: { ok: true, value: 1 } };
  const w = await worker(() => json({ ok: true, value: { answers: [ok, ok] } }));
  await w.send(asked([{ method: 'list', at: 'https://elsewhere.test/api/list' }, { method: 'version', at: at('slash/status') }]));
  await w.send(asked([{ method: 'list', at: at('list?register=things') }], { authorization: 'Bearer x' }));
  assert.deepEqual([...w.box.keys()], []);
});
