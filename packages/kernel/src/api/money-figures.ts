/**
 * `homeCurrency`: the record's own currency, for a caller outside the kernel that has to say it.
 *
 * WHY THE RECORD ASKS. `boot` answers `record.currency`, and the web prints every amount on the home currency's terms:
 * its symbol first, any other currency with its code after. The web derived it from the rows it happened to hold
 * (`apps/web/src/lib/record/api.ts` `homeCurrency`), which is a guess about a choice the record already has. The
 * currency is a setting a person chose, read by the same function every figure is added up with (`declare.ts`
 * `homeCurrency`), so the shell and the figures cannot name two different ones.
 *
 * `null` WHEN NOBODY HAS CHOSEN ONE, never a fallback. A record with no home currency writes each amount in its own.
 *
 * `moneyCurrencies`: the currencies the record's money is written in, for `boot` to name the one a record that chose
 * none is drawn in. Nobody chose, but a record whose every amount is sterling has nothing left to choose between, and the
 * web asked it one list and two rows a money field at a time before the first screen (`boot-live.ts` `readImplied`).
 *
 * `figureLists`: every list one figure reads, for the record's `metric` and `figures` to hold a figure back by.
 *
 * WHY THE RECORD ASKS THIS TOO. Both methods asked `readable` of a figure's `source` alone, and a figure's source is no
 * longer the whole of what it reads: a cash figure rolled forward reads its moves and its balance checks beside its
 * accounts, and `forecast.runway` names no list at all while its legs walk several. Asked of the source, a member
 * invited to Accounts would be answered the sum of the Transactions she cannot open. The walk over the declaration is
 * `money-figures.ts` `figureLists`, the one `pages.ts` holds a block back by, so a figure and a page cannot disagree.
 */

import { jsonPath, unprivate } from '@braindog/where';

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
     * The currencies the money on the lists `reads` admits is in, sorted, stopping at `most` (the second by default): a
     * record in two is answered two and no more, because one currency is the only answer `boot`'s home draws with. A
     * caller that quotes them all (the rates preset, up to `RATES_CURRENCIES_MOST`) asks for one more than it can quote.
     * Every list when `reads` is absent; a list the caller may not open adds nothing, so its money says nothing about it. With a `viewer`, a row kept private to somebody else adds nothing either.
     *
     * EACH LIST'S ANSWER IS HELD WHILE THE LIST STANDS (`heldFacts`), by the list, the field, the viewer and how many were
     * asked: three scans of a whole ledger on every `boot` after any write anywhere, when a currency new to a list only
     * ever comes with a write to that list. Who may read a list is asked each time, above the hold, so a member's lists
     * narrowed or a row kept private (which the lists' version moves on) is never answered from before it.
     */
    moneyCurrencies(reads: (register: string) => boolean = () => true, most = 2, viewer?: string): string[] {
      const found = new Set<string>();
      const held = parts.heldFacts();
      for (const d of parts.declarations()) {
        if (d.kind !== 'register' || !d.id.startsWith('register.')) continue;
        const list = parts.register(d.id.slice('register.'.length));
        if (!list || !reads(list.id)) continue;
        for (const f of list.fields) {
          if (f.type !== 'money') continue;
          const at = `json_extract(fields, '${jsonPath(f.id)}.currency')`;
          const here = held(JSON.stringify(['currencies', list.id, f.id, viewer ?? null, most]), () =>
            parts.sql
              .all<{ c: unknown }>(
                `SELECT DISTINCT ${at} AS c FROM entry WHERE register = ? AND deleted_at IS NULL AND ${at} IS NOT NULL${viewer === undefined ? '' : ` AND ${unprivate()}`} LIMIT ?`,
                list.id,
                ...(viewer === undefined ? [] : [viewer]),
                most,
              )
              .map((r) => r.c)
              .filter((c): c is string => typeof c === 'string' && /^[A-Z]{3}$/u.test(c)),
          );
          for (const c of here) found.add(c);
          if (found.size >= most) return [...found].sort().slice(0, most);
        }
      }
      return [...found].sort();
    },
    /**
     * Every list `decl` reads, the figure a walk opens from included. A caller asks `readable` of each and answers
     * `METRIC_UNKNOWN` when any one is out of reach, as it did for the source alone.
     *
     * AND THE LIST A REF `group_by` POINTS AT, because each part is labelled with the title of the row its key is. Asked
     * of the figure's own lists alone, a member invited to Accounts was answered a figure grouped by book with a part
     * labelled by a book's title, a row of Books she cannot open. `pages.ts` asks the same through the page's schema.
     */
    figureLists(decl: MetricDecl): string[] {
      const pointsAt = (register: string, field: string): string | null => {
        const f = parts.register(register)?.fields.find((x) => x.id === field);
        return f?.type === 'ref' && typeof f.to === 'string' && f.to !== '' ? f.to : null;
      };
      return figureLists(decl, figure, pointsAt);
    },
  };
}
