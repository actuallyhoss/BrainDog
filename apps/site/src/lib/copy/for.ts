/**
 * The words of the five pages written for each kind of person, `/for/<who>` (`routes/for/`).
 *
 * ONE ENTRY PER EXAMPLE RECORD, by the example's id (`lib/examples/types.ts`). The page's address is
 * `cases.drawn.moreFor`, the link the footer and the other pages carry, so it is written once. What
 * each page draws is that example's own pages, and each row's drawing is one segment of one of them,
 * named here by page and index, so a figure on these pages is the figure the home page's window shows.
 *
 * `said` IS THE FIRST SENTENCE, IN THAT PERSON'S OWN WORDS: what they would say about their week before
 * they had heard of BrainDog. Everything after it says what the record does about it.
 */

/** Where a row's drawing comes from: segment `at` of the example's page `page`. */
export type Drawing = { page: string; at: number };

export type Person = {
  /** The footer's link to the page. */
  nav: string;
  /** The search result and the shared card. */
  title: string;
  description: string;
  /** The small line over the first sentence. */
  tag: string;
  said: string;
  sub: string;
  rows: readonly { head: string; said: string; draw: Drawing }[];
};

export const forPages = {
  person: {
    /* The name a screen reader hears on the link to the other page (2b): only the link is drawn. */
    others: 'Written for someone else',

    who: {
      personal: {
        nav: 'For personal records',
        title: 'For personal records · BrainDog',
        description:
          'Bills, budgets, subscriptions, splits, savings and net worth in one record. What arrives is filed ' +
          'for you, and nothing that moves money happens until you say yes.',
        tag: 'For personal records',
        said: 'What is due, what is left to spend, and am I still on track?',
        /* Inbox is docs/07 §4; Needs you (once Decide, `apps/web/src/routes/decide/`) is where every proposal waits. */
        sub:
          'Bills, budgets, subscriptions and savings in one record, with your net worth counted in. Import a bank ' +
          'statement and each line is filed. Anything that would move money waits for your yes.',
        rows: [
          {
            head: 'Bills file themselves',
            /* docs/07 §4: a shape seen three times is learned once, and files with no model after that. */
            said: 'Forward bills and payslips to your record. Once it knows their shape, each lands in the right list with its amount and due day.',
            draw: { page: 'inbox', at: 0 },
          },
          {
            head: 'Budgets that say where you stand',
            /* The budget form of `progress`, `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'Each budget shows what is spent and what is left, so an expensive week shows early.',
            draw: { page: 'home', at: 2 },
          },
          {
            head: 'Helpers ask before they act',
            /* `propose` in `packages/mcp/src/index.ts`; the change carries the agent's name in its history. */
            said: 'An agent that wants to move money between budgets asks you first, and its name stays on the change.',
            draw: { page: 'agents', at: 1 },
          },
        ],
      },

      student: {
        nav: 'For students',
        title: 'For students · BrainDog',
        description:
          'Deadlines, coursework, marks and reading in one record, with every module on one timeline and ' +
          'nothing handed in twice.',
        tag: 'For students',
        said: 'Three modules, a deadline most weeks, and I keep losing track.',
        /* Automations are `apps/web/src/routes/automations/` and their reminders docs/09; Slash is docs/11. */
        sub:
          'Deadlines, coursework and reading in one record. Automations remind you before things are due, and ' +
          'Slash answers from your own notes.',
        rows: [
          {
            head: 'Every deadline on one line',
            /* The `timeline` kind, `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'Deadlines from every module sit on one timeline, so this week and next are never a surprise.',
            draw: { page: 'home', at: 2 },
          },
          {
            head: 'Coursework you tick off',
            /* The `todo` kind, whose ticks are written back to the list (`packages/render/svelte/Block.svelte` `ontick`). */
            said: 'What is due and what is handed in, in one list you tick off as you go.',
            draw: { page: 'assignments', at: 0 },
          },
          {
            head: 'Marks and notices, filed',
            /* docs/07 §4, as on the personal page. */
            said: 'Forward lecture slides, feedback and library notices, and each one goes where it belongs.',
            draw: { page: 'inbox', at: 0 },
          },
        ],
      },

      founder: {
        nav: 'For founders',
        title: 'For founders · BrainDog',
        description:
          'For founders running several projects with AI agents: every agent starts caught up, one list holds what ' +
          'waits on you, and the money is in the same place.',
        tag: 'For founders',
        said: "Four projects, three agents, and I'm the only one who knows where everything stands.",
        /* Money's own rule `invoice-late` (`packages/seed/src/modules/money/rules.ts`) puts a late invoice to you;
           the floor in `packages/kernel/src/change-kind.ts` holds anything that moves money for a yes. */
        sub:
          'Each project\'s next step, decisions and money in one place your agents read first. Late invoices come to ' +
          'you to chase, and anything that moves money waits for your yes.',
        rows: [
          {
            head: 'Your agents, where you can see them',
            /* The app's Agents page: who is working now, and what each did (`apps/web/src/lib/record/PresencePanel.svelte`). */
            said: 'Which agent is on which project right now, and what each one did today.',
            draw: { page: 'agents', at: 0 },
          },
          {
            head: 'One list of what needs you',
            /* Needs you, `apps/web/src/routes/decide/`: an invoice put to you, or a change an agent asks to make. */
            said: 'An invoice twelve days late, a change an agent wants to make: each waits with what happens if you say yes.',
            draw: { page: 'needs', at: 0 },
          },
          {
            head: 'Money in and out, month by month',
            /* The net form of `series`, `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'What came in and what went out each month, with no spreadsheet to keep.',
            draw: { page: 'home', at: 2 },
          },
        ],
      },

      team: {
        nav: 'For teams and agencies',
        title: 'For teams and agencies · BrainDog',
        description:
          'Invite your team by email, each with a role. Their agents get the same access, and every change says who made it.',
        tag: 'For teams and agencies',
        said: "Five of us, a dozen clients, and everyone's agents working at once.",
        /* THE DOCS' WORDS (`docs/02-use/09-sharing.md`): a second person joins with their own sign-in, at a role or on the
           parts they are given; an agent sees what its person sees. Cloud Plus is not named while billing is off. */
        sub:
          'Give each client a project and invite your team by email. Their agents get their access and no more, and ' +
          'every change says who made it, person or agent. A client can get a read-only link to their project.',
        rows: [
          {
            head: "Who's working on what, agents included",
            /* The app's Agents page; an agent acts with its person's access (`docs/03-agents/04-scopes.md`). */
            said: 'Every person and every agent working now, and what each changed today.',
            draw: { page: 'agents', at: 0 },
          },
          {
            head: 'Every review finds a reviewer',
            /* An automation's trigger, condition and steps, `apps/web/src/routes/automations/`. */
            said: 'When a ticket moves to review, an automation asks whoever has the fewest reviews open.',
            draw: { page: 'automations', at: 0 },
          },
          {
            head: 'The board and the numbers together',
            /* `series` beside `board`, both `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'How many tickets closed each week, drawn from the same list the board is.',
            draw: { page: 'home', at: 2 },
          },
        ],
      },

      project: {
        nav: 'For new projects',
        title: 'For new projects · BrainDog',
        description:
          'Starting something with no template for it? Say what it is in a short chat, and BrainDog sets up ' +
          'the areas, the path and the budget.',
        tag: 'For new projects',
        said: 'I am starting something new, and there is no template for it.',
        /* First run, `apps/web/src/routes/start/`: Slash proposes the lists and pages, and you accept them. */
        sub:
          'Say what you are starting in a short chat. It sets up the areas, the path and the budget, and you change ' +
          'what you like after.',
        rows: [
          {
            head: 'A path, one step at a time',
            /* The path form of `steps`, `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'The steps from here to launch, with what is done and what comes next.',
            draw: { page: 'home', at: 3 },
          },
          {
            head: 'A second opinion under your note',
            /* An agent's reply on a card, the `cards` kind in `packages/render/src/kinds.ts`. */
            said: 'Write down what you plan and ask an agent to check it. Its answer sits under your note.',
            draw: { page: 'home', at: 4 },
          },
          {
            head: 'A budget with room in it',
            /* The range form of `progress`, `KINDS` in `packages/render/src/kinds.ts`. */
            said: 'Each cost is drawn against the range you expect, so nothing goes over without you seeing it.',
            draw: { page: 'home', at: 5 },
          },
        ],
      },
    } satisfies Record<'personal' | 'student' | 'founder' | 'team' | 'project', Person>,
  },
} as const;
