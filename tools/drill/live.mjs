/**
 * One real payment on production, undone: a charge on the person's own card, refunded in full, the subscription ended.
 *
 *   node tools/drill/live.mjs --live --host <production origin>
 *
 * THE ONE PROOF A TEST-MODE WALK CANNOT GIVE: that live Checkout takes a real card, the live webhook moves the record to
 * Cloud, and a refund and a cancel bring it back. The drill signs a stranger up as `run.mjs` does, opens Cloud's
 * Checkout for that record and prints its page; the person pays on it with their own card. Once the record reads paid,
 * the payment is refunded in full and the subscription cancelled now, and the record must read back on Free (or
 * read-only, where billing's rules say so) with the refund succeeded. Then the record is deleted.
 *
 * REFUSED without `--live`, without `STRIPE_LIVE_KEY`, with a key in it that is not a live one, and on a host whose
 * `/healthz` does not say billing is live. Past that one read, nothing is asked of Stripe or the host until the person
 * types `yes`.
 *
 * WHAT IT READS FROM THE ENVIRONMENT, BY NAME, AND NEVER PRINTS: `STRIPE_LIVE_KEY`, a live key that reads the session,
 * subscription and invoice, refunds a payment and cancels a subscription; and the drill's names for the sign-up
 * (`CANARY_MAIL_DOOR`, `CANARY_INVITE_CODE`, `CANARY_INBOX_KEY` with `SMOKE_SLUG`, `DRILL_OPERATOR_KEY`).
 *
 * EVERY FAILURE AFTER THE PAYMENT SAYS THE ONE STEP LEFT TO DO BY HAND, in Stripe's dashboard.
 */

import { createInterface } from 'node:readline/promises';

import { PLAN_TABLE } from '../../packages/record/src/plans.ts';
import { dollars, listed, stripe, until } from './pay.mjs';
import { drillFor, lineOf, runDrill } from './run.mjs';
import { api, ask, fixOf, ok, red } from './steps.mjs';

/** The environment's name for the live key. Its value is never printed. */
export const KEY = 'STRIPE_LIVE_KEY';

const LIVE_KEY = /^[sr]k_live_/u;

/** How long the person has to pay on Stripe's page. */
export const PAY_MS = 15 * 60_000;

const CLOUD = PLAN_TABLE.hosted;

/** What is left to do by hand, by how far the drill got. */
const BY_HAND = {
  refund: 'refund it in the Stripe dashboard: Payments > the charge > Refund, then Subscriptions > the subscription > Cancel immediately.',
  cancel: 'cancel it in the Stripe dashboard: Subscriptions > the subscription > Cancel immediately. The refund was made.',
  settle: 'check it in the Stripe dashboard: Payments > the charge reads Refunded, and the subscription reads Canceled.',
};

export const HELP = `node tools/drill/live.mjs --live --host <production origin>

One real charge on your own card for ${CLOUD.name} at ${CLOUD.price.month} a month, refunded in full right after, then the
subscription cancelled, on a host whose billing is live. It asks you to type yes before anything is done.

  --host <origin>   the production host, such as https://brain.dog
  --live            required: this charges a real card

Read from the environment by name, never printed: ${KEY}, CANARY_MAIL_DOOR, CANARY_INVITE_CODE,
CANARY_INBOX_KEY with SMOKE_SLUG, DRILL_OPERATOR_KEY.`;

/** The command line read: `{ host, live, help }`, or `{ wrong }` with the sentence that says what is wrong. */
export function argsOf(argv, env = process.env) {
  const out = { host: null, live: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--live') out.live = true;
    else if (a === '--host') out.host = argv[++i] ?? null;
    else return { wrong: `${a} is not something live takes. Run it with --help.` };
  }
  if (out.help) return out;
  if (!out.live) return { wrong: 'live charges a real card, so it runs only with --live.' };
  if (!out.host) return { wrong: 'live needs --host <origin>.' };
  try {
    out.host = new URL(out.host).origin;
  } catch {
    return { wrong: `--host ${out.host} is not an origin, such as https://brain.dog.` };
  }
  const key = String(env[KEY] ?? '').trim();
  if (key === '') return { wrong: `${KEY} is not set, so a payment could not be refunded. Nothing was done.` };
  if (!LIVE_KEY.test(key)) return { wrong: `${KEY} is not a live key. live refunds a real payment, so it needs one.` };
  return out;
}

/** A live run on `host`: the drill it signs up with, the live key, and what each step leaves for the next. */
export function liveFor(host, env = process.env, { send = fetch, every = 5_000, now = () => Date.now() } = {}) {
  const d = drillFor(host, env, { send });
  const key = String(env[KEY] ?? '').trim();
  d.secrets.push(key);
  const operatorKey = String(env.DRILL_OPERATOR_KEY ?? '').trim() || null;
  if (operatorKey) d.secrets.push(operatorKey);
  return { d, send, key, every, now, waitMs: 120_000, operatorKey, record: null, session: null, sub: null, invoice: null, refund: null };
}

/** `red` with the step left to do by hand. */
const stuck = (L, name, said, left) => red(L.d, name, `${said} By hand: ${BY_HAND[left]}`);

/** `mode`: the host's `/healthz` says billing is live. */
async function mode(L) {
  const h = await ask(L.d, '/healthz', { method: 'GET', cookie: null });
  const billing = h.said?.launch?.billing ?? null;
  if (billing !== 'live') return red(L.d, 'mode', `billing on this host is ${billing ?? 'not said'}, and live runs only where it is live. Nothing was done.`);
  return ok(L.d, 'mode', 'billing on this host is live.');
}

/** `sign-in`: the drill's own sign-up, which leaves a stranger signed in on Free. */
async function signIn(L) {
  const steps = await runDrill(L.d, { steps: ['signup', 'mail', 'verify-build'], sweepWith: { operatorKey: L.operatorKey } });
  if (!L.d.cookie || !L.d.made) return red(L.d, 'sign-in', steps.find((r) => !r.pass || r.skipped)?.said ?? 'the sign-up left nobody signed in.');
  L.record = (await listed(L))?.record ?? null;
  if (!L.record) return red(L.d, 'sign-in', `signed in, and ${L.d.made.slug} is not among the records billing lists.`);
  return ok(L.d, 'sign-in', `a stranger signed up and is in ${L.d.made.slug}, on Free.`);
}

/** `paid`: Cloud's live Checkout opened and printed; the person pays; the record reads Cloud and active. */
async function paid(L) {
  const out = await ask(L.d, '/account/billing/checkout', { body: { record: L.record, plan: 'cloud' } });
  const url = String(out.said?.value?.url ?? '');
  L.session = /^https:\/\/checkout\.stripe\.com\/.*?(cs_live_[A-Za-z0-9]+)/u.exec(url)?.[1] ?? null;
  if (!L.session) return red(L.d, 'paid', `no live payment page was opened: ${fixOf(out)}. Nothing was charged.`);
  console.log(`\n  Pay here with your own card, within ${PAY_MS / 60_000} minutes:\n\n  ${url}\n`);
  const r = await until({ ...L, waitMs: PAY_MS }, () => listed(L), (x) => x?.plan === 'cloud' && x?.state === 'active');
  if (r?.plan !== 'cloud' || r?.state !== 'active') return red(L.d, 'paid', `in ${PAY_MS / 60_000} minutes the record did not read paid on ${CLOUD.name}: it is ${r?.plan ?? 'unlisted'}, ${r?.state ?? 'unlisted'}. If you paid after all, ${BY_HAND.refund}`);
  const s = await stripe(L, 'GET', `/v1/checkout/sessions/${L.session}`);
  L.sub = typeof s.body?.subscription === 'string' ? s.body.subscription : null;
  if (!L.sub) return stuck(L, 'paid', `the record reads ${CLOUD.name}, and Stripe did not say the session's subscription (${s.status}).`, 'refund');
  return ok(L.d, 'paid', `paid on Stripe's live page; the record is on ${CLOUD.name} at ${r.price}, active.`);
}

/** The payment an invoice was paid by, as Stripe's refund takes it: `{ charge }` or `{ payment_intent }`, or null. */
async function paymentOf(L, inv) {
  if (typeof inv?.charge === 'string') return { charge: inv.charge };
  if (typeof inv?.payment_intent === 'string') return { payment_intent: inv.payment_intent };
  /* NEWER API VERSIONS KEEP THE PAYMENT ON THE INVOICE'S PAYMENTS, not on the invoice. */
  const pay = (await stripe(L, 'GET', '/v1/invoice_payments', { invoice: inv.id, limit: 1 })).body?.data?.[0]?.payment ?? null;
  if (typeof pay?.charge === 'string') return { charge: pay.charge };
  if (typeof pay?.payment_intent === 'string') return { payment_intent: pay.payment_intent };
  return null;
}

/** `refund`: the subscription's latest invoice's payment refunded in full, once, by its idempotency key. */
async function refund(L) {
  const sub = (await stripe(L, 'GET', `/v1/subscriptions/${L.sub}`)).body;
  const id = typeof sub?.latest_invoice === 'string' ? sub.latest_invoice : (sub?.latest_invoice?.id ?? null);
  const inv = id ? (await stripe(L, 'GET', `/v1/invoices/${id}`)).body : null;
  const payment = inv?.id ? await paymentOf(L, inv) : null;
  if (!payment) return stuck(L, 'refund', 'Stripe did not say which payment paid the subscription.', 'refund');
  L.invoice = inv;
  const what = payment.charge ?? payment.payment_intent;
  const out = await stripe(L, 'POST', '/v1/refunds', { ...payment, reason: 'requested_by_customer' }, L.key, { 'idempotency-key': `drill-live-refund-${what}` });
  if (out.status !== 200 || typeof out.body?.id !== 'string') return stuck(L, 'refund', `Stripe did not make the refund: it answered ${out.status}${out.body?.error?.code ? `, ${out.body.error.code}` : ''}.`, 'refund');
  L.refund = out.body;
  return ok(L.d, 'refund', `${dollars(out.body.amount)} of ${dollars(inv.amount_paid)} refunded, ${out.body.status}.`);
}

/** `cancel`: the subscription cancelled now, not at the period's end. */
async function cancel(L) {
  const out = await stripe(L, 'DELETE', `/v1/subscriptions/${L.sub}`);
  if (out.status !== 200 || out.body?.status !== 'canceled') return stuck(L, 'cancel', `Stripe did not cancel the subscription: it answered ${out.status}.`, 'cancel');
  return ok(L.d, 'cancel', 'the subscription is cancelled.');
}

/** `settled`: the record reads back on Free, or read-only, and the refund reads succeeded. */
async function settled(L) {
  const r = await until(L, () => listed(L), (x) => x?.plan === 'free' || x?.state === 'lapsed');
  if (r?.plan !== 'free' && r?.state !== 'lapsed') return stuck(L, 'settled', `in ${L.waitMs / 1000} seconds the record still reads ${r?.plan ?? 'unlisted'}, ${r?.state ?? 'unlisted'}, where it goes back to Free.`, 'settle');
  const back = await until(L, () => stripe(L, 'GET', `/v1/refunds/${L.refund.id}`), (x) => x.body?.status === 'succeeded' || x.body?.status === 'failed');
  if (back.body?.status !== 'succeeded') return stuck(L, 'settled', `the record is back, and the refund reads ${back.body?.status ?? 'nothing'}.`, 'settle');
  if (back.body.amount !== L.invoice.amount_paid) return stuck(L, 'settled', `the refund is ${dollars(back.body.amount)} where ${dollars(L.invoice.amount_paid)} was paid.`, 'settle');
  return ok(L.d, 'settled', `the record reads ${r.plan === 'free' ? 'Free' : 'read-only'} again, and the full ${dollars(back.body.amount)} refund succeeded.`);
}

/** `delete`: the drill's record deleted by its name. Stripe is settled by now. */
async function remove(L) {
  const gone = await api(L.d, 'deleteRecord', { slug: L.d.made.slug });
  if (gone.said?.ok !== true) return red(L.d, 'delete', `the record was not deleted: “${fixOf(gone)}” Stripe is settled; delete ${L.d.made.slug} from Settings.`);
  return ok(L.d, 'delete', `${L.d.made.slug} was deleted.`);
}

/** The steps after `yes`, in order. The first red stops the run. */
export const STEPS = { 'sign-in': signIn, paid, refund, cancel, settled, delete: remove };

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = argsOf(argv, env);
  if (args.wrong) {
    console.error(args.wrong);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const L = liveFor(args.host, env);
  const m = await mode(L);
  console.log(lineOf(m));
  if (!m.pass) return 1;
  console.log(`\nOn ${new URL(args.host).hostname}, a new drill record buys ${CLOUD.name} at ${CLOUD.price.month} a month:`);
  console.log('one real charge on your own card, refunded in full right after, then the subscription cancelled.');
  console.log('The record is deleted at the end.\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const said = (await rl.question('Type yes to go on: ')).trim();
  rl.close();
  if (said !== 'yes') {
    console.log('Nothing was done.');
    return 0;
  }
  for (const [name, step] of Object.entries(STEPS)) {
    let r;
    try {
      r = await step(L);
    } catch (e) {
      r = red(L.d, name, `stopped: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}.${L.session ? ' Check the Stripe dashboard: refund the charge and cancel the subscription if either is left.' : ''}`);
    }
    console.log(lineOf(r));
    if (!r.pass) return 1;
  }
  return 0;
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`Live stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
