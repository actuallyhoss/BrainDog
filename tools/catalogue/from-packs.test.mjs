/**
 * `from-packs` publishes use case files beside add-ons: a `<id>.usecase.json` under a folder in `packs/`, and
 * every use case this build ships, each an entry of kind `usecase` carrying the `signals` and `modules` its file says.
 * A second run writes nothing, a refused file stops the build before anything is written, and the three fronts in
 * `packs/` read through the use case door as they ship.
 *
 * EVERY RUN HERE IS `--packs` AND `--to` A SCRATCH FOLDER. The catalogue the web app ships is the integrator's to rebuild.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listedEntries, readCatalogue } from '../../packages/declare/src/catalogue.ts';
import { readShared } from '../../packages/declare/src/shared.ts';
import { normaliseUseCase } from '../../packages/declare/src/usecase.ts';
import { USE_CASES } from '../../packages/seed/src/usecases/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'tools', 'catalogue', 'from-packs.mjs');

const scratch = () => mkdtempSync(join(tmpdir(), 'from-packs-'));
/* A RUN THAT WRITES, whatever the runner sets: the tool checks rather than writes where `CI` is set, and a runner sets it. */
const { CI: _ci, ...env } = process.env;
const run = (packs, to) => spawnSync(process.execPath, [SCRIPT, '--packs', packs, '--to', to], { encoding: 'utf8', env });
const indexOf = (to) => {
  const read = readCatalogue(JSON.parse(readFileSync(join(to, 'index.json'), 'utf8')));
  assert.ok(read.ok, 'the index written reads back');
  return read.value;
};
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};

/* AN INVENTED ADD-ON WITH NO PAGE, so no preview record is made, and a test that names its file. */
const SHELF = {
  pack: 'shelf',
  version: '1.0.0',
  title: 'Shelf',
  summary: 'The things on a shelf.',
  author: 'Nobody in particular',
  license: 'MIT',
  requires: { format: 1, primitives: 1 },
  declarations: [{ register: 'shelf_items', name: 'Shelf', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
};
/* AN INVENTED USE CASE, heard in its own words, standing on one first-party module and carrying no pack. */
const RENT_BOOK = {
  usecase: 'rent-book',
  version: '1.0.0',
  title: 'Rent book',
  summary: 'The rent each lodger owes and what they paid.',
  author: 'Nobody in particular',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain',
  signals: ['rent book', 'lodgers', 'lodger'],
  modules: ['people'],
};

function packsFolder(rentBook = RENT_BOOK) {
  const packs = scratch();
  write(join(packs, 'shelf', 'shelf.pack.json'), SHELF);
  write(join(packs, 'shelf', 'shelf.test.ts'), "test('installs', () => read('shelf.pack.json'));\n");
  write(join(packs, 'rent-book', 'rent-book.usecase.json'), rentBook);
  return packs;
}

const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))
    .sort();

test('a use case file beside the add-ons is published as a usecase entry with its signals and modules, and so is every built-in', () => {
  const to = scratch();
  const out = run(packsFolder(), to);
  assert.equal(out.status, 0, out.stderr);
  const index = indexOf(to);
  const rent = index.entries.find((e) => e.kind === 'usecase' && e.id === 'rent-book');
  assert.ok(rent, 'rent-book is listed');
  assert.deepEqual(rent.signals, ['rent book', 'lodgers', 'lodger']);
  assert.deepEqual(rent.modules, ['people']);
  assert.equal(rent.title, 'Rent book');
  assert.ok(existsSync(join(to, 'usecases', 'rent-book', '1.0.0.usecase.json')));
  assert.ok(index.entries.some((e) => e.kind === 'pack' && e.id === 'shelf'), 'the add-on is still published');
  for (const u of USE_CASES) {
    const entry = index.entries.find((e) => e.kind === 'usecase' && e.id === u.usecase);
    assert.ok(entry, `${u.usecase} is listed`);
    assert.equal(entry.latest, u.version);
    assert.deepEqual(entry.signals, u.signals);
    if (u.modules.length > 0) assert.deepEqual(entry.modules, u.modules);
    else assert.equal(entry.modules, undefined);
  }
});

test('a second run writes nothing', () => {
  const packs = packsFolder();
  const to = scratch();
  assert.equal(run(packs, to).status, 0);
  const before = new Map(filesUnder(to).map((f) => [f, { text: readFileSync(f, 'utf8'), at: statSync(f).mtimeMs }]));
  const again = run(packs, to);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already in/u);
  const after = filesUnder(to);
  assert.deepEqual(after, [...before.keys()]);
  for (const f of after) {
    assert.equal(readFileSync(f, 'utf8'), before.get(f).text, `${f} is unchanged`);
    assert.equal(statSync(f).mtimeMs, before.get(f).at, `${f} was not written again`);
  }
});

test('a use case file the door refuses stops the build with its sentence, and nothing is written', () => {
  const to = scratch();
  const out = run(packsFolder({ ...RENT_BOOK, signals: ['Rent Book'] }), to);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /packs\/rent-book\/rent-book\.usecase\.json: Signals are up to 64 lower-case words/u);
  assert.deepEqual(readdirSync(to), []);
});

test('a published use case version never changes: the same version with other words is refused', () => {
  const to = scratch();
  assert.equal(run(packsFolder(), to).status, 0);
  const out = run(packsFolder({ ...RENT_BOOK, signals: ['rent book', 'lodgers'] }), to);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /a published version never changes/u);
});

test('a use case file named for another id, or taking a built-in id, is refused', () => {
  const misnamed = packsFolder();
  write(join(misnamed, 'rent-book', 'rent-book.usecase.json'), { ...RENT_BOOK, usecase: 'lodgings' });
  assert.match(run(misnamed, scratch()).stderr, /is named for a use case it does not hold/u);
  const taken = packsFolder();
  const built = USE_CASES[0].usecase;
  write(join(taken, 'rent-book', `${built}.usecase.json`), { ...RENT_BOOK, usecase: built });
  assert.match(run(taken, scratch()).stderr, /which a use case this build ships already has/u);
});

/* THE THREE FRONTS AS THEY SHIP: each over its add-on, read through the use case door. */
const FRONTS = [
  { folder: 'landlord', id: 'landlord', words: ['flats', 'tenants', 'rent', 'repairs'] },
  { folder: 'photographer', id: 'photographer', words: ['shoots', 'clients', 'galleries', 'bookings'] },
  { folder: 'retainer-hours', id: 'retainer-hours', words: ['retainer', 'hours', 'clients', 'invoices'] },
];

for (const { folder, id, words } of FRONTS) {
  test(`the ${id} front reads as a use case over its add-on`, async () => {
    const text = readFileSync(join(ROOT, 'packs', folder, `${id}.usecase.json`), 'utf8');
    const u = normaliseUseCase(JSON.parse(text));
    assert.ok(u.ok, u.ok ? '' : u.refusal.fix);
    const pack = JSON.parse(readFileSync(join(ROOT, 'packs', folder, `${folder}.pack.json`), 'utf8'));
    assert.equal(u.value.usecase, id);
    assert.equal(u.value.version, '1.1.0');
    assert.equal(u.value.title, pack.title);
    assert.ok(u.value.summary.length > 0 && !/[\r\n]/u.test(u.value.summary), 'one line of summary');
    assert.equal(u.value.modules.at(-1), pack.pack, 'it stands on its add-on last');
    for (const needed of Object.keys(pack.requires.packs ?? {})) assert.ok(u.value.modules.includes(needed), `and on ${needed}, which the add-on asks for`);
    assert.deepEqual(u.value.needs, [pack.pack]);
    for (const w of words) assert.ok(u.value.signals.includes(w), `heard in ${w}`);
    assert.equal(Object.keys(u.value.voice).length, 3, 'three lines of voice');
    assert.ok(!/—/u.test(text), 'no em dash in its words');
    const shared = await readShared(text, { kind: 'local' });
    assert.ok(shared.ok, shared.ok ? '' : shared.refusal.fix);
  });
}

test('the three fronts publish as usecase entries with their signals', () => {
  const packs = scratch();
  for (const { folder, id } of FRONTS) {
    mkdirSync(join(packs, folder), { recursive: true });
    copyFileSync(join(ROOT, 'packs', folder, `${id}.usecase.json`), join(packs, folder, `${id}.usecase.json`));
  }
  const to = scratch();
  const out = run(packs, to);
  assert.equal(out.status, 0, out.stderr);
  const index = indexOf(to);
  for (const { id, words } of FRONTS) {
    const entry = index.entries.find((e) => e.kind === 'usecase' && e.id === id);
    assert.ok(entry, `${id} is listed`);
    for (const w of words) assert.ok(entry.signals.includes(w));
    assert.ok(entry.modules.includes(id));
  }
});

test('LISTING IS OPT IN: a new pack is in the index and in no listing until packs/listed.json names it', () => {
  const packs = packsFolder();
  const to = scratch();
  const first = run(packs, to);
  assert.equal(first.status, 0, first.stderr);
  const shelf = () => indexOf(to).entries.find((e) => e.kind === 'pack' && e.id === 'shelf');
  assert.equal(shelf()?.unlisted, true, 'a pack nobody marked is unlisted');
  assert.ok(!listedEntries(indexOf(to)).some((e) => e.id === 'shelf'), 'and out of every listing');
  assert.ok(listedEntries(indexOf(to)).some((e) => e.kind === 'usecase' && e.id === 'rent-book'), 'a use case is not read against the list');
  write(join(packs, 'listed.json'), { packs: ['shelf'] });
  const marked = run(packs, to);
  assert.equal(marked.status, 0, marked.stderr);
  assert.equal(shelf()?.unlisted, undefined, 'marked, it is listed');
  assert.ok(listedEntries(indexOf(to)).some((e) => e.id === 'shelf'));
  write(join(packs, 'listed.json'), { packs: ['shelf', 'nowhere'] });
  const unknown = run(packs, to);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /names nowhere, which is not a pack in the index/u);
});

test('THE STORE LISTS WHAT packs/listed.json NAMES, and nothing else', () => {
  const index = readCatalogue(JSON.parse(readFileSync(join(ROOT, 'apps', 'web', 'static', 'catalogue', 'index.json'), 'utf8')));
  assert.ok(index.ok);
  const named = new Set(JSON.parse(readFileSync(join(ROOT, 'packs', 'listed.json'), 'utf8')).packs);
  for (const e of listedEntries(index.value).filter((x) => x.kind === 'pack')) assert.ok(named.has(e.id), `${e.id} is listed and packs/listed.json does not name it`);
});

test('THE STORE\'S TIERS: a starter from packs/ is listed once named, an example is marked, a private add-on is never listed, and each shelf is carried', () => {
  const packs = packsFolder();
  const to = scratch();
  write(join(packs, 'listed.json'), { packs: [], usecases: [], private: ['shelf'], shelves: { 'money': ['shelf'] } });
  const hidden = run(packs, to);
  assert.equal(hidden.status, 0, hidden.stderr);
  const entry = (kind, id) => indexOf(to).entries.find((e) => e.kind === kind && e.id === id);
  assert.equal(entry('usecase', 'rent-book')?.unlisted, true, 'a starter from packs/ that usecases does not name is unlisted');
  assert.ok(listedEntries(indexOf(to)).some((e) => e.kind === 'usecase' && e.id === 'founder'), 'a built-in starter is listed whatever usecases says');
  assert.equal(entry('pack', 'shelf')?.private, true);
  assert.equal(entry('pack', 'shelf')?.unlisted, true, 'a private add-on is unlisted too');
  assert.equal(entry('pack', 'shelf')?.shelf, 'money');
  assert.ok(!listedEntries(indexOf(to)).some((e) => e.id === 'shelf'));

  write(join(packs, 'listed.json'), { packs: ['shelf'], usecases: ['rent-book'], examples: ['rent-book'], shelves: { 'reading': ['shelf'] } });
  const shown = run(packs, to);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(entry('usecase', 'rent-book')?.unlisted, undefined);
  assert.equal(entry('usecase', 'rent-book')?.example, true);
  assert.equal(entry('pack', 'shelf')?.private, undefined, 'a tier is worked out again on every run');
  assert.equal(entry('pack', 'shelf')?.shelf, 'reading');

  for (const [listed, said] of [
    [{ packs: ['shelf'], private: ['shelf'] }, /names shelf as listed and as private/u],
    [{ packs: [], usecases: [], examples: ['rent-book'] }, /shows rent-book as an example setup, and does not list it/u],
    [{ packs: [], shelves: { garden: ['shelf'] } }, /names the shelf garden/u],
    [{ packs: [], shelves: { 'money': ['shelf'], 'looks': ['shelf'] } }, /puts shelf on two shelves/u],
  ]) {
    write(join(packs, 'listed.json'), listed);
    const out = run(packs, to);
    assert.equal(out.status, 1, JSON.stringify(listed));
    assert.match(out.stderr, said);
  }
});

test('BRAINDOG\'S OWN LISTING: private and example tiers as the owner set them, and no listed add-on off a shelf', () => {
  const index = readCatalogue(JSON.parse(readFileSync(join(ROOT, 'apps', 'web', 'static', 'catalogue', 'index.json'), 'utf8')));
  assert.ok(index.ok);
  const listed = listedEntries(index.value);
  assert.ok(!listed.some((e) => e.private === true), 'a private add-on is listed');
  for (const e of listed.filter((x) => x.kind === 'pack')) assert.ok(e.shelf !== undefined, `${e.id} is listed on no shelf`);
  assert.deepEqual(listed.filter((e) => e.example === true).map((e) => e.id).sort(), ['landlord', 'photographer', 'retainer-hours']);
  for (const id of ['studies', 'team-board', 'new-project']) assert.ok(!listed.some((e) => e.kind === 'usecase' && e.id === id), `${id} is a starter listed twice`);
  for (const id of ['flow-check', 'rule-sheet', 'live-feed', 'mercury-company', 'feed-example', 'hello']) assert.ok(!listed.some((e) => e.id === id), `${id} is listed`);
});
