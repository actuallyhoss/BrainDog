/**
 * Personal: one person's life admin. Their money, the bills coming up, what they are saving for, the projects they do
 * for the love of it, and the goals and habits they keep (`loop/DIRECTION.md` §11, the owner's first use case).
 *
 * IT BUILDS ON MONEY, NOT BESIDE IT. Money's accounts and bills are the same lists a business keeps, spoken in a
 * person's words through labels ("Bills", not "Money"; "Friend", not "Collaborator"). Money needs Projects and People,
 * so those come too, and Projects is where a passion project lives, its states relabelled Active, Ongoing, On hold and
 * Finished. Nothing here says client, invoice or runway.
 *
 * WHAT MONEY DOES NOT HOLD IS THIS PACK'S. Day-to-day spending carries a person's own categories (groceries, getting
 * around), which Money's closed business categories cannot say and a use case cannot add to another pack's list. So
 * spending, the monthly budget per category, savings goals, goals and habits, and the steps of a project are this
 * pack's own lists, and a budget reads what was spent this month through a figure grouped by the same categories.
 */

/** This calendar month, from its first day, as a structured predicate: the sentence grammar has no "on or after". */
const THIS_MONTH = { field: 'on', gte: 'bom' };

const RAINY_DAY = 'Rainy day fund';
const LISBON = 'Trip to Lisbon';
const LAPTOP = 'New laptop';
const RUN_WEEKLY = 'Run three times a week';
const RUN_KM = 'Run 100 km before the half marathon';
const COOK = 'Cook at home five nights a week';
const BOOKS = 'Read 12 books this year';

/**
 * THE EXAMPLE LOG: what each row is, what it counts toward, how much, and when. Days are counted from the day the record is
 * made, so a habit has something this week on any day: a row on `0d` is always in the week.
 */
const LOGGED: readonly (readonly [string, string, number, string])[] = [
  ['Morning run', RUN_WEEKLY, 1, '0d'],
  ['Run after work', RUN_WEEKLY, 1, '-2d'],
  ['Morning run, 5 km', RUN_KM, 5, '0d'],
  ['Long run, 14 km', RUN_KM, 14, '-3d'],
  ['Easy run, 8 km', RUN_KM, 8, '-9d'],
  ['Cooked a curry', COOK, 1, '0d'],
  ['Pasta night', COOK, 1, '-1d'],
  ['Finished Piranesi', BOOKS, 1, '-12d'],
];

/** THE EXAMPLE SAVINGS PUT BY: what, toward which goal, pence, when. */
const PUT_BY: readonly (readonly [string, string, number, string])[] = [
  ['Moved from the current account', RAINY_DAY, 150_000, '-60d'],
  ['Monthly transfer', RAINY_DAY, 17_500, '-30d'],
  ['Monthly transfer, this month', RAINY_DAY, 17_500, '-2d'],
  ['Birthday money', LISBON, 20_000, '-45d'],
  ['Put aside from pay day', LISBON, 22_000, '-10d'],
  ['Sold the old phone', LAPTOP, 15_000, '-5d'],
];

/** The categories a person spends in, shared by spending and budgets so a budget line and a purchase can be matched. */
const CATEGORIES = {
  values: ['groceries', 'eating_out', 'transport', 'home', 'shopping', 'fun', 'health', 'travel', 'gifts', 'other'],
  labels: {
    groceries: 'Groceries',
    eating_out: 'Eating out',
    transport: 'Getting around',
    home: 'Home',
    shopping: 'Shopping',
    fun: 'Fun',
    health: 'Health',
    travel: 'Travel',
    gifts: 'Gifts',
    other: 'Other',
  },
};

const BILLS_THIS_WEEK = 'state is open or part, direction is owed by me, due before +8d';

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

const budgetProgress = (heading: string) => ({
  kind: 'progress',
  heading,
  span: 12,
  source: 'register.budgets',
  columns: [{ field: 'category' }, { field: 'limit' }],
  spent: 'spent-this-month-by-category',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 10,
  empty: 'No budget yet. Give a category a monthly amount and what you have spent against it shows here.',
});

export const PERSONAL = {
  usecase: 'personal',
  version: '1.2.0',
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
    nothing_needs_you: 'Nothing needs you right now.',
    since_away: 'Since you last looked',
    lists: 'My lists',
  },
  /* A PERSON'S WORDS OVER MONEY, PROJECTS AND PEOPLE, and over this pack's own lists so a shared copy can rename them.
     A bill's category is one of Money's closed values, so each value a person's bills fall in is given a person's word:
     rent and energy are Home, a phone and streaming are Subscriptions, the gym is Health, pay is Pay. Those keys are
     longer than a setting name, and are kept by their hash (`labelSetting`). */
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
    'people.role.client': 'Family',
    'people.role.contractor': 'Tradesperson',
    'people.role.accountant': 'Adviser',
    'people.role.registrar': 'Landlord',
    'people.role.collaborator': 'Friend',
    spending: 'Spending',
    'spending:one': 'purchase',
    budgets: 'Budget',
    'budgets:one': 'budget line',
    savings_goals: 'Savings goals',
    goals: 'Goals',
    goal_log: 'Log',
    put_by: 'Put by',
    project_steps: 'Project steps',
  },
  skills: [
    { name: 'spending-sorter', trigger: 'when a purchase is added without a category, to suggest the one it belongs in' },
    { name: 'bill-reminder', trigger: 'the day before a bill is due, to say what is going out and from which account' },
  ],
  pack: {
    pack: 'usecase-personal',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'spending',
        name: 'Spending',
        one: 'purchase',
        icon: 'money',
        holds: 'what you spent day to day, on what and when',
        title: 'what',
        mobile: ['what', 'amount', 'on'],
        fields: [
          { id: 'what', label: 'What', type: 'text', required: true, search: true },
          { id: 'amount', label: 'Amount', type: 'money', required: true },
          { id: 'category', label: 'Category', type: 'enum', ...CATEGORIES, index: true, required: true },
          { id: 'on', label: 'Day', type: 'day', required: true, index: true },
          { id: 'account', label: 'Paid from', type: 'ref', to: 'accounts', index: true },
          { id: 'note', label: 'Notes', type: 'text' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'budgets',
        name: 'Budget',
        one: 'budget line',
        icon: 'tag',
        holds: 'how much you mean to spend on each category in a month',
        title: 'category',
        mobile: ['category', 'limit'],
        fields: [
          { id: 'category', label: 'Category', type: 'enum', ...CATEGORIES, required: true, unique: true, index: true },
          { id: 'limit', label: 'Each month', type: 'money', required: true },
          { id: 'note', label: 'Notes', type: 'text' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
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
        metric: 'spent-this-month',
        name: 'Spent this month',
        source: 'register.spending',
        where: THIS_MONTH,
        value: { sum: 'amount' },
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        /* WHAT A BUDGET LINE IS SET AGAINST: this month's spending, one part a category. */
        metric: 'spent-this-month-by-category',
        name: 'Spent this month, by category',
        source: 'register.spending',
        where: THIS_MONTH,
        value: { sum: 'amount' },
        group_by: 'category',
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'budget-each-month',
        name: 'Monthly budget',
        source: 'register.budgets',
        value: { sum: 'limit' },
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
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
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'bills-this-week',
        name: 'Bills this week',
        source: 'register.obligations',
        where: BILLS_THIS_WEEK,
        value: { sum: 'amount' },
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        metric: 'saved-toward-goals',
        name: 'Saved toward goals',
        source: 'register.put_by',
        value: { sum: 'amount' },
        format: 'money.GBP',
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
      {
        /* HOME, AS THIS USE CASE ANSWERS IT (`loop/research-spark.md` S13): this month's spending against the budget,
           the bills due this week, how close each goal is and which projects are moving. No `nav`, because Home is on
           the rail already; the first heading reads the voice. */
        page: 'home-personal',
        title: 'Day to day',
        icon: 'home',
        requires: ['register.spending', 'register.budgets', 'register.savings_goals', 'register.goals', 'register.goal_log', 'register.put_by', 'register.project_steps', 'register.obligations', 'register.accounts'],
        blocks: [
          {
            kind: 'stat',
            heading: '{{config:voice_right_now}}',
            span: 12,
            cells: [
              { metric: 'spent-this-month', label: 'Spent this month' },
              { metric: 'budget-each-month', label: 'Monthly budget' },
              { metric: 'bills-this-week', label: 'Bills this week' },
              { metric: 'cash-now', label: 'In your accounts', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' },
            ],
          },
          budgetProgress('Spending against your budget'),
          {
            kind: 'table',
            heading: 'Bills due this week',
            span: 12,
            source: 'register.obligations',
            where: BILLS_THIS_WEEK,
            columns: [
              { field: 'what', label: 'Bill', width: 'minmax(16ch,1fr)' },
              { field: 'amount', label: 'Amount', width: '14ch', align: 'end' },
              { field: 'due', label: 'Due', width: '13ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 6,
            empty: 'No bills due this week.',
          },
          savingsProgress(6),
          {
            kind: 'progress',
            heading: 'Projects in motion',
            span: 6,
            source: 'register.project_steps',
            columns: [{ field: 'thing' }, { field: 'done' }],
            limit: 6,
            empty: 'No project steps yet. Give a project its steps and its progress shows here.',
          },
          habitsProgress(6),
          goalsProgress(6),
        ],
      },
      {
        /* A PERSON'S OWN MONEY PAGE, beside Money's overview on the rail: the month against the budget, where it went
           and what was bought. */
        page: 'spending',
        title: 'Spending',
        nav: { section: 'Money', order: 20 },
        icon: 'tag',
        requires: ['register.spending', 'register.budgets'],
        blocks: [
          {
            kind: 'stat',
            heading: 'This month',
            span: 12,
            cells: [
              { metric: 'spent-this-month', label: 'Spent this month' },
              { metric: 'budget-each-month', label: 'Monthly budget' },
            ],
          },
          budgetProgress('Against your budget'),
          {
            kind: 'split',
            heading: 'Where it went, last 30 days',
            span: 12,
            source: 'register.spending',
            where: 'on after -31d',
            columns: [{ field: 'category' }, { field: 'amount' }],
            limit: 6,
            empty: 'Nothing spent in the last 30 days.',
          },
          {
            kind: 'table',
            heading: 'Recent spending',
            span: 12,
            source: 'register.spending',
            columns: [
              { field: 'what', label: 'What', width: 'minmax(16ch,1fr)' },
              { field: 'category', label: 'Category', width: '14ch' },
              { field: 'amount', label: 'Amount', width: '12ch', align: 'end' },
              { field: 'on', label: 'Day', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'desc' }],
            limit: 12,
            empty: 'Nothing spent yet. Add a purchase and it shows here.',
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
        page: 'projects',
        title: 'Projects',
        nav: { section: 'Projects', order: 10 },
        icon: 'thing',
        requires: ['register.things', 'register.project_steps'],
        blocks: [
          {
            kind: 'progress',
            heading: 'How far each one is',
            span: 12,
            source: 'register.project_steps',
            columns: [{ field: 'thing' }, { field: 'done' }],
            limit: 8,
            empty: 'No project steps yet. Give a project its steps and its progress shows here.',
          },
          {
            kind: 'table',
            heading: 'Next steps',
            span: 12,
            source: 'register.project_steps',
            where: 'done is false',
            columns: [
              { field: 'what', label: 'Step', width: 'minmax(18ch,1fr)' },
              { field: 'thing', label: 'Project', width: 'minmax(12ch,22ch)' },
              { field: 'by', label: 'By', width: '13ch', align: 'end' },
            ],
            order: [{ field: 'by', dir: 'asc' }],
            limit: 12,
            empty: 'Nothing left to do. Add the next step when you have one.',
          },
          {
            kind: 'table',
            heading: 'Every project',
            span: 12,
            source: 'register.things',
            columns: [
              { field: 'name', label: 'Project', width: 'minmax(18ch,1fr)' },
              { field: 'lane', label: 'Status', width: '12ch' },
              { field: 'since', label: 'Since', width: '13ch', align: 'end' },
            ],
            limit: 20,
            empty: 'No projects yet.',
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
    /* A DAY WRITTEN `-3d` IS COUNTED FROM THE DAY THE RECORD IS MADE (`dates.ts`), so the month has spending in it on
       any day but the first few, and the week has bills. Amounts are pence. */
    seeds: [
      { register: 'spending', fields: { what: 'Weekly shop', amount: { amount: 6_420, currency: 'GBP' }, category: 'groceries', on: '-2d' } },
      { register: 'spending', fields: { what: 'Lunch with Priya', amount: { amount: 1_860, currency: 'GBP' }, category: 'eating_out', on: '-1d' } },
      { register: 'spending', fields: { what: 'Bus pass top-up', amount: { amount: 2_500, currency: 'GBP' }, category: 'transport', on: '-6d' } },
      { register: 'spending', fields: { what: 'Running shoes', amount: { amount: 8_999, currency: 'GBP' }, category: 'health', on: '-4d' } },
      { register: 'spending', fields: { what: 'Cinema', amount: { amount: 1_250, currency: 'GBP' }, category: 'fun', on: '-3d' } },
      { register: 'spending', fields: { what: 'Birthday present for Sam', amount: { amount: 3_000, currency: 'GBP' }, category: 'gifts', on: '-7d' } },
      { register: 'spending', fields: { what: 'Takeaway', amount: { amount: 2_280, currency: 'GBP' }, category: 'eating_out', on: '-5d' } },
      { register: 'spending', fields: { what: 'Top-up shop', amount: { amount: 2_135, currency: 'GBP' }, category: 'groceries', on: '0d' } },
      { register: 'budgets', fields: { category: 'groceries', limit: { amount: 30_000, currency: 'GBP' } } },
      { register: 'budgets', fields: { category: 'eating_out', limit: { amount: 8_000, currency: 'GBP' } } },
      { register: 'budgets', fields: { category: 'transport', limit: { amount: 6_000, currency: 'GBP' } } },
      { register: 'budgets', fields: { category: 'fun', limit: { amount: 5_000, currency: 'GBP' } } },
      { register: 'budgets', fields: { category: 'health', limit: { amount: 4_000, currency: 'GBP' } } },
      { register: 'budgets', fields: { category: 'gifts', limit: { amount: 5_000, currency: 'GBP' } } },
      { register: 'savings_goals', fields: { name: RAINY_DAY, target: { amount: 300_000, currency: 'GBP' }, state: 'saving' } },
      { register: 'savings_goals', fields: { name: LISBON, target: { amount: 90_000, currency: 'GBP' }, by: '+140d', state: 'saving' } },
      { register: 'savings_goals', fields: { name: LAPTOP, target: { amount: 120_000, currency: 'GBP' }, by: '+300d', state: 'saving' } },
      ...PUT_BY.map(([what, , pence, on]) => ({ register: 'put_by', fields: { what, amount: { amount: pence, currency: 'GBP' }, on } })),
      { register: 'goals', fields: { what: RUN_WEEKLY, kind: 'habit', target: 3, unit: 'runs', state: 'active' } },
      { register: 'goals', fields: { what: RUN_KM, kind: 'goal', target: 100, unit: 'km', by: '+60d', state: 'active' } },
      { register: 'goals', fields: { what: COOK, kind: 'habit', target: 5, unit: 'nights', state: 'active' } },
      { register: 'goals', fields: { what: BOOKS, kind: 'goal', target: 12, unit: 'books', state: 'active' } },
      ...LOGGED.map(([what, , amount, on]) => ({ register: 'goal_log', fields: { what, amount, on } })),
      { register: 'project_steps', fields: { what: 'Strip and clean the frame', done: true } },
      { register: 'project_steps', fields: { what: 'Order new brake pads', done: true } },
      { register: 'project_steps', fields: { what: 'Fit the new tyres', done: false, by: '+3d' } },
      { register: 'project_steps', fields: { what: 'Adjust the gears', done: false, by: '+10d' } },
      { register: 'project_steps', fields: { what: 'Draft the first story', done: true } },
      { register: 'project_steps', fields: { what: 'Draft the second story', done: false, by: '+14d' } },
      { register: 'project_steps', fields: { what: 'Ask Sam to read the first story', done: false, by: '+5d' } },
    ],
  },
};

const OLD_BIKE = 'Restore the old road bike';
const STORIES = 'A collection of short stories';

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

/** Which goal each example log row and each saving counts toward, for the linker (`links.ts`). */
export const PERSONAL_LOG_LINKS: readonly { register: string; title: string; field: string; to: string; target: string }[] = [
  ...LOGGED.map(([title, goal]) => ({ register: 'goal_log', title, field: 'goal', to: 'goals', target: goal })),
  ...PUT_BY.map(([title, goal]) => ({ register: 'put_by', title, field: 'saving', to: 'savings_goals', target: goal })),
];

/** Which project each example step belongs to, for the linker (`links.ts`). */
export const PERSONAL_STEP_PROJECTS: readonly (readonly [string, string])[] = [
  ['Strip and clean the frame', OLD_BIKE],
  ['Order new brake pads', OLD_BIKE],
  ['Fit the new tyres', OLD_BIKE],
  ['Adjust the gears', OLD_BIKE],
  ['Draft the first story', STORIES],
  ['Draft the second story', STORIES],
  ['Ask Sam to read the first story', STORIES],
];

const gbp = (pence: number) => ({ amount: pence, currency: 'GBP' });

/**
 * WHAT GOOD LOOKS LIKE ON MONEY'S FIGURES FOR ONE PERSON, in place of a studio's. Money's own targets are a business's
 * ("no more than £50,000.00" going out in 30 days), which on a person's Overview read as though the record were somebody
 * else's. The use case installs Money with these, by metric, in pence; a figure left out keeps Money's.
 */
export const PERSONAL_TARGETS: Readonly<Record<string, { lte: number } | { gte: number }>> = {
  'out-30d': { lte: 250_000 },
  'every-month-out': { lte: 150_000 },
  'every-month-by-category': { lte: 150_000 },
  'due-30d': { lte: 250_000 },
  'owed-to-you': { lte: 500_000 },
  'days-late-in': { lte: 3 },
};

/**
 * THE EXAMPLE ROWS MONEY AND PROJECTS GET IN A PERSON'S RECORD, in place of the sample studio's: a current account, a
 * savings account and a card; rent, a phone, a streaming subscription and the rest of a month's bills, and a pay day;
 * two projects on the go and one on hold. People gets none: onboarding writes the person's own row there.
 */
export const PERSONAL_EXAMPLES = [
  { register: 'accounts', fields: { name: 'Current account', kind: 'bank', balance: gbp(124_056), as_of: '0d', liquid: true } },
  { register: 'accounts', fields: { name: 'Savings account', kind: 'bank', balance: gbp(242_000), as_of: '-2d', liquid: true } },
  { register: 'accounts', fields: { name: 'Credit card', kind: 'card', balance: gbp(-18_640), as_of: '-1d', liquid: false } },
  { register: 'obligations', fields: { what: 'Rent', direction: 'owed_by_me', amount: gbp(85_000), due: '+6d', state: 'open', category: 'premises', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Phone contract', direction: 'owed_by_me', amount: gbp(1_800), due: '+3d', state: 'open', category: 'software', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Streaming subscription', direction: 'owed_by_me', amount: gbp(1_099), due: '+2d', state: 'open', category: 'software', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Gym membership', direction: 'owed_by_me', amount: gbp(3_200), due: '+12d', state: 'open', category: 'professional', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Energy bill', direction: 'owed_by_me', amount: gbp(9_600), due: '+18d', state: 'open', category: 'premises', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Contents insurance', direction: 'owed_by_me', amount: gbp(850), due: '+21d', state: 'open', category: 'insurance', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Council tax', direction: 'owed_by_me', amount: gbp(14_200), due: '+25d', state: 'open', category: 'premises', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Pay day', direction: 'owed_to_me', amount: gbp(245_000), due: '+10d', state: 'open', category: 'client_work', repeats: 'monthly' } },
  { register: 'things', fields: { name: OLD_BIKE, lane: 'building', since: '-40d' } },
  { register: 'things', fields: { name: STORIES, lane: 'building', since: '-90d' } },
  { register: 'things', fields: { name: 'Balcony vegetable garden', lane: 'parked', since: '-200d' } },
];
