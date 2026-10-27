/**
 * The engine's health on a host: `engineHealthRead` over Slash's real ledger, and `GET /api/slash/health`.
 *
 * WHY THIS FILE EXISTS. The version door said `slash: true` when a model was configured, not when one answered, and Settings
 * said "All healthy" on the day a model job died. The read built here is what the door and the record both answer, so each
 * case runs the package's own functions over a ledger `createSlash` built, the way both hosts load them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineHealthRead, type EngineHealthFns, type EngineHealthRead } from '../src/engine-health.ts';
import { serveSlash, servesSlash, slashAskDoor, type SlashAskDoor } from '../src/slash-ask.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const ORIGIN = 'https://brain.dog';

const load = async (): Promise<EngineHealthFns> => import('../../slash/src/index.ts');

/** A ledger the package built, with three failed asks from `T0` an hour apart, and the clock an hour after the last. */
const failing = () => {
  const sql = openSqlite();
  const clock = fixedClock(T0 + 3 * HOUR);
  createSlash({ sql, clock, inference: { complete: () => Promise.reject(new Error('unused')) }, record: {} as never });
  for (let i = 0; i < 3; i++)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
       VALUES (?, ?, 'read', ?, '-', 0, 0, 0, 0, 'error', ?)`,
      `f${i}`,
      new Date(T0 + i * HOUR).toISOString(),
      'a',
      'UNREACHABLE',
    );
  return { sql, clock };
};

test('A HOST WITH NO MODEL IS off, and loads nothing to say so', async () => {
  let loaded = 0;
  const read = engineHealthRead({ sql: openSqlite(), clock: fixedClock(T0), model: false, load: async () => (loaded++, load()) });
  const out = await read();
  assert.equal(out.health.state, 'off');
  assert.equal(out.said.text, 'Slash has no model on this host, so BrainDog works from its rules.');
  assert.equal(loaded, 0);
  /* The host's sentence is the package's own. */
  const fns = await load();
  assert.deepEqual(fns.engineSaid(out.health, T0), out.said);
});

test('THREE FAILURES ON THE INCLUDED MODEL are ours, with the date of the first', async () => {
  const { sql, clock } = failing();
  const out = await engineHealthRead({ sql, clock, model: true, load })();
  assert.deepEqual(out, {
    health: { state: 'not_answering', last_ok: null, since: new Date(T0).toISOString() },
    said: {
      text: "Slash's model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules.",
      whose: 'ours',
    },
  } satisfies EngineHealthRead);
});

test('HIS OWN KEY, REVOKED IN THE KEYCHAIN, is key_closed and his to fix, with no row in the ledger', async () => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  createSlash({ sql, clock, inference: { complete: () => Promise.reject(new Error('unused')) }, record: {} as never });
  sql.exec("UPDATE slash_settings SET tier = 'b', model = 'claude-own', grant_id = 'g_1'");
  const grants = [{ id: 'g_1', kind: 'api_token', revoked_at: '2026-10-05T00:00:00.000Z' }];
  const out = await engineHealthRead({ sql, clock, model: true, load, grants: () => grants })();
  assert.equal(out.health.state, 'key_closed');
  assert.equal(out.said.whose, 'yours');
  assert.equal(out.said.text, 'Your own key for Slash will not open. Open it in the keychain, or switch to the included model.');
  /* A live key with nothing asked yet is a quiet engine, not a closed key. */
  grants[0] = { id: 'g_1', kind: 'api_token', revoked_at: null as unknown as string };
  assert.equal((await engineHealthRead({ sql, clock, model: true, load, grants: () => grants })()).health.state, 'never_asked');
});

const get = (path: string, headers: Record<string, string> = {}): Request => new Request(`${ORIGIN}${path}`, { method: 'GET', headers });

test('GET /api/slash/health answers any signed-in person, with or without an engine, and nothing else', async () => {
  assert.equal(servesSlash('/api/slash/health'), 'health');
  const { sql, clock } = failing();
  const health = engineHealthRead({ sql, clock, model: true, load });
  /* No engine wired, a health read handed: the read still answers. */
  const door: SlashAskDoor<{ who: string }> = { origins: new Set([ORIGIN]), health };
  const ok = await serveSlash(get('/api/slash/health'), door, { who: 'member' });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { ok: boolean; value: EngineHealthRead };
  assert.equal(body.value.health.state, 'not_answering');
  /* The door built by `slashAskDoor` carries it the same way. */
  const built = slashAskDoor(new Set([ORIGIN]), async () => undefined, undefined, { health });
  assert.equal((await serveSlash(get('/api/slash/health'), built, { who: 'owner' })).status, 200);
  /* A bearer, another site, a POST and a host that hands no read. */
  assert.equal((await serveSlash(get('/api/slash/health', { authorization: 'Bearer t' }), door, { who: 'x' })).status, 403);
  assert.equal((await serveSlash(get('/api/slash/health', { 'sec-fetch-site': 'cross-site' }), door, { who: 'x' })).status, 403);
  assert.equal((await serveSlash(new Request(`${ORIGIN}/api/slash/health`, { method: 'POST', headers: { origin: ORIGIN } }), door, { who: 'x' })).status, 405);
  assert.equal((await serveSlash(get('/api/slash/health'), { origins: new Set([ORIGIN]) }, { who: 'x' })).status, 501);
});
