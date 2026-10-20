/**
 * WHAT A SESSION IS GIVEN, CAPPED AND THIS PROJECT FIRST (AGT-B09). Pure: `context` hands in what it read and gets back
 * what it sends, so the caps, the order and the counts are one set of rules a test can hold without a record.
 *
 * ON HIS RECORD THE ANSWER CAME TO 16.6 KB, three quarters of it keys and skills that apply everywhere, twenty and twenty
 * of every list with a scope field. The brief answer now holds five rows a list, this project's first, then the ones that
 * apply everywhere, most recently used first, with how many there are here and everywhere, how many more, and the one
 * call that lists the rest. `format: 'full'` keeps twenty and twenty, as before.
 *
 * The open questions lead with this project's and say how many are here. The last three decided for this project are
 * lines a person reads ("Decided 2 Oct: <the choice>"). Up to three learnings of kind `rule` go to the card, this
 * project's first, read from every learning and not only the five shown, so an old rule is never cut by new lessons.
 */

import { WAITS, waitOf, waitRank, type Wait } from '@braindog/kernel';

import { oneLine, words } from './card.ts';

/** The rows of one list the brief answer holds, this project's and everywhere's together. */
export const BRIEF_ROWS = 5;
/** The rows the full answer holds from this project, and again from everywhere, as `context` always did. */
export const FULL_ROWS = 20;
/** The decisions made for this project the answer names, newest first. */
export const DECIDED = 3;
/** The rules the card is handed. */
export const RULES = 3;
/** The people linked to the project the brief answer names. */
export const PEOPLE = 5;
/** The kind of learning that is a standing rule, by its value in the agents add-on. */
export const RULE = 'rule';

/** How much `context` answers: the brief card a session starts from, or every row it used to send. */
export type CapFormat = 'brief' | 'full';

/** A list's rows as the brief answer holds them, with the counts and the call that lists the rest. */
export type Capped<T> = {
  rows: T[];
  inherited: T[];
  /** Rows of this list that are this project's, and that apply everywhere, in all. */
  here: number;
  everywhere: number;
  /** How many are left out of this answer. */
  more: number;
  /** The one call that lists them, or `null` when nothing is left out. */
  rest: string | null;
  truncated: boolean;
};

export type CapOptions<T> = {
  /** The list's id, for the call that lists the rest. */
  register: string;
  format?: CapFormat | undefined;
  /**
   * When a row was last used, as every time the record has for it: a key opened, a skill read, a tool seen, a learning
   * confirmed, a task changed. The newest counts. A row with none keeps its place behind the used ones.
   */
  used?: ((row: T) => readonly (string | null | undefined)[]) | undefined;
  /** The counts the store gave when the read stopped short of every row; the rows handed in otherwise. */
  counted?: { here?: number | undefined; everywhere?: number | undefined } | undefined;
};

/** The newest of the times handed in, or `''` when there is none, which sorts as never used. */
export function newest(times: readonly (string | null | undefined)[]): string {
  let out = '';
  for (const t of times) if (typeof t === 'string' && t > out) out = t;
  return out;
}

/** Rows most recently used first. A stable sort, so rows used alike keep the order the record sent them in. */
function byUse<T>(rows: readonly T[], used: CapOptions<T>['used']): T[] {
  if (used === undefined) return [...rows];
  return rows
    .map((row, i) => ({ row, i, at: newest(used(row)) }))
    .sort((a, z) => (a.at === z.at ? a.i - z.i : a.at > z.at ? -1 : 1))
    .map(({ row }) => row);
}

/** The call that lists every row of a list, which an agent makes when the five it was given are not the ones it needs. */
export const restCall = (register: string): string => `list({ register: ${JSON.stringify(register)} })`;

/**
 * One list's rows for `context`: at most five, this project's first and then those that apply everywhere, each most
 * recently used first; with `format: 'full'`, twenty of each. The counts are of every row handed in, or the store's
 * when it counted more.
 */
export function capRegister<T>(rows: readonly T[], inherited: readonly T[], opts: CapOptions<T>): Capped<T> {
  const here = Math.max(rows.length, opts.counted?.here ?? 0);
  const everywhere = Math.max(inherited.length, opts.counted?.everywhere ?? 0);
  const mine = byUse(rows, opts.used);
  const theirs = byUse(inherited, opts.used);
  const full = opts.format === 'full';
  const kept = full ? mine.slice(0, FULL_ROWS) : mine.slice(0, BRIEF_ROWS);
  const also = full ? theirs.slice(0, FULL_ROWS) : theirs.slice(0, BRIEF_ROWS - kept.length);
  const more = here + everywhere - kept.length - also.length;
  return { rows: kept, inherited: also, here, everywhere, more, rest: more > 0 ? restCall(opts.register) : null, truncated: more > 0 };
}

/* ── the questions, and what was decided ───────────────────────────────── */

/**
 * Where a question or a decision stands: the project the run that asked it was placed in, and the projects of the rows
 * it is about. Part C's project field on a question replaces both when it lands, and goes in `project`.
 */
export type Placed = { project?: string | null | undefined; projects?: readonly (string | null | undefined)[] | undefined };

/** Whether something placed is this project's: the run that asked it was here, or one of its rows is. */
export const isHere = (p: Placed, project: string | null): boolean => project !== null && (p.project === project || (p.projects ?? []).includes(project));

/**
 * What a question carries for its wait to be read (AGT-C08): the `waits` the record's read said (`listGovernance` with
 * `order: 'wait'`, which reads the rows too), or what `waitOf` reads of a question (`WaitingQuestion`) with the instant.
 */
export type Weighed = { waits?: string | undefined; body_kind?: unknown; body?: unknown; opened_at?: unknown };

/** A question's wait, as the record said it or as `waitOf` reads it at `nowMs`, or `null` when it carries neither. */
export function waitHeld(q: Weighed, nowMs?: number): Wait | null {
  if ((WAITS as readonly string[]).includes(q.waits ?? '')) return q.waits as Wait;
  if (nowMs === undefined || typeof q.body_kind !== 'string' || typeof q.opened_at !== 'string') return null;
  return waitOf({ body_kind: q.body_kind, body: q.body, opened_at: q.opened_at }, nowMs);
}

/**
 * Questions in the order waiting costs: what costs most to leave waiting first, by Decide's own rank (`waitRank`), ties
 * in the order handed in; a question with no weighing keeps its place after every weighed one.
 */
function byWait<T extends Weighed>(questions: readonly T[], nowMs?: number): T[] {
  const ranked = questions.map((q, at) => ({ q, at, wait: waitHeld(q, nowMs) }));
  const weighed = ranked.filter((r) => r.wait !== null).sort((a, b) => waitRank(a.wait!) - waitRank(b.wait!) || a.at - b.at);
  return [...weighed, ...ranked.filter((r) => r.wait === null)].map((r) => r.q);
}

/**
 * The open questions `context` sends: this project's first, each half in the order waiting costs (`byWait`), at most
 * `n`, and how many of all of them are this project's. Outside any project nothing is here. An agent reads its Waiting
 * slot from the top, so newest first handed it a question opened a minute ago while one moving money since yesterday
 * waited under it; by wait it picks up the one Decide shows first. Questions that carry no weighing keep the order
 * handed in (newest first).
 */
export function projectWaiting<T extends Placed & Weighed>(questions: readonly T[], project: string | null, n = 8, nowMs?: number): { waiting: T[]; here: number } {
  const mine = byWait(questions.filter((q) => isHere(q, project)), nowMs);
  const theirs = byWait(questions.filter((q) => !isHere(q, project)), nowMs);
  return { waiting: [...mine, ...theirs].slice(0, Math.max(0, n)), here: mine.length };
}

/** A question that was decided: what was chosen, and when. */
export type Decision = Placed & { choice: string; decided_at: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A day as the card says it, "2 Oct", in the zone the record keeps (UTC when it names none). */
export function dayOfDecision(at: string, zone = 'UTC'): string | null {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  let day: number;
  let month: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'numeric' }).formatToParts(ms);
    day = Number(parts.find((p) => p.type === 'day')?.value);
    month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
  } catch {
    const d = new Date(ms);
    [day, month] = [d.getUTCDate(), d.getUTCMonth()];
  }
  return MONTHS[month] === undefined || !Number.isInteger(day) ? null : `${String(day)} ${MONTHS[month]}`;
}

/** The most of a choice one line says. */
const CHOICE = 90;

/**
 * The last `n` questions decided for this project, newest first, each as "Decided 2 Oct: <the choice>". A choice with
 * no words, or a day that is no day, is left out rather than said half. Outside any project nothing is decided here.
 */
export function decidedHere(decisions: readonly Decision[], project: string | null, n = DECIDED, zone = 'UTC'): string[] {
  return decisions
    .filter((d) => isHere(d, project))
    .map((d, i) => ({ d, i, day: dayOfDecision(d.decided_at, zone), said: words(d.choice, CHOICE) }))
    .filter(({ day, said }) => day !== null && said !== '')
    .sort((a, z) => (a.d.decided_at === z.d.decided_at ? a.i - z.i : a.d.decided_at > z.d.decided_at ? -1 : 1))
    .slice(0, Math.max(0, n))
    .map(({ day, said }) => `Decided ${day!}: ${said}`);
}

/** How far back "decided lately" looks (plan §3.2, section 7). */
export const DECIDED_DAYS = 14;

/** A decision as the context plan reads it: its words, when, and whether it answered a question this run asked. */
export type Lately = { said: string; at: string; mine?: boolean | undefined };

/**
 * Decided lately: within `days` of `nowMs`, the answers to this run's own questions first, then the newest, at most `n`,
 * each as "21 Oct: <the choice>" with "(you asked)" on one this run asked. A day that is no day is left out.
 */
export function decidedLately(decisions: readonly Lately[], nowMs: number, n = DECIDED, zone = 'UTC', days = DECIDED_DAYS): string[] {
  const since = nowMs - days * 86_400_000;
  return decisions
    .map((d, i) => ({ d, i, ms: Date.parse(d.at), day: dayOfDecision(d.at, zone), said: words(d.said.replace(/^Decided [^:]*:\s*/u, ''), CHOICE) }))
    .filter(({ ms, day, said }) => Number.isFinite(ms) && ms >= since && day !== null && said !== '')
    .sort((a, z) => Number(z.d.mine === true) - Number(a.d.mine === true) || z.ms - a.ms || a.i - z.i)
    .slice(0, Math.max(0, n))
    .map(({ d, day, said }) => `${day!}: ${said}${d.mine === true ? ' (you asked)' : ''}`);
}

/* ── the lessons that held ─────────────────────────────────────────────── */

/** A lesson never confirmed and older than this is left out of `context` and suggested for retiring (plan §3.2, 8). */
export const UNCONFIRMED_DAYS = 60;
/** A lesson confirmed within this many days leads. */
export const CONFIRMED_DAYS = 30;

/**
 * A lesson as the plan ranks it: its handle, kind (`method`, `fact`, `rule`…), whether it is this project's, the day it
 * was made and the day it was last confirmed (`confirmed_on`), each ISO or a day.
 */
export type Lesson = { spoken: string; kind?: string | null | undefined; here?: boolean | undefined; made?: string | null | undefined; confirmed?: string | null | undefined };

/**
 * The lessons that held, in the order a session reads them: confirmed in the last thirty days first (newest confirmed
 * first), then this project's before everywhere's, a method before a fact, then the newest made. Rules are not lessons
 * here (they have their own section) and are left out. A lesson never confirmed and made more than sixty days ago is
 * left out too, and its handle returned in `retire`, for the caller to suggest with `propose`: the plan files nothing.
 */
export function lessonsHeld<T extends Lesson>(lessons: readonly T[], nowMs: number): { rows: T[]; retire: string[] } {
  const ms = (at: string | null | undefined): number => (typeof at === 'string' && at !== '' ? Date.parse(at.length === 10 ? `${at}T00:00:00Z` : at) : Number.NaN);
  const old = nowMs - UNCONFIRMED_DAYS * 86_400_000;
  const fresh = nowMs - CONFIRMED_DAYS * 86_400_000;
  const retire: string[] = [];
  const kept: { row: T; i: number; confirmed: number; made: number }[] = [];
  lessons.forEach((row, i) => {
    if (row.kind === RULE) return;
    const confirmed = ms(row.confirmed);
    const made = ms(row.made);
    if (!Number.isFinite(confirmed) && Number.isFinite(made) && made < old) {
      retire.push(row.spoken);
      return;
    }
    kept.push({ row, i, confirmed, made });
  });
  const recent = (k: { confirmed: number }): number => (Number.isFinite(k.confirmed) && k.confirmed >= fresh ? 0 : 1);
  const n = (x: number): number => (Number.isFinite(x) ? x : 0);
  kept.sort(
    (a, z) =>
      recent(a) - recent(z) ||
      (recent(a) === 0 ? n(z.confirmed) - n(a.confirmed) : 0) ||
      Number(z.row.here === true) - Number(a.row.here === true) ||
      Number(z.row.kind === 'method') - Number(a.row.kind === 'method') ||
      n(z.made) - n(a.made) ||
      a.i - z.i,
  );
  return { rows: kept.map((k) => k.row), retire };
}

/* ── the rules, and the people ─────────────────────────────────────────── */

/** A learning as the card reads it: its kind, whether it is this project's (`scope`), its state and the day it was made. */
export type Learning = { kind?: unknown; scope?: unknown; state?: unknown; created_at?: unknown };

/** The rules the card leads Learned with, and how many more there are. */
export type Rules<T> = { rows: T[]; more: number };

/**
 * Up to three standing learnings of kind `rule`, this project's first, then the newest made. Read from every learning
 * `context` read, before the five are cut, so a rule older than ten newer lessons still reaches the card. Outside any
 * project none is this project's.
 */
export function rulesOf<T extends Learning>(learnings: readonly T[], project: string | null, n = RULES): Rules<T> {
  const made = (row: T): string => (typeof row.created_at === 'string' ? row.created_at : '');
  const far = (row: T): number => (project !== null && row.scope === 'project' ? 0 : 1);
  const all = learnings
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.kind === RULE && (row.state === null || row.state === undefined || row.state === 'active'))
    .sort((a, z) => far(a.row) - far(z.row) || (made(a.row) === made(z.row) ? a.i - z.i : made(a.row) > made(z.row) ? -1 : 1))
    .map(({ row }) => row);
  const rows = all.slice(0, Math.max(0, n));
  return { rows, more: all.length - rows.length };
}

/** A person linked to the project, as the people part of `context` reads them. */
export type Linked = { in_touch?: string | null | undefined; self?: boolean | undefined };

/**
 * The five people last in touch who are linked here, latest first and the record's order among those on the same day or
 * none, and how many there are in all. The record's own person is never one of them, nor counted.
 */
export function peopleHere<T extends Linked>(people: readonly T[], n = PEOPLE, total?: number): { people: T[]; total: number } {
  const others = people
    .map((person, i) => ({ person, i }))
    .filter(({ person }) => person.self !== true)
    .sort((a, z) => (z.person.in_touch ?? '').localeCompare(a.person.in_touch ?? '') || a.i - z.i)
    .map(({ person }) => person);
  return { people: others.slice(0, Math.max(0, n)), total: Math.max(others.length, total ?? 0) };
}

/** A rule as the card says it: one line of its words, cut at sixty characters. */
export const ruleLine = (said: string): string => words(oneLine(said), 60);
