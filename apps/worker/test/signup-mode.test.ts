/**
 * The sign-up switch through the Worker as it ships (a switch of its own since `SIGNUP` was split from the host): `src/index.ts` bundled, a
 * real Directory (`cloud-harness.ts`), and `POST /auth/signup/start` asked the way a stranger's browser asks it.
 *
 * MEASURED BEFORE THIS FILE: `start` made a person for anybody wherever `PUBLIC_HOST` was set, and nothing could make it
 * stop short of unsetting the host. Now `SIGNUP` says, open stays open with no bot check, its strikes are tightened until
 * the check is keyed, and `invite` asks for a code the operator's door minted and refuses the same code twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CODE_NEEDED, SIGNUP_CLOSED } from '../src/launch.ts';
import { cloud, HOST } from './cloud-harness.ts';

const OPERATOR = 'an-operator-key-for-these-tests-only-0123456789';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string }; retryAfter?: number };

/** A deployment with mail on, the switch at `mode`, and the letters it sends kept to read. */
async function host(mode: string | undefined, extra: Record<string, unknown> = {}) {
  const sent: { to?: unknown; text?: unknown }[] = [];
  const c = await cloud({
    ...(mode === undefined ? {} : { SIGNUP: mode }),
    AUTH_MAIL_FROM: 'hello@example.test',
    EMAIL: { send: async (m: Record<string, unknown>) => (sent.push(m), { messageId: 'm' }) },
    PROVISION_KEY: OPERATOR,
    ...extra,
  });
  let seq = 0;
  const start = async (body: Record<string, unknown>, ip = `198.51.100.${++seq}`) => {
    const res = await c.ask('/auth/signup/start', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': ip } });
    /* THE LETTER GOES INSIDE `waitUntil`, which the harness does not wait for: one turn of the loop lets it land. */
    await new Promise((r) => setTimeout(r, 0));
    return { status: res.status, out: (await res.json()) as Out };
  };
  const mint = async (body: Record<string, unknown> = {}) => {
    const res = await c.ask('/account/ops/invite', { method: 'POST', body: JSON.stringify(body), bearer: OPERATOR });
    const out = (await res.json()) as Out;
    assert.equal(res.status, 200, JSON.stringify(out));
    return (out.value?.['links'] as string[]).map((link) => link.slice(link.indexOf('#code=') + '#code='.length));
  };
  return { ...c, sent, start, mint };
}

const ask = (email: string, slug: string, more: Record<string, unknown> = {}) => ({ email, slug, ...more });

test('OPEN, WITH NO CODE AND NO BOT CHECK, IS 200 AND A LETTER', async () => {
  const c = await host('open');
  const named = (await (await c.ask('/auth/signup/name?slug=kiln')).json()) as Out;
  assert.equal(named.value?.['mode'], 'open');
  assert.equal(named.value?.['open'], true, 'kept for one release, for a tab loaded before this one');
  const { status, out } = await c.start(ask('sami@example.test', 'kiln'));
  assert.equal(status, 200, JSON.stringify(out));
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0]?.to, 'sami@example.test');
  assert.match(String(c.sent[0]?.text), new RegExp(`https://${HOST}/signup#verify=`));
});

test('OPEN, A KNOWN ADDRESS IS MAILED ITS SIGN-IN LINK, and answered exactly as a new one is', async () => {
  const c = await host('open');
  await c.provision('rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', 'studio', 'ada@example.test');
  const fresh = await c.start(ask('sami@example.test', 'kiln'));
  const known = await c.start(ask('Ada@Example.test', 'another-name'));
  assert.equal(known.status, 200, JSON.stringify(known.out));
  assert.deepEqual(known.out, fresh.out, 'the answer says who has an account');
  assert.equal(c.sent.length, 2);
  assert.equal(c.sent[1]?.to, 'ada@example.test');
  assert.match(String(c.sent[1]?.text), new RegExp(`https://${HOST}/signin#magic=`));
});

test('CLOSED, UNSET OR UNKNOWN, IS 403 WITH THE SENTENCE, and the name answer says closed', async () => {
  for (const mode of [undefined, '', 'yes']) {
    const c = await host(mode);
    const named = (await (await c.ask('/auth/signup/name?slug=kiln')).json()) as Out;
    assert.equal(named.value?.['mode'], 'closed');
    assert.equal(named.value?.['open'], false);
    const { status, out } = await c.start(ask('sami@example.test', 'kiln'));
    assert.equal(status, 403);
    assert.equal(out.refusal?.fix, SIGNUP_CLOSED);
    assert.equal(c.sent.length, 0);
  }
});

test('BY INVITATION: no code is 403 at code, a minted code is 200, and the same code again is 403', async () => {
  const c = await host('invite');
  assert.equal(((await (await c.ask('/auth/signup/name?slug=kiln')).json()) as Out).value?.['mode'], 'invite');

  const none = await c.start(ask('sami@example.test', 'kiln'));
  assert.equal(none.status, 403);
  assert.deepEqual(none.out.refusal, { code: 'FORBIDDEN', fix: CODE_NEEDED, at: 'code' });
  assert.equal(c.sent.length, 0, 'nothing is mailed to a new address without a code');

  const [code] = await c.mint({ note: 'Sami' });
  assert.ok(code && /^[A-Za-z0-9_-]{43}$/.test(code));
  const first = await c.start(ask('sami@example.test', 'kiln', { code }));
  assert.equal(first.status, 200, JSON.stringify(first.out));
  assert.equal(c.sent.length, 1);

  const again = await c.start(ask('bo@example.test', 'bo-studio', { code }));
  assert.equal(again.status, 403);
  assert.equal(again.out.refusal?.at, 'code');
  assert.equal(c.sent.length, 1);

  /* A KNOWN ADDRESS IS MAILED ITS SIGN-IN LINK, and answered as a new one without a code is. */
  await c.provision('rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', 'studio', 'ada@example.test');
  const known = await c.start(ask('ada@example.test', 'another-name'));
  assert.equal(known.status, 403);
  assert.equal(known.out.refusal?.at, 'code');
  assert.equal(c.sent.length, 2);
  assert.match(String(c.sent[1]?.text), /#magic=/);
});

test('THE OPERATOR DOOR: 404 with no key set, 401 with a wrong one, and a list that never holds a code', async () => {
  const off = await host('invite', { PROVISION_KEY: '' });
  assert.equal((await off.ask('/account/ops/invite', { method: 'POST', body: '{}', bearer: OPERATOR })).status, 404);
  const c = await host('invite');
  assert.equal((await c.ask('/account/ops/invite', { method: 'POST', body: '{}', bearer: 'wrong' })).status, 401);
  assert.equal((await c.ask('/account/ops/invite', { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await c.ask('/account/ops/invite', { method: 'POST', body: JSON.stringify({ count: 51 }), bearer: OPERATOR })).status, 422);
  const codes = await c.mint({ note: 'the lane', count: 2 });
  assert.equal(codes.length, 2);
  const listed = (await (await c.ask('/account/ops/invite', { bearer: OPERATOR })).json()) as Out;
  const text = JSON.stringify(listed);
  for (const code of codes) assert.ok(!text.includes(code), 'the list holds a code');
  const rows = listed.value?.['codes'] as { ref: string; state: string }[];
  assert.deepEqual(rows.map((r) => r.state), ['open', 'open']);
  /* ENDED BY ITS REF, it lets nobody in. */
  const ended = (await (await c.ask('/account/ops/invite', { method: 'POST', body: JSON.stringify({ end: codes[0] }), bearer: OPERATOR })).json()) as Out;
  assert.equal(ended.value?.['state'], 'ended');
  assert.equal((await c.start(ask('cy@example.test', 'cy-studio', { code: codes[0] }))).status, 403);
});

test('WITH NO BOT CHECK KEYED, ONE ADDRESS GETS THREE STARTS AN HOUR, and the fourth is refused', async () => {
  const c = await host('open');
  const ip = '203.0.113.77';
  for (let i = 0; i < 3; i++) assert.equal((await c.start(ask(`p${i}@example.test`, `studio-${i}`), ip)).status, 200, `start ${i + 1}`);
  const locked = await c.start(ask('p9@example.test', 'studio-9'), ip);
  assert.equal(locked.status, 429);
  assert.equal(locked.out.retryAfter, 3600);
  assert.equal(c.sent.length, 3);
});

test('WITH THE BOT CHECK KEYED, TODAY\'S LIMITS STAND: ten from one address, then a lock', async () => {
  /* THE CHECK ITSELF IS ANSWERED BY A FAKE SITEVERIFY, so this is the strike and not Cloudflare's widget. */
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) =>
    String(url).includes('challenges.cloudflare.com') ? new Response(JSON.stringify({ success: true })) : real(url as string, init)) as typeof fetch;
  try {
    const c = await host('open', { TURNSTILE_SECRET: 'a-secret', TURNSTILE_SITE_KEY: 'a-site-key' });
    const ip = '203.0.113.88';
    for (let i = 0; i < 10; i++) assert.equal((await c.start(ask(`q${i}@example.test`, `studio-${i}`, { turnstile: 'answer' }), ip)).status, 200, `start ${i + 1}`);
    assert.equal((await c.start(ask('q99@example.test', 'studio-99', { turnstile: 'answer' }), ip)).status, 429);
  } finally {
    globalThis.fetch = real;
  }
});
