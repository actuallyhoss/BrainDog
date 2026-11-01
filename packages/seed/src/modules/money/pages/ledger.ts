/** Ledger: every entry, grouped by day, with what it was for and the account it moved. */

import type { SeedPage } from '../../base.ts';
import { MOVED_COLUMNS } from './shared.ts';
import { UNFILED } from '../figures/shared.ts';

/**
 * A LEDGER LINE, AS EVERY LIST OF THEM ON MONEY'S PAGES DECLARES IT: the day, who it was, and the amount signed by the way
 * the money went, which are the three a list of lines draws today (`LEDGER_COLUMNS`' own), then what it was for, the
 * account it moved through and the words the bank wrote.
 *
 * WHAT EACH OF THE SIX IS FOR, so a drawer can say a line the way a finance app does:
 * - the NAME is who was paid or paid you (`payee`), and the description where nobody is known (`or: 'what'`);
 * - the AMOUNT is signed by its direction, so money in reads `+` and money out `−`;
 * - the CATEGORY is the line's chip, its icon and colour, and the first half of the line under the name, "Groceries ·
 *   Card"; an empty one is a line not filed yet;
 * - the ACCOUNT is the second half of that line;
 * - the CHIP is the category again, read as its icon and colour (`as: chip`), so a line wears its category's mark.
 *
 * A LIST DRAWS THE FIRST THREE TODAY and leaves the rest for its row, as a timeline's three cells always have; the three
 * after them are declared so the row's under-line can be drawn from the record's own fields and not guessed at.
 */
export const LEDGER_LINE_COLUMNS = [
  MOVED_COLUMNS[0]!,
  { field: 'payee', or: 'what' },
  MOVED_COLUMNS[2]!,
  { field: 'category' },
  { field: 'account' },
  { field: 'category', as: 'chip' },
];

/**
 * WHICH MONTH, AS A CHOICE OF THREE: this calendar month, the one before it, and everything older. In the grammar's own
 * day words (`bom` is the first of this month, `bom-1m` the first of the last), so a month is a month whatever its length.
 */
export const MONTH_FILTER = {
  field: 'month',
  control: 'segmented',
  options: [
    { value: 'this', label: 'This month', where: 'on at least bom' },
    { value: 'last', label: 'Last month', where: 'on at least bom-1m, on before bom' },
    { value: 'older', label: 'Before that', where: 'on before bom-1m' },
  ],
} as const;

/**
 * WHAT KIND OF LINE: not filed yet, a move between your own accounts, money in, money out. Not filed yet is first, since it
 * is the one that asks something of you. A move is never money in or out: it changes which account holds the money, and
 * the totals leave it out.
 */
export const SHOW_FILTER = {
  field: 'show',
  control: 'chips',
  options: [
    { value: 'unfiled', label: 'Not filed yet', where: UNFILED },
    { value: 'moves', label: 'Between your accounts', where: 'transfer is true' },
    { value: 'in', label: 'Money in', where: 'direction is in, transfer is false, stays is not true' },
    { value: 'out', label: 'Money out', where: 'direction is out, transfer is false, stays is not true' },
  ],
} as const;

/** How many lines the whole list draws at once. */
export const LEDGER_PAGE_LINES = 200;

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this one holds every line.
 *
 * WHAT IS NOT FILED COMES FIRST. A line with no category is spending nobody can see in a budget or a report, and a month
 * with a third of its money unfiled reads as a month that spent less. So the page says how many there are in its first
 * sentence, draws them in a list of their own above everything else, and keeps "Not filed yet" as the first of its chips.
 * Each line opens its entry, where its category is picked; the rules that file the next one like it are a page of
 * their own (Filing rules).
 *
 * THEN EVERY LINE, A DAY AT A TIME, newest first, narrowed by the head's search (who, what, the bank's words) and by four
 * choices over it: the account, the category, the month, and the kind of line.
 */
export const MONEY_LEDGER_PAGE: SeedPage = {
  page: 'money-ledger',
  title: 'Ledger',
  nav: { section: 'Money', order: 12 },
  icon: 'receipt',
  requires: ['register.transactions', 'register.categories', 'register.accounts'],
  pack: 'money-core',
  header: { search: { param: 'q' } },
  filters: [{ field: 'account', control: 'chips' }, { field: 'category', control: 'chips' }, MONTH_FILTER, SHOW_FILTER],
  blocks: [
    {
      /* THE FIRST SENTENCE SAYS WHAT IS LEFT TO FILE, while anything is, and otherwise nothing: the page is its lines. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'txn-uncategorised', gt: 0 },
      body: '{{txn-uncategorised}} line(s) to file.',
    },
    {
      /* THE MONTH IN THREE NUMBERS, the Ledger's own: what went out and came in over thirty days, moves between your own
         accounts left out, and how many lines a bank add-on, an agent or a rule added for you. How many wait for a
         category is the line above.

         ADDED, NOT FILED (audit of 31 October, 11): the third read "Filed for you 2" while Filing rules said no rule had
         filed anything. Both were true: the two were brought in by the bank's statement, and filing is the category a
         rule puts on a line, which Filing rules counts. So this one says what it counts. */
      kind: 'stat',
      heading: 'Last 30 days',
      icon: 'coins',
      span: 12,
      cells: [
        { metric: 'spent-30d', label: 'Spent' },
        { metric: 'received-30d', label: 'Received' },
        { metric: 'filed-for-you-30d', label: 'Added for you' },
      ],
      /* "ADDED FOR YOU" ONLY ABOVE NOUGHT, SINCE money-core 3.34.0 (next-money, M7): "Added for you 0" stood beside Spent
         and Received on every record nothing brought lines into, a third of the tile saying nothing happened. A stat's
         `when:` is the block's, so it is one tile for each case, as a plan's summary is. */
      when: { metric: 'filed-for-you-30d', gt: 0 },
    },
    {
      kind: 'stat',
      heading: 'Last 30 days',
      icon: 'coins',
      span: 12,
      cells: [
        { metric: 'spent-30d', label: 'Spent' },
        { metric: 'received-30d', label: 'Received' },
      ],
      when: { any: [{ metric: 'filed-for-you-30d', lte: 0 }, { metric: 'filed-for-you-30d', empty: true }] },
    },
    {
      /* NOT FILED YET, ON ITS OWN AND FIRST, newest first, only while there is any: the lines with no category that are
         not a move between your own accounts. */
      kind: 'timeline',
      heading: 'Not filed yet',
      icon: 'inbox',
      span: 12,
      source: 'register.transactions',
      where: UNFILED,
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 50,
      when: { metric: 'txn-uncategorised', gt: 0 },
    },
    {
      /* WAITING TO CLEAR, APART, SINCE money-core 3.32.0 (audit of 30 October, 22): a pending line is in no total until the
         bank settles it, as Spent and every budget leave it out, so it is listed on its own under words that say so and
         not among the lines that are counted. */
      kind: 'timeline',
      heading: 'Waiting to clear',
      icon: 'clock',
      span: 12,
      source: 'register.transactions',
      where: 'state is pending',
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: LEDGER_PAGE_LINES,
      when: { metric: 'pending-lines', gt: 0 },
      empty: 'Nothing is waiting to clear.',
    },
    {
      /* EVERY LINE, A DAY AT A TIME, newest first. A void line is left out, as every figure of the Ledger leaves it, and a
         pending one is above, until it clears. */
      kind: 'timeline',
      heading: 'Every line',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'state is cleared',
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: LEDGER_PAGE_LINES,
      empty: 'No lines match.',
      /* THE DOOR TO THE FILING RULES OVER THE LINES THEY FILE, SINCE money-core 3.34.0 (next-money, M8): it was a tile of
         its own after the last line, and the list folds at thirty, so a one-line tile under "Show 30 more" was never
         reached. The line over the lines is the tile's own (`writtenLine` in the app's `record/blocks.ts`). */
      body: 'Your [filing rules](/p/money-rules) file lines like these as they come in.',
    },
  ],
};

