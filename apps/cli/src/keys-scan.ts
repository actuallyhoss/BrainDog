/**
 * `braindog keys scan [<folder>] [--project <name>] [--deposit] [--host <host>]`: every key lying in a repository's
 * files, by name (AGT-D08). He had 72 keys in folders and nothing found them; this names each one and the file it lies
 * in, and the one command that seals them, so he can seal them all and delete the copies in the clear.
 *
 * WHAT IS A KEY FILE: a `.env` or `.env.<ending>`, a `.dev.vars`, anything under a folder named `.secrets`, a `.pem` or
 * `.p8`, and a private key file (`id_ed25519`). A copy for others (`.env.example`, `.env.sample`, `.env.template`) is
 * not one. `node_modules` and `.git` are never walked, nor is a link, and a folder with more than 5,000 files below it
 * is passed over and named, so he can scan it by itself.
 *
 * NAMES ONLY, NEVER A VALUE, NEVER A PART OF ONE. A file of `NAME=value` lines is read with `put --from`'s own reader,
 * so a value that runs over several lines is never taken for a name, and only the left side of each `=` is kept; any
 * other key file is named by its file and never opened. What is printed is a name and a path from the top of the scan.
 *
 * IT ONLY LISTS. It sends nothing, files no question and writes nothing; nothing runs it by itself. With `--deposit` it
 * runs `put --from` for each place it found, which asks him about each key on the terminal before it is sent.
 *
 * THE PRINTED COMMANDS NAME A PROJECT, `--project` or else the scanned folder's own name, for him to read and correct.
 * `--deposit` takes a project only when `--project` names one, and otherwise sends through the door `put` uses, so a
 * folder's name is never taken for a project's grant without him saying so.
 */

import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { KeysIo } from './keys.ts';
import { exampleNamed, keyFileNamed, linesNamed, linesOf, nameSays, NOT_A_KEY, putMany } from './keys-many.ts';

const USAGE = 'braindog keys scan takes one folder or none, [--project <name>], [--deposit] and [--host <host>], and nothing else.';

/** A folder with more files than this below it is passed over and named. */
export const FOLDER_LIMIT = 5_000;

/** The folders no scan walks into. */
const NEVER = new Set(['node_modules', '.git']);

/** A file of `NAME=value` lines is read to this size and no further. */
const LINES_LIMIT = 1024 * 1024;

/** One key lying in a file: its name, the file it lies in, and the path `put --from` seals it from. */
export type Lying = { name: string; file: string; from: string };

/** What a scan found: the keys, and the folders it passed over, each as a full path. */
export type Scanned = { keys: Lying[]; passed: string[] };

type Hit = { path: string; secrets: boolean; lines: boolean };

/** Whether a file is a key file, and how it is read, or `null` when it is not one. */
function hitOf(name: string, secrets: boolean): { lines: boolean } | null {
  if (exampleNamed(name)) return null;
  if (linesNamed(name)) return { lines: true };
  if (keyFileNamed(name)) return { lines: false };
  return secrets && !NOT_A_KEY.test(name) ? { lines: false } : null;
}

/**
 * The key files below one folder and how many files it holds, or `null` once that passes the limit. A folder passed
 * over is named in `passed` and its files count for nothing above it. The top of the scan has no limit.
 */
function walk(dir: string, secrets: boolean, capped: boolean, passed: string[]): { hits: Hit[]; count: number } | null {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { hits: [], count: 0 };
  }
  const hits: Hit[] = [];
  let count = 0;
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (NEVER.has(e.name)) continue;
      const below = walk(full, secrets || e.name === '.secrets', true, passed);
      if (below === null) passed.push(full);
      else {
        hits.push(...below.hits);
        count += below.count;
      }
    } else if (e.isFile()) {
      count++;
      const hit = hitOf(e.name, secrets);
      if (hit !== null) hits.push({ path: full, secrets, lines: hit.lines });
    }
    if (capped && count > FOLDER_LIMIT) return null;
  }
  return { hits, count };
}

/** The names in one key file: the left sides of its lines, or its own name. */
function namesOf(hit: Hit): string[] {
  const own = basename(hit.path).replace(/\.txt$/i, '');
  if (!hit.lines) return [nameSays(own) ? own : 'A name shaped like a key'];
  let size = 0;
  try {
    size = statSync(hit.path).size;
  } catch {
    return [];
  }
  if (size > LINES_LIMIT) return [];
  let text: string;
  try {
    text = readFileSync(hit.path, 'utf8');
  } catch {
    return [];
  }
  const read = linesOf(text, basename(hit.path));
  /* THE NAMES ARE KEPT AND THE REST GOES: nothing of what was read to the right of an `=` leaves this function. */
  return [...read.found.map((f) => f.name), ...read.unsent.map((u) => u.name)];
}

/** Every key lying below `top`, by name, with where it lies and the path that seals it. */
export function findKeys(top: string): Scanned {
  const passed: string[] = [];
  const walked = walk(top, basename(top) === '.secrets', false, passed) ?? { hits: [], count: 0 };
  const keys: Lying[] = [];
  for (const hit of walked.hits) {
    /* A FILE UNDER `.secrets` IS SEALED WITH ITS FOLDER, which `put --from` reads one key a file; any other alone. */
    const from = hit.secrets ? dirname(hit.path) : hit.path;
    for (const name of namesOf(hit)) keys.push({ name, file: hit.path, from });
  }
  /* A folder passed over inside another passed over is said once, as the outer one. */
  const outer = passed.filter((p) => !passed.some((q) => q !== p && p.startsWith(q + sep)));
  return { keys, passed: outer };
}

/** A path or a name as a shell reads it back unchanged: bare when it is plain, in single quotes otherwise. */
export const shellWord = (word: string): string => (/^[A-Za-z0-9_./@#:+-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

/** A path as a person reads it, from `from`, with forward slashes on every machine. */
const shown = (from: string, path: string): string => relative(from, path).split(sep).join('/') || '.';

export type ScanOptions = { deposit?: boolean | undefined; project?: string | undefined; host?: string | undefined };

/**
 * Name every key below `root` and the command that seals each place, and with `deposit` run that command for each, and
 * the exit code: 0, or the worst `put --from` gave.
 */
export async function scanKeys(root: string, opts: ScanOptions, io: KeysIo): Promise<number> {
  const here = io.cwd ?? process.cwd();
  const top = resolve(here, root);
  let folder = false;
  try {
    folder = statSync(top).isDirectory();
  } catch {
    folder = false;
  }
  if (!folder) {
    io.say('braindog keys scan reads a folder, and that path is not one.');
    return 1;
  }
  const print = io.out ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const found = findKeys(top);
  for (const p of found.passed) io.say(`${shown(top, p)} holds more than 5,000 files, so it was passed over. Scan it by itself to read it.`);

  const project = opts.project ?? basename(top);
  const places = [...new Set(found.keys.map((k) => k.from))];
  const commands = places.map((from) => `braindog keys put --from ${shellWord(shown(here, from))} --project ${shellWord(project)}`);
  io.answer?.({ value: { keys: found.keys.map((k) => ({ name: k.name, file: shown(top, k.file) })), commands } });
  if (found.keys.length === 0) {
    io.say('No key lies in the files here.');
    return 0;
  }
  for (const k of found.keys) print(`${k.name} · ${shown(top, k.file)}`);
  const files = new Set(found.keys.map((k) => k.file)).size;
  io.say(
    `${String(found.keys.length)} ${found.keys.length === 1 ? 'key lies' : 'keys lie'} in ${String(files)} ${files === 1 ? 'file' : 'files'}. ${places.length === 1 ? 'This seals them' : 'These seal them'}, asking you about each key first:`,
  );
  for (const c of commands) print(`  ${c}`);
  if (!opts.deposit) return 0;

  /* THE SAME `put --from` HE COULD TYPE, one place at a time. Its answers are not handed on: the scan's is the one. */
  const quiet: KeysIo = { ...io, answer: undefined };
  let worst = 0;
  for (const from of places) {
    const code = await putMany(from, { project: opts.project, host: opts.host }, quiet);
    worst = Math.max(worst, code);
    if (code === 3) break;
  }
  return worst;
}

/** `braindog keys scan ...`: the flags read, then `scanKeys`. */
export async function keysScan(args: string[], io: KeysIo): Promise<number> {
  let values: { project?: string | undefined; deposit?: boolean | undefined; host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      strict: true,
      allowPositionals: true,
      options: { project: { type: 'string' }, deposit: { type: 'boolean' }, host: { type: 'string' } },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  if (positionals.length > 1 || values.project?.trim() === '') {
    io.say(USAGE);
    return 1;
  }
  return scanKeys(positionals[0] ?? '.', { deposit: values.deposit === true, project: values.project?.trim(), host: values.host }, io);
}
