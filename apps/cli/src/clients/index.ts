/**
 * The apps an agent works in, as one table (AGT-A07, AGT-D10, AGT-D11). Each client says whether it is on this
 * machine, where it keeps its servers for a person and for a repository, how to read them, and how to write the
 * record's tools into them. `tools.ts` and `setup.ts` go through the table and know no app's files of their own.
 *
 * CLAUDE CODE, CODEX AND CURSOR FOR NOW. The others (VS Code, Claude Desktop, Windsurf, `others.ts`, still to come)
 * join as one file each beside `claude.ts`, once their paths and formats are read from a real install and their own
 * documents, never guessed.
 *
 * IMPORT THIS FILE, NEVER A CLIENT'S OWN. A client module calls the machine helpers below, and this file builds the
 * table from the client modules, so each imports the other. Entered here, each client is evaluated first and calls
 * the helpers only later, from inside its functions. Entered at a client, this file would run first and meet the
 * client not yet made. So what a caller needs of a client's own, such as Claude Code's runner, is re-exported here.
 */

import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { cursor } from './cursor.ts';

export { claude, runClaude, type ClaudeRunner } from './claude.ts';
export { codex } from './codex.ts';
export { cursor } from './cursor.ts';

export type Env = Record<string, string | undefined>;

/** Where a write goes: the person's own servers, or this repository's. */
export type Scope = 'user' | 'project';

/**
 * One place a client keeps servers, as read. `servers` is the `mcpServers`-shaped object found there, or `undefined`
 * when there is none; `fault` is the one sentence saying why the place could not be read. `writes` is the scope a
 * write to this same place goes to, or `null` when the client never writes there.
 */
export type ServerSet = { scope: 'global' | 'project'; source: string; writes: Scope | null; servers: unknown; fault: string | null };

/** One entry to write: what the record renders for a tool, and whether it replaces the entry there. */
export type Want = { name: string; scope: Scope; entry: Record<string, unknown>; replace: boolean; home: string; top: string | null; cwd: string };

/** What a write would do, decided and said before anything is written. */
export type Plan = { want: Want; file: string | null; lines: string[] };

/** What a write did: its lines, whether the entry is now in, and whether nothing more can be applied this run. */
export type Applied = { lines: string[]; written: boolean; stop: boolean };

/** Run the client's own program with these arguments in this folder: its exit code, or -1 when it did not start. */
export type Runner = (args: string[], cwd: string) => Promise<number>;

export type Client = {
  id: string;
  /** The app's name, as a person reads it. */
  title: string;
  /** Whether this app is on this machine. */
  found(home: string, env: Env): boolean;
  /** The reader: every place it keeps servers for this home and repository, in precedence order, later ones winning. */
  servers(home: string, top: string | null, cwd?: string): ServerSet[];
  /** The lines a write would make, writing nothing. */
  plan(want: Want): Plan;
  /** The write. `copied` holds the files already copied aside this run, so each is copied once, before its first change. */
  apply(plan: Plan, o: { run: Runner; copied: Set<string> }): Promise<Applied>;
  /** The command that takes an entry out by hand. */
  remove(name: string, scope: Scope): string;
  /** BrainDog's own entry for this app, as setup writes it, when the app names it its own way. */
  server?: Record<string, unknown>;
};

/** The table. */
export const CLIENTS: readonly Client[] = [claude, codex, cursor];

/** The client whose entries `braindog tools write` writes when none is named. */
export const DEFAULT_CLIENT = claude.id;

export const clientOf = (id: string): Client | undefined => CLIENTS.find((c) => c.id === id);

/* ── this machine ──────────────────────────────────────────────────────── */

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether a program can run here: a name found on the path (with Windows' own endings there), or a path that is a
 * file. A relative path is taken from the folder the client runs it in.
 */
export function onPath(program: string, env: Env, platform: string = process.platform, cwd: string = process.cwd()): boolean {
  if (program.trim() === '') return false;
  const win = platform === 'win32';
  const endings = win ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((x) => x !== '')] : [''];
  if (/[\\/]/.test(program)) return endings.some((x) => isFile(resolve(cwd, program + x)));
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter((d) => d !== '');
  return dirs.some((d) => endings.some((x) => isFile(join(d, program + x))));
}

/**
 * Whether a path belongs to another system: `windows` for a drive letter or a network share on a machine without
 * them, `home` for the home folders of another system (`/Users/<name>` off a Mac, `/home/<name>` on a Mac or on
 * Windows) that are not here. `null` for anything else, a bare name included.
 */
export function foreignPath(text: string, platform: string = process.platform): 'windows' | 'home' | null {
  const win = platform === 'win32';
  if (!win && (/^[A-Za-z]:[\\/]/.test(text) || /^\\\\[^\\]/.test(text))) return 'windows';
  const home = platform === 'darwin' ? /^\/home\/[^/]+/ : win ? /^\/(?:Users|home)\/[^/]+/ : /^\/Users\/[^/]+/;
  const at = home.exec(text);
  if (at === null) return null;
  try {
    statSync(at[0]);
    return null;
  } catch {
    return 'home';
  }
}
