/** The uptime Worker: five probes, a mail on the second miss in a row and once on recovery, each probe one log line. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const script = '../src/index.ts' as string;
type Mod = { watch: (env: unknown, now?: Date, f?: typeof fetch) => Promise<{ name: string; ok: boolean }[]> };

const WELL = (url: string, init?: RequestInit): Response => {
  const path = new URL(url).pathname;
  if (path === '/healthz') return Response.json({ ok: true });
  if (path === '/mcp' && init?.method === 'POST') return new Response('{}', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://brain.dog/.well-known/oauth-protected-resource"' } });
  return new Response('<html></html>');
};

function rig() {
  const sent: { subject: string; text: string; to: string }[] = [];
  const kv = new Map<string, string>();
  const env = {
    EMAIL: { send: async (m: { subject: string; text: string; to: string }) => void sent.push(m) },
    STATE: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) },
    OPS_ALERT_TO: 'ops@example.test',
    MAIL_FROM: 'hello@brain.dog',
  };
  return { sent, env };
}

const quietly = async (f: () => Promise<void>) => {
  const [log, err] = [console.log, console.error];
  console.log = console.error = () => {};
  try {
    await f();
  } finally {
    [console.log, console.error] = [log, err];
  }
};

test('all five probes pass on a healthy site and say nothing', async () => {
  const { watch } = (await import(script)) as Mod;
  const { env, sent } = rig();
  await quietly(async () => {
    const out = await watch(env, new Date(), (async (u: string, i?: RequestInit) => WELL(String(u), i)) as unknown as typeof fetch);
    assert.deepEqual(out.map((r) => r.name), ['site', 'app', 'healthz', 'mcp', 'signin']);
    assert.ok(out.every((r) => r.ok));
  });
  assert.equal(sent.length, 0);
});

test('THE MAIL COMES ON THE SECOND FAILURE IN A ROW, ONCE, AND ONCE MORE ON THE RECOVERY, naming the probe that failed', async () => {
  const { watch } = (await import(script)) as Mod;
  const { env, sent } = rig();
  let up = false;
  const f = (async (u: string, i?: RequestInit) => (!up && new URL(String(u)).pathname === '/signin' ? new Response('no', { status: 502 }) : WELL(String(u), i))) as unknown as typeof fetch;
  await quietly(async () => {
    await watch(env, new Date(), f);
    assert.equal(sent.length, 0, 'one miss is a blip');
    await watch(env, new Date(), f);
    await watch(env, new Date(), f);
    assert.deepEqual(sent.map((m) => m.subject), ['BrainDog is down']);
    assert.ok(sent[0]?.text.includes('signin: status 502'));
    up = true;
    await watch(env, new Date(), f);
    await watch(env, new Date(), f);
  });
  assert.deepEqual(sent.map((m) => m.subject), ['BrainDog is down', 'BrainDog is up again']);
});

test('the MCP probe fails on a 200, and on a 401 that does not point at OAuth', async () => {
  const { watch } = (await import(script)) as Mod;
  for (const answer of [new Response('{}', { status: 200 }), new Response('{}', { status: 401 })]) {
    const { env } = rig();
    await quietly(async () => {
      const out = await watch(env, new Date(), (async (u: string, i?: RequestInit) => (new URL(String(u)).pathname === '/mcp' ? answer.clone() : WELL(String(u), i))) as unknown as typeof fetch);
      assert.equal(out.find((r) => r.name === 'mcp')?.ok, false);
    });
  }
});

test('a 200 from /healthz without "ok":true, and a thrown fetch, both fail', async () => {
  const { watch } = (await import(script)) as Mod;
  const { env } = rig();
  await quietly(async () => {
    const a = await watch(env, new Date(), (async () => Response.json({ ok: false })) as unknown as typeof fetch);
    assert.equal(a.find((r) => r.name === 'healthz')?.ok, false);
    const b = await watch(env, new Date(), (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
    assert.ok(b.every((r) => !r.ok));
  });
});
