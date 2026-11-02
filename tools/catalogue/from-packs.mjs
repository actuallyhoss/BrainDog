/**
 * `from-packs`: every pack in `packs/` published into the catalogue the web app ships, so Browse lists it and a host
 * resolves its id.
 *
 *   node tools/catalogue/from-packs.mjs [--packs <folder>] [--to <catalogue folder>] [--previews] [--check]
 *
 * With no flags it reads `packs/` and writes `apps/web/static/catalogue/`, the folder the Worker's static assets and a
 * self-host both serve at `/catalogue/`. Before this, that folder listed one add-on, `reading-list`, and none of
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
 * it ships. A `*.test.ts`, `.mjs` or `.js` beside the pack file counts when it calls `test(` and names
 * `<folder>.pack.json`: `packs/portfolio-bands` is tested by `bands.test.ts`, not by a file named after its folder. AN
 * EMPTY FILE IS NO TEST, and is refused in the sentence a missing one gets: before, any file with a test's name
 * counted, and an empty `bands.test.ts` published a pack. A folder with no `<folder>.pack.json` is not a pack and is
 * passed over, since an import adapter with only a map and a script lives in `packs/` too.
 *
 * THE CATALOGUE ID IS THE ONE THE FILE GIVES ITSELF, not the folder's: `packs/mercury` publishes `mercury-company` and
 * `packs/rates-poll` publishes `rates-open-er-api-com`, and those are the ids a record holds them under.
 *
 * USE CASES GO THROUGH THE SAME DOOR, AS KIND `usecase`. A folder under `packs/` may also hold
 * `<id>.usecase.json`, a use case file named after the id inside it, such as the front an add-on is offered under to a
 * stranger at the first run; and the use cases this build ships are written in beside them, each as the file
 * `builtInFile` in `packages/seed/src/usecases/share.ts` already hands Browse. Each entry carries the `signals` and
 * `modules` its file says, which is what the first run listens for (`apps/web/src/lib/start/offer.ts`), so a use case
 * is heard because the catalogue lists it and not because a list in code names it. The same rules hold as for a pack:
 * a published version never changes, a refused file stops the build with the door's sentence, and the same file again
 * is passed over. A use case file needs no test of its own, since it carries no list a person keeps rows in that the
 * door does not read, and a file in `packs/` that takes a built-in's id, or another file's, is refused.
 *
 * NOTHING IS WRITTEN UNLESS EVERY PACK PASSES, so a refused pack leaves the catalogue as it was rather than half moved.
 *
 * A YANK COMES FROM A PACK'S OWN `yanked.json`, NEVER FROM A HAND EDIT OF THE CATALOGUE (`apps/web/static/catalogue`
 * is generated, and a hand edit there is overwritten by the next run). `packs/<folder>/yanked.json` maps a
 * catalogue id that folder publishes to why it is withdrawn; this run stamps each onto the matching index entry's
 * matching versions, and a version already carrying a reason keeps it, so a second run writes nothing new.
 *
 * EVERY ENTRY SAYS WHAT A MARKETPLACE SHOWS: BrainDog as its publisher, its
 * categories worked out from its latest file by `categoriesOf`, and `unlisted` when that file says so (a pack
 * named for one person or one bank stays in the index, so it installs by id, and out of every listing).
 *
 * LISTING IS OPT IN (call 12 of the 22 Oct audit): a pack is listed only when `packs/listed.json` (`LISTED_FILE`
 * in the `--packs` folder) names its catalogue id, the flag only the owner sets. Every other pack, a new one first of
 * all, is `unlisted`: in the index, installable by id, and in no listing. The flag is kept apart from the pack files so
 * that writing or publishing a pack can never list it. An id there that is no pack in the index, or whose latest file
 * says `unlisted: true`, stops the build by name. No file lists nothing. THE SAME FILE SAYS THE REST OF THE STORE'S
 * TIERS (`usecases`, `examples`, `private` and `shelves`, read below): a starter from `packs/` is listed only when
 * `usecases` names it once that key is there, a built-in starter always; an example setup and a shelf are carried onto
 * the entry; a private add-on is unlisted and says `private`. The
 * index is not hashed, only the files are, so an entry published before these fields existed is given them here without
 * a new version, and a new version's `changes` becomes its `notes` through `publishTo`.
 *
 * A PREVIEW BESIDE EACH VERSION FROM `packs/` THAT ADDS A PAGE, made by `previews.mjs` in a scratch record, for a version
 * that has none. `--previews` remakes every one, because a preview is the record's page answer as today's code draws it.
 * A pack whose preview cannot be made is still published, without one, and the run says why.
 *
 * THE INDEX IS WRITTEN AS `readCatalogue` READS IT, and only when that text differs from the file's, so a run with nothing
 * new leaves the committed index byte for byte as it was.
 *
 * `--check` WORKS ALL OF IT OUT AND WRITES NOTHING. It exits 1 naming each file a run would write, or 0 saying every
 * pack is already published, so a build in CI only verifies: a pack edited without a new version, or one whose test
 * was emptied, fails the build step by name instead of showing up afterwards as a changed tracked file.
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
  SHELVES,
  readCatalogue,
  readCatalogueFile,
} from '../../packages/declare/src/catalogue.ts';
import { SHARED_SUFFIX } from '../../packages/declare/src/shared.ts';
import { MODULES } from '../../packages/declare/src/usecase.ts';
import { USE_CASES } from '../../packages/seed/src/usecases/index.ts';
import { builtInFile } from '../../packages/seed/src/usecases/share.ts';
import { makePreview } from './previews.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The owner's list of the packs the store lists, in the packs folder. */
const LISTED_FILE = 'listed.json';
const TEST = /\.test\.(?:ts|mjs|js)$/u;
/* `test(` on its own, not a method of that name: `/x/.test('shelf.pack.json')` holds no test. */
const CALLS_TEST = /(?<![.\w$])test\(/u;

const { values } = parseArgs({
  options: { packs: { type: 'string' }, to: { type: 'string' }, previews: { type: 'boolean' }, check: { type: 'boolean' } },
  strict: true,
});
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
  const tested = readdirSync(dir)
    .filter((f) => TEST.test(f))
    .some((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      return CALLS_TEST.test(text) && text.includes(`${folder}.pack.json`);
    });
  if (!tested) fail(`${where} has no test. A pack ships with one that installs ${folder}.pack.json as it ships (packs/README.md).`);
  const text = readFileSync(file, 'utf8');
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    fail(`${where}/${folder}.pack.json is not JSON.`);
  }
  /* A MODULE'S OWN FILE WAITS FOR THE MODULE TO GO. While the build still compiles the module in, its id is
     one BrainDog keeps for itself and the door refuses a file that takes it, so the file is passed over here and
     neither published nor previewed. The day the id leaves `MODULES` it is published like any other pack. */
  if (MODULES.includes(doc.pack)) continue;
  packs.set(doc.pack, { where, doc });
  const listed = index.entries.find((e) => e.kind === 'pack' && e.id === doc.pack)?.versions.find((v) => v.version === doc.version);
  if (listed && listed.checksum === (await fileChecksum(text))) continue;
  const out = await publishTo(index, text, read, now, undefined, BRAINDOG_PUBLISHER);
  if (!out.ok) fail(`${where}: ${out.refusal.fix} (${out.refusal.code})`);
  index = out.value.index;
  files.set(out.value.path, text);
  said.push(`${where} published as ${out.value.path}`);
}

/* USE CASES, by the same door: each `<id>.usecase.json` beside an add-on, then every one this build ships as the file
   Browse is handed. Their ids are held apart first, so one id never has two sources taking turns at its versions. */
const usecases = [];
const shipped = new Set(USE_CASES.map((u) => u.usecase));
for (const folder of readdirSync(packsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  for (const name of readdirSync(join(packsDir, folder)).filter((f) => f.endsWith(SHARED_SUFFIX)).sort()) {
    const where = `packs/${folder}/${name}`;
    const text = readFileSync(join(packsDir, folder, name), 'utf8');
    let id;
    try {
      id = JSON.parse(text)?.usecase;
    } catch {
      fail(`${where} is not JSON.`);
    }
    if (typeof id !== 'string' || `${id}${SHARED_SUFFIX}` !== name)
      fail(`${where} is named for a use case it does not hold. A use case file is named after the usecase inside it, as in ${typeof id === 'string' ? id : '<id>'}${SHARED_SUFFIX}.`);
    if (shipped.has(id)) fail(`${where} takes the id ${id}, which a use case this build ships already has. Give it its own id.`);
    const twin = usecases.find((u) => u.id === id);
    if (twin) fail(`${where} and ${twin.where} both hold the use case ${id}. A use case is published from one file.`);
    usecases.push({ id, where, text });
  }
}
for (const u of USE_CASES) usecases.push({ id: u.usecase, where: `the built-in ${u.usecase}`, text: `${JSON.stringify(builtInFile(u.usecase), null, 2)}\n` });
for (const { id, where, text } of usecases) {
  const version = JSON.parse(text).version;
  const listed = index.entries.find((e) => e.kind === 'usecase' && e.id === id)?.versions.find((v) => v.version === version);
  if (listed && listed.checksum === (await fileChecksum(text))) continue;
  const out = await publishTo(index, text, read, now, undefined, BRAINDOG_PUBLISHER);
  if (!out.ok) fail(`${where}: ${out.refusal.fix} (${out.refusal.code})`);
  index = out.value.index;
  files.set(out.value.path, text);
  said.push(`${where} published as ${out.value.path}`);
}

/* YANKS, READ THE SAME WAY: a `yanked.json` beside a pack, never a hand edit of the index. Each maps a catalogue id
   that pack publishes to why it is withdrawn, and every one of its versions is stamped, not only the latest, since
   an old version stays installable by id until it too is marked. A reused reason and date (a version already
   yanked) means a second run of this script writes nothing new here. */
for (const folder of readdirSync(packsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const yankFile = join(packsDir, folder, 'yanked.json');
  if (!existsSync(yankFile)) continue;
  const yanks = JSON.parse(readFileSync(yankFile, 'utf8'));
  for (const [id, reason] of Object.entries(yanks)) {
    if (!reason) fail(`packs/${folder}/yanked.json gives ${id} an empty reason.`);
    if (!index.entries.some((e) => e.kind === 'pack' && e.id === id)) fail(`packs/${folder}/yanked.json names ${id}, which is not a pack entry in the index.`);
    /* A REWORDED REASON IS STAMPED AGAIN AND KEEPS ITS DATE: the yank happened when it happened, and only the words moved. */
    index = {
      ...index,
      entries: index.entries.map((e) =>
        e.kind === 'pack' && e.id === id
          ? { ...e, versions: e.versions.map((v) => (v.yanked?.reason === reason ? v : { ...v, yanked: { reason, at: v.yanked?.at ?? now.toISOString() } })) }
          : e,
      ),
    };
  }
}

/* EVERY ENTRY DESCRIBED FROM ITS LATEST FILE, the ones published before these fields existed included. A latest file
   that no longer reads through its door keeps the entry as it was, and the run says so rather than stopping the build
   over a version already published. */
/* THE PACKS HE MARKED LISTED, read before any entry is described, and held to ids the index has. AND THE REST OF HIS
   LISTING, each optional: `usecases`, the starters from `packs/` the store lists (a built-in starter is always listed);
   `examples`, the ones of those shown as example setups; `private`, the add-ons for one bank, country or person, never
   listed or suggested (BrainDog's own still update themselves when nothing would be lost); and `shelves`, the store shelf each listed add-on stands on. */
const listedPath = join(packsDir, LISTED_FILE);
const marked = new Set();
/** `null` while no `usecases` key is there: every starter from `packs/` is then listed, as before the key existed. */
let markedUseCases = null;
const examples = new Set();
const privates = new Set();
const shelfOf = new Map();
const isIds = (list) => Array.isArray(list) && list.every((id) => typeof id === 'string' && id !== '');
const hasEntry = (kind, id) => index.entries.some((e) => e.kind === kind && e.id === id);
if (existsSync(listedPath)) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(listedPath, 'utf8'));
  } catch {
    fail(`packs/${LISTED_FILE} does not read as JSON.`);
  }
  if (!isIds(doc?.packs)) fail(`packs/${LISTED_FILE} says { "packs": [<catalogue id>, ...] }.`);
  for (const id of doc.packs) {
    if (marked.has(id)) fail(`packs/${LISTED_FILE} names ${id} twice.`);
    if (!hasEntry('pack', id)) fail(`packs/${LISTED_FILE} names ${id}, which is not a pack in the index.`);
    marked.add(id);
  }
  if (doc.usecases !== undefined) {
    if (!isIds(doc.usecases)) fail(`packs/${LISTED_FILE} says "usecases": [<starter id>, ...].`);
    markedUseCases = new Set();
    for (const id of doc.usecases) {
      if (markedUseCases.has(id)) fail(`packs/${LISTED_FILE} names the starter ${id} twice.`);
      if (!hasEntry('usecase', id)) fail(`packs/${LISTED_FILE} names the starter ${id}, which is not a starter in the index.`);
      markedUseCases.add(id);
    }
  }
  if (doc.examples !== undefined) {
    if (!isIds(doc.examples)) fail(`packs/${LISTED_FILE} says "examples": [<starter id>, ...].`);
    for (const id of doc.examples) {
      if (markedUseCases !== null && !markedUseCases.has(id)) fail(`packs/${LISTED_FILE} shows ${id} as an example setup, and does not list it under "usecases".`);
      if (!hasEntry('usecase', id)) fail(`packs/${LISTED_FILE} shows ${id} as an example setup, which is not a starter in the index.`);
      examples.add(id);
    }
  }
  if (doc.private !== undefined) {
    if (!isIds(doc.private)) fail(`packs/${LISTED_FILE} says "private": [<catalogue id>, ...].`);
    for (const id of doc.private) {
      if (marked.has(id)) fail(`packs/${LISTED_FILE} names ${id} as listed and as private. Take one of the two out.`);
      if (!hasEntry('pack', id)) fail(`packs/${LISTED_FILE} names ${id} as private, which is not a pack in the index.`);
      privates.add(id);
    }
  }
  if (doc.shelves !== undefined) {
    if (typeof doc.shelves !== 'object' || doc.shelves === null || Array.isArray(doc.shelves)) fail(`packs/${LISTED_FILE} says "shelves": { "<shelf>": [<catalogue id>, ...] }.`);
    for (const [shelf, ids] of Object.entries(doc.shelves)) {
      if (!SHELVES.includes(shelf)) fail(`packs/${LISTED_FILE} names the shelf ${shelf}, and the store's shelves are ${SHELVES.join(', ')}.`);
      if (!isIds(ids)) fail(`packs/${LISTED_FILE} says "shelves": { "${shelf}": [<catalogue id>, ...] }.`);
      for (const id of ids) {
        if (shelfOf.has(id)) fail(`packs/${LISTED_FILE} puts ${id} on two shelves, ${shelfOf.get(id)} and ${shelf}.`);
        if (!hasEntry('pack', id)) fail(`packs/${LISTED_FILE} puts ${id} on the ${shelf} shelf, which is not a pack in the index.`);
        shelfOf.set(id, shelf);
      }
    }
  }
}
/* The starters this build ships, listed whatever `usecases` says, since they are BrainDog's own. */
const builtIn = new Set(USE_CASES.map((u) => u.usecase));

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
  const { categories: _c, publisher: _p, unlisted: _u, signals: _s, modules: _m, icon: _i, shelf: _sh, example: _e, private: _pr, ...rest } = entry;
  const says = entry.kind === 'pack' && JSON.parse(text).unlisted === true;
  if (says && marked.has(entry.id)) fail(`packs/${LISTED_FILE} names ${entry.id}, whose latest file says unlisted: true. Take one of the two out.`);
  const own = entry.kind === 'pack' && privates.has(entry.id);
  const unlisted =
    entry.kind === 'pack' ? says || own || !marked.has(entry.id) : markedUseCases !== null && !builtIn.has(entry.id) && !markedUseCases.has(entry.id);
  const tier = {
    ...(own ? { private: true } : {}),
    ...(entry.kind === 'usecase' && examples.has(entry.id) ? { example: true } : {}),
    ...(entry.kind === 'pack' && shelfOf.has(entry.id) ? { shelf: shelfOf.get(entry.id) } : {}),
  };
  /* A USE CASE PUBLISHED BEFORE ITS ENTRY SAID ITS WORDS is given them here, from the same latest file, as categories were. */
  const u = file.value.kind === 'usecase' ? file.value.shared.usecase : null;
  const heard = { ...(u && u.signals.length > 0 ? { signals: [...u.signals] } : {}), ...(u && u.modules.length > 0 ? { modules: [...u.modules] } : {}) };
  /* THE ICON IS THE ONE THE LATEST FILE NAMES (`icon` in an add-on's manifest or a use case's file), carried so Browse,
     Installed and the page draw it. */
  const iconSaid = file.value.kind === 'pack' ? file.value.file.doc.icon : file.value.shared?.usecase?.icon;
  described.push({ ...rest, ...(typeof iconSaid === 'string' ? { icon: iconSaid } : {}), categories: categoriesOf(file.value, BRAINDOG_PUBLISHER.name), publisher: BRAINDOG_PUBLISHER, ...(unlisted ? { unlisted: true } : {}), ...tier, ...heard });
}
index = { ...index, entries: described };

/* THE SAMPLE ROWS A PACK'S FOLDER DECLARES FOR ITS PREVIEW (`preview-rows.json`, `previews.mjs`), or none. */
const samplesOf = (where) => {
  const file = join(packsDir, where.slice('packs/'.length), 'preview-rows.json');
  if (!existsSync(file)) return [];
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) fail(`${where}/preview-rows.json is a list of { register, fields }.`);
  return rows;
};

/* A PREVIEW FOR EACH VERSION IN `packs/` THAT ADDS A PAGE and has none, or for every one with `--previews`. */
for (const [id, { where, doc }] of packs) {
  if (!(doc.declarations ?? []).some((d) => typeof d?.page === 'string')) continue;
  const path = previewFile(id, doc.version, 'pack');
  const had = held(path);
  if (!had || values.previews) {
    /* A PREVIEW THAT THROWS IS A PREVIEW NOT MADE. The web build runs this tool, so a scratch record that fails in a way
       the record does not answer as a refusal is said here, beside the pack, and the build goes on without it. */
    const made = await makePreview(doc, new Map([...packs].map(([k, v]) => [k, v.doc])), now, samplesOf(where)).catch((e) => ({ ok: false, why: `making it threw: ${e instanceof Error ? e.message : String(e)}` }));
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

/* CI checks rather than writes the catalogue the build publishes, read here so the build script needs no POSIX shell.
   A run told where to write (`--to`) writes there under CI too, as the tests that publish into a scratch folder do. */
if (values.check || (process.env.CI && values.to === undefined)) {
  const onDisk = (path) => {
    const target = join(to, ...path.split('/'));
    return existsSync(target) ? readFileSync(target, 'utf8') : null;
  };
  const would = [...files].filter(([path, text]) => onDisk(path) !== text).map(([path]) => path);
  if (indexText !== indexWas) would.push(CATALOGUE_INDEX);
  if (would.length === 0) {
    console.log(`from-packs --check: every pack in ${packsDir} is already in ${to}.`);
    process.exit(0);
  }
  console.error(`from-packs --check: a run would write ${would.join(', ')} into ${to}${said.length === 0 ? '' : `: ${said.join('; ')}`}.`);
  process.exit(1);
}

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
