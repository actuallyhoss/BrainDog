/**
 * A READING SAID WHOLE: its number with its unit, "16.4%" and "54 GB", and on its row the
 * day it was read, "16.4% on 28 Sep". Numbers printed "CPU, kettle 16.4" with the "%" in a field no column drew, and the
 * row split "Value 16.4" from "Unit %" and never said when.
 *
 * READ FROM THE DECLARATION, FOR ANY LIST: a list of readings is one with a number, a `unit` beside it, and a moment it
 * was read. A list of targets has a number and a unit and no moment, and is not one: a target was never read on a day.
 */

import { dateSaid, money, exponentOf, withUnit } from 'braindog-render';

import type { Fields, RegisterDecl } from './schema.ts';

/** The fields a reading is said from: its number, its unit and the moment it was read. */
export type Reading = { value: string; unit: string; at: string };

const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/** The list's reading fields, or `null` for a list that holds no readings. */
export function readingOf(decl: RegisterDecl | undefined): Reading | null {
  if (!decl) return null;
  const live = decl.fields.filter((f) => !f.retired);
  const unit = live.find((f) => f.id === 'unit' && f.type === 'text');
  const at = live.find((f) => f.type === 'instant');
  if (!unit || !at) return null;
  const order = [...decl.mobile, ...live.map((f) => f.id)];
  const value = order.map((id) => live.find((f) => f.id === id)).find((f) => f !== undefined && (f.type === 'decimal' || f.type === 'int'));
  return value ? { value: value.id, unit: unit.id, at: at.id } : null;
}

/**
 * The number with its unit: "16.4%" on its figure, "54 GB" after a space, "1 player" for one of a counted thing, and
 * money where the unit is a currency's code. `null` where the row holds no number.
 */
export function valueSaid(fields: Readonly<Fields>, r: Reading): string | null {
  const raw = fields[r.value];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const unit = typeof fields[r.unit] === 'string' ? String(fields[r.unit]).trim() : '';
  if (CURRENCIES.has(unit)) return money(Math.round(n * 10 ** exponentOf(unit)), unit);
  const figure = `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 3 })}`;
  if (unit === '') return figure;
  return withUnit(figure, Math.abs(n) === 1 && /[a-z]s$/u.test(unit) ? unit.slice(0, -1) : unit);
}

/** The reading and the day it was read, "16.4% on 28 Sep": the moment it holds, else the day the row was added. */
export function readingSaid(fields: Readonly<Fields>, r: Reading, created: string | undefined, now: number = Date.now()): string | null {
  const said = valueSaid(fields, r);
  if (said === null) return null;
  const at = typeof fields[r.at] === 'string' && fields[r.at] !== '' ? String(fields[r.at]) : created;
  return at && /^\d{4}-\d{2}-\d{2}/u.test(at) ? `${said} on ${dateSaid(at.slice(0, 10), now)}` : said;
}
