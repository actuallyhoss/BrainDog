/**
 * The headline line on each page, written by the model overnight and checked before it is kept.
 *
 * A PAGE'S LEAD NOTE IS SAID BY RULES (`leadOf` in the app): its holes filled and a clause whose figure is nought taken
 * away. That reads "Cash is GBP 33,850.00 across 2 accounts", which is true and says nothing about what matters. DIRECTION
 * §35 has a model read the figures and say it, so once a day `slashHeadlines` (`index.ts`) asks the model for one line a
 * page, every page at once, on the background allowance and never one of the person's own asks.
 *
 * NOTHING THE MODEL SAYS IS TRUSTED AS IT CAME. `headlineFault` keeps a line only when it is one short sentence, every
 * number in it is a number the model was handed, and it names none of the system's words, so the line on the page can
 * never say a figure the tiles beside it do not. A line is kept with the `basis` it was written from, a hash of the lead
 * note's figures, and the page read sends it only while the figures still hash the same: once a figure moves, the rules
 * speak again until the next night writes a new one.
 */

import type { Json } from '@braindog/kernel';
import { exponentOf } from '@braindog/kernel';

/** A headline is a line, not a paragraph: what fits beside a page's title on a phone. */
export const HEADLINE_MOST = 140;

/** At most this many pages go into the one nightly ask, so its input stays the size of one ask. */
export const HEADLINE_PAGES_MOST = 24;

/** The pref a page's line is kept under, as Slash's own (`pref`, person `slash`). */
export const headlineKey = (page: string): string => `headline.${page}`;

/** The words a person never reads about their own things (DIRECTION §35): the system's, not theirs. */
const SYSTEM_WORDS = /\b(?:rows?|lists?|registers?|blocks?)\b/iu;

/** One figure the model is handed: its path as the note writes it, its value as a person reads it, and how far it moved. */
export type HeadlineFigure = { id: string; value: string; change?: string };

/** One page the model is asked to say a line for. `rules` is the line the rules say today, filled. */
export type HeadlinePage = { page: string; title: string; rules: string; figures: HeadlineFigure[] };

/** What `SlashModel.headline` is handed. The host answers `{"lines":{"<page>":"..."}}`. */
export type HeadlineInput = { today: string; pages: HeadlinePage[] };

/** A line as it is kept: the text, the day it was written, and the hash of the figures it was written from. */
export type SlashHeadline = { text: string; day: string; basis: string };

/** A lead note as a page read answers it: the first one drawn, with its template and the values of its holes. */
export type LeadBlock = { at: number; body: string; values: Record<string, Json> };

/** The page's lead note: the first note with `lead: true` that was drawn and refused nothing, or `null`. */
export function leadBlockOf(blocks: readonly unknown[]): LeadBlock | null {
  for (const [at, raw] of blocks.entries()) {
    if (raw === null || typeof raw !== 'object') continue;
    const b = raw as { kind?: unknown; lead?: unknown; body?: unknown; drawn?: unknown; refusals?: unknown; values?: unknown };
    if (b.kind !== 'note' || b.lead !== true || typeof b.body !== 'string') continue;
    if (b.drawn === false || (Array.isArray(b.refusals) && b.refusals.length > 0)) continue;
    const values = b.values !== null && typeof b.values === 'object' && !Array.isArray(b.values) ? (b.values as Record<string, Json>) : {};
    return { at, body: b.body, values };
  }
  return null;
}

/** Every `{{path}}` a template names, in order and once each. */
export const holesOf = (template: string): string[] => [...new Set([...template.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/gu)].map((m) => m[1]!))];

/**
 * A short hash of what a line is written from, the same on the night it was written and on any read after while nothing
 * moved. Not a secret and not a check against tampering, only "has this changed": cyrb53, so it needs no async digest
 * and is the same in Node and in the Worker.
 */
export function headlineBasis(page: string, lead: LeadBlock): string {
  const values = Object.keys(lead.values)
    .sort()
    .map((k) => [k, lead.values[k]]);
  const text = JSON.stringify([page, lead.body, values]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A money in minor units as a person reads it, in the currency's own decimals: `GBP 33,850.00`, `JPY 129,900`. */
const moneyOf = (amount: number, currency: string): string => {
  const exp = exponentOf(currency);
  const body = (Math.abs(amount) / 10 ** exp).toLocaleString('en-u-nu-latn', { minimumFractionDigits: exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${amount < 0 ? '−' : ''}${body}`;
};

/**
 * A value as a person reads it, or `null` for one with nothing to say. A figure in several currencies is each of its
 * amounts, never their sum: two currencies are not added.
 */
export function figureText(v: Json | undefined): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-u-nu-latn', { maximumFractionDigits: 2 }) : null;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const isMoney = (p: unknown): p is { amount: number; currency: string } =>
    p !== null && typeof p === 'object' && typeof (p as { amount?: unknown }).amount === 'number' && typeof (p as { currency?: unknown }).currency === 'string';
  if (Array.isArray(v)) return v.length > 0 && v.every(isMoney) ? v.map((p) => moneyOf(p.amount, p.currency)).join(' · ') : null;
  return isMoney(v) ? moneyOf(v.amount, v.currency) : null;
}

/** A figure that is nought, in any of the shapes `figureText` writes one. */
const nought = (text: string): boolean => text.split(' · ').every((part) => /^(?:[A-Z]{3} )?[-−]?0+(?:\.0+)?%?$/u.test(part.trim()));

/**
 * The line the rules say, filled: each hole written as a person reads it, a clause whose figure has no value or is
 * nought left out, and `account(s)` one or several. The app's `leadOf` is the one the page draws; this is the same
 * sentence for the model to improve on, so it is handed what the person would otherwise read.
 */
export function rulesLine(template: string, values: Readonly<Record<string, Json>>): string {
  const said = (path: string): string | null => (Object.hasOwn(values, path) ? figureText(values[path]) : null);
  const kept = template.split(/,\s+/u).filter((clause) => {
    const figures = holesOf(clause).map(said);
    return figures.length === 0 || (figures.every((f) => f !== null) && figures.some((f) => !nought(f!)));
  });
  return kept
    .join(', ')
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)/gu, (_, path: string, between: string, word: string) => {
      const figure = said(path) ?? '';
      return `${figure}${between} ${figure.trim() === '1' ? word : `${word}s`}`;
    })
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}/gu, (_, path: string) => said(path) ?? '')
    .replace(/([A-Za-z]+)\(s\)/gu, '$1s')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

/**
 * The numbers a line can say in words, each as the number it is. "One step of two is done" says 1 and 2 as surely as
 * "1 of 2" does, and a line read for digits alone kept it the night a third step was added. A compound is read as its
 * parts, so "two hundred" is 2 and 100 and is refused beside a figure of 200: the rules' line stands, which is the side
 * a doubt errs on.
 */
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1_000_000, dozen: 12,
};

/** Every number written in a text, as a number: `GBP 33,850.00` is 33850, `+8%` is 8, `12 days` is 12, `two` is 2. */
export const numbersIn = (text: string): number[] => [
  ...[...text.matchAll(/\d[\d,]*(?:\.\d+)?/gu)].map((m) => Number(m[0].replace(/,/gu, ''))).filter((n) => Number.isFinite(n)),
  ...[...text.toLowerCase().matchAll(/\b[a-z]+\b/gu)].flatMap((m) => (Object.hasOwn(WORD_NUMBERS, m[0]) ? [WORD_NUMBERS[m[0]]!] : [])),
];

/** Every number the model was handed for one page, which are the only numbers its line may say. */
export const numbersOf = (page: HeadlinePage): Set<number> =>
  new Set([page.title, page.rules, ...page.figures.flatMap((f) => [f.value, f.change ?? ''])].flatMap(numbersIn));

/**
 * Why a line the model wrote is not kept, or `null` for one that is. One line of at most `HEADLINE_MOST`, no hole
 * left in it and no markup, no number it was not handed, in digits or in words, and none of the system's words.
 */
export function headlineFault(text: unknown, page: HeadlinePage): string | null {
  if (typeof text !== 'string' || text.trim() === '') return `The model wrote no line for ${page.title}.`;
  const line = text.trim();
  if (line.length > HEADLINE_MOST) return `The line for ${page.title} was longer than ${HEADLINE_MOST} characters.`;
  /* A HOLE, A BREAK OR MARKUP: the lead note's body is drawn as written, so a `**` or a `[link](…)` would be drawn too. */
  if (/[\n\r{}[\]*`<>]/u.test(line)) return `The line for ${page.title} was not one plain sentence.`;
  if (SYSTEM_WORDS.test(line)) return `The line for ${page.title} used the system's words rather than the person's.`;
  const handed = numbersOf(page);
  const made = numbersIn(line).find((n) => !handed.has(n));
  if (made !== undefined) return `The line for ${page.title} said ${made}, which none of its figures holds.`;
  return null;
}

/** A kept line as Slash's pref holds it, or `null` for a pref that is not one. */
export function storedHeadline(raw: unknown): SlashHeadline | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { text, day, basis } = raw as { text?: unknown; day?: unknown; basis?: unknown };
  return typeof text === 'string' && typeof day === 'string' && typeof basis === 'string' ? { text, day, basis } : null;
}

/** The lines the model answered, by page, from `{"lines":{"<page>":"..."}}`; anything else is no lines at all. */
export function linesIn(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const lines = (raw as { lines?: unknown }).lines;
  return lines !== null && typeof lines === 'object' && !Array.isArray(lines) ? (lines as Record<string, unknown>) : null;
}
