/**
 * WHAT A CARD'S PICTURES ARE DRAWN AGAINST, worked out from rows already read (`ground.svelte.ts` reads them once for
 * the screen). Pure, no DOM and no client. The balance of the account the question's row sits in, that account's
 * outgoings this month, the name of what the row is filed under, and the row's own figure.
 *
 * NO LIST IS NAMED HERE. The row says its own account, category and amount by field, so a record that calls them
 * something else simply draws nothing, as a missing part always does.
 */

import { money } from 'braindog-render';

import { nameOrNull, type Moved } from './card.ts';
import type { VisualContext } from './option-visual.ts';

export type GroundRow = Record<string, unknown>;
export type Ground = Omit<VisualContext, 'now'>;
/** Rows by spoken id (`things#4`), and the rows of one list that sit in one account, by `list|account`. */
export type GroundRead = { rows: Map<string, GroundRow>; month: Map<string, GroundRow[]> };

const SPOKEN = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u;

/** The spoken id a question is about, when it names a row. */
export function rowOf(about: unknown): { spoken: string; register: string } | null {
  const m = typeof about === 'string' ? SPOKEN.exec(about.trim()) : null;
  return m ? { spoken: `${m[1]}#${m[2]}`, register: m[1]! } : null;
}

/** A spoken id held in a field, as text. */
export const refOf = (v: unknown): string | null => rowOf(v)?.spoken ?? null;

function movedOf(v: unknown): Moved | null {
  if (typeof v !== 'object' || v === null) return null;
  const { amount, currency } = v as { amount?: unknown; currency?: unknown };
  const n = typeof amount === 'string' && /^-?\d+$/u.test(amount) ? Number(amount) : amount;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || typeof currency !== 'string' || !/^[A-Za-z]{3}$/u.test(currency)) return null;
  return { amount: n, currency: currency.toUpperCase() };
}

/** The key a month of one list's rows in one account is kept under. */
export const monthKey = (register: string, account: string): string => `${register}|${account}`;

/** A row's outgoing for the month of `now`, or null when it is not one: money in, a transfer, a void, another month. */
function outOf(r: GroundRow, now: number): Moved | null {
  const m = movedOf(r.amount);
  if (!m || r.transfer === true || r.state === 'void') return null;
  const day = typeof r.on === 'string' ? r.on : typeof r.date === 'string' ? r.date : '';
  const d = new Date(now);
  if (!day.startsWith(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)) return null;
  const out = r.direction === 'out' || (r.direction === undefined && m.amount < 0);
  return out ? { amount: Math.abs(m.amount), currency: m.currency } : null;
}

/** The ground for one question, or undefined when its row or what it needs was not read. */
export function groundOf(about: unknown, read: GroundRead, now: number, listName?: string | null): Ground | undefined {
  const at = rowOf(about);
  const row = at ? read.rows.get(at.spoken) : undefined;
  if (!at || !row) return undefined;
  const out: Ground = {};

  const account = refOf(row.account);
  const held = account ? movedOf(read.rows.get(account)?.balance) : null;
  if (held) out.balance = held;
  if (account) {
    const all = (read.month.get(monthKey(at.register, account)) ?? []).map((r) => outOf(r, now)).filter((m): m is Moved => m !== null);
    const cur = held?.currency ?? movedOf(row.amount)?.currency;
    const sum = all.filter((m) => m.currency === cur).reduce((n, m) => n + m.amount, 0);
    if (cur && sum > 0) out.spend = { amount: sum, currency: cur };
  }

  const filed = refOf(row.category);
  const filedRow = filed ? read.rows.get(filed) : undefined;
  const name = nameOrNull(filedRow?.name ?? filedRow?.title) ?? nameOrNull(listName);
  if (name) out.listName = name;

  const figure = movedOf(row.amount);
  if (figure) out.figure = money(Math.abs(figure.amount), figure.currency);
  return Object.keys(out).length > 0 ? out : undefined;
}
