/**
 * The quick-add sheet's thinking, apart from its drawing: what was typed as an amount, who it is usually paid to, which
 * categories come first, and the lines a press writes.
 *
 * THE LINES ARE THE LEDGER'S OWN ROWS, written through the record's ordinary create, one per line:
 *   - money out or in is one line, split into parts on that line where the ledger keeps them, else one line a category;
 *   - a move between one's own accounts is two lines, one out of the first account and one into the second, each
 *     marked as a move where the ledger declares the mark. The record pairs the two legs itself.
 *
 * PURE, so `node --test` reads it. The sheet (`QuickAdd.svelte`) draws it and sends what `linesOf` answers.
 */

import { exponentOf } from 'braindog-render';

import type { Ledger } from './ledger.ts';

/** The three things the sheet adds. */
export type Way = 'out' | 'in' | 'move';
export const WAYS: readonly Way[] = ['out', 'in', 'move'];

/** Kept here, so the sheet owns its words. Plain, sentence case, and never a sum of two currencies. */
export const words = {
  title: 'Add a movement',
  ways: { out: 'Money out', in: 'Money in', move: 'Move money' } as Record<Way, string>,
  short: { out: 'Out', in: 'In', move: 'Move' } as Record<Way, string>,
  /* THE BOX UNDER THE CHIPS SAYS WHAT IT IS FOR (design pass, 1 Nov): it was a blank bar under five names. */
  payeeType: 'Or type a name',
  amount: 'Amount',
  currency: 'Currency',
  paidTo: { out: 'Paid to', in: 'From', move: 'What for' } as Record<Way, string>,
  payeeHint: 'a person or a shop',
  asWritten: (typed: string) => `Use “${typed}” as written`,
  usual: (n: number, category: string | null) => `${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`}${category ? ` · files as ${category}` : ''}`,
  category: 'Category',
  categoryFrom: (name: string) => `${name}, as before`,
  noCategory: 'No category',
  from: 'From',
  to: 'To',
  into: 'Into',
  account: 'Account',
  when: 'When',
  today: (said: string) => `Today, ${said}`,
  note: 'Note',
  notePlaceholder: 'Anything to remember',
  split: 'Split',
  splitStart: 'Split into categories',
  addNote: 'Add a note',
  fewer: 'Fewer',
  all: (n: number) => `All ${n}`,
  splitAdd: 'Add a category',
  splitLeft: (left: string) => `${left} left to place`,
  splitOver: (over: string) => `${over} more than the amount`,
  splitDrop: 'Take this part out',
  received: (code: string) => `Arrives as (${code})`,
  receivedHint: 'what the second account shows, when the currencies differ',
  add: 'Add',
  adding: 'Adding…',
  cancel: 'Cancel',
  close: 'Close',
  loading: 'Reading your accounts…',
  noAccounts: (one: string) => `There is no open account to add a ${one} to yet.`,
  noLedger: 'There is no ledger to add to yet.',
  needAmount: 'Type an amount first.',
  needAccount: 'Choose the account it moved through.',
  needTwo: 'Choose two different accounts.',
  needPayee: { out: 'Say who it was paid to.', in: 'Say who it came from.', move: 'Say what the move was for.' } as Record<Way, string>,
  needSplit: 'The parts must add up to the amount.',
  needReceived: (code: string) => `Say how much arrived in ${code}.`,
  moveTitle: (from: string, to: string) => `${from} to ${to}`,
  added: (title: string, said: string) => `Added “${title}”, ${said}.`,
  addedSplit: (title: string, n: number, said: string) => `Added “${title}” in ${n} parts, ${said}.`,
  moved: (said: string, from: string, to: string) => `Moved ${said} from ${from} to ${to}.`,
  fab: 'Add a movement',
  approx: (said: string) => `≈ ${said}`,
} as const;

/* ---- the amount ---------------------------------------------------------------------------------------------- */

/**
 * What was typed in the amount box, in minor units of `currency`, or `null` when it is not a positive amount.
 *
 * GROUPING IS IGNORED AND ONE POINT IS THE DECIMAL MARK, as the box writes it back (`grouped`). More places than the
 * currency holds are refused rather than rounded: a figure somebody did not type is never written.
 */
export function minorOf(typed: string, currency: string): number | null {
  const said = typed.replace(/[\s,  ]/gu, '');
  if (!/^\d*(?:\.\d*)?$/u.test(said) || said === '' || said === '.') return null;
  const [whole = '', fraction = ''] = said.split('.');
  const exp = exponentOf(currency);
  if (fraction.length > exp) return null;
  const minor = Number(`${whole || '0'}${fraction.padEnd(exp, '0')}`);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** The amount box as it is typed, with its thousands grouped: `12500.5` is `12,500.5`. Anything else is left alone. */
export function grouped(typed: string): string {
  const said = typed.replace(/[\s,]/gu, '');
  const m = /^(\d*)(\.\d*)?$/u.exec(said);
  if (!m) return typed;
  const whole = (m[1] ?? '').replace(/^0+(?=\d)/u, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')}${m[2] ?? ''}`;
}

/** Minor units as the box shows them, with no grouping and no trailing zeroes past the point. */
export function typedOf(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  if (exp === 0) return String(minor);
  const digits = String(minor).padStart(exp + 1, '0');
  const fraction = digits.slice(-exp).replace(/0+$/u, '');
  return `${digits.slice(0, -exp)}${fraction ? `.${fraction}` : ''}`;
}

/* ---- what the record holds, as the sheet reads it ------------------------------------------------------------- */

/** A row of a linked list as the sheet offers it. */
export type Option = { id: string; name: string; icon?: string | null; colour?: string | null; currency?: string | null; kind?: string | null; way?: string | null };

/** One past ledger line, as the sheet learns from it. */
export type Past = { title: string; category: string | null; account: string | null; way: 'in' | 'out' | null; day: string; move: boolean };

/** Who a line is usually paid to or from: the name, how many lines, and the category and account it usually takes. */
export type Payee = { name: string; count: number; category: string | null; account: string | null; last: string };

const fold = (s: string): string => s.trim().toLowerCase().replace(/\s+/gu, ' ');

/** The value said most often, the newest of a tie. `null` among the values is not counted. */
function usual(values: readonly (string | null)[]): string | null {
  const n = new Map<string, number>();
  for (const v of values) if (v !== null) n.set(v, (n.get(v) ?? 0) + 1);
  let best: string | null = null;
  let most = 0;
  /* VALUES ARRIVE NEWEST FIRST, so the first to reach a count wins a tie. */
  for (const v of values) if (v !== null && (n.get(v) ?? 0) > most) (best = v), (most = n.get(v)!);
  return best;
}

/**
 * The payees of past lines going `way`, most used first, the newest of a tie first. A move between one's own accounts is
 * nobody's payee and is left out.
 */
export function payeesOf(past: readonly Past[], way: 'in' | 'out'): Payee[] {
  const by = new Map<string, Past[]>();
  for (const p of past) {
    if (p.move || p.way !== way || p.title.trim() === '') continue;
    const k = fold(p.title);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by.values()]
    .map((lines) => {
      const newest = [...lines].sort((a, b) => b.day.localeCompare(a.day));
      return { name: newest[0]!.title.trim(), count: lines.length, category: usual(newest.map((l) => l.category)), account: usual(newest.map((l) => l.account)), last: newest[0]!.day };
    })
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

/**
 * The payees a typed name suggests: those starting with it first, then those with a word starting with it, then those
 * holding it. Nothing typed is the most used.
 */
export function suggestions(payees: readonly Payee[], typed: string, most = 5): Payee[] {
  const t = fold(typed);
  if (t === '') return payees.slice(0, most);
  const rank = (p: Payee): number => {
    const n = fold(p.name);
    if (n === t) return 0;
    if (n.startsWith(t)) return 1;
    if (n.split(/[\s*/._-]+/u).some((w) => w.startsWith(t))) return 2;
    return n.includes(t) ? 3 : 9;
  };
  return payees
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || b.p.count - a.p.count)
    .map((x) => x.p)
    .slice(0, most);
}

/** The payee a typed name is, exactly, or `null`. */
export const payeeNamed = (payees: readonly Payee[], typed: string): Payee | null => payees.find((p) => fold(p.name) === fold(typed)) ?? null;

/**
 * The categories to offer for `way`, the most recently used first and the rest in their own order. A category kept for
 * the other way is left out; one kept for either way, or that says no way, is offered both.
 */
export function categoriesFor(options: readonly Option[], past: readonly Past[], way: 'in' | 'out', ways: Pick<Ledger['way'], 'in' | 'out'>): Option[] {
  const other = way === 'out' ? ways.in : ways.out;
  const fits = options.filter((o) => o.way !== other);
  const seen: string[] = [];
  for (const p of past) if (p.way === way && p.category !== null && !seen.includes(p.category)) seen.push(p.category);
  const at = (o: Option): number => {
    const i = seen.indexOf(o.id);
    return i < 0 ? seen.length : i;
  };
  return fits.map((o, i) => ({ o, i })).sort((a, b) => at(a.o) - at(b.o) || a.i - b.i).map((x) => x.o);
}

/** The account the sheet opens on: the payee's usual one, else the one most recently used, else the first. */
export function accountFor(accounts: readonly Option[], past: readonly Past[], payee: Payee | null): string | null {
  const open = new Set(accounts.map((a) => a.id));
  if (payee?.account && open.has(payee.account)) return payee.account;
  const recent = past.find((p) => p.account !== null && open.has(p.account) && !p.move);
  return recent?.account ?? accounts[0]?.id ?? null;
}

/* ---- the lines a press writes --------------------------------------------------------------------------------- */

/** One part of a split: a category and its share, in minor units. */
export type Part = { category: string | null; minor: number };

/** Everything the sheet holds when Add is pressed. */
export type Draft = {
  way: Way;
  minor: number | null;
  currency: string;
  title: string;
  day: string;
  account: string | null;
  /** The second account of a move. */
  to: string | null;
  /** What arrived in the second account's currency, when it is not the first's. */
  received: number | null;
  toCurrency: string | null;
  category: string | null;
  /** Two parts or more; empty is no split. */
  parts: readonly Part[];
  note: string;
};

/** A line to write: the list's fields, in the record's spelling. */
export type Line = Record<string, unknown>;

/** What a press answers: the lines to write, or the one thing missing. */
export type Lines = { ok: true; lines: Line[] } | { ok: false; fix: string };

/** How much of the amount the parts leave to place: positive is left over, negative is past the amount. */
export const leftOf = (minor: number | null, parts: readonly Part[]): number => (minor ?? 0) - parts.reduce((n, p) => n + p.minor, 0);

/**
 * The ledger lines a draft writes, or what is missing.
 *
 * A NOTE IS WRITTEN ONLY WHERE ONE WAS TYPED, and a category only where one was chosen, so the record's own filing can
 * still file a line nobody filed. The state is never sent: a line is written as the list writes one by default.
 */
export function linesOf(d: Draft, l: Ledger): Lines {
  if (d.minor === null || d.minor <= 0) return { ok: false, fix: words.needAmount };
  if (d.account === null) return { ok: false, fix: words.needAccount };
  const title = d.title.trim();
  const note = d.note.trim();
  const base = (way: string, account: string, minor: number, currency: string, t: string): Line => ({
    [l.title]: t,
    [l.amount]: { amount: minor, currency },
    [l.way.field]: way,
    [l.day]: d.day,
    [l.account.field]: account,
    ...(note !== '' && l.note ? { [l.note]: note } : {}),
  });
  if (d.way === 'move') {
    if (d.to === null || d.to === d.account) return { ok: false, fix: words.needTwo };
    if (title === '') return { ok: false, fix: words.needPayee.move };
    const across = d.toCurrency !== null && d.toCurrency !== d.currency;
    if (across && (d.received === null || d.received <= 0)) return { ok: false, fix: words.needReceived(d.toCurrency!) };
    const mark = l.mark ? { [l.mark]: true } : {};
    return {
      ok: true,
      lines: [
        { ...base(l.way.out, d.account, d.minor, d.currency, title), ...mark },
        { ...base(l.way.in, d.to, across ? d.received! : d.minor, across ? d.toCurrency! : d.currency, title), ...mark },
      ],
    };
  }
  if (title === '') return { ok: false, fix: words.needPayee[d.way] };
  const way = d.way === 'out' ? l.way.out : l.way.in;
  const filed = (category: string | null): Line => (category !== null && l.category ? { [l.category.field]: category } : {});
  const parts = d.parts.filter((p) => p.minor > 0);
  if (parts.length >= 2) {
    if (leftOf(d.minor, parts) !== 0) return { ok: false, fix: words.needSplit };
    /* ONE LINE IN PARTS where the ledger keeps them (`parts_of`), so the bank's one payment stays one line; else a line
       a category, as before. */
    if (l.parts && l.category) {
      const category = l.category.field;
      const kept = parts.map((p) => ({ ...(p.category !== null ? { [category]: p.category } : {}), [l.amount]: { amount: p.minor, currency: d.currency } }));
      return { ok: true, lines: [{ ...base(way, d.account, d.minor, d.currency, title), [l.parts]: kept }] };
    }
    return { ok: true, lines: parts.map((p) => ({ ...base(way, d.account!, p.minor, d.currency, title), ...filed(p.category) })) };
  }
  return { ok: true, lines: [{ ...base(way, d.account, d.minor, d.currency, title), ...filed(d.category) }] };
}

/* ---- days ------------------------------------------------------------------------------------------------------ */

/** A day as the sheet says it: `Tue 27 Oct`, read in UTC since a `YYYY-MM-DD` is a day and not an instant. */
export function daySaid(day: string): string {
  const at = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(at)) return day;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at).replace(',', '');
}
