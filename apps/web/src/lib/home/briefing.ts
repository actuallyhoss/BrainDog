/**
 * The briefing on Today: what matters today, as lines a person can press (`Briefing.svelte`).
 *
 * THROUGH THE RECORD'S OWN `briefing` AND NOTHING ELSE. The record picks the cards, orders them and writes each line;
 * this file only turns a card into what a screen draws: its sentence, where its own thing opens, and who wrote it,
 * and the record's one sentence on why the rules wrote the briefing where they did (`footOf`).
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

/** How many things that need the owner stand under the written brief. */
export const WRITTEN_NEEDS_MOST = 5;

/** One card as it is drawn. `href` is `null` for a card whose thing has no address here, which is a line and no link. */
export type BriefingRow = {
  key: string;
  line: string;
  href: string | null;
  by: 'slash' | 'rule';
  /** The written brief's paragraph: its words in order, each figure or name opening its own row. Absent on a card. */
  parts?: { text: string; href: string | null }[];
};

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
 * THE WRITTEN BRIEF AS ROWS (`record/src/written-brief.ts`): its sentences as one paragraph row, then the few things
 * that need the owner as the lines they always were. `null` where the record sent no brief, and the cards stand.
 */
function writtenRows(written: unknown): BriefingRow[] | null {
  const w = written as { sentences?: unknown; needs?: unknown } | null | undefined;
  if (w === null || typeof w !== 'object' || !Array.isArray(w.sentences)) return null;
  const parts: { text: string; href: string | null }[] = [];
  for (const s of w.sentences as unknown[]) {
    const ps = (s as { parts?: unknown } | null)?.parts;
    if (!Array.isArray(ps)) continue;
    if (parts.length > 0) parts.push({ text: ' ', href: null });
    for (const p of ps as unknown[]) {
      const { text, row } = (p ?? {}) as { text?: unknown; row?: unknown };
      if (typeof text === 'string' && text !== '') parts.push({ text, href: hrefOf(row) });
    }
  }
  if (parts.length === 0) return null;
  const rows: BriefingRow[] = [{ key: 'written', line: parts.map((p) => p.text).join('').trim(), href: null, by: 'slash', parts }];
  const needs = Array.isArray(w.needs) ? (w.needs as unknown[]) : [];
  for (const card of needs) {
    if (rows.length === 1 + WRITTEN_NEEDS_MOST) break;
    const c = (card ?? {}) as { h?: unknown; line?: unknown; row?: unknown };
    const line = typeof c.line === 'string' ? c.line.trim() : '';
    if (line !== '') rows.push({ key: typeof c.h === 'string' && c.h !== '' ? `need-${c.h}` : `need-${String(rows.length)}`, line, href: hrefOf(c.row), by: 'rule' });
  }
  return rows;
}

/**
 * The record's answer as the cards to draw, in its order, seven at most.
 *
 * A CARD WITH NO LINE IS DROPPED, because a line is all a card is. A REFUSAL IS NO CARDS, whichever it is: a host built
 * before the briefing answers `NOT_IN_THIS_BUILD` or `ROUTE_UNKNOWN`, and neither is anything a person can act on.
 */
export function briefingRows(answer: unknown): BriefingRow[] {
  const a = answer as { ok?: unknown; value?: { cards?: unknown; written?: unknown } | null } | null | undefined;
  const written = a?.ok === true ? writtenRows(a.value?.written) : null;
  if (written !== null) return written;
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

/**
 * The whole read: the cards, who wrote them, and what the record said about that.
 *
 * `written` IS SLASH WHERE ANY CARD IS SLASH'S, and the rules otherwise, which is also what no cards reads as. `said` IS
 * THE RECORD'S OWN SENTENCE on why the rules wrote it, and `null` where it said nothing: a host built before the key
 * sends none, and that is nothing said.
 */
export type BriefingRead = { rows: BriefingRow[]; written: 'slash' | 'rule'; said: string | null; paused: string | null };

/** How long a sentence under the cards may run. The record keeps its own far shorter; this is the screen's ceiling. */
const SAID_MOST = 200;

/**
 * The record's sentence as one line of plain words: its breaks and runs of spaces closed up, a long dash read as the
 * comma it stands for, and cut at a word where it runs on. It came down the wire, so it is read as strictly as a line.
 */
function sentence(said: unknown): string | null {
  if (typeof said !== 'string') return null;
  const flat = said.replace(/\s*[\u2012-\u2015]\s*/gu, ', ').replace(/\s+/gu, ' ').trim();
  if (flat === '') return null;
  if (flat.length <= SAID_MOST) return flat;
  const cut = flat.slice(0, SAID_MOST);
  const word = cut.lastIndexOf(' ');
  return (word > 0 ? cut.slice(0, word) : cut).trimEnd();
}

/** The record's answer as the whole read. The cards are `briefingRows`' own, so the two readers never disagree. */
export function briefingRead(answer: unknown): BriefingRead {
  const rows = briefingRows(answer);
  const a = answer as { ok?: unknown; value?: { said?: unknown; paused?: unknown } | null } | null | undefined;
  return {
    rows,
    written: rows.some((r) => r.by === 'slash') ? 'slash' : 'rule',
    said: a?.ok === true ? sentence(a.value?.said) : null,
    paused: a?.ok === true ? sentence(a.value?.paused) : null,
  };
}

/**
 * The one quiet line under the cards, or `null` for none: why the rules wrote the briefing, in the record's sentence.
 *
 * NOTHING WHERE EVERY CARD IS SLASH'S, since each says so itself. NOTHING WHERE NOTHING WAS SAID: a record with no
 * model is not told so on every visit. NOTHING UNDER NO CARDS. Its full stop is kept once.
 */
export function footOf(read: BriefingRead): string | null {
  /* THE WRITTEN BRIEF PAUSED IS THE ONE LINE, in the record's own words, which lead with the engine's sentence. */
  if (read.rows.length > 0 && read.paused !== null) return read.paused;
  /* A WRITTEN BRIEF SAYS ITSELF: the rules' lines under it are needs, not a fallback. */
  if (read.rows[0]?.parts !== undefined) return null;
  if (read.rows.length === 0 || read.said === null || read.rows.every((r) => r.by === 'slash')) return null;
  const why = read.said.replace(/[.\s]+$/u, '');
  if (why === '') return null;
  return `${read.written === 'slash' ? 'Partly written by the rules' : 'Written by the rules'}: ${why}.`;
}

const client = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/** The briefing for the record at `base`. Always an answer, and an empty one where there is nothing to draw. */
export async function readBriefing(base: string, io?: Fetch): Promise<{ ok: true; value: BriefingRow[] }> {
  try {
    return { ok: true, value: briefingRows(await client(base, io).briefing()) };
  } catch {
    return { ok: true, value: [] };
  }
}

/** The same read with what the record said beside the cards. Always an answer, as `readBriefing` is. */
export async function readBriefingSaid(base: string, io?: Fetch): Promise<{ ok: true; value: BriefingRead }> {
  try {
    return { ok: true, value: briefingRead(await client(base, io).briefing()) };
  } catch {
    return { ok: true, value: briefingRead(null) };
  }
}
