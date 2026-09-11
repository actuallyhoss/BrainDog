/**
 * The public demo's door: which requests it opens, and what the record is told about them.
 *
 * THE DECISION IS IN `route.ts` SO IT CAN BE TESTED AT ALL. `src/index.ts` imports
 * `cloudflare:workers` and cannot be loaded by `node --test`; `route.ts` is free of it for exactly
 * this reason, and the one line in `index.ts` that uses what is tested here is read as text below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ROUTES } from '@braindog/host';

import { DEMO_CONTEXT, demoRecord, inward } from '../src/route.ts';

const PINNED = 'rec_01J8ZC0000000000000000000A';
const at = (path: string, init: RequestInit = {}) => new Request(`https://app.brain.dog${path}`, init);

test('AN ANONYMOUS GET FOR A READ REACHES THE PINNED RECORD, and nothing else does', () => {
  assert.equal(demoRecord(at('/api/boot'), PINNED), PINNED);
  assert.equal(demoRecord(at('/api/list?register=obligations'), PINNED), PINNED);
  assert.equal(demoRecord(at('/api/schema?register=tasks'), PINNED), PINNED);

  /* A HEADER IS A HEADER, EVEN AN EMPTY ONE. It takes the ordinary path and the ordinary 401. */
  assert.equal(demoRecord(at('/api/boot', { headers: { authorization: 'Bearer rec_x.y' } }), PINNED), null);
  assert.equal(demoRecord(at('/api/boot', { headers: { authorization: '' } }), PINNED), null);

  /* A WRITE IS NOT A READ WHATEVER VERB IT ARRIVES WITH, and the table is what says which is which. */
  assert.equal(demoRecord(at('/api/create', { method: 'POST', body: '{}' }), PINNED), null);
  for (const route of ROUTES.filter((r) => r.writes))
    assert.equal(demoRecord(at(`/api/${route.name}`), PINNED), null, `${route.name} writes and the demo door opened for it`);

  /* AND THE ONE READ THAT HAS NO PLACE IN A DEMO, and a name the table does not have. */
  assert.equal(demoRecord(at('/api/dryRun'), PINNED), null);
  assert.equal(demoRecord(at('/api/delete_everything'), PINNED), null);
});

test('UNSET IS EXACTLY WHAT THE WORKER WAS, and so is a value that is not a record id', () => {
  assert.equal(demoRecord(at('/api/boot'), undefined), null);
  assert.equal(demoRecord(at('/api/boot'), ''), null);
  assert.equal(demoRecord(at('/api/boot'), 'demo'), null);
  assert.equal(demoRecord(at('/api/boot'), `${PINNED}.secret`), null);
});

test('the anonymous reader is a read-level person, and is not credentialed', () => {
  assert.deepEqual(DEMO_CONTEXT.principal, { kind: 'person', id: 'p_demo', level: 'read' });
  /* `=== false` is what `createToken` refuses on, and `undefined` would not be. */
  assert.equal(DEMO_CONTEXT.credentialed, false);
});

test('A CONTEXT THE CALLER SENT IS OVERWRITTEN, NOT TRUSTED, and the bearer goes no further', () => {
  const forged = at('/api/listGrants', {
    headers: {
      'x-braindog-ctx': JSON.stringify({ principal: { kind: 'person', id: 'p_owner', level: 'owner' } }),
      authorization: 'Bearer rec_x.y',
    },
  });
  const inner = inward(forged, DEMO_CONTEXT);
  assert.deepEqual(JSON.parse(inner.headers.get('x-braindog-ctx') ?? 'null'), DEMO_CONTEXT);
  assert.equal(inner.headers.get('authorization'), null);
  assert.equal(new URL(inner.url).pathname, '/api/listGrants', 'the path did not travel unchanged');
});

test('and the Worker sets the context in one place, for every door', () => {
  /* `Record$.fetch` reads the header as the whole of who is asking. A second place that set it is a
     second chance to set it after something the caller controls, which is A9 in
     `loop/research-anon-read.md`. */
  const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /headers\.set\(\s*'x-braindog-ctx'/u, 'index.ts sets the context itself again');
  /* FOUR DOORS NOW: the demo, a session, a bearer on `/api` and a bearer on `/mcp`, and each one reaches the
     record through `inward`. */
  assert.equal((src.match(/inward\(request, /gu) ?? []).length, 4, 'a door does not go through inward');
  /* AND THE DOOR IS DECIDED BEFORE THE BEARER IS READ, in `session.ts`, where a cookie comes before the demo. */
  assert.ok(src.includes('doorOf(request'), 'index.ts no longer asks session.ts which door');
  assert.ok(src.indexOf('doorOf(request') < src.indexOf("bearerOf(request, 'api'"), 'the door is not decided before the bearer is read');
  const session = readFileSync(fileURLToPath(new URL('../src/session.ts', import.meta.url)), 'utf8');
  assert.ok(session.indexOf("readSid(request, 'secure')") < session.indexOf('demoRecord(request, deps.demo)'), 'the demo is decided before the cookie');
});
