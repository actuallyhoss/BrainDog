import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { appLink, desktopStart, handOff, keepVerifier, pkce, swapCode, takeKept, takeVerifier } from './desktop-signin.ts';

test('the challenge is the S256 of the verifier, both url-safe', async () => {
  const { verifier, challenge } = await pkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

test('the start carries the challenge and a landing only when it is not the front', () => {
  assert.equal(desktopStart('/', 'https://brain.dog', 'c'), 'https://brain.dog/auth/google/start?desktop=1&challenge=c');
  assert.match(desktopStart('/work', 'https://brain.dog', 'c'), /next=%2Fwork$/);
});

test('the verifier is taken once', () => {
  const m = new Map<string, string>();
  const store = { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) };
  assert.equal(keepVerifier('v', store), true);
  assert.equal(takeVerifier(store), 'v');
  assert.equal(takeVerifier(store), null);
});

test('where the window was headed is kept beside the verifier and taken with it', () => {
  const m = new Map<string, string>();
  const store = { setItem: (k: string, v: string) => void m.set(k, v), getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) };
  keepVerifier('v', store, '/acme/r/tasks');
  assert.deepEqual(takeKept(store), { verifier: 'v', next: '/acme/r/tasks' });
  assert.deepEqual(takeKept(store), { verifier: null, next: null });
  keepVerifier('v', store, '/');
  assert.deepEqual(takeKept(store), { verifier: 'v', next: null });
});

test('a handoff posts the link and the challenge same-site and reads the code back', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const ask = (async (url: string, init: RequestInit) => (seen.push({ url, init }), Response.json({ ok: true, value: { code: 'a.b.1.c' } }))) as unknown as typeof fetch;
  assert.equal(await handOff('L', 'C', 'https://app.brain.dog', ask), 'a.b.1.c');
  assert.equal(seen[0]?.url, 'https://app.brain.dog/auth/desktop/handoff');
  assert.deepEqual(JSON.parse(String(seen[0]?.init.body)), { linkToken: 'L', challenge: 'C' });
  const bad = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
  assert.equal(await handOff('L', 'C', 'https://app.brain.dog', bad), null);
  assert.equal(appLink('a.b.1.c'), 'braindog://auth?code=a.b.1.c');
});

test('a swap posts the code and verifier same-site and says whether it worked', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const ask = (async (url: string, init: RequestInit) => (seen.push({ url, init }), new Response('{}', { status: 200 }))) as unknown as typeof fetch;
  assert.equal(await swapCode('c', 'v', 'https://brain.dog', ask), true);
  assert.equal(seen[0]?.url, 'https://brain.dog/auth/desktop');
  assert.equal(seen[0]?.init.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(seen[0]?.init.body)), { code: 'c', verifier: 'v' });
  const bad = (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch;
  assert.equal(await swapCode('c', 'v', 'https://brain.dog', bad), false);
});
