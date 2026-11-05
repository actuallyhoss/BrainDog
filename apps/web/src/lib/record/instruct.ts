/**
 * The Agents page's control room, the host's half (agents and MCP plan §2, §4.4, §7.1): what the record says about the
 * runs open now (`presence`) and what he told agents (`instructionList`), worded for the three parts braindog-render
 * draws (`Instruct`, `Presence`, `Instructions`), and the writes behind each press (`instruct`, `withdrawInstruction`,
 * and Undo all over the receipts).
 *
 * EVERY WORD A PERSON READS IS MADE HERE, ONCE. The renderer draws strings; a run's handle (`S883`) and a project's
 * (`things#1`) are keys handed back to a press and never a word on the screen: a run is its agent and its project
 * ("Claude on Kiln"), a project its name.
 *
 * ON A MACHINE, AS A PROFILE (migration 44). Where his runs are on more than one machine or under more than one Claude
 * Code profile, the composer offers each by name ("Machine", "Profile"), from the runs he is shown and his Profiles and
 * Places (`instructionList`'s `places`); an instruction to anyone but a named run then reaches only the runs there.
 *
 * SAID HONESTLY, PATH BY PATH (§2.3, §2.4). What happens next is said for the run it will reach: Claude Code with our
 * hooks sees an instruction within about 15 seconds, at its next step, and is stopped at its next tool
 * call; an agent without them (`reach: next_call`) sees it and is stopped only at its next BrainDog call, and keeps
 * editing until then. The record says which (`presence.reach`), so this file never guesses from the agent's name.
 *
 * PURE BUT FOR `control` (the client calls) and `undoAll`, so node reads every sentence in `instruct.test.ts`.
 */

import { createClient } from '@braindog/client';
import { DEVICES, onMachine } from '@braindog/kernel';
import type { InstructChoice, InstructView, PresenceView, ThreadReceipts, ThreadStep, ThreadView } from 'braindog-render/svelte';

import { AGENT_NAMES } from './names.ts';
import { REGISTERS } from './held.ts';
import { slotOf } from '../ui/face.ts';
import { undoChange } from './undo-write.ts';
import { machineSaid } from './machine-name.ts';
import type { Fetch } from './boot-live.ts';
import { rowsOf as tabRows } from '../data/ref-rows.ts';

/* ── what the record answers ────────────────────────────────────────────── */

/** One run open now, as `presence` answers it (`PresenceRow` in `packages/record/src/methods/agents.ts`). */
export type LiveRun = {
  run: string;
  name: string | null;
  agent: string | null;
  machine: string | null;
  /** The Claude Code profile it runs under, by name; absent from a host older than migration 44. */
  seat?: string | null;
  project: string | null;
  repo: string | null;
  worktree: string | null;
  branch: string | null;
  doing: string | null;
  state: 'working' | 'thinking' | 'waiting' | 'ended' | 'gone';
  instruction: string | null;
  task: string | null;
  stopped: 'stop' | 'pause' | null;
  helpers: string[];
  parent: string | null;
  for_s: number;
  heard_s: number;
  /** Seconds since its last call; absent from a host older than the Agents page of 23 October, `null` before any call. */
  quiet_s?: number | null;
  reach: 'hooks' | 'next_call';
  /** Its key proves the app it says it is; absent from a host older than 24 October. */
  verified?: boolean;
  /**
   * The app its client says it is ("Claude Code"), the folder it opened in, how many writes it made, the question it
   * asked that still waits, and whether its key only reads; each absent from a host older than 27 October.
   */
  app?: string | null;
  cwd?: string | null;
  wrote?: number | null;
  asked?: string | null;
  looks?: boolean;
};

export type SeenHow = 'start' | 'prompt' | 'tool' | 'channel' | 'job' | 'asked';
export type InstrState = 'sent' | 'seen' | 'working' | 'done' | 'needs_you' | 'declined' | 'expired' | 'withdrawn';

/** What a run changed while it held an instruction (`Receipts` in `methods/instructions.ts`). */
export type Receipts = {
  run: string;
  batches: { batch: string; at: string; changes: number; rows: string[]; names: string[] }[];
  changes: number;
  head_before: string | null;
  head_after: string | null;
};

/** One thread of `instructionList`. */
export type Thread = {
  id: string;
  said: string;
  kind: 'tell' | 'stop' | 'pause' | 'resume' | 'redirect';
  when: 'now' | 'next';
  to: 'run' | 'agent' | 'anyone' | 'task';
  to_run: string | null;
  to_agent: string | null;
  project: string | null;
  task: string | null;
  /** The machine and the profile it was aimed at, by name; absent from a host older than migration 44. */
  machine?: string | null;
  seat?: string | null;
  state: InstrState;
  seen_by: string | null;
  seen_how: SeenHow | null;
  seen_at: string | null;
  taken_by: string | null;
  taken_at: string | null;
  reply: string | null;
  replied_at: string | null;
  expires_at: string | null;
  at: string;
  updated_at: string;
  seen: { run: string; how: SeenHow; at: string }[];
  receipts: Receipts | null;
  /** The questions it lets the run that takes it answer, with his answer, and the ones answered; absent from an older host. */
  answers?: { question: string; option: string }[];
  answered?: string[];
};

/** A run the page knows by handle: its agent kind, project and branch, read from presence or its own row. */
export type RunKnown = { agent: string | null; project: string | null; branch: string | null };

/** A project as the composer offers it: its handle as runs hold it (`things#1`), its name and its stored hue. */
export type Project = { key: string; name: string; hue: number | null };

/** The machines and Claude Code profiles the composer may offer, by name (`Places` in `methods/instructions.ts`). */
export type Places = {
  machines: string[];
  seats: string[];
  /**
   * The kinds of agent his runs were heard as lately (`claude`, `codex`), or `null` from a host older than the list, which
   * then offers every kind as before. Tell offers these and the ones at work now, and never Gemini, Copilot or Windsurf
   * on a record none of them has ever reached (audit 6g, AG27).
   */
  agents: string[] | null;
};

export const NO_PLACES: Places = { machines: [], seats: [], agents: null };

/** What a host answered for `places`, kept to names and nothing else. */
export function placesFrom(v: unknown): Places {
  const names = (x: unknown): string[] => (Array.isArray(x) ? x.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => n.trim()) : []);
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  return { machines: names(o.machines), seats: names(o.seats), agents: Array.isArray(o.agents) ? names(o.agents) : null };
}

/* ── the words ──────────────────────────────────────────────────────────── */

/** The kinds of agent "To" offers, in the order a person meets them. */
export const AGENT_KINDS = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'windsurf'] as const;

/** How long a "next start" instruction waits, the kernel's `WAIT_MS`, said in days. */
export const WAIT_DAYS = 14;

export const controlWords = {
  anyone: 'Any agent',
  anywhere: 'Any project',
  anyMachine: 'Any machine',
  anyProfile: 'Any profile',
  aRun: 'An agent',
  saidNothing: 'Has not said what it is doing',
  aTask: 'A task',
  now: 'now',
  next: 'next start',
  empty: 'Say what the agent should do.',
  stopSaid: 'Stop where you are.',
  pauseSaid: 'Hold here until I resume you.',
  resumeSaid: 'Carry on.',
  kind: { stop: 'Stop', pause: 'Pause', resume: 'Resume', redirect: 'Redirect', tell: '' } as const,
  how: {
    start: 'when it started',
    prompt: 'on its next prompt',
    tool: 'in a BrainDog answer',
    channel: 'straight away, by channel',
    job: 'when its job started',
    asked: 'when it asked',
  } as Record<SeenHow, string>,
} as const;

/** An agent kind by its name ("Claude"), or `null` for none. */
export const agentNamed = (kind: string | null | undefined): string | null => (kind ? (AGENT_NAMES[kind] ?? null) : null);

const plural = (n: number, one: string, many = `${one}s`): string => `${String(n)} ${n === 1 ? one : many}`;

/** A stretch of time in words: "under a minute", "9 min", "3 h 20 min", "2 days". */
export function spanSaid(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${String(min)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 === 0 ? `${String(h)} h` : `${String(h)} h ${String(min % 60)} min`;
  return plural(Math.floor(h / 24), 'day');
}

/**
 * HOW LONG A RUN HAS BEEN AT IT, SHORT, for the end of a one-line row: "for 12 min", "for 3 h", "for 2 days", one unit
 * only, so a column of them reads at a glance; a run under a minute old is "just now".
 */
export function ageSaid(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60);
  if (min < 1) return 'just now';
  if (min < 60) return `for ${String(min)} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `for ${String(h)} h` : `for ${plural(Math.floor(h / 24), 'day')}`;
}

/** When something was last heard, from seconds ago: "just now", "3 min ago", "2 h ago". */
export function agoSaid(seconds: number): string {
  if (seconds < 60) return 'just now';
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${String(min)} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${String(h)} h ago` : `${plural(Math.floor(h / 24), 'day')} ago`;
}

/** A moment as a person reads it: "21:02" today, "3 Sep, 21:02" another day, in the record's zone. */
export function clockSaid(iso: string | null, now: number, zone?: string): string {
  if (iso === null) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const opts = zone ? { timeZone: zone } : {};
  const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { ...opts, year: 'numeric', month: 'numeric', day: 'numeric' }).format(ms);
  const time = new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  if (day(at) === day(now)) return time;
  return `${new Intl.DateTimeFormat('en-GB', { ...opts, day: 'numeric', month: 'short' }).format(at)}, ${time}`;
}

/** A project's name by its handle, or the handle's own words when the page has not read it. */
const projectName = (key: string | null, projects: ReadonlyMap<string, Project>): string | null =>
  key === null ? null : (projects.get(key)?.name ?? null);

/** A run by name: its agent, and where it works when that tells two apart ("Claude on Kiln"). */
export function runSaid(handle: string | null, runs: ReadonlyMap<string, RunKnown>, projects: ReadonlyMap<string, Project>, where = false): string {
  const known = handle === null ? undefined : runs.get(handle);
  const who = agentNamed(known?.agent) ?? controlWords.aRun;
  const on = where ? projectName(known?.project ?? null, projects) : null;
  return on ? `${who} on ${on}` : who;
}

/* ── the composer ───────────────────────────────────────────────────────── */

/**
 * What he chose in the composer: who it goes to (`anyone`, `agent:<kind>`, `run:<handle>`), on what, and when; and the
 * machine and the profile, by name, `''` or absent for any.
 */
export type Chosen = { to: string; on: string; when: 'now' | 'next' | null; machine?: string; seat?: string };

export const PICK_FIRST: Chosen = { to: 'anyone', on: '', when: null };

/** The lead runs open now, a helper folded under the run it works for, as "To" and the run rows list them. */
export const leadsOf = (rows: readonly LiveRun[]): LiveRun[] => rows.filter((r) => r.parent === null && r.state !== 'ended' && r.state !== 'gone');

/** Whether a run is at work: working or thinking, the record's own word for it, so an idle run is not. */
export const isAtWork = (r: LiveRun): boolean => r.state === 'working' || r.state === 'thinking';

/**
 * THE AGENTS AT WORK, AS THE RAIL COUNTS THEM: each run at work, a helper left out while the run it works for is at
 * work too (`atWork` in the record, `runs-working` in the kernel). So "12 at work" here is the rail's 12.
 */
export function atWorkOf(rows: readonly LiveRun[]): LiveRun[] {
  const working = rows.filter(isAtWork);
  const runs = new Set(working.map((r) => r.run));
  return working.filter((r) => r.parent === null || !runs.has(r.parent));
}

/** The runs open and not at work, waiting on him: an idle turn or a long silence, each counted once (`runs-waiting`). */
export function waitingOf(rows: readonly LiveRun[]): LiveRun[] {
  const open = new Set(rows.map((r) => r.run));
  return rows.filter((r) => r.state === 'waiting' && (r.parent === null || !open.has(r.parent)));
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * WHAT A RUN IS DOING, IN PLAIN WORDS, for the one line At work gives it: what it said, unless that is the name the
 * record gave it ("Claude Code in BrainDog", "Claude run", its repository), then where it works ("In braindog, on
 * master"), and else that it has not said. Never the agent's name again, which its mark already says.
 */
export function doingSaid(r: Pick<LiveRun, 'doing' | 'agent' | 'repo' | 'branch' | 'name'>): string {
  const doing = (r.doing ?? r.name ?? '').replace(/\s+/gu, ' ').trim();
  const who = agentNamed(r.agent);
  const own =
    doing === '' ||
    /^(?:an? )?agent run\b/iu.test(doing) ||
    onMachine(doing, 'Agent') ||
    (who !== null && new RegExp(`^${escaped(who)}(?: [A-Z][A-Za-z]*)?(?: on (?:${DEVICES.map(escaped).join('|')}))?$`, 'u').test(doing)) ||
    (who !== null && new RegExp(`^${escaped(who)}(?: [A-Z][A-Za-z]*)? (?:run\\b|in \\S+$)`, 'u').test(doing)) ||
    (r.repo !== null && (doing === r.repo || doing.startsWith(`${r.repo} on `)));
  if (!own) return doing;
  if (r.repo) return r.branch ? `In ${r.repo}, on ${r.branch}` : `In ${r.repo}`;
  return controlWords.saidNothing;
}

/** How a run on At work stands, in a few words: working now, quiet for 40 min, or held by him. */
export function standsSaid(r: Pick<LiveRun, 'state' | 'stopped' | 'quiet_s'>): string {
  if (r.stopped === 'stop') return 'Stopped by you';
  if (r.stopped === 'pause') return 'Paused by you';
  if (r.state === 'working' || r.state === 'thinking') return 'Working now';
  return typeof r.quiet_s === 'number' ? `Quiet for ${spanSaid(r.quiet_s * 1000)}` : 'Waiting on you';
}

/** The runs at work grouped by the machine each is on, the busiest first, a run naming none under `null`. */
export function byMachine(rows: readonly LiveRun[]): { machine: string | null; rows: LiveRun[] }[] {
  const groups = new Map<string | null, LiveRun[]>();
  for (const r of rows) groups.set(r.machine, [...(groups.get(r.machine) ?? []), r]);
  return [...groups.entries()]
    .map(([machine, rs]) => ({ machine, rows: rs }))
    .sort((a, b) => b.rows.length - a.rows.length || (a.machine ?? '\uffff').localeCompare(b.machine ?? '\uffff'));
}

/* ── who is open now, said as a person reads it ─────────────────────────── */

/** A run silent this long is quiet: no longer at work in any sense, and folded with the others on its machine. */
export const SILENT_S = 3600;

/** Whether a folder is a Windows one: a drive letter, or a backslash where a path would put a slash. */
export const isWindowsPath = (cwd: string | null | undefined): boolean => typeof cwd === 'string' && (/^[A-Za-z]:(?:[\\/]|$)/u.test(cwd) || cwd.includes('\\'));

/**
 * THE FOLDER A RUN OPENED IN, AS A PERSON SAYS IT: its last part ("the Developer folder"), or the drive on a Windows root
 * ("D:\"). `null` with no folder.
 */
export function folderSaid(cwd: string | null | undefined): string | null {
  const parts = (cwd ?? '')
    .trim()
    .split(/[\\/]+/u)
    .filter((p) => p !== '');
  const last = parts.at(-1);
  if (last === undefined) return null;
  if (/^[A-Za-z]:$/u.test(last)) return `${last}\\`;
  return `the ${last} folder`;
}

/** The app a run is ("Claude Code"), else its agent's name ("Claude"), else "An agent". */
export const appSaid = (r: Pick<LiveRun, 'app' | 'agent'>): string => r.app?.trim() || agentNamed(r.agent) || controlWords.aRun;

/**
 * A RUN BY NAME: its app and where it works, the project's name where it has one, else its repository, else the folder
 * it opened in. "Claude Code in Lanternfish", "Claude in the Developer folder". Never "Claude run".
 */
export function runTitle(r: Pick<LiveRun, 'app' | 'agent' | 'repo' | 'cwd'>, project: string | null): string {
  const who = appSaid(r);
  const where = project ?? r.repo ?? folderSaid(r.cwd);
  return where ? `${who} in ${where}` : who;
}

/** Words cut to a line: the first eighty characters, at a word, with an ellipsis where it was cut. */
function cutSaid(said: string, most = 80): string {
  const one = said.replace(/\s+/gu, ' ').trim();
  if (one.length <= most) return one;
  const cut = one.slice(0, most);
  const at = cut.lastIndexOf(' ');
  return `${(at > most / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/** How many changes, as a count: "1 change", "3 changes". */
export const changesSaid = (n: number): string => plural(n, 'change');

/**
 * THE LAST THING A RUN DID, in a few words: the question it asked that waits on him, else what it says it is doing,
 * else how many changes it wrote, else that it has written nothing yet.
 */
export function lastSaid(r: Pick<LiveRun, 'asked' | 'wrote' | 'doing' | 'agent' | 'name'>): string {
  if (r.asked?.trim()) return `Asked you: “${cutSaid(r.asked)}”`;
  const doing = doingSaid({ ...r, repo: null, branch: null });
  if (doing !== controlWords.saidNothing) return doing;
  if (typeof r.wrote === 'number' && r.wrote > 0) return `Wrote ${changesSaid(r.wrote)}`;
  return 'Nothing written yet';
}

/** When a run was last heard from: "heard just now", "heard 3 min ago". */
export const heardSaid = (r: Pick<LiveRun, 'heard_s'>): string => `heard ${agoSaid(r.heard_s)}`;

/** How long a run has been silent: the time since its last call, or since it was last heard where that is longer. */
const silenceOf = (r: Pick<LiveRun, 'quiet_s' | 'heard_s'>): number => Math.max(r.heard_s, typeof r.quiet_s === 'number' ? r.quiet_s : 0);

/** Whether a run is quiet: nothing heard for an hour, or, while it is not at work, no call for an hour. */
export const isSilent = (r: LiveRun): boolean => r.heard_s > SILENT_S || (!isAtWork(r) && silenceOf(r) > SILENT_S);

/** Whether a run has written nothing, asked nothing and said nothing of what it does. A host that does not count says it wrote. */
export const wroteNothing = (r: LiveRun): boolean => r.wrote === 0 && !r.asked?.trim() && doingSaid({ ...r, repo: null, branch: null }) === controlWords.saidNothing;

/** The runs silent over an hour on one machine, one row: its name as a person says it, and the runs. */
export type QuietMachine = { machine: string | null; said: string; runs: LiveRun[] };

/**
 * WHO IS OPEN NOW, IN FOUR PARTS, each lead run in exactly one:
 *
 *   - `shown`: the runs that wrote, asked or said what they do, heard inside the hour, the ones at work first. These are
 *     what "Working now" and "Open now" count.
 *   - `idle`: open, heard lately, and nothing written, folded into one line ("2 open, nothing written").
 *   - `quiet`: silent over an hour, one row a machine ("Windows PC: 3 Claude sessions on D:\, silent for 9 h").
 *   - `looks`: runs whose key only reads, which can write nothing and are never counted.
 */
/** A run's number from its handle, `883` of `S883`, which only grows: the order runs started in. */
const runNumber = (r: Pick<LiveRun, 'run'>): number => Number(/(\d+)$/u.exec(r.run)?.[1] ?? 0);

export function openNow(rows: readonly LiveRun[]): { shown: LiveRun[]; idle: LiveRun[]; quiet: QuietMachine[]; looks: LiveRun[] } {
  const leads = leadsOf(rows);
  const looks = leads.filter((r) => r.looks === true);
  const left = leads.filter((r) => r.looks !== true);
  const heard = left.filter((r) => !isSilent(r));
  const idle = heard.filter(wroteNothing);
  /* A STILL ORDER, THE NEWEST RUN FIRST (3 Nov, "things blinking"): sorted by who was heard last and who is at work this
     second, every write and every read fifteen seconds apart swapped the rows of a busy record round, and the dots and
     the times seemed to blink. A run now keeps its place until it starts or ends; its dot says whether it is at work. */
  const shown = heard.filter((r) => !wroteNothing(r)).sort((a, b) => runNumber(b) - runNumber(a) || a.run.localeCompare(b.run));
  const hosts = [...new Set(rows.map((r) => r.machine).filter((m): m is string => m !== null))];
  const quiet = byMachine(left.filter(isSilent)).map((g) => ({ machine: g.machine, said: machineNamed(g.machine, rows, hosts), runs: g.rows }));
  return { shown, idle, quiet, looks };
}

const KIND_SAID = /\b(?:Windows|Mac|MacBook|iMac|Linux|Ubuntu|Debian|Fedora|Arch|NixOS|Mint|Pop!_OS|Raspberry)\b/u;

/**
 * A MACHINE AS A PERSON SAYS IT, from its name and the folders its runs opened in: a host named after its owner ("Mara")
 * whose runs open on D:\ is the Windows PC, not "Mara", which `machineSaid` reads from the name alone.
 */
export function machineNamed(host: string | null, rows: readonly Pick<LiveRun, 'machine' | 'cwd'>[], among: readonly string[] = []): string {
  if (host === null) return 'A machine not named';
  const said = machineSaid(host, among);
  if (KIND_SAID.test(said) || !rows.some((r) => r.machine === host && isWindowsPath(r.cwd))) return said;
  const twin = among.some((o) => o !== host && !KIND_SAID.test(machineSaid(o, among)) && rows.some((r) => r.machine === o && isWindowsPath(r.cwd)));
  return twin ? `${said}'s Windows PC` : 'Windows PC';
}

/** A quiet machine's two lines: "3 Claude sessions on D:\" and "Nothing written · silent for 9 h". */
export function quietSaid(q: QuietMachine): { what: string; said: string } {
  const apps = [...new Set(q.runs.map((r) => appSaid(r)))];
  const folders = [...new Set(q.runs.map((r) => folderSaid(r.cwd)).filter((f): f is string => f !== null))];
  const where = folders.length === 1 ? (/^[A-Za-z]:\\$/u.test(folders[0]!) ? ` on ${folders[0]!}` : ` in ${folders[0]!}`) : '';
  const what = `${plural(q.runs.length, `${apps.length === 1 ? apps[0]! : 'agent'} session`)}${where}`;
  const wrote = q.runs.reduce((n, r) => n + (typeof r.wrote === 'number' ? r.wrote : 0), 0);
  const did = q.runs.some((r) => !!r.asked?.trim()) ? 'Asked you something' : wrote > 0 ? `Wrote ${changesSaid(wrote)}` : 'Nothing written';
  return { what, said: `${did} · silent for ${spanSaid(Math.min(...q.runs.map(silenceOf)) * 1000)}` };
}

/** The lines for the runs left out of the count: "2 open, nothing written", "Not counted: one read-only look." */
export const idleSaid = (n: number): string => `${n.toLocaleString('en')} open, nothing written`;
export const looksSaid = (n: number): string => `Not counted: ${n === 1 ? 'one read-only look' : `${n.toLocaleString('en')} read-only looks`}.`;

/** A list of names as a person says it: "Codex", "Codex and Cursor", "Codex, Cursor and Gemini". */
const andList = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`);

/**
 * WHAT PAUSE AND STOP REACH, SAID ONCE FOR THE LIST (§2.4), never once a row: the agents a stop halts at their next tool
 * call through their hooks, and the ones it reaches only at their next BrainDog call, which keep working until then.
 */
export function reachLine(rows: readonly LiveRun[]): string | null {
  const named = (rs: readonly LiveRun[]) => [...new Set(rs.map((r) => agentNamed(r.agent) ?? (r.name?.trim() || controlWords.aRun)))];
  const hooks = named(rows.filter((r) => r.reach === 'hooks'));
  const later = named(rows.filter((r) => r.reach !== 'hooks'));
  if (hooks.length === 0 && later.length === 0) return null;
  if (later.length === 0) return `Pause and Stop reach ${andList(hooks)} at the next tool call, through the hooks.`;
  const tail = `${andList(later)} only at the next BrainDog call, and ${later.length === 1 ? 'it keeps' : 'they keep'} working until then.`;
  return hooks.length === 0 ? `Pause and Stop reach ${tail}` : `Pause and Stop reach ${andList(hooks)} at the next tool call, through the hooks; ${tail}`;
}

const reachSoon = (r: LiveRun): string => (r.reach === 'hooks' ? 'within about 15 seconds, at its next step' : 'at its next BrainDog call, and not before');

/** A live run's label in "To": its agent and project, and its branch when another run of the same agent is there too. */
function runChoice(r: LiveRun, all: readonly LiveRun[], projects: ReadonlyMap<string, Project>): InstructChoice {
  const who = agentNamed(r.agent) ?? controlWords.aRun;
  const on = projectName(r.project, projects);
  const twin = all.some((o) => o !== r && o.agent === r.agent && o.project === r.project);
  const tail = twin ? (r.branch ?? r.doing ?? null) : null;
  return { key: `run:${r.run}`, label: `${who}${on ? ` on ${on}` : ''}${tail ? `, ${tail}` : ''} (${isAtWork(r) ? 'working now' : 'open, waiting on you'})` };
}

/** The names a place offers: what the record said, then what the live runs say, each once, in that order. */
const namesOf = (said: readonly string[], live: readonly (string | null | undefined)[]): string[] =>
  [...new Set([...said, ...live.filter((n): n is string => typeof n === 'string' && n.trim() !== '')])];

/** A choice of names, "Any …" first, offered only where there are two to choose between. */
const choicesOf = (names: readonly string[], any: string, say: (n: string) => string = (n) => n): InstructChoice[] | null =>
  names.length > 1 ? [{ key: '', label: any }, ...names.map((n) => ({ key: n, label: say(n) }))] : null;

/**
 * The composer as it stands for `pick`: its choices, the one each is at, and what happens once it is sent, said from
 * the runs open now. "Now" is offered only while a run it would reach is live (§2.1), and is then the first choice.
 *
 * ON ONE PROJECT'S PAGE (`project`, plan §7.2: "Tell agents on Kiln") "On" is that project and nothing else, and "To"
 * offers only the runs working there, so nothing typed on Kiln's page goes to a run on another project.
 *
 * "MACHINE" AND "PROFILE" are offered where his runs are on two or more (`places`, and the live runs), and never for a
 * named run, which is one machine and one profile already.
 */
export function composerOf(
  pick: Chosen,
  rows: readonly LiveRun[],
  projects: ReadonlyMap<string, Project>,
  project?: string | null,
  places: Places = NO_PLACES,
): Omit<InstructView, 'busy' | 'fault'> {
  const scoped = project ?? null;
  const leads = leadsOf(rows).filter((r) => scoped === null || r.project === scoped);
  const to: InstructChoice[] = [
    { key: 'anyone', label: controlWords.anyone },
    ...AGENT_KINDS.filter((k) => places.agents === null || places.agents.includes(k) || rows.some((r) => r.agent === k) || pick.to === `agent:${k}`).map((k) => ({
      key: `agent:${k}`,
      label: AGENT_NAMES[k] ?? k,
    })),
    ...leads.map((r) => runChoice(r, leads, projects)),
  ];
  const toKey = to.some((c) => c.key === pick.to) ? pick.to : 'anyone';
  const named = scoped === null ? undefined : projects.get(scoped);
  const on: InstructChoice[] =
    scoped === null
      ? [{ key: '', label: controlWords.anywhere }, ...[...projects.values()].map((p) => ({ key: p.key, label: p.name }))]
      : [{ key: scoped, label: named?.name ?? controlWords.anywhere }];

  if (toKey.startsWith('run:')) {
    const r = leads.find((x) => `run:${x.run}` === toKey)!;
    const who = runSaid(r.run, new Map([[r.run, r]]), projects, true);
    const held = r.stopped === 'stop' ? ' It is stopped, so it can only reply and end.' : r.stopped === 'pause' ? ' It is paused; it reads this, and works once you resume it.' : '';
    return {
      to,
      toKey,
      on: r.project && !on.some((c) => c.key === r.project) ? [...on, { key: r.project, label: projectName(r.project, projects) ?? controlWords.anywhere }] : on,
      onKey: r.project ?? '',
      onFixed: true,
      when: ['now'],
      whenKey: 'now',
      next: `${who} sees this ${reachSoon(r)}.${held}`,
      agent: r.agent,
    };
  }

  const kind = toKey.startsWith('agent:') ? toKey.slice('agent:'.length) : null;
  const onKey = scoped ?? (on.some((c) => c.key === pick.on) ? pick.on : '');
  const place = projectName(onKey || null, projects);
  /* A MACHINE IS KEYED BY ITS NAME AND SAID AS A PERSON SAYS IT (`machineSaid`), so the right one is still reached. */
  const machineNames = namesOf(places.machines, leads.map((r) => r.machine));
  const machines = choicesOf(machineNames, controlWords.anyMachine, (n) => machineSaid(n, machineNames));
  const seats = choicesOf(namesOf(places.seats, leads.map((r) => r.seat)), controlWords.anyProfile);
  const machineKey = machines?.some((c) => c.key === pick.machine) ? pick.machine! : '';
  const seatKey = seats?.some((c) => c.key === pick.seat) ? pick.seat! : '';
  const live = leads.filter(
    (r) =>
      r.stopped === null &&
      (kind === null || r.agent === kind) &&
      (onKey === '' || r.project === onKey) &&
      (machineKey === '' || r.machine === machineKey) &&
      (seatKey === '' || r.seat === seatKey),
  );
  const when: ('now' | 'next')[] = live.length > 0 ? ['now', 'next'] : ['next'];
  const whenKey = pick.when !== null && when.includes(pick.when) ? pick.when : when[0]!;
  const kindName = agentNamed(kind);
  const where = [place ? `on ${place}` : null, machineKey ? `on ${machineSaid(machineKey, machineNames)}` : null].filter((x): x is string => x !== null).join(', ');
  const there = `${where || (seatKey ? '' : 'anywhere')}${seatKey ? `${where ? ' ' : ''}as ${seatKey}` : ''}`;
  let next: string;
  if (whenKey === 'now' && live.length === 1) {
    const r = live[0]!;
    next = `Goes to ${runSaid(r.run, new Map([[r.run, r]]), projects, true)}, ${isAtWork(r) ? 'working' : 'open'} now: it sees this ${reachSoon(r)}. If it ends first, the next ${kindName ?? 'agent'} ${there} gets it.`;
  } else if (whenKey === 'now') {
    /* "OPEN" AND NOT "WORKING": an idle run takes it too, and "working" is the rail's number alone. */
    next = `Goes to the ${plural(live.length, `open ${kindName ?? 'agent'} run`)} ${there} now. The first to take it does it, and the others are told it is taken.`;
  } else {
    next = `The next ${kindName ? `${kindName} run` : 'agent'} ${there} gets this when it starts or next checks in. It waits up to ${String(WAIT_DAYS)} days.`;
  }
  return {
    to,
    toKey,
    on,
    onKey,
    onFixed: scoped !== null,
    ...(machines === null ? {} : { machine: machines, machineKey }),
    ...(seats === null ? {} : { seat: seats, seatKey }),
    when,
    whenKey,
    next,
    agent: kind,
  };
}

/** The runs a panel scoped to one run or one project draws: that run, or the lead runs on that project, else all. */
export const scopedLeads = (rows: readonly LiveRun[], scope: { run?: string | null; project?: string | null } = {}): LiveRun[] =>
  leadsOf(rows).filter((r) => (scope.run == null || r.run === scope.run) && (scope.project == null || r.project === scope.project));

/** What he told agents on one project, or about one run: the threads such a panel lists. */
export const scopedThreads = (threads: readonly Thread[], scope: { run?: string | null; project?: string | null } = {}): Thread[] =>
  threads.filter(
    (t) =>
      (scope.project == null || t.project === scope.project) &&
      (scope.run == null || t.to_run === scope.run || t.taken_by === scope.run || t.seen_by === scope.run || (t.seen ?? []).some((s) => s.run === scope.run)),
  );

/** One question his words name for the run to answer, with the answer he gave it. */
export type NamedAnswer = { question: string; option: string };

/* "ACCEPT SG243", "DECLINE SG12", "ANSWER SG7 WITH SHIP": a verb right before the question, or `answer ... with`. */
const ANSWER_SAID = /\b(accept|approve|decline|reject)\s+(SG[1-9][0-9]*)\b|\banswer\s+(SG[1-9][0-9]*)\s+with\s+([A-Za-z0-9_:-]{1,80})/giu;
/* A "DON'T" OR "NEVER" JUST BEFORE IT says he did not mean it as an answer, so none is given. */
const NOT_SAID = /\b(?:don'?t|do\s+not|never|not)\s*$/iu;

/**
 * The questions his words name for the run that takes it to answer, each once, the first answer kept. The record
 * checks each against the question as it stands and refuses one it does not take, in words the box shows him.
 */
export function answersSaid(said: string): NamedAnswer[] {
  const out: NamedAnswer[] = [];
  for (const m of said.matchAll(ANSWER_SAID)) {
    if (NOT_SAID.test(said.slice(Math.max(0, m.index - 12), m.index))) continue;
    const question = (m[2] ?? m[3] ?? '').toUpperCase();
    const option = (m[1] ?? m[4] ?? '').toLowerCase();
    if (question !== '' && option !== '' && !out.some((a) => a.question === question)) out.push({ question, option });
  }
  return out;
}

/** What `instruct` is sent for the composer as it stood and the words he typed. */
export function instructArgs(view: Pick<InstructView, 'toKey' | 'onKey' | 'whenKey' | 'machineKey' | 'seatKey'>, said: string): Record<string, string | NamedAnswer[]> {
  const named = answersSaid(said);
  const args: Record<string, string | NamedAnswer[]> = { said: said.trim(), ...(named.length === 0 ? {} : { answers: named }) };
  if (view.toKey.startsWith('run:')) return { ...args, to: 'run', to_run: view.toKey.slice('run:'.length), when: 'now' };
  if (view.toKey.startsWith('agent:')) Object.assign(args, { to: 'agent', to_agent: view.toKey.slice('agent:'.length) });
  else args.to = 'anyone';
  if (view.onKey !== '') args.project = view.onKey;
  if (view.machineKey) args.machine = view.machineKey;
  if (view.seatKey) args.seat = view.seatKey;
  args.when = view.whenKey;
  return args;
}

/* ── the runs open now ──────────────────────────────────────────────────── */

/** One run row, worded: who, what it said, where, how long, what it holds from him, and what can stop it. */
export function presenceOf(
  r: LiveRun,
  rows: readonly LiveRun[],
  projects: ReadonlyMap<string, Project>,
  threads: readonly Thread[] = [],
  { bare = false }: { bare?: boolean } = {},
): PresenceView {
  const name = agentNamed(r.agent) ?? (r.name?.trim() || controlWords.aRun);
  const project = r.project === null ? null : (projects.get(r.project) ?? null);
  const helpers = rows.filter((h) => h.parent === r.run);
  const held = r.instruction === null ? null : (threads.find((t) => t.id === r.instruction) ?? null);
  const on = project ? ` on ${project.name}` : '';
  const doing = r.doing?.trim() || null;
  const hooks = r.reach === 'hooks';
  return {
    key: r.run,
    agent: r.agent,
    name,
    doing: doing === name ? null : doing,
    project: project ? { name: project.name, slot: slotOf(project.hue) } : null,
    /* THE PROFILE IT RUNS UNDER, BY NAME, where it is one of his own and not the default one (migration 44). */
    /* "verified" FIRST WHERE ITS KEY PROVES ITS APP: "Claude Code · verified · as studio · main". */
    /* `bare`, ONE RUN ON TODAY'S SHEET: no profile, which is where it runs and not what it does. */
    /* NO BRANCH ON ANY ROW: "axis-qa" is the name a branch was typed as, where what it is doing is said above it in words
       (audit of 31 October, A19). Its branch is on its own run's page. */
    /* A RUN GONE QUIET SAYS WHEN IT WAS LAST HEARD, beside its word Quiet (audit 6g, AG10): its page said "Gone quiet"
       and nothing of when, with no Tell beside it. How long it ran is no news of a run nobody hears. */
    meta: [
      r.verified === true ? 'verified' : null,
      !bare && r.seat && r.seat !== 'default' ? `as ${r.seat}` : null,
      r.state === 'gone' ? null : `running ${spanSaid(r.for_s * 1000)}`,
      `heard ${agoSaid(r.heard_s)}`,
    ]
      .filter((x): x is string => !!x)
      .join(' · '),
    live: r.state === 'working' || r.state === 'thinking' ? r.state : r.state === 'gone' ? 'quiet' : 'waiting',
    holds: held ? `On your word: “${held.said.replace(/\s+/gu, ' ').trim()}”` : null,
    helpers: helpers.length === 0 ? null : `+${plural(helpers.length, 'helper')}`,
    stopped: r.stopped,
    /* WHEN, NOT HOW: "its next tool call, through its hooks" was plumbing on the run's own sheet. */
    reach: hooks ? 'Pause and Stop take effect at its next step.' : `${name} keeps working until it next checks in with BrainDog. Pause and Stop take effect then.`,
    confirm: {
      stop: hooks
        ? `Stop ${name}${on}? Its next step is refused, and it is asked to reply and end.`
        : `Stop ${name}${on}? It keeps editing until its next BrainDog call; there it is refused and asked to reply and end.`,
      pause: hooks
        ? `Pause ${name}${on}? Its tools are held from its next call until you resume it.`
        : `Pause ${name}${on}? It is held at its next BrainDog call, until you resume it.`,
    },
    href: /^S[1-9][0-9]*$/u.test(r.run) ? `/r/session/${r.run.slice(1)}` : null,
    busy: false,
    time: ageSaid(r.for_s),
  };
}

/* ── what he told agents ────────────────────────────────────────────────── */

const STEPS: Record<InstrState, readonly ThreadStep[]> = {
  sent: ['done', 'ahead', 'ahead', 'ahead'],
  seen: ['done', 'done', 'ahead', 'ahead'],
  working: ['done', 'done', 'at', 'ahead'],
  done: ['done', 'done', 'done', 'done'],
  needs_you: ['done', 'done', 'done', 'done'],
  declined: ['done', 'done', 'done', 'done'],
  expired: ['done', 'ahead', 'ahead', 'ahead'],
  withdrawn: ['done', 'ahead', 'ahead', 'ahead'],
};

const OPEN: readonly InstrState[] = ['sent', 'seen', 'working'];

/** What was put back by Undo all, by instruction, and what each press is busy with. */
export type ThreadMarks = { undone?: ReadonlyMap<string, string>; busy?: ReadonlySet<string> };

/**
 * One thread, worded: who it went to and when, how far it got, the trail of who saw it and how, the reply, and what
 * the run changed with the way back.
 */
export function threadOf(
  t: Thread,
  ctx: { now: number; zone?: string; runs: ReadonlyMap<string, RunKnown>; projects: ReadonlyMap<string, Project> } & ThreadMarks,
): ThreadView {
  const { now, zone, runs, projects } = ctx;
  const hm = (iso: string | null) => clockSaid(iso, now, zone);
  const holder = t.taken_by ?? t.seen_by ?? t.to_run;
  const agent = (holder ? runs.get(holder)?.agent : null) ?? t.to_agent ?? null;
  const who =
    t.to === 'run' ? runSaid(t.to_run, runs, projects) : t.to === 'agent' ? (agentNamed(t.to_agent) ?? controlWords.aRun) : t.to === 'task' ? controlWords.aTask : controlWords.anyone;
  const kindWord = controlWords.kind[t.kind];
  const to = [
    kindWord || null,
    who,
    projectName(t.project, projects),
    t.machine ? `on ${machineSaid(t.machine)}` : null,
    t.seat ? `as ${t.seat}` : null,
    t.kind === 'tell' || t.kind === 'redirect' ? controlWords[t.when] : null,
  ]
    .filter((x): x is string => !!x)
    .join(' · ');

  const trail: string[] = [`Sent ${hm(t.at)}`];
  const seenRuns = [...new Map((t.seen ?? []).map((s) => [s.run, s])).values()];
  if (seenRuns.length > 0) {
    const first = seenRuns[0]!;
    const names = [...new Set(seenRuns.map((s) => runSaid(s.run, runs, projects)))];
    trail.push(`Seen by ${names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`} at ${hm(first.at)}, ${controlWords.how[first.how]}`);
  } else if (t.seen_by !== null && t.seen_how !== null) {
    trail.push(`Seen by ${runSaid(t.seen_by, runs, projects)} at ${hm(t.seen_at)}, ${controlWords.how[t.seen_how]}`);
  }
  if (t.taken_by !== null && t.taken_at !== null && !seenRuns.some((s) => s.run === t.taken_by && s.at === t.taken_at)) trail.push(`Taken by ${runSaid(t.taken_by, runs, projects)} at ${hm(t.taken_at)}`);
  /* WHAT IT LETS THE RUN ANSWER, by name, and which it has. */
  const named = (t.answers ?? []).map((a) => a.question);
  if (named.length > 0) {
    const done = named.filter((q) => (t.answered ?? []).includes(q));
    trail.push(done.length === named.length ? `Answered ${named.join(', ')} as you said` : `Lets it answer ${named.join(', ')}${done.length > 0 ? ` (${done.join(', ')} done)` : ''}`);
  }
  if (t.state === 'withdrawn') trail.push(`Taken back ${hm(t.updated_at)}`);
  if (t.state === 'expired') trail.push(`No run took it in ${String(WAIT_DAYS)} days`);

  const word =
    t.state === 'working'
      ? `Working ${spanSaid(now - Date.parse(t.taken_at ?? t.updated_at))}`
      : t.state === 'needs_you'
        ? 'Needs you'
        : t.state === 'withdrawn'
          ? 'Taken back'
          : t.state.charAt(0).toUpperCase() + t.state.slice(1);
  const tone: ThreadView['tone'] = t.state === 'needs_you' ? 'needs' : t.state === 'done' ? 'done' : OPEN.includes(t.state) ? 'open' : 'ended';

  const reply = t.reply === null ? null : { by: `${runSaid(t.taken_by, runs, projects)}${t.replied_at ? ` at ${hm(t.replied_at)}` : ''}`, text: t.reply };

  let receipts: ThreadReceipts | null = null;
  const r = t.receipts;
  const moved = r !== null && r.head_after !== null && r.head_after !== r.head_before;
  if (r !== null && (r.changes > 0 || moved)) {
    const names = [...new Set(r.batches.flatMap((b) => b.names))];
    const branch = runs.get(r.run)?.branch ?? null;
    const undone = ctx.undone?.get(t.id) ?? null;
    receipts = {
      said: r.changes > 0 ? plural(r.changes, 'change') : 'No changes in BrainDog',
      names: names.slice(0, 4),
      more: names.length > 4 ? `and ${String(names.length - 4)} more` : null,
      undo: r.changes > 0 && undone === null,
      undone,
      commits: moved ? `New commits${branch ? ` on ${branch}` : ''}` : null,
    };
  }

  return {
    key: t.id,
    said: t.said,
    to,
    agent,
    steps: STEPS[t.state],
    word,
    tone,
    trail: trail.join(' · '),
    reply,
    receipts,
    takeBack: t.state === 'sent' || t.state === 'seen',
    close: !OPEN.includes(t.state) && t.state !== 'needs_you',
    sending: false,
    busy: ctx.busy?.has(t.id) ?? false,
  };
}

/** The threads in the order he acts on them: Needs you first, then what is open, then the rest, each newest first. */
export function threadOrder(threads: readonly Thread[]): Thread[] {
  const rank = (t: Thread): number => (t.state === 'needs_you' ? 0 : OPEN.includes(t.state) ? 1 : 2);
  return [...threads].sort((a, b) => rank(a) - rank(b) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** A thread drawn the moment Send is pressed, before the record answers: what he said, to whom, on its way. */
export function sendingOf(key: string, said: string, view: Omit<InstructView, 'busy' | 'fault'>): ThreadView {
  const label = (list: readonly InstructChoice[], k: string) => list.find((c) => c.key === k)?.label ?? '';
  const who = label(view.to, view.toKey).replace(/ \((?:working now|open, waiting on you)\)$/u, '');
  const on = view.onKey === '' || view.toKey.startsWith('run:') ? null : label(view.on, view.onKey);
  const machine = view.machineKey ? `on ${label(view.machine ?? [], view.machineKey) || machineSaid(view.machineKey)}` : null;
  const seat = view.seatKey ? `as ${view.seatKey}` : null;
  return {
    key,
    said: said.trim(),
    to: [who, on, machine, seat, controlWords[view.whenKey]].filter((x): x is string => !!x).join(' · '),
    agent: view.agent,
    steps: ['at', 'ahead', 'ahead', 'ahead'],
    word: 'On its way',
    tone: 'open',
    trail: '',
    reply: null,
    receipts: null,
    takeBack: false,
    close: false,
    sending: true,
    busy: false,
  };
}

/** The runs the page knows by handle: every run open now, as presence answers it. */
export const runsOf = (rows: readonly LiveRun[]): Map<string, RunKnown> => new Map(rows.map((r) => [r.run, { agent: r.agent, project: r.project, branch: r.branch }]));

/** The run handles a thread names that the page does not know yet, to read their rows once. */
export const unknownRuns = (threads: readonly Thread[], known: ReadonlyMap<string, RunKnown>): string[] =>
  [...new Set(threads.flatMap((t) => [t.to_run, t.seen_by, t.taken_by, ...(t.seen ?? []).map((s) => s.run)]).filter((h): h is string => h !== null && /^S[1-9][0-9]*$/u.test(h) && !known.has(h)))];

/* ── the shared moment between the parts ────────────────────────────────── */

/**
 * WHAT ONE PART TELLS THE OTHER: a run row's Tell aims the composer at that run, and a stop, a pause or a send asks the
 * others to read again now rather than at the next poll. Two panels on one page, so a plain set of listeners.
 */
function channel<T>() {
  const heard = new Set<(v: T) => void>();
  return {
    say(v: T): void {
      for (const f of heard) f(v);
    },
    on(f: (v: T) => void): () => void {
      heard.add(f);
      return () => void heard.delete(f);
    },
  };
}

/** A run row's Tell: the run it is for, by handle. */
export const aim = channel<string>();
/** Something he told changed: read again. */
export const told = channel<void>();
/** A step left for the next run, handed on: the composer takes its words, to whoever is next, for him to send. */
export const fill = channel<string>();

/* ── the record ─────────────────────────────────────────────────────────── */

type Out<T> = { ok: true; value: T } | { ok: false; fix: string };

const outOf = <T>(answer: { ok: boolean; value?: unknown; refusal?: { fix?: string } }, fallback: string): Out<T> =>
  answer.ok ? { ok: true, value: answer.value as T } : { ok: false, fix: answer.refusal?.fix ?? fallback };

/** The control room's reads and writes, through the record's own doors. */
export function control(base: string, io?: Fetch) {
  const c = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    async presence(): Promise<Out<LiveRun[]>> {
      return outOf<LiveRun[]>(await c.presence(), 'The agents working now could not be read.');
    },
    /**
     * What he told agents, newest first; `run` narrows to what went to, was seen by or was taken by one run. With it, the
     * machines and profiles the composer may offer (`places`), none from a host older than migration 44.
     */
    async threads(limit = 50, run?: string, project?: string): Promise<Out<Thread[]> & { places?: Places }> {
      const out = outOf<{ rows: Thread[]; places?: unknown }>(
        await c.instructionList({ limit, ...(run ? { run } : {}), ...(project ? { project } : {}) }),
        'What you told agents could not be read.',
      );
      return out.ok ? { ok: true, value: out.value.rows, places: placesFrom(out.value.places) } : out;
    },
    async send(args: Record<string, unknown>): Promise<Out<Thread>> {
      return outOf<Thread>(await c.instruct(args as unknown as Parameters<typeof c.instruct>[0]), 'That could not be sent.');
    },
    async takeBack(id: string): Promise<Out<Thread>> {
      return outOf<Thread>(await c.withdrawInstruction({ id }), 'That could not be taken back.');
    },
    /** Close one that is finished, and it leaves his list. */
    async close(id: string): Promise<Out<Thread>> {
      return outOf<Thread>(await c.closeInstruction({ id }), 'That could not be closed.');
    },
    /** Stop, pause or resume one run now, with why in his words or the plain default. */
    async hold(run: string, kind: 'stop' | 'pause' | 'resume', why: string): Promise<Out<Thread>> {
      const said = why.trim() || (kind === 'stop' ? controlWords.stopSaid : kind === 'pause' ? controlWords.pauseSaid : controlWords.resumeSaid);
      return outOf<Thread>(await c.instruct({ said, kind, to: 'run', to_run: run }), 'That run could not be reached.');
    },
    /** The runs named by handle that are not open now, from their own rows: agent, project and branch. */
    async runs(handles: readonly string[]): Promise<Map<string, RunKnown>> {
      const out = new Map<string, RunKnown>();
      await Promise.all(
        handles.map(async (h) => {
          const seq = Number(h.slice(1));
          const got = await c.get('session', seq);
          const f = got.ok && typeof got.value === 'object' && got.value !== null ? ((got.value as { fields?: Record<string, unknown> }).fields ?? {}) : null;
          if (f === null) return;
          const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
          out.set(h, { agent: text(f.agent), project: text(f.project), branch: text(f.branch) });
        }),
      );
      return out;
    },
    /**
     * The projects "On" offers, by the handle runs hold them by (`<list>#1`): the list the runs name and every list the
     * tab has learnt declares `scopes`, never one named here, read whole, its title field said and its hue kept for the
     * dot. FROM THE TAB'S WALK (`ref-rows.ts`), which the page beside the panel walked already to name its refs (scope
     * 2026-10-24 A21), and not a read of its own; a caller handed a fetch of its own reads for itself.
     */
    async projects(rows: readonly LiveRun[]): Promise<Map<string, Project>> {
      const declared = Object.values(REGISTERS)
        .filter((d) => (d as { scopes?: unknown }).scopes !== undefined)
        .map((d) => d.id);
      const registers = [...new Set([...rows.map((r) => r.project?.split('#')[0] ?? null), ...declared].filter((x): x is string => !!x))];
      const out = new Map<string, Project>();
      for (const register of registers) {
        const listed: readonly { seq: number | null; fields: Record<string, unknown> }[] | null = io
          ? await c.list({ register, limit: 100 }).then((got) => (got.ok ? ((got.value as { rows?: { seq: number | null; fields: Record<string, unknown> }[] }).rows ?? []) : null))
          : await tabRows(c, base, register);
        if (listed === null) continue;
        for (const row of listed) {
          if (row.seq === null || row.fields.draft === true) continue;
          const titled = REGISTERS[register]?.title;
          const name = [titled ? row.fields[titled] : undefined, row.fields.name, row.fields.title].find((v): v is string => typeof v === 'string' && v.trim() !== '');
          if (!name) continue;
          out.set(`${register}#${String(row.seq)}`, { key: `${register}#${String(row.seq)}`, name, hue: typeof row.fields.hue === 'number' ? row.fields.hue : null });
        }
      }
      return new Map([...out.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)));
    },
  };
}

/**
 * UNDO ALL: put back what the run changed while it held the instruction, batch by batch, newest first, and say what it
 * came to in one sentence. A batch somebody changed since is left alone and counted, as Undo does everywhere.
 */
export async function undoAll(base: string, receipts: Receipts, io?: Fetch): Promise<string> {
  let put = 0;
  let skipped = 0;
  let fix: string | null = null;
  for (const b of receipts.batches) {
    const out = await undoChange(base, b.batch, io);
    if (out.from === 'undone') {
      put += out.put;
      skipped += out.skipped.length;
    } else fix ??= out.fix;
  }
  if (put === 0 && fix !== null) return fix;
  const back = put === 0 ? 'There was nothing left to put back.' : `Put back ${plural(put, 'change')}.`;
  return skipped > 0 ? `${back} Left ${String(skipped)} that changed since.` : back;
}
