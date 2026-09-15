/**
 * `/search`, read from the record, with the sample when there is no record here.
 *
 * A ROUTE-ONLY MODULE, for the reason `lib/data/record.ts` gives: the client carries the route table
 * as a value, so only the search route imports this and the entry chunk stays where it was.
 *
 * LIVE OR THE SAMPLE IS THE ANSWER'S TO SAY. `UNREACHABLE` and `UNAUTHORIZED` mean there is no record
 * (a static host's fallback page, a non-JSON 404, a Worker with nothing behind it), and the screen
 * draws the sample's search. That is kept for the tab, so a static host is not asked again on every
 * query. Any other refusal is a record that answered no, and its sentence is what is drawn.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { iconFor, REGISTERS, search as sampleSearch, type SearchHit, type SearchResult } from './api.ts';
import { noRecord } from './device.ts';
import { terms } from './find.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export type Found = { from: 'live' | 'sample'; value: SearchResult } | { from: 'refused'; fix: string };

/** One hit as the record's `search` sends it, and only the keys read here. */
type Hit = { register: string; seq: number; title: string };

/* THE RECORD'S CEILING. `fts.search` clamps any limit to a hundred, so a live count stops there. */
const LIMIT = 100;

const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };

/**
 * The record's hits as the page's groups: one per register, in the order its best hit arrived.
 *
 * The record says the register, the number and the title, and nothing else. So a live row has no
 * state beside it and no reason it matched, and the questions and pages the sample also searches
 * are not in the answer.
 */
export function groupsOf(q: string, hits: readonly Hit[]): SearchResult {
  const byRegister = new Map<string, SearchHit[]>();
  const flat: SearchHit[] = [];
  for (const h of hits) {
    const decl = REGISTERS[h.register];
    const hit: SearchHit = {
      title: h.title,
      detail: '',
      href: `/r/${h.register}/${h.seq}`,
      kind: decl?.name ?? h.register,
      icon: iconFor(decl?.icon, 'rows'),
      spoken: `#${h.seq}`,
    };
    flat.push(hit);
    const group = byRegister.get(h.register) ?? [];
    group.push(hit);
    byRegister.set(h.register, group);
  }
  return {
    hits: flat,
    total: flat.length,
    groups: [...byRegister].map(([register, g]) => ({
      kind: g[0]?.kind ?? register,
      total: g.length,
      hits: g,
      href: `/r/${register}?q=${encodeURIComponent(q.trim())}`,
    })),
  };
}

export type Searcher = { find(q: string): Promise<Found> };

/** A search for one tab. `base` is the page's own origin; the app never holds a token. */
export function searcher(base: string, io?: Fetch): Searcher {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  let absent = false;
  return {
    async find(q) {
      /* NOTHING TO ASK, SO NOTHING IS SENT. The same folding the record's index uses decides it. */
      if (!terms(q)) return { from: absent ? 'sample' : 'live', value: NOTHING };
      if (absent) return { from: 'sample', value: sampleSearch(q, Number.MAX_SAFE_INTEGER) };
      const out = await client.search(q, LIMIT);
      if (out.ok) return { from: 'live', value: groupsOf(q, out.value) };
      if ('refusal' in out && noRecord(out.refusal.code)) {
        absent = true;
        return { from: 'sample', value: sampleSearch(q, Number.MAX_SAFE_INTEGER) };
      }
      return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The record changed while it was being read.' };
    },
  };
}
