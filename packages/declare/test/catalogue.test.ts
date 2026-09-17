/**
 * A catalogue of shared use cases: publishing checks each file through `readShared`, keeps versions immutable, computes the
 * bump and refuses one too small, and a fetched file is held to its checksum.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportUseCase, readShared } from '../src/index.ts';
import {
  catalogueFile,
  changesBetween,
  compareVersions,
  emptyCatalogue,
  fileChecksum,
  publishTo,
  readCatalogue,
  reachOf,
  searchCatalogue,
  verifyFile,
  type CatalogueIndex,
} from '../src/catalogue.ts';

const COURSES = { register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'teacher', type: 'text' }] };
const READING = { register: 'reading', name: 'Reading list', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const POLL = {
  ingest: 'poll_grades',
  channel: 'poll',
  url: 'https://grades.example.org/api/latest',
  every: '1d',
  map: [{ name: { path: '$.course' }, teacher: { value: 'polled' } }],
  writes: { register: 'courses' },
};

function file(version: string, declarations: Record<string, unknown>[], extra: Partial<{ modules: string[]; summary: string }> = {}): string {
  const built = exportUseCase({
    usecase: 'study',
    version,
    title: 'Study',
    summary: extra.summary ?? 'Courses and reading.',
    author: 'Halden',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    modules: extra.modules ?? [],
    voice: { home: 'Desk' },
    labels: {},
    declarations,
    examples: [],
  });
  assert.ok(built.ok, JSON.stringify(built));
  return JSON.stringify(built.value, null, 2);
}

/** A catalogue held in memory: the index, and the files by path. */
async function publishAll(texts: string[]): Promise<{ index: CatalogueIndex; files: Map<string, string> }> {
  let index = emptyCatalogue('Test');
  const files = new Map<string, string>();
  for (const text of texts) {
    const out = await publishTo(index, text, (p) => files.get(p) ?? null, new Date('2026-09-17T10:00:00Z'));
    assert.ok(out.ok, JSON.stringify(out));
    index = out.value.index;
    files.set(out.value.path, text);
  }
  return { index, files };
}

test('a first version is listed with its checksum, its reach and no bump', async () => {
  const text = file('1.0.0', [COURSES]);
  const { index, files } = await publishAll([text]);
  assert.equal(index.entries.length, 1);
  const e = index.entries[0]!;
  assert.equal(e.latest, '1.0.0');
  assert.equal(e.versions[0]!.bump, null);
  assert.deepEqual(e.versions[0]!.reach.lists, ['Courses']);
  assert.equal(e.versions[0]!.checksum, await fileChecksum(text));
  assert.ok(files.has(catalogueFile('study', '1.0.0')));
  /* The index survives a round trip through JSON and its own reader. */
  const back = readCatalogue(JSON.parse(JSON.stringify(index)));
  assert.ok(back.ok);
  assert.equal(back.value.entries[0]!.latest, '1.0.0');
});

test('a published version never changes, and an earlier one is refused', async () => {
  const { index, files } = await publishAll([file('1.0.0', [COURSES]), file('1.1.0', [COURSES, READING])]);
  const again = await publishTo(index, file('1.1.0', [COURSES, READING], { summary: 'Other words.' }), (p) => files.get(p) ?? null);
  assert.equal(!again.ok && 'refusal' in again && again.refusal.code, 'ALREADY_KNOWN');
  const same = await publishTo(index, files.get(catalogueFile('study', '1.1.0'))!, (p) => files.get(p) ?? null);
  assert.ok(!same.ok && 'refusal' in same && /same file/u.test(same.refusal.fix));
  const older = await publishTo(index, file('1.0.5', [COURSES]), (p) => files.get(p) ?? null);
  assert.equal(!older.ok && 'refusal' in older && older.refusal.code, 'ALREADY_KNOWN');
});

test('the bump is computed, and a version that takes a list away cannot be a minor', async () => {
  const { index, files } = await publishAll([file('1.0.0', [COURSES, READING])]);
  const minor = await publishTo(index, file('1.1.0', [COURSES]), (p) => files.get(p) ?? null);
  assert.ok(!minor.ok && 'refusal' in minor);
  assert.equal(minor.refusal.code, 'PACK_MALFORMED');
  assert.match(minor.refusal.fix, /Publish it as 2\.0\.0/u);
  const major = await publishTo(index, file('2.0.0', [COURSES]), (p) => files.get(p) ?? null);
  assert.ok(major.ok);
  assert.equal(major.value.version.bump, 'major');
  assert.deepEqual(major.value.changes.removed.map((r) => r.title), ['Reading list']);

  /* A field taken out of a list is major too; one added is only a change. */
  const narrowed = { ...COURSES, fields: [COURSES.fields[0]] };
  const shared = async (t: string) => {
    const r = await readShared(t);
    assert.ok(r.ok);
    return r.value;
  };
  const a = await shared(file('1.0.0', [COURSES]));
  assert.equal(changesBetween(a, await shared(file('1.0.1', [narrowed]))).bump, 'major');
  const wider = { ...COURSES, fields: [...COURSES.fields, { id: 'room', type: 'text' }] };
  const c = changesBetween(a, await shared(file('1.0.1', [wider])));
  assert.equal(c.bump, 'patch');
  assert.deepEqual(c.changed.map((x) => x.id), ['register.courses']);
});

test('a new host it calls out to is at least a minor, and reach names it with the line the plan says', async () => {
  const a = await readShared(file('1.0.0', [COURSES]));
  const b = await readShared(file('1.0.1', [COURSES, POLL]));
  assert.ok(a.ok && b.ok, JSON.stringify(b));
  const reach = reachOf(b.value);
  assert.equal(reach.calls_out.length, 1);
  assert.equal(reach.calls_out[0]!.host, 'grades.example.org');
  assert.match(reach.calls_out[0]!.line, /CALLS OUT grades\.example\.org/u);
  const c = changesBetween(a.value, b.value);
  assert.deepEqual(c.hosts.added, ['grades.example.org']);
  assert.equal(c.bump, 'minor');
});

test('a fetched file is held to its checksum, whatever its spacing', async () => {
  const text = file('1.0.0', [COURSES]);
  const sum = await fileChecksum(text);
  assert.ok((await verifyFile({ version: '1.0.0', checksum: sum }, JSON.stringify(JSON.parse(text)))).ok);
  const changed = text.replace('Courses and reading.', 'Courses and reading!');
  const out = await verifyFile({ version: '1.0.0', checksum: sum }, changed);
  assert.equal(!out.ok && 'refusal' in out && out.refusal.code, 'CHECKSUM_MISMATCH');
});

test('an index with an unsafe id or no checksum is refused, and search ranks the title over the summary', async () => {
  assert.ok(!readCatalogue({ format: 1, entries: [{ kind: 'usecase', id: '../etc', versions: [{ version: '1.0.0', checksum: 'a'.repeat(64), reach: {} }] }] }).ok);
  assert.ok(!readCatalogue({ format: 1, entries: [{ kind: 'usecase', id: 'ok', versions: [{ version: '1.0.0/../x', checksum: 'a'.repeat(64), reach: {} }] }] }).ok);
  assert.ok(!readCatalogue({ format: 2, entries: [] }).ok);
  const { index } = await publishAll([file('1.0.0', [COURSES])]);
  assert.deepEqual(searchCatalogue(index, 'study').map((e) => e.id), ['study']);
  assert.deepEqual(searchCatalogue(index, 'courses').map((e) => e.id), ['study']);
  assert.deepEqual(searchCatalogue(index, 'invoices'), []);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
});

/* ── add-ons, signatures and updates ────────────────────────────────────── */

const BOOKS = { register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.books'], blocks: [{ kind: 'table', source: 'register.books', span: 12 }] };

function addon(version: string, declarations: Record<string, unknown>[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary: 'Books you own.', author: 'Halden', license: 'MIT', declarations, ...extra }, null, 2);
}

test('an add-on publishes beside a use case under its own path, with its bump computed the same way', async () => {
  const { readPackFile, catalogueUpdates, installedIdOf } = await import('../src/catalogue.ts');
  const read = await readPackFile(addon('1.0.0', [BOOKS, SHELF]));
  assert.ok(read.ok, JSON.stringify(read));
  const { index, files } = await publishAll([file('1.0.0', [COURSES]), addon('1.0.0', [BOOKS, SHELF])]);
  assert.deepEqual(index.entries.map((e) => `${e.kind}:${e.id}`), ['pack:bookshelf', 'usecase:study']);
  const pack = index.entries.find((e) => e.kind === 'pack')!;
  assert.equal(pack.title, 'Bookshelf');
  assert.equal(pack.audience, 'addon');
  assert.deepEqual(pack.versions[0]!.reach.pages, ['Shelf']);
  assert.ok(files.has(catalogueFile('bookshelf', '1.0.0', 'pack')));
  assert.equal(installedIdOf(pack), 'bookshelf');
  assert.ok(readCatalogue(JSON.parse(JSON.stringify(index))).ok);
  assert.deepEqual(searchCatalogue(index, '', 'pack').map((e) => e.id), ['bookshelf']);

  const minor = await publishTo(index, addon('1.0.1', [BOOKS, SHELF, POLL_BOOKS]), (p) => files.get(p) ?? null);
  assert.ok(!minor.ok && 'refusal' in minor && /Publish it as 1\.1\.0/u.test(minor.refusal.fix));
  const next = await publishTo(index, addon('1.1.0', [BOOKS, SHELF, POLL_BOOKS]), (p) => files.get(p) ?? null);
  assert.ok(next.ok, JSON.stringify(next));
  assert.deepEqual(next.value.changes.hosts.added, ['books.example.org']);
  files.set(next.value.path, addon('1.1.0', [BOOKS, SHELF, POLL_BOOKS]));

  /* An update is offered for what a record holds at an earlier version, with what it newly reaches. */
  const { updates } = await catalogueUpdates(next.value.index, [{ id: 'bookshelf', version: '1.0.0', disabled_at: null }, { id: 'usecase-study', version: '1.0.0' }], (p) => files.get(p) ?? null);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.to.version, '1.1.0');
  assert.deepEqual(updates[0]!.changes?.hosts.added, ['books.example.org']);
});

const POLL_BOOKS = { ingest: 'poll_books', channel: 'poll', url: 'https://books.example.org/new', every: '1d', map: [{ name: { path: '$.title' } }], writes: { register: 'books' } };

test('an add-on file is refused at the same door a use case is: a credential, a module id, a module list, a use case, the size', async () => {
  const { readPackFile } = await import('../src/catalogue.ts');
  const code = async (text: unknown) => {
    const r = await readPackFile(text);
    return !r.ok && 'refusal' in r ? r.refusal.code : 'ok';
  };
  assert.equal(await code(addon('1.0.0', [BOOKS], { note: 'sk_live_' + 'a'.repeat(30) })), 'SECRET_IN_PACK');
  assert.equal(await code(JSON.stringify({ ...JSON.parse(addon('1.0.0', [BOOKS])), pack: 'work' })), 'PROVIDES_CONFLICT');
  assert.equal(await code(addon('1.0.0', [{ register: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text' }] }])), 'PROVIDES_CONFLICT');
  assert.equal(await code(file('1.0.0', [COURSES])), 'PACK_MALFORMED');
  assert.equal(await code(addon('1.0.0', [BOOKS], { note: 'x'.repeat(300 * 1024) })), 'PACK_OVER_CAP');
  assert.equal(await code(addon('1.0.0', [{ page: 'bad', title: 'Bad', blocks: [{ kind: 'iframe', span: 12 }] }])), 'KIND_UNKNOWN');
});

test('a signed version verifies on fetch, a tampered index does not, and later versions keep the first key', async () => {
  const { newAuthorKey, readAuthorKey, verifyVersion, trustOf, rememberKey } = await import('../src/catalogue.ts');
  const key = await newAuthorKey('Halden');
  assert.ok((await readAuthorKey(JSON.parse(JSON.stringify(key)))).ok);
  const text = addon('1.0.0', [BOOKS, SHELF]);
  const out = await publishTo(emptyCatalogue('Signed'), text, () => null, new Date(), key);
  assert.ok(out.ok, JSON.stringify(out));
  const v = out.value.version;
  assert.equal(v.signature?.key_id, key.key_id);
  const good = await verifyVersion(out.value.entry, v, text);
  assert.ok(good.ok && good.value?.key_id === key.key_id);

  /* The same file listed under another version, or another id, no longer verifies. */
  const moved = await verifyVersion({ kind: 'pack', id: 'other' }, v, text);
  assert.equal(!moved.ok && 'refusal' in moved && moved.refusal.code, 'SIGNATURE_INVALID');
  const other = await newAuthorKey('Mallory');
  const swapped = await verifyVersion(out.value.entry, { ...v, signature: { ...v.signature!, public_key: other.public_key, key_id: other.key_id } }, text);
  assert.equal(!swapped.ok && 'refusal' in swapped && swapped.refusal.code, 'SIGNATURE_INVALID');

  const files = new Map([[out.value.path, text]]);
  const unsigned = await publishTo(out.value.index, addon('1.0.1', [BOOKS, SHELF], { summary: 'Books you own, and read.' }), (p) => files.get(p) ?? null);
  assert.equal(!unsigned.ok && 'refusal' in unsigned && unsigned.refusal.code, 'SIGNATURE_INVALID');
  const wrongKey = await publishTo(out.value.index, addon('1.0.1', [BOOKS, SHELF], { summary: 'Books you own, and read.' }), (p) => files.get(p) ?? null, new Date(), other);
  assert.ok(!wrongKey.ok && 'refusal' in wrongKey && wrongKey.refusal.fix.includes(key.key_id));

  /* Trust on first use: first, then known, then a different key said as changed. */
  assert.equal(trustOf({}, 'Halden', null).kind, 'unsigned');
  assert.equal(trustOf({}, 'Halden', v.signature).kind, 'first');
  const known = rememberKey({}, 'Halden', key.key_id);
  assert.equal(trustOf(known, 'Halden', v.signature).kind, 'known');
  assert.equal(trustOf(known, 'Halden', { ...v.signature!, key_id: other.key_id }).kind, 'changed');
});
