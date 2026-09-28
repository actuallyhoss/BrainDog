/**
 * Small business: the first-party setup onboarding made before use cases existed (`loop/research-spark.md` §4).
 *
 * IT CARRIES NO LIST. Its modules are whichever first-party packs the sentence names, which is what onboarding
 * already did, and it speaks in the house voice but for three lines of Home that name what a business is owed and
 * owes (PGS-24). It is in the catalogue so the arranger can say "this reads like a business" as plainly as it says
 * "student".
 *
 * ITS PACK IS ONE PAGE, ITS HOME, SINCE 1.2.0 (MOD-18). Money's own Home retired with money-core 3.0.0, and a record
 * whose use case declares no `home-<id>` falls back to the house Home, which leads with nothing a business asks
 * first. Because its modules are whatever the sentence named, the page reads only what the record answers across
 * every list it holds (`figures.home`, `deadlines`, `governance.open`, `sessions.live`, `activity`), and so installs
 * on a record with Money and on one without.
 */

/** Money in minor units, as every example writes it. */
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/**
 * THE EXAMPLE ROWS A SMALL BUSINESS GETS in the modules its sentence turned on, one per list at most and no refs
 * (`install.ts`). Without them a bakery's first day was every figure at £0.00 under "Nothing is due this week",
 * while setting up said it had added example rows.
 */
export const BUSINESS_EXAMPLES = [
  { register: 'accounts', fields: { name: 'Business current account', kind: 'bank', balance: gbp(412_000), as_of: '0d', liquid: true } },
  { register: 'obligations', fields: { what: 'Invoice 2026-014', direction: 'owed_to_me', amount: gbp(85_000), due: '+4d', state: 'open', category: 'client_work' } },
  { register: 'things', fields: { name: 'Wholesale orders', lane: 'earning', since: '-120d' } },
  { register: 'tasks', fields: { what: 'Send this month invoices', state: 'open', by: '+4d' } },
  { register: 'services', fields: { name: 'Accounting software', kind: 'saas', state: 'live', cost: gbp(2_400), cycle: 'monthly', renews: '+21d' } },
];

/**
 * THE SUMMARY IS SAID IN WORDS ITS OWN SIGNALS HOLD, because an owner who types a card's words back has chosen it.
 * "What you are owed and what you owe, what you run on, the people involved and the work." heard no signal of any use
 * case, so the first run proposed nothing for the card the owner had just read (`loop/research-batch-forty-seven-audit.md`
 * §6); typed back now, it hears clients, hosting and subscriptions, and no other card hears a word of it
 * (`test/card-summary-proposes-itself.test.ts`). The summary moved and the signals did not: with "owed" as a signal,
 * "track what my brother owed me for the holiday", which proposes nothing today, proposed Small business (measured).
 * Neither is in a pack, since Small business carries none, so the version stays.
 */
export const BUSINESS = {
  usecase: 'business',
  /* 1.2.0 BECAUSE IT GAINS A PACK AND A PAGE, its own Home, where it had none: a declaration added is a minor step.
     1.3.0 BECAUSE IT GAINS A VOICE, three of Home's lines said as a business says them (PGS-24), each a new setting a
     person can change at /packs. */
  version: '1.3.1',
  title: 'Small business',
  summary: 'What your clients owe you and what you owe, the hosting and subscriptions you run on, the people involved and the work.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain, the house voice',
  signals: [
    'business', 'small business', 'my business', 'studio', 'agency', 'shop', 'store', 'freelance', 'freelancer', 'freelancing',
    'consultancy', 'consulting', 'clients', 'client', 'customers', 'invoice', 'invoices', 'invoicing', 'domains',
    'hosting', 'subscriptions', 'contractors', 'accountant', 'vat', 'bookkeeping', 'retainer', 'foundry',
  ],
  modules: [],
  /* THE HOUSE VOICE BUT FOR HOME'S LINES ABOUT MONEY: the house words are written for every kind of person, and a
     business's week is invoices, bills and renewals. */
  voice: {
    coming_up: 'Falling due',
    nothing_due: 'No invoice, bill or renewal falls due in the next two weeks.',
    fills_with: 'What you are owed, what you owe, the questions waiting on you and what changed while you were away show up here as your lists fill.',
  },
  skills: [],
  pack: {
    pack: 'usecase-business',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        /* WHAT YOU HAVE, WHAT FALLS DUE THIS WEEK, WHAT NEEDS YOUR CALL, WHO IS WORKING, WHAT CHANGED. The figures are the
           ones the installed packs pinned to Home (`home: 1..9`, Cash now and how long it lasts when Money is in), and
           Home hides a block with nothing in it, so a business with no Money yet opens on its week and not on empty
           tiles. `register.session` is the kernel's own list and is on every record, so requiring it asks nothing of
           the sentence. */
        page: 'home-business',
        title: 'Overview',
        icon: 'home',
        requires: ['register.session'],
        blocks: [
          { kind: 'stat', lead: true, heading: 'What you have', span: 12, source: 'figures.home' },
          {
            /* EVERY LIST THAT HOLDS A DUE DAY, overdue first and then by day: an invoice, a bill, a renewal and a task
               are one week, and the amount carries its own sign. */
            kind: 'table',
            heading: 'Due this week',
            span: 12,
            source: 'deadlines',
            horizon: 7,
            columns: [
              { field: 'title', label: 'Description', width: 'minmax(14ch,1fr)' },
              { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
              { field: 'day', label: 'Due', width: '13ch', align: 'end' },
            ],
            limit: 8,
            empty: 'Nothing is due this week.',
          },
          { kind: 'queue', heading: 'Needs your call', span: 12, source: 'governance.open', limit: 5 },
          {
            kind: 'table',
            heading: 'Working now',
            span: 12,
            source: 'sessions.live',
            where: 'state is active',
            columns: [
              { field: 'agent', label: 'Agent' },
              { field: 'doing', label: 'Doing' },
              { field: 'last_seen', label: 'Last seen' },
            ],
            limit: 6,
          },
          { kind: 'feed', heading: 'What changed', span: 12, source: 'activity', first: 8, empty: 'Nothing has changed yet.' },
        ],
      },
    ],
  },
};

/**
 * WHAT THE MODULES SAY TO A SMALL BUSINESS, by module and then by the module's own words (`MODULE_NAMES` in
 * `install.ts`). A business is not given the plain words the other use cases get: money it is owed is an invoice, and a
 * bakery reads "Late invoices" as its own where a person would read somebody else's record. So Money's late note names
 * the invoices it counts.
 */
export const BUSINESS_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'money-core': {
    'Late to you': 'Late invoices',
    'Money you are owed has gone past its date: {{late-in}} in all.': 'Invoices have gone past their date unpaid: {{late-in}} in all.',
  },
};
