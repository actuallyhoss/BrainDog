/**
 * Stripe set up for BrainDog in one command: the products and prices of the one plan table, the meter extra usage is
 * charged on, the Customer Portal and the webhook, and the price ids written into `apps/worker/wrangler.jsonc`.
 *
 *   node tools/ship/stripe.mjs --mode test|live [--env alpha|production] [--dry] [--put-key]
 *
 * SAFE TO RUN AGAIN AND AGAIN. Everything is found before it is made: prices by their `lookup_key`, products by
 * `metadata[braindog]`, the meter by its event name, the portal as the account's default configuration, the webhook by
 * its address. A second run finds what the first made and changes nothing it does not have to.
 *
 * THE DUPLICATE PRICE (scope F3) IS TIDIED HERE. For each thing sold, the price kept is the one `wrangler.jsonc` already
 * names for the environment when it charges what the table says (amount, USD, how often, on sale), else the one holding
 * the lookup key, else a new one. The lookup key is moved onto the kept price, and every other active price of the same
 * kind on that product is archived and named. Archiving never touches a subscription already on that price.
 *
 * THE KEY IS READ FROM THE MACOS KEYCHAIN (`braindog-stripe-test` or `braindog-stripe-live`), or from
 * `STRIPE_SECRET_KEY` in the environment, and is never printed. Its prefix must agree with `--mode`. `--put-key` also
 * puts it on the Worker as `STRIPE_SECRET_KEY` through `wrangler secret put`, from stdin.
 *
 * THE WEBHOOK'S SIGNING SECRET IS SHOWN BY STRIPE ONLY WHEN THE ENDPOINT IS MADE, so a new endpoint's secret goes straight
 * into `wrangler secret put STRIPE_WEBHOOK_SECRET` from stdin and is never printed. An endpoint already there keeps the
 * secret already set.
 *
 * IT NEVER TURNS BILLING ON. `BILLING` in `wrangler.jsonc` and a deploy are the last step, and the summary says so.
 *
 * `--dry` asks Stripe what is there (reads only) and says what it would make, move, archive and write; it changes nothing.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKS, PLAN_TABLE, CURRENCY } from '../../packages/record/src/plans.ts';
import { stripJsonc } from '../../apps/worker/scripts/provision-check.mjs';
import { ROOT } from './lib.mjs';

/* ── the command line ───────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const HELP = `node tools/ship/stripe.mjs --mode test|live [--env alpha|production] [--dry] [--put-key]

  --mode     test or live: which Stripe mode, and which keychain item (braindog-stripe-<mode>) holds the key
  --env      the Worker environment whose wrangler.jsonc vars and secrets are set (test: alpha, live: production)
  --dry      read Stripe and say what would change; change nothing
  --put-key  also put the key on the Worker as STRIPE_SECRET_KEY (wrangler secret put, from stdin)`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? '' : v;
};
const known = new Set(['--mode', '--env', '--dry', '--put-key']);
const strays = argv.filter((a, i) => a.startsWith('--') ? !known.has(a) : !['--mode', '--env'].includes(argv[i - 1] ?? ''));
const MODE = valueOf('--mode');
const ENV = valueOf('--env') ?? (MODE === 'live' ? 'production' : 'alpha');
const DRY = argv.includes('--dry');
const PUT_KEY = argv.includes('--put-key');

const stop = (why) => {
  console.error(`stripe: ${why}`);
  process.exit(1);
};

if (strays.length > 0) stop(`not a flag this takes: ${strays.join(' ')}\n\n${HELP}`);
if (MODE !== 'test' && MODE !== 'live') stop(`--mode is test or live.\n\n${HELP}`);
if (ENV !== 'alpha' && ENV !== 'production') stop('--env is alpha or production.');

/* ── the key ────────────────────────────────────────────────────────────── */

const KEYCHAIN = `braindog-stripe-${MODE}`;

function readKey() {
  const r = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.status === 0 && r.stdout.trim() !== '') return { key: r.stdout.trim(), from: `keychain ${KEYCHAIN}` };
  const env = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  if (env !== '') return { key: env, from: 'STRIPE_SECRET_KEY in the environment' };
  return null;
}

const found = readKey();
if (found === null)
  stop(
    `no Stripe ${MODE} key: put it in the keychain with\n\n    security add-generic-password -s ${KEYCHAIN} -a braindog -w\n\n` +
      'which asks for the key without showing it, or export STRIPE_SECRET_KEY for this one run.',
  );
const KEY = found.key;
const keyMode = /^[sr]k_test_/u.test(KEY) ? 'test' : /^[sr]k_live_/u.test(KEY) ? 'live' : null;
if (keyMode !== MODE) stop(`the key from ${found.from} is ${keyMode === null ? 'not a Stripe secret key' : `a ${keyMode} key`}, and --mode is ${MODE}.`);
if ((MODE === 'live') !== (ENV === 'production')) console.log(`note: ${MODE} prices are going into env.${ENV}, which usually takes ${ENV === 'production' ? 'live' : 'test'} ones.`);

/* ── the config ─────────────────────────────────────────────────────────── */

const WRANGLER = join(ROOT, 'apps', 'worker', 'wrangler.jsonc');
const config = JSON.parse(stripJsonc(readFileSync(WRANGLER, 'utf8')));
const vars = config.env?.[ENV]?.vars;
if (!vars) stop(`apps/worker/wrangler.jsonc has no env.${ENV}.vars.`);
const HOST = String(vars.PUBLIC_HOST ?? '').trim() || 'app.brain.dog';
const SITE = 'https://brain.dog';

/** The event types the Worker acts on: `ACTS` in `apps/worker/src/billing.ts`, read from the source so the two never part. */
function actedOn() {
  const src = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'billing.ts'), 'utf8');
  const block = /const ACTS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/u.exec(src);
  if (!block) stop('could not find ACTS in apps/worker/src/billing.ts, so the webhook events are unknown.');
  const types = [...block[1].matchAll(/'([a-z_.]+)'/gu)].map((m) => m[1]);
  if (types.length === 0) stop('ACTS in apps/worker/src/billing.ts names no event.');
  return types.sort();
}
const EVENTS = actedOn();

/* ── what is sold, from the one table ───────────────────────────────────── */

const cur = CURRENCY.toLowerCase();
const pack = (id) => {
  const p = PACKS.find((x) => x.id === id);
  if (!p) stop(`packages/record/src/plans.ts has no pack ${id}.`);
  return p;
};

/**
 * Each thing sold: the product it sits on, the price's shape, its lookup key and the wrangler var that names it.
 * `kind` is how a price is told apart on one product: `month` licensed monthly, `once`, or `metered` monthly.
 */
const SOLD = [
  { id: 'cloud', product: PLAN_TABLE.hosted.name, cents: PLAN_TABLE.hosted.cents.month, kind: 'month', lookup: 'braindog_cloud_month', setting: 'STRIPE_PRICE_HOSTED' },
  { id: 'plus', product: PLAN_TABLE.plus.name, cents: PLAN_TABLE.plus.cents.month, kind: 'month', lookup: 'braindog_plus_month', setting: 'STRIPE_PRICE_PLUS' },
  { id: 'pack-100', product: `${pack('credits-100').credits} Slash credits`, cents: pack('credits-100').cents, kind: 'once', lookup: 'braindog_pack_100', setting: 'STRIPE_PRICE_PACK_100' },
  { id: 'pack-500', product: `${pack('credits-500').credits} Slash credits`, cents: pack('credits-500').cents, kind: 'once', lookup: 'braindog_pack_500', setting: 'STRIPE_PRICE_PACK_500' },
  { id: 'extra', product: 'Extra usage', cents: 1, kind: 'metered', lookup: 'braindog_extra_cent', setting: 'STRIPE_PRICE_EXTRA' },
];
const METER_EVENT = 'braindog_extra_cents';

/* ── Stripe over fetch ──────────────────────────────────────────────────── */

const API = 'https://api.stripe.com';

const formOf = (form) =>
  Object.entries(form)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

async function call(method, path, form = {}) {
  const body = formOf(form);
  const headers = { authorization: `Bearer ${KEY}`, accept: 'application/json' };
  if (method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const minute = Math.floor(Date.now() / 60_000);
    headers['idempotency-key'] = `braindog-setup-${createHash('sha256').update(`${path}\n${body}`).digest('hex').slice(0, 40)}-${minute}`;
  }
  const url = method === 'GET' && body !== '' ? `${API}${path}?${body}` : `${API}${path}`;
  let res;
  try {
    res = await fetch(url, { method, headers, ...(method === 'POST' ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  } catch {
    stop(`Stripe could not be reached (${method} ${path}).`);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json === null) {
    const e = json?.error ?? {};
    /* STRIPE'S `message` IS SAFE TO SHOW HERE: it is the operator's own terminal and names the field that is wrong. */
    stop(`Stripe refused ${method} ${path}: ${res.status} ${e.type ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.trim());
  }
  return json;
}

const read = (path, query) => call('GET', path, query);
const changes = [];
/** A write, or in `--dry` the line saying it would be made, answered with a stand-in id. */
async function write(what, path, form, stand = 'new') {
  if (DRY) {
    changes.push(`would ${what}`);
    return { id: `(${stand})`, dry: true };
  }
  const out = await call('POST', path, form);
  changes.push(what);
  return out;
}

/** Every page of a list, up to `most` objects. */
async function all(path, query = {}, most = 500) {
  const out = [];
  let after;
  for (;;) {
    const page = await read(path, { ...query, limit: 100, ...(after ? { starting_after: after } : {}) });
    out.push(...(page.data ?? []));
    if (!page.has_more || out.length >= most || page.data.length === 0) return out;
    after = page.data.at(-1).id;
  }
}

/* ── the meter ──────────────────────────────────────────────────────────── */

async function meter() {
  const meters = await all('/v1/billing/meters', { status: 'active' });
  const have = meters.find((m) => m.event_name === METER_EVENT);
  if (have) return have.id;
  const made = await write(`make the meter ${METER_EVENT} (sum of cents)`, '/v1/billing/meters', {
    display_name: 'BrainDog extra usage (cents)',
    event_name: METER_EVENT,
    'default_aggregation[formula]': 'sum',
    'customer_mapping[type]': 'by_id',
    'customer_mapping[event_payload_key]': 'stripe_customer_id',
    'value_settings[event_payload_key]': 'value',
  }, 'meter');
  return made.id;
}

/* ── prices ─────────────────────────────────────────────────────────────── */

/** Whether a price is the shape of this thing sold: kind, amount, currency, on sale (and, metered, on our meter). */
function fits(price, sold, meterId) {
  if (!price || price.active !== true || price.currency !== cur) return false;
  const r = price.recurring;
  const amount = price.unit_amount === sold.cents || (sold.kind === 'metered' && price.unit_amount_decimal === String(sold.cents));
  if (!amount) return false;
  if (sold.kind === 'once') return r === null || r === undefined;
  if (!r || r.interval !== 'month' || r.interval_count !== 1) return false;
  if (sold.kind === 'month') return r.usage_type !== 'metered';
  return r.usage_type === 'metered' && (meterId.startsWith('(') || r.meter === meterId);
}

/** The kind of a price on a product, so only prices of the same kind are archived beside the kept one. */
const kindOf = (price) => (!price.recurring ? 'once' : price.recurring.usage_type === 'metered' ? 'metered' : price.recurring.interval === 'month' && price.recurring.interval_count === 1 ? 'month' : `every-${price.recurring.interval}`);

async function priceById(id) {
  if (!/^price_[A-Za-z0-9]+$/u.test(id)) return null;
  const res = await fetch(`${API}/v1/prices/${id}`, { headers: { authorization: `Bearer ${KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res) stop('Stripe could not be reached (GET /v1/prices).');
  if (res.status === 404) return null;
  if (!res.ok) stop(`Stripe refused GET /v1/prices/${id}: ${res.status}`);
  return res.json();
}

/** The product for a thing sold: the kept price's, or one carrying `metadata[braindog]`, or a new one. */
async function productFor(sold, kept, products) {
  if (kept) return typeof kept.product === 'string' ? kept.product : kept.product.id;
  const have = products.find((p) => p.metadata?.braindog === sold.id && p.active);
  if (have) return have.id;
  const made = await write(`make the product "${sold.product}"`, '/v1/products', { name: sold.product, 'metadata[braindog]': sold.id }, `product ${sold.id}`);
  return made.id;
}

/** One thing sold, set up: the price kept, with the lookup key on it. Answers the kept price id and its product. */
async function settle(sold, meterId, products) {
  const named = String(vars[sold.setting] ?? '').trim();
  const fromConfig = named === '' ? null : await priceById(named);
  const byLookup = (await read('/v1/prices', { 'lookup_keys[]': sold.lookup, active: 'true', limit: 1 })).data?.[0] ?? null;

  let kept = null;
  let why = '';
  if (fits(fromConfig, sold, meterId)) [kept, why] = [fromConfig, `the one ${sold.setting} names`];
  else if (fits(byLookup, sold, meterId)) [kept, why] = [byLookup, `the one holding ${sold.lookup}`];
  if (named !== '' && kept !== fromConfig) console.log(`  ${sold.id}: ${sold.setting} names ${named}, which ${fromConfig ? 'does not charge what the table says' : 'Stripe does not know'}; it is replaced.`);

  const product = await productFor(sold, kept, products);
  if (kept === null) {
    const form = {
      product,
      currency: cur,
      unit_amount: sold.cents,
      nickname: sold.product,
      lookup_key: sold.lookup,
      transfer_lookup_key: 'true',
      tax_behavior: 'exclusive',
      ...(sold.kind === 'month' ? { 'recurring[interval]': 'month', 'recurring[interval_count]': 1 } : {}),
      ...(sold.kind === 'metered' ? { 'recurring[interval]': 'month', 'recurring[usage_type]': 'metered', 'recurring[meter]': meterId } : {}),
    };
    kept = await write(`make the ${sold.product} price (${sold.kind === 'once' ? 'once' : 'monthly'}, ${sold.cents} cents)`, '/v1/prices', form, `price ${sold.id}`);
    why = 'made now';
  } else {
    /* THE LOOKUP KEY MOVES ONTO THE KEPT PRICE, and a price with no tax behaviour gets `exclusive` (Stripe lets it be set
       once), so turning Stripe Tax on later adds tax on top of the table's price rather than refusing the checkout. */
    const form = {
      ...(kept.lookup_key !== sold.lookup ? { lookup_key: sold.lookup, transfer_lookup_key: 'true' } : {}),
      ...(kept.tax_behavior === 'unspecified' || !kept.tax_behavior ? { tax_behavior: 'exclusive' } : {}),
    };
    if (Object.keys(form).length > 0)
      await write(`${form.lookup_key ? `move ${sold.lookup} onto ${kept.id}` : `set ${kept.id}`}${form.tax_behavior ? ' (tax exclusive)' : ''}`, `/v1/prices/${kept.id}`, form);
  }
  console.log(`  ${sold.id}: keeping ${kept.id} (${why})`);
  return { sold, id: kept.id, product };
}

/** Every other active price of the same kind on each kept price's product, archived. Never one that is kept. */
async function tidy(settled) {
  const keptIds = new Set(settled.map((s) => s.id));
  const archived = [];
  for (const s of settled) {
    if (s.product.startsWith('(')) continue;
    const prices = await all('/v1/prices', { product: s.product, active: 'true' });
    for (const p of prices) {
      if (keptIds.has(p.id) || kindOf(p) !== s.sold.kind) continue;
      await write(`archive ${p.id} (${p.unit_amount ?? p.unit_amount_decimal} ${p.currency}, ${kindOf(p)}) on ${s.sold.product}, a duplicate of ${s.id}`, `/v1/prices/${p.id}`, { active: 'false' });
      archived.push(p.id);
    }
  }
  return archived;
}

/* ── the portal ─────────────────────────────────────────────────────────── */

async function portal(cloud, plus) {
  const form = {
    'business_profile[privacy_policy_url]': `${SITE}/legal/privacy`,
    'business_profile[terms_of_service_url]': `${SITE}/legal/terms`,
    default_return_url: `https://${HOST}/settings/billing`,
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email',
    'features[customer_update][allowed_updates][1]': 'address',
    'features[customer_update][allowed_updates][2]': 'tax_id',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_cancel][proration_behavior]': 'none',
    'features[subscription_update][enabled]': 'true',
    'features[subscription_update][default_allowed_updates][0]': 'price',
    'features[subscription_update][proration_behavior]': 'create_prorations',
    'features[subscription_update][products][0][product]': cloud.product,
    'features[subscription_update][products][0][prices][0]': cloud.id,
    'features[subscription_update][products][1][product]': plus.product,
    'features[subscription_update][products][1][prices][0]': plus.id,
  };
  const configs = (await read('/v1/billing_portal/configurations', { is_default: 'true', active: 'true', limit: 1 })).data ?? [];
  const current = configs[0];
  if (current) {
    await write(`update the default Customer Portal configuration ${current.id}`, `/v1/billing_portal/configurations/${current.id}`, form);
    return current.id;
  }
  const made = await write('make the Customer Portal configuration (the account default)', '/v1/billing_portal/configurations', form, 'portal');
  return made.id;
}

/* ── the webhook ────────────────────────────────────────────────────────── */

function wrangler(args, input) {
  return spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: join(ROOT, 'apps', 'worker'),
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}

function putSecret(name, value) {
  if (DRY) {
    changes.push(`would put ${name} on env.${ENV} (wrangler secret put, from stdin)`);
    return;
  }
  const r = wrangler(['secret', 'put', name, '--env', ENV], `${value}\n`);
  if (r.status !== 0) stop(`wrangler secret put ${name} --env ${ENV} failed:\n${(r.stderr || r.stdout || '').replaceAll(value, '[hidden]').slice(0, 2000)}`);
  changes.push(`put ${name} on env.${ENV}`);
}

async function webhook() {
  const url = `https://${HOST}/account/billing/webhook`;
  const endpoints = await all('/v1/webhook_endpoints');
  const have = endpoints.find((e) => e.url === url);
  const events = Object.fromEntries(EVENTS.map((t, i) => [`enabled_events[${i}]`, t]));
  if (have) {
    const same = [...(have.enabled_events ?? [])].sort().join(',') === EVENTS.join(',');
    if (!same || have.status !== 'enabled') await write(`set the webhook ${have.id} to the ${EVENTS.length} events the Worker acts on`, `/v1/webhook_endpoints/${have.id}`, { ...events, disabled: 'false' });
    console.log(`  webhook: ${have.id} at ${url} is there already; the STRIPE_WEBHOOK_SECRET already set on env.${ENV} stays.`);
    return have.id;
  }
  const made = await write(`make the webhook at ${url} for ${EVENTS.length} events`, '/v1/webhook_endpoints', { url, description: `BrainDog ${ENV}`, ...events }, 'webhook');
  if (!made.dry) {
    if (typeof made.secret !== 'string' || made.secret === '') stop(`Stripe made the webhook ${made.id} and sent no signing secret; roll it in the dashboard and put it with wrangler secret put STRIPE_WEBHOOK_SECRET --env ${ENV}.`);
    putSecret('STRIPE_WEBHOOK_SECRET', made.secret);
  } else changes.push(`would put the new webhook's signing secret as STRIPE_WEBHOOK_SECRET on env.${ENV}`);
  console.log(`  webhook: ${made.id} at ${url}`);
  return made.id;
}

/* ── wrangler.jsonc, edited as text ─────────────────────────────────────── */

/**
 * The vars written into env.<ENV> of `wrangler.jsonc` by editing the value strings where they stand, so every comment
 * and the file's layout stay as they are. A key the env does not have yet goes on the line after its pack prices.
 */
function writeVars(next) {
  const text = readFileSync(WRANGLER, 'utf8');
  const start = text.search(new RegExp(`\\n {4}"${ENV}": \\{`, 'u'));
  if (start === -1) stop(`could not find env.${ENV} in apps/worker/wrangler.jsonc as text.`);
  const rest = text.slice(start + 1);
  const nextEnv = rest.slice(1).search(/\n {4}"[a-z-]+": \{|\n {2}\}/u);
  const end = nextEnv === -1 ? text.length : start + 2 + nextEnv;
  let block = text.slice(start, end);
  const moved = [];
  for (const [k, v] of Object.entries(next)) {
    const at = new RegExp(`(\\n {8}"${k}": )"([^"]*)"`, 'u');
    const m = at.exec(block);
    if (m) {
      if (m[2] === v) continue;
      block = block.replace(at, `$1"${v}"`);
      moved.push(`${k} ${m[2] || '(empty)'} -> ${v}`);
    } else {
      const anchor = /(\n {8}"STRIPE_PRICE_PACK_500": "[^"]*",?)/u.exec(block) ?? /(\n {8}"STRIPE_PRICE_PLUS": "[^"]*",?)/u.exec(block);
      if (!anchor) stop(`env.${ENV} has no STRIPE_PRICE_PLUS line to put ${k} after; add "${k}": "${v}" by hand.`);
      const line = anchor[1].endsWith(',') ? anchor[1] : `${anchor[1]},`;
      block = block.replace(anchor[1], `${line}\n        "${k}": "${v}",`);
      moved.push(`${k} added: ${v}`);
    }
  }
  if (moved.length === 0) return [];
  const out = text.slice(0, start) + block + text.slice(end);
  /* THE EDIT IS CHECKED BY PARSING IT, and nothing is written if the file would no longer read. */
  const parsed = JSON.parse(stripJsonc(out));
  for (const [k, v] of Object.entries(next)) if (parsed.env?.[ENV]?.vars?.[k] !== v) stop(`the edit of ${k} in env.${ENV} did not land; nothing was written.`);
  if (DRY) {
    for (const m of moved) changes.push(`would write ${m} in wrangler.jsonc env.${ENV}`);
    return moved;
  }
  writeFileSync(WRANGLER, out);
  for (const m of moved) changes.push(`wrote ${m} in wrangler.jsonc env.${ENV}`);
  return moved;
}

/* ── the run ────────────────────────────────────────────────────────────── */

console.log(`Stripe ${MODE} mode, env.${ENV} (${HOST}), key from ${found.from}${DRY ? ', dry run: nothing changes' : ''}.`);
const account = await read('/v1/account');
console.log(`Account: ${account.settings?.dashboard?.display_name || account.business_profile?.name || account.id}`);

console.log('\nMeter and prices');
const meterId = await meter();
console.log(`  meter: ${meterId} (${METER_EVENT})`);
const products = await all('/v1/products', { active: 'true' });
const settled = [];
for (const sold of SOLD) settled.push(await settle(sold, meterId, products));

console.log('\nDuplicates');
const archived = await tidy(settled);
if (archived.length === 0) console.log('  none');

console.log('\nCustomer Portal');
const by = Object.fromEntries(settled.map((s) => [s.sold.id, s]));
const portalId = await portal(by.cloud, by.plus);
console.log(`  ${portalId}: card, invoices, address and tax id, cancel at period end, switch between Cloud and Cloud Plus`);

console.log('\nWebhook');
await webhook();

console.log('\nwrangler.jsonc');
const ids = Object.fromEntries(settled.map((s) => [s.sold.setting, s.id]));
const written = settled.some((s) => s.id.startsWith('(')) && DRY ? [] : writeVars({ ...ids, STRIPE_METER_EXTRA: METER_EVENT });
if (DRY && settled.some((s) => s.id.startsWith('('))) changes.push(`would write the new price ids and STRIPE_METER_EXTRA=${METER_EVENT} into env.${ENV}`);
else if (written.length === 0) console.log(`  env.${ENV} already names every price.`);

if (PUT_KEY) putSecret('STRIPE_SECRET_KEY', KEY);

console.log(`\n${DRY ? 'Would change' : 'Changed'}:`);
console.log(changes.length === 0 ? '  nothing: Stripe and wrangler.jsonc already agree.' : changes.map((c) => `  - ${c}`).join('\n'));
console.log(`\nLast step, yours: ${PUT_KEY ? '' : `put the key on the Worker (rerun with --put-key, or wrangler secret put STRIPE_SECRET_KEY --env ${ENV}); `}set "BILLING": "${MODE}" in env.${ENV} of apps/worker/wrangler.jsonc${ENV === 'production' ? ' (and LAUNCH.billing in apps/site/src/lib/launch.ts)' : ''}, commit, and deploy.`);
if (!account.business_profile?.support_email || !account.settings?.payments?.statement_descriptor)
  console.log('Also fill Settings > Business > Public details in the Stripe dashboard: name BrainDog, support email support@brain.dog, statement descriptor BRAINDOG.');
