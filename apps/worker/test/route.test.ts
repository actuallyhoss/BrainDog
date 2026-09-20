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

import type { Refusal, Result } from '@braindog/ports';
import { serveIngest, type IngestArrival } from '@braindog/host';
import { createDirectory, type Directory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

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
 * THE INDEX IS A SPY IN THE CASES ABOVE AND THE REAL DIRECTORY IN THE ONES BELOW THEM. `InboundIndex`
 * is the narrow shape the Worker needs, and a double is what lets a test assert the call that was NOT
 * made: that a rate-limited message never reached the Directory, that an unresolved digest cost no
 * second read. The last section drives `createDirectory`'s own `dir_inbound` through the same door,
 * because a shape both halves agree with and neither implements is how this surface spent a week
 * answering 404 with both halves called finished.
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
 * `wiring.index === false` IS A DEPLOYMENT WITH NO INDEX AT ALL, which is a shape `CloudIngestDeps`
 * still allows and no longer describes the Cloud: `arrivals(env)` passes one as of 2026-09-21, and the
 * test named for that key is what holds it there.
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

test('A DEPLOYMENT WITH NO INDEX TAKES NO MAIL AT ALL, AND THE CLOUD IS NO LONGER ONE OF THOSE', async () => {
  /* THE SHAPE IS STILL A REAL ONE AND THE CLOUD NO LONGER HAS IT. `cloudIngest` spreads no `inbound`
     when its deps carry no index, and `serveIngest` then answers 404 for the whole `/in/email/*`
     surface, the way `/auth/provision` answers `off()` with no operator key set. This test pinned
     that as the Cloud's own behaviour until 2026-09-21, because `arrivals(env)` in `index.ts` passed
     four keys and no `inbound`: measured against the hosted Worker, every `POST /in/email/<token>`
     was 404 with the dispatch and the whole door above it finished. The assertion below is what now
     keeps the wiring and this refusal from being the same sentence again. */
  assert.match(
    SOURCE,
    /inbound:\s*\{\s*recordFor:/u,
    'arrivals(env) passes no `inbound`, so the hosted Worker answers 404 to every forwarded message',
  );

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

/* ── the Directory's own index, under the same door ──────────────────────── */

/**
 * `dir_inbound`, driven through `cloudIngest` and `serveIngest` rather than called directly.
 *
 * THE SPY ABOVE CANNOT CATCH THE FAULT THAT KEPT THIS SURFACE AT 404. Every test above this line
 * passed while the hosted Worker answered 404 to every forwarded message, because each one supplied
 * its own index and the deployment supplied none. What is exercised below is the real reader over
 * real SQLite, behind the real door, so "the digest resolves" and "the record it resolves to is the
 * one somebody registered" are the same assertion rather than two halves nobody joined.
 *
 * IT IS `node:sqlite` AND THE DURABLE OBJECT RUNS THE SAME SQLITE, which is what makes the schema
 * decision below evidence rather than an opinion: the table is created by `SCHEMA` on every open and
 * by no migration step, and the test that drops it and reopens is the one that says whether that is
 * true for a directory that already exists.
 */

const NOW = Date.UTC(2026, 8, 21, 9);
/** A second token, in the repository for the same reason the first one is: it opens nothing. */
const OTHER = 'not-a-secret-either-the-second-token';
/** The SHA-256 of `OTHER`, written out rather than computed. */
const OTHER_SHA = '1b381c1ae489876b0751fb805a98057bbb17476b472940d69d38b1424d372c76';

const value = <T>(r: Result<T>): T => {
  if (r.ok) return r.value;
  return assert.fail('refusal' in r ? `${r.refusal.code}: ${r.refusal.fix}` : 'the write conflicted');
};

const refused = (r: Result<unknown>): Refusal => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { ok: false; refusal: Refusal }).refusal;
};

/** One record in a fresh directory, and the `Sql` under it, so a test can take the table away again. */
function studio(): { d: Directory; record: string; sql: ReturnType<typeof openSqlite> } {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW));
  value(d.person$('ada@example.com', 'Ada'));
  return { d, record: value(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record, sql };
}

/**
 * The Cloud's door with the Directory itself behind it.
 *
 * THE TWO SPIES STAY, because what they record is the shape of the call and not its answer: `arrivals`
 * asks `recordFor` and then `knows` over two RPCs to the same object, and the lists are how a test says
 * which of the two refused. Both now answer out of `createDirectory`.
 */
const overDirectory = (d: Directory) => mailDoor({ recordFor: (h) => d.recordFor(h), knows: (r) => d.knows(r) });

test('A DIGEST THE DIRECTORY HOLDS IS AN ADDRESS, AND IT NAMES THE RECORD SOMEBODY REGISTERED IT FOR', async () => {
  const { d, record } = studio();
  value(d.inbound$(record, TOKEN_SHA));

  const { door, seen } = overDirectory(d);
  const res = await serveIngest(mail(TOKEN), door);

  assert.equal(res.status, 202);
  assert.equal(await res.text(), '');
  assert.deepEqual(seen.looked, [TOKEN_SHA]);
  assert.equal(seen.arrives[0]?.[0], record, 'the message went to a record nobody registered this address for');
  assert.equal(seen.arrives[0]?.[1].channel, 'email');

  /* AND A DIGEST NOBODY REGISTERED IS NOTHING, asked of the reader directly: 64 hex characters are a
     well-formed key and a well-formed key is not a row. */
  assert.equal(d.recordFor('0'.repeat(64)), null);
});

test('THE DIRECTORY REFUSES TO HOLD ANYTHING THAT WOULD OPEN THE DOOR', () => {
  const { d, record } = studio();

  /* THE TOKEN ITSELF IS THE ONE VALUE THIS TABLE MUST NEVER CONTAIN. A real inbound token is 43
     base64url characters and every shape below fails the digest test, so the mistake that would turn
     the index into a set of mailbox keys is a refusal with a sentence rather than a row. */
  for (const bad of [TOKEN, OTHER, TOKEN_SHA.toUpperCase(), `${TOKEN_SHA}00`, TOKEN_SHA.slice(0, 63), ''])
    assert.equal(refused(d.inbound$(record, bad)).code, 'VALUE_MALFORMED', bad);
  assert.equal(d.recordFor(TOKEN_SHA), null, 'a refused registration wrote a row anyway');

  /* AND A RECORD THAT IS NOT OPEN TAKES NO ADDRESS. Registering one for a closed record would put a
     live forwarding address in the index for storage nobody can reach. */
  assert.equal(refused(d.inbound$('rec_01J8ZC0000000000000000000A', TOKEN_SHA)).at, 'record');
  value(d.close(record));
  assert.equal(refused(d.inbound$(record, TOKEN_SHA)).code, 'OUT_OF_BOUNDS');
});

test('ROTATION REPLACES AND REVOCATION EMPTIES, which is `write the file` and `rm` on the self-host', async () => {
  const { d, record } = studio();
  value(d.inbound$(record, TOKEN_SHA));
  value(d.inbound$(record, OTHER_SHA));

  /* THE OLD ADDRESS STOPS WORKING AT THE MOMENT THE NEW ONE IS WRITTEN, and that is the whole point
     of rotating: a forwarding address is handed to third parties by definition, so the answer to a
     leaked one is a new one rather than two live ones. */
  assert.equal(d.recordFor(TOKEN_SHA), null, 'the rotated address still resolves, so rotation revokes nothing');
  assert.equal(d.recordFor(OTHER_SHA), record);
  const { door } = overDirectory(d);
  assert.equal((await serveIngest(mail(TOKEN), door)).status, 404);
  assert.equal((await serveIngest(mail(OTHER), door)).status, 202);

  /* AND `null` IS THE DELETION, which is what a record that takes no mail at all looks like. */
  value(d.inbound$(record, null));
  assert.equal(d.recordFor(OTHER_SHA), null);
  assert.equal((await serveIngest(mail(OTHER), door)).status, 404);
});

test('ONE DIGEST IS ONE ADDRESS, AND THE SECOND RECORD TO ASK FOR IT IS REFUSED RATHER THAN THROWN AT', () => {
  const { d, record } = studio();
  const second = value(d.provision({ slug: 'the-other-studio', email: 'ada@example.com' })).record;
  value(d.inbound$(record, TOKEN_SHA));
  value(d.inbound$(second, OTHER_SHA));

  /* THE COLLISION GUARD IS LOAD-BEARING AND NOTHING WAS WATCHING IT. `token_sha256` is the primary
     key and `inbound$` deletes only the asking record's own row, so the INSERT below is the one place
     a caller can reach a `SQLITE_CONSTRAINT`. Measured by mutation on 2026-09-21: with the
     `ALREADY_KNOWN` branch disabled, this call throws `UNIQUE constraint failed:
     dir_inbound.token_sha256` out of a function whose whole contract is a `Result`, which across the
     Directory's RPC boundary is a bare 500, and every other test in this file passed against that
     mutant. Two minted tokens do not collide, so the only way here is a caller handing one digest
     twice. */
  assert.equal(refused(d.inbound$(second, TOKEN_SHA)).code, 'ALREADY_KNOWN');

  /* AND THE REFUSAL COST NEITHER RECORD THE ADDRESS IT HELD, which is what "every refusal happens
     before the first write" has to mean: the asking record's `DELETE` runs after this check, so a
     check moved below it would revoke a working address in order to report that nothing happened. */
  assert.equal(d.recordFor(TOKEN_SHA), record);
  assert.equal(d.recordFor(OTHER_SHA), second, 'the refused call revoked the address the asking record already held');
});

test('A CLOSED RECORD TAKES NO MAIL, AND THE READER IS WHERE THAT IS DECIDED', async () => {
  const { d, record } = studio();
  value(d.inbound$(record, TOKEN_SHA));
  value(d.close(record));

  /* CLOSING DOES NOT DELETE THE ROW AND DOES NOT NEED TO. `resolve` and `slugOf` in the same file
     both join `dir_record` rather than trusting `close` to have swept, after two of four readers
     were found not doing it; this reader is the fifth and joins for the same reason. */
  assert.equal(d.recordFor(TOKEN_SHA), null);

  const { door, seen } = overDirectory(d);
  assert.equal((await serveIngest(mail(TOKEN), door)).status, 404);
  assert.deepEqual(seen.knows, [], 'the reader let a closed record through and only `knows` caught it');
  assert.deepEqual(seen.arrives, []);
});

test('THE TABLE ARRIVES ON A DIRECTORY THAT ALREADY EXISTS, WITH NO MIGRATION STEP AND NO VERSION BUMP', async () => {
  const { d, record, sql } = studio();

  /* A DIRECTORY WRITTEN BEFORE TODAY, MADE BY TAKING THE TABLE AWAY. Every `TO_n` in `directory.ts`
     exists because `CREATE TABLE IF NOT EXISTS` cannot add a COLUMN to a table that is already
     there; a table that is not there at all is exactly what that statement is for, and this is the
     difference asserted rather than assumed. If it were wrong, `dir_inbound` would exist only in
     directories created after the deploy and every record that predated it would keep answering 404. */
  sql.exec('DROP TABLE dir_inbound');
  assert.equal(sql.one("SELECT name FROM sqlite_master WHERE name = 'dir_inbound'"), undefined);

  const reopened = createDirectory(sql, fixedClock(NOW));
  value(reopened.inbound$(record, TOKEN_SHA));
  assert.equal(reopened.recordFor(TOKEN_SHA), record);
  /* AND THE ROW THAT SAYS WHICH BUILD WROTE THIS DIRECTORY DID NOT MOVE. A bump would refuse this
     directory to every older build for a table no older build reads. */
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'")?.value, '4');

  const { door } = overDirectory(d);
  assert.equal((await serveIngest(mail(TOKEN), door)).status, 202);
});
