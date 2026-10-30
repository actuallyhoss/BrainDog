/**
 * `braindog setup <url> [--dry-run | --yes] [--only <app>] [--profile <folder>]`: one command sets a machine up from
 * the record, in every app on it and every Claude Code profile he uses.
 *
 * THE STEPS IN ORDER, EACH ONE ALREADY A COMMAND OF ITS OWN: sign in unless a live login for the host is held,
 * `install --apply` into every profile (the session's start and end, the beat, and the prompt, tool and stop hooks
 * that hear what he tells a run and deny its tools when he stops it) and, where Codex is, its turn end and BrainDog's
 * block in its AGENTS.md (`clients/codex-hooks.ts`), the `braindog` MCP server registered in every profile and every
 * other app, `tools write --scope user` with the record's global tools in every app, `skills sync`,
 * and one token for each kind of agent wired, each approved in the app (`agentTokens`). Each step prints one line
 * saying what it did or found, ONE LINE PER APP AND PROFILE where a step touches several, with the lines its command
 * would print indented under it, and the run stops at the first step that fails, with that step's sentence.
 *
 * EVERY APP THE TABLE HOLDS (`clients/index.ts`) that is on this machine, or those named with `--only`. THE PROFILES
 * are the default one, `~/.claude`, the one `CLAUDE_CONFIG_DIR` names, each `--profile <folder>` given, and
 * those kept from earlier runs in `~/.braindog/profiles.json`, which a run that writes keeps up to date, so a second
 * machine-wide run reaches a profile named once. A kept profile no longer on this machine is left out and said.
 *
 * A COPY OF EVERY FILE IT CHANGES, the first one named `<file>.pre-braindog`, the scope's word for it (`backupOf` in
 * `install.ts`): install's writer keeps one for the settings, and a profile's servers file is copied before
 * `claude mcp add-json` changes it, since that program writes the file and nothing here sees it written.
 *
 * ITS LAST LINES SAY WHAT IS LEFT, IN THE WORDS TO TYPE: this repository's own tools, which only `tools write
 * --scope project` writes, and the tools whose keys need keychain access this machine does not hold.
 *
 * A SECOND RUN CHANGES NOTHING AND SAYS SO. Every step reads before it writes: a login held is not asked for again,
 * hooks already in the settings are not added again, a registration that already runs this command is left, and
 * `tools write` and `skills sync` already write only what differs. When no step changed anything, the last line says
 * that.
 *
 * `--dry-run` WRITES NOTHING. No login is asked for, no file is written, `claude` is not run, and the record is only
 * read, and only when a login is already held to read it with.
 *
 * NOTHING AT PROJECT SCOPE. A project's `.mcp.json` is shared through its repository, so it is written only by `tools
 * write --scope project` typed by hand (question 5 of the agent path), and skills are synced here into the profile
 * alone. Both steps are run as if outside any repository for that reason.
 *
 * NO KEY AND NO TOKEN IS PRINTED OR WRITTEN BY THIS FILE. The login goes into the hosts file inside `login`, the MCP
 * entry holds a command and no `env`, and a tool's key is named by the command that opens it, never held.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { unbom } from './unbom.ts';
import { applyCodexHooks, planCodexHooks } from './clients/codex-hooks.ts';
import { CLIENTS, type Client } from './clients/index.ts';
import { hostKey, hostsPath, keyPrint, readHosts, sameHost, saveHosts, target, type Held } from './http.ts';
import { BRAINDOG_SERVER, HOOKS_HELD, installProfiles, keepCopy, PLACES_SKILL, serversFileOf } from './install.ts';
import { keepPin, pinOf, pinsFile, readPins } from './pins.ts';
import { placeStatusLine, statusLineEntry, statusLineIn } from './statusline-place.ts';
import { approveOperation, login, machineName } from './login.ts';
import { connect, isObject, syncSkills, valueOf, type AgentIo, type Connected } from './skills.ts';
import { writeTools } from './tools.ts';

type Env = Record<string, string | undefined>;

/** How `claude` is run, with `env` as its whole environment when given, so `CLAUDE_CONFIG_DIR` picks the profile. */
export type ProfileRunner = (args: string[], cwd: string, env?: Env) => Promise<number>;

/** What `setup` needs from its process, passed in so a test can hold all of it. */
export type SetupIo = AgentIo & {
  /** The path of `main.ts` (the bundle, once built), which every tool wrapper and helper runs. */
  cli: string;
  /** The folder of the hook scripts `install` puts in the settings. */
  scripts: string;
  /** Aborted by Ctrl+C, which ends the wait for the six digits with one sentence. */
  signal?: AbortSignal | undefined;
  /** How `claude` is run: `runIn` unless a test holds it. */
  claude?: ProfileRunner | undefined;
  /** How step 1 signs in: `login` unless a test holds it. */
  signIn?: typeof login | undefined;
  /** Step 2's question: true for yes, false for anything else, null when no one is at a terminal. `askTerminal` unless a test holds it. */
  ask?: ((question: string) => Promise<boolean | null>) | undefined;
  /** How step 6 makes an agent's token: `mintAgent` unless a test holds it. */
  mint?: MintAgent | undefined;
};

/**
 * A yes or no from the person at the terminal, asked on stderr so standard output keeps one line per step. Null off a
 * terminal, where nobody can answer and waiting would hang a script. Only `y` or `yes` is a yes.
 */
export async function askTerminal(question: string, signal?: AbortSignal): Promise<boolean | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  /* CTRL+C AT THE QUESTION IS A NO. Readline takes it from the terminal itself, and with no listener only pauses. */
  rl.on('SIGINT', () => rl.close());
  try {
    return /^\s*y(?:es)?\s*$/iu.test(await rl.question(question, signal ? { signal } : {}));
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

const USAGE =
  'braindog setup takes the address of one BrainDog, as in braindog setup https://app.brain.dog/<slug>, with --dry-run or --yes, --only <app>, --profile <folder> and --statusline, and nothing else.';

/**
 * The real `claude`, run in the profile `env` names. NO SHELL, and its output is not relayed, as `runClaude` in
 * `clients/claude.ts`, which takes no environment: `claude mcp add-json --scope user` writes into the profile its own
 * `CLAUDE_CONFIG_DIR` names, so registering in every profile means one run per profile, each with its own.
 */
export const runIn: ProfileRunner = (args, cwd, env) =>
  new Promise((done) => {
    const child = spawn('claude', args, { cwd, stdio: 'ignore', shell: false, windowsHide: true, ...(env ? { env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) } : {}) });
    child.on('error', () => done(-1));
    child.on('exit', (code) => done(code ?? 1));
  });

/* Paths compared as the file system compares them: without case on Windows. */
const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);

/** Where the profiles of earlier runs are kept, under the home `setup` is given, so a test's home holds its own. */
export const profilesFile = (home: string): string => join(home, '.braindog', 'profiles.json');

/** The profiles kept from earlier runs. A file that does not read keeps none, and the next run that writes replaces it. */
function keptProfiles(file: string): string[] {
  try {
    const parsed: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    const list = isObject(parsed) && Array.isArray(parsed.profiles) ? parsed.profiles : [];
    return list.filter((p): p is string => typeof p === 'string' && isAbsolute(p));
  } catch {
    return [];
  }
}

/**
 * Every Claude Code profile setup reaches, each once: the default, the environment's, each `--profile`, then each kept
 * one. A KEPT ONE NO LONGER ON THIS MACHINE IS LEFT OUT (`gone`), since writing it would make a profile nobody starts;
 * a folder typed now, or the environment's, is made when missing, as `install --config-dir` makes it.
 */
function profilesFor(named: string[], io: SetupIo): { list: string[]; gone: string[]; kept: string[] } {
  const kept = keptProfiles(profilesFile(io.home));
  const seen = new Set<string>();
  const list: string[] = [];
  const gone: string[] = [];
  const add = (dir: string, mustExist: boolean) => {
    const abs = resolve(io.cwd, dir);
    if (seen.has(fold(abs))) return;
    if (mustExist && !existsSync(abs)) {
      gone.push(abs);
      return;
    }
    seen.add(fold(abs));
    list.push(abs);
  };
  add(join(io.home, '.claude'), false);
  if (io.env.CLAUDE_CONFIG_DIR) add(io.env.CLAUDE_CONFIG_DIR, false);
  for (const dir of named) add(dir, false);
  for (const dir of kept) add(dir, true);
  return { list, gone, kept };
}

/** A profile as a person reads it: `~/<folder>` under the home, else the folder. */
function nameOf(dir: string, home: string): string {
  const rel = relative(home, dir);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) ? `~/${rel.replaceAll('\\', '/')}` : dir;
}

/**
 * The environment `claude` runs in for one profile: the shell's, with `CLAUDE_CONFIG_DIR` naming the profile, or with
 * none for the default one, because Claude Code keeps the default profile's servers in `~/.claude.json` only when the
 * variable is unset (`serversFileOf`), and set to `~/.claude` it writes inside the folder.
 */
export function envFor(dir: string, home: string, env: Env): Env {
  const { CLAUDE_CONFIG_DIR: _, ...rest } = env;
  return serversFileOf(dir, home) === join(home, '.claude.json') ? rest : { ...rest, CLAUDE_CONFIG_DIR: dir };
}

const profileEnv = (dir: string, io: SetupIo): Env => envFor(dir, io.home, io.env);

/** BrainDog's server as another app runs it: this command, with that app's name after `--agent`. No env, so no token. */
export const serverFor = (agent: string): Record<string, unknown> => ({ type: 'stdio', command: BRAINDOG_SERVER.command, args: [BRAINDOG_SERVER.args[0], 'mcp', '--agent', agent] });

/** Whether an entry runs the same server as `want`: the type may be left out of a stdio one, and an empty `env` is no change. */
export function sameServer(held: unknown, want: Record<string, unknown>): boolean {
  if (!isObject(held)) return false;
  const args = Array.isArray(held.args) ? held.args : [];
  const wanted = Array.isArray(want.args) ? want.args : [];
  return (held.type ?? 'stdio') === want.type && held.command === want.command && args.length === wanted.length && wanted.every((arg, i) => args[i] === arg);
}

/** Whether a login the next command would send is held for this host now: the hosts file's, unexpired, or `BRAINDOG_TOKEN`. */
function loginHeld(key: string, env: Env, file: string): boolean {
  try {
    return target(key, env, file).token !== undefined;
  } catch {
    /* EXPIRED, OR A HOSTS FILE THAT DOES NOT READ: either way step 1 signs in, and `login` says what is wrong with the file. */
    return false;
  }
}

/**
 * Whether the hosts file keeps a login for this host while its default names another host or none.
 *
 * THE MCP SERVER AND THE HOOKS REACH THE DEFAULT HOST, because the entry `install` and step 3 write names no host. A
 * machine already signed in to another record would otherwise be set up to reach that one, with every line here
 * saying this one. `login` makes the host it signs in to the default, so only a login already held needs this.
 */
function defaultElsewhere(key: string, file: string): boolean {
  try {
    const hosts = readHosts(file);
    const kept = Object.entries(hosts.hosts).some(([written, held]) => sameHost(written, key) && held.token !== undefined);
    return kept && (hosts.default === undefined || !sameHost(hosts.default, key));
  } catch {
    return false;
  }
}

/**
 * Whether the hosts file's default is some other host or none, for a run whose bearer is `BRAINDOG_TOKEN`: the file
 * then may hold no login at all, and the default is still what the MCP server and the hooks reach.
 */
function defaultNot(key: string, file: string): boolean {
  try {
    const hosts = readHosts(file);
    return hosts.default === undefined || !sameHost(hosts.default, key);
  } catch {
    return false;
  }
}

/** Whether the profile's servers file registers `braindog` as this command's server, as something else, or not at all. */
function registration(file: string): 'same' | 'other' | 'none' {
  let config: unknown;
  try {
    config = JSON.parse(unbom(readFileSync(file, 'utf8')));
  } catch {
    /* NO FILE, OR ONE CLAUDE CODE WILL REFUSE TOO: `claude mcp add-json` is the one that says what is wrong with it. */
    return 'none';
  }
  const servers: Record<string, unknown> = isObject(config) && isObject(config.mcpServers) ? config.mcpServers : {};
  if (!Object.hasOwn(servers, 'braindog')) return 'none';
  /* THE TYPE IS OPTIONAL IN CLAUDE CODE'S FILE, where a stdio entry may leave it out, and an empty `env` is what
     `claude mcp add` was measured writing beside the entry (`install.ts`, `handRun`), so neither makes a registration
     differ. */
  return sameServer(servers.braindog, { ...BRAINDOG_SERVER, args: [...BRAINDOG_SERVER.args] }) ? 'same' : 'other';
}

/**
 * What step 3 found or did in one profile: BrainDog's server `same` as this command's, one that `would` be registered
 * in a dry run, registered (`added`, with the copy of the servers file kept first), or not, for want of that copy
 * (`no-copy`) or because `claude` failed or is missing (`failed`, its exit code, -1 for missing).
 */
export type Registered =
  | { did: 'same' }
  | { did: 'would'; replaces: boolean }
  | { did: 'no-copy' }
  | { did: 'failed'; code: number; what: string }
  | { did: 'added'; replaced: boolean; kept: string | null };

/**
 * Step 3 for one profile, which `env apply` runs too: its servers file read for `braindog`, and when that is not this
 * command's server, a copy of the file kept and `claude mcp add-json` run in that profile, after `claude mcp remove`
 * for another entry of the name. `copied` holds the files copied this run, so each is copied once.
 */
export async function registerServer(dir: string, o: { home: string; env: Env; cwd: string; dryRun: boolean; copied: Set<string>; run: ProfileRunner }): Promise<Registered> {
  const file = serversFileOf(dir, o.home);
  const now = registration(file);
  if (now === 'same') return { did: 'same' };
  if (o.dryRun) return { did: 'would', replaces: now === 'other' };
  /*
   * A COPY BEFORE `claude` CHANGES THE FILE, since it writes the file itself and install's writer
   * never sees it. Once per file a run, so a profile reached twice is copied once, before its first change.
   */
  let kept: string | null = null;
  if (!o.copied.has(file)) {
    try {
      kept = keepCopy(file);
    } catch {
      return { did: 'no-copy' };
    }
    o.copied.add(file);
  }
  const env = envFor(dir, o.home, o.env);
  if (now === 'other') {
    const removed = await o.run(['mcp', 'remove', 'braindog', '--scope', 'user'], o.cwd, env);
    if (removed !== 0) return { did: 'failed', code: removed, what: 'remove did not remove the braindog entry there' };
  }
  const added = await o.run(['mcp', 'add-json', 'braindog', JSON.stringify(BRAINDOG_SERVER), '--scope', 'user'], o.cwd, env);
  if (added !== 0) return { did: 'failed', code: added, what: 'add-json did not register braindog' };
  return { did: 'added', replaced: now === 'other', kept };
}

/** An app's own person-wide entry of this name, as its reader reads it: the last place that writes at user scope wins. */
export function heldIn(client: Client, name: string, io: { home: string; cwd: string }): unknown {
  let held: unknown;
  for (const set of client.servers(io.home, null, io.cwd)) if (set.writes === 'user' && isObject(set.servers) && Object.hasOwn(set.servers, name)) held = set.servers[name];
  return held;
}

/** One of the record's tools, read whole once, for the other apps' writes and the closing lines. */
type ToolRow = { name: string; scope: 'global' | 'project'; fields: Record<string, unknown> };

const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The record's tools of the kind every app runs, each read whole. A row that does not read is left out. */
async function toolRows(conn: Connected): Promise<ToolRow[]> {
  const reg = conn.context.registers.find((r) => r.id === 'tools');
  if (!reg) return [];
  const rows: ToolRow[] = [];
  for (const row of [...reg.rows, ...reg.inherited]) {
    if (row.kind !== undefined && row.kind !== 'mcp') continue;
    const name = typeof row.name === 'string' ? row.name : '';
    if (!TOOL_NAME.test(name)) continue;
    const got = valueOf(await conn.client.get('tools', Number(row.spoken.slice(row.spoken.indexOf('#') + 1))));
    if (isObject(got) && isObject(got.fields)) rows.push({ name, scope: row.scope === 'global' ? 'global' : 'project', fields: got.fields });
  }
  return rows;
}

/** Whether a tool is handed a key from the Keychain when it starts: a `needs` entry naming a credential. */
const needsKey = (fields: Record<string, unknown>): boolean =>
  Array.isArray(fields.needs) && fields.needs.some((n) => typeof n === 'string' && /=credentials#\d+$/u.test(n));

/**
 * THE CLAUDE CODE PLUGIN, OFFERED IN ONE LINE (`plugins/claude-code`, listed by the repository's
 * `.claude-plugin/marketplace.json`): the same MCP server by its address with sign-in, the session's start and end
 * hooks calling this command, and the BrainDog skill, for a machine or a profile set up from inside Claude Code
 * rather than by this command. Said, never run: a plugin is the person's to add.
 */
export const PLUGIN_LINE =
  'Claude Code also takes BrainDog as a plugin, for a profile this command did not set up: /plugin marketplace add actuallyhoss/BrainDog, then /plugin install braindog@braindog.';

/**
 * WHETHER THE REPOSITORY IS PUBLIC, and so whether `PLUGIN_LINE` is said at all: until it is, the marketplace it names
 * answers anyone but its owner with a 404, and the line sent people to a page they could not open. The site's launch flag
 * for the same fact is `LAUNCH.repo` (`apps/site/src/lib/launch.ts`); this command is published on its own and cannot
 * read the site, so `test/setup.test.ts` holds the two equal, and the owner's word flips both.
 */
export const REPO_PUBLIC = false;

/** Names as a sentence says them: `A`, `A and B`, `A, B and C`. */
const listOf = (names: string[]): string => (names.length < 2 ? (names[0] ?? 'no app') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`);

/** The closing lines: what setup leaves, each with the exact command that does it. */
function whatIsLeft(rows: ToolRow[], conn: Connected, key: string, io: SetupIo): string[] {
  const lines: string[] = [];
  const own = conn.top === null ? 0 : rows.filter((r) => r.scope === 'project').length;
  if (own > 0) lines.push(`This repository has ${String(own)} ${own === 1 ? 'tool' : 'tools'} of its own. Write ${own === 1 ? 'it' : 'them'} with braindog tools write --scope project.`);
  const keyed = rows.filter((r) => (r.scope === 'global' || conn.top !== null) && needsKey(r.fields)).length;
  /* THE PROJECT HERE, or `*` for the keys of no project, as `login --keychain` takes it; a grant held and unexpired is no line. */
  const scope = conn.context.project?.spoken ?? '*';
  let granted = false;
  try {
    const grant = readHosts(hostsPath(io.env)).hosts[key]?.vault?.[scope];
    granted = grant !== undefined && Date.parse(grant.expires) > Date.now();
  } catch {
    /* A hosts file that does not read holds no grant, and the line stays. */
  }
  if (keyed > 0 && !granted)
    lines.push(
      keyed === 1
        ? `1 tool needs a key. Approve this machine for it with braindog login ${key} --keychain ${scope}.`
        : `${String(keyed)} tools need keys. Approve this machine for them with braindog login ${key} --keychain ${scope}.`,
    );
  return lines;
}

/**
 * A step's number on its first line only (D23): the lines after it for the same step, one per app or profile, start
 * with as many spaces instead, so a dry run reads 3. once and not five times. Any other line goes out as it is.
 */
export function stepsOnce(out: (line: string) => void): (line: string) => void {
  let last: string | null = null;
  return (line) => {
    const m = /^(\d+[a-z]?)\. /u.exec(line);
    if (m === null) return out(line);
    if (m[1] === last) return out(`${' '.repeat(m[0].length)}${line.slice(m[0].length)}`);
    last = m[1]!;
    out(line);
  };
}

/** `braindog setup <url> [--dry-run | --yes] [--only <app>] [--profile <folder>]`, and the exit code: the first failing step's, or 0. */
export async function setup(args: string[], given: SetupIo): Promise<number> {
  const io: SetupIo = { ...given, out: stepsOnce(given.out) };
  let parsed: { values: { 'dry-run'?: boolean | undefined; yes?: boolean | undefined; statusline?: boolean | undefined; only?: string[] | undefined; profile?: string[] | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' }, statusline: { type: 'boolean' }, only: { type: 'string', multiple: true }, profile: { type: 'string', multiple: true } },
    });
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token pasted in the wrong place. */
    io.say(USAGE);
    return 1;
  }
  const [url, ...more] = parsed.positionals;
  if (url === undefined || more.length > 0 || url.startsWith('-')) {
    io.say(USAGE);
    return 1;
  }
  let key: string;
  try {
    key = hostKey(url);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
    return 1;
  }
  /* THE APPS: each one `--only` names (a comma list or the flag again), else every one in the table. */
  const table = CLIENTS;
  const only = (parsed.values.only ?? []).flatMap((o) => o.split(',')).map((o) => o.trim()).filter((o) => o !== '');
  const unknown = only.filter((id) => !table.some((c) => c.id === id));
  if (unknown.length > 0) {
    io.say(`braindog setup --only takes ${table.map((c) => c.id).join(', ')}, and not ${unknown.join(', ')}.`);
    return 1;
  }
  const named = only.length > 0;
  const apps = table.filter((c) => !named || only.includes(c.id));
  const here = apps.filter((c) => c.found(io.home, io.env));
  const claude = here.find((c) => c.id === 'claude');
  const others = here.filter((c) => c.id !== 'claude');
  const dryRun = parsed.values['dry-run'] === true;
  /* THE FILES COPIED ASIDE THIS RUN, shared by every write, so each file is copied once, before its first change. */
  const copied = new Set<string>();
  const file = hostsPath(io.env);
  const detail = (lines: string[]) => {
    for (const line of lines) io.out(`   ${line}`);
  };
  /* WHETHER ANY STEP CHANGED ANYTHING, so the last line can say a second run changed nothing, and never says so wrongly. */
  let changed = false;
  /*
   * CTRL+C IS HONOURED BETWEEN STEPS, NOT ONLY IN THE FIRST. `main.ts` takes SIGINT so the wait for six digits ends
   * with a sentence, which also means the process no longer ends on it; without this check a Ctrl+C pressed during a
   * later step was swallowed and every step after it still ran. A step already started is left to finish.
   */
  const stoppedBefore = (step: number): boolean => {
    if (!io.signal?.aborted) return false;
    io.out(`Setup was stopped before step ${String(step)}, and the steps before it are kept as they are.`);
    return true;
  };

  /* ── 1. sign in ──────────────────────────────────────────────────────── */
  const held = loginHeld(key, io.env, file);
  /* BRAINDOG_TOKEN IS NO LOGIN HELD BY THIS MACHINE, and was said as one: with the self-host's server key there, the
     hosts file stayed empty and the step said a login was held. It is said as what it is, and the host still becomes the
     default, since the MCP server and the hooks name none and may not see the variable. */
  const fromEnv = held && Boolean(io.env.BRAINDOG_TOKEN);
  if (held) {
    const moves = fromEnv ? defaultNot(key, file) : defaultElsewhere(key, file);
    if (moves && !dryRun) {
      try {
        const hosts = readHosts(file);
        hosts.default = key;
        saveHosts(file, hosts);
      } catch (e) {
        io.say(e instanceof Error ? e.message : `${file} could not be written.`);
        io.out('1. Sign-in: a login is held, and the hosts file could not be changed to reach this host by default, so setup stopped there.');
        return 1;
      }
      changed = true;
    }
    const reach = moves ? `, and ${key} ${dryRun ? 'would become' : 'is now'} the host the MCP server and the hooks reach` : '';
    io.out(fromEnv ? `1. Sign-in: BRAINDOG_TOKEN is set, so no login was asked for${reach}.` : `1. Sign-in: this machine already holds a login to ${key}, so none was asked for${reach}.`);
  } else if (dryRun) {
    io.out(`1. Sign-in: this machine holds no login to ${key}, so setup would ask for one, with six digits to approve in the app.`);
  } else {
    /* THE SIX DIGITS GO TO STDERR, as `login` always sends them, so standard output keeps one line per step. */
    const code = await (io.signIn ?? login)(url, { file, say: io.say, signal: io.signal });
    if (code !== 0) {
      io.out('1. Sign-in did not finish, so setup stopped there and changed nothing else.');
      return code;
    }
    changed = true;
    io.out(`1. Sign-in: this machine is signed in to ${key}.`);
  }

  /* ── 2. the hooks, as `install --apply` writes them into every profile ── */
  if (stoppedBefore(2)) return 1;
  const { list: profiles, gone, kept: keptBefore } = claude ? profilesFor(parsed.values.profile ?? [], io) : { list: [], gone: [], kept: [] };
  /* WHY CLAUDE CODE IS LEFT, when it is: --only left it out, or it is not here. Its hooks and skills are its own. */
  const noClaude = named && !only.includes('claude') ? '--only leaves Claude Code out' : 'Claude Code is not on this machine';
  if (!claude) io.out(`2. Hooks: ${noClaude}, so no hooks were placed.`);
  if (!claude && (parsed.values.profile ?? []).length > 0) io.out(`   --profile names a Claude Code profile, and ${noClaude}, so it was not used.`);
  for (const dir of gone) io.out(`   The profile ${nameOf(dir, io.home)} was set up before and is no longer on this machine, so it is left out.`);
  if (claude)
    try {
    /*
     * PLANNED DRY FIRST, WHICH WRITES NOTHING, so a run with nothing to add is said as one and applies nothing. Each
     * entry it would add is its own `  + hooks.` line, and an older BrainDog entry it would rewrite its own `  ~ hooks.`
     * line. Its dry run's closing line names `install --apply` as the way to write it, which is not this command's way,
     * so it is left out.
     *
     * AND THE PLAN IS SHOWN BEFORE ANYTHING IS WRITTEN (his "Hooks install shows changes first"). It was
     * applied first and shown after, so the first a person saw of a hook in every session was the line saying it was
     * already there. On a terminal the step asks; `--yes` is the answer given ahead; off a terminal with no `--yes` it
     * stops after the plan and says how to go on, because a yes nobody typed is not one.
     */
    const planned = installProfiles(profiles, [], { apply: false, scripts: io.scripts, home: io.home }).lines;
    const pending = planned.some((line) => line.startsWith('  + hooks.') || line.startsWith('  ~ hooks.') || line.startsWith(PLACES_SKILL));
    const rest = (lines: string[]) => lines.filter((line) => !line.startsWith('Nothing was changed.') && !line.includes(HOOKS_HELD));
    if (!pending) {
      io.out("2. Hooks: Claude Code's settings already run the BrainDog hooks and Agent Skill.");
      detail(rest(planned));
    } else if (dryRun) {
      io.out("2. Hooks: the BrainDog hooks and Agent Skill would be added to Claude Code's settings, with a copy of the file kept first.");
      detail(rest(planned));
    } else {
      io.out("2. Hooks: these changes to Claude Code's settings come next, with a copy of each file kept first:");
      detail(rest(planned));
      const yes = parsed.values.yes === true || (await (io.ask ?? ((q: string) => askTerminal(q, io.signal)))('Write these changes? [y/N] '));
      if (yes === null) {
        io.out(`   Nothing was written, because no one is at a terminal to say yes. Run braindog setup ${key} --yes to write them.`);
        return 1;
      }
      if (!yes) {
        io.out(`   Nothing was written to Claude Code's settings, so setup stopped there. Run braindog setup ${key} again to be asked again.`);
        return 1;
      }
      const applied = installProfiles(profiles, [], { apply: true, scripts: io.scripts, home: io.home }).lines;
      changed = true;
      io.out("   Written: the BrainDog hooks and Agent Skill are in Claude Code's settings.");
      detail(rest(applied).filter((line) => !line.startsWith('  ') && !line.endsWith(':')));
    }
  } catch (e) {
    /* `install`'s own sentence, which names the file, says what became of it, and never quotes what is in it. */
    io.say(e instanceof Error ? e.message : String(e));
    io.out("2. Hooks: Claude Code's settings could not be changed, so setup stopped there.");
    return 1;
  }
  /*
   * AND CODEX'S, WHEN IT IS HERE (`clients/codex-hooks.ts`): its turn end, `notify`, in a marked block of its
   * config.toml, and BrainDog's block in its AGENTS.md. Shown first and asked, as Claude Code's are, since the turn end
   * runs a program in every Codex session; `--yes` answers ahead.
   */
  if (here.some((c) => c.id === 'codex')) {
    const plan = planCodexHooks({ home: io.home, env: io.env, scripts: io.scripts });
    if (plan.writes.length === 0) {
      io.out(plan.left.length === 0 ? "2. Hooks, Codex: its config already runs BrainDog's turn end, and its AGENTS.md holds BrainDog's block." : '2. Hooks, Codex: nothing was added, and this is why:');
      detail(plan.left);
    } else if (dryRun) {
      io.out("2. Hooks, Codex: BrainDog's turn end and its block in AGENTS.md would be added, with a copy of each file kept first:");
      detail([...plan.lines, ...plan.left]);
    } else {
      io.out("2. Hooks, Codex: these changes to Codex's files come next, with a copy of each file kept first:");
      detail([...plan.lines, ...plan.left]);
      const yes = parsed.values.yes === true || (await (io.ask ?? ((q: string) => askTerminal(q, io.signal)))('Write these changes? [y/N] '));
      if (yes === null) {
        io.out(`   Nothing was written, because no one is at a terminal to say yes. Run braindog setup ${key} --yes to write them.`);
        return 1;
      }
      if (!yes) {
        io.out(`   Nothing was written to Codex's files, so setup stopped there. Run braindog setup ${key} again to be asked again.`);
        return 1;
      }
      const done = applyCodexHooks(plan, copied);
      if (!done.written) {
        io.out("   Codex's files could not all be written, so setup stopped there:");
        detail(done.lines);
        return 1;
      }
      changed = true;
      io.out("   Written: BrainDog's turn end is in Codex's config.toml, and its block in Codex's AGENTS.md.");
      detail(done.lines);
    }
  }

  /* ── 2b. the status line, only in a profile that has none of its own ─── */
  if (claude && parsed.values.statusline === true) {
    const bare = profiles.filter((dir) => statusLineIn(dir) === 'none');
    if (bare.length > 0 && !dryRun) {
      io.out(`2b. Status line: braindog statusline shows the model, the folder and the limits, and runs on every draw. It would be set in ${bare.map((dir) => nameOf(dir, io.home)).join(', ')}, with a copy of each settings file kept first, and a status line of your own is never touched.`);
      const pinFile = pinsFile(io.home);
      const pins = readPins(pinFile);
      const sha = pinOf('statusline', 'statusline', statusLineEntry(io.scripts));
      const yes = pins?.[sha] !== undefined || parsed.values.yes === true || (await (io.ask ?? ((q: string) => askTerminal(q, io.signal)))('Set it? [y/N] '));
      if (yes === true && pins !== null) {
        for (const dir of bare) {
          try {
            placeStatusLine(dir, io.scripts);
            keepPin(pinFile, sha, { name: 'statusline', kind: 'statusline', profile: nameOf(dir, io.home), now: Date.now() });
            changed = true;
            io.out(`   Written: ${nameOf(dir, io.home)} now draws braindog statusline.`);
          } catch (e) {
            io.say(e instanceof Error ? e.message : String(e));
          }
        }
      } else io.out('   Left as it is.');
    } else if (bare.length > 0) io.out(`2b. Status line: braindog statusline would be set in ${bare.map((dir) => nameOf(dir, io.home)).join(', ')}.`);
  }

  /* ── 3. the MCP server, in every profile and every other app ─────────── */
  if (stoppedBefore(3)) return 1;
  const entry = JSON.stringify(BRAINDOG_SERVER);
  const run = io.claude ?? runIn;
  for (const dir of profiles) {
    const where = `Claude Code in ${nameOf(dir, io.home)}`;
    const done = await registerServer(dir, { home: io.home, env: io.env, cwd: io.cwd, dryRun, copied, run });
    if (done.did === 'same') {
      io.out(`3. MCP server, ${where}: braindog is already registered, running this command.`);
      continue;
    }
    if (done.did === 'would') {
      io.out(
        `3. MCP server, ${where}: braindog would be registered at user scope${done.replaces ? ' in place of the braindog entry there, which runs something else' : ''}, with a copy of its servers file kept first: ${entry}`,
      );
      continue;
    }
    if (done.did === 'no-copy') {
      io.out(`3. MCP server, ${where}: a copy of its servers file could not be kept first, so nothing was registered there and setup stopped.`);
      return 1;
    }
    if (done.did === 'failed') {
      io.out(
        done.code === -1
          ? `3. MCP server, ${where}: claude was not found, so setup stopped there. Install Claude Code, then run setup again.`
          : `3. MCP server, ${where}: claude mcp ${done.what} (exit ${String(done.code)}), so setup stopped there.`,
      );
      return 1;
    }
    changed = true;
    io.out(`3. MCP server, ${where}: braindog ${done.replaced ? 'replaced the entry there and is' : 'is'} registered, running this command.`);
    if (done.kept !== null) detail([`The servers file as it was is kept at ${done.kept}.`]);
  }
  /* KEPT FOR THE NEXT RUN, every profile this one reached, once a run that writes has reached them all. */
  if (!dryRun && claude && profiles.join('\n') !== keptBefore.join('\n')) {
    try {
      mkdirSync(join(io.home, '.braindog'), { recursive: true });
      writeFileSync(profilesFile(io.home), `${JSON.stringify({ profiles }, null, 2)}\n`);
    } catch {
      io.say(`${profilesFile(io.home)} could not be written, so the next run reaches these profiles only when they are named again.`);
    }
  }
  for (const c of others) {
    /* THE APP'S OWN WORD FOR BRAINDOG'S ENTRY when its module gives one (`server`), else this command with its name. */
    const own = (c as { server?: unknown }).server;
    const want = isObject(own) ? own : serverFor(c.id);
    const held = heldIn(c, 'braindog', io);
    if (sameServer(held, want)) {
      io.out(`3. MCP server, ${c.title}: braindog is already registered, running this command.`);
      continue;
    }
    const plan = c.plan({ name: 'braindog', scope: 'user', entry: want, replace: held !== undefined, home: io.home, top: null, cwd: io.cwd });
    if (dryRun) {
      io.out(`3. MCP server, ${c.title}: braindog would be registered${held !== undefined ? ' in place of the braindog entry there, which runs something else' : ''}, with a copy of the file kept first:`);
      detail(plan.lines);
      continue;
    }
    /* ITS OWN PROGRAM IS NOT RUN BY SETUP: an app whose writer needs one says so, and the run stops on its line. */
    const applied = await c.apply(plan, { run: async () => -1, copied });
    if (!applied.written) {
      io.out(`3. MCP server, ${c.title}: braindog was not registered, so setup stopped there.`);
      detail(applied.lines);
      return 1;
    }
    changed = true;
    /* A FILE THIS RUN MADE OR COPIED NEEDS NO COPY AGAIN: a later write's copy would be of BrainDog's own text. */
    if (plan.file !== null) copied.add(plan.file);
    io.out(`3. MCP server, ${c.title}: braindog ${held !== undefined ? 'replaced the entry there and is' : 'is'} registered, running this command.`);
    detail(applied.lines);
  }

  /* THE APPS NOT HERE, IN ONE LINE AFTER THE ONES THAT ARE, so the step opens on what it did. */
  const absent = apps.filter((app) => !here.includes(app));
  if (absent.length > 0) io.out(`3. MCP server, ${listOf(absent.map((c) => c.title))}: not on this machine, so setup leaves ${absent.length === 1 ? 'it' : 'them'}.`);

  /* ── 4 and 5. what the record holds for every machine ────────────────── */
  if (!held && dryRun) {
    io.out('4. Tools: not read, because this machine holds no login yet to read your BrainDog with.');
    io.out('5. Skills: not read, for the same reason.');
    io.out(`6. Tokens: a token of its own would be made for each agent wired here, ${listOf([...new Set(here.map((c) => AGENT_TITLE[agentKindOf(c.id)] ?? c.title))])}, once signed in.`);
    io.out('That was a dry run, so nothing was signed in, written or registered.');
    return 0;
  }

  /* ONE CONNECTION PER STEP, so each has the whole of its own deadline (`connect`), and `top` is left out of both
     writes, so neither reads or writes anything at project scope. The repository it found is only counted, below. */
  if (stoppedBefore(4)) return 1;
  const tools = await connect(key, io);
  if (typeof tools === 'number') {
    io.out('4. Tools: your BrainDog could not be read, so setup stopped there.');
    return tools;
  }
  let rows: ToolRow[] = [];
  if (!tools.context.registers.some((r) => r.id === 'tools')) io.out('4. Tools: this BrainDog has no Tools list, so there is nothing to write.');
  else {
    /*
     * EVERY APP THROUGH `writeTools`, which reads each through the table and writes only what differs, leaves an entry
     * changed by hand, and leaves out a tool whose program is not here or names another system, one line each. Its
     * own program is run for Claude Code alone: no other app's writer here needs one.
     */
    for (const c of here) {
      const lines = await writeTools({
        client: tools.client,
        context: tools.context,
        top: null,
        cwd: io.cwd,
        home: io.home,
        scope: 'user',
        dryRun,
        cli: io.cli,
        /* IN THE DEFAULT PROFILE, the one whose `~/.claude.json` Claude Code's reader reads, so what is written is what is read back. */
        claude: c === claude ? (argv, cwd) => run(argv, cwd, profileEnv(join(io.home, '.claude'), io)) : async () => -1,
        app: c.id,
        env: io.env,
        /* STEP 3'S SET, so a file it made or copied (Codex's config.toml) gets no copy of BrainDog's own text here. */
        copied,
      });
      const shown = lines.filter((line) => !line.startsWith('Nothing was changed.'));
      /* A LINE SAYING A TOOL WENT IN IS A CHANGE; one saying a tool was left out or left as it is, is not. */
      const wrote = !dryRun && shown.some((line) => /^Tool \S+ (?:added|replaced)\b/u.test(line));
      if (wrote) changed = true;
      io.out(
        shown.length === 0
          ? `4. Tools, ${c.title}: every tool your BrainDog applies everywhere is already there.`
          : dryRun
            ? `4. Tools, ${c.title}: what would be written at user scope, from the tools your BrainDog applies everywhere:`
            : wrote
              ? `4. Tools, ${c.title}: the tools your BrainDog applies everywhere, written at user scope:`
              : `4. Tools, ${c.title}: nothing new was written, and this is why:`,
      );
      detail(shown);
    }
    rows = await toolRows(tools);
  }

  /* SKILLS GO INTO EVERY PROFILE, one line each: each folder's files are their own entries in the skills lock. */
  if (stoppedBefore(5)) return 1;
  const skills = await connect(key, io);
  if (typeof skills === 'number') {
    io.out('5. Skills: your BrainDog could not be read, so setup stopped there.');
    return skills;
  }
  if (!skills.context.registers.some((r) => r.id === 'skills')) io.out('5. Skills: this BrainDog has no Skills list, so there is nothing to sync.');
  else if (profiles.length === 0) io.out(`5. Skills: ${noClaude}, so no skill was synced.`);
  else
    for (const dir of profiles) {
      const where = nameOf(dir, io.home);
      const lines = await syncSkills({ client: skills.client, context: skills.context, home: io.home, configDir: dir, top: null, dryRun, to: skills.to });
      if (lines.length > 0) changed = true;
      io.out(lines.length === 0 ? `5. Skills, Claude Code in ${where}: it already holds every skill as your BrainDog has it.` : `5. Skills, Claude Code in ${where}: ${dryRun ? 'what would be synced' : 'synced'}:`);
      detail(lines);
    }

  /* ── 6. one token for each agent wired ───────────────────────────────── */
  if (stoppedBefore(6)) return 1;
  const tokens = await agentTokens(here, key, file, dryRun, io);
  if (tokens.changed) changed = true;

  /* WHAT IS LEFT, IN THE WORDS TO TYPE, before the closing line, so the last thing read is whether anything changed. */
  for (const line of whatIsLeft(rows, tools, key, io)) io.out(line);
  if (claude && REPO_PUBLIC) io.out(PLUGIN_LINE);
  if (dryRun) io.out('That was a dry run, so nothing was signed in, written, registered or proposed.');
  else if (!changed) io.out(`Nothing changed: this machine was already set up from ${key}.`);
  else io.out(`This machine is set up from ${key}. Every session started from now on in ${listOf(here.map((c) => c.title))} has it.`);
  return tokens.failed ? 1 : 0;
}

/* ── one token per agent (agents and MCP plan §5.1, §10.5) ─────────────── */

/** The kind of agent each app's server says it is (`--agent`), which a settings row matches and a token is made for. */
export const agentKindOf = (app: string): string => (app === 'claude' || app === 'codex' || app === 'cursor' ? app : 'other');

/** What a token's label calls the agent, after the machine's name: "MacBook · Claude Code". */
const AGENT_TITLE: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', other: 'other apps' };

/** How long an agent's token lasts, as the machine's login does. */
export const AGENT_TOKEN_DAYS = 90;

/** One agent's token made: the bearer, kept in the hosts file and never printed, or the sentence saying why there is none. */
export type MintAgent = (key: string, label: string, io: SetupIo) => Promise<Held | string>;

/**
 * What `mintAgent` answers when `BRAINDOG_TOKEN` was refused the mint: it holds a token, not an owner's key, so nothing
 * is made and nothing is asked (a token sent first would be sent before the agent's own in any case).
 */
export const NOT_AN_OWNER_KEY = 'BRAINDOG_TOKEN holds a token rather than the server key';

/** One `createToken` with this bearer: the token made, or the refusal's code and sentence, or `null` for no answer. */
async function createWith(key: string, bearer: string, label: string, signal: AbortSignal | undefined): Promise<Held | { code: string; fix: string } | null> {
  let res: Response;
  try {
    /* A REDIRECT IS REFUSED, not followed, for `clientFor`'s reason, and the error is never quoted: it could hold the bearer. */
    res = await fetch(`${new URL(key).origin}/api/createToken`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ scope: 'write', label, days: AGENT_TOKEN_DAYS }),
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  const said = (await res.json().catch(() => null)) as { ok?: unknown; value?: { bearer?: unknown; expires_at?: unknown }; refusal?: { code?: unknown; fix?: unknown } } | null;
  if (said?.ok === true && typeof said.value?.bearer === 'string' && typeof said.value.expires_at === 'string') return { value: said.value.bearer, expires: said.value.expires_at, label };
  return { code: typeof said?.refusal?.code === 'string' ? said.refusal.code : '', fix: typeof said?.refusal?.fix === 'string' ? said.refusal.fix : `${key} answered in a way this command does not recognise` };
}

/**
 * The real mint, for a `write` token with the agent's label for ninety days. His settings row for the agent narrows it
 * from there, and only he changes that row, in the app.
 *
 * WITH `BRAINDOG_TOKEN` SET, FROM IT AND WITH NO APPROVAL, as `token create` mints (D4): a self-host's server key is the
 * owner, so the record makes the token, which keeps `from`, the key's print, for `target` to send it while that key is
 * set. A token there is refused the mint (`NOT_AN_OWNER_KEY`). Otherwise the owner approves one `createToken` in the app
 * with six digits (`approveOperation`, the `token` reach, spent on its first use).
 */
export const mintAgent: MintAgent = async (key, label, io) => {
  const sent = io.env.BRAINDOG_TOKEN || undefined;
  if (sent !== undefined) {
    const made = await createWith(key, sent, label, io.signal);
    if (made === null) return `${key} did not answer`;
    return 'value' in made ? { ...made, from: keyPrint(sent) } : NOT_AN_OWNER_KEY;
  }
  const grant = await approveOperation(key, 'token', { say: io.say, signal: io.signal, label });
  if (typeof grant === 'number') return 'the approval in the app did not finish';
  const made = await createWith(key, grant.bearer, label, io.signal);
  if (made === null) return `${key} did not answer`;
  return 'value' in made ? made : made.fix;
};

/**
 * An agent's token for `braindog mcp` started under `BRAINDOG_TOKEN` (D4): the one kept for this agent and this key when
 * it is live, else one made from the key and kept, or `null` when the key is a token or the host did not answer, and
 * the server then sends the key as it always did. One request at most, and only while no token is kept.
 */
export async function agentTokenFromKey(key: string, agent: string, file: string, io: { env: Record<string, string | undefined>; signal?: AbortSignal | undefined }): Promise<string | null> {
  const sent = io.env.BRAINDOG_TOKEN || undefined;
  if (sent === undefined) return null;
  const kind = agentKindOf(agent);
  const keptNow = (): string | null => {
    try {
      const own = Object.entries(readHosts(file).hosts).find(([written]) => sameHost(written, key))?.[1]?.agents?.[kind];
      return own !== undefined && own.from === keyPrint(sent) && Date.parse(own.expires) > Date.now() + 86_400_000 ? own.value : null;
    } catch {
      return null;
    }
  };
  const kept = keptNow();
  if (kept !== null) return kept;
  const made = await createWith(key, sent, `${await machineName()} · ${AGENT_TITLE[kind] ?? kind}`, io.signal);
  if (made === null || !('value' in made)) return null;
  /* ANOTHER SESSION MAY HAVE KEPT ONE MEANWHILE: theirs is kept, and this one is sent this once. */
  if (keptNow() !== null) return made.value;
  try {
    keepAgent(file, key, kind, { ...made, from: keyPrint(sent) });
  } catch {
    /* Not kept, so the next start makes another; this session still has its own. */
  }
  return made.value;
}

/** An agent's own token, kept under its host beside the login, read again just before the write as `keepRunner` does. */
function keepAgent(file: string, key: string, agent: string, held: Held): void {
  const hosts = readHosts(file);
  const entry = hosts.hosts[key] ?? {};
  hosts.hosts[key] = { ...entry, agents: { ...(entry.agents ?? {}), [agent]: held } };
  saveHosts(file, hosts);
}

/**
 * Step 6: a token of its own for each kind of agent this run wired that has none live, each approved in the app, so a
 * settings row can bind to it and an agent is told apart by its key rather than by what it says it is. The hooks, the
 * MCP server and the commands its shell runs send it (`target` in `http.ts`). Under `BRAINDOG_TOKEN` each is made from
 * that key with no approval when it is a self-host's server key, and none when it is a token, which every command sends
 * before any agent's own. Nothing is made on a dry run. The machine's own login is left as it is: rotating it is his to
 * do in Settings.
 */
export async function agentTokens(apps: Client[], key: string, file: string, dryRun: boolean, io: SetupIo): Promise<{ changed: boolean; failed: boolean }> {
  const kinds = [...new Set(apps.map((c) => agentKindOf(c.id)))];
  const titles = (list: string[]) => listOf(list.map((k) => AGENT_TITLE[k] ?? k));
  if (kinds.length === 0) {
    io.out('6. Tokens: no agent was wired here, so no token was made.');
    return { changed: false, failed: false };
  }
  /* UNDER BRAINDOG_TOKEN, ONLY A TOKEN MADE FROM THAT KEY COUNTS (`target` sends no other while it is set). */
  const sent = io.env.BRAINDOG_TOKEN || undefined;
  let held: Record<string, Held> = {};
  try {
    held = Object.entries(readHosts(file).hosts).find(([written]) => sameHost(written, key))?.[1]?.agents ?? {};
  } catch {
    /* A hosts file that does not read holds no token; making one below says what is wrong with it. */
  }
  /* LIVE FOR A WEEK MORE, so a token about to lapse is made again now rather than mid-session. */
  const live = (k: string) =>
    typeof held[k]?.value === 'string' && Date.parse(String(held[k]?.expires)) > Date.now() + 7 * 86_400_000 && (sent === undefined || held[k]?.from === keyPrint(sent));
  const owed = kinds.filter((k) => !live(k));
  if (owed.length === 0) {
    io.out(`6. Tokens: ${titles(kinds)} already ${kinds.length === 1 ? 'has a token' : 'have a token each'} of ${kinds.length === 1 ? 'its' : 'their'} own.`);
    return { changed: false, failed: false };
  }
  if (dryRun) {
    io.out(
      sent === undefined
        ? `6. Tokens: a token of its own would be made for ${titles(owed)}, each approved in the app with six digits.`
        : `6. Tokens: BRAINDOG_TOKEN is set. When it is the self-host's server key, a token of its own would be made from it for ${titles(owed)}; when it is a token, none would be.`,
    );
    return { changed: false, failed: false };
  }
  const device = await machineName();
  let changed = false;
  let failed = false;
  for (const kind of owed) {
    const title = AGENT_TITLE[kind] ?? kind;
    const label = `${device} · ${title}`;
    const made = await (io.mint ?? mintAgent)(key, label, io);
    /* A TOKEN IN BRAINDOG_TOKEN IS SENT BEFORE ANY AGENT'S OWN, so none is made, and that is no failure. */
    if (made === NOT_AN_OWNER_KEY) {
      io.out(`6. Tokens: ${NOT_AN_OWNER_KEY}, and every command sends it before an agent's own, so no token was made for each agent.`);
      return { changed, failed };
    }
    if (typeof made === 'string') {
      failed = true;
      io.out(`6. Tokens, ${title}: no token was made, so it keeps ${sent === undefined ? "this machine's login" : 'sending BRAINDOG_TOKEN'}: ${made.replace(/\.$/u, '')}.`);
      continue;
    }
    try {
      keepAgent(file, key, kind, made);
    } catch (e) {
      failed = true;
      io.say(e instanceof Error ? e.message : `${file} could not be written.`);
      io.out(`6. Tokens, ${title}: the token was made and could not be kept, so it is not used. Revoke ${label} in Settings.`);
      continue;
    }
    changed = true;
    io.out(`6. Tokens, ${title}: it has a token of its own, ${label}, until ${made.expires.slice(0, 10)}${sent === undefined ? '' : ', made from the key in BRAINDOG_TOKEN'}. Sessions started from now on use it.`);
  }
  return { changed, failed };
}

