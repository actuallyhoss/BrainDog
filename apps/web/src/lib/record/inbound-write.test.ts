/**
 * The forwarding address: what the screen sends, what it does with each answer, and that an owner can reach it at all.
 *
 * THE LAST TEST IN THIS FILE IS THE ONE THE REST EXISTS FOR. `apps/worker/src/inbound.ts` mints an address, writes
 * only its digest and answers the token once; measured on 2026-09-21 by grepping `apps/web` for `api/inbound`, no
 * screen called either door, so the Cloud would take a bank's forwarded mail at an address no owner could obtain.
 * A door with no caller is a door nobody has opened.
 *
 * THE ANSWERS ARE THE DOOR'S OWN, COPIED OUT OF IT. Every refusal body below is one `serveInbound` writes, with the
 * same code and the same sentence, so a mapping that drifts from the door fails here rather than on somebody's
 * screen. The door refuses in a fixed order: the path, the method, a bearer, the page's origin, the level, the
 * credential, and last the fifteen-minute proof.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Fetch } from './boot-live.ts';
import { copy } from '../copy.ts';
import { mailUrl, mintInbound, revokeInbound, words } from './inbound-write.ts';

const BASE = 'https://app.brain.dog';

/** Forty-three base64url characters, which is what `secret()` in the door mints. */
const TOKEN = 'u7Nq2cHc0a6Yx4mWv1KpR8sTgLbZdEf3JnQ5oPiA9xU';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { path: string; method: string; headers: Headers; credentials: string | undefined };

function host(answer: ((path: string) => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      path: new URL(String(url)).pathname,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
    });
    if (!answer) throw new TypeError('fetch failed');
    return answer(new URL(String(url)).pathname);
  }) as Fetch;
  return { io, sent };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const AREA = readFileSync(join(HERE, '..', '..', 'routes', 'settings', '[area]', 'areas', 'Ingest.svelte'), 'utf8');

test('the address the screen prints is the address the mail door parses', () => {
  /* `servesIngest` in `packages/host/src/ingest.ts` splits the path, drops empty segments and wants exactly
     `in`, `email` and one more. It is written out here rather than imported: `@braindog/host` is not a
     dependency of this app and must not become one for a test. */
  const url = mailUrl(BASE, TOKEN);
  assert.equal(url, `${BASE}/in/email/${TOKEN}`);
  assert.deepEqual(new URL(url).pathname.split('/').filter((s) => s !== ''), ['in', 'email', TOKEN]);
  /* A BASE WITH A TRAILING SLASH IS THE COMMON ONE, because `location.origin` has none and a pasted host has one,
     and `//` in the middle would be a second empty segment for the door to forgive rather than a URL to hand a bank. */
  assert.equal(mailUrl(`${BASE}/`, TOKEN), url);
  /* AND NOTHING IN IT NEEDS ESCAPING. The door mints base64url so the token survives being typed into
     somebody else's settings screen; a character that had to be escaped would arrive decoded and match nothing. */
  assert.equal(encodeURIComponent(TOKEN), TOKEN);
});

test('minting is a POST to the door, with the cookie and without a bearer', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { token: TOKEN } }));
  const said = await mintInbound(BASE, io);
  assert.deepEqual(said, { kind: 'minted', token: TOKEN });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.path, '/api/inbound/mint');
  assert.equal(sent[0]?.method, 'POST');
  /* THE DOOR REFUSES AN `authorization` HEADER OF ANY KIND, before it looks at who is behind it, because what
     is missing from a bearer is a person in a browser. Sending one would turn every mint into a refusal. */
  assert.equal(sent[0]?.headers.get('authorization'), null);
  assert.equal(sent[0]?.credentials, 'same-origin');
});

test('revoking is the same door with nothing to show', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: null }));
  assert.deepEqual(await revokeInbound(BASE, io), { kind: 'revoked' });
  assert.equal(sent[0]?.path, '/api/inbound/revoke');
  assert.equal(sent[0]?.method, 'POST');
});

test('A SIGN-IN OLDER THAN FIFTEEN MINUTES IS A STATE AND NOT AN ERROR', async () => {
  /* The door's own sentence, verbatim, for the proof it wants; `13 §6` says the `fix` is what the person reads.
     This is the one refusal on this screen with a way forward that is not a correction, so it is its own kind. */
  const fix = 'Sign in again to change where this record takes its mail.';
  const stale = host(() => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix, at: 'principal' } }));
  assert.deepEqual(await mintInbound(BASE, stale.io), { kind: 'signin', fix });
  /* AND REVOKING ASKS FOR THE SAME PROOF, because it is the worse of the two losses: a bank's mail silently not
     arriving. A screen that offered a sign-in for one and an error for the other would make the damaging call
     the cheap one. */
  assert.deepEqual(await revokeInbound(BASE, stale.io), { kind: 'signin', fix });
  /* No session at all answers the same code with the other sentence, and it is the same state: signing in is the fix. */
  const none = host(() =>
    json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open the app and sign in as an owner of this record to change where its mail arrives.', at: 'principal' } }),
  );
  assert.equal((await mintInbound(BASE, none.io)).kind, 'signin');
});

test('a colleague, and a page somewhere else, read the record’s own sentence', async () => {
  const notOwner = host(() => json(403, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'Only an owner of this record can change where its mail arrives.', at: 'principal' } }));
  assert.deepEqual(await mintInbound(BASE, notOwner.io), { kind: 'refused', fix: 'Only an owner of this record can change where its mail arrives.' });
  const elsewhere = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'A forwarding address is minted from this app, in a browser, on this address.', at: 'origin' } }));
  assert.equal((await mintInbound(BASE, elsewhere.io)).kind, 'refused');
});

test('A HOST WITH NO MINT DOOR SAYS SO, and does not read as a record that said no', async () => {
  /* The self-host routes no `/api/inbound/*`: there a record's token is the file `inbound.token` beside it,
     written to register, written again to replace, deleted to revoke (`49 §5.16`, `§5.22`). A button that
     answered 404 would teach the reader that forwarding is broken rather than that it is spelled differently. */
  const { io } = host(() => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'A record method is at /api/<method>.' } }));
  assert.deepEqual(await mintInbound(BASE, io), { kind: 'unrouted' });
  assert.match(words.unrouted, /inbound\.token/u, 'it does not say where the self-host keeps it');
});

test('NO SIGN-IN IS signin, and a host that answered nothing a record says is a record not reached', async () => {
  /* ALL THREE WERE THE SAMPLE when the address named no record, and the screen answered them with the demo's sentence
     about having no account. There is no sample now (`DIRECTION.md` §26). A 401 is a person who is not signed in, and
     the screen already has the state for that: the sign-in button, then the same press again. */
  const bare = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } }));
  assert.deepEqual(await mintInbound(BASE, bare.io), { kind: 'signin', fix: 'Sign in.' });
  /* A static host answers the SPA shell to a POST it does not route, so the body is HTML and not JSON: nothing that
     could mint was reached, and that is the sentence every other write on Settings says for it. */
  const shell = host(() => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  assert.deepEqual(await mintInbound(BASE, shell.io), { kind: 'refused', fix: copy.recordNotReached });
  /* And no answer at all is the same. */
  assert.deepEqual(await revokeInbound(BASE, host(null).io), { kind: 'refused', fix: copy.recordNotReached });
  /* JSON THAT CARRIES NO REFUSAL IS NOT A REFUSAL EITHER. Deleting the arm that says so left every test above green,
     and `null` threw out of the press altogether, which left the Settings button busy and said nothing. */
  assert.deepEqual(await mintInbound(BASE, host(() => json(200, { ok: false })).io), { kind: 'refused', fix: copy.recordNotReached });
  assert.deepEqual(await mintInbound(BASE, host(() => json(200, null)).io), { kind: 'refused', fix: copy.recordNotReached });
  assert.doesNotMatch(readFileSync(join(HERE, 'inbound-write.ts'), 'utf8'), /'sample'|noRecord/u);
});

test('a success carrying no token is not a token', async () => {
  /* The door answers the token only where the digest reached the index. An `{ ok: true }` with nothing in it is a
     host this screen does not recognise, and printing `undefined` as an address is worse than saying so. */
  const { io } = host(() => json(200, { ok: true, value: {} }));
  assert.equal((await mintInbound(BASE, io)).kind, 'refused');
});

test('THE ONLY COPY OF THE TOKEN IS THE ONE ON SCREEN', () => {
  /* `inbound.ts` ends on "NOTHING HERE LOGS", and this half is where that rule is easiest to break: the answer
     carries the only copy of a credential there will ever be. */
  /* THE CODE AND NOT THE PROSE. A bare grep over the file matched the paragraph in the module explaining why
     `console.` is absent, which is an assertion catching its own evidence: it failed on the first run of this
     test with the comment as the actual value. Block comments and line comments come off first. */
  const code = readFileSync(join(HERE, 'inbound-write.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
  assert.doesNotMatch(code, /console\./u, 'the token could reach a browser console');
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/u, 'the token could outlive the tab');
  assert.match(words.once, /once/iu, 'the screen does not say the address is shown once');
});

test('THE MINT IS BUILT AND AN OWNER CAN NOW REACH IT', () => {
  /**
   * Finding 1 of `loop/research-batch-three-audit.md`, as an assertion. Before this change the two greps below
   * found nothing in `apps/web`: `/api/inbound/mint` and `/api/inbound/revoke` existed, were tested in
   * `apps/worker/test/route.test.ts`, and had no caller a person could reach.
   */
  assert.match(AREA, /from '\$lib\/record\/inbound-write\.ts'/u, 'the screen does not load the door');
  assert.match(AREA, /mintInbound\(/u, 'nothing on this screen mints an address');
  assert.match(AREA, /revokeInbound\(/u, 'nothing on this screen takes one away');

  /* IN THE INGEST AREA AND NOWHERE ELSE, which is where a person looking for where their mail lands goes. The
     section is cut out of the file so the assertions below cannot be satisfied by some other area's markup. */
  const from = AREA.indexOf('</script>');
  assert.ok(from > 0, 'there is no ingest area');
  const section = AREA.slice(from);

  assert.match(section, /mailWords\.once/u, 'the address is not said to be shown once');
  assert.match(section, /mailWords\.unknown/u, 'the screen does not admit it cannot read an existing address back');
  /* THE REFUSAL IS A STATE WITH A WAY FORWARD, not a toast that disappears: the same passkey re-proof the
     agents area offers, and then the same press again. */
  assert.match(section, /mailSaid\?\.kind === 'signin'/u, 'a stale sign-in is not a state on this screen');
  assert.match(section, /mailSignInAgain\(\)/u, 'there is no way to prove a sign-in without leaving');
  /* REVOKING IS THE QUIETER ONE. `weight="bare"` is this screen's quiet button, and minting is the primary. */
  assert.match(section, /weight="bare"[^>]*onclick=\{\(\) => void askMail\('revoke'\)\}/u, 'revoking is not the quieter action');
  assert.match(section, /weight="primary"[^>]*onclick=\{\(\) => void askMail\('mint'\)\}/u, 'minting is not the primary action');
  /* AND THE ADDRESS IS NEVER QUOTED IN A TOAST. `clipboard.put(text)` defaults its label to the text, so a
     copy with no label would print a live credential in the corner of the screen and in the toast history. */
  assert.match(section, /clipboard\.put\(mailAddress, mailWords\.addressCopied\)/u, 'the copy toast would quote the address');
});
