/**
 * Gmail: the pack as it ships is read by the add-on door, and carries gmail.js as its script and apps-script.gs and
 * appsscript.json as its connect recipe, byte for byte. Every mail and name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';

const HERE = new URL('./', import.meta.url);
const read = (f: string): string => readFileSync(new URL(f, HERE), 'utf8');
const TEXT = read('gmail.pack.json');
const PACK = JSON.parse(TEXT) as { declarations: Record<string, unknown>[] };

test('THE PACK CARRIES ITS SCRIPT AND ITS RECIPE AS WRITTEN, AND READS AS AN ADD-ON', async () => {
  const script = PACK.declarations.find((d) => typeof d.script === 'string') as { source: string };
  assert.equal(script.source, read('gmail.js'));
  const door = PACK.declarations.find((d) => typeof d.ingest === 'string') as { connect: { files: { name: string; text: string }[] } };
  assert.deepEqual(door.connect.files.map((f) => f.text), [read('appsscript.json'), read('apps-script.gs')]);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
});
