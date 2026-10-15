/**
 * What the shared page reads and says, out of the component so `node --test` can hold it (a Svelte page does not mount
 * there): the link off the address, the page's head, and each typed cell and figure as a stranger reads it.
 *
 * THE LINK IS `/app/s#<token>` (`linkOpened` in `@braindog/host`), so the token is in the fragment, which no browser
 * sends to any host and no log keeps. It is read once and wiped from the address bar at once, as `takeInvite` does
 * (`lib/auth.ts`), so it does not stay on the screen, in a screenshot or in the tab's history.
 *
 * EVERY VALUE IS DRAWN IN THE RECORD'S LANGUAGE AND ZONE, which the answer carries, never the visitor's device's: an
 * amount through the app's own money writer (`money` and `drawn`), a day through its own `day`, an instant counted
 * from the moment the owner's record was read in the record's zone.
 */

import { AMOUNT_SPACE, day, money, since } from 'braindog-render';

import { drawn, type Drawn } from '../../lib/record/money.ts';
import { fieldSaid, words, type SharedCell, type SharedColumn, type SharedRead, type SharedReading, type SharedRow } from '../../lib/record/share-write.ts';

/**
 * The link off `#<token>`, once, wiping the address first. Nothing is printed, logged or kept: the token goes to the
 * one read that asks for the page and nowhere else. An address with no fragment is a link that does not open.
 */
export function takeShared(hash: string, clear: () => void): string {
  const raw = hash.replace(/^#/u, '').trim();
  if (raw === '') return '';
  clear();
  return raw;
}

/** The page's head: its name and one sentence. A link that does not open is one sentence for every way it fails. */
export function headOf(got: SharedRead): { title: string; line: string } {
  if (got.from === 'live') return { title: got.page.title, line: words.sharedUntil(daySaid(dayIn(got.page.expires_at, got.page.zone))) };
  if (got.from === 'shut') return { title: words.sharedDead, line: words.sharedDeadBody };
  return { title: words.sharedUnreached, line: '' };
}

/** Where a page is read: the record's language and zone, and the moment the record said its clock read. */
export type Where = { language: string; zone: string; now: number };

/** A value as it is drawn: words, or an amount in the parts `Money` sets. */
export type Said = { text: string } | { money: Drawn & { text: string } };

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const CURRENCY = /^[A-Z]{3}$/u;

const daySaid = (iso: string): string => day(iso);

/** The calendar day an instant falls on in the record's zone, as `YYYY-MM-DD`: a link that stops at 03:00 UTC stops the day before in New York. */
const dayIn = (iso: string, zone: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t);
    const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${of('year')}-${of('month')}-${of('day')}`;
  } catch {
    return iso.slice(0, 10);
  }
};

/** A number in the record's language, with Latin digits, which a column of figures keeps aligned. */
const numberSaid = (n: number, language: string): string => {
  try {
    return new Intl.NumberFormat(language, { numberingSystem: 'latn', maximumFractionDigits: 3 }).format(n);
  } catch {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(n);
  }
};

/**
 * An amount, minor units in its own currency, as the app writes one. A shared page has no home currency (the visitor
 * holds no record), so every amount says its currency. `null` for a value that is not whole money.
 */
export function moneySaid(amount: unknown, currency: unknown, setting: 'exact' | 'headline' = 'exact'): (Drawn & { text: string }) | null {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || typeof currency !== 'string' || !CURRENCY.test(currency)) return null;
  const text = money(amount, currency);
  const parts = drawn(text, null, setting === 'headline' ? 'headline' : false);
  return parts === null ? null : { ...parts, text: `${parts.lead}${parts.whole}${parts.fraction}${parts.iso === null ? '' : `${AMOUNT_SPACE}${parts.iso}`}` };
}

/** One plain value as a person reads it: a day, an instant, a number, yes or no, or the words themselves. */
export function plainSaid(v: unknown, where: Where): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? words.sharedYes : words.sharedNo;
  if (typeof v === 'number') return Number.isFinite(v) ? numberSaid(v, where.language) : '';
  if (typeof v === 'string') return DAY.test(v) ? daySaid(v) : INSTANT.test(v) ? since(v, where.now, where.zone) : v;
  if (Array.isArray(v)) return v.map((x) => plainSaid(x, where)).filter((s) => s !== '').join(', ');
  return '';
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** One typed cell by its type, as the owner's own table draws it. `minus` turns an amount the row says went out. */
function typedSaid(type: string, value: unknown, label: string | undefined, where: Where, minus = false): Said {
  if (type === 'money' && isObject(value) && typeof value.amount === 'number') {
    const m = moneySaid(minus ? -value.amount : value.amount, value.currency);
    return m === null ? { text: '' } : { money: m };
  }
  if (type === 'quantity' && isObject(value) && typeof value.value === 'number')
    return { text: `${numberSaid(value.value, where.language)}${typeof value.unit === 'string' && value.unit !== '' ? ` ${value.unit}` : ''}` };
  if (type === 'enum') return { text: label ?? (typeof value === 'string' ? fieldSaid(value) : '') };
  if (type === 'day' && typeof value === 'string') return { text: daySaid(value) };
  if (type === 'instant' && typeof value === 'string') return { text: since(value, where.now, where.zone) };
  return { text: plainSaid(value, where) };
}

/** A list's cell: each value by the type it holds, joined. An amount in a list is said whole, one after another. */
function listSaid(cell: SharedCell, where: Where): Said {
  const of = cell.of ?? 'text';
  const each = Array.isArray(cell.value) ? cell.value : [];
  const said = each.map((v) => typedSaid(of, v, undefined, where)).map((s) => ('money' in s ? s.money.text : s.text));
  return { text: said.filter((s) => s !== '').join(', ') };
}

/**
 * One column of one row: its typed cell when the record sent one, else the plain value a record without cells sent.
 * A money column with a `sign` turns its amount when the row's sign field says it went out.
 */
export function cellSaid(row: SharedRow, column: Pick<SharedColumn, 'field' | 'sign'>, where: Where): Said {
  const cell = row.cells[column.field];
  if (cell === undefined) return { text: plainSaid(row.fields[column.field], where) };
  if (cell.type === 'list') return listSaid(cell, where);
  const sign = column.sign;
  const minus = sign !== undefined && (row.cells[sign.field]?.value ?? row.fields[sign.field]) === sign.minus;
  return typedSaid(cell.type, cell.value, cell.label, where, minus);
}

/** A figure: an amount when its unit is a currency, a count with its unit, or the words for a reading with none. */
export function figureSaid(r: SharedReading, where: Where): Said {
  if (r.value === null) return { text: words.sharedNoFigure };
  if (r.unit !== null && CURRENCY.test(r.unit)) {
    const m = moneySaid(r.value, r.unit, 'headline');
    if (m !== null) return { money: m };
  }
  const plain = numberSaid(r.value, where.language);
  return { text: r.unit === null ? plain : `${plain} ${r.unit}` };
}
