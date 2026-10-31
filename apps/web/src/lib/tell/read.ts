/**
 * "Tell it one real thing": one sentence, said or pasted, read into the entries it would become, by rules on the
 * device. "Nadia wants 3 vanilla jars for Friday, paid 900 on InstaPay" on a shop record is Nadia as a new client, an
 * order from her for 3 vanilla jars due Friday, and 900 in, in the record's currency, marked paid: on the Ledger when the
 * record holds an account, and as a paid item in Bills and invoices, linked to her, on a fresh record that holds none.
 *
 * IT NEVER WRITES. The answer is a preview: `rows` in the `{ register, fields }` shape the record's `capture` takes,
 * each with the line a person reads, and `left`, the words it heard and could not place. Nothing is added until the
 * person presses, and then all of it goes under one batch, so one Undo takes it all back.
 *
 * ONLY LISTS THE RECORD HOLDS. `lists` is what this record has installed, and every target is found by its declared
 * shape (a money field and a way in or out is a ledger; a link to People, a count and a day is an order list; a list
 * that calls one of its entries an order or a task is that), never by a list id written here. The one id read is
 * People's, which `who.ts` already names for the first run. Nothing is special-cased for any one record.
 *
 * IT NEVER INVENTS A FACT. An amount with no currency typed takes the record's own; with neither, it is left. A
 * required field the sentence did not give (the account a payment came into, on a record with several) is named in
 * `missing` and filled by nobody. A person is linked to an existing entry only by a whole-name match.
 *
 * `shape.ts` and `who.ts` read the first-run sentence about a business and a self; neither exports an amount, day or
 * name reader for a free sentence, so the small ones here are this file's. The day sums are `work/board.ts`'s and the
 * money's minor units and drawing are the renderer's.
 *
 * A plain `.ts` so `node --test` can hold it; `TellOne.svelte` only calls it.
 */

import { exponentOf, money } from 'braindog-render';

import { homeCurrency } from '../record/api.ts';
import { symbolText } from '../record/money.ts';
import type { FieldDecl, MoneyValue } from '../record/schema.ts';
import { GREETINGS, PEOPLE, hear } from '../who.ts';
import { PAID_STATES } from './paid.ts';
import { addDays, daySaid, nextMonday, weekdayOf } from '../work/board.ts';

/** One list the record holds: its id, what a person calls it and one of it, the field that titles an entry, its fields. */
export type TellList = {
  id: string;
  name: string;
  one?: string;
  title: string;
  fields: readonly FieldDecl[];
  state?: string;
  /** The states an entry is finished in, as the list declares them (a payment is one made in a paid one). */
  done?: readonly string[];
  icon?: string;
  /** How many entries it holds, as the record counted them (`tellLists`), when known. */
  count?: number;
};

/** An entry already on the record, by the number you can say out loud and its name. */
export type Known = { seq: number; name: string };

export type TellOptions = {
  lists: readonly TellList[];
  /** The reader's day, `YYYY-MM-DD`. */
  today: string;
  /** The record's currency, for an amount typed with none. `null` when the record has none. */
  currency: string | null;
  /** The currency an amount is spelled against, as every other screen spells it (`homeCurrency()` when not said). */
  home?: string | null;
  /** The people on the record. */
  people?: readonly Known[];
  /** The accounts on the record, for the one a payment came into. */
  accounts?: readonly Known[];
  /** The list a plain line goes into, when the record says. Otherwise the list that calls one of its entries a task. */
  capture?: string;
};

/** A field's value: as the record takes it, or `{ $row: n }` for the entry at index `n` of the same call. */
export type TellValue = string | number | boolean | MoneyValue | { $row: number };

export type TellRow = {
  register: string;
  fields: Record<string, TellValue>;
  /** The line the preview shows: "An order from Nadia". */
  said: string;
  /** The line under it: "3 vanilla jars, due Friday". */
  detail: string;
  icon: string;
  /** Required fields the sentence did not give, as a person reads them. The record refuses the entry until they are. */
  missing: string[];
};

/**
 * What the sentence became: the entries, the words left over, and, when nothing could be placed, `why` in a person's
 * words and the `offers`, each the same words as one entry of a list it could go into, for the person to pick. A card
 * never draws over nothing: an empty answer still says so and offers the way on (first-hour audit AH1).
 */
export type Told = { rows: TellRow[]; left: string[]; why?: string; offers?: TellRow[] };

/** The most one sentence becomes. More is a paste of a whole day, and the rest is said back as left. */
export const MOST = 8;

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const words = (s: string): string => s.toLowerCase();
const labelOf = (f: FieldDecl): string => f.label ?? f.id.replace(/_/g, ' ');
const said = (f: FieldDecl, re: RegExp): boolean => re.test(f.id) || re.test(f.label ?? '');
const anA = (word: string): string => `${/^[aeiou]/i.test(word) ? 'An' : 'A'} ${word}`;

/* ── days ─────────────────────────────────────────────────────────────── */

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COUNTS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, dozen: 12, 'a dozen': 12, 'a couple of': 2, 'a couple': 2,
};

const WEEKDAY = Object.keys(WEEKDAYS).join('|');
const FULL_DAY = FULL_DAYS.join('|');
const IN_COUNT = Object.keys(COUNTS).filter((w) => !w.includes(' ')).join('|');
/* A MONTH BY ITS NAME OR ITS FIRST THREE LETTERS: "14 Nov", "Nov 14th", "5 November". */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
/* A weekday said bare only in full: "she sat down" is no Saturday. Its short form needs a word before it ("by fri"). */
const DAY = new RegExp(
  `\\b(?:(?:for|by|on|due|before|until)\\s+)?(today|tonight|tomorrow|tmrw|yesterday|this weekend|this week|next week|next (?:${WEEKDAY})|in (?:\\d{1,3}|${IN_COUNT}) (?:days?|weeks?)|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MONTH}|${MONTH} \\d{1,2}(?:st|nd|rd|th)?|the \\d{1,2}(?:st|nd|rd|th)|${FULL_DAY})\\b\\.?` +
    `|\\b(?:for|by|on|due|before|until)\\s+(${WEEKDAY})\\b\\.?`,
  'iu',
);

/** The month a word names, 1 to 12, or `undefined`. */
const monthOf = (word: string): number | undefined => {
  const at = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return at === -1 ? undefined : at + 1;
};

/** A month and day as the next date that falls on it, today included; `null` for a day the month does not have. */
function monthDay(month: number, day: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1]) {
    const at = new Date(Date.UTC(year, month - 1, day));
    if (at.getUTCMonth() !== month - 1) return null;
    const iso = at.toISOString().slice(0, 10);
    if (iso >= today) return iso;
  }
  return null;
}

/** "31/10/2026", "31/10/26", "31/10": the day first, as a bank prints it, unless that cannot be a date and the other way can. */
function slashed(text: string, today: string): string | null {
  const [a = 0, b = 0, c] = text.split('/').map(Number);
  const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
  if (month < 1 || month > 12 || day < 1) return null;
  if (c === undefined) return monthDay(month, day, today);
  const year = c < 100 ? 2000 + c : c;
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCMonth() === month - 1 ? at.toISOString().slice(0, 10) : null;
}

/** The next date falling on that day of the month, today included. */
function dayOfMonth(day: number, today: string): string | null {
  const [y = 1970, m = 1, d = 1] = today.split('-').map(Number);
  for (let step = 0; step < 13; step++) {
    const at = new Date(Date.UTC(y, m - 1 + step, day));
    if (at.getUTCDate() !== day || (step === 0 && day < d)) continue;
    return at.toISOString().slice(0, 10);
  }
  return null;
}

/** The day a phrase names, or `null`. */
function dayNamed(phrase: string, today: string): string | null {
  const p = words(phrase).replace(/\.$/, '');
  if (p === 'today' || p === 'tonight') return today;
  if (p === 'tomorrow' || p === 'tmrw') return addDays(today, 1);
  if (p === 'yesterday') return addDays(today, -1);
  if (p === 'next week') return nextMonday(today);
  if (p === 'this weekend') return addDays(today, (6 - weekdayOf(today) + 7) % 7);
  /* THIS WEEK IS BY ITS FRIDAY, the end of a working week, or today once Friday has gone. */
  if (p === 'this week') return weekdayOf(today) <= 5 && weekdayOf(today) !== 0 ? addDays(today, 5 - weekdayOf(today)) : today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(p)) return slashed(p, today);
  const dm = /^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)$/.exec(p) ?? null;
  const md = dm ? null : /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/.exec(p);
  if (dm && monthOf(dm[2]!) !== undefined) return monthDay(monthOf(dm[2]!)!, Number(dm[1]), today);
  if (md && monthOf(md[1]!) !== undefined && WEEKDAYS[md[1]!] === undefined) return monthDay(monthOf(md[1]!)!, Number(md[2]), today);
  const nth = /^the (\d{1,2})/.exec(p);
  if (nth) return dayOfMonth(Number(nth[1]), today);
  const next = /^next (\w+)$/.exec(p);
  if (next && WEEKDAYS[next[1]!] !== undefined) return addDays(today, ((WEEKDAYS[next[1]!]! - weekdayOf(today) + 7) % 7) || 7);
  const within = /^in (\w+) (day|week)s?$/.exec(p);
  if (within) {
    const n = /^\d+$/.test(within[1]!) ? Number(within[1]) : COUNTS[within[1]!];
    return n === undefined ? null : addDays(today, n * (within[2] === 'week' ? 7 : 1));
  }
  const w = WEEKDAYS[p];
  return w === undefined ? null : addDays(today, (w - weekdayOf(today) + 7) % 7);
}

/** A day as the preview says it: today, tomorrow, the weekday within the week, or the date. */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  for (let n = 2; n < 7; n++) if (day === addDays(today, n)) return FULL_DAYS[weekdayOf(day)]!;
  return daySaid(day);
}

/** The last date falling on that day of the month, today included. */
function dayOfMonthGone(day: number, today: string): string | null {
  const [y = 1970, m = 1, d = 1] = today.split('-').map(Number);
  for (let step = 0; step < 13; step++) {
    const at = new Date(Date.UTC(y, m - 1 - step, day));
    if (at.getUTCDate() !== day || (step === 0 && day > d)) continue;
    return at.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * The first day in a stretch of words, the words without it, and `gone`: the same words read for something already
 * done, so "paid on Monday" is the Monday gone and "on the 12th" the last 12th, never one to come.
 */
function takeDay(text: string, today: string): { day: string | null; rest: string; gone: string | null } {
  const m = DAY.exec(text);
  const phrase = words(m?.[1] ?? m?.[2] ?? '').replace(/\.$/, '');
  const day = m ? dayNamed(phrase, today) : null;
  if (!m || day === null) return { day: null, rest: text, gone: null };
  const nth = /^the (\d{1,2})/.exec(phrase);
  /* A month's day to come is last year's when it is read for something done: "charged on 14 Nov" in October is gone. */
  const named = /[a-z]{3}/.test(phrase) && /\d/.test(phrase) && !phrase.startsWith('in ');
  const gone = day <= today ? day : WEEKDAYS[phrase] !== undefined ? addDays(day, -7) : nth ? dayOfMonthGone(Number(nth[1]), today) : named ? `${Number(day.slice(0, 4)) - 1}${day.slice(4)}` : day;
  return { day, rest: oneLine(`${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`), gone };
}

/* ── amounts ──────────────────────────────────────────────────────────── */

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(\\s?k\\b)?';
/* A word that is a family of currencies: it takes the record's own when the record's is one of them, and is a question
   otherwise, because "900 pounds" on a dollar record is sterling or Egyptian and a guess would be written into money. */
const CODES = new Set(Intl.supportedValuesOf('currency'));
/** A currency's sign as the runtime writes it in English, `symbol` (`CA$`) or `narrowSymbol` (`$`). */
const signOf = (code: string, display: 'symbol' | 'narrowSymbol'): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: display }).formatToParts(1).find((p) => p.type === 'currency')?.value ?? code;
/* A BARE "$" IS A DOLLAR, and which one is the record's (ruling 438): every currency whose narrow sign is "$", read off
   the runtime, so no list of them is typed here. On a record kept in one of them it is that one; anywhere else it is
   unsure, and asked, never written as US dollars. */
const DOLLAR_HOMES = new Set([...CODES].filter((c) => signOf(c, 'narrowSymbol') === '$'));
const bareDollar = (record: string | null): string | null => (record !== null && DOLLAR_HOMES.has(record) ? record : null);
/* EVERY OTHER SIGN THAT IS ONE CURRENCY'S ALONE, off the runtime too: `£` is sterling's own sign, `E£` the Egyptian
   pound's narrow one. A sign two currencies share is no currency, and the spellings people type that the runtime does not
   write (`US$`, `C$`) are said here. */
const SYMBOLS: Record<string, string> = (() => {
  const by = new Map<string, Set<string>>();
  for (const display of ['symbol', 'narrowSymbol'] as const)
    for (const c of CODES) {
      const sign = signOf(c, display);
      if (sign === c || /^[A-Za-z]+$/u.test(sign) || sign === '$') continue;
      if (display === 'narrowSymbol' && by.has(sign) && !by.get(sign)!.has(c)) continue;
      by.set(sign, new Set([...(by.get(sign) ?? []), c]));
    }
  const one = Object.fromEntries([...by].flatMap(([sign, codes]) => (codes.size === 1 ? [[sign, [...codes][0]!]] : [])));
  return { ...one, US$: 'USD', C$: 'CAD', A$: 'AUD', NZ$: 'NZD' };
})();
/* L.E., the pound written on a shop's sign there, is the currency whose narrow sign is E£. */
const LIVRE = [...CODES].find((c) => signOf(c, 'narrowSymbol') === 'E£') ?? null;
/* A word that is one currency wherever it is said. */
const WORD_CODES: Record<string, string> = {
  euro: 'EUR',
  euros: 'EUR',
  sterling: 'GBP',
  quid: 'GBP',
  ...(LIVRE === null ? {} : { le: LIVRE, 'l.e.': LIVRE, 'l.e': LIVRE }),
};
/* EACH FAMILY IS READ OFF THE RUNTIME'S OWN NAMES (`Intl.DisplayNames`), every tender code whose English name ends in
   the word: the runtime says what currencies there are (02 §3 rule 1), so no list of codes is typed here. */
const CURRENCY_NAMES = new Intl.DisplayNames('en', { type: 'currency' });
const endingIn = (word: string): string[] => [...CODES].filter((c) => new RegExp(`\\b${word}$`, 'iu').test(CURRENCY_NAMES.of(c) ?? ''));
const FAMILIES: Record<string, readonly string[]> = {
  pound: endingIn('pound'),
  dollar: endingIn('dollar'),
  dirham: endingIn('dirham'),
  riyal: endingIn('ri(?:y)?al'),
  dinar: endingIn('dinar'),
  rupee: endingIn('rupee'),
};
const FAMILY_WORD = /^(pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?$/i;
const FAMILY_OF: Record<string, string> = { buck: 'dollar', rial: 'riyal' };
/* Lower-case codes read only where they are plainly money; `try`, `top`, `all` and `cup` are currencies and words. */
const SAFE_LOWER = new Set(['usd', 'eur', 'gbp', 'aed', 'sar', 'qar', 'kwd', 'jod', 'cad', 'aud', 'chf', 'inr']);

const AMOUNT = new RegExp(
  `(US\\$|A\\$|C\\$|NZ\\$|E£|£|€|\\$)\\s?${NUM}` +
    `|\\b([A-Za-z]{3})\\s?${NUM}` +
    `|${NUM}(?:\\s?(E£|£|€|\\$|l\\.e\\.?|le\\b|[A-Za-z]{3}\\b|euros?\\b|sterling\\b|quid\\b|(?:pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?\\b))?`,
  'giu',
);

type Amount = { at: number; text: string; digits: string; thousand: boolean; currency: string | null; word: string | null };

/** The code a word after or before a figure names, `null` for no currency word, or `undefined` for a word it is not. */
function codeOf(word: string, record: string | null): string | null | undefined {
  if (word === '$') return bareDollar(record);
  const w = word.toLowerCase();
  if (SYMBOLS[word]) return SYMBOLS[word]!;
  if (WORD_CODES[w]) return WORD_CODES[w]!;
  if (/^[A-Z]{3}$/.test(word) && CODES.has(word)) return word;
  if (SAFE_LOWER.has(w) || (record && w === record.toLowerCase())) return w.toUpperCase();
  const family = FAMILY_WORD.exec(w)?.[1];
  if (family) {
    const named = FAMILIES[FAMILY_OF[family] ?? family] ?? [];
    return record && named.includes(record) ? record : null;
  }
  return undefined;
}

/** Every figure in a stretch of words, with the currency typed beside it. A bare count before a word is still read. */
function amountsIn(text: string, record: string | null): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const at = m.index ?? 0;
    if (m[1]) {
      /* A CODE WRITTEN BESIDE A BARE "$" SAYS WHICH DOLLAR, or that it is no dollar: "$12 EGP" and "EGP $12" are EGP 12. */
      const written = m[1] === '$' ? (/^\s?([A-Za-z]{3})\b/u.exec(text.slice(at + m[0].length))?.[1] ?? /\b([A-Za-z]{3})\s?$/u.exec(text.slice(0, at))?.[1]) : undefined;
      const code = written !== undefined && CODES.has(written.toUpperCase()) ? written.toUpperCase() : null;
      out.push({ at, text: m[0], digits: m[2]!, thousand: Boolean(m[3]), currency: code ?? (m[1] === '$' ? bareDollar(record) : (SYMBOLS[m[1]] ?? null)), word: m[1] });
    }
    else if (m[4]) {
      const code = codeOf(m[4], record);
      /* "for 3 jars" is no currency called FOR: only a real code before a figure is one. */
      if (code) out.push({ at, text: m[0], digits: m[5]!, thousand: Boolean(m[6]), currency: code, word: m[4] });
      else {
        /* "PAID OUT 1,950 USD": the three letters before the figure were a word, and the code typed after it is still
           the currency (founder audit AH2, where the record's own was written in its place). */
        const digitsAt = m[0].search(/\d/);
        const after = /^\s?(E£|£|€|[A-Za-z]{3}\b|euros?\b|sterling\b|quid\b|(?:pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?\b)/u.exec(text.slice(at + m[0].length));
        const code = after ? codeOf(after[1]!, record) : undefined;
        if (after && code !== undefined)
          out.push({ at: at + digitsAt, text: m[0].slice(digitsAt) + after[0], digits: m[5]!, thousand: Boolean(m[6]), currency: code, word: after[1]! });
        else out.push({ at: at + digitsAt, text: m[0].slice(digitsAt), digits: m[5]!, thousand: Boolean(m[6]), currency: null, word: null });
      }
    } else {
      const word = m[9] ?? null;
      /* "12$ EGP": the code after the sign says which, as it does before a figure. */
      const after = word === '$' ? /^\s?([A-Za-z]{3})\b/u.exec(text.slice(at + m[0].length))?.[1]?.toUpperCase() : undefined;
      const code = after !== undefined && CODES.has(after) ? after : word ? codeOf(word, record) : null;
      const plain = code === undefined ? m[0].slice(0, m[0].length - (word?.length ?? 0)).trimEnd() : m[0];
      out.push({ at, text: plain, digits: m[7]!, thousand: Boolean(m[8]), currency: code ?? null, word: code === undefined ? null : word });
    }
  }
  return out;
}

/** Minor units, or `null` for more decimal places than the currency has. */
function minor(a: Amount, currency: string): number | null {
  const plain = a.digits.replace(/,/g, '');
  const exp = exponentOf(currency);
  if (!a.thousand && (plain.split('.')[1]?.length ?? 0) > exp) return null;
  const out = Math.round(Number(plain) * (a.thousand ? 1000 : 1) * 10 ** exp);
  return Number.isSafeInteger(out) && out > 0 ? out : null;
}

/* ── names ────────────────────────────────────────────────────────────── */

/* A capitalised word in any script, and up to three of them: `Nadia`, `Nadia Samir`, `O'Neill`. */
const CAP = "\\p{Lu}[\\p{L}\\p{M}'’-]*";
const NAME = `${CAP}(?:\\s+${CAP}){0,2}`;
/* Words that open a clause in capitals without being anybody. */
const NOT_A_NAME = new Set([
  'i', 'we', 'she', 'he', 'they', 'it', 'you', 'my', 'our', 'the', 'a', 'an', 'and', 'but', 'so', 'also', 'then', 'please',
  'can', 'could', 'would', 'will', ...GREETINGS, 'thanks', 'ok', 'okay', 'paid', 'got', 'received', 'sent', 'call',
  'order', 'today', 'tomorrow', 'tonight', 'next', 'this', 'just', 'new', 'one', 'two', 'three',
  ...Object.keys(WEEKDAYS), 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december',
]);
const aName = (name: string): boolean => !NOT_A_NAME.has(words(name.split(' ')[0] ?? ''));

/* "[09/10, 14:02] Nadia: can I get..." and "Nadia: ..." are a pasted message from Nadia. */
const FROM_MESSAGE = new RegExp(`^(?:\\[[^\\]]*\\]\\s*)?(${NAME})\\s*:\\s+`, 'u');
/* The name a clause opens on, before a word in lower case: "Nadia wants", "Nadia Samir paid". */
const SUBJECT = new RegExp(`^(${NAME})(?=\\s+\\p{Ll})`, 'u');
const FROM = new RegExp(`\\bfrom\\s+(${NAME})`, 'u');
const PRONOUN = /^(?:she|he|they)\b\s*/iu;
const SELF = /^(?:i|we)\b\s*/iu;

/** Who an entry on the record is, by a whole-name match or a match on the first name alone when only one shares it. */
function knownAs(name: string, people: readonly Known[]): Known | null {
  const n = words(name);
  const whole = people.find((p) => words(p.name) === n);
  if (whole) return whole;
  const first = people.filter((p) => words(p.name).split(' ')[0] === n);
  return first.length === 1 ? first[0]! : null;
}

/** A first name that more than one person on the record shares, and no one holds whole: which of them is a question. */
const sharedBy = (name: string, people: readonly Known[]): boolean =>
  !knownAs(name, people) && people.filter((p) => words(p.name).split(' ')[0] === words(name)).length > 1;

/* ── the lists ────────────────────────────────────────────────────────── */

const textField = (l: TellList): FieldDecl | undefined =>
  l.fields.find((f) => f.id === l.title && f.type === 'text') ?? l.fields.find((f) => f.type === 'text' && f.required);
const callsItself = (l: TellList, word: RegExp): boolean => word.test(l.one ?? '') || word.test(l.name);

/** The list an order goes into: one that calls an entry an order, with words to say what is ordered. */
const orderList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => callsItself(l, /\border/i) && textField(l) !== undefined);

/** The ledger: a list with a required amount and a way it moved, in or out. */
const moneyList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => l.fields.some((f) => f.type === 'money' && f.required) && l.fields.some((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out')));

/** Bills and invoices: a list with a required amount owed one way or the other, to the reader or by them. */
const dueList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => l.fields.some((f) => f.type === 'money' && f.required) && l.fields.some((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me')));

const peopleList = (lists: readonly TellList[]): TellList | undefined => lists.find((l) => l.id === PEOPLE);

/**
 * A LIST A PLAIN LINE CAN GO INTO WITH ITS WORDS ALONE: every field it needs but its title has a default, or is a state
 * it starts in (its first, as `startIn` fills it). A list that needs an amount, a day or a number is not one.
 */
const fillable = (l: TellList): boolean => {
  const title = textField(l);
  return title !== undefined && l.fields.every((f) => !f.required || f.retired || f.default !== undefined || f.id === title.id || (f.type === 'enum' && (f.values?.length ?? 0) > 0));
};

/** A required state with no default starts in its first, as the list declares them: a new project is Building. */
function startIn(l: TellList, fields: Record<string, TellValue>): void {
  for (const f of l.fields) if (f.required && !f.retired && f.default === undefined && f.type === 'enum' && fields[f.id] === undefined && f.values?.[0]) fields[f.id] = f.values[0];
}

/** Lists a plain line is never put in: People, orders, money and the record's own. */
const plainable = (l: TellList): boolean =>
  l.id !== PEOPLE && !callsItself(l, /\border/i) && !l.fields.some((f) => f.type === 'money' && f.required) && fillable(l);

/**
 * HOW MUCH A LIST LOOKS LIKE THINGS TO DO, BY ITS SHAPE and never its name, since a team calls its tasks Tickets and a
 * student Assignments: a day it is due by (two), somebody it is given to, a state it starts in. Zero is not one.
 */
const todoScore = (l: TellList): number => {
  if (!plainable(l)) return 0;
  const deadline = l.fields.some((f) => f.type === 'day' && f.deadline === true);
  const state = l.fields.find((f) => f.id === (l.state ?? 'state') && f.type === 'enum');
  return (deadline ? 2 : 0) + (l.fields.some((f) => f.type === 'ref' && f.to === PEOPLE) ? 1 : 0) + (state?.default !== undefined ? 1 : 0);
};

/**
 * Where a plain line goes: the list the record names for it, else the one that calls an entry a task, else the list
 * most shaped like things to do, so long as it has a day they are due by.
 */
const taskList = (lists: readonly TellList[], capture: string | undefined): TellList | undefined =>
  (capture ? lists.find((l) => l.id === capture) : undefined) ??
  lists.find((l) => callsItself(l, /^tasks?$|\bto-?dos?\b/i) && textField(l) !== undefined) ??
  [...lists].filter((l) => todoScore(l) >= 2 && l.fields.some((f) => f.type === 'day' && f.deadline === true)).sort((a, b) => todoScore(b) - todoScore(a))[0];

/** The lists a line that fits nowhere is offered to, at most two: those with a day or a state, most like things to do first. */
const offerLists = (lists: readonly TellList[]): TellList[] =>
  lists
    .filter((l) => plainable(l) && (l.fields.some((f) => f.type === 'day') || l.fields.some((f) => f.id === (l.state ?? 'state') && f.type === 'enum')))
    .sort((a, b) => todoScore(b) - todoScore(a))
    .slice(0, 2);

/** The list a new project goes into: one that calls an entry a project. */
const projectList = (lists: readonly TellList[]): TellList | undefined => lists.find((l) => callsItself(l, /^projects?$/i) && textField(l) !== undefined);

/** The list a figure somebody keeps an eye on goes into: one that calls an entry a number or a measure. */
const numberList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => callsItself(l, /^(?:numbers?|measures?)$/i) && textField(l) !== undefined && l.fields.some((f) => f.type === 'money' || f.type === 'decimal'));

/** The first field of a type, preferring one whose id or label says `re`. */
const pick = (l: TellList, type: FieldDecl['type'], re: RegExp, also: (f: FieldDecl) => boolean = () => true): FieldDecl | undefined =>
  l.fields.find((f) => f.type === type && also(f) && said(f, re)) ?? l.fields.find((f) => f.type === type && also(f));

/** Required fields with nothing in them and no default, as a person reads them: a day it falls due is "the day it is due". */
const missingOf = (l: TellList, fields: Record<string, TellValue>): string[] =>
  l.fields
    .filter((f) => f.required && fields[f.id] === undefined && f.default === undefined && !f.retired)
    .map((f) => (f.type === 'day' && (f.deadline === true || said(f, /due/)) ? 'the day it is due' : labelOf(f)));

/* THE LIST'S OWN GLYPH, as it declares one, and the plain rows glyph for a list that declares none: the glyph is the
   record's to say, and a word here would be a list id this screen knows (`web-lists`). */
const iconOf = (l: TellList): string => l.icon ?? 'rows';

/* ── the reading ──────────────────────────────────────────────────────── */

/* Commas and full stops that end a clause, never inside a figure ("1,200.50"; "paid 900, Omar wants" still parts); and
   "and" before a new act: "wants 3 jars and paid 900". */
const CLAUSE = /[,.](?!\d)|[;!?\n]|\s+(?:and|&)\s+(?=(?:she|he|they|i|we)?\s*(?:paid|pays|sent|transferred|received|got|wants?|ordered|needs?)\b)/iu;
const INTRODUCED = /^(?:(?:hi|hello|hey)\b[\s,.!]*)?(?:i['’]?m|i am|my name is|this is)\s/iu;
const ORDER = /^(?:wants?|would like|ordered|orders|needs?|asked for|is getting|booked|reserved|(?:can|could) (?:i|we) (?:get|have)|i['’]?d like|i would like|i want|i['’]?ll take)\s+(?:to (?:order|get|buy|have)\s+)?/iu;
const PAID = /^(?:paid|pays|sent|transferred)\b\s*/iu;
const GOT = /^(?:received|got)\b\s*/iu;
const SPENT = /^(?:i|we)\s+(?:paid|spent|sent|transferred)\b\s*|^spent\b\s*/iu;
const QTY = /^(\d{1,4}|a dozen|a couple of|a couple|dozen|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|an?)\s+/iu;
/* A COUNT OF THINGS FOR SOMEBODY NAMED IS AN ORDER FROM THEM: "14 mugs for Lina", "two vases for Omar
   Said". Only a count said in figures or words, never "a" alone, and only before a name, so "14 mugs for Friday" and
   "glaze 14 mugs for the market" are nobody's order. */
const SAID_COUNT = ['a dozen', 'dozen', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'].map((w) => `[${w[0]}${w[0]!.toUpperCase()}]${w.slice(1)}`).join('|');
/* Case kept, since the name is told by its capital: "for Lina and Omar" is never one person called "Lina And Omar". */
const FOR_SOMEBODY = new RegExp(`(?:^|[\\s:])((?:\\d{1,4}|${SAID_COUNT})\\s+[^,.;:!?]+?)\\s+for\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');
const METHOD = new RegExp(`\\b(?:on|by|via|through|with|over|using)\\s+(${NAME}|cash|card|bank transfer|transfer|wallet)\\b`, 'u');
/* The act a payment opens on, taken off before what is left says what it was for. */
const ACT = /^(?:(?:i|we)\s+)?(?:paid|pays|spent|sent|transferred|received|got)\b\s*/iu;

/* A greeting or a thanks on its own, as a pasted message opens and closes. */
const PLEASANTRY = /^(?:hi|hello|hey|thanks|thank you|thx|please|ok|okay|cheers)(?:\s+\p{L}+)?$/iu;
const acts = (s: string): boolean => ORDER.test(s) || PAID.test(s) || GOT.test(s);
/* The words around an order's total that say nothing more of it: "total", "not paid yet", "owed". */
const TOTAL_WORDS = /\b(?:the\s+total(?:\s+is)?|total(?:\s+is)?|in\s+all|not\s+paid(?:\s+yet)?|unpaid|still\s+owed|owed|to\s+pay|due)\b/giu;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const trimWords = (s: string): string => oneLine(s).replace(/^(?:of|the|some)\s+/iu, '').replace(/[\s,.;:!?]+$/u, '').replace(/\s+(?:please|pls|thanks|thank you)$/iu, '');

/* ── the shapes a first sentence takes, past an order and a payment (first-hour audit AH1, AH2, AH24) ── */

/* AN ADDRESS IS ONE THING, never two clauses at its dot: "salma@example.com" was "salma@example" and "com". */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
/* "Met Lina from Acme", "Met my tutor Dr Hana Saleh", "Spoke to Omar": somebody met is a person, by name. */
/* NO CASE-BLIND FLAG ON ANY OF THESE: a name is told by its capital, and `/iu` lets a capital match any letter. */
const MET = new RegExp(
  `^(?:(?:I|i|We|we)\\s+)?(?:[Mm]et|[Mm]eeting|[Ss]poke (?:to|with)|[Tt]alked to)\\s+(?:with\\s+)?(?:(?:my|our|a|the)\\s+((?:\\p{Ll}+\\s+){0,2}?\\p{Ll}+)\\s+)?(?:(?:Dr|Mr|Mrs|Ms|Miss|Prof)\\s+)?(${NAME})(?:\\s+from\\s+(${NAME}))?(.*)$`,
  'u',
);
/* "Priya joined the team", "Sara is our new designer". */
const JOINED = new RegExp(`^(${NAME})\\s+(?:joined|has joined|is (?:our|my|the) new\\s+(\\p{Ll}+))\\b(.*)$`, 'u');
/* "Mum's birthday is 14 Nov". */
const BIRTHDAY = new RegExp(`^(${NAME})['’]s\\s+[Bb]irthday(?:\\s+is|\\s+on|\\s*:)?\\s+(.+)$`, 'u');
/* "New project: Tallow, a habit tracker app", "New client project: Delta rebrand", "Group project: market research". */
const PROJECT = /^(?:(?:a|my|our)\s+)?(?:new\s+)?(?:(\p{L}+)\s+)?project\s*[:–-]\s*(.+)$/iu;
/* "MRR is 4,200 USD this month": a figure kept an eye on, said with what it is. */
const MEASURE = /^(MRR|ARR|revenue|sales|sign-?ups|users|active users|subscribers|customers|churn|burn|runway|NPS|GMV|DAU|WAU|MAU)\s+(?:is|was|are|were|hit|reached|at|of|=|:)\s+(.+)$/iu;
const SPAN = /\b(?:this|last) (?:month|week|year|quarter)\b|\btoday\b|\bso far\b/giu;
/* A bill to pay or an invoice to send: "Pay rent 12000 on the 1st", "Electricity bill 850", "Invoice Acme 1,200 USD". */
const PAY = /^(?:(?:i|we)\s+(?:need to|have to|must)\s+)?(?:pay|paying)\s+(?:the\s+|my\s+|our\s+)?/iu;
const INVOICE = new RegExp(`^(?:[Ii]nvoice|[Bb]ill|[Cc]harge)\\s+(${NAME})(?=\\s|$)\\s*`, 'u');
const BILL_WORD = /\b(?:bill|subscription|membership|rent|fees?|insurance|loan|tuition|invoice|instal(?:l)?ment|premium)\b/iu;
const EVERY = /\b(?:a|per|each|every)\s+(month|year|quarter|week)\b|\b(monthly|yearly|annually|quarterly|weekly)\b/iu;
const EVERY_SAID: Record<string, string> = { monthly: 'month', yearly: 'year', quarterly: 'quarter', weekly: 'week' };
const REPEATS: Record<string, string> = { month: 'monthly', monthly: 'monthly', year: 'yearly', yearly: 'yearly', annually: 'yearly', quarter: 'quarterly', quarterly: 'quarterly', week: 'weekly', weekly: 'weekly' };
/* A payout is money in from a platform, never a person or a client: "Stripe paid out 1,950 USD". */
const PAYOUT = /^(?:paid out|pays out|paying out|payout(?:\s+of)?)\b\s*/iu;
/* MONEY LENT OR BORROWED BETWEEN TWO PEOPLE IS OWED, never a payment and never "Not sure" (first-hour audit, FB3):
   "Lent Omar 500 yesterday", "Omar owes me 500", "Borrowed 300 from Sara", "Sara lent me 300", "I owe Sara 300". Case
   kept on the name, as everywhere: it is told by its capital. Each is [who, the rest] and whose the money is. */
const LOANS: readonly { re: RegExp; toMe: boolean; who: number; rest: number }[] = [
  { re: new RegExp(`^(?:(?:I|i|We|we)\\s+)?(?:[Ll]ent|[Ll]oaned|[Gg]ave)\\s+(${NAME})\\s+(.*?\\d.*?)(?:\\s+(?:as a loan|on loan))?$`, 'u'), toMe: true, who: 1, rest: 2 },
  { re: new RegExp(`^(${NAME})\\s+(?:owes|still owes)\\s+(?:me|us)\\s+(.+)$`, 'u'), toMe: true, who: 1, rest: 2 },
  { re: new RegExp(`^(${NAME})\\s+(?:borrowed)\\s+(.+)$`, 'u'), toMe: true, who: 1, rest: 2 },
  { re: new RegExp(`^(?:(?:I|i|We|we)\\s+)?(?:[Bb]orrowed)\\s+(.+?)\\s+from\\s+(${NAME})(?![\\p{L}\\p{M}'’-])(.*)$`, 'u'), toMe: false, who: 2, rest: 1 },
  { re: new RegExp(`^(${NAME})\\s+(?:lent|loaned)\\s+(?:me|us)\\s+(.+)$`, 'u'), toMe: false, who: 1, rest: 2 },
  { re: new RegExp(`^(?:I|i|We|we)\\s+owe\\s+(${NAME})\\s+(.+)$`, 'u'), toMe: false, who: 1, rest: 2 },
];
/* A clause that says only when a loan comes back, once its day is taken off: "pay back by", "she'll pay me back on". */
const BACK_SAID = /^(?:(?:(?:she|he|they)(?:['’]ll| will)\s+)?(?:pay(?:s|ing)?|give(?:s)?|get)\s+(?:(?:me|us|it|you|her|him|them)\s+)?)?back(?:\s+(?:due|by|on|before))?$|^due back(?:\s+(?:by|on))?$/iu;
/* The words around a loan's amount that say nothing more of it. */
const LOAN_WORDS = /\b(?:back|as a loan|on loan|to pay back|to be paid back|pay(?:s|ing)? (?:me |us |it )?back)\b/giu;

/* "assign to Omar", "assigned to Omar". */
const ASSIGN = new RegExp(`(?:^|[\\s,;])(?:[Aa]ssign(?:ed)?|[Gg]ive it)\\s+(?:it\\s+)?to\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');
/* A BANK'S OWN TEXT, as a card alert or an account alert prints it: one of these words, and a currency it names. */
const BANKISH = /\b(?:debited|credited|charged|purchase|withdrawn|withdrawal|deposited|avl\.? ?bal|available balance|card ending|card no|a\/c|acct)\b/iu;
/* The words only a bank prints. With none of them, a sentence that says "purchase" is read as a sentence. */
const BANK_ONLY = /\b(?:debited|credited|avl\.? ?bal|available balance|card ending|card no|a\/c|acct)\b/iu;
const BANK_IN = /\b(?:credited|deposited|received|refund(?:ed)?|incoming)\b/iu;
const BANK_OUT = /\b(?:debited|charged|purchase|withdrawn|withdrawal|spent)\b/iu;
const BALANCE_BEFORE = /\b(?:bal(?:ance)?|limit)\b[\s:.]*$/iu;
const PAYEE = /\b(?:at|to|from)\s+(.+?)(?=\s+on\s|\s+using\s|\s+with\s|\s+via\s|\s+ref\b|\.\s|\.$|,|;|$)/iu;

/** "CARREFOUR MAADI" as a person writes it: "Carrefour Maadi". Mixed case is kept as typed. */
const titled = (s: string): string => (/\p{Ll}/u.test(s) ? s : s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()));

/** "A, B or C". */
const orOf = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/* The plain words a card says when nothing fits, each its own. */
const WHY = {
  notSure: 'Not sure where this goes.',
  reads: (kinds: readonly string[]) => (kinds.length === 0 ? '' : ` It reads ${orOf(kinds)}.`),
  noMoney: 'This BrainDog keeps no money yet, so the amount has nowhere to go.',
  whichCurrency: 'Which currency is that in? Write its code beside the figure, like 300 USD or 300 EGP.',
  bankNoCurrency: 'That text names no currency, so nothing is kept from it. Paste it as the bank sent it.',
  known: (name: string, list: string) => `${name} is already in ${list}.`,
  offer: 'Or keep it as one of these:',
};

/** One sentence, read into the entries it would become. Writes nothing. */
export function tellRead(sentence: string, opts: TellOptions): Told {
  const rows: TellRow[] = [];
  const left: string[] = [];
  let text = oneLine(sentence);
  if (!text) return { rows, left };

  /* THE ADDRESSES COME OUT FIRST and are put to the person they name, so no dot inside one parts a clause. */
  const emails: string[] = [];
  text = oneLine(text.replace(EMAIL, (m) => (emails.push(m), ' ')))
    .replace(/\s+([,.;])/gu, '$1')
    .replace(/([,;])(?:\s*[,;])+/gu, '$1')
    .replace(/^[\s,;]+|[\s,;]+$/gu, '')
    /* "Dr. Hana" is never a clause that ends at "Dr". */
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|St)\./gu, '$1');

  /* A self-introduction names the reader, who is never a new person: "I'm Mariam, Nadia wants..." reads from Nadia. */
  if (INTRODUCED.test(text)) text = hear(text).bio || text;
  const people = peopleList(opts.lists);
  /* AN AMOUNT IS SPELLED AS `Money` SPELLS IT, by the one writer against the record's home currency: "$1,350.00" on a
     dollar record, never the stored "USD 1,350.00" this said before, which no other screen shows. */
  const home = opts.home === undefined ? homeCurrency() : opts.home;
  const spelled = (amount: number, currency: string): string => symbolText(money(amount, currency), home, 'exact');
  const room = (n: number): boolean => rows.length + n <= MOST;

  /* Who each name is: an entry already kept, or a new one made the first time they are named. */
  const made = new Map<string, number>();
  /* What is said of somebody beside their name ("from Acme", "interested in a pilot"), kept as their note. */
  const notes = new Map<number, string[]>();
  /* Whether anything but a person named for their address was placed: with nothing, the words are one task. */
  let placed = false;
  /* Money said where this record keeps none, said back plainly rather than turned into a task. */
  let noMoney = false;
  /* Somebody met who is already on the record. */
  let known: string | null = null;
  /* The bank's own text named no currency: never kept in the record's. */
  let bankBare = false;
  /* An amount said with no currency to put to it, on a record with none or a word that is several. */
  let noCurrency = false;
  /* Who placed an order in this sentence, so only they are clients: a payer alone is a payer (AH2). */
  const ordered = new Set<string>();
  let subject: string | null = null;
  let lastOrder: TellRow | null = null;
  /* Who placed it, as its link holds them, so a payment from someone else is never put to it. */
  let lastOrderBy: TellValue | null = null;
  /* An amount heard with no currency to put to it: said back as left, never turned into a task. */
  let unsure = false;
  /* A loan was read, so a clause after it that says only when it comes back is its. */
  let loaned = false;
  /* The person the sentence met, whose note what is said after them goes into. */
  let metRow: number | null = null;

  const personOf = (name: string): TellValue | null => {
    const known = knownAs(name, opts.people ?? []);
    if (known) return `${PEOPLE}#${known.seq}`;
    /* Two Nadias on the record and a bare "Nadia" said: neither is guessed, and no third is made. */
    if (sharedBy(name, opts.people ?? [])) {
      if (!left.includes(`which ${name}`)) left.push(`which ${name}`);
      return null;
    }
    const at = made.get(words(name));
    if (at !== undefined) return { $row: at };
    if (!people || !room(1)) return null;
    made.set(words(name), rows.length);
    rows.push({ register: people.id, fields: { [people.title]: name }, said: name, detail: `new in ${people.name}`, icon: iconOf(people), missing: [] });
    return { $row: rows.length - 1 };
  };
  /* Somebody who orders is a client, where People says what a person is to you. */
  const client = (ref: TellValue | null, name: string): void => {
    if (!people || ref === null || typeof ref !== 'object' || !('$row' in ref)) return;
    const role = people.fields.find((f) => f.type === 'enum' && f.values?.includes('client'));
    const row = rows[ref.$row];
    if (!role || !row || row.fields[role.id] !== undefined) return;
    row.fields[role.id] = 'client';
    row.said = `${name}, a client`;
  };

  /* A BANK'S TEXT IS READ WHOLE, before it is cut into clauses: its full stops end its own sentences, not acts. */
  if (BANKISH.test(text) && bankText(text)) return finish();

  /* A NEW PROJECT IS READ WHOLE TOO: what comes after its name says what it is. */
  if (project(text)) return finish();

  const message = FROM_MESSAGE.exec(text);
  if (message && aName(message[1]!)) subject = message[1]!;
  if (message && subject) text = text.slice(message[0].length);

  for (const piece of text.split(CLAUSE)) {
    const whole = oneLine(piece ?? '');
    if (!whole || PLEASANTRY.test(whole)) continue;
    let c = whole;
    const self = SPENT.test(c);
    if (!self && contact(c)) continue;
    /* A name or "she" opens a clause only before an act, so "Buy more wax" is nobody called Buy. */
    let someone = false;
    const opener = SUBJECT.exec(c);
    const after = opener ? c.slice(opener[0].length).trim() : '';
    if (opener && aName(opener[1]!) && (acts(after) || PAYOUT.test(after))) {
      subject = opener[1]!;
      c = after;
    } else if (PRONOUN.test(c) && acts(c.replace(PRONOUN, ''))) {
      c = c.replace(PRONOUN, '');
      /* "SHE" AFTER AN ORDER IS WHOEVER PLACED IT, where nobody else was named since: "14 mugs for Lina,
         she paid 1200" is Lina paying. Somebody nobody named stays somebody. */
      if (subject === null || lastOrder === null) someone = true;
    }
    /* WHAT AN ORDER COMES TO, said beside it with no payment (uc6-walk-50): "Salma wants 6 amber jars for Saturday,
       1,350 not paid yet", "..., EGP 1,350", "..., total 1,350". It is the order's total, in the record's currency
       when none is written, so the Orders page can say who still owes. A clause with anything else in it is not this. */
    if (!self && !acts(c) && totalOf(c)) continue;
    /* A PAYOUT names who paid it, and makes nobody (AH2: Stripe was "a client, new in People"). */
    if (PAYOUT.test(c)) {
      if (payout(c.replace(PAYOUT, ''), subject)) continue;
      left.push(whole);
      continue;
    }
    if (!self && !acts(c) && (measure(c) || loan(c) || bill(c))) continue;
    /* A DAY SAID ON ITS OWN after what it is the day of was read with it: "Invoice Acme 1,200 USD, due in 14 days". */
    if (placed && takeDay(c, opts.today).day !== null && trimWords(takeDay(c, opts.today).rest.replace(/^(?:due|by|on)$/iu, '')) === '') continue;
    /* AND THE DAY A LOAN COMES BACK, said after it: "Borrowed 300 from Sara, pay back by Friday". */
    if (loaned && takeDay(c, opts.today).day !== null && BACK_SAID.test(trimWords(takeDay(c, opts.today).rest))) continue;
    const forSomebody = !self && !acts(c) ? FOR_SOMEBODY.exec(c) : null;
    if (forSomebody && aName(forSomebody[2]!)) {
      const before = rows.length;
      subject = forSomebody[2]!;
      if (room(2)) personOf(subject);
      /* The day may sit outside the order's words, as a label before it: "Firing on Thursday: 14 mugs for Lina". */
      const around = oneLine(`${c.slice(0, forSomebody.index)} ${c.slice(forSomebody.index + forSomebody[0].length)}`);
      if (readOrder(forSomebody[1]!.trim(), subject, around)) continue;
      rows.length = before;
      for (const [name, at] of made) if (at >= before) made.delete(name);
    }
    if (!self && !acts(c)) {
      /* WHAT IS SAID OF SOMEBODY JUST MET is theirs: "Met Lina from Acme, interested in a pilot". */
      if (metRow !== null && amountsIn(c, opts.currency).length === 0) notes.set(metRow, [...(notes.get(metRow) ?? []), capital(trimWords(c))]);
      else left.push(whole);
      continue;
    }
    const from = FROM.exec(c);
    if (from && aName(from[1]!)) subject = from[1]!;
    const order = ORDER.exec(c);
    if (order && !self && subject) ordered.add(words(subject));
    /* Made as soon as named, with room kept for what they did, so a full preview never ends on a person alone. */
    const before = rows.length;
    if (subject && !self && room(2)) personOf(subject);

    const done = order && !self ? readOrder(c.slice(order[0].length), subject) : readMoney(c, self ? null : subject, someone && !subject);
    if (!done) {
      /* A clause that placed nothing leaves no one behind: "Nadia paid 0" is no new Nadia. */
      rows.length = before;
      for (const [name, at] of made) if (at >= before) made.delete(name);
      left.push(whole);
    } else placed = true;
  }

  return finish(unsure);

  /** The person's address and notes put on, and with nothing placed, one task, or the plain word and the way on. */
  function finish(unsureOf = false): Told {
    for (const email of emails) addressOf(email);
    for (const [at, said] of notes) {
      const row = rows[at];
      const note = people ? pick(people, 'text', /note/, (f) => f.id !== people.title) : undefined;
      if (row && note && said.length > 0) row.fields[note.id] = said.join('. ');
    }
    if (bankBare) return { rows, left, why: WHY.bankNoCurrency };
    if (noMoney && !placed) return { rows, left: [], why: WHY.noMoney };
    if (noCurrency && !placed) return { rows, left, why: WHY.whichCurrency };
    if (known !== null && !placed && rows.length === 0) return { rows, left: [], why: WHY.known(known, people?.name ?? 'People') };
    if (placed || unsureOf || noMoney) return { rows, left };

    /* WITH NOTHING THAT FITS, ONE TASK WITH THE WORDS AS ITS TITLE, due on the day they name, given to whoever it is
       assigned to, and short: the sentence's first clause when the whole is long. */
    const plain = plainRow(taskList(opts.lists, opts.capture));
    if (plain) {
      rows.push(plain);
      return { rows, left: [] };
    }
    const offers = offerLists(opts.lists).flatMap((l) => {
      const row = plainRow(l, false);
      return row ? [row] : [];
    });
    const order = orderList(opts.lists);
    const kinds = [
      ...(order ? [anA(order.one ?? 'order').toLowerCase()] : []),
      ...(people ? ['somebody you met'] : []),
      ...(dueList(opts.lists) ? ['a bill with its amount and day', 'money lent or borrowed'] : []),
      ...(moneyList(opts.lists) || dueList(opts.lists) ? ['money paid or got', "a bank's text"] : []),
      ...(projectList(opts.lists) ? ['a new project'] : []),
    ];
    return { rows, left: [], why: `${WHY.notSure}${WHY.reads(kinds)}${offers.length > 0 ? ` ${WHY.offer}` : ''}`, ...(offers.length > 0 ? { offers } : {}) };
  }

  /** The whole sentence as one entry of a plain list: its words, the day it names, who it is given to. */
  function plainRow(l: TellList | undefined, withPeople = true): TellRow | null {
    if (!l) return null;
    const what = textField(l);
    if (!what) return null;
    let rest = text;
    const assigned = ASSIGN.exec(rest);
    const owner = withPeople && assigned && aName(assigned[1]!) ? pick(l, 'ref', /owner|assign|who|person/, (f) => f.to === PEOPLE) : undefined;
    if (owner && assigned) rest = oneLine(`${rest.slice(0, assigned.index)} ${rest.slice(assigned.index + assigned[0].length)}`);
    const { day, rest: undated } = takeDay(rest, opts.today);
    const due = day ? pick(l, 'day', /due|^by$|deadline|aim|target/, (f) => f.deadline === true || said(f, /due|^by$/)) : undefined;
    let title = trimWords((due ? undated : rest).replace(/\s*[,;]\s*(?=[,;]|$)/gu, '')).replace(/\s+(?:due|by|on)$/iu, '');
    if (title.length > 80) title = trimWords(title.split(CLAUSE)[0] ?? title);
    const fields: Record<string, TellValue> = { [what.id]: capital(title || text) };
    if (due && day) fields[due.id] = day;
    startIn(l, fields);
    let who: string | null = null;
    if (owner && assigned) {
      const ref = personOf(assigned[1]!);
      if (ref !== null) {
        fields[owner.id] = ref;
        who = assigned[1]!;
      }
    }
    const bits = [`new in ${l.name}`, ...(due && day ? [`due ${dayWord(day, opts.today)}`] : []), ...(who ? [`for ${who}`] : [])];
    return { register: l.id, fields, said: String(fields[what.id]), detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) };
  }

  /** An address said in the sentence, on the person it names: their name in its first half, or the one person met. */
  function addressOf(email: string): void {
    const field = people ? pick(people, 'email', /email/) : undefined;
    const local = words(email.split('@')[0] ?? '');
    const theirs = (name: string): boolean => {
      const first = words(name.split(' ')[0] ?? '');
      return first.length >= 3 && (local.includes(first) || first.includes(local));
    };
    let at = rows.findIndex((r) => r.register === people?.id && theirs(String(r.fields[people.title] ?? '')));
    if (at === -1) {
      const met = rows.flatMap((r, i) => (r.register === people?.id ? [i] : []));
      if (met.length === 1) at = met[0]!;
    }
    /* "Ask Karim to be my first guest, karim@example.com": the capitalised word the address is named for is them. */
    if (at === -1 && field) {
      const named = [...text.matchAll(new RegExp(CAP, 'gu'))].map((m) => m[0]).find((w) => aName(w) && theirs(w));
      const ref = named ? personOf(named) : null;
      if (ref !== null && typeof ref === 'object' && '$row' in ref) at = ref.$row;
    }
    const row = rows[at];
    if (!row || !field) {
      left.push(email);
      return;
    }
    row.fields[field.id] = email;
    row.detail = `${row.detail}, ${email}`;
  }

  /** "Met Lina from Acme", "Priya joined the team", "Mum's birthday is 14 Nov": a person, by name. */
  function contact(c: string): boolean {
    if (!people) return false;
    const met = MET.exec(c);
    const joined = met ? null : JOINED.exec(c);
    const born = met || joined ? null : BIRTHDAY.exec(c);
    const name = met?.[2] ?? joined?.[1] ?? born?.[1];
    if (!name || !aName(name)) return false;
    if (knownAs(name, opts.people ?? [])) {
      known = name;
      subject = name;
      return true;
    }
    if (!room(1)) return false;
    const ref = personOf(name);
    if (ref === null || typeof ref !== 'object' || !('$row' in ref)) return ref !== null;
    subject = name;
    placed = true;
    metRow = ref.$row;
    const said: string[] = [];
    const role = met?.[1] ?? joined?.[2];
    if (role) said.push(`Your ${role}`);
    if (met?.[3]) said.push(`From ${met[3]}`);
    if (born) said.push(`Birthday ${trimWords(born[2]!)}`);
    const rest = trimWords(oneLine(takeDay(met?.[4] ?? joined?.[3] ?? '', opts.today).rest).replace(/^(?:the\s+)?team\b/iu, ''));
    if (rest) said.push(capital(rest));
    if (said.length > 0) notes.set(ref.$row, said);
    return true;
  }

  /** "New project: Tallow, a habit tracker app": a project, named, with what it is. */
  function project(whole: string): boolean {
    const m = PROJECT.exec(whole);
    const l = projectList(opts.lists);
    if (!m || !l || !room(1)) return false;
    const [name = '', ...about] = m[2]!.split(/,\s*|\.\s+|\s+[–-]\s+/u);
    const title = capital(trimWords(name));
    if (!title) return false;
    const fields: Record<string, TellValue> = { [textField(l)!.id]: title };
    const what = l.fields.find((f) => f.type === 'text' && f.id !== textField(l)!.id && said(f, /about|what|summary|description/));
    const aboutSaid = capital(trimWords(about.join(', ')));
    if (what && aboutSaid) fields[what.id] = aboutSaid;
    const kind = l.fields.find((f) => f.type === 'enum' && /kind|type/i.test(`${f.id} ${f.label ?? ''}`));
    if (kind && m[1] && kind.values?.includes(m[1].toLowerCase())) fields[kind.id] = m[1].toLowerCase();
    startIn(l, fields);
    rows.push({ register: l.id, fields, said: title, detail: [aboutSaid, `new in ${l.name}`].filter(Boolean).join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** "MRR is 4,200 USD this month": a figure, kept among the numbers. */
  function measure(c: string): boolean {
    const m = MEASURE.exec(c);
    const l = numberList(opts.lists);
    if (!m || !l || !room(1)) return false;
    const [a, ...more] = amountsIn(m[2]!.replace(SPAN, ' '), opts.currency);
    if (!a || more.length > 0) return false;
    const fields: Record<string, TellValue> = { [textField(l)!.id]: /^[a-z]/u.test(m[1]!) ? capital(m[1]!) : m[1]! };
    let shown: string;
    const sum = l.fields.find((f) => f.type === 'money');
    const currency = a.currency;
    const amount = currency ? minor(a, currency) : null;
    if (sum && currency && amount !== null) {
      fields[sum.id] = { amount, currency };
      shown = spelled(amount, currency);
    } else {
      const value = l.fields.find((f) => f.type === 'decimal');
      const n = Number(a.digits.replace(/,/g, '')) * (a.thousand ? 1000 : 1);
      if (!value || !Number.isFinite(n) || (a.word !== null && currency === null)) return false;
      fields[value.id] = n;
      shown = n.toLocaleString('en-GB');
    }
    const source = l.fields.find((f) => f.type === 'enum' && f.values?.includes('typed'));
    if (source) fields[source.id] = 'typed';
    rows.push({ register: l.id, fields, said: `${fields[textField(l)!.id]}, ${shown}`, detail: `new in ${l.name}`, icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** "Pay rent 12000 on the 1st", "Invoice Acme 1,200 USD for the logo work, due in 14 days": a bill or an invoice. */
  function bill(c: string): boolean {
    const invoice = INVOICE.exec(c);
    const pay = PAY.exec(c);
    if (!invoice && !pay && !BILL_WORD.test(c)) return false;
    const own = takeDay(c, opts.today);
    const [a] = amountsIn(own.rest, opts.currency);
    if (!a) return false;
    const l = dueList(opts.lists);
    if (!l) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= currency === null;
      left.push(c);
      return true;
    }
    if (!room(invoice ? 2 : 1)) return false;
    /* The day it is due may be its own clause: "Invoice Acme 1,200 USD, due in 14 days". */
    const at = text.indexOf(c);
    const next = at === -1 ? '' : (text.slice(at + c.length).split(CLAUSE).find((p) => oneLine(p ?? '') !== '') ?? '');
    const day = own.day ?? takeDay(next, opts.today).day;
    const toMe = invoice !== null || /\bowes? (?:me|us)\b/iu.test(c);
    const every = EVERY.exec(own.rest);
    let rest = oneLine(`${own.rest.slice(0, a.at)} ${own.rest.slice(a.at + a.text.length)}`);
    if (invoice) rest = rest.replace(INVOICE, '');
    else if (pay) rest = rest.replace(PAY, '');
    if (every) rest = rest.replace(every[0], ' ');
    const plain = trimWords(rest.replace(/^(?:for|to)\s+(?:the\s+)?/iu, '').replace(/\s+(?:due|on|by|is)$/iu, ''));
    const who = invoice?.[1] ?? null;
    const what = capital(plain) || (who ? `Invoice to ${who}` : 'A bill');
    const fields: Record<string, TellValue> = {};
    const title = textField(l);
    if (title) fields[title.id] = what;
    const sum = pick(l, 'money', /^amount$/, (f) => f.required === true);
    if (sum) fields[sum.id] = { amount, currency };
    const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me'));
    if (way) fields[way.id] = toMe ? 'owed_to_me' : 'owed_by_me';
    const due = pick(l, 'day', /due/, (f) => f.deadline === true || said(f, /due/));
    if (due && day) fields[due.id] = day;
    const stateField = l.fields.find((f) => f.id === (l.state ?? 'state') && f.type === 'enum');
    if (stateField && stateField.default === undefined && stateField.values?.includes('open')) fields[stateField.id] = 'open';
    const repeats = every ? REPEATS[words(every[1] ?? every[2] ?? '')] : undefined;
    const repeat = repeats ? l.fields.find((f) => f.type === 'enum' && f.values?.includes(repeats) && f.values.includes('none')) : undefined;
    if (repeat && repeats) fields[repeat.id] = repeats;
    if (who) {
      const party = pick(l, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
      const ref = personOf(who);
      if (party && ref !== null) fields[party.id] = ref;
      client(ref, who);
    }
    const bits = [`${spelled(amount, currency)} ${toMe ? (who ? `owed to you by ${who}` : 'owed to you') : 'to pay'}`, ...(day ? [`due ${dayWord(day, opts.today)}`] : []), ...(repeat && repeats ? [`every ${EVERY_SAID[repeats] ?? repeats}`] : []), `in ${l.name}`];
    rows.push({ register: l.id, fields, said: what, detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /**
   * "Lent Omar 500 yesterday": money owed between the reader and a person, kept in Bills and invoices, owed to the reader
   * or by them, linked to who. A day gone is when it was lent, kept in its note; a day to come is when it is due back.
   */
  function loan(c: string): boolean {
    const shape = LOANS.map((l) => ({ l, m: l.re.exec(c) })).find((x) => x.m !== null && aName(x.m[x.l.who]!));
    if (!shape || !shape.m) return false;
    /* "Lent Omar EGP 500": a currency's code after the name is the amount's, never the name's. */
    const named = shape.m[shape.l.who]!.split(' ');
    const code = named.length > 1 && CODES.has(named[named.length - 1]!) ? named.pop()! : '';
    const who = named.join(' ');
    const phrase = `${code} ${shape.m[shape.l.rest] ?? ''} ${shape.l.rest === 1 ? (shape.m[3] ?? '') : ''}`;
    const own = takeDay(phrase, opts.today);
    const [a] = amountsIn(own.rest, opts.currency);
    if (!a) return false;
    const l = dueList(opts.lists);
    if (!l) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= currency === null;
      left.push(c);
      return true;
    }
    if (!room(2)) return false;
    const toMe = shape.l.toMe;
    /* A day to come is when it comes back, in its own clause or the next ("…, pay back by Friday"); one gone, or today,
       is when it was lent. */
    const at = text.indexOf(c);
    const next = at === -1 ? '' : oneLine(text.slice(at + c.length).split(CLAUSE).find((p) => oneLine(p ?? '') !== '') ?? '');
    const later = takeDay(next, opts.today);
    const nextBack = later.day !== null && later.day > opts.today && BACK_SAID.test(trimWords(later.rest)) ? later.day : null;
    const back = own.day !== null && own.day > opts.today ? own.day : nextBack;
    const lentOn = own.day !== null && back === null ? own.gone : null;
    const fields: Record<string, TellValue> = {};
    const owes = /\bowes?\b/u.test(c);
    const what = owes ? (toMe ? `${who} owes you` : `You owe ${who}`) : toMe ? `Lent to ${who}` : `Borrowed from ${who}`;
    const title = textField(l);
    if (title) fields[title.id] = what;
    const sum = pick(l, 'money', /^amount$/, (f) => f.required === true);
    if (sum) fields[sum.id] = { amount, currency };
    const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me'));
    if (way) fields[way.id] = toMe ? 'owed_to_me' : 'owed_by_me';
    const due = pick(l, 'day', /due/, (f) => f.deadline === true || said(f, /due/));
    if (due && back) fields[due.id] = back;
    const stateField = l.fields.find((f) => f.id === (l.state ?? 'state') && f.type === 'enum');
    if (stateField && stateField.default === undefined && stateField.values?.includes('open')) fields[stateField.id] = 'open';
    const note = pick(l, 'text', /note/, (f) => f.id !== title?.id);
    const extra = trimWords(own.rest.slice(0, a.at) + ' ' + own.rest.slice(a.at + a.text.length)).replace(LOAN_WORDS, ' ').trim();
    const noteSaid = [lentOn ? `${toMe ? 'Lent' : 'Borrowed'} on ${daySaid(lentOn)}` : '', extra ? capital(extra) : ''].filter(Boolean).join('. ');
    if (note && noteSaid) fields[note.id] = noteSaid;
    const party = pick(l, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
    const ref = personOf(who);
    if (party && ref !== null) fields[party.id] = ref;
    const bits = [toMe ? `${who} owes you ${spelled(amount, currency)}` : `You owe ${who} ${spelled(amount, currency)}`, ...(back ? [`due back ${dayWord(back, opts.today)}`] : []), `in ${l.name}`];
    rows.push({ register: l.id, fields, said: what, detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    loaned = true;
    return true;
  }

  /** "Stripe paid out 1,950 USD today": money in from a platform, and nobody new. */
  function payout(phrase: string, from: string | null): boolean {
    const dated = takeDay(phrase, opts.today);
    const [a] = amountsIn(dated.rest, opts.currency);
    if (!a) return false;
    if (!moneyList(opts.lists) && !dueList(opts.lists)) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= currency === null;
      return false;
    }
    if (!keepMoney({ value: { amount, currency }, into: true, party: from, payer: null, by: null, day: dated.gone, what: from ? `Payout from ${from}` : 'Payout', said: `${spelled(amount, currency)} paid out${from ? ` by ${from}` : ''}` })) return false;
    return true;
  }

  /** A card alert or an account's text, as the bank sent it: the amount in the currency it names, where, and when. */
  function bankText(whole: string): boolean {
    const found = amountsIn(whole, opts.currency);
    if (found.length === 0) return false;
    const named = found.filter((a) => a.word !== null && a.currency !== null && !BALANCE_BEFORE.test(whole.slice(Math.max(0, a.at - 24), a.at)));
    const a = named[0];
    if (!a) {
      if (!BANK_ONLY.test(whole)) return false;
      bankBare = true;
      return true;
    }
    const currency = a.currency!;
    const amount = minor(a, currency);
    if (amount === null) return false;
    const into = BANK_IN.test(whole) && !BANK_OUT.test(whole);
    const after = whole.slice(a.at + a.text.length);
    const payee = PAYEE.exec(after)?.[1]?.trim().replace(/[.,;:]+$/u, '');
    const shown = payee ? titled(payee) : null;
    const { gone } = takeDay(after, opts.today);
    if (!keepMoney({
      value: { amount, currency },
      into,
      party: shown,
      payer: null,
      by: null,
      day: gone,
      what: shown ? (into ? `From ${shown}` : shown) : into ? 'Money in' : 'Card payment',
      said: `${spelled(amount, currency)} ${into ? 'in' : 'out'}${shown ? `, ${into ? 'from' : 'at'} ${shown}` : ''}`,
    })) {
      if (!moneyList(opts.lists) && !dueList(opts.lists)) noMoney = true;
      return noMoney;
    }
    return true;
  }

  /** An amount alone after an order, as that order's total. False when it is not one, or there is no total to fill. */
  function totalOf(clause: string): boolean {
    const order = lastOrder;
    if (order === null || !rows.includes(order)) return false;
    const l = orderList(opts.lists);
    const total = l ? pick(l, 'money', /total/, (f) => said(f, /total/)) : undefined;
    if (!total || order.fields[total.id] !== undefined) return false;
    const bare = clause.replace(TOTAL_WORDS, ' ').trim();
    const [a, ...more] = amountsIn(bare, opts.currency);
    if (!a || more.length > 0 || oneLine(bare.slice(0, a.at) + bare.slice(a.at + a.text.length)) !== '') return false;
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) return false;
    order.fields[total.id] = { amount, currency };
    order.detail = `${order.detail}, ${spelled(amount, currency)} not paid yet`;
    return true;
  }

  /** "3 vanilla jars for Friday", after the word that says it is wanted. False when it could not be placed. */
  function readOrder(phrase: string, who: string | null, around = ''): boolean {
    const l = orderList(opts.lists);
    const fresh = who !== null && people !== undefined && !knownAs(who, opts.people ?? []) && !sharedBy(who, opts.people ?? []) && !made.has(words(who));
    if (!l || !room(fresh ? 2 : 1)) return false;
    const own = takeDay(phrase, opts.today);
    const { day, rest } = own.day === null && around !== '' ? { day: takeDay(around, opts.today).day, rest: own.rest } : own;
    const q = QTY.exec(rest);
    const count = q ? (/^\d+$/.test(q[1]!) ? Number(q[1]) : COUNTS[q[1]!.toLowerCase()]) : undefined;
    const thing = trimWords(q ? rest.slice(q[0].length) : rest);
    if (!thing) return false;
    const fields: Record<string, TellValue> = { [textField(l)!.id]: thing };
    const ref = who ? personOf(who) : null;
    const whoField = pick(l, 'ref', /who|client|customer|person|from/, (f) => f.to === PEOPLE);
    if (ref !== null && whoField) {
      fields[whoField.id] = ref;
      client(ref, who!);
    }
    const many = count === undefined ? undefined : pick(l, 'int', /many|qty|quantity|count|number/);
    if (many && count !== undefined) fields[many.id] = count;
    const due = day ? pick(l, 'day', /due|^by$|for|deliver|when/, (f) => f.deadline === true || said(f, /due|^by$|for|deliver|when/)) ?? pick(l, 'day', /./) : undefined;
    if (due && day) fields[due.id] = day;
    const one = l.one ?? 'entry';
    const detail = [`${count !== undefined && many ? `${count} ` : ''}${thing}`, ...(due && day ? [`due ${dayWord(day, opts.today)}`] : [])];
    lastOrder = { register: l.id, fields, said: who ? `${anA(one)} from ${who}` : anA(one), detail: detail.join(', '), icon: iconOf(l), missing: missingOf(l, fields) };
    lastOrderBy = ref;
    rows.push(lastOrder);
    placed = true;
    return true;
  }

  /** "paid 900 on InstaPay": money in from whoever was named, or out when the reader paid. False when it could not be placed. */
  function readMoney(phrase: string, who: string | null, someone: boolean): boolean {
    /* The day first, so "on the 12th" is never twelve of anything. */
    const dated = takeDay(phrase, opts.today);
    const day = dated.gone;
    const [a, ...more] = amountsIn(dated.rest, opts.currency);
    if (!a) return false;
    /* WHERE NO MONEY IS KEPT, that is what is said, before any question of which currency: unless an order just placed
       keeps what was paid for it, as a shop with no Money keeps it on the order. */
    const takesPaid = lastOrder !== null && rows.includes(lastOrder) ? opts.lists.find((l) => l.id === lastOrder!.register) : undefined;
    const orderTakes = takesPaid !== undefined && pick(takesPaid, 'money', /paid/, (f) => said(f, /paid/)) !== undefined;
    if (!moneyList(opts.lists) && !dueList(opts.lists) && !orderTakes) {
      noMoney = true;
      return false;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= currency === null;
      return false;
    }
    /* One amount a clause; a second is said back, never dropped and never added in. */
    for (const m of more) left.push(m.text);
    const value: MoneyValue = { amount, currency };
    let rest = oneLine(`${dated.rest.slice(0, a.at)} ${dated.rest.slice(a.at + a.text.length)}`);
    const method = METHOD.exec(rest);
    const by = method && !NOT_A_NAME.has(method[1]!.toLowerCase()) ? method[1]! : null;
    if (method) rest = oneLine(rest.replace(method[0], ' '));
    const into = who !== null || someone || GOT.test(phrase);
    const payer = into && who ? personOf(who) : null;
    /* A PAYER IS A CLIENT ONLY WHEN THEY ORDERED: "Omar paid 1,200" says what moved, not who Omar is to you. */
    if (payer !== null && who && ordered.has(words(who))) client(payer, who);

    /* The order this payment is for: the last one, when the same person placed it and the order list keeps what was
       paid. A second payment in the same currency adds to it; one in another currency is never added in. */
    const order = into && lastOrder && JSON.stringify(lastOrderBy) === JSON.stringify(payer) ? opts.lists.find((l) => l.id === lastOrder!.register) : undefined;
    const paidField = order ? pick(order, 'money', /paid/, (f) => said(f, /paid/)) : undefined;
    const before = paidField ? (lastOrder!.fields[paidField.id] as MoneyValue | undefined) : undefined;
    if (lastOrder && paidField && rows.includes(lastOrder) && (!before || before.currency === currency)) {
      lastOrder.fields[paidField.id] = before ? { amount: before.amount + amount, currency } : value;
      if (!before) lastOrder.detail = `${lastOrder.detail}, paid`;
    }

    const plain = trimWords(rest.replace(ACT, '').replace(/^(?:for|from)\s+/iu, ''));
    const what = who ? `Payment from ${who}${by ? `, by ${by}` : ''}` : capital(plain) || (into ? 'Money in' : 'Money out');
    /* ONE LINE, READ AS A PERSON SAYS IT: "EGP 1,200.00 from Lina", then "paid, kept in Bills and
       invoices", where it said "EGP 1,200.00 in" over "into Bills and invoices". */
    const line = `${spelled(amount, currency)} ${into ? (who ? `from ${who}` : 'in') : 'out'}${by ? `, by ${by}` : ''}`;
    const kept = keepMoney({ value, into, party: who, payer, by, day, what, said: line });
    if (!kept && !moneyList(opts.lists) && !dueList(opts.lists)) noMoney = true;
    return kept || paidField !== undefined;
  }

  /**
   * Money that moved, kept where the record keeps it.
   *
   * NO ACCOUNT HELD, NO LEDGER ENTRY. A Ledger entry needs the account the money moved through, and a fresh record
   * holds none, so what was paid is kept where it needs no account: an item in Bills and invoices, owed to the reader
   * (or by them), already paid, due and paid on the day, and linked to who paid. A record holding an account keeps its
   * Ledger entry, and one holding several that the sentence names none of says which it needs.
   */
  function keepMoney(k: { value: MoneyValue; into: boolean; party: string | null; payer: TellValue | null; by: string | null; day: string | null; what: string; said: string }): boolean {
    const ledger = moneyList(opts.lists);
    const account = ledger?.fields.find((f) => f.type === 'ref' && f.required && said(f, /account/i));
    const owed = account && !accountsHeld(account) ? dueList(opts.lists) : undefined;
    const l = owed ?? ledger ?? dueList(opts.lists);
    if (!l || !room(1)) return false;
    const fields: Record<string, TellValue> = {};
    const title = textField(l);
    if (title) fields[title.id] = k.what;
    const sum = pick(l, 'money', /^amount$/, (f) => f.required === true);
    if (sum) fields[sum.id] = k.value;
    const stateField = l.fields.find((f) => f.id === (l.state ?? 'state') && f.type === 'enum');
    const settled = PAID_STATES.find((s) => stateField?.values?.includes(s));
    if (stateField && settled) fields[stateField.id] = settled;
    if (l === ledger) {
      const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out'));
      if (way) fields[way.id] = k.into ? 'in' : 'out';
      const on = pick(l, 'day', /^on$|date|day/, (f) => f.required === true);
      if (on) fields[on.id] = k.day ?? opts.today;
      const party = l.fields.find((f) => f.type === 'text' && f.id !== title?.id && said(f, /counterparty|paid to|from|who/i));
      if (party && k.party) fields[party.id] = k.party;
      const held = account ? accountFor(k.by) : null;
      if (account && held) fields[account.id] = `${account.to ?? account.id}#${held.seq}`;
    } else {
      const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me'));
      if (way) fields[way.id] = k.into ? 'owed_to_me' : 'owed_by_me';
      const due = pick(l, 'day', /due/, (f) => f.deadline === true || said(f, /due/));
      if (due) fields[due.id] = k.day ?? opts.today;
      /* The day it was paid is the day it was due: it is written paid, so the record keeps the day this write names. */
      const paidOn = settled ? l.fields.find((f) => f.type === 'day' && f.id !== due?.id && said(f, /settled|paid/i)) : undefined;
      if (paidOn) fields[paidOn.id] = k.day ?? opts.today;
      const party = pick(l, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
      if (party && k.payer !== null) fields[party.id] = k.payer;
    }
    rows.push({ register: l.id, fields, said: k.said, detail: `${settled ? 'paid, ' : ''}kept in ${l.name}`, icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** Whether the record holds any account of the kind this field links to: one known by name, or one counted. */
  function accountsHeld(account: FieldDecl): boolean {
    return (opts.accounts ?? []).length > 0 || (opts.lists.find((x) => x.id === account.to)?.count ?? 0) > 0;
  }

  /** The account a payment came through: the one its way names, or the only one there is when it names none. */
  function accountFor(by: string | null): Known | null {
    const accounts = opts.accounts ?? [];
    if (by) return accounts.find((a) => words(a.name).includes(words(by)) || words(by).includes(words(a.name))) ?? null;
    return accounts.length === 1 ? accounts[0]! : null;
  }
}
