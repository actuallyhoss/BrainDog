/**
 * The use-case SDK on this machine: `braindog usecase new|publish|search|diff|preview`, and `install <id> --from`
 * (`loop/research-marketplace.md` §3, over `@braindog/declare/catalogue`).
 *
 * NEW writes a starting file that already reads through `readShared`, so the first `check` passes and every edit after
 * it is checked the way a record will check it.
 *
 * PUBLISH WRITES INTO A CATALOGUE FOLDER, never to a service. The file is read through `readShared`, its version must be
 * later than the latest there and never one already published, and a version that takes a list, page, module or field
 * away must be a major. The file is written byte for byte and `index.json` beside it. A self-host serves that folder
 * with `BRAINDOG_CATALOGUE`, and a copy of it on any https host is read the same way.
 *
 * SEARCH AND DIFF SEND NOTHING to a record. `diff` says what moved between two versions and the bump that needs.
 *
 * INSTALL FROM A CATALOGUE ASKS, as every install from this command does: the file is held to the index's checksum, read
 * through `readShared`, and filed as a `pack` proposal for the owner to accept on Decide, where the record's own plan says
 * what it adds, changes and takes away.
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

import { exportUseCase, readShared, sharedFileName, type Shared } from '@braindog/declare';
import {
  CATALOGUE_INDEX,
  catalogueFile,
  changesBetween,
  emptyCatalogue,
  publishTo,
  readCatalogue,
  searchCatalogue,
  unchanged,
  verifyFile,
  type CatalogueIndex,
  type Changes,
  type Reach,
} from '@braindog/declare/catalogue';
import { refused, type Result } from '@braindog/ports';

import type { AgentIo } from './skills.ts';
import { proposeFile, readSource } from './usecase.ts';

const saidWithCode = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : 'That was not read.');
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;

/* ── new ────────────────────────────────────────────────────────────────── */

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
    declarations: [
      {
        register: 'items',
        name: 'Items',
        title: 'name',
        fields: [
          { id: 'name', type: 'text', required: true },
          { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
          { id: 'due', type: 'day' },
        ],
      },
      {
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
      },
    ],
    examples: [],
  });
}

async function create(args: string[], io: AgentIo): Promise<number> {
  let values: { title?: string | undefined; author?: string | undefined; out?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { title: { type: 'string' }, author: { type: 'string' }, out: { type: 'string' } } }));
  } catch {
    io.say('braindog usecase new takes an id, and --title, --author and --out.');
    return 1;
  }
  const [id, ...more] = positionals;
  if (!id || more.length > 0 || !ID.test(id)) {
    io.say('braindog usecase new takes one id of lower-case letters, digits and dashes, as in braindog usecase new reading-club.');
    return 1;
  }
  const words = id.replace(/-/gu, ' ');
  const title = values.title ?? words.charAt(0).toUpperCase() + words.slice(1);
  const built = starter(id, title, values.author ?? 'Your name');
  if (!built.ok) {
    io.say(saidWithCode(built));
    return 1;
  }
  const file = resolve(io.cwd, values.out ?? sharedFileName(id, '1.0.0'));
  if (existsSync(file)) {
    io.say(`${file} is already there, and new never writes over a file.`);
    return 1;
  }
  writeFileSync(file, `${JSON.stringify(built.value, null, 2)}\n`);
  io.out(`${title} 1.0.0 written to ${file}: one list and a page over it. Check it with braindog usecase check, and see it with braindog usecase preview.`);
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

async function publish(args: string[], io: AgentIo): Promise<number> {
  let values: { to?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { to: { type: 'string' } } }));
  } catch {
    io.say('braindog usecase publish takes one file and --to <folder>.');
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0 || values.to === undefined) {
    io.say('braindog usecase publish takes one file and --to <folder>, as in braindog usecase publish study-1.0.0.usecase.json --to ./catalogue.');
    return 1;
  }
  const source = await readSource(file, io);
  if (!source.ok) {
    io.say(source.fix);
    return 1;
  }
  const at = await catalogueAt(values.to, io, true);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const out = await publishTo(at.index, source.text, at.read);
  if (!out.ok) {
    io.say(saidWithCode(out));
    return 1;
  }
  const target = join(at.where, ...out.value.path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source.text);
  writeFileSync(join(at.where, CATALOGUE_INDEX), `${JSON.stringify(out.value.index, null, 2)}\n`);
  const { entry, version, changes } = out.value;
  io.out(`${entry.title} ${version.version} published to ${at.where}.`);
  if (changes.from !== null) for (const line of changeLines(changes)) io.out(line);
  for (const line of reachLines(version.reach)) io.out(line);
  return 0;
}

async function search(args: string[], io: AgentIo): Promise<number> {
  let values: { from?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { from: { type: 'string' } } }));
  } catch {
    io.say('braindog usecase search takes words and --from <folder or address>.');
    return 1;
  }
  if (values.from === undefined) {
    io.say('braindog usecase search needs --from <folder or address>, the catalogue to read.');
    return 1;
  }
  const at = await catalogueAt(values.from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const found = searchCatalogue(at.index, positionals.join(' '));
  if (found.length === 0) {
    io.out(positionals.length === 0 ? 'This catalogue has nothing published yet.' : `Nothing in this catalogue matches ${positionals.join(' ')}.`);
    return 0;
  }
  for (const e of found) {
    const v = e.versions[0];
    io.out(`${e.id}  ${e.title} ${e.latest} by ${e.author}. ${e.summary}`);
    if (v) for (const line of reachLines(v.reach)) io.out(line);
  }
  io.out(`Not from the add-on index, and unsigned. Install one with braindog usecase install <id> --from ${values.from}.`);
  return 0;
}

async function readFileShared(given: string, io: AgentIo): Promise<{ text: string; shared: Shared } | number> {
  const source = await readSource(given, io);
  if (!source.ok) {
    io.say(source.fix);
    return 1;
  }
  const shared = await readShared(source.text);
  if (!shared.ok) {
    io.say(`${given}: ${saidWithCode(shared)}`);
    return 1;
  }
  return { text: source.text, shared: shared.value };
}

async function diff(args: string[], io: AgentIo): Promise<number> {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {} }));
  } catch {
    io.say('braindog usecase diff takes two files, the earlier first.');
    return 1;
  }
  const [a, b, ...more] = positionals;
  if (!a || !b || more.length > 0) {
    io.say('braindog usecase diff takes two files, the earlier first, as in braindog usecase diff study-1.0.0.usecase.json study-1.1.0.usecase.json.');
    return 1;
  }
  const from = await readFileShared(a, io);
  if (typeof from === 'number') return from;
  const to = await readFileShared(b, io);
  if (typeof to === 'number') return to;
  if (from.shared.usecase.usecase !== to.shared.usecase.usecase) {
    io.say(`${a} is ${from.shared.usecase.usecase} and ${b} is ${to.shared.usecase.usecase}; diff compares two versions of one use case.`);
    return 1;
  }
  for (const line of changeLines(changesBetween(from.shared, to.shared))) io.out(line);
  return 0;
}

/* ── install from a catalogue ───────────────────────────────────────────── */

/** `install <id> --from <catalogue> [--version x.y.z]`: the file held to its checksum, then asked for on Decide. */
export async function installFromCatalogue(id: string, from: string, version: string | undefined, host: string | undefined, io: AgentIo): Promise<number> {
  const at = await catalogueAt(from, io);
  if (typeof at === 'string') {
    io.say(at);
    return 1;
  }
  const bare = id.replace(/^usecase-/u, '');
  const entry = at.index.entries.find((e) => e.id === bare);
  if (!entry) {
    const ids = at.index.entries.map((e) => e.id);
    io.say(`There is no use case called ${bare} in this catalogue.${ids.length ? ` It has: ${ids.join(', ')}.` : ''}`);
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
  const text = await at.read(catalogueFile(entry.id, chosen.version));
  if (text === null) {
    io.say(`${catalogueFile(entry.id, chosen.version)} is listed in this catalogue and missing from it.`);
    return 1;
  }
  const held = await verifyFile(chosen, text);
  if (!held.ok) {
    io.say(saidWithCode(held));
    return 1;
  }
  const shared = await readShared(text, { kind: 'url', ref: at.where });
  if (!shared.ok) {
    io.say(saidWithCode(shared));
    return 1;
  }
  return proposeFile(text, shared.value.usecase, host, io);
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
  const read = await readFileShared(file, io);
  if (typeof read === 'number') return read;

  const scratch = mkdtempSync(join(tmpdir(), 'braindog-preview-'));
  const catalogue = join(scratch, 'catalogue');
  mkdirSync(catalogue);
  const out = await publishTo(emptyCatalogue('Preview'), read.text, () => null);
  if (!out.ok) {
    rmSync(scratch, { recursive: true, force: true });
    io.say(saidWithCode(out));
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

/** The SDK verbs `usecase` hands here, or `null` for a verb that is not one of them. */
export function sdkVerb(verb: string | undefined): ((args: string[], io: AgentIo) => Promise<number>) | null {
  return verb === 'new' ? create : verb === 'publish' ? publish : verb === 'search' ? search : verb === 'diff' ? diff : verb === 'preview' ? preview : null;
}

