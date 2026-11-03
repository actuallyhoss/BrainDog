/**
 * The Kennel's four vital signs (`kennelVitals` in `src/kennel.ts`) over a map standing in for R2 and a
 * function standing in for the static assets: a well night says four marked lines, and each sign goes red on its own
 * planted case while the other three stay well. Then the nightly walk carries them into the note (`summaryOf`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileChecksum, type CatalogueEntry, type CatalogueIndex, type Publisher } from '@braindog/declare/catalogue';
import { KENNEL_FORMAT } from '@braindog/declare/kennel';

import { kennelVitals, type KennelBucket, type KennelSign } from '../src/kennel.ts';
import { nightlyWalk, NOTE_MOST, notesOf, summaryOf, type Walked } from '../src/nightly.ts';

const NOW = new Date('2026-10-09T03:00:00Z');
const HOUR = 3_600_000;
const REACH = { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] };
const BRAINDOG: Publisher = { kind: 'braindog', id: 'braindog', name: 'BrainDog' };
const HALDEN: Publisher = { kind: 'key', id: 'abcdef0123456789', name: 'Halden Books' };

const fileText = (id: string, title: string): string => JSON.stringify({ pack: id, version: '1.0.0', title, summary: `${title}, the add-on.`, author: 'Halden', license: 'MIT', declarations: [] });

async function entryOf(id: string, title: string, publisher: Publisher, extra: Partial<CatalogueEntry> = {}): Promise<CatalogueEntry> {
  const checksum = await fileChecksum(fileText(id, title));
  return {
    kind: 'pack',
    id,
    title,
    summary: `${title}, the add-on.`,
    author: publisher.name,
    license: 'MIT',
    audience: 'addon',
    latest: '1.0.0',
    publisher,
    versions: [{ version: '1.0.0', checksum, bytes: 10, published_at: NOW.toISOString(), bump: null, reach: REACH }],
    ...extra,
  };
}

/** R2 as a map: the Kennel's files under `kennel/`. */
function bucketOf(files: Map<string, string>): KennelBucket {
  return {
    async get(key) {
      const text = files.get(key);
      return text === undefined ? null : { etag: 'etag', text: async () => text };
    },
    async put(key, value) {
      files.set(key, value);
      return {};
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

/**
 * A well Kennel: Pad bundled from `packs/`, Bookshelf listed by Halden in R2, each file matching its index, counts written
 * two hours ago, and nothing waiting. `plant` changes it before the signs are read.
 */
async function night(plant: (k: { files: Map<string, string>; kennel: CatalogueIndex; bundledFiles: Map<string, string> }) => Promise<void> | void = () => {}) {
  const bundled: CatalogueIndex = { format: 1, name: 'BrainDog', entries: [await entryOf('pad', 'Pad', BRAINDOG)] };
  const bundledFiles = new Map([['packs/pad/1.0.0.pack.json', fileText('pad', 'Pad')]]);
  const kennel: CatalogueIndex = { format: 1, name: 'BrainDog Kennel', entries: [await entryOf('bookshelf', 'Bookshelf', HALDEN)] };
  const files = new Map<string, string>([
    ['kennel/packs/bookshelf/1.0.0.pack.json', fileText('bookshelf', 'Bookshelf')],
    ['kennel/counts.json', JSON.stringify({ at: new Date(NOW.getTime() - 2 * HOUR).toISOString(), counts: { 'pack:pad': 10, 'pack:bookshelf': 50 } })],
    ['kennel/review.json', JSON.stringify({ format: KENNEL_FORMAT, pending: [], refused: [], recent: [] })],
  ]);
  await plant({ files, kennel, bundledFiles });
  files.set('kennel/index.json', JSON.stringify(kennel));
  const assets = {
    fetch: async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname.replace(/^\/catalogue\//u, '');
      const text = path === 'index.json' ? JSON.stringify(bundled) : bundledFiles.get(path);
      return text === undefined
        ? new Response('<!doctype html><title>BrainDog</title>', { headers: { 'content-type': 'text/html' } })
        : new Response(text, { headers: { 'content-type': 'application/json' } });
    },
  };
  const signs = await kennelVitals({ blobs: bucketOf(files), assets }, NOW);
  return { signs, by: (sign: KennelSign['sign']): KennelSign => signs.find((s) => s.sign === sign) ?? assert.fail(`no ${sign} sign`) };
}

/** The other three signs are still well, so a planted case is red on its own line and on no other. */
const onlyRed = (signs: readonly KennelSign[], sign: KennelSign['sign']): void =>
  assert.deepEqual(
    signs.filter((s) => !s.ok).map((s) => s.sign),
    [sign],
    signs.map((s) => s.line).join('\n'),
  );

test('a well night says the four signs in order, each marked, with no ids and no em dashes', async () => {
  const { signs } = await night();
  assert.deepEqual(
    signs.map((s) => s.sign),
    ['index', 'counts', 'review', 'outside'],
  );
  assert.ok(signs.every((s) => s.ok), signs.map((s) => s.line).join('\n'));
  assert.deepEqual(
    signs.map((s) => s.line),
    [
      '✓ Kennel index: all 2 published files match it.',
      '✓ Kennel counts: written 2 hours ago, all 2 rounded.',
      '✓ Kennel review: nothing waiting.',
      '✓ Kennel publishers: 1 listed plugin is by publishers other than BrainDog.',
    ],
  );
  for (const s of signs) assert.doesNotMatch(s.line, /—|abcdef0123456789|\brow\b/u);
});

test('the index sign is red when a published file is changed under its version, and names it', async () => {
  const { signs, by } = await night(({ files }) => {
    files.set('kennel/packs/bookshelf/1.0.0.pack.json', fileText('bookshelf', 'Bookshelf, changed'));
  });
  onlyRed(signs, 'index');
  assert.equal(by('index').line, '✗ Kennel index: 1 of 2 files differ from it or are missing (Bookshelf 1.0.0). Needs a look.');
});

test('the index sign is red when a bundled file from packs/ is gone', async () => {
  const { signs, by } = await night(({ bundledFiles }) => {
    bundledFiles.clear();
  });
  onlyRed(signs, 'index');
  assert.match(by('index').line, /^✗ .*\(Pad 1\.0\.0\)/u);
});

test('the counts sign is red when the file is older than 36 hours, when a number is not a step, and when it was never written', async () => {
  const stale = await night(({ files }) => {
    files.set('kennel/counts.json', JSON.stringify({ at: new Date(NOW.getTime() - 40 * HOUR).toISOString(), counts: { 'pack:pad': 10 } }));
  });
  onlyRed(stale.signs, 'counts');
  assert.equal(stale.by('counts').line, '✗ Kennel counts: written 40 hours ago, past 36 hours. Needs a look.');

  const raw = await night(({ files }) => {
    files.set('kennel/counts.json', JSON.stringify({ at: NOW.toISOString(), counts: { 'pack:pad': 10, 'pack:bookshelf': 7 } }));
  });
  onlyRed(raw.signs, 'counts');
  assert.match(raw.by('counts').line, /1 of 2 numbers are not rounded/u);

  const never = await night(({ files }) => {
    files.delete('kennel/counts.json');
  });
  onlyRed(never.signs, 'counts');
  assert.equal(never.by('counts').line, '✗ Kennel counts: never written. Needs a look.');
});

test('the review sign says how many wait and the oldest, and is red past a week', async () => {
  const pending = async (days: number) => {
    const entry = await entryOf('garden', 'Garden', HALDEN);
    const { latest: _l, versions, ...rest } = entry;
    return { entry: rest, version: versions[0], submitted_at: new Date(NOW.getTime() - days * 24 * HOUR).toISOString() };
  };
  const fresh = await night(async ({ files }) => {
    files.set('kennel/review.json', JSON.stringify({ format: KENNEL_FORMAT, pending: [await pending(2)], refused: [], recent: [] }));
  });
  assert.ok(fresh.signs.every((s) => s.ok));
  assert.equal(fresh.by('review').line, '✓ Kennel review: 1 waiting, the oldest 2 days.');

  const late = await night(async ({ files }) => {
    files.set('kennel/review.json', JSON.stringify({ format: KENNEL_FORMAT, pending: [await pending(8), await pending(1)], refused: [], recent: [] }));
  });
  onlyRed(late.signs, 'review');
  assert.equal(late.by('review').line, '✗ Kennel review: 2 waiting, the oldest 8 days. Needs a look.');
});

test('the publishers sign is red when only BrainDog is listed, and an unlisted probe or a yanked add-on does not count', async () => {
  const { signs, by } = await night(async ({ kennel, files }) => {
    const probe = await entryOf('probe-2026-10-09', 'Probe shelf', HALDEN, { unlisted: true });
    const gone = await entryOf('bookshelf', 'Bookshelf', HALDEN);
    gone.versions = gone.versions.map((v) => ({ ...v, yanked: { reason: 'Withdrawn by its author.', at: NOW.toISOString() } }));
    kennel.entries = [gone, probe];
    files.set('kennel/packs/probe-2026-10-09/1.0.0.pack.json', fileText('probe-2026-10-09', 'Probe shelf'));
  });
  onlyRed(signs, 'outside');
  assert.equal(by('outside').line, '✗ Kennel publishers: no listed plugin is by anyone but BrainDog yet.');
});

test("the nightly walk reads the signs, puts them under the night's line, and a red one other than publishers makes the night a problem", async () => {
  const walked: Walked = { records: 3, backups: 3, failed: 0, stragglers: 0, eraseOpen: 0, expired: 0, expiryFailed: 0, ms: 0 };
  assert.equal(summaryOf(walked, NOW.getTime()), 'walk 2026-10-09 · 3 records · 0 stragglers · 0 failed · 0 open', 'the line changed for a walk with no Kennel');

  const red = (await night(({ files }) => void files.delete('kennel/counts.json'))).signs;
  const notes: string[] = [];
  const levels: string[] = [];
  const out = await nightlyWalk({
    records: async () => ({ ids: [] }),
    snapshot: async () => ({ key: 'k', bytes: 0, rows: 0 }),
    kennel: async () => red,
    note: async (text) => void notes.push(text),
    speak: (fields, level) => void (fields.op === 'walk.done' && levels.push(level)),
    now: () => NOW.getTime(),
  });
  assert.deepEqual(out.kennel, red);
  assert.deepEqual(notes.join('\n').split('\n').slice(1), red.map((s) => s.line));
  assert.ok(notes.every((n) => n.length <= NOTE_MOST), 'a note is longer than the ops record keeps, so a sign would be cut off');
  assert.ok(notes[0]?.startsWith('walk 2026-10-09 · 0 records'));
  assert.deepEqual(levels, ['error']);

  const quiet: string[] = [];
  await nightlyWalk({
    records: async () => ({ ids: [] }),
    snapshot: async () => ({ key: 'k', bytes: 0, rows: 0 }),
    kennel: async () => (await night(({ kennel }) => void (kennel.entries = []))).signs,
    speak: (fields, level) => void (fields.op === 'walk.done' && quiet.push(level)),
    now: () => NOW.getTime(),
  });
  assert.deepEqual(quiet, ['info'], 'a Kennel with no add-on from outside yet made the night a problem');

  const thrown: string[] = [];
  const broke = await nightlyWalk({
    records: async () => ({ ids: [] }),
    snapshot: async () => ({ key: 'k', bytes: 0, rows: 0 }),
    kennel: async () => {
      throw new Error('the bucket is not bound');
    },
    note: async (text) => void thrown.push(text),
    now: () => NOW.getTime(),
  });
  assert.equal(broke.kennel?.[0]?.ok, false);
  assert.match(thrown[0] ?? '', /\n✗ Kennel: its vital signs could not be read tonight\. Needs a look\.$/u);
});

test('a night longer than one note is written as whole lines across notes, and a line longer than a note is cut, not lost', () => {
  const lines = ['walk 2026-10-09 · 3 records · 0 stragglers · 0 failed · 0 open', 'a'.repeat(150), 'b'.repeat(150), 'c'.repeat(400)];
  const notes = notesOf(lines.join('\n'));
  assert.deepEqual(notes.map((n) => n.length), [(lines[0] ?? '').length + 1 + 150, 150, NOTE_MOST]);
  assert.ok(notes[2]?.endsWith('…'));
  assert.deepEqual(notesOf('walk 2026-10-09 · 0 records'), ['walk 2026-10-09 · 0 records']);
});
