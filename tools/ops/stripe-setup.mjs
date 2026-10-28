/**
 * The plans and the credit packs, made in Stripe from the one table (;
 * "include the credits/usages offered on the plans").
 *
 *   pbpaste | node tools/ops/stripe-setup.mjs [--live-ok]
 *
 * ONE COMMAND, RUN AGAIN AS OFTEN AS YOU LIKE. Every price carries a `lookup_key` made from what it sells (the plan and
 * how often it is paid, or the pack), so a run first asks Stripe for those keys and creates only the products and prices
 * that are missing. A price that exists is never edited and never archived: Stripe's prices cannot change their figure,
 * and an archive would take a plan off sale under a record paying for it. One whose figure differs from the table is
 * named, and left for a person to settle in Stripe's own page.
 *
 * THE FIGURES ARE THE ONE TABLE'S (`PLAN_TABLE` and `PACKS` in `packages/record/src/plans.ts`) and the settings each
 * price goes into are billing's own (`HOSTED_PLANS` and `PACK_SETTINGS` in `apps/worker/src/billing.ts`), imported and
 * never copied, so the ids printed are the ones `wrangler.jsonc` wants. Free and Self-host sell nothing and make nothing.
 * Extra usage is listed and skipped: its meters need a migration that is not built.
 *
 * THE KEY IS READ FROM STANDARD INPUT ONLY: never an argument, which every process on the machine can read, and never
 * the environment, which a child inherits. It goes into the `authorization` header of a request to `api.stripe.com`
 * (`stripeOf` in `apps/worker/src/stripe.ts`) and nowhere else. The one line that names it says its mode and its last
 * four characters, and a failure is Stripe's status, type and code, never its message.
 *
 * TEST MODE ONLY: charging money is a separate decision. A live key is refused with nothing sent unless `--live-ok`
 * is given, and that flag is the owner's to type in the one live sitting.
 */

import { fileURLToPath } from 'node:url';

import { CURRENCY, PACKS, PLAN_TABLE, priceOf } from '../../packages/record/src/plans.ts';
import { HOSTED_PLANS, PACK_SETTINGS } from '../../apps/worker/src/billing.ts';
import { stripeOf, textAt, objectAt } from '../../apps/worker/src/stripe.ts';

/** The sentence a live key is refused with, word for word. */
export const LIVE_REFUSED = "Live mode is the owner's word. Nothing was made.";

/** The sentence a key of no known kind is refused with. It never quotes what was given. */
export const NOT_A_KEY = 'That is not a Stripe secret or restricted key (sk_test_, rk_test_, sk_live_ or rk_live_). Nothing was made.';

/** Why each extra-usage meter is skipped. */
export const METER_SKIPPED = 'needs the extra-usage migration, not built';

/** What each `lookup_key` and product id starts with, so these are told apart from anything else in the account. */
const PREFIX = 'braindog';

/** A key's mode: `test` or `live`, or `null` for anything that is not a Stripe secret or restricted key. */
export function modeOf(key) {
  const m = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.exec(typeof key === 'string' ? key : '');
  return m === null ? null : m[1];
}

/** The settings each price goes into, read from billing: the Directory's plan to its setting, and each pack's. */
const SETTINGS = {
  plans: Object.fromEntries(Object.values(HOSTED_PLANS).map((p) => [p.directory, p.setting])),
  packs: { ...PACK_SETTINGS },
};

/** How much of a meter one extra price buys, as a person reads it ("5,000 runs", "1 GB fetched", "10 hours of run time"). */
const PER = {
  runs: (n) => `${n.toLocaleString('en-US')} runs`,
  requests: (n) => `${n.toLocaleString('en-US')} requests`,
  bytes: (n) => `${(n / 1_000_000_000).toLocaleString('en-US')} GB fetched`,
  ms: (n) => `${(n / 3_600_000).toLocaleString('en-US')} hours of run time`,
};

/**
 * The products and prices the table needs, and the meters skipped. Pure: nothing here speaks to Stripe.
 *
 * A PLAN IS SOLD WHEN IT COSTS SOMETHING: one product (`braindog-<plan>`), a monthly price, and a yearly one when the
 * table sells a year. A PACK is one product and one price paid once. Each price says the setting it goes into, `null`
 * when billing has none for it yet.
 */
export function plan(table = PLAN_TABLE, packs = PACKS, settings = SETTINGS) {
  const currency = CURRENCY.toLowerCase();
  const products = [];
  const prices = [];
  const skipped = [];
  for (const [id, figures] of Object.entries(table)) {
    if (figures.cents.month === 0) continue;
    const product = `${PREFIX}-${id}`;
    products.push({ id: product, name: `BrainDog ${figures.name}`, metadata: { braindog: 'plan', plan: id } });
    for (const interval of /** @type {const} */ (['month', 'year'])) {
      const cents = figures.cents[interval];
      if (cents === null) continue;
      prices.push({
        lookup_key: `${PREFIX}-${id}-${interval}`,
        product,
        what: `${figures.name}, ${priceOf(cents)} a ${interval}`,
        setting: interval === 'month' ? (settings.plans[id] ?? null) : null,
        cents,
        currency,
        interval,
        metadata: { braindog: 'plan', plan: id, interval },
      });
    }
    for (const [meter, extra] of Object.entries(figures.extra ?? {}))
      skipped.push({ what: `${figures.name}, extra usage at ${priceOf(extra.cents)} per ${(PER[meter] ?? String)(extra.per)}`, why: METER_SKIPPED });
  }
  for (const pack of packs) {
    const product = `${PREFIX}-${pack.id}`;
    products.push({ id: product, name: `BrainDog ${pack.credits} Slash credits`, metadata: { braindog: 'pack', pack: pack.id } });
    prices.push({
      lookup_key: `${PREFIX}-${pack.id}`,
      product,
      what: `${pack.credits} Slash credits, ${priceOf(pack.cents)} once`,
      setting: settings.packs[pack.id] ?? null,
      cents: pack.cents,
      currency,
      interval: null,
      metadata: { braindog: 'pack', pack: pack.id },
    });
  }
  return { products, prices, skipped };
}

/** A form's metadata, flattened to Stripe's bracketed names. */
const metadataForm = (metadata) => Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v]));

/** A failure as one line: Stripe's status, type and code, never its message, which may quote what was sent. */
const faultOf = (answer) => `Stripe answered ${String(answer.status)}${answer.type ? ` ${answer.type}` : ''}${answer.code ? ` ${answer.code}` : ''}`;

/** How far an existing price is from the one the table wants: `''` when it agrees, else what differs. */
function differs(seen, want) {
  const out = [];
  const amount = seen['unit_amount'];
  if (amount !== want.cents) out.push(`is ${String(amount)} cents, the table says ${String(want.cents)}`);
  if (textAt(seen, 'currency') !== want.currency) out.push(`is in ${textAt(seen, 'currency') || 'nothing'}, the table says ${want.currency}`);
  const interval = textAt(objectAt(seen, 'recurring') ?? {}, 'interval') || null;
  if (interval !== want.interval) out.push(`is paid ${interval === null ? 'once' : `every ${interval}`}, the table says ${want.interval === null ? 'once' : `every ${want.interval}`}`);
  /* An archived price is not for sale: no checkout can use it, so it is not ready, and making it active is a person's. */
  if (seen['active'] === false) out.push('is archived, so no checkout can sell it');
  return out.join('; ');
}

/**
 * Makes what `plan()` names and is missing, and says what each id is.
 *
 * `fetch` IS STRIPE'S WIRE (`StripeFetch` in `apps/worker/src/stripe.ts`): the platform's by default, a test's fake
 * otherwise. `say` takes each line. Nothing is sent before the key's mode is known and allowed.
 *
 * ANSWERS `{ ok, made, found, differ, failed, ids }`: `ok` is false on a refusal, a failure or a price whose figure
 * differs, and `ids` is each price's id by its `lookup_key`, made or found.
 */
export async function setup({ key, fetch: send, liveOk = false, say = (line) => console.log(line), now = Date.now, table = PLAN_TABLE, packs = PACKS }) {
  const tally = { ok: false, made: 0, found: 0, differ: 0, failed: 0, ids: {} };
  const mode = modeOf(key);
  if (mode === null) return (say(NOT_A_KEY), tally);
  if (mode === 'live' && !liveOk) return (say(LIVE_REFUSED), tally);
  say(`Stripe key: ${mode} mode, ending ${key.slice(-4)}.`);
  const stripe = stripeOf(key, now, send);
  const wanted = plan(table, packs);

  const seen = new Map();
  for (let i = 0; i < wanted.prices.length; i += 10) {
    const chunk = wanted.prices.slice(i, i + 10);
    const query = { limit: 100, ...Object.fromEntries(chunk.map((p, n) => [`lookup_keys[${String(n)}]`, p.lookup_key])) };
    const listed = await stripe.read('/v1/prices', query);
    if (!listed.ok) {
      say(`failed  the list of prices: ${faultOf(listed)}. Nothing was made.`);
      return { ...tally, failed: 1 };
    }
    const data = Array.isArray(listed.body['data']) ? listed.body['data'] : [];
    for (const price of data) if (price && typeof price === 'object') seen.set(textAt(price, 'lookup_key'), price);
  }

  const products = new Map(wanted.products.map((p) => [p.id, p]));
  const productReady = new Set();
  const ensureProduct = async (id) => {
    if (productReady.has(id)) return true;
    const got = await stripe.read(`/v1/products/${encodeURIComponent(id)}`);
    if (got.ok) return (productReady.add(id), true);
    if (got.status !== 404) return (say(`failed  product ${id}: ${faultOf(got)}.`), false);
    const p = products.get(id);
    const made = await stripe.create('/v1/products', { id, name: p.name, ...metadataForm(p.metadata) });
    if (!made.ok) return (say(`failed  product ${id}: ${faultOf(made)}.`), false);
    say(`made    ${id}  the product ${p.name}`);
    return (productReady.add(id), true);
  };

  for (const want of wanted.prices) {
    const into = want.setting === null ? '' : `, for ${want.setting}`;
    const there = seen.get(want.lookup_key);
    if (there !== undefined) {
      const id = textAt(there, 'id');
      tally.ids[want.lookup_key] = id;
      const off = differs(there, want);
      if (off !== '') {
        tally.differ += 1;
        say(`differs ${id}  ${want.what}: ${off}. Left as it is; settle it in Stripe.`);
      } else {
        tally.found += 1;
        say(`found   ${id}  ${want.what}${into}`);
      }
      continue;
    }
    if (!(await ensureProduct(want.product))) {
      tally.failed += 1;
      continue;
    }
    const form = {
      product: want.product,
      currency: want.currency,
      unit_amount: want.cents,
      lookup_key: want.lookup_key,
      nickname: want.what,
      ...(want.interval === null ? {} : { 'recurring[interval]': want.interval }),
      ...metadataForm(want.metadata),
    };
    const made = await stripe.create('/v1/prices', form);
    if (!made.ok) {
      tally.failed += 1;
      say(`failed  ${want.what}: ${faultOf(made)}.`);
      continue;
    }
    const id = textAt(made.body, 'id');
    tally.ids[want.lookup_key] = id;
    tally.made += 1;
    say(`made    ${id}  ${want.what}${into}`);
  }

  for (const s of wanted.skipped) say(`skipped ${s.what}: ${s.why}`);
  say(`Made ${String(tally.made)}, found ${String(tally.found)}, ${String(tally.differ)} differ, ${String(tally.failed)} failed.`);
  return { ...tally, ok: tally.failed === 0 && tally.differ === 0 };
}

/**
 * The key, from standard input: piped in, or typed at a terminal with nothing echoed. Read to its first line and
 * trimmed; nothing else of standard input is kept.
 */
export async function keyFromStdin(stdin = process.stdin, prompt = (text) => process.stderr.write(text)) {
  if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
    prompt('Stripe key (nothing is shown as you type): ');
    stdin.setRawMode(true);
    /* CTRL-C IS GIVING UP, so what was typed before it is dropped and nothing is sent; a backspace takes one back. */
    let typed = '';
    try {
      read: for await (const chunk of stdin) {
        for (const c of String(chunk)) {
          if (c === '\u0003') return '';
          if (c === '\r' || c === '\n' || c === '\u0004') break read;
          typed = c === '\u007f' || c === '\b' ? typed.slice(0, -1) : typed + c;
        }
      }
    } finally {
      stdin.setRawMode(false);
      stdin.pause();
      prompt('\n');
    }
    return typed.trim();
  }
  let text = '';
  for await (const chunk of stdin) text += String(chunk);
  return (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '').trim();
}

/** The command: `--live-ok` alone is taken, and anything else is refused without being quoted. */
export async function main(argv, { stdin = process.stdin, say = (line) => console.log(line), send } = {}) {
  const extra = argv.filter((a) => a !== '--live-ok');
  if (extra.length > 0) {
    say('Only --live-ok is taken. The key is read from standard input, never from an argument: pbpaste | node tools/ops/stripe-setup.mjs. Nothing was made.');
    return 2;
  }
  const key = await keyFromStdin(stdin);
  if (key === '') {
    say('No key came on standard input. Pipe it in: pbpaste | node tools/ops/stripe-setup.mjs. Nothing was made.');
    return 2;
  }
  const done = await setup({ key, liveOk: argv.includes('--live-ok'), say, ...(send === undefined ? {} : { fetch: send }) });
  return done.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main(process.argv.slice(2));
