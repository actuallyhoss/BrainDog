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

import type { Metric, SearchResult } from './api.ts';
import type { Fetch } from './boot-live.ts';
import { tileOf } from './news-live.ts';
import { FIGURE_IDS, recentOf, roundRobin, type Changed, type List, type Recent } from './palette.ts';
import { searcher } from './search-live.ts';

export type Hits = { value: SearchResult; fix: string | null };

export type Reader = {
  find(q: string, limit: number): Promise<Hits>;
  recent(lists: readonly List[], cap: number): Promise<Recent[]>;
  figures(): Promise<Metric[]>;
};

/** How many lines of the log are asked for to find a handful of distinct rows. */
export const LOG_LINES = 50;

const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };

/** A reader for one tab. `base` is the page's own origin. */
export function paletteReader(base: string, io?: Fetch): Reader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const search = searcher(base, io);
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
    async figures() {
      const read = await Promise.all(FIGURE_IDS.map((id) => client.metric(id).catch(() => null)));
      /* A FIGURE WITH NO ROWS BEHIND IT HAS NO DOOR, and the palette lists doors. One the record will not work out for
         this caller is left out rather than named. */
      return read.flatMap((out, i) => {
        if (!out?.ok) return [];
        const tile = tileOf(FIGURE_IDS[i]!, out.value as Parameters<typeof tileOf>[1]);
        return tile.href ? [tile] : [];
      });
    },
  };
}
