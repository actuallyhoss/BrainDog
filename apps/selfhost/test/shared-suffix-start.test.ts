/**
 * A self-host served at a name many sites share does not start, and the first thing it says is why.
 *
 * `sharedSuffix` (`packages/record/src/identity.ts`) refuses a passkey domain on a shared public suffix, and the
 * Directory throws its sentence at the start; `main.ts` prints a throw as one line and exits 1. Run as the operator runs
 * it, in a child process: `init`, then `serve` at `https://studio.pages.dev` with sign-in on. A host that served there
 * would hold every passkey on a name the platform hands out again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedSuffix } from '@braindog/record/directory';

import { serveUntil } from './serving.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

test('SERVED AT studio.pages.dev, THE HOST EXITS NON-ZERO AND ITS FIRST LINE IS THE SHARED-NAME SENTENCE', async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-shared-suffix-'));
  try {
    const env = { ...process.env, BRAINDOG_DATA: data, PORT: '0' };
    const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
    assert.equal(made.status, 0, made.stderr);

    const sentence = sharedSuffix('studio.pages.dev');
    assert.ok(sentence, 'pages.dev is not refused as a shared name');

    /* SIGN-IN ON (a server key and the record `init` made), so the Directory is built with the passkey domain, and the
       wait is only for the process to end by itself: it never answers, so `ready` never says yes. */
    const served = await serveUntil(
      { ...env, BRAINDOG_TOKEN: randomBytes(32).toString('base64url'), BRAINDOG_HOST: '127.0.0.1', BRAINDOG_ORIGIN: 'https://studio.pages.dev' },
      () => false,
    );
    assert.notEqual(served.status, null, `serve did not stop by itself; it said: ${served.stderr}`);
    assert.notEqual(served.status, 0, 'serve started at a shared name');
    /* Node may print its own warnings first (type stripping), so the first line is the first of BrainDog's own. */
    const lines = served.stderr.split('\n').filter((l) => l.trim() !== '' && !/^\(node:\d+\)|^\(Use `node --trace-warnings/u.test(l));
    assert.equal(lines[0], sentence);
    assert.equal(served.stdout, '', 'serve wrote to stdout, which belongs to the CLI');
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
