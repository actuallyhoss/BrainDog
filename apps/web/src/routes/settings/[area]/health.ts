/**
 * The one sentence under Settings' title: what is broken, whether Slash's model answers, how many vital signs need a
 * look, whether last night's copy is in, and whether anything runs out before the month resets. "All healthy: Slash's
 * model answered 3 hours ago, last night's copy is in, and nothing runs out before 1 October." The phrase that needs
 * him is marked, and only when something does: "One thing is not working: ...", "No copy last night", or "Runs are at
 * 91%, 2 days to go".
 *
 * WHAT IS BROKEN LEADS (AGT-C06, ENG-A02, PRF-A05). It said "All healthy" on his record the day a model job died in
 * Decide, because it read the copies and the meters only. Open faults come first, then the engine when it is not
 * answering, then the red vital signs as a count, and only then the copy and the month. A good state of any of them
 * joins "All healthy"; a bad one is its own sentence ahead of it, and "All healthy" is never said beside one.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE. `+page.svelte` reads the record and hands the answers here; this file
 * says what they mean and never asks the record anything.
 *
 * NOTHING IS SAID THAT WAS NOT READ. A host that keeps no copies, or a record with none yet, says nothing about copies;
 * a host with no ledger says nothing about usage; a record whose build has no faults, no engine read or no signs says
 * nothing of them, and never "healthy" in their place. With nothing read there is no sentence at all.
 */

import type { MeterKey } from '../../../lib/record/actions.ts';

/** A piece of the sentence; `needs` marks the phrase drawn in `--danger`, and `href` makes it a link. */
export type Part = { text: string; needs?: true; href?: string };

/** One open fault as the record's `faults()` answers it: its sentence, how many times, since when. */
export type Fault = { cause: string; said: string; count: number; since: string; last: string; error?: string };

/** The engine as `engineHealth()` answers it, the part this sentence reads. */
export type Engine = {
  health: { state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed' };
  said: { text: string; whose: 'ours' | 'yours' | null };
};

/** One vital sign as `signs()` answers it, the part this sentence reads. */
export type Sign = { sign: string; state: 'green' | 'red' | 'none' };

/**
 * What else was read, each `null` or absent where it was not: a build without the method, a refusal, a host that hands
 * none. `signsAt` is where the signs are shown, so the count is a link to them; without it the count is plain words.
 */
export type More = {
  faults?: readonly Fault[] | null;
  engine?: Engine | null;
  signs?: readonly Sign[] | null;
  signsAt?: string | null;
};

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

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A list said as people say it: "a", "a, and b", "a, b, and c". */
const joined = (xs: readonly string[]): string => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

/** A sentence that ends as one, whatever the record wrote. */
const ended = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The engine's states that are a fault: no model answers, or his own key will not open. */
const DOWN = new Set<Engine['health']['state']>(['not_answering', 'key_closed']);

/** The engine's states that join "All healthy". `off` is said by Slash's own row, and here it is nothing. */
const UP = new Set<Engine['health']['state']>(['answering', 'never_asked']);

/**
 * The fault the sentence leads with and Try again acts on: the one broken longest, so a fault that keeps coming back
 * does not push an older one out of sight.
 */
export function leadFault(faults: readonly Fault[] | null | undefined): Fault | null {
  if (!faults || faults.length === 0) return null;
  return [...faults].sort((a, b) => a.since.localeCompare(b.since))[0] ?? null;
}

/** How many vital signs are red now, or `null` when none was read. */
export function redSigns(signs: readonly Sign[] | null | undefined): number | null {
  return signs ? signs.filter((s) => s.state === 'red').length : null;
}

/**
 * How many vital signs have not been read yet, the ones that read `none`, or `null` when no sign was handed at all.
 *
 * A SIGN NOBODY HAS READ IS NOT WELL, IT IS UNREAD (the Health page's Not read yet). Counting red alone said "All healthy"
 * of a record whose every sign was `none`, so the unread are counted too and said beside the good parts.
 */
export function unreadSigns(signs: readonly Sign[] | null | undefined): number | null {
  return signs ? signs.filter((s) => s.state === 'none').length : null;
}

/** The sentence, in its parts, or `null` when nothing was read to say it from. */
export function healthSaid(copy: CopyState, usage: UsageState, more: More = {}): Part[] | null {
  /* ── what leads: each its own sentence, marked ─────────────────────────── */
  const lead: Part[][] = [];
  const fault = leadFault(more.faults);
  if (fault) {
    const n = more.faults?.length ?? 1;
    const rest = n - 1;
    lead.push([
      { text: n === 1 ? 'One thing is not working' : `${n} things are not working`, needs: true },
      { text: `: ${ended(fault.said)}${rest === 0 ? '' : rest === 1 ? ' And one more.' : ` And ${rest} more.`}` },
    ]);
  }
  const engine = more.engine ?? null;
  if (engine && DOWN.has(engine.health.state)) {
    /* THE FIRST SENTENCE IS WHAT IS WRONG, and the rest is whose it is and what happens meanwhile, so only it is marked.
       A record that hands no words for it still has the fault said, never passed over. */
    const own = engine.said.text.trim();
    const text = ended(own !== '' ? own : engine.health.state === 'key_closed' ? 'Your own key for Slash will not open' : 'Slash’s model is not answering');
    const cut = text.indexOf('. ');
    lead.push(cut < 0 ? [{ text, needs: true }] : [{ text: text.slice(0, cut + 1), needs: true }, { text: text.slice(cut + 1) }]);
  }
  const red = redSigns(more.signs);
  if (red !== null && red > 0) {
    const said = red === 1 ? 'One vital sign needs a look' : `${red} vital signs need a look`;
    lead.push([{ text: said, needs: true, ...(more.signsAt ? { href: more.signsAt } : {}) }, { text: '.' }]);
  }

  /* ── the copy and the month, as before ─────────────────────────────────── */
  const bad: string[] = [];
  const good: string[] = [];
  if (engine && UP.has(engine.health.state) && engine.said.text.trim() !== '') good.push(engine.said.text.trim().replace(/[.!?]$/, ''));
  if (copy === 'missing') bad.push('No copy last night');
  if (copy === 'in') good.push('last night’s copy is in');
  if (usage !== null) {
    if (usage.near) bad.push(nearSaid(usage.near, usage.daysLeft, usage.resets));
    else good.push(`nothing runs out before ${usage.resets}`);
  }
  /* "ALL HEALTHY" ONLY WHERE THE FAULTS WERE READ AS NONE. A member the record refuses them to, a build without them or
     a read that dropped has the good parts said as they are, never under "All healthy": that is how it said so while a
     model job lay dead. Green signs alone are not "nothing is broken" either; the faults are what says it. */
  const faultsClear = more.faults !== undefined && more.faults !== null && more.faults.length === 0;
  if (lead.length === 0 && faultsClear) good.push('nothing is broken');

  /* UNREAD SIGNS ARE THEIR OWN SENTENCE, LAST, AND NEVER UNDER "ALL HEALTHY": not marked, since nothing is wrong yet, but
     a link to where the signs are shown, as the red count is. */
  const unread = unreadSigns(more.signs) ?? 0;
  const unreadSaid: Part[] =
    unread === 0
      ? []
      : [{ text: unread === 1 ? 'One vital sign has not been read yet' : `${unread} vital signs have not been read yet`, ...(more.signsAt ? { href: more.signsAt } : {}) }, { text: '.' }];

  if (lead.length === 0 && bad.length === 0 && good.length === 0) return unreadSaid.length > 0 ? unreadSaid : null;
  if (lead.length === 0 && bad.length === 0 && unreadSaid.length === 0) return [{ text: faultsClear ? `All healthy: ${joined(good)}.` : `${upper(joined(good))}.` }];

  const parts: Part[] = [];
  const space = (): void => {
    if (parts.length > 0) parts.push({ text: ' ' });
  };
  for (const sentence of lead) {
    space();
    parts.push(...sentence);
  }
  if (bad.length > 0) {
    space();
    bad.forEach((b, i) => {
      if (i > 0) parts.push({ text: ', and ' });
      parts.push({ text: i > 0 ? lower(b) : b, needs: true });
    });
    if (good.length > 0) parts.push({ text: `, and ${joined(good)}` });
    parts.push({ text: '.' });
  } else if (good.length > 0) {
    space();
    parts.push({ text: `${upper(joined(good))}.` });
  }
  if (unreadSaid.length > 0) {
    space();
    parts.push(...unreadSaid);
  }
  return parts;
}
