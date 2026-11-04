/**
 * The palette's reads against a live record: its search, the rows changed last, and the figures.
 *
 * LOADED BY THE PALETTE ON A LIVE RECORD ONLY, and dynamically, for the reason `search-live.ts` gives: the client
 * carries the route table as a value. The sample's palette never loads it.
 *
 * A READ THAT FAILS IS NOTHING FOUND. The palette is a way to somewhere, and the screen at the other end says what the
 * record said; a search the record refuses carries its sentence, so the panel does not claim nothing matched.
 */

import { createClient } from '@braindog/client';

import { iconFor, type Metric, type SearchResult } from './api.ts';
import { REGISTERS } from './held.ts';
import { rowNameSaid } from './names.ts';
import { learnNames, namesStale } from './search-kept.ts';
import { METRICS } from './declared.ts';
import type { Fetch } from './boot-live.ts';
import { tileOf } from './news-live.ts';
import { FIGURE_IDS, recentOf, roundRobin, type Changed, type List, type Recent } from './palette.ts';
import { searcher } from './search-live.ts';

export type Hits = { value: SearchResult; fix: string | null };

export type Reader = {
  find(q: string, limit: number): Promise<Hits>;
  recent(lists: readonly List[], cap: number): Promise<Recent[]>;
  /**
   * The figures over the lists the record holds whose names answer `said`, and only those: at most `FIGURES_ASKED`.
   * NEVER ALL OF THEM. See `figureIdsFor`.
   */
  figures(lists: readonly { id: string }[] | undefined, said: (name: string) => boolean): Promise<Metric[]>;
  /** Ask for every name on the record, to answer from this device, when what it holds has aged. */
  names(): void;
};

/** The most figures one query asks the record to work out: more than the panel's group of six would draw. */
export const FIGURES_ASKED = 6;

/**
 * THE FIGURES WHOSE NAMES ANSWER WHAT WAS TYPED, picked from what this build declares, with nothing asked of the record.
 *
 * THE PANEL USED TO ASK FOR EVERY FIGURE AS IT OPENED. On his record (production logs, 3 and 4 Nov) that one `reads` took
 * 4.8 to 8.4 s of the record's one thread: `/` was pressed, and the search typed next, the page opened next and every
 * other request sat behind it for 5 to 9 s while the row they wanted to show was a name this build already knew.
 */
export function figureIdsFor(lists: readonly { id: string }[] | undefined, said: (name: string) => boolean): string[] {
  const held = lists ? new Set(lists.map((l) => `register.${l.id}`)) : null;
  /* A FIGURE OVER A LIST THE RECORD DOES NOT HOLD IS NOT ASKED FOR. Every figure here is Money's, the estate's or
     a project's, so a student's record answered twenty refusals each time the palette opened. */
  return FIGURE_IDS.filter((id) => (held === null || held.has(String(METRICS[id]?.source))) && said(METRICS[id]?.name ?? id)).slice(0, FIGURES_ASKED);
}

/** How many lines of the log are asked for to find a handful of distinct rows. */
export const LOG_LINES = 50;

const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };

/** A reader for one tab. `base` is the record's own (`apiBase`), so its asks share the screen's kept ones. */
export function paletteReader(base: string, io?: Fetch): Reader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  /* BY THE WORDS ALONE, and what a search reaches besides rows asked as the palette opens (slash1104). */
  const search = searcher(base, io, { words: true });
  search.warm();
  return {
    async find(q, limit) {
      const out = await search.find(q).catch(() => null);
      if (out === null) return { value: NOTHING, fix: null };
      if (out.from === 'refused') return { value: NOTHING, fix: out.fix };
      return { value: roundRobin(out.value, limit), fix: null };
    },
    async recent(lists, cap) {
      const out = await client.recentHistory({ limit: LOG_LINES }).catch(() => null);
      return out?.ok ? recentOf(out.value.events as readonly Changed[], lists, cap) : [];
    },
    names() {
      if (!namesStale(base)) return;
      void client
        .names()
        .then((out) => {
          if (!out.ok || !out.value.whole) return;
          learnNames(
            base,
            out.value.lists.map((l) => ({ id: l.id, kind: l.name, icon: iconFor(l.icon ?? REGISTERS[l.id]?.icon, 'rows'), rows: l.rows.map(([seq, title, ...rest]) => [seq, rowNameSaid(l.id, title), ...rest] as const) })),
          );
        })
        .catch(() => undefined);
    },
    async figures(lists, said) {
      const ids = figureIdsFor(lists, said);
      if (ids.length === 0) return [];
      const read = await Promise.all(ids.map((id) => client.metric(id).catch(() => null)));
      /* A FIGURE WITH NO ROWS BEHIND IT HAS NO DOOR, and the palette lists doors. One the record will not work out for
         this caller is left out rather than named. */
      return read.flatMap((out, i) => {
        if (!out?.ok) return [];
        const tile = tileOf(ids[i]!, out.value as Parameters<typeof tileOf>[1]);
        return tile.href ? [tile] : [];
      });
    },
  };
}
