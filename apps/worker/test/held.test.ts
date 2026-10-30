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

import { HELD_GAVE_UP, HELD_OLDEST_MS, HELD_STEPS_S, HELD_WAIT, open, redeliver, serveHeld, sweepHeld, timeSigned, type HeldBucket, type HeldDeps, type HeldMessage } from '../src/held.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok-123';
const URL_ = `https://brain.dog/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`;
const TEXT = 'Your card ending 1234 was used for EGP 201.36 at Talabat';
const SECRET = 'a-session-secret-of-thirty-two-bytes-or-more';

type Kept = { bytes: Uint8Array; uploaded: Date; meta?: Record<string, string> };

function bucket(): HeldBucket & { objects: Map<string, Kept> } {
  const objects = new Map<string, Kept>();
  return {
    objects,
    get: async (key) => {
      const o = objects.get(key);
      return o === undefined ? null : { arrayBuffer: async () => o.bytes.slice().buffer };
    },
    put: async (key, value, options) => {
      objects.set(key, { bytes: value.slice(), uploaded: new Date(), ...(options?.customMetadata ? { meta: { ...options.customMetadata } } : {}) });
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

function deps(answers: ('ok' | 'throw' | 'gone')[], seen: IngestArrival[], b = bucket(), sent: { body: HeldMessage; delay: number | undefined }[] = []) {
  const told: string[] = [];
  const d: HeldDeps = {
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
