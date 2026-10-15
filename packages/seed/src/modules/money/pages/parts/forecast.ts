/** Cash ahead: the walk from Cash now, with the lengths a person picks. */

import { CASH_LEGS } from '../../legs.ts';

export const FORECAST: Record<string, unknown>[] = [
  {
    /* HOW LONG THE MONEY LASTS: cash remembered up to today, then the walk from Cash now, a repeating row
       spent every time it comes round. A reader can ask what if clients pay later, what if there is
       spending the record does not know, or what if a large movement does not happen; the answer is
       arithmetic over the same walk, and nothing is written. Every movement is in the fold under it.
       Drawn once there is cash to walk from: with no account, Cash now has no value and the line no start. */
    kind: 'forecast',
    heading: 'Cash ahead',
    icon: 'chart-line',
    /* THE WHOLE OF THE MAIN COLUMN, SINCE money-core 3.11.0: eight twelfths of the page, with when the money runs out
       and the accounts holding it in the side column beside it. It was the whole width from 3.4.0. */
    span: 12,
    source: 'forecast.runway',
    opening: { metric: 'cash-now' },
    recorded: 'cash-now',
    /* THE LEGS ARE THE LISTS THAT HOLD A DATED AMOUNT (`CASH_LEGS`), the one array the tiles above walk too. A runway
       that is too high is the direction this block must never be wrong in, because a person reads it to decide what
       to shut down, so every list that moves money on a day is a leg: bills, what repeats, instalments, money on its
       way, and subscriptions where Estate is held. */
    from: CASH_LEGS,
    /* THREE MONTHS FIRST, SINCE money-core 3.7.0, AND EVERY LONGER LENGTH STILL ON THE KNOB. The question a person
       asks of cash is the next few months, and a year down to −£150k was a picture of a year nobody plans. Opening on
       90 days was tried for 3.6.0 and took the knob away with it, because the record walked only as far as the chart
       opened; it now walks to the longest of `horizons:` and says so (`reach`), and the renderer offers every length
       up to that (`horizonChoices` in `packages/render/src/forecast.ts`), so 180, 365 and 730 days are a press away.
       TWO YEARS AT MOST at 3.9.0, since the record walked the longest length on every load, so five years and `last`
       (as far as ten) made each opening of Money walk twenty times the three months it draws (research audit 11-13).
       FIVE YEARS AND TO THE END AGAIN SINCE money-core 3.10.0, because the record now walks two years at most unasked
       (`WALK_UNASKED` in `packages/kernel/src/pages.ts`) and walks further only when a reader picks a longer length,
       which the page asks for (`RenderOptions.walk`). So a load still walks two years, and a plan that runs past them
       can be read to its end (research audit 16, H1).
       TEN WEEKS FIRST, SINCE THE UNRELEASED money-core 3.17.0 (REC-B08): the span a person acts on, the next few pay
       days and the bills before them, with three months and every longer length still one press away. The walk is
       unchanged, two years unasked, so opening shorter costs nothing and takes nothing off the knob. */
    horizon: 70,
    horizons: [70, 90, 180, 365, 730, 1825, 'last'],
    /* THE VALUE AXIS FITS THE WALK (REC-B08), starting just under its lowest balance, so ten weeks of a balance far
       above nought still shows which way it moves. `fit` is what saying nothing draws today; said here so a change of
       the renderer's default does not flatten Money's chart. */
    axis: 'fit',
    /* COUNTING A PLAN OR A STREAM IN OR OUT IS ONE CONTROL, `count`, and `leave` is folded into it: two controls over
       the same streams with opposite meanings was one question asked two ways. Drift draws a slider only for a pair
       some step was converted through, so a record in one currency sees none. `sell` offers what a pack declares
       `sellable` (the holdings pack's figures), and draws nothing on a record that holds none. */
    knobs: ['horizon', 'late', 'spend', 'count', 'grow', 'drift', 'sell'],
    /* THE LATE KNOB MARKS HOW LATE MONEY HAS COME IN, and the chart says how many days are left when the
       walk goes under inside a month. */
    late: 'days-late-in',
    under: 30,
    /* THE PAGE ALREADY SAYS WHEN IT RUNS OUT, SINCE money-core 3.6.0, so the chart leaves its own sentence off and
       keeps the flag on the day. Money said one fact three times: "runs out in 57 days" over "Goes under on 30 Oct"
       over a flag reading 30 Oct. The line said it until 3.11.0, and the tile beside the chart says it now. With two
       books there is no line, and the record answers no `headline` (`headlineHeld` in
       `packages/kernel/src/pages.ts`), so the chart says it again. */
    headline: 'under',
    when: { metric: 'cash-accounts', gt: 0 },
    empty: 'Nothing is dated ahead yet.',
  },
];
