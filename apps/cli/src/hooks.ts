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

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import type { Client, Context } from '@braindog/client';
import { refused } from '@braindog/ports';

import { briefing, cardOf, nextLine, words, type Moved, type Where } from './brief.ts';
import { budgetOf, clientFor, hostsPath, readHosts, sameHost, target, type Target } from './http.ts';
import { authoredIn, childHeads, commitsBy, joinedAt, listedBy, localRepo, LOG_FORMAT, meeter, meetingOf, MIN_COMMITS, ownerOf, readLayout, type Layout, type MeetCall, type Meeting, type Owner, type Reader } from './people.ts';
import { git, hostSessionOf, positionOf, sessionHeaders, type Parent, type Position } from './position.ts';
import { syncSkills, type AgentIo } from './skills.ts';
import { depositor, scanTools } from './tools.ts';

type Env = Record<string, string | undefined>;

/**
 * What a hook needs from its process, passed in so a test can hold all of it. `device` is the name this machine goes
 * by, when a test gives one; otherwise it is worked out (`deviceName`).
 */
export type Io = { env: Env; stdin: string; cwd: string; write: (text: string) => void; home?: string; device?: string };

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
 * reads the commits of every one that moved.
 */
export type SessionFile = {
  host: string;
  spoken: string;
  client_id?: string;
  head_at_start: string | null;
  at: string;
  seen?: string;
  pid?: string;
  cwd?: string;
  repo?: string;
  remote?: string;
  heads?: Record<string, string>;
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
    x = JSON.parse(readFileSync(file, 'utf8'));
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
    ...(typeof x.pid === 'string' && PID.test(x.pid) ? { pid: x.pid } : {}),
    ...(typeof x.cwd === 'string' && PRINTABLE.test(x.cwd) ? { cwd: x.cwd } : {}),
    ...(typeof x.repo === 'string' && PRINTABLE.test(x.repo) ? { repo: x.repo } : {}),
    ...(typeof x.remote === 'string' && PRINTABLE.test(x.remote) ? { remote: x.remote } : {}),
    ...(isObject(x.heads) ? { heads: headsOf(x.heads) } : {}),
  };
}

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

/* macOS's own name for the machine, "Sam's MacBook Pro", or nothing when it does not say within a second and a half. */
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
 * ("Sam's MacBook Pro" is "MacBook Pro"), and failing that what kind of machine it is. The login label is not used
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
 * as `boot` says it ("Sam"), and how many questions wait on Decide in all, where `context` lists only the newest. Each
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

/** Whether a card drawn here, rather than the record's own, would say whom its questions wait on. */
export const asksWaiting = (c: Context | undefined): boolean => c !== undefined && cardOf(c) === null && c.waiting.length > 0;

/* ── the event ─────────────────────────────────────────────────────────── */

type Event = { client_id?: string; cwd: string; source: 'startup' | 'resume' | 'clear' | 'compact' };
const SOURCES = ['startup', 'resume', 'clear', 'compact'] as const;

/** Claude Code's JSON on stdin, read loosely: an empty or broken event is a startup in the process's folder. */
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
    const to = target(undefined, env, hosts);
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
  if (!from || !head || !SHA.test(from) || head.startsWith(from) || from.startsWith(head)) return undefined;
  const count = Number(await git(cwd, 'rev-list', '--count', `${from}..HEAD`));
  return Number.isInteger(count) && count > 0 ? count : null;
}

/**
 * SessionStart: attach to the run, keep the session file, and say as much of the card as the session lacks.
 *
 * BY CLAUDE CODE'S `source`, because each one leaves the model holding something different:
 *
 *   - `startup`, and `clear`, which empties the conversation: the whole card.
 *   - `compact`: only the Next line. The summary kept the rest, and the step is what a compaction loses.
 *   - `resume` within the hour of the same session last being heard from: nothing, because its card is still in the
 *     conversation. A resume after longer gets the whole card.
 *
 * `compact` AND `resume` COME BACK HERE with the same `session_id`, and `attach` finds the run by it, so each
 * re-attaches rather than opening a second run, and even a quiet resume brings the run back to active. `clear` comes
 * with a new one, as a new transcript, so it is a run of its own, and the file says so to the MCP server the window
 * keeps (`heldFor`).
 */
export async function hookStart(io: Io): Promise<void> {
  const event = eventOf(io.stdin, io.cwd);
  const id = event.client_id ?? null;
  const before = rememberedIn(io.env, event.cwd, id);
  const began = Date.now();
  const soon =
    event.source === 'resume' && before !== null && event.client_id !== undefined && before.client_id === event.client_id && began - heardAt(before) < QUIET_MS;
  const to = reach(io.env);
  if (typeof to === 'string') return soon ? undefined : io.write(to);

  const ms = hookBudget(io.env);
  const signal = AbortSignal.timeout(ms);
  const [at, device] = await Promise.all([positionOf(event.cwd), io.device ?? deviceName(io.env, to.key)]);
  /* A FOLDER THAT IS NOT A REPOSITORY: the HEAD of each one under it, read beside the attach, so the end hook reads the
     commits of every one that moved. 28 of the 32 runs in the owner's ~/Developer started there. */
  const heads = at.repo === null ? childHeads(event.cwd).catch(() => ({})) : Promise.resolve({});
  /* A subagent says the run it works for, and that run's place when it stands in no repository of its own. */
  const child = isChild(io.env);
  const parent = child ? parentOf(io.env, to.key) : null;
  /* NO RUN NAMED, AND THE SESSION'S OWN ID: attaching finds the run by it, so an old run named in a file is never sent. */
  const mine = event.client_id === undefined ? undefined : { client_id: event.client_id };
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', mine, { env: io.env, parent }), signal);
  const out = await client.attach({
    source: event.source,
    ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
    ...(at.branch === null ? {} : { branch: at.branch }),
    ...(at.head === null ? {} : { head: at.head }),
  });
  if (!out.ok) {
    if (soon) return;
    if (signal.aborted || (refused(out) && out.refusal.code === 'UNREACHABLE')) return io.write(unreachable(ms));
    return io.write(`BrainDog: ${refused(out) ? out.refusal.fix : 'the host did not attach this session.'}`);
  }

  const run = out.value;
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
  };
  /* THE SESSION'S OWN FILE, THE FOLDER'S, AND THE WINDOW'S. A subagent's run is never its window's. */
  const files = [...(id === null ? [] : [sessionPath(io.env, event.cwd, id)]), sessionPath(io.env, event.cwd), ...(pid === null || child ? [] : [windowPath(io.env, pid)])];
  for (const file of files)
    try {
      writeSession(file, held);
    } catch {
      /* A folder that cannot be written costs the MCP server its attribution, not the session its card. */
    }
  /* QUIET ONLY WHEN THE RECORD AGREES it is the run the file remembered, so a resume the record placed elsewhere is told. */
  if (soon && before.host === to.key && before.spoken === run.spoken) return;

  const moved = await movedSince(event.cwd, run.context?.handoff?.head ?? null, at.head);
  if (event.source === 'compact') {
    const line = nextLine(run, moved);
    if (line !== null) io.write(line);
    return;
  }
  const named = { spoken: run.spoken, ...mine };
  /* Only a session that begins syncs: a compaction or a clear is the same session going on (plan §4.3 step 6). */
  const [more, decides] = await Promise.all([
    run.context !== undefined && (event.source === 'startup' || event.source === 'resume') ? startWork(io, to, at, run.context, named, began + ms) : [],
    asksWaiting(run.context)
      ? whoDecides(clientFor(to, async () => sessionHeaders(at, 'claude', named, { env: io.env }), AbortSignal.timeout(Math.max(1, Math.min(NAME_MS, began + ms - Date.now())))))
      : null,
  ]);
  const where: Where = { repo: at.repo, host: at.host, device, agent: 'Claude Code' };
  io.write(briefing(run, where, moved, { more, ...decides }));
}

/** Each of the sync and the scan gets at most this long, inside what is left of the hook's budget. */
export const START_WORK_MS = 3_000;

/**
 * Skills sync, then tools scan, at a session's start, and what each did as one item of the card's More.
 *
 * A COUNT AND NOT THE LINES. What the two did is housekeeping: files written, a row recorded, an edit proposed, which
 * the owner meets on Decide and `braindog skills sync` and `braindog tools scan` say in full. Their lines carried file
 * paths and ids, and are not what an agent starts from.
 *
 * NOTHING AT ALL WHEN THE RECORD HAS NEITHER REGISTER: no request, no file read. Each runs on its own client and
 * deadline, and a failure is one fixed item, because an error could quote anything.
 */
async function startWork(io: Io, to: Target, at: Position, context: Context, run: { spoken: string; client_id?: string }, until: number): Promise<string[]> {
  const wants = (id: string) => context.registers.some((r) => r.id === id);
  if (!wants('skills') && !wants('tools')) return [];
  const home = io.home ?? homedir();
  const found = await git(at.cwd, 'rev-parse', '--show-toplevel');
  const top = found === null ? null : resolve(found);
  const headers = sessionHeaders(at, 'claude', run, { env: io.env });
  const said: string[] = [];
  const step = async (label: string, work: (client: Client, signal: AbortSignal) => Promise<string[]>) => {
    const left = until - Date.now() - 250;
    if (left <= 0) return;
    const signal = AbortSignal.timeout(Math.min(START_WORK_MS, left));
    try {
      const lines = await work(clientFor(to, async () => headers, signal), signal);
      if (lines.length > 0) said.push(`${label}: ${String(lines.length)} change${lines.length === 1 ? '' : 's'}`);
    } catch {
      said.push(`${label} skipped`);
    }
  };
  if (wants('skills'))
    await step('skills sync', (client) => syncSkills({ client, context, home, configDir: io.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), top, dryRun: false }));
  if (wants('tools'))
    await step('tools scan', (client, signal) =>
      scanTools({
        client,
        context,
        top,
        cwd: at.cwd,
        home,
        dryRun: false,
        deposit: depositor({ file: hostsPath(io.env), env: io.env, host: to.key, headers, signal }),
        /* The no-grant sentence once, not at every start. */
        once: { host: to.key, hosts: hostsPath(io.env) },
      }),
    );
  return said;
}

/* ── the people met in this session's commits ──────────────────────────── */

/** The most authors one session's end sends to `meet`. */
export const MET_PER_SESSION = 10;

/** A repository the session's commits are read from: its folder, its name, and the commit the session started at. */
export type MovedRepo = { dir: string; repo: string; from: string };

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
    Promise.all(listed.map(async (m) => ({ log: await git(m.dir, 'log', LOG_FORMAT, `--since=${m.since}`, `${m.from}..HEAD`), repo: m.repo }))),
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
 * SessionEnd: the people met in this session's commits, then the run goes idle, with the branch and
 * commit it stopped at.
 *
 * IDLE, NEVER DONE. A terminal closing is not the work finishing, and a crashed session never says it
 * stopped, so only a person or the agent itself marks a run done. A run already handed off, done or
 * abandoned has no declared move to idle, so the record refuses this and the run stays as it was.
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
  /* Another session in this folder wrote the folder's file since, so the run in it is not this session's to idle. */
  if (event.client_id !== undefined && held.client_id !== undefined && event.client_id !== held.client_id) return;
  /* WHEN THE SESSION WAS LAST HEARD FROM, so a resume soon after knows its card is still in the conversation. Written
     before anything is sent, so a host that is slow to answer cannot cost it. The folder's file too, while it still
     names this run, for a shell in the folder. */
  const seen = new Date().toISOString();
  try {
    writeSession(file, { ...held, seen });
    const folder = sessionPath(io.env, event.cwd);
    const there = folder === file ? null : readSession(folder);
    if (there !== null && there.spoken === held.spoken && there.host === held.host) writeSession(folder, { ...there, seen });
  } catch {
    /* A folder that cannot be written costs the next resume its quiet, and nothing else. */
  }

  const at = await positionOf(event.cwd);
  const budget = hookBudget(io.env);
  /* One client and one deadline for both, so the hook's whole budget is one number. */
  const run = { spoken: held.spoken, client_id: event.client_id ?? held.client_id };
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', run, { env: io.env }), AbortSignal.timeout(budget));
  /* THE HARVEST GOES FIRST, AND STOPS SENDING AT HALF THE BUDGET. A write brings an idle run back to
     active, so people met after the handoff would undo it; and the handoff, which is what this hook is
     for, keeps time to land. */
  const until = Date.now() + budget / 2;
  const moved = await movedRepos(event.cwd, held, at.repo);
  if (moved.length > 0) await harvest(moved, client, (args) => client.call('meet', args), until);
  await client.handoff({
    state: 'idle',
    ...(at.branch === null ? {} : { branch: at.branch }),
    ...(at.head === null ? {} : { head: at.head }),
  });
}
