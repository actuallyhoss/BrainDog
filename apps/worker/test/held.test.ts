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

import { HELD_GAVE_UP, HELD_STEPS_S, HELD_WAIT, open, redeliver, serveHeld, sweepHeld, type HeldBucket, type HeldDeps, type HeldMessage } from '../src/held.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok-123';
const URL_ = `https://brain.dog/in/webhook/${REC}/bank-from-out-sms/${TOKEN}`;
const TEXT = 'Your card ending 1234 was used for EGP 201.36 at Talabat';
const SECRET = 'a-session-secret-of-thirty-two-bytes-or-more';

function bucket(): HeldBucket & { objects: Map<string, { bytes: Uint8Array; uploaded: Date }> } {
  const objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  return {
    objects,
    get: async (key) => {
      const o = objects.get(key);
      return o === undefined ? null : { arrayBuffer: async () => o.bytes.slice().buffer };
    },
    put: async (key, value) => {
      objects.set(key, { bytes: value.slice(), uploaded: new Date() });
    },
    delete: async (key) => {
      objects.delete(key);
    },
    list: async ({ prefix, limit = 1000 }) => ({
      objects: [...objects.entries()].filter(([k]) => k.startsWith(prefix)).slice(0, limit).map(([key, o]) => ({ key, uploaded: o.uploaded })),
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
