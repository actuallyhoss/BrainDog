/**
 * A KEY NUMBER'S PAST VALUES, PURE (the KPI plan of 21 October, 2.8): the short list under the sheet, "its points as a
 * short list with who wrote each, newest first", each one changed or taken out through the app's one row writer.
 *
 * THE VALUES ARE THE READINGS THE NUMBER ALREADY HAS: rows of the readings list (Numbers), under the number's measure on
 * its project, matched as the kernel's page source matches them (`sources/kpis.ts` `readSeries`): the measure whole on
 * the project, or "measure, project" as an import glues the name on, folded for case and spacing. A number worked out
 * from the lists has no readings, so it has no past here; its values are the figure's.
 *
 * WHO SET EACH ONE is read off the row's own history: the newest change that wrote its value, else whoever made it, said
 * as every line of the app says a person, an agent or a rule (`record/names.ts` `actor`).
 *
 * A CHANGE WRITES ONLY THE VALUE: a plain number as `value`, money as `amount` in minor units of the reading's own
 * currency, so a reading in dollars stays in dollars whatever the number now counts in. Putting one back writes what it
 * held before, and a reading taken out is put back by `restore`.
 *
 * PLAIN TYPESCRIPT, so `past.test.ts` loads it under `node --test`.
 */

import { exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { actor } from '../record/names.ts';
import { isMoney, type Entry, type Fields, type MoneyValue } from '../record/schema.ts';
import { targetOf } from './sheet.ts';

/** How many past values the sheet lists: two months of a weekly number, enough to see a slip and put it right. */
export const PAST_MOST = 8;

/** How many readings of the project one read asks for, newest first, before they are matched to the number. */
export const PAST_READ = 200;

/** One past value as the sheet lists it: its row, when, and what it held. */
export type Past = {
  seq: number;
  version: number;
  at: string;
  /** A plain number, or `null` for money. */
  value: number | null;
  /** Money in minor units of its own currency, or `null` for a plain number. */
  money: MoneyValue | null;
  /** The unit it was written in, where it says one. */
  unit: string;
  /** What the box holds when it is changed: the value as a person types it back, "1,200" or "8,750.5". */
  typed: string;
};

/** The number as its past is read: the name its readings are saved under (its own when it says none). */
export type PastFor = { name: string; measure?: string | null | undefined };

/** A measure's name as it is matched: case and spacing folded, "Servers ,Oxbow.gg" is "servers, oxbow.gg". */
const folded = (s: string): string => s.toLowerCase().replace(/\s*,\s*/gu, ', ').replace(/\s+/gu, ' ').trim();

const measureOf = (k: PastFor): string => (k.measure ?? '').trim() || k.name.trim();

/**
 * THE READ'S FILTER, so one ask brings this number's readings and not the project's other measures: the measure on the
 * project, or the glued name on any row. The kernel's `where` grammar (`@braindog/where`), as `client.list` takes it.
 */
export function pastWhere(k: PastFor, project: { id: string; name: string }, field: string): unknown {
  const measure = measureOf(k);
  const glued = project.name.trim() === '' ? [] : [{ field: 'name', is: `${measure}, ${project.name.trim()}` }];
  return { any: [{ all: [{ field, is: project.id }, { field: 'name', is: measure }] }, ...glued] };
}

/** Money as a row holds it: an object, or its JSON text where a page sent it so. */
function moneyIn(v: unknown): MoneyValue | null {
  let held = v;
  if (typeof held === 'string' && held.startsWith('{')) {
    try {
      held = JSON.parse(held) as unknown;
    } catch {
      return null;
    }
  }
  return isMoney(held) && Number.isInteger(held.amount) ? { amount: held.amount, currency: held.currency.toUpperCase() } : null;
}

const instantOf = (at: string): number => Date.parse(/^\d{4}-\d{2}-\d{2}$/u.test(at) ? `${at}T00:00:00Z` : at);

/** A figure as a person reads it in a box and types it back: `1200` is "1,200", `0.5` is "0.5". */
const typedOf = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: true });

/**
 * THIS NUMBER'S PAST VALUES among `rows` of the readings list, newest first, `PAST_MOST` at most: each reading of its
 * measure on its project (by the project's row id in `field`), or of the glued name on no project or this one. A row with
 * no day or no value is no value.
 */
export function pastOf(rows: readonly Entry[], k: PastFor, project: { id: string; name: string }, field: string): Past[] {
  const measure = folded(measureOf(k));
  const glued = project.name.trim() === '' ? null : folded(`${measureOf(k)}, ${project.name}`);
  const out: { t: number; p: Past }[] = [];
  for (const r of rows) {
    const f = r.fields;
    if ((f.deleted_at ?? null) !== null || typeof f.name !== 'string') continue;
    const name = folded(f.name);
    const on = f[field];
    const here = on === project.id;
    if (!((name === measure && here) || (glued !== null && name === glued && (here || on === null || on === undefined)))) continue;
    const at = typeof f.at === 'string' ? f.at : '';
    const t = instantOf(at);
    if (!Number.isFinite(t)) continue;
    const money = moneyIn(f.amount);
    const value = money ? null : typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null;
    if (!money && value === null) continue;
    const unit = typeof f.unit === 'string' ? f.unit.trim() : '';
    const typed = money ? typedOf(money.amount / 10 ** exponentOf(money.currency)) : typedOf(value!);
    out.push({ t, p: { seq: r.seq, version: r.version, at, value, money, unit, typed } });
  }
  out.sort((a, b) => b.t - a.t || b.p.seq - a.p.seq);
  return out.slice(0, PAST_MOST).map((x) => x.p);
}

/** An event of a row's history, as the record's `history` sends it, and only the keys read here. */
export type PastEvent = { ts?: unknown; actor?: unknown; field?: unknown };

/**
 * WHO SET A READING'S VALUE: the newest event that wrote `value` or `amount`, else the one that made the row (a create
 * names no field), else the oldest. `null` for a history with nobody in it.
 */
export function setByOf(events: readonly PastEvent[]): string | null {
  const who = (e: PastEvent | undefined): string | null => (typeof e?.actor === 'string' && e.actor.trim() !== '' ? e.actor : null);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const f = events[i]!.field;
    if (f === 'value' || f === 'amount') return who(events[i]);
  }
  return who(events.find((e) => e.field === null || e.field === undefined)) ?? who(events[0]);
}

/** Who set it, in words: "You", a person's name, "Claude", a rule's name. */
export const whoSaid = (by: string, me: string | null, names: ReadonlyMap<string, string>): string => actor(by, me, names).name;

/**
 * THE CHANGE ONE TYPED VALUE WRITES: the value alone, money in minor units of the reading's own currency. An empty box or
 * one that is not a number is said, and nothing is written; the same value again writes nothing (`same`).
 */
export function pastPatchOf(p: Past, typed: string): { ok: true; patch: Fields; same: boolean } | { ok: false; fault: string } {
  const said = typed.trim();
  if (said === '') return { ok: false, fault: copy.kpiReadingEmpty };
  const n = targetOf(said);
  if (n === null) return { ok: false, fault: copy.kpiNotDigits(said) };
  if (p.money) {
    const amount = Math.round(n * 10 ** exponentOf(p.money.currency));
    return { ok: true, patch: { amount: { amount, currency: p.money.currency } }, same: amount === p.money.amount };
  }
  return { ok: true, patch: { value: n }, same: n === p.value };
}

/** The patch that puts a changed value back as it was. */
export const pastBackOf = (p: Past): Fields => (p.money ? { amount: { ...p.money } } : { value: p.value });

/** A past value once `patch` has been written over it, at the row's new version: what the list draws after a change. */
export function pastAfter(p: Past, patch: Fields, version: number): Past {
  if (p.money) {
    const money = isMoney(patch.amount) ? { amount: patch.amount.amount, currency: patch.amount.currency } : p.money;
    return { ...p, version, money, typed: typedOf(money.amount / 10 ** exponentOf(money.currency)) };
  }
  const value = typeof patch.value === 'number' ? patch.value : p.value;
  return { ...p, version, value, typed: value === null ? p.typed : typedOf(value) };
}
