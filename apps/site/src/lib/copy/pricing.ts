/**
 * The pricing page and the Slash page. What a plan holds is the reader's question on `/pricing`, and those figures
 * live in `plans.ts`, not here: this file holds only the sentences said about them, and a sentence that carries a
 * figure is a function of it, so `lib/pricing/cards.ts` fills it from `TABLE` and no figure is typed twice.
 */

import { PACKS, type Pack } from '../plans.ts';

/** A count as every figure on the site is grouped: 1,000 and 750,000. */
const grouped = (n: number): string => n.toLocaleString('en-US');

/** Who may hold a record: `people` in `PLAN_TABLE`, where `null` is no limit. */
const people = (n: number | null): string => (n === 1 ? 'Just you' : 'Everyone you invite');

/** A figure of bytes as a person says it: Free's 100,000,000 reads as 100 MB, never 0.1 GB. */
const size = (bytes: number): string => (bytes < 1_000_000_000 ? `${grouped(bytes / 1_000_000)} MB` : `${grouped(bytes / 1_000_000_000)} GB`);

/** A figure of milliseconds as hours: `ms` in `PLAN_TABLE`. */
const hours = (ms: number): string => `${grouped(ms / 3_600_000)} hours`;

/** The figures a card's lines and the table's cells read, one row of `TABLE` (`plans.ts`). */
export type Figures = {
  agents: number;
  credits: number;
  people: number | null;
  allowance: { runs: number; requests: number; bytes: number; ms: number };
};

export const pricing = {
  /**
   * THE SLASH PAGE. Everything it says Slash does is in
   * `packages/record/src/slash.ts` and `packages/slash`, and the limits are the product's: drafts are
   * questions in Decide (`arrange.ts`), the vault is closed to it, it is quiet on a record younger than
   * two weeks (`YOUNG_DAYS`), and background work has its own allowance.
   */
  slash: {
    title: 'Slash',
    sub:
      'The assistant built into every record. Press / anywhere to ask a question, have it build a page ' +
      'or a rule, or see what needs you today. Nothing it writes goes in until you say yes.',
    primary: 'Start for free',
    secondary: 'How credits work',
    abilities: [
      {
        id: 'ask',
        title: 'Ask',
        lead:
          'Ask the way you would ask a person. The answer comes from your own lists, says which one, and ' +
          'you can click a number to see what makes it up.',
        examples: ['What do I owe in the next two weeks?', 'Which clients are late, and by how much?', 'How much went on hosting this year?'],
      },
      {
        id: 'draft',
        title: 'Draft',
        lead:
          'Describe a page, a list, a rule or an edit. Slash puts together a draft and shows you exactly ' +
          'what it would change. You accept it, tweak it, or throw it away.',
        examples: ['Make me a page for the Lisbon trip', 'Add a field for the invoice number', 'Ask me when a bill is a week late'],
      },
      {
        id: 'notice',
        title: 'Notice',
        lead:
          'Once a day Slash looks over the record and flags what is due, what changed and what looks off. ' +
          'It shows up on Home and in your daily email, and on a quiet day there is nothing.',
        examples: ['Rent is due before pay day', 'A card bill is higher than usual', 'Three tickets have waited a week in review'],
      },
      {
        id: 'learn',
        title: 'Learn',
        lead:
          'Forward a few emails of the same kind and Slash works out how to file them. Once you approve ' +
          'that, every one after is filed automatically, and it costs no credits.',
        examples: ['Card alerts into Spending', 'Invoices into Money', 'A skill that learned your filing rules'],
      },
    ],
    rulesTitle: 'Ground rules',
    rules: [
      { head: 'You approve every change', said: 'Anything Slash wants to add or edit waits in Decide until you accept it.' },
      { head: 'It can’t see your keys', said: 'Saved API keys and passwords are off limits. It only knows their names.' },
      { head: 'The daily check is free', said: 'Flagging what is due, writing your daily email and learning how to file things never use your credits.' },
      { head: 'It waits before flagging things', said: 'On a new record it stays quiet for the first two weeks, until there is enough history to go on.' },
    ],
    allowance: {
      title: 'How credits work',
      lead: 'Each question or draft uses one credit, no matter how long the answer takes. Every plan comes with a monthly amount, Free included.',
      credits: 'credits a month',
      packs: 'Credit packs',
      // `PACKS` in `plans.ts` is `packsOnSale(LAUNCH.billing)`: empty until billing is on, and then these say what each is.
      packsN: (credits: number) => (credits > 0 ? `+${credits.toLocaleString('en-US')}` : ''),
      packsUnit: (packs: readonly Pick<Pack, 'credits' | 'price'>[] = PACKS) =>
        packs.length === 0
          ? 'Credit packs are coming later.'
          : `credits for ${packs[0]?.price}` +
            packs.slice(1).map((p) => `, or ${p.credits.toLocaleString('en-US')} for ${p.price}`).join('') +
            ', and they do not end with the month',
      more: 'See pricing',
    },
    /**
     * THE DRAWINGS ON /slash. Every figure in them is the palette demo's above, or the home page's inbox scene, so
     * nothing drawn here says a thing the page does not already say in words.
     */
    drawn: {
      askReading: (what: string, pct: number) => `${what} is ${pct}% of what is owed in the next two weeks.`,
      draftReading: 'Adds one page. Nothing else changes until you accept it.',
      noticeSpare: (amount: string) => `It covers the rent with ${amount} to spare.`,
      accept: 'You accept',
      into: (list: string) => `Into ${list}`,
      learnReading: 'No credits, for the learning or the filing.',
      learnLabel: (list: string) =>
        `Three card alerts arrive, you accept how to file them once, and every one after goes into ${list}`,
      /* FREE LEADS THE BARS (DIRECTION §35), so the label names every plan and the reading starts at Free. The lead
         above already says Free has credits, so the reading says when they come back (`nextMonth` in `directory.ts`). */
      creditsLabel: 'Slash credits a month on each plan',
      creditsReading: (times: string) => `Free’s credits come back on the first of every month. Cloud Plus has ${times} times the credits of Cloud.`,
      /* The four rules' glyphs, in the order `rules` says them. */
      ruleGlyphs: ['decide', 'key', 'coins', 'clock'],
    },
    closeTitle: 'Try it on your own record.',
    closeBody: 'Slash is included on every plan from day one.',
  },

  /**
   * THE PRICING PAGE, the prototype's `#pricing` (`loop/site-2026-10-17/src/site.html`, DIRECTION §47). Free leads
   * (§35): it is the headline and the first card, the black one. Every figure is `TABLE`'s in `plans.ts`, which
   * `plans.test.ts` holds to `PLAN_TABLE`, the checkout's `HOSTED_PLANS` and the Directory's `ALLOWANCE`, and
   * `lib/pricing/cards.ts` puts each figure into these sentences.
   *
   * HONEST AT LAUNCH (§47). The paid buttons follow `LAUNCH.billing`: with billing off the paid cards say "Coming soon"
   * in the button's place and link nothing. Extra use is sold by no checkout (`mayRun` in `directory.ts` holds a
   * record at its allowance), so its section always says it is coming soon. No sentence says a card is charged.
   *
   * TWO METERS ARE NAMED FOR WHAT THE CODE COUNTS, not the prototype's words: `bytes` is data fetched from other
   * services in the month (`dir_usage_day` in `directory.ts`), so it reads "Data fetched", never "Storage", and
   * `requests` is the calls a record's automations and scripts make out, so it reads "Requests to other services".
   */
  pricing: {
    // A headline with no price in it: `plans.test.ts` checks that "$12 a month" never leads.
    title: 'Free for one person.',
    sub: 'Every plan has the whole app. You pay for room: more agents, more questions, more people.',
    /** The three cards, Free first. A line that carries a figure is filled from the plan's row of `TABLE`. */
    cards: {
      free: {
        // Signed out the tag invites; signed in (`html[data-in]`, `lib/site/signed-in.ts`) it says whose plan it is.
        tag: 'Start here',
        mine: 'Your plan',
        // The free door is `makeFree` in `billing.ts`: no Stripe call and no card.
        per: 'no card',
        lines: (f: Figures) => ['The whole app', `${grouped(f.agents)} agents`, `${grouped(f.credits)} questions to Slash a month`, people(f.people)],
      },
      cloud: {
        per: 'a month',
        cta: 'Choose Cloud',
        lines: (f: Figures) => [`${grouped(f.agents)} agents`, `${grouped(f.credits)} questions a month`, people(f.people), 'More runs, data and script time'],
      },
      plus: {
        per: 'a month',
        cta: 'Choose Cloud Plus',
        // Five times is every figure in `ALLOWANCE.plus` over `ALLOWANCE.hosted`, held by `plans.test.ts`.
        lines: (f: Figures) => [`${grouped(f.agents)} agents`, `${grouped(f.credits)} questions a month`, people(f.people), 'Five times Cloud'],
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
        { key: 'agents', name: 'Agents connected', cell: (f: Figures) => grouped(f.agents) },
        // One question or draft is one credit, however many passes it takes (`packages/slash/src/types.ts`).
        { key: 'credits', name: 'Questions and drafts from Slash', cell: (f: Figures) => grouped(f.credits) },
        { key: 'people', name: 'People on the record', cell: (f: Figures) => people(f.people) },
        { key: 'runs', name: 'Automation runs', cell: (f: Figures) => grouped(f.allowance.runs) },
        { key: 'requests', name: 'Requests to other services', cell: (f: Figures) => grouped(f.allowance.requests) },
        { key: 'bytes', name: 'Data fetched', cell: (f: Figures) => size(f.allowance.bytes) },
        { key: 'ms', name: 'Script time', cell: (f: Figures) => hours(f.allowance.ms) },
      ],
    },
    extra: {
      title: 'Extra use, if you want it',
      say: 'Off by default. Turn it on with a monthly cap, and BrainDog never goes past it.',
      // No checkout sells extra use, so this is said whatever `LAUNCH.billing` is (`promises.test.mjs` allows it here).
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
      items: [
        // `ASK_CAP_*` and `BACKGROUND_ASKS_MONTH` in `packages/slash/src/types.ts`: the brief and filing spend no ask.
        { q: 'What is a question to Slash?', a: 'One question or one draft, however much work it takes. Your brief, filing and your rules never spend one.' },
        // An agent key per app (`agents` in `PLAN_TABLE`).
        { q: 'What counts as an agent?', a: 'Each app you connect. Claude on your laptop is one, Cursor is another.' },
        // Export is the CLI's and Settings' one file, on every plan.
        { q: 'Can I take my data out?', a: 'Yes, all of it, as one file, on every plan.' },
        // The portal is `billing.ts`; export is never withheld from a lapsed record.
        { q: 'Can I cancel any time?', a: 'Yes, from Settings. Your record stays readable, and you can export it.', billing: true },
      ],
    },
    close: { title: 'Start free.', body: 'Upgrade when it earns it. No card for the free plan.' },
  },
} as const;
