/**
 * `braindog install`: the six hook entries in Claude Code's settings (a session's start, its end, the beat after each
 * tool call, and the three that read the inbox file: a prompt, a tool call and the end of a turn), shown first and
 * written only when asked: the user profile by default, each `--config-dir` profile folder, or each `--settings` file
 * the person names.
 *
 * A DRY RUN BY DEFAULT. Settings belong to the person, and a hook runs in every session they start, so the
 * command prints exactly what it would add and changes nothing without `--apply`. With it, the file as it
 * was is copied beside itself first. Existing entries, other tools' hooks included, are left as they are.
 *
 * `--replace` IS THE CUT-OVER, and the one exception to leaving other entries alone. Moving off another tool means
 * moving its MCP entry in every profile and its hooks in one sitting, and one profile missed means a session keeps
 * writing to the old record: a split brain. With it, the same run also removes every hook and MCP server the file it
 * names (`Replace`) identifies as the old tool's, by the path it runs or the host it reaches, names each one first,
 * and is a dry run until `--apply` exactly as install is. An entry it cannot identify is left, because a false match
 * deletes somebody else's tool and a miss is only a line to remove by hand.
 *
 * AND IT PUTS BRAINDOG'S SERVER IN WHERE IT TAKES THE OLD TOOL'S OUT, in the same file, the same dry run and the same
 * all-or-none write. Measured before it did: the cut-over removed three servers and added none, and the one line
 * printed for BrainDog's carried no `CLAUDE_CONFIG_DIR`, so run as printed it registered the server in whichever
 * profile the shell was in. A session that reached the old tool only through a `.mcp.json` was left with no brain at
 * all, and nothing said so. The `.claude.json` is the right owner of the entry, not a second best: it is the file
 * `claude mcp add-json --scope user` writes, and the one this command already rewrites to take the old tool's out.
 *
 * AND INTO EVERY NAMED PROFILE, WHETHER OR NOT THE OLD TOOL'S WAS IN IT. Putting it in only where the old tool's came
 * out left a second named profile with none, since it reached the old tool through a `.mcp.json`, and that file cannot
 * stand in (see below). A profile with no `.claude.json` gets one holding only the entry. And the `claude mcp add` line
 * main.ts prints is owed per profile, with `CLAUDE_CONFIG_DIR` naming it: it was one answer for the whole run, so a
 * two-profile `--apply` left the second profile with no server and no line.
 *
 * A `.mcp.json` ONLY WHEN IT IS NAMED, AND NEVER ONE IN A REPOSITORY. A project's `.mcp.json` is shared through its
 * repository, so one inside a git working tree is refused. But one kept in a parent folder of several repositories is
 * in no repository, and leaving it to a hand edit made the cut-over one sitting plus a line that, missed, leaves a
 * session on the old record. `--replace --mcp-json <file>` opens it, in the same dry run and the same all-or-none
 * write as the profiles. A project's settings file is changed only when it is named.
 *
 * AND THE NAMED `.mcp.json` LOSES THE OLD TOOL'S SERVER AND GAINS NO `braindog`. It gained one until then, and what
 * that entry does was measured in a scratch config folder with a do-nothing server. Claude Code does read a
 * `.mcp.json` from a parent folder, but starts a server there only when its name is in `enabledMcpjsonServers`, and a
 * project's `.claude\settings.local.json` that approved the old server and one other by name left `braindog` at
 * `Pending approval (run claude to approve)`: one prompt in an interactive session, and no brain at all in a headless
 * `claude -p`. Where a user-scope entry of the same name also exists, as every named profile now has, that one is
 * started, with a diagnostic about the two scopes. So the entry here was a prompt and a diagnostic, and never the
 * server that ran.
 *
 * AND IT RETIRES THE OLD TOOL'S SKILL, found by what its `SKILL.md` names (the replace file's `skills`) rather than by
 * its folder's name. With the hooks and servers out and the skill left, a session still loads a skill whose
 * description says to use it whenever he starts work, and reads and writes the old record beside BrainDog: the split
 * brain again, by another door. A folder under a profile's `skills/` whose `SKILL.md` names one of those is moved to
 * `skills/.replaced/<name>-<date>/`, never deleted, inside the same all-or-none write. A skill that names none of them
 * is somebody else's, and `commands/` holds no skill folders, so neither is opened.
 *
 * AND IT SAYS WHEN THE CHECKOUT IT RUNS FROM IS MOVING. The hooks and the server this writes run this checkout's own
 * files, so run from a working tree that is being edited, a session would start on whatever half-written file was
 * there at the time. One line says so and names the worktree fix. It never refuses, because the tree may be his,
 * changed on purpose.
 *
 * AND IT OFFERS BRAINDOG'S OWN AGENT SKILL: each profile's `skills/braindog/SKILL.md`, planned beside the hooks,
 * printed by the dry run and placed by `--apply` in the same all-or-none write (`planAgentSkill`).
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refused, type Result } from '@braindog/ports';

import { unbom } from './unbom.ts';
import { refuse, type Saying } from './json.ts';

type Env = Record<string, string | undefined>;
type Hook = { type: 'command'; command: string; timeout: number; statusMessage?: string; asyncRewake?: boolean };
type Entry = { hooks: Hook[] };

/**
 * WHAT CLAUDE CODE SHOWS WHILE A BRAINDOG HOOK RUNS. Before it, a session start sat silent for as long as the
 * attach took, which on his Mac read as Claude Code hanging. `statusMessage` is the field Claude Code's hook settings
 * name for the line it shows beside its spinner while the command runs.
 */
export const HOOK_STATUS = 'Connecting to BrainDog...';

/** And while a session closes, the end hook's own words: "Connecting" there read as a session starting (D22). */
export const HOOK_END_STATUS = 'Saving this session to BrainDog...';

/**
 * TEN SECONDS EACH, two more than the hook's own eight (`HOOK_MS`), so the hook ends itself before Claude Code has to.
 * They were twenty and fifteen, and a start with the network cut held the session for all twenty.
 *
 * AND THE BEAT, after every tool call, so a session that edits files for an hour and writes nothing to the
 * record still reads Working. Its script reads one file's age and stops there unless five minutes have passed
 * (`beat.ts`), so a tool call pays for a node start at most once in five minutes. IT SAYS NOTHING WHILE IT RUNS: a
 * status line after every tool call would flash under the agent's own work, mostly for a hook that read one file's age
 * and stopped.
 */
/*
 * AND THE THREE THAT READ THE INBOX FILE (agents and MCP plan §2.3 C, `inbox-file.ts`): what he told the run on the
 * next prompt, a stop that denies the next tool call, and a turn that may not end while the run owes him a reply. FIVE
 * SECONDS EACH, and no status line: their script reads one flags file and stops there unless the hook has work, and
 * then Node reads one more file, so a status line would only flash.
 *
 * AND THE WATCHER, ONLY WHEN ASKED (`rewake`, off by default): a Stop hook Claude Code runs in the background
 * (`asyncRewake`, read from Claude Code 2.1.304's own hook settings schema: "runs in background and wakes the model on
 * exit code 2"), which waits up to ten minutes for something he tells the run and wakes an idle session with it. Not
 * yet tried on a signed-in session, which is why nothing turns it on but `braindog install --rewake`.
 */
const EVENTS = [
  { event: 'SessionStart', which: 'start', timeout: 10, status: HOOK_STATUS },
  { event: 'SessionEnd', which: 'end', timeout: 10, status: HOOK_END_STATUS },
  { event: 'PostToolUse', which: 'beat', timeout: 10, status: null },
  { event: 'UserPromptSubmit', which: 'prompt', timeout: 5, status: null },
  { event: 'PreToolUse', which: 'tool', timeout: 5, status: null },
  { event: 'Stop', which: 'stop', timeout: 5, status: null },
] as const;
const WATCH = { event: 'Stop', which: 'watch', timeout: 610, status: null } as const;
type Which = (typeof EVENTS)[number]['which'] | typeof WATCH.which;

/** The hook entries a run writes: the six, and the watcher when `rewake` asks for it. */
const eventsOf = (options: Options) => [...EVENTS, ...(options.rewake === true ? [WATCH] : [])];

/** The words a settings file says when it already runs every hook below as written. */
export const HOOKS_HELD = 'already runs every BrainDog hook';

/**
 * BRAINDOG'S OWN HOOK FOR THIS EVENT, written by any earlier install: its own script, `braindog-hook.sh` or `.ps1`, run
 * with this event's word last. By the script's name and not the whole command, so an entry from before a checkout moved
 * is replaced in place rather than joined by a second hook that does the same thing.
 */
const isOurs = (command: string, which: Which): boolean => new RegExp(`braindog-hook\\.(?:sh|ps1)["']?\\s+${which}\\s*$`, 'u').test(command);

/**
 * WHAT `--replace <replace.json>` TAKES OUT, READ FROM THAT FILE AND FROM NOTHING COMPILED HERE.
 *
 * Compiled in as constants, the markers would let the command take out one tool and no other, so the four things the
 * cut-over matches by live in a file, beside the adapter that imports the same tool when there is one, and anybody
 * leaving another tool writes their own.
 *
 * EACH IS MATCHED AS NARROWLY AS THE FIRST ONES WERE, because a false match deletes somebody else's tool and a miss is
 * only a line to remove by hand. `hooks` are patterns a hook's command must match; `programs` patterns a server's command
 * or arguments must match; `hosts` the hosts a server was reached at, by its own URL or through a proxy's arguments;
 * `skills` texts the description line of a skill's `SKILL.md` must hold for the skill to be set aside. Every pattern is read without case, as
 * the constants were. `name` is what the lines call the tool, as "${name}'s".
 */
export type Replace = { file: string; name: string; hooks: RegExp[]; programs: RegExp[]; hosts: string[]; skills: string[]; mcpJson: string[] };

/** The replace file read, or a throw with the one sentence saying what is wrong with it, before anything else is read. */
export function readReplace(named: string): Replace {
  const file = resolve(named);
  let raw: unknown;
  try {
    raw = JSON.parse(unbom(readFileSync(file, 'utf8')));
  } catch {
    throw new Error(`${file} could not be read as JSON, so braindog install changed nothing. --replace names the file that says what to take out.`);
  }
  const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== '');
  if (!isObject(raw) || typeof raw.name !== 'string' || raw.name.trim() === '')
    throw new Error(`${file} names no tool, so braindog install changed nothing. It holds name, hooks, programs, hosts and skills.`);
  for (const key of ['hooks', 'programs', 'hosts', 'skills', 'mcpJson'] as const)
    if (raw[key] !== undefined && !texts(raw[key])) throw new Error(`${key} in ${file} is a list of texts, so braindog install changed nothing.`);
  const patterns = (key: 'hooks' | 'programs'): RegExp[] =>
    ((raw as Record<string, string[] | undefined>)[key] ?? []).map((p) => {
      try {
        return new RegExp(p, 'i');
      } catch {
        throw new Error(`${key} in ${file} holds ${JSON.stringify(p)}, which is not a pattern, so braindog install changed nothing.`);
      }
    });
  const list = (key: 'hosts' | 'skills' | 'mcpJson'): string[] => (raw as Record<string, string[] | undefined>)[key] ?? [];
  const replace = { file, name: raw.name.trim(), hooks: patterns('hooks'), programs: patterns('programs'), hosts: list('hosts').map((h) => h.toLowerCase().replace(/\.$/, '')), skills: list('skills'), mcpJson: list('mcpJson') };
  if (replace.hooks.length + replace.programs.length + replace.hosts.length + replace.skills.length === 0)
    throw new Error(`${file} names nothing to take out, so braindog install changed nothing.`);
  return replace;
}

/**
 * Printed once after a `--replace` that names no `--mcp-json`, because a server registered in a `.mcp.json` nobody
 * named is never opened. The replace file's `mcpJson` names where one was seen, when its writer knew.
 */
export const replaceByHand = (r: Replace): string =>
  `A .mcp.json is opened only when it is named, so a ${r.name} server registered in one${r.mcpJson.length > 0 ? ` (${r.mcpJson.join(', ')} had one)` : ''} stays until you run this again with --mcp-json <file>.`;

/**
 * BrainDog's MCP server as a registration: this checkout's `main.ts` run by Node, the entry the hand-run line has
 * `claude mcp add` write. NO `env` AND NO `headers`, so no token is ever written here: the server reads the sign-in
 * `braindog login` keeps, and the entry it replaces is never copied from, since that is where the old tool kept its key.
 */
export const BRAINDOG_SERVER = {
  type: 'stdio',
  command: 'node',
  args: [fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/'), 'mcp', '--agent', 'claude'],
} as const;

const ADDS_SERVER = '  + mcpServers.braindog: ';

/**
 * BrainDog's own Agent Skill, the text of the repository's `skills/braindog/SKILL.md`. THE BUNDLE CARRIES IT AS
 * `__SKILL__`, defined by `scripts/bundle.mjs` exactly as `__BUILD__` is, because the published CLI is one file on a
 * machine with no checkout beside it; a checkout run of the sources reads the file from the repository's root.
 */
declare const __SKILL__: string;
const agentSkill = (): string =>
  typeof __SKILL__ === 'string' ? __SKILL__ : readFileSync(new URL('../../../skills/braindog/SKILL.md', import.meta.url), 'utf8');

/** The line a plan prints for the skill, which `setup` also reads to know that install has something to place. */
export const PLACES_SKILL = '  + skills/braindog/SKILL.md';

/**
 * The shell a hand-run line is printed for, by the name the printed lines are headed with.
 *
 * GIT BASH TAKES THE `sh` FORM, NOT THE ONE `process.platform` NAMES. The line was PowerShell on every win32 run, and
 * Git Bash is a shell he has and the one Claude Code's own Bash tool runs here: pasted there, bash ran each `;`
 * statement, the two assignments failed, and `claude mcp add` ran in the named profile the window sat in, for a line
 * that named another and for the line that meant `~/.claude`.
 */
export type Shell = 'PowerShell' | 'Git Bash' | 'sh';

/**
 * The shell that ran `braindog install`, where the environment can tell it: `MSYSTEM`, or a `SHELL` naming bash, is
 * Git Bash on win32, unless `_` says the command bash last started was PowerShell.
 *
 * `_` IS BASH'S NOTE OF THE PROGRAM IT RAN, AND A POWERSHELL STARTED UNDER GIT BASH KEEPS IT. Measured in Git Bash
 * on Windows 11: `node` run straight from bash saw `MSYSTEM=MINGW64` and `_` naming `node`; the same `node`
 * run from a `powershell -NoProfile` started in that bash saw the same `MSYSTEM`, and `_` naming
 * `C:/WINDOWS/System32/WindowsPowerShell/v1.0/powershell`, because PowerShell inherits the variable and never writes it.
 * Without this, that PowerShell was handed the `sh` form. `pwsh` is matched by the same rule and was not
 * measured: it was not installed on the machine that measured.
 *
 * NONE OF THIS IS PROOF, which is why every form fails closed in the others and the lines are headed with the name.
 * The `sh` form is refused whole in PowerShell, "is not recognized" for a named profile ("missing the terminator" when
 * its folder holds an apostrophe) and "Missing closing ')'" for the default one, and in `cmd` too, with a stand-in
 * `claude` first on the PATH never run.
 */
export function shellOf(env: Env = process.env, platform: string = process.platform): Shell {
  if (platform !== 'win32') return 'sh';
  if (/(?:^|[\\/])(?:powershell|pwsh)(?:\.exe)?$/i.test(env._ ?? '')) return 'PowerShell';
  return env.MSYSTEM || /bash/i.test(env.SHELL ?? '') ? 'Git Bash' : 'PowerShell';
}

/*
 * A word quoted for the shell the line is printed for: PowerShell doubles a `'`, `sh` closes and reopens around it.
 * POWERSHELL READS FOUR MORE CHARACTERS AS `'`: U+2018, U+2019, U+201A and U+201B. With only the ASCII one doubled,
 * a profile folder named `prof’s` printed a line 5.1 refused whole, "The string is missing the terminator".
 */
const quote = (word: string, shell: Shell): string =>
  shell === 'PowerShell' ? `'${word.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'` : `'${word.replaceAll("'", "'\\''")}'`;

/**
 * What registers BrainDog's server in the profile the shell is in, for the shell `shell` names.
 *
 * `claude mcp add`, NOT `add-json`, BECAUSE NO SHELL HAS TO CARRY JSON. The `add-json` line lost its inner double
 * quotes in Windows PowerShell 5.1, which reached `claude` as `{type:stdio,command:node,...}` and did not parse
 * (measured). Written `\"`, 5.1 was measured keeping them and 7.3
 * passing the backslashes through, and `add-json` reads no file, only its argument (its `--help` in Claude Code 2.1.280).
 *
 * THE `--` IS QUOTED IN POWERSHELL. Without it Claude Code reads `--agent` as its own option and exits 1, "unknown
 * option '--agent'", and PowerShell 5.1 drops a bare `--` before it reaches a `.ps1`, the `claude` that `npm install -g`
 * puts on the PATH: a stand-in `claude.ps1` was handed no `--`, and `'--'` arrived whole. `claude.exe` from the
 * native installer took the quoted form and wrote exactly `BRAINDOG_SERVER`, plus an empty `env`, in a scratch profile.
 */
export function handRun(shell: Shell = shellOf()): string {
  const [main, ...rest] = BRAINDOG_SERVER.args;
  const dashes = shell === 'PowerShell' ? "'--'" : '--';
  return `claude mcp add --scope user braindog ${dashes} ${BRAINDOG_SERVER.command} ${quote(main, shell)} ${rest.join(' ')}`;
}

/**
 * The hand-run line for each profile `installProfiles` left without BrainDog's server, WITH `CLAUDE_CONFIG_DIR` NAMING
 * IT, because run bare the line registers the server in whichever profile the shell is in. The default profile is
 * named by the variable's absence: Claude Code keeps its servers in `~/.claude.json` only when no `CLAUDE_CONFIG_DIR`
 * is set (see `serversFileOf`), so setting it to `~/.claude` would be read as a named profile and write inside the
 * folder, and leaving the shell's own, as the line once did, wrote into whichever profile the window was in.
 *
 * POWERSHELL ON WIN32 UNLESS THE SHELL SAYS GIT BASH (see `shellOf`). The `sh` form, `CLAUDE_CONFIG_DIR='<dir>'
 * claude ...`, is `CommandNotFoundException` in PowerShell 5.1 and "not recognized" in `cmd`. The PowerShell form
 * PUTS THE SHELL'S OWN VALUE BACK rather than removing it: his window already sits in a profile, and a line ending in
 * `Remove-Item Env:CLAUDE_CONFIG_DIR` left it unset, so every later `claude` there ran in `~/.claude`. Assigning the
 * saved `$null` back removes the variable, so a shell that had none is left with none.
 *
 * AND IT IS ONE SCRIPT BLOCK, `& { ... }`, SO NO OTHER SHELL RUNS ANY OF IT. Written as bare `;` statements, bash ran
 * them one by one and reached `claude` after both assignments had failed. Measured: bash refuses the block before it
 * starts, "syntax error near unexpected token `&'", and `cmd` says "& was unexpected at this time", neither running a
 * stand-in `claude`. In 5.1 the block's `$env:` change is the process's, so `claude` sees it, while `$was` ends with
 * the block and leaves the window no variable of ours.
 */
export function byHand(unserved: string[], home: string = homedir(), shell: Shell = shellOf()): string[] {
  const line = handRun(shell);
  return unserved.map((dir) => {
    const named = serversFileOf(dir, home) !== join(home, '.claude.json');
    if (shell !== 'PowerShell') return named ? `CLAUDE_CONFIG_DIR=${quote(resolve(dir), shell)} ${line}` : `(unset CLAUDE_CONFIG_DIR; ${line})`;
    const set = named ? quote(resolve(dir), shell) : '$null';
    return `& { $was = $env:CLAUDE_CONFIG_DIR; $env:CLAUDE_CONFIG_DIR = ${set}; ${line}; $env:CLAUDE_CONFIG_DIR = $was }`;
  });
}

/** The profile folders to change: each `--config-dir`, else `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export const profilesOf = (named: string[], env: Env): string[] => (named.length > 0 ? named : [env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')]);

/* Paths compared as the file system compares them: without case on Windows. */
const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);

/**
 * Where a profile's MCP servers are kept. CLAUDE CODE KEEPS THE DEFAULT PROFILE'S BESIDE ITS FOLDER, in
 * `~/.claude.json`, and a `CLAUDE_CONFIG_DIR` profile's inside it, which is why `~\.claude.json` and
 * `~\.claude\settings.json` are two places.
 *
 * COMPARED WITHOUT CASE ON WINDOWS: `--config-dir c:\users\<name>\.claude` is the default profile there, and an
 * exact comparison sent the lookup inside the folder, found no file, and reported no server of the old tool's to remove.
 */
export function serversFileOf(dir: string, home: string = homedir()): string {
  return fold(resolve(dir)) === fold(resolve(home, '.claude')) ? join(home, '.claude.json') : join(resolve(dir), '.claude.json');
}

/**
 * Git for Windows' `sh.exe`, when it is installed. Claude Code needs Git Bash on Windows, and its `sh` starts in about a
 * fifth of Windows PowerShell's time, which runs before every prompt and tool call and passed the 5 s limit under load.
 */
export function gitShell(env: NodeJS.ProcessEnv = process.env, exists: (path: string) => boolean = existsSync): string | null {
  const bash = env.CLAUDE_CODE_GIT_BASH_PATH;
  const roots = [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'Programs')];
  const found = [
    ...(bash ? [win32.join(win32.dirname(win32.dirname(bash)), 'usr', 'bin', 'sh.exe'), win32.join(win32.dirname(bash), 'sh.exe')] : []),
    ...roots.filter((r): r is string => typeof r === 'string' && r !== '').map((r) => win32.join(r, 'Git', 'usr', 'bin', 'sh.exe')),
  ];
  return found.find((p) => exists(p)) ?? null;
}

/**
 * A path as one word of the line a shell reads, for a hook or a status line.
 *
 * DOUBLE QUOTES FOR A PLAIN PATH, so the line every machine already pinned stays those bytes. A shell still runs what is
 * inside double quotes, so a folder holding `$`, a backtick, a `"` or a `\\` is written in single quotes, where nothing
 * is read: `sh "/x$(touch y)/braindog-hook.sh" start` ran `touch y` every time the hook fired.
 */
export const shellWord = (path: string, reads: RegExp = /[$`"\\\n]/u): string => (reads.test(path) ? `'${path.replaceAll("'", "'\\''")}'` : `"${path}"`);

/** The same for a path on Windows read by Git's `sh`, whose backslashes are its folders and its line has always held them. */
const winWord = (path: string): string => shellWord(path, /[$`"\n]/u);

/** The command Claude Code runs: Git's `sh` on Windows when there is one, else the PowerShell shim; `sh` elsewhere. */
export function hookCommand(which: Which, scripts: string, platform: string = process.platform, shell: string | null = platform === 'win32' ? gitShell() : null): string {
  if (platform !== 'win32') return `sh ${shellWord(join(scripts, 'braindog-hook.sh'))} ${which}`;
  return shell !== null
    ? `${winWord(shell)} ${shellWord(join(scripts, 'braindog-hook.sh').replaceAll('\\', '/'))} ${which}`
    : `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(scripts, 'braindog-hook.ps1')}" ${which}`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The suffix of the first copy BrainDog keeps of a file it changes, the scope's word for it ("`*.pre-braindog` backups"). */
export const FIRST_COPY = '.pre-braindog';

/**
 * The first free name beside the file, so an earlier copy is never overwritten. THE FIRST COPY IS `<file>.pre-braindog`,
 * the file as it was before BrainDog touched it, and later ones keep the names they always had, `.bak`, `.bak1` and on,
 * so the one he looks for is never the one a later run takes.
 */
export const backupOf = (file: string): string => {
  if (!existsSync(`${file}${FIRST_COPY}`)) return `${file}${FIRST_COPY}`;
  let n = 0;
  while (existsSync(n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`)) n++;
  return n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`;
};

/**
 * A copy of `file` under `backupOf`'s name, and that name, or null when there is no file to copy. FOR A FILE ANOTHER
 * PROGRAM WRITES, such as the servers file `claude mcp add-json` changes, which `commit` never sees. EXCLUSIVE, so a
 * name taken between the look and the copy fails rather than writing over an earlier copy.
 */
export function keepCopy(file: string): string | null {
  if (!existsSync(file)) return null;
  const kept = backupOf(file);
  copyFileSync(file, kept, constants.COPYFILE_EXCL);
  chmodSync(kept, statSync(file).mode & 0o777);
  return kept;
}

type Options = { apply: boolean; scripts: string; platform?: string; replace?: Replace | undefined; home?: string; checkout?: string; rewake?: boolean | undefined };

/** One file's change, read and decided before anything is written: the lines to print, and what to write. */
type Write = { file: string; had: boolean; value: unknown };
/** One folder set aside, renamed in the same pass as the files are and renamed back with them. */
type Move = { from: string; to: string };
/* `serves` is set on a profile's servers plan alone: whether the file holds BrainDog's server once the plan is written. */
type Plan = { lines: string[]; write: Write | null; moves?: Move[]; serves?: boolean };

type FileStep = Write & { tmp: string; kept: string | null; made: string | undefined; renamed: boolean };
type MoveStep = Move & { made: string | undefined; renamed: boolean };
type Step = FileStep | MoveStep;
const isMove = (step: Step): step is MoveStep => 'to' in step;

/**
 * Removes a file this command made, `.tmp` or `.bak`. BOTH TAKE THE ORIGINAL'S MODE, so both can be read-only, and
 * Windows will not unlink a read-only file: a `.claude.json.tmp` left read-only by a failed rename
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
 * MEASURED BEFORE THIS EXISTED: each file was written on its own,
 * so a read-only `.claude.json` left `settings.json` cut over and the MCP server in, the split brain `--replace`
 * exists to prevent, and printed only the `EPERM`. The thrown sentence now names every file and what became of it.
 *
 * A SKILL FOLDER SET ASIDE IS ONE MORE RENAME IN THE SAME PASS, in plan order, so a profile's skill is moved after its
 * two files and before the next profile's. Measured with the move done at planning time instead, as a mutation: a
 * later profile's read-only `.claude.json` put every file back and left the first profile's skill under `.replaced`
 * beside the old tool's restored hooks, which is neither the old state nor the new.
 */
function commit(plans: Plan[]): string[] {
  const steps: Step[] = [];
  let failing = '';
  try {
    for (const plan of plans) {
      if (plan.write) {
        const write = plan.write;
        failing = write.file;
        const step: FileStep = { ...write, tmp: `${write.file}.tmp`, kept: null, made: undefined, renamed: false };
        steps.push(step);
        /* A `.tmp` still here is an earlier run's, which failed, and it holds nothing the file does not. */
        discard(step.tmp);
        if (write.had) {
          step.kept = backupOf(write.file);
          copyFileSync(write.file, step.kept);
        } else step.made = mkdirSync(dirname(write.file), { recursive: true });
        /* The mode is carried over because `.claude.json` holds the account's sign-in, and a fresh file would be made readable by the umask. */
        /* A string is a text file's whole content (the Agent Skill); every other value is a JSON file's. */
        const text = typeof write.value === 'string' ? write.value : `${JSON.stringify(write.value, null, 2)}\n`;
        writeFileSync(step.tmp, text, write.had ? { mode: statSync(write.file).mode & 0o777 } : {});
      }
      for (const move of plan.moves ?? []) {
        failing = move.from;
        const step: MoveStep = { ...move, made: undefined, renamed: false };
        steps.push(step);
        step.made = mkdirSync(dirname(move.to), { recursive: true });
      }
    }
    for (const step of steps) {
      if (isMove(step)) {
        failing = step.from;
        renameSync(step.from, step.to);
      } else {
        failing = step.file;
        renameSync(step.tmp, step.file);
      }
      step.renamed = true;
    }
  } catch (e) {
    throw new Error(undo(steps, plans, failing, e));
  }
  const kept = new Map(steps.flatMap((step) => (isMove(step) ? [] : [[step.file, step.kept] as const])));
  return plans.flatMap((plan) => {
    const moved = (plan.moves ?? []).map((move) => `The folder as it was is kept at ${move.to}.`);
    if (!plan.write) return [...plan.lines, ...moved];
    const copy = kept.get(plan.write.file);
    return [...plan.lines, copy ? `The file as it was is kept at ${copy}.` : 'There was no file before, so there is nothing to keep a copy of.'];
  });
}

/** Puts back what `commit` changed, newest first, and says exactly which files are as they were and which are not. */
function undo(steps: Step[], plans: Plan[], failing: string, cause: unknown): string {
  const stuck = new Map<string, string>();
  const left: string[] = [];
  for (const step of [...steps].reverse()) {
    if (isMove(step)) {
      if (step.renamed) {
        try {
          renameSync(step.to, step.from);
        } catch {
          stuck.set(step.from, `  ${step.from}, which is at ${step.to}`);
          continue;
        }
      }
      /* The `.replaced` folder, when this run made it and it is empty again. */
      try {
        if (step.made) rmdirSync(step.made);
      } catch {
        /* Not empty, so an earlier run's skill is in it, and it is left. */
      }
      continue;
    }
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
  const files = plans.flatMap((plan) => [...(plan.write ? [plan.write.file] : []), ...(plan.moves ?? []).map((move) => move.from)]);
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
    parsed = JSON.parse(unbom(readFileSync(file, 'utf8')));
  } catch {
    throw new Error(`${file} is not valid JSON, so braindog install leaves it alone. Correct it and run install again.`);
  }
  if (!isObject(parsed)) throw new Error(`${file} is not ${what}, so braindog install leaves it alone.`);
  return parsed;
};

/**
 * The dry run's one closing line: THE COMMAND THAT WRITES WHAT IT SHOWED, word for word, quoted for the shell `shellOf`
 * names. Measured before this: the line was built from `--replace` alone and printed after every file, ten times in a
 * dry run of 44 lines, as `Run braindog install --replace --apply`. It named no `--config-dir` or `--mcp-json`, and
 * `braindog` need not be on the PATH at all. Run as printed on copies of three profiles, from a window whose
 * `CLAUDE_CONFIG_DIR` named one profile, it cut over that one alone and left the default and the other profile and the
 * named `.mcp.json` on the old tool, the one-profile split brain `--replace` exists to prevent.
 *
 * THE RESOLVED PROFILES, NOT THE WORDS TYPED. A run that named no `--config-dir` changed the profile the shell was in,
 * and the line pins that one, so pasting it into another window writes what was shown and nothing else.
 */
function dryTail(profiles: string[], files: string[], mcpFiles: string[], options: Options, shell: Shell = shellOf()): string {
  const named = (flag: string, paths: string[]) => paths.flatMap((path) => [flag, quote(resolve(path), shell)]);
  const words = [
    'node',
    quote(fileURLToPath(new URL('./main.ts', import.meta.url)), shell),
    'install',
    ...(options.replace ? ['--replace', quote(options.replace.file, shell)] : []),
    '--apply',
    ...named('--config-dir', profiles),
    ...named('--settings', files),
    ...named('--mcp-json', mcpFiles),
  ];
  return `Nothing was changed. To write it, run this in ${shell}: ${words.join(' ')}`;
}

/**
 * What installing into every profile and every named file does, as one change: each profile's `settings.json`,
 * with `replace` its MCP servers too, then each named settings file, then each named `.mcp.json`. ALL ARE READ BEFORE ANY IS WRITTEN. Measured
 * before this existed, one call per profile cut over two profiles and then refused a malformed third, and the
 * refusal was the only line printed. A file reached twice, a profile's own `settings.json` also named with
 * `--settings`, is planned once, since a second plan from the same reading would overwrite the first.
 */
export const installEvery = (profiles: string[], files: string[], options: Options, mcpFiles: string[] = []): string[] => installProfiles(profiles, files, options, mcpFiles).lines;

/**
 * `installEvery`, and the profiles that end the run without BrainDog's server, for `byHand`. ANSWERED PER PROFILE, not
 * for the run: main.ts used to withhold the hand-run line when any line of the run added the server, which is how
 * a second profile was left with none and nothing said so. Without `replace` no server is written, so a
 * profile is owed the line unless its servers file already holds `braindog`.
 */
export function installProfiles(profiles: string[], files: string[], options: Options, mcpFiles: string[] = []): { lines: string[]; unserved: string[] } {
  /* Removing servers is the cut-over's, so a `.mcp.json` named without `--replace` would have nothing to do. */
  if (mcpFiles.length > 0 && !options.replace) throw new Error('--mcp-json is read only with --replace, so braindog install changed nothing.');
  const seen = new Set<string>();
  const plans: Plan[] = [];
  const served = new Map<string, boolean>();
  const add = (file: string, plan: (file: string, options: Options) => Plan) => {
    const key = fold(resolve(file));
    if (seen.has(key)) return;
    seen.add(key);
    const planned = plan(file, options);
    plans.push(planned);
    if (planned.serves !== undefined) served.set(key, planned.serves);
  };
  for (const dir of profiles) {
    add(join(dir, 'settings.json'), planSettings);
    /* After the settings and before the servers, so a run's first line is still its first file's heading. */
    add(join(dir, 'skills', 'braindog', 'SKILL.md'), planAgentSkill);
    if (options.replace) {
      const servers = serversFileOf(dir, options.home);
      add(servers, planServers);
      /*
       * THE DEFAULT PROFILE'S SECOND SERVERS FILE, `~\.claude\.claude.json`, WHEN IT EXISTS. Measured with Claude Code
       * 2.1.280 in a scratch home: with `CLAUDE_CONFIG_DIR` unset, `claude mcp
       * list` read `<home>\.claude.json`; set to `<home>\.claude`, the same folder, it read the file inside and said
       * "No MCP servers configured". A real `~\.claude` was found holding such a file, so some launcher starts sessions that way,
       * and a cut-over of the one file left those with BrainDog's hooks and no server. NEVER MADE when missing, since a
       * profile nobody starts that way has no use for it, and `serversFileOf` stays the answer `byHand` names.
       */
      const inside = join(resolve(dir), '.claude.json');
      if (fold(inside) !== fold(resolve(servers)) && existsSync(inside)) add(inside, planServers);
      add(join(dir, 'skills'), planSkills);
    }
  }
  for (const file of files) add(file, planSettings);
  for (const file of mcpFiles) add(file, planMcpJson);
  /*
   * ONE CLOSING LINE FOR THE DRY RUN, after every plan, and only when some plan would change something. The plans are
   * the same dry or not; `--apply` alone decides whether `commit` runs.
   */
  const pending = plans.some((plan) => plan.write !== null || (plan.moves ?? []).length > 0);
  const planned = options.apply ? commit(plans) : [...plans.flatMap((plan) => plan.lines), ...(pending ? [dryTail(profiles, files, mcpFiles, options)] : [])];
  /*
   * AFTER THE PLAN, NOT BEFORE IT: a run's first line has always been its first file's heading, and main.ts's own
   * tests read it there. Printed first, it failed two of them whenever the tree held another agent's edit.
   */
  const moving = movingCheckout(options.checkout ?? dirname(fileURLToPath(import.meta.url)));
  const lines = [...planned, ...(moving ? [moving] : [])];
  const owed = new Set<string>();
  const unserved = profiles.filter((dir) => {
    const file = serversFileOf(dir, options.home);
    const key = fold(resolve(file));
    if (owed.has(key)) return false;
    owed.add(key);
    return !(served.get(key) ?? holdsBraindog(file));
  });
  return { lines, unserved };
}

/**
 * The one line owed when the checkout this runs from has uncommitted changes, naming it, or null. TRACKED FILES ONLY:
 * when this was written the tree held three untracked test files of other agents, which no hook or server runs, and
 * a new source file only runs once a tracked one imports it, which is then a change. NO OPTIONAL LOCKS, because other
 * agents run git in the same tree and a plain `status` may take the index lock to refresh it. Not a git tree, or no
 * git on the path, is no warning: nothing can be said, and install must not fail on it.
 */
function movingCheckout(dir: string): string | null {
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 10_000 }).trim();
  try {
    if (git('status', '--porcelain', '--untracked-files=no') === '') return null;
    const root = resolve(git('rev-parse', '--show-toplevel'));
    return `${root} has uncommitted changes, and the hooks and the MCP server this installs run that tree's files as they are when each session starts. To pin them, install from a worktree of a pushed commit instead: git worktree add ../braindog-cli <commit>, then pnpm install there.`;
  } catch {
    return null;
  }
}

/* Read without `readObject`'s refusal, because a plain install never writes this file and must not fail on it. */
function holdsBraindog(file: string): boolean {
  try {
    const config: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    return isObject(config) && isObject(config.mcpServers) && 'braindog' in config.mcpServers;
  } catch {
    return false;
  }
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

  /* THE OLD TOOL'S FIRST, so the check for BrainDog's own below reads the lists as they will be. */
  const next: Record<string, unknown> = { ...hooks };
  const removed: { event: string; command: string }[] = [];
  const old = options.replace;
  if (old) {
    for (const [event, list] of Object.entries(hooks)) {
      if (!Array.isArray(list)) continue;
      const kept: unknown[] = [];
      for (const group of list) {
        if (!isObject(group) || !Array.isArray(group.hooks)) {
          kept.push(group);
          continue;
        }
        const theirs = group.hooks.filter((h) => isObject(h) && typeof h.command === 'string' && old.hooks.some((re) => re.test(h.command as string))) as { command: string }[];
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
  const changed: { event: string; hook: Hook }[] = [];
  for (const { event, which, timeout, status } of eventsOf(options)) {
    const list = next[event] ?? [];
    if (!Array.isArray(list)) throw new Error(`hooks.${event} in ${file} is not a list, so braindog install leaves the file alone.`);
    const hook: Hook = {
      type: 'command',
      command: hookCommand(which, options.scripts, options.platform),
      timeout,
      ...(status !== null ? { statusMessage: status } : {}),
      ...(which === 'watch' ? { asyncRewake: true } : {}),
    };
    const same = (h: unknown) =>
      isObject(h) && h.type === hook.type && h.command === hook.command && h.timeout === hook.timeout && h.statusMessage === hook.statusMessage && h.asyncRewake === hook.asyncRewake;
    const ours = (h: unknown) => isObject(h) && typeof h.command === 'string' && (h.command === hook.command || isOurs(h.command, which));
    const hooksOf = (group: unknown): unknown[] => (isObject(group) && Array.isArray(group.hooks) ? group.hooks : []);
    if (list.some((group) => hooksOf(group).some(same))) continue;
    /*
     * AN OLDER BRAINDOG ENTRY IS REPLACED WHERE IT STANDS, one `~` line, in its own group with its matcher kept. Added
     * beside it instead, as before, every session would run the hook twice, the old one with the old timeout.
     */
    let swapped = false;
    next[event] = list.map((group) => {
      if (swapped || !hooksOf(group).some(ours)) return group;
      swapped = true;
      const hooks = [...hooksOf(group)];
      hooks[hooks.findIndex(ours)] = hook;
      return { ...(group as Record<string, unknown>), hooks };
    });
    if (swapped) changed.push({ event, hook });
    else added.push({ event, entry: { hooks: [hook] } });
  }
  if (added.length === 0 && changed.length === 0 && removed.length === 0)
    return { lines: [`${file} ${HOOKS_HELD}${old ? ` and no ${old.name} hook` : ''}. Nothing to change.`], write: null };

  const lines = [`${options.apply ? 'Changed' : 'braindog install would change'} ${file}${had ? '' : ', a new file'}:`];
  /*
   * A HOOK IS SHOWN AS A SERVER IS, BY ITS PROGRAM AND A COUNT. Inverting `describe` for servers left this line
   * printing the command whole, so a hook written as `powershell -File C:/Tools/tallybook/hooks/session-start.ps1
   * -Token <key>` put the key on the line. The replace file's `hooks` have already said which script it is, and the
   * event heading the line says which of the two.
   */
  for (const { event, command } of removed) lines.push(`  - hooks.${event}, ${String(old?.name)}'s: ${describe({ command })}`);
  for (const { event, hook } of changed) lines.push(`  ~ hooks.${event}: ${JSON.stringify(hook)}`);
  for (const { event, entry } of added) lines.push(`  + hooks.${event}: ${JSON.stringify(entry)}`);
  for (const { event, entry } of added) next[event] = [...((next[event] as unknown[] | undefined) ?? []), entry];
  return { lines, write: { file, had, value: { ...settings, hooks: next } } };
}

const HIDDEN = '[hidden]';
/**
 * A piece of a word that may itself be a token: a known key prefix, or sixteen characters or more that mix letters
 * and digits, or a run of eight letters and digits with a digit between two letters. Asked now only of the program's
 * own path, the one word `describe` still shows, because a program kept under a folder named for a key is no less a
 * key for being the first word.
 *
 * THE THIRD TEST IS MEASURED: `C:/keys/q7Rw2xT9/node.exe` printed the
 * folder, eight characters and no prefix, since only the first two tests were asked. A digit between two letters is
 * what a key's random characters do and a folder's name does not: `System32`, `Python312`, `v1.0` and `v24.1.0` keep
 * their digits at the end or apart from the letters, and are still shown. ASKED OF THE WHOLE PIECE, NOT OF EACH RUN
 * BETWEEN `-`, `_` AND `.`: split that way, as first written, `q7Rw-2xT9` was two runs of four and printed whole, and
 * the split kept no name shown that the whole piece hides, since a separator already breaks a letter-digit-letter
 * run. A key of letters alone, eight or more, still shows; nothing in a name's shape tells it from a word, which is
 * why `describe` shows no argument at all.
 */
export const looksLikeToken = (piece: string) =>
  /^(?:hb|sk|pk|rk|ghp|gho|ghs|ghu|github_pat|glpat|xox[a-z]|rec|AKIA)[_-]/i.test(piece) ||
  piece.length >= 32 ||
  (piece.length >= 16 && /\d/.test(piece) && /[a-z]/i.test(piece)) ||
  (piece.length >= 8 && /[a-z]\d+[a-z]/i.test(piece));
/*
 * A WORD THAT HOLDS SOMETHING SHAPED LIKE A TOKEN, a path or URL piece by piece. A word that is an absolute filesystem
 * path (it starts at a root and carries no `=`, `?` or `&`) is where a program lives, and a folder in it is named by its
 * place: the hex name of a worktree (`.claude/worktrees/agent-a335206d9257debd9`) has the shape of a key and is none.
 * Its pieces are asked only for an issuer's prefix or a 32-character run, never the shorter mixed-letters-and-digits shape.
 */
export const holdsTokenShape = (word: string): boolean => {
  const onDisk = /^(?:[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(word.replace(/^["']/, '')) && !/[=?&]/.test(word);
  return word.split(/[\\/=:?&"',;\s]+/).some((piece) => piece !== '' && !namesAPlace(piece) && (onDisk ? /^(?:hb|sk|pk|rk|ghp|gho|ghs|ghu|github_pat|glpat|xox[a-z]|rec|AKIA)[_-]/i.test(piece) || piece.length >= 32 : looksLikeToken(piece)));
};
/*
 * A PACKAGE AT A VERSION AND A HOST NAME ARE NOT KEYS, though both mix letters and digits past sixteen characters:
 * `chrome-devtools-mcp@0.20.3` and `aws-mcp.us-east-1.api.aws` were measured flagged as keys in MCP entries that hold
 * none. Each part is still asked on its own, so a token dressed as a name or a label is caught.
 */
const namesAPlace = (piece: string): boolean => {
  const pkg = /^(@?[a-z0-9][a-z0-9._-]*)@(?:\d+(?:\.\d+)*(?:[-+][0-9a-z.-]+)?|latest|next)$/.exec(piece);
  if (pkg) return !looksLikeToken(pkg[1] ?? '');
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(piece) && piece.split('.').every((label) => !looksLikeToken(label));
};
/* Each path segment on its own, so a folder is still named while a token between two slashes is not. */
const hidePieces = (text: string) => text.split(/([\\/])/).map((piece) => (piece === '/' || piece === '\\' || !looksLikeToken(piece) ? piece : HIDDEN)).join('');

/*
 * THE PATH SEGMENTS A URL MAY SHOW ARE NAMED, AND EVERY OTHER ONE IS HIDDEN. It was every segment that did not look
 * like a token, and `https://<the old host>/mcp/tq7Rw2xT9` was measured printed whole: nine
 * characters is no length a shape test can tell from a folder's name. Only the old tool's entries are described, and
 * its endpoint is `/mcp`, so a reader loses nothing by seeing `[hidden]` for the rest while the origin still says
 * whose server it is.
 */
const URL_WORDS = /^(?:|mcp|sse|api|v\d)$/i;

/** A URL as its origin and path, with no query, fragment or sign-in, and every segment but a named one hidden. */
function hideUrl(text: string): string {
  try {
    const url = new URL(text);
    return `${url.origin}${url.pathname
      .split('/')
      .map((piece) => (URL_WORDS.test(piece) ? piece : HIDDEN))
      .join('/')}`;
  } catch {
    return HIDDEN;
  }
}

/**
 * What a server entry runs, to name it by: THE PROGRAM AND HOW MANY ARGUMENTS WERE HIDDEN, NEVER AN ARGUMENT, or for an
 * entry registered by URL, the URL as `hideUrl` shows one. Never `env` or `headers` either, which is where a
 * registration keeps its token.
 *
 * INVERTED FROM A LIST OF SHAPES TO HIDE, because the list had no end. It hid a word after one naming a secret, a
 * word after a short flag, and anything shaped like a token, and one probe after another measured a shape outside the
 * three: `--header X-Brain-Token <value>`, a nine-character token in a URL path, `-t shortpw`, and last
 * `node tallybook-mcp.mjs q7Rw2xT9` and `node tallybook-mcp.mjs --hb q7Rw2xT9`, printed
 * whole on this tree because the token follows no word the rules knew and is too short to look like one. The line is
 * printed under the entry's own name (`mcpServers.<name>`), which is what tells a reader which entry it is, so the
 * arguments were never needed to name it.
 *
 * ONLY `command` IS SPLIT ON WHITESPACE, as an entry that gives its whole command line there needs, and each of `args`
 * is one argument however many spaces it holds. Split whole, `--header 'Authorization: Bearer <key>'` was counted as
 * four. A program path holding a space is counted as a program and one argument more, which says more is hidden than
 * was, and shows nothing.
 *
 * A LEADING `NAME=value` IS AN ASSIGNMENT, NOT THE PROGRAM, and is counted with what is hidden. Measured: taken as the
 * program, `TOKEN=q7Rw2xT9 node tallybook-mcp.mjs` printed `TOKEN=q7Rw2xT9`, a token the
 * word-by-word rules before it had hidden.
 */
function describe(server: Record<string, unknown>): string {
  if (typeof server.url === 'string') return hideUrl(server.url.replace(/^["']+|["']+$/g, ''));
  const words = typeof server.command === 'string' ? server.command.split(/\s+/).filter(Boolean) : [];
  const assigned = words.findIndex((word) => !/^["']?[A-Za-z_][\w]*=/.test(word));
  const [program = '', ...inCommand] = assigned === -1 ? ['', ...words] : [words[assigned] ?? '', ...words.slice(0, assigned), ...words.slice(assigned + 1)];
  const count = inCommand.length + (Array.isArray(server.args) ? server.args.length : 0);
  const shown = hidePieces(program.replace(/^["']+|["']+$/g, ''));
  const hidden = `[${String(count)} argument${count === 1 ? '' : 's'} hidden]`;
  return count === 0 ? shown : shown === '' ? hidden : `${shown} ${hidden}`;
}

/* The command and its arguments split into words, since an entry may give the whole command as one string. */
export const wordsOf = (server: Record<string, unknown>): string[] =>
  [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter((s): s is string => typeof s === 'string').flatMap((s) => s.split(/\s+/).filter(Boolean));

/* One of the old tool's hosts, with or without the trailing dot a fully qualified name may carry. */
export function isOldUrl(text: string, r: Replace): boolean {
  try {
    const url = new URL(text.replace(/^["']+|["']+$/g, ''));
    return (url.protocol === 'https:' || url.protocol === 'http:') && r.hosts.includes(url.hostname.toLowerCase().replace(/\.$/, ''));
  } catch {
    return false;
  }
}

/**
 * An old tool's server: its own `url` on one of the tool's hosts, a program the file names among what it runs, or such a
 * host among its arguments. THE LAST IS A PROXY, `npx -y mcp-remote https://<host>/mcp`, the usual way to reach an HTTP
 * server from a client older than the HTTP transport. Measured before it was looked for, a profile
 * whose only entry of the old tool's was proxied was reported as registering none, and kept it.
 */
export function isOldServer(server: unknown, r: Replace): server is Record<string, unknown> {
  if (!isObject(server)) return false;
  if (typeof server.url === 'string' && isOldUrl(server.url, r)) return true;
  const strings = [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter((s): s is string => typeof s === 'string');
  /*
   * THE WORD, AND WHAT FOLLOWS ITS FIRST `=`. Measured before, `--url=https://<host>/mcp`
   * as one word is no URL to `new URL`, so the entry was kept and never named. Both halves are tried because a URL
   * may carry an `=` of its own in its query.
   */
  return strings.some((s) => r.programs.some((re) => re.test(s))) || wordsOf(server).some((word) => isOldUrl(word, r) || isOldUrl(word.slice(word.indexOf('=') + 1), r));
}

/** An `mcpServers` object without the old tool's entries, each one named in `removed` as it is taken out. */
function withoutOld(servers: unknown, where: string, removed: string[], r: Replace): unknown {
  if (!isObject(servers)) return servers;
  const kept: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(servers)) {
    if (isOldServer(server, r)) removed.push(`  - ${where}mcpServers.${name}, ${r.name}'s: ${describe(server)}`);
    else kept[name] = server;
  }
  return kept;
}

/**
 * BrainDog's server added to the top-level `mcpServers` of a profile's servers file, never a `.mcp.json` (see the
 * header), with the line that says so, and what became of it. AT USER SCOPE EVEN WHEN THE OLD TOOL'S WAS
 * ONLY IN ONE PROJECT'S LOCAL SCOPE, because BrainDog's server reads the folder it runs in, so one registration serves
 * every project, where one per project would be copies to keep in step. A `braindog` entry already there is the
 * person's own and is left exactly as it is, never replaced with this checkout's path.
 */
function withBraindog(next: Record<string, unknown>, lines: string[]): 'added' | 'held' | 'refused' {
  const servers = next.mcpServers ?? {};
  /* Claude Code never writes a list or a string here, and an entry forced into one would be read by nothing. */
  if (!isObject(servers)) return 'refused';
  if ('braindog' in servers) {
    lines.push('  mcpServers.braindog is registered already, and is left as it is.');
    return 'held';
  }
  next.mcpServers = { ...servers, braindog: BRAINDOG_SERVER };
  lines.push(`${ADDS_SERVER}${JSON.stringify(BRAINDOG_SERVER)}`);
  return 'added';
}

/**
 * The git working tree a path sits in, found as git finds one, by a `.git` folder or file in it or any folder above
 * it. A FILE AS WELL AS A FOLDER, because a worktree or a submodule keeps a `.git` file that points elsewhere.
 */
function workingTreeOf(file: string): string | null {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * A `.mcp.json` the person named with `--mcp-json`, its top-level `mcpServers` without the old tool's, and with no
 * server of BrainDog's put in (the header says why). REFUSED INSIDE A
 * GIT WORKING TREE, because there it is shared through the repository and removing an entry removes it for everyone
 * who pulls; refused when it is missing, because a name that finds nothing is a typo, and a cut-over that reports
 * "nothing to change" for a typo leaves the server in. Either refusal is thrown before anything is written.
 */
function planMcpJson(named: string, options: Options): Plan {
  const file = resolve(named);
  if (!basename(file).toLowerCase().endsWith('.json')) throw new Error(`${file} is not a .json file, so braindog install leaves it alone.`);
  const tree = workingTreeOf(file);
  if (tree) throw new Error(`${file} is inside the git working tree at ${tree}, so braindog install leaves it alone: a .mcp.json there is shared through the repository.`);
  if (!existsSync(file)) throw new Error(`There is no ${file}, so braindog install changed nothing. Name the .mcp.json that registers the server.`);
  const config = readObject(file, 'an MCP configuration object');
  const removed: string[] = [];
  const next: Record<string, unknown> = { ...config };
  const old = options.replace;
  if (!old) return { lines: [], write: null };
  if ('mcpServers' in config) next.mcpServers = withoutOld(config.mcpServers, '', removed, old);
  if (removed.length === 0) return { lines: [`${file} registers no ${old.name} MCP server. Nothing to change.`], write: null };
  /* No `withBraindog` here: a new name in this file is only a prompt, as the header says was measured. */
  const lines = [`${options.apply ? 'Changed' : 'braindog install --replace would change'} ${file}:`, ...removed];
  return { lines, write: { file, had: true, value: next } };
}

/**
 * The old tool's servers in one profile's `.claude.json`: user scope in `mcpServers`, and local scope in each
 * `projects[<folder>].mcpServers`, since a server added without `--scope user` lands there. Everything else in the
 * file, which is most of it, is carried through as it was read. BrainDog's server goes in whether or not any came
 * out, and a missing file is made holding only it: see the header for what was measured without.
 */
function planServers(file: string, options: Options): Plan {
  const had = existsSync(file);
  const config = had ? readObject(file, 'a Claude Code configuration object') : {};
  const removed: string[] = [];
  const old = options.replace;
  const name = old?.name ?? 'old';
  const without = (servers: unknown, where: string): unknown => (old ? withoutOld(servers, where, removed, old) : servers);
  const next: Record<string, unknown> = { ...config };
  if ('mcpServers' in config) next.mcpServers = without(config.mcpServers, '');
  if (isObject(config.projects)) {
    const projects: Record<string, unknown> = {};
    for (const [folder, project] of Object.entries(config.projects))
      projects[folder] = isObject(project) && 'mcpServers' in project ? { ...project, mcpServers: without(project.mcpServers, `projects[${JSON.stringify(folder)}].`) } : project;
    next.projects = projects;
  }
  const lines = [`${options.apply ? 'Changed' : 'braindog install --replace would change'} ${file}${had ? '' : ', a new file'}:`, ...removed];
  const braindog = withBraindog(next, lines);
  const serves = braindog !== 'refused';
  if (removed.length === 0 && braindog !== 'added') {
    const why = braindog === 'refused' ? ` Its mcpServers is not an object, so BrainDog's server is not added to it either.` : '';
    return { lines: [`${file} registers no ${name} MCP server. Nothing to change.${why}`], write: null, serves };
  }
  /*
   * THE REASON THAT WAS MEASURED, NOT THE ONE THAT WAS GUESSED. This said each
   * open session rewrites the file, and a session held open across `--apply` did not: no top-level key differed after
   * it exited. What it did do was keep calling the old server 15 s after the install, list the old skill in every
   * request, and answer "No such tool" for BrainDog's, while its hooks were reloaded within seconds. So the line is
   * owed where a server of the old tool's comes out, whether or not the file was there before.
   */
  const close = removed.length > 0 && !options.apply ? [`Close every Claude Code session on this profile before --apply: one left open keeps ${name}'s server and skill until it closes, and goes on writing to ${name} through them.`] : [];
  return { lines: [...lines, ...close], write: { file, had, value: next }, serves };
}

/**
 * THE `description:` OF A SKILL'S FRONT MATTER, AND NOTHING ELSE OF ITS TEXT, with the indented lines that
 * carry it on, or null when there is no front matter or no description in it. Whose skill a folder is, is said by
 * its description: a folder of notes that mentions the old host further down is nobody's skill, and one with no
 * front matter says nothing about whose it is. `doctor` reads skills by this same reader, so the two never disagree.
 */
export function descriptionOf(text: string): string | null {
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

/**
 * The old tool's skills in one profile's `skills/` folder, each set aside under `skills/.replaced/<name>-<date>/`: a
 * folder whose `SKILL.md` names the old tool's host in its description line (`descriptionOf`). MOVED, NEVER DELETED, so the skill is one rename from back if he
 * wants it, and the copy is dated because the cut-over may be run again after a restore.
 *
 * A NAME STARTING WITH A DOT IS NEVER A SKILL HERE, because `.replaced` is this command's own. The skip is said
 * outright, not left to the layout: removed as a mutation, every test stayed green, since the
 * retired `SKILL.md` files sit one level down and `.replaced` has none of its own, so the second run passed it over
 * anyway. The line keeps that true if a skill is ever set aside flat.
 */
function planSkills(skills: string, options: Options): Plan {
  const old = options.replace;
  if (!existsSync(skills)) return { lines: [], write: null };
  const date = new Date().toISOString().slice(0, 10);
  const moves: Move[] = [];
  for (const name of readdirSync(skills).sort()) {
    /* BrainDog's own skill is placed by this command, so it is never the old tool's, whatever its text names. */
    if (name.startsWith('.') || name === 'braindog') continue;
    const from = join(skills, name);
    let text: string;
    try {
      if (!statSync(from).isDirectory()) continue;
      text = readFileSync(join(from, 'SKILL.md'), 'utf8');
    } catch {
      /* No `SKILL.md`, or one that cannot be read: nothing says whose it is, so it is left. */
      continue;
    }
    /* THE DESCRIPTION LINE ONLY: a body or a reference file that mentions the host is somebody's notes. */
    const description = descriptionOf(text)?.toLowerCase();
    if (!old || description === undefined || !old.skills.some((marker) => description.includes(marker.toLowerCase()))) continue;
    let to = join(skills, '.replaced', `${name}-${date}`);
    for (let n = 2; existsSync(to); n++) to = join(skills, '.replaced', `${name}-${date}-${String(n)}`);
    moves.push({ from, to });
  }
  /* Nothing to retire is no line at all: most profiles hold no skill of the old tool's, and a line each would bury the rest. */
  if (moves.length === 0) return { lines: [], write: null };
  const lines = [
    `${options.apply ? 'Changed' : 'braindog install --replace would change'} ${skills}:`,
    ...moves.map((move) => `  - skills/${basename(move.from)}, ${String(old?.name)}'s skill, set aside as skills/.replaced/${basename(move.to)}`),
  ];
  return { lines, write: null, moves };
}

/**
 * BrainDog's Agent Skill in one profile, at `skills/braindog/SKILL.md`: what the record is to an agent, how it
 * connects, and to call context first, so a session that has the server also knows how to use it.
 * OFFERED LIKE EVERYTHING ELSE HERE: the dry run says it would place the file and `--apply` places it, in the same
 * all-or-none write as the profile's settings. A profile already holding this text is no line at all, and one holding
 * an older text gets this one, its copy kept beside it as every file this command changes is.
 */
function planAgentSkill(file: string, options: Options): Plan {
  const text = agentSkill();
  const had = existsSync(file);
  if (had && readFileSync(file, 'utf8') === text) return { lines: [], write: null };
  const lines = [
    `${options.apply ? 'Placed' : 'braindog install would place'} BrainDog's Agent Skill in ${dirname(dirname(dirname(file)))}:`,
    `${PLACES_SKILL}${had ? ', in place of an older copy' : ''}: what BrainDog is to an agent, how it connects, and to call context first.`,
  ];
  return { lines, write: { file, had, value: text } };
}

/* ── hooks or skill older than this build ───────────────────────────────── */

/** A command that runs one of BrainDog's own hooks, whichever event it is for (`isOurs` names the event). */
const OURS_ANY = /braindog-hook\.(?:sh|ps1)["']?\s+[a-z]+\s*$/u;

/** Whether a settings file runs any of BrainDog's own hooks. A file that does not read runs none. */
function runsOurs(file: string): boolean {
  try {
    const settings: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    const lists = isObject(settings) && isObject(settings.hooks) ? Object.values(settings.hooks) : [];
    return lists.some(
      (list) =>
        Array.isArray(list) &&
        list.some((group) => isObject(group) && Array.isArray(group.hooks) && group.hooks.some((h) => isObject(h) && typeof h.command === 'string' && OURS_ANY.test(h.command))),
    );
  } catch {
    return false;
  }
}

/** A profile whose BrainDog hooks or Agent Skill this build would write, and which of the two. */
export type Stale = { dir: string; hooks: boolean; skill: boolean };

/**
 * THE PROFILES WHOSE BRAINDOG HOOKS OR AGENT SKILL ARE NOT THIS BUILD'S, for the start hook's upkeep (`upkeep.ts`): of
 * `profiles`, each that already runs one of BrainDog's hooks and whose `settings.json` or `skills/braindog/SKILL.md` a
 * plain `install --apply` would write. IT ONLY READS. A profile that runs none of BrainDog's hooks is left as it is: it
 * was never set up here, or they were taken out on purpose, or the plugin runs them. One whose settings do not read is
 * left too, for `install` to say what is wrong with it when he runs it.
 */
export function staleProfiles(profiles: readonly string[], scripts: string): Stale[] {
  const options: Options = { apply: false, scripts };
  const out: Stale[] = [];
  for (const dir of profiles) {
    const settings = join(dir, 'settings.json');
    if (!runsOurs(settings)) continue;
    try {
      const hooks = planSettings(settings, options).write !== null;
      const skill = planAgentSkill(join(dir, 'skills', 'braindog', 'SKILL.md'), options).write !== null;
      if (hooks || skill) out.push({ dir, hooks, skill });
    } catch {
      /* Not read as settings: left as it is. */
    }
  }
  return out;
}

/* ── `pack install --force` and `pack uninstall --force` ───────────────────────────────────────── */

/**
 * The usage line for `--force`, for the `pack` usage text to carry beside install and uninstall.
 *
 * WHAT IT LIFTS IS ONE REFUSAL. An update that takes a list away while the list still holds items is `WOULD_ORPHAN`
 * until somebody says to take it, and `--force` is saying so at the terminal, as the plan's press is on the screens: the
 * record retires the list and keeps every item in it, and a version that declares the list again puts it back. Every
 * other refusal (a stale plan, a rename, a type change, a call out nobody approved) stands and prints as it always has.
 */
export const FORCE_USAGE = '--force on addon install or addon uninstall takes away a list that still holds items, keeping every one of them. It lifts that refusal only.';

/**
 * The three record calls the forced commands make, as `@braindog/client` names them. A stand-in in the tests.
 *
 * `retireWithRows` IS THE RECORD'S WORD FOR THE PRESS (`@braindog/declare` `InstallOptions`), sent only under `--force`.
 */
export type PackClient = {
  planPack: (args: { doc: unknown }) => Promise<Result<unknown>>;
  installPack: (args: { doc: unknown; planHash: string; retireWithRows?: boolean }) => Promise<Result<unknown>>;
  uninstallPack: (args: { id: string }) => Promise<Result<unknown>>;
};

/** One list a plan takes away while it holds items (`Diff.removals`), as much of it as the line needs. */
type Removal = { retire: string; name: string; rows: number };

const itemsOf = (n: number): string => (n === 1 ? '1 item' : `${n.toLocaleString('en-GB')} items`);
const joined = (parts: readonly string[]): string => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`);

/** The one line a forced install says: "Forced: Services keeps its 41 items, retired." */
export const forcedLine = (removals: readonly Removal[]): string => `Forced: ${joined(removals.map((r) => `${r.name} keeps its ${itemsOf(r.rows)}`))}, retired.`;

/** `--force` taken out of the arguments, before a `--` and never after it. */
export function takeForce(args: readonly string[]): { force: boolean; rest: string[] } {
  const end = args.indexOf('--');
  const head = end < 0 ? [...args] : args.slice(0, end);
  const tail = end < 0 ? [] : args.slice(end);
  return { force: head.includes('--force'), rest: [...head.filter((a) => a !== '--force'), ...tail] };
}

/* A refusal prints as the other pack commands print one: its sentence, then its code. */
const saidOf = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})`.replace(/\s+/gu, ' ').trim() : 'That was not read.');

const removalsOf = (diff: unknown): Removal[] => {
  const list = (diff as { removals?: unknown } | null)?.removals;
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is Removal => typeof r?.retire === 'string' && typeof r?.name === 'string' && Number.isInteger(r?.rows));
};

/**
 * `braindog addon install <file> [--force]` once the file is read, and `braindog addon uninstall <id> [--force]`, against
 * the record. Answers the exit code.
 *
 * WITHOUT `--force` NOTHING CHANGES: a plan taking a list away from its items is refused `WOULD_ORPHAN` by the record and
 * printed as today. With it, the install says it was pressed (`retireWithRows`) and nothing else is lifted: a refusal
 * that comes back, `WOULD_ORPHAN` included (a record that has not been taught the word, or a field left out under
 * items, which the kernel refuses on its own), prints exactly as it would have.
 *
 * AN UNINSTALL ALREADY KEEPS EVERY ITEM (`@braindog/declare` `uninstall`), and is never `WOULD_ORPHAN`, so `--force` there
 * has nothing to lift; it is taken so the two commands read alike, and the line says what stays where.
 */
export async function forcedPack(
  verb: 'install' | 'uninstall',
  given: { doc: unknown } | { id: string },
  client: PackClient,
  io: Saying & { out: (line: string) => void },
  force = false,
): Promise<number> {
  if (verb === 'uninstall') {
    if (!('id' in given)) return refuse(io, { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Which plugin? Name it by its id.', at: 'id' } }, 'Which plugin? Name it by its id. (REQUIRED_MISSING)');
    const gone = await client.uninstallPack({ id: given.id });
    if (!gone.ok) return refuse(io, gone, saidOf(gone));
    /* The answer keys what stays by the list's id, which is no name to print, so the line says the whole count. */
    const kept = Object.values((gone.value as { rows_kept?: Record<string, number> } | null)?.rows_kept ?? {}).reduce((a, n) => a + (Number.isInteger(n) && n > 0 ? n : 0), 0);
    io.out(`Removed ${given.id}.${kept === 0 ? '' : ` ${kept === 1 ? 'Its 1 item stays' : `Its ${itemsOf(kept)} stay`}, and installing it again puts its lists back.`}`);
    return 0;
  }
  if (!('doc' in given)) return refuse(io, { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Which plugin file?', at: 'doc' } }, 'Which plugin file? (REQUIRED_MISSING)');
  const planned = await client.planPack({ doc: given.doc });
  if (!planned.ok) return refuse(io, planned, saidOf(planned));
  const diff = (planned.value as { diff?: { planHash?: unknown; pack?: { id?: unknown; version?: unknown } } } | null)?.diff;
  if (typeof diff?.planHash !== 'string') {
    io.say('BrainDog answered no plan for this plugin. Read it again with braindog addon install --dry-run.');
    return 1;
  }
  const put = await client.installPack({ doc: given.doc, planHash: diff.planHash, ...(force ? { retireWithRows: true } : {}) });
  if (!put.ok) return refuse(io, put, saidOf(put));
  const removals = removalsOf(diff);
  const what = [diff.pack?.id, diff.pack?.version].filter((p) => typeof p === 'string').join(' ');
  io.out(force && removals.length > 0 ? forcedLine(removals) : `Installed ${what === '' ? 'the plugin' : what}.`);
  return 0;
}
