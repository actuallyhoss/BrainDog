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

/** The blocks Home and the Goals page share: what each savings goal and each goal has reached. */
const savingsProgress = (span: number) => ({
  kind: 'progress',
  heading: 'Savings goals',
  span,
  source: 'register.savings_goals',
  where: 'state is not paused',
  columns: [{ field: 'name' }, { field: 'saved' }, { field: 'target' }, { field: 'by' }],
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 6,
  empty: 'No savings goal yet. Add one and how close you are shows here.',
});

const goalsProgress = (span: number) => ({
  kind: 'progress',
  heading: 'Goals and habits',
  span,
  source: 'register.goals',
  where: 'state is active',
  columns: [{ field: 'what' }, { field: 'done' }, { field: 'target' }, { field: 'unit' }],
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 8,
  empty: 'No goals yet. Add one, like running three times a week.',
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
  version: '1.0.0',
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
     Money's categories are not relabelled here: a value label on `obligations.category` is longer than a setting name
     may be, so a bill's category keeps Money's words, and a person's own categories live on Spending. */
  labels: {
    obligations: 'Bills',
    'obligations:one': 'bill',
    'obligations:holds': 'your bills, subscriptions and pay days, each with a date and how often it comes round',
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
        mobile: ['name', 'saved', 'target'],
        state: 'state',
        done: ['reached'],
        fields: [
          { id: 'name', label: 'Saving for', type: 'text', required: true, search: true },
          { id: 'target', label: 'Target', type: 'money', required: true },
          { id: 'saved', label: 'Saved so far', type: 'money', required: true },
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
        mobile: ['what', 'done', 'target'],
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
          { id: 'done', label: 'So far', type: 'decimal' },
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
        source: 'register.savings_goals',
        where: 'state is not paused',
        value: { sum: 'saved' },
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
        requires: ['register.spending', 'register.budgets', 'register.savings_goals', 'register.goals', 'register.project_steps', 'register.obligations', 'register.accounts'],
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
          goalsProgress(12),
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
        requires: ['register.savings_goals', 'register.goals'],
        blocks: [
          savingsProgress(12),
          goalsProgress(12),
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
      { register: 'savings_goals', fields: { name: 'Rainy day fund', target: { amount: 300_000, currency: 'GBP' }, saved: { amount: 185_000, currency: 'GBP' }, state: 'saving' } },
      { register: 'savings_goals', fields: { name: 'Trip to Lisbon', target: { amount: 90_000, currency: 'GBP' }, saved: { amount: 42_000, currency: 'GBP' }, by: '+140d', state: 'saving' } },
      { register: 'savings_goals', fields: { name: 'New laptop', target: { amount: 120_000, currency: 'GBP' }, saved: { amount: 15_000, currency: 'GBP' }, by: '+300d', state: 'saving' } },
      { register: 'goals', fields: { what: 'Run three times a week', kind: 'habit', done: 2, target: 3, unit: 'runs this week', state: 'active' } },
      { register: 'goals', fields: { what: 'Run a half marathon', kind: 'goal', done: 16, target: 21, unit: 'km, longest run so far', by: '+60d', state: 'active' } },
      { register: 'goals', fields: { what: 'Cook at home five nights a week', kind: 'habit', done: 3, target: 5, unit: 'nights this week', state: 'active' } },
      { register: 'goals', fields: { what: 'Read a book a month', kind: 'habit', done: 0, target: 1, unit: 'book this month', state: 'active' } },
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
 * THE EXAMPLE ROWS MONEY AND PROJECTS GET IN A PERSON'S RECORD, in place of the sample studio's: a current account, a
 * savings account and a card; rent, a phone, a streaming subscription and the rest of a month's bills, and a pay day;
 * two projects on the go and one on hold. People gets none: onboarding writes the person's own row there.
 */
export const PERSONAL_EXAMPLES = [
  { register: 'accounts', fields: { name: 'Current account', kind: 'bank', balance: gbp(124_056), as_of: '0d', liquid: true } },
  { register: 'accounts', fields: { name: 'Savings account', kind: 'bank', balance: gbp(242_000), as_of: '-2d', liquid: true } },
  { register: 'accounts', fields: { name: 'Credit card', kind: 'card', balance: gbp(-18_640), as_of: '-1d', liquid: false } },
  { register: 'obligations', fields: { what: 'Rent', direction: 'owed_by_me', amount: gbp(85_000), due: '+6d', state: 'open', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Phone contract', direction: 'owed_by_me', amount: gbp(1_800), due: '+3d', state: 'open', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Streaming subscription', direction: 'owed_by_me', amount: gbp(1_099), due: '+2d', state: 'open', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Gym membership', direction: 'owed_by_me', amount: gbp(3_200), due: '+12d', state: 'open', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Energy bill', direction: 'owed_by_me', amount: gbp(9_600), due: '+18d', state: 'open', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Contents insurance', direction: 'owed_by_me', amount: gbp(850), due: '+21d', state: 'open', category: 'insurance', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Council tax', direction: 'owed_by_me', amount: gbp(14_200), due: '+25d', state: 'open', category: 'tax', repeats: 'monthly' } },
  { register: 'obligations', fields: { what: 'Pay day', direction: 'owed_to_me', amount: gbp(245_000), due: '+10d', state: 'open', repeats: 'monthly' } },
  { register: 'things', fields: { name: OLD_BIKE, lane: 'building', since: '-40d' } },
  { register: 'things', fields: { name: STORIES, lane: 'building', since: '-90d' } },
  { register: 'things', fields: { name: 'Balcony vegetable garden', lane: 'parked', since: '-200d' } },
];
