/** Money's figures over the walk ahead: how long the money lasts, the day it runs out, what arrives and leaves. */

import type { SeedMetric } from '../../base.ts';
import { CASH_LEGS } from '../legs.ts';
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
    name: 'Coming in, 30 days',
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
    name: 'Going out, 30 days',
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
};
