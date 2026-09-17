/**
 * Money across currencies: one amount per currency, or one amount in the home currency at dated rates.
 *
 * ONE FUNCTION FOR BOTH ENGINES. The record reads the amounts in SQL and the sample in the browser, and what is
 * left, finding the rate as of each amount's day and adding in minor units, is arithmetic on those amounts. It is
 * written once, here, and the browser imports it, so a figure drawn from the sample and the same figure drawn from a
 * record convert the same rows at the same rates to the same minor unit (`08 §2.5`).
 *
 * TWO CURRENCIES ARE STILL NEVER ADDED AS THEY ARE. Either every amount has a rate into the currency the figure is
 * in, and the figure is converted and says as of when, or one does not, and the figure is one amount per currency
 * with every missing pair named. There is no third answer that adds what it can and leaves out the rest.
 *
 * A RATE IS A ROW OF THE `fx` LIST: `currency`, `base`, `rate`, `as_of`. One unit of `currency` is `rate` units of
 * `base`, so `USD, EGP, 48.5` says a dollar is 48.5 pounds. A row the other way round is read as its inverse, because
 * a rate is quoted whichever way a person or a public address happens to quote it.
 */

import { exponentOf } from './ingest.ts';

export type Rate = { currency: string; base: string; rate: number; as_of: string };

/** One amount a figure adds up: minor units in its currency, and the day it is about, when the row has one. */
export type Amount = { currency: string; amount: number; day: string | null };

/** One currency's part of a figure that is not added up. */
export type Part = { currency: string; amount: number };

export type Across =
  /** Every amount was already in `currency`, or there was only one currency and no other was asked for. */
  | { kind: 'one'; currency: string | null; amount: number }
  /** Converted into `currency`; `asOf` is the newest rate used, `forward` when a rate after an amount's day stood in. */
  | { kind: 'converted'; currency: string; amount: number; asOf: string; forward: boolean }
  /** Not added up: one part per currency, largest code order, and each pair with no rate as `EGP to USD`. */
  | { kind: 'parts'; parts: Part[]; missing: string[] };

const CODE = /^[A-Z]{3}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}/u;

/** The rates a list's rows hold. A row that is not a whole rate (a code, a code, a positive number and a day) is not one. */
export function ratesFrom(rows: Iterable<Record<string, unknown>>): Rate[] {
  const out: Rate[] = [];
  for (const f of rows) {
    const currency = typeof f.currency === 'string' ? f.currency.trim().toUpperCase() : '';
    const base = typeof f.base === 'string' ? f.base.trim().toUpperCase() : '';
    const rate = typeof f.rate === 'number' ? f.rate : Number(f.rate);
    const asOf = typeof f.as_of === 'string' && DAY.test(f.as_of) ? f.as_of.slice(0, 10) : null;
    if (!CODE.test(currency) || !CODE.test(base) || currency === base || !Number.isFinite(rate) || rate <= 0 || asOf === null) continue;
    out.push({ currency, base, rate, as_of: asOf });
  }
  return out;
}

/**
 * The rate from one currency into another as of a day: the newest on or before it, else the earliest after it
 * (`forward`), else the same through one currency both are quoted against, else `null`. On one day a row quoted the
 * asked way round wins over its inverse.
 */
export function rateFor(rates: readonly Rate[], from: string, to: string, day: string): { rate: number; as_of: string; forward: boolean } | null {
  const direct = pairRate(rates, from, to, day);
  if (direct) return direct;
  /* THROUGH ONE CURRENCY BOTH ARE QUOTED AGAINST. A rates address answers everything against one base, so pounds to
     Egyptian pounds is pounds to dollars and dollars to Egyptian pounds. The pair is only as recent as its older half. */
  const vias = [...new Set(rates.flatMap((r) => [r.currency, r.base]))].filter((c) => c !== from && c !== to).sort();
  for (const via of vias) {
    const a = pairRate(rates, from, via, day);
    const b = a ? pairRate(rates, via, to, day) : null;
    if (a && b) return { rate: a.rate * b.rate, as_of: a.as_of < b.as_of ? a.as_of : b.as_of, forward: a.forward || b.forward };
  }
  return null;
}

/** One pair's rate, quoted either way round, with no currency in between. */
function pairRate(rates: readonly Rate[], from: string, to: string, day: string): { rate: number; as_of: string; forward: boolean } | null {
  if (from === to) return { rate: 1, as_of: day, forward: false };
  let before: { rate: number; as_of: string; direct: boolean } | null = null;
  let after: { rate: number; as_of: string; direct: boolean } | null = null;
  for (const r of rates) {
    const direct = r.currency === from && r.base === to;
    if (!direct && !(r.currency === to && r.base === from)) continue;
    const candidate = { rate: direct ? r.rate : 1 / r.rate, as_of: r.as_of, direct };
    if (r.as_of <= day) {
      if (!before || r.as_of > before.as_of || (r.as_of === before.as_of && direct && !before.direct)) before = candidate;
    } else if (!after || r.as_of < after.as_of || (r.as_of === after.as_of && direct && !after.direct)) after = candidate;
  }
  if (before) return { rate: before.rate, as_of: before.as_of, forward: false };
  if (after) return { rate: after.rate, as_of: after.as_of, forward: true };
  return null;
}

/**
 * An amount in minor units of one currency, in minor units of another: rounded once, half away from zero.
 *
 * THE EXPONENTS ARE EACH CURRENCY'S OWN, so a thousand yen at 0.0065 dollars a yen is 650 cents and not 6.5. The
 * product is cut to nine places before rounding, so a rate like 0.29 that binary cannot hold does not round 2.5 down.
 */
export function convertMinor(amount: number, from: string, to: string, rate: number): number {
  if (from === to) return amount;
  const exact = amount * rate * 10 ** (exponentOf(to) - exponentOf(from));
  const clean = Math.round(Math.abs(exact) * 1e9) / 1e9;
  const whole = Math.round(clean);
  return exact < 0 ? -whole : whole;
}

/**
 * A figure over amounts in any currencies, in `into` where it can be.
 *
 * `into` is the home currency when the record has one, else the currency the figure declares, else `null`. `today`
 * dates an amount whose row has no day. A figure over nothing is `one` with no currency.
 *
 * `convert` IS WHETHER ANYBODY CHOSE A CURRENCY TO ADD UP IN. A figure declares a currency so it can be written, and a
 * person who never said sterling is not handed their dollars in sterling because two rates happen to reach it. Without
 * one, amounts not in `into` are parts, and no pair is named, because the missing thing is the home currency.
 *
 * `kind` IS HOW THE AMOUNTS ARE ADDED UP: a sum, an average, the least or the most. Converted, each amount is converted
 * at its own day's rate and rounded once before the average is taken, so a least in pounds is the least of the pounds
 * each row was worth; in parts, each currency's amounts are averaged, or the least taken, among themselves.
 */
export function across(amounts: readonly Amount[], into: string | null, rates: readonly Rate[], today: string, convert = true, kind: Reduce = 'sum'): Across {
  const seen = new Set(amounts.map((a) => a.currency));
  if (seen.size === 0) return { kind: 'one', currency: into, amount: 0 };
  if (seen.size === 1 && (into === null || seen.has(into))) {
    const [only] = seen;
    return { kind: 'one', currency: only!, amount: reduceOf(kind, amounts.map((a) => a.amount)) ?? 0 };
  }

  const missing = new Set<string>();
  const converted: number[] = [];
  let asOf = '';
  let forward = false;
  if (into !== null && convert)
    for (const a of amounts) {
      if (a.currency === into) {
        converted.push(a.amount);
        continue;
      }
      const r = rateFor(rates, a.currency, into, (a.day ?? today).slice(0, 10));
      if (!r) {
        missing.add(`${a.currency} to ${into}`);
        continue;
      }
      converted.push(convertMinor(a.amount, a.currency, into, r.rate));
      if (r.as_of > asOf) asOf = r.as_of;
      forward ||= r.forward;
    }
  if (into !== null && convert && missing.size === 0) return { kind: 'converted', currency: into, amount: reduceOf(kind, converted) ?? 0, asOf, forward };
  return { kind: 'parts', parts: partsOf(amounts, kind), missing: [...missing].sort() };
}

/** How a figure adds its amounts up. */
export type Reduce = 'sum' | 'avg' | 'min' | 'max';

/** A sum, an average, a least or a most of numbers. A sum of nothing is zero; the others of nothing are `null`. */
export function reduceOf(kind: Reduce, values: readonly number[]): number | null {
  if (kind === 'sum') return values.reduce((n, v) => n + v, 0);
  if (values.length === 0) return null;
  if (kind === 'avg') return values.reduce((n, v) => n + v, 0) / values.length;
  return kind === 'min' ? Math.min(...values) : Math.max(...values);
}

/** Each currency's sum, or average, least or most, in code order. */
export function partsOf(amounts: readonly Amount[], kind: Reduce = 'sum'): Part[] {
  const held = new Map<string, number[]>();
  for (const a of amounts) held.set(a.currency, [...(held.get(a.currency) ?? []), a.amount]);
  return [...held]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, values]) => ({ currency, amount: reduceOf(kind, values) ?? 0 }));
}

/**
 * A ratio or a difference of two figures, one amount per currency: each half read over the rows in that currency.
 *
 * TWO CURRENCIES ARE NEVER SUBTRACTED OR DIVIDED, so a figure whose halves are in parts, or in two different currencies,
 * is the same figure once per currency. `halves` reads both halves over the rows in one currency, unconverted. A currency
 * in which a half has nothing to read, or a ratio's denominator is zero, has no part; no part at all is `[]`, and the
 * caller refuses, because then there is no currency both halves are in.
 */
export function pairParts(currencies: Iterable<string>, ratio: boolean, halves: (currency: string) => { of: number | null; per: number | null }): Part[] {
  const out: Part[] = [];
  for (const currency of [...new Set(currencies)].sort()) {
    const { of, per } = halves(currency);
    if (of === null || per === null || (ratio && per === 0)) continue;
    out.push({ currency, amount: ratio ? of / per : of - per });
  }
  return out;
}

/**
 * The first field of a list that dates its rows: the first `day`, else the first `instant`, in declared order.
 * An account's `as_of`, an obligation's `due`. `null` when the list has none, and its amounts are dated today.
 */
export function dayFieldOf(fields: Readonly<Record<string, { type: string }>> | readonly { id: string; type: string }[]): string | null {
  const list = Array.isArray(fields)
    ? (fields as readonly { id: string; type: string }[])
    : Object.entries(fields as Readonly<Record<string, { type: string }>>).map(([id, f]) => ({ id, type: f.type }));
  return list.find((f) => f.type === 'day')?.id ?? list.find((f) => f.type === 'instant')?.id ?? null;
}

/** The setting a pack declares for the currency a record adds everything up in. */
export const HOME_CURRENCY_SETTING = 'home_currency';

/** A home currency as a setting holds it, or `null` when it holds none or not a code. */
export const homeFrom = (value: unknown): string | null => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CODE.test(code) ? code : null;
};
