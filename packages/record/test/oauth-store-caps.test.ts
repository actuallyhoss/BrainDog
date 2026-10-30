/**
 * SEC8 (security review of 30 Oct): THE OAUTH STORE'S TABLES COULD BE FILLED FOR GOOD. Registered clients were never
 * pruned, so fifty thousand registrations answered `full` to every app after; and one registered client could hold every
 * waiting sign-in. Now a registration that never connected is pruned after a month, a metadata document's copy after a
 * day, and one registered app holds at most its share of the waiting sign-ins.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answerOAuth, type HeldRequest, type OAuthClient } from '../src/oauth.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;

function store(start: number) {
  const sql = openSqlite();
  let at = start;
  const clock = { now: () => at };
  return { sql, clock, move: (ms: number) => void (at += ms), call: <C extends Parameters<typeof answerOAuth>[2]>(c: C) => answerOAuth(sql, clock, c) };
}

const client = (id: string, at: number, source: 'dcr' | 'cimd' = 'dcr'): OAuthClient => ({ client_id: id, name: id, redirect_uris: ['http://127.0.0.1/cb'], source, created_at: at });
const held = (id: string, client_id: string, expires: number): HeldRequest => ({ id, client_id, redirect_uri: 'http://127.0.0.1/cb', challenge: 'c'.repeat(43), scope: 'read', state: '', expires });

test('SEC8: A REGISTRATION THAT NEVER CONNECTED IS PRUNED AFTER A MONTH, AND ONE THAT CONNECTED IS KEPT', async () => {
  const s = store(Date.UTC(2026, 9, 1));
  const t0 = s.clock.now();
  assert.equal(s.call({ op: 'register', client: client('bdc_junk', t0) }), 'ok');
  assert.equal(s.call({ op: 'register', client: client('bdc_used', t0) }), 'ok');
  assert.equal(
    s.call({ op: 'family', row: { id: 'f1', client_id: 'bdc_used', record: 'rec_1', scope: 'read', cur_hash: 'h', cur_sealed: 's', prev_hash: null, prev_sealed: null, prev_until: 0, expires: t0 + DAY, ends: t0 + DAY } }),
    'ok',
  );
  s.move(31 * DAY);
  /* A NEW REGISTRATION IS WHAT PRUNES. The family has expired by now, but its client connected within half a year. */
  assert.equal(s.call({ op: 'register', client: client('bdc_new', s.clock.now()) }), 'ok');
  assert.equal(s.call({ op: 'client', client_id: 'bdc_junk' }), null, 'a registration that never connected was kept');
  assert.notEqual(s.call({ op: 'client', client_id: 'bdc_used' }), null, 'an app that connected lost its registration');
});

test("SEC8: A METADATA DOCUMENT'S COPY IS PRUNED A DAY ON, to be read again when it is next used", async () => {
  const s = store(Date.UTC(2026, 9, 1));
  assert.equal(s.call({ op: 'register', client: client('https://app.example/oauth.json', s.clock.now(), 'cimd') }), 'ok');
  s.move(DAY + 1);
  assert.equal(s.call({ op: 'register', client: client('bdc_new', s.clock.now()) }), 'ok');
  assert.equal(s.call({ op: 'client', client_id: 'https://app.example/oauth.json' }), null);
});

test('SEC8: ONE REGISTERED APP HOLDS AT MOST ITS SHARE OF THE WAITING SIGN-INS; ANOTHER STILL GETS ITS OWN', async () => {
  const s = store(Date.UTC(2026, 9, 1));
  const now = s.clock.now();
  s.call({ op: 'register', client: client('bdc_flood', now) });
  s.call({ op: 'register', client: client('bdc_other', now) });
  let full = -1;
  for (let i = 0; i < 200; i++) {
    if (s.call({ op: 'hold', request: held(`req_flood_${i}`.padEnd(20, 'x'), 'bdc_flood', now + 600_000) }) === 'full') {
      full = i;
      break;
    }
  }
  assert.ok(full > 0 && full < 200, 'one client held every waiting sign-in it asked for');
  assert.equal(s.call({ op: 'hold', request: held('req_other_1'.padEnd(20, 'x'), 'bdc_other', now + 600_000) }), 'ok');
});

/* RD10: `oauth_client_used` STARTED EMPTY, so the first registration after it shipped pruned every month-old connector
   whose family had ended. The clients already there count as used when they registered, once. */
test('RD10: CLIENTS REGISTERED BEFORE THE PRUNE SHIPPED ARE KEPT; JUNK REGISTERED AFTER IT IS STILL PRUNED', async () => {
  const s = store(Date.UTC(2026, 9, 1));
  const t0 = s.clock.now();
  /* The tables, as a Directory that has run OAuth before has them, and a client written before the used list was kept. */
  assert.equal(s.call({ op: 'client', client_id: 'bdc_none' }), null);
  s.sql.exec('INSERT INTO oauth_client (client_id, name, redirect_uris, source, created_at) VALUES (?, ?, ?, ?, ?)', 'bdc_old', 'Old', '[]', 'dcr', t0 - 40 * DAY);
  assert.equal(s.call({ op: 'register', client: client('bdc_first', t0) }), 'ok');
  assert.notEqual(s.call({ op: 'client', client_id: 'bdc_old' }), null, 'a connector from before the prune was pruned at deploy');
  assert.equal(s.call({ op: 'register', client: client('bdc_junk', s.clock.now()) }), 'ok');
  s.move(31 * DAY);
  assert.equal(s.call({ op: 'register', client: client('bdc_later', s.clock.now()) }), 'ok');
  assert.equal(s.call({ op: 'client', client_id: 'bdc_junk' }), null, 'the seed ran again and kept junk');
});

/* RD4: A FAMILY REMEMBERS THE TOKENS IT LEFT BEHIND, and one of them coming back ends it. */
test('RD4: A TOKEN THE FAMILY LEFT BEHIND ENDS IT; A RETRY INSIDE THE GRACE IS SPENT ONCE', async () => {
  const s = store(Date.UTC(2026, 9, 1));
  const t0 = s.clock.now();
  const family = (id: string) =>
    s.call({ op: 'family', row: { id, client_id: 'bdc_app', record: 'rec_1', scope: 'read', cur_hash: `${id}1`, cur_sealed: 's', prev_hash: null, prev_sealed: null, prev_until: 0, expires: t0 + DAY, ends: t0 + 90 * DAY } });
  const rotate = (id: string, from: string, to: string) =>
    s.call({ op: 'refresh_rotate', id, expect_cur: from, next: { cur_hash: to, cur_sealed: 's', prev_hash: from, prev_sealed: 's', prev_until: s.clock.now() + 120_000, expires: s.clock.now() + DAY } });
  assert.equal(family('a'), 'ok');
  assert.equal(rotate('a', 'a1', 'a2'), true);
  assert.equal(rotate('a', 'a2', 'a3'), true);
  assert.equal(rotate('a', 'a3', 'a4'), true);
  assert.equal(s.call({ op: 'refresh_get', hash: 'a4' })?.which, 'current');
  /* a2 is two rotations back: nobody honest still holds it. */
  assert.equal(s.call({ op: 'refresh_get', hash: 'a2' }), null);
  assert.equal(s.call({ op: 'refresh_get', hash: 'a4' }), null, 'the family outlived a token it had left behind');

  assert.equal(family('b'), 'ok');
  assert.equal(rotate('b', 'b1', 'b2'), true);
  assert.equal(s.call({ op: 'refresh_retry', id: 'b', hash: 'b1' }), true);
  assert.equal(s.call({ op: 'refresh_retry', id: 'b', hash: 'b1' }), false, 'a retry was answered twice');
  assert.equal(s.call({ op: 'refresh_get', hash: 'b1' }), null);
  assert.equal(s.call({ op: 'refresh_get', hash: 'b2' }), null, 'the replaced token came back twice and the family stayed');
});
