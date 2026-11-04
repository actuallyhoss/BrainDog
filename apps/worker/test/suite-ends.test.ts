/**
 * The suite ends and says so, whatever a test file leaves running.
 *
 * WHAT HAPPENED (4 Nov). `card-in-do.test.ts` failed in its `before` with one of its two Workers already up, and nothing
 * stopped that Worker. Its workerd child held the file's process open at 0% CPU for 12 minutes and more, and the runner
 * reports files in order, so every file after it printed nothing: a run that looks like it is still going, and has found
 * nothing. `--test-timeout` ALONE DOES NOT CURE THAT, measured: a timeout fails a test that has not finished, and these
 * had finished. `--test-force-exit` is what ends the file. So this runs the worker's own test command's flags over a file
 * of that shape and asks that the run ends, fails, and reports the file beside it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: { test: string } }).scripts.test;

test('THE TEST COMMAND HOLDS BOTH HALVES, each run of it: a stuck test is failed, and a file left open is ended', () => {
  const runs = script.split('&&').map((run) => run.trim());
  assert.equal(runs.length, 2, script);
  for (const run of runs) {
    assert.match(run, /^node --test /u, run);
    assert.match(run, / --test-force-exit /u, `${run} can be held open for ever by whatever a test file started`);
    assert.match(run, / --test-timeout=\d+ /u, `${run} can wait for ever on a test that never finishes`);
  }
});

test('A FILE THAT FAILS WITH SOMETHING STILL RUNNING ENDS, FAILS, AND THE FILE BESIDE IT IS STILL REPORTED', () => {
  const flags = script.split('&&')[0]!.trim().split(' ').filter((word) => word.startsWith('--test-'));
  const dir = mkdtempSync(join(tmpdir(), 'braindog-suite-ends-'));
  try {
    writeFileSync(
      join(dir, 'a-left-open.test.mjs'),
      "import { test, before } from 'node:test';\nbefore(() => { setInterval(() => {}, 1000); throw new Error('a boot that failed'); });\ntest('never reached', () => {});\n",
    );
    writeFileSync(join(dir, 'b-beside-it.test.mjs'), "import { test } from 'node:test';\ntest('the file after it', () => {});\n");
    const { NODE_TEST_CONTEXT: _nested, ...env } = process.env;
    const out = spawnSync(process.execPath, ['--test', ...flags, 'a-left-open.test.mjs', 'b-beside-it.test.mjs'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(out.error, undefined, 'the run did not end by itself');
    assert.equal(out.status, 1, out.stdout);
    assert.match(out.stdout, /the file after it/u);
    assert.match(out.stdout, /a boot that failed/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
