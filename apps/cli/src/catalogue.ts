/**
 * The use-case and add-on SDK on this machine: `braindog usecase|pack new|check|diff|publish|yank|search|key|preview`, `pack test`,
 * and `install <id> --from` (over `@braindog/declare/catalogue`).
 *
 * NEW writes a starting file that already reads through its door (`readShared` for a use case, `readPackFile` for an
 * add-on), so the first `check` passes and every edit after it is checked the way a record will check it. An add-on
 * starts as a folder shaped like `packs/<id>/`: its file (JSON, or YAML with `--yaml`), `<id>.test.json` and a README.
 *
 * CHECK AND TEST RUN THE RECORD ON THIS MACHINE. `pack check` plans and installs the file in a scratch record in memory
 * (`scratch.ts`), so every refusal a record would give is said with its code, and warns on every manifest key outside
 * `MANIFEST_KEYS`; `pack test` writes the rows of `<id>.test.json` into that record and says each expectation
 * (`pack-test.ts`). A file may be YAML anywhere a file is read, through `@braindog/declare/yaml`.
 *
 * A KENNEL IS ONE MORE PLACE TO PUBLISH. `publish --kennel [host]` submits to it, `yank` takes a version back there, and
 * `search` with no `--from` reads it (`kennel.ts`).
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
 * TRUST IS THE RECORD'S WHEN THE RECORD GIVES IT (`keySource`): the keys the app's Browse keeps in `packs.known_keys` are
 * read here too, and a key first met here is kept there, so a publisher trusted in either place is known in both. A key
 * other than the one seen before is held back, as Browse holds it, until `--trust-key`.
 *
 * AN ADD-ON IS INSTALLED BY ID OR BY FILE. `pack install <id>` with no
 * `--from` finds the id in the catalogue the host serves, which `tools/catalogue/from-packs.mjs` fills from `packs/`, and
 * `pack install <file>` reads a `.pack.json` through the add-on door. Before this, `install` took only `<id> --from`, and
 * the four packs in `packs/` could be installed by nobody, from the app or from here. `--dry-run` says what the owner
 * would be asked and what the file adds, and sends nothing.
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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { addressFaults, exportUseCase, listingFault, sharedFileName, usesFault } from '@braindog/declare';
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
  type CatalogueEntry,
  type CatalogueFile,
  type CatalogueIndex,
  type Changes,
  type EntryKind,
  type KnownKeys,
  type Reach,
  type Signature,
  type Trust,
} from '@braindog/declare/catalogue';
import { DEFAULT_KENNEL, KENNEL_BASE } from '@braindog/declare/kennel';
import { PACK_SCHEMA_URL } from '@braindog/declare/pack-schema';
import { parseYaml } from '@braindog/declare/yaml';
import { refused, type Result } from '@braindog/ports';

import { oneLine, printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { kennelBase, submitToKennel, takeKennel, yankFromKennel } from './kennel.ts';
import { untilAccepted } from './links.ts';
import { packFromPage } from './pack-from-page.ts';
import { firstPartyFor, packFromWidget } from './pack-from-widget.ts';
import { readPackTest, runPackTest, testFileName } from './pack-test.ts';
import { checkInScratch } from './scratch.ts';
import type { AgentIo } from './skills.ts';
import { proposeFile, readSource } from './usecase.ts';

/* ONE CLEAN LINE, because a refusal of a catalogue's file is free to name what the file holds, and the file is a stranger's. */
const saidWithCode = (r: Result<unknown>): string => (refused(r) ? oneLine(`${r.refusal.fix} (${r.refusal.code})`) : 'That was not read.');
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;

/* `command` IS THE NAME A PERSON TYPES: `starter` and `addon`, whose old names `usecase` and `pack` still work. */
const NOUN: Record<EntryKind, { a: string; the: string; suffix: string; command: string }> = {
  usecase: { a: 'a starter', the: 'starter', suffix: '.usecase.json', command: 'starter' },
  pack: { a: 'an add-on', the: 'add-on', suffix: '.pack.json', command: 'addon' },
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
    { id: 'tags', type: 'list', of: 'text' },
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

/** A starting add-on: the same list and page with two example rows, as a pack file that reads through `readPackFile`. */
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
    seeds: [
      { register: 'items', fields: { name: 'Write the first real item', due: '2026-10-01' } },
      { register: 'items', fields: { name: 'Delete these two examples', state: 'done' } },
    ],
  };
}

/** The starting add-on's test: one more row written, then what the list and that row should hold (`pack-test.ts`). */
export const packStarterTest = (): Record<string, unknown> => ({
  rows: [{ list: 'items', fields: { name: 'Check the test runs' } }],
  expect: [
    { list: 'items', count: 3 },
    { row: 1, field: 'state', is: 'open' },
  ],
});

/** The five lines of README a new add-on's folder starts with. */
const packReadme = (id: string, title: string, file: string): string =>
  [
    `# ${title}`,
    `What ${title} adds to a BrainDog, in one sentence.`,
    `Edit ${file}, then run braindog addon check ${id} to see what BrainDog would say about it.`,
    `Run braindog addon test ${id} to write the rows in ${testFileName(id)} into a scratch BrainDog and check what it expects.`,
    `Publish it with braindog addon publish ${file} --kennel, signed with --sign <key file> or as the person signed in.`,
    '',
  ].join('\n');

/** YAML for a JSON document the starter built: plain enough that `parseYaml` reads it back as the same document. */
function yamlOf(value: unknown, indent = ''): string {
  const scalar = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((v) => {
        if (typeof v !== 'object' || v === null) return `${indent}- ${scalar(v)}`;
        const inner = yamlOf(v, `${indent}  `);
        return `${indent}- ${inner.slice(indent.length + 2)}`;
      })
      .join('\n');
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (typeof v !== 'object' || v === null) return `${indent}${k}: ${scalar(v)}`;
        const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
        return empty ? `${indent}${k}: ${Array.isArray(v) ? '[]' : '{}'}` : `${indent}${k}:\n${yamlOf(v, `${indent}  `)}`;
      })
      .join('\n');
  }
  return `${indent}${scalar(value)}`;
}

/**
 * `pack new <id> [--yaml] [--out <folder>] [--from-page <file.dog> | --from-widget <file.json>]`: a folder shaped like `packs/<id>/`, holding
 * `<id>.pack.json` (or `.pack.yaml`), `<id>.test.json` and a README, where a first `check` and a first `test` both pass.
 *
 * `--from-page` STARTS IT FROM A PAGE PULLED WITH `braindog page pull`: the add-on document is `packFromPage`'s, made
 * from that file and scrubbed of everything of the author's, in place of the blank one, and each thing it took, made or
 * left out is said. The test file and the README are the ones a blank add-on starts with.
 *
 * `--from-widget` STARTS IT FROM A WIDGET, the file `braindog widget share <name>` writes: an add-on that ships that one
 * widget for the sheet and nothing else, scrubbed of the author's names (`packFromWidget`).
 *
 * NEVER OVER A FOLDER ALREADY THERE, as `new` never writes over a file.
 */
async function createPack(args: string[], io: AgentIo): Promise<number> {
  let values: { title?: string | undefined; author?: string | undefined; out?: string | undefined; yaml?: boolean | undefined; 'from-page'?: string | undefined; 'from-widget'?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { title: { type: 'string' }, author: { type: 'string' }, out: { type: 'string' }, yaml: { type: 'boolean' }, 'from-page': { type: 'string' }, 'from-widget': { type: 'string' } },
    }));
  } catch {
    io.say('braindog addon new takes an id, and --title, --author, --out <folder>, --yaml, --from-page <file.dog> and --from-widget <file.json>.');
    return 1;
  }
  const [id, ...more] = positionals;
  if (!id || more.length > 0 || !ID.test(id) || id.length < 2) {
    io.say('braindog addon new takes one id of lower-case letters, digits and dashes, as in braindog addon new reading-club.');
    return 1;
  }
  const words = id.replace(/-/gu, ' ');
  let title = values.title ?? words.charAt(0).toUpperCase() + words.slice(1);
  let doc = packStarter(id, title, values.author ?? 'Your name');
  let taken: string[] = [];
  const fromPage = values['from-page'];
  if (fromPage !== undefined) {
    const where = resolve(io.cwd, fromPage);
    let text: string;
    try {
      text = readFileSync(where, 'utf8');
    } catch {
      io.say(`${fromPage} could not be read. Pull a page into a file first, as in braindog page pull invoicing.`);
      return 1;
    }
    const made = await packFromPage(id, text, { title: values.title, author: values.author });
    if (!made.ok) {
      refuse(io, made, saidWithCode(made));
      return 1;
    }
    doc = made.value.file;
    title = String(doc.title);
    taken = made.value.lines;
  }
  const fromWidget = values['from-widget'];
  if (fromWidget !== undefined) {
    if (fromPage !== undefined) {
      io.say('An add-on starts from a page or from a widget, not both.');
      return 1;
    }
    let text: string;
    try {
      text = readFileSync(resolve(io.cwd, fromWidget), 'utf8');
    } catch {
      io.say(`${fromWidget} could not be read. Write a widget into a file first, as in braindog widget share "Spending" > spending.json.`);
      return 1;
    }
    /* THE FILE `braindog widget share` WRITES, { title, block, size }, or a bare block. */
    let given: Record<string, unknown>;
    try {
      const doc = JSON.parse(text) as unknown;
      given = doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {};
    } catch {
      given = {};
    }
    const block = given.block !== null && typeof given.block === 'object' && !Array.isArray(given.block) ? (given.block as Record<string, unknown>) : given;
    const sizes = Array.isArray(given.sizes) ? (given.sizes as string[]) : typeof given.size === 'string' ? [given.size] : undefined;
    const made = await packFromWidget(id, block, {
      title: values.title ?? (typeof given.title === 'string' ? given.title : undefined),
      author: values.author,
      ...(sizes ? { sizes } : {}),
      ...firstPartyFor(block),
    });
    if (!made.ok) {
      refuse(io, made, saidWithCode(made));
      return 1;
    }
    doc = made.value.file;
    title = String(doc.title);
    taken = made.value.lines;
  }
  const read = await readCatalogueFile(`${JSON.stringify(doc)}\n`);
  if (!read.ok) {
    refuse(io, read, saidWithCode(read));
    return 1;
  }
  const dir = resolve(io.cwd, values.out ?? id);
  if (existsSync(dir)) {
    io.say(`${dir} is already there, and new never writes over it.`);
    return 1;
  }
  const file = `${id}${values.yaml ? '.pack.yaml' : NOUN.pack.suffix}`;
  /* THE EDITOR'S SCHEMA FIRST, so it suggests keys from the first keystroke (`pack-schema.ts`). The record passes over it. */
  doc = { $schema: PACK_SCHEMA_URL, ...doc };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), values.yaml ? `${yamlOf(doc)}\n` : `${JSON.stringify(doc, null, 2)}\n`);
  /* A WIDGET-ONLY ADD-ON KEEPS NO ROWS, so its first test only installs it: the record's own sessions, none yet. */
  const test = fromWidget !== undefined ? { rows: [], expect: [{ list: 'session', count: 0 }] } : packStarterTest();
  writeFileSync(join(dir, testFileName(id)), `${JSON.stringify(test, null, 2)}\n`);
  writeFileSync(join(dir, 'README.md'), packReadme(id, title, file));
  const holds = fromWidget !== undefined ? `the widget in ${basename(fromWidget)}` : fromPage === undefined ? 'one list, a page over it and two example rows' : `what ${basename(fromPage)} shows`;
  io.out(`${title} 1.0.0 written to ${dir}: ${file} with ${holds}, ${testFileName(id)} and a README. Check it with braindog addon check ${values.out ?? id}, and test it with braindog addon test ${values.out ?? id}.`);
  for (const line of taken) io.out(line);
  return 0;
}

/** `usecase new <id> [--yaml]`: one `.usecase.json` (or `.usecase.yaml`) file that already reads through `readShared`. */
async function createUseCase(args: string[], io: AgentIo): Promise<number> {
  const cmd = 'braindog starter new';
  let values: { title?: string | undefined; author?: string | undefined; out?: string | undefined; yaml?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { title: { type: 'string' }, author: { type: 'string' }, out: { type: 'string' }, yaml: { type: 'boolean' } },
    }));
  } catch {
    io.say(`${cmd} takes an id, and --title, --author, --out and --yaml.`);
    return 1;
  }
  const [id, ...more] = positionals;
  if (!id || more.length > 0 || !ID.test(id)) {
    io.say(`${cmd} takes one id of lower-case letters, digits and dashes, as in ${cmd} reading-club.`);
    return 1;
  }
  const words = id.replace(/-/gu, ' ');
  const title = values.title ?? words.charAt(0).toUpperCase() + words.slice(1);
  const built = starter(id, title, values.author ?? 'Your name');
  if (!built.ok) {
    refuse(io, built, saidWithCode(built));
    return 1;
  }
  const doc = built.value;
  const named = values.yaml ? sharedFileName(id, '1.0.0').replace(/\.json$/u, '.yaml') : sharedFileName(id, '1.0.0');
  const file = resolve(io.cwd, values.out ?? named);
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
  writeFileSync(file, values.yaml ? `${yamlOf(doc)}\n` : text);
  io.out(`${title} 1.0.0 written to ${file}: one list and a page over it. Check it with braindog starter check, and see it with braindog starter preview.`);
  return 0;
}

/* ── check and test, for an add-on ──────────────────────────────────────── */

/**
 * `pack check <file|dir>`: the file read through the add-on door (YAML or JSON), a warning for every key outside
 * `MANIFEST_KEYS`, then planned and installed in a scratch record holding the modules it needs, so every refusal the
 * record would give is said here with its code (`scratch.ts`).
 */
async function checkPack(args: string[], io: AgentIo): Promise<number> {
  const [file, ...more] = args;
  if (!file || more.length > 0 || file.startsWith('-')) {
    io.say('braindog addon check takes one file or folder, as in braindog addon check bookshelf or braindog addon check bookshelf/bookshelf.pack.json.');
    return 1;
  }
  const read = await readFileAs(file, io, 'pack');
  if (typeof read === 'number') return read;
  if (read.file.kind !== 'pack') return 1;
  const { pack, title } = printable(read.file.file);
  const count = (k: string) => pack.declarations.filter((d) => d.kind === k).length;
  io.out(`${title} ${pack.manifest.version} reads as an add-on: ${count('register')} lists, ${count('page')} pages and ${pack.seeds.length} example rows. Nothing was sent.`);
  io.out(`  By ${pack.manifest.author}, ${pack.manifest.license}.`);
  for (const line of reachLines(reachOf(read.file))) io.out(line);
  /* THE FILE AS WRITTEN, read for what the Kennel and an install both refuse by name (`address.ts`): every address
     where none may be, and a key a listing never says. Said here in the sentence those two say, and every one of them,
     where a record stops at the first. */
  const written: unknown = JSON.parse(read.text);
  /* WHAT IT USES OF YOURS IS SAID BY `reachLines` ABOVE; whether its `uses` line says so is the Kennel's to refuse. */
  const remote = addressFaults(written);
  const kennelOnly = [listingFault(written), usesFault(written, true)].filter((r) => r !== null);
  const unlistable = kennelOnly.length > 0;
  for (const r of [...remote, ...kennelOnly]) io.out(`  ${oneLine(`${r.fix} (${r.code})`)}`);
  if (remote.length > 0) {
    io.say(`${title} ${pack.manifest.version} would be refused by BrainDog, as said above.`);
    return 1;
  }
  const checked = await checkInScratch(read.file);
  for (const line of checked.lines) io.out(line);
  if (!checked.ok) io.say(`${title} ${pack.manifest.version} would be refused by BrainDog, as said above.`);
  else if (unlistable) io.say(`${title} ${pack.manifest.version} would be refused by the Kennel, as said above.`);
  return checked.ok && !unlistable ? 0 : 1;
}

/**
 * `pack test <dir>`: `<id>.test.json` beside the pack, run in a scratch record after the pack and its example rows are
 * installed, each expectation said as passed or failed (`pack-test.ts`).
 */
async function testPack(args: string[], io: AgentIo): Promise<number> {
  const [given, ...more] = args;
  if (!given || more.length > 0 || given.startsWith('-')) {
    io.say('braindog addon test takes the folder a pack is in, as in braindog addon test bookshelf.');
    return 1;
  }
  const read = await readFileAs(given, io, 'pack');
  if (typeof read === 'number') return read;
  if (read.file.kind !== 'pack') return 1;
  const id = read.file.file.pack.manifest.pack;
  const path = join(read.dir ?? resolve(io.cwd, given), testFileName(id));
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    io.say(`There is no test to run: ${path} is missing or is not JSON. braindog addon new writes one to start from.`);
    return 1;
  }
  const test = readPackTest(doc);
  if (!test.ok) {
    refuse(io, test, `${testFileName(id)}: ${saidWithCode(test)}`);
    return 1;
  }
  const checked = await checkInScratch(read.file, true);
  if (!checked.ok || checked.held === null) {
    checked.held?.scratch.close();
    for (const line of checked.lines) io.out(line);
    io.say(`${oneLine(read.file.file.title)} does not install in a scratch BrainDog, so its test did not run.`);
    return 1;
  }
  const { scratch } = checked.held;
  try {
    const run = runPackTest(scratch, test.value);
    io.out(`${oneLine(read.file.file.title)} ${oneLine(read.file.file.pack.manifest.version)}, tested in a scratch BrainDog after installing it:`);
    for (const line of run.lines) io.out(line);
    if (!run.passed) io.say('Some of what the test expects did not hold, as said above.');
    return run.passed ? 0 : 1;
  } finally {
    scratch.close();
  }
}

/* ── what a file reaches, said ──────────────────────────────────────────── */

/**
 * The lines `check` and `search` say about what a version can reach.
 *
 * SCRUBBED HERE AND NOT BY EACH CALLER. `search` hands over the reach an index states, which is a stranger's file, and
 * a page name holding OSC 0 was measured printed as sent; three commands build these lines, and none of
 * them has to remember that.
 */
export function reachLines(given: Reach): string[] {
  const reach = printable(given);
  const list = (xs: readonly string[]) => (xs.length === 0 ? 'none' : xs.join(', '));
  return [
    `  Installs first: ${list(reach.modules)}`,
    `  Adds lists: ${list(reach.lists)}; pages: ${list(reach.pages)}; rules: ${list(reach.rules)}`,
    `  Example rows: ${reach.examples}; suggests skills: ${list(reach.skills)}`,
    ...(reach.widgets?.length ? [`  Widgets for Today: ${list(reach.widgets)}`] : []),
    ...(reach.uses?.length ? [`  Uses of yours: ${reach.uses.map((u) => `${u.id}${u.writes ? ' (changes it)' : ''}`).join(', ')}`] : []),
    reach.calls_out.length === 0 ? '  Calls out to: nothing. It reads and writes only your BrainDog.' : `  Calls out to: ${reach.calls_out.map((c) => c.line).join('; ')}`,
  ];
}

/** What `diff` and `publish` say changed, with the titles of the file's declarations made one clean line each. */
export function changeLines(given: Changes): string[] {
  const c = printable(given);
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

/**
 * How a signature is said, with what this machine, or the record when the keys were read from it, knows of the key. A
 * revocation's reason is its author's words, so it is scrubbed too.
 */
export function trustLine(given: Trust, named: string, on: 'record' | 'machine' = 'machine'): string {
  const trust = printable(given);
  const author = oneLine(named);
  const [Seer, seer] = on === 'record' ? ['Your BrainDog', 'your BrainDog'] : ['This machine', 'this machine'];
  switch (trust.kind) {
    case 'unsigned':
      return 'Unsigned: nothing says who published it beyond the catalogue it came from.';
    case 'stripped':
      return `Unsigned, and earlier versions were signed by key ${trust.before.join(', ')}. A catalogue does not publish an unsigned version after a signed one, so this may not be from ${author}. It is not asked for.`;
    case 'first':
      return `Signed by key ${trust.key_id}. ${Seer} has not seen a key for ${author} before, so it now remembers this one.`;
    case 'known':
      return `Signed by key ${trust.key_id}, the key ${seer} has seen for ${author} before.`;
    case 'changed':
      return `Signed by key ${trust.key_id}, which is not the key ${seer} has seen for ${author} before (${trust.before.join(', ')}). Somebody else may have published it.`;
    case 'rotated':
      return `Signed by key ${trust.key_id}, which key ${trust.from}, the one ${seer} has seen for ${author}, named as its successor. ${Seer} now remembers it too.`;
    case 'revoked':
      return `Signed by key ${trust.key_id}, which its author revoked, so it is not trusted. Their reason: ${trust.reason}`;
  }
}

/* ── keys ───────────────────────────────────────────────────────────────── */

/** The keys this machine has seen per entry (`trustSubject`: kind and id, never the author name), beside the hosts file. */
export const knownKeysPath = (io: AgentIo): string => join(dirname(hostsPath(io.env)), 'known-keys.json');

export function knownKeys(io: AgentIo): KnownKeys {
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

/** The record's pref the publisher keys are kept under (`PREF_KEYS` in `@braindog/record`), the one the app's Browse reads. */
export const KNOWN_PREF = 'packs.known_keys';

/** What the record takes (`setPref`): at most this many add-ons, each with at most this many key ids, newest kept. */
const KNOWN_MOST = 200;
const KEYS_MOST = 8;

/** The one call the key source makes of a record: `client.call`, or a stand-in in a test. */
export type PrefCall = (name: string, args: Record<string, unknown>) => Promise<Result<unknown>>;

/**
 * Where the publisher keys a person has seen are read and kept for one command.
 *
 * `on` says which list was read: the record's, with this machine's file folded in, or this machine's alone.
 */
export type KeySource = { on: 'record' | 'machine'; known: KnownKeys; keep(subject: string, keyId: string): Promise<void> };

/**
 * The newest `KNOWN_MOST` add-ons, each with its newest `KEYS_MOST` keys, so a full map is never refused whole: the same
 * hold as `capKnown` in the app's `known-keys.ts`, written again here because the command line never imports the app.
 */
function capKnown(known: KnownKeys): KnownKeys {
  return Object.fromEntries(
    Object.entries(known)
      .filter(([subject]) => subject.length > 0 && subject.length <= 300)
      .slice(-KNOWN_MOST)
      .map(([subject, ids]) => [subject, ids.slice(-KEYS_MOST)]),
  );
}

/** Two maps as one, each add-on's keys first seen first and each once. */
function mergeKnown(a: KnownKeys, b: KnownKeys): KnownKeys {
  const out: KnownKeys = {};
  for (const map of [a, b]) for (const [subject, ids] of Object.entries(map)) out[subject] = [...new Set([...(out[subject] ?? []), ...ids])];
  return out;
}

const MACHINE = "Using this machine's list of publishers:";

/**
 * The keys this person has seen, read from their record when the command line reaches one that gives them, and this
 * machine's `known-keys.json` otherwise, said once in one line.
 *
 * THE RECORD'S LIST IS THE APP'S: `packs.known_keys` as `boot` answers it on `me.prefs`, parsed by the same
 * `readKnownKeys` Browse parses it with. This machine's file is folded in, so a key first met here before the record
 * held it is not met again as a stranger. A record that answers no `me.prefs` (one that gives its prefs to a person and
 * not to a token) is said as not giving the list, and the file is read alone.
 *
 * A KEPT KEY GOES TO THE FILE ALWAYS, AND TO THE RECORD ONLY WHEN IT WAS READ: `setPref` replaces the whole map, so a map
 * the record never gave would write over every publisher it holds. Public key ids only; nothing here holds a signing key.
 */
export async function keySource(io: AgentIo, call: PrefCall | null, why = 'not signed in.'): Promise<KeySource> {
  const machine = knownKeys(io);
  const alone = (said: string): KeySource => {
    io.say(`${MACHINE} ${said}`);
    return { on: 'machine', known: machine, keep: async (subject, keyId) => remember(io, subject, keyId) };
  };
  if (call === null) return alone(why);
  let answer: Result<unknown>;
  try {
    answer = await call('boot', {});
  } catch {
    return alone('BrainDog did not answer.');
  }
  if (!answer.ok) {
    const code = refused(answer) ? answer.refusal.code : undefined;
    /* A HOST SET WITH NO LOGIN, OR ONE THE RECORD NO LONGER TAKES, IS NOT SIGNED IN, and is said as that. */
    const out = code === 'UNAUTHORIZED' || code === 'GRANT_REVOKED' || code === 'WRONG_KEY';
    return alone(out ? 'not signed in.' : code === 'UNREACHABLE' ? 'BrainDog did not answer.' : 'BrainDog did not give its list.');
  }
  const prefs = (answer.value as { me?: { prefs?: unknown } } | null)?.me?.prefs;
  if (typeof prefs !== 'object' || prefs === null) return alone('BrainDog does not give its list to the command line.');
  let known = mergeKnown(readKnownKeys((prefs as Record<string, unknown>)[KNOWN_PREF]), machine);
  let told = false;
  return {
    on: 'record',
    get known() {
      return known;
    },
    keep: async (subject, keyId) => {
      remember(io, subject, keyId);
      known = rememberKey(known, subject, keyId);
      let kept = false;
      try {
        kept = (await call('setPref', { key: KNOWN_PREF, value: capKnown(known) })).ok;
      } catch {
        kept = false;
      }
      if (!kept && !told) {
        told = true;
        io.say('BrainDog did not keep this publisher key, so only this machine remembers it.');
      }
    },
  };
}

/**
 * `keySource` over the host the command line talks to: no host set is not signed in, and the record is asked with the
 * session it already holds, under the same time limit `connect` gives a call.
 */
export async function hostKeys(host: string | undefined, io: AgentIo): Promise<KeySource> {
  let to: Target;
  try {
    to = target(host, io.env, hostsPath(io.env));
  } catch {
    return keySource(io, null);
  }
  const headers = await io.headers(to.key);
  /* A CLIENT A CALL, so the keep after an install's checks has its own time limit and not what the read left of one. */
  return keySource(io, (name, args) => clientFor(to, async () => headers, AbortSignal.timeout(budgetOf(io.env))).call<unknown>(name, args));
}

/** Whether any version of an entry is signed, the only case where whose key it is can change what is said. */
const signedAnywhere = (entry: CatalogueEntry): boolean => entry.versions.some((v) => Boolean(v.signature));

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

/**
 * `publish <file> --to <folder>` into a catalogue folder, or `publish <file> --kennel [host]` to a Kennel (`kennel.ts`),
 * signed with `--sign <key file>` either way when one is named.
 */
async function publish(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} publish`;
  /* --GITHUB PUSHES THE FOLDER WITH THE PERSON'S OWN `gh` AND TAGS THE VERSION (`addon-dev.ts`). */
  if (kind === 'pack' && args.includes('--github')) return (await import('./addon-dev.ts')).publishGithub(args, io);
  const { rest, kennel: toKennel } = takeKennel(args);
  let values: { to?: string | undefined; sign?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { to: { type: 'string' }, sign: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes one file, --to <folder> or --kennel [host], and --sign <key file>.`);
    return 1;
  }
  const [file, ...more] = positionals;
  const example = kind === 'usecase' ? 'study-1.0.0.usecase.json' : 'bookshelf/bookshelf.pack.json';
  if (!file || more.length > 0 || (values.to === undefined) === (toKennel === undefined)) {
    io.say(`${cmd} takes one file and either --to <folder> or --kennel [host], as in ${cmd} ${example} --to ./catalogue or ${cmd} ${example} --kennel.`);
    return 1;
  }
  const source = await loadSource(file, io);
  if (!source.ok) {
    io.say(source.fix);
    return 1;
  }
  const shape = await readCatalogueFile(source.text);
  if (shape.ok && shape.value.kind !== kind) {
    io.say(`${file} is ${NOUN[shape.value.kind].a}, not ${NOUN[kind].a}. Publish it with braindog ${NOUN[shape.value.kind].command} publish.`);
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
  if (toKennel !== undefined) {
    /* THE FILE IS READ HERE FIRST, so a file the Kennel would refuse for its shape is said without sending it. */
    if (!shape.ok) return refuse(io, shape, `${file}: ${saidWithCode(shape)} Nothing was sent.`);
    return submitToKennel(source.text, shape.value, toKennel, signer, io);
  }
  if (values.to === undefined) return 1;
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
  io.out(`${oneLine(entry.title)} ${version.version} published to ${at.where}${version.signature ? `, signed by key ${version.signature.key_id}` : ', unsigned'}.`);
  if (changes.from !== null) for (const line of changeLines(changes)) io.out(line);
  for (const line of reachLines(version.reach)) io.out(line);
  return 0;
}

async function search(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} search`;
  const { rest, kennel: inKennel } = takeKennel(args);
  let values: { from?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { from: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes words, and --from <folder or address> or --kennel [host].`);
    return 1;
  }
  if (values.from !== undefined && inKennel !== undefined) {
    io.say(`${cmd} reads one catalogue: --from <folder or address>, or --kennel [host].`);
    return 1;
  }
  /* NO --from IS THE KENNEL, the public one unless --kennel names another: a Kennel is a catalogue at an address. */
  let from = values.from;
  if (from === undefined) {
    try {
      from = inKennel === undefined || inKennel === null ? DEFAULT_KENNEL : kennelBase(inKennel);
    } catch (e) {
      io.say(e instanceof Error ? e.message : 'That is not a Kennel address.');
      return 1;
    }
  }
  const at = await catalogueAt(from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const found = searchCatalogue(at.index, positionals.join(' '), kind);
  if (found.length === 0) {
    io.out(positionals.length === 0 ? `This catalogue has no ${NOUN[kind].the} published yet.` : `No ${NOUN[kind].the} in this catalogue matches ${positionals.join(' ')}.`);
    return 0;
  }
  /* THE RECORD IS ASKED ONLY WHEN A SIGNATURE IS THERE TO JUDGE, so a search of unsigned add-ons still sends nothing. */
  const source = found.some(signedAnywhere) ? await hostKeys(undefined, io) : null;
  const known = source?.known ?? knownKeys(io);
  const statements = await verifiedStatements(at.index.keys);
  for (const e of found) {
    const v = e.versions[0];
    /* THE ENTRY AS THE INDEX HOLDS IT decides trust, and a scrubbed copy is what is printed. */
    const shown = printable(e);
    io.out(`${shown.id}  ${shown.title} ${shown.latest} by ${shown.author}. ${shown.summary}`);
    if (v) for (const line of reachLines(v.reach)) io.out(line);
    io.out(`  ${trustLine(trustOf(known, trustSubject(e), v?.signature, statements, v ? await keysSignedBefore(e, v.version) : []), e.author, source?.on)}`);
  }
  io.out(`Not from the add-on index. A signature is checked when it is installed, with braindog ${kind} install <id> --from ${from}.`);
  return 0;
}

const YAML_FILE = /\.ya?ml$/iu;
const SDK_FILE = /\.(pack|usecase)\.(json|ya?ml)$/iu;

/**
 * A file named on the command line, as JSON text, and the folder it sits in when it is on this machine.
 *
 * A FOLDER IS THE FILE INSIDE IT that `pack new` wrote: `<folder name>.pack.json` or `.pack.yaml`, or else the one add-on
 * or use-case file it holds. A YAML file is read through `@braindog/declare/yaml`, the one parser (ADR-063), and handed
 * on as the JSON it means, so every door after this one, a checksum and a signature included, reads JSON only.
 */
export async function loadSource(given: string, io: AgentIo): Promise<{ ok: true; text: string; dir: string | null } | { ok: false; fix: string }> {
  let name = given;
  let dir: string | null = null;
  /* `git:owner/repo@ref:path`, THE LINE `addon publish --github` PRINTS, read as the raw file the record's host reads. */
  if (given.startsWith('git:')) {
    const raw = (await import('./addon-dev.ts')).gitAddress(given, io.env);
    if (raw === null) return { ok: false, fix: 'A git line reads git:owner/repo@ref:path, such as git:someone/bookshelf@v1.0.0:bookshelf.pack.json.' };
    name = raw;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(given)) {
    const path = resolve(io.cwd, given);
    let folder = false;
    try {
      folder = statSync(path).isDirectory();
    } catch {
      folder = false;
    }
    if (folder) {
      const inside = readdirSync(path).filter((f) => SDK_FILE.test(f));
      const own = ['.pack.json', '.pack.yaml', '.pack.yml', '.usecase.json', '.usecase.yaml'].map((s) => `${basename(path)}${s}`).find((f) => inside.includes(f));
      const found = own ?? (inside.length === 1 ? inside[0] : undefined);
      if (found === undefined)
        return { ok: false, fix: inside.length === 0 ? `${given} holds no .pack.json, .pack.yaml or .usecase.json file.` : `${given} holds ${inside.join(', ')}; name the one you mean.` };
      name = join(path, found);
      dir = path;
    } else dir = dirname(path);
  }
  const source = await readSource(name, io);
  if (!source.ok) return source;
  if (!YAML_FILE.test(name)) return { ok: true, text: source.text, dir };
  const parsed = parseYaml(source.text);
  if (!parsed.ok) return { ok: false, fix: `${given}: ${saidWithCode(parsed)}` };
  return { ok: true, text: `${JSON.stringify(parsed.value, null, 2)}\n`, dir };
}

async function readFileAs(given: string, io: AgentIo, kind: EntryKind): Promise<{ text: string; file: CatalogueFile; dir: string | null } | number> {
  const source = await loadSource(given, io);
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
    io.say(`${given} is ${NOUN[read.value.kind].a}, not ${NOUN[kind].a}. Use braindog ${NOUN[read.value.kind].command} for it.`);
    return 1;
  }
  return { text: source.text, file: read.value, dir: source.dir };
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

/**
 * The catalogue a host serves, as an address: its Kennel at `/api/kennel/v1/` (`docs/14-KENNEL-AND-COMMUNITY.md` §1),
 * which is the folder bundled with its shell (`apps/web/static/catalogue`, filled from `packs/` by
 * `tools/catalogue/from-packs.mjs`) merged with what authors published to the Kennel, on the Cloud and on a self-host.
 *
 * THE HOST THE CLI ALREADY TALKS TO, so `pack install project-brief` needs no `--from`, and the import resolves a pack it
 * offers by id in the same place the app's Browse lists it. No token goes with the read: the Kennel's reads are public.
 */
export function hostCatalogue(host: string | undefined, io: AgentIo): string {
  return new URL(KENNEL_BASE, target(host, io.env, hostsPath(io.env)).base).href;
}

/**
 * The host's catalogue that holds `id`: its Kennel, or else the bundled folder at `/catalogue/`.
 *
 * THE FOLDER IS ASKED ONLY WHEN THE KENNEL DOES NOT HOLD THE ID, for two reasons: a host deployed before its Kennel
 * answers no index there, and the Kennel's public index leaves out an `unlisted` add-on, which installs by its id
 * from the folder that ships it. When neither holds it, the Kennel is named, so the refusal lists every add-on it lists.
 */
export async function hostCatalogueFor(id: string, kind: EntryKind, host: string | undefined, io: AgentIo): Promise<string> {
  const kennel = hostCatalogue(host, io);
  const bare = kind === 'usecase' ? id.replace(/^usecase-/u, '') : id;
  const holds = async (from: string): Promise<boolean> => {
    const at = await catalogueAt(from, io);
    return typeof at !== 'string' && at.index.entries.some((e) => e.id === bare && e.kind === kind);
  };
  if (await holds(kennel)) return kennel;
  const folder = new URL('/catalogue/', kennel).href;
  return (await holds(folder)) ? folder : kennel;
}

/** What installing a file would ask, said without asking: what it needs first and what it adds, from its own declarations. */
function planLines(file: CatalogueFile): string[] {
  const { title, version } = file.kind === 'usecase' ? printable(file.shared.usecase) : printable({ title: file.file.title, version: file.file.pack.manifest.version });
  return [`${title} ${version} reads as ${NOUN[file.kind].a}, and this is what installing it would ask.`, ...reachLines(reachOf(file))];
}

/**
 * Whether a version already held to its checksum may be asked for, and how far its signature is trusted, or the sentence
 * refusing it: signed by a key its author revoked, unsigned after signed versions, or unsigned where this machine has
 * seen a key for it.
 *
 * ONE CHECK FOR EVERY DOOR A PACK COMES IN BY. `pack install` asks it, and so does the import when it resolves the packs
 * an adapter offers (`packFrom` in `adapter.ts`). The import held an offer to its checksum and its entry only, so a
 * version `pack install` refuses as revoked was filed on Decide by the import as if nothing were wrong.
 */
export async function trustVersion(
  entry: CatalogueEntry,
  version: string,
  signature: Signature | null | undefined,
  keys: unknown,
  known: KnownKeys,
): Promise<{ ok: true; trust: Trust } | { ok: false; fix: string }> {
  const statements = await verifiedStatements(keys);
  const title = oneLine(entry.title);
  /* A REVOKED KEY IS SAID AND NOTHING IS ASKED. */
  const revoked = revokedNotice(statements, title, version, signature);
  if (revoked !== null) return { ok: false, fix: oneLine(revoked) };
  const before = await keysSignedBefore(entry, version);
  /* NOR IS ONE THAT LOST ITS SIGNATURE AFTER SIGNED VERSIONS. */
  if (!signature && before.length > 0) return { ok: false, fix: strippedNotice(title, version, before) };
  const trust = trustOf(known, trustSubject(entry), signature, statements, before);
  if (trust.kind === 'stripped') return { ok: false, fix: `${title} ${version}: ${trustLine(trust, entry.author)}` };
  return { ok: true, trust };
}

/** `install <id> --from <catalogue> [--version x.y.z]`: the file held to its checksum and signature, then asked for on Decide, or with `dryRun` only said. */
export async function installFromCatalogue(
  id: string,
  from: string,
  version: string | undefined,
  host: string | undefined,
  io: AgentIo,
  kind: EntryKind = 'usecase',
  dryRun = false,
  hostsOwn = false,
  trustKey = false,
): Promise<number> {
  const at = await catalogueAt(from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const bare = kind === 'usecase' ? id.replace(/^usecase-/u, '') : id;
  const entry = at.index.entries.find((e) => e.id === bare && e.kind === kind);
  if (!entry) {
    const ids = at.index.entries.filter((e) => e.kind === kind).map((e) => e.id);
    /* AN ADD-ON ASKED FOR AS A USE CASE is the owner's to install: an agent asks for it with `propose` and he presses yes. */
    const pack = kind === 'usecase' && at.index.entries.some((e) => e.id === bare && e.kind === 'pack');
    io.say(
      pack
        ? `${bare} is an add-on, not a starter. Ask for it with propose, body_kind pack and {"install":"${bare}"}, and it installs when the owner says yes.`
        : `There is no ${NOUN[kind].the} called ${bare} in this catalogue.${ids.length ? ` It has: ${ids.join(', ')}.` : ''}`,
    );
    return 1;
  }
  if (version !== undefined && !VERSION.test(version)) {
    io.say(`--version is three numbers, as in 1.0.0.`);
    return 1;
  }
  const chosen = entry.versions.find((v) => v.version === (version ?? entry.latest));
  if (!chosen) {
    io.say(`${oneLine(entry.title)} has no version ${version} in this catalogue. It has ${entry.versions.map((v) => v.version).join(', ')}.`);
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
  /* THE RECORD IS ASKED ONLY WHEN A SIGNATURE IS THERE TO JUDGE, as `search` asks it. */
  const source = signedAnywhere(entry) ? await hostKeys(host, io) : null;
  const trusted = await trustVersion(entry, chosen.version, held.value, at.index.keys, source?.known ?? knownKeys(io));
  if (!trusted.ok) {
    io.say(`${trusted.fix} Nothing was sent.`);
    return 1;
  }
  const { trust } = trusted;
  const title = oneLine(entry.title);
  const said = trustLine(trust, entry.author, source?.on);
  /* A DIFFERENT KEY IS HELD BACK, as the app's Browse holds it until Trust this key is pressed: here, until --trust-key. */
  if (trust.kind === 'changed' && !trustKey) {
    const press = `If ${oneLine(entry.author)} told you their key changed, run this again with --trust-key.`;
    io.say(`${title} ${chosen.version}: ${said} It is not asked for. ${press} Nothing was sent.`);
    return 1;
  }
  io.out(said);
  const question = `Install ${title} ${chosen.version} from a catalogue? ${said}`;
  /* A DRY RUN REMEMBERS NO KEY: nothing was asked for, so nothing was trusted. */
  if (dryRun) {
    for (const line of planLines(read.value)) io.out(line);
    io.out(`Would ask the owner: ${question} Nothing was sent.`);
    return 0;
  }
  /* THE KEY IS REMEMBERED ON FIRST USE, OR WHEN A KEY ALREADY TRUSTED NAMED IT, OR A DIFFERENT KEY THE PERSON TRUSTED
     WITH --trust-key, kept beside the ones seen before and never in place of them. */
  const keep = trust.kind === 'changed' ? trust.key_id : keyToKeep(trust);
  if (keep !== null) await (source ? source.keep(trustSubject(entry), keep) : Promise.resolve(remember(io, trustSubject(entry), keep)));
  if (read.value.kind === 'usecase') return proposeFile(text, read.value.shared.usecase, host, io, question);
  return proposePack(read.value.file.pack.manifest.pack, read.value.file.doc, question, host, io, hostsOwn);
}

/**
 * `byId` is for the host's own catalogue at its newest version: THE HOST INSTALLS WHAT ITS CATALOGUE HOLDS FROM ITS OWN
 * DOCUMENT and refuses one sent beside it (`arrange.ts`, at `body.doc`), so that refusal is asked again by the id alone.
 * A host whose catalogue does not hold it yet takes the document, as before.
 */
async function proposePack(id: string, doc: Record<string, unknown>, question: string, host: string | undefined, io: AgentIo, byId = false): Promise<number> {
  const { causeOf, connect, joinedSaid } = await import('./skills.ts');
  const at = await connect(host, io);
  if (typeof at === 'number') return at;
  /* ASKED ONCE: the same pack asked for again, from here or another machine, joins the open question. */
  const ask = (body: Record<string, unknown>) => at.client.call<{ id: string; joined?: true; said?: string }>('propose', { question, body_kind: 'pack', body, ...causeOf(`install#${id}`) });
  let answer = await ask({ install: id, doc });
  if (byId && refused(answer) && answer.refusal.at === 'body.doc') answer = await ask({ install: id });
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  const filed = (answer.value as { id?: unknown }).id;
  if (typeof filed !== 'string') {
    io.say('BrainDog took the question and did not say which one it is. Open Decide in the app.');
    return 1;
  }
  const joined = joinedSaid(answer.value);
  io.out(`${joined !== null ? joined : `Asked the owner: ${question}`} ${untilAccepted(at.to, filed)}`);
  return 0;
}

/* ── preview ────────────────────────────────────────────────────────────── */

/**
 * `usecase preview <file>` and `pack preview <file|dir>`: the file published to a scratch catalogue and a scratch
 * self-host started over it, with the page to install it from printed. An add-on is shown the way a use case is.
 */
async function preview(args: string[], io: AgentIo, kind: EntryKind = 'usecase'): Promise<number> {
  const cmd = `braindog ${kind} preview`;
  let values: { port?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { port: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes one file and --port <n>.`);
    return 1;
  }
  const [file, ...more] = positionals;
  const port = Number(values.port ?? '5870');
  if (!file || more.length > 0 || !Number.isInteger(port) || port < 1024 || port > 65535) {
    io.say(`${cmd} takes one file and --port <n> above 1023, as in ${cmd} ${kind === 'usecase' ? 'study-1.0.0.usecase.json' : 'bookshelf'} --port 5870.`);
    return 1;
  }
  const got = await readFileAs(file, io, kind);
  if (typeof got === 'number') return got;
  const read =
    got.file.kind === 'usecase'
      ? { text: got.text, id: got.file.shared.usecase.usecase, title: got.file.shared.usecase.title, version: got.file.shared.usecase.version }
      : { text: got.text, id: got.file.file.pack.manifest.pack, title: got.file.file.title, version: got.file.file.pack.manifest.version };

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
    io.say(`${cmd} needs the self-host. Set BRAINDOG_SELFHOST to its entry file.`);
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
    io.say('The scratch BrainDog for the preview could not be created.');
    return 1;
  }
  /* THE FILE'S TITLE IS ITS AUTHOR'S, and `preview` reads a file from an address as readily as `check` does. */
  io.out(`Previewing ${oneLine(read.title)} ${oneLine(read.version)} on a scratch BrainDog. Open http://localhost:${port}/addons/${read.id}?kind=${kind} and press Review the plan. Stop with Ctrl+C; the scratch BrainDog is removed.`);
  const code = await run(['serve'], true);
  rmSync(scratch, { recursive: true, force: true });
  return code;
}

/* ── yank ───────────────────────────────────────────────────────────────── */

/** `yank <id> <version> --reason <why> [--kennel host] [--sign <key file>]`: a version taken back on a Kennel (`kennel.ts`). */
async function yank(args: string[], io: AgentIo, kind: EntryKind): Promise<number> {
  const cmd = `braindog ${kind} yank`;
  const { rest, kennel: onKennel } = takeKennel(args);
  let values: { reason?: string | undefined; sign?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { reason: { type: 'string' }, sign: { type: 'string' } } }));
  } catch {
    io.say(`${cmd} takes an id, a version, --reason <why>, and --kennel [host] and --sign <key file>.`);
    return 1;
  }
  const [id, version, ...more] = positionals;
  const reason = values.reason?.trim() ?? '';
  if (!id || !version || more.length > 0 || !ID.test(id) || !VERSION.test(version) || reason === '') {
    io.say(`${cmd} takes an id, a version and --reason <why>, as in ${cmd} bookshelf 1.0.1 --reason "It drops every row's due date." Readers see the reason as written.`);
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
  return yankFromKennel(kind, id, version, reason, onKennel, signer, io);
}

/** The SDK verbs `usecase` and `pack` hand here, or `null` for a verb that is not one of them. */
export function sdkVerb(verb: string | undefined, kind: EntryKind = 'usecase'): ((args: string[], io: AgentIo) => Promise<number>) | null {
  if (verb === 'new') return kind === 'pack' ? createPack : createUseCase;
  if (verb === 'publish') return (a, io) => publish(a, io, kind);
  if (verb === 'yank') return (a, io) => yank(a, io, kind);
  if (verb === 'search') return (a, io) => search(a, io, kind);
  if (verb === 'diff') return (a, io) => diff(a, io, kind);
  if (verb === 'key') return (a, io) => key(a, io, kind);
  if (verb === 'preview') return (a, io) => preview(a, io, kind);
  return null;
}

const PACK_USAGE =
  'braindog addon takes new <id> [--yaml] [--from-page <file.dog>], check <file|dir>, test <dir>, dev <dir> [--port <n>], preview <file|dir>, diff <a> <b>, key <file> --author <name>, key rotate <old key file> <new key file> --to <folder>, key revoke <key file> --to <folder> --reason <why> [--successor <key id>], publish <file> --to <folder> or --kennel [host] [--sign <key file>], publish [<dir>] --github [--repo owner/name], yank <id> <version> --reason <why> [--kennel host], search [words] [--from <catalogue>], or install <id|file> [--from <catalogue>] [--version <x.y.z>] [--host <host>] [--dry-run] [--trust-key]. install <file> --force or uninstall <id> [--force] takes away a list that still holds items, keeping every one of them.';

/**
 * `pack install <file>`: a `.pack.json` from a path or an address, read through the add-on door here first, then asked for
 * on Decide with its document, the proposal the app's Browse files. With `dryRun` the plan is said and nothing is sent.
 *
 * NO CATALOGUE STANDS BEHIND A FILE, so nothing is said about who signed it: the person named the file themselves.
 */
async function installPackFile(given: string, host: string | undefined, io: AgentIo, dryRun: boolean, force = false): Promise<number> {
  const read = await readFileAs(given, io, 'pack');
  if (typeof read === 'number') return read;
  if (read.file.kind !== 'pack') return 1;
  /* --force SENDS THE PLAN STRAIGHT TO THE RECORD with his press (`install.ts` `forcedPack`), never by way of Decide. */
  if (force && !dryRun) {
    const { connect } = await import('./skills.ts');
    const at = await connect(host, io);
    if (typeof at === 'number') return at;
    return (await import('./install.ts')).forcedPack('install', { doc: read.file.file.doc }, at.client as never, io, true);
  }
  const { title, version } = printable({ title: read.file.file.title, version: read.file.file.pack.manifest.version });
  const question = `Install ${title} ${version}?`;
  if (dryRun) {
    for (const line of planLines(read.file)) io.out(line);
    io.out(`Would ask the owner: ${question} Nothing was sent.`);
    return 0;
  }
  return proposePack(read.file.file.pack.manifest.pack, read.file.file.doc, question, host, io);
}

/** `braindog addon …`: the add-on half of the SDK. */
export async function pack(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'check') return checkPack(rest, io);
  if (verb === 'test') return testPack(rest, io);
  if (verb === 'dev') return (await import('./addon-dev.ts')).dev(rest, io);
  if (verb === 'install') {
    let values: { host?: string | undefined; from?: string | undefined; version?: string | undefined; 'dry-run'?: boolean | undefined; 'trust-key'?: boolean | undefined; force?: boolean | undefined };
    let positionals: string[];
    try {
      ({ values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        strict: true,
        options: { host: { type: 'string' }, from: { type: 'string' }, version: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'trust-key': { type: 'boolean' }, force: { type: 'boolean' } },
      }));
    } catch {
      io.say(PACK_USAGE);
      return 1;
    }
    const [given, ...more] = positionals;
    if (!given || more.length > 0) {
      io.say('braindog addon install takes one id or one .pack.json file, as in braindog addon install project-brief or braindog addon install packs/project-brief/project-brief.pack.json.');
      return 1;
    }
    const dryRun = values['dry-run'] === true;
    if (!ID.test(given)) {
      if (values.from !== undefined || values.version !== undefined) {
        io.say('--from and --version pick an add-on from a catalogue by its id, so they do not go with a file.');
        return 1;
      }
      return installPackFile(given, values.host, io, dryRun, values.force === true);
    }
    /* NO --from IS THE HOST'S OWN KENNEL, which lists every pack in `packs/` and every add-on published to it. */
    let from = values.from;
    if (from === undefined) {
      try {
        from = await hostCatalogueFor(given, 'pack', values.host, io);
      } catch (e) {
        io.say(e instanceof Error ? e.message : 'No BrainDog host is set, so there is no catalogue to find the id in. Pass --from <catalogue>.');
        return 1;
      }
    }
    return installFromCatalogue(given, from, values.version, values.host, io, 'pack', dryRun, values.from === undefined && values.version === undefined, values['trust-key'] === true);
  }
  if (verb === 'uninstall') {
    const { force, rest: left } = (await import('./install.ts')).takeForce(rest);
    const [id, ...more] = left;
    if (!id || more.length > 0 || !ID.test(id)) {
      io.say('braindog addon uninstall takes one add-on id, as in braindog addon uninstall project-brief.');
      return 1;
    }
    const { connect } = await import('./skills.ts');
    const at = await connect(undefined, io);
    if (typeof at === 'number') return at;
    return (await import('./install.ts')).forcedPack('uninstall', { id }, at.client as never, io, force);
  }
  const sdk = sdkVerb(verb, 'pack');
  if (sdk) return sdk(rest, io);
  io.say(PACK_USAGE);
  return 1;
}
