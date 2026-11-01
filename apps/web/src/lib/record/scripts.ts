/**
 * The scripts screen, `/scripts`: every installed script, where it stands, what it may touch, its versions and, for its
 * owner, what its runs logged.
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
import { recordNow } from './boot-live.ts';
import { recordTime, recordToday } from './zone.ts';
import { humanize, listName } from './names.ts';
import { often } from './actions-plain.ts';

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
  /* THE TILE ON A SCRIPT'S OWN PAGE that says where it stands, over the form that changes it. */
  standing: 'Status',
  /* THE ONE WAY IN, since nothing on this list otherwise starts a script. */
  newScript: 'New script',
  none: 'No scripts yet',
  noneWhy: 'A script is a short program an agent writes and you accept. It runs on a clock, when something arrives, or when an automation starts it, and it may only read, write and fetch what it declares.',
  resume: 'Resume',
  resumeOne: (title: string) => `Resume ${title}`,
  resumed: (title: string) => `${title} runs again now. Three more refused runs one after another pause it again.`,
  /* What starts it. */
  /* `15m`, `1h`, `1d` AS A PERSON SAYS THEM: "every 15 minutes", "every hour", "every day" (`often`). */
  every: (every: string) => often(every),
  door: (door: string) => `when something arrives at ${door}`,
  rule: 'when an automation starts it',
  runs: (parts: string[]) => `Runs ${parts.join(' and ')}.`,
  never: 'Runs only when started by hand.',
  /* THE SAME, AS A LIST'S CELL (`startsShort`). */
  doorShort: (door: string) => `on ${door}`,
  ruleShort: 'by automation',
  byHand: 'By hand',
  /* Where it stands. */
  paused: (n: number) => `Paused after ${n} refused runs one after another. It runs again when you resume it.`,
  notRun: (next: string | null) => (next === null ? 'Not run yet.' : next === DUE ? 'Not run yet. Due to run.' : `Not run yet. First run ${next}.`),
  ranOk: (last: string, next: string | null) => (next === null ? `Last ran ${last}.` : next === DUE ? `Last ran ${last}. Due to run again.` : `Last ran ${last}. Next run ${next}.`),
  /* THE ROW'S SHORT WORD on the list: where it stands, with no sentence round it. */
  short: {
    paused: 'Paused',
    refused: 'Refused on its last run',
    notRun: 'Not run yet',
    due: 'Due to run',
    first: (next: string) => `First run ${next}`,
    ran: (last: string) => `Last ran ${last}`,
  },
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
  nothing: 'None',
  inARowLabel: 'Refused one after another',
  monthLabel: 'This month',
  /* Runs, logs and versions. */
  recent: 'Recent runs',
  noRuns: 'No runs in recent history.',
  log: 'Log',
  showLog: (when: string) => `Log of the run ${when}`,
  versions: 'Versions',
  versionsFrom: "From recent history. An older version with no recent runs is not listed.",
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

/** The word a run that is already due is said by, in place of a time. */
const DUE = 'due';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * WHEN A RUN STILL TO COME IS, AGAINST THE RECORD'S CLOCK (`recordNow`): "today at 18:00", "tomorrow at 06:00" or
 * "5 Sep at 18:00", and `DUE` once that moment has passed, since a next run seven weeks behind the clock is one waiting
 * to go, never one "7w ago".
 */
export function nextSaid(iso: string, now: number = recordNow()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at) || at <= now) return DUE;
  /* THE DAY AND THE TIME ARE THE RECORD'S, IN ITS ZONE (`zone.ts`), as every other "today" is: they were the browser's
     hours and its wall, so a reader whose browser kept another zone than the record read a run at the wrong hour, and
     "today" for one already behind the record's midnight. */
  const day = recordToday(at);
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${recordToday(now)}T00:00:00Z`)) / 86_400_000);
  const time = recordTime(at);
  return days === 0 ? `today at ${time}` : days === 1 ? `tomorrow at ${time}` : `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]!} at ${time}`;
}

/**
 * WHAT STARTS A SCRIPT, AS A LIST'S CELL SAYS IT: "Every day · by automation", the clock first, never a sentence. The
 * script's own page keeps the sentence (`startsBy`).
 */
export function startsShort(s: Pick<ScriptRow, 'runs'>): string {
  const parts: string[] = [];
  if (s.runs.every !== null) parts.push(words.every(s.runs.every));
  if (s.runs.door !== null) parts.push(words.doorShort(humanize(s.runs.door)));
  if (s.runs.rule) parts.push(words.ruleShort);
  const said = parts.length === 0 ? words.byHand : parts.join(' · ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/** What starts a script and where it stands, as the list's one meta line: "Every day · Not run yet". */
export function rowOf(s: Pick<ScriptRow, 'runs' | 'status' | 'last' | 'next'>, now: number = recordNow()): { what: string; said: string; tone: 'warn' | 'bad' | undefined } {
  const what = startsShort(s);
  if (s.status === 'paused') return { what, said: words.short.paused, tone: 'warn' };
  if (s.last?.outcome === 'refused') return { what, said: words.short.refused, tone: 'bad' };
  if (s.last !== null) return { what, said: words.short.ran(since(s.last.at, now)), tone: undefined };
  if (s.next === null) return { what, said: words.short.notRun, tone: undefined };
  const next = nextSaid(s.next, now);
  return { what, said: next === DUE ? words.short.due : words.short.first(next), tone: undefined };
}

/**
 * A row of a page's `scripts` block (`packages/kernel/src/sources/scripts.ts`), read back into the shape `rowOf` says,
 * and what the row says: its id, what starts it and where it stands, in the old list's words, and its tone. A field out
 * of shape is read as nothing, so a row never says a run nobody made.
 */
export function scriptOf(fields: Readonly<Record<string, unknown>>, now: number = recordNow()): { script: string; title: string } & ReturnType<typeof rowOf> {
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const lastAt = text(fields.last_at);
  const said = rowOf(
    {
      runs: { every: text(fields.every), door: text(fields.door), rule: fields.rule === true },
      status: fields.status === 'paused' ? 'paused' : 'on',
      last: lastAt === null ? null : { at: lastAt, version: null, outcome: text(fields.last) ?? '', say: text(fields.said) ?? '' },
      next: text(fields.next),
    },
    now,
  );
  return { script: text(fields.script) ?? '', title: text(fields.title) ?? '', ...said };
}

/** Where a script stands: one calm sentence, its tone, and whether Resume is offered. Paused is `warn`, refused `bad`. */
export function stateOf(s: Pick<ScriptRow, 'status' | 'last' | 'next' | 'refused'>, now: number = recordNow()): { line: string; tone: 'warn' | 'bad' | undefined; resume: boolean } {
  if (s.status === 'paused') return { line: words.paused(s.refused.pauses_at), tone: 'warn', resume: true };
  const next = s.next === null ? null : nextSaid(s.next, now);
  if (s.last === null) return { line: words.notRun(next), tone: undefined, resume: false };
  const last = since(s.last.at, now);
  const say = moneyInText(s.last.say);
  if (s.last.outcome === 'ok') return { line: words.ranOk(last, next), tone: undefined, resume: false };
  if (s.last.outcome === 'refused') return { line: words.ranRefused(last, say), tone: 'bad', resume: false };
  return { line: words.ranOther(last, say), tone: undefined, resume: false };
}

/**
 * The facts a card lists: how close it is to pausing, this month's runs, and what it may read, write, fetch and open.
 * Lists by their names and keys by their keychain labels, never an id.
 */
export function factsOf(
  s: Pick<ScriptRow, 'reads' | 'writes' | 'egress' | 'keys' | 'refused' | 'month'>,
  named: (list: string) => string = listName,
): { label: string; value: string }[] {
  const said = (xs: readonly string[]): string => (xs.length === 0 ? words.nothing : xs.join(', '));
  return [
    /* HOW CLOSE IT IS TO PAUSING, ONLY ONCE IT IS ANY CLOSER: "0 of 3" on every script was a fact about nothing. */
    ...(s.refused.in_a_row > 0 ? [{ label: words.inARowLabel, value: words.inARow(s.refused.in_a_row, s.refused.pauses_at) }] : []),
    { label: words.monthLabel, value: words.month(s.month.runs, s.month.refused) },
    /* LISTS BY THE NAMES THIS RECORD GIVES THEM (`named`, from its index), never the id in words: "Ledger", not "Transactions". */
    { label: words.reads, value: said(s.reads.map(named)) },
    { label: words.writes, value: said(s.writes.map(named)) },
    { label: words.fetches, value: said(s.egress) },
    { label: words.keys, value: said(s.keys) },
  ];
}

/** A run's outcome in one word. */
export const outcomeOf = (outcome: string): string => (Object.hasOwn(words.outcome, outcome) ? (words.outcome[outcome] ?? humanize(outcome)) : humanize(outcome));
