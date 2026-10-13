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
 *
 * ONE MORE IN 3.17.0 (REC-B11 step 8):
 * - `repeating-overdue`, how many live repeating lines have a "Next" more than three days gone. `settle` moves "Next"
 *   when a payment is matched to the line, and until this nothing said when one was not. In the same unreleased 3.17.0
 *   (repeating-sign-fix-69, audit 67 claim 1) it counts only a line a payment was matched to before, so a line just
 *   added is not judged by a day nothing could have moved. And it is named for that, "Matched repeating lines past
 *   their day" (repeating-sign-72, audit 69 finding 5): a line nothing was matched to is not counted, so its nought is
 *   no word on those. And with no matched line to read it says no value (audit 72 finding 5), so a record whose lines
 *   were never matched is not shown a mark it met; with matched lines and none past its day it says 0 and met, since
 *   the day is counted (`past`) and no longer in the `where` (signs-metric-75-76, repeating-overdue-past-78).
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
   * that has stopped reads as missing its mark and never as a quiet week; one that has never held a row is not judged.
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
    where: 'liquid is true, state is not closed',
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
  /**
   * HOW MANY LIVE REPEATING LINES HAVE A NEXT MORE THAN THREE DAYS GONE. Money's `settle` script moves "Next" one cycle
   * on when a payment is matched to the line, so a day left behind is a payment that did not come, came unmatched, or a
   * line nobody ended. `{ past: 'next_due', by: '3d' }` counts what `next_due before -3d` selects, so it leaves out the
   * third day itself: three days is what a payment takes to land and be matched, the same three the Ledger's own age is
   * allowed.
   *
   * ONLY A LINE A PAYMENT WAS MATCHED TO BEFORE, `last_paid is set`. Nothing links an arriving payment to a repeating
   * line by itself: "Settles" points at Bills alone, and a line is matched when a person or an agent runs `settle` on
   * it. So on a line nobody has matched, "Next" stands still whether the money went or not, and the count was red four
   * days after Money watch added a line, with nothing to press. A line with a "Last paid" is one whose payments are
   * matched, and its "Next" gone by is a payment that was not.
   *
   * NOT YET WHAT WAS ASKED, which is a line with no cleared payment on its account for its amount since three days
   * before its "Next". A `where` cannot say it: no ref goes from a Ledger entry to a line for `pointed` to follow, a
   * day is read from today and never from the row's own "Next", and no test holds one field against another. And the
   * mark cannot be taken off in its place, since a figure with no target is refused. So a line never matched whose
   * money truly stopped is not counted here; the question on its day asks about it (`rules.ts`, "Did it go through?").
   *
   * SO THE NAME SAYS MATCHED LINES, AND NOUGHT IS NOT "NOTHING STOPPED" (repeating-sign-72, audit 69 finding 5). A line
   * Money watch wrote (`packs/money-watch/repeats.js`, `add`) has no "Last paid", and the one thing that writes one is
   * `settle` (`scripts/settle.js`), which nobody runs by itself. On a record where no payment was ever matched to a
   * line, every line is left out and this reads 0 whatever stopped: it is blind there, not clean. Under its first
   * name, which said repeating lines and nothing of matched, that 0 read as every line watched, which it never was. It
   * counts the matched lines and is named for them; the id was left as it was, so nothing that reads it moves. (The first name is spelled in the test
   * alone, which holds that the seed never writes it.)
   * A page that draws it says matched too, and never offers it as a watch on every repeating line.
   *
   * AND WITH NONE TO READ IT SAYS NO VALUE, NEVER NOUGHT (audit 72 finding 5). The name was not enough: the blind
   * record still read 0 and met its mark, a clean answer from a sign that saw none of its lines. So the count is read
   * per the states its lines are in, the way `uncategorised-share-30d` above reads nothing for a month of nothing. The
   * `where` keeps live lines alone, so that is one state when a line is read, and the figure is the count itself, a
   * whole number; with no line read it is none, a ratio over nought answers no value, and no value has no verdict.
   *
   * AND THE KEPT RECORD GETS ITS NOUGHT BACK (signs-metric-75-76, repeating-overdue-past-78). While the day sat in the
   * `where` beside the rest, the two halves of the ratio shared it, so "every matched line is on time" and "no line
   * was ever matched" were both no line, and the sign said nothing of a record that was kept. Now the `where` says WHO
   * IS JUDGED, the live lines a payment was matched to before, and the count says HOW MANY OF THOSE ARE LATE (`past`,
   * `packages/kernel/src/metrics.ts`). Matched lines and none past its day is 0 over one state: 0, and met. No matched
   * line is still nought over nothing: no value, no verdict, so the blind record is as silent as before. A matched
   * line with no "Next" is not late.
   *
   * `past` IS WRITTEN FIRST AND READ BY NAME. A record keeps a declaration's keys in order, so this comes back
   * `{ by, past }`, and the kernel finds the kind by the key that is an aggregation, wherever it sits. The test reads
   * the figure both ways, as written here and as a record holds it, and holds them to one answer.
   *
   * A paused or ended line is not waiting for anything and is left out. A COUNT, NEVER A SUM, so no two currencies meet
   * in it. None is still the mark, so one stuck line misses it; a record with no repeating lines is not judged.
   */
  'repeating-overdue': {
    metric: 'repeating-overdue',
    name: 'Matched repeating lines past their day',
    source: 'register.recurring',
    where: 'state is live, last_paid is set',
    value: { ratio: { of: { past: 'next_due', by: '3d' }, per: { distinct: 'state' } } },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
