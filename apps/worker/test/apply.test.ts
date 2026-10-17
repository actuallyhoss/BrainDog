/**
 * `POST /auth/apply` on the Worker as it ships (`src/apply.ts` through `src/index.ts`, bundled), on the listening Cloud
 * (`cloud-serve.ts`) with a real Directory: asking for an invitation while sign-up is by invitation.
 *
 * WHAT MUST HOLD. Only by invitation: open and closed refuse with their sentences. A page elsewhere is refused before the
 * body is read, and a body over the cap before the Directory hears of it. The answer is `{}` whether the address is new,
 * applying again, or already decided. With Turnstile keyed, no answer is no application. Nothing is mailed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { APPLY_BODY_MAX, SIGNUP_IS_OPEN } from '../src/apply.ts';
import { SIGNUP_CLOSED } from '../src/launch.ts';
import { ORIGIN } from './cloud-harness.ts';
import { startCloud } from './cloud-serve.ts';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string }; retryAfter?: number };
type Row = { id: string; name: string; email: string; use: string; link: string; state: string };

/* MADE UP. Neither is Cloudflare's, nor one of its published test keys. */
const SECRET = 'turnstile-secret-made-up-for-apply-tests';
const GOOD = 'an-answer-the-fake-siteverify-passes';

let seq = 0;

async function door(mode: string | undefined, env: Record<string, unknown> = {}) {
  const c = await startCloud({ env: { ...(mode === undefined ? {} : { SIGNUP: mode }), ...env } });
  const apply = async (body: unknown, ip = `198.51.100.${String((++seq % 250) + 1)}`) => {
    const res = await c.ask('/auth/apply', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'cf-connecting-ip': ip } });
    return { status: res.status, out: (await res.json()) as Out, res };
  };
  const rows = async (): Promise<Row[]> =>
    (await (c.cloud.directory as unknown as { applications: (call: unknown) => Promise<Row[]> }).applications({ flow: 'apply.list' }));
  return { ...c, apply, rows };
}

test('BY INVITATION, AN APPLICATION IS ANSWERED {} AND KEPT ONCE', async () => {
  const c = await door('invite');
  try {
    const { status, out, res } = await c.apply({ name: 'Maya Okafor', email: 'Maya@Example.test', use: 'Running Tidepool', link: 'https://example.test/maya' });
    assert.equal(status, 200, JSON.stringify(out));
    assert.deepEqual(out, { ok: true, value: {} });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const rows = await c.rows();
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0]?.name, rows[0]?.email, rows[0]?.use, rows[0]?.state], ['Maya Okafor', 'maya@example.test', 'Running Tidepool', 'waiting']);
    assert.equal(c.letters.length, 0, 'an application mails nobody');
  } finally {
    await c.close();
  }
});

test('APPLYING TWICE UPDATES THE ONE APPLICATION, and is answered the same', async () => {
  const c = await door('invite');
  try {
    const first = await c.apply({ name: 'Dana Reyes', email: 'dana@example.test' });
    const second = await c.apply({ name: 'Dana R.', email: 'dana@example.test', use: 'Ferment & Co books' });
    assert.deepEqual(second.out, first.out);
    const rows = await c.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, 'Dana R.');
    assert.equal(rows[0]?.use, 'Ferment & Co books');
  } finally {
    await c.close();
  }
});

test('OPEN AND CLOSED REFUSE WITH THEIR SENTENCES, and keep nothing', async () => {
  for (const [mode, fix] of [['open', SIGNUP_IS_OPEN], ['closed', SIGNUP_CLOSED], [undefined, SIGNUP_CLOSED]] as const) {
    const c = await door(mode);
    try {
      const { status, out } = await c.apply({ name: 'Sam Patel', email: 'sam@example.test' });
      assert.equal(status, 403, String(mode));
      assert.equal(out.refusal?.fix, fix);
      assert.equal((await c.rows()).length, 0);
    } finally {
      await c.close();
    }
  }
});

test('A PAGE ELSEWHERE IS 403, A BODY OVER THE CAP IS 413, A GET IS 405, AND A BAD FIELD IS NAMED', async () => {
  const c = await door('invite');
  try {
    const elsewhere = await c.cloud.bundle.default.fetch(
      new Request(`${ORIGIN}/auth/apply`, { method: 'POST', body: JSON.stringify({ name: 'Leo', email: 'leo@example.test' }), headers: { origin: 'https://elsewhere.test', 'content-type': 'application/json' } }),
      c.cloud.env,
      { waitUntil: () => {} },
    );
    assert.equal(elsewhere.status, 403);
    assert.equal(((await elsewhere.json()) as Out).refusal?.at, 'origin');

    const big = await c.apply(JSON.stringify({ name: 'Leo', email: 'leo@example.test', use: 'x'.repeat(APPLY_BODY_MAX) }));
    assert.equal(big.status, 413);

    assert.equal((await c.ask('/auth/apply')).status, 405);

    const bad = await c.apply({ name: '', email: 'leo@example.test' });
    assert.equal(bad.status, 422);
    assert.equal(bad.out.refusal?.at, 'name');
    assert.equal((await c.rows()).length, 0);
  } finally {
    await c.close();
  }
});

test('UNCHECKED, THE FOURTH FROM ONE PLACE IN AN HOUR IS 429 WITH A WAIT', async () => {
  const c = await door('invite');
  try {
    for (let i = 0; i < 3; i++) assert.equal((await c.apply({ name: 'Leo', email: `leo${String(i)}@example.test` }, '203.0.113.7')).status, 200);
    const held = await c.apply({ name: 'Leo', email: 'leo9@example.test' }, '203.0.113.7');
    assert.equal(held.status, 429);
    assert.ok(Number(held.res.headers.get('retry-after')) > 0);
  } finally {
    await c.close();
  }
});

test('WITH TURNSTILE KEYED, NO ANSWER IS NO APPLICATION, and a passing one is', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (!String(url).startsWith('https://challenges.cloudflare.com/turnstile/')) throw new Error(`a request tried to leave the process: ${String(url)}`);
    const form = init?.body as FormData;
    const success = form.get('secret') === SECRET && form.get('response') === GOOD;
    return new Response(JSON.stringify({ success }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const c = await door('invite', { TURNSTILE_SECRET: SECRET, TURNSTILE_SITE_KEY: 'site-key-made-up' });
  try {
    const none = await c.apply({ name: 'Leo Brandt', email: 'leo@example.test' });
    assert.equal(none.status, 403);
    assert.equal(none.out.refusal?.at, 'turnstile');
    assert.equal((await c.apply({ name: 'Leo Brandt', email: 'leo@example.test', turnstile: 'wrong' })).status, 403);
    assert.equal((await c.rows()).length, 0);
    const passed = await c.apply({ name: 'Leo Brandt', email: 'leo@example.test', turnstile: GOOD });
    assert.equal(passed.status, 200, JSON.stringify(passed.out));
    assert.equal((await c.rows()).length, 1);
  } finally {
    await c.close();
    globalThis.fetch = real;
  }
});

test("/healthz BY INVITATION STILL SAYS A NEW ADDRESS NEEDS A CODE", async () => {
  const c = await door('invite');
  try {
    const out = (await (await c.ask('/healthz')).json()) as { launch: { signup: string; why: string[] } };
    assert.equal(out.launch.signup, 'invite');
    assert.deepEqual(out.launch.why, ['Sign-up is by invitation, so a new address needs a code.']);
  } finally {
    await c.close();
  }
});
