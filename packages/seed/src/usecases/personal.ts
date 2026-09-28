/**
 * Personal: one person's life admin. Their money, the bills coming up, what they are saving for, the projects they do
 * for the love of it, and the goals and habits they keep (`loop/DIRECTION.md` §11, the owner's first use case).
 *
 * IT BUILDS ON MONEY, NOT BESIDE IT. Money's accounts and bills are the same lists a business keeps, spoken in a
 * person's words through labels ("Bills", not "Money"). Money needs Projects and People, so those come too, and
 * Projects is where a passion project lives, its states relabelled Active, Ongoing, On hold and Finished. The people in
 * a life are People's list with Personal's own roles laid on it (`extends` below): family, friend, landlord,
 * tradesperson and adviser.
 *
 * THE STUDIO'S ROLES ARE STILL ON THE LIST, IN A HOUSEHOLD'S WORDS. People's picker offers client, contractor,
 * accountant and collaborator first, because `extends` lays values after a list's own, and Personal reads them as Work
 * contact, Hired help, Tax and accounts and Project partner (`labels` below). There was a fifth, `registrar` read as
 * Agency, until People 2.0.0 stopped offering it and Personal 1.7.0 dropped its label. Relabelled and not
 * hidden, by the owner's call: a hidden value leaves a row that holds one with a word the form no longer offers. The
 * form reads the label since 1.6.0 (`RowForm.svelte`, `valueSaid`); before, it drew every value raw, and a household
 * was offered Client and Registrar (`personal-words.test.ts`).
 *
 * WHAT A PERSON SPENDS IS MONEY'S LEDGER, SINCE 2.0.0. Personal kept its own `spending` and `budgets` lists beside
 * Money's, so a purchase an import or a bank message wrote into the ledger never reached the budget, and a person's
 * month was two lists that disagreed. Money's `transactions` hold what moved and its `categories` hold the most a month
 * on each (`budget`), so Budget left reads `spent-by-category-month` against those rows (`loop/finish/modules.md`
 * MOD-17). What Money does not hold stays this pack's: savings goals, goals and habits, and the steps of a project.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE, AND NO SUM IS IN A CURRENCY (`loop/finish/modules.md` C11, §6.7). A Personal record
 * used to arrive holding a stranger's month, every row in pounds. It now holds only what the person said: a pay day is a `recurring` row formed
 * from a sentence that names pay, in the currency the sentence names (`payDayRow`).
 */

/** Money's lists that hold a day something falls due, as the `deadlines` source names them (`list is ...`). */
const MONEY_DUE = 'list is obligations or recurring or installments';

/**
 * THE BLOCKS HOME AND THE GOALS PAGE SHARE: how far each savings goal, habit and goal has come.
 *
 * NOTHING IS TYPED AS "SO FAR". A saving is a row on Put by and a run is a row on the Log, each pointing at what it counts
 * toward, and a track is set against what was logged (`toward:`). A habit counts only this week's rows, from Monday, so
 * it starts again every week without anybody resetting it; a goal counts every row.
 */
const savingsProgress = (span: number) => ({
  kind: 'progress',
  heading: 'Savings goals',
  span,
  source: 'register.savings_goals',
  where: 'state is not paused',
  columns: [{ field: 'name' }, { field: 'target' }, { field: 'by' }],
  toward: 'put-by-by-goal',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 6,
  empty: 'No savings goal yet. Add one and how close you are shows here.',
});

const habitsProgress = (span: number) => ({
  kind: 'progress',
  heading: 'Habits this week',
  span,
  source: 'register.goals',
  where: 'state is active, kind is habit',
  columns: [{ field: 'what' }, { field: 'target' }, { field: 'unit' }],
  toward: 'logged-this-week-by-goal',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 8,
  empty: 'No habits yet. Add one, like running three times a week, and log each time.',
});

const goalsProgress = (span: number) => ({
  kind: 'progress',
  heading: 'Goals',
  span,
  source: 'register.goals',
  where: 'state is active, kind is goal',
  columns: [{ field: 'what' }, { field: 'target' }, { field: 'unit' }],
  toward: 'logged-by-goal',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 8,
  empty: 'No goals yet. Add one, like running a hundred kilometres, and log each step toward it.',
});

/**
 * WHAT IS LEFT OF EACH MONTH'S BUDGET: Money's categories that money goes out on and that hold a most a month, each set
 * against what the ledger spent on it since the first of the month. The figure is grouped by the category a
 * transaction points at, so a row and its reading are matched by the row itself and never by a word.
 */
const budgetProgress = (heading: string) => ({
  kind: 'progress',
  heading,
  span: 12,
  source: 'register.categories',
  where: 'state is live, direction is out, budget is set',
  columns: [{ field: 'name' }, { field: 'budget' }],
  spent: 'spent-by-category-month',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 10,
  empty: 'No budget yet. Give a category the most you mean to spend on it in a month, and what is left shows here.',
});

export const PERSONAL = {
  usecase: 'personal',
  /* 1.3.0: the Projects page went, so the rail has one Projects Overview, and its next steps are on Home.
     1.5.0: Personal lays its own roles on People through `extends`, and the relabels of the studio's roles went.
     1.6.0: the studio's roles are relabelled in a household's words that are not its own five.
     1.7.0: the `registrar` label went, because People 2.0.0 no longer offers the value it read.
     1.7.1: Home's empty title loses its full stop, as every other title already has; a record is offered the words
     only when the version goes up.
     2.0.0: the `spending` and `budgets` lists and the Spending page went, since Money's ledger and categories carry
     them; every money figure is in the record's own currency; Home is rebuilt over Money (`loop/finish/modules.md`
     MOD-17). Major, because two lists and a page go. No record holds Personal to lose their rows (modules.md O6). */
  version: '2.0.0',
  title: 'Personal',
  summary: 'Your money and bills, what you are saving for, and the projects and goals you care about.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'warm and plain',
  signals: [
    'personal', 'my life', 'life admin', 'my money', 'money', 'personal finance', 'finances', 'budget', 'budgets',
    'budgeting', 'spending', 'savings', 'saving up', 'save up', 'savings goal', 'bills', 'rent', 'payday', 'pay day',
    'debt', 'household', 'groceries', 'under control', 'side project', 'side projects', 'passion project', 'passion projects',
    'hobby', 'hobbies', 'habit', 'habits', 'goals', 'my goals', 'running', 'gym', 'fitness', 'marathon', 'training for',
    'diet', 'reading more', 'family',
  ],
  modules: ['portfolio', 'people', 'money-core'],
  voice: {
    home: 'Day to day',
    right_now: 'This month',
    needs_you: 'Worth a look',
    nothing_needs_you: 'Nothing needs you right now',
    since_away: 'Since you last looked',
    lists: 'My lists',
  },
  /* A PERSON'S WORDS OVER MONEY, PROJECTS AND PEOPLE, and over this pack's own lists so a shared copy can rename them.
     A bill's category is one of Money's closed values, so each value a person's bills fall in is given a person's word:
     rent and energy are Home, a phone and streaming are Subscriptions, the gym is Health, pay is Pay. Those keys are
     longer than a setting name, and are kept by their hash (`labelSetting`).

     THE CATEGORIES STAY RELABELS FOR NOW, AND ON PURPOSE. `obligations.category`'s studio values become a `ref` to a
     categories list in a later move, which moves the rows with it. Laying Home, Food and Transport on the enum now,
     as `extends` does for People's roles, would only give that move more values to map.

     PEOPLE'S ROLES ARE NOT RELABELLED ANY MORE. Personal read `client` as Family, `contractor` as Tradesperson,
     `accountant` as Adviser, `registrar` as Landlord and `collaborator` as Friend, so the screen said Family and the list
     had no such value: an agent told "family" was refused `ENUM_VALUE_UNKNOWN` (`personal-words.test.ts`). The five words
     are values of the list now (`extends`), and those relabels went rather than stayed, because kept they would show
     each word twice, once under its own value and once over a studio's. 1.6.0 relabels the studio's five again, to
     words that are none of Personal's own, so each word is offered once (the header). The case for keeping them is a Personal record
     made before 1.5.0 reading as it did, and there is no such record to protect: production has none
     (`loop/STATUS.md`: `/auth/methods` says `firstRun: true`), and the owner's own record comes from the import, which
     proposes a founder's setup and not Personal (`loop/research-shell-next.md` Brief V). So no migration moves a
     `client` row to `family`: there are no rows it would move. */
  labels: {
    obligations: 'Bills',
    'obligations:one': 'bill',
    'obligations:holds': 'your bills, subscriptions and pay days, each with a date and how often it comes round',
    'obligations.category.premises': 'Home',
    'obligations.category.contractors': 'Transport',
    'obligations.category.production': 'Food',
    'obligations.category.software': 'Subscriptions',
    'obligations.category.professional': 'Health',
    'obligations.category.events': 'Fun',
    'obligations.category.client_work': 'Pay',
    'obligations.category.licensing': 'Other income',
    things: 'Projects',
    'things:one': 'project',
    'things:holds': 'the things you make and do for the love of it, and how each one is going',
    'things.lane.building': 'Active',
    'things.lane.earning': 'Ongoing',
    'things.lane.parked': 'On hold',
    'things.lane.retired': 'Finished',
    'things.revenue': 'Money made',
    'people:holds': 'the people in your life worth keeping track of: family, friends, a landlord, a plumber',
    /* THE STUDIO'S ROLES IN A HOUSEHOLD'S WORDS, and none of them one of the five Personal lays, so no word is offered
       twice. Relabelled and not hidden, by the owner's call: a hidden value leaves a row that holds one reading a word
       the form no longer offers.
       NO `registrar` LABEL SINCE 1.7.0, AND THERE WAS ONE reading it Agency: People 2.0.0 no longer offers the value
       (`test/lists-opened.test.ts`), so the label named a value Personal does not install and S8 in
       `test/usecases.test.ts` went red on exactly this line. A PERSONAL RECORD CAN HOLD ONE: the picker offered the
       value raw as Registrar before 1.6.0 and as Agency in 1.6.0. Such a record keeps the value on its list and the row
       keeps its word, because the plan lays back a value a row holds, but from 1.7.0 that row reads the raw word. */
    'people.role.client': 'Work contact',
    'people.role.contractor': 'Hired help',
    'people.role.accountant': 'Tax and accounts',
    'people.role.collaborator': 'Project partner',
    savings_goals: 'Savings goals',
    goals: 'Goals',
    goal_log: 'Log',
    put_by: 'Put by',
    project_steps: 'Project steps',
  },
  /* NO SPENDING SORTER SINCE 2.0.0: a purchase is a row of Money's ledger, and Money files it by its categories' own
     `match` (`txn-categorise`), so a second sorter would only argue with it. */
  skills: [
    { name: 'bill-reminder', trigger: 'the day before a bill is due, to say what is going out and from which account' },
  ],
  pack: {
    pack: 'usecase-personal',
    requires: { format: 1, primitives: 1, packs: {} },
    /* THE PEOPLE IN A LIFE, AS VALUES OF PEOPLE'S OWN LIST, after the studio's, so a client a person also has still reads
       as the record's word for it. After is not a choice: `extends` has no other place to put them, so a household's
       picker reads the studio's five first, in the household's words (`labels`). They stay the record's own if Personal
       is ever taken out, because rows hold them. */
    extends: { 'register.people': { values: { role: ['family', 'friend', 'landlord', 'tradesperson', 'adviser'] } } },
    declarations: [
      {
        register: 'savings_goals',
        name: 'Savings goals',
        one: 'savings goal',
        icon: 'star',
        holds: 'what you are saving for, how much it takes and how much is put by',
        title: 'name',
        mobile: ['name', 'target', 'by'],
        state: 'state',
        done: ['reached'],
        fields: [
          { id: 'name', label: 'Saving for', type: 'text', required: true, search: true },
          { id: 'target', label: 'Target', type: 'money', required: true },
          /* KEPT FOR A RECORD MADE BEFORE PUT BY, and read by nothing: what is saved is the rows put by toward the goal. */
          { id: 'saved', label: 'Saved before logging', type: 'money' },
          { id: 'by', label: 'By', type: 'day', index: true },
          { id: 'account', label: 'Kept in', type: 'ref', to: 'accounts', index: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['saving', 'paused', 'reached'],
            labels: { saving: 'Saving', paused: 'Paused', reached: 'Reached' },
            default: 'saving',
            required: true,
            index: true,
          },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'goals',
        name: 'Goals',
        one: 'goal',
        icon: 'check',
        holds: 'the goals and habits you keep, what you aim for and how far you have got',
        title: 'what',
        mobile: ['what', 'kind', 'target'],
        state: 'state',
        done: ['done'],
        fields: [
          { id: 'what', label: 'Goal', type: 'text', required: true, search: true },
          {
            id: 'kind',
            label: 'Kind',
            type: 'enum',
            values: ['habit', 'goal'],
            labels: { habit: 'Habit', goal: 'Goal' },
            default: 'goal',
            index: true,
          },
          /* KEPT FOR A RECORD MADE BEFORE THE LOG, and read by nothing: how far a goal has come is the rows logged toward it. */
          { id: 'done', label: 'Done before logging', type: 'decimal' },
          { id: 'target', label: 'Aim', type: 'decimal', required: true },
          { id: 'unit', label: 'Counted in', type: 'text' },
          { id: 'by', label: 'By', type: 'day', index: true },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['active', 'paused', 'done'],
            labels: { active: 'Active', paused: 'Paused', done: 'Done' },
            default: 'active',
            required: true,
            index: true,
          },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* A RUN, A BOOK FINISHED, A NIGHT COOKED IN: one row each, pointing at the habit or goal it counts toward. */
        register: 'goal_log',
        name: 'Log',
        one: 'log entry',
        icon: 'check',
        holds: 'each run, book or night in that counts toward a habit or a goal, and how much',
        title: 'what',
        mobile: ['what', 'goal', 'on'],
        fields: [
          { id: 'what', label: 'What', type: 'text', required: true, search: true },
          { id: 'goal', label: 'Counts toward', type: 'ref', to: 'goals', index: true },
          { id: 'amount', label: 'How much', type: 'decimal', required: true, default: 1 },
          { id: 'on', label: 'Day', type: 'day', required: true, index: true },
          { id: 'note', label: 'Notes', type: 'text' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* MONEY PUT BY TOWARD A SAVINGS GOAL, one row a transfer. */
        register: 'put_by',
        name: 'Put by',
        one: 'saving',
        icon: 'money',
        holds: 'each amount put by toward a savings goal, and when',
        title: 'what',
        mobile: ['what', 'amount', 'on'],
        fields: [
          { id: 'what', label: 'What', type: 'text', required: true, search: true },
          { id: 'saving', label: 'Toward', type: 'ref', to: 'savings_goals', index: true },
          { id: 'amount', label: 'Amount', type: 'money', required: true },
          { id: 'on', label: 'Day', type: 'day', required: true, index: true },
          { id: 'note', label: 'Notes', type: 'text' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'project_steps',
        name: 'Project steps',
        one: 'project step',
        icon: 'task',
        holds: 'the steps each project takes, and which are done',
        title: 'what',
        /* HOW FAR ALONG A PROJECT IS, when nobody typed it: the share of its steps done, drawn on Projects' rings. */
        steps: { of: 'thing', done: 'done' },
        mobile: ['what', 'thing', 'done'],
        fields: [
          { id: 'what', label: 'Step', type: 'text', required: true, search: true },
          { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
          { id: 'done', label: 'Done', type: 'bool', default: false, index: true },
          { id: 'by', label: 'By', type: 'day', index: true },
          { id: 'note', label: 'Notes', type: 'text' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        /* WHAT WAS LOGGED TOWARD EACH HABIT THIS WEEK, from Monday, so a habit starts again every week. */
        metric: 'logged-this-week-by-goal',
        name: 'Logged this week, by goal',
        source: 'register.goal_log',
        where: { field: 'on', gte: 'bow' },
        value: { sum: 'amount' },
        group_by: 'goal',
        format: 'decimal',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'logged-by-goal',
        name: 'Logged, by goal',
        source: 'register.goal_log',
        value: { sum: 'amount' },
        group_by: 'goal',
        format: 'decimal',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'put-by-by-goal',
        name: 'Put by, by savings goal',
        source: 'register.put_by',
        value: { sum: 'amount' },
        group_by: 'saving',
        /* IN THE RECORD'S OWN CURRENCY, never a literal one (`loop/finish/modules.md` C1). */
        format: 'money',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'saved-toward-goals',
        name: 'Saved toward goals',
        source: 'register.put_by',
        value: { sum: 'amount' },
        format: 'money',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        /* HOME, AS THIS USE CASE ANSWERS IT (`loop/finish/modules.md` MOD-17): what I have, the bills falling due this
           week, what is left of the budget, my projects with the next step on each, and my goals, then the house Home's
           own three (what needs you, what is coming up, and what changed), so a person's Home loses nothing the house
           one says. No `nav`, because Home is on the rail already. Every block is a whole row, so at 390 the page stacks
           in this order and nothing is placed beside anything. */
        page: 'home-personal',
        title: 'Day to day',
        icon: 'home',
        requires: ['register.accounts', 'register.categories', 'register.things', 'register.project_steps', 'register.goals', 'register.goal_log'],
        blocks: [
          {
            /* MONEY'S OWN FIGURES, READ IN A PERSON'S WORDS. Cash now is every liquid account rolled forward to today
               (money-core `cash-now`), so it says what is there and not what was typed on the day an account was added. */
            kind: 'stat',
            heading: 'What I have',
            span: 12,
            cells: [
              { metric: 'cash-now', label: 'In my accounts', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' },
              { metric: 'arriving-30d', label: 'Coming in, 30 days' },
              { metric: 'leaving-30d', label: 'Going out, 30 days' },
            ],
          },
          {
            /* EVERY MONEY LIST'S DUE DAYS AT ONCE: a bill, a pay day or a subscription that comes round, and a part of
               something paid in parts. The record reads the days each list declares `deadline: true`, overdue first. */
            kind: 'timeline',
            heading: 'Bills this week',
            span: 12,
            source: 'deadlines',
            horizon: 7,
            where: MONEY_DUE,
            columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
            limit: 8,
            empty: 'Nothing is due this week.',
          },
          budgetProgress('Budget left'),
          {
            /* ONE CARD A PROJECT THAT IS MOVING, WITH ITS NEXT STEP: the first step under it that is not done, which the
               record reads from Project steps (`steps:` on that list, `nextsOf` in the kernel). */
            kind: 'cards',
            heading: 'My projects',
            span: 12,
            source: 'register.things',
            where: 'lane is building or earning',
            columns: [
              { field: 'name', as: 'title' },
              { field: 'lane', label: 'Status', as: 'fact' },
              { field: 'what', label: 'Next', as: 'next' },
            ],
            order: [{ field: 'seq', dir: 'asc' }],
            limit: 6,
            empty: 'No projects on the go. Add one you make or do for the love of it, and its next step shows here.',
          },
          goalsProgress(12),
          habitsProgress(12),
          {
            /* THE HOUSE HOME'S THREE, as `defaultHome` in the web draws them, so a person's own Home still answers what
               needs them, what falls due in a fortnight and what changed since they last looked. */
            kind: 'queue',
            heading: '{{config:voice_needs_you}}',
            span: 12,
            source: 'governance.open',
            limit: 5,
            empty: '{{config:voice_nothing_needs_you}}',
          },
          {
            kind: 'timeline',
            heading: 'Coming up',
            span: 12,
            source: 'deadlines',
            horizon: 14,
            columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
            limit: 12,
            empty: 'Nothing falls due in the next two weeks.',
          },
          {
            kind: 'feed',
            heading: '{{config:voice_since_away}}',
            span: 12,
            source: 'activity',
            since: 'seen',
            first: 8,
            empty: 'Nothing new since you last looked.',
          },
        ],
      },
      {
        page: 'goals',
        title: 'Goals',
        nav: { section: 'Goals', order: 10 },
        icon: 'star',
        requires: ['register.savings_goals', 'register.goals', 'register.goal_log', 'register.put_by'],
        blocks: [
          savingsProgress(12),
          habitsProgress(6),
          goalsProgress(6),
          {
            kind: 'table',
            heading: 'Logged lately',
            span: 12,
            source: 'register.goal_log',
            columns: [
              { field: 'what', label: 'What', width: 'minmax(14ch,1fr)' },
              { field: 'goal', label: 'Toward', width: 'minmax(12ch,1fr)' },
              { field: 'amount', label: 'How much', width: '9ch', align: 'end' },
              { field: 'on', label: 'Day', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'desc' }],
            limit: 8,
            empty: 'Nothing logged yet. Add a run or a book finished and it counts toward its goal.',
          },
          {
            kind: 'table',
            heading: 'Put by lately',
            span: 12,
            source: 'register.put_by',
            columns: [
              { field: 'what', label: 'What', width: 'minmax(14ch,1fr)' },
              { field: 'saving', label: 'Toward', width: 'minmax(12ch,1fr)' },
              { field: 'amount', label: 'Amount', width: '12ch', align: 'end' },
              { field: 'on', label: 'Day', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'desc' }],
            limit: 8,
            empty: 'Nothing put by yet. Add what you set aside and it counts toward its goal.',
          },
          {
            kind: 'table',
            heading: 'Every goal',
            span: 12,
            source: 'register.goals',
            columns: [
              { field: 'what', label: 'Goal', width: 'minmax(18ch,1fr)' },
              { field: 'kind', label: 'Kind', width: '9ch' },
              { field: 'state', label: 'Status', width: '10ch' },
              { field: 'by', label: 'By', width: '13ch', align: 'end' },
            ],
            limit: 20,
            empty: 'No goals yet.',
          },
        ],
      },
      {
        /* ONE PAGE A PROJECT THAT IS MOVING, from the same declaration. Not called `project`, which a founder's pack
           and the sample's template use, so a person who later adds either does not meet two pages at one address. */
        page: 'my-project',
        title: '{{name}}',
        for: { register: 'things', where: 'lane is building or earning' },
        nav: { section: 'Projects', order: 20 },
        icon: 'thing',
        requires: ['register.things', 'register.project_steps'],
        blocks: [
          {
            kind: 'progress',
            heading: 'Progress',
            span: 12,
            source: 'register.project_steps',
            where: 'thing is {{name}}',
            columns: [{ field: 'thing' }, { field: 'done' }],
            empty: '{{name}} has no steps yet. Add the first and its progress shows here.',
          },
          {
            kind: 'todo',
            heading: 'Still to do',
            span: 12,
            source: 'register.project_steps',
            where: 'thing is {{name}}, done is false',
            columns: [{ field: 'what' }, { field: 'by' }],
            order: [{ field: 'by', dir: 'asc' }],
            limit: 12,
            empty: 'Nothing left to do on {{name}}.',
          },
          {
            kind: 'table',
            heading: 'Done',
            span: 12,
            source: 'register.project_steps',
            where: 'thing is {{name}}, done is true',
            columns: [{ field: 'what', label: 'Step', width: 'minmax(16ch,1fr)' }],
            limit: 12,
            empty: 'Nothing done yet.',
          },
        ],
      },
    ],
    /* NO `seeds` SINCE 2.0.0 (`loop/finish/modules.md` C11): every one was an example, in pounds, that a person then had
       to find and clear. */
  },
};

/**
 * WHAT A RECORD MADE BEFORE THE LOG HAD TYPED, CARRIED INTO IT. Personal 1.0.0 kept a goal's "so far" and a savings goal's
 * "saved" as numbers typed on the goal; from 1.2.0 progress is only what is logged toward it, so those numbers read as
 * nothing. Updating from before 1.2.0 writes each one as a single row toward its goal, dated the day of the update, and
 * empties the typed number so it is never counted twice (`links.ts` `carryForward`).
 */
export const PERSONAL_CARRIED = {
  before: '1.2.0',
  moves: [
    { from: 'goals', field: 'done', to: 'goal_log', link: 'goal', amount: 'amount', what: 'So far, before the log' },
    { from: 'savings_goals', field: 'saved', to: 'put_by', link: 'saving', amount: 'amount', what: 'Saved before the log' },
  ],
} as const;

/**
 * WHAT GOOD LOOKS LIKE ON MONEY'S FIGURES FOR ONE PERSON, in place of a studio's, and only where the bound is in no
 * currency: a number of days. The sums of money that were here (`out-30d` at 2,500.00 and the rest) were one person's
 * sizes in pounds, and a use case knows neither the size nor the currency of the record it lands on, so Money's own
 * ceilings start empty until the person types one (`MONEY_TARGET_SETTINGS` in `modules/money.ts`).
 */
export const PERSONAL_TARGETS: Readonly<Record<string, { lte: number } | { gte: number }>> = {
  'days-late-in': { lte: 3 },
};

/**
 * WHAT MONEY'S FIGURES ARE CALLED FOR ONE PERSON, where a business's words would read as somebody else's record. The
 * forecast's late knob is called by the figure it marks, so "Money in arrives late by" becomes a person's pay.
 */
export const PERSONAL_NAMES: Readonly<Record<string, string>> = {
  'days-late-in': 'Pay comes in late by',
};

/**
 * A PAY DAY, FORMED FROM A SENTENCE THAT NAMES PAY, as a row of Money's `recurring` list: "I get paid 2,400.00 USD on
 * the 25th" is money in every month, next due on the coming 25th. `missing` names each field the sentence did not
 * give, and a row with anything missing is not written, so a sum is never guessed and never put in a currency the person
 * did not name. `null` when the sentence says nothing of pay.
 *
 * NOT A SEED OF THIS PACK. A pack seeds only the lists it declares (`@braindog/declare`), and `recurring` is Money's, so
 * the first run writes this row beside the others it proposes, once Money is in (`apps/web/src/lib/start/propose.ts`).
 */
export type PayDay = { register: 'recurring'; fields: Record<string, unknown>; missing: string[] };

/* WHAT NAMES PAY, and not paying: "I pay rent" is a bill, "I get paid" and "my salary" are pay. */
const PAY_WORDS = /(?<![\p{L}\p{N}])(?:pay ?days?|pay ?cheques?|paychecks?|pay packets?|salary|wages?|my pay|(?:get|gets|getting|am|i'm) paid)(?![\p{L}\p{N}])/iu;

/* HOW OFTEN, most specific first, so "every two weeks" is not read as "every week". Monthly when the sentence says none.
   NOT "a week" OR "a month": "forty hours a week, paid monthly" names the pay's cadence once and a working week once. */
const CADENCES: readonly (readonly [string, RegExp])[] = [
  ['fortnightly', /(?<![\p{L}])(?:fortnightly|bi-?weekly|every (?:two|2|other) weeks)(?![\p{L}])/iu],
  ['twice_monthly', /(?<![\p{L}])(?:twice (?:a|per|each) month|twice monthly|semi-?monthly)(?![\p{L}])/iu],
  ['weekly', /(?<![\p{L}])(?:weekly|every week|each week|every (?:mon|tues|wednes|thurs|fri|satur|sun)day)(?![\p{L}])/iu],
  ['monthly', /(?<![\p{L}])(?:monthly|every month|each month)(?![\p{L}])/iu],
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?(k)?`;

/**
 * EVERY CURRENCY BY THE SYMBOL IT IS WRITTEN WITH, read from the runtime's own `Intl` and not from a table in source
 * (`loop/finish/modules.md` C10): "€" is EUR, "$" is USD, "CA$" is CAD. The first currency to claim a symbol keeps it.
 */
let symbols: Map<string, string> | null = null;
function symbolTable(): Map<string, string> {
  if (symbols) return symbols;
  symbols = new Map();
  for (const code of Intl.supportedValuesOf('currency')) {
    const sign = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(1).find((p) => p.type === 'currency')?.value;
    if (sign && sign !== code && !symbols.has(sign)) symbols.set(sign, code);
  }
  return symbols;
}

const escapeText = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A sum in minor units of `currency`, shifted by that currency's own decimals, or `null` for one it cannot hold. */
function minorOf(whole: string, part: string | undefined, thousand: boolean, currency: string): number | null {
  const places = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!thousand && part !== undefined && part.length > places) return null;
  const n = Number(`${whole.replace(/,/g, '')}${part === undefined ? '' : `.${part}`}`) * (thousand ? 1000 : 1);
  const out = Math.round(n * 10 ** places);
  return Number.isSafeInteger(out) && out > 0 ? out : null;
}

/** The first sum in the sentence written with its currency, a symbol before it or a code either side. */
function sumOf(said: string): { amount: number; currency: string } | null {
  const codes = new Set(Intl.supportedValuesOf('currency'));
  const signs = [...symbolTable().keys()].sort((a, b) => b.length - a.length).map(escapeText).join('|');
  const found: { at: number; amount: number | null; currency: string }[] = [];
  for (const m of said.matchAll(new RegExp(`(${signs})\\s?${NUM}`, 'gu'))) {
    const currency = symbolTable().get(m[1] ?? '');
    if (currency) found.push({ at: m.index ?? 0, amount: minorOf(m[2] ?? '0', m[3], m[4] !== undefined, currency), currency });
  }
  /* UPPER CASE ONLY, as `apps/web/src/lib/shape.ts` reads a code: `ALL` and `TOP` are currencies and "all 20" is no sum. */
  for (const m of said.matchAll(new RegExp(`\\b([A-Z]{3})\\s?${NUM}`, 'gu')))
    if (codes.has(m[1] ?? '')) found.push({ at: m.index ?? 0, amount: minorOf(m[2] ?? '0', m[3], m[4] !== undefined, m[1]!), currency: m[1]! });
  for (const m of said.matchAll(new RegExp(`${NUM}\\s?([A-Z]{3})\\b`, 'gu')))
    if (codes.has(m[4] ?? '')) found.push({ at: m.index ?? 0, amount: minorOf(m[1] ?? '0', m[2], m[3] !== undefined, m[4]!), currency: m[4]! });
  const first = found.sort((a, b) => a.at - b.at).find((f) => f.amount !== null);
  return first && first.amount !== null ? { amount: first.amount, currency: first.currency } : null;
}

const DAY_MS = 86_400_000;
const dayText = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * THE NEXT DAY PAY LANDS, from `today`, or `null` when the sentence gives no day. A day of the month ("the 25th", "the
 * last day of the month") for a monthly cadence, a weekday ("Fridays") for a weekly one. A 31st in a shorter month is
 * that month's last day, as a bank pays it.
 */
function nextDue(said: string, every: string, today: string): string | null {
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(now)) return null;
  const lower = said.toLowerCase();
  const weekday = WEEKDAYS.findIndex((d) => new RegExp(`(?<![\\p{L}])${d}s?(?![\\p{L}])`, 'u').test(lower));
  if (weekday >= 0 && (every === 'weekly' || every === 'fortnightly')) return dayText(now + ((weekday - new Date(now).getUTCDay() + 7) % 7) * DAY_MS);
  const date = new Date(now);
  const lastOf = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const on = (n: number | 'last'): string => {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const here = n === 'last' ? lastOf(y, m) : Math.min(n, lastOf(y, m));
    if (here >= date.getUTCDate()) return dayText(Date.UTC(y, m, here));
    const next = n === 'last' ? lastOf(y, m + 1) : Math.min(n, lastOf(y, m + 1));
    return dayText(Date.UTC(y, m + 1, next));
  };
  if (/(?<![\p{L}])(?:last (?:working )?day of (?:the|each|every) month|end of (?:the|each|every) month|month end)(?![\p{L}])/iu.test(lower)) return on('last');
  const m = /(?<![\p{L}\p{N}])(?:the )?([1-9]|[12]\d|3[01])(?:st|nd|rd|th)(?![\p{L}\p{N}])/iu.exec(lower);
  return m ? on(Number(m[1])) : null;
}

export function payDayRow(said: string, today: string | null): PayDay | null {
  if (!PAY_WORDS.test(said)) return null;
  const every = CADENCES.find(([, at]) => at.test(said))?.[0] ?? 'monthly';
  const sum = sumOf(said);
  const due = today === null ? null : nextDue(said, every, today);
  const fields: Record<string, unknown> = { what: 'Pay day', direction: 'in', every, state: 'live' };
  if (sum) fields.amount = sum;
  if (due) fields.next_due = due;
  return { register: 'recurring', fields, missing: [...(sum ? [] : ['amount']), ...(due ? [] : ['next_due'])] };
}
