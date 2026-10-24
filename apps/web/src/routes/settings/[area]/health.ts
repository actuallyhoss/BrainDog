/**
 * The one sentence under Settings' title: the worst thing, or nothing (U-C7). "BrainDog could not send a mail.", "Last
 * night's copy did not run. Backups", "No copy last night." or "Runs are at 91%, 2 days to go.", marked. A record with
 * nothing wrong has no line at all, and Slash's model is said in Settings > Agents, never here.
 *
 * WHAT IS BROKEN LEADS (AGT-C06, ENG-A02, PRF-A05). It said "All healthy" on his record the day a model job died in
 * Decide, because it read the copies and the meters only. Open faults come first, then a red check, and only then the
 * copy and the month. Since 24 October only the first is said, and a good state is said by no line at all.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE. `+page.svelte` reads the record and hands the answers here; this file
 * says what they mean and never asks the record anything.
 *
 * NOTHING IS SAID THAT WAS NOT READ. A host that keeps no copies, or a record with none yet, says nothing about copies;
 * a host with no ledger says nothing about usage; a record whose build has no faults, no engine read or no signs says
 * nothing of them, and never "healthy" in their place. With nothing read there is no sentence at all.
 */

import type { MeterKey } from '../../../lib/record/actions.ts';

/**
 * A piece of the sentence. `needs` marks what is wrong, which turns the line's dot to `--warn`; the words stay in ink
 * (agents F13). `href` makes it a link, and the one link is the "Look" at the line's end, in `--red`.
 */
export type Part = { text: string; needs?: true; href?: string };

/** One open fault as the record's `faults()` answers it: its sentence, how many times, since when. */
export type Fault = { cause: string; said: string; count: number; since: string; last: string; error?: string };

/**
 * The engine as `engineHealth()` answers it, the part this sentence and `engineLines` read. The four fields beside the
 * state are `@braindog/slash`'s (ENG-A05, ENG-A06), each absent where the ledger had nothing to say or the host is older.
 */
export type Engine = {
  health: {
    state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
    answeredBy?: { model: string; at: string } | null | undefined;
    lastWords?: string | null | undefined;
    doubleShare?: number | undefined;
    doubleOf?: { twice: number; asks: number } | undefined;
    /** How many times the walk passed over a model that kept failing and asked the next one. */
    passedOver?: number | undefined;
  };
  said: { text: string; whose: 'ours' | 'yours' | null };
};

/** One vital sign as `signs()` answers it, the part this sentence reads: its state, and its own sentence when red. */
export type Sign = { sign: string; state: 'green' | 'red' | 'none'; said?: string };

/** The word of the link at the line's end, to where the signs are shown. */
export const LOOK = 'Look';

/** The word of the link at the line's end when what needs a look is a copy: Backups, where the copies are. */
export const BACKUPS = 'Backups';

/**
 * A sign's sentence as the line says it: the thing that happened, without the record's framing in front of it. The
 * questions sign says "Something went wrong, not a choice for you: The backup on 3 Sep did not run." on the Health page,
 * where the framing tells it from the questions that are choices; on this one line it was eleven words before the news.
 */
export const plainSign = (said: string): string => said.replace(/^Something went wrong, not a choice for you:\s*/u, '').trim();

/** Whether a sentence is about a copy of the record, so its link is Backups rather than the signs. */
export const aboutCopies = (said: string): boolean => /\b(backups?|snapshots?|nightly cop(y|ies))\b/iu.test(said);

/**
 * What else was read, each `null` or absent where it was not: a build without the method, a refusal, a host that hands
 * none. `signsAt` is where the signs are shown, so the count is a link to them; without it the count is plain words.
 */
export type More = {
  faults?: readonly Fault[] | null;
  engine?: Engine | null;
  signs?: readonly Sign[] | null;
  signsAt?: string | null;
  /** Where the copies are, so a line about a copy links there and says so; absent, it links where the signs are. */
  backupsAt?: string | null;
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

/** The phrase for a meter that is near its limit, or past it. */
export function nearSaid(near: { key: MeterKey; share: number }, days: number, resets: string): string {
  const m = METER[near.key];
  if (near.share >= 1) return `${m.name} ${m.plural ? 'are' : 'is'} used up until ${resets}`;
  return `${m.name} ${m.plural ? 'are' : 'is'} at ${Math.floor(near.share * 100)}%, ${days === 1 ? '1 day' : `${days} days`} to go`;
}

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A sentence that ends as one, whatever the record wrote. */
const ended = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The engine's states that are a fault: no model answers, or his own key will not open. */
const DOWN = new Set<Engine['health']['state']>(['not_answering', 'key_closed']);

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

/** The first sentence of a record's sentence, ended: "BrainDog could not send a mail." of a longer one. */
const firstSentence = (said: string): string => {
  const t = said.trim();
  const cut = t.indexOf('. ');
  return ended(cut < 0 ? t : t.slice(0, cut + 1));
};

/**
 * THE ONE SENTENCE, IN ITS PARTS: THE WORST THING, OR NOTHING (U-C7). An open fault, the one broken longest; then a red
 * check, by its own sentence; then a night with no copy; then a meter near its limit. Only the first that holds is said,
 * as one plain sentence, marked, with the one link to where it is shown. "and 9 more" and the model's status are gone:
 * the rest is on the Health page, and the model is Settings > Agents' (`SlashAsks`). With nothing wrong, `null`.
 */
export function healthSaid(copy: CopyState, usage: UsageState, more: More = {}): Part[] | null {
  const fault = leadFault(more.faults);
  if (fault) return [{ text: firstSentence(fault.said), needs: true }];
  if ((redSigns(more.signs) ?? 0) > 0) {
    const raw = more.signs?.find((x) => x.state === 'red' && typeof x.said === 'string' && x.said.trim() !== '')?.said;
    const named = raw === undefined ? 'One check needs a look' : plainSign(raw).replace(/[.!?]$/u, '');
    const link = aboutCopies(named) && more.backupsAt ? { text: BACKUPS, href: more.backupsAt } : more.signsAt ? { text: LOOK, href: more.signsAt } : null;
    return [{ text: `${named}.`, needs: true }, ...(link ? [{ text: ' ' }, link] : [])];
  }
  if (copy === 'missing') return [{ text: 'No copy last night.', needs: true }, ...(more.backupsAt ? [{ text: ' ' }, { text: BACKUPS, href: more.backupsAt }] : [])];
  if (usage?.near) return [{ text: `${upper(nearSaid(usage.near, usage.daysLeft, usage.resets))}.`, needs: true }];
  return null;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How long ago, by the reader's own calendar: today, yesterday, 2 days ago, and a date after four weeks. */
export function dayAgo(iso: string, now: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date(now);
  const days = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 28) return `${days} days ago`;
  const day = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  return `on ${d.getFullYear() === n.getFullYear() ? day : `${day} ${d.getFullYear()}`}`;
}

/**
 * A model by its own name: `@cf/vendor/glm-5.3-flash` reads `glm-5.3-flash`. The provider's path in front of it is an
 * address, which a person never reads; the last part is the name the provider gives it.
 */
export const modelName = (model: string): string => model.split('/').filter((p) => p !== '').at(-1)?.replace(/^@/, '') ?? '';

/**
 * The lines under Slash's sentence in Settings (ENG-A05, ENG-A06, "health shown"): which model answered last and when,
 * the provider's own words under a failure, and how often an ask needed a second model. "Rules are the fallback, not
 * the engine.", so a fallback that is doubling the bill is said, and only once it has happened.
 *
 * EACH LINE ONLY FROM WHAT WAS READ. A host older than these fields hands none of them, and nothing is drawn; `off` is
 * said by Slash's own row. The provider's words are already scrubbed by the engine, and are shown only under a failure,
 * since words from a failure the engine has since recovered from would read as one still going on.
 */
export function engineLines(engine: Engine | null | undefined, now: number): string[] {
  if (!engine || engine.health.state === 'off') return [];
  const h = engine.health;
  const lines: string[] = [];
  const by = h.answeredBy ? modelName(h.answeredBy.model) : '';
  const when = h.answeredBy ? dayAgo(h.answeredBy.at, now) : null;
  if (by !== '' && when !== null) lines.push(`Answered by ${by} ${when}.`);
  const words = h.lastWords?.trim() ?? '';
  if (DOWN.has(h.state) && words !== '') lines.push(`${h.state === 'key_closed' ? 'Your key’s provider' : 'The provider'} said: ${words}`);
  const twice = h.doubleOf;
  if ((h.doubleShare ?? 0) > 0 && twice && twice.twice > 0 && twice.asks > 0)
    lines.push(`Needed a second model for ${twice.twice} of ${twice.asks} ${twice.asks === 1 ? 'ask' : 'asks'}.`);
  if ((h.passedOver ?? 0) > 0) lines.push(`Skipped a failing model ${h.passedOver} ${h.passedOver === 1 ? 'time' : 'times'} and asked the next one.`);
  return lines;
}
