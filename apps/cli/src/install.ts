/**
 * `braindog install`: the two hook entries in Claude Code's settings, shown first and written only when asked: the user
 * profile by default, each `--config-dir` profile folder, or each `--settings` file the person names.
 *
 * A DRY RUN BY DEFAULT. Settings belong to the person, and a hook runs in every session they start, so the
 * command prints exactly what it would add and changes nothing without `--apply`. With it, the file as it
 * was is copied beside itself first. Existing entries, other tools' hooks included, are left as they are.
 *
 * `--replace` IS THE CUT-OVER, and the one exception to leaving other entries alone. Step 9 of
 * `loop/research-switch.md` §4 moves the old tool's MCP entry in three profiles and its two hooks "in one sitting",
 * and one profile missed means a session keeps writing to the old record (the split-brain risk it names). With
 * it, the same run also removes every hook and MCP server it can identify as the old tool's by the path it runs,
 * names each one first, and is a dry run until `--apply` exactly as install is. An entry it cannot identify is
 * left, because a false match deletes somebody else's tool and a miss is only a line to remove by hand.
 *
 * NEVER A `.mcp.json`. A project's `.mcp.json` is shared through its repository, so this never opens one
 * (`loop/research-agent-path.md` question 5). A project's settings file is changed only when it is named.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

type Env = Record<string, string | undefined>;
type Entry = { hooks: { type: 'command'; command: string; timeout: number }[] };

/* Claude Code allows a hook sixty seconds by default; these are shorter, and longer than the hook's own eight. */
const EVENTS = [
  { event: 'SessionStart', which: 'start', timeout: 20 },
  { event: 'SessionEnd', which: 'end', timeout: 15 },
] as const;

/**
 * THE OLD TOOL'S HOOKS ARE ITS OWN TWO SCRIPTS, `<checkout>\brain\hooks\session-start.ps1` and `session-end.ps1`
 * (`loop/research-agent-path.md` §4.1). The folder must be named `brain` exactly: BrainDog's first shim was
 * `braindog\apps\cli\hooks\session-start.ps1`, the same file name, and a looser match would have deleted it.
 */
const SAM_HOOK = /[\\/]brain[\\/]hooks[\\/]session-(?:start|end)\.(?:ps1|sh)(?![\w.])/i;
/** Its MCP server is one file, `brain-mcp.mjs` (`loop/research-switch.md` §1), however the entry is named. */
const SAM_MCP = /(?:^|[\\/\s"'])brain-mcp\.mjs(?![\w.])/i;
/** Or the host it was served from, for an entry registered over HTTP. */
const SAM_HOST = 'brain.example.com';

/**
 * Printed once after a `--replace`, because this command cannot do that part: a `.mcp.json` is never opened, and
 * `loop/research-switch.md` §4 step 9 records a the old tool server registered in `C:\Repos\.mcp.json`.
 */
export const REPLACE_BY_HAND =
  "A project's .mcp.json is never opened, so a the old tool server registered in one (C:\\Repos\\.mcp.json had one) is removed by hand.";

/** The profile folders to change: each `--config-dir`, else `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export const profilesOf = (named: string[], env: Env): string[] => (named.length > 0 ? named : [env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')]);

/**
 * Where a profile's MCP servers are kept. CLAUDE CODE KEEPS THE DEFAULT PROFILE'S BESIDE ITS FOLDER, in
 * `~/.claude.json`, and a `CLAUDE_CONFIG_DIR` profile's inside it, which is why `research-switch.md` names
 * `~\.claude.json` and `~\.claude\settings.json` as two places.
 *
 * COMPARED WITHOUT CASE ON WINDOWS: `--config-dir c:\users\<name>\.claude` is the default profile there, and an
 * exact comparison sent the lookup inside the folder, found no file, and reported no the old tool server to remove.
 */
export function serversFileOf(dir: string, home: string = homedir()): string {
  const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  return fold(resolve(dir)) === fold(resolve(home, '.claude')) ? join(home, '.claude.json') : join(resolve(dir), '.claude.json');
}

/** The command Claude Code runs: the PowerShell shim on Windows, the POSIX one elsewhere. */
export function hookCommand(which: 'start' | 'end', scripts: string, platform: string = process.platform): string {
  return platform === 'win32'
    ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(scripts, 'braindog-hook.ps1')}" ${which}`
    : `sh "${join(scripts, 'braindog-hook.sh')}" ${which}`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* The first free name beside the file, so an earlier copy is never overwritten. */
const backupOf = (file: string): string => {
  let n = 0;
  while (existsSync(n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`)) n++;
  return n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`;
};

type Options = { apply: boolean; scripts: string; platform?: string; replace?: boolean; home?: string };

/** One file's change, read and decided before anything is written, so a refusal in the second writes neither. */
type Plan = { lines: string[]; write: (() => string[]) | null };

const readObject = (file: string, what: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON, so braindog install leaves it alone. Correct it and run install again.`);
  }
  if (!isObject(parsed)) throw new Error(`${file} is not ${what}, so braindog install leaves it alone.`);
  return parsed;
};

/**
 * Copy, then write whole and rename into place, so a failed write never leaves half a file. The mode is carried
 * over because `.claude.json` holds the account's sign-in, and a fresh file would be made readable by the umask.
 */
function writeKept(file: string, had: boolean, value: unknown): string {
  if (!had) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
    return 'There was no file before, so there is nothing to keep a copy of.';
  }
  const kept = backupOf(file);
  copyFileSync(file, kept);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: statSync(file).mode & 0o777 });
  renameSync(`${file}.tmp`, file);
  return `The file as it was is kept at ${kept}.`;
}

const dryTail = (options: Options) => `Nothing was changed. Run braindog install ${options.replace ? '--replace --apply' : '--apply'} to write it.`;

/** What installing into one profile does: its `settings.json`, and with `replace` its MCP servers too. */
export function installInto(dir: string, options: Options): string[] {
  const plans = [planSettings(join(dir, 'settings.json'), options)];
  if (options.replace) plans.push(planServers(serversFileOf(dir, options.home), options));
  return plans.flatMap((plan) => [...plan.lines, ...(plan.write ? plan.write() : [])]);
}

/**
 * What installing into one settings file does, as the lines to print. Throws one sentence when the file cannot
 * be read as settings, and then writes nothing.
 *
 * ANY SETTINGS FILE THE PERSON NAMES, such as a project's `.claude/settings.local.json`, so the hooks can run in one
 * repository and nowhere else. Its folder is made on `--apply` when it is missing, because a repository without a
 * `.claude` folder is the usual case. A name that is not a `.json` file is refused before anything is read.
 */
export function installAt(named: string, options: Options): string[] {
  const plan = planSettings(named, options);
  return [...plan.lines, ...(plan.write ? plan.write() : [])];
}

function planSettings(named: string, options: Options): Plan {
  const file = resolve(named);
  if (!basename(file).toLowerCase().endsWith('.json')) throw new Error(`${file} is not a .json settings file, so braindog install leaves it alone.`);
  const had = existsSync(file);
  const settings = had ? readObject(file, 'a settings object') : {};
  const hooks = settings.hooks ?? {};
  if (!isObject(hooks)) throw new Error(`hooks in ${file} is not an object, so braindog install leaves the file alone.`);

  /* the old tool's first, so the check for BrainDog's own below reads the lists as they will be. */
  const next: Record<string, unknown> = { ...hooks };
  const removed: { event: string; command: string }[] = [];
  if (options.replace) {
    for (const [event, list] of Object.entries(hooks)) {
      if (!Array.isArray(list)) continue;
      const kept: unknown[] = [];
      for (const group of list) {
        if (!isObject(group) || !Array.isArray(group.hooks)) {
          kept.push(group);
          continue;
        }
        const theirs = group.hooks.filter((h) => isObject(h) && typeof h.command === 'string' && SAM_HOOK.test(h.command)) as { command: string }[];
        for (const h of theirs) removed.push({ event, command: h.command });
        /* A group left with no hook is dropped, and one that held another tool's hook keeps it and its matcher. */
        if (theirs.length === 0) kept.push(group);
        else if (theirs.length < group.hooks.length) kept.push({ ...group, hooks: group.hooks.filter((h) => !theirs.includes(h as { command: string })) });
      }
      if (kept.length > 0) next[event] = kept;
      else delete next[event];
    }
  }

  const added: { event: string; entry: Entry }[] = [];
  for (const { event, which, timeout } of EVENTS) {
    const list = next[event] ?? [];
    if (!Array.isArray(list)) throw new Error(`hooks.${event} in ${file} is not a list, so braindog install leaves the file alone.`);
    const command = hookCommand(which, options.scripts, options.platform);
    const present = list.some((group) => isObject(group) && Array.isArray(group.hooks) && group.hooks.some((h) => isObject(h) && h.command === command));
    if (!present) added.push({ event, entry: { hooks: [{ type: 'command', command, timeout }] } });
  }
  if (added.length === 0 && removed.length === 0)
    return { lines: [`${file} already runs both BrainDog hooks${options.replace ? ' and no the old tool hook' : ''}. Nothing to change.`], write: null };

  const lines = [`${options.apply ? 'Changed' : 'braindog install would change'} ${file}${had ? '' : ', a new file'}:`];
  for (const { event, command } of removed) lines.push(`  - hooks.${event}, the old tool's: ${command}`);
  for (const { event, entry } of added) lines.push(`  + hooks.${event}: ${JSON.stringify(entry)}`);
  if (!options.apply) return { lines: [...lines, dryTail(options)], write: null };

  for (const { event, entry } of added) next[event] = [...((next[event] as unknown[] | undefined) ?? []), entry];
  return { lines, write: () => [writeKept(file, had, { ...settings, hooks: next })] };
}

/**
 * What a server entry runs, to name it by: the command and its arguments, or the URL without its query. NEVER
 * `env` OR `headers`, which is where a registration keeps its token.
 */
function describe(server: Record<string, unknown>): string {
  if (typeof server.url === 'string') {
    try {
      const url = new URL(server.url);
      return `${url.origin}${url.pathname}`;
    } catch {
      return 'a server whose url does not parse';
    }
  }
  const args = Array.isArray(server.args) ? server.args.filter((a): a is string => typeof a === 'string') : [];
  return [typeof server.command === 'string' ? server.command : '', ...args].filter(Boolean).join(' ');
}

function isSamServer(server: unknown): server is Record<string, unknown> {
  if (!isObject(server)) return false;
  if (typeof server.url === 'string') {
    try {
      return new URL(server.url).hostname.toLowerCase() === SAM_HOST;
    } catch {
      return false;
    }
  }
  const strings = [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter((s): s is string => typeof s === 'string');
  return strings.some((s) => SAM_MCP.test(s));
}

/**
 * The the old tool servers in one profile's `.claude.json`: user scope in `mcpServers`, and local scope in each
 * `projects[<folder>].mcpServers`, since a server added without `--scope user` lands there. Everything else in the
 * file, which is most of it, is carried through as it was read.
 */
function planServers(file: string, options: Options): Plan {
  if (!existsSync(file)) return { lines: [`There is no ${file}, so it registers no the old tool MCP server. Nothing to change.`], write: null };
  const config = readObject(file, 'a Claude Code configuration object');
  const removed: string[] = [];
  const without = (servers: unknown, where: string): unknown => {
    if (!isObject(servers)) return servers;
    const kept: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      if (isSamServer(server)) removed.push(`  - ${where}mcpServers.${name}, the old tool's: ${describe(server)}`);
      else kept[name] = server;
    }
    return kept;
  };
  const next: Record<string, unknown> = { ...config };
  if ('mcpServers' in config) next.mcpServers = without(config.mcpServers, '');
  if (isObject(config.projects)) {
    const projects: Record<string, unknown> = {};
    for (const [folder, project] of Object.entries(config.projects))
      projects[folder] = isObject(project) && 'mcpServers' in project ? { ...project, mcpServers: without(project.mcpServers, `projects[${JSON.stringify(folder)}].`) } : project;
    next.projects = projects;
  }
  if (removed.length === 0) return { lines: [`${file} registers no the old tool MCP server. Nothing to change.`], write: null };

  const lines = [`${options.apply ? 'Changed' : 'braindog install --replace would change'} ${file}:`, ...removed];
  /*
   * NOT MEASURED HERE, AND SAID BECAUSE IT IS CHEAP: Claude Code keeps its running state in this same file (the
   * fixture's `numStartups` is one such field), so a session left open may write back the copy it read.
   */
  if (!options.apply) return { lines: [...lines, 'Close every Claude Code session on this profile before --apply, since each one rewrites this file.', dryTail(options)], write: null };
  return { lines, write: () => [writeKept(file, true, next)] };
}
