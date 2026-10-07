/**
 * The automations hub: one place for everything that runs by itself, as five tabs.
 *
 * FIVE KINDS OF THING RAN ON THEIR OWN AND EACH HAD ITS OWN CORNER. Automations were on `/automations`, scheduled
 * actions only under a project's "Runs on", scripts on `/scripts`, and doors inside Settings, Ingest, so "what does this
 * record do by itself" had four answers and nowhere that listed a run of each. The hub is the one address; each tab
 * draws its kind in the words that kind's own screen uses, and Runs lists every run newest first.
 *
 * THE TAB IS IN THE ADDRESS, as `?tab=`, and Runs has its own path because it is the one tab worth linking to by itself.
 * The new-action sheet opens from the address too, so a declared page links to a sheet already
 * filled in and the hub is the only reader of `?new=`.
 *
 * PURE, so it loads in plain Node: the clock is an argument and every import is a type but `since`, `humanize`,
 * `lasted` and the flow's own words. The chart inputs are here too: what the tiles above each
 * list draw, worked out from the reads the tabs already make, and never a number the record did not send.
 */

import { since } from 'braindog-render';

import { VERB_LABELS, words as flowWords } from '../../lib/flow/flow.ts';
import { lastSaid, lasted } from '../../lib/flow/source.ts';
import { humanize } from '../../lib/record/names.ts';

import type { AutomationRow, RunRow } from '../../lib/flow/source.ts';
import type { ActionRow, Channel } from '../../lib/record/actions.ts';
import type { Script } from '../../lib/record/scripts.ts';
import type { IconName } from '../../lib/ui/icons.ts';
import type { WeekDay } from '../../lib/viz/weekstrip.ts';

export type Tab = 'automations' | 'scheduled' | 'scripts' | 'doors' | 'runs';

/** The tabs in the order they are drawn, each with the address that opens it. */
export const TABS: readonly { id: Tab; path: string }[] = [
  { id: 'automations', path: '/automations' },
  { id: 'scheduled', path: '/automations?tab=scheduled' },
  { id: 'scripts', path: '/automations?tab=scripts' },
  { id: 'doors', path: '/automations?tab=doors' },
  { id: 'runs', path: '/automations/runs' },
];

/** What `?new=` asks for: the door sheet, or the scheduled-action sheet with a preset, or nothing. */
export type NewAsk = { kind: 'door' | 'action'; preset: string | null } | null;

export function newOf(params: URLSearchParams): NewAsk {
  const kind = params.get('new');
  /* A DOOR TAKES A PRESET TOO: the founder Home's "Send numbers from a project" links to `?new=door&preset=numbers`
     so the sheet opens already writing to `datapoints`, as a scheduled action's preset already does. */
  if (kind === 'door' || kind === 'action') return { kind, preset: params.get('preset') || null };
  return null;
}

/**
 * The tab the address names. A sheet asked for without a tab opens over the tab its kind lives on, so closing it leaves
 * the person looking at the list the new thing joins rather than at automations.
 */
export function tabOf(params: URLSearchParams): Exclude<Tab, 'runs'> {
  const tab = params.get('tab');
  if (tab === 'scheduled' || tab === 'scripts' || tab === 'doors') return tab;
  const ask = newOf(params);
  if (ask?.kind === 'door') return 'doors';
  if (ask?.kind === 'action') return 'scheduled';
  return 'automations';
}

/** The address with the sheet's two keys taken off, for closing it without leaving the tab it opened over. */
export function withoutNew(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete('new');
  params.delete('preset');
  const query = params.toString();
  return `/automations${query ? `?${query}` : ''}`;
}

export const hubWords = {
  tabs: 'Kinds of thing that run by themselves',
  tab: { automations: 'Automations', scheduled: 'Scheduled', scripts: 'Scripts', doors: 'Doors', runs: 'Runs' } as Record<Tab, string>,
  /* THE KIND A RUN BELONGS TO, said after its name on the Runs tab, where the three are mixed. */
  kind: { automation: 'Automation', scheduled: 'Scheduled action', script: 'Script' } as Record<RunKind, string>,
  newAction: 'New scheduled action',
  newScript: 'New script',
  /* AN EMPTY TAB SAYS WHAT THE THING IS AND WHAT TO ASK AN AGENT, as the automations list always has.
     The prompts are examples a person reads and replaces, not features the code ships. */
  scheduledNone: 'No scheduled actions yet',
  scheduledWhy: 'A scheduled action fetches from, calls or watches a web address on a clock, and files what it gets in your record.',
  scheduledPrompt: 'read my record, then propose a scheduled action that fetches a figure from api.example.com every hour and files it in my record',
  scheduledAbsent: 'This record does not list its scheduled actions yet',
  scheduledAbsentHow: 'Updating the host brings them. You can still make one here and send it to Decide.',
  scriptsPrompt: 'read my record, then write a script that runs every morning, reads my open tasks and writes a one-line summary to my notes, and propose it',
  scriptsMore: 'Logs, versions and what each script may read, write and fetch are on the scripts screen.',
  scriptsOpen: 'Open the scripts screen',
  runsNone: 'Nothing has run yet',
  runsWhy: 'Every run of an automation, a scheduled action or a script is listed here, newest first, with what it said.',
  runsPrompt: 'read my record, then propose an automation that runs every morning and tells me what changed yesterday',
  /* THE LIST IS WHAT EACH THING KEEPS TO HAND, and says so, so a quiet list is not read as a quiet record. */
  runsReach: 'The newest runs each automation and script keeps, and the last run of each scheduled action. Open one to see all of its runs.',
  runsSomeMissing: 'Some runs could not be read just now, so a few may be missing below.',
  /* ONE SENTENCE PER WAY A RUN ENDS, the time inside it, so a failed run and a finished one read alike but for the word. */
  ended: {
    done: (when: string) => `Ran ${when}.`,
    ok: (when: string) => `Ran ${when}.`,
    changed: (when: string) => `Ran ${when}, and something changed.`,
    unchanged: (when: string) => `Ran ${when}, and nothing had changed.`,
    failed: (when: string) => `Failed ${when}.`,
    refused: (when: string) => `Refused ${when}.`,
    cancelled: (when: string) => `Stopped ${when}.`,
    dropped: (when: string) => `Dropped ${when}.`,
    held: (when: string) => `Held ${when} by this month's limit.`,
    paused: (when: string) => `Paused ${when}.`,
    running: (when: string) => `Started ${when}, still running.`,
    waiting: (when: string) => `Started ${when}, waiting on a step.`,
    pending: (when: string) => `Queued ${when}.`,
  } as Record<string, (when: string) => string>,

  /* ── the groups the lists sit in on the ground ── */
  on: 'On',
  off: 'Off',
  paused: 'Paused',
  onClock: 'On a clock',
  scripts: 'Scripts',
  today: 'Today',
  yesterday: 'Yesterday',
  /* THE SWITCH AT THE END OF AN AUTOMATION'S ROW, named for a reader who cannot see which row it is on. */
  switchOf: (name: string) => `Run ${name}`,
  /* THE RIGHT-HAND COLUMN OF AN AUTOMATION'S ROW, when it has a next turn. */
  nextAt: (when: string) => `Next ${when}`,

  /* ── the tiles above the lists, each a chart and the one line saying what it means ────────────── */
  runsMonth: 'Runs this month',
  runsMonthSubject: 'Runs this month, by automation',
  runsMonthMeta: (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'run' : 'runs'}`,
  endedTitle: 'How runs ended',
  endedSubject: 'Runs this month that finished',
  endedOf: (n: number) => `of ${n.toLocaleString('en')}`,
  failedNote: (n: number) => `${n.toLocaleString('en')} failed`,
  nextUp: 'Next up',
  nextUpMeta: (days: number) => `Next ${days} days`,
  nextUpSubject: 'Scheduled actions due, by day',
  recentRuns: 'Recent runs',
  /* THE SOURCE IS EACH THING'S NEWEST RUNS, NOT EVERY RUN (`runs/+page.svelte`'s `DEEP` and `EACH`), so the tile says so. */
  latestRuns: 'Latest runs',
  heatSubject: (days: number) => `Runs a day, last ${days} days`,
} as const;

/* ── the leading mark of a row ──────────────────────────────────────────── */

/**
 * The icon in an automation's well, by what starts it: a clock, the inbox for an arrival, a press, Decide's own glyph
 * for a decision, and an eye for a figure that is watched.
 *
 * A CHANGE TO A LIST WEARS THAT LIST'S OWN GLYPH, the one the rail draws it with. Most automations start on a change,
 * so every one of them wore the same document and a page of eighteen had three icons between them: nothing to find
 * the money ones by. `listIcon` is the caller's, read off the lists the shell holds; without it, or for a list the
 * shell does not draw, it is the glyph of any list.
 */
const TRIGGER_ICONS: Record<string, IconName> = {
  every: 'clock',
  arrival: 'inbox',
  manual: 'play',
  decided: 'decide',
  written: 'rows',
  metric: 'observe',
};

export const triggerIcon = (kind: string, listIcon?: IconName | undefined): IconName =>
  kind === 'written' && listIcon !== undefined ? listIcon : Object.hasOwn(TRIGGER_ICONS, kind) ? TRIGGER_ICONS[kind]! : 'refresh';

/** A scheduled action's well, by the way it reaches out: fetching, calling, or watching. */
const CHANNEL_ICONS: Record<Channel, IconName> = { pull: 'download', call: 'globe', poll: 'observe' };

export const channelIcon = (channel: Channel): IconName => CHANNEL_ICONS[channel] ?? 'clock';

/** A run's well on the Runs tab, by the kind of thing that ran. */
const KIND_ICONS: Record<RunKind, IconName> = { automation: 'refresh', scheduled: 'clock', script: 'code' };

export const kindIcon = (kind: RunKind): IconName => KIND_ICONS[kind];

/* ── words ──────────────────────────────────────────────────────────────── */

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as a sentence starts with it: "Three", and figures from eleven up. */
export function spell(n: number, start = false): string {
  const said = Number.isInteger(n) && n >= 0 && n < SMALL.length ? SMALL[n]! : n.toLocaleString('en');
  return start ? said.charAt(0).toUpperCase() + said.slice(1) : said;
}

/** "once", "twice", "14 times". */
export const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n.toLocaleString('en')} times`);

/** "A", "A and B", "A, B and C". */
function andList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/* ── the hub's sentence ─────────────────────────────────────────────────── */

/** The sentence under the title, and the phrase inside it that needs him (drawn red), or `''` when nothing does. */
export type Sentence = { text: string; needs: string };

/**
 * What the automations on this record come to, in one line: how many run by themselves, and then what is wrong.
 *
 * WHAT IS FAILING NOW OUTRANKS WHAT FAILED THIS MONTH. An automation whose last run failed is named, because it is the
 * one to open; failing ones are only counted past two names. Otherwise the month's failed runs are counted, and a month
 * with none says so without red. A record whose host sends no month says nothing about it rather than "none failed".
 */
export function hubSentence(rows: readonly AutomationRow[]): Sentence | null {
  if (rows.length === 0) return null;
  const on = rows.filter((r) => r.enabled);
  const first =
    on.length === 0
      ? rows.length === 1
        ? 'The one automation here is turned off'
        : 'Every automation here is turned off'
      : `${spell(on.length, true)} ${on.length === 1 ? 'automation runs by itself' : 'automations run by themselves'}`;
  const failing = on.filter((r) => r.last?.state === 'failed').map((r) => r.name);
  const monthly = rows.filter((r) => r.month !== null);
  const failed = monthly.reduce((n, r) => n + (r.month?.failures ?? 0), 0);

  let needs = '';
  if (failing.length === 1) needs = `${failing[0]} is failing`;
  else if (failing.length === 2) needs = `${andList(failing)} are failing`;
  else if (failing.length > 2) needs = `${spell(failing.length)} are failing`;
  else if (failed > 0) needs = `${spell(failed)} ${failed === 1 ? 'run' : 'runs'} failed this month`;

  if (needs) return { text: `${first}, and ${needs}.`, needs };
  if (monthly.length > 0 && on.length > 0) return { text: `${first}, and none failed this month.`, needs: '' };
  return { text: `${first}.`, needs: '' };
}

/* ── an automation's row ────────────────────────────────────────────────── */

/**
 * An automation's second line: off, or how its last run went. Its next turn is the row's right-hand column
 * (`nextOf`), so it is not said twice the way `rowLine` says it for a list that has no column to put it in.
 */
export function lastLine(row: AutomationRow, now: number): string {
  return row.enabled ? lastSaid(row, now) : flowWords.off;
}

/** "Next in 2h", for a turned-on automation that has one. */
export const nextOf = (row: AutomationRow, now: number): string | undefined =>
  row.enabled && row.next ? hubWords.nextAt(since(row.next, now)) : undefined;

/* ── the Automations tab's tiles ────────────────────────────────────────── */

export type Bar = { label: string; value: number; tone?: string | undefined; note?: string | undefined };

/** The automations that ran this month, most runs first: the ones in the month's record, and only with a run. */
function ranThisMonth(rows: readonly AutomationRow[]): (AutomationRow & { month: { runs: number; failures: number } })[] {
  return rows
    .filter((r): r is AutomationRow & { month: { runs: number; failures: number } } => r.month !== null && r.month.runs > 0)
    .sort((a, b) => b.month.runs - a.month.runs || a.name.localeCompare(b.name));
}

/**
 * "Runs this month": a bar per automation, the busiest six. One is highlighted in ink, the
 * busiest, and any with a failure is red with the count at its end, because a failure is the part that needs him.
 */
export function monthBars(rows: readonly AutomationRow[], top = 6): Bar[] {
  return ranThisMonth(rows)
    .slice(0, top)
    .map((r, i) => ({
      label: r.name,
      value: r.month.runs,
      tone: r.month.failures > 0 ? 'danger' : i === 0 ? 'ink' : undefined,
      note: r.month.failures > 0 ? hubWords.failedNote(r.month.failures) : undefined,
    }));
}

/** The month's runs across every automation, and how many of them failed; `null` when none ran. */
export function endedSplit(rows: readonly AutomationRow[]): { runs: number; failed: number; ok: number } | null {
  const ran = ranThisMonth(rows);
  const runs = ran.reduce((n, r) => n + r.month.runs, 0);
  if (runs === 0) return null;
  const failed = Math.min(runs, ran.reduce((n, r) => n + r.month.failures, 0));
  return { runs, failed, ok: runs - failed };
}

/** The line under "Runs this month": the busiest, and the one that failed most. */
export function monthReading(rows: readonly AutomationRow[]): string {
  const ran = ranThisMonth(rows);
  const top = ran[0];
  if (!top) return '';
  const worst = [...ran].filter((r) => r.month.failures > 0).sort((a, b) => b.month.failures - a.month.failures || b.month.runs - a.month.runs)[0];
  const lead = `${top.name} ran ${times(top.month.runs)}, the most this month`;
  if (!worst) return `${lead}, and nothing failed.`;
  if (worst === top) return `${lead}, and ${spell(worst.month.failures)} of those failed.`;
  return `${lead}; ${worst.name} failed ${spell(worst.month.failures)} of ${worst.month.runs.toLocaleString('en')}.`;
}

/** The line under "How runs ended": the share that finished, and where the failures are. */
export function endedReading(rows: readonly AutomationRow[]): string {
  const split = endedSplit(rows);
  if (!split) return '';
  if (split.failed === 0) return `Every one of the ${split.runs.toLocaleString('en')} runs this month finished.`;
  /* NEVER 100% WITH A FAILURE IN IT. A share is rounded down while anything failed, so one failure in three hundred reads
     as 99% and not as the whole. */
  const share = Math.floor((split.ok / split.runs) * 100);
  const where = ranThisMonth(rows)
    .filter((r) => r.month.failures > 0)
    .sort((a, b) => b.month.failures - a.month.failures)
    .map((r) => r.name);
  const on = where.length <= 2 ? andList(where) : `${spell(where.length)} automations`;
  return `${share}% finished; the failures are on ${on}.`;
}

/* ── days ───────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** A moment's calendar day in this browser's time, `YYYY-MM-DD`. */
export function dayKey(at: number | string): string {
  const d = new Date(typeof at === 'string' ? Date.parse(at) : at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The `n` calendar days from the one `now` is in, forward (`n > 0`) or back to it (`n < 0`), as keys. */
function daysFrom(now: number, n: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let i = 0; i < Math.abs(n); i += 1) {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (n > 0 ? i : i - Math.abs(n) + 1), 12);
    out.push(dayKey(at.getTime()));
  }
  return out;
}

/* SPELLED HERE AND NOT BY `Intl`, whose English writes September "Sept" in one engine and "Sep" in the next; the week
   strip spells its days the same way (`lib/viz/weekstrip.ts`). */
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** A day's heading on the ground: Today, Yesterday, or "Mon 28 Sep". */
export function dayTitle(key: string, now: number): string {
  if (key === dayKey(now)) return hubWords.today;
  const [yesterday] = daysFrom(now - DAY_MS, 1);
  if (key === yesterday) return hubWords.yesterday;
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y!, m! - 1, d!, 12);
  return `${WEEKDAY[day.getDay()]} ${day.getDate()} ${MONTH[day.getMonth()]}`;
}

/** The time of day a run started, "08:05", the feed's right-hand column. */
export const clockOf = (at: string): string => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? CLOCK.format(new Date(t)) : '';
};

/* ── the Runs tab ───────────────────────────────────────────────────────── */

/** Runs grouped by the day they started, newest day first, each day's runs in the order they came. */
export function runDays(lines: readonly RunLine[], now: number): { key: string; title: string; lines: RunLine[] }[] {
  const out: { key: string; title: string; lines: RunLine[] }[] = [];
  for (const l of lines) {
    const key = Number.isFinite(Date.parse(l.at)) ? dayKey(l.at) : '';
    const last = out.at(-1);
    if (last && last.key === key) last.lines.push(l);
    else out.push({ key, title: key === '' ? hubWords.recentRuns : dayTitle(key, now), lines: [l] });
  }
  return out;
}

export type Heat = { rows: string[]; cols: string[]; values: number[][]; days: string[] };

/**
 * "Recent runs": runs a day over the last `days`, for the six things that ran most in them.
 * Columns are the days, oldest first, labelled by their date. `null` when nothing ran in the window.
 */
export function runHeat(lines: readonly RunLine[], now: number, days = 14): Heat | null {
  const keys = daysFrom(now, -days);
  const at = new Map(keys.map((k, i) => [k, i]));
  const by = new Map<string, { name: string; counts: number[]; total: number }>();
  for (const l of lines) {
    if (!Number.isFinite(Date.parse(l.at))) continue;
    const c = at.get(dayKey(l.at));
    if (c === undefined) continue;
    const id = `${l.kind}:${l.name}`;
    const one = by.get(id) ?? { name: l.name, counts: keys.map(() => 0), total: 0 };
    one.counts[c]! += 1;
    one.total += 1;
    by.set(id, one);
  }
  if (by.size === 0) return null;
  const top = [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 6);
  return { rows: top.map((t) => t.name), cols: keys.map((k) => String(Number(k.slice(8)))), values: top.map((t) => t.counts), days: keys };
}

/** The line under "Recent runs": what ran most in the window, and what failed in it. */
export function heatReading(lines: readonly RunLine[], heat: Heat): string {
  const top = heat.rows[0];
  const most = heat.values[0]?.reduce((a, b) => a + b, 0) ?? 0;
  if (top === undefined) return '';
  const inWindow = new Set(heat.days);
  const bad = lines.filter((l) => l.bad && Number.isFinite(Date.parse(l.at)) && inWindow.has(dayKey(l.at)));
  const lead = `${top} ran most, ${times(most)} in the last ${heat.days.length} days`;
  if (bad.length === 0) return `${lead}, and none of these runs failed.`;
  const names = [...new Set(bad.map((l) => l.name))];
  return `${lead}; ${spell(bad.length)} failed, on ${names.length <= 2 ? andList(names) : `${spell(names.length)} things`}.`;
}

/* ── the Scheduled tab ──────────────────────────────────────────────────── */

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS };

/** How far apart an action's turns are, from its `every` ("15m", "1d"), or `null` when it is not one of those. */
export function intervalOf(every: string): number | null {
  const m = /^(\d+)\s*(m|h|d|w)$/u.exec(every.trim());
  if (!m) return null;
  const ms = Number(m[1]) * UNIT_MS[m[2]!]!;
  return ms > 0 ? ms : null;
}

/**
 * "Next up": the next `days` days, a dot on each day a scheduled action is due.
 *
 * FROM ITS NEXT TURN, ON ITS OWN CLOCK. The read carries each action's next run and how often it runs, so its turns
 * after that are that clock's, one dot a day however many times it runs in it. A paused action has no turns, and one
 * whose `every` is not a span has only its next.
 */
export function nextWeek(actions: readonly ActionRow[], now: number, days = 14): { days: WeekDay[]; today: string; due: ActionRow[] } {
  const keys = daysFrom(now, days);
  const at = new Map(keys.map((k, i) => [k, i]));
  const out: WeekDay[] = keys.map((date) => ({ date, items: [] }));
  const end = new Date(now);
  const until = new Date(end.getFullYear(), end.getMonth(), end.getDate() + days).getTime();
  const due: ActionRow[] = [];
  for (const a of actions) {
    if (a.state === 'paused' || !a.next) continue;
    const first = Date.parse(a.next);
    if (!Number.isFinite(first)) continue;
    const step = intervalOf(a.every);
    const seen = new Set<number>();
    for (let t = first, n = 0; t < until && n < 2000; t = step === null ? Infinity : t + step, n += 1) {
      const i = at.get(dayKey(t));
      if (i === undefined || seen.has(i)) continue;
      seen.add(i);
      out[i]!.items = [...out[i]!.items, { colour: 'var(--ink2)', label: humanize(a.ingest) }];
    }
    if (seen.size > 0) due.push(a);
  }
  due.sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!));
  return { days: out, today: keys[0]!, due };
}

/** The line under "Next up": how many are due in the window, and which is next and when. */
export function nextReading(due: readonly ActionRow[], now: number, days = 14): string {
  const first = due[0];
  if (!first || !first.next) return '';
  const name = humanize(first.ingest);
  const when = since(first.next, now);
  if (due.length === 1) return `${name} is next, ${when}, and the only one due in the next ${days} days.`;
  return `${spell(due.length, true)} scheduled actions run in the next ${days} days; ${name} is next, ${when}.`;
}

/**
 * One row on any tab: a name and what it is on the first line, where it stands on the second.
 *
 * THE SECOND LINE IS NEVER CUT. It is the verdict ("Paused. The key is not in the vault.") and an ellipsis took exactly
 * the part that said what to do, so it wraps; the first line gives way instead, what-it-is before the name.
 */
export type HubRow = {
  key: string;
  name: string;
  what: string;
  said: string;
  /** The one state worth a dot: failed or refused, needing a look, or turned off. The sentence always says it too. */
  dot: 'bad' | 'warn' | 'off' | null;
  /** Where the row opens, or `null` for a row with no screen of its own. */
  path: string | null;
  /** A link under the row that does what its sentence asks, like adding a missing key. */
  fix?: { path: string; label: string } | undefined;
  /** The glyph in the row's 32px well: what starts it, how it reaches out, or what kind of thing ran. */
  icon?: IconName | undefined;
  /** The right-hand column: an automation's next turn, or the time a run started. */
  aside?: string | undefined;
  /** Whether the aside is a time in a feed, which is set in Geist Mono. */
  clock?: boolean | undefined;
  /** A switch at the row's end, for a thing the reader may turn on and off: how it stands, and what the switch is called. */
  toggle?: { on: boolean; label: string } | undefined;
};

export type RunKind = 'automation' | 'scheduled' | 'script';

/** One run on the Runs tab: whose it was, when, the sentence it ended with, and where its owner's screen is. */
export type RunLine = {
  key: string;
  kind: RunKind;
  name: string;
  at: string;
  said: string;
  /** Whether it failed or was refused, which is the only thing the row marks. */
  bad: boolean;
  /** The screen of the thing that ran, or `null` for a scheduled action, which has none of its own. */
  path: string | null;
};

const BAD = new Set(['failed', 'refused']);

/** A run's ending and its own sentence after it, when it said one. */
function saidOf(outcome: string, at: string, say: string | null, now: number): string {
  const when = since(at, now);
  const ended = Object.hasOwn(hubWords.ended, outcome) ? hubWords.ended[outcome] : undefined;
  const line = (ended ?? hubWords.ended.done!)(when);
  return say ? `${line} ${say}` : line;
}

/**
 * Every run the three reads reached, newest first.
 *
 * AN AUTOMATION'S RUNS COME FROM ITS OWN READ, since the list carries only its last, so `runs` is keyed by rule and a
 * rule the hub did not ask about is represented by its last run alone. A scheduled action's ledger keeps no run list,
 * so it is its last run. A script's are the newest its screen found in recent history.
 */
export function runLines(
  automations: readonly AutomationRow[],
  runs: ReadonlyMap<string, readonly RunRow[]>,
  actions: readonly ActionRow[],
  scripts: readonly Script[],
  now: number,
): RunLine[] {
  const out: RunLine[] = [];
  for (const a of automations) {
    const path = `/automations/${encodeURIComponent(a.id)}`;
    const own = runs.get(a.id);
    if (own && own.length > 0) {
      for (const r of own) {
        out.push({ key: `a:${r.id}`, kind: 'automation', name: a.name, at: r.started, said: saidOf(r.state, r.finished ?? r.started, r.say, now), bad: BAD.has(r.state), path });
      }
    } else if (a.last) {
      out.push({ key: `a:${a.id}:last`, kind: 'automation', name: a.name, at: a.last.at, said: saidOf(a.last.state, a.last.at, a.last.say, now), bad: BAD.has(a.last.state), path });
    }
  }
  for (const s of actions) {
    if (!s.last) continue;
    out.push({ key: `s:${s.ingest}`, kind: 'scheduled', name: humanize(s.ingest), at: s.last.at, said: saidOf(s.last.outcome, s.last.at, s.last.note || null, now), bad: BAD.has(s.last.outcome), path: null });
  }
  for (const s of scripts) {
    const path = `/scripts/${encodeURIComponent(s.script)}`;
    for (const r of s.recent) {
      out.push({ key: `c:${r.id}`, kind: 'script', name: s.title, at: r.at, said: saidOf(r.outcome, r.at, r.say || null, now), bad: BAD.has(r.outcome), path });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/* ── one automation's page ──────────────────────────────────────────────── */

export const canvasWords = {
  lastRuns: 'How the last runs went',
  lastRunsMeta: (n: number) => `Last ${n.toLocaleString('en')} ${n === 1 ? 'run' : 'runs'}`,
  runsSubject: 'The last runs, by how they ended',
  tookSubject: 'How long each finished run took, oldest first',
  written: 'As written',
  tryTile: 'Try it',
  tryParts: 'What each step would do',
  matchParts: 'What it would act on now',
  matching: 'Match',
  notMatching: 'Do not match',
  calls: 'What it reaches',
  changed: 'What changed',
  /* THE KEYS THE FOOTER'S UNDO AND REDO ARE ALSO PRESSED WITH, in `Kbd`'s spelling, printed on the buttons. */
  undoKey: '⌘Z',
  redoKey: '⌘⇧Z',
  ranState: {
    done: 'Done',
    failed: 'Failed',
    waiting: 'Waiting',
    running: 'Running',
    pending: 'Waiting to start',
    cancelled: 'Stopped',
  } as Record<string, string>,
} as const;

/**
 * The icon and the tone of a run's well, by how it stands. A finished run is the ordinary case and takes no colour, so
 * a list of twenty is quiet; a failed one is red, one going now is `live`, and one parked on a step amber.
 */
export function runMark(state: string): { icon: IconName; tone?: 'danger' | 'live' | 'warn' | undefined } {
  switch (state) {
    case 'done':
      return { icon: 'check' };
    case 'failed':
      return { icon: 'alert', tone: 'danger' };
    case 'running':
    case 'pending':
      return { icon: 'play', tone: 'live' };
    case 'waiting':
      return { icon: 'clock', tone: 'warn' };
    default:
      return { icon: 'stop' };
  }
}

/**
 * "How the last runs went": the runs on the page by how they ended, in the order a person reads a result (done,
 * failed, still going, stopped), each in its meaning's colour, and only the endings they had.
 */
export function runParts(runs: readonly RunRow[]): { label: string; value: number; tone: string }[] {
  const count = (states: readonly string[]) => runs.filter((r) => states.includes(r.state)).length;
  return [
    { label: canvasWords.ranState.done!, value: count(['done']), tone: 'earn' },
    { label: canvasWords.ranState.failed!, value: count(['failed']), tone: 'danger' },
    { label: canvasWords.ranState.running!, value: count(['running', 'pending']), tone: 'live' },
    { label: canvasWords.ranState.waiting!, value: count(['waiting']), tone: 'warn' },
    { label: canvasWords.ranState.cancelled!, value: count(['cancelled']), tone: 'g3' },
  ].filter((p) => p.value > 0);
}

/** How long each finished run took, in seconds, oldest first: the sparkline beside the parts. */
export function runDurations(runs: readonly RunRow[]): number[] {
  const out: number[] = [];
  for (const r of runs) {
    if (r.finished === null) continue;
    const ms = Date.parse(r.finished) - Date.parse(r.started);
    if (Number.isFinite(ms) && ms >= 0) out.push(ms / 1000);
  }
  return out.reverse();
}

/**
 * The step a failed run stopped at, counted as a person reads the canvas: its place among the steps, a branch's arm
 * after the branch, and the runner's jump between the arms not counted (`planPlaces`).
 */
export function failedAt(run: RunRow, places: readonly string[] | null): { n: number; label: string } | null {
  const bad = run.steps.find((s) => s.state === 'failed');
  if (!bad) return null;
  const n = places ? places.slice(0, bad.n + 1).filter((p) => p !== '').length : bad.n + 1;
  const label = Object.hasOwn(VERB_LABELS, bad.kind) ? VERB_LABELS[bad.kind as keyof typeof VERB_LABELS] : bad.kind;
  return { n: Math.max(1, n), label };
}

/**
 * The line under "How the last runs went", built from the newest run: "The last run failed 2h
 * ago, at step 3: Call a service." Then, when the newest did not fail and an older one did, how many of these failed.
 */
export function lastRunReading(runs: readonly RunRow[], places: readonly string[] | null, now: number): string {
  const last = runs[0];
  if (!last) return '';
  const when = since(last.started, now);
  let lead: string;
  if (last.state === 'failed') {
    const at = failedAt(last, places);
    lead = at ? `The last run failed ${when}, at step ${at.n}: ${at.label}.` : `The last run failed ${when}.`;
  } else if (last.state === 'done') {
    const took = last.finished === null ? null : Date.parse(last.finished) - Date.parse(last.started);
    lead = took !== null && Number.isFinite(took) && took >= 0 ? `The last run finished ${when}, in ${lasted(took)}.` : `The last run finished ${when}.`;
  } else if (last.state === 'running') lead = `A run is going now; it started ${when}.`;
  else if (last.state === 'pending') lead = `A run is waiting to start; it was asked for ${when}.`;
  else if (last.state === 'waiting') lead = `The last run is waiting on a step; it started ${when}.`;
  else lead = `The last run was stopped; it started ${when}.`;
  const failed = runs.filter((r) => r.state === 'failed').length;
  if (last.state === 'failed' || failed === 0 || runs.length < 2) return lead;
  return `${lead} ${spell(failed, true)} of the last ${runs.length.toLocaleString('en')} failed.`;
}

/**
 * The page's sentence under its title: its last run and its next, and the failed clause as the phrase that needs him.
 * `null` for a draft that was never saved, which has nothing to report.
 */
export function pageSentence(row: AutomationRow | null, now: number): Sentence | null {
  if (!row) return null;
  if (!row.enabled) return { text: flowWords.off, needs: '' };
  const next = row.next ? flowWords.nextRun(since(row.next, now)) : '';
  if (!row.last) {
    const text = [lastSaid(row, now), next].filter(Boolean).join(' ');
    return text === '' ? null : { text, needs: '' };
  }
  const state = flowWords.runState[row.last.state] ?? row.last.state;
  const last = flowWords.lastRun(since(row.last.at, now), state);
  const why = row.last.state === 'failed' && row.last.say ? ` ${row.last.say}` : '';
  const text = [last + why, next].filter(Boolean).join(' ');
  return { text, needs: row.last.state === 'failed' ? last : '' };
}
