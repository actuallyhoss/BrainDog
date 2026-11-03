/**
 * Personal: one person's life admin. Their money, the bills coming up, what they are saving for, the projects they do
 * for the love of it, and the goals and habits they keep.
 *
 * IT BUILDS ON MONEY, NOT BESIDE IT. Money's accounts and bills are the same lists a business keeps, spoken in a
 * person's words through labels ("Bills", not "Money"). Projects comes when a project is said, not with Money, and
 * People comes with it, since its roles are laid on People's list (`needs`, since 2.11.0). Projects is where a passion project lives, its states relabelled Active, Ongoing, On hold and Finished. The people in
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
 * on each (`budget`), so Budget left reads `spent-by-category-month` against those rows. What Money does not hold stays this pack's: savings goals, goals and habits, and the steps of a project.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE, AND NO SUM IS IN A CURRENCY. A Personal record
 * used to arrive holding a stranger's month, every row in pounds. It now holds only what the person said: a pay day is a `recurring` row formed
 * from a sentence that names pay, in the currency the sentence names (`payDayRow`).
 */

import { exponentOf } from '@braindog/kernel';

import { counted } from './counted.ts';

/**
 * THE BLOCKS HOME AND THE GOALS PAGE SHARE: how far each savings goal, habit and goal has come.
 *
 * NOTHING IS TYPED AS "SO FAR". A saving is a row on Put by and a run is a row on the Log, each pointing at what it counts
 * toward, and a track is set against what was logged (`toward:`). A habit counts only this week's rows, from Monday, so
 * it starts again every week without anybody resetting it; a goal counts every row.
 */
/**
 * `gated` IS HOME'S, SINCE 2.2.0: Home draws a track only while it has something to track, and the Goals page draws each
 * whatever it holds, because there its empty line is how a person learns what to add.
 */
const gate = (gated: boolean, metric: string) => (gated ? { when: { metric, gt: 0 } } : {});

const savingsProgress = (span: number, gated = false) => ({
  kind: 'progress',
  heading: 'Savings goals',
  icon: 'piggy-bank',
  span,
  ...gate(gated, 'savings-active'),
  source: 'register.savings_goals',
  where: 'state is not paused',
  columns: [{ field: 'name' }, { field: 'target' }, { field: 'by' }],
  toward: 'put-by-by-goal',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 6,
  empty: 'No savings goal yet. Add one and how close you are shows here.',
});

const habitsProgress = (span: number, gated = false) => ({
  kind: 'progress',
  heading: 'Habits this week',
  icon: 'repeat',
  span,
  ...gate(gated, 'habits-active'),
  source: 'register.goals',
  where: 'state is active, kind is habit',
  columns: [{ field: 'what' }, { field: 'target' }, { field: 'unit' }],
  toward: 'logged-this-week-by-goal',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 8,
  empty: 'No habits yet. Add one, like running three times a week, and log each time.',
});

const goalsProgress = (span: number, gated = false) => ({
  kind: 'progress',
  heading: 'Goals',
  icon: 'goal',
  span,
  ...gate(gated, 'goals-active'),
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
  icon: 'wallet',
  span: 12,
  when: { metric: 'budgets-set', gt: 0 },
  source: 'register.categories',
  where: 'state is live, direction is out, budget is set',
  columns: [{ field: 'name' }, { field: 'budget' }],
  spent: 'spent-by-category-month',
  order: [{ field: 'seq', dir: 'asc' }],
  limit: 10,
  empty: 'No budget yet. Give a category the most you mean to spend on it in a month, and what is left shows here.',
});

/**
 * WHERE HOME'S FIRST ACTS LEAD, SINCE 2.5.0: the Accounts list with its add form open, the page where a forwarded bank
 * message is set up (the first run's own "Your bank's texts" goes there), and Browse searched for "money", because every
 * add-on that brings money in says so in its summary and this file names no provider (`tools/gates/shell-words.mjs`).
 */
const ADD_ACCOUNT = '/r/accounts?new=1';
const FORWARD_BANK = '/settings/ingest';
const BROWSE_MONEY = '/packs/browse?q=money';

export const PERSONAL = {
  usecase: 'personal',
  /* 1.3.0: the Projects page went, so the rail has one Projects Overview, and its next steps are on Home.
     1.5.0: Personal lays its own roles on People through `extends`, and the relabels of the studio's roles went.
     1.6.0: the studio's roles are relabelled in a household's words that are not its own five.
     1.7.0: the `registrar` label went, because People 2.0.0 no longer offers the value it read.
     1.7.1: Home's empty title loses its full stop, as every other title already has; a record is offered the words
     only when the version goes up.
     2.0.0: the `spending` and `budgets` lists and the Spending page went, since Money's ledger and categories carry
     them; every money figure is in the record's own currency; Home is rebuilt over Money.
     Major, because two lists and a page go. No record holds Personal to lose their rows.
     2.1.0: the voice says more of the record its own way, Home's empty lines and Decide's and the Inbox's among them
    . Each is a new setting a person can change at /packs, so a minor step.
     2.2.0: calmer. Home opens on one line said from Money's figures where a tile of three stood, what
     needs you comes first, Coming up is the one list of what falls due where Bills this week drew the same bills
     again, each track is drawn only while it has something, and what changed is folded shut. The Goals page and a
     project's page open on a line too, and every heading wears a glyph. Nine counts are added to draw them on, and
     nothing goes, so a minor step.
     2.3.1: the settings that hold each list's name and one of it are titled by what the list is called ("Name of
     the Ledger list"), not by its id ("Label: transactions"), and every list's name is declared before any
     singular, so the 64-setting ceiling costs a singular first. Titles and order only, so a patch step.
     2.4.0: the count of budgets set goes to Money (`hands`), which declares `budgets-set` itself since money-core
     3.17.0 so that its own Budgets tile has the count on a record with no use case. Two packs cannot own one
     figure, so this version stops declaring it and Home's budget tile reads Money's. A minor step: the figure is
     handed with its id, where and value as they were, and nothing a record holds goes.
     2.5.0: a new Home offers something to press. While no account counts as cash, Bring your money in links
     to adding an account, forwarding a bank message and the add-ons that bring money in; while no savings goal is
     kept, a line names one; while no project is live, a line names one in the Building lane. Each is drawn on its own
     count, so Home drops it once the thing exists. Three blocks and one count are added and nothing goes, so a minor
     step beside 2.4.0, which is live.
     2.6.0: a person's first day holds what their words point at ("make sure that the braindog
     experience is not overwhelming for new users"). `needs` is Money and the Projects its bills and this pack's
     project steps point at; People comes when a name is said, and anything else is offered when its moment comes. Home already leads from
     Money's own figures and this pack's lists, and a block or a role over a list the record does not hold is cut at
     install (`fitted`). 2.5.0 is published in the catalogue and frozen, and the file it shares changes (`needs`), so
     this is a version beside it. Nothing is declared, taken away or reworded, so a record on 2.5.0 keeps all it holds.
     2.6.1: the card's summary is one short line. Words only, so a patch step.
     2.7.0: one figure is added, how many days in a row something was logged (`log-streak`), which the Days in a row
     widget draws. Nothing goes, so a minor step.
     2.8.0 (audit 6g, AG12): that figure goes again. A count of days running is a streak, and BrainDog keeps no game
     score (his rule: no gamification); what was logged this week, by goal, stays, and Habits this week reads it. No
     widget, page, list or field reads `log-streak`, so nothing a person keeps or sees goes with it: a minor step.
     2.9.0 (audit 31 Oct h, AH4): Goals is on the rail from the first minute (its place, after Work), and opens on a box to
     add a goal or a habit, and one to name something you are saving for until one is named, where a new person found it
     inside More lists saying "Nothing here yet". Blocks added and nothing taken away, so a minor step; 2.8.0 is
     published.
     2.9.1 (audit 31 Oct h, AH21): the Log is called Progress and Put by is called Money saved, so a new person reads
     what each holds. Words only, so a patch step; 2.9.0 is published.
     2.10.0 (audit 31 Oct l, AL13): Goals' line leaves out a count of nought, "1 goal on the go" and never "1 goal and 0
     habits", by one line for each case. Blocks added and nothing taken away, so a minor step; 2.9.1 is published.
     2.11.0 (onboarding6, 2 Nov): a household stands on Money and People, not Projects. Projects came with every Personal record because
     this pack's Project steps point at it, so a household that said bills, rent and a holiday was made a Projects part
     it never asked for. `needs` is People and Money now; Projects comes when a project is said, and until then the install cuts
     Project steps' link to it (`fitted`). Nothing is declared, taken away or reworded, so a record on 2.10.0 keeps all
     it holds; the file it shares changes (`needs`, People and Money), so a version beside 2.10.0, which is published. */
  version: '2.11.1',
  title: 'Personal',
  summary: 'Your money, bills, savings and goals.',
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
  /* WHAT A PERSON CANNOT STAND WITHOUT, SINCE 2.11.0: their money, and the people in their life. Projects was here from
     2.6.0 because Money's bills and this pack's Project steps point at it (`project_steps.thing`), and a household was
     handed a Projects part for it; those links are cut at install where Projects is not held (`fitted`), and Projects
     comes when a project is said. PEOPLE IS STOOD ON, because this pack lays its roles (family, friend, landlord) on
     People's list (`extends`), and that is cut too where People is not held when this pack goes in: Marta's partner,
     written as family in the same press, was refused "role has no value family". Every sign-up asks a name, which keeps
     People anyway, so a household is shown nothing new. */
  needs: ['people', 'money-core'],
  voice: {
    home: 'Day to day',
    right_now: 'This month',
    needs_you: 'Worth a look',
    nothing_needs_you: 'Nothing needs you right now',
    since_away: 'Since you last looked',
    /* "My things", AND IT WAS "My lists": what sits under it is the person's bills and goals, and a list is only how they are kept. */
    lists: 'My things',
    /* THE REST OF THE LINES, warm and plain: a bill, a plan, something you are saving toward. */
    overdue: 'Running late',
    nothing_now: 'Nothing needs you right now. Enjoy your day.',
    nothing_due: 'No bill or plan falls due in the next two weeks.',
    fills_with: 'Bills coming up, what you are saving toward and what changed since you last looked show up here as your lists fill.',
    record_empty: 'Nothing here yet',
    no_questions: 'Nothing to decide',
    inbox_clear: 'Nothing new has come in',
    add_first: 'Add the first one',
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
     (`/auth/methods` says `firstRun: true`), and a record that comes from an import is
     proposed a founder's setup and not Personal. So no migration moves a
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
       (`test/lists-opened.test.ts`), so the label named a value Personal does not install and the label test in
       `test/usecases.test.ts` went red on exactly this line. A PERSONAL RECORD CAN HOLD ONE: the picker offered the
       value raw as Registrar before 1.6.0 and as Agency in 1.6.0. Such a record keeps the value on its list and the row
       keeps its word, because the plan lays back a value a row holds, but from 1.7.0 that row reads the raw word. */
    'people.role.client': 'Work contact',
    'people.role.contractor': 'Hired help',
    'people.role.accountant': 'Tax and accounts',
    'people.role.collaborator': 'Project partner',
    savings_goals: 'Savings goals',
    goals: 'Goals',
    goal_log: 'Progress',
    put_by: 'Money saved',
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
    /* THE COUNT OF BUDGETS SET GOES TO MONEY WITH ITS ID, SINCE 2.4.0: money-core 3.17.0 declares `budgets-set` under the
       same id, as Founder's organisations went to People. A record on 2.3.1 takes this update before Money's, or the two
       in one plan with Money told what this hands it (`planFile`); Money's alone, first, is refused at the figure. */
    hands: { 'metric.budgets-set': 'money-core' },
    declarations: [
      {
        register: 'savings_goals',
        name: 'Savings goals',
        one: 'savings goal',
        icon: 'star',
        holds: 'what you are saving for, how much it takes and how much is saved',
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
        name: 'Progress',
        one: 'progress entry',
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
        name: 'Money saved',
        one: 'saving',
        icon: 'money',
        holds: 'each amount set aside toward a savings goal, and when',
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
        name: 'Saved, by savings goal',
        source: 'register.put_by',
        value: { sum: 'amount' },
        group_by: 'saving',
        /* IN THE RECORD'S OWN CURRENCY, never a literal one. */
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
      /* WHAT HOME AND THE GOALS PAGE ARE DRAWN ON, SINCE 2.2.0, each over its tile's own clauses, so no tile is drawn
         over nothing. Counts, with no good or bad number. `budgets-set`, WHICH THE BUDGET TILE WAITS ON, IS MONEY'S SINCE
         2.4.0 (`hands` below): the same count, declared once, by the pack whose list it counts. */
      counted('savings-active', 'Savings goals on the go', 'register.savings_goals', 'state is not paused'),
      counted('goals-active', 'Goals on the go', 'register.goals', 'state is active, kind is goal'),
      counted('habits-active', 'Habits on the go', 'register.goals', 'state is active, kind is habit'),
      /* EVERY SAVINGS GOAL KEPT, PAUSED OR NOT, SINCE 2.5.0: Home's line that names the first one waits on it, so a
         person whose one goal is paused is not asked to name a goal again. */
      counted('savings-held', 'Savings goals kept', 'register.savings_goals'),
      counted('goals-held', 'Goals and habits', 'register.goals'),
      counted('goal-log-held', 'Logged', 'register.goal_log'),
      counted('put-by-held', 'Money saved', 'register.put_by'),
      counted('steps-left', 'Steps left on a project', 'register.project_steps', 'thing is {{it}}, done is false'),
      counted('steps-done', 'Steps done on a project', 'register.project_steps', 'thing is {{it}}, done is true'),
      {
        /* HOME, AS THIS USE CASE ANSWERS IT: what I have, the bills falling due this
           week, what is left of the budget, my projects with the next step on each, and my goals, then the house Home's
           own three (what needs you, what is coming up, and what changed), so a person's Home loses nothing the house
           one says. No `nav`, because Home is on the rail already. Every block is a whole row, so at 390 the page stacks
           in this order and nothing is placed beside anything. */
        page: 'home-personal',
        title: 'Day to day',
        icon: 'home',
        requires: ['register.accounts', 'register.categories', 'register.things', 'register.project_steps', 'register.goals', 'register.goal_log', 'register.savings_goals'],
        blocks: [
          {
            /* THE PAGE'S ONE LINE, SINCE 2.2.0, said from Money's own figures in a person's words: what is in the
               accounts and what moves in the next thirty days. It was a tile of three figures; a clause whose figure is
               nought is left out by the writer, so a record with no account reads no line. Cash now is every liquid
               account rolled forward to today (money-core `cash-now`), so it says what is there and not what was typed
               on the day an account was added. */
            kind: 'note',
            lead: true,
            span: 12,
            body: '{{cash-now}} in my accounts, {{arriving-30d}} coming in and {{leaving-30d}} going out in the next 30 days',
          },
          {
            /* WHAT NEEDS THE PERSON, FIRST UNDER THE LINE SINCE 2.2.0, and only while something is asked. */
            kind: 'queue',
            heading: '{{config:voice_needs_you}}',
            icon: 'ask',
            span: 12,
            source: 'governance.open',
            limit: 5,
            when: { metric: 'questions-open', gt: 0 },
            empty: '{{config:voice_nothing_needs_you}}',
          },
          {
            /* THE FIRST ACTS, SINCE 2.5.0: a new record opened on a line of zeros and nothing to press. Each is
               drawn on its own count and goes once the thing it starts exists, so a record with an account, a goal and a
               project never sees them. Nothing is written until the person presses. The way in for money comes first,
               as it does on a founder's Home, while no account counts as cash (money-core `cash-accounts`). */
            kind: 'link',
            heading: 'Bring your money in',
            icon: 'plug',
            span: 12,
            when: { metric: 'cash-accounts', lt: 1 },
            authored: [
              { cells: ['Add an account', ADD_ACCOUNT, 'What is in it today, and every figure on Home starts from it'] },
              { cells: ['Forward a bank message', FORWARD_BANK, 'What you spent files itself from the texts your bank sends'] },
              { cells: ['Find a plugin for your bank', BROWSE_MONEY, 'Balances and payments arrive on their own'] },
            ],
          },
          {
            /* THE HEADING IS THE PROMPT (`render/src/capture.ts`). A line typed here is a savings goal by that name, and
               the host asks for the target the list requires before it writes. */
            kind: 'capture',
            heading: 'Name something you are saving for',
            icon: 'piggy-bank',
            span: 12,
            register: 'savings_goals',
            when: { metric: 'savings-held', lt: 1 },
          },
          {
            /* A PROJECT NAMED HERE IS ON THE GO AT ONCE: the `where:` pins its lane to building (`captureFills`), so it
               is a card under My projects as soon as it is written. */
            kind: 'capture',
            heading: 'Name something you are making',
            icon: 'rocket',
            span: 12,
            register: 'things',
            where: 'lane is building',
            when: { metric: 'projects-live', lt: 1 },
          },
          {
            /* EVERY DAY SOMETHING FALLS DUE IN THE NEXT TWO WEEKS, bills, pay days and parts of a plan among them, as the
               house Home draws it. ONE LIST SINCE 2.2.0: Bills this week above it drew the same bills a second time. */
            kind: 'timeline',
            heading: 'Coming up',
            icon: 'calendar-clock',
            span: 12,
            source: 'deadlines',
            horizon: 14,
            columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
            limit: 12,
            empty: 'Nothing falls due in the next two weeks.',
          },
          budgetProgress('Budget left'),
          {
            /* ONE CARD A PROJECT THAT IS MOVING, WITH ITS NEXT STEP: the first step under it that is not done, which the
               record reads from Project steps (`steps:` on that list, `nextsOf` in the kernel). */
            kind: 'cards',
            heading: 'My projects',
            icon: 'rocket',
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
            when: { metric: 'projects-live', gt: 0 },
            empty: 'No projects on the go. Add one you make or do for the love of it, and its next step shows here.',
          },
          goalsProgress(12, true),
          habitsProgress(12, true),
          {
            /* WHAT CHANGED SINCE THE PERSON LAST LOOKED, FOLDED SHUT, SINCE 2.2.0: above it Home is what needs them and
               what is coming. */
            kind: 'section',
            heading: '{{config:voice_since_away}}',
            icon: 'history',
            span: 12,
            fold: true,
          },
          {
            kind: 'feed',
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
        /* ITS PLACE ON THE RAIL, SINCE 2.9.0 (AH4): a starter's own page is a place from the first minute. */
        nav: { section: 'Goals', order: 10, place: 20 },
        icon: 'star',
        requires: ['register.savings_goals', 'register.goals', 'register.goal_log', 'register.put_by'],
        blocks: [
          /* THE PAGE'S ONE LINE, SINCE 2.2.0: what is put by, and how many goals and habits are on the go. SAID THREE WAYS
             SINCE 2.10.0 (audit 31 Oct l, AL13), exactly one of them drawn: a first goal read "1 goal and 0 habits on the
             go", since a clause of nought goes only between commas and "and" joins the two counts in one clause. */
          {
            kind: 'note',
            lead: true,
            span: 12,
            when: { all: [{ metric: 'goals-active', gte: 1 }, { metric: 'habits-active', gte: 1 }] },
            body: '{{saved-toward-goals}} saved so far, {{goals-active}} goal(s) and {{habits-active}} habit(s) on the go',
          },
          {
            kind: 'note',
            lead: true,
            span: 12,
            when: { metric: 'habits-active', lt: 1 },
            body: '{{saved-toward-goals}} saved so far, {{goals-active}} goal(s) on the go',
          },
          {
            kind: 'note',
            lead: true,
            span: 12,
            when: { all: [{ metric: 'goals-active', lt: 1 }, { metric: 'habits-active', gte: 1 }] },
            body: '{{saved-toward-goals}} saved so far, {{habits-active}} habit(s) on the go',
          },
          /* A BOX TO ADD A GOAL OR A HABIT, SINCE 2.9.0 (AH4), and one to name a saving until one is named, as Home has. */
          { kind: 'capture', heading: 'Add a goal or a habit', icon: 'plus', span: 12, register: 'goals' },
          {
            kind: 'capture',
            heading: 'Name something you are saving for',
            icon: 'piggy-bank',
            span: 12,
            register: 'savings_goals',
            when: { metric: 'savings-held', lt: 1 },
          },
          savingsProgress(12),
          /* EACH THE WHOLE WIDTH SINCE 2.2.0, so a record keeping habits and no goals leaves no half row. */
          habitsProgress(12),
          goalsProgress(12),
          {
            /* WHAT WAS LOGGED AND PUT BY, AND EVERY GOAL, FOLDED SHUT, SINCE 2.2.0: looked up, not read each time. */
            kind: 'section',
            heading: 'Lately',
            icon: 'history',
            span: 12,
            fold: true,
          },
          {
            kind: 'table',
            heading: 'Logged lately',
            icon: 'notebook-pen',
            span: 12,
            when: { metric: 'goal-log-held', gt: 0 },
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
            heading: 'Saved lately',
            icon: 'piggy-bank',
            span: 12,
            when: { metric: 'put-by-held', gt: 0 },
            source: 'register.put_by',
            columns: [
              { field: 'what', label: 'What', width: 'minmax(14ch,1fr)' },
              { field: 'saving', label: 'Toward', width: 'minmax(12ch,1fr)' },
              { field: 'amount', label: 'Amount', width: '12ch', align: 'end' },
              { field: 'on', label: 'Day', width: '12ch', align: 'end' },
            ],
            order: [{ field: 'on', dir: 'desc' }],
            limit: 8,
            empty: 'Nothing saved yet. Add what you set aside and it counts toward its goal.',
          },
          {
            kind: 'table',
            heading: 'Every goal',
            icon: 'list',
            span: 12,
            when: { metric: 'goals-held', gt: 0 },
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
          /* THE PAGE'S LINE, SINCE 2.2.0: what the project is, in the person's own words on its row. */
          { kind: 'note', lead: true, span: 12, body: '{{about}}' },
          {
            kind: 'progress',
            heading: 'Progress',
            icon: 'gauge',
            span: 12,
            source: 'register.project_steps',
            where: 'thing is {{name}}',
            columns: [{ field: 'thing' }, { field: 'done' }],
            empty: '{{name}} has no steps yet. Add the first and its progress shows here.',
          },
          {
            kind: 'todo',
            heading: 'Still to do',
            icon: 'list-todo',
            span: 12,
            when: { metric: 'steps-left:{{name}}', gt: 0 },
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
            icon: 'circle-check',
            span: 12,
            when: { metric: 'steps-done:{{name}}', gt: 0 },
            source: 'register.project_steps',
            where: 'thing is {{name}}, done is true',
            columns: [{ field: 'what', label: 'Step', width: 'minmax(16ch,1fr)' }],
            limit: 12,
            empty: 'Nothing done yet.',
          },
        ],
      },
    ],
    /* NO `seeds` SINCE 2.0.0: every one was an example, in pounds, that a person then had
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
 * WHAT MONEY SAYS TO ONE PERSON, by module and then by the module's own words or a figure's metric id (`MODULE_NAMES`
 * in `install.ts`), laid over the plain words every use case but a business's gets. A person's Money is what they have,
 * what their pay and bills do and what they spent, so its page says that and not a studio's in and out. The forecast's
 * late knob is called by the figure it marks, so "Money in arrives late by" becomes a person's pay.
 *
 * NOT "Bills this week" OVER MONEY'S "Due in the next 30 days", which reads thirty days ahead: a relabel changes words
 * and not what a block reads, so the heading says what is under it. The week's bills are on this use case's own Home
 * (`home-personal`).
 */
export const PERSONAL_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'money-core': {
    'days-late-in': 'Pay comes in late by',
    'What you have': 'What I have',
    'What you have, by book': 'What I have, by book',
    'Cash now': 'In my accounts',
    'Due in the next 30 days': 'Bills due in the next 30 days',
    'Nothing falls due in the next 30 days.': 'No bill falls due in the next 30 days.',
    "Where this month's money went": 'Spent this month',
    'Nothing has gone out this month.': 'Nothing spent this month yet.',
    'In and out, by month': 'Pay and spending, by month',
    'Money in': 'Pay',
    'Money out': 'Spent',
    'Being chased': 'Still waiting for',
    'Most days money in may be late': 'Most days pay may be late',
  },
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
 * EVERY CURRENCY BY THE SYMBOL IT IS WRITTEN WITH, read from the runtime's own `Intl` and not from a table in source:
 * "€" is EUR, "$" is USD, "CA$" is CAD. The first currency to claim a symbol keeps it.
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
  const places = exponentOf(currency);
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

/**
 * THE WIDGET THE PERSONAL STARTER BRINGS TO TODAY (SHL-A22, 30 October): habits over its own goals and their log, in the
 * shape an add-on's manifest `widgets` takes, joined to the core's at read time. It was the core's own catalogue's until
 * today, which named these lists by id. It fills in by being used, so it never says "Comes with".
 */
export const PERSONAL_WIDGETS = {
  usecase: 'personal',
  title: 'Personal',
  widgets: [
    {
      id: 'habits',
      title: 'Habits this week',
      says: 'Each habit, against what you set out to do this week.',
      group: 'life',
      for: 'personal',
      icon: 'repeat',
      block: {
        kind: 'progress',
        heading: 'Habits this week',
        icon: 'repeat',
        source: 'register.goals',
        where: 'state is active, kind is habit',
        columns: [{ field: 'what' }, { field: 'target' }, { field: 'unit' }],
        toward: 'logged-this-week-by-goal',
        order: [{ field: 'seq', dir: 'asc' }],
        limit: 6,
        empty: 'No habits yet. Add one, like running three times a week.',
      },
      sizes: ['small', 'wide', 'tall', 'large', 'full'],
      size: 'small',
      needs: { lists: ['goals', 'goal_log'] },
      rows: { title: 'what', meta: 'unit' },
      example: { rows: [{ title: 'Run', meta: '2 of 3 times' }, { title: 'Read', meta: '4 of 7 days' }] },
      words: ['habit', 'routine', 'run', 'read'],
      asked: [{ match: '\\b(habits?|streak)\\b', about: 'your habits' }],
      fills: 'Fills in once you start keeping what it shows.',
    },
  ],
};
