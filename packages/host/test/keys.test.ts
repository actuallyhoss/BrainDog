/**
 * The app's own key doors, `/api/keys/put` and `/api/keys/open`: the order they refuse in, and what they hand on.
 *
 * WHAT IS PROVED HERE IS THE DOOR AND NOT THE VAULT. Whether a session may reach a key at all is the record's
 * question, asked by `vault(ctx)` behind this; what this file holds is the part that is the host's, which is the
 * method, the bearer, the origin and the body, in that order. The context goes through untouched, which is the
 * one thing a door must not decide for the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveKeys, servesKeys, type KeysAsk, type KeysDoor } from '../src/index.ts';

const ORIGIN = 'http://localhost:5173';

/** A context this package cannot name, which is the point: the door is generic over whatever a host resolves. */
type Who = { who: string };
const HER: Who = { who: 'p_ada' };

type Seen = { put: number; open: number; ctx: Who | null; body: Record<string, unknown> | null };

function door(withKeys = true): { door: KeysDoor<Who>; saw: Seen } {
  const saw: Seen = { put: 0, open: 0, ctx: null, body: null };
  const take = (ask: KeysAsk<Who>) => {
    saw.ctx = ask.ctx;
    saw.body = ask.body;
  };
  if (!withKeys) return { door: { origins: new Set([ORIGIN]) }, saw };
  return {
    door: {
      origins: new Set([ORIGIN]),
      keys: {
        put: async (ask) => {
          saw.put++;
          take(ask);
          return { ok: true as const, value: { credential: 'credentials#1' } };
        },
        open: async (ask) => {
          saw.open++;
          take(ask);
          return new Response('{"ok":true}', { status: 200 });
        },
      },
    },
    saw,
  };
}

type Init = { method?: string; origin?: string | null; bearer?: string; type?: string | null; body?: string };

function ask(path: string, init: Init = {}): Request {
  const headers = new Headers();
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  if (init.bearer !== undefined) headers.set('authorization', `Bearer ${init.bearer}`);
  if (init.type !== null) headers.set('content-type', init.type ?? 'application/json');
  const method = init.method ?? 'POST';
  return new Request(`http://localhost:5173${path}`, {
    method,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: init.body ?? '{}' }),
  });
}

const answered = async (res: Response) => (await res.json()) as { ok: boolean; refusal?: { code: string; at?: string } };

test('the two paths, and nothing else', () => {
  assert.equal(servesKeys('/api/keys/put'), 'put');
  assert.equal(servesKeys('/api/keys/open'), 'open');
  assert.equal(servesKeys('//api//keys//open/'), 'open');
  for (const path of ['/api/keys', '/api/keys/', '/api/keys/putt', '/api/keys/put/more', '/api/vault/deposit', '/api/list'])
    assert.equal(servesKeys(path), null, path);
});

test('A POST, AND ANY OTHER METHOD IS 405 BEFORE ANYTHING ELSE IS READ', async () => {
  const { door: d, saw } = door();
  const res = await serveKeys(ask('/api/keys/put', { method: 'GET', bearer: 'anything' }), d, HER);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  assert.equal(saw.put, 0);
});

test('EVERY BEARER IS REFUSED NEEDS_BROWSER_SESSION, whatever it is and however good the rest of the request', async () => {
  for (const which of ['put', 'open'] as const) {
    const { door: d, saw } = door();
    const res = await serveKeys(ask(`/api/keys/${which}`, { bearer: 'rec_1.aaaa' }), d, HER);
    assert.equal(res.status, 403);
    const body = await answered(res);
    assert.equal(body.refusal?.code, 'NEEDS_BROWSER_SESSION');
    assert.equal(body.refusal?.at, 'principal');
    assert.equal(saw.put + saw.open, 0, 'a bearer reached the key step');
  }
});

test('AN ORIGIN THIS HOST DOES NOT ANSWER FOR, AND NO ORIGIN AT ALL, ARE BOTH REFUSED', async () => {
  for (const origin of ['https://elsewhere.example', null]) {
    const { door: d, saw } = door();
    const res = await serveKeys(ask('/api/keys/put', { origin }), d, HER);
    assert.equal(res.status, 403);
    const body = await answered(res);
    assert.equal(body.refusal?.code, 'FORBIDDEN');
    assert.equal(body.refusal?.at, 'origin');
    assert.equal(saw.put, 0);
  }
});

test('a host with no key store says so, and says it only after the origin is right', async () => {
  const { door: d } = door(false);
  const res = await serveKeys(ask('/api/keys/open'), d, HER);
  assert.equal(res.status, 501);
  assert.equal((await answered(res)).refusal?.code, 'NOT_IN_THIS_BUILD');

  const elsewhere = await serveKeys(ask('/api/keys/open', { origin: 'https://elsewhere.example' }), d, HER);
  assert.equal((await answered(elsewhere)).refusal?.at, 'origin', 'the gap was named to a page somewhere else');
});

test('a body that is not a JSON object is 400, and its text is never quoted back', async () => {
  for (const [type, body] of [
    ['text/plain', '{}'],
    ['application/json', '{'],
    ['application/json', '"bd_fake_not_an_object"'],
    ['application/json', '[]'],
  ] as const) {
    const { door: d, saw } = door();
    const res = await serveKeys(ask('/api/keys/put', { type, body }), d, HER);
    assert.equal(res.status, 400, `${type} ${body}`);
    const raw = await res.text();
    assert.equal(JSON.parse(raw).refusal.code, 'BODY_MALFORMED');
    assert.ok(!raw.includes('bd_fake'), 'the refusal quoted the body');
    assert.equal(saw.put, 0);
  }
});

test('THE CONTEXT AND THE BODY GO THROUGH UNTOUCHED, and every answer is no-store', async () => {
  const { door: d, saw } = door();
  const put = await serveKeys(ask('/api/keys/put', { body: JSON.stringify({ label: 'Kiln deploy', value: 'bd_fake_value' }) }), d, HER);
  assert.equal(put.status, 200);
  assert.equal(put.headers.get('cache-control'), 'no-store');
  assert.equal(put.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(saw.put, 1);
  assert.equal(saw.ctx, HER);
  assert.deepEqual(saw.body, { label: 'Kiln deploy', value: 'bd_fake_value' });

  const open = await serveKeys(ask('/api/keys/open', { body: JSON.stringify({ credential: 'credentials#1' }) }), d, HER);
  assert.equal(open.status, 200);
  assert.equal(saw.open, 1);
  assert.deepEqual(saw.body, { credential: 'credentials#1' });
});

test('a path this door does not serve is 404 rather than an answer about credentials', async () => {
  const { door: d } = door();
  const res = await serveKeys(ask('/api/vault/deposit'), d, HER);
  assert.equal(res.status, 404);
  assert.equal((await answered(res)).refusal?.code, 'ROUTE_UNKNOWN');
});
