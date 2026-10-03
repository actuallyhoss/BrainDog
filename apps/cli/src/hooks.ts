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
import { dirname, join, resolve } from 'node:path';

import type { Client, Context } from '@braindog/client';
import { refused } from '@braindog/ports';

import { briefing, cardOf, nextLine, words, type Moved, type Where } from './brief.ts';
import { budgetOf, clientFor, hostsPath, readHosts, sameHost, target, type Target } from './http.ts';
import { git, hostSessionOf, positionOf, sessionHeaders, type Position } from './position.ts';
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
 * Which run a working folder is, for every process that comes after the start hook.
 *
 * KEYED BY THE FOLDER, because Claude Code starts the MCP server in the session's folder and tells it
 * nothing else. It lives beside the hosts file, in the user's own config folder: in the repository it
 * would show in `git status` and could be committed, and a temp folder is emptied and may be shared. It
 * holds ids and a commit, never a token. `at` is when the start hook wrote it, and `seen` when the end hook
 * last heard from the same session, so a resume knows how long the session was away. `pid` is the Claude Code
 * process the start hook ran under (`CLAUDE_PID`), when it said, so the MCP server that process started can tell a
 * session it moved on to from another window's (`heldFor`).
 */
export type SessionFile = { host: string; spoken: string; client_id?: string; head_at_start: string | null; at: string; seen?: string; pid?: string };

const SPOKEN = /^S[1-9][0-9]*$/;
const CLIENT = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA = /^[0-9a-f]{4,40}$/;
const PID = /^[1-9][0-9]{0,9}$/;

/** The Claude Code process a hook runs under, as its environment says it. */
export const hostPidOf = (env: Env): string | null => (typeof env.CLAUDE_PID === 'string' && PID.test(env.CLAUDE_PID) ? env.CLAUDE_PID : null);

export function sessionPath(env: Env, cwd: string, platform: string = process.platform): string {
  const folder = resolve(cwd);
  /* Windows paths ignore case, and Claude Code and a shell do not always agree on a drive letter's. */
  const key = platform === 'win32' ? folder.toLowerCase() : folder;
  return join(dirname(hostsPath(env, platform)), 'sessions', `${createHash('sha256').update(key).digest('hex').slice(0, 12)}.json`);
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
  };
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
 * THE FOLDER REMEMBERS THE LAST SESSION STARTED IN IT, NOT THE CALLER. Measured on the owner's Mac: a subagent of S729
 * ran `braindog context` in the repository's top folder, whose file still named S297 from three days before, and was
 * told it was S297 and that S729, its own session, was a second one in its working tree. So a remembered run is the
 * caller's only when:
 *
 *   1. inside a host session that says its id (`hostSessionOf`), the file was written by that same session. A file
 *      any other session wrote is not sent, and the host session's id is, which the record finds the run by;
 *   2. anywhere else, a hook heard from it in the last twelve hours. Past that it names a run that has ended, swept or
 *      not, and is not sent.
 *
 * A SERVER OUTLIVES THE SESSION IT WAS STARTED FOR. Claude Code gives a stdio MCP server the session's id once, when it
 * starts it, and keeps the server across `/clear` and a `/resume` picked inside the window, each of which is a session
 * with an id of its own: a new transcript, a `clear` or `resume` start hook, and a new run in the file. Held to rule 1
 * alone, every write the server made after a clear went to the run from before it, while the card named the new one.
 * So for the server (`server`), a file written by a start hook under the same Claude Code process (`pid`) is its
 * session's, whatever the id; and from a hook that did not say its process, one written since the server started is.
 *
 * Whether a run that is sent has ended by its state is the record's to say, so a caller that can ask again does
 * (`context.ts`).
 */

/** A long-lived caller: the process that started it (`process.ppid`), and when it started. */
export type Server = { parent: number; since: number };

/** The run the folder's session file names, when it is the caller's to send to this host; else `undefined`. */
export function heldFor(held: SessionFile | null, host: string, env: Env, now: number = Date.now(), server?: Server): SessionFile | undefined {
  if (held === null || held.host !== host) return undefined;
  const mine = hostSessionOf(env);
  if (mine !== null) return held.client_id === mine || movedOn(held, server, now) ? held : undefined;
  return now - heardAt(held) > REMEMBER_MS ? undefined : held;
}

/** Whether the file names the session a server's own window moved on to since it was started. */
function movedOn(held: SessionFile, server: Server | undefined, now: number): boolean {
  if (server === undefined) return false;
  if (held.pid !== undefined) return held.pid === String(server.parent);
  return Date.parse(held.at) >= server.since && now - heardAt(held) <= REMEMBER_MS;
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
  const held = readSession(sessionPath(io.env, io.cwd));
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
  const file = sessionPath(io.env, event.cwd);
  const before = readSession(file);
  const began = Date.now();
  const soon =
    event.source === 'resume' && before !== null && event.client_id !== undefined && before.client_id === event.client_id && began - heardAt(before) < QUIET_MS;
  const to = reach(io.env);
  if (typeof to === 'string') return soon ? undefined : io.write(to);

  const ms = hookBudget(io.env);
  const signal = AbortSignal.timeout(ms);
  const [at, device] = await Promise.all([positionOf(event.cwd), io.device ?? deviceName(io.env, to.key)]);
  /* NO RUN NAMED, AND THE SESSION'S OWN ID: attaching finds the run by it, so an old run named in a file is never sent. */
  const mine = event.client_id === undefined ? undefined : { client_id: event.client_id };
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', mine, { env: io.env }), signal);
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
  try {
    writeSession(file, {
      host: to.key,
      spoken: run.spoken,
      ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
      /* The same run going on keeps the commit it started from, so what it did is still counted from there. */
      head_at_start: before && before.host === to.key && before.spoken === run.spoken ? before.head_at_start : at.head,
      at: new Date().toISOString(),
      ...(pid === null ? {} : { pid }),
    });
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

/** One author as `meet` takes them, and the commit they were met in. */
export type Author = { name?: string; email?: string; handle?: string; commit: string };

/* GitHub's private address names an account and reaches nobody, so it is sent as a handle. */
const GITHUB_PRIVATE = /^(?:[0-9]+\+)?([^@\s]+)@users\.noreply\.github\.com$/;

/**
 * The authors in `git log --format=%an%x1f%ae%x1f%h`, newest commit first, each once, at most ten.
 *
 * NOBODY TO MEET: a bot, by a name ending in `[bot]` or an address whose name is `[bot]` or noreply; the
 * owner, by the addresses passed in; and an author with no address, because a name alone is what `meet`
 * never joins on.
 */
export function authorsOf(log: string, own: readonly string[]): Author[] {
  const mine = new Set(own.map((a) => a.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: Author[] = [];
  for (const line of log.split('\n')) {
    const [name = '', address = '', commit = ''] = line.split('\x1f').map((s) => s.trim());
    const email = address.toLowerCase();
    const local = email.split('@')[0] ?? '';
    if (!commit || !email.includes('@') || /\[bot\]$/i.test(name) || /\[bot\]$|^no-?reply$/.test(local) || mine.has(email)) continue;
    const account = GITHUB_PRIVATE.exec(email)?.[1];
    const key = account === undefined ? email : `github:${account}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...(name ? { name } : {}), ...(account === undefined ? { email } : { handle: key }), commit });
    if (out.length === MET_PER_SESSION) break;
  }
  return out;
}

/**
 * Send the authors of the commits made since the run began to `meet`, as the run.
 *
 * IT ONLY READS THE REPOSITORY, AND IT IS SILENT. Any refusal ends it, People switched off and a host that
 * is down included, except one author's malformed address, which skips that author. None of this is the
 * session's to hear about.
 */
export async function harvest(cwd: string, from: string | null, repo: string | null, meet: Client['meet'], until: number): Promise<void> {
  if (from === null || repo === null) return;
  const [log, own] = await Promise.all([git(cwd, 'log', '--format=%an%x1f%ae%x1f%h', `${from}..HEAD`), git(cwd, 'config', 'user.email')]);
  if (log === null) return;
  for (const { commit, ...who } of authorsOf(log, own === null ? [] : [own])) {
    if (Date.now() >= until) return;
    const out = await meet({ ...who, where: `commit ${commit} in ${repo}` });
    if (refused(out) && out.refusal.code !== 'VALUE_MALFORMED') return;
  }
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
  const file = sessionPath(io.env, event.cwd);
  const held = readSession(file);
  if (!held || held.host !== to.key) return;
  /* Another session in this folder wrote the file since, so the run in it is not this session's to idle. */
  if (event.client_id !== undefined && held.client_id !== undefined && event.client_id !== held.client_id) return;
  /* WHEN THE SESSION WAS LAST HEARD FROM, so a resume soon after knows its card is still in the conversation. Written
     before anything is sent, so a host that is slow to answer cannot cost it. */
  try {
    writeSession(file, { ...held, seen: new Date().toISOString() });
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
  await harvest(event.cwd, held.head_at_start, at.repo, client.meet, Date.now() + budget / 2);
  await client.handoff({
    state: 'idle',
    ...(at.branch === null ? {} : { branch: at.branch }),
    ...(at.head === null ? {} : { head: at.head }),
  });
}
