/**
 * Stripe's balance, and the payouts on their way to the bank, as rows in Money's accounts, every hour.
 *
 * WHAT IT WRITES. One row a kind and a currency, "Stripe available USD" and "Stripe pending USD", and one row a
 * currency for the payouts in transit, "Stripe payout in transit USD", summed, with `arrives` set to the soonest day
 * one of them lands. Available counts as cash; pending does not, because Stripe can still take it back as a refund or
 * a dispute. Money in transit has left Stripe and is on its way to the company's own bank, so it counts.
 *
 * WHY A SCRIPT. A pull's `map:` cannot put the currency into a row's name, so every currency lands on one name and the
 * last one on the page overwrites the rest (`stripe.test.ts`, the first test, measured). And the payouts are a second
 * address and a sum, which a pull cannot join to the first.
 *
 * STRIPE'S AMOUNTS ARE ALREADY IN MINOR UNITS, which is what a money field holds, so they pass through as integers. The
 * currency comes lower case and is upper-cased. Stripe documents a few currencies whose API unit is not the ISO one;
 * this pack passes those through as Stripe sends them.
 *
 * IN TRANSIT ONLY, so a payout that is `paid` is never counted: by then it is in the bank's own balance. Between the
 * bank crediting it and Stripe marking it paid, the same money can show in both places for up to an hour; the next
 * run takes it off here.
 *
 * ONLY THE NAMES THIS SCRIPT WRITES ARE ITS OWN. It lists accounts whose name starts "Stripe ", and a row a person
 * keeps under a name like "Stripe reserve" is left exactly as it is. A kind or a currency that is gone from Stripe's
 * answer goes to zero rather than standing at whatever it last was.
 *
 * A KEY STRIPE REFUSES STOPS THE RUN WITH A SENTENCE. The record pauses a script after three refused runs in a row,
 * so a revoked key pauses this one within three hours instead of failing every hour for ever.
 */

const API = 'https://api.stripe.com';
const KEY = 'stripe';
const KINDS = [
  ['available', true],
  ['pending', false],
];
const TRANSIT = 'payout in transit';
const OURS = /^Stripe (available|pending|payout in transit) [A-Z]{3}$/;

async function ask(ctx, path) {
  const r = await ctx.fetch(API + path, { key: KEY });
  if (r.status === 401)
    throw new Error(`Stripe refused the key labelled "${KEY}" (401) at ${path}, so nothing was written. Put a working restricted key with read access to balances and payouts in the vault under that label.`);
  if (!r.ok) throw new Error(`Stripe answered ${r.status} at ${path}, so nothing was written this hour.`);
  return r.json();
}

/** Stripe's `arrival_date`, Unix seconds at midnight UTC, as the day it names. */
const dayOf = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

/**
 * What Stripe says the company holds, by the row name it goes under. Pure, so the rule is one function a reader can
 * check without the record around it.
 */
export function positionsOf(balance, payouts) {
  const rows = new Map();
  const add = (name, amount, currency, liquid, arrives) => {
    const was = rows.get(name);
    rows.set(name, {
      amount: (was === undefined ? 0 : was.amount) + amount,
      currency,
      liquid,
      arrives: was === undefined || was.arrives === null || (arrives !== null && arrives < was.arrives) ? arrives : was.arrives,
    });
  };
  for (const [kind, liquid] of KINDS)
    for (const part of balance[kind] ?? []) {
      const currency = String(part.currency).toUpperCase();
      add(`Stripe ${kind} ${currency}`, part.amount, currency, liquid, null);
    }
  for (const p of payouts) {
    if (p.status !== 'in_transit') continue;
    const currency = String(p.currency).toUpperCase();
    add(`Stripe ${TRANSIT} ${currency}`, p.amount, currency, true, dayOf(p.arrival_date));
  }
  return rows;
}

export default async function run(ctx) {
  const balance = await ask(ctx, '/v1/balance');
  const listed = await ask(ctx, '/v1/payouts?status=in_transit&limit=100');
  if (listed.has_more === true) ctx.log('Stripe has more than 100 payouts in transit, and only the first 100 are counted.');
  const now = positionsOf(balance, listed.data ?? []);

  const held = new Map();
  for (const r of await ctx.record.list('accounts', { field: 'name', starts: 'Stripe ' }))
    if (OURS.test(String(r.fields.name))) held.set(String(r.fields.name), r);

  const today = ctx.now().slice(0, 10);
  for (const name of [...new Set([...now.keys(), ...held.keys()])].sort()) {
    const want = now.get(name);
    const row = held.get(name);
    const transit = name.startsWith(`Stripe ${TRANSIT} `);
    if (row === undefined) {
      ctx.write('accounts', {
        name,
        kind: 'bank',
        balance: { amount: want.amount, currency: want.currency },
        as_of: today,
        liquid: want.liquid,
        ...(want.arrives === null ? {} : { arrives: want.arrives }),
      });
      continue;
    }
    const balanceNow = { amount: want === undefined ? 0 : want.amount, currency: want === undefined ? row.fields.balance.currency : want.currency };
    const arrives = want === undefined ? null : want.arrives;
    const same = row.fields.balance.amount === balanceNow.amount && row.fields.as_of === today && (!transit || (row.fields.arrives ?? null) === arrives);
    if (same) continue;
    ctx.update(`accounts#${row.seq}`, { balance: balanceNow, as_of: today, ...(transit ? { arrives } : {}) }, row.version);
  }
}
