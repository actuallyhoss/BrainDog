/** Budgets: this month's spending by category against the most a month each holds. A limit is offered from last month's pace and set only by the person. */

import type { SeedPage } from '../../base.ts';

/** The categories that hold a budget, as `budgets-set` counts them (`figures/budgets.ts`). */
const BUDGETED = 'state is live, direction is out, budget is set';

/**
 * THIS MONTH'S MONEY OUT WITH NO CATEGORY, as the Ledger lists it: the entries `unfiled-spent-month` adds up
 * (`figures/budgets2.ts`), so the link opens the money the line names and nothing else.
 */
const FILE_THEM = '/r/transactions?f=category:empty&f=parts:empty&f=direction:is:out&f=transfer:is:false&f=state:is:cleared&f=on:gte:bom';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: what each category may spend a month, and how this month is going.
 *
 * IT WORKS BEFORE A BUDGET IS SET. Most records set none, so the page opens on what this month has spent and offers a
 * budget for every category that holds none, each last month's spending on it rounded up (`scripts/offer-budgets.js`).
 * The offer is ONE question, "Use these", which waits on Decide and is drawn here too; nothing is set until it is
 * answered, and a budget is changed later by editing the category.
 *
 * EACH BAR IS A CATEGORY'S MONTH: what it spent since the first against its most a month, read from one figure
 * (`spent-by-category-month`) grouped by the category an entry points at. Beside the name and the limit the bar is
 * handed the share it warns at (`budget_alert`) and whether what is left carries over (`rollover`), and the category's
 * own glyph and colour are on its row, so a bar wears the chip the ledger line does.
 *
 * WHAT NO CATEGORY HOLDS IS ITS OWN LINE, before the bars: no budget can count money nobody filed, so the page says how
 * much there is and opens the entries to file.
 *
 * LAST MONTH BY CATEGORY IS THE PACE a budget is offered from, so the page shows it under the offer.
 */
export const MONEY_BUDGETS_PAGE: SeedPage = {
  page: 'money-budgets',
  title: 'Budgets',
  nav: { section: 'Money', order: 13 },
  icon: 'piggy-bank',
  requires: ['register.categories', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      /* WITH A BUDGET SET: what the budgets add up to, and the month so far. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'budgets-set', gt: 0 },
      body: '{{budgets-set}} categories have a budget, {{budgets-total}} a month in all.',
    },
    {
      /* WITH NONE SET: what the page offers instead, and that nothing is set by itself. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'budgets-set', lt: 1 },
      body: 'No category has a budget yet. Each one below is offered from what it spent last month, and nothing is set until you say so.',
    },
    {
      /* THE MONTH IN TWO FIGURES: spent so far, and last month whole beside it. What is budgeted is the line's, and what
         no budget can count yet is the note under this, with the way to file it: a cell for it said the same twice. */
      kind: 'stat',
      heading: 'This month',
      icon: 'calendar',
      span: 12,
      cells: [
        { metric: 'spent-by-category-month', label: 'Spent so far', note: 'Since the first, on every category' },
        { metric: 'spent-last-month', label: 'Last month', note: 'The whole month, on every category' },
      ],
      when: { metric: 'spent-by-category-month', gt: 0 },
    },
    {
      /* WHAT NOBODY FILED, AS ITS OWN LINE WITH THE WAY TO FILE IT. A warning and not the danger colour: nothing is late,
         and the words say it. */
      kind: 'note',
      tone: 'warn',
      span: 12,
      when: { metric: 'unfiled-month', gt: 0 },
      body: `{{unfiled-spent-month}} spent this month has no category, over {{unfiled-month}} entries. No budget counts it until it is filed. [File them](${FILE_THEM})`,
    },
    {
      /* EACH BUDGET, AGAINST THIS MONTH. Columns: the name, the most a month, the share it warns at and whether what is
         left carries over, in the order the kind reads its four cells. Drawn only while a budget is set. */
      kind: 'progress',
      heading: 'Each budget',
      icon: 'wallet',
      span: 12,
      when: { metric: 'budgets-set', gt: 0 },
      source: 'register.categories',
      where: BUDGETED,
      columns: [{ field: 'name' }, { field: 'budget' }, { field: 'budget_alert' }, { field: 'rollover' }],
      spent: 'spent-by-category-month',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 30,
      empty: 'No category has a budget yet.',
    },
    {
      /* THE ONE OFFER, WHERE IT CAN BE ANSWERED: the question `offer_budgets` files once a month, "Use these" or "Not
         now". Drawn only while it waits, so a month already answered reads nothing here. */
      kind: 'queue',
      heading: 'Offered budgets',
      icon: 'ask',
      span: 12,
      source: 'governance.open',
      where: 'about is Budgets',
      limit: 1,
      when: { metric: 'questions-open:Budgets', gt: 0 },
    },
    {
      /* LAST MONTH, BY CATEGORY: the pace each offer is read from, with what nobody filed named and never left out. */
      kind: 'bar',
      heading: 'Last month, by category',
      icon: 'chart-bar',
      span: 12,
      source: 'metric.spent-by-category-last-month',
      unset: 'No category',
      when: { metric: 'spent-last-month', gt: 0 },
      empty: 'Nothing was spent last month.',
    },
    {
      /* THE CATEGORIES WITH NO BUDGET, each a press from its page, where a most a month is typed by hand. THE NAME
         ALONE: a column for the most a month on the rows that have none was empty on every row, by its own `where`. */
      kind: 'table',
      heading: 'No budget yet',
      icon: 'tag',
      span: 12,
      source: 'register.categories',
      where: 'state is live, direction is out, budget is empty',
      columns: [{ field: 'name', label: 'Category', width: 'minmax(14ch,1fr)' }],
      order: [{ field: 'name', dir: 'asc' }],
      limit: 30,
      when: { metric: 'budgets-unset', gt: 0 },
      empty: 'Every category money goes out on has a budget.',
    },
  ],
};
