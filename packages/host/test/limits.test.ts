/**
 * The limiter both hosts call.
 *
 * NEITHER DOOR HAD A RATE AT ALL, on `/api` or on `/mcp`: a token that
 * loops asks the record as often as the network lets it, on the Cloud and on a self-host alike, and the only limits in
 * the tree were the sign-in lockout, the ingest budget and a report key's minute. The Cloud's binding was drafted in
 * `wrangler.jsonc` at 600 reads and 120 writes a minute and never read by any code.
 *
 * THESE ARE THE PIECES BOTH DOORS SHARE, AND NONE OF THEM TOUCHES A DOOR. The Worker wires the binding and the
 * self-host wires `windowLimiter`; each has its own integration test there. What is tested here is the key,
 * the class, the window and the refusal, with a clock this file moves by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* THE RED BEFORE `limits.ts` EXISTED WAS `ERR_MODULE_NOT_FOUND` for this path, before any test runs. A
   namespace import does not soften that, as it does for a missing export in `crash.test.ts`: a module that is not
   there fails the link whichever way it is imported. It was run and seen that way. */
import * as limits from '../src/limits.ts';

/* TWENTY SECONDS INTO A MINUTE, so the wait a refusal names is forty and not a number that happens to equal the
   window's length whatever the arithmetic does. */
const MINUTE_START = 1_789_000_020_000 - (1_789_000_020_000 % 60_000);
const T0 = MINUTE_START + 20_000;

/** A clock the test moves. */
function clock(at = T0) {
  const c = { at, now: () => c.at };
  return c;
}

/** Two tokens on ONE record, so a key built from the record would give them one budget between them. */
const tokenA = { door: 'bearer', record: 'rec_same', ctx: { principal: { kind: 'token', id: 't_a' } } } as const;
const tokenB = { door: 'bearer', record: 'rec_same', ctx: { principal: { kind: 'token', id: 't_b' } } } as const;

async function spend(l: limits.Limiter, key: string, cls: limits.LimitClass, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const v = await l.limit(key, cls);
    assert.equal(v.ok, true, `request ${i + 1} of ${n} passed`);
  }
}

test('THE 601ST READ IN A MINUTE IS 429 WITH RETRY-AFTER, AND ANOTHER TOKEN IS NOT', async () => {
  assert.equal(typeof limits.windowLimiter, 'function', 'limits.ts exports windowLimiter');
  assert.equal(limits.READ_PER_MINUTE, 600);

  const c = clock();
  const l = limits.windowLimiter(c.now);
  const a = limits.limitKey(tokenA, '203.0.113.7');
  const b = limits.limitKey(tokenB, '203.0.113.7');

  await spend(l, a, 'read', 600);
  const over = await l.limit(a, 'read');
  assert.deepEqual(over, { ok: false, retryAfter: 40 });

  const answer = limits.refusedFor(over.ok ? 0 : over.retryAfter);
  assert.equal(answer.status, 429);
  assert.equal(answer.headers.get('retry-after'), '40');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
  const body = (await answer.json()) as { ok: boolean; refusal: { code: string; fix: string; retry_after: number } };
  assert.equal(body.ok, false);
  assert.equal(body.refusal.code, 'RATE_LIMITED');
  assert.equal(body.refusal.retry_after, 40);

  /* The same record, the same address, another token: its own budget. */
  assert.deepEqual(await l.limit(b, 'read'), { ok: true });

  /* THE SAME TOKEN'S WRITES ARE A BUDGET OF THEIR OWN. The 121st-write test below cannot show this, because 121
     requests on one shared counter are still under the read ceiling: a counter keyed without the class kept
     every test here green. Only reads spent past 120 and then a write can tell the two apart. */
  assert.deepEqual(await l.limit(a, 'write'), { ok: true }, 'a write passes after the reads are spent');
});

test('THE 121ST WRITE IS REFUSED WHILE READS STILL PASS', async () => {
  assert.equal(limits.WRITE_PER_MINUTE, 120);
  assert.equal(limits.classOf('create'), 'write');
  assert.equal(limits.classOf('list'), 'read');

  const l = limits.windowLimiter(clock().now);
  const a = limits.limitKey(tokenA, '203.0.113.7');

  await spend(l, a, limits.classOf('create'), 120);
  assert.equal((await l.limit(a, limits.classOf('create'))).ok, false, 'the 121st write is refused');
  assert.equal((await l.limit(a, limits.classOf('list'))).ok, true, 'a read from the same token still passes');
});

test('A NEW MINUTE STARTS AT ZERO, AND THE KEYS OF THE MINUTE THAT CLOSED ARE GONE', async () => {
  const c = clock();
  const l = limits.windowLimiter(c.now);

  await spend(l, 'token:t_a', 'write', 120);
  await spend(l, 'ip:198.51.100.1', 'read', 3);
  await spend(l, 'ip:198.51.100.2', 'read', 3);
  assert.equal((await l.limit('token:t_a', 'write')).ok, false);
  assert.equal(l.size(), 3);

  /* One millisecond before the minute closes is still the same minute, with one second left to wait. */
  c.at = MINUTE_START + 59_999;
  assert.deepEqual(await l.limit('token:t_a', 'write'), { ok: false, retryAfter: 1 });
  /* The one wait whose sentence differs, and the first draft said "after 1 seconds" to whoever read it. */
  const last = (await limits.refusedFor(1).json()) as { refusal: { fix: string } };
  assert.match(last.refusal.fix, /in 1 second\.$/);

  c.at = MINUTE_START + 60_000;
  await spend(l, 'token:t_a', 'write', 120);
  assert.equal(l.size(), 1, 'the two addresses that asked nothing this minute are no longer held');
});

test('THE KEY IS THE TOKEN, THE PERSON, OR THE ADDRESS', () => {
  const ip = '192.0.2.4';
  assert.equal(limits.limitKey(tokenA, ip), 'token:t_a');
  /* A bearer that an operation grant turned into its approver is that person, as a session would be. */
  assert.equal(limits.limitKey({ door: 'bearer', record: 'r', ctx: { principal: { kind: 'person', id: 'p_1' } } }, ip), 'person:p_1');
  assert.equal(limits.limitKey({ door: 'session', record: 'r', ctx: { principal: { kind: 'person', id: 'p_1' } } }, ip), 'person:p_1');
  /* NO DOOR IS THE ADDRESS, and it is the only keyless request left now the public demo is gone.
     The demo was keyed by address too, because every visitor to it was the one
     `p_demo`; a door that is no longer a `LimitDoor` cannot be handed in at all, which the typecheck holds. */
  assert.equal(limits.limitKey(null, ip), `ip:${ip}`);
  // @ts-expect-error `demo` is not a door any host has.
  const gone: limits.LimitDoor = { door: 'demo', ctx: { principal: { kind: 'person', id: 'p_demo' } } };
  assert.ok(gone);
});

test('AN /mcp REQUEST IS A READ AT THE DOOR, AND SO IS A NAME NO ROUTE HAS', () => {
  assert.equal(limits.classOf(undefined), 'read');
  assert.equal(limits.classOf('no-such-method'), 'read');
  assert.equal(limits.classOf('propose'), 'write');
});

test('THE BINDING SPEAKS THE SAME TYPE, AND AN ABSENT ONE LIMITS NOTHING', async () => {
  const asked: { name: string; key: string }[] = [];
  const binding = (name: string, success: boolean) => ({
    limit: async ({ key }: { key: string }) => (asked.push({ name, key }), { success }),
  });

  const l = limits.bindingLimiter({ read: binding('RL_READ', true), write: binding('RL_WRITE', false) });
  assert.deepEqual(await l.limit('token:t_a', 'read'), { ok: true });
  assert.deepEqual(await l.limit('token:t_a', 'write'), { ok: false, retryAfter: 60 });
  assert.deepEqual(asked, [
    { name: 'RL_READ', key: 'token:t_a' },
    { name: 'RL_WRITE', key: 'token:t_a' },
  ]);

  const none = limits.bindingLimiter({});
  assert.deepEqual(await none.limit('token:t_a', 'write'), { ok: true });
});

test('THE VERSION POLL SPENDS ITS OWN BUDGET, SO A TAB POLLING EVERY 1.5 s IS NEVER REFUSED FOR THE READS BESIDE IT', async () => {
  assert.equal(limits.classOf('version'), 'poll');
  assert.equal(limits.POLL_PER_MINUTE, 240);

  const l = limits.windowLimiter(clock().now);
  const a = limits.limitKey(tokenA, '203.0.113.7');
  /* Every read of the minute spent, and the poll still answers: forty a minute is one focused tab at 1.5 s. */
  await spend(l, a, 'read', 600);
  assert.equal((await l.limit(a, 'read')).ok, false);
  await spend(l, a, 'poll', 240);
  assert.equal((await l.limit(a, 'poll')).ok, false, 'the 241st poll is refused');
});

test('A POLL WITH NO RL_POLL BOUND SPENDS RL_READ, AND WITH ONE BOUND SPENDS THAT', async () => {
  const asked: string[] = [];
  const binding = (name: string) => ({ limit: async () => (asked.push(name), { success: true }) });
  await limits.bindingLimiter({ read: binding('RL_READ') }).limit('person:p_1', 'poll');
  await limits.bindingLimiter({ read: binding('RL_READ'), poll: binding('RL_POLL') }).limit('person:p_1', 'poll');
  assert.deepEqual(asked, ['RL_READ', 'RL_POLL']);
});

test('A REQUEST WITH NO DOOR IS COUNTED BY ITS PLACE: one IPv6 network is one budget', () => {
  assert.equal(limits.limitKey(null, '2001:db8:0:1::5'), limits.limitKey(null, '2001:db8:0:1::6'));
  assert.notEqual(limits.limitKey(null, '2001:db8:0:1::5'), limits.limitKey(null, '2001:db8:0:2::5'));
});
