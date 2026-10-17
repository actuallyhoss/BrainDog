/**
 * The record's firsts: when an agent first said hello at the door, and when the briefing first answered a card. The
 * operator's funnel reads them (`firsts`) for its last two steps, one record at a time, since no other table keeps
 * either: the door's own marks are swept at 30 days (`door.ts`), and a briefing the rules wrote leaves nothing.
 *
 * WRITE ONCE. Each is a pref of the record's own holder, `FIRSTS`, written the first time and never moved after it,
 * so a hundredth hello leaves the first one's time standing. Not an event, for the reason a pref is not one: when it
 * first happened is not the record's history, and nobody's name or key is kept with it, only the instant.
 *
 * ON EVERY RECORD ALIKE (DIRECTION §27): whichever record it is, the door and the briefing keep the same two.
 */

import type { Kernel } from '@braindog/kernel';

/** The pref holder the record's firsts live under. No person goes by it: a person's id begins `p_`. */
export const FIRSTS = 'record:firsts';

/** The two firsts, by their pref keys. */
export const FIRST_KEYS = ['first.agent', 'first.brief'] as const;
export type FirstKey = (typeof FIRST_KEYS)[number];

/** What `firsts` answers: each as epoch ms, or `null` while it has not happened. */
export type Firsts = { agent: number | null; brief: number | null };

type Prefs = Pick<Kernel, 'prefsOf' | 'setPref'>;

/** A kept first as epoch ms, or `null` for none or one somebody wrote by hand that is not a time. */
const atOf = (value: unknown): number | null => {
  const at = value !== null && typeof value === 'object' ? (value as { at?: unknown }).at : undefined;
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Keep `key` at `now` unless it is already kept, and say whether this was the first. One read and at most one write,
 * both inside the object's single thread, so two hellos in one moment keep one first.
 */
export function markFirst(kernel: Prefs, key: FirstKey, now: number): boolean {
  if (kernel.prefsOf(FIRSTS)[key] !== undefined) return false;
  kernel.setPref(FIRSTS, key, { at: new Date(now).toISOString() });
  return true;
}

/** Both firsts as they are kept. It changes nothing. */
export function firsts(kernel: Pick<Kernel, 'prefsOf'>): Firsts {
  const kept = kernel.prefsOf(FIRSTS);
  return { agent: atOf(kept['first.agent']), brief: atOf(kept['first.brief']) };
}
