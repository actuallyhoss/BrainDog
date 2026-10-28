/**
 * his "It left `*.pre-braindog` backups of the old files next to each one": the first copy BrainDog
 * keeps of a file it changes is `<file>.pre-braindog`, later copies keep the names they always had, `.bak` and `.bak1`,
 * and no copy is ever written over by a later one.
 *
 * MEASURED BEFORE THIS: the first copy was `<file>.bak`, so the name he gave was on no file, and `claude mcp add-json`
 * changed a profile's servers file with no copy at all (that half is `keepCopy`, and setup.test.ts sees it used).
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backupOf, FIRST_COPY, installInto, keepCopy } from '../src/install.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-pre-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const folder = () => {
  const dir = join(scratch, `p${String(n++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

test('the first copy of a file is <file>.pre-braindog, and the next ones .bak and .bak1', () => {
  const file = join(folder(), 'settings.json');
  writeFileSync(file, '{"first":true}\n');
  assert.equal(FIRST_COPY, '.pre-braindog');
  assert.equal(backupOf(file), `${file}.pre-braindog`);
  assert.equal(keepCopy(file), `${file}.pre-braindog`);
  writeFileSync(file, '{"second":true}\n');
  assert.equal(keepCopy(file), `${file}.bak`);
  writeFileSync(file, '{"third":true}\n');
  assert.equal(keepCopy(file), `${file}.bak1`);
  assert.equal(readFileSync(`${file}.pre-braindog`, 'utf8'), '{"first":true}\n', 'a later copy wrote over the first');
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), '{"second":true}\n');
});

test('a missing file has nothing to copy, and no copy is made', () => {
  const dir = folder();
  assert.equal(keepCopy(join(dir, '.claude.json')), null);
  assert.deepEqual(readdirSync(dir), []);
});

test('install keeps the settings as they were under .pre-braindog, and a second change never writes over it', () => {
  const dir = folder();
  const settings = join(dir, 'settings.json');
  const before = '{\n  "theme": "dark"\n}\n';
  writeFileSync(settings, before);
  const lines = installInto(dir, { apply: true, scripts: join(scratch, 'hooks'), home: scratch });
  assert.ok(lines.includes(`The file as it was is kept at ${settings}.pre-braindog.`), lines.join('\n'));
  assert.equal(readFileSync(`${settings}.pre-braindog`, 'utf8'), before);

  /* A hand edit, then install again: its copy is the next free name, and the first is as it was. */
  const edited = JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>;
  delete edited.hooks;
  writeFileSync(settings, `${JSON.stringify(edited, null, 2)}\n`);
  const again = installInto(dir, { apply: true, scripts: join(scratch, 'hooks'), home: scratch });
  assert.ok(again.includes(`The file as it was is kept at ${settings}.bak.`), again.join('\n'));
  assert.equal(readFileSync(`${settings}.pre-braindog`, 'utf8'), before, 'the second install wrote over the first copy');
});
