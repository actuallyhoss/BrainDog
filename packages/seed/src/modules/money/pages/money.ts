/** Money's page: the tiles it places, each from its own file under `parts/`, in the order the page draws them. */

import type { SeedPage } from '../../base.ts';
import { ACCOUNTS_TILE } from './parts/accounts.ts';
import { ADD_ACCOUNT } from './parts/add-account.ts';
import { CROSS_CHECK } from './parts/cross-check.ts';
import { HEADLINE_LASTS } from './parts/headline.ts';
import { HEADS_UP } from './parts/heads-up.ts';
import { HERO } from './parts/hero.ts';
import { INSTALMENTS } from './parts/instalments.ts';
import { LEDGER } from './parts/ledger.ts';
import { COMING_UP } from './parts/next30.ts';
import { OVER_TIME } from './parts/over-time.ts';
import { A_MONTH } from '../figures/budgets2.ts';
import { BUDGET } from './parts/budget.ts';
import { SPENDING } from './parts/spending.ts';

/** The budgets tile of Budgets' own page, with no width of its own so it pairs, and its six first. */
const { span: _span, ...BUDGET_TILE } = BUDGET[0]!;
/* A MONTH'S BUDGETS ONLY: the bars are set against this month's spending, so a week's or a year's most beside them would
   read as a month's. Budgets draws those against their own period. */
const BUDGETS_GLANCE: Record<string, unknown> = { ...BUDGET_TILE, heading: "This month's budgets", where: `${String(BUDGET_TILE.where)}, ${A_MONTH}`, limit: 6 };

/**
 * AND EVERY BUDGET AS ONE MONTH, SINCE money-core 3.32.0 (recheck of 30 October, N4): the tile above is a month's
 * budgets, and it said "£0 of £13,550" while Budgets said "£14,633 a month across 7", the week's budget left out of one
 * and counted as a month in the other. Said only while a week's or a year's budget is kept, which is when they differ.
 */
const BUDGETS_ALL: Record<string, unknown> = {
  kind: 'note',
  span: 12,
  when: { all: [{ metric: 'budgets-set', gt: 0 }, { any: [{ metric: 'budgets-weekly', gt: 0 }, { metric: 'budgets-yearly', gt: 0 }] }] },
  body: 'All {{budgets-set}} budgets come to {{budgets-total}} a month, a week\'s or a year\'s counted as its share of a month. [See them all](/p/money-budgets)',
};

/**
 * MONEY IS A FINANCE PAGE, NOT A LEDGER OF WHO OWES WHOM. It leads with the money there is, then how long it lasts, then
 * what comes in and goes out; which way an amount goes is a property of the row, never the frame of the page. IT NEEDS NO
 * PEOPLE: who a row is with is a link (`LINKS` in `packs/first-party.ts`), and no block here reads it.
 *
 * MONEY'S HOME, SINCE money-core 3.29.0: Money is a section with a page per job (Accounts, Ledger, Budgets, Coming up,
 * Forecast, Reports, Payees), and this page is its front door. It held twenty-four blocks of different shapes, the most
 * a page declares, in two columns of uneven length; now it is one hero and six tiles built the same way:
 *
 * - THE LINE: where the money is kept, and what is late (`parts/headline.ts`).
 * - THE HERO: Cash now in the figure's own size with the walk ahead drawn small beside it, its change on a month ago and
 *   each currency in its own amount, then when it runs out, how long it lasts with nothing coming in and why, and what
 *   comes in and goes out in thirty days (`parts/hero.ts`). The one cash walk, with every part of a plan in it, is the
 *   hero's line and its figures, so nothing here walks the money a second way.
 * - THE BOARD: Coming up beside Spent this month, the accounts beside the Ledger, then Instalments. No tile names a
 *   width, so the app pairs them into two even columns (`paired` in `apps/web/src/lib/page/layout.ts`), and a tile not
 *   drawn takes no place: the columns are always full, and a phone reads them in this order, a late bill first.
 * - HEADS UP closes the page: whether Cash now adds up, an old balance, and money late in or out, each line drawn only
 *   while it is true.
 *
 * WHAT WENT TO ITS OWN PAGE, AND STAYS DECLARED IN ITS FILE: the Cash ahead chart and its controls (Forecast), the
 * month's calendar, what repeats every month and the months in and out (Coming up and Reports), what each book holds
 * (Accounts), and where the money went and who was paid in what nobody filed (Reports and Budgets). The sidebar names
 * each page, and each tile's own link opens its list.
 */
export const MONEY_PAGE: SeedPage = {
  page: 'money',
  title: 'Money',
  /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101): the lead pages sit Work, Orders, Projects,
     Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
  nav: { section: 'Money', order: 10, place: 40 },
  icon: 'money',
  requires: ['register.accounts', 'register.obligations', 'register.transactions', 'register.recurring', 'register.installments', 'register.categories', 'register.books', 'register.balances'],
  pack: 'money-core',
  /* NO SIDE COLUMN, SINCE money-core 3.29.0: the hero takes the whole row, and the tiles under it pair as one board. */
  blocks: [
    /* The line, split so a record whose money lasts reads that it lasts the year. */
    ...HEADLINE_LASTS,
    /* The box to add a first account, in the hero's place while there is none. */
    ...ADD_ACCOUNT,
    ...HERO,
    /* The money over time, the whole row under the hero (money-core 3.31.0). */
    ...OVER_TIME,
    /* The board, in pairs: Coming up and Spent this month, the accounts and the Ledger, then Instalments beside the
       budgets at a glance (drawn while a budget is set; money-core 3.31.0). */
    ...COMING_UP,
    ...SPENDING,
    ...ACCOUNTS_TILE,
    ...LEDGER,
    ...INSTALMENTS,
    BUDGETS_GLANCE,
    BUDGETS_ALL,
    /* Heads up's heading, then whether Cash now adds up, then its lines: an old balance, and money late coming in (money late going out is the first line's). Not
       the line on categories marked the other way, empty on nearly every record, nor the Last confirmed cards and the
       box beside them, whose old balance line opens the same form. */
    HEADS_UP[0]!,
    ...CROSS_CHECK,
    ...HEADS_UP.slice(1).filter((b) => (b.when as { metric?: string } | undefined)?.metric !== 'categories-against-direction' && b.kind !== 'cards' && b.kind !== 'capture'),
  ],
};
