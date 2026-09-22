/**
 * A `startRecord()` that throws has given back the port it took, whichever step threw.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHAT THIS IS FOR. Every browser gate takes its record inside the `try` whose `finally` hands it back, and leaves
 * `record` `null` when `startRecord()` throws, on the promise that a record which failed to start has already closed
 * what it built. Until 22 September that held for the two refusals `record.mjs` wrote out by hand (a refused seed, a
 * refused owner) and for nothing else: an exception out of `installSeed` or `directory.person$` left the self-host
 * listening, and no `finally` in any gate could reach it, because the gate never got a handle to close.
 *
 * MEASURED BEFORE THE REPAIR, the `throw` case bound the record's port again after the throw and got **EADDRINUSE**,
 * and the child did not exit on its own: without the `process.exit` at its end it ran into a 20-second `timeout`,
 * held open by the leaked server. The `refuse` case rebound cleanly, which is why the refusal paths were never the
 * problem and why a sentence written from them read as true.
 *
 * EACH CASE ASKS FOR A PORT THE CHILD HAS JUST SEEN FREE, not one out of `budgets.json`, so nothing here competes
 * with a gate run for a port.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const CHILD = join(import.meta.dirname, 'record-throws.child.mjs');

function run(mode) {
  const out = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--experimental-strip-types', '--no-warnings', CHILD, mode], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(out.status, 0, `the child exited ${out.status}:\n${out.stderr}`);
  return JSON.parse(out.stdout.trim().split('\n').at(-1));
}

test('a seed step that throws gives the port back, and the throw is what reaches the caller', () => {
  const { during, after, threw } = run('throw');
  assert.equal(during, 'EADDRINUSE', 'the record was listening when the seed ran, so there was something to give back');
  assert.equal(threw, 'the stub seed threw');
  assert.equal(after, null, `startRecord() threw with its port still bound (${after})`);
});

test('a seed that is refused gives the port back too, and says why', () => {
  const { during, after, threw } = run('refuse');
  assert.equal(during, 'EADDRINUSE');
  assert.match(threw ?? '', /could not take the seed: the stub seed refused/);
  assert.equal(after, null, `startRecord() refused with its port still bound (${after})`);
});
