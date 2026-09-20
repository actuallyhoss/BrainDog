/**
 * Which paths this Worker claims, and where `/in/*` sits in the order it claims them.
 *
 * A PREFIX IS A CLAIM ABOUT THE APP AS WELL AS ABOUT THE WORKER. `run_worker_first` hands every
 * request to this Worker first and the app shell answers whatever falls through, so a prefix this
 * router does not claim is a prefix that answers `index.html` with a 200. For `/in/*` that is worse
 * than a 404: a sender's retry logic reads 200 as delivered, and a bank stops resending a payment
 * alert nothing ever stored.
 *
 * THE TEXT OF `index.ts` IS READ RATHER THAN IMPORTED, for the reason `build.test.ts` gives: it
 * imports `cloudflare:workers` and `node --test` cannot load it. What is checked here is the order
 * of the branches, which is the property a unit test of the pieces cannot see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesApi, servesAuth, servesIn, servesMcp } from '../src/route.ts';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

test('`/in/*` IS THE PREFIX, AND THE PATHS THAT MERELY START WITH THOSE TWO LETTERS ARE NOT IT', () => {
  for (const path of ['/in', '/in/', '/in/webhook/rec_x/statements/tok', '/in/email/tok', '//in//webhook//x'])
    assert.equal(servesIn(path), true, path);
  for (const path of ['/information', '/inbox', '/in-box', '/api/in', '/', '/index.html'])
    assert.equal(servesIn(path), false, path);

  /* AND IT IS NOT A RECORD METHOD, so nothing about it goes through the door ladder or the table. */
  assert.equal(servesApi('/in/webhook/rec_x/statements/tok'), false);
  assert.equal(servesAuth('/in/email/tok'), false);
  assert.equal(servesMcp('/in'), false);
});

test('THE ARRIVAL DOOR IS ANSWERED BEFORE ANY DOOR IS ASKED, because an arrival carries no credential', () => {
  const at = SOURCE.indexOf('servesIn(url.pathname)');
  assert.ok(at > 0, 'route() does not branch on /in/*, so the app shell answers a webhook with a 200');

  /* THE COOKIE IS NEVER READ FOR IT AND THE PUBLIC DEMO NEVER APPLIES. `doorOf` is where a request
     acquires a principal, and an arrival is above that gate by design (`33 §4`): what stands in for
     a principal is whether the payload was verified, which decides only whether the stored row may
     match (`12 §3`). */
  assert.ok(at < SOURCE.indexOf('doorOf(request'), 'a cookie or the demo is read for a path that takes neither');
  /* AND BEFORE THE `ROUTE_UNKNOWN` THAT GUARDS `/api/`, which returns for everything it does not
     recognise. A branch after it is a branch that never runs. */
  assert.ok(at < SOURCE.indexOf('servesApi(url.pathname)'), '/in/* is decided after the route that refuses everything else');

  /* AND IT IS THE CLOUD'S DOOR AND NOT A SECOND COPY OF `packages/host`'s ORDER. */
  assert.match(SOURCE, /cloudIngest\(/u, 'index.ts does not build the Cloud half of the arrival door');
});
