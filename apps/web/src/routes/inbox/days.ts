/**
 * What the Inbox says about itself: its arrivals grouped by the day they came, the sentence under its title, and the
 * one tile it draws.
 *
 * THE DAY IS THE READER'S, on their own wall clock, as Work's days are (`lib/work/board.ts`): an email that came in at
 * 23:40 is yesterday's to the person reading it this morning, whatever the server's zone.
 *
 * THE TALLY IS THE RECORD'S AND NOTHING COUNTED HERE, for the reason `series.ts` gives: a page holds at most one page of
 * arrivals, and a sum over it would stop at the page. The sentence and the tile read the tally, or say nothing.
 *
 * PURE, so `node --test` holds it.
 */

import { dayOf, daySaid, daysBetween } from '../../lib/work/board.ts';
import type { Tally } from './series.ts';

/** One day of arrivals, newest first as they came: the day, how it is headed, and what arrived in it. */
export type Day<T> = { day: string; label: string; items: T[] };

/** A day as its heading says it: Today, Yesterday, `Mon 28 Sep`, and the year when it is not this one. */
export function dayLabel(day: string, today: string): string {
  const n = daysBetween(day, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return day.slice(0, 4) === today.slice(0, 4) ? daySaid(day) : `${daySaid(day)} ${day.slice(0, 4)}`;
}

/**
 * The arrivals by the day they arrived, in the order they were handed (newest first), so the cursor walks the rows in
 * the order they are drawn and never jumps between days. An arrival whose time will not read is today's rather than
 * lost.
 */
export function daysOf<T extends { arrived: string }>(items: readonly T[], now: number): Day<T>[] {
  const today = dayOf(now);
  const out: Day<T>[] = [];
  for (const item of items) {
    const at = Date.parse(item.arrived);
    const day = Number.isFinite(at) ? dayOf(at) : today;
    const last = out.at(-1);
    if (last && last.day === day) last.items.push(item);
    else {
      const had = out.find((d) => d.day === day);
      if (had) had.items.push(item);
      else out.push({ day, label: dayLabel(day, today), items: [item] });
    }
  }
  /* NEWEST DAY FIRST, whatever order the days were met in: a filed series is handed in the order it was filed, which
     need not be the order its days fall in. */
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** How long an arrival may wait before the sentence says so in red: two days. */
export const WAITED_TOO_LONG_MS = 2 * 86_400_000;

/** The sentence under the title, and the phrase inside it that needs him, when one does. */
export type Sentence = { text: string; needs?: string };

const things = (n: number): string => (n === 1 ? '1 thing waits on you' : `${n.toLocaleString('en-GB')} things wait on you`);

/**
 * The title row's sentence, from the record's tally.
 *
 * RED ONLY FOR WHAT HAS WAITED. What waits is news, and it becomes something that needs him once the oldest of it has
 * sat for more than two days. `oldest` is the oldest arrival drawn; when there are older pages still unread, the real
 * oldest is older still, so a red said from it is never wrong. `null` when nothing waits (the empty state says it) or
 * the record sent no tally.
 */
export function sentenceOf(tally: Tally | null, oldest: string | null, now: number): Sentence | null {
  if (!tally || tally.waiting <= 0) return null;
  const waiting = things(tally.waiting);
  const at = oldest ? Date.parse(oldest) : Number.NaN;
  const late = Number.isFinite(at) && now - at > WAITED_TOO_LONG_MS;
  const ruled = tally.ruled === null ? '' : tally.ruled === 0 ? '; no rule filed anything this week' : `; rules filed ${tally.ruled.toLocaleString('en-GB')} this week`;
  const text = `${waiting}${ruled}.`;
  return late ? { text, needs: waiting } : { text };
}

/**
 * The "Who filed it" tile: rules this week as the figure, and the whole as one bar.
 *
 * THREE PARTS, AND THE MIDDLE ONE IS NOT A WEEK. `filed` is every filing the record holds, a rule's included, so what is
 * left once this week's rules are taken off is "filed earlier", and it is never said as a week's figure. What still
 * waits for a person is `ink` (the accent), the one that matters; rules are its tint and the rest the grey for "other".
 * `null` from a host with no weekly count.
 *
 * AND `null` WHEN IT HAS NOTHING TO SAY: no rule filed anything this week and nothing waits, so the tile would be a 0
 * over an empty bar beside an inbox that already says it is clear (an unused part is not drawn).
 */
export function whoFiledOf(tally: Tally | null): { figure: number; parts: { label: string; value: number; tone: string }[]; reading: string } | null {
  if (!tally || tally.ruled === null) return null;
  const ruled = Math.max(0, tally.ruled);
  const earlier = Math.max(0, tally.filed - ruled);
  const waiting = Math.max(0, tally.waiting);
  if (ruled === 0 && waiting === 0) return null;
  const n = (v: number) => v.toLocaleString('en-GB');
  return {
    figure: ruled,
    parts: [
      { label: 'By rules this week', value: ruled, tone: 'g2' },
      { label: 'Filed earlier', value: earlier, tone: 'g4' },
      { label: 'Waiting', value: waiting, tone: 'ink' },
    ],
    reading:
      waiting === 0
        ? `Rules filed ${n(ruled)} this week, and nothing waits for a person.`
        : `Rules filed ${n(ruled)} this week; ${n(waiting)} still ${waiting === 1 ? 'waits' : 'wait'} for a person.`,
  };
}

/**
 * The figure over the Inbox: what the rules filed this week, said even at none, since it is the one number that says
 * whether the rules are doing their work. `null` from a host with no weekly count, never a guessed zero.
 */
export function figureOf(tally: Tally | null): { figure: number; unit: string; reading: string } | null {
  if (!tally || tally.ruled === null) return null;
  const ruled = Math.max(0, tally.ruled);
  return {
    figure: ruled,
    unit: 'filed by your rules this week',
    reading:
      ruled === 0
        ? 'A rule files what comes in as it arrives. Make one from any message that comes in twice.'
        : tally.waiting === 0
          ? 'Nothing is waiting for you.'
          : `${tally.waiting.toLocaleString('en-GB')} still ${tally.waiting === 1 ? 'waits' : 'wait'} for you.`,
  };
}
