/**
 * The Cloud's `/in/*` door: which record a stranger's POST reaches, and what it costs to guess.
 *
 * THE DECISION IS IN `route.ts` SO IT CAN BE TESTED AT ALL, for the reason `route.ts` is free of `cloudflare:`:
 * `src/index.ts` imports `cloudflare:workers` and cannot be loaded by `node --test`. What is asserted
 * here is the half that decides a tenant boundary with no credential in the request at all, so it is
 * written against four functions rather than against a Durable Object namespace.
 *
 * THE ORDER IS THE SUBJECT AND NOT A DETAIL. `serveIngest` asks the budget before the Directory and
 * the Directory before the object, and each of those tests below asserts the calls that did NOT
 * happen: an unauthenticated POST that reaches `idFromName` has already cost storage, because
 * `idFromName` on a name nobody has CREATES the object.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveIngest, type IngestArrival, type IngestVerify } from '@braindog/host';
import type { Result } from '@braindog/ports';

import { cloudIngest, ingestBudget, type CloudIngestDeps } from '../src/route.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const OTHER = 'rec_01J8ZC0000000000000000000B';
const BODY = '{"amount":5800}';
/** The SHA-256 of `BODY`, written out rather than derived, so the test is not the code twice. */
const BODY_SHA = '1062e3dbf4f1ba5b4ba77d3fd66d06eee9b53fa9c42f076e12ae65c5465e11ae';

type Seen = {
  knows: string[];
  verifies: [string, string][];
  arrives: [string, Omit<IngestArrival, 'rec' | 'ingest'>][];
  spends: { channel: string; key: string }[];
};

/** A door over four spies, so a test can assert the call that was not made as easily as the one that was. */
function doorWith(
  wiring: { knows?: (rec: string) => boolean; verify?: IngestVerify | null; arrive?: Result<unknown>; wait?: number | null } = {},
): { door: ReturnType<typeof cloudIngest>; seen: Seen } {
  const seen: Seen = { knows: [], verifies: [], arrives: [], spends: [] };
  const deps: CloudIngestDeps = {
    knows: (rec) => {
      seen.knows.push(rec);
      return Promise.resolve(wiring.knows ? wiring.knows(rec) : true);
    },
    verifies: (rec, ingest) => {
      seen.verifies.push([rec, ingest]);
      return Promise.resolve(wiring.verify === undefined ? { kind: 'none' } : wiring.verify);
    },
    arrives: (rec, arrival) => {
      seen.arrives.push([rec, arrival]);
      return Promise.resolve(wiring.arrive ?? { ok: true as const, value: { raw: 'raw_1' } });
    },
    spends: (ask) => {
      seen.spends.push(ask);
      return Promise.resolve(wiring.wait ?? null);
    },
  };
  return { door: cloudIngest(deps), seen };
}

const post = (path: string, init: RequestInit = {}): Request =>
  new Request(`https://app.brain.dog${path}`, { method: 'POST', body: BODY, ...init });

test('THE SELF-HOST’S WEBHOOK SHAPE NAMES NO RECORD, AND THIS WORKER SERVES EVERY RECORD', async () => {
  const { door, seen } = doorWith();
  const res = await serveIngest(post('/in/webhook/statements'), door);

  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  /* THE DIRECTORY IS NEVER ASKED, because there is nothing in the path to ask it about. Resolving
     this shape to the deployment's only-looking record is how one record's sender gets another
     record's inbox. */
  assert.deepEqual(seen.knows, []);
  assert.deepEqual(seen.arrives, []);
});

test('A RECORD ID IS CHECKED AS A SHAPE BEFORE IT IS EVER USED AS AN ADDRESS', async () => {
  /* `idFromName` ON A NAME NOBODY HAS CREATES THE OBJECT. Without the shape test, a POST to
     `/in/webhook/whatever/x/y` is an unauthenticated way to mint Durable Objects until the account
     runs out of storage, and nothing in the request carries a credential to refuse it by. */
  for (const bad of ['whatever', 'rec_short', 'rec_01J8ZC0000000000000000000A.secret', '../directory']) {
    const { door, seen } = doorWith();
    const res = await serveIngest(post(`/in/webhook/${encodeURIComponent(bad)}/statements/tok`), door);
    assert.equal(res.status, 404, bad);
    assert.deepEqual(seen.knows, [], `${bad} was handed to the Directory`);
  }

  /* AND A WELL-SHAPED ID THE DIRECTORY DOES NOT HOLD IS THE SAME 404, one Directory read later and
     no object. The two answers are identical on the wire, so the shape is not an oracle either. */
  const { door, seen } = doorWith({ knows: () => false });
  const res = await serveIngest(post(`/in/webhook/${OTHER}/statements/tok`), door);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.deepEqual(seen.knows, [OTHER]);
  assert.deepEqual(seen.verifies, []);
  assert.deepEqual(seen.arrives, []);
});

test('A DECLARED INGEST STORES THE BYTES ON THE RECORD THE PATH NAMES, AND SAYS NOTHING BACK', async () => {
  const { door, seen } = doorWith();
  const res = await serveIngest(post(`/in/webhook/${REC}/statements/tok_whatever`), door);

  assert.equal(res.status, 202);
  /* THE ANSWER CARRIES NOTHING. A stranger holding the URL cannot tell a pattern that matched from
     one that did not, which is what stops this door being a way to ask questions of the record. */
  assert.equal(await res.text(), '');

  const [rec, arrival] = seen.arrives[0] ?? [];
  assert.equal(rec, REC, 'the arrival did not go to the record the path names');
  assert.equal(arrival?.body, BODY);
  assert.equal(arrival?.sha256, BODY_SHA);
  assert.equal(arrival?.channel, 'webhook');
  /* NOTHING IN THIS BUILD CAN DECLARE A VERIFIER, so the record answers `{ kind: 'none' }` and the
     honest result of checking nothing is `false`: the row is stored and never matched (`12 §3`). */
  assert.equal(arrival?.verified, false);
  assert.deepEqual(seen.verifies, [[REC, 'statements']]);
});

test('AN UNDECLARED INGEST IS A 404 AND A DECLARED ONE IS A 202, which is the one thing a guess can learn', async () => {
  const { door } = doorWith({ verify: null });
  const res = await serveIngest(post(`/in/webhook/${REC}/not-a-declaration/tok`), door);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
});

test('A WRONG TOKEN IS STORED AND NOT REFUSED, and a right one is what makes the row eligible', async () => {
  /* NO DECLARATION IN THIS BUILD ANSWERS `path`, and this asserts the wiring for the day one does:
     the Cloud's URL carries the random segment (`33 §4`) and the door has to compare it. A wrong
     token is a row somebody can look at rather than a 403 nobody ever sees. */
  const verify: IngestVerify = { kind: 'path', token: 'tok_the_real_one' };

  const wrong = doorWith({ verify });
  const bad = await serveIngest(post(`/in/webhook/${REC}/statements/tok_a_guess`), wrong.door);
  assert.equal(bad.status, 202);
  assert.equal(wrong.seen.arrives[0]?.[1].verified, false);

  const right = doorWith({ verify });
  const good = await serveIngest(post(`/in/webhook/${REC}/statements/tok_the_real_one`), right.door);
  assert.equal(good.status, 202);
  assert.equal(right.seen.arrives[0]?.[1].verified, true);
});

test('A CREDENTIAL A SENDER PUT ON THE REQUEST BY MISTAKE IS NOT WHAT GETS STORED FOR EVER', async () => {
  const { door, seen } = doorWith();
  await serveIngest(
    post(`/in/webhook/${REC}/statements/tok`, {
      method: 'POST',
      body: BODY,
      headers: { authorization: 'Bearer rec_01J8ZC0000000000000000000A.secret', cookie: 'sid=abc', 'x-hub-signature-256': 'sha256=ff' },
    }),
    door,
  );

  const headers = seen.arrives[0]?.[1].headers ?? {};
  assert.equal(headers['authorization'], undefined, 'a bearer was written into the raw row every export carries');
  assert.equal(headers['cookie'], undefined);
  /* THE SIGNATURE STAYS. It is a proof over these exact bytes and is worth nothing once stored. */
  assert.equal(headers['x-hub-signature-256'], 'sha256=ff');
});

test('FORWARDED MAIL HAS NO DOOR ON THE CLOUD, AND THE WHOLE SURFACE SAYS SO', async () => {
  /* `49 §5.16`’s inbound token is a file on a self-host’s disk, and the Directory keeps no index
     of token digests, so there is nothing here to resolve one against. An absent `inbound` is how
     `serveIngest` answers 404 for the whole of `/in/email/*` rather than inventing a second way to
     name a record. */
  const { door, seen } = doorWith();
  const res = await serveIngest(post('/in/email/tok_inbound_example'), door);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.deepEqual(seen.knows, []);
  assert.deepEqual(seen.arrives, []);
});

test('A BUDGET THAT IS SPENT COSTS NEITHER A DIRECTORY READ NOR AN OBJECT', async () => {
  const { door, seen } = doorWith({ wait: 37 });
  const res = await serveIngest(post(`/in/webhook/${REC}/statements/tok`), door);

  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '37');
  assert.deepEqual(seen.spends, [{ channel: 'webhook', key: `${REC}/statements` }]);
  assert.deepEqual(seen.knows, [], 'a rate-limited arrival still reached the Directory');
  assert.deepEqual(seen.arrives, []);
});

test('ANYTHING BUT A POST IS 405, and a shape nobody serves is 404 before the method is looked at', async () => {
  const { door } = doorWith();
  const get = await serveIngest(new Request(`https://app.brain.dog/in/webhook/${REC}/statements/tok`), door);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');

  /* 405 IS A STATEMENT THAT THE RESOURCE EXISTS, so it must not be reachable at a shape no host
     serves: `/in/anything` would otherwise tell a scanner the prefix is in the build. */
  const stray = await serveIngest(new Request('https://app.brain.dog/in/anything'), door);
  assert.equal(stray.status, 404);
  assert.equal(stray.headers.get('allow'), null);
});

/* ── the budget itself ───────────────────────────────────────────────────── */

test('ONE PATH SPENDS ITS MINUTE AND THE NEXT PATH IS UNAFFECTED', () => {
  let at = 1_000_000;
  const spend = ingestBudget(() => at);
  const key = `webhook:${REC}/statements`;

  for (let i = 0; i < 120; i++) assert.equal(spend(key), null, `arrival ${i + 1} was refused inside the ceiling`);
  const wait = spend(key);
  assert.ok(typeof wait === 'number' && wait > 0 && wait <= 60, `the 121st arrival waits ${String(wait)}`);

  /* THE BUDGET IS PER PATH, so a flood at one ingest does not silence the bank that is configured
     on another. It is also why guessing ids is cheap: every guess is a fresh key, and the ceiling
     on the key table below is the only thing that slows an enumeration down. */
  assert.equal(spend(`webhook:${REC}/invoices`), null);

  /* AND THE WINDOW ENDS. A sender refused at 12:00:59 is through again at 12:01:00. */
  at += 60_001;
  assert.equal(spend(key), null);
});

test('THE WHOLE DOOR HAS A CEILING, because varying the path is how a per-path ceiling is evaded', () => {
  let at = 1_000_000;
  const spend = ingestBudget(() => at);
  let through = 0;

  /* MEASURED BEFORE THE DOOR CEILING EXISTED. Two hundred invented paths, each spending its own
     hundred and twenty, let 24,000 arrivals through one isolate in one minute, and every one of
     them costs a read of the Directory before it is refused: `knows` is what stops a made-up record
     id becoming an address, and the Directory is a single object the whole deployment signs in
     through. A per-path brake cannot see that, because the attacker chooses the path. */
  for (let round = 0; round < 120; round++)
    for (let i = 0; i < 200; i++) if (spend(`webhook:rec_01J8ZC0000000000000000000A/guess-${String(i)}`) === null) through++;

  assert.equal(through, 3_000, 'the arrival door let a flood of invented paths through to the Directory');

  /* AND THE WINDOW ENDS, so the ceiling is a brake and not a fuse somebody has to reset. */
  at += 60_001;
  assert.equal(spend('webhook:rec_01J8ZC0000000000000000000A/statements'), null);
});

test('THE KEY TABLE IS BOUNDED, AND A FULL ONE TURNS NOBODY AWAY: its oldest goes, as on the self-host', () => {
  const spend = ingestBudget(() => 1_000_000);
  const known = `webhook:${REC}/statements`;
  for (let i = 0; i < 121; i++) spend(known);
  assert.ok((spend(known) ?? 0) > 0, 'a path past its minute was let through');

  /* A FLOOD OF INVENTED IDS IS A MAP THAT GROWS UNTIL THE ISOLATE DIES, so the table holds a thousand: the first key in it
     has gone, which is how this reads that it was bounded, and only starts its count again. The door's ceiling holds. */
  for (let i = 0; i < 1_000; i++) spend(`webhook:${REC}/guess-${String(i)}`);
  assert.equal(spend(known), null, 'the table did not let its oldest go');
});

test('A THOUSAND MADE-UP PATHS DO NOT TURN A REAL SENDER AWAY, however quiet it has been', () => {
  let at = 1_000_000;
  const spend = ingestBudget(() => at);
  const real = `webhook:${REC}/statements`;
  assert.equal(spend(real), null);

  /* IT WAITED A WINDOW HERE, AND AGAIN THE WINDOW AFTER, while seventeen requests a second from anywhere held the table:
     a bank that sends twice an hour is not in it when it sends again, and a phone's Shortcut does not send a text twice. */
  at += 120_000;
  for (let i = 0; i < 1_200; i++) spend(`webhook:${OTHER}/guess-${String(i)}`);
  assert.equal(spend(real), null, 'a real door was told to wait because strangers filled the table');
});
