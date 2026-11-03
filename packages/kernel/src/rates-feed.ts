/**
 * The feed that keeps a record's exchange rates current, as the two signs about an old rate say it (`rates-current` in
 * `signs.ts`, `rate-age` in `signs-vitals.ts`).
 *
 * THE LINE NAMES THE ONE PRESS THAT CURES IT, AND WHICH ONE DEPENDS ON WHAT THE RECORD HAS. With no feed it is Money's
 * "Keep rates current" switch, which sets one up. With a feed that is paused, it is that feed's way back on. With one that
 * runs, it is when it last fetched, since a switch already on is not the cure. Both signs said "A feed of rates once a
 * day would keep them current" whatever the record held, so a person who had pressed the switch was told to press it.
 *
 * A FEED IS AN ORDINARY POLL OR CALL THAT WRITES INTO THE LIST THE KERNEL CONVERTS BY (`ratesRole`), so no add-on is
 * named here: the rates add-on is one such, and any other that fills the same list is read the same way.
 */

import type { Sql } from '@braindog/ports';

import { ratesRole, type RoleList } from './roles.ts';

/** The words of Money's switch, as its page says them, and where it is. */
export const KEEP_RATES_SAID = "Turn on Keep rates current, on Money's plugin page, for a feed of rates once a day.";

/** A feed that fills the rates list: its declaration, whether its schedule is paused, and its last good fetch. */
export type RatesFeed = { id: string; paused: boolean; lastGood: string | null };

const parsed = (text: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** The lists a feed writes into: `writes.register`, or each `writes.to[].register`. */
const writesInto = (body: Record<string, unknown>): string[] => {
  const w = body.writes as { register?: unknown; to?: unknown } | undefined;
  if (typeof w?.register === 'string') return [w.register];
  return Array.isArray(w?.to) ? w.to.flatMap((t) => (typeof (t as { register?: unknown })?.register === 'string' ? [(t as { register: string }).register] : [])) : [];
};

/** The first live poll or call that fills the record's rates list, or `null` when none does or no list holds rates. */
export function ratesFeed(sql: Sql): RatesFeed | null {
  const lists = sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .flatMap((d) => {
      const b = parsed(d.body);
      return b === null ? [] : [b as unknown as RoleList];
    });
  const role = ratesRole(lists);
  if (!role) return null;
  for (const d of sql.all<{ id: string; body: string }>(
    "SELECT id, body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 AND json_valid(body) AND json_extract(body, '$.channel') IN ('poll', 'call') ORDER BY id",
  )) {
    const body = parsed(d.body);
    if (body === null || !writesInto(body).includes(role.register)) continue;
    const key = d.id.slice(d.id.indexOf('.') + 1);
    const state = sql.one<{ state: string }>('SELECT state FROM schedule WHERE kind = ? AND key = ?', String(body.channel), key)?.state;
    const lastGood =
      sql.one<{ ts: string | null }>(
        "SELECT max(ts) AS ts FROM event WHERE kind = 'pull' AND target = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') = 'ok'",
        `declaration:${d.id}`,
      )?.ts ?? null;
    return { id: d.id, paused: state === 'paused', lastGood };
  }
  return null;
}

/**
 * The sentence after an old rate is said: the press that cures it, from what the record has. `day` says an instant as
 * the sign says its days.
 */
export function ratesFeedSaid(feed: RatesFeed | null, day: (at: string) => string): string {
  if (feed === null) return KEEP_RATES_SAID;
  if (feed.paused) return 'The feed of rates is paused. Starting it again under Automations, Scheduled, fetches today\'s.';
  if (feed.lastGood === null) return 'The feed of rates is on and has not fetched a rate yet; its first fetch fills them.';
  return `The feed of rates last fetched on ${day(feed.lastGood)}.`;
}
