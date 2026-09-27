/**
 * `homeCurrency`: the record's own currency, for a caller outside the kernel that has to say it.
 *
 * WHY THE RECORD ASKS. `boot` answers `record.currency` (`loop/finish/contracts.md` §7.4), and the web prints every
 * amount on the home currency's terms: its symbol first, any other currency with its code after. The web derived it
 * from the rows it happened to hold (`apps/web/src/lib/record/api.ts` `homeCurrency`), which is a guess about a choice
 * the record already has. The currency is a setting a person chose, read by the same function every figure is added up
 * with (`declare.ts` `homeCurrency`), so the shell and the figures cannot name two different ones.
 *
 * `null` WHEN NOBODY HAS CHOSEN ONE, never a fallback. A record with no home currency writes each amount in its own.
 *
 * `figureLists`: every list one figure reads, for the record's `metric` and `figures` to hold a figure back by.
 *
 * WHY THE RECORD ASKS THIS TOO. Both methods asked `readable` of a figure's `source` alone, and a figure's source is no
 * longer the whole of what it reads: a cash figure rolled forward reads its moves and its balance checks beside its
 * accounts, and `forecast.runway` names no list at all while its legs walk several. Asked of the source, a member
 * invited to Accounts would be answered the sum of the Transactions she cannot open. The walk over the declaration is
 * `money-figures.ts` `figureLists`, the one `pages.ts` holds a block back by, so a figure and a page cannot disagree.
 */

import { homeCurrency } from '../declare.ts';
import type { MetricDecl } from '../metrics.ts';
import { figureLists } from '../money-figures.ts';
import type { KernelParts } from '../parts.ts';

export function extension(parts: KernelParts) {
  /** A figure declared on this record, by the id without its `metric.`, or `null`; its body is read as it is held. */
  const figure = (id: string): MetricDecl | null => {
    const held = parts.declarations().find((d) => d.kind === 'metric' && d.id === `metric.${id}`);
    return held ? (JSON.parse(held.body) as MetricDecl) : null;
  };
  return {
    /** The home currency a pack's `home_currency` setting names, read now, or `null` when none is set. */
    homeCurrency(): string | null {
      return homeCurrency(parts.sql);
    },
    /**
     * Every list `decl` reads, the figure a walk opens from included. A caller asks `readable` of each and answers
     * `METRIC_UNKNOWN` when any one is out of reach, as it did for the source alone.
     */
    figureLists(decl: MetricDecl): string[] {
      return figureLists(decl, figure);
    },
  };
}
