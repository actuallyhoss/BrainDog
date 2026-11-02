/**
 * "Import a statement": a bank's CSV read into one account's lines of the Ledger, any day after the first run.
 *
 * THE FIRST RUN'S MAPPER, NOT A SECOND ONE. The file is read by `readExport` (`lib/start/export.ts`), its days by
 * `dayReader`, its amounts by `numberOf` and `inCurrency`, and its headings are matched with the same words the mapper
 * already knows (`SAID_AS`, `squeeze`). What this adds is what a statement has and a list does not: one column of
 * signed amounts or two of money out and money in, a running balance, and the account every line belongs to.
 *
 * A LINE ALREADY IN THE LEDGER IS SKIPPED, held to the key a bank's own feed is held to (`near` dedupe in the bank
 * add-ons, `nearMatch` in packages/extract): the same account, the same amount in the same currency going the same
 * way, and the same payee once what the bank wraps it in is taken off. An alert is dated the day the money moved and a
 * statement the day the bank posted it, so the two may be three days apart. Where both say the balance after, it must
 * agree. One line kept in the Ledger stands for one line of the file, the nearest pairs first, so two coffees of the
 * same price on the same day stay two. The line the Ledger holds is the one kept, with whatever a person set on it.
 *
 * PURE, so `node --test` reads it. The screen (`routes/add/statement/+page.svelte`) draws it and writes what `fieldsOf` says.
 */

import { bankKey } from '@braindog/kernel';

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

/**
 * A line as the dedupe reads it: a line of the file, or one the Ledger already holds for the account. `also` is the
 * Ledger's other words for the payee (as the bank wrote it, and as a person named it), and `balance` what it says the
 * account held after, in minor units, when it says.
 */
export type Held = { day: string; what: string; amount: number; currency: string; way: 'in' | 'out'; also?: string[]; balance?: number | null; seq?: number };

/** The file read as lines, and what was left out: lines in another currency, and lines with no day, amount or words. */
/**
 * HOW THE FILE ITSELF SAYS MONEY OUT, where it says it, so the question is not asked (2 Nov, a walk: "Money out is shown:
 * With a minus / As a plain figure" was asked of a file whose minus signs already settled it). A running balance says it
 * outright: the way most lines move it. Without one, a column with both minus and plain figures is a bank's, and a
 * minus is money out. `null` where the file does not say (no minus anywhere, or a balance that agrees with neither way).
 */
export function signSaid(exp: Export, roles: Roles): Sign | null {
  if (roles.amount === null) return null;
  const cell = (e: Record<string, string>, c: string): number | null => numberOf((e[c] ?? '').trim());
  const amounts = exp.entries.map((e) => cell(e, roles.amount!));
  if (roles.balance !== null) {
    const balances = exp.entries.map((e) => cell(e, roles.balance!));
    let minus = 0;
    let plus = 0;
    for (let i = 1; i < exp.entries.length; i++) {
      const a = amounts[i];
      const b0 = balances[i - 1];
      const b1 = balances[i];
      if (a == null || b0 == null || b1 == null || a === 0) continue;
      const move = b1 - b0;
      const back = b0 - b1;
      /* EITHER ORDER: newest first or oldest first, the line's own move is its amount one way or the other. */
      const near = (x: number, y: number): boolean => Math.abs(x - y) < 0.005;
      if (near(move, a) || near(back, -a)) minus++;
      else if (near(move, -a) || near(back, a)) plus++;
    }
    if (minus + plus >= 2 && minus !== plus) return minus > plus ? 'minus-out' : 'plus-out';
  }
  const signed = amounts.filter((n): n is number => n !== null && n !== 0);
  return signed.some((n) => n < 0) && signed.some((n) => n > 0) ? 'minus-out' : null;
}

export type Read = { lines: Line[]; other: number; unread: number };

/** Kept here, so the screen owns its words. Plain, sentence case. */
export const words = {
  title: 'Import a statement',
  sentence: 'A CSV from your bank. Lines already in the Ledger are skipped.',
  account: 'Account',
  noAccounts: 'No open account yet.',
  /* THE WAY ON FROM NO ACCOUNT (2 Nov, a new person's first CSV met "No open account yet." and nothing to press). */
  noAccountsWhy: 'A statement goes into the account it came from. Add that account on Money, then come back with the file.',
  addAccount: 'Add an account',
  noLedger: 'There is no ledger to import into yet.',
  file: 'Statement',
  drop: 'Drop a CSV here, or choose one',
  choose: 'Choose a file',
  paste: 'Or paste it',
  pasteHint: 'Paste the lines, with the headings first',
  pastedName: 'pasted.csv',
  read: 'Read it',
  other: 'Another file',
  columns: 'Columns',
  none: 'None',
  roles: { day: 'Date', what: 'Description', amount: 'Amount', out: 'Money out', in: 'Money in', balance: 'Balance' } as Record<keyof Roles, string>,
  twoColumns: 'Money out and money in are separate columns',
  sign: 'Money out is shown',
  signs: { 'minus-out': 'With a minus', 'plus-out': 'As a plain figure' } as Record<Sign, string>,
  /** Said instead of the question, where the file's own signs settle it (`signSaid`). */
  signRead: { 'minus-out': 'Money out has a minus in this file.', 'plus-out': 'Money out is a plain figure in this file.' } as Record<Sign, string>,
  signChange: 'Not right?',
  preview: 'Preview',
  checking: 'Checking the Ledger…',
  already: 'Already in the Ledger',
  fresh: (n: number) => (n === 1 ? '1 new line' : `${n.toLocaleString('en')} new lines`),
  skipped: (n: number) => (n === 1 ? '1 already in the Ledger' : `${n.toLocaleString('en')} already in the Ledger`),
  otherCurrency: (n: number) => `${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`} in another currency, left out.`,
  unread: (n: number) => `${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`} missing a date, amount or description, left out.`,
  more: (n: number) => `and ${n.toLocaleString('en')} more`,
  add: (n: number) => (n === 1 ? 'Add 1 line' : `Add ${n.toLocaleString('en')} lines`),
  adding: (done: number, of: number) => `Adding ${done.toLocaleString('en')} of ${of.toLocaleString('en')}…`,
  nothingNew: 'Every line is already in the Ledger.',
  added: (n: number, account: string) => `Added ${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`} to ${account}.`,
  missed: (n: number) => `${n === 1 ? '1 line was' : `${n.toLocaleString('en')} lines were`} not added.`,
  /** The press when every line is there already and some of them still lack the balance the file says. */
  fill: (n: number) => (n === 1 ? 'Add the balance to 1 line' : `Add the balance to ${n.toLocaleString('en')} lines`),
  filled: (n: number) => `Added the balance to ${n === 1 ? '1 line' : `${n.toLocaleString('en')} lines`} already in the Ledger.`,
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
/** How many days apart an alert's day and the statement's posting day may be (`NEAR_ACROSS_DAYS` in packages/extract). */
const ACROSS = 3;

/** Words for comparing and nothing else: accents, case and runs of space off. */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

/** The words a bank puts before a payee on a statement line, longest first. */
const LEADS = ['ipn outward transfer to', 'ipn inward transfer from', 'ipn purchase to', 'ipn transfer to', 'ipn transfer from', 'card purchase', 'pos purchase', 'purchase at', 'payment to', 'purchase'];

/**
 * A description with what a bank wraps a payee in taken off, as `bankless` in packages/extract does: the day stamp a
 * statement line starts with (`05OCT26`), the words before the payee, a processor before its star (`PAYMOB*`), the word
 * `Purchase` at the end, and every mark. Never empty.
 */
export function bankless(text: string): string {
  const folded = fold(text);
  let words = folded.replace(/[^\p{L}\p{N}*]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (words.length > 1 && /^\d{1,2}[a-z]{3}(?:\d{2}|\d{4})$/u.test(words[0]!)) words = words.slice(1);
  for (const lead of LEADS) {
    const said = lead.split(' ');
    if (words.length > said.length && said.every((w, i) => words[i] === w)) {
      words = words.slice(said.length);
      break;
    }
  }
  let said = words.join(' ');
  const star = said.indexOf('*');
  if (star > 0 && star <= 14 && said.slice(0, star).trim().split(' ').length <= 2 && said.slice(star + 1).trim() !== '') said = said.slice(star + 1);
  words = said.replace(/\*/gu, ' ').split(' ').filter(Boolean);
  if (words.length > 1 && words.at(-1) === 'purchase') words = words.slice(0, -1);
  return words.join(' ') || folded;
}

const DAY_MS = 86_400_000;
const utc = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** Whether two words for a payee name one: the first letters as written, or with the bank taken off, or the payee key. */
function samePayee(a: string, b: string): boolean {
  if (fold(a).slice(0, PREFIX) === fold(b).slice(0, PREFIX)) return true;
  /* TWO DAY STAMPS THAT DIFFER ARE TWO DAYS, in the bank's own words (`16AUG26` and `17AUG26`). */
  const stamp = (t: string): string | null => /^\d{1,2}[a-z]{3}(?:\d{2}|\d{4})$/u.exec(fold(t).split(' ')[0] ?? '')?.[0] ?? null;
  const [sa, sb] = [stamp(a), stamp(b)];
  if (sa !== null && sb !== null && sa !== sb) return false;
  const [x, y] = [bankless(a), bankless(b)];
  if (x.slice(0, PREFIX) === y.slice(0, PREFIX)) return true;
  const key = bankKey(x);
  return key !== null && key === bankKey(y);
}

/** Whether a line of the file and a line of the Ledger are one movement seen twice. */
export function sameLine(a: Held, b: Held): boolean {
  if (a.amount !== b.amount || a.currency !== b.currency || a.way !== b.way) return false;
  if (Math.abs(utc(a.day) - utc(b.day)) > ACROSS * DAY_MS) return false;
  /* WHAT BOTH SAY THE ACCOUNT HELD AFTER MUST AGREE: two payments of one size a day apart leave two balances. */
  if (typeof a.balance === 'number' && typeof b.balance === 'number' && a.balance !== b.balance) return false;
  const names = (h: Held): string[] => [h.what, ...(h.also ?? [])].filter((t) => t.trim() !== '');
  return names(a).some((x) => names(b).some((y) => samePayee(x, y)));
}

/**
 * THE LINES TO ADD, AND THE ONES THE LEDGER ALREADY HOLDS. Each line kept stands for one line of the file and no more,
 * and the nearest pairs are made first, whatever order the file is in: a statement listed newest first does not let a
 * coffee on the 5th take the Ledger's coffee of the 3rd from the file's own coffee of the 3rd.
 */
export function freshOf<L extends Held>(lines: readonly L[], held: readonly Held[]): { fresh: L[]; already: L[]; matched: { line: L; held: Held }[] } {
  const pairs: { l: number; h: number; gap: number }[] = [];
  for (const [li, l] of lines.entries())
    for (const [hi, h] of held.entries()) if (sameLine(l, h)) pairs.push({ l: li, h: hi, gap: Math.abs(utc(l.day) - utc(h.day)) });
  pairs.sort((x, y) => x.gap - y.gap || x.l - y.l || x.h - y.h);
  const usedLine = new Set<number>();
  const usedHeld = new Set<number>();
  const matched: { line: L; held: Held }[] = [];
  for (const p of pairs) {
    if (usedLine.has(p.l) || usedHeld.has(p.h)) continue;
    usedLine.add(p.l);
    usedHeld.add(p.h);
    matched.push({ line: lines[p.l]!, held: held[p.h]! });
  }
  return { fresh: lines.filter((_, i) => !usedLine.has(i)), already: lines.filter((_, i) => usedLine.has(i)), matched };
}

/**
 * THE BALANCE A LINE ALREADY THERE NEVER SAID, from the statement line it is (recheck of 30 October): an alert wrote the
 * payment first and kept no balance after it, and the statement prints one beside the same payment. Each as the Ledger
 * row's number and what to write on it; only where the Ledger has a balance field, the row's is empty (`heldOf` reads it
 * as `null`), and the line says one.
 */
export function balancesOf(matched: readonly { line: Line; held: Held }[], balance: string | null): { seq: number; patch: Record<string, unknown> }[] {
  if (balance === null) return [];
  return matched.flatMap(({ line, held }) =>
    typeof held.seq === 'number' && held.balance === null && line.balance !== null ? [{ seq: held.seq, patch: { [balance]: { amount: line.balance, currency: line.currency } } }] : [],
  );
}

/** The Ledger's other words for a payee: as the bank wrote it, and as a person named it (money-core's field ids). */
const ALSO = ['counterparty_text', 'payee'];

/**
 * A row of the Ledger as the dedupe reads it, or `null` when it is not one it can compare. `balance` is the field the
 * import writes a running balance to (`balanceFieldOf`), read in the row's own currency only.
 */
export function heldOf(fields: Readonly<Record<string, unknown>>, l: Pick<Ledger, 'title' | 'amount' | 'day' | 'way'>, balance: string | null = null): Held | null {
  const money = fields[l.amount] as { amount?: unknown; currency?: unknown } | null | undefined;
  const day = fields[l.day];
  const way = fields[l.way.field] === l.way.out ? 'out' : fields[l.way.field] === l.way.in ? 'in' : null;
  if (typeof money?.amount !== 'number' || typeof money.currency !== 'string' || typeof day !== 'string' || way === null) return null;
  const out: Held = { day: day.slice(0, 10), what: typeof fields[l.title] === 'string' ? (fields[l.title] as string) : '', amount: Math.abs(money.amount), currency: money.currency, way };
  const also = ALSO.map((f) => fields[f]).filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  if (also.length > 0) out.also = also;
  const after = balance === null ? null : (fields[balance] as { amount?: unknown; currency?: unknown } | null | undefined);
  if (typeof after?.amount === 'number' && after.currency === money.currency) out.balance = after.amount;
  /* NONE SAID IS `null`, not left out, so a statement's balance may be written onto it (`balancesOf`). */
  else if (balance !== null && (after === null || after === undefined)) out.balance = null;
  return out;
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
