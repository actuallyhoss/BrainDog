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

import type { IngestDecl } from '@braindog/kernel';

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
  { name: 'Studio current account', kind: 'bank', balance: gbp(985_000), as_of: day(-1), liquid: true, last4: '2044' },
  /* NOT UPDATED FOR OVER A WEEK, so the page shows what an out-of-date balance looks like. */
  { name: 'Tax reserve', kind: 'bank', balance: gbp(2_400_000), as_of: day(-9), liquid: true, last4: '7730' },
  /* THE ONE A CARD ALERT NAMES. Four digits nothing else in the sample repeats, so the `lookup:` in
     `MONEY_INGESTS` has exactly one row to find and the pattern's test is not passing by luck. */
  { name: 'Company card', kind: 'card', balance: gbp(-124_000), as_of: day(-2), liquid: false, last4: '4471' },
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
      /**
       * THE FOUR DIGITS A BANK MESSAGE NAMES THE ACCOUNT BY, and nothing else in this record could.
       *
       * `transactions.account` is a required ref, and the only thing an alert says about which account
       * moved is *"your card ending 4471"*. Without this field the `lookup:` form in `MONEY_INGESTS`
       * below has no `by:` to resolve against, so every forwarded message would land in `review` for a
       * field the message plainly carried. NOT REQUIRED and not unique: a cash box has no digits, and
       * two cards from one bank can share four.
       */
      { id: 'last4', label: 'Last four digits', type: 'text' },
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
       * `4 Aug 2026` — one list, two spellings of one title. `derived: true` is the kernel's own
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
 * person chose, and this one is the number he decides against. Sterling being the pack's own
 * spelling of money, the shipped sample's currency and the app installer's chosen value does not
 * make it this record's answer.
 */
export const MONEY_HOME_SETTING = {
  home_currency: { type: 'text', label: 'Home currency', note: 'The currency money in other currencies is added up in, when there is a rate for it. Held to this as soon as it is saved.' },
} as const;

/**
 * The code an arrival pattern falls back on when the message names none, written once for both.
 *
 * NOT THE SETTING ABOVE, FOR THE PARAGRAPH ABOVE: the setting is allowed to be unanswered and this
 * is not, because `money.currency` is required of the form and a pattern with no code reads no
 * money at all. It is a FALLBACK either way, never an override: wherever `@braindog/record` has
 * wired `scanMoney`, a code the bank prints beside the figure wins over this one, so what this
 * decides is only what an alert that prints a bare number is read as. Sterling, because the bank
 * these two patterns are written against is his British one and prints one.
 */
const HOME_CURRENCY = 'GBP';

/**
 * THE WAY THE BANK HE FORWARDS FROM WRITES A DAY, and it is a declaration rather than a sniff.
 *
 * `29/08/26` AND `08/29/26` ARE BOTH REAL DAYS and nothing in either string says which, so `43 §4.3`
 * makes the format part of the pattern: an extractor that decided by looking at the numbers would be
 * right most of the time and wrong about every date before the thirteenth. A payment filed five
 * months out is a row that still looks ordinary, which is why there is no guessing arm.
 *
 * AND IT BELONGS IN A SETTING RATHER THAN HERE, because which way a bank writes a date is a fact
 * about his bank and not about the record: he banks in three currencies and more than one country.
 * The form for that is `{{config:bank_day_format}}` beside `home_currency` above, and it is not
 * reachable this batch: a setting is filled only where a PACK is planned and installed
 * (`declare`'s `filledWith`), and `installSeed` hands its ingest declarations to `kernel.install`
 * unfilled, so a placeholder would be refused at the door with `FIELD_UNKNOWN`. Measured, before
 * this line was reverted to a constant. The one line that unblocks it is `ingestDeclarations()` in
 * `packages/seed/src/index.ts` running `fillConfig` over these settings' values.
 */
const BANK_DAY_FORMAT = 'DD/MM/YY';

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

  /**
   * THE NEXT THIRTY DAYS, AND LATE MONEY IS STILL COMING. A calendar month shrinks to nothing on the
   * 29th, and `before` is exclusive, so the month's last day could not be said anyway.
   *
   * AND THESE TWO WERE CALLED "Coming in, 30 days" AND "Going out, 30 days", WHICH ARE THE BRIDGE'S
   * OWN WORDS. Measured on the shipped record, drawn: the tile read GBP 9,090.00 coming in and the
   * bridge two blocks under it read GBP 11,490.00; the tile read GBP 38,880.00 going out and the
   * bridge read GBP 42,741.00. Same page, same thirty days, same three words, GBP 2,400.00 and
   * GBP 3,861.00 apart, because a figure reads ONE register (`MetricDecl.source`) and the walk
   * beside it reads three: the parts of a plan and the subscriptions are dated money no figure on
   * this page can reach.
   *
   * SO THE TILE SAYS WHICH PART IT IS, rather than claiming a whole it cannot count. `Owed to you`
   * and `Owed by you` are this predicate read out loud (`direction is owed to me`), and they are
   * the words the register's own `owed-to-you` and `owed-by-you` figures already use. Measured
   * again after the rename: the tile is the bridge's obligations leg to the penny, in and out, and
   * `test/money.test.ts` reads both off the DRAWN page and holds them there.
   */
  'in-30d': {
    metric: 'in-30d',
    name: 'Owed to you, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before +31d`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* THE OTHER SIDE OF `in-30d`, AND THE COMMENT ABOVE IT IS THIS ONE'S TOO. Its setting keeps the
     older wording, "Most going out in 30 days", because a setting a person has already saved is
     found by the words they saved it under. */
  'out-30d': {
    metric: 'out-30d',
    name: 'Owed by you, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before +31d`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 5_000_000 },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT GOES OUT EVERY MONTH WITHOUT ANYBODY DECIDING AGAIN: each repeating cost at its monthly
   * share, so a yearly insurance is a twelfth and a quarterly VAT bill is a third.
   *
   * THERE WERE TWO FIGURES FOR THIS AND THEY DISAGREED ON THE SHIPPED SAMPLE. Measured: this one
   * read 1041616 off `obligations.repeats` while `recurring-out-month` read 919633 off `recurring`,
   * the first on Overview as *Every month* and the second on Ledger as *Repeating, out*, two clicks
   * apart. Two figures that should agree and do not is worse than one figure missing, because
   * nothing on either screen says which of them the record means. The duplicate pair is gone and
   * this is the one answer.
   *
   * IT READS `obligations`, AND THAT IS A HOLDING POSITION RATHER THAN A VERDICT. The argument for
   * `recurring` is good: an obligation carrying `repeats` is one dated amount wearing a frequency,
   * a repeating item has `next_due` that moves and `ends` that stops it, and the importer writes
   * that list, so a real imported record has the better data in `recurring`. It was pointed there
   * and then pointed back, because a SEEDED record has the opposite problem and the switch was
   * measured to cost more than it bought: no use case seeds `recurring`, so all three of these
   * figures answered zero on every demo record, and they cannot simply be reseeded because
   * `recurring.category` is a ref to the categories register while `obligations.category` is a
   * closed enum, no seed row anywhere writes a ref, and `usecase-install.test.ts` rightly refuses a
   * bill with no category. Moving the figures is a one-line change; moving the seeds behind them
   * needs ref resolution in the installer and a decision about which of the two shapes a category
   * really is. That decision is recorded in `loop/BACKLOG.md` and is not a thing to settle inside
   * an unrelated repair.
   *
   * THE IDS STAY, and that is deliberate: `MONEY_TARGET_SETTINGS` holds a person's ceiling under
   * this name, the personal use case overrides its target under this name, and the Overview's
   * series names it. Changing what a figure reads is a change to the figure; changing its id is a
   * change to everything pointing at it.
   */
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

  /**
   * THE WHOLE BOOK YOU OWE, AND IT WAS THE ONE FIGURE OF THE FOUR A SNAPSHOT HOLDS THAT NOTHING COMPUTED.
   *
   * `snapshots` stores `cash`, `owed_to_me`, `owed_by_me` and `net` on one row, and three of the four
   * had a figure behind them: `cash-now` reads the accounts, `owed-to-you` sums the receivable book,
   * and the net is the arithmetic over both. The payable book had `overdue`, which is only the part
   * already late — GBP 10,540 of a book several times that — so anything filling a snapshot had to
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
    format: 'money.GBP',
    /* A CEILING, AND THE RECORD INSISTS ON ONE: `METRIC_NEEDS_TARGET_OR_WINDOW` refuses a figure with
       neither, in those words — *a number with no target is decoration*. GBP 60,000 is roughly what
       is in the bank plus what is owed to you on this record; past that the book has stopped being a
       supplier's credit and become a cash problem, which is the only reading of it worth a colour. */
    target: { lte: 6_000_000 },
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
     `recurring-out-month` and `recurring-in-month` WERE HERE AND THEY ARE GONE, because they were a
     second name for `every-month-out` and `every-month-in` over the same rows. They were written
     when those two read `obligations.repeats`, as the pair that read the list a repeating item
     actually lives in; the two readings disagreed by 121983 on the shipped sample, and the repair
     was for one of the pair to stop existing rather than for both to keep answering. The surviving
     ids are the ones the pages, the target settings and the personal use case already name. */

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
  /**
   * A SCHEDULE WHOSE LAST DAY HAS GONE, MOVED RATHER THAN FILTERED AROUND.
   *
   * NOTHING IN THE TREE EVER FLIPPED `state` WHEN `ends` PASSED, and every reader of `recurring`
   * paid for it. Measured on the shipped record plus one row shaped the way the importer writes
   * them: "Every month, by what it is for" on `/p/ledger` counted a pass that stopped on 3 March
   * 2026 at its full GBP 249.00 a month, for ever, inside a GBP 6,940.00 total.
   *
   * THE FILTER REPAIR CANNOT BE WRITTEN, WHICH IS THREE MEASUREMENTS AND NOT A PREFERENCE. Only the
   * first of the three is an assertion in `test/money.test.ts`; the other two are read at the lines
   * named here, and saying which is which is the difference between a measurement and a claim.
   * `ends is empty or ends after today` is refused by the record, because `or` reads over the VALUES
   * of one field and `empty` is not a value a day can hold. The same thing as a tree
   * (`{ any: [...] }`) compiles in the kernel and is refused by the browser's mirror, which returns
   * one refusal and no clauses for a `where:` that is not a string
   * (`apps/web/src/lib/record/where.ts:533`), so the block would draw nought rows and a refusal. And
   * `ends is empty` alone drops exactly the rows still running, because the importer skips a stream
   * that ended before the export and so writes `ends` only when it is ahead
   * (`apps/cli/src/legacy.ts:916`).
   *
   * SO THE REPAIR IS WHERE THE ROW IS. `rulesAboutTime` (`packages/kernel/src/index.ts:3475`) sweeps
   * hourly every rule whose `when:` names a relative day and which declares `once_per`, so this one
   * is re-read as time passes rather than only when somebody writes the row, and one `move` puts the
   * split, the register page and every future reader right at once with no grammar change.
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

/* ── how a bank message becomes a row ────────────────────────────────────── */

/**
 * A DECLARATION THE SEED HAD NONE OF, AND `/in/*` IS ABOUT TO MAKE THAT VISIBLE.
 *
 * Every `ingest:` in this tree was a poll — `packs/rates-poll.ts` and `usecases/founder-poll.ts`, both
 * of them a URL the runner fetches on a clock. Nothing declared how to read a message somebody
 * FORWARDS, so once the inbound route lands, every bank alert he sends arrives, is hashed, is stored,
 * and sits `untriaged` for ever: correct behaviour, and an empty ledger beside a full inbox.
 *
 * AN ARRIVAL NOBODY UNDERSTANDS IS STILL STORED, and nothing here weakens that. `arrive` stores the
 * raw before it looks for a pattern and stores it again when it finds none; these two only add the
 * case where it does find one. A third wording, a second bank, or a message with no amount in it
 * lands exactly where it lands today, which is somewhere a person can see it.
 *
 * TWO DECLARATIONS AND NOT ONE, because the merchant sits in a different place in each wording — *at*
 * FENWICK CLOUD for a charge, *from* NILE REALTY for a payment in — and `first:` over both anchors
 * would file the row at `proposed` the moment a message happened to carry both words, which writes
 * NOTHING and opens a suggestion instead. `43 §5.3`: two arms yielding is `chosen`, and `chosen` is
 * not `exact`. Splitting on the verb in `match:` keeps every field a straight read.
 *
 * AND THE VERB IS READ RATHER THAN ASSUMED. `direction` is required on `transactions` and the only
 * form that could state a constant is `default:`, which files at `defaulted` and therefore at
 * `proposed` — so the enum map holds the one word the `match:` has already guaranteed is in the body.
 * A declaration that cannot say "this is a payment out" without an `enum` of one is a real limit of
 * the closed vocabulary, and it is written here rather than discovered.
 */
export type SeedIngest = IngestDecl & { pack?: string };

/** What a charge alert says money went to, and what a credit alert says it came from. */
const MERCHANT_OUT = { text: { between: ['at ', ' on '] } } as const;
const MERCHANT_IN = { text: { between: ['from ', ' on '] } } as const;

/**
 * The day, the amount and the account, which are the same three reads in either direction.
 *
 * THE AMOUNT IS ANCHORED AND THE REASON IS IN THE SAMPLE: an unanchored `{ money: { currency } }`
 * over *"Your card ending 4471 was debited GBP 42.99"* reads the card digits as forty-four pounds
 * seventy-one, because `4471` is a number and the declared currency is a fallback that would dress it
 * as one. Something has to sit between the digits and the figure, and the first candidate after it
 * is the right one.
 *
 * AND IT WAS THE LITERAL `GBP`, ON A PACK WHOSE HOME CURRENCY IS A SETTING. Measured on a record:
 * an alert reading *"debited EGP 42.99 at FENWICK CLOUD on 2026-08-29"* came back
 * `review — bank-card-out could not read amount, on out of this one`, because an anchor that is
 * nowhere in the text yields no slices at all and `DD/MM/YY` reads no ISO day. He banks in EGP, USD
 * and GBP, so two of the three currencies he holds were unreadable and the third was only readable
 * by accident of the pack having been written in it.
 *
 * SO THE ANCHOR IS THE VERB, which each pattern's `match:` has already guaranteed is in the body,
 * and the declared code is a FALLBACK and never an override. `scanMoney` takes the code the bank
 * prints beside the figure whenever there is one, *because it is the one that moved the money*, and
 * falls back to the declared code only when the text names none. So the same alert now comes back
 * `matched` at `exact` with `EGP 42.99` on it, and a sterling alert reads sterling.
 *
 * AND THE FALLBACK IS THE ONE NAMED CONSTANT `HOME_CURRENCY` ABOVE, shared by both patterns rather
 * than typed once in each, so the two cannot drift apart. It is NOT read off `MONEY_HOME_SETTING`,
 * and that is the paragraph above `HOME_CURRENCY`: the setting is allowed to stand unanswered and a
 * pattern with no code reads no money at all, so the two questions have to be answered separately.
 */
const movement = (verb: 'debited' | 'credited') =>
  ({
    on: { date: { format: BANK_DAY_FORMAT, after: ' on ' } },
    amount: { money: { after: `${verb} `, currency: HOME_CURRENCY } },
    account: { lookup: { register: 'accounts', by: 'last4', after: 'ending ' } },
  }) as const;

/**
 * The alerts that recognise themselves and are not movements.
 *
 * `07 §2` NAMES A REFUND AND A PIN REMINDER IN THE SAME BREATH, and the reason is that both match a
 * pattern written for a bank's alerts: a refund carries the charge wording and moves money the other
 * way, and a PIN reminder carries the card digits and moves none. Skipped is not dropped — the bytes
 * and the reason are both in `inbox_raw`, which is the only way a wrong skip is ever found.
 */
const NOT_A_MOVEMENT: SeedIngest['skip'] = [
  { when: { field: 'body', contains: 'refund' }, reason: 'A refund is money coming back, and this pattern reads a charge.' },
  { when: { field: 'body', contains: 'your pin' }, reason: 'A PIN reminder carries the card digits and moves no money.' },
  { when: { field: 'body', contains: 'balance is' }, reason: 'A balance alert is a position, not a movement.' },
];

/**
 * The same movement twice, in two wordings — `07 §2`'s reason for the near form.
 *
 * A BANK SENDS ONE PAYMENT AS AN SMS AND AGAIN IN A STATEMENT MAIL, and the two are not the same
 * bytes, so the raw's own hash cannot catch it. Same account, same amount, the day within one either
 * way, and the first twelve characters of the description equal: `FENWICK CLOUD LTD` and
 * `FENWICK CLOUD` are one charge, and two rows for it is a month counted twice.
 */
const SAME_MOVEMENT: SeedIngest['dedupe'] = { near: { on: ['amount', 'account'], day: 'on', prefix: { field: 'what', chars: 12 } } };

export const MONEY_INGESTS: Record<string, SeedIngest> = {
  'bank-card-out': {
    ingest: 'bank-card-out',
    pack: 'money-core',
    channel: 'email',
    /**
     * THE VERB IS PART OF THE MATCH, so the `enum` below cannot miss. `contains` is case-folded
     * (`where`'s own `fold`), so the capitals a bank uses are not part of the declaration.
     *
     * AND THE OTHER VERB IS PART OF IT TOO, BECAUSE SPLITTING ON ONE DID NOT MAKE THE TWO PATTERNS
     * EXCLUSIVE. Measured: a body carrying `debited`, `credited` and `card ending` satisfied both
     * `match:` clauses, `arrive` took the first declared, which is this one, and the arrival was
     * written as a payment OUT at `exact` with the credit half never read. A wrong sign at `exact`
     * is the worst outcome this layer has: `exact` is the confidence that opens no suggestion,
     * stores no reason and puts the row straight in the book, so nothing downstream doubts it and
     * the ledger looks ordinary.
     *
     * `none:` IS WHAT MAKES THEM EXCLUSIVE, and a message naming both now matches neither. It lands
     * `untriaged`, which is where a wording nothing recognises already lands: the bytes are stored,
     * a person sees it, and the third such arrival earns a drafted pattern. What goes with it is
     * that the ORDER these two are declared in stops deciding anything.
     *
     * AND THE `none` GROUP IS NESTED INSIDE THE `all` LIST RATHER THAN WRITTEN BESIDE IT, which
     * reads like a style choice and is not. `where`'s `quantifierOf` is `'all' in g ? 'all' : 'any'
     * in g ? 'any' : 'none'` and `childrenOf` matches it, so a group carrying TWO quantifier keys
     * is read as the first one and the rest of the object is dropped without a word. Measured:
     * written as `{ all: [...], none: [...] }` this pattern still claimed a message naming both
     * verbs, at `exact`, because only the `all` leg was ever evaluated. `compile` does not refuse
     * the shape either, so nothing anywhere says so. One quantifier per object, always.
     */
    match: {
      all: [{ field: 'body', contains: 'debited' }, { field: 'body', contains: 'card ending' }, { none: [{ field: 'body', contains: 'credited' }] }],
    },
    skip: NOT_A_MOVEMENT,
    extract: {
      what: MERCHANT_OUT,
      direction: { enum: { map: { debited: 'out' } } },
      ...movement('debited'),
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },
  'bank-card-in': {
    ingest: 'bank-card-in',
    pack: 'money-core',
    channel: 'email',
    /* AND THE SAME EXCLUSION FROM THE OTHER SIDE. Both arms carry it, because one arm refusing the
       other's verb would only move which of the two claims an ambiguous message. */
    match: {
      all: [{ field: 'body', contains: 'credited' }, { field: 'body', contains: 'card ending' }, { none: [{ field: 'body', contains: 'debited' }] }],
    },
    skip: NOT_A_MOVEMENT,
    extract: {
      what: MERCHANT_IN,
      direction: { enum: { map: { credited: 'in' } } },
      ...movement('credited'),
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },
};

/**
 * EVERY LIST ON THIS RECORD THAT HOLDS A DATED AMOUNT, WRITTEN ONCE.
 *
 * TWO BLOCKS ON `/p/money` WALK THESE, "Cash ahead" over 365 days and "The next 30 days" under it,
 * and until this constant existed they walked two copies of the same array. That is not a tidiness
 * argument: `ca30d210` had to add the `installments` leg twice, once to each copy, and its own
 * message says why it did the second one as well as the first, that two blocks on one screen
 * disagreeing by GBP 1,350.00 about the same month is worse than either number alone. The next leg
 * anybody adds gets no such choice, because one array cannot drift from itself.
 *
 * `recurring` IS DELIBERATELY NOT HERE, and the argument is on the "Cash ahead" block below rather
 * than copied up here, because that is where it was measured.
 */
const CASH_LEGS = [
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
  {
    register: 'installments',
    on: 'due',
    amount: 'amount',
    /* `state is open` AND THE PAID PARTS STAY OUT, the way a settled obligation does: the money
       already moved and Cash now is standing on the far side of it. */
    where: 'state is open',
    incoming: { field: 'direction', is: 'in' },
    /* NO `every:`, AND THAT IS THE WHOLE TRAP OF THIS REGISTER. An instalment row is already one
       dated part, so a frequency over the top of it would charge the proofing press eight times
       eight. `INSTALLMENTS` in this file is `[1..8].map`, one row a payment, for exactly this
       reason. */
  },
];

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
           three are what is owed either way inside thirty days, and what goes out every month without
           anybody deciding again.
           THE TWO THIRTY-DAY TILES DO NOT WEAR THE BRIDGE'S WORDS, and `in-30d`'s comment has the
           measurement: a figure reads one register, the bridge walks three, so a tile labelled
           "Coming in, 30 days" over the bridge's "Coming in" was one screen giving two answers. */
        kind: 'stat',
        lead: true,
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'cash-now', label: 'Cash now', trend: '12w', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' },
          { metric: 'in-30d', label: 'Owed to you, 30 days' },
          { metric: 'out-30d', label: 'Owed by you, 30 days' },
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
        /**
         * THE LEGS ARE THE LISTS THAT HOLD A DATED AMOUNT (`CASH_LEGS`), and `installments` was not
         * among them.
         *
         * Measured on the shipped record before the leg was added: six open parts, four of the
         * proofing press going out at GBP 1,875.00 and two of the Halden licence coming in at
         * GBP 2,400.00, GBP 2,700.00 net out inside ninety days, in the register and in no walk.
         * A runway that is too high is the direction this block must never be wrong in, because a
         * person reads it to decide what to shut down.
         *
         * AND `recurring` IS DELIBERATELY NOT A LEG, WHICH IS A MEASUREMENT AND NOT AN OVERSIGHT.
         * Adding it moved the crossing day from 30 October to 1 October, and GBP 98,224.00 of the
         * GBP 99,196.00 it added was a second copy of money the obligations leg already walks:
         * Studio rent, the Kiln storefront payout, the Marchetti backend contract, VAT and the
         * studio insurance are one amount on one day at one cycle written in both lists, step for
         * step and total for total. The walk reads the obligations copy for the reason
         * `every-month-out` reads it: no use case seeds `recurring`, so a walk pointed there is a
         * walk that answers nothing on every record but this one. Which of the two shapes a
         * repeating cost really lives in is the seed question already parked in `loop/BACKLOG.md`,
         * and `test/money.test.ts` builds the leg and asserts the overlap so this stays a number.
         */
        from: CASH_LEGS,
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
           that lands. It walks what the block above it walks, over a shorter horizon.
           THE SAME LEGS MEANS THE SAME ARRAY NOW, not a second copy held level by a test. The two
           blocks sit one above the other on one screen, so a leg in one and not the other is two
           answers about the same thirty days, GBP 1,350.00 apart on this record, which is what
           `ca30d210`'s own message was about. `test/money.test.ts` still asserts that both blocks
           hand back the one array, because somebody pasting a copy back in is the thing `CASH_LEGS`
           is defending against. */
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
        /* WHERE THE NEXT THIRTY DAYS' SPENDING GOES, by what it is for.
           IT IS `out-30d` BROKEN UP AND NOTHING WIDER, which is worth saying under a bridge that
           walks three lists: measured on the drawn page, these rows add to GBP 38,880.00, the same
           figure the tile above shows, and the GBP 375.00 of instalment parts and GBP 111.00 of
           subscriptions inside the same thirty days are in neither. A `split` reads one register,
           so that is a limit of the block and not an omission in the filter.
           THE HEADING IS NOT RENAMED WITH THE TILES ABOVE IT: seven places in two of `apps/web`'s
           test files find this block by these exact words, four in `lib/record/api.test.ts` and
           three in `lib/record/money.test.ts`, and that package belongs to another agent this run. */
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
          /* THE SAME FIGURE OVERVIEW LEADS WITH, under the word this page uses for it. Two tiles
             two clicks apart that mean one thing now read one number, which is what they did not. */
          { metric: 'every-month-out', label: 'Repeating, out', note: '{{every-month-in}} coming in' },
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
        /* SIX AND SIX, AND IT WAS SEVEN AND FIVE. Both of these are three-column tables, and
           `floorFor` gives a table two twelfths a column: the five below was clamped UP to six in
           silence, which pushed 7 + 6 past twelve, wrapped, and left the row above this pair four
           twelfths short of the page. Two halves is the only pair of survivable spans that tiles. */
        kind: 'table',
        heading: 'Still to pay, in parts',
        span: 6,
        source: 'register.installments',
        /* `direction is out` WAS MISSING AND THE TABLE LISTED RECEIPTS UNDER THE WORD PAY. Measured on
           the shipped record: six open parts drawn under this heading, four of the proofing press
           going out at GBP 1,875.00 and two of the Halden licence coming IN at GBP 2,400.00, the two
           of them drawn without the minus the outgoing rows wear because `sign:` reads the very field
           the filter did not. Four rows is what is still to pay. Both figures over this list,
           `installments-left` and `installments-due-30d`, already carry the clause, and the second one
           carries a comment about the day it was added to a figure that had added a payment to a
           receipt; the table under the same word was left out of that repair. */
        where: 'state is open, direction is out',
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
        span: 6,
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
