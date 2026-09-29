/**
 * The Personal example: a person's bills, budgets, savings and a habit.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER. The drawing is dated `DRAWN_ON` (Monday 28
 * September 2026), so "in 2 days" is 30 September everywhere it is said. The three bills due this
 * week (GBP 10.99, 18.00 and 850.00) add to the GBP 878.99 on Home; Groceries and Transport have
 * GBP 54.90 and GBP 61.80 left of their budgets, which is what the question on Decide moves money
 * between; and the six bills on Bills add to GBP 1,148.99.
 */
import type { Example } from './types.ts';

/**
 * THE RUNS ARE WRITTEN BY A LOOP AND NOT BY HAND, because a heat grid is twelve weeks of days and
 * thirty lines of dates is where a typo would hide. Monday 13 July is the first Monday of the twelve
 * weeks that end in the drawing's week; a run on Monday, Wednesday and Saturday, with the week of
 * 10 August missed on Wednesday, and nothing yet in the drawing's own week.
 */
const DAY = 86_400_000;
const FIRST_MONDAY = Date.UTC(2026, 6, 13);
const runs: string[] = [];
for (let week = 0; week < 11; week++) {
  for (const [weekday, km] of [[0, 5], [2, 6], [5, 9]] as const) {
    if (week === 4 && weekday === 2) continue;
    const day = new Date(FIRST_MONDAY + (week * 7 + weekday) * DAY).toISOString().slice(0, 10);
    runs.push(`${day} | ${(km + (week % 3) * 0.4).toFixed(1)}`);
  }
}

export const personal: Example = {
  id: 'personal',
  label: 'Personal',
  glyph: 'house',
  pages: [
    {
      id: 'home',
      title: 'Day to day',
      glyph: 'home',
      src: `~~~note lead
Rent goes out in 6 days, and GBP 1,312.40 is left to spend until pay day.
~~~

~~~stat | This week
Left after bills | GBP 1,312.40 | until pay day on 8 Oct
Bills due this week | GBP 878.99 | 3 bills
Trip to Lisbon | GBP 420.00 | of GBP 900.00 put by
~~~

~~~progress budget | Spending against your budgets
Groceries | GBP 245.10 | GBP 300.00 | this month
Eating out | GBP 96.00 | GBP 80.00 | this month
Transport | GBP 58.20 | GBP 120.00 | this month
~~~

~~~heat | Runs, last twelve weeks
${runs.join('\n')}
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
        { at: 2, cols: 6 },
        { at: 3, cols: 6 },
      ],
      links: { 1: ['bills', 'bills', null] },
      reads: {
        2: 'Eating out is GBP 16.00 over its budget. Groceries and Transport are inside theirs.',
        3: 'Three runs most weeks since July. One Wednesday was missed in August, and none yet this week.',
      },
    },
    {
      id: 'decide',
      title: 'Decide',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | p1 | Budget helper | 2h ago | Move GBP 50.00 from Transport to Groceries this month? | Groceries has GBP 54.90 left with ten days to go, and Transport has GBP 61.80. | call
opt | p1 | accept | Accept | Groceries goes to GBP 350.00 and Transport to GBP 70.00 | true
opt | p1 | reject | Reject | Both budgets stay as they are |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 08:12 | Energy bill, GBP 96.00 | Filed to Bills, due 16 Oct
Yesterday | Payslip for September | Filed to Documents | good
Sat 26 Sep | Gym renewal notice | Filed to Bills, due 10 Oct
Fri 25 Sep | Flight confirmation for Lisbon | Filed to Trip to Lisbon
~~~`,
    },
    {
      id: 'bills',
      title: 'Bills',
      glyph: 'obligation',
      src: `~~~stat
Due in the next 30 days | GBP 1,148.99 | 6 bills
Next pay day | GBP 2,450.00 | on 8 Oct
~~~

~~~comparison | Bills
What | Amount | Due | Repeats
Streaming subscription | GBP 10.99 | 30 Sep | Monthly
Phone contract | GBP 18.00 | 1 Oct | Monthly
Rent | GBP 850.00 | 4 Oct | Monthly
Gym membership | GBP 32.00 | 10 Oct | Monthly
Energy bill | GBP 96.00 | 16 Oct | Monthly
Council tax | GBP 142.00 | 21 Oct | Monthly
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
    {
      id: 'automations',
      title: 'Automations',
      glyph: 'refresh',
      src: `~~~steps | File a bill when it arrives
Starts when | A bill arrives in the Inbox | trigger
Only if | Its amount is over GBP 50.00 | condition
Then | File it to Bills with its amount and due day | step
Then | Ask you on Decide when it is higher than last month | action
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Budget helper | Checking September against your budgets | now
Inbox filer | Reading the energy bill | 2 min ago
~~~

~~~agents | What they did
Budget helper | 1 | proposed Move GBP 50.00 to Groceries | 2h ago
Inbox filer | 4 | added Energy bill to Bills | today
Inbox filer | 2 | added Payslip for September | yesterday
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
