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
