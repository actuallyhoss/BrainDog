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

import type { FieldDecl, MoneyValue } from '../record/schema.ts';
import { GREETINGS, PEOPLE, hear } from '../who.ts';
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

export type Told = { rows: TellRow[]; left: string[] };

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
/* A weekday said bare only in full: "she sat down" is no Saturday. Its short form needs a word before it ("by fri"). */
const DAY = new RegExp(
  `\\b(?:(?:for|by|on|due|before|until)\\s+)?(today|tonight|tomorrow|tmrw|this weekend|next week|next (?:${WEEKDAY})|in (?:\\d{1,3}|${IN_COUNT}) (?:days?|weeks?)|\\d{4}-\\d{2}-\\d{2}|the \\d{1,2}(?:st|nd|rd|th)|${FULL_DAY})\\b\\.?` +
    `|\\b(?:for|by|on|due|before|until)\\s+(${WEEKDAY})\\b\\.?`,
  'iu',
);

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
  if (p === 'next week') return nextMonday(today);
  if (p === 'this weekend') return addDays(today, (6 - weekdayOf(today) + 7) % 7);
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
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
  const gone = day <= today ? day : WEEKDAYS[phrase] !== undefined ? addDays(day, -7) : nth ? dayOfMonthGone(Number(nth[1]), today) : day;
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
        const digitsAt = m[0].search(/\d/);
        out.push({ at: at + digitsAt, text: m[0].slice(digitsAt), digits: m[5]!, thousand: Boolean(m[6]), currency: null, word: null });
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

/** Where a plain line goes: the list the record names for it, else the one that calls an entry a task. */
const taskList = (lists: readonly TellList[], capture: string | undefined): TellList | undefined =>
  (capture ? lists.find((l) => l.id === capture) : undefined) ?? lists.find((l) => callsItself(l, /^tasks?$|\bto-?dos?\b/i) && textField(l) !== undefined);

const peopleList = (lists: readonly TellList[]): TellList | undefined => lists.find((l) => l.id === PEOPLE);

/** The first field of a type, preferring one whose id or label says `re`. */
const pick = (l: TellList, type: FieldDecl['type'], re: RegExp, also: (f: FieldDecl) => boolean = () => true): FieldDecl | undefined =>
  l.fields.find((f) => f.type === type && also(f) && said(f, re)) ?? l.fields.find((f) => f.type === type && also(f));

/** Required fields with nothing in them and no default, as a person reads them. */
const missingOf = (l: TellList, fields: Record<string, TellValue>): string[] =>
  l.fields.filter((f) => f.required && fields[f.id] === undefined && f.default === undefined && !f.retired).map(labelOf);

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
const METHOD = new RegExp(`\\b(?:on|by|via|through|with|over|using)\\s+(${NAME}|cash|card|bank transfer|transfer|wallet)\\b`, 'u');
/* The act a payment opens on, taken off before what is left says what it was for. */
const ACT = /^(?:(?:i|we)\s+)?(?:paid|pays|spent|sent|transferred|received|got)\b\s*/iu;
/** The states that say money has moved, in the words lists use for it; `first-today.ts` says "a payment" by them too. */
export const PAID_STATES: readonly string[] = ['paid', 'cleared', 'settled', 'received', 'done'];

/* A greeting or a thanks on its own, as a pasted message opens and closes. */
const PLEASANTRY = /^(?:hi|hello|hey|thanks|thank you|thx|please|ok|okay|cheers)(?:\s+\p{L}+)?$/iu;
const acts = (s: string): boolean => ORDER.test(s) || PAID.test(s) || GOT.test(s);
/* The words around an order's total that say nothing more of it: "total", "not paid yet", "owed". */
const TOTAL_WORDS = /\b(?:the\s+total(?:\s+is)?|total(?:\s+is)?|in\s+all|not\s+paid(?:\s+yet)?|unpaid|still\s+owed|owed|to\s+pay|due)\b/giu;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const trimWords = (s: string): string => oneLine(s).replace(/^(?:of|the|some)\s+/iu, '').replace(/[\s,.;:!?]+$/u, '').replace(/\s+(?:please|pls|thanks|thank you)$/iu, '');

/** One sentence, read into the entries it would become. Writes nothing. */
export function tellRead(sentence: string, opts: TellOptions): Told {
  const rows: TellRow[] = [];
  const left: string[] = [];
  let text = oneLine(sentence);
  if (!text) return { rows, left };

  /* A self-introduction names the reader, who is never a new person: "I'm Mariam, Nadia wants..." reads from Nadia. */
  if (INTRODUCED.test(text)) text = hear(text).bio || text;
  const people = peopleList(opts.lists);
  const room = (n: number): boolean => rows.length + n <= MOST;

  /* Who each name is: an entry already kept, or a new one made the first time they are named. */
  const made = new Map<string, number>();
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
  /* Somebody who orders or pays is a client, where People says what a person is to you. */
  const client = (ref: TellValue | null, name: string): void => {
    if (!people || ref === null || typeof ref !== 'object' || !('$row' in ref)) return;
    const role = people.fields.find((f) => f.type === 'enum' && f.values?.includes('client'));
    const row = rows[ref.$row];
    if (!role || !row || row.fields[role.id] !== undefined) return;
    row.fields[role.id] = 'client';
    row.said = `${name}, a client`;
  };

  const message = FROM_MESSAGE.exec(text);
  let subject: string | null = message && aName(message[1]!) ? message[1]! : null;
  if (message && subject) text = text.slice(message[0].length);
  let lastOrder: TellRow | null = null;
  /* Who placed it, as its link holds them, so a payment from someone else is never put to it. */
  let lastOrderBy: TellValue | null = null;
  /* An amount heard with no currency to put to it: said back as left, never turned into a task. */
  let unsure = false;

  for (const piece of text.split(CLAUSE)) {
    const whole = oneLine(piece ?? '');
    if (!whole || PLEASANTRY.test(whole)) continue;
    let c = whole;
    const self = SPENT.test(c);
    /* A name or "she" opens a clause only before an act, so "Buy more wax" is nobody called Buy. */
    let someone = false;
    const opener = SUBJECT.exec(c);
    const after = opener ? c.slice(opener[0].length).trim() : '';
    if (opener && aName(opener[1]!) && acts(after)) {
      subject = opener[1]!;
      c = after;
    } else if (PRONOUN.test(c) && acts(c.replace(PRONOUN, ''))) {
      c = c.replace(PRONOUN, '');
      someone = true;
    }
    /* WHAT AN ORDER COMES TO, said beside it with no payment (uc6-walk-50): "Salma wants 6 amber jars for Saturday,
       1,350 not paid yet", "..., EGP 1,350", "..., total 1,350". It is the order's total, in the record's currency
       when none is written, so the Orders page can say who still owes. A clause with anything else in it is not this. */
    if (!self && !acts(c) && totalOf(c)) continue;
    if (!self && !acts(c)) {
      left.push(whole);
      continue;
    }
    const from = FROM.exec(c);
    if (from && aName(from[1]!)) subject = from[1]!;
    /* Made as soon as named, with room kept for what they did, so a full preview never ends on a person alone. */
    const before = rows.length;
    if (subject && !self && room(2)) personOf(subject);

    const order = ORDER.exec(c);
    const placed = order && !self ? readOrder(c.slice(order[0].length), subject) : readMoney(c, self ? null : subject, someone && !subject);
    if (!placed) {
      /* A clause that placed nothing leaves no one behind: "Nadia paid 0" is no new Nadia. */
      rows.length = before;
      for (const [name, at] of made) if (at >= before) made.delete(name);
      left.push(whole);
    }
  }

  /* WITH NOTHING THAT FITS, ONE TASK WITH THE WORDS AS ITS TITLE, due on the day they name. */
  if (!unsure && !rows.some((r) => r.register !== people?.id)) {
    const tasks = taskList(opts.lists, opts.capture);
    if (tasks && room(1)) {
      const what = textField(tasks)!;
      const { day, rest } = takeDay(text, opts.today);
      const due = day ? pick(tasks, 'day', /due|^by$|deadline/, (f) => f.deadline === true || said(f, /due|^by$/)) : undefined;
      const fields: Record<string, TellValue> = { [what.id]: capital(trimWords(due ? rest : text) || text) };
      if (due && day) fields[due.id] = day;
      rows.push({
        register: tasks.id,
        fields,
        said: String(fields[what.id]),
        detail: `new in ${tasks.name}${due && day ? `, due ${dayWord(day, opts.today)}` : ''}`,
        icon: iconOf(tasks),
        missing: missingOf(tasks, fields),
      });
      return { rows, left: [] };
    }
  }
  return { rows, left };

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
    order.detail = `${order.detail}, ${money(amount, currency)} not paid yet`;
    return true;
  }

  /** "3 vanilla jars for Friday", after the word that says it is wanted. False when it could not be placed. */
  function readOrder(phrase: string, who: string | null): boolean {
    const l = orderList(opts.lists);
    const fresh = who !== null && people !== undefined && !knownAs(who, opts.people ?? []) && !sharedBy(who, opts.people ?? []) && !made.has(words(who));
    if (!l || !room(fresh ? 2 : 1)) return false;
    const { day, rest } = takeDay(phrase, opts.today);
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
    return true;
  }

  /** "paid 900 on InstaPay": money in from whoever was named, or out when the reader paid. False when it could not be placed. */
  function readMoney(phrase: string, who: string | null, someone: boolean): boolean {
    /* The day first, so "on the 12th" is never twelve of anything. */
    const dated = takeDay(phrase, opts.today);
    const day = dated.gone;
    const [a, ...more] = amountsIn(dated.rest, opts.currency);
    if (!a) return false;
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
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
    if (payer !== null && who) client(payer, who);

    /* The order this payment is for: the last one, when the same person placed it and the order list keeps what was
       paid. A second payment in the same currency adds to it; one in another currency is never added in. */
    const order = into && lastOrder && JSON.stringify(lastOrderBy) === JSON.stringify(payer) ? opts.lists.find((l) => l.id === lastOrder!.register) : undefined;
    const paidField = order ? pick(order, 'money', /paid/, (f) => said(f, /paid/)) : undefined;
    const before = paidField ? (lastOrder!.fields[paidField.id] as MoneyValue | undefined) : undefined;
    if (lastOrder && paidField && rows.includes(lastOrder) && (!before || before.currency === currency)) {
      lastOrder.fields[paidField.id] = before ? { amount: before.amount + amount, currency } : value;
      if (!before) lastOrder.detail = `${lastOrder.detail}, paid`;
    }

    /* NO ACCOUNT HELD, NO LEDGER ENTRY. A Ledger entry needs the account the money moved through, and a fresh record
       holds none, so what was paid is kept where it needs no account: an item in Bills and invoices, owed to the
       reader (or by them), already paid, due and paid on the day, and linked to who paid. A record holding an account
       keeps its Ledger entry, and one holding several that the sentence names none of says which it needs. */
    const ledger = moneyList(opts.lists);
    const account = ledger?.fields.find((f) => f.type === 'ref' && f.required && said(f, /account/i));
    const owed = account && !accountsHeld(account) ? dueList(opts.lists) : undefined;
    const l = owed ?? ledger ?? dueList(opts.lists);
    if (!l || !room(1)) return paidField !== undefined;
    const fields: Record<string, TellValue> = {};
    const title = textField(l);
    const plain = trimWords(rest.replace(ACT, '').replace(/^(?:for|from)\s+/iu, ''));
    const what = who ? `Payment from ${who}${by ? `, by ${by}` : ''}` : capital(plain) || (into ? 'Money in' : 'Money out');
    if (title) fields[title.id] = what;
    const sum = pick(l, 'money', /^amount$/, (f) => f.required === true);
    if (sum) fields[sum.id] = value;
    const stateField = l.fields.find((f) => f.id === (l.state ?? 'state') && f.type === 'enum');
    const settled = PAID_STATES.find((s) => stateField?.values?.includes(s));
    if (stateField && settled) fields[stateField.id] = settled;
    if (l === ledger) {
      const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out'));
      if (way) fields[way.id] = into ? 'in' : 'out';
      const on = pick(l, 'day', /^on$|date|day/, (f) => f.required === true);
      if (on) fields[on.id] = day ?? opts.today;
      const party = l.fields.find((f) => f.type === 'text' && f.id !== title?.id && said(f, /counterparty|paid to|from|who/i));
      if (party && who) fields[party.id] = who;
      const held = account ? accountFor(by) : null;
      if (account && held) fields[account.id] = `${account.to ?? account.id}#${held.seq}`;
    } else {
      const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me'));
      if (way) fields[way.id] = into ? 'owed_to_me' : 'owed_by_me';
      const due = pick(l, 'day', /due/, (f) => f.deadline === true || said(f, /due/));
      if (due) fields[due.id] = day ?? opts.today;
      /* The day it was paid is the day it was due: it is written paid, so the record keeps the day this write names. */
      const paidOn = settled ? l.fields.find((f) => f.type === 'day' && f.id !== due?.id && said(f, /settled|paid/i)) : undefined;
      if (paidOn) fields[paidOn.id] = day ?? opts.today;
      const party = pick(l, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
      if (party && payer !== null) fields[party.id] = payer;
    }
    rows.push({
      register: l.id,
      fields,
      said: `${money(amount, currency)} ${into ? 'in' : 'out'}${by ? `, by ${by}` : who ? `, from ${who}` : ''}`,
      detail: `into ${l.name}${settled ? ', marked paid' : ''}`,
      icon: iconOf(l),
      missing: missingOf(l, fields),
    });
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
