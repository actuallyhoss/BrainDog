/**
 * The figures a row's page draws as tiles, and the one line under each chart that says what it means.
 *
 * A ROW'S PAGE IS MOSTLY WORDS: its properties, its prose, its history. A tile is drawn only where there is a figure the
 * record holds and a chart that answers a question about it, and never where there is not (no number tile
 * without a chart, no chart without its reading line). Three, each from the record and nothing else:
 *
 *   - the row's own money compared with itself: a project's year against the year before, from its two money fields;
 *   - what came in for a project, month by month, from the record's own `project-in-by-month` figure;
 *   - the open work that points at the row, from the list that says who holds its rows (`hand:`): a project's tasks, a
 *     person's, a task's own steps, by state.
 *
 * Every one of them hides itself when the record does not answer, refuses, or answers nothing to draw. A figure made up
 * to fill a tile is the one thing this page must never show.
 *
 * OUT OF THE COMPONENT so `node --test` can run it, as `lead.ts` and `said.ts` beside it are, which is why its imports are
 * relative and never `$lib`.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { valueSaid } from '../../../../lib/voice.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** Writes an amount in minor units as a screen writes one: the page hands in `Money`'s own rule. */
export type Format = (minor: number, currency: string) => string;

/* ── the row's money against itself ─────────────────────────────────────── */

type MoneyField = { id: string; type: string };
type Held = { amount?: unknown; currency?: unknown };

/** The row's money fields, in one currency, as bars: the figure the page leads with first, in ink. */
export type Compared = { currency: string; items: { label: string; value: number; tone?: 'ink' }[] };

const heldMoney = (v: unknown): { amount: number; currency: string } | null => {
  if (typeof v !== 'object' || v === null) return null;
  const { amount, currency } = v as Held;
  return typeof amount === 'number' && Number.isInteger(amount) && typeof currency === 'string' ? { amount, currency } : null;
};

/**
 * TWO OR MORE AMOUNTS ON ONE ROW, IN ONE CURRENCY, ARE A COMPARISON the row already makes: a project's "Earned in a year"
 * beside "Earned the year before" is the question "is it growing". The figure the page leads with is the first bar and
 * the ink one; the rest are greys. An amount in another currency is not one of them, because two currencies are never
 * drawn on one scale, and a row with one amount has nothing to compare.
 */
export function comparedOf<F extends MoneyField>(fields: readonly F[], values: Readonly<Record<string, unknown>>, lead: string, label: (f: F) => string): Compared | null {
  const first = heldMoney(values[lead]);
  if (!first) return null;
  const items: Compared['items'] = [];
  for (const f of fields) {
    if (f.type !== 'money') continue;
    const held = heldMoney(values[f.id]);
    if (!held || held.currency !== first.currency) continue;
    const item = { label: label(f), value: held.amount };
    if (f.id === lead) items.unshift({ ...item, tone: 'ink' });
    else items.push(item);
  }
  return items.length >= 2 ? { currency: first.currency, items } : null;
}

/** "Earned in a year is 23% above earned the year before." Said of the first two bars, the lead against the next. */
export function comparedSaid(c: Compared): string {
  const [a, b] = c.items;
  if (!a || !b) return '';
  const other = b.label.charAt(0).toLowerCase() + b.label.slice(1);
  if (a.value === b.value) return figureWords.same(a.label, other);
  if (b.value === 0) return figureWords.nothing(b.label);
  /* A SHARE OF A NEGATIVE AMOUNT IS NOT A SHARE ANYBODY SAYS, so only which way it went is. */
  if (b.value < 0) return a.value > b.value ? figureWords.higher(a.label, other) : figureWords.lower(a.label, other);
  const share = Math.round((Math.abs(a.value - b.value) / b.value) * 100);
  if (share === 0) return figureWords.same(a.label, other);
  return a.value > b.value ? figureWords.above(a.label, share, other) : figureWords.below(a.label, share, other);
}

/* ── what came in for a project, month by month ─────────────────────────── */

/**
 * THE RECORD'S OWN FIGURE FOR WHAT CAME IN FOR ONE PROJECT, month by month, named `project-in-by-month:<name>`. Its id is
 * the figure's and not a list's: which list it reads and which of that list's fields names the project are its
 * declaration's (`aboutOf`), so this page never writes either down.
 */
export const MONEY_IN = 'project-in-by-month';
/** How many months the tile draws: a year, and the month the clock is in. */
export const MONTHS_SHOWN = 12;

/**
 * What a parameterised figure is about, from its declaration: the list it reads (`source: register.<list>`) and the
 * field of that list its parameter fills (`<field> is {{it}}`). A row's page asks the figure when that field points at
 * the row's own list, which is how "this figure is about projects" is known without naming projects.
 */
export function aboutOf(metric: { source?: unknown; where?: unknown } | undefined): { list: string; field: string } | null {
  if (typeof metric?.source !== 'string' || typeof metric.where !== 'string') return null;
  const list = /^register\.([a-z][a-z0-9_]*)$/u.exec(metric.source)?.[1];
  const field = /(?:^|,\s*)([a-z][a-z0-9_]*) is \{\{it\}\}/u.exec(metric.where)?.[1];
  return list && field ? { list, field } : null;
}

export type Month = { key: string; value: number; partial: boolean };
export type MoneyIn = { currency: string; months: Month[]; total: number };

type Group = { key?: unknown; value?: unknown; state?: unknown; parts?: unknown };

/**
 * A `project-in-by-month` reading as the months a chart draws, or nothing.
 *
 * A MONTH NOTHING CAME IN IS A ZERO HERE. The record answers it as an empty bucket, a gap, and for money in a gap is
 * nothing coming in, which a line has to draw at the floor rather than skip. A reading in more than one currency that was
 * not added up is not drawn at all, since its months would be amounts on different scales; nor is one where nothing came
 * in, since a flat line at zero says less than no tile.
 */
export function monthsOf(reading: unknown): MoneyIn | null {
  if (typeof reading !== 'object' || reading === null) return null;
  const r = reading as { unit?: unknown; groups?: unknown; current?: unknown; parts?: unknown };
  if (typeof r.unit !== 'string' || !/^[A-Z]{3}$/u.test(r.unit) || !Array.isArray(r.groups)) return null;
  if (Array.isArray(r.parts) && r.parts.length > 0) return null;
  const months: Month[] = [];
  for (const g of r.groups as Group[]) {
    if (typeof g !== 'object' || g === null || typeof g.key !== 'string' || !/^\d{4}-\d{2}$/u.test(g.key)) continue;
    if (Array.isArray(g.parts) && g.parts.length > 0) return null;
    const value = g.value === null || g.value === undefined ? 0 : typeof g.value === 'number' && Number.isFinite(g.value) ? Math.round(g.value) : null;
    if (value === null) return null;
    months.push({ key: g.key, value, partial: g.state === 'partial' || g.key === r.current });
  }
  const shown = months.slice(-MONTHS_SHOWN);
  const total = shown.reduce((n, m) => n + m.value, 0);
  return shown.length > 0 && total > 0 ? { currency: r.unit, months: shown, total } : null;
}

/** A month's bucket as a sentence says it: "Jul" inside the year it is read in, "Jul 2025" outside it. */
export function monthSaid(key: string, now: number): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return y === new Date(now).getUTCFullYear() ? name : `${name} ${y}`;
}

/** "The best month was Jul, at £420; £120 so far this month." */
export function moneyInSaid(m: MoneyIn, now: number, format: Format): string {
  const best = m.months.reduce((a, b) => (b.value > a.value ? b : a));
  const last = m.months.at(-1);
  if (m.months.filter((x) => x.value > 0).length === 1) return figureWords.onlyMonth(monthSaid(best.key, now));
  const lead = figureWords.best(monthSaid(best.key, now), format(best.value, m.currency));
  return last && last.partial && last !== best ? `${lead}; ${figureWords.soFar(format(last.value, m.currency))}` : `${lead}.`;
}

/* ── the open work that points at the row ───────────────────────────────── */

/** How many open rows one read counts; past it the figure says "at least". */
export const WORK_READ = 500;

type StateDecl = { id: string; values?: readonly string[]; labels?: Readonly<Record<string, string>> };
type WorkDecl = { state?: string | undefined; done?: readonly string[] | undefined; fields: readonly { id: string; type: string; to?: string | undefined; deadline?: boolean | undefined }[] };

/** Which field of the work list points at a row of `register`, and how the list says its state and its deadline. */
export type Via = { field: string; state: StateDecl; done: readonly string[]; deadline: string | null };

export function viaOf(work: WorkDecl | undefined, register: string): Via | null {
  if (!work?.state) return null;
  const field = work.fields.find((f) => f.type === 'ref' && f.to === register);
  const state = work.fields.find((f) => f.id === work.state) as StateDecl | undefined;
  if (!field || !state?.values?.length) return null;
  return { field: field.id, state, done: work.done ?? [], deadline: work.fields.find((f) => f.deadline === true)?.id ?? null };
}

/** The predicate one read of the open work asks: pointing here by its spoken id, and not finished. */
export const openWhere = (via: Via, spoken: string): string =>
  via.done.length > 0 ? `${via.field} is ${spoken}, ${via.state.id} is not ${via.done.join(' or ')}` : `${via.field} is ${spoken}`;

export type WorkPart = { value: string; label: string; count: number };
export type OpenWork = { total: number; atLeast: boolean; late: number; parts: WorkPart[] };

/**
 * The open rows counted by state, in the order the list declares its states, and how many are past their day.
 *
 * "Late" is the list's own deadline field before `today`, the reader's day; a row with no day is never late. A state the
 * list does not declare is counted under its own words rather than dropped, so the parts always add up to the figure.
 */
export function openWorkOf(rows: readonly { fields?: unknown }[], via: Via, today: string, atLeast: boolean): OpenWork | null {
  const counts = new Map<string, number>();
  let late = 0;
  let total = 0;
  for (const row of rows) {
    const f = (typeof row.fields === 'object' && row.fields !== null ? row.fields : {}) as Record<string, unknown>;
    const value = typeof f[via.state.id] === 'string' ? (f[via.state.id] as string) : '';
    if (via.done.includes(value)) continue;
    total++;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    const day = via.deadline ? f[via.deadline] : undefined;
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(day) && day.slice(0, 10) < today) late++;
  }
  if (total === 0) return null;
  const order = [...(via.state.values ?? []), ...[...counts.keys()].filter((v) => !(via.state.values ?? []).includes(v))];
  const parts = order.flatMap((value) => {
    const count = counts.get(value) ?? 0;
    return count > 0 ? [{ value, label: value ? valueSaid(via.state, value) : figureWords.noState, count }] : [];
  });
  return { total, atLeast, late, parts };
}

/** "5 to do, 3 doing and 1 to check." The largest three states, then how many more; the late clause is the page's. */
export function openWorkSaid(w: OpenWork): string {
  const ranked = [...w.parts].sort((a, b) => b.count - a.count);
  const named = ranked.slice(0, 3).map((p) => `${p.count} ${p.label.charAt(0).toLowerCase()}${p.label.slice(1)}`);
  const rest = ranked.slice(3).reduce((n, p) => n + p.count, 0);
  if (rest > 0) named.push(figureWords.more(rest));
  const said = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : (named[0] ?? '');
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
}

/* ── the reads ───────────────────────────────────────────────────────────── */

export type FigureReader = {
  /** What came in for the project of this name, month by month, or nothing. */
  moneyIn(name: string): Promise<MoneyIn | null>;
  /** The open rows of the work list `register` pointing at the row spoken as `spoken`, or nothing. */
  openWork(register: string, via: Via, spoken: string, today: string): Promise<OpenWork | null>;
};

/**
 * One reader for one tab. Each read is one call, and a refusal, a failure or an answer with nothing to draw is `null`,
 * which the page draws as no tile: these are the row's figures, not the row, and the row is already on screen.
 *
 * THE PREDICATE GOES AS WORDS, WRAPPED SO IT IS SENT AS A STRING THE HOST DECODES (`today-live.ts` `carried`), and it names
 * the row by its spoken id, `things#3`, which the record resolves in the list it names, so a project called "Kiln, the
 * shop" is never cut at its comma.
 */
export function figureReader(base: string, io?: Fetch): FigureReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    async moneyIn(name) {
      const out = await client.metric(`${MONEY_IN}:${name}`).catch(() => null);
      return out?.ok ? monthsOf(out.value) : null;
    },
    async openWork(register, via, spoken, today) {
      const where = openWhere(via, spoken);
      const out = await client.list({ register, where: { toJSON: () => where }, limit: WORK_READ }).catch(() => null);
      if (!out?.ok) return null;
      return openWorkOf(out.value.rows as { fields?: unknown }[], via, today, out.value.cursor !== null);
    },
  };
}

/** The tiles' own words, kept beside the functions that say them. */
export const figureWords = {
  above: (a: string, share: number, b: string): string => `${a} is ${share}% above ${b}.`,
  below: (a: string, share: number, b: string): string => `${a} is ${share}% below ${b}.`,
  same: (a: string, b: string): string => `${a} is the same as ${b}.`,
  higher: (a: string, b: string): string => `${a} is above ${b}.`,
  lower: (a: string, b: string): string => `${a} is below ${b}.`,
  nothing: (b: string): string => `${b} was nothing.`,
  best: (month: string, amount: string): string => `The best month was ${month}, at ${amount}`,
  soFar: (amount: string): string => `${amount} so far this month.`,
  onlyMonth: (month: string): string => `All of it came in ${month}.`,
  more: (n: number): string => `${n} more`,
  late: (n: number): string => (n === 1 ? '1 is late.' : `${n} are late.`),
  noState: 'No status',
} as const;
