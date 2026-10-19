/**
 * What comes in, by the way it came: one line per way in, with when the last thing arrived by it and how many arrived
 * on each of the last fourteen days.
 *
 * BY THE CHANNEL THE RECORD KEEPS, and nothing guessed from a sender. `email`, `webhook`, `api`, `pull` and `paste` are
 * the kernel's own five (`CHANNELS` in `packages/kernel/src/ingest.ts`), and each is said as a person says it: mail,
 * texts and other apps posting in, agents, imports, and what was pasted.
 *
 * THE THREE EVERYDAY WAYS IN ARE ALWAYS SAID, even before anything has come in by them, so a new record's Inbox says how
 * things reach it rather than opening on a blank board. An import or a paste is said once something came in that way.
 *
 * COUNTED OVER WHAT WAS READ. The read stops after a few pages, so on a busy record the oldest days can be short, and
 * `partial` says so rather than drawing a quiet fortnight that was not quiet.
 *
 * AND WHETHER THE NEWEST MAIL WAS SIGNED (REC-A15). Mail the host could not check the sender's signature on is stored
 * with the kernel's `UNVERIFIED` reason and is never matched, so Mail's well says which of the two the last one was,
 * from the reason the arrival already carries. A read that did not carry the reason says nothing rather than "signed".
 *
 * PURE, so `node --test` holds it.
 */

import { UNVERIFIED } from '@braindog/kernel';
import { dayOf, daysBetween } from '../../lib/work/board.ts';
import type { IconName } from '../../lib/ui/icons.ts';

/** How many days the arrivals line covers, today included. */
export const SOURCE_DAYS = 14;

/**
 * One way in, as the tile draws it. `days` is oldest first and ends today. `signed` is Mail's alone: whether the newest
 * mail was signed, in words, and absent when nothing says (no mail yet, or a read that did not carry the reason).
 */
export type Source = { channel: string; name: string; icon: IconName; last: string | null; days: number[]; total: number; signed?: string };

/** What each channel is called and the glyph its well wears. */
const SAID: Readonly<Record<string, { name: string; icon: IconName }>> = {
  email: { name: 'Mail', icon: 'inbox' },
  webhook: { name: 'Texts and apps', icon: 'plug' },
  api: { name: 'Agents', icon: 'session' },
  pull: { name: 'Imports', icon: 'download' },
  paste: { name: 'Pasted in', icon: 'copy' },
};

/** The ways in said even with nothing through them yet, in this order. */
export const EVERYDAY: readonly string[] = ['email', 'webhook', 'api'];

/** A channel the kernel adds later is said by its own word, with the inbox's glyph, until it has words here. */
const saidOf = (channel: string): { name: string; icon: IconName } =>
  SAID[channel] ?? { name: channel.charAt(0).toUpperCase() + channel.slice(1), icon: 'inbox' };

/**
 * Every way in, from the arrivals read, newest first by its last arrival and then the everyday ways nothing came by.
 * An arrival whose time will not read is left out of the days and the last arrival, and still counted as having come.
 */
export function sourcesOf(lines: readonly { channel: string; ts: string; reason?: string | null }[], now: number): Source[] {
  const today = dayOf(now);
  const by = new Map<string, Source>();
  let newestMail: { reason?: string | null } | null = null;
  const make = (channel: string): Source => ({ channel, ...saidOf(channel), last: null, days: Array<number>(SOURCE_DAYS).fill(0), total: 0 });
  for (const line of lines) {
    const s = by.get(line.channel) ?? make(line.channel);
    by.set(line.channel, s);
    const at = Date.parse(line.ts);
    if (!Number.isFinite(at)) continue;
    if (s.last === null || at > Date.parse(s.last)) {
      s.last = line.ts;
      if (line.channel === 'email') newestMail = line;
    }
    const back = daysBetween(dayOf(at), today);
    if (back >= 0 && back < SOURCE_DAYS) {
      const i = SOURCE_DAYS - 1 - back;
      s.days[i] = (s.days[i] ?? 0) + 1;
      s.total++;
    }
  }
  const signed = mailSignedOf(newestMail);
  const mail = by.get('email');
  if (mail && signed !== null) mail.signed = signed;
  const came = [...by.values()].sort((a, b) => (Date.parse(b.last ?? '') || 0) - (Date.parse(a.last ?? '') || 0));
  const quiet = EVERYDAY.filter((c) => !by.has(c)).map(make);
  return [...came, ...quiet];
}

/** The two things Mail's well can say about the newest mail's signature. */
export const signedWords = {
  signed: 'The sender signed the last mail',
  unsigned: 'The last mail was not signed, so it cannot be matched. Check the forwarding.',
} as const;

/**
 * Whether the newest mail was signed, in words: `null` with no mail, or when the arrival read did not carry its reason
 * at all (`reason` absent), so an old read never says "signed" about mail it knows nothing of. Any other reason, or
 * none, is mail the record checked and could match.
 */
export function mailSignedOf(latest: { reason?: string | null } | null): string | null {
  if (latest === null || latest.reason === undefined) return null;
  return latest.reason === UNVERIFIED ? signedWords.unsigned : signedWords.signed;
}

/** Whether a line is worth drawing: three days or more with something in them, else the count says it. */
export const drawsLine = (s: Source): boolean => s.days.filter((n) => n > 0).length >= 3;

/** The words under a way in's name. */
export function lastSaid(s: Source, since: (iso: string) => string): string {
  return s.last === null ? 'Nothing has come in this way yet' : `Last in ${since(s.last)}`;
}

/** The count at the right of a way in, for the fortnight. */
export const countSaid = (n: number): string => (n === 0 ? 'None in 14 days' : `${n.toLocaleString('en-GB')} in 14 days`);

/** The sentence a way in's line reads as. */
export const lineSaid = (s: Source): string => `${s.name}: ${s.total.toLocaleString('en-GB')} arrived over the last 14 days`;

/* ── an inbox nothing has ever reached ───────────────────────────────────── */

/**
 * Whether nothing has come in at all, by any way: the record's own tally is nought waiting, nought filed and nought
 * archived, nothing is drawn waiting, and no way in has an arrival.
 *
 * THEN THE BOARD IS ONE TILE. It was three: "What comes in" with "Nothing has come in this way yet" on each of its
 * three rows, "Your rules" with a nought and a line about rules, and "Nothing waits in the inbox" under both, which is
 * one fact said five times. One tile says it once, with the one thing to do about it.
 *
 * THE TALLY DECIDES, because it is the record's count of every arrival there has been; the ways in only cover a
 * fortnight. A record that answered no tally is not said to be empty: a quiet fortnight is not "nothing yet".
 */
export function nothingEver(
  tally: { waiting: number; filed: number; archived: number } | null,
  ways: readonly Pick<Source, 'last'>[] | null,
  waiting: number,
): boolean {
  if (tally === null || waiting > 0) return false;
  if (tally.waiting + tally.filed + tally.archived > 0) return false;
  return ways === null || ways.every((w) => w.last === null);
}

/** The one tile's words: what the inbox is for, by the ways in a person has, and the press that adds one. */
export const quietWords = {
  title: 'Nothing has come in yet',
  why: 'Forward mail or texts to your address and they land here.',
  add: 'Add a way in',
} as const;
