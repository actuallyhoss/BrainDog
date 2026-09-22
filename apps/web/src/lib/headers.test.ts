/**
 * The app's `static/_headers`, which Cloudflare's static assets read: a hashed file under
 * `/_app/immutable/` was served `max-age=0`, so every load asked again for bytes that cannot change.
 *
 * UNDER THE BASE SINCE THE APP MOVED TO `brain.dog/app`. A rule still written `/_app/immutable/*` matches the marketing
 * site's chunks on that hostname, which this Worker never serves, and none of the app's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('hashed assets are cached for a year and marked immutable, and nothing else is', () => {
  const rules = readFileSync(new URL('../../static/_headers', import.meta.url), 'utf8');
  assert.match(rules, /^\/app\/_app\/immutable\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  const paths = rules.split('\n').filter((l) => l.startsWith('/'));
  assert.deepEqual(paths, ['/app/_app/immutable/*']);
});
