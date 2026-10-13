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
 * ONE PAGE A PLAN, UNDER MONEY, SINCE REC-B12 (jobs 3 and 4): "instalment plan's own page" (the owner). A TEMPLATE, as
 * a book's page is (`book.ts`): one declaration, one page for each plan, every `{{name}}` filled from it. A record
 * that keeps no plan has none of these pages and loses nothing, and Money's own page gains no block for it.
 *
 * WHAT IT SAYS IS "10 of 23 paid. E£176,500 left, the last part on 5 Oct 2036.", AS ONE LINE. It was four figures
 * under four words while a note's `{{figure}}` could not name which plan it was asked about; a note's hole now takes
 * the plan after a colon, as a tile's figure does (`figureAsked` in `packages/kernel/src/pages.ts`), and `{{name}}` is
 * filled before the figure is asked, so the sentence is the lead and the four are said once.
 *
 * EVERY FIGURE IS COUNTED FROM THE PARTS (`figures/plans.ts`), so the page cannot disagree with Instalments, and a
 * cancelled part is in neither side. A tile is drawn only while its figures have something to say: a plan with no
 * part reads one sentence, and a plan all paid has no next part to show. THE LEAD SENTENCE WAITS FOR A PART TOO: a
 * figure of a plan that holds no value is not answered at all, so its braces would be left showing.
 *
 * THREE LEAD SENTENCES AND ONE DRAWN, SINCE BATCH 72: no part yet, a part still open (`HAS_OPEN`), and every part paid
 * (`ALL_PAID`), which reads "2 of 2 paid, and nothing is left. The last part was on 1 Feb 2027." and never "0 left".
 * In two currencies it is still one: a plan with any part open reads what is left, and only a plan with none reads
 * that nothing is.
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
      /* A PLAN NOBODY HAS GIVEN A PART: one sentence and what to do, in place of four figures of nought. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'plan-parts:{{name}}', lt: 1 },
      body: 'No part of {{name}} is on Instalments yet. Add its parts there with {{name}} as the plan, and this page counts them.',
    },
    {
      /* WHERE IT STANDS, IN THE OWNER'S OWN ORDER: how many are paid, what is left, and when it ends. */
      kind: 'note',
      lead: true,
      span: 12,
      when: HAS_OPEN,
      body: '{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} paid. {{plan-left:{{name}}}} left, the last part on {{plan-last-due:{{name}}}}.',
    },
    {
      /* A PLAN ALL PAID, SINCE BATCH 72: it read "2 of 2 paid. 0 left", a nought with no currency to be written in,
         because no open part is added up. It says nothing is left in words, and the day it ended as a day gone. */
      kind: 'note',
      lead: true,
      span: 12,
      when: ALL_PAID,
      body: '{{plan-parts-paid:{{name}}}} of {{plan-parts:{{name}}}} paid, and nothing is left. The last part was on {{plan-last-due:{{name}}}}.',
    },
    {
      /* ONE TRACK, THE PARTS PAID AGAINST EVERY PART THAT STANDS, read off the list's own status; Money's
         Instalments tile reads the same two counts from its two figures by plan, so "2 of 6" here is "2 of 6" there. */
      kind: 'progress',
      heading: 'Parts paid',
      icon: 'credit-card',
      span: 12,
      source: 'register.installments',
      where: `${PARTS}, state is not cancelled`,
      columns: [{ field: 'plan' }, { field: 'state' }],
      when: HAS_PARTS,
      empty: 'No part of {{name}} is on Instalments yet.',
    },
    {
      /* ONLY ONCE A PART IS PAID: an amount of nought has no currency to be written in. */
      kind: 'stat',
      heading: 'Paid so far',
      icon: 'wallet',
      span: 6,
      when: { metric: 'plan-parts-paid:{{name}}', gt: 0 },
      cells: [{ metric: 'plan-paid:{{name}}', label: 'Paid so far' }],
    },
    {
      /* ONLY WHILE A PART IS STILL OPEN: a plan all paid has no next day, and the tile goes with it. */
      kind: 'stat',
      heading: 'Next part',
      icon: 'calendar-clock',
      span: 6,
      when: { metric: 'plan-next-due:{{name}}', empty: false },
      cells: [{ metric: 'plan-next-due:{{name}}', label: 'Due' }],
    },
    {
      /* EVERY PART, THE EARLIEST FIRST, cancelled ones too under their own word. Paid by is the one payment that paid
         a part (REC-B11) and Left after is what the plan still owes once this part is paid, both written by Money's
         scripts and never typed. 120 is ten years of months; a longer plan says how many more there are. */
      kind: 'table',
      heading: 'Parts',
      icon: 'receipt',
      span: 12,
      source: 'register.installments',
      where: PARTS,
      columns: [
        { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
        { field: 'due', label: 'Due', width: '13ch', align: 'end' },
        { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
        { field: 'state', label: 'Status', width: '11ch' },
        { field: 'paid_by', label: 'Paid by', width: 'minmax(10ch,18ch)' },
        { field: 'left_after', label: 'Left after', width: '15ch', align: 'end' },
      ],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 120,
      empty: 'No part of {{name}} is on Instalments yet.',
    },
  ],
};
