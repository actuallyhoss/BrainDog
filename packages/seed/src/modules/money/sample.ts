/**
 * Money's sample rows: the studio the sample record shows, and the nights and the cash line worked back from them.
 *
 * Cut out of `money.ts` with no change (REC-B01 job 1). Rows reach a record only when it is made from the sample or a
 * list is empty, so nothing here is in the pack's fingerprint.
 */

import { day, gbp, type Fields } from '../base.ts';

/* ── obligations ─────────────────────────────────────────────────────────── */

const HAND_OBLIGATIONS: Fields[] = [
  { what: 'Invoice 2026-041: brand system', party: 1, direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', thing: 2, category: 'client_work', note: 'Chased twice. 45-day terms expired 3 August.' },
  { what: 'Invoice 2026-046: retainer, August', party: 2, direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', thing: 2, category: 'client_work', note: '' },
  { what: 'Illustration, July set', party: 3, direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open', thing: 1, category: 'contractors', note: '' },
  { what: 'Corporation tax, payment on account', party: null, direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open', thing: null, category: 'tax', note: 'HMRC reference on the letter, not here.' },
  { what: 'Invoice 2026-049: type licensing', party: 1, direction: 'owed_to_me', amount: gbp(96_000), due: day(11), state: 'open', thing: 1, category: 'licensing', note: '' },
  { what: 'Accountant, year-end fee', party: 4, direction: 'owed_by_me', amount: gbp(145_000), due: day(19), state: 'part', thing: null, category: 'professional', note: 'Half paid in June.' },
  { what: 'Backend contract, September', party: 6, direction: 'owed_by_me', amount: gbp(496_000), due: day(27), state: 'open', thing: 3, category: 'contractors', note: '' },
  { what: 'Invoice 2026-038: discovery', party: 2, direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid', thing: 2, category: 'client_work', settled: day(-41), note: 'Paid 24 July.' },
  { what: 'Invoice 2026-035: brand refresh', party: 1, direction: 'owed_to_me', amount: gbp(620_000), due: day(-96), state: 'paid', thing: 2, category: 'client_work', settled: day(-51), note: '' },
  { what: 'Studio insurance, annual', party: null, direction: 'owed_by_me', amount: gbp(38_400), due: day(41), state: 'open', thing: null, category: 'insurance', note: '' },
  { what: 'VAT quarter to 31 Aug', party: null, direction: 'owed_by_me', amount: gbp(742_000), due: day(63), state: 'open', thing: null, category: 'tax', note: '' },
  { what: 'Conference stand, deposit', party: null, direction: 'owed_by_me', amount: gbp(250_000), due: day(88), state: 'open', thing: 1, category: 'events', note: 'Refundable to 30 days out.' },
  { what: 'Invoice 2026-051: newsletter setup', party: 2, direction: 'owed_to_me', amount: gbp(75_000), due: day(33), state: 'open', thing: 3, category: 'client_work', note: '' },
  { what: 'Illustration, August set', party: 3, direction: 'owed_by_me', amount: gbp(118_000), due: day(15), state: 'open', thing: 1, category: 'contractors', note: '' },
];

/** A fixed-seed LCG, so the generated tail is the same grid every time it is opened. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296);
}

/**
 * How many days after its due date each party pays, by the number a person says. Halden pays on 45
 * days whatever the terms say, which is what Halden Type Co's own row says too (`ORGANISATIONS` in `people.ts`).
 */
const LATE_BY: Record<number, number> = { 1: 45, 2: 12, 3: 3, 4: 0, 5: 0, 6: 5 };

function generatedObligations(count: number): Fields[] {
  const r = rng(20260903);
  const kinds = ['Hosting, quarterly', 'Font licence renewal', 'Legal review', 'Print run', 'Photography day rate', 'Translation batch', 'Cloud storage, annual', 'Audit fee', 'Courier account', 'Studio rent'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* WHAT EACH KIND OF ROW IS SPENT ON, and money in is client work whatever it was called: a print run
     invoiced to a client is income from the work, not a print cost. */
  const spent: Record<string, string> = {
    'Hosting, quarterly': 'software',
    'Font licence renewal': 'software',
    'Legal review': 'professional',
    'Print run': 'production',
    'Photography day rate': 'contractors',
    'Translation batch': 'contractors',
    'Cloud storage, annual': 'software',
    'Audit fee': 'professional',
    'Courier account': 'production',
    'Studio rent': 'premises',
  };
  const out: Fields[] = [];
  for (let i = 0; i < count; i++) {
    const owedToMe = r() > 0.62;
    const dueIn = Math.round((r() - 0.35) * 320);
    // A record where half the rows are three months past their date is not a record anybody keeps.
    // The further past a date a row is, the likelier it was settled, which is what makes the few
    // that ARE still open mean something on Home.
    const paid = dueIn < -45 ? r() > 0.08 : dueIn < -10 ? r() > 0.45 : false;
    /* THE DRAWS STAY IN THEIR ORDER, so every row keeps the values it had before it had a category. */
    const kind = kinds[Math.floor(r() * kinds.length)]!;
    const party = Math.floor(r() * 6) + 1;
    const amount = gbp(Math.round(r() * 900 + 20) * 1000);
    const state = paid ? 'paid' : r() > 0.9 ? 'part' : 'open';
    out.push({
      what: `${kind}, ${months[(i * 5) % 12]}`,
      party,
      direction: owedToMe ? 'owed_to_me' : 'owed_by_me',
      amount,
      due: day(dueIn),
      state,
      thing: Math.floor(r() * 4) + 1,
      note: '',
      category: owedToMe ? 'client_work' : (spent[kind] ?? 'other'),
      /* Paid when the party pays, never later than yesterday: each party is late by its own habit. */
      ...(state === 'paid' ? { settled: day(Math.min(dueIn + (LATE_BY[party] ?? 0), -1)) } : {}),
    });
  }
  return out;
}

/**
 * Every dated promise the sample holds, each one amount on one day.
 *
 * NO ROW HERE REPEATS, SINCE money-core 3.0.0. Five of these said `repeats` and the storefront payout and the rent were
 * two more rows written only to repeat, so each was the same money as a row of `RECURRING_ITEMS` below and the walk had
 * to choose which list to believe. The pattern lives in `recurring` now; the rows here are this cycle's bill or invoice,
 * and each repeating item's `next_due` is the cycle after it, so no payment is in both lists.
 */
export const OBLIGATIONS: Fields[] = [...HAND_OBLIGATIONS, ...generatedObligations(24)];

/* ── accounts ────────────────────────────────────────────────────────────── */

/**
 * Where the money is, typed in or pasted, with the day each balance was true.
 *
 * NO BANK CONNECTION (25 §10): a balance is a row somebody or an agent writes, and `as_of` is what
 * makes it honest. `liquid` says whether it counts as cash now: a card's balance is owed, not held.
 */
export const ACCOUNTS: Fields[] = [
  { name: 'Studio current account', kind: 'bank', balance: gbp(985_000), as_of: day(-1), liquid: true, last4: '2044' },
  /* NOT UPDATED FOR OVER A WEEK, so the page shows what an out-of-date balance looks like. */
  { name: 'Tax reserve', kind: 'bank', balance: gbp(2_400_000), as_of: day(-9), liquid: true, last4: '7730' },
  /* THE ONE A CARD ALERT NAMES. Four digits nothing else in the sample repeats, so the `lookup:` in
     `packs/card-alerts` has exactly one row to find on a record that installs it. */
  { name: 'Company card', kind: 'card', balance: gbp(-124_000), as_of: day(-2), liquid: false, last4: '4471' },
];

/* ── categories ──────────────────────────────────────────────────────────── */

/**
 * What money is for, as rows rather than as a fixed list.
 *
 * `obligations.category` IS AN ENUM AND THIS IS A REGISTER, and the two are deliberately not the same
 * kind of thing yet. An enum is a pack's list: a person cannot add "Childcare" to it without a new
 * declaration. A ledger is the opposite case, because the categories somebody actually uses are
 * discovered over the first month and half of them are theirs alone. The rows below are the sample
 * studio's, and they are the studio's values of the enum, one for one.
 *
 * `match` IS THE COUNTERPARTY AS THE BANK WRITES IT, and it is what `txn-categorise` links on. `match_by`
 * says how much of the description it must be (the whole of it unless a row says otherwise), which the
 * rule's `link` honours once it reads the field. Five of these carry one, and the three merchants no
 * category names stay uncategorised, which is what the Money page leaves in Uncategorised and what a
 * person fixes in one tap.
 */
export const CATEGORIES: Fields[] = [
  { name: 'Client work', direction: 'in', state: 'live', note: 'Invoiced work, whatever it was called on the invoice.' },
  { name: 'Licensing', direction: 'in', match: 'KILN STOREFRONT PAYOUT', state: 'live', note: '' },
  { name: 'Contractors', direction: 'out', budget: gbp(700_000), state: 'live', note: '' },
  { name: 'Software', direction: 'out', budget: gbp(60_000), match: 'FENWICK CLOUD', state: 'live', note: '' },
  { name: 'Premises', direction: 'out', budget: gbp(165_000), match: 'LOWRY STREET STUDIOS', state: 'live', note: '' },
  { name: 'Tax', direction: 'out', state: 'live', note: 'Paid from the tax reserve, which is what it is for.' },
  { name: 'Professional fees', direction: 'out', budget: gbp(40_000), match: 'TALLYARD', state: 'live', note: '' },
  { name: 'Production', direction: 'out', budget: gbp(90_000), state: 'live', note: '' },
  { name: 'Travel', direction: 'out', budget: gbp(25_000), match: 'NORTHERN RAIL', state: 'live', note: '' },
];

/* ── the ledger ──────────────────────────────────────────────────────────── */

/**
 * Money that has actually moved: the rows a statement, an SMS or a person puts in.
 *
 * WRITTEN BY HAND WHERE IT MEANS SOMETHING. Four of these settle an obligation, which is the reconcile
 * the record could not do at all before: `settles` is the link between a promise and the payment that
 * discharged it, and the two paid invoices below are the same two amounts `cashSeries` walks back over.
 * Two more are the legs of one transfer, on one day, the same amount both ways, so the page has a
 * worked example of the thing a total must not count twice.
 *
 * WHO EACH ONE WAS WITH IS AN ORGANISATION, SINCE money-core 3.10.0 (`party`, by its place in `ORGANISATIONS` in
 * `people.ts`), and the payee as the bank wrote it is `counterparty_text`. A payment to a contractor names nobody in
 * `party`: a person is not an organisation, and the bill it settles already says who it was with.
 */
const HAND_TRANSACTIONS: Fields[] = [
  { what: 'HALDEN TYPE CO INV 2026-035', on: day(-51), direction: 'in', amount: gbp(620_000), account: 1, party: 1, counterparty_text: 'HALDEN TYPE CO', category: 1, thing: 2, state: 'cleared', settles: 9, note: 'Matched to the invoice by its reference.' },
  { what: 'RAVENSWORTH LTD INV 2026-038', on: day(-41), direction: 'in', amount: gbp(180_000), account: 1, party: 2, counterparty_text: 'RAVENSWORTH LTD', category: 1, thing: 2, state: 'cleared', settles: 8, note: '' },
  { what: 'J OKONKWO JUNE SET', on: day(-63), direction: 'out', amount: gbp(126_000), account: 1, counterparty_text: 'J OKONKWO', category: 3, thing: 1, state: 'cleared', note: '' },
  { what: 'HMRC VAT QUARTER TO 31 MAY', on: day(-84), direction: 'out', amount: gbp(688_000), account: 2, category: 6, state: 'cleared', note: 'Out of the reserve, which is what the reserve is for.' },
  { what: 'PELL & VINE, HALF THE YEAR-END FEE', on: day(-72), direction: 'out', amount: gbp(72_500), account: 1, party: 3, counterparty_text: 'PELL & VINE', category: 7, state: 'cleared', note: 'The other half is owed on the 22nd.' },
  /* ONE TRANSFER, TWO ROWS, ONE DAY. Nothing was earned and nothing was spent; the money is in a
     different account. Both legs are marked, and every figure over the ledger leaves them out.

     THE RECORD WOULD PAIR THEM, through `transactions`' `pairs:`, if they arrived unmarked, as a
     bank's two lines do (`test/money-pairs.test.ts`). THE MARK IS STILL TYPED HERE because a second
     engine reads these rows with no write path: the browser's sample (`apps/web/src/lib/record/data.ts`,
     `entriesOf`) fills each field's default, so untyped, both legs were `transfer: false` there
     while the record held them true, and `test/money-ledger.test.ts`, which counts from this array,
     expected GBP 12,428.02 spent against the record's GBP 8,428.02 (measured).
     TYPED, THE MARK IS THE SEED'S SAY AND THE KERNEL LEAVES IT: a create carrying a mark other than
     the default pins it (`packages/kernel/src/pairs.ts`, `markPinned`), so these two carry no
     `_pair` in the record, and the test says so rather than expecting one. */
  { what: 'TRANSFER TO TAX RESERVE', on: day(-30), direction: 'out', amount: gbp(400_000), account: 1, transfer: true, state: 'cleared', note: '' },
  { what: 'TRANSFER FROM CURRENT', on: day(-30), direction: 'in', amount: gbp(400_000), account: 2, transfer: true, state: 'cleared', note: '' },
  { what: 'COMPANY CARD, AUGUST BILL', on: day(-12), direction: 'out', amount: gbp(96_400), account: 1, transfer: true, state: 'cleared', note: 'Clears the card, so the card is not a second spend of what the card bought.' },
  { what: 'S MARCHETTI, AUGUST', on: day(-8), direction: 'out', amount: gbp(496_000), account: 1, counterparty_text: 'S MARCHETTI', category: 3, thing: 3, state: 'cleared', note: '' },
  /* THE ONE ROW THAT HAS NOT LANDED, so Status means something on the list and in the figures: a
     pending row is money the bank has taken and not yet settled, and it is not in what was spent. */
  { what: 'GRANGEMOOR EVENTS, STAND DEPOSIT', on: day(-1), direction: 'out', amount: gbp(250_000), account: 1, category: 8, thing: 1, state: 'pending', note: 'Refundable to 30 days out.' },
];

/**
 * The everyday tail, from its own fixed seed, so the grid is the same grid every time it is opened.
 *
 * NONE OF THESE CARRIES A CATEGORY, and that is the point of writing them this way. `txn-categorise`
 * runs over them at the end of the install and links the five merchants a category names; the other
 * three stay blank. So the sample shows a rule that has done something, a figure counting what is left,
 * and a person with a job that takes a tap, rather than a ledger that arrives mysteriously tidy.
 */
function generatedTransactions(count: number): Fields[] {
  const r = rng(20260904);
  /* `party` IS THE ORGANISATION THE RECORD KNOWS IT AS, where it knows one (`ORGANISATIONS` in `people.ts`), and the rest
     are a payee as the bank wrote it and nothing more, which is what a bank door leaves for the record to resolve. */
  const merchants: { what: string; direction: string; account: number; low: number; high: number; party?: number }[] = [
    { what: 'FENWICK CLOUD', direction: 'out', account: 3, low: 3_800, high: 5_200, party: 5 },
    { what: 'BRIDGE STREET COFFEE', direction: 'out', account: 3, low: 320, high: 1_140, party: 6 },
    { what: 'PAPERHAUS SUPPLIES', direction: 'out', account: 3, low: 2_400, high: 18_600 },
    { what: 'NORTHERN RAIL', direction: 'out', account: 3, low: 1_900, high: 12_400 },
    { what: 'LEDGER POST', direction: 'out', account: 3, low: 3_900, high: 3_900 },
    { what: 'LOWRY STREET STUDIOS', direction: 'out', account: 1, low: 165_000, high: 165_000 },
    { what: 'TALLYARD', direction: 'out', account: 1, low: 4_800, high: 4_800 },
    { what: 'KILN STOREFRONT PAYOUT', direction: 'in', account: 1, low: 74_000, high: 121_000 },
  ];
  const out: Fields[] = [];
  for (let i = 0; i < count; i++) {
    const m = merchants[Math.floor(r() * merchants.length)]!;
    out.push({
      what: m.what,
      on: day(-Math.floor(r() * 88) - 1),
      direction: m.direction,
      amount: gbp(Math.round(m.low + r() * (m.high - m.low))),
      account: m.account,
      ...(m.party === undefined ? {} : { party: m.party }),
      counterparty_text: m.what,
      state: 'cleared',
      note: '',
    });
  }
  return out;
}

export const TRANSACTIONS: Fields[] = [...HAND_TRANSACTIONS, ...generatedTransactions(26)];

/* ── what comes round ────────────────────────────────────────────────────── */

/**
 * The pattern, not one of its dates.
 *
 * `obligations.repeats` SAYS A ROW COMES ROUND AND THE ROW IS STILL ONE DATED AMOUNT, which is what
 * made the cash walk read it and the rest of the record read it wrong: "Studio rent, due the 28th,
 * monthly" is twelve payments a year wearing one due date, so a list of what is outstanding counts it
 * once and a person reading that list is short eleven months of rent. A repeating item belongs in its
 * own list, where `next_due` moves as each one goes out and `ends` says when it stops.
 *
 * EVERY CADENCE IS BOTH WALKED AND COUNTED A MONTH. The cash walk steps a month, a quarter
 * and a year in calendar months, a week and a fortnight in seven-day weeks, and twice a month on the 1st and the
 * 15th (`CASH_LEGS`), and `LOOKUPS.per_month` holds each one's monthly share, so no value is walked by one reader and
 * counted at nothing a month by another.
 *
 * THE CYCLE AFTER THE BILL. The backend contract, the VAT, the insurance, the accountant and the illustration set each
 * have this cycle's amount in `OBLIGATIONS` as a bill with a due day, so each pattern here starts at the cycle after
 * it and no payment is walked twice.
 */
export const RECURRING_ITEMS: Fields[] = [
  { what: 'Studio rent', direction: 'out', amount: gbp(165_000), every: 'monthly', next_due: day(28), started: day(-640), account: 1, category: 5, state: 'live', note: '' },
  { what: 'Fenwick Cloud, Workers plan', direction: 'out', amount: gbp(4_200), every: 'monthly', next_due: day(9), started: day(-410), account: 3, category: 4, thing: 1, state: 'live', note: '' },
  { what: 'Kiln storefront payout', direction: 'in', amount: gbp(93_000), every: 'monthly', next_due: day(12), started: day(-300), account: 1, category: 2, thing: 1, state: 'live', note: 'Money in that arrives without an invoice.' },
  { what: 'Backend contract, S. Marchetti', direction: 'out', amount: gbp(496_000), every: 'monthly', next_due: day(57), started: day(-120), account: 1, party: 6, category: 3, thing: 3, state: 'live', note: 'Two days a week.' },
  { what: 'VAT', direction: 'out', amount: gbp(742_000), every: 'quarterly', next_due: day(154), started: day(-730), account: 2, category: 6, state: 'live', note: '' },
  { what: 'Studio insurance', direction: 'out', amount: gbp(38_400), every: 'yearly', next_due: day(406), started: day(-690), account: 1, category: 7, state: 'live', note: '' },
  /* A ROW THAT IS PAST ITS DAY AND STILL LIVE, so `recurring-missed` has something to say and the page
     is not a list where every item is in the happy state. */
  { what: 'Ledger Post, sending plan', direction: 'out', amount: gbp(3_900), every: 'monthly', next_due: day(-4), started: day(-220), account: 3, category: 4, thing: 3, state: 'live', note: '' },
  /* AND ONE THAT HAS STOPPED, so Status is worth a column: the Hobnail plan was cancelled in July and
     the row stays, because a figure about last spring still needs it. */
  { what: 'Hobnail plan', direction: 'out', amount: gbp(2_900), every: 'monthly', next_due: day(-58), started: day(-500), ends: day(-58), account: 3, category: 4, thing: 4, state: 'ended', note: 'Cancelled with the Tallow wind-down.' },
  /* WRITTEN AFTER THE ROWS ABOVE, so every one of them keeps its number: the two patterns whose bills said `repeats`
     and had no row here, and one that comes round every week, so the page draws a cadence that is not a month. */
  { what: 'Accountant, year-end fee', direction: 'out', amount: gbp(145_000), every: 'yearly', next_due: day(384), started: day(-700), account: 1, party: 4, category: 7, state: 'live', note: '' },
  { what: 'Illustration, monthly set', direction: 'out', amount: gbp(118_000), every: 'monthly', next_due: day(45), started: day(-90), account: 1, party: 3, category: 3, thing: 1, state: 'live', note: '' },
  { what: 'Studio cleaning', direction: 'out', amount: gbp(4_500), every: 'weekly', next_due: day(2), started: day(-200), account: 1, category: 5, state: 'live', note: '' },
];

/* ── paid in parts ───────────────────────────────────────────────────────── */

/**
 * One row an instalment, which is what `docs/08-METRICS-AND-ANALYTICS.md` §2.3 walks and what the
 * importer writes from a payment plan's schedule.
 *
 * NOT ONE ROW A PLAN. A plan with a total and a count is a number somebody has to divide, and the thing
 * a person and a forecast both want is the dated amount: which payment falls on which day, which have
 * gone, and what is left. `plan` groups them, `number` of `parts` places one inside its plan, and the
 * total is the sum of the rows rather than a second copy of it that can disagree.
 */
export const INSTALLMENTS: Fields[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    what: `Proofing press, ${n} of 8`,
    plan: 'Proofing press',
    number: n,
    parts: 8,
    direction: 'out',
    amount: gbp(187_500),
    due: day(-30 * (5 - n)),
    state: n <= 4 ? 'paid' : 'open',
    ...(n <= 4 ? { settled: day(-30 * (5 - n) + 1) } : {}),
    account: 1,
    category: 8,
    thing: 1,
    /* `due: day(-30 * (5 - n))` PUTS PART FIVE ON `day(0)`, WHICH IS TODAY AND NOT LAST MONTH. The
       note here said "due last month and still open" and the dates say otherwise: parts one to four
       fall on day -120, -90, -60 and -30 and are paid, and part five is the first one still open,
       falling today. It is what `installment-due-soon` fires on, so the note says that instead. */
    note: n === 5 ? 'The first one still open: due today.' : '',
  })),
  ...[1, 2, 3, 4].map((n) => ({
    what: `Halden licence, ${n} of 4`,
    plan: 'Halden licence',
    number: n,
    parts: 4,
    direction: 'in',
    amount: gbp(240_000),
    due: day(-90 * (3 - n)),
    state: n <= 2 ? 'paid' : 'open',
    ...(n <= 2 ? { settled: day(-90 * (3 - n) + 45) } : {}),
    account: 1,
    party: 1,
    category: 2,
    thing: 1,
    note: '',
  })),
];

/* ── what was true on a night ────────────────────────────────────────────── */

/**
 * The whole position on a day, as the nightly job would have written it.
 *
 * NOT THE SAME THING AS A METRIC'S `snapshot:`, and the difference is worth the register. `cash-now`
 * remembers ONE figure a day into `series.cash-now`, which is how a sparkline under a tile is drawn. A
 * money snapshot is the four figures together, on one row, so "the 14th" is a position a person can
 * read across rather than four series a person has to line up by date, and so a note can be written
 * against the night rather than against a number. An importer can write exactly this, nightly.
 *
 * WORKED BACK FROM THE ROWS, as `cashSeries` is: the cash is the same walk, and the book each night is
 * every obligation that had not been settled by then. A live record has no such history to show, and
 * its first snapshot is the night after Money is installed.
 */
/**
 * A stored day as the product prints one: `2026-08-04` becomes `4 Aug 2026`.
 *
 * THE SAME THREE PARTS `packages/render`'S `day()` JOINS, written again here rather than imported.
 * `@braindog/seed` depends on the kernel, `ports`, `where` and `declare` and on nothing that draws,
 * and `tools/gates/graph.mjs` is what holds that edge; a formatter is nine lines and a dependency
 * from the seed to the renderer is a cycle waiting for somebody to close it. The two agreeing is
 * what `A NIGHT IS NAMED THE WAY A DAY IS PRINTED` in `test/money.test.ts` asserts.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * THE SHAPE IS CHECKED AND THE PARTS ARE NOT COUNTED, because counting them caught the wrong strings.
 *
 * Splitting on the dash and asking whether the three parts are `undefined` only rejects a string with
 * no dashes in it. Measured, before this: `2026-08-xx` came back as `NaN Aug 2026` and `yyyy-08-04`
 * as `4 Aug yyyy`, which is the `Invalid Date` on screen the guard below exists to stop, and
 * `2026-08-` came back as `0 Aug 2026`, a night that is not a day of any month.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

export function nightOf(iso: string): string {
  const said = iso.slice(0, 10);
  const [year, month, dayOfMonth] = said.split('-');
  const name = ISO_DAY.test(said) ? MONTHS[Number(month) - 1] : undefined;
  /* A STRING THAT IS NOT A DAY COMES BACK AS IT WAS, because a title is what a person reads and
     `Invalid Date` is worse than the eleven characters the caller already had. */
  return name === undefined || year === undefined || dayOfMonth === undefined ? iso : `${Number(dayOfMonth)} ${name} ${year}`;
}

export function snapshotRows(days = 30): Fields[] {
  const walk = new Map(cashSeries(90).map((p) => [p.at, p.value]));
  const live = OBLIGATIONS.filter((o) => o.state !== 'written_off');
  const out: Fields[] = [];
  for (let offset = -days; offset <= -1; offset++) {
    const at = day(offset);
    const still = live.filter((o) => typeof o.settled !== 'string' || (o.settled as string) > at);
    const side = (direction: string) =>
      still.filter((o) => o.direction === direction).reduce((n, o) => n + (o.amount as { amount: number }).amount, 0);
    const cash = walk.get(at) ?? 0;
    const toMe = side('owed_to_me');
    const byMe = side('owed_by_me');
    out.push({ what: nightOf(at), on: at, cash: gbp(cash), owed_to_me: gbp(toMe), owed_by_me: gbp(byMe), net: gbp(cash + toMe - byMe), taken: 'nightly', note: '' });
  }
  return out;
}

export const SNAPSHOTS: Fields[] = snapshotRows();

/* ── how cash has moved ──────────────────────────────────────────────────── */

/**
 * Ninety days of `cash-now`, one point a day, as the daily snapshot would have written them.
 *
 * WORKED BACK FROM THE ROWS, NOT INVENTED. Each day's balance is today's cash less every payment
 * settled after that day, in and out, so the line moves on the days the paid rows say money moved and
 * nowhere else. A live record has no such history to show: its snapshot starts on the day the figure
 * is declared, and its line grows from there.
 */
export function cashSeries(days = 90): { at: string; value: number }[] {
  const liquid = ACCOUNTS.filter((a) => a.liquid === true).reduce((n, a) => n + (a.balance as { amount: number }).amount, 0);
  const paid = OBLIGATIONS.filter((o) => o.state === 'paid' && typeof o.settled === 'string');
  const out: { at: string; value: number }[] = [];
  for (let offset = -days; offset <= -1; offset++) {
    const at = day(offset);
    const since = paid
      .filter((o) => (o.settled as string) > at)
      .reduce((n, o) => n + (o.direction === 'owed_to_me' ? 1 : -1) * (o.amount as { amount: number }).amount, 0);
    out.push({ at, value: liquid - since });
  }
  return out;
}

/**
 * Those days as the points a nightly reading of `cash-now` leaves, for the sample to hold from the moment it is made.
 *
 * WRITTEN BY THE SEED, SINCE THE SAMPLE HAD NONE. A figure's `snapshot:` writes its first point the night after it is
 * declared, so a record seeded a minute ago held no day of cash at all, and the line under Cash now on Today
 * (`trend: 12w`) and "on a month ago" in Money's first sentence had nothing to read. A record somebody starts still
 * begins with none, as `cashSeries` says: nothing is known of its cash before it was told.
 *
 * IN THE SAMPLE'S ONE CURRENCY, WITH HOW MANY ACCOUNTS WERE ADDED UP, which is what a night's own point says beside its
 * value. The night after, the record writes its own next point and leaves these as they are.
 *
 * NO POINT AT ALL ONCE THE SAMPLE HOLDS TWO CURRENCIES. `cashSeries` adds the balances and the paid rows as they are
 * written, which is a sum only while every one is in the same money; a second currency among them would be written here
 * under the first one's name, so nothing is written and the line waits for the record's own nights, which roll each.
 */
export function cashPoints(days = 90): { series: string; grain: string; at: string; value: number; unit: string; n: number }[] {
  const liquid = ACCOUNTS.filter((a) => a.liquid === true);
  const paid = OBLIGATIONS.filter((o) => o.state === 'paid' && typeof o.settled === 'string');
  const currencies = new Set([...liquid.map((a) => a.balance), ...paid.map((o) => o.amount)].map((m) => (m as { currency: string }).currency));
  if (currencies.size !== 1) return [];
  const [unit] = [...currencies] as [string];
  return cashSeries(days).map((p) => ({ series: 'cash-now', grain: 'day', at: p.at, value: p.value, unit, n: liquid.length }));
}
