/**
 * The build id's door: one public path, answered by the Worker rather than by the shell.
 *
 * THE DECISION IS IN `route.ts` SO IT CAN BE TESTED AT ALL, for the reason `route.ts` is free of `cloudflare:`:
 * `src/index.ts` imports `cloudflare:workers` and cannot be loaded by `node --test`, so the two
 * lines in it that matter here are read as text.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesApi, servesBuild } from '../src/route.ts';

test('ONE PATH, AND THE NEIGHBOURS THAT LOOK LIKE IT ARE NOT IT', () => {
  for (const path of ['/.well-known/braindog-build', '/.well-known/braindog-build/', '//.well-known//braindog-build'])
    assert.equal(servesBuild(path), true, path);
  for (const path of ['/.well-known', '/.well-known/braindog-key', '/.well-known/braindog-build/x', '/braindog-build', '/api/version'])
    assert.equal(servesBuild(path), false, path);
  /* It is not an `/api` method, so nothing about it reaches a record or takes a record's door. */
  assert.equal(servesApi('/.well-known/braindog-build'), false);
});

test('the Worker answers it before any door is asked, and through the helper that sets no-store', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const at = src.indexOf('servesBuild(url.pathname)');
  assert.ok(at > 0, 'route() does not branch on the build id, so the app shell answers it with a 200');
  assert.ok(at < src.indexOf('doorOf(request'), 'a cookie is read for a path that needs none');

  /* AN UNSET BUILD SAYS SO RATHER THAN SAYING `""`. A deploy that forgot `--var` leaves the empty
     string, and a gate comparing against it reads a tuple that is merely unequal instead of a
     deployment that was never told which build it is. */
  assert.match(
    src,
    /const buildId = \(env: Env\): Response => json\(\{ app: env\.BRAINDOG_BUILD \|\| null, min_cli: MIN_CLI \}, 200\)/u,
    'the build id is not answered as { app: tuple-or-null, min_cli } as this route promises',
  );
});
