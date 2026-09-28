/**
 * Stripe's balance, and the payouts on their way to the bank, as rows in Money's accounts, every hour.
 *
 * WHAT IT WRITES. One row a kind and a currency, "Stripe available USD" and "Stripe pending USD", and one row a
 * currency for the payouts on their way to the bank, "Stripe payout in transit USD", summed, with `arrives` set to the
 * soonest day one of them lands. Available counts as cash; pending does not, because Stripe can still take it back as
 * a refund or a dispute.
 *
 * A PAYOUT ON ITS WAY IS MONEY IN ON THE DAY IT LANDS, NOT CASH TODAY. It has left Stripe and is not in the company's
 * bank yet, so its row does not count as cash, and money-core walks an account that is not cash and says when it
 * arrives as money in on that day (`accounts.arrives`, since money-core 3.0.0). So the forecast sees the payout on
 * the day it lands instead of Cash now counting it today, and this pack asks for that Money and no earlier one: on an
 * earlier Money nothing would walk the row, and the payout would be in no figure at all until it landed.
 *
 * WHY A SCRIPT. A pull's `map:` cannot put the currency into a row's name, so every currency lands on one name and the
 * last one on the page overwrites the rest. And the payouts are a second address and a sum, which a pull cannot join
 * to the first.
 *
 * STRIPE'S AMOUNTS ARE ALREADY IN MINOR UNITS, which is what a money field holds, so they pass through as integers. The
 * currency comes lower case and is upper-cased. Stripe documents a few currencies whose API unit is not the ISO one;
 * this pack passes those through as Stripe sends them.
 *
 * IN TRANSIT AND PENDING, NEVER PAID. A payout that is `pending` has left the available balance and is not in transit
 * yet, so it is asked for too, or cash would read short by it for up to a day. It is summed under the same name as one
 * in transit. A payout that is `paid` is never counted: by then it is in the bank's own balance. Between the bank
 * crediting it and Stripe marking it paid, the same money can show in both places for up to an hour; the next run
 * takes it off here.
 *
 * ONLY THE NAMES THIS SCRIPT WRITES ARE ITS OWN. It lists accounts whose name starts "Stripe", and a row a person
 * keeps under a name like "Stripe reserve" is left exactly as it is. A kind or a currency that is gone from Stripe's
 * answer goes to zero rather than standing at whatever it last was.
 *
 * ONE ROW A PERSON TYPED BEFORE THE PACK IS TAKEN OVER, NOT COUNTED BESIDE IT. A record kept by hand often holds the
 * Stripe balance as "Stripe" or "Stripe USD", and writing "Stripe available USD" beside it would have Cash now count
 * the same money twice. A row named exactly that, and no other, is renamed to the available row of its currency and
 * kept by Stripe's figure from then on, once, and the log says so. Its currency is the one its name gives, or else the
 * one its balance was typed in. A row this pack already keeps under that name wins, and the hand row is left as it
 * is, with a line in the log.
 *
 * EVERY ROW IN ONE BOOK, WHEN THE PACK IS TOLD WHICH. The `book` setting (1.2.0) files each row this script writes in
 * that book of money-core's, so a company's balance is on the company's page; left at 0 it files none.
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
/* THE PAYOUT STATES THAT ARE ON THEIR WAY, one request each, so a run asks Stripe three times in all: the balance and
   these two. The declaration's `limits.fetches` is that three, and a fourth request would refuse the run whole. */
const ON_ITS_WAY = ['in_transit', 'pending'];
const OURS = /^Stripe (available|pending|payout in transit) [A-Z]{3}$/;
/* A STRIPE BALANCE TYPED IN BY HAND, "Stripe" or "Stripe USD", and the currency its name gives when it gives one. */
const TYPED = /^Stripe(?: ([A-Z]{3}))?$/;

/* THE BOOK THIS PACK FILES ITS ROWS IN, SINCE 1.2.0: the `book` setting, the number of a row of money-core's `books`
   (books#2), so a company's Stripe money sits on the company's book page and not in the household's. The setting is
   written into this line when the pack is planned and installed, which is how a script is handed a setting in this
   build. It is a number and never text because it lands inside the script itself, and a number cannot close the
   quotes it sits in. Read before the fill, as a test reads this file, it is not a number, and nothing is filed. */
const BOOK = Number('{{config:book}}');
const IN_BOOK = Number.isInteger(BOOK) && BOOK > 0 ? { book: `books#${BOOK}` } : {};

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
    if (!ON_ITS_WAY.includes(p.status)) continue;
    const currency = String(p.currency).toUpperCase();
    add(`Stripe ${TRANSIT} ${currency}`, p.amount, currency, false, dayOf(p.arrival_date));
  }
  return rows;
}

export default async function run(ctx) {
  const balance = await ask(ctx, '/v1/balance');
  const payouts = [];
  for (const status of ON_ITS_WAY) {
    const listed = await ask(ctx, `/v1/payouts?status=${status}&limit=100`);
    if (listed.has_more === true) ctx.log(`Stripe has more than 100 payouts ${status === 'pending' ? 'pending' : 'in transit'}, and only the first 100 are counted.`);
    payouts.push(...(listed.data ?? []));
  }
  const now = positionsOf(balance, payouts);

  const held = new Map();
  const typed = [];
  for (const r of await ctx.record.list('accounts', { field: 'name', starts: 'Stripe' })) {
    const name = String(r.fields.name);
    if (OURS.test(name)) held.set(name, r);
    else if (TYPED.test(name)) typed.push(r);
  }

  const today = ctx.now().slice(0, 10);
  /* THE HAND ROWS FIRST, OLDEST FIRST, so a row taken over is the available row below and is not written again. */
  const taken = new Set();
  for (const row of typed.sort((a, b) => a.seq - b.seq)) {
    const name = String(row.fields.name);
    const typedIn = row.fields.balance !== null && typeof row.fields.balance === 'object' ? row.fields.balance.currency : undefined;
    const currency = TYPED.exec(name)?.[1] ?? (typeof typedIn === 'string' ? typedIn : '');
    const target = `Stripe available ${currency}`;
    const want = now.get(target);
    if (want === undefined) {
      ctx.log(`"${name}" was typed in by hand, and Stripe holds no available balance in ${currency || 'its currency'}, so it is left as it is.`);
      continue;
    }
    if (held.has(target) || taken.has(target)) {
      ctx.log(`"${name}" was typed in by hand and "${target}" is already kept from Stripe, so both count: delete "${name}" if they are the same money.`);
      continue;
    }
    const file = row.fields.book === undefined || row.fields.book === null ? IN_BOOK : {};
    ctx.update(`accounts#${row.seq}`, { name: target, kind: 'bank', balance: { amount: want.amount, currency: want.currency }, as_of: today, liquid: want.liquid, ...file }, row.version);
    taken.add(target);
    ctx.log(`"${name}" was typed in before this pack, so it is now "${target}" and kept from Stripe every hour, rather than counted a second time beside it.`);
  }

  for (const name of [...new Set([...now.keys(), ...held.keys()])].sort()) {
    if (taken.has(name)) continue;
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
        ...IN_BOOK,
      });
      continue;
    }
    const balanceNow = { amount: want === undefined ? 0 : want.amount, currency: want === undefined ? row.fields.balance.currency : want.currency };
    const arrives = want === undefined ? null : want.arrives;
    /* WHETHER IT COUNTS AS CASH IS SET AGAIN WHERE IT DIFFERS, because a payout row this pack wrote before 1.1.0 says it
       does, and Cash now would go on counting it today while the walk, which reads only rows that are not cash, never
       brought it in on the day it lands. A row gone from Stripe's answer keeps what it says: it is going to zero. */
    const relabel = want !== undefined && row.fields.liquid !== want.liquid;
    /* A ROW WITH NO BOOK IS FILED WHEN THE SETTING NAMES ONE, once. A row already in a book is left in it, because the
       record holds the book's id and not its number, and a person may have moved it on purpose. */
    const file = row.fields.book === undefined || row.fields.book === null ? IN_BOOK : {};
    const same = row.fields.balance.amount === balanceNow.amount && row.fields.as_of === today && (!transit || (row.fields.arrives ?? null) === arrives) && !relabel && Object.keys(file).length === 0;
    if (same) continue;
    ctx.update(`accounts#${row.seq}`, { balance: balanceNow, as_of: today, ...(transit ? { arrives } : {}), ...(relabel ? { liquid: want.liquid } : {}), ...file }, row.version);
  }
}
