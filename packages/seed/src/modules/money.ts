/**
 * Money: what comes in and what goes out, with a date and a currency.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 *
 * WHAT IS OWED IS NOT WHAT MOVED, and until now this module held only the first half. `obligations` and
 * `accounts` were the whole of it: a dated promise and a typed balance, with nothing in between. So the
 * record could say what was due and what was in the bank, and could not say that GBP 4,800 left the
 * card on the 14th, what it was for, or which of the two balances it explains. Every figure on the
 * Money page was therefore about intentions. `transactions` is the other half, and `categories`,
 * `recurring`, `installments` and `snapshots` are what make a ledger readable once it exists: what
 * money is for, what comes round without anybody deciding again, what is being paid off in parts, and
 * what the whole position was on a night nobody was looking.
 *
 * MONEY-CORE 3.0.0 IS ONE PAGE OVER THE SAME LISTS (`loop/finish/modules.md` R-M, C12). The page leads with the money
 * there is, rolled forward from each account's newest balance through what has moved since; then how long it lasts and
 * what comes in and goes out over thirty days, which are the same walk the forecast draws; then the past, read from
 * `transactions`, which is where money that moved lives. Repeating money has one home, `recurring`, walked at every
 * cadence. Every list id, enum value and figure id a record already holds stays (`declare/src/index.ts`, `ID_RENAMED`),
 * because a pack update may rename a word and never an id.
 */

import type { Leg, RatesFields, RegisterDecl } from '@braindog/kernel';
import type { Predicate } from '@braindog/where';

import { LOOKUPS, OPEN, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister, type SeedRule } from './base.ts';

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
 * days whatever the terms say, which is what its person row's note says too.
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
 */
const HAND_TRANSACTIONS: Fields[] = [
  { what: 'HALDEN TYPE CO INV 2026-035', on: day(-51), direction: 'in', amount: gbp(620_000), account: 1, party: 1, category: 1, thing: 2, state: 'cleared', settles: 9, note: 'Matched to the invoice by its reference.' },
  { what: 'RAVENSWORTH LTD INV 2026-038', on: day(-41), direction: 'in', amount: gbp(180_000), account: 1, party: 2, category: 1, thing: 2, state: 'cleared', settles: 8, note: '' },
  { what: 'J OKONKWO JUNE SET', on: day(-63), direction: 'out', amount: gbp(126_000), account: 1, party: 3, category: 3, thing: 1, state: 'cleared', note: '' },
  { what: 'HMRC VAT QUARTER TO 31 MAY', on: day(-84), direction: 'out', amount: gbp(688_000), account: 2, category: 6, state: 'cleared', note: 'Out of the reserve, which is what the reserve is for.' },
  { what: 'PELL & VINE, HALF THE YEAR-END FEE', on: day(-72), direction: 'out', amount: gbp(72_500), account: 1, party: 4, category: 7, state: 'cleared', note: 'The other half is owed on the 22nd.' },
  /* ONE TRANSFER, TWO ROWS, ONE DAY. Nothing was earned and nothing was spent; the money is in a
     different account. Both legs are marked, and every figure over the ledger leaves them out.

     THE RECORD WOULD PAIR THEM, through `transactions`' `pairs:`, if they arrived unmarked, as a
     bank's two lines do (`test/money-pairs.test.ts`). THE MARK IS STILL TYPED HERE because a second
     engine reads these rows with no write path: the browser's sample (`apps/web/src/lib/record/data.ts`,
     `entriesOf`) fills each field's default, so untyped, both legs were `transfer: false` there
     while the record held them true, and `test/money-ledger.test.ts`, which counts from this array,
     expected GBP 12,428.02 spent against the record's GBP 8,428.02. Measured on 24 September.
     TYPED, THE MARK IS THE SEED'S SAY AND THE KERNEL LEAVES IT: a create carrying a mark other than
     the default pins it (`packages/kernel/src/pairs.ts`, `markPinned`), so these two carry no
     `_pair` in the record, and the test says so rather than expecting one. */
  { what: 'TRANSFER TO TAX RESERVE', on: day(-30), direction: 'out', amount: gbp(400_000), account: 1, transfer: true, state: 'cleared', note: '' },
  { what: 'TRANSFER FROM CURRENT', on: day(-30), direction: 'in', amount: gbp(400_000), account: 2, transfer: true, state: 'cleared', note: '' },
  { what: 'COMPANY CARD, AUGUST BILL', on: day(-12), direction: 'out', amount: gbp(96_400), account: 1, transfer: true, state: 'cleared', note: 'Clears the card, so the card is not a second spend of what the card bought.' },
  { what: 'S MARCHETTI, AUGUST', on: day(-8), direction: 'out', amount: gbp(496_000), account: 1, party: 6, category: 3, thing: 3, state: 'cleared', note: '' },
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
  const merchants = [
    { what: 'FENWICK CLOUD', direction: 'out', account: 3, low: 3_800, high: 5_200 },
    { what: 'BRIDGE STREET COFFEE', direction: 'out', account: 3, low: 320, high: 1_140 },
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
 * importer writes from the old tool's `obligations.schedule` (`loop/research-switch.md` §4).
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
 * against the night rather than against a number. the old tool writes exactly this, nightly.
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

/**
 * WHAT THE BANK SAID WAS LEFT AFTER THIS MOVED, as its alert printed it: a card's available limit, an account's
 * available balance. Optional, because most ways a row arrives never say, and nothing sums it.
 *
 * IT IS THE ONE THING THAT TELLS A SECOND CHARGE FROM A RESEND. Two card alerts in a hundred real bank texts
 * carried the same amount, merchant and day a few minutes apart, and the near rule skipped the second as already
 * said, although the limits they print differ by exactly the charge (`loop/research-bank-real.md`). The same alert
 * sent again prints the same figure, so a pattern that reads this and names it in its `dedupe:` files two charges
 * and still files one resend once (the bank pack's own test under `packs/`). Not indexed: the register is at the ceiling of
 * eight, and the dedupe that reads it has already narrowed to one account, one amount and three days.
 *
 * A CONSTANT, BECAUSE TWO PLACES DECLARE IT. `register.transactions` carries it from money-core 2.1.0, and a bank pack under
 * `packs/` lays the same field through `extends` for a record still on 1.8.0 or 2.0.0, which its range admits. Written twice, the
 * two could disagree about a type, and a record would then hold whichever arrived first.
 */
export const AVAILABLE = { id: 'available', label: 'Available after', type: 'money' } as const;

/**
 * A register as Money declares it: a seed register that may also say how its rows pair, or that it holds the rates.
 *
 * WIDENED HERE AND NOT IN `base.ts`, because `transactions` is the one register any module pairs and `fx` the one that
 * holds rates, and the kernel's own types carry both shapes, so neither can drift from what `pairs.ts` and `roles.ts`
 * check.
 */
type MoneyRegister = SeedRegister & { pairs?: RegisterDecl['pairs']; rates?: RatesFields };

export const MONEY_REGISTERS: Record<string, MoneyRegister> = {
  obligations: {
    id: 'obligations',
    /**
     * `Bills and invoices`, SINCE money-core 3.0.0, AND IT WAS `Money`.
     *
     * MONEY IS THE MODULE AND ITS PAGE NOW, and this list is one part of it: a dated amount somebody is to pay or be
     * paid, once. What moved is `transactions`, what comes round is `recurring`, and what is held is `accounts`, so a
     * list called Money beside a page called Money named two things with one word.
     *
     * THE ID IS UNTOUCHED. `obligations` is what the URL says, what a predicate says, and what an
     * agent writes, and `19 §9`'s rule is the one Slack follows rather than the one Notion follows:
     * the interface says the word a person would say, for life, and the API keeps its own. Renaming
     * the id would be a migration; renaming the label is a label.
     */
    name: 'Bills and invoices',
    icon: 'obligation',
    /* `item`, because half of these are owed to you and half by you: `bill` is wrong for an invoice
       you sent and `invoice` is wrong for a tax payment. */
    one: 'item',
    holds: 'the bills you are to pay and the invoices you are to be paid, each with a day and a currency',
    title: 'what',
    /* THE DAY IT FALLS DUE, on the one screen that had no room for it (`loop/finish/design.md` §5). A card shows three
       declared fields, and a bill's card that leaves out its due day leaves out the one fact a person scanning a list of
       bills is looking for. Which way the money goes is the sign on the amount, which the card draws from the row. */
    mobile: ['what', 'amount', 'due'],
    state: 'state',
    done: ['paid', 'written_off'],
    /**
     * THE DAY A BILL WAS PAID IS WRITTEN BY THE RECORD WHEN IT IS MARKED PAID, SINCE money-core 3.0.0.
     *
     * `settled` was a field nothing wrote outside the sample's own rows, so every figure that asked when money was paid
     * (how late clients pay, what went out each month) read a day no live record held. `finished:` is the kernel's key
     * for exactly that (`packages/kernel/src/finished.ts`): it stamps the day a row enters a done state, keeps a day the
     * write names, and empties it when the row is reopened.
     */
    finished: 'settled',
    pack: 'money-core',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      /* `Who`, AND IT WAS `Party`. A column header is read at a glance by somebody scanning for a
         name, and `Party` is a legal word for the same thing that reads as a social event.
         A LINK AND NOT A DEPENDENCY, since money-core 3.0.0 (`LINKS` in `packs/first-party.ts`): on a record without
         People the field is left out and Money installs without it. */
      { id: 'party', label: 'Who', type: 'ref', to: 'people', index: true },
      /* MONEY IN AND MONEY OUT, and the ids stay: direction is a property of an amount, never the frame,
         and a person reads which way it goes rather than who owes whom. */
      {
        id: 'direction',
        label: 'Which way',
        type: 'enum',
        values: ['owed_by_me', 'owed_to_me'],
        labels: { owed_by_me: 'Money out', owed_to_me: 'Money in' },
        index: true,
        required: true,
      },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
      /* `Status`, AND IT WAS `State`, here and on services, sessions, threads and tasks: `Status` is the word
         every product the reader has already used says. The field id stays `state`, which is what a predicate
         says, what `done:` lists and what `05 §254` makes a path a page can hold. `part` READS "Part paid",
         because a bill half paid is what the value means and "part" alone is half a phrase. */
      {
        id: 'state',
        label: 'Status',
        type: 'enum',
        values: ['open', 'part', 'paid', 'written_off'],
        labels: { open: 'Open', part: 'Part paid', paid: 'Paid', written_off: 'Written off' },
        index: true,
        required: true,
      },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'note', type: 'text' },
      /**
       * WHAT IT IS FOR, so a page can say where the money goes. Indexed, because a page groups by it
       * and a list filters on it.
       *
       * THE NEUTRAL WORDS COME FIRST, SINCE money-core 3.0.0, because they are what anybody's bills are for: a
       * household's, a student's and a company's alike. The eleven that follow them were one design studio's cost lines,
       * and they stay values of the field, because a row that holds one keeps its word through an update
       * (`carried`) and an enum value taken away would leave that row holding a value its list no longer says.
       */
      {
        id: 'category',
        type: 'enum',
        values: [
          'home', 'food', 'transport', 'health', 'fun', 'pay', 'subscriptions', 'tax', 'other',
          'client_work', 'licensing', 'contractors', 'software', 'premises', 'professional', 'production', 'insurance', 'events',
        ],
        labels: {
          home: 'Home',
          food: 'Food',
          transport: 'Transport',
          health: 'Health',
          fun: 'Fun',
          pay: 'Pay',
          subscriptions: 'Subscriptions',
          tax: 'Tax',
          other: 'Other',
          client_work: 'Client work',
          licensing: 'Licensing',
          contractors: 'Contractors',
          software: 'Software',
          premises: 'Premises',
          professional: 'Professional fees',
          production: 'Production',
          insurance: 'Insurance',
          events: 'Events',
        },
        index: true,
      },
      /* THE DAY IT WAS PAID, which is not the day it was due. How late each client pays is the gap. The record writes
         it when the row is marked paid (`finished:` above). */
      { id: 'settled', label: 'Paid on', type: 'day' },
      /**
       * HOW OFTEN A BILL SAID IT CAME ROUND, KEPT ON ITS ROWS AND WALKED NO MORE, SINCE money-core 3.0.0.
       *
       * What repeats lives in `recurring`, and the cash walk reads it there at every cadence. A bill that also said
       * `repeats` was the same money twice: the the old tool import writes each repeating stream as a bill carrying
       * `repeats` and as a row of `recurring` (`packs/legacy-import/adapter.ts`), so a walk over both counted every
       * salary and every rent twice. So the walk takes a bill once, on its due day, when it does not repeat, and leaves
       * a repeating one to its row in `recurring`. The field stays, because rows hold it and an id is for ever.
       */
      { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'yearly'] },
      /**
       * THE LAST DAY A REPEATING ROW MOVED MONEY ON, SINCE money-core 2.4.0. Kept, as `repeats` is, for the rows and the
       * import that write it; the walk reads the same field on `recurring`, where a repeating item keeps it.
       */
      { id: 'ends', label: 'Ends', type: 'day' },
    ],
  },
  accounts: {
    id: 'accounts',
    name: 'Accounts',
    icon: 'money',
    one: 'account',
    holds: 'what is in each bank account, cash box and card, and the day that was true',
    title: 'name',
    mobile: ['name', 'balance', 'as_of'],
    pack: 'money-core',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'kind', label: 'Type', type: 'enum', values: ['bank', 'cash', 'card'], index: true, required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
      { id: 'liquid', label: 'Counts as cash', type: 'bool', default: true },
      /**
       * THE FOUR DIGITS A BANK MESSAGE NAMES THE ACCOUNT BY, and nothing else in this record could.
       *
       * `transactions.account` is a required ref, and the only thing an alert says about which account
       * moved is *"your card ending 4471"*. Without this field a pattern's `lookup:` (the card alerts in
       * `packs/card-alerts`, a bank's own pack) has no `by:` to resolve against, so every forwarded message would land
       * in `review` for a field the message plainly carried. NOT REQUIRED and not unique: a cash box has no digits,
       * and two cards from one bank can share four.
       */
      { id: 'last4', label: 'Last four digits', type: 'text' },
      /**
       * THE DAY MONEY ON ITS WAY LANDS, SINCE money-core 3.0.0: a payout in transit, a transfer sent and not yet in.
       *
       * Such money is not cash yet, so its account does not count as cash, and it was in no walk either: a payout
       * landing on Friday was money the forecast never saw. An account that does not count as cash and says when it
       * arrives is walked as money in on that day (`CASH_LEGS`). Empty is money that is not on its way anywhere, which is
       * every card and every account that is cash.
       */
      { id: 'arrives', label: 'Arrives', type: 'day' },
    ],
  },

  /* `holdings` WAS DECLARED HERE FROM 1.5.0 TO 1.8.0. money-core 2.0.0 gave it to a pack of its own, now the file
     `packs/holdings/holdings.pack.json`, and its reasons went with it: what one person holds is not what everybody's Money is for
     (`loop/DIRECTION.md` section 22). */
  /**
   * WHAT ONE CURRENCY IS WORTH IN ANOTHER, AND ON WHICH DAY (`08 §2.5`). Money in more than one currency is added up in the
   * record's home currency only when there is a rate for every other one, as of the day each amount is about; without one
   * a figure says one amount per currency and names the rate it lacks. A rate is typed in, written by an agent, or polled
   * from a public address (`ratesPollPack`). One `currency` is `rate` of `base`, and a row quoted the other way round is
   * read as its inverse.
   */
  fx: {
    id: 'fx',
    name: 'Exchange rates',
    icon: 'money',
    one: 'rate',
    holds: 'what one currency is worth in another, and the day that was true',
    title: 'currency',
    mobile: ['currency', 'rate', 'as_of'],
    pack: 'money-core',
    /* THE LIST THE KERNEL CONVERTS BY, SAID BY THE LIST, SINCE money-core 3.0.0 (`packages/kernel/src/roles.ts`). Before
       it the kernel read the rates off whatever list was called `fx`, by four fixed field names, and a record reaches
       that reading now only until its next update. */
    rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' },
    fields: [
      { id: 'currency', type: 'text', required: true, index: true, search: true },
      { id: 'base', label: 'Base currency', type: 'text', required: true, index: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
      { id: 'source', type: 'text' },
    ],
  },

  /**
   * WHAT MONEY IS FOR. A ledger with no categories is a list of amounts, and a list of amounts cannot
   * answer the one question anybody asks of it. `budget` is what a person means by "no more than this
   * a month", held on the category rather than typed into a figure, so changing it is an edit to a row.
   */
  categories: {
    id: 'categories',
    name: 'Categories',
    icon: 'tag',
    one: 'category',
    holds: 'what money is for, so a ledger can be read by where it goes',
    title: 'name',
    mobile: ['name', 'direction', 'budget'],
    state: 'state',
    done: ['retired'],
    pack: 'money-core',
    fields: [
      /* UNIQUE, because two categories with one name is how a month's spending ends up split across
         two bars that a person reads as two different things. */
      { id: 'name', type: 'text', required: true, unique: true, search: true },
      /* WHICH WAY A CATEGORY IS FOR. `32-PARITY` §3.2's direction guard is this field: a rule pointing
         at an income category has no business on a payment out, and a person filing by hand is offered
         the ones that can be right. `both` is for the legs of a transfer, which are neither. */
      {
        id: 'direction',
        label: 'Which way',
        type: 'enum',
        values: ['in', 'out', 'both'],
        labels: { in: 'Money in', out: 'Money out', both: 'Either way' },
        index: true,
        required: true,
      },
      /* THE COUNTERPARTY AS THE BANK WRITES IT, which is what `txn-categorise` links on. */
      { id: 'match', label: 'Matches', type: 'text', index: true },
      /**
       * HOW MUCH OF A DESCRIPTION `match` MUST BE, SINCE money-core 3.0.0: the whole of it, how it starts, or anywhere
       * in it. A bank writes one shop as `FENWICK CLOUD` on Monday and `FENWICK CLOUD LTD 4471` on Friday, and an
       * equality files the first and leaves the second for a person. `exact` is the default and what every category
       * before this meant, so nothing a record already files moves.
       */
      {
        id: 'match_by',
        label: 'How it matches',
        type: 'enum',
        values: ['exact', 'starts', 'contains'],
        labels: { exact: 'The whole description', starts: 'How it starts', contains: 'Anywhere in it' },
        default: 'exact',
      },
      /* `Most a month`, AND IT WAS `No more than, a month`. A page prints its own `where:` back using
         each field's label, and the sentence grammar splits clauses on commas, so a label with a
         comma in it could not be typed or pasted back: `no more than: categories has no field called
         no`. The test that says every field is reachable by the name the screen shows caught it. */
      { id: 'budget', label: 'Most a month', type: 'money' },
      { id: 'state', label: 'Status', type: 'enum', values: ['live', 'retired'], default: 'live', index: true, required: true },
      { id: 'note', type: 'text' },
    ],
  },

  /**
   * MONEY THAT HAS ACTUALLY MOVED, which is the register this module was missing and the reason none
   * of its figures could be checked against anything. An obligation is a promise with a date; a
   * transaction is a fact with a day, an account and a direction, and `settles` is the one field that
   * joins them, so "paid" stops being a status somebody remembered to set.
   *
   * THE AMOUNT IS POSITIVE AND `direction` CARRIES THE SIGN, as it does on `obligations`: a column of
   * signed amounts cannot be summed without knowing which way each one goes, and a table draws the
   * sign from the field (`sign: { field: direction, minus: out }`) rather than from the column it is in.
   */
  transactions: {
    id: 'transactions',
    name: 'Ledger',
    icon: 'rows',
    one: 'transaction',
    holds: 'money that has moved, with the day it moved, the account it moved through and what it was for',
    title: 'what',
    /* THE DAY IT MOVED BESIDE THE AMOUNT. A card holds three fields (`RowCards`, and `declOf` in `remote.ts` draws its
       own three in place of any other count), and a payment's card without its amount is a list nobody can read, so the
       account it moved through is one tap away on the row rather than on the card. */
    mobile: ['what', 'amount', 'on'],
    state: 'state',
    done: ['cleared', 'void'],
    pack: 'money-core',
    /**
     * THE TWO LEGS OF A TRANSFER ARE FOUND BY THE RECORD (`packages/kernel/src/pairs.ts`, `02 §5`): the same amount in the
     * same currency, one leg out and one in, two different accounts, within four days. Both are marked `transfer` and
     * each names the other in `_pair`, so a person sees why a row stopped counting and can undo it. An import writes a
     * move between one person's accounts as two ordinary rows, and until this a person marked both or every figure over
     * the ledger counted the move once as spend and once as income (`test/money-pairs.test.ts`: GBP 4,000.00 spent, before).
     *
     * `abs(amount)` AND NO `currency` ENTRY, because the currency is inside the money and this register has no field of
     * that name: `abs()` on a money compares its size and its currency together.
     *
     * `where: state is cleared`, THE SAME CLAUSE EVERY LEDGER FIGURE COUNTS BY, because a row the figures never count
     * cannot be the other half of a move they do. Without it a void or pending credit paired with the cleared payment
     * beside it and hid that payment: the audit of the kernel's pairing measured Spent at GBP 0.00 against 250.00 for
     * both (`loop/research-batch-fifty-eight-audit.md` finding 2), and a pending row is what a bank alert writes first.
     * `done:` is not the answer, since it holds `void` too. THE TREE AND NOT THE SENTENCE, because the kernel matches it
     * on every write and takes it only in that form (`pairs.ts`, `pairsFault`). When a pending credit clears, the update
     * is looked at again and it pairs then.
     *
     * `party is empty` AND `settles is empty`, BECAUSE A MOVE BETWEEN YOUR OWN ACCOUNTS HAS NOBODY ON THE OTHER SIDE AND
     * DISCHARGES NO PROMISE. Without them a coincidence of amount was a transfer: rent out of one account and a client
     * paying the same 15,000.00 into another a day later both left Spent and Received, and so did a friend's instant
     * transfer repaying a dinner and a refund landing on another account (`loop/research-batch-sixty-one-audit.md`
     * findings 1 and 6, M4 and M5). A row that names who it was with, or the obligation it paid, is a payment to or from
     * somebody, and one such leg keeps the pair apart. Both are fields the kernel reads again on an update, so naming
     * Omar on a repayment the record had paired undoes the pair (`test/money-pairs.test.ts`).
     *
     * `settles is empty` OR `transfer is true`, SINCE 2.3.0, BECAUSE A CARD BILL IS A PROMISE AND A MOVE AT ONCE. A founder
     * keeps the bill in Obligations so the forecast holds it, the import writes its two legs bare and the record pairs
     * them, and then Reconcile sets `settles` on the bank leg. At 2.2.0 that one field parted the pair: Spent and
     * Received each read 9,500.00 high, on top of the purchases the bill paid, already in Spent on the card
     * (`loop/research-batch-sixty-three-audit.md` finding 3, F4; `test/money-card-bill.test.ts`). So a leg that settles
     * something is still a leg while the record holds it as one. `transfer` is read on the stored row, the mark the
     * pairing itself wrote, so the clause keeps a pair and never starts one.
     *
     * WHY NOT THE CARD ITSELF. The bank leg of a card bill and a rent payment that settles its obligation are the same row
     * field for field, and so are their partners; what differs is the obligation's payee or the kind of the account the
     * money went to, and both are a hop through a ref that `where` here cannot take (`pairs.ts`, `pairsFault`). Dropping
     * `settles` from the clause altogether would pair the rent that M4 writes already reconciled with the client beside
     * it (`test/money-pairs.test.ts`).
     *
     * WHAT THE CLAUSE COSTS, measured on 24 September and held in `test/money-card-bill.test.ts`: which was written first
     * decides. A bank leg reconciled while it holds no pair never gains one, as at 2.2.0: reconciled before the card's
     * leg arrives, reconciled on the bank alert while still pending and cleared afterwards, or reconciled and then parted
     * for a moment by a mistyped amount on the card's leg or a third row of the same sum, and each leaves the bill counted
     * both ways after the ledger is back as it was. And two bare rows
     * the record paired by coincidence, rent and a client's payment of the same sum, no longer part when the rent is
     * reconciled; naming the client still parts them, as it parts the dinner and the repayment in M5.
     *
     * NOT `category is empty`, which the audit proposed. A real ledger, read on 24 September through the route the
     * import reads, files both legs of both its moves since 13 July under a category called Transfers, and the import
     * carries the category over, so that clause would have unpaired every move in it. "A category whose direction is
     * `both`" is what a category could say, and it needs a hop through the ref that `where` refuses (`via`,
     * `packages/where/src/index.ts`). On that ledger the declaration as it was paired those two moves and nothing else,
     * so what this adds is a way for a person to say no, not a change to what an import pairs tonight.
     *
     * WHAT STILL PAIRS WRONGLY: two rows that name nobody, whose amounts agree. The import never writes `party` (the payee
     * goes into the note) and a bank text never does, and on that ledger a move between two of one's own accounts and a
     * friend's repayment carry descriptions that differ only in the word for which way the money went, so no field this
     * register holds, the description included, tells the rent and the client from a move until a person names one
     * side. That is the M4 and M5 rows as the audit wrote them, and the M5 test holds the bare dinner and repayment
     * paired on purpose, so the day that changes is seen. `within` stays 4d: the coincidences measured sit one and two
     * days apart, the card on that ledger is paid off with the card's leg a day before the bank's, and a window short
     * enough to part M4 would lose that move and any sent before a weekend.
     *
     * WHAT CANNOT PAIR: a move between currencies, the most common one on that ledger (dollars out of one account and
     * another currency into a second, finding 5, M3). `abs(amount)` compares the currency as well as the size, and
     * nothing in `pairs:` can say "the same value at the day's rate", so both legs are counted until a person marks them.
     */
    pairs: {
      on: ['abs(amount)'],
      opposite: 'direction',
      across: 'account',
      within: '4d',
      mark: 'transfer',
      where: {
        all: [
          { field: 'state', is: 'cleared' },
          { field: 'party', empty: true },
          { any: [{ field: 'settles', empty: true }, { field: 'transfer', is: true }] },
        ],
      },
    },
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      /* `Date` OVER THE COLUMN AND `on` IN A PREDICATE. A transaction has one day and it is never a
         deadline, so this field wears no `deadline:`: nothing here can be late. */
      { id: 'on', label: 'Date', type: 'day', index: true, required: true },
      {
        id: 'direction',
        label: 'Which way',
        type: 'enum',
        values: ['in', 'out'],
        labels: { in: 'Money in', out: 'Money out' },
        index: true,
        required: true,
      },
      { id: 'amount', type: 'money', required: true },
      { ...AVAILABLE },
      /**
       * WHAT THE BANK SAID THE ACCOUNT HELD AFTER THIS MOVED, SINCE money-core 3.0.0: the balance a statement line or a
       * bank message prints beside a movement. Not `available`, which is a card's limit left, not what an account holds.
       *
       * IT RESTARTS CASH NOW FOR ITS ACCOUNT. `cash-now` rolls each account forward from the newest thing anybody said
       * it held, and a movement that says the balance after it is one of those statements, so a bank pack that reads it
       * keeps the figure true without anybody typing a balance. Optional, because most ways a row arrives never say.
       */
      { id: 'balance_after', label: 'Balance after', type: 'money' },
      /* REQUIRED, because a movement with no account is a number nobody can reconcile. */
      { id: 'account', type: 'ref', to: 'accounts', index: true, required: true },
      { id: 'category', type: 'ref', to: 'categories', index: true },
      /* Not indexed, and this register is at the ceiling. `declare.ts`'s `INDEX_CEILING` is 8 and
         counts `index: true` and `unique: true` alike; the eight spent here are `on`, `direction`,
         `account`, `category`, `thing`, `state`, `transfer` and `settles`, which are the eight every
         page and every figure below filters on. `party` is the one nothing filters on, so it pays
         no write cost. A ninth would come back as INDEXES_OVER_CAP at the door. */
      { id: 'party', label: 'Who', type: 'ref', to: 'people' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', index: true, required: true },
      /**
       * MOVING MONEY BETWEEN YOUR OWN ACCOUNTS IS NOT SPENDING IT, and a ledger that counts it as
       * spending reports the same month twice. The mark is a field rather than a category, because a
       * transfer has no category: it is not for anything. Every figure of spending and income says
       * `transfer is false`, and the default is false so a row nobody marks is counted.
       *
       * THE RECORD SETS IT ON BOTH LEGS OF A MOVE IT CAN SEE, through `pairs:` above, and a person sets
       * it on the rest: a card bill whose other leg is the card's own statement is one leg in this
       * ledger, and no pair can be found for it.
       */
      { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false, index: true },
      /* THE PROMISE THIS PAYMENT DISCHARGED. Reconcile is this field and nothing else. */
      { id: 'settles', label: 'Settles', type: 'ref', to: 'obligations', index: true },
      { id: 'note', type: 'text' },
    ],
  },

  /**
   * WHAT COMES ROUND WITHOUT ANYBODY DECIDING AGAIN. `next_due` is the only date, because a repeating
   * item is not a list of dates: it is a pattern, and the dates are what the forecast walks from it.
   *
   * THE ONE HOME OF REPEATING MONEY, SINCE money-core 3.0.0. It was deliberately not walked while `obligations.repeats`
   * was, so a salary typed here never reached Cash ahead; now the walk reads this list and a bill's `repeats` is kept
   * and not walked (`CASH_LEGS`).
   */
  recurring: {
    id: 'recurring',
    name: 'Repeating',
    icon: 'refresh',
    one: 'repeating item',
    holds: 'the money that comes in and goes out on a cadence, weekly to yearly, without anybody deciding again',
    title: 'what',
    mobile: ['what', 'amount', 'next_due'],
    state: 'state',
    done: ['ended'],
    pack: 'money-core',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      {
        id: 'direction',
        label: 'Which way',
        type: 'enum',
        values: ['in', 'out'],
        labels: { in: 'Money in', out: 'Money out' },
        index: true,
        required: true,
      },
      { id: 'amount', type: 'money', required: true, qualifies: 'every' },
      /* THE VALUES ARE `LOOKUPS.per_month`'S AND THE WALK'S. A frequency the factor table does not know is
         counted at nothing a month by every figure that reads this list, which is a silent zero, and one the walk does
         not know moves once and is said. So a value goes into this list, the table and `CASH_LEGS` together. */
      {
        id: 'every',
        label: 'How often',
        type: 'enum',
        values: ['weekly', 'fortnightly', 'twice_monthly', 'monthly', 'quarterly', 'yearly'],
        labels: { weekly: 'Every week', fortnightly: 'Every two weeks', twice_monthly: 'Twice a month', monthly: 'Every month', quarterly: 'Every quarter', yearly: 'Every year' },
        index: true,
        required: true,
      },
      { id: 'next_due', label: 'Next', type: 'day', index: true, deadline: true, required: true, remind: ['-3d', '0d'] },
      { id: 'started', label: 'Since', type: 'day' },
      /* Empty means it does not stop, which is the normal case and is why there is no `forever` value. */
      { id: 'ends', label: 'Ends', type: 'day' },
      { id: 'account', type: 'ref', to: 'accounts', index: true },
      { id: 'category', type: 'ref', to: 'categories', index: true },
      { id: 'party', label: 'Who', type: 'ref', to: 'people' },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['live', 'paused', 'ended'], default: 'live', index: true, required: true },
      { id: 'note', type: 'text' },
    ],
  },

  /**
   * SOMETHING PAID IN PARTS, one row a part. The plan is a name the rows share rather than a row of its
   * own, so the total is the sum of the parts and cannot disagree with them.
   */
  installments: {
    id: 'installments',
    name: 'Instalments',
    icon: 'calendar',
    one: 'instalment',
    holds: 'the parts of something paid over time, and the day each part falls due',
    title: 'what',
    mobile: ['what', 'amount', 'due'],
    state: 'state',
    done: ['paid', 'cancelled'],
    pack: 'money-core',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      { id: 'plan', type: 'text', index: true, required: true, search: true },
      { id: 'number', label: 'Instalment', type: 'int', min: 1 },
      { id: 'parts', label: 'Of', type: 'int', min: 1 },
      {
        id: 'direction',
        label: 'Which way',
        type: 'enum',
        values: ['in', 'out'],
        labels: { in: 'Money in', out: 'Money out' },
        index: true,
        required: true,
      },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'paid', 'cancelled'], default: 'open', index: true, required: true },
      { id: 'settled', label: 'Paid on', type: 'day' },
      { id: 'party', label: 'Who', type: 'ref', to: 'people' },
      { id: 'account', type: 'ref', to: 'accounts', index: true },
      { id: 'category', type: 'ref', to: 'categories', index: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'note', type: 'text' },
    ],
  },

  /**
   * WHAT AN ACCOUNT HELD ON A DAY, AS SOMETHING OTHER THAN A PERSON TYPING IT SAID, SINCE money-core 3.0.0.
   *
   * A BALANCE TYPED ONTO THE ACCOUNT IS ONE STATEMENT AND IT GOES STALE THE DAY IT IS TYPED. A statement, a bank
   * message that prints the balance, or a count of the cash box each says the same kind of thing on a later day, and
   * `cash-now` restarts an account from the newest of them and adds only what moved after it. Kept as rows rather than
   * written over the account, so the day each was true stays and a figure can be read as of any night.
   */
  balances: {
    id: 'balances',
    name: 'Balance checks',
    icon: 'money',
    one: 'balance check',
    holds: 'what an account held on a day, as a statement, a bank message or a count said it',
    title: 'source',
    mobile: ['account', 'balance', 'as_of'],
    pack: 'money-core',
    fields: [
      { id: 'account', type: 'ref', to: 'accounts', index: true, required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
      /* WHAT SAID IT: a statement, a bank's message, a count. The title, because a list of checks is read by where each
         came from. */
      { id: 'source', label: 'Said by', type: 'text', search: true },
    ],
  },

  /**
   * WHAT THE WHOLE POSITION WAS ON A NIGHT. One row a night, four figures across it, so a person can
   * ask what things looked like on the 14th and get an answer rather than four charts to line up.
   *
   * `on` IS UNIQUE, which is the whole of the exactly-once rule: a job that runs twice writes one row,
   * and a second reading for a night already taken is refused by name rather than quietly doubling a line.
   */
  snapshots: {
    id: 'snapshots',
    name: 'Snapshots',
    icon: 'history',
    one: 'snapshot',
    holds: 'what the money was on a night, so a figure can be compared with the day it was true',
    /**
     * THE TITLE IS THE NIGHT IN WORDS, AND IT WAS `on`, WHICH NOTHING COULD FIND.
     *
     * Every other register here declares `search: true` on its title and this one declared it on no field
     * at all, so thirty rows sat in the record that no query could reach: `A REGISTER WHOSE TITLE IS NOT
     * SEARCHABLE HOLDS ROWS NOBODY CAN FIND BY NAME` names the rule and this register was the one breaking it.
     *
     * AND `on` CANNOT BE THE SEARCHABLE ONE, WHICH WAS MEASURED RATHER THAN ARGUED. Declaring
     * `search: true` on it turned `the projection is the kernel's, string for string` red at
     * `snapshots#1`: the kernel indexes the stored value, `2026-08-04`, and the screen shows
     * `4 Aug 2026`, so a person typing what they can see would have missed every row and a person
     * typing the ISO day would have hit rows the browser said were not there. That is the
     * browser-more-permissive-than-the-record split `find.ts` exists to end, so the answer is a text
     * field holding the night the way every surface in the product already prints it.
     */
    title: 'what',
    mobile: ['what', 'cash', 'net'],
    pack: 'money-core',
    fields: [
      /* THE NIGHT, SPELLED THE WAY A DAY IS SPELLED ON SCREEN. It repeats `on`, and the repetition is the
         point: `on` is the day the arithmetic sorts and filters by, and this is the one a person types. */
      /**
       * NOT REQUIRED, AND IT WAS, AND THAT STRANDED EVERY RECORD THAT ALREADY HELD A SNAPSHOT.
       *
       * Driven through `normalise`, `plan` and `install`: money-core 1.2.0, one night written, then
       * 1.3.0 →
       *
       *     REQUIRED_ON_POPULATED at register.snapshots.fields.what.required
       *     "register.snapshots.what is required and 1 rows were written before it. Ship a default
       *      or a fill rule."
       *
       * `declare`'s `unreadable` records a `required: true` with no `default` where the installed
       * body had neither, and `install` answers before anything is staged. So a person on 1.2.0
       * could not take the upgrade at all, and the sentence names a field they have never heard of.
       *
       * AND THE TWO REPAIRS THE SENTENCE OFFERS WERE BOTH MEASURED AND NEITHER IS REACHABLE HERE. A
       * `default` is one stored constant, so every night before the upgrade would be called the
       * same thing, which is worse than a night with no name. A FILL RULE DOES NOT CLEAR THE
       * REFUSAL: `unreadable` looks at `default` and nothing else, and a rule runs after an install
       * that never happens; even if it ran, the only template `fill` reaches is `{{on}}`, the
       * STORED day, so the old rows would read `2026-08-04` in a list whose new rows read
       * `4 Aug 2026`: one list, two spellings of one title. `derived: true` is the kernel's own
       * flag, set by nothing today, and it refuses every write, so the seed could not fill it.
       *
       * SO THE NIGHT IS NAMED BY WHOEVER WRITES IT, and every writer here does. `on` is required
       * and unique, so a row with no name is still exactly one night and still sorts and filters;
       * what it loses is being findable by name, which is what it had before 1.3.0 anyway.
       */
      { id: 'what', label: 'Night', type: 'text', search: true },
      { id: 'on', label: 'Date', type: 'day', unique: true, required: true },
      { id: 'cash', label: 'Cash', type: 'money', required: true },
      { id: 'owed_to_me', label: 'Owed to you', type: 'money' },
      { id: 'owed_by_me', label: 'Owed by you', type: 'money' },
      /* CASH PLUS WHAT IS OWED TO YOU LESS WHAT YOU OWE. Stored rather than derived, because a snapshot
         is a reading and a reading recomputed later from rows that have changed is not one. */
      { id: 'net', label: 'Net', type: 'money' },
      { id: 'taken', label: 'Taken', type: 'enum', values: ['nightly', 'typed'], default: 'nightly', index: true, required: true },
      { id: 'note', type: 'text' },
    ],
  },
};

/**
 * The Money setting a record adds every currency up in. Read each time a figure is, so a change holds at once.
 *
 * AND IT DELIBERATELY HAS NO DEFAULT, WHICH A DEFAULT OF `GBP` WAS TRIED AGAINST AND MEASURED.
 * `founder-poll.test.ts` holds a record with one account in Egyptian pounds and one in dollars and
 * asserts that Cash now reads `null` until somebody chooses; with sterling defaulted in, the same
 * record answered 2808560. That is the whole argument: an unanswered question must read as
 * unanswered, because a figure converted at a rate nobody asked for looks exactly like a figure a
 * person chose, and this one is the number the owner decides against. Sterling being the pack's own
 * spelling of money, the shipped sample's currency and the app installer's chosen value does not
 * make it this record's answer.
 */
export const MONEY_HOME_SETTING = {
  home_currency: { type: 'text', label: 'Home currency', note: 'The currency money in other currencies is added up in, when there is a rate for it. Held to this as soon as it is saved.' },
} as const;

/**
 * THE FORMAT OF EVERY MONEY FIGURE, AND IT NAMES NO CURRENCY, SINCE money-core 3.0.0 (`loop/finish/modules.md` C1).
 *
 * Every figure here said `money.GBP`, read off the sample's rows, because until then the record refused a money figure
 * whose format named no currency. So a record in Egyptian pounds read "no more than £50,000.00" under figures about its
 * own money, and a record in one other currency and no home currency chosen read its cash one currency at a time. A
 * `money` figure is added up in the record's home currency when one is set, else in the one currency its rows are in,
 * else one amount per currency (`evaluateMetric`), which is the currency somebody chose and never the pack author's.
 */
const MONEY = 'money';

/**
 * THE TARGETS A PERSON CHANGES LATER, AS SETTINGS OF MONEY. A figure's target was fixed the day Money went in, so somebody
 * whose rent went up could not move "no more than" without reinstalling. Each of these is a setting of the pack, a sum of
 * money or a number of days, and the figure names it (`target.setting`): the record reads the setting each time the figure
 * is read, so a change holds the figure to it at once.
 *
 * A MONEY CEILING STARTS EMPTY, SINCE money-core 3.0.0, and empty is no target: the figure has no verdict until a person
 * types a sum. The sums that were here, GBP 50,000.00 owed in thirty days among them, were one studio's sizes in one
 * currency, and a pack cannot know either the size or the currency of the record it lands on (`loop/finish/modules.md`
 * C1). The sum a person types is held in the record's home currency (`liveTarget` in `packages/kernel/src/declare.ts`).
 * A number of days is no currency's, so its default stays the figure's own.
 */
export const MONEY_TARGET_SETTINGS: Readonly<Record<string, { setting: string; type: 'money' | 'number'; label: string }>> = {
  /* `most_out_30d` IS THE KEY AND THE WORDS ARE ONLY WORDS, so this label follows its figure: a saved ceiling is kept
     under the key whatever the label says (`test/money.test.ts`), and the ceiling caps what is OWED inside the thirty
     days rather than everything that leaves, which is `leaving-30d`'s. */
  'out-30d': { setting: 'most_out_30d', type: 'money', label: 'Most owed by you in 30 days' },
  'leaving-30d': { setting: 'most_leaving_30d', type: 'money', label: 'Most going out in 30 days' },
  'every-month-out': { setting: 'most_out_every_month', type: 'money', label: 'Most going out every month' },
  'every-month-by-category': { setting: 'most_on_one_category', type: 'money', label: 'Most a month on one category' },
  'spent-by-category-month': { setting: 'most_spent_on_one_category', type: 'money', label: 'Most spent on one category in a month' },
  'spent-30d': { setting: 'most_spent_30d', type: 'money', label: 'Most spent in 30 days' },
  'due-30d': { setting: 'most_due_30d', type: 'money', label: 'Most due in 30 days' },
  'owed-to-you': { setting: 'most_owed_to_you', type: 'money', label: 'Most owed to you at once' },
  'owed-by-you': { setting: 'most_owed_by_you', type: 'money', label: 'Most owed by you at once' },
  'installments-left': { setting: 'most_left_in_parts', type: 'money', label: 'Most left to pay in parts' },
  'installments-due-30d': { setting: 'most_parts_due_30d', type: 'money', label: 'Most in parts due in 30 days' },
  'days-late-in': { setting: 'most_days_late', type: 'number', label: 'Most days money in may be late' },
};

/** What a target setting says under its box on the settings screen. */
export const TARGET_NOTE = 'Held to this as soon as it is saved.';

type Decl = Record<string, unknown>;
const boundOf = (target: Decl): number | null => (typeof target.lte === 'number' ? target.lte : typeof target.gte === 'number' ? target.gte : null);

/**
 * A figure whose target is one of Money's settings, naming it; any other declaration as it was.
 *
 * A MONEY TARGET NEEDS NO NUMBER TO NAME ITS SETTING, because it has none until a person types one. A number of days
 * does: it is the default the setting starts at.
 */
export function withTargetSetting(d: Decl): Decl {
  const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
  const target = d.target as Decl | undefined;
  if (!said || !target || (said.type === 'number' && boundOf(target) === null)) return d;
  return { ...d, target: { ...target, setting: said.setting } };
}

/**
 * The settings a set of declarations' targets are held to. A number of days starts at the target it replaces; a sum of
 * money starts empty, which the record reads as no target, since a sum is in a currency and the pack knows none.
 */
export function targetConfigOf(declarations: readonly Decl[]): Record<string, Decl> {
  const config: Record<string, Decl> = {};
  for (const d of declarations) {
    const target = d.target as Decl | undefined;
    const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
    if (!said || !target || target.setting !== said.setting) continue;
    const bound = boundOf(target);
    config[said.setting] = { type: said.type, label: said.label, note: TARGET_NOTE, ...(said.type === 'number' && bound !== null ? { default: bound } : {}) };
  }
  return config;
}

/**
 * EVERY LIST ON THIS RECORD THAT HOLDS A DATED AMOUNT, WRITTEN ONCE, and walked by everything that walks: Cash ahead,
 * the next thirty days under it, and the figures that read a walk (`runway-days`, `arriving-30d`, `leaving-30d`). One
 * array cannot drift from itself, so the chart, the bridge and the tiles over it cross zero on the same day.
 *
 * ABOVE THE FIGURES AND NOT BESIDE THE PAGE, because the figures name it now and a `const` is not there to be read
 * before the line that makes it.
 *
 * REPEATING MONEY IS WALKED FROM `recurring` ALONE, SINCE money-core 3.0.0. The obligations leg walked `repeats` while
 * `recurring` sat out, and each was right about half the record: the sample wrote its streams as bills, and the Sam
 * Brain import writes each stream twice, as a bill that repeats monthly and as a line in `recurring`
 * (`packs/legacy-import/adapter.ts`). Walking both counts every stream twice on that record; walking only bills left a
 * salary typed into `recurring` out of every walk. So a bill is walked once, on its day, and a stream is walked where it
 * is a stream.
 */
const CASH_LEGS: Leg[] = [
  {
    register: 'obligations',
    on: 'due',
    amount: 'amount',
    /* ONE-OFFS ONLY: a bill that says it repeats is walked as its line in `recurring`, and walking the bill as well
       would spend it twice. Its own day still stands, so it is not dropped from anything that lists what falls due. */
    where: `${OPEN}, repeats is not monthly or quarterly or yearly`,
    incoming: { field: 'direction', is: 'owed_to_me' },
  },
  {
    register: 'recurring',
    on: 'next_due',
    amount: 'amount',
    where: 'state is live',
    incoming: { field: 'direction', is: 'in' },
    /* EVERY CADENCE THE LIST OFFERS, SO NONE MOVES ONCE AND STOPS. Twice a month is the first and the fifteenth, the days
       a pay run of that kind keeps. */
    every: {
      field: 'every',
      months: { monthly: 1, quarterly: 3, yearly: 12 },
      weeks: { weekly: 1, fortnightly: 2 },
      twice: { twice_monthly: [1, 15] },
    },
    /* THE ROW'S OWN END, SO THE WALK STOPS WHERE THE LINE DOES: the kernel stops on `ends` only when the leg names it. */
    ends: 'ends',
  },
  {
    register: 'installments',
    on: 'due',
    amount: 'amount',
    /* `state is open` AND THE PAID PARTS STAY OUT, the way a settled bill does: the money
       already moved and Cash now is standing on the far side of it. */
    where: 'state is open',
    incoming: { field: 'direction', is: 'in' },
    /* EACH PART SAYS WHICH PLAN IT IS IN, so Cash ahead can count a plan in or out whole. Its parts are titled
       `Proofing press, 3 of 8`, a different label every part, and the count control offers only what moves more than
       once (`streamsOf` in `packages/render/src/forecast.ts`), so without this no plan was offered at all. */
    group: 'plan',
    /* NO `every:`, AND THAT IS THE WHOLE TRAP OF THIS REGISTER. An instalment row is already one
       dated part, so a frequency over the top of it would charge the proofing press eight times
       eight. `INSTALLMENTS` in this file is `[1..8].map`, one row a payment, for exactly this
       reason. */
  },
  {
    /* MONEY ON ITS WAY, LANDING ON THE DAY THE ACCOUNT SAYS (`accounts.arrives`). Such an account does not count as cash
       yet, so Cash now leaves it out and this leg brings it in on its day. BANK ACCOUNTS ONLY, because a leg says money
       in by one field equalling one word, and a card's balance on its way is a debt, not a payout. */
    register: 'accounts',
    on: 'arrives',
    amount: 'balance',
    where: 'liquid is false, arrives is set, kind is bank',
    incoming: { field: 'kind', is: 'bank' },
  },
  {
    /* A SUBSCRIPTION IS WALKED FROM THE LIST THAT HOLDS IT, where a record holds one; a record without it installs Money
       with this leg left out (`firstPartyDocument`). */
    register: 'services',
    on: 'renews',
    amount: 'cost',
    where: 'state is not cancelled',
    every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
  },
];

/**
 * THE REPEATING LINES A MONTHLY FIGURE COUNTS: live, going the one way, and not past their last day.
 *
 * `ends` EMPTY, OR ON OR AFTER TODAY, which is the other side of `recurring-ended`'s `ends before today`. That rule moves
 * a line that has ended to `ended` on the hourly sweep, and until it has, `state is live` alone counted the line at its
 * full monthly share (`loop/finish/defects.md` M2). A line's last day is its own, so a line ending today still counts.
 *
 * THE TREE AND NOT THE SENTENCE, because the sentence joins its conditions with a comma or with a comma and `or`, never
 * both (`packages/where/src/sentence.ts`, `conditionsOf`), and this is two conditions and a choice between two more. The
 * kernel reads the tree for a figure as it reads a sentence, a relative day included (`metrics.ts` `resolveRelative`).
 */
const LIVE_LINES = (direction: 'in' | 'out'): Predicate => ({
  all: [
    { field: 'state', is: 'live' },
    { field: 'direction', is: direction },
    { any: [{ field: 'ends', empty: true }, { field: 'ends', after: 'yesterday' }] },
  ],
});

const DECLARED_METRICS: Record<string, SeedMetric> = {
  /**
   * WHAT IS IN THE BANK, the headline the owner asked for: "the money i have, not the money im
   * due/owed". Liquid accounts only, and remembered daily so the page can draw how it has moved.
   *
   * ROLLED FORWARD, SINCE money-core 3.0.0, AND IT WAS A SUM OF WHAT WAS TYPED. An account's `balance` is what somebody
   * said it held on its `as_of`, and every payment since was a row in `transactions` this figure never read, so it
   * stood still while the money moved. Now each account starts from the newest thing anybody said it held (its own
   * balance, a balance check, or a movement that printed the balance after it) and adds every cleared move dated after
   * that day (`packages/kernel/src/money-figures.ts`, `readRolled`). A transfer moves cash between accounts, so it is
   * counted here though no figure of spending counts it. The reading's `as_of` is the oldest start it used.
   */
  'cash-now': {
    metric: 'cash-now',
    name: 'Cash now',
    source: 'register.accounts',
    where: 'liquid is true',
    value: {
      rolled: {
        balance: 'balance',
        as_of: 'as_of',
        checks: [
          { register: 'balances', by: 'account', balance: 'balance', on: 'as_of' },
          { register: 'transactions', by: 'account', balance: 'balance_after', on: 'on' },
        ],
        moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out', where: 'state is cleared' },
      },
    },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.cash-now' },
    home: 1,
  },

  /* HOW MANY ACCOUNTS CASH NOW ADDS UP, AND THE OLDEST DAY ONE OF THEM WAS TRUE: the line under the
     hero figure, so a reader knows what it is a sum of and how old the weakest part of it is. */
  'cash-accounts': {
    metric: 'cash-accounts',
    name: 'Accounts counted as cash',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  },

  'cash-as-of': {
    metric: 'cash-as-of',
    name: 'Oldest balance',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { min: 'as_of' },
    format: 'day',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * HOW LONG THE MONEY LASTS: the days from today until the walk from Cash now first goes under, over a year.
   *
   * A FIGURE WITH A VALUE HAS ALREADY GONE UNDER INSIDE THE YEAR IT WALKS, and one that stays above zero has no value and
   * no verdict, so the target is the whole year: any crossing misses it, and the page says so in words only when it
   * does. The walk is Cash ahead's own (`CASH_LEGS`), so the figure and the chart under it cross on the same day.
   */
  'runway-days': {
    metric: 'runway-days',
    name: 'Days the money lasts',
    /* MONEY'S BY NAME, because a figure over the walk reads no one list and the first-party split files a declaration
       by the list it reads (`firstPartyManifest`): unnamed, the walk figures would go to no pack at all. */
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    opening: { metric: 'cash-now' },
    value: { walk: 'days_to_zero', within: '365d' },
    format: 'days',
    target: { gte: 365 },
    window: '30d',
    compare: 'none',
    home: 2,
  },

  /**
   * WHAT COMES IN AND GOES OUT OVER THE NEXT THIRTY DAYS, AS THE WALK COUNTS IT, SINCE money-core 3.0.0.
   *
   * THE TILES READ THE WALK THE BRIDGE AND THE FORECAST DRAW, over the same legs, so none of them can disagree. Before
   * this a figure read one list and the walk beside it read three, and the page said "Coming in" twice over two numbers
   * GBP 2,400.00 apart; the tiles were renamed to the one list they could count ("Owed to you, 30 days") rather than
   * made right. A figure over `forecast.runway` adds up the walk's own steps (`packages/kernel/src/money-figures.ts`,
   * `readWalk`), so money late in is still coming and money late out is still leaving, both on today.
   */
  'arriving-30d': {
    metric: 'arriving-30d',
    name: 'Coming in, 30 days',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'in', within: '30d' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'leaving-30d': {
    metric: 'leaving-30d',
    name: 'Going out, 30 days',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'out', within: '30d' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT BILLS AND INVOICES ALONE BRING IN AND TAKE OUT OVER THIRTY DAYS. Not on the Money page since money-core 3.0.0,
   * where the walk figures above count every list; kept, because use cases' pages draw them and a figure id is for ever.
   * The name says which part of the money it counts, so it never wears the walk's words. `before` is exclusive, so the
   * thirtieth day is `before +31d`.
   */
  'in-30d': {
    metric: 'in-30d',
    name: 'Owed to you, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE OTHER SIDE OF `in-30d`, AND THE COMMENT ABOVE IT IS THIS ONE'S TOO.
   *
   * A SETTING IS FOUND BY ITS KEY, NOT BY THE WORDS IT WAS SAVED UNDER. A saved value is written under `most_out_30d`,
   * the key this figure names in `target.setting`, and the label is text the settings screen prints beside the box, so
   * the words follow the figure and a ceiling saved under older words is kept (`test/money.test.ts`).
   */
  'out-30d': {
    metric: 'out-30d',
    name: 'Owed by you, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT GOES OUT EVERY MONTH WITHOUT ANYBODY DECIDING AGAIN: each repeating cost at its monthly
   * share, so a yearly insurance is a twelfth, a quarterly VAT bill a third and a weekly cleaner 52/12.
   *
   * IT READS `recurring`, SINCE money-core 3.0.0, AND IT READ `obligations.repeats`. The case for `recurring` was
   * always good (a repeating item has `next_due` that moves and `ends` that stops it, and the importer writes that
   * list) and it was held back because no use case seeded `recurring`, so the figure answered zero on every demo
   * record. Nothing is written as an example any more (`loop/finish/modules.md` C11), so a demo record is not a reason,
   * and the walk reads `recurring` too: the figure, the split under it and Cash ahead now read one list.
   *
   * A LINE THAT HAS ENDED IS OUT, ON ITS OWN DAY AND NOT ONLY WHEN THE SWEEP MOVES IT (`LIVE_LINES`).
   *
   * THE IDS STAY, and that is deliberate: `MONEY_TARGET_SETTINGS` holds a person's ceiling under
   * this name, the personal use case overrides its target under this name, and the series on the Money page
   * names it. Changing what a figure reads is a change to the figure; changing its id is a
   * change to everything pointing at it.
   */
  'every-month-out': {
    metric: 'every-month-out',
    name: 'Every month',
    source: 'register.recurring',
    where: LIVE_LINES('out'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /* WHAT COMES IN EVERY MONTH, the other side of `every-month-out`: a pay day, a retainer, each at its monthly share.
     The series counts it in every month ahead, as it counts what goes out, and it ends where that one does. */
  'every-month-in': {
    metric: 'every-month-in',
    name: 'Every month, in',
    source: 'register.recurring',
    where: LIVE_LINES('in'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* MONEY YOU ARE OWED THAT IS PAST ITS DATE, the other side of `overdue`. */
  'late-in': {
    metric: 'late-in',
    name: 'Late to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before today`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW LATE MONEY COMES IN, ON AVERAGE: the day it arrived less the day it was due, over the last year's
     paid rows. A fact about what happened, which the forecast's late knob marks, never a prediction. */
  'days-late-in': {
    metric: 'days-late-in',
    name: 'Money in arrives late by',
    source: 'register.obligations',
    where: 'state is paid, direction is owed to me, settled is set, settled after -12m',
    value: { diff: { of: { avg: 'settled' }, per: { avg: 'due' } } },
    format: 'days',
    target: { lte: 14 },
    window: '365d',
    compare: 'none',
  },

  /* WHAT GOES OUT EVERY MONTH, BY WHAT IT IS FOR: each repeating cost at its monthly share, grouped by category, over
     the list `every-month-out` reads, so the parts and the whole are one set of rows. */
  'every-month-by-category': {
    metric: 'every-month-by-category',
    name: 'Every month, by category',
    source: 'register.recurring',
    where: LIVE_LINES('out'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    group_by: 'category',
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * MONEY THAT MOVED, MONTH BY MONTH, READ FROM WHAT MOVED, SINCE money-core 3.0.0.
   *
   * THESE READ PAID BILLS BY THEIR `settled` DAY, AND NOTHING WROTE THAT DAY. `obligations` declared no `finished:`, so
   * `settled` was a field only the sample's rows held and a live record's history was empty however much money it had
   * moved. What moved is `transactions`, cleared and not between your own accounts, the same two clauses every figure of
   * spending counts by. Thirteen months back, so the twelve the series draws are whole and the current one is so far.
   */
  'in-by-month': {
    metric: 'in-by-month',
    name: 'Money in, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-by-month': {
    metric: 'out-by-month',
    name: 'Money out, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT WAS LEFT EACH MONTH: money in less money out over the same rows, the amount signed by its direction
     (`LOOKUPS.sign`), so the two halves are one reading and cannot be read over two different sets. */
  'net-by-month': {
    metric: 'net-by-month',
    name: 'Left over, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, on after -13m',
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: LOOKUPS.sign! },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHERE THIS MONTH'S MONEY WENT, BY WHAT IT WAS FOR: spending since the first of the month, grouped by category. A
     ceiling is the most a person means to spend on any one thing in a month. */
  'spent-by-category-month': {
    metric: 'spent-by-category-month',
    name: 'Spent this month, by category',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on at least bom',
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  'in-due-by-month': {
    metric: 'in-due-by-month',
    name: 'Due to come in, by month',
    source: 'register.obligations',
    /* ONE-OFF ROWS ONLY: a repeating row is counted in every month ahead at its monthly share (`every-month-in`), not
       only in the month its next due day falls in. */
    where: `${OPEN}, direction is owed to me, repeats is not monthly or quarterly or yearly, due after yesterday, due before +4m`,
    value: { sum: 'amount' },
    group_by: 'due',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-due-by-month': {
    metric: 'out-due-by-month',
    name: 'Due to go out, by month',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, repeats is not monthly or quarterly or yearly, due after yesterday, due before +4m`,
    value: { sum: 'amount' },
    group_by: 'due',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'owed-to-you': {
    metric: 'owed-to-you',
    name: 'Owed to you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me`,
    value: { sum: 'amount' },
    format: MONEY,
    /* A receivable book is good when it is SMALL, because every sum in it is money somebody
       else is holding. The target is the ceiling on that, not a sales goal, and a person sets it. */
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * THE WHOLE BOOK YOU OWE, AND IT WAS THE ONE FIGURE OF THE FOUR A SNAPSHOT HOLDS THAT NOTHING COMPUTED.
   *
   * `snapshots` stores `cash`, `owed_to_me`, `owed_by_me` and `net` on one row, and three of the four
   * had a figure behind them: `cash-now` reads the accounts, `owed-to-you` sums the receivable book,
   * and the net is the arithmetic over both. The payable book had `overdue`, which is only the part
   * already late (GBP 10,540 of a book several times that), so anything filling a snapshot had to
   * add the register up itself, which is a second answer to a question the record is supposed to own.
   *
   * IT IS `owed-to-you`'S CLAUSE WITH THE DIRECTION TURNED ROUND, deliberately word for word: two
   * figures over one register that disagree about which rows are still live is the defect, and they
   * cannot disagree if they share `OPEN`.
   */
  'owed-by-you': {
    metric: 'owed-by-you',
    name: 'Owed by you',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me`,
    value: { sum: 'amount' },
    format: MONEY,
    /* A CEILING, AND THE RECORD INSISTS ON ONE: `METRIC_NEEDS_TARGET_OR_WINDOW` refuses a figure with
       neither, in those words: *a number with no target is decoration*. Past some sum the book stops being a
       supplier's credit and becomes a cash problem, and that sum is the person's, in their currency, so it is a
       setting that starts empty. */
    target: {},
    window: '30d',
    compare: 'none',
  },

  'due-30d': {
    metric: 'due-30d',
    name: 'Due in 30 days',
    source: 'register.obligations',
    /* BOUNDED AT BOTH ENDS. `before +31d` alone counted everything already late as well, so an
       overdue bill was in this tile and in Overdue at once and the two could not be added. */
    where: `${OPEN}, direction is owed by me, due after yesterday, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
  },

  /* ONE DIRECTION, like the two tiles it sits beside. This once added receivables to payables and
     painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
     you owe. Those are not the same problem, and the sum is not a quantity. */
  overdue: {
    metric: 'overdue',
    /* WHAT THIS ONE IS ABOUT, and the word alone was not it. `direction is owed by me`: this is
       money YOU are late paying, and the saved view called "Overdue" is everything late in both
       directions. Two clicks apart, one word, two sets: a person reading `GBP 10,540` under
       "Overdue" and then opening the view was looking at a different question with no way to know. */
    name: 'Overdue to pay',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before today`,
    value: { sum: 'amount' },
    format: MONEY,
    /* Zero, and it is the one target in the record that is not a judgement call. */
    target: { lte: 0 },
    window: '30d',
  },

  /* ── what actually moved ─────────────────────────────────────────────────
     Every figure over the ledger says `transfer is false` and `state is cleared`. The first leaves out
     money moved between your own accounts, which is not spending; the second leaves out a payment the
     bank has taken and not yet settled, which is not a fact yet. A figure that omitted either would be
     a number about the same money counted twice, or about money that has not moved.

     THIRTY DAYS IN THE SENTENCE BECAUSE THE WINDOW IS THIRTY. `window: 30d` is how far the comparison moves
     the clock, and the window before is cut where this one starts, so it is thirty days whatever the
     sentence says. `after` does not include its own day, and these said `on after -31d`: today and the
     thirty before it, thirty-one days, compared with thirty and named "30 days". Measured in
     `test/money-bank.test.ts`: a cleared payment dated day -30 was counted. Now the two windows are the
     same length, abut, and share no day. */

  'spent-30d': {
    metric: 'spent-30d',
    name: 'Spent, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'previous',
  },

  'received-30d': {
    metric: 'received-30d',
    name: 'Received, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'previous',
  },

  /* WHAT NOBODY HAS SAID THE PURPOSE OF. The one figure over what moved that is a job rather than a
     fact, and the reason `txn-categorise` is worth declaring: it is what is left after the rule ran. */
  'txn-uncategorised': {
    metric: 'txn-uncategorised',
    name: 'Without a category',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, category is empty, on after -91d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* ── what comes round ────────────────────────────────────────────────────
     ONE NAME PER READING. `every-month-out` and `every-month-in` read `recurring`, the list a repeating item lives in,
     and there is no second pair over the same rows; the ids are the ones the page, the target settings and the
     personal use case already name. */

  /* ── paid in parts ───────────────────────────────────────────────────────
     What is left of every plan, and what falls due inside the month. Both are sums of the rows, never
     a plan's total less what has gone, so a cancelled part is out of both by its status alone. */

  'installments-left': {
    metric: 'installments-left',
    name: 'Left to pay',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  'installments-due-30d': {
    metric: 'installments-due-30d',
    name: 'Instalments due, 30 days',
    source: 'register.installments',
    /* `direction is out` WAS MISSING AND THE FIGURE ADDED THE TWO DIRECTIONS TOGETHER. A plan runs
       both ways: the proofing press goes out in eight parts and the Halden licence comes in in four,
       and on this record one part of each falls due today, so the figure read 615000 where 375000 is
       leaving. A number that is a payment plus a receipt is about nothing, and the figure above it
       carried the clause already. */
    where: 'state is open, direction is out, due before +31d',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },
};

/* EACH FIGURE WHOSE TARGET A PERSON CHANGES LATER NAMES ITS SETTING (`MONEY_TARGET_SETTINGS`), wherever Money is declared. */
export const MONEY_METRICS: Record<string, SeedMetric> = Object.fromEntries(
  Object.entries(DECLARED_METRICS).map(([id, m]) => [id, withTargetSetting(m as unknown as Decl) as unknown as SeedMetric]),
);

/**
 * The two rules Money ships with, and each one asks rather than acts.
 *
 * A QUESTION IN DECIDE, NOT A ROW OR A NOTE. An invoice more than a week late is a thing somebody chooses to
 * chase or not, and a balance a week old is a thing only a person can update; both are put in front of the
 * owner once, by the row and the day that made them true (`once_per`), and nothing else is written.
 * The record re-reads a rule about time as time passes, so an invoice that goes late while nobody touches
 * it is asked about too.
 */
export const MONEY_RULES: Record<string, SeedRule> = {
  'invoice-late': {
    rule: 'invoice-late',
    pack: 'money-core',
    register: 'obligations',
    when: 'direction is owed to me, state is open or part, due before -7d',
    then: [{ suggest: { question: '{{what}} was due {{ago:due}}, {{money:amount}}. Chase it?', options: ['Chase it', 'Not yet'] } }],
    once_per: ['entry', 'due'],
  },
  'cash-stale': {
    rule: 'cash-stale',
    pack: 'money-core',
    register: 'accounts',
    when: 'as_of before -7d',
    then: [{ suggest: { question: 'The balance of {{name}} was last set {{ago:as_of}}. Update it?', options: ['Update it', 'It has not changed'] } }],
    once_per: ['entry', 'as_of'],
  },
  /**
   * THE ONE RULE HERE THAT ACTS, and it acts because there is nothing to decide.
   *
   * A row whose description is a merchant a category already names has its category filed by the
   * record rather than asked about, which is the difference between a ledger somebody keeps and a
   * ledger somebody abandons: the third time `FENWICK CLOUD` arrives, being asked what it is for is an
   * insult. What the rule cannot reach is what the figure counts, so nothing is hidden by it.
   *
   * IT MATCHES THE WHOLE DESCRIPTION, EXACTLY, until `link:` reads how each category asks to be matched.
   * `link:` is an equality against one stored value, so a category's `match` is the counterparty as the
   * bank writes it, and a merchant that arrives under two spellings needs two categories or a person.
   * `categories.match_by` (since money-core 3.0.0) is where a category says "how it starts" or "anywhere
   * in it", and a rule that files by it reads it there; until then every category is matched whole,
   * which is what `exact`, its default, says.
   *
   * `once_per: [entry]` means once a row, ever. A category cleared by hand afterwards stays cleared,
   * which is `32-PARITY` §3.2's rule that a field a person set is never overwritten by a rule.
   */
  'txn-categorise': {
    rule: 'txn-categorise',
    pack: 'money-core',
    register: 'transactions',
    when: 'state is cleared, transfer is false, category is empty',
    then: [{ link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}' } } }],
    once_per: ['entry'],
  },
  /**
   * AN INSTALMENT IS TOLD, NOT ASKED. The two rules above ask because there is a choice in front of
   * the person: chase or wait, update or leave it. A part of a plan already agreed has no choice in
   * it, so a question with two options would be a question whose answer is always the same, and the
   * gate is the one place in this product that must never fill up with those.
   */
  'installment-due-soon': {
    rule: 'installment-due-soon',
    pack: 'money-core',
    register: 'installments',
    when: 'state is open, due before +8d',
    then: [{ notify: { say: '{{what}} is due {{until:due}}: {{money:amount}}.' } }],
    once_per: ['entry', 'due'],
  },
  /**
   * A REPEATING ITEM WHOSE DAY HAS GONE AND WHICH IS STILL LIVE. Either it went out and nobody moved
   * the date, or it did not go out at all, and those are different problems with one symptom. The
   * record says which day it was and leaves the reading to the person.
   */
  'recurring-missed': {
    rule: 'recurring-missed',
    pack: 'money-core',
    register: 'recurring',
    when: 'state is live, next_due before today',
    then: [{ notify: { say: '{{what}} was due {{ago:next_due}}, {{money:amount}}, and its next day has not moved.' } }],
    once_per: ['entry', 'next_due'],
  },
  /**
   * A SCHEDULE WHOSE LAST DAY HAS GONE, MOVED AS WELL AS FILTERED AROUND.
   *
   * NOTHING IN THE TREE EVER FLIPPED `state` WHEN `ends` PASSED, and every reader of `recurring`
   * paid for it: a line that stopped in March was counted at its full monthly share for ever by
   * every block and figure that read `state is live`.
   *
   * THE MONTHLY FIGURES FILTER ON `ends` AS WELL, SINCE money-core 3.0.0 (`LIVE_LINES`), in the tree
   * form, because the sentence cannot join a choice to the other clauses. A block or a list a person
   * filters by hand reads the sentence, so the row is moved too: `ends is empty` alone would drop
   * exactly the rows still running, because the importer writes `ends` only when it is ahead
   * ("It ended before the export" in `packs/legacy-import/adapter.ts`).
   *
   * SO THE ROW IS MOVED WHERE IT IS. `rulesAboutTime` (`packages/kernel/src/index.ts`) sweeps
   * hourly every rule whose `when:` names a relative day and which declares `once_per`, so this one
   * is re-read as time passes rather than only when somebody writes the row, and one `move` puts the
   * register page and every other reader right at once.
   *
   * IT ACTS INSTEAD OF ASKING, for the reason `installment-due-soon` tells instead of asking: a
   * schedule that says it stopped in March has nothing left to decide, and a question whose answer
   * is always the same is what must never fill the gate.
   *
   * `once_per: ['entry', 'ends']` IS ONCE A ROW PER END DAY. A person who reopens a schedule by
   * hand and leaves the old `ends` behind it keeps their write, which is `32-PARITY` §3.2; one who
   * moves `ends` forward is out of the filter anyway, and one who moves it to another past day is
   * asking for it to end again and gets that.
   */
  'recurring-ended': {
    rule: 'recurring-ended',
    pack: 'money-core',
    register: 'recurring',
    when: 'state is live, ends before today',
    then: [{ move: 'ended' }],
    once_per: ['entry', 'ends'],
  },
};

/* ── the page ────────────────────────────────────────────────────────────── */

/**
 * WHAT FALLS DUE THIS WEEK, AS ONE BLOCK A USE CASE'S HOME TAKES, SINCE money-core 3.0.0.
 *
 * It was the second block of money-core's own `home` page, which retired with the house Home: a record's Home is its
 * use case's `home-<id>` page, else the default Home, which names no list (`loop/finish/modules.md` C8). The founder's
 * Home takes this block by reference (`usecases/founder.ts`), so the window, the columns and the order stay one
 * declaration and cannot drift from each other.
 */
export const DUE_THIS_WEEK: Readonly<Record<string, unknown>> = {
  kind: 'table',
  heading: 'Due this week',
  span: 12,
  source: 'register.obligations',
  where: 'state is open or part, due before +8d',
  columns: [
    { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
    { field: 'party', label: 'Who', width: 'minmax(10ch,18ch)' },
    { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
    { field: 'due', label: 'Due', width: '13ch', align: 'end' },
  ],
  order: [{ field: 'due', dir: 'asc' }],
  limit: 6,
  empty: 'Nothing is due this week.',
};

export const MONEY_PAGES: Record<string, SeedPage> = {
  /**
   * MONEY IS A FINANCE PAGE, NOT A LEDGER OF WHO OWES WHOM (`loop/DIRECTION.md` §2, `research-modules.md`
   * §2.1). It leads with the money there is, then how long it lasts, then what comes in and goes out;
   * which way an amount goes is a property of the row, never the frame of the page.
   *
   * "i want the headlines to be the money i have, not the money im due/owed" (the owner, in Sam
   * Brain's own Money screen). So the hero figure is Cash now, read from the accounts, and every walk
   * on this page starts from that same figure rather than from a balance typed into the page.
   *
   * ONE PAGE, SINCE money-core 3.0.0, AND IT WAS THREE: Overview, Ledger, and the house Home (`loop/finish/modules.md`
   * MOD-4). Overview looked ahead over bills, Ledger looked back over payments, and a person asking what happened to
   * their money had to know which of the two answered it. A page holds no rows, so the two that retire take nothing
   * with them. IT NEEDS NO PEOPLE: who a row is with is a link (`LINKS` in `packs/first-party.ts`), and no block here
   * reads it, so Money installs and draws on a record with People off.
   */
  money: {
    page: 'money',
    title: 'Money',
    nav: { section: 'Money', order: 10 },
    icon: 'money',
    requires: ['register.accounts', 'register.obligations', 'register.transactions', 'register.recurring', 'register.installments', 'register.categories'],
    pack: 'money-core',
    blocks: [
      {
        /* WHAT YOU HAVE, THEN HOW LONG IT LASTS, THEN WHAT MOVES IN THE NEXT THIRTY DAYS. The figures after it read the one walk
           "Cash ahead" and "The next 30 days" draw below (`CASH_LEGS`), so a tile and the chart under it cannot give two
           answers about the same month. Cash now carries its twelve weeks as a line. */
        kind: 'stat',
        lead: true,
        heading: 'What you have',
        span: 12,
        cells: [
          { metric: 'cash-now', label: 'Cash now', trend: '12w', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' },
          { metric: 'runway-days', label: 'Lasts until' },
          { metric: 'arriving-30d', label: 'Coming in, 30 days' },
          { metric: 'leaving-30d', label: 'Going out, 30 days' },
        ],
      },
      {
        /* WHERE THE MONEY IS, one card an account, with the day each balance was true. SECOND AND NOT LAST, because a
           fresh record's first job is to say what is in the bank, and every figure above reads from it. */
        kind: 'cards',
        heading: 'Accounts',
        span: 8,
        source: 'register.accounts',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'balance', as: 'figure' },
          { field: 'kind', label: 'Type', as: 'fact' },
          { field: 'as_of', label: 'As of', as: 'when' },
        ],
        order: [{ field: 'seq', dir: 'asc' }],
        /* A BALANCE OLDER THAN A WEEK IS SAID TO BE OUT OF DATE (25 §9). */
        stale: { field: 'as_of', after: '7d' },
        empty: 'No accounts yet. Add what is in the bank and this page starts from it.',
      },
      {
        /* THE FIRST BALANCE IS ADDED HERE, beside the accounts it joins, and not from a link at the foot of the page that
           leaves it. */
        kind: 'capture',
        heading: 'Add an account',
        span: 4,
        register: 'accounts',
      },
      {
        /* WHAT A RULE OR AN AGENT HAS ASKED ABOUT MONEY, answered where it is shown, three at a time, and the rest are in
           Decide. No `empty:` of its own: with nothing waiting the queue says its own line (`QUEUE_CLEARED` in
           `packages/render/src/queue.ts`). */
        kind: 'queue',
        heading: 'Waiting on you',
        span: 12,
        source: 'governance.open',
        where: 'list is obligations or transactions or accounts or recurring or installments',
        limit: 3,
      },
      {
        /* HOW LONG THE MONEY LASTS: cash remembered up to today, then the walk from Cash now, a repeating row
           spent every time it comes round. A reader can ask what if clients pay later, what if there is
           spending the record does not know, or what if a large movement does not happen; the answer is
           arithmetic over the same walk, and nothing is written. Every movement is in the fold under it. */
        kind: 'forecast',
        heading: 'Cash ahead',
        span: 12,
        source: 'forecast.runway',
        opening: { metric: 'cash-now' },
        recorded: 'cash-now',
        /* THE LEGS ARE THE LISTS THAT HOLD A DATED AMOUNT (`CASH_LEGS`), the one array the tiles above walk too. A runway
           that is too high is the direction this block must never be wrong in, because a person reads it to decide what
           to shut down, so every list that moves money on a day is a leg: bills, what repeats, instalments, money on its
           way, and subscriptions where Estate is held. */
        from: CASH_LEGS,
        /* A YEAR DRAWN FIRST, AND UP TO FIVE AND TO THE LAST DATED MOVEMENT OFFERED, because an instalment plan or a loan
           can run a decade and a quarter is too short to see one end. */
        horizon: 365,
        horizons: [90, 180, 365, 730, 1825, 'last'],
        /* COUNTING A PLAN OR A STREAM IN OR OUT IS ONE CONTROL, `count`, and `leave` is folded into it: two controls over
           the same streams with opposite meanings was one question asked two ways. Drift draws a slider only for a pair
           some step was converted through, so a record in one currency sees none. `sell` offers what a pack declares
           `sellable` (the holdings pack's figures), and draws nothing on a record that holds none. */
        knobs: ['horizon', 'late', 'spend', 'count', 'grow', 'drift', 'sell'],
        /* THE LATE KNOB MARKS HOW LATE MONEY HAS COME IN, and the chart says how many days are left when the
           walk goes under inside a month. */
        late: 'days-late-in',
        under: 30,
        empty: 'Nothing dated in the next twelve months.',
      },
      {
        /* THE NEXT THIRTY DAYS AS ARITHMETIC: cash now, plus what arrives, less what leaves, and where
           that lands. It walks what the block above it walks, over a shorter horizon, and it is the same array,
           so a leg in one and not the other cannot become two answers about the same thirty days. */
        kind: 'bridge',
        heading: 'The next 30 days',
        span: 5,
        source: 'forecast.runway',
        opening: { metric: 'cash-now' },
        from: CASH_LEGS,
        horizon: 30,
        empty: 'Nothing dated in the next 30 days.',
      },
      {
        /* WHERE THIS MONTH'S MONEY WENT, BY WHAT IT WAS FOR, from what moved and not from what was promised: the clauses
           of `spent-by-category-month`, cleared and not between your own accounts. What no category holds is said last
           and opens those rows, so the hole is a job and not a gap. */
        kind: 'split',
        heading: "Where this month's money went",
        span: 7,
        source: 'register.transactions',
        where: 'state is cleared, transfer is false, direction is out, on at least bom',
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 6,
        unset: 'Uncategorised',
        empty: 'Nothing has gone out this month.',
      },
      {
        /* WHAT FALLS DUE IN THE NEXT THIRTY DAYS, ACROSS MONEY'S LISTS THAT HOLD A DUE DAY, overdue first and then by
           day, in the order the record gives (`deadlines`). The amount carries its own sign, so which way a row's money
           goes is a property of the row rather than the table it sits in. */
        kind: 'table',
        heading: 'Coming up',
        span: 12,
        source: 'deadlines',
        where: 'list is obligations or recurring or installments',
        horizon: 30,
        columns: [
          { field: 'title', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
          { field: 'day', label: 'Due', width: '13ch', align: 'end' },
        ],
        limit: 12,
        empty: 'Nothing falls due in the next 30 days.',
      },
      {
        /* NOTES THAT DRAW ONLY WHEN THEY ARE TRUE, and say what is late, never what the law says about it: a page
           everybody's Money draws does not speak for one country's courts. */
        kind: 'note',
        tone: 'warn',
        heading: 'Late to you',
        span: 12,
        body: 'Money you are owed has gone past its date: {{late-in}} in all.',
        when: { metric: 'late-in', gt: 0 },
      },
      {
        kind: 'note',
        tone: 'bad',
        heading: 'Late to pay',
        span: 12,
        body: 'Money you owe has gone past its date: {{overdue}} in all.',
        when: { metric: 'overdue', gt: 0 },
      },
      {
        /* MONTH BY MONTH: what moved in and out in the twelve months to now, read from `transactions`, and what is due in
           the three after, with what was left each month as a line. The current month is so far, and the months ahead
           are what is due once plus what repeats at its monthly share, in every one of them. */
        kind: 'series',
        heading: 'In and out, by month',
        span: 12,
        series: [
          { metric: 'in-by-month', then: 'in-due-by-month', each: 'every-month-in', label: 'Money in' },
          { metric: 'out-by-month', then: 'out-due-by-month', each: 'every-month-out', label: 'Money out', dir: 'out' },
        ],
        back: 12,
        ahead: 3,
        net: true,
        empty: 'Nothing moved or due in these months.',
      },
      {
        /* WHAT GOES OUT EVERY MONTH, by what it is for, at each line's monthly share: the parts of `every-month-out`, over
           the same rows. */
        kind: 'split',
        heading: 'Every month',
        span: 12,
        source: 'metric.every-month-by-category',
        limit: 6,
        unset: 'Uncategorised',
        empty: 'Nothing repeats every month.',
      },
      {
        /* WHAT MOVED, NEWEST FIRST. The amount carries its own sign from the row. Ten, so the page stays a page; the list
           holds the rest, and the table's own link opens it. */
        kind: 'table',
        heading: 'What moved',
        span: 12,
        source: 'register.transactions',
        where: 'state is not void',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'account', label: 'Account', width: 'minmax(10ch,16ch)' },
          { field: 'category', label: 'For', width: 'minmax(8ch,14ch)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
          { field: 'on', label: 'Date', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'on', dir: 'desc' }],
        limit: 10,
        empty: 'Nothing has moved yet. Add what left the bank and this page starts from it.',
      },
      {
        /* WHAT RULES AND AGENTS DID TO MONEY, from the record's own log, so a payment a rule filed or a balance an agent
           wrote is seen where the money is and not only in History. */
        kind: 'feed',
        heading: 'What agents and rules did',
        span: 12,
        source: 'activity',
        where: 'actor is agent or rule, list is transactions or obligations or accounts',
        first: 5,
        empty: 'Nothing has been changed here by a rule or an agent yet.',
      },
    ],
  },
};

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
