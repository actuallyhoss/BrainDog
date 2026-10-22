/**
 * WHAT ONE OPTION WOULD CHANGE, AS A SMALL PICTURE, for the decision card inside a chat app: the web question page's
 * picture (`apps/web/src/lib/decide/option-visual.ts`), worked out here from the `governance` answer and drawn by the
 * card's own script, since a sandboxed card can load nothing of the web app.
 *
 * THE SAME FIVE KINDS, THE SAME RULES, THE SAME SHAPE, so the two draw one picture of one option: a merge (the names and
 * the one they become), money against the account's balance, a due day against today, a figure filed into its list, and
 * a field from what it holds to what it will. The strongest claim first. An option that leaves the record as it is, or
 * one that cannot be drawn truthfully (money with no balance to set it against), has none: `null`, never a placeholder.
 *
 * WHAT IT IS DRAWN AGAINST IS THE GROUND (`Ground`): the balance of the account the question's row sits in, the name of
 * what the row is filed under, and the row's own figure, read by the door from rows the caller may read
 * (`answer.ts` `groundOf`). A part not read draws nothing that needs it, as on the web.
 *
 * Pure: no record, no clock. `now` is handed in.
 */

import { exponentOf } from '@braindog/kernel';

/** An amount in minor units and its currency, said as a person reads it: "GBP 1,200", "JPY 5,000". */
export function moneyLine(amount: number, currency: string): string {
  /* THE ISO 4217 EXPONENT A RECORD STORES, from the kernel's one table; an unknown code is said with two decimals. */
  const digits = exponentOf(currency);
  const major = amount / 10 ** digits;
  return `${currency} ${major.toLocaleString('en', { maximumFractionDigits: digits })}`;
}

/** An amount in minor units and its currency. */
export type Moved = { amount: number; currency: string };

/** What a card's pictures are drawn against; every part is optional. */
export type Ground = { balance?: Moved | null; spend?: Moved | null; listName?: string | null; figure?: string | null };

/** The web's `OptionVisual`, kind for kind. */
export type OptionVisual =
  | { kind: 'money'; said: string; against: string; basis: 'balance' | 'spend'; share: number; over: boolean }
  | { kind: 'date'; today: number; due: number; days: number; was: number | null; late: boolean }
  | { kind: 'change'; what: string; before: string; after: string }
  | { kind: 'merge'; names: string[]; into: string }
  | { kind: 'filing'; list: string; figure: string };

const rec = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Words a person reads, or null: text, a number or a yes/no, never an object or an id-shaped nothing. */
export function plain(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim().slice(0, 80);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return null;
}

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

/** The money a value says, one move a row: `{ amount, currency }`, or a list of them. */
export function movesOf(v: unknown): Moved[] {
  const one = (x: unknown): Moved | null => {
    const r = rec(x);
    return r && typeof r.amount === 'number' && Number.isSafeInteger(r.amount) && typeof r.currency === 'string' && /^[A-Za-z]{3}$/u.test(r.currency)
      ? { amount: r.amount, currency: r.currency.toUpperCase() }
      : null;
  };
  return (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(one).filter((m): m is Moved => m !== null);
}

const comparable = (a: Moved, b: Moved | null | undefined): b is Moved => b != null && a.currency === b.currency && b.amount !== 0;

function moneyVisual(m: Moved, g: Ground): OptionVisual | null {
  const basis = comparable(m, g.balance) ? 'balance' : comparable(m, g.spend) ? 'spend' : null;
  const whole = basis === 'balance' ? g.balance : basis === 'spend' ? g.spend : null;
  if (basis === null || !whole) return null;
  const ratio = Math.abs(m.amount) / Math.abs(whole.amount);
  return {
    kind: 'money',
    said: moneyLine(Math.abs(m.amount), m.currency),
    against: moneyLine(Math.abs(whole.amount), whole.currency),
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
function changesOf(row: Record<string, unknown>, o: Record<string, unknown>, own: boolean): Raw[] {
  const mine = rec(o.change);
  if (mine) return [{ field: mine.label ?? mine.field, before: mine.before, after: mine.after }];
  if (own) return [];
  return (Array.isArray(row.changes) ? row.changes : []).flatMap((c): Raw[] => {
    const r = rec(c);
    return r ? [{ field: r.label ?? r.field, before: r.before ?? r.from, after: r.after ?? r.to }] : [];
  });
}

/**
 * THE PICTURE FOR ONE OPTION, or `null`. `row` is the question as `governance` answers it (its `merge`, `money` and
 * `changes`), `key` the option's id, `option` its own entry in the question's options when it has one.
 */
export function visualOf(row: Record<string, unknown>, key: string, option: Record<string, unknown> | null, ground: Ground, now: number): OptionVisual | null {
  if (LEAVES.has(key)) return null;
  const o = option ?? {};
  const applies = APPLIES(key);
  const own = !applies;
  if (own && o.money === undefined && o.change === undefined && o.due === undefined) return null;

  if (key === 'merge' || key.startsWith('pick:')) {
    const merge = rec(row.merge);
    const all = (Array.isArray(merge?.candidates) ? merge.candidates : []).flatMap((c) => {
      const r = rec(c);
      return r ? [{ at: plain(r.row), name: plain(r.name), kept: r.keeps === true }] : [];
    });
    const named = all.filter((c): c is { at: string | null; name: string; kept: boolean } => c.name !== null);
    if (named.length < 2 || named.length !== all.length) return null;
    const at = key.startsWith('pick:') ? key.slice(5) : null;
    const into = (at !== null ? named.find((c) => c.at === at) : named.find((c) => c.kept)) ?? named[0]!;
    return { kind: 'merge', names: named.map((c) => c.name), into: into.name };
  }

  const moves = own ? movesOf(o.money) : movesOf(row.money);
  const changes = changesOf(row, o, own);
  const lone = moves.length === 1 ? moves[0]! : null;
  if (lone) {
    const drawn = moneyVisual(lone, ground);
    if (drawn) return drawn;
  }

  const day = own && o.due !== undefined ? { before: null, after: o.due } : changes.find((c) => dayOf(c.after) !== null);
  if (day) {
    const drawn = dateVisual(day.before, day.after, now);
    if (drawn) return drawn;
  }

  const list = plain(ground.listName);
  const figure = lone ? moneyLine(Math.abs(lone.amount), lone.currency) : plain(ground.figure);
  if (applies && list !== null && figure !== null && changes.length === 0) return { kind: 'filing', list, figure };

  /* THE FIRST CHANGE THAT SAYS BOTH ENDS IN WORDS, from what it holds to what it will. */
  for (const c of changes) {
    const [b, a] = [plain(c.before), plain(c.after)];
    if (b !== null && a !== null && b !== a) return { kind: 'change', what: plain(c.field) ?? '', before: b, after: a };
  }
  return null;
}
