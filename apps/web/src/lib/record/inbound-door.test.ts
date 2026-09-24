/**
 * Whether this host mints forwarding addresses, asked before the two buttons are drawn.
 *
 * FINDING 16 OF `loop/research-usability-2026-09-21.md`, AS AN ASSERTION. `/settings/ingest` offered
 * `Make an address` and `Stop taking forwarded mail` on every host, and on a self-host both presses
 * answered 404 `ROUTE_UNKNOWN`. The screen then printed a good sentence about `inbound.token` AFTER
 * the press, and a reload put both buttons back, so the lesson did not stick. Two of the eight
 * controls that survey counted as unable to do anything on a one-minute-old record were these.
 *
 * THE ANSWERS BELOW ARE THE TWO HOSTS' OWN, COPIED OUT OF THEM, so a probe that drifts from either
 * door fails here rather than on somebody's screen:
 *   - `apps/worker/src/inbound.ts:177` answers a non-POST at `/api/inbound/mint` with 405,
 *     `ROUTE_UNKNOWN` and an `allow: POST` header, BEFORE the bearer, the origin, the level and the
 *     fifteen-minute proof. So asking costs one request and mints nothing.
 *   - The self-host routes no `/api/inbound/*` at all: `apps/selfhost/src/server.ts` hands every
 *     `/api/*` path to `serveApi`, and `packages/host/src/index.ts:567` answers 404 `ROUTE_UNKNOWN`
 *     with `There is no method called inbound/mint.`
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Fetch } from './boot-live.ts';
import { mintsMail } from './inbound-door.ts';

const BASE = 'https://app.brain.dog';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

type Sent = { path: string; method: string };

function host(answer: (() => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET' });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const AREA = readFileSync(join(HERE, '..', '..', 'routes', 'settings', '[area]', '+page.svelte'), 'utf8');
const INGEST = ((): string => {
  const from = AREA.indexOf("{:else if area === 'ingest'}");
  assert.ok(from > 0, 'there is no ingest area');
  return AREA.slice(from, AREA.indexOf('{:else if area ===', from + 10));
})();

test('A HOST WITH NO MINT DOOR IS KNOWN BEFORE ANYBODY PRESSES ANYTHING', async () => {
  /* The self-host's own answer, from `serveApi`: the path is an `/api/` method name it does not have. */
  const { io, sent } = host(() =>
    json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called inbound/mint.', allowed: ['boot', 'list'] } }),
  );
  assert.equal(await mintsMail(BASE, io), false);
  /* ASKING MINTS NOTHING. A GET is refused by `serveInbound` at its second line, above every check
     that could have a side effect, and `serveApi` reaches no handler at all for a name it lacks. */
  assert.deepEqual(sent, [{ path: '/api/inbound/mint', method: 'GET' }]);
});

test('and the Worker, which has the door, says so without being signed in to', async () => {
  /* `serveInbound`'s own 405: the method is wrong, the route is right. */
  const wrongMethod = host(() => json(405, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/api/inbound/mint takes a POST.' } }, { allow: 'POST' }));
  assert.equal(await mintsMail(BASE, wrongMethod.io), true);

  /* AND EVERY OTHER REFUSAL IS ABOUT THE CALLER, NOT ABOUT THE HOST, so none of them takes a
     control away. A session that ended, and a sign-in too old for this door, both say something
     about who is asking; hiding the mint on either would teach a signed-out owner that their host
     cannot forward mail. */
  const signedOut = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } }));
  assert.equal(await mintsMail(BASE, signedOut.io), true);
  const stale = host(() => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open the app and sign in as an owner of this record to change where its mail arrives.' } }));
  assert.equal(await mintsMail(BASE, stale.io), true);
});

test('a host that answered nothing this screen can read is not a host that said no', async () => {
  /* A static host answers the SPA shell to a path it does not route, so the body is HTML. `press` in
     `inbound-write.ts` reads that as a record not reached and says so, and that sentence is only
     said to somebody who could press the button. */
  const shell = host(() => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.equal(await mintsMail(BASE, shell.io), true);
  /* And no answer at all: a host that could not be reached has said nothing about what it serves. */
  assert.equal(await mintsMail(BASE, host(null).io), true);
});

test('THE SCREEN SAYS WHAT THE HOST CAN DO BEFORE IT OFFERS TO DO IT', () => {
  /* Finding 16, as the markup: neither button exists until the host has answered, and the sentence
     about `inbound.token` is drawn as a fact about the host rather than as a refusal of a press. */
  assert.match(INGEST, /mintsHere === true/u, 'the ingest area does not branch on what the host serves');
  assert.match(
    INGEST,
    /mintsHere === true[\s\S]*?askMail\('mint'\)/u,
    'the mint button is not inside the branch that knows the host has the door',
  );
  assert.match(
    INGEST,
    /mintsHere === false[\s\S]*?mailWords\.unrouted/u,
    'a host without the door does not say so before the press',
  );
  /**
   * AND NOT AS A HALF-DRAWN OFFER WHILE THE HOST IS BEING ASKED. `null` is the third state and it
   * draws neither button, the way `liveKeys` draws no passkey list until the host has answered.
   *
   * THIS ASKED FOR AN ORDER AND THE ORDER WAS AN ACCIDENT OF THE DAY IT WAS WRITTEN. It held that
   * the revoke button came BEFORE `mintsHere === false`, which was true while the area opened with
   * the host-has-the-door arm. The level gates landed the same afternoon and put the refusals
   * first, so a correct screen went red on a claim about which arm was typed first. What it means
   * is that the button is inside an arm that knows the host answered, so that is what it asks.
   */
  const answered = INGEST.indexOf('mintsHere === true');
  assert.ok(answered > 0, 'the ingest area never asks whether the host has the door');
  assert.ok(INGEST.indexOf("askMail('revoke')") > answered, 'the revoke button is drawn outside the answered branch');
});

test('AND THE ANSWER STICKS, which is the half a reload undid', () => {
  /* `unrouted` from a press is the host saying the same thing the probe asks for, so it is kept as
     the host's answer rather than shown once and forgotten. Before this, a reload put both buttons
     back and the person could press again for ever. */
  assert.match(AREA, /said\.kind === 'unrouted'[\s\S]{0,400}?mintsHere = false/u, 'an unrouted press does not teach the screen what the host is');
  assert.match(AREA, /mintsMail\(/u, 'the screen never asks the host whether it mints');
});
