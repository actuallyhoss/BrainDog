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
import { sessionContext } from '@braindog/host/auth';
import type { CallContext } from '@braindog/record';
import { createDirectory, type Directory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

import { serveInbound, servesInbound, type InboundDoor } from '../src/inbound.ts';
import { cloudIngest, inward, servesApi, servesAuth, servesIn, servesMcp, type CloudIngestDeps, type InboundIndex } from '../src/route.ts';

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

  /* THE COOKIE IS NEVER READ FOR IT. `doorOf` is where a request
     acquires a principal, and an arrival is above that gate by design (`33 §4`): what stands in for
     a principal is whether the payload was verified, which decides only whether the stored row may
     match (`12 §3`). */
  assert.ok(at < SOURCE.indexOf('doorOf(request'), 'a cookie is read for a path that takes none');
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

/**
 * SEC1 (security review of 30 Oct): MAIL POSTED TO THE CLOUD'S HTTP DOOR IS STORED UNVERIFIED, WHATEVER IT SAYS. The
 * Cloud's mail comes in through Email Routing, whose handler checks DKIM itself and hands the verdict to `serveIngest`
 * beside the bytes (`email.ts`). Over HTTP the token is the only key, and a stranger holding it wrote
 * `Authentication-Results: x; dkim=pass header.d=bank.example` and had the bank pattern file their debit.
 */
test('SEC1: A POSTED MESSAGE WRITING ITS OWN dkim=pass, EVEN IN THIS HOST\'S NAME, IS STORED UNVERIFIED', async () => {
  for (const said of ['x', 'braindog']) {
    const { door, seen } = mailDoor();
    const forged = [`Authentication-Results: ${said}; dkim=pass header.d=bank.example`, 'From: Bank <alerts@bank.example>', 'Subject: You spent EGP 9,000.00', '', 'pay me'].join('\r\n');
    const res = await serveIngest(mail(TOKEN, forged), door);
    assert.equal(res.status, 202, 'a forgery is still stored, so the person can see it was tried');
    assert.equal(seen.arrives[0]?.[1].verified, false, `a line written by ${said} was believed`);
  }
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

/* ── where a token comes from at all ─────────────────────────────────────── */

/**
 * `POST /api/inbound/mint`: the one thing that can put a digest in the index above.
 *
 * THE DOOR AND THE INDEX WERE BOTH FINISHED AND NO ADDRESS EXISTED. Grepped on 2026-09-21 across
 * `apps/` and `packages/`: every caller of the Directory's `inbound$` was a test in this file, so
 * `dir_inbound` on the hosted Worker held only what tests wrote and `/in/email/<token>` answered 404
 * to every token in existence. `feefa3f4` closed the lookup and left the minting with no home, which
 * is a surface that reads as shipped in both halves and works for nobody.
 *
 * THE ORDER IS THE PROPERTY A UNIT TEST OF THE DOOR CANNOT SEE, so it is read out of the text of
 * `index.ts` here for the reason the head of this file gives. A mint needs a principal, so it is
 * decided AFTER `doorOf` rather than before it, which is the opposite of where `/in/*` sits.
 */
test('THE WORKER HAS A DOOR THAT MINTS AN ADDRESS, AND IT IS DECIDED AFTER THE PRINCIPAL IS', () => {
  assert.match(SOURCE, /serveInbound\(/u, 'index.ts wires no mint, so nothing on this deployment can put an address in the index');
  assert.match(SOURCE, /inbound\$\(/u, 'the Directory object exposes no writer, so a mint would have nothing to write through');

  const at = SOURCE.indexOf('servesInbound(url.pathname)');
  assert.ok(at > 0, 'route() does not branch on /api/inbound/*, so the mint is forwarded to the record as a method it does not have');
  /* A MINT IS THE OPPOSITE OF AN ARRIVAL. `/in/*` is answered above the auth gate because a bank
     carries no credential; this one answers only to a person a session names, so it is decided where
     that person is known. */
  assert.ok(at > SOURCE.indexOf('doorOf(request'), 'the mint is decided before anybody knows who is asking');

  /* AND IT IS A `/api/` PATH, which is what puts it after `doorOf` at all: a prefix this router does
     not claim falls through to the app shell, and a prefix outside `servesApi` is refused
     `ROUTE_UNKNOWN` before any door is asked. */
  assert.equal(servesApi('/api/inbound/mint'), true);
  assert.equal(servesIn('/api/inbound/mint'), false);
});

const ORIGIN = 'https://app.brain.dog';

/** The owner of the record `studio()` makes, as `doorOf` hands a session's context on. */
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_01J8ZC0000000000000000000B', level: 'owner' } };

type AskInit = { method?: string; origin?: string | null; bearer?: string };

const mintAsk = (which: string, init: AskInit = {}): Request =>
  new Request(`${ORIGIN}/api/inbound/${which}`, {
    method: init.method ?? 'POST',
    headers: {
      ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
      ...(init.bearer === undefined ? {} : { authorization: init.bearer }),
    },
  });

/**
 * The digest, COMPUTED here where every other token in this file has it written out.
 *
 * A MINTED TOKEN CANNOT BE WRITTEN OUT, which is the whole property under test: it is 32 bytes this
 * process has never seen before, so the only way to say "the index holds its digest and not the token"
 * is to digest what came back. The constants above stay written out for the tokens that are fixtures.
 */
const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The Cloud's mint over the real Directory, and every digest it was handed, in order. */
function mintDoor(d: Directory, record: string): { door: InboundDoor; wrote: (string | null)[] } {
  const wrote: (string | null)[] = [];
  return {
    door: {
      origins: new Set([ORIGIN]),
      registers: (hash) => {
        wrote.push(hash);
        return Promise.resolve(d.inbound$(record, hash));
      },
    },
    wrote,
  };
}

/** The token a mint answered, or an assertion naming what it answered instead. */
async function minted(res: Response): Promise<string> {
  assert.equal(res.status, 200, `the mint was refused: ${await res.clone().text()}`);
  const body = (await res.json()) as { ok: boolean; value: { token: string } };
  /* AND NOTHING ELSE IS IN THE ANSWER. The address is this origin plus `/in/email/<token>`, which the
     page that shows it builds for itself; a second field holding the same secret spelled as a URL is a
     second thing to keep out of a log. */
  assert.deepEqual(Object.keys(body.value), ['token']);
  return body.value.token;
}

test('THE TWO DOORS, AND THE PATHS THAT LOOK LIKE THEM ARE NOT THEM', () => {
  assert.equal(servesInbound('/api/inbound/mint'), 'mint');
  assert.equal(servesInbound('/api/inbound/revoke'), 'revoke');
  /* REPEATED AND TRAILING SLASHES ARE FORGIVEN, the way `servesKeys` forgives them: a path a page
     builds by joining a base and a route has `//` in it. */
  assert.equal(servesInbound('//api//inbound//mint//'), 'mint');

  /* AND THERE IS NO THIRD DOOR. A route that answered "what is my address" would have to hold the
     token to answer with, which is the one thing this surface is built not to keep. */
  for (const path of ['/api/inbound', '/api/inbound/', '/api/inbound/show', '/api/inbound/token', '/api/inbound/mint/again', '/api/inboundmint', '/api/keys/put'])
    assert.equal(servesInbound(path), null, path);
});

test('AN OWNER MINTS AN ADDRESS THAT TAKES MAIL AT ONCE, AND THE INDEX HOLDS ONLY ITS DIGEST', async () => {
  const { d, record, sql } = studio();
  const { door, wrote } = mintDoor(d, record);

  const res = await serveInbound(mintAsk('mint'), door, OWNER);
  const token = await minted(res);
  /* THE ANSWER CARRIES A LIVE CREDENTIAL, so it is one caller's and never a cache's: the path names no
     record, which makes it one address for every tenant on this deployment. */
  assert.equal(res.headers.get('cache-control'), 'no-store');

  /* THIRTY-TWO RANDOM BYTES, BASE64URL, WHICH IS THE SELF-HOST'S OWN VALUE. `init` writes
     `randomBytes(32).toString('base64url')`, and a person moving a record between the two hosts must
     not find that their bank's forwarding settings hold a shape the other host cannot serve. */
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u, 'a minted token is not 32 bytes of base64url');

  /* AND WHAT WENT TO THE DIRECTORY IS THE DIGEST AND NOTHING ELSE. Measured by mutation on
     2026-09-21: handing `registers` the token instead of its digest turns this mint into a 422, because
     `inbound$` refuses anything that is not 64 lower-case hex characters, and four tests in this
     section go red together. The guard in the Directory and the digest in the door are one rule
     asserted from both ends. */
  const hash = await sha256(token);
  assert.deepEqual(wrote, [hash]);
  assert.equal(d.recordFor(hash), record, 'the digest the mint wrote does not name the record it was minted for');

  /* THE TOKEN IS IN NO ROW OF THE TABLE, asserted over the whole of it rather than over the column
     this test already knows about: what makes the index safe to hold is that a copy of it opens
     nothing, and a second column added later carrying the token would be invisible to a narrower read. */
  const rows = JSON.stringify(sql.all('SELECT * FROM dir_inbound'));
  assert.equal(rows.includes(token), false, 'the token itself was written into the Directory');
  assert.equal(rows.includes(hash), true, 'the digest is not in the table this test just read');

  /* AND THE ADDRESS WORKS THE MOMENT IT IS ANSWERED, through the real reader and the real mail door.
     This is the loop that was open: the door could resolve a digest and nothing could
     put one there, so both halves were finished and no forwarded message had ever arrived. */
  const { door: arrival, seen } = overDirectory(d);
  const delivered = await serveIngest(mail(token), arrival);
  assert.equal(delivered.status, 202);
  assert.equal(seen.arrives[0]?.[0], record, 'a message to the minted address reached no record or the wrong one');
  assert.equal(seen.arrives[0]?.[1].channel, 'email');
});

test('ROTATION IS MINTING AGAIN, AND THE ADDRESS IT REPLACES STOPS TAKING MAIL IN THAT SAME WRITE', async () => {
  const { d, record } = studio();
  const { door } = mintDoor(d, record);

  const first = await minted(await serveInbound(mintAsk('mint'), door, OWNER));
  const second = await minted(await serveInbound(mintAsk('mint'), door, OWNER));
  assert.notEqual(first, second, 'two mints answered the same token, so the bytes are not random');

  /* ONE RECORD HOLDS ONE ADDRESS. `inbound$` deletes the asking record's row before it inserts, so
     there is no rotation that leaves both live: a forwarding address is handed to third parties by
     definition, and the answer to a leaked one is a new one rather than a second one. */
  const { door: arrival } = overDirectory(d);
  assert.equal((await serveIngest(mail(first), arrival)).status, 404, 'the rotated address still takes mail, so rotating revokes nothing');
  assert.equal((await serveIngest(mail(second), arrival)).status, 202);
  assert.equal(d.recordFor(await sha256(first)), null);
});

test('REVOCATION WRITES `null`, AND A RECORD WITH NO ADDRESS TAKES NO MAIL AT ALL', async () => {
  const { d, record } = studio();
  const { door, wrote } = mintDoor(d, record);
  const token = await minted(await serveInbound(mintAsk('mint'), door, OWNER));
  const { door: arrival } = overDirectory(d);
  assert.equal((await serveIngest(mail(token), arrival)).status, 202);

  const gone = await serveInbound(mintAsk('revoke'), door, OWNER);
  assert.equal(gone.status, 200);
  /* AND IT ANSWERS NO VALUE, because there is nothing to show: the point of revoking is that the
     address is gone, and a body echoing what was taken away would be the token again. */
  assert.deepEqual(await gone.json(), { ok: true, value: null });
  assert.equal(wrote[wrote.length - 1], null, 'revocation wrote something other than `null`');

  assert.equal((await serveIngest(mail(token), arrival)).status, 404, 'a revoked address still takes mail');
  /* AND REVOKING AGAIN IS THE SAME ANSWER. `rm` on the self-host is idempotent and this has to be too:
     an owner who clicks twice is not somebody to show a refusal to. */
  assert.equal((await serveInbound(mintAsk('revoke'), door, OWNER)).status, 200);
});

/**
 * WHOEVER CAN MOVE THIS ADDRESS CAN REDIRECT A RECORD'S BANK MAIL, which is why the ladder here is the
 * keychain's rather than ADMIN's. Every case below is a refusal that must also be a write that did not
 * happen, so `wrote` is asserted empty at the end rather than per case: a door that refused and wrote
 * anyway would have rotated an address on its way to saying no.
 *
 * CHECKED BY MUTATION ON 2026-09-21, twice, because a ladder nobody watched fail is a ladder nobody
 * has. With the owner check replaced by `false` this test fails and the other twenty-two in the file
 * pass; with the origin check replaced by `false` the same thing happens. Both mutants are silent
 * everywhere else, which is what makes this the only test standing between a `read` colleague and the
 * address a record's bank statements arrive at.
 */
test('NOTHING BUT AN OWNER, IN A BROWSER, ON A PAGE OF THIS HOST, MINTS ONE', async () => {
  const { d, record } = studio();
  const { door, wrote } = mintDoor(d, record);
  const refusalOf = async (res: Response): Promise<{ code: string; at?: string }> => {
    const body = (await res.json()) as { refusal: { code: string; at?: string } };
    return body.refusal;
  };

  /* A METHOD THAT IS NOT A POST, BEFORE ANYTHING ELSE IS READ. */
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await serveInbound(mintAsk('mint', { method }), door, OWNER);
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'POST', method);
  }

  /* A BEARER OF ANY KIND, AND THE HEADER IS WHAT IS REFUSED RATHER THAN THE PRINCIPAL BEHIND IT: on a
     self-host the server key makes the owner, and it would pass every check under this one. */
  const bearer = await serveInbound(mintAsk('mint', { bearer: 'Bearer rec_01J8ZC0000000000000000000A.not-a-secret' }), door, OWNER);
  assert.equal(bearer.status, 403);
  assert.equal((await refusalOf(bearer)).code, 'NEEDS_BROWSER_SESSION');

  /* A REQUEST THAT IS NOT A PAGE OF THIS HOST. Every browser sends `Origin` on a POST, so none is not
     a page, and another origin is what a session cookie must never be allowed to serve (`12 §8`). */
  for (const origin of [null, 'https://evil.example', 'https://app.brain.dog.evil.example', '']) {
    const res = await serveInbound(mintAsk('mint', { origin }), door, OWNER);
    assert.equal(res.status, 403, String(origin));
    assert.equal((await refusalOf(res)).at, 'origin', String(origin));
  }

  /* EVERY RUNG BELOW THE TOP ONE, AND A COLLEAGUE AT `decide` IS STILL NOT AN OWNER. */
  for (const level of ['read', 'append', 'write', 'decide', null] as const) {
    const res = await serveInbound(mintAsk('mint'), door, { principal: { kind: 'person', id: 'p_01J8ZC0000000000000000000C', level } });
    assert.equal(res.status, 403, String(level));
    assert.equal((await refusalOf(res)).code, 'LEVEL_REQUIRED', String(level));
  }

  /* AND A TOKEN PRINCIPAL AT `owner` IS NOT A PERSON. A bearer never reaches this door on this Worker,
     which is exactly why the check is written against the principal as well as against the header. */
  const agent = await serveInbound(mintAsk('mint'), door, {
    principal: { kind: 'token', id: 'tk_1', scope: 'write', person: 'p_01J8ZC0000000000000000000B', level: 'owner' },
  });
  assert.equal(agent.status, 403);

  /* AND A PRINCIPAL NOBODY AUTHENTICATED. `createToken` and `invite` refuse `credentialed === false`
     for the same reason: an uncredentialed owner is a self-host on loopback, and a forwarding address
     works from anywhere for as long as it is registered. */
  const loopback = await serveInbound(mintAsk('mint'), door, { ...OWNER, credentialed: false });
  assert.equal(loopback.status, 403);
  assert.equal((await refusalOf(loopback)).code, 'NEEDS_BROWSER_SESSION');

  /* A PATH THIS DOOR DOES NOT SERVE IS A 404 AND NOT A 405, so a scanner cannot tell which subpaths
     exist by their `allow` header. */
  assert.equal((await serveInbound(mintAsk('show'), door, OWNER)).status, 404);

  assert.deepEqual(wrote, [], 'a refused call wrote to the Directory on its way to refusing');
  assert.equal(d.recordFor('0'.repeat(64)), null);
});

test('A WRITE THE DIRECTORY REFUSES IS NOT AN ADDRESS ANYBODY WAS SHOWN', async () => {
  const { d, record } = studio();
  const { door } = mintDoor(d, record);
  value(d.close(record));

  /* A CLOSED RECORD TAKES NO ADDRESS, and the refusal is the Directory's own sentence at the status
     every other route gives it. Answering a token whose digest was refused would hand somebody an
     address to paste into their bank and a door that answers 404 for ever after. */
  const res = await serveInbound(mintAsk('mint'), door, OWNER);
  assert.equal(res.status, 422);
  const body = (await res.text()) as string;
  assert.equal(JSON.parse(body).refusal.code, 'OUT_OF_BOUNDS');
  assert.equal(/[A-Za-z0-9_-]{43}/u.test(JSON.parse(body).refusal.fix ?? ''), false, 'the refusal quoted something token-shaped back');
  assert.equal(body.includes('token'), false, 'a refused mint answered a token anyway');
});

/**
 * THE RUNG EVERY OTHER SECRET-HANDING DOOR IN THIS TREE HAS, AND THIS ONE DID NOT.
 *
 * `packages/record/src/index.ts` asks for a proof under fifteen minutes old in four places, and all four
 * are doors whose answer the browser that asked cannot take back: the keychain gate at `:1068` and
 * `deviceApprove` at `:3717` hand out something that then works from anywhere, and `restore` at `:3862`
 * and `deleteRecord` at `:3914` throw away what nobody can put back. Each spends a
 * sentence on the same reason, and the keychain's is the shortest: a cookie is thirty days of standing
 * access, and the keychain is the one place a laptop left open on a desk should not be enough. A forwarding
 * address is that kind of answer twice over. Minting one hands out a live credential, and minting again
 * is how the previous one is revoked, so a stranger at somebody's open laptop could both take the mail
 * and stop it arriving without ever proving they are the owner.
 *
 * SO THE SHAPE IS COPIED AND NOT INVENTED: `provedAt` absent passes, older than fifteen minutes is
 * `NEEDS_BROWSER_SESSION` at `proof`, and it is decided after the owner check so that somebody who is
 * not an owner is told that instead. The one difference is the clock, which is `Date.now()` here rather
 * than an injected one, for the reason the constant's comment in `inbound.ts` gives.
 *
 * BOTH DOORS, BECAUSE BOTH ARE LOSSES. Revoking is the half that makes a bank's mail silently stop
 * arriving, and a door that asked for a proof to mint and not to revoke would be a door where the
 * damaging call is the cheap one.
 *
 * WATCHED FAIL FIRST AND THEN BY MUTATION, on 2026-09-21. Written against the door as it stood, this test
 * failed with `200 !== 403` at the mint, which is a stale owner minting a live mail address. With the line
 * in place and its condition prefixed `false &&`, it fails there again and `EVERY ANSWER THE MINT DOOR
 * GIVES` fails on the sixth status it expects, while the other 173 tests in this package pass.
 */
test('A PROOF OLDER THAN FIFTEEN MINUTES MINTS NOTHING AND REVOKES NOTHING', async () => {
  const { d, record } = studio();
  const { door, wrote } = mintDoor(d, record);
  const refusalOf = async (res: Response): Promise<{ code: string; at?: string }> => ((await res.json()) as { refusal: { code: string; at?: string } }).refusal;

  /* FIFTEEN MINUTES AND A MILLISECOND, and the boundary itself is deliberately not asserted: the door
     reads its own `Date.now()` after this line runs, so a proof stamped exactly fifteen minutes ago is a
     coin toss about how long the two statements took and a test nobody can trust when it fails. */
  const stale = { ...OWNER, provedAt: Date.now() - 15 * 60_000 - 1 };
  for (const which of ['mint', 'revoke']) {
    const res = await serveInbound(mintAsk(which), door, stale);
    assert.equal(res.status, 403, which);
    const said = await refusalOf(res);
    assert.equal(said.code, 'NEEDS_BROWSER_SESSION', which);
    assert.equal(said.at, 'proof', which);
  }
  /* AND NEITHER REFUSAL WAS A WRITE. A stale proof that rotated the address on its way to saying no
     would have revoked a working one, which is the one outcome worse than minting. */
  assert.deepEqual(wrote, [], 'a stale proof reached the Directory');

  /* AND A COLLEAGUE WITH A STALE PROOF IS TOLD THE LEVEL AND NOT THE PROOF, which is the whole of what
     the check's POSITION decides, and the one claim the paragraph above this test made without testing:
     measured by lifting the line above the level check, with this assertion not yet
     written, and all 26 tests in the file stayed green while a `decide` colleague was sent off to sign
     in again for a door that signing in again does not open. `LEVEL_REQUIRED` is the remedy they
     actually have, which is to ask an owner. With the assertion here that mutation fails on this line. */
  const colleague = await serveInbound(mintAsk('mint'), door, {
    principal: { kind: 'person', id: 'p_01J8ZC0000000000000000000C', level: 'decide' },
    provedAt: 0,
  });
  assert.equal(colleague.status, 403);
  assert.equal((await refusalOf(colleague)).code, 'LEVEL_REQUIRED', 'the proof is decided before the level, so a colleague is told to prove something that will not help');
  assert.equal(d.recordFor('0'.repeat(64)), null);

  /* A PROOF FROM A MINUTE AGO IS A PERSON WHO IS STILL THERE. */
  const fresh = await serveInbound(mintAsk('mint'), door, { ...OWNER, provedAt: Date.now() - 60_000 });
  assert.equal(fresh.status, 200, 'a proof a minute old was refused, so the window is not fifteen minutes');

  /* AND A CONTEXT THAT CARRIES NO PROOF AT ALL STILL MINTS, which is the kernel's own `!== undefined`
     rather than a looser reading of it: `provedAt` is set only from a session row, so absent is a host
     that cannot say when anybody proved anything, and refusing it here would close the door on a caller
     `credentialed` already covers. Every other test in this section is that case. */
  assert.equal((await serveInbound(mintAsk('mint'), door, OWNER)).status, 200);

  /* AND THE GATE IS NOT DEAD CODE ON THE HOSTED WORKER, which is the half a test of the door alone cannot
     see: a check against a field nothing ever sets refuses nobody, and every case above sets it by hand.
     So the context is built by the function the Worker itself builds one with. `doorOf` answers a session
     door with `sessionContext(out.body, held)` (`session.ts:67`), whose only source for `provedAt` is the
     session row's `authed_at`, which rotation never moves. */
  const session = sessionContext({ person: 'p_01J8ZC0000000000000000000B', email: 'ada@example.com', record, provedAt: 1 }, { level: 'owner', registers: null, levels: {} });
  assert.equal(session.provedAt, 1, 'a session context carries no proof, so the door above refuses nobody');
  assert.equal((await serveInbound(mintAsk('mint'), door, session as CallContext)).status, 403, 'a session last proved in 1970 minted an address');
});

/**
 * `nostore.test.ts` STATES THIS RULE FOR THE WHOLE WORKER AND CAN SEE ONE FILE OF IT.
 *
 * That test reads `src/index.ts` by name and asserts that every `new Response` in it carries
 * `cache-control`, because `33 §4` asks for `no-store` on all of `/api/*` and `route()` hands back what it
 * is given. `/api/inbound/*` is answered in a second file, which that test cannot see and its own comment
 * does not know exists, so the rule reached this door by nobody checking. It matters more here than
 * anywhere else it holds: the body of a 200 is the only copy of a live credential, the path names no
 * record, and a shared cache keyed on it would hand one person's forwarding address to the next.
 *
 * DRIVEN AT EVERY STATUS RATHER THAN READ, because what the rule is about is the answers and not the
 * source: reading the text proves one constructor sets a header, and a branch that returned a bare
 * `Response` somewhere else would read as fine. The text is then checked for the one thing driving cannot
 * show, that there is a single place in the file where a `Response` is made at all.
 */
test('EVERY ANSWER THE MINT DOOR GIVES CARRIES no-store, AT EVERY STATUS IT HAS', async () => {
  const { d, record } = studio();
  const { door } = mintDoor(d, record);
  const reader: CallContext = { principal: { kind: 'person', id: 'p_01J8ZC0000000000000000000C', level: 'read' } };

  const answers = [
    await serveInbound(mintAsk('show'), door, OWNER),
    await serveInbound(mintAsk('mint', { method: 'GET' }), door, OWNER),
    await serveInbound(mintAsk('mint', { bearer: 'Bearer rec_01J8ZC0000000000000000000A.not-a-secret' }), door, OWNER),
    await serveInbound(mintAsk('mint', { origin: 'https://evil.example' }), door, OWNER),
    await serveInbound(mintAsk('mint'), door, reader),
    await serveInbound(mintAsk('mint'), door, { ...OWNER, provedAt: 0 }),
    await serveInbound(mintAsk('revoke'), door, OWNER),
    await serveInbound(mintAsk('mint'), door, OWNER),
  ];
  /* THE LIST IS ASSERTED AS WELL AS THE HEADERS. A refusal that moved would otherwise quietly leave one
     of these eight cases unvisited and the loop below would keep passing over seven. */
  assert.deepEqual(
    answers.map((r) => r.status),
    [404, 405, 403, 403, 403, 403, 200, 200],
  );

  /* AND THE 422, WHICH NEEDS A RECORD THE DIRECTORY REFUSES and therefore its own directory: closing the
     one above would leave every case after it refused for the wrong reason. */
  const closed = studio();
  value(closed.d.close(closed.record));
  answers.push(await serveInbound(mintAsk('mint'), mintDoor(closed.d, closed.record).door, OWNER));
  assert.equal(answers[answers.length - 1]?.status, 422);

  for (const res of answers) {
    assert.equal(res.headers.get('cache-control'), 'no-store', `${res.status} is cacheable`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', String(res.status));
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8', String(res.status));
  }

  /* AND ONE PLACE IN THE FILE MAKES A `Response` AT ALL, which is what makes one list of headers cover
     every answer above and the ones nobody has written yet. `nostore.test.ts` asserts the same property
     of `index.ts` by naming its `json` helper. */
  const src = readFileSync(fileURLToPath(new URL('../src/inbound.ts', import.meta.url)), 'utf8');
  assert.equal([...src.matchAll(/new Response\(/gu)].length, 1, 'inbound.ts builds a Response outside reply(), where the headers above do not reach');
});

/* ── the loop, through the only surface a deployed Worker has ─────────────── */

/**
 * The methods `Directory$` declares, read out of the class in `index.ts`.
 *
 * A STUB CAN CALL WHAT THE CLASS DECLARES AND NOTHING ELSE, which is the single fact that kept this
 * surface at 404 with both halves of it finished and green. `createDirectory` had `recordFor` and
 * `inbound$`; `Directory$` passed on only the first; a `Directory` is reachable from nowhere but inside
 * its own Durable Object. Every test above this line that held a `Directory` in its hand stepped over the
 * boundary production has to cross, which is how 203 lines of new test passed over a shut door.
 *
 * IT IS A NARROWER SET THAN THE DIRECTORY'S, AND THE ASSERTIONS SAY SO. `person$`, `provision`, `claimed`
 * and `bad` are real methods of `createDirectory` that this class keeps to itself, each one reached only
 * from inside `prepare` and `nameRecord`, so a set holding any of them would be the wrong object read and
 * every conclusion below it worthless. `resolve` is deliberately not in that list: the class does pass
 * that one on, which is why a guess at what a Durable Object exposes is no substitute for reading it.
 */
function stubSurface(): ReadonlySet<string> {
  const from = SOURCE.indexOf('export class Directory$');
  /* THE CLOSING BRACE IN COLUMN ONE, AND THE LINE ENDING IS NOT ASSUMED. A checkout with CRLF endings
     matched no `\n}\n` at all and failed as "no Directory$ class", which is a sentence about the wrong
     thing: measured by rewriting the file through a tool that translates newlines. */
  const to = from + (/\r?\n\}\r?\n/u.exec(SOURCE.slice(from))?.index ?? -1);
  assert.ok(from > 0, 'index.ts declares no Directory$ class, so this read the wrong file');
  assert.ok(to > from, 'the Directory$ class has no closing brace in column one, so this read past the end of it');
  /* AT ONE INDENT AND NOWHERE ELSE. A method of the class is two spaces in; a name matched deeper would be
     a call inside a body, which is the opposite of what a stub can reach. */
  const names = new Set([...SOURCE.slice(from, to).matchAll(/^ {2}(?:async )?([A-Za-z][\w$]*)\(/gmu)].map((m) => m[1] as string));
  names.delete('constructor');
  assert.ok(names.size > 8, `Directory$ declares ${names.size} methods, so the class body was not read`);
  for (const absent of ['person$', 'provision', 'claimed', 'bad'])
    assert.equal(names.has(absent), false, `${absent} reads as a method of Directory$, so this is not that class`);
  return names;
}

/**
 * A stub over `Directory$`: what the class declares, and a throw for what it does not.
 *
 * WHAT THE PLATFORM DOES WITH A CALL THE CLASS HAS NOT GOT IS `is not a function`, and `nameRecord`'s own
 * comment in `index.ts` records this tree paying for it once already: `name` was the stub's own property,
 * so every `/auth/provision` made a record, answered 500, and left the Directory naming nothing. So a name
 * outside the set throws here instead of reaching the real object.
 *
 * AND THE CLASS'S RETURN SHAPES AND NOT THE DIRECTORY'S. `Directory$.inbound$` unwraps the `Result` into
 * `Refusal | null` before it crosses the boundary, so a test wired to the `Result` would be driving a
 * shape no deployment ever sees.
 */
function asStub(
  d: Directory,
  surface: ReadonlySet<string>,
): { knows(rec: string): boolean; recordFor(hash: string): string | null; inbound$(rec: string, hash: string | null): Refusal | null } {
  const over = <T>(method: string, f: () => T): T => {
    if (!surface.has(method)) throw new TypeError(`directory.${method} is not a function: Directory$ declares no ${method}`);
    return f();
  };
  return {
    knows: (rec) => over('knows', () => d.knows(rec)),
    recordFor: (hash) => over('recordFor', () => d.recordFor(hash)),
    inbound$: (rec, hash) =>
      over('inbound$', () => {
        const out = d.inbound$(rec, hash);
        return out.ok ? null : refused(out);
      }),
  };
}

/**
 * Mint, then post a forwarded message to the address that came back, over nothing but RPC.
 *
 * THIS IS THE LOOP THAT WAS OPEN, and the reason it stayed open through two commits that each closed half
 * of it: the door could resolve a digest, the Directory could store one, the mint could ask for one, and
 * the one call that joined them was not on the class. Measured before the fix: state A, the
 * only state a deployed Worker could be in, was 404 with no row and `recordFor` answering `null` for every
 * digest for ever.
 *
 * MEASURED BY MUTATION ON 2026-09-21. With `inbound$` deleted from `Directory$` the mint below dies on
 * `Directory$ declares no inbound$`, which is the bare 500 a hosted mint would have answered, and the
 * whole rest of this file stays green: `THE WORKER HAS A DOOR THAT MINTS AN ADDRESS` keeps passing,
 * because the `inbound$(` it greps for is the CALL in `mailAddress` and not the method on the class.
 */
test('AN ADDRESS MINTED OVER THE RPC SURFACE A DEPLOYED WORKER HAS TAKES MAIL AT ONCE', async () => {
  const surface = stubSurface();
  const { d, record } = studio();
  const directory = asStub(d, surface);

  /* THE MINT'S HALF, WIRED AS `mailAddress` WIRES IT: the record is the one the session resolved to, and
     the `Refusal | null` the class answers becomes the `Result` this door speaks in. */
  const door: InboundDoor = {
    origins: new Set([ORIGIN]),
    registers: async (hash) => {
      const stop = await directory.inbound$(record, hash);
      return stop === null ? { ok: true as const, value: null } : { ok: false as const, refusal: stop };
    },
  };
  const token = await minted(await serveInbound(mintAsk('mint'), door, OWNER));

  /* AND THE ARRIVAL'S, WIRED AS `arrivals` WIRES IT: `recordFor` and then `knows`, two calls to the same
     object, and no other part of the Directory reachable from here at all. */
  const { door: arrival, seen } = mailDoor({ recordFor: (h) => directory.recordFor(h), knows: (r) => directory.knows(r) });
  const delivered = await serveIngest(mail(token), arrival);

  assert.equal(delivered.status, 202, 'a message to an address minted over RPC reached nothing');
  assert.equal(await delivered.text(), '');
  assert.equal(seen.looked[0], await sha256(token), 'the door looked up something other than the digest of the address it was given');
  assert.equal(seen.arrives[0]?.[0], record, 'the message reached no record or the wrong one');
  assert.equal(seen.arrives[0]?.[1].channel, 'email');
  assert.equal(seen.arrives[0]?.[1].body, MESSAGE, 'the whole message is the body, headers included');

  /* AND REVOKING OVER THE SAME SURFACE SHUTS IT AGAIN, which is the other write the class had to carry. */
  assert.equal((await serveInbound(mintAsk('revoke'), door, OWNER)).status, 200);
  assert.equal((await serveIngest(mail(token), arrival)).status, 404, 'a revoked address still takes mail through the real surface');

  /* THE FACADE IS LOAD-BEARING, asserted rather than assumed: a method the class does not declare throws
     the way the platform throws at a stub, and that throw is what the 404 above was made of. */
  assert.throws(() => asStub(d, new Set(['knows'])).inbound$(record, TOKEN_SHA), /Directory\$ declares no inbound\$/u);
});

/* ── the context the record is told ──────────────────────────────────────── */

/* THESE TWO WERE IN `demo.test.ts`, which went with the public demo. They were never
   about the demo: `inward` is how every door hands the record its caller, and `Record$.fetch` reads the header it writes
   as the whole of who is asking, so a caller who could set it would be whoever they said. */
test('A CONTEXT THE CALLER SENT IS OVERWRITTEN, NOT TRUSTED, and the bearer goes no further', () => {
  const forged = new Request('https://brain.dog/api/listGrants', {
    headers: {
      'x-braindog-ctx': JSON.stringify({ principal: { kind: 'person', id: 'p_owner', level: 'owner' } }),
      authorization: 'Bearer rec_x.y',
    },
  });
  const decided: CallContext = { principal: { kind: 'person', id: 'p_reader', level: 'read' }, credentialed: true };
  const inner = inward(forged, decided);
  assert.deepEqual(JSON.parse(inner.headers.get('x-braindog-ctx') ?? 'null'), decided);
  assert.equal(inner.headers.get('authorization'), null);
  assert.equal(new URL(inner.url).pathname, '/api/listGrants', 'the path did not travel unchanged');
});

test('AND THE WORKER SETS THE CONTEXT IN ONE PLACE, for every door', () => {
  /* A SECOND PLACE THAT SET IT is a second chance to set it after something the caller controls. */
  assert.doesNotMatch(SOURCE, /headers\.set\(\s*'x-braindog-ctx'/u, 'index.ts sets the context itself again');
  /* FIVE DOORS NOW: a session, the owner opening a shared link (whose answer the Worker signs), a shared link reading its
     page, a bearer on `/api` and a bearer on `/mcp`, and each reaches the record through `inward`. There were four while
     the public demo was a door. A count that drops means a door stopped going through it, and one that rises means a
     door nobody listed here. */
  assert.equal((SOURCE.match(/inward\(request, /gu) ?? []).length, 5, 'a door does not go through inward');
  /* AND THE DOOR IS DECIDED BEFORE THE BEARER IS READ, in `session.ts`. */
  assert.ok(SOURCE.includes('doorOf(request'), 'index.ts no longer asks session.ts which door');
  assert.ok(SOURCE.indexOf('doorOf(request') < SOURCE.indexOf("bearerOf(request, 'api'"), 'the door is not decided before the bearer is read');
});
