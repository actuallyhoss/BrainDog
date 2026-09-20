/**
 * `/in/*`: the order it refuses in, what it stores, and what it never says back.
 *
 * THE ONE PROPERTY WORTH MORE THAN THE REST IS THAT AN ARRIVAL NOBODY UNDERSTANDS IS STILL STORED.
 * The predecessor drops an SMS no pattern matched, silently, and "why did that not come through"
 * has no answer there. So the wrong-token case and the nothing-verifies case are asserted to CALL
 * `arrive`, not to refuse, and the assertions below are about `verified` rather than about whether
 * the row was written at all.
 *
 * AND THE SECOND IS THAT THE ANSWER CARRIES NOTHING. A stranger holding a URL learns the same thing
 * from a payload that matched as from one that did not: 202 and an empty body.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serveIngest, servesIngest, type IngestArrival, type IngestDoor } from '../src/index.ts';

const HOST = 'https://in.example';

/** The path token a record would mint. Any text does: the door says what it expects. */
const TOKEN = 'tk_9f3c1a2b4d5e6f708192a3b4c5d6e7f8';

type Seen = {
  arrivals: IngestArrival[];
  verifies: { rec?: string; ingest: string }[];
  limits: { channel: string; key: string }[];
  inbounds: string[];
};

type Wiring = {
  verify?: IngestDoor['verify'];
  inbound?: IngestDoor['inbound'];
  limit?: IngestDoor['limit'];
  arrive?: IngestDoor['arrive'];
};

function door(wiring: Wiring = {}): { door: IngestDoor; saw: Seen } {
  const saw: Seen = { arrivals: [], verifies: [], limits: [], inbounds: [] };
  const d: IngestDoor = {
    verify: async (ask) => {
      saw.verifies.push(ask);
      return wiring.verify ? wiring.verify(ask) : { kind: 'path' as const, token: TOKEN };
    },
    arrive: async (arrival) => {
      saw.arrivals.push(arrival);
      return wiring.arrive ? wiring.arrive(arrival) : { ok: true as const, value: { raw: 'raw_1' } };
    },
    limit: async (ask) => {
      saw.limits.push(ask);
      return wiring.limit ? wiring.limit(ask) : null;
    },
    ...(wiring.inbound
      ? {
          inbound: async (hash: string) => {
            saw.inbounds.push(hash);
            return wiring.inbound?.(hash) ?? null;
          },
        }
      : {}),
  };
  return { door: d, saw };
}

type Init = { method?: string; body?: string | Uint8Array; headers?: Record<string, string> };

const ask = (path: string, init: Init = {}): Request => {
  const method = init.method ?? 'POST';
  return new Request(`${HOST}${path}`, {
    method,
    headers: init.headers ?? {},
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: init.body ?? 'hello' }),
  });
};

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (text: string): Promise<string> => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

async function hmac(key: Uint8Array, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', Uint8Array.from(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
}

/* ── the paths ───────────────────────────────────────────────────────────── */

test('the three shapes, and nothing else', () => {
  assert.deepEqual(servesIngest('/in/webhook/ingest_sms'), { channel: 'webhook', ingest: 'ingest_sms' });
  assert.deepEqual(servesIngest('/in/webhook/rec_1/ingest_sms/tok'), {
    channel: 'webhook',
    rec: 'rec_1',
    ingest: 'ingest_sms',
    token: 'tok',
  });
  assert.deepEqual(servesIngest('/in/email/tok'), { channel: 'email', token: 'tok' });
  /* The repeated slashes `servesKeys` already forgives, forgiven the same way. */
  assert.deepEqual(servesIngest('//in//email//tok/'), { channel: 'email', token: 'tok' });
  for (const path of ['/in', '/in/', '/in/webhook', '/in/webhook/', '/in/email', '/in/sms/x', '/in/webhook/a/b', '/in/webhook/a/b/c/d', '/api/list'])
    assert.equal(servesIngest(path), null, path);
});

test('a percent escape that does not decode is not a path', () => {
  assert.equal(servesIngest('/in/email/%ZZ'), null);
  assert.deepEqual(servesIngest('/in/email/a%20b'), { channel: 'email', token: 'a b' });
});

/* ── the ladder ──────────────────────────────────────────────────────────── */

test('A POST, AND ANY OTHER METHOD IS 405 BEFORE THE DOOR IS TOUCHED', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook/rec_1/ingest_sms/tok', { method: 'GET' }), d);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  assert.equal(saw.verifies.length, 0);
  assert.equal(saw.arrivals.length, 0);
});

test('a host that wires no ingest door answers 404 with nothing in it', async () => {
  const res = await serveIngest(ask('/in/webhook/ingest_sms'), undefined);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
});

test('a path this route does not serve is 404 with nothing in it', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook'), d);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.equal(saw.limits.length, 0);
});

test('an ingest nobody declared is 404, and nothing is stored', async () => {
  const { door: d, saw } = door({ verify: async () => null });
  const res = await serveIngest(ask('/in/webhook/rec_1/ghost/tok'), d);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.deepEqual(saw.verifies, [{ rec: 'rec_1', ingest: 'ghost' }]);
  assert.equal(saw.arrivals.length, 0);
});

test('THE BUDGET IS ASKED BEFORE THE BODY IS READ, and a refused one is 429 with the seconds', async () => {
  const { door: d, saw } = door({ limit: async () => 30 });
  const res = await serveIngest(ask('/in/webhook/rec_1/ingest_sms/tok'), d);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '30');
  const body = (await res.json()) as { ok: boolean; refusal: { code: string; retry_after: number } };
  assert.equal(body.refusal.code, 'RATE_LIMITED');
  assert.equal(body.refusal.retry_after, 30);
  assert.deepEqual(saw.limits, [{ channel: 'webhook', key: 'rec_1/ingest_sms' }]);
  assert.equal(saw.verifies.length, 0);
  assert.equal(saw.arrivals.length, 0);
});

test('a body over a mebibyte is 413 and is not stored', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'x'.repeat(1_048_577) }), d);
  assert.equal(res.status, 413);
  assert.equal(saw.arrivals.length, 0);
});

test('a declared content-length over the ceiling is refused before a byte is read', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook/ingest_sms', { headers: { 'content-length': '99999999' } }), d);
  assert.equal(res.status, 413);
  assert.equal(saw.arrivals.length, 0);
});

/* ── what is stored ──────────────────────────────────────────────────────── */

test('the right path token is verified, stored, and answered with nothing', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask(`/in/webhook/rec_1/ingest_sms/${TOKEN}`, { body: 'hello' }), d);
  assert.equal(res.status, 202);
  assert.equal(await res.text(), '');
  assert.equal(saw.arrivals.length, 1);
  const arrival = saw.arrivals[0]!;
  assert.equal(arrival.verified, true);
  assert.equal(arrival.channel, 'webhook');
  assert.equal(arrival.ingest, 'ingest_sms');
  assert.equal(arrival.rec, 'rec_1');
  assert.equal(arrival.body, 'hello');
  assert.equal(arrival.sha256, await sha256('hello'));
});

test('THE WRONG TOKEN IS STILL STORED, UNVERIFIED, AND THE ANSWER IS THE SAME', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook/rec_1/ingest_sms/not-the-token', { body: 'hello' }), d);
  assert.equal(res.status, 202);
  assert.equal(await res.text(), '');
  assert.equal(saw.arrivals.length, 1);
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.body, 'hello');
});

test('a token in the path where the declaration wants none is not a verification', async () => {
  const { door: d, saw } = door({ verify: async () => ({ kind: 'hmac_sha256', header: 'x-signature', key: new Uint8Array([1, 2, 3]) }) });
  const res = await serveIngest(ask(`/in/webhook/rec_1/ingest_sms/${TOKEN}`, { body: 'hello' }), d);
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.verified, false);
});

test('the named header carrying the right HMAC verifies, and one byte off does not', async () => {
  const key = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const wiring: Wiring = { verify: async () => ({ kind: 'hmac_sha256' as const, header: 'X-Signature', key }) };
  const signature = await hmac(key, 'hello');

  const right = door(wiring);
  const ok = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'hello', headers: { 'x-signature': signature } }), right.door);
  assert.equal(ok.status, 202);
  assert.equal(right.saw.arrivals[0]?.verified, true);

  /* `sha256=` IS HOW EVERY SENDER THIS WILL MEET WRITES IT, so the prefix is taken and the rest compared. */
  const prefixed = door(wiring);
  const withPrefix = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'hello', headers: { 'x-signature': `sha256=${signature}` } }), prefixed.door);
  assert.equal(withPrefix.status, 202);
  assert.equal(prefixed.saw.arrivals[0]?.verified, true);

  const wrong = door(wiring);
  const bad = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'hello', headers: { 'x-signature': signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a') } }), wrong.door);
  assert.equal(bad.status, 202);
  assert.equal(wrong.saw.arrivals[0]?.verified, false);

  const absent = door(wiring);
  const none = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'hello' }), absent.door);
  assert.equal(none.status, 202);
  assert.equal(absent.saw.arrivals[0]?.verified, false);
});

test('A CREDENTIAL A SENDER SENT BY MISTAKE IS NOT KEPT FOREVER', async () => {
  const { door: d, saw } = door();
  await serveIngest(
    ask('/in/webhook/ingest_sms', {
      body: 'hello',
      headers: { authorization: 'Bearer secret', cookie: 'bd_s=secret', 'x-signature': 'abc', 'X-Sender': 'Vodafone' },
    }),
    d,
  );
  const headers = saw.arrivals[0]?.headers ?? {};
  assert.equal(Object.hasOwn(headers, 'authorization'), false);
  assert.equal(Object.hasOwn(headers, 'cookie'), false);
  assert.equal(headers['x-signature'], 'abc');
  /* Lower-cased, because a header's case is a fact about a sender and not about the arrival. */
  assert.equal(headers['x-sender'], 'Vodafone');
});

test('a record that cannot take the arrival is 503, and says nothing of its own', async () => {
  const { door: d } = door({
    arrive: async () => ({ ok: false as const, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'every owner of rec_1 is suspended for non-payment' } }),
  });
  const res = await serveIngest(ask('/in/webhook/ingest_sms'), d);
  assert.equal(res.status, 503);
  const body = (await res.json()) as { refusal: { code: string; fix: string } };
  assert.equal(body.refusal.code, 'RECORD_UNAVAILABLE');
  assert.equal(body.refusal.fix.includes('suspended'), false);
});

test('a door that throws is 503 and not an open socket', async () => {
  const { door: d } = door({
    arrive: () => {
      throw new Error('the database is on fire');
    },
  });
  const res = await serveIngest(ask('/in/webhook/ingest_sms'), d);
  assert.equal(res.status, 503);
  assert.equal((await res.text()).includes('fire'), false);
});

/* ── forwarded mail ──────────────────────────────────────────────────────── */

const MESSAGE = [
  'Received: from mx.example (mx.example [203.0.113.4])',
  '\tby fwd.example with ESMTPS id abc123',
  'Authentication-Results: fwd.example;',
  ' dkim=pass header.i=@bank.example; spf=fail smtp.mailfrom=bank.example',
  'From: Bank <alerts@bank.example>',
  'To: sam@in.brain.dog',
  'Subject: You spent EGP 420.00',
  '',
  'Card 1234 debited EGP 420.00 at BEANS COFFEE on 29/08/2026',
].join('\r\n');

test('a host that takes no forwarded mail answers the mail path 404', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/email/tok', { body: MESSAGE }), d);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), '');
  assert.equal(saw.arrivals.length, 0);
});

test('an inbound token nobody minted is 404, and the token is never handed over in the clear', async () => {
  const { door: d, saw } = door({ inbound: async () => null });
  const res = await serveIngest(ask('/in/email/tok', { body: MESSAGE }), d);
  assert.equal(res.status, 404);
  assert.deepEqual(saw.inbounds, [await sha256('tok')]);
  assert.equal(saw.arrivals.length, 0);
});

test('a forwarded message is split into its headers and its body, and dkim=pass makes it eligible', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const res = await serveIngest(ask('/in/email/tok', { body: MESSAGE }), d);
  assert.equal(res.status, 202);
  assert.equal(await res.text(), '');
  const arrival = saw.arrivals[0]!;
  assert.equal(arrival.channel, 'email');
  assert.equal(arrival.rec, 'rec_1');
  assert.equal(arrival.verified, true);
  assert.equal(arrival.headers.from, 'Bank <alerts@bank.example>');
  assert.equal(arrival.headers.subject, 'You spent EGP 420.00');
  /* Unfolded: the `Authentication-Results` of a forwarder runs over two lines and means one thing. */
  assert.equal(arrival.headers['authentication-results']?.includes('dkim=pass'), true);
  assert.equal(arrival.headers['authentication-results']?.includes('spf=fail'), true);
  /* THE WHOLE MESSAGE IS THE BODY, headers included: `sha256` is over the bytes as they arrived. */
  assert.equal(arrival.body, MESSAGE);
  assert.equal(arrival.sha256, await sha256(MESSAGE));
});

test('NO AUTHENTICATION-RESULTS IS QUARANTINED RATHER THAN REFUSED', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const plain = ['From: Bank <alerts@bank.example>', 'Subject: hi', '', 'body'].join('\r\n');
  const res = await serveIngest(ask('/in/email/tok', { body: plain }), d);
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.body, plain);
});

test('a forwarder that passed SPF and not DKIM is eligible too', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = ['Authentication-Results: fwd.example; dkim=none; spf=pass', 'Subject: hi', '', 'body'].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d);
  assert.equal(saw.arrivals[0]?.verified, true);
});

test('a message with no blank line is all headers and no body, and is still stored', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const res = await serveIngest(ask('/in/email/tok', { body: 'Subject: nothing follows' }), d);
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.headers.subject, 'nothing follows');
});

test('a repeated header keeps every hop', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = ['Received: one', 'Received: two', '', 'body'].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d);
  assert.equal(saw.arrivals[0]?.headers.received, 'one, two');
});

test('mail is budgeted on the digest of its token and not on the token', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1', limit: async () => 5 });
  const res = await serveIngest(ask('/in/email/tok', { body: MESSAGE }), d);
  assert.equal(res.status, 429);
  assert.deepEqual(saw.limits, [{ channel: 'email', key: await sha256('tok') }]);
  assert.equal(saw.inbounds.length, 0);
});

test('a forwarded message over five mebibytes is 413', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const res = await serveIngest(ask('/in/email/tok', { body: 'x'.repeat(5_242_881) }), d);
  assert.equal(res.status, 413);
  assert.equal(saw.arrivals.length, 0);
});

/**
 * ONLY THE TOP `Authentication-Results` IS THE FORWARDER'S, AND THE REST ARE A STRANGER'S TYPING.
 * Measured on 2026-09-20 against the first cut of this file: a message carrying its own
 * `Authentication-Results: whatever; dkim=pass` under a forwarder line that said `dkim=fail; spf=fail`
 * was stored with `verified: true`, because every hop was joined into one value and the eligibility
 * test was a substring search over the join. `12 §3` makes that flag the difference between a row that
 * is matched and one that sits untriaged, so the hole was: anyone who knows the address a record
 * forwards from could have had a fake bank alert triaged as a real one. The join stays, because the
 * record wants every hop in the row; the eligibility test now reads the first one only.
 */
test('A SENDER CANNOT WRITE ITS OWN Authentication-Results AND BE BELIEVED', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const forged = [
    'Received: from evil.example (evil.example [198.51.100.9])',
    '\tby fwd.example with ESMTPS id zzz',
    'Authentication-Results: fwd.example; dkim=fail header.i=@bank.example; spf=fail smtp.mailfrom=evil.example',
    'Authentication-Results: anything-the-sender-typed; dkim=pass',
    'From: Bank <alerts@bank.example>',
    'Subject: You spent EGP 9000.00',
    '',
    'pay me',
  ].join('\r\n');
  const res = await serveIngest(ask('/in/email/tok', { body: forged }), d);
  /* Still stored, because that is this route's whole rule, and still readable by an owner. */
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.headers['authentication-results']?.includes('dkim=pass'), true);
});

test('the top forwarder passing is still believed when a lower hop failed', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.i=@bank.example',
    'Authentication-Results: relay.example; dkim=fail; spf=fail',
    'Subject: hi',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d);
  assert.equal(saw.arrivals[0]?.verified, true);
});

/**
 * A HOST THAT WIRED NO DOOR HAS NO SURFACE, AND 405 IS A SURFACE. The first cut answered `GET /in/...`
 * with 405 and `allow: POST` whether or not a door existed, which told a scanner that this build has a
 * POST endpoint there and the operator simply has not turned it on. The method is now checked after the
 * door, so a host with no ingest wiring answers 404 to every method, the way it does to `/api/nothing`.
 */
test('a host with no door answers 404 to every method, not 405', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await serveIngest(ask('/in/webhook/ingest_sms', { method }), undefined);
    assert.equal(res.status, 404, method);
    assert.equal(res.headers.get('allow'), null, method);
  }
});

/**
 * THE SELF-HOST SHAPE CARRIES NO TOKEN, so an ingest declared with `verify: path` on a host that serves
 * `/in/webhook/<ingest>` can never be eligible. That is pinned here rather than fixed, because the fix
 * belongs to whoever writes the declaration reader: a self-host declaration wanting a path token has
 * nowhere to put it, and the honest answer for the route is the same as `kind: 'none'`.
 */
test('a path verification on the shape with no token in it stores an unverified row', async () => {
  const { door: d, saw } = door();
  const res = await serveIngest(ask('/in/webhook/ingest_sms', { body: 'hello' }), d);
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.verified, false);
});
