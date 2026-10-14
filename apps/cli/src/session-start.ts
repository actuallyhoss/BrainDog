/**
 * The work a session's start does on this machine: the skills sync and the tools scan, as one function.
 *
 * TWO CALLERS. Claude Code's start hook calls `startWork` at every start of a session, as it always did (`hooks.ts`).
 * An app with no such hook (Codex, Cursor, and whatever else `braindog mcp --agent` is registered in) gets the same
 * work from its MCP server: `startFromServer`, once that server's first `initialize` has been answered, at most once a
 * day for a machine, a folder and an app (`~/.braindog/started.json`), in the background and inside the hook's time
 * limit. So a session in any app syncs the project's skills, has its servers scanned, and is placed in its project by
 * the folder it started in, which the record reads from the same session headers every call carries.
 *
 * IT RUNS ONLY WHEN AN APP STARTS A SESSION. Nothing here is on a clock or at night.
 *
 * NOTHING IT SAYS REACHES THE PROTOCOL. Every line goes to the caller's `say`, which the MCP server points at stderr,
 * and no line quotes an error, because an error could quote anything.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';

import type { Client, Context } from '@braindog/client';
import { refused } from '@braindog/ports';

import { clientFor, hostsPath, type Target } from './http.ts';
import { git, sessionHeaders, type Agent, type Position } from './position.ts';
import { syncSkills } from './skills.ts';
import { depositor, scanTools } from './tools.ts';

type Env = Record<string, string | undefined>;

/** What the start work needs from its process: the environment, and the home folder when a test names another. */
export type StartIo = { env: Env; home?: string | undefined };

/** Each of the sync and the scan gets at most this long, inside what is left of the caller's budget. */
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
 *
 * `headers`, when given, are the session headers every request of the work carries, as the MCP server sends its own;
 * left out, they are Claude Code's for `run`, as the start hook has always sent them.
 */
export async function startWork(
  io: StartIo,
  to: Target,
  at: Position,
  context: Context,
  run: { spoken?: string | undefined; client_id?: string | undefined },
  until: number,
  headers: Record<string, string> = sessionHeaders(at, 'claude', run, { env: io.env }),
): Promise<string[]> {
  const wants = (id: string) => context.registers.some((r) => r.id === id);
  if (!wants('skills') && !wants('tools')) return [];
  const home = io.home ?? homedir();
  const found = await git(at.cwd, 'rev-parse', '--show-toplevel');
  const top = found === null ? null : resolve(found);
  const said: string[] = [];
  const step = async (label: string, work: (client: Client, signal: AbortSignal, ms: number) => Promise<string[]>) => {
    const left = until - Date.now() - 250;
    if (left <= 0) return;
    const ms = Math.min(START_WORK_MS, left);
    const signal = AbortSignal.timeout(ms);
    try {
      const lines = await work(clientFor(to, async () => headers, signal), signal, ms);
      if (lines.length > 0) said.push(`${label}: ${String(lines.length)} change${lines.length === 1 ? '' : 's'}`);
    } catch {
      said.push(`${label} skipped`);
    }
  };
  if (wants('skills'))
    /* The list read stops at half the step's time, on the hook's clock, so what was read is still acted on inside it. */
    await step('skills sync', (client, _signal, ms) =>
      syncSkills({ client, context, home, configDir: io.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), top, dryRun: false, until: Date.now() + ms / 2 }),
    );
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

/* ── once a day for a machine, a folder and an app ─────────────────────── */

/** One start the MCP server did: on which machine, in which folder, for which app, and on which day. */
type Started = { machine: string; folder: string; client: string; day: string };

/** `~/.braindog/started.json`: a few names and a day each, never a key or a token. */
export const startedPath = (home: string): string => join(home, '.braindog', 'started.json');

/** The day `now` falls on, on this machine's calendar, so a day is the person's own and not UTC's. */
export function dayOf(now: number): string {
  const d = new Date(now);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStarted = (x: unknown): x is Started =>
  isObject(x) && typeof x.machine === 'string' && typeof x.folder === 'string' && typeof x.client === 'string' && typeof x.day === 'string';

/** What the file holds, or nothing when there is none or it is not one this command wrote. */
function readStarted(home: string): Started[] {
  const file = startedPath(home);
  if (!existsSync(file)) return [];
  try {
    const x: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(x) && Array.isArray(x.started) ? x.started.filter(isStarted) : [];
  } catch {
    return [];
  }
}

const same = (s: Started, machine: string, folder: string, client: string) => s.machine === machine && s.folder === resolve(folder) && s.client === client;

/** Whether the MCP server already did the start work today on this machine, in this folder, for this app. */
export function startedToday(home: string, machine: string, folder: string, client: string, now: number = Date.now()): boolean {
  const day = dayOf(now);
  return readStarted(home).some((s) => s.day === day && same(s, machine, folder, client));
}

/**
 * Keep that the start work ran today for this machine, folder and app. Written whole to a file beside it and renamed
 * over it, so a server that reads it mid-write reads the old one or the new one. Only today's starts are kept, so the
 * file stays a few lines however many days go by.
 */
export function markStarted(home: string, machine: string, folder: string, client: string, now: number = Date.now()): void {
  const day = dayOf(now);
  const kept = readStarted(home).filter((s) => s.day === day && !same(s, machine, folder, client));
  const file = startedPath(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ started: [...kept, { machine, folder: resolve(folder), client, day }] }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/* ── from the MCP server ───────────────────────────────────────────────── */

/** The apps whose own start hook does the start work at every start, so their MCP server leaves it to the hook. */
export const HOOKED: readonly Agent[] = ['claude'];

/** What the MCP server hands the start work: where it runs, for which app, and the headers its own requests carry. */
export type FromServer = {
  io: StartIo;
  to: Target;
  where: Position | Promise<Position>;
  /** The app `--agent` names; an unnamed one is `other`. */
  agent: Agent | undefined;
  /** The session headers the server sends with every request, so the work is the same run as the session's. */
  headers: () => Promise<Record<string, string>>;
  /** The whole budget, the start hook's (`hookBudget`). */
  ms: number;
  /** One line for the server's log, on stderr. */
  say: (line: string) => void;
  /** This machine's name; the network name `positionOf` reads when left out. */
  machine?: string | undefined;
  now?: (() => number) | undefined;
};

/** What came of it, for a test: the work ran, it ran today already, the app has its own hook, or the record did not answer. */
export type Outcome = 'ran' | 'already' | 'hooked' | 'away' | 'failed';

/**
 * The start work for a session an app started through `braindog mcp`. Never throws: a failure is one line on `say`
 * and the server goes on. Marked as done for the day only once the record has answered, so a start with the host away
 * leaves the work to the next one.
 */
export async function startFromServer(s: FromServer): Promise<Outcome> {
  const now = s.now ?? Date.now;
  const began = now();
  /* THE BUDGET RUNS ON THE MACHINE'S OWN CLOCK, as `startWork` reads it; `now` names the day the start is marked on. */
  const until = Date.now() + s.ms;
  try {
    const client = s.agent ?? 'other';
    if (HOOKED.includes(client)) return 'hooked';
    const at = await s.where;
    const home = s.io.home ?? homedir();
    const machine = s.machine ?? (at.host || hostname());
    if (startedToday(home, machine, at.cwd, client, began)) return 'already';
    const headers = await s.headers().catch(() => ({}) as Record<string, string>);
    const signal = AbortSignal.timeout(Math.max(1, until - Date.now()));
    const out = await clientFor(s.to, async () => headers, signal).context();
    if (!out.ok) {
      const away = signal.aborted || (refused(out) && out.refusal.code === 'UNREACHABLE');
      s.say(
        away
          ? `BrainDog did not answer within ${String(s.ms / 1000)} seconds, so the start work waits for the next session.`
          : `BrainDog did not do the start work: ${refused(out) ? out.refusal.fix : 'the host did not answer.'}`,
      );
      return 'away';
    }
    try {
      markStarted(home, machine, at.cwd, client, began);
    } catch {
      /* A home folder that cannot be written runs the work again at the next start, and costs nothing else. */
    }
    const did = await startWork(s.io, s.to, at, out.value, {}, until, headers);
    if (did.length > 0) s.say(`BrainDog at the start of this session: ${did.join(', ')}.`);
    return 'ran';
  } catch {
    s.say('BrainDog could not do the start work for this session, and the server goes on.');
    return 'failed';
  }
}

/* Every `initialize` result carries the revision agreed, and no other reply does. */
const isHelloReply = (line: string): boolean => {
  if (!line.includes('"protocolVersion"')) return false;
  try {
    const x: unknown = JSON.parse(line);
    return isObject(x) && isObject(x.result) && typeof x.result.protocolVersion === 'string';
  } catch {
    return false;
  }
};

/**
 * The server's output, passed on to `out` byte for byte, which calls `then` once, just after the first answer to an
 * `initialize` was handed on. Each write's callback is `out`'s own, so "flushed" still means flushed; an error writing
 * is `out`'s to report, where the server already listens for it.
 */
export function afterHello(out: { write(chunk: Uint8Array, cb: (err?: Error | null) => void): boolean }, then: () => void): Writable {
  let done = false;
  let partial = '';
  return new Writable({
    write(chunk: Buffer, _encoding, cb) {
      if (!done) {
        partial += chunk.toString('utf8');
        for (let i = partial.indexOf('\n'); i >= 0 && !done; i = partial.indexOf('\n')) {
          const line = partial.slice(0, i);
          partial = partial.slice(i + 1);
          done = isHelloReply(line);
        }
        if (done) {
          partial = '';
          out.write(chunk, () => {
            cb();
            setImmediate(then);
          });
          return;
        }
      }
      out.write(chunk, () => cb());
    },
  });
}
