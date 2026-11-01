/** A plan's page: how much of one thing paid in parts is paid, what is left, and every part. */

import type { SeedPage } from '../../base.ts';

/** The parts of the plan the page is about: the instalments whose plan is its name (`OF_PLAN` in `figures/plans.ts`). */
const PARTS = 'plan is {{name}}';

/** Drawn only while the plan has a part that stands, so no tile says nought of nought. */
const HAS_PARTS = { metric: 'plan-parts:{{name}}', gte: 1 };

/**
 * THE TWO LEAD SENTENCES OF A PLAN WITH PARTS EACH WAIT ON TWO COUNTS HELD TOGETHER, SINCE BATCH 74, when a block's
 * `when:` learnt `all:` (`drawnWhen` in `packages/kernel/src/pages.ts`): the parts that stand, and the parts still
 * open. A count is one number whatever currencies the parts are in and whatever their amounts add up to.
 *
 * THEY WAITED ON A SHARE OF THE PLAN'S MONEY IN BATCH 72, because a `when:` tested one figure and "no part open" is
 * true of a plan with no part too. A share is answered once a currency, so a plan with its dollars paid and its
 * pounds open drew both sentences; and parts that add up to nought have no share, so a plan of them all paid drew none.
 */
const OPEN_PARTS = 'plan-parts-open:{{name}}';

/** Drawn only while a part is still open: the sentence about what is left has something left to say. */
const HAS_OPEN = { all: [HAS_PARTS, { metric: OPEN_PARTS, gte: 1 }] };

/** Drawn only once the plan has parts and none of them is open. */
const ALL_PAID = { all: [HAS_PARTS, { metric: OPEN_PARTS, lt: 1 }] };

/**
 * WHILE THE PROPERTY ADD-ON HOLDS THIS PLAN AS A FLAT OR A HOUSE: its figure of what the plan is worth now has a value.
 * A record without the add-on has no such figure, and a `when:` naming a figure nobody declared never holds, so the
 * sentence that sends to Property is said only where Property is.
 */
const A_PROPERTY = { metric: 'property-value-of:{{name}}', empty: false };

/** Where Property's own page is, which lists each property with what it is worth and what is owned beyond what is left. */
const TO_PROPERTY = '[Property](/p/properties) has what it is worth and your equity.';

/** The columns every list of parts shares, in the order Property's lists draw them: the day, what it is, the amount. */
const DUE = { field: 'due', label: 'Due', width: '13ch' };
const WHAT = { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' };
const AMOUNT = { field: 'amount', label: 'Amount', width: '15ch', align: 'end' };
const LEFT_AFTER = { field: 'left_after', label: 'Left after', width: '15ch', align: 'end' };

/** The lead of a plan with parts, said with the line to Property where the add-on holds the plan. */
const lead = (when: unknown, body: string): Record<string, unknown> => ({
  kind: 'note',
  lead: true,
  span: 12,
  when,
  says: [{ when: A_PROPERTY, body: `${body} ${TO_PROPERTY}` }, { body }],
});

/** The summary's three cells: paid, left, and what is late. */
const PAID = { metric: 'plan-paid:{{name}}', label: 'Paid' };
const LEFT = { metric: 'plan-left:{{name}}', label: 'Left' };
const LATE = { metric: 'plan-late:{{name}}', label: 'Late' };

/** A part still open and one of them late, and a part still open with none late. One join each, never one inside another. */
const LATE_OPEN = { all: [HAS_PARTS, { metric: OPEN_PARTS, gte: 1 }, { metric: 'plan-late:{{name}}', gt: 0 }] };
const NONE_LATE = { all: [HAS_PARTS, { metric: OPEN_PARTS, gte: 1 }, { metric: 'plan-late:{{name}}', lte: 0 }] };

/** The summary drawn with the cells that have something to say while `when` holds. */
const summary = (when: unknown, cells: Record<string, unknown>[]): Record<string, unknown> => ({
  kind: 'stat',
  heading: 'Where it stands',
  icon: 'wallet',
  tone: 'bad',
  span: 12,
  when,
  cells,
});

/**
 * ONE PAGE A PLAN, UNDER MONEY, SINCE REC-B12 (jobs 3 and 4): an instalment plan has its own page. A TEMPLATE, as
 * a book's page is (`book.ts`): one declaration, one page for each plan, every `{{name}}` filled from it. A record
 * that keeps no plan has none of these pages and loses nothing, and Money's own page gains no block for it.
 *
 * LAID OUT AS THE PROPERTY ADD-ON'S PAGE OF A PLAN IS, SINCE money-core 3.29.0: where it stands, the parts paid as one
 * track, what was paid in all by each quarter, then the parts to come and the parts paid. The next six parts are a
 * list to tick, so a part due is marked paid where it is read, and every part still to come is folded under them, as
 * Property folds them. Where Property holds the plan, the lead sends to it for what the plan is worth and the equity,
 * which this page never says.
 *
 * THE LEAD IS ONE OF THREE SENTENCES: no part yet, a part still open (`HAS_OPEN`), and every part paid (`ALL_PAID`),
 * which says nothing is left in words and never "0 left". Each waits on counts of parts, one number whatever currencies
 * the parts are in. The amounts are the summary's: paid in, left and what is late in the late red, and the track says
 * the next part, its amount and its day, under the parts paid. A cell whose figure has nothing to say is not drawn, so
 * a plan with nothing late says no Late, and a plan all paid shows what was paid alone.
 *
 * EVERY FIGURE IS COUNTED FROM THE PARTS (`figures/plans.ts`), so the page cannot disagree with Instalments, and a
 * cancelled part is in neither side; it is listed under the fold, under its own word.
 */
export const MONEY_PLAN_PAGE: SeedPage = {
  page: 'money-plan',
  title: '{{name}}',
  for: { register: 'plans' },
  /* AFTER THE BOOKS, which are 20: the books say where money is kept, and a plan is one thing being paid for. */
  nav: { section: 'Money', order: 30 },
  icon: 'calendar',
  requires: ['register.plans', 'register.installments'],
  pack: 'money-core',
  blocks: [
    {
      /* A PLAN NOBODY HAS GIVEN A PART: one sentence and what to do, in place of figures of nought. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'plan-parts:{{name}}', lt: 1 },
      body: 'No instalments for {{name}} yet.',
    },
    /* HOW MANY ARE PAID AND WHEN IT ENDS. The amounts are the summary's, under it, and said once. */
    lead(HAS_OPEN, '{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, the last due on {{plan-last-due:{{name}}}}.'),
    lead(ALL_PAID, '{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} parts paid, and nothing is left. The last was due on {{plan-last-due:{{name}}}}.'),
    /* THE SUMMARY: paid, left, and what is late, which is red while it is not nought: the block's tone is bad, so a
       figure off its line is drawn red and not amber. A CELL WITH NOTHING TO SAY IS NOT DRAWN (MB3): a stat's `when:`
       is the block's, so the summary is one tile for each case, each drawn only while it holds, as Heads up draws each
       line only while it is true. Late is there only while a part is late, and a plan all paid reads paid alone, never
       "Late £0" with a tick or "Left £0". */
    summary(LATE_OPEN, [PAID, LEFT, LATE]),
    summary(NONE_LATE, [PAID, LEFT]),
    summary(ALL_PAID, [PAID]),
    {
      /* ONE TRACK, THE PARTS PAID AGAINST EVERY PART THAT STANDS, AND THE NEXT PART UNDER IT, as Money's Instalments tile
         draws each plan from the same five figures cut to one plan: "10 of 36", then "Next EGP 120,000 on 28 Nov", or the
         part late in the late red. The amount is what is left less what is left once that part is paid, worked out by
         the app, so no figure subtracts two currencies. */
      kind: 'progress',
      heading: 'Parts paid',
      icon: 'credit-card',
      span: 12,
      cells: [
        { metric: 'plan-parts-paid-by-plan:{{name}}', label: 'Paid' },
        { metric: 'plan-parts-by-plan:{{name}}', label: 'Parts' },
        { metric: 'plan-next-due-by-plan:{{name}}', label: 'Next due' },
        { metric: 'plan-left-by-plan:{{name}}', label: 'Left' },
        { metric: 'plan-after-next-by-plan:{{name}}', label: 'Left after' },
      ],
      when: HAS_PARTS,
      empty: 'No parts of {{name}} yet.',
    },
    /* NO "PAID IN ALL, OVER TIME" CHART, SINCE money-core 3.34.0 (next-money, M35): the plan said one figure three ways,
       Paid $625 in Where it stands, 3 of 12 on the track under it and "Paid in all $624.75" at the end of the chart's
       line. Where it stands and its track say what is paid; the parts paid are listed under Paid. */
    {
      /* THE NEXT SIX PARTS, A LIST TO TICK: a tick marks a part paid where it is read, with its Undo, as a bill is on
         Coming up. Its amount is at the row's end, and its day and a note, where it has one, the quiet line under it. */
      kind: 'todo',
      heading: 'Upcoming',
      icon: 'calendar-clock',
      span: 12,
      source: 'register.installments',
      where: `${PARTS}, state is open`,
      /* THE AMOUNT AT THE ROW'S END, SINCE money-core 3.34.0 (next-money, M36), as every money list puts it: the second
         cell is the one a todo draws at the right in Money's look, where it sat in the quiet line ("9 Nov · $208.25"). */
      columns: [{ field: 'what' }, { field: 'amount' }, { field: 'due' }, { field: 'note' }],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 6,
      empty: 'Nothing left to pay on {{name}}.',
    },
    {
      /* THE PARTS PAID, THE LATEST FIRST, with the day each was paid and the payment that paid it. */
      kind: 'table',
      heading: 'Paid',
      icon: 'receipt',
      span: 12,
      source: 'register.installments',
      where: `${PARTS}, state is paid`,
      columns: [DUE, WHAT, AMOUNT, { field: 'settled', label: 'Paid on', width: '13ch' }, { field: 'paid_by', label: 'Paid by', width: 'minmax(10ch,18ch)' }],
      order: [{ field: 'due', dir: 'desc' }],
      limit: 120,
      empty: 'Nothing paid on {{name}} yet.',
    },
    {
      /* EVERY PART STILL TO COME, FOLDED, as Property folds them: the six above are the ones a person acts on. */
      kind: 'section',
      heading: 'Every part still to come',
      icon: 'calendar-clock',
      span: 12,
      fold: true,
    },
    {
      /* LEFT AFTER is what the plan still has to pay once this part is paid, written by Money's script and never typed.
         120 is ten years of months. */
      kind: 'table',
      span: 12,
      source: 'register.installments',
      where: `${PARTS}, state is open`,
      columns: [DUE, WHAT, AMOUNT, LEFT_AFTER],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 120,
      empty: 'Nothing left to pay on {{name}}.',
    },
    {
      /* A CANCELLED PART IS COUNTED NOWHERE and still listed, under its own heading, so nobody wonders where it went. */
      kind: 'table',
      heading: 'Cancelled',
      icon: 'calendar-x',
      span: 12,
      source: 'register.installments',
      where: `${PARTS}, state is cancelled`,
      columns: [DUE, WHAT, AMOUNT],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 120,
      when: { metric: 'plan-parts-cancelled:{{name}}', gte: 1 },
    },
  ],
};
