/**
 * The Inbox's other two series and its tally: what was filed, what was archived, how much sits in each, and the pattern
 * proposals that wait on Decide.
 *
 * FILED AND ARCHIVED ARE THE RECORD'S OWN STATES, `matched` and `ignored`, read through the same `inbox` the waiting
 * arrivals come from. Each line carries its `settled` when a person or an agent's run filed or archived it, which is who
 * the row names and whether it offers Put back; a line a rule filed carries none, and offers none, because the record
 * refuses to take a rule's filing back.
 *
 * THE TALLY IS THE RECORD'S NUMBERS, `counts` and `ruledThisWeek`, and nothing counted here: a page holds at most
 * `INBOX_PAGE` arrivals, and a sum over it would stop at the page.
 *
 * A ROUTE-ONLY MODULE, loaded by the Inbox when it reads, like `shapes.ts`.
 */

import { createClient, type InboxLine, type InboxPage } from '@braindog/client';

import { everyGovernance } from '../../lib/record/governance.ts';
import { INBOX_PAGE, itemOf } from '../../lib/record/inbox-live.ts';
import type { InboxItem } from '../../lib/record/schema.ts';

/** The two series besides what waits, by the state the record keeps them in. */
export type Series = 'matched' | 'ignored';

/** How many wait, were filed and were archived, and how many a rule filed this week (`null` from an older host). */
export type Tally = { waiting: number; filed: number; archived: number; ruled: number | null };

/** One filed or archived arrival: the row the screen draws, and who settled it (`null` when a rule did). */
export type SettledItem = InboxItem & { settled: NonNullable<InboxLine['settled']> | null };

export type SeriesRead =
  | { from: 'live'; items: SettledItem[]; cursor: number | null; tally: Tally | null }
  | { from: 'unrouted' }
  | { from: 'refused'; fix: string };

/** A pattern proposal waiting on Decide: its question id and the question as it was asked. */
export type Pattern = { id: string; title: string };

/** The most pattern proposals the Inbox leads with; the rest are on Decide, where every one of them is. */
const PATTERNS_MOST = 5;

/** The tally one page of `inbox` answers with, or `null` from a host older than `counts`. */
export function tallyOf(page: InboxPage): Tally | null {
  const c = page.counts;
  if (!c) return null;
  return { waiting: c.untriaged + c.review + (c.proposed ?? 0), filed: c.matched, archived: c.ignored, ruled: page.ruledThisWeek ?? null };
}

/**
 * One page of filed or archived arrivals, newest first, with the tally. `cursor` is the one the page above answered with.
 *
 * THE REFUSALS READ AS `readInbox`'s DO: `ROUTE_UNKNOWN` is a host older than this read, and any other refusal is the
 * record's own sentence.
 */
export async function readSeries(base: string, state: Series, cursor?: number): Promise<SeriesRead> {
  const out = await createClient({ base }).inbox({ state, limit: INBOX_PAGE, ...(cursor === undefined ? {} : { cursor }) });
  if (!out.ok) {
    const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'Something changed while it was being read.' };
    return refusal.code === 'ROUTE_UNKNOWN' ? { from: 'unrouted' } : { from: 'refused', fix: refusal.fix };
  }
  return {
    from: 'live',
    items: out.value.arrivals.map((a) => ({ ...itemOf(a), settled: a.settled ?? null })),
    cursor: out.value.cursor,
    tally: tallyOf(out.value),
  };
}

/**
 * The tally alone, for the screen that draws what waits: one arrival asked for, since `counts` rides on every page.
 * `null` when the record did not answer with one, and the screen then draws no tally rather than a wrong one.
 */
export async function readTally(base: string): Promise<Tally | null> {
  try {
    const out = await createClient({ base }).inbox({ limit: 1 });
    return out.ok ? tallyOf(out.value) : null;
  } catch {
    return null;
  }
}

/**
 * The open pattern proposals, in the order the record answers them, at most `PATTERNS_MOST`. A read that fails is no
 * proposals: the arrivals below are the screen, and Decide still lists every one.
 *
 * `governance.open` WITH ITS KIND ASKED HERE, since the record's `governance` takes no kind: the rows are the record's
 * and only the ones whose `body_kind` is `pattern` are kept.
 */
export async function readPatterns(base: string): Promise<Pattern[]> {
  try {
    const out = await everyGovernance(createClient({ base }), { status: 'open' });
    if (!out.ok) return [];
    return out.value
      .filter((r) => r.body_kind === 'pattern' && typeof r.question === 'string' && r.question.trim() !== '')
      .slice(0, PATTERNS_MOST)
      .map((r) => ({ id: String(r.id), title: String(r.question).trim() }));
  } catch {
    return [];
  }
}

/** The most pages the "What comes in" read walks before it stops and says it is partial. */
const ARRIVALS_PAGES = 3;

/**
 * Every arrival of the last `days` days, in every state, as far as `ARRIVALS_PAGES` pages reach: the channel and the time
 * of each, which is all the "What comes in" tile counts. `partial` when older pages were left unread inside the window.
 * A read that fails is `null`, and the tile is not drawn rather than drawn empty.
 */
export async function readArrivals(base: string, now: number, days: number): Promise<{ lines: { channel: string; ts: string; reason: string | null; from: string }[]; partial: boolean } | null> {
  try {
    const client = createClient({ base });
    const from = now - days * 86_400_000;
    const lines: { channel: string; ts: string; reason: string | null; from: string }[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < ARRIVALS_PAGES; page++) {
      const out = await client.inbox({ state: 'all', limit: INBOX_PAGE, ...(cursor === undefined ? {} : { cursor }) });
      if (!out.ok) return page === 0 ? null : { lines, partial: true };
      for (const a of out.value.arrivals) lines.push({ channel: a.channel, ts: a.ts, reason: a.reason, from: a.from });
      const oldest = Date.parse(out.value.arrivals.at(-1)?.ts ?? '');
      if (out.value.cursor === null || !(oldest >= from)) return { lines, partial: false };
      cursor = out.value.cursor;
    }
    return { lines, partial: true };
  } catch {
    return null;
  }
}
