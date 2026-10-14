/**
 * A zip read in the browser, with every zip under test written here by hand: local headers, the central directory and
 * its end, one stored entry and one deflated through `CompressionStream('deflate-raw')`. No fixture file, no dependency.
 *
 * WHAT IS UNDER TEST is that a workspace export opens into its files, that folders and the Mac's copies are passed over,
 * and that each limit and each method this reader does not take is refused in one sentence a person can read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readZip, ZIP_BYTES_MOST, ZIP_ENTRIES_MOST, ZIP_ENTRY_MOST } from './zip.ts';

type Put = { name: string; data?: Uint8Array; method?: number; flags?: number; size?: number; packed?: Uint8Array };

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

async function deflated(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip as a zip tool writes one. `packed` is what is stored for the entry, `size` what the directory says it opens to. */
function zipOf(puts: readonly Put[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let at = 0;
  for (const p of puts) {
    const name = text(p.name);
    const packed = p.packed ?? p.data ?? new Uint8Array();
    const size = p.size ?? p.data?.byteLength ?? 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, p.flags ?? 0, true);
    local.setUint16(8, p.method ?? 0, true);
    local.setUint32(18, packed.byteLength, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.byteLength, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, p.flags ?? 0, true);
    central.setUint16(10, p.method ?? 0, true);
    central.setUint32(20, packed.byteLength, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, at, true);
    parts.push(new Uint8Array(local.buffer), name, packed);
    directory.push(new Uint8Array(central.buffer), name);
    at += 30 + name.byteLength + packed.byteLength;
  }
  const dirSize = directory.reduce((n, d) => n + d.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, puts.length, true);
  end.setUint16(10, puts.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, at, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, a) => n + a.byteLength, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.byteLength;
  }
  return out;
}

const why = async (bytes: Uint8Array): Promise<string> => {
  const got = await readZip(bytes);
  assert.ok('why' in got, 'the zip was read where it should have been refused');
  assert.doesNotMatch(got.why, /—/u, 'no em dash in a sentence a person reads');
  return got.why;
};

test('A STORED ZIP AND A DEFLATED ONE OPEN INTO THEIR FILES; folders and the Mac copies are passed over', async () => {
  const csv = text('Name,Status\nWrite the post,Open\nShip it,Done\n');
  const page = text(`# Garden plans\n\n${'Plant the beans by the fence. '.repeat(200)}`);
  const stored = await readZip(zipOf([{ name: 'Workspace/' }, { name: 'Workspace/Tasks.csv', data: csv }, { name: '__MACOSX/Workspace/._Tasks.csv', data: text('x') }]));
  assert.ok('entries' in stored);
  assert.deepEqual(stored.entries.map((e) => e.name), ['Workspace/Tasks.csv']);
  assert.deepEqual(stored.entries[0]?.bytes, csv);
  const packed = await deflated(page);
  assert.ok(packed.byteLength < page.byteLength, 'the page was really deflated');
  const both = await readZip(zipOf([{ name: 'Tasks.csv', data: csv }, { name: 'Garden plans.md', method: 8, packed, size: page.byteLength }]));
  assert.ok('entries' in both);
  assert.equal(new TextDecoder().decode(both.entries[1]?.bytes), new TextDecoder().decode(page));
});

test('EACH LIMIT IS REFUSED IN ONE PLAIN SENTENCE: the whole zip, the files in it, one file, and all of it opened', async () => {
  assert.match(await why(new Uint8Array(ZIP_BYTES_MOST + 1)), /^That zip is 30 MB, and the most one may be is 30 MB\.$/u);
  const many = Array.from({ length: ZIP_ENTRIES_MOST + 1 }, (_, i) => ({ name: `Page ${i}.md`, data: text('a') }));
  assert.equal(await why(zipOf(many)), 'That zip holds more than 200 files; zip the ones you want to bring in.');
  assert.ok('entries' in (await readZip(zipOf(many.slice(0, ZIP_ENTRIES_MOST)))), 'two hundred is allowed');
  const big = new Uint8Array(ZIP_ENTRY_MOST + 1);
  assert.equal(await why(zipOf([{ name: 'Folder/Huge.csv', data: big }])), 'Huge.csv in that zip is 10 MB, and the most one file may be is 10 MB.');
  const declared = Array.from({ length: 4 }, (_, i) => ({ name: `Part ${i}.csv`, method: 8, packed: new Uint8Array([3, 0]), size: 9 * 1024 * 1024 }));
  assert.equal(await why(zipOf(declared)), 'What that zip holds comes to more than 30 MB once it is opened.');
});

test('A ZIP THAT LIES ABOUT A SIZE, A DAMAGED ONE, AND A FILE THAT IS NOT A ZIP are refused before anything is kept', async () => {
  const page = text('one two three '.repeat(500));
  const packed = await deflated(page);
  assert.equal(await why(zipOf([{ name: 'Notes.md', method: 8, packed, size: 100 }])), 'Notes.md in that zip does not open to the size the zip says it is.');
  assert.equal(await why(zipOf([{ name: 'Notes.md', method: 8, packed: text('not deflate at all'), size: 10 }])), 'Notes.md in that zip is damaged and does not open.');
  assert.equal(await why(text('Name,Status\nA,B\n')), 'That file is not a zip, or it was cut short while it was saved.');
  const cut = zipOf([{ name: 'Tasks.csv', data: text('a,b\n1,2\n') }]);
  cut[0] = 0;
  assert.equal(await why(cut), 'That zip is damaged where Tasks.csv should be.');
});

test('ANOTHER METHOD IS REFUSED BY ITS NAME, and so is a file locked with a password', async () => {
  assert.equal(await why(zipOf([{ name: 'Tasks.csv', method: 12, data: text('x') }])), 'Tasks.csv in that zip is packed with bzip2, which cannot be opened here; zip it again with the usual settings.');
  assert.match(await why(zipOf([{ name: 'Tasks.csv', method: 9, data: text('x') }])), /Deflate64/u);
  assert.match(await why(zipOf([{ name: 'Tasks.csv', method: 77, data: text('x') }])), /packed with method 77/u);
  assert.equal(await why(zipOf([{ name: 'Tasks.csv', flags: 1, data: text('x') }])), 'Tasks.csv in that zip is locked with a password; zip it again without one.');
});
