/**
 * Unpushed work, carried: for each repository under the Unpushed work place, its commits on no remote, its staged and
 * unstaged changes, and the files git does not ignore and does not track, against a named base commit
 * (`docs/48-SPEC-CLI.md` §5.20, SCOPE §5). `sync push` makes them and seals them with everything else; `braindog sync
 * patches` on another machine clones or checks out the base and applies them, and says what applied.
 *
 * WHAT ONE REPOSITORY BECOMES, under its place from the folder: `repo.json` (its remote, branch, base, head, and the
 * names of what it holds), `commits.bundle` (a git bundle of the commits no remote holds, `<branch> --not --remotes`,
 * or the whole history when no remote holds any of it), `staged.patch` and `unstaged.patch` (`git diff --binary`, a
 * file at a time), and `new/<path>` for each new file. A git bundle and not a mailbox of patches, because it carries a
 * merge as it is and `git` itself checks it against the base.
 *
 * KEY-SHAPED FILES GO TO THE KEYCHAIN INSTEAD. A new or changed file named as a key is kept (`.env`, `.pem`, `id_rsa` and
 * their kind), or whose text holds an issuer's key shape, is left out of the patch and named, with the command that
 * seals it in the Keychain, so a key never rides along with the work. A remote whose address holds a name, a password or
 * anything shaped like a key is carried without them, or not at all.
 *
 * MADE WITHOUT WRITING. Every git command that reads runs with the optional locks off, so the index is left as it was;
 * the one file made is the bundle, in a folder of its own under the system's temporary folder, read and removed.
 *
 * APPLIED ONLY WHERE NOTHING IS LOST. A repository that is not there is cloned from its remote (or from its bundle when
 * it has none); one that is there is used only when it has no changes of its own and its branch has not moved past what
 * comes. Each step stops that repository at its first failure and says which, and no other repository waits on it.
 */

import { execFile } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { caseless, carryRowOf, hardLine, holds, leftOut, MOST_CARRIED, placeOf, targetIn, unpack, writeWhole, type CarryRow, type Entry, type GatherOptions, type Gathered } from './carry.ts';
import { oneLine } from './clip.ts';
import { shown } from './doctor.ts';
import { open } from './sealer.ts';
import { exitOf, isFail, ready, rowsOf, sealedGet, sourceBundle, takeLock, type SyncIo } from './sync-record.ts';
import { reposUnder, runGit, type Git } from './sync.ts';
import { issuerShaped } from './tools.ts';

/** What one repository's work is, as its `repo.json` says it. */
export type Work = {
  v: 1;
  /** Its remote's address, with no name or password in it, or `null` when it has none that may be carried. */
  remote: string | null;
  /** Its branch, or `null` for a detached HEAD. */
  branch: string | null;
  /** The commit the work stands on, which a remote holds, or `null` when no remote holds any of its commits. */
  base: string | null;
  head: string | null;
  commits: number;
  /** Whether the bundle holds the whole history, because no remote holds any of it. */
  whole: boolean;
  staged: string[];
  unstaged: string[];
  added: string[];
  /** Files left out because they look like keys, each to be put in the Keychain from where it is. */
  vault: string[];
};

/** A file named as a key is kept: `.env` and its kind, a key store's ending, or an SSH key's name. */
const KEY_NAMED = /^\.env(?:\..*)?$|^\.(?:npmrc|netrc|pypirc)$|^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:pem|key|p12|pfx|jks|keystore)$/iu;

/** Whether a file of work looks like a key: by its name, or by an issuer's shape in its text. */
const keyShaped = (path: string, text: string): boolean => KEY_NAMED.test(path.split('/').at(-1) ?? '') || issuerShaped(text);

/** The remotes another machine can clone from: `https`, `http`, `ssh` and `git` addresses, and `user@host:path`. */
const CLONABLE = /^(?:(?:https?|ssh|git):\/\/[^\s/]+\/\S+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:\S+)$/u;

/**
 * A remote's address with no name or password in it, or `null` when what is left still holds a key by an issuer's
 * shape (a token in its query, say), or is no address another machine clones from: a folder on this one, a `file:`
 * address, or a transport that runs a program (`ext::`). Judged by the issuers' shapes alone, so a repository whose
 * name mixes letters and digits keeps its remote.
 */
export function cleanRemote(url: string): string | null {
  let clean = url.trim();
  const at = /^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/iu.exec(clean);
  if (at !== null) clean = `${at[1] ?? ''}${clean.slice(at[0].length)}`;
  if (clean === '' || /[\s\0]/u.test(clean) || !CLONABLE.test(clean) || issuerShaped(clean)) return null;
  return clean;
}

const lines = (text: string | null): string[] => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const names = (text: string | null): string[] => (text ?? '').split('\0').filter(Boolean);
const slash = (rel: string): string => rel.split(sep).join('/');

/** What a push makes of the Unpushed work place: the archive's files, and what each repository holds. */
export type Made = Gathered & { repos: { repo: string; work: Work }[] };

/**
 * Every repository's unpushed work under a folder, as files for one archive. A repository with nothing unpushed is
 * left out; one named in Leave out is too, by its folder's name.
 */
export async function makePatches(root: string, o: GatherOptions, git: Git = runGit): Promise<Made> {
  const out: Made = { entries: [], skipped: [], size: 0, missing: false, tooBig: false, repos: [] };
  try {
    if (!lstatSync(root).isDirectory()) out.missing = true;
  } catch {
    out.missing = true;
  }
  if (out.missing) return out;
  const add = (entry: Entry): boolean => {
    if (out.size + entry.bytes.length > MOST_CARRIED) {
      out.tooBig = true;
      return false;
    }
    out.entries.push(entry);
    out.size += entry.bytes.length;
    return true;
  };
  for (const repo of reposUnder(root)) {
    if (out.tooBig) break;
    const rel = slash(relative(root, repo));
    if (rel.split('/').some((part) => leftOut(part, o.leaveOut, o.loose))) {
      out.skipped.push({ path: rel, why: 'left-out' });
      continue;
    }
    if (hardLine(repo, o.apps) !== null) continue;
    const prefix = rel === '' ? '' : `${rel}/`;
    const head = lines(await git(repo, ['rev-parse', '--verify', '-q', 'HEAD']))[0] ?? null;
    const branch = lines(await git(repo, ['symbolic-ref', '--short', '-q', 'HEAD']))[0] ?? null;
    const remotes = lines(await git(repo, ['remote']));
    const name = remotes.includes('origin') ? 'origin' : remotes[0];
    const url = name === undefined ? null : (lines(await git(repo, ['remote', 'get-url', name]))[0] ?? null);
    const work: Work = { v: 1, remote: url === null ? null : cleanRemote(url), branch, base: head, head, commits: 0, whole: false, staged: [], unstaged: [], added: [], vault: [] };

    /* ── the commits no remote holds, as a git bundle ── */
    if (head !== null) {
      const unpushed = lines(await git(repo, ['rev-list', 'HEAD', '--not', '--remotes']));
      work.commits = unpushed.length;
      if (unpushed.length > 0) {
        const boundary = lines(await git(repo, ['rev-list', '--boundary', 'HEAD', '--not', '--remotes'])).filter((l) => l.startsWith('-'));
        work.base = boundary[0]?.slice(1) ?? null;
        work.whole = work.base === null;
        /* THE BRANCH AND HEAD BOTH, so a clone of a bundle that holds the whole history checks its branch out. */
        const refs = branch === null ? ['HEAD'] : [branch, 'HEAD'];
        const folder = mkdtempSync(join(tmpdir(), 'braindog-patches-'));
        try {
          const file = join(folder, 'commits.bundle');
          const made = await git(repo, ['bundle', 'create', file, ...refs, ...(work.whole ? [] : ['--not', '--remotes'])]);
          if (made === null || !add({ path: `${prefix}commits.bundle`, bytes: readFileSync(file), mode: 0o644 })) {
            if (made === null) out.skipped.push({ path: rel, why: 'unreadable' });
            continue;
          }
        } finally {
          rmSync(folder, { recursive: true, force: true });
        }
      }
    }

    /* ── staged and unstaged changes, a file at a time, a key-shaped one routed to the Keychain ── */
    for (const [which, cached] of [
      ['staged', true],
      ['unstaged', false],
    ] as const) {
      const changed = names(await git(repo, ['diff', ...(cached ? ['--cached'] : []), '--name-only', '-z']));
      let patch = '';
      for (const file of changed) {
        const diff = (await git(repo, ['diff', ...(cached ? ['--cached'] : []), '--binary', '--', file])) ?? '';
        if (keyShaped(file, diff)) {
          if (!work.vault.includes(file)) work.vault.push(file);
          continue;
        }
        patch += diff;
        work[which].push(file);
      }
      if (patch !== '' && !add({ path: `${prefix}${which}.patch`, bytes: Buffer.from(patch, 'utf8'), mode: 0o644 })) break;
    }

    /* ── new files git does not ignore ── */
    for (const file of names(await git(repo, ['ls-files', '--others', '--exclude-standard', '-z']))) {
      const abs = join(repo, ...file.split('/'));
      if (hardLine(abs, o.apps) !== null) continue;
      let st: Stats;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (out.size + st.size > MOST_CARRIED) {
        out.tooBig = true;
        break;
      }
      const bytes = readFileSync(abs);
      if (keyShaped(file, bytes.toString('utf8'))) {
        work.vault.push(file);
        continue;
      }
      if (!add({ path: `${prefix}new/${file}`, bytes, mode: st.mode & 0o777 })) break;
      work.added.push(file);
    }

    if (work.commits === 0 && work.staged.length + work.unstaged.length + work.added.length + work.vault.length === 0) continue;
    add({ path: `${prefix}repo.json`, bytes: Buffer.from(`${JSON.stringify(work, null, 2)}\n`, 'utf8'), mode: 0o644 });
    out.repos.push({ repo: rel === '' ? '.' : rel, work });
  }
  return out;
}

/** What a repository's work is said as, in one clause: `2 commits, 1 staged, 3 unstaged and 4 new files`. */
export function workSaid(w: Work): string {
  const parts = [
    w.commits > 0 ? `${String(w.commits)} ${w.commits === 1 ? 'commit' : 'commits'}` : null,
    w.staged.length > 0 ? `${String(w.staged.length)} staged` : null,
    w.unstaged.length > 0 ? `${String(w.unstaged.length)} unstaged` : null,
    w.added.length > 0 ? `${String(w.added.length)} new ${w.added.length === 1 ? 'file' : 'files'}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? 'nothing but files left for the Keychain' : parts.length === 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
}

/** The line that routes key-shaped files to the Keychain, said from the machine they are on. */
export const vaultLine = (repo: string, files: string[]): string =>
  `${oneLine(repo)}: ${files.map(oneLine).join(', ')} ${files.length === 1 ? 'looks' : 'look'} like ${files.length === 1 ? 'a key' : 'keys'}, so ${files.length === 1 ? 'it was' : 'they were'} left out. Put each in the Keychain on that machine: braindog keys put --from <file> for a file of NAME=value lines, or braindog keys put <label> < <file>.`;

/* ── applying ──────────────────────────────────────────────────────────── */

/** Git run in a folder for real, with its exit code and output; it never asks at the terminal. */
type GitRun = (cwd: string, args: string[], ms?: number) => Promise<{ code: number; out: string }>;

const gitRun: GitRun = (cwd, args, ms = 30_000) =>
  new Promise((done) => {
    execFile('git', args, { cwd, encoding: 'utf8', timeout: ms, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, out) =>
      done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(out) }),
    );
  });

/** One repository's work out of an archive: its place, what `repo.json` says, and its files by their names in it. */
type Unpacked = { rel: string; work: Work; files: Map<string, Entry> };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/** A `repo.json` read, or `null` for one out of shape. */
export function readWork(x: unknown): Work | null {
  if (!isObject(x) || x.v !== 1) return null;
  const sha = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{40,64}$/u.test(v) ? v : null);
  return {
    v: 1,
    remote: typeof x.remote === 'string' ? cleanRemote(x.remote) : null,
    branch: typeof x.branch === 'string' && /^[A-Za-z0-9._/-]{1,200}$/u.test(x.branch) && !x.branch.includes('..') ? x.branch : null,
    base: sha(x.base),
    head: sha(x.head),
    commits: typeof x.commits === 'number' ? x.commits : 0,
    whole: x.whole === true,
    staged: strings(x.staged),
    unstaged: strings(x.unstaged),
    added: strings(x.added),
    vault: strings(x.vault),
  };
}

/** The archive's files sorted into repositories by each one's `repo.json`, the longest place first. */
export function byRepository(entries: Entry[]): Unpacked[] {
  const repos: Unpacked[] = [];
  for (const e of entries) {
    if (e.path !== 'repo.json' && !e.path.endsWith('/repo.json')) continue;
    try {
      const work = readWork(JSON.parse(e.bytes.toString('utf8')));
      if (work !== null) repos.push({ rel: e.path.slice(0, -'repo.json'.length).replace(/\/$/u, ''), work, files: new Map() });
    } catch {
      /* Not a repository's note. */
    }
  }
  const longest = [...repos].sort((a, b) => b.rel.length - a.rel.length);
  for (const e of entries) {
    const owner = longest.find((r) => r.rel === '' || e.path.startsWith(`${r.rel}/`));
    if (owner !== undefined) owner.files.set(owner.rel === '' ? e.path : e.path.slice(owner.rel.length + 1), e);
  }
  return repos.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

const isRepo = (dir: string): boolean => {
  try {
    lstatSync(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
};

/** One repository's work applied under its place here, and the one line that says what came of it. */
async function applyOne(dir: string, u: Unpacked, o: { dryRun: boolean; loose: boolean; run: GitRun }): Promise<{ line: string; failed: boolean }> {
  const { work } = u;
  const name = oneLine(u.rel === '' ? '.' : u.rel);
  const what = workSaid(work);
  const base = work.base === null ? 'its whole history' : work.base.slice(0, 7);
  const fail = (why: string) => ({ line: `  ${name}: ${why}`, failed: true });
  let there = false;
  try {
    there = lstatSync(dir).isDirectory();
  } catch {
    there = false;
  }
  const bundle = u.files.get('commits.bundle');
  if (o.dryRun) {
    const how = there ? (isRepo(dir) ? 'applied to the copy here' : 'is a folder here that is not a repository, so it would be left') : work.remote !== null ? `cloned from its remote, then applied` : bundle && work.whole ? 'cloned from its own commits, then applied' : 'not there, and has no remote to clone';
    return { line: `  ${name}: ${what}, against ${base}, would be ${how}.`, failed: false };
  }
  const folder = mkdtempSync(join(tmpdir(), 'braindog-patches-'));
  try {
    const bundleFile = join(folder, 'commits.bundle');
    if (bundle) writeFileSync(bundleFile, bundle.bytes);
    if (!there) {
      const from = work.remote ?? (bundle && work.whole ? bundleFile : null);
      if (from === null) return fail('is not here, and has no remote to clone it from, so nothing was applied.');
      mkdirSync(dirname(dir), { recursive: true });
      const cloned = await o.run(dirname(dir), ['clone', '--quiet', from, dir], 10 * 60_000);
      if (cloned.code !== 0) return fail(`could not be cloned from ${from === bundleFile ? 'its own commits' : oneLine(from)}, so nothing was applied.`);
      /* A CLONE OF ITS OWN COMMITS NAMES NO REMOTE: the bundle it came from is removed below. */
      if (from === bundleFile) await o.run(dir, ['remote', 'remove', 'origin']);
    } else if (!isRepo(dir)) return fail('is a folder here that is not a repository, so nothing was applied.');
    else {
      const status = await o.run(dir, 'status --porcelain=v1'.split(' '));
      if (status.code !== 0) return fail('git could not read the copy here, so nothing was applied.');
      if (status.out.trim() !== '') return fail('has changes of its own here, so nothing was applied. Commit or stash them, then run braindog sync patches again.');
      await o.run(dir, ['fetch', '--all', '--quiet'], 10 * 60_000);
    }
    /* THE COMMIT TO STAND ON: what the bundle brings, else the base. */
    let tip = work.base;
    if (bundle && work.commits > 0) {
      const verified = await o.run(dir, ['bundle', 'verify', '--quiet', bundleFile]);
      if (verified.code !== 0) return fail(`its commits need ${base}, which the copy here does not have. Fetch it, then try again.`);
      const fetched = await o.run(dir, ['fetch', '--quiet', bundleFile, work.branch ?? 'HEAD']);
      if (fetched.code !== 0) return fail('its commits could not be taken in, so nothing was applied.');
      tip = (await o.run(dir, ['rev-parse', 'FETCH_HEAD'])).out.trim() || null;
    }
    if (tip !== null) {
      if ((await o.run(dir, ['cat-file', '-e', `${tip}^{commit}`])).code !== 0) return fail(`the copy here does not have ${tip.slice(0, 7)}, which its work stands on. Fetch it, then try again.`);
      if (work.branch !== null) {
        const local = (await o.run(dir, ['rev-parse', '--verify', '-q', `refs/heads/${work.branch}`])).out.trim();
        if (local !== '' && local !== tip && (await o.run(dir, ['merge-base', '--is-ancestor', local, tip])).code !== 0)
          return fail(`its branch ${oneLine(work.branch)} has moved on here, so nothing was applied.`);
        if ((await o.run(dir, ['checkout', '--quiet', '-B', work.branch, tip])).code !== 0) return fail(`its branch ${oneLine(work.branch)} could not be checked out, so nothing more was applied.`);
      } else if ((await o.run(dir, ['checkout', '--quiet', '--detach', tip])).code !== 0) return fail(`${tip.slice(0, 7)} could not be checked out, so nothing more was applied.`);
    }
    for (const [which, index] of [
      ['staged', true],
      ['unstaged', false],
    ] as const) {
      const patch = u.files.get(`${which}.patch`);
      if (patch === undefined) continue;
      const file = join(folder, `${which}.patch`);
      writeFileSync(file, patch.bytes);
      if ((await o.run(dir, ['apply', ...(index ? ['--index'] : []), '--binary', file])).code !== 0) return fail(`its ${which} changes did not apply, so the rest was not applied either.`);
    }
    const kept: string[] = [];
    for (const [path, entry] of u.files) {
      if (!path.startsWith('new/')) continue;
      const target = targetIn(dir, path.slice('new/'.length), o.loose);
      if (target === null) continue;
      if (holds(target, entry.bytes)) continue;
      try {
        lstatSync(target);
        kept.push(path.slice('new/'.length));
        continue;
      } catch {
        writeWhole(target, entry.bytes, entry.mode);
      }
    }
    const left = kept.length === 0 ? '' : ` ${kept.map(oneLine).join(', ')} ${kept.length === 1 ? 'is' : 'are'} here already and different, so ${kept.length === 1 ? 'it was' : 'they were'} left as ${kept.length === 1 ? 'it is' : 'they are'}.`;
    return { line: `  ${name}: ${what} applied, against ${base}.${left}`, failed: kept.length > 0 };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const USAGE = 'braindog sync patches takes --from <machine>, --dry-run and --host <host>, and nothing else.';

/**
 * `braindog sync patches [--from <machine>] [--dry-run] [--host <host>]`: the unpushed work the newest bundle from
 * another machine carries, or the machine named, applied to each repository under this machine's Unpushed work place.
 * Exit 1 when anything was not applied.
 */
export async function syncPatches(args: string[], io: SyncIo, run: GitRun = gitRun): Promise<number> {
  let values: { from?: string | undefined; 'dry-run'?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { from: { type: 'string' }, 'dry-run': { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const dryRun = values['dry-run'] === true;
  /* ONE SYNC THAT WRITES AT A TIME on this machine, as a push and a pull take their turns. */
  const release = dryRun ? () => undefined : takeLock(io.home, (io.now ?? Date.now)());
  if (release === null) {
    io.say('Another sync is running on this machine. Wait for it to finish, then try again.');
    return 1;
  }
  try {
    return await patches(values.from, values.host, dryRun, io, run);
  } finally {
    release();
  }
}

async function patches(from: string | undefined, host: string | undefined, dryRun: boolean, io: SyncIo, run: GitRun): Promise<number> {
  const r = await ready(io, host, 'apply');
  if (typeof r === 'number') return r;
  const source = await sourceBundle(r, from);
  if (isFail(source)) {
    io.say(source.said);
    return exitOf(source);
  }
  if ('none' in source) {
    io.out(source.none);
    return 1;
  }
  const rows = await rowsOf(r.call, r.lists.carry.id, r.to.key);
  if (isFail(rows)) {
    io.say(rows.said);
    return exitOf(rows);
  }
  const carried = rows.map(carryRowOf).filter((x): x is CarryRow => x !== null);
  const work = source.manifest.rows.filter((b) => b.kind === 'patches');
  io.out(`braindog sync patches: the unpushed work ${oneLine(source.manifest.machine)} sent on ${source.manifest.at.slice(0, 16).replace('T', ' ')}${dryRun ? ', as a dry run' : ''}.`);
  if (work.length === 0) {
    io.out(`${oneLine(source.manifest.machine)}'s last bundle carries no unpushed work.`);
    return 0;
  }
  let failed = false;
  for (const b of work) {
    const row = carried.find((c) => c.seq === b.seq);
    const placed = row === undefined ? null : placeOf(row, r.system, { home: io.home, env: io.env, apps: r.apps });
    if (placed === null || !('place' in placed) || placed.place.kind !== 'path') {
      io.out(`${oneLine(b.name)}: ${placed !== null && 'refused' in placed ? `refused here: ${placed.refused}` : `names no folder on this machine, so its work is not applied here`}.`);
      failed = failed || (placed !== null && 'refused' in placed);
      continue;
    }
    /* THE PLACE THE SEALING MACHINE SAID, as a pull holds it (`sync-pull.ts`): work is not applied in a folder a host named. */
    if (b.places !== undefined && (b.places[r.system] ?? null) !== (row?.places[r.system] ?? null)) {
      io.out(`${oneLine(b.name)}: Carry now names another folder than the one ${oneLine(source.manifest.machine)} sealed it for, so its work is not applied. Send it again from there if the new folder is yours.`);
      failed = true;
      continue;
    }
    const got = await sealedGet(r.call, r.to.key, b.key, b.sha256);
    if (isFail(got)) {
      io.say(got.said);
      return exitOf(got);
    }
    const bytes = got === null ? null : open(r.key, b.key, got);
    const archive = bytes === null ? null : unpack(bytes);
    if (archive === null || archive.mismatched.length > 0) {
      io.out(`${oneLine(b.name)}: its sealed work did not open whole under this machine's sync key, so none of it was applied.`);
      failed = true;
      continue;
    }
    io.out(`${oneLine(b.name)}, under ${oneLine(shown(placed.place.path, io.home))}:`);
    for (const u of byRepository(archive.entries)) {
      const dir = u.rel === '' ? placed.place.path : join(placed.place.path, ...u.rel.split('/'));
      const done = await applyOne(dir, u, { dryRun, loose: caseless(r.system), run });
      failed = failed || done.failed;
      io.out(done.line);
      if (u.work.vault.length > 0) io.out(`  ${vaultLine(u.rel === '' ? '.' : u.rel, u.work.vault)}`);
    }
  }
  io.out(dryRun ? 'That was a dry run, so nothing was cloned, checked out or applied.' : failed ? 'Some work was not applied; each line above says why.' : 'Every repository took its work.');
  return failed ? 1 : 0;
}
