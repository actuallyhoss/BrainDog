/**
 * THE RULE THIS FILE STATES AT ITS OWN `json()` HELPER, ENFORCED.
 *
 * `33 §4` asks for `no-store` on all of `/api/*`. `serveApi` sets it on everything it answers, and
 * every answer this Worker writes ITSELF has to as well. Two did not: the Durable Object's 503 and
 * its 401 were built by hand with a content-type and nothing else, and `route()` hands back what
 * the object returns unchanged. Neither status is heuristically cacheable, so nothing was observed
 * to go wrong; what was wrong is that the file states a rule, provides a helper for it, and had two
 * places the sentence did not reach.
 *
 * IT READS THE SOURCE AS TEXT, which is the shape several gates in this repository already use and
 * is the only one available here: `src/index.ts` imports `cloudflare:workers` and cannot be loaded
 * by `node --test` at all. That is also why `tsconfig.test.json` includes two of its modules and
 * not this one. Reading it rather than importing it means the file needs no config change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('EVERY RESPONSE THE WORKER BUILDS BY HAND CARRIES no-store', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const bare: string[] = [];
  let found = 0;

  for (const m of src.matchAll(/new Response\(/g)) {
    found += 1;
    /* TO THE MATCHING CLOSE PAREN, and not to the first one. A `new Response(JSON.stringify({...}))`
       carries parens of its own, and stopping at the first would cut the call in half and read the
       headers of the next one. */
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    for (; i < src.length && depth > 0; i += 1) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
    }
    const call = src.slice(m.index ?? 0, i);
    if (!/cache-control/i.test(call))
      bare.push(`line ${src.slice(0, m.index ?? 0).split('\n').length}: ${call.replace(/\s+/g, ' ').slice(0, 100)}`);
  }

  /* AND THE FILE WAS ACTUALLY READ. A regex that matches nothing passes every assertion under it,
     which is the shape this repository's own self-test exists to break.

     ONE IS THE RIGHT NUMBER TODAY, and that is the point rather than a coincidence: the `json` helper is the
     only place this file constructs a Response, which is what makes one rule cover every answer.
     The two that did not go through it are the two this test was written for. */
  assert.ok(found > 0, 'no Response is constructed in this file at all, so this test read the wrong one');
  assert.ok(src.includes('const json = '), 'the helper this rule lives in is gone');
  assert.deepEqual(bare, [], 'this file states `no-store` on its own answers and provides json() for it');
});
