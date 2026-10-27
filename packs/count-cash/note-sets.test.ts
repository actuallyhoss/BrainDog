/**
 * The notes and coins of each currency are said in one file, `note-sets.json`, which the cash counter in the app reads a copy of.
 * The count script carries them inside its own source (a script has no imports), so this holds the two to each other: a
 * set changed in one place and not the other fails here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const HERE = new URL('.', import.meta.url);
const SETS = JSON.parse(readFileSync(new URL('note-sets.json', HERE), 'utf8')) as Record<string, string[]>;
const SOURCE = readFileSync(new URL('count.js', HERE), 'utf8');

test('THE SETS IN THE SCRIPT ARE THE SETS IN note-sets.json, currency for currency and note for note', () => {
  const found = /const NOTE_SETS = (\{[\s\S]*?\n\});/u.exec(SOURCE);
  assert.ok(found, 'count.js no longer declares NOTE_SETS');
  const inScript = new Function(`return ${found[1]}`)() as Record<string, string[]>;
  assert.deepEqual(inScript, SETS);
});

test("THE APP'S COUNTER READS THE SAME SETS, its own copy of this file byte for byte, since the app never imports a pack", () => {
  assert.equal(readFileSync(new URL('../../apps/web/src/lib/money/note-sets.json', HERE), 'utf8'), readFileSync(new URL('note-sets.json', HERE), 'utf8'));
});

test('every set runs from the largest note to the smallest coin, with none twice', () => {
  for (const [currency, set] of Object.entries(SETS)) {
    const values = set.map(Number);
    assert.deepEqual([...values].sort((a, b) => b - a), values, `${currency} is not in descending order`);
    assert.equal(new Set(values).size, values.length, `${currency} repeats a value`);
  }
});
