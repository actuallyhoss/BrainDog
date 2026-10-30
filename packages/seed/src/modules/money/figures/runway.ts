/** Money's figures over the walk ahead: how long the money lasts, the day it runs out, what arrives and leaves. */

import type { SeedMetric } from '../../base.ts';
import { CASH_LEGS, OUT_LEGS } from '../legs.ts';
import { MONEY, RUNS_OUT_NEVER } from './shared.ts';

export const RUNWAY_FIGURES: Record<string, SeedMetric> = {
  /**
   * HOW LONG THE MONEY LASTS: the days from today until the walk from Cash now first goes under, over a year.
   *
   * A FIGURE WITH A VALUE HAS ALREADY GONE UNDER INSIDE THE YEAR IT WALKS, and one that stays above zero has no value and
   * no verdict, so the target is the whole year: any crossing misses it, and the page says so in words only when it
   * does. The walk is Cash ahead's own (`CASH_LEGS`), so the figure and the chart under it cross on the same day.
   */
  'runway-days': {
    metric: 'runway-days',
    name: 'Days the money lasts',
    /* MONEY'S BY NAME, because a figure over the walk reads no one list and the first-party split files a declaration
       by the list it reads (`firstPartyManifest`): unnamed, the walk figures would go to no pack at all. */
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    opening: { metric: 'cash-now' },
    value: { walk: 'days_to_zero', within: '365d' },
    format: 'days',
    target: { gte: 365 },
    window: '30d',
    compare: 'none',
    home: 2,
    /* REMEMBERED EACH NIGHT, SINCE money-core 3.2.0, so Lasts until draws how the days it lasts have moved over twelve
       weeks. A night the money lasts past the year has no value and writes no point, so the line is drawn only across
       the nights it did not, which is when it matters. */
    snapshot: { grain: 'day', into: 'series.runway-days' },
  },

  /**
   * HOW LONG THE CASH LASTS IF NOTHING COMES IN, SINCE money-core 3.17.0: the days from today until the walk from Cash
   * now goes under over the legs that take money off (`OUT_LEGS`), which is Cash ahead's walk with every line of money
   * in left out. Money's first sentence says it ("and it lasts 412 days with no income").
   *
   * IN DAYS AND NOT MONTHS because no figure is written in months: there is no `months` format, and a count of days
   * divided on the page would be a second arithmetic beside the walk's. Five years ahead, so a record that spends little
   * still reads a number; past five years, or across two currencies with no rate, it has no value and its clause drops.
   *
   * A TARGET NO READING MISSES, `gte: 0`, AND SO NO DANGER COLOUR: it is not a miss for money to run out once income
   * stops, it is the measure. `target: {}` is refused for a count of days (a bound or a setting, `evaluateMetric`), and a
   * walk opening below zero is day 0, which still meets it, as `arriving-30d`'s does.
   * NOT REMEMBERED EACH NIGHT, as `runs-out-on` is not: nothing draws its line.
   */
  'lasts-no-income': {
    metric: 'lasts-no-income',
    name: 'Days the money lasts with no income',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: OUT_LEGS,
    opening: { metric: 'cash-now' },
    value: { walk: 'days_to_zero', within: '1825d' },
    format: 'days',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE DAY THE MONEY RUNS OUT, SINCE money-core 3.12.0: the same crossing as `runway-days`, said as a day (`zero_on` in
   * `packages/kernel/src/money-figures.ts`), which is what the Runs out tile draws. A count of days read yesterday is
   * a day out by this morning, and "30 Oct" is the same on every screen that says it. Over the same legs from the same
   * opening, a year ahead, so it has a value exactly when `runway-days` does and names the day the walk's flag is on.
   *
   * ANY DAY IT NAMES IS A MISS, as any count is for `runway-days`. A day is held as whole days since 1970, and a bound
   * cannot say "a year from today", so the target is a day no walk of a year can reach, the first of 2100. It is never
   * said on a screen: the tile's note says the days left in its place.
   *
   * NOT REMEMBERED EACH NIGHT: the line `runway-days` keeps is how long the money lasts, and a day drawn as a line says
   * nothing a person reads.
   */
  'runs-out-on': {
    metric: 'runs-out-on',
    name: 'The day the money runs out',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    opening: { metric: 'cash-now' },
    value: { walk: 'zero_on', within: '365d' },
    format: 'day',
    target: { gte: RUNS_OUT_NEVER },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT COMES IN AND GOES OUT OVER THE NEXT THIRTY DAYS, AS THE WALK COUNTS IT, SINCE money-core 3.0.0.
   *
   * THE TILES READ THE WALK THE BRIDGE AND THE FORECAST DRAW, over the same legs, so none of them can disagree. Before
   * this a figure read one list and the walk beside it read three, and the page said "Coming in" twice over two numbers
   * GBP 2,400.00 apart; the tiles were renamed to the one list they could count ("Owed to you, 30 days") rather than
   * made right. A figure over `forecast.runway` adds up the walk's own steps (`packages/kernel/src/money-figures.ts`,
   * `readWalk`), so money late in is still coming and money late out is still leaving, both on today.
   */
  'arriving-30d': {
    metric: 'arriving-30d',
    name: 'To come in, next 30 days',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'in', within: '30d' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    /* REMEMBERED EACH NIGHT, SINCE money-core 3.2.0, for the tile's twelve-week line, as Cash now is. */
    snapshot: { grain: 'day', into: 'series.arriving-30d' },
  },

  'leaving-30d': {
    metric: 'leaving-30d',
    name: 'Bills and usual spending, next 30 days',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'out', within: '30d' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.leaving-30d' },
  },

  /**
   * WHAT THE WALK BRINGS IN AND TAKES OUT, MONTH BY MONTH, SINCE money-core 3.27.0: the months ahead of In and out, by
   * month (`pages/parts/history.ts`), read off the one walk Cash ahead draws and the runway counts (`CASH_LEGS`).
   *
   * THE MONTHS AHEAD READ TWO LISTS AND LEFT A THIRD OUT. They were bills due once (`out-due-by-month`) and what repeats
   * at its monthly share (`every-month-out`), so a part of a plan, which is neither, was in no month ahead: two parts
   * falling due in one month, most of the balance between them, drew that month with almost nothing going out, while the runway
   * beside the chart ran out on the day the larger one fell due. Now every month ahead is the walk's own steps in it:
   * bills, what repeats on the days it lands, every part of a plan, money on its way, subscriptions and everyday
   * spending, exactly what the line on Cash ahead moves by.
   *
   * FAR ENOUGH FOR THE THIRD MONTH AFTER THIS ONE TO BE WHOLE from any day of this one. NOT REMEMBERED EACH NIGHT: what
   * the walk says of a month ahead is tomorrow's walk to say again.
   */
  'in-ahead-by-month': {
    metric: 'in-ahead-by-month',
    name: 'Coming in, by month ahead',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'in', within: '125d' },
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-ahead-by-month': {
    metric: 'out-ahead-by-month',
    name: 'Going out, by month ahead',
    pack: 'money-core',
    source: 'forecast.runway',
    legs: CASH_LEGS,
    value: { walk: 'out', within: '125d' },
    bucket: 'month',
    format: MONEY,
    /* NO TARGET A SUM OF PAYMENTS COULD MISS, as `out-due-by-month` says it: a ceiling is a sum in a currency a pack
       cannot know. */
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
