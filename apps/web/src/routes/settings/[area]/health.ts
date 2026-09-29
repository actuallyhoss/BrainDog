/**
 * The one sentence under Settings' title: whether last night's copy is in, and whether
 * anything runs out before the month resets. "All healthy: last night's copy is in, and nothing runs out before
 * 1 October." The phrase that needs him is marked, and only when something does: "No copy last night", or "Runs are
 * at 91%, 2 days to go".
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE. `+page.svelte` reads the copies and the month's usage and hands the
 * answers here; this file says what they mean and never asks the record anything.
 *
 * NOTHING IS SAID THAT WAS NOT READ. A host that keeps no copies, or a record with none yet, says nothing about copies;
 * a host with no ledger says nothing about usage; and with neither there is no sentence at all.
 */

import type { MeterKey } from '../../../lib/record/actions.ts';

/** A piece of the sentence; `needs` marks the phrase drawn in `--danger`. */
export type Part = { text: string; needs?: true };

/** Whether last night's copy is in: `null` when there is nothing to judge by. */
export type CopyState = 'in' | 'missing' | null;

/** The meter nearest its limit when it is near, the day the month resets, and the days left before it does. */
export type UsageState = { resets: string; near: { key: MeterKey; share: number } | null; daysLeft: number } | null;

/** How far into an allowance a meter is before the sentence says so: the Directory's `NOTICE_AT`, as `/usage` uses. */
export const NEAR = 0.8;

/**
 * HOW OLD THE NEWEST COPY MAY BE AND STILL BE LAST NIGHT'S. Copies are taken at 03:00 each night, so a day and a half
 * covers a reader in any time zone looking at any hour, and a night that was missed is past it by morning.
 */
export const LAST_NIGHT_MS = 36 * 3_600_000;

/** Whether the newest of these copies is last night's. No copies is nothing to judge by, not a missed night. */
export function lastCopy(ats: readonly string[], now: number): CopyState {
  const newest = Math.max(...ats.map((at) => Date.parse(at)).filter((ms) => Number.isFinite(ms)));
  if (!Number.isFinite(newest)) return null;
  return now - newest <= LAST_NIGHT_MS ? 'in' : 'missing';
}

/** The meter nearest its limit, when it is at `NEAR` or past it. */
export function nearest(meters: readonly { key: MeterKey; share: number }[]): { key: MeterKey; share: number } | null {
  const top = [...meters].sort((a, b) => b.share - a.share)[0];
  return top !== undefined && top.share >= NEAR ? { key: top.key, share: top.share } : null;
}

/** The days left in this month, today counted: the 29th of a thirty-day month has 2 to go. The ledger's month is UTC. */
export function daysLeft(now: number): number {
  const d = new Date(now);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate() + 1;
}

const METER: Record<MeterKey, { name: string; plural: boolean }> = {
  runs: { name: 'Runs', plural: true },
  requests: { name: 'Requests', plural: true },
  bytes: { name: 'Fetched data', plural: false },
  ms: { name: 'Run time', plural: false },
};

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** The phrase for a meter that is near its limit, or past it. */
export function nearSaid(near: { key: MeterKey; share: number }, days: number, resets: string): string {
  const m = METER[near.key];
  if (near.share >= 1) return `${m.name} ${m.plural ? 'are' : 'is'} used up until ${resets}`;
  return `${m.name} ${m.plural ? 'are' : 'is'} at ${Math.floor(near.share * 100)}%, ${days === 1 ? '1 day' : `${days} days`} to go`;
}

/** The sentence, in its parts, or `null` when nothing was read to say it from. */
export function healthSaid(copy: CopyState, usage: UsageState): Part[] | null {
  const bad: string[] = [];
  const good: string[] = [];
  if (copy === 'missing') bad.push('No copy last night');
  if (copy === 'in') good.push('last night’s copy is in');
  if (usage !== null) {
    if (usage.near) bad.push(nearSaid(usage.near, usage.daysLeft, usage.resets));
    else good.push(`nothing runs out before ${usage.resets}`);
  }
  if (bad.length === 0 && good.length === 0) return null;
  if (bad.length === 0) return [{ text: `All healthy: ${good.join(', and ')}.` }];

  const parts: Part[] = [];
  bad.forEach((b, i) => {
    if (i > 0) parts.push({ text: ', and ' });
    parts.push({ text: i > 0 ? lower(b) : b, needs: true });
  });
  if (good.length > 0) parts.push({ text: `, and ${good.join(', and ')}` });
  parts.push({ text: '.' });
  return parts;
}
