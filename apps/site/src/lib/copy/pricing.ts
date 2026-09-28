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
   * two weeks (`YOUNG_DAYS`, decisions C71), and background work has its own allowance (contracts X41).
   */
  slash: {
    title: 'Slash',
    sub:
      'The assistant built into every record. Press / anywhere to ask a question, have it build a page ' +
      'or a rule, or see what needs you today. Nothing it writes goes in until you say yes.',
    primary: 'Start your record',
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
      lead: 'Each question or draft uses one credit, no matter how long the answer takes. Every plan comes with a monthly amount, and you can top up with a pack if you run out.',
      credits: 'credits a month',
      packs: 'Credit packs',
      packsN: (credits: number) => `+${credits.toLocaleString('en-US')}`,
      packsUnit: (packs: readonly { credits: number; price: string }[]) =>
        `credits for ${packs[0]?.price}` +
        packs.slice(1).map((p) => `, or ${p.credits.toLocaleString('en-US')} for ${p.price}`).join('') +
        ', and they never expire',
      more: 'See pricing',
    },
    closeTitle: 'Try it on your own record.',
    closeBody: 'Slash is included on every plan from day one.',
  },

  /**
   * THE PRICING PAGE. The plans it sells are `HOSTED_PLANS` in `apps/worker/src/billing.ts`, and the
   * allowance a record is held to is `ALLOWANCE` in `packages/record/src/directory.ts`; `plans.test.ts`
   * holds `plans.ts` to both. Credit packs and extra usage are the owner's call of 26 September
   * (`loop/DIRECTION.md` §33), written for launch day.
   */
  pricing: {
    title: 'Pricing',
    // A seat is never counted: the price is `HOSTED_PLANS`' per record, and `dir_record` holds no seat count.
    sub: 'You pay per record, by the month. Invite as many people as you like, it costs the same.',
    included: 'Included each month',
    popular: 'Most popular',
    /** The column header a screen reader hears over the table's row names. */
    what: 'What',
    /** Each card's button and the lines under its allowance, by `Plan['id']`. */
    plans: {
      cloud: {
        cta: 'Start your record',
        // `dir_member` has no limit per record; backups are `apps/worker/src/snapshots.ts`; the inbox is the `/in` doors.
        points: ['Unlimited colleagues', 'Nightly backups, last 30 kept', 'Email and webhook inbox'],
      },
      plus: {
        cta: 'Start with Plus',
        // Five times is every figure in `ALLOWANCE.plus` over `ALLOWANCE.hosted`, held by `plans.test.ts`; the switch is `billing.ts`' plan change.
        points: ['Five times the Cloud allowance', 'Everything in Cloud', 'Switch plans any time'],
      },
    },
    usageTitle: 'Compare plans',
    // The month is `nextMonth` in `directory.ts`, UTC; people, pages and lists are no meter in `Allowance`.
    usageLead: 'Allowances reset on the first of each month. People, pages, lists and history are never counted.',
    /**
     * The allowance table's rows, in the order they are drawn: what each meter is called, what it counts,
     * and how a plan's figure for it reads. Every key of `Allowance` has one, which `plans.test.ts` checks.
     */
    usage: [
      // One ask is one credit however many passes it takes, and background work has `BACKGROUND_ASKS_MONTH` of its own (`packages/slash/src/types.ts`).
      { key: 'credits', name: 'Slash credits', said: 'One for each question or draft. Background work never spends them.', amount: aMonth },
      // A scheduled action's run and an automation's `rule:` run count (`COUNTED_ONLY` in `directory.ts`, decisions C34).
      { key: 'runs', name: 'Automation and script runs', said: 'Each time a pull, an automation or a script runs.', amount: aMonth },
      // What a run fetches is metered as requests; a delivery the outbox sends is `COUNTED_ONLY` and never limited.
      { key: 'requests', name: 'Requests to other services', said: 'Pulls and calls your automations and scripts make.', amount: aMonth },
      { key: 'gb', name: 'Data fetched', said: 'What those requests bring back.', amount: (n: number) => `${n} GB a month` },
      // `ms` in `Allowance`, shown in hours.
      { key: 'hours', name: 'Script time', said: 'Time your scripts spend running.', amount: (n: number) => `${n} hours a month` },
    ] as { key: keyof Allowance; name: string; said: string; amount: (n: number) => string }[],
    // Each record is its own Durable Object (`apps/worker/src/index.ts`); backups are `KEEP` in `snapshots.ts`; export is the CLI's and Settings' one file.
    rows: [
      ['People', 'Unlimited', 'Unlimited'],
      ['Database', 'Your own, not shared', 'Your own, not shared'],
      ['Backups', 'Nightly, last 30 kept', 'Nightly, last 30 kept'],
      ['Email and webhook inbox', 'Included', 'Included'],
      ['Export', 'Any time, as one file', 'Any time, as one file'],
    ] as [string, string, string][],
    extraTitle: 'Need more?',
    packsTitle: 'Slash credit packs',
    // `PACKS` in `plans.ts`, the owner's call of 26 September (`loop/DIRECTION.md` §33), written for launch day.
    packsLead: 'Used after your monthly credits run out. They never expire.',
    packsPer: (credits: number) => `${credits.toLocaleString('en-US')} credits`,
    extraUsageTitle: 'Extra usage',
    // With it off, `mayRun` in `directory.ts` holds the action until the first of next month; the prices are `EXTRA` in `plans.ts` (§33).
    extraLead:
      'Off by default. Turn it on and set a monthly cap, and you are never charged past it. With it off, ' +
      'anything over your plan waits until next month.',
    faqTitle: 'Questions',
    faq: [
      {
        // A record is one SQLite database, one Durable Object on the Worker (`packages/kernel`).
        q: 'What is a record?',
        a: 'Everything one person, family or company keeps track of: its lists, pages, rules and history, in one file. Most people need one. A second business is a second record.',
      },
      {
        // `dir_member` in `directory.ts` has no limit per record, and no price reads a count of it.
        q: 'Are colleagues really free?',
        a: 'Yes. Invite as many people as you need, with any level of access. The price is per record, not per person.',
      },
      {
        // A scheduled pull and an automation count (decisions C34); an arrival or a delivery is `COUNTED_ONLY` in `directory.ts`.
        q: 'What counts as a run?',
        a: 'Each time a scheduled pull, an automation or a script runs. Mail and webhooks arriving at your record, and the notices it sends you, are never counted.',
      },
      {
        // `ASK_CAP_DEFAULT` and `BACKGROUND_ASKS_MONTH` in `packages/slash/src/types.ts`; packs are `PACKS` in `plans.ts`.
        q: 'What is a Slash credit?',
        a: 'One question or one draft, however long Slash works on it. Each plan includes a month of credits, and a pack adds more when you need them. Slash’s own daily read never spends yours.',
      },
      {
        // `mayRun` in `directory.ts` holds the action and says so in its event; packs and extra usage are §33's, written for launch day.
        q: 'What happens when I reach the allowance?',
        a: 'Work that needs more waits for the next month, and the record tells you what is waiting. Add a credit pack for Slash, or turn on extra usage, with a cap you choose, for everything else.',
      },
      {
        // One Durable Object per record on the Worker; `HOSTED_PLANS` in `billing.ts` sells no free plan.
        q: 'Why is there no free plan?',
        a: 'Every record gets its own database, and that costs money to run. We would rather charge a fair price than have paying customers cover a free tier.',
      },
      {
        // The plan change and the portal are `billing.ts`; export is never withheld from a lapsed record (`settings/[area]/areas/Billing.svelte`).
        q: 'Can I change plan or cancel?',
        a: 'Whenever you like, from Settings. A change takes effect straight away, and a cancelled record can still be exported.',
      },
    ],
  },
} as const;
