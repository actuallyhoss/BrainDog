/** Money's page: the tiles it places, each from its own file under `parts/`, in the order the page draws them. */

import type { SeedPage } from '../../base.ts';
import { ACCOUNTS_TILE } from './parts/accounts.ts';
import { ADD_ACCOUNT } from './parts/add-account.ts';
import { BY_BOOK } from './parts/by-book.ts';
import { CHASING } from './parts/chasing.ts';
import { CROSS_CHECK } from './parts/cross-check.ts';
import { FORECAST } from './parts/forecast.ts';
import { HEADLINE } from './parts/headline.ts';
import { HEADS_UP } from './parts/heads-up.ts';
import { HISTORY } from './parts/history.ts';
import { INSTALMENTS } from './parts/instalments.ts';
import { LEDGER } from './parts/ledger.ts';
import { NEXT_30 } from './parts/next30.ts';
import { QUEUE } from './parts/queue.ts';
import { RUNWAY } from './parts/runway.ts';

/**
 * MONEY IS A FINANCE PAGE, NOT A LEDGER OF WHO OWES WHOM. It leads with the money there is, then how long it lasts, then what comes in and goes out;
 * which way an amount goes is a property of the row, never the frame of the page.
 *
 * "i want the headlines to be the money i have, not the money im due/owed" (the owner). So the hero figure is Cash
 * now, read from the accounts, and every walk on this page starts from that same figure rather than from a balance typed into the page.
 *
 * ONE PAGE, SINCE money-core 3.0.0, AND IT WAS THREE: Overview, Ledger, and the house Home. Overview looked ahead
 * over bills, Ledger looked back over payments, and a person asking what happened to their money had to know which of the two answered it. A page holds no rows, so the two that retire take nothing
 * with them. IT NEEDS NO PEOPLE: who a row is with is a link (`LINKS` in `packs/first-party.ts`), and no block here
 * reads it, so Money installs and draws on a record with People off.
 *
 * FEWER, BIGGER TILES, SINCE money-core 3.3.0 ("i dont want a very 'busy' looking ui, rather very tailored and to the
 * point", October 2nd). Every tile answers one question and none answers another's: the thirty-day in and out are the
 * bridge's and no longer two more figures beside Cash now; what falls due is a calendar of the month ahead and not a
 * table beside it; where the money sits is Cash now cut by account, which adds up to the headline, and not a card an
 * account with the same balances again; and what agents and rules did is History's, where it is read whole. A tile
 * whose question has no answer on this record is not drawn (`when:`), so a fresh record reads its sentence, its cash
 * and the box to add an account, and a record with nothing late reads no word about lateness. Every tile's heading
 * wears a glyph (`icon:`), as the look asks (`loop/design/SYSTEM.md` §6).
 *
 * CALMER AGAIN, SINCE money-core 3.4.0 (DIRECTION §35): the line leads and no tile beside it says its figures again,
 * one view of the month is kept where there were three, and everything after Accounts is folded under Coming and
 * going, so the page a person reads each morning is the line, the walk, what needs them and where the money sits.
 *
 * ONE HEADS UP, SINCE money-core 3.5.0 (the visual review of October 2nd): an old balance, money late coming in and
 * money late going out are three lines of one tile under Accounts, each drawn only while it is true, where they were
 * three tiles a line tall.
 *
 * NO SPLIT THAT HOLDS NOTHING, SINCE money-core 3.8.0 (DIRECTION §37). An imported record on money-core 3.1.0 drew
 * thirteen account cards, six of them empty accounts that are not cash and sit in no book ("Welcome to Column N.A.").
 * Accounts on this page have been the parts of Cash now since 3.3.0, so such an account is never one: what is not
 * cash is left out, and a part at nought cuts no length of the track (`splitPlan` in `packages/render/src/split.ts`).
 * A split is drawn only while it has a part to cut, here and on a book's page, so a month with nothing spent and a
 * record whose accounts all stand at nought draw no empty track.
 *
 * THE PICTURE FIRST, SINCE money-core 3.11.0 (DIRECTION §39, the design review's fix 3). Money's first screen held
 * three questions drawn whole and no number: Cash ahead sat about 950px down. Now the walk leads the main column, and
 * a side column of four twelfths stands beside it (`layout: { rail: 4 }`): when the money runs out, in the figure's
 * own size and in the colour of a missed target, over the accounts that hold it, then the questions, which the app
 * draws compact in a side column (`asks.ts`). Heads up follows the walk, and what comes in and goes out is open under
 * it, with only the months behind and what already moved folded under History. When the money runs out is said once,
 * in its tile, and no longer in the line, which says what there is.
 *
 * WHETHER CASH NOW ADDS UP, SINCE money-core 3.17.0 (REC-A17): the record works Cash now out a second way, and while
 * the two disagree one tile under the walk says so in the danger colour and in words (`parts/cross-check.ts`). It is
 * not drawn at nought, so a record that is right reads no word about a check. With no balance typed there is nothing
 * to check and nothing is said of it: the box to add an account is what stands there.
 *
 * A LINE FOR TWO BOOKS, SINCE money-core 3.17.0: a record that keeps more than one book opens on how many books and
 * accounts its money is kept in (`parts/headline.ts`), where the app said its own filler because no block was the
 * lead. TWENTY-FOUR BLOCKS, THE MOST A PAGE DECLARES (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`): the line
 * took the place of the one that said no balance had been typed (`parts/cross-check.ts`).
 *
 * THE LEDGER, OPEN (REC-B15: "Ledger, add, edit, delete", "I hate this tabs"). The six newest entries stand in a tile
 * of their own under the walk and the accounts beside it, each line opening its entry (`parts/ledger.ts`), where
 * twelve were folded shut under History. History gave them up, so the page is still twenty-four blocks and says what
 * moved once. It stands before Heads up because a boxed section takes every block after it up to the next section,
 * and the Ledger is no line of a warning. The box that adds a movement is declared there and waits for room on the
 * page and for a capture that can ask for an account.
 */
export const MONEY_PAGE: SeedPage = {
  page: 'money',
  title: 'Money',
  nav: { section: 'Money', order: 10 },
  icon: 'money',
  requires: ['register.accounts', 'register.obligations', 'register.transactions', 'register.recurring', 'register.installments', 'register.categories', 'register.books', 'register.balances'],
  pack: 'money-core',
  /* A SIDE COLUMN, SINCE money-core 3.11.0, so a figure and the accounts under it stand beside the walk as one column
     of short tiles, and not as one tall tile stretched to the chart's height. A record with no account draws nothing
     in it, and the main column then takes the page. */
  layout: { rail: 4 },
  blocks: [
    ...HEADLINE,
    ...BY_BOOK,
    ...ADD_ACCOUNT,
    ...FORECAST,
    ...RUNWAY,
    ...ACCOUNTS_TILE,
    ...QUEUE,
    ...CROSS_CHECK,
    ...LEDGER,
    ...HEADS_UP,
    ...NEXT_30,
    ...INSTALMENTS,
    ...CHASING,
    ...HISTORY,
  ],
};
