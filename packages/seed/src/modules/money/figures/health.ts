/** Money's health figures: how much of what comes in is kept, how many months the cash lasts, and how much is held in other currencies. */

import type { SeedMetric } from '../../base.ts';
import { ROLLED } from '../legs.ts';
import { MONEY } from './shared.ts';

/** What moved, as every figure of the Ledger counts it: cleared and not between a person's own accounts. */
const MOVED = 'state is cleared, transfer is false, stays is not true, corrects is not true';

/**
 * HOW HEALTHY THE MONEY IS, SINCE money-core 3.29.0, and the month so far each way, which Reports opens on.
 *
 * KEPT, NINETY DAYS: of the money that came in, the share not spent again, over the same rows in one reading. The top
 * half is money in less money out, each amount signed by its own way (`sign`); the bottom half is money in alone, the
 * money out counted as nought (`in_only`). One source and one sentence, so the two halves cannot be read over two sets
 * of rows, and a quarter where more went out than came in reads below nought, which is what it is. Ninety days and not
 * thirty, because one pay day either side of a month's edge would swing a month's share from nought to most of it. A
 * quarter with nothing in reads nothing, never nought: a per-half of nought answers no value.
 *
 * A FIFTH OR MORE KEPT IS THE MARK, the share a household that saves aims at, and no currency is named by it.
 *
 * HOW LONG THE CASH LASTS IS NOT A FIGURE HERE: `lasts-no-income` (`figures/runway.ts`) already walks Cash now down
 * by everything that goes out with nothing coming in, in days, and Reports' Health reads that one.
 *
 * WHAT IS HELD IN OTHER CURRENCIES, SINCE money-core 3.29.0: of Cash now, the share in a currency other than the home
 * one, both halves converted at the rates held (`read: 'foreign'`, `foreignShare` in
 * `packages/kernel/src/money-figures.ts`). The same accounts and the same roll as Cash now. Two currencies and no home
 * one, or a rate missing, reads nothing rather than a share of a part; one currency and no home one reads nought. No target a share could miss: holding dollars is a choice.
 *
 * THE MONTH SO FAR, EACH WAY: money in since the first, and money out, which is `spent-by-category-month`'s whole.
 */
/**
 * THE MONTHS REPORTS' STRIP PICKS, EACH WITH ITS OWN IN, OUT AND LEFT (live check of 30 October, 20): the page's line said
 * "This month: …" over a donut of twelve months with All picked. Each range is the strip's own sentence over `on`
 * (`pages/reports.ts`), and the line says the one picked (`when: { picked: months }`). This month is `received-month`,
 * `spent-by-category-month` and `left-month`, declared before these.
 */
export const REPORT_RANGES: Readonly<Record<string, { words: string; where: string }>> = {
  last: { words: 'last month', where: 'on at least bom-1m, on before bom' },
  three: { words: 'the last 3 months', where: 'on at least bom-2m' },
  year: { words: 'the last 12 months', where: 'on at least bom-11m' },
  all: { words: 'the last 13 months', where: 'on after -13m, on before +1d' },
};

const RANGE_FIGURES: Record<string, SeedMetric> = Object.fromEntries(
  Object.entries(REPORT_RANGES).flatMap(([key, { words, where }]): [string, SeedMetric][] => [
    [`received-${key}`, { metric: `received-${key}`, name: `Money in, ${words}`, source: 'register.transactions', where: `${MOVED}, direction is in, ${where}`, value: { sum: 'amount' }, format: MONEY, target: { gte: 0 }, window: '30d', compare: 'none' }],
    [`spent-${key}`, { metric: `spent-${key}`, name: `Money out, ${words}`, source: 'register.transactions', where: `${MOVED}, direction is out, ${where}`, value: { sum: 'amount' }, format: MONEY, target: { gte: 0 }, window: '30d', compare: 'none' }],
    [
      `left-${key}`,
      {
        metric: `left-${key}`,
        name: `Left over, ${words}`,
        source: 'register.transactions',
        where: `${MOVED}, ${where}`,
        value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
        lookups: { sign: { in: 1, out: -1 } },
        format: MONEY,
        target: { gte: 0 },
        window: '30d',
        compare: 'none',
      },
    ],
    /* AND HOW FAR OUT WENT PAST IN, SINCE money-core 3.37.0 (verify3, 2 Nov): Reports said "−$12,536 left" of a range
       that spent more than came in. The same sum turned over, read only where `left-` is under nought. */
    [`over-${key}`, overOf(`over-${key}`, `More out than in, ${words}`, where)],
  ]),
);

/** What went out past what came in over `where`: `left-`'s sum with its sign turned, so a range that overspent says it as a positive amount. */
function overOf(metric: string, name: string, where: string): SeedMetric {
  return {
    metric,
    name,
    source: 'register.transactions',
    where: `${MOVED}, ${where}`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: { in: -1, out: 1 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  };
}

/**
 * THE FIRST DAY MONEY MOVED IN REPORTS' WHOLE WINDOW (finish F55), the day its All line starts from: "The last 13 months"
 * stood over three months of lines, so the line says the day the Ledger's lines start, inside the thirteen months.
 */
const MOVED_SINCE: Record<string, SeedMetric> = {
  'moved-since': {
    metric: 'moved-since',
    name: 'First money moved, the last 13 months',
    source: 'register.transactions',
    where: `${MOVED}, ${REPORT_RANGES.all!.where}`,
    value: { min: 'on' },
    format: 'day',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

export const HEALTH_FIGURES: Record<string, SeedMetric> = {
  ...MOVED_SINCE,
  'kept-share-90d': {
    metric: 'kept-share-90d',
    name: 'Kept of money in, 90 days',
    source: 'register.transactions',
    where: `${MOVED}, on after -90d, on before +1d`,
    value: {
      ratio: {
        of: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
        per: { sum: { product: ['amount', { lookup: 'in_only', by: 'direction' }] } },
      },
    },
    lookups: { sign: { in: 1, out: -1 }, in_only: { in: 1, out: 0 } },
    format: 'pct',
    target: { gte: 0.2 },
    window: '90d',
    compare: 'none',
  },

  /**
   * WHAT INSTALMENTS TAKE A MONTH, SINCE money-core 3.31.0: every part still to pay in the next twelve months, a twelfth
   * of it, so a plan paid each quarter is read at its monthly share as a yearly premium is (`every-month-out`). A part
   * already late is in it, since it still has to be paid.
   */
  'installments-a-month': {
    metric: 'installments-a-month',
    name: 'Instalments, a month',
    source: 'register.installments',
    where: 'state is open, direction is out, due before +366d',
    value: { sum: { product: ['amount', { lookup: 'twelfth', by: 'direction' }] } },
    lookups: { twelfth: { out: 1 / 12 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT ACTUALLY CAME IN A MONTH, SINCE money-core 3.32.0: the money received over the last three whole months, a third
   * of it, moves between a person's own accounts left out (`MOVED`). Three months and not one, so a pay day either side of
   * a month's edge does not halve or double it; whole months, so the month under way does not pull it down.
   */
  'received-a-month': {
    metric: 'received-a-month',
    name: 'Money in, a month',
    source: 'register.transactions',
    where: `${MOVED}, direction is in, on at least bom-3m, on before bom`,
    value: { sum: { product: ['amount', { lookup: 'third', by: 'direction' }] } },
    lookups: { third: { in: 1 / 3 } },
    format: MONEY,
    target: { gte: 0 },
    window: '90d',
    compare: 'none',
  },

  /**
   * WHETHER THE THREE MONTHS ARE ALL THERE: money in during the first of them. A Ledger started last month holds nothing
   * there, and a third of one month's money would read as a month's, so the share is not said until it holds some.
   */
  'received-three-months-back': {
    metric: 'received-three-months-back',
    name: 'Money in, three months back',
    source: 'register.transactions',
    where: `${MOVED}, direction is in, on at least bom-3m, on before bom-2m`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT IS SPOKEN FOR A MONTH, AS MONEY, SINCE money-core 3.32.0: the top half of `spoken-for-share`, said when it is
     more than came in, where a share past a hundred says less than the two amounts do. */
  'spoken-for-month': {
    metric: 'spoken-for-month',
    name: 'Spoken for, a month',
    source: 'register.recurring',
    value: { sum_of: [{ metric: 'every-month-out' }, { metric: 'installments-a-month' }] },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * HOW MUCH OF WHAT COMES IN IS SPOKEN FOR, SINCE money-core 3.31.0 (round 1030, over-leverage): what goes out every
   * month without anybody deciding again, the repeating lines and the instalments, as a share of what actually came in a
   * month (`received-a-month`, since 3.32.0). It read repeating money in until then, which a real life often keeps
   * little of or none, and a scratch record said "2,027%". Beside `kept-share-90d`, which is the past, this is what is
   * already promised. Half or less is the mark: past it, a month with one pay day missing cannot meet what is owed. Both
   * halves in one currency or no share at all (`ratio_of`, `packages/kernel/src/metrics.ts`).
   */
  'spoken-for-share': {
    metric: 'spoken-for-share',
    name: 'Spoken for of money in, a month',
    source: 'register.recurring',
    value: {
      ratio_of: {
        of: [{ metric: 'every-month-out' }, { metric: 'installments-a-month' }],
        per: [{ metric: 'received-a-month' }],
      },
    },
    format: 'pct',
    target: { lte: 0.5 },
    window: '30d',
    compare: 'none',
  },

  'cash-foreign-share': {
    metric: 'cash-foreign-share',
    name: 'Cash in other currencies',
    source: 'register.accounts',
    /* CASH NOW'S OWN ACCOUNTS (`figures/cash.ts`). */
    where: 'liquid is true, state is not closed',
    value: { rolled: { ...ROLLED.rolled, read: 'foreign' } },
    format: 'pct',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'received-month': {
    metric: 'received-month',
    name: 'Money in this month',
    source: 'register.transactions',
    where: `${MOVED}, direction is in, on at least bom`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'left-month': {
    metric: 'left-month',
    name: 'Left over this month',
    source: 'register.transactions',
    where: `${MOVED}, on at least bom`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: { in: 1, out: -1 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'over-month': overOf('over-month', 'More out than in this month', 'on at least bom'),
  ...RANGE_FIGURES,
};
