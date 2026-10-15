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
 * IT ONLY LISTS, UNLESS HE SAYS. Bare, it sends nothing, files no question and writes nothing; nothing runs it by
 * itself. With `--deposit` it runs `put --from` for each place it found, which asks him about each key on the terminal
 * before it is sent. With `--ask` it files one question on Decide, "Add these 4 keys to Keys? They are kept in files on
 * this machine.", signed by his login: a key a row each, its name, its kind, what it opens, the folder and file it lies
 * in, and its project, and never its value, which this command never read. A name Keys already holds is left out.
 * Nothing is added until he accepts it there.
 *
 * THE PRINTED COMMANDS NAME A PROJECT, `--project` or else the scanned folder's own name, for him to read and correct.
 * `--deposit` takes a project only when `--project` names one, and otherwise sends through the door `put` uses, so a
 * folder's name is never taken for a project's grant without him saying so.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import type { KeysIo } from './keys.ts';
import { KEYS, readAll, shapeOf, type Reader } from './keys-list.ts';
import { exampleNamed, keyFileNamed, linesNamed, linesOf, nameSays, NOT_A_KEY, putMany } from './keys-many.ts';
import { decideLink } from './links.ts';

const USAGE = 'braindog keys scan takes one folder or none, [--project <name>], [--deposit] or [--ask], and [--host <host>], and nothing else.';

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

export type ScanOptions = { deposit?: boolean | undefined; ask?: boolean | undefined; project?: string | undefined; host?: string | undefined };

/** The most keys one question carries: the record takes a set of at most 200 rows in one question. */
export const ASK_MOST = 200;

/** One key as the question offers it: the facts of the row it would add, and never a value, which was never read. */
export type Offered = { label: string; kind: 'api_token' | 'ssh_key'; opens: string; where: string; project?: string };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A name as the list folds it to tell two keys apart, case and runs of space set aside. */
const folded = (name: string): string => name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

/** What a key opens when nothing says: its name in words, as `put --from` says it, `STRIPE_SECRET_KEY` as "stripe secret key". */
const opensOf = (name: string): string => name.replace(/[_.@-]+/g, ' ').trim().toLowerCase() || name;

/** The kind the vault keeps a key as: a private key file is an SSH key, and anything else a token. */
const kindOf = (file: string): Offered['kind'] => (/^id_|\.pem$|(?:^|[._-])private[._-]?key$/i.test(basename(file)) ? 'ssh_key' : 'api_token');

/** Where a key lies, as a person finds it: the folder it is in and the file's name, never the whole path. */
export const lyingAt = (file: string): string => `${basename(dirname(file))}/${basename(file)}`;

/**
 * The keys one question would add: one a name, where it first lies, and none Keys already holds. A name is held when a
 * live key of that label applies to the same project or everywhere, as the list tells two keys apart (its `same:` is
 * the label within a project); asked for no project, a live key of that label anywhere holds it. A name that could be
 * a key itself is never offered, since it would be sent as the label.
 */
export function offered(found: readonly Lying[], held: readonly unknown[], shape: ReturnType<typeof shapeOf>, project: string | null): Offered[] {
  const have = new Set<string>();
  for (const r of held) {
    if (!isObject(r) || !isObject(r.fields)) continue;
    const f = r.fields;
    if (shape.done.includes(text(f[shape.state]))) continue;
    const label = folded(text(f[shape.title]));
    const of = text(f[shape.project]);
    if (label !== '' && (project === null || of === '' || of === project)) have.add(label);
  }
  const out: Offered[] = [];
  for (const k of found) {
    const key = folded(k.name);
    if (!nameSays(k.name) || have.has(key)) continue;
    have.add(key);
    out.push({ label: k.name, kind: kindOf(k.file), opens: opensOf(k.name), where: lyingAt(k.file), ...(project === null ? {} : { project }) });
  }
  return out;
}

/** The question in words: "Add these 4 keys to Keys? They are kept in files on this machine." */
export const askWords = (n: number, list: string): string =>
  n === 1 ? `Add this key to ${list}? It is kept in a file on this machine.` : `Add these ${String(n)} keys to ${list}? They are kept in files on this machine.`;

/** What the scan hands on under `--json`: each key by name and file, and the commands that seal them. */
type ScanDoc = { keys: { name: string; file: string }[]; commands: string[] };

/**
 * `--ask`: one question on Decide that adds the keys found to Keys, signed by his login, and the exit code: 0 asked or
 * nothing to ask, 1 refused, 3 unreachable. It reads Keys first, under the login and naming no run, so a name the
 * record holds is left out and said as a count. The project is `--project`, or the scanned folder's name when a project
 * of his is called that; a `--project` that names none of his asks nothing, and a folder that names none asks for keys
 * that apply everywhere, and says so. The question is filed under a cause made of the project and the names, so
 * asking again before he answers joins the one waiting.
 */
async function askKeys(top: string, found: Scanned, doc: ScanDoc, opts: ScanOptions, io: KeysIo, print: (line: string) => void): Promise<number> {
  let to: Target;
  try {
    to = target(opts.host, io.env, io.file, io.now?.() ?? Date.now());
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /* NO SESSION HEADERS: the question is the login's, the person at the terminal, and names no run. */
  const signal = AbortSignal.timeout(budgetOf(io.env));
  const client: Reader = clientFor(to, async () => ({}), io.signal ? AbortSignal.any([signal, io.signal]) : signal);
  const line = (r: Result<unknown>): string => (refused(r) && r.refusal.code === 'UNREACHABLE' ? `${to.key} did not answer.` : printable(fixOf(r)));

  const decl = await client.call('schema', { register: KEYS });
  if (!decl.ok) {
    if (refused(decl) && decl.refusal.code === 'REGISTER_UNKNOWN') {
      io.say('Your record keeps no list of keys yet, so nothing was asked.');
      return 1;
    }
    return refuse(io, decl, line(decl));
  }
  const shape = shapeOf(decl.value);
  const list = isObject(decl.value) && text(decl.value.name) !== '' ? printable(text(decl.value.name)) : 'Keys';

  /* THE PROJECT BY ITS ROW, read from the list the Keys list's own scoped link points at. */
  let project: string | null = null;
  const named = opts.project ?? basename(top);
  if (shape.projects !== '') {
    const [rows, home] = await Promise.all([readAll(client, shape.projects), client.call('schema', { register: shape.projects })]);
    if (!rows.ok) return refuse(io, rows, line(rows));
    const title = home.ok && isObject(home.value) ? text(home.value.title) || 'name' : 'name';
    const match = rows.value.find((r) => isObject(r) && typeof r.id === 'string' && isObject(r.fields) && text(r.fields[title]).toLowerCase() === named.toLowerCase());
    project = isObject(match) && typeof match.id === 'string' ? match.id : null;
  }
  /* THE NAME TYPED IS NOT SAID BACK (`keys-list.ts`): a value pasted in its place would be printed. */
  if (project === null && opts.project !== undefined) {
    io.say('No project of yours has that name, so nothing was asked.');
    return 1;
  }

  const held = await readAll(client, KEYS);
  if (!held.ok) return refuse(io, held, line(held));
  const all = offered(found.keys, held.value, shape, project);
  const distinct = new Set(found.keys.filter((k) => nameSays(k.name)).map((k) => folded(k.name))).size;
  const already = distinct - all.length;
  if (all.length === 0) {
    io.answer?.({ value: { ...doc, asked: null } });
    io.say(`Every key found here is in ${list} already, so nothing was asked.`);
    return 0;
  }
  const rows = all.slice(0, ASK_MOST);
  const question = askWords(rows.length, list);
  const fields = rows.map((o) => ({
    [shape.title]: o.label,
    [shape.opens]: o.opens,
    kind: o.kind,
    [shape.where]: o.where,
    ...(o.project === undefined ? {} : { [shape.project]: o.project }),
  }));
  const names = createHash('sha256').update(rows.map((o) => folded(o.label)).sort().join('\n')).digest('hex').slice(0, 24);
  const filed = await client.call('propose', {
    question,
    body_kind: 'rowset',
    body: { register: KEYS, rows: fields, details: { found: rows.length, folder: basename(top) } },
    cause: `keys-scan#${project ?? 'everywhere'}#${names}`,
  });
  if (!filed.ok) return refuse(io, filed, line(filed));
  const id = isObject(filed.value) && typeof filed.value.id === 'string' ? filed.value.id : '';
  const again = isObject(filed.value) && filed.value.joined === true;
  const link = decideLink(to, id);
  io.answer?.({ value: { ...doc, asked: { question, again, link, adds: rows.map((o) => ({ name: o.label, kind: o.kind, where: o.where })) } } });
  print(`${again ? 'Already on Decide' : 'Asked on Decide'}: ${question}`);
  print(link === null ? '  Answer it on Decide in the app.' : `  ${link}`);
  if (already > 0) io.say(`${String(already)} of the names found ${already === 1 ? 'is' : 'are'} in ${list} already, so ${already === 1 ? 'it was' : 'they were'} left out.`);
  if (project === null)
    io.say(`No project of yours is called ${printable(named)}, so ${rows.length === 1 ? 'this key' : 'these keys'} would apply everywhere. Name one with --project.`);
  if (all.length > rows.length) io.say(`${String(all.length - rows.length)} more wait for the next ask, once you answer this one.`);
  return 0;
}

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
  const doc: ScanDoc = { keys: found.keys.map((k) => ({ name: k.name, file: shown(top, k.file) })), commands };
  /* UNDER `--ask` THE ONE ANSWER COMES AFTER THE QUESTION, so it can say what was asked, or the refusal in its place. */
  if (!opts.ask || found.keys.length === 0) io.answer?.({ value: doc });
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
  if (opts.ask) return askKeys(top, found, doc, opts, io, print);
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
  let values: { project?: string | undefined; deposit?: boolean | undefined; ask?: boolean | undefined; host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      strict: true,
      allowPositionals: true,
      options: { project: { type: 'string' }, deposit: { type: 'boolean' }, ask: { type: 'boolean' }, host: { type: 'string' } },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  /* SEALING AND ASKING ARE TWO ANSWERS TO ONE FIND, so one run does one of them. */
  if (positionals.length > 1 || values.project?.trim() === '' || (values.deposit === true && values.ask === true)) {
    io.say(USAGE);
    return 1;
  }
  return scanKeys(positionals[0] ?? '.', { deposit: values.deposit === true, ask: values.ask === true, project: values.project?.trim(), host: values.host }, io);
}
