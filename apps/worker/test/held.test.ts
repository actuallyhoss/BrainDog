/**
 * The arrival door's hold (`src/held.ts`): a webhook the record could not take is kept and sent again, never dropped.
 *
 * THE CASE IS 29 OCTOBER, 09:00:34Z: his Shortcut posted a bank text while the record's object was being reset, the door
 * answered 503, and a Shortcut does not send again. Each test below is one way that text could have gone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { IngestDoor, IngestArrival } from '@braindog/host';
import type { Result } from '@braindog/ports';

import { createHash } from 'node:crypto';

import { HELD_GAVE_UP, HELD_MOST, HELD_OLDEST_MS, HELD_PER_DOOR, HELD_PER_PLACE, HELD_PER_PLACE_MOST, HELD_PER_RECORD, HELD_STEPS_S, HELD_WAIT, SIGNED_DOOR, open, redeliver, seal, serveHeld, sweepHeld, timeSigned, TOLD_FOR_MS, type HeldBucket, type HeldDeps, type HeldMessage } from '../src/held.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok-123';
const URL_ = `https://brain.dog/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`;
const TEXT = 'Your card ending 1234 was used for EGP 201.36 at Talabat';
const SECRET = 'a-session-secret-of-thirty-two-bytes-or-more';
const NOW_M6 = Date.UTC(2026, 9, 30, 12);
/** The door's token as the Directory keeps it (`dir_door`, RD1): its SHA-256 in hex. */
const SIGN = createHash('sha256').update(TOKEN).digest('hex');
/** The Directory as the hold asks it: his bank door by its token, and a `bank` door signed in a header. */
const directory: HeldDeps['holds'] = async (rec, ingest, sign) =>
  rec === REC && ((ingest === 'bank-from-out-sms' && sign === SIGN) || (ingest === 'bank' && sign === SIGNED_DOOR));

type Kept = { bytes: Uint8Array; uploaded: Date; meta?: Record<string, string> };

/** The bytes' own tag, as R2's etag is the content's hash: a put of the same bytes keeps it, new bytes change it. */
const etagOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** A bucket in memory that keeps what R2 keeps; `etags: false` is one that says no etag and takes no condition. */
function bucket({ etags = true }: { etags?: boolean } = {}): HeldBucket & { objects: Map<string, Kept> } {
  const objects = new Map<string, Kept>();
  return {
    objects,
    get: async (key) => {
      const o = objects.get(key);
      return o === undefined ? null : { arrayBuffer: async () => o.bytes.slice().buffer, ...(etags ? { etag: etagOf(o.bytes) } : {}) };
    },
    put: async (key, value, options) => {
      /* A CONDITION THAT DOES NOT HOLD WRITES NOTHING AND ANSWERS NULL, as R2's does: an object gone since fails it too. */
      if (options?.onlyIf?.etagMatches !== undefined) {
        const o = objects.get(key);
        if (o === undefined || etagOf(o.bytes) !== options.onlyIf.etagMatches) return null;
      }
      objects.set(key, { bytes: value.slice(), uploaded: new Date(), ...(options?.customMetadata ? { meta: { ...options.customMetadata } } : {}) });
      return { key };
    },
    delete: async (key) => {
      objects.delete(key);
    },
    list: async ({ prefix, limit = 1000, include }) => ({
      objects: [...objects.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .slice(0, limit)
        .map(([key, o]) => ({ key, uploaded: o.uploaded, ...(include?.includes('customMetadata') && o.meta ? { customMetadata: o.meta } : {}) })),
      truncated: false,
    }),
  };
}

/** A door whose record answers `answers` in turn: `ok`, `throw` (the object reset), or a refusal code. */
function door(answers: ('ok' | 'throw' | 'gone')[], seen: IngestArrival[]): () => IngestDoor {
  let i = 0;
  return () => ({
    limit: async () => null,
    verify: async () => {
      const now = answers[Math.min(i, answers.length - 1)];
      if (now === 'gone') return null;
      if (now === 'throw') {
        i += 1;
        throw new Error('Durable Object storage operation exceeded timeout which caused object to be reset.');
      }
      return { kind: 'path', token: TOKEN };
    },
    arrive: async (arrival): Promise<Result<unknown>> => {
      i += 1;
      seen.push(arrival);
      return { ok: true, value: { id: 'arr_1' } };
    },
  });
}

function deps(answers: ('ok' | 'throw' | 'gone')[], seen: IngestArrival[], b = bucket(), sent: { body: HeldMessage; delay: number | undefined }[] = [], holds: HeldDeps['holds'] = directory) {
  const told: string[] = [];
  const d: HeldDeps = {
    holds,
    bucket: b,
    secret: SECRET,
    queue: { send: async (body, options) => void sent.push({ body, delay: options?.delaySeconds }) },
    door: door(answers, seen),
    pause: async () => {},
    tell: async (f) => void told.push(f.why),
  };
  return { d, b, sent, told };
}

const post = (): Request => new Request(URL_, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: TEXT });

test('A RECORD THAT TAKES IT AT ONCE: 202, and nothing is kept', async () => {
  const seen: IngestArrival[] = [];
  const { d, b, sent } = deps(['ok'], seen);
  const res = await serveHeld(post(), d);
  assert.equal(res.status, 202);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.body, TEXT);
  assert.equal(seen[0]?.verified, true);
  assert.equal(b.objects.size, 0);
  assert.equal(sent.length, 0);
});

test('A RESET ONCE, THEN TAKEN: the second ask lands it, and nothing is kept', async () => {
  const seen: IngestArrival[] = [];
  const { d, b } = deps(['throw', 'ok'], seen);
  const res = await serveHeld(post(), d);
  assert.equal(res.status, 202);
  assert.equal(seen.length, 1);
  assert.equal(b.objects.size, 0);
});

test('A RECORD THAT CANNOT TAKE IT TWICE: kept sealed, the sender hears 202, and the queue rings in half a minute', async () => {
  const seen: IngestArrival[] = [];
  const { d, b, sent } = deps(['throw', 'throw'], seen);
  const res = await serveHeld(post(), d);
  assert.equal(res.status, 202);
  assert.equal(seen.length, 0);
  const keys = [...b.objects.keys()];
  assert.equal(keys.length, 1);
  assert.ok(keys[0]?.startsWith(`${HELD_WAIT}${REC}/`));
  /* SEALED: neither the token nor the text is in the bucket as written. */
  const raw = new TextDecoder().decode(b.objects.get(keys[0] ?? '')?.bytes);
  assert.ok(!raw.includes(TOKEN) && !raw.includes('Talabat'));
  const plain = JSON.parse(new TextDecoder().decode(await open(SECRET, b.objects.get(keys[0] ?? '')?.bytes ?? new Uint8Array()))) as { url: string };
  assert.equal(plain.url, URL_);
  assert.deepEqual(sent, [{ body: { held: keys[0], tries: 0 }, delay: HELD_STEPS_S[0] }]);
});

test('THE SAME TEXT FROM TWO DEVICES IS ONE KEPT ARRIVAL', async () => {
  const b = bucket();
  await serveHeld(post(), deps(['throw'], [], b).d);
  await serveHeld(post(), deps(['throw'], [], b).d);
  assert.equal(b.objects.size, 1);
});

test('NO SECRET, NO HOLD: 503 as before, and nothing written', async () => {
  const { d, b } = deps(['throw'], []);
  const res = await serveHeld(post(), { ...d, secret: undefined });
  assert.equal(res.status, 503);
  assert.equal(b.objects.size, 0);
});

test('A RING THAT LANDS IT: stored as the first post would have been, and the object deleted', async () => {
  const b = bucket();
  const sent: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, sent).d);
  const seen: IngestArrival[] = [];
  const out = await redeliver(sent[0]?.body ?? { held: '', tries: 0 }, deps(['ok'], seen, b).d);
  assert.equal(out, 'delivered');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.body, TEXT);
  assert.equal(seen[0]?.verified, true);
  assert.equal(b.objects.size, 0);
});

test('A RING THE RECORD STILL REFUSES: rung again on the next step of the ladder, and the operator told after six', async () => {
  const b = bucket();
  const first: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, first).d);
  const again: { body: HeldMessage; delay: number | undefined }[] = [];
  const { d, told } = deps(['throw'], [], b, again);
  assert.equal(await redeliver({ held: first[0]?.body.held ?? '', tries: 5 }, d), 'waiting');
  assert.deepEqual(again[0], { body: { held: first[0]?.body.held, tries: 6 }, delay: HELD_STEPS_S[6] });
  assert.equal(b.objects.size, 1);
  assert.deepEqual(told, ['waiting']);
});

test('A DOOR THAT IS GONE: the kept request moves aside for the operator and is never dropped silently', async () => {
  const b = bucket();
  const first: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, first).d);
  const { d, told } = deps(['gone'], [], b);
  assert.equal(await redeliver(first[0]?.body ?? { held: '', tries: 0 }, d), 'gave-up');
  const keys = [...b.objects.keys()];
  assert.equal(keys.length, 1);
  assert.ok(keys[0]?.startsWith(`${HELD_GAVE_UP}${REC}/`));
  assert.deepEqual(told, ['gave-up status-404']);
});

test('THE NIGHTLY SWEEP RINGS WHAT HAS WAITED OVER AN HOUR', async () => {
  const b = bucket();
  await serveHeld(post(), deps(['throw'], [], b).d);
  const sent: { body: HeldMessage; delay: number | undefined }[] = [];
  const { d } = deps(['ok'], [], b, sent);
  assert.equal(await sweepHeld({ ...d, now: () => Date.now() + 30 * 60_000 }), 0);
  assert.equal(await sweepHeld({ ...d, now: () => Date.now() + 2 * 3_600_000 }), 1);
  assert.equal(sent.length, 1);
});

/* R1 (review 30 Oct): Stripe told 202 stops retrying, and the replay ten minutes on fails the signature's 300 s window. */
test('A STRIPE WEBHOOK THE RECORD CANNOT TAKE IS NOT KEPT: 503, so Stripe sends it again with a fresh signature', async () => {
  const seen: IngestArrival[] = [];
  const { d, b, sent } = deps(['throw', 'throw'], seen);
  const signed = new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}` },
    body: '{"type":"invoice.paid"}',
  });
  const res = await serveHeld(signed, d);
  assert.equal(res.status, 503);
  assert.equal(b.objects.size, 0);
  assert.equal(sent.length, 0);
});

test('A STRIPE-SHAPED SIGNATURE UNDER ANOTHER NAME, OR A SVIX OR SLACK TIME, COUNTS AS TIME-SIGNED; A BANK TEXT DOES NOT', () => {
  assert.equal(timeSigned([['x-pay-signature', 't=1730000000,v1=abc']]), true);
  assert.equal(timeSigned([['svix-timestamp', '1730000000']]), true);
  assert.equal(timeSigned([['X-Slack-Request-Timestamp', '1730000000']]), true);
  assert.equal(timeSigned([['content-type', 'text/plain'], ['x-hub-signature-256', 'sha256=abc']]), false);
});

/* R2 (review 30 Oct): every night's sweep started another chain, and a record that never takes arrivals kept them forever. */
test('THE SWEEP LEAVES A CHAIN THAT IS STILL RINGING ALONE', async () => {
  const b = bucket();
  const first: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, first).d);
  /* Rung at the ladder's top: its next ring is twelve hours off. */
  const { d } = deps(['throw'], [], b);
  assert.equal(await redeliver({ held: first[0]?.body.held ?? '', tries: 7 }, d), 'waiting');
  const sent: { body: HeldMessage; delay: number | undefined }[] = [];
  const swept = deps(['ok'], [], b, sent).d;
  assert.equal(await sweepHeld({ ...swept, now: () => Date.now() + 2 * 3_600_000 }), 0);
  /* The chain lost: thirteen hours on, the ring is an hour late, and the sweep rings it once. */
  assert.equal(await sweepHeld({ ...swept, now: () => Date.now() + 13.5 * 3_600_000 }), 1);
  assert.equal(sent.length, 1);
});

test('AN ARRIVAL STILL REFUSED A WEEK AFTER IT WAS KEPT IS GIVEN UP ON, WITH A MAIL', async () => {
  const b = bucket();
  const first: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, first).d);
  const { d, told } = deps(['throw'], [], b);
  const out = await redeliver({ held: first[0]?.body.held ?? '', tries: 20 }, { ...d, now: () => Date.now() + HELD_OLDEST_MS + 60_000 });
  assert.equal(out, 'gave-up');
  assert.ok([...b.objects.keys()].every((k) => k.startsWith(HELD_GAVE_UP)));
  assert.deepEqual(told, ['gave-up too-old']);
});

/* Q3 (second review of 30 October): his two devices post the same text while the record is down, so two chains ring one
   key. Ring A reads the object and gets 503; ring B lands it a moment later and deletes it; ring A then put it back with
   its metadata, and it rang for a week for an arrival already stored. */
for (const etags of [true, false])
  test(`A RING REFUSED WHILE ANOTHER LANDED IT DOES NOT PUT THE DELIVERED ARRIVAL BACK${etags ? '' : ', in a bucket with no etags'}`, async () => {
    const b = bucket({ etags });
    const first: { body: HeldMessage; delay: number | undefined }[] = [];
    await serveHeld(post(), deps(['throw'], [], b, first).d);
    const held = first[0]?.body.held ?? '';
    assert.equal(b.objects.size, 1);

    /* RING B LANDS IT AND DELETES IT AFTER RING A READ IT, while A's next ring is being queued. */
    const seen: IngestArrival[] = [];
    const { d } = deps(['throw'], [], b);
    const ringA: HeldDeps = {
      ...d,
      queue: {
        send: async () => {
          assert.equal(await redeliver({ held, tries: 0 }, deps(['ok'], seen, b).d), 'delivered');
        },
      },
    };
    assert.equal(await redeliver({ held, tries: 0 }, ringA), 'gone');
    assert.equal(seen.length, 1, 'the arrival was not stored once');
    assert.equal(b.objects.size, 0, 'the delivered arrival was put back to ring again');
  });

test('A RING REFUSED OVER AN OBJECT KEPT AGAIN SINCE LEAVES THE NEW ONE AS IT IS, and a ring over its own object marks it', async () => {
  const b = bucket();
  const first: { body: HeldMessage; delay: number | undefined }[] = [];
  await serveHeld(post(), deps(['throw'], [], b, first).d);
  const held = first[0]?.body.held ?? '';

  /* THE SAME TEXT KEPT AGAIN WHILE A RING WAS OUT (two posts that both listed before either was put): new seal, new
     ring of its own, and A's mark does not land on it. */
  const { d } = deps(['throw'], [], b);
  const resealed = await seal(SECRET, await open(SECRET, b.objects.get(held)?.bytes ?? new Uint8Array()));
  const ringA: HeldDeps = { ...d, queue: { send: async () => void (await b.put(held, resealed, { customMetadata: { next: '0', tries: '0', kept: '0' } })) } };
  assert.equal(await redeliver({ held, tries: 3 }, ringA), 'gone');
  assert.equal(b.objects.size, 1);
  assert.equal(b.objects.get(held)?.meta?.['tries'], '0', 'the object kept again was marked by the older ring');

  /* A POST OF THE SAME TEXT ONCE IT IS KEPT LEAVES IT AS IT IS (RE2), so the ring's mark is the one that holds. */
  const sealedNow = b.objects.get(held)?.bytes;
  assert.equal((await serveHeld(post(), deps(['throw'], [], b).d)).status, 202);
  assert.equal(b.objects.get(held)?.bytes, sealedNow);

  /* NOTHING IN BETWEEN: the ring marks its object when its next ring is due, as before. */
  const again: { body: HeldMessage; delay: number | undefined }[] = [];
  assert.equal(await redeliver({ held, tries: 3 }, deps(['throw'], [], b, again).d), 'waiting');
  assert.equal(again.length, 1);
  assert.equal(b.objects.size, 1);
});

/* ── SEC7 (security review of 30 Oct): strangers could fill the held store during an outage ─────────────────── */

const OTHER = 'rec_01J8ZC0000000000000000000B';
const junk = (rec: string, n: number, ip: string, url?: string): Request =>
  new Request(url ?? `https://brain.dog/in/webhook/${rec}/anything-${n}/anything-${n}`, { method: 'POST', headers: { 'cf-connecting-ip': ip }, body: `junk ${n}` });

test('SEC7: A RECORD THE DIRECTORY DOES NOT HOLD, OR CANNOT SAY IT HOLDS, IS NEVER KEPT', async () => {
  const b = bucket();
  const res = await serveHeld(junk(OTHER, 1, '198.51.100.1'), deps(['throw'], [], b).d);
  assert.equal(res.status, 503);
  const faulty = deps(['throw'], [], b, [], async () => {
    throw new Error('the Directory is down');
  });
  assert.equal((await serveHeld(junk(REC, 2, '198.51.100.1'), faulty.d)).status, 503);
  assert.equal(b.objects.size, 0, 'a made-up record, or one nobody could vouch for, was kept');
});

test('RD1: A JUNK TOKEN, OR A DOOR THE DIRECTORY WAS NEVER TOLD OF, IS NOT KEPT, and his own text is', async () => {
  const b = bucket();
  for (let i = 0; i < 20; i++) {
    assert.equal((await serveHeld(junk(REC, i, '2001:db8:aa:' + (i + 1).toString(16) + '::1'), deps(['throw'], [], b).d)).status, 503);
    const wrong = `https://brain.dog/in/webhook/${REC}/bank-from-out-sms/not-the-token-${i}`;
    assert.equal((await serveHeld(junk(REC, i, '198.51.100.' + (i + 1), wrong), deps(['throw'], [], b).d)).status, 503);
  }
  assert.equal(b.objects.size, 0, 'a token that is not the door\'s was kept');
  const mine = await serveHeld(new Request(URL_, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.50' }, body: TEXT }), deps(['throw'], [], b).d);
  assert.equal(mine.status, 202);
});

test('RD14: ONE PLACE KEEPS AT MOST HELD_PER_PLACE FOR ONE RECORD, and the same place still has room for another', async () => {
  const b = bucket();
  const both: HeldDeps['holds'] = async (rec, ingest, sign) => (rec === REC || rec === OTHER) && ingest === 'bank-from-out-sms' && sign === SIGN;
  const at = (rec: string, n: number): Request =>
    new Request(`https://brain.dog/in/webhook/${rec}/bank-from-out-sms/${TOKEN}`, { method: 'POST', headers: { 'cf-connecting-ip': '2001:db8:aa:bb::1' }, body: `text ${n}` });
  for (let i = 0; i < HELD_PER_PLACE + 5; i++) await serveHeld(at(REC, i), deps(['throw'], [], b, [], both).d);
  assert.equal(b.objects.size, HELD_PER_PLACE, 'one place filled more than its share of one record');
  assert.ok(HELD_PER_PLACE < HELD_PER_RECORD);
  /* A GATEWAY POSTING FOR SOMEBODY ELSE FROM THE SAME PLACE IS NOT REFUSED FOR IT. */
  assert.equal((await serveHeld(at(OTHER, 1), deps(['throw'], [], b, [], both).d)).status, 202);
});

test('RD1: THE DIRECTORY LEARNS EACH DOOR FROM ITS OWN TRAFFIC, by the token\'s digest and never the token', async () => {
  const learned: [string, string, string | null][] = [];
  const { d } = deps(['ok'], []);
  const res = await serveHeld(post(), { ...d, learn: async (rec, ingest, sign) => void learned.push([rec, ingest, sign]) });
  assert.equal(res.status, 202);
  assert.deepEqual(learned, [[REC, 'bank-from-out-sms', SIGN]]);
});

test('SEC7: A FOUR-SEGMENT POST WITH NO SIGNATURE IS JUNK AND IS NOT KEPT; ONE SIGNED IN A HEADER IS', async () => {
  const b = bucket();
  const bare = new Request(`https://brain.dog/in/webhook/${REC}/bank`, { method: 'POST', body: 'no signature' });
  assert.equal((await serveHeld(bare, deps(['throw'], [], b).d)).status, 503);
  assert.equal(b.objects.size, 0);
  const signed = new Request(`https://brain.dog/in/webhook/${REC}/bank`, { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=abc' }, body: 'signed' });
  assert.equal((await serveHeld(signed, deps(['throw'], [], b).d)).status, 202);
});

test('SEC7: A BODY WITH NO LENGTH IS READ ONLY UP TO THE CEILING, and past it is 413 before the record is asked', async () => {
  const seen: IngestArrival[] = [];
  let asked = 0;
  const { d } = deps(['ok'], seen);
  const counted: HeldDeps = { ...d, door: () => ({ ...d.door(), verify: async (ask) => (asked++, d.door().verify(ask)) }) };
  const chunk = new Uint8Array(256 * 1024);
  let sent = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += chunk.byteLength;
      if (sent > 64 * 1024 * 1024) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const res = await serveHeld(new Request(URL_, { method: 'POST', body: endless, duplex: 'half' } as RequestInit), counted);
  assert.equal(res.status, 413);
  assert.equal(asked, 0, 'the record was asked about a body that was never going to fit');
  assert.ok(sent < 4 * 1024 * 1024, `read ${sent} bytes of a body past the ceiling`);
});

/* ── sec-follow M6 and RE1/RE2: one door's share, and nothing waiting pushed out ─────────────────────────────── */

test('M6: ONE DOOR KEEPS AT MOST HELD_PER_DOOR, so another door of the record still has room', async () => {
  const b = bucket();
  const doors: HeldDeps['holds'] = async (rec, ingest, sign) => rec === REC && ((ingest === 'leaked' && sign === SIGN) || (ingest === 'bank-from-out-sms' && sign === SIGN));
  const leaked = (n: number): Request =>
    new Request(`https://brain.dog/in/webhook/${REC}/leaked/${TOKEN}`, { method: 'POST', headers: { 'cf-connecting-ip': `198.51.${Math.floor(n / 200)}.${(n % 200) + 1}` }, body: `flood ${n}` });
  for (let i = 0; i < HELD_PER_DOOR + 5; i++) await serveHeld(leaked(i), deps(['throw'], [], b, [], doors).d);
  assert.equal(b.objects.size, HELD_PER_DOOR, 'one door took more than its share of the record');
  const mine = await serveHeld(new Request(URL_, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.50' }, body: TEXT }), deps(['throw'], [], b, [], doors).d);
  assert.equal(mine.status, 202);
});

test('RE1: A FULL DOOR REFUSES A NEW ARRIVAL, SIGNED OR NOT, AND NEVER PUSHES A WAITING ONE OUT', async () => {
  const b = bucket();
  const either: HeldDeps['holds'] = async (rec, ingest, sign) => rec === REC && ingest === 'bank-from-out-sms' && (sign === SIGN || sign === SIGNED_DOOR);
  const text = (n: number): Request => new Request(URL_, { method: 'POST', headers: { 'cf-connecting-ip': `198.51.100.${n + 1}` }, body: `text ${n}` });
  let now = NOW_M6;
  const told: string[] = [];
  const at = (): HeldDeps => ({ ...deps(['throw'], [], b, [], either).d, now: () => (now += 1000), tell: async (f) => void told.push(f.why) });
  for (let i = 0; i < HELD_PER_DOOR; i++) assert.equal((await serveHeld(text(i), at())).status, 202);
  assert.equal((await serveHeld(text(150), at())).status, 503, 'an unsigned arrival pushed a waiting one out');
  /* A HEADER NAMED LIKE A SIGNATURE IS NO SIGNATURE THE HOLD CAN CHECK, so it earns no room. */
  const forged = new Request(`https://brain.dog/in/webhook/${REC}/bank-from-out-sms`, { method: 'POST', headers: { 'x-signature': 'x', 'cf-connecting-ip': '203.0.113.9' }, body: 'forged' });
  assert.equal((await serveHeld(forged, at())).status, 503, 'a forged signed arrival was kept');
  assert.equal([...b.objects.keys()].filter((k) => k.startsWith(HELD_GAVE_UP)).length, 0, 'a waiting arrival was moved to gave-up');
  assert.equal([...b.objects.keys()].filter((k) => k.startsWith(HELD_WAIT)).length, HELD_PER_DOOR);
  assert.deepEqual(told, []);
});

test('RE2: A PLACE OVER ITS SHARE IS REFUSED BEFORE ANYTHING ELSE MOVES, and the same request kept again is taken as it is', async () => {
  const b = bucket();
  const doors: HeldDeps['holds'] = async (rec, ingest, sign) => rec === REC && ingest.startsWith('d') && sign === SIGN;
  /* THE RECORD FILLED FROM MANY PLACES ACROSS TWO DOORS, and one place at its share of it. */
  const at = (door: string, n: number, ip: string): Request =>
    new Request(`https://brain.dog/in/webhook/${REC}/${door}/${TOKEN}`, { method: 'POST', headers: { 'cf-connecting-ip': ip }, body: `text ${n}` });
  for (let i = 0; i < HELD_PER_PLACE; i++) assert.equal((await serveHeld(at('d1', i, '203.0.113.7'), deps(['throw'], [], b, [], doors).d)).status, 202);
  for (let i = HELD_PER_PLACE; i < HELD_PER_RECORD; i++)
    assert.equal((await serveHeld(at(i % 2 === 0 ? 'd1' : 'd2', i, `198.51.${Math.floor(i / 200)}.${(i % 200) + 1}`), deps(['throw'], [], b, [], doors).d)).status, 202);
  const before = [...b.objects.keys()].sort();
  const sent: { body: HeldMessage; delay: number | undefined }[] = [];
  const told: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = { ...deps(['throw'], [], b, sent, doors).d, tell: async (f: { why: string }) => void told.push(f.why) };
    assert.equal((await serveHeld(at('d3', 500 + i, '203.0.113.7'), d)).status, 503);
  }
  assert.deepEqual([...b.objects.keys()].sort(), before, 'a refused post moved a waiting arrival');
  assert.deepEqual(told, []);
  /* HIS SECOND DEVICE POSTS THE SAME TEXT: it is already kept, so it is taken, and its ring is not started again. */
  assert.equal((await serveHeld(at('d1', 0, '203.0.113.7'), deps(['throw'], [], b, sent, doors).d)).status, 202);
  assert.deepEqual([...b.objects.keys()].sort(), before);
  assert.equal(sent.length, 0, 'the same arrival was rung a second time');
});

test('RE1: ONE PLACE KEEPS AT MOST HELD_PER_PLACE_MOST ACROSS EVERY RECORD', async () => {
  const b = bucket();
  const many = (n: number): string => `rec_01J8ZC00000000000000000${String(n).padStart(3, '0')}`;
  const any: HeldDeps['holds'] = async (_rec, ingest, sign) => ingest === 'bank' && sign === SIGNED_DOOR;
  const forged = (rec: string, n: number): Request =>
    new Request(`https://brain.dog/in/webhook/${rec}/bank`, { method: 'POST', headers: { 'x-signature': 'x', 'cf-connecting-ip': '203.0.113.66' }, body: `forged ${n}` });
  for (let r = 0; r < 10; r++) for (let i = 0; i < HELD_PER_PLACE; i++) await serveHeld(forged(many(r), i), deps(['throw'], [], b, [], any).d);
  assert.equal(b.objects.size, HELD_PER_PLACE_MOST, 'one address filled more than its share of the deployment');
  assert.ok(HELD_PER_PLACE_MOST < HELD_MOST);
});

test('RE8: A DIRECTORY THAT HANGS DOES NOT HOLD UP THE DOOR, and with waitUntil it is told after the answer', async () => {
  const later: Promise<unknown>[] = [];
  const { d } = deps(['ok'], []);
  const hung: HeldDeps['learn'] = () => new Promise(() => {});
  const started = Date.now();
  const res = await serveHeld(
    new Request(`https://brain.dog/in/webhook/${REC}/hung-door/${TOKEN}`, { method: 'POST', body: TEXT }),
    { ...d, learn: hung, later: (w) => void later.push(w) },
  );
  assert.equal(res.status, 202);
  assert.equal(later.length, 1);
  assert.ok(Date.now() - started < 250);
  /* WITH NO waitUntil, THE DOOR WAITS A MOMENT AT MOST. */
  const alone = Date.now();
  assert.equal((await serveHeld(new Request(`https://brain.dog/in/webhook/${REC}/hung-door-2/${TOKEN}`, { method: 'POST', body: TEXT }), { ...d, learn: hung })).status, 202);
  assert.ok(Date.now() - alone < 2000);
});

test('RE8: A DOOR IS TOLD AGAIN ONCE ITS TELLING IS OLD, so a row dropped elsewhere comes back', async () => {
  const learned: string[] = [];
  let now = NOW_M6;
  const { d } = deps(['ok'], []);
  const at: HeldDeps = { ...d, now: () => now, learn: async (_rec, ingest) => void learned.push(ingest) };
  const ask = (): Request => new Request(`https://brain.dog/in/webhook/${REC}/told-door/${TOKEN}`, { method: 'POST', body: TEXT });
  await serveHeld(ask(), at);
  await serveHeld(ask(), at);
  assert.deepEqual(learned, ['told-door']);
  now += TOLD_FOR_MS + 1;
  await serveHeld(ask(), at);
  assert.deepEqual(learned, ['told-door', 'told-door']);
});
