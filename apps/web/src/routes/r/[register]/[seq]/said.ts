/**
 * The words a row's page leads with: how far off its deadline is, the day a finished row finished, and how old the row
 * is, and the words the page's tiles are said in.
 *
 * THE LEAD SAID "Open" BESIDE A RED DOT, AND "8w ago" BESIDE A DUE DATE. The dot meant overdue while
 * the word beside it said something else, and nobody could tell whether "8w ago" was the date or the row. So the tone is
 * said in words beside its dot ("38 days late", "Paid 2 Sep"), and the age carries its own label and its unit in
 * words ("added 8 weeks ago"), since "8w" is a unit nobody says.
 *
 * THE TONE IS NOT DECIDED HERE. Its colour is `toneOf`'s, the list's own rule (`lib/record/api.ts`), so a row drawn late
 * in its list is drawn late on its page; this file only says in words how many days away a date is, counted in calendar
 * days as `relative()` counts them. Out of the component so `node --test` can run it, as `lead.ts` beside it is.
 */

import { day, shortDay, sinceWords } from 'braindog-render';

/**
 * WHETHER A LIST OF TAGS IS ONLY THE KEYS AN IMPORT LEFT, which say where a row came from to the importer and nothing to
 * a person: "kilnnotes:servicereading:oracle-a1:cpu:2026-09-28" (the audit of 25 October, Z23, `row-390-light.png`).
 * Such a field is not listed as a fact. A tag a person wrote has a space or fewer than three parts, and keeps its place.
 */
export function importKeysOnly(v: unknown): boolean {
  const tags = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  return tags.length > 0 && tags.every((t) => typeof t === 'string' && /^[a-z0-9_.-]+(?::[a-z0-9_.-]+){2,}$/iu.test(t.trim()));
}

/** The row page's own words, kept beside the functions that say them. */
export const rowWords = {
  /* THE LIST'S WORDS FOR IT (money F6): "64 days late" in the Due cell, on the card and here, never "overdue by". */
  overdue: (days: number): string => (days === 1 ? '1 day late' : `${days} days late`),
  dueToday: 'Due today',
  dueTomorrow: 'Due tomorrow',
  dueIn: (days: number): string => `Due in ${days} days`,
  added: (age: string): string => `added ${age}`,
  /* What is paid of a bill and what is left, under its figure. */
  paidPart: (paid: string, left: string): string => `Paid ${paid} · ${left} left`,
  /* The title-row sentence of a row the record has just archived, before anything else it says. */
  archived: 'Archived.',
  /* What the fields tile is called to a screen reader, and what it says when the row has answered nothing yet. */
  details: 'Details',
  nothingYet: 'Nothing filled in yet.',
  /* The last choice under "Add a field": a field the list does not have yet, on every row of it. */
  newField: (one: string): string => `New field for every ${one.toLowerCase()}`,
  today: 'Today',
  yesterday: 'Yesterday',
  /* The headings of the figures a row's page draws as tiles (`figures.ts`). */
  moneyIn: 'Money in',
  openWork: 'Open work',
  all: 'All',
  months: (n: number): string => (n === 1 ? '1 month' : `${n} months`),
} as const;

/**
 * ONE PIECE OF THE TITLE ROW'S SENTENCE. The state is a piece of its own because the page draws it, through
 * `stateSaid` and the `lead-word` span the label tests read, and every other piece is words. A late or near deadline is
 * a piece of its own too, because it is the phrase that is coloured: red when it has passed, amber when it is close.
 */
export type Piece = { kind: 'state' } | { kind: 'words'; text: string } | { kind: 'late'; text: string; tone: 'bad' | 'warn' };

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * THE SENTENCE UNDER A ROW'S TITLE: "Open, 38 days late, added 8 weeks ago."
 *
 * Where it stands, then when it is due (how late or how close when the list's tone says so, the day otherwise), then how
 * old it is, each clause present only when the row has it. It replaced the lead line of dots and words; the tone is said
 * in words, and only the words that need him are red. An archived row says so first, since every list has left it out.
 */
export function sentenceOf(p: {
  archived: boolean;
  /** The row has a state, which the page draws where the first piece says. */
  state: boolean;
  /** The day a finished row finished, said after its state: "Paid 2 Sep". */
  finished: string | null;
  /** How late or how close, from `dueSaid`, and the list's tone for it. */
  late: { text: string; tone: 'bad' | 'warn' } | null;
  /** The deadline as a label and a day, when it carries no tone. */
  due: { label: string; day: string } | null;
  /** `addedSaid`'s words. */
  added: string;
}): Piece[] {
  const clauses: Piece[][] = [];
  if (p.state) clauses.push(p.finished ? [{ kind: 'state' }, { kind: 'words', text: ` ${p.finished}` }] : [{ kind: 'state' }]);
  if (p.late) clauses.push([{ kind: 'late', text: p.late.text, tone: p.late.tone }]);
  else if (p.due) clauses.push([{ kind: 'words', text: `${p.due.label.toLowerCase()} ${p.due.day}` }]);
  clauses.push([{ kind: 'words', text: p.added }]);

  const out: Piece[] = p.archived ? [{ kind: 'words', text: `${rowWords.archived} ` }] : [];
  clauses.forEach((clause, i) => {
    if (i > 0) out.push({ kind: 'words', text: ', ' });
    /* A SENTENCE STARTS WITH A CAPITAL and nothing after its first word does: "Due in 3 days" is a whole line on
       its own and the middle of one here. The state's word is set in sentence case by the page's stylesheet. */
    const [first, ...rest] = clause;
    const cased = first && first.kind !== 'state' ? { ...first, text: i === 0 ? upper(first.text) : lower(first.text) } : first;
    if (cased) out.push(cased, ...rest);
  });
  out.push({ kind: 'words', text: '.' });
  /* Words beside words are one run of text, so the page draws no seam between them. */
  return out.reduce<Piece[]>((all, piece) => {
    const last = all.at(-1);
    if (last?.kind === 'words' && piece.kind === 'words') all[all.length - 1] = { kind: 'words', text: last.text + piece.text };
    else all.push(piece);
    return all;
  }, []);
}

/** One day of a row's history: its heading ("Today", "Yesterday", "2 Sep") and its lines, newest first as they came. */
export type Day<T> = { key: string; said: string; lines: T[] };

/** A moment as the reader's own calendar day, `YYYY-MM-DD`: the history is grouped by the day on their wall. */
export const localDay = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * THE HISTORY GROUPED BY DAY, in the order it came, which is newest first.
 *
 * A line whose time does not read goes with the line before it rather than into a day of its own, since a group headed
 * by nothing would say less than no heading at all.
 */
export function daysOf<T extends { at: string }>(lines: readonly T[], now: number): Day<T>[] {
  const today = localDay(now);
  const yesterday = localDay(now - DAY_MS);
  const days: Day<T>[] = [];
  for (const line of lines) {
    const at = Date.parse(line.at);
    const key = Number.isFinite(at) ? localDay(at) : (days.at(-1)?.key ?? today);
    const last = days.at(-1);
    if (last && last.key === key) {
      last.lines.push(line);
      continue;
    }
    const said = key === today ? rowWords.today : key === yesterday ? rowWords.yesterday : daySaid(key, now);
    days.push({ key, said, lines: [line] });
  }
  return days;
}

/** A stored day: the only shape the record keeps a `day` field in. */
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

const DAY_MS = 86_400_000;

/** Calendar days from `now` to a stored day, negative once it has passed, or `null` for anything that is not a day. */
export function daysTo(iso: string, now: number): number | null {
  if (!DAY.test(iso)) return null;
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  return Math.floor(at / DAY_MS) - Math.floor(now / DAY_MS);
}

/** How far off a deadline is, as a person says it, or `null` for a value that is not a day. */
export function dueSaid(iso: string, now: number): string | null {
  const days = daysTo(iso, now);
  if (days === null) return null;
  if (days < 0) return rowWords.overdue(-days);
  if (days === 0) return rowWords.dueToday;
  if (days === 1) return rowWords.dueTomorrow;
  return rowWords.dueIn(days);
}

/**
 * A day as a sentence says it: "2 Sep" inside the year it is read in, "2 Sep 2025" outside it. A value that is not a
 * day comes back as it was, because a formatter never invents a date it was not given.
 */
export function daySaid(iso: string, now: number): string {
  if (!DAY.test(iso)) return iso;
  return iso.slice(0, 4) === String(new Date(now).getUTCFullYear()) ? shortDay(iso) : day(iso);
}

/**
 * HOW LONG AGO, IN WORDS: "just now", "5 minutes ago", "12 hours ago", "yesterday", "3 days ago", "4 weeks ago",
 * "4 months ago", "2 years ago". The short form ("4w") is a list cell's; a sentence and a history line say the unit.
 * A moment that does not read comes back as nothing said, never as a guess.
 *
 * ON THE ONE LADDER, `since()`'s in `braindog-render`, with its unit in words (`sinceWords`). This counted its own
 * floored weeks, so one day, 28 Sep read from 24 Oct, was "Added 3 weeks ago" and "3 weeks ago" in Activity over "When
 * 4w ago" in the fields and "4 weeks ago" on the list (the audit of 25 October, Z25). Only its first day is its own:
 * "yesterday", where the ladder says "1 day ago".
 */
export function agoSaid(at: string, now: number): string {
  if (!Number.isFinite(Date.parse(at))) return '';
  if (Date.parse(at) >= now) return 'just now';
  const said = sinceWords(at, now);
  return said === '1 day ago' ? 'yesterday' : said;
}

/** The row's age with its label, so it is never read as the date beside it. */
export const addedSaid = (created: string, now: number): string => rowWords.added(agoSaid(created, now));
