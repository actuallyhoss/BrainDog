/**
 * Two figures that are not a sum over one list: cash rolled forward from what each account last said it held, and a
 * total read off the cash walk ahead.
 *
 * NEITHER IS AN AGGREGATION, AND WRITING EITHER AS ONE WAS THE DEFECT. money-core's "Cash now" is `sum: balance` over
 * the liquid accounts, and an account's `balance` is a number somebody typed on the day they typed it: every payment
 * since then is a row in `transactions` that the figure never reads, so the tile stands still while the money moves.
 * Its "Owed to you, 30 days" is a sum over `obligations` alone, while the forecast block on the same page walks every
 * list its legs name, so two numbers about the same thirty days can disagree on one screen. A balance rolled forward
 * and a walk are the two shapes that replace them, and both are read here so that every reader of a figure (a tile, a
 * page, `metric`, the night's `snapshot`) gets them through `evaluateMetric` and nothing else.
 *
 * ONE CURRENCY RULE FOR ALL THREE KINDS OF FIGURE. Each is added up in the record's home currency when one is set,
 * else in the one currency its money is in, else it is one amount per currency (`fx.ts` `across`), exactly as a sum
 * over a list is (`metrics.ts`).
 *
 * IMPORTED BY `metrics.ts` AND IMPORTING IT BACK, and `forecast.ts`, which it walks with, imports `metrics.ts` too.
 * `evaluateMetric` is the one door to a reading, so it hands these two shapes here, and this file reads the clock, the
 * predicate and the verdict through `metrics.ts`'s own functions so there is one rule for each. Every use of either
 * file is inside a function, never at the top level, which is what lets ES modules import each other in a ring.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { compile, jsonPath, type Schema } from '@braindog/where';

import { GROUP_CAP } from './buckets.ts';
import { GOVERNANCE_OPEN, HANDOFFS_OPEN, RECORD_DOOR, RECORD_KEYS, RECORD_PLACES, RECORD_SIGNS, RECORD_VITALS, SESSIONS_WORKING } from './built-in-figures.ts';
import { runway, type Leg, type Runway } from './forecast.ts';
import { across, type Amount, type Part } from './fx.ts';
import type { Entry } from './index.ts';
import {
  clockOf,
  deltaFrom,
  evaluateMetric,
  groupNames,
  largestFirst,
  predicateOf,
  scopeCurrency,
  verdictOf,
  windowMs,
  yearBefore,
  type EvalContext,
  type FxRead,
  type Group,
  type MetricDecl,
  type Reading,
  withLabels,
} from './metrics.ts';

/** The source a figure over the walk ahead names, in place of a list. */
export const WALK_SOURCE = 'forecast.runway';

/**
 * What a figure over the walk adds up: money arriving, money leaving, the two netted, the days until it goes under, or
 * the day it does.
 */
export const WALKS = ['in', 'out', 'net', 'days_to_zero', 'zero_on'] as const;

/**
 * Whether a walk is read off the balance going under, and so walks from an `opening` and looks a year ahead unasked.
 *
 * `days_to_zero` AND `zero_on` ARE ONE CROSSING SAID TWO WAYS, a count of days and the day itself, so every rule about
 * one (the opening, the default span, no value across two currencies) is asked here and holds for both.
 */
export const walksToZero = (walk: unknown): boolean => walk === 'days_to_zero' || walk === 'zero_on';

/**
 * The most account rows one rolled figure reads. Past it the figure refuses rather than adding up a subset.
 *
 * EACH ACCOUNT IS A HANDFUL OF INDEXED READS (its newest check in each list, its moves since), so this bounds the
 * queries one reading makes. Five hundred is far past the accounts a person or a small company keeps.
 */
export const ROLLED_ACCOUNTS_MOST = 500;

/** The most lists a rolled figure may restart an account from. money-core restarts from `balances` and `transactions`. */
export const ROLLED_CHECKS_MOST = 4;

/** How far ahead a `days_to_zero` or `zero_on` figure looks when it names no `within`: the Money page's own default horizon. */
const WALK_DAYS_DEFAULT = 365;

const DAY = 86_400_000;

/** A list whose rows restart an account's balance: which account a row is about, the balance it states, and its day. */
export type RolledCheck = { register: string; by: string; balance: string; on: string };

/** The list whose rows move money in and out of an account, and which of its rows count. */
export type RolledMoves = { register: string; by: string; on: string; amount: string; direction: string; out: string; where?: string };

/**
 * What a rolled figure answers in place of the money: the oldest day an account was last confirmed, that day's age in
 * whole days, or how many accounts were last confirmed longer ago than `after` (or never).
 */
export const ROLLED_READS = ['as_of', 'age', 'stale'] as const;

/**
 * `value: { rolled }` (`modules.md` C3): each account's own balance and day, the lists that restart it, and its moves.
 *
 * `read` TURNS THE SAME ROLL INTO A FIGURE ABOUT ITS AGE. A balance is only as new as the last thing that said it, the
 * account's own day or a check's (a bank message's balance after a movement, a typed balance check), so the age is read
 * from the same statements the roll restarts from and never from the account's typed day alone. `after` is the window
 * a `stale` figure counts past: `after: 7d`.
 */
export type Rolled = { balance: string; as_of: string; checks?: RolledCheck[]; moves: RolledMoves; read?: (typeof ROLLED_READS)[number]; after?: string };

/** `value: { walk, within }` over `source: forecast.runway` (`modules.md` C4). */
export type Walked = { walk: (typeof WALKS)[number]; within?: string };

/** Whether a figure's value is a rolled one. The shape inside is checked where it is read. */
export const isRolled = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'rolled');

const named = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** A `rolled` body as it must be, or the sentence saying what is wrong with it. `declare.ts` asks the same at install. */
export function rolledFault(rolled: unknown): string | null {
  if (rolled === null || typeof rolled !== 'object' || Array.isArray(rolled)) return 'rolled names the balance, its day, and the moves: { balance, as_of, moves }';
  const r = rolled as Record<string, unknown>;
  if (!named(r.balance) || !named(r.as_of)) return "rolled names the field holding each account's balance and the field holding the day it was stated: balance and as_of";
  const moves = r.moves as Record<string, unknown> | null | undefined;
  if (moves === null || typeof moves !== 'object' || Array.isArray(moves) || !['register', 'by', 'on', 'amount', 'direction', 'out'].every((k) => named(moves[k])))
    return 'rolled.moves names the list of moves, its account field, its day, its amount, its direction field and the value that means money out';
  if (moves.where !== undefined && typeof moves.where !== 'string') return 'rolled.moves.where is a sentence, such as state is cleared';
  if (r.checks !== undefined) {
    if (!Array.isArray(r.checks) || r.checks.length > ROLLED_CHECKS_MOST) return `rolled.checks is a list of at most ${ROLLED_CHECKS_MOST} lists that restart an account`;
    for (const c of r.checks as unknown[])
      if (c === null || typeof c !== 'object' || !['register', 'by', 'balance', 'on'].every((k) => named((c as Record<string, unknown>)[k])))
        return 'each of rolled.checks names its list, its account field, the balance it states and its day';
  }
  if (r.read !== undefined && !(ROLLED_READS as readonly unknown[]).includes(r.read))
    return `rolled.read is ${ROLLED_READS.join(', ')}, or left out for the money itself`;
  if (r.after !== undefined && (typeof r.after !== 'string' || windowMs(r.after) === null)) return 'rolled.after is a span of days, such as 7d';
  if (r.read === 'stale' && r.after === undefined) return 'a stale count says how old a balance may be before it counts: after: 7d';
  if (r.after !== undefined && r.read !== 'stale') return 'rolled.after is the window a stale count reads, so it goes with read: stale';
  return null;
}

/** A money value as the record stores one, or `null`. */
const moneyOf = (v: unknown): { amount: number; currency: string } | null => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as { amount?: unknown; currency?: unknown };
  return typeof m.amount === 'number' && Number.isFinite(m.amount) && typeof m.currency === 'string' && m.currency !== '' ? { amount: m.amount, currency: m.currency } : null;
};

/** The day a stored value names, its first ten characters, or `''` for none. An instant is dated by its UTC date, as `forecast.ts` dates one. */
const dayIn = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(v) ? v.slice(0, 10) : '');

/** What one reading of a money figure comes to, before the verdict and the comparison. */
type Summed = { value: number | null; unit: string | null; parts?: Part[]; fx?: FxRead };

/**
 * Amounts added up by the one currency rule: the currency somebody chose, else their one currency, else a part each.
 *
 * `into` IS THE HOME CURRENCY, OR THE ONE A ROW THE FIGURE IS ABOUT SAYS IT IS KEPT IN (`groupNames`, `scopeCurrency`
 * in `metrics.ts`): a book that says USD is read in dollars. `home` is only said beside it, as `FxRead` says it.
 */
function summed(amounts: readonly Amount[], into: string | null, home: string | null, rates: EvalRates, today: string): Summed {
  const said = across(amounts, into, rates, today, into !== null, 'sum');
  if (said.kind === 'one') return { value: said.amount, unit: said.currency };
  if (said.kind === 'converted')
    return { value: said.amount, unit: said.currency, fx: { into, home, asOf: said.asOf, forward: said.forward, stale: said.stale, missing: [] } };
  return { value: null, unit: null, parts: said.parts, fx: { into, home, asOf: null, forward: false, stale: false, missing: said.missing } };
}

type EvalRates = Parameters<typeof across>[2];

/** The comparison a rolled figure makes, in the words `evaluateMetric` uses for the same cases. */
function compared(decl: MetricDecl, now: Summed, before: (clockMs: number) => Summed | null, anchor: number): { delta: number | null; why: string } {
  const shift = decl.window ? windowMs(decl.window) : null;
  if (decl.compare === 'none' || shift === null) return { delta: null, why: 'no comparison asked for' };
  if (shift < 7 * DAY) return { delta: null, why: 'a window under seven days is noise' };
  const then = before(decl.compare === 'year_ago' ? yearBefore(anchor) : anchor - shift);
  if (then === null || then.value === null || now.value === null || then.value === 0 || then.unit !== now.unit)
    return { delta: null, why: 'the window before has nothing to compare against' };
  return { delta: deltaFrom(then.value, now.value), why: '' };
}

/**
 * A rolled cash figure (`modules.md` C3).
 *
 * PER ACCOUNT, THE LATEST THING ANYBODY SAID IT HELD, AND EVERY MOVE SINCE. The account row's own `balance` on its
 * `as_of` is one statement; each row of a check list about that account (a balance check, a bank message's balance
 * after a movement) is another. The latest on or before the day asked about wins, and on a tie the account's own
 * wins, so a check restarts an account only when it is newer. Every move dated after that day is then added, money
 * in plus and money out minus. An account with no `as_of` starts before its first move.
 *
 * A DAY BEFORE EVERY STATEMENT IS ROLLED BACK FROM THE EARLIEST ONE AFTER IT. The night's `snapshot` asks this figure
 * about each of the thirty days before, and an account first stated last week has no statement on the days before
 * that. Rather than read those days as nothing, the earliest statement after the day is taken and the moves between
 * are taken back off it, which is the same arithmetic run the other way.
 *
 * THE READING'S `as_of` IS THE OLDEST STATEMENT USED, so the tile can say how old the figure's weakest part is.
 *
 * WITH `read` SET THE VALUE IS THAT AGE AND NOT THE MONEY: the oldest day an account was last confirmed, its age in
 * days, or how many accounts are older than `after`, for the whole figure and for each group. The verdict and the
 * comparison read that number as they read any other.
 */
export function readRolled(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  const fault = rolledFault((decl.value as unknown as { rolled: unknown }).rolled);
  if (fault) return no<Reading>('VALUE_MALFORMED', `${decl.metric}: ${fault}.`, { at: 'value' });
  const rolled = (decl.value as unknown as { rolled: Rolled }).rolled;

  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null)
    return no<Reading>('DECLARATION_INVALID', `${decl.metric}: cash is rolled forward over a list of accounts, so the source is register.<id>, and ${decl.source} is not one.`, { at: 'source' });
  const accounts = ctx.schemaOf(register);
  if (!accounts) return no<Reading>('REGISTER_UNKNOWN', `${decl.metric}: there is no register called ${register}`, { at: 'source' });

  /* EVERY LIST AND FIELD THE FIGURE NAMES IS ASKED FOR BEFORE ONE ROW IS READ, because a field is made a JSON path
     below and `jsonPath` throws on a name that is not a field id. Declared means safe to address. */
  const lists: { schema: Schema; fields: string[]; at: string }[] = [];
  const moves = ctx.schemaOf(rolled.moves.register);
  if (!moves) return no<Reading>('REGISTER_UNKNOWN', `${decl.metric}: there is no register called ${rolled.moves.register}`, { at: 'value' });
  lists.push({ schema: accounts, fields: [rolled.balance, rolled.as_of, ...(decl.group_by === undefined ? [] : [decl.group_by])], at: 'value' });
  lists.push({ schema: moves, fields: [rolled.moves.by, rolled.moves.on, rolled.moves.amount, rolled.moves.direction], at: 'value' });
  const checks: { check: RolledCheck; schema: Schema }[] = [];
  for (const check of rolled.checks ?? []) {
    const schema = ctx.schemaOf(check.register);
    if (!schema) return no<Reading>('REGISTER_UNKNOWN', `${decl.metric}: there is no register called ${check.register}`, { at: 'value' });
    lists.push({ schema, fields: [check.by, check.balance, check.on], at: 'value' });
    checks.push({ check, schema });
  }
  for (const { schema, fields, at } of lists)
    for (const field of fields)
      if (!Object.hasOwn(schema.fields, field))
        return no<Reading>('FIELD_UNKNOWN', `${decl.metric}: ${schema.register} has no field called ${field}`, { at: field === decl.group_by ? 'group_by' : at });
  if (decl.bucket !== undefined)
    return no<Reading>('NOT_IN_THIS_BUILD', `${decl.metric}: a rolled figure is grouped by a field of its accounts, never cut into buckets of days`, { at: 'bucket' });

  const home = ctx.fx?.() ?? { home: null, rates: [] };

  /* THE ACCOUNTS THE FIGURE'S OWN `where` ADMITS, and the moves its `moves.where` admits, each compiled once. */
  const said = predicateOf(decl.where, accounts, ctx);
  if (said.bad.length) return { ok: false, refusal: said.bad[0]! };
  const w = compile(said.predicate, accounts);
  if (w.bad.length) return { ok: false, refusal: w.bad[0]! };
  const moved = predicateOf(rolled.moves.where, moves, ctx);
  if (moved.bad.length) return { ok: false, refusal: moved.bad[0]! };
  const m = compile(moved.predicate, moves);
  if (m.bad.length) return { ok: false, refusal: m.bad[0]! };

  const rows = sql.all<{ id: string; fields: string }>(
    `SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND (${w.sql}) ORDER BY rowid LIMIT ${ROLLED_ACCOUNTS_MOST + 1}`,
    register,
    ...w.params,
  );
  if (rows.length > ROLLED_ACCOUNTS_MOST)
    return no<Reading>('OUT_OF_BOUNDS', `${decl.metric}: ${register} holds more than ${ROLLED_ACCOUNTS_MOST} accounts this figure admits, which is more than one reading adds up. Narrow its where.`, { at: 'where' });
  const scope = decl.within === undefined ? null : predicateOf(decl.within, accounts, ctx);
  const held = (() => {
    const s = compile(scope?.predicate, accounts);
    return Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND (${s.sql})`, register, ...s.params)?.n ?? 0);
  })();
  const accountsRead = rows.map((r) => ({ id: r.id, fields: JSON.parse(r.fields) as Record<string, unknown> }));
  /* CASH IN ONE BOOK THAT SAYS IT IS KEPT IN DOLLARS IS DOLLARS (`scopeCurrency`), and each book's part of Cash now by
     book is read in the currency that book says, with its name beside its key (`groupNames`). */
  const into = scopeCurrency(sql, accounts, scope?.predicate, ctx) ?? null;
  const names =
    decl.group_by === undefined
      ? null
      : groupNames(
          sql,
          accounts,
          decl.group_by,
          accountsRead.map((a) => a.fields[decl.group_by!]).filter((k) => k !== null && k !== undefined && k !== '').map(String),
          ctx,
        );

  const day = (col: string): string => `substr(json_extract(fields, '${jsonPath(col)}'), 1, 10)`;

  /* ONE STATEMENT FROM A CHECK LIST: the newest on or before the day, or the earliest after it. */
  const statedIn = ({ check }: { check: RolledCheck }, account: string, on: string, after: boolean): { day: string; money: { amount: number; currency: string } } | null => {
    const row = sql.one<{ fields: string }>(
      `SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${jsonPath(check.by)}') = ?
         AND json_extract(fields, '${jsonPath(check.balance)}.amount') IS NOT NULL AND ${day(check.on)} ${after ? '>' : '<='} ?
       ORDER BY ${day(check.on)} ${after ? 'ASC' : 'DESC'}, rowid ${after ? 'ASC' : 'DESC'} LIMIT 1`,
      check.register,
      account,
      on,
    );
    if (!row) return null;
    const fields = JSON.parse(row.fields) as Record<string, unknown>;
    const money = moneyOf(fields[check.balance]);
    const when = dayIn(fields[check.on]);
    return money && when ? { day: when, money } : null;
  };

  /* AN ACCOUNT'S MOVES AFTER ONE DAY AND ON OR BEFORE ANOTHER, signed and added per currency in SQL, with the first
     day among them for an account that starts before its first move. */
  const movesBetween = (account: string, from: string, to: string): { currency: string; amount: number; first: string | null }[] =>
    sql
      .all<{ c: string; v: number | null; first: string | null }>(
        `SELECT json_extract(fields, '${jsonPath(rolled.moves.amount)}.currency') AS c,
                sum(CASE WHEN json_extract(fields, '${jsonPath(rolled.moves.direction)}') = ? THEN -json_extract(fields, '${jsonPath(rolled.moves.amount)}.amount')
                         ELSE json_extract(fields, '${jsonPath(rolled.moves.amount)}.amount') END) AS v,
                min(${day(rolled.moves.on)}) AS first
           FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '${jsonPath(rolled.moves.by)}') = ?
            AND json_extract(fields, '${jsonPath(rolled.moves.amount)}.amount') IS NOT NULL AND json_extract(fields, '${jsonPath(rolled.moves.amount)}.currency') IS NOT NULL
            AND ${day(rolled.moves.on)} > ? AND ${day(rolled.moves.on)} <= ? AND (${m.sql})
          GROUP BY c`,
        rolled.moves.out,
        rolled.moves.register,
        account,
        from,
        to,
        ...m.params,
      )
      .map((r) => ({ currency: String(r.c), amount: Number(r.v ?? 0), first: r.first }));

  /* ONE ACCOUNT ON ONE DAY: its amounts per currency, the day its statement is from, and the day it was last confirmed.
     `confirmed` IS A STATEMENT THAT SAYS BOTH A BALANCE AND A DAY, the account's own or a check's. An account with
     neither, or with a balance and no day, was never confirmed, and its `since` (the first move it rolls from) is not
     a confirmation: a balance nobody has stated is not a balance anybody checked. */
  const accountOn = (a: { id: string; fields: Record<string, unknown> }, on: string): { amounts: Amount[]; since: string | null; confirmed: string | null } => {
    const own = { day: dayIn(a.fields[rolled.as_of]), money: moneyOf(a.fields[rolled.balance]) };
    /* THE ACCOUNT'S OWN STATEMENT WITH NO DAY STANDS BEFORE EVERY MOVE (`''` sorts first), and one with no balance starts
       from nothing. A check always restarts it, since any check is newer than before everything. */
    let start: { day: string; money: { amount: number; currency: string } | null } | null = own.day === '' || own.day <= on ? own : null;
    for (const c of checks) {
      const stated = statedIn(c, a.id, on, false);
      if (stated && (start === null || stated.day > start.day)) start = stated;
    }
    if (start !== null) {
      const since = movesBetween(a.id, start.day, on);
      const amounts: Amount[] = [...(start.money ? [{ ...start.money, day: null }] : []), ...since.map((s) => ({ currency: s.currency, amount: s.amount, day: null }))];
      const first = since.map((s) => s.first).filter((d): d is string => typeof d === 'string').sort()[0] ?? null;
      return { amounts, since: start.day !== '' ? start.day : first, confirmed: start.day !== '' && start.money ? start.day : null };
    }
    /* EVERY STATEMENT IS AFTER THE DAY: the earliest of them, less what moved between the day and it. Rolled back so,
       the balance was not yet confirmed on the day, as a rate dated later is not known on it (`readRatesAge`): a day
       the night's snapshot reads from before an account's first statement counts it never confirmed, not fresh. */
    let later: { day: string; money: { amount: number; currency: string } | null } = own;
    for (const c of checks) {
      const stated = statedIn(c, a.id, on, true);
      if (stated && stated.day < later.day) later = stated;
    }
    const between = movesBetween(a.id, on, later.day);
    return {
      amounts: [...(later.money ? [{ ...later.money, day: null }] : []), ...between.map((s) => ({ currency: s.currency, amount: -s.amount, day: null }))],
      since: later.day,
      confirmed: null,
    };
  };

  /* WHAT `read` ANSWERS FOR A SET OF ACCOUNTS' LAST CONFIRMED DAYS ON ONE DAY. A day is held as the whole days since 1970
     that name it, as `zero_on` holds one, and an age is counted in whole days (never below nought, though a confirmed
     day is never after the day asked about). The oldest day and its age leave out an account never confirmed, which
     has no day to say; the stale count counts it, so it is never quietly fresh. */
  const reads = rolled.read;
  const afterDays = rolled.after === undefined ? 0 : Math.round((windowMs(rolled.after) ?? 0) / DAY);
  const epochDay = (d: string): number => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
  const agesSay = (days: readonly (string | null)[], on: string): number | null => {
    const today = epochDay(on);
    if (reads === 'stale') return days.filter((d) => d === null || today - epochDay(d) > afterDays).length;
    const oldest = days.filter((d): d is string => d !== null).sort()[0];
    if (oldest === undefined) return null;
    return reads === 'as_of' ? epochDay(oldest) : Math.max(0, today - epochDay(oldest));
  };

  /* THE WHOLE FIGURE AND ITS GROUPS AS OF ONE CLOCK. A rate is taken as of the day asked about, because a balance held
     in another currency is worth what it converts to on that day, whichever day it was stated on. */
  const rollAt = (clockMs: number, grouped: boolean): { whole: Summed; since: string | null; groups: Group[] | null; more: number } => {
    const on = new Date(clockMs).toISOString().slice(0, 10);
    const all: Amount[] = [];
    const byKey = new Map<string, { amounts: Amount[]; rows: number; days: (string | null)[] }>();
    const days: (string | null)[] = [];
    let since: string | null = null;
    for (const a of accountsRead) {
      const read = accountOn(a, on);
      all.push(...read.amounts);
      days.push(read.confirmed);
      if (read.since !== null && read.amounts.length > 0 && (since === null || read.since < since)) since = read.since;
      if (!grouped || decl.group_by === undefined) continue;
      const key = a.fields[decl.group_by];
      if (key === null || key === undefined || key === '') continue;
      const slot = byKey.get(String(key)) ?? { amounts: [], rows: 0, days: [] };
      slot.amounts.push(...read.amounts);
      slot.rows += 1;
      slot.days.push(read.confirmed);
      byKey.set(String(key), slot);
    }
    /* A FIGURE ABOUT AGE IS A PLAIN NUMBER, never money, so it has no currency and nothing to convert. Each group says
       its own accounts' answer, which is what lets a line name each old account. Oldest first when the answer is a
       day, with a group never confirmed before every dated one; otherwise the largest age or count first. */
    if (reads !== undefined) {
      const whole: Summed = { value: agesSay(days, on), unit: null };
      if (!grouped || decl.group_by === undefined) return { whole, since, groups: null, more: 0 };
      const aged = [...byKey].map(([key, slot]): Group => ({ key, value: agesSay(slot.days, on), rows: slot.rows, state: 'full' }));
      aged.sort(reads === 'as_of' ? (a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : largestFirst);
      const kept = aged.slice(0, GROUP_CAP);
      return { whole, since, groups: names ? withLabels(kept, names) : kept, more: Math.max(0, aged.length - GROUP_CAP) };
    }
    const whole = summed(all, into ?? home.home, home.home, home.rates, on);
    if (!grouped || decl.group_by === undefined) return { whole, since, groups: null, more: 0 };
    const sums = [...byKey].map(([key, slot]) => ({ key, rows: slot.rows, s: summed(slot.amounts, names?.currency(key) ?? into ?? home.home, home.home, home.rates, on) }));
    /* ONE GROUP IN ANOTHER CURRENCY PUTS EVERY GROUP IN PARTS, as `groupsOf` keeps it: bars ranked on raw minor units of
       two currencies are ranked on nothing. */
    const units = new Set(sums.map((g) => g.s.unit).filter((u): u is string => u !== null));
    const apart = units.size > 1 || sums.some((g) => g.s.parts);
    const groups = sums.map(({ key, rows, s }): Group => {
      const parts = s.parts ?? (apart && s.value !== null && s.unit !== null ? [{ currency: s.unit, amount: s.value }] : undefined);
      return { key, value: apart ? null : s.value, rows, state: 'full', ...(parts ? { parts } : {}) };
    });
    groups.sort(largestFirst);
    const kept = groups.slice(0, GROUP_CAP);
    return { whole, since, groups: names ? withLabels(kept, names) : kept, more: Math.max(0, groups.length - GROUP_CAP) };
  };

  const anchor = clockOf(ctx);
  const now = rollAt(anchor, true);
  const { delta, why } = compared(decl, now.whole, (clockMs) => rollAt(clockMs, false).whole, anchor);
  const today = new Date(anchor).toISOString().slice(0, 10);
  const verdict = verdictOf(decl, now.whole.value, now.whole.unit, home.rates, today);
  return ok({
    value: now.whole.value,
    unit: now.whole.unit,
    rows: accountsRead.length,
    held,
    delta,
    why,
    met: verdict.met,
    refusals: [],
    ...(verdict.targetIn ? { targetIn: verdict.targetIn } : {}),
    ...(now.whole.parts ? { parts: now.whole.parts } : {}),
    ...(now.whole.fx ? { fx: now.whole.fx } : {}),
    ...(now.since !== null ? { as_of: now.since } : {}),
    ...(now.groups ? { groups: now.groups, more: now.more } : {}),
  });
}

/** Whether a figure reads the walk ahead rather than a list. */
export const isWalked = (decl: Pick<MetricDecl, 'source'>): boolean => decl.source === WALK_SOURCE;

/** A row as the walk reads one. The same columns the kernel's own `byId` reads, with a deleted row read as none. */
function rowOf(sql: Sql, id: string): Entry | null {
  const row = sql.one<Record<string, unknown>>('SELECT id, register, seq, fields, state, version, created_at, updated_at, deleted_at FROM entry WHERE id = ?', id);
  if (!row || (row.deleted_at !== null && row.deleted_at !== undefined)) return null;
  return {
    id: String(row.id),
    register: String(row.register),
    seq: row.seq === null || row.seq === undefined ? null : Number(row.seq),
    fields: JSON.parse(String(row.fields ?? '{}')) as Entry['fields'],
    state: row.state === null || row.state === undefined ? null : String(row.state),
    version: Number(row.version),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: null,
  };
}

/** A figure's own `within`, as whole days ahead, or the sentence saying why it is not one. */
function daysAhead(walked: Walked): number | string {
  if (walked.within === undefined) return walksToZero(walked.walk) ? WALK_DAYS_DEFAULT : 'a walk figure says how far ahead it adds up: within: 30d';
  const ms = typeof walked.within === 'string' ? windowMs(walked.within) : null;
  return ms === null ? `${String(walked.within)} is not a span ahead: write 30d, 4w or 3m` : Math.round(ms / DAY);
}

/**
 * A figure over the cash walk ahead (`modules.md` C4): money arriving, money leaving, the two netted, the days until
 * the balance goes under, or the day it does.
 *
 * THE SAME WALK THE FORECAST BLOCK DRAWS, over the legs the figure declares, so a tile, the bridge beside it and the
 * table of what is coming add up the same movements. An overdue movement is in it, clamped to today, as it is in the
 * walk: money that has not moved yet is still to move, whatever its date says.
 *
 * `out` IS A MAGNITUDE, the money leaving as a positive amount, because a tile reading "Going out" says the direction
 * in its words. `net` is signed. `days_to_zero` walks from the figure `opening` names, and has no value when the
 * balance stays above zero inside the span.
 *
 * `zero_on` IS THE SAME CROSSING AS A DAY, for a tile that says "Runs out 30 Oct" where a count of days goes stale by
 * morning. It walks from the same `opening` and has no value in the same cases. A reading's value is a number, so the
 * day is held as the whole days since 1970 that name it, which is what `format: day` already means for the earliest or
 * latest of a day field (`metrics.ts`), and the reader writes it as a date.
 *
 * MONEY MISSING FROM THE WALK IS A REFUSAL HERE, where the forecast block draws the walk and lists what it left out. A
 * figure is one number with no room for the list, and one computed from most of the money is the answer wearing the
 * shape of one.
 */
export function readWalk(sql: Sql, decl: MetricDecl, ctx: EvalContext): Result<Reading> {
  const value = decl.value as unknown as Record<string, unknown>;
  const walked = value as unknown as Walked;
  if (!(WALKS as readonly unknown[]).includes(value.walk))
    return no<Reading>('VALUE_MALFORMED', `${decl.metric}: a figure over the walk is walk: ${WALKS.join(', ')}.`, { at: 'value', allowed: [...WALKS] });
  const legs = decl.legs;
  if (!Array.isArray(legs) || legs.length === 0)
    return no<Reading>('REQUIRED_MISSING', `${decl.metric}: a figure over the walk names the legs it walks.`, { at: 'legs' });
  const horizon = daysAhead(walked);
  if (typeof horizon === 'string') return no<Reading>('VALUE_MALFORMED', `${decl.metric}: ${horizon}.`, { at: 'value' });

  /* THE CLOCK THE WORDS ARE NAMED FROM, so the walk's today is the record's local day and, under `asOfMs`, the day asked
     about (`clockOf`).

     AND AS `asOfMs` TOO, so the walk's own `predicateOf` takes this clock as it is. Handed only as `nowMs`, a live read
     in a zone would be named from its local date a second time: noon UTC is already the next day in a zone twelve or
     more hours east of UTC (New Zealand in summer), so every leg's `where` would be read from tomorrow. */
  const at = clockOf(ctx);
  const walkCtx: EvalContext = { ...ctx, nowMs: at, asOfMs: at };
  const deps = { sql, schemaOf: ctx.schemaOf, titleOf: () => null, hydrate: (id: string) => rowOf(sql, id), ctx: walkCtx };
  const today = new Date(at).toISOString().slice(0, 10);
  const home = ctx.fx?.() ?? { home: null, rates: [] };

  let opening = 0;
  let openingUnit: string | null = null;
  const toZero = walksToZero(walked.walk);
  if (toZero) {
    const from = decl.opening?.metric;
    if (typeof from !== 'string' || from === '')
      return no<Reading>('REQUIRED_MISSING', `${decl.metric}: ${walked.walk === 'zero_on' ? 'the day the money runs out is' : 'the days until the money runs out are'} walked from a figure of what is held now: opening: { metric: cash-now }.`, { at: 'opening' });
    const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${from}`);
    if (!row) return no<Reading>('METRIC_UNKNOWN', `${decl.metric}: there is no metric called ${from} to walk from.`, { at: 'opening' });
    const figure = JSON.parse(row.body) as MetricDecl;
    /* ONE STEP DEEP. A walk opened from a walk would read its own kind again, and a loop of two would never end. */
    if (isWalked(figure))
      return no<Reading>('DECLARATION_INVALID', `${decl.metric}: a walk opens from a figure of what is held, and ${from} is itself a walk.`, { at: 'opening' });
    const read = evaluateMetric(sql, figure, ctx);
    if (!read.ok) return read;
    if (read.value.value === null)
      return ok(empty(decl, 'the figure it walks from is in several currencies with no rate to add them', home.rates, today));
    opening = read.value.value;
    openingUnit = read.value.unit;
  }

  const walk = runway(deps, opening, legs, horizon);
  if (!walk.ok) return walk;

  /* SEVERAL CURRENCIES WITH NO WAY TO ADD THEM ARE ONE AMOUNT EACH, the walk run once per currency with its own
     movements unconverted (`only`). The days until zero are a date, and a date across two currencies is a day on which
     nothing happens, so that figure and the day itself have no value then. */
  const apart = walk.value.currency === null && walk.value.mixed.length > 0;
  if (apart) {
    if (toZero) return ok(empty(decl, 'the walk is in several currencies with no rate to add them', home.rates, today));
    const parts: Part[] = [];
    let steps = 0;
    for (const currency of walk.value.mixed) {
      const one = runway(deps, 0, legs, horizon, currency);
      if (!one.ok) return one;
      const bad = one.value.refusals[0];
      if (bad) return { ok: false, refusal: bad };
      parts.push({ currency, amount: totalOf(one.value, walked.walk) ?? 0 });
      steps += one.value.steps.length;
    }
    return ok({
      ...empty(decl, 'no comparison asked for', home.rates, today),
      rows: steps,
      held: steps,
      parts,
      fx: { into: home.home, home: home.home, asOf: null, forward: false, stale: false, missing: walk.value.missing ?? [] },
    });
  }
  const bad = walk.value.refusals[0];
  if (bad) return { ok: false, refusal: bad };

  const unit = toZero ? null : walk.value.currency;
  if (toZero && openingUnit !== null && walk.value.currency !== null && openingUnit !== walk.value.currency)
    return no<Reading>('MIXED_CURRENCY', `${decl.metric}: the walk is in ${walk.value.currency} and the figure it opens from is in ${openingUnit}, and a balance is never walked across two currencies.`, {
      at: 'opening',
      allowed: [walk.value.currency],
    });
  const total = totalOf(walk.value, walked.walk);
  const verdict = verdictOf(decl, total, unit, home.rates, today);
  const converted = walk.value.converted;
  return ok({
    value: total,
    unit,
    rows: walk.value.steps.length,
    held: walk.value.steps.length,
    delta: null,
    why:
      total === null
        ? `the balance stays above zero for the ${horizon} days this walks`
        : decl.compare === 'none'
          ? 'no comparison asked for'
          : 'a walk ahead has no window before it to compare with',
    met: verdict.met,
    refusals: [],
    ...(verdict.targetIn ? { targetIn: verdict.targetIn } : {}),
    ...(converted ? { fx: { into: home.home, home: home.home, asOf: converted.asOf, forward: converted.forward, stale: converted.stale, missing: [] } } : {}),
  });
}

/** What a walk adds up to, as the figure asks for it. */
function totalOf(walk: Runway, kind: Walked['walk']): number | null {
  if (kind === 'days_to_zero') return walk.days;
  /* THE DAY ITSELF, as whole days since 1970: the walk's own day for the step that went under, never today plus a count. */
  if (kind === 'zero_on') return walk.crossed ? Math.round(Date.parse(`${walk.crossed.day}T00:00:00Z`) / DAY) : null;
  let total = 0;
  for (const step of walk.steps) {
    if (kind === 'in' && step.delta > 0) total += step.delta;
    else if (kind === 'out' && step.delta < 0) total -= step.delta;
    else if (kind === 'net') total += step.delta;
  }
  return total;
}

/** A reading with no value, and the sentence saying why. */
function empty(decl: MetricDecl, why: string, rates: EvalRates, today: string): Reading {
  return { value: null, unit: null, rows: 0, held: 0, delta: null, why, met: verdictOf(decl, null, null, rates, today).met, refusals: [] };
}

/**
 * Every list a figure reads, for a caller deciding whether somebody may be shown it.
 *
 * A FIGURE'S `source` IS NO LONGER THE WHOLE OF WHAT IT READS. A rolled figure reads its accounts, every list that
 * restarts one and the list of moves; a walk reads each list its legs walk and, for the days until zero, the lists of
 * the figure it opens from. A caller that asked `readable` of the source alone would hand a member invited to Accounts
 * the sum of the Transactions she cannot open, which is the leak `registersOf` in `pages.ts` already closes for the
 * forecast block's legs. `opening` names a figure, and its lists are the caller's to add through `figure`.
 *
 * AND THE LIST ITS PARTS ARE NAMED FROM, when its `group_by` is a ref and `pointsAt` can say where that points. Each part
 * carries the title of the row its key is (`groupNames` in `metrics.ts`), so Cash now by book hands its reader the
 * books' names and is a figure over Books as much as over Accounts. Without `pointsAt` nothing more is named, which is
 * what this answered before the parts had names.
 */
export function figureLists(
  decl: Pick<MetricDecl, 'source' | 'value' | 'legs' | 'opening' | 'group_by'>,
  figure?: (id: string) => Pick<MetricDecl, 'source' | 'value' | 'legs' | 'opening' | 'group_by'> | null,
  pointsAt?: PointsAt,
): string[] {
  /* THE COUNT OF OPEN QUESTIONS (`built-in-figures.ts`) READS THE WHOLE RECORD, as the queue over the same source does,
     so it names `*`, which only somebody who reads every list may: named by no list, the record's `metric` answered a
     member invited to one list how many questions were waiting on the owner. */
  if (decl.source === GOVERNANCE_OPEN) return ['*'];
  /* THE RECORD'S SIGNS TOO: what waits in the inbox and what runs on a clock belongs to no list, and to every reader of
     every list. */
  if (decl.source === RECORD_SIGNS) return ['*'];
  /* THE COUNT OF RUNS WORKING NOW READS THE RUNS, so it is named by Session, as a page over `sessions.working` is. */
  if (decl.source === SESSIONS_WORKING) return ['session'];
  if (decl.source === HANDOFFS_OPEN) return ['session'];
  /* THE DOOR'S MARKS, THE KEYS AND THE PLACES, AND THE VITAL SIGNS read the whole record, so they name `*`: named by no
     list, a member held to one list could read the key and door counts (kernel-figures-43). */
  if (decl.source === RECORD_DOOR || decl.source === RECORD_KEYS || decl.source === RECORD_PLACES || decl.source === RECORD_VITALS) return ['*'];
  /* A KEPT LINE (`series.<figure>`) IS READ BY WHOEVER READS ITS FIGURE: how many nights Cash now missed says something
     about the lists Cash now reads, so it names them. A line of a figure this record does not hold, or a line of a line,
     names the whole record, so nobody held to part of it is shown it. */
  if (decl.source.startsWith('series.')) {
    const of = figure?.(decl.source.slice('series.'.length)) ?? null;
    return of === null || of.source.startsWith('series.') ? ['*'] : figureLists(of, figure, pointsAt);
  }
  const out = new Set<string>();
  const add = (d: Pick<MetricDecl, 'source' | 'value' | 'legs'>) => {
    if (d.source.startsWith('register.')) out.add(d.source.slice('register.'.length));
    const rolled = isRolled(d.value) ? (d.value as unknown as { rolled: unknown }).rolled : null;
    if (rolled !== null && typeof rolled === 'object') {
      const r = rolled as { moves?: { register?: unknown }; checks?: unknown };
      if (typeof r.moves?.register === 'string') out.add(r.moves.register);
      if (Array.isArray(r.checks)) for (const c of r.checks as { register?: unknown }[]) if (typeof c?.register === 'string') out.add(c.register);
    }
    if (d.source === WALK_SOURCE) for (const leg of legsOf(d)) if (typeof leg?.register === 'string') out.add(leg.register);
  };
  add(decl);
  const opened = decl.source === WALK_SOURCE && typeof decl.opening?.metric === 'string' ? figure?.(decl.opening.metric) : null;
  /* ONE STEP DEEP, as the walk itself reads it: a walk never opens from a walk. */
  if (opened && opened.source !== WALK_SOURCE) add(opened);
  const named = pointsAt && typeof decl.group_by === 'string' && decl.source.startsWith('register.') ? pointsAt(decl.source.slice('register.'.length), decl.group_by) : null;
  if (named) out.add(named);
  return [...out];
}

/** The list a ref field of a list points at, or `null` for a field that is not a ref. */
export type PointsAt = (register: string, field: string) => string | null;

/** The legs a walk figure declares, or none. */
const legsOf = (decl: Pick<MetricDecl, 'legs'>): readonly Leg[] => (Array.isArray(decl.legs) ? decl.legs : []);
