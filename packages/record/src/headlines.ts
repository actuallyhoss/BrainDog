/**
 * The headline line on each page, and the one on Home, written by the model and checked before it is kept.
 *
 * A PAGE'S LEAD NOTE IS SAID BY RULES (`leadOf` in the app): its holes filled and a clause whose figure is nought taken
 * away. That reads "Cash is GBP 33,850.00 across 2 accounts", which is true and says nothing about what matters. A model
 * reads the figures and says it instead, so once a day `slashHeadlines` (`index.ts`) asks the model for one line a
 * page, every page at once, on the background allowance and never one of the person's own asks.
 *
 * THE MODEL IS HANDED THE PERSON'S OWN THINGS, NOT ONLY FIGURES: the titles of what is late or due on the page's lists
 * (`items`, at most `HEADLINE_ITEMS_MOST`) and the first open question about them, so a line can say "the EDF bill is the
 * late one" rather than restate a count. Home is one more page in the same ask (`HOME_PAGE`), read from Today inside the
 * record: how many things need the person, the titles of what is late, and how many runs are working.
 *
 * NOTHING THE MODEL SAYS IS TRUSTED AS IT CAME, AND IT TYPES NO NUMBER. Each figure is handed with
 * its id and the model writes `{{id}}` where the number goes; the record fills the hole from what it handed
 * (`filledHeadline`). `headlineFault` keeps a line only when it is one short sentence, every hole in it names a figure
 * the page was handed, it holds no digit and no number in words, and it names none of the system's words, so the line on
 * the page can never say a figure the tiles beside it do not, nor a right number in a sentence of the model's own
 * arithmetic. A line is kept with the `basis` it was written from, a hash of the lead
 * note's figures (and `facts`, a hash of the titles it was handed), and the page read sends it only while both still hash
 * the same: once a figure moves, the rules speak again until a new line is written.
 *
 * AND A NEW LINE IS WRITTEN MINUTES AFTER THE BASIS MOVES. A page whose basis moves is owed a look from that moment
 * (`owedSince`), and the ask goes `HEADLINE_OWED_MS` after the first page was owed with every owed page in it
 * (`owedPages`), so a burst of writes is one ask and not one a write. On the background allowance, and never more than
 * `HEADLINE_ASKS_DAY` headline asks in one day (`HEADLINES_ASKED`).
 *
 * AND THE SAME ASK ARRANGES THE PAGE (`compose-look.ts`). Each page is handed its blocks by `key` and a
 * few of the rows it draws by their handle and title, and the model may answer `{ headline, order, next }` in place of
 * the bare line: what leads after the lead note, and the one thing to do next. No extra ask, so the look costs Free
 * nothing beyond the headline it already had.
 */

import type { Json } from '@braindog/kernel';
import { exponentOf } from '@braindog/kernel';

import { nothingWaits, type WaitingNow } from './waiting.ts';

/** A noun's many: an s, except "person(s)", which is people and never "persons" (AN16). */
const manyOf = (word: string): string => (word === 'person' ? 'people' : word === 'Person' ? 'People' : `${word}s`);

/** A headline is a line, not a paragraph: what fits beside a page's title on a phone. */
export const HEADLINE_MOST = 140;

/** A line as the model wrote it, holes unfilled, is at most this long: what a look's headline may hold. */
export const HEADLINE_RAW_MOST = 200;

/** At most this many pages go into the one nightly ask, so its input stays the size of one ask. */
export const HEADLINE_PAGES_MOST = 24;

/**
 * THE MOST OF ONE HEADLINE ASK'S CEILING ITS ANSWER MAY TAKE, in tokens counted as the Worker counts a prompt, four bytes a
 * token. An ask holds no more pages than the longest answer each could give fits in (`lookAnswerMost` in
 * `compose-look.ts`); the pages left over are owed and asked on a later tick (`owedSince`), as a page whose basis moved is.
 *
 * WHY HALF OF THE 2,048 THE CLOUD ASKS WITH (`RECORD_TOKENS` in `apps/worker/src/slash.ts`). Its model reasons before it
 * answers and spends that from the same ceiling (`Effort` in `apps/worker/src/inference.ts`), so the answer never has
 * the whole of it; and a block's key or a row's handle is the kind of text that runs to fewer bytes a token than prose.
 * On 23 October three of the night look's asks stopped at the ceiling within its first two minutes, and the one ask over
 * every page could never have fitted: the answer it allowed, a whole look for each of 24 pages, runs to several thousand
 * tokens (`test/headline-answer-room.test.ts`).
 */
export const HEADLINE_ANSWER_TOKENS = 1_024;

/** The pref a page's line is kept under, as Slash's own (`pref`, person `slash`). */
export const headlineKey = (page: string): string => `headline.${page}`;

/** Home's id in the ask and in the pref its line is kept under (`headline.home`). A page declared `home` is not asked as a page. */
export const HOME_PAGE = 'home';

/** How many late or due things a page's ask names, most pressing first. */
export const HEADLINE_ITEMS_MOST = 3;

/** At most this many headline asks in one day: the night's, and one each time pages are owed a look after it. */
export const HEADLINE_ASKS_DAY = 8;

/** How long after the first page is owed a look the ask goes, so the writes of one sitting are one ask. */
export const HEADLINE_OWED_MS = 15 * 60_000;

/** Slash's pref keeping when each owed page was first owed, by page, in milliseconds. Not `headline.`, so no page's slug can be it. */
export const HEADLINES_OWED = 'headlines.owed';

/** How often a tick after the day's look reads the pages again for a basis that moved: a read, never an ask. */
export const HEADLINE_LOOK_MS = 15 * 60_000;

/**
 * HOW LONG A LATER LOOK OF THE DAY TRUSTS A RECORD THAT HAS NOT MOVED. Every write leaves a line in the log, so a walk
 * of the pages over a record with no new line finds what the last one found; what moves with no line (the clock, a run's
 * heartbeat) is looked at again after this, and on every new day.
 */
export const LOOK_REWALK_MS = 3 * 60 * 60_000;

/**
 * HOW LONG A LATER WALK OF THE DAY PASSES OVER A PAGE WHOSE LISTS STAND (F35, perf2). A page found owed nothing is kept
 * with the lists it read and their versions, and a later walk draws it again only once one of them moved, or after this:
 * what a page says moves with the clock too (a bill comes due, a window of thirty days slides), and the walk itself
 * trusts a record with no new line for `LOOK_REWALK_MS`. So every page is drawn at least once an hour while the walks run.
 */
export const PAGE_SEEN_MS = 60 * 60_000;

/** Slash's pref counting the day's headline asks, and the basis each page was last asked at that day. Not `headline.`, so no page's slug can be it. */
export const HEADLINES_ASKED = 'headlines.asked';

/**
 * HOW MANY PAGES SAY THE MODEL'S LINE NOW, kept by the record's daily lint round as Slash's pref (`headlinesHeld` in
 * `index.ts`) and said in the model sign's facts (`packages/host/src/sign-model.ts`). A count of asks says the model
 * answered; this says what it wrote is still on the pages: a kept line whose basis and facts still hold, not refused,
 * and not under a headline the person fixed. Home is not a page here.
 */
export const HEADLINES_HELD = 'headlines.held';

/** The count as kept: the UTC day of the round, pages whose line is the model's, and pages with a lead note at all. */
export type HeadlinesHeld = { day: string; written: number; pages: number };

/** A kept count, or `null` for anything else. */
export function heldOn(raw: unknown): HeadlinesHeld | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { day, written, pages } = raw as Partial<HeadlinesHeld>;
  if (typeof day !== 'string' || !Number.isInteger(written) || !Number.isInteger(pages)) return null;
  if (written! < 0 || pages! < written!) return null;
  return { day, written: written!, pages: pages! };
}

/** The fact the model sign carries: `Page headlines: 9 of 14 pages written by the model now.` */
export const heldSaid = (held: HeadlinesHeld): string =>
  held.pages === 0 ? 'Page headlines: no page has a lead note for the model to write.' : `Page headlines: ${held.written} of ${held.pages} ${held.pages === 1 ? 'page' : 'pages'} written by the model now.`;

/** The words a person never reads about their own things: the system's, not theirs. */
export const SYSTEM_WORDS = /\b(?:rows?|lists?|registers?|blocks?)\b/iu;

/**
 * One figure the model is handed: its `id`, the path the note writes it by, its value as a person reads it, and how far
 * it moved. THE ID IS THE HOLE: a line says the value as `{{id}}` and the change as `{{id.change}}`, and types neither.
 */
export type HeadlineFigure = { id: string; value: string; change?: string };

/** One thing late or due on a page's lists, by its own title: late, due today, or due tomorrow. No day, so no number. */
export type HeadlineItem = { title: string; when: 'late' | 'today' | 'tomorrow' };

/** At most this many of a page's blocks are handed by key, the lead note first, so the ask stays one ask's size. */
export const HEADLINE_BLOCKS_MOST = 12;

/** At most this many of the rows a page draws are handed, one of which the model may name as the next thing to do. */
export const HEADLINE_ROWS_MOST = 5;

/**
 * One block of a page as the model is handed it: its `key` (declared, or the kernel's hash of kind, source and heading),
 * its kind, the heading a person reads, and `lead` on the lead note, which stays first whatever order comes back.
 * `group` is the fields of its list it may be drawn in groups by, on a long part that draws cards and on no other.
 */
export type HeadlineBlock = { key: string; kind: string; heading?: string; lead?: true; group?: string[] };

/**
 * One row a page draws, as the model is handed it: `row` is its handle (`tasks#4`), never shown to a person, beside the
 * `title` that is. The model's `next` names one of these by its handle, and nothing else.
 */
export type HeadlineRow = { row: string; title: string };

/**
 * One page the model is asked to say a line for. `rules` is the line the rules say today, filled. `items` are the titles
 * of what is late or due on its lists, most pressing first, and `question` the first open question about them; each is
 * left out when there is none, so a page with nothing pressing is handed what it always was.
 *
 * `blocks` and `rows` ARE WHAT THE LOOK IS MADE OF (`compose-look.ts`): the page's blocks by key, and a few rows it draws.
 * Home has neither, since its look is Today's own.
 */
export type HeadlinePage = {
  page: string;
  title: string;
  rules: string;
  figures: HeadlineFigure[];
  items?: HeadlineItem[];
  question?: string;
  blocks?: HeadlineBlock[];
  rows?: HeadlineRow[];
};

/**
 * What `SlashModel.headline` is handed. The host answers `{"lines":{"<page>":"..."}}`, or for a page handed blocks,
 * `{"lines":{"<page>":{"headline":"...","lead":"<key>","order":["<key>",...],"hide":["<key>",...],"next":{"row":"<handle>","text":"..."}}}}`.
 * Either is read (`lineOf` for the line, `lookAnswerOf` in `compose-look.ts` for the rest).
 */
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

/** The most figures a page per row hands the model from its tiles (`tileFiguresOf`). */
export const HEADLINE_ROW_FIGURES = 6;

/**
 * WHAT A PAGE PER ROW'S TILES SAY, by the figure each names, in the order drawn, as the page read answered them (the
 * thinking scope of 24 October). A project's lead is its next step, which the template fills in as words, so it
 * names no figure and no line was ever asked of it: what its tiles count (open work, done this week, last worked) is
 * what the model's line is written from, and what moves it. Read off the blocks as the caller is shown them, never
 * asked of the record again, so a reader whose tiles are held reads other values and no line. At most
 * `HEADLINE_ROW_FIGURES`; a money figure as the lead's own values carry one.
 */
export function tileValuesOf(blocks: readonly unknown[]): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const raw of blocks) {
    const b = raw as { kind?: unknown; readings?: unknown } | null;
    if (b === null || typeof b !== 'object' || b.kind !== 'stat' || !Array.isArray(b.readings)) continue;
    for (const r of b.readings as { metric?: unknown; reading?: { value?: unknown; unit?: unknown } | null }[]) {
      if (Object.keys(out).length >= HEADLINE_ROW_FIGURES) return out;
      const value = r?.reading?.value;
      if (typeof r?.metric !== 'string' || r.metric === '' || Object.hasOwn(out, r.metric) || typeof value !== 'number') continue;
      const unit = r.reading?.unit;
      out[r.metric] = typeof unit === 'string' && unit !== '' ? { amount: value, currency: unit } : value;
    }
  }
  return out;
}

/** A page per row's lead with what its tiles say beside its own values (`tileValuesOf`): what its line is written from. */
export const tiledLead = (lead: LeadBlock, blocks: readonly unknown[]): LeadBlock => ({ ...lead, values: { ...tileValuesOf(blocks), ...lead.values } });

/** Every `{{path}}` a template names, in order and once each. */
export const holesOf = (template: string): string[] => [...new Set([...template.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/gu)].map((m) => m[1]!))];

/**
 * A short hash of a text. Not a secret and not a check against tampering, only "has this changed": cyrb53, so it needs no
 * async digest and is the same in Node and in the Worker.
 */
export function hashOf(text: string): string {
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
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A DAY AS THE APP SAYS ONE (Q34 of 29 October): "13 Jan 2027", and "29 Oct" in the year it is. A line said "the last
 * due on 2036-04-13" and "cash lasts to 2027-01-13" where every other place reads "13 Jan 2027".
 */
export function dayWords(iso: string, now: Today = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!m) return iso;
  const said = `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]}`;
  return Number(m[1]) === yearOf(now) ? said : `${said} ${m[1]}`;
}

/**
 * WHEN "THE YEAR IT IS" IS READ FROM (F36): the record's own day ("2026-12-31", what a tick is handed as `today`), or an
 * instant. The day is the record's, so a record in Cairo says "1 Jan" on its own New Year's morning while the machine's
 * clock is still in the old year in UTC, and a test with a fixed clock says what that clock says.
 */
export type Today = number | string;

const yearOf = (now: Today): number => {
  if (typeof now === 'string') {
    const y = /^(\d{4})-\d{2}-\d{2}/u.exec(now)?.[1];
    if (y !== undefined) return Number(y);
    const t = Date.parse(now);
    return Number.isFinite(t) ? new Date(t).getUTCFullYear() : new Date().getUTCFullYear();
  }
  return new Date(now).getUTCFullYear();
};

/**
 * A LINE AS A PERSON WOULD WRITE IT, whatever the model wrote (Q34 of 29 October): every ISO day as the app says it, no
 * sign after a word that already says which way ("down −11%" is "down 11%"), and no "The" before the name of one of the
 * person's own things ("Northwind Premiums is late", never "The Northwind Premiums is late").
 */
export function plainLine(line: string, names: readonly string[] = [], now: Today = Date.now()): string {
  let out = line.replace(/(?<![\d-])(\d{4}-\d{2}-\d{2})(?![\d-])/gu, (d) => dayWords(d, now));
  out = out.replace(/\b(down|up|fell|rose|dropped|climbed|fallen|risen|lower|higher)( by)?\s+[−+-]\s?(?=\d)/giu, (_, w: string, by: string | undefined) => `${w}${by ?? ''} `);
  for (const name of names) {
    const n = name.trim();
    /* ONLY A NAME, every word of it capitalised ("Northwind Premiums"): "the EDF bill" and "the rent" keep theirs. */
    if (n === '' || /^the\s/iu.test(n) || !n.split(/\s+/u).every((w) => /^[\p{Lu}\p{N}]/u.test(w))) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    out = out.replace(new RegExp(`(^|[.;:!?]\\s+)The (${esc})`, 'gu'), (_, lead: string, said: string) => `${lead}${said}`).replace(new RegExp(`\\bthe (${esc})`, 'gu'), '$1');
  }
  return out;
}

export function figureText(v: Json | undefined, now: Today = Date.now()): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : dayWords(v, now);
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-u-nu-latn', { maximumFractionDigits: 2 }) : null;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const isMoney = (p: unknown): p is { amount: number; currency: string } =>
    p !== null && typeof p === 'object' && typeof (p as { amount?: unknown }).amount === 'number' && typeof (p as { currency?: unknown }).currency === 'string';
  if (Array.isArray(v)) return v.length > 0 && v.every(isMoney) ? v.map((p) => moneyOf(p.amount, p.currency)).join(' · ') : null;
  return isMoney(v) ? moneyOf(v.amount, v.currency) : null;
}

/** A figure that is nought, in any of the shapes `figureText` writes one. */
export const nought = (text: string): boolean => text.split(' · ').every((part) => /^(?:[A-Z]{3} )?[-−]?0+(?:\.0+)?%?$/u.test(part.trim()));

/**
 * The line the rules say, filled: each hole written as a person reads it, a clause whose figure has no value or is
 * nought left out, and `account(s)` one or several. The app's `leadOf` is the one the page draws; this is the same
 * sentence for the model to improve on, so it is handed what the person would otherwise read.
 */
export function rulesLine(template: string, values: Readonly<Record<string, Json>>, now: Today = Date.now()): string {
  const said = (path: string): string | null => (Object.hasOwn(values, path) ? figureText(values[path], now) : null);
  const stands = (clause: string): boolean => {
    const figures = holesOf(clause).map(said);
    return figures.length === 0 || (figures.every((f) => f !== null) && figures.some((f) => !nought(f!)));
  };
  /* A CLAUSE THAT OPENS ON "with" LEANS ON THE ONE BEFORE IT, and goes when that one goes, as the app's `leadOf` drops it. */
  let before = true;
  const kept = template.split(/,\s+/u).filter((clause) => (before = stands(clause) && (before || !/^with\b/iu.test(clause))));
  return kept
    .join(', ')
    /* A LINK IS ITS WORDS: Money's figure late is the way to the bills (money-core, polish-i PI1), and the model is
       handed the sentence a person reads, not its address. */
    .replace(/\[([^\]]*)\]\([^)\s]*\)/gu, '$1')
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)/gu, (_, path: string, between: string, word: string) => {
      const figure = said(path) ?? '';
      return `${figure}${between} ${figure.trim() === '1' ? word : manyOf(word)}`;
    })
    .replace(/\{\{\s*([^{}\s]+)\s*\}\}/gu, (_, path: string) => said(path) ?? '')
    .replace(/([A-Za-z]+)\(s\)/gu, (_, word: string) => manyOf(word))
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

/** Every number the model was handed for one page, which are the only numbers a next step's phrase may say (`nextFault`). */
export const numbersOf = (page: HeadlinePage): Set<number> =>
  new Set([page.title, page.rules, ...page.figures.flatMap((f) => [f.value, f.change ?? '']), ...namesOf(page)].flatMap(numbersIn));

/** The person's own names a page was handed: the titles of what is late or due, and the open question. */
const namesOf = (page: HeadlinePage): string[] => [...(page.items ?? []).map((i) => i.title), ...(page.question === undefined ? [] : [page.question])];

/** A hole as a line writes it: `{{id}}`, the id a figure was handed by. The same form a lead note's template has. */
const HOLE = /\{\{\s*([^{}\s]+)\s*\}\}/gu;

/**
 * Every hole a page's line may hold, with what fills it: each figure's id for its value, and `<id>.change` for how far
 * it moved, when the page was handed that. Nothing else is a hole of this page.
 */
export function handedHoles(page: HeadlinePage): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of page.figures) {
    out.set(f.id, f.value);
    if (f.change !== undefined && !out.has(`${f.id}.change`)) out.set(`${f.id}.change`, f.change);
  }
  return out;
}

/**
 * A line with each of its holes filled from the figures its page was handed, as a person reads it, or `null` when a
 * hole names a figure the page was not handed. A line with no hole is itself.
 */
export function filledHeadline(line: string, page: HeadlinePage, now: Today = Date.now()): string | null {
  const handed = handedHoles(page);
  let missing = false;
  const filled = line.replace(HOLE, (_, id: string) => {
    const value = handed.get(id);
    if (value === undefined) missing = true;
    return value ?? '';
  });
  return missing ? null : plainLine(filled.trim(), namesOf(page), now);
}

/** A markdown link as a lead note's template writes one: `[{{overdue}}](/r/obligations?…)`. */
const LINK = /\[([^\]]*)\]\(([^)\s]*)\)/gu;

/**
 * THE MODEL'S LINE KEEPS THE TEMPLATE'S LINKS (polish-j PJ2). Money's figure late is the way to the bills in the rules'
 * line (`[{{overdue}}](/r/obligations?…)`, money-core 3.33.0), and the line written overnight in its place said the same
 * figure with no way to them: the model is handed the sentence without its addresses (`rulesLine`) and may type no
 * markup (`headlineFault`). So the record lays each link back where the line says what the link's words are, filled from
 * the lead's own values: the whole label, or the one figure a one-hole label names. Once each, never inside a link
 * already laid, and never inside a longer number. A label whose figure has no value, or one the line does not say, lays
 * nothing, and the line is as it was kept.
 */
export function linkedLine(text: string, lead: Pick<LeadBlock, 'body' | 'values'>, now: Today = Date.now()): string {
  if (!lead.body.includes('](')) return text;
  let out = text;
  for (const [, label, href] of lead.body.matchAll(LINK)) {
    if (href === undefined || href === '' || label === undefined) continue;
    const holes = holesOf(label);
    if (holes.length === 0) continue;
    const said = (path: string): string | null => (Object.hasOwn(lead.values, path) ? figureText(lead.values[path], now) : null);
    const whole = holes.every((h) => said(h) !== null) ? label.replace(HOLE, (_, path: string) => said(path)!).trim() : null;
    const one = holes.length === 1 ? said(holes[0]!) : null;
    for (const words of [whole, one]) {
      if (words === null || words === '') continue;
      const laid = laidOnce(out, words, href);
      if (laid !== null) {
        out = laid;
        break;
      }
    }
  }
  return out;
}

/** `text` with the first `words` outside a link made a link to `href`, or `null` when the line never says them so. */
function laidOnce(text: string, words: string, href: string): string | null {
  const taken = [...text.matchAll(LINK)].map((m) => [m.index, m.index + m[0].length] as const);
  const esc = words.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}.,])${esc}(?![\\p{L}\\p{N}]|[.,]\\p{N})`, 'gu'))) {
    if (taken.some(([from, to]) => m.index >= from && m.index < to)) continue;
    return `${text.slice(0, m.index)}[${words}](${href})${text.slice(m.index + words.length)}`;
  }
  return null;
}

/**
 * A page's rules line with each figure it says written as that figure's hole: what "give back the rules line" means now
 * that no number is typed. Each value is found whole, never inside a longer number, and the longest first, so `2` is
 * not taken out of `GBP 2,400.00`. A number the rules worked out and no figure holds is left as it is, and
 * `headlineFault` refuses the line for it.
 */
export function holedRules(page: HeadlinePage): string {
  const by = new Map<string, string>();
  for (const [id, value] of handedHoles(page)) if (/\d/u.test(value) && !by.has(value)) by.set(value, id);
  if (by.size === 0) return page.rules;
  const said = [...by.keys()].sort((a, b) => b.length - a.length).map((v) => v.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  /* NOR OUT OF A WORD: the `2` of `v2` or `2nd` is part of a name, and a hole never touches a letter (`headlineFault`). */
  return page.rules.replace(new RegExp(`(?<![\\p{L}\\p{N}.,])(?:${said.join('|')})(?![\\p{L}\\p{N}]|[.,]\\p{N})`, 'gu'), (v) => `{{${by.get(v)!}}}`);
}

/**
 * A number as a model types one: `3`, `33,850.00`, `8` in `+8%`. A hole is never one, since it is taken out first. ANY
 * SCRIPT'S DIGIT IS ONE, a full-width `２` or a `²` as much as a `2`: a person reads them all as a number.
 */
const TYPED = /\p{N}+(?:,\p{N}+)*(?:\.\p{N}+)?/u;

/** Numbers said in words that are not counted as numbers elsewhere, but are a count the model worked out all the same. */
const WORKED_OUT: ReadonlySet<string> = new Set(['zero', 'half', 'both', 'twice', 'couple']);

/**
 * A HOLE STANDS AS A WORD OF ITS OWN. Two holes with no space between them, or a hole touching a letter or a digit,
 * make a number or a unit no figure holds: `{{a}}{{b}}` reads 22, `{{a}}.{{b}}` reads 2.2, `{{a}}k` reads 2k.
 */
const JOINED = /\}\}[^\s{}]*\{\{|[\p{L}\p{N}]\{\{|\}\}[\p{L}\p{N}]/u;

/**
 * The first number a text types, as it typed it: a run of digits, or failing that a number in words. "ONE" AFTER "THE",
 * "THIS" OR "THAT" IS A THING AND NOT A COUNT, "the late one", "the one to send", and is let by; "One task waits" is a
 * count and is not, and "no one" is nobody. ONLY INSIDE ONE CLAUSE, with at most one word between that is not itself a number: "Pay the bill,
 * one is late" counts, and so does "the two one".
 */
const typedIn = (text: string): string | undefined => {
  const digit = TYPED.exec(text)?.[0];
  if (digit !== undefined) return digit;
  const things = text.toLowerCase().replace(/\b(the|this|that|no)( +[a-z'’-]+)? +one\b/gu, (all: string, point: string, between: string | undefined) =>
    between !== undefined && Object.hasOwn(WORD_NUMBERS, between.trim()) ? all : `${point}${between ?? ''}`,
  );
  return [...things.matchAll(/\b[a-z]+\b/gu)].map((m) => m[0]).find((w) => Object.hasOwn(WORD_NUMBERS, w) || WORKED_OUT.has(w));
};

/**
 * Why a line the model wrote is not kept, or `null` for one that is. One line of at most `HEADLINE_MOST` once its holes
 * are filled, every hole the id of a figure the page was handed, no markup, NO NUMBER TYPED, in digits or in words, and
 * none of the system's words.
 *
 * A NUMBER IS A HOLE OR IT IS A FAULT. Before, a typed number was kept when the page had been handed it, which let a
 * right number sit in a wrong sentence ("3 of 2 steps" beside figures of 3 and 2). Now the record writes every number
 * itself, from the figure the hole names.
 */
export function headlineFault(text: unknown, page: HeadlinePage, now: Today = Date.now()): string | null {
  if (typeof text !== 'string' || text.trim() === '') return `The model wrote no line for ${page.title}.`;
  const line = text.trim();
  const handed = handedHoles(page);
  const stray = [...line.matchAll(HOLE)].map((m) => m[1]!).find((id) => !handed.has(id));
  if (stray !== undefined) return `The line for ${page.title} left a hole for ${stray}, which is not one of its figures.`;
  if (JOINED.test(line)) return `The line for ${page.title} joined a figure to what is beside it, where each stands as a word of its own.`;
  const filled = filledHeadline(line, page, now) ?? line;
  if (filled.length > HEADLINE_MOST || line.length > HEADLINE_RAW_MOST) return `The line for ${page.title} was longer than ${HEADLINE_MOST} characters.`;
  /* WHAT THE MODEL TYPED ITSELF: the line with its holes taken out. */
  const typed = line.replace(HOLE, ' ');
  /* A BRACE LEFT OVER, A BREAK OR MARKUP: the lead note's body is drawn as written, so a `**` or a `[link](…)` would be drawn too. */
  if (/[\n\r{}[\]*`<>]/u.test(typed)) return `The line for ${page.title} was not one plain sentence.`;
  /* A NAME OF THEIR OWN MAY HOLD ONE OF THOSE WORDS OR A NUMBER, "Reading list", "Fix the rows", "Renew the 2027
     domains", and saying it is naming their thing: what is checked is the line with the names it was handed taken out. */
  const own = [page.title, ...namesOf(page)]
    .filter((n) => n.trim() !== '')
    .sort((a, b) => b.length - a.length)
    .reduce((rest, n) => rest.split(n).join(' '), typed);
  if (SYSTEM_WORDS.test(own)) return `The line for ${page.title} used the system's words rather than the person's.`;
  const digit = typedIn(own);
  if (digit !== undefined) return `The line for ${page.title} typed ${digit}, where a number is written as the hole of its figure.`;
  /* AND HOME'S LINE AGREES WITH WHAT WAITS (`headlineAgrees`), read as it will be drawn, holes filled: the figure for
     one count is never said of another, and "nothing needs you" is never said beside a question or an arrival. */
  const waits = page.page === HOME_PAGE ? waitsHanded(page) : null;
  const off = waits === null ? [] : headlineAgrees(filled, waits);
  if (off.length > 0) return `The line for ${page.title} said "${off[0]!.said}", which is not what waits.`;
  return null;
}

/**
 * A kept line as Slash's pref holds it, or `null` for a pref that is not one. A LINE IS KEPT FILLED (`filledHeadline`),
 * so one with a hole still in it is not a line a page may draw, and it is no line at all: the rules' line stands.
 */
export function storedHeadline(raw: unknown): SlashHeadline | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { text, day, basis, facts } = raw as { text?: unknown; day?: unknown; basis?: unknown; facts?: unknown };
  if (typeof text !== 'string' || typeof day !== 'string' || typeof basis !== 'string') return null;
  if (/\{\{|\}\}/u.test(text)) return null;
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

/** One page as a tick reads it: the basis it has now, and `at`, the basis its line was last written or asked at, if any. */
export type PageBasis = { page: string; basis: string; at?: string };

/** A page that is owed a look, and `since` when: the first moment its basis was seen to have moved, in milliseconds. */
export type OwedBasis = PageBasis & { since: number };

/** When each owed page was first owed, as `HEADLINES_OWED` keeps it; a pref that is not one is no waits at all. */
export function owedOn(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [page, since] of Object.entries(raw)) if (typeof since === 'number' && Number.isFinite(since)) out[page] = since;
  return out;
}

/**
 * The pages owed a look now, each with when it was first owed. A PAGE IS OWED WHEN ITS BASIS MOVED: the basis it has is
 * not the one its line was written or asked at, or it has no line yet. `since` is what was kept for it (`owedOn`) or
 * `now` for one owed from this moment, so a second write does not start its wait again; a page no longer owed is left
 * out, and its wait with it. What comes back, by page, is what `HEADLINES_OWED` keeps next.
 */
export function owedSince(since: Readonly<Record<string, number>>, pages: readonly PageBasis[], now: number): OwedBasis[] {
  return pages.filter((p) => p.basis !== p.at).map((p) => ({ ...p, since: Object.hasOwn(since, p.page) ? Math.min(since[p.page]!, now) : now }));
}

/**
 * THE PAGES THAT GO IN THE ASK NOW: every page whose basis moved, the longest owed first, `HEADLINE_PAGES_MOST` at
 * most, and none until `HEADLINE_OWED_MS` after the first of them was owed. So a page is composed again minutes after
 * its basis moves, and the writes of one sitting are answered in one ask. The day's cap (`HEADLINE_ASKS_DAY`) and the
 * allowance are the caller's to hold; this says only who is owed and whether it is time.
 */
export function owedPages(bases: readonly OwedBasis[], now: number): string[] {
  const owed = bases.filter((b) => b.basis !== b.at);
  if (owed.length === 0) return [];
  const first = Math.min(...owed.map((b) => b.since));
  if (now - first < HEADLINE_OWED_MS) return [];
  return [...owed]
    .sort((a, b) => a.since - b.since)
    .slice(0, HEADLINE_PAGES_MOST)
    .map((b) => b.page);
}

/**
 * Home's line as the rules would say it, from the reading Home's ask is handed: how many things need the person, how
 * many of them are late, how many runs are working, and how many arrivals wait in the inbox. In digits, as the figures
 * the model may repeat are.
 *
 * "NOTHING NEEDS YOU" ONLY WHEN NOTHING DOES: no question (they are in `needs`) and nothing in the inbox
 * (`nothingWaits`). With the inbox holding something it says so in place of the calm line.
 */
export function homeRulesLine(needs: number, late: number, working: number, inbox = 0): string {
  const runs = working === 0 ? 'no agent is working' : working === 1 ? '1 agent is working' : `${working} agents are working`;
  if (needs === 0 && inbox > 0) return `${inbox} ${inbox === 1 ? 'thing waits' : 'things wait'} in your inbox, and ${runs}.`;
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

/**
 * The line in one page's answer: the bare line as it always was, or the `headline` of an answer that also arranges the
 * page. Anything else is handed on as it is, so `headlineFault` says why it was not kept.
 */
export function lineOf(answer: unknown): unknown {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return answer;
  return (answer as { headline?: unknown }).headline;
}

/** What a header said that disagrees with `waiting()`: the words, which count they name, the number said, and the count. */
export type Disagrees = { said: string; names: 'questions' | 'inbox' | 'agents' | 'nothing'; wrote: number; is: number };

/** A count as a header may write it: in digits, in words ("twenty-five" too), or "no". */
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const UNITS = 'one|two|three|four|five|six|seven|eight|nine';
const COUNT = `(\\d[\\d,]*|no|(?:${TENS})-(?:${UNITS})|${Object.keys(WORD_NUMBERS).join('|')})`;

/** "25 questions", "two open questions", "4 agents", "1 arrival": a count and, at most two words on, what it counts. */
const NAMED = new RegExp(`(?<![\\p{L}\\p{N}-])${COUNT}\\s+(?:[\\p{L}]+\\s+){0,2}?(questions?|arrivals?|agents?)(?![\\p{L}])`, 'giu');

/** "3 things wait in your inbox": a count of what waits in the inbox, said without the word arrival. */
const IN_INBOX = new RegExp(`(?<![\\p{L}\\p{N}-])${COUNT}\\s+(?:[\\p{L}]+\\s+){0,3}?in\\s+(?:your|the)\\s+inbox`, 'giu');

/** The calm line in each of the house's and the use cases' words: "Nothing needs you", "nothing waits on you", "Nothing needs your call". */
const NOTHING = /\bnothing\s+(?:needs|waits\s+on|is\s+waiting\s+on)\s+you(?:r\b)?/iu;

/** A count as a number: digits, a word to twenty and the tens, or `no` as nought. */
const countOf = (word: string): number => {
  const w = word.toLowerCase();
  if (w === 'no') return 0;
  if (w.includes('-')) return w.split('-').reduce((n, part) => n + (WORD_NUMBERS[part] ?? NaN), 0);
  if (Object.hasOwn(WORD_NUMBERS, w)) return WORD_NUMBERS[w]!;
  return Number(w.replace(/,/gu, ''));
};

/**
 * `headline-agrees`: WHETHER A HEADER AGREES WITH WHAT WAITS (`waiting()`), and where it does not.
 *
 * A number in a header that names questions equals `questions`; one that names arrivals, or what waits in the inbox,
 * equals `inbox`; one that names agents equals `working`. And a header may say nothing needs the reader only when no
 * question and nothing in the inbox waits (`nothingWaits`). An inbox the reader is not told about is not checked.
 *
 * A FUNCTION FIRST, and the page lint's rule later: the record holds Home's model line to it before it keeps
 * one (`headlineFault`), and the lint will hold every header to it, whoever wrote the header.
 */
export function headlineAgrees(header: string, w: WaitingNow): Disagrees[] {
  const out: Disagrees[] = [];
  for (const m of header.matchAll(NAMED)) {
    const wrote = countOf(m[1]!);
    const noun = m[2]!.toLowerCase();
    const names = noun.startsWith('question') ? 'questions' : noun.startsWith('arrival') ? 'inbox' : 'agents';
    const is = names === 'questions' ? w.questions : names === 'inbox' ? w.inbox : w.working;
    if (is !== null && Number.isFinite(wrote) && wrote !== is) out.push({ said: m[0], names, wrote, is });
  }
  if (w.inbox !== null)
    for (const m of header.matchAll(IN_INBOX)) {
      const wrote = countOf(m[1]!);
      if (Number.isFinite(wrote) && wrote !== w.inbox) out.push({ said: m[0], names: 'inbox', wrote, is: w.inbox });
    }
  const calm = NOTHING.exec(header);
  if (calm && !nothingWaits(w)) out.push({ said: calm[0], names: 'nothing', wrote: 0, is: w.questions + (w.inbox ?? 0) });
  return out;
}

/**
 * Home's figures as `waiting()` says them, read back off the reading Home's ask was handed (`homeReading`), or `null`
 * without them: the questions are what needs the person less what is late, and the inbox is nought when it is not named.
 */
const waitsHanded = (page: HeadlinePage): WaitingNow | null => {
  const said = (id: string): number | null => {
    const f = page.figures.find((x) => x.id === id);
    const n = f === undefined ? NaN : Number(f.value);
    return Number.isFinite(n) ? n : null;
  };
  const needs = said('needs-you');
  const working = said('working');
  if (needs === null || working === null) return null;
  return { questions: Math.max(0, needs - (said('late') ?? 0)), late: 0, hard: 0, inbox: said('inbox') ?? 0, working };
};
