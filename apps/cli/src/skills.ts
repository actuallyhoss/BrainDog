/**
 * `braindog skills sync`: the record's skills written to the folders Claude Code reads them from, and a local
 * edit sent back as a proposal.
 *
 * THE RECORD WRITES FILES, AND A LOCAL EDIT IS NEVER OVERWRITTEN. A file is written only when it is unchanged since
 * the last sync, which the lock file at `~/.braindog/skills-lock.json` says: keyed by the file's absolute path, it
 * holds the row's spoken id, the version written, and the SHA-256 of what was written. An edited file is kept, and
 * its text is proposed as the next version once per file hash.
 *
 * A NAME IS A FOLDER NAME OR NOTHING. `^[a-z0-9][a-z0-9-]{0,63}$`, and the path it resolves to must stay inside the
 * skills folder, or nothing is written.
 *
 * A FILE WRITTEN INTO A REPOSITORY IS REPORTED, NEVER COMMITTED (question 13). Its path goes into that repository's own
 * `.git/info/exclude`, once, unless git ignores it already: never `.gitignore`, which is itself committed. A file git
 * already tracks is somebody's committed skill, so it is not written and the sync says so.
 *
 * THE WHOLE LIST, NOT THE TWENTY `context` SHOWS. When `context` says it cut the skills short, the rest are read by the
 * list read a page at a time, the session's project first, inside a budget. When the budget ends, what was read is acted
 * on and the rest waits for the next sync; a file is registered only once every name the record holds has been read.
 *
 * A NAME WITHIN ITS SCOPE IS THE SKILL. A file whose name a skill of that scope holds is that skill's file, never a new
 * row, and a project's file named as a global skill is the project's own.
 *
 * A SKILL THAT RUNS SOMETHING IS A PROGRAM, NOT DATA. Claude Code runs `` !`command` `` lines and a fenced ```` ```! ````
 * block when a skill loads, a `hooks` block in its front matter while it is active, and `allowed-tools` lifts the question
 * a person would otherwise be asked. A row of the record could put any of them on every machine at its next session
 * start, so such a text is written only once a person at this machine has read it and said yes at `braindog skills sync`,
 * pinned by its hash as `env apply` pins a tool (`pins.ts`), so a changed one is asked about again. No terminal and no
 * yes leaves it out and says so; `--yes` is the yes to keeping skills in step, and never this one.
 *
 * WHAT THE SESSION MAY CREATE IS WHERE ITS RUN IS. An agent's create lands in its run's project, so a file found in
 * the global folder is registered only from a run in no project, and a project's file only from a run in that
 * project.
 */

import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { Brief, Client, Context } from '@braindog/client';
import { refused, type Result } from '@braindog/ports';

import { unbom } from './unbom.ts';
import { clip } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { allowSkills, askAtTerminal, refuseSkills, skillsAllowed } from './skills-consent.ts';
import { refuse, type Answering } from './json.ts';
import { decideLink } from './links.ts';
import { git } from './position.ts';

type Env = Record<string, string | undefined>;

/* ── shared with tools.ts ──────────────────────────────────────────────── */

export const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A path as two runs compare it: forward slashes, no trailing slash, and a drive letter's case ignored. */
export const samePath = (path: string): string => {
  const slashed = resolve(path).replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed;
};

/** A lock file's object, `{}` when there is none, or `null` when it is there and is not one. */
export function readLock(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Written whole and renamed, at 0600 in a folder made at 0700, as the hosts file is. */
export function writeLock(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
}

/** What `skills` and `tools` need from their process, passed in so a test can hold all of it. */
export type AgentIo = {
  env: Env;
  cwd: string;
  /** The folder `~/.braindog`, `~/.claude` and `~/.claude.json` are under. */
  home: string;
  /** One line to stdout. */
  out: (line: string) => void;
  /** One line to stderr. */
  say: (line: string) => void;
  /** The session headers for a host, naming the run this folder is in when it is in one. */
  headers: (host: string) => Promise<Record<string, string>>;
  /**
   * Under `--json`, where the machine-readable half of the answer goes (`json.ts`).
   *
   * OPTIONAL, because in human mode there is nobody to hand it to and every test that builds an
   * `AgentIo` by hand would otherwise have to carry a sink it does not read.
   */
  answer?: Answering | undefined;
  /** The name this machine goes by, when a test gives one; otherwise `braindog context` works it out (`deviceName`). */
  device?: string | undefined;
};

/**
 * The machine as a question to the owner names it: "this Mac", "this PC" or "this machine". Never its network name,
 * which is what `hostname()` answers and what a question once said ("on Maras-MacBook-Pro.local"). The name itself
 * goes in the proposal's details.
 */
export const thisMachine = (platform: string = process.platform): string => (platform === 'darwin' ? 'this Mac' : platform === 'win32' ? 'this PC' : 'this machine');

/**
 * A question of at most 80 characters with a name inside it, the name cut to make room. The owner reads it on a
 * phone, where a longer one wraps to a second line.
 */
export const QUESTION = 80;
export const asking = (before: string, name: string, after: string): string => `${before}${clip(name, Math.max(8, QUESTION - before.length - after.length))}${after}`;

export type Connected = { to: Target; client: Client; context: Context; top: string | null };

/** The host, a client, where this folder stands, and its repository's top folder; or the exit code when there is none. */
export async function connect(host: string | undefined, io: AgentIo): Promise<Connected | number> {
  let to: Target;
  try {
    to = target(host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  /* Three calls' worth, because one command makes several requests and a hung host must still end it. */
  const client = clientFor(to, async () => headers, AbortSignal.timeout(budgetOf(io.env) * 3));
  const answer = await client.context();
  if (!answer.ok) {
    const code = refused(answer) ? answer.refusal.code : '';
    /* The exit code stays the one this call has always returned: `context` is a read, so the third
       arm is unreachable here and `refuse`'s conflict code would be a 2 nobody can produce. */
    refuse(io, answer, code === 'UNREACHABLE' ? `${to.key} did not answer.` : refused(answer) ? answer.refusal.fix : `${to.key} did not give this folder's context.`);
    return code === 'UNREACHABLE' ? 3 : 1;
  }
  const top = await git(io.cwd, 'rev-parse', '--show-toplevel');
  return { to, client, context: answer.value, top: top === null ? null : resolve(top) };
}

/** Thrown when the host stops answering part way, so the run stops rather than reading every row as missing. */
export class Stopped extends Error {}

/** A result's value, `null` for a refusal, and `Stopped` for a host that did not answer. */
export function valueOf<T>(r: Result<T>): T | null {
  if (r.ok) return r.value;
  if (refused(r) && r.refusal.code === 'UNREACHABLE') throw new Stopped('unreachable');
  return null;
}

/** The fix sentence of a refusal, or a fixed one. Never an exception's message, which could quote anything. */
export const fixOf = (r: Result<unknown>): string => (refused(r) ? r.refusal.fix : 'BrainDog did not take it.');

/**
 * Why a create added no row, in words (AK20): the refusal's fix, or, for an answer that filed a question in its place,
 * that it was asked and where. "BrainDog did not take it." said neither.
 */
function notTaken(out: Result<unknown>): string {
  if (!out.ok) return fixOf(out);
  const v = isObject(out.value) ? out.value : {};
  if (typeof v.said === 'string' && v.said.trim() !== '') return v.said.trim();
  const id = typeof v.id === 'string' ? v.id : typeof v.suggestion === 'string' ? v.suggestion : null;
  if (id !== null && /^SG[1-9][0-9]*$/u.test(id)) return `it was asked about in Needs you (${id}) rather than added.`;
  return 'BrainDog answered without adding it and gave no reason. Run braindog skills sync again, and if it says the same, add the skill in the app.';
}

/**
 * A COPY OF `packages/kernel/src/cause.ts`'s `CAUSE`, because the command line is bundled without the kernel: a letter or
 * digit, then at most 199 of letters, digits and `# @ . _ : / -`. A key outside it is left off, so the record derives one
 * rather than refusing the whole question for its key.
 */
const CAUSE = /^[\p{L}\p{N}][\p{L}\p{N}#@._:/-]{0,199}$/u;

/** `{ cause }` for a `propose`, so a question the command line asks is asked once; nothing for a key out of shape. */
export const causeOf = (key: string): { cause?: string } => (CAUSE.test(key) ? { cause: key } : {});

/**
 * The record's own sentence when a `propose` joined a question already open ("Already waiting as SG90."), or `null`
 * when it filed a new one. An older record that answers no `said` is told in the same words without the name.
 */
export const joinedSaid = (value: unknown): string | null =>
  isObject(value) && value.joined === true ? (typeof value.said === 'string' && value.said.trim() !== '' ? value.said.trim() : 'Already waiting.') : null;

/** The spoken id a created row is read back by. */
export const spokenOf = (value: unknown): string | null =>
  isObject(value) && typeof value.register === 'string' && typeof value.seq === 'number' ? `${value.register}#${String(value.seq)}` : null;

/* ── the skills ────────────────────────────────────────────────────────── */

export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * One lock entry. `proposed_sha` is the file hash already acted on: proposed, found unmanaged, or reported. `host` is
 * the record it names a row of, by the host's key; an entry with none is from before hosts were kept, and is read as
 * the syncing host's.
 */
export type LockEntry = { spoken: string | null; version: number; sha256: string; proposed_sha?: string; host?: string };

/**
 * Whether a lock path is one this system could hold: a drive-letter path off Windows, or a rooted path on Windows that
 * names no drive, is another machine's (a lock carried over from a Windows PC held 24 `C:\Users\…` entries).
 */
export const foreignLockPath = (path: string, platform: string = process.platform): boolean =>
  platform === 'win32' ? path.startsWith('/') : /^[A-Za-z]:[\\/]/u.test(path) || path.startsWith('\\\\');

type Kind = 'skill' | 'command';

/**
 * Where a skill of this kind and name is written under a `.claude` folder, or `null` when the name may not be a
 * folder's or the path would leave the skills folder.
 */
export function skillPath(base: string, kind: Kind, name: string): string | null {
  if (!SKILL_NAME.test(name)) return null;
  const folder = resolve(base, kind === 'command' ? 'commands' : 'skills');
  const file = kind === 'command' ? resolve(folder, `${name}.md`) : resolve(folder, name, 'SKILL.md');
  return file.startsWith(folder + sep) ? file : null;
}

const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
};

/**
 * The file a skill's text becomes. A skill Claude Code reads needs its name and description at the top, so a body
 * without them gets them from the row; a body that already starts with its own is written as it is, and so is a
 * command.
 */
export function render(kind: Kind, name: string, trigger: string, body: string): string {
  if (kind !== 'skill' || body.startsWith('---')) return body;
  /* A trigger the old reader stored as ">" is no description; the body's first line says more than that does. */
  const said = BLOCK.test(trigger.trim()) ? triggerOf(body, kind) : trigger;
  return `---\nname: ${name}\ndescription: ${JSON.stringify(oneLine(said, 400))}\n---\n\n${body}`;
}

/* A YAML block scalar's header: `>` folds the lines below it and `|` keeps them, each with an optional chomping sign
   and indent, in either order. On its own, as a trigger, it is what the old reader stored. */
const BLOCK = /^[>|](?:[1-9][+-]?|[+-][1-9]?)?$/u;

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---/u;

/* A comment ends a plain YAML value where `#` follows a space, so "for C# projects" keeps its `#`. */
const uncommented = (line: string): string => line.replace(/(^|\s)#.*$/u, '').trim();

const joined = (parts: string[]): string | undefined => parts.filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim() || undefined;

/**
 * A skill's `description`, as one line, from the frontmatter between its `---` lines: a plain or quoted value on the
 * key's line or running onto the indented lines below it, or a folded (`>`) or literal (`|`) block. `undefined` when
 * there is none.
 *
 * IT WAS READ AS THE REST OF THE KEY'S LINE, so `description: >` with its text on the lines below was stored as the
 * trigger ">". Six of the owner's skills named themselves ">" that way, in `context`, the briefing and the Agents page.
 * Both kinds of block come out as one line, because a trigger is one sentence either way.
 */
export function describedIn(frontmatter: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/u);
  const at = lines.findIndex((l) => /^description\s*:(?:\s|$)/u.test(l));
  if (at < 0) return undefined;
  const first = lines[at]!.replace(/^description\s*:/u, '').trim();
  /* The value goes on while the lines below are indented or empty, and stops at the next key. */
  const below: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== '' && !/^\s/u.test(line)) break;
    below.push(line.trim());
  }
  if (BLOCK.test(uncommented(first))) return joined(below);
  const quote = first[0];
  if (quote === '"' || quote === "'") {
    const whole = [first, ...below].filter(Boolean).join(' ');
    const closed = quote === '"' ? /^"((?:[^"\\]|\\.)*)"/su.exec(whole) : /^'((?:[^']|'')*)'/su.exec(whole);
    if (!closed) return joined([whole.slice(1)]);
    return joined([quote === '"' ? closed[1]!.replace(/\\(.)/gsu, (_, c: string) => (c === 'n' || c === 't' ? ' ' : c)) : closed[1]!.replaceAll("''", "'")]);
  }
  return joined([first, ...below].map(uncommented));
}

/** A frontmatter description that says something: not missing, and not a block header standing alone. */
function describedAs(text: string): string | undefined {
  const head = FRONT.exec(text);
  const described = head ? describedIn(head[1] ?? '') : undefined;
  return described !== undefined && !BLOCK.test(described) ? oneLine(described, 380) : undefined;
}

/** The sentence a file found by hand is registered with: its description, else its first line, else where it is. */
function triggerOf(text: string, kind: Kind): string {
  const described = describedAs(text);
  if (described) return described;
  const head = FRONT.exec(text);
  const rest = head ? text.slice(head[0].length) : text;
  const first = rest.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean);
  return first ? oneLine(first, 380) : `A ${kind} kept by hand.`;
}

/** The skill files under a `.claude` folder: `skills/<name>/SKILL.md` and `commands/<name>.md`, by valid name. */
/** The folder BrainDog's own Agent Skill is placed in under a profile's `skills/` (`install.ts`). */
const OWN_SKILL = 'braindog';

function filesIn(base: string): { path: string; name: string; kind: Kind }[] {
  const out: { path: string; name: string; kind: Kind }[] = [];
  const list = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  for (const d of list(join(base, 'skills'))) {
    /* BRAINDOG'S OWN AGENT SKILL IS NOT ONE OF THE PERSON'S (audit 31 Oct k, AK20): `setup` places it in every profile's
       `skills/braindog/`, and the plan then offered to copy it into the record, where it was not taken. It ships with
       the command and is never copied up. */
    if (d.name === OWN_SKILL) continue;
    const path = d.isDirectory() ? skillPath(base, 'skill', d.name) : null;
    if (path !== null && existsSync(path)) out.push({ path, name: d.name, kind: 'skill' });
  }
  for (const f of list(join(base, 'commands'))) {
    const name = f.name.replace(/\.md$/, '');
    const path = f.isFile() && f.name.endsWith('.md') ? skillPath(base, 'command', name) : null;
    if (path !== null) out.push({ path, name, kind: 'command' });
  }
  return out;
}

/**
 * Whether every folder from `top` down to `path`, and `path` itself, is what it says and no link: `false` when one is a
 * symbolic link, which in a repository somebody else wrote could point the write anywhere on this machine.
 */
export function linkFree(top: string, path: string): boolean {
  const rel = relative(resolve(top), resolve(path));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
  let at = resolve(top);
  for (const part of rel.split(sep)) {
    at = join(at, part);
    try {
      if (lstatSync(at).isSymbolicLink()) return false;
    } catch {
      return true;
    }
  }
  return true;
}

/**
 * Written whole and renamed, so a failed write never leaves half a skill; `false` when a link under `top` would have
 * carried it out of the folder, and nothing was written.
 *
 * THE TEMPORARY FILE IS NEW AND NAMED AT RANDOM, opened so it must not exist and is never a link followed. A fixed
 * `<name>.md.tmp` was a name a repository could plant as a link, and the write went wherever it pointed.
 */
function writeText(path: string, text: string, top: string | null): boolean {
  if (top !== null && !linkFree(top, path)) return false;
  if (top !== null) {
    let at = resolve(top);
    for (const part of relative(at, dirname(resolve(path))).split(sep).filter((p) => p !== '')) {
      at = join(at, part);
      if (!existsSync(at)) mkdirSync(at);
    }
  } else mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  return true;
}

/** Whether a skill's text runs something by itself once it is on this machine (see the top). */
export function skillRuns(text: string): boolean {
  const front = FRONT.exec(text)?.[1] ?? '';
  return /^(?:hooks|allowed-tools|allowedTools)\s*:/mu.test(front) || /!`[^`\n]+`/u.test(text) || /^\s*```+!/mu.test(text);
}

/** How many skills one page of the list read asks for: under the hundred a long read has been cut at. */
const PAGE = 50;

/** The most pages one pass reads, so a host whose cursor never ends cannot hold the sync. */
const PAGES = 40;

/**
 * How long the list read may take when the caller names no end: half of the three seconds a session's start gives the
 * whole sync (`START_WORK_MS` in `hooks.ts`), so there is time left to act on what was read.
 */
export const READ_MS = 1_500;

/** What a lock entry's `proposed_sha` holds for a file git tracks and the folder does not have: said once, not each sync. */
const TRACKED = 'tracked';

/** A path as git names it inside `top`, with forward slashes, or `null` when it is not inside. */
function within(top: string, path: string): string | null {
  const rel = relative(top, path);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : rel.split(sep).join('/');
}

/**
 * Each of these paths git does not already ignore, appended once to the repository's own `.git/info/exclude`.
 *
 * NOT `.gitignore`, which is committed and would put the person's own skills in everybody's checkout. `--git-path` is
 * asked for where the file is, because a linked work tree keeps it in the repository it came from.
 */
async function keepOut(top: string, paths: string[]): Promise<void> {
  const rels = paths.map((p) => within(top, p)).filter((r): r is string => r !== null);
  if (rels.length === 0) return;
  const at = await git(top, 'rev-parse', '--git-path', 'info/exclude');
  if (at === null) return;
  const ignored = new Set(((await git(top, 'check-ignore', '--', ...rels)) ?? '').split(/\r?\n/u));
  const file = resolve(top, at);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const held = new Set(text.split(/\r?\n/u));
  /* Anchored at the top folder, so it names this file and no other of the same name deeper in. */
  const fresh = [...new Set(rels.filter((r) => !ignored.has(r)).map((r) => `/${r}`))].filter((l) => !held.has(l));
  if (fresh.length === 0) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${fresh.join('\n')}\n`);
}

export type SkillSync = {
  client: Client;
  context: Context;
  /** The folder `.braindog` is under. */
  home: string;
  /** `CLAUDE_CONFIG_DIR`, or `~/.claude`: where global skills go. */
  configDir: string;
  /** The repository's top folder, or `null` outside one. */
  top: string | null;
  dryRun: boolean;
  machine?: string;
  /** When the list read stops, on `clock`: `READ_MS` from now when absent, and `Infinity` for a sync run by hand. */
  until?: number;
  /** The time in milliseconds, asked once before each page of the list read; `Date.now` when absent. */
  clock?: () => number;
  /**
   * The host the record is reached at, whose key names it (`target`), so a question the sync files is printed with the
   * link that opens it on Decide. Without it, or for a host that names no record, the line says its handle.
   */
  to?: Pick<Target, 'key'> | undefined;
  /**
   * The skills, by spoken id, this profile is not handed (`env apply`, by their profiles field). Each is still the
   * record's, so a file of its name here is never registered as a new one; it is only not written or updated.
   */
  leave?: ReadonlySet<string> | undefined;
  /**
   * Whether anything of this machine's may go up: a skill kept by hand registered, a local edit proposed, a description
   * read back from a file. `false` writes the record's skills down and sends nothing, and says once how many were held
   * back. True when absent, for `braindog skills sync` after its yes (`skills-consent.ts`).
   */
  upload?: boolean | undefined;
  /** Filled with the names of what was (or, in a dry run, would be) copied each way, for the question before a yes. */
  tally?: Tally | undefined;
  /** Filled with each skill left out because it runs something and nobody here has said yes to it (`skillRuns`). */
  held?: { name: string; text: string }[] | undefined;
};

/** What a sync copied, or would copy, by skill name: up into the record, edits proposed, down into a folder, deleted. */
export type Tally = { up: string[]; edits: string[]; down: string[]; gone: string[] };

type Got = { kind: Kind; text: string; managed: boolean; state: string | null; name: unknown };

/**
 * Sync once, and the lines that say what happened: one per file written, deleted, kept, proposed or registered.
 * Nothing at all when the record has no skills register.
 */
export async function syncSkills(s: SkillSync): Promise<string[]> {
  const reg = s.context.registers.find((r) => r.id === 'skills');
  if (!reg) return [];
  const lockFile = join(s.home, '.braindog', 'skills-lock.json');
  const held = readLock(lockFile);
  if (held === null) return [`${lockFile} is not valid JSON, so skills were not synced. Delete it and sync again.`];
  /* ONE LOCK FILE, MANY RECORDS: a sync against another host (a seed host a check started, a copy of the record) wrote
     its own row numbers into the same file, so on his Mac 44 entries named skills#39 to #82, which his record never had,
     and every sync said "the lock pointed at another row" of each. An entry now says its host: another host's is kept
     as it is and never read here, and one for a path this system cannot hold is dropped. */
  const host = s.to?.key ?? null;
  const lock: Record<string, LockEntry> = {};
  const others: Record<string, LockEntry> = {};
  for (const [path, e] of Object.entries(held)) {
    if (!isObject(e) || !(typeof e.spoken === 'string' || e.spoken === null) || typeof e.version !== 'number' || typeof e.sha256 !== 'string') continue;
    if (foreignLockPath(path)) continue;
    const entry: LockEntry = { spoken: e.spoken, version: e.version, sha256: e.sha256, ...(typeof e.proposed_sha === 'string' ? { proposed_sha: e.proposed_sha } : {}), ...(typeof e.host === 'string' ? { host: e.host } : {}) };
    if (host !== null && entry.host !== undefined && entry.host !== host) others[path] = entry;
    else lock[path] = entry;
  }

  const lines: string[] = [];
  /* What this machine holds that a sync with no yes kept back: skills kept by hand, and edits made here. */
  let keptBack = 0;
  const machine = s.machine ?? hostname();
  const projectBase = s.top !== null && s.context.project !== null ? join(s.top, '.claude') : null;
  const bases = [s.configDir, ...(projectBase === null ? [] : [projectBase])];
  const folders = bases.flatMap((b) => [resolve(b, 'skills'), resolve(b, 'commands')]);
  const inside = (path: string, base: string) => [resolve(base, 'skills'), resolve(base, 'commands')].some((f) => resolve(path).startsWith(f + sep));
  const nameAt = (path: string) => (path.endsWith('SKILL.md') ? basename(dirname(path)) : basename(path, '.md'));
  const synced = (path: string) => folders.some((f) => resolve(path).startsWith(f + sep));
  const where = (path: string) => (projectBase !== null && inside(path, projectBase) ? `${path} (in the repository, not committed)` : path);
  const tell = (done: string, would: string) => lines.push(s.dryRun ? would : done);
  /* THE LINK TO THE QUESTION, NOT ITS HANDLE ALONE: what the person opens to answer it, as an add-on install
     prints (`untilAccepted`), wherever the host names the record. */
  const link = (id: string): string | null => (s.to === undefined ? null : decideLink(s.to, id));
  /* A PROPOSAL THE RECORD REFUSED HAS NO QUESTION TO LINK TO, and says the record's fix as it always did. A host that
     names no record says the question's handle, which is how Decide lists it. */
  const onDecide = (asked: { filed: boolean; said: string }): string => {
    const at = asked.filed ? link(asked.said) : null;
    return at === null ? ` (${asked.said}).` : `: ${at}`;
  };
  const joinedAt = (joined: string, id: string): string => {
    const at = link(id);
    return at === null ? joined : `${joined} ${at}`;
  };

  const fetchRow = async (spoken: string, name: string, trigger: string): Promise<Got | null> => {
    const seq = Number(spoken.slice(spoken.indexOf('#') + 1));
    if (!spoken.startsWith('skills#') || !Number.isInteger(seq)) return null;
    const row = valueOf(await s.client.get('skills', seq));
    if (!isObject(row) || !isObject(row.fields) || typeof row.fields.body !== 'string') return null;
    const kind: Kind = row.fields.kind === 'command' ? 'command' : 'skill';
    return { kind, text: render(kind, name, trigger, row.fields.body), managed: row.fields.managed !== false, state: typeof row.state === 'string' ? row.state : null, name: row.fields.name };
  };

  /* THE QUESTION NAMES THE SKILL AND "THIS MAC", AND THE DETAILS SAY WHERE. It read "Take the edit to kiln-release made
     on Maras-MacBook-Pro.local as version 2?"; the file and the machine's own name are kept in the body's details. */
  /* ASKED ONCE: the cause is the skill, where it lives, its row and a hash of the edit, so the same edit synced
     on a second machine joins the question already open instead of opening another, and the line says the record's own
     sentence, not a new id. THE ROW AND THE HASH KEEP IT EXACT: two projects each hold a `review-pr` at `project`, and a
     second machine's different edit is its own question, never "Already waiting" for text it did not send. No machine
     name and no path: those are in the body's details. */
  const propose = async (row: Brief, name: string, rev: number, text: string, path: string): Promise<{ filed: boolean; said: string; joined: string | null }> => {
    const out = await s.client.call<{ id: string; joined?: true; said?: string }>('propose', {
      question: asking(`Take ${thisMachine()}'s edit to `, name, ` as version ${String(rev + 1)}?`),
      body_kind: 'rowset',
      body: { register: 'skills', rows: [{ at: row.spoken, version: row.version, patch: { body: text, rev: rev + 1 } }], details: { file: path, machine } },
      ...causeOf(`skills#${name}@${row.scope}#${row.spoken.slice(row.spoken.indexOf('#') + 1)}#${sha256(text).slice(0, 24)}`),
    });
    const made = valueOf(out);
    if (made === null || typeof made.id !== 'string') return { filed: false, said: `refused: ${fixOf(out)}`, joined: null };
    return { filed: true, said: made.id, joined: joinedSaid(made) };
  };

  /**
   * A trigger stored as a block header alone (">", "|-") read again from the skill's own file, and the sentence it
   * holds written back, with the version the row is at after it; `null` when there is no such file or it says nothing
   * better.
   *
   * THE OLD READER'S ROWS STAY WRONG UNTIL SOMETHING READS THEM AGAIN, and the sync is what registered them. The file is
   * the one the lock names, or where the skill's name puts it on this machine.
   */
  const reread = async (row: Brief, name: string, base: string, held: string | undefined): Promise<{ trigger: string; version: number } | null> => {
    const seq = Number(row.spoken.slice(row.spoken.indexOf('#') + 1));
    if (!row.spoken.startsWith('skills#') || !Number.isInteger(seq)) return null;
    const path = [held, skillPath(base, 'skill', name), skillPath(base, 'command', name)].find(
      (p): p is string => typeof p === 'string' && existsSync(p) && !linked(p),
    );
    if (path === undefined) return null;
    const described = describedAs(readFileSync(path, 'utf8'));
    if (described === undefined) return null;
    /* A FILE'S WORDS GO UP ONLY AFTER THE YES, as a skill kept by hand does. */
    if (s.upload === false) return null;
    if (s.dryRun) {
      lines.push(`Skill ${name} would take its description from ${where(path)} again.`);
      return { trigger: described, version: row.version };
    }
    const written = valueOf(await s.client.update({ register: 'skills', seq, patch: { trigger: described }, version: row.version }));
    if (written === null) return null;
    lines.push(`Skill ${name} took its description from ${where(path)} again.`);
    return { trigger: described, version: isObject(written) && typeof written.version === 'number' ? written.version : row.version + 1 };
  };

  /* The paths written inside the repository in this sync, which its exclude file is told about at the end. */
  const wrote: string[] = [];
  /** Whether a path in the repository reaches through a link, so the sync neither reads nor writes it. */
  const linked = (path: string): boolean => s.top !== null && projectBase !== null && inside(path, projectBase) && !linkFree(s.top, path);
  const unlinked = (path: string): boolean => {
    if (!linked(path)) return true;
    lines.push(`${nameAt(path)}: ${path} goes through a link in this repository, so the sync left it alone.`);
    return false;
  };
  const pins = await import('./pins.ts');
  const write = (path: string, text: string, spoken: string, rev: number): boolean => {
    if (s.dryRun) return true;
    const called = nameAt(path);
    if (skillRuns(text) && (pins.readPins(pins.pinsFile(s.home)) ?? {})[pins.pinOf('skill', called, sha256(text))] === undefined) {
      s.held?.push({ name: called, text });
      lines.push(`Skill ${called} runs commands on this machine when it is used, so it was not written. Run braindog skills sync at a terminal to read it and say yes.`);
      return false;
    }
    const repo = s.top !== null && projectBase !== null && inside(path, projectBase);
    if (!writeText(path, text, repo ? s.top : null)) {
      lines.push(`${nameAt(path)}: ${path} goes through a link in this repository, so the sync left it alone.`);
      return false;
    }
    lock[path] = { spoken, version: rev, sha256: sha256(text) };
    if (repo) wrote.push(path);
    return true;
  };

  /** Whether git already tracks this file of the repository: somebody committed it, so it is theirs and not the sync's. */
  const tracked = async (path: string): Promise<boolean> => {
    if (s.top === null || projectBase === null || !inside(path, projectBase)) return false;
    const rel = within(s.top, path);
    return rel !== null && (await git(s.top, 'ls-files', '--error-unmatch', '--', rel)) !== null;
  };

  /**
   * The skills `context` did not show, by the list read, and whether every one was read; `late` when the budget is what
   * ended it.
   *
   * THE SESSION'S PROJECT FIRST, so a start with little time left still has every skill of the folder it is in. The list
   * read answers every project's skills, each holding its project as that row's id, so the project's id is read once
   * and a skill of another project is passed over. A retired skill is not listed, as `context` does not list one.
   */
  const readRest = async (shown: Brief[]): Promise<{ rest: Brief[]; whole: boolean; late: boolean }> => {
    const rest: Brief[] = [];
    const seen = new Set(shown.map((r) => r.spoken));
    const clock = s.clock ?? Date.now;
    const until = s.until ?? clock() + READ_MS;
    try {
      let home: string | null = null;
      if (projectBase !== null && s.context.project !== null) {
        const [register, seq] = s.context.project.spoken.split('#');
        const row = register && Number.isInteger(Number(seq)) ? valueOf(await s.client.get(register, Number(seq))) : null;
        home = isObject(row) && typeof row.id === 'string' ? row.id : null;
      }
      let whole = true;
      for (const where of [...(home === null ? [] : [{ field: 'project', is: home }]), null]) {
        let cursor: string | null = null;
        for (let page = 0; ; page++) {
          if (page >= PAGES) return { rest, whole: false, late: false };
          if (clock() >= until) return { rest, whole: false, late: true };
          const got = await s.client.list({ register: 'skills', limit: PAGE, ...(where === null ? {} : { where }), ...(cursor === null ? {} : { cursor }) });
          const value = valueOf(got);
          /* A host that will not take the project's question is asked for everything below, which holds the same skills. */
          if (value === null) {
            if (where === null) return { rest, whole: false, late: false };
            break;
          }
          for (const r of value.rows) {
            if (!isObject(r) || !isObject(r.fields) || typeof r.seq !== 'number') continue;
            const spoken = `skills#${String(r.seq)}`;
            const of = r.fields.project;
            const mine = where !== null || (home !== null && of === home);
            if (!mine && of !== undefined && of !== null && of !== '') {
              /* Another project's skill; or, where the project's own id could not be read, one that cannot be placed. */
              if (projectBase !== null && home === null) whole = false;
              continue;
            }
            if (seen.has(spoken) || r.state === 'retired') continue;
            seen.add(spoken);
            rest.push({
              spoken,
              version: typeof r.version === 'number' ? r.version : 1,
              scope: mine ? 'project' : 'global',
              state: typeof r.state === 'string' ? r.state : null,
              name: r.fields.name,
              trigger: r.fields.trigger,
              rev: r.fields.rev,
            });
          }
          cursor = typeof value.cursor === 'string' && value.cursor !== '' ? value.cursor : null;
          if (cursor === null) break;
        }
      }
      return { rest, whole, late: false };
    } catch (e) {
      if (!(e instanceof Stopped)) throw e;
      return { rest, whole: false, late: true };
    }
  };

  try {
    /* What `context` showed is acted on first, the project's own ahead of what it inherits, then the rest of the list. */
    const shown = [...reg.rows, ...reg.inherited];
    const read = reg.truncated ? await readRest(shown) : { rest: [], whole: true, late: false };
    const listed = [...shown, ...read.rest];
    const listedSpoken = new Set(listed.map((r) => r.spoken));
    if (read.late) lines.push('Your BrainDog holds more skills than there was time to read, so the rest wait for the next sync.');

    /* A LOCK ENTRY IS HONOURED ONLY FOR THE SKILL IT WAS MADE FOR: the row it names must exist and carry the skill's
       name. Otherwise the entry is dropped and the skill is matched by name, as if the lock had never held it. */
    const dropLock = (path: string) => {
      delete lock[path];
      lines.push(`${nameAt(path)}: the lock pointed at another row, so it was matched again by name.`);
    };
    for (const [path, entry] of Object.entries(lock)) {
      if (entry.spoken === null || !synced(path)) continue;
      const at = listed.find((r) => r.spoken === entry.spoken);
      const named = at !== undefined ? at.name : (await fetchRow(entry.spoken, nameAt(path), ''))?.name;
      if (named !== nameAt(path)) dropLock(path);
    }

    for (const listedRow of listed) {
      if (s.leave?.has(listedRow.spoken)) continue;
      let row = listedRow;
      const base = row.scope === 'project' ? projectBase : s.configDir;
      const name = typeof row.name === 'string' ? row.name : '';
      let trigger = typeof row.trigger === 'string' ? row.trigger : '';
      const rev = typeof row.rev === 'number' ? row.rev : 1;
      if (base === null) continue;
      const locked = Object.entries(lock).find(([path, e]) => e.spoken === row.spoken && inside(path, base));
      /* READ AGAIN BEFORE ANYTHING IS RENDERED FROM IT, so a file written below never says ">" either, and an edit
         proposed below is compared against the version the write-back left. */
      if (BLOCK.test(trigger.trim())) {
        const again = await reread(row, name, base, locked?.[0]);
        if (again !== null) [trigger, row] = [again.trigger, { ...row, version: again.version }];
      }

      if (locked !== undefined && !unlinked(locked[0])) continue;
      if (locked !== undefined && existsSync(locked[0])) {
        const [path, entry] = locked;
        const text = readFileSync(path, 'utf8');
        const now = sha256(text);
        if (now === entry.sha256) {
          /* Unchanged since the lock: a newer version is fetched and written. */
          if (rev <= entry.version) continue;
          /* Somebody committed the file since it was written: a newer version is not written over it. Said once. */
          if (await tracked(path)) {
            if (entry.proposed_sha !== now) {
              if (!s.dryRun) lock[path] = { ...entry, proposed_sha: now };
              lines.push(`Skill ${name} was not updated in ${path}, because git already tracks that file in this repository.`);
            }
            continue;
          }
          const got = await fetchRow(row.spoken, name, trigger);
          if (got === null || !got.managed) continue;
          if (!write(path, got.text, row.spoken, rev)) continue;
          s.tally?.down.push(name);
          tell(`Skill ${name} updated to version ${String(rev)} in ${where(path)}.`, `Skill ${name} would be updated to version ${String(rev)} in ${where(path)}.`);
          continue;
        }
        /* Edited since the lock. Asked about once per file hash. */
        if (entry.proposed_sha === now) continue;
        const got = await fetchRow(row.spoken, name, trigger);
        if (got === null) continue;
        if (!got.managed || sha256(got.text) === now) {
          if (!s.dryRun) lock[path] = got.managed ? { spoken: row.spoken, version: rev, sha256: now } : { ...entry, proposed_sha: now };
          continue;
        }
        const both = rev > entry.version;
        if (s.upload === false) {
          keptBack++;
          continue;
        }
        s.tally?.edits.push(name);
        if (s.dryRun) {
          lines.push(`Skill ${name} was edited in ${where(path)}; it would be kept and proposed as version ${String(rev + 1)}.`);
          continue;
        }
        const asked = await propose(row, name, rev, text, path);
        if (asked.filed) lock[path] = { ...entry, proposed_sha: now };
        lines.push(
          asked.joined !== null
            ? both
              ? `Skill ${name} changed here and in your BrainDog; kept yours. ${joinedAt(asked.joined, asked.said)}`
              : `Skill ${name} was edited in ${where(path)}; kept it. ${joinedAt(asked.joined, asked.said)}`
            : both
              ? `Skill ${name} changed here and in your BrainDog; kept yours and asked${onDecide(asked)}`
              : `Skill ${name} was edited in ${where(path)}; kept it and proposed it as version ${String(rev + 1)}${onDecide(asked)}`,
        );
        continue;
      }

      /* No file, or no lock for this row. */
      const told = locked?.[1].proposed_sha === TRACKED;
      if (locked !== undefined && !s.dryRun) delete lock[locked[0]];
      const got = await fetchRow(row.spoken, name, trigger);
      if (got === null || !got.managed) continue;
      const path = skillPath(base, got.kind, name);
      if (path === null) {
        lines.push(`${row.spoken} was not written, because its name is not one a skill folder may have.`);
        continue;
      }
      if (!unlinked(path)) continue;
      if (!existsSync(path)) {
        /* Tracked and not in the folder: the repository's own skill, taken out here on purpose or not yet checked out. */
        if (await tracked(path)) {
          if (!s.dryRun) lock[path] = { spoken: row.spoken, version: 0, sha256: '', proposed_sha: TRACKED };
          if (!told) lines.push(`Skill ${name} was not written to ${path}, because git already tracks that file in this repository.`);
          continue;
        }
        if (!write(path, got.text, row.spoken, rev)) continue;
        s.tally?.down.push(name);
        tell(`Skill ${name} written to ${where(path)}.`, `Skill ${name} would be written to ${where(path)}.`);
        continue;
      }
      const text = readFileSync(path, 'utf8');
      const now = sha256(text);
      if (now === sha256(got.text)) {
        if (!s.dryRun) lock[path] = { spoken: row.spoken, version: rev, sha256: now };
        continue;
      }
      if (lock[path]?.proposed_sha === now) continue;
      if (s.upload === false) {
        keptBack++;
        continue;
      }
      s.tally?.edits.push(name);
      if (s.dryRun) {
        lines.push(`Skill ${name} in ${where(path)} differs from your BrainDog; it would be kept and proposed as version ${String(rev + 1)}.`);
        continue;
      }
      const asked = await propose(row, name, rev, text, path);
      lock[path] = { spoken: row.spoken, version: rev, sha256: sha256(got.text), ...(asked.filed ? { proposed_sha: now } : {}) };
      lines.push(
        asked.joined !== null
          ? `Skill ${name} in ${where(path)} differs from your BrainDog; kept it. ${joinedAt(asked.joined, asked.said)}`
          : `Skill ${name} in ${where(path)} differs from your BrainDog; kept it and proposed it as version ${String(rev + 1)}${onDecide(asked)}`,
      );
    }

    /* Retired: an unchanged file is deleted, an edited one left. */
    for (const [path, entry] of Object.entries(lock)) {
      if (entry.spoken === null || listedSpoken.has(entry.spoken) || !synced(path)) continue;
      const name = nameAt(path);
      const got = await fetchRow(entry.spoken, name, '');
      if (got === null || got.state !== 'retired') continue;
      if (!existsSync(path)) {
        if (!s.dryRun) delete lock[path];
        continue;
      }
      const now = sha256(readFileSync(path, 'utf8'));
      if (now === entry.sha256) {
        if (!s.dryRun) {
          unlinkSync(path);
          if (path.endsWith('SKILL.md'))
            try {
              rmdirSync(dirname(path));
            } catch {
              /* The folder holds other files of the person's, so it stays. */
            }
          delete lock[path];
        }
        s.tally?.gone.push(name);
        tell(`Skill ${name} was retired, so ${where(path)} was deleted.`, `Skill ${name} was retired, so ${where(path)} would be deleted.`);
      } else if (entry.proposed_sha !== now) {
        if (!s.dryRun) lock[path] = { ...entry, proposed_sha: now };
        lines.push(`Skill ${name} was retired in your BrainDog and edited in ${where(path)}, so the file was left.`);
      }
    }

    /* A file with no lock and no row: registered as index only, where the run may create. */
    /* A NAME WITHIN ITS SCOPE IS THE SKILL: a file is new only when no skill of the place it is in holds its name. */
    const names = new Set(listed.map((r) => `${r.scope}:${String(r.name)}`));
    const places: { base: string; scope: 'project' | 'global' }[] = [
      ...(s.context.project === null ? [{ base: s.configDir, scope: 'global' as const }] : []),
      ...(projectBase === null ? [] : [{ base: projectBase, scope: 'project' as const }]),
    ];
    for (const { base, scope } of places) {
      for (const file of filesIn(base)) {
        const entry = lock[file.path];
        if (names.has(`${scope}:${file.name}`) || (entry !== undefined && entry.spoken !== null)) continue;
        const text = readFileSync(file.path, 'utf8');
        const now = sha256(text);
        if (!text.trim() || entry?.proposed_sha === now) continue;
        /* Until every name the record holds has been read, a file may be a skill it already has. */
        if (read.late) continue;
        if (!read.whole) {
          lines.push(`Skill ${file.name} in ${where(file.path)} was not registered, because not every skill in your BrainDog could be read.`);
          continue;
        }
        if (s.upload === false) {
          keptBack++;
          continue;
        }
        s.tally?.up.push(file.name);
        if (s.dryRun) {
          lines.push(`Skill ${file.name} in ${where(file.path)} would be registered as index only.`);
          continue;
        }
        const out = await s.client.create({
          register: 'skills',
          fields: { name: file.name, kind: file.kind, trigger: triggerOf(text, file.kind), body: text, managed: false },
        });
        const spoken = spokenOf(valueOf(out));
        if (spoken === null) {
          lock[file.path] = { spoken: null, version: 0, sha256: now, proposed_sha: now };
          lines.push(`Skill ${file.name} in ${where(file.path)} was not registered: ${notTaken(out)}`);
          continue;
        }
        lock[file.path] = { spoken, version: 1, sha256: now };
        lines.push(`Skill ${file.name} in ${where(file.path)} was registered as ${spoken}, index only.`);
      }
    }
    if (keptBack > 0)
      lines.push(
        `${keptBack === 1 ? 'One skill' : `${String(keptBack)} skills`} on ${thisMachine()} ${keptBack === 1 ? 'was' : 'were'} not copied into your BrainDog, because it copies them only after you say yes. Run braindog skills sync to choose.`,
      );
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
    lines.push('BrainDog stopped answering part way, so the rest of the skills wait for the next sync.');
  } finally {
    if (!s.dryRun) {
      /* Never committed: the repository's exclude file is told of each file written into it. A failure there leaves the
         files written and the lock true, and the next write tells it again. */
      if (s.top !== null && wrote.length > 0)
        try {
          await keepOut(s.top, wrote);
        } catch {
          /* The exclude file could not be written; the skills are in place either way. */
        }
      /* THIS HOST'S ENTRIES SAY SO, and another host's go back as they were, unless this sync now holds the path. */
      const mine = Object.fromEntries(Object.entries(lock).map(([path, e]) => [path, host === null ? e : { ...e, host }]));
      writeLock(lockFile, { ...Object.fromEntries(Object.entries(others).filter(([path]) => !(path in mine))), ...mine });
    }
  }
  return lines;
}

const USAGE = 'braindog skills takes sync (with --host, --dry-run or --yes) or off (with --host), and nothing else.';

/** `a, b and c`, the first `most` by name and how many more. */
const named = (names: readonly string[], most = 5): string => {
  const shown = names.slice(0, most);
  const more = names.length - shown.length;
  const parts = more > 0 ? [...shown, `${String(more)} more`] : shown;
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
};

const skillsWord = (n: number): string => (n === 1 ? 'one skill' : `${String(n)} skills`);

/**
 * What a first sync would copy each way, as the lines said before the question: by count, and the first few by name.
 * The tools line only where the record keeps tools, since the yes also lets each session's start record them.
 */
export function copyLines(t: Tally, where: { record: string; folder: string; tools: boolean }): string[] {
  const out: string[] = [];
  if (t.up.length > 0) out.push(`- It copies ${skillsWord(t.up.length)} from ${thisMachine()} into ${where.record}, each with its whole text: ${named(t.up)}.`);
  if (t.edits.length > 0) out.push(`- It suggests ${t.edits.length === 1 ? 'one edit' : `${String(t.edits.length)} edits`} made here as new versions, for you to accept on Needs you: ${named(t.edits)}.`);
  if (t.down.length > 0) out.push(`- It writes ${skillsWord(t.down.length)} from ${where.record} into ${where.folder}: ${named(t.down)}.`);
  if (t.gone.length > 0) out.push(`- It deletes ${skillsWord(t.gone.length)} retired in ${where.record} from ${where.folder}: ${named(t.gone)}.`);
  if (out.length === 0) out.push('- Right now there is nothing to copy either way.');
  out.push(
    `- After a yes, each session's start keeps them in step${where.tools ? `, and records the MCP servers ${thisMachine()} runs (a key found in one goes to your Keychain)` : ''}.`,
  );
  return out;
}

/** What `skills` needs past `AgentIo`: how it asks, which a test holds and a terminal answers (`askAtTerminal`). */
export type SkillsIo = AgentIo & { ask?: ((question: string) => Promise<boolean | null>) | undefined };

/**
 * `braindog skills sync [--host <host>] [--dry-run] [--yes]` and `braindog skills off [--host <host>]`, and the exit code.
 *
 * THE FIRST SYNC ASKS (`skills-consent.ts`). Only the owner of a BrainDog may keep this machine's skills in it, so the
 * command reads `whoami` first; then it says what it would copy each way, from a dry run, and asks once at the
 * terminal. The yes is kept for that host, and from then on this command and each session's start sync without
 * asking. `--yes` is the yes typed ahead, for a script; off a terminal without it nothing is copied. `off` takes the
 * yes back.
 */
export async function skills(args: string[], io: SkillsIo): Promise<number> {
  const [verb, ...rest] = args;
  let values: { host?: string | undefined; 'dry-run'?: boolean | undefined; yes?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args: rest, strict: true, options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  if (verb === 'off') {
    if (values['dry-run'] === true || values.yes === true) {
      io.say(USAGE);
      return 1;
    }
    let to: Target;
    try {
      to = target(values.host, io.env, hostsPath(io.env));
    } catch (e) {
      io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
      return 1;
    }
    refuseSkills(io.home, to.key);
    io.out(`BrainDog will leave ${thisMachine()}'s skills alone for ${to.key}: no session copies them either way. Run braindog skills sync to turn it back on.`);
    return 0;
  }
  if (verb !== 'sync') {
    io.say(USAGE);
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  if (!at.context.registers.some((r) => r.id === 'skills')) {
    io.out('This BrainDog has no Skills list, so there is nothing to sync.');
    return 0;
  }
  const dryRun = values['dry-run'] === true;
  const configDir = io.env.CLAUDE_CONFIG_DIR || join(io.home, '.claude');
  const base = { client: at.client, context: at.context, home: io.home, configDir, top: at.top, until: Infinity, to: at.to };
  if (!dryRun && !skillsAllowed(io.home, at.to.key)) {
    /* ONLY INTO A BRAINDOG OF YOUR OWN: a member's copy of somebody else's, or a token held to less, is never handed this
       machine's skills, and its skills are not written here either. */
    const me = await at.client.whoami();
    const level = me.ok && isObject(me.value) ? me.value.level : null;
    if (level !== 'owner') {
      io.say(
        me.ok
          ? `${at.to.key} is not a BrainDog you own, so nothing was copied either way. Skills are kept in step only with your own.`
          : `${at.to.key} did not say whose BrainDog it is, so nothing was copied either way.`,
      );
      return 1;
    }
    const tally: Tally = { up: [], edits: [], down: [], gone: [] };
    await syncSkills({ ...base, dryRun: true, tally });
    io.out(`Before BrainDog keeps ${thisMachine()}'s skills in step with ${at.to.key}, this is what it would do now:`);
    for (const line of copyLines(tally, { record: 'your BrainDog', folder: configDir, tools: at.context.registers.some((r) => r.id === 'tools') })) io.out(line);
    const yes = values.yes === true ? true : await (io.ask ?? askAtTerminal)('Keep your skills in step with your BrainDog? [y/N] ');
    if (yes === null) {
      io.say('Nothing was copied, because there is no terminal to ask in. Run braindog skills sync in a terminal, or add --yes to say yes.');
      return 1;
    }
    if (!yes) {
      refuseSkills(io.home, at.to.key);
      io.out('Nothing was copied either way, and sessions will leave your skills alone. Run braindog skills sync again to change that.');
      return 0;
    }
    allowSkills(io.home, at.to.key);
  }
  const held: { name: string; text: string }[] = [];
  let lines = await syncSkills({ ...base, dryRun, held });
  /* ASKED ONE BY ONE, EACH SHOWN WHOLE, and a yes is written by a second pass through the same sync. */
  let said = false;
  if (held.length > 0) {
    const { keepPin, pinOf, pinsFile } = await import('./pins.ts');
    for (const one of held) {
      io.out(`Skill ${one.name} runs commands on this machine when it is used:`);
      for (const line of one.text.split(/\r?\n/u)) io.out(`    ${clip(line, 2_000)}`);
      if ((await (io.ask ?? askAtTerminal)(`Write skill ${one.name} on this machine? It can run commands. [y/N] `)) !== true) continue;
      keepPin(pinsFile(io.home), pinOf('skill', one.name, sha256(one.text)), { name: one.name, kind: 'skill', profile: configDir, now: Date.now() });
      said = true;
    }
    if (said) lines = await syncSkills({ ...base, dryRun });
  }
  for (const line of lines) io.out(line);
  if (lines.length === 0) io.out('Skills are in sync.');
  if (dryRun) io.out('That was a dry run, so nothing was written, sent or proposed.');
  return 0;
}
