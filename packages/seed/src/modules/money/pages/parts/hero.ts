/** Money's hero: the cash there is as one number, how long it lasts under it, the walk ahead beside it, and in and out for 30 days. */

/**
 * ONE SHORT LINE UNDER THE NUMBER, SINCE money-core 3.30.0: how far it moved in thirty days, then how old the rate that
 * added it up is, with the place the rates are kept. Each currency's own amount is on the Accounts page; under the number
 * it ran to two lines on a phone. A record kept in one currency has no rate, so there the second sentence goes whole.
 */
const CASH_NOW_SAID = '{{cash-now.moved}} on a month ago. Rate {{cash-now.rate_age}} · [Update](/r/fx)';

/**
 * HOW LONG IT LASTS IS ONE LINE UNDER THE NUMBER, BEFORE money-core 3.33.0 SHIPPED (design pass of 1 November, M23):
 * "Lasts 30 Oct" in one cell beside "If nothing comes in 19 days" in the next read as two answers to one question. Now
 * the hero says the one the Forecast page opens on, the walk with what is due and expected: "Lasts until 30 Oct (57
 * days)". With nothing coming in is the Forecast page's own view. A walk that lasts the year has no day, so the
 * sentence goes whole (`noteOf`) and the page's line says it lasts the year (`headline.ts`).
 */
const LASTS_LINE = 'Lasts until {{runs-out-on}} ({{runway-days}}).';

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
      { metric: 'cash-now', label: 'Cash now', trend: '12w', ahead: 'runway-days', note: `${LASTS_LINE} ${CASH_NOW_SAID}` },
      /* IN AND OUT FOR THE NEXT 30 DAYS, the two figures under the one big number. Each said with the way it goes, "+" in
         and "−" out, as Today's Cash ahead says them (AM1). */
      { metric: 'arriving-30d', label: 'In, next 30 days', sign: 'in' },
      /* WHAT THE FIGURE HOLDS IS ITS NAME (live check of 30 October, 9): bills, plans and the usual everyday spending, so it
         never reads as Coming up's repeating bills a month, a far smaller figure under a name alike. */
      { metric: 'leaving-30d', label: 'Out, next 30 days', note: 'Bills and usual spending', sign: 'out' },
    ],
    when: { metric: 'cash-accounts', gt: 0 },
  },
];
