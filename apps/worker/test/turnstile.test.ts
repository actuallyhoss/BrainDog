/**
 * The bot check on `POST /auth/signup/start`, proven in every mode it runs in: the Worker as it ships, on the
 * listening Cloud (`cloud-serve.ts`), with a made-up secret and siteverify answered inside this process.
 *
 * MEASURED BEFORE THIS FILE: `turnstilePassed` was only ever reached with a passing answer (`signup-mode.test.ts`, the
 * strike limit), so nothing proved that a `start` with no answer is refused, in `open` or in `invite`. The day the keys
 * are put, this is what says the door holds.
 *
 * NO REQUEST LEAVES THE PROCESS. `fetch` is replaced for each test: siteverify is answered here, and any other address
 * throws, so a Worker that reached out anywhere else would fail the test rather than reach the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATOR, startCloud } from './cloud-serve.ts';

/* MADE UP. Neither is Cloudflare's, nor one of its published test keys. */
const SECRET = 'turnstile-secret-made-up-for-this-file';
const SITE_KEY = 'turnstile-site-key-made-up-for-this-file';
const GOOD = 'an-answer-the-fake-siteverify-passes';
const NOT_PASSED = 'The check that you are a person did not pass';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };
type Asked = { secret: string; response: string; remoteip: string };

/** Siteverify, inside the process: passes `GOOD` against `SECRET` only, and keeps every form it was sent. */
function fakeSiteverify(): { asked: Asked[]; restore: () => void } {
  const real = globalThis.fetch;
  const asked: Asked[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (!String(url).startsWith('https://challenges.cloudflare.com/turnstile/')) throw new Error(`a request tried to leave the process: ${String(url)}`);
    const form = init?.body as FormData;
    const one = { secret: String(form.get('secret') ?? ''), response: String(form.get('response') ?? ''), remoteip: String(form.get('remoteip') ?? '') };
    asked.push(one);
    const success = one.secret === SECRET && one.response === GOOD;
    return new Response(JSON.stringify({ success }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { asked, restore: () => void (globalThis.fetch = real) };
}

/** A Cloud with sign-up at `mode`, the bot check keyed or not, and `start` asked from its own address each time. */
async function door(mode: 'open' | 'invite', keyed: boolean) {
  const c = await startCloud({ env: { SIGNUP: mode, ...(keyed ? { TURNSTILE_SECRET: SECRET, TURNSTILE_SITE_KEY: SITE_KEY } : {}) } });
  let seq = 0;
  const start = async (body: Record<string, unknown>) => {
    const res = await c.ask('/auth/signup/start', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': `198.51.100.${++seq}` } });
    /* THE LETTER GOES INSIDE `waitUntil`: one turn of the loop lets it land. */
    await new Promise((r) => setTimeout(r, 0));
    return { status: res.status, out: (await res.json()) as Out };
  };
  const mint = async (): Promise<string> => {
    const res = await c.ask('/account/ops/invite', { method: 'POST', body: JSON.stringify({ note: 'Wren' }), bearer: OPERATOR });
    const out = (await res.json()) as Out;
    assert.equal(res.status, 200, JSON.stringify(out));
    const link = (out.value?.['links'] as string[])[0]!;
    return link.slice(link.indexOf('#code=') + '#code='.length);
  };
  const named = async (): Promise<Record<string, unknown>> => ((await (await c.ask('/auth/signup/name?slug=quarry')).json()) as Out).value ?? {};
  return { ...c, start, mint, named };
}

for (const mode of ['open', 'invite'] as const) {
  test(`${mode.toUpperCase()}, KEYED: A START WITH NO ANSWER IS REFUSED WITH THE SENTENCE, and nothing is mailed`, async () => {
    const site = fakeSiteverify();
    const c = await door(mode, true);
    try {
      assert.equal((await c.named())['turnstile'], SITE_KEY, 'the page is handed the site key, so it can show the widget');
      const code = mode === 'invite' ? await c.mint() : undefined;
      for (const answer of [undefined, '', 'an-answer-cloudflare-never-gave']) {
        const { status, out } = await c.start({ email: 'wren@example.test', slug: 'quarry', ...(code ? { code } : {}), ...(answer === undefined ? {} : { turnstile: answer }) });
        assert.equal(status, 403, JSON.stringify(out));
        assert.equal(out.refusal?.code, 'FORBIDDEN');
        assert.equal(out.refusal?.at, 'turnstile');
        assert.ok(out.refusal?.fix.startsWith(NOT_PASSED), out.refusal?.fix);
      }
      assert.equal(c.letters.length, 0, 'a refused check mails nobody');
      assert.deepEqual(site.asked.map((a) => a.response), ['an-answer-cloudflare-never-gave'], 'no answer is refused before Cloudflare is asked');
    } finally {
      site.restore();
      await c.close();
    }
  });

  test(`${mode.toUpperCase()}, KEYED: A GOOD ANSWER PASSES, checked with the secret and the sender's address`, async () => {
    const site = fakeSiteverify();
    const c = await door(mode, true);
    try {
      const code = mode === 'invite' ? await c.mint() : undefined;
      const { status, out } = await c.start({ email: 'wren@example.test', slug: 'quarry', turnstile: GOOD, ...(code ? { code } : {}) });
      assert.equal(status, 200, JSON.stringify(out));
      assert.equal(c.letters.length, 1, 'the proof is mailed');
      assert.deepEqual(site.asked, [{ secret: SECRET, response: GOOD, remoteip: '198.51.100.1' }]);
    } finally {
      site.restore();
      await c.close();
    }
  });

  test(`${mode.toUpperCase()}, NO SECRET: NOTHING IS ASKED, as today`, async () => {
    const site = fakeSiteverify();
    const c = await door(mode, false);
    try {
      assert.equal((await c.named())['turnstile'], undefined, 'no key, so the page shows no widget');
      const code = mode === 'invite' ? await c.mint() : undefined;
      const { status, out } = await c.start({ email: 'wren@example.test', slug: 'quarry', ...(code ? { code } : {}) });
      assert.equal(status, 200, JSON.stringify(out));
      assert.equal(site.asked.length, 0, 'siteverify is never asked without a secret');
    } finally {
      site.restore();
      await c.close();
    }
  });
}

test('CLOUDFLARE UNREACHABLE IS A FAILED CHECK, never a pass', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('unreachable');
  }) as typeof fetch;
  const c = await door('open', true);
  try {
    const { status, out } = await c.start({ email: 'wren@example.test', slug: 'quarry', turnstile: GOOD });
    assert.equal(status, 403);
    assert.equal(out.refusal?.at, 'turnstile');
    assert.equal(c.letters.length, 0);
  } finally {
    globalThis.fetch = real;
    await c.close();
  }
});

/* THE SIGN-IN LINK REQUEST: checked when the secret and the site key are both set, not otherwise. */
test('SIGN-IN LINK: REFUSED WITHOUT A GOOD ANSWER WHEN KEYED, METHODS HANDS THE SITE KEY, NOTHING ASKED WHEN NOT KEYED', async () => {
  const site = fakeSiteverify();
  const keyed = await startCloud({ env: { TURNSTILE_SECRET: SECRET, TURNSTILE_SITE_KEY: SITE_KEY } });
  try {
    const methods = (await (await keyed.ask('/auth/methods')).json()) as Out;
    assert.equal(methods.value?.['turnstile'], SITE_KEY);
    const send = (body: Record<string, unknown>) =>
      keyed.ask('/auth/magic/start', { method: 'POST', body: JSON.stringify({ email: 'wren@example.test', ...body }), headers: { 'cf-connecting-ip': '198.51.100.9' } });
    const bad = await send({});
    assert.equal(bad.status, 403);
    assert.equal(((await bad.json()) as Out).refusal?.at, 'turnstile');
    assert.ok((await send({ turnstile: GOOD })).status < 400);
    assert.deepEqual(site.asked, [{ secret: SECRET, response: GOOD, remoteip: '198.51.100.9' }]);
    /* A BRAINDOG APP CANNOT DRAW THE WIDGET: its PKCE challenge stands in, and only a real one's shape does. */
    assert.ok((await send({ app: 'c'.repeat(43) })).status < 400);
    assert.equal((await send({ app: 'short' })).status, 403);
    assert.equal(site.asked.length, 1);
  } finally {
    await keyed.close();
  }
  const open = await startCloud({ env: {} });
  try {
    const methods = (await (await open.ask('/auth/methods')).json()) as Out;
    assert.equal(methods.value?.['turnstile'], undefined);
    const before = site.asked.length;
    const res = await open.ask('/auth/magic/start', { method: 'POST', body: JSON.stringify({ email: 'wren@example.test' }) });
    assert.ok(res.status < 400);
    assert.equal(site.asked.length, before);
  } finally {
    site.restore();
    await open.close();
  }
});
