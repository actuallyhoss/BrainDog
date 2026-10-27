/**
 * The paid half of the drill: one stranger's paid life on a host in test mode.
 *
 *   node tools/drill/pay.mjs --host <origin> [--steps a,b]
 *
 * THE SAME WALK `apps/worker/test/billing-rehearsal.test.ts` TAKES against a fake Stripe, step for step and by the same
 * names (`PAY`): Free; Cloud bought on Stripe's Checkout page with the test Visa; the plan and the allowance move;
 * Cloud Plus confirmed on the portal and its 400 credits; a second person joins and the invoice still shows one seat; a
 * pack; a renewal on a failing card reads `past_due` and recovers; a cancel leaves the record read-only with its one
 * sentence; it is deleted. Then the events: each acted-on type Stripe sent was delivered, and the Worker's lines say so.
 *
 * PRODUCTION IS ALWAYS REFUSED, and so is any host whose `/healthz` does not say billing is in test mode, and a key in
 * the environment that is a live one. There is no flag that lets it pay for real.
 *
 * WHAT IT READS FROM THE ENVIRONMENT, BY NAME, AND NEVER PRINTS: the drill's names for the sign-up (`CANARY_MAIL_DOOR`,
 * `CANARY_INVITE_CODE`, `CANARY_INBOX_KEY` with `SMOKE_SLUG`, `DRILL_OPERATOR_KEY`) and the second person
 * (`DRILL_SECOND_ADDRESS`, `DRILL_SECOND_KEY`); `STRIPE_TEST_KEY`, a restricted test key that reads the sessions,
 * subscriptions, invoices and events and moves a subscription's card and period; `STRIPE_OLD_TEST_KEY`, the key pasted
 * on 28 September, which Stripe must refuse; and `PAY_LOG`, a file of the Worker's lines (`wrangler tail --format json`
 * written to it while the walk runs). Each one missing makes the steps that need it skip and say why.
 *
 * STRIPE'S PAGES ARE PRESSED BY A BROWSER (`browserBuyer`, Playwright, at 390 wide), finding each field by its label and
 * never by position; with no browser here those steps skip and say so. Stripe's test cards by their documented numbers.
 *
 * NOT RUN BY ANYTHING YET: alpha must be deployed with the test webhook secret and a new restricted test key, which is the
 * owner's half. Until then this runs against the rehearsal's fake in `pay.test.mjs` and nowhere else.
 */

import { readFile } from 'node:fs/promises';

import { PACKS, PLAN_TABLE } from '../../packages/record/src/plans.ts';
import { secondFrom, proofIn } from './ends.mjs';
import { drillFor, isProduction, lineOf, runDrill } from './run.mjs';
import { api, ask, fixOf, ok, red, skip } from './steps.mjs';

/** Every step, in the order the walk takes them. The rehearsal test's steps carry these names. */
export const PAY = ['mode', 'old-key', 'sign-in', 'free', 'upgrade', 'allowance', 'switch', 'invite', 'pack', 'extra', 'past-due', 'cancel', 'delete', 'events'];

/** Stripe's test cards (docs.stripe.com/testing), and the test payment methods Stripe's API takes for the same cards. */
export const CARDS = { visa: '4242424242424242', failsLater: '4000000000000341', declined: '4000000000000002' };
const METHODS = { visa: 'pm_card_visa', failsLater: 'pm_card_chargeCustomerFail' };

/** The environment's names this reads. Their values are never printed. */
export const NAMES = { key: 'STRIPE_TEST_KEY', oldKey: 'STRIPE_OLD_TEST_KEY', log: 'PAY_LOG' };

/** Why extra usage has no step to run. */
export const EXTRA_SKIPPED = 'extra usage (LCH-A11) needs a migration, which is the owner’s to make, so it is not built and there is nothing to run.';

/** Stripe's event types the webhook acts on (`ACTS` in `apps/worker/src/billing.ts`). */
export const ACTED = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'charge.refunded',
];

/** The two a live walk does not make: no bank debit and no refund. Rehearsed against the fake only. */
const NOT_LIVE = new Set(['checkout.session.async_payment_succeeded', 'charge.refunded']);

/** The one sentence a lapsed record answers every write with (`LAPSED_FIX` in `apps/worker/src/lapse.ts`). */
export const LAPSED_FIX = 'Read-only until billing resumes. Export is available.';

const LIVE_KEY = /^[sr]k_live_/u;

export const HELP = `node tools/drill/pay.mjs --host <origin> [--steps a,b]

One stranger's paid life on a host in test mode: Free, Cloud, Cloud Plus, a second person (teams are part of Plus), a pack,
a failed renewal and its recovery, a cancel, the delete, and every acted-on event delivered.
Steps, in order: ${PAY.join(', ')}.
Production is always refused, and so is a host whose billing is not in test mode.

Read from the environment by name, never printed: CANARY_MAIL_DOOR, CANARY_INVITE_CODE, CANARY_INBOX_KEY
with SMOKE_SLUG, DRILL_OPERATOR_KEY, DRILL_SECOND_ADDRESS, DRILL_SECOND_KEY, ${Object.values(NAMES).join(', ')}.`;

/** The command line read: `{ host, steps, help }`, or `{ wrong }` with the sentence that says what is wrong. */
export function argsOf(argv, env = process.env) {
  const out = { host: null, steps: PAY, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--host') out.host = argv[++i] ?? null;
    else if (a === '--steps') out.steps = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else return { wrong: `${a} is not something pay takes. Run it with --help.` };
  }
  if (out.help) return out;
  if (!out.host) return { wrong: 'pay needs --host <origin>.' };
  try {
    out.host = new URL(out.host).origin;
  } catch {
    return { wrong: `--host ${out.host} is not an origin, such as https://alpha.brain.dog.` };
  }
  const unknown = out.steps.filter((s) => !PAY.includes(s));
  if (unknown.length) return { wrong: `There is no step called ${unknown.join(', ')}. The steps are ${PAY.join(', ')}.` };
  if (out.steps.length === 0) return { wrong: '--steps names no step.' };
  if (isProduction(out.host)) return { wrong: `${new URL(out.host).hostname} is production. pay runs only on a host in test mode, and there is no flag that changes that.` };
  for (const name of [NAMES.key, NAMES.oldKey]) if (LIVE_KEY.test(String(env[name] ?? '').trim())) return { wrong: `${name} is a live key. pay uses test keys only.` };
  return out;
}

/** Cents as Stripe's invoice says them: `12.00`. */
export const dollars = (cents) => (Number(cents) / 100).toFixed(2);

/**
 * A walk on `host`: the drill it signs up with, the keys it reads, the browser that presses Stripe's pages, and what each
 * step leaves for the next (the record, the Checkout Session, the customer and subscription it made). A test hands in
 * its own `drill` and `second`, read through captured letters, where a host's are read from the canary's Inbox.
 */
export function payFor(host, env = process.env, { buyer = null, send = fetch, waitMs = 60_000, every = 2_000, now = () => Date.now(), drill = null, second = null } = {}) {
  const v = (k) => String(env?.[k] ?? '').trim() || null;
  const d = drill ?? drillFor(host, env, { send, waitMs });
  const p = { d, send, waitMs, every, now, buyer, key: v(NAMES.key), oldKey: v(NAMES.oldKey), log: v(NAMES.log), operatorKey: v('DRILL_OPERATOR_KEY') };
  Object.assign(p, { second: second ?? secondFrom(env, d.host), began: Math.floor(now() / 1000), record: null, session: null, customer: null, sub: null, joined: null, seen: [] });
  for (const secret of [p.key, p.oldKey, p.operatorKey]) if (secret) d.secrets.push(secret);
  if (p.second.address) d.secrets.push(p.second.address, ...(p.second.key ? [p.second.key] : []));
  return p;
}

/** One Stripe call with a key: `{ status, body }`, status 0 when Stripe did not answer. The key goes in the header only. */
export async function stripe(p, method, path, form = {}, key = p.key) {
  const q = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
  const url = `https://api.stripe.com${path}${method === 'GET' && q ? `?${q}` : ''}`;
  const headers = { authorization: `Bearer ${key}`, accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) };
  try {
    const res = await p.send(url, { method, headers, ...(method === 'POST' ? { body: q } : {}), redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

/** `read()` asked again every `p.every` until `done` holds of its answer or `p.waitMs` has passed. Answers the last one. */
async function until(p, read, done) {
  const end = p.now() + p.waitMs;
  let got = await read();
  while (!done(got) && p.now() < end) {
    await new Promise((r) => setTimeout(r, p.every));
    got = await read();
  }
  return got;
}

/** The walk's record as `GET /account/billing` lists it, or `null`. */
async function listed(p) {
  const out = await ask(p.d, '/account/billing', { method: 'GET' });
  const all = out.said?.value?.records ?? [];
  return all.find((r) => (p.record ? r.record === p.record : r.slug === p.d.made?.slug)) ?? null;
}

/** The sentence for a step that needs a signed-in stranger, a browser or the test key, or `null` when it has them. */
function wants(p, { buyer = false, key = false } = {}) {
  if (!p.d.cookie || !p.record) return 'no stranger is signed in with a record of their own.';
  if (buyer && !p.buyer?.pay) return p.buyer?.why ?? 'no browser here to press Stripe’s pages.';
  if (key && !p.key) return `${NAMES.key} is not set, so Stripe cannot be asked.`;
  return null;
}

const secs = (p) => Math.round(p.waitMs / 1000);

/* ── the steps ──────────────────────────────────────────────────────────── */

/**
 * `mode`: the host's `/healthz` says billing is in test mode. Anything else stops the walk. PRODUCTION AND A LIVE KEY
 * ARE REFUSED HERE TOO, before anything is asked, for a caller that hands `payFor` a host without `argsOf` (the
 * drill's `--pay`, which has a `--live` of its own).
 */
async function mode(p) {
  if (isProduction(p.d.host)) return red(p.d, 'mode', `${new URL(p.d.host).hostname} is production, and pay runs only on a host in test mode, so nothing else runs.`);
  if ([p.key, p.oldKey].some((k) => k && LIVE_KEY.test(k))) return red(p.d, 'mode', 'a key pay was given is a live one, and pay uses test keys only, so nothing else runs.');
  const h = await ask(p.d, '/healthz', { method: 'GET', cookie: null });
  const billing = h.said?.launch?.billing ?? null;
  if (billing !== 'test') return red(p.d, 'mode', `billing on this host is ${billing ?? 'not said'}, and pay runs only where it is test, so nothing else runs.`);
  return ok(p.d, 'mode', 'billing on this host is in test mode, so no card is charged.');
}

/** `old-key`: the key pasted on 28 September no longer opens Stripe, by a call that must be refused. */
async function oldKey(p) {
  if (!p.oldKey) return skip(p.d, 'old-key', `${NAMES.oldKey} is not set, so whether the pasted key was rolled cannot be asked.`);
  const out = await stripe(p, 'GET', '/v1/balance', {}, p.oldKey);
  if (out.status === 401) return ok(p.d, 'old-key', 'Stripe refused the key pasted on 28 September, so it was rolled.');
  if (out.status === 200) return red(p.d, 'old-key', 'Stripe still takes the key pasted on 28 September. Roll it in Stripe’s dashboard.');
  return red(p.d, 'old-key', `Stripe answered ${out.status} for the old key, which says neither that it was rolled nor that it was not.`);
}

/** `sign-in`: the drill's own sign-up (`signup`, `mail`, `verify-build`), which leaves a stranger signed in on Free. */
async function signIn(p) {
  if (!p.d.address) return skip(p.d, 'sign-in', 'CANARY_MAIL_DOOR is not set, so no stranger signs up.');
  const steps = await runDrill(p.d, { steps: ['signup', 'mail', 'verify-build'], sweepWith: { operatorKey: p.operatorKey } });
  const stuck = steps.find((r) => !r.pass || r.skipped);
  if (!p.d.cookie || !p.d.made) return stuck?.skipped ? skip(p.d, 'sign-in', stuck.said.replace(/^skipped: /u, '')) : red(p.d, 'sign-in', stuck?.said ?? 'the sign-up left nobody signed in.');
  p.record = (await listed(p))?.record ?? null;
  if (!p.record) return red(p.d, 'sign-in', `signed in, and ${p.d.made.slug} is not among the records billing lists.`);
  return ok(p.d, 'sign-in', `a stranger signed up and is in ${p.d.made.slug}.`);
}

/** `free`: the new record is on Free and nothing is billed. */
async function free(p) {
  const why = wants(p);
  if (why) return skip(p.d, 'free', why);
  const r = await listed(p);
  if (r?.plan !== 'free' || r?.state !== 'unbilled') return red(p.d, 'free', `the new record is on ${r?.plan ?? 'no plan'}, ${r?.state ?? 'not listed'}, where it must be on Free with nothing billed.`);
  return ok(p.d, 'free', `the new record is on Free at ${r.price}, with nothing billed.`);
}

/** `upgrade`: Cloud bought from Settings on Stripe's own Checkout page with the test Visa; the record moves to it. */
async function upgrade(p) {
  const why = wants(p, { buyer: true });
  if (why) return skip(p.d, 'upgrade', why);
  const out = await ask(p.d, '/account/billing/checkout', { body: { record: p.record, plan: 'cloud' } });
  const url = String(out.said?.value?.url ?? '');
  if (url === '') return red(p.d, 'upgrade', `no payment page was opened: ${fixOf(out)}.`);
  const session = /^https:\/\/checkout\.stripe\.com\/.*?(cs_test_[A-Za-z0-9]+)/u.exec(url)?.[1];
  if (!session) return red(p.d, 'upgrade', 'the payment page is not a Stripe test page, so nothing was paid.');
  p.session = session;
  await p.buyer.pay(url, { card: CARDS.visa });
  const r = await until(p, () => listed(p), (x) => x?.plan === 'cloud' && x?.state === 'active');
  if (r?.plan !== 'cloud' || r?.state !== 'active') return red(p.d, 'upgrade', `paid with the test Visa, and in ${secs(p)} seconds the record had not moved to Cloud: it is ${r?.plan ?? 'unlisted'}, ${r?.state ?? 'unlisted'}.`);
  if (p.key) {
    const s = await stripe(p, 'GET', `/v1/checkout/sessions/${session}`);
    p.customer = typeof s.body?.customer === 'string' ? s.body.customer : null;
    p.sub = typeof s.body?.subscription === 'string' ? s.body.subscription : null;
  }
  return ok(p.d, 'upgrade', `paid with the test Visa on Stripe’s page; the record is on ${PLAN_TABLE.hosted.name} at ${r.price}, active.`);
}

/** The record's month as `GET /account/usage` answers it, today. */
async function month(p) {
  const day = new Date(p.now()).toISOString().slice(0, 10);
  const out = await ask(p.d, `/account/usage?from=${day}&to=${day}`, { method: 'GET' });
  return (out.said?.value?.records ?? []).find((r) => r.record === p.record) ?? null;
}

/** `allowance`: the month's allowance and Slash credits are Cloud's now. */
async function allowance(p) {
  const why = wants(p);
  if (why) return skip(p.d, 'allowance', why);
  const m = await month(p);
  const want = PLAN_TABLE.hosted;
  if (m?.slash?.included !== want.credits || m?.month?.allowance?.runs !== want.allowance.runs)
    return red(p.d, 'allowance', `the month reads ${m?.slash?.included ?? 'no'} Slash credits and ${m?.month?.allowance?.runs ?? 'no'} runs, where Cloud’s are ${want.credits} and ${want.allowance.runs}.`);
  return ok(p.d, 'allowance', `the month moved with the plan: ${want.credits} Slash credits and ${want.allowance.runs} runs.`);
}

/** The invitation's token from the answer `invite` gives (as `ends.mjs` reads it). */
const tokenOf = (v) => (typeof v?.token === 'string' && v.token !== '' ? v.token : (/\/invite#([^&\s]+)/u.exec(String(v?.link ?? ''))?.[1] ?? null));

/** `invite`: Teams are part of Cloud Plus, so this comes after `switch`. A second address is invited and joins; the invoice still shows one seat, colleagues being free. */
async function invite(p) {
  const why = wants(p) ?? p.second.why ?? null;
  if (why) return skip(p.d, 'invite', why);
  const invited = await api(p.d, 'invite', { email: p.second.address, level: 'write' });
  const token = tokenOf(invited.said?.value);
  if (invited.said?.ok !== true || token === null) return red(p.d, 'invite', `no invitation was made: ${fixOf(invited)}.`);
  p.d.secrets.push(token);
  const s = { ...p.d, address: p.second.address, cookie: null, secrets: p.d.secrets };
  const mark = await p.second.mail.mark();
  const asked = await ask(s, '/auth/invite', { body: { inviteToken: token, accept: true, name: 'Marlo Quince' }, cookie: null });
  if (asked.status !== 202) return red(p.d, 'invite', `opening the invitation answered ${asked.status}: ${fixOf(asked)}.`);
  const proof = proofIn(await p.second.mail.next(mark, { to: p.second.address, ms: p.waitMs }), token);
  if (proof === null) return red(p.d, 'invite', `no letter proving the second address came within ${secs(p)} seconds.`);
  p.d.secrets.push(proof);
  const joined = await ask(s, '/auth/invite', { body: { inviteToken: token, accept: true, proof, name: 'Marlo Quince' }, cookie: null });
  if (!joined.cookie) return red(p.d, 'invite', `the second person was not let in: ${fixOf(joined)}.`);
  p.d.secrets.push(joined.cookie);
  p.joined = { ...s, cookie: joined.cookie };
  if (!p.key || !p.sub) return ok(p.d, 'invite', `a second person joined; the invoice was not read, since ${p.key ? 'the subscription is not known' : `${NAMES.key} is not set`}.`);
  const inv = (await stripe(p, 'GET', '/v1/invoices', { subscription: p.sub, limit: 1 })).body?.data?.[0];
  const lines = inv?.lines?.data ?? [];
  const seats = lines.reduce((n, l) => n + Number(l?.quantity ?? 0), 0);
  if (seats !== 1) return red(p.d, 'invite', `a second person joined, and the invoice shows ${seats} seats where colleagues are free.`);
  return ok(p.d, 'invite', `a second person joined, and the invoice still shows one seat at ${dollars(inv.amount_paid)}.`);
}

/** `switch`: Cloud Plus confirmed on Stripe's portal; the plan and its 400 credits follow. */
async function change(p) {
  const why = wants(p, { buyer: true });
  if (why) return skip(p.d, 'switch', why);
  const out = await ask(p.d, '/account/billing/portal', { body: { record: p.record, plan: 'plus' } });
  const url = String(out.said?.value?.url ?? '');
  if (!url.startsWith('https://billing.stripe.com/')) return red(p.d, 'switch', `no portal page was opened: ${fixOf(out)}.`);
  await p.buyer.confirm(url);
  const r = await until(p, () => listed(p), (x) => x?.plan === 'plus');
  if (r?.plan !== 'plus') return red(p.d, 'switch', `the switch was confirmed, and in ${secs(p)} seconds the record had not moved to ${PLAN_TABLE.plus.name}.`);
  const m = await month(p);
  if (m?.slash?.included !== PLAN_TABLE.plus.credits) return red(p.d, 'switch', `on ${PLAN_TABLE.plus.name} the month reads ${m?.slash?.included ?? 'no'} Slash credits, where it is ${PLAN_TABLE.plus.credits}.`);
  return ok(p.d, 'switch', `confirmed on Stripe’s portal; the record is on ${PLAN_TABLE.plus.name} at ${r.price}, with ${PLAN_TABLE.plus.credits} Slash credits.`);
}

/** `pack`: 100 Slash credits bought with the test Visa; the record says them. */
async function pack(p) {
  const why = wants(p, { buyer: true });
  if (why) return skip(p.d, 'pack', why);
  const small = PACKS.find((k) => k.id === 'credits-100');
  const out = await ask(p.d, '/account/billing/checkout', { body: { record: p.record, pack: 'credits-100' } });
  const url = String(out.said?.value?.url ?? '');
  if (!/^https:\/\/checkout\.stripe\.com\/.*cs_test_/u.test(url)) return red(p.d, 'pack', `no test payment page was opened for the pack: ${fixOf(out)}.`);
  const before = (await listed(p))?.credits ?? 0;
  await p.buyer.pay(url, { card: CARDS.visa });
  const r = await until(p, () => listed(p), (x) => (x?.credits ?? 0) >= before + small.credits);
  if ((r?.credits ?? 0) < before + small.credits) return red(p.d, 'pack', `paid ${dollars(small.cents)} for ${small.credits} credits, and in ${secs(p)} seconds the record says ${r?.credits ?? 0}.`);
  return ok(p.d, 'pack', `paid ${dollars(small.cents)} with the test Visa; the record has ${r.credits} pack credits.`);
}

/** `extra`: listed, and skipped with its sentence. */
const extra = async (p) => skip(p.d, 'extra', EXTRA_SKIPPED);

/** The customer's card moved to one of Stripe's test payment methods, made the subscription's own. `true` when Stripe took it. */
async function cardOn(p, method) {
  const pm = await stripe(p, 'POST', `/v1/payment_methods/${method}/attach`, { customer: p.customer });
  if (pm.status !== 200 || typeof pm.body?.id !== 'string') return false;
  return (await stripe(p, 'POST', `/v1/subscriptions/${p.sub}`, { default_payment_method: pm.body.id })).status === 200;
}

/**
 * `past-due`: the card becomes Stripe's failing test card and the period is renewed now, so the renewal fails and the
 * record reads `past_due`, still writable; then the test Visa, the open invoice paid, and it is active again.
 */
async function pastDue(p) {
  const why = wants(p, { key: true }) ?? (p.sub && p.customer ? null : 'the upgrade did not run, so there is no subscription to renew.');
  if (why) return skip(p.d, 'past-due', why);
  if (!(await cardOn(p, METHODS.failsLater))) return red(p.d, 'past-due', `Stripe would not put the failing test card (${CARDS.failsLater.slice(-4)}) on the subscription.`);
  await stripe(p, 'POST', `/v1/subscriptions/${p.sub}`, { billing_cycle_anchor: 'now', proration_behavior: 'none' });
  const due = await until(p, () => listed(p), (x) => x?.state === 'past_due');
  if (due?.state !== 'past_due') return red(p.d, 'past-due', `the renewal on the failing card did not read past_due in ${secs(p)} seconds: it is ${due?.state ?? 'unlisted'}.`);
  if (!(await cardOn(p, METHODS.visa))) return red(p.d, 'past-due', 'Stripe would not put the test Visa back on the subscription.');
  const open = (await stripe(p, 'GET', '/v1/invoices', { subscription: p.sub, status: 'open', limit: 1 })).body?.data?.[0];
  if (open?.id) await stripe(p, 'POST', `/v1/invoices/${open.id}/pay`);
  const back = await until(p, () => listed(p), (x) => x?.state === 'active');
  if (back?.state !== 'active') return red(p.d, 'past-due', `it read past_due, and with the test Visa back it was not active again in ${secs(p)} seconds.`);
  return ok(p.d, 'past-due', `the renewal on the failing card read past_due, and with the test Visa it is active again${open ? ` after ${dollars(open.amount_due)} was paid` : ''}.`);
}

/**
 * `cancel`: the subscription ended. With two people on the record it is read-only and every write answers the one
 * sentence; with one, it is back on Free and writable. Ended now through Stripe: a period's end cannot be waited for.
 */
async function cancel(p) {
  const why = wants(p, { key: true }) ?? (p.sub ? null : 'the upgrade did not run, so there is no subscription to cancel.');
  if (why) return skip(p.d, 'cancel', why);
  const ended = await stripe(p, 'DELETE', `/v1/subscriptions/${p.sub}`);
  if (ended.status !== 200) return red(p.d, 'cancel', `Stripe did not cancel the subscription: it answered ${ended.status}.`);
  const two = p.joined !== null;
  const r = await until(p, () => listed(p), (x) => (two ? x?.state === 'lapsed' : x?.plan === 'free'));
  if (!two) return r?.plan === 'free' ? ok(p.d, 'cancel', 'cancelled with one person on it, the record is back on Free and writable.') : red(p.d, 'cancel', `cancelled with one person on it, the record is ${r?.plan ?? 'unlisted'}, ${r?.state ?? 'unlisted'}, where it goes back to Free.`);
  if (r?.state !== 'lapsed') return red(p.d, 'cancel', `cancelled with two people on it, the record is ${r?.state ?? 'unlisted'} in ${secs(p)} seconds, where it is read-only.`);
  const write = await api(p.d, 'create', { register: 'notes', fields: { what: 'A note after the cancel' } });
  const fix = write.said?.refusal?.fix ?? '';
  if (fix !== LAPSED_FIX) return red(p.d, 'cancel', `it lapsed, and a write answered “${fix || fixOf(write)}” where it is “${LAPSED_FIX}”`);
  return ok(p.d, 'cancel', `cancelled with two people on it, the record is read-only: “${LAPSED_FIX}”`);
}

/** `delete`: the owner deletes the record by its name, and the second person's account is closed for the next run. */
async function remove(p) {
  const why = wants(p);
  if (why) return skip(p.d, 'delete', why);
  const gone = await api(p.d, 'deleteRecord', { slug: p.d.made.slug });
  if (p.joined) await ask(p.joined, '/account/close', { body: { email: p.second.address } });
  if (gone.said?.ok !== true) return red(p.d, 'delete', `the record was not deleted: “${fixOf(gone)}”`);
  if (await listed(p)) return red(p.d, 'delete', 'the record was said to be deleted and billing still lists it.');
  return ok(p.d, 'delete', `${p.d.made.slug} was deleted by its name, and billing no longer lists it.`);
}

/**
 * The acted-on types the Worker's lines in `PAY_LOG` say were applied: `op: 'billing'`, the webhook, `ok: true`. The
 * lines as the Worker writes them, or as `wrangler tail --format json` quotes them inside its own JSON.
 */
export function appliedIn(text) {
  const out = new Set();
  for (const m of String(text).replace(/\\"/gu, '"').matchAll(/\{[^{}]*"op":"billing"[^{}]*\}/gu)) {
    let line = null;
    try {
      line = JSON.parse(m[0]);
    } catch {
      line = null;
    }
    if (line?.door === 'webhook' && line.ok === true && ACTED.includes(line.event)) out.add(line.event);
  }
  return out;
}

/**
 * `events`: every acted-on event Stripe sent for this walk's customer was delivered (`pending_webhooks` is 0), and the
 * Worker's lines in `PAY_LOG` say each type was applied. The two a live walk does not make are named, not missed.
 */
async function events(p) {
  const why = wants(p, { key: true }) ?? (p.customer ? null : 'the upgrade did not run, so no event is this walk’s.');
  if (why) return skip(p.d, 'events', why);
  const got = await stripe(p, 'GET', '/v1/events', { 'created[gte]': p.began, limit: 100 });
  const ours = (got.body?.data ?? []).filter((e) => ACTED.includes(e?.type) && JSON.stringify(e?.data?.object ?? {}).includes(p.customer));
  const waiting = ours.filter((e) => Number(e?.pending_webhooks ?? 0) > 0).map((e) => e.type);
  if (waiting.length) return red(p.d, 'events', `Stripe has not delivered ${[...new Set(waiting)].join(', ')} to the host yet.`);
  const sent = new Set(ours.map((e) => e.type));
  const missing = ACTED.filter((t) => !NOT_LIVE.has(t) && !sent.has(t));
  if (missing.length) return red(p.d, 'events', `Stripe sent no ${missing.join(', ')} in the walk.`);
  const walked = `Stripe delivered ${[...sent].join(', ')}; ${[...NOT_LIVE].join(' and ')} are rehearsed against the fake only`;
  if (!p.log) return ok(p.d, 'events', `${walked}. The Worker’s lines were not read: ${NAMES.log} is not set.`);
  let text = '';
  try {
    text = await readFile(p.log, 'utf8');
  } catch {
    return red(p.d, 'events', `${walked}, and ${NAMES.log} names no file that can be read.`);
  }
  const applied = appliedIn(text);
  const unsaid = [...sent].filter((t) => !applied.has(t));
  if (unsaid.length) return red(p.d, 'events', `${walked}, and no billing line says ${unsaid.join(', ')} was applied.`);
  return ok(p.d, 'events', `${walked}; the Worker’s billing lines say each was applied.`);
}

/** Each step by its name in `PAY`. */
export const STEPS = { mode, 'old-key': oldKey, 'sign-in': signIn, free, upgrade, allowance, invite, switch: change, pack, extra, 'past-due': pastDue, cancel, delete: remove, events };

/**
 * Run `steps` of walk `p` in `PAY`'s order, saying each as it ends. A step that throws is red in a sentence that holds no
 * value. A `mode` that is not green stops the walk: every step after it skips and says so.
 */
export async function runPay(p, { steps = PAY, say = () => {} } = {}) {
  const results = [];
  let stopped = null;
  for (const name of PAY.filter((s) => steps.includes(s) || s === 'mode')) {
    let r;
    if (stopped) r = skip(p.d, name, stopped);
    else
      try {
        r = await STEPS[name](p);
      } catch (e) {
        r = red(p.d, name, `stopped: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}`);
      }
    if (name === 'mode' && (!r.pass || r.skipped)) stopped = 'the host is not in test mode, so nothing is paid on it.';
    results.push(r);
    say(lineOf(r));
  }
  return results;
}

/**
 * Stripe's pages pressed by a browser at 390 wide, each field found by its label and each button by its words, never by
 * position: `{ pay, confirm }`, or `{ why }` when there is no browser here. The card is typed as Stripe's test card
 * number, any date to come and any three digits.
 */
export async function browserBuyer() {
  let pw;
  try {
    pw = await import('playwright');
  } catch {
    return { why: 'no browser here (Playwright is not installed), so Stripe’s pages cannot be pressed.' };
  }
  const onPage = async (url, act) => {
    const browser = await pw.chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(url);
      await act(page);
      await page.waitForURL((u) => !/^https:\/\/(checkout|billing)\.stripe\.com\//u.test(u.href), { timeout: 60_000 });
    } finally {
      await browser.close();
    }
  };
  return {
    pay: (url, how) =>
      onPage(url, async (page) => {
        await page.getByLabel(/card number/iu).fill(how.card);
        await page.getByLabel(/expiration/iu).fill('12 / 34');
        await page.getByLabel(/cvc/iu).fill('123');
        const name = page.getByLabel(/cardholder name|name on card/iu);
        if (await name.count()) await name.fill('Wren Hollis');
        const zip = page.getByLabel(/zip|postal/iu);
        if (await zip.count()) await zip.fill('10001');
        await page.getByRole('button', { name: /subscribe|pay/iu }).click();
      }),
    confirm: (url) => onPage(url, (page) => page.getByRole('button', { name: /confirm/iu }).click()),
  };
}

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
  const p = payFor(args.host, env, { buyer: await browserBuyer() });
  console.log(`Pay, on ${new URL(args.host).hostname}:`);
  const results = await runPay(p, { steps: args.steps, say: (l) => console.log(l) });
  return results.some((r) => !r.pass) ? 1 : 0;
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`Pay stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
