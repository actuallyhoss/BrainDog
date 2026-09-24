/**
 * `from-packs`: every pack in `packs/` published into the catalogue the web app ships, so Browse lists it and a host
 * resolves its id (brief B3 of `loop/research-legacy-parity.md`).
 *
 *   node tools/catalogue/from-packs.mjs [--packs <folder>] [--to <catalogue folder>]
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
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { CATALOGUE_INDEX, emptyCatalogue, readCatalogue, fileChecksum, publishTo } from '../../packages/declare/src/catalogue.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = /\.test\.(?:ts|mjs|js)$/u;

const { values } = parseArgs({ options: { packs: { type: 'string' }, to: { type: 'string' } }, strict: true });
const packsDir = resolve(values.packs ?? join(ROOT, 'packs'));
const to = resolve(values.to ?? join(ROOT, 'apps', 'web', 'static', 'catalogue'));

const fail = (line) => {
  console.error(`from-packs: ${line}`);
  process.exit(1);
};

let index = emptyCatalogue('BrainDog');
const indexFile = join(to, CATALOGUE_INDEX);
if (existsSync(indexFile)) {
  const read = readCatalogue(JSON.parse(readFileSync(indexFile, 'utf8')));
  if (!read.ok) fail(`${indexFile} does not read as a catalogue: ${read.refusal.fix}`);
  index = read.value;
}

/* WHAT THIS RUN WOULD WRITE, held back until every pack has passed. */
const files = new Map();
const read = (path) => files.get(path) ?? (existsSync(join(to, ...path.split('/'))) ? readFileSync(join(to, ...path.split('/')), 'utf8') : null);
const said = [];
const now = new Date();

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
  const listed = index.entries.find((e) => e.kind === 'pack' && e.id === doc.pack)?.versions.find((v) => v.version === doc.version);
  if (listed && listed.checksum === (await fileChecksum(text))) continue;
  const out = await publishTo(index, text, read, now);
  if (!out.ok) fail(`${where}: ${out.refusal.fix} (${out.refusal.code})`);
  index = out.value.index;
  files.set(out.value.path, text);
  said.push(`${where} published as ${out.value.path}`);
}

for (const [path, text] of files) {
  const target = join(to, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}
if (files.size > 0) writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
console.log(said.length === 0 ? `from-packs: every pack in ${packsDir} is already in ${to}.` : `from-packs: ${said.join('; ')}.`);
