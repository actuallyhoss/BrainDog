/**
 * The drill's lapse step (`lapsed.mjs`) against the Cloud harness: `startCloud` from
 * `apps/worker/test/cloud-serve.ts`, the Worker's own `fetch` over a real Directory and real records, billing in test
 * mode with a made-up key and signing secret, as `apps/worker/test/billing-packs.test.ts` sets them.
 *
 * STRIPE IS ANSWERED HERE: the Worker reads the subscription a paid checkout names from `api.stripe.com`, so while a test
 * runs, that one origin is answered by this file with a cancelled subscription and everything else goes where it was
 * going. Nothing reaches the network, and no key or secret here is real.
 *
 * GREEN ON A WORKING CLOUD; RED, NAMING THE WRITE, on a Cloud whose session lets a lapsed write through (its Directory
 * never says `lapsed`, made in this file); SKIPPED, WITH ITS REASON, on a real host with no secret named.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATOR, startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { HOST } from '../../apps/worker/test/cloud-harness.ts';
import { LAPSED_FIX as WORKER_FIX } from '../../apps/worker/src/lapse.ts';
import { LAPSE_NAMES, LAPSED_FIX, lapseFrom, lapsedHolds, signatureOf } from './lapsed.mjs';
import { argsOf, EVERY, ORDER, runDrill } from './run.mjs';
import { capturedMail, drill, NOTE } from './steps.mjs';

const SECRET = 'whsec_made_up_for_the_drill';
const SUBSCRIPTION = 'sub_drillmadeup0001';
const ADDRESS = 'drill-kiln@example.test';

/** Stripe's answers while `run` runs: the subscription, cancelled, and every other Stripe call answered empty. */
async function withStripe(run) {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url instanceof Request ? url.url : url));
    if (u.origin !== 'https://api.stripe.com') return real(url, init);
    asked.push(`${init?.method ?? 'GET'} ${u.pathname}`);
    if (u.pathname === `/v1/subscriptions/${SUBSCRIPTION}`)
      return Response.json({ id: SUBSCRIPTION, object: 'subscription', customer: { id: 'cus_drill', object: 'customer' }, status: 'canceled', items: { object: 'list', data: [{ id: 'si_drill', price: { id: 'price_drill_made_up' } }] } });
    return Response.json({ error: { type: 'invalid_request_error', message: 'No such thing here.' } }, { status: 404 });
  };
  try {
    return { out: await run(), asked };
  } finally {
    globalThis.fetch = real;
  }
}

/** A Cloud by invitation in Stripe test mode, and a drill code minted by its operator door. */
async function cloudWithCode() {
  const c = await startCloud({ env: { SIGNUP: 'invite', BILLING: 'test', STRIPE_SECRET_KEY: 'sk_test_made_up', STRIPE_WEBHOOK_SECRET: SECRET } });
  const res = await c.ask('/account/ops/invite', { method: 'POST', bearer: OPERATOR, body: JSON.stringify({ note: NOTE }) });
  const link = ((await res.json()).value?.links ?? [])[0] ?? '';
  return { c, code: link.slice(link.indexOf('#code=') + '#code='.length) };
}

/** A drill on `c` with its lapse names set, run to its record and then the lapse. */
async function lapseOn(c, code, lapse = { secret: SECRET, subscription: SUBSCRIPTION }) {
  const d = drill({ host: c.base, publicHost: HOST, address: ADDRESS, code, mail: capturedMail(c.letters), ip: '203.0.113.42', waitMs: 3_000, quietMs: 100 });
  d.lapse = lapse;
  const lines = [];
  const results = await runDrill(d, { steps: ['signup', 'mail', 'verify-build', 'lapsed'], say: (l) => lines.push(l) });
  return { d, results, lines, by: Object.fromEntries(results.map((r) => [r.name, r])) };
}

/** No line holds a value the drill was handed or made. */
function clean(d, text) {
  for (const v of [SECRET, SUBSCRIPTION, d.code, d.cookie, d.link?.token, ...d.secrets].filter((v) => typeof v === 'string' && v.length >= 4)) assert.ok(!text.includes(v), 'a line holds a value');
  assert.doesNotMatch(text, /@|https?:\/\/|rec_|p_0|cus_|sub_|whsec_|—/u);
}

test('THE LAPSE STEP IS GREEN ON A WORKING CLOUD: export, refusal word for word, read, then a write again', async () => {
  const { c, code } = await cloudWithCode();
  try {
    const { out, asked } = await withStripe(() => lapseOn(c, code));
    const r = out.by.lapsed;
    assert.equal(r.pass, true, r.said);
    assert.ok(!r.skipped, r.said);
    assert.match(r.said, /refused in the lapse’s own words/u);
    assert.ok(asked.some((a) => a === `GET /v1/subscriptions/${SUBSCRIPTION}`), 'the host never read the subscription from Stripe');
    clean(out.d, out.lines.join('\n'));
  } finally {
    await c.close();
  }
});

test('THE SENTENCE IS THE WORKER’S OWN, and the signature is Stripe’s scheme', () => {
  assert.equal(LAPSED_FIX, WORKER_FIX);
  assert.match(signatureOf('{}', SECRET, 1_700_000_000), /^t=1700000000,v1=[0-9a-f]{64}$/u);
});

/**
 * The Cloud's Directory, seen through a session that lets a lapsed write through: it never says a record has lapsed,
 * to the app's session or to a bearer, so `lapse.ts`'s refusal is never reached. Everything else is the real Directory.
 */
function lapseOff(c) {
  const env = c.cloud.env;
  const real = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const blind = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      if (key === 'auth')
        return async (call) => {
          const out = await v.call(target, call);
          if (call?.flow === 'session' && out?.body && typeof out.body === 'object') delete out.body.lapsed;
          return out;
        };
      if (key === 'billing') return async (call) => (call?.op === 'lapsed' ? false : v.call(target, call));
      return v.bind(target);
    },
  });
  env.DIRECTORY = { ...env.DIRECTORY, idFromName: env.DIRECTORY.idFromName, get: () => blind };
}

test('ON A CLOUD WHOSE SESSION LETS A LAPSED WRITE THROUGH, THE STEP IS RED AND NAMES THE WRITE', async () => {
  const { c, code } = await cloudWithCode();
  try {
    lapseOff(c);
    const { out } = await withStripe(() => lapseOn(c, code));
    const r = out.by.lapsed;
    assert.equal(r.pass, false, r.said);
    assert.match(r.said, /adding the firing “Glaze firing, kiln two” to Firings went through/u);
    clean(out.d, out.lines.join('\n'));
  } finally {
    await c.close();
  }
});

/** A real host, stubbed: `/healthz` says how it bills, and every other ask is kept and answered 404. */
function realHost(billing) {
  const asked = [];
  const send = async (url) => {
    const u = new URL(url);
    asked.push(u.pathname);
    if (u.pathname === '/healthz') return Response.json({ ok: true, launch: { signup: 'invite', botCheck: false, billing, why: [] } });
    return Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no such door' } }, { status: 404 });
  };
  const d = drill({ host: 'https://alpha.example.test', send });
  Object.assign(d, { made: { slug: d.slug, at: Date.now() }, cookie: 'bd_s=made-up-session' });
  return { d, asked };
}

test('ON A REAL HOST WITH NO SECRET THE STEP SKIPS WITH ITS REASON, AND NO PAYMENT EVENT IS SENT', async () => {
  const none = realHost('test');
  none.d.lapse = lapseFrom({});
  const r = await lapsedHolds(none.d);
  assert.equal(r.skipped, true);
  assert.match(r.said, new RegExp(`no signing secret is named \\(${LAPSE_NAMES.secret}\\)`, 'u'));
  assert.deepEqual(none.asked, ['/healthz']);

  const noSub = realHost('test');
  noSub.d.lapse = lapseFrom({ [LAPSE_NAMES.secret]: 'whsec_made_up_value_never_said' });
  const s = await lapsedHolds(noSub.d);
  assert.equal(s.skipped, true);
  assert.match(s.said, new RegExp(`\\(${LAPSE_NAMES.subscription}\\)`, 'u'));
  assert.doesNotMatch(s.said, /whsec_/u);
  assert.deepEqual(noSub.asked, ['/healthz']);

  for (const mode of ['live', 'off']) {
    const live = realHost(mode);
    live.d.lapse = { secret: 'whsec_made_up_value_never_said', subscription: SUBSCRIPTION };
    const l = await lapsedHolds(live.d);
    assert.equal(l.skipped, true, mode);
    assert.match(l.said, new RegExp(`billing here is ${mode}, and the drill lapses a record only in Stripe test mode`, 'u'));
    assert.deepEqual(live.asked, ['/healthz'], `${mode}: something past /healthz was asked`);
  }
});

test('--lapse PUTS THE STEP AFTER THE RECORD EXISTS AND BEFORE erase, AND A PLAIN RUN DOES NOT TAKE IT', () => {
  assert.ok(!ORDER.includes('lapsed'), 'a plain run lapses a record');
  assert.ok(EVERY.indexOf('lapsed') > EVERY.indexOf('verify-build') && EVERY.indexOf('lapsed') < EVERY.indexOf('erase'));
  const plain = argsOf(['--host', 'https://alpha.brain.dog']);
  assert.equal(plain.lapse, false);
  assert.deepEqual(plain.steps, ORDER);
  const asked = argsOf(['--host', 'https://alpha.brain.dog', '--lapse']);
  assert.equal(asked.lapse, true);
  assert.deepEqual(asked.steps, EVERY);
  assert.deepEqual(argsOf(['--host', 'https://alpha.brain.dog', '--lapse', '--steps', 'signup,mail,verify-build']).steps, ['signup', 'mail', 'verify-build', 'lapsed']);
  assert.equal(argsOf(['--host', 'https://alpha.brain.dog', '--steps', 'lapsed']).lapse, true);
  assert.deepEqual(lapseFrom({ [LAPSE_NAMES.secret]: '  ', [LAPSE_NAMES.subscription]: SUBSCRIPTION }), { secret: null, subscription: SUBSCRIPTION });
});
