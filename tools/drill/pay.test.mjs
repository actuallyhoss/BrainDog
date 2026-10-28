/**
 * `tools/drill/pay.mjs`'s refusals and its order: production refused with no way round it, a host whose
 * billing is not test mode stopping the walk at its first step, a live key refused by name, each missing name making its
 * steps skip and say why, and `PAY` in the order the rehearsal test walks.
 *
 * NO HOST AND NO STRIPE in the refusals: every request goes to a stub `send` that answers `/healthz` and Stripe's
 * `/v1/balance` and records what was asked. THEN THE WHOLE WALK on the Cloud harness (`startCloud`, the Worker's own
 * `fetch` over a real Directory and real records), with Stripe the rehearsal's fake (`fake-stripe.ts`) and its events
 * delivered to the harness's webhook, signed. Nothing here reaches the network. Made-up keys only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OPERATOR, startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { HOST as CLOUD_HOST } from '../../apps/worker/test/cloud-harness.ts';
import { fakeStripe } from '../../apps/worker/test/fake-stripe.ts';
import { capturedMail, drill } from './steps.mjs';
import { ACTED, EXTRA_UNSOLD, NAMES, PAY, STEPS, appliedIn, argsOf, payFor, runPay } from './pay.mjs';

const HOST = 'https://alpha.example.test';
const OLD = 'sk_test_made_up_pasted_key_0000';

/** A stub of the host and Stripe: `/healthz` says `billing`, and Stripe refuses every key with 401 unless `takes`. */
function stub(billing, { takes = false } = {}) {
  const asked = [];
  const send = async (url, init = {}) => {
    const u = new URL(url);
    asked.push({ origin: u.origin, path: u.pathname, auth: new Headers(init.headers ?? {}).get('authorization') });
    if (u.pathname === '/healthz') return Response.json({ ok: true, launch: { signup: 'invite', botCheck: false, billing, why: [] } });
    if (u.origin === 'https://api.stripe.com') return takes ? Response.json({ object: 'balance' }) : Response.json({ error: { type: 'invalid_request_error' } }, { status: 401 });
    return Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no such door' } }, { status: 404 });
  };
  return { send, asked };
}

const walk = async (env, billing, opts) => {
  const s = stub(billing, opts);
  const lines = [];
  const results = await runPay(payFor(HOST, env, { send: s.send, waitMs: 10, every: 1 }), { say: (l) => lines.push(l) });
  return { results, lines, asked: s.asked, by: Object.fromEntries(results.map((r) => [r.name, r])) };
};

test('PRODUCTION IS REFUSED, AND NO FLAG LETS IT PAY THERE', () => {
  for (const host of ['https://brain.dog', 'https://www.brain.dog', 'https://app.brain.dog'])
    assert.match(argsOf(['--host', host], {}).wrong ?? '', /is production\. pay runs only on a host in test mode/u, host);
  assert.match(argsOf(['--host', 'https://brain.dog', '--live'], {}).wrong ?? '', /--live is not something pay takes/u);
  assert.equal(argsOf(['--host', HOST], {}).host, HOST);
  assert.match(argsOf([], {}).wrong ?? '', /needs --host/u);
  assert.match(argsOf(['--host', HOST, '--steps', 'free,shopping'], {}).wrong ?? '', /no step called shopping/u);
});

test('A LIVE KEY IN EITHER NAME IS REFUSED BY ITS NAME, AND ITS VALUE IS NEVER SAID', () => {
  for (const name of [NAMES.key, NAMES.oldKey])
    for (const value of ['sk_live_made_up_1234', 'rk_live_made_up_1234']) {
      const out = argsOf(['--host', HOST], { [name]: value });
      assert.equal(out.wrong, `${name} is a live key. pay uses test keys only.`);
      assert.ok(!out.wrong.includes(value));
    }
  assert.equal(argsOf(['--host', HOST], { [NAMES.key]: 'rk_test_made_up' }).host, HOST);
});

test('A WALK HANDED PRODUCTION OR A LIVE KEY WITHOUT argsOf IS REFUSED AT mode, AND NOTHING IS ASKED', async () => {
  for (const [host, env] of [['https://brain.dog', {}], [HOST, { [NAMES.key]: 'rk_live_made_up_1234' }], [HOST, { [NAMES.oldKey]: 'sk_live_made_up_1234' }]]) {
    const s = stub('test', { takes: true });
    const results = await runPay(payFor(host, env, { send: s.send, waitMs: 10, every: 1 }));
    assert.deepEqual([results[0].name, results[0].pass], ['mode', false], host);
    assert.match(results[0].said, /is production|is a live one/u);
    assert.ok(!results[0].said.includes('made_up'), 'the live key was said');
    assert.ok(results.slice(1).every((r) => r.skipped), 'a step ran after mode refused');
    assert.deepEqual(s.asked, [], 'something was asked of a host or Stripe');
  }
});

test('A HOST WHOSE BILLING IS LIVE OR OFF IS REFUSED AT THE FIRST STEP, AND EVERY STEP AFTER SKIPS', async () => {
  for (const billing of ['live', 'off', undefined]) {
    const { results, by, asked } = await walk({ [NAMES.oldKey]: OLD }, billing);
    assert.equal(by.mode.pass, false, `billing ${billing} was not refused`);
    assert.match(by.mode.said, /pay runs only where it is test/u);
    assert.deepEqual(results.map((r) => r.name), PAY);
    for (const r of results.slice(1)) assert.deepEqual([r.skipped, r.said], [true, 'skipped: the host is not in test mode, so nothing is paid on it.'], r.name);
    assert.ok(!asked.some((a) => a.origin === 'https://api.stripe.com'), 'Stripe was asked on a host not in test mode');
  }
});

test('EACH MISSING NAME MAKES ITS STEPS SKIP AND SAY WHY, AND NOTHING IS RED', async () => {
  const { results, by } = await walk({}, 'test');
  assert.deepEqual([by.mode.pass, by.mode.skipped], [true, undefined]);
  assert.equal(by['old-key'].said, `skipped: ${NAMES.oldKey} is not set, so whether the pasted key was rolled cannot be asked.`);
  assert.equal(by['sign-in'].said, 'skipped: CANARY_MAIL_DOOR is not set, so no stranger signs up.');
  for (const name of ['free', 'upgrade', 'allowance', 'switch', 'invite', 'pack', 'extra', 'past-due', 'cancel', 'delete', 'events'])
    assert.deepEqual([by[name].skipped, by[name].said], [true, 'skipped: no stranger is signed in with a record of their own.'], name);
  assert.ok(results.every((r) => r.pass), 'a missing name turned a step red');
});

test('THE OLD KEY MUST BE REFUSED BY STRIPE; IT GOES ONLY TO STRIPE, IN THE HEADER, AND NO LINE SAYS IT', async () => {
  const rolled = await walk({ [NAMES.oldKey]: OLD }, 'test');
  assert.equal(rolled.by['old-key'].pass, true);
  assert.match(rolled.by['old-key'].said, /Stripe refused the key pasted on 28 September/u);
  const carried = rolled.asked.filter((a) => a.auth !== null);
  assert.deepEqual(carried.map((a) => [a.origin, a.path, a.auth]), [['https://api.stripe.com', '/v1/balance', `Bearer ${OLD}`]]);
  assert.ok(!rolled.lines.join('\n').includes(OLD));

  const kept = await walk({ [NAMES.oldKey]: OLD }, 'test', { takes: true });
  assert.equal(kept.by['old-key'].pass, false);
  assert.match(kept.by['old-key'].said, /still takes the key pasted on 28 September/u);
  assert.ok(!kept.lines.join('\n').includes(OLD));
});

test('THE STEPS RUN IN PAY’S ORDER, WHICH IS THE REHEARSAL’S, AND EXTRA USAGE IS LISTED AND SKIPPED', async () => {
  assert.deepEqual(PAY, ['mode', 'old-key', 'sign-in', 'free', 'upgrade', 'allowance', 'switch', 'invite', 'pack', 'extra', 'past-due', 'cancel', 'delete', 'events']);
  assert.deepEqual(Object.keys(STEPS).sort(), [...PAY].sort());
  /* THE REHEARSAL TEST'S WALK NAMES ITS STEPS IN COMMENTS (`/* free: ...`), each one of PAY's, in PAY's order. */
  const source = await readFile(new URL('../../apps/worker/test/billing-rehearsal.test.ts', import.meta.url), 'utf8');
  const named = [...source.matchAll(/\/\* ([a-z-]+): /gu)].map((m) => m[1]).filter((n) => PAY.includes(n));
  assert.deepEqual(named, ['free', 'upgrade', 'allowance', 'switch', 'invite', 'pack', 'past-due', 'cancel', 'delete']);
  assert.deepEqual(named, PAY.filter((n) => named.includes(n)), 'the rehearsal walks in another order than PAY');
  const only = await runPay(payFor(HOST, {}, { send: stub('test').send, waitMs: 10, every: 1 }), { steps: ['extra'] });
  assert.deepEqual(only.map((r) => r.name), ['mode', 'extra'], 'mode is always asked first');
});

test('THE WORKER’S LINES ARE READ AS IT WRITES THEM AND AS wrangler tail QUOTES THEM', () => {
  const line = (event, ok = true) => JSON.stringify({ op: 'billing', door: 'webhook', ok, event, did: 'x' });
  const plain = [line('invoice.paid'), line('customer.subscription.deleted', false), '{"op":"mail","ok":true}'].join('\n');
  assert.deepEqual([...appliedIn(plain)], ['invoice.paid']);
  const tailed = JSON.stringify({ outcome: 'ok', logs: [{ level: 'log', message: [line('checkout.session.completed')] }] });
  assert.deepEqual([...appliedIn(tailed)], ['checkout.session.completed']);
  assert.equal(ACTED.length, 7);
});

const KEY = 'sk_test_made_up_for_the_harness_walk';
const SECRET = 'whsec_made_up_for_the_harness_walk';
const monthly = (id, unit_amount) => ({ id, unit_amount, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, active: true });
const once = (id, unit_amount) => ({ id, unit_amount, currency: 'usd', recurring: null, active: true });

test('THE WHOLE WALK ON THE HARNESS: every step green against the fake Stripe, every event delivered and applied, no value said', async () => {
  const stripe = fakeStripe({ key: KEY, secret: SECRET, now: () => Date.now(), prices: [monthly('price_cloud', 1_200), monthly('price_plus', 2_900), once('price_pack_100', 500), once('price_pack_500', 2_000)] });
  const real = globalThis.fetch;
  let base = '';
  /* STRIPE'S DELIVERIES, one at a time and after the call that caused them, as Stripe sends them: signed, to the webhook. */
  let line = Promise.resolve();
  const failed = [];
  const flush = () =>
    (line = line.then(async () => {
      for (const event of stripe.take()) {
        const req = await stripe.signed(event, `${base}/account/billing/webhook`);
        const res = await real(req);
        if (res.ok) stripe.delivered(event);
        const text = await res.text();
        if (!res.ok) failed.push(`${event.type} ${res.status} ${text}`);
      }
    }));
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.stripe.com/')) return real(url, init);
    const res = await stripe.send(String(url), init);
    setTimeout(flush, 0);
    return res;
  };
  const lines = [];
  const [log, error] = [console.log, console.error];
  const file = join(tmpdir(), `braindog-pay-${process.pid}.log`);
  let c = null;
  try {
    c = await startCloud({ env: { SIGNUP: 'invite', BILLING: 'test', STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_HOSTED: 'price_cloud', STRIPE_PRICE_PLUS: 'price_plus', STRIPE_PRICE_PACK_100: 'price_pack_100', STRIPE_PRICE_PACK_500: 'price_pack_500' } });
    base = c.base;
    /* THE HARNESS'S OBJECT STORAGE HOLDS NO KEYS AND VALUES (`objectStorage` in apps/worker/test/bundled-worker.ts has
       `sql` and the alarm only), and a record's lapse switch is a key (`setLapsed`). Given them here, over a map, until
       the blocked line adds them there. */
    const kv = (st) => {
      if (typeof st.put !== 'function') {
        const m = new Map();
        Object.assign(st, { get: async (k) => m.get(k), put: async (k, v) => void m.set(k, v), delete: async (k) => m.delete(k) });
      }
      return st;
    };
    const keep = c.cloud.storages.set.bind(c.cloud.storages);
    c.cloud.storages.set = (id, st) => keep(id, kv(st));
    for (const st of c.cloud.storages.values()) kv(st);
    const d = drill({ host: c.base, publicHost: CLOUD_HOST, address: 'pay-walker@example.test', mail: capturedMail(c.letters), ip: '203.0.113.41', waitMs: 3_000, quietMs: 100 });
    const second = { address: 'pay-second@example.test', key: null, mail: capturedMail(c.letters) };
    const buyer = { pay: async (url, how) => (stripe.pay(url, how), await flush()), confirm: async (url) => (stripe.confirm(url), await flush()) };
    const env = { [NAMES.key]: KEY, [NAMES.oldKey]: 'sk_test_the_old_pasted_one', DRILL_OPERATOR_KEY: OPERATOR, [NAMES.log]: file };
    const p = payFor(c.base, env, { drill: d, second, buyer, waitMs: 5_000, every: 20 });
    console.log = (...a) => void lines.push(a.join(' '));
    console.error = (...a) => void lines.push(a.join(' '));
    const said = await runPay(p, { steps: PAY.filter((s) => s !== 'events') });
    await flush();
    await writeFile(file, lines.join('\n'));
    said.push(...(await runPay(p, { steps: ['events'] })).slice(1));
    [console.log, console.error] = [log, error];
    const by = Object.fromEntries(said.map((r) => [r.name, r]));
    assert.deepEqual(failed, [], 'Stripe delivered an event the webhook did not take');
    assert.deepEqual(lines.filter((x) => x.includes('"op":"billing"') && x.includes('"ok":false')), [], 'billing wrote a failure');
    assert.deepEqual(said.map((r) => r.name), PAY);
    for (const name of PAY.filter((n) => n !== 'extra' && n !== 'delete')) assert.deepEqual([by[name].pass, by[name].skipped], [true, undefined], `${name}: ${by[name].said}`);
    assert.equal(by.extra.said, `skipped: ${EXTRA_UNSOLD}`);
    assert.match(by.invite.said, /still shows one seat at 17\.00/u);
    assert.match(by.cancel.said, /read-only: “Read-only until billing resumes\. Export is available\.”/u);
    /* A LAPSED OWNER CANNOT DELETE THEIR RECORD TODAY (`mayWrite` in apps/worker/src/lapse.ts lets only `export` by):
       red with the lapse's sentence until the blocked line lands, and green after it. */
    assert.ok(by.delete.pass || by.delete.said.includes('Read-only until billing resumes'), by.delete.said);
    const words = said.map((r) => r.said).join('\n') + lines.join('\n');
    assert.doesNotMatch(words, new RegExp(`${KEY}|${SECRET}|sk_test_the_old|pay-walker@|pay-second@`, 'u'));
  } finally {
    [console.log, console.error] = [log, error];
    globalThis.fetch = real;
    await line.catch(() => {});
    await rm(file, { force: true });
    await c?.close();
  }
});
