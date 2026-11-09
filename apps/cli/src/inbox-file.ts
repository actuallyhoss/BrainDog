/**
 * The inbox file and the three Claude Code hooks that read it (agents and MCP plan §2.3 C, §2.4, §10 points 7 and 8):
 * `braindog hook prompt` (UserPromptSubmit), `braindog hook tool` (PreToolUse) and `braindog hook stop` (Stop).
 *
 * THE BRIDGE KEEPS THE FILE, THE HOOKS ONLY READ IT. While a session is open its MCP server pulses the record every
 * fifteen seconds (five while he has stopped or paused the run) and writes what the pulse answered to
 * `<config>/braindog/sessions/<session>.inbox.json`: the run, its stamp, what he told it that is still open, each in
 * his voice, and what stops it (`bridge.ts`). A hook reads that file and nothing else: no network, no git, no
 * conversation, so it costs a file read and never waits on the host.
 *
 * WHAT EACH HOOK DOES:
 *   - prompt: what he told the run that it has not been shown, as `additionalContext`, once each. A stop or a pause is
 *     said once on a prompt too, first.
 *   - tool: while he has stopped or paused the run, every tool but BrainDog's own is denied with his line as the
 *     reason, so local work halts at the next tool call; a subagent's calls are denied the same. A redirect is said
 *     once, as one denial carrying the new instruction, and never to a subagent.
 *   - stop: the turn may not end, once per instruction, while the run holds something he told it and has not answered.
 *     And once a run, the first time it would end after it committed (`committed`, which the bridge reads from git),
 *     it is asked whether a later session would get anything wrong, to keep as learnings with their skill's topic
 *     (904 runs and no learning). Never when Claude Code says a Stop hook already continued this turn
 *     (`stop_hook_active`), so neither can loop.
 *
 * EVERY HOOK FAILS OPEN. No file, a file that does not read, a file older than two minutes (the bridge is gone or the
 * host is away), a file for another host or run, or anything thrown: the hook says nothing and the call goes on. A stop
 * still holds at the record, which refuses the run's writes (`RUN_STOPPED`) whatever the hooks do.
 *
 * TWO MILLISECONDS WHEN NOTHING WAITS. The bridge and the hooks also keep `<session>.inbox.flags`, the words of the
 * hooks that have something to do now (`flagsOf`), and the hook scripts read it before Node starts
 * (`hooks/braindog-hook.sh`, `.ps1`): a prompt or a tool call with nothing for it costs a shell and one file, as the
 * beat's stamp does. Node runs only for a hook with work, and then reads only this module.
 *
 * THIS FILE IMPORTS NOTHING BUT NODE'S OWN MODULES, so a checkout's hook script can run it as its own entry
 * (`node src/inbox-file.ts tool`) without loading the command, and so its hosts path is written here again rather than
 * imported from `http.ts` (a test holds the two equal).
 *
 * WHAT CLAUDE CODE SENDS AND TAKES, read from the hook schemas inside Claude Code 2.1.304 itself (its bundled input and
 * output definitions), not run against a signed-in session: every event carries `session_id` and `cwd`, and `agent_id`
 * only inside a subagent; PreToolUse adds `tool_name` (an MCP tool is `mcp__<server>__<tool>`) and `mcp_server`;
 * Stop adds `stop_hook_active`. PreToolUse takes `hookSpecificOutput.permissionDecision: "deny"` with
 * `permissionDecisionReason`, UserPromptSubmit takes `hookSpecificOutput.additionalContext`, and Stop takes
 * `decision: "block"` with `reason`. Every other field is read as if it may be missing.
 *
 * THE EVENT'S PATH TO THE CONVERSATION IS NEVER READ (`tools/gates/no-transcript.mjs`): `eventOf` below names the
 * fields it keeps, and nothing else of the event is looked at.
 *
 * AND CODEX'S TURN END (`notify`). Codex has no hook that can put words in front of the model; what it has is `notify`,
 * a program it runs after each turn with one JSON argument (`notifyHook` below). The bridge Codex starts keeps this
 * same inbox file for the session, named by the Codex process both are children of (`codexSession`). When a turn ends
 * and the run still has not taken something he told it, the person at this machine is told once, in a notice of the
 * system's own, since the model hears it only at its next BrainDog call. Of the event only its `type` is read: Codex
 * also sends the turn's own words, which stay unread.
 *
 * ITS OWN ENTRY, AND THE BUNDLE'S TOO. A checkout runs this file (`node src/inbox-file.ts prompt`); the published
 * command, which is one file, carries this module built on its own and writes it beside its hook scripts as
 * `braindog-inbox.mjs` (`INBOX_ENTRY`, `scripts/bundle.mjs`), so a hook with work starts Node on a few kilobytes and
 * not on the whole command. Measured on an M-series Mac: 20 ms against 77 for the whole bundle.
 */

import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Env = Record<string, string | undefined>;

/* ── where the files are ───────────────────────────────────────────────── */

/**
 * The folder the session files live in, beside the hosts file: `http.ts`'s `hostsPath` (XDG first, then `%APPDATA%` on
 * Windows, then `~/.config`), written again so this module needs no other. `test/inbox-file.test.ts` holds them equal.
 */
export function sessionsDir(env: Env, platform: string = process.platform): string {
  const base = env.XDG_CONFIG_HOME || (platform === 'win32' ? env.APPDATA : undefined) || join(homedir(), '.config');
  return join(base, 'braindog', 'sessions');
}

/** A host session's id as a file name: every character but a letter, digit, `_` and `-` made `_`, as the scripts make it. */
export const fileId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/gu, '_');

/**
 * A Codex session's name for its files: `codex-` and the Codex process's id. Codex says no session id to the server it
 * starts, and its turn-end program learns the thread only after a turn, but both are children of the one Codex
 * process, so its id is what they share (`process.ppid` in each).
 */
export const codexSession = (pid: number): string => `codex-${String(pid)}`;

/** The hook entry the published command writes beside its hook scripts, this module built on its own. */
export const INBOX_ENTRY = 'braindog-inbox.mjs';

/** The program that reads the inbox file from a folder of hook scripts: the bundle's own entry there, else a checkout's source. */
export const inboxEntryIn = (scripts: string): string => (existsSync(join(scripts, INBOX_ENTRY)) ? join(scripts, INBOX_ENTRY) : resolve(scripts, '..', 'src', 'inbox-file.ts'));

export const inboxPath = (env: Env, id: string): string => join(sessionsDir(env), `${fileId(id)}.inbox.json`);
export const flagsPath = (env: Env, id: string): string => join(sessionsDir(env), `${fileId(id)}.inbox.flags`);
export const statePath = (env: Env, id: string): string => join(sessionsDir(env), `${fileId(id)}.hooks.json`);
/** What a hook with work prints, made ready before it runs: `.ready`, and beside it `.ready.state` and `.ready.flags`. */
export const readyPath = (env: Env, id: string, which: 'prompt' | 'tool' | 'stop'): string => join(sessionsDir(env), `${fileId(id)}.inbox.${which}.ready`);

/* ── the session's turn ────────────────────────────────────────────────── */

/**
 * WHERE A SESSION'S TURN IS KEPT: `work` from his prompt until the turn ends, `rest` from then, and from the start, until
 * his first prompt. The hook scripts write it with the shell's own `printf`, so no program starts; a stop this module
 * does not hold open writes `rest` here (`runHook`). The next session's start hook reads it for a window that closed
 * with no end (`lostEnds` in `hooks.ts`): one closed at rest is ended then, and one closed at work is left to the
 * record's sweep, which writes it off as abandoned, the one end that word is for.
 */
export const turnPath = (env: Env, id: string): string => join(sessionsDir(env), `${fileId(id)}.turn`);

/** The session's turn, written. Never throws: a turn not kept leaves a closed window's run to the sweep, as before. */
export function markTurn(env: Env, id: string, turn: 'work' | 'rest'): void {
  try {
    writeWhole(turnPath(env, id), `${turn}\n`);
  } catch {
    /* The sweep writes the run off, as it did. */
  }
}

/** The session's turn as last written, or `null` for none: a session started by a command from before the turn was kept. */
export function turnOf(env: Env, id: string): 'work' | 'rest' | null {
  try {
    const said = readFileSync(turnPath(env, id), 'utf8').trim();
    return said === 'work' || said === 'rest' ? said : null;
  } catch {
    return null;
  }
}

/* ── what the files hold ───────────────────────────────────────────────── */

/** How often the bridge pulses, and how often while he has stopped or paused the run (plan §2.3 C). */
export const PULSE_MS = 15_000;
export const PULSE_HELD_MS = 5_000;

/** A file older than this is a bridge that is gone or a host that is away, and every hook lets the call go on (§10.8). */
export const STALE_MS = 120_000;

/** Files of sessions not written in twelve hours are removed, the span a session file is remembered (`REMEMBER_MS`). */
export const KEEP_MS = 12 * 3_600_000;

/** One instruction as the file holds it: the pulse's own fields, and whether the run has taken it. */
export type Told = { id: string; kind: string; said: string; at: string; to: string; line: string; taken: boolean };

/** What stops the run: a stop or a pause he sent it, by instruction. */
export type Held = { kind: 'stop' | 'pause'; id: string; said: string };

/** How a run was shown an instruction, as `pulse` takes it (`SEEN_HOW` in the kernel). */
export type SeenHow = 'start' | 'prompt' | 'tool' | 'channel' | 'job' | 'asked';
const SEEN: readonly SeenHow[] = ['start', 'prompt', 'tool', 'channel', 'job', 'asked'];

/**
 * The inbox file, the bridge's alone to write (the start hook seeds it). `at` is when it was written, `host` and `run`
 * whose it is. `stop_line` is the line the record said the stop in, kept while the same stop holds. `hooks` is the
 * stop switch in his settings for this agent, on unless the record says off. `reported` are the instructions the record
 * has been told this session was shown, so none is told twice. `committed` is the bridge's reading that HEAD moved since
 * the session started, absent until it has.
 */
export type Inbox = {
  v: 1;
  host: string;
  run: string;
  stamp: string | null;
  at: string;
  pending: Told[];
  stop: Held | null;
  stop_line: string | null;
  hooks: boolean;
  reported: string[];
  committed?: true;
};

/**
 * The hooks' own file, the hooks' alone to write: what each instruction was shown by and how (`shown`), the stop a
 * prompt last said (`said_stop`), the redirects a tool call was denied for (`redirected`), the instructions a Stop
 * hook held the turn for (`blocked`), and those Codex's turn end told the person about (`noticed`). Each list only
 * grows, so a reader holding an older copy decides no less.
 */
export type HookState = { shown: Record<string, SeenHow>; said_stop: string | null; redirected: string[]; blocked: string[]; noticed?: string[]; learned?: true };

export const NO_STATE: HookState = { shown: {}, said_stop: null, redirected: [], blocked: [] };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown, most = 4_000): string | null => (typeof x === 'string' && x.length <= most ? x : null);
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.length <= 64) : []);

/** An instruction is taken when the record says so, or when its line asks for the reply rather than the take. */
const takenBy = (x: Record<string, unknown>, id: string, line: string): boolean =>
  typeof x.taken_by === 'string' ? x.taken_by !== '' : typeof x.taken === 'boolean' ? x.taken : line.includes(`instructions reply ${id}`);

/** One instruction from the pulse, the context's `told`, or the file, or `null` when it is not one. */
export function toldOf(x: unknown): Told | null {
  if (!isObject(x)) return null;
  const id = text(x.id, 64);
  const line = text(x.line);
  if (id === null || line === null || line.trim() === '') return null;
  return { id, kind: text(x.kind, 32) ?? 'tell', said: text(x.said) ?? '', at: text(x.at, 64) ?? '', to: text(x.to, 32) ?? 'run', line, taken: takenBy(x, id, line) };
}

/** What stops the run, or `null`. */
export function heldOf(x: unknown): Held | null {
  if (!isObject(x) || (x.kind !== 'stop' && x.kind !== 'pause')) return null;
  return { kind: x.kind, id: text(x.id, 64) ?? '', said: text(x.said) ?? '' };
}

/** The file read loosely: `null` for no file, one that does not parse, or one this command did not write. */
export function readInbox(file: string): Inbox | null {
  let x: unknown;
  try {
    x = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!isObject(x) || x.v !== 1 || typeof x.host !== 'string' || typeof x.run !== 'string' || typeof x.at !== 'string') return null;
  return {
    v: 1,
    host: x.host,
    run: x.run,
    stamp: text(x.stamp, 64),
    at: x.at,
    pending: (Array.isArray(x.pending) ? x.pending : []).map(toldOf).filter((t): t is Told => t !== null),
    stop: heldOf(x.stop),
    stop_line: text(x.stop_line),
    hooks: x.hooks !== false,
    reported: ids(x.reported),
    ...(x.committed === true ? { committed: true as const } : {}),
  };
}

export function readState(file: string): HookState {
  let x: unknown;
  try {
    x = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ...NO_STATE, shown: {} };
  }
  if (!isObject(x)) return { ...NO_STATE, shown: {} };
  const shown: Record<string, SeenHow> = {};
  if (isObject(x.shown)) for (const [id, how] of Object.entries(x.shown)) if (id.length <= 64 && SEEN.includes(how as SeenHow)) shown[id] = how as SeenHow;
  const noticed = ids(x.noticed);
  return { shown, said_stop: text(x.said_stop, 64), redirected: ids(x.redirected), blocked: ids(x.blocked), ...(noticed.length > 0 ? { noticed } : {}), ...(x.learned === true ? { learned: true as const } : {}) };
}

/* Written whole and renamed, at 0600 in a folder made at 0700, as the session files are. */
function writeWhole(file: string, body: string): void {
  mkdirSync(resolve(file, '..'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

export const writeInbox = (file: string, inbox: Inbox): void => writeWhole(file, `${JSON.stringify(inbox)}\n`);
export const writeState = (file: string, state: HookState): void => writeWhole(file, `${JSON.stringify(state)}\n`);

/** Whether the file is too old for a hook to act on, or was written in the future by a clock that jumped. */
export const stale = (inbox: Inbox, now: number): boolean => {
  const at = Date.parse(inbox.at);
  return !(at <= now + 5_000 && now - at <= STALE_MS);
};

/* ── what the hooks decide ─────────────────────────────────────────────── */

/** The kinds a run answers: what he told it, and a redirect, which is a new thing to do. */
const ANSWERED = new Set(['tell', 'redirect']);

/** The line a stop or a pause is said in: the record's own, else one made from the stop. */
export function stopSaid(inbox: Inbox): string | null {
  if (inbox.stop === null) return null;
  if (inbox.stop_line !== null) return inbox.stop_line;
  const own = inbox.pending.find((t) => t.id === inbox.stop!.id);
  if (own !== undefined) return own.line;
  const why = inbox.stop.said.trim() === '' ? '' : `: "${inbox.stop.said.replace(/\s+/gu, ' ').trim()}"`;
  const id = inbox.stop.id === '' ? '' : ` (${inbox.stop.id})`;
  /* "THE PERSON", NOT "HE": the record is anybody's, and these lines go to every agent on every record. */
  return inbox.stop.kind === 'stop' ? `The person stopped this run in BrainDog${id}${why}. Reply with instructions, then end.` : `The person paused this run in BrainDog${id}${why}. Wait until it is resumed.`;
}

/** What a prompt has not yet been shown: instructions no hook or start showed, and the stop when a prompt has not said it. */
function unshown(inbox: Inbox, state: HookState): { stop: string | null; told: Told[] } {
  const stopId = inbox.stop?.id ?? null;
  const stop = inbox.stop !== null && state.said_stop !== (stopId || inbox.stop.kind) ? stopSaid(inbox) : null;
  const told = inbox.pending.filter((t) => state.shown[t.id] === undefined && t.id !== stopId && !(inbox.stop !== null && (t.kind === 'stop' || t.kind === 'pause')));
  return { stop, told };
}

/** The most a prompt's added context says, in characters, so a long instruction list never floods the turn. */
export const PROMPT_MOST = 4_000;

/** UserPromptSubmit: the lines to add, and the state after, or `null` when there is nothing to add. */
export function promptFor(inbox: Inbox, state: HookState): { context: string; state: HookState } | null {
  const { stop, told } = unshown(inbox, state);
  if (stop === null && told.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  const shown = { ...state.shown };
  for (const line of [...(stop === null ? [] : [stop]), ...told.map((t) => t.line)]) {
    if (used + line.length > PROMPT_MOST) break;
    lines.push(line);
    used += line.length + 1;
  }
  for (const t of told) if (lines.includes(t.line)) shown[t.id] = 'prompt';
  if (stop !== null && inbox.stop!.id !== '' && shown[inbox.stop!.id] === undefined) shown[inbox.stop!.id] = 'prompt';
  const left = told.length - told.filter((t) => lines.includes(t.line)).length;
  if (left > 0) lines.push(`And ${String(left)} more from the person: call instructions to read them.`);
  return { context: lines.join('\n'), state: { ...state, shown, said_stop: stop === null ? state.said_stop : inbox.stop!.id || inbox.stop!.kind } };
}

/** The tools a stopped run still has: BrainDog's own, to reply and end, and the search that loads them when deferred. */
export function stillAllowed(tool: string, server: unknown): boolean {
  if (/^mcp__(?:plugin_[A-Za-z0-9._-]+_)?braindog__/u.test(tool)) return true;
  if (server === 'braindog' || (isObject(server) && server.name === 'braindog')) return true;
  return tool === 'ToolSearch';
}

/** The sentence a denied call ends with, saying what still works. */
export const ONLY_BRAINDOG = "This call was not run. Only BrainDog's own tools work until the person resumes the run.";

/** PreToolUse: the reason to deny with and the state after, or `null` to let the call go on. */
export function toolFor(inbox: Inbox, state: HookState, event: HookEvent): { reason: string; state: HookState } | null {
  if (!inbox.hooks || stillAllowed(event.tool, event.server)) return null;
  const held = stopSaid(inbox);
  if (held !== null) return { reason: `${held} ${ONLY_BRAINDOG}`, state };
  /* A REDIRECT TO THE LEAD ONLY: a helper obeys a stop, and is not told what to do instead. */
  if (event.agent !== null) return null;
  const next = inbox.pending.find((t) => t.kind === 'redirect' && !state.redirected.includes(t.id));
  if (next === undefined) return null;
  const shown = { ...state.shown, ...(state.shown[next.id] === undefined ? { [next.id]: 'tool' as SeenHow } : {}) };
  return { reason: `${next.line} The person redirected this run, so this call was not run. Do that instead.`, state: { ...state, shown, redirected: [...state.redirected, next.id] } };
}

/**
 * What the run holds from him and has not answered: taken, or told to this run and shown to it. Nothing while he has
 * stopped or paused it, since then it is to wait or end, and a turn held open would be the opposite.
 */
const owed = (inbox: Inbox, state: HookState): Told[] =>
  inbox.stop !== null ? [] : inbox.pending.filter((t) => ANSWERED.has(t.kind) && (t.taken || (t.to === 'run' && state.shown[t.id] !== undefined)) && !state.blocked.includes(t.id));

/** The one question a run that committed is asked before it ends, once. */
export const LEARNING_ASK =
  'You committed in this run. Is there anything a later session would get wrong without knowing it? If so, create learnings with topic set to the skill it bears on and the failure in because, then end. If not, end.';

/** Whether a run that committed has not been asked for its learnings yet: once a run, never while he holds it. */
const learningOwed = (inbox: Inbox, state: HookState): boolean => inbox.committed === true && state.learned !== true && inbox.stop === null;

/**
 * Stop: the reason to keep the turn going and the state after, or `null` to let it end. At most once per instruction,
 * then once a run for its learnings after it committed.
 */
export function stopFor(inbox: Inbox, state: HookState, event: HookEvent): { reason: string; state: HookState } | null {
  if (event.continued || event.agent !== null) return null;
  const due = owed(inbox, state);
  if (due.length === 0) return learningOwed(inbox, state) ? { reason: LEARNING_ASK, state: { ...state, learned: true } } : null;
  const names = due.map((t) => t.id);
  const first = due[0]!;
  const said = first.said.replace(/\s+/gu, ' ').trim();
  const what = due.length === 1 ? `Reply to ${first.id} with instructions before you stop` : `Reply to ${names.join(' and ')} with instructions before you stop`;
  return {
    reason: `${what}: say what you did, or that it needs the person${said === '' ? '' : `. They said: "${said.length > 300 ? `${said.slice(0, 300)}...` : said}"`}.`,
    state: { ...state, blocked: [...state.blocked, ...names] },
  };
}

/** The hooks with something to do now, as the flags file says them: `prompt`, `tool` and `stop`. None for a stale file. */
export function flagsOf(inbox: Inbox | null, state: HookState, now: number): string[] {
  if (inbox === null || stale(inbox, now)) return [];
  const out: string[] = [];
  const { stop, told } = unshown(inbox, state);
  if (stop !== null || told.length > 0) out.push('prompt');
  if (inbox.hooks && (inbox.stop !== null || inbox.pending.some((t) => t.kind === 'redirect' && !state.redirected.includes(t.id)))) out.push('tool');
  if (owed(inbox, state).length > 0 || learningOwed(inbox, state)) out.push('stop');
  return out;
}

/** The flags file written from both files as they are now. Never throws: a flags file not written leaves Node to decide. */
export function writeFlags(env: Env, id: string, now: number = Date.now(), inbox: Inbox | null = readInbox(inboxPath(env, id)), state: HookState = readState(statePath(env, id))): void {
  try {
    writeWhole(flagsPath(env, id), `${flagsOf(inbox, state, now).join(' ')}\n`);
  } catch {
    /* The scripts then start Node for every call, which decides the same, slower. */
  }
  writeReady(env, id, now, inbox, state);
}

/**
 * WHAT A HOOK WITH WORK WILL PRINT, WRITTEN BEFORE IT RUNS (H23 of 24 October): a hook that had something to say started
 * Node, 98 to 113 ms, where one with nothing cost 15. So wherever the flags are written the answer is worked out too,
 * for the three cases no event changes: a prompt's lines, the stop's turn held open for the lead, and a stopped or
 * paused run's denial of every tool but BrainDog's own. The hook script prints the `.ready` file with `cat`, puts the
 * state and the flags after it in place with `mv`, and starts no Node (`hooks/braindog-hook.sh`). A case it cannot
 * judge by itself (a subagent, a turn a Stop hook already continued, a tool named by its server, a redirect) has no file,
 * and Node decides it as before. Each `.ready` is written last, so its two companions are there when it is. Never throws.
 */
export function writeReady(env: Env, id: string, now: number, inbox: Inbox | null, state: HookState): void {
  const lead: HookEvent = { session: id, tool: '', server: undefined, agent: null, continued: false };
  for (const which of HOOKS) {
    const file = readyPath(env, id, which);
    try {
      const out =
        inbox === null || stale(inbox, now)
          ? null
          : which === 'prompt'
            ? promptFor(inbox, state)
            : which === 'stop'
              ? stopFor(inbox, state, lead)
              : inbox.hooks && stopSaid(inbox) !== null
                ? toolFor(inbox, state, lead)
                : null;
      if (out === null) {
        for (const f of [file, `${file}.state`, `${file}.flags`]) if (existsSync(f)) unlinkSync(f);
        continue;
      }
      if (which !== 'tool') {
        writeWhole(`${file}.state`, `${JSON.stringify(out.state)}\n`);
        writeWhole(`${file}.flags`, `${flagsOf(inbox, out.state, now).join(' ')}\n`);
      }
      writeWhole(file, `${printed(which, out)}\n`);
    } catch {
      /* No file is Node deciding, as before. */
    }
  }
}

/** The JSON Claude Code reads for one hook's answer, as `runHook` prints it. */
function printed(which: Which, out: { context: string } | { reason: string }): string {
  if (which === 'prompt') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: (out as { context: string }).context } });
  if (which === 'tool') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: (out as { reason: string }).reason } });
  return JSON.stringify({ decision: 'block', reason: (out as { reason: string }).reason });
}

/**
 * How long a session's turn is kept (`turnPath`): the week the record's sign of runs reads, which is as far back as a
 * start looks for a window that closed with no end. Past twelve hours, as the inbox files go, a window left open at rest
 * over a night and then closed would have lost the word that it was at rest.
 */
export const TURN_KEEP_MS = 7 * 86_400_000;

/** Files of sessions not written to in twelve hours, removed so the folder stays small, and turns past theirs. Never throws. */
export function pruneInboxes(env: Env, now: number = Date.now()): void {
  try {
    const dir = sessionsDir(env);
    for (const name of readdirSync(dir)) {
      const turn = name.endsWith('.turn');
      if (!turn && !/\.(?:inbox\.json|inbox\.flags|hooks\.json|inbox\.(?:prompt|tool|stop)\.ready(?:\.state|\.flags)?)$/u.test(name)) continue;
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > (turn ? TURN_KEEP_MS : KEEP_MS)) unlinkSync(file);
    }
  } catch {
    /* A file left behind is a few bytes. */
  }
}

/* ── what the start hook hands on ──────────────────────────────────────── */

/**
 * What the attach's context says he told the run, as the start hook prints it and seeds the file with (plan §2.3 A):
 * the stop or pause first, then every open instruction, never cut. Empty for a host older than instructions, whose
 * context has no `told` and no `stop`.
 */
export function toldAtStart(context: unknown): { lines: string[]; told: Told[]; stop: Held | null; stopLine: string | null; stamp: string | null; hooks: boolean | null } {
  const c = isObject(context) ? context : {};
  const told = (Array.isArray(c.told) ? c.told : []).map(toldOf).filter((t): t is Told => t !== null);
  const stop = heldOf(c.stop);
  const stopLine = isObject(c.stop) ? text(c.stop.line) : null;
  const lines = [...(stopLine === null ? [] : [stopLine]), ...told.filter((t) => t.id !== stop?.id).map((t) => t.line)];
  /* HIS STOP SWITCH FOR THIS AGENT, when the record says it (`null` from a host older than the setting). */
  const hooks = isObject(c.enforce) && typeof c.enforce.hooks === 'boolean' ? c.enforce.hooks : null;
  return { lines, told, stop, stopLine, stamp: text(c.stamp, 64), hooks };
}

/**
 * The start hook's seed: the inbox file as the attach answered it, and each instruction it printed marked shown at
 * the start, so the first prompt does not say them again and the next pulse tells the record. The bridge's first pulse
 * replaces the file fifteen seconds on. Never throws: a file not written is a hook that says nothing until then.
 */
export function seedInbox(env: Env, id: string, host: string, run: string, context: unknown, printed: readonly string[], now: number = Date.now()): void {
  try {
    const at = toldAtStart(context);
    const before = readInbox(inboxPath(env, id));
    const inbox: Inbox = {
      v: 1,
      host,
      run,
      stamp: at.stamp,
      at: new Date(now).toISOString(),
      pending: at.told,
      stop: at.stop,
      stop_line: at.stopLine,
      hooks: at.hooks ?? before?.hooks ?? true,
      reported: before !== null && before.run === run && before.host === host ? before.reported : [],
    };
    writeInbox(inboxPath(env, id), inbox);
    const state = readState(statePath(env, id));
    const shown = { ...state.shown };
    for (const sid of printed) shown[sid] ??= 'start';
    const said_stop = at.stop !== null && printed.includes(at.stop.id || at.stop.kind) ? at.stop.id || at.stop.kind : state.said_stop;
    const next = { ...state, shown, said_stop };
    writeState(statePath(env, id), next);
    writeFlags(env, id, now, inbox, next);
  } catch {
    /* The bridge's pulse writes it soon enough. */
  }
}

/* ── the event and the run of one hook ─────────────────────────────────── */

/** What a hook reads of Claude Code's event: its session, the tool, the subagent it came from, and whether a Stop hook already continued the turn. */
export type HookEvent = { session: string | null; tool: string; server: unknown; agent: string | null; continued: boolean };

const SESSION = /^[A-Za-z0-9._:-]{1,128}$/u;

/** The event read loosely; an empty or broken one names no session, and a hook with no session does nothing. */
export function eventOf(stdin: string): HookEvent {
  let x: unknown;
  try {
    x = JSON.parse(stdin);
  } catch {
    x = {};
  }
  const e = isObject(x) ? x : {};
  return {
    session: typeof e.session_id === 'string' && SESSION.test(e.session_id) ? e.session_id : null,
    tool: typeof e.tool_name === 'string' ? e.tool_name : '',
    server: e.mcp_server,
    agent: typeof e.agent_id === 'string' && e.agent_id !== '' ? e.agent_id : null,
    continued: e.stop_hook_active === true,
  };
}

export const HOOKS = ['prompt', 'tool', 'stop'] as const;
export type Which = (typeof HOOKS)[number];

/**
 * One hook, start to end: the JSON Claude Code reads, or the empty string for nothing to say. NEVER THROWS, and never
 * waits on anything but the two files. `now` is a test's clock.
 */
export function runHook(which: Which, stdin: string, env: Env, now: number = Date.now()): string {
  const said = answer(which, stdin, env, now);
  /* A TURN THAT ENDS HERE RESTS (`turnPath`): a stop this hook does not hold open, and never a subagent's, whose stop is
     not the session's. A stop it holds open goes on working. */
  if (which === 'stop' && said === '') {
    const event = eventOf(stdin);
    if (event.session !== null && event.agent === null) markTurn(env, event.session, 'rest');
  }
  return said;
}

/** What one hook prints, as `runHook` says it. Never throws. */
function answer(which: Which, stdin: string, env: Env, now: number): string {
  try {
    const event = eventOf(stdin);
    if (event.session === null) return '';
    const inbox = readInbox(inboxPath(env, event.session));
    const state = readState(statePath(env, event.session));
    if (inbox === null || stale(inbox, now)) {
      /* A FLAGS FILE THAT STILL SAYS WORK while the bridge is gone would start Node on every call: it is emptied. */
      if (existsSync(flagsPath(env, event.session))) writeFlags(env, event.session, now, inbox, state);
      return '';
    }
    const out =
      which === 'prompt' ? promptFor(inbox, state) : which === 'tool' ? toolFor(inbox, state, event) : stopFor(inbox, state, event);
    if (out === null) {
      writeFlags(env, event.session, now, inbox, state);
      return '';
    }
    try {
      writeState(statePath(env, event.session), out.state);
    } catch {
      /* A state not kept says the same thing again next time, which is the safe side. */
    }
    writeFlags(env, event.session, now, inbox, out.state);
    return printed(which, out);
  } catch {
    return '';
  }
}

/* ── the watcher, off unless installed with --rewake ───────────────────── */

/** How long one watcher waits for something new, inside the ten minutes and ten seconds its entry gives it. */
export const WATCH_MS = 600_000;

/**
 * The async Stop watcher ("optional"): after a turn ends it waits up to ten minutes for something he tells
 * the run that no prompt has shown, and answers it, as a prompt's hook would, so the hook can exit 2 and Claude Code
 * wakes the idle session with it (`asyncRewake`). `null` when nothing came, or the event names no session. It reads the
 * two files once a second and nothing else.
 */
export async function watchHook(stdin: string, env: Env, until: number = Date.now() + WATCH_MS, every = 1_000): Promise<string | null> {
  const event = eventOf(stdin);
  if (event.session === null || event.agent !== null) return null;
  const id = event.session;
  for (;;) {
    try {
      const inbox = readInbox(inboxPath(env, id));
      if (inbox !== null && !stale(inbox, Date.now())) {
        const out = promptFor(inbox, readState(statePath(env, id)));
        if (out !== null) {
          writeState(statePath(env, id), out.state);
          writeFlags(env, id, Date.now(), inbox, out.state);
          return out.context;
        }
      }
    } catch {
      /* A file half written is read again in a second. */
    }
    if (Date.now() + every > until) return null;
    await new Promise((done) => setTimeout(done, every));
  }
}

/* ── Codex's turn end ───────────────────────────────────────────────────── */

/** The kinds of what he told a run that ask it to do something, so a turn that ends without taking one is said. */
const ASKS = new Set(['tell', 'redirect']);

/** The most of his words a notice carries: a system notice shows two lines or so. */
const NOTICE_MOST = 140;

/** How the notice reaches the person: the system's own, started and left, so the turn's end waits on nothing. */
export type Show = (title: string, body: string) => void;

/** AppleScript's string, with its two special characters escaped, so his words can never end it early. */
const appleString = (text: string): string => `"${text.replace(/[\\"]/gu, (c) => `\\${c}`)}"`;

/** A notice of the system's own: Notification Center on a Mac, `notify-send` on Linux, nothing elsewhere. Never throws. */
export const showNotice: Show = (title, body) => {
  try {
    const line = body.replace(/[\p{Cc}]/gu, ' ');
    const run: [string, string[]] | null =
      process.platform === 'darwin'
        ? ['osascript', ['-e', `display notification ${appleString(line)} with title ${appleString(title)}`]]
        : process.platform === 'linux'
          ? ['notify-send', [title, line]]
          : null;
    if (run === null) return;
    const child = spawn(run[0], run[1], { stdio: 'ignore', detached: true, shell: false, windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    /* A notice not shown is the instruction still waiting in the app, as it would without this. */
  }
};

/**
 * Codex's `notify`: after a turn, what the person is told about the run, or `null` for nothing. `payload` is the one
 * argument Codex passes, JSON, of which only `type` is read; `session` is `codexSession` of the Codex process.
 *
 * ONCE PER INSTRUCTION, and only for one that asks the run to do something and that it has not taken, while the file is
 * fresh: a turn that ends without taking it leaves it waiting until the next turn, which the person may not start for
 * hours. A stop or a pause needs no notice, since a run that ended its turn is already doing nothing. Never throws.
 */
export function notifyHook(payload: string, env: Env, session: string, now: number = Date.now(), show: Show = showNotice): string | null {
  try {
    let x: unknown;
    try {
      x = JSON.parse(payload);
    } catch {
      return null;
    }
    if (!isObject(x) || x.type !== 'agent-turn-complete') return null;
    const inbox = readInbox(inboxPath(env, session));
    if (inbox === null || stale(inbox, now)) return null;
    const state = readState(statePath(env, session));
    const noticed = state.noticed ?? [];
    const due = inbox.pending.filter((t) => ASKS.has(t.kind) && !t.taken && !noticed.includes(t.id));
    if (due.length === 0) return null;
    const first = due[0]!;
    const words = first.said.replace(/\s+/gu, ' ').trim();
    const quoted = words === '' ? '' : `: "${words.length > NOTICE_MOST ? `${words.slice(0, NOTICE_MOST - 3).trimEnd()}...` : words}"`;
    const more = due.length > 1 ? ` And ${String(due.length - 1)} more.` : '';
    const body = `Codex ended its turn without taking ${first.id}${quoted}. Send it any message and it reads it first.${more}`;
    writeState(statePath(env, session), { ...state, noticed: [...noticed, ...due.map((t) => t.id)] });
    show('BrainDog', body);
    return body;
  } catch {
    return null;
  }
}

/* ── run as its own entry, from a hook script ──────────────────────────── */

/*
 * `node src/inbox-file.ts prompt|tool|stop|watch`, the event on standard input, or `notify <json>`, the event as
 * Codex's last argument. Only when this file is the program itself, a checkout's source or the bundle's own entry
 * (`INBOX_ENTRY`), never inside the bundle, where every module is one file and `import.meta.url` is the bundle's. The
 * watcher exits 2 with what he said, which is how an async hook wakes Claude Code; everything else exits 0.
 */
const self = fileURLToPath(import.meta.url);
const own = /inbox-file\.ts$/u.test(self) || basename(self) === INBOX_ENTRY;
if (own && process.argv[1] !== undefined && resolve(process.argv[1]) === self) {
  const which = process.argv[2];
  process.exitCode = 0;
  if (which === 'notify') {
    /* CODEX STARTED THIS PROGRAM ITSELF, so the process it shares with the bridge is this one's parent. */
    notifyHook(process.argv.at(-1) ?? '', process.env, codexSession(process.ppid));
  }
  let stdin = '';
  try {
    if (which !== 'notify' && !process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
  } catch {
    /* No event is an event naming no session. */
  }
  if ((HOOKS as readonly string[]).includes(which ?? '')) {
    const said = runHook(which as Which, stdin, process.env);
    if (said !== '') writeFileSync(1, `${said}\n`);
  } else if (which === 'watch') {
    void watchHook(stdin, process.env)
      .catch(() => null)
      .then((said) => {
        if (said === null) return;
        writeFileSync(2, `${said}\n`);
        process.exitCode = 2;
      });
  }
}
