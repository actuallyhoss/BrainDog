/** Money's hero: the cash there is as one number, the walk ahead beside it, and the four answers under it. */

import { LASTS_SAID, ON_WHAT_IS_DUE } from './runway.ts';

/**
 * ONE SHORT LINE UNDER THE NUMBER, SINCE money-core 3.30.0: how far it moved in thirty days, then how old the rate that
 * added it up is, with the place the rates are kept. Each currency's own amount is on the Accounts page; under the number
 * it ran to two lines on a phone. A record kept in one currency has no rate, so there the second sentence goes whole.
 */
const CASH_NOW_SAID = '{{cash-now.moved}} on a month ago. Rate {{cash-now.rate_age}} · [Update](/r/fx)';

/**
 * ONE NUMBER FIRST, SINCE money-core 3.29.0. Money opened on a sentence and a chart a screen tall, with the answers in a
 * side column. Now one tile leads the page: Cash now in the figure's own size, the cash walk drawn small beside it over
 * the next twelve weeks with today and its lowest point marked (`ahead: runway-days`, the walk Cash ahead and Today
 * draw), its change on a month ago, and the money in each currency it is kept in. Under it, the four answers a person
 * opens Money for: when it runs out on what is due, how long it lasts with nothing coming in and why, and what comes in
 * and goes out in the next thirty days, each the walk's own figure, so the hero and the Forecast page cannot disagree.
 *
 * `lead: true` MAKES THE FIRST FIGURE THE SCREEN'S ONE HERO (`PageBlock.lead` in `packages/kernel/src/pages.ts`), and the
 * tile takes the whole row whatever the tiles after it pair into. A cell whose figure has no value is not drawn, so a
 * record whose money lasts the year reads no day it runs out, and its line says it lasts the year instead
 * (`headline.ts`).
 *
 * ONCE THERE IS AN ACCOUNT: with none, the box to add one stands in its place (`add-account.ts`).
 */
export const HERO: Record<string, unknown>[] = [
  {
    kind: 'stat',
    lead: true,
    span: 12,
    cells: [
      { metric: 'cash-now', label: 'Cash now', trend: '12w', ahead: 'runway-days', note: CASH_NOW_SAID },
      { ...ON_WHAT_IS_DUE, label: 'Lasts', note: 'In {{runway-days}}' },
      { ...LASTS_SAID, label: 'If nothing comes in' },
      { metric: 'arriving-30d', label: 'To come in, next 30 days' },
      /* WHAT THE FIGURE HOLDS IS ITS NAME (live check of 30 October, 9): bills, plans and the usual everyday spending, so it
         never reads as Coming up's repeating bills a month, a far smaller figure under a name alike. */
      { metric: 'leaving-30d', label: 'Bills and usual spending, next 30 days' },
    ],
    when: { metric: 'cash-accounts', gt: 0 },
  },
];
