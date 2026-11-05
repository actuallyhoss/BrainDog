/**
 * The Stripe setup script against a fake Stripe of its own: what it makes, what it leaves, and what it never says.
 *
 *   node --test tools/ops/stripe-setup.test.mjs
 *
 * THE FAKE ANSWERS THE FOUR FORMS THE SCRIPT SENDS, and nothing else: the list of prices by `lookup_keys`, a product by
 * its id, and a product or a price created. Any other request is kept as `strange` and fails the test that sent it, so
 * an edit (`POST /v1/prices/<id>`) or an archive is a red line, never a quiet pass. No key here is real: each is
 * invented, and its body is searched for in every line the script said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { CURRENCY, PACKS, PLAN_TABLE } from '../../packages/record/src/plans.ts';
import { HOSTED_PLANS, PACK_SETTINGS } from '../../apps/worker/src/billing.ts';
import { LIVE_REFUSED, METER_SKIPPED, NOT_A_KEY, keyFromStdin, main, modeOf, plan, setup } from './stripe-setup.mjs';

const SCRIPT = resolve(import.meta.dirname, 'stripe-setup.mjs');
const TEST_KEY = 'sk_test_InventedForThisTest0000Wxyz';
const LIVE_KEY = 'rk_' + 'live_InventedForThisTest1111Live';

/** A Stripe of one account, in memory, that answers the script's forms and keeps every request. */
function fakeStripe(key = TEST_KEY) {
  const products = new Map();
  const prices = new Map();
  const sent = [];
  const strange = [];
  let n = 0;
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const missing = () => answer(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such thing; key ${key}` } });
  const send = async (url, init) => {
    const u = new URL(url);
    sent.push({ method: init.method, path: u.pathname });
    const auth = init.headers.find(([h]) => h === 'authorization')?.[1];
    if (auth !== `Bearer ${key}`) return answer(401, { error: { type: 'invalid_request_error', code: 'api_key_invalid' } });
    const form = new URLSearchParams(init.body ?? '');
    if (init.method === 'GET' && u.pathname === '/v1/prices') {
      const keys = [...u.searchParams].filter(([k]) => k.startsWith('lookup_keys[')).map(([, v]) => v);
      return answer(200, { object: 'list', data: [...prices.values()].filter((p) => keys.includes(p.lookup_key)), has_more: false });
    }
    const product = /^\/v1\/products\/([^/]+)$/.exec(u.pathname);
    if (init.method === 'GET' && product) return products.has(product[1]) ? answer(200, products.get(product[1])) : missing();
    if (init.method === 'POST' && u.pathname === '/v1/products') {
      const id = form.get('id');
      if (products.has(id)) return answer(400, { error: { type: 'invalid_request_error', code: 'resource_already_exists' } });
      products.set(id, { id, object: 'product', name: form.get('name'), metadata: { braindog: form.get('metadata[braindog]') } });
      return answer(200, products.get(id));
    }
    if (init.method === 'POST' && u.pathname === '/v1/prices') {
      if (!products.has(form.get('product'))) return missing();
      const id = `price_fake${String((n += 1))}`;
      const interval = form.get('recurring[interval]');
      prices.set(id, {
        id,
        object: 'price',
        active: true,
        product: form.get('product'),
        lookup_key: form.get('lookup_key'),
        unit_amount: Number(form.get('unit_amount')),
        currency: form.get('currency'),
        recurring: interval === null ? null : { interval },
        type: interval === null ? 'one_time' : 'recurring',
      });
      return answer(200, prices.get(id));
    }
    strange.push(`${init.method} ${u.pathname}`);
    return answer(400, { error: { type: 'invalid_request_error', code: 'not_faked' } });
  };
  return { send, products, prices, sent, strange, posts: () => sent.filter((r) => r.method === 'POST') };
}

/** Runs `setup` and keeps every line it said. */
async function run(stripe, options = {}) {
  const lines = [];
  const done = await setup({ key: TEST_KEY, fetch: stripe.send, say: (l) => lines.push(l), ...options });
  return { done, lines };
}

const sold = Object.entries(PLAN_TABLE).filter(([, f]) => f.cents.month > 0);
const wantedPrices = sold.length + PACKS.length;

test('a first run makes every product and price, and a second makes nothing', async () => {
  const stripe = fakeStripe();
  const first = await run(stripe);
  assert.equal(first.done.ok, true, first.lines.join('\n'));
  assert.equal(first.done.made, wantedPrices);
  assert.equal(stripe.products.size, sold.length + PACKS.length);
  assert.equal(stripe.prices.size, wantedPrices);
  const posted = stripe.posts().length;
  const second = await run(stripe);
  assert.equal(second.done.ok, true);
  assert.equal(second.done.made, 0);
  assert.equal(second.done.found, wantedPrices);
  assert.equal(stripe.posts().length, posted, 'the second run sent a create');
  assert.deepEqual(second.done.ids, first.done.ids);
  assert.deepEqual(stripe.strange, []);
});

test('every price line names its id, what it sells and the setting it goes into', async () => {
  const stripe = fakeStripe();
  const { done, lines } = await run(stripe);
  for (const p of plan().prices) {
    const line = lines.find((l) => l.includes(done.ids[p.lookup_key]));
    assert.ok(line, `no line for ${p.lookup_key}`);
    assert.ok(line.includes(p.what), line);
    if (p.setting !== null) assert.ok(line.includes(p.setting), line);
  }
  assert.equal(lines.filter((l) => l.endsWith(METER_SKIPPED)).length, sold.reduce((sum, [, f]) => sum + Object.keys(f.extra ?? {}).length, 0));
});

test('a price that exists is never edited or archived, and one whose figure differs is named', async () => {
  const stripe = fakeStripe();
  await run(stripe);
  const [id, cloud] = [...stripe.prices].find(([, p]) => p.lookup_key === 'braindog-hosted-month');
  stripe.prices.set(id, { ...cloud, unit_amount: 1_500 });
  const posted = stripe.posts().length;
  const { done, lines } = await run(stripe);
  assert.equal(done.ok, false);
  assert.equal(done.differ, 1);
  assert.equal(stripe.posts().length, posted);
  assert.ok(lines.some((l) => l.startsWith(`differs ${id}`) && l.includes('1500 cents, the table says 1200')), lines.join('\n'));
  assert.deepEqual(stripe.strange, []);
});

test('an archived price is left archived and named, not taken as ready', async () => {
  const stripe = fakeStripe();
  await run(stripe);
  const [id, pack] = [...stripe.prices].find(([, p]) => p.lookup_key === 'braindog-credits-100');
  stripe.prices.set(id, { ...pack, active: false });
  const posted = stripe.posts().length;
  const { done, lines } = await run(stripe);
  assert.equal(done.ok, false);
  assert.equal(done.differ, 1);
  assert.equal(stripe.posts().length, posted);
  assert.ok(lines.some((l) => l.startsWith(`differs ${id}`) && l.includes('archived')), lines.join('\n'));
  assert.deepEqual(stripe.strange, []);
});

test('at a terminal, a backspace takes a letter back and ctrl-c gives up with no key', async () => {
  const tty = (...chunks) => {
    const stream = (async function* () {
      yield* chunks;
    })();
    return Object.assign(stream, { isTTY: true, raw: [], setRawMode: (on) => stream.raw.push(on), pause: () => {} });
  };
  const typed = tty('sk_test_Invented0000X', '\u007fWxyz\r', 'after the line');
  assert.equal(await keyFromStdin(typed, () => {}), 'sk_test_Invented0000Wxyz');
  assert.deepEqual(typed.raw, [true, false]);
  const quit = tty('sk_test_Invented0000Wxyz\u0003');
  assert.equal(await keyFromStdin(quit, () => {}), '');
  assert.deepEqual(quit.raw, [true, false]);
});

test('a live key is refused with nothing sent, unless --live-ok is given', async () => {
  const stripe = fakeStripe(LIVE_KEY);
  const refused = await run(stripe, { key: LIVE_KEY });
  assert.equal(refused.done.ok, false);
  assert.deepEqual(refused.lines, [LIVE_REFUSED]);
  assert.equal(stripe.sent.length, 0);
  const allowed = await run(stripe, { key: LIVE_KEY, liveOk: true });
  assert.equal(allowed.done.ok, true, allowed.lines.join('\n'));
  assert.equal(allowed.done.made, wantedPrices);
});

test('a key of no known kind is refused with nothing sent', async () => {
  assert.equal(modeOf(TEST_KEY), 'test');
  assert.equal(modeOf('rk_test_Invented00000000'), 'test');
  assert.equal(modeOf('sk_' + 'live_Invented00000000'), 'live');
  for (const bad of ['pk_test_Invented00000000', 'whsec_Invented00000000', 'sk_test_', 'sk_test_short', 'sk_test_Invented 0000 with spaces', '', undefined]) {
    assert.equal(modeOf(bad), null, String(bad));
    const stripe = fakeStripe();
    const { done, lines } = await run(stripe, { key: bad });
    assert.equal(done.ok, false);
    assert.deepEqual(lines, [NOT_A_KEY]);
    assert.equal(stripe.sent.length, 0);
  }
});

test('no line the script says holds the key, a failure from Stripe included', async () => {
  const body = TEST_KEY.slice(0, -4);
  const lines = [];
  const stripe = fakeStripe();
  lines.push(...(await run(stripe)).lines, ...(await run(stripe)).lines);
  /* Stripe's own error message quotes the key here; the script says the status, type and code only. */
  const failing = { send: async () => new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'api_key_invalid', message: `Invalid key ${TEST_KEY}` } }), { status: 401 }) };
  const failed = await run(failing);
  assert.equal(failed.done.ok, false);
  lines.push(...failed.lines);
  assert.ok(failed.lines.some((l) => l.includes('401 invalid_request_error api_key_invalid')), failed.lines.join('\n'));
  for (const line of lines) assert.ok(!line.includes(body), `a line holds the key: ${line.replace(body, '<key>')}`);
  assert.ok(lines.some((l) => l === 'Stripe key: test mode, ending Wxyz.'));
});

test('the command takes the key from standard input only, and refuses one given as an argument', () => {
  const node = process.execPath;
  const asArg = spawnSync(node, [SCRIPT, TEST_KEY], { input: '', encoding: 'utf8' });
  assert.equal(asArg.status, 2);
  assert.ok(!`${asArg.stdout}${asArg.stderr}`.includes(TEST_KEY.slice(0, -4)));
  const live = spawnSync(node, [SCRIPT], { input: `${LIVE_KEY}\n`, encoding: 'utf8' });
  assert.equal(live.status, 1);
  assert.equal(live.stdout.trim(), LIVE_REFUSED);
  const bad = spawnSync(node, [SCRIPT], { input: 'pk_test_Invented00000000\n', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout.trim(), NOT_A_KEY);
  const none = spawnSync(node, [SCRIPT], { input: '', encoding: 'utf8' });
  assert.equal(none.status, 2);
});

test('main reads a piped key and runs against the Stripe it is handed', async () => {
  const stripe = fakeStripe();
  const lines = [];
  const stdin = (async function* () {
    yield `\n${TEST_KEY}\n`;
  })();
  assert.equal(await main([], { stdin, say: (l) => lines.push(l), send: stripe.send }), 0, lines.join('\n'));
  assert.equal(stripe.prices.size, wantedPrices);
});

test("the plan's prices are the table's and the packs', in cents and currency", () => {
  const { prices, products } = plan();
  const currency = CURRENCY.toLowerCase();
  for (const [id, figures] of sold) {
    const month = prices.find((p) => p.lookup_key === `braindog-${id}-month`);
    assert.ok(month, `no monthly price for ${id}`);
    assert.equal(month.cents, figures.cents.month);
    assert.equal(month.currency, currency);
    assert.equal(month.interval, 'month');
    assert.equal(prices.some((p) => p.lookup_key === `braindog-${id}-year`), figures.cents.year !== null);
  }
  for (const pack of PACKS) {
    const price = prices.find((p) => p.lookup_key === `braindog-${pack.id}`);
    assert.ok(price, `no price for ${pack.id}`);
    assert.deepEqual([price.cents, price.currency, price.interval], [pack.cents, currency, null]);
  }
  assert.equal(prices.length, sold.length + PACKS.length + sold.filter(([, f]) => f.cents.year !== null).length);
  assert.ok(prices.every((p) => products.some((q) => q.id === p.product)));
  assert.equal(new Set(prices.map((p) => p.lookup_key)).size, prices.length, 'two prices share a lookup_key');
});

test("every setting billing reads for a price is one the plan fills", () => {
  const settings = plan().prices.map((p) => p.setting);
  for (const p of Object.values(HOSTED_PLANS)) assert.ok(settings.includes(p.setting), p.setting);
  for (const s of Object.values(PACK_SETTINGS)) assert.ok(settings.includes(s), s);
});
