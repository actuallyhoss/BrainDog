/**
 * `braindog hook start` and `braindog hook end`, which Claude Code runs when a session starts and ends.
 *
 * A HOOK NEVER STOPS A SESSION. Every path exits 0, a host that is
 * down included. The start hook prints the card, or one plain line saying why there is none, or nothing when the
 * session already holds it; the end hook prints nothing.
 *
 * NO TOKEN IS EVER PRINTED OR WRITTEN HERE. The bearer leaves only as `Authorization`, through `clientFor`,
 * and every sentence below is either fixed text or a host's refusal, which never carries one.
 */

import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client, Context } from '@braindog/client';
import { buildDay } from '@braindog/mcp/build';
import { refused } from '@braindog/ports';

import { unbom } from './unbom.ts';
import { behindSaid, checkPath, hostName } from './behind.ts';
import { readDoorCache } from './bridge-cache.ts';
import { allowedPrograms, owedCommands, readAllowed, sentOf, usedTools, type SentCommands } from './commands-used.ts';
import { briefing, cardOf, nextLine, words, type Moved, type Where } from './brief.ts';
import { budgetOf, clientFor, hostsPath, readHosts, sameHost, target, type Target } from './http.ts';
import { authoredIn, childHeads, commitsBy, joinedAt, listedBy, localRepo, LOG_FORMAT, meeter, meetingOf, MIN_COMMITS, ownerOf, readLayout, type Layout, type MeetCall, type Meeting, type Owner, type Reader } from './people.ts';
import { mark } from './hook-trace.ts';
import { seedInbox, toldAtStart } from './inbox-file.ts';
import { cliBuild, git, hostSessionOf, positionOf, sessionHeaders, type Parent, type Position } from './position.ts';
import type { AgentIo } from './skills.ts';
import { startOffer, startOwed, startWork, topOf, WORK_MS, WORK_STEP_MS } from './session-start.ts';

type Env = Record<string, string | undefined>;

/**
 * What a hook needs from its process, passed in so a test can hold all of it. `device` is the name this machine goes
 * by, when a test gives one; otherwise it is worked out (`deviceName`). `began` is when the hook began, in epoch
 * milliseconds, for a caller that is not its own process; without it the start hook counts from its process's start.
 * `work` takes the start work the hook leaves for after the card; without it a detached process does it (`spawnWork`).
 */
export type Io = { env: Env; stdin: string; cwd: string; write: (text: string) => void; home?: string; device?: string; began?: number; build?: string; work?: (job: WorkJob) => void };

/** The start hook's whole budget: git, then `attach`, well inside the twenty seconds Claude Code gives it. */
export const HOOK_MS = 8_000;
/* `BRAINDOG_TIMEOUT_MS` may shorten it, never lengthen it, so a test need not wait eight seconds. */
export const hookBudget = (env: Env): number => Math.min(HOOK_MS, budgetOf(env));

export const notSignedIn = (hosts: string): string =>
  `BrainDog: this machine is not signed in. Run braindog login <host>, set BRAINDOG_TOKEN, or put a token for the host in ${hosts}.`;

export const unreachable = (ms: number): string =>
  `BrainDog did not answer within ${String(ms / 1000)} seconds, so this session works without shared context.`;

/* ── the session file ──────────────────────────────────────────────────── */

/**
 * Which run a session is, for every process that comes after the start hook.
 *
 * KEYED BY THE FOLDER AND THE SESSION. Claude Code starts the MCP server in the session's folder and gives it the
 * session's id, so a file per folder and session (`sessionPath(env, cwd, id)`) is the one a second window in the same
 * folder cannot overwrite: before this, the folder had one file, the second window's start hook replaced it, and the
 * first window's server wrote as the second window's run. A caller with no session id (a shell) reads the folder's own
 * file, which every start hook also writes, as the last session started there. And a Claude Code window keeps one file
 * of its own (`windowPath`), the run it last started, which its MCP server follows across a clear and its subagents
 * take their project from.
 *
 * THE FILES LIVE BESIDE THE HOSTS FILE, in the user's own config folder: in the repository they would show in
 * `git status` and could be committed, and a temp folder is emptied and may be shared. They hold ids, commits and where
 * the session stands, never a token. `at` is when the start hook wrote it, and `seen` when the end hook last heard
 * from the same session, so a resume knows how long the session was away. `pid` is the Claude Code process the start
 * hook ran under (`CLAUDE_PID`). `cwd`, `repo` and `remote` are where the session started, for a subagent working in a
 * scratch folder (`parentOf`), and `heads` the HEAD of each repository under a folder that is not one, so the end hook
 * reads the commits of every one that moved. `hook_ms` is how long the start hook that wrote it took, until a later hook
 * of the same session sends it as the door's `hook` mark (`owedMark`). `commands` is the list of the project's command
 * lines the end hook last sent, by name only, and when, so the same list goes once a day for a folder (`sendCommands`).
 * `handoff_head` is the commit the step the attach handed this run was left at, so the next start here can count the
 * commits since it before its attach and send them with it (`hookStart`).
 */
export type SessionFile = {
  host: string;
  spoken: string;
  client_id?: string;
  head_at_start: string | null;
  at: string;
  seen?: string;
  /** When the end hook's `end` landed: `seen` says it started, and a window closed under it never gets this far. */
  ended?: string;
  pid?: string;
  cwd?: string;
  repo?: string;
  remote?: string;
  heads?: Record<string, string>;
  hook_ms?: number;
  commands?: SentCommands;
  handoff_head?: string;
};

const SPOKEN = /^S[1-9][0-9]*$/;
const CLIENT = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA = /^[0-9a-f]{4,40}$/;
const PID = /^[1-9][0-9]{0,9}$/;

/** The Claude Code process a hook runs under, as its environment says it. */
export const hostPidOf = (env: Env): string | null => (typeof env.CLAUDE_PID === 'string' && PID.test(env.CLAUDE_PID) ? env.CLAUDE_PID : null);

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/** The folder's file with no `id`, the last session started there; with one, that session's own in that folder. */
export function sessionPath(env: Env, cwd: string, id?: string | null, platform: string = process.platform): string {
  const folder = resolve(cwd);
  /* Windows paths ignore case, and Claude Code and a shell do not always agree on a drive letter's. */
  const key = platform === 'win32' ? folder.toLowerCase() : folder;
  const name = id === undefined || id === null ? hash(key) : `${hash(key)}-${hash(id)}`;
  return join(dirname(hostsPath(env, platform)), 'sessions', `${name}.json`);
}

/** The run a Claude Code window last started, by the window's process id, whatever folder it started in. */
export function windowPath(env: Env, pid: string, platform: string = process.platform): string {
  return join(dirname(hostsPath(env, platform)), 'sessions', `window-${pid}.json`);
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const instant = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x));

/** The file, or `null` when there is none or it is not one this command wrote. */
export function readSession(file: string): SessionFile | null {
  if (!existsSync(file)) return null;
  let x: unknown;
  try {
    x = JSON.parse(unbom(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
  if (!isObject(x) || typeof x.host !== 'string' || typeof x.spoken !== 'string' || !SPOKEN.test(x.spoken)) return null;
  return {
    host: x.host,
    spoken: x.spoken,
    ...(typeof x.client_id === 'string' && CLIENT.test(x.client_id) ? { client_id: x.client_id } : {}),
    head_at_start: typeof x.head_at_start === 'string' && SHA.test(x.head_at_start) ? x.head_at_start : null,
    at: typeof x.at === 'string' ? x.at : '',
    ...(instant(x.seen) ? { seen: x.seen } : {}),
    ...(instant(x.ended) ? { ended: x.ended } : {}),
    ...(typeof x.pid === 'string' && PID.test(x.pid) ? { pid: x.pid } : {}),
    ...(typeof x.cwd === 'string' && PRINTABLE.test(x.cwd) ? { cwd: x.cwd } : {}),
    ...(typeof x.repo === 'string' && PRINTABLE.test(x.repo) ? { repo: x.repo } : {}),
    ...(typeof x.remote === 'string' && PRINTABLE.test(x.remote) ? { remote: x.remote } : {}),
    ...(isObject(x.heads) ? { heads: headsOf(x.heads) } : {}),
    ...(typeof x.hook_ms === 'number' && Number.isInteger(x.hook_ms) && x.hook_ms >= 0 && x.hook_ms <= HOOK_MARK_MAX_MS ? { hook_ms: x.hook_ms } : {}),
    ...(sentOf(x.commands) === undefined ? {} : { commands: sentOf(x.commands)! }),
    ...(typeof x.handoff_head === 'string' && SHA.test(x.handoff_head) ? { handoff_head: x.handoff_head } : {}),
  };
}

/* A start hook is stopped at its budget, so a time past a minute is a clock that jumped, not a hook, and is not sent. */
const HOOK_MARK_MAX_MS = 60_000;

/* A place as a header may carry it, and a folder's HEADs as git writes them under a relative path that stays inside. */
const PRINTABLE = /^[\x20-\x7e]{1,512}$/;
const headsOf = (x: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(x).filter(([rel, sha]) => typeof sha === 'string' && /^[0-9a-f]{40,64}$/.test(sha) && PRINTABLE.test(rel) && !rel.split('/').includes('..')) as [string, string][]);

/**
 * The file a caller in a folder remembers: with a session id, that session's own, or the folder's when an older start
 * hook wrote only that one and it names this session; with none, the folder's.
 */
export function rememberedIn(env: Env, cwd: string, id: string | null): SessionFile | null {
  if (id !== null) {
    const own = readSession(sessionPath(env, cwd, id));
    if (own !== null) return own;
  }
  return readSession(sessionPath(env, cwd));
}

/* Written whole and renamed, at 0600 in a folder made at 0700, as the hosts file is. */
export function writeSession(file: string, held: SessionFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(held)}\n`, { mode: 0o600 });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
}

/* ── which run is the caller's ─────────────────────────────────────────── */

/** A remembered run is a place to start for twelve hours after a hook last heard from it, the span of the record's sweep. */
export const REMEMBER_MS = 12 * 3_600_000;

/** A session resumed within the hour of a hook last hearing from it still holds its card, so the start hook says nothing. */
export const QUIET_MS = 3_600_000;

/** When a hook last heard from the session the file remembers: its start, or its end once it has ended. */
export function heardAt(held: SessionFile): number {
  const times = [held.at, held.seen].filter(instant).map((t) => Date.parse(t));
  return times.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...times);
}

/** Headers that name no run at all, so the record finds the caller by where it stands or not at all. */
export const withoutRun = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'x-braindog-session' && name !== 'x-braindog-client'));

/*
 * A REMEMBERED RUN IS THE CALLER'S ONLY WHEN THE CALLER CAN SAY SO. Measured on the owner's Mac: a subagent of S729 ran
 * `braindog context` in the repository's top folder, whose file still named S297 from three days before, and was told
 * it was S297 and that S729, its own session, was a second one in its working tree. So a remembered run is sent only
 * when:
 *
 *   1. inside a host session that says its id (`hostSessionOf`), the file was written by that same session. A file
 *      any other session wrote is not sent, and the host session's id is, which the record finds the run by;
 *   2. anywhere else, a hook heard from it in the last twelve hours. Past that it names a run that has ended, swept or
 *      not, and is not sent.
 *
 * A SERVER OUTLIVES THE SESSION IT WAS STARTED FOR. Claude Code gives a stdio MCP server the session's id once, when it
 * starts it, and keeps the server across `/clear` and a `/resume` picked inside the window, each of which is a session
 * with an id of its own. So for the server (`server`), the run its own window's start hook last wrote (`windowPath`,
 * the same Claude Code process, `pid`) is its session's, whatever the id. There is no rule by time any more: a file
 * written since the server started was taken for its own, and that was another window's whenever two windows shared a
 * folder. A server whose window did not say its process keeps its own session's run across a clear, which is the run
 * before it and never another window's.
 *
 * Whether a run that is sent has ended by its state is the record's to say, so a caller that can ask again does
 * (`context.ts`).
 */

/** A long-lived caller: the process that started it (`process.ppid`), and when it started. */
export type Server = { parent: number; since: number };

/** The run a remembered file names, when it is the caller's to send to this host; else `undefined`. */
export function heldFor(held: SessionFile | null, host: string, env: Env, now: number = Date.now(), server?: Server): SessionFile | undefined {
  if (held === null || held.host !== host) return undefined;
  const mine = hostSessionOf(env);
  if (mine !== null) return held.client_id === mine || (server !== undefined && held.pid === String(server.parent)) ? held : undefined;
  return now - heardAt(held) > REMEMBER_MS ? undefined : held;
}

/**
 * The run a caller in this folder sends, by the rules above: for a server, the run its window last started when that
 * window said its process; otherwise the caller's own session's file, or the folder's when it has no session id.
 */
export function heldHere(env: Env, cwd: string, host: string, now: number = Date.now(), server?: Server): SessionFile | undefined {
  if (server !== undefined) {
    const window = heldFor(readSession(windowPath(env, String(server.parent))), host, env, now, server);
    if (window !== undefined && window.pid === String(server.parent)) return window;
  }
  return heldFor(rememberedIn(env, cwd, hostSessionOf(env)), host, env, now, server);
}

/** Whether this process is a subagent Claude Code started inside another session, as its environment says. */
export const isChild = (env: Env): boolean => typeof env.CLAUDE_CODE_CHILD_SESSION === 'string' && env.CLAUDE_CODE_CHILD_SESSION !== '' && env.CLAUDE_CODE_CHILD_SESSION !== '0';

/**
 * The run a subagent works for, and where that run stands: the run its window last started, when this process is a
 * subagent (`isChild`) of a window that said its process, the run is another session's, and a hook heard from it in the
 * last twelve hours. `null` anywhere else.
 *
 * A SUBAGENT TAKES ITS PARENT RUN'S PROJECT. 416 of 743 runs were workflow subagents started in scratch folders, which
 * nothing could place; sent with the parent's place (`sessionHeaders`), each is placed where the work is.
 */
export function parentOf(env: Env, host: string, now: number = Date.now()): Parent | null {
  const pid = hostPidOf(env);
  if (!isChild(env) || pid === null) return null;
  const held = readSession(windowPath(env, pid));
  if (held === null || held.host !== host || held.pid !== pid || now - heardAt(held) > REMEMBER_MS) return null;
  if (held.client_id !== undefined && held.client_id === hostSessionOf(env)) return null;
  return { spoken: held.spoken, cwd: held.cwd ?? null, repo: held.repo ?? null, remote: held.remote ?? null };
}

/**
 * The session headers as this caller should send them, and whether they still name the folder's remembered run: the
 * rule above, held to headers somebody else built, so it holds however a command's headers were made.
 */
export function ownRun(headers: Record<string, string>, env: Env, held: SessionFile | null, now: number): { headers: Record<string, string>; remembered: boolean } {
  const mine = hostSessionOf(env);
  if (mine !== null) return { headers: headers['x-braindog-client'] === mine ? headers : { ...withoutRun(headers), 'x-braindog-client': mine }, remembered: false };
  const named = held !== null && headers['x-braindog-session'] === held.spoken;
  if (named && now - heardAt(held) > REMEMBER_MS) return { headers: withoutRun(headers), remembered: false };
  return { headers, remembered: named };
}

/**
 * A command's io with its session headers held to `ownRun`, and whether the last request named the folder's remembered
 * run, for the commands that read or write as the caller's run: `context` and `session`.
 */
export function asCaller(io: AgentIo, now: number = Date.now()): { io: AgentIo; remembered: () => boolean } {
  const held = rememberedIn(io.env, io.cwd, hostSessionOf(io.env));
  let remembered = false;
  const headers = async (host: string) => {
    const sent = ownRun(await io.headers(host), io.env, held !== null && held.host === host ? held : null, now);
    remembered = sent.remembered;
    return sent.headers;
  };
  return { io: { ...io, headers }, remembered: () => remembered };
}

/* ── the machine ───────────────────────────────────────────────────────── */

/* The label `braindog login` gives a machine by default: its network name and the command's. */
const DEFAULT_LABEL = / · braindog-cli$/u;

/* What a command may say about the machine, scrubbed, and short enough for the first line. */
const named = (text: string): string => words(text, 40);

/** The name a person gave this machine when it signed in, when they gave one rather than the default. */
function signedInAs(env: Env, host: string | null): string | null {
  if (host === null) return null;
  try {
    const entry = Object.entries(readHosts(hostsPath(env)).hosts).find(([written]) => sameHost(written, host))?.[1];
    const label = entry?.token?.label;
    return typeof label === 'string' && label.trim() && !DEFAULT_LABEL.test(label) ? named(label) || null : null;
  } catch {
    return null;
  }
}

/* macOS's own name for the machine, "Mara's MacBook Pro", or nothing when it does not say within a second and a half. */
const computerName = () =>
  new Promise<string>((done) =>
    execFile('scutil', ['--get', 'ComputerName'], { timeout: 1_500, windowsHide: true }, (e, out) => done(e ? '' : String(out).trim())),
  );

/* A Linux machine's pretty name, from `/etc/machine-info`, when somebody set one. */
function prettyName(): string {
  try {
    const line = readFileSync('/etc/machine-info', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('PRETTY_HOSTNAME='));
    return line === undefined ? '' : line.slice('PRETTY_HOSTNAME='.length).replace(/^["']|["']$/gu, '').trim();
  } catch {
    return '';
  }
}

/**
 * This machine as a person names it, for the card's first line: "MacBook Pro", never "Maras-MacBook-Pro.local".
 *
 * THE NAME IT WAS ENROLLED UNDER WHEN A PERSON CHOSE ONE. Otherwise the system's own name with its owner taken off
 * ("Mara's MacBook Pro" is "MacBook Pro"), and failing that what kind of machine it is. The login label is not used
 * when it is the default, because that is the network name, and on the owner's Mac it was a Windows PC's, copied over
 * with the hosts file.
 */
export async function deviceName(env: Env, host: string | null, platform: string = process.platform): Promise<string> {
  const chosen = signedInAs(env, host);
  if (chosen !== null) return chosen;
  if (platform === 'darwin') return named((await computerName()).replace(/^.+?['\u2019]s?\s+(?=\S)/u, '')) || 'Mac';
  if (platform === 'win32') return 'Windows PC';
  if (platform === 'linux') return named(prettyName()) || 'Linux';
  return 'this machine';
}

/* ── whom the questions wait on ────────────────────────────────────────── */

/** The longest the card waits to learn whose the questions are, before it says "the owner" instead. */
export const NAME_MS = 2_000;

/** Whom the questions wait on, and how many wait in all, as `boot` says them; each `null` when it did not say. */
export type Decides = { decider: string | null; waiting: number | null };

/**
 * The person the questions wait on, by the name the record has for them: the person this machine's sign-in speaks for,
 * as `boot` says it ("Mara"), and how many questions wait on Decide in all, where `context` lists only the newest. Each
 * is `null` when the record does not say, refuses, or does not answer in time.
 *
 * ASKED ONLY WHEN A QUESTION WAITS, and beside the work that follows the attach rather than after it, because it is one
 * more read at the start of every session and a card with nothing waiting has no use for the name.
 */
export async function whoDecides(client: Client): Promise<Decides> {
  try {
    const said = await client.boot();
    const name = said.ok ? said.value.me?.name : null;
    const open = said.ok ? said.value.counts?.decide : null;
    return {
      decider: typeof name === 'string' && name.trim() ? words(name, 40) || null : null,
      waiting: typeof open === 'number' && Number.isInteger(open) && open >= 0 ? open : null,
    };
  } catch {
    return { decider: null, waiting: null };
  }
}

/* ── a command older than its host ─────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026.10.07` as a person says it, `7 Oct`. */
const dayName = (day: string): string => {
  const [, m, d] = day.split('.').map(Number) as [number, number, number];
  return `${String(d)} ${MONTHS[m - 1] ?? ''}`.trim();
};

/**
 * THE ONE LINE THAT SAYS THIS COMMAND LINE IS OUT OF DATE, or `null`. His machines ran the
 * command of 7 October for thirteen days while the host was on 20 October, and nothing said so: the build address's
 * line waits fourteen days, and the record's card says it only below `min_cli`.
 *
 * FROM WHAT THE START ALREADY HOLDS, SO IT COSTS NO REQUEST: the attach's own context, which says whether this command
 * is older than the oldest the host works with (`build.behind`), and the host's build as the bridge last heard it
 * (`hostBuild`, its door cache). A command built on a day before the host's is out of date, because each deploy
 * publishes the command it was built with. A checkout's build has no day and is never called out of date.
 *
 * SAID ONCE. Not when the record's card already says to update, and not when the build address's line (`behindLine`,
 * printed above the card by the same hook) already does (`already`).
 */
export function staleLine(build: string, c: Context | undefined, hostBuild: string | null, host: string, already = false): string | null {
  const mine = buildDay(build);
  if (mine === null || already) return null;
  const theirs = buildDay(hostBuild);
  const newer = theirs !== null && theirs > mine;
  const below = (c as { build?: { behind?: unknown } | null } | undefined)?.build?.behind === true;
  if (!newer && !below) return null;
  if (cardOf(c)?.some((line) => /braindog update/u.test(line))) return null;
  return `Your BrainDog command line is out of date (built ${dayName(mine)}${newer ? `, ${host} is on ${dayName(theirs)}` : ''}). Run braindog update, then start a new session.`;
}

/** The host's build as this machine last heard it: the bridge's door cache, else the build address's kept answer. */
function hostBuildOf(home: string, key: string): string | null {
  const door = readDoorCache(home, key)?.build;
  if (typeof door === 'string' && door !== '') return door;
  return checkedOf(home, key)?.app ?? null;
}

/** What `behindLine` kept for this host in `~/.braindog/update-check.json`, or `null`. */
function checkedOf(home: string, key: string): { app: string | null; min_cli: string | null } | null {
  try {
    const x: unknown = JSON.parse(unbom(readFileSync(checkPath(home), 'utf8')));
    const kept = isObject(x) && isObject(x.hosts) ? x.hosts[key] : undefined;
    if (!isObject(kept)) return null;
    return { app: typeof kept.app === 'string' ? kept.app : null, min_cli: typeof kept.min_cli === 'string' ? kept.min_cli : null };
  } catch {
    return null;
  }
}

/** Whether `behindLine` says this command is behind, from the answer it kept today, so its line and this one are not both said. */
function behindSaysIt(home: string, key: string, build: string): boolean {
  const kept = checkedOf(home, key);
  try {
    return kept !== null && behindSaid(build, kept, hostName(key)) !== null;
  } catch {
    return false;
  }
}

/** Whether a card drawn here, rather than the record's own, would say whom its questions wait on. */
export const asksWaiting = (c: Context | undefined): boolean => c !== undefined && cardOf(c) === null && c.waiting.length > 0;

/* ── the event ─────────────────────────────────────────────────────────── */

type Event = { client_id?: string; cwd: string; source: 'startup' | 'resume' | 'clear' | 'compact' };
const SOURCES = ['startup', 'resume', 'clear', 'compact'] as const;

/**
 * Claude Code's JSON on stdin, read loosely: an empty or broken event is a startup in the process's folder, and so is a
 * `source` this hook does not name, as `fork` (a forked resume, a new conversation under a new id) is.
 */
export function eventOf(stdin: string, cwd: string): Event {
  let x: unknown;
  try {
    x = JSON.parse(stdin);
  } catch {
    x = {};
  }
  const said = isObject(x) ? x : {};
  const source = SOURCES.find((s) => s === said.source) ?? 'startup';
  return {
    cwd: typeof said.cwd === 'string' && said.cwd ? said.cwd : cwd,
    source,
    ...(typeof said.session_id === 'string' && CLIENT.test(said.session_id) ? { client_id: said.session_id } : {}),
  };
}

/* The host and its bearer, or the one line saying why there is neither. */
function reach(env: Env): Target | string {
  const hosts = hostsPath(env);
  try {
    /* AS CLAUDE CODE, whatever the environment says, so its own token is sent when setup made one (`target`). */
    const to = target(undefined, env, hosts, Date.now(), 'claude');
    return to.token ? to : notSignedIn(hosts);
  } catch (e) {
    const said = e instanceof Error ? e.message : '';
    return /^No BrainDog host is set/.test(said) ? notSignedIn(hosts) : `BrainDog: ${said}`;
  }
}

/**
 * How far HEAD moved since the handoff's commit. The commit comes from the record, so it must look
 * like one before git sees it.
 *
 * EXPORTED SO `context` SAYS THE SAME THING THE START HOOK SAYS. The two print one card through
 * one renderer, and a second copy of this git call would be the one place the two could come to
 * disagree about what "moved" counts.
 */
export async function movedSince(cwd: string, from: string | null, head: string | null): Promise<Moved> {
  if (!comparable(from, head)) return undefined;
  return countOf(await git(cwd, 'rev-list', '--count', `${from}..HEAD`));
}

/* Whether git is asked at all, and what its count says: the two halves of `movedSince`, so the start hook can ask git
   beside its other reads and still say exactly what `movedSince` would. */
const comparable = (from: string | null, head: string | null): from is string =>
  !!from && !!head && SHA.test(from) && !head.startsWith(from) && !from.startsWith(head);
const countOf = (said: string | null): Moved => {
  const count = Number(said);
  return Number.isInteger(count) && count > 0 ? count : null;
};

/**
 * The commits past a step at which the record hands a starting session the step before it instead (`FAR_BEHIND` in
 * `packages/record/src/index.ts`, held equal by `test/hook-start.test.ts`). A count this high changes which step
 * the attach answers with, so the start hook never sends one with its attach.
 */
export const FAR_BEHIND = 50;

/**
 * THE RECORD'S CARD, DRAWN AGAIN WITH THE COMMITS SINCE THE HANDOFF. The attach answers before anything here
 * knows which commit the handoff named, so when the record drew a card and HEAD has moved since that commit, the
 * context is read once more with `x-braindog-ahead` and its Next line can say "12 commits since". It is a read and not an
 * attach, so it opens nothing; one that fails, runs out of time or comes back without a card leaves the attach's card.
 * A host that draws no card is not asked again, because this command composes that card and counts the commits itself.
 */
export async function aheadCard(
  c: Context | undefined,
  moved: Moved,
  read: () => Promise<Awaited<ReturnType<Client['context']>>>,
  again = false,
): Promise<Context | undefined> {
  /* `again`: the card was drawn with a count for another commit than the one it handed (`hookStart`), so it is read
     once more whatever moved, with the count for its own commit or none. */
  if (c === undefined || cardOf(c) === null || (!again && (typeof moved !== 'number' || moved < 1))) return c;
  try {
    const again = await read();
    return again.ok && cardOf(again.value) !== null ? again.value : c;
  } catch {
    return c;
  }
}

/**
 * SessionStart: attach to the run, keep the session file, and say as much of the card as the session lacks.
 *
 * BY CLAUDE CODE'S `source`, because each one leaves the model holding something different:
 *
 *   - `startup`, and `clear`, which empties the conversation: the whole card.
 *   - `compact`: what he told the run that is still open, the stop first, then the Next line. The summary kept the
 *     rest, and the step and his words are what a compaction loses.
 *
 * WHAT HE TOLD THE RUN GOES FIRST in every card it prints (plan §2.3 A), each line the record's own card does not
 * already carry, and seeds the inbox file the prompt and tool hooks read until the bridge's first pulse.
 *   - `resume` within the hour of the same session last being heard from: nothing, because its card is still in the
 *     conversation. A resume after longer gets the whole card.
 *
 * ONE ROUND TRIP BEFORE THE CARD (measured 7.9 to 8.05 s for 10 of 12 starts). The
 * attach answers the context, the card and whether this command is behind its host; the skills sync and the tools scan
 * run after the card in a process of their own, and only when what they read moved (`startOwed` in `session-start.ts`);
 * the time mark rides beside the attach; and the line saying this command line is out of date comes from what the start
 * already holds (`staleLine`). A subagent is told one line and does no start work.
 *
 * WHAT EACH ONE SENDS, MEASURED on Claude Code 2.1.295 (9 October 2026; `test/fixtures/hook-events/`, and the table
 * under "The session hooks" in `docs/48-SPEC-CLI.md`). `resume` comes back here with the resumed conversation's own
 * `session_id`, whether by `--resume <id>`, `--continue`, or `/resume` picked inside a window (which first ends the
 * open session with reason `resume`), so `attach` finds the run by it and re-attaches rather than opening a second run,
 * and even a quiet resume brings the run back to active. `clear` ends the old session (reason `clear`) and comes with a
 * new `session_id` in the same process, as a new transcript, so it is a run of its own, and the file says so to the MCP
 * server the window keeps (`heldFor`). A forked resume (`--fork-session`) comes as `source: "fork"` with a new
 * `session_id`, which this hook reads as a `startup`: a new run, and its card. `compact` WAS NOT MEASURED: the capture
 * profile was not signed in, so no compaction ran and no SessionStart followed its PreCompact. That it keeps the
 * `session_id` is still the assumption.
 */
export async function hookStart(io: Io): Promise<void> {
  /* WHEN THIS PROCESS STARTED, so the hook's time counts Node's own start and the module load, which a person waits
     through as much as the attach. */
  const started = io.began ?? performance.timeOrigin;
  const event = eventOf(io.stdin, io.cwd);
  const id = event.client_id ?? null;
  const before = rememberedIn(io.env, event.cwd, id);
  const began = Date.now();
  const soon =
    event.source === 'resume' && before !== null && event.client_id !== undefined && before.client_id === event.client_id && began - heardAt(before) < QUIET_MS;
  const to = reach(io.env);
  mark('auth');
  if (typeof to === 'string') return soon ? undefined : io.write(to);

  const ms = hookBudget(io.env);
  const signal = AbortSignal.timeout(ms);
  /*
   * THE COMMITS SINCE THE STEP THE LAST START HERE WAS HANDED, counted beside the other reads and sent with the attach,
   * so its card already says them. Before, the attach was answered first and its card read once more with the count
   * (`aheadCard`), a second round trip on every start in a repository whose HEAD had moved, which is most of them. When
   * the attach hands the same step, its card is the one the second read would have drawn; when it hands another, that
   * read is still made, with the count for its own commit.
   */
  const guessed = before !== null && before.host === to.key && before.handoff_head !== undefined ? before.handoff_head : null;
  const counting = guessed === null ? Promise.resolve(null) : git(event.cwd, 'rev-list', '--count', `${guessed}..HEAD`);
  const [at, device, counted] = await Promise.all([positionOf(event.cwd), io.device ?? deviceName(io.env, to.key), counting]);
  const early: Moved = comparable(guessed, at.head) ? countOf(counted) : undefined;
  const sent = typeof early === 'number' && early < FAR_BEHIND ? early : undefined;
  mark('position');
  /* A FOLDER THAT IS NOT A REPOSITORY: the HEAD of each one under it, read beside the attach, so the end hook reads the
     commits of every one that moved. 28 of the 32 runs in the owner's ~/Developer started there. */
  const heads = at.repo === null ? childHeads(event.cwd).catch(() => ({})) : Promise.resolve({});
  /* A subagent says the run it works for, and that run's place when it stands in no repository of its own. */
  const child = isChild(io.env);
  const parent = child ? parentOf(io.env, to.key) : null;
  /* NO RUN NAMED, AND THE SESSION'S OWN ID: attaching finds the run by it, so an old run named in a file is never sent. */
  const mine = event.client_id === undefined ? undefined : { client_id: event.client_id };
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', mine, { env: io.env, parent, ahead: sent }), signal);
  /* THE LAST START HOOK'S TIME RIDES BESIDE THIS ATTACH, when it was this same session's (a compaction, a resume). NOT
     WAITED FOR HERE, so a slow mark never holds the card or eats the sync's budget: it is waited for last, once the card
     is written, and a path that returns early leaves it to the process, which stays open while it is in flight. */
  const owed = before !== null && event.client_id !== undefined && before.client_id === event.client_id ? before : null;
  const marking = owedMark(to, owed, at, io.env, signal);
  const out = await client.attach({
    source: event.source,
    ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
    ...(at.branch === null ? {} : { branch: at.branch }),
    ...(at.head === null ? {} : { head: at.head }),
  });
  mark('attach');
  if (!out.ok) {
    if (soon) return;
    if (signal.aborted || (refused(out) && out.refusal.code === 'UNREACHABLE')) return io.write(unreachable(ms));
    return io.write(`BrainDog: ${refused(out) ? out.refusal.fix : 'the host did not attach this session.'}`);
  }

  const run = out.value;
  /* The commit of the step the attach handed this run, which the next start here counts from. */
  const handed = run.context?.handoff?.head ?? null;
  /* The window this hook ran under, so the MCP server that window started knows a clear's new run is its own. */
  const pid = hostPidOf(io.env);
  /* The same run going on keeps the commits it started from, so what it did is still counted from there. */
  const same = before !== null && before.host === to.key && before.spoken === run.spoken;
  const fresh = await heads;
  const held: SessionFile = {
    host: to.key,
    spoken: run.spoken,
    ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
    head_at_start: same ? before.head_at_start : at.head,
    at: new Date().toISOString(),
    ...(pid === null ? {} : { pid }),
    ...(at.cwd && PRINTABLE.test(at.cwd) ? { cwd: at.cwd } : {}),
    ...(at.repo === null ? {} : { repo: at.repo }),
    ...(at.remote === null ? {} : { remote: at.remote }),
    ...(same && before.heads !== undefined ? { heads: before.heads } : Object.keys(fresh).length > 0 ? { heads: fresh } : {}),
    /* WHAT THE FOLDER'S COMMAND LINES LAST SENT carries over, to the same host, so a new session does not send them again. */
    ...(before !== null && before.host === to.key && before.commands !== undefined ? { commands: before.commands } : {}),
    ...(typeof handed === 'string' && SHA.test(handed) ? { handoff_head: handed } : {}),
  };
  /* THE SESSION'S OWN FILE, THE FOLDER'S, AND THE WINDOW'S. A subagent's run is never its window's. */
  const files = [...(id === null ? [] : [sessionPath(io.env, event.cwd, id)]), sessionPath(io.env, event.cwd), ...(pid === null || child ? [] : [windowPath(io.env, pid)])];
  for (const file of files)
    try {
      writeSession(file, held);
    } catch {
      /* A folder that cannot be written costs the MCP server its attribution, not the session its card. */
    }
  /*
   * WHAT HE TOLD THE RUN, FOR THE HOOKS THAT COME AFTER (plan §2.3 A and C): the inbox file seeded from the attach, so the
   * prompt and tool hooks have it before the bridge's first pulse, with each instruction this hook printed marked shown
   * at the start. Only for a session that says its id, which the file is named by.
   */
  const seed = (printed: readonly string[]) => {
    if (event.client_id !== undefined) seedInbox(io.env, event.client_id, to.key, run.spoken, run.context, printed);
  };
  try {
    /* QUIET ONLY WHEN THE RECORD AGREES it is the run the file remembered, so a resume the record placed elsewhere is told. */
    if (soon && before.host === to.key && before.spoken === run.spoken) return seed([]);

    /* The same step as the last start here: counted already, before the attach. */
    const kept = guessed !== null && handed === guessed;
    const moved = kept ? early : await movedSince(event.cwd, handed, at.head);
    const named = { spoken: run.spoken, ...mine };
    const left = () => Math.max(1, Math.min(NAME_MS, began + ms - Date.now()));
    /* Its card counted the commits for its own step, or none were sent: read again only as `aheadCard` says, and
       always when a count went with the attach for another step than the one it handed. */
    const told =
      kept && sent !== undefined
        ? run.context
        : await aheadCard(
            run.context,
            moved,
            () => clientFor(to, async () => sessionHeaders(at, 'claude', named, { env: io.env, parent, ahead: moved }), AbortSignal.timeout(left())).context(),
            sent !== undefined,
          );
    const shown = told === undefined || told === run.context ? run : { ...run, context: told };
    mark('ahead');
    /* THE STOP, THEN EVERY OPEN INSTRUCTION, NEVER CUT, each in his voice (`toldAtStart`), and the ids they name. */
    const heard = toldAtStart(run.context);
    const ids = [...heard.told.map((t) => t.id), ...(heard.stop === null ? [] : [heard.stop.id || heard.stop.kind])];
    /* AFTER A COMPACTION, the open instructions again and then Next: the two things a summary loses. */
    if (event.source === 'compact') {
      const line = nextLine(shown, moved);
      const said = [...heard.lines, ...(line === null ? [] : [line])];
      seed(ids);
      if (said.length > 0) io.write(said.join('\n'));
      return;
    }
    const where: Where = { repo: at.repo, host: at.host, device, agent: 'Claude Code' };
    /* FIRST, ABOVE THE CARD, as the lapse is: what to do before the work, in the words of the card's own Update line. */
    const home = io.home ?? homedir();
    const build = io.build ?? cliBuild();
    const stale = staleLine(build, shown.context, hostBuildOf(home, to.key), hostName(to.key), behindSaysIt(home, to.key, build));
    const card = briefing(shown, where, moved);
    /* A SUBAGENT WORKS FOR A RUN THAT ALREADY HOLDS THE CARD, so it is told one line, which run it is and where. */
    if (child) {
      seed(ids);
      return io.write(card.split('\n')[0]!);
    }
    /* ABOVE THE CARD, each line the record's own card does not already carry (by its instruction's name). */
    const above = heard.lines.filter((l) => {
      const named = /\((IN\d+)\)/u.exec(l)?.[1];
      return named === undefined || !card.includes(`(${named})`);
    });
    seed(ids);
    /* NO YES TO COPY THIS MACHINE'S SKILLS YET (`skills-consent.ts`): said once, under the card, with the command that asks. */
    const offer = run.context !== undefined && (event.source === 'startup' || event.source === 'resume') ? startOffer(io, to, run.context) : null;
    io.write(`${stale === null ? '' : `${stale}\n`}${above.length === 0 ? '' : `${above.join('\n')}\n`}${card}${offer === null ? '' : `\n${offer}`}`);
    mark('card');
    /*
     * THE START WORK, AFTER THE CARD AND NEVER WAITED FOR. The skills sync and the tools scan held
     * every card for up to six seconds, and the card reads neither. Only a session that begins syncs: a compaction or a
     * clear is the same session going on (plan §4.3 step 6). Whether it is owed is read here from the attach's context
     * and this machine's files, with no request, so a start where nothing moved starts no process.
     */
    if (run.context !== undefined && (event.source === 'startup' || event.source === 'resume') && startOwed(io, to, at, run.context, await topOf(at)))
      (io.work ?? spawnWork(io.env))({ host: to.key, at, context: run.context, run: named });
    mark('owed');
  } finally {
    /* THE HOOK'S OWN TIME, from the process's start to the card printed, kept for the next hook of this session to send
       beside the call it makes anyway (`owedMark`). Written last, so it counts the sync, the scan and the card. */
    const hook_ms = Math.max(0, Math.round(Date.now() - started));
    for (const file of files)
      try {
        writeSession(file, { ...held, hook_ms });
      } catch {
        /* The same folder as above: the sign loses one time, and nothing else. */
      }
    await marking;
    mark('marked');
  }
}

/* The start work itself (`startWork`) lives in `session-start.ts`, so the MCP server can do it too for an app with no hook. */
export { START_WORK_MS } from './session-start.ts';

/**
 * What the start hook hands the work it leaves for after the card: the host it attached to, where the session stands,
 * the attach's context and the run. NEVER A TOKEN: the process that does the work signs in from this machine's own
 * sign-in, as the hook did, and refuses a job for another host.
 */
export type WorkJob = { host: string; at: Position; context: Context; run: { spoken: string; client_id?: string } };

/* The job files live beside the session files, at 0600, and each is read once and deleted. */
const workDir = (env: Env): string => join(dirname(hostsPath(env)), 'sessions');

/**
 * The start work in a process of its own, detached, so the hook ends once the card is printed: the job written to a
 * file beside the session files, and `braindog hook later <file>` started on it with stdio ignored.
 */
export const spawnWork =
  (env: Env, cli: string = fileURLToPath(new URL('./main.ts', import.meta.url))) =>
  (job: WorkJob): void => {
    try {
      const dir = workDir(env);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `later-${randomBytes(8).toString('hex')}.json`);
      writeFileSync(file, `${JSON.stringify(job)}\n`, { mode: 0o600 });
      const started = spawn(process.execPath, [cli, 'hook', 'later', file], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as NodeJS.ProcessEnv,
      });
      started.on('error', () => undefined);
      started.unref();
    } catch {
      /* A process that cannot be started leaves the work for the next start, whose tag still says it is owed. */
    }
  };

/**
 * `braindog hook later <file>`: the start work a start hook left, done in the background. Reads the job once and deletes
 * it, signs in as the hook did, and does the sync and the scan with a budget no card waits on (`WORK_MS`). Says nothing
 * on any stream; what it did is one line in the hook's log.
 */
export async function hookWork(env: Env, file: string, home?: string): Promise<void> {
  const at = resolve(file);
  if (dirname(at) !== resolve(workDir(env)) || !/^later-[0-9a-f]{16}\.json$/u.test(basename(at))) return;
  let job: WorkJob;
  try {
    job = JSON.parse(unbom(readFileSync(at, 'utf8'))) as WorkJob;
  } catch {
    return;
  } finally {
    rmSync(at, { force: true });
  }
  const to = reach(env);
  if (typeof to === 'string' || to.key !== job.host || !isObject(job.context) || !isObject(job.at)) return;
  try {
    const did = await startWork({ env, home }, to, job.at, job.context, job.run, Date.now() + WORK_MS, undefined, WORK_STEP_MS);
    if (did.length > 0) hookLog(env, `At the start of ${job.run.spoken}: ${did.join(', ')}.`);
  } catch {
    hookLog(env, 'The start work failed, so it is owed at the next start.');
  }
}

/* ── the people met in this session's commits ──────────────────────────── */

/** The most authors one session's end sends to `meet`. */
export const MET_PER_SESSION = 10;

/**
 * A repository the session's commits are read from: its folder, its name, and the commit the session started at.
 * `whole` reads every commit since the repository joined its project instead (`wholeToday`), once a day a folder.
 */
export type MovedRepo = { dir: string; repo: string; from: string; whole?: true };

/** Where the day each folder's authors were last read whole is kept, beside the hosts file. */
export const peopleDayPath = (env: Env): string => join(dirname(hostsPath(env)), 'people-day.json');

/**
 * THE REPOSITORIES TO READ WHOLE TODAY: every author since the repository joined its project, not only this
 * session's, once a day a folder, so somebody who committed between his sessions is met too. The day is written for
 * each one marked, and a file that does not read is no day. Never throws.
 */
export function wholeToday(env: Env, moved: readonly MovedRepo[], now: number = Date.now()): MovedRepo[] {
  const file = peopleDayPath(env);
  const today = new Date(now).toISOString().slice(0, 10);
  let kept: Record<string, unknown> = {};
  try {
    const x = JSON.parse(unbom(readFileSync(file, 'utf8'))) as unknown;
    if (x !== null && typeof x === 'object' && !Array.isArray(x)) kept = x as Record<string, unknown>;
  } catch {
    kept = {};
  }
  const out = moved.map((m) => (kept[m.dir] === today ? m : { ...m, whole: true as const }));
  if (out.some((m) => m.whole)) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      const next = Object.fromEntries([...Object.entries(kept).filter(([, d]) => d === today), ...out.map((m) => [m.dir, today] as const)].slice(-200));
      writeFileSync(file, `${JSON.stringify(next)}\n`);
    } catch {
      /* A day not written reads the folder whole again at the next end, which meets nobody twice. */
    }
  }
  return out;
}

/**
 * The authors of several logs in `LOG_FORMAT`, each with its repository's name, newest commit first within each, each
 * author once by key, at most ten, as `meet` takes them.
 *
 * NOBODY TO MEET: a bot, a CI or machine user, a coding agent, the owner by any of his keys or names, an author with no
 * address, because a name alone is what `meet` never joins on (`authoredIn` in `people.ts`), and an author with fewer
 * than `MIN_COMMITS` since the repositories joined their projects (`commits`), so one drive-by commit pulled in is
 * nobody yet.
 */
export function authorsOf(logs: readonly { log: string; repo: string }[], own: Owner, commits: ReadonlyMap<string, number>): Meeting[] {
  const seen = new Set<string>();
  const out: Meeting[] = [];
  for (const { log, repo } of logs)
    for (const a of authoredIn(log, own)) {
      if (seen.has(a.key) || (commits.get(a.key) ?? 0) < MIN_COMMITS) continue;
      seen.add(a.key);
      out.push(meetingOf(a, repo));
      if (out.length === MET_PER_SESSION) return out;
    }
  return out;
}

/**
 * Send the authors of the commits made since the run began, in every repository that moved and a project lists, to
 * `meet`, as the run.
 *
 * IT ONLY READS THE REPOSITORIES, AND IT IS SILENT. The record's projects and the owner's own row are read once, and
 * only when a repository moved; a repository no project lists by its remote or its folder is not read at all
 * (`listedBy` in `people.ts`). Any refusal ends it, People switched off and a host that is down included, except one
 * author's malformed address, which skips that author. None of this is the session's to hear about.
 *
 * IT FAILS CLOSED. Nobody is met when the owner's own row cannot be read, and only the commits made since a repository
 * joined its project count, each once by its hash, so pulling a listed fork's upstream meets nobody from upstream.
 */
export async function harvest(moved: readonly MovedRepo[], reader: Reader | null, meet: MeetCall, until: number): Promise<void> {
  if (reader === null || moved.length === 0) return;
  /* THE READ STOPS AT THE DEADLINE TOO: a record with many lists, or a slow host, must not spend the handoff's time. */
  let layout: Layout | null;
  try {
    layout = await Promise.race([readLayout(reader), new Promise<null>((done) => setTimeout(done, Math.max(0, until - Date.now()), null).unref())]);
  } catch {
    return;
  }
  /* NOBODY WHEN THE OWNER'S OWN ROW CANNOT BE READ: his commits under another address would be met as a stranger's. */
  if (layout === null || layout.self === null) return;
  const self = layout.self;
  const places = await Promise.all(moved.map((m) => localRepo(m.dir)));
  /* EACH WITH WHEN IT JOINED ITS PROJECT, and one whose joining the record does not show is not read. */
  const joined = await Promise.all(
    moved.map(async (_, i) => {
      const at = places[i] ?? null;
      const project = at === null ? null : listedBy(layout.projects, at);
      return at === null || project === null ? null : joinedAt(reader, project, at);
    }),
  );
  const listed = moved.flatMap((m, i) => (joined[i] ? [{ ...m, since: joined[i] }] : []));
  if (listed.length === 0 || Date.now() >= until) return;
  /* ONE COMMIT COUNTS ONCE, by its hash, however many checkouts under this folder hold it. */
  const counted = new Map<string, Set<string>>();
  const [logs, own] = await Promise.all([
    Promise.all(listed.map(async (m) => ({ log: await git(m.dir, 'log', LOG_FORMAT, `--since=${m.since}`, m.whole === true ? 'HEAD' : `${m.from}..HEAD`), repo: m.repo }))),
    ownerOf(self, listed.map((m) => m.dir)),
    ...listed.map((m) => commitsBy(m.dir, m.since, counted)),
  ]);
  const commits = new Map([...counted].map(([key, shas]) => [key, shas.size]));
  const read = logs.filter((l): l is { log: string; repo: string } => l.log !== null);
  const send = meeter(meet);
  for (const who of authorsOf(read, own, commits)) {
    if (Date.now() >= until) return;
    const out = await send(who);
    if (refused(out) && out.refusal.code !== 'VALUE_MALFORMED') return;
  }
}

/** The repositories a session's commits are read from: its own, or each one under its folder whose HEAD moved. */
export async function movedRepos(cwd: string, held: SessionFile, repo: string | null): Promise<MovedRepo[]> {
  const out: MovedRepo[] = [];
  if (held.head_at_start !== null && repo !== null) out.push({ dir: cwd, repo, from: held.head_at_start });
  const heads = Object.entries(held.heads ?? {});
  const now = await Promise.all(heads.map(([rel]) => git(join(cwd, rel), 'rev-parse', 'HEAD')));
  heads.forEach(([rel, from], i) => {
    const head = now[i];
    if (head && head !== from) out.push({ dir: join(cwd, rel), repo: basename(rel), from });
  });
  return out;
}

/**
 * Where a session's work was, as its end says it: the folder it started in, or, for one started in a folder that is no
 * repository, the one repository under it whose HEAD moved, with that repository's remote, folder, branch and commit.
 * The record places a run that has no project yet by what its next call says (`placeOnce` in the kernel), so a run
 * started in `~/Developer` that only worked in `braindog` lands in BrainDog.
 *
 * ONE OR NOTHING. Two repositories that moved are two places, and picking one would be a guess, so the run keeps its
 * folder's position, as it always had. A session started inside a repository is never moved to another, and a
 * repository whose position cannot be read leaves the folder's.
 */
export async function workedIn(here: Position, moved: readonly MovedRepo[]): Promise<Position> {
  if (here.repo !== null || moved.length !== 1) return here;
  const there = await positionOf(moved[0]!.dir);
  return there.repo === null ? here : there;
}

/**
 * SessionEnd: the people met in this session's commits, then the run ends, with the branch and commit it
 * stopped at.
 *
 * `end`, AND THE RECORD PICKS THE STATE. This hook used to write `idle`, and the twelve-hour sweep takes an
 * idle run as abandoned, so about 740 of the owner's 752 runs that closed normally read Abandoned the next day. Now it
 * sends no state at all: a run that left a fresh next step waits as a handoff, and any other is done, its helpers with
 * it. A crashed session still never says it stopped, and the sweep still takes that one. Ending a run that already
 * ended changes nothing, so a hook that fires twice writes one end.
 *
 * AN OLDER HOST HAS NO `end`, and answers that it has no such method (`ROUTE_UNKNOWN`, or `NOT_IN_THIS_BUILD` from a
 * host whose record is older than its routes). Only then does the hook write `idle` as it always did, so a self-host
 * not yet updated keeps the run it had. A host that did not answer is not asked twice: the budget is spent.
 */
export async function hookEnd(io: Io): Promise<void> {
  const event = eventOf(io.stdin, io.cwd);
  const to = reach(io.env);
  if (typeof to === 'string') return;
  const id = event.client_id ?? null;
  const own = id === null ? null : readSession(sessionPath(io.env, event.cwd, id));
  const file = own !== null && id !== null ? sessionPath(io.env, event.cwd, id) : sessionPath(io.env, event.cwd);
  const held = own ?? readSession(file);
  if (!held || held.host !== to.key) return;
  /* Another session in this folder wrote the folder's file since, so the run in it is not this session's to end. */
  if (event.client_id !== undefined && held.client_id !== undefined && event.client_id !== held.client_id) return;
  /* WHEN THE SESSION WAS LAST HEARD FROM, so a resume soon after knows its card is still in the conversation. Written
     before anything is sent, so a host that is slow to answer cannot cost it. The folder's file too, while it still
     names this run, for a shell in the folder. */
  const seen = new Date().toISOString();
  /* THE START HOOK'S TIME GOES WITH THIS END, so it leaves both files as it is sent and is never sent twice. */
  const { hook_ms: _owed, ...kept } = held;
  try {
    writeSession(file, { ...kept, seen });
    const folder = sessionPath(io.env, event.cwd);
    const there = folder === file ? null : readSession(folder);
    if (there !== null && there.spoken === held.spoken && there.host === held.host) {
      const { hook_ms: _same, ...rest } = there;
      writeSession(folder, { ...rest, seen });
    }
  } catch {
    /* A folder that cannot be written costs the next resume its quiet, and nothing else. */
  }

  const here = await positionOf(event.cwd);
  const budget = hookBudget(io.env);
  const moved = await movedRepos(event.cwd, held, here.repo);
  const at = await workedIn(here, moved);
  /* One client and one deadline for both, so the hook's whole budget is one number. */
  const run = { spoken: held.spoken, client_id: event.client_id ?? held.client_id };
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', run, { env: io.env }), AbortSignal.timeout(budget));
  /* THE HARVEST GOES FIRST, AND STOPS SENDING AT HALF THE BUDGET. A write brings a run that waits as a
     handoff back to active, so people met after the end would undo it; and the end, which is what this
     hook is for, keeps time to land. */
  const until = Date.now() + budget / 2;
  /* Beside the harvest and the end, on the same deadline, so the mark adds no wait to the hook. */
  const marked = owedMark(to, held, at, io.env, AbortSignal.timeout(budget));
  /* THE PROJECT'S COMMAND LINES, beside the harvest and done before the end, on the harvest's deadline: `toolsSeen` is a
     write, and one landing after the end would bring a run that waits as a handoff back to active. Only for a session
     that stands in a repository, whose own settings they are. */
  const listed = here.repo === null ? null : sendCommands(io, to, at, run, [file, sessionPath(io.env, event.cwd)], Math.max(1, until - Date.now()));
  if (moved.length > 0) await harvest(wholeToday(io.env, moved), client, (args) => client.call('meet', args), until);
  await listed;
  const where = { ...(at.branch === null ? {} : { branch: at.branch }), ...(at.head === null ? {} : { head: at.head }) };
  const ended = await client.call('end', where);
  if (refused(ended) && OLDER_HOST.has(ended.refusal.code)) await client.handoff({ state: 'idle', ...where });
  /* THE END LANDED: said on the session's file, for the bridge, which sends it itself when this is not there in time. */
  if (ended.ok) {
    try {
      const now = readSession(file);
      if (now !== null && now.spoken === held.spoken) writeSession(file, { ...now, ended: new Date().toISOString() });
    } catch {
      /* A folder that cannot be written costs one more `end`, which changes nothing. */
    }
  }
  await marked;
}

/**
 * The programs this project's own Claude Code settings allow by name, sent once as `toolsSeen`'s command lines
 * (its settings half; `commands-used.ts`). By name only: nothing else of an entry leaves the machine.
 *
 * NO TRANSCRIPT. The scope also counts the shell calls in the session's log; his "transcripts never read" wins, so
 * only the folder's `.claude/settings.json` and `.claude/settings.local.json` are read.
 *
 * ONCE A DAY FOR A FOLDER. The list sent is remembered in the session's own file and the folder's, and the start hook
 * carries it to the next session, so the same list is not sent again within the day. Only a list the host took is
 * remembered.
 *
 * NEVER FAILS THE HOOK, AND PRINTS NOTHING: the end hook says nothing to the session. A host that has no `toolsSeen`,
 * that refuses it or that does not answer in time is one line in the hook's log (`hookLog`), and nothing else changes.
 */
export async function sendCommands(
  io: Io,
  to: Target,
  at: Position,
  run: { spoken: string; client_id?: string | undefined },
  files: readonly string[],
  ms: number,
  send: SendSeen = (args) => clientFor(to, async () => sessionHeaders(at, 'claude', run, { env: io.env }), AbortSignal.timeout(ms)).call<unknown>('toolsSeen', args),
): Promise<void> {
  try {
    const names = allowedPrograms(readAllowed(at.cwd));
    const sent = files.map((f) => readSession(f)?.commands).find((c) => c !== undefined);
    if (!owedCommands(names, sent, Date.now())) return;
    /* The machine by the name the tools scan gives it (`tools.ts`), so both kinds of row name the same one. */
    const out = await send({ machine: at.host, found: usedTools(names) });
    if (!out.ok) {
      const code = refused(out) ? out.refusal.code : '';
      return hookLog(
        io.env,
        OLDER_HOST.has(code)
          ? 'This host does not record command lines yet, so this project\'s were not recorded.'
          : code === 'UNREACHABLE' || code === 'TIMEOUT'
            ? 'The host did not answer in time, so this project\'s command lines were not recorded.'
            : `The host did not record this project's command lines: ${refused(out) ? out.refusal.fix : 'no answer it could read.'}`,
      );
    }
    const commands: SentCommands = { names, at: new Date().toISOString() };
    for (const f of new Set(files)) {
      const there = readSession(f);
      if (there !== null && there.host === to.key) writeSession(f, { ...there, commands });
    }
  } catch {
    hookLog(io.env, "This project's command lines could not be sent, so none were recorded.");
  }
}

/** How the command lines are sent: `toolsSeen` on the run's own client, or a test's stand-in. */
export type SendSeen = (args: { machine: string; found: ReturnType<typeof usedTools> }) => Promise<Awaited<ReturnType<Client['call']>>>;

/* The hook's log keeps its last lines, so a machine never fills with them. */
const HOOK_LOG_MAX_BYTES = 64 * 1024;

/**
 * One quiet line in the hook's own log, `hook.log` beside the session files, which nobody is shown and a person can
 * read when the record lacks something. Never throws: a log that cannot be written loses the line.
 */
export function hookLog(env: Env, line: string): void {
  try {
    const file = join(dirname(hostsPath(env)), 'hook.log');
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (existsSync(file) && statSync(file).size > HOOK_LOG_MAX_BYTES) {
      const kept = readFileSync(file, 'utf8').split('\n').slice(-200).join('\n');
      writeFileSync(file, kept, { mode: 0o600 });
    }
    appendFileSync(file, `${new Date().toISOString()} ${line.replace(/\s+/gu, ' ').slice(0, 300)}\n`, { mode: 0o600 });
  } catch {
    /* The line is lost, and nothing else. */
  }
}

/**
 * The `hook` mark a session file still owes the agent door: how long the start hook that wrote it took. The
 * next hook of the same session sends it beside the call it makes anyway, the next start's `attach` or the end's `end`,
 * so timing the start hook costs the start hook no request and no wait of its own.
 *
 * AGAINST THE RUN THAT HOOK ATTACHED, by its spoken id and client id, so a clear's new run is never handed the time of
 * the one before it. With the command's build, which the record compares with its own. Never refuses the hook: a host
 * without `heard` answers that it has no such method, and a sign that is not kept costs nothing else.
 */
export async function owedMark(to: Target, held: SessionFile | null, at: Position, env: Env, signal: AbortSignal): Promise<void> {
  if (held === null || held.host !== to.key || held.hook_ms === undefined) return;
  const run = { spoken: held.spoken, ...(held.client_id === undefined ? {} : { client_id: held.client_id }) };
  try {
    await clientFor(to, async () => sessionHeaders(at, 'claude', run, { env }), signal).heard({ kind: 'hook', ms: held.hook_ms, build: cliBuild() });
  } catch {
    /* The client answers a refusal rather than throwing, and this holds if that ever changes: a lost sign, never a lost hook. */
  }
}

/** What a host with no `end` answers: no such method at all, or a route whose record is older than it. */
const OLDER_HOST: ReadonlySet<string> = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);
