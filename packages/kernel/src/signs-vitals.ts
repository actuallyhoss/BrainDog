/**
 * The record's own vitals: three readings in the shape `signs.ts` sets, joined to its closed list
 * with one import and one spread. Every write has an author, the file says the format this build reads, and every
 * amount is whole minor units with a currency.
 *
 * WHY THIS EXISTS. The record promises all three (§3's actor grammar, `30 §11`'s format, "minor units, never add
 * currencies"), and nothing read a live record to say they held. These read the record's own tables and say what they
 * find with names, never ids, on every record alike.
 *
 * `system` IS RIGHT FOR THE KERNEL'S OWN WORK (`30 §3`: migrations, purges, the scheduler, the dead-letter question), so
 * `writes-authored` does not count it as such. It counts a write signed by nobody, and a change to a list's items signed
 * `system` that nothing stands behind: no write by somebody else in the same batch, no sentence of the sweep that made
 * it, and not the nightly snapshot, whose row says it was taken by the night. The kernel's `opts.actor ?? 'system'`
 * fallbacks are what this catches.
 *
 * `format-current` READS GREEN ON EVERY RECORD THAT OPENED, because `applyMigrations` brings a record up to this build
 * at every open (`migrate.ts`), and none on a file with no record made in it, as every sign reads an empty record. It
 * goes red on a file read without opening it, or on an open that half failed. The
 * guard that an older file still opens is `test/old-format.test.ts`.
 *
 * ONLY TYPES COME FROM `signs.ts`. It spreads `SIGNS_VITALS` into `VITAL_SIGNS` at load, so a value imported back from
 * it would be read before it exists whenever this file is the one loaded first. Nothing from `migrate.ts` is read at
 * load either, for the same reason. `pairs.ts` and `finished.ts` are read at load and neither reaches `signs.ts`
 * (`test/signs-rate-age.test.ts` loads this file first to hold that).
 *
 * AND ONE BESIDE THE THREE (pairs-fx-guard-62-63): `rate-age`, how old the newest rate is. Two currencies pair by
 * themselves only on a rate at most `PAIR_RATE_DAYS` old (`pairs.ts`); past that both halves of a move stay counted,
 * and nothing on the record said why until this did. NOBODY IS ASKED YET (the question is built in `pairs.ts` and
 * wired nowhere), so the sign does not say anybody is.
 */

import { unprivate } from '@braindog/where';
import type { Sql } from '@braindog/ports';

import { isCurrencyCode } from './coerce.ts';
import { dayIn } from './finished.ts';
import { FORMAT_VERSION, KERNEL_MIGRATION } from './migrate.ts';
import { newestRate, PAIR_RATE_DAYS } from './pairs.ts';
import { ratesFeed, ratesFeedSaid } from './rates-feed.ts';
import type { SignLasts, SignReader, SignReading, SignState } from './signs.ts';

const HOUR = 3_600_000;

/* ── the thresholds, one line each ───────────────────────────────────── */

/** Writes of this many hours back are judged for their author: the scope's "the last day". */
export const AUTHORED_WINDOW_HOURS = 24;
/** Red when more than this many writes in the window have no author. */
export const UNAUTHORED_MOST = 0;
/** Red when the record is more than this many updates behind the build. */
export const FORMAT_BEHIND_MOST = 0;
/** Red when more than this many amounts are not whole or have no currency. */
export const AMOUNTS_BROKEN_MOST = 0;
/** Red when the newest rate is more than this many days old: the pairing's own limit, so the two cannot drift apart. */
export const RATE_DAYS_MOST = PAIR_RATE_DAYS;

/** The kinds of line that change a list's items. Every other kind signed `system` is the kernel's own work by grammar. */
export const ITEM_WRITES: readonly string[] = ['create', 'edit', 'state', 'link', 'tag', 'untag', 'delete', 'restore'];

/** An actor that is a value lost on the way, not an author: empty, or a JavaScript nothing written as text. */
export const NO_AUTHOR: readonly string[] = ['', 'undefined', 'null'];

/** What the nightly snapshot writes in its row's `taken` (kernel `writeNight`): the night schedule is its author. */
export const NIGHT_TAKEN = 'nightly';

/* ── helpers ───────────────────────────────────────────────────────────── */

const reading = (state: SignState, value: number | null, said: string, facts: string[] = []): SignReading => ({ state, value, said, facts: facts.slice(0, 6) });

/** `n thing` or `n things`. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** An id said as words, only where nothing declares a name: `gold-rate` is `gold rate`. */
const plain = (id: string): string => id.replace(/[-_.:]+/g, ' ').trim();

/** A JSON object, or `null`. */
function parsed(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Most first: `[name, n]` for each name, so a fact reads the busiest first. */
function tally(all: readonly string[]): [string, number][] {
  const by = new Map<string, number>();
  for (const n of all) by.set(n, (by.get(n) ?? 0) + 1);
  return [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

type List = { id: string; name: string; title: string | null; money: string[] };

/** Every live list: its id, the name a person reads, its title field and its money fields. */
function lists(sql: Sql): Map<string, List> {
  const out = new Map<string, List>();
  for (const d of sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY id")) {
    const body = parsed(d.body);
    const id = d.id.slice('register.'.length);
    const fields = Array.isArray(body?.fields) ? (body.fields as unknown[]).filter((f): f is Record<string, unknown> => f !== null && typeof f === 'object') : [];
    const name = typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : plain(id);
    const title = typeof body?.title === 'string' ? body.title : null;
    out.set(id, { id, name, title, money: fields.filter((f) => f.type === 'money' && typeof f.id === 'string').map((f) => f.id as string) });
  }
  return out;
}

/** `A`, `A and B`, `A, B and C`, or the first three and how many more. */
function names(all: readonly string[]): string {
  const shown = all.slice(0, 3);
  const more = all.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)!}`;
}

/* ── writes-authored ───────────────────────────────────────────────────── */

/**
 * WHAT STANDS BEHIND A `system` WRITE, read across the whole write (`id = g OR batch = g`: the first line of a write is
 * the batch its other lines carry, and a rule's lines carry the batch of the write that started it): a line signed by
 * somebody else, a sentence the sweep wrote, or the night's own mark on the row it took.
 */
const BACKED = `SELECT 1 AS x FROM event WHERE (id = ? OR batch = ?) AND (
    (actor <> 'system' AND trim(actor) NOT IN (SELECT value FROM json_each(?)))
    OR (note IS NOT NULL AND trim(note) <> '')
    OR (kind = 'create' AND json_valid(to_v) AND json_extract(to_v, '$.taken') = ?)
  ) LIMIT 1`;

function readAuthored(sql: Sql, nowMs: number, lasts: SignLasts = () => undefined): SignReading {
  const since = new Date(nowMs - AUTHORED_WINDOW_HOURS * HOUR).toISOString();
  const window = sql.one<{ n: number; first: string | null }>('SELECT count(DISTINCT coalesce(batch, id)) AS n, min(ts) AS first FROM event WHERE ts >= ?', since);
  /* THE OLDEST LINE OF THE WINDOW LEAVES IT by the clock alone (`SignLasts`); a time that cannot be read never does. */
  const first = typeof window?.first === 'string' ? Date.parse(window.first) : Number.NaN;
  lasts(Number.isNaN(first) ? Infinity : first + AUTHORED_WINDOW_HOURS * HOUR);
  const writes = Number(window?.n ?? 0);
  if (writes === 0) return reading('none', null, `Nothing was written in the last ${AUTHORED_WINDOW_HOURS} hours.`);
  const lines = sql.all<{ id: string; batch: string | null; actor: string; register: string | null }>(
    `SELECT e.id, e.batch, e.actor, n.register FROM event e
       LEFT JOIN entry n ON e.target_kind = 'entry' AND n.id = substr(e.target, 7)
      WHERE e.ts >= ? AND (trim(e.actor) IN (SELECT value FROM json_each(?)) OR (e.actor = 'system' AND e.kind IN (SELECT value FROM json_each(?))))
      ORDER BY e.ts, e.rowid`,
    since,
    JSON.stringify(NO_AUTHOR),
    JSON.stringify(ITEM_WRITES),
  );
  /* ONE WRITE IS ONE COUNT, however many fields it touched: the lines are grouped by the write they belong to. */
  const groups = new Map<string, { nobody: boolean; register: string | null }>();
  for (const l of lines) {
    const g = l.batch ?? l.id;
    const was = groups.get(g);
    const nobody = NO_AUTHOR.includes(l.actor.trim());
    groups.set(g, { nobody: (was?.nobody ?? false) || nobody, register: was?.register ?? l.register });
  }
  const bare = [...groups].filter(([g, w]) => w.nobody || sql.one(BACKED, g, g, JSON.stringify(NO_AUTHOR), NIGHT_TAKEN) === undefined);
  const facts = [`${count(writes, 'write')} in the last ${AUTHORED_WINDOW_HOURS} hours, ${bare.length} without an author.`];
  if (bare.length <= UNAUTHORED_MOST) return reading('green', 0, `Every write in the last ${AUTHORED_WINDOW_HOURS} hours has an author.`, facts);
  const all = lists(sql);
  const where = (register: string | null): string => (register === null ? 'this BrainDog itself' : (all.get(register)?.name ?? plain(register)));
  const nobody = tally(bare.filter(([, w]) => w.nobody).map(([, w]) => where(w.register)));
  const unbacked = tally(bare.filter(([, w]) => !w.nobody).map(([, w]) => where(w.register)));
  facts.push(...nobody.map(([name, n]) => `${count(n, 'write')} to ${name} signed by nobody.`));
  facts.push(...unbacked.map(([name, n]) => `${count(n, 'write')} to ${name} signed by BrainDog with no schedule, script or plugin behind ${n === 1 ? 'it' : 'them'}.`));
  const at = tally(bare.map(([, w]) => where(w.register))).map(([name]) => name);
  return reading('red', bare.length, `${count(bare.length, 'write')} in the last ${AUTHORED_WINDOW_HOURS} hours ${bare.length === 1 ? 'has' : 'have'} no author: ${names(at)}.`, facts);
}

/* ── format-current ────────────────────────────────────────────────────── */

function readFormat(sql: Sql): SignReading {
  /* A FILE WITH NO RECORD MADE IN IT is nothing to judge by, as every sign reads an empty record (`signs.ts`). */
  const own = sql.one<{ format_ver: number }>('SELECT format_ver FROM record LIMIT 1')?.format_ver;
  if (own === undefined) return reading('none', null, 'No record has been made in this file yet.');
  const applied = sql.all<{ version: number }>('SELECT version FROM migration ORDER BY version').map((r) => Number(r.version));
  const have = new Set(applied);
  const missing = Array.from({ length: KERNEL_MIGRATION }, (_, i) => i + 1).filter((v) => !have.has(v));
  const newer = applied.filter((v) => v > KERNEL_MIGRATION);
  /* THE TWO PLACES THE FORMAT TRAVELS (`applyOne`): `dog_meta`, which an export reads, and the record's own line. */
  const meta = sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'format'")?.value;
  const said: string[] = [];
  const facts = [`Format ${FORMAT_VERSION} is what this build reads, with ${count(KERNEL_MIGRATION, 'update')} to the layout.`];
  if (missing.length > 0) {
    said.push(`This BrainDog is ${count(missing.length, 'update')} behind this build.`);
    facts.push(`${count(applied.filter((v) => v <= KERNEL_MIGRATION).length, 'update')} of ${KERNEL_MIGRATION} are in.`);
  }
  if (newer.length > 0) said.push(`This BrainDog was written by a newer build, ${count(newer.length, 'update')} ahead of this one.`);
  const wrong = [meta === undefined || Number(meta) !== FORMAT_VERSION, Number(own) !== FORMAT_VERSION].filter(Boolean).length;
  if (meta === undefined) said.push('Its file does not say its format.');
  else if (Number(meta) !== FORMAT_VERSION) said.push(`Its file says format ${String(meta).slice(0, 20)} where this build reads format ${FORMAT_VERSION}.`);
  if (Number(own) !== FORMAT_VERSION) facts.push(`This BrainDog says format ${String(own)} of itself.`);
  const behind = missing.length + newer.length + wrong;
  if (behind <= FORMAT_BEHIND_MOST) return reading('green', 0, `This BrainDog is in format ${FORMAT_VERSION} with all ${KERNEL_MIGRATION} updates in.`, facts);
  if (said.length === 0) said.push(`This BrainDog says format ${String(own)} of itself where this build reads format ${FORMAT_VERSION}.`);
  return reading('red', behind, said.join(' '), facts);
}

/* ── amounts-whole ─────────────────────────────────────────────────────── */

type Fault = 'fraction' | 'number' | 'currency';

/** What a fact says of each fault, after the bill and its list. */
const FAULT_SAID: Record<Fault, string> = { fraction: 'holds a fraction of its smallest unit', number: 'holds no number', currency: 'holds no currency' };

/**
 * Why one stored amount is not whole minor units with a currency, or `null` when it is. An empty field is fine. A bare
 * number, as an older import left one, has no currency, and a bare `12.5` is said as the fraction it also is.
 */
export function amountFault(v: unknown): Fault | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? 'currency' : 'fraction';
  if (typeof v !== 'object' || Array.isArray(v)) return 'currency';
  const { amount, currency } = v as { amount?: unknown; currency?: unknown };
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'number';
  if (!Number.isInteger(amount)) return 'fraction';
  return typeof currency === 'string' && isCurrencyCode(currency) ? null : 'currency';
}

function readAmounts(sql: Sql): SignReading {
  const holding = [...lists(sql).values()].filter((l) => l.money.length > 0);
  if (holding.length === 0) return reading('none', null, 'No list holds an amount yet.');
  let held = 0;
  const broken: { list: string; what: string | null; why: Fault }[] = [];
  for (const l of holding)
    /* A SIGN IS STORED AND SHARED, so it reads as nobody (`''`): a row its maker kept private is not counted or named. */
    for (const row of sql.all<{ fields: string }>(`SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL AND ${unprivate()}`, l.id, '')) {
      const fields = parsed(row.fields) ?? {};
      for (const f of l.money) {
        const v = fields[f];
        if (v === undefined || v === null || v === '') continue;
        held++;
        const why = amountFault(v);
        const t = l.title === null ? null : fields[l.title];
        if (why !== null) broken.push({ list: l.name, what: typeof t === 'string' && t.trim() !== '' ? t.trim().slice(0, 60) : null, why });
      }
    }
  if (held === 0) return reading('none', null, 'No amount is kept yet.');
  const facts = [`${count(held, 'amount')} held, ${broken.length} not whole or without a currency.`];
  if (broken.length <= AMOUNTS_BROKEN_MOST) return reading('green', 0, 'Every amount is whole, with its currency.', facts);
  facts.push(...broken.map((b) => `${b.what ?? 'One amount'} in ${b.list} ${FAULT_SAID[b.why]}.`));
  const at = tally(broken.map((b) => b.list)).map(([name]) => name);
  return reading('red', broken.length, `${count(broken.length, 'amount')} ${broken.length === 1 ? 'is' : 'are'} not whole or ${broken.length === 1 ? 'has' : 'have'} no currency, in ${names(at)}.`, facts);
}

/* ── rate-age ──────────────────────────────────────────────────────────── */

/** A stored day as a person reads it: `6 October`, with the year when it is not `today`'s. */
function daySaid(day: string, today: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC', day: 'numeric', month: 'long', ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) };
  return new Intl.DateTimeFormat('en-GB', opts).format(Date.parse(`${day}T00:00:00Z`));
}

/** The last day a stored day can be: asked for the newest rate "on" it, `newestRate` answers the newest dated at all. */
const DAY_LAST = '9999-12-31';

/** Whole days from `today` to a later stored day. */
const daysAhead = (today: string, day: string): number => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** The names of the lists that match a move between two currencies (`pairs.across_currency`). */
function crossing(sql: Sql): string[] {
  const out: string[] = [];
  for (const d of sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 ORDER BY id")) {
    const body = parsed(d.body);
    const pairs = body?.pairs;
    if (pairs === null || typeof pairs !== 'object' || (pairs as { across_currency?: unknown }).across_currency === undefined) continue;
    out.push(typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : plain(d.id.slice('register.'.length)));
  }
  return out;
}

/**
 * NOTHING TO JUDGE BY WHERE NO LIST PAIRS ACROSS CURRENCIES, however old the rates: an old rate there stops nothing, and
 * a figure converted on one says so beside itself (`fx.ts`). And none again with no rate at all, in its own words,
 * since then nothing was ever matched and nothing stopped. THE DAY IS THE RECORD'S, as a pairing reads a leg's day.
 * A RATE DATED AHEAD IS HELD BUT NOT IN FORCE (`newestRate` leaves it out, as `rateAt` does): where those are all the
 * record holds, the sign says the day the newest is dated and how far off it is, never that the record holds none.
 */
function readRateAge(sql: Sql, nowMs: number, tz: string): SignReading {
  const at = crossing(sql);
  if (at.length === 0) return reading('none', null, 'No list matches a move between two currencies.');
  const facts = [`${names(at)} ${at.length === 1 ? 'matches' : 'match'} a move between two currencies.`];
  const today = dayIn(nowMs, tz);
  const newest = newestRate(sql, today);
  if (newest === null) {
    const ahead = newestRate(sql, DAY_LAST);
    if (ahead === null) return reading('none', null, 'No exchange rate is kept yet, so a move between two currencies is not matched by itself.', facts);
    return reading('none', null, `The newest rate is dated ${daySaid(ahead.as_of, today)}, in ${count(daysAhead(today, ahead.as_of), 'day')}, so none is in force yet and a move between two currencies is not matched by itself.`, facts);
  }
  const said = `The newest rate is from ${daySaid(newest.as_of, today)}, ${newest.days === 0 ? 'today' : `${count(newest.days, 'day')} old`}.`;
  if (newest.days <= RATE_DAYS_MOST) return reading('green', newest.days, said, facts);
  facts.push('Until a newer rate arrives, both sides of such a move stay counted as money out and money in.');
  return reading('red', newest.days, `${said} A move between two currencies is matched by itself only on a rate at most ${count(RATE_DAYS_MOST, 'day')} old. ${ratesFeedSaid(ratesFeed(sql), (at) => daySaid(dayIn(Date.parse(at), tz), today))}`, facts);
}

/* ── the list ──────────────────────────────────────────────────────────── */

const kernel = (sign: string, name: string, thresholds: Record<string, number>, read: NonNullable<SignReader['read']>): SignReader => ({ sign, name, hand: 'kernel', version: 1, thresholds, read });

/**
 * THE THREE, in SHL-A06's order, then `rate-age`. `signs.ts` joins them to `VITAL_SIGNS` with `...SIGNS_VITALS`. The
 * ids are kebab case, as PRF-A01's are; a person reads the names.
 */
export const SIGNS_VITALS: readonly SignReader[] = [
  kernel('writes-authored', 'Every write has an author', { AUTHORED_WINDOW_HOURS, UNAUTHORED_MOST }, (sql, nowMs, _tz, lasts) => readAuthored(sql, nowMs, lasts)),
  /* READ WITHOUT THE CLOCK, or by the record's day alone (a rate's age): each stands until something it read is written
     (`SignLasts`), and the kernel reads them again on a new day. */
  kernel('format-current', 'This BrainDog is in the current format', { FORMAT_BEHIND_MOST }, (sql, _nowMs, _tz, lasts) => (lasts?.(Infinity), readFormat(sql))),
  kernel('amounts-whole', 'Every amount is whole', { AMOUNTS_BROKEN_MOST }, (sql, _nowMs, _tz, lasts) => (lasts?.(Infinity), readAmounts(sql))),
  kernel('rate-age', 'Rates are fresh enough to match transfers', { RATE_DAYS_MOST }, (sql, nowMs, tz, lasts) => (lasts?.(Infinity), readRateAge(sql, nowMs, tz))),
];
