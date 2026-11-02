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
 * STRIPE'S AMOUNTS ARE IN ITS OWN MINOR UNITS, and a money field holds the currency's. For most currencies the two are
 * one, and the amount passes through as an integer. Since 1.4.0 `UNITS` below holds the currencies Stripe's page of
 * currencies (docs.stripe.com/currencies) names as zero-decimal, three-decimal or a special case, each with the
 * decimals Stripe's API sends and the decimals the record keeps, and an amount is moved from one to the other: 500 ISK
 * from Stripe is 5 krónur, where it used to land as 500. A currency the table does not name passes through. The
 * currency comes lower case and is upper-cased.
 *
 * IN TRANSIT AND PENDING, NEVER PAID. A payout that is `pending` has left the available balance and is not in transit
 * yet, so it is asked for too, or cash would read short by it for up to a day. It is summed under the same name as one
 * in transit. A payout that is `paid` is never counted: by then it is in the bank's own balance. Between the bank
 * crediting it and Stripe marking it paid, the same money can show in both places for up to an hour; the next run
 * takes it off here.
 *
 * ITS ROWS ARE FOUND BY WHAT THEY HOLD, NEVER BY NAME, SINCE 1.4.0. The pack lays `stripe_kind` on Accounts
 * (available, pending, in transit), and a row is the pack's when it carries one; with its balance's currency that is
 * the row's address. A person may rename a row and it is still found. A row this pack wrote before 1.4.0, under exactly
 * the name it wrote, is marked the first hour and kept from then on, so an upgrade writes nothing twice. A row a person
 * keeps under a name like "Stripe reserve" is left exactly as it is. A kind or a currency that is gone from Stripe's
 * answer goes to zero rather than standing at whatever it last was.
 *
 * A STRIPE BALANCE A PERSON TYPED IS TAKEN OVER, NOT COUNTED BESIDE IT. A record kept by hand often holds the balance
 * as "Stripe", "Stripe USD" or "Stripe available", and writing a second available row beside it had Cash now count the
 * same money twice. A typed row is a live bank account with no `stripe_kind` whose name, case folded, is "stripe" with
 * at most one of the words "available" or "balance" and at most one currency code. Its currency is the code in its
 * name, or else its balance's. Exactly one in a currency Stripe holds is adopted: marked available, its balance set
 * from Stripe, its name and its book kept (unless the `book` setting names one, below), and the log says "Took over".
 * Two or more in one currency are not guessed between: the run writes nothing and ends with "Two accounts could be the
 * Stripe balance: <names>. Rename one.", which shows on Scripts and trips `feeds-behind` until a person does. It is a
 * refused run, so the third in a row pauses the script, and a person who renames one after that resumes it as well. A
 * row this pack already keeps in that currency wins, and a typed one beside it is left as it is, with a line in the log.
 *
 * EVERY ROW IN ONE BOOK, WHEN THE PACK IS TOLD WHICH. The `book` setting files each row this script keeps in that
 * book of money-core's, read from `ctx.config` on every run since 1.4.0, where it used to be written into this file at
 * install and a changed setting did nothing. So changing it moves the rows on the next run. Left at 0 it files none
 * and moves none, and an adopted row stays in the book a person filed it in.
 *
 * THE KEY IS THE `grant` SETTING (1.4.0), the label of a key in the vault and never the key itself, `stripe` unless a
 * person sets another, read from `ctx.config` on every run. The declaration's `keys` is the same setting, so the key
 * the script asks for is the key it declares. A key Stripe refuses stops the run with a sentence. The record pauses a
 * script after three refused runs in a row, so a revoked key pauses this one within three hours instead of failing
 * every hour for ever.
 */

const API = 'https://api.stripe.com';
/* EACH KIND: the value of `stripe_kind`, the words in the row's name, and whether it counts as cash. */
const KINDS = {
  available: { words: 'available', liquid: true },
  pending: { words: 'pending', liquid: false },
  in_transit: { words: 'payout in transit', liquid: false },
};
/* THE PAYOUT STATES THAT ARE ON THEIR WAY, one request each, so a run asks Stripe three times in all: the balance and
   these two. The declaration's `limits.fetches` is that three, and a fourth request would refuse the run whole. */
const ON_ITS_WAY = ['in_transit', 'pending'];
/* THE NAMES THIS PACK WROTE BEFORE 1.4.0, when a row was found by its name. Read once a row, to mark it. */
const BEFORE = /^Stripe (available|pending|payout in transit) ([A-Z]{3})$/;
const KIND_OF_WORDS = { available: 'available', pending: 'pending', 'payout in transit': 'in_transit' };

/**
 * STRIPE'S SPECIAL UNITS, `[the decimals Stripe's API sends, the decimals the record keeps]`, from Stripe's page of
 * currencies. The record's are `EXPONENT` in `packages/kernel/src/ingest.ts`, which the tests compare with these.
 *
 * Zero-decimal: an amount is whole units. Most of them the record keeps whole too; MGA it keeps in hundredths.
 * Three-decimal: thousandths on both sides. ISK and UGX: Stripe sends hundredths "for backward compatibility", always
 * ending 00, and the record keeps whole units. HUF and TWD: Stripe pays them out whole but sends hundredths, as the
 * record keeps them.
 */
export const UNITS = {
  BIF: [0, 0], CLP: [0, 0], DJF: [0, 0], GNF: [0, 0], JPY: [0, 0], KMF: [0, 0], KRW: [0, 0], MGA: [0, 2],
  PYG: [0, 0], RWF: [0, 0], VND: [0, 0], VUV: [0, 0], XAF: [0, 0], XOF: [0, 0], XPF: [0, 0],
  BHD: [3, 3], JOD: [3, 3], KWD: [3, 3], OMR: [3, 3], TND: [3, 3],
  ISK: [2, 0], UGX: [2, 0], HUF: [2, 2], TWD: [2, 2],
};

/** An amount in Stripe's unit for `currency`, in the unit the record keeps it in. A currency not in `UNITS` passes. */
export function minorOf(amount, currency) {
  const units = UNITS[currency];
  if (units === undefined) return amount;
  const shift = units[1] - units[0];
  return shift >= 0 ? amount * 10 ** shift : Math.round(amount / 10 ** -shift);
}

/** The label of the key the pack declares, from the `grant` setting, or a sentence when none is set. */
const keyOf = (config) => {
  const key = typeof config?.grant === 'string' ? config.grant.trim() : '';
  if (key === '') throw new Error(`No key is set, so Stripe was not asked. Set the label of a read-only Stripe key on this pack's page.`);
  return key;
};

/* THE BOOK THIS PACK FILES ITS ROWS IN: the `book` setting, the number of a row of money-core's `books` (books#2), so a
   company's Stripe money sits on the company's book page and not in the household's. Anything but a whole number above
   0 files nothing. */
const bookOf = (config) => {
  const book = Number(config?.book);
  return Number.isInteger(book) && book > 0 ? book : 0;
};

/* THE KEY BY THE NAME PEOPLE SEE IT UNDER (1.5.1): the label `stripe` is shown everywhere as "Stripe (read only)"
   (`apps/web/src/lib/market/key-names.ts`), and the log said the bare label. Another label is said as it is. */
const keyShown = (key) => (key === 'stripe' ? 'Stripe (read only)' : key);

async function ask(ctx, key, path) {
  const r = await ctx.fetch(API + path, { key });
  if (r.status === 401)
    throw new Error(`Stripe refused the key "${keyShown(key)}" (401) at ${path}, so nothing was written. Put a working restricted key with read access to balances and payouts in the keychain under that name.`);
  if (!r.ok) throw new Error(`Stripe answered ${r.status} at ${path}, so nothing was written this hour.`);
  return r.json();
}

/** Stripe's `arrival_date`, Unix seconds at midnight UTC, as the day it names. */
const dayOf = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

/**
 * AN ACCOUNT THIS PACK KEEPS SAYS SO IN MONEY'S OWN WORDS, SINCE 1.5.0: `no_feed` false, "fed by the bank", which is what
 * Money reads before it posts a repeating line to an account itself (`post-due` in money-core). Written on every row the
 * pack writes or takes over, and on one it already kept the next hour, so Money never has to know `stripe_kind`.
 */
const FED = (row) => (row.fields.no_feed === false ? {} : { no_feed: false });

/** Where a row of the pack's lives: its kind and its currency. */
const at = (kind, currency) => `${kind} ${currency}`;

/**
 * What Stripe says the company holds, by kind and currency, each with the name a new row goes under and its amount in
 * the record's unit. Pure, so the rule is one function a reader can check without the record around it.
 */
export function positionsOf(balance, payouts) {
  const rows = new Map();
  const add = (kind, amount, currency, arrives) => {
    const was = rows.get(at(kind, currency));
    rows.set(at(kind, currency), {
      kind,
      name: `Stripe ${KINDS[kind].words} ${currency}`,
      amount: (was === undefined ? 0 : was.amount) + minorOf(amount, currency),
      currency,
      liquid: KINDS[kind].liquid,
      arrives: was === undefined || was.arrives === null || (arrives !== null && arrives < was.arrives) ? arrives : was.arrives,
    });
  };
  for (const kind of ['available', 'pending'])
    for (const part of balance[kind] ?? []) add(kind, part.amount, String(part.currency).toUpperCase(), null);
  for (const p of payouts) {
    if (!ON_ITS_WAY.includes(p.status)) continue;
    add('in_transit', p.amount, String(p.currency).toUpperCase(), dayOf(p.arrival_date));
  }
  return rows;
}

/**
 * The currency a typed Stripe balance is in, or `null` when its name is not one: "stripe", case folded, with at most
 * one of "available" or "balance" and at most one currency code, in any order. A code in the name wins over the
 * balance's own.
 */
export function typedCurrency(name, balance) {
  const words = String(name).trim().toLowerCase().split(/\s+/);
  if (words[0] !== 'stripe') return null;
  let said = 0;
  let code = null;
  for (const w of words.slice(1)) {
    if (w === 'available' || w === 'balance') said += 1;
    else if (/^[a-z]{3}$/.test(w) && code === null) code = w.toUpperCase();
    else return null;
  }
  if (said > 1) return null;
  if (code !== null) return code;
  return balance !== null && typeof balance === 'object' && typeof balance.currency === 'string' ? balance.currency : null;
}

const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
/** A few names in a sentence: "A" and "B", or "A", "B" and "C". */
const namesOf = (names) => {
  const quoted = names.map((n) => `"${n}"`);
  return quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
};

export default async function run(ctx) {
  const key = keyOf(ctx.config);
  const book = bookOf(ctx.config);
  const balance = await ask(ctx, key, '/v1/balance');
  const payouts = [];
  for (const status of ON_ITS_WAY) {
    const listed = await ask(ctx, key, `/v1/payouts?status=${status}&limit=100`);
    if (listed.has_more === true) ctx.log(`Stripe has more than 100 payouts ${status === 'pending' ? 'pending' : 'in transit'}, and only the first 100 are counted.`);
    payouts.push(...(listed.data ?? []));
  }
  const now = positionsOf(balance, payouts);

  /* THE BOOK THE SETTING NAMES, as the record holds it, so a row in another book is moved and one in it is left. A
     book that is gone files nothing, and says so. */
  let bookId = null;
  if (book > 0) {
    const found = await ctx.record.get(`books#${book}`);
    if (found === null) ctx.log(`Book ${book} is not in Books, so the Stripe accounts were not filed. Set the number of a book on this pack's page.`);
    else bookId = found.id;
  }
  const inBook = bookId === null ? {} : { book: `books#${book}` };
  const fileOf = (row) => (bookId !== null && row.fields.book !== bookId ? inBook : {});

  /* THE PACK'S OWN ROWS, BY `stripe_kind` AND CURRENCY, the oldest first, so a second row at one address (a copy a
     person made) is said and left, never written over the first. */
  const held = new Map();
  const ours = await ctx.record.list('accounts', { field: 'stripe_kind', in: Object.keys(KINDS) });
  for (const r of ours.sort((a, b) => a.seq - b.seq)) {
    const where = at(String(r.fields.stripe_kind), String(r.fields.balance?.currency));
    if (held.has(where)) ctx.log(`"${r.fields.name}" is a second Stripe account for the same money as "${held.get(where).fields.name}", so it is left as it is: delete it if it is the same money.`);
    else held.set(where, r);
  }

  /* THE ROWS NOT MARKED YET: one this pack wrote before 1.4.0, by the name it wrote, and one a person typed. */
  const loose = await ctx.record.list('accounts', { all: [{ field: 'name', starts: 'Stripe' }, { field: 'stripe_kind', empty: true }, { field: 'kind', is: 'bank' }] });
  const marked = [];
  const typed = new Map();
  for (const r of loose.sort((a, b) => a.seq - b.seq)) {
    const name = String(r.fields.name);
    const before = BEFORE.exec(name);
    if (before !== null && r.fields.balance?.currency === before[2] && !held.has(at(KIND_OF_WORDS[before[1]], before[2]))) {
      const where = at(KIND_OF_WORDS[before[1]], before[2]);
      held.set(where, r);
      marked.push(where);
      continue;
    }
    const currency = typedCurrency(name, r.fields.balance);
    if (currency === null) continue;
    typed.set(currency, [...(typed.get(currency) ?? []), r]);
  }

  /* TAKE-OVER, AND NOTHING WRITTEN WHILE IT IS IN DOUBT. Every currency is settled before the first write is queued, so
     a run that ends on two candidates has written nothing. */
  const adopt = [];
  const doubts = [];
  for (const [currency, rows] of [...typed].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const where = at('available', currency);
    if (!now.has(where)) {
      for (const r of rows) ctx.log(`"${r.fields.name}" was typed in by hand, and Stripe holds no available balance in ${currency}, so it is left as it is.`);
      continue;
    }
    if (held.has(where)) {
      for (const r of rows) ctx.log(`"${r.fields.name}" was typed in by hand and "${held.get(where).fields.name}" is already kept from Stripe, so both count: delete "${r.fields.name}" if they are the same money.`);
      continue;
    }
    if (rows.length > 1) doubts.push(`${NUMBERS[rows.length] ?? rows.length} accounts could be the Stripe balance: ${namesOf(rows.map((r) => String(r.fields.name)))}. Rename one.`);
    else adopt.push([where, rows[0]]);
  }
  if (doubts.length > 0) throw new Error(doubts.join(' '));

  const today = ctx.now().slice(0, 10);
  const taken = new Set();
  for (const [where, row] of adopt.sort((a, b) => a[1].seq - b[1].seq)) {
    const want = now.get(where);
    ctx.update(`accounts#${row.seq}`, { stripe_kind: 'available', kind: 'bank', balance: { amount: want.amount, currency: want.currency }, as_of: today, liquid: true, no_feed: false, ...fileOf(row) }, row.version);
    taken.add(where);
    ctx.log(`Took over "${row.fields.name}": it holds the Stripe balance in ${want.currency} from now on, kept from Stripe every hour, so the money counts once.`);
  }

  for (const where of [...new Set([...now.keys(), ...held.keys()])].sort()) {
    if (taken.has(where)) continue;
    const want = now.get(where);
    const row = held.get(where);
    if (row === undefined) {
      ctx.write('accounts', {
        name: want.name,
        kind: 'bank',
        balance: { amount: want.amount, currency: want.currency },
        as_of: today,
        liquid: want.liquid,
        ...(want.arrives === null ? {} : { arrives: want.arrives }),
        stripe_kind: want.kind,
        no_feed: false,
        ...inBook,
      });
      continue;
    }
    const transit = where.startsWith('in_transit ');
    const balanceNow = { amount: want === undefined ? 0 : want.amount, currency: row.fields.balance.currency };
    const arrives = want === undefined ? null : want.arrives;
    /* WHETHER IT COUNTS AS CASH IS SET AGAIN WHERE IT DIFFERS, because a payout row this pack wrote before 1.1.0 says it
       does, and Cash now would go on counting it today while the walk, which reads only rows that are not cash, never
       brought it in on the day it lands. A row gone from Stripe's answer keeps what it says: it is going to zero. */
    const relabel = want !== undefined && row.fields.liquid !== want.liquid;
    const mark = marked.includes(where) ? { stripe_kind: KIND_OF_WORDS[BEFORE.exec(String(row.fields.name))[1]] } : {};
    const file = fileOf(row);
    const fed = FED(row);
    const same = row.fields.balance.amount === balanceNow.amount && row.fields.as_of === today && (!transit || (row.fields.arrives ?? null) === arrives) && !relabel && Object.keys({ ...mark, ...file, ...fed }).length === 0;
    if (same) continue;
    ctx.update(`accounts#${row.seq}`, { balance: balanceNow, as_of: today, ...(transit ? { arrives } : {}), ...(relabel ? { liquid: want.liquid } : {}), ...mark, ...file, ...fed }, row.version);
  }
}
