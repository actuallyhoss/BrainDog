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
 */

import { LOOKUPS, OPEN, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister, type SeedRule } from './base.ts';

/* ── obligations ─────────────────────────────────────────────────────────── */

const HAND_OBLIGATIONS: Fields[] = [
  { what: 'Invoice 2026-041: brand system', party: 1, direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', thing: 2, category: 'client_work', note: 'Chased twice. 45-day terms expired 3 August.' },
  { what: 'Invoice 2026-046: retainer, August', party: 2, direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', thing: 2, category: 'client_work', note: '' },
  { what: 'Illustration, July set', party: 3, direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open', thing: 1, category: 'contractors', note: '' },
  { what: 'Corporation tax, payment on account', party: null, direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open', thing: null, category: 'tax', note: 'HMRC reference on the letter, not here.' },
  { what: 'Invoice 2026-049: type licensing', party: 1, direction: 'owed_to_me', amount: gbp(96_000), due: day(11), state: 'open', thing: 1, category: 'licensing', note: '' },
  { what: 'Accountant, year-end fee', party: 4, direction: 'owed_by_me', amount: gbp(145_000), due: day(19), state: 'part', thing: null, category: 'professional', repeats: 'yearly', note: 'Half paid in June.' },
  { what: 'Backend contract, September', party: 6, direction: 'owed_by_me', amount: gbp(496_000), due: day(27), state: 'open', thing: 3, category: 'contractors', repeats: 'monthly', note: '' },
  { what: 'Invoice 2026-038: discovery', party: 2, direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid', thing: 2, category: 'client_work', settled: day(-41), note: 'Paid 24 July.' },
  { what: 'Invoice 2026-035: brand refresh', party: 1, direction: 'owed_to_me', amount: gbp(620_000), due: day(-96), state: 'paid', thing: 2, category: 'client_work', settled: day(-51), note: '' },
  { what: 'Studio insurance, annual', party: null, direction: 'owed_by_me', amount: gbp(38_400), due: day(41), state: 'open', thing: null, category: 'insurance', repeats: 'yearly', note: '' },
  { what: 'VAT quarter to 31 Aug', party: null, direction: 'owed_by_me', amount: gbp(742_000), due: day(63), state: 'open', thing: null, category: 'tax', repeats: 'quarterly', note: '' },
  { what: 'Conference stand, deposit', party: null, direction: 'owed_by_me', amount: gbp(250_000), due: day(88), state: 'open', thing: 1, category: 'events', note: 'Refundable to 30 days out.' },
  { what: 'Invoice 2026-051: newsletter setup', party: 2, direction: 'owed_to_me', amount: gbp(75_000), due: day(33), state: 'open', thing: 3, category: 'client_work', note: '' },
  { what: 'Illustration, August set', party: 3, direction: 'owed_by_me', amount: gbp(118_000), due: day(15), state: 'open', thing: 1, category: 'contractors', repeats: 'monthly', note: '' },
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
    // The further past a date a row is, the likelier it was settled — which is what makes the few
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
 * The rows that repeat, written after the generated tail so every earlier row keeps its number.
 *
 * The storefront payout is money in that arrives every month without an invoice, so the walk has a
 * recurring income as well as recurring costs, and the rent is the one fixed cost every studio has.
 */
const RECURRING: Fields[] = [
  { what: 'Kiln storefront payout', party: null, direction: 'owed_to_me', amount: gbp(93_000), due: day(12), state: 'open', thing: 1, note: '', category: 'licensing', repeats: 'monthly' },
  { what: 'Studio rent', party: null, direction: 'owed_by_me', amount: gbp(165_000), due: day(28), state: 'open', thing: null, note: '', category: 'premises', repeats: 'monthly' },
];

export const OBLIGATIONS: Fields[] = [
  ...HAND_OBLIGATIONS,
  ...generatedObligations(24),
  ...RECURRING,
];

/* ── accounts ────────────────────────────────────────────────────────────── */

/**
 * Where the money is, typed in or pasted, with the day each balance was true.
 *
 * NO BANK CONNECTION (25 §10): a balance is a row somebody or an agent writes, and `as_of` is what
 * makes it honest. `liquid` says whether it counts as cash now: a card's balance is owed, not held.
 */
export const ACCOUNTS: Fields[] = [
  { name: 'Studio current account', kind: 'bank', balance: gbp(985_000), as_of: day(-1), liquid: true },
  /* NOT UPDATED FOR OVER A WEEK, so the page shows what an out-of-date balance looks like. */
  { name: 'Tax reserve', kind: 'bank', balance: gbp(2_400_000), as_of: day(-9), liquid: true },
  { name: 'Company card', kind: 'card', balance: gbp(-124_000), as_of: day(-2), liquid: false },
];

/* ── categories ──────────────────────────────────────────────────────────── */

/**
 * What money is for, as rows rather than as a fixed list.
 *
 * `obligations.category` IS AN ENUM AND THIS IS A REGISTER, and the two are deliberately not the same
 * kind of thing yet. An enum is a pack's list: a person cannot add "Childcare" to it without a new
 * declaration. A ledger is the opposite case, because the categories somebody actually uses are
 * discovered over the first month and half of them are theirs alone. So the names below are the enum's
 * names, one for one, and a later pass can move `obligations` onto the register with a mapping that is
 * already written. Two lists that disagree would be the failure; two lists that agree row for row are
 * one list waiting for a migration.
 *
 * `match` IS THE COUNTERPARTY EXACTLY AS THE BANK WRITES IT, and it is what `txn-categorise` links on.
 * One string per category, because a rule's `link:` is an equality against one stored value and the
 * record has no substring test a declaration can reach (`contains` is not in the sentence grammar, and
 * `derive:` is published and unbuilt). Five of the ten carry one, and the three merchants no category
 * names stay uncategorised, which is what the Ledger page counts and what a person fixes in one tap.
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
     different account. Both legs are marked, and every figure on the Ledger page leaves them out. */
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
 * THREE FREQUENCIES AND NOT FIVE, because `LOOKUPS.per_month` knows three. A weekly or fortnightly row
 * would be counted at nothing a month by every figure that reads the table, which is worse than
 * refusing it: the importer leaves weekly and fortnightly rows out for the same reason
 * (`loop/research-switch.md` §4).
 */
export const RECURRING_ITEMS: Fields[] = [
  { what: 'Studio rent', direction: 'out', amount: gbp(165_000), every: 'monthly', next_due: day(28), started: day(-640), account: 1, category: 5, state: 'live', note: '' },
  { what: 'Fenwick Cloud, Workers plan', direction: 'out', amount: gbp(4_200), every: 'monthly', next_due: day(9), started: day(-410), account: 3, category: 4, thing: 1, state: 'live', note: '' },
  { what: 'Kiln storefront payout', direction: 'in', amount: gbp(93_000), every: 'monthly', next_due: day(12), started: day(-300), account: 1, category: 2, thing: 1, state: 'live', note: 'Money in that arrives without an invoice.' },
  { what: 'Backend contract, S. Marchetti', direction: 'out', amount: gbp(496_000), every: 'monthly', next_due: day(27), started: day(-120), account: 1, party: 6, category: 3, thing: 3, state: 'live', note: 'Two days a week.' },
  { what: 'VAT', direction: 'out', amount: gbp(742_000), every: 'quarterly', next_due: day(63), started: day(-730), account: 2, category: 6, state: 'live', note: '' },
  { what: 'Studio insurance', direction: 'out', amount: gbp(38_400), every: 'yearly', next_due: day(41), started: day(-690), account: 1, category: 7, state: 'live', note: '' },
  /* A ROW THAT IS PAST ITS DAY AND STILL LIVE, so `recurring-missed` has something to say and the page
     is not a list where every item is in the happy state. */
  { what: 'Ledger Post, sending plan', direction: 'out', amount: gbp(3_900), every: 'monthly', next_due: day(-4), started: day(-220), account: 3, category: 4, thing: 3, state: 'live', note: '' },
  /* AND ONE THAT HAS STOPPED, so Status is worth a column: the Hobnail plan was cancelled in July and
     the row stays, because a figure about last spring still needs it. */
  { what: 'Hobnail plan', direction: 'out', amount: gbp(2_900), every: 'monthly', next_due: day(-58), started: day(-500), ends: day(-58), account: 3, category: 4, thing: 4, state: 'ended', note: 'Cancelled with the Tallow wind-down.' },
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
    out.push({ on: at, cash: gbp(cash), owed_to_me: gbp(toMe), owed_by_me: gbp(byMe), net: gbp(cash + toMe - byMe), taken: 'nightly', note: '' });
  }
  return out;
}

export const SNAPSHOTS: Fields[] = snapshotRows();

export const MONEY_REGISTERS: Record<string, SeedRegister> = {
  obligations: {
    id: 'obligations',
    /**
     * `Money`, AND IT WAS `Obligations`.
     *
     * IT IS THE FIRST WORD A STRANGER READS AFTER THEIR FIRST ACTION, and it was a word the
     * product never showed them. The first-run screen offers five cards and the first is **Money**,
     * "What you owe, and what you are owed"; choosing it landed on a screen whose largest type said
     * *Obligations*, defined nowhere. A friction pass measured the whole first run and put this one
     * word above the other twenty-nine together, for that reason: every other tax word is met by
     * somebody already oriented, and this one is met by somebody who has just been told what they
     * were choosing and finds it renamed.
     *
     * THE ID IS UNTOUCHED. `obligations` is what the URL says, what a predicate says, and what an
     * agent writes, and `19 §9`'s rule is the one Slack follows rather than the one Notion follows:
     * the interface says the word a person would say, for life, and the API keeps its own. Renaming
     * the id would be a migration; renaming the label is a label.
     */
    name: 'Money',
    icon: 'obligation',
    /* `item`, because half of these are owed to you and half by you: `bill` is wrong for an invoice
       you sent and `invoice` is wrong for a tax payment. */
    one: 'item',
    holds: 'what you owe and what you are owed, with a date and a currency',
    title: 'what',
    /* WHICH WAY THE MONEY GOES, on the one screen that could not say. A card shows three declared
       fields and these were `what`, `amount`, `due` — so a phone rendered `Corporation tax, payment
       on account · GBP 19,100.00 · 7 Sep 2026` in a card identical to an invoice somebody owes YOU,
       and nothing on it said which. Direction is the fact a reader cannot recover from anything else
       on the card; a due date is one row-tap away, and lateness still reads, because the card wears
       the row's tone. */
    mobile: ['what', 'amount', 'direction'],
    state: 'state',
    done: ['paid', 'written_off'],
    pack: 'money-core',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      /* `Who`, AND IT WAS `Party`. A column header is read at a glance by somebody scanning for a
         name, and `Party` is a legal word for the same thing that reads as a social event. */
      { id: 'party', label: 'Who', type: 'ref', to: 'people', index: true },
      /* `Which way`, AND IT WAS `Direction`. The values already read as English: "owed by me" and
         "owed to me". The header above them was the only abstract word in the pair. */
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
      /* `Status`, AND IT WAS `State` — here and on services, sessions, threads and tasks.
         `columnsFor` draws every indexed field and `labelOf` falls back to the id, so five of the
         six lists that carry this concept headed the column `State` while `things` labelled its
         own `Status` at the declaration two hundred lines down. One concept, two headers, and the
         reader meets both inside a minute: `copy.ts` had already caught the same split from the
         other side, where a hardcoded "Set state" put a field's three names on one screen.
         `Status` is the word every product the reader has already used says, and it is the one the
         record was half saying. The field id stays `state`, which is what a predicate says, what
         `done:` lists and what `05 §254` makes a path a page can hold. */
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'note', type: 'text' },
      /* WHAT IT IS FOR, so a page can say where the money goes. Indexed, because a page groups by it
         and a list filters on it. Money in is client work or licensing; the rest is spending. */
      {
        id: 'category',
        type: 'enum',
        values: ['client_work', 'licensing', 'contractors', 'tax', 'software', 'premises', 'professional', 'production', 'insurance', 'events', 'other'],
        labels: {
          client_work: 'Client work',
          licensing: 'Licensing',
          contractors: 'Contractors',
          tax: 'Tax',
          software: 'Software',
          premises: 'Premises',
          professional: 'Professional fees',
          production: 'Production',
          insurance: 'Insurance',
          events: 'Events',
          other: 'Other',
        },
        index: true,
      },
      /* THE DAY IT WAS PAID, which is not the day it was due. How late each client pays is the gap. */
      { id: 'settled', label: 'Paid on', type: 'day' },
      /* HOW OFTEN IT COMES ROUND. The cash walk reads it, so a monthly bill is spent every month. */
      { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'yearly'] },
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
    ],
  },
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
      /* THE COUNTERPARTY EXACTLY AS THE BANK WRITES IT, which is what `txn-categorise` links on. */
      { id: 'match', label: 'Matches', type: 'text', index: true },
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
    mobile: ['what', 'amount', 'on'],
    state: 'state',
    done: ['cleared', 'void'],
    pack: 'money-core',
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
       * transfer has no category: it is not for anything. Every figure on the Ledger page says
       * `transfer is false`, and the default is false so a row nobody marks is counted.
       *
       * A PERSON SETS IT, IN THIS BUILD. `02 §5`'s `pairs: { on, opposite, across, within, mark }` is
       * the register option that would find the two legs and set it, and it is on the kernel's
       * published-and-unbuilt list, so declaring it here would be refused. The field is the half that
       * is real now, and it is the half `pairs:` would write into when it arrives.
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
   */
  recurring: {
    id: 'recurring',
    name: 'Repeating',
    icon: 'refresh',
    one: 'repeating item',
    holds: 'the money that comes in and goes out every month without anybody deciding again',
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
      /* THREE, AND THEY ARE `LOOKUPS.per_month`'S THREE. A frequency the factor table does not know is
         counted at nothing a month by every figure that reads this list, which is a silent zero. */
      { id: 'every', label: 'How often', type: 'enum', values: ['monthly', 'quarterly', 'yearly'], index: true, required: true },
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
    title: 'on',
    mobile: ['on', 'cash', 'net'],
    pack: 'money-core',
    fields: [
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

/** The Money setting a record adds every currency up in. Read each time a figure is, so a change holds at once. */
export const MONEY_HOME_SETTING = {
  home_currency: { type: 'text', label: 'Home currency', note: 'The currency money in other currencies is added up in, when there is a rate for it. Held to this as soon as it is saved.' },
} as const;

/**
 * THE TARGETS A PERSON CHANGES LATER, AS SETTINGS OF MONEY. A figure's target was fixed the day Money went in, so somebody
 * whose rent went up could not move "no more than" without reinstalling. Each of these is a setting of the pack, a sum of
 * money or a number of days, and the figure names it (`target.setting`): the record reads the setting each time the figure
 * is read, so a change holds the figure to it at once. The default is the figure's own target, or the use case's.
 */
export const MONEY_TARGET_SETTINGS: Readonly<Record<string, { setting: string; type: 'money' | 'number'; label: string }>> = {
  'out-30d': { setting: 'most_out_30d', type: 'money', label: 'Most going out in 30 days' },
  'every-month-out': { setting: 'most_out_every_month', type: 'money', label: 'Most going out every month' },
  'every-month-by-category': { setting: 'most_on_one_category', type: 'money', label: 'Most a month on one category' },
  'due-30d': { setting: 'most_due_30d', type: 'money', label: 'Most due in 30 days' },
  'owed-to-you': { setting: 'most_owed_to_you', type: 'money', label: 'Most owed to you at once' },
  'days-late-in': { setting: 'most_days_late', type: 'number', label: 'Most days money in may be late' },
};

/** What a target setting says under its box on the settings screen. */
export const TARGET_NOTE = 'Held to this as soon as it is saved.';

type Decl = Record<string, unknown>;
const boundOf = (target: Decl): number | null => (typeof target.lte === 'number' ? target.lte : typeof target.gte === 'number' ? target.gte : null);
const currencyOf = (d: Decl): string | undefined => (typeof d.format === 'string' ? /^money\.([A-Z]{3})$/u.exec(d.format)?.[1] : undefined);

/** A figure whose target is one of Money's settings, naming it; any other declaration as it was. */
export function withTargetSetting(d: Decl): Decl {
  const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
  const target = d.target as Decl | undefined;
  if (!said || !target || boundOf(target) === null || (said.type === 'money' && currencyOf(d) === undefined)) return d;
  return { ...d, target: { ...target, setting: said.setting } };
}

/** The settings a set of declarations' targets are held to, each starting at the target it replaces. */
export function targetConfigOf(declarations: readonly Decl[]): Record<string, Decl> {
  const config: Record<string, Decl> = {};
  for (const d of declarations) {
    const target = d.target as Decl | undefined;
    const said = typeof d.metric === 'string' ? MONEY_TARGET_SETTINGS[d.metric] : undefined;
    const bound = target ? boundOf(target) : null;
    if (!said || !target || target.setting !== said.setting || bound === null) continue;
    config[said.setting] = { type: said.type, label: said.label, note: TARGET_NOTE, default: said.type === 'money' ? { amount: bound, currency: currencyOf(d) } : bound };
  }
  return config;
}

const DECLARED_METRICS: Record<string, SeedMetric> = {
  /* WHAT IS IN THE BANK, the headline the owner asked for: "the money i have, not the money im
     due/owed". Liquid accounts only, and remembered daily so the page can draw how it has moved. */
  'cash-now': {
    metric: 'cash-now',
    name: 'Cash now',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { sum: 'balance' },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.cash-now' },
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

  /* THE NEXT THIRTY DAYS, AND LATE MONEY IS STILL COMING. A calendar month shrinks to nothing on the
     29th, and `before` is exclusive, so the month's last day could not be said anyway. */
  'in-30d': {
    metric: 'in-30d',
    name: 'Coming in, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before +31d`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-30d': {
    metric: 'out-30d',
    name: 'Going out, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before +31d`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 5_000_000 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT GOES OUT EVERY MONTH WITHOUT ANYBODY DECIDING AGAIN: each repeating cost at its monthly
     share, so a yearly insurance is a twelfth and a quarterly VAT bill is a third. */
  'every-month-out': {
    metric: 'every-month-out',
    name: 'Every month',
    source: 'register.obligations',
    where: 'state is not written off, direction is owed by me, repeats is monthly or quarterly or yearly',
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'repeats' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: 'money.GBP',
    target: { lte: 1_500_000 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT COMES IN EVERY MONTH, the other side of `every-month-out`: a pay day, a retainer, each at its monthly share.
     The series counts it in every month ahead, as it counts what goes out. */
  'every-month-in': {
    metric: 'every-month-in',
    name: 'Every month, in',
    source: 'register.obligations',
    where: 'state is not written off, direction is owed to me, repeats is monthly or quarterly or yearly',
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'repeats' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: 'money.GBP',
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
    format: 'money.GBP',
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

  /* WHAT GOES OUT EVERY MONTH, BY WHAT IT IS FOR: each repeating cost at its monthly share, grouped by category. What
     no category holds is the whole less the parts, which the page draws as its own row. */
  'every-month-by-category': {
    metric: 'every-month-by-category',
    name: 'Every month, by category',
    source: 'register.obligations',
    where: 'state is not written off, direction is owed by me, repeats is monthly or quarterly or yearly',
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'repeats' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    group_by: 'category',
    format: 'money.GBP',
    target: { lte: 1_500_000 },
    window: '30d',
    compare: 'none',
  },

  /* MONEY THAT MOVED, MONTH BY MONTH, by the day it was paid rather than the day it was due; and money still
     to move, by the day it is due. The series on the Money page draws the first for the months behind
     and the second for the months ahead. */
  'in-by-month': {
    metric: 'in-by-month',
    name: 'Paid in, by month',
    source: 'register.obligations',
    where: 'state is paid, direction is owed to me, settled after -7m',
    value: { sum: 'amount' },
    group_by: 'settled',
    bucket: 'month',
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-by-month': {
    metric: 'out-by-month',
    name: 'Paid out, by month',
    source: 'register.obligations',
    where: 'state is paid, direction is owed by me, settled after -7m',
    value: { sum: 'amount' },
    group_by: 'settled',
    bucket: 'month',
    format: 'money.GBP',
    target: { gte: 0 },
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
    format: 'money.GBP',
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
    format: 'money.GBP',
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
    format: 'money.GBP',
    /* A receivable book is good when it is SMALL, because every pound in it is a pound somebody
       else is holding. The target is the ceiling on that, not a sales goal. */
    target: { lte: 2_000_000 },
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
    format: 'money.GBP',
    target: { lte: 2_500_000 },
    window: '30d',
  },

  /* ONE DIRECTION, like the two tiles it sits beside. This once added receivables to payables and
     painted the sum in the alarm colour: GBP 17,740.00 was GBP 7,200 you are owed plus GBP 10,540
     you owe. Those are not the same problem, and the sum is not a quantity. */
  overdue: {
    metric: 'overdue',
    /* WHAT THIS ONE IS ABOUT, and the word alone was not it. `direction is owed by me` — this is
       money YOU are late paying, and the saved view called "Overdue" is everything late in both
       directions. Two clicks apart, one word, two sets: a person reading `GBP 10,540` under
       "Overdue" and then opening the view was looking at a different question with no way to know. */
    name: 'Overdue to pay',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before today`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    /* Zero, and it is the one target in the record that is not a judgement call. */
    target: { lte: 0 },
    window: '30d',
  },

  /* ── what actually moved ─────────────────────────────────────────────────
     Every figure over the ledger says `transfer is false` and `state is cleared`. The first leaves out
     money moved between your own accounts, which is not spending; the second leaves out a payment the
     bank has taken and not yet settled, which is not a fact yet. A figure that omitted either would be
     a number about the same money counted twice, or about money that has not moved. */

  'spent-30d': {
    metric: 'spent-30d',
    name: 'Spent, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -31d',
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1_500_000 },
    window: '30d',
    compare: 'previous',
  },

  'received-30d': {
    metric: 'received-30d',
    name: 'Received, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, on after -31d',
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'previous',
  },

  /* WHAT NOBODY HAS SAID THE PURPOSE OF. The one number on the Ledger page that is a job rather than a
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
     Each repeating item at its monthly share, the way `every-month-out` reads `obligations.repeats`.
     Paused and ended items are left out: a figure about what leaves every month is about what leaves. */

  'recurring-out-month': {
    metric: 'recurring-out-month',
    name: 'Repeating, out',
    source: 'register.recurring',
    where: 'state is live, direction is out',
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: 'money.GBP',
    target: { lte: 1_500_000 },
    window: '30d',
    compare: 'none',
  },

  'recurring-in-month': {
    metric: 'recurring-in-month',
    name: 'Repeating, in',
    source: 'register.recurring',
    where: 'state is live, direction is in',
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* ── paid in parts ───────────────────────────────────────────────────────
     What is left of every plan, and what falls due inside the month. Both are sums of the rows, never
     a plan's total less what has gone, so a cancelled part is out of both by its status alone. */

  'installments-left': {
    metric: 'installments-left',
    name: 'Left to pay',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 2_000_000 },
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
    format: 'money.GBP',
    target: { lte: 1_000_000 },
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
   * IT MATCHES THE WHOLE DESCRIPTION, EXACTLY. `link:` is an equality against one stored value, and a
   * substring test is not reachable from a declaration in this build: `contains` is one of the
   * nineteen operators and is not in the sentence grammar, and `derive: { normalise }` is published
   * and read by nothing. So a category's `match` is the counterparty as the bank writes it, and a
   * merchant that arrives under two spellings needs two categories or a person. That is a real limit
   * and it is written here rather than discovered.
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
};

export const MONEY_PAGES: Record<string, SeedPage> = {
  /**
   * THE HOUSE HOME, AS A DECLARED PAGE (`loop/research-spark.md` S13). A record with no use case draws the page called
   * `home` on Home, the way a use case's record draws `home-<use case>`: the three figures, then what is due this week.
   * No `nav`, because Home is already on the rail. It is Money's, because every block reads Money's lists, so a record
   * without Money keeps the plain Home with only what needs deciding. The sample draws its own Home, unchanged.
   */
  home: {
    page: 'home',
    title: 'Home',
    icon: 'home',
    requires: ['register.obligations', 'register.people'],
    pack: 'money-core',
    blocks: [
      {
        kind: 'stat',
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'owed-to-you', label: 'Owed to you' },
          { metric: 'due-30d', label: 'Due in 30 days' },
          { metric: 'overdue', label: 'Overdue to pay' },
        ],
      },
      {
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
      },
    ],
  },
  /**
   * MONEY IS A FINANCE PAGE, NOT A LEDGER OF WHO OWES WHOM (`loop/DIRECTION.md` §2, `research-modules.md`
   * §2.1). It leads with the money there is, then how long it lasts, then what comes in and goes out;
   * which way an amount goes is a property of the row, never the frame of the page.
   *
   * "i want the headlines to be the money i have, not the money im due/owed" (the owner, in Sam
   * Brain's own Money screen). So the hero figure is Cash now, read from the accounts, and every walk
   * on this page starts from that same figure rather than from a balance typed into the page.
   */
  money: {
    page: 'money',
    title: 'Overview',
    nav: { section: 'Money', order: 10 },
    icon: 'money',
    requires: ['register.obligations', 'register.accounts', 'register.people'],
    pack: 'money-core',
    blocks: [
      {
        /* THE HERO, AND THREE FIGURES BESIDE IT. Cash now carries its twelve weeks as a line; the other
           three are the next thirty days either way, and what goes out every month without anybody
           deciding again. */
        kind: 'stat',
        lead: true,
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'cash-now', label: 'Cash now', trend: '12w', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' },
          { metric: 'in-30d', label: 'Coming in, 30 days' },
          { metric: 'out-30d', label: 'Going out, 30 days' },
          { metric: 'every-month-out', label: 'Every month' },
        ],
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
        from: [
          {
            register: 'obligations',
            on: 'due',
            amount: 'amount',
            where: 'state is open or part',
            incoming: { field: 'direction', is: 'owed_to_me' },
            every: { field: 'repeats', months: { monthly: 1, quarterly: 3, yearly: 12 } },
          },
          {
            register: 'services',
            on: 'renews',
            amount: 'cost',
            where: 'state is not cancelled',
            every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
          },
        ],
        horizon: 365,
        knobs: ['horizon', 'late', 'spend', 'leave'],
        /* THE LATE KNOB MARKS HOW LATE MONEY HAS COME IN, and the chart says how many days are left when the
           walk goes under inside a month. */
        late: 'days-late-in',
        under: 30,
        empty: 'Nothing dated in the next twelve months.',
      },
      {
        /* THE NEXT THIRTY DAYS AS ARITHMETIC: cash now, plus what arrives, less what leaves, and where
           that lands. It walks the same legs as the table below, over a shorter horizon. */
        kind: 'bridge',
        heading: 'The next 30 days',
        span: 5,
        source: 'forecast.runway',
        opening: { metric: 'cash-now' },
        from: [
          {
            register: 'obligations',
            on: 'due',
            amount: 'amount',
            where: 'state is open or part',
            incoming: { field: 'direction', is: 'owed_to_me' },
            every: { field: 'repeats', months: { monthly: 1, quarterly: 3, yearly: 12 } },
          },
          {
            register: 'services',
            on: 'renews',
            amount: 'cost',
            where: 'state is not cancelled',
            every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
          },
        ],
        horizon: 30,
        empty: 'Nothing dated in the next 30 days.',
      },
      {
        /* WHERE THE NEXT THIRTY DAYS' SPENDING GOES, by what it is for. */
        kind: 'split',
        heading: 'Where it goes, next 30 days',
        span: 7,
        source: 'register.obligations',
        where: 'state is open or part, direction is owed by me, due before +31d',
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 6,
        unset: 'Uncategorised',
        empty: 'Nothing to pay in the next 30 days.',
      },
      {
        /* MONTH BY MONTH: what was paid in and out in the six months to now, and what is due in the three
           after, with what was left each month as a line. The current month is so far, and the months
           ahead are what is due once plus what repeats at its monthly share, in every one of them. */
        kind: 'series',
        heading: 'In and out, by month',
        span: 12,
        series: [
          { metric: 'in-by-month', then: 'in-due-by-month', each: 'every-month-in', label: 'Money in' },
          { metric: 'out-by-month', then: 'out-due-by-month', each: 'every-month-out', label: 'Money out', dir: 'out' },
        ],
        back: 6,
        ahead: 3,
        net: true,
        empty: 'Nothing paid or due in these months.',
      },
      {
        /* A NOTE THAT DRAWS ONLY WHEN IT IS TRUE, and says what is due, never what to do about it. */
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
        body: 'Money you owe has gone past its date: {{overdue}} in all. Statutory interest may be due; the terms are in the contract.',
        when: { metric: 'overdue', gt: 0 },
      },
      {
        /* WHAT IS STILL TO COME IN AND GO OUT, IN ONE LIST BY DATE. The amount carries its own sign, so which way a
           row's money goes is a property of the row rather than the table it sits in, and the last column says who
           changed the row last, from its history. */
        kind: 'table',
        heading: 'Coming in and going out',
        span: 12,
        source: 'register.obligations',
        where: 'state is open or part',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
          { field: 'due', label: 'Due', width: '13ch', align: 'end' },
          { field: 'changed', label: 'Changed by', width: '18ch' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing is coming in or going out.',
        /* THE NEXT DOZEN BY DATE, so the charts after it stay near; the list holds the rest. */
        limit: 12,
      },
      {
        /* WHERE THE LAST YEAR'S MONEY WENT, from the rows that say when they were paid. */
        kind: 'bar',
        heading: 'Paid out, last 12 months',
        span: 7,
        source: 'register.obligations',
        where: 'state is paid, direction is owed by me, settled after -12m',
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 8,
        /* WHAT NO CATEGORY HOLDS IS SAID, LAST, and opens those rows so they can be given one. */
        unset: 'Uncategorised',
        empty: 'Nothing paid out in the last 12 months.',
      },
      {
        /* WHAT GOES OUT EVERY MONTH, by what it is for, at each cost's monthly share, and what no category holds. */
        kind: 'split',
        heading: 'Every month',
        span: 5,
        source: 'metric.every-month-by-category',
        limit: 6,
        unset: 'Uncategorised',
        empty: 'Nothing repeats every month.',
      },
      {
        /* WHERE THE MONEY IS, one card an account, with the day each balance was true. */
        kind: 'cards',
        heading: 'Accounts',
        span: 12,
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
    ],
  },

  /**
   * THE LEDGER IS THE PAGE ABOUT WHAT HAPPENED, and Overview is the page about what is going to. They
   * are separate because they answer different questions with different rows: Overview walks forward
   * from a balance over promises, and this one looks back over payments that have cleared. Putting
   * both on one page was what made the old Money page a list of everything and an answer to nothing.
   *
   * EVERY BLOCK LEAVES OUT TRANSFERS AND ANYTHING STILL PENDING, the same two clauses the figures
   * carry, so a total on this page and the tile above it are about the same set of rows.
   */
  ledger: {
    page: 'ledger',
    title: 'Ledger',
    nav: { section: 'Money', order: 20 },
    icon: 'rows',
    requires: ['register.transactions', 'register.accounts', 'register.categories', 'register.recurring', 'register.installments', 'register.snapshots'],
    pack: 'money-core',
    blocks: [
      {
        kind: 'stat',
        lead: true,
        heading: 'Last 30 days',
        span: 12,
        cells: [
          { metric: 'spent-30d', label: 'Spent' },
          { metric: 'received-30d', label: 'Received' },
          { metric: 'recurring-out-month', label: 'Repeating, out', note: '{{recurring-in-month}} coming in' },
          { metric: 'txn-uncategorised', label: 'Without a category' },
        ],
      },
      {
        /* A NOTE THAT DRAWS ONLY WHEN THERE IS SOMETHING TO DO, and says what is true rather than what
           to do about it. The rule has already filed what it could; this is the remainder. */
        kind: 'note',
        tone: 'warn',
        heading: 'Rows with no category',
        span: 12,
        body: '{{txn-uncategorised}} payments in the last three months say nothing about what they were for, so the chart below leaves them in Uncategorised.',
        when: { metric: 'txn-uncategorised', gt: 0 },
      },
      {
        /* WHAT MOVED, NEWEST FIRST. The amount carries its own sign from the row, and the last column
           says who wrote it, so a row a rule categorised and a row a person typed are told apart. */
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
        limit: 12,
        empty: 'Nothing has moved yet. Add what left the bank and this page starts from it.',
      },
      {
        /* WHERE THE YEAR'S MONEY WENT, from rows that cleared rather than from rows somebody meant to
           pay. `Uncategorised` is drawn last and opens those rows, so the hole is a job and not a gap. */
        kind: 'bar',
        heading: 'Where it went, 12 months',
        span: 7,
        source: 'register.transactions',
        where: 'state is cleared, transfer is false, direction is out, on after -12m',
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 8,
        unset: 'Uncategorised',
        empty: 'Nothing has gone out in the last 12 months.',
      },
      {
        /* MONTHLY ITEMS ONLY, and the heading is why. A quarterly and a yearly row summed beside a
           monthly one is three units added together, which is the mistake `LOOKUPS.per_month` exists
           to stop; the figure above draws all three at their monthly share, and this draws the ones
           whose amount is already a month. */
        kind: 'split',
        heading: 'Every month, by what it is for',
        span: 5,
        source: 'register.recurring',
        where: 'state is live, direction is out, every is monthly',
        columns: [{ field: 'category' }, { field: 'amount' }],
        limit: 6,
        unset: 'Uncategorised',
        empty: 'Nothing repeats every month.',
      },
      {
        kind: 'table',
        heading: 'Still to pay, in parts',
        span: 7,
        source: 'register.installments',
        where: 'state is open',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
          { field: 'due', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing is being paid in parts.',
      },
      {
        /* THE LAST WEEK OF NIGHTS. Four figures across one row is the shape a snapshot has, and a
           person reading a week of them can see which of the four moved. */
        kind: 'table',
        heading: 'Night by night',
        span: 5,
        source: 'register.snapshots',
        columns: [
          { field: 'on', label: 'Date', width: '13ch' },
          { field: 'cash', label: 'Cash', width: '14ch', align: 'end' },
          { field: 'net', label: 'Net', width: '14ch', align: 'end' },
        ],
        order: [{ field: 'on', dir: 'desc' }],
        limit: 7,
        empty: 'No night has been recorded yet. The first is the night after Money goes in.',
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
