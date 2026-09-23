/**
 * A door a live pattern names is not retired out from under it (`loop/research-batch-forty-two-audit.md` finding 4 (c)).
 *
 * MEASURED BEFORE THIS FILE: the door retired `ok`, and left its pattern installed naming a door no text can arrive at,
 * which is the declaration `doorFault` refuses at install. The first attempt at this guard, on 23 September, stopped
 * money-core's own update because the plan retired `bank-from-out-sms` while handing the pattern naming it; the plan
 * now hands the door with its pattern (`packages/declare/test/door-follows-patterns.test.ts`), which is what lets the
 * guard stand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const LINES: Declaration = {
  id: 'register.lines',
  kind: 'register',
  body: { id: 'lines', name: 'Lines', title: 'merchant', fields: [{ id: 'merchant', type: 'text', required: true }] } as never,
};

const HOOK = (ingest: string, word: string, more: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: {
    ingest,
    channel: 'webhook',
    verify: { kind: 'path' },
    match: { all: [{ field: 'body', contains: word }] },
    extract: { merchant: { text: { between: ['You ', ' EGP'] } } },
    writes: { register: 'lines', confidence: 'exact' },
    ...more,
  } as never,
});

const DOOR = HOOK('door', 'EGP');
const TWIN = HOOK('twin', 'withdrew', { door: 'door' });

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([LINES, DOOR, TWIN]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

test('A DOOR A LIVE PATTERN NAMES IS NOT RETIRED, and the refusal names the pattern', async () => {
  const { k, sql } = await record();
  const out = k.retire(['ingest.door']) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(out.ok, false, 'the door was retired under the pattern that reads it');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(out.refusal?.at, 'ingest.twin');
  assert.match(out.refusal?.fix ?? '', /ingest\.twin/);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'ingest.door' AND retired = 0")?.n, 1);
  sql.close();
});

test('THE DOOR AND ITS PATTERN RETIRED TOGETHER GO, and so does a pattern alone', async () => {
  const both = await record();
  assert.equal((both.k.retire(['ingest.door', 'ingest.twin']) as { ok: boolean }).ok, true);
  both.sql.close();

  const twin = await record();
  assert.equal((twin.k.retire(['ingest.twin']) as { ok: boolean }).ok, true);
  assert.equal((twin.k.retire(['ingest.door']) as { ok: boolean }).ok, true, 'a door nobody names any more was held');
  twin.sql.close();
});

/* A DISABLE RETIRES ONE PACK AT A TIME, so the pattern's pack, turned off in the same call, has to count as going while
   the door's pack is retired first. Measured when this test was written: with `alsoGoing` taken out of the guard's
   `going`, every kernel test still passed, and a disable of the door's pack with the pattern's in `alsoDisable` was
   refused at `ingest.twin`. */
test('A DISABLE THAT TAKES THE DOOR AND ITS PATTERN IN TWO PACKS GOES, and the door\'s pack alone is refused', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LINES, { ...DOOR, pack: 'door-pack' }, { ...TWIN, pack: 'twin-pack' }])).ok);
  for (const id of ['door-pack', 'twin-pack'])
    k.rememberPack({ id, version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: id, version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }), checksum: `sum-${id}` });

  const alone = k.disablePack('door-pack');
  assert.equal(!alone.ok && 'refusal' in alone ? alone.refusal.at : JSON.stringify(alone), 'ingest.twin', 'the door\'s pack went off under the pattern that reads it');
  const both = k.disablePack('door-pack', { alsoDisable: ['twin-pack'] });
  assert.ok(both.ok, JSON.stringify(both));
  assert.deepEqual(both.value.declarations, ['ingest.door', 'ingest.twin']);
  sql.close();
});

/* ON THE DISABLE ROAD THE FIX IS alsoDisable, NOT A RETIRE. Measured when this test was written, against the guard as
   wave 47 landed it: `disablePack('door-pack')` was refused "Retire it in the same call, or keep ingest.door.", which
   names an act a disable caller cannot take, since `disablePack` retires by pack and takes no ids. The refusal now
   names the pattern's pack for `alsoDisable`, as `PACK_REQUIRED` does, and says to leave the asked pack on. */
test('A DISABLE REFUSED FOR THE DOOR SAYS TO ADD THE PATTERN\'S PACK TO alsoDisable, and a pattern no pack owns is named to retire', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LINES, { ...DOOR, pack: 'door-pack' }, { ...TWIN, pack: 'twin-pack' }])).ok);
  for (const id of ['door-pack', 'twin-pack'])
    k.rememberPack({ id, version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: id, version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }), checksum: `sum-${id}` });
  const alone = k.disablePack('door-pack') as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(alone.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(alone.refusal?.at, 'ingest.twin');
  assert.equal(
    alone.refusal?.fix,
    'ingest.door is the door ingest.twin reads, and turning door-pack off would leave that pattern naming a door nothing arrives at. Add twin-pack to alsoDisable to turn it off in the same call, or leave door-pack on.',
  );
  sql.close();

  /* A PATTERN NO PACK OWNS cannot go in alsoDisable, so it is named to retire first. */
  const bare = openSqlite();
  const b = await openRecord(bare, fixedClock(NOW));
  assert.ok((await b.install([LINES, { ...DOOR, pack: 'door-pack' }, TWIN])).ok);
  b.rememberPack({ id: 'door-pack', version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: 'door-pack', version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }), checksum: 'sum-door-pack' });
  const loose = b.disablePack('door-pack') as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(
    loose.refusal?.fix,
    'ingest.door is the door ingest.twin reads, and turning door-pack off would leave that pattern naming a door nothing arrives at. Retire ingest.twin first, or leave door-pack on.',
  );
  bare.close();
});
