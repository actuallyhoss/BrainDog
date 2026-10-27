/**
 * "Import a statement": a bank's CSV read into one account's lines of the Ledger, any day after the first run.
 *
 * THE FIRST RUN'S MAPPER, NOT A SECOND ONE. The file is read by `readExport` (`lib/start/export.ts`), its days by
 * `dayReader`, its amounts by `numberOf` and `inCurrency`, and its headings are matched with the same words the mapper
 * already knows (`SAID_AS`, `squeeze`). What this adds is what a statement has and a list does not: one column of
 * signed amounts or two of money out and money in, a running balance, and the account every line belongs to.
 *
 * A LINE ALREADY IN THE LEDGER IS SKIPPED, held to the key a bank's own feed is held to (`near` dedupe in the bank
 * add-ons, `isDuplicate` in packages/extract): the same account, the same amount in the same currency going the same
 * way, a day within one, and the first twelve letters of the description, case and accents aside. One line kept in the
 * Ledger stands for one line of the file, so two coffees of the same price on the same day stay two.
 *
 * PURE, so `node --test` reads it. The screen (`routes/add/statement/+page.svelte`) draws it and writes what `fieldsOf` says.
 */

import { dayReader, inCurrency, numberOf, readExport, SAID_AS, squeeze, type Export } from '../start/export.ts';
import { decimalsOf } from '../start/lists.ts';
import type { Ledger } from './ledger.ts';

/** Which column fills what. `amount` is one signed column; `out` and `in` are two, and stand in for it. */
export type Roles = { day: string | null; what: string | null; amount: string | null; out: string | null; in: string | null; balance: string | null };

export const ROLES: readonly (keyof Roles)[] = ['day', 'what', 'amount', 'out', 'in', 'balance'];

/** How one signed column says money out: with a minus (a bank), or as a plain figure (a card's statement). */
export type Sign = 'minus-out' | 'plus-out';

/** One line of the statement, read: its place in the file, its day, what it says, and the amount in minor units. */
export type Line = { at: number; day: string; what: string; amount: number; currency: string; way: 'in' | 'out'; balance: number | null };

/** A line the Ledger already holds for the account, as the dedupe reads it. */
export type Held = { day: string; what: string; amount: number; currency: string; way: 'in' | 'out' };

/** The file read as lines, and what was left out: lines in another currency, and lines with no day, amount or words. */
export type Read = { lines: Line[]; other: number; unread: number };

/** Kept here, so the screen owns its words. Plain, sentence case. */
export const words = {
  title: 'Import a statement',
  sentence: 'Bring in a bank statement as a CSV. Lines already in the Ledger are skipped.',
  account: 'Account',
  noAccounts: 'There is no open account to import into yet.',
  noLedger: 'This record keeps no ledger to import into.',
  file: 'Statement',
  drop: 'Drop a CSV here, or choose one',
  choose: 'Choose a file',
  paste: 'Or paste it',
  pasteHint: 'Paste the lines, with the headings first',
  read: 'Read it',
  other: 'Another file',
  columns: 'Columns',
  none: 'None',
  roles: { day: 'Date', what: 'Description', amount: 'Amount', out: 'Money out', in: 'Money in', balance: 'Balance' } as Record<keyof Roles, string>,
  twoColumns: 'Money out and money in are separate columns',
  sign: 'Money out is shown',
  signs: { 'minus-out': 'With a minus', 'plus-out': 'As a plain figure' } as Record<Sign, string>,
  preview: 'Preview',
  checking: 'Checking the Ledger…',
  already: 'Already in the Ledger',
  fresh: (n: number) => (n === 1 ? '1 new line' : `${n.toLocaleString('en')} new lines`),
  skipped: (n: number) => (n === 1 ? '1 already in the Ledger' : `${n.toLocaleString('en')} already in the Ledger`),
  otherCurrency: (n: number, code: string) => `${n === 1 ? '1 line is' : `${n.toLocaleString('en')} lines are`} not in ${code} and are left out.`,
  unread: (n: number) => `${n === 1 ? '1 line has' : `${n.toLocaleString('en')} lines have`} no date, amount or description and ${n === 1 ? 'is' : 'are'} left out.`,
  more: (n: number) => `and ${n.toLocaleString('en')} more`,
  add: (n: number) => (n === 1 ? 'Add 1 line' : `Add ${n.toLocaleString('en')} lines`),
  adding: (done: number, of: number) => `Adding ${done.toLocaleString('en')} of ${of.toLocaleString('en')}…`,
  nothingNew: 'Every line is already in the Ledger.',
  added: (n: number, account: string) => `Added ${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`} to ${account}.`,
  missed: (n: number) => `${n === 1 ? '1 line was' : `${n.toLocaleString('en')} lines were`} not added.`,
  again: 'Import another',
  open: 'Open the account',
  notRead: 'That file has no lines to read. Export the statement as CSV and try again.',
  notCsv: 'Bring a CSV, not a spreadsheet: save it as CSV first.',
  need: {
    day: 'Choose the column with the date.',
    what: 'Choose the column with the description.',
    amount: 'Choose the amount column, or the money out and money in columns.',
  },
  palette: 'Import a statement',
} as const;

/* ── the columns ───────────────────────────────────────────────────────── */

/**
 * THE WORDS A STATEMENT HEADS ITS OWN COLUMNS WITH, beside the mapper's: vocabulary of bank exports, squeezed as the
 * mapper squeezes a heading ("Paid out" is `paidout`). Said as sentences so they read as the words they are.
 */
const OUT_SAID = 'debit debits debitamount withdrawal withdrawals withdrawalamount paidout moneyout out spent spending'.split(' ');
const IN_SAID = 'credit credits creditamount deposit deposits depositamount paidin moneyin in received'.split(' ');
const BALANCE_SAID = 'balance runningbalance balanceafter closingbalance availablebalance ledgerbalance'.split(' ');
const DAY_SAID = [...(SAID_AS.on ?? []), 'day', 'transactiondate', 'postingdate', 'dateposted'];
const AMOUNT_SAID = [...(SAID_AS.amount ?? []).filter((w) => !OUT_SAID.includes(w) && !IN_SAID.includes(w)), 'transactionamount'];
const WHAT_SAID = [...(SAID_AS.what ?? []), 'particulars', 'transaction', 'transactiondetails'];

const filled = (exp: Export, column: string): string[] => exp.entries.slice(0, 50).map((e) => (e[column] ?? '').trim()).filter((c) => c !== '');

/** Whether one in two of a column's cells at least are days. */
function readsAsDays(exp: Export, column: string, locale: string): boolean {
  const cells = filled(exp, column);
  if (cells.length === 0) return false;
  const day = dayReader(cells, locale);
  return cells.filter((c) => day(c) !== null).length * 2 >= cells.length;
}

/** Whether one in two of a column's cells at least are amounts. */
function readsAsAmounts(exp: Export, column: string): boolean {
  const cells = filled(exp, column);
  return cells.length > 0 && cells.filter((c) => numberOf(c) !== null).length * 2 >= cells.length;
}

/** The first column, in the order the words are said, whose heading is one of them and whose cells pass `fits`. */
function headed(exp: Export, said: readonly string[], fits: (column: string) => boolean, taken: readonly (string | null)[]): string | null {
  for (const w of said) {
    const column = exp.columns.find((c) => squeeze(c) === w && !taken.includes(c) && fits(c));
    if (column !== undefined) return column;
  }
  return null;
}

/**
 * WHAT THESE RULES MAP A STATEMENT'S COLUMNS TO, before a person changes any: by heading first, then by what the cells
 * hold (the first column of days, the widest column of words). Two columns of money out and money in stand in for one
 * amount, and a column is used once.
 */
export function guessRoles(exp: Export, locale: string): Roles {
  const taken: (string | null)[] = [];
  const keep = (c: string | null): string | null => (taken.push(c), c);
  const day = keep(headed(exp, DAY_SAID, (c) => readsAsDays(exp, c, locale), taken) ?? exp.columns.find((c) => readsAsDays(exp, c, locale) && /\D/u.test(filled(exp, c)[0] ?? '')) ?? null);
  const out = keep(headed(exp, OUT_SAID, (c) => readsAsAmounts(exp, c), taken));
  const into = keep(out === null ? null : headed(exp, IN_SAID, (c) => readsAsAmounts(exp, c), taken));
  const two = out !== null && into !== null;
  const amount = keep(two ? null : headed(exp, AMOUNT_SAID, (c) => readsAsAmounts(exp, c), taken));
  const balance = keep(headed(exp, BALANCE_SAID, (c) => readsAsAmounts(exp, c), taken));
  const wordy = (c: string): boolean => !taken.includes(c) && !readsAsAmounts(exp, c) && !readsAsDays(exp, c, locale);
  const width = (c: string): number => filled(exp, c).reduce((n, v) => n + v.length, 0);
  const what =
    headed(exp, WHAT_SAID, wordy, taken) ??
    exp.columns.filter(wordy).sort((a, b) => width(b) - width(a))[0] ??
    null;
  return { day, what, amount: two ? null : (amount ?? (out ?? into)), out: two ? out : null, in: two ? into : null, balance };
}

/** What a mapping still needs before a line can be read, or `null` when it reads. */
export function rolesMissing(roles: Roles): string | null {
  if (roles.day === null) return words.need.day;
  if (roles.what === null) return words.need.what;
  if (roles.amount === null && roles.out === null && roles.in === null) return words.need.amount;
  return null;
}

/* ── the lines ─────────────────────────────────────────────────────────── */

const minorOf = (n: number, currency: string): number => Math.round(n * 10 ** decimalsOf(currency));

/**
 * EVERY LINE OF THE FILE, READ IN THE ACCOUNT'S CURRENCY. A cell that names another currency holds its line back,
 * never relabelled; a line with no day, no description or no amount other than nothing is left out and counted.
 * Two columns are read as their sizes, money in less money out, whatever sign a bank prints in them.
 */
export function linesOf(exp: Export, roles: Roles, opts: { currency: string; locale: string; sign?: Sign }): Read {
  const { currency, locale } = opts;
  const sign = opts.sign ?? 'minus-out';
  const out: Line[] = [];
  let other = 0;
  let unread = 0;
  if (rolesMissing(roles) !== null) return { lines: [], other: 0, unread: exp.entries.length };
  const day = dayReader(exp.entries.map((e) => e[roles.day!] ?? ''), locale);
  const cell = (e: Record<string, string>, c: string | null): string => (c === null ? '' : (e[c] ?? '').trim());
  for (const [at, e] of exp.entries.entries()) {
    const raws = roles.amount !== null ? [cell(e, roles.amount)] : [cell(e, roles.out), cell(e, roles.in)];
    if (raws.some((r) => r !== '' && numberOf(r) !== null && !inCurrency(r, currency))) {
      other++;
      continue;
    }
    let net: number | null;
    if (roles.amount !== null) {
      const n = numberOf(raws[0]!);
      net = n === null ? null : sign === 'minus-out' ? n : -n;
    } else {
      const o = numberOf(raws[0]!);
      const i = numberOf(raws[1]!);
      net = o === null && i === null ? null : Math.abs(i ?? 0) - Math.abs(o ?? 0);
    }
    const on = day(cell(e, roles.day));
    const what = cell(e, roles.what).replace(/\s+/gu, ' ');
    const minor = net === null ? 0 : minorOf(Math.abs(net), currency);
    if (on === null || what === '' || minor === 0) {
      unread++;
      continue;
    }
    const b = roles.balance === null ? null : numberOf(cell(e, roles.balance));
    out.push({ at, day: on, what, amount: minor, currency, way: net! < 0 ? 'out' : 'in', balance: b === null ? null : minorOf(b, currency) });
  }
  return { lines: out, other, unread };
}

/** The first and last day the lines cover, or `null` for none. */
export function spanOf(lines: readonly Pick<Line, 'day'>[]): { from: string; to: string } | null {
  if (lines.length === 0) return null;
  const days = lines.map((l) => l.day).sort();
  return { from: days[0]!, to: days.at(-1)! };
}

/** A day moved by `n` days, as `YYYY-MM-DD`. */
export function dayPlus(day: string, n: number): string {
  const at = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

/* ── the dedupe ────────────────────────────────────────────────────────── */

/** How many letters of the description two lines must share, as a bank's feed is held to. */
const PREFIX = 12;

/** Words for comparing and nothing else: accents, case and runs of space off. */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

const DAY_MS = 86_400_000;
const utc = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** Whether a line of the file and a line of the Ledger are one movement seen twice. */
export function sameLine(a: Held, b: Held): boolean {
  if (a.amount !== b.amount || a.currency !== b.currency || a.way !== b.way) return false;
  if (Math.abs(utc(a.day) - utc(b.day)) > DAY_MS) return false;
  return fold(a.what).slice(0, PREFIX) === fold(b.what).slice(0, PREFIX);
}

/**
 * THE LINES TO ADD, AND THE ONES THE LEDGER ALREADY HOLDS. Each line kept stands for one line of the file and no more,
 * the nearest day first, so a file with two of the same coffee against a Ledger holding one adds the second.
 */
export function freshOf<L extends Held>(lines: readonly L[], held: readonly Held[]): { fresh: L[]; already: L[] } {
  const used = new Set<number>();
  const fresh: L[] = [];
  const already: L[] = [];
  for (const l of lines) {
    let best = -1;
    let gap = Infinity;
    for (const [i, h] of held.entries()) {
      if (used.has(i) || !sameLine(l, h)) continue;
      const d = Math.abs(utc(l.day) - utc(h.day));
      if (d < gap) (best = i), (gap = d);
    }
    if (best >= 0) {
      used.add(best);
      already.push(l);
    } else fresh.push(l);
  }
  return { fresh, already };
}

/** A row of the Ledger as the dedupe reads it, or `null` when it is not one it can compare. */
export function heldOf(fields: Readonly<Record<string, unknown>>, l: Pick<Ledger, 'title' | 'amount' | 'day' | 'way'>): Held | null {
  const money = fields[l.amount] as { amount?: unknown; currency?: unknown } | null | undefined;
  const day = fields[l.day];
  const way = fields[l.way.field] === l.way.out ? 'out' : fields[l.way.field] === l.way.in ? 'in' : null;
  if (typeof money?.amount !== 'number' || typeof money.currency !== 'string' || typeof day !== 'string' || way === null) return null;
  return { day: day.slice(0, 10), what: typeof fields[l.title] === 'string' ? (fields[l.title] as string) : '', amount: Math.abs(money.amount), currency: money.currency, way };
}

/* ── the write ─────────────────────────────────────────────────────────── */

/** The field a running balance goes in: a money field of the Ledger beside the amount that says it is a balance. */
export function balanceFieldOf(fields: readonly { id: string; type: string; label?: string; retired?: boolean }[], amount: string): string | null {
  return fields.find((f) => f.type === 'money' && f.id !== amount && f.retired !== true && /balance/iu.test(f.label ?? ''))?.id ?? null;
}

/** One line as the Ledger stores it, in the account it was chosen for. */
export function fieldsOf(line: Line, l: Pick<Ledger, 'title' | 'amount' | 'day' | 'way' | 'account'>, account: string, balance: string | null): Record<string, unknown> {
  return {
    [l.title]: line.what,
    [l.day]: line.day,
    [l.way.field]: line.way === 'in' ? l.way.in : l.way.out,
    [l.amount]: { amount: line.amount, currency: line.currency },
    [l.account.field]: account,
    ...(balance !== null && line.balance !== null ? { [balance]: { amount: line.balance, currency: line.currency } } : {}),
  };
}

/* ── the file ──────────────────────────────────────────────────────────── */

/** A spreadsheet's own file, which is not text and is never read as CSV. */
const BINARY = /\.(?:xlsx?|numbers|ods|pdf)$/iu;

/** Pasted or dropped text read as a statement: the mapper's reading, or the sentence to say instead. */
export function readStatement(name: string, text: string): Export | { why: string } {
  if (BINARY.test(name)) return { why: words.notCsv };
  const got = readExport(name, text);
  return 'why' in got ? { why: words.notRead } : got;
}
