/**
 * The app's `static/_headers`, which Cloudflare's static assets read: a hashed file under
 * `/_app/immutable/` was served `max-age=0`, so every load asked again for bytes that cannot change.
 *
 * AT THE ROOT SINCE THE APP MOVED THERE ON 29 OCT, as it was under `/app` before. A rule still written
 * `/app/_app/immutable/*` matches nothing this Worker serves now, and none of the app's own chunks.
 *
 * AND THE FONTS, SINCE THEIR ADDRESSES CARRY THEIR HASH (`fonts.test.ts`): a new file is a new address, so a year is safe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('hashed assets and the hashed fonts are cached for a year and marked immutable, and nothing else is', () => {
  const rules = readFileSync(new URL('../../static/_headers', import.meta.url), 'utf8');
  assert.match(rules, /^\/_app\/immutable\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  const paths = rules.split('\n').filter((l) => l.startsWith('/'));
  assert.match(rules, /^\/fonts\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  assert.deepEqual(paths, ['/_app/immutable/*', '/fonts/*']);
});
