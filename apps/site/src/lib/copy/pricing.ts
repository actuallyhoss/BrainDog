/**
 * The pricing page. What a plan holds is the reader's question on `/pricing`, and those figures
 * live in `plans.ts`, not here: this file holds only the sentences said about them, and a sentence that carries a
 * figure is a function of it, so `lib/pricing/cards.ts` fills it from `TABLE` and no figure is typed twice. The Slash
 * page's words are `copy/slash.ts`'s.
 */

/** A count as every figure on the site is grouped: 1,000 and 750,000. */
const grouped = (n: number): string => n.toLocaleString('en-US');

/**
 * Who may hold a record: `teams` in `PLAN_TABLE`. A second person joins on Cloud Plus only (`teamsOn`), so Cloud's
 * `people: null` is not "everyone you invite": nobody can be let in on it.
 */
const people = (teams: boolean): string => (teams ? 'You and the people you invite' : 'Just you');

/** A figure of bytes as a person says it: Free's 100,000,000 reads as 100 MB, never 0.1 GB. */
const size = (bytes: number): string => (bytes < 1_000_000_000 ? `${grouped(bytes / 1_000_000)} MB` : `${grouped(bytes / 1_000_000_000)} GB`);

/** A figure of milliseconds as hours: `ms` in `PLAN_TABLE`. */
const hours = (ms: number): string => `${grouped(ms / 3_600_000)} hours`;

/** The figures a card's lines and the table's cells read, one row of `TABLE` (`plans.ts`). */
export type Figures = {
  agents: number;
  credits: number;
  people: number | null;
  teams: boolean;
  allowance: { runs: number; requests: number; bytes: number; ms: number };
};

export const pricing = {
  /**
   * THE PRICING PAGE, the prototype's `#pricing`. Free leads
   * (§35): it is the headline and the first card, the black one. Every figure is `TABLE`'s in `plans.ts`, which
   * `plans.test.ts` holds to `PLAN_TABLE`, the checkout's `HOSTED_PLANS` and the Directory's `ALLOWANCE`, and
   * `lib/pricing/cards.ts` puts each figure into these sentences.
   *
   * HONEST AT LAUNCH (§47). The paid buttons follow `LAUNCH.billing`: with billing off the paid cards say "Coming soon"
   * in the button's place and link nothing. Extra use follows `LAUNCH.extra`, the one flag that says production sells
   * it: until it is on, its section says it is coming soon. No sentence says a card is charged.
   *
   * TWO METERS ARE NAMED FOR WHAT THE CODE COUNTS, not the prototype's words: `bytes` is data fetched from other
   * services in the month (`dir_usage_day` in `directory.ts`), so it reads "Data fetched", never "Storage", and
   * `requests` is the calls a record's automations and scripts make out, so it reads "Requests to other services".
   */
  pricing: {
    /**
     * THE EARLY ACCESS PAGE (20 October): what `/pricing` says while `LAUNCH.billing` is off. Free, the one plan
     * anybody can be on, leads with its $0 and the same limits Settings > Billing shows; Cloud and Cloud Plus sit
     * beside it, named, with no price: "coming soon, priced at launch" (his N2, 1 November). The plans below come back
     * the day billing does. The figures are `TABLE.free`'s, filled in by the page.
     */
    early: {
      title: 'Free while in early access.',
      lede: 'BrainDog is invite only for now. Everything in it is free while we open it up.',
      plan: {
        name: 'Free',
        price: '$0',
        lines: (f: Figures) => [
          'The whole app',
          `${grouped(f.agents)} AI tools connected`,
          `${grouped(f.credits)} Slash questions a month`,
          `${grouped(f.allowance.runs)} automation runs a month`,
          'Invite the people you work with',
          'Export any time',
        ],
      },
      /* ONE LINE FOR WHAT COMES LATER (plan F20): a tile naming Cloud and Cloud Plus with two "Coming soon" rows said
         nothing a reader could act on. Still his N2 words: both named, coming soon, priced at launch. */
      later: { say: 'Cloud and Cloud Plus are coming soon, priced at launch; nothing you make now is lost.' },
      faq: {
        title: 'Questions people ask',
        questions: [
          { q: 'What is a Slash question?', a: 'One question or one change, however much work it takes. Your brief, filing and your rules never spend one.' },
          { q: 'What counts as an AI tool?', a: 'Each app you connect. Claude on your laptop is one, Cursor is another.' },
          { q: 'Can I take my data out?', a: 'Yes, all of it, as one file, whenever you like.' },
        ],
      },
    },
    // A headline with no price in it: `plans.test.ts` checks that "$12 a month" never leads.
    title: 'Free for one person.',
    sub: 'Every plan has the whole app. You pay for room: more AI tools, more questions, and on Cloud Plus more people.',
    /** The three cards, Free first. A line that carries a figure is filled from the plan's row of `TABLE`. */
    cards: {
      free: {
        // Signed out the tag invites; signed in (`html[data-in]`, `lib/site/signed-in.ts`) it says whose plan it is.
        tag: 'Start here',
        mine: 'Your plan',
        // The free door is `makeFree` in `billing.ts`: no Stripe call and no card.
        per: 'no card',
        lines: (f: Figures) => ['The whole app', `${grouped(f.agents)} AI tools connected`, `${grouped(f.credits)} Slash questions a month`, people(f.teams)],
      },
      cloud: {
        per: 'a month',
        cta: 'Choose Cloud',
        lines: (f: Figures) => [`${grouped(f.agents)} AI tools connected`, `${grouped(f.credits)} Slash questions a month`, people(f.teams), 'More runs, data and script time'],
      },
      plus: {
        per: 'a month',
        cta: 'Choose Cloud Plus',
        // Five times is every figure in `ALLOWANCE.plus` over `ALLOWANCE.hosted`, held by `plans.test.ts`.
        lines: (f: Figures) => [`${grouped(f.agents)} AI tools connected`, `${grouped(f.credits)} Slash questions a month`, people(f.teams), 'Five times Cloud'],
      },
      /** A paid card's word in its button's place while `LAUNCH.billing` is off. Plain text: nothing to press. */
      soon: 'Coming soon',
    },
    holds: {
      title: 'What each plan holds',
      // The month is `nextMonth` in `directory.ts`; `mayRun` holds the work that needs more until then.
      say: 'Per record, each month. Nothing stops at the limit. It waits for next month.',
      /** The header a screen reader hears over the meters' names; drawn hidden, as the prototype's empty cell. */
      what: 'What it holds',
      /** The table's seven rows, in the order they are drawn: a name and a plan's cell from its own figures. */
      rows: [
        // `agents` in `PLAN_TABLE`: agent keys a record holds live at once.
        { key: 'agents', name: 'AI tools connected', cell: (f: Figures) => grouped(f.agents) },
        // One question or draft is one credit, however many passes it takes (`packages/slash/src/types.ts`).
        { key: 'credits', name: 'Slash questions', cell: (f: Figures) => grouped(f.credits) },
        { key: 'people', name: 'People', cell: (f: Figures) => people(f.teams) },
        { key: 'runs', name: 'Automation runs', cell: (f: Figures) => grouped(f.allowance.runs) },
        { key: 'requests', name: 'Requests to other services', cell: (f: Figures) => grouped(f.allowance.requests) },
        { key: 'bytes', name: 'Data fetched', cell: (f: Figures) => size(f.allowance.bytes) },
        { key: 'ms', name: 'Script time', cell: (f: Figures) => hours(f.allowance.ms) },
      ],
    },
    extra: {
      title: 'Extra use, if you want it',
      say: 'Off by default. Turn it on with a monthly cap, and BrainDog never goes past it.',
      // Said until `LAUNCH.extra` is on, the day production sells extra usage (`promises.test.mjs` allows it here).
      soon: 'Coming soon.',
      on: 'On Cloud and Cloud Plus',
      price: 'Price',
      /** `extra` in `PLAN_TABLE`'s Cloud row: a name, and how the amount a price buys reads after the price. */
      rows: [
        { key: 'runs', name: 'Automation runs', per: (n: number) => `per ${grouped(n)}` },
        { key: 'requests', name: 'Requests to other services', per: (n: number) => `per ${grouped(n)}` },
        { key: 'bytes', name: 'Data fetched', per: (n: number) => (n === 1_000_000_000 ? 'per GB' : `per ${size(n)}`) },
        { key: 'ms', name: 'Script time', per: (n: number) => `per ${hours(n)}` },
      ],
    },
    faq: {
      title: 'Questions people ask',
      /** `billing: true` is a question drawn only while `LAUNCH.billing` is on: nobody can cancel what nobody sells. */
      questions: [
        // `ASK_CAP_*` and `BACKGROUND_ASKS_MONTH` in `packages/slash/src/types.ts`: the brief and filing spend no question.
        { q: 'What is a Slash question?', a: 'One question or one change, however much work it takes. Your brief, filing and your rules never spend one.' },
        // An agent key per app (`agents` in `PLAN_TABLE`).
        { q: 'What counts as an AI tool?', a: 'Each app you connect. Claude on your laptop is one, Cursor is another.' },
        // Export is the CLI's and Settings' one file, on every plan.
        { q: 'Can I take my data out?', a: 'Yes, all of it, as one file, on every plan.' },
        // The portal is `billing.ts`; export is never withheld from a lapsed record.
        { q: 'Can I cancel any time?', a: 'Yes, from Settings. Your BrainDog goes back to Free, or stays readable if it no longer fits Free, and you can always export it.', billing: true },
      ],
    },
  },
} as const;
