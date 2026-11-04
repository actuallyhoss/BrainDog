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

import { homeCurrency, moneyCurrencies } from '../record/api.ts';
import { CODES, FIGURE, SYMBOLS, bareDollar, codeOf, minorOf, numberOf } from '../record/currency-words.ts';
import { symbolOf, symbolText } from '../record/money.ts';
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
  /** The add-on that declared it, as `boot` says (`tellLists`); absent for a list somebody made. */
  pack?: string;
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
  /** The organisations on the record, for the company somebody met is from (AM12). */
  orgs?: readonly Known[];
  /** The entries each list holds, by list id, as this tab has named them (RM5): a name kept as an organisation, a bill,
      money that comes round, a subscription or a past payment's payee is never made a person. */
  titled?: Readonly<Record<string, readonly Known[]>>;
  /** The list a plain line goes into, when the record says. Otherwise the list that calls one of its entries a task. */
  capture?: string;
  /** Every currency the record's money is in (`moneyCurrencies()` when not said): "dinars" on a record that holds
      only Kuwaiti dinars is those. */
  held?: readonly string[];
  /** The open entries of the lists that keep a bill, an invoice or an order paid, known by the number a line says
      ("Invoice 1042 paid"): asked of the record only once a line names one (`numbered.ts`), never with Today. */
  open?: readonly Open[];
  /** The name of whoever is telling it, the record's owner on their own BrainDog: never the one their money was paid to
      (AO12). */
  me?: string | null;
};

/** An entry still open, on the list it is kept in: one a line can mark paid by its number, its name or whose it is. */
/* AND WHAT IT IS SAID BY BESIDE ITS NAME (AP6): the day it is due, what it comes to, who it is linked to (`by`, a name
   the record may not have sent, found again in `people` by its number) and which way its money goes (`toMe`). */
export type Open = Known & { register: string; due?: string; amount?: MoneyValue; by?: Known; toMe?: boolean };

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
  /** WHERE THE PERSON FINDS IT, when that is not its list's own page (AO10): money in kept as a paid item is said
      "kept in Money" before the add, and "in Money", linked to Money, after it. */
  where?: { name: string; href: string };
};

/**
 * What the sentence became: the entries, the words left over, and, when nothing could be placed, `why` in a person's
 * words and the `offers`, each the same words as one entry of a list it could go into, for the person to pick. A card
 * never draws over nothing: an empty answer still says so and offers the way on (first-hour audit AH1).
 */
export type Told = {
  rows: TellRow[];
  left: string[];
  why?: string;
  offers?: TellRow[];
  /** Money was said on a record that keeps none: the card offers to turn Money on and add it in the same press (AM4). */
  needsMoney?: true;
  /** It fits nowhere on a record that keeps no things to do: the card offers to start a to-do list (Work) and add it (AO7). */
  needsTodo?: true;
  /* NO LIST OF PROJECTS, for "New project: …" (AP7): the card offers to start Projects and add it. */
  needsProjects?: true;
  /** Two or more open entries the line could mean, "Rent paid" with May's and June's open (AP6): which is asked, each
      its own press. */
  which?: { ask: string; marks: TellChange[] };
  /** Somebody kept on the record whom the line names, when it fits no list: their page is offered (AN9). */
  about?: { name: string; href: string };
  /** What the line says of somebody kept, offered as a change to their entry: one press keeps it on them. */
  change?: TellChange;
};

/**
 * A FACT ABOUT SOMEBODY ALREADY KEPT, KEPT ON THEM: "Mum's birthday is 14 Nov" where Mum is in People and no list of
 * dates is kept. Tell only adds, so it said "Mum is already in People" and dropped the day. It is offered as `ask`
 * ("Add 14 Nov as Mum's birthday?"), and the press adds `line` to their `field` (their note), after what it holds.
 */
/* AND AN OPEN BILL, INVOICE OR ORDER SAID PAID BY ITS NUMBER: "Invoice 1042 paid" is offered as "Mark invoice 1042 paid?",
   and `mark` says the press sets `field` (its state) to `line` (the paid state), as the entry's own Mark paid does. */
/* A SECOND BIRTHDAY IN THE SAME LINE (RP2) is `also`, kept in the one press, with `ask` and `done` naming them all;
   `already` is what is said when every note already holds its day, and nothing is written. */
/* AND THE PRESS RE-READS THE ENTRY FIRST (RQ5): `shut` is its list's finished states, and what is said, with nothing
   written, when the entry is in one already: paid (`paid`) or closed some other way, written off (`other`). */
/* `label` is the few words its own button says when it is one of several (`Told.which`): "Rent, due 5 Nov". */
export type TellChange = { register: string; seq: number; name: string; field: string; line: string; ask: string; done: string; mark?: true; also?: readonly TellChange[]; already?: string; shut?: { states: readonly string[]; paid: string; other: string }; label?: string };

/** The state a list keeps an entry paid in, as it declares it: "paid" itself, finished, on a list keeping money. Never
    "cleared" or "done" (RQ3): a Ledger line cleared is no bill paid. */
export function paidStateOf(l: Pick<TellList, 'state' | 'done' | 'fields'>): string | null {
  const state = l.fields.find((f) => f.id === l.state && f.type === 'enum' && f.retired !== true);
  if (!state || !l.fields.some((f) => f.type === 'money' && f.retired !== true)) return null;
  return (l.done ?? []).includes('paid') && (state.values ?? []).includes('paid') ? 'paid' : null;
}

/**
 * WHAT A LIST KEEPS THAT A LINE CAN MARK PAID BY ITS NUMBER (RQ3): orders, on a list that calls an entry an order; bills
 * and invoices, on Bills and invoices or a list like it (owed to him or by him, with a day it is due). Never the Ledger,
 * Instalments or Plans, though each has a finished state.
 */
export function markKind(l: Pick<TellList, 'id' | 'name' | 'one' | 'state' | 'done' | 'fields'>): 'order' | 'bill' | null {
  if (paidStateOf(l) === null) return null;
  if (/\border/iu.test(`${l.id} ${l.name} ${l.one ?? ''}`)) return 'order';
  const owed = l.fields.some((f) => f.type === 'enum' && f.retired !== true && f.values?.includes('owed_to_me') === true && f.values.includes('owed_by_me'));
  const due = l.fields.some((f) => f.type === 'day' && f.deadline === true && f.retired !== true);
  return l.id === 'obligations' || (owed && due) ? 'bill' : null;
}

/** Whether an entry's name says it is the one by that number, starting with its list's word: "Invoice 1042",
    "INV-1042", "Order #3". Never a count inside it ("3 vanilla jars") or a number after other words ("Rent for flat 12"). */
export function namedAs(name: string, kind: 'order' | 'bill', digits: string): boolean {
  const nouns = kind === 'order' ? 'orders?' : 'invoices?|inv|bills?';
  return new RegExp(`^\\s*(?:${nouns})\\.?[\\s#:-]*(?:no\\.?|number)?\\s*#?\\s*0*${digits}(?!\\p{Nd})`, 'iu').test(name);
}

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
/* AND NEVER THE FIRST DIGITS OF A FIGURE (RM5): "Bonus for March 5,000" is 5,000, never 5 March and an amount of 000. */
/* A PART OF THE DAY SAID WITH IT IS THE DAY'S (finish 31 Oct): "Run 10k on Saturday morning" kept "morning" in its name.
   "Saturday morning", "tomorrow evening", "Friday night", "this afternoon" are each taken whole as the day. */
const PART = '(?:\\s+(?:in the\\s+)?(?:morning|afternoon|evening|night))?';
const DAY = new RegExp(
  `\\b(?:(?:for|by|on|due|before|until)\\s+)?(today|tonight|tomorrow|tmrw|yesterday|this (?:morning|afternoon|evening)|this weekend|this week|next week|next (?:${WEEKDAY})|in (?:\\d{1,3}|${IN_COUNT}) (?:days?|weeks?)|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MONTH}|${MONTH} \\d{1,2}(?:st|nd|rd|th)?|the \\d{1,2}(?:st|nd|rd|th)|${FULL_DAY})\\b(?![.,]\\d)${PART}\\.?` +
    `|\\b(?:for|by|on|due|before|until)\\s+(${WEEKDAY})\\b${PART}\\.?`,
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
  if (p === 'today' || p === 'tonight' || /^this (?:morning|afternoon|evening)$/.test(p)) return today;
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

/** A day as the preview says it: today, tomorrow, the weekday within the week, or the date. A day said as a date
    (`dated`) is said back as one, never as a weekday he has to work back (AO18): "on the 5th" is "5 Nov". */
export function dayWord(day: string, today: string, dated = false): string {
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  if (dated) return daySaid(day).replace(/^\S+\s+/u, '');
  for (let n = 2; n < 7; n++) if (day === addDays(today, n)) return FULL_DAYS[weekdayOf(day)]!;
  return daySaid(day);
}

/* A DAY SAID AS A DATE, never as a weekday or a count: "the 5th", "5 Nov", "Nov 5", "5/11", "2026-11-05" (AO18). */
const DATE_SAID = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MONTH}|${MONTH} \\d{1,2}|the \\d{1,2}(?:st|nd|rd|th))\\b`, 'iu');

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
function takeDay(text: string, today: string): { day: string | null; rest: string; gone: string | null; part: string | null } {
  const m = DAY.exec(text);
  const phrase = words(m?.[1] ?? m?.[2] ?? '').replace(/\.$/, '');
  const day = m ? dayNamed(phrase, today) : null;
  if (!m || day === null) return { day: null, rest: text, gone: null, part: null };
  /* The part of the day said with it, "morning" in "Saturday morning" or "this morning", for a list that keeps one. */
  const part = /\b(morning|afternoon|evening|night)\.?$/iu.exec(m[0])?.[1]?.toLowerCase() ?? null;
  const nth = /^the (\d{1,2})/.exec(phrase);
  /* A month's day to come is last year's when it is read for something done: "charged on 14 Nov" in October is gone. */
  /* AND SO IS A SLASHED DAY WITH NO YEAR (RG9): "on 30/10" read on 31 Oct is yesterday, never next October. */
  const named = (/[a-z]{3}/.test(phrase) && /\d/.test(phrase) && !phrase.startsWith('in ')) || /^\d{1,2}\/\d{1,2}$/.test(phrase);
  const gone = day <= today ? day : WEEKDAYS[phrase] !== undefined ? addDays(day, -7) : nth ? dayOfMonthGone(Number(nth[1]), today) : named ? `${Number(day.slice(0, 4)) - 1}${day.slice(4)}` : day;
  return { day, rest: oneLine(`${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`), gone, part };
}

/** A day as the preview says it with the part of it kept: "Saturday morning", "this afternoon", "tonight". */
function partTold(day: string, part: string | null): string {
  if (part === null) return day;
  if (day === 'today') return part === 'night' ? 'tonight' : `this ${part}`;
  return `${day} ${part}`;
}

/** The field a list keeps the part of a day in, a time of day: a text field called that, or a choice that offers it. */
function timeField(l: TellList, part: string): FieldDecl | undefined {
  return l.fields.find(
    (f) =>
      !f.retired &&
      /^(?:time|time of day|part of day|when)$/iu.test(labelOf(f)) &&
      (f.type === 'text' || (f.type === 'enum' && (f.values ?? []).includes(part))),
  );
}

/** The days from one day to another, later or the same. */
const daysBetween = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/** Whether the day a line names is a weekday said bare, "on Monday" or "Saturday morning", read as the one gone of a spend. */
function weekdaySaid(text: string): boolean {
  const m = DAY.exec(text);
  return WEEKDAYS[words(m?.[1] ?? m?.[2] ?? '').replace(/\.$/, '')] !== undefined;
}

/* THE DAY WORDS THAT POINT AHEAD (RO5): "due Friday", "by the 5th", "tomorrow", "next Monday", "in 3 days". Any other day
   said of a spend is the one gone: "Uber 85 on Monday" was last Monday. */
const AHEAD = /^(?:due|by|before|until|for)\b|\b(?:tomorrow|tmrw|next|this week|this weekend)\b|(?:^|\s)in\s+\S+\s+(?:days?|weeks?)\b/iu;
const aheadSaid = (text: string): boolean => {
  const m = DAY.exec(text);
  return m !== null && AHEAD.test(oneLine(m[0]));
};

/* ── amounts ──────────────────────────────────────────────────────────── */

/* A FIGURE AS TYPED, in any digits and grouping (`FIGURE`), read by the one money reader (`minorOf`, RG8). */
const NUM = `(${FIGURE})(\\s?k\\b)?`;

const AMOUNT = new RegExp(
  `(US\\$|A\\$|C\\$|NZ\\$|E£|£|€|¥|₹|\\$)\\s?${NUM}` +
    `|\\b([A-Za-z]{3})\\s?${NUM}` +
    `|${NUM}(?:\\s?(E£|£|€|¥|₹|\\$|l\\.e\\.?|le\\b|[A-Za-z]{3}\\b|euros?\\b|sterling\\b|quid\\b|(?:pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?\\b))?`,
  'giu',
);

type Amount = { at: number; text: string; digits: string; thousand: boolean; currency: string | null; word: string | null };

/* ── currencies said by name (audit 31 Oct l, AL8) ── */

const CURRENCY_NAME = new Intl.DisplayNames('en', { type: 'currency' });
/* "Kuwaiti dinar", "us dollar", "egyptian pound": every tender code by its English name, as the runtime says it, and the
   one shortening people say for a name the runtime writes long. */
const BY_NAME: ReadonlyMap<string, string> = new Map([
  ...[...CODES].map((c) => [words(CURRENCY_NAME.of(c) ?? c), c] as [string, string]),
  ['uae dirham', 'AED'],
]);
/* A currency's family word, plural or not, and a bare "$", which is a dollar whose country is not said. */
const FAMILY_WORD = /^(?:(pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?|(\$))$/iu;
const FAMILY_ENDS: Record<string, string> = { buck: 'dollar', rial: 'ri(?:y)?al', riyal: 'ri(?:y)?al' };

/** The currencies a family word may be, read off the runtime's names: "dinars" is the eight whose name ends in Dinar. */
function familyOf(word: string | null): string[] {
  const m = word ? FAMILY_WORD.exec(word) : null;
  if (!m) return [];
  const f = m[2] ? 'dollar' : (FAMILY_ENDS[m[1]!.toLowerCase()] ?? m[1]!.toLowerCase());
  return [...CODES].filter((c) => new RegExp(`\\b${f}$`, 'iu').test(CURRENCY_NAME.of(c) ?? ''));
}

/** A currency said by its name ("1,000 Kuwaiti dinars", "300 US dollars") written as its code, so the figure reads it. */
const NAMED = /((?:[\p{L}.&]+\s+){1,3})(pounds?|dollars?|dirhams?|riyals?|rials?|dinars?|rupees?)(?![\p{L}\p{M}])/giu;
function namedCodes(text: string): string {
  return text.replace(NAMED, (whole: string, before: string, family: string) => {
    const ws = before.trim().split(/\s+/u);
    const one = words(family).replace(/s$/u, '');
    for (let k = Math.min(3, ws.length); k >= 1; k--) {
      const code = BY_NAME.get(words(`${ws.slice(-k).join(' ')} ${one}`));
      if (code) return `${ws.slice(0, -k).join(' ')}${ws.length > k ? ' ' : ''}${code}`;
    }
    return whole;
  });
}

/** The code a word beside a figure names, as `codeOf` reads it, or the one currency of its family the record holds. */
function codeHeld(word: string, record: string | null, held: readonly string[]): string | null | undefined {
  const code = codeOf(word, record);
  if (code !== null) return code;
  const mine = familyOf(word).filter((c) => held.includes(c));
  return mine.length === 1 ? mine[0]! : null;
}

/** Every figure in a stretch of words, with the currency typed beside it. A bare count before a word is still read. */
function amountsIn(text: string, record: string | null, held: readonly string[] = []): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const at = m.index ?? 0;
    if (m[1]) {
      /* A CODE WRITTEN BESIDE A BARE "$" SAYS WHICH DOLLAR, or that it is no dollar: "$12 EGP" and "EGP $12" are EGP 12. */
      const written = m[1] === '$' ? (/^\s?([A-Za-z]{3})\b/u.exec(text.slice(at + m[0].length))?.[1] ?? /\b([A-Za-z]{3})\s?$/u.exec(text.slice(0, at))?.[1]) : undefined;
      const code = written !== undefined && CODES.has(written.toUpperCase()) ? written.toUpperCase() : null;
      out.push({ at, text: m[0], digits: m[2]!, thousand: Boolean(m[3]), currency: code ?? codeHeld(m[1], record, held) ?? null, word: m[1] });
    }
    else if (m[4]) {
      const code = codeOf(m[4], record);
      /* "for 3 jars" is no currency called FOR: only a real code before a figure is one. */
      if (code) out.push({ at, text: m[0], digits: m[5]!, thousand: Boolean(m[6]), currency: code, word: m[4] });
      else {
        /* "PAID OUT 1,950 USD": the three letters before the figure were a word, and the code typed after it is still
           the currency (founder audit AH2, where the record's own was written in its place). */
        const digitsAt = m[0].search(/\d/);
        const after = /^\s?(E£|£|€|¥|₹|[A-Za-z]{3}\b|euros?\b|sterling\b|quid\b|(?:pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?\b)/u.exec(text.slice(at + m[0].length));
        const code = after ? codeHeld(after[1]!, record, held) : undefined;
        if (after && code !== undefined)
          out.push({ at: at + digitsAt, text: m[0].slice(digitsAt) + after[0], digits: m[5]!, thousand: Boolean(m[6]), currency: code, word: after[1]! });
        else out.push({ at: at + digitsAt, text: m[0].slice(digitsAt), digits: m[5]!, thousand: Boolean(m[6]), currency: null, word: null });
      }
    } else {
      const word = m[9] ?? null;
      /* "12$ EGP": the code after the sign says which, as it does before a figure. */
      const after = word === '$' ? /^\s?([A-Za-z]{3})\b/u.exec(text.slice(at + m[0].length))?.[1]?.toUpperCase() : undefined;
      const code = after !== undefined && CODES.has(after) ? after : word ? codeHeld(word, record, held) : null;
      const plain = code === undefined ? m[0].slice(0, m[0].length - (word?.length ?? 0)).trimEnd() : m[0];
      out.push({ at, text: plain, digits: m[7]!, thousand: Boolean(m[8]), currency: code ?? null, word: code === undefined ? null : word });
    }
  }
  return out;
}

/** A currency's sign as the runtime writes it in English, by its own mark ("CA$", "€"), or its code where it has none. */
const signSaid = (code: string): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'symbol' }).formatToParts(1).find((p) => p.type === 'currency')?.value ?? code;

/** Minor units, or `null` for more decimal places than the currency has or a grouping it does not print. */
const minor = (a: Amount, currency: string): number | null => minorOf(a.digits, currency, a.thousand);

/* ── names ────────────────────────────────────────────────────────────── */

/* A capitalised word in any script, and up to three of them: `Nadia`, `Nadia Samir`, `O'Neill`. */
const CAP = "\\p{Lu}[\\p{L}\\p{M}'’-]*(?:\\.(?:com|net|org|io|co|ai|app)\\b)?";
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
/* A MONTH OR A WEEKDAY IS NOBODY, last in a name as first (RM5): "Paid Omar March 300" is Omar. */
const DATE_WORDS: ReadonlySet<string> = new Set([...Object.keys(WEEKDAYS), 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
/** A name with the months and weekdays said after it taken off, and the words taken. */
function undated(name: string): { name: string; dropped: string[] } {
  const ws = name.trim().split(/\s+/u);
  const dropped: string[] = [];
  while (ws.length > 1 && DATE_WORDS.has(words(ws[ws.length - 1]!))) dropped.unshift(ws.pop()!);
  return { name: ws.join(' '), dropped };
}

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

/**
 * THE CLIENT AN ENTRY'S WORDS NAME, for a list with a link that says client (Work's tasks, `client`, since work 1.23.0,
 * 2 Nov: "Send Fenwick's invoice" on a record that keeps Fenwick as an organisation is Fenwick's, and the words stay as
 * typed): an entry of the list the link points at whose name stands in the words as a word of its own, "Fenwick's" and
 * "for Acme" alike, the longest name first, and a company's name without the word it ends on ("Brightside" for
 * "Brightside Ltd"). `pool` names the entries a list keeps. `null` where the list has no such link, it is set already,
 * or no kept name is said. Today's drafts ask it too, of the model's.
 */
export function clientNamed(
  l: Pick<TellList, 'fields' | 'title'>,
  fields: Readonly<Record<string, unknown>>,
  pool: (to: string) => readonly Known[],
): { field: string; ref: string; name: string } | null {
  const link = l.fields.find((f) => f.type === 'ref' && !f.retired && f.to !== undefined && f.to !== PEOPLE && /client/iu.test(`${f.id} ${f.label ?? ''}`));
  if (!link?.to || (fields[link.id] !== undefined && fields[link.id] !== null && fields[link.id] !== '')) return null;
  const title = l.fields.find((f) => f.id === l.title) ?? l.fields.find((f) => f.type === 'text');
  const said = words(String(title ? (fields[title.id] ?? '') : ''));
  if (said === '') return null;
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const stands = (name: string): boolean => name.length > 1 && new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(name)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(said);
  const hit = pool(link.to)
    .filter((k) => k.name.trim() !== '')
    .map((k) => ({ k, n: words(oneLine(k.name)).replace(/[.,;:]+$/u, '') }))
    .sort((a, b) => b.n.length - a.n.length)
    .find(({ n }) => stands(n) || stands(n.replace(COMPANY_END, '')));
  return hit ? { field: link.id, ref: `${link.to}#${hit.k.seq}`, name: hit.k.name } : null;
}

const textField = (l: TellList): FieldDecl | undefined =>
  l.fields.find((f) => f.id === l.title && f.type === 'text') ?? l.fields.find((f) => f.type === 'text' && f.required);
const callsItself = (l: TellList, word: RegExp): boolean => word.test(l.one ?? '') || word.test(l.name);

/** The list an order goes into: one that calls an entry an order, with words to say what is ordered. */
const orderList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => callsItself(l, /\border/i) && textField(l) !== undefined);

/* HOW OFTEN, as a list of money that comes round declares it: weekly and monthly among its values, and required. */
const cadenceOf = (l: TellList): FieldDecl | undefined => l.fields.find((f) => f.type === 'enum' && f.required === true && f.values?.includes('monthly') === true && f.values.includes('weekly'));

/** The ledger: a list with a required amount and a way it moved, in or out, and no cadence (that is Repeating). */
const moneyList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => l.fields.some((f) => f.type === 'money' && f.required) && l.fields.some((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out')) && cadenceOf(l) === undefined);

/** Repeating: a list with a required amount, a way in or out, and how often it comes round. */
const repeatList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => l.fields.some((f) => f.type === 'money' && f.required) && l.fields.some((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out')) && cadenceOf(l) !== undefined);

/** Bills and invoices: a list with a required amount owed one way or the other, to the reader or by them. */
const dueList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => l.fields.some((f) => f.type === 'money' && f.required) && l.fields.some((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me')));

const peopleList = (lists: readonly TellList[]): TellList | undefined => lists.find((l) => l.id === PEOPLE);

/**
 * A LIST A PLAIN LINE CAN GO INTO WITH ITS WORDS ALONE: every field it needs but its title has a default, or is a state
 * it starts in (its first, as `startIn` fills it). A list that needs an amount, a day or a number is not one.
 */
const fillable = (l: TellList, numbers = false): boolean => {
  const title = textField(l);
  return title !== undefined && l.fields.every((f) => !f.required || f.retired || f.default !== undefined || f.id === title.id || (f.type === 'enum' && (f.values?.length ?? 0) > 0) || (numbers && counted(f)));
};

/* A REQUIRED NUMBER IS ONE AN OFFER FILLS AT NOUGHT, as the list's own add box does (`capturedFields`): a goal offered
   for "train for the Cairo half marathon" starts with its aim at nought, for the person to set (AL5). */
const counted = (f: FieldDecl): boolean => f.type === 'int' || f.type === 'decimal';

/** A required state with no default starts in its first, as the list declares them: a new project is Building. */
function startIn(l: TellList, fields: Record<string, TellValue>): void {
  for (const f of l.fields) if (f.required && !f.retired && f.default === undefined && f.type === 'enum' && fields[f.id] === undefined && f.values?.[0]) fields[f.id] = f.values[0];
}

/**
 * THE RECORD'S OWN LISTS AND MONEY'S PARTS OF A WHOLE, which nobody types a line into: Agent runs are the agents' own,
 * a plan is a payment plan, an instalment one part of it, a book a set of accounts, and the rest are kept by the record
 * (AJ8: "train for the Cairo half marathon" was offered to Plans and Agent runs on a Personal that has Goals).
 */
const MONEY_PARTS: ReadonlySet<string> = new Set(['plans', 'installments', 'books', 'snapshots', 'balances', 'fx', 'filing_rules', 'categories', 'accounts']);

/**
 * BY WHOSE THE LIST IS AS WELL AS ITS ID (review i, RI4): on a record without Money, a list he made and called Plans,
 * Books, Categories or Accounts has that id, and "Read Dune next week" was never offered to it. The kernel's own Agent
 * runs go by id, which nobody else can declare.
 */
/* AND THE AGENTS' INSTRUCTIONS (AL5), the kernel's as Agent runs are, which an agent reads and nobody types a line into. */
const neverPlain = (l: TellList): boolean => l.id === 'session' || l.id === 'instructions' || l.pack === 'kernel' || (l.pack === 'money-core' && MONEY_PARTS.has(l.id));

/** Lists a plain line is never put in: People, orders, money and the record's own. */
const plainable = (l: TellList, numbers = false): boolean =>
  l.id !== PEOPLE && !neverPlain(l) && !callsItself(l, /\border/i) && !l.fields.some((f) => f.type === 'money' && f.required) && fillable(l, numbers);

/* The starter's own lists, the ones a person was given with their BrainDog: Personal's Goals before an add-on's. */
const starters = (l: TellList): number => (l.pack?.startsWith('usecase-') ? 1 : 0);

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

/**
 * WHERE SOMEBODY IS KEPT, never offered a line that names nobody (audit 31 Oct m, AM2): "Call the plumber tomorrow" on a
 * blank BrainDog offered Organisations alone. People's own lists, and any list People links a person to (the firm they
 * are with), take a person or a company; Tell names those itself (`MET`, `JOINED`).
 */
const keepsSomebody = (l: TellList, lists: readonly TellList[]): boolean =>
  l.id === PEOPLE || l.pack === PEOPLE || (lists.find((x) => x.id === PEOPLE)?.fields.some((f) => f.type === 'ref' && f.to === l.id) ?? false);

/** The lists a line that fits nowhere is offered to, at most two: those with a day or a state, the starter's own first
    (AL5), then most like things to do. */
const offerLists = (lists: readonly TellList[]): TellList[] =>
  lists
    .filter((l) => plainable(l, true) && !keepsSomebody(l, lists) && (l.fields.some((f) => f.type === 'day') || l.fields.some((f) => f.id === (l.state ?? 'state') && f.type === 'enum')))
    .sort((a, b) => starters(b) - starters(a) || todoScore(b) - todoScore(a))
    .slice(0, 2);

/** The list a new project goes into: one that calls an entry a project. */
const projectList = (lists: readonly TellList[]): TellList | undefined => lists.find((l) => callsItself(l, /^projects?$/i) && textField(l) !== undefined);

/** The list a sprint goes into: one that calls an entry a sprint, a cycle or an iteration, with a day it runs from. */
const cycleList = (lists: readonly TellList[]): TellList | undefined =>
  lists.find((l) => callsItself(l, /^(?:sprints?|cycles?|iterations?)$/i) && textField(l) !== undefined && l.fields.some((f) => f.type === 'day'));

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
/* A SITE'S NAME IS ONE THING, never two clauses at its dot: "Booking.com 900" was "Booking" and "com 900", and no reader saw the platform. */
const CLAUSE = /,(?!\d)|\.(?!\d|(?:com|net|org|io|co|ai|app)\b)|[;!?\n]|\s+(?:and|&)\s+(?=(?:she|he|they|i|we)?\s*(?:paid|pays|sent|transferred|received|got|wants?|ordered|needs?)\b)/iu;
const INTRODUCED = /^(?:(?:hi|hello|hey)\b[\s,.!]*)?(?:i['’]?m|i am|my name is|this is)\s/iu;
const ORDER = /^(?:wants?|would like|ordered|orders|needs?|asked for|is getting|booked|reserved|(?:can|could) (?:i|we) (?:get|have)|i['’]?d like|i would like|i want|i['’]?ll take)\s+(?:to (?:order|get|buy|have)\s+)?/iu;
const PAID = /^(?:paid|pays|sent|transferred)\b\s*/iu;
const GOT = /^(?:received|got)\b\s*/iu;
/* "PAID" WITH NO "ME" GOES EITHER WAY (MC1): "Mark paid 50" may be Mark paying you or you paying Mark. "Stripe paid
   out 1,950 USD" is a payout, never the question (RH1). */
const PAID_ONLY = /^(?:paid|pays)\b(?!\s+(?:me|us|out)\b)/iu;
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
const ACT = /^(?:(?:i|we)\s+)?(?:got paid|paid|pays|spent|sent|transferred|received|got|bought|purchased)\b\s*/iu;
/* "BOUGHT WAX FOR 2,300" IS MONEY OUT, FOR THE WAX (AM8), never "Not sure" with Projects and Organisations offered. Only
   when a figure follows "for": "Bought 3 candles for Salma" is nobody's spending. Read as "I paid 2,300 for wax". */
const BOUGHT = /^(?:(?:i|we)\s+)?(?:bought|purchased|picked up)\s+(.+)\s+for\s+(.+)$/iu;
/* "AT CARREFOUR": the shop it was spent at, by its capital, never a time ("at 3") and never a person (AM8). */
const AT_SHOP = new RegExp(`\\bat\\s+(?:the\\s+)?(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');

/* A greeting or a thanks on its own, as a pasted message opens and closes. */
const PLEASANTRY = /^(?:hi|hello|hey|thanks|thank you|thx|please|ok|okay|cheers)(?:\s+\p{L}+)?$/iu;
const acts = (s: string): boolean => ORDER.test(s) || PAID.test(s) || GOT.test(s);
/* The words around an order's total that say nothing more of it: "total", "not paid yet", "owed". */
const TOTAL_WORDS = /\b(?:the\s+total(?:\s+is)?|total(?:\s+is)?|in\s+all|not\s+paid(?:\s+yet)?|unpaid|still\s+owed|owed|to\s+pay|due)\b/giu;
/* AN ADDRESS KEEPS ITS OWN CASE: a shared link read as "Https://…" is not a thing anybody wrote. */
const capital = (s: string): string => (/^[a-z][a-z0-9+.-]*:\/\//iu.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1));
/* "NEXT", "NEXT DUE", "DUE NEXT" LEFT BESIDE A DAY, the words an answer to "When is it next due?" comes in: "Netflix 180 a
   month, next on the 5th", "next due 5 Nov". The day is read off and these say nothing more (AL4 follow). */
const NEXT_SAID = /(?:^|\s+)(?:(?:it(?:['’]s| is)\s+)?(?:next(?:\s+(?:due|one|payment))?|due\s+next))(?:\s+(?:on|by))?\s*$/iu;
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
/* "...and Dad's is 3 Mar": a birthday said after one, without the word again (RP2). */
const BIRTHDAY_TOO = new RegExp(`^(${NAME})['’]s(?:\\s+is|\\s+on|\\s*:)\\s+(.+)$`, 'u');
/* "Mum's birthday is 14 Nov and Dad's is 3 Mar": two facts about two people in one clause, each read as its own (RP2). */
const TWO_FACTS = new RegExp(`^(${NAME}['’]s\\s.+?)\\s+(?:and|&)\\s+(${NAME}['’]s\\s.+)$`, 'u');
/* "New project: Tallow, a habit tracker app", "New client project: Delta rebrand", "Group project: market research". */
const PROJECT = /^(?:(?:a|my|our)\s+)?(?:new\s+)?(?:(\p{L}+)\s+)?project\s*[:–-]\s*(.+)$/iu;
/* "MRR is 4,200 USD this month": a figure kept an eye on, said with what it is. */
const MEASURE = /^(MRR|ARR|revenue|sales|sign-?ups|users|active users|subscribers|customers|churn|burn|runway|NPS|GMV|DAU|WAU|MAU)\s+(?:is|was|are|were|hit|reached|at|of|=|:)\s+(.+)$/iu;
const SPAN = /\b(?:this|last) (?:month|week|year|quarter)\b|\btoday\b|\bso far\b/giu;
/* "TALLOW HIT 1,000 SIGNUPS" IS A NUMBER FOR TALLOW (AN9), never a task: a name, the word for reaching, a figure and
   what it counts. Case kept on the name, which is told by its capital. */
const HIT = new RegExp(`^(${NAME})\\s+(hit|has hit|reached|has reached|passed|crossed|topped|is at|is now at)\\s+(.+)$`, 'u');
/* WORDS OF WHEN ARE NEVER WHAT A FIGURE COUNTS (RO7): "Sales were 40 yesterday" was a number with the unit "yesterday",
   "MRR is 4,200 now" one with "now". Taken off before the unit is read, as `SPAN` is. */
const WHEN_SAID = /\b(?:right now|now|already|yesterday|tonight|currently|at the moment|still|again)\b/giu;
/* "Karim is at 3pm" is a time, never a number called "Karim pm". */
const CLOCK = /^(?:[ap]\.?m\.?|o['’]clock)$/iu;
/* What a project counts, said after a name that may be somebody's (RO7): "Tallow hit 1,000 signups" is a number,
   "Sara hit 3 meetings" is not. */
const METRIC = /^(?:(?:active|paying|paid|new|monthly|daily|weekly|total)\s+)?(?:sign-?ups|users|subscribers|customers|clients|downloads|installs|followers|stars|sales|orders|pre-?orders|members|visitors|views|readers|listeners|reviews|ratings|students|bookings|backers|supporters|leads|trials|accounts|teams|seats|transactions|mau|dau|wau|mrr|arr|waitlist)$/iu;
/* What a figure counts, said after it: "months", "active users", or a per cent. */
const UNIT = /^%$|^\p{Ll}[\p{L}\p{M}'’-]*(?:\s+\p{Ll}[\p{L}\p{M}'’-]*){0,2}$/u;
/* "MAY RENT 12,000 PAID" WAS PAID (AN7): a figure, what it was for, and "paid" last, never a bill still to pay. */
const PAID_LAST = /^(.*?\d.*?)\s+(?:(?:is|was|has been|have been|already|now|all|fully)\s+)*paid(?:\s+(?:already|off|in full|now))?$/iu;
/* Words before that "paid" that say it is not yet: "to be paid", "not paid". */
/* AND A CONTRACTION, NEVER OR THE FUTURE (RO1): "isn't paid", "never paid", "will get paid" are not paid yet. */
const NOT_YET = /\b(?:not|to be|will be|needs? to be|must be|should be|be|to)$|\b(?:not|never|unpaid|owed?|owes|due|will|gets?|getting|yet)\b|n['’]t\b/iu;
/* WORDS BEFORE "PAID" THAT CHANGE NOTHING (RQ7): "Rent 12,000 just paid" was paid, as "Rent 12,000 paid" was. */
const PAID_ASIDE = /\b(?:just|finally|already|today|now|all|fully|in full|been|has|have|is|was)\b/giu;
/* AND HOW IT WAS PAID, kept for the reader's `METHOD`: "in cash", "by card", "via InstaPay". */
const PAID_HOW = /\b(?:in|by|via|through|with|using|over)\s+(cash|card|bank transfer|transfer|wallet|\p{Lu}[\p{L}\p{M}'’-]*)/u;
/* PART OF IT PAID IS NOT ALL OF IT (RO1): "Rent 12,000 half paid" was all 12,000 paid. How much is asked. */
const PART_PAID = /^(?:half|partly|partially|part|some|mostly|almost|nearly)(?:\s+of\s+it)?$/iu;
/* THE TIME IT WAS FOR, SAID BETWEEN THE FIGURE AND "PAID", IS NO "NOT YET" (RO1): "Rent 12,000 for May paid", "for this
   month", "for Q3" were all paid. Taken off before the words are read, and kept in what it was for. */
const PAID_FOR = new RegExp(`\\s+((?:for\\s+)?(?:(?:the\\s+)?month\\s+of\\s+)?(?:${MONTH}|(?:this|last|next)\\s+(?:month|quarter|year)|q[1-4]|h[12]))$`, 'iu');
/* "INVOICE 1042", "ORDER #57", "BILL NO. 12": a bill, an invoice or an order by its number and nothing else. */
const REF_SAID = /^(order|invoice|inv|bill)\s*(?:#|no\.?|number)?\s*(\p{Nd}+)$/iu;
/* AN OPEN ENTRY SAID PAID BY ITS NAME OR WHOSE IT IS (audit 1 Nov, AP6): "Rent paid", "Salma's order is paid", "Mark the
   electricity bill as paid", "Rent 12,000 just paid". What was paid first, "paid" last, "mark" before it when he says so. */
const MARK_LAST = /^(?:(?:i|we)\s+(?:have\s+|just\s+)?)?(?:mark(?:ed)?\s+)?(.+?)\s+(?:as\s+)?(?:(?:is|was|has been|have been|got|now|just|finally|already|all|fully|been)\s+)*paid(?:\s+(?:already|off|in full|now|up))?$/iu;
/* "I paid the rent", "Paid the electricity bill", "Paid 300 for rent": the act first, what was paid after it. */
const MARK_FIRST = /^(?:(?:i|we)\s+)?(?:just\s+|finally\s+|already\s+)?paid\s+(?:off\s+)?((?:the|my|our)\s+)?(.+)$/iu;
/* "Salma paid 1,500 for her order", "Salma paid for the cake", "Salma has paid": somebody paying what they owe him. */
const WHO_PAID = new RegExp(`^(${NAME})\\s+(?:has\\s+|just\\s+|finally\\s+|already\\s+)?paid(?:\\s+(?:me|us))?(?:\\s+(.+))?$`, 'u');
/* "Salma's order", "salma's cake": whose it is, said first. */
const WHOSE = /^([\p{L}\p{M}'’-]+?)['’]s\s+(.+)$/u;
/* Words that say it is not paid yet, anywhere in the line: no open entry is offered as marked. */
const STILL_OWED = /\b(?:not|never|unpaid|to be|will|needs? to|must|should|yet|owes?)\b|n['’]t\b/iu;
/* What a line calls an entry without naming it: "the order", "the bill", "her invoice", "the payment". */
const MARK_NOUN: Readonly<Record<string, 'order' | 'bill' | 'invoice' | 'any'>> = { order: 'order', bill: 'bill', invoice: 'invoice', inv: 'invoice', payment: 'any', one: 'any', it: 'any' };
/* The most open entries a line may mean before it is too loose to ask which. */
const MARK_MOST = 4;
/* THE WORDS A BILL STILL TO PAY IS SAID WITH, off its name: "Rent 12,000 isn't paid" is "Rent", to pay. */
const NOT_PAID_TAIL = /(?:\s+(?:is|isn['’]t|was|wasn['’]t|has|hasn['’]t|have|haven['’]t|not|never|still|yet|been|be|to|will|won['’]t|get|gets|getting))+\s+paid(?:\s+(?:yet|off|in full))?$|\s+(?:unpaid|not paid)(?:\s+yet)?$/iu;
/* A NUMBER A THING IS KNOWN BY IS NEVER ITS AMOUNT (RO3): "Order 57 paid", "Invoice 1042 paid", "Room 12", "#57", "No. 57".
   A bare "bill" before a figure is its amount ("Electricity bill 850"), unless it opens the line or says "#" or "No.". */
const REF_BEFORE = /(?:^|[^\p{L}])(?:order|invoice|inv|receipt|ref|reference|booking|room)\s*(?:#|no\.?|number)?\s*$|(?:#|(?:^|\s)no\.|(?:^|\s)number)\s*$/iu;
const BILL_HASH = /(?:^|[^\p{L}])bill\s*(?:#|no\.?|number)\s*$/iu;
/**
 * Whether a figure is the number a thing is known by, never an amount (RO3): no currency said with it, digits alone, and
 * right after "order", "invoice", "room", "#" or "No.". `bill` says when a bare "bill" before it counts too: never (a
 * bill's own line, "Bill 850 due Friday"), only when it opens the words ("Bill 1042 paid"), or anywhere, where another
 * figure is said beside it.
 */
function refAt(text: string, a: Amount, bill: 'never' | 'opening' | 'any'): boolean {
  if (a.word !== null || a.thousand || !/^\p{Nd}+$/u.test(a.digits)) return false;
  const before = text.slice(0, a.at);
  if (REF_BEFORE.test(before) || BILL_HASH.test(before)) return true;
  return bill === 'any' ? /(?:^|[^\p{L}])bill\s*$/iu.test(before) : bill === 'opening' ? /^\s*bill\s*$/iu.test(before) : false;
}
/* A SHOP, A SERVICE OR A THING BOUGHT, SAID WITH ITS FIGURE AND NOTHING MORE, WAS SPENT (AN9): "Uber 85", "Coffee 45". */
/* NEVER A PLATFORM THAT PAYS HIM (RO2): "Apple 1,200" or "App Store 1,200 USD" is App Store money coming in as often as
   going out, and "Airbnb 4,500" a host's payout. Which way is asked. The ride and food apps stay spends (23 Oct). */
const SPENT_ON = (lead: string): boolean => !paysHim(lead) && (SERVICE_BRANDS.test(lead) || SERVICES.test(lead) || COMPANIES.test(lead) || /^(?:petrol|fuel|parking|snacks?|takeaway|takeout)$/iu.test(lead));
const RIDES = /^(?:uber|careem|talabat|deliveroo)$/iu;
const MARKETS = /^(?:booking|booking\.com|noon|jumia)$/iu;
const paysHim = (lead: string): boolean => (PROVIDERS.test(lead.trim()) && !RIDES.test(lead.trim())) || MARKETS.test(lead.trim());
/* A COUNT OF THINGS IS NO MONEY ALONE (RO4): "Tickets 40", "Books 3" are asked, unless a currency is said or the figure
   is 100 or more, as a loose bill is. */
const COUNTED = /^(?:tickets?|flights?|books?|classes|lessons?|shoes|clothes)$/iu;
/* WHAT A BUSINESS SELLS AS WELL AS BUYS SAYS NO WAY (RO4, RO6): "Seats 1,200 a month" on a SaaS founder's record, "Ads paid
   300" from AdMob, "Training 15,000" from a trainer. Which way is asked, and none of them is ever somebody. */
const EITHER_WAY = /^(?:seats?|licen[cs]es?|software|saas|cloud|storage|backups?|ads|advertising|marketing|office|accounting|workspace|vpn|analytics|crm|printing|packaging|supplies|inventory|materials|equipment|transport|training|courses?|delivery|shipping)\b/iu;
/* "SPRINT 14 STARTS MONDAY" IS A SPRINT, never a ticket called "Sprint 14 starts" (AM12): a sprint, cycle or iteration
   by its number, when it starts or ends. */
const CYCLE = /^(?:(?:the|our)\s+)?(?:next\s+)?((?:sprint|cycle|iteration)\s+\d{1,4})\s+(starts|begins|kicks off|ends|finishes|wraps up)\b\s*(.*)$/iu;
/* A bill to pay or an invoice to send: "Pay rent 12000 on the 1st", "Electricity bill 850", "Invoice Acme 1,200 USD". */
const PAY = /^(?:(?:i|we)\s+(?:need to|have to|must)\s+)?(?:pay|paying)\s+(?:the\s+|my\s+|our\s+)?/iu;
const INVOICE = new RegExp(`^(?:[Ii]nvoice|[Bb]ill|[Cc]harge)\\s+(${NAME})(?=\\s|$)\\s*`, 'u');
const BILL_WORD = /\b(?:bill|subscription|membership|rent|fees?|insurance|loan|tuition|invoice|instal(?:l)?ment|premium)\b/iu;
/* What a bill is for, said as the first word of "Rent paid 12000": a bill word or a thing a household pays for, never anybody. */
/* AND WHAT A BUSINESS PAYS FOR (AN6): "Hosting 45 USD a month" is a cost that comes round, never "Did Hosting pay you". */
/* ONLY WHAT IS NEVER SOLD BY THE ONE TELLING IT (RO6): seats, licences, software, ads and supplies ask (`EITHER_WAY`). */
const COSTS = 'hosting|web hosting|domains?|servers?|vps|cdn|coworking|co-working|bookkeeping|payroll|utilities|commute|taxes|vat';
const THING_PAID = new RegExp(`^(?:${BILL_WORD.source.slice(2, -2)}|${COSTS}|electricity|electric|water|gas|internet|wifi|broadband|phone|mobile|groceries|petrol|fuel|parking|school|gym|netflix|spotify)\\b`, 'iu');
/* A WORD FOR WORK DONE, said alone, is a thing and nobody (AN6): "Hosting", "Cleaning", "Tutoring", "Marketing". */
/* ONLY THE WORDS FOR WORK, NEVER ANY WORD ENDING IN "ING" (RO8): Meiling, Xiaoling, Sterling and Fleming are people. */
/* AND THE WORDS FOR THINGS AND EVENTS THAT ARE NEVER A NAME (RQ8): "Got 3,000 from Funding", "Wedding 50,000 due Friday". */
const GERUND = /^(?:cleaning|tutoring|hosting|web hosting|consulting|coaching|catering|printing|marketing|accounting|bookkeeping|training|shipping|parking|housekeeping|gardening|plumbing|babysitting|landscaping|painting|editing|advertising|packaging|copywriting|translating|proofreading|filming|recording|engineering|programming|coding|designing|tailoring|ironing|washing|baking|cooking|boarding|grooming|dog walking|moving|banking|billing|invoicing|licensing|branding|recruiting|staffing|outsourcing|freelancing|modelling|modeling|lodging|clothing|flooring|roofing|tiling|wiring|heating|servicing|decorating|plastering|welding|towing|dry cleaning|ticketing|streaming|messaging|wedding|shopping|funding|fundraising|housing|building|morning|evening|something|everything|nothing|bedding|camping|swimming|gaming|hiring|renting|leasing|lending|dining|travelling|traveling|wrapping|packing|posting|mailing|meeting|briefing)$/iu;
const EVERY = /\b(?:a|per|each|every)\s+(month|year|quarter|week)\b|\b(monthly|yearly|annually|quarterly|weekly)\b/iu;
const EVERY_SAID: Record<string, string> = { monthly: 'month', yearly: 'year', quarterly: 'quarter', weekly: 'week' };
const REPEATS: Record<string, string> = { month: 'monthly', monthly: 'monthly', year: 'yearly', yearly: 'yearly', annually: 'yearly', quarter: 'quarterly', quarterly: 'quarterly', week: 'weekly', weekly: 'weekly' };
/* A payout is money in from a platform, never a person or a client: "Stripe paid out 1,950 USD". */
const PAYOUT = /^(?:paid out|pays out|paying out|payout(?:\s+of)?)\b\s*/iu;
/* THE PAYMENT PROVIDERS WHOSE "PAID OUT" IS MONEY IN (RJ5): a platform that holds what he earns and pays it to his bank.
   Anybody else who "paid out" may have paid him or been paid, and is asked about. */
const PROVIDERS = /^(?:stripe|paypal|paddle|gumroad|lemon ?squeezy|shopify|etsy|ebay|amazon|apple|app store|google|google play|adsense|upwork|fiverr|payoneer|wise|square|substack|patreon|youtube|twitch|airbnb|uber|deliveroo|talabat|careem|fawry|paymob|kickstarter|teachable|kajabi|ko-fi|buy me a coffee|tiktok|meta|facebook|instagram)$/iu;
/* "... to my bank", "into our account": the money came to him, whoever paid it out. */
const INTO_MINE = /\b(?:to|into)\s+(?:my|our)\s+(?:bank|account|a\/c|acct|card|wallet|balance|current account|savings)\b/iu;
/* A PLACE OR A COMPANY IS NOBODY (RL7): "tickets to Dubai", "Paid Vodafone 450", "Sent CIB 1,000" each made a person.
   The places and companies a person here pays or goes to, and the words a company's name ends on. */
const PLACES = /^(?:dubai|abu dhabi|sharjah|cairo|giza|alexandria|sharm|sharm el sheikh|hurghada|gouna|el gouna|dahab|luxor|aswan|siwa|sahel|north coast|ain sokhna|sokhna|riyadh|jeddah|mecca|makkah|medina|doha|kuwait|bahrain|manama|muscat|oman|amman|beirut|istanbul|london|paris|rome|milan|madrid|barcelona|berlin|amsterdam|athens|new york|nyc|los angeles|san francisco|toronto|tokyo|bali|bangkok|egypt|uae|saudi|saudi arabia|qatar|lebanon|turkey|greece|italy|spain|france|germany|uk|england|usa|us|america|canada|europe|asia|africa)$/iu;
const COMPANIES = /^(?:vodafone|etisalat|e&|orange|we|telecom egypt|cib|nbe|qnb|hsbc|banque misr|alex bank|adib|aaib|mashreq|emirates nbd|fab|enbd|valu|instapay|vodafone cash|noon|carrefour|spinneys|ikea|jumia|swvl|microsoft|adobe|zoom|slack|notion|figma|github|aws|vercel|cloudflare|openai|anthropic|anghami|shahid|osn|emirates|egyptair|etihad|qatar airways|flydubai|booking|booking\.com|dhl|aramex|fedex|ups|bosta|starbucks|mcdonald['’]?s|kfc)$/iu;
/* THE SERVICES A PERSON PAYS BY THE MONTH OR THE RIDE, for a record that holds none of them yet (RM5): "Paid Netflix 200",
   "Uber 200 due Friday" and "Spotify 60 due Friday" are money out, never a person and never "did Netflix pay you". A
   platform that pays him (Stripe, Upwork, PayPal) is not here: which way its money went is still asked. No word that
   is also a given name ("Max", "Claude"). */
const SERVICE_BRANDS = /^(?:netflix|spotify|apple music|apple tv\+?|apple one|icloud\+?|itunes|app store|apple|amazon|amazon prime|prime video|prime|audible|kindle(?: unlimited)?|google|google one|google play|youtube premium|youtube music|youtube|disney\+?|disney plus|hbo max|hbo|hulu|paramount\+?|peacock|crunchyroll|deezer|tidal|soundcloud|watch it|watchit|yango(?: play)?|starzplay|bein|xbox(?: game pass)?|game pass|playstation(?: plus)?|ps plus|psn|nintendo(?: switch online)?|steam|epic games|dropbox|chatgpt|chatgpt plus|midjourney|canva|grammarly|duolingo|linkedin(?: premium)?|microsoft 365|office 365|onedrive|1password|lastpass|nordvpn|expressvpn|surfshark|uber|uber eats|careem|talabat|deliveroo|instashop|breadfast|elmenus|bolt|lyft|indrive|airbnb|glovo|mrsool|hungerstation|jahez|noon minutes|amazon fresh|tabby|souhoola)$/iu;
const COMPANY_END = /\s(?:bank|telecom|airways|airlines|air|ltd|llc|inc|co|corp|group|hotel|resort|clinic|hospital|pharmacy|school|university|academy|studio|studios|agency|store|shop|market|mall|cafe|restaurant|club|gym)$/iu;
/** Whether a capitalised name reads as somebody: never a place, a company, a provider, a bill, or letters in capitals. */
const readsAsSomebody = (name: string): boolean => {
  const n = name.trim();
  return aName(n) && !GERUND.test(n) && !PLACES.test(n) && !COMPANIES.test(n) && !SERVICE_BRANDS.test(n) && !COMPANY_END.test(n) && !PROVIDERS.test(n) && !THING_PAID.test(n) && !EITHER_WAY.test(n) && !SERVICES.test(n) && !/^\p{Lu}{2,}$/u.test(n);
};
/* WHO A PAST PAYMENT WENT TO, as Tell titles one: "Paid to Halden", "Payout from Stripe", "Groceries at Carrefour". */
const PAID_TITLE = /^(?:paid to|payout from)\s+(.+)$|\s+at\s+(.+)$/iu;
/**
 * THE NAMES THE RECORD ALREADY KEEPS AS NOBODY (RM5): its organisations and accounts, and what its money lists hold (a
 * bill, money that comes round, a subscription, a past payment and who it went to). Each is kept in lower case, and
 * without the word a company's name ends on as well, so "Kiln Studio" kept makes "Paid Kiln 900" nobody new too. The
 * list Tell's own words above cannot know, read off the record.
 */
function heldThings(opts: TellOptions): ReadonlySet<string> {
  const out = new Set<string>();
  const add = (name: string): void => {
    const n = words(oneLine(name)).replace(/[.,;:]+$/u, '');
    if (!n) return;
    out.add(n);
    const bare = n.replace(COMPANY_END, '');
    if (bare && bare !== n) out.add(bare);
  };
  const titled = opts.titled ?? {};
  for (const o of [...(opts.orgs ?? []), ...(opts.accounts ?? [])]) add(o.name);
  /* Where People keeps the company a person is with, by the link it declares, as `contact` finds it. */
  const people = opts.lists.find((l) => l.id === PEOPLE);
  for (const f of people?.fields ?? []) if (f.type === 'ref' && f.to && f.to !== PEOPLE && /org|company|organi[sz]ation/iu.test(`${f.id} ${f.label ?? ''}`)) for (const o of titled[f.to] ?? []) add(o.name);
  for (const l of opts.lists) {
    if (l.id === PEOPLE || !l.fields.some((f) => f.type === 'money' && f.required)) continue;
    for (const { name } of titled[l.id] ?? []) {
      add(name);
      const paid = PAID_TITLE.exec(name.trim());
      if (paid) add(paid[1] ?? paid[2] ?? '');
    }
    /* And the accounts its entries move through. */
    for (const f of l.fields) if (f.type === 'ref' && f.to && f.to !== PEOPLE && f.required && /account/iu.test(`${f.id} ${f.label ?? ''}`)) for (const o of titled[f.to] ?? []) add(o.name);
  }
  return out;
}
/* HIS OWN LISTS OF WHAT HE SELLS (RO4), by id or name: Orders, Products, Services, a menu or a catalogue. */
/* NEVER ORDERS (RQ11): an order's name often holds the client's ("Cake for Salma"), and Salma is nothing he sells. */
const SELLS = /\b(?:products?|services?|menus?|catalog(?:ue)?s?|listings?|offerings?|stock)\b/iu;
/** A name as its words are matched: lower case, one space, and each word without a plural's "s". */
const bare = (name: string): string =>
  oneLine(words(name))
    .replace(/[^\p{L}\p{N}\s'’-]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
/** What the record's Products and Services name, as `bare` says each (RO4): the whole name, and the thing it ends on
    before any "for" or "with" ("Lavender candles" is candles, "Cake for Salma" a cake), never any word inside it, so
    "Coffee 45" is no "Coffee mug" (RQ11). A last word that reads as somebody is left out. */
function soldBy(opts: TellOptions): ReadonlySet<string> {
  const out = new Set<string>();
  for (const l of opts.lists) {
    if (l.id === PEOPLE || !SELLS.test(`${l.id} ${l.name}`)) continue;
    for (const { name } of opts.titled?.[l.id] ?? []) {
      const b = bare(name);
      if (!b) continue;
      out.add(b);
      const thing = oneLine(name).split(/\s+(?:for|to|from|by|with)\s+/iu)[0] ?? '';
      const last = thing.split(/\s+/u).pop() ?? '';
      const noun = bare(last);
      /* Somebody he keeps, or a capital the rest of the name does not have ("Gift box Salma"), is somebody, never a thing. */
      const named = knownAs(last, opts.people ?? []) !== null || (/^\p{Lu}/u.test(last) && /^\p{Ll}/u.test(thing.split(/\s+/u)[1] ?? '') && readsAsSomebody(last));
      if (noun && noun !== b && !named) out.add(noun);
    }
  }
  return out;
}
/* A SERVICE OR A THING PAID FOR, SAID FIRST, IS NOBODY: a phone gives the first word its capital, so "Dentist 800 due
   Monday" asked "Did Dentist pay you" (rl-tell). Who is paid for the work, by what they do, and the work itself. */
const SERVICES = /^(?:dentist|doctor|vet|plumber|electrician|mechanic|carpenter|painter|cleaner|cleaners|cleaning|maid|nanny|babysitter|tutor|tutoring|driver|gardener|hairdresser|barber|salon|haircut|lawyer|accountant|landlord|nursery|daycare|kindergarten|therapist|therapy|physio|physiotherapy|optician|dental|pharmacy|garage|laundry|dry cleaning|car wash|car service|service|repairs?|maintenance|lessons?|classes|course|training|pilates|yoga|swimming|piano|guitar|dance|doorman|security|delivery|shipping|taxi|uber|car|flat|house|groceries|food|coffee|lunch|dinner|tickets?|flights?|hotel|clothes|shoes|books?|medicine|meds|vet bill)$/iu;
/* A word a phone capitalised, said again inside a sentence: "Rent" after "for" is "rent". A brand keeps its capital. */
const saidAsTyped = (s: string): string =>
  /^\p{Lu}\p{Ll}/u.test(s) && !/^(?:netflix|spotify)\b/iu.test(s) && !SERVICE_BRANDS.test(s) && !COMPANIES.test(s) && (THING_PAID.test(s) || EITHER_WAY.test(s) || INCOME_WORD.test(s) || SERVICES.test(s.split(/\s+/u)[0] ?? '')) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
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

/* WHO THE READER PAID, BY NAME (AL2): "Paid Nadia 300 for the logo", "I sent Mum 1,000", "Paid 300 to Nadia". Case kept
   on the name, which is told by its capital. */
const PAID_TO = new RegExp(`^(?:(?:I|i|We|we)\\s+)?(?:[Pp]aid|[Ss]ent|[Tt]ransferred)\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');
/* "to Nadia" only right after the act or the figure ("paid 300 to Nadia", the figure taken out), never after what was
   paid for ("for tickets to Dubai", RL7). */
const TO_SOMEBODY = new RegExp(`^(?:(?:I|i|We|we)\\s+)?(?:(?:[Pp]aid|[Ss]ent|[Tt]ransferred|[Gg]ave)\\s+)?to\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');
/* MONEY THAT CAME IN, SAID WITHOUT A CURRENCY OR A VERB OF PAYING (AL4): "Salary 30,000 came in today", "Refund from
   Amazon 450". A refund said to somebody ("Refund Nadia 300") is the reader paying back, and is not this. */
const CAME_IN = /\b(?:came in|come in|comes in|has come in|arrived|landed|went in|hit (?:my|our|the) account|got paid)\b/iu;
const INCOME_WORD = /^(?:(?:my|our|the)\s+)?(?:salary|wages?|pay ?cheque|paycheck|bonus|refund|dividends?|commission|allowance|pension|rent from)\b/iu;
/* AN INCOME WORD SAYS NO WAY ALONE (RL5): "Wages 12,000 due Friday" may be his staff's, "Bonus for Omar 500" is Omar's.
   It is money in only with a word of arriving, "from ...", or "my"/"our" before it, and never when it is for somebody,
   to somebody, or due. */
const INCOME_MINE = /^(?:my|our)\s/iu;
/* A SALARY, A PAY CHEQUE OR A PENSION SAID ON ITS OWN IS HIS (rl-tell): "Salary 30,000 a month" is money in that comes
   round. Wages may be his staff's and a bonus or an allowance somebody else's, so those are still asked; and "for Omar",
   "to Omar" or "due" still asks, by `INCOME_NOT`. */
const INCOME_OWN = /^(?:salary|pay ?cheque|paycheck|pension)\b/iu;
/* AND ONLY WHEN NOTHING STANDS BETWEEN THE WORD AND THE FIGURE (RN1): "Salary for the team 45,000 every month" and
   "Salary Karim 8,000 a month" are money he pays, and were told as money in. What comes before the figure, a day taken
   off; after it, only a cadence, "from <payer>" or "into my account" may follow. */
const INCOME_OWN_LEAD = /^(?:salary|pay ?cheque|paycheck|pension)(?:\s+of)?[\s:,–-]*$/iu;
/* "for the team", "to staff", "for mum": a lower-case somebody it is for, as well as a capitalised name (RN1). */
const INCOME_FOR = /\b(?:for|to)\s+(?:(?:the|my|our|his|her|their|all|each|every)\s+)?(?:team|staff|employees?|workers?|crew|people|kids|children|family|mum|mom|mother|dad|father|parents|wife|husband|son|daughter|brother|sister|driver|nanny|maid|cleaner|helper|intern|interns|freelancers?|contractors?)\b/iu;
const INCOME_NOT = new RegExp(`\\b(?:[Ff]or|[Tt]o)\\s+(${NAME})(?![\\p{L}\\p{M}'’-])|\\bdue\\b`, 'u');
const CAME_IN_WORDS = /\b(?:came in|come in|comes in|has come in|arrived|landed|went in|hit (?:my|our|the) account|got paid|into (?:my|our) (?:account|bank))\b/giu;
/* A FIGURE SAID AS A TIME is no amount: "Call the bank at 3 tomorrow". */
const TIME_BEFORE = /\b(?:at|around|from|until|till|by)\s*$/iu;

/* "assign to Omar", "assigned to Omar". */
const ASSIGN = new RegExp(`(?:^|[\\s,;])(?:[Aa]ssign(?:ed)?|[Gg]ive it)\\s+(?:it\\s+)?to\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u');
/* A NAME SAID ON ITS OWN BETWEEN COMMAS, or last: "Fix the login bug on Android, Karim, by Tuesday" (AM12). */
const TRAILING_NAME = new RegExp(`,\\s*(${NAME})\\s*(?=[,;]|$)`, 'u');
/* What a ticket is about, said with a capital, that is never anybody: a platform or a device. */
const NOT_SOMEBODY = /^(?:android|ios|iphone|ipad|web|mac|macos|windows|linux|chrome|safari|firefox|desktop|mobile|staging|production|prod|api|ui|ux|urgent|asap|important|priority|high|medium|low|blocked|later|soon|someday|quick|small|big|optional|maybe|p[0-4]|backend|frontend|design|marketing|sales|ops|admin|bug|feature|today|tonight|tomorrow)$/iu;
/* A BANK'S OWN TEXT, as a card alert or an account alert prints it: one of these words, and a currency it names. */
const BANKISH = /\b(?:debited|credited|charged|purchase|withdrawn|withdrawal|deposited|avl\.? ?bal|available balance|card ending|card no|a\/c|acct)\b/iu;
/* The words only a bank prints. With none of them, a sentence that says "purchase" is read as a sentence. */
const BANK_ONLY = /\b(?:debited|credited|avl\.? ?bal|available balance|card ending|card no|a\/c|acct)\b/iu;
/* WHICH WAY A BANK'S TEXT MOVED THE MONEY (RG4). A refund or a reversal is money back, whatever else it names ("Refund
   of EGP 500 credited to your card for your purchase at Amazon"), but only when it is said of the amount kept: before it,
   or as its own verb ("EGP 500 refunded"). "Purchase of EGP 1,250.00 at CARREFOUR. Earn 2% cashback" is the purchase,
   out (RH6). Then money taken from the account is out, even when it is credited to somebody else ("debited from a/c
   XX12 and credited to Ahmed"). A charge, a purchase or a spend is out ("EGP 500 charged to your account ending 12 at
   Netflix"), unless a credit word names the way it went (MB1): "EGP 500 credited to your account for purchase return"
   and "EGP 500 refund for your purchase" are money back. Then money put in is in ("EGP 500 transferred to your a/c
   from Ahmed"). A text that says neither is a card payment, out. */
const BANK_BACK = /\b(?:refund(?:ed)?|reversal|reversed|cashback)\b/iu;
/* "EGP 500 refunded", and the nouns too (RJ4): "EGP 500 refund credited to your card", "EGP 1,250.00 reversal for
   purchase at X". */
const BANK_BACK_AFTER = /^\s*(?:(?:has|have)\s+been\s+|was\s+|were\s+|is\s+)?(?:refunded|reversed|refund|reversal|cashback)\b/iu;
const BANK_TAKEN = /\b(?:debited|withdrawn|withdrawal)\b/iu;
const BANK_SPENT = /\b(?:charged|purchase|spent)\b/iu;
/* "credited" to the reader, never "credited to Ahmed"; a refund, a reversal or a return, wherever it is said. */
const BANK_CREDIT = /\bcredited\b(?!\s+to\s+(?!(?:your|you|a\/c|acct|account|card)\b))|\b(?:refund(?:ed|s)?|reversal|reversed|returns?|returned)\b/iu;
const BANK_IN = /\b(?:credited|deposited|received|incoming)\b|\btransferred to your\b|\bto your (?:a\/c|acct|account)\b/iu;
/* Where one sentence of a bank's text ends: a full stop, a semicolon or a line, never the point inside "1,250.00". */
const SENTENCE_END = /[.;!?\n](?=\s|$)/gu;
/** The sentence of `text` that holds `at` to `end`: "No fees charged" after an incoming amount is no charge of it (RJ4). */
const sentenceOf = (text: string, at: number, end: number): string => {
  let from = 0;
  let to = text.length;
  for (const m of text.matchAll(SENTENCE_END)) {
    const i = m.index ?? 0;
    if (i < at) from = i + 1;
    else if (i >= end) {
      to = i;
      break;
    }
  }
  return text.slice(from, to);
};
/* A CREDIT OF SOMETHING THAT IS NOT THE AMOUNT (review k, RK6): "5% cashback will be credited", "Points credited: 75",
   and a shop's "Free returns within 14 days", none of which is the purchase coming back. */
const CREDIT_OF_OTHER = /\b(?:cash ?back|points?|rewards?|miles|bonus)\b|\bfree returns?\b|\breturns?\s+(?:within|policy|accepted|allowed)\b/iu;
/** Whether a credit word in `sentence` names the way the amount went: in a clause of its own sentence, and not of a
    reward or a shop's returns. */
const creditSaid = (sentence: string): boolean => sentence.split(/[,:;]/u).some((clause) => BANK_CREDIT.test(clause) && !CREDIT_OF_OTHER.test(clause));
/** Whether a bank's text put the money kept (the figure at `at`, `end` past it) into the account. A charge, a purchase or
    a spend is read only in the sentence that holds the amount (RJ4), so "EGP 500 received from Ahmed. No fees charged" is
    in; and so is a credit word that turns one into money back (RK6), so "EGP 500 charged at Noon. 5% cashback will be
    credited to your account" stays out. */
const bankInto = (text: string, at: number, end: number): boolean => {
  if (BANK_BACK.test(text.slice(0, at)) || BANK_BACK_AFTER.test(text.slice(end))) return true;
  if (BANK_TAKEN.test(text)) return false;
  const own = sentenceOf(text, at, end);
  return creditSaid(own) || (!BANK_SPENT.test(own) && BANK_IN.test(text));
};
/* A BALANCE OR A LIMIT IS NO AMOUNT THAT MOVED (RG5): a figure right after its word, joining words and all ("available
   balance is EGP 12,000.00", "Avl Bal after txn: EGP 3,200"), is not the one kept. A figure further on still is (RH12):
   "Your credit limit EGP 50,000 card ending 1234 was charged EGP 500 at X" is the 500. */
/* And the orders banks print it in (RJ8): "Balance available: EGP 45,500", "Bal remaining EGP 3,200". */
const BALANCE_BEFORE = /\b(?:bal(?:ance)?|limit|lmt)\b(?:[\s:.=-]|\b(?:is|of|now|was|after|txn|transaction|available|avail|avl|remaining|left|current)\b)*$/iu;
/* Who the money went to or came from, never the reader's own card or account. */
const PAYEE_END = '(?=\\s+on\\s|\\s+using\\s|\\s+with\\s|\\s+via\\s|\\s+ref\\b|\\s+for\\s|\\s+card\\b|\\.\\s|\\.$|,|;|$)';
const NOT_THEM = '(?!(?:your|you|a\\/c|acct|account|card)\\b)';
const PAYEE = new RegExp(`\\b(?:at|to|from)\\s+${NOT_THEM}(.+?)${PAYEE_END}`, 'iu');
const PAYER = new RegExp(`\\bfrom\\s+${NOT_THEM}(.+?)${PAYEE_END}`, 'iu');

/** "CARREFOUR MAADI" as a person writes it: "Carrefour Maadi". Mixed case is kept as typed. */
const titled = (s: string): string => (/\p{Ll}/u.test(s) ? s : s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()));

/** "A, B or C". */
const orOf = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/* The plain words a card says when nothing fits, each its own. */
const WHY = {
  notSure: 'Not sure where this goes.',
  reads: (kinds: readonly string[]) => (kinds.length === 0 ? '' : ` It reads ${orOf(kinds)}.`),
  noMoney: 'This BrainDog keeps no money yet.',
  /* SAID IN WORDS, never "write its code" (AL8): "Which dinars are they: Algerian, Bahraini, ... or Tunisian?" */
  whichCurrency: (word: string | null, figure: string) => {
    const codes = familyOf(word);
    if (codes.length === 0) return `Which currency is that in? Say it with the figure, like ${figure} US dollars or ${figure} euros.`;
    const typed = word !== null && /^\p{L}+$/u.test(word) && !/^bucks?$/iu.test(word) ? words(word).replace(/s?$/u, 's') : null;
    const plural = typed ?? `${words(CURRENCY_NAME.of(codes[0]!) ?? '').split(' ').pop() ?? 'dollar'}s`;
    const whose = codes.map((c) => (CURRENCY_NAME.of(c) ?? c).split(' ').slice(0, -1).join(' ')).sort((a, b) => a.localeCompare(b, 'en'));
    const like = codes.includes('USD') ? (CURRENCY_NAME.of('USD') ?? '').split(' ').slice(0, -1).join(' ') : whose[0]!;
    return whose.length <= 8
      ? `Which ${plural} are they: ${orOf(whose)}? Say it with the figure, like ${figure} ${whose[0]} ${plural}.`
      : `Which ${plural} are they? Say whose with the figure, like ${figure} ${like} ${plural}.`;
  },
  whichWay: (name: string) => `Did ${name} pay you, or did you pay ${name}?`,
  /* THE OWNER IS NEVER THE PAYEE (AO12): "Paid Nadia 300" on Nadia's own BrainDog paid herself, with no question. */
  selfPaid: (name: string, figure: string) =>
    `You are ${name} here. Was it paid to you, or to somebody else called ${name}? Say got ${figure} if it came to you, or give their full name.`,
  /* A PLAIN LINE THAT SAYS NO WAY, AND NAMES NOBODY (RL5): "Wages 12,000 due Friday". */
  inOrOut: (figure: string) => `Is that money you get, or money you pay? Say which with it, like got ${figure} or paid ${figure}.`,
  /* A NUMBER A THING IS KNOWN BY, AND NO AMOUNT (RO3): "Order 57 paid". */
  howMuch: (what: string) => `How much was paid for ${what}, and which way? Say it like got 1,350 for ${what} or paid 1,350 for ${what}.`,
  /* PART OF IT PAID (RO1): "Rent 12,000 half paid". */
  partPaid: (figure: string, half: string | null, what: string) => `How much of the ${figure} was paid? Say it with the figure, like paid ${half ?? figure}${what ? ` for ${what}` : ''}.`,
  /* ASKED, NEVER GUESSED: money that comes round is kept with the next day it falls on, and no day was said. */
  whenNext: 'When is it next due? Say the day with it, like on the 5th or next Friday.',
  bankNoCurrency: 'That text names no currency, so nothing is kept from it. Paste it as the bank sent it.',
  known: (name: string, list: string) => `${name} is already in ${list}.`,
  /* A LINE THAT NAMES SOMEBODY KEPT, AND FITS NO LIST, IS OFFERED THEIR PAGE (AN9): "Coffee with Mona on Sunday". */
  about: (name: string, more: boolean) => `It names ${name}. Keep it on their page${more ? ', or as one of these:' : '.'}`,
  offer: 'Or keep it as one of these:',
  /* "NEW PROJECT: …" WHERE NO PROJECTS ARE KEPT (AP7): never a task called "New project: …". */
  noProjects: 'This BrainDog keeps no projects yet.',
  /* TWO OPEN ENTRIES THE LINE COULD MEAN (AP6). */
  whichPaid: 'Which one was paid?',
  /* WITH NOTHING TO OFFER BUT A TO-DO LIST (AO7), "one of these" over one button. */
  offerTodo: 'Or keep it as a to-do:',
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
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|St)\./gu, '$1')
    /* "Invoice no. 1042 paid" is one clause, never "Invoice no" and "1042 paid" (RQ9). */
    .replace(/\b(no)\.(?=\s*#?\p{Nd})/giu, '$1');
  /* "1,000 Kuwaiti dinars" is KWD 1,000, never the record's own currency beside a word (AL8). */
  text = namedCodes(text);

  /* A self-introduction names the reader, who is never a new person: "I'm Mariam, Nadia wants..." reads from Nadia. */
  if (INTRODUCED.test(text)) text = hear(text).bio || text;
  const people = peopleList(opts.lists);
  /* AN AMOUNT IS SPELLED AS `Money` SPELLS IT, by the one writer against the record's home currency: "$1,350" on a
     dollar record, never the stored "USD 1,350.00" this said before, which no other screen shows. IN A SENTENCE, SO A
     ROUND AMOUNT HAS NO ".00" (audit j, AJ11): the preview said "$4,200.00 USD" and "EGP 12,000.00" over rows Bills
     then drew "EGP 850"; pence that are not round are still said. */
  const home = opts.home === undefined ? homeCurrency() : opts.home;
  const held = opts.held ?? moneyCurrencies();
  /* A CURRENCY THAT IS NOT HOME IS SAID BY ITS OWN SIGN, "$4,200", "CA$900", "€50", where every screen writes "$4,200 USD"
     beside a column of the home's (AL8): a sentence names one amount, and the sign the runtime gives each currency is
     its alone. Kept as written when that sign is the home's own ("$" on a Canadian record) or is only letters. */
  const spelled = (amount: number, currency: string): string => {
    const text = symbolText(money(amount, currency), home, 'sentence');
    const tail = new RegExp(`[\\s\\u00a0\\u202f]${currency}$`, 'u');
    const sign = signSaid(currency);
    const narrow = symbolOf(currency);
    if (!tail.test(text) || !narrow || /^[A-Za-z]+$/u.test(sign) || (home !== null && (signSaid(home) === sign || symbolOf(home) === sign))) return text;
    const body = text.replace(tail, '');
    const i = body.indexOf(narrow);
    return i === -1 ? text : `${body.slice(0, i)}${sign}${body.slice(i + narrow.length)}`;
  };
  const room = (n: number): boolean => rows.length + n <= MOST;
  /* A NAME THE RECORD KEEPS AS NOBODY IS NOBODY NEW (RM5): somebody, by the words above, and not one of its companies,
     accounts, bills, subscriptions or past payees. Somebody in People is found before this is asked. */
  const things = heldThings(opts);
  const somebody = (name: string): boolean => readsAsSomebody(name) && !things.has(words(name.trim()));
  /* WHAT HE SELLS, BY HIS OWN LISTS (RO4): the names his Products or Services hold, or the thing each ends on, without its
     plural, so "Candles 300" where he sells lavender candles is never money he spent. */
  const sold = soldBy(opts);
  const sells = (name: string): boolean => {
    const said = bare(name);
    return said !== '' && sold.has(said);
  };

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
  /* What the line says of somebody kept, offered on their entry (`keptOn`). */
  let change: TellChange | null = null;
  /* Two or more open entries a line marking one paid could mean (AP6): which is asked. */
  let which: NonNullable<Told['which']> | null = null;
  /* A birthday was read, so "Dad's is 3 Mar" after it is one too (RP2). */
  let bornSaid = false;
  /* The bank's own text named no currency: never kept in the record's. */
  let bankBare = false;
  /* An amount said with no currency to put to it, on a record with none or a word that is several. */
  let noCurrency = false;
  /* The word that was several ("dinars") and the figure said with it, for the question asked in words (AL8). */
  let unsureWord: { word: string | null; figure: string } | null = null;
  const unsureIn = (a: Amount, currency: string | null): boolean => {
    if (currency !== null) return false;
    unsureWord ??= { word: a.word, figure: a.digits };
    return true;
  };
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
  /* Somebody new said to have "paid", with no "me": which way the money went is asked, and nobody is made (MC1). */
  let whichWay: string | null = null;
  /* A plain money line that names nobody and says no way (RL5): which way is asked, with the figure it said. */
  let inOrOut: string | null = null;
  /* The reader named as the one paid (AO12): asked, never kept as paying themself. */
  let selfPaid: { name: string; figure: string } | null = null;
  /* Money that comes round was read with no day it next falls on: the day is asked, and the entry waits for it. */
  let whenNext = false;
  /* "Order 57 paid": the line named what was paid by its number and said no amount (RO3). How much is asked. */
  let howMuch: string | null = null;
  /* "Rent 12,000 half paid": part of it was paid (RO1). How much is asked, with half of it as the example. */
  let partPaid: { figure: string; half: string | null; what: string } | null = null;

  /** Somebody kept, made in this sentence, shared by two, or a name that reads as a person: never a platform or a shop. */
  const isSomebody = (name: string): boolean =>
    knownAs(name, opts.people ?? []) !== null || sharedBy(name, opts.people ?? []) || made.has(words(name)) || somebody(name);
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
  /* AND WHERE NO PROJECTS ARE KEPT, STARTING THEM IS OFFERED (AP7), with the thing named properly where it could go. */
  const unkept = projectList(opts.lists) ? null : noProjects();
  if (unkept !== null) return unkept;

  /* AN OPEN BILL, INVOICE OR ORDER SAID PAID BY ITS NAME OR WHOSE IT IS IS MARKED, never paid a second time (AP6). */
  if (markNamed()) return finish();

  const message = FROM_MESSAGE.exec(text);
  if (message && aName(message[1]!)) subject = message[1]!;
  if (message && subject) text = text.slice(message[0].length);

  for (const piece of text.split(CLAUSE)) {
    const whole = oneLine(piece ?? '');
    if (!whole || PLEASANTRY.test(whole)) continue;
    let c = whole;
    const bought = BOUGHT.exec(c);
    if (bought && amountsIn(bought[2]!, opts.currency, held)[0]?.at === 0) c = `I paid ${bought[2]!} for ${bought[1]!}`;
    const self = SPENT.test(c);
    if (!self && contact(c)) continue;
    /* A name or "she" opens a clause only before an act, so "Buy more wax" is nobody called Buy. */
    let someone = false;
    const opener = SUBJECT.exec(c);
    const after = opener ? c.slice(opener[0].length).trim() : '';
    /* A BILL OR A THING PAID IS NOBODY (RG6). A phone gives the first word its capital, so "Rent paid 12000" and
       "Electricity paid 850" opened on a "person" who paid 12,000 in. It is money out, for the rent. */
    if (opener && !knownAs(opener[1]!, opts.people ?? []) && THING_PAID.test(opener[1]!) && PAID.test(after)) {
      if (readMoney(`${after} ${opener[1]!}`, null, false)) placed = true;
      else left.push(whole);
      continue;
    }
    /* "ADS PAID 300" MAY BE ADMOB PAYING HIM (RO6): a word for what is sold as well as bought, or one of his own things
       for sale, before "paid" is asked which way, never money out and never "Did Ads pay you". */
    const either = opener && !knownAs(opener[1]!, opts.people ?? []) && PAID.test(after) && (EITHER_WAY.test(opener[1]!) || sells(opener[1]!)) ? amountsIn(after, opts.currency, held)[0] : undefined;
    if (either) {
      askWay(whole, either, null);
      continue;
    }
    const opened = opener !== null && aName(opener[1]!) && (acts(after) || PAYOUT.test(after));
    /* A NAME BEFORE A BARE "PAID" IS ASKED ABOUT (MC1): "Mark paid 50" made a person Mark who paid 50 in, when the
       50 may have gone to Mark. It reads in only for somebody on the record, somebody who ordered in this sentence, or
       a line that says "paid me". */
    const name = opener?.[1] ?? '';
    /* AND SO IS ONE WHO "PAID OUT" WHO IS NO PAYMENT PROVIDER (RJ5): "Ahmed paid out 300 for the delivery" saved 300 in,
       "Payout from Ahmed". Stripe paying out, or anybody paying out into his account, is still the payout. */
    const askedOut = PAYOUT.test(after) && !PROVIDERS.test(name.trim()) && !INTO_MINE.test(after);
    /* A PAYMENT PROVIDER THAT "PAID" PAID HIM (AN8): "Upwork paid 3,000" is money in, never asked. */
    if (opened && !PROVIDERS.test(name.trim()) && (PAID_ONLY.test(after) || askedOut) && amountsIn(after, opts.currency, held).length > 0 && !knownAs(name, opts.people ?? []) && !sharedBy(name, opts.people ?? []) && !ordered.has(words(name))) {
      whichWay ??= name;
      /* Said back as left too (RH13), so an order placed beside it ("14 mugs for Lina, Mark paid 50") never saves as
         though the 50 were never said. */
      left.push(whole);
      continue;
    }
    if (opened) {
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
    /* "PAID OUT" WITH NOBODY NAMED IS MONEY OUT (RG16): "Paid out 300 to the cleaner" went to the cleaner. A payout is
       one a platform named in the clause paid, or one called a payout. */
    /* "PAID OUT 1,950 USD FROM STRIPE" IS STRIPE'S PAYOUT, in (RH11): a platform named after "from", with nobody it went to. */
    /* ONLY A PAYMENT PROVIDER, OR ANYBODY INTO HIS OWN ACCOUNT, AND NEVER ONE OF HIS OWN ACCOUNTS (RJ5): "Paid out 500 from
       Revolut for the plumber" is his account paying the plumber, out; "Paid out 1,950 USD from Stripe to my bank" is
       Stripe's payout, in, where "to" made it money out. "Paid out" from anybody else is money out of his, as RG16 reads
       it with nobody named. */
    const platform = PAYOUT.test(c) && !opened && (!/\bto\s/iu.test(c) || INTO_MINE.test(c)) ? FROM.exec(c) : null;
    const mine = platform !== null && ownAccount(platform[1]!);
    if (platform && aName(platform[1]!) && !mine && (PROVIDERS.test(platform[1]!.trim()) || INTO_MINE.test(c))) {
      const rest = oneLine(`${c.slice(0, platform.index)} ${c.slice(platform.index + platform[0].length)}`);
      if (payout(rest.replace(PAYOUT, ''), platform[1]!)) continue;
      left.push(whole);
      continue;
    }
    if (PAYOUT.test(c) && !opened && !/^payout\b/iu.test(c)) {
      /* FROM ONE OF HIS OWN ACCOUNTS, the account is the way it went out ("via Revolut"), never a name in the words. */
      if (mine && platform) c = oneLine(`${c.slice(0, platform.index)} via ${platform[1]!} ${c.slice(platform.index + platform[0].length)}`);
      if (readMoney(c.replace(PAYOUT, 'paid ').replace(/^paid\s+(.*?)\s+to\s+/iu, 'paid $1 for '), null, false)) placed = true;
      else left.push(whole);
      continue;
    }
    if (PAYOUT.test(c)) {
      if (payout(c.replace(PAYOUT, ''), opened ? subject : null)) continue;
      left.push(whole);
      continue;
    }
    if (!self && !acts(c) && (measure(c) || cycle(c) || loan(c) || paidLast(c) || income(c) || spentOn(c) || bill(c))) continue;
    /* A DAY SAID ON ITS OWN after what it is the day of was read with it: "Invoice Acme 1,200 USD, due in 14 days". */
    if (placed && takeDay(c, opts.today).day !== null && trimWords(takeDay(c, opts.today).rest.replace(NEXT_SAID, '').replace(/^(?:due|by|on)$/iu, '')) === '') continue;
    /* AND THE DAY A LOAN COMES BACK, said after it: "Borrowed 300 from Sara, pay back by Friday". */
    if (loaned && takeDay(c, opts.today).day !== null && BACK_SAID.test(trimWords(takeDay(c, opts.today).rest))) continue;
    const forSomebody = !self && !acts(c) ? FOR_SOMEBODY.exec(c) : null;
    if (forSomebody && aName(forSomebody[2]!)) {
      const before = rows.length;
      subject = forSomebody[2]!;
      if (room(2)) personOf(subject);
      /* The day may sit outside the order's words, as a label before it: "Firing on Thursday: 14 mugs for Lina". */
      const around = oneLine(`${c.slice(0, forSomebody.index)} ${c.slice(forSomebody.index + forSomebody[0].length)}`);
      if (readOrder(forSomebody[1]!.trim(), subject, around)) {
        ordered.add(words(subject));
        continue;
      }
      rows.length = before;
      for (const [name, at] of made) if (at >= before) made.delete(name);
    }
    if (!self && !acts(c)) {
      /* WHAT IS SAID OF SOMEBODY JUST MET is theirs: "Met Lina from Acme, interested in a pilot". */
      if (metRow !== null && amountsIn(c, opts.currency, held).length === 0) notes.set(metRow, [...(notes.get(metRow) ?? []), capital(trimWords(c))]);
      else left.push(whole);
      continue;
    }
    const from = FROM.exec(c);
    if (from && aName(from[1]!)) subject = from[1]!;
    const order = ORDER.exec(c);
    /* WHAT SOMEBODY JUST MET WANTS, ON A RECORD THAT KEEPS NO ORDERS, IS SAID OF THEM (AM12): "Met Hana from
       Brightside, wants a demo" left "wants a demo" unplaced. */
    if (order && !self && metRow !== null && !orderList(opts.lists) && amountsIn(c, opts.currency, held).length === 0) {
      notes.set(metRow, [...(notes.get(metRow) ?? []), capital(trimWords(c))]);
      continue;
    }
    if (order && !self && subject) ordered.add(words(subject));
    /* Made as soon as named, with room kept for what they did, so a full preview never ends on a person alone. */
    const before = rows.length;
    /* ONLY SOMEBODY IS MADE A PERSON (AN8): "Got 3,000 from Upwork" offered Upwork, new in People. A platform, a company
       or a shop who paid is named on the money, and made nobody. */
    if (subject && !self && room(2) && isSomebody(subject)) personOf(subject);

    const done = order && !self ? readOrder(c.slice(order[0].length), subject) : readMoney(c, self ? null : subject, someone && !subject);
    if (!done) {
      /* A clause that placed nothing leaves no one behind: "Nadia paid 0" is no new Nadia. */
      rows.length = before;
      for (const [name, at] of made) if (at >= before) made.delete(name);
      left.push(whole);
    } else placed = true;
  }

  return finish(unsure);

  /** A day as the preview says it, said as a date when the clause it came from said one as a date (AO18). One date
      said in a line never turns another clause's "due Friday" into "due 9 Oct" (RQ12). */
  function dayTold(day: string, clause: string = sentence): string {
    return dayWord(day, opts.today, DATE_SAID.test(clause));
  }

  /** The person's address and notes put on, and with nothing placed, one task, or the plain word and the way on. */
  function finish(unsureOf = false): Told {
    for (const email of emails) addressOf(email);
    for (const [at, said] of notes) {
      const row = rows[at];
      const note = people ? pick(people, 'text', /note/, (f) => f.id !== people.title) : undefined;
      if (row && note && said.length > 0) row.fields[note.id] = said.join('. ');
    }
    if (bankBare) return { rows, left, why: WHY.bankNoCurrency };
    if (selfPaid !== null) return { rows, left, why: WHY.selfPaid(selfPaid.name, selfPaid.figure) };
    if (whichWay !== null) return { rows, left, why: WHY.whichWay(whichWay) };
    if (inOrOut !== null) return { rows, left, why: WHY.inOrOut(inOrOut) };
    if (howMuch !== null) return { rows, left, why: WHY.howMuch(howMuch) };
    if (partPaid !== null) return { rows, left, why: WHY.partPaid(partPaid.figure, partPaid.half, partPaid.what) };
    if (whenNext) return { rows, left, why: WHY.whenNext };
    if (noMoney && !placed) return { rows, left: [], why: WHY.noMoney, needsMoney: true };
    if (noCurrency && !placed) return { rows, left, why: WHY.whichCurrency(unsureWord?.word ?? null, unsureWord?.figure ?? '300') };
    if (which !== null && !placed && rows.length === 0) return { rows, left: [], which };
    if (change !== null && !placed && rows.length === 0) return { rows, left: [], change };
    if (known !== null && !placed && rows.length === 0) return { rows, left: [], why: WHY.known(known, people?.name ?? 'People') };
    if (placed || unsureOf || noMoney) return { rows, left, ...(change ? { change } : {}) };

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
    const them = people ? keptNamed() : null;
    if (them && people) return { rows, left: [], why: WHY.about(them.name, offers.length > 0), about: { name: them.name, href: `/r/${people.id}/${them.seq}` }, ...(offers.length > 0 ? { offers } : {}) };
    const kinds = [
      ...(order ? [anA(order.one ?? 'order').toLowerCase()] : []),
      ...(people ? ['somebody you met'] : []),
      ...(dueList(opts.lists) ? ['a bill with its amount and day', 'money lent or borrowed'] : []),
      ...(moneyList(opts.lists) || dueList(opts.lists) ? ['money paid or got', "a bank's text"] : []),
      ...(projectList(opts.lists) ? ['a new project'] : []),
    ];
    /* NO LIST FOR THINGS TO DO AT ALL (AO7): Personal's "Run 10k on Saturday morning" is offered a to-do list too, as a
       blank BrainDog is given one, and keeps its day once the list is there (`todo-on.ts`). */
    return {
      rows,
      left: [],
      why: `${WHY.notSure}${WHY.reads(kinds)}${offers.length > 0 ? ` ${WHY.offer}` : opts.lists.some((l) => l.pack === 'work') ? '' : ` ${WHY.offerTodo}`}`,
      ...(offers.length > 0 ? { offers } : {}),
      ...(opts.lists.some((l) => l.pack === 'work') ? {} : { needsTodo: true as const }),
    };
  }

  /** Somebody in People the sentence names, by a capitalised name in it, whole or by its first word. */
  function keptNamed(): Known | null {
    for (const m of text.matchAll(new RegExp(NAME, 'gu'))) {
      const ws = m[0].split(/\s+/u);
      for (let k = ws.length; k >= 1; k--) {
        const p = knownAs(ws.slice(0, k).join(' '), opts.people ?? []);
        if (p) return p;
      }
    }
    return null;
  }

  /** The whole sentence as one entry of a plain list: its words, the day it names, who it is given to. */
  function plainRow(l: TellList | undefined, withPeople = true): TellRow | null {
    if (!l) return null;
    const what = textField(l);
    if (!what) return null;
    let rest = text;
    /* WHO IT IS GIVEN TO: "assign to Omar", or a name said on its own after a comma (AM12): "Fix the login bug on
       Android, Karim, by Tuesday" kept ", Karim" in the title and gave it to nobody. Somebody the record knows, or a
       name that reads as a person, never a place, a company or a day. */
    const ownerField = withPeople ? pick(l, 'ref', /owner|assign|who|person/, (f) => f.to === PEOPLE) : undefined;
    const assignedSaid = ASSIGN.exec(rest);
    const trailing = !(assignedSaid && aName(assignedSaid[1]!)) ? TRAILING_NAME.exec(rest) : null;
    /* A TRAILING NAME THE RECORD KEEPS AS SOMETHING ELSE IS THAT, NEVER A PERSON (RN2): "Fix the login bug, Roomy" on a
       record with a project Roomy made a person Roomy and gave her the task. Somebody in People comes first; then a
       project, an organisation or any entry a list keeps, linked where this list links to that one, and otherwise
       left in the title. */
    const inPeople = trailing ? knownAs(trailing[1]!, opts.people ?? []) !== null : false;
    const kept = trailing && !inPeople ? keptAs(trailing[1]!) : null;
    const keptTo = kept?.list?.id;
    const keptLink = keptTo ? l.fields.find((f) => f.type === 'ref' && f.to === keptTo && !f.retired) : undefined;
    const assigned =
      assignedSaid && aName(assignedSaid[1]!)
        ? assignedSaid
        : ownerField && trailing && !kept && (inPeople || (somebody(trailing[1]!) && !NOT_SOMEBODY.test(trailing[1]!))) && !ownAccount(trailing[1]!)
          ? trailing
          : null;
    const owner = assigned && ownerField ? ownerField : undefined;
    if (owner && assigned) rest = oneLine(`${rest.slice(0, assigned.index)}${assigned === trailing ? '' : ' '}${rest.slice(assigned.index + assigned[0].length)}`);
    else if (kept && keptLink && trailing) rest = oneLine(`${rest.slice(0, trailing.index)}${rest.slice(trailing.index + trailing[0].length)}`);
    const { day, rest: undated, part } = takeDay(rest, opts.today);
    const due = day ? pick(l, 'day', /due|^by$|deadline|aim|target/, (f) => f.deadline === true || said(f, /due|^by$/)) : undefined;
    /* THE TIME OF DAY IS KEPT WHERE THE LIST HAS A FIELD FOR IT, and otherwise goes with the day: never in the name. */
    const at = due && day && part ? timeField(l, part) : undefined;
    let title = trimWords((due ? undated : rest).replace(/\s*[,;]\s*(?=[,;]|$)/gu, '')).replace(/\s+(?:due|by|on)$/iu, '');
    if (title.length > 80) title = trimWords(title.split(CLAUSE)[0] ?? title);
    const fields: Record<string, TellValue> = { [what.id]: capital(title || text) };
    if (due && day) fields[due.id] = day;
    if (at && part) fields[at.id] = part;
    startIn(l, fields);
    for (const f of l.fields) if (f.required && !f.retired && f.default === undefined && fields[f.id] === undefined && counted(f)) fields[f.id] = 0;
    if (kept && keptLink) fields[keptLink.id] = `${keptTo}#${kept.seq}`;
    /* THE CLIENT IT IS FOR, NAMED ANYWHERE IN ITS WORDS (work 1.23.0, 2 Nov): "Send Fenwick's invoice" on a record that
       keeps Fenwick as an organisation is Fenwick's, and the words stay as typed. Only where the list links to the
       organisations and nothing above linked it already. */
    const forClient = clientFor(l, fields);
    if (forClient) fields[forClient.field] = forClient.ref;
    let who: string | null = null;
    if (owner && assigned) {
      const ref = personOf(assigned[1]!);
      if (ref !== null) {
        fields[owner.id] = ref;
        who = assigned[1]!;
      }
    }
    const bits = [
      `new in ${l.name}`,
      ...(due && day ? [`due ${partTold(dayTold(day), at && part ? part : null)}`] : []),
      ...(who ? [`for ${who}`] : []),
      /* A CLIENT IS WHO IT IS FOR, a project where it is: "for Acme", "in Kiln". */
      ...(kept && keptLink ? [`${/client/iu.test(`${keptLink.id} ${keptLink.label ?? ''}`) ? 'for' : 'in'} ${kept.name}`] : []),
      ...(forClient ? [`for ${forClient.name}`] : []),
    ];
    return { register: l.id, fields, said: String(fields[what.id]), detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) };
  }

  /** The entry a list other than People keeps by this name, Projects first, then organisations, then any other list:
      by its whole name, or by its name without the word a company's ends on ("Brightside" for "Brightside Ltd"). */
  function keptAs(name: string): { list: TellList | null; seq: number; name: string } | null {
    const said = words(oneLine(name));
    const same = (n: string): boolean => {
      const w = words(oneLine(n)).replace(/[.,;:]+$/u, '');
      return w === said || w.replace(COMPANY_END, '') === said || said.replace(COMPANY_END, '') === w;
    };
    const titled = opts.titled ?? {};
    const project = projectList(opts.lists);
    const orgList = orgsList();
    const order = [...(project ? [project] : []), ...(orgList && orgList !== project ? [orgList] : []), ...opts.lists.filter((x) => x !== project && x !== orgList && x.id !== PEOPLE)];
    for (const list of order) {
      const pool = [...(titled[list.id] ?? []), ...(list === orgList ? (opts.orgs ?? []) : [])];
      const hit = pool.find((k) => same(k.name));
      if (hit) return { list, seq: hit.seq, name: hit.name };
    }
    /* An organisation kept where no list of them is read is still nobody, though nothing links to it. */
    const org = !orgList ? (opts.orgs ?? []).find((k) => same(k.name)) : undefined;
    return org ? { list: null, seq: org.seq, name: org.name } : null;
  }

  /** The client an entry's words name (`clientNamed`), against the organisations and the entries this record keeps. */
  function clientFor(l: TellList, fields: Record<string, TellValue>): { field: string; ref: string; name: string } | null {
    const orgs = orgsList()?.id ?? 'organisations';
    return clientNamed(l, fields, (to) => [...(opts.titled?.[to] ?? []), ...(to === orgs ? (opts.orgs ?? []) : [])]);
  }

  /** The list People links a person's company to, where it keeps organisations. */
  function orgsList(): TellList | undefined {
    const f = people?.fields.find((x) => x.type === 'ref' && x.to !== undefined && x.to !== PEOPLE && /org|company|organi[sz]ation/iu.test(`${x.id} ${x.label ?? ''}`));
    return f ? opts.lists.find((x) => x.id === f.to && textField(x) !== undefined) : opts.lists.find((x) => callsItself(x, /^organi[sz]ations?$|^companies$/i) && textField(x) !== undefined);
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
    /* TWO BIRTHDAYS IN ONE LINE ARE TWO (RP2): "Mum's birthday is 14 Nov and Dad's is 3 Mar" offered Mum's alone and
       dropped Dad's. Each is read as its own, and a second that is no fact about anybody is said back as not placed. */
    const two = /[Bb]irthday/u.test(c) || bornSaid ? TWO_FACTS.exec(c) : null;
    if (two) {
      if (!contact(two[1]!)) return false;
      if (!contact(two[2]!)) left.push(oneLine(two[2]!));
      return true;
    }
    const met = MET.exec(c);
    const joined = met ? null : JOINED.exec(c);
    /* "Dad's is 3 Mar" after a birthday is one only when it says a day: "Salma's is ready" is nobody's birthday. */
    const too = met || joined || !bornSaid ? null : BIRTHDAY_TOO.exec(c);
    const born = met || joined ? null : (BIRTHDAY.exec(c) ?? (too && takeDay(too[2]!, opts.today).day !== null ? too : null));
    const name = met?.[2] ?? joined?.[1] ?? born?.[1];
    if (!name || !aName(name)) return false;
    if (born) bornSaid = true;
    if (knownAs(name, opts.people ?? [])) {
      subject = name;
      /* A BIRTHDAY OF SOMEBODY KEPT IS STILL KEPT, among the dates, where the record keeps them (AN9), and on them where
         it keeps none: offered as a change to their note. */
      if (born && birthday(name, born[2]!)) return true;
      if (born && keptOn(knownAs(name, opts.people ?? [])!, born[2]!)) return true;
      /* A FULL PREVIEW NEVER SENDS A DATE TO THE NOTE (RP2): where dates are kept and no room is left, it is said back. */
      if (born && datesList() && !room(1)) {
        left.push(oneLine(c));
        return true;
      }
      known = name;
      return true;
    }
    if (!room(1)) return false;
    /* THE COMPANY SOMEBODY MET IS FROM IS THEIR ORGANISATION, where the record keeps them (AM12): "Met Hana from
       Brightside" dropped Brightside. One already kept is linked by its whole name; a new one comes before her, so her
       link points back at it. Where no organisations are kept, it is said in her note. */
    const company = met?.[3] ?? null;
    /* A PLACE IS WHERE THEY ARE FROM, NEVER AN ORGANISATION (RN6): "Met Lina from Dubai" made one called Dubai. It is
       said in her note. */
    const place = company !== null && PLACES.test(company.trim());
    const orgField = company && !place ? people.fields.find((f) => f.type === 'ref' && f.to !== undefined && f.to !== PEOPLE && /org|company|organi[sz]ation/iu.test(`${f.id} ${f.label ?? ''}`)) : undefined;
    const orgs = orgField ? opts.lists.find((l) => l.id === orgField.to && textField(l) !== undefined) : undefined;
    let orgRef: TellValue | null = null;
    if (company && orgs && knownAs(name, opts.people ?? []) === null && !made.has(words(name)) && room(2)) {
      /* Found by its whole name or its bare one (RN6): "Brightside Ltd" kept is "Brightside" said, and the other way. */
      const bare = (n: string): string => words(oneLine(n)).replace(/[.,;:]+$/u, '').replace(COMPANY_END, '');
      const kept = [...(opts.orgs ?? []), ...(opts.titled?.[orgs.id] ?? [])].find((o) => words(o.name) === words(company) || bare(o.name) === bare(company));
      if (kept) orgRef = `${orgs.id}#${kept.seq}`;
      else {
        const fields: Record<string, TellValue> = { [textField(orgs)!.id]: company };
        rows.push({ register: orgs.id, fields, said: company, detail: `new in ${orgs.name}`, icon: iconOf(orgs), missing: missingOf(orgs, fields) });
        orgRef = { $row: rows.length - 1 };
      }
    }
    const ref = personOf(name);
    /* Nobody made, so no company made for them either. */
    if ((ref === null || typeof ref !== 'object') && orgRef !== null && typeof orgRef === 'object' && '$row' in orgRef) rows.splice(orgRef.$row, 1);
    if (ref === null || typeof ref !== 'object' || !('$row' in ref)) return ref !== null;
    subject = name;
    placed = true;
    metRow = ref.$row;
    const said: string[] = [];
    const role = met?.[1] ?? joined?.[2];
    if (role) said.push(`Your ${role}`);
    const row = rows[ref.$row];
    if (row && orgField && orgRef !== null) {
      row.fields[orgField.id] = orgRef;
      row.detail = `${row.detail}, from ${company}`;
    } else if (company) said.push(`From ${company}`);
    /* THE BIRTHDAY IS SAID WITH THEM (AN9): it went into their note, and the card said only "Mum, new in People". */
    if (born) {
      said.push(`Birthday ${trimWords(born[2]!)}`);
      if (row) row.detail = `${row.detail}, birthday ${trimWords(born[2]!)}`;
      birthday(name, born[2]!);
    }
    const rest = trimWords(oneLine(takeDay(met?.[4] ?? joined?.[3] ?? '', opts.today).rest).replace(/^(?:the\s+)?team\b/iu, ''));
    if (rest) said.push(capital(rest));
    if (said.length > 0) notes.set(ref.$row, said);
    return true;
  }

  /** "Mum's birthday is 14 Nov" for Mum, already in People, on a record with no dates: offered on her note. */
  function keptOn(them: Known, when: string): boolean {
    const day = takeDay(when, opts.today).day;
    const note = people ? pick(people, 'text', /note/, (f) => f.id !== people.title) : undefined;
    /* WHERE A LIST OF DATES IS KEPT, A BIRTHDAY GOES THERE OR NOWHERE (RP2): room in the preview never decides it. */
    if (!people || !note || day === null || datesList()) return false;
    if (change !== null && (change.mark || change.register !== people.id || [change, ...(change.also ?? [])].some((k) => k.seq === them.seq))) return false;
    const [, m = 1, d = 1] = day.split('-').map(Number);
    const on = `${d} ${capital(MONTHS[m - 1]!)}`;
    const one: TellChange = { register: people.id, seq: them.seq, name: them.name, field: note.id, line: `Birthday ${on}`, ask: `Add ${on} as ${them.name}'s birthday?`, done: `Added ${on} as ${them.name}'s birthday`, already: `${them.name}'s birthday is already ${on}.` };
    if (change === null) {
      change = one;
      return true;
    }
    /* A SECOND BIRTHDAY IN THE LINE IS OFFERED WITH THE FIRST (RP2), one press keeping each on its own person. */
    const also = [...(change.also ?? []), one];
    const all = [change, ...also];
    const dayOf = (k: TellChange): string => k.line.replace(/^Birthday\s+/u, '');
    const said = all.map((k, i) => `${dayOf(k)} as ${k.name}'s${i === 0 ? ' birthday' : ''}`);
    const joined = `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]!}`;
    change = { ...change, also, ask: `Add ${joined}?`, done: `Added ${joined}`, already: all.map((k) => `${k.name}'s birthday is already ${dayOf(k)}.`).join(' ') };
    return true;
  }

  /** The list of dates a birthday goes into, coming round every year: one with a title, a day it falls on, and a way
      it comes round that says yearly. Undefined where there is none. */
  function datesList(): TellList | undefined {
    return opts.lists.find((x) => x.id !== PEOPLE && !neverPlain(x) && textField(x) !== undefined && !x.fields.some((f) => f.type === 'money' && f.required) && x.fields.some((f) => f.type === 'day' && f.required) && x.fields.some((f) => f.type === 'enum' && f.values?.includes('yearly')));
  }

  /** "Mum's birthday is 14 Nov" among the record's dates, coming round every year, where it keeps a list of them: one
      with a title, a day it falls on, and a way it comes round that says yearly. False where there is none. */
  function birthday(name: string, when: string): boolean {
    const l = datesList();
    const day = takeDay(when, opts.today).day;
    if (!l || day === null || !room(1)) return false;
    const title = `${name}'s birthday`;
    const fields: Record<string, TellValue> = { [textField(l)!.id]: title };
    const on = l.fields.find((f) => f.type === 'day' && f.required)!;
    fields[on.id] = day;
    const round = l.fields.find((f) => f.type === 'enum' && f.values?.includes('yearly'));
    if (round) fields[round.id] = 'yearly';
    const kind = l.fields.find((f) => f.type === 'enum' && f.values?.includes('event') && f !== round);
    if (kind) fields[kind.id] = 'event';
    startIn(l, fields);
    rows.push({ register: l.id, fields, said: title, detail: [`${dayTold(day, when)}, every year`, `new in ${l.name}`].join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
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

  /** "New project: Kitchen renovation" on a record that keeps no projects (AP7): starting Projects is offered, and the
      lists it could go into now, with its name and never "New project:" in it. `null` when the line is no such thing. */
  function noProjects(): Told | null {
    const m = PROJECT.exec(text);
    const [name = ''] = m ? m[2]!.split(/,\s*|\.\s+|\s+[–-]\s+/u) : [];
    const title = capital(trimWords(name));
    if (!m || !title) return null;
    text = title;
    const seen = new Set<string>();
    const offers = [taskList(opts.lists, opts.capture), ...offerLists(opts.lists)].flatMap((l) => {
      if (!l || seen.has(l.id) || keepsSomebody(l, opts.lists)) return [];
      seen.add(l.id);
      const row = plainRow(l, false);
      return row ? [row] : [];
    });
    const two = offers.slice(0, 2);
    return { rows: [], left: [], why: `${WHY.noProjects}${two.length > 0 ? ` ${WHY.offer}` : ''}`, needsProjects: true, ...(two.length > 0 ? { offers: two } : {}) };
  }

  /**
   * "RENT PAID", "SALMA'S ORDER IS PAID", "RENT 12,000 JUST PAID" (AP6): an open bill, invoice or order the line names by
   * its name, or by whose it is, is offered as marked paid, "Mark Rent (due 5 Nov) paid?", never paid a second time. Two
   * that it could mean are asked about, each its own press. A figure said that is not what the one entry comes to keeps
   * the payment, with marking the entry offered beside it. False when no open entry fits, and the line reads as before.
   */
  function markNamed(): boolean {
    const pool = (opts.open ?? []).filter((e) => {
      const l = opts.lists.find((x) => x.id === e.register);
      return l !== undefined && markKind(l) !== null && paidStateOf(l) !== null;
    });
    if (pool.length === 0) return false;
    const line = text.replace(/[.!]+$/u, '');
    if (STILL_OWED.test(line)) return false;
    const said = takeDay(line, opts.today).rest;
    let owner: string | null = null;
    /* Somebody paying what they owe him: only an entry owed to him is theirs to pay. */
    let fromThem = false;
    let thing: string;
    /* "Rent paid" is no Rent paying him: only somebody pays what they owe. */
    const named = WHO_PAID.exec(said);
    const who = named && isSomebody(named[1]!) ? named : null;
    const last = who ? null : MARK_LAST.exec(said);
    const first = who || last ? null : MARK_FIRST.exec(said);
    if (who) {
      owner = who[1]!;
      thing = who[2] ?? '';
      fromThem = true;
    } else if (last) thing = last[1]!;
    /* "Paid Nadia 300" is paying Nadia, never her bill marked: what follows a bare "paid" must read as nobody. */
    else if (first && (first[1] || !/^\p{Lu}/u.test(first[2]!) || !isSomebody(first[2]!.split(/\s+/u)[0] ?? ''))) thing = first[2]!;
    else return false;
    /* A NUMBER IT IS KNOWN BY is the numbered reading's ("Order 57 paid"); more than one figure is no one entry. */
    const found = amountsIn(thing, opts.currency, held);
    if (found.length > 1 || found.some((x) => refAt(thing, x, 'opening'))) return false;
    const a = found[0];
    if (a) thing = oneLine(`${thing.slice(0, a.at)} ${thing.slice(a.at + a.text.length)}`);
    const how = PAID_HOW.exec(thing);
    if (how) thing = thing.replace(how[0], ' ');
    thing = trimWords(oneLine(thing.replace(PAID_FOR, ' ').replace(PAID_ASIDE, ' ')))
      .replace(/^(?:for|on)\s+/iu, '')
      .replace(/^(?:the|my|our|her|his|their|this|that)\s+/iu, '')
      .replace(/['’]s$/u, '');
    const whose = owner === null ? WHOSE.exec(thing) : null;
    if (whose) {
      owner = capital(whose[1]!);
      thing = whose[2]!.replace(/^(?:the|my|our)\s+/iu, '');
    }
    const ws = bare(thing).split(' ').filter(Boolean);
    if (ws.length > 4) return false;
    const noun = MARK_NOUN[ws[ws.length - 1] ?? ''];
    if (noun !== undefined) ws.pop();
    const kind = noun ?? 'any';
    let core = ws.join(' ');
    /* A NAME ALONE IS WHOSE IT IS: "Salma paid" is her order or her invoice, never a bill called Salma. */
    if (owner === null && core !== '' && /^\p{Lu}/u.test(thing) && (knownAs(thing, opts.people ?? []) !== null || pool.some((e) => e.by !== undefined && knownAs(thing, [byOf(e.by)]) !== null))) {
      owner = thing;
      core = '';
      fromThem = !/^(?:(?:i|we)\s+)?mark/iu.test(said);
    }
    if (owner === null && core === '' && kind === 'any') return false;
    const listOf = (e: Open): TellList => opts.lists.find((x) => x.id === e.register)!;
    const hasWord = (name: string, w: string): boolean => ` ${bare(name)} `.includes(` ${bare(w)} `);
    const ownerSeq = owner === null ? undefined : knownAs(owner, opts.people ?? [])?.seq;
    const fits = pool.filter((e) => {
      const k = markKind(listOf(e));
      if (kind === 'order' && k !== 'order') return false;
      if ((kind === 'bill' || kind === 'invoice') && k !== 'bill') return false;
      if (kind === 'invoice' && e.toMe === false && !/invoice/iu.test(e.name)) return false;
      if (fromThem && e.toMe === false) return false;
      if (owner !== null) {
        const by = e.by === undefined ? null : byOf(e.by);
        const theirs = (by !== null && ((ownerSeq !== undefined && by.seq === ownerSeq) || (by.name !== '' && knownAs(owner, [by]) !== null))) || hasWord(e.name, owner.split(' ')[0]!);
        if (!theirs) return false;
      }
      return core === '' || hasWord(e.name, core);
    });
    if (fits.length === 0 || fits.length > MARK_MOST) return false;
    /* WHAT IT COMES TO, AS SAID: one of several that comes to the figure is the one. */
    const currency = a ? (a.currency ?? opts.currency) : null;
    const minorSaid = a && currency ? minor(a, currency) : null;
    const same = (e: Open): boolean => minorSaid !== null && e.amount !== undefined && e.amount.currency === currency && e.amount.amount === minorSaid;
    const sized = a ? fits.filter(same) : [];
    const chosen = sized.length === 1 ? sized : fits;
    if (chosen.length > 1) {
      const marks = chosen.map((e) => markOf(e, owner, false));
      /* Two buttons that read the same say what each comes to as well. */
      const twice = (m: TellChange): boolean => marks.filter((x) => x.label === m.label).length > 1;
      which = { ask: WHY.whichPaid, marks: marks.map((m, i) => (twice(m) && chosen[i]!.amount ? { ...m, label: `${m.label}, ${spelled(chosen[i]!.amount!.amount, chosen[i]!.amount!.currency)}` } : m)) };
      return true;
    }
    const it = chosen[0]!;
    const differs = a !== undefined && it.amount !== undefined && !same(it);
    const mark = markOf(it, owner, differs);
    /* A FIGURE THAT IS NOT WHAT IT COMES TO is still kept as paid, and marking the entry is offered beside it. */
    if (differs) {
      change = { ...mark, ask: `Or ${mark.ask.charAt(0).toLowerCase()}${mark.ask.slice(1)}` };
      return false;
    }
    change = mark;
    return true;
  }

  /** Who an open entry is linked to, named from People where the record sent only their number. */
  function byOf(by: Known): Known {
    return by.name !== '' ? by : { seq: by.seq, name: (opts.people ?? []).find((p) => p.seq === by.seq)?.name ?? '' };
  }

  /** The offer to mark one open entry paid, said by its name, or whose it is, the day it is due, and what it comes to when
      the line said another figure: "Mark Rent (due 5 Nov) paid?", "Mark Salma's order (3 vanilla jars, due Friday) paid?". */
  function markOf(e: Open, owner: string | null, differs: boolean): TellChange {
    const l = opts.lists.find((x) => x.id === e.register)!;
    const to = paidStateOf(l)!;
    const state = l.fields.find((f) => f.id === l.state)!;
    const word = (state.labels?.[to] ?? to).toLowerCase();
    const noun = markKind(l) === 'order' ? words(l.one ?? 'order') : e.toMe === true || /invoice/iu.test(e.name) ? 'invoice' : 'bill';
    const name = oneLine(e.name);
    const called = owner !== null ? `${owner}'s ${noun}` : name || capital(noun);
    const due = e.due ? `due ${dayWord(e.due, opts.today, true)}` : '';
    const bits = [...(owner !== null && name !== '' ? [name] : []), ...(due ? [due] : []), ...(differs && e.amount ? [spelled(e.amount.amount, e.amount.currency)] : [])];
    const full = bits.length > 0 ? `${called} (${bits.join(', ')})` : called;
    return {
      register: l.id,
      seq: e.seq,
      name: name || capital(called),
      field: state.id,
      line: to,
      ask: `Mark ${full} ${word}?`,
      done: `Marked ${called} ${word}`,
      mark: true,
      shut: { states: [...(l.done ?? [])], paid: `${capital(called)} is already ${word}.`, other: `${capital(called)} isn't open any more.` },
      label: [name || capital(called), ...(due ? [due] : [])].join(', '),
    };
  }

  /** "MRR is 4,200 USD this month", "Runway is 9 months", "Tallow hit 1,000 signups": a figure, kept among the numbers,
      with what it counts (AN9) and the project it is for, where the record keeps that project. */
  function measure(c: string): boolean {
    const l = numberList(opts.lists);
    if (!l || !room(1)) return false;
    const m = MEASURE.exec(c);
    const hit = m ? null : HIT.exec(c);
    if (!m && !hit) return false;
    /* A DAY OR A TIME SAID WITH IT IS NEVER ITS UNIT (RO7), AND THE DAY IS KEPT AS ITS WHEN (RQ10): "Sales were 40
       yesterday" is yesterday's, read before the words of when go, so "yesterday" is the day and never dropped. */
    const dated = takeDay((m ? m[2]! : hit![3]!).replace(SPAN, ' '), opts.today);
    const phrase = dated.rest.replace(WHEN_SAID, ' ');
    const [a, ...more] = amountsIn(phrase, opts.currency, held);
    if (!a || more.length > 0) return false;
    /* WHAT IT COUNTS IS KEPT WITH IT (AN9): "Runway is 9 months" was "Runway, 9". */
    const after = trimWords(oneLine(phrase.slice(a.at + a.text.length)));
    if (CLOCK.test(after)) return false;
    const unit = UNIT.test(after) ? after : '';
    const project = hit ? hit[1]! : null;
    if (project !== null && (unit === '' || unit === '%' || trimWords(phrase.slice(0, a.at)) !== '' || knownAs(project, opts.people ?? []) !== null || !aName(project))) return false;
    const titleField = textField(l)!;
    const projects = projectList(opts.lists);
    const kept = project !== null ? keptAs(project) : null;
    /* A NAME THAT MAY BE SOMEBODY GETS A NUMBER ONLY AS A PROJECT (RO7): "Sara is at 3 meetings" and "Sara hit 3 meetings"
       are no number. A project kept, or a name that reads as nobody, is; and a name nobody keeps yet only with what a
       project counts, so "Tallow hit 1,000 signups" is still Tallow's. */
    const asProject = kept !== null && projects !== undefined && kept.list === projects;
    if (project !== null && !asProject && somebody(project) && (/^is\b/iu.test(hit![2]!) || !METRIC.test(unit))) return false;
    const thing = kept && projects && kept.list === projects ? l.fields.find((f) => f.type === 'ref' && f.to === projects.id && !f.retired) : undefined;
    const fields: Record<string, TellValue> = { [titleField.id]: m ? (/^[a-z]/u.test(m[1]!) ? capital(m[1]!) : m[1]!) : thing ? capital(unit) : `${project} ${unit}` };
    if (thing && kept) fields[thing.id] = `${projects!.id}#${kept.seq}`;
    let shown: string;
    const sum = l.fields.find((f) => f.type === 'money');
    const currency = a.currency;
    const amount = currency ? minor(a, currency) : null;
    if (sum && currency && amount !== null) {
      fields[sum.id] = { amount, currency };
      shown = spelled(amount, currency);
    } else {
      const value = l.fields.find((f) => f.type === 'decimal');
      const n = numberOf(a.digits, a.thousand);
      if (!value || n === null || (a.word !== null && currency === null)) return false;
      fields[value.id] = n;
      shown = n.toLocaleString('en-GB');
      if (m && unit !== '') {
        shown = unit === '%' ? `${shown}%` : `${shown} ${unit}`;
        const unitField = l.fields.find((f) => f.type === 'text' && f.id !== titleField.id && said(f, /unit/));
        if (unitField) fields[unitField.id] = unit;
        else fields[titleField.id] = `${String(fields[titleField.id])} (${unit})`;
      }
    }
    const source = l.fields.find((f) => f.type === 'enum' && f.values?.includes('typed'));
    if (source) fields[source.id] = 'typed';
    /* A day gone is kept at its midday, so it reads as that day in any zone; today is the figure as it is now. */
    const whenField = dated.gone !== null && dated.gone !== opts.today ? (l.fields.find((f) => f.type === 'instant' && !f.retired && said(f, /^at$|when|date/)) ?? l.fields.find((f) => f.type === 'day' && !f.retired)) : undefined;
    if (whenField && dated.gone) fields[whenField.id] = whenField.type === 'instant' ? `${dated.gone}T12:00:00.000Z` : dated.gone;
    const whenSaid = whenField && dated.gone ? [dated.gone === addDays(opts.today, -1) ? 'yesterday' : dayTold(dated.gone, c)] : [];
    const name = m ? String(fields[titleField.id]).replace(/\s\([^)]*\)$/u, '') : `${project} ${unit}`;
    rows.push({ register: l.id, fields, said: `${name}, ${shown}`, detail: [`new in ${l.name}`, ...whenSaid, ...(thing && kept ? [`for ${kept.name}`] : [])].join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** "Sprint 14 starts Monday": a sprint, named, on the day it starts or ends (AM12). */
  function cycle(c: string): boolean {
    const m = CYCLE.exec(c);
    const l = cycleList(opts.lists);
    if (!m || !l || !room(1)) return false;
    const { day, rest } = takeDay(m[3] ?? '', opts.today);
    if (day === null || trimWords(rest).replace(/^(?:on|at|from|by)$/iu, '') !== '') return false;
    const ends = /^(?:ends|finishes|wraps up)$/iu.test(m[2]!);
    const when = ends ? /end|finish/ : /start|begin|from/;
    const field = l.fields.find((f) => f.type === 'day' && said(f, when));
    if (!field) return false;
    const name = capital(oneLine(m[1]!).toLowerCase());
    const fields: Record<string, TellValue> = { [textField(l)!.id]: name, [field.id]: day };
    startIn(l, fields);
    rows.push({ register: l.id, fields, said: name, detail: [`${ends ? 'ends' : 'starts'} ${dayTold(day, c)}`, `new in ${l.name}`].join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /**
   * Money that comes round, in Repeating: what, which way, how much, how often, and the next day it falls on when one
   * was said. No day said is named in `missing`, never guessed.
   */
  function repeating(l: TellList, k: { value: MoneyValue; into: boolean; what: string; day: string | null; every: string; payer: TellValue | null; clause?: string }): boolean {
    const often = cadenceOf(l);
    const cadence = REPEATS[k.every];
    if (!often || !cadence || !often.values?.includes(cadence) || !room(1)) return false;
    const fields: Record<string, TellValue> = {};
    const title = textField(l);
    if (title) fields[title.id] = k.what;
    const way = l.fields.find((f) => f.type === 'enum' && f.values?.includes('in') && f.values.includes('out'));
    if (way) fields[way.id] = k.into ? 'in' : 'out';
    const sum = pick(l, 'money', /^amount$/, (f) => f.required === true);
    if (sum) fields[sum.id] = k.value;
    fields[often.id] = cadence;
    const next = pick(l, 'day', /next|due/, (f) => f.required === true) ?? l.fields.find((f) => f.type === 'day' && said(f, /next|due/));
    if (next && k.day) fields[next.id] = k.day;
    /* NO DAY SAID IS ASKED ONLY WHERE THE LIST CANNOT KEEP IT WITHOUT ONE (AO5): where Repeating keeps a line with its
       next day open, it is added so, and the preview says the day is not set. Never a day made up. */
    if (next && !k.day && next.required === true && next.default === undefined) whenNext = true;
    const open = next !== undefined && !k.day && next.required !== true && next.default === undefined;
    const party = pick(l, 'ref', /party|who/, (f) => f.to === PEOPLE);
    if (party && k.payer !== null) fields[party.id] = k.payer;
    startIn(l, fields);
    /* THE NEXT DAY SAID AS A PERSON SAYS IT (AM23): "due tomorrow" for money out, "next on 1 Nov" for money in, never
       "next tomorrow". */
    const when = (d: string): string => (dayTold(d, k.clause) === 'today' || dayTold(d, k.clause) === 'tomorrow' ? dayTold(d, k.clause) : `on ${dayTold(d, k.clause)}`);
    const bits = [`${spelled(k.value.amount, k.value.currency)} ${k.into ? 'in' : 'out'} every ${EVERY_SAID[cadence] ?? k.every}`, ...(k.day ? [`${k.into ? 'next' : 'due'} ${when(k.day)}`] : open ? ['next day not set'] : []), `in ${l.name}`];
    rows.push({ register: l.id, fields, said: k.what, detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** "Salary 30,000 came in today", "Refund from Amazon 450": money in, said without a verb of paying (AL4). */
  function income(c: string): boolean {
    if (!INCOME_WORD.test(c) && !CAME_IN.test(c)) return false;
    const worded = INCOME_WORD.test(c);
    if (/^(?:(?:[Mm]y|[Oo]ur|[Tt]he)\s+)?[Rr]efund\s+\p{Lu}/u.test(c)) return false;
    const dated = takeDay(c, opts.today);
    const [a, ...more] = amountsIn(dated.rest, opts.currency, held);
    if (!a || more.length > 0 || TIME_BEFORE.test(dated.rest.slice(0, a.at))) return false;
    /* "3 boxes arrived" is no money: with no word like salary, nothing but where it came from is said after the figure. */
    if (!worded && a.word === null && !/^(?:from\b.*)?$/iu.test(oneLine(dated.rest.slice(a.at + a.text.length).replace(CAME_IN_WORDS, ' ')))) return false;
    /* NO WORD OF ARRIVING, NO "FROM", NO "MY": the way is asked, never taken from the word (RL5). */
    if (!CAME_IN.test(c)) {
      const not = INCOME_NOT.exec(c);
      /* His own salary only with nothing but the figure, a cadence, "from <payer>" or his own account said (RN1). */
      const after = oneLine(dated.rest.slice(a.at + a.text.length).replace(EVERY, ' ').replace(INTO_MINE, ' ').replace(/\bfrom\s+.*$/iu, ' ')).replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/gu, '');
      const own = INCOME_OWN.test(c) && INCOME_OWN_LEAD.test(dated.rest.slice(0, a.at)) && after === '';
      if (not || INCOME_FOR.test(c) || !(/\bfrom\s/iu.test(c) || INCOME_MINE.test(c) || own)) return askWay(c, a, not?.[1] && aName(not[1]) ? undated(not[1]).name : nameBefore(dated.rest.slice(0, a.at)));
    }
    if (!moneyList(opts.lists) && !dueList(opts.lists)) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= unsureIn(a, currency);
      left.push(c);
      return true;
    }
    const rest = oneLine(`${dated.rest.slice(0, a.at)} ${dated.rest.slice(a.at + a.text.length)}`).replace(CAME_IN_WORDS, ' ');
    const from = FROM.exec(rest);
    const party = from && aName(from[1]!) ? from[1]! : null;
    const named = trimWords(oneLine(rest.replace(EVERY, ' ')).replace(/^(?:my|our)\s+/iu, ''));
    const what = capital(named) || (party ? `From ${party}` : 'Money in');
    /* Somebody who paid it is a person; a shop or a platform that refunded it is only named. */
    const payer = party && (knownAs(party, opts.people ?? []) !== null || somebody(party)) && !ownAccount(party) ? personOf(party) : null;
    /* "My salary 30,000 a month" comes round: Repeating, money in, where the record keeps it. */
    const every = EVERY.exec(c);
    const r = every ? repeatList(opts.lists) : undefined;
    if (every && r) return repeating(r, { value: { amount, currency }, into: true, what, day: dated.day !== null && dated.day > opts.today ? dated.day : null, every: words(every[1] ?? every[2] ?? ''), payer, clause: c });
    /* AND WHERE THE RECORD KEEPS NO REPEATING, money in that comes round is an invoice to come in that repeats, as a bill
       that repeats is one to pay, never one payment made today. */
    const owed = every ? dueList(opts.lists) : undefined;
    if (every && owed && room(1)) {
      const repeats = REPEATS[words(every[1] ?? every[2] ?? '')];
      const day = dated.day !== null && dated.day > opts.today ? dated.day : null;
      const fields: Record<string, TellValue> = {};
      const title = textField(owed);
      if (title) fields[title.id] = what;
      const sum = pick(owed, 'money', /^amount$/, (f) => f.required === true);
      if (sum) fields[sum.id] = { amount, currency };
      const way = owed.fields.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') && f.values.includes('owed_by_me'));
      if (way) fields[way.id] = 'owed_to_me';
      const due = pick(owed, 'day', /due/, (f) => f.deadline === true || said(f, /due/));
      if (due && day) fields[due.id] = day;
      if (due && !day && due.required === true && due.default === undefined) whenNext = true;
      const stateField = owed.fields.find((f) => f.id === (owed.state ?? 'state') && f.type === 'enum');
      if (stateField && stateField.default === undefined && stateField.values?.includes('open')) fields[stateField.id] = 'open';
      const repeat = repeats ? owed.fields.find((f) => f.type === 'enum' && f.values?.includes(repeats) && f.values.includes('none')) : undefined;
      if (repeat && repeats) fields[repeat.id] = repeats;
      const party = pick(owed, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
      if (party && payer !== null) fields[party.id] = payer;
      const bits = [`${spelled(amount, currency)} in`, ...(day ? [`due ${dayTold(day, c)}`] : []), ...(repeats ? [`every ${EVERY_SAID[repeats] ?? repeats}`] : []), `in ${owed.name}`];
      rows.push({ register: owed.id, fields, said: what, detail: bits.join(', '), icon: iconOf(owed), missing: missingOf(owed, fields) });
      placed = true;
      return true;
    }
    return keepMoney({ value: { amount, currency }, into: true, party, payer, by: null, day: dated.gone, what, said: `${spelled(amount, currency)} in, ${what.charAt(0).toLowerCase()}${what.slice(1)}` });
  }

  /** The day words a clause said, as written, to say again after its figure, or nothing when it named no day. */
  /* A FUNCTION, NOT A CONST (audit 31 Oct o, AO1): `paidLast` and `spentOn` are hoisted and run before the reader's
     `return finish(...)` above, so a const declared down here was not yet there when they called it. */
  function dayText(c: string): string {
    return takeDay(c, opts.today).day !== null ? (DAY.exec(c)?.[0] ?? '') : '';
  }

  /** "May rent 12,000 paid": money out, already paid, for what it names (AN7). Somebody named first is asked which way. */
  function paidLast(c: string): boolean {
    const dated = takeDay(c, opts.today);
    const m = PAID_LAST.exec(dated.rest);
    if (!m || NOT_YET.test(m[1]!.trim())) return false;
    /* "RENT 12,000 FOR MAY PAID" WAS PAID (RO1): the time it was for, after the figure, is taken off and kept in its name. */
    const time = PAID_FOR.exec(m[1]!);
    const timed = time !== null && /\d/u.test(m[1]!.slice(0, time.index)) ? time : null;
    const lead = timed ? m[1]!.slice(0, timed.index) : m[1]!;
    const forWhen = timed ? (/^(?:for|this|last|next)\b/iu.test(timed[1]!) ? timed[1]! : `for ${timed[1]!}`) : '';
    const found = amountsIn(lead, opts.currency, held);
    const figures = found.filter((x) => !refAt(lead, x, 'opening'));
    /* "ORDER 57 PAID" SAYS NO AMOUNT (RO3): 57 is the order, never EGP 57 out. How much, and which way, is asked, unless the
       record holds that order open: then marking it paid is offered. */
    if (figures.length === 0 && found.length > 0) {
      if (found.length === 1 && !timed && markPaid(lead, found[0]!)) return true;
      if (!moneyList(opts.lists) && !dueList(opts.lists)) noMoney = true;
      else howMuch ??= capital(trimWords(lead));
      left.push(c);
      return true;
    }
    const [a, ...more] = figures;
    if (!a || more.length > 0 || TIME_BEFORE.test(lead.slice(0, a.at))) return false;
    /* PART OF IT PAID IS ASKED (RO1): "Rent 12,000 half paid". A "not" or a "will" anywhere was no payment (`NOT_YET`). */
    const between = trimWords(lead.slice(a.at + a.text.length));
    if (PART_PAID.test(between)) {
      const n = numberOf(a.digits, a.thousand);
      if (!moneyList(opts.lists) && !dueList(opts.lists)) noMoney = true;
      else partPaid ??= { figure: a.digits, half: n === null ? null : (n / 2).toLocaleString('en-GB'), what: saidAsTyped(trimWords(lead.slice(0, a.at))) };
      left.push(c);
      return true;
    }
    /* ANY OTHER WORD BEFORE "PAID" STILL SAYS IT WAS PAID (RQ7): "Rent 12,000 just paid", "today", "in cash", "via InstaPay".
       The words that change nothing go, how it was paid is kept for the reader, and anything else stays in its name. */
    const how = PAID_HOW.exec(between);
    const by = how ? (/^cash$/iu.test(how[1]!) ? 'by cash' : how[0]) : '';
    const aside = trimWords(oneLine((how ? between.replace(how[0], ' ') : between).replace(PAID_ASIDE, ' ')));
    const what = trimWords(oneLine(`${lead.slice(0, a.at)} ${aside}`));
    /* A salary or a wage "paid" may be his or his staff's: the income reader asks. */
    if (what === '' || INCOME_WORD.test(what)) return false;
    /* Seats, ads, a platform that pays him, or something he sells, "paid", may have paid him (RO2, RO6). */
    if (EITHER_WAY.test(what) || paysHim(what) || sells(what)) return askWay(c, a, null);
    const who = nameBefore(what);
    if (who !== null) return askWay(c, a, who);
    const from = rows.length;
    if (readMoney(oneLine(`paid ${a.text} for ${what} ${by} ${dayText(c)}`), null, false)) {
      placed = true;
      /* The time it was for goes back on its name, after what it was for: "Rent for May". */
      if (forWhen !== '')
        for (const r of rows.slice(from)) {
          const l = opts.lists.find((x) => x.id === r.register);
          const t = l ? textField(l) : undefined;
          const named = t ? r.fields[t.id] : undefined;
          if (!t || typeof named !== 'string' || words(named) !== words(what)) continue;
          r.fields[t.id] = `${named} ${forWhen}`;
          r.said = `${r.said} ${forWhen}`;
        }
    } else left.push(c);
    return true;
  }

  /** "Invoice 1042 paid" where the record holds invoice 1042 open: offered as marking it paid, as its own Mark paid does. */
  function markPaid(lead: string, a: Amount): boolean {
    const ref = REF_SAID.exec(trimWords(lead));
    if (!ref || ref[2] !== a.digits || change !== null) return false;
    const noun = /^inv$/iu.test(ref[1]!) ? 'invoice' : ref[1]!.toLowerCase();
    /* AN ORDER IS ON A LIST OF ORDERS, a bill or an invoice on Bills and invoices or one like it, never the Ledger (RQ3). */
    const kind = noun === 'order' ? 'order' : 'bill';
    const listOf = (e: Open): TellList | undefined => opts.lists.find((l) => l.id === e.register && markKind(l) === kind);
    const fits = (opts.open ?? []).filter((e) => listOf(e) !== undefined);
    /* KNOWN BY THE NUMBER IT IS KEPT UNDER FIRST (RQ1), and else by a name that starts with it ("Invoice 1042"), never by a
       count in its name ("3 vanilla jars" is no order 3). One, or none is offered. */
    const bySeq = fits.filter((e) => String(e.seq) === a.digits);
    const byName = fits.filter((e) => namedAs(e.name, kind, a.digits));
    const it = bySeq.length === 1 ? bySeq[0]! : bySeq.length === 0 && byName.length === 1 ? byName[0]! : null;
    const l = it ? listOf(it) : undefined;
    const to = l ? paidStateOf(l) : null;
    if (!it || !l || to === null) return false;
    const state = l.fields.find((f) => f.id === l.state);
    const word = (state?.labels?.[to] ?? to).toLowerCase();
    const called = `${noun} ${a.digits}`;
    /* THE ASK ALWAYS SAYS WHICH ENTRY IT MARKS, unless its name is the words he said: "Mark order 57, 3 vanilla jars, paid?" */
    const name = oneLine(it.name);
    const also = name === '' || words(name) === words(called) ? '' : `, ${name},`;
    const shut = { states: [...(l.done ?? [])], paid: `${capital(called)} is already ${word}.`, other: `${capital(called)} isn't open any more.` };
    change = { register: l.id, seq: it.seq, name: name || capital(called), field: state!.id, line: to, ask: `Mark ${called}${also} ${word}?`, done: `Marked ${called} ${word}`, mark: true, shut };
    return true;
  }

  /** "Uber 85": money spent on a shop, a service or a thing bought, today or on the day gone it names (AN9). */
  function spentOn(c: string): boolean {
    const dated = takeDay(c, opts.today);
    /* A DAY GONE IS WHEN IT WAS SPENT (RO5): "Uber 85 on Monday" is last Monday, "Coffee 45 on 28 Oct" the 28th gone. Only
       words that point ahead ("tomorrow", "next", "due", "in 3 days") are no spend: a bill, read after. */
    /* AND A DATE STILL TO COME IS NO SPEND EITHER (RQ2): "Netflix 180 on the 5th" read on 31 Oct is a bill due 5 Nov, never
       paid on 5 Oct, and "Hotel 3,000 on 20 Nov" is never paid a year back. Only a bare weekday is read as the one gone. */
    /* AND A DATE NEARER GONE THAN TO COME IS THE ONE GONE: "Coffee 45 on 6 Oct" read on 7 Oct is yesterday, never next October.
       "the 5th" read on 7 Oct stays a bill, by RQ2: the month's next one is what it always meant. */
    const lastYears = dated.day !== null && dated.gone !== null && dated.gone !== dated.day && dated.gone.slice(4) === dated.day.slice(4);
    const nearerGone = lastYears && daysBetween(dated.gone!, opts.today) < daysBetween(opts.today, dated.day!);
    if (dated.day !== null && (aheadSaid(c) || (dated.day > opts.today && !weekdaySaid(c) && !nearerGone))) return false;
    const [a, ...more] = amountsIn(dated.rest, opts.currency, held);
    if (!a || more.length > 0) return false;
    const lead = trimWords(dated.rest.slice(0, a.at));
    if (lead === '' || trimWords(dated.rest.slice(a.at + a.text.length)) !== '') return false;
    /* A PLATFORM THAT PAYS HIM, A WORD FOR WHAT IS SOLD AS WELL AS BOUGHT, OR ONE OF HIS OWN THINGS FOR SALE says no way
       (RO2, RO4): "Apple 1,200", "Training 15,000", "Candles 300" where he sells candles. Which way is asked. */
    if (paysHim(lead) || EITHER_WAY.test(lead) || sells(lead)) return askWay(c, a, null);
    /* A COUNT IS NO SPEND WITHOUT A CURRENCY OR A FIGURE THAT READS AS MONEY (RO4): "Tickets 40", "Books 3". */
    if (COUNTED.test(lead) && a.word === null && (numberOf(a.digits, a.thousand) ?? 0) < 100) return askWay(c, a, null);
    if (!SPENT_ON(lead)) return false;
    if (readMoney(oneLine(`paid ${a.text} for ${lead} ${dayText(c)}`), null, false)) placed = true;
    else left.push(c);
    return true;
  }

  /** "Pay rent 12000 on the 1st", "Invoice Acme 1,200 USD for the logo work, due in 14 days": a bill or an invoice. */
  function bill(c: string): boolean {
    const invoice = INVOICE.exec(c);
    const pay = PAY.exec(c);
    /* A PLAIN MONEY LINE IS A BILL TOO (AL4): "Electricity 850 due Thursday", "Netflix 180 a month", a thing paid for or
       a figure due or repeating, so long as the figure is the last thing said of it. "Glaze 14 mugs due Friday" is no
       bill, nor "Call the bank at 3 tomorrow". */
    const billSaid = invoice !== null || pay !== null || BILL_WORD.test(c);
    const loose = !billSaid && (THING_PAID.test(c) || EVERY.test(c) || /\bdue\b/iu.test(c));
    if (!billSaid && !loose) return false;
    const own = takeDay(c, opts.today);
    /* A NUMBER A THING IS KNOWN BY IS NEVER WHAT IS OWED (RO3): "Invoice 1042 3,000 due Friday" is 3,000, and "Invoice
       1042 due Friday" no bill at all. */
    const [a] = amountsIn(own.rest, opts.currency, held).filter((x) => !refAt(own.rest, x, 'never'));
    if (!a) return false;
    if (loose && a.word === null) {
      const after = oneLine(own.rest.slice(a.at + a.text.length).replace(EVERY, ' ')).replace(NEXT_SAID, '').replace(/^(?:due|by|on)$/iu, '');
      const size = numberOf(a.digits, a.thousand) ?? 0;
      if (after !== '' || TIME_BEFORE.test(own.rest.slice(0, a.at)) || own.rest.slice(0, a.at).trim() === '') return false;
      if (!THING_PAID.test(c) && !EVERY.test(c) && size < 100) return false;
    }
    /* A LOOSE LINE SAYS NO WAY (RL5): "Acme 1,200 due Friday" may be Acme's invoice to collect, "Omar 3,000 a month"
       Omar's. One that names somebody, or an income word, is asked which way, never kept as a bill to pay. A thing
       paid for, a company he pays or one of his accounts is the bill it reads as. */
    if (loose && !/\bowe/iu.test(c)) {
      const who = nameBefore(own.rest.slice(0, a.at));
      /* AND SO DOES A PLATFORM THAT PAYS HIM, OR WHAT HE SELLS AS WELL AS BUYS (RO2, RO6): "Seats 1,200 a month" asks. */
      const lead = trimWords(own.rest.slice(0, a.at));
      if (who !== null || INCOME_WORD.test(c) || paysHim(lead) || EITHER_WAY.test(lead) || sells(lead)) return askWay(c, a, who);
    }
    const l = dueList(opts.lists);
    if (!l) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= unsureIn(a, currency);
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
    if (every) rest = oneLine(rest).replace(NEXT_SAID, '');
    /* EVERY WORD OF WHEN IS DROPPED FROM ITS NAME (audit 31 Oct m, AM23): "Rent 12,000 due on the 1st every month" was
       named "Rent due", the "on" before the day taken and the "due" before it kept. */
    /* AND "ISN'T PAID", "NOT PAID", "GETS PAID" (RO1): "Rent 12,000 isn't paid" is a bill called Rent. */
    const plain = trimWords(trimWords(trimWords(rest).replace(NOT_PAID_TAIL, '')).replace(/^(?:for|to)\s+(?:the\s+)?/iu, '').replace(/(?:\s+(?:due|on|by|is|starting))+$/iu, ''));
    const who = invoice?.[1] ?? null;
    const what = capital(plain) || (who ? `Invoice to ${who}` : 'A bill');
    /* MONEY THAT COMES ROUND IS REPEATING, where the record keeps it (AL4): "Netflix 180 a month" is a cost every month,
       the one home of repeating money, never a bill whose repeat nothing walks. */
    if (every && !invoice) {
      const r = repeatList(opts.lists);
      if (r) return repeating(r, { value: { amount, currency }, into: toMe, what, day, every: words(every[1] ?? every[2] ?? ''), payer: null, clause: c });
    }
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
    if (repeats && due && !day && due.required === true && due.default === undefined) whenNext = true;
    if (who) {
      const party = pick(l, 'ref', /party|who|client|from/, (f) => f.to === PEOPLE);
      const ref = personOf(who);
      if (party && ref !== null) fields[party.id] = ref;
      client(ref, who);
    }
    const bits = [`${spelled(amount, currency)} ${toMe ? (who ? `owed to you by ${who}` : 'owed to you') : 'to pay'}`, ...(day ? [`due ${dayTold(day, c)}`] : []), ...(repeat && repeats ? [`every ${EVERY_SAID[repeats] ?? repeats}`] : []), `in ${l.name}`];
    rows.push({ register: l.id, fields, said: what, detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    return true;
  }

  /** Which way the money went is asked, and nothing is kept (RL5). Where no money is kept, that is what is said. */
  function askWay(c: string, a: Amount, who: string | null): boolean {
    if (!moneyList(opts.lists) && !dueList(opts.lists)) {
      noMoney = true;
      return true;
    }
    if (who !== null) whichWay ??= who;
    else inOrOut ??= a.digits;
    left.push(c);
    return true;
  }

  /** Somebody a plain money line names before its figure, or null: "Acme", "Omar's deposit", "Deposit for Omar". A
      place, a company he pays, a thing paid for or one of his accounts is nobody. */
  function nameBefore(lead: string): string | null {
    const said = oneLine(lead).replace(/[\s,;:–-]+$/u, '');
    const fit = (n: string | undefined): string | null => {
      /* A MONTH OR A WEEKDAY IS NEVER WHO PAID (RM5), nor a service he pays ("Netflix 200 due Friday"). */
      const name = undated(n ?? '').name;
      if (!name || THING_PAID.test(name) || EITHER_WAY.test(name) || GERUND.test(name) || SERVICES.test(name) || SERVICE_BRANDS.test(name) || INCOME_WORD.test(name) || ownAccount(name) || PLACES.test(name) || COMPANIES.test(name)) return null;
      return knownAs(name, opts.people ?? []) !== null || aName(name) ? name : null;
    };
    const own = new RegExp(`^(${NAME})['’]s(?![\\p{L}\\p{M}])`, 'u').exec(said);
    if (own) return fit(own[1]);
    const only = new RegExp(`^(${NAME})$`, 'u').exec(said);
    if (only) return fit(only[1]);
    const by = new RegExp(`\\b(?:for|to|from)\\s+(${NAME})(?![\\p{L}\\p{M}'’-])`, 'u').exec(said);
    if (by) return fit(by[1]);
    const known = (opts.people ?? []).find((p) => words(p.name) !== '' && ` ${words(said)} `.includes(` ${words(p.name)} `));
    return known ? known.name : null;
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
    const [a] = amountsIn(own.rest, opts.currency, held);
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
      noCurrency ||= unsureIn(a, currency);
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
    const bits = [toMe ? `${who} owes you ${spelled(amount, currency)}` : `You owe ${who} ${spelled(amount, currency)}`, ...(back ? [`due back ${dayTold(back, c)}`] : []), `in ${l.name}`];
    rows.push({ register: l.id, fields, said: what, detail: bits.join(', '), icon: iconOf(l), missing: missingOf(l, fields) });
    placed = true;
    loaned = true;
    return true;
  }

  /** "Stripe paid out 1,950 USD today": money in from a platform, and nobody new. */
  function payout(phrase: string, from: string | null): boolean {
    const dated = takeDay(phrase, opts.today);
    const [a] = amountsIn(dated.rest, opts.currency, held);
    if (!a) return false;
    if (!moneyList(opts.lists) && !dueList(opts.lists)) {
      noMoney = true;
      return true;
    }
    const currency = a.currency ?? (a.word ? null : opts.currency);
    const amount = currency ? minor(a, currency) : null;
    if (currency === null || amount === null) {
      unsure = true;
      noCurrency ||= unsureIn(a, currency);
      return false;
    }
    if (!keepMoney({ value: { amount, currency }, into: true, party: from, payer: null, by: null, day: dated.gone, what: from ? `Payout from ${from}` : 'Payout', said: `${spelled(amount, currency)} paid out${from ? ` by ${from}` : ''}` })) return false;
    return true;
  }

  /** A card alert or an account's text, as the bank sent it: the amount in the currency it names, where, and when. */
  function bankText(whole: string): boolean {
    const found = amountsIn(whole, opts.currency, held);
    if (found.length === 0) return false;
    const named = found.filter((a) => a.word !== null && a.currency !== null && !BALANCE_BEFORE.test(whole.slice(Math.max(0, a.at - 40), a.at)));
    const a = named[0];
    if (!a) {
      if (!BANK_ONLY.test(whole)) return false;
      bankBare = true;
      return true;
    }
    const currency = a.currency!;
    const amount = minor(a, currency);
    if (amount === null) return false;
    const into = bankInto(whole, a.at, a.at + a.text.length);
    const after = whole.slice(a.at + a.text.length);
    const payee = ((into ? PAYER.exec(after) : null) ?? PAYEE.exec(after))?.[1]?.trim().replace(/[.,;:]+$/u, '');
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
    const [a, ...more] = amountsIn(bare, opts.currency, held);
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
    /* AN ORDER'S NAME STARTS WITH A CAPITAL, as every row typed by hand does (audit 31 Oct n, AN5): Tell's
       "Salma ordered 20 lavender candles" was an order called "lavender candles" among "Vanilla jars". ONLY A FIRST WORD
       ALL IN SMALL LETTERS (RP3): one with a capital inside it is a name, kept as said, so "iPhone cases" never becomes
       "IPhone cases". */
    const fields: Record<string, TellValue> = { [textField(l)!.id]: /^\p{Ll}+(?=\s|$)/u.test(thing) ? capital(thing) : thing };
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
    const detail = [`${count !== undefined && many ? `${count} ` : ''}${thing}`, ...(due && day ? [`due ${dayTold(day, `${phrase} ${around}`)}`] : [])];
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
    /* "Paid 900 for order 57" is 900, for order 57, never 900 and a second figure of 57 said back (RO3). */
    const all = amountsIn(dated.rest, opts.currency, held);
    const figures = all.filter((x) => !refAt(dated.rest, x, 'any'));
    /* ONLY A BARE "BILL" FALLS BACK (RQ4): "Paid electricity bill 850" keeps 850, and "Paid for order 57" or "Got paid for
       invoice 1042" names no amount at all. How much is asked, as "Order 57 paid" is, and the line is said back by the
       reader that asked, with nothing made, not even who paid it. */
    const strict = figures.length > 0 ? figures : all.filter((x) => !refAt(dated.rest, x, 'never'));
    if (strict.length === 0 && all.length > 0) {
      if (!moneyList(opts.lists) && !dueList(opts.lists)) noMoney = true;
      else howMuch ??= capital(trimWords(dated.rest.replace(ACT, '').replace(/^for\s+/iu, '')));
      return false;
    }
    const [a, ...more] = strict;
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
      noCurrency ||= unsureIn(a, currency);
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
    /* WHO THE READER PAID IS KEPT, and new in People as "Got 2,000 from Dad" makes Dad (AL2): "Paid Nadia 300 for the
       logo" said only "EGP 300 out". Never a bill, a provider or one of his own accounts. */
    let payee: string | null = null;
    let payeeRef: TellValue | null = null;
    /* WHERE IT WAS SPENT, A SHOP OR A COMPANY AND NEVER A PERSON (AM8): "Spent 850 on groceries at Carrefour" said only
       "EGP 850 out", and kept neither the shop nor the groceries. "at" names where; "to" a company paid ("Paid 500 to
       Carrefour"). Kept in the words and on the Ledger's payee, never made somebody in People. */
    let shop: string | null = null;
    let shopWord: 'at' | 'to' = 'at';
    if (!into) {
      const to = PAID_TO.exec(rest) ?? TO_SOMEBODY.exec(rest);
      const parts = (to?.[1] ?? '').split(' ');
      while (parts.length > 1 && CODES.has(parts[parts.length - 1]!)) parts.pop();
      /* "Paid Omar March 300" is Omar, and "March" stays in the words (RM5). */
      const { name, dropped } = undated(parts.join(' '));
      const cutTo = (m: RegExpExecArray): string => oneLine(`${m[0].startsWith('to') ? rest.slice(0, m.index) : 'paid'} ${dropped.join(' ')} ${rest.slice(m.index + m[0].length)}`);
      /* ONLY SOMEBODY IS A PAYEE (RL7): one already in People, or a name that reads as a person, never a place, a
         company, a provider, a bill or one of his accounts. "Paid Vodafone 450" keeps Vodafone as what it was for. */
      if (to && name && isReader(name)) {
        selfPaid ??= { name: titled(name), figure: a.digits };
        left.push(oneLine(phrase));
        return true;
      }
      if (to && name && (knownAs(name, opts.people ?? []) !== null || made.has(words(name)) || somebody(name)) && !THING_PAID.test(name) && !ownAccount(name)) {
        payee = name;
        rest = cutTo(to);
        payeeRef = personOf(name);
      } else if (to && name && aName(name) && !THING_PAID.test(name) && !ownAccount(name) && !PLACES.test(name)) {
        shop = name;
        shopWord = 'to';
        rest = cutTo(to);
      }
      const where = payee === null && shop === null ? AT_SHOP.exec(rest) : null;
      if (where && aName(where[1]!) && !ownAccount(where[1]!) && knownAs(where[1]!, opts.people ?? []) === null) {
        shop = where[1]!;
        rest = oneLine(`${rest.slice(0, where.index)} ${rest.slice(where.index + where[0].length)}`);
      }
    }
    const payer = into && who ? (isSomebody(who) ? personOf(who) : null) : payeeRef;
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

    /* The words said of it, with the act and a joining word left at either end taken off: "on groceries", "for wax". */
    const told = oneLine(rest.replace(ACT, '')).replace(/[\s,.;:!?]+$/u, '').replace(/\s+(?:for|at|on|from)$/iu, '');
    const plain = trimWords(told.replace(/^(?:for|from|on)\s+/iu, ''));
    const named = capital(plain);
    const what = who
      ? `Payment from ${who}${by ? `, by ${by}` : ''}`
      : shop
        ? named ? `${named}${shopWord === 'at' ? ' at ' : ', '}${shop}` : shop
        : named || (payee ? `Paid to ${payee}` : into ? 'Money in' : 'Money out');
    /* WHAT IT WAS FOR, IN THE WORDS SAID (AL2, AM8): "EGP 300 to Nadia, for the logo", "EGP 850 at Carrefour, for
       groceries", "EGP 200 out, for wax", "EGP 45,000 in, salary". Money out is said "for" what, money in as named. */
    const reason = who ? '' : told === '' ? '' : payee || into ? saidAsTyped(told) : `for ${saidAsTyped(told.replace(/^(?:for|on)\s+/iu, ''))}`;
    /* ONE LINE, READ AS A PERSON SAYS IT: "EGP 1,200.00 from Lina", then "paid, kept in Bills and
       invoices", where it said "EGP 1,200.00 in" over "into Bills and invoices". */
    const line = `${spelled(amount, currency)} ${into ? (who ? `from ${who}` : 'in') : payee ? `to ${payee}` : shop ? `${shopWord} ${shop}` : 'out'}${reason ? `, ${reason}` : ''}${by ? `, by ${by}` : ''}`;
    const kept = keepMoney({ value, into, party: who ?? payee ?? shop, payer, by, day, what, said: line });
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
    /* MONEY IN THAT NOBODY OWED HIM IS NO BILL (AN10): a salary, a payout or a refund kept as a paid item is said where
       it shows, in Money, never "paid, kept in Bills". A client's payment is still the invoice it settles. */
    const plainIn = k.into && l !== ledger && k.payer === null;
    /* AND SAID IN MONEY AFTER THE ADD AS WELL (AO10): "Just added: ..., in Money", where it said "in Bills and invoices". */
    /* AND EVERY PAYMENT SAID THE ONE WAY (audit 1 Nov, AP27): "EGP 3,000 from Upwork, kept in Money" sat beside "EGP 300 to
       Nadia, paid, kept in Bills and invoices". Money that moved, kept in Money's own lists, is "kept in Money". */
    const inMoney = plainIn || l.pack === undefined || l.pack === 'money-core';
    rows.push({ register: l.id, fields, said: k.said, detail: inMoney ? 'kept in Money' : `${settled ? 'paid, ' : ''}kept in ${l.name}`, icon: iconOf(l), missing: missingOf(l, fields), ...(inMoney ? { where: { name: 'Money', href: '/p/money' } } : {}) });
    placed = true;
    return true;
  }

  /** Whether the record holds any account of the kind this field links to: one known by name, or one counted. */
  function accountsHeld(account: FieldDecl): boolean {
    return (opts.accounts ?? []).length > 0 || (opts.lists.find((x) => x.id === account.to)?.count ?? 0) > 0;
  }

  /** Whether `name` is one of his own accounts, as `accountFor` matches one by name. */
  /** Whether a name is the reader's own (AO12): their whole name, or their first name alone when it is all that was said. */
  function isReader(name: string): boolean {
    const me = words(opts.me ?? '').trim().replace(/\s+/gu, ' ');
    if (me === '') return false;
    const said = words(name).trim().replace(/\s+/gu, ' ');
    return said === me || said === me.split(' ')[0];
  }

  function ownAccount(name: string): boolean {
    const said = words(name.trim());
    return said !== '' && (opts.accounts ?? []).some((a) => words(a.name) === said || words(a.name).includes(said) || said.includes(words(a.name)));
  }

  /** The account a payment came through: the one its way names, or the only one there is when it names none. */
  function accountFor(by: string | null): Known | null {
    const accounts = opts.accounts ?? [];
    if (by) return accounts.find((a) => words(a.name).includes(words(by)) || words(by).includes(words(a.name))) ?? null;
    return accounts.length === 1 ? accounts[0]! : null;
  }
}
