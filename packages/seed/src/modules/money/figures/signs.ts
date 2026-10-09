/**
 * Money's signs of life, SINCE money-core 3.15.0 (REC-B01 job 3): figures that say whether Money is being kept, not what
 * it holds. "i see no progress" (DIRECTION 40): his Money page said the oldest balance was from 3 September and no screen
 * said the Ledger stopped on 28 September.
 *
 * `ledger-rows-7d` came first, in 3.15.0, because it was the one sentence the record could read then. THREE MORE CAME
 * IN 3.16.0, once the kernel read the words they need (`packages/kernel/src/metrics.ts`, `AGGREGATIONS`):
 * - `ledger-newest-days`, the age of the newest Ledger row: `{ age: 'on' }`, today less the latest `on` in whole days.
 *   `{ max: 'on' }` is a day, not an age, and would read as twenty thousand.
 * - `currencies-held`, how many currencies the accounts are kept in: `{ currencies: 'balance' }` reads the currency
 *   alone, where `distinct` on a money field counts amount and currency together.
 * - `uncategorised-share-30d`, of 30 days' money out the share with no category: `{ empty: 'category' }` per every row,
 *   both halves over the one `where`.
 *
 * TWO MORE IN THE SAME 3.16.0, which was never released:
 * - `statement-oldest-days`, how many days old the oldest liquid account's balance is, read from the newest statement
 *   each account restarts from (`rolled.read: 'age'`, REC-B03), so a bank message's balance after counts.
 * - `nights-missed-30d`, of the last 30 nights how many kept no point on the cash line (`series.cash-now` read as
 *   `{ count: 'missing' }`). It waited until `figureLists` (`money-figures.ts`) named the lists Cash now reads for its
 *   line, so a member who may not see Cash now is not shown how many nights it missed either.
 */

import type { SeedMetric } from '../../base.ts';
import { ROLLED } from '../legs.ts';

export const SIGNS_FIGURES: Record<string, SeedMetric> = {
  /**
   * HOW MANY LEDGER ROWS ARE DATED IN THE LAST SEVEN DAYS, cleared ones only, as every Ledger figure counts. A transfer
   * counts: it is not spending, but it is money somebody kept a note of, which is what this asks. `on after -7d` is today
   * and the six before it (`after` leaves out its own day), and `on before +1d` leaves out a row dated ahead.
   *
   * A COUNT, NEVER A SUM, so no two currencies meet in it. NOUGHT IS NOT GOOD: the target is at least one, so a Ledger
   * that has stopped, or a record that has never kept one, reads as missing its mark and never as a quiet week.
   */
  'ledger-rows-7d': {
    metric: 'ledger-rows-7d',
    name: 'Kept on the Ledger, 7 days',
    source: 'register.transactions',
    where: 'state is cleared, on after -7d, on before +1d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 1 },
    window: '7d',
    compare: 'none',
  },

  /**
   * HOW MANY DAYS OLD THE NEWEST CLEARED LEDGER ROW IS, to the reading's own day. Three or fewer is kept; a Ledger that
   * stopped on 28 September reads its age, and an empty Ledger reads nothing, never nought.
   */
  'ledger-newest-days': {
    metric: 'ledger-newest-days',
    name: 'Newest on the Ledger',
    source: 'register.transactions',
    where: 'state is cleared, on before +1d',
    value: { age: 'on' },
    format: 'days',
    target: { lte: 3 },
    window: '30d',
    compare: 'none',
  },
  /** HOW MANY CURRENCIES THE ACCOUNTS ARE KEPT IN, the currency of each balance alone. At least one. */
  'currencies-held': {
    metric: 'currencies-held',
    name: 'Currencies held',
    source: 'register.accounts',
    value: { currencies: 'balance' },
    format: 'int',
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  },
  /**
   * OF 30 DAYS' MONEY OUT, THE SHARE WITH NO CATEGORY, transfers left out. A fifth or less is kept. A month with nothing
   * out reads nothing: a per-half of nought answers no value.
   */
  'uncategorised-share-30d': {
    metric: 'uncategorised-share-30d',
    name: 'Out with no category, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -30d',
    value: { ratio: { of: { empty: 'category' }, per: { count: 'id' } } },
    format: 'pct',
    target: { lte: 0.2 },
    window: '30d',
    compare: 'none',
  },
  /**
   * HOW MANY DAYS OLD THE OLDEST BALANCE IS, over the accounts Cash now adds up. A week or less is kept; an account no
   * statement ever confirmed reads nothing, never nought, as it has no day to be old from.
   */
  'statement-oldest-days': {
    metric: 'statement-oldest-days',
    name: 'Oldest balance',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { rolled: { ...ROLLED.rolled, read: 'age' } },
    format: 'days',
    target: { lte: 7 },
    window: '30d',
    compare: 'none',
  },
  /**
   * OF THE LAST 30 NIGHTS, HOW MANY KEPT NO POINT OF CASH NOW. Two or fewer is kept; a line not begun reads nothing.
   * `pack` NAMES ITS HOME, as a walk's figures do: a kept line names no list, so the split would leave it in no pack.
   */
  'nights-missed-30d': {
    metric: 'nights-missed-30d',
    pack: 'money-core',
    name: 'Nights the cash line missed',
    source: 'series.cash-now',
    value: { count: 'missing' },
    format: 'int',
    target: { lte: 2 },
    window: '30d',
    compare: 'none',
  },
};
