/**
 * The Inbox's read against the record: what arrived and no rule filed, a page at a time.
 *
 * A ROUTE-ONLY MODULE, loaded by the one screen that reads it, like `news-live.ts`: the client carries the route table
 * as a value.
 *
 * `ROUTE_UNKNOWN` is a record whose host is older than this read: there is a record, and no list of its own to draw.
 * Any other refusal is the record's own sentence, `UNREACHABLE` and `UNAUTHORIZED` included: with no slug those two
 * drew the sample's arrivals, and there is no sample now (DIRECTION 26). A live answer is drawn from the answer and
 * nothing else.
 */

import { createClient, type InboxLine } from '@braindog/client';

import type { Fetch } from './boot-live.ts';
import type { InboxItem } from './schema.ts';

/** How many arrivals the Inbox asks for at once: the record's largest page. */
export const INBOX_PAGE = 200;

export type InboxRead =
  | { from: 'live'; items: InboxItem[]; cursor: number | null }
  | { from: 'unrouted' }
  | { from: 'refused'; fix: string };

/**
 * One arrival in the shape the screen draws.
 *
 * AN ARRIVAL IS NOT ALWAYS AN EMAIL. A webhook or a paste has no sender and no subject, so it is named by the channel it
 * came in on and by the first line of what it said, and never by an empty string.
 */
export function itemOf(a: InboxLine): InboxItem {
  const body = a.body ?? '';
  const firstLine = body.split('\n', 1)[0]?.trim() ?? '';
  return {
    id: a.id,
    arrived: a.ts,
    from: a.from || a.channel,
    subject: a.subject || (firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine) || a.channel,
    body,
  };
}

/** One page of the inbox, newest first. `cursor` is the one the page above answered with. */
export async function readInbox(base: string, io?: Fetch, cursor?: number): Promise<InboxRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.inbox({ limit: INBOX_PAGE, ...(cursor === undefined ? {} : { cursor }) });
  if (!out.ok) {
    const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };
    if (refusal.code === 'ROUTE_UNKNOWN') return { from: 'unrouted' };
    return { from: 'refused', fix: refusal.fix };
  }
  return { from: 'live', items: out.value.arrivals.map(itemOf), cursor: out.value.cursor };
}
