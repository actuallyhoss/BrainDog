/**
 * `braindog sync inventory [--under <folder>] [--host <host>] [--json]`: what a setup sync would carry from this
 * machine, by name and size, and what it would refuse and why. Nothing is carried yet: this is the list read first.
 *
 * IT CHANGES NOTHING AND OPENS NO FILE IT LISTS. Each is named and sized by `stat` alone, so a transcript, a sign-in
 * and a `.env` are listed without a byte of them read, and the keychain is never asked. The one file it reads is
 * `skills sync`'s lock, and only when the record could not say which skills it holds. In a repository it runs
 * `git status` with the optional locks off, so the index is left as it was, `git rev-list` and `git rev-parse`, and
 * nothing that writes.
 *
 * WHAT IT WOULD CARRY: each profile's auto memory (`projects/<project>/memory/`, and nothing else under `projects/`),
 * the context folder, the programs in `~/.local/bin`, ccenv's shared files, the skills your BrainDog does not hold, and
 * with `--under` the `.env` files git ignores in each repository; and of each repository, the commits on no remote and
 * the changes not committed, which no sync carries and which a person moving machines should know of. WHAT IT WOULD
 * REFUSE, each with why: a sign-in, session transcripts, a plugin cache or any cache, a link, and a file whose name
 * says it may hold a key.
 *
 * A PLAN AND A PRINTER, as `doctor` has. `planInventory` walks the folders it is handed and `printInventory` makes the
 * lines, so a test plants a home and no real one is read.
 *
 * AND WHAT IS SEALED ALREADY, on a machine that has joined setup sync: each machine that has sent a bundle, its newest
 * bundle's time, and the sealed files by count and size, read off the record's list of them (`sealedSeen` in
 * `sync-record.ts`). Nothing sealed is opened, and the sync key is not asked for. The verbs that seal and place are
 * `sync join`, `push`, `pull`, `patches`, `drill` and `retire` (§5.20).
 */

import { execFile } from 'node:child_process';
import { lstatSync, readdirSync, statSync, type Stats } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { oneLine } from './clip.ts';
import { ccenvHome, isFolder, profilesIn, realOf, shown, SKIPPED } from './doctor.ts';
import { recordNames, type RecordNames, type Unread } from './env.ts';
import { isObject, readLock } from './skills.ts';
import type { SealedSeen } from './sync-record.ts';

type Env = Record<string, string | undefined>;

/** What a sync would carry, by group, in the order the lines say them. */
export type Group = 'memory' | 'context' | 'scripts' | 'shared' | 'skills' | 'env';
const GROUPS: readonly Group[] = ['memory', 'context', 'scripts', 'shared', 'skills', 'env'];

/**
 * One thing it would carry: where it is, its size in bytes and how many files, and whether it runs a program. An
 * `.env` file's `path` is inside its repository, which `repo` names.
 */
export type Item = { group: Group; path: string; size: number; files: number; runs: boolean; repo?: string };

/** Why a thing would be refused, each said in fixed words (`WHY`). */
export type Why = 'sign-in' | 'transcripts' | 'plugin-cache' | 'cache' | 'link' | 'secret';

/** One thing it would refuse, and why: its size from `stat`, or `null` for a link, whose size is not what it names. */
export type Refused = { path: string; why: Why; size: number | null; files: number };

/**
 * A repository under `--under`: its commits on no remote and its changes not committed, `null` where git could not
 * say. A linked worktree names the listed checkout it shares its commits with, which says their count once.
 */
export type Repo = { repo: string; worktreeOf: string | null; unpushed: number | null; dirty: number | null };

/**
 * The plan: what it would carry, what it would refuse, each repository, the folders named with `--under`, and where
 * the skills your BrainDog holds were read from, the record or, when it could not be read, this machine's skills lock.
 * On a machine that has joined setup sync, what the record keeps sealed already.
 */
export type Inventory = { items: Item[]; refused: Refused[]; repos: Repo[]; under: string[]; skills: { from: 'record' } | { from: 'lock'; why: Unread }; sealed?: SealedSeen };

/** Git, run in a folder with its arguments: what it printed, or `null` when it failed. */
export type Git = (cwd: string, args: string[]) => Promise<string | null>;

/** Everything the plan is handed. `env` is read for `CCENV_HOME` and `CODEX_HOME` alone. */
export type InventorySeen = { home: string; profiles: string[]; record: RecordNames; env?: Env; under?: string[]; git?: Git };

/** The most entries one measure walks, so a folder of millions is counted that far and no further. */
const MEASURED = 200_000;

/**
 * A path's size in bytes and its number of files, by `stat` alone and never a read. A link at the top is followed, as
 * a profile's `skills` may be one; a link inside is counted as nothing, so a walk never leaves the folder it was given.
 */
function measure(path: string): { size: number; files: number } {
  let size = 0;
  let files = 0;
  let seen = 0;
  const walk = (at: string, top: boolean) => {
    if (seen++ >= MEASURED) return;
    let st: Stats;
    try {
      st = top ? statSync(at) : lstatSync(at);
    } catch {
      return;
    }
    if (st.isFile()) {
      size += st.size;
      files++;
    } else if (st.isDirectory()) for (const name of list(at)) walk(join(at, name), false);
  };
  walk(path, true);
  return { size, files };
}

/** A folder's names in order, none where it cannot be listed. */
const list = (folder: string): string[] => {
  try {
    return readdirSync(folder).sort();
  } catch {
    return [];
  }
};

/** The files a sign-in or a private key is kept in, by name: a refusal list, which the `no-login` gate allows. */
const SIGN_IN_FILE = /^(?:\.?credentials\.json|auth\.json|\.netrc|\.npmrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519))$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;

/**
 * The agent apps' own logins, which nothing BrainDog runs reads, holds or moves: a Claude Code profile's file, Codex's
 * file, the Keychain item Claude Code keeps a profile's login in, and the claude.ai login inside it. The inventory sizes
 * the two files by `stat` alone and refuses them, and the setup sync verbs refuse a path, a file or an item that names
 * any of the four (`carry.ts`, `secret-store.ts`). A refusal list too, and the one place in the command they are named
 * (`tools/gates/no-login.mjs`).
 */
export const SIGN_INS = { profile: '.credentials.json', codex: 'auth.json', keychain: 'Claude Code-credentials', login: 'claudeAiOauth' } as const;
/** Words in a name that say a key may be inside, whatever the file. */
const KEY_WORDS = new Set(['key', 'keys', 'apikey', 'secret', 'secrets', 'password', 'passwords', 'passwd', 'credential', 'credentials']);
/** Words that say the same of a file of data, and not of a program, which handles a sign-in rather than keeping one. */
const SIGN_IN_WORDS = new Set(['auth', 'oauth', 'token', 'tokens', 'cookie', 'cookies']);
/** The endings of a program an interpreter runs, beside a file marked to run. */
const PROGRAM = new Set(['.sh', '.bash', '.zsh', '.fish', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.pl', '.ps1', '.bat', '.cmd']);

const wordsIn = (name: string): string[] => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const runs = (name: string, st: Stats): boolean => PROGRAM.has(extname(name).toLowerCase()) || (st.isFile() && (st.mode & 0o111) !== 0);

/** Why one entry of a folder that is carried would not be, or `null` when it would. A link is never followed. */
function refusal(name: string, st: Stats): Why | null {
  if (st.isSymbolicLink()) return 'link';
  const words = wordsIn(name);
  if (words.includes('cache')) return 'cache';
  if (SIGN_IN_FILE.test(name) || words.some((w) => KEY_WORDS.has(w)) || (!runs(name, st) && words.some((w) => SIGN_IN_WORDS.has(w)))) return 'secret';
  return null;
}

/**
 * One profile's auto memory, each `projects/<project>/memory/` that holds a file, and its session transcripts, each
 * `projects/<project>/*.jsonl` counted by its size from `stat` and refused. Nothing else under `projects/` is looked at.
 */
function memoryOf(dir: string, home: string, items: Item[], refused: Refused[]): void {
  const projects = join(dir, 'projects');
  const transcripts = { size: 0, files: 0 };
  for (const project of list(projects)) {
    const at = join(projects, project);
    const memory = join(at, 'memory');
    if (isFolder(memory)) {
      const m = measure(memory);
      if (m.files > 0) items.push({ group: 'memory', path: shown(memory, home), ...m, runs: false });
    }
    for (const name of list(at)) {
      if (!name.endsWith('.jsonl')) continue;
      try {
        const st = lstatSync(join(at, name));
        if (st.isFile()) {
          transcripts.size += st.size;
          transcripts.files++;
        }
      } catch {
        /* Gone since the folder was listed. */
      }
    }
  }
  if (transcripts.files > 0) refused.push({ path: shown(projects, home), why: 'transcripts', ...transcripts });
}

/** A folder of programs, each entry carried by its name and size or refused with why. A dot file is left out. */
function programsIn(folder: string, group: 'scripts' | 'shared', home: string, items: Item[], refused: Refused[]): void {
  for (const name of list(folder)) {
    if (name.startsWith('.')) continue;
    const at = join(folder, name);
    let st: Stats;
    try {
      st = lstatSync(at);
    } catch {
      continue;
    }
    const why = refusal(name, st);
    if (why === 'link') refused.push({ path: shown(at, home), why, size: null, files: 0 });
    else if (why !== null) refused.push({ path: shown(at, home), why, ...measure(at) });
    else items.push({ group, path: shown(at, home), ...measure(at), runs: runs(name, st) });
  }
}

/**
 * The skills the record holds, by name; or, when it could not be read, the ones `skills sync`'s lock says it wrote,
 * the one file this command reads.
 */
function trackedSkills(record: RecordNames, home: string): Set<string> {
  if (record.read) return new Set(record.skills);
  const names = new Set<string>();
  for (const [path, entry] of Object.entries(readLock(join(home, '.braindog', 'skills-lock.json')) ?? {}))
    if (isObject(entry) && typeof entry.spoken === 'string' && basename(path) === 'SKILL.md') names.add(basename(dirname(path)));
  return names;
}

/** How deep under a folder a repository is looked for: a group of projects, a group in it, a repository. */
const REPO_DEPTH = 3;

/** Every repository under a folder, by its `.git`, to `REPO_DEPTH` folders down. A repository's own folders are not entered. */
export function reposUnder(folder: string, depth: number = REPO_DEPTH): string[] {
  try {
    lstatSync(join(folder, '.git'));
    return [folder];
  } catch {
    /* Not a repository, so its folders are looked in. */
  }
  if (depth === 0) return [];
  return list(folder)
    .filter((name) => !name.startsWith('.') && !SKIPPED.has(name) && isFolder(join(folder, name)))
    .flatMap((name) => reposUnder(join(folder, name), depth - 1));
}

/** Git with the optional locks off, so `status` leaves the index as it was: what it printed, or `null` when it failed. */
export const runGit: Git = (cwd, args) =>
  new Promise((done) => {
    execFile('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, out) => done(error ? null : out));
  });

/** How many repositories git reads at once: a walk of each working tree is most of the wait, and they overlap. */
const AT_ONCE = 8;

/** `f` over every one of `all`, `n` at a time, the answers in their order. `env check` runs its lists the same way. */
export async function eachAtOnce<T, R>(all: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const one = async (): Promise<void> => {
    for (let i = next++; i < all.length; i = next++) out[i] = await f(all[i] as T);
  };
  await Promise.all(Array.from({ length: Math.min(n, all.length) }, one));
  return out;
}

/**
 * One repository: each `.env` file git ignores in it, by its size from `stat`, then its changes not committed and
 * its commits on no remote, and the folder of commits it shares with its other worktrees. `status -z` names each path
 * whole, with a renamed file's old path after its new one.
 */
async function repoOf(repo: string, name: string, git: Git): Promise<{ state: Repo; env: Item[]; common: string | null }> {
  /* Each command as it is typed, a word an argument. */
  const [status = null, counted = null, common = null] = await Promise.all(
    ['status --porcelain=v1 -z --ignored', 'rev-list --count --branches --not --remotes', 'rev-parse --git-common-dir'].map((line) => git(repo, line.split(' '))),
  );
  const env: Item[] = [];
  let dirty: number | null = null;
  if (status !== null) {
    dirty = 0;
    const entries = status.split('\0');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] ?? '';
      if (entry.length < 4) continue;
      const code = entry.slice(0, 2);
      const path = entry.slice(3);
      if (code !== '!!') {
        dirty++;
        if (code.startsWith('R') || code.startsWith('C')) i++;
        continue;
      }
      if (path.endsWith('/') || !basename(path).startsWith('.env')) continue;
      try {
        const st = lstatSync(join(repo, path));
        if (st.isFile()) env.push({ group: 'env', repo: name, path, size: st.size, files: 1, runs: false });
      } catch {
        /* Gone since git listed it. */
      }
    }
  }
  const unpushed = counted !== null && /^\d+\s*$/.test(counted) ? Number(counted.trim()) : null;
  return { state: { repo: name, worktreeOf: null, unpushed, dirty }, env, common: common === null || common.trim() === '' ? null : realOf(resolve(repo, common.trim())) };
}

/**
 * Every repository under the folders, read `AT_ONCE` at a time, and its `.env` files in the same order. A linked
 * worktree (its `.git` a file) is said as one of the listed checkout whose `.git` folder holds its commits.
 */
async function reposIn(under: string[], git: Git): Promise<{ repos: Repo[]; env: Item[] }> {
  const found = under.flatMap((folder) => reposUnder(folder).map((dir) => ({ dir, name: relative(folder, dir) || basename(dir) })));
  const read = await eachAtOnce(found, AT_ONCE, (r) => repoOf(r.dir, r.name, git));
  const checkouts = new Map<string, string>();
  read.forEach((r, i) => {
    const dir = found[i]?.dir ?? '';
    if (r.common !== null && isFolder(join(dir, '.git')) && !checkouts.has(r.common)) checkouts.set(r.common, r.state.repo);
  });
  const repos = read.map((r, i) => {
    const main = r.common === null ? undefined : checkouts.get(r.common);
    return main === undefined || isFolder(join(found[i]?.dir ?? '', '.git')) ? r.state : { ...r.state, worktreeOf: main };
  });
  return { repos, env: read.flatMap((r) => r.env) };
}

/** A sign-in file, by its size from `stat`: never opened, and never carried. */
function signIn(file: string, home: string, refused: Refused[]): void {
  try {
    const st = lstatSync(file);
    if (st.isFile()) refused.push({ path: shown(file, home), why: 'sign-in', size: st.size, files: 1 });
  } catch {
    /* None here. */
  }
}

/**
 * THE PLAN, in the order the lines say it: each profile's memory and transcripts, the context folder, the programs, the
 * shared files, the skills, each repository, then each sign-in and plugin cache. A folder two profiles reach is read
 * once, by where it resolves, since ccenv's profiles link to the default profile's `skills` and `plugins`.
 */
export async function planInventory(seen: InventorySeen): Promise<Inventory> {
  const { home, record } = seen;
  const env = seen.env ?? {};
  const items: Item[] = [];
  const refused: Refused[] = [];
  const read = new Set<string>();
  const once = (path: string): boolean => {
    const real = realOf(path);
    return !read.has(real) && Boolean(read.add(real));
  };
  for (const dir of seen.profiles) if (once(join(dir, 'projects'))) memoryOf(dir, home, items, refused);
  const context = join(home, '.claude', 'context');
  if (isFolder(context)) items.push({ group: 'context', path: shown(context, home), ...measure(context), runs: false });
  programsIn(join(home, '.local', 'bin'), 'scripts', home, items, refused);
  programsIn(join(ccenvHome(home, env), 'shared'), 'shared', home, items, refused);
  const tracked = trackedSkills(record, home);
  for (const dir of seen.profiles) {
    const skills = join(dir, 'skills');
    if (!isFolder(skills) || !once(skills)) continue;
    for (const name of list(skills)) {
      /* `braindog` is the skill `install` places, and a dot folder is where it sets one aside. */
      if (name.startsWith('.') || name === 'braindog' || tracked.has(name) || !isFolder(join(skills, name))) continue;
      items.push({ group: 'skills', path: shown(join(skills, name), home), ...measure(join(skills, name)), runs: false });
    }
  }
  const under = (seen.under ?? []).map((folder) => resolve(folder));
  const { repos, env: ignored } = await reposIn(under, seen.git ?? runGit);
  items.push(...ignored);
  for (const dir of seen.profiles) {
    const credentials = join(dir, SIGN_INS.profile);
    if (once(credentials)) signIn(credentials, home, refused);
    const cache = join(dir, 'plugins', 'cache');
    if (isFolder(cache) && once(cache)) refused.push({ path: shown(cache, home), why: 'plugin-cache', ...measure(cache) });
  }
  signIn(join(env.CODEX_HOME || join(home, '.codex'), SIGN_INS.codex), home, refused);
  return { items, refused, repos, under: under.map((folder) => shown(folder, home)), skills: record.read ? { from: 'record' } : { from: 'lock', why: record.why } };
}

/** A size as a person reads it: bytes, then KB, MB and GB of 1,024, to one place. */
export function sized(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${String(unit === 0 ? n : Math.round(n * 10) / 10)} ${units[unit] ?? 'B'}`;
}

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Names joined as a sentence says them: `a`, `a and b`, `a, b and c`. */
const and = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`);

/** How big a thing is: its size alone for one file, and how many files beside it for a folder or a group of them. */
const howBig = (x: { size: number | null; files: number }, many: boolean): string =>
  many || x.files !== 1 ? `${count(x.files, 'file', 'files')}, ${sized(x.size ?? 0)}` : sized(x.size ?? 0);

const HEADINGS: Record<Group, string> = {
  memory: 'Auto memory:',
  context: 'The context folder:',
  scripts: 'Programs in ~/.local/bin:',
  shared: "ccenv's shared files:",
  skills: 'Skills your BrainDog does not hold:',
  env: '.env files git ignores, by repository:',
};

/* The groups that are folders, said with how many files each holds. */
const FOLDERS = new Set<Group>(['memory', 'context', 'skills']);

const WHY: Record<Why, string> = {
  'sign-in': 'a sign-in, which each machine makes for itself',
  transcripts: 'session transcripts, never read and never carried',
  'plugin-cache': 'a plugin cache, which the app downloads again',
  cache: 'a cache, which is made again',
  link: 'a link, and what it points to is not carried',
  secret: 'its name says it may hold a key, so only its size was read',
};

const LOCK: Record<Unread, string> = {
  'signed-out': "This machine is not signed in to BrainDog, so the skills your BrainDog holds were read from this machine's skills lock.",
  unreachable: "BrainDog did not answer, so the skills your BrainDog holds were read from this machine's skills lock.",
  refused: "BrainDog would not list its skills, so the skills your BrainDog holds were read from this machine's skills lock.",
};

function refusedLine(r: Refused): string {
  const where = oneLine(r.path);
  if (r.why === 'transcripts') return `${where}: ${count(r.files, 'session transcript', 'session transcripts')}, ${sized(r.size ?? 0)}, never read and never carried`;
  return r.size === null ? `${where}: ${WHY[r.why]}` : `${where}: ${howBig(r, r.why === 'plugin-cache')}, ${WHY[r.why]}`;
}

function repoLine(r: Repo): string {
  const pushed =
    r.worktreeOf !== null
      ? `a worktree of ${oneLine(r.worktreeOf)}`
      : r.unpushed === null
        ? 'git could not count its commits'
        : r.unpushed === 0
          ? 'every commit is on a remote'
          : `${count(r.unpushed, 'commit', 'commits')} on no remote`;
  const dirty = r.dirty === null ? 'git could not read its changes' : r.dirty === 0 ? 'nothing to commit' : `${count(r.dirty, 'change', 'changes')} not committed`;
  return `  ${oneLine(r.repo)}: ${pushed}, ${dirty}`;
}

/**
 * The plan as lines: each group under its heading, one line a thing with its size, then the repositories, then what
 * it would refuse and why, then what it would carry in all. A group with nothing in it has no heading.
 */
export function printInventory(inv: Inventory): string[] {
  const lines = ['braindog sync inventory read this machine by name and size, opened no file it lists, and changed nothing.'];
  for (const group of GROUPS) {
    if (group === 'skills' && inv.skills.from === 'lock') lines.push(LOCK[inv.skills.why]);
    const held = inv.items.filter((i) => i.group === group);
    if (held.length === 0) continue;
    lines.push(
      HEADINGS[group],
      ...held.map((i) => (group === 'env' ? `  ${oneLine(i.repo ?? '')}: ${oneLine(i.path)}, ${sized(i.size)}` : `  ${oneLine(i.path)}: ${howBig(i, FOLDERS.has(group))}${i.runs ? ', runs a program' : ''}`)),
    );
  }
  if (inv.under.length === 0) lines.push('No folder was named with --under, so no repository was read.');
  else if (inv.repos.length === 0) lines.push(`No repository was found under ${and(inv.under.map(oneLine))}.`);
  else lines.push(`Repositories under ${and(inv.under.map(oneLine))}:`, ...inv.repos.map(repoLine));
  if (inv.refused.length > 0) lines.push('It would refuse:', ...inv.refused.map((r) => `  ${refusedLine(r)}`));
  const size = inv.items.reduce((sum, i) => sum + i.size, 0);
  const files = inv.items.reduce((sum, i) => sum + i.files, 0);
  const n = inv.refused.length;
  lines.push(`It would carry ${count(files, 'file', 'files')}, ${sized(size)}, and refuse ${n === 1 ? 'one thing' : `${n.toLocaleString('en-US')} things`}.`);
  if (inv.sealed !== undefined) lines.push(...sealedLines(inv.sealed));
  return lines;
}

/** What the record keeps sealed already, as lines: the files in all, then each machine with its newest bundle. */
function sealedLines(s: SealedSeen): string[] {
  const joined = `this machine joined setup sync on ${s.host} as ${oneLine(s.machine)}`;
  if ('unread' in s) return [`Sealed already: ${joined}, and BrainDog did not list what it keeps. ${oneLine(s.unread)}`];
  if (s.machines.length === 0) return [`Sealed already: ${joined}, and no machine has sent a bundle yet. braindog sync push sends this one's.`];
  return [
    `Sealed already: ${joined}. Your BrainDog keeps ${count(s.files, 'sealed file', 'sealed files')}, ${sized(s.size)}, none of them opened here:`,
    ...s.machines.map((m) => `  ${oneLine(m.slug)}: ${count(m.bundles, 'bundle', 'bundles')}, the newest sent ${m.newest.slice(0, 16).replace('T', ' ')} UTC`),
  ];
}

/**
 * What the verb reads beyond its arguments, each a test's to hand in: no real home, environment, record or git then.
 * `sealed` says what setup sync keeps for the record; with none, the inventory says nothing of it.
 */
export type InventoryIo = {
  home?: string;
  env?: Env;
  record?: (host: string | undefined) => Promise<RecordNames>;
  git?: Git;
  sealed?: (host: string | undefined, env: Env, home: string) => Promise<SealedSeen | null>;
};

/**
 * `braindog sync inventory`: its arguments read, the record asked for its skills and the plan made and printed.
 * THROWS ONE SENTENCE for an argument it does not take, before anything is read. It always exits 0: an inventory is
 * an answer, and there is nothing in it to fix.
 */
export async function syncInventory(args: string[], io: InventoryIo = {}): Promise<{ lines: string[]; report: Inventory; json: boolean; code: 0 }> {
  let values: { under?: string[] | undefined; host?: string | undefined; json?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { under: { type: 'string', multiple: true }, host: { type: 'string' }, json: { type: 'boolean' } }, strict: true }));
  } catch {
    throw new Error('braindog sync inventory takes --under <folder>, --host <host> and --json, and nothing else.');
  }
  const home = io.home ?? homedir();
  const env = io.env ?? process.env;
  const record = await (io.record ?? ((host: string | undefined) => recordNames(host, env, { tools: false })))(values.host);
  const plan = await planInventory({ home, profiles: profilesIn(home, [], env), record, env, under: values.under ?? [], git: io.git ?? runGit });
  const sealed = io.sealed === undefined ? null : await io.sealed(values.host, env, home);
  const report: Inventory = sealed === null ? plan : { ...plan, sealed };
  return { lines: printInventory(report), report, json: values.json === true, code: 0 };
}

/** The verbs of `braindog sync` that seal and place, each a command of its own (`main.ts`); `inventory` reads. */
export const SYNC_VERBS: readonly string[] = ['join', 'push', 'pull', 'patches', 'drill', 'retire'];

/** `braindog sync inventory`, the one verb of `sync` that only reads. */
export async function syncCommand(args: string[], io: InventoryIo = {}): ReturnType<typeof syncInventory> {
  const [verb, ...rest] = args;
  if (verb !== 'inventory') throw new Error('braindog sync takes inventory, join, push, pull, patches, drill or retire, as in braindog sync inventory.');
  return syncInventory(rest, io);
}
