/**
 * `braindog skills sync`: the record's skills written to the folders Claude Code reads them from, and a local
 * edit sent back as a proposal (`loop/research-agent-path.md` §5.4).
 *
 * THE RECORD WRITES FILES, AND A LOCAL EDIT IS NEVER OVERWRITTEN. A file is written only when it is unchanged since
 * the last sync, which the lock file at `~/.braindog/skills-lock.json` says: keyed by the file's absolute path, it
 * holds the row's spoken id, the version written, and the SHA-256 of what was written. An edited file is kept, and
 * its text is proposed as the next version once per file hash.
 *
 * A NAME IS A FOLDER NAME OR NOTHING. `^[a-z0-9][a-z0-9-]{0,63}$`, and the path it resolves to must stay inside the
 * skills folder, or nothing is written.
 *
 * A FILE WRITTEN INTO A REPOSITORY IS REPORTED, NEVER COMMITTED (question 13).
 *
 * WHAT THE SESSION MAY CREATE IS WHERE ITS RUN IS. An agent's create lands in its run's project, so a file found in
 * the global folder is registered only from a run in no project, and a project's file only from a run in that
 * project.
 */

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { Brief, Client, Context } from '@braindog/client';
import { refused, type Result } from '@braindog/ports';

import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse, type Answering } from './json.ts';
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
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
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
};

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
export const fixOf = (r: Result<unknown>): string => (refused(r) ? r.refusal.fix : 'The record did not take it.');

/** The spoken id a created row is read back by. */
export const spokenOf = (value: unknown): string | null =>
  isObject(value) && typeof value.register === 'string' && typeof value.seq === 'number' ? `${value.register}#${String(value.seq)}` : null;

/* ── the skills ────────────────────────────────────────────────────────── */

export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** One lock entry. `proposed_sha` is the file hash already acted on: proposed, found unmanaged, or reported. */
export type LockEntry = { spoken: string | null; version: number; sha256: string; proposed_sha?: string };

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
  return `---\nname: ${name}\ndescription: ${JSON.stringify(oneLine(trigger, 400))}\n---\n\n${body}`;
}

/** The sentence a file found by hand is registered with: its description, else its first line, else where it is. */
function triggerOf(text: string, kind: Kind): string {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const described = head ? /^description:\s*(.+)$/m.exec(head[1] ?? '')?.[1] : undefined;
  if (described) return oneLine(described.replace(/^["']|["']$/g, ''), 380);
  const rest = head ? text.slice(head[0].length) : text;
  const first = rest.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean);
  return first ? oneLine(first, 380) : `A ${kind} kept by hand.`;
}

/** The skill files under a `.claude` folder: `skills/<name>/SKILL.md` and `commands/<name>.md`, by valid name. */
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

/** Written whole and renamed, so a failed write never leaves half a skill. */
function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
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
};

type Got = { kind: Kind; text: string; managed: boolean; state: string | null };

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
  const lock: Record<string, LockEntry> = {};
  for (const [path, e] of Object.entries(held))
    if (isObject(e) && (typeof e.spoken === 'string' || e.spoken === null) && typeof e.version === 'number' && typeof e.sha256 === 'string')
      lock[path] = { spoken: e.spoken, version: e.version, sha256: e.sha256, ...(typeof e.proposed_sha === 'string' ? { proposed_sha: e.proposed_sha } : {}) };

  const lines: string[] = [];
  const machine = s.machine ?? hostname();
  const projectBase = s.top !== null && s.context.project !== null ? join(s.top, '.claude') : null;
  const bases = [s.configDir, ...(projectBase === null ? [] : [projectBase])];
  const folders = bases.flatMap((b) => [resolve(b, 'skills'), resolve(b, 'commands')]);
  const inside = (path: string, base: string) => [resolve(base, 'skills'), resolve(base, 'commands')].some((f) => resolve(path).startsWith(f + sep));
  const synced = (path: string) => folders.some((f) => resolve(path).startsWith(f + sep));
  const where = (path: string) => (projectBase !== null && inside(path, projectBase) ? `${path} (in the repository, not committed)` : path);
  const tell = (done: string, would: string) => lines.push(s.dryRun ? would : done);

  const fetchRow = async (spoken: string, name: string, trigger: string): Promise<Got | null> => {
    const seq = Number(spoken.slice(spoken.indexOf('#') + 1));
    if (!spoken.startsWith('skills#') || !Number.isInteger(seq)) return null;
    const row = valueOf(await s.client.get('skills', seq));
    if (!isObject(row) || !isObject(row.fields) || typeof row.fields.body !== 'string') return null;
    const kind: Kind = row.fields.kind === 'command' ? 'command' : 'skill';
    return { kind, text: render(kind, name, trigger, row.fields.body), managed: row.fields.managed !== false, state: typeof row.state === 'string' ? row.state : null };
  };

  const propose = async (row: Brief, name: string, rev: number, text: string): Promise<string> => {
    const out = await s.client.call<{ id: string }>('propose', {
      question: `Take the edit to ${name} made on ${machine} as version ${String(rev + 1)}?`,
      body_kind: 'rowset',
      body: { register: 'skills', rows: [{ at: row.spoken, version: row.version, patch: { body: text, rev: rev + 1 } }] },
    });
    const made = valueOf(out);
    return made !== null && typeof made.id === 'string' ? made.id : `refused: ${fixOf(out)}`;
  };

  const write = (path: string, text: string, spoken: string, rev: number) => {
    if (s.dryRun) return;
    writeText(path, text);
    lock[path] = { spoken, version: rev, sha256: sha256(text) };
  };

  try {
    const listed = [...reg.rows, ...reg.inherited];
    const listedSpoken = new Set(listed.map((r) => r.spoken));

    for (const row of listed) {
      const base = row.scope === 'project' ? projectBase : s.configDir;
      const name = typeof row.name === 'string' ? row.name : '';
      const trigger = typeof row.trigger === 'string' ? row.trigger : '';
      const rev = typeof row.rev === 'number' ? row.rev : 1;
      if (base === null) continue;
      const locked = Object.entries(lock).find(([path, e]) => e.spoken === row.spoken && inside(path, base));

      if (locked !== undefined && existsSync(locked[0])) {
        const [path, entry] = locked;
        const text = readFileSync(path, 'utf8');
        const now = sha256(text);
        if (now === entry.sha256) {
          /* Unchanged since the lock: a newer version is fetched and written. */
          if (rev <= entry.version) continue;
          const got = await fetchRow(row.spoken, name, trigger);
          if (got === null || !got.managed) continue;
          write(path, got.text, row.spoken, rev);
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
        if (s.dryRun) {
          lines.push(`Skill ${name} was edited in ${where(path)}; it would be kept and proposed as version ${String(rev + 1)}.`);
          continue;
        }
        const asked = await propose(row, name, rev, text);
        if (!asked.startsWith('refused')) lock[path] = { ...entry, proposed_sha: now };
        lines.push(
          both
            ? `Skill ${name} changed here and in the record; kept yours and asked (${asked}).`
            : `Skill ${name} was edited in ${where(path)}; kept it and proposed it as version ${String(rev + 1)} (${asked}).`,
        );
        continue;
      }

      /* No file, or no lock for this row. */
      if (locked !== undefined && !s.dryRun) delete lock[locked[0]];
      const got = await fetchRow(row.spoken, name, trigger);
      if (got === null || !got.managed) continue;
      const path = skillPath(base, got.kind, name);
      if (path === null) {
        lines.push(`${row.spoken} was not written, because its name is not one a skill folder may have.`);
        continue;
      }
      if (!existsSync(path)) {
        write(path, got.text, row.spoken, rev);
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
      if (s.dryRun) {
        lines.push(`Skill ${name} in ${where(path)} differs from the record; it would be kept and proposed as version ${String(rev + 1)}.`);
        continue;
      }
      const asked = await propose(row, name, rev, text);
      lock[path] = { spoken: row.spoken, version: rev, sha256: sha256(got.text), ...(asked.startsWith('refused') ? {} : { proposed_sha: now }) };
      lines.push(`Skill ${name} in ${where(path)} differs from the record; kept it and proposed it as version ${String(rev + 1)} (${asked}).`);
    }

    /* Retired: an unchanged file is deleted, an edited one left. */
    for (const [path, entry] of Object.entries(lock)) {
      if (entry.spoken === null || listedSpoken.has(entry.spoken) || !synced(path)) continue;
      const name = path.endsWith('SKILL.md') ? basename(dirname(path)) : basename(path, '.md');
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
        tell(`Skill ${name} was retired, so ${where(path)} was deleted.`, `Skill ${name} was retired, so ${where(path)} would be deleted.`);
      } else if (entry.proposed_sha !== now) {
        if (!s.dryRun) lock[path] = { ...entry, proposed_sha: now };
        lines.push(`Skill ${name} was retired in the record and edited in ${where(path)}, so the file was left.`);
      }
    }

    /* A file with no lock and no row: registered as index only, where the run may create. */
    const names = new Set(listed.map((r) => r.name));
    const places: { base: string; scope: 'project' | 'global' }[] = [
      ...(s.context.project === null ? [{ base: s.configDir, scope: 'global' as const }] : []),
      ...(projectBase === null ? [] : [{ base: projectBase, scope: 'project' as const }]),
    ];
    for (const { base } of places) {
      for (const file of filesIn(base)) {
        const entry = lock[file.path];
        if (names.has(file.name) || (entry !== undefined && entry.spoken !== null)) continue;
        const text = readFileSync(file.path, 'utf8');
        const now = sha256(text);
        if (!text.trim() || entry?.proposed_sha === now) continue;
        if (reg.truncated) {
          lines.push(`Skill ${file.name} in ${where(file.path)} was not registered, because the record lists more skills than one context shows.`);
          continue;
        }
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
          lines.push(`Skill ${file.name} in ${where(file.path)} was not registered: ${fixOf(out)}`);
          continue;
        }
        lock[file.path] = { spoken, version: 1, sha256: now };
        lines.push(`Skill ${file.name} in ${where(file.path)} was registered as ${spoken}, index only.`);
      }
    }
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
    lines.push('BrainDog stopped answering part way, so the rest of the skills wait for the next sync.');
  } finally {
    if (!s.dryRun) writeLock(lockFile, lock);
  }
  return lines;
}

const USAGE = 'braindog skills takes sync, --host and --dry-run, and nothing else.';

/** `braindog skills sync [--host <host>] [--dry-run]`, and the exit code. */
export async function skills(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  let values: { host?: string | undefined; 'dry-run'?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args: rest, strict: true, options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  if (verb !== 'sync') {
    io.say(USAGE);
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  if (!at.context.registers.some((r) => r.id === 'skills')) {
    io.out('This record has no skills register, so there is nothing to sync.');
    return 0;
  }
  const dryRun = values['dry-run'] === true;
  const lines = await syncSkills({ client: at.client, context: at.context, home: io.home, configDir: io.env.CLAUDE_CONFIG_DIR || join(io.home, '.claude'), top: at.top, dryRun });
  for (const line of lines) io.out(line);
  if (lines.length === 0) io.out('Skills are in sync.');
  if (dryRun) io.out('That was a dry run, so nothing was written, sent or proposed.');
  return 0;
}
