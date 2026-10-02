/**
 * The pricing page and the Slash page. What a plan includes is the reader's question on `/pricing`,
 * and those figures live in `plans.ts`, not here: this file holds only the sentences said about them.
 */

import type { Allowance } from '../plans.ts';

/** A figure a month, grouped the way every figure on the site is. */
const aMonth = (n: number): string => `${n.toLocaleString('en-US')} a month`;

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
    /** The palette the page and the home page draw. Every figure is the Personal record's. */
    demo: {
      label: 'Slash, drawn',
      placeholder: 'Ask, or say what you want',
      accept: 'Accept',
      reject: 'Reject',
      modes: [
        {
          id: 'ask',
          label: 'Ask',
          prompt: 'What do I owe in the next two weeks?',
          lead: 'GBP 910.99, across four bills.',
          rows: [
            ['Streaming subscription', 'GBP 10.99', 'In 2 days'],
            ['Phone contract', 'GBP 18.00', 'In 3 days'],
            ['Rent', 'GBP 850.00', 'In 6 days'],
            ['Gym membership', 'GBP 32.00', 'In 12 days'],
          ],
          source: 'From Bills',
        },
        {
          id: 'draft',
          label: 'Draft',
          prompt: 'Make me a page for the Lisbon trip',
          lead: 'A new page, Trip to Lisbon, with three blocks:',
          rows: [
            ['A figure', 'GBP 420.00 of GBP 900.00 put by', ''],
            ['A list', 'Every row in Put by for the trip', ''],
            ['A chart', 'What was put by, month by month', ''],
          ],
          source: 'Waits in Decide until you accept it',
        },
        {
          id: 'notice',
          label: 'Notice',
          prompt: 'This morning',
          lead: 'Rent is due in 6 days, and pay day is in 10.',
          rows: [
            ['Current account', 'GBP 1,240.56', 'Today'],
            ['Rent', 'GBP 850.00', 'In 6 days'],
          ],
          source: 'Your current account covers it',
        },
      ],
    },
    abilities: [
      {
        id: 'ask',
        title: 'Ask',
        lead:
          'Ask the way you would ask a person. The answer comes from your own lists, says which one, and ' +
          'you can click a number to see the rows behind it.',
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
      // `PACKS` in `plans.ts` is empty until a pack is sold, and then these say what it is.
      packsN: (credits: number) => (credits > 0 ? `+${credits.toLocaleString('en-US')}` : ''),
      packsUnit: (packs: readonly { credits: number; price: string }[]) =>
        packs.length === 0
          ? 'Credit packs are coming later.'
          : `credits for ${packs[0]?.price}` +
            packs.slice(1).map((p) => `, or ${p.credits.toLocaleString('en-US')} for ${p.price}`).join('') +
            ', and they never expire',
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
   * THE PRICING PAGE. Free leads (DIRECTION §35): it is the page's headline and its first tile, and Cloud and Cloud
   * Plus follow as the plans for pros. The plans it sells are `HOSTED_PLANS` in `apps/worker/src/billing.ts`, Free is
   * `FREE_PLAN` there, and the allowance a record is held to is `ALLOWANCE` in `packages/record/src/directory.ts`;
   * `plans.test.ts` holds `plans.ts` to all three. Credit packs and extra usage are not built, so the page says they
   * are coming later in one line and sells neither.
   */
  pricing: {
    // A headline with no price in it: `plans.test.ts` checks that "$12 a month" never leads.
    title: 'Free for one person.',
    // The free door is `makeFree` in `billing.ts`: no Stripe call and no card, and no date it ends.
    sub:
      'One record with the whole app: your lists and pages, Slash, agents and automations. No card, and no trial ' +
      'that runs out. Pay only when you need more.',
    /** The column header a screen reader hears over the table's row names. */
    what: 'What',
    /** Each card's button and the lines under its allowance, by `Plan['id']`. */
    plans: {
      free: {
        cta: 'Start for free',
        // Nothing in the app is gated by plan; backups are `apps/worker/src/snapshots.ts`; export is Settings' one file.
        points: ['Every part of the app', 'Nightly backups, last 30 kept', 'Export everything, any time'],
      },
      cloud: {
        cta: 'Choose Cloud',
        // `dir_member` has no limit per record; the switch and the cancel are `billing.ts`' portal.
        points: ['Colleagues, as many as you like', 'Change or cancel any time'],
      },
      plus: {
        cta: 'Choose Cloud Plus',
        // Five times is every figure in `ALLOWANCE.plus` over `ALLOWANCE.hosted`, held by `plans.test.ts`.
        points: ['Five times the Cloud allowance', 'Colleagues, as many as you like'],
      },
    },
    /* What the Free card sums up of its allowance, under the price. */
    summary: (credits: string, runs: string) => `${credits} Slash credits and ${runs} automation runs a month`,
    /* THE PLANS FOR PROS, second and quieter: one tile, a line each. */
    prosTitle: 'For pros',
    prosLead: 'More Slash, more automations, and your colleagues in the same record. Paid by the month, per record.',
    /** A paid plan's line under its name: what it includes, from its own figures. */
    prosLine: (credits: string, runs: string) => `${credits} Slash credits and ${runs} runs a month`,
    usageTitle: 'Compare plans',
    // The month is `nextMonth` in `directory.ts`, UTC; pages, lists and history are no meter in `Allowance`.
    usageLead: 'Allowances reset on the first of each month. Pages, lists and history are never counted.',
    /* The line under the comparison, from Free's own runs: how many automations it can run once a day through a long month. */
    compareReading: (daily: string) => `On Free, ${daily} can run every day, all month.`,
    automations: (n: number, word: string) => (n === 1 ? 'one automation' : `${word} automations`),
    // Neither is built: `billing.ts` sells the plans alone, and `mayRun` in `directory.ts` holds a record at its allowance.
    later: 'Credit packs and extra usage are coming later. Until then, work over the allowance waits for the next month.',
    /**
     * The allowance table's rows, in the order they are drawn: what each meter is called, what it counts,
     * and how a plan's figure for it reads. Every key of `Allowance` has one, which `plans.test.ts` checks.
     */
    usage: [
      // One ask is one credit however many passes it takes, and background work has `BACKGROUND_ASKS_MONTH` of its own (`packages/slash/src/types.ts`).
      { key: 'credits', name: 'Slash credits', said: 'One for each question or draft. Background work never spends them.', amount: aMonth },
      // A scheduled action's run and an automation's `rule:` run count (`COUNTED_ONLY` in `directory.ts`).
      { key: 'runs', name: 'Automation and script runs', said: 'Each time a pull, an automation or a script runs.', amount: aMonth },
      // What a run fetches is metered as requests; a delivery the outbox sends is `COUNTED_ONLY` and never limited.
      { key: 'requests', name: 'Requests to other services', said: 'Pulls and calls your automations and scripts make.', amount: aMonth },
      { key: 'gb', name: 'Data fetched', said: 'What those requests bring back.', amount: (n: number) => `${n} GB a month` },
      // `ms` in `Allowance`, shown in hours.
      { key: 'hours', name: 'Script time', said: 'Time your scripts spend running.', amount: (n: number) => `${n} hours a month` },
    ] as { key: keyof Allowance; name: string; said: string; amount: (n: number) => string }[],
    bothTitle: 'On every plan',
    backupsLabel: (n: number) => `The last ${n} nightly copies, the newest at the right`,
    /** A line whose plans differ: Free's own, then the paid plans', when those two agree. */
    differs: (free: string, paid: string) => `${free} on Free, ${paid.toLowerCase()} on Cloud and Cloud Plus`,
    // What, then Free, Cloud and Cloud Plus. Each record is its own Durable Object (`apps/worker/src/index.ts`);
    // backups are `KEEP` in `snapshots.ts`; export is the CLI's and Settings' one file. Free is one person's (§35).
    rows: [
      ['People', 'Just you', 'Unlimited', 'Unlimited'],
      ['Database', 'Your own, not shared', 'Your own, not shared', 'Your own, not shared'],
      ['Backups', 'Nightly, last 30 kept', 'Nightly, last 30 kept', 'Nightly, last 30 kept'],
      ['Email and webhook inbox', 'Included', 'Included', 'Included'],
      ['Export', 'Any time, as one file', 'Any time, as one file', 'Any time, as one file'],
    ] as [string, string, string, string][],
    faqTitle: 'Questions',
    faq: [
      {
        // A record is one SQLite database, one Durable Object on the Worker (`packages/kernel`).
        q: 'What is a record?',
        a: 'Everything one person, family or company keeps track of: its lists, pages, rules and history, in one file. Most people need one. A second business is a second record.',
      },
      {
        // `makeFree` in `billing.ts`: no card, no row, no end date; one free record a person.
        q: 'Is Free really free?',
        a: 'Yes. One record for you, with every part of the app, for as long as you like. No card, and nothing ends after a trial.',
      },
      {
        // The upgrade is checkout with the record (`billing.ts`), and the allowance follows the plan.
        q: 'When would I pay?',
        a: 'When you want colleagues in the record, or more Slash and automations than Free includes. Upgrade from Settings and the larger allowance applies straight away.',
      },
      {
        // A scheduled pull and an automation count; an arrival or a delivery is `COUNTED_ONLY` in `directory.ts`.
        q: 'What counts as a run?',
        a: 'Each time a scheduled pull, an automation or a script runs. Mail and webhooks arriving at your record, and the notices it sends you, are never counted.',
      },
      {
        // `ASK_CAP_DEFAULT`, `ASK_CAP_FREE` and `BACKGROUND_ASKS_MONTH` in `packages/slash/src/types.ts`.
        q: 'What is a Slash credit?',
        a: 'One question or one draft, however long Slash works on it. Each plan includes a month of credits. Slash’s own daily read never spends yours.',
      },
      {
        // `mayRun` in `directory.ts` holds the action and says so in its event.
        q: 'What happens when I reach the allowance?',
        a: 'Work that needs more waits for the next month, and the record tells you what is waiting. Nothing is charged, and nothing is lost.',
      },
      {
        // The plan change and the portal are `billing.ts`; export is never withheld from a lapsed record (`settings/[area]/areas/Billing.svelte`).
        q: 'Can I change plan or cancel?',
        a: 'Whenever you like, from Settings. A change takes effect straight away, and a cancelled record can still be exported.',
      },
    ],
  },
} as const;
