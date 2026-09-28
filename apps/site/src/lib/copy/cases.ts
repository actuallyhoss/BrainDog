/**
 * The drawn app on the home page, and the five kinds of person it is arranged for.
 *
 * Every name and figure here is read off `packages/seed`, the record the gates install, so a reader
 * who starts a record for one of these people meets the same rows the page drew.
 */
export const cases = {
  /**
   * THE DRAWN APP, which sits across the bottom edge of the hero because it is the product. Pressing a
   * case redraws the window, and pressing a list, a row, Decide or Automations inside it opens that
   * page of the drawn app.
   *
   * `id` is what the switcher tracks and what /start calls the setup. `holds` is the pages and the
   * lists that setup ships, each under the name the record itself gives it. `glyph` is a Lucide name
   * `lib/icons.ts` draws. `tiles` are what that record's home shows on its first day, read off the
   * rows the use case installs (`packages/seed/src/usecases/*.ts`), with the day arithmetic done the
   * way `install.ts` does it. None of them counts the product's own parts.
   */
  arrange: {
    tag: 'Yours',
    title: 'Arranged for you. Made of parts.',
    /* THE TWO STRINGS THE SWITCHER ITSELF SAYS, here rather than defaulted inside the component,
       because every word a stranger reads on this site is in this file and a default in a
       component is a word nobody edits. `head` is the line above the drawn rail, where the real
       application says Switch record; `label` is what a screen reader calls the switcher. */
    head: 'Your record',
    label: 'What your record is for',
    /* THE LINE UNDER THE WINDOW THAT SAYS IT CAN BE PRESSED. A drawing of an app looks like a
       picture of one, and a picture is not something anybody tries to click. */
    hint: 'Pick who it is for, then open a list, a row or a question.',
    /**
     * THE WORDS THE DRAWN APP ITSELF SAYS, each one the app's own for the same place.
     *
     * `decide`, `automations`, `accept` and `reject` are the rail entry, the page titles and the two
     * buttons `apps/web` draws (`lib/copy.ts`, and the Decide screen's Accept and Reject).
     * `noQuestions` is `copy.noQuestions` and `noRules` is `flow.none`, the two empty states;
     * `notRun` is `flow.neverRun`, which is true of every rule in a record made today; `inline` is
     * `flow.inline`, which is how every rule below runs; `starts` and `only` are `flow.trigger` and
     * `flow.condition`. `accepted` is the scene's own word further down this file.
     */
    app: {
      decide: 'Decide',
      automations: 'Automations',
      toDecide: (n: number) => `${n} to decide`,
      noQuestions: 'Nothing waits on you',
      noRules: 'Nothing runs on its own yet',
      notRun: 'Not run yet.',
      inline: 'Runs inside the change that starts it.',
      starts: 'Starts',
      only: 'Only when',
      then: 'Then',
      from: 'From',
      opened: 'opened just now',
      accept: 'Accept',
      reject: 'Reject',
      accepted: 'Accepted by you',
      rejected: 'Rejected by you',
      /* What a screen reader calls the drawn window and its rail, and the back link's first word. */
      window: 'A drawing of the app',
      rail: 'Pages and lists',
      back: 'Back to',
    },
    lead:
      'Say what your record is for. The pages, the lists and the words follow. Underneath, every ' +
      'part can be changed or turned off.',
    /**
     * WHO DRAFTS THE ARRANGEMENT, AND THAT NOTHING LANDS UNTIL THE OWNER SAYS SO.
     *
     * It said a model drafts it only once you configure one, and that no host configures one by
     * default, which went false on 24 September (`loop/DIRECTION.md` §24): production sets `SLASH_INCLUDED` to
     * `yes`, so the Cloud answers Slash with the included model without anybody configuring one
     * (`apps/worker/src/slash.ts`, `includedInference`). `src/lib/claims.test.ts` now fails if a
     * sentence here says there is no model while production includes one.
     *
     * The first sentence rests on `packages/record/src/slash.ts`, which drafts from what the owner
     * describes and writes nothing itself, and on `packages/record/src/arrange.ts`, whose question
     * changes nothing until the owner accepts it. It names no model, so it stays true on a host
     * with none, where Slash's rules draft instead.
     */
    note:
      'Slash drafts the arrangement from what you say, and nothing is written until you accept it. ' +
      'Any module can be turned off afterwards, People included.',
    cases: [
      {
        id: 'personal',
        /* `personal.ts:160` renames `obligations` to `Bills` for this setup, in a person's words, so
           a personal record never shows a page or a list called Money. */
        label: 'Personal',
        glyph: 'house',
        /* The two groceries rows in the seeded week (6,420 and 2,135 pence) against the 30,000 the
           groceries budget allows, the two `PUT_BY` rows toward Lisbon (20,000 and 22,000) against
           its 90,000 target, and the first of the habits, all in `personal.ts` `seeds`. THE LISBON
           TILE SAID `GBP 900.00, saving towards it`, which is the target drawn where the groceries
           tile beside it draws the amount so far: a reader of the pair takes 900 as saved, and the
           seed has put 420 by.
           THE GROCERIES FIGURE IS THE HOME FROM A MONTH'S THIRD DAY, NOT FROM ITS FIRST. The
           6,420 shop is dated two days back, so on the 1st and 2nd it falls in the month before and
           the Home counts only the 2,135 one. Measured by making the Personal record the way
           `packages/seed/test/usecase-install.test.ts` does, at noon UTC on 1, 2 and 3 October 2026,
           and reading "Spending against your budget": 2135 (1 row), 2135 (1 row), 8555 (2 rows).
           The seed's own test pins 3 September for the same reason. The other way to make the tile
           true every day is to move the Weekly shop to `0d` in `personal.ts`, which changes every
           new Personal record and that test's figures, and is more than a site sentence should move
           (`loop/research-bundle-reads.md` brief S2). */
        tiles: [
          { title: 'Groceries', value: 'GBP 85.55', note: 'of GBP 300.00 budgeted' },
          { title: 'Trip to Lisbon', value: 'GBP 420.00', note: 'of GBP 900.00 put by' },
          { title: 'Run three times a week', value: 'A habit', note: 'logged as you go' },
        ],
        /* HOME'S TABLE UNDER ITS TILES, as `home-personal` in `personal.ts` draws one: `Bills due this
           week`, which on a record made today is the three bills due inside seven days. `rows` are
           indexes into the list it names, so every row here is one Bills already opens. */
        soon: { heading: 'Bills due this week', list: 'Bills', rows: [0, 1, 2] },
        /**
         * THE LISTS THAT OPEN, THE QUESTION AND THE RULES. `personal.ts` seeds no example row since
         * 2.0.0 (MOD-17), so every row below is this drawing's own illustration and not read off the
         * seed: eight bills and three accounts, with the days counted the way a fresh record would
         * count them. A row's page draws its cells under the list's column names and then the fields
         * listed with it, each one a field the real list carries.
         *
         * THE QUESTION IS THE ONE LIBERTY, and it is the same one `decide` below names: a record
         * made today holds no question, and this is one an agent could put over MCP (`propose`),
         * about rows a person would really have. The Lisbon goal and the GBP 420.00 put by toward it
         * are this drawing's own, since Personal ships no goal either.
         *
         * THE RULES ARE THREE OF THE SEVEN THE SETUP INSTALLS, the three over lists this rail names,
         * with their names from `RULE_NAMES` and their conditions (`MONEY_RULES`, `PORTFOLIO_RULES`)
         * said in words. A rule's `suggest` is a question on Decide, which is what `then` says.
         */
        lists: [
          {
            name: 'Bills',
            columns: ['What', 'Amount', 'Due'],
            rows: [
              { cells: ['Streaming subscription', 'GBP 10.99', 'In 2 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Phone contract', 'GBP 18.00', 'In 3 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Rent', 'GBP 850.00', 'In 6 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Pay day', 'GBP 2,450.00', 'In 10 days'], fields: [['Repeats', 'Monthly'], ['Direction', 'Owed to you']] },
              { cells: ['Gym membership', 'GBP 32.00', 'In 12 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Energy bill', 'GBP 96.00', 'In 18 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Contents insurance', 'GBP 8.50', 'In 21 days'], fields: [['Repeats', 'Monthly']] },
              { cells: ['Council tax', 'GBP 142.00', 'In 25 days'], fields: [['Repeats', 'Monthly']] },
            ],
          },
          {
            name: 'Accounts',
            columns: ['Account', 'Balance', 'As of'],
            rows: [
              { cells: ['Current account', 'GBP 1,240.56', 'Today'], fields: [['Kind', 'Bank']] },
              { cells: ['Savings account', 'GBP 2,420.00', '2 days ago'], fields: [['Kind', 'Bank']] },
              { cells: ['Credit card', 'GBP -186.40', 'Yesterday'], fields: [['Kind', 'Card']] },
            ],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Put GBP 50.00 by toward the Trip to Lisbon?',
            change: 'A new row in Put by. GBP 420.00 of the GBP 900.00 is put by so far.',
          },
        ],
        rules: [
          {
            name: 'Keep balances current',
            starts: 'When a row in Accounts is added or changed',
            only: 'Its balance was last set more than a week ago',
            then: 'Notes it on the account, once for each account and date',
          },
          {
            name: 'Chase late payments',
            starts: 'When a row in Bills is added or changed',
            only: 'It is owed to you, still open, and more than a week past due',
            then: 'Asks you on Decide whether to chase it',
          },
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: [
          'Day to day',
          'Spending',
          'Goals',
          'Bills',
          'Accounts',
          'Budget',
          'Savings goals',
          'Log',
          'Put by',
          'Projects',
        ],
      },
      {
        id: 'student',
        label: 'Student',
        glyph: 'graduation-cap',
        tiles: [
          { title: 'Problem set 1: probability', value: 'Due in 3 days', note: 'Introduction to statistics' },
          { title: 'Study session tomorrow', value: '90 minutes', note: 'Conditional probability' },
        ],
        /* `home-student`'s `Study sessions` table: the one session, tomorrow, inside its eight days. */
        soon: { heading: 'Study sessions', list: 'Study sessions', rows: [0] },
        /* `student.ts` `seeds`: one course, one assignment, one study session, each list with its one
           row. The setup installs no module, so it has no rule, and Automations says so in the app's
           own words. The question is the liberty `decide` names, about the assignment that is there. */
        lists: [
          {
            name: 'Assignments',
            columns: ['Assignment', 'State', 'Due'],
            rows: [{ cells: ['Problem set 1: probability', 'Doing', 'In 3 days'], fields: [['Course', 'Introduction to statistics']] }],
          },
          {
            name: 'Courses',
            columns: ['Course', 'Term', 'Teacher'],
            rows: [{ cells: ['Introduction to statistics', 'Autumn', 'Dr Adeyemi'] }],
          },
          {
            name: 'Study sessions',
            columns: ['Session', 'On', 'Minutes'],
            rows: [{ cells: ['Go over the lecture on conditional probability', 'Tomorrow', '90'], fields: [['Done', 'Not yet']] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a study session for Problem set 1?',
            change: 'Sixty minutes on the problem set, the day before it is due.',
          },
        ],
        rules: [],
        holds: ['Today', 'Studies', 'Courses', 'Assignments', 'Study sessions'],
      },
      {
        id: 'founder',
        label: 'Solo founder',
        glyph: 'wallet',
        /* `FOUNDER_EXAMPLES` in `founder.ts`: the current account at 2,480,000 pence, the hosting bill
           at 32,000 due `+9d`, and the one datapoint the setup seeds, reported `-1d`. */
        tiles: [
          { title: 'Northwind current account', value: 'GBP 24,800.00' },
          { title: 'Monthly recurring revenue', value: 'GBP 4,200', note: 'reported yesterday' },
          { title: 'Cloud hosting', value: 'GBP 320.00', note: 'due in 9 days' },
        ],
        /* `home-founder`'s `Due this week` table (MOD-18): `Latest numbers` moved to Dashboard, so Home's
           own soon table is the money due, the same shape Personal's is. */
        soon: { heading: 'Due this week', list: 'Money', rows: [0] },
        /* `FOUNDER_EXAMPLES` and the pack's `seeds`, one row a list, as the setup gives them. The
           question is the liberty `decide` names, about the hosting bill that is there; the rules are
           three of the seven the setup installs, as Personal's are. */
        lists: [
          {
            name: 'Money',
            columns: ['What', 'Amount', 'Due'],
            rows: [{ cells: ['Cloud hosting, Northwind app', 'GBP 320.00', 'In 9 days'], fields: [['Repeats', 'Monthly']] }],
          },
          {
            name: 'Numbers',
            columns: ['Measure', 'Value', 'At'],
            rows: [{ cells: ['Monthly recurring revenue', 'GBP 4,200', 'Yesterday'], fields: [['Source', 'Example']] }],
          },
          {
            name: 'Organisations',
            columns: ['Name', 'Kind', 'Country'],
            rows: [{ cells: ['Northwind Labs Ltd', 'Company', 'United Kingdom'], fields: [['Currency', 'GBP']] }],
          },
          {
            name: 'Tasks',
            columns: ['Task', 'State', 'By'],
            rows: [{ cells: ['Write the pricing page copy', 'Open', 'In 4 days'] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a task to check the hosting bill before it is paid?',
            change: 'Cloud hosting, Northwind app, GBP 320.00, due in 9 days.',
          },
        ],
        rules: [
          {
            name: 'Chase late payments',
            starts: 'When a row in Money is added or changed',
            only: 'It is owed to you, still open, and more than a week past due',
            then: 'Asks you on Decide whether to chase it',
          },
          {
            name: 'Keep balances current',
            starts: 'When a row in Accounts is added or changed',
            only: 'Its balance was last set more than a week ago',
            then: 'Notes it on the account, once for each account and date',
          },
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: ['Overview', 'Dashboard', 'Organisations', 'Numbers', 'Money', 'Projects', 'People', 'Tasks'],
      },
      {
        id: 'team',
        /* `holds` names what a reader sees on a page or a list: `packages/seed/src/modules/work.ts:426`
           and `:538` title the two pages Overview and Board. */
        label: 'Team',
        glyph: 'users',
        /* `team.ts` `seeds`: one active cycle, and four planned tickets at 2, 1, 3 and 5 points. */
        tiles: [
          { title: 'Cycle 1', value: 'Active', note: 'Ship the first version of the board' },
          { title: 'Cycle plan', value: '11 points', note: 'across four tickets' },
        ],
        /* `home-team`'s `Due this week`, which leaves out what is doing, in review or blocked: of the six
           tickets that is only the one about the next cycle, due in three days. */
        soon: { heading: 'Due this week', list: 'Tickets', rows: [1] },
        /* `TEAM_EXAMPLES` for the six tickets, with each one's state, priority and agent, and the
           pack's `seeds` for the four planned ones. Claude is the agent the seed names on three of
           them, so the question is Claude's too, about the ticket the seed leaves in review. Portfolio
           brings `project-past-aim`, the one rule this setup carries. */
        lists: [
          {
            name: 'Tickets',
            columns: ['Ticket', 'State', 'Priority'],
            rows: [
              { cells: ['Write the release notes', 'In progress', 'Normal'], fields: [['Agent', 'Claude']] },
              { cells: ['Agree what goes in the next cycle', 'To do', 'High'], fields: [['By', 'In 3 days']] },
              { cells: ['Fix the sign-in link that expires too soon', 'In review', 'Urgent'], fields: [['Agent', 'Claude']] },
              { cells: ['Wait on the design for the settings screen', 'Blocked', 'Normal'], fields: [['By', 'In 5 days']] },
              { cells: ['Tidy the backlog labels', 'Done', 'Low'], fields: [['Agent', 'Claude']] },
              { cells: ['Let a teammate export the board as a spreadsheet', 'Backlog', 'Low'] },
            ],
          },
          {
            name: 'Cycle plan',
            columns: ['Ticket', 'Points'],
            rows: [
              { cells: ['Write the release notes', '2'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Agree what goes in the next cycle', '1'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Fix the sign-in link that expires too soon', '3'], fields: [['Cycle', 'Cycle 1']] },
              { cells: ['Wait on the design for the settings screen', '5'], fields: [['Cycle', 'Cycle 1']] },
            ],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Move “Fix the sign-in link that expires too soon” to Done?',
            change: 'The fix is written, and it is waiting in review.',
          },
        ],
        rules: [
          {
            name: 'Ask about a missed day',
            starts: 'When a row in Projects is added or changed',
            only: 'It is still in play and the day it aimed for has passed',
            then: 'Asks you on Decide to move the day or park it',
          },
        ],
        holds: ['Team', 'Cycles', 'Agent work', 'Board', 'Tickets', 'Cycle plan', 'Teammates'],
      },
      {
        id: 'guide',
        label: 'New project',
        glyph: 'rocket',
        tiles: [
          { title: 'Say what it is and who it is for', value: 'Underway', note: 'the first milestone' },
          { title: 'What will it be called?', value: 'Open', note: 'a choice to make' },
          { title: 'Next step', value: 'In 2 days', note: 'Write one sentence about what this is' },
        ],
        /* `home-guide`'s `Your next steps`, the three steps in order. */
        soon: { heading: 'Your next steps', list: 'Steps', rows: [0, 1, 2] },
        /* `guide.ts` `seeds`: the six milestones in order with their stage and state, the three
           steps and the one choice. No module, so no rule. The question is the liberty `decide`
           names, about the choice that is open. */
        lists: [
          {
            name: 'Milestones',
            columns: ['Milestone', 'Stage', 'State'],
            rows: [
              { cells: ['Say what it is and who it is for', 'Idea', 'Underway'] },
              { cells: ['Find the people who want it', 'Idea', 'Not started'] },
              { cells: ['Plan the smallest first version', 'Plan', 'Not started'] },
              { cells: ['Make the first version', 'Build', 'Not started'] },
              { cells: ['Share it with the first people', 'Launch', 'Not started'] },
              { cells: ['Keep it going and learn from it', 'Grow', 'Not started'] },
            ],
          },
          {
            name: 'Steps',
            columns: ['Step', 'State', 'By'],
            rows: [
              { cells: ['Write one sentence about what this is and who it is for', 'To do', 'In 2 days'] },
              { cells: ['Name three people who would use it', 'To do', 'In 5 days'] },
              { cells: ['Ask one of them what they would want first', 'To do', 'In 9 days'] },
            ],
          },
          {
            name: 'Choices',
            columns: ['Question', 'State'],
            rows: [{ cells: ['What will it be called?', 'To make'] }],
          },
        ],
        questions: [
          {
            from: 'Claude',
            question: 'Add a step to write down five names?',
            change: 'For the open choice, “What will it be called?”, by the end of the week.',
          },
        ],
        rules: [],
        holds: ['Your project', 'Guide', 'Milestones', 'Steps', 'Choices', 'Resources'],
      },
    ],
  },
} as const;
