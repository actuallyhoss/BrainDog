/**
 * `from-packs`: every pack in `packs/` published into the catalogue the web app ships, so Browse lists it and a host
 * resolves its id (brief B3 of `loop/research-legacy-parity.md`).
 *
 *   node tools/catalogue/from-packs.mjs [--packs <folder>] [--to <catalogue folder>] [--previews]
 *
 * With no flags it reads `packs/` and writes `apps/web/static/catalogue/`, the folder the Worker's static assets and a
 * self-host both serve under `/app/catalogue/`. Before this, that folder listed one add-on, `reading-list`, and none of
 * the four packs in `packs/`, so nothing in `packs/` could be installed from the app or by id from the CLI.
 *
 * THROUGH `publishTo`, THE DOOR `braindog pack publish` USES, and not a copy with an index line written by hand. So each
 * file is read through the add-on door a record reads it through, its checksum and reach are worked out the same way,
 * and a later version that takes a list or a page away must say so with a major. A file the door refuses stops the
 * build with the door's own sentence.
 *
 * A PUBLISHED VERSION NEVER CHANGES. Readers hold a version to the checksum the index gives, and a record that installed
 * 1.0.0 compares against it, so a pack edited without a new version is refused here rather than rewritten under them.
 * The same file at the same version is passed over and nothing is written, which is also what keeps `published_at`
 * from taking a new date on every build and the committed index from churning.
 *
 * A PACK WITH NO TEST IS REFUSED, because `packs/README.md` holds each pack to a test that installs the file exactly as
 * it ships. Any `*.test.ts`, `.mjs` or `.js` beside the pack file counts: `packs/portfolio-bands` is tested by
 * `bands.test.ts`, not by a file named after its folder. A folder with no `<folder>.pack.json` is not a pack and is
 * passed over, since an import adapter with only a map and a script lives in `packs/` too.
 *
 * THE CATALOGUE ID IS THE ONE THE FILE GIVES ITSELF, not the folder's: `packs/mercury` publishes `mercury-company` and
 * `packs/rates-poll` publishes `rates-open-er-api-com`, and those are the ids a record holds them under.
 *
 * NOTHING IS WRITTEN UNLESS EVERY PACK PASSES, so a refused pack leaves the catalogue as it was rather than half moved.
 *
 * EVERY ENTRY SAYS WHAT A MARKETPLACE SHOWS (`loop/finish/platform.md` §4.0 C): BrainDog as its publisher, its
 * categories worked out from its latest file by `categoriesOf`, and `unlisted` when that file says so (decisions.md
 * C41: a pack named for one person or one bank stays in the index, so it installs by id, and out of every listing). The
 * index is not hashed, only the files are, so an entry published before these fields existed is given them here without
 * a new version, and a new version's `changes` becomes its `notes` through `publishTo`.
 *
 * A PREVIEW BESIDE EACH VERSION FROM `packs/` THAT ADDS A PAGE, made by `previews.mjs` in a scratch record, for a version
 * that has none. `--previews` remakes every one, because a preview is the record's page answer as today's code draws it.
 * A pack whose preview cannot be made is still published, without one, and the run says why.
 *
 * THE INDEX IS WRITTEN AS `readCatalogue` READS IT, and only when that text differs from the file's, so a run with nothing
 * new leaves the committed index byte for byte as it was.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  BRAINDOG_PUBLISHER,
  CATALOGUE_INDEX,
  catalogueFile,
  categoriesOf,
  emptyCatalogue,
  fileChecksum,
  previewFile,
  publishTo,
  readCatalogue,
  readCatalogueFile,
} from '../../packages/declare/src/catalogue.ts';
import { makePreview } from './previews.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = /\.test\.(?:ts|mjs|js)$/u;

const { values } = parseArgs({ options: { packs: { type: 'string' }, to: { type: 'string' }, previews: { type: 'boolean' } }, strict: true });
const packsDir = resolve(values.packs ?? join(ROOT, 'packs'));
const to = resolve(values.to ?? join(ROOT, 'apps', 'web', 'static', 'catalogue'));

const fail = (line) => {
  console.error(`from-packs: ${line}`);
  process.exit(1);
};

let index = emptyCatalogue('BrainDog');
const indexFile = join(to, CATALOGUE_INDEX);
const indexWas = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : null;
if (indexWas !== null) {
  const read = readCatalogue(JSON.parse(indexWas));
  if (!read.ok) fail(`${indexFile} does not read as a catalogue: ${read.refusal.fix}`);
  index = read.value;
}

/* WHAT THIS RUN WOULD WRITE, held back until every pack has passed. */
const files = new Map();
const held = (path) => files.has(path) || existsSync(join(to, ...path.split('/')));
const read = (path) => files.get(path) ?? (existsSync(join(to, ...path.split('/'))) ? readFileSync(join(to, ...path.split('/')), 'utf8') : null);
const said = [];
const now = new Date();
/* Every pack in `packs/` as its file says it, by the catalogue id it gives itself, for the previews and their needs. */
const packs = new Map();

for (const folder of readdirSync(packsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const dir = join(packsDir, folder);
  const file = join(dir, `${folder}.pack.json`);
  if (!existsSync(file)) continue;
  const where = `packs/${folder}`;
  if (!readdirSync(dir).some((f) => TEST.test(f))) fail(`${where} has no test. A pack ships with one that installs ${folder}.pack.json as it ships (packs/README.md).`);
  const text = readFileSync(file, 'utf8');
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    fail(`${where}/${folder}.pack.json is not JSON.`);
  }
  packs.set(doc.pack, { where, doc });
  const listed = index.entries.find((e) => e.kind === 'pack' && e.id === doc.pack)?.versions.find((v) => v.version === doc.version);
  if (listed && listed.checksum === (await fileChecksum(text))) continue;
  const out = await publishTo(index, text, read, now, undefined, BRAINDOG_PUBLISHER);
  if (!out.ok) fail(`${where}: ${out.refusal.fix} (${out.refusal.code})`);
  index = out.value.index;
  files.set(out.value.path, text);
  said.push(`${where} published as ${out.value.path}`);
}

/* EVERY ENTRY DESCRIBED FROM ITS LATEST FILE, the ones published before these fields existed included. A latest file
   that no longer reads through its door keeps the entry as it was, and the run says so rather than stopping the build
   over a version already published. */
const described = [];
for (const entry of index.entries) {
  const path = catalogueFile(entry.id, entry.latest, entry.kind);
  const text = read(path);
  const file = text === null ? null : await readCatalogueFile(text, { kind: 'local' });
  if (!file?.ok) {
    said.push(`${path} ${text === null ? 'is missing' : `no longer reads (${file?.refusal?.fix ?? 'its door refused it'})`}, so ${entry.id} is described as it was`);
    described.push(entry);
    continue;
  }
  const { categories: _c, publisher: _p, unlisted: _u, ...rest } = entry;
  const unlisted = entry.kind === 'pack' && JSON.parse(text).unlisted === true;
  described.push({ ...rest, categories: categoriesOf(file.value, BRAINDOG_PUBLISHER.name), publisher: BRAINDOG_PUBLISHER, ...(unlisted ? { unlisted: true } : {}) });
}
index = { ...index, entries: described };

/* A PREVIEW FOR EACH VERSION IN `packs/` THAT ADDS A PAGE and has none, or for every one with `--previews`. */
for (const [id, { where, doc }] of packs) {
  if (!(doc.declarations ?? []).some((d) => typeof d?.page === 'string')) continue;
  const path = previewFile(id, doc.version, 'pack');
  const had = held(path);
  if (!had || values.previews) {
    /* A PREVIEW THAT THROWS IS A PREVIEW NOT MADE. The web build runs this tool, so a scratch record that fails in a way
       the record does not answer as a refusal is said here, beside the pack, and the build goes on without it. */
    const made = await makePreview(doc, new Map([...packs].map(([k, v]) => [k, v.doc])), now).catch((e) => ({ ok: false, why: `making it threw: ${e instanceof Error ? e.message : String(e)}` }));
    if (made.ok) {
      files.set(path, `${JSON.stringify(made.preview, null, 2)}\n`);
      said.push(`${where} previewed as ${path}`);
    } else said.push(`${where} has ${had ? 'kept its old preview' : 'no preview'}, because ${made.why}`);
  }
  if (!held(path)) continue;
  index = {
    ...index,
    entries: index.entries.map((e) => (e.kind === 'pack' && e.id === id ? { ...e, versions: e.versions.map((v) => (v.version === doc.version ? { ...v, preview: true } : v)) } : e)),
  };
}

/* THE INDEX AS ITS OWN READER READS IT, so the order of every key is the one the next run writes too. */
const canonical = readCatalogue(JSON.parse(JSON.stringify(index)));
if (!canonical.ok) fail(`the index this run made does not read back: ${canonical.refusal.fix}`);
const indexText = `${JSON.stringify(canonical.value, null, 2)}\n`;

for (const [path, text] of files) {
  const target = join(to, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
if (indexText !== indexWas) {
  mkdirSync(to, { recursive: true });
  writeFileSync(indexFile, indexText);
  if (files.size === 0) said.push(`${indexFile} now says each entry's publisher, categories and previews`);
}
console.log(said.length === 0 ? `from-packs: every pack in ${packsDir} is already in ${to}.` : `from-packs: ${said.join('; ')}.`);
