/**
 * What stopped on this record, asked of the record: `exceptions` (READ+), ENG-B13 job 2.
 *
 * BEFORE THIS A THING THAT WENT QUIET WAS SAID ONLY ON ITS OWN PAGE. The numbers stopped arriving, a rate was a
 * fortnight old, and each was a sentence somebody had to open the right page to meet. The kernel now reads all of it in
 * one place (`openExceptions`, `kernel/src/exceptions.ts`): a list that took something most days and then took nothing,
 * a way in that went quiet, a feed whose time passed with no run, and anything older than the window its page declares.
 * This is the door to that reading for an agent and for the app.
 *
 * IN NAMES, AND NEVER A QUESTION. Each is answered as what a person calls it, one sentence, and the day it stopped as a
 * day is said, with no id and no raw time in any of the three. What it opens is handed beside its name, as every handle
 * is. Nothing is written and nothing is asked: an exception is computed at the read, it is in no table, and it is gone
 * from the next answer when the thing arrives again. It is a candidate for the briefing and never something on Decide.
 *
 * WHAT A CALLER MAY NOT READ IS NOT THERE FOR THEM. Only the lists the caller reads whole are handed to the kernel, so a
 * list closed to a member, or one her grant narrows to some of it, is never said to have stopped. The ways in and the
 * feeds are the whole record's, so only somebody who reads every list is told about them.
 *
 * NO LIST IS NAMED HERE. Which lists are watched is every list the record has, and a window is the one a page's own
 * block declares with `stale`, so what counts as out of date is the add-on's to say.
 *
 * READ THROUGH A LOCAL SHAPE, as `faults.ts` reads its verbs: a record whose kernel has not got `openExceptions` yet
 * answers `NOT_IN_THIS_BUILD`, so this file can land beside the kernel's half in either order.
 */

import type { Result, Sql } from '@braindog/ports';
import * as kernelModule from '@braindog/kernel';
import { dayIn, spoken } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** A list handed to the kernel to watch (`Watched` in `kernel/src/exceptions.ts`). */
type Watched = { id: string; name: string; stale?: { field: string; after: string } };

/** One exception as the kernel reads it (`Exception` in `kernel/src/exceptions.ts`). */
type KernelException = {
  kind: 'list' | 'door' | 'schedule' | 'stale';
  subject: string;
  name: string | null;
  since: string;
  was: { days: number; of: number } | { everyMs: number } | { afterMs: number };
  cause: string;
  row: string | null;
};

/** The kernel's reader, absent on a kernel built before it. */
type Reader = { openExceptions?: (sql: Sql, nowMs: number, lists: readonly Watched[]) => KernelException[] };

/** What an exception opens: its name as the list titles it, and the handle a tool takes beside it. */
export type ExceptionRow = { name: string; id: string };

/**
 * One exception as a person reads it: what stopped by its name, one sentence about it, and the day it stopped as a day
 * is said. `row` is what to open, `null` where there is nothing to open.
 */
export type ExceptionSeen = { kind: KernelException['kind']; subject: string; said: string; since: string; row: ExceptionRow | null };

/**
 * One exception as the briefing takes it: the same words, with the cause the kernel gives it (the same on every read
 * while it stays open, so one thing that stopped is one card). The cause is a handle and is never shown.
 */
export type ExceptionFound = ExceptionSeen & { cause: string };

/** How a block's `source` names a list: the list's declaration id. */
const LIST = 'register.';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** A count as it is said: a word up to twelve, digits past it. */
const count = (n: number): string => WORDS[n] ?? String(n);

/** `four days`, `one day`. */
const days = (n: number): string => `${count(n)} ${n === 1 ? 'day' : 'days'}`;

/** A stored day as a person reads it: `9 October`, with the year when it is not this one. The kernel's days are UTC. */
function daySaid(day: string, today: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC', day: 'numeric', month: 'long', ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) };
  return new Intl.DateTimeFormat('en-GB', opts).format(Date.parse(`${day}T00:00:00Z`));
}

/** How often a feed runs, as it is said: `every day`, `every six hours`, `every 30 minutes`. */
function every(ms: number): string {
  /* The three words each take an `s` for more than one, so the plural is made here and spelled nowhere. */
  const say = (n: number, one: string) => (n === 1 ? `every ${one}` : `every ${count(n)} ${one}s`);
  if (ms >= DAY_MS && ms % DAY_MS === 0) return say(ms / DAY_MS, 'day');
  if (ms >= HOUR_MS && ms % HOUR_MS === 0) return say(ms / HOUR_MS, 'hour');
  return say(Math.max(1, Math.round(ms / 60_000)), 'minute');
}

/** The lists a page's own blocks declare a window for, each once: the first window written for a list is the one read. */
function windows(declarations: readonly { kind: string; body: string }[]): Map<string, { field: string; after: string }> {
  const out = new Map<string, { field: string; after: string }>();
  const walk = (node: unknown, depth: number): void => {
    if (node === null || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const block = node as { source?: unknown; stale?: { field?: unknown; after?: unknown; figure?: unknown } | null };
    /* A BLOCK OVER A LIST NAMES IT AS `register.<list>`, the declaration's own id. Any other source is not a list's rows. */
    const over = typeof block.source === 'string' && block.source.startsWith(LIST) ? block.source.slice(LIST.length) : null;
    const s = block.stale;
    /* A WINDOW DATED BY A FIGURE IS NOT A DAY ON THE LIST: the card's day is the figure's, so nothing here can read it. */
    if (over !== null && s && typeof s.field === 'string' && typeof s.after === 'string' && s.figure === undefined && !out.has(over))
      out.set(over, { field: s.field, after: s.after });
    for (const child of Object.values(node)) walk(child, depth + 1);
  };
  for (const d of declarations) {
    if (d.kind !== 'page') continue;
    try {
      walk(JSON.parse(d.body), 0);
    } catch {
      /* A page that does not parse declares no window. */
    }
  }
  return out;
}

/**
 * What stopped on this record now that this caller may read, the longest quiet first, or `null` on a kernel built
 * before the reading. It guards nothing itself: the method below and the briefing both call it after their own guard.
 */
export function exceptionsFor(deps: RecordDeps, ctx: CallContext, nowMs: number): ExceptionFound[] | null {
  const { kernel, sql, readable } = deps;
  const reader = kernelModule as unknown as Reader;

  /** Whether the caller reads this list whole: it is open to them, and their grant does not narrow it to some of it. */
  /* AND NO FIELD OF IT HIDDEN: an exception is said by the row's title and day, either of which a share may hide. */
  const whole = (list: string): boolean => readable(ctx, list) === null && kernel.scope(ctx, list) === undefined && (ctx.hides?.[list]?.length ?? 0) === 0;

  /** What an exception opens, by the title its list gives it, or `null` when it is gone or has none. */
  const rowOf = (id: string | null): ExceptionRow | null => {
    if (id === null) return null;
    const entry = kernel.get(id);
    if (!entry || entry.deleted_at || typeof entry.seq !== 'number') return null;
    const title = entry.fields[kernel.register(entry.register)?.title ?? ''];
    return typeof title === 'string' && title.trim() !== '' ? { name: title.trim(), id: spoken(entry.register, entry.seq) } : null;
  };

  /** One exception in the words a person reads, or `null` when the record holds no name to say it by. */
  const seen = (e: KernelException, nowMs: number): ExceptionSeen | null => {
    /* THE RECORD'S DAY, IN ITS OWN ZONE (AH22). */
    const today = dayIn(nowMs, deps.kernel.identity()?.tz);
    const since = daySaid(e.since, today);
    const quiet = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${e.since}T00:00:00Z`)) / DAY_MS));
    const row = rowOf(e.row);
    if (e.kind === 'list' && 'days' in e.was && e.name !== null) {
      const before = `It had taken something on ${e.was.days} of the ${e.was.of} days up to then.`;
      return { kind: e.kind, subject: e.name, said: `Nothing new has reached ${e.name} for ${days(quiet)}. The last was on ${since}. ${before}`, since, row };
    }
    if (e.kind === 'door' && 'days' in e.was) {
      const subject = e.name ?? 'A way in with no name';
      return { kind: e.kind, subject, said: `Nothing has arrived through ${e.name ?? 'a way in with no name'} for ${days(quiet)}. The last came on ${since}.`, since, row: null };
    }
    if (e.kind === 'schedule' && 'everyMs' in e.was) {
      const subject = e.name ?? 'A feed with no name';
      return { kind: e.kind, subject, said: `${subject} runs ${every(e.was.everyMs)} and has not run since ${since}.`, since, row: null };
    }
    if (e.kind === 'stale' && 'afterMs' in e.was && e.name !== null && row !== null) {
      const allowed = days(Math.max(1, Math.round(e.was.afterMs / DAY_MS)));
      return { kind: e.kind, subject: row.name, said: `${row.name} in ${e.name} is dated ${since}, ${days(quiet)} ago. ${e.name} is kept no older than ${allowed}.`, since, row };
    }
    return null;
  };

  if (reader.openExceptions === undefined) return null;
  const declared = windows(kernel.declarations());
  const lists: Watched[] = [];
  for (const [id, decl] of kernel.registers()) {
    if (!whole(id)) continue;
    const stale = declared.get(id);
    lists.push({ id, name: decl.name, ...(stale ? { stale } : {}) });
  }
  /* THE WAYS IN AND THE FEEDS ARE THE WHOLE RECORD'S: what arrives through one lands on lists this caller may not read.
     `readsAcross` AND NOT `readsEveryList`, as the `exceptions` block asks it: an Admin is told a way in went quiet while
     the record keeps a personal list, whose own quiet is left out above with every list she cannot read. */
  const everything = (deps.readsAcross ?? deps.readsEveryList)?.(ctx) === true;
  const found: ExceptionFound[] = [];
  for (const e of reader.openExceptions(sql, nowMs, lists)) {
    if ((e.kind === 'door' || e.kind === 'schedule') && !everything) continue;
    const one = seen(e, nowMs);
    if (one !== null) found.push({ ...one, cause: e.cause });
  }
  return found;
}

export function methods(deps: RecordDeps) {
  const { scoped, no, clock } = deps;

  return {
    /**
     * `{}`: what stopped on this record now, the longest quiet first, each as `{ kind, subject, said, since, row }`.
     * Only what the caller may read. Nothing stopped is an empty answer. READ+, and it changes nothing.
     */
    async exceptions(_args: unknown, ctx: CallContext): Promise<Result<{ exceptions: ExceptionSeen[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const found = exceptionsFor(deps, ctx, clock.now());
      if (found === null) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot say what stopped yet. It arrives with the next update.');
      return { ok: true, value: { exceptions: found.map(({ cause: _cause, ...one }): ExceptionSeen => one) } };
    },
  };
}
