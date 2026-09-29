/**
 * `braindog hook start` and `braindog hook end`, which Claude Code runs when a session starts and ends.
 *
 * A HOOK NEVER STOPS A SESSION. Every path exits 0, a host that is
 * down included. The start hook prints the briefing or one plain line saying why there is none; the end
 * hook prints nothing.
 *
 * NO TOKEN IS EVER PRINTED OR WRITTEN HERE. The bearer leaves only as `Authorization`, through `clientFor`,
 * and every sentence below is either fixed text or a host's refusal, which never carries one.
 */

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { Client, Context } from '@braindog/client';
import { refused } from '@braindog/ports';

import { briefing, MAX_CHARS, MAX_LINES, type Moved } from './brief.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { git, positionOf, sessionHeaders, type Position } from './position.ts';
import { syncSkills } from './skills.ts';
import { depositor, scanTools } from './tools.ts';

type Env = Record<string, string | undefined>;

/** What a hook needs from its process, passed in so a test can hold all of it. */
export type Io = { env: Env; stdin: string; cwd: string; write: (text: string) => void; home?: string };

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
 * holds ids and a commit, never a token.
 */
export type SessionFile = { host: string; spoken: string; client_id?: string; head_at_start: string | null; at: string };

const SPOKEN = /^S[1-9][0-9]*$/;
const CLIENT = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA = /^[0-9a-f]{4,40}$/;

export function sessionPath(env: Env, cwd: string, platform: string = process.platform): string {
  const folder = resolve(cwd);
  /* Windows paths ignore case, and Claude Code and a shell do not always agree on a drive letter's. */
  const key = platform === 'win32' ? folder.toLowerCase() : folder;
  return join(dirname(hostsPath(env, platform)), 'sessions', `${createHash('sha256').update(key).digest('hex').slice(0, 12)}.json`);
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

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
  };
}

/* Written whole and renamed, at 0600 in a folder made at 0700, as the hosts file is. */
export function writeSession(file: string, held: SessionFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(held)}\n`, { mode: 0o600 });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
}

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
 * EXPORTED SO `context` SAYS THE SAME THING THE START HOOK SAYS. The two print one briefing through
 * one renderer, and a second copy of this git call would be the one place the two could come to
 * disagree about what "moved" counts.
 */
export async function movedSince(cwd: string, from: string | null, head: string | null): Promise<Moved> {
  if (!from || !head || !SHA.test(from) || head.startsWith(from) || from.startsWith(head)) return undefined;
  const count = Number(await git(cwd, 'rev-list', '--count', `${from}..HEAD`));
  return Number.isInteger(count) && count > 0 ? count : null;
}

/**
 * SessionStart: attach to the run, keep the session file, print the briefing.
 *
 * `compact` AND `clear` COME BACK HERE with the same `session_id`, and `attach` finds the run by it, so a
 * compaction re-attaches rather than opening a second run, and reprints the briefing the model just lost.
 */
export async function hookStart(io: Io): Promise<void> {
  const event = eventOf(io.stdin, io.cwd);
  const to = reach(io.env);
  if (typeof to === 'string') return io.write(to);

  const ms = hookBudget(io.env);
  const began = Date.now();
  const signal = AbortSignal.timeout(ms);
  const at = await positionOf(event.cwd);
  const client = clientFor(to, async () => sessionHeaders(at, 'claude'), signal);
  const out = await client.attach({
    source: event.source,
    ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
    ...(at.branch === null ? {} : { branch: at.branch }),
    ...(at.head === null ? {} : { head: at.head }),
  });
  if (!out.ok) {
    if (signal.aborted || (refused(out) && out.refusal.code === 'UNREACHABLE')) return io.write(unreachable(ms));
    return io.write(`BrainDog: ${refused(out) ? out.refusal.fix : 'the host did not attach this session.'}`);
  }

  const run = out.value;
  const file = sessionPath(io.env, event.cwd);
  const before = readSession(file);
  try {
    writeSession(file, {
      host: to.key,
      spoken: run.spoken,
      ...(event.client_id === undefined ? {} : { client_id: event.client_id }),
      /* The same run going on keeps the commit it started from, so what it did is still counted from there. */
      head_at_start: before && before.host === to.key && before.spoken === run.spoken ? before.head_at_start : at.head,
      at: new Date().toISOString(),
    });
  } catch {
    /* A folder that cannot be written costs the MCP server its attribution, not the session its briefing. */
  }

  const text = briefing(run, at, await movedSince(event.cwd, run.context?.handoff?.head ?? null, at.head));
  /* Only a session that begins: a compaction or a clear is the same session going on (plan §4.3 step 6). */
  const extra =
    run.context !== undefined && (event.source === 'startup' || event.source === 'resume')
      ? await startWork(io, to, at, run.context, { spoken: run.spoken, ...(event.client_id === undefined ? {} : { client_id: event.client_id }) }, began + ms)
      : [];
  io.write(withLines(text, extra));
}

/** Each of the sync and the scan gets at most this long, inside what is left of the hook's budget. */
export const START_WORK_MS = 3_000;

/**
 * Skills sync, then tools scan, at a session's start, and a line for each thing either one did.
 *
 * NOTHING AT ALL WHEN THE RECORD HAS NEITHER REGISTER: no request, no file read. Each runs on its own client and
 * deadline, and a failure is one fixed line, because an error could quote anything.
 */
async function startWork(io: Io, to: Target, at: Position, context: Context, run: { spoken: string; client_id?: string }, until: number): Promise<string[]> {
  const wants = (id: string) => context.registers.some((r) => r.id === id);
  if (!wants('skills') && !wants('tools')) return [];
  const home = io.home ?? homedir();
  const found = await git(at.cwd, 'rev-parse', '--show-toplevel');
  const top = found === null ? null : resolve(found);
  const headers = sessionHeaders(at, 'claude', run);
  const lines: string[] = [];
  const step = async (label: string, work: (client: Client, signal: AbortSignal) => Promise<string[]>) => {
    const left = until - Date.now() - 250;
    if (left <= 0) return;
    const signal = AbortSignal.timeout(Math.min(START_WORK_MS, left));
    try {
      for (const line of await work(clientFor(to, async () => headers, signal), signal)) lines.push(clipLine(`BrainDog: ${line}`));
    } catch {
      lines.push(`BrainDog: the ${label} failed, so it was skipped this time.`);
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
        /* The no-grant sentence once, not in every briefing. */
        once: { host: to.key, hosts: hostsPath(io.env) },
      }),
    );
  return lines;
}

const clipLine = (line: string): string => (line.length > 300 ? `${line.slice(0, 297)}...` : line);

/** The briefing with these lines before its last one, the next step, as many as fit its caps. */
export function withLines(text: string, extra: string[]): string {
  if (extra.length === 0) return text;
  const lines = text.split('\n');
  const last = lines.pop() ?? '';
  for (const line of extra) {
    if (lines.length + 2 > MAX_LINES || [...lines, line, last].join('\n').length > MAX_CHARS) break;
    lines.push(line);
  }
  lines.push(last);
  return lines.join('\n');
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
  const held = readSession(sessionPath(io.env, event.cwd));
  if (!held || held.host !== to.key) return;
  /* Another session in this folder wrote the file since, so the run in it is not this session's to idle. */
  if (event.client_id !== undefined && held.client_id !== undefined && event.client_id !== held.client_id) return;

  const at = await positionOf(event.cwd);
  const budget = hookBudget(io.env);
  /* One client and one deadline for both, so the hook's whole budget is one number. */
  const client = clientFor(to, async () => sessionHeaders(at, 'claude', held), AbortSignal.timeout(budget));
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
