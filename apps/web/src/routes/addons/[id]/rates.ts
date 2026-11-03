/**
 * What the rates tile on an add-on's page draws: the newest rate of each pair of currencies, and the
 * last 90 days of a pair once it holds rates enough to say something.
 *
 * THE TILE HELD NO RATE. It was a sentence and a button, so the page where the fetch is set up never showed what it
 * fetched. The rates are rows of the list that declares `rates:` (the kernel's `fx.ts`), so the page asks the plugin's
 * own lists what they declare and reads the one that says it. No list is named here: an add-on that keeps its rates
 * under another name draws the same tile.
 *
 * WHICH LIST THAT IS, THE KERNEL SAYS (`ratesRole`, `roles.ts`), so the tile draws the rates the conversion reads. It
 * was worked out here from the key alone, and a record whose rates list is older than the key converted its money and
 * drew no rate on this page.
 *
 * Out of the component so `node --test` can run it, since a Svelte page does not mount there (`waiting.ts`).
 */

import { ratesFrom, ratesRole, type Rate } from '@braindog/kernel';
import { day as longDay, shortDay } from 'braindog-render';

/** How far back the line goes. */
export const WINDOW_DAYS = 90;

/**
 * How many points a pair needs before its line is drawn.
 *
 * THREE, WHICH IS THE BOARD'S RULE FOR EVERY CHART: "a chart is drawn only when it has at least three points and says
 * something; else the tile shows the number". With two rates the tile says which way the rate went in words (`moved`),
 * so the second day is not silent.
 */
export const CHART_FROM = 3;

const DAY_MS = 86_400_000;

/** One pair as the tile draws it: one `currency` is `rate` of `base`, as of `asOf`. */
export type PairRead = {
  currency: string;
  base: string;
  /** The newest rate, however old. */
  rate: number;
  asOf: string;
  /** One point a day over the last `WINDOW_DAYS`, oldest first. */
  points: { day: string; rate: number }[];
  /** Whether `points` are enough to draw. */
  chart: boolean;
  /** Which way the rate went across `points`, and from what; `null` with fewer than two, or when it did not move. */
  moved: { dir: 'up' | 'down'; from: number; since: string } | null;
};

/** A list as far as the role asks: its id and what it says under `rates:`. */
export type RatesDecl = { id: string; rates?: unknown };

/**
 * The list holding the record's rates, with the field playing each part, or `null`.
 *
 * THE KERNEL'S ANSWER (`ratesRole`), NOT ONE WORKED OUT HERE: the list that declares `rates:`, or, on a record older
 * than the key, the list that played the role by its name, read with the parts under their own names. Two declaring
 * lists are none, which is its rule too (`roles.ts` `roleOf`): choosing one would draw one list's rates on a guess.
 */
export function ratesListOf(lists: Iterable<RatesDecl>): { register: string; fields: Record<string, string> } | null {
  const role = ratesRole(lists);
  return role ? { register: role.register, fields: { ...role.fields } } : null;
}

/** The two reads the tile makes, as the record's client answers them. */
export type RatesCalls = {
  schema(register: string): Promise<{ ok: boolean; value?: unknown }>;
  list(args: { register: string; limit: number; cursor?: string | null }): Promise<{ ok: boolean; value?: { rows: unknown[]; cursor: string | null } }>;
};

/** The most pages of rates read: a rate a day for two currencies over years fits, and a runaway feed stops here. */
const MOST_PAGES = 6;

/**
 * Every rate the record holds, read off the one list among `registers` that holds the rates (`ratesListOf`). Nothing
 * when none does or the record refuses, so the tile stays the sentence and the button it was.
 */
export async function readRates(calls: RatesCalls, registers: readonly string[]): Promise<Rate[]> {
  const decls = await Promise.all(
    registers.map(async (id): Promise<RatesDecl> => {
      const out = await calls.schema(id).catch(() => null);
      const body = out?.ok ? (out.value as { rates?: unknown } | null) : null;
      return { id, ...(body?.rates === undefined ? {} : { rates: body.rates }) };
    }),
  );
  const held = ratesListOf(decls);
  if (!held) return [];
  const { currency, base, rate, as_of: asOf } = held.fields;
  if (!currency || !base || !rate || !asOf) return [];
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const out: Awaited<ReturnType<RatesCalls['list']>> | null = await calls
      .list({ register: held.register, limit: 500, ...(cursor === null ? {} : { cursor }) })
      .catch(() => null);
    if (!out?.ok || !out.value) return [];
    for (const row of out.value.rows) rows.push((row as { fields?: Record<string, unknown> }).fields ?? {});
    cursor = out.value.cursor;
    if (cursor === null) break;
  }
  return ratesFrom(rows, { currency, base, rate, as_of: asOf });
}

/**
 * Each pair the rates quote, in code order, with its newest rate and its last `WINDOW_DAYS`.
 *
 * A PAIR IS READ INTO THE HOME CURRENCY when it is one of the two, because that is the question the tile answers ("what
 * is a dollar worth here"); else the way its newest row quotes it. A row quoted the other way round is the same pair,
 * read as its inverse, and on one day the row quoted the way the pair is read wins over an inverse (`rateFor`'s rule).
 */
export function pairsOf(rates: readonly Rate[], today: string, home: string | null): PairRead[] {
  const groups = new Map<string, Rate[]>();
  for (const r of rates) {
    const key = [r.currency, r.base].sort().join(' ');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const out: PairRead[] = [];
  for (const rows of groups.values()) {
    const newest = rows.reduce((a, b) => (b.as_of > a.as_of ? b : a));
    const base = home !== null && (newest.currency === home || newest.base === home) ? home : newest.base;
    const currency = newest.currency === base ? newest.base : newest.currency;
    const byDay = new Map<string, { rate: number; direct: boolean }>();
    for (const r of rows) {
      const direct = r.base === base;
      const kept = byDay.get(r.as_of);
      if (kept && kept.direct && !direct) continue;
      byDay.set(r.as_of, { rate: direct ? r.rate : 1 / r.rate, direct });
    }
    const all = [...byDay].map(([day, v]) => ({ day, rate: v.rate })).sort((a, b) => (a.day < b.day ? -1 : 1));
    const last = all[all.length - 1]!;
    const points = all.filter((p) => p.day >= from);
    const first = points[0];
    const moved =
      points.length >= 2 && first && first.rate !== last.rate
        ? { dir: last.rate > first.rate ? ('up' as const) : ('down' as const), from: first.rate, since: first.day }
        : null;
    out.push({ currency, base, rate: last.rate, asOf: last.day, points, chart: points.length >= CHART_FROM, moved });
  }
  return out.sort((a, b) => (a.currency + a.base < b.currency + b.base ? -1 : 1));
}

/** A rate as a person reads it: five figures, so 48.5 stays 48.5 and a small one keeps what it says. */
export const rateNumber = (n: number): string => new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 5 }).format(n);

/** "1 USD is 48.5 EGP". */
export const rateSaid = (p: Pick<PairRead, 'currency' | 'base' | 'rate'>): string => `1 ${p.currency} is ${rateNumber(p.rate)} ${p.base}`;

/** Under it: the day the rate is of, and which way it has gone when the last 90 days say. */
export function rateNote(p: PairRead): string {
  const asOf = `As of ${longDay(p.asOf)}.`;
  if (!p.moved) return asOf;
  return `${asOf} ${p.moved.dir === 'up' ? 'Up' : 'Down'} from ${rateNumber(p.moved.from)} on ${shortDay(p.moved.since)}.`;
}

/** The sentence the line reads as: "USD in EGP, 14 days, from 48 to 48.5". */
export const lineSaid = (p: PairRead): string => {
  const first = p.points[0];
  if (!first) return rateSaid(p);
  return `${p.currency} in ${p.base}, ${shortDay(first.day)} to ${shortDay(p.asOf)}, from ${rateNumber(first.rate)} to ${rateNumber(p.rate)}`;
};
