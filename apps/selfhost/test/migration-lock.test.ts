/**
 * THE SELF-HOST REFUSES A RECORD WHOSE APPLIED MIGRATION IS NOT THE TEXT THE LOCK HOLDS: a record made
 * by `init`, one checksum in its migration ledger changed, and `serve` stops before it listens, with the sentence and
 * the fix on stderr and exit 1. An applied migration is never edited, so a build that disagrees with the record is at
 * fault and must not start on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

test('A RECORD WHOSE APPLIED MIGRATION IS NOT THE TEXT THE LOCK HOLDS STOPS THE SERVER, with the sentence and the fix', (t) => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-lock-'));
  t.after(() => rmSync(data, { recursive: true, force: true }));
  const env = { ...process.env, BRAINDOG_DATA: data, PORT: '0', BRAINDOG_BACKUP_AT: 'off' };
  assert.equal(spawnSync(process.execPath, [MAIN, 'init', 'studio', '--owner', 'ada@example.com'], { env, encoding: 'utf8' }).status, 0);
  const db = new DatabaseSync(join(data, 'studio', 'record.brain'));
  db.exec("UPDATE migration SET checksum = 'edited' WHERE version = 1");
  db.close();
  const r = spawnSync(process.execPath, [MAIN, 'serve'], { env, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /This BrainDog ran migration 1 \(kernel\) as text this build does not hold/);
  assert.match(r.stderr, /restore the copy taken before the upgrade/);
});
