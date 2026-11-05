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

import { serveIngest, servesIngest, type IngestArrival, type IngestDoor, type MailStamp } from '../src/index.ts';
import { keyed, published, sign } from './dkim-sign.ts';

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
  dkim?: IngestDoor['dkim'];
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
    ...(wiring.dkim ? { dkim: wiring.dkim } : {}),
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

test('the four shapes, and nothing else', () => {
  assert.deepEqual(servesIngest('/in/webhook/ingest_sms'), { channel: 'webhook', ingest: 'ingest_sms' });
  assert.deepEqual(servesIngest('/in/webhook/rec_1/ingest_sms/tok'), {
    channel: 'webhook',
    rec: 'rec_1',
    ingest: 'ingest_sms',
    token: 'tok',
  });
  /* A signed door on the Cloud: the record and the ingest, and no token, because the signature is the proof. */
  assert.deepEqual(servesIngest('/in/webhook/rec_1/ingest_sms'), { channel: 'webhook', rec: 'rec_1', ingest: 'ingest_sms' });
  assert.deepEqual(servesIngest('/in/email/tok'), { channel: 'email', token: 'tok' });
  /* The repeated slashes `servesKeys` already forgives, forgiven the same way. */
  assert.deepEqual(servesIngest('//in//email//tok/'), { channel: 'email', token: 'tok' });
  for (const path of ['/in', '/in/', '/in/webhook', '/in/webhook/', '/in/email', '/in/sms/x', '/in/email/a/b', '/in/webhook/a/b/c/d', '/api/list'])
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
  'To: studio@in.brain.dog',
  'Subject: You spent EGP 420.00',
  '',
  'Card 1234 debited EGP 420.00 at BEANS COFFEE on 29/08/2026',
].join('\r\n');

/**
 * The verdict a checking host would hand over beside these bytes, read off the fixture's top line.
 *
 * THE ALIGNMENT CASES BELOW ARE ABOUT WHAT A VERDICT MEANS, NOT WHO WROTE IT, so they hand the verdict over as the Email
 * Routing handler does (`serveIngest`'s third argument). Who may write one is the SEC1 cases' question, further down:
 * a line in the bytes posted over HTTP is believed by nobody.
 */
function stampOf(message: string): MailStamp | undefined {
  const lines = message.split('\r\n');
  const at = lines.findIndex((line) => /^authentication-results:/i.test(line));
  if (at === -1) return undefined;
  let verdict = lines[at]!.slice(lines[at]!.indexOf(':') + 1).trim();
  for (let i = at + 1; i < lines.length && /^[ \t]/.test(lines[i]!); i++) verdict += ` ${lines[i]!.trim()}`;
  return { verdict };
}

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
  const res = await serveIngest(ask('/in/email/tok', { body: MESSAGE }), d, stampOf(MESSAGE));
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

test('a forwarder that passed SPF on the From domain and not DKIM is eligible too', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=none; spf=pass smtp.mailfrom=alerts@bank.example',
    'From: Bank <alerts@bank.example>',
    'Subject: hi',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, true);
});

/**
 * SPF AUTHENTICATES THE ENVELOPE AND A FORWARDER REWRITES THE ENVELOPE, so an `spf=pass` on a
 * forwarded message is very often the forwarder vouching for its own bounce address. That is not a
 * statement about the `From:` a person reads, and it is exactly the shape a stranger gets for free:
 * send from your own domain, let the forwarder rewrite the envelope to itself, put the bank's
 * address on the `From:` line. The result is `pass` and it belongs to nobody the record trusts.
 */
test('and an SPF pass belonging to the forwarder is not a pass for the From it carries', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=none; spf=pass smtp.mailfrom=srs0=abc@fwd.example',
    'From: Bank <alerts@bank.example>',
    'Subject: hi',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
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
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
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
 * Measured against the first cut of this file: a message carrying its own
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
  const res = await serveIngest(ask('/in/email/tok', { body: forged }), d, stampOf(forged));
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
    'From: Bank <alerts@bank.example>',
    'Subject: hi',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, true);
});

/* ── whose signature was it ──────────────────────────────────────────────── */

/**
 * THE FORGERY AFTER THE `Authentication-Results` ONE, and the reason the check above stopped being a
 * substring search. Reading only the top hop stops a sender writing its own verdict; it does not stop
 * a sender EARNING one. DKIM says "the holder of the key for `header.d` signed these bytes" and says
 * nothing whatever about the `From:` line, so a stranger who owns `evil.example`, signs with it
 * perfectly correctly, and writes `From: alerts@bank.example` collects a real `dkim=pass` from the
 * forwarder. Measured end to end against the self-host with this exact shape: the
 * message was stored `matched`, extracted, and written into the register as a bank debit of the
 * attacker's amount at the attacker's merchant. A verdict now counts only where the identity it
 * authenticated aligns with the From domain, which is DMARC's question and not DKIM's.
 */
test('A REAL SIGNATURE BY THE WRONG DOMAIN IS NOT A PASS FOR THIS From', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const forged = [
    'Authentication-Results: fwd.example; dkim=pass header.d=evil.example; spf=fail',
    'From: Bank <alerts@bank.example>',
    'Subject: You spent EGP 9000.00',
    '',
    'pay me',
  ].join('\r\n');
  const res = await serveIngest(ask('/in/email/tok', { body: forged }), d, stampOf(forged));
  assert.equal(res.status, 202, 'a forgery must still be stored, or nobody can see it was tried');
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.body, forged);
});

/**
 * THE SAME FORGERY WITH THE BANK'S ADDRESS MOVED INTO THE DISPLAY NAME, which the alignment check
 * above does not see at all. It reads the address a mail client would deliver to, and the record's
 * `match:` reads the whole `From:` line as text, so the two are asking about different strings.
 * Measured end to end on 2026-09-20 against the self-host with alignment already in place: a
 * message signed correctly by `evil.example`, carrying
 * `From: "alerts@hsbc.example" <bot@evil.example>`, aligned (the delivered address really is
 * `evil.example`), and a pattern written `from contains "alerts@hsbc.example"` then matched it,
 * extracted it, and wrote EGP 9,999.00 at a merchant the attacker chose into the register. That is
 * the forgery the alignment repair was for, arriving through the half of the line it did not read.
 */
test('AND A BANK ADDRESS HIDDEN IN THE DISPLAY NAME IS STILL AN ADDRESS THIS VERDICT DOES NOT COVER', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const forged = [
    'Authentication-Results: fwd.example; dkim=pass header.d=evil.example',
    'From: "alerts@bank.example" <bot@evil.example>',
    '',
    'pay me',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: forged }), d, stampOf(forged));
  assert.equal(saw.arrivals[0]?.verified, false);
});

test('and the same address spelled in a comment is read the same way', async () => {
  /* `From: bot@evil.example (alerts@bank.example)` is the comment form of the line above, and a
     split that stops at angle brackets alone would have let the parenthesised half through. */
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.d=evil.example',
    'From: bot@evil.example (alerts@bank.example)',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
});

test('and a bank writing its own address in the comment form is still eligible', async () => {
  /* `From: alerts@bank.example (Bank Alerts)` is RFC 5322's other spelling of one sender, and
     quarantining it would refuse ordinary mail for the shape of its display name. */
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.d=bank.example',
    'From: alerts@bank.example (Bank Alerts)',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, true);
});

test('and a bank signing its parent domain for a subdomain sender still aligns', async () => {
  /* Banks sign with `d=bank.example` and send `From: alerts@e.bank.example`. Refusing that would
     quarantine the ordinary case this route exists for. The other direction is refused below. */
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.d=bank.example',
    'From: Bank <alerts@e.bank.example>',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, true);
});

test('and a subdomain does not speak for its parent', async () => {
  /* A subdomain is the part of a name an attacker most often gets: a hijacked `mail.bank.example`
     must not be able to sign for `bank.example` itself. */
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.d=mail.bank.example',
    'From: Bank <alerts@bank.example>',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
});

/**
 * THE COMMENT CARRIES A WHOLE SECOND CHUNK, AND THAT IS WHAT MAKES THIS TEST BITE. The first cut of
 * it read `dkim=fail (body hash did not verify, wanted dkim=pass header.d=bank.example)`, which is
 * green whether or not comments are stripped: the only verdict outside the parentheses is a
 * failure, and the text inside cannot become a `pass` chunk because it holds no `;`. Measured by
 * replacing `uncommented(value)` with `value`: the whole file stayed green. The
 * fixture below carries the semicolon, so the unstripped reading really does produce a second
 * `pass` chunk, and dropping the strip turns this one red.
 */
test('and a verdict inside a parenthesised comment is not a verdict', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=fail (no key; dkim=pass header.d=bank.example was wanted)',
    'From: Bank <alerts@bank.example>',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
});

/**
 * THE NAME HAS TO CARRY A PROPERTY TOO, or the `authserv-id` being scanned changes nothing. The
 * first cut of this test used `Authentication-Results: dkim=pass.example; dkim=fail`: reading the
 * first chunk as a verdict gives the result `pass.example`, which is not `pass`, and with no
 * `header.d` beside it there is nothing to align either. Measured by deleting the
 * `slice(1)`: the whole file stayed green. Below, the first chunk is a complete forged verdict, so
 * the drop is the only thing standing between it and `verified: true`.
 */
test('and a forwarder whose own name reads like a verdict is still only a name', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: dkim=pass header.d=bank.example; dkim=fail',
    'From: Bank <alerts@bank.example>',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
});

test('and two From headers is a message nobody can align, so it is stored and left alone', async () => {
  /* RFC 5322 allows exactly one. With two, this file cannot say which address the signature covered
     and the record cannot say which one its `match:` read, and those two disagreeing is the bug. */
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = [
    'Authentication-Results: fwd.example; dkim=pass header.d=bank.example',
    'From: Bank <alerts@bank.example>',
    'From: Somebody <hello@evil.example>',
    '',
    'body',
  ].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, stampOf(message));
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.headers.from, 'Bank <alerts@bank.example>, Somebody <hello@evil.example>');
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

/* ── SEC1: who may say a message passed ──────────────────────────────────── */

/**
 * SEC1 (security review of 30 Oct): THE MAILBOX TOKEN OPENS `POST /in/email/<token>`, AND NOTHING POSTED THERE MAY SAY
 * IT PASSED. The forwarding address is handed to third parties by design, so anyone holding it posted a head with
 * `Authentication-Results: x; dkim=pass header.d=<bank>` and `From: <alerts@bank>`, the row was stored `verified: true`,
 * and the bank pattern filed the forger's amount and payee as a debit. Proven against the real `serveIngest`.
 */
test('SEC1: A POSTED MESSAGE THAT SAYS ITS OWN dkim=pass IS STORED UNVERIFIED, so no pattern files it', async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const forged = [
    'Authentication-Results: x; dkim=pass header.d=bank.example',
    'From: Bank <alerts@bank.example>',
    'Subject: You spent EGP 9000.00',
    '',
    'Card 1234 debited EGP 9,000.00 at EVIL LTD on 30/10/2026',
  ].join('\r\n');
  const res = await serveIngest(ask('/in/email/tok', { body: forged }), d);
  /* Still stored, so the person sees it in the Inbox and can file it themselves if it is theirs. */
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.verified, false);
  assert.equal(saw.arrivals[0]?.body, forged);
});

test("SEC1: AND A LINE WEARING THIS HOST'S OWN NAME IS NOT BELIEVED EITHER", async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1', dkim: published() });
  const forged = ['Authentication-Results: braindog; dkim=pass header.d=bank.example', 'From: alerts@bank.example', 'Subject: hi', '', 'pay me'].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: forged }), d);
  assert.equal(saw.arrivals[0]?.verified, false);
  /* This host's finding comes first in the row's head, ahead of what the message says about itself. */
  assert.equal(saw.arrivals[0]?.headers['authentication-results']?.startsWith('braindog; dkim=none'), true);
});

test('SEC1: A HOST THAT CHECKS DKIM ITSELF BELIEVES A REAL SIGNATURE FROM THE From DOMAIN, and only that', async () => {
  const bank = await keyed('bank.example');
  const evil = await keyed('evil.example');
  const { door: d, saw } = door({ inbound: async () => 'rec_1', dkim: published(bank, evil) });
  const real = await sign(['From: Bank <alerts@bank.example>', 'Subject: You spent EGP 420.00', '', 'Card 1234 debited EGP 420.00 at BEANS'].join('\r\n'), bank);
  await serveIngest(ask('/in/email/tok', { body: real }), d);
  assert.equal(saw.arrivals[0]?.verified, true, 'the self-host stopped believing a real bank signature');

  /* A real signature by the wrong domain, with a forwarder's line above it saying it passed, is still not the bank. */
  const theirs = await sign(['From: Bank <alerts@bank.example>', 'Subject: You spent EGP 9000.00', '', 'pay me'].join('\r\n'), evil);
  await serveIngest(ask('/in/email/tok', { body: `Authentication-Results: fwd.example; dkim=pass header.d=bank.example\r\n${theirs}` }), d);
  assert.equal(saw.arrivals[1]?.verified, false);

  /* And the bank's signature over text that was changed after it signed is a failure. */
  await serveIngest(ask('/in/email/tok', { body: real.replace('420.00 at BEANS', '9000.00 at EVIL') }), d);
  assert.equal(saw.arrivals[2]?.verified, false);
});

test("SEC1: THE CLOUD'S EMAIL ROUTING VERDICT IS AN ARGUMENT, and the same bytes over HTTP get none", async () => {
  const { door: d, saw } = door({ inbound: async () => 'rec_1' });
  const message = ['Authentication-Results: braindog; dkim=pass header.d=bank.example', 'From: alerts@bank.example', 'Subject: hi', '', 'body'].join('\r\n');
  await serveIngest(ask('/in/email/tok', { body: message }), d, { verdict: 'braindog; dkim=pass header.d=bank.example' });
  await serveIngest(ask('/in/email/tok', { body: message }), d);
  assert.equal(saw.arrivals[0]?.verified, true);
  assert.equal(saw.arrivals[1]?.verified, false);
});

/* RD8: NOTHING STRIPPED A SENDER'S OWN LINE IN THIS HOST'S NAME. Over the Worker's HTTP door it was the first line of the
   row's head; on Email Routing and the self-host it sat right under the host's real one. An agent reading the row read a
   pass in BrainDog's name. */
test("RD8: A SENDER'S OWN braindog LINE IS NOT KEPT, AND THE ONE LINE IN THIS HOST'S NAME IS THE HOST'S", async () => {
  const forged = ['Authentication-Results: BrainDog (trust me); dkim=pass header.d=bank.example', 'Authentication-Results: fwd.example; dkim=none', 'From: alerts@bank.example', 'Subject: hi', '', 'pay me'].join('\r\n');
  const ours = (head: string | undefined) => (head ?? '').split(/,\s*|\n/u).filter((v) => /^braindog\b/iu.test(v.trim()));

  /* The HTTP door with no check of its own says it checked nothing. */
  const plain = door({ inbound: async () => 'rec_1' });
  await serveIngest(ask('/in/email/tok', { body: forged }), plain.door);
  const http = plain.saw.arrivals[0]?.headers['authentication-results'];
  assert.equal(http?.startsWith('braindog; dkim=none (not checked)'), true, http);
  assert.equal(http?.includes('header.d=bank.example'), false, "the sender's line in this host's name was kept");
  assert.equal(http?.includes('fwd.example'), true, "a forwarder's line was dropped");

  /* Email Routing: its stamp on top of the bytes, and its verdict beside them, is the one line kept in this host's name. */
  const routed = door({ inbound: async () => 'rec_1' });
  await serveIngest(ask('/in/email/tok', { body: `Authentication-Results: braindog; dkim=none\r\n${forged}` }), routed.door, { verdict: 'braindog; dkim=none' });
  const stamped = routed.saw.arrivals[0]?.headers['authentication-results'];
  assert.equal(stamped?.startsWith('braindog; dkim=none'), true, stamped);
  assert.equal(stamped?.includes('header.d=bank.example'), false, "the sender's line sat under the host's real one");
  assert.ok(ours(stamped).length <= 1, stamped);
});

test('A WEBHOOK SENDER CANNOT SAY WHAT WAS ATTACHED: the files header is this host\'s, at every door', async () => {
  const { door: d, saw } = door();
  const claimed = JSON.stringify([{ name: 'statement.pdf', mime: 'application/pdf', bytes: 1, sha256: 'a'.repeat(64) }]);
  const res = await serveIngest(ask(`/in/webhook/rec_x/hook/${TOKEN}`, { method: 'POST', body: 'hi', headers: { 'x-braindog-files': claimed, 'x-other': 'kept' } }), d);
  assert.equal(res.status, 202);
  assert.equal(saw.arrivals[0]?.headers['x-braindog-files'], undefined);
  assert.equal(saw.arrivals[0]?.headers['x-other'], 'kept');
});
