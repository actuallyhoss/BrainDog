/**
 * The one sentence under Settings' title: the worst thing, or nothing. "BrainDog could not send a mail.", "Last
 * night's copy did not run. Backups", "No copy last night." or "Runs are at 91%, 2 days to go.", marked. A record with
 * nothing wrong has no line at all, and Slash's model is said in Settings > Agents, never here.
 *
 * WHAT IS BROKEN LEADS. It said "All healthy" on his record the day a model job died in
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

import { KEEP_RATES_AT } from '@braindog/declare';
import type { MeterKey } from '../../../lib/record/actions.ts';

/**
 * A piece of the sentence. `needs` marks what is wrong, which turns the line's dot to `--warn`; the words stay in ink
 * (agents F13). `href` makes it a link, and the one link is the "Look" at the line's end, in `--red`.
 */
export type Part = { text: string; needs?: true; href?: string };

/** One open fault as the record's `faults()` answers it: its sentence, how many times, since when, and a failed night's reason. */
export type Fault = { cause: string; said: string; count: number; since: string; last: string; error?: string; why?: string };

/**
 * The engine as `engineHealth()` answers it, the part this sentence and `engineLines` read. The four fields beside the
 * state are `@braindog/slash`'s, each absent where the ledger had nothing to say or the host is older.
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
export type Sign = {
  sign: string;
  state: 'green' | 'red' | 'none';
  said?: string;
  /**
   * The heading the sign is said under, and where it is mended (AG7). A record's own failure is headed by its own words
   * ("The backup on 3 Sep did not run") and carries `to`, its question; its `said` is then the follow-on ("It waits on you
   * in Needs you"), which on this one line lost what it was about (AJ3). With `to`, the line leads with the name.
   */
  name?: string;
  to?: string;
};

/** The words of the link at the line's end, to where the signs are shown. They name the place (skills pass follow-up,
    2 Nov): a bare "Look" read as nothing to somebody moving through the page's links. */
export const LOOK = 'Open Health';

/** The words of the link at the line's end when the failure waits as a question. */
export const LOOK_QUESTION = 'Open it in Needs you';

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
  /**
   * Where what came in waits, for a reader who may open it: a line about messages waiting to be filed opens them,
   * rather than the signs page saying the same line again. Absent, it links where the signs are.
   */
  inboxAt?: string | null;
  /** The record's own now, so a backup that missed last night is said as last night's (G1). */
  now?: number;
};

/**
 * "The backup on 3 Sep did not run" AS "Last night's backup did not run" when the day it names is today or yesterday by
 * the record's clock (G1): the dated line wrapped to two lines at 390, and the date was the one word a person had to
 * work out. Any older day keeps its date, which is then the news.
 */
export function nightOf(said: string, now: number | undefined): string {
  const m = /^The backup on (\d{1,2}) ([A-Z][a-z]{2}) did not run$/u.exec(said);
  if (!m || now === undefined) return said;
  const month = SHORT_MONTHS.indexOf(m[2]!);
  for (const back of [0, 1]) {
    const d = new Date(now - back * 86_400_000);
    if (d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === month) return "Last night's backup did not run";
  }
  return said;
}

/** The word of the link at the line's end when what needs a look is messages waiting: they open where they wait. */
/** The word of the link when the newest exchange rate is old. */
export const KEEP_RATES = 'Keep rates current';
/** Money's switch for it (`routes/addons/[id]/rates-switch.ts`). */

export const OPEN_THEM = 'Open the inbox';

/** The two signs about an old exchange rate, whose line links to what keeps rates current. */
const RATE_SIGNS: ReadonlySet<string> = new Set(['rates-current', 'rate-age']);

/** The word of the link when the feed of rates is paused, and where scheduled actions are started again. */
export const OPEN_FEED = 'Open the feed of rates';
const SCHEDULED_AT = '/automations?tab=scheduled';

/** The sign that counts messages waiting to be filed. */
const ARRIVALS = 'arrivals-filed';

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
 * THE ONE SENTENCE, IN ITS PARTS: THE WORST THING, OR NOTHING. An open fault, the one broken longest; then a red
 * check, by its own sentence; then a night with no copy; then a meter near its limit. Only the first that holds is said,
 * as one plain sentence, marked, with the one link to where it is shown. "and 9 more" and the model's status are gone:
 * the rest is on the Health page, and the model is Settings > Agents' (`SlashAsks`). With nothing wrong, `null`.
 */
export function healthSaid(copy: CopyState, usage: UsageState, more: More = {}): Part[] | null {
  const fault = leadFault(more.faults);
  if (fault) return [{ text: firstSentence(fault.said), needs: true }];
  if ((redSigns(more.signs) ?? 0) > 0) {
    const lead = more.signs?.find((x) => x.state === 'red' && typeof x.said === 'string' && x.said.trim() !== '');
    const headed = typeof lead?.to === 'string' && lead.to.startsWith('/') && typeof lead.name === 'string' && lead.name.trim() !== '';
    const raw = headed ? lead!.name : lead?.said;
    const named = raw === undefined ? 'One check needs a look' : nightOf(upper(plainSign(raw).replace(/[.!?]$/u, '')), more.now);
    const link =
      /* AN OLD RATE LINKS TO WHAT CURES IT: a feed that is paused to where scheduled actions start again, anything else to
         the switch that keeps rates current, in Money's settings. Both rate signs, by their ids: "How old is the newest
         rate" never says "exchange", and its red line had no link. */
      lead !== undefined && RATE_SIGNS.has(lead.sign) && /\bfeed of rates is paused\b/iu.test(raw ?? '')
        ? { text: OPEN_FEED, href: SCHEDULED_AT }
        : (lead !== undefined && RATE_SIGNS.has(lead.sign)) || (/\bexchange rates?\b/iu.test(named) && /\bold\b/iu.test(named))
        ? { text: KEEP_RATES, href: KEEP_RATES_AT }
        : lead?.sign === ARRIVALS && more.inboxAt
        ? { text: OPEN_THEM, href: more.inboxAt }
        : headed
          ? { text: LOOK_QUESTION, href: lead!.to! }
          : aboutCopies(named) && more.backupsAt
          ? { text: BACKUPS, href: more.backupsAt }
          : more.signsAt
            ? { text: LOOK, href: more.signsAt }
            : null;
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
 * A NIGHT'S COPY THAT FAILED, AND WHY, IN PLAIN WORDS (scope 2026-10-24 A22). A failed night is a fault and never a
 * question (`kernel/src/copies.ts`, cause `night#export.night`), so Backups, which looked only for the question a night
 * used to open, said nothing of it while the index said a copy failed. This is what Backups says instead: the fault's own
 * sentence, then why and since when.
 *
 * THE RAW ERROR IS NEVER SAID. It reaches only a self-host's owner (`record/src/methods/faults.ts`), and it is an
 * engineer's line ("the dump ended 12 bytes short..."), so it is read for which of a few known reasons it is and said as
 * that reason. On the Cloud there is no error to read: the copies are ours to fix, and the night's failure reached us.
 */
export type NightFailed = { said: string; why: string };

/** The fault a failed night raises (`NIGHT_FAULT` in the kernel), found by its door so a renamed kind still finds it. */
export const isNightFault = (f: Fault): boolean => f.cause.startsWith('night#');

/** The known reasons: the engineer's words each is read from, and the person's words it is said as. */
const NIGHT_REASONS: readonly [RegExp, string][] = [
  [/no BLOBS binding|nowhere to put/iu, 'This server has no place set up to keep copies.'],
  [/bytes short|wrote \d+ of the|could not be read back/iu, 'The copy came out incomplete, so it was not kept.'],
  [/would not export|cannot open the record/iu, 'Your BrainDog could not be read out for the copy.'],
  [/overloaded|too busy|timed? ?out/iu, 'Your BrainDog was too busy to be copied at the time.'],
  [/\bkey\b|seal|encrypt/iu, 'The key that locks your copies could not be used.'],
];

/** Why a night failed, in a person's words: a known reason, or the plain line for one this host does not name. */
export function nightReason(error: string | undefined): string {
  if (error === undefined || error.trim() === '') return 'We were told when it failed, and fixing it is ours.';
  return NIGHT_REASONS.find(([at]) => at.test(error))?.[1] ?? 'Something went wrong while it was being saved.';
}

/**
 * The failed night Backups says, or `null` with none open: the fault's sentence, then its reason and how long it has
 * been failing ("It has failed 3 times, first 2 days ago, last today."), every word of it plain.
 */
export function nightFailed(faults: readonly Fault[] | null | undefined, now: number): NightFailed | null {
  const f = (faults ?? []).find(isNightFault);
  if (f === undefined) return null;
  const last = dayAgo(f.last, now);
  const first = dayAgo(f.since, now);
  const times =
    f.count > 1 && first !== null && last !== null && first !== last
      ? ` It has failed ${f.count} times, first ${first}, last ${last}.`
      : last !== null
        ? ` It failed ${last}.`
        : '';
  /* THE RECORD'S OWN PLAIN REASON FIRST (`why`, the kernel's `nightWhy`), which every owner is handed on every host; the
     raw error is read only where the record sent no reason, as a build before `why` did. */
  const why = typeof f.why === 'string' && f.why.trim() !== '' ? f.why.trim() : nightReason(f.error);
  return { said: firstSentence(f.said), why: `${why}${times}` };
}

/**
 * A model by its own name: `@cf/vendor/glm-5.3-flash` reads `glm-5.3-flash`. The provider's path in front of it is an
 * address, which a person never reads; the last part is the name the provider gives it.
 */
export const modelName = (model: string): string => model.split('/').filter((p) => p !== '').at(-1)?.replace(/^@/, '') ?? '';

/**
 * The lines under Slash's sentence in Settings ("health shown"): which model answered last and when,
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
    lines.push(`Needed a second model for ${twice.twice} of ${twice.asks} ${twice.asks === 1 ? 'question' : 'questions'}.`);
  if ((h.passedOver ?? 0) > 0) lines.push(`Skipped a failing model ${h.passedOver} ${h.passedOver === 1 ? 'time' : 'times'} and asked the next one.`);
  return lines;
}
