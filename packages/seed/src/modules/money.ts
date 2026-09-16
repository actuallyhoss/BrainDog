/**
 * Money: what comes in and what goes out, with a date and a currency.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { LOOKUPS, OPEN, day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister } from './base.ts';

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
};

export const MONEY_METRICS: Record<string, SeedMetric> = {
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

  /* HOW LATE CLIENTS PAY, ON AVERAGE: the day money came in less the day it was due, over the last year's
     paid invoices. A fact about what happened, which the forecast's late knob marks, never a prediction. */
  'days-late-in': {
    metric: 'days-late-in',
    name: 'Clients pay late by',
    source: 'register.obligations',
    where: 'state is paid, direction is owed to me, settled is set, settled after -12m',
    value: { diff: { of: { avg: 'settled' }, per: { avg: 'due' } } },
    format: 'days',
    target: { lte: 14 },
    window: '365d',
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
    where: `${OPEN}, direction is owed to me, due after yesterday, due before +4m`,
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
    where: `${OPEN}, direction is owed by me, due after yesterday, due before +4m`,
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
        /* THE LATE KNOB MARKS HOW LATE CLIENTS HAVE PAID, and the chart says how many days are left when the
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
        empty: 'Nothing to pay in the next 30 days.',
      },
      {
        /* MONTH BY MONTH: what was paid in and out in the six months to now, and what is due in the three
           after, with what was left each month as a line. The current month is so far, and the months
           ahead are what is due, not a guess. */
        kind: 'series',
        heading: 'In and out, by month',
        span: 12,
        series: [
          { metric: 'in-by-month', then: 'in-due-by-month', label: 'Money in' },
          { metric: 'out-by-month', then: 'out-due-by-month', label: 'Money out', dir: 'out' },
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
        kind: 'table',
        heading: 'Coming in',
        span: 6,
        source: 'register.obligations',
        where: 'direction is owed to me, state is open or part',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '14ch', align: 'end' },
          { field: 'due', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing is owed to you.',
        limit: 50,
      },
      {
        kind: 'table',
        heading: 'Going out',
        span: 6,
        source: 'register.obligations',
        where: 'direction is owed by me, state is open or part',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '14ch', align: 'end' },
          { field: 'due', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing to pay.',
        limit: 50,
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
        empty: 'Nothing paid out in the last 12 months.',
      },
      {
        /* WHERE THE MONEY IS, one card an account, with the day each balance was true. */
        kind: 'cards',
        heading: 'Accounts',
        span: 5,
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
