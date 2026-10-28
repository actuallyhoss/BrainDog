/**
 * `braindog runner`: this machine runs the jobs its owner starts in the app
 * (`docs/48-SPEC-CLI.md` §5.13).
 *
 * THE RECORD KEEPS THE QUEUE AND THIS MACHINE RUNS IT. `enrol` takes a device grant of reach `runner`, approved with six
 * digits in the app, and keeps it in the hosts file beside the login. `run` claims a job, starts Claude Code on it under
 * the owner's own subscription, and reports what happened one distilled line at a time, renewing its lease as it goes.
 * The host holds each claim open for up to twenty seconds, so an idle runner costs one request that long.
 *
 * A KIND IS APPROVED TWICE: ONCE IN DECIDE, AND ONCE ON EACH MACHINE. A kind is a `job.<id>` declaration the owner
 * accepted, and the claim carries its prompt, tools, turns, permission mode and repository name. A host that forged one
 * could hand this machine any prompt and any tool, so the first time a machine sees a kind, by the SHA-256 of what it
 * would run, `run` prints it and asks the person at the terminal once. With no terminal attached it refuses the job,
 * keeps the kind in `~/.braindog/runner.json`, and `braindog runner allow <kind>` asks later. A machine that never allowed
 * a kind never runs it, whatever the host says.
 *
 * THE HOST SENDS A NAME AND NEVER A PATH. A kind that works in a repository names it, and only this machine's own map
 * (`runner repos add <name> <folder>`) turns the name into a folder. A kind that names none works in an empty folder of
 * its own, removed when the job ends.
 *
 * A JOB MAY NAME A MACHINE AND A CLAUDE CODE PROFILE, BY NAME (migration 44). Each claim says where this runner is: the
 * machine as its runs name it (`os.hostname()`) and the profiles it can start Claude Code under, by the names its runs
 * carry (`profileNameOf`). The record hands it only a job placed nowhere, or placed here. A job under a profile runs
 * with `CLAUDE_CONFIG_DIR` naming that profile's folder (`envFor`), which only this machine knows: the ones
 * `~/.braindog/profiles.json` lists, else the ones `doctor` finds. A folder never leaves this machine, and a name two
 * folders share is refused rather than guessed at, because the wrong one is another login.
 *
 * CLAUDE CODE RUNS WITH THE KIND'S TOOLS AND PERMISSION MODE AND NOTHING WIDER. `--strict-mcp-config` with a temporary
 * `mcp.json` that reaches the record's MCP door with the job's own bearer, `--allowedTools` with the kind's list,
 * `--permission-mode` with the kind's mode, `--max-turns` with its turns, and never `--dangerously-skip-permissions`. The
 * lint every approved kind passed (`jobBody` in `@braindog/kernel`) is run again here on what the claim carries, so a
 * tool or a mode the record would refuse at install is refused on this machine too.
 *
 * A KIND THAT SAYS `agent: codex` RUNS ON CODEX (`codex exec --json`), as far as Codex can hold it to the same: its
 * servers replaced by the record's door alone, the kind's own record tools, a sandbox for its permission mode (read-only
 * for dontAsk, the folder alone for acceptEdits), nothing asked, and its turns counted here, since Codex has no
 * `--max-turns`. Codex cannot hold a run to named commands, so the kernel refuses a Codex kind that names any. A machine
 * runs the kinds of whichever agents it has; a job for one it lacks is refused with the sentence saying so.
 *
 * NOTHING PRINTS A BEARER. The runner's enrolment leaves this process only as `Authorization` on its three calls
 * (`runnerCall` in `http.ts`), and the job's bearer only inside the `mcp.json` Claude Code reads, written at 0600 in a
 * folder of its own and removed in `finally`, or in the one variable Codex's config names (`JOB_BEARER_VAR`). The
 * prompt goes on standard input rather than as an argument, so it is not in any process list, and so a Windows
 * `claude.cmd` needs no multi-line argument escaped.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface as lineReader } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { JOB_MCP_PREFIX, JOB_NO_REPO, JOB_REPO_SLOT, MACHINE_NAME, SEAT_NAME, fillPrompt, jobBody, type ClaimedJob } from '@braindog/kernel';
import { refused, type Result } from '@braindog/ports';

import { tomlString } from './clients/codex.ts';
import { profilesIn, realOf } from './doctor.ts';
import { keepRunner, readHosts, runnerCall, runnerTarget, type RunnerMethod, type RunnerTarget } from './http.ts';
import type { Answering } from './json.ts';
import { planCommand } from './keys.ts';
import { approveRunner } from './login.ts';
import { listedProfiles } from './placed.ts';
import { profileNameOf } from './position.ts';
import { envFor } from './setup.ts';

type Env = Record<string, string | undefined>;

export type RunnerIo = {
  env: Env;
  /** The folder a relative `repos add` folder is read against. */
  cwd: string;
  /** The folder `.braindog/runner.json` is under. */
  home: string;
  /** The hosts file the enrolment is kept in. */
  file: string;
  /** One line to stdout: only what `repos list` answers. */
  out: (line: string) => void;
  /** One line to stderr: every sentence, the six digits and the kind shown for approval. */
  say: (line: string) => void;
  /** Under `--json`, where the machine-readable half of the answer goes (`json.ts`). */
  answer?: Answering | undefined;
  /** Aborted by Ctrl+C: the loop stops, and a job running is ended `interrupted`. */
  signal?: AbortSignal | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  now?: (() => number) | undefined;
  platform?: string | undefined;
  /** This machine as its runs name it, `os.hostname()` unless a test says another. */
  host?: string | undefined;
  /**
   * Asks the person at this terminal one yes-or-no question, or `null` when no terminal is attached. Left out, it is
   * the real terminal when standard input is one, and `null` otherwise.
   */
  ask?: ((question: string, signal: AbortSignal) => Promise<boolean>) | null | undefined;
};

/** `48 §4.4`: a refusal, a local failure or a stop is 1, and a host that did not answer is 3. */
const REFUSED = 1;
const UNREACHABLE = 3;

/**
 * The oldest Claude Code this runner starts a job with: the version `docs/26-BYO-INTELLIGENCE.md` §5 and
 * `docs/48-SPEC-CLI.md` §5.13 name. Below it, or with none on PATH, nothing is claimed.
 */
export const CLAUDE_LEAST = [2, 1, 248] as const;

/** How long the host is asked to hold a claim open, in seconds, and how much longer this side waits before giving up on it. */
const CLAIM_WAIT_S = 20;
/** The most profiles one claim names, the record's own ceiling (`SEATS_MOST` in `@braindog/kernel`). */
const SEATS_SENT_MOST = 32;
/** The most folder names one claim says this machine maps, the record's own ceiling. */
const REPOS_SENT_MOST = 64;
const CLAIM_SLACK_MS = 10_000;
/** The longest wait between claims when the host answers at once with nothing (a proxy that cannot hold twenty seconds). */
const IDLE_MOST_MS = 30_000;
const IDLE_LEAST_MS = 1_500;
/** How long to wait before claiming again from a host that did not answer. */
const UNREACHABLE_WAIT_MS = 30_000;
/** The deadline of one report or one renewal. */
const CALL_MS = 20_000;
/** How many times one report is sent to a host that does not answer, and the first wait between them, doubling. */
const POST_TRIES = 4;
const RETRY_MS = 1_000;
/**
 * THE LEASE, AND SO THE OWNER'S CANCEL. The record holds a claim for sixty seconds (`JOB_LEASE_MS`) and every report
 * renews it, and so does `readCancel`, whose answer also says whether the job was stopped. A job that reports nothing
 * for `RENEW_AFTER_MS` asks, checked every `RENEW_TICK_MS`, so a Cancel pressed in the app is seen within twenty seconds
 * and the lease never comes near its end.
 */
const RENEW_TICK_MS = 5_000;
const RENEW_AFTER_MS = 14_000;
/**
 * THE LONGEST ONE JOB RUNS ON THIS MACHINE, wall clock, unless `BRAINDOG_JOB_MINUTES` says another (1 to 600). A run
 * past it is stopped and ends as one that ran out (`limit`): turns hold a run to its kind, and this holds one that
 * waits on a tool that never answers. The record's own ceiling is a day.
 */
export const JOB_WALL_MS = 45 * 60_000;
export const wallOf = (env: Env): number => {
  const said = Number((env.BRAINDOG_JOB_MINUTES ?? '').trim());
  return Number.isInteger(said) && said >= 1 && said <= 600 ? said * 60_000 : JOB_WALL_MS;
};

/** How long `claude --version` and `claude --help` may take, and the most of their output that is read. */
const PROBE_MS = 15_000;
const PROBE_CHARS_MOST = 256 * 1024;

/**
 * The most of one line a report carries. What a person reads is kept; the rest stays on this machine. The record takes
 * at most 16 KiB a line (`JOB_EVENT_BYTES_MOST`) and an end's `error` at most 2,000 characters.
 */
const SAY_MOST = 2_000;
const THINK_MOST = 500;
const TOOL_MOST = 2_000;
const OUT_MOST = 2_000;
const RESULT_MOST = 2_000;
const ERROR_MOST = 2_000;
const NAME_MOST = 120;
const MODEL_MOST = 80;
/** The most of Claude Code's standard error kept, for the one sentence a job that ended with no result says. */
const STDERR_KEPT = 2_000;
/** The longest `claude_session` the record keeps (its `SESSION_CHARS_MOST`); a longer one is not sent. */
const SESSION_MOST = 200;
/** The most proposals one end names, and the most line types it says once that it could not read. */
const FILED_MOST = 20;
const UNREAD_MOST = 10;
/** The most kinds `runner.json` keeps waiting for `runner allow`. The oldest goes first. */
const WAITING_MOST = 20;

/** A job's id, as `createJob` mints it. */
const JOB_ID = /^j_[0-9A-Z]{26}$/;
/** A kind's declaration id, which is all this command ever echoes of what a host sent before the lint has read it. */
const KIND_ID = /^job\.[a-z][a-z0-9_-]{0,31}$/;
/**
 * A repository's name as this machine maps it: the shape the kernel's lint gives a kind's `repo`, so a name outside it
 * could never be sent and mapping one would be a line that never matches.
 */
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** A bearer is printable ASCII with no spaces; anything else is not one, whatever the host says. */
const BEARER = /^[\x21-\x7e]{16,1024}$/;
/** The longest argument any kind may take (the kernel's `JOB_ARG_CHARS_MOST`). */
const ARG_MOST = 64;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** At most `most` characters of `text`, never ending on half of a surrogate pair. */
const head = (text: string, most: number): string => {
  if (text.length <= most) return text;
  const cut = text.slice(0, most);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
};

/** Text as it may reach a terminal: no control character, so a title a host sent cannot move the cursor or clear the screen. */
const visible = (text: string): string => text.replace(/[\p{Cc}]/gu, ' ');

const USAGE =
  'braindog runner takes enrol <host>, repos add <name> <folder>, repos list, run [--once] [--host <host>] or allow <kind>.';

/** `braindog runner <verb>`, and the exit code the verb decides. */
export async function runner(args: string[], io: RunnerIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'enrol') return enrol(rest, io);
  if (verb === 'repos') return repos(rest, io);
  if (verb === 'run') return run(rest, io);
  if (verb === 'allow') return allow(rest, io);
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. */
  io.say(verb === undefined ? USAGE : `braindog runner has no ${/^[a-z]{1,16}$/.test(verb) ? verb : 'such command'}. ${USAGE}`);
  return REFUSED;
}

/* ── Claude Code and Codex on this machine ───────────────────────────────── */

/** What `claude` or `codex` says of itself: its version, and its help, read for the flags it offers. */
type Claude = { version: string; help: string };

/** Which agent runs a job, as its kind says it (`JOB_AGENTS` in the kernel). */
type Agent = 'claude' | 'codex';

/** Each agent as a person calls it. */
const AGENT_NAME: Readonly<Record<Agent, string>> = { claude: 'Claude Code', codex: 'Codex' };

/** The agents on this machine, each as it said of itself, or the sentence saying why it cannot run a job. */
type Agents = Record<Agent, Claude | string>;

/**
 * The oldest Codex this runner starts a job with: the first whose `codex exec --json` writes the event stream read here
 * (`thread.started`, `item.started`, `item.completed`, `turn.completed`). NOT CONFIRMED against an installed Codex:
 * none was on the machine this was written on, so the floor is the release notes' word.
 */
export const CODEX_LEAST = [0, 46, 0] as const;

/** Whether a file is there, for `planCommand`'s search of PATH. */
const aFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * `claude` with one argument and its standard output, or `null` when it did not start or did not end in time.
 *
 * THROUGH `planCommand`, as `keys exec` starts a command, because Claude Code installed by npm on Windows is a
 * `claude.cmd`, which Node with no shell cannot start by its bare name.
 */
function probe(arg: '--version' | '--help', io: RunnerIo, program: string = 'claude'): Promise<string | null> {
  const plan = planCommand(program, [arg], io.env, { platform: io.platform ?? process.platform, isFile: aFile });
  if (typeof plan === 'string') return Promise.resolve(null);
  return new Promise((done) => {
    let out = '';
    let child: ChildProcess;
    try {
      child = spawn(plan.command, plan.args, { stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true, windowsVerbatimArguments: plan.verbatim, env: io.env });
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => {
      stopChild(child, io.platform ?? process.platform);
      done(null);
    }, PROBE_MS);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (out.length < PROBE_CHARS_MOST) out += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      done(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      done(out);
    });
  });
}

/**
 * Claude Code as this machine has it, or the sentence that says why no job may run: missing, silent about its version,
 * or older than `CLAUDE_LEAST`. The caller says what did not happen because of it.
 */
async function claudeHere(io: RunnerIo): Promise<Claude | string> {
  const said = await probe('--version', io);
  if (said === null) return 'Claude Code is not on this machine, or not on its PATH';
  const parts = /(\d+)\.(\d+)\.(\d+)/.exec(said);
  if (!parts) return 'Claude Code did not say which version it is';
  const version = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const least = CLAUDE_LEAST.join('.');
  for (const [i, want] of CLAUDE_LEAST.entries()) {
    const have = version[i] ?? 0;
    if (have > want) break;
    if (have < want) return `Claude Code ${version.join('.')} is older than ${least}, the first this runner starts a job with`;
  }
  return { version: version.join('.'), help: (await probe('--help', io)) ?? '' };
}

/** Codex as this machine has it, or the sentence that says why no Codex job may run, as `claudeHere` says Claude Code's. */
async function codexHere(io: RunnerIo): Promise<Claude | string> {
  const said = await probe('--version', io, 'codex');
  if (said === null) return 'Codex is not on this machine, or not on its PATH';
  const parts = /(\d+)\.(\d+)\.(\d+)/.exec(said);
  if (!parts) return 'Codex did not say which version it is';
  const version = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  for (const [i, want] of CODEX_LEAST.entries()) {
    const have = version[i] ?? 0;
    if (have > want) break;
    if (have < want) return `Codex ${version.join('.')} is older than ${CODEX_LEAST.join('.')}, the first this runner starts a job with`;
  }
  return { version: version.join('.'), help: '' };
}

/** Both agents, asked side by side. */
const agentsHere = async (io: RunnerIo): Promise<Agents> => {
  const [claude, codex] = await Promise.all([claudeHere(io), codexHere(io)]);
  return { claude, codex };
};

/** Whether neither agent can run a job here, which is when nothing is claimed. */
const noAgent = (a: Agents): boolean => typeof a.claude === 'string' && typeof a.codex === 'string';

/** What runs jobs here, as the start line says it: "Claude Code 2.1.300 and Codex 0.52.0". */
const agentsSaid = (a: Agents): string =>
  (['claude', 'codex'] as const)
    .flatMap((k) => (typeof a[k] === 'string' ? [] : [`${AGENT_NAME[k]} ${(a[k] as Claude).version}`]))
    .join(' and ');

/**
 * Whether the installed `claude --help` names a flag.
 *
 * THE FIRST SPEC'S `--restricted` AND `--disable-slash-commands` ARE PASSED ONLY WHERE THE HELP LISTS THEM.
 * Neither was ever confirmed against an installed Claude Code, and a flag the
 * installed one does not know stops every job before it starts. Its `--json-schema` went with the fixed kinds, which
 * were the only thing that had a schema.
 */
const offers = (help: string, flag: '--restricted' | '--disable-slash-commands'): boolean => new RegExp(`(^|[\\s,])${flag}(?![\\w-])`, 'm').test(help);

/**
 * Whether the installed Claude Code knows a permission mode. When its help lists the modes (it names `acceptEdits`
 * among them), the kind's must be one; when it lists none, Claude Code is left to refuse a mode it does not know.
 */
const knowsMode = (help: string, mode: 'dontAsk' | 'acceptEdits'): boolean => !/\bacceptEdits\b/.test(help) || new RegExp(`\\b${mode}\\b`).test(help);

/**
 * Ends a child and everything it started.
 *
 * ON WINDOWS BY `taskkill /T`, because `claude.cmd` runs under `cmd.exe`, and killing `cmd.exe` leaves the Node process
 * it started running, with the job's bearer in hand.
 */
function stopChild(child: ChildProcess, platform: string): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32' && child.pid !== undefined) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false, windowsHide: true });
    killer.on('error', () => child.kill());
    return;
  }
  child.kill('SIGTERM');
}

/* ── ~/.braindog/runner.json ─────────────────────────────────────────────── */

/** A kind as this machine pins it: what the claim says the run will do, every argument's value left out. */
type Pinned = { kind: string; title: string; prompt: string; tools: string[]; turns: number; permission: string; repo: string | null; agent: Agent };

/**
 * `~/.braindog/runner.json`: this machine's folders by name, the kinds it allowed by the SHA-256 of what they run, and
 * the kinds a job was refused for while no terminal was attached, kept until `runner allow` asks about them.
 */
type RunnerFile = {
  repos: Record<string, string>;
  allowed: Record<string, { kind: string; at: string }>;
  waiting: Record<string, { host: string; at: string; job: Pinned }>;
};

const runnerFile = (home: string): string => join(home, '.braindog', 'runner.json');

/** A pinned kind as the file or a claim holds it, or `null` when it is not one. */
function pinnedOf(x: unknown): Pinned | null {
  if (!isObject(x)) return null;
  const { kind, title, prompt, tools, turns, permission, repo, agent } = x;
  if (typeof kind !== 'string' || typeof title !== 'string' || typeof prompt !== 'string' || typeof permission !== 'string') return null;
  if (!Array.isArray(tools) || !tools.every((t): t is string => typeof t === 'string') || !isCount(turns)) return null;
  if (repo !== null && typeof repo !== 'string') return null;
  /* A HOST OLDER THAN CODEX JOBS SAYS NO AGENT, and every job it hands out is Claude Code's. One it names and this
     command does not know is no kind this machine can run. */
  if (agent !== undefined && agent !== 'claude' && agent !== 'codex') return null;
  return { kind, title, prompt, tools: [...tools], turns, permission, repo, agent: agent ?? 'claude' };
}

/**
 * The file, or an empty one when there is none. Throws one sentence when it cannot be read.
 *
 * EVERY KEY IS READ AGAINST ITS OWN SHAPE, so a key such as `__proto__` in a hand-edited file is dropped rather than
 * assigned, and `Object.fromEntries` defines what is kept rather than setting it.
 */
function readRunnerFile(file: string): RunnerFile {
  if (!existsSync(file)) return { repos: {}, allowed: {}, waiting: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON. Correct it by hand, or delete it and map this machine's folders again.`);
  }
  if (!isObject(parsed)) throw new Error(`${file} is not a runner file. Correct it by hand, or delete it and map this machine's folders again.`);
  const entries = (x: unknown): [string, unknown][] => (isObject(x) ? Object.entries(x) : []);
  return {
    repos: Object.fromEntries(entries(parsed.repos).filter((e): e is [string, string] => REPO_NAME.test(e[0]) && typeof e[1] === 'string')),
    allowed: Object.fromEntries(
      entries(parsed.allowed).flatMap(([sha, v]): [string, RunnerFile['allowed'][string]][] =>
        /^[0-9a-f]{64}$/.test(sha) && isObject(v) && typeof v.kind === 'string' ? [[sha, { kind: v.kind, at: typeof v.at === 'string' ? v.at : '' }]] : [],
      ),
    ),
    waiting: Object.fromEntries(
      entries(parsed.waiting).flatMap(([kind, v]): [string, RunnerFile['waiting'][string]][] => {
        const job = isObject(v) ? pinnedOf(v.job) : null;
        return KIND_ID.test(kind) && isObject(v) && job !== null && job.kind === kind
          ? [[kind, { host: typeof v.host === 'string' ? v.host : '', at: typeof v.at === 'string' ? v.at : '', job }]]
          : [];
      }),
    ),
  };
}

/** Written whole and renamed into place, at 0600, in a folder made at 0700, as `saveHosts` writes the hosts file. */
function saveRunnerFile(file: string, value: RunnerFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const part = `${file}.tmp`;
  writeFileSync(part, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(part, 0o600);
  renameSync(part, file);
}

/**
 * The SHA-256 of a pinned kind, over its fields in one fixed order, so the same kind always hashes the same. The agent
 * counts only when it is Codex, so a Claude Code kind allowed before there was a choice is still the kind allowed.
 */
const shaOf = (p: Pinned): string =>
  createHash('sha256')
    .update(
      JSON.stringify({ kind: p.kind, title: p.title, prompt: p.prompt, tools: p.tools, turns: p.turns, permission: p.permission, repo: p.repo, ...(p.agent === 'codex' ? { agent: 'codex' } : {}) }),
    )
    .digest('hex');

/* ── enrol ───────────────────────────────────────────────────────────────── */

const ENROL_USAGE = 'braindog runner enrol takes one host, as in braindog runner enrol https://app.brain.dog/app/<slug>, and nothing else.';

/**
 * `braindog runner enrol <host>`: six digits approved in the app, and the runner's bearer kept in the hosts file.
 *
 * CLAUDE CODE AND CODEX ARE ASKED FIRST, so a machine that could never run a job is not enrolled to hold one. Either
 * one is enough: a machine with Codex alone runs the kinds that say `agent: codex`.
 */
async function enrol(args: string[], io: RunnerIo): Promise<number> {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {} }));
  } catch {
    io.say(ENROL_USAGE);
    return REFUSED;
  }
  const [host, ...more] = positionals;
  if (host === undefined || more.length > 0 || host.startsWith('-')) {
    io.say(ENROL_USAGE);
    return REFUSED;
  }
  const agents = await agentsHere(io);
  if (noAgent(agents)) {
    io.say(`${String(agents.claude)}, so this machine was not enrolled. Install or update Claude Code, then run this again.`);
    return REFUSED;
  }
  /* READ BEFORE ANYTHING IS ASKED, so a broken hosts file is found before somebody approves a runner whose bearer would
     have nowhere to go. */
  try {
    readHosts(io.file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return REFUSED;
  }
  const got = await approveRunner(host, { say: io.say, signal: io.signal, fetch: io.fetch, now: io.now });
  if (typeof got === 'number') return got;
  try {
    keepRunner(io.file, got.key, { value: got.bearer, expires: got.expires, label: got.label });
  } catch {
    io.say(`The machine was approved and ${io.file} could not be written, so the enrolment was not kept. Run braindog runner enrol ${got.key} to start again.`);
    return REFUSED;
  }
  io.say(`enrolled on ${got.key} as ${got.label} · runner expires ${got.expires.slice(0, 10)}`);
  io.say('Map a folder with braindog runner repos add <name> <folder>, then start it with braindog runner run.');
  io.answer?.({ value: { host: got.key, label: got.label, expires: got.expires } });
  return 0;
}

/* ── repos ───────────────────────────────────────────────────────────────── */

const REPOS_USAGE = 'braindog runner repos takes add <name> <folder>, or list.';

/** `braindog runner repos add <name> <folder>` and `braindog runner repos list`: this machine's own map, and nothing sent. */
function repos(args: string[], io: RunnerIo): number {
  const [sub, ...rest] = args;
  const file = runnerFile(io.home);
  let held: RunnerFile;
  try {
    held = readRunnerFile(file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${file} could not be read.`);
    return REFUSED;
  }

  if (sub === 'list' && rest.length === 0) {
    const names = Object.keys(held.repos).sort();
    if (names.length === 0) io.say('No folder is mapped on this machine. Map one with braindog runner repos add <name> <folder>.');
    for (const name of names) io.out(`${name}  ${held.repos[name] ?? ''}`);
    io.answer?.({ value: { repos: held.repos } });
    return 0;
  }
  if (sub !== 'add' || rest.length !== 2) {
    io.say(REPOS_USAGE);
    return REFUSED;
  }
  const [name = '', given = ''] = rest;
  if (!REPO_NAME.test(name)) {
    io.say('A repository name is letters, digits, ., _ and -, starting with a letter or a digit, at most 64. It is the name a job kind says as repo.');
    return REFUSED;
  }
  const folder = resolve(io.cwd, given);
  let isFolder = false;
  try {
    isFolder = statSync(folder).isDirectory();
  } catch {
    isFolder = false;
  }
  if (!isFolder) {
    io.say(`${folder} is not a folder on this machine, so ${name} was not mapped.`);
    return REFUSED;
  }
  const was = Object.hasOwn(held.repos, name) ? held.repos[name] : undefined;
  held.repos[name] = folder;
  try {
    saveRunnerFile(file, held);
  } catch {
    io.say(`${file} could not be written, so ${name} was not mapped.`);
    return REFUSED;
  }
  io.say(
    was === undefined || was === folder
      ? `${name} is ${folder} on this machine. A job kind that names ${name} works in that folder.`
      : `${name} is ${folder} on this machine now, not ${was}. A job kind that names ${name} works in that folder.`,
  );
  io.answer?.({ value: { name, folder } });
  return 0;
}

/* ── allow ───────────────────────────────────────────────────────────────── */

/**
 * The real terminal's question, answered yes only by `y` or `yes`. Nothing typed is no.
 *
 * Ctrl+C IS HANDED BACK AS A STOP. A terminal read this way takes the keys itself, so Ctrl+C arrives here as an event
 * rather than as a signal, and with nobody listening it only pauses the read, which would leave the question open for
 * ever. It closes the question, and is raised again for whoever stops this process, or ends it as a signal would.
 */
const terminalAsk = async (question: string, signal: AbortSignal): Promise<boolean> => {
  const lines = createInterface({ input: process.stdin, output: process.stderr });
  lines.on('SIGINT', () => {
    lines.close();
    if (process.listenerCount('SIGINT') > 0) process.emit('SIGINT');
    else process.exit(130);
  });
  try {
    return /^\s*y(?:es)?\s*$/i.test(await lines.question(question, { signal }));
  } catch {
    return false;
  } finally {
    lines.close();
  }
};

/** Who answers this machine's one question about a new kind, or `null` when nobody can. */
const askerOf = (io: RunnerIo): ((question: string, signal: AbortSignal) => Promise<boolean>) | null =>
  io.ask === undefined ? (process.stdin.isTTY ? terminalAsk : null) : io.ask;

/**
 * The folder a job works in, by the name this machine maps: the kind's own, or the one the job names when its kind
 * takes its folder as an argument (`%repo%`), `null` for an empty folder of its own. `undefined` when the job names a
 * folder in a shape no map could hold, which refuses it.
 */
export function folderNameOf(job: Pick<ClaimedJob, 'repo' | 'args'>): string | null | undefined {
  if (job.repo === null) return null;
  const slot = JOB_REPO_SLOT.exec(job.repo)?.[1];
  if (slot === undefined) return job.repo;
  const named = Object.hasOwn(job.args, slot) ? (job.args[slot] ?? '') : '';
  if (named === JOB_NO_REPO) return null;
  return REPO_NAME.test(named) ? named : undefined;
}

/** A kind, said whole to the person about to allow it: where it works, what it may use, how it asks, and its prompt. */
function describe(job: Pinned, folders: Record<string, string>, say: (line: string) => void): void {
  const mapped = job.repo !== null && Object.hasOwn(folders, job.repo) ? folders[job.repo] : undefined;
  const names = Object.keys(folders).sort();
  const where =
    job.repo === null
      ? 'an empty folder of its own, removed when it ends'
      : JOB_REPO_SLOT.test(job.repo)
        ? `the folder each request names, one of those this machine maps (${names.length === 0 ? 'none yet' : names.join(', ')}), or an empty folder of its own when it names none`
        : mapped === undefined
          ? `${job.repo}, which names no folder on this machine yet`
          : `${job.repo}, which is ${mapped} on this machine`;
  const codex = job.agent === 'codex';
  say(`${job.kind}, ${visible(job.title)}, has not run on this machine before.`);
  say(`  Runs on ${AGENT_NAME[job.agent]}, and works in ${where}.`);
  say(`  May use ${job.tools.join(', ')}${codex ? ", and any command Codex's sandbox allows" : ''}.`);
  say(
    job.permission === 'acceptEdits'
      ? `  Changes files in that folder without asking${codex ? ', and nothing outside it' : ''}.`
      : codex
        ? '  Changes nothing: its sandbox is read-only, with no network.'
        : '  Asks for nothing: a tool it was not given is refused.',
  );
  say(`  Takes at most ${job.turns} ${job.turns === 1 ? 'turn' : 'turns'}.`);
  say(`  What it asks ${AGENT_NAME[job.agent]} to do:`);
  for (const line of job.prompt.split(/\r?\n/)) say(`    ${visible(line)}`);
}

/**
 * `braindog runner allow <kind>`: the question `run` could not ask because no terminal was attached, asked now about the
 * kind as the last refused job carried it.
 */
async function allow(args: string[], io: RunnerIo): Promise<number> {
  const [kind, ...more] = args;
  if (kind === undefined || more.length > 0 || !KIND_ID.test(kind)) {
    io.say('braindog runner allow takes one kind of job, as in braindog runner allow job.release-notes.');
    return REFUSED;
  }
  const file = runnerFile(io.home);
  let held: RunnerFile;
  try {
    held = readRunnerFile(file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${file} could not be read.`);
    return REFUSED;
  }
  const waiting = Object.hasOwn(held.waiting, kind) ? held.waiting[kind] : undefined;
  if (waiting === undefined) {
    io.say(`No job of ${kind} has been refused on this machine for want of an answer, so there is nothing to allow. Start one from the app while braindog runner run is on.`);
    return REFUSED;
  }
  const sha = shaOf(waiting.job);
  if (Object.hasOwn(held.allowed, sha)) {
    delete held.waiting[kind];
    try {
      saveRunnerFile(file, held);
    } catch {
      /* The kind is allowed either way; the entry left waiting is read as allowed the next time too. */
    }
    io.say(`${kind} is allowed on this machine already. Start the job again from the app.`);
    return 0;
  }
  const ask = askerOf(io);
  if (ask === null) {
    io.say('braindog runner allow asks the person at a terminal, and none is attached, so nothing was allowed.');
    return REFUSED;
  }
  describe(waiting.job, held.repos, io.say);
  const yes = await ask(`Allow ${kind} to run on this machine? [y/N] `, io.signal ?? new AbortController().signal);
  if (!yes) {
    io.say(`${kind} is still not allowed on this machine.`);
    return 0;
  }
  /* READ AGAIN, because a person may have taken minutes over the prompt and `run` writes this file too. */
  try {
    const fresh = readRunnerFile(file);
    fresh.allowed[sha] = { kind, at: new Date((io.now ?? Date.now)()).toISOString() };
    delete fresh.waiting[kind];
    saveRunnerFile(file, fresh);
  } catch {
    io.say(`${file} could not be written, so ${kind} was not allowed.`);
    return REFUSED;
  }
  io.say(`${kind} is allowed on this machine. Start the job again from the app.`);
  io.answer?.({ value: { kind, sha256: sha } });
  return 0;
}

/* ── the stream Claude Code writes, distilled ────────────────────────────── */

/** A proposal a run filed through the record's `propose` tool: its id, and the link to it in Decide when the record gave one. */
export type Filed = { id: string; decide?: string };

/** What one run has said so far that the end needs: its tool calls by id, the proposals it filed, its session, its result. */
export type Stream = {
  calls: Map<string, number>;
  proposing: Set<string>;
  filed: Filed[];
  session: string | null;
  result: Record<string, unknown> | null;
  unread: Set<string>;
  /** Codex's last message, which its run ends on as Claude Code's `result` line ends on its text. */
  said?: string;
};

export const freshStream = (): Stream => ({ calls: new Map(), proposing: new Set(), filed: [], session: null, result: null, unread: new Set() });

/** One line of a job's transcript as the runner reports it; `end`, `limit` and `error` are said once the run is over. */
export type Line = { kind: 'start' | 'say' | 'think' | 'tool' | 'out' | 'note'; body: Record<string, unknown> };

/** The text of a tool result, which Claude Code writes as a string or as a list of parts. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (isObject(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : isObject(part) && part.type === 'image' ? '[an image]' : ''))
    .filter((t) => t !== '')
    .join('\n');
}

/** The proposal a `propose` answer filed, read from the JSON the record's MCP door answers with, or `null`. */
function filedFrom(text: string): Filed | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.id !== 'string' || value.id === '' || value.id.length > 64 || value.proposed === false) return null;
  const decide = typeof value.decide === 'string' && /^https?:\/\//.test(value.decide) && value.decide.length <= 300 ? value.decide : undefined;
  return { id: value.id, ...(decide === undefined ? {} : { decide }) };
}

/**
 * One line of Claude Code's `stream-json` as the lines a person reads in the job's transcript (`48 §5.13`).
 *
 * THE RUNNER DISTILS; IT NEVER RELAYS (`26 §5`). The raw stream repeats every tool it could use and a usage object on
 * every message; what is kept is what a person reads, cut to a head with its whole length beside it.
 *
 * A TOOL CALL AND ITS RESULT CARRY ONE NUMBER, `call`, counted here from 1, so the transcript folds a result onto its
 * call. Claude Code's own ids are not sent: they look like keys, and the record replaces anything that does.
 */
export function distil(line: string, s: Stream): Line[] {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isObject(o) || typeof o.type !== 'string') return [];

  if (o.type === 'system') {
    if (o.subtype !== 'init') return [];
    if (typeof o.session_id === 'string') s.session = o.session_id;
    const server = Array.isArray(o.mcp_servers) ? o.mcp_servers.find((m) => isObject(m) && m.name === 'braindog') : undefined;
    return [
      {
        kind: 'start',
        body: {
          model: typeof o.model === 'string' ? head(o.model, MODEL_MOST) : null,
          tools: Array.isArray(o.tools) ? o.tools.length : 0,
          ...(isObject(server) && typeof server.status === 'string' ? { mcp: head(server.status, 40) } : {}),
        },
      },
    ];
  }

  if (o.type === 'assistant' || o.type === 'user') {
    const message = o.message;
    const parts = isObject(message) && Array.isArray(message.content) ? message.content : [];
    const out: Line[] = [];
    for (const part of parts) {
      if (!isObject(part)) continue;
      if (o.type === 'assistant' && part.type === 'text' && typeof part.text === 'string' && part.text !== '')
        out.push({ kind: 'say', body: { text: head(part.text, SAY_MOST), len: part.text.length } });
      else if (o.type === 'assistant' && part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking !== '')
        out.push({ kind: 'think', body: { text: head(part.thinking, THINK_MOST), len: part.thinking.length } });
      else if (o.type === 'assistant' && part.type === 'tool_use' && typeof part.name === 'string') {
        const call = s.calls.size + 1;
        if (typeof part.id === 'string') {
          s.calls.set(part.id, call);
          if (part.name === `${JOB_MCP_PREFIX}propose`) s.proposing.add(part.id);
        }
        const input = JSON.stringify(part.input ?? {});
        out.push({ kind: 'tool', body: { call, name: head(part.name, NAME_MOST), input: head(input, TOOL_MOST), len: input.length } });
      } else if (o.type === 'user' && part.type === 'tool_result') {
        const id = typeof part.tool_use_id === 'string' ? part.tool_use_id : '';
        const text = textOf(part.content);
        const failed = part.is_error === true;
        if (!failed && s.proposing.has(id) && s.filed.length < FILED_MOST) {
          const filed = filedFrom(text);
          if (filed !== null) s.filed.push(filed);
        }
        out.push({ kind: 'out', body: { call: s.calls.get(id) ?? 0, text: head(text, OUT_MOST), len: text.length, ...(failed ? { error: true } : {}) } });
      }
    }
    return out;
  }

  if (o.type === 'result') {
    s.result = o;
    if (typeof o.session_id === 'string') s.session = o.session_id;
    return [];
  }

  /* A LINE TYPE THIS RUNNER DOES NOT READ IS SAID ONCE, by its type alone, so a Claude Code that adds one is noticed in
     the transcript rather than dropped in silence, and a chatty one cannot fill it. */
  if (s.unread.size >= UNREAD_MOST || s.unread.has(o.type) || !/^[a-z_]{1,40}$/.test(o.type)) return [];
  s.unread.add(o.type);
  return [{ kind: 'note', body: { text: `Claude Code wrote a line of type ${o.type}, which this runner does not report.` } }];
}

/* ── a Codex job ─────────────────────────────────────────────────────────── */

/** The variable a Codex job's bearer reaches Codex in: its config names it (`bearer_token_env_var`), never an argument. */
export const JOB_BEARER_VAR = 'BRAINDOG_JOB_BEARER';

/** Codex's sandbox for a kind's permission: read-only for dontAsk, the folder alone for acceptEdits, never the machine. */
const SANDBOX: Readonly<Record<ClaimedJob['permission'], string>> = { dontAsk: 'read-only', acceptEdits: 'workspace-write' };

/**
 * `codex exec`'s arguments for a job, its prompt to follow on standard input (`-`), as Claude Code's does.
 *
 * THE KIND'S TOOLS AND NOTHING WIDER, AS FAR AS CODEX CAN SAY IT. `mcp_servers` is set whole with `-c`, which replaces
 * his own servers for this run as `--strict-mcp-config` does for Claude Code: the record's door alone, reached with the
 * job's bearer from `JOB_BEARER_VAR`, saying it is Codex, its tools held to the kind's own (`enabled_tools`). The sandbox
 * is the kind's permission, and nothing is asked, since nobody is there to answer. Its commands are held to no list:
 * the kernel refuses a Codex kind that names any (`jobBody`), so none was approved as a promise.
 */
export function codexFlags(job: Pick<ClaimedJob, 'tools' | 'permission'>, mcp: string): string[] {
  const tools = job.tools.filter((t) => t.startsWith(JOB_MCP_PREFIX)).map((t) => t.slice(JOB_MCP_PREFIX.length));
  const door = `{url = ${tomlString(mcp)}, bearer_token_env_var = ${tomlString(JOB_BEARER_VAR)}, http_headers = {"x-braindog-agent" = "codex"}, enabled_tools = [${tools.map(tomlString).join(', ')}]}`;
  return ['exec', '--json', '--skip-git-repo-check', '--sandbox', SANDBOX[job.permission], '-c', 'approval_policy="never"', '-c', `mcp_servers={braindog = ${door}}`, '-'];
}

/** A line type, or an item type, said once as one this runner does not report, so a Codex that adds one is noticed. */
function unreadOnce(type: string, s: Stream): Line[] {
  if (s.unread.size >= UNREAD_MOST || s.unread.has(type) || !/^[a-z_.:]{1,40}$/.test(type)) return [];
  s.unread.add(type);
  return [{ kind: 'note', body: { text: `Codex wrote a line of type ${type}, which this runner does not report.` } }];
}

/**
 * One line of `codex exec --json` as the lines a person reads in the job's transcript, as `distil` reads Claude Code's:
 * `thread.started` is the start and names the session; each item a message, its reasoning, a command, a call to the
 * record or a change to files; `turn.completed` is the end, on Codex's last message; `turn.failed` an error.
 *
 * READ AS CODEX'S OWN DOCUMENTS DESCRIBE IT, NOT AS A RUN WROTE IT: no Codex was on the machine this was written on.
 * Every field is read as if it may be missing, and a type not read here is said once by its name.
 */
export function distilCodex(line: string, s: Stream): Line[] {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isObject(o) || typeof o.type !== 'string') return [];
  const message = (x: unknown): string => (isObject(x) && typeof x.message === 'string' ? x.message : '');

  if (o.type === 'thread.started') {
    if (typeof o.thread_id === 'string') s.session = o.thread_id;
    return [{ kind: 'start', body: { model: null, tools: 0 } }];
  }
  if (o.type === 'turn.started') return [];
  if (o.type === 'turn.completed') {
    s.result = { type: 'result', subtype: 'success', is_error: false, num_turns: s.calls.size, ...(s.said === undefined ? {} : { result: s.said }) };
    return [];
  }
  if (o.type === 'turn.failed') {
    s.result = { type: 'result', subtype: 'error', is_error: true, num_turns: s.calls.size, result: message(o.error) || 'Codex ended the turn with an error.' };
    return [];
  }
  if (o.type === 'error') return [{ kind: 'note', body: { text: head(message(o) || 'Codex said there was an error.', SAY_MOST) } }];
  if ((o.type !== 'item.started' && o.type !== 'item.completed') || !isObject(o.item)) return o.type === 'item.updated' ? [] : unreadOnce(o.type, s);

  const item = o.item;
  const id = typeof item.id === 'string' ? item.id : `item-${String(s.calls.size + 1)}`;
  const done = o.type === 'item.completed';
  const out: Line[] = [];
  /* A CALL IS SAID ONCE, when it starts or, for an item Codex reports only once it is done, then. */
  const called = (name: string, input: string): number => {
    const had = s.calls.get(id);
    if (had !== undefined) return had;
    const call = s.calls.size + 1;
    s.calls.set(id, call);
    out.push({ kind: 'tool', body: { call, name: head(name, NAME_MOST), input: head(input, TOOL_MOST), len: input.length } });
    return call;
  };
  const result = (call: number, text: string, failed: boolean) => {
    out.push({ kind: 'out', body: { call, text: head(text, OUT_MOST), len: text.length, ...(failed ? { error: true } : {}) } });
  };

  if (item.type === 'agent_message') {
    if (done && typeof item.text === 'string' && item.text !== '') {
      s.said = item.text;
      out.push({ kind: 'say', body: { text: head(item.text, SAY_MOST), len: item.text.length } });
    }
  } else if (item.type === 'reasoning') {
    if (done && typeof item.text === 'string' && item.text !== '') out.push({ kind: 'think', body: { text: head(item.text, THINK_MOST), len: item.text.length } });
  } else if (item.type === 'command_execution') {
    const call = called('Bash', typeof item.command === 'string' ? item.command : '');
    if (done) result(call, typeof item.aggregated_output === 'string' ? item.aggregated_output : '', item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0));
  } else if (item.type === 'mcp_tool_call') {
    const name = `mcp__${typeof item.server === 'string' ? item.server : 'unknown'}__${typeof item.tool === 'string' ? item.tool : 'unknown'}`;
    const call = called(name, JSON.stringify(item.arguments ?? {}));
    if (name === `${JOB_MCP_PREFIX}propose`) s.proposing.add(id);
    if (done) {
      const failed = item.status === 'failed' || (item.error !== undefined && item.error !== null);
      const text = isObject(item.result) ? textOf(item.result.content) : message(item.error);
      if (!failed && s.proposing.has(id) && s.filed.length < FILED_MOST) {
        const filed = filedFrom(text);
        if (filed !== null) s.filed.push(filed);
      }
      result(call, text, failed);
    }
  } else if (item.type === 'file_change') {
    if (done) {
      const changes: unknown[] = Array.isArray(item.changes) ? item.changes : [];
      const said = changes
        .map((c) => (isObject(c) ? `${typeof c.kind === 'string' ? c.kind : 'update'} ${typeof c.path === 'string' ? c.path : ''}` : ''))
        .filter((l) => l.trim() !== '')
        .join('\n');
      result(called('Edit', said), item.status === 'failed' ? 'The change was not applied.' : 'Applied.', item.status === 'failed');
    }
  } else if (item.type === 'web_search') {
    called('WebSearch', typeof item.query === 'string' ? item.query : '');
  } else if (item.type === 'error') {
    if (done) out.push({ kind: 'note', body: { text: head(message(item) || 'Codex said there was an error.', SAY_MOST) } });
  } else if (typeof item.type === 'string') return unreadOnce(`item.${item.type}`, s);
  return out;
}

/* ── the report: in order, renewed, and stopped when the record says so ──── */

/** Why a job stopped before it ended by itself: Cancel in the app, the record taking it back, or Ctrl+C here. */
type Halt = 'cancelled' | 'lost' | 'stopped';

type EndBody = {
  status: 'ok' | 'needs_decision' | 'refused' | 'limit' | 'error' | 'interrupted' | 'cancelled';
  result?: Record<string, unknown>;
  error?: string;
  claude_session?: string;
  turns?: number;
  ms?: number;
  cost_minor?: number;
  cost_currency?: string;
};

/**
 * What a run cost, from Claude Code's `result` line: `total_cost_usd` in whole cents, or nothing when it said none.
 *
 * ROUNDED UP, NEVER TO THE NEAREST. A run that cost $0.0042 is one cent here, so a run that cost anything is never
 * nought on its page; the page says that one cent as "under $0.01". A cost that is missing, not a number, or below
 * nought sends neither key, and the record takes the end without one (`cost_minor` and `cost_currency` come together).
 */
export function costOf(result: Record<string, unknown> | null): { cost_minor: number; cost_currency: 'USD' } | null {
  const usd = result?.total_cost_usd;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) return null;
  /* 1.23 * 100 is 123.00000000000001 in a float, and ceil would make it 124: the cents are rounded to a millionth
     first, so only a real fraction of a cent rounds up. */
  return { cost_minor: Math.ceil(Math.round(usd * 100 * 1e6) / 1e6), cost_currency: 'USD' };
}

type Reporter = {
  /** One line, sent after every line before it. */
  post: (kind: Line['kind'] | 'limit' | 'error', body: Record<string, unknown>) => void;
  /** The end, after every line; true when the record took it. */
  end: (body: EndBody) => Promise<boolean>;
  /** Aborted when the job must stop: `why` says which. */
  halt: AbortSignal;
  why: () => Halt | null;
  /** Lines the record would not take, for being too long or too many. */
  dropped: () => number;
  /** Stops renewing. */
  close: () => void;
};

/**
 * The job's report to the record: every line in order, numbered from the claim's `seq`, the lease renewed while the run
 * is quiet, and the job halted when the record says it was stopped or is no longer this machine's.
 *
 * ONE LINE AT A TIME, IN ORDER, because the record takes only the next number (`postJobEvent`). A line the host did not
 * answer is sent again, and the record answers a repeat of the last line it holds as it did the first time, so a lost
 * answer costs nothing. A line it still does not take after `POST_TRIES` means the order is broken, and the job halts.
 *
 * NOT ON Ctrl+C'S SIGNAL. A stop here still ends the job with `interrupted`, so the report outlives the stop.
 */
function reporter(to: RunnerTarget, job: { id: string; seq: number }, io: RunnerIo): Reporter {
  const now = io.now ?? Date.now;
  const halting = new AbortController();
  let why: Halt | null = null;
  const halt = (w: Halt) => {
    why ??= w;
    halting.abort();
  };
  const onStop = () => halt('stopped');
  if (io.signal?.aborted) onStop();
  else io.signal?.addEventListener('abort', onStop, { once: true });

  let seq = job.seq;
  let queue: Promise<unknown> = Promise.resolve();
  let last = now();
  let full = false;
  let dropped = 0;
  let ended = false;
  let renewing = false;

  const call = async (method: RunnerMethod, args: object): Promise<Result<unknown>> => {
    for (let i = 0; ; i++) {
      const r = await runnerCall(to, method, args, { ms: CALL_MS, fetch: io.fetch });
      if (r.ok || !(refused(r) && r.refusal.code === 'UNREACHABLE') || i + 1 >= POST_TRIES) return r;
      try {
        await delay(RETRY_MS * 2 ** i);
      } catch {
        /* A timer is never aborted here. */
      }
    }
  };
  const heard = (value: unknown) => {
    last = now();
    if (isObject(value) && value.cancel === true) halt('cancelled');
  };
  /** One line sent: `sent`, `big` when the record would not take it for its size or for one line too many, or `lost`. */
  const send = async (kind: string, body: Record<string, unknown>): Promise<'sent' | 'big' | 'lost'> => {
    if (why === 'lost') return 'lost';
    if (kind !== 'end' && full) {
      dropped++;
      return 'big';
    }
    const next = seq + 1;
    const r = await call('postJobEvent', { job_id: job.id, seq: next, kind, body });
    if (r.ok) {
      seq = next;
      if (kind === 'end') ended = true;
      heard(r.value);
      return 'sent';
    }
    /* `at: 'seq'` IS THE RECORD'S LINE CEILING FOR ONE JOB, and every later line would be refused the same way; `at:
       'body'` is this one line, and the next may fit. Anything else means this machine no longer holds the job. */
    if (refused(r) && r.refusal.code === 'OUT_OF_BOUNDS' && (r.refusal.at === 'seq' || r.refusal.at === 'body')) {
      if (r.refusal.at === 'seq' && kind !== 'end') full = true;
      dropped++;
      return 'big';
    }
    halt('lost');
    return 'lost';
  };

  const timer = setInterval(() => {
    if (renewing || ended || why === 'lost' || now() - last < RENEW_AFTER_MS) return;
    renewing = true;
    void call('readCancel', { job_id: job.id })
      .then((r) => {
        if (r.ok) heard(r.value);
        else if (!ended && !(refused(r) && r.refusal.code === 'UNREACHABLE')) halt('lost');
      })
      .finally(() => {
        renewing = false;
      });
  }, RENEW_TICK_MS);

  return {
    post: (kind, body) => {
      queue = queue.then(() => send(kind, body));
    },
    end: (body) => {
      const sent = queue.then(async () => {
        const first = await send('end', body);
        /* AN END TOO LONG FOR THE RECORD IS SENT AGAIN WITH ITS WORDS LEFT OUT, because an end that never lands leaves
           the job held until its lease runs out, and the status is the part that matters. */
        if (first !== 'big') return first === 'sent';
        const { status, claude_session, turns, ms } = body;
        return (await send('end', { status, ...(claude_session === undefined ? {} : { claude_session }), ...(turns === undefined ? {} : { turns }), ...(ms === undefined ? {} : { ms }) })) === 'sent';
      });
      queue = sent;
      return sent;
    },
    halt: halting.signal,
    why: () => why,
    dropped: () => dropped,
    close: () => {
      clearInterval(timer);
      io.signal?.removeEventListener('abort', onStop);
    },
  };
}

/* ── run ─────────────────────────────────────────────────────────────────── */

/** A claim as this machine reads it: the job, the job's bearer, and the address of the record's MCP door. */
type Claim = { job: ClaimedJob; bearer: string; mcp: string };

/**
 * What `claimJob` answered: a job, nothing yet and how long to wait, or why the job cannot be read, with its id and
 * number when those at least can be, so the refusal can be reported against it.
 */
function readClaim(value: unknown, to: RunnerTarget): { claim: Claim } | { idle: number } | { bad: string; id?: string; seq?: number } {
  if (!isObject(value)) return { bad: `${to.key} answered a claim in a way this runner does not recognise.` };
  if (value.job === null) return { idle: isCount(value.idle_ms) ? Math.min(Math.max(value.idle_ms, IDLE_LEAST_MS), IDLE_MOST_MS) : IDLE_LEAST_MS };
  const j = value.job;
  if (!isObject(j) || typeof j.id !== 'string' || !JOB_ID.test(j.id) || !isCount(j.seq))
    return { bad: `${to.key} answered a claim with a job this runner cannot read, so it was left to run out.` };
  const at = { id: j.id, seq: j.seq };
  const pinned = pinnedOf(j);
  const args = j.args;
  if (pinned === null || !isObject(args) || !Object.values(args).every((v) => typeof v === 'string'))
    return { bad: 'The job arrived in a shape this runner cannot read, so it was not run.', ...at };
  /* A PROFILE THE JOB NAMES IN A SHAPE THIS RUNNER CANNOT READ IS NOT DROPPED, because dropping it would run the job under
     this runner's own login rather than the one asked for. A host older than migration 44 names none. */
  const seat = j.seat === undefined || j.seat === null ? null : typeof j.seat === 'string' && SEAT_NAME.test(j.seat) ? j.seat : undefined;
  if (seat === undefined) return { bad: 'The job named a Claude Code profile in a shape this runner cannot read, so it was not run.', ...at };
  const bearer = typeof value.bearer === 'string' && BEARER.test(value.bearer) ? value.bearer : '';
  const said = isObject(value.mcp) && typeof value.mcp.url === 'string' ? value.mcp.url : '';
  let mcp = '';
  try {
    const url = new URL(said, `${to.base}/`);
    /* THE JOB'S BEARER GOES ONLY TO THE HOST THIS MACHINE ENROLLED WITH, whatever address the claim names. */
    if (said !== '' && url.origin === to.base) mcp = url.href;
  } catch {
    mcp = '';
  }
  if (bearer === '' || mcp === '') return { bad: 'The job arrived without a key for the record, or with one for another site, so it was not run.', ...at };
  return {
    claim: {
      job: { ...pinned, id: j.id, seq: j.seq, args: args as Record<string, string>, permission: pinned.permission as ClaimedJob['permission'], agent: pinned.agent, seat },
      bearer,
      mcp,
    },
  };
}

/**
 * THE CLAUDE CODE PROFILES THIS MACHINE CAN START A JOB UNDER, by the name its runs carry (`profileNameOf`), each with
 * the folders that answer to it: the ones `~/.braindog/profiles.json` lists, else every one `doctor` finds
 * (`profilesIn`), and always the runner's own. One folder reached two ways is one profile; a name two folders share
 * keeps both, so a job under it can be refused rather than guessed at.
 */
export function seatsHere(home: string, env: Env): Map<string, string[]> {
  const own = (env.CLAUDE_CONFIG_DIR ?? '').trim();
  const dirs = [...profilesIn(home, listedProfiles(home) ?? [], env), own === '' ? join(home, '.claude') : resolve(own)];
  const seats = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const dir of dirs) {
    const real = realOf(dir);
    if (seen.has(real)) continue;
    seen.add(real);
    const name = profileNameOf({ CLAUDE_CONFIG_DIR: dir, CCENV_HOME: env.CCENV_HOME }, home);
    if (name === null || !SEAT_NAME.test(name)) continue;
    seats.set(name, [...(seats.get(name) ?? []), dir]);
  }
  return seats;
}

/**
 * WHAT ONE CLAIM SAYS OF WHERE THIS RUNNER IS: the machine, as its runs name it, and the profiles it can start a job
 * under, by name and never by folder. A host that does not read them yet ignores them, and hands over only jobs placed
 * nowhere, as before.
 */
export function claimArgs(home: string, env: Env, host: string): { wait: number; host?: string; seats: string[]; repos: string[] } {
  const seats = [...seatsHere(home, env).keys()].sort().slice(0, SEATS_SENT_MOST);
  /* AND THE FOLDERS IT MAPS, BY NAME AND NEVER BY PATH, so the app can offer them for a request sent here. */
  let repos: string[] = [];
  try {
    repos = Object.keys(readRunnerFile(runnerFile(home)).repos).sort().slice(0, REPOS_SENT_MOST);
  } catch {
    repos = [];
  }
  return { wait: CLAIM_WAIT_S, ...(MACHINE_NAME.test(host) ? { host } : {}), seats, repos };
}

/**
 * The environment a job runs in, by the profile it names: this runner's own when it names none, and otherwise the
 * runner's with `CLAUDE_CONFIG_DIR` naming that profile's folder (`envFor`, which leaves it unset for `~/.claude`). Or
 * the sentence that refuses it, which names the profile and never a folder, because it is posted to the record.
 */
export function seatEnv(seat: string | null, home: string, env: Env): { env: Env; seat: string | null } | { refused: string } {
  if (seat === null) return { env: { ...env }, seat: profileNameOf(env, home) };
  const dirs = seatsHere(home, env).get(seat) ?? [];
  const [dir] = dirs;
  if (dir === undefined)
    return { refused: `This machine has no Claude Code profile called ${seat}. Add it to ~/.braindog/profiles.json on the machine, or start the job under another profile.` };
  if (dirs.length > 1)
    return { refused: `Two Claude Code profiles on this machine are called ${seat}, so it was not run under either. List the one you mean in ~/.braindog/profiles.json on the machine, then start the job again.` };
  return { env: envFor(dir, home, env), seat };
}

/**
 * Why this machine will not run a job, or `null` when it will: the kind's lint, its arguments, its folder, and whether
 * the installed Claude Code knows its permission mode. The pin is asked after these, so nobody is asked about a job
 * that could not have run.
 */
function refusalOf(job: ClaimedJob, file: RunnerFile, agents: Agents): string | null {
  /* THE AGENT THE KIND NAMES, on this machine, before anything else is read: a Codex kind on a machine with Claude Code
     alone is no job it could run. */
  const runs = agents[job.agent];
  if (typeof runs === 'string') return `${runs}, so it was not run. Install or update ${AGENT_NAME[job.agent]}, then start the job again.`;
  /* THE KERNEL'S OWN LINT, over what the claim carries. The claim says each argument's value and not its declaration,
     so each is declared as it arrived, at the longest any kind allows; `writes` is not sent, and the lint's rule that a
     kind changing files without asking says so is kept by saying it for exactly those kinds. */
  const name = job.kind.startsWith('job.') ? job.kind.slice('job.'.length) : '';
  const ids = Object.keys(job.args);
  const fault = jobBody({
    id: KIND_ID.test(job.kind) ? job.kind : 'This job',
    body: {
      job: name,
      title: job.title,
      prompt: job.prompt,
      tools: job.tools,
      turns: job.turns,
      permission: job.permission,
      ...(job.repo === null ? {} : { repo: job.repo }),
      ...(ids.length === 0 ? {} : { args: ids.map((id) => ({ id, label: id, max: ARG_MOST })) }),
      ...(job.permission === 'acceptEdits' ? { writes: true } : {}),
      ...(job.agent === 'codex' ? { agent: 'codex' } : {}),
    },
  });
  if (fault !== null) return `${fault.fix} So it was not run on this machine.`;
  if (Object.values(job.args).some((v) => v.length > ARG_MOST || /[\p{Cc}]/u.test(v)))
    return `An argument was longer than ${ARG_MOST} characters or more than one line, which no kind allows, so it was not run.`;
  const named = folderNameOf(job);
  if (named === undefined) return 'The job named its folder in a shape no folder on this machine could have, so it was not run.';
  if (named !== null) {
    const folder = Object.hasOwn(file.repos, named) ? file.repos[named] : undefined;
    if (folder === undefined) return `This machine has no folder called ${named}. Map one with braindog runner repos add ${named} <folder>, then start the job again.`;
    let there = false;
    try {
      there = statSync(folder).isDirectory();
    } catch {
      there = false;
    }
    if (!there) return `${named} is mapped to ${folder} on this machine, and that folder is gone. Map it again, then start the job again.`;
  }
  if (job.agent === 'claude' && !knowsMode(runs.help, job.permission))
    return `Claude Code ${runs.version} on this machine does not know the permission mode ${job.permission}, so it was not run. Update Claude Code, then start the job again.`;
  return null;
}

/** How a job ended, said in one line on this machine. */
const ENDED: Record<EndBody['status'], string> = {
  ok: 'finished',
  needs_decision: 'finished, and filed a proposal to decide',
  refused: 'was refused on this machine',
  limit: 'ran out of turns',
  error: 'failed',
  interrupted: 'was interrupted',
  cancelled: 'was stopped from the app',
};

/** How one job went: its end reported, the record no longer holding it for this machine, or stopped here by Ctrl+C. */
type Outcome = 'reported' | 'lost' | 'stopped';

/**
 * One claimed job, from the checks to the end: refused with its sentence, or run in its folder with its tools, its
 * lines reported as they come, and ended with the status its result earns.
 */
async function runJob(to: RunnerTarget, claim: Claim, agents: Agents, io: RunnerIo): Promise<{ outcome: Outcome; status: EndBody['status'] | null }> {
  const { job } = claim;
  const now = io.now ?? Date.now;
  const platform = io.platform ?? process.platform;
  const began = now();
  const report = reporter(to, job, io);
  const kind = KIND_ID.test(job.kind) ? job.kind : 'A job';
  let temp: string | null = null;
  let door: string | null = null;

  const finish = async (body: EndBody): Promise<{ outcome: Outcome; status: EndBody['status'] | null }> => {
    const took = await report.end(body);
    io.say(took ? `${kind} ${ENDED[body.status]}.` : `${kind} ended here, and ${to.key} did not take its end. It lets the job go when its lease runs out.`);
    return { outcome: took ? (report.why() === 'stopped' ? 'stopped' : 'reported') : 'lost', status: took ? body.status : null };
  };
  const refuse = (why: string) => {
    io.say(`${kind}: ${why}`);
    report.post('error', { text: head(why, ERROR_MOST) });
    return finish({ status: 'refused', error: head(why, ERROR_MOST) });
  };

  try {
    let held: RunnerFile;
    try {
      held = readRunnerFile(runnerFile(io.home));
    } catch (e) {
      return await refuse(e instanceof Error ? e.message : 'The runner file on this machine could not be read.');
    }
    const fault = refusalOf(job, held, agents);
    if (fault !== null) return await refuse(fault);
    /* THE PROFILE, BEFORE THE PIN, so nobody is asked about a job that could not have run here. */
    const under = seatEnv(job.seat, io.home, io.env);
    if ('refused' in under) return await refuse(under.refused);

    /* THE PIN: ASKED ONCE PER KIND ON THIS MACHINE, by the hash of what it would run. The lease is renewed while the
       person reads, and a Cancel in the app ends the question. */
    const pinned: Pinned = { kind: job.kind, title: job.title, prompt: job.prompt, tools: job.tools, turns: job.turns, permission: job.permission, repo: job.repo, agent: job.agent };
    const sha = shaOf(pinned);
    if (!Object.hasOwn(held.allowed, sha)) {
      const ask = askerOf(io);
      if (ask === null) {
        const waiting = { ...held.waiting, [job.kind]: { host: to.key, at: new Date(now()).toISOString(), job: pinned } };
        const kept = Object.entries(waiting).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, WAITING_MOST);
        try {
          saveRunnerFile(runnerFile(io.home), { ...held, waiting: Object.fromEntries(kept) });
        } catch {
          /* The refusal below still says what to run; `allow` then says there is nothing waiting, which is true. */
        }
        return await refuse(`This machine has not allowed ${job.kind} to run on it. On it, run braindog runner allow ${job.kind}, then start the job again.`);
      }
      describe(pinned, held.repos, io.say);
      const yes = await ask(`Allow ${job.kind} to run on this machine? [y/N] `, report.halt);
      if (report.why() === 'lost') return { outcome: 'lost', status: null };
      if (report.why() !== null) return await finish({ status: report.why() === 'cancelled' ? 'cancelled' : 'interrupted' });
      if (!yes) return await refuse(`The person at this machine did not allow ${job.kind} to run on it.`);
      /* READ AGAIN, for `allow`'s reason: the person may have taken minutes over the prompt. */
      try {
        const fresh = readRunnerFile(runnerFile(io.home));
        fresh.allowed[sha] = { kind: job.kind, at: new Date(now()).toISOString() };
        delete fresh.waiting[job.kind];
        saveRunnerFile(runnerFile(io.home), fresh);
      } catch {
        io.say(`${job.kind} runs this once: the runner file could not be written, so it will be asked about again.`);
      }
    }

    /* THE FOLDER: the one this machine mapped the kind's repository to, or an empty one of its own. */
    const named = folderNameOf(job) ?? null;
    const folder = named === null ? (temp = mkdtempSync(join(tmpdir(), 'braindog-job-'))) : (held.repos[named] ?? '');
    const codex = job.agent === 'codex';
    const name = AGENT_NAME[job.agent];
    /* THE RUN SAYS ITS MACHINE AND ITS PROFILE, BY NAME, as a session's bridge does, so the record shows where it ran. */
    const machine = io.host ?? hostname();
    const where = {
      ...(MACHINE_NAME.test(machine) ? { 'x-braindog-host': machine } : {}),
      ...(under.seat !== null && SEAT_NAME.test(under.seat) ? { 'x-braindog-profile': under.seat } : {}),
      /* AND THE FOLDER IT WORKS IN, BY NAME, so its run says where it was, as a session's does. */
      ...(named !== null && REPO_NAME.test(named) ? { 'x-braindog-repo': named } : {}),
      ...(codex ? {} : { 'x-braindog-agent': 'claude' }),
    };
    /* THE MACHINE'S LOGIN STAYS OUT OF THE RUN. The job reaches the record with its own bearer and nothing else. */
    const env: Env = under.env;
    delete env.BRAINDOG_TOKEN;
    let flags: string[];
    if (codex) {
      /* CODEX TAKES THE JOB'S BEARER FROM A VARIABLE ITS CONFIG NAMES (`codexFlags`), never an argument or a file. */
      env[JOB_BEARER_VAR] = claim.bearer;
      flags = codexFlags(job, claim.mcp);
    } else {
      /* THE DOOR: a folder of its own holding one file at 0600, which only Claude Code reads and `finally` removes. */
      door = mkdtempSync(join(tmpdir(), 'braindog-mcp-'));
      const mcpJson = join(door, 'mcp.json');
      writeFileSync(mcpJson, JSON.stringify({ mcpServers: { braindog: { type: 'http', url: claim.mcp, headers: { Authorization: `Bearer ${claim.bearer}`, ...where } } } }), { mode: 0o600 });
      chmodSync(mcpJson, 0o600);
      const help = (agents.claude as Claude).help;
      /* `--verbose` BECAUSE `stream-json` UNDER `-p` IS REFUSED WITHOUT IT. `--allowedTools` takes each tool as its own
         argument, so a named command holding a comma or a space is never split, and the flag after it ends the list. */
      flags = [
        '-p',
        ...(offers(help, '--restricted') ? ['--restricted'] : []),
        ...(offers(help, '--disable-slash-commands') ? ['--disable-slash-commands'] : []),
        '--output-format',
        'stream-json',
        '--verbose',
        '--strict-mcp-config',
        '--mcp-config',
        mcpJson,
        '--allowedTools',
        ...job.tools,
        '--permission-mode',
        job.permission,
        '--max-turns',
        String(job.turns),
      ];
    }
    const plan = planCommand(job.agent, flags, env, { platform, isFile: aFile });
    if (typeof plan === 'string') return await refuse(`${name} could not be started safely on this machine, so it was not run.`);

    io.say(`Running ${job.kind}, ${visible(job.title)}, in ${named === null ? 'an empty folder' : `${named} (${folder})`}${job.seat === null ? '' : `, as ${job.seat}`}.`);
    const s = freshStream();
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawn(plan.command, plan.args, { cwd: folder, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true, windowsVerbatimArguments: plan.verbatim });
    } catch {
      return await refuse(`${name} did not start on this machine, so it was not run.`);
    }
    const onHalt = () => stopChild(child, platform);
    if (report.halt.aborted) onHalt();
    else report.halt.addEventListener('abort', onHalt, { once: true });
    /* THE WALL CLOCK: a run past `wallOf` is stopped, and ends as one that ran out. */
    const wall = wallOf(io.env);
    let late = false;
    const clock = setTimeout(() => {
      late = true;
      stopChild(child, platform);
    }, wall);

    const closed = new Promise<{ code: number | null; failed: boolean }>((done) => {
      child.on('error', () => done({ code: null, failed: true }));
      child.on('close', (code) => done({ code, failed: false }));
    });
    /* THE PROMPT ON STANDARD INPUT, filled once: a value that says `%other%` stays those words (`fillPrompt`). */
    child.stdin?.on('error', () => {});
    child.stdin?.end(fillPrompt(job.prompt, job.args));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_KEPT);
    });
    if (child.stdout) lineReader({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
      for (const one of (codex ? distilCodex : distil)(line, s)) report.post(one.kind, one.body);
      /* CODEX HAS NO --max-turns, so a run that has made more calls than the kind's turns is stopped here, and ends as
         one that ran out of turns. Claude Code stops itself. */
      if (codex && s.result === null && s.calls.size > job.turns) {
        s.result = { type: 'result', subtype: 'error_max_turns', num_turns: job.turns };
        stopChild(child, platform);
      }
    });
    const exit = await closed;
    clearTimeout(clock);
    report.halt.removeEventListener('abort', onHalt);

    const why = report.why();
    if (why === 'lost') {
      io.say(`${kind} is no longer this machine's: ${to.key} took it back or stopped answering, so it was stopped here.`);
      return { outcome: 'lost', status: null };
    }
    const session = s.session !== null && s.session.length <= SESSION_MOST ? { claude_session: s.session } : {};
    const r = s.result;
    const turns = r !== null && isCount(r.num_turns) ? { turns: r.num_turns } : {};
    const cost = costOf(r) ?? {};
    const ms = { ms: r !== null && typeof r.duration_ms === 'number' && r.duration_ms >= 0 ? Math.round(r.duration_ms) : Math.max(0, now() - began) };
    const said = r !== null && typeof r.result === 'string' ? head(r.result, RESULT_MOST) : null;
    const result = {
      ...(said === null ? {} : { text: said }),
      ...(s.filed.length === 0 ? {} : { filed: s.filed }),
      ...(report.dropped() === 0 ? {} : { dropped: report.dropped() }),
    };
    const kept = Object.keys(result).length === 0 ? {} : { result };

    if (why === 'cancelled') return await finish({ status: 'cancelled', ...kept, ...session, ...turns, ...cost, ...ms });
    if (why === 'stopped') return await finish({ status: 'interrupted', ...kept, ...session, ...turns, ...cost, ...ms });
    if (late && (r === null || r.subtype !== 'success')) {
      const error = `It ran past ${String(Math.round(wall / 60_000))} minutes on this machine, so it was stopped.`;
      report.post('limit', { turns: r !== null && isCount(r.num_turns) ? r.num_turns : job.turns, text: error });
      return await finish({ status: 'limit', error, ...kept, ...session, ...turns, ...cost, ...ms });
    }
    if (r !== null && r.subtype === 'success' && r.is_error !== true)
      return await finish({ status: s.filed.length > 0 ? 'needs_decision' : 'ok', ...kept, ...session, ...turns, ...cost, ...ms });
    if (r !== null && r.subtype === 'error_max_turns') {
      report.post('limit', { turns: isCount(r.num_turns) ? r.num_turns : job.turns });
      return await finish({ status: 'limit', ...kept, ...session, ...turns, ...cost, ...ms });
    }
    if (r !== null) {
      const subtype = typeof r.subtype === 'string' ? head(r.subtype, 40) : 'error';
      const text = head(said ?? `${name} ended the run with ${subtype}.`, ERROR_MOST);
      report.post('error', { subtype, text });
      return await finish({ status: 'error', error: text, ...kept, ...session, ...turns, ...cost, ...ms });
    }
    /* NO RESULT LINE. 143 is the answer to SIGTERM from outside this runner (`26 §5`); anything else is a failure, said
       with the end of what it wrote to standard error. */
    if (!exit.failed && (exit.code === 143 || exit.code === 130 || exit.code === null)) return await finish({ status: 'interrupted', ...kept, ...session, ...ms });
    const error = exit.failed
      ? `${name} did not start on this machine.`
      : head(`${name} ended with exit code ${String(exit.code)} and no result.${stderr.trim() === '' ? '' : ` It said: ${stderr.trim()}`}`, ERROR_MOST);
    report.post('error', { text: error });
    return await finish({ status: 'error', error, ...kept, ...session, ...ms });
  } finally {
    report.close();
    for (const dir of [door, temp]) {
      if (dir === null) continue;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* A folder a child still holds open on Windows is left for the system's own temp sweep; it holds no key once
           the job's end has revoked the bearer. */
      }
    }
  }
}

const RUN_USAGE = 'braindog runner run takes --once and --host <host>, and nothing else.';

/**
 * `braindog runner run [--once]`: claim, check, run, report, and claim again, one job at a time, until Ctrl+C, or after
 * one job with `--once`.
 *
 * NOTHING IS CLAIMED WITHOUT AN AGENT TO RUN IT, Claude Code or Codex. Their versions are read at the start and again
 * after every job, so an update that goes wrong mid-afternoon stops the runner rather than the job after it.
 */
async function run(args: string[], io: RunnerIo): Promise<number> {
  let values: { once?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { once: { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    io.say(RUN_USAGE);
    return REFUSED;
  }
  const now = io.now ?? Date.now;
  let to: RunnerTarget;
  try {
    to = runnerTarget(values.host, io.env, io.file, now());
    readRunnerFile(runnerFile(io.home));
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return REFUSED;
  }
  let agents = await agentsHere(io);
  if (noAgent(agents)) {
    io.say(`${String(agents.claude)}, so no job was claimed. Install or update Claude Code, then run this again.`);
    return REFUSED;
  }

  const stopped = () => io.signal?.aborted === true;
  const sleep = async (ms: number) => {
    try {
      await delay(ms, undefined, io.signal ? { signal: io.signal } : {});
    } catch {
      /* Ctrl+C ends the wait, and the loop sees it. */
    }
  };
  io.say(`Running jobs for ${to.key} as ${to.label || 'this machine'}, with ${agentsSaid(agents)}. Ctrl+C stops it.`);
  let idle = IDLE_LEAST_MS;
  let silent = false;
  while (!stopped()) {
    const asked = now();
    const r = await runnerCall(to, 'claimJob', claimArgs(io.home, io.env, io.host ?? hostname()), { ms: CLAIM_WAIT_S * 1000 + CLAIM_SLACK_MS, signal: io.signal, fetch: io.fetch });
    if (stopped()) break;
    if (!r.ok) {
      if (refused(r) && r.refusal.code === 'UNREACHABLE') {
        if (!silent) io.say(`${to.key} did not answer. This machine asks again every ${UNREACHABLE_WAIT_MS / 1000} seconds.`);
        silent = true;
        await sleep(UNREACHABLE_WAIT_MS);
        continue;
      }
      io.say(
        refused(r) && r.refusal.code !== 'UNAUTHORIZED'
          ? r.refusal.fix
          : `${to.key} no longer takes this machine's enrolment. Run braindog runner enrol ${to.key}.`,
      );
      return REFUSED;
    }
    if (silent) io.say(`${to.key} answers again.`);
    silent = false;

    const read = readClaim(r.value, to);
    if ('idle' in read) {
      /* A HOST THAT HELD THE CLAIM IS ASKED AGAIN AT ONCE; one that answered at once with nothing is behind something
         that cannot hold twenty seconds, and is asked less often, up to every thirty (`26 §5`). */
      if (now() - asked < (CLAIM_WAIT_S * 1000) / 2) {
        const wait = Math.max(idle, read.idle);
        await sleep(wait);
        idle = Math.min(wait * 2, IDLE_MOST_MS);
      } else idle = read.idle;
      continue;
    }
    idle = IDLE_LEAST_MS;
    if ('bad' in read) {
      io.say(read.bad);
      if (read.id !== undefined && read.seq !== undefined) {
        const report = reporter(to, { id: read.id, seq: read.seq }, io);
        report.post('error', { text: read.bad });
        await report.end({ status: 'refused', error: read.bad });
        report.close();
      }
      if (values.once) return REFUSED;
      /* A CLAIM THAT NAMES NO JOB IT COULD REFUSE WOULD BE ANSWERED THE SAME WAY AT ONCE, so it waits as a host that
         did not answer does, rather than asking again in a loop with no ceiling. */
      if (read.id === undefined) await sleep(UNREACHABLE_WAIT_MS);
      continue;
    }

    const done = await runJob(to, read.claim, agents, io);
    io.answer?.({ value: { job: read.claim.job.id, kind: read.claim.job.kind, status: done.status } });
    if (values.once || done.outcome === 'stopped') return done.outcome === 'reported' ? 0 : done.outcome === 'lost' ? UNREACHABLE : REFUSED;
    const again = await agentsHere(io);
    if (noAgent(again)) {
      io.say(`${String(again.claude)}, so no more jobs are claimed. Install or update Claude Code, then run this again.`);
      return REFUSED;
    }
    agents = again;
  }
  io.say('Stopped. No job is running on this machine.');
  return 0;
}
