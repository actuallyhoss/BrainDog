/** Categories: what money is for. */

import type { MoneyRegister } from './shared.ts';

/**
 * WHAT MONEY IS FOR. A ledger with no categories is a list of amounts, and a list of amounts cannot
 * answer the one question anybody asks of it. `budget` is what a person means by "no more than this
 * a month", held on the category rather than typed into a figure, so changing it is an edit to a row.
 */
export const CATEGORIES_REGISTER: MoneyRegister = {
  id: 'categories',
  name: 'Categories',
  icon: 'tag',
  one: 'category',
  holds: 'what money is for, so a ledger can be read by where it goes',
  title: 'name',
  mobile: ['name', 'direction', 'budget'],
  state: 'state',
  done: ['retired'],
  pack: 'money-core',
  fields: [
    /* UNIQUE, because two categories with one name is how a month's spending ends up split across
       two bars that a person reads as two different things. */
    { id: 'name', type: 'text', required: true, unique: true, search: true },
    /* WHICH WAY A CATEGORY IS FOR. `32-PARITY` §3.2's direction guard is this field: a rule pointing
       at an income category has no business on a payment out, and a person filing by hand is offered
       the ones that can be right. `both` is for the legs of a transfer, which are neither. */
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out', 'both'],
      labels: { in: 'Money in', out: 'Money out', both: 'Either way' },
      index: true,
      required: true,
    },
    /* THE COUNTERPARTY AS THE BANK WRITES IT, which is what `txn-categorise` linked on until money-core 3.17.0. */
    { id: 'match', label: 'Matches', type: 'text', index: true },
    /**
     * HOW MUCH OF A DESCRIPTION `match` MUST BE, SINCE money-core 3.0.0: the whole of it, how it starts, or anywhere
     * in it. A bank writes one shop as `FENWICK CLOUD` on Monday and `FENWICK CLOUD LTD 4471` on Friday, and an
     * equality files the first and leaves the second for a person. `exact` is the default and what every category
     * before this meant, so nothing a record already files moves.
     *
     * `pattern`, SINCE money-core 3.17.0, is the ladder's fourth rung: `match` is then a regular expression, read
     * without regard to case, so `TALABAT|TLBT` is one shop. The filing itself reads `filing_rules` from that version
     * (`./filing-rules.ts`), and this field and `match` stay for one version so each can become a rule.
     */
    {
      id: 'match_by',
      label: 'How it matches',
      type: 'enum',
      values: ['exact', 'starts', 'contains', 'pattern'],
      labels: { exact: 'The whole description', starts: 'How it starts', contains: 'Anywhere in it', pattern: 'A pattern' },
      default: 'exact',
    },
    /* `Most a month`, AND IT WAS `No more than, a month`. A page prints its own `where:` back using
       each field's label, and the sentence grammar splits clauses on commas, so a label with a
       comma in it could not be typed or pasted back: `no more than: categories has no field called
       no`. The test that says every field is reachable by the name the screen shows caught it. */
    /* `Most to spend` SINCE money-core 3.31.0, when a budget could be for a week or a year (`budget_period`). */
    { id: 'budget', label: 'Most to spend', type: 'money' },
    /* HOW A CATEGORY IS DRAWN AND HOW ITS BUDGET IS KEPT, SINCE money-core 3.29.0. A glyph from a fixed set and a colour
       from the category hues (`--cat-*`), so a ledger line, a budget bar and a share of the month wear the same chip
       for the same category; nothing is fetched from the web for it. `budget_alert` is the share of the most a month
       at which a warning is due, `rollover` carries what is left of this month into the next, and `parent` puts a
       category under another. All five are optional, so a category as it was before reads as it did. */
    {
      id: 'icon',
      label: 'Icon',
      type: 'enum',
      values: [
        'shopping-cart',
        'shopping-bag',
        'utensils',
        'coffee',
        'car',
        'plane',
        'train-front',
        'house',
        'zap',
        'phone',
        'heart-pulse',
        'gift',
        'ticket',
        'music',
        'graduation-cap',
        'dumbbell',
        'briefcase',
        'banknote',
        'piggy-bank',
        'landmark',
        'credit-card',
        'hand-coins',
        'repeat',
        'scale',
        'heart',
        'package',
        'tag',
      ],
    },
    {
      id: 'colour',
      label: 'Colour',
      type: 'enum',
      values: ['pink', 'violet', 'blue', 'teal', 'yellow', 'lime', 'sky', 'slate'],
      labels: { pink: 'Pink', violet: 'Violet', blue: 'Blue', teal: 'Teal', yellow: 'Yellow', lime: 'Lime', sky: 'Sky', slate: 'Slate' },
    },
    /* A WHOLE PERCENT AND NO COMMA IN THE LABEL, for the reason `budget`'s says. */
    { id: 'budget_alert', label: 'Warn at percent', type: 'int', min: 1, max: 100 },
    { id: 'rollover', label: 'Carries over', type: 'bool', default: false },
    { id: 'parent', label: 'Under', type: 'ref', to: 'categories' },
    /* WHERE THIS MONTH STANDS AGAINST THE BUDGET, written once a day by `scripts/budget-watch.js` and read by the rules
       `budget-near` and `budget-over`, which tell of each once a category a month (`warned_month`). */
    {
      id: 'budget_warned',
      label: 'Budget warning',
      type: 'enum',
      values: ['near', 'over'],
      labels: { near: 'Near its most', over: 'Over its most' },
    },
    { id: 'warned_month', label: 'Warned for', type: 'text' },
    /**
     * A BUDGET FOR A WEEK OR A YEAR, SINCE money-core 3.31.0 (money parity, "Left": weekly and yearly budgets). Empty is
     * a month, as every budget set before this was: the Budgets page, `budget-watch` and what carries over all read an
     * empty one as a month, so nothing set before changes. `budget` is the most for that period.
     *
     * `carried` IS WHAT WAS LEFT OF THE PERIOD BEFORE, written by `budget-watch` on a category that carries over, so this
     * period's most is the budget and that. `warned_for` says which period a warning is about, in the words it is told in.
     */
    {
      id: 'budget_period',
      label: 'Budget for',
      type: 'enum',
      values: ['month', 'week', 'year'],
      labels: { month: 'A month', week: 'A week', year: 'A year' },
      default: 'month',
    },
    { id: 'carried', label: 'Carried over', type: 'money' },
    { id: 'warned_for', label: 'Warned about', type: 'text' },
    /**
     * MONEY THAT STAYS YOURS, SINCE money-core 3.30.0: a move between your own accounts, a card paid off from the bank,
     * cash taken out, money put into savings. A person who files such entries under a category of their own says so here
     * once, and every figure of spending and income leaves out what is filed under it, through the Ledger's `stays`
     * (`./transactions.ts`). Nothing reads a category by its name, so this is how one is known for what it is.
     */
    { id: 'transfer', label: 'Money stays yours', type: 'bool', default: false },
    /**
     * A CORRECTION, NOT SPENDING (live check of 30 October, 20): a category of fixes to what an account holds, such as
     * the Discrepancy a count of the cash files what it cannot explain under. Ticked, every figure of spending and income
     * leaves out what is filed under it, through the Ledger's `corrects` (`./transactions.ts`), while what each account
     * holds still counts it. Asked once of a category whose name says so (`scripts/category-correction.js`).
     */
    { id: 'correction', label: 'A correction and not spending', type: 'bool', default: false },
    { id: 'state', label: 'Status', type: 'enum', values: ['live', 'retired'], default: 'live', index: true, required: true },
    { id: 'note', type: 'text' },
  ],
};

/**
 * THE STARTER SET, ruling 341: what Money plants on a new record so the first payment has somewhere to go.
 *
 * ENTRIES AND NOT A CLOSED LIST. The categories somebody uses are found over the first month and half of them are
 * theirs alone, so these are a start a person renames, retires and adds to, and nothing reads one by its name.
 * BOTH WAYS, because the direction guard above offers a payment in only the ones that can be right for it, and a
 * set with no `in` would leave the first income with nothing to be filed under.
 *
 * NO `match` AND NO `budget`: a shop's name as a bank writes it and a monthly limit are a person's own, and a
 * guessed one would file or flag money nobody asked it to. EIGHT, which is the most a pack may seed one list with
 * (`SEEDS_PER_REGISTER` in `@braindog/declare`). None shares a name with the sample studio's (`sample.ts`), since
 * `name` is unique and one record may be given both.
 */
export const STARTER_CATEGORIES: readonly { name: string; direction: 'in' | 'out'; state: 'live' }[] = [
  { name: 'Sales', direction: 'in', state: 'live' },
  { name: 'Pay', direction: 'in', state: 'live' },
  { name: 'Other income', direction: 'in', state: 'live' },
  { name: 'Rent', direction: 'out', state: 'live' },
  { name: 'Bills', direction: 'out', state: 'live' },
  { name: 'Subscriptions', direction: 'out', state: 'live' },
  { name: 'Food', direction: 'out', state: 'live' },
  { name: 'Transport', direction: 'out', state: 'live' },
];
