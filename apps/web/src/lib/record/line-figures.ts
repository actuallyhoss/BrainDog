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
import { REGISTERS } from './held.ts';
import type { Fields, FieldDecl } from './schema.ts';
import { recordToday } from './zone.ts';
import { addDays, daySaid, weekdayOf } from '../work/board.ts';

/** A line, read: the words left for the title, the fields read off it, and what was read, said short. */
export type LineFigures = { text: string; fields: Fields; said: string[] };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const SYMBOLS: Record<string, string> = { '£': 'GBP', $: 'USD', '€': 'EUR', '¥': 'JPY', '₹': 'INR', 'e£': 'EGP' };

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const LEAD = '(?:(?:due|by|on|for)\\s+)?';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
/* A DAY SAID IN WORDS IS READ ONLY AT THE END of the line, as Today's light syntax reads it: "Write the Monday
   newsletter" keeps its Monday, and "Call the plumber tomorrow" is due tomorrow. A date with its month is read anywhere. */
const END = '(?=[\\s.,;!]*$)';

/** A known three-letter code. */
function knownCode(code: string): boolean {
  if (!/^[A-Z]{3}$/u.test(code)) return false;
  try {
    return Intl.supportedValuesOf('currency').includes(code);
  } catch {
    return true;
  }
}

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

/** The figure a line names with its currency, and the stretch it was named in, or `null`. */
function amountIn(line: string, fallback: string | null): { amount: number; currency: string; at: number; end: number } | null {
  const re = /(?<![\p{L}\p{N}.,])(?:(£|\$|€|¥|₹|e£|[A-Z]{3})\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?(?:\s?([A-Z]{3}|[kK])(?![\p{L}]))?(?![\p{N}])/gu;
  for (const m of line.matchAll(re)) {
    const [, before, whole, part, after] = m;
    const k = after === 'k' || after === 'K';
    const code = (before ? (SYMBOLS[before.toLowerCase()] ?? (knownCode(before) ? before : null)) : null) ?? (after && !k && knownCode(after) ? after : null);
    /* A CODE IN FRONT THAT IS NO CURRENCY IS A WORD ("VAT 20"), and that figure is not the amount. */
    if (before && !SYMBOLS[before.toLowerCase()] && !knownCode(before)) continue;
    const currency = code ?? fallback;
    if (currency === null) return null;
    const places = exponentOf(currency);
    const value = Number(`${whole!.replace(/,/gu, '')}${part ? `.${part}` : ''}`) * (k ? 1000 : 1);
    if (!Number.isFinite(value) || value <= 0) continue;
    const at = m.index ?? 0;
    const end = at + m[0].length - (after && !k && !knownCode(after) ? after.length : 0);
    return { amount: Math.round(value * 10 ** places), currency, at, end };
  }
  return null;
}

/** The words with one stretch taken out, the spaces closed up, and a dangling joining word dropped. */
const cut = (line: string, at: number, end: number): string =>
  `${line.slice(0, at)} ${line.slice(end)}`
    .replace(/\s+/gu, ' ')
    .replace(/\s+[,.;:-]+(\s|$)/gu, '$1')
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
    const a = amountIn(left, currencyFor(register, money.id) ?? homeCurrency());
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
