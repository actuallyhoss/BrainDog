/**
 * WHAT DECIDE SAYS FIRST: the sentence under its title, the open question's evidence, and how long each question has
 * waited, as the design system draws Decide.
 *
 * EVERY FIGURE HERE IS READ, NEVER MADE. The count is the questions still waiting; an age is the time since a question
 * was opened; the evidence is a pair of numbers the proposer wrote in its own reason ("41 of 58 lines"), and when the
 * reason holds no such pair there is no chart at all. There is no structured "how sure" field on a question, so this file
 * does not pretend there is one.
 *
 * PURE AND NODE-LOADABLE, with the clock an argument, so `lead.test.ts` can say what day it is. The screen's own words
 * live here beside the only code that says them, as `views.ts` keeps its `WORDS`.
 */

import { citedWords } from '../../lib/cite.ts';
import type { Question } from '../../lib/record/schema.ts';

/** The most questions the queue aims to hold at once; the classic screen's figure says it as "Limit 3". The line never does. */
export const AIM = 3;

/** Past this many days a question has waited too long, and its bar and its age are drawn in the red that means late. */
export const STALE_DAYS = 14;

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
  if (d < STALE_DAYS) return d === 1 ? '1 day' : `${d} days`;
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
 * "Eight questions wait on you. The first one is hard to undo." How many wait, and then the one thing worth knowing
 * before reading them: which are hard to undo, or else what the first suggests, with who asked it when that is known.
 * RED IS ONLY FOR WHAT IS LATE, a question that has waited past two weeks ("two of them for over two weeks"); a count is
 * never the trouble, and the queue keeps no quota to be over. Questions come dearest first, so the hard ones lead.
 * NOTHING WAITING IS NOT A SENTENCE: the screen's cleared state already says it, with when the last one was decided.
 */
export function sentenceOf(
  waiting: readonly Partial<Pick<Question, 'band' | 'opened'>>[],
  first: Pick<Question, 'options'> | undefined,
  who = '',
  now = Date.now(),
): { text: string; needs: string } | null {
  const hard = waiting.filter((q) => q.band === 'undo').length;
  const late = waiting.filter((q) => typeof q.opened === 'string' && ageDays(q.opened, now) > STALE_DAYS).length;
  return countSentence(waiting.length, hard, suggestedOf(first), who, late);
}

/**
 * THE SAME SENTENCE FROM WHAT A DECLARED QUEUE ANSWERS: how many are open (the record's own count, which may be more
 * than the questions it sent), how many of them are hard to undo, the first one's suggested option by its label, and
 * how many have waited past two weeks. `sentenceOf` is this over the questions the classic screen holds whole, so the
 * two screens say one sentence.
 */
export function countSentence(n: number, undo: number | boolean, option: string | undefined, who = '', late = 0): { text: string; needs: string } | null {
  if (n <= 0) return null;
  const count = n === 1 ? 'One question waits on you' : `${capital(numberWord(n))} questions wait on you`;
  const stale = Math.min(Math.max(0, late), n);
  const overdue =
    stale === 0 ? '' : stale === n ? (n === 1 ? 'for over two weeks' : 'all of them for over two weeks') : `${numberWord(stale)} of them for over two weeks`;
  const hard = Math.min(Number(undo), n);
  const which = n > 1 ? ' for the first' : '';
  const then =
    hard > 0
      ? n === 1
        ? ' It is hard to undo.'
        : hard === n
          ? ` ${n === 2 ? 'Both' : 'All of them'} are hard to undo.`
          : hard === 1
            ? ' The first one is hard to undo.'
            : ` The first ${numberWord(hard)} are hard to undo.`
      : option
        ? who
          ? ` ${who} suggests “${option}”${which}.`
          : ` “${option}” is suggested${which}.`
        : '';
  return { text: `${count}${overdue ? `, ${overdue}` : ''}.${then}`, needs: overdue };
}

/**
 * THE GATE'S SENTENCE: "Three options; “Per seat” is suggested; opened 2 weeks ago." What a reader needs before the
 * cards, in one line: how many ways there are to answer, which one is suggested, and how long it has been open.
 */
export function gateSentence(q: Pick<Question, 'options' | 'opened'>, now: number): string {
  const n = q.options.length;
  const option = suggestedOf(q);
  const days = ageDays(q.opened, now);
  const opened = days < 1 ? 'opened today' : `opened ${waitedWords(days)} ago`;
  return `${capital(numberWord(n))} ${n === 1 ? 'option' : 'options'}${option ? `; “${option}” is suggested` : ''}; ${opened}.`;
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
): { items: WaitedBar[]; reading: string } {
  const shown = waiting.slice(0, WAITED_MOST);
  const items = shown.map((q): WaitedBar => {
    const value = ageDays(q.opened, now);
    const tone = value > STALE_DAYS ? 'danger' : q.id === openId ? 'ink' : 'g2';
    return { label: shortTitle(q.title), value, tone };
  });
  const ages = waiting.map((q) => ageDays(q.opened, now));
  const oldest = Math.max(0, ...ages);
  const stale = ages.filter((d) => d > STALE_DAYS).length;
  const lead =
    stale === 0
      ? `None has waited two weeks; the oldest has waited ${waitedWords(oldest)}.`
      : `${capital(numberWord(stale))} ${stale === 1 ? 'has' : 'have'} waited over two weeks, the longest ${waitedWords(oldest)}.`;
  const more = waiting.length > shown.length ? ` The first ${numberWord(shown.length)} of ${waiting.length.toLocaleString('en-GB')} are drawn.` : '';
  return { items, reading: `${lead}${more}` };
}

/**
 * A SHARE THE PROPOSER WROTE IN ITS OWN REASON, "41 of September's 58 HSBC lines", as the figures a waffle draws, with
 * the sentence it came from as that chart's reading.
 *
 * The first "N of M" in the reason, read after its braces are resolved (`citedWords`), where N is no more than M and M
 * is at least three. Between "of" and the second figure only an article, a possessive or a short determiner may stand,
 * so "one of them 2 days later" is not read as a share. No pair, no chart: the reason is still drawn as words.
 */
const PAIR = /(?<![\p{L}\p{N}.,])(\d[\d,]*) of (?:(?:the|its|your|our|their|his|her|these|those|this|last|all)\s+|\p{L}+['’]s\s+){0,2}(\d[\d,]*)(?![\p{N}.,]\d)/iu;

export type Evidence = { value: number; max: number; said: string };

export function evidenceOf(text: string, figures: Record<string, unknown> = {}, now?: number): Evidence | null {
  const words = citedWords(text, figures, now);
  const m = PAIR.exec(words);
  if (!m) return null;
  const value = Number((m[1] ?? '').replaceAll(',', ''));
  const max = Number((m[2] ?? '').replaceAll(',', ''));
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(max) || max < 3 || value > max || max > 100_000) return null;
  /* THE SENTENCE THAT HOLDS THE PAIR, so the chart's reading is the proposer's claim and not a line made up for it. */
  const dot = words.lastIndexOf('. ', m.index);
  const stop = words.indexOf('. ', m.index + m[0].length);
  const said = words.slice(dot < 0 ? 0 : dot + 2, stop < 0 ? undefined : stop + 1).trim();
  return { value, max, said };
}
