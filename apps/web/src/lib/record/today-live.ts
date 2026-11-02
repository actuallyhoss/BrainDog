/**
 * Today, read from the record: what needs you, who is working, what changed since you last looked, and money at a
 * glance. The screen every record opens on (`routes/+page.svelte`).
 *
 * THROUGH THE RECORD'S OWN READS AND NOTHING ELSE. `boot` says which lists the record holds, who is working and what is
 * new since the reader's mark; `previewPage` answers the queue of open questions ranked as every queue is, and the runs
 * with the project each is placed in; `list` answers the tasks and the bills; `metric` the cash. A read that is refused
 * leaves its section out rather than failing the screen, because a record without Money has no money to glance at and
 * a member who may not read Decide has no questions to be shown.
 *
 * A ROUTE-ONLY MODULE, like `news-live.ts`: the client carries the route table as a value. The fetch is handed in, so
 * a test drives every branch without a socket, and the parts that turn answers into rows are pure and exported.
 */

import { createClient, type Boot, type Cursor, type EventLine } from '@braindog/client';
import type { Json, QueueQuestion } from '@braindog/kernel';
import { presenceOf } from '@braindog/kernel/constants';
import { money } from 'braindog-render';

import type { Fetch } from './boot-live.ts';
import { unnamed } from './api.ts';
import { REGISTERS } from './held.ts';
import { moneyInText } from './money.ts';
import { TASKS } from '../work/list.ts';
import { singularOf } from '../voice.ts';
import { recordMidnight, recordToday } from './zone.ts';

/**
 * A task that needs you: past its day, handed back to be checked, due today, or marked urgent.
 *
 * THE LAST FOUR KEYS ARE ADDED, NEVER REQUIRED: the version a Done is written at, the state it is put back to, its
 * tier and its project's hue, so the row can say them and the screen can tick it where it is.
 */
export type TaskRow = {
  seq: number;
  what: string;
  due: string | null;
  project: string | null;
  why: 'late' | 'today' | 'urgent' | 'review';
  agent: string | null;
  version?: number | undefined;
  state?: string | null | undefined;
  priority?: string | null | undefined;
  hue?: number | null | undefined;
};

/** A task dated in the next two weeks, for the week strip and the days under it. */
export type DayRow = {
  seq: number;
  what: string;
  day: string;
  project: string | null;
  hue: number | null;
  agent: string | null;
  state: string | null;
  priority: string | null;
  version?: number | undefined;
};

/**
 * One run an agent had open today, as a span on the day: from when it opened to when it was last heard from, and
 * whether it is working now, by the kernel's one clock (`presenceOf`: active, and heard from inside its `WORKING_MS`).
 */
export type SessionRow = {
  seq: number | null;
  agent: string;
  doing: string;
  state: string;
  host: string | null;
  /** When the run opened, epoch ms, which may be before midnight. */
  opened: number;
  /** Where its span on the day starts and ends: from midnight at the earliest, to now while it works. */
  from: number;
  to: number;
  working: boolean;
};

/**
 * Cash ahead, as the record's own walk draws it on the Money page: the balance at the end of each of the next weeks,
 * the lowest it goes inside them and on which day, and the day it first goes under, when it does. Minor units.
 */
export type Forecast = {
  currency: string;
  /** Today's balance, then the lowest each of the next weeks reaches, oldest first. */
  values: number[];
  weeks: number;
  low: { value: number; day: string | null };
  /** The first day the walk goes under zero inside the weeks drawn, or `null`. */
  crossed: string | null;
};

/** A run an agent has open now: who, what it says it is doing, where, and when it was last heard from. */
export type RunRow = { seq: number | null; agent: string; doing: string; project: string | null; seen: string | null };

/** One kind of change since the reader's mark: how many, called what, and the activity filtered to it. */
export type SinceRow = { key: string; label: string; count: number; href: string };

/**
 * One figure of cash: a book's name, or `null` for the whole; the amount as a screen writes it, and (added) the
 * figure itself in minor units with its currency, which a chart is drawn from.
 */
export type CashLine = { label: string | null; amount: string; value?: number | undefined; currency?: string | undefined };

/** A bill or an invoice coming up, with its amount signed by which way the money goes. */
export type DueRow = { seq: number; what: string; amount: string | null; out: boolean; due: string | null; late: boolean };

/** One reminder line an automation put on Today. */
export type ReminderLine = { text: string; at: string };

/** The reminders as the record answers them, newest first; anything that is not a line is left out. */
export function remindersOf(raw: unknown): ReminderLine[] {
  const lines = typeof raw === 'object' && raw !== null ? (raw as { lines?: unknown }).lines : undefined;
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((l): ReminderLine[] => {
    const x = l as { text?: unknown; at?: unknown } | null;
    return x && typeof x.text === 'string' && x.text.trim() !== '' && typeof x.at === 'string' ? [{ text: x.text, at: x.at }] : [];
  });
}

export type Today = {
  now: number;
  /** `null` when the record holds no tasks list. */
  needs: TaskRow[] | null;
  /** At most three, ranked as every queue is, with their options. */
  questions: QueueQuestion[];
  /** How many questions are open in all. */
  open: number;
  runs: RunRow[];
  /**
   * What changed since the mark, and (added) how much of it agents and the reader did, and the time of the oldest
   * change held, `null` when the answer was capped and so does not reach back to the mark.
   */
  since: { rows: SinceRow[]; total: number; capped: boolean; byAgents?: number; byYou?: number; from?: string | null };
  /** What the read mark is moved to when the reader leaves: the newest line this screen held. */
  upTo: Cursor | null;
  /** `null` when the record holds no money. `forecast` is added, and `null` where the record draws no walk. */
  money: { cash: CashLine[]; books: CashLine[]; due: DueRow[]; forecast?: Forecast | null } | null;
  /** Added: tasks dated in the next fourteen days after today; `null` when the record holds no tasks list. */
  coming?: DayRow[] | null;
  /** Added: the runs heard from since the reader's midnight; `null` when the runs could not be read. */
  sessions?: SessionRow[] | null;
  /** Added: the machine every working run is on, when they are all on one. */
  host?: string | null;
  /** Added: the reader's midnight, epoch ms, which the day's spans are drawn from. */
  dayStart?: number;
  /** Added: the lines automations put on Today. Empty when there are none or the record cannot say. */
  reminders?: ReminderLine[];
  /** Added: a read of the tasks came back at its limit, so a task leaving lets in one this answer does not hold. */
  full?: boolean;
};

export type TodayRead = { ok: true; value: Today } | { ok: false; refusal: { code: string; fix: string } };

type Row = { id: string; seq: number | null; fields: Record<string, unknown>; version?: number; created_at?: string; updated_at?: string };
type Client = ReturnType<typeof createClient>;

/** How many open questions Today answers in place; the rest are a link to Decide. */
export const QUESTIONS_SHOWN = 3;

/* A SENTENCE `where` GOES OUT AS THE JSON TEXT OF THE SENTENCE (`carried` in `lib/data/record.ts` says why). */
const carried = (where: string): unknown => ({ toJSON: () => where });

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && typeof (v as Row).id === 'string';

/** The record's own day, `YYYY-MM-DD`, in its zone (`zone.ts`): a task due today is due on the day on its wall. */
export function dayOf(now: number): string {
  return recordToday(now);
}

/** An amount the record holds, `{ amount, currency }`, as a screen writes it. */
export function amountSaid(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return null;
  const { amount, currency } = v as { amount?: unknown; currency?: unknown };
  return typeof amount === 'number' && typeof currency === 'string' ? moneyInText(money(amount, currency)) : null;
}

/* ── what needs you ─────────────────────────────────────────────────────── */

/**
 * A ROW NOBODY NAMED, AS TODAY SAYS IT: "Untitled task", in the list's own singular as the record words it (a label
 * the voice gives the list is drawn over its declaration, `relabelAll`). It was `#12`, the row's number alone, which
 * is a handle and never a name a person reads. A list this build has not learnt says its id made
 * singular, as `unnamed` does.
 */
export function untitled(register: string): string {
  const one = REGISTERS[register]?.one?.trim() || singularOf(register.replace(/_/g, ' '));
  return `Untitled ${/^[A-Z][a-z]/u.test(one) ? one.charAt(0).toLowerCase() + one.slice(1) : one}`;
}

/**
 * The tasks that need you, late first, then today's, then the urgent ones with no day yet come, each once.
 *
 * `due` AND `urgent` ARE TWO READS, because a task is here for either reason and the record answers one predicate a
 * read. A task in both is drawn once, under the day, which is the more pressing of the two facts.
 */
export function tasksOf(
  due: readonly Row[],
  urgent: readonly Row[],
  today: string,
  projects: ReadonlyMap<string, string>,
  review: readonly Row[] = [],
  hues: ReadonlyMap<string, number> = new Map(),
): TaskRow[] {
  const seen = new Set<number>();
  const out: TaskRow[] = [];
  const add = (r: Row, why: TaskRow['why']) => {
    if (r.seq === null || seen.has(r.seq)) return;
    seen.add(r.seq);
    const by = text(r.fields.by).slice(0, 10) || null;
    const thing = text(r.fields.thing);
    out.push({
      seq: r.seq,
      what: text(r.fields.what).trim() || untitled(TASKS),
      due: by,
      project: projects.get(thing) ?? null,
      why,
      agent: text(r.fields.agent) || null,
      version: typeof r.version === 'number' ? r.version : undefined,
      state: text(r.fields.state) || null,
      priority: text(r.fields.priority) || null,
      hue: hues.get(thing) ?? null,
    });
  };
  for (const r of due) {
    const by = text(r.fields.by).slice(0, 10);
    if (by !== '') add(r, by < today ? 'late' : 'today');
  }
  /* HANDED BACK TO BE CHECKED: an agent finished its part and a person looks before it is done. After the late ones,
     because a check is a few minutes of his and it unblocks the agent. */
  for (const r of review) add(r, 'review');
  for (const r of urgent) add(r, 'urgent');
  const rank = { late: 0, review: 1, today: 2, urgent: 3 } as const;
  return out.sort((a, b) => rank[a.why] - rank[b.why] || (a.due ?? '').localeCompare(b.due ?? ''));
}

/**
 * The tasks dated after today and inside the next `days`, each once and not one already in what needs you, soonest
 * first. What the week strip and the days under it draw.
 */
export function comingOf(
  rows: readonly Row[],
  today: string,
  last: string,
  projects: ReadonlyMap<string, string>,
  hues: ReadonlyMap<string, number> = new Map(),
  shown: ReadonlySet<number> = new Set(),
): DayRow[] {
  const seen = new Set<number>(shown);
  const out: DayRow[] = [];
  for (const r of rows) {
    const day = text(r.fields.by).slice(0, 10);
    if (r.seq === null || seen.has(r.seq) || day === '' || day <= today || day > last) continue;
    seen.add(r.seq);
    const thing = text(r.fields.thing);
    out.push({
      seq: r.seq,
      what: text(r.fields.what).trim() || untitled(TASKS),
      day,
      project: projects.get(thing) ?? null,
      hue: hues.get(thing) ?? null,
      agent: text(r.fields.agent) || null,
      state: text(r.fields.state) || null,
      priority: text(r.fields.priority) || null,
      version: typeof r.version === 'number' ? r.version : undefined,
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.seq - b.seq);
}

/** A run's handle (`S66`) is a key, never a word: "Kiln run S66" reads "Kiln run". */
const unhandled = (said: string): string => said.replace(/\s*\bS[1-9][0-9]*\b/gu, '').trim();

/* ── the runs of the day ────────────────────────────────────────────────── */

/**
 * The runs heard from since `dayStart`, as spans: from when each opened (or midnight, for one opened before it) to
 * when it was last heard from, or to now while it works. A run with no time it can be placed at is left out.
 */
export function sessionsOf(rows: readonly Row[], dayStart: number, now: number): SessionRow[] {
  const out: SessionRow[] = [];
  for (const r of rows) {
    const seen = Date.parse(text(r.fields.last_seen) || text(r.updated_at));
    const opened = Date.parse(text(r.created_at));
    if (!Number.isFinite(seen) || seen < dayStart) continue;
    const state = text(r.fields.state) || 'active';
    /* THE KERNEL'S ONE CLOCK (`presence.ts`), never a sum of this file's own: the rail and the Agents headline count by
       it, so a run seen 16 minutes ago is quiet here as it is there. A run never heard from (`before`) is not working. */
    const working = presenceOf({ state, fields: r.fields as Record<string, Json> }, now) === 'working';
    const began = Number.isFinite(opened) ? Math.min(opened, seen) : seen;
    out.push({
      seq: r.seq,
      agent: text(r.fields.agent) || 'other',
      doing: unhandled(text(r.fields.doing)),
      state,
      host: text(r.fields.host) || null,
      opened: began,
      from: Math.max(dayStart, began),
      to: working ? now : seen,
      working,
    });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The machine every working run is on, when there are runs and they are all on one; otherwise `null`. */
export function hostOf(hosts: readonly (string | null | undefined)[]): string | null {
  const said = hosts.map((h) => (typeof h === 'string' ? h.trim() : ''));
  if (said.length === 0 || said.some((h) => h === '')) return null;
  return new Set(said).size === 1 ? said[0]! : null;
}

/* ── since you were last here ───────────────────────────────────────────── */

/* WHAT A CHANGE THAT IS NOT ABOUT A ROW IS CALLED, in the plural a count reads with. Kinds that say the same thing to a
   person share a line: a question asked and a question proposed are both a question somebody put to you. */
const KIND_WORDS: Record<string, string> = {
  decide: 'Decisions made',
  supersede: 'Decisions replaced',
  suggest: 'Questions asked',
  propose: 'Questions asked',
  resolve: 'Questions closed',
  install: 'Add-ons changed',
  uninstall: 'Add-ons changed',
  upgrade: 'Add-ons changed',
  retire: 'Add-ons changed',
  declare: 'Pages changed',
  arrive: 'Things that came in',
  match: 'Things that came in',
  extract: 'Things that came in',
  pull: 'Things that came in',
  'access.grant': 'Access changed',
  'access.revoke': 'Access changed',
  'share.open': 'Links shared',
  'share.close': 'Links shared',
  export: 'Backups',
  import: 'Imports',
};

/* AN AGENT'S RUN SAYS IT IS STILL THERE EVERY FEW MINUTES, and those lines are the machinery of Working now, not news. */
const QUIET = new Set(['session']);

const keyWords = (k: string): string => (k.startsWith('grant.') ? 'Keys used or changed' : (KIND_WORDS[k] ?? 'Other changes'));

/**
 * What changed since the reader's mark, counted by kind: a row's changes by the list it is on ("Tasks"), anything else
 * by what it was ("Decisions made"). Each count opens the activity filtered to it. Most first.
 */
export function sinceOf(events: readonly Pick<EventLine, 'kind' | 'register'>[], lists: ReadonlyMap<string, string>): SinceRow[] {
  const rows = new Map<string, SinceRow>();
  for (const e of events) {
    if (e.register !== null && QUIET.has(e.register)) continue;
    const onRow = e.register !== null;
    const label = onRow ? (lists.get(e.register!) ?? e.register!) : keyWords(e.kind);
    const key = onRow ? `list:${e.register}` : `kind:${label}`;
    const had = rows.get(key);
    if (had) had.count += 1;
    else
      rows.set(key, {
        key,
        label,
        count: 1,
        href: onRow ? `/audit?list=${encodeURIComponent(e.register!)}` : `/audit?kind=${encodeURIComponent(e.kind)}`,
      });
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * WHETHER A LINE WAS AN AGENT'S: signed by its run (`S42`), by its token's name (`agent:claude`), or by the bare name of
 * an agent the product knows. The same shapes `actor()` in `names.ts` reads as an agent.
 */
export const byAgent = (actor: string): boolean => /^S\d+$/u.test(actor) || /^agent:/u.test(actor) || /^(claude|codex|cursor)$/u.test(actor);

/**
 * Who made the changes since the mark: how many were agents' and how many the reader's own, over the same lines
 * `sinceOf` counts (an agent's heartbeat is not a change), and the time of the oldest of them.
 */
export function sinceWho(
  events: readonly Pick<EventLine, 'kind' | 'register' | 'actor' | 'ts'>[],
  me: string | null,
): { byAgents: number; byYou: number; from: string | null } {
  let byAgents = 0;
  let byYou = 0;
  let from: string | null = null;
  for (const e of events) {
    if (e.register !== null && QUIET.has(e.register)) continue;
    if (byAgent(e.actor)) byAgents += 1;
    else if (me !== null && me !== '' && e.actor === me) byYou += 1;
    if (typeof e.ts === 'string' && e.ts !== '' && (from === null || e.ts < from)) from = e.ts;
  }
  return { byAgents, byYou, from };
}

/* ── money ──────────────────────────────────────────────────────────────── */

type Walk = { from?: unknown; currency?: unknown; steps?: unknown; crossed?: unknown; horizon?: unknown; reach?: unknown };

/** How far a walk reached, which is past the length it opens on when the page offers longer ones. */
const lengthOf = (w: Walk): number => (typeof w.reach === 'number' ? w.reach : typeof w.horizon === 'number' ? w.horizon : 0);

type Step = { day: string; balance: number };

const stepsOf = (w: Walk): Step[] =>
  (Array.isArray(w.steps) ? w.steps : []).flatMap((s: unknown) => {
    const { day, balance } = (s ?? {}) as { day?: unknown; balance?: unknown };
    return typeof day === 'string' && typeof balance === 'number' ? [{ day: day.slice(0, 10), balance }] : [];
  });

/**
 * Cash ahead, today and then the lowest each of `weeks` weeks reaches, read off the record's own walk (a Money page block over
 * `forecast.runway`). A walk a currency is chosen by `currency` when the money is held in several. `null` when the
 * page holds no walk this can read.
 */
export function forecastOf(blocks: readonly unknown[], today: string, weeks = 13, currency: string | null = null): Forecast | null {
  const walks: Walk[] = [];
  for (const b of blocks) {
    if (typeof b !== 'object' || b === null) continue;
    const block = b as { source?: unknown; walk?: unknown; walks?: unknown; refusals?: unknown };
    if (block.source !== 'forecast.runway') continue;
    if (block.walk && typeof block.walk === 'object') walks.push(block.walk as Walk);
    if (Array.isArray(block.walks)) for (const w of block.walks) if (w && typeof w === 'object') walks.push(w as Walk);
  }
  /* THE LONGEST WALK OF THE CURRENCY ASKED FOR: the page draws a year and a month over the same legs, and the year
     reaches past the weeks drawn here. */
  const fit = walks
    .filter((w) => typeof w.from === 'number' && typeof w.currency === 'string' && (currency === null || w.currency === currency))
    .sort((a, b) => lengthOf(b) - lengthOf(a))[0];
  if (!fit) return null;
  const opening = fit.from as number;
  const steps = stepsOf(fit).sort((a, b) => a.day.localeCompare(b.day));
  const last = dayPlus(today, weeks * 7);
  /* THE LOWEST EACH WEEK REACHES, and not its balance on one day of it: a dip between two Mondays is the part of the
     picture that matters, and sampling a day a week drew straight over it. */
  const values = [opening];
  let carried = opening;
  let i = 0;
  while (i < steps.length && steps[i]!.day <= today) carried = steps[i++]!.balance;
  values[0] = carried;
  for (let k = 1; k <= weeks; k++) {
    const end = dayPlus(today, k * 7);
    let lowest = carried;
    while (i < steps.length && steps[i]!.day <= end) {
      carried = steps[i++]!.balance;
      lowest = Math.min(lowest, carried);
    }
    values.push(lowest);
  }
  /* THE LOWEST FROM WHERE THE LINE STARTS (polish5, 2 Nov): today after today's movements, as the line's first point and
     Cash ahead's Today say it, so an invoice walked in today never leaves a low under the line's start unsaid. */
  let low: Forecast['low'] = { value: values[0]!, day: null };
  let crossed: string | null = null;
  for (const s of steps) {
    if (s.day > last) break;
    if (s.day > today && s.balance < low.value) low = { value: s.balance, day: s.day };
    if (crossed === null && s.balance < 0) crossed = s.day;
  }
  return { currency: fit.currency as string, values, weeks, low, crossed };
}

/** `YYYY-MM-DD` plus `n` days, on the calendar and never on a clock. */
function dayPlus(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
}

type Reading = {
  value: number | null;
  unit: string | null;
  held?: number;
  rows?: number;
  parts?: { currency: string; amount: number }[];
  /** A part's `label` is the record's name for it where its key is a row's id, as each book is to Cash now by book. */
  groups?: { key: string; value: number | null; parts?: { currency: string; amount: number }[]; label?: unknown }[];
};

/**
 * One figure, or one line a currency when it is held in several that were not added up. EACH IS A HEADLINE, the figure
 * Today opens on, so it is said in whole units and the record's own sign (`money.ts` `symbolText`): "EGP 1,086,213".
 */
export function cashOf(r: Pick<Reading, 'value' | 'unit' | 'parts'>, label: string | null): CashLine[] {
  const said = (minor: number, currency: string) => moneyInText(money(minor, currency), undefined, 'headline');
  if (r.parts && r.parts.length > 0) return r.parts.map((p) => ({ label, amount: said(p.amount, p.currency), value: p.amount, currency: p.currency }));
  if (typeof r.value === 'number' && r.unit) return [{ label, amount: said(Math.round(r.value), r.unit), value: Math.round(r.value), currency: r.unit }];
  return [];
}

/* ── the read ───────────────────────────────────────────────────────────── */

async function rows(client: Client, register: string, where: string | null, order: { field: string; dir: 'asc' | 'desc' } | null, limit: number): Promise<Row[]> {
  const out = await client.list({ register, limit, ...(where ? { where: carried(where) } : {}), ...(order ? { order: [order] } : {}) });
  return out.ok ? (out.value.rows as unknown[]).filter(isRow) : [];
}

async function names(client: Client, register: string, field: string): Promise<Map<string, string>> {
  const got = await rows(client, register, null, null, 500);
  return new Map(got.map((r) => [r.id, text(r.fields[field])]));
}

/** The queue and the runs, drawn by the record as a page it holds nowhere: one read, ranked as every queue is. */
async function drawn(client: Client): Promise<{ questions: QueueQuestion[]; runs: RunRow[] }> {
  const body = {
    page: 'today',
    title: 'Today',
    blocks: [
      { kind: 'queue', heading: 'Needs you', source: 'governance.open', limit: QUESTIONS_SHOWN },
      {
        kind: 'table',
        heading: 'Working now',
        source: 'sessions.working',
        columns: [{ field: 'agent' }, { field: 'doing' }, { field: 'last_seen' }],
        limit: 8,
      },
    ],
  };
  const out = await client.call<{ blocks?: unknown }>('previewPage', { body });
  if (!out.ok) return { questions: [], runs: [] };
  const blocks = (Array.isArray(out.value.blocks) ? out.value.blocks : []) as { kind?: string; queue?: unknown; rows?: unknown; scopes?: unknown; refusals?: unknown[] }[];
  const queue = blocks.find((b) => b.kind === 'queue');
  const table = blocks.find((b) => b.kind === 'table');
  const questions = queue && Array.isArray(queue.queue) ? (queue.queue as QueueQuestion[]).filter((q) => Array.isArray(q.options)) : [];
  const scopes = table && Array.isArray(table.scopes) ? (table.scopes as (string | null)[]) : [];
  const runs = table && Array.isArray(table.rows)
    ? (table.rows as unknown[]).filter(isRow).map((r, i) => ({
        seq: r.seq,
        agent: text(r.fields.agent) || 'other',
        doing: unhandled(text(r.fields.doing)),
        project: scopes[i] ?? (text(r.fields.project) || null),
        seen: text(r.fields.last_seen) || null,
      }))
    : [];
  return { questions, runs };
}

/** The projects by id: their names, and the hue each was given, which is the colour a project is drawn in. */
async function thingsOf(client: Client): Promise<{ names: Map<string, string>; hues: Map<string, number> }> {
  const got = await rows(client, 'things', null, null, 500);
  const hues = new Map<string, number>();
  for (const r of got) if (typeof r.fields.hue === 'number' && Number.isFinite(r.fields.hue)) hues.set(r.id, r.fields.hue);
  return { names: new Map(got.map((r) => [r.id, text(r.fields.name)])), hues };
}

/** How far ahead the week strip and the days under it look. */
export const AHEAD_DAYS = 14;

async function tasksFor(client: Client, held: ReadonlySet<string>, today: string): Promise<{ tasks: TaskRow[]; coming: DayRow[]; full: boolean } | null> {
  if (!held.has(TASKS)) return null;
  const live = 'state is not done or dropped';
  /* FOUR READS, ONE PREDICATE EACH, because the record answers one a read: what is late or due today, what was handed
     back to be checked, what is urgent, and what falls due in the next two weeks. A read refused is left out. */
  const [due, urgent, review, ahead, things] = await Promise.all([
    rows(client, TASKS, `${live}, by before +1d`, { field: 'by', dir: 'asc' }, 25),
    rows(client, TASKS, `${live}, priority is urgent`, null, 15),
    rows(client, TASKS, 'state is review', null, 10).catch(() => []),
    rows(client, TASKS, `${live}, by after today, by before +${AHEAD_DAYS + 1}d`, { field: 'by', dir: 'asc' }, 60).catch(() => []),
    held.has('things') ? thingsOf(client).catch(() => ({ names: new Map<string, string>(), hues: new Map<string, number>() })) : Promise.resolve({ names: new Map<string, string>(), hues: new Map<string, number>() }),
  ]);
  const tasks = tasksOf(due, urgent, today, things.names, review, things.hues);
  const shown = new Set(tasks.map((t) => t.seq));
  /* AT ITS LIMIT, a read may hold more than it answered: the local copy then takes no task out in place (`local.ts`). */
  const full = due.length >= 25 || urgent.length >= 15 || review.length >= 10 || ahead.length >= 60;
  return { tasks, coming: comingOf(ahead, today, dayPlus(today, AHEAD_DAYS), things.names, things.hues, shown), full };
}

async function sessionsFor(client: Client, held: ReadonlySet<string>, dayStart: number, now: number): Promise<SessionRow[] | null> {
  if (!held.has('session')) return null;
  const out = await client.list({ register: 'session', limit: 40, order: [{ field: 'last_seen', dir: 'desc' }] });
  if (!out.ok) return null;
  return sessionsOf((out.value.rows as unknown[]).filter(isRow), dayStart, now);
}

/** How long a walk read is kept before Today asks the Money page again. */
const WALK_KEPT_MS = 5 * 60_000;
const walked = new Map<string, { at: number; blocks: readonly unknown[] }>();

/**
 * The Money page's blocks, where its cash walk is, read only where the record holds that page.
 *
 * KEPT FOR FIVE MINUTES A RECORD, because Today reads again on every version the record moves to, and an agent at work
 * moves it every few seconds: the whole Money page walked a year ahead on each of those is load for a picture of the
 * next thirteen weeks, which a few minutes do not change.
 */
async function walkFor(client: Client, key: string, b: Boot): Promise<readonly unknown[]> {
  if (!(b.pages ?? []).some((p) => p.slug === 'money')) return [];
  const kept = walked.get(key);
  if (kept && Date.now() - kept.at < WALK_KEPT_MS) return kept.blocks;
  const out = await client.page('money');
  if (!out.ok) return [];
  const answered = (out.value as { blocks?: unknown }).blocks;
  /* ONLY THE WALKS ARE KEPT: the rest of the page is not Today's to hold. */
  const blocks = (Array.isArray(answered) ? answered : []).filter((x: unknown) => typeof x === 'object' && x !== null && (x as { source?: unknown }).source === 'forecast.runway');
  walked.set(key, { at: Date.now(), blocks });
  return blocks;
}

/** The record's midnight before `now`, on its own clock (`zone.ts`). */
export function midnightOf(now: number): number {
  return recordMidnight(now);
}

async function moneyFor(client: Client, held: ReadonlySet<string>, books: number, today: string): Promise<Today['money']> {
  if (!held.has('accounts')) return null;
  const [now, byBook, bookNames, due] = await Promise.all([
    client.metric('cash-now'),
    books >= 2 ? client.metric('cash-by-book') : Promise.resolve(null),
    books >= 2 ? names(client, 'books', 'name') : Promise.resolve(new Map<string, string>()),
    held.has('obligations') ? rows(client, 'obligations', 'state is open or part', { field: 'due', dir: 'asc' }, 5) : Promise.resolve([]),
  ]);
  const cash = now.ok ? cashOf(now.value as Reading, null) : [];
  const groups = byBook?.ok ? ((byBook.value as Reading).groups ?? []) : [];
  /* EACH BOOK BY ITS NAME: the record's own `label` for the part, else the book's row read here, and never its id. A part
     is accounts that name a book, so one whose book has no name is an unnamed book, not money in none. */
  const bookLines = groups.flatMap((g) =>
    cashOf(
      { value: g.value, unit: byBook!.ok ? (byBook!.value as Reading).unit : null, parts: g.parts ?? [] },
      (typeof g.label === 'string' && g.label.trim()) || bookNames.get(g.key) || unnamed('books', g.key),
    ),
  );
  return {
    cash,
    books: bookLines,
    due: due.flatMap((r) =>
      r.seq === null
        ? []
        : [{ seq: r.seq, what: text(r.fields.what).trim() || untitled('obligations'), amount: amountSaid(r.fields.amount), out: r.fields.direction === 'owed_by_me', due: text(r.fields.due).slice(0, 10) || null, late: text(r.fields.due).slice(0, 10) !== '' && text(r.fields.due).slice(0, 10) < today }],
    ),
  };
}

/** Today, read whole. Only a refused `boot` refuses the screen; every other read leaves its section out. */
export async function readToday(base: string, io?: Fetch, at?: number): Promise<TodayRead> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const booted = await client.boot();
  if (!booted.ok) {
    const said = 'refusal' in booted ? booted.refusal : { code: 'VERSION_STALE', fix: 'Something changed while it was being read.' };
    return { ok: false, refusal: { code: said.code, fix: said.fix } };
  }
  const b: Boot = booted.value;
  /* THE RECORD'S CLOCK, as every other screen reads "today" and "late" against, unless a caller holds another. */
  const said = Date.parse(b.now);
  const now = at ?? (Number.isFinite(said) ? said : Date.now());
  const held = new Set(b.registers.map((r) => r.id));
  const lists = new Map(b.registers.map((r) => [r.id, r.name]));
  const books = b.registers.find((r) => r.id === 'books')?.count ?? 0;
  const today = dayOf(now);
  const dayStart = midnightOf(now);
  const [queue, work, cash, sessions, walks, reminded] = await Promise.all([
    drawn(client).catch(() => ({ questions: [], runs: [] })),
    tasksFor(client, held, today).catch(() => null),
    moneyFor(client, held, books, today).catch(() => null),
    sessionsFor(client, held, dayStart, now).catch(() => null),
    held.has('accounts') ? walkFor(client, base, b).catch(() => []) : Promise.resolve([]),
    /* A RECORD THAT CANNOT SAY, or a reader who may not, has no reminders: the tile is simply not drawn. */
    client.call<unknown>('todayReminders').then((out) => (out.ok ? remindersOf(out.value) : [])).catch(() => []),
  ]);
  /* THE WALK OF THE CURRENCY THE CASH FIGURE IS IN, so the line under the figure is about that figure. */
  const forecast = cash && cash.cash.length > 0 ? forecastOf(walks, today, 13, cash.cash[0]?.currency ?? null) : null;
  const events = b.whatsNew?.events ?? [];
  const since = sinceOf(events, lists);
  const capped = b.whatsNew?.sinceCapped ?? false;
  const who = sinceWho(events, b.me?.person ?? null);
  /* THE MACHINE THE RUNS ARE ON: the live runs `boot` sent say it, and failing those, the day's runs that still work. A
     run gone quiet (`quiet`, the record's 15 minutes) is not one of them, as a stale one is not. */
  const live = b.sessions ?? [];
  const host =
    live.length > 0
      ? hostOf(live.filter((r) => !r.stale && r.quiet !== true).map((r) => (typeof r.fields.host === 'string' ? r.fields.host : null)))
      : hostOf((sessions ?? []).filter((s) => s.working).map((s) => s.host));
  return {
    ok: true,
    value: {
      now,
      needs: work ? work.tasks : null,
      questions: queue.questions,
      open: b.counts?.decide ?? (b.waiting ?? []).length,
      runs: queue.runs,
      since: { rows: since, total: since.reduce((n, r) => n + r.count, 0), capped, byAgents: who.byAgents, byYou: who.byYou, from: capped ? null : who.from },
      upTo: b.whatsNew?.upTo ?? null,
      money: cash ? { ...cash, forecast } : cash,
      coming: work ? work.coming : null,
      sessions,
      host,
      dayStart,
      reminders: reminded,
      full: work ? work.full : false,
    },
  };
}
