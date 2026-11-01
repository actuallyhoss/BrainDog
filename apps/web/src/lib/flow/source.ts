/**
 * Automations on the wire: the record's `automations` read, `automationRun`, `cancelRun`, and `propose` for a save,
 * and the editor's methods: `checkAutomation`, `tryAutomation`, `setAutomation`, `retryRun` and
 * `automationVersions`, with `decide` for the owner's one-press save and `retireDeclaration` for Delete.
 *
 * THE RECORD OR ITS REFUSAL, as `record/actions.ts` does it for scheduled actions. A screen reads a `Source`, which is
 * the record over HTTP. With no record it drew the sample's four automations, and a flow drawn and "sent" there was
 * kept for the tab and filed nowhere; that went with the sample, and no record is now the sentence for it.
 *
 * THE THREE READS AND WHAT EACH FALLS BACK TO.
 *
 *   · `automations` answers the list. A record with no such method yet (`ROUTE_UNKNOWN`, which is every record built
 *     before the method existed) draws no list; the canvas still opens, because saving goes through `propose`, which every record
 *     has. Any other refusal, `UNREACHABLE` and `UNAUTHORIZED` among them, is said.
 *   · `automationRun` and `cancelRun` are ADMIN and a browser session's. A refusal is the record's own sentence.
 *   · `propose` files the `change`.
 *
 * NOT THROUGH `@braindog/client`, FOR `actions.ts`'s REASON: the client refuses a method missing from its own route
 * table before sending anything, and "this build has no such read" and "there is no record here" are two answers this
 * screen draws differently. `send` is a copy of the one in `actions.ts`, which does not export it; the two are the same eighteen lines and say so here so that a fix to one is looked for in both.
 *
 * READ DEFENSIVELY. The `automations` answer was written alongside this file (`packages/record/src/
 * automations.ts`), and this screen was first written against a guess at it that had a body on every listed row. The
 * record's list has none, and every row would have been dropped. So `rowOf` reads the record's keys by name, works out
 * from a body what the record left out, and leaves out only a row with no id.
 */

import { since } from 'braindog-render';

import { copy } from '../copy.ts';
import { titleOf } from '../record/names.ts';
import { draftOf, pathOf, sayStart, sayStep, sayTrigger, triggerKind, triggerOfBody, words, type Body, type Node } from './flow.ts';

/* ── the shapes ─────────────────────────────────────────────────────────── */

export type Refusal = { code: string; fix: string; at?: string | undefined };
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export type RunState = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

/** One step a run took, as `automation_step` keeps it. `answer` is at most 64 KB and never a secret. */
export type RunStep = { n: number; kind: string; state: 'done' | 'waiting' | 'failed' | 'skipped'; answer: string | null; at: string };

/**
 * One run, as `automation_run` keeps it: pinned to the version it started under, with its sentence if it failed.
 * `version` is `null` and `trigger` is `null` from a record that did not say them, which the run's detail survives.
 */
export type RunRow = {
  id: string;
  state: RunState;
  started: string;
  finished: string | null;
  say: string | null;
  steps: RunStep[];
  version: number | null;
  /** What kind of thing started it: written, arrival, every, metric, decided or manual. */
  trigger: string | null;
};

/**
 * One automation, as the record's `automations` read answers it (`packages/record/src/automations.ts`).
 *
 * TWO ANSWERS, ONE SHAPE HERE. The list (`GET /api/automations`) carries the summary a row needs and NO BODY; the one
 * (`GET /api/automations?rule=<id>`) carries the body and its last ten runs. So `body` is `null` on a listed row and
 * the editor asks for the one before it opens anything, and the list draws from the summary alone.
 *
 * `id` IS THE BARE ID, `usd-eur`, which the record calls `rule`; `rule.usd-eur` is what a change names and what the
 * record calls `id`. `version` is what an edit is drawn from.
 */
export type AutomationRow = {
  id: string;
  name: string;
  version: number;
  /** The trigger's kind: written, arrival, every, metric, decided or manual. */
  trigger: string;
  path: 'inline' | 'run';
  register: string | null;
  enabled: boolean;
  /** The add-on that brought it, or `null` for one somebody made. */
  pack?: string | null | undefined;
  next: string | null;
  last: { at: string; state: RunState; say: string | null } | null;
  month: { runs: number; failures: number } | null;
  body: Body | null;
  runs: RunRow[];
  /** The run to pass as `before` for the page of runs after these, or `null` when these reach the first one kept. */
  older: string | null;
  /**
   * When the log last has a line signed by it, for one the record answered no last run for: `null` when the newest
   * page of the log holds none, and absent when the log was not asked (`withFired`).
   */
  acted?: string | null | undefined;
  /** The record's whole count (rule_stat): times its work landed, when it last did, why one that never has not, and its family key. */
  fired?: number | undefined;
  last_at?: string | null | undefined;
  why_idle?: string | null | undefined;
  family?: string | null | undefined;
  /** Times it ran or landed its work this calendar month, UTC, from the record's dated count (`rule_month`). */
  month_fired?: number | undefined;
};

/** `propose`'s answer: the suggestion's id, or `null` when the record filed it without saying which. */
export type Filed = { id: string | null };

/** One row an inline rule's dry run walked: the row as the record names it, what it would get, and why not if nothing. */
export type TriedRow = { spoken: string; would: string[]; reason: string | null };

/**
 * What a body would do, as the record's `dryRun` answers it (`packages/record/src/index.ts`, `dryRun`).
 *
 * TWO ANSWERS, ONE SHAPE HERE, as with `AutomationRow`. Every body gets the record's own sentences (`path`, `trigger`,
 * `steps`, from `automations.ts` `said`). An inline body is also walked over its list by the kernel, which adds how many
 * rows it read and matched and the first twenty with what each would get; a run reads no row, so `matches` and `rows`
 * are `null` for it and `sample` is empty, and the screen says the sentences alone.
 */
export type Tried = {
  path: 'inline' | 'run';
  trigger: string;
  steps: string[];
  matches: number | null;
  rows: number | null;
  sample: TriedRow[];
  won?: number;
  lost?: number;
  takenBy?: Record<string, number>;
};

/** How one step went in a try: taken, would reach outside the record, would park, failed, or never reached. */
export type TryState = 'done' | 'would' | 'waiting' | 'failed' | 'skipped';

/**
 * One step of a try, as `tryAutomation` answers it: where it sits in the body, its verb, how it went and its sentence.
 * `out` is what the step kept under its `as:`, already cut and with a secret withheld by the kernel; `sends` is what a
 * call the try stopped at would have sent. Both are absent where the record says nothing of them.
 */
export type TriedStep = {
  path: string;
  verb: string;
  state: TryState;
  answer: string | null;
  say: string;
  out?: unknown;
  /** The name `out` was kept under, read by a later step as `{{vars.<as>}}`. */
  as?: string;
  /** True where `out` is cut at 4 KB, which is no answer to give back. */
  cut?: true;
  sends?: Record<string, unknown>;
};

/**
 * What `tryAutomation` answers (`packages/kernel/src/flow-try.ts`): the trigger it built from the sample, by its kind,
 * and every step of the body, each with how it went.
 */
export type TryRun = { trigger: string; steps: TriedStep[]; step?: string };

/**
 * One step tried alone: the path of the step, and the earlier steps' answers by the name each kept them
 * under, which the record uses rather than taking those steps again.
 */
export type TryOne = { step: string; given?: Record<string, unknown> };

/** What a try starts from, as `tryAutomation` takes it. Every key is optional; the trigger's kind says which it reads. */
export type Sample = { row?: string | Record<string, unknown>; arrival?: string; payload?: unknown };

/** One row or one arrival a try can start from, named as a person reads it. */
export type Pickable = { id: string; label: string; at: string | null };

/** One version of an automation, newest first, as `automationVersions` answers it. */
export type Version = { version: number; at: string; live: boolean; enabled: boolean; by: string | null; body: Body };

/** What `setAutomation` answers: the version now live and whether it runs. */
export type Switched = { version: number; enabled: boolean };

/* ── when an automation with no runs last did something ───────────────────── */

/**
 * When each rule last signed a line of the log, by its bare id, from one page of `recentHistory`, newest first.
 *
 * AN AUTOMATION THAT RUNS INSIDE THE CHANGE THAT STARTS IT KEEPS NO RUN. The record counts runs (`automation_run`) and
 * such a rule's firings are lines of the log, signed `rule:<id>`, so `automations` answers `last: null` for it for ever
 * and the list said "Not run yet" on every one while Activity, reading that same log, listed what each had done. The
 * log is the only place its last turn is written down, so that is where it is read.
 *
 * READ BY NAME, as `rowOf` reads: a line with no actor or no time is passed over, and anything that is not a page is
 * no lines.
 */
export function firedOf(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const events = isObject(raw) && Array.isArray(raw.events) ? raw.events : [];
  for (const e of events) {
    if (!isObject(e)) continue;
    const rule = /^rule[.:](.+)$/u.exec(text(e.actor) ?? '')?.[1];
    const at = text(e.ts);
    if (rule === undefined || at === null) continue;
    const had = out.get(rule);
    if (had === undefined || Date.parse(at) > Date.parse(had)) out.set(rule, at);
  }
  return out;
}

/**
 * The rows with `acted` filled for each one the record answered no last run for: when the log last has it, or `null`
 * for one the page read holds nothing from. A row with a last run is left as it came, since a run says more.
 */
export const withFired = (rows: readonly AutomationRow[], fired: ReadonlyMap<string, string>): AutomationRow[] =>
  rows.map((r) => (r.last !== null || r.acted !== undefined ? r : { ...r, acted: fired.get(r.id) ?? null }));

/** How many lines of the log are read for it: the record's largest page. */
const FIRED_PAGE = 200;

/* ── reading an answer written alongside this file ───────────────────────── */

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const STATES: ReadonlySet<string> = new Set(['pending', 'running', 'waiting', 'done', 'failed', 'cancelled']);
const STEP_STATES: ReadonlySet<string> = new Set(['done', 'waiting', 'failed', 'skipped']);

const bare = (id: string): string => (id.startsWith('rule.') ? id.slice('rule.'.length) : id);

function runOf(raw: unknown): RunRow | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const state = text(raw.state);
  const started = text(raw.started_at) ?? text(raw.started);
  if (!id || !state || !STATES.has(state) || !started) return null;
  const steps = Array.isArray(raw.steps)
    ? raw.steps.flatMap((s): RunStep[] =>
        isObject(s) && typeof s.n === 'number' && typeof s.kind === 'string' && typeof s.state === 'string' && STEP_STATES.has(s.state)
          ? [{ n: s.n, kind: s.kind, state: s.state as RunStep['state'], answer: text(s.answer), at: text(s.at) ?? started }]
          : [],
      )
    : [];
  return {
    id,
    state: state as RunState,
    started,
    finished: text(raw.finished_at) ?? text(raw.finished),
    say: text(raw.say),
    steps,
    version: typeof raw.version === 'number' ? raw.version : null,
    trigger: text(raw.trigger),
  };
}

/**
 * One row of either answer. What the record said wins; what it left out is worked out from the body when there is one,
 * so a row the record summarised and a row it answered with its body read the same.
 */
export function rowOf(r: unknown): AutomationRow | null {
  if (!isObject(r)) return null;
  const id = text(r.rule) ?? (text(r.id) === null ? null : bare(text(r.id)!));
  if (!id) return null;
  const body = isObject(r.body) ? r.body : null;
  const runs = Array.isArray(r.runs) ? r.runs.map(runOf).filter((x): x is RunRow => x !== null) : [];
  const last =
    isObject(r.last) && text(r.last.at) && STATES.has(String(r.last.state))
      ? { at: text(r.last.at)!, state: r.last.state as RunState, say: text(r.last.say) }
      : runs[0]
        ? { at: runs[0].started, state: runs[0].state, say: runs[0].say }
        : null;
  /* `failed` IS THE RECORD'S WORD FOR IT, counted by the run's state; `failures` is the scheduled actions' ledger word. */
  const month =
    isObject(r.month) && typeof r.month.runs === 'number'
      ? { runs: r.month.runs, failures: typeof r.month.failed === 'number' ? r.month.failed : typeof r.month.failures === 'number' ? r.month.failures : 0 }
      : null;
  /* THE DECLARED TITLE, NEVER THE ID. The record answers `name` as the body's name "or the id when it has none", so a
     name equal to the id is the record filling a gap, and the title is worked out as History and the rest of the app
     work one out for a rule (`names.ts` `titleOf`): the product's own name for a rule it ships, else the id in words. */
  const said = text(r.name);
  const fromRecord = said !== null && said !== id && said !== `rule.${id}` ? said : null;
  const named = (body && typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : null) ?? fromRecord;
  const path = r.path === 'inline' || r.path === 'run' ? r.path : body ? pathOf(body) : 'inline';
  return {
    id,
    name: named ?? titleOf({ id, kind: 'rule' }),
    version: typeof r.version === 'number' ? r.version : 0,
    trigger: text(r.trigger) ?? (body ? triggerKind(triggerOfBody(body)) : 'written'),
    path,
    register: text(r.register) ?? (body ? subjectOfBody(body) : null),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : body?.enabled !== false,
    pack: text(r.pack),
    next: text(r.next) ?? text(r.next_at),
    last,
    month,
    body,
    runs,
    older: text(r.older),
    /* WHEN IT LAST FIRED, FROM THE RECORD, which answers it for every rule: an inline rule leaves no run, and one page
       of the log said "nothing lately" of a rule whose last firing sat below that page. */
    ...('lastFired' in r ? { acted: text(r.lastFired) } : {}),
    ...(typeof r.fired === 'number' ? { fired: r.fired, last_at: text(r.last_at), why_idle: text(r.why_idle), family: text(r.family), ...(typeof r.week === 'number' ? { week: r.week } : {}), ...(typeof r.month_fired === 'number' ? { month_fired: r.month_fired } : {}) } : {}),
  };
}

/** The list answer, read into rows. A row with no id is left out: there is nothing to open. */
export const rowsOf = (raw: unknown): AutomationRow[] => (Array.isArray(raw) ? raw.map(rowOf).filter((x): x is AutomationRow => x !== null) : []);

/**
 * A dry run's answer, read by name for `rowOf`'s reason. An answer with no sentences at all is `null`, because a trial
 * that says nothing is not something the screen can draw as an answer.
 */
export function triedOf(raw: unknown): Tried | null {
  if (!isObject(raw) || !Array.isArray(raw.steps) || typeof raw.trigger !== 'string') return null;
  const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sample = Array.isArray(raw.sample)
    ? raw.sample.flatMap((s): TriedRow[] =>
        isObject(s) && typeof s.spoken === 'string'
          ? [{ spoken: s.spoken, would: Array.isArray(s.would) ? s.would.filter((w): w is string => typeof w === 'string') : [], reason: text(s.reason) }]
          : [],
      )
    : [];
  return {
    path: raw.path === 'inline' ? 'inline' : 'run',
    trigger: raw.trigger,
    steps: raw.steps.filter((l): l is string => typeof l === 'string'),
    matches: count(raw.matches),
    rows: count(raw.rows),
    sample,
    ...(typeof raw.won === 'number' ? { won: raw.won } : {}),
    ...(typeof raw.lost === 'number' ? { lost: raw.lost } : {}),
    ...(isObject(raw.takenBy) ? { takenBy: raw.takenBy as Record<string, number> } : {}),
  };
}

/**
 * A step's answer as a person reads it: `rate 71.4`, not `{"rate": 71.4}`.
 *
 * THE RUNNER KEEPS IT AS TEXT, and usually as the JSON the step handed back (`automation_step.answer`, at most 64 KB),
 * so the Runs tab printed braces and quotes in the identifier face. An object is said as its keys and values, a list as
 * its items, and anything that does not parse is the text it was kept as. A value that is itself an object stays JSON,
 * because flattening it would say something the step did not.
 */
export function answerWords(answer: string): string {
  let v: unknown;
  try {
    v = JSON.parse(answer);
  } catch {
    return answer;
  }
  const one = (x: unknown): string => (typeof x === 'string' ? x : JSON.stringify(x));
  if (Array.isArray(v)) return v.map(one).join(', ');
  if (isObject(v)) return Object.entries(v).map(([k, x]) => `${k} ${one(x)}`).join(', ');
  return one(v);
}

/* ── the editor's words and the pure half of its reads ──────────────────────── */

/**
 * THE EDITOR'S OWN WORDS, kept beside the reads they describe as `fieldWords` is in `record/field-write.ts`, so
 * `flow.ts` and its `words` stay the canvas's own. The page, `Tried.svelte` and `RunView.svelte` read them here.
 */
export const editWords = {
  rename: 'Rename',
  missing: 'There is no automation here',
  tryIt: 'Try it',
  trying: 'Trying',
  start: 'Pick what starts it and add a step, then save it.',
  saveOn: 'Save and turn on',
  saveChanges: 'Save changes',
  savedOn: 'Saved. It is on.',
  saved: 'Saved.',
  filedOnly: 'Saved to Needs you, and not accepted yet.',
  more: (title: string) => `More for ${title}`,
  turnOff: 'Turn off',
  turnOn: 'Turn on',
  turnedOff: 'It is off. Nothing starts it until it is turned on.',
  turnedOn: 'It is on.',
  duplicate: 'Duplicate',
  copyOf: (title: string) => `Copy of ${title}`,
  remove: 'Delete',
  removeAsk: 'Delete this automation?',
  removeWhy: 'It stops running. Its runs and everything it wrote stay.',
  removeIt: 'Delete the automation',
  keep: 'Keep it',
  removed: 'The automation is deleted.',
  versions: 'Versions',
  noVersions: 'No versions yet',
  versionOf: (n: number) => `Version ${n}`,
  live: 'Live',
  off: 'Off',
  by: (who: string) => `by ${who}`,
  showChanges: 'Show changes',
  hideChanges: 'Hide changes',
  noChanges: 'The same steps as the version before it.',
  firstVersion: 'The first version.',
  putBack: 'Put this version back',
  putBackSaid: (n: number) => `Version ${n} is on the canvas. Save it to put it back.`,
  olderRuns: 'Show older runs',
  /** Runs side by side that ended alike, as one row: "Failed 10 times, the last 9 min ago". */
  runTimes: (state: string, n: number, when: string) => `${state} ${n.toLocaleString('en')} times, the last ${when}`,
  openRun: 'Open this run',
  retry: 'Run it again',
  retried: 'It runs again. The new run shows here once it has started.',
  runSheet: 'Run',
  handedBack: 'What it handed back',
  notReached: 'Not reached',
  took: (ms: number) => `took ${lasted(ms)}`,
  startedBy: {
    written: 'Started by a change',
    arrival: 'Started by an arrival',
    every: 'Started by the clock',
    metric: 'Started by a figure',
    decided: 'Started by a decision',
    manual: 'Started by a press',
  } as Record<string, string>,
  held: 'It held, so it took If so.',
  notHeld: 'It did not hold, so it took If not.',
  /* THE TRY PANEL. */
  tryFrom: 'Try it on',
  /* TWO WORDS AT MOST: "Something I paste" wrapped under the other two at 390. */
  fromLatest: 'The latest',
  fromRow: 'Pick one',
  fromArrival: 'Last arrival',
  fromJson: 'Paste one',
  fromNow: 'Now',
  fromAsIs: 'As decided',
  pickRow: 'Which one',
  pasteLabel: 'What to try it on',
  pasteHint: 'The fields of an item, what arrived, or a figure, written as JSON.',
  noRows: 'This list is empty, so paste the fields of an item.',
  rowsReading: 'Reading the list.',
  rowsUnread: 'The list could not be read just now, so paste the fields of an item.',
  noArrivals: 'Nothing has arrived yet, so paste what would.',
  notJson: 'That is not JSON. Write it as {"field": "value"}.',
  pickOne: 'Pick one to try it on.',
  tryState: {
    done: 'Done',
    would: 'Would do this',
    waiting: 'Would wait here',
    failed: 'Failed',
    skipped: 'Not reached',
  } as Record<TryState, string>,
  triedHeading: 'If it ran now',
  triedWrote: 'Trying it changes nothing and sends nothing.',
  /* ONE STEP TESTED ALONE: the heading over its result, and the two things folded under it. */
  testedStep: 'This step, tested alone',
  whatItGave: 'What it gave',
  wouldSend: 'What it would send',
  row: (at: string) => `One from ${at}`,
  arrival: (at: string) => `Something that arrived ${at}`,
} as const;

/** How long something took, in the fewest words that say it: "under a second", "12s", "3m 4s", "2h 5m". */
export function lasted(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return 'under a second';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** How long a finished run took, or `null` for one still going or a stamp that does not parse. */
export function durationOf(run: { started: string; finished: string | null }): number | null {
  if (run.finished === null) return null;
  const ms = Date.parse(run.finished) - Date.parse(run.started);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * A step's answer as a person reads it, by its verb. A branch keeps `then` or `else` as its answer, which printed raw
 * was the runner's word for the arm it took; said here as whether the condition held.
 */
export function stepAnswer(verb: string, answer: string | null): string | null {
  if (answer === null) return null;
  if (verb === 'if' && answer === 'then') return editWords.held;
  if (verb === 'if' && answer === 'else') return editWords.notHeld;
  return answerWords(answer);
}

const TRY_STATES: ReadonlySet<string> = new Set(['done', 'would', 'waiting', 'failed', 'skipped']);

/** A try's answer, read by name for `rowOf`'s reason. `null` for one with no steps list, which is nothing to draw. */
export function tryRunOf(raw: unknown): TryRun | null {
  if (!isObject(raw) || !Array.isArray(raw.steps)) return null;
  const trigger = isObject(raw.trigger) ? (text(raw.trigger.kind) ?? '') : (text(raw.trigger) ?? '');
  const steps = raw.steps.flatMap((s): TriedStep[] =>
    isObject(s) && typeof s.path === 'string' && typeof s.verb === 'string' && typeof s.state === 'string' && TRY_STATES.has(s.state)
      ? [
          {
            path: s.path,
            verb: s.verb,
            state: s.state as TryState,
            answer: text(s.answer),
            say: typeof s.say === 'string' ? s.say : '',
            ...(s.out === undefined ? {} : { out: s.out }),
            ...(typeof s.as === 'string' ? { as: s.as } : {}),
            ...(s.cut === true ? { cut: true as const } : {}),
            ...(isObject(s.sends) ? { sends: s.sends } : {}),
          },
        ]
      : [],
  );
  return { trigger, steps };
}

/** `automationVersions`' answer, newest first. A version with no number or no body is left out: it cannot be shown. */
export function versionsOf(raw: unknown): Version[] {
  const list = isObject(raw) && Array.isArray(raw.versions) ? raw.versions : Array.isArray(raw) ? raw : [];
  return list.flatMap((v): Version[] =>
    isObject(v) && typeof v.version === 'number' && isObject(v.body)
      ? [{ version: v.version, at: text(v.at) ?? '', live: v.live === true, enabled: v.enabled !== false, by: text(v.by), body: v.body }]
      : [],
  );
}

/**
 * A row as a try's picker names it: the first text field it has, cut to a line, else when it was added. Never its id
 * or its number, which a person does not say.
 */
export function pickableRow(raw: unknown, now: number): Pickable | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  if (!id) return null;
  const fields = isObject(raw.fields) ? raw.fields : {};
  const first = Object.values(fields).find((v): v is string => typeof v === 'string' && v.trim() !== '');
  const at = text(raw.updated_at) ?? text(raw.created_at);
  const label = first !== undefined ? (first.trim().length > 60 ? `${first.trim().slice(0, 59)}…` : first.trim()) : editWords.row(at ? since(at, now) : '');
  return { id, label, at };
}

/** An arrival as a try's picker names it: its subject, else who sent it, else when it came. */
export function pickableArrival(raw: unknown, now: number): Pickable | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  if (!id) return null;
  const at = text(raw.ts);
  const label = text(raw.subject) ?? text(raw.from) ?? editWords.arrival(at ? since(at, now) : '');
  return { id, label, at };
}

/** Where a try starts from: the newest row or arrival, one picked, or pasted JSON. */
export type Pick = { from: 'latest' | 'row' | 'json'; row: string; json: string };

/** Which ways of starting a try a trigger offers, first the one it opens on. A clock or a press needs nothing. */
export function picksFor(kind: string, owner: boolean): Pick['from'][] {
  if (kind === 'written') return ['latest', 'row', 'json'];
  /* THE INBOX IS AN OWNER'S READ, and `tryAutomation` refuses anybody else an arrival by id, so they paste one. */
  if (kind === 'arrival') return owner ? ['latest', 'json'] : ['json'];
  if (kind === 'metric') return ['json'];
  if (kind === 'decided') return ['latest', 'json'];
  return [];
}

/**
 * The sample a try sends, or the sentence for why it cannot be built. A trigger that reads nothing (a clock, a press)
 * starts from an empty sample; everything else is read off the picker, and pasted text is parsed as JSON, never as a
 * number by `Number()`.
 */
/** How far the read of a try's list has got: not back yet, back, or refused. */
export type RowsRead = 'reading' | 'read' | 'refused';

/**
 * The line under "The latest": the newest item's name, or why there is none.
 *
 * A LIST THAT COULD NOT BE READ IS NOT EMPTY. The two were drawn alike, so "This list is
 * empty" stood over Bills and invoices while it held two.
 */
export function rowsNote(rows: readonly Pickable[], read: RowsRead): string {
  if (rows[0]) return rows[0].label;
  return read === 'reading' ? editWords.rowsReading : read === 'refused' ? editWords.rowsUnread : editWords.noRows;
}

export function sampleOf(kind: string, pick: Pick, rows: readonly Pickable[], arrivals: readonly Pickable[]): Answer<Sample> {
  const fail = (fix: string): Answer<Sample> => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix } });
  const choices = picksFor(kind, true);
  if (choices.length === 0) return { ok: true, value: {} };
  if (pick.from === 'json' || !choices.includes(pick.from)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(pick.json);
    } catch {
      return fail(editWords.notJson);
    }
    if (kind === 'written') return isObject(parsed) ? { ok: true, value: { row: parsed } } : fail(editWords.notJson);
    return { ok: true, value: { payload: parsed } };
  }
  if (kind === 'written') {
    const id = pick.from === 'row' ? pick.row : (rows[0]?.id ?? '');
    if (id === '') return fail(pick.from === 'row' ? editWords.pickOne : editWords.noRows);
    return { ok: true, value: { row: id } };
  }
  if (kind === 'arrival') {
    const id = arrivals[0]?.id;
    return id === undefined ? fail(editWords.noArrivals) : { ok: true, value: { arrival: id } };
  }
  return { ok: true, value: {} };
}

/* ── where a step sits in a body ──────────────────────────────────────── */

/**
 * Each card's place in the body a save would send, as the record names a step (`steps[1].then[0]`), by the card's key.
 * `root` is what the body calls its list, `steps` or `then`. The walk is `bodyOf`'s order, so a place here is the place
 * of the step in what is sent.
 */
export function pathsOf(nodes: readonly Node[], root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: readonly Node[], at: string) => {
    for (const [i, node] of list.entries()) {
      const here = `${at}[${i}]`;
      out.set(node.key, here);
      if (node.then) walk(node.then, `${here}.then`);
      if (node.else) walk(node.else, `${here}.else`);
    }
  };
  walk(nodes, root);
  return out;
}

/**
 * The card a record's `at` is about: the step whose place is the longest start of it. A lint refusal names a place
 * inside a step (`steps[1].set.field`) and sometimes the body around it (`body.steps[1]`); `steps[1]` must not claim
 * `steps[10]`, so a place counts only where the next character ends it. `null` for an `at` about no step.
 */
export function keyAt(paths: ReadonlyMap<string, string>, at: string | undefined): string | null {
  if (at === undefined) return null;
  const said = at.startsWith('body.') ? at.slice('body.'.length) : at;
  let best: { key: string; length: number } | null = null;
  for (const [key, place] of paths) {
    const next = said.charAt(place.length);
    if (said.startsWith(place) && (next === '' || next === '.' || next === '[') && (best === null || place.length > best.length)) best = { key, length: place.length };
  }
  return best?.key ?? null;
}

/**
 * Each place in the flat plan the runner numbers a run's steps by, as `packages/kernel/src/flow.ts` `plan` builds it:
 * an `if` is followed by its `then`, a `jump` (an empty place here) where it has an `else`, then the `else`. A run's
 * step `n` is an index into this, so the run's detail finds each step's card by it.
 */
export function planPlaces(body: Body): string[] {
  const out: string[] = [];
  const root = Array.isArray(body.steps) ? 'steps' : 'then';
  const walk = (list: unknown, at: string) => {
    if (!Array.isArray(list)) return;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      out.push(here);
      if ('if' in step) {
        walk(step.then, `${here}.then`);
        if (step.else !== undefined) {
          out.push('');
          walk(step.else, `${here}.else`);
        }
      }
    }
  };
  walk(root === 'steps' ? body.steps : body.then, root);
  return out;
}

/* ── what changed between two versions ──────────────────────────────── */

/**
 * A body as lines a person reads: what starts it, then each step's sentence, a branch's arms indented under it. The
 * diff between two versions is taken over these, so it says "Tell you: …" changed and never a brace.
 */
export function sayLines(id: string, body: Body): string[] {
  const d = draftOf(id, body);
  const out = [sayStart(d)];
  const walk = (list: readonly Node[], depth: number) => {
    for (const node of list) {
      out.push(`${'  '.repeat(depth)}${sayStep(node.step)}`);
      if (node.then && node.then.length > 0) {
        out.push(`${'  '.repeat(depth + 1)}${words.then}`);
        walk(node.then, depth + 2);
      }
      if (node.else && node.else.length > 0) {
        out.push(`${'  '.repeat(depth + 1)}${words.otherwise}`);
        walk(node.else, depth + 2);
      }
    }
  };
  walk(d.steps, 0);
  return out;
}

export type DiffLine = { op: 'same' | 'added' | 'removed'; line: string };

/**
 * The lines `after` adds to and takes from `before`, in order, by the longest run they share. A body is tens of lines,
 * so the square table is small and exact, where a cleverer diff would only be faster.
 */
export function diffLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const common: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      common[i]![j] = before[i] === after[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ op: 'same', line: before[i]! });
      i += 1;
      j += 1;
    } else if (common[i + 1]![j]! >= common[i]![j + 1]!) {
      out.push({ op: 'removed', line: before[i]! });
      i += 1;
    } else {
      out.push({ op: 'added', line: after[j]! });
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push({ op: 'removed', line: before[i]! });
  for (; j < m; j += 1) out.push({ op: 'added', line: after[j]! });
  return out;
}

/** The register a body's rows come from, as `flow-lint.ts`'s `subjectOf` reads it. */
function subjectOfBody(body: Body): string | null {
  if (typeof body.register === 'string') return body.register;
  const t = triggerOfBody(body);
  return 'written' in t ? t.written.register : null;
}

/**
 * What starts a listed automation, in one sentence, from the summary alone when there is no body: the list answer
 * carries the trigger's kind and its list, which is enough for a change or a button and not for how often a clock runs.
 */
export function rowTrigger(row: AutomationRow, listSaid?: (id: string) => string): string {
  if (row.body) return sayTrigger(triggerOfBody(row.body), listSaid);
  if (row.trigger === 'written' && row.register) return sayTrigger({ written: { register: row.register } }, listSaid);
  if (row.trigger === 'arrival') return sayTrigger({ arrival: {} });
  if (row.trigger === 'manual') return sayTrigger({ manual: true });
  return words.kinds[row.trigger] ?? row.trigger;
}

/**
 * One automation's second line on the list: off, or its last run and its next, in the words `actions.ts` uses for a
 * scheduled action, so the two lists read alike. A failed last run carries the record's own sentence about why.
 */
export function rowLine(row: AutomationRow, now: number): string {
  if (!row.enabled) return words.off;
  const next = row.next ? words.nextRun(since(row.next, now)) : '';
  const last = lastSaid(row, now);
  if (!row.last && !row.acted) return next || last;
  return [last, next].filter(Boolean).join(' ');
}

/**
 * When a turned-on automation last ran and how it went, in one sentence, or `''` when nothing true can be said.
 *
 * FOUR ANSWERS, AND "NOT RUN YET" IS ONLY ONE OF THEM. A last run is said with how it ended, and a failed one with the
 * record's own sentence about why. One the record keeps no runs for is said from the log: when it last did something,
 * or that the newest page holds nothing from it, which is "lately" and never "yet", because an older turn may sit
 * below the page. With the log unread it says nothing rather than guess. Only one that would have left a run and has
 * none has not run yet.
 */
export function lastSaid(row: AutomationRow, now: number): string {
  if (row.last) {
    const last = words.lastRun(since(row.last.at, now), words.runState[row.last.state] ?? row.last.state);
    return row.last.state === 'failed' && row.last.say ? `${last} ${row.last.say}` : last;
  }
  if (row.acted) return words.lastActed(since(row.acted, now));
  if (row.path === 'inline') return row.acted === null ? words.quiet : '';
  return words.neverRun;
}

/* ── the wire ───────────────────────────────────────────────────────────── */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/* A DEAD NETWORK SAID "The demo has no account", as `actions.ts` did, about a door that is gone. */
const unreachable = (): Answer<never> => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });
const unauthorized = (): Answer<never> => ({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: copy.signInAgain } });

const isAnswer = (v: unknown): v is Answer<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && ((v as { ok: unknown }).ok === true ? 'value' in v : 'refusal' in v);

/** One request, read as the record's envelope. A copy of `actions.ts`'s `send`; the header says why. */
async function send<T>(io: Fetch, url: string, body?: Record<string, unknown>): Promise<Answer<T>> {
  let res: Response;
  try {
    res = await io(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return unreachable();
  }
  if (res.status === 401) {
    await res.body?.cancel().catch(() => undefined);
    return unauthorized();
  }
  const said: unknown = await res.json().catch(() => undefined);
  return (isAnswer(said) ? said : unreachable()) as Answer<T>;
}

/** One alternative for a piece of the trigger: its words, and the text to put in each piece (by index) when it is picked. */
export type TriggerOption = { label: string; set: Record<string, string> };
/** A piece of the read-back trigger. The pressable ones carry options; `text` pieces are the glue between them. */
export type SentencePart = { kind: 'text' | 'thing' | 'list' | 'door' | 'timing' | 'condition'; text: string; options?: TriggerOption[] };
export type ActionOption = { label: string; text: string };
/** The sentence in pieces: "When" + the trigger's texts, a comma, then the actions joined by "and". */
export type SentenceParts = { trigger: SentencePart[]; actions: string[]; options: ActionOption[] };

/** What `automationSentence` answers: the body a sentence means, read back, and what it would have done over the last 30 days. */
export type Sentenced = {
  rule: string;
  said: string;
  by: 'rules' | 'model';
  body: Body;
  path: 'inline' | 'run';
  looked: { days: number; runs: number; atLeast: boolean; sample: string[]; line: string } | null;
  notes: string[];
  /** The sentence in pressable pieces, or `null` for one the model wrote. */
  parts: SentenceParts | null;
};

/** The pieces as the wire sends them, or `null` when they are not whole. */
function partsOf(raw: unknown): SentenceParts | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const strings = (x: unknown): string[] | null => (Array.isArray(x) && x.every((y) => typeof y === 'string') ? (x as string[]) : null);
  const actions = strings(r.actions);
  if (!Array.isArray(r.trigger) || actions === null) return null;
  const trigger: SentencePart[] = [];
  for (const p of r.trigger as unknown[]) {
    if (typeof p !== 'object' || p === null || typeof (p as { text?: unknown }).text !== 'string') return null;
    const q = p as { kind?: unknown; text: string; options?: unknown };
    const options = Array.isArray(q.options)
      ? q.options.flatMap((o): TriggerOption[] => {
          const x = o as { label?: unknown; set?: unknown } | null;
          return x && typeof x.label === 'string' && typeof x.set === 'object' && x.set !== null ? [{ label: x.label, set: x.set as Record<string, string> }] : [];
        })
      : [];
    trigger.push({ kind: (q.kind as SentencePart['kind']) ?? 'text', text: q.text, ...(options.length > 0 ? { options } : {}) });
  }
  const options = Array.isArray(r.options)
    ? r.options.flatMap((o): ActionOption[] => {
        const x = o as { label?: unknown; text?: unknown } | null;
        return x && typeof x.label === 'string' && typeof x.text === 'string' ? [{ label: x.label, text: x.text }] : [];
      })
    : [];
  return { trigger, actions, options };
}

/** `Sentenced` as the wire sends it, or `null` for an answer that is not one. */
export function sentencedOf(raw: unknown): Sentenced | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.rule !== 'string' || typeof r.said !== 'string' || typeof r.body !== 'object' || r.body === null) return null;
  const l = r.looked as Record<string, unknown> | null | undefined;
  const looked =
    l && typeof l === 'object' && typeof l.runs === 'number' && typeof l.line === 'string'
      ? { days: typeof l.days === 'number' ? l.days : 30, runs: l.runs, atLeast: l.atLeast === true, sample: Array.isArray(l.sample) ? l.sample.filter((x): x is string => typeof x === 'string') : [], line: l.line }
      : null;
  return {
    rule: r.rule,
    said: r.said,
    by: r.by === 'model' ? 'model' : 'rules',
    body: r.body as Body,
    path: r.path === 'inline' ? 'inline' : 'run',
    looked,
    notes: Array.isArray(r.notes) ? r.notes.filter((x): x is string => typeof x === 'string') : [],
    parts: partsOf(r.parts),
  };
}

export type Proposal = { question: string; body_kind: 'change'; body: Record<string, unknown> };

export type Source = {
  /** Every automation, summarised, with no bodies. */
  automations(): Promise<Answer<AutomationRow[]>>;
  /** One, with its body and its last ten runs, or the page of runs before the run `before`. What the editor opens. */
  automation(rule: string, page?: { before?: string; limit?: number }): Promise<Answer<AutomationRow>>;
  run(rule: string): Promise<Answer<{ run: string }>>;
  cancel(run: string): Promise<Answer<{ run: string }>>;
  propose(p: Proposal): Promise<Answer<Filed>>;
  /** A sentence turned into the automation it means, read back, with a look over the last 30 days. Writes nothing. */
  sentence(sentence: string, rule?: string): Promise<Answer<Sentenced>>;
  /** What an inline body would do, before it is sent anywhere. It writes nothing, on the record or here. */
  dryRun(body: Body): Promise<Answer<Tried>>;
  /** Whether a body would install, or the install's own refusal with where in the body it is. Installs nothing. */
  check(body: Body): Promise<Answer<{ path: 'inline' | 'run' }>>;
  /**
   * A run body's steps taken over a sample by the real runner, with everything rolled back and nothing sent. With `one`,
   * the try stops after that step and uses the answers given for the steps before it.
   */
  attempt(body: Body, sample: Sample, one?: TryOne): Promise<Answer<TryRun>>;
  /** Turn one on or off: a new version, landed at once. ADMIN. */
  setEnabled(rule: string, enabled: boolean): Promise<Answer<Switched>>;
  /** Start a finished run again, as the rule is installed now. ADMIN. */
  retry(run: string): Promise<Answer<{ run: string }>>;
  /** One automation's versions, newest first, each with its body. */
  versions(rule: string): Promise<Answer<Version[]>>;
  /** Take one out of the record. Its runs and the rows it wrote stay. ADMIN. */
  retire(rule: string): Promise<Answer<unknown>>;
  /** Accept a suggestion this browser just filed, for the owner's one-press save. */
  accept(suggestion: string): Promise<Answer<unknown>>;
  /** The newest rows of one list, for a try's picker. */
  rows(register: string, now: number): Promise<Answer<Pickable[]>>;
  /** The newest arrivals, for a try's picker. An owner's read. */
  arrivals(now: number): Promise<Answer<Pickable[]>>;
  /** When each rule last signed a line of the log, by its bare id, from the newest page of it. */
  fired(): Promise<Answer<Map<string, string>>>;
};

/** How many rows or arrivals a try's picker offers. */
const PICKABLE = 10;

/** The reason the owner's one-press save gives Decide, which History keeps beside the accept. */
const SAVED_HERE = 'Saved from the automation editor.';

export function live(io: Fetch, base = ''): Source {
  return {
    automations: async () => {
      const out = await send<unknown>(io, `${base}/api/automations`);
      return out.ok ? { ok: true, value: rowsOf(out.value) } : out;
    },
    /* A READ TAKES ITS ARGUMENTS IN THE QUERY (`packages/host/src/index.ts`, `takes`), and `rule` is `text`, so the
       bare id goes as it is and comes back as the one automation or the record's DECLARATION_UNKNOWN. */
    automation: async (rule, page = {}) => {
      const query = new URLSearchParams({ rule: bare(rule) });
      if (page.before !== undefined) query.set('before', page.before);
      if (page.limit !== undefined) query.set('limit', String(page.limit));
      const out = await send<unknown>(io, `${base}/api/automations?${query.toString()}`);
      if (!out.ok) return out;
      const row = rowOf(out.value);
      return row ? { ok: true, value: row } : unreachable();
    },
    run: (rule) => send<{ run: string }>(io, `${base}/api/automationRun`, { rule: bare(rule) }),
    cancel: (run) => send<{ run: string }>(io, `${base}/api/cancelRun`, { run }),
    propose: async (p) => {
      const out = await send<{ id?: unknown }>(io, `${base}/api/propose`, p);
      return out.ok ? { ok: true, value: { id: typeof out.value?.id === 'string' ? out.value.id : null } } : out;
    },
    sentence: async (sentence, rule) => {
      const out = await send<unknown>(io, `${base}/api/automationSentence`, { sentence, ...(rule === undefined ? {} : { rule }) });
      if (!out.ok) return out;
      const got = sentencedOf(out.value);
      return got ? { ok: true, value: got } : unreachable();
    },
    /* A GET WITH THE BODY AS JSON IN `rule`. The route is `writes: false`, and its table types `rule` as `json`, so the
       GET branch of `serveApi` (`packages/host/src/index.ts`) `JSON.parse`s that one value and hands every other query
       value on as the text it was sent as. `automation` above sends its `rule` as a bare id because there it is `text`;
       the same name is a different type on the two routes, which is why this was read and not assumed. */
    dryRun: async (body) => {
      const out = await send<unknown>(io, `${base}/api/dryRun?${new URLSearchParams({ rule: JSON.stringify(body) }).toString()}`);
      if (!out.ok) return out;
      const tried = triedOf(out.value);
      return tried ? { ok: true, value: tried } : unreachable();
    },
    /* `checkAutomation` AND `tryAutomation` ARE ROUTED AS WRITES for `previewPage`'s reason (a body is no query
       string), so both are a POST with the body whole, though neither keeps anything. */
    check: async (body) => {
      const out = await send<{ path?: unknown }>(io, `${base}/api/checkAutomation`, { body });
      return out.ok ? { ok: true, value: { path: out.value?.path === 'inline' ? 'inline' : 'run' } } : out;
    },
    /* ONE STEP GOES AS `step` AND `given` BESIDE THE BODY, the names the record's `tryAutomation` takes them by; a
       whole try sends neither, so it is the call it always was. */
    attempt: async (body, sample, one) => {
      const asked = one === undefined ? { body, sample } : { body, sample, step: one.step, ...(one.given === undefined ? {} : { given: one.given }) };
      const out = await send<unknown>(io, `${base}/api/tryAutomation`, asked);
      if (!out.ok) return out;
      const tried = tryRunOf(out.value);
      return tried ? { ok: true, value: one === undefined ? tried : { ...tried, step: one.step } } : unreachable();
    },
    setEnabled: async (rule, enabled) => {
      const out = await send<{ version?: unknown; enabled?: unknown }>(io, `${base}/api/setAutomation`, { rule: bare(rule), enabled });
      if (!out.ok) return out;
      return { ok: true, value: { version: typeof out.value?.version === 'number' ? out.value.version : 0, enabled: out.value?.enabled === true } };
    },
    retry: (run) => send<{ run: string }>(io, `${base}/api/retryRun`, { run }),
    versions: async (rule) => {
      const out = await send<unknown>(io, `${base}/api/automationVersions?${new URLSearchParams({ rule: bare(rule) }).toString()}`);
      return out.ok ? { ok: true, value: versionsOf(out.value) } : out;
    },
    retire: (rule) => send<unknown>(io, `${base}/api/retireDeclaration`, { id: `rule.${bare(rule)}` }),
    accept: (suggestion) => send<unknown>(io, `${base}/api/decide`, { id: suggestion, decide: { option: 'accept', reason: SAVED_HERE } }),
    rows: async (register, now) => {
      const out = await send<{ rows?: unknown }>(io, `${base}/api/list?${new URLSearchParams({ register, limit: String(PICKABLE) }).toString()}`);
      if (!out.ok) return out;
      const rows = Array.isArray(out.value?.rows) ? out.value.rows : [];
      return { ok: true, value: rows.map((r) => pickableRow(r, now)).filter((x): x is Pickable => x !== null) };
    },
    arrivals: async (now) => {
      const out = await send<{ arrivals?: unknown }>(io, `${base}/api/inbox?${new URLSearchParams({ limit: String(PICKABLE) }).toString()}`);
      if (!out.ok) return out;
      const lines = Array.isArray(out.value?.arrivals) ? out.value.arrivals : [];
      return { ok: true, value: lines.map((a) => pickableArrival(a, now)).filter((x): x is Pickable => x !== null) };
    },
    fired: async () => {
      const out = await send<unknown>(io, `${base}/api/recentHistory?${new URLSearchParams({ limit: String(FIRED_PAGE) }).toString()}`);
      return out.ok ? { ok: true, value: firedOf(out.value) } : out;
    },
  };
}

/** What a screen draws from the first read: the rows, no list at all, or the record's fix. */
export type Opened = { source: Source; first: Answer<AutomationRow[]>; absent: boolean };

/**
 * The record's automations, and whether it has the read at all.
 *
 * IT TOOK THE SAMPLE'S CLOCK AS A THIRD ARGUMENT, and a sample was kept for the tab so the list and the editor agreed
 * about a flow that had been filed nowhere. Nothing read it once the sample went, and no caller passes it now.
 */
export async function openAutomations(io: Fetch, base = '', opts: { acted?: boolean } = {}): Promise<Opened> {
  const source = live(io, base);
  const first = await source.automations();
  /* THE LOG IS ASKED ONLY BY A SCREEN THAT SAYS WHEN EACH LAST RAN (`acted`), and only when some turned-on row came
     with no last run to say. A log that will not read leaves the rows as they came: the list is the screen, and a row
     then says nothing about its last turn rather than something untrue. */
  if (opts.acted && first.ok && first.value.some((r) => r.enabled && r.last === null && r.acted === undefined)) {
    const fired = await source.fired();
    if (fired.ok) return { source, first: { ok: true, value: withFired(first.value, fired.value) }, absent: false };
  }
  return { source, first, absent: !first.ok && first.refusal.code === 'ROUTE_UNKNOWN' };
}
