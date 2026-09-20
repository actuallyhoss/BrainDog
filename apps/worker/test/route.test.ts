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

import { serveIngest, type IngestArrival } from '@braindog/host';

import { cloudIngest, servesApi, servesAuth, servesIn, servesMcp, type CloudIngestDeps, type InboundIndex } from '../src/route.ts';

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

/* ── forwarded mail, which is the door with no record id in it ───────────── */

/**
 * `/in/email/<token>`: the only arrival whose path names no record, so the digest IS the address.
 *
 * WHAT IS BEING TESTED IS A TENANT BOUNDARY DRAWN BY A STRANGER'S URL. Every other door on this
 * Worker either carries a bearer whose front half names the record, or carries the record id in the
 * path where `isRecordId` and `knows` can refuse it. Mail carries neither: the token in the address
 * is the whole of the lookup, and whatever the index answers becomes the argument to `idFromName`.
 * So the cases below are mostly about the answers that must NOT become an address.
 *
 * THE INDEX IS A TEST DOUBLE BECAUSE THE DIRECTORY HAS NO SUCH INDEX YET. `InboundIndex` is the
 * narrow shape the Worker needs from it, and everything on this side of that shape is finished and
 * exercised here; the Directory's table, the RPC over it and the wiring in `index.ts` are the other
 * half, and none of the three is in this agent's files.
 */

const REC = 'rec_01J8ZC0000000000000000000A';
/**
 * A token that opens nothing anywhere, said so in the value itself.
 *
 * NOTHING IN THIS REPOSITORY MAY BE A MINTED CREDENTIAL, so this is not 32 random bytes: a real
 * inbound token is `randomBytes(32).toString('base64url')` written 0600 outside the tree
 * (`apps/selfhost/src/main.ts:333`), and a copy of one checked in is a copy that outlives its file.
 */
const TOKEN = 'not-a-secret-this-token-is-in-the-repo';
/** The SHA-256 of `TOKEN` in hex, written out rather than computed, so this test is not the code twice. */
const TOKEN_SHA = 'd29b6482d730378b56ccdf4d550e05de951ce467621438cf77839691ce091883';
const MESSAGE = 'From: alerts@bank.example\r\nSubject: Payment\r\n\r\nEGP 58.00 at a shop\r\n';
/** The SHA-256 of `MESSAGE`'s 68 bytes, likewise written out. */
const MESSAGE_SHA = '04f261f013eb828acd7042d0a546cf983561ff65703f6d74508192238d26e842';

type Seen = {
  looked: string[];
  knows: string[];
  arrives: [string, Omit<IngestArrival, 'rec' | 'ingest'>][];
  spends: { channel: string; key: string }[];
};

/**
 * A Cloud door whose Directory is three spies, so a test can assert the call that was NOT made.
 *
 * `wiring.index === false` IS A DEPLOYMENT WITH NO INDEX AT ALL, which is every deployment today.
 */
function mailDoor(
  wiring: { recordFor?: (hash: string) => string | null; knows?: (rec: string) => boolean; index?: boolean; wait?: number | null } = {},
): { door: ReturnType<typeof cloudIngest>; seen: Seen } {
  const seen: Seen = { looked: [], knows: [], arrives: [], spends: [] };
  const index: InboundIndex = {
    recordFor: (hash) => {
      seen.looked.push(hash);
      return Promise.resolve(wiring.recordFor ? wiring.recordFor(hash) : REC);
    },
  };
  const deps: CloudIngestDeps = {
    knows: (rec) => {
      seen.knows.push(rec);
      return Promise.resolve(wiring.knows ? wiring.knows(rec) : true);
    },
    verifies: () => Promise.resolve({ kind: 'none' }),
    arrives: (rec, arrival) => {
      seen.arrives.push([rec, arrival]);
      return Promise.resolve({ ok: true as const, value: { raw: 'raw_1' } });
    },
    spends: (ask) => {
      seen.spends.push(ask);
      return Promise.resolve(wiring.wait ?? null);
    },
    ...(wiring.index === false ? {} : { inbound: index }),
  };
  return { door: cloudIngest(deps), seen };
}

const mail = (token: string, body: string = MESSAGE): Request =>
  new Request(`https://app.brain.dog/in/email/${encodeURIComponent(token)}`, { method: 'POST', body });

test('A FORWARDED MESSAGE REACHES THE RECORD THE DIGEST NAMES, AND THE TOKEN ITSELF NEVER LEAVES THE DOOR', async () => {
  const { door, seen } = mailDoor();
  const res = await serveIngest(mail(TOKEN), door);

  assert.equal(res.status, 202);
  /* THE ANSWER CARRIES NOTHING, as it does for a webhook: a stranger holding a forwarding address
     cannot learn from it whether anything matched, or even which record they reached. */
  assert.equal(await res.text(), '');

  /* THE DIGEST AND NOT THE TOKEN, in the lookup and in the budget key both. The Directory's index is
     keyed on a value that opens nothing, so a copy of that table is not a set of mailbox keys. */
  assert.deepEqual(seen.looked, [TOKEN_SHA]);
  assert.deepEqual(seen.spends, [{ channel: 'email', key: TOKEN_SHA }]);

  const [rec, arrival] = seen.arrives[0] ?? [];
  assert.equal(rec, REC, 'the message did not go to the record the digest names');
  assert.equal(arrival?.channel, 'email');
  assert.equal(arrival?.body, MESSAGE, 'the whole message is the body, headers included');
  assert.equal(arrival?.sha256, MESSAGE_SHA);
  /* NOTHING VOUCHED FOR THIS FORWARD: no `Authentication-Results` hop passed for `bank.example`, so
     the row is stored and stays untriaged (`12 §3`). Storing it anyway is the point of the door. */
  assert.equal(arrival?.verified, false);

  /* AND THE TOKEN IS IN NOTHING THAT GETS KEPT. A raw row is kept for ever and read back by every
     `where:` over the arrival, so a credential written into one is a credential in every export. */
  assert.equal(JSON.stringify(arrival).includes(TOKEN), false, 'the inbound token was written into the stored row');
});

test('A DIGEST NOBODY REGISTERED IS A 404, AND IT COSTS NO OBJECT', async () => {
  const { door, seen } = mailDoor({ recordFor: () => null });
  const res = await serveIngest(mail('some-address-nobody-issued'), door);

  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.equal(seen.looked.length, 1, 'the index was not asked');
  assert.notEqual(seen.looked[0], 'some-address-nobody-issued', 'a guessed token was handed to the Directory in the clear');
  assert.deepEqual(seen.knows, [], 'an unresolved digest still cost a second Directory read');
  assert.deepEqual(seen.arrives, [], 'a guessed forwarding address reached a record');
});

test('WHATEVER THE INDEX ANSWERS IS CHECKED AS A SHAPE, AND THEN AS A RECORD THIS DEPLOYMENT STILL HOLDS', async () => {
  /* A ROW IN A TABLE IS NOT A RECORD ID. `idFromName` on a name nobody has CREATES the object, so an
     answer that is not the shape of an id must be refused before it is ever used as an address. */
  for (const bad of ['whatever', 'rec_short', '../directory', '']) {
    const { door, seen } = mailDoor({ recordFor: () => bad });
    const res = await serveIngest(mail(TOKEN), door);
    assert.equal(res.status, 404, bad);
    assert.deepEqual(seen.knows, [], `${bad} was handed on as an address`);
    assert.deepEqual(seen.arrives, [], `${bad} reached a record`);
  }

  /* AND A CLOSED RECORD TAKES NO MAIL. `knows` excludes a closed record, and closing one is not
     something this Worker can make the Directory remember to do to its inbound rows: the index and
     the closure are two writes, and the index is the one a deleted record's forwarder keeps using. */
  const { door, seen } = mailDoor({ knows: () => false });
  const res = await serveIngest(mail(TOKEN), door);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.deepEqual(seen.knows, [REC]);
  assert.deepEqual(seen.arrives, []);
});

test('A REPLAYED MESSAGE IS THE SAME 202 AND THE SAME DIGEST, and the record is what refuses to write it twice', async () => {
  const { door, seen } = mailDoor();
  const first = await serveIngest(mail(TOKEN), door);
  const again = await serveIngest(mail(TOKEN), door);

  /* THE DOOR MUST NOT ANSWER DIFFERENTLY THE SECOND TIME. `kernel.arrive` is idempotent on
     `(channel, sha256)` and answers `redelivered` to the record's own callers; saying so out here
     would tell whoever holds a forwarding address whether a given message had arrived before, which
     is a question about the record's contents asked with no credential. */
  assert.equal(first.status, 202);
  assert.equal(again.status, 202);
  assert.equal(await again.text(), '');

  assert.equal(seen.arrives.length, 2, 'the door swallowed a redelivery instead of handing it to the record');
  assert.equal(seen.arrives[0]?.[1].sha256, MESSAGE_SHA);
  assert.equal(seen.arrives[1]?.[1].sha256, MESSAGE_SHA, 'the two deliveries hashed differently, so the record cannot dedupe them');
  /* AND BOTH ARE CHARGED. A sender in a retry loop is exactly what the brake is for, and a
     redelivery that cost nothing would be a free way to hold the door open. */
  assert.equal(seen.spends.length, 2);
});

test('A MESSAGE OVER FIVE MEBIBYTES IS 413, AND THE RECORD NEVER SEES IT', async () => {
  const { door, seen } = mailDoor();
  /* `01 §5`'s ceiling plus one byte. A forwarded RFC 5322 body carries its attachments inline, which
     is why mail's ceiling is five mebibytes and a webhook's is one. */
  const res = await serveIngest(mail(TOKEN, 'x'.repeat(5_242_881)), door);

  assert.equal(res.status, 413);
  const body = (await res.json()) as { refusal: { code: string; at?: string } };
  assert.equal(body.refusal.code, 'BODY_MALFORMED');
  assert.equal(body.refusal.at, 'body');
  /* THE SIZE IS REFUSED AFTER THE DIGEST RESOLVED AND BEFORE THE RECORD IS ADDRESSED, so five
     mebibytes of a stranger's typing is never storage on anybody's record. */
  assert.deepEqual(seen.looked, [TOKEN_SHA]);
  assert.deepEqual(seen.arrives, []);
});

test('A SPENT BUDGET COSTS NO DIRECTORY READ AT ALL, which is what keeps a flood of invented addresses cheap', async () => {
  const { door, seen } = mailDoor({ wait: 41 });
  const res = await serveIngest(mail(TOKEN), door);

  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '41');
  assert.deepEqual(seen.looked, [], 'a rate-limited message still reached the Directory');
  assert.deepEqual(seen.arrives, []);
});

test('A DEPLOYMENT WITH NO INDEX TAKES NO MAIL AT ALL, and that is every deployment until the Directory has one', async () => {
  /* WHICH IS THE BEHAVIOUR THIS BUILD SHIPS. `index.ts` passes no `inbound`, so `serveIngest` sees a
     door without one and answers 404 for the whole `/in/email/*` surface, the way `/auth/provision`
     answers `off()` with no operator key set. The half above is finished and unreachable until the
     Directory can answer `recordFor`. */
  const { door, seen } = mailDoor({ index: false });
  /* THE KEY IS ABSENT AND NOT A METHOD ANSWERING `null`, and nothing below would notice the
     difference. Checked by mutation on 2026-09-20: replacing `cloudIngest`'s conditional spread
     with an `inbound` that is always present and answers `null` without an index left all ten of
     these tests green, because `serveIngest` branches on `door.inbound === undefined` before it
     branches on what `inbound` answers and the two branches happen to meet at the same 404. The
     assertion is here so that the day they stop meeting, this says which one was intended. */
  assert.equal(door.inbound, undefined, 'a deployment with no index still offers a mail lookup');
  const res = await serveIngest(mail(TOKEN), door);

  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.deepEqual(seen.knows, []);
  assert.deepEqual(seen.arrives, []);
});

test('ONLY A SHA-256 IN HEX IS EVER USED AS A LOOKUP KEY', async () => {
  /* ASKED OF THE DOOR DIRECTLY, because `serveIngest` always digests the path segment first and this
     guard is about the other callers of `IngestDoor.inbound`. What it costs is nothing; what it buys
     is that the one value this Worker hands the Directory as a key has a fixed 64-character shape,
     so a token passed through by mistake is refused rather than stored in somebody's query log. A
     real inbound token is 43 base64url characters and fails this test. */
  const { door, seen } = mailDoor();
  assert.ok(door.inbound, 'the Cloud door offers no mail lookup when the deployment has an index');
  for (const bad of [TOKEN, TOKEN_SHA.toUpperCase(), `${TOKEN_SHA}00`, TOKEN_SHA.slice(0, 63), ''])
    assert.equal(await door.inbound(bad), null, bad);
  assert.deepEqual(seen.looked, [], 'a value that is not a digest was used as a Directory lookup key');

  assert.equal(await door.inbound(TOKEN_SHA), REC);
  assert.deepEqual(seen.looked, [TOKEN_SHA]);
});
