/**
 * THE TWO LEGS OF A TRANSFER, FOUND AND MARKED.
 *
 * Money moved between two of one person's own accounts is written as two rows, one leaving and one arriving, and a ledger
 * that reads each as it stands counts the move twice: once as spend and once as income. His import writes every such move
 * that way (`loop/research-living-in-it.md` section 4.1), and every Ledger figure says `transfer is false`, so until both
 * legs were marked by hand the month's spend held money that was only moved.
 *
 * `02 §5`'s register option: `pairs: { on, opposite, across, within, date?, mark }`. Two rows that agree on every `on`
 * entry, face opposite ways, sit in different accounts and fall inside the window are one transfer. Both are MARKED,
 * never hidden: `mark` names a `bool` field the kernel sets true on each, and `_pair` beside it names the other row, so a
 * person can see why a row stopped counting and undo it. Paired once: a row that already names a partner is nobody's
 * candidate, so a third equal row stays unpaired, and zero never matches, because two zero rows are not a movement.
 *
 * IN THE KERNEL'S WRITE PATH AND NOT IN A RULE, because a `where:` cannot say "a row of this register that mirrors me",
 * and because the import writes through `create` and so will the bank door after the cut-over: one build serves both.
 */

import type { Refusal, Sql } from '@braindog/ports';

import { atMs, shiftFrom } from './schedule.ts';

export type PairsDecl = {
  /** One to three fields both rows hold alike. `abs(x)` compares a number or an amount by its size and currency. */
  on: readonly string[];
  /** The field that says which way the money went: a signed number or amount, or an enum of two values. */
  opposite: string;
  /** The field the two rows must differ on, which is the account. */
  across: string;
  /** How far apart the two days may be: `4d`, `1w`, `1m`. */
  within: string;
  /** The day field the window runs over. The register's sole `day` field when absent. */
  date?: string;
  /** A `bool` field set true on both rows. */
  mark: string;
};

type FieldShape = { id: string; type: string; values?: unknown; retired?: boolean };

const PAIRS_KEYS = ['on', 'opposite', 'across', 'within', 'date', 'mark'] as const;
const NUMERIC = new Set(['money', 'int', 'decimal']);
/* `42 §2`'s `Window`, the offset grammar `schedule.ts` steps by, without a sign. */
const WINDOW = /^[1-9]\d{0,3}[dwm]$/;
const ABS = /^abs\(([a-z][a-z0-9_]*)\)$/;
const IDENT = /^[a-z][a-z0-9_]*$/;

const bad = (code: string, fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

/** `abs(amount)` as `{ field: 'amount', abs: true }`, `currency` as `{ field: 'currency', abs: false }`. */
const entryOf = (said: string): { field: string; abs: boolean } | null => {
  const m = ABS.exec(said);
  if (m) return { field: m[1]!, abs: true };
  return IDENT.test(said) ? { field: said, abs: false } : null;
};

/** The day field a declaration's window runs over, or `null` when it names none and the register has no sole one. */
function dateField(pairs: { date?: unknown }, fields: readonly FieldShape[]): string | null {
  if (typeof pairs.date === 'string') return pairs.date;
  const days = fields.filter((f) => f.type === 'day' && f.retired !== true);
  return days.length === 1 ? days[0]!.id : null;
}

/**
 * What is wrong with a register's `pairs:`, or `null`.
 *
 * EVERY FIELD IT NAMES IS DECLARED (`FIELD_UNKNOWN`, `42 §4.4`), and each part is the type the matching reads it as,
 * because a mark on a text field would be written `true` into a text and a window over a text would compare strings. A
 * declaration naming no amount at all is refused too: with `opposite` an enum and every `on` a bare equality, zero is
 * indistinguishable from anything else, and the one rule `02 §5` states about amounts could not be kept.
 */
export function pairsFault(id: string, fields: readonly FieldShape[], pairs: unknown): Refusal | null {
  if (pairs === null || typeof pairs !== 'object' || Array.isArray(pairs))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs says how two rows are one transfer, as { on: [abs(amount)], opposite: direction, across: account, within: 4d, mark: transfer }.`,
      'pairs',
      PAIRS_KEYS,
    );
  const said = pairs as Record<string, unknown>;
  for (const key of Object.keys(said))
    if (!(PAIRS_KEYS as readonly string[]).includes(key))
      return bad('DECLARATION_INVALID', `${id}'s pairs has no key ${key}. It takes on, opposite, across, within, date and mark.`, `pairs.${key}`, PAIRS_KEYS);

  const live = fields.filter((f) => f.retired !== true);
  const field = (name: unknown) => (typeof name === 'string' ? live.find((f) => f.id === name) : undefined);
  const unknown = (key: string, name: unknown): Refusal =>
    bad('FIELD_UNKNOWN', `${id}'s pairs.${key} names ${String(name)}, and ${id} has no such field.`, `pairs.${key}`, live.map((f) => f.id));

  /* ── on ── */
  const on = said.on;
  if (!Array.isArray(on) || on.length < 1 || on.length > 3 || on.some((x) => typeof x !== 'string' || entryOf(x) === null))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs.on is one to three field names both rows hold alike, a number or an amount written abs(amount) to compare its size.`,
      'pairs.on',
    );
  const entries = (on as string[]).map((x) => entryOf(x)!);
  for (const e of entries) {
    const f = field(e.field);
    if (!f) return unknown('on', e.field);
    if (e.abs && !NUMERIC.has(f.type))
      return bad('DECLARATION_INVALID', `${id}'s pairs.on says abs(${f.id}), and ${f.id} is a ${f.type}. abs() takes a money, int or decimal field.`, 'pairs.on');
    if (f.type === 'secret') return bad('DECLARATION_INVALID', `${id}'s pairs.on names ${f.id}, a secret, which nothing outside the vault reads.`, 'pairs.on');
  }
  if (entries.filter((e) => e.abs).length > 1)
    return bad('DECLARATION_INVALID', `${id}'s pairs.on takes one abs() amount, and names ${entries.filter((e) => e.abs).length}.`, 'pairs.on');

  /* ── opposite ── */
  const opposite = field(said.opposite);
  if (said.opposite === undefined || !opposite) return unknown('opposite', said.opposite);
  const twoWays = opposite.type === 'enum' && Array.isArray(opposite.values) && opposite.values.length === 2;
  if (!NUMERIC.has(opposite.type) && !twoWays)
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs.opposite is the field saying which way the money went: a signed money, int or decimal, or an enum of two values such as in and out. ${opposite.id} is ${opposite.type === 'enum' ? 'an enum of other than two values' : `a ${opposite.type}`}.`,
      'pairs.opposite',
    );
  if (!NUMERIC.has(opposite.type) && !entries.some((e) => e.abs))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs names no amount, so a zero could not be told from any other row. Put the amount in on as abs(amount).`,
      'pairs.on',
    );

  /* ── across, within, date, mark ── */
  const across = field(said.across);
  if (said.across === undefined || !across) return unknown('across', said.across);
  if (typeof said.within !== 'string' || !WINDOW.test(said.within))
    return bad('DECLARATION_INVALID', `${id}'s pairs.within is how far apart the two days may be, as 4d, 1w or 1m, and ${JSON.stringify(said.within)} is not.`, 'pairs.within');

  if (said.date !== undefined) {
    const d = field(said.date);
    if (!d) return unknown('date', said.date);
    if (d.type !== 'day') return bad('DECLARATION_INVALID', `${id}'s pairs.date is the day the window runs over, and ${d.id} is a ${d.type}.`, 'pairs.date');
  } else if (dateField(said, live) === null) {
    const days = live.filter((f) => f.type === 'day').map((f) => f.id);
    return bad(
      'DECLARATION_INVALID',
      days.length === 0
        ? `${id} has no day field, so pairs has no window to run over.`
        : `${id} has ${days.length} day fields, so say which one pairs runs its window over, as date: ${days[0]}.`,
      'pairs.date',
      days,
    );
  }

  const mark = field(said.mark);
  if (said.mark === undefined || !mark) return unknown('mark', said.mark);
  if (mark.type !== 'bool')
    return bad('DECLARATION_INVALID', `${id}'s pairs.mark is the bool set true on both legs, and ${mark.id} is a ${mark.type}.`, 'pairs.mark');
  return null;
}

/** Every field whose change can make or unmake a pair: an update touching none of them is not looked at again. */
export function pairsReads(pairs: PairsDecl, fields: readonly FieldShape[]): string[] {
  const date = dateField(pairs, fields);
  return [...pairs.on.map((x) => entryOf(x)?.field ?? x), pairs.opposite, pairs.across, ...(date === null ? [] : [date])];
}

type Amount = { size: number; currency: string | null };

/** A money or a number as its size and currency, or `null` when it is neither. */
function amountOf(value: unknown): Amount | null {
  if (typeof value === 'number') return { size: Math.abs(value), currency: null };
  if (value !== null && typeof value === 'object' && typeof (value as { amount?: unknown }).amount === 'number') {
    const v = value as { amount: number; currency?: unknown };
    return { size: Math.abs(v.amount), currency: typeof v.currency === 'string' ? v.currency : null };
  }
  return null;
}

/** A signed number or amount as its sign, `0` for zero, `null` for neither. */
const signOf = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : amountOf(value) ? (value as { amount: number }).amount : null;
  return n === null ? null : Math.sign(n);
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The one unpaired row of `register` that is the other leg of `row`, or `null`.
 *
 * THE WINDOW IS THE SQL AND THE REST IS READ HERE. The candidates are the live, unpaired rows whose day falls inside
 * `within` of this one, which is one range over a field a ledger indexes; what they then have to agree on is a handful of
 * comparisons on a handful of rows, and a JSON path per `on` entry built into SQL would be the same rule said twice.
 *
 * THE NEAREST DAY WINS, and the lower id on a tie, so the answer does not depend on the order rows were read in.
 */
export function partnerOf(sql: Sql, register: string, pairs: PairsDecl, fields: readonly FieldShape[], row: { id: string; fields: Record<string, unknown> }): string | null {
  const date = dateField(pairs, fields);
  if (date === null || row.fields._pair !== undefined) return null;
  const day = row.fields[date];
  const at = typeof day === 'string' ? atMs(day) : null;
  if (at === null || typeof day !== 'string') return null;

  const entries = pairs.on.map((x) => entryOf(x)!);
  const sized = entries.find((e) => e.abs)?.field ?? pairs.opposite;
  const amount = amountOf(row.fields[sized]);
  /* ZERO NEVER MATCHES. Two zero rows in two accounts on one day are not a movement of anything. */
  if (amount === null || amount.size === 0) return null;
  const way = row.fields[pairs.opposite];
  const across = row.fields[pairs.across];
  if (way === undefined || way === null || across === undefined || across === null) return null;

  const lo = shiftFrom(at, `-${pairs.within}`);
  const hi = shiftFrom(at, `+${pairs.within}`);
  if (lo === null || hi === null) return null;
  const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const candidates = sql.all<{ id: string; fields: string }>(
    `SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND id <> ? AND json_extract(fields, '$._pair') IS NULL
       AND json_extract(fields, '$.${date}') BETWEEN ? AND ?`,
    register,
    row.id,
    toDay(lo),
    toDay(hi),
  );

  const numeric = signOf(way) !== null;
  if (numeric && signOf(way) === 0) return null;
  const mine = amountOf(way);
  const matched: { id: string; gap: number }[] = [];
  for (const c of candidates) {
    const theirs = JSON.parse(c.fields) as Record<string, unknown>;
    const agrees = entries.every((e) => {
      if (!e.abs) return theirs[e.field] !== undefined && same(theirs[e.field], row.fields[e.field]);
      const a = amountOf(theirs[e.field]);
      const b = amountOf(row.fields[e.field]);
      return a !== null && b !== null && a.size === b.size && a.currency === b.currency;
    });
    if (!agrees) continue;
    const other = theirs[pairs.opposite];
    /* OPPOSITE WAYS: a signed amount of the other sign, or the enum's other value. */
    if (numeric) {
      const theirsWay = amountOf(other);
      if (theirsWay === null || signOf(other) !== -signOf(way)! || theirsWay.size !== mine!.size || theirsWay.currency !== mine!.currency) continue;
    } else if (other === undefined || other === null || same(other, way)) continue;
    if (theirs[pairs.across] === undefined || same(theirs[pairs.across], across)) continue;
    const when = typeof theirs[date] === 'string' ? atMs(theirs[date] as string) : null;
    if (when === null) continue;
    matched.push({ id: c.id, gap: Math.abs(when - at) });
  }
  matched.sort((a, b) => a.gap - b.gap || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return matched[0]?.id ?? null;
}
