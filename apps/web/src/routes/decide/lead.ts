/**
 * WHAT DECIDE SAYS FIRST: the sentence under its title, the open question's evidence, and how long each question has
 * waited, as the design system draws Decide.
 *
 * EVERY FIGURE HERE IS READ, NEVER MADE. The count is the questions still waiting; an age is the time since a question
 * was opened; the evidence is a pair of numbers the asker put on the question's body as data (`evidenceIn`), and when the
 * body holds no such pair there is no chart at all. A pair is never read out of a reason's prose.
 *
 * PURE AND NODE-LOADABLE, with the clock an argument, so `lead.test.ts` can say what day it is. The screen's own words
 * live here beside the only code that says them, as `views.ts` keeps its `WORDS`.
 */

import { citedWords } from '../../lib/cite.ts';
import type { Question } from '../../lib/record/schema.ts';

/** The most questions the queue aims to hold at once; the classic screen's figure says it as "Limit 3". The line never does. */
export const AIM = 3;

/*
 * WHEN A QUESTION IS LATE IS THE RECORD'S TO SAY, NOT THIS FILE'S (EXP-E07). It was fourteen days here, and again in the
 * kernel, so the rail, Today and Decide could each count late their own way. `boot` sends it (`lateDays`, the shell's)
 * and each function below takes it; a host older than the field sends none, and then nothing is drawn late here.
 */

/** An age is said in days up to two weeks, then in weeks (`waitedWords`). A way of speaking, not a mark of late. */
const DAYS_SAID = 14;

/** The most bars the waiting chart draws; the reading line says when there are more. */
export const WAITED_MOST = 8;

/** How many decisions "Decided lately" shows before "All decisions" opens the rest. */
export const DECIDED_FIRST = 5;

const DAY = 86_400_000;

export const WORDS = {
  waiting: 'Waiting on you',
  switch: 'switch',
  decided: 'Decided lately',
  allDecided: 'All decisions',
  waited: 'How long each has waited',
  does: 'What accepting does',
  suggested: (option: string) => `Suggested: ${option}`,
  askedBy: (who: string) => `asked by ${who}`,
  askedToday: 'asked today',
  waitingFor: (age: string) => `waiting ${age}`,
  ofMax: (value: string, max: string) => `${value} of ${max}`,
} as const;

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count the way a sentence says it: a word to ten, then figures. */
export const numberWord = (n: number): string => NUMBERS[n] ?? n.toLocaleString('en-GB');

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** How long a question waits before it is late, in words: "two weeks" for 14, "ten days" for 10. */
export const lateSaid = (days: number): string =>
  days % 7 === 0 ? `${numberWord(days / 7)} ${days === 7 ? 'week' : 'weeks'}` : `${numberWord(days)} ${days === 1 ? 'day' : 'days'}`;

/** Whole and part days since `iso`, never below zero; zero for a time this build cannot read. */
export function ageDays(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / DAY) : 0;
}

/**
 * An age in the words a person holds: days to two weeks, then weeks to two months, then months, then years. `today`
 * inside the first day. Written out ("5 weeks"), because this is a sentence and a chart label, not a table column.
 */
export function waitedWords(days: number): string {
  const d = Math.floor(days);
  if (d < 1) return 'today';
  if (d < DAYS_SAID) return d === 1 ? '1 day' : `${d} days`;
  if (d < 60) return `${Math.round(d / 7)} weeks`;
  if (d < 365) {
    const m = Math.max(2, Math.round(d / 30.44));
    return `${Math.min(11, m)} months`;
  }
  const y = Math.round(d / 365.25);
  return y === 1 ? '1 year' : `${y} years`;
}

/** The meta word for a question's age: "asked today", or "waiting 2 days". */
export const waitingSaid = (opened: string, now: number): string => {
  const days = ageDays(opened, now);
  return days < 1 ? WORDS.askedToday : WORDS.waitingFor(waitedWords(days));
};

/** A question's name cut to fit a chart's label column, at a word, with an ellipsis when anything was cut. */
export function shortTitle(title: string, most = 18): string {
  const t = title.trim().replace(/[?.!]+$/u, '');
  if (t.length <= most) return t;
  const cut = t.slice(0, most + 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > most / 2 ? cut.slice(0, at) : t.slice(0, most)).replace(/[\s,;:]+$/u, '')}…`;
}

/** The suggested option's title, the first one when an agent marked two. */
export const suggestedOf = (q: Pick<Question, 'options'> | undefined): string | undefined => q?.options.find((o) => o.recommended)?.title;

/**
 * THE SENTENCE UNDER THE TITLE, and the phrase in it that needs him.
 *
 * "Eight questions wait on you. One of them is hard to undo." How many wait, and then the one thing worth knowing
 * before reading them: which are hard to undo, or else what the first suggests, with who asked it when that is known.
 * RED IS ONLY FOR WHAT IS LATE, a question that has waited past the record's `lateDays` ("two of them for over two weeks"); a count is
 * never the trouble, and the queue keeps no quota to be over. The queue ranks by wait, then band: the hard ones need not lead.
 * NOTHING WAITING IS NOT A SENTENCE: the screen's cleared state already says it, with when the last one was decided.
 */
export function sentenceOf(
  waiting: readonly Partial<Pick<Question, 'band' | 'opened'>>[],
  first: Pick<Question, 'options'> | undefined,
  who = '',
  now = Date.now(),
  lateDays: number | null = null,
): { text: string; needs: string } | null {
  const hard = waiting.filter((q) => q.band === 'undo').length;
  const late = lateDays === null ? 0 : waiting.filter((q) => typeof q.opened === 'string' && ageDays(q.opened, now) > lateDays).length;
  return countSentence(waiting.length, hard, suggestedOf(first), who, late, lateDays);
}

/**
 * THE SAME SENTENCE FROM WHAT A DECLARED QUEUE ANSWERS: how many are open (the record's own count, which may be more
 * than the questions it sent), how many of them are hard to undo, the first one's suggested option by its label, and
 * how many have waited past two weeks. `sentenceOf` is this over the questions the classic screen holds whole, so the
 * two screens say one sentence.
 */
export function countSentence(
  n: number,
  undo: number | boolean,
  option: string | undefined,
  who = '',
  late = 0,
  lateDays: number | null = null,
): { text: string; needs: string } | null {
  if (n <= 0) return null;
  /* HOW LONG IS THE RECORD'S (`lateDays`); a host that did not say it is not quoted a number it never gave. */
  const past = lateDays === null ? 'for too long' : `for over ${lateSaid(lateDays)}`;
  const count = n === 1 ? 'One question waits on you' : `${capital(numberWord(n))} questions wait on you`;
  const stale = Math.min(Math.max(0, late), n);
  const overdue =
    stale === 0 ? '' : stale === n ? (n === 1 ? past : `all of them ${past}`) : `${numberWord(stale)} of them ${past}`;
  /* HOW MANY, THEN WHERE: "The first ten are hard to undo" read as a rank, not a count, so the count is said as one
     ("Ten of them are hard to undo."); one is "one of them" (it was "the first one", which named a place in the queue: audit 60, claim 3), and all is "all of them". IT DOES NOT SAY THEY COME
     FIRST (audit 58, claim 3): the queue ranks by how long a question can wait before its band (`WAIT_RANK_SQL`, then
     `BAND_RANK_SQL`, in the kernel), so a hard one opened today sits behind an older easy one.
     "Of them" is said once a sentence: after "three of them for over two weeks" it is "Four are hard to undo". */
  const hard = Math.min(Number(undo), n);
  const which = n > 1 ? ' for the first' : '';
  const then =
    hard > 0
      ? n === 1
        ? ' It is hard to undo.'
        : hard === n
          ? ` ${n === 2 ? 'Both' : 'All of them'} are hard to undo.`
          : hard === 1
            ? ` One${overdue.includes('of them') ? '' : ' of them'} is hard to undo.`
            : ` ${capital(numberWord(hard))}${overdue.includes('of them') ? '' : ' of them'} are hard to undo.`
      : option
        ? who
          ? ` ${who} suggests “${option}”${which}.`
          : ` “${option}” is suggested${which}.`
        : '';
  return { text: `${count}${overdue ? `, ${overdue}` : ''}.${then}`, needs: overdue };
}

export type WaitedBar = { label: string; value: number; tone: 'ink' | 'g2' | 'danger' };

/**
 * HOW LONG EACH QUESTION HAS WAITED, in the queue's own order, as `Bars` draws it.
 *
 * The open question is the one in ink; anything past two weeks is red, because a question that old is late whatever
 * its rank; the rest are grey. The reading line says how many are past two weeks and how long the oldest has waited,
 * and says so when the chart holds fewer bars than the queue holds questions.
 */
export function waitedOf(
  waiting: readonly Pick<Question, 'id' | 'title' | 'opened'>[],
  openId: string | undefined,
  now: number,
  lateDays: number | null = null,
): { items: WaitedBar[]; reading: string } {
  const isLate = (days: number): boolean => lateDays !== null && days > lateDays;
  const shown = waiting.slice(0, WAITED_MOST);
  const items = shown.map((q): WaitedBar => {
    const value = ageDays(q.opened, now);
    const tone = isLate(value) ? 'danger' : q.id === openId ? 'ink' : 'g2';
    return { label: shortTitle(q.title), value, tone };
  });
  const ages = waiting.map((q) => ageDays(q.opened, now));
  const oldest = Math.max(0, ...ages);
  const stale = ages.filter(isLate).length;
  const lead =
    lateDays === null
      ? `The oldest has waited ${waitedWords(oldest)}.`
      : stale === 0
        ? `None has waited ${lateSaid(lateDays)}; the oldest has waited ${waitedWords(oldest)}.`
        : `${capital(numberWord(stale))} ${stale === 1 ? 'has' : 'have'} waited over ${lateSaid(lateDays)}, the longest ${waitedWords(oldest)}.`;
  const more = waiting.length > shown.length ? ` The first ${numberWord(shown.length)} of ${waiting.length.toLocaleString('en-GB')} are drawn.` : '';
  return { items, reading: `${lead}${more}` };
}

/**
 * A SHARE THE ASKER GAVE AS DATA, the question body's own `evidence: { value, of, said? }` ("41 of 58", and the
 * sentence that says what they count), as the figures a waffle draws, with that sentence as the chart's reading.
 *
 * NEVER READ OUT OF PROSE. The first "N of M" in an agent's reason was drawn here as Evidence, and an agent's reasons
 * say "2 of 5 steps" as often as "41 of 58 lines" (audit 31-32, finding 5): a chart that a sentence's grammar can
 * summon is not evidence of anything. No field, no chart; the reason is still drawn as words.
 *
 * `value` and `of` are whole numbers with `value` no more than `of` and `of` at least three, so a waffle has a whole
 * worth drawing. `said` may cite the body's figures in braces, and is read through them (`citedWords`); with none, the
 * reading is the pair itself.
 */
export type Evidence = { value: number; max: number; said: string };

const EVIDENCE_MOST = 100_000;

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function evidenceIn(body: unknown, now?: number): Evidence | null {
  if (!isRow(body) || !isRow(body.evidence)) return null;
  const { value, of, said } = body.evidence;
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(of)) return null;
  const v = value as number;
  const max = of as number;
  if (v < 0 || max < 3 || v > max || max > EVIDENCE_MOST) return null;
  const figures = isRow(body.figures) ? body.figures : {};
  const words = typeof said === 'string' ? citedWords(said, figures, now).trim() : '';
  return { value: v, max, said: words !== '' ? words : `${v.toLocaleString('en-GB')} of ${max.toLocaleString('en-GB')}` };
}

/* ── the lead tile and the compact queue under it ─────────────── */

/** The key the lead tile is placed by on the board (`+page.svelte`). */
export const LEAD_KEY = 'decide-lead';

/** A block of the drawn page, as far as the lead reads one. */
type Drawn = { kind: string; key?: string | undefined; drawn: boolean; queue?: readonly { id: string }[] | undefined; total: number };

/**
 * DECIDE LEADS WITH ONE QUESTION (the Bento Decide board): the first question of the first group is drawn whole in
 * a tile of its own across the board, with what it changes, its suggested answer and its numbered answers, and the rest
 * are a compact queue under it, each its question, who asked and its answers.
 *
 * AT THE SAME INDEXES. The page's first block is its line, which the head already says (`decideDrawn` leaves it undrawn);
 * the lead takes that place, so every block after it keeps its index. A kept page whose first block is no line keeps
 * its cards as they were. `group` is the key of the group the lead came from, whose count is one less under it.
 */
export function leadOf<B extends Drawn>(blocks: readonly B[], order: readonly string[]): { blocks: B[]; group: string | null } {
  const head = blocks[0];
  if (!head || head.kind !== 'note' || head.drawn) return { blocks: [...blocks], group: null };
  const at = order.map((key) => blocks.findIndex((b) => b.key === key && b.drawn && (b.queue?.length ?? 0) > 0)).find((i) => i >= 0);
  if (at === undefined) return { blocks: [...blocks], group: null };
  const from = blocks[at]!;
  const [first, ...rest] = from.queue ?? [];
  if (!first) return { blocks: [...blocks], group: null };
  const out = blocks.map((b, n): B => {
    if (n === 0) return { ...b, kind: 'queue', source: 'governance.open', key: LEAD_KEY, heading: undefined, lead: true, queue: [first], shown: 1, total: 1, drawn: true } as B;
    if (b.kind !== 'queue' || typeof b.key !== 'string' || !order.includes(b.key)) return b;
    /* THE QUEUE UNDER THE LEAD IS COMPACT: the question, who asked and its answers, and its own page for the rest. */
    if (n !== at) return { ...b, compact: true } as B;
    const counted = Math.max(0, ((b as { counted?: unknown }).counted as number | undefined ?? b.total) - 1);
    return rest.length === 0 ? ({ ...b, queue: [], shown: 0, total: 0, counted, drawn: false } as B) : ({ ...b, queue: rest, shown: rest.length, total: rest.length, counted, compact: true } as B);
  });
  return { blocks: out, group: from.key ?? null };
}
