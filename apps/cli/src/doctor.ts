/**
 * `braindog doctor [--replaced <replace.json>] [--under <folder>] [--config-dir <folder>] [--json]`: what on this
 * machine still names a replaced tool, what holds something shaped like a key, and which profile lacks BrainDog.
 *
 * IT CHANGES NOTHING. `install --replace` takes the old tool out of the files it is pointed at, and nothing said
 * afterwards what was left: the one reading of a real machine was done by hand, once, three folders deep, for one
 * app. This reads the same places and more, and prints each by its file and its entry so a person can go to it.
 *
 * A PLAN AND A PRINTER. `planDoctor` reads files and is handed everything else (the home, the profiles, the crontab's
 * text), so a test plants a home and no real profile or schedule is read. `printDoctor` turns the plan into lines.
 * `doctor` reads the arguments and joins the two, and leaves the printing and the exit to `main.ts`.
 *
 * NO VALUE IS EVER PUT IN A PLACE. A place is a kind, a file and an entry's name, and the sentence beside it is
 * written here from fixed words. Nothing read from a command, an argument, a header or a line is copied into it, so
 * there is no shape of key the lines could let through.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { BRAINDOG_SERVER, isOldServer, looksLikeToken, readReplace, serversFileOf, wordsOf, type Replace } from './install.ts';

type Env = Record<string, string | undefined>;

/** `profile` is a profile lacking something of BrainDog's; `key` is an entry holding something shaped like one. */
export type Kind = 'server' | 'hook' | 'skill' | 'schedule' | 'startup' | 'key' | 'profile';
/** One thing to go and fix: its file (or `crontab`), the entry's name in it, and one sentence of fixed words. */
export type Place = { kind: Kind; file: string; entry: string; says: string };
/** One profile: whether BrainDog's server is there and runs this command, and whether each of its two hooks is. */
export type Profile = { dir: string; server: 'this' | 'other' | 'none'; start: boolean; end: boolean };
export type Report = { replaced: string | null; profiles: Profile[]; places: Place[] };
/** Everything the plan is handed. `crontab` is what `crontab -l` printed, or null where there is none. */
export type Seen = { home: string; profiles: string[]; replace?: Replace | undefined; under?: string[]; crontab?: string | null };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A JSON object read, or null when the file is missing or is not one: a file doctor cannot read is no place. */
function readJson(file: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(raw) ? raw : null;
  } catch {
    return null;
  }
}

const readText = (file: string): string | null => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const isFolder = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * THE PROFILES TO READ: each `--config-dir`, else every one the home holds, `.claude` and each `.claude-<name>` with a
 * `settings.json` in it, and `CLAUDE_CONFIG_DIR` when it is set. `install` reads one profile unless told of more;
 * doctor is asked what is left anywhere, so it looks for all of them. A folder with no settings is no profile.
 */
export function profilesIn(home: string, named: string[], env: Env): string[] {
  if (named.length > 0) return named.map((dir) => resolve(dir));
  const found = new Set<string>();
  let names: string[] = [];
  try {
    names = readdirSync(home).sort();
  } catch {
    /* A home that cannot be listed holds no profile doctor can read. */
  }
  for (const name of names) if ((name === '.claude' || name.startsWith('.claude-')) && existsSync(join(home, name, 'settings.json'))) found.add(join(home, name));
  if (env.CLAUDE_CONFIG_DIR) found.add(resolve(env.CLAUDE_CONFIG_DIR));
  return [...found];
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
const holdsToken = (word: string): boolean => word.split(/[\\/=:?&"',;\s]+/).some((piece) => piece !== '' && looksLikeToken(piece));

/** A name that says its value is a secret, for an `env` or `headers` entry whose value is too short to look like one. */
const SECRET_NAME = /token|secret|password|passwd|api[_-]?key|authorization|credential/i;
/** A value that points at a secret kept elsewhere, `${NAME}` or `$NAME`, holds none itself. */
const isReference = (value: string): boolean => /^\$\{?[A-Za-z_]\w*\}?$/.test(value.trim());

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
const isOurHook = (command: string, which: 'start' | 'end'): boolean => new RegExp(`braindog-hook\\.(?:sh|ps1)"?\\s+${which}\\s*$`, 'u').test(command);

function hookPlaces(file: string, r: Replace | undefined): Place[] {
  const places: Place[] = [];
  for (const { event, command } of hooksOf(file)) {
    const entry = `hooks.${event}`;
    if (r && r.hooks.some((re) => re.test(command))) places.push({ kind: 'hook', file, entry, says: `a hook of ${r.name}'s` });
    if (command.split(/\s+/).some(holdsToken)) places.push({ kind: 'key', file, entry, says: 'something shaped like a key in a hook command' });
  }
  return places;
}

/**
 * THE `description:` OF A SKILL'S FRONT MATTER, AND NOTHING ELSE OF ITS TEXT (H.620), with the indented lines that
 * carry it on. A folder of notes that mentions the old host further down is nobody's skill, and one with no front
 * matter says nothing about whose it is.
 */
function descriptionOf(text: string): string | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  const front = lines.slice(1, end === -1 ? lines.length : end);
  const at = front.findIndex((line) => /^description\s*:/i.test(line));
  if (at === -1) return null;
  const more: string[] = [];
  for (const line of front.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break;
    more.push(line.trim());
  }
  return [front[at]?.replace(/^description\s*:/i, '').trim() ?? '', ...more].join(' ');
}

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
const SKIPPED = new Set(['node_modules', 'Library', 'dist', 'build', 'target', 'vendor']);
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

function profileOf(dir: string, home: string): { state: Profile; places: Place[] } {
  const settings = join(dir, 'settings.json');
  const files = serverFilesOf(dir, home);
  const entries = files.map((file) => readJson(file)?.mcpServers).flatMap((servers) => (isObject(servers) && isObject(servers.braindog) ? [servers.braindog] : []));
  /* THIS COMMAND, by the file it runs: the first argument, with the slashes one way round as `BRAINDOG_SERVER` keeps it. */
  const runsThis = (entry: Record<string, unknown>) => Array.isArray(entry.args) && typeof entry.args[0] === 'string' && entry.args[0].replaceAll('\\', '/') === BRAINDOG_SERVER.args[0];
  const server = entries.length === 0 ? 'none' : entries.some(runsThis) ? 'this' : 'other';
  const commands = hooksOf(settings).map((hook) => hook.command);
  const state: Profile = { dir, server, start: commands.some((c) => isOurHook(c, 'start')), end: commands.some((c) => isOurHook(c, 'end')) };
  const places: Place[] = [];
  const serversFile = files[0] ?? join(dir, '.claude.json');
  if (server === 'none') places.push({ kind: 'profile', file: serversFile, entry: 'mcpServers.braindog', says: "BrainDog's server is not registered" });
  if (server === 'other') places.push({ kind: 'profile', file: serversFile, entry: 'mcpServers.braindog', says: "BrainDog's server runs another copy of the command" });
  if (!state.start) places.push({ kind: 'profile', file: settings, entry: 'hooks.SessionStart', says: "BrainDog's start hook is missing" });
  if (!state.end) places.push({ kind: 'profile', file: settings, entry: 'hooks.SessionEnd', says: "BrainDog's end hook is missing" });
  return { state, places };
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
  return { replaced: r?.name ?? null, profiles, places };
}

const count = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

/** The plan as lines: each profile in a sentence, then the places under three headings, then how many there are. */
export function printDoctor(report: Report): string[] {
  const lines = [`braindog doctor read ${count(report.profiles.length, 'profile', 'profiles')} and changed nothing.`];
  for (const p of report.profiles) {
    const server = p.server === 'this' ? "BrainDog's server is registered and runs this command" : p.server === 'other' ? "BrainDog's server is registered and runs another copy of the command" : "BrainDog's server is not registered";
    const hooks = p.start && p.end ? 'Both hooks are there' : p.start ? 'The end hook is missing' : p.end ? 'The start hook is missing' : 'Both hooks are missing';
    lines.push(`${p.dir}: ${server}. ${hooks}.`);
  }
  const group = (heading: string, kinds: Kind[]) => {
    const held = report.places.filter((place) => kinds.includes(place.kind));
    if (held.length === 0) return;
    lines.push(heading, ...held.map((place) => `  ${place.file}, ${place.entry}: ${place.says}`));
  };
  if (report.replaced !== null) group(`Still naming ${report.replaced}:`, ['server', 'hook', 'skill', 'schedule', 'startup']);
  group('Shaped like a key, and the value is never shown here:', ['key']);
  group('Not as braindog install leaves a profile:', ['profile']);
  const n = report.places.length;
  lines.push(n === 0 ? `Nothing to fix${report.replaced === null ? '' : `, and nothing names ${report.replaced}`}.` : `${count(n, 'place', 'places')} to fix.`);
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

export type DoctorIo = { home?: string; env?: Env; crontab?: () => string | null };

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
  const report = planDoctor({ home, profiles: profilesIn(home, values['config-dir'] ?? [], io.env ?? process.env), replace, under: values.under ?? [], crontab: (io.crontab ?? crontabOf)() });
  return { lines: printDoctor(report), report, json: values.json === true, code: report.places.length > 0 ? 1 : 0 };
}
