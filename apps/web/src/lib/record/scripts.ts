/**
 * The scripts screen, `/scripts`: every installed script, where it stands, what it may touch, its versions and, for its
 * owner, what its runs logged (`loop/finish/shell.md` SCR-2, `loop/DIRECTION.md` §22).
 *
 * TWO EXISTING READS AND ONE WRITE, and nothing new on the record. `scripts` answers each script's state, last run,
 * refused-in-a-row count and reach; `recentHistory` carries each run's `pull` event, whose `to.log` is the script's own
 * log (`keepLog` in `kernel/src/script-run.ts`), and each install's `declare` event, which is what the version view is
 * drawn from; `resumeScript` starts a paused one again.
 *
 * THE LOG IS THE OWNER'S, AND THE RECORD DECIDES THAT. `logOf` in `record/src/index.ts` hands the log to an owner in a
 * browser who reads every list the run touched and `--redacted--` to everybody else, so this file never guesses who may
 * read it: a redacted log is read as no log, and the screen draws none.
 *
 * VERSIONS FROM THE HISTORY THE READ REACHED. No method answers a script's old versions, so a version is known from the
 * `declare` event that installed it and from the `@v<n>` its runs are signed with, over the last few pages of the log.
 * An older version whose events are past those pages is not drawn, which the section says in its own line.
 *
 * PURE, for the reason `actions.ts` gives: `node --test` cannot import a `.svelte.ts` file. The clock is an argument.
 */

import { createClient, type ClientOptions, type Cursor, type EventLine, type ScriptResumed, type ScriptRow } from '@braindog/client';
import { since } from 'braindog-render';

import { moneyInText } from './money.ts';
import { humanize, listName } from './names.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** What a client call answers, as `lib/data/read.ts` takes it. */
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string; detail?: string | undefined } } | { ok: false; conflict: unknown };

/** One run of a script, from its `pull` event. `log` is `null` when the record withheld it or the run logged nothing. */
export type Run = { id: string; at: string; version: number | null; outcome: string; say: string; log: string | null };

/** One version of a script: when it was installed, if the history reached that far, and how its runs went. */
export type Version = { version: number; at: string | null; note: string | null; current: boolean; runs: number; ok: number; refused: number };

/** A script as the screen draws it: the record's row, its newest runs and its versions, newest first. */
export type Script = ScriptRow & { recent: Run[]; versions: Version[]; logs: boolean };

/** How many lines of the log one page asks for: the record's largest page. */
const PAGE = 200;
/** How many pages the screen walks for runs and versions. Past them a record is busy enough that older runs are history. */
const PAGES = 3;
/** How many runs each script shows. */
const RECENT = 5;
/** What the record writes in place of a log it withholds (`logOf`). */
const REDACTED = '--redacted--';

const SCRIPT_TARGET = /^declaration:script\.(.+)$/u;
const SIGNED = /@v(\d+)$/u;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A version the record wrote as text or as a number, or `null` for anything else. */
function versionOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^[1-9]\d*$/u.test(v)) return Number.parseInt(v, 10);
  return null;
}

/**
 * The runs and installs the walked lines name, by script.
 *
 * A RUN IS A `pull` EVENT WITH AN OUTCOME. A resume and a pause are `pull` events on the same target with no outcome;
 * the state line already says whether the script is paused, so they are not drawn as runs.
 */
export function eventsOf(lines: readonly EventLine[]): Map<string, { runs: Run[]; installs: { version: number; at: string; note: string | null }[] }> {
  const by = new Map<string, { runs: Run[]; installs: { version: number; at: string; note: string | null }[] }>();
  for (const e of lines) {
    const id = e.target === null ? null : (SCRIPT_TARGET.exec(e.target)?.[1] ?? null);
    if (id === null) continue;
    let held = by.get(id);
    if (!held) {
      held = { runs: [], installs: [] };
      by.set(id, held);
    }
    if (e.kind === 'declare') {
      const version = versionOf(e.to);
      if (version !== null) held.installs.push({ version, at: e.ts, note: e.note === null || e.note === '' ? null : moneyInText(e.note) });
      continue;
    }
    if (e.kind !== 'pull' || !isObject(e.to) || typeof e.to.outcome !== 'string') continue;
    const signed = SIGNED.exec(e.actor)?.[1];
    const log = typeof e.to.log === 'string' && e.to.log !== REDACTED && e.to.log.trim() !== '' ? e.to.log : null;
    held.runs.push({
      id: e.id,
      at: e.ts,
      version: signed === undefined ? null : Number.parseInt(signed, 10),
      outcome: e.to.outcome,
      say: e.note === null ? '' : moneyInText(e.note),
      log,
    });
  }
  return by;
}

/**
 * A script's versions, newest first: the one installed now, every one the walked history installed, and every one a
 * walked run was signed with, each with the runs of it the walk found.
 */
export function versionsOf(row: Pick<ScriptRow, 'version'>, runs: readonly Run[], installs: readonly { version: number; at: string; note: string | null }[]): Version[] {
  const out = new Map<number, Version>();
  const at = (version: number): Version => {
    let v = out.get(version);
    if (!v) {
      v = { version, at: null, note: null, current: version === row.version, runs: 0, ok: 0, refused: 0 };
      out.set(version, v);
    }
    return v;
  };
  at(row.version);
  /* THE NEWEST INSTALL OF A VERSION WINS. Installs arrive newest first, so the first one seen is kept: the same version
     number is written once, and a second line for it is a replay of the same install. */
  for (const i of installs) {
    const v = at(i.version);
    if (v.at === null) {
      v.at = i.at;
      v.note = i.note;
    }
  }
  for (const r of runs) {
    if (r.version === null) continue;
    const v = at(r.version);
    if (r.outcome !== 'ok' && r.outcome !== 'refused') continue;
    v.runs += 1;
    v[r.outcome] += 1;
  }
  return [...out.values()].sort((a, b) => b.version - a.version);
}

/**
 * Every script the caller may read, with its newest runs and its versions.
 *
 * THE HISTORY IS EXTRA, AND ITS REFUSAL IS NOT THE SCREEN'S. `scripts` is the read the screen cannot draw without; a
 * refused or unreached `recentHistory` leaves every script without runs or versions past the one installed, and the
 * list still draws. A script list the caller may read and a log they may not are both ordinary.
 */
export async function readScripts(base: string, io?: Fetch): Promise<Answer<Script[]>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const listed = await client.scripts();
  if (!listed.ok) return listed;
  if (listed.value.length === 0) return { ok: true, value: [] };

  const lines: EventLine[] = [];
  let cursor: Cursor | null = null;
  for (let n = 0; n < PAGES; n += 1) {
    const page = await client.recentHistory({ limit: PAGE, ...(cursor === null ? {} : { cursor }) });
    if (!page.ok) break;
    lines.push(...page.value.events);
    cursor = page.value.cursor;
    if (cursor === null) break;
  }

  const found = eventsOf(lines);
  return {
    ok: true,
    value: listed.value.map((row): Script => {
      const held = found.get(row.script) ?? { runs: [], installs: [] };
      return { ...row, recent: held.runs.slice(0, RECENT), versions: versionsOf(row, held.runs, held.installs), logs: held.runs.some((r) => r.log !== null) };
    }),
  };
}

/** Start a paused script again, now. ADMIN: a token and a stale browser session are refused, and the screen offers sign-in. */
export async function resumeScript(base: string, script: string, io?: Fetch): Promise<Answer<ScriptResumed>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  return client.resumeScript(script);
}

/** After a resume: the script is on, its streak ended, and its clock due now, as `resumeScript` in the kernel leaves it. */
export function afterResume(rows: readonly Script[], script: string, nowIso: string): Script[] {
  return rows.map((r) =>
    r.script === script ? { ...r, status: 'on' as const, next: r.runs.every === null ? null : nowIso, refused: { ...r.refused, in_a_row: 0 } } : r,
  );
}

/* ── one script, said ───────────────────────────────────────────────────── */

export const words = {
  heading: 'Scripts',
  /* THE ONE WAY IN, since nothing on this list otherwise starts a script (SCR-3). */
  newScript: 'New script',
  none: 'No scripts yet',
  noneWhy: 'A script is a short program an agent writes and you accept. It runs on a clock, when something arrives, or when an automation starts it, and it may only read, write and fetch what it declares.',
  resume: 'Resume',
  resumeOne: (title: string) => `Resume ${title}`,
  resumed: (title: string) => `${title} runs again now. Three more refused runs in a row pause it again.`,
  /* What starts it. */
  every: (every: string) => `every ${every}`,
  door: (door: string) => `when something arrives at ${door}`,
  rule: 'when an automation starts it',
  runs: (parts: string[]) => `Runs ${parts.join(', and ')}.`,
  never: 'Runs only when started by hand.',
  /* Where it stands. */
  paused: (n: number) => `Paused after ${n} refused runs in a row. It runs again when you resume it.`,
  notRun: (next: string | null) => (next ? `Not run yet. First run ${next}.` : 'Not run yet.'),
  ranOk: (last: string, next: string | null) => (next ? `Last ran ${last}. Next run ${next}.` : `Last ran ${last}.`),
  ranRefused: (last: string, say: string) => (say ? `Last run ${last} was refused: ${say}` : `Last run ${last} was refused.`),
  ranOther: (last: string, say: string) => (say ? `Last run ${last}: ${say}` : `Last run ${last} did not finish.`),
  /* THE STREAK AGAINST WHAT PAUSES IT, so "2 of 3" says how close the next refusal is to stopping the script. */
  inARow: (n: number, max: number) => `${n} of ${max}`,
  month: (runs: number, refused: number) =>
    runs === 0 ? 'No runs' : `${runs === 1 ? '1 run' : `${runs.toLocaleString('en-GB')} runs`}, ${refused.toLocaleString('en-GB')} refused`,
  /* What it may touch. */
  reads: 'Reads',
  writes: 'Writes',
  fetches: 'Fetches from',
  keys: 'Opens the keys',
  nothing: 'Nothing',
  inARowLabel: 'Refused in a row',
  monthLabel: 'This month',
  /* Runs, logs and versions. */
  recent: 'Recent runs',
  noRuns: 'No runs in recent history.',
  log: 'Log',
  showLog: (when: string) => `Log of the run ${when}`,
  versions: 'Versions',
  versionsFrom: "From the record's recent history. An older version with no recent runs is not listed.",
  version: (n: number) => `Version ${n}`,
  now: 'Installed now',
  installed: (when: string) => `Installed ${when}`,
  versionRuns: (runs: number, refused: number) => (runs === 0 ? 'No recent runs' : `${runs} recent ${runs === 1 ? 'run' : 'runs'}, ${refused} refused`),
  outcome: { ok: 'Ran', refused: 'Refused', failed: 'Failed', held: 'Held', dropped: 'Dropped' } as Record<string, string>,
};

/** What starts a script, in one sentence. */
export function startsBy(s: Pick<ScriptRow, 'runs'>): string {
  const parts: string[] = [];
  if (s.runs.every !== null) parts.push(words.every(s.runs.every));
  if (s.runs.door !== null) parts.push(words.door(humanize(s.runs.door)));
  if (s.runs.rule) parts.push(words.rule);
  return parts.length === 0 ? words.never : words.runs(parts);
}

/** Where a script stands: one calm sentence, its tone, and whether Resume is offered. Paused is `warn`, refused `bad`. */
export function stateOf(s: Pick<ScriptRow, 'status' | 'last' | 'next' | 'refused'>, now: number): { line: string; tone: 'warn' | 'bad' | undefined; resume: boolean } {
  if (s.status === 'paused') return { line: words.paused(s.refused.pauses_at), tone: 'warn', resume: true };
  const next = s.next === null ? null : since(s.next, now);
  if (s.last === null) return { line: words.notRun(next), tone: undefined, resume: false };
  const last = since(s.last.at, now);
  const say = moneyInText(s.last.say);
  if (s.last.outcome === 'ok') return { line: words.ranOk(last, next), tone: undefined, resume: false };
  if (s.last.outcome === 'refused') return { line: words.ranRefused(last, say), tone: 'bad', resume: false };
  return { line: words.ranOther(last, say), tone: undefined, resume: false };
}

/**
 * The facts a card lists: how close it is to pausing, this month's runs, and what it may read, write, fetch and open.
 * Lists by their names and keys by their vault labels, never an id.
 */
export function factsOf(s: Pick<ScriptRow, 'reads' | 'writes' | 'egress' | 'keys' | 'refused' | 'month'>): { label: string; value: string }[] {
  const said = (xs: readonly string[]): string => (xs.length === 0 ? words.nothing : xs.join(', '));
  return [
    { label: words.inARowLabel, value: words.inARow(s.refused.in_a_row, s.refused.pauses_at) },
    { label: words.monthLabel, value: words.month(s.month.runs, s.month.refused) },
    { label: words.reads, value: said(s.reads.map(listName)) },
    { label: words.writes, value: said(s.writes.map(listName)) },
    { label: words.fetches, value: said(s.egress) },
    { label: words.keys, value: said(s.keys) },
  ];
}

/** A run's outcome in one word. */
export const outcomeOf = (outcome: string): string => (Object.hasOwn(words.outcome, outcome) ? (words.outcome[outcome] ?? humanize(outcome)) : humanize(outcome));
