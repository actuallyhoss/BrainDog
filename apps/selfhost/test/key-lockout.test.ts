/**
 * SEC5 (security review of 30 Oct): THE SERVER KEY COULD BE GUESSED WITHOUT LIMIT OVER `/api` AND `/mcp`. Each miss was a
 * 401 and nothing more, so a loop of `Authorization: Bearer <guess>` at `GET /api/boot` from anywhere that reached the
 * port was a loop with no end, and a hit was the owner. Now ten misses from one place lock it for fifteen minutes (wrong
 * keys only: the right key still gets in, RG14), and a place is an IPv4 address or an IPv6 /64.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KEY_TRIES, keyLockout, nearPeer, PEER_CEILING, peerSlow, peerSlowFor, placeOf, proxied, proxyTrustOf } from '../src/key-lockout.ts';
import { start } from '../src/server.ts';

test('SEC5: TEN MISSES LOCK THE PLACE UNTIL THE LOCK ENDS', () => {
  let at = 0;
  const lock = keyLockout(() => at);
  for (let i = 0; i < KEY_TRIES.most; i++) {
    assert.equal(lock.locked('203.0.113.9'), null, `miss ${i + 1} was refused before it was compared`);
    lock.strike('203.0.113.9');
  }
  assert.ok(lock.locked('203.0.113.9') !== null);
  /* ANOTHER PLACE IS NOT LOCKED BY IT. */
  assert.equal(lock.locked('203.0.113.10'), null);
  at += KEY_TRIES.window + 1;
  assert.equal(lock.locked('203.0.113.9'), null, 'the lock never ended');
});

test('SEC5: AN IPv6 /64 IS ONE PLACE, so a fresh address per guess is the same guesser', () => {
  const lock = keyLockout(() => 0);
  for (let i = 0; i < KEY_TRIES.most; i++) lock.strike(`2001:db8:1:2::${(i + 1).toString(16)}`);
  assert.ok(lock.locked('2001:db8:1:2:ffff:ffff:ffff:ffff') !== null);
  assert.equal(lock.locked('2001:db8:1:3::1'), null);
});

test('SEC5: THE RIGHT KEY CLEARS THE PLACE IT CAME FROM, so an owner who mistyped can carry on', () => {
  const lock = keyLockout(() => 0);
  for (let i = 0; i < KEY_TRIES.most - 1; i++) lock.strike('198.51.100.1');
  lock.clear('198.51.100.1');
  for (let i = 0; i < KEY_TRIES.most - 1; i++) lock.strike('198.51.100.1');
  assert.equal(lock.locked('198.51.100.1'), null);
});

test('SEC5, RG14: OVER HTTP, THE ELEVENTH GUESS AT /api AND /mcp IS 429, AND THE RIGHT KEY STILL GETS IN', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-keylock-'));
  const KEY = 'k'.repeat(40);
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, token: KEY, host: '127.0.0.1' });
  const port = (running.server.address() as { port: number }).port;
  const boot = (bearer: string) => fetch(`http://127.0.0.1:${port}/api/boot`, { headers: { authorization: `Bearer ${bearer}` } });
  try {
    for (let i = 0; i < KEY_TRIES.most; i++) assert.equal((await boot(`guess-${i}`)).status, 401, `guess ${i + 1}`);
    assert.equal((await boot('guess-eleven')).status, 429);
    /* THE RIGHT KEY DURING THE LOCK GETS IN AT ONCE (RG14): the lock holds wrong keys only. */
    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.notEqual(mcp.status, 429, 'the right key was held by the lock at /mcp');
    assert.notEqual(mcp.status, 401);
    const right = await boot(KEY);
    assert.notEqual(right.status, 429, 'the right key was held by the lock at /api');
    assert.notEqual(right.status, 401);
    /* AND IT CLEARED THE PLACE, so a mistyped key after it is a plain miss again. */
    assert.equal((await boot('guess-after')).status, 401);
    /* AN AGENT'S TOKEN IS ITS OWN CHECK AND IS NOT HELD BY THE KEY'S LOCK: a dotted bearer is still answered. */
    assert.equal((await boot('rec_x.not-a-real-token')).status, 401);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* RD7: BEHIND A PROXY THE HOST WAS NOT TOLD TO TRUST, every request is the proxy's address, and nothing said so. */
test('RD7: A FORWARDING HEADER FROM A PEER ON THIS MACHINE OR ITS NETWORK READS AS A PROXY; ONE FROM OUTSIDE DOES NOT', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.4', '172.18.0.2', '192.168.1.20', 'fd00::5']) {
    assert.equal(nearPeer(peer), true, peer);
    assert.equal(proxied(peer, { 'x-forwarded-for': '198.51.100.7' }), true, peer);
    assert.equal(proxied(peer, {}), false, `${peer} with no forwarding header`);
  }
  for (const peer of ['198.51.100.7', '172.32.0.1', '2001:db8::1']) assert.equal(proxied(peer, { 'x-forwarded-for': '203.0.113.9' }), false, peer);
});

test('RJ2: OVER HTTP, A FLOOD OF WRONG KEYS THROUGH ONE PEER NEVER HOLDS THE RIGHT KEY', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-peerslow-'));
  const KEY = 'k'.repeat(40);
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, token: KEY, host: '127.0.0.1', trustProxy: true });
  const port = (running.server.address() as { port: number }).port;
  const boot = (bearer: string, from: string) =>
    fetch(`http://127.0.0.1:${port}/api/boot`, { headers: { authorization: `Bearer ${bearer}`, 'x-forwarded-for': from } });
  try {
    for (let i = 0; i < PEER_CEILING.most; i++) await boot(`guess-${i}`, `203.0.113.${(i % 250) + 1}`);
    /* THE PEER IS NOW OVER ITS CEILING: two wrong keys at once take the turn and the one waiter, and a third is a 429. */
    const held = [boot('guess-a', '198.51.100.1'), boot('guess-b', '198.51.100.2'), boot('guess-c', '198.51.100.3')];
    const started = Date.now();
    const right = await boot(KEY, '198.51.100.9');
    assert.notEqual(right.status, 429, 'the right key was held with the guesses');
    assert.notEqual(right.status, 401);
    assert.ok(Date.now() - started < PEER_CEILING.wait, 'the right key waited a turn');
    const statuses = (await Promise.all(held)).map((r) => r.status).sort();
    assert.ok(statuses.includes(429), 'the wrong keys over the ceiling were not bounded');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AI16: THE HEADER IS READ ONLY FROM A PEER THAT IS A TRUSTED PROXY, and from the right past every trusted hop', () => {
  const near = proxyTrustOf('1');
  assert.ok(near !== null && !('wrong' in near));
  /* A CALLER THAT REACHED THE PORT DIRECTLY NAMES NOTHING. */
  assert.deepEqual(placeOf('203.0.113.9', '198.51.100.1', near), { ip: '203.0.113.9', peer: '203.0.113.9' });
  /* BEHIND THE PROXY, THE ENTRY IT WROTE, NOT THE ONE THE CLIENT SENT. */
  assert.deepEqual(placeOf('::ffff:172.18.0.1', '1.1.1.1, 203.0.113.9', near), { ip: '203.0.113.9', peer: '::ffff:172.18.0.1' });
  assert.equal(placeOf('127.0.0.1', '1.1.1.1, 203.0.113.9, 10.0.0.2', near).ip, '203.0.113.9');
  assert.equal(placeOf('203.0.113.9', '1.1.1.1', null).ip, '203.0.113.9');
  const listed = proxyTrustOf('10.0.0.5, fd00::/8');
  assert.ok(listed !== null && !('wrong' in listed));
  assert.equal(placeOf('127.0.0.1', '1.1.1.1', listed).ip, '127.0.0.1');
  assert.equal(placeOf('::ffff:10.0.0.5', '1.1.1.1', listed).ip, '1.1.1.1');
  assert.equal(placeOf('fd12::1', '2001:db8::1', listed).ip, '2001:db8::1');
  assert.equal(proxyTrustOf(undefined), null);
  assert.equal(proxyTrustOf('0'), null);
  const bad = proxyTrustOf('caddy');
  assert.ok(bad !== null && 'wrong' in bad);
});

test('RG3, RH7, RJ2: A PEER OVER THE CEILING HOLDS ITS WRONG KEYS TO ONE ANSWER PER TURN, NEVER LOCKED', () => {
  let at = 0;
  const slow = peerSlow(() => at);
  for (let i = 0; i < PEER_CEILING.most - 1; i++) assert.equal(slow.strike('172.18.0.1'), false);
  assert.deepEqual(slow.turn('172.18.0.1'), { wait: 0 }, 'held under the ceiling');
  assert.equal(slow.strike('172.18.0.1'), true, 'the ceiling was not said once');
  assert.equal(slow.strike('172.18.0.1'), false, 'the ceiling was said twice');
  assert.deepEqual(slow.turn('172.18.0.1'), { wait: 0 }, 'the first turn over the ceiling is now');
  assert.deepEqual(slow.turn('172.18.0.1'), { wait: PEER_CEILING.wait }, 'the next waits one turn');
  const full = slow.turn('172.18.0.1');
  assert.ok('full' in full && full.retryAfter >= 1, 'a third at once was let wait as well');
  assert.deepEqual(slow.turn('172.18.0.2'), { wait: 0 }, 'another peer was held');
  at += PEER_CEILING.wait;
  assert.deepEqual(slow.turn('172.18.0.1'), { wait: PEER_CEILING.wait }, 'a turn freed was not handed on');
  at += PEER_CEILING.window + 1;
  assert.deepEqual(slow.turn('172.18.0.1'), { wait: 0 }, 'the rate never ended');
  const loose = proxyTrustOf('1');
  const exact = proxyTrustOf('127.0.0.1, ::1');
  const range = proxyTrustOf('127.0.0.1, 172.16.0.0/12');
  assert.ok(loose !== null && !('wrong' in loose) && exact !== null && !('wrong' in exact) && range !== null && !('wrong' in range));
  assert.notEqual(peerSlowFor(loose, () => 0), null);
  assert.notEqual(peerSlowFor(range, () => 0), null, 'a list with a range did not count the peer (RH10)');
  assert.equal(peerSlowFor(exact, () => 0), null, 'an exact proxy list counted the peer');
  assert.equal(peerSlowFor(null, () => 0), null);
});

test('RG14: A LOCKED PLACE HOLDS ITS WRONG KEYS TO ONE ANSWER PER TURN; AN UNLOCKED ONE IS NOT HELD', () => {
  let at = 0;
  const lock = keyLockout(() => at);
  assert.deepEqual(lock.turn('203.0.113.9'), { wait: 0 });
  for (let i = 0; i < KEY_TRIES.most; i++) lock.strike('203.0.113.9');
  assert.deepEqual(lock.turn('203.0.113.9'), { wait: 0 }, 'the first wrong key in a lock is answered now');
  assert.deepEqual(lock.turn('203.0.113.9'), { wait: KEY_TRIES.wait }, 'the next waits one turn');
  const full = lock.turn('203.0.113.9');
  assert.ok('full' in full && full.retryAfter >= 1, 'a third at once was let wait as well');
  assert.deepEqual(lock.turn('203.0.113.10'), { wait: 0 }, 'another place was held');
  at += KEY_TRIES.window + 1;
  assert.deepEqual(lock.turn('203.0.113.9'), { wait: 0 }, 'the hold outlasted the lock');
});

test('RG14: A PEER IS COUNTED BY ITS PLACE, so an IPv6 caller on the LAN taking a fresh address is the same peer', () => {
  const slow = peerSlow(() => 0);
  for (let i = 0; i < PEER_CEILING.most - 1; i++) slow.strike(`fd00:1:2:3::${(i + 1).toString(16)}`);
  assert.equal(slow.strike('fd00:1:2:3::ffff'), true, 'a fresh address in the same /64 started a fresh count');
  assert.deepEqual(slow.turn('fd00:1:2:3::abcd'), { wait: 0 });
  assert.deepEqual(slow.turn('fd00:1:2:3::abce'), { wait: PEER_CEILING.wait });
  assert.deepEqual(slow.turn('fd00:1:2:4::1'), { wait: 0 }, 'another /64 was held');
});

test('RG14: OVER HTTP, TEN WRONG KEYS NAMING THE OWNER\'S ADDRESS DO NOT LOCK THE OWNER OUT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-forged-'));
  const KEY = 'k'.repeat(40);
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, token: KEY, host: '127.0.0.1', trustProxy: true });
  const port = (running.server.address() as { port: number }).port;
  const OWNER = '198.51.100.20';
  const boot = (bearer: string) =>
    fetch(`http://127.0.0.1:${port}/api/boot`, { headers: { authorization: `Bearer ${bearer}`, 'x-forwarded-for': OWNER } });
  try {
    for (let i = 0; i < KEY_TRIES.most; i++) assert.equal((await boot(`guess-${i}`)).status, 401, `guess ${i + 1}`);
    assert.equal((await boot('guess-eleven')).status, 429, 'the forged place was not locked for wrong keys');
    const right = await boot(KEY);
    assert.notEqual(right.status, 429, 'a forged address locked the owner out');
    assert.notEqual(right.status, 401);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/auth/token HOLDS ONLY WRONG KEYS, BY THE SOCKET: naming the owner locks nobody out, and a fresh header buys no guesses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-token-door-'));
  const KEY = 'k'.repeat(40);
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    sessionKey: new Uint8Array(32).fill(7),
    port: 0,
    pollMs: 0,
    token: KEY,
    host: '127.0.0.1',
    trustProxy: true,
    limits: null,
  });
  const port = (running.server.address() as { port: number }).port;
  assert.ok(running.directory?.person$('owner@example.test', 'Owner').ok);
  const origin = `http://localhost:${port}`;
  const exchange = (serverKey: string, forwarded: string) =>
    fetch(`http://127.0.0.1:${port}/auth/token`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': forwarded }, body: JSON.stringify({ serverKey }) });
  try {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await exchange(`guess-${i}`, `198.51.100.${i + 1}`)).status;
    assert.equal(last, 429, 'a fresh x-forwarded-for bought every guess a new count');
    assert.equal((await exchange(KEY, '198.51.100.200')).status, 200, 'the right key was held by the lock');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
