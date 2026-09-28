/**
 * The Inbox's read with the shape each arrival belongs to, and the groups the screen draws from it.
 *
 * ONE GROUPING, THE KERNEL'S. An arrival's shape is `shapeOf` from `packages/kernel/src/ingest.ts`, the same key the
 * record counts when it drafts a pattern at the third alike, so the screen and the record cannot disagree about which
 * arrivals are "the same sender". The rule offer PLT-10 adds sits on these groups too (contracts X43).
 *
 * THE READ IS ITS OWN AND NOT `readInbox`'s, because the screen's `InboxItem` drops the channel and the to address the
 * shape is made from. The item each line becomes is still `itemOf`'s, so a row here reads exactly as it did.
 *
 * A ROUTE-ONLY MODULE, loaded by the Inbox when it reads, like `inbox-live.ts`.
 */

import { createClient, type InboxLine } from '@braindog/client';
import { PROPOSE_AT, shapeOf } from '@braindog/kernel';

import { INBOX_PAGE, itemOf, type InboxRead } from '../../lib/record/inbox-live.ts';
import type { InboxItem } from '../../lib/record/schema.ts';

/** How many alike arrivals earn the offer: the record's own threshold for drafting a pattern unasked. */
export const ALIKE = PROPOSE_AT;

/** The most arrivals one pattern is drafted from, as `POST /api/slash/pattern` takes them (`PATTERN_SAMPLES_MOST`). */
export const SAMPLES_MOST = 10;

/** One page of the inbox as `readInbox` answers it, and the shape of every arrival on it by id. */
export type ShapedRead = { read: InboxRead; shapes: ReadonlyMap<string, string> };

/** One arrival's shape, from the channel it came in on and the address it came from (or went to). */
const shapeOfLine = (a: InboxLine): string =>
  shapeOf(a.channel as Parameters<typeof shapeOf>[0], { from: a.from, to: a.to });

/**
 * One page of the inbox, newest first, with the shapes. `cursor` is the one the page above answered with.
 *
 * THE REFUSALS READ AS `readInbox`'s DO: `ROUTE_UNKNOWN` is a host older than this read, and any other refusal is the
 * record's own sentence.
 */
export async function readShaped(base: string, cursor?: number): Promise<ShapedRead> {
  const client = createClient({ base });
  const out = await client.inbox({ limit: INBOX_PAGE, ...(cursor === undefined ? {} : { cursor }) });
  if (!out.ok) {
    const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };
    return { read: refusal.code === 'ROUTE_UNKNOWN' ? { from: 'unrouted' } : { from: 'refused', fix: refusal.fix }, shapes: new Map() };
  }
  const { arrivals } = out.value;
  return {
    read: { from: 'live', items: arrivals.map(itemOf), cursor: out.value.cursor },
    shapes: new Map(arrivals.map((a) => [a.id, shapeOfLine(a)])),
  };
}

/** Arrivals that share a shape, newest first, in the order their newest arrived. */
export type Group = { shape: string; items: readonly InboxItem[] };

/**
 * The arrivals drawn, grouped by shape.
 *
 * A GROUP SITS WHERE ITS NEWEST ARRIVAL WOULD, so the top of the Inbox is still what came in last. An arrival whose shape
 * was never read (none should be) is a group of its own, keyed so that it can never join another.
 */
export function groupsOf(items: readonly InboxItem[], shapes: ReadonlyMap<string, string>): Group[] {
  const by = new Map<string, InboxItem[]>();
  for (const item of items) {
    const shape = shapes.get(item.id) ?? `\u0000${item.id}`;
    const alike = by.get(shape);
    if (alike) alike.push(item);
    else by.set(shape, [item]);
  }
  return [...by].map(([shape, alike]) => ({ shape, items: alike }));
}
