/**
 * The headline line on each page, and the one on Home, written by the model and checked before it is kept.
 *
 * A PAGE'S LEAD NOTE IS SAID BY RULES (`leadOf` in the app): its holes filled and a clause whose figure is nought taken
 * away. That reads "Cash is GBP 33,850.00 across 2 accounts", which is true and says nothing about what matters. DIRECTION
 * §35 has a model read the figures and say it, so once a day `slashHeadlines` (`index.ts`) asks the model for one line a
 * page, every page at once, on the background allowance and never one of the person's own asks.
 *
 * THE MODEL IS HANDED THE PERSON'S OWN THINGS, NOT ONLY FIGURES: the titles of what is late or due on the page's lists
 * (`items`, at most `HEADLINE_ITEMS_MOST`) and the first open question about them, so a line can say "the EDF bill is the
 * late one" rather than restate a count. Home is one more page in the same ask (`HOME_PAGE`), read from Today inside the
 * record: how many things need the person, the titles of what is late, and how many runs are working.
 *
 * NOTHING THE MODEL SAYS IS TRUSTED AS IT CAME. `headlineFault` keeps a line only when it is one short sentence, every
 * number in it is a number the model was handed, and it names none of the system's words, so the line on the page can
 * never say a figure the tiles beside it do not. A line is kept with the `basis` it was written from, a hash of the lead
 * note's figures (and `facts`, a hash of the titles it was handed), and the page read sends it only while both still hash
 * the same: once a figure moves, the rules speak again until a new line is written.
 *
 * AND A NEW LINE IS WRITTEN THE SAME DAY, ONCE. A page whose basis moves after the night's ask is asked about again on a
 * later tick, on the background allowance, and never more than `HEADLINE_ASKS_DAY` headline asks are made in one day
 * (`HEADLINES_ASKED`), so a busy day costs one extra ask and not one a write.
 */

import type { Json } from '@braindog/kernel';
import { exponentOf } from '@braindog/kernel';

/** A headline is a line, not a paragraph: what fits beside a page's title on a phone. */
export const HEADLINE_MOST = 140;

/** At most this many pages go into the one nightly ask, so its input stays the size of one ask. */
export const HEADLINE_PAGES_MOST = 24;

/** The pref a page's line is kept under, as Slash's own (`pref`, person `slash`). */
export const headlineKey = (page: string): string => `headline.${page}`;

/** Home's id in the ask and in the pref its line is kept under (`headline.home`). A page declared `home` is not asked as a page. */
export const HOME_PAGE = 'home';

/** How many late or due things a page's ask names, most pressing first. */
export const HEADLINE_ITEMS_MOST = 3;

/** At most this many headline asks in one day: the night's, and one more when a page's figures move after it. */
export const HEADLINE_ASKS_DAY = 2;

/** How often a tick after the day's look reads the pages again for a basis that moved: a read, never an ask. */
export const HEADLINE_LOOK_MS = 15 * 60_000;

/** Slash's pref counting the day's headline asks, and the basis each page was last asked at that day. Not `headline.`, so no page's slug can be it. */
export const HEADLINES_ASKED = 'headlines.asked';

/** The words a person never reads about their own things (DIRECTION §35): the system's, not theirs. */
const SYSTEM_WORDS = /\b(?:rows?|lists?|registers?|blocks?)\b/iu;

/** One figure the model is handed: its path as the note writes it, its value as a person reads it, and how far it moved. */
export type HeadlineFigure = { id: string; value: string; change?: string };

/** One thing late or due on a page's lists, by its own title: late, due today, or due tomorrow. No day, so no number. */
export type HeadlineItem = { title: string; when: 'late' | 'today' | 'tomorrow' };

/**
 * One page the model is asked to say a line for. `rules` is the line the rules say today, filled. `items` are the titles
 * of what is late or due on its lists, most pressing first, and `question` the first open question about them; each is
 * left out when there is none, so a page with nothing pressing is handed what it always was.
 */
export type HeadlinePage = { page: string; title: string; rules: string; figures: HeadlineFigure[]; items?: HeadlineItem[]; question?: string };

/** What `SlashModel.headline` is handed. The host answers `{"lines":{"<page>":"..."}}`. */
export type HeadlineInput = { today: string; pages: HeadlinePage[] };

/**
 * A line as it is kept: the text, the day it was written, and the hash of the figures it was written from. `facts` is the
 * hash of the titles and the question it was handed, kept only when it was handed some, so a line naming a bill is not
 * sent once that bill is paid.
 */
export type SlashHeadline = { text: string; day: string; basis: string; facts?: string };

/** The day's headline asks as `HEADLINES_ASKED` keeps them: how many, and the basis each page was last asked at. */
export type HeadlinesAsked = { day: string; asks: number; bases: Record<string, string> };

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
 * A short hash of a text. Not a secret and not a check against tampering, only "has this changed": cyrb53, so it needs no
 * async digest and is the same in Node and in the Worker.
 */
function hashOf(text: string): string {
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

/** What a page's line is written from, the same on the day it was written and on any read after while nothing moved. */
export function headlineBasis(page: string, lead: LeadBlock): string {
  const values = Object.keys(lead.values)
    .sort()
    .map((k) => [k, lead.values[k]]);
  return hashOf(JSON.stringify([page, lead.body, values]));
}

/** The titles and the question a page was handed, as one hash, or `undefined` when it was handed none. */
export const factsBasis = (items: readonly HeadlineItem[], question: string | undefined): string | undefined =>
  items.length === 0 && question === undefined ? undefined : hashOf(JSON.stringify([items, question ?? null]));

/**
 * What Home's line is written from: the day, its figures, the titles and the question. The day is in it because "late"
 * is a word about today, so yesterday's line is never sent this morning.
 */
export const homeBasis = (home: HeadlinePage, today: string): string =>
  hashOf(JSON.stringify([today, home.figures.map((f) => [f.id, f.value]), home.items ?? [], home.question ?? null]));

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
  new Set([page.title, page.rules, ...page.figures.flatMap((f) => [f.value, f.change ?? '']), ...namesOf(page)].flatMap(numbersIn));

/** The person's own names a page was handed: the titles of what is late or due, and the open question. */
const namesOf = (page: HeadlinePage): string[] => [...(page.items ?? []).map((i) => i.title), ...(page.question === undefined ? [] : [page.question])];

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
  /* A NAME OF THEIR OWN MAY HOLD ONE OF THOSE WORDS, "Reading list" or "Fix the rows", and saying it is naming their
     thing: what is checked is the line with the names it was handed taken out. */
  const own = namesOf(page)
    .filter((n) => n.trim() !== '')
    .sort((a, b) => b.length - a.length)
    .reduce((rest, n) => rest.split(n).join(' '), line);
  if (SYSTEM_WORDS.test(own)) return `The line for ${page.title} used the system's words rather than the person's.`;
  const handed = numbersOf(page);
  const made = numbersIn(line).find((n) => !handed.has(n));
  if (made !== undefined) return `The line for ${page.title} said ${made}, which none of its figures holds.`;
  return null;
}

/** A kept line as Slash's pref holds it, or `null` for a pref that is not one. */
export function storedHeadline(raw: unknown): SlashHeadline | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { text, day, basis, facts } = raw as { text?: unknown; day?: unknown; basis?: unknown; facts?: unknown };
  if (typeof text !== 'string' || typeof day !== 'string' || typeof basis !== 'string') return null;
  return typeof facts === 'string' ? { text, day, basis, facts } : { text, day, basis };
}

/** The day's headline asks as kept, or a day with none asked yet when the pref is another day's or not one. */
export function askedOn(raw: unknown, today: string): HeadlinesAsked {
  const none: HeadlinesAsked = { day: today, asks: 0, bases: {} };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return none;
  const { day, asks, bases } = raw as { day?: unknown; asks?: unknown; bases?: unknown };
  if (day !== today || typeof asks !== 'number' || !Number.isInteger(asks) || asks < 0) return none;
  const kept: Record<string, string> = {};
  if (bases !== null && typeof bases === 'object' && !Array.isArray(bases))
    for (const [page, b] of Object.entries(bases)) if (typeof b === 'string') kept[page] = b;
  return { day: today, asks, bases: kept };
}

/**
 * Home's line as the rules would say it, from the reading Home's ask is handed: how many things need the person, how
 * many of them are late, and how many runs are working. In digits, as the figures the model may repeat are.
 */
export function homeRulesLine(needs: number, late: number, working: number): string {
  const runs = working === 0 ? 'no agent is working' : working === 1 ? '1 agent is working' : `${working} agents are working`;
  if (needs === 0) return `Nothing needs you, and ${runs}.`;
  const head = `${needs} ${needs === 1 ? 'thing needs' : 'things need'} you`;
  if (late === 0) return `${head}, and ${runs}.`;
  return `${head}, and ${late === needs ? (needs === 1 ? 'it is late' : 'all are late') : `${late} ${late === 1 ? 'is' : 'are'} late`}.`;
}

/** The lines the model answered, by page, from `{"lines":{"<page>":"..."}}`; anything else is no lines at all. */
export function linesIn(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const lines = (raw as { lines?: unknown }).lines;
  return lines !== null && typeof lines === 'object' && !Array.isArray(lines) ? (lines as Record<string, unknown>) : null;
}
