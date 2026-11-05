/**
 * `braindog doctor [--replaced <replace.json>] [--under <folder>] [--config-dir <folder>] [--json]`: for every agent
 * app and profile on this machine, whether BrainDog is set up there; what still names a replaced tool; what holds
 * something shaped like a key; and which BrainDog server still runs a build older than the installed command.
 *
 * IT CHANGES NOTHING. `install --replace` takes the old tool out of the files it is pointed at, and nothing said
 * afterwards what was left: the one reading of a real machine was done by hand, once, three folders deep, for one
 * app. This reads the same places and more, and prints each by its file and its entry so a person can go to it.
 *
 * A PLAN AND A PRINTER. `planDoctor` reads files and is handed everything else (the home, the profiles, the crontab's
 * text, the apps of the clients table, the machine's processes and the installed command's time), so a test plants a
 * home and no real profile, schedule or process is read. `printDoctor` turns the plan into lines.
 * `doctor` reads the arguments and joins the two, and leaves the printing and the exit to `main.ts`.
 *
 * NO VALUE IS EVER PUT IN A PLACE. A place is a kind, a file and an entry's name, and the sentence beside it is
 * written here from fixed words. Nothing read from a command, an argument, a header or a line is copied into it, so
 * there is no shape of key the lines could let through.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { unbom } from './unbom.ts';
import { CLIENTS, clientOf, type Client } from './clients/index.ts';
import { BRAINDOG_SERVER, descriptionOf, holdsTokenShape, isOldServer, readReplace, serversFileOf, wordsOf, type Replace } from './install.ts';

type Env = Record<string, string | undefined>;

/**
 * `profile` is a profile lacking something of BrainDog's; `key` is an entry holding something shaped like one;
 * `process` is a BrainDog server still running a build older than the installed command.
 */
export type Kind = 'server' | 'hook' | 'skill' | 'schedule' | 'startup' | 'key' | 'profile' | 'process';
/**
 * One thing to go and fix: its file (or `crontab`), the entry's name in it, and one sentence of fixed words. For a
 * `process` the file is the app to restart, by its name, and the entry is the process's number, a handle beside it.
 */
export type Place = { kind: Kind; file: string; entry: string; says: string };
/** One profile: whether BrainDog's server is there and runs this command, and whether each of its two hooks is. */
export type Profile = { dir: string; server: 'this' | 'other' | 'none'; start: boolean; end: boolean };
/** One agent app found on this machine other than Claude Code (whose profiles say it): BrainDog's server there, and the old tool's. */
export type App = { app: string; server: 'this' | 'other' | 'none'; replaced: boolean; unread: boolean };
export type Report = { replaced: string | null; profiles: Profile[]; apps: App[]; places: Place[] };
/** One process of the machine, as `ps` lists it: its number, its parent's, when it started (ms) and its command. */
export type Proc = { pid: number; ppid: number; started: number; command: string };
/** The installed command: the file a server runs, and when it last changed (ms). */
export type Installed = { file: string; changed: number };
/**
 * Everything the plan is handed. `crontab` is what `crontab -l` printed, or null where there is none; `clients` the
 * apps to look in (the table, or a test's own); `processes` and `installed` what the old-server check compares.
 */
export type Seen = {
  home: string;
  profiles: string[];
  replace?: Replace | undefined;
  under?: string[];
  crontab?: string | null;
  clients?: readonly Client[];
  env?: Env;
  processes?: Proc[];
  installed?: Installed | null;
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A JSON object read, or null when the file is missing or is not one: a file doctor cannot read is no place. */
function readJson(file: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    return isObject(raw) ? raw : null;
  } catch {
    return null;
  }
}

const readText = (file: string): string | null => {
  try {
    return unbom(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export const isFolder = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Where ccenv keeps its profiles, `CCENV_HOME` or else `~/.ccenv`, one folder each under its `profiles`. */
export const ccenvHome = (home: string, env: Env): string => (env.CCENV_HOME ? resolve(env.CCENV_HOME) : join(home, '.ccenv'));

/* A folder as the file system finds it, links followed, so one profile reached two ways is read once. */
export const realOf = (dir: string): string => {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
};

/**
 * THE PROFILES TO READ: each `--config-dir`, else every one the home holds, `.claude` and each `.claude-<name>` with a
 * `settings.json` in it, each ccenv profile with one (`ccenvHome`), and `CLAUDE_CONFIG_DIR` when it is set. `install`
 * reads one profile unless told of more; doctor is asked what is left anywhere, so it looks for all of them. A folder
 * with no settings is no profile. EACH ONCE, BY THE FOLDER IT RESOLVES TO: ccenv sets `CLAUDE_CONFIG_DIR` to one of its
 * own profiles, and a link can name another.
 */
export function profilesIn(home: string, named: string[], env: Env): string[] {
  if (named.length > 0) return named.map((dir) => resolve(dir));
  const found = new Map<string, string>();
  const add = (dir: string) => {
    const real = realOf(dir);
    if (!found.has(real)) found.set(real, dir);
  };
  const withSettings = (folder: string, takes: (name: string) => boolean) => {
    let names: string[] = [];
    try {
      names = readdirSync(folder).sort();
    } catch {
      /* A folder that cannot be listed holds no profile doctor can read. */
    }
    for (const name of names) if (takes(name) && existsSync(join(folder, name, 'settings.json'))) add(join(folder, name));
  };
  withSettings(home, (name) => name === '.claude' || name.startsWith('.claude-'));
  withSettings(join(ccenvHome(home, env), 'profiles'), (name) => !name.startsWith('.'));
  if (env.CLAUDE_CONFIG_DIR) add(resolve(env.CLAUDE_CONFIG_DIR));
  return [...found.values()];
}

/* `looksLikeToken`, `wordsOf`, `isOldUrl` and `isOldServer` are `install.ts`'s own, so doctor names exactly the servers
   `install --replace` acts on and the two can never disagree about what an old server is. */

/**
 * A line of a schedule or a start-up file that names the old tool: one of its hook scripts, one of its programs, or
 * one of its hosts. The host is looked for as text, since such a line is a shell command and no URL to parse.
 */
const namesOld = (line: string, r: Replace): boolean =>
  r.hooks.some((re) => re.test(line)) || r.programs.some((re) => re.test(line)) || r.hosts.some((host) => line.toLowerCase().includes(host));

/**
 * A WORD THAT HOLDS SOMETHING SHAPED LIKE A KEY, asked of each piece between the marks a path, an assignment or a URL
 * puts around one. Wider than `install` asks, which hides every argument and so never has to tell: here the answer
 * decides whether an entry is listed, and a miss is a key left in a file that nobody is told of.
 */
const holdsToken = holdsTokenShape;

/** A name that says its value is a secret, for an `env` or `headers` entry whose value is too short to look like one. */
const SECRET_NAME = /token|secret|password|passwd|api[_-]?key|authorization|credential/i;
/** A value that points at a secret kept elsewhere, `${NAME}` or `$NAME` (after `Bearer`, as Codex's bearer variable reads), holds none itself. */
const isReference = (value: string): boolean => /^(?:Bearer\s+)?\$\{?[A-Za-z_]\w*\}?$/i.test(value.trim());

/** Where in a server entry something shaped like a key sits, in fixed words, or null when nothing is. */
function keyIn(server: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (wordsOf(server).some(holdsToken)) parts.push('its command or arguments');
  for (const [key, word] of [['env', 'its environment'], ['headers', 'its headers']] as const) {
    const held = server[key];
    if (isObject(held) && Object.entries(held).some(([name, value]) => typeof value === 'string' && value !== '' && !isReference(value) && (holdsToken(value) || SECRET_NAME.test(name)))) parts.push(word);
  }
  if (typeof server.url === 'string' && holdsToken(server.url.replace(/^[a-z]+:\/\/[^/?#]*/i, ''))) parts.push('its address');
  return parts.length > 0 ? parts.join(' and ') : null;
}

/** Every `mcpServers` object a config file holds, with the words that lead to it: its own, and each project's. */
function serverSets(config: Record<string, unknown>): { where: string; servers: Record<string, unknown> }[] {
  const sets: { where: string; servers: Record<string, unknown> }[] = [];
  if (isObject(config.mcpServers)) sets.push({ where: '', servers: config.mcpServers });
  if (isObject(config.projects))
    for (const [folder, project] of Object.entries(config.projects))
      if (isObject(project) && isObject(project.mcpServers)) sets.push({ where: `projects[${JSON.stringify(folder)}].`, servers: project.mcpServers });
  return sets;
}

/** The old tool's servers and the key-shaped entries of one servers file, a profile's or a project's `.mcp.json`. */
function serverPlaces(file: string, r: Replace | undefined): Place[] {
  const config = readJson(file);
  if (!config) return [];
  const places: Place[] = [];
  for (const { where, servers } of serverSets(config))
    for (const [name, server] of Object.entries(servers)) {
      const entry = `${where}mcpServers.${name}`;
      if (r && isOldServer(server, r)) places.push({ kind: 'server', file, entry, says: `a server of ${r.name}'s` });
      const key = isObject(server) ? keyIn(server) : null;
      if (key) places.push({ kind: 'key', file, entry, says: `something shaped like a key in ${key}` });
    }
  return places;
}

/** Each hook command of a settings file, with the event it runs on. */
function hooksOf(file: string): { event: string; command: string }[] {
  const hooks = readJson(file)?.hooks;
  if (!isObject(hooks)) return [];
  const out: { event: string; command: string }[] = [];
  for (const [event, list] of Object.entries(hooks))
    for (const group of Array.isArray(list) ? list : [])
      for (const hook of isObject(group) && Array.isArray(group.hooks) ? group.hooks : []) if (isObject(hook) && typeof hook.command === 'string') out.push({ event, command: hook.command });
  return out;
}

/** BrainDog's own hook for an event, by its script's name and its last word, as `install` tells one (`isOurs`). */
const isOurHook = (command: string, which: string): boolean => new RegExp(`braindog-hook\\.(?:sh|ps1)["']?\\s+${which}\\s*$`, 'u').test(command);

/**
 * THE FOUR HOOKS BESIDE THE START AND THE END, by their event and word as `install` writes them. Without the prompt and
 * tool hooks what he tells a run from the app waits for the run's next BrainDog call, and two of his three profiles had
 * the start and end hooks only. Named only where the start hook is there, so a profile BrainDog
 * was never installed in says so once.
 */
const OTHER_HOOKS = [
  { event: 'UserPromptSubmit', which: 'prompt', says: "BrainDog's prompt hook is missing, so what you tell a run reaches it only on its next BrainDog call" },
  { event: 'PreToolUse', which: 'tool', says: "BrainDog's tool hook is missing, so a stop you send waits for the run's next BrainDog call" },
  { event: 'Stop', which: 'stop', says: "BrainDog's stop hook is missing, so a run may end its turn while it owes you a reply" },
  { event: 'PostToolUse', which: 'beat', says: "BrainDog's beat hook is missing, so a run that only edits files reads as quiet" },
] as const;

/** Whether a profile's settings hold both of BrainDog's hooks, read as `profileOf` reads them. */
export function hooksThere(dir: string): boolean {
  const commands = hooksOf(join(dir, 'settings.json')).map((hook) => hook.command);
  return commands.some((c) => isOurHook(c, 'start')) && commands.some((c) => isOurHook(c, 'end'));
}

function hookPlaces(file: string, r: Replace | undefined): Place[] {
  const places: Place[] = [];
  for (const { event, command } of hooksOf(file)) {
    const entry = `hooks.${event}`;
    if (r && r.hooks.some((re) => re.test(command))) places.push({ kind: 'hook', file, entry, says: `a hook of ${r.name}'s` });
    if (command.split(/\s+/).some(holdsToken)) places.push({ kind: 'key', file, entry, says: 'something shaped like a key in a hook command' });
  }
  return places;
}

/* A skill is read by its description line, by `install.ts`'s own reader, so the two never disagree about whose it is. */
function skillPlaces(skills: string, r: Replace): Place[] {
  const places: Place[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(skills).sort();
  } catch {
    return places;
  }
  for (const name of names) {
    /* `.replaced` is where `install` sets a skill aside, and BrainDog's own skill is never the old tool's. */
    if (name.startsWith('.') || name === 'braindog') continue;
    const file = join(skills, name, 'SKILL.md');
    const description = descriptionOf(readText(file) ?? '')?.toLowerCase();
    if (description !== undefined && r.skills.some((marker) => description.includes(marker.toLowerCase()))) places.push({ kind: 'skill', file, entry: 'description', says: `a skill of ${r.name}'s` });
  }
  return places;
}

/** Each line of a text that names the old tool, by its number. A `#` line is a comment in every file read this way. */
function linePlaces(kind: 'schedule' | 'startup', file: string, text: string | null, r: Replace, says: string): Place[] {
  if (text === null) return [];
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line, entry: `line ${String(i + 1)}` }))
    .filter(({ line }) => !line.trim().startsWith('#') && namesOld(line, r))
    .map(({ entry }) => ({ kind, file, entry, says }));
}

/* Folders a walk for project files never enters: other people's code, and every dot folder, a profile's among them. */
export const SKIPPED = new Set(['node_modules', 'Library', 'dist', 'build', 'target', 'vendor']);
/** How deep under a folder a project's `.mcp.json` is looked for: a projects folder, a group in it, a project, one more. */
const DEPTH = 4;

/** Every `.mcp.json` under a folder, to `DEPTH` folders down. */
function projectFiles(under: string, depth: number = DEPTH): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(under).sort();
  } catch {
    return out;
  }
  if (names.includes('.mcp.json')) out.push(join(under, '.mcp.json'));
  if (depth > 0) for (const name of names) if (!name.startsWith('.') && !SKIPPED.has(name) && isFolder(join(under, name))) out.push(...projectFiles(join(under, name), depth - 1));
  return out;
}

/** The shell start-up files of a home, and the folders that hold a job the system starts by itself. */
const STARTUP = ['.zshrc', '.zprofile', '.zshenv', '.zlogin', '.bashrc', '.bash_profile', '.profile', join('.config', 'fish', 'config.fish')];
const JOB_FOLDERS = [join('Library', 'LaunchAgents'), join('.config', 'systemd', 'user')];

/** The two servers files a profile may have (`install.ts`, the default profile's second one), each once. */
const serverFilesOf = (dir: string, home: string): string[] => [...new Set([serversFileOf(dir, home), join(resolve(dir), '.claude.json')])];

/* THIS COMMAND, by the file it runs: the first argument, with the slashes one way round as `BRAINDOG_SERVER` keeps it. */
const runsThis = (entry: Record<string, unknown>): boolean =>
  Array.isArray(entry.args) && typeof entry.args[0] === 'string' && entry.args[0].replaceAll('\\', '/') === BRAINDOG_SERVER.args[0];

function profileOf(dir: string, home: string): { state: Profile; places: Place[] } {
  const settings = join(dir, 'settings.json');
  const files = serverFilesOf(dir, home);
  const entries = files.map((file) => readJson(file)?.mcpServers).flatMap((servers) => (isObject(servers) && isObject(servers.braindog) ? [servers.braindog] : []));
  const server = entries.length === 0 ? 'none' : entries.some(runsThis) ? 'this' : 'other';
  const commands = hooksOf(settings).map((hook) => hook.command);
  const state: Profile = { dir, server, start: commands.some((c) => isOurHook(c, 'start')), end: commands.some((c) => isOurHook(c, 'end')) };
  const places: Place[] = [];
  const serversFile = files[0] ?? join(dir, '.claude.json');
  if (server === 'none') places.push({ kind: 'profile', file: serversFile, entry: 'mcpServers.braindog', says: "BrainDog's server is not registered" });
  if (server === 'other') places.push({ kind: 'profile', file: serversFile, entry: 'mcpServers.braindog', says: "BrainDog's server runs another copy of the command" });
  if (!state.start) places.push({ kind: 'profile', file: settings, entry: 'hooks.SessionStart', says: "BrainDog's start hook is missing" });
  if (!state.end) places.push({ kind: 'profile', file: settings, entry: 'hooks.SessionEnd', says: "BrainDog's end hook is missing" });
  if (state.start)
    for (const h of OTHER_HOOKS) if (!commands.some((c) => isOurHook(c, h.which))) places.push({ kind: 'profile', file: settings, entry: `hooks.${h.event}`, says: h.says });
  return { state, places };
}

/* The member each app keeps its servers under, so an entry is named as a person finds it in that app's file. */
const SERVERS_KEY: Record<string, string> = { codex: 'mcp_servers', vscode: 'servers' };

/**
 * EVERY OTHER AGENT APP ON THIS MACHINE, from the clients table: whether BrainDog's server is in its servers, whether
 * one of them is the old tool's, and what holds something shaped like a key. Each set is named by the label the client
 * gives it (`~/.cursor/mcp.json`), which is the file a person opens. CLAUDE CODE IS LEFT TO ITS PROFILES, which read
 * the same `~/.claude.json` and every profile's beside it, so its servers are never listed twice.
 */
function appPlaces(clients: readonly Client[], home: string, env: Env, r: Replace | undefined): { apps: App[]; places: Place[] } {
  const apps: App[] = [];
  const places: Place[] = [];
  for (const client of clients) {
    if (client.id === 'claude' || !client.found(home, env)) continue;
    const app: App = { app: client.title, server: 'none', replaced: false, unread: false };
    const key = SERVERS_KEY[client.id] ?? 'mcpServers';
    let sets: ReturnType<Client['servers']> = [];
    try {
      sets = client.servers(home, null);
    } catch {
      /* A reader that throws is a file doctor cannot read, and is said as one. */
      app.unread = true;
    }
    for (const set of sets) {
      if (set.fault !== null) app.unread = true;
      if (!isObject(set.servers)) continue;
      for (const [name, server] of Object.entries(set.servers)) {
        if (!isObject(server)) continue;
        const entry = `${key}.${name}`;
        if (name === 'braindog') app.server = runsThis(server) || app.server === 'this' ? 'this' : 'other';
        else if (r && isOldServer(server, r)) {
          app.replaced = true;
          places.push({ kind: 'server', file: set.source, entry, says: `a server of ${r.name}'s in ${client.title}` });
        }
        const held = keyIn(server);
        if (held) places.push({ kind: 'key', file: set.source, entry, says: `something shaped like a key in ${held}` });
      }
    }
    apps.push(app);
  }
  return { apps, places };
}

/** The app a server process was started for: the `--agent` it was given, else the first app among its parents. */
const APP_OF_PARENT: [RegExp, string][] = [
  [/\/Claude\.app\//, 'claude-desktop'],
  [/cursor/i, 'cursor'],
  [/Visual Studio Code|Code Helper|(?:^|\/)code(?:\s|$)/, 'vscode'],
  [/(?:^|[/\s])codex(?:\s|$)/i, 'codex'],
  [/(?:^|[/\s])claude(?:\s|$)/i, 'claude'],
];

function appOfProcess(proc: Proc, byPid: Map<number, Proc>, words: string[]): string {
  const agent = words[words.indexOf('--agent') + 1];
  const named = words.includes('--agent') && agent !== undefined ? clientOf(agent) : undefined;
  if (named) return named.title;
  let at = byPid.get(proc.ppid);
  for (let hops = 0; at !== undefined && hops < 6; hops++, at = byPid.get(at.ppid)) {
    const command = at.command;
    const hit = APP_OF_PARENT.find(([re]) => re.test(command));
    const client = hit ? clientOf(hit[1]) : undefined;
    if (client) return client.title;
  }
  return 'the app that started it';
}

/**
 * EVERY BRAINDOG SERVER STILL RUNNING A BUILD OLDER THAN THE INSTALLED COMMAND: a process whose command runs the
 * installed file with `mcp`, started before that file last changed. An agent app starts its servers once and keeps
 * them, so after `braindog update` the old one serves on until the app restarts. The command line is matched here
 * and never copied out: it is the app's to say, and it can hold anything.
 */
function processPlaces(processes: Proc[], installed: Installed | null | undefined): Place[] {
  if (!installed) return [];
  const file = installed.file.replaceAll('\\', '/');
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const places: Place[] = [];
  for (const proc of processes) {
    const words = proc.command.split(/\s+/).map((w) => w.replace(/^["']|["']$/g, '').replaceAll('\\', '/'));
    const at = words.indexOf(file);
    if (at === -1 || words[at + 1] !== 'mcp' || !(proc.started < installed.changed)) continue;
    places.push({ kind: 'process', file: appOfProcess(proc, byPid, words), entry: `process ${String(proc.pid)}`, says: 'started before this command was updated' });
  }
  return places;
}

/**
 * THE PLAN: every profile's state, and every place to fix, in the order a person would walk them: profile by profile,
 * then the project files, then what the machine starts by itself. Each place once, however many ways it was reached.
 */
export function planDoctor(seen: Seen): Report {
  const r = seen.replace;
  const places: Place[] = [];
  const profiles: Profile[] = [];
  const read = new Set<string>();
  const once = (file: string): boolean => !read.has(file) && Boolean(read.add(file));
  for (const dir of seen.profiles) {
    const { state, places: missing } = profileOf(dir, seen.home);
    profiles.push(state);
    for (const file of serverFilesOf(dir, seen.home)) if (once(file)) places.push(...serverPlaces(file, r));
    places.push(...hookPlaces(join(dir, 'settings.json'), r));
    if (r) places.push(...skillPlaces(join(dir, 'skills'), r));
    places.push(...missing);
  }
  const { apps, places: inApps } = appPlaces(seen.clients ?? [], seen.home, seen.env ?? {}, r);
  places.push(...inApps);
  for (const folder of seen.under ?? []) for (const file of projectFiles(resolve(folder))) if (once(file)) places.push(...serverPlaces(file, r));
  if (r) {
    places.push(...linePlaces('schedule', 'crontab', seen.crontab ?? null, r, `a scheduled job that runs ${r.name}`));
    for (const folder of JOB_FOLDERS) {
      let names: string[] = [];
      try {
        names = readdirSync(join(seen.home, folder)).sort();
      } catch {
        continue;
      }
      for (const name of names) places.push(...linePlaces('schedule', join(seen.home, folder, name), readText(join(seen.home, folder, name)), r, `a job the system starts that runs ${r.name}`));
    }
    for (const name of STARTUP) places.push(...linePlaces('startup', join(seen.home, name), readText(join(seen.home, name)), r, `a start-up line that names ${r.name}`));
  }
  places.push(...processPlaces(seen.processes ?? [], seen.installed));
  return { replaced: r?.name ?? null, profiles, apps, places };
}

const count = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

/** A file as a person goes to it: under the home it is `~/...`, and anything else is as it is. */
export const shown = (file: string, home: string | undefined): string =>
  home !== undefined && home !== '' && (file === home || file.startsWith(`${home}/`) || file.startsWith(`${home}\\`)) ? `~${file.slice(home.length)}` : file;

/**
 * A Claude Code profile by its name: the default one, `.claude-<name>` and a ccenv profile by theirs, and any other by
 * where it is. `ccenv` is the folder `ccenvHome` gives, `~/.ccenv` when it is not handed in.
 */
export function profileName(dir: string, home?: string, ccenv: string | undefined = home === undefined ? undefined : join(home, '.ccenv')): string {
  const name = basename(dir);
  const inHome = home !== undefined && resolve(dirname(dir)) === resolve(home);
  if (inHome && name === '.claude') return 'Claude Code, the default profile';
  if (inHome && name.startsWith('.claude-')) return `Claude Code, profile ${name.slice('.claude-'.length)}`;
  if (ccenv !== undefined && resolve(dirname(dir)) === resolve(ccenv, 'profiles')) return `Claude Code, ccenv profile ${name}`;
  return `Claude Code, the profile at ${shown(dir, home)}`;
}

const serverWords = (server: 'this' | 'other' | 'none'): string =>
  server === 'this' ? "BrainDog's server is registered and runs this command" : server === 'other' ? "BrainDog's server is registered and runs another copy of the command" : "BrainDog's server is not registered";

/** Whether doctor found nothing to read at all: no Claude Code profile and no other app. */
export const notSetUp = (report: Pick<Report, 'profiles' | 'apps'>): boolean => report.profiles.length === 0 && report.apps.length === 0;

/**
 * The plan as lines: each profile and each other app in a sentence, then the places under three headings, then each
 * app to restart, then how many there are. `home` is the folder shown as `~`, so a line names a file a person can open,
 * and `ccenv` the one a ccenv profile is named under.
 */
export function printDoctor(report: Report, home?: string, ccenv?: string): string[] {
  const apps = report.apps.length > 0 ? ` and ${count(report.apps.length, 'other app', 'other apps')}` : '';
  const lines = [`braindog doctor read ${count(report.profiles.length, 'profile', 'profiles')}${apps}, and changed nothing.`];
  for (const p of report.profiles) {
    const hooks = p.start && p.end ? 'The start and end hooks are there' : p.start ? 'The end hook is missing' : p.end ? 'The start hook is missing' : 'Both hooks are missing';
    lines.push(`${profileName(p.dir, home, ccenv)}: ${serverWords(p.server)}. ${hooks}.`);
  }
  for (const a of report.apps) {
    const old = a.replaced && report.replaced !== null ? ` A server of ${report.replaced}'s is still there.` : '';
    lines.push(`${a.app}: ${serverWords(a.server)}.${old}${a.unread ? ' Its servers file could not be read.' : ''}`);
  }
  const group = (heading: string, kinds: Kind[]) => {
    const held = report.places.filter((place) => kinds.includes(place.kind));
    if (held.length === 0) return;
    lines.push(heading, ...held.map((place) => `  ${shown(place.file, home)}, ${place.entry}: ${place.says}`));
  };
  if (report.replaced !== null) group(`Still naming ${report.replaced}:`, ['server', 'hook', 'skill', 'schedule', 'startup']);
  group('Shaped like a key, and the value is never shown here:', ['key']);
  group('Not as braindog install leaves a profile:', ['profile']);
  /* One line an app, however many of its servers are old: restarting the app restarts every one. */
  const stale = new Map<string, number>();
  for (const place of report.places) if (place.kind === 'process') stale.set(place.file, (stale.get(place.file) ?? 0) + 1);
  for (const [app, n] of stale) lines.push(`Started before this command was updated: restart ${app}${n > 1 ? ` (${String(n)} servers)` : ''}.`);
  const n = report.places.length;
  /* NO PROFILE AND NO APP IS NOT "NOTHING TO FIX": BrainDog is not set up here at all (D24), and the one line is how. */
  if (notSetUp(report)) lines.push('BrainDog is not set up on this machine: no Claude Code profile or other app was found. Run braindog setup <the address of your BrainDog> to set it up.');
  else lines.push(n === 0 ? `Nothing to fix${report.replaced === null ? '' : `, and nothing names ${report.replaced}`}.` : `${count(n, 'place', 'places')} to fix.`);
  return lines;
}

/** What `crontab -l` prints, or null where there is no crontab or no such command. Read, never written. */
function crontabOf(): string | null {
  try {
    return execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 });
  } catch {
    return null;
  }
}

/**
 * Every process of this machine, as `ps -A` lists it with its start time, or none where there is no such command
 * (on Windows, `winProcs` reads the same from CIM). Read, never signalled: doctor says which app to restart and the
 * person restarts it. LC_ALL=C keeps the start time in the one form `Date` reads.
 */
export function psOf(): Proc[] {
  if (process.platform === 'win32') return winProcs();
  let text: string;
  try {
    text = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,lstart=,command='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return [];
  }
  const procs: Proc[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/.exec(line);
    const started = m ? Date.parse(m[3] ?? '') : NaN;
    if (m && !Number.isNaN(started)) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), started, command: m[4] ?? '' });
  }
  return procs;
}

/* Windows has no `ps`: CIM lists the same four facts, the start time turned to ms in PowerShell so no date form is parsed. */
const WIN_PS =
  'Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{ p = $_.ProcessId; q = $_.ParentProcessId; s = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); c = [string]$_.CommandLine } } | ConvertTo-Json -Compress';

function winProcs(): Proc[] {
  try {
    const text = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', WIN_PS], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const raw: unknown = JSON.parse(text.trim() || '[]');
    const rows = (Array.isArray(raw) ? raw : [raw]) as { p?: unknown; q?: unknown; s?: unknown; c?: unknown }[];
    return rows
      .filter((r) => typeof r.p === 'number' && typeof r.q === 'number' && typeof r.s === 'number')
      .map((r) => ({ pid: r.p as number, ppid: r.q as number, started: r.s as number, command: typeof r.c === 'string' ? r.c : '' }));
  } catch {
    return [];
  }
}

/**
 * The installed command and when it last changed. THE FILE A SERVER RUNS IS `BRAINDOG_SERVER`'s, the one `install`
 * registers, and never `process.argv[1]`: a command on the path is a link to the bundle, and Node keeps the link's
 * name there, so a server running the bundle would never be matched. A bundle is one file, so its own time is the
 * build's. A checkout's `main.ts` may be untouched by a pull that changed the files beside it or the packages the
 * server is made of, so there the newest `.ts` source in its folder and in the checkout's `packages` is the build's
 * time (tests left out, which no server runs).
 */
export function installedOf(file: string | undefined = BRAINDOG_SERVER.args[0]): Installed | null {
  if (file === undefined || file === '') return null;
  const at = resolve(file);
  try {
    if (!at.endsWith('.ts')) return { file: at, changed: statSync(at).mtimeMs };
    let newest = statSync(at).mtimeMs;
    const walk = (dir: string, depth: number) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        const skip = entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'test' || entry.name === 'dist';
        if (entry.isDirectory() && depth > 0 && !skip) walk(path, depth - 1);
        else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) newest = Math.max(newest, statSync(path).mtimeMs);
      }
    };
    walk(dirname(at), 3);
    const packages = resolve(dirname(at), '..', '..', '..', 'packages');
    if (existsSync(packages)) walk(packages, 3);
    return { file: at, changed: newest };
  } catch {
    return null;
  }
}

/** What the verb reads beyond the arguments, each one a test's to hand in: no real home, schedule or process then. */
export type DoctorIo = { home?: string; env?: Env; crontab?: () => string | null; clients?: readonly Client[]; ps?: () => Proc[]; installed?: () => Installed | null };

/**
 * The verb: its arguments read, the plan made and printed. THROWS ONE SENTENCE for an argument it does not take or a
 * replace file that does not read, before anything on the machine is read. `code` is 1 when anything is listed, so a
 * script and the weekly quiet run can tell without reading the lines.
 */
export function doctor(args: string[], io: DoctorIo = {}): { lines: string[]; report: Report; json: boolean; code: 0 | 1 } {
  let values: { replaced?: string | undefined; under?: string[] | undefined; 'config-dir'?: string[] | undefined; json?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { replaced: { type: 'string' }, under: { type: 'string', multiple: true }, 'config-dir': { type: 'string', multiple: true }, json: { type: 'boolean' } }, strict: true }));
  } catch {
    throw new Error('braindog doctor takes --replaced <replace.json>, --under <folder>, --config-dir <folder> and --json, and nothing else.');
  }
  let replace: Replace | undefined;
  if (values.replaced !== undefined) {
    try {
      replace = readReplace(values.replaced);
    } catch (e) {
      /* `readReplace` speaks for `install`; doctor never changes anything, so its sentence ends on what it did not do. */
      throw new Error((e instanceof Error ? e.message : String(e)).replace('braindog install changed nothing', 'braindog doctor read nothing'));
    }
  }
  const home = io.home ?? homedir();
  const env = io.env ?? process.env;
  const report = planDoctor({
    home,
    profiles: profilesIn(home, values['config-dir'] ?? [], env),
    replace,
    under: values.under ?? [],
    crontab: (io.crontab ?? crontabOf)(),
    clients: io.clients ?? CLIENTS,
    env,
    processes: (io.ps ?? psOf)(),
    installed: (io.installed ?? installedOf)(),
  });
  return { lines: printDoctor(report, home, ccenvHome(home, env)), report, json: values.json === true, code: report.places.length > 0 || notSetUp(report) ? 1 : 0 };
}
