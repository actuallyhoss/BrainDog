/**
 * Small business: the first-party setup onboarding made before use cases existed.
 *
 * IT CARRIES NO LIST. Its modules are whichever first-party packs the sentence names, which is what onboarding
 * already did, and it speaks in the house voice but for three lines of Home that name a business's money in and
 * out. It is in the catalogue so the arranger can say "this reads like a business" as plainly as it says
 * "student".
 *
 * ITS PACK IS ONE PAGE, ITS HOME, SINCE 1.2.0. Money's own Home retired with money-core 3.0.0, and a record
 * whose use case declares no `home-<id>` falls back to the house Home, which leads with nothing a business asks
 * first. Because its modules are whatever the sentence named, the page reads only what the record answers across
 * every list it holds (`figures.home`, `deadlines`, `governance.open`, `sessions.working`, `activity`), and so installs
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
 * case, so the first run proposed nothing for the card the owner had just read; typed back now, it hears clients, hosting and subscriptions, and no other card hears a word of it
 * (`test/card-summary-proposes-itself.test.ts`). The summary moved and the signals did not: with "owed" as a signal,
 * "track what my brother owed me for the holiday", which proposes nothing today, proposed Small business (measured).
 * Neither is in a pack, since Small business carries none, so the version stays.
 *
 * IT SAYS MONEY IN AND OUT, NOT WHO OWES WHOM (because Money is a finance application, not a ledger of who owes
 * whom). It read "What your clients owe you and what you owe"; typed back now it hears hosting and subscriptions,
 * still two signals of its own and none of another card's, and again the signals did not move.
 */
export const BUSINESS = {
  usecase: 'business',
  /* 1.2.0 BECAUSE IT GAINS A PACK AND A PAGE, its own Home, where it had none: a declaration added is a minor step.
     1.3.0 BECAUSE IT GAINS A VOICE, three of Home's lines said as a business says them, each a new setting a
     person can change at /packs.
     1.4.0: calmer. Home opens on one line of what needs your call, every heading wears a glyph, and
     the questions are drawn only while one is asked.
     1.5.0: Working now reads the runs active and heard from today (the Agents add-on's clause), where
     every run the end hook never closed was listed as working beside the one typing now. A clause narrowed, so a minor
     step.
     1.6.0: Working now reads the record's working runs (`sessions.working`, agents 1.9.0), active and heard from in the
     last fifteen minutes, where its own clause said today and a run quiet for hours read as working. A source changed
     under a block that is already there, so a minor step. 1.5.0 is live.
     1.7.0: "shop" and "store" are Shop's words now (`shop.ts`), which carries Orders and Products where a business
     carries no list, so a shop is proposed the lists it writes in. A business that also sells is still Small business,
     with Shop beside it. The use case a sentence proposes changed, so a minor step.
     1.7.1: its Home is titled Today, where it said Overview under a rail item that says Today (this use case's voice
     names no word for Home, so the rail says the house's). One word on a page that is already there, so a patch step.
     1.7.0 is live. Still unreleased (commit 63423720 holds 1.7.0), it takes batch 88's block with no version of its
     own: Home draws Gone quiet, what stopped reporting, straight under What you have (founder-home-quiet-88), a sixth
     tile on a page held to six. A block added, nothing taken away.
     1.7.2: the card's summary is one short line. Words only, so a patch step.
     1.7.3 (onboarding6): a streamer, a YouTuber or a creator paid by sponsors is heard as a small business (`signals`).
     Signals only, nothing a record holds, so a patch step; 1.7.2 is published.
     1.8.0 (no briefs, 3 Nov): Today no longer opens on how many questions need your call, which Needs your call under it lists.
     A block taken away and none added, so a minor step; 1.7.3 is published. */
  version: '1.8.0',
  title: 'Small business',
  summary: 'Money in and out, clients and subscriptions.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain, the house voice',
  signals: [
    'business', 'small business', 'my business', 'studio', 'agency', 'freelance', 'freelancer', 'freelancing',
    'consultancy', 'consulting', 'clients', 'client', 'customers', 'invoice', 'invoices', 'invoicing', 'domains',
    'hosting', 'subscriptions', 'contractors', 'accountant', 'vat', 'bookkeeping', 'retainer', 'foundry',
    /* A CREATOR'S WORK IS A SMALL BUSINESS (onboarding6: "I'm a streamer and YouTuber" paid by sponsors and paying two
       editors was read by the rules as a household's Personal, on "money"). Signals only, outside the pack. */
    'streamer', 'youtuber', 'content creator', 'creator', 'sponsors', 'sponsorships', 'brand deals',
  ],
  modules: [],
  /* THE HOUSE VOICE BUT FOR HOME'S LINES ABOUT MONEY: the house words are written for every kind of person, and a
     business's week is invoices, bills and renewals. */
  voice: {
    coming_up: 'Falling due',
    nothing_due: 'No invoice, bill or renewal falls due in the next two weeks.',
    fills_with: 'Money coming in, money going out, the questions waiting on you and what changed while you were away show up here as your lists fill.',
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
        title: 'Today',
        icon: 'home',
        requires: ['register.session'],
        blocks: [
          { kind: 'stat', lead: true, heading: 'What you have', icon: 'wallet', span: 12, source: 'figures.home' },
          {
            /* WHAT STOPPED REPORTING, STRAIGHT UNDER WHAT THERE IS, INSIDE 1.7.1 (batch 88): the table a founder's Home
               draws since 2.6.0 and the browser draws on the Today it builds, word for word, over the record's own read
               of what went quiet. No `when:` and no `empty:`: the record leaves it out while nothing is quiet. */
            kind: 'table',
            heading: 'Gone quiet',
            icon: 'history',
            span: 12,
            source: 'exceptions',
            columns: [
              { field: 'subject', label: 'What' },
              { field: 'since', label: 'Last seen' },
              { field: 'was', label: 'Before' },
            ],
            limit: 6,
          },
          {
            /* EVERY LIST THAT HOLDS A DUE DAY, overdue first and then by day: an invoice, a bill, a renewal and a task
               are one week, and the amount carries its own sign. */
            kind: 'table',
            heading: 'Due this week',
            icon: 'calendar-clock',
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
          { kind: 'queue', heading: 'Needs your call', icon: 'ask', span: 12, source: 'governance.open', limit: 5, when: { metric: 'questions-open', gt: 0 } },
          {
            /* THE RUNS WORKING NOW, the record's own since 1.6.0 (`sessions.working`): heard from in the last fifteen
               minutes, a helper folded under its run. Drawn only while one is. */
            kind: 'table',
            heading: 'Working now',
            icon: 'session',
            span: 12,
            source: 'sessions.working',
            when: { metric: 'runs-working', gt: 0 },
            columns: [
              { field: 'agent', label: 'Agent' },
              { field: 'doing', label: 'Doing' },
              { field: 'last_seen', label: 'Last seen' },
            ],
            limit: 6,
          },
          { kind: 'feed', heading: 'What changed', icon: 'history', span: 12, source: 'activity', first: 8, empty: 'Nothing has changed yet.' },
        ],
      },
    ],
  },
};

/**
 * WHAT THE MODULES SAY TO A SMALL BUSINESS, by module and then by the module's own words (`MODULE_NAMES` in
 * `install.ts`). A business is not given the plain words the other use cases get: money it is owed is an invoice, and a
 * bakery reads "invoices" as its own where a person would read somebody else's record. Money's late line already names
 * the invoices it counts, and since money-core 3.5.0 it carries no heading to call Late invoices.
 */
export const BUSINESS_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
