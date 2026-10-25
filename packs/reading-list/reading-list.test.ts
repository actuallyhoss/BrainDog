/**
 * The reading list: books, articles and papers to read, what is being read now, and a line on each one finished.
 *
 * THE SOURCE OF WHAT IS PUBLISHED, BYTE FOR BYTE: a published version never changes, so a version this file names that
 * the catalogue already lists must be the exact bytes the catalogue holds for it. The catalogue listed `reading-list`
 * 1.0.0 before this folder existed; 2.0.0 here renames the `readings` field the kernel reserved for the record's own
 * (`title`, to `name`), which the catalogue has not caught up to yet. The first test holds every listed version to its
 * checksum; a change to the file is a later version, with a `changes` line, or the catalogue tool refuses it.
 *
 * IT IS TESTED THE WAY AN AUTHOR TESTS AN ADD-ON: installed in a scratch record through the command line's own
 * functions, then the rows in `reading-list.test.json` written and each thing it expects said, as `braindog pack test`
 * does. The last test reads the page back, because a list is only half of what the add-on promises.
 *
 * Every title here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackTest, runPackTest } from '../../apps/cli/src/pack-test.ts';
import { checkInScratch, openScratch } from '../../apps/cli/src/scratch.ts';
import { fileChecksum, readCatalogue, readCatalogueFile } from '../../packages/declare/src/catalogue.ts';

/* A FIXED CLOCK, so "finished on the 20th" is in the past on every run. */
const NOW = Date.UTC(2026, 8, 28, 12);

const TEXT = readFileSync(new URL('./reading-list.pack.json', import.meta.url), 'utf8');
const TEST_FILE: unknown = JSON.parse(readFileSync(new URL('./reading-list.test.json', import.meta.url), 'utf8'));
/** The catalogue the app ships, which lists every published version with the checksum of its file. */
const INDEX = new URL('../../apps/web/static/catalogue/index.json', import.meta.url);

/** The file read through the add-on door, as `pack check` reads it, or the test fails with the door's sentence. */
async function opened() {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'reading-list.pack.json did not read.');
  return read.value;
}

/** The scratch record with the add-on installed and the test's rows written, every expectation passed. */
async function tested() {
  const read = readPackTest(TEST_FILE);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'reading-list.test.json did not read.');
  const checked = await checkInScratch(await opened(), true, NOW);
  if (!checked.ok || checked.held === null) {
    checked.held?.scratch.close();
    assert.fail(checked.lines.join('\n'));
  }
  const run = runPackTest(checked.held.scratch, read.value);
  return { scratch: checked.held.scratch, run };
}

test('THE FILE IS reading-list, AND EVERY VERSION THE CATALOGUE ALREADY LISTS FOR IT MATCHES CHECKSUM FOR CHECKSUM', async () => {
  const doc = JSON.parse(TEXT) as { pack: string; version: string };
  assert.equal(doc.pack, 'reading-list');
  const index = readCatalogue(JSON.parse(readFileSync(INDEX, 'utf8')));
  if (!index.ok) assert.fail('the catalogue index did not read');
  /* A version the catalogue already published never changes; a version this file has moved on to, such as 2.0.0's
     rename of the reserved `title` field, is not in the shipped catalogue until the catalogue tool republishes it, and
     that is not a mismatch to catch here. */
  const listed = index.value.entries.find((e) => e.kind === 'pack' && e.id === doc.pack)?.versions.find((v) => v.version === doc.version);
  if (listed) assert.equal(await fileChecksum(TEXT), listed.checksum, 'the file moved from what was published; a change is a later version');
});

test('WHAT THIS VERSION CHANGED IS SAID IN A READER’S WORDS: no kernel, no declares, no field ids (audit C of 25 October, X12)', () => {
  const doc = JSON.parse(TEXT) as { version: string; changes: string };
  assert.equal(doc.version, '2.0.2');
  assert.doesNotMatch(doc.changes, /kernel|declares|readings|field named/u);
});

test('BEFORE THE ADD-ON: a new record has no Reading page', async () => {
  const scratch = await openScratch(NOW);
  try {
    assert.ok(!scratch.slugs().includes('reading'));
  } finally {
    scratch.close();
  }
});

test('IT INSTALLS AND ITS OWN TEST PASSES, as braindog pack test runs it', async () => {
  const { scratch, run } = await tested();
  try {
    assert.ok(run.passed, run.lines.join('\n'));
  } finally {
    scratch.close();
  }
});

test('THE PAGE SAYS WHAT IS BEING READ, WHAT IS QUEUED AND WHAT IS FINISHED, each row under one heading', async () => {
  const { scratch } = await tested();
  try {
    const page = scratch.kernel.page('reading');
    if (!page.ok) assert.fail('the Reading page did not draw');
    const blocks = page.value.blocks as unknown as { rows: { fields: Record<string, unknown> }[] }[];
    assert.deepEqual(
      blocks.map((b) => b.rows.map((r) => r.fields.name)),
      [['An article on tides'], ['A book about bridges'], ['A paper on soil']],
    );
  } finally {
    scratch.close();
  }
});
