/** Budgets: this month's spending by category against the most a month each holds. A limit is offered from last month's pace and set only by the person. */

import type { SeedPage } from '../../base.ts';
import { A_MONTH } from '../figures/budgets2.ts';

/** The categories that hold a budget, as `budgets-set` counts them (`figures/budgets.ts`). */
const BUDGETED = 'state is live, direction is out, budget is set';

/**
 * THIS MONTH'S MONEY OUT WITH NO CATEGORY, as the Ledger lists it: the entries `unfiled-spent-month` adds up
 * (`figures/budgets2.ts`), so the link opens the money the line names and nothing else.
 */
const FILE_THEM = '/r/transactions?f=category:is:empty&f=parts:is:empty&f=direction:is:out&f=transfer:is:false&f=state:is:cleared&f=on:gte:bom';

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
      /* AND THE MONTH SO FAR, SINCE money-core 3.34.0 (next-money, M20): spent this month and last month were a stat of
         their own under the bars, two figures the line can say. A clause whose figure is nought goes (`leadOf`). */
      body: '{{budgets-total}} a month across {{budgets-set}} categories. {{spent-by-category-month}} spent this month, {{spent-last-month}} last month.',
    },
    {
      /* WITH NONE SET: what the page offers instead, and that nothing is set by itself. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'budgets-set', lt: 1 },
      body: 'No budgets yet.',
    },
    {
      /* WHAT NOBODY FILED, AS ITS OWN LINE WITH THE WAY TO FILE IT. A warning and not the danger colour: nothing is late,
         and the words say it. */
      kind: 'note',
      tone: 'warn',
      span: 12,
      when: { metric: 'unfiled-month', gt: 0 },
      body: `{{unfiled-spent-month}} this month has no category. [File them](${FILE_THEM})`,
    },
    {
      /* WHAT WAITS TO CLEAR IS SAID AND NOT COUNTED, SINCE money-core 3.32.0 (`pending-out-month`): a budget counts what
         the bank settled, as Spent does, and this line says how much is on its way. */
      kind: 'note',
      tone: 'info',
      span: 12,
      when: { metric: 'pending-out-month-count', gt: 0 },
      body: '{{pending-out-month}} is waiting to clear, and counts in these budgets once it does. [See it](/p/money-ledger)',
    },
    {
      /* EACH BUDGET, AGAINST THIS MONTH, LED BY ALL OF THEM TOGETHER (since money-core 3.32.0, as Coin Fish opens its
         budgets): the drawer adds a first row of what every budget here spent against all they allow, and each line
         says what is left of it or how far over. Columns: the name, the most a month, the share it warns at and whether what is
         left carries over, in the order the kind reads its four cells. Drawn only while a budget is set. SINCE money-core
         3.31.0 THE FOURTH IS WHAT CARRIED OVER (`carried`): the bar is set against the budget and it, and says so. */
      kind: 'progress',
      /* SAID BY ITS PERIOD, SINCE money-core 3.32.0 (audit of 30 October, 22), as a week's and a year's are. */
      heading: "This month's budgets",
      icon: 'wallet',
      span: 12,
      when: { metric: 'budgets-set', gt: 0 },
      source: 'register.categories',
      /* A MONTH'S BUDGETS, SINCE money-core 3.31.0: a week's and a year's are drawn against their own period below. */
      where: `${BUDGETED}, ${A_MONTH}`,
      columns: [{ field: 'name' }, { field: 'budget' }, { field: 'budget_alert' }, { field: 'carried' }],
      spent: 'spent-by-category-month',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 30,
      empty: 'No budgets yet.',
    },
    {
      /* A WEEK'S BUDGETS, SINCE money-core 3.31.0: each against what it spent since Monday. */
      kind: 'progress',
      heading: "This week's budgets",
      icon: 'calendar',
      span: 12,
      when: { metric: 'budgets-weekly', gt: 0 },
      source: 'register.categories',
      where: `${BUDGETED}, budget_period is week`,
      columns: [{ field: 'name' }, { field: 'budget' }, { field: 'budget_alert' }, { field: 'carried' }],
      spent: 'spent-by-category-week',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 30,
      empty: 'No weekly budgets.',
    },
    {
      /* A YEAR'S BUDGETS, SINCE money-core 3.31.0: each against what it spent since 1 January. */
      kind: 'progress',
      heading: "This year's budgets",
      icon: 'calendar',
      span: 12,
      when: { metric: 'budgets-yearly', gt: 0 },
      source: 'register.categories',
      where: `${BUDGETED}, budget_period is year`,
      columns: [{ field: 'name' }, { field: 'budget' }, { field: 'budget_alert' }, { field: 'carried' }],
      spent: 'spent-by-category-year',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 30,
      empty: 'No yearly budgets.',
    },
    /* NO "THIS MONTH" STAT, SINCE money-core 3.34.0 (next-money, M20): its two figures are the line's. */
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
      empty: 'Nothing spent last month.',
    },
    /* NO "NO BUDGET YET" TABLE, SINCE money-core 3.32.0 (audit of 30 October, 22): a bare column of names that set
       nothing. The app's Set a budget tile at the page's foot lists every category you spend in, with the most to spend
       and whether that is a week's, a month's or a year's, each set where it stands (`BudgetSet.svelte`). */
  ],
};
