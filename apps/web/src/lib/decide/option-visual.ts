/**
 * WHAT ONE OPTION WOULD CHANGE, AS A SMALL PICTURE ("decisions with their options drawn"): worked out
 * once from the question, the option and what the host knows, and drawn by `OptionVisual.svelte`. Pure, no DOM.
 *
 * AN OPTION THAT CHANGES NOTHING HAS NO PICTURE, and neither has one that cannot be drawn truthfully (a money bar with
 * no balance to set it against): `null`, never a placeholder. An option that already shows a swatch, a figure or a file
 * (`Way.shows`) keeps that and is not read here.
 *
 * WHICH OPTION CHANGES WHAT. Accepting, merging or picking a row applies the question's own money, change and merge;
 * declining, keeping apart or putting off applies none. An option of a custom key applies only what it carries itself
 * (`money`, `change`, `due`), read untyped as the record may send it.
 */

import type { QueueQuestion } from '@braindog/kernel';
import { money } from 'braindog-render';

import { leadFirst, movesOf, nameOrNull, shiftLinesOf, type Moved } from './card.ts';
import { spoken } from './spoken.ts';

/** What the host knows beyond the question; every part is optional and a missing one draws nothing that needs it. */
export type VisualContext = {
  now: number;
  home?: string | null;
  /** The account's balance, or the month's spend, in one currency: what a money option is set against. */
  balance?: Moved | null;
  spend?: Moved | null;
  /** The name of the list a filing goes into, and the row's figure in words. */
  listName?: string | null;
  figure?: string | null;
};

export type OptionVisual =
  | { kind: 'money'; said: string; against: string; basis: 'balance' | 'spend'; share: number; over: boolean }
  | { kind: 'date'; today: number; due: number; days: number; was: number | null; late: boolean }
  | { kind: 'change'; what: string; before: string; after: string }
  | { kind: 'merge'; names: string[]; into: string }
  | { kind: 'filing'; list: string; figure: string }
  /* MANY ROWS AT ONCE (the thinking scope of 24 October, C20): the rows it adds, by name, or what it moves them to. */
  | { kind: 'adds'; list: string; names: string[]; more: number }
  | { kind: 'moves'; list: string; rows: number; moves: { what: string; to: string; n: number }[] };

const rec = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Answers that leave the record as it is. */
const LEAVES = new Set(['reject', 'apart', 'later', 'no', 'keep']);
const APPLIES = (key: string): boolean => key === 'accept' || key === 'merge' || key.startsWith('pick:');

/** `YYYY-MM-DD` as whole days since the epoch, or null for text that is no day on the calendar. */
export function dayOf(v: unknown): number | null {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/u.exec(v.trim()) : null;
  if (!m) return null;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(at);
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null;
  return Math.floor(at / 86_400_000);
}

export { leadFirst };

const comparable = (a: Moved, b: Moved | null | undefined): b is Moved => b != null && a.currency === b.currency && b.amount !== 0;

function moneyVisual(m: Moved, ctx: VisualContext): OptionVisual | null {
  const basis = comparable(m, ctx.balance) ? 'balance' : comparable(m, ctx.spend) ? 'spend' : null;
  const whole = basis === 'balance' ? ctx.balance : basis === 'spend' ? ctx.spend : null;
  if (basis === null || !whole) return null;
  const ratio = Math.abs(m.amount) / Math.abs(whole.amount);
  return {
    kind: 'money',
    said: money(Math.abs(m.amount), m.currency),
    against: money(Math.abs(whole.amount), whole.currency),
    basis,
    share: Math.min(1, ratio),
    over: ratio > 1,
  };
}

function dateVisual(before: unknown, after: unknown, now: number): OptionVisual | null {
  const due = dayOf(after);
  if (due === null) return null;
  const today = Math.floor(now / 86_400_000);
  return { kind: 'date', today, due, days: due - today, was: dayOf(before), late: due < today };
}

type Raw = { field: unknown; before: unknown; after: unknown };

/** The change an option applies: its own `change`, or (for accept, merge, pick) the question's `changes`. */
function changesOf(q: QueueQuestion, o: Record<string, unknown>, own: boolean): Raw[] {
  const mine = rec(o.change);
  if (mine) return [{ field: mine.field ?? mine.label, before: mine.before, after: mine.after }];
  if (own) return [];
  const list = (q as unknown as Record<string, unknown>).changes;
  return (Array.isArray(list) ? list : []).flatMap((c): Raw[] => {
    const r = rec(c);
    return r ? [{ field: r.label ?? r.field, before: r.before ?? r.from, after: r.after ?? r.to }] : [];
  });
}

/**
 * THE PICTURE FOR ONE OPTION, or `null`. The strongest claim first: a merge, then money, then a date, then a filing
 * into a list, then a plain field change.
 */
export function visualOf(q: QueueQuestion, option: { key: string }, ctx: VisualContext): OptionVisual | null {
  const key = option.key;
  if (LEAVES.has(key)) return null;
  const o = rec(option) ?? {};
  const applies = APPLIES(key);
  const own = !applies;
  if (own && o.money === undefined && o.change === undefined && o.due === undefined) return null;

  if (key === 'merge' || key.startsWith('pick:')) {
    const all = (q.candidates ?? []).map((c) => ({ at: c.at, name: nameOrNull(spoken(c.name)), kept: c.kept === true }));
    const named = all.filter((c): c is { at: string; name: string; kept: boolean } => c.name !== null);
    if (named.length < 2 || named.length !== all.length) return null;
    const row = key.startsWith('pick:') ? key.slice(5) : null;
    const into = (row !== null ? named.find((c) => c.at === row) : named.find((c) => c.kept)) ?? named[0]!;
    return { kind: 'merge', names: named.map((c) => c.name), into: into.name };
  }

  const moves = own ? movesOf(o.money) : movesOf((q as unknown as Record<string, unknown>).money);
  const changes = changesOf(q, o, own);
  const lone = moves.length === 1 ? moves[0]! : null;
  if (lone) {
    const drawn = moneyVisual(lone, ctx);
    if (drawn) return drawn;
  }

  const day = own && o.due !== undefined ? { before: null, after: o.due } : changes.find((c) => dayOf(c.after) !== null);
  if (day) {
    const drawn = dateVisual(day.before, day.after, ctx.now);
    if (drawn) return drawn;
  }

  const list = nameOrNull(ctx.listName);
  const figure = lone ? money(Math.abs(lone.amount), lone.currency) : nameOrNull(ctx.figure);
  if (applies && list !== null && figure !== null && changes.length === 0) return { kind: 'filing', list, figure };

  const line = applies && changes.length > 0 ? shiftLinesOf(q, ctx.home).find((l) => l.said === null) : undefined;
  if (line) return { kind: 'change', what: line.what, before: line.before, after: line.after };
  const first = own ? changes[0] : undefined;
  if (first) {
    const [b, a] = [nameOrNull(first.before), nameOrNull(first.after)];
    if (b !== null && a !== null && b !== a) return { kind: 'change', what: nameOrNull(first.field) ?? '', before: b, after: a };
  }
  return applies ? rowsVisual(q) : null;
}

/**
 * WHAT A CHANGE TO MANY ROWS DOES, DRAWN (the thinking scope of 24 October, C20: "every open card draws what its options
 * change"): the cleanup cards on his record, nine projects moved or forty keys retired or a person added, drew nothing,
 * since `changes` says one row. The record says them once (`rows_said`): the rows it adds by name, else what it moves
 * them to, most first. Nothing is drawn where it says neither.
 */
export function rowsVisual(q: QueueQuestion): OptionVisual | null {
  const said = q.rows_said;
  const list = nameOrNull(said?.list);
  if (!said || list === null) return null;
  const names = said.adds.map((n) => nameOrNull(spoken(n))).filter((n): n is string => n !== null);
  if (names.length > 0) return { kind: 'adds', list, names, more: said.more + (said.adds.length - names.length) };
  const moves = said.moves.flatMap((m) => {
    const to = nameOrNull(typeof m.to === 'boolean' ? (m.to ? 'yes' : 'no') : String(m.to));
    return to === null ? [] : [{ what: nameOrNull(m.label) ?? nameOrNull(m.field.replace(/_/gu, ' ')) ?? '', to, n: m.n }];
  });
  return moves.length > 0 ? { kind: 'moves', list, rows: said.rows, moves } : null;
}
