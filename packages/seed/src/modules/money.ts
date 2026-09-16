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
  { name: 'Tax reserve', kind: 'bank', balance: gbp(2_400_000), as_of: day(-6), liquid: true },
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
      { id: 'direction', label: 'Which way', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true, required: true },
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
  money: {
    page: 'money',
    title: 'Overview',
    nav: { section: 'Money', order: 10 },
    icon: 'money',
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
          /* `How long the money lasts` AND IT WAS `Runway`. A stat tile carries four words and a
             number, so the label IS the explanation: `Runway` is a startup word for a fact every
             business owner already thinks about in a sentence, and this is that sentence. The
             metric id stays `runway`, which is what a declaration and a predicate say. */
          { metric: 'runway', label: 'How long the money lasts' },
        ],
      },
      {
        /* Where the money sits, in one line. Grouped and counted, so this is four chips whatever
           the register grows to — the shape stays readable at thirty-eight rows and at three
           thousand, which a table of them does not. */
        kind: 'chips',
        heading: 'Where it sits',
        span: 12,
        columns: [{ field: 'state' }],
        source: 'register.obligations',
        empty: 'Nothing owed either way.',
      },
      /* THE ONLY BLOCK ON ANY PAGE THAT IS ABOUT THE FUTURE. Sourced from the walk rather than from
         a register (08 §2.3's `running`): what is liquid, then every dated movement in order, and
         the balance after each. 05 §2 defers a `forecast` KIND to post-v1 and says the primitive
         layer exists so it can be drawn without one, so this is an ordinary table over a different
         source. The day the kind ships, the kind changes and the query does not. */
      {
        kind: 'table',
        heading: 'What is coming',
        span: 12,
        columns: [{ field: 'day' }, { field: 'what' }, { field: 'delta' }, { field: 'balance' }],
        source: 'forecast.runway',
        /* WHAT THE WALK READS IS DECLARED, not wired: a forecast that knew the word "obligations"
           would be a forecast that works for one record. `opening` is what is liquid today, and it
           is a number somebody has to supply — a runway seeded from a balance nobody declared is a
           forecast that looks like a fact and is a guess. */
        opening: 500_000,
        from: [
          {
            register: 'obligations',
            on: 'due',
            amount: 'amount',
            where: 'state is open or part',
            incoming: { field: 'direction', is: 'owed_to_me' },
          },
          {
            register: 'services',
            on: 'renews',
            amount: 'cost',
            where: 'state is not cancelled',
            every: { field: 'cycle', months: { monthly: 1, yearly: 12, two_yearly: 24 } },
          },
        ],
        limit: 12,
        empty: 'Nothing dated in the next six months.',
      },
      {
        kind: 'table',
        heading: 'Who owes you',
        span: 12,
        source: 'register.obligations',
        where: 'direction is owed to me, state is open or part',
        /* NO `#` COLUMN, AND THREE PAGE TABLES LED WITH ONE. Nine characters of spoken id, at the
           head of a table whose question is who owes me and how much, repeated once per row: on a
           page a friction pass measured at ninety-three numbers for a question needing two or
           three, the id is the one column that answers none of it. It is what `y` copies, what the
           row's own screen prints and what `/audit` leads with, which are the three places somebody
           wants a number they can say out loud. A block on a page is not one of them. */
        columns: [
        /* THE LABEL THE REGISTER DECLARES. A page column heads itself with `label ?? field`
           and `/r/<id>` heads the same field with the register's own `label`, so a page that
           types its own word makes one field two words. The worst of them was `tasks.by`,
           which the register calls Due and this called By, over a right-aligned column of
           dates on a page whose block two above it already said Due. */
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)' },
          { field: 'party', label: 'Who', width: 'minmax(12ch,20ch)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        /* EACH SIDE OF THE LEDGER SAYS ITS OWN NOTHING. All three blocks on this page read "Nothing
           outstanding.", so on an empty record the identical sentence printed on both sides — what
           you are owed and what you owe, told apart by a heading and nothing else. */
        empty: 'Nobody owes you anything.',
        limit: 50,
      },
      {
        kind: 'note',
        tone: 'bad',
        /* THE HEADING NAMES THE SIDE OF THE LEDGER IT IS ABOUT. "Late" sat immediately below the
           receivables table and above the payables blocks, so reading downwards it attached to the
           table it followed and read as *who is late paying you* — while its body says "Something
           you owe". The same confusion has already bitten this block once: the sentence used to
           interpolate the age of a receivable under a `when:` gated on payables. The figure was
           fixed and the heading was the other half of it. */
        heading: 'Late to pay',
        span: 5,
        /* THE SENTENCE IS ABOUT THE RECORD, not about one studio's counterparty. It named a
           contract the reader has never signed, in the danger colour, on every Money page in every
           record — and when nothing was overdue it degraded to a raw internal path beside that
           claim, because the figure it referred to was empty. */
        /* THE INTERPOLATION CARRIES ITS OWN "ago", so the sentence is written around it rather than into
           it: "Something is 5w ago past its terms" is not English, and it was on the page. */
        /* AND IT QUOTES THE AGE OF THE SET THAT MADE IT APPEAR. It read
           `{{ago:obligations.oldest_overdue}}`, which resolves over money owed TO you, while the
           `when:` below gates on `overdue` — money owed BY you. So the alarm fired because two
           payables were late and then printed the age of a receivable: 5w on screen for a record
           whose oldest overdue payable is nine weeks old. The gate and the figure have to describe
           one set, and the path is named for which one. */
        body: 'Something you owe went past its terms {{ago:obligations.oldest_unpaid}}. Statutory interest may be due; the terms are in the contract.',
        /* AND IT DRAWS ONLY WHEN IT IS TRUE. `when:` was documented and not implemented, so this
           was `drawn: true` — an alarm that is always on, which is an alarm nobody reads. */
        when: { metric: 'overdue', gt: 0 },
      },
      {
        kind: 'bar',
        heading: 'Owed by you, by counterparty',
        span: 7,
        columns: [{ field: 'party' }, { field: 'amount' }],
        source: 'register.obligations',
        /* THE SAME PREDICATE AS "Who you owe" DIRECTLY BELOW IT. This said `state is open` and that
           one says `state is open or part`, so two panels about the same thing, one above the other,
           were about different sets — 63,084 and 82,434. Neither prints a total, so nothing on screen
           was wrong and the two disagreed anyway, which is the shape of a number somebody quotes from
           the wrong panel. A part-paid obligation is money still owed. */
        where: 'direction is owed by me, state is open or part',
        /* ONE FACT, ONE SENTENCE. This block and "Who you owe" below it share a predicate — the
           comment above says so — and said the same nothing two ways: "You owe nobody anything."
           stacked directly over "Nothing outstanding.", with the identical filter printed verbatim
           under both. On a record in its first week that is the first thing on the money page.
           `19 §6` Partial is right that an empty block stays; it does not ask for the same nothing
           said twice. The one below keeps the sentence, because it is the one holding the rows. */
        empty: 'Nothing to break down.',
      },
      {
        kind: 'table',
        heading: 'Who you owe',
        span: 12,
        source: 'register.obligations',
        where: 'direction is owed by me, state is open or part',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(18ch,1fr)' },
          { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
          { field: 'due', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'due', dir: 'asc' }],
        empty: 'Nothing outstanding.',
        limit: 50,
      },
    ],
  },
};
