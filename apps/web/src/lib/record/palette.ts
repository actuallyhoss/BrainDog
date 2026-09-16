/**
 * What the palette lists besides its commands, from the record when there is one and the sample when there is not.
 *
 * PURE, so `node --test` imports it and the palette imports it without the client: the reads that need the record are
 * in `palette-live.ts`, which the palette loads only on a live record.
 */

import { iconFor, REGISTERS, ROWS, type SearchResult } from './api.ts';
import { METRICS } from './declared.ts';
import { isTemplate, unreadable } from './metrics.ts';
import type { IconName } from '../ui/icons.ts';

/** One list the palette can open, with how many rows it holds. */
export type List = { id: string; name: string; count: number; icon: IconName };

/**
 * The lists, with their counts.
 *
 * THE SAMPLE LISTS EVERY REGISTER IT DECLARES, as the palette always did. A live record lists what `boot` counted for
 * this caller, which is the rail's own list: a register the caller may not read, or one with nothing in it, is not
 * there, so its count is never the sample's.
 */
export function listsOf(live: boolean, registers: readonly List[]): List[] {
  if (live) return [...registers];
  return Object.values(REGISTERS).map((r) => ({ id: r.id, name: r.name, count: (ROWS[r.id] ?? []).length, icon: iconFor(r.icon, 'rows') }));
}

/**
 * At most `limit` hits, one from each list per round, with every total kept.
 *
 * The sample's `search` already hands its hits over this way. The record's answer arrives grouped, so a list with many
 * matches would otherwise fill the whole budget before the next list drew a row.
 */
export function roundRobin(result: SearchResult, limit: number): SearchResult {
  const hits: SearchResult['hits'] = [];
  for (let round = 0; hits.length < limit; round++) {
    const before = hits.length;
    for (const group of result.groups) {
      const hit = group.hits[round];
      if (hit) hits.push(hit);
      if (hits.length >= limit) break;
    }
    if (hits.length === before) break;
  }
  return { ...result, hits };
}

/** One line of the record's log, and only the keys read here. */
export type Changed = { ts: string; kind: string; register: string | null; seq: number | null; title: string | null };

/** A row somebody changed, as the palette draws it. */
export type Recent = { target: string; title: string; list: string; at: string; href: string; spoken: string; icon: IconName };

/**
 * The rows changed last, newest first, each once.
 *
 * THE STANDING RULE DECIDES WHICH. A line about no row, a row in a list this caller cannot open, or a row with no title
 * is not built. A row whose newest line removed it is passed over too, and its older lines with it: there is no page to
 * open.
 */
export function recentOf(events: readonly Changed[], lists: readonly List[], cap: number): Recent[] {
  const named = new Map(lists.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const out: Recent[] = [];
  for (const e of events) {
    if (out.length >= cap) break;
    if (e.register === null || e.seq === null) continue;
    const target = `${e.register}#${e.seq}`;
    if (seen.has(target)) continue;
    seen.add(target);
    const list = named.get(e.register);
    const title = (e.title ?? '').trim();
    if (!list || !title || e.kind === 'delete') continue;
    out.push({ target, title, list: list.name, at: e.ts, href: `/r/${e.register}/${e.seq}`, spoken: `#${e.seq}`, icon: list.icon });
  }
  return out;
}

/**
 * The figures a palette may list: every declared one that needs no project chosen first and that this build can work
 * out. Admission test 1, asked of a declaration (see `palette/admit.ts`).
 */
export const FIGURE_IDS: readonly string[] = Object.entries(METRICS)
  .filter(([, decl]) => !isTemplate(decl) && unreadable(decl).length === 0)
  .map(([id]) => id);
