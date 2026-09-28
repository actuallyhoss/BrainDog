/**
 * The pricing page and the Slash page. What a plan includes is the reader's question on `/pricing`,
 * and those figures live in `plans.ts`, not here.
 */
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

  pricing: {
    title: 'Pricing',
    sub: 'You pay per record, by the month. Invite as many people as you like, it costs the same.',
    included: 'Included each month',
    popular: 'Most popular',
    usageTitle: 'Compare plans',
    usageLead: 'Allowances reset on the first of each month. People, pages, lists and history are never counted.',
    rows: [
      ['People', 'Unlimited', 'Unlimited'],
      ['Database', 'Your own, not shared', 'Your own, not shared'],
      ['Backups', 'Nightly, last 30 kept', 'Nightly, last 30 kept'],
      ['Email and webhook inbox', 'Included', 'Included'],
      ['Export', 'Any time, as one file', 'Any time, as one file'],
    ] as [string, string, string][],
    extraTitle: 'Need more?',
    packsTitle: 'Slash credit packs',
    packsLead: 'Used after your monthly credits run out. They never expire.',
    packsPer: (credits: number) => `${credits.toLocaleString('en-US')} credits`,
    extraUsageTitle: 'Extra usage',
    extraLead:
      'Off by default. Turn it on and set a monthly cap, and you are never charged past it. With it off, ' +
      'anything over your plan waits until next month.',
    faqTitle: 'Questions',
    faq: [
      {
        q: 'What is a record?',
        a: 'Everything one person, family or company keeps track of: its lists, pages, rules and history, in one file. Most people need one. A second business is a second record.',
      },
      {
        q: 'Are colleagues really free?',
        a: 'Yes. Invite as many people as you need, with any level of access. The price is per record, not per person.',
      },
      {
        q: 'What is a Slash credit?',
        a: 'One question or one draft, however long Slash works on it. Each plan includes a month of credits, and a pack adds more when you need them. Slash’s own daily read never spends yours.',
      },
      {
        q: 'What happens when I reach the allowance?',
        a: 'Work that needs more waits for the next month, and the record tells you what is waiting. Add a credit pack for Slash, or turn on extra usage, with a cap you choose, for everything else.',
      },
      {
        q: 'Why is there no free plan?',
        a: 'Every record gets its own database, and that costs money to run. We would rather charge a fair price than have paying customers cover a free tier.',
      },
      {
        q: 'Can I change plan or cancel?',
        a: 'Whenever you like, from Settings. A change takes effect straight away, and a cancelled record can still be exported.',
      },
    ],
  },
} as const;
