/**
 * What setup sync carries: the Setup sync add-on's Carry list read as this machine needs it, the lines no thing carried
 * may cross, the files of each gathered into one archive, and an archive placed again (`docs/48-SPEC-CLI.md` §5.20).
 *
 * ONE PLACE PER SYSTEM. A thing carried names where it lives on a Mac, on Windows and on Linux, each a path that starts
 * at `~` (the home, `%USERPROFILE%` on Windows), a full path, or on a Mac `keychain:<service>[/<account>]`. A thing with
 * no place for this system is skipped here and said, so a bash tool with no Windows place never lands on a PC.
 *
 * THE HARD LINES (SCOPE §6), HELD HERE AND NOT LEFT TO THE LIST:
 *   1. NO AGENT APP'S LOGIN. A place, a file or a Keychain item naming Claude Code's login file, Codex's, Claude Code's
 *      Keychain item or the claude.ai login is refused (`SIGN_INS` in `sync.ts`), and so is a file whose bytes hold the
 *      claude.ai login under another name: it is dropped before it is sealed and said by its place alone.
 *   2. NO TRANSCRIPT. Below an agent app's folder (`.claude`, `.claude-<name>`, `.codex`, ccenv's), a folder of session
 *      transcripts (`projects`, `transcripts`, `sessions`) and any `.jsonl` is refused by its name, and never listed,
 *      so not a byte of one is read. That refuses auto memory too, which sits inside `projects/`: it waits on the
 *      owner's yes, and the Auto memory kind is refused whatever its place says.
 *   3. NO LINK FOLLOWED. A link inside a folder carried is named and left, so a walk never leaves the folder it was given.
 *   4. A SIGN-IN MOVES ONLY AS ONE. A file another thing carries as tool sign-ins is left out of every other thing, so it
 *      never travels by a door that does not ask where it is live (`sync-pull.ts`).
 *
 * THE ARCHIVE is `BDA1`, the length of a JSON head as four bytes, the head, and each file's bytes in the head's order.
 * The head names each file by its place under the thing's root with `/` between folders (`''` for a root that is a
 * file), its size, its mode and its SHA-256, so a restore checks every file it puts back. Bytes are carried exactly as
 * found, so line endings stay and no byte-order mark is added on any system.
 */

import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { Item, SecretStore } from './secret-store.ts';
import { reposUnder, runGit, SIGN_INS, type Git } from './sync.ts';

type Env = Record<string, string | undefined>;

/* ── the systems ───────────────────────────────────────────────────────── */

/** The three systems a thing carried names a place on. */
export type System = 'mac' | 'windows' | 'linux';
export const SYSTEMS: readonly System[] = ['mac', 'windows', 'linux'];

/** This machine's system: a Mac, Windows, or anything else read as Linux. */
export const systemOf = (platform: string = process.platform): System => (platform === 'darwin' ? 'mac' : platform === 'win32' ? 'windows' : 'linux');

/** A system as a sentence says it. */
export const SYSTEM_SAID: Record<System, string> = { mac: 'a Mac', windows: 'Windows', linux: 'Linux' };

/** The field of Carry that holds a thing's place on each system. */
export const PLACE_FIELD: Record<System, string> = { mac: 'mac', windows: 'win', linux: 'linux' };

/**
 * Whether paths on this system are compared without case: Windows always, and a Mac too, whose disks are read without
 * case unless formatted otherwise. Linux compares them as written.
 */
export const caseless = (system: System): boolean => system !== 'linux';

/* ── a thing carried ───────────────────────────────────────────────────── */

/** What a thing carried is: files as they are, `.env` files git ignores, unpushed work, auto memory, or tool sign-ins. */
export type CarryKind = 'files' | 'env' | 'patches' | 'memory' | 'sign_ins';
const KINDS: readonly CarryKind[] = ['files', 'env', 'patches', 'memory', 'sign_ins'];

/** What each kind is called in a line. */
export const KIND_SAID: Record<CarryKind, string> = { files: 'files', env: '.env files git ignores', patches: 'unpushed work', memory: 'auto memory', sign_ins: 'tool sign-ins' };

/** The sentence the Auto memory kind is always refused with, until the owner says yes to carrying it. */
export const MEMORY_WAITS = 'auto memory waits on your yes: it sits inside projects/, beside the session transcripts that are never read, so it is not carried yet.';

/**
 * One thing in Carry, as this command reads it: its row's id, number and version, its name and kind, its place on each
 * system, the names left out of it, whether it runs a program, whose account it is when it is somebody else's (a person
 * by their row's id), whether it is carried at all, and the machines where it waits for a yes at a terminal.
 */
export type CarryRow = {
  id: string;
  seq: number;
  version: number;
  name: string;
  kind: CarryKind;
  places: Partial<Record<System, string>>;
  leaveOut: string[];
  runs: boolean;
  belongsTo: string | null;
  on: boolean;
  waiting: string[];
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const texts = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** One row of Carry read, or `null` for one with no name or no number. A kind it does not know is read as files. */
export function carryRowOf(row: unknown): CarryRow | null {
  if (!isObject(row) || typeof row.seq !== 'number' || !isObject(row.fields)) return null;
  const f = row.fields;
  const name = text(f.name);
  if (name === null) return null;
  const places: Partial<Record<System, string>> = {};
  for (const system of SYSTEMS) {
    const place = text(f[PLACE_FIELD[system]]);
    if (place !== null) places[system] = place;
  }
  const kind = KINDS.includes(f.kind as CarryKind) ? (f.kind as CarryKind) : 'files';
  const state = typeof row.state === 'string' ? row.state : typeof f.state === 'string' ? f.state : null;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    seq: row.seq,
    version: typeof row.version === 'number' ? row.version : 0,
    name,
    kind,
    places,
    leaveOut: texts(f.leave_out),
    runs: f.runs === true,
    belongsTo: text(f.whose),
    on: state !== 'off',
    waiting: texts(f.waits),
  };
}

/* ── the hard lines ────────────────────────────────────────────────────── */

/** The folders an agent app keeps its session transcripts in, below its own folder. */
const SESSION_FOLDERS = new Set(['projects', 'transcripts', 'sessions']);
/** An agent app's own folder by its name: `.claude`, `.claude-<name>`, `.codex`, and ccenv's, which holds profiles. */
const APP_FOLDER = /^\.(?:claude|codex|ccenv)(?:-|$)/u;

/** Why a line is crossed: an agent app's login, or session transcripts. */
export type Line = 'login' | 'transcripts';

/** A path's parts, `/` and `\` both read as a folder's end. */
const partsOf = (path: string): string[] => path.split(/[\\/]+/u).filter((p) => p !== '');

/** Whether `path` is `folder` or inside it, compared without case where `loose` says. */
export function within(folder: string, path: string, loose: boolean): boolean {
  const fold = (p: string) => (loose ? p.toLowerCase() : p);
  const rel = relative(fold(resolve(folder)), fold(resolve(path)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Why a place or a file is never carried, or `null`. Compared without case, since every system here may read a name so.
 * `apps` are this machine's agent app folders by where they are (its profiles, and Codex's), for one named by the
 * environment rather than by its folder's name.
 */
export function hardLine(path: string, apps: readonly string[] = []): Line | null {
  const said = path.toLowerCase();
  if (said.includes(SIGN_INS.keychain.toLowerCase()) || said.includes(SIGN_INS.login.toLowerCase())) return 'login';
  const parts = partsOf(path).map((p) => p.toLowerCase());
  const logins = [SIGN_INS.profile, SIGN_INS.profile.replace(/^\./u, ''), SIGN_INS.codex].map((n) => n.toLowerCase());
  if (parts.some((p) => logins.includes(p))) return 'login';
  const sessions = (rest: string[]) => rest.some((p) => SESSION_FOLDERS.has(p) || p.endsWith('.jsonl'));
  const app = parts.findIndex((p) => APP_FOLDER.test(p));
  if (app >= 0 && sessions(parts.slice(app + 1))) return 'transcripts';
  for (const dir of apps) if (isAbsolute(path) && within(dir, path, true) && sessions(partsOf(relative(resolve(dir).toLowerCase(), resolve(path).toLowerCase())))) return 'transcripts';
  return null;
}

/** What each crossed line is said as. */
export const LINE_SAID: Record<Line, string> = {
  login: "an agent app's own login, which BrainDog never reads, holds or moves",
  transcripts: 'session transcripts, which are never read and never carried',
};

/* ── where a thing is on this machine ──────────────────────────────────── */

/** Where a thing is: a path on this machine, or a Keychain item on a Mac. */
export type Place = { kind: 'path'; path: string } | { kind: 'keychain'; item: Item };

/** A place, no place for this system, or a place refused and why. */
export type Placed = { place: Place } | { none: true } | { refused: string };

/** `%NAME%` read from the environment as Windows reads it, without case; a name that is not set stays as written. */
const windowsVars = (path: string, env: Env): string =>
  path.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/gu, (whole, name: string) => Object.entries(env).find(([k]) => k.toUpperCase() === name.toUpperCase())?.[1] ?? whole);

/**
 * Where a thing is on this system: its place, with `~` read as the home and, on Windows, `%NAME%` from the environment.
 * A Keychain item is a Mac's alone, its account the person signed in when the place names none. A place that is not a
 * full path once read, or that crosses a hard line, is refused in a sentence.
 */
export function placeOf(row: CarryRow, system: System, o: { home: string; env: Env; apps?: readonly string[]; user?: string }): Placed {
  const raw = row.places[system];
  if (raw === undefined) return { none: true };
  const keychainPlace = /^keychain:(.+)$/iu.exec(raw);
  if (keychainPlace !== null) {
    if (system !== 'mac') return { refused: `its place on ${SYSTEM_SAID[system]} is a Keychain item, and only a Mac has a Keychain` };
    const [service = '', account] = (keychainPlace[1] ?? '').split('/');
    const item: Item = { service: service.trim(), account: (account ?? o.user ?? userInfo().username).trim() };
    if (hardLine(`${item.service}/${item.account}`) !== null) return { refused: LINE_SAID.login };
    if (item.service === '' || item.account === '') return { refused: 'its Keychain item names no service' };
    return { place: { kind: 'keychain', item } };
  }
  let path = system === 'windows' ? windowsVars(raw, o.env) : raw;
  if (path === '~' || path.startsWith('~/') || path.startsWith('~\\')) path = join(o.home, path.slice(1));
  if (!isAbsolute(path)) return { refused: `its place on ${SYSTEM_SAID[system]} is not a full path: start it at ~ or at the top of a disk` };
  const line = hardLine(path, o.apps ?? []);
  if (line !== null) return { refused: LINE_SAID[line] };
  return { place: { kind: 'path', path: resolve(path) } };
}

/* ── gathering ─────────────────────────────────────────────────────────── */

/** One file carried: its place under the thing's root with `/` between folders (`''` when the root is the file), its bytes, its mode. */
export type Entry = { path: string; bytes: Buffer; mode: number };

/** Why one place under a thing was left out of it. */
export type SkipWhy = Line | 'link' | 'left-out' | 'sign-ins' | 'unreadable';

/** What one thing holds on this machine: its files, what was left out and why, and whether its place was there at all. */
export type Gathered = { entries: Entry[]; skipped: { path: string; why: SkipWhy }[]; size: number; missing: boolean; tooBig: boolean };

/** The most one thing carries in one sealed file: the record keeps 25 MiB a file, less the seal's own bytes. */
export const MOST_CARRIED = 25 * 1024 * 1024 - 64;

/** What a gather is handed besides the root. */
export type GatherOptions = {
  /** Names left out of it: a file or folder name, or `*<ending>` for every name with that ending. */
  leaveOut: readonly string[];
  /** Whether names compare without case (`caseless`). */
  loose: boolean;
  /** Places another thing carries as tool sign-ins on this machine, which no other thing carries. */
  signIns: readonly string[];
  /** This machine's agent app folders (`hardLine`). */
  apps: readonly string[];
};

/** Whether a name is left out: equal to one named, or ending as a `*<ending>` says. */
export function leftOut(name: string, leaveOut: readonly string[], loose: boolean): boolean {
  const fold = (s: string) => (loose ? s.toLowerCase() : s);
  const n = fold(name);
  return leaveOut.some((pattern) => {
    const p = fold(pattern.trim());
    return p.startsWith('*') ? p.length > 1 && n.endsWith(p.slice(1)) : n === p;
  });
}

/** Whether bytes hold the claude.ai login, under whatever name the file has. */
const holdsLogin = (bytes: Buffer): boolean => bytes.includes(SIGN_INS.login, 0, 'utf8');

const slash = (rel: string): string => rel.split(sep).join('/');

/**
 * Every file of a thing whose place is a file or a folder, read whole, with what was left out and why. Each name is
 * asked the hard lines BEFORE it is read or listed, so a folder of transcripts is never opened. Stops reading once the
 * thing is over `MOST_CARRIED`, and says so, so a folder of gigabytes is never held in memory.
 */
export function gatherFiles(root: string, o: GatherOptions): Gathered {
  const out: Gathered = { entries: [], skipped: [], size: 0, missing: false, tooBig: false };
  const skip = (path: string, why: SkipWhy) => void out.skipped.push({ path, why });
  const signIn = (path: string) => o.signIns.some((s) => (o.loose ? s.toLowerCase() === path.toLowerCase() : s === path));
  const take = (abs: string, rel: string, st: Stats) => {
    if (out.tooBig) return;
    if (out.size + st.size > MOST_CARRIED) {
      out.tooBig = true;
      return;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(abs);
    } catch {
      skip(rel, 'unreadable');
      return;
    }
    if (holdsLogin(bytes)) {
      skip(rel, 'login');
      return;
    }
    out.entries.push({ path: rel, bytes, mode: st.mode & 0o777 });
    out.size += bytes.length;
  };
  let top: Stats;
  try {
    top = lstatSync(root);
  } catch {
    out.missing = true;
    return out;
  }
  if (top.isSymbolicLink()) {
    skip('', 'link');
    return out;
  }
  if (top.isFile()) {
    if (signIn(root)) skip('', 'sign-ins');
    else take(root, '', top);
    return out;
  }
  if (!top.isDirectory()) {
    out.missing = true;
    return out;
  }
  const walk = (folder: string) => {
    let names: string[];
    try {
      names = readdirSync(folder).sort();
    } catch {
      skip(slash(relative(root, folder)), 'unreadable');
      return;
    }
    for (const name of names) {
      if (out.tooBig) return;
      const abs = join(folder, name);
      const rel = slash(relative(root, abs));
      const line = hardLine(abs, o.apps);
      if (line !== null) {
        skip(rel, line);
        continue;
      }
      if (leftOut(name, o.leaveOut, o.loose)) {
        skip(rel, 'left-out');
        continue;
      }
      if (signIn(abs)) {
        skip(rel, 'sign-ins');
        continue;
      }
      let st: Stats;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) skip(rel, 'link');
      else if (st.isDirectory()) walk(abs);
      else if (st.isFile()) take(abs, rel, st);
    }
  };
  walk(root);
  return out;
}

/**
 * Each `.env` file git ignores in every repository under a folder, as `<repository>/<file>` from the folder, read whole.
 * Found as `sync inventory` finds them: `git status --porcelain=v1 -z --ignored` with the optional locks off, which
 * names an ignored folder once and never the files inside it, so nothing under `node_modules` is read.
 */
export async function gatherEnv(root: string, o: GatherOptions, git: Git = runGit): Promise<Gathered> {
  const out: Gathered = { entries: [], skipped: [], size: 0, missing: false, tooBig: false };
  try {
    if (!lstatSync(root).isDirectory()) out.missing = true;
  } catch {
    out.missing = true;
  }
  if (out.missing) return out;
  for (const repo of reposUnder(root)) {
    /* The command as it is typed, a word an argument, as `sync inventory` runs it. */
    const status = await git(repo, 'status --porcelain=v1 -z --ignored'.split(' '));
    if (status === null) continue;
    for (const entry of status.split('\0')) {
      if (!entry.startsWith('!! ')) continue;
      const path = entry.slice(3);
      const name = path.split('/').at(-1) ?? '';
      if (path.endsWith('/') || !name.startsWith('.env') || leftOut(name, o.leaveOut, o.loose)) continue;
      const abs = join(repo, path);
      const rel = slash(relative(root, abs));
      const line = hardLine(abs, o.apps);
      if (line !== null) {
        out.skipped.push({ path: rel, why: line });
        continue;
      }
      let st: Stats;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) out.skipped.push({ path: rel, why: 'link' });
      else if (st.isFile()) {
        if (out.size + st.size > MOST_CARRIED) {
          out.tooBig = true;
          return out;
        }
        let bytes: Buffer;
        try {
          bytes = readFileSync(abs);
        } catch {
          out.skipped.push({ path: rel, why: 'unreadable' });
          continue;
        }
        if (holdsLogin(bytes)) out.skipped.push({ path: rel, why: 'login' });
        else {
          out.entries.push({ path: rel, bytes, mode: st.mode & 0o777 });
          out.size += bytes.length;
        }
      }
    }
  }
  return out;
}

/**
 * Tool sign-ins kept in a Keychain item, as one entry at the root: the item's value read through the store, never
 * printed. An item that holds the claude.ai login is refused, since that is a profile's own item, whatever its name.
 */
export async function gatherItem(item: Item, store: SecretStore): Promise<Gathered | { failed: string }> {
  const got = await store.read(item);
  if (!got.ok) return { failed: got.why };
  const out: Gathered = { entries: [], skipped: [], size: 0, missing: got.value === null, tooBig: false };
  if (got.value === null) return out;
  const bytes = Buffer.from(got.value, 'utf8');
  if (holdsLogin(bytes)) out.skipped.push({ path: '', why: 'login' });
  else {
    out.entries.push({ path: '', bytes, mode: 0o600 });
    out.size = bytes.length;
  }
  return out;
}

/* ── the archive ───────────────────────────────────────────────────────── */

const ARCHIVE = Buffer.from('BDA1', 'latin1');

/** One file as the archive's head names it. */
export type Listed = { path: string; size: number; mode: number; sha256: string };

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Whether a place inside an archive may be placed: the root itself, or folders and a name with `/` between them, none
 * of them empty, `.`, `..`, or holding `\`, `:` or a control character, so no archive writes outside its root.
 */
export const safePath = (path: string): boolean =>
  path === '' || path.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/u.test(part));

/** The files as one archive, in the order given. */
export function pack(entries: readonly Entry[]): Buffer {
  const head = Buffer.from(JSON.stringify({ v: 1, files: entries.map((e) => ({ path: e.path, size: e.bytes.length, mode: e.mode, sha256: sha256(e.bytes) })) }), 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(head.length);
  return Buffer.concat([ARCHIVE, size, head, ...entries.map((e) => e.bytes)]);
}

/**
 * An archive read back: each file, and the places whose bytes do not match the hash the head gives. `null` for bytes
 * that are not an archive, a head out of shape, a place that is not safe, or sizes that do not add up.
 */
export function unpack(bytes: Buffer): { entries: Entry[]; listed: Listed[]; mismatched: string[] } | null {
  if (bytes.length < 8 || !bytes.subarray(0, 4).equals(ARCHIVE)) return null;
  const headSize = bytes.readUInt32BE(4);
  if (8 + headSize > bytes.length) return null;
  let head: unknown;
  try {
    head = JSON.parse(bytes.subarray(8, 8 + headSize).toString('utf8'));
  } catch {
    return null;
  }
  if (!isObject(head) || head.v !== 1 || !Array.isArray(head.files)) return null;
  const listed: Listed[] = [];
  for (const f of head.files) {
    if (!isObject(f) || typeof f.path !== 'string' || !safePath(f.path) || typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size < 0 || typeof f.sha256 !== 'string') return null;
    listed.push({ path: f.path, size: f.size, mode: typeof f.mode === 'number' ? f.mode & 0o777 : 0o644, sha256: f.sha256 });
  }
  if (listed.some((f) => f.path === '') && listed.length > 1) return null;
  let at = 8 + headSize;
  const entries: Entry[] = [];
  const mismatched: string[] = [];
  for (const f of listed) {
    if (at + f.size > bytes.length) return null;
    const body = Buffer.from(bytes.subarray(at, at + f.size));
    at += f.size;
    if (sha256(body) !== f.sha256) mismatched.push(f.path);
    entries.push({ path: f.path, bytes: body, mode: f.mode });
  }
  return at === bytes.length ? { entries, listed, mismatched } : null;
}

/* ── placing ───────────────────────────────────────────────────────────── */

/** Where an archive's file goes under a root: the root itself for `''`, or `null` for a place outside it. */
export function targetIn(root: string, path: string, loose: boolean): string | null {
  if (!safePath(path)) return null;
  const file = path === '' ? resolve(root) : resolve(root, ...path.split('/'));
  return within(root, file, loose) ? file : null;
}

/** Whether a file on this machine holds exactly these bytes. */
export function holds(file: string, bytes: Uint8Array): boolean {
  try {
    const st = lstatSync(file);
    return st.isFile() && st.size === bytes.length && readFileSync(file).equals(Buffer.from(bytes));
  } catch {
    return false;
  }
}

/**
 * A file put in place whole: written beside itself and renamed over, so a reader never finds half of it, at the mode
 * the archive gives on a system that keeps modes. Its folder is made first, at 0700 where it is new.
 */
export function writeWhole(file: string, bytes: Uint8Array, mode: number): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.braindog-${String(process.pid)}.tmp`;
  try {
    writeFileSync(tmp, bytes, { mode: mode & 0o777 });
    chmodSync(tmp, mode & 0o777);
    renameSync(tmp, file);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* Never written, or gone already. */
    }
    throw e;
  }
}

/**
 * A copy of a file about to be replaced, kept under `~/.braindog/sync-kept/<when>/`, away from the file, so a copy of a
 * secret never lands inside a repository where it could be committed. Its place under the home is kept, or its whole
 * path with the drive's colon taken out when it is outside the home. Where it went, as the lines say it.
 */
export function keepAside(file: string, o: { home: string; stamp: string }): string {
  const rel = within(o.home, file, true) ? relative(o.home, file) : resolve(file).replace(/^([A-Za-z]):/u, '$1');
  const kept = join(o.home, '.braindog', 'sync-kept', o.stamp, ...partsOf(rel));
  mkdirSync(dirname(kept), { recursive: true, mode: 0o700 });
  copyFileSync(file, kept);
  chmodSync(kept, 0o600);
  return kept;
}
