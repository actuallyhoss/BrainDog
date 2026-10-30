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
