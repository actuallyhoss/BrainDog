import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const run = (data: string, ...args: string[]) =>
  spawnSync(process.execPath, [MAIN, ...args], { encoding: 'utf8', env: { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' } });

test('A BACKUP RESTORES INTO AN EMPTY FOLDER AND NEVER OVER A RECORD', () => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-cold-'));
  try {
    const data = join(root, 'data');
    assert.equal(run(data, 'init', 'home', '--owner', 'ada@example.com').status, 0);
    const made = run(data, 'backup', join(root, 'out'));
    assert.equal(made.status, 0, made.stderr);
    const folder = join(root, 'out', readdirSync(join(root, 'out'))[0]!);
    for (const f of ['directory.sqlite', 'kek', 'home/record.brain']) assert.ok(existsSync(join(folder, f)), f);

    const fresh = join(root, 'fresh');
    assert.equal(run(fresh, 'restore', folder).status, 0);
    for (const f of ['directory.sqlite', 'kek', 'home/record.brain']) assert.ok(existsSync(join(fresh, f)), f);

    const again = run(fresh, 'restore', folder);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already holds a record/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
