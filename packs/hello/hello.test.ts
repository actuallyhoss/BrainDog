/**
 * Hello, the smallest useful add-on: one list, one page over it, two example rows, and `hello.test.json`. It is the
 * folder `braindog pack new hello` writes, with BrainDog's name, a summary and a first line of changes put in.
 *
 * THIS FILE TAKES THE STEPS `braindog pack check` AND `braindog pack test` TAKE, through the command line's own
 * functions, so somebody writing their first add-on can read here what those two commands do: the file is read through
 * the add-on door, installed in a scratch record, every page it adds is drawn, then the rows in `hello.test.json` are
 * written and each thing it expects is said as passed or failed.
 *
 * NOTHING HERE IS ABOUT ANYBODY. The two example rows tell whoever installs it to write their own and delete these.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { packStarter, packStarterTest } from '../../apps/cli/src/catalogue.ts';
import { readPackTest, runPackTest } from '../../apps/cli/src/pack-test.ts';
import { checkInScratch, openScratch } from '../../apps/cli/src/scratch.ts';
import { readCatalogueFile } from '../../packages/declare/src/catalogue.ts';

/* A FIXED CLOCK, so the scratch record and the example rows it holds are the same on every run. */
const NOW = Date.UTC(2026, 8, 28, 12);

/** The file and its test as they ship, read once: no test here changes either. */
const TEXT = readFileSync(new URL('./hello.pack.json', import.meta.url), 'utf8');
const TEST_FILE: unknown = JSON.parse(readFileSync(new URL('./hello.test.json', import.meta.url), 'utf8'));

type Doc = { pack: string; version: string; title: string; requires: unknown; declarations: unknown[]; seeds: unknown[] };
const doc = (): Doc => JSON.parse(TEXT) as Doc;

/** The file read through the add-on door, as `pack check` reads it, or the test fails with the door's sentence. */
async function opened() {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'hello.pack.json did not read.');
  return read.value;
}

test('BEFORE THE ADD-ON: a new record has no Hello page', async () => {
  const scratch = await openScratch(NOW);
  try {
    assert.ok(!scratch.slugs().includes('hello'), 'a record already draws a page called hello, so this add-on would add nothing');
  } finally {
    scratch.close();
  }
});

test('THE FILE IS WHAT braindog pack new WRITES: the same list, page, example rows and test', () => {
  const file = doc();
  const starter = packStarter('hello', 'Hello', 'BrainDog');
  assert.deepEqual([file.pack, file.version, file.title], ['hello', '1.0.3', 'Hello']);
  assert.deepEqual(file.requires, starter.requires);
  assert.deepEqual(file.declarations, starter.declarations);
  assert.deepEqual(file.seeds, starter.seeds);
  assert.deepEqual(TEST_FILE, packStarterTest());
});

test('IT CHECKS AS braindog pack check CHECKS IT: installed in a scratch record, its page drawn, and no warning', async () => {
  const checked = await checkInScratch(await opened(), false, NOW);
  assert.ok(checked.ok, checked.lines.join('\n'));
  assert.deepEqual(
    checked.lines.filter((line) => line.includes('Warning')),
    [],
    'a key in the manifest is one the Kennel does not take',
  );
});

test('AND ITS OWN TEST PASSES AS braindog pack test RUNS IT', async () => {
  const read = readPackTest(TEST_FILE);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'hello.test.json did not read.');
  const checked = await checkInScratch(await opened(), true, NOW);
  try {
    assert.ok(checked.ok && checked.held !== null, checked.lines.join('\n'));
    const run = runPackTest(checked.held.scratch, read.value);
    assert.ok(run.passed, run.lines.join('\n'));
    /* ONE LINE FOR EACH THING THE TEST EXPECTS, every one of them passed. */
    assert.equal(run.lines.length, read.value.expect.length);
  } finally {
    checked.held?.scratch.close();
  }
});
