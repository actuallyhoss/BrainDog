/**
 * HOME'S ONE LINE, said by the model when it has said one today, and by the rules otherwise (DIRECTION §35,
 * "intelligence is the product; rules are the fallback").
 *
 * THE RECORD WRITES IT: once a day Slash reads Today (what needs the person, the titles of what is late, who is working)
 * and keeps one line as its pref `headline.home` (`packages/record/src/headlines.ts`), checked before it is kept so it
 * says no number the record did not hand it. The record sends it on Home's read only while what it was written from
 * still holds; this side keeps it only on the day it was written, so a line from yesterday never opens today.
 *
 * WITHOUT ONE, NOTHING CHANGES. The line is `sentenceOf`'s (`today-tiles.ts`), with its red phrase, exactly as before.
 *
 * THE RED PHRASE IS THE RULES', NEVER THE MODEL'S GUESS. The rules know which words need the person ("two are late");
 * the model's line is drawn red there only when it says those very words, so a line that words it its own way is drawn
 * in ink throughout rather than with a red the rules did not choose.
 *
 * A PLAIN MODULE, so `node --test` reads both paths without mounting Home.
 */

import type { Sentence } from './today-tiles.ts';

/** The line under Home's title: its words, the phrase in them drawn red (`''` for none), and who said it. */
export type HomeLine = Sentence & { by: 'slash' | 'rules' };

/** The record's day at `now`, as it dates a line it keeps (`toISOString`, the day Slash's daily look runs on). */
export const recordDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/**
 * The model's line as the record sent it, when it is fresh: a kept line (`{ text, day, basis }`) written on the record's
 * day at `now`, or a line the record sent as words, which it sends only while it holds. Anything else is no line.
 */
export function modelLineOf(raw: unknown, now: number): string | null {
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw.trim();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { text, day } = raw as { text?: unknown; day?: unknown };
  if (typeof text !== 'string' || text.trim() === '') return null;
  /* A LINE WITH NO DAY IS NOT TODAY'S. */
  return typeof day === 'string' && day.slice(0, 10) === recordDay(now) ? text.trim() : null;
}

const SPELLED = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;

/** One word of the rules' phrase as the model may say it: itself, and a count either spelled out or in digits. */
function wordOf(word: string): string {
  const spelled = SPELLED.indexOf(word.toLowerCase() as (typeof SPELLED)[number]);
  const n = spelled > 0 ? spelled : /^\d+$/u.test(word) ? Number(word) : -1;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return n > 0 && n < SPELLED.length ? `(?:${escaped}|${n === spelled ? n : SPELLED[n]})` : escaped;
}

/**
 * Where `phrase` stands in `line` word for word, as `[from, to)`, or `null`. Case aside, because the rules' phrase opens
 * their sentence ("Four things need you") and the model may say it mid-line; a count either spelled or in digits, because
 * the rules spell to ten and the model is handed digits ("4 things need you"); and only as whole words, so "two are
 * late" is not found in "twenty-two are late" nor "two are lately".
 */
export function phraseAt(line: string, phrase: string): [number, number] | null {
  const words = phrase.trim().split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0) return null;
  const found = new RegExp(`(?<![\\p{L}\\p{N}-])${words.map(wordOf).join('\\s+')}(?![\\p{L}\\p{N}-])`, 'iu').exec(line);
  return found ? [found.index, found.index + found[0].length] : null;
}

/**
 * THE LINE HOME SAYS: the model's when it sent a fresh one, its red phrase the rules' phrase in its own words where it
 * says it word for word; else the rules' line as it is.
 */
export function homeLineOf(rules: Sentence, raw: unknown, now: number): HomeLine {
  const said = modelLineOf(raw, now);
  if (said === null) return { ...rules, by: 'rules' };
  const at = phraseAt(said, rules.needs);
  return { text: said, needs: at === null ? '' : said.slice(...at), by: 'slash' };
}

/**
 * A line cut round its red phrase, as the head draws it: where `homeLineOf` found it, as whole words, so "two are late"
 * is cut from "and two are late", not from the end of an earlier "Twenty-two are late".
 */
export function cutLine(line: Sentence): { before: string; needs: string; after: string } {
  const at = line.needs === '' ? null : phraseAt(line.text, line.needs);
  if (at === null) return { before: line.text, needs: '', after: '' };
  return { before: line.text.slice(0, at[0]), needs: line.text.slice(...at), after: line.text.slice(at[1]) };
}
