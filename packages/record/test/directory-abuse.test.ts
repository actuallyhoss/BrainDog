/**
 * The Directory's counted window (`abuseHit`): within the limit it says yes, past it no with the seconds left, a new
 * window starts when the old one ends, two keys never share a count, and a weighty hit (a file's bytes) spends its weight.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  return { sql, clock, d };
}

test('THE LAST HIT WITHIN THE LIMIT PASSES AND THE NEXT IS REFUSED WITH THE SECONDS LEFT', () => {
  const { clock, d } = setup();
  for (let i = 0; i < 3; i++) assert.equal(d.abuseHit('rl:t:ip', 60, 3, 1).ok, true, `hit ${i + 1}`);
  clock.advance(20_000);
  const over = d.abuseHit('rl:t:ip', 60, 3, 1);
  assert.equal(over.ok, false);
  assert.equal(over.retryAfter, 40);
});

test('A NEW WINDOW STARTS WHEN THE OLD ONE ENDS, AND A REFUSAL DOES NOT EXTEND THE WAIT', () => {
  const { clock, d } = setup();
  for (let i = 0; i < 4; i++) d.abuseHit('rl:t:ip', 60, 3, 1);
  clock.advance(59_000);
  assert.equal(d.abuseHit('rl:t:ip', 60, 3, 1).retryAfter, 1, 'hits while refused do not push the end out');
  clock.advance(1_000);
  assert.equal(d.abuseHit('rl:t:ip', 60, 3, 1).ok, true);
});

test('TWO KEYS NEVER SHARE A COUNT', () => {
  const { d } = setup();
  for (let i = 0; i < 4; i++) d.abuseHit('rl:t:a', 60, 3, 1);
  assert.equal(d.abuseHit('rl:t:a', 60, 3, 1).ok, false);
  assert.equal(d.abuseHit('rl:t:b', 60, 3, 1).ok, true);
});

test('A HIT WITH WEIGHT SPENDS ITS WEIGHT, AND ONE LARGER THAN THE DAY IS REFUSED AT ONCE', () => {
  const { d } = setup();
  assert.equal(d.abuseHit('rl:bytes:rec', 86_400, 100, 60).ok, true);
  assert.equal(d.abuseHit('rl:bytes:rec', 86_400, 100, 60).ok, false, '120 of 100');
  assert.equal(d.abuseHit('rl:bytes:other', 86_400, 100, 101).ok, false, 'one hit over the whole limit');
});

test('A BAD KEY OR NUMBER IS A WAIT AND NEVER A PASS', () => {
  const { d } = setup();
  assert.equal(d.abuseHit('', 60, 3, 1).ok, false);
  assert.equal(d.abuseHit('rl:x', 0, 3, 1).ok, false);
  assert.equal(d.abuseHit('rl:x', 60, 3, 1.5).ok, false);
});
