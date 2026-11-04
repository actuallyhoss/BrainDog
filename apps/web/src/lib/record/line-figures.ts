/**
 * THE AMOUNT AND THE DAY A TYPED LINE CARRIES, read off it before the line is a row's title (audit 31 Oct h, AH5).
 *
 * "Electricity bill 850 due 5 Nov" typed into Bills and invoices' add line went out as a bill called the whole line,
 * with no amount, and the record refused it: "obligations needs amount." The 850 and the day were in the line. A list
 * that keeps a money field and a day field reads them here: the figure (with its code or symbol, else the currency the
 * list or the record already keeps), and the day ("5 Nov", "Nov 5", "the 1st", "tomorrow", a weekday, "in 3 days"),
 * and the title is the words left over. A list with neither field reads nothing, so a task called "Read 2 books" keeps
 * its 2.
 *
 * NEVER A CURRENCY NOBODY SAID: a bare figure goes in the code typed beside it, else the currency the list's own rows
 * are in, else the record's home currency; with none of them, the figure is left in the words and the record says what
 * it wants, as before.
 *
 * PURE but for the declarations and the home currency this tab holds, so a test sets those and reads the answer.
 */

import { exponentOf } from 'braindog-render';

import { currencyFor, homeCurrency, labelOf } from './api.ts';
import { codeOf, FIGURE, minorOf } from './currency-words.ts';
import { REGISTERS } from './held.ts';
import type { Fields, FieldDecl } from './schema.ts';
import { recordToday } from './zone.ts';
import { addDays, daySaid, weekdayOf } from '../work/board.ts';

/** A line, read: the words left for the title, the fields read off it, and what was read, said short. */
export type LineFigures = { text: string; fields: Fields; said: string[]; bare?: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const LEAD = '(?:(?:due|by|on|for)\\s+)?';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
/* A DAY SAID IN WORDS IS READ ONLY AT THE END of the line, as Today's light syntax reads it: "Write the Monday
   newsletter" keeps its Monday, and "Call the plumber tomorrow" is due tomorrow. A date with its month is read anywhere. */
const END = '(?=[\\s.,;!]*$)';

const pad = (n: number): string => String(n).padStart(2, '0');

/** A real day in the year that puts it today or after, else next year's. */
function dayOn(month: number, date: number, today: string): string | null {
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const day = `${String(y)}-${pad(month)}-${pad(date)}`;
    const d = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null;
    if (day >= addDays(today, -31) || y > year) return day;
  }
  return null;
}

/** The day a line names, and the stretch it was named in, or `null`. */
function dayIn(line: string, today: string): { day: string; at: number; end: number } | null {
  const tries: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}(\\d{4})-(\\d{2})-(\\d{2})(?![\\p{L}\\p{N}])`, 'iu'), (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}${ORD}\\s+(?:of\\s+)?${MONTH}(?![\\p{L}])`, 'iu'), (m) => dayOn(MONTHS[m[2]!.slice(0, 3).toLowerCase()] ?? 0, Number(m[1]), today)],
    [new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}${MONTH}\\s+${ORD}(?![\\p{L}\\p{N}])`, 'iu'), (m) => dayOn(MONTHS[m[1]!.slice(0, 3).toLowerCase()] ?? 0, Number(m[2]), today)],
    [
      new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}the\\s+${ORD}(?![\\p{L}\\p{N}])`, 'iu'),
      (m) => {
        const date = Number(m[1]);
        const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
        const here = dayOn(mo, date, today);
        if (here !== null && here >= today) return here;
        return mo === 12 ? dayOn(1, date, `${String(y + 1)}-01-01`) : dayOn(mo + 1, date, today);
      },
    ],
    [new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}(today|tonight)${END}`, 'iu'), () => today],
    [new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}tomorrow${END}`, 'iu'), () => addDays(today, 1)],
    [
      new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}in\\s+(\\d{1,3})\\s+(days?|weeks?)${END}`, 'iu'),
      (m) => addDays(today, Number(m[1]) * (m[2]!.toLowerCase().startsWith('week') ? 7 : 1)),
    ],
    [
      new RegExp(`(?<![\\p{L}\\p{N}])${LEAD}(next\\s+)?(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?${END}`, 'iu'),
      (m) => {
        const w = WEEKDAYS[m[2]!.slice(0, 3).toLowerCase()];
        if (w === undefined) return null;
        const ahead = (w - weekdayOf(today) + 7) % 7;
        return addDays(today, m[1] ? ahead || 7 : ahead);
      },
    ],
  ];
  for (const [re, day] of tries) {
    const m = re.exec(line);
    if (!m) continue;
    const said = day(m);
    if (said !== null) return { day: said, at: m.index, end: m.index + m[0].length };
  }
  return null;
}

/* A FIGURE, with a sign or a code in front of it when one was typed there. Not the tail of a word ("Q3"), a day or a time
   ("30/10", "14:00"), and not a figure inside a longer one. */
const SIGN = 'US\\$|C\\$|A\\$|NZ\\$|[eE]£|£|€|¥|₹|\\$';
const FIGURES = new RegExp(`(?<![\\p{L}\\p{N}.,/:])(?:(${SIGN}|[A-Za-z]{3})\\s?)?(${FIGURE})(?:\\s?([kK])(?![\\p{L}\\p{N}]))?(?![\\p{N}])`, 'gu');
/* What follows a figure: a sign, or a word. */
const NEXT = new RegExp(`^\\s?(${SIGN}|[\\p{L}.]+)`, 'u');
/* Another figure next, with or without a sign in front. */
const FIGURE_NEXT = new RegExp(`^\\s+(?:${SIGN})?\\s?\\p{N}`, 'u');
/* WORDS THAT JOIN A FIGURE TO THE REST, so the figure before them is no count: "850 due", "40 for hosting", "15 a month". */
const JOINING = new Set([
  'for', 'to', 'at', 'on', 'due', 'by', 'of', 'from', 'in', 'per', 'a', 'an', 'the', 'each', 'every', 'and', 'or', 'plus',
  'paid', 'owed', 'total', 'monthly', 'weekly', 'yearly', 'annually', 'quarterly', 'today', 'tomorrow', 'tonight', 'next',
  'this', 'is', 'was', 'with', 'via', 'incl', 'including', 'excl', 'net', 'gross', 'only', 'left', 'owing',
]);

/** A figure on the line: where, as typed, the currency said with it, and what it reads as. */
type Figure = {
  at: number;
  end: number;
  figure: string;
  thousand: boolean;
  /** The code said with it; `null` for a currency word or sign that is unsure here ("$" on a pound record); `undefined` for none. */
  code: string | null | undefined;
  /** Said after the money field's own name: "total 1350". */
  labelled: boolean;
  /** A count of something ("3 apps", "2 rooms", "20%"), never an amount. */
  count: boolean;
};

/** The figures a line holds, read against the currency the list or the record keeps. */
function figuresIn(line: string, known: string | null, home: string | null, label: RegExp): Figure[] {
  const said = (word: string): string | null | undefined => {
    const code = codeOf(word, known);
    return code === null && (word === '$' || word === '¥') ? (codeOf(word, home) ?? null) : code;
  };
  const out: Figure[] = [];
  for (const m of line.matchAll(FIGURES)) {
    const [whole, before, figure, k] = m;
    let at = m.index ?? 0;
    let end = at + whole.length;
    let code: string | null | undefined;
    if (before) {
      code = said(before);
      /* A CODE IN FRONT THAT IS NO CURRENCY IS A WORD ("VAT 20"), and that figure is not the amount. */
      if (code === undefined && /^[A-Z]{3}$/u.test(before)) continue;
      /* A plain word in front ("for 3") is not the figure's. */
      if (code === undefined) at += whole.indexOf(figure!, before.length);
    }
    const rest = line.slice(end);
    const next = NEXT.exec(rest);
    let count = /^[%/:]/u.test(rest);
    if (next) {
      const word = next[1]!;
      const after = said(word);
      /* "$12 EGP": the code after a sign says which, as it does in Tell. */
      if (after !== undefined && (code === undefined || (code === null && after !== null))) {
        code = after;
        end += next[0].length;
      } else if (after === undefined && /^\p{L}/u.test(word) && !JOINING.has(word.toLowerCase().replace(/\.$/u, ''))) count = true;
    }
    /* A SMALL FIGURE RIGHT AFTER A NAME WORD, WITH ANOTHER FIGURE AFTER IT, IS PART OF THE NAME (MB2): "Room 2 850" is
       850 for Room 2, and "Flat 4 1,200" is 1,200 for Flat 4. */
    if (code === undefined && k === undefined && /^\p{N}{1,3}$/u.test(figure!) && /\p{L}[\p{L}\p{M}'’.-]*\s+$/u.test(line.slice(0, at)) && FIGURE_NEXT.test(rest))
      count = true;
    /* "total 1350": the field's name goes with its figure, so the title is not left saying "total". */
    const named = label.exec(line.slice(0, at));
    if (named) at = named.index + named[0].search(/\p{L}/u);
    out.push({ at, end, figure: figure!, thousand: k !== undefined, code, labelled: named !== null, count });
  }
  return out;
}

/** A figure written as a year, 1900 to 2099, with no currency, no thousands mark and no "k". */
const yearLike = (f: Figure): boolean => f.code === undefined && !f.thousand && /^(?:19|20)\p{N}{2}$/u.test(f.figure);

/** The first bare figure that counts nothing, passing over a year when another such figure follows it (RJ3). */
function bareAmount(all: readonly Figure[]): Figure | undefined {
  const plain = all.filter((f) => !f.count);
  return plain.find((f, i) => !yearLike(f) || !plain.slice(i + 1).some((g) => !yearLike(g))) ?? plain[0];
}

/**
 * THE AMOUNT A LINE NAMES, and only one it plainly names (RG1). A figure is money when a currency is said with it
 * ("$40", "850 EGP", "300 pounds"), when it follows the field's own name ("total 1350"), or, for a list whose one
 * required field is its amount (Bills), when it is the first bare figure that counts nothing: "Rent for 2 rooms 850"
 * and "Rent 850 for flat 4" are 850, so is "Room 2 850", and "Launch 3 apps" on Projects is no money at all. With several said with a currency, the first.
 *
 * `bare` IS A FIGURE THAT IS MONEY AND HAS NO CURRENCY ANYBODY SAID, for the line to ask about, and only where the
 * amount is required (RG10). Anywhere else the figure stays in the words.
 */
function amountIn(
  line: string,
  money: FieldDecl,
  known: string | null,
  home: string | null,
): { amount: number; currency: string; at: number; end: number } | { bare: string } | null {
  const names = [labelOf(money), money.id.replace(/_/gu, ' ')].map((n) => n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const label = new RegExp(`(?:^|[^\\p{L}])(?:${names.join('|')})\\s*[:=]?\\s*$`, 'iu');
  const all = figuresIn(line, known, home, label);
  const pick =
    all.find((f) => f.code !== undefined) ??
    all.find((f) => f.labelled) ??
    /* THE FIRST BARE FIGURE THAT COUNTS NOTHING (RH4): "Rent 850 for flat 4" is 850, never the 4 that ends it. AND A
       YEAR IS NEVER THE AMOUNT WHEN ANOTHER FIGURE IS THERE (RJ3): "Car insurance 2027 3000" is 3000 and "Rent Nov 2026
       850" is 850, where RH4 took the year that came first. A year alone ("Fees 2026") is still read, and asked about
       by the currency question like any bare figure. */
    (money.required ? bareAmount(all) : undefined);
  if (!pick) return null;
  const currency = pick.code === undefined ? known : pick.code;
  if (currency === null) return money.required ? { bare: line.slice(pick.at, pick.end).trim() } : null;
  const amount = minorOf(pick.figure, currency, pick.thousand);
  /* A FIGURE NO CONVENTION READS IN THAT CURRENCY ("1,2,3", "EGP 1,25,000") is left in the words, never guessed. */
  if (amount === null) return null;
  return { amount, currency, at: pick.at, end: pick.end };
}

/** The words with one stretch taken out, the spaces closed up, and a dangling joining word dropped. TRIMMED FIRST
    (AN17): "Domain renewal 2027 for 15 USD" left "Domain renewal 2027 for ", whose "for" ended on a space and stayed. */
const cut = (line: string, at: number, end: number): string =>
  `${line.slice(0, at)} ${line.slice(end)}`
    .replace(/\s+/gu, ' ')
    .replace(/\s+[,.;:-]+(\s|$)/gu, '$1')
    .trim()
    .replace(/\s+(?:of|for|at|due|by|on)$/iu, '')
    .trim();

/** The field of `type` a capture fills: a required one first, then one the list counts by (`deadline`), then the first. */
function fieldOf(fields: readonly FieldDecl[], type: string, title: string): FieldDecl | undefined {
  const of = fields.filter((f) => f.type === type && f.id !== title && !f.retired);
  return of.find((f) => f.required) ?? of.find((f) => f.deadline === true) ?? of[0];
}

/**
 * What a line typed on `register` carries beyond its words: an amount for its money field and a day for its day field,
 * each only where the list declares one, and the words left as the title. A line that would be left with no words is
 * not read at all.
 */
export function lineFigures(register: string, typed: string, now: number): LineFigures {
  const decl = REGISTERS[register];
  const text = typed.trim();
  const none: LineFigures = { text, fields: {}, said: [] };
  if (!decl?.title) return none;
  const money = fieldOf(decl.fields, 'money', decl.title);
  const dayField = fieldOf(decl.fields, 'day', decl.title);
  if (!money && !dayField) return none;
  const today = recordToday(now);
  let left = text;
  const fields: Fields = {};
  const said: string[] = [];
  if (dayField) {
    const d = dayIn(left, today);
    if (d) {
      const rest = cut(left, d.at, d.end);
      if (rest !== '') {
        fields[dayField.id] = d.day;
        said.push(`${labelOf(dayField)} ${daySaid(d.day)}`);
        left = rest;
      }
    }
  }
  if (money) {
    const home = homeCurrency();
    const a = amountIn(left, money, currencyFor(register, money.id) ?? home, home);
    /* A FIGURE WITH NO CURRENCY ANYBODY SAID is named back, so the line can ask which one rather than drop it. */
    if (a && 'bare' in a) return { text: left, fields, said, bare: a.bare };
    if (a) {
      const rest = cut(left, a.at, a.end);
      if (rest !== '') {
        fields[money.id] = { amount: a.amount, currency: a.currency };
        said.push(labelOf(money));
        left = rest;
      }
    }
  }
  return { text: left, fields, said };
}

/**
 * THE SAME LINE AS A FORM'S OPENING VALUES, for "Fill in the rest": the title as its words, a day as `2026-11-05` and an
 * amount as `850.00`, the text a person would have typed in each box. What was typed was dropped there before, and the
 * form opened with its Description empty.
 */
export function lineValues(register: string, typed: string, now: number): Record<string, string> {
  const decl = REGISTERS[register];
  if (!decl?.title || typed.trim() === '') return {};
  const read = lineFigures(register, typed, now);
  const out: Record<string, string> = { [decl.title]: read.text };
  for (const [id, v] of Object.entries(read.fields)) {
    if (typeof v === 'string') out[id] = v;
    else if (v !== null && typeof v === 'object' && 'amount' in v && 'currency' in v && typeof v.amount === 'number' && typeof v.currency === 'string') {
      const places = exponentOf(v.currency);
      out[id] = (v.amount / 10 ** places).toFixed(places);
    }
  }
  return out;
}

/** What the add line says when a figure was typed and nobody has chosen a currency yet. */
export function whichCurrency(figure: string): string {
  const digits = figure.replace(/^[^\p{N}]+|[^\p{N}kK]+$/gu, '');
  /* The code in the example is the one the sign most likely meant, else the record's, so it never reads as a guess made. */
  const like = figure.includes('$') ? 'USD' : figure.includes('¥') ? 'JPY' : homeCurrency();
  const example = like === null ? '' : `, like ${digits} ${like}`;
  return `Which currency is ${figure} in? Type its code with the figure${example}${homeCurrency() === null ? ', or set your home currency in Money' : ''}.`;
}
