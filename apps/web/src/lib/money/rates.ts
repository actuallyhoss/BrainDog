/**
 * A foreign amount, restated in the home currency: "≈ EGP 49,608" under "$1,000.00", and the day its rate is from.
 *
 * THE RATES ARE THE RECORD'S OWN ROWS, in the list that declares it holds rates (`rates:`, naming its four fields), and
 * never a feed this tab fetches. A rate is read the newest on or before today, either way round, or through one
 * currency both are quoted against; a currency with no rate is restated nowhere, and nothing is guessed.
 *
 * ONE DAY A SCREEN. The age of the rates is said once, beside the first restated amount, and never under each one:
 * the same sentence under every figure is a sentence nobody reads (`Money.svelte` claims the one place).
 *
 * PURE, so `node --test` reads it.
 */

import { exponentOf } from 'braindog-render';

import type { RegisterDecl } from '../record/schema.ts';

/** One rate: a unit of `currency` is worth `rate` of `base`, as of a day. */
export type Rate = { currency: string; base: string; rate: number; as_of: string };

/** The four fields a rates list names. */
export type RateFields = { currency: string; base: string; rate: string; as_of: string };

const CODE = /^[A-Z]{3}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}/u;

/** The list that holds rates, and its four fields, among the declarations this tab holds; `null` where none does. */
export function ratesListOf(decls: readonly RegisterDecl[]): { list: string; fields: RateFields } | null {
  for (const d of decls) {
    const r = (d as { rates?: unknown }).rates;
    if (r === null || typeof r !== 'object') continue;
    const f = r as Partial<Record<keyof RateFields, unknown>>;
    if (typeof f.currency === 'string' && typeof f.base === 'string' && typeof f.rate === 'string' && typeof f.as_of === 'string')
      return { list: d.id, fields: { currency: f.currency, base: f.base, rate: f.rate, as_of: f.as_of } };
  }
  return null;
}

/** The whole rates a list's rows hold; a row that is not a whole rate is not one. */
export function ratesFrom(rows: Iterable<Record<string, unknown>>, names: RateFields): Rate[] {
  const out: Rate[] = [];
  for (const f of rows) {
    const currency = typeof f[names.currency] === 'string' ? (f[names.currency] as string).trim().toUpperCase() : '';
    const base = typeof f[names.base] === 'string' ? (f[names.base] as string).trim().toUpperCase() : '';
    const rate = Number(f[names.rate]);
    const day = typeof f[names.as_of] === 'string' && DAY.test(f[names.as_of] as string) ? (f[names.as_of] as string).slice(0, 10) : null;
    if (!CODE.test(currency) || !CODE.test(base) || currency === base || !Number.isFinite(rate) || rate <= 0 || day === null) continue;
    out.push({ currency, base, rate, as_of: day });
  }
  return out;
}

/** The newest rate for one pair on or before `day`, quoted either way round, else the earliest after it. */
function pairRate(rates: readonly Rate[], from: string, to: string, day: string): { rate: number; as_of: string } | null {
  let before: { rate: number; as_of: string } | null = null;
  let after: { rate: number; as_of: string } | null = null;
  for (const r of rates) {
    const direct = r.currency === from && r.base === to;
    if (!direct && !(r.currency === to && r.base === from)) continue;
    const c = { rate: direct ? r.rate : 1 / r.rate, as_of: r.as_of };
    if (r.as_of <= day) {
      if (!before || r.as_of > before.as_of) before = c;
    } else if (!after || r.as_of < after.as_of) after = c;
  }
  return before ?? after;
}

/** The rate from one currency into another as of a day, directly or through one currency both are quoted against. */
export function rateFor(rates: readonly Rate[], from: string, to: string, day: string): { rate: number; as_of: string } | null {
  if (from === to) return { rate: 1, as_of: day };
  const direct = pairRate(rates, from, to, day);
  if (direct) return direct;
  const vias = [...new Set(rates.flatMap((r) => [r.currency, r.base]))].filter((c) => c !== from && c !== to).sort();
  for (const via of vias) {
    const a = pairRate(rates, from, via, day);
    const b = a ? pairRate(rates, via, to, day) : null;
    if (a && b) return { rate: a.rate * b.rate, as_of: a.as_of < b.as_of ? a.as_of : b.as_of };
  }
  return null;
}

/** An amount in minor units of one currency, in minor units of another, rounded once. */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  if (from === to) return minor;
  const exact = minor * rate * 10 ** (exponentOf(to) - exponentOf(from));
  const whole = Math.round(Math.abs(Math.round(Math.abs(exact) * 1e9) / 1e9));
  return exact < 0 ? -whole : whole;
}

/** A foreign amount in the home currency, with the day its rate is from; `null` at home or with no rate. */
export function approxOf(minor: number, currency: string, home: string | null, rates: readonly Rate[], today: string): { minor: number; currency: string; as_of: string } | null {
  if (!home || !currency || currency.toUpperCase() === home.toUpperCase()) return null;
  const r = rateFor(rates, currency.toUpperCase(), home.toUpperCase(), today);
  return r ? { minor: convertMinor(minor, currency.toUpperCase(), home.toUpperCase(), r.rate), currency: home.toUpperCase(), as_of: r.as_of } : null;
}

/** How old a rate is, as a person says it: `today`, `yesterday`, `5 days old`, `29 days old`. */
export function ageSaid(asOf: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 'rate of today';
  if (days === 1) return 'rate of yesterday';
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${asOf}T12:00:00Z`));
  return `rate of ${day}, ${days} days old`;
}
