/** Ledger: every entry, grouped by day, with what it was for and the account it moved. */

import type { SeedPage } from '../../base.ts';
import { MOVED_COLUMNS } from './shared.ts';

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
    { value: 'unfiled', label: 'Not filed yet', where: 'category is empty, parts is empty, transfer is false' },
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
         accounts left out, and how many a rule filed for you. How many wait for a category is the line above. */
      kind: 'stat',
      heading: 'Last 30 days',
      icon: 'coins',
      span: 12,
      cells: [
        { metric: 'spent-30d', label: 'Out' },
        { metric: 'received-30d', label: 'In' },
        { metric: 'filed-for-you-30d', label: 'Filed for you' },
      ],
    },
    {
      /* NOT FILED YET, ON ITS OWN AND FIRST, newest first, only while there is any: the lines with no category that are
         not a move between your own accounts. */
      kind: 'timeline',
      heading: 'Not filed yet',
      icon: 'inbox',
      span: 12,
      source: 'register.transactions',
      where: 'state is not void, transfer is false, category is empty, parts is empty',
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 50,
      when: { metric: 'txn-uncategorised', gt: 0 },
    },
    {
      /* EVERY LINE, A DAY AT A TIME, newest first. A void line is left out, as every figure of the Ledger leaves it. */
      kind: 'timeline',
      heading: 'Every line',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'state is not void',
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: LEDGER_PAGE_LINES,
      empty: 'No lines match.',
    },
  ],
};
