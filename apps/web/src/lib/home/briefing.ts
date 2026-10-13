/**
 * The briefing on Today: what matters today, as lines a person can press (`Briefing.svelte`).
 *
 * THROUGH THE RECORD'S OWN `briefing` AND NOTHING ELSE. The record picks the cards, orders them and writes each line;
 * this file only turns a card into what a screen draws: its sentence, where its own thing opens, and who wrote it.
 *
 * IT NEVER FAILS THE SCREEN. A record with no such call, a reader it refuses and a line that dropped all answer no
 * cards, and no cards draws nothing: Today stands as it did before there was a briefing.
 *
 * A ROUTE-ONLY MODULE, like `today-live.ts`: the client carries the route table as a value, so this is imported lazily
 * from `Today.svelte` and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/** How many cards a screen draws, which is the record's own ceiling on a briefing. */
export const BRIEFING_MOST = 7;

/** One card as it is drawn. `href` is `null` for a card whose thing has no address here, which is a line and no link. */
export type BriefingRow = { key: string; line: string; href: string | null; by: 'slash' | 'rule' };

/** A list's own name in an address: what the record mints, and nothing a path could be bent with. */
const LIST = /^[a-z][a-z0-9_-]*$/u;

const listRow = (list: unknown, seq: unknown): string | null =>
  typeof list === 'string' && LIST.test(list) && typeof seq === 'number' && Number.isInteger(seq) && seq > 0 ? `/r/${list}/${String(seq)}` : null;

/**
 * Where a card's own thing opens: `tasks#12` as the record says one is `/r/tasks/12`, a question is its own page on
 * Decide, and a run is its own row.
 *
 * ONLY EVER AN ADDRESS INSIDE THE APP. A card's words may be a model's, so what it names is read strictly: a list and a
 * number, or a path of this app's own. Anything else opens nothing rather than somewhere else.
 */
function hrefOf(row: unknown): string | null {
  if (typeof row === 'string') {
    if (/^\/(?![/\\])[\w\-./~%]*$/u.test(row)) return row;
    /* A QUESTION IS SAID AS `suggestion:` AND ITS NAME, and opens where Today's own questions do. */
    const asked = /^suggestion:([\w.-]{1,64})$/u.exec(row);
    if (asked) return `/decide/${encodeURIComponent(asked[1]!)}`;
    /* A RUN IS SAID AS `S` AND ITS NUMBER, never `list#number` (`runPath` in `record/vault.ts` reads it the same way). */
    const run = /^S([1-9]\d{0,14})$/u.exec(row);
    if (run) return `/r/session/${run[1]!}`;
    const cut = row.lastIndexOf('#');
    if (cut < 1) return null;
    const said = row.slice(cut + 1);
    return /^[1-9]\d{0,14}$/u.test(said) ? listRow(row.slice(0, cut), Number(said)) : null;
  }
  if (typeof row !== 'object' || row === null) return null;
  const r = row as { register?: unknown; seq?: unknown };
  return listRow(r.register, r.seq);
}

/**
 * The record's answer as the cards to draw, in its order, seven at most.
 *
 * A CARD WITH NO LINE IS DROPPED, because a line is all a card is. A REFUSAL IS NO CARDS, whichever it is: a host built
 * before the briefing answers `NOT_IN_THIS_BUILD` or `ROUTE_UNKNOWN`, and neither is anything a person can act on.
 */
export function briefingRows(answer: unknown): BriefingRow[] {
  const a = answer as { ok?: unknown; value?: { cards?: unknown } | null } | null | undefined;
  const cards = a?.ok === true ? a.value?.cards : undefined;
  if (!Array.isArray(cards)) return [];
  const rows: BriefingRow[] = [];
  const keys = new Set<string>();
  for (const card of cards as unknown[]) {
    if (rows.length === BRIEFING_MOST) break;
    if (typeof card !== 'object' || card === null) continue;
    const c = card as { h?: unknown; line?: unknown; row?: unknown; by?: unknown };
    const line = typeof c.line === 'string' ? c.line.trim() : '';
    if (line === '') continue;
    /* THE KEY IS THE CARD'S HANDLE, and its place where two cards came with one handle or with none. */
    const h = typeof c.h === 'string' && c.h !== '' && !keys.has(c.h) ? c.h : `card-${String(rows.length)}`;
    keys.add(h);
    rows.push({ key: h, line, href: hrefOf(c.row), by: c.by === 'slash' ? 'slash' : 'rule' });
  }
  return rows;
}

/** The briefing for the record at `base`. Always an answer, and an empty one where there is nothing to draw. */
export async function readBriefing(base: string, io?: Fetch): Promise<{ ok: true; value: BriefingRow[] }> {
  try {
    return { ok: true, value: briefingRows(await createClient({ base, ...(io ? { fetch: io } : {}) }).briefing()) };
  } catch {
    return { ok: true, value: [] };
  }
}
