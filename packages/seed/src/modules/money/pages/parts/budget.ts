/** Budgets: what is left of each category's month, and the day one passed its budget. */

/**
 * WHICH CATEGORIES HOLD A BUDGET, SAID ONCE: live, money going out, and a most a month typed on it
 * (`lists/categories.ts`). The tile and the line under it read the same sentence, so the line is never written for a
 * category the tile does not draw. It is the sentence the count the tile is drawn on counts by (`budgets-set`).
 */
const BUDGETED = 'state is live, direction is out, budget is set';

/** As many categories as the tile draws, and so as many lines as can be written under it. */
const BUDGET_LINES = 10;

const IN_THE_ORDER_MADE = [{ field: 'seq', dir: 'asc' }];

export const BUDGET: Record<string, unknown>[] = [
  {
    /* WHAT IS LEFT OF EACH MONTH'S BUDGET, ON MONEY ITSELF (REC-B19 step 4), for categories and budgets. The
       block that pairs each budgeted category with what it has spent was the Personal use case's alone
       (`usecases/personal.ts`), so a record that keeps its money here and is not a household's had a budget field on
       its categories and nowhere that read it. Each category that holds a most a month is set against what the ledger
       spent on it since the first (`spent-by-category-month`, `figures/flow.ts`), grouped by the category an entry
       points at, so a category and its spending are matched by the category itself and never by a word.

       DRAWN WHILE A BUDGET IS SET, AND NOT BEFORE: a record that set none reads nothing about budgets, and so the
       tile words no empty state, which could never be drawn. A budget is set by editing the category. */
    kind: 'progress',
    heading: 'Budgets',
    icon: 'wallet',
    span: 12,
    when: { metric: 'budgets-set', gt: 0 },
    source: 'register.categories',
    where: BUDGETED,
    columns: [{ field: 'name' }, { field: 'budget' }],
    spent: 'spent-by-category-month',
    order: IN_THE_ORDER_MADE,
    limit: BUDGET_LINES,
  },
  {
    /* THE DAY A CATEGORY PASSED ITS BUDGET, AS ONE WRITTEN LINE: "Outing passed its budget on 19 Oct." A bar that is
       full says a budget is spent and not since when, and the day is what tells a person whether the month went wrong
       in its first week or its last.

       ONE LINE A CATEGORY, WRITTEN FROM THE CATEGORY: the note names the categories it is about as the tile does
       (`source`, `where`, `order`, `limit`), and each is filled into it as an entry is filled into its template page,
       so `{{name}}` is the category's own name. A pack cannot type "Outing": the categories are the person's.

       ONLY FOR ONE THAT PASSED. `budget-passed-on:{{name}}` is the running total of that category's spending this
       month, stopped at its budget (`figures/budgets.ts`), and `crossed: true` is met while it answers a day. A
       category under its budget answers none and has no line; the total it answers is what it spent, which no bound
       on a number tells from a budget passed, so the condition asks for the day itself. `{{budget-passed-on.at}}` is
       that day, of the figure the condition named, said as a sentence says a day.

       A WARNING AND NOT THE DANGER COLOUR: a budget is the person's own line, and passing it is theirs to weigh. The
       words say it, so the tone is never the only thing that does. */
    kind: 'note',
    tone: 'warn',
    span: 12,
    source: 'register.categories',
    where: BUDGETED,
    order: IN_THE_ORDER_MADE,
    limit: BUDGET_LINES,
    when: { metric: 'budget-passed-on:{{name}}', crossed: true },
    body: '{{name}} passed its budget on {{budget-passed-on.at}}.',
  },
];
