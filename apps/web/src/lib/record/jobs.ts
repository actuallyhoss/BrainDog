/**
 * Jobs in the app: the list at `/jobs`, starting a run of an approved kind, one
 * run's transcript at `/jobs/<id>` while it runs and after, and a `job.<id>` change as Decide draws it.
 *
 * FOUR METHODS AND NOTHING NEW ON THE RECORD. `listJobs` answers the runs newest first, `createJob` starts one,
 * `cancelJob` stops one and `jobEvents` answers a run's lines after the last one a screen holds, which the run's screen
 * asks every `POLL_MS` while the run is live and never once it has ended.
 *
 * THE KINDS ARE THE APPROVED CHANGES THAT INSTALLED THEM. No method answers the installed `job` declarations, so "Run a
 * job" reads the `change` proposals the owner accepted, newest first, and keeps the newest body of each `job.<id>`
 * (`kindsIn`). A kind retired since is still offered until a run of it shows its title gone (`JobRow.title` is `null`
 * for a kind no longer installed), and `createJob` refuses one in the record's own sentence either way.
 *
 * THE TRANSCRIPT IS THE RUNNER'S DISTILLATION, drawn as it came (`distil` in `apps/cli/src/runner.ts`): a tool call and
 * its result carry one number, `call`, so the result folds onto its call's row, and every text arrives cut to a head
 * with its whole length beside it, which the row says rather than hiding.
 *
 * PURE, for the reason `actions.ts` gives: `node --test` cannot import a `.svelte.ts` file, and Decide's `proposed.ts`
 * draws a kind's card from here. The clock is an argument.
 */

import { since } from 'braindog-render';
import { createClient, type ClientOptions } from '@braindog/client';
import { commandOf, JOB_MCP_PREFIX, type Cancelled, type JobEvent, type JobEvents, type JobRow, type JobsPage } from '@braindog/kernel';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** What a client call answers, as `lib/data/read.ts` takes it. */
export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string; detail?: string | undefined } } | { ok: false; conflict: unknown };

export type JobStatus = JobRow['status'];
export type { JobEvent, JobRow };

/** How often a live run's screen asks for its next lines. */
export const POLL_MS = 700;
/** How often the list asks again while a run on it is live, so a run that ends is seen to end without a reload. */
export const LIST_POLL_MS = 5_000;
/** The most lines one `jobEvents` answer holds (`JOB_EVENTS_PAGE` in the kernel): a full page means more are waiting. */
export const EVENTS_PAGE = 500;
/** How many runs the list asks for at a time. */
const JOBS_PAGE = 50;
/** How many decided proposals one read of the kinds asks for at a time, and how many such pages it walks at most. */
const KIND_PAGE = 200;
const KIND_PAGES = 3;
/** How many pages of runs the run's screen walks to find its own title and machine. Past them the header names none. */
const FIND_PAGES = 4;
const FIND_PAGE = 200;

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const clientOf = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/* ── where a run stands ─────────────────────────────────────────────────── */

const LIVE: ReadonlySet<string> = new Set(['queued', 'claimed']);

/** A run waiting for a machine or running on one: the two states the queue holds a job in. */
export const isLive = (status: string): boolean => LIVE.has(status);

export type Tone = 'good' | 'warn' | 'bad' | 'info' | null;

/**
 * A status as a person reads it, and its intent.
 *
 * RUNNING IS `info` AND DONE CARRIES NO COLOUR: a run that finished is the normal outcome, and the
 * colours are kept for what needs a look (ran out of turns, interrupted, waiting on a decision) and what failed.
 */
export function statusOf(status: string, lost = false, cancel = false): { word: string; tone: Tone } {
  if (isLive(status) && cancel) return { word: words.stopping, tone: 'warn' };
  if (status === 'claimed' && lost) return { word: words.lost, tone: 'warn' };
  const said: Record<string, { word: string; tone: Tone }> = {
    queued: { word: words.queued, tone: null },
    claimed: { word: words.running, tone: 'info' },
    ok: { word: words.ok, tone: null },
    needs_decision: { word: words.needsDecision, tone: 'warn' },
    refused: { word: words.refused, tone: 'bad' },
    limit: { word: words.limit, tone: 'warn' },
    error: { word: words.error, tone: 'bad' },
    interrupted: { word: words.interrupted, tone: 'warn' },
    cancelled: { word: words.cancelled, tone: null },
  };
  return Object.hasOwn(said, status) ? (said[status] ?? { word: status, tone: null }) : { word: status, tone: null };
}

/** How long a run took, as a person says it: "45s", "3m 12s", "1h 4m". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** A kind's own words for itself: `job.weekly_review` reads "weekly review". */
export const kindWords = (kind: string): string => kind.replace(/^job\./u, '').replace(/[_-]+/gu, ' ');

/** What a run is called: its kind's title, or the kind's own words once the kind is retired and its title gone. */
export const runName = (row: Pick<JobRow, 'title' | 'kind'>): string => row.title ?? kindWords(row.kind);

/** When a run started: when a machine took it, or when it was asked for while none has. */
export const startedAt = (row: Pick<JobRow, 'claimed_at' | 'created_at'>): string => row.claimed_at ?? row.created_at;

/* ── the list ───────────────────────────────────────────────────────────── */

/** One page of runs, newest first; `cursor` is the one the page above answered with. */
export async function readJobs(base: string, cursor: string | null = null, io?: Fetch): Promise<Answer<JobsPage>> {
  return clientOf(base, io).listJobs({ limit: JOBS_PAGE, ...(cursor === null ? {} : { cursor }) });
}

/**
 * The runs as the list draws them: those for one repository when the address names one, the live ones on top, and
 * the rest in the record's order, which is newest first.
 */
export function ordered(rows: readonly JobRow[], repo: string | null): JobRow[] {
  const mine = repo === null ? [...rows] : rows.filter((r) => r.repo === repo);
  return [...mine.filter((r) => isLive(r.status)), ...mine.filter((r) => !isLive(r.status))];
}

/** Two pages, joined, with a run on both kept once: a run that started between the reads moves every row down one. */
export function joined(older: readonly JobRow[], newer: readonly JobRow[]): JobRow[] {
  const seen = new Set(older.map((r) => r.id));
  return [...older, ...newer.filter((r) => !seen.has(r.id))];
}

/* ── the kinds a run can be started from ────────────────────────────────── */

/** One approved kind, as "Run a job" offers it. */
export type JobKind = { id: string; title: string; repo: string | null; args: { id: string; label: string; max: number }[]; writes: boolean };

/** The declarations one proposal body carries: one, or several under `to.declarations`. */
function declarationsIn(body: Record<string, unknown>): Record<string, unknown>[] {
  const to = body.to;
  if (isRow(to) && Array.isArray(to.declarations)) return to.declarations.filter(isRow);
  return isRow(to) ? [to] : [];
}

/** One `job` declaration as a kind, or `null` for one that does not read as a kind the record would install. */
function kindOf(decl: Record<string, unknown>): JobKind | null {
  const id = text(decl.id);
  const body = isRow(decl.body) ? decl.body : null;
  if (decl.kind !== 'job' || !id.startsWith('job.') || body === null) return null;
  const args = (Array.isArray(body.args) ? body.args : []).filter(isRow).flatMap((a) => {
    const arg = text(a.id);
    const max = count(a.max);
    return arg === '' ? [] : [{ id: arg, label: text(a.label) || kindWords(arg), max: max ?? 64 }];
  });
  return { id, title: text(body.title) || kindWords(id), repo: text(body.repo) || null, args, writes: body.writes === true };
}

/**
 * The kinds the owner approved, newest body of each first, read from decided proposals newest first.
 *
 * ONLY A `change` ACCEPTED AND APPLIED: a suggestion resolved as `addressed` is one whose change landed; one resolved
 * `wont-fix` or `incorrect` was turned down, and its kind was never installed.
 */
export function kindsIn(rows: readonly Record<string, unknown>[], retired: ReadonlySet<string> = new Set()): JobKind[] {
  const out = new Map<string, JobKind>();
  for (const row of rows) {
    if (row.body_kind !== 'change' || row.resolved_as !== 'addressed' || !isRow(row.body)) continue;
    for (const decl of declarationsIn(row.body)) {
      const kind = kindOf(decl);
      if (kind && !out.has(kind.id) && !retired.has(kind.id)) out.set(kind.id, kind);
    }
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** The kinds a run of which says its kind is gone: the newest run of each kind decides. */
export function retiredIn(rows: readonly JobRow[]): Set<string> {
  const seen = new Set<string>();
  const gone = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.kind)) continue;
    seen.add(r.kind);
    if (r.title === null) gone.add(r.kind);
  }
  return gone;
}

/** Every kind "Run a job" offers, from the decided proposals a few pages deep. */
export async function readKinds(base: string, runs: readonly JobRow[], io?: Fetch): Promise<Answer<JobKind[]>> {
  const client = clientOf(base, io);
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let n = 0; n < KIND_PAGES; n += 1) {
    const page = await client.governance({ register: 'suggestion', status: 'resolved', limit: KIND_PAGE, ...(cursor ? { cursor } : {}) });
    if (!page.ok) return page;
    const got = Array.isArray(page.value) ? page.value.filter(isRow) : [];
    rows.push(...got);
    const last = got.at(-1)?.id;
    cursor = got.length >= KIND_PAGE && typeof last === 'string' && last !== cursor ? last : null;
    if (cursor === null) break;
  }
  return { ok: true, value: kindsIn(rows, retiredIn(runs)) };
}

/** The values a person typed for a kind's arguments, trimmed, with every one the kind names and nothing else. */
export function argsFor(kind: JobKind, typed: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of kind.args) out[a.id] = (Object.hasOwn(typed, a.id) ? (typed[a.id] ?? '') : '').trim();
  return out;
}

/** Start one run of a kind; `about` is the spoken id of the row it is for (a project's), which the record checks. */
export async function startJob(base: string, kind: string, args: Record<string, string>, io?: Fetch, about?: string): Promise<Answer<{ id: string }>> {
  return clientOf(base, io).createJob({ kind, args, ...(about ? { about } : {}) });
}

/** Stop one run: at once while it waits, by a flag its machine reads while it runs. */
export async function stopJob(base: string, id: string, io?: Fetch): Promise<Answer<Cancelled>> {
  return clientOf(base, io).cancelJob({ id });
}

/* ── one run ────────────────────────────────────────────────────────────── */

/** A run's lines after `after`, and where it stands now. */
export async function readEvents(base: string, id: string, after: number, io?: Fetch): Promise<Answer<JobEvents>> {
  return clientOf(base, io).jobEvents({ id, after });
}

/**
 * The run itself, for its title, machine and times, found by walking the list a few pages deep.
 *
 * NO METHOD ANSWERS ONE JOB BY ITS ID, and `jobEvents` answers its lines and status but not what it is. A run older than
 * the pages walked is drawn under its status alone, and its transcript is whole either way.
 */
export async function findJob(base: string, id: string, io?: Fetch): Promise<JobRow | null> {
  const client = clientOf(base, io);
  let cursor: string | null = null;
  for (let n = 0; n < FIND_PAGES; n += 1) {
    const page = await client.listJobs({ limit: FIND_PAGE, ...(cursor === null ? {} : { cursor }) });
    if (!page.ok) return null;
    const hit = page.value.jobs.find((j) => j.id === id);
    if (hit) return hit;
    cursor = page.value.cursor;
    if (cursor === null) return null;
  }
  return null;
}

/** The refusal `jobEvents` answers for an id naming no run (`NO_SUCH_JOB` in the kernel). */
export const isMissing = (got: Answer<unknown>): boolean => !got.ok && 'refusal' in got && got.refusal.code === 'REF_UNKNOWN';

/** One row of the transcript. A tool row carries its result folded onto it once the result has come. */
export type Step = {
  seq: number;
  kind: JobEvent['kind'];
  /** The prose, or a tool's input as it was called. */
  text: string;
  /** How many characters the whole text had, when the runner sent only its head. */
  cut: number | null;
  tool: { name: string; out: { text: string; cut: number | null; failed: boolean } | null } | null;
  /** How the run ended, on an `end` row. */
  status: JobStatus | null;
};

/** The whole length beside a head, when the head is shorter than it. */
const cutOf = (body: Record<string, unknown>, head: string): number | null => {
  const len = count(body.len);
  return len !== null && len > head.length ? len : null;
};

/** A tool's name as the transcript says it: the record's own tools without their prefix, the rest as Claude Code named them. */
export const toolName = (name: string): string => (name.startsWith(JOB_MCP_PREFIX) ? name.slice(JOB_MCP_PREFIX.length).replace(/_/gu, ' ') : name);

/** One line of the end, from its body: how it ended, in how many turns and how long, and why when it failed. */
function endLine(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const turns = count(body.turns);
  const ms = count(body.ms);
  if (turns !== null) parts.push(words.turns(turns));
  if (ms !== null) parts.push(duration(ms));
  const why = text(body.error);
  return [parts.join(', '), why].filter((p) => p !== '').join('. ');
}

/**
 * A run's lines as the rows its screen draws, in order: each `out` folded onto the `tool` that has its `call`, and one
 * with no such call drawn as a row of its own, so nothing the run said is dropped.
 */
export function transcriptOf(events: readonly JobEvent[]): Step[] {
  const steps: Step[] = [];
  const byCall = new Map<number, Step>();
  for (const e of events) {
    const body = isRow(e.body) ? e.body : {};
    if (e.kind === 'out') {
      const call = count(body.call);
      const at = call === null ? undefined : byCall.get(call);
      const said = text(body.text);
      const out = { text: said, cut: cutOf(body, said), failed: body.error === true };
      if (at?.tool && at.tool.out === null) {
        at.tool.out = out;
        continue;
      }
      steps.push({ seq: e.seq, kind: 'out', text: said, cut: out.cut, tool: null, status: null });
      continue;
    }
    if (e.kind === 'tool') {
      const input = text(body.input);
      const step: Step = { seq: e.seq, kind: 'tool', text: input, cut: cutOf(body, input), tool: { name: toolName(text(body.name)), out: null }, status: null };
      const call = count(body.call);
      if (call !== null) byCall.set(call, step);
      steps.push(step);
      continue;
    }
    if (e.kind === 'start') {
      const model = text(body.model);
      steps.push({ seq: e.seq, kind: 'start', text: words.startedOn(model, count(body.tools)), cut: null, tool: null, status: null });
      continue;
    }
    if (e.kind === 'limit') {
      steps.push({ seq: e.seq, kind: 'limit', text: words.limitAt(count(body.turns)), cut: null, tool: null, status: null });
      continue;
    }
    if (e.kind === 'end') {
      const status = typeof body.status === 'string' ? (body.status as JobStatus) : null;
      steps.push({ seq: e.seq, kind: 'end', text: endLine(body), cut: null, tool: null, status });
      continue;
    }
    const said = text(body.text);
    steps.push({ seq: e.seq, kind: e.kind, text: said, cut: cutOf(body, said), tool: null, status: null });
  }
  return steps;
}

/**
 * The status the header draws: the last line's, when the last line says how the run ended, else the record's.
 *
 * THE LAST LINE FIRST, because the header reads what the transcript under it says, and an `end` row
 * saying "Done" under a header still saying "Running" for one poll is a screen contradicting itself.
 */
export function headerStatus(steps: readonly Step[], answered: JobStatus): JobStatus {
  const last = steps.at(-1);
  if (last?.kind === 'end' && last.status !== null) return last.status;
  if (last?.kind === 'limit' && isLive(answered)) return 'limit';
  return answered;
}

/* ── a kind, as Decide draws it ─────────────────────────────────────────── */

/**
 * One tool a kind names, in plain words: "read files", "search", "run git log".
 *
 * THE WORDS SAY WHAT THE TOOL LETS A RUN DO ON HIS MACHINE, which is the thing he approves; the names are Claude Code's,
 * and `Bash(git log:*)` is a pattern nobody should have to read to know it runs `git log`.
 */
export function toolWords(tool: string): string {
  if (tool === 'Read') return words.toolRead;
  if (tool === 'Grep') return words.toolGrep;
  if (tool === 'Glob') return words.toolGlob;
  const command = commandOf(tool);
  if (command !== null) return words.toolRun(command);
  if (tool.startsWith(JOB_MCP_PREFIX)) return words.toolRecord(toolName(tool));
  return tool;
}

/** A kind's permission mode, in plain words. */
export const permissionWords = (mode: unknown): string =>
  mode === 'acceptEdits' ? words.permissionEdits : mode === 'dontAsk' ? words.permissionAsk : words.permissionUnknown(text(mode));

/** The lines Decide draws for a `job.<id>` change, and whether the run it approves writes files. */
export function kindLines(body: Record<string, unknown>): { label: string; value: string; tone?: 'bad' }[] {
  const tools = (Array.isArray(body.tools) ? body.tools : []).filter((t): t is string => typeof t === 'string');
  const args = (Array.isArray(body.args) ? body.args : []).filter(isRow).map((a) => text(a.label) || kindWords(text(a.id)));
  const turns = count(body.turns);
  const lines: { label: string; value: string; tone?: 'bad' }[] = [
    { label: words.prompt, value: text(body.prompt) },
    { label: words.tools, value: tools.length ? tools.map(toolWords).join(', ') : words.noTools },
    { label: words.repo, value: text(body.repo) || words.noRepo },
    { label: words.permission, value: permissionWords(body.permission) },
  ];
  if (turns !== null) lines.push({ label: words.turnsLabel, value: words.turnsMost(turns) });
  if (args.length) lines.push({ label: words.asks, value: args.join(', ') });
  /* A RUN THAT CHANGES FILES IS SAID IN RED, and said whether or not it names a repository, since a run in an empty
     folder that writes still runs the commands it names. */
  if (body.writes === true) lines.push({ label: words.writesLabel, value: words.writes(text(body.repo) || null), tone: 'bad' });
  return lines;
}

/* ── whether a machine is listening ─────────────────────────────────────── */

/** How often the Jobs screen asks again which machines are listening, while it is open and in view. */
export const HEARD_POLL_MS = 20_000;
/**
 * HOW RECENTLY A MACHINE MUST HAVE BEEN HEARD TO BE LISTENING. A runner asks for work while it holds its claim, which is
 * held 20 seconds (`apps/cli/src/runner.ts`), and every call it makes stamps its grant's `last_used`; twice that leaves
 * room for one late ask without saying a waiting machine has gone.
 */
export const LISTEN_MS = 40_000;

/**
 * Whether a machine will take a job now, from when its grant was last used (`seen`), read against `now`.
 *
 * LISTENING SAYS NOTHING MORE, and a machine heard longer ago says when ("Last heard 3 days ago"). A machine never heard
 * at all answers `heard: null`, so the screen says how it was enrolled instead. A stamp a little ahead of this browser's
 * clock is a machine heard just now, not one heard in the future.
 */
export function listeningOf(machine: { seen: string | null }, now: number): { listening: boolean; heard: string | null } {
  const { seen } = machine;
  const t = seen === null ? Number.NaN : Date.parse(seen);
  if (seen === null || !Number.isFinite(t)) return { listening: false, heard: null };
  if (now - t <= LISTEN_MS) return { listening: true, heard: null };
  return { listening: false, heard: words.lastHeard(since(seen, now)) };
}

/** Whether any of these machines will take a job now. */
export const anyListening = (machines: readonly { seen: string | null }[], now: number): boolean =>
  machines.some((m) => listeningOf(m, now).listening);

/* ── words ──────────────────────────────────────────────────────────────── */

export const words = {
  heading: 'Jobs',
  headingFor: (repo: string) => `Jobs for ${repo}`,
  allJobs: 'All jobs',
  run: 'Run a job',
  none: 'No jobs have run yet',
  noneFor: (repo: string) => `No jobs have run in ${repo} yet`,
  older: 'Show older jobs',
  /* The list's columns, which label each fact on a card too. */
  kind: 'Job',
  status: 'Status',
  machine: 'Machine',
  started: 'Started',
  turnsLabel: 'Turns',
  took: 'Time',
  noMachine: 'No machine yet',
  /* Where a run stands. */
  queued: 'Waiting for a machine',
  running: 'Running',
  stopping: 'Stopping',
  lost: 'Not heard from in a minute',
  ok: 'Done',
  needsDecision: 'Needs your decision',
  refused: 'Refused',
  limit: 'Ran out of turns',
  error: 'Failed',
  interrupted: 'Interrupted',
  cancelled: 'Stopped',
  /* Starting one. */
  pick: 'Which job',
  noKinds: 'No job kinds are approved yet. An agent proposes one, with its prompt and the tools it may use, and you approve it in Needs you.',
  start: (title: string) => `Run ${title}`,
  startAny: 'Run',
  inRepo: (repo: string) => `Runs in ${repo}`,
  inNoRepo: 'Runs in an empty folder',
  writesShort: 'Changes files',
  startedToast: (title: string) => `${title} is waiting for a machine.`,
  nobodyListening: 'No machine is listening. The job waits up to a day.',
  /* Whether a machine is listening. */
  listening: 'Listening',
  lastHeard: (ago: string) => `Last heard ${ago}`,
  /* One run. */
  run1: 'Run',
  noSuchWhy: 'It may have been from another record, or the link may be wrong.',
  cancel: 'Stop this run',
  cancelling: 'Stopping this run',
  empty: 'Nothing yet. The first lines appear here when a machine takes the run.',
  thinking: 'Thinking',
  result: 'Result',
  failed: 'Failed',
  cutAt: (len: number) => `Cut short: the whole was ${len.toLocaleString('en-GB')} characters.`,
  startedOn: (model: string, tools: number | null) =>
    model !== '' ? (tools !== null ? `Started on ${model}, with ${tools} tools.` : `Started on ${model}.`) : 'Started.',
  limitAt: (turns: number | null) => (turns !== null ? `Stopped at its limit of ${turns} turns.` : 'Stopped at its limit of turns.'),
  turns: (n: number) => (n === 1 ? '1 turn' : `${n} turns`),
  args: 'Asked with',
  /* A kind, in Decide. */
  prompt: 'Asks Claude',
  tools: 'May',
  noTools: 'Use no tools',
  repo: 'Works in',
  noRepo: 'An empty folder, not one of your repositories',
  permission: 'Permission',
  permissionAsk: 'Only the tools above, and nothing it would have to ask for',
  permissionEdits: 'The tools above, and it edits files without asking',
  permissionUnknown: (mode: string) => `${mode}, which a run refuses`,
  turnsMost: (n: number) => (n === 1 ? 'At most 1 turn' : `At most ${n} turns`),
  asks: 'You fill in',
  writesLabel: 'Writes',
  writes: (repo: string | null) => (repo ? `It changes files in ${repo}.` : 'It changes files.'),
  toolRead: 'read files',
  toolGrep: 'search',
  toolGlob: 'find files',
  toolRun: (command: string) => `run ${command}`,
  toolRecord: (tool: string) => `${tool} on this record`,
};
