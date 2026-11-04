/**
 * What `/usage` says about its figures: the title row's sentence, the four meters as rings, and the line under each
 * chart, worked out from `UsageView` and nothing else.
 *
 * EVERY NUMBER HERE IS ONE THE LEDGER OR THE RECORD SENT. A chart with no data behind it is `null`, and the page draws
 * no tile for it; a sentence with nothing true to say is `null`, and the page says nothing.
 *
 * PURE, so `node --test` holds it without a component in sight.
 */

import { monthWords, shareSaid, words, type Allowed, type Group, type MeterKey, type UsageView } from '../../lib/record/actions.ts';

/** This screen's own words. The meters' names and sentences are `actions.ts`'s, which its tests pin. */
export const said = {
  allowance: "This month's allowance",
  allowanceIn: (month: string) => `${month}'s allowance`,
  /* OFF THE CLOUD THE TILE IS THE MONTH'S RUNS: a self-host has no allowance to be measured against. */
  monthTitle: (current: boolean, month: string) => (current ? "This month's runs" : `${monthWords(month)}'s runs`),
  /* THE ACTIONS IN NO PROJECT: "Everywhere" read as a project of that name. */
  noProject: 'Not in a project',
  weeks: words.overTime,
  days: 'Runs by day',
  byProject: words.byProject,
  projects: 'Projects',
  asks: 'Slash questions',
  /* THE ONE LIST OF WHAT RAN: the month's, or the slice's when a project is open. */
  ran: 'What ran',
  ranIn: (g: Pick<Group, 'key' | 'name'>) => (g.key === '' ? 'What ran in no project' : `What ran in ${g.name}`),
  runs: (n: number) => (n === 1 ? 'run' : 'runs'),
  runsSaid: (n: number) => (n === 1 ? '1 run' : `${n.toLocaleString('en-GB')} runs`),
  asksOf: (max: number) => `of ${max.toLocaleString('en-GB')} questions`,
  firedWeek: (n: number) => `Automations fired ${n === 1 ? 'once' : `${n.toLocaleString('en-GB')} times`} in the last 7 days.`,
  noActionRun: 'No scheduled runs this month',
  /* ONLY FROM A HOST TOO OLD TO SEND EACH RULE'S MONTH (AF9): there an inline rule's work is in no run counted here, and
     the rules listed below run on their own, so they are named by what a person sees them do. */
  rulesApart: 'Rules that do their work inside another change leave no run and are not counted here; Automations says how often each ran.',
} as const;

/** Where a meter reads as near its limit: the Directory's `NOTICE_AT`, as `actions.ts` holds it. */
const NEAR = 0.8;

/** The title row's sentence, and the phrase inside it that needs him, when one does. */
export type Sentence = { text: string; needs?: string };

const AND = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The sentence under the title, from the first record the person owns.
 *
 * RED ONLY WHEN ACTIONS ARE WAITING. A meter near its limit is said plainly, since nothing has stopped yet; once the
 * plan holds a run, the phrase saying until when is the one thing on the screen that needs him. A member is told why
 * there is no plan here, in the words the page always used.
 */
export function sentenceOf(view: UsageView): Sentence | null {
  if (!view.owner) return { text: view.from === 'events' ? words.notOwner : words.notOwnerNone };
  const month = monthWords(view.month);
  const r = view.records[0];
  if (r && r.meters.length > 0) {
    const top = r.meters.find((m) => m.binding);
    if (!top) return { text: view.current ? "Nothing has counted against this month's allowance yet." : `Nothing counted against ${month}'s allowance.` };
    const name = words.meterName[top.key];
    const share = shareSaid(top.share);
    if (!view.current) return { text: `In ${month} the busiest meter was ${lower(name)}, at ${lower(share)} of the allowance.` };
    const extraOn = r.extraUse?.on === true;
    if (r.waiting) {
      const needs = `actions wait until ${r.resets}`;
      if (extraOn) return { text: `Extra usage has reached its cap for the month; ${needs}.`, needs };
      return { text: `${name} is at ${lower(share)} of the month's allowance; ${needs}.`, needs };
    }
    /* WITH EXTRA USAGE ON THE ALLOWANCE IS NOT WHERE ACTIONS WAIT: past it they run on under the cap. */
    if (extraOn && top.share >= 1) return { text: `${name} is past the month's allowance, and extra usage carries on under its cap.` };
    if (extraOn && top.share >= NEAR) return { text: `${name} is at ${lower(share)} of the month's allowance; past it, extra usage carries on under its cap.` };
    if (top.share >= NEAR) return { text: `${name} is at ${lower(share)} of the month's allowance; at the limit, actions wait until ${r.resets}.` };
    /* NOT "EVERYTHING RAN" (live check, 1 Nov): it stood over runs that had failed. What the meters know is the allowance. */
    return { text: `Well within the month's allowance; the busiest meter is at ${lower(share)}.` };
  }
  /* A MONTH WITH NO RUNS SAYS SO IN THE HEAD TOO (money F14), by the month's name, over the empty tile that says what
     would be counted. */
  if (view.totals.runs === 0) {
    /* AND AUTOMATIONS THAT FIRED ARE SAID, since they ran: "Nothing has run in September" stood over a record whose rules
       had filed seventeen payments that morning. What is counted here is a scheduled action's runs. */
    const fired = view.fired ?? 0;
    if (fired > 0) return { text: `No scheduled action has run in ${month}. ${said.firedWeek(fired)}` };
    return { text: `Nothing has run in ${month}.` };
  }
  const runs = said.runsSaid(view.totals.runs);
  const limit = r ? ', with no monthly limit' : '';
  /* EVERY RULE'S WORK IS IN THESE RUNS where the record keeps each rule's month (AF9), as Automations counts it; only an
     older host's inline rules are left out, and then the sentence says so (finish F53). */
  const apart = view.current && view.acted === true ? ` ${said.rulesApart}` : '';
  return { text: view.current ? `${runs} this month${limit}.${apart}` : `${runs} in ${month}${limit}.` };
}

/**
 * THE MONTH AS A HOST WITH NO ALLOWANCE SHOWS IT: no meters, no plan and nothing waiting.
 *
 * A self-host's Directory keeps a ledger, and its record's plan is `hosted` unless `init` said otherwise, so `/usage`
 * drew "This month's allowance · Cloud" with 15,000 runs while Billing said there was nothing to bill. Only the Cloud
 * holds a record to an allowance (`hostedHere` in `settings/billing.ts`), so everywhere else the counts and charts are
 * drawn and the rings are not.
 */
export function offCloud(view: UsageView): UsageView {
  return { ...view, records: view.records.map((r) => ({ ...r, plan: null, planLine: null, allowance: null, waiting: false, meters: [], binding: null, extra: null, extraUse: null })) };
}

/** A group's name as the page says it: the actions in no project are "Not in a project". */
export const groupName = (g: Pick<Group, 'key' | 'name'>): string => (g.key === '' ? said.noProject : g.name);

/**
 * WHETHER THE MONTH'S RUNS ARE SPLIT BY PROJECT AT ALL: only when some ran in a project. A month where every run was in
 * none said "By project: Not in a project" over fourteen actions each ending "· Not in a project" (audit 2, B16).
 */
export const byProject = (groups: readonly Pick<Group, 'key' | 'totals'>[]): boolean => groups.some((g) => g.key !== '' && g.totals.runs > 0);

/** The project an action's line names after it: its project's name, and nothing for the actions in no project. */
export const placeOf = (g: Pick<Group, 'key' | 'name'>): string => (g.key === '' ? '' : g.name);

/**
 * The month before, where the record was alive in it: `null` for a month before the earliest record was made, and the
 * month as it was where the host does not say when that was.
 */
export function earlierOf(beside: { earlier: string | null }, view: { since?: string | null | undefined }): string | null {
  if (beside.earlier === null) return null;
  return view.since && beside.earlier < view.since ? null : beside.earlier;
}

/** One meter as a ring: its share, the tone that share means, the figure inside it, and its line and sentence. */
export type Ringed = { key: MeterKey; name: string; share: number; tone: 'ink' | 'warn' | 'danger'; figure: string; amount: string; line: string; said: string; binding: boolean };

/**
 * The four meters as rings. Ink while there is room, amber from 80%, which is a soft warning, and red only once a meter
 * is used up and actions wait (red is "needs you", amber is waiting and soft warnings).
 */
export function ringsOf(r: Allowed): Ringed[] {
  return r.meters.map((m) => ({
    key: m.key,
    name: words.meterName[m.key],
    /* "150 of 15,000": the meter's own line with its name taken off, since the ring's name is printed above it. */
    amount: m.line.startsWith(words.meterName[m.key]) ? m.line.slice(words.meterName[m.key].length).trim() : m.line,
    share: m.share,
    tone: m.share >= 1 ? 'danger' : m.share >= NEAR ? 'warn' : 'ink',
    figure: m.share > 0 && m.share < 0.01 ? '<1%' : `${Math.floor(m.share * 100)}%`,
    line: m.line,
    said: m.said,
    binding: m.binding,
  }));
}

/** The week bars: the latest week in ink, the rest greys. */
export const weekBars = (view: UsageView): { label: string; value: number; tone?: 'ink' }[] =>
  view.weeks.map((w, i) => (i === view.weeks.length - 1 ? { label: w.label, value: w.runs, tone: 'ink' } : { label: w.label, value: w.runs }));

/** The line under the week bars: the month's runs and its busiest week. `null` with nothing run. */
export function weeksSaid(view: UsageView): string | null {
  if (view.totals.runs <= 0 || view.weeks.length === 0) return null;
  const busiest = view.weeks.reduce((a, b) => (b.runs > a.runs ? b : a));
  const runs = said.runsSaid(view.totals.runs);
  return view.weeks.length === 1 ? `${runs}, all in ${busiest.label}.` : `${runs}; the busiest week was ${busiest.label}.`;
}

/** The line under the projects: which project ran most of it, or which share the top. */
export function projectsSaid(groups: readonly Group[]): string | null {
  const ran = groups.filter((g) => g.totals.runs > 0).sort((a, b) => b.totals.runs - a.totals.runs);
  if (ran.length < 2) return null;
  const total = ran.reduce((n, g) => n + g.totals.runs, 0);
  const most = ran[0]!.totals.runs;
  const top = ran.filter((g) => g.totals.runs === most);
  const pct = `${Math.floor((most / total) * 100)}%`;
  if (top.length > 1) return `${AND.format(top.map(groupName))} ran ${pct} each.`;
  return `${groupName(top[0]!)} ran ${pct} of them.`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-08` as a row of the grid names it: `8 Sep`. */
const dateSaid = (day: string): string => `${Number(day.slice(8, 10))} ${SHORT[Number(day.slice(5, 7)) - 1] ?? ''}`;

/**
 * The month's runs as a heat grid: a row a calendar week, Monday first, a column a weekday.
 *
 * A DAY OUTSIDE THE MONTH, OR NOT YET HAPPENED, IS NO VALUE (`NaN`), which the grid draws as its track and reads aloud
 * as nothing. A day in range with no entry had nothing counted, which is zero. A row is named by its first day in the
 * month. `null` when no day ran, since an empty grid says nothing the sentence has not.
 */
export function heatOf(view: Pick<UsageView, 'month' | 'days' | 'current'>, through?: string): { rows: string[]; cols: string[]; values: number[][] } | null {
  if (!view.days.some((d) => d.runs > 0)) return null;
  const y = Number(view.month.slice(0, 4));
  const m = Number(view.month.slice(5, 7));
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = view.current && through?.slice(0, 7) === view.month ? Math.min(end, Number(through.slice(8, 10))) : end;
  const runs = new Map(view.days.map((d) => [d.day.slice(0, 10), d.runs]));
  /* Monday is 0. The grid starts on the Monday of the week the 1st falls in. */
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const rows: string[] = [];
  const values: number[][] = [];
  for (let start = 1 - lead; start <= last; start += 7) {
    const row: number[] = [];
    for (let c = 0; c < 7; c++) {
      const d = start + c;
      const day = `${view.month}-${String(d).padStart(2, '0')}`;
      row.push(d < 1 || d > last ? Number.NaN : (runs.get(day) ?? 0));
    }
    rows.push(dateSaid(`${view.month}-${String(Math.max(1, start)).padStart(2, '0')}`));
    values.push(row);
  }
  return { rows, cols: WEEKDAYS, values };
}

/**
 * The line under the heat grid: the busiest day and its runs.
 *
 * BUSIEST ONLY WHEN ONE DAY LEADS: "Busiest on Tue 1 Sep, with 1 run" stood over three days of
 * one run each. Days that tie are named together, and a month whose every day ran alike says so.
 */
export function daysSaid(view: Pick<UsageView, 'days'>): string | null {
  const ran = view.days.filter((d) => d.runs > 0);
  if (ran.length === 0) return null;
  const most = Math.max(...ran.map((d) => d.runs));
  const top = ran.filter((d) => d.runs === most);
  const named = (d: { day: string }): string => `${WEEKDAYS[(new Date(`${d.day.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7]} ${dateSaid(d.day)}`;
  if (top.length === 1) return `Busiest on ${named(top[0]!)}, with ${said.runsSaid(most)}.`;
  if (top.length === ran.length) return `${said.runsSaid(most)} on each of ${ran.length} days.`;
  return `Busiest on ${AND.format(top.map(named))}, with ${said.runsSaid(most)} each.`;
}

/**
 * Slash's asks as a ring: the month's asks against its allowance of them. `null` when the answer carries no allowance,
 * which is every host today: a ring with no end says nothing, so the page says the Slash line alone.
 */
export function asksOf(r: Allowed): { used: number; max: number; tone: 'ink' | 'warn' | 'danger' } | null {
  if (!r.asks || r.asks.cap === null || r.asks.cap <= 0) return null;
  const share = r.asks.asks / r.asks.cap;
  return { used: r.asks.asks, max: r.asks.cap, tone: share >= 1 ? 'danger' : share >= NEAR ? 'warn' : 'ink' };
}
