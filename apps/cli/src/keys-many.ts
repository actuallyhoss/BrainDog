/**
 * `braindog keys put --from <file or folder> [--project <name>] [--opens <what>] [--kind <kind>] [--dry-run] [--host
 * <host>]`: a whole file or folder of keys into the Keychain in one command. His 72 went in one `keys put` at a
 * time, and this is the bulk path.
 *
 * A FILE IS `NAME=value` LINES, as a `.env` is: blanks and `#` comments skipped, `export ` and one pair of quotes taken
 * off. A private key file (`.pem`, `.p8`, `id_ed25519`) is the one exception, a single key named by its file. A FOLDER
 * IS ONE KEY A FILE, named by the file, except a `.env` inside it, which is lines again. Only what he names is read: no
 * folder inside it, no link out of it.
 *
 * EACH KEY IS ASKED ABOUT ON THE TERMINAL BEFORE IT IS SENT, one yes or no each, because a credential is his. With no
 * terminal to ask at nothing is sent. `--dry-run` asks nothing and sends nothing, and says what each would do.
 *
 * NAMES ARE PRINTED AND VALUES NEVER ARE. A value is read here, held in a `Found`, and handed to `sealOne` in `keys.ts`,
 * which is where it is branded and the one place it leaves, in the deposit's request. No line here, no answer under
 * `--json` and no error quotes one, nor any part of one. A name that looks like a key itself is said as "a name shaped
 * like a key" and refused, in case a value was written where its name belongs.
 *
 * ONE REQUEST A KEY, through the door `put` uses (`manyDoor`). Under the login a name the record already holds is
 * skipped and counted, because the login adds and never replaces; under keychain access for the project its value is
 * replaced, and the line says "replaced".
 */

import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { budgetOf, clientFor, target } from './http.ts';
import { looksLikeToken } from './install.ts';
import { shapeOf } from './keys-list.ts';
import { manyDoor, sealOne, type KeysIo, type ManyDoor } from './keys.ts';

const USAGE = 'braindog keys put --from takes one file or folder, [--project <name>], [--opens <what>], [--kind <kind>], [--dry-run] and [--host <host>], and nothing else.';

/** The deposit door's own limit on one value. */
const VALUE_LIMIT = 64 * 1024;

/** One key as it was read: its name, where it came from, and its value, which goes nowhere but `sealOne`. */
export type Found = { name: string; from: string; value: string; kind?: string | undefined };

/** A name that was not sent, the words for why, and whether that counts as refused or as skipped. */
export type Unsent = { name: string; why: string; refused: boolean };

/** What a name that cannot be printed is said as. */
const SHAPED = 'A name shaped like a key';

/** What a file or a folder holds: the keys, the names that cannot be sent, and how many lines were not `NAME=value`. */
export type Read = { found: Found[]; unsent: Unsent[]; unread: number };

/** `NAME=value`, with `export ` before it allowed. */
const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/;

/** A file named for `NAME=value` lines: `.env`, `.env.local`, `.dev.vars`, `prod.env`. */
export const linesNamed = (name: string): boolean => /^\.env(?:\..+)?$/.test(name) || /^\.dev\.vars(?:\..+)?$/.test(name) || /.\.env$/.test(name);

/** A file that is a copy for others, with no real value in it, which nothing reads. */
export const exampleNamed = (name: string): boolean => /\.(?:example|sample|template)$/.test(name);

/** A private key file: one key, named by its file. */
export const keyFileNamed = (name: string): boolean =>
  /\.(?:pem|p8)$/i.test(name) || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?$/.test(name) || /(?:^|[._-])private[._-]?key$/i.test(name);

/** The Keychain's kind for a key read from a file, when the file's name says it. */
const kindOf = (name: string): string | undefined => (/^id_/.test(name) ? 'ssh_key' : undefined);

/** The names a folder of keys holds beside its keys, which are never a key. */
export const NOT_A_KEY = /^(?:\.DS_Store|\.gitignore|\.gitkeep|Thumbs\.db|README(?:\..*)?)$/i;

/**
 * Whether a name may be printed and sent as a label. The shape of a variable or a file name, and not the shape of a
 * key: an upper-case name is a name whatever it holds, unless it runs twelve letters and digits together, which a
 * name does not and an access key's id does.
 */
export function nameSays(name: string): boolean {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.@-]{0,99}$/.test(name)) return false;
  if (name === name.toUpperCase()) return !/(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{12,}/.test(name);
  return !name.split(/[._@-]/).some((piece) => looksLikeToken(piece));
}

/** Where the quote that opened a value at 0 closes, or -1. A `\\` in double quotes escapes the next character. */
function closeAt(s: string, quote: string): number {
  for (let i = 1; i < s.length; i++) {
    if (quote === '"' && s[i] === '\\') i++;
    else if (s[i] === quote) return i;
  }
  return -1;
}

/**
 * The keys in a file of `NAME=value` lines. A quoted value that does not close on its line runs on to the line that
 * closes it, as a private key pasted into a `.env` does; one that never closes is refused rather than guessed at.
 * Inside double quotes `\n` is a line break; after a bare value ` # note` is a note.
 */
export function linesOf(text: string, from: string, out: Read = { found: [], unsent: [], unread: 0 }): Read {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) {
      out.unread++;
      continue;
    }
    const name = m[1]!;
    let raw = m[2]!.trim();
    const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : null;
    if (quote === null) {
      add(out, name, from, raw.replace(/\s+#.*$/, ''));
      continue;
    }
    let end = closeAt(raw, quote);
    while (end === -1 && i + 1 < lines.length) {
      raw += `\n${lines[++i]!}`;
      end = closeAt(raw, quote);
    }
    if (end === -1) {
      out.unsent.push({ name: nameSays(name) ? name : SHAPED, why: 'refused, because its quote never closes', refused: true });
      continue;
    }
    const inner = raw.slice(1, end);
    add(out, name, from, quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\(["\\])/g, '$1') : inner);
  }
  return out;
}

/** One key into what was read, or the reason it is not sent. */
function add(out: Read, name: string, from: string, value: string, kind?: string): void {
  if (!nameSays(name)) out.unsent.push({ name: SHAPED, why: 'refused, so it was not sent', refused: true });
  else if (out.found.some((f) => f.name === name) || out.unsent.some((u) => u.name === name)) out.unsent.push({ name, why: 'refused, because it is named twice', refused: true });
  else if (value === '') out.unsent.push({ name, why: 'skipped, because it holds no value', refused: false });
  else if (value.length > VALUE_LIMIT) out.unsent.push({ name, why: 'refused, because it is longer than a key may be', refused: true });
  else out.found.push({ name, from, value, ...(kind ? { kind } : {}) });
}

/** What `put --from` read from one path: the keys, and what it holds that was not read, such as a folder inside. */
export type FromRead = Read & { folder: boolean; name: string; left: number };

/** The most a file of `NAME=value` lines is read to. */
const FILE_LIMIT = 1024 * 1024;

/** One file of a folder, or the file named: lines, or one key named by the file. */
function readOne(path: string, name: string, out: Read, size: number, asLines: boolean): void {
  const keyName = name.replace(/\.txt$/i, '');
  if (size > (asLines ? FILE_LIMIT : VALUE_LIMIT)) {
    out.unsent.push({ name: nameSays(keyName) ? keyName : SHAPED, why: 'refused, because the file is larger than keys are', refused: true });
    return;
  }
  const text = readFileSync(path, 'utf8');
  if (text.includes('\0')) {
    out.unsent.push({ name: nameSays(keyName) ? keyName : SHAPED, why: 'refused, because the file is not text', refused: true });
    return;
  }
  /* One trailing line break is what an editor adds, and never part of a key, as `put` says. */
  if (asLines) linesOf(text, name, out);
  else add(out, keyName, name, text.replace(/\r?\n$/, ''), kindOf(name));
}

/**
 * The keys at one path, or the one sentence for why there are none to read. THE PATH IS NOT SAID BACK in a sentence,
 * only the last part of it in the line that says the folder is his to delete.
 */
export function readFrom(path: string): FromRead | string {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return 'Nothing is at the path --from names, so nothing was read.';
  }
  const out: FromRead = { found: [], unsent: [], unread: 0, folder: stat.isDirectory(), name: basename(path), left: 0 };
  if (stat.isFile()) {
    readOne(path, out.name, out, stat.size, !keyFileNamed(out.name));
    return out;
  }
  if (!stat.isDirectory()) return 'The path --from names is neither a file nor a folder, so nothing was read.';
  /* NO FOLDER INSIDE IT AND NO LINK OUT OF IT: only what he named, and a link could point at any key on the machine. */
  for (const name of readdirSync(path).sort((a, b) => a.localeCompare(b))) {
    const full = join(path, name);
    const entry = lstatSync(full);
    if (entry.isSymbolicLink() || entry.isDirectory()) out.left++;
    else if (entry.isFile() && !NOT_A_KEY.test(name) && !exampleNamed(name)) readOne(full, name, out, entry.size, linesNamed(name));
  }
  return out;
}

/**
 * The door for one project named by a person: that project's keychain access, or the sentence that says how to get one.
 *
 * A GRANT IS KEPT UNDER WHAT `login --keychain` WAS GIVEN, a spoken id such as `things#3` or a row's id, and a person names
 * a project by its name. So a grant kept under the very words typed is taken first, and otherwise the record is read,
 * under the login and naming no run, for the project of that name, and a grant kept under its row's id or its spoken
 * id is taken. Never the login in its place: under the login a key goes to the run's project, not the one named.
 */
export async function projectDoor(project: string, host: string | undefined, io: KeysIo): Promise<ManyDoor | string> {
  const typed = manyDoor({ host, project }, io);
  if (typeof typed !== 'string') return typed;
  const ids: string[] = [];
  let login = 'braindog login <host>';
  try {
    const now = io.now?.() ?? Date.now();
    const signal = AbortSignal.timeout(budgetOf(io.env));
    const to = target(host, io.env, io.file, now);
    login = `braindog login ${to.key}`;
    const client = clientFor(to, async () => ({}), io.signal ? AbortSignal.any([signal, io.signal]) : signal);
    const decl = await client.call('schema', { register: 'credentials' });
    const projects = shapeOf(decl.ok ? decl.value : null).projects;
    const home = projects === '' ? null : await client.call('schema', { register: projects });
    const title = home?.ok && isObject(home.value) && typeof home.value.title === 'string' && home.value.title ? home.value.title : 'name';
    const rows = projects === '' ? null : await client.call('list', { register: projects, limit: 200 });
    const held = rows?.ok && isObject(rows.value) && Array.isArray(rows.value.rows) ? (rows.value.rows as unknown[]) : [];
    for (const r of held) {
      if (!isObject(r) || !isObject(r.fields) || typeof r.fields[title] !== 'string') continue;
      if (r.fields[title].trim().toLowerCase() !== project.toLowerCase()) continue;
      for (const id of [r.spoken, r.id]) if (typeof id === 'string' && id) ids.push(id);
    }
  } catch {
    /* No record to ask is the sentence below, which says what to run. */
  }
  for (const id of ids) {
    const door = manyDoor({ host, project: id }, io);
    if (typeof door !== 'string') return door;
  }
  return ids.length > 0
    ? `No keychain access for that project is kept here. Run ${login} --keychain ${ids[0]!}, then this again.`
    : `No keychain access for that project is kept here, and no project of yours has that name. Run ${login} --keychain <project>, as things#3, then this again.`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** What a key opens when `--opens` does not say: its name in words, `STRIPE_SECRET_KEY` as "stripe secret key". */
const wordsOf = (name: string): string => name.replace(/[_.@-]+/g, ' ').trim().toLowerCase() || name;

const NO_TERMINAL = 'braindog keys put --from asks you to confirm each key on the terminal before it is sent, and there is no terminal here, so nothing more was sent.';

export type PutOptions = { project?: string | undefined; dryRun?: boolean | undefined; opens?: string | undefined; kind?: string | undefined; host?: string | undefined };

/** "1 key", "3 keys". */
const keysCount = (n: number): string => `${String(n)} ${n === 1 ? 'key' : 'keys'}`;

/**
 * Every key in one file or folder, each asked about and then sent through the deposit door, and the exit code: 0 when
 * nothing was refused, 1 when something was, 3 when the host stopped answering (`48 §4.4`).
 */
export async function putMany(from: string, opts: PutOptions, io: KeysIo): Promise<number> {
  const read = readFrom(resolve(io.cwd ?? process.cwd(), from));
  if (typeof read === 'string') {
    io.say(read);
    return 1;
  }
  const sealed: string[] = [];
  const skipped: string[] = [];
  const refused: string[] = [];
  for (const u of read.unsent) {
    (u.refused ? refused : skipped).push(u.name);
    io.say(`${u.name}: ${u.why}.`);
  }
  if (read.unread > 0) io.say(`${String(read.unread)} ${read.unread === 1 ? 'line was' : 'lines were'} not NAME=value, so ${read.unread === 1 ? 'it was' : 'they were'} not read.`);
  if (read.left > 0) io.say(`${String(read.left)} ${read.left === 1 ? 'folder or link' : 'folders or links'} inside it ${read.left === 1 ? 'was' : 'were'} not read.`);
  const counts = () => `${String(sealed.length)} sealed, ${String(skipped.length)} skipped, ${String(refused.length)} refused.`;
  const answer = (would: string[] = []) => io.answer?.({ value: { sent: opts.dryRun !== true, would, sealed, skipped, refused } });

  if (read.found.length === 0) {
    io.say(read.unsent.length === 0 ? 'No key was found there, so nothing was sent.' : `Nothing was sent: ${counts()}`);
    answer();
    return refused.length > 0 ? 1 : 0;
  }
  if (opts.dryRun) {
    for (const f of read.found) io.say(`${f.name}: would be sealed.`);
    io.say(`Nothing was sent: ${keysCount(read.found.length)} would be sealed, ${String(skipped.length)} skipped, ${String(refused.length)} refused.`);
    answer(read.found.map((f) => f.name));
    return refused.length > 0 ? 1 : 0;
  }

  const many = opts.project === undefined ? manyDoor({ host: opts.host }, io) : await projectDoor(opts.project, opts.host, io);
  if (typeof many === 'string') {
    io.say(many);
    return 1;
  }
  if (io.confirm === undefined) {
    io.say(NO_TERMINAL);
    return 1;
  }
  io.say(
    many.replaces
      ? `${keysCount(read.found.length)} to seal. Under the keychain access, a key its project already holds has its value replaced.`
      : `${keysCount(read.found.length)} to seal. Under your login each goes in as a new key, and a name your record already holds is skipped.`,
  );
  let declined = 0;
  let unsent = 0;
  let unreachable = false;
  for (const [i, f] of read.found.entries()) {
    const yes = await io.confirm(read.folder ? `Seal ${f.name} from ${f.from}?` : `Seal ${f.name}?`);
    if (yes === null) {
      io.say(NO_TERMINAL);
      unsent = read.found.length - i;
      break;
    }
    if (!yes) {
      declined++;
      skipped.push(f.name);
      io.say(`${f.name}: skipped, you said no.`);
      continue;
    }
    const got = await sealOne(many, { label: f.name, opens: opts.opens || wordsOf(f.name), kind: opts.kind || f.kind }, f.value, io);
    if ('sealed' in got) {
      sealed.push(f.name);
      io.say(got.sealed === 'replaced' ? `${f.name}: sealed, in place of the value it held.` : `${f.name}: sealed.`);
    } else if ('held' in got) {
      skipped.push(f.name);
      io.say(`${f.name}: skipped, your record already holds it.`);
    } else {
      refused.push(f.name);
      io.say(`${f.name}: refused. ${got.refused}`);
      if (got.unreachable) {
        unreachable = true;
        unsent = read.found.length - i - 1;
        break;
      }
    }
  }
  if (unsent > 0) io.say(`${keysCount(unsent)} more ${unsent === 1 ? 'was' : 'were'} not sent.`);
  io.say(counts());
  /* EVERY KEY THERE IS IN THE KEYCHAIN NOW, sealed here or held already, and nothing in it went unread, so the copy in the
     clear is the one left to remove, and removing it is his. */
  if (refused.length === 0 && declined === 0 && unsent === 0 && read.unread === 0 && read.left === 0)
    io.say(`Every key in ${read.name} is sealed. The ${read.folder ? 'folder' : 'file'} is yours to delete.`);
  answer();
  return unreachable ? 3 : refused.length > 0 || unsent > 0 ? 1 : 0;
}

/** `braindog keys put --from <file or folder> ...`: the flags read, then `putMany`. */
export async function keysPutMany(args: string[], io: KeysIo): Promise<number> {
  let values: { from?: string | undefined; project?: string | undefined; vault?: string | undefined; keychain?: string | undefined; opens?: string | undefined; kind?: string | undefined; host?: string | undefined; 'dry-run'?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        from: { type: 'string' },
        project: { type: 'string' },
        vault: { type: 'string' },
        keychain: { type: 'string' },
        opens: { type: 'string' },
        kind: { type: 'string' },
        host: { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
    }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a value typed as an argument. */
    io.say(USAGE);
    return 1;
  }
  /* `--keychain` IS `--project` UNDER `put`'s OWN NAME for it, and two different ones is a mistake to stop at. */
  values.vault = values.keychain ?? values.vault;
  const project = values.project?.trim() || values.vault?.trim() || undefined;
  const from = values.from?.trim();
  if (!from || (values.project !== undefined && values.vault !== undefined && values.project.trim() !== values.vault.trim())) {
    io.say(USAGE);
    return 1;
  }
  return putMany(from, { project, dryRun: values['dry-run'] === true, opens: values.opens?.trim(), kind: values.kind?.trim(), host: values.host }, io);
}
