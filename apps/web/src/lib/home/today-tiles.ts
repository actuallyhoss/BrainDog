/**
 * Today's pictures and sentences, worked out from the record's answers (`lib/record/today-live.ts`) and nothing else:
 * the sentence under the title, the week strip's days and its reading line, the days under it, the agents' spans on the
 * day, what changed since the mark, and what the cash walk says.
 *
 * PURE, AND NO SVELTE, so `node --test` reads every sentence this screen says without mounting it. A figure that is not
 * in the answer is never said: a clause with nothing under it is left out, and a picture with no data is not drawn.
 */

import type { Lane } from '../viz/swimlanes.ts';
import type { WeekDay, WeekItem } from '../viz/weekstrip.ts';
import { addDays, daySaid, daysBetween, weekdayOf } from '../work/board.ts';
import { exponentOf, writeAmount } from 'braindog-render';

import { homeCurrency } from '../record/api.ts';
import type { DayRow, DueRow, Forecast, SessionRow, SinceRow, TaskRow } from '../record/today-live.ts';

/* ── words ──────────────────────────────────────────────────────────────── */

const SPELLED = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;

/** A count as a sentence says it: spelled out to ten, figures after. */
export const counted = (n: number): string => SPELLED[n] ?? n.toLocaleString('en-GB');

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "things" or "thing", by the count. */
const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/**
 * How late a day is against today, IN DAYS ALWAYS: "1 day late", "64 days late". ONE WAY ACROSS THE APP (30 October):
 * a list's cards and tables say days (money F6), and this said "2 months late" on the same screen as "64 days late".
 */
export function lateSaid(due: string, today: string): string {
  const n = Math.max(1, daysBetween(due, today));
  return `${n.toLocaleString('en')} ${plural(n, 'day')} late`;
}

/** How long something has waited, as a person says it: "5 min", "3 hours", "2 days", "3 weeks". */
export function ageSaid(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')}`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} ${plural(days, 'day')}`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${plural(weeks, 'week')}`;
}

/** How long a run has been at it, short enough for the end of a row: "42 min", "1 h 08", "12 h 40". */
export function elapsedSaid(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${Math.max(1, mins)} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
}

/** A day near today, as a sentence names it: "today", "yesterday", "Sunday", or "12 Sep". */
export function dayNamed(day: string, today: string): string {
  const n = daysBetween(day, today);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n > 1 && n < 7) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayOf(day)]!;
  return daySaid(day).replace(/^\S+ /u, '');
}

/* ── the sentence ───────────────────────────────────────────────────────── */

/* THE ONE COUNT OF WHAT NEEDS YOU lives in `need-you.ts`, which the shell imports without this file. */
export { needYouCount } from './need-you.ts';

/** The sentence under the title, and the one phrase in it that needs him, drawn red; `''` when nothing does. */
export type Sentence = { text: string; needs: string };

/** A count in a sentence: always digits, so "8 need you" never stands beside "Seven" in one line. */
const digits = (n: number): string => n.toLocaleString('en-GB');

/** How far past its day something is, in words: "a day", "five days", "three weeks", "two months". */
export function lateBy(due: string, today: string): string {
  const n = Math.max(1, daysBetween(due, today));
  if (n === 1) return 'a day';
  if (n < 14) return `${counted(n)} days`;
  if (n < 60) return `${counted(Math.round(n / 7))} weeks`;
  const months = Math.round(n / 30.44);
  return `${counted(months)} ${plural(months, 'month')}`;
}

/**
 * THE LATE MONEY A SENTENCE SAYS, already written as a person reads it ("£7,200"), by which way it goes: what is owed to
 * you and is late, and the bills you owe that are late. Either may be `null`; per currency, never added across.
 */
export type LateMoney = { owed: string | null; bills: string | null };

/** What the line under Today's title is made of (`sentenceOf`). */
export type SentenceParts = {
  /** The one count of what needs you (`needYouCount`): the badge's number, the tile's and this line's. */
  needYou: number;
  /** The late money the board draws at rest, by which way it goes. */
  late?: LateMoney | null;
  /** Late things with no money on them, said only where no late money is. */
  lateThings?: number;
  /** Whether what is late was read at all, so "Nothing is late" is said only where it was looked for. */
  lateRead?: boolean;
  /** The agents working now. */
  agents: number;
  /** What waits in the inbox, said in place of "Nothing needs you" when nothing else does. */
  inbox?: number;
};

/** What the line says, with something to ask, when nothing is late. */
const NOTHING_LATE = 'nothing is late';

/**
 * "8 need you. £7,200 owed to you is late, and £10,540 you owe. 2 agents are working." (spec 4.1, today F2, and the
 * Today polish of 20 October: short sentences.) WHAT NEEDS YOU LEADS, as the badge's number and in red; the late money
 * is its own sentence, or "Nothing is late." with something to ask; who is working closes it, in ink.
 * Numbers are always digits. With nothing needing you it says so ("Nothing needs you."), and then the late money,
 * when there is some, is the red phrase, since it is the one thing that wants a look.
 *
 * "NOTHING NEEDS YOU" ONLY WHEN NOTHING DOES: with something in the inbox and no question, the line says that
 * in its place.
 */
export function sentenceOf({ needYou, late = null, lateThings = 0, lateRead = late !== null, agents, inbox = 0 }: SentenceParts): Sentence {
  /* WHAT IS LATE, ONE SENTENCE: what is owed to you first, then the bills, each left out at nought. */
  const owed = late?.owed ? `${late.owed} owed to you` : null;
  /* WHAT YOU OWE: the late bills and invoices, the same rows and sum as Money's "Bills late" (`lateSumsOf`, VERIFY H7).
     A missed repeat or a lapsed renewal is a late thing, counted in the foot, not here. */
  const bills = late?.bills ? `${late.bills} you owe` : null;
  const lateClause =
    owed && bills
      ? `${owed} is late, and ${bills}`
      : owed
        ? `${owed} is late`
        : bills
          ? `${bills} is late`
          : lateThings > 0
            ? `${digits(lateThings)} ${plural(lateThings, 'thing is', 'things are')} late`
            : null;
  const working = agents === 0 ? null : `${digits(agents)} ${plural(agents, 'agent is', 'agents are')} working`;
  let head: string;
  let needs: string;
  let rest: (string | null)[];
  if (needYou > 0) {
    head = `${digits(needYou)} ${needYou === 1 ? 'needs' : 'need'} you`;
    needs = head;
    /* WITH SOMETHING TO ASK, NOTHING LATE IS SAID TOO, so the line answers both questions it raises. */
    rest = [lateClause ?? (lateRead ? NOTHING_LATE : null), working];
  } else if (inbox > 0 && lateClause === null) {
    head = `${digits(inbox)} ${plural(inbox, 'thing waits', 'things wait')} in your inbox`;
    needs = '';
    rest = [working];
  } else {
    head = 'Nothing needs you';
    needs = lateClause ?? '';
    rest = [lateClause, working];
  }
  /* SHORT SENTENCES, EACH ONE THING (Today polish 7): what needs you, what is late, who is working. */
  const text = [head, ...rest]
    .filter((s): s is string => s !== null)
    .map((s) => `${upper(s)}.`)
    .join(' ');
  return { text, needs };
}

/* ── the week strip ─────────────────────────────────────────────────────── */

/** The colour a project is drawn in: its hue at the theme's mark lightness and chroma, as its face is. */
export const projectColour = (hue: number | null | undefined): string | null =>
  typeof hue === 'number' && Number.isFinite(hue) ? `oklch(var(--mark-l) var(--mark-c) ${hue})` : null;

/** A task on no project, and a bill, in greys that read as a small dot: a task a step darker, because it is work. */
const TASK_GREY = 'color-mix(in srgb, var(--ink) 76%, var(--tile))';
const BILL_GREY = 'color-mix(in srgb, var(--ink) 48%, var(--tile))';

/** How many days before today the strip starts, so the late dots of the last two days are on it. */
export const STRIP_BEFORE = 2;
/** How many days the strip draws. */
export const STRIP_DAYS = 14;

/** A dated thing on the strip: its day, whether it is late, its colour, what it is, and whether it is money. */
export type Dated = { day: string; late: boolean; colour: string; label: string; money: boolean };

/** What needs him and what is coming, as dated things: late and today's work, the next two weeks' work, and the bills. */
export function datedOf(tasks: readonly TaskRow[], coming: readonly DayRow[], bills: readonly DueRow[], today: string): Dated[] {
  const out: Dated[] = [];
  for (const t of tasks) {
    if (!t.due) continue;
    out.push({ day: t.due, late: t.due < today, colour: projectColour(t.hue) ?? TASK_GREY, label: t.what, money: false });
  }
  for (const t of coming) out.push({ day: t.day, late: false, colour: projectColour(t.hue) ?? TASK_GREY, label: t.what, money: false });
  for (const b of bills) {
    if (!b.due) continue;
    out.push({ day: b.due, late: b.due < today, colour: BILL_GREY, label: b.what, money: true });
  }
  return out;
}

/** The strip's days, `STRIP_DAYS` from `STRIP_BEFORE` days ago, each with a dot a thing dated that day. */
export function weekDays(dated: readonly Dated[], today: string): WeekDay[] {
  const first = addDays(today, -STRIP_BEFORE);
  return Array.from({ length: STRIP_DAYS }, (_, k) => {
    const date = addDays(first, k);
    const items: WeekItem[] = dated
      .filter((d) => d.day === date)
      .sort((a, b) => Number(b.late) - Number(a.late))
      .map((d) => ({ colour: d.colour, late: d.late, label: d.label }));
    return { date, items };
  });
}

/**
 * The strip's reading line: what is late and since when, what is due today, and what the rest of the strip holds and
 * how much of it is money. "Two are late, the oldest from Sunday. The next 11 days hold 9 more, 6 of them money."
 */
export function weekReading(dated: readonly Dated[], today: string): string {
  const last = addDays(today, STRIP_DAYS - STRIP_BEFORE - 1);
  const ahead = daysBetween(today, last);
  const late = dated.filter((d) => d.late).sort((a, b) => a.day.localeCompare(b.day));
  const now = dated.filter((d) => !d.late && d.day === today);
  const later = dated.filter((d) => d.day > today && d.day <= last);
  const money = later.filter((d) => d.money).length;
  const parts: string[] = [];
  if (late.length === 1) parts.push(`One is late, from ${dayNamed(late[0]!.day, today)}.`);
  else if (late.length > 1) parts.push(`${upper(counted(late.length))} are late, the oldest from ${dayNamed(late[0]!.day, today)}.`);
  if (now.length > 0) parts.push(`${upper(counted(now.length))} ${now.length === 1 ? 'is' : 'are'} due today.`);
  if (later.length > 0) {
    const more = parts.length > 0 ? `${later.length.toLocaleString('en-GB')} more` : later.length.toLocaleString('en-GB');
    const said = `The next ${ahead} days hold ${more}`;
    parts.push(money === 0 ? `${said}.` : money === later.length ? `${said}, all of them money.` : `${said}, ${counted(money)} of them money.`);
  } else if (parts.length > 0) parts.push(`Nothing else is dated in the next ${ahead} days.`);
  return parts.length > 0 ? parts.join(' ') : `Nothing is dated in the next ${ahead} days.`;
}

/* ── the days under it ──────────────────────────────────────────────────── */

/** A group of coming days on the ground: its heading, the days it covers as words, and what falls in it. */
export type DayGroup<T> = { key: string; title: string; span: string; items: T[] };

/** "Wed 30 Sep", or "Thu 1 to Sun 4 Oct", or "Wed 30 Sep to Sun 4 Oct" across a month. */
export function spanSaid(from: string, to: string): string {
  if (from === to) return daySaid(from);
  const a = daySaid(from).split(' ');
  const b = daySaid(to);
  return from.slice(0, 7) === to.slice(0, 7) ? `${a[0]} ${a[1]} to ${b}` : `${daySaid(from)} to ${b}`;
}

/**
 * The next fourteen days in the groups a person plans in: Tomorrow, Later this week (to Sunday), Next week, and After
 * that. A group with nothing in it is left out. `items` are anything with a `day`, soonest first within a group.
 */
export function dayGroups<T extends { day: string }>(items: readonly T[], today: string, days = 14): DayGroup<T>[] {
  const tomorrow = addDays(today, 1);
  /* THE WEEK ENDS ON SUNDAY, Monday to Sunday as the strip draws it. */
  const sunday = addDays(tomorrow, (7 - weekdayOf(tomorrow)) % 7);
  const nextSunday = addDays(sunday, 7);
  const last = addDays(today, days);
  const windows = [
    { key: 'tomorrow', title: 'Tomorrow', from: tomorrow, to: tomorrow },
    { key: 'week', title: 'Later this week', from: addDays(tomorrow, 1), to: sunday },
    { key: 'next', title: 'Next week', from: addDays(sunday, 1), to: nextSunday < last ? nextSunday : last },
    { key: 'after', title: 'After that', from: addDays(nextSunday, 1), to: last },
  ].filter((w) => w.from <= w.to);
  return windows.flatMap((w) => {
    const held = items.filter((i) => i.day >= w.from && i.day <= w.to).sort((a, b) => a.day.localeCompare(b.day));
    return held.length === 0 ? [] : [{ key: w.key, title: w.title, span: spanSaid(w.from, w.to), items: held }];
  });
}

/* ── the agents' day ────────────────────────────────────────────────────── */

/**
 * A lane an agent, its spans on the day in the order they opened; a working run's span runs to now. Agents with the
 * most time working lead, so the busiest lane is the first one read.
 */
export function lanesOf(sessions: readonly SessionRow[], name: (agent: string) => string): Lane[] {
  const by = new Map<string, SessionRow[]>();
  for (const s of sessions) by.set(s.agent, [...(by.get(s.agent) ?? []), s]);
  const busy = (runs: readonly SessionRow[]) => runs.reduce((n, s) => n + (s.to - s.from), 0);
  return [...by.entries()]
    .sort((a, b) => busy(b[1]) - busy(a[1]) || a[0].localeCompare(b[0]))
    .map(([agent, runs]) => ({ label: name(agent), spans: runs.map((s) => ({ from: s.from, to: s.to, live: s.working })) }));
}

/**
 * The agents' reading line: how many runs since midnight, how many work now, and the longest-running of those.
 * "5 runs since midnight; 2 are working now, and claude's has run 1 h 08."
 */
export function lanesReading(sessions: readonly SessionRow[], now: number, name: (agent: string) => string): string {
  const n = sessions.length;
  const working = sessions.filter((s) => s.working);
  const head = `${upper(counted(n))} ${plural(n, 'run')} since midnight`;
  if (working.length === 0) return `${head}; none is working now.`;
  const longest = [...working].sort((a, b) => a.opened - b.opened)[0]!;
  const now2 = `${counted(working.length)} ${working.length === 1 ? 'is' : 'are'} working now`;
  if (working.length === 1) return `${head}; ${now2}, ${name(longest.agent)}, for ${elapsedSaid(now - longest.opened)}.`;
  return `${head}; ${now2}, and ${name(longest.agent)}'s has run longest, ${elapsedSaid(now - longest.opened)}.`;
}

/* ── since you were here ────────────────────────────────────────────────── */

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** When the oldest change held happened, on the reader's clock: "since 07:12", "since yesterday 21:40", "since Mon 21:40", "since 21 Sep". */
export function sinceWhen(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const at = new Date(t);
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const n = day(new Date(now)) - day(at);
  if (n <= 0) return `since ${clock}`;
  if (n === 1) return `since yesterday ${clock}`;
  if (n < 7) return `since ${WEEKDAY[at.getDay()]} ${clock}`;
  return `since ${at.getDate()} ${MONTH[at.getMonth()]}`;
}

/** "22 by agents, 4 by you", with a half that counts nothing left out. */
export function whoSaid(byAgents: number, byYou: number): string {
  const parts = [byAgents > 0 ? `${byAgents.toLocaleString('en-GB')} by agents` : '', byYou > 0 ? `${byYou.toLocaleString('en-GB')} by you` : ''].filter(Boolean);
  return parts.join(', ');
}

/**
 * What changed, in a line: who made it and where most of it was. "Agents made 22 of the 26; most were in Tasks."
 */
export function sinceReading(rows: readonly SinceRow[], total: number, byAgents: number, byYou: number): string {
  const top = rows[0];
  if (!top || total === 0) return 'Nothing has changed since you were last here.';
  const where = top.key.startsWith('list:') ? `in ${top.label}` : top.label.charAt(0).toLowerCase() + top.label.slice(1);
  const most = rows.length === 1 ? `all of them ${where}` : `most ${top.count === 1 ? 'was' : 'were'} ${where}`;
  const whole = total.toLocaleString('en-GB');
  if (byAgents > 0 && byAgents === total) return `Agents made all ${whole}; ${most}.`;
  if (byAgents > 0) return `Agents made ${byAgents.toLocaleString('en-GB')} of the ${whole}; ${most}.`;
  if (byYou === total) return `You made all ${whole}; ${most}.`;
  return `${upper(most)}.`;
}

/** The glyph for a kind of change, by the words `sinceOf` gives it; a list's own changes take the list's own icon. */
export function sinceIcon(row: Pick<SinceRow, 'key' | 'label'>, listIcon: (list: string) => string | undefined): string {
  if (row.key.startsWith('list:')) return listIcon(row.key.slice('list:'.length)) ?? 'rows';
  const said: Record<string, string> = {
    'Decisions made': 'decide',
    'Decisions replaced': 'decide',
    'Questions asked': 'ask',
    'Questions closed': 'check',
    'Add-ons changed': 'packs',
    'Pages changed': 'doc',
    'Things that came in': 'inbox',
    'Access changed': 'people',
    'Links shared': 'link',
    Backups: 'archive',
    Imports: 'download',
    'Keys used or changed': 'key',
  };
  return said[row.label] ?? 'history';
}

/* ── cash ───────────────────────────────────────────────────────────────── */

/**
 * A figure said roughly, for a line about the future: three significant figures of whole units, "about EGP 388,000".
 * A forecast is arithmetic over dated rows, and its pennies are not a fact anybody should read as one.
 *
 * THE ROUNDING IS THIS LINE'S, THE SPELLING IS THE ONE WRITER'S (`writeAmount`): the rounded figure goes back into minor
 * units of its own currency (three places for a dinar) and is written as every other amount is, so "about £388,000"
 * on a record kept in sterling and "about KWD 1,230" read as the figures beside them. `home` is the record's.
 */
export function aboutSaid(minor: number, currency: string, home: string | null = homeCurrency()): string {
  const exp = exponentOf(currency);
  const whole = Math.round(minor / 10 ** exp);
  const size = Math.abs(whole);
  const step = size >= 1000 ? 10 ** (Math.floor(Math.log10(size)) - 2) : 1;
  const rounded = BigInt(Math.round(size / step) * step) * 10n ** BigInt(exp);
  const said = writeAmount({ minor: whole < 0 ? -rounded : rounded, currency }, home, 'read');
  return `about ${said?.text ?? `${currency.toUpperCase()} ${whole}`}`;
}

/**
 * What the walk says, in one line, and the phrase in it that needs him: going under is red, a low point is not.
 * "Lowest in the next 13 weeks: about EGP 388,000 on 23 Nov."
 */
export function cashReading(f: Forecast): Sentence {
  if (f.crossed) {
    const needs = `goes under on ${daySaid(f.crossed).replace(/^\S+ /u, '')}`;
    return { text: `At this rate it ${needs}, inside the next ${f.weeks} weeks.`, needs };
  }
  if (f.low.day !== null) {
    const low = aboutSaid(f.low.value, f.currency);
    /* A LOW BELOW NOUGHT IS THE PHRASE THAT NEEDS HIM, drawn in the red as money under nought always is (1 Nov). */
    return { text: `Lowest in the next ${f.weeks} weeks: ${low} on ${daySaid(f.low.day).replace(/^\S+ /u, '')}.`, needs: f.low.value < 0 ? low : '' };
  }
  return { text: `Nothing dated takes it below today's figure in the next ${f.weeks} weeks.`, needs: '' };
}

/** The sparkline's sentence for a screen reader: where the walk starts, where it ends, and its low. */
export function cashSummary(f: Forecast): string {
  const first = f.values[0] ?? 0;
  const last = f.values.at(-1) ?? first;
  const low = f.low.day ? `, lowest ${aboutSaid(f.low.value, f.currency)} on ${daySaid(f.low.day)}` : '';
  return `Cash ahead, the lowest each week reaches over ${f.weeks} weeks: from ${aboutSaid(first, f.currency)} to ${aboutSaid(last, f.currency)}${low}.`;
}

/** The share the largest part holds, in words: "Personal holds 71% of it." */
export function shareReading(parts: readonly { label: string; value: number }[]): string | null {
  const whole = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
  const top = [...parts].sort((a, b) => b.value - a.value)[0];
  if (!top || whole <= 0) return null;
  return `${top.label} holds ${Math.round((Math.max(0, top.value) / whole) * 100)}% of it.`;
}
