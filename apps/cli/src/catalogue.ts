/**
 * The use-case and add-on SDK on this machine: `braindog usecase|pack new|check|diff|publish|search|key`, `usecase preview`,
 * and `install <id> --from` (`loop/research-marketplace.md` §3, over `@braindog/declare/catalogue`).
 *
 * NEW writes a starting file that already reads through its door (`readShared` for a use case, `readPackFile` for an
 * add-on), so the first `check` passes and every edit after it is checked the way a record will check it.
 *
 * PUBLISH WRITES INTO A CATALOGUE FOLDER, never to a service. The file is read through its door, its version must be later
 * than the latest there and never one already published, and a version that takes a list, page, module or field away must
 * be a major. The file is written byte for byte and `index.json` beside it. With `--sign <key file>` the version carries
 * the author's signature, and once an entry is signed every later version must be signed with the same key.
 *
 * KEY MAKES AN AUTHOR KEY in a file the person names, never over a file already there and never inside a git working tree,
 * so a private key is not committed by accident. Nothing else in this command writes or reads a private key.
 *
 * SEARCH AND DIFF SEND NOTHING to a record. `diff` says what moved between two versions and the bump that needs.
 *
 * INSTALL FROM A CATALOGUE ASKS, as every install from this command does: the file is held to the index's checksum and its
 * signature, read through its door, and filed as a `pack` proposal for the owner to accept on Decide, where the record's own
 * plan says what it adds, changes and takes away. Which key signed it is said, and whether this machine has seen that key
 * for its author before (trust on first use, kept beside the hosts file), or that its old key named it in a rotation.
 *
 * `key rotate <old> <new> --to <folder>` writes a statement signed by the old key naming the new one into the catalogue's
 * index; `key revoke <key> --to <folder> --reason <why> [--successor <key id>]` writes one signed by the key itself. Only
 * the public halves and the signature are written. A version signed by a revoked key is said as untrusted and never asked for.
 *
 * PREVIEW STARTS A SCRATCH SELF-HOST on this machine, loopback only, with an empty record and the file published to a
 * scratch catalogue, and prints the page to install it from. Nothing on any other record is touched, and the scratch
 * folder is removed when it stops.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { exportUseCase, sharedFileName } from '@braindog/declare';
import {
  addKeyStatement,
  CATALOGUE_INDEX,
  catalogueFile,
  keysSignedBefore,
  keyToKeep,
  revokeKey,
  revokedNotice,
  rotateKey,
  verifiedStatements,
  changesBetween,
  emptyCatalogue,
  heldToEntry,
  newAuthorKey,
  publishTo,
  reachOf,
  readAuthorKey,
  readCatalogue,
  readCatalogueFile,
  readKnownKeys,
  rememberKey,
  searchCatalogue,
  strippedNotice,
  trustOf,
  trustSubject,
  unchanged,
  verifyVersion,
  type AuthorKey,
  type CatalogueFile,
  type CatalogueIndex,
  type Changes,
  type EntryKind,
  type KnownKeys,
  type Reach,
  type Trust,
} from '@braindog/declare/catalogue';
import { refused, type Result } from '@braindog/ports';

import { hostsPath } from './http.ts';
import { refuse } from './json.ts';
import type { AgentIo } from './skills.ts';
import { proposeFile, readSource } from './usecase.ts';

const saidWithCode = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : 'That was not read.');
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;

const NOUN: Record<EntryKind, { a: string; the: string; suffix: string }> = {
  usecase: { a: 'a use case', the: 'use case', suffix: '.usecase.json' },
  pack: { a: 'an add-on', the: 'add-on', suffix: '.pack.json' },
};

/* ── new ────────────────────────────────────────────────────────────────── */

const ITEMS = {
  register: 'items',
  name: 'Items',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    { id: 'due', type: 'day' },
  ],
};

const itemsPage = (id: string, title: string) => ({
  page: id,
  title,
  nav: { section: title, order: 10 },
  icon: 'board',
  requires: ['register.items'],
  blocks: [
    {
      kind: 'table',
      heading: 'Open',
      span: 12,
      source: 'register.items',
      where: 'state is open',
      columns: [
        { field: 'name', label: 'Item', width: 'minmax(20ch,1fr)' },
        { field: 'due', label: 'Due', width: '14ch', align: 'end' },
      ],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 20,
      empty: 'Nothing is open.',
    },
  ],
});

/** A starting use case: one list, a page over it, and a Home heading, already through `readShared`. */
export function starter(id: string, title: string, author: string): Result<Record<string, unknown>> {
  return exportUseCase({
    usecase: id,
    version: '1.0.0',
    title,
    summary: `What ${title} is for, in one sentence.`,
    author,
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    modules: [],
    voice: { home: title },
    labels: {},
    declarations: [ITEMS, itemsPage(id, title)],
    examples: [],
  });
}

/** A starting add-on: the same list and page, as a pack file that reads through `readPackFile`. */
export function packStarter(id: string, title: string, author: string): Record<string, unknown> {
  return {
    pack: id,
    version: '1.0.0',
    title,
    summary: `What ${title} adds, in one sentence.`,
    author,
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [ITEMS, itemsPage(id, title)],
  };
}

async function create(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} new`;
  let values: { title?: string | undefined; author?: string | undefined; out?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { title: { type: 'string' }, author: { type: 'string' }, out: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes an id, and --title, --author and --out.`);
    return 1;
  }
  const [id, ...more] = positionals;
  if (!id || more.length > 0 || !ID.test(id) || (kind === 'pack' && id.length < 2)) {
    io.say(`${cmd} takes one id of lower-case letters, digits and dashes, as in ${cmd} reading-club.`);
    return 1;
  }
  const words = id.replace(/-/gu, ' ');
  const title = values.title ?? words.charAt(0).toUpperCase() + words.slice(1);
  let doc: Record<string, unknown>;
  if (kind === 'usecase') {
    const built = starter(id, title, values.author ?? 'Your name');
    if (!built.ok) {
      refuse(io, built, saidWithCode(built));
      return 1;
    }
    doc = built.value;
  } else doc = packStarter(id, title, values.author ?? 'Your name');
  const file = resolve(io.cwd, values.out ?? (kind === 'usecase' ? sharedFileName(id, '1.0.0') : `${id}-1.0.0${NOUN.pack.suffix}`));
  if (existsSync(file)) {
    io.say(`${file} is already there, and new never writes over a file.`);
    return 1;
  }
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  const read = await readCatalogueFile(text);
  if (!read.ok) {
    refuse(io, read, saidWithCode(read));
    return 1;
  }
  writeFileSync(file, text);
  io.out(
    `${title} 1.0.0 written to ${file}: one list and a page over it. Check it with braindog ${kind} check${kind === 'usecase' ? ', and see it with braindog usecase preview' : ''}.`,
  );
  return 0;
}

/* ── check, for an add-on ───────────────────────────────────────────────── */

async function checkPack(args: string[], io: AgentIo): Promise<number> {
  const [file, ...more] = args;
  if (!file || more.length > 0 || file.startsWith('-')) {
    io.say('braindog pack check takes one file, as in braindog pack check bookshelf-1.0.0.pack.json.');
    return 1;
  }
  const read = await readFileAs(file, io, 'pack');
  if (typeof read === 'number') return read;
  if (read.file.kind !== 'pack') return 1;
  const { pack, title } = read.file.file;
  const count = (k: string) => pack.declarations.filter((d) => d.kind === k).length;
  io.out(`${title} ${pack.manifest.version} reads as an add-on: ${count('register')} lists, ${count('page')} pages and ${pack.seeds.length} example rows. Nothing was sent.`);
  io.out(`  By ${pack.manifest.author}, ${pack.manifest.license}.`);
  for (const line of reachLines(reachOf(read.file))) io.out(line);
  return 0;
}

/* ── what a file reaches, said ──────────────────────────────────────────── */

/** The lines `check` and `search` say about what a version can reach. */
export function reachLines(reach: Reach): string[] {
  const list = (xs: readonly string[]) => (xs.length === 0 ? 'none' : xs.join(', '));
  return [
    `  Installs first: ${list(reach.modules)}`,
    `  Adds lists: ${list(reach.lists)}; pages: ${list(reach.pages)}; rules: ${list(reach.rules)}`,
    `  Example rows: ${reach.examples}; suggests skills: ${list(reach.skills)}`,
    reach.calls_out.length === 0 ? '  Calls out to: nothing. It reads and writes only this record.' : `  Calls out to: ${reach.calls_out.map((c) => c.line).join('; ')}`,
  ];
}

/** What `diff` and `publish` say changed. */
export function changeLines(c: Changes): string[] {
  const named = (xs: Changes['added']) => xs.map((x) => `${x.title} (${x.kind === 'register' ? 'list' : x.kind})`).join(', ');
  const lines = [`${c.from ?? 'nothing'} to ${c.to} needs at least a ${c.bump} version.`];
  if (c.added.length) lines.push(`  Adds: ${named(c.added)}`);
  if (c.removed.length) lines.push(`  Takes away: ${named(c.removed)}`);
  if (c.changed.length) lines.push(`  Changes: ${named(c.changed)}`);
  if (c.modules.added.length) lines.push(`  Installs first as well: ${c.modules.added.join(', ')}`);
  if (c.modules.removed.length) lines.push(`  No longer installs: ${c.modules.removed.join(', ')}`);
  if (c.hosts.added.length) lines.push(`  Calls out to a new host: ${c.hosts.added.join(', ')}`);
  if (c.hosts.removed.length) lines.push(`  No longer calls out to: ${c.hosts.removed.join(', ')}`);
  if (c.examples.from !== c.examples.to) lines.push(`  Example rows: ${c.examples.from} to ${c.examples.to}`);
  if (c.words) lines.push('  Its words, voice, labels or skills differ.');
  if (unchanged(c)) lines.push('  Nothing else differs.');
  return lines;
}

/** How a signature is said, with what this machine knows of the key. */
export function trustLine(trust: Trust, author: string): string {
  switch (trust.kind) {
    case 'unsigned':
      return 'Unsigned: nothing says who published it beyond the catalogue it came from.';
    case 'stripped':
      return `Unsigned, and earlier versions were signed by key ${trust.before.join(', ')}. A catalogue does not publish an unsigned version after a signed one, so this may not be from ${author}. It is not asked for.`;
    case 'first':
      return `Signed by key ${trust.key_id}. This machine has not seen a key for ${author} before, so it now remembers this one.`;
    case 'known':
      return `Signed by key ${trust.key_id}, the key this machine has seen for ${author} before.`;
    case 'changed':
      return `Signed by key ${trust.key_id}, which is not the key this machine has seen for ${author} before (${trust.before.join(', ')}). Somebody else may have published it.`;
    case 'rotated':
      return `Signed by key ${trust.key_id}, which key ${trust.from}, the one this machine has seen for ${author}, named as its successor. This machine now remembers it too.`;
    case 'revoked':
      return `Signed by key ${trust.key_id}, which its author revoked, so it is not trusted. Their reason: ${trust.reason}`;
  }
}

/* ── keys ───────────────────────────────────────────────────────────────── */

/** The keys this machine has seen per entry (`trustSubject`: kind and id, never the author name), beside the hosts file. */
export const knownKeysPath = (io: AgentIo): string => join(dirname(hostsPath(io.env)), 'known-keys.json');

function knownKeys(io: AgentIo): KnownKeys {
  try {
    return readKnownKeys(JSON.parse(readFileSync(knownKeysPath(io), 'utf8')));
  } catch {
    return {};
  }
}

function remember(io: AgentIo, subject: string, keyId: string): void {
  const file = knownKeysPath(io);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(rememberKey(knownKeys(io), subject, keyId), null, 2)}\n`);
}

/** The git working tree a path is inside, or `null`. */
function gitTreeOf(path: string): string | null {
  let dir = dirname(path);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

async function key(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  if (args[0] === 'rotate' || args[0] === 'revoke') return keyStatement(args[0], args.slice(1), io, kind);
  const cmd = `braindog ${kind} key`;
  let values: { author?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { author: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes one file to write the key to, and --author <name>.`);
    return 1;
  }
  const [given, ...more] = positionals;
  if (!given || more.length > 0 || values.author === undefined || values.author.trim() === '') {
    io.say(`${cmd} takes one file and --author <name>, as in ${cmd} ~/braindog-author.key.json --author "Halden". Keep the file private and out of any repository.`);
    return 1;
  }
  const file = resolve(io.cwd, given);
  if (existsSync(file)) {
    io.say(`${file} is already there, and a key is never written over a file.`);
    return 1;
  }
  const tree = gitTreeOf(file);
  if (tree !== null) {
    io.say(`${file} is inside the git working tree at ${tree}, where a private key could be committed. Choose a path outside any repository.`);
    return 1;
  }
  const made = await newAuthorKey(values.author.trim());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(made, null, 2)}\n`, { mode: 0o600 });
  io.out(`An author key for ${made.author} is written to ${file}. Its key id is ${made.key_id}; readers see that id beside what you sign.`);
  io.out(`Sign with braindog ${kind} publish <file> --to <folder> --sign ${given}. Keep the file private: anybody holding it can publish as you.`);
  return 0;
}

async function readKeyFile(given: string, io: AgentIo): Promise<AuthorKey | string> {
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(resolve(io.cwd, given), 'utf8'));
  } catch {
    return `${given} could not be read as an author key file.`;
  }
  const read = await readAuthorKey(doc);
  return read.ok ? read.value : saidWithCode(read);
}

/**
 * `key rotate <old key file> <new key file> --to <folder>` and `key revoke <key file> --to <folder> --reason <why> [--successor <key id>]`:
 * a statement signed by the key it speaks for, added to the catalogue's index. Only public halves and the signature are written.
 */
async function keyStatement(verb: 'rotate' | 'revoke', args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} key ${verb}`;
  const usage =
    verb === 'rotate'
      ? `${cmd} takes the old key file, the new key file and --to <folder>, as in ${cmd} ~/old.key.json ~/new.key.json --to ./catalogue.`
      : `${cmd} takes one key file, --to <folder> and --reason <why>, and --successor <key id> when a rotation from it should still count.`;
  let values: { to?: string | undefined; reason?: string | undefined; successor?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { to: { type: 'string' }, reason: { type: 'string' }, successor: { type: 'string' } } }));
  } catch {
    io.say(usage);
    return 1;
  }
  const want = verb === 'rotate' ? 2 : 1;
  if (positionals.length !== want || values.to === undefined || (verb === 'revoke' && values.reason === undefined) || (verb === 'rotate' && (values.reason !== undefined || values.successor !== undefined))) {
    io.say(usage);
    return 1;
  }
  const keys: AuthorKey[] = [];
  for (const given of positionals) {
    const got = await readKeyFile(given, io);
    if (typeof got === 'string') {
      io.say(got);
      return 1;
    }
    keys.push(got);
  }
  const at = await catalogueAt(values.to, io, true);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const [first, second] = keys as [AuthorKey, AuthorKey | undefined];
  const statement = verb === 'rotate' ? await rotateKey(first, second as AuthorKey) : await revokeKey(first, values.reason ?? '', values.successor ?? null);
  if (!statement.ok) {
    refuse(io, statement, saidWithCode(statement));
    return 1;
  }
  const added = await addKeyStatement(at.index, statement.value);
  if (!added.ok) {
    refuse(io, added, saidWithCode(added));
    return 1;
  }
  mkdirSync(at.where, { recursive: true });
  writeFileSync(join(at.where, CATALOGUE_INDEX), `${JSON.stringify(added.value, null, 2)}\n`);
  if (verb === 'rotate')
    io.out(`Key ${first.key_id} now names key ${(second as AuthorKey).key_id} as its successor in ${at.where}. Readers who trusted the old key trust versions the new one signs. Sign from now on with the new key file.`);
  else
    io.out(
      `Key ${first.key_id} is revoked in ${at.where}. Every version it signed is said as untrusted and is not offered${values.successor ? `, and only a rotation to ${values.successor} still counts` : ''}.`,
    );
  return 0;
}

/* ── a catalogue, as a folder or an address ─────────────────────────────── */

type Catalogue = { index: CatalogueIndex; read: (path: string) => Promise<string | null>; where: string };

const isAddress = (given: string) => /^[a-z][a-z0-9+.-]*:\/\//iu.test(given);

async function catalogueAt(given: string, io: AgentIo, forWriting = false): Promise<Catalogue | string> {
  if (isAddress(given)) {
    if (forWriting) return 'A catalogue is published into a folder on this machine; copy the folder to a host to share it.';
    const base = given.endsWith('/') ? given : `${given}/`;
    const read = async (path: string) => {
      const got = await readSource(new URL(path, base).href, io);
      return got.ok ? got.text : null;
    };
    const text = await read(CATALOGUE_INDEX);
    if (text === null) return `${given} answered no catalogue index.`;
    return parsed(text, read, given);
  }
  const dir = resolve(io.cwd, given);
  const read = async (path: string) => {
    try {
      return readFileSync(join(dir, ...path.split('/')), 'utf8');
    } catch {
      return null;
    }
  };
  const text = await read(CATALOGUE_INDEX);
  if (text === null) return forWriting ? { index: emptyCatalogue(basename(dir)), read, where: dir } : `${given} holds no catalogue: there is no ${CATALOGUE_INDEX} in it.`;
  return parsed(text, read, dir);
}

function parsed(text: string, read: Catalogue['read'], where: string): Catalogue | string {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return `The ${CATALOGUE_INDEX} at ${where} is not JSON.`;
  }
  const index = readCatalogue(doc);
  return index.ok ? { index: index.value, read, where } : saidWithCode(index);
}

/* ── publish, search, diff ──────────────────────────────────────────────── */

async function publish(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} publish`;
  let values: { to?: string | undefined; sign?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { to: { type: 'string' }, sign: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes one file, --to <folder> and --sign <key file>.`);
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0 || values.to === undefined) {
    io.say(`${cmd} takes one file and --to <folder>, as in ${cmd} ${kind === 'usecase' ? 'study-1.0.0.usecase.json' : 'bookshelf-1.0.0.pack.json'} --to ./catalogue.`);
    return 1;
  }
  const source = await readSource(file, io);
  if (!source.ok) {
    io.say(source.fix);
    return 1;
  }
  const shape = await readCatalogueFile(source.text);
  if (shape.ok && shape.value.kind !== kind) {
    io.say(`${file} is ${NOUN[shape.value.kind].a}, not ${NOUN[kind].a}. Publish it with braindog ${shape.value.kind} publish.`);
    return 1;
  }
  let signer: AuthorKey | undefined;
  if (values.sign !== undefined) {
    const got = await readKeyFile(values.sign, io);
    if (typeof got === 'string') {
      io.say(got);
      return 1;
    }
    signer = got;
  }
  const at = await catalogueAt(values.to, io, true);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const out = await publishTo(at.index, source.text, at.read, new Date(), signer);
  if (!out.ok) {
    refuse(io, out, saidWithCode(out));
    return 1;
  }
  const target = join(at.where, ...out.value.path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source.text);
  writeFileSync(join(at.where, CATALOGUE_INDEX), `${JSON.stringify(out.value.index, null, 2)}\n`);
  const { entry, version, changes } = out.value;
  io.out(`${entry.title} ${version.version} published to ${at.where}${version.signature ? `, signed by key ${version.signature.key_id}` : ', unsigned'}.`);
  if (changes.from !== null) for (const line of changeLines(changes)) io.out(line);
  for (const line of reachLines(version.reach)) io.out(line);
  return 0;
}

async function search(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} search`;
  let values: { from?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { from: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes words and --from <folder or address>.`);
    return 1;
  }
  if (values.from === undefined) {
    io.say(`${cmd} needs --from <folder or address>, the catalogue to read.`);
    return 1;
  }
  const at = await catalogueAt(values.from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const found = searchCatalogue(at.index, positionals.join(' '), kind);
  if (found.length === 0) {
    io.out(positionals.length === 0 ? `This catalogue has no ${NOUN[kind].the} published yet.` : `No ${NOUN[kind].the} in this catalogue matches ${positionals.join(' ')}.`);
    return 0;
  }
  const known = knownKeys(io);
  const statements = await verifiedStatements(at.index.keys);
  for (const e of found) {
    const v = e.versions[0];
    io.out(`${e.id}  ${e.title} ${e.latest} by ${e.author}. ${e.summary}`);
    if (v) for (const line of reachLines(v.reach)) io.out(line);
    io.out(`  ${trustLine(trustOf(known, trustSubject(e), v?.signature, statements, v ? await keysSignedBefore(e, v.version) : []), e.author)}`);
  }
  io.out(`Not from the add-on index. A signature is checked when it is installed, with braindog ${kind} install <id> --from ${values.from}.`);
  return 0;
}

async function readFileAs(given: string, io: AgentIo, kind: EntryKind): Promise<{ text: string; file: CatalogueFile } | number> {
  const source = await readSource(given, io);
  if (!source.ok) {
    io.say(source.fix);
    return 1;
  }
  const read = await readCatalogueFile(source.text);
  if (!read.ok) {
    refuse(io, read, `${given}: ${saidWithCode(read)}`);
    return 1;
  }
  if (read.value.kind !== kind) {
    io.say(`${given} is ${NOUN[read.value.kind].a}, not ${NOUN[kind].a}. Use braindog ${read.value.kind} for it.`);
    return 1;
  }
  return { text: source.text, file: read.value };
}

const idOf = (f: CatalogueFile): string => (f.kind === 'usecase' ? f.shared.usecase.usecase : f.file.pack.manifest.pack);

async function diff(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} diff`;
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {} }));
  } catch {
    io.say(`${cmd} takes two files, the earlier first.`);
    return 1;
  }
  const [a, b, ...more] = positionals;
  if (!a || !b || more.length > 0) {
    io.say(`${cmd} takes two files, the earlier first, as in ${cmd} ${kind === 'usecase' ? 'study-1.0.0.usecase.json study-1.1.0.usecase.json' : 'bookshelf-1.0.0.pack.json bookshelf-1.1.0.pack.json'}.`);
    return 1;
  }
  const from = await readFileAs(a, io, kind);
  if (typeof from === 'number') return from;
  const to = await readFileAs(b, io, kind);
  if (typeof to === 'number') return to;
  if (idOf(from.file) !== idOf(to.file)) {
    io.say(`${a} is ${idOf(from.file)} and ${b} is ${idOf(to.file)}; diff compares two versions of one ${NOUN[kind].the}.`);
    return 1;
  }
  for (const line of changeLines(changesBetween(from.file, to.file))) io.out(line);
  return 0;
}

/* ── install from a catalogue ───────────────────────────────────────────── */

/** `install <id> --from <catalogue> [--version x.y.z]`: the file held to its checksum and signature, then asked for on Decide. */
export async function installFromCatalogue(id: string, from: string, version: string | undefined, host: string | undefined, io: AgentIo, kind: EntryKind = 'usecase'): Promise<number> {
  const at = await catalogueAt(from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const bare = kind === 'usecase' ? id.replace(/^usecase-/u, '') : id;
  const entry = at.index.entries.find((e) => e.id === bare && e.kind === kind);
  if (!entry) {
    const ids = at.index.entries.filter((e) => e.kind === kind).map((e) => e.id);
    io.say(`There is no ${NOUN[kind].the} called ${bare} in this catalogue.${ids.length ? ` It has: ${ids.join(', ')}.` : ''}`);
    return 1;
  }
  if (version !== undefined && !VERSION.test(version)) {
    io.say(`--version is three numbers, as in 1.0.0.`);
    return 1;
  }
  const chosen = entry.versions.find((v) => v.version === (version ?? entry.latest));
  if (!chosen) {
    io.say(`${entry.title} has no version ${version} in this catalogue. It has ${entry.versions.map((v) => v.version).join(', ')}.`);
    return 1;
  }
  const path = catalogueFile(entry.id, chosen.version, kind);
  const text = await at.read(path);
  if (text === null) {
    io.say(`${path} is listed in this catalogue and missing from it.`);
    return 1;
  }
  const held = await verifyVersion(entry, chosen, text);
  if (!held.ok) {
    refuse(io, held, saidWithCode(held));
    return 1;
  }
  const read = await readCatalogueFile(text, { kind: 'url', ref: at.where });
  if (!read.ok) {
    refuse(io, read, saidWithCode(read));
    return 1;
  }
  if (read.value.kind !== kind) {
    io.say(`${path} is not ${NOUN[kind].a}, so this catalogue lists it wrongly. Nothing was sent.`);
    return 1;
  }
  const matches = heldToEntry(entry, chosen.version, read.value);
  if (!matches.ok) {
    refuse(io, matches, saidWithCode(matches));
    return 1;
  }
  const statements = await verifiedStatements(at.index.keys);
  /* A REVOKED KEY IS SAID AND NOTHING IS ASKED. */
  const revoked = revokedNotice(statements, entry.title, chosen.version, held.value);
  if (revoked !== null) {
    io.say(`${revoked} Nothing was sent.`);
    return 1;
  }
  const before = await keysSignedBefore(entry, chosen.version);
  /* NOR IS ONE THAT LOST ITS SIGNATURE AFTER SIGNED VERSIONS. */
  if (held.value === null && before.length > 0) {
    io.say(`${strippedNotice(entry.title, chosen.version, before)} Nothing was sent.`);
    return 1;
  }
  const trust = trustOf(knownKeys(io), trustSubject(entry), held.value, statements, before);
  if (trust.kind === 'stripped') {
    io.say(`${entry.title} ${chosen.version}: ${trustLine(trust, entry.author)} Nothing was sent.`);
    return 1;
  }
  const said = trustLine(trust, entry.author);
  io.out(said);
  /* THE KEY IS REMEMBERED ON FIRST USE, OR WHEN A KEY ALREADY TRUSTED NAMED IT. A different key is said on Decide and never replaces the one seen before. */
  const keep = keyToKeep(trust);
  if (keep !== null) remember(io, trustSubject(entry), keep);
  const question = `Install ${entry.title} ${chosen.version} from a catalogue? ${said}`;
  if (read.value.kind === 'usecase') return proposeFile(text, read.value.shared.usecase, host, io, question);
  return proposePack(read.value.file.pack.manifest.pack, read.value.file.doc, question, host, io);
}

async function proposePack(id: string, doc: Record<string, unknown>, question: string, host: string | undefined, io: AgentIo): Promise<number> {
  const { connect } = await import('./skills.ts');
  const at = await connect(host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.call<{ id: string }>('propose', { question, body_kind: 'pack', body: { install: id, doc } });
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  const filed = (answer.value as { id?: unknown }).id;
  if (typeof filed !== 'string') {
    io.say('The record took the question and did not say which one it is. Open Decide in the app.');
    return 1;
  }
  io.out(`Asked the owner: ${question} Nothing is installed until they accept it: ${new URL(`/decide/${encodeURIComponent(filed)}`, at.to.base).href}`);
  return 0;
}

/* ── preview ────────────────────────────────────────────────────────────── */

async function preview(args: string[], io: AgentIo): Promise<number> {
  let values: { port?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { port: { type: 'string' } } }));
  } catch {
    io.say('braindog usecase preview takes one file and --port <n>.');
    return 1;
  }
  const [file, ...more] = positionals;
  const port = Number(values.port ?? '5870');
  if (!file || more.length > 0 || !Number.isInteger(port) || port < 1024 || port > 65535) {
    io.say('braindog usecase preview takes one file and --port <n> above 1023, as in braindog usecase preview study-1.0.0.usecase.json --port 5870.');
    return 1;
  }
  const got = await readFileAs(file, io, 'usecase');
  if (typeof got === 'number') return got;
  if (got.file.kind !== 'usecase') return 1;
  const read = { text: got.text, shared: got.file.shared };

  const scratch = mkdtempSync(join(tmpdir(), 'braindog-preview-'));
  const catalogue = join(scratch, 'catalogue');
  mkdirSync(catalogue);
  const out = await publishTo(emptyCatalogue('Preview'), read.text, () => null);
  if (!out.ok) {
    rmSync(scratch, { recursive: true, force: true });
    refuse(io, out, saidWithCode(out));
    return 1;
  }
  mkdirSync(join(catalogue, dirname(out.value.path)), { recursive: true });
  writeFileSync(join(catalogue, ...out.value.path.split('/')), read.text);
  writeFileSync(join(catalogue, CATALOGUE_INDEX), JSON.stringify(out.value.index));

  const entry = io.env.BRAINDOG_SELFHOST || fileURLToPath(new URL('../../selfhost/src/main.ts', import.meta.url));
  if (!existsSync(entry)) {
    rmSync(scratch, { recursive: true, force: true });
    io.say('braindog usecase preview needs the self-host. Set BRAINDOG_SELFHOST to its entry file.');
    return 1;
  }
  /* LOOPBACK AND NOBODY SIGNS IN: no token, a scratch data folder and a scratch key file, so nothing of a real record is
     opened. The owner's address is a placeholder the scratch record needs and nobody receives mail at. */
  const env = { ...io.env, BRAINDOG_DATA: join(scratch, 'data'), BRAINDOG_KEK_FILE: join(scratch, 'data', 'kek'), BRAINDOG_CATALOGUE: catalogue, PORT: String(port) } as Record<string, string | undefined>;
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_FILE;
  delete env.BRAINDOG_HOST;
  delete env.BRAINDOG_ORIGIN;
  const run = (command: string[], inherit: boolean) =>
    new Promise<number>((done) => {
      const child = spawn(process.execPath, [entry, ...command], { env, stdio: inherit ? 'inherit' : 'ignore' });
      child.on('error', () => done(1));
      child.on('exit', (code) => done(code ?? 1));
      if (inherit) {
        process.on('SIGINT', () => child.kill('SIGINT'));
        process.on('SIGTERM', () => child.kill('SIGTERM'));
      }
    });
  const made = await run(['init', 'preview', '--owner', 'preview@example.invalid'], false);
  if (made !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    io.say('The scratch record for the preview could not be created.');
    return 1;
  }
  io.out(`Previewing ${read.shared.usecase.title} ${read.shared.usecase.version} on a scratch BrainDog. Open http://localhost:${port}/packs/browse/${read.shared.usecase.usecase}?from=catalogue and press Review the plan. Stop with Ctrl+C; the scratch record is removed.`);
  const code = await run(['serve'], true);
  rmSync(scratch, { recursive: true, force: true });
  return code;
}


/** The SDK verbs `usecase` and `pack` hand here, or `null` for a verb that is not one of them. */
export function sdkVerb(verb: string | undefined, kind: EntryKind = 'usecase'): ((args: string[], io: AgentIo) => Promise<number>) | null {
  if (verb === 'new') return (a, io) => create(a, io, kind);
  if (verb === 'publish') return (a, io) => publish(a, io, kind);
  if (verb === 'search') return (a, io) => search(a, io, kind);
  if (verb === 'diff') return (a, io) => diff(a, io, kind);
  if (verb === 'key') return (a, io) => key(a, io, kind);
  if (verb === 'preview' && kind === 'usecase') return preview;
  return null;
}

const PACK_USAGE =
  'braindog pack takes new <id>, check <file>, diff <a> <b>, key <file> --author <name>, key rotate <old key file> <new key file> --to <folder>, key revoke <key file> --to <folder> --reason <why> [--successor <key id>], publish <file> --to <folder> [--sign <key file>], search [words] --from <catalogue>, or install <id> --from <catalogue> [--version <x.y.z>] [--host <host>].';

/** `braindog pack …`: the add-on half of the SDK. */
export async function pack(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'check') return checkPack(rest, io);
  if (verb === 'install') {
    let values: { host?: string | undefined; from?: string | undefined; version?: string | undefined };
    let positionals: string[];
    try {
      ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { host: { type: 'string' }, from: { type: 'string' }, version: { type: 'string' } } }));
    } catch {
      io.say(PACK_USAGE);
      return 1;
    }
    const [id, ...more] = positionals;
    if (!id || more.length > 0 || !ID.test(id) || values.from === undefined) {
      io.say('braindog pack install takes one id and --from <catalogue>, as in braindog pack install bookshelf --from ./catalogue.');
      return 1;
    }
    return installFromCatalogue(id, values.from, values.version, values.host, io, 'pack');
  }
  const sdk = verb === 'preview' ? null : sdkVerb(verb, 'pack');
  if (sdk) return sdk(rest, io);
  io.say(PACK_USAGE);
  return 1;
}
