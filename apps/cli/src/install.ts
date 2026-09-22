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

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

/* Paths compared as the file system compares them: without case on Windows. */
const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);

/**
 * Where a profile's MCP servers are kept. CLAUDE CODE KEEPS THE DEFAULT PROFILE'S BESIDE ITS FOLDER, in
 * `~/.claude.json`, and a `CLAUDE_CONFIG_DIR` profile's inside it, which is why `research-switch.md` names
 * `~\.claude.json` and `~\.claude\settings.json` as two places.
 *
 * COMPARED WITHOUT CASE ON WINDOWS: `--config-dir c:\users\<name>\.claude` is the default profile there, and an
 * exact comparison sent the lookup inside the folder, found no file, and reported no the old tool server to remove.
 */
export function serversFileOf(dir: string, home: string = homedir()): string {
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

/** One file's change, read and decided before anything is written: the lines to print, and what to write. */
type Write = { file: string; had: boolean; value: unknown };
type Plan = { lines: string[]; write: Write | null };

/**
 * Removes a file this command made, `.tmp` or `.bak`. BOTH TAKE THE ORIGINAL'S MODE, so both can be read-only, and
 * Windows will not unlink a read-only file: the audit's `.claude.json.tmp`, left read-only by a failed rename,
 * made every later run fail at `open` until it was removed by hand.
 */
const discard = (path: string): void => {
  if (!existsSync(path)) return;
  chmodSync(path, 0o600);
  unlinkSync(path);
};

/**
 * EVERY FILE OR NONE. Each file is copied and its new text written to `<file>.tmp` before any is renamed into place,
 * so a failure while preparing changes nothing, and a failed rename puts back every file already renamed, from the
 * copy made for it a moment before, and takes away every `.tmp`, `.bak` and folder this run made.
 *
 * MEASURED BEFORE THIS EXISTED (`loop/research-batch-twenty-four-audit.md` §1): each file was written on its own,
 * so a read-only `.claude.json` left `settings.json` cut over and the MCP server in, the split brain `--replace`
 * exists to prevent, and printed only the `EPERM`. The thrown sentence now names every file and what became of it.
 */
function commit(plans: Plan[]): string[] {
  type Step = Write & { tmp: string; kept: string | null; made: string | undefined; renamed: boolean };
  const steps: Step[] = [];
  let failing = '';
  try {
    for (const write of plans.flatMap((plan) => (plan.write ? [plan.write] : []))) {
      failing = write.file;
      const step: Step = { ...write, tmp: `${write.file}.tmp`, kept: null, made: undefined, renamed: false };
      steps.push(step);
      /* A `.tmp` still here is an earlier run's, which failed, and it holds nothing the file does not. */
      discard(step.tmp);
      if (write.had) {
        step.kept = backupOf(write.file);
        copyFileSync(write.file, step.kept);
      } else step.made = mkdirSync(dirname(write.file), { recursive: true });
      /* The mode is carried over because `.claude.json` holds the account's sign-in, and a fresh file would be made readable by the umask. */
      writeFileSync(step.tmp, `${JSON.stringify(write.value, null, 2)}\n`, write.had ? { mode: statSync(write.file).mode & 0o777 } : {});
    }
    for (const step of steps) {
      failing = step.file;
      renameSync(step.tmp, step.file);
      step.renamed = true;
    }
  } catch (e) {
    throw new Error(undo(steps, plans, failing, e));
  }
  const kept = new Map(steps.map((step) => [step.file, step.kept]));
  return plans.flatMap((plan) => {
    if (!plan.write) return plan.lines;
    const copy = kept.get(plan.write.file);
    return [...plan.lines, copy ? `The file as it was is kept at ${copy}.` : 'There was no file before, so there is nothing to keep a copy of.'];
  });
}

/** Puts back what `commit` changed, newest first, and says exactly which files are as they were and which are not. */
function undo(steps: { file: string; tmp: string; kept: string | null; made: string | undefined; renamed: boolean }[], plans: Plan[], failing: string, cause: unknown): string {
  const stuck = new Map<string, string>();
  const left: string[] = [];
  for (const step of [...steps].reverse()) {
    if (step.renamed) {
      try {
        /* Through a fresh `.tmp` and a rename, not a copy over the file, because the file may be read-only. */
        if (step.kept) {
          copyFileSync(step.kept, step.tmp);
          renameSync(step.tmp, step.file);
        } else discard(step.file);
      } catch {
        stuck.set(step.file, step.kept ? `  ${step.file}, and the file as it was is kept at ${step.kept}` : `  ${step.file}, which is new`);
        continue;
      }
    }
    for (const path of [step.tmp, ...(step.kept ? [step.kept] : [])]) {
      try {
        discard(path);
      } catch {
        left.push(`  ${path}`);
      }
    }
    /* Only the folders this run made, and only while empty, so nothing another program put there is taken. */
    try {
      for (let dir = dirname(step.file); step.made && fold(resolve(dir)).startsWith(fold(resolve(step.made))); dir = dirname(dir)) rmdirSync(dir);
    } catch {
      /* A folder left behind is empty and harmless, and saying so would bury the line that matters. */
    }
  }
  const files = plans.flatMap((plan) => (plan.write ? [plan.write.file] : []));
  const asWas = files.filter((file) => !stuck.has(file)).map((file) => `  ${file}`);
  const why = `Writing ${failing} failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  const lines =
    stuck.size === 0
      ? [`braindog install changed nothing. ${why}`, 'Each of these is as it was before the run:', ...asWas]
      : [`braindog install stopped part way and could not put everything back. ${why}`, 'Changed, and not put back:', ...stuck.values(), ...(asWas.length > 0 ? ['As it was before the run:', ...asWas] : [])];
  if (left.length > 0) lines.push('Left beside them, and safe to remove by hand:', ...left);
  return lines.join('\n');
}

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

const dryTail = (options: Options) => `Nothing was changed. Run braindog install ${options.replace ? '--replace --apply' : '--apply'} to write it.`;

/**
 * What installing into every profile and every named file does, as one change: each profile's `settings.json`,
 * with `replace` its MCP servers too, then each named settings file. ALL ARE READ BEFORE ANY IS WRITTEN. Measured
 * before this existed, one call per profile cut over two profiles and then refused a malformed third, and the
 * refusal was the only line printed. A file reached twice, a profile's own `settings.json` also named with
 * `--settings`, is planned once, since a second plan from the same reading would overwrite the first.
 */
export function installEvery(profiles: string[], files: string[], options: Options): string[] {
  const seen = new Set<string>();
  const plans: Plan[] = [];
  const add = (file: string, plan: (file: string, options: Options) => Plan) => {
    const key = fold(resolve(file));
    if (seen.has(key)) return;
    seen.add(key);
    plans.push(plan(file, options));
  };
  for (const dir of profiles) {
    add(join(dir, 'settings.json'), planSettings);
    if (options.replace) add(serversFileOf(dir, options.home), planServers);
  }
  for (const file of files) add(file, planSettings);
  return commit(plans);
}

/** What installing into one profile does: its `settings.json`, and with `replace` its MCP servers too. */
export const installInto = (dir: string, options: Options): string[] => installEvery([dir], [], options);

/**
 * What installing into one settings file does, as the lines to print. Throws one sentence when the file cannot
 * be read as settings, and then writes nothing.
 *
 * ANY SETTINGS FILE THE PERSON NAMES, such as a project's `.claude/settings.local.json`, so the hooks can run in one
 * repository and nowhere else. Its folder is made on `--apply` when it is missing, because a repository without a
 * `.claude` folder is the usual case. A name that is not a `.json` file is refused before anything is read.
 */
export const installAt = (named: string, options: Options): string[] => installEvery([], [named], options);

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
  return { lines, write: { file, had, value: { ...settings, hooks: next } } };
}

const HIDDEN = '[hidden]';
/**
 * A word naming a secret, so the word after it is one: `--token`, `--api-key`, `--header`, `Authorization:`,
 * `Bearer`. Loose on purpose, since a word hidden in error costs a reader nothing and one shown costs a key.
 */
const NAMES_SECRET = /token|key|secret|pass|auth|bearer|basic|credential|cookie|session|sig|header|jwt|pat\b/i;
const isUrl = (word: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(word);
/*
 * A colon anywhere, not only at the end: `Authorization:Bearer` is one word when it is written without the space. A
 * URL is never a name, or the `key=` in its query (which is dropped anyway) hid the `--header` after it.
 */
const namesSecret = (word: string) => !isUrl(word) && (/^-/.test(word) || /:/.test(word) || /^(?:bearer|basic|token)$/i.test(word)) && NAMES_SECRET.test(word);
/**
 * A piece of a word that may itself be a token: a known key prefix, or sixteen characters or more that mix letters
 * and digits. `brain-mcp.mjs` and `mcp-remote` pass; `hb_live_SECRET_77`, the audit's, and a UUID do not.
 */
const looksLikeToken = (piece: string) =>
  /^(?:hb|sk|pk|rk|ghp|gho|ghs|ghu|github_pat|glpat|xox[a-z]|rec|AKIA)[_-]/i.test(piece) || piece.length >= 32 || (piece.length >= 16 && /\d/.test(piece) && /[a-z]/i.test(piece));
/* Each path segment on its own, so a folder is still named while a token between two slashes is not. */
const hidePieces = (text: string) => text.split(/([\\/])/).map((piece) => (piece === '/' || piece === '\\' || !looksLikeToken(piece) ? piece : HIDDEN)).join('');

/** A URL as its origin and path, with no query, fragment or sign-in, and every token-like segment hidden. */
function hideUrl(text: string): string {
  try {
    const url = new URL(text);
    return `${url.origin}${hidePieces(url.pathname)}`;
  } catch {
    return HIDDEN;
  }
}

function hideWord(word: string): string {
  const bare = word.replace(/^["']+|["']+$/g, '');
  if (isUrl(bare)) return hideUrl(bare);
  /* `name=value` and `Name:value` alike, so `Authorization:<key>` hides the key as `--api-key=<key>` does. */
  const eq = bare.search(/[=:]/);
  if (eq > 0) {
    const name = bare.slice(0, eq);
    return `${name}${bare[eq]}${NAMES_SECRET.test(name) ? HIDDEN : hidePieces(bare.slice(eq + 1))}`;
  }
  return hidePieces(bare);
}

/**
 * What a server entry runs, to name it by: the command and its arguments, or the URL. NEVER `env` OR `headers`,
 * which is where a registration keeps its token, and NEVER A TOKEN IN WHAT IS SHOWN. Measured before this
 * (`loop/research-batch-twenty-four-audit.md` §4): `--token hb_live_SECRET_77` in the arguments and
 * `/mcp/hb_live_SECRET_88` in the path were printed whole on the dry run and under `--json`. A word after one that
 * names a secret is hidden, and so is every word or path segment shaped like a token, and a run of hidden words
 * is shown once.
 */
function describe(server: Record<string, unknown>): string {
  const words = typeof server.url === 'string' ? [server.url] : wordsOf(server);
  const shown: string[] = [];
  let hideNext = false;
  for (const word of words) {
    /* `Bearer` hidden after `Authorization:` still names a secret, so the key after it is hidden too. */
    const next = namesSecret(word.replace(/^["']+|["']+$/g, ''));
    const text = hideNext ? HIDDEN : hideWord(word);
    if (!(text === HIDDEN && shown.at(-1) === HIDDEN)) shown.push(text);
    hideNext = next;
  }
  return shown.join(' ');
}

/* The command and its arguments split into words, since an entry may give the whole command as one string. */
const wordsOf = (server: Record<string, unknown>): string[] =>
  [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter((s): s is string => typeof s === 'string').flatMap((s) => s.split(/\s+/).filter(Boolean));

/* the old tool's host, with or without the trailing dot a fully qualified name may carry. */
function isSamUrl(text: string): boolean {
  try {
    const url = new URL(text.replace(/^["']+|["']+$/g, ''));
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.toLowerCase().replace(/\.$/, '') === SAM_HOST;
  } catch {
    return false;
  }
}

/**
 * A the old tool server: its own `url` on the old tool's host, `brain-mcp.mjs` among what it runs, or that host among
 * its arguments. THE LAST IS A PROXY, `npx -y mcp-remote https://brain.example.com/mcp`, the usual way to reach an HTTP
 * server from a client older than the HTTP transport. Measured before it was looked for (the audit's §5), a profile
 * whose only the old tool entry was proxied was reported as registering none, and kept it.
 */
function isSamServer(server: unknown): server is Record<string, unknown> {
  if (!isObject(server)) return false;
  if (typeof server.url === 'string' && isSamUrl(server.url)) return true;
  const strings = [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter((s): s is string => typeof s === 'string');
  return strings.some((s) => SAM_MCP.test(s)) || wordsOf(server).some(isSamUrl);
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
  return { lines, write: { file, had: true, value: next } };
}
