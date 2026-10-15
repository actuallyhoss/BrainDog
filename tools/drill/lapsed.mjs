/**
 * The drill's lapse step: a record whose billing lapsed still exports, still reads, and refuses a write in the lapse's
 * own sentence; then billing resumes and a write goes through again (LCH-C04, RQ-LCH-314,
 * `loop/scope/area-launch-c.md:472-535`; "and a restore drill of his backup", D40.66). The promise a lapse makes is that a
 * person who stopped paying keeps their way out, and this step proves it on every run that asks for it, not only in a
 * unit test (`apps/worker/test/billing-packs.test.ts`).
 *
 * THE LAPSE GOES THROUGH THE HOST'S OWN DOOR, Stripe's webhook, signed as Stripe signs it, IN TEST MODE ONLY. A Free
 * record has no billing row and nothing caps it (`apps/worker/src/lapse.ts`), so the drill sends what Stripe sends when
 * a Free record is paid for (`checkout.session.completed`, naming the drill's own record and person) with a subscription
 * Stripe reads as cancelled: the host writes the row lapsed and flips the record's switch. Billing resumes by
 * `invoice.paid` for the same subscription, which the host applies without asking Stripe anything.
 *
 * WHAT IT NEEDS, READ BY NAME AND NEVER PRINTED (`lapseFrom`): `DRILL_LAPSE_SECRET`, the host's webhook signing secret in
 * test mode, and `DRILL_LAPSE_SUBSCRIPTION`, a subscription in the same Stripe test account that is cancelled (the host
 * reads it from Stripe before it writes the row, so a made-up one is refused there). On the Cloud harness both are made
 * up and Stripe is answered by the test. A host whose `/healthz` does not say `billing: test` is never sent an event.
 *
 * THE RECORD IS LEFT WRITABLE. Whatever went wrong after the lapse, the step resumes billing before it answers, so the
 * steps after it (erase, delete, close) meet a record they can write in.
 */

import { createHmac, randomBytes } from 'node:crypto';

import { api, ask, fixOf, hide, ok, red, skip } from './steps.mjs';

/** The step's name in the drill's order. */
export const NAME = 'lapsed';

/** The sentence a lapsed record answers every write with: `LAPSED_FIX` in `apps/worker/src/lapse.ts`, word for word. */
export const LAPSED_FIX = 'Read-only until billing resumes. Export is available.';

/** The environment's names, read by name and never printed. */
export const LAPSE_NAMES = { secret: 'DRILL_LAPSE_SECRET', subscription: 'DRILL_LAPSE_SUBSCRIPTION' };

/** The list the step makes in the drill's record: an invented kiln's bookings, and a field to say one. */
export const FIRINGS = {
  register: 'drill_firings',
  name: 'Firings',
  title: 'what',
  fields: [{ id: 'what', type: 'text', required: true, search: true }],
};

/** What the step writes before the lapse, during it, and after billing resumes. */
const BEFORE = 'Bisque firing, kiln two';
const DURING = 'Glaze firing, kiln two';
const AFTER = 'Raku firing, kiln one';

/** `{ secret, subscription }` from the environment, each null when it is not set. */
export function lapseFrom(env = process.env) {
  const v = (k) => String(env[k] ?? '').trim() || null;
  return { secret: v(LAPSE_NAMES.secret), subscription: v(LAPSE_NAMES.subscription) };
}

/** Stripe's `Stripe-Signature` header for `body`, signed at `at` (seconds) under `secret`. */
export function signatureOf(body, secret, at = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${v1}`;
}

/** One test-mode event delivered to the host's webhook, signed: the answer as `ask` gives it. */
async function deliver(d, secret, type, object) {
  const body = JSON.stringify({ id: `evt_drill${randomBytes(8).toString('hex')}`, object: 'event', type, livemode: false, data: { object } });
  return ask(d, '/account/billing/webhook', { raw: body, cookie: null, headers: { 'stripe-signature': signatureOf(body, secret) } });
}

/** The drill record's billing state, as Settings reads it: `lapsed`, `active`, `unbilled`, or null. */
async function stateOf(d) {
  const out = await ask(d, '/account/billing', { method: 'GET' });
  return (out.said?.value?.records ?? []).find((r) => r?.slug === d.made?.slug) ?? null;
}

/** Whether `answer` (a `list`) holds a firing said as `what`. */
const holds = (answer, what) => (answer.said?.value?.rows ?? []).some((r) => r?.what === what || r?.fields?.what === what || JSON.stringify(r ?? {}).includes(what));

/** Add one firing. */
const addFiring = (d, what) => api(d, 'create', { register: FIRINGS.register, fields: { what } });

/**
 * `lapsed`: billing marked lapsed through the host's own door, then an export answers 200 with the record's lists, a
 * write is refused in `LAPSED_FIX` word for word, a read still answers; then billing resumes and a write passes again.
 * `d.lapse` is `lapseFrom`'s answer; absent, the step skips and says which name is missing.
 */
export async function lapsedHolds(d) {
  if (!d.made || !d.cookie) return skip(d, NAME, 'there is no record of the drill’s to lapse.');
  const health = await ask(d, '/healthz', { method: 'GET', cookie: null });
  const mode = health.said?.launch?.billing ?? null;
  if (mode !== 'test') return skip(d, NAME, mode === null ? 'the host did not say how it bills, so it is sent no payment event.' : `billing here is ${mode}, and the drill lapses a record only in Stripe test mode.`);
  const { secret = null, subscription = null } = d.lapse ?? {};
  if (!secret) return skip(d, NAME, `no signing secret is named (${LAPSE_NAMES.secret}), so the host cannot be sent a payment event it would believe.`);
  if (!subscription) return skip(d, NAME, `no cancelled test subscription is named (${LAPSE_NAMES.subscription}) for the host to read the lapse from.`);
  d.secrets.push(secret, subscription);

  const boot = await api(d, 'boot');
  const person = boot.said?.value?.me?.person ?? null;
  const record = (await stateOf(d))?.record ?? null;
  if (typeof person !== 'string' || typeof record !== 'string') return red(d, NAME, `the drill could not read who it is or which record it made: ${fixOf(boot)}.`);
  d.secrets.push(person, record);
  const declared = await api(d, 'setDeclaration', { body: FIRINGS, version: 0 });
  if (declared.said?.ok !== true) return red(d, NAME, `the drill’s list of firings could not be made: ${fixOf(declared)}.`);
  const first = await addFiring(d, BEFORE);
  if (first.said?.ok !== true) return red(d, NAME, `before the lapse, adding a firing was refused: ${fixOf(first)}.`);

  const customer = `cus_drill${randomBytes(6).toString('hex')}`;
  d.secrets.push(customer);
  const lapse = await deliver(d, secret, 'checkout.session.completed', {
    id: `cs_drill${randomBytes(8).toString('hex')}`,
    object: 'checkout.session',
    mode: 'subscription',
    payment_status: 'paid',
    customer,
    subscription,
    client_reference_id: person,
    metadata: { person, record },
  });
  if (lapse.status !== 200) return red(d, NAME, `the host refused the payment event that lapses the record (${lapse.status}): ${fixOf(lapse)}.`);
  const marked = await stateOf(d);
  if (marked?.state !== 'lapsed') return red(d, NAME, `the payment event was taken, and the record reads ${marked?.state ?? 'nothing'} where it must read lapsed.`);

  let said = null;
  try {
    said = await underLapse(d);
  } finally {
    const back = await deliver(d, secret, 'invoice.paid', { id: `in_drill${randomBytes(8).toString('hex')}`, object: 'invoice', customer, subscription });
    const now = await stateOf(d);
    /* A RESUME THAT FAILED IS ALWAYS SAID, after a red check too: the steps after this one meet a record still lapsed. */
    if (back.status !== 200 || now?.state !== 'active') {
      const stuck = `billing did not resume: the payment event answered ${back.status}, and the record reads ${now?.state ?? 'nothing'}.`;
      said = said === null || said.pass ? red(d, NAME, stuck) : { ...said, said: `${said.said} Then ${hide(d, stuck)}` };
    }
  }
  if (!said.pass) return said;
  const again = await addFiring(d, AFTER);
  if (again.said?.ok !== true) return red(d, NAME, `billing resumed, and adding a firing was still refused: ${fixOf(again)}.`);
  return ok(d, NAME, 'billing lapsed through the host’s own payment door; the export answered with the record’s lists, adding a firing was refused in the lapse’s own words, and a read still answered; billing resumed and adding a firing went through again.');
}

/** The three checks while the record is lapsed: `{ pass }` and the line, red at the first that fails. */
async function underLapse(d) {
  const out = await api(d, 'export');
  const lines = Array.isArray(out.said?.value) ? out.said.value.map(String) : [];
  if (out.status !== 200 || out.said?.ok !== true) return red(d, NAME, `while billing had lapsed, the export answered ${out.status}: ${fixOf(out)}.`);
  if (!lines.some((l) => l.startsWith('#table')) || !lines.some((l) => l.includes(BEFORE))) return red(d, NAME, 'while billing had lapsed, the export answered without the record’s lists in it.');
  const write = await addFiring(d, DURING);
  if (write.said?.ok === true || write.status < 400) return red(d, NAME, `while billing had lapsed, adding the firing “${DURING}” to ${FIRINGS.name} went through (${write.status}).`);
  const fix = write.said?.refusal?.fix ?? null;
  if (fix !== LAPSED_FIX) return red(d, NAME, `while billing had lapsed, adding a firing was refused in other words: “${fix ?? `it answered ${write.status}`}”.`);
  const read = await api(d, 'list', { register: FIRINGS.register });
  if (read.said?.ok !== true || !holds(read, BEFORE)) return red(d, NAME, `while billing had lapsed, reading ${FIRINGS.name} did not answer with what it holds: ${fixOf(read)}.`);
  if (holds(read, DURING)) return red(d, NAME, `while billing had lapsed, the refused firing “${DURING}” was kept anyway.`);
  return { name: NAME, pass: true, said: hide(d, 'held') };
}
