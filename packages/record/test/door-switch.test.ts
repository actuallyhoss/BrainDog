/**
 * A door switched off and on again keeps its address (SHL-C13): `doorSwitch`, `doorIsOff`, `turnedAway` and `doorFacts`.
 *
 * MEASURED BEFORE THIS WAS WRITTEN: nothing turned a door off but retiring its declaration, and `heldDigest` deletes the
 * digest of a retired one, so the token a sender carried stopped verifying for good. Here the digest `ingestVerify`
 * answers is the same before off, while off, and after on.
 *
 * `doorSwitch` IS HANDED THE RECORD'S OWN KERNEL, STORAGE AND CLOCK, and a guard that answers a token the way the
 * record's `admin` does, because registering the method is a line in `methods/index.ts` this change does not own. Every
 * name is invented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHash } from 'node:crypto';
import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { AWAY_DAYS, doorAwayKey, doorFacts, doorIsOff, methods, turnedAway } from '../src/methods/door-switch.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 3, 9);
const DAY = 86_400_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent = { principal: { kind: 'token', id: 't_kiln', person: 'p_owner', level: 'owner' } } as unknown as CallContext;

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const door = (id: string) => ({
  id: `ingest.${id}`,
  kind: 'ingest' as const,
  body: { ingest: id, channel: 'webhook', verify: { kind: 'path' }, description: `Readings posted by ${id}.`, map: { body: { path: '$.text', type: 'text' } }, writes: { register: 'notes' } } as never,
});

async function record(at = NOW) {
  const clock = fixedClock(at);
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const made = await api.createRecord({ id: REC, slug: 'the-pottery', name: 'The Pottery', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'mira@example.com', name: 'Mira' } });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok((await api.kernel.install([NOTES, door('kiln-sensor'), door('garden-gate')])).ok);
  /* THE RECORD'S `admin`, AS FAR AS THIS METHOD READS IT: a token refused before anything else, an owner let through. */
  const admin = (ctx: CallContext) =>
    ctx.principal.kind === 'token' ? { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot switch a door off or on.', at: 'principal' } : null;
  const deps = { kernel: api.kernel, sql, admin, no, tail: async <T>(x: T) => x, clock } as unknown as RecordDeps;
  return { sql, api, sw: methods(deps).doorSwitch };
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

test('OFF KEEPS THE DIGEST AND SAYS SINCE WHEN, with one event naming the door and who switched it', async () => {
  const { sql, api, sw } = await record();
  const minted = await api.ingestMint({ ingest: 'kiln-sensor' }, owner);
  assert.ok(minted.ok);
  const digest = sha256(minted.value.token);
  const off = await sw({ ingest: 'kiln-sensor', on: false }, owner);
  assert.ok(off.ok, JSON.stringify(off));
  assert.equal(off.value.on, false);
  assert.equal(off.value.offSince, new Date(NOW).toISOString());
  assert.equal(doorIsOff(sql, 'kiln-sensor'), new Date(NOW).toISOString());
  assert.equal(doorIsOff(sql, 'garden-gate'), null);
  /* OFF IS ANSWERED BEFORE ANY KEY, so the host turns the arrival away; the digest stays kept for on again. */
  assert.deepEqual(await api.ingestVerify({ ingest: 'kiln-sensor' }), { kind: 'none', off: true });
  const events = sql.all<Record<string, string | null>>("SELECT * FROM event WHERE target = 'door:kiln-sensor' AND kind = 'state'");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.actor, 'p_owner');
  assert.ok(!JSON.stringify(events).includes(digest), 'the event carries the digest');
  /* OFF TWICE WRITES NOTHING: the first instant stands and there is still one event. */
  assert.ok((await sw({ ingest: 'kiln-sensor', on: false }, owner)).ok);
  assert.equal(sql.all("SELECT id FROM event WHERE target = 'door:kiln-sensor' AND kind = 'state'").length, 1);
  sql.close();
});

test('AN ARRIVAL AT A DOOR THAT IS OFF IS COUNTED AS TURNED AWAY, and doorFacts never answers the digest', async () => {
  const { sql, api, sw } = await record();
  const minted = await api.ingestMint({ ingest: 'kiln-sensor' }, owner);
  assert.ok(minted.ok);
  assert.ok((await sw({ ingest: 'kiln-sensor', on: false }, owner)).ok);
  assert.equal(turnedAway(sql, 'kiln-sensor', NOW), 1);
  assert.equal(turnedAway(sql, 'kiln-sensor', NOW + 60_000), 2);
  const facts = doorFacts(sql, 'kiln-sensor', NOW + 120_000);
  assert.deepEqual(facts, { on: false, offSince: new Date(NOW).toISOString(), lastArrival: null, arrivals: 0, turnedAway: 2 });
  assert.ok(!JSON.stringify(facts).includes(sha256(minted.value.token)));
  sql.close();
});

test('ON AGAIN IS THE SAME ADDRESS: the digest the sender carries verifies as it did before off', async () => {
  const { sql, api, sw } = await record();
  const minted = await api.ingestMint({ ingest: 'kiln-sensor' }, owner);
  assert.ok(minted.ok);
  const before = await api.ingestVerify({ ingest: 'kiln-sensor' });
  assert.ok((await sw({ ingest: 'kiln-sensor', on: false }, owner)).ok);
  const on = await sw({ ingest: 'kiln-sensor', on: true }, owner);
  assert.ok(on.ok, JSON.stringify(on));
  assert.equal(on.value.on, true);
  assert.equal(on.value.offSince, null);
  assert.equal(doorIsOff(sql, 'kiln-sensor'), null);
  assert.deepEqual(await api.ingestVerify({ ingest: 'kiln-sensor' }), before);
  assert.equal(sql.all("SELECT id FROM event WHERE target = 'door:kiln-sensor' AND kind = 'state'").length, 2);
  sql.close();
});

test('A TOKEN IS REFUSED NEEDS_BROWSER_SESSION, and so is turning on after a stale sign-in, which leaves the door off', async () => {
  const { sql, sw } = await record();
  const refused = await sw({ ingest: 'kiln-sensor', on: false }, agent);
  assert.ok(!refused.ok && 'refusal' in refused);
  assert.equal(refused.refusal.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(doorIsOff(sql, 'kiln-sensor'), null);
  /* OFF NEEDS NO FRESH SIGN-IN; ON DOES. */
  const stale = { ...owner, provedAt: NOW - 16 * 60_000 };
  assert.ok((await sw({ ingest: 'kiln-sensor', on: false }, stale)).ok);
  const back = await sw({ ingest: 'kiln-sensor', on: true }, stale);
  assert.ok(!back.ok && 'refusal' in back);
  assert.equal(back.refusal.code, 'NEEDS_BROWSER_SESSION');
  assert.notEqual(doorIsOff(sql, 'kiln-sensor'), null);
  /* A HOST STARTED WITHOUT ITS KEY PROVES NOBODY. */
  const open = await sw({ ingest: 'garden-gate', on: false }, { ...owner, credentialed: false });
  assert.ok(!open.ok && 'refusal' in open);
  assert.equal(open.refusal.code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

test('A DOOR NOBODY DECLARED, OR NO WAY SAID, IS REFUSED WITH A SENTENCE and nothing is written', async () => {
  const { sql, sw } = await record();
  const unknown = await sw({ ingest: 'pond-pump', on: false }, owner);
  assert.ok(!unknown.ok && 'refusal' in unknown);
  assert.equal(unknown.refusal.code, 'DECLARATION_UNKNOWN');
  const unsaid = await sw({ ingest: 'kiln-sensor' }, owner);
  assert.ok(!unsaid.ok && 'refusal' in unsaid);
  assert.equal(unsaid.refusal.code, 'REQUIRED_MISSING');
  assert.equal(sql.all("SELECT key FROM dog_meta WHERE key LIKE 'ingest_off.%'").length, 0);
  sql.close();
});

test(`COUNTS ARE CUT AT ${AWAY_DAYS} DAYS: the kept row holds a week at most and the facts count only the week`, async () => {
  const { sql } = await record();
  turnedAway(sql, 'garden-gate', NOW);
  turnedAway(sql, 'garden-gate', NOW + 3 * DAY);
  turnedAway(sql, 'garden-gate', NOW + 3 * DAY);
  assert.equal(doorFacts(sql, 'garden-gate', NOW + 3 * DAY).turnedAway, 3);
  /* EIGHT DAYS ON, THE FIRST DAY HAS LEFT THE WINDOW, and the write that adds today drops it from the row. */
  assert.equal(turnedAway(sql, 'garden-gate', NOW + 8 * DAY), 3);
  const kept = JSON.parse(sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', doorAwayKey('garden-gate'))!.value) as Record<string, number>;
  assert.deepEqual(Object.keys(kept).sort(), ['2026-10-06', '2026-10-11']);
  assert.equal(doorFacts(sql, 'garden-gate', NOW + 20 * DAY).turnedAway, 0);
  sql.close();
});

test('ARRIVALS ARE THE RECEIPTS THE RECORD KEPT: the newest is the last arrival, and only the week is counted', async () => {
  const { sql } = await record();
  const receipt = (id: string, raw: string, ms: number) =>
    sql.exec("INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, 'kiln-sensor', '[]', 'exact', ?)", id, raw, new Date(ms).toISOString());
  receipt('r1', 'raw1', NOW - 10 * DAY);
  receipt('r2', 'raw2', NOW - 2 * DAY);
  receipt('r3', 'raw3', NOW - DAY);
  const facts = doorFacts(sql, 'kiln-sensor', NOW);
  assert.equal(facts.lastArrival, new Date(NOW - DAY).toISOString());
  assert.equal(facts.arrivals, 2);
  assert.equal(facts.on, true);
  sql.close();
});
