/**
 * A copy of the Directory: dumped from one, loaded into an empty one, and what comes back.
 *
 * THE DIRECTORY IS THE ONE THING NOTHING COPIED. `loop/research-restore.md` §6: without it every record survives and
 * nobody can reach one, because no slug, session or passkey leads to `idFromName(rec_id)` any more. So the test is not
 * that rows round-trip but that the loaded Directory answers the questions a person's next visit asks: which record a
 * name means, whether their passkey is theirs, and whether the cookie they had before still opens anything (it must
 * not: a copy that revived sessions would sign back in people who had signed out).
 *
 * THE CEREMONIES ARE REAL, signed by the software authenticator in `fixtures/webauthn/`, as `identity.test.ts` does,
 * so "knows the passkey" is a passkey assertion the loaded Directory verifies, not a row that happens to be there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { CARRIED, LEFT_OUT, createDirectory, type AuthConfig, type Directory } from '../src/directory.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { asJSON, assert as authenticate, register, testKeys } from './fixtures/webauthn/authenticator.ts';

const NOW = Date.UTC(2026, 8, 23, 3, 17);
const DAY = 86_400_000;
const ORIGIN = 'https://studio.example';
const RP_ID = 'studio.example';
const serverKey = 'a-throwaway-server-key-for-these-tests-only';
const KEYS = testKeys()!;
const DIGEST = 'a'.repeat(64);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

function ok<B>(r: AuthResult<B>) {
  if (r.status !== 200) assert.fail(`expected 200, got ${r.status}${'refusal' in r ? ` ${r.refusal.code}` : ''}`);
  return r;
}

const config = (): AuthConfig => ({ mac: new Uint8Array(32).fill(7), rp: { id: RP_ID, origin: ORIGIN }, magic: true, key: { serverKey } });

function fresh(): { d: Directory; sql: NodeSql; clock: ReturnType<typeof fixedClock> } {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  return { d: createDirectory(sql, clock, config()), sql, clock };
}

/** The refusal a load answered, or a failed assertion when it loaded. */
const refusalOf = (r: { ok: boolean }): { code: string; fix: string } =>
  !r.ok && 'refusal' in r ? (r.refusal as { code: string; fix: string }) : assert.fail('this load was supposed to be refused');

const count = (sql: NodeSql, table: string): number => Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);

/**
 * A Directory with the five things the brief names: a person, a passkey, a slug, a member and a session. Plus a
 * released name, a counted run and a forwarding digest, because each is a carried table a restore must not drop.
 */
async function populated() {
  const { d, sql, clock } = fresh();
  const ada = value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id;
  const bo = value<{ id: string }>(d.person$('bo@example.com', 'Bo')).id;
  const made = value<{ record: string }>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));
  value(d.rename('the-studio', 'halden'));
  value(d.join(made.record, bo));
  value(d.inbound$(made.record, DIGEST));
  value(d.meter(made.record, { event: 'ev_1', at: new Date(NOW).toISOString(), ingest: 'bank', scope: 'global', usage: { runs: 1, requests: 2, bytes: 3, ms: 4, failures: 0, held: 0 } }));

  /* THE SESSION FIRST, BECAUSE A PASSKEY IS REGISTERED BEHIND ONE. It comes from a sign-in link, the Cloud's own way
     in: the server key would refuse here, since it signs in only where the Directory holds one person and this holds
     two. */
  const started = ok(await d.auth({ flow: 'magic.start', email: 'ada@example.com', ip: '203.0.113.9' }));
  const linkToken = started.mail && 'linkToken' in started.mail ? started.mail.linkToken : assert.fail('no link');
  const signed = ok(await d.auth({ flow: 'magic.redeem', linkToken, ip: '203.0.113.9' }));
  const sid = signed.session && signed.session !== 'clear' ? signed.session.sid : assert.fail('no session');

  const options = ok(await d.auth({ flow: 'passkey.register.options', sid })).body;
  const made2 = await register(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge });
  ok(await d.auth({ flow: 'passkey.register', sid, credential: asJSON.registration(made2) }));

  return { d, sql, clock, ada, bo, record: made.record, sid };
}

test('A DIRECTORY DUMPED AND LOADED INTO AN EMPTY ONE RESOLVES THE NAME, KNOWS THE PASSKEY, AND HOLDS NO SESSION', async () => {
  const from = await populated();
  assert.equal(count(from.sql, 'dir_session'), 1, 'the source had no session to leave out');
  const lines = from.d.dump();

  const to = fresh();
  const loaded = value<{ tables: number; rows: number }>(to.d.load(lines));
  assert.equal(loaded.tables, CARRIED.length);

  // The name, and the tombstone: the old name stays released, so a stale link does not start reading somebody else.
  assert.deepEqual(to.d.resolve('halden'), { record: from.record, slug: 'halden' });
  assert.equal(to.d.resolve('the-studio'), null);
  assert.equal(to.d.claimed('the-studio'), 'released', 'a released name came back into the pool');
  assert.deepEqual(to.d.namesOf(from.record).map((n) => n.slug), ['the-studio', 'halden']);

  // Who is on it, who owns it, and which record the forwarding address is for.
  assert.equal(to.d.reaches(from.record, from.bo), true);
  assert.equal(to.d.leave(from.record, from.ada).ok, false, 'the owner was not the owner after a load');
  assert.equal(to.d.recordFor(DIGEST), from.record);
  assert.equal(value<{ totals: { runs: number } }>(to.d.usage(from.ada, { from: '2026-09-01', to: '2026-09-30' })).totals.runs, 1);

  // The passkey signs Ada in on the loaded Directory, which is the proof that the public half and its person came back.
  const options = ok(await to.d.auth({ flow: 'passkey.assert.options' })).body;
  const signed = await authenticate(KEYS.es256, { rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, signCount: 1, person: from.ada });
  const into = ok(await to.d.auth({ flow: 'passkey.assert', credential: asJSON.assertion(signed), ip: '203.0.113.10' }));
  assert.equal((into.body as { person: string }).person, from.ada);

  // And the cookie Ada held before is nobody on the loaded one: the session was never in the copy.
  assert.equal((await to.d.auth({ flow: 'session', sid: from.sid })).status, 401);
  assert.equal(count(to.sql, 'dir_link'), 0);
  assert.equal(count(to.sql, 'dir_challenge'), 0);
});

test('NO LINE OF A COPY HOLDS A SESSION, A LINK, A CHALLENGE OR A STRIKE', async () => {
  // Stronger than "the loaded one has none": the copy is sealed and stored for thirty nights, so what is left out has
  // to be absent from the lines themselves, and every table name in them has to be one the copy carries.
  const from = await populated();
  const lines = from.d.dump();
  const named = lines.filter((l) => l.startsWith('#table ')).map((l) => l.slice('#table '.length));
  for (const table of LEFT_OUT) assert.ok(!named.includes(table), `${table} travelled`);
  assert.deepEqual(named, [...CARRIED]);

  /* AND NO VALUE FROM THEM EITHER, which is what a copy that put a session row under another table's heading would
     still leak. The session's MAC and every strike key the sign-in wrote are looked for in the text. */
  const secrets = [
    ...from.sql.all<{ id_hash: string }>('SELECT id_hash FROM dir_session').map((r) => r.id_hash),
    ...from.sql.all<{ key: string }>('SELECT key FROM dir_fail').map((r) => r.key),
  ];
  assert.ok(secrets.length >= 2, 'the source had no session and no strike to look for');
  const text = lines.join('\n');
  for (const secret of secrets) assert.ok(!text.includes(secret), `${secret} is in the copy`);
});

test('EVERY TABLE THE SCHEMA MAKES IS EITHER CARRIED OR LEFT OUT ON PURPOSE', () => {
  // A table added to `SCHEMA` later and to neither list would be dropped from every copy with nothing saying so, and
  // found on the day the Directory is restored. Read from `sqlite_master`, so the schema is the one answering.
  const { sql } = fresh();
  const made = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'dir%' ORDER BY name").map((r) => r.name);
  assert.deepEqual([...CARRIED, ...LEFT_OUT].sort(), made);
});

test('A LOAD INTO A DIRECTORY THAT HOLDS ANYTHING IS REFUSED, AND WRITES NOTHING', async () => {
  // A load over a live Directory would be two tenant maps merged, and the one failure a routing layer must not have is
  // a name that means two records. Refused before the first row, so the Directory it was pointed at is as it was.
  const from = await populated();
  const lines = from.d.dump();
  const to = fresh();
  value(to.d.person$('cy@example.com'));
  const refused = to.d.load(lines);
  assert.equal(refusalOf(refused).code, 'IMPORT_NOT_EMPTY');
  assert.equal(count(to.sql, 'dir_person'), 1);
  assert.equal(count(to.sql, 'dir_slug'), 0);
});

test('A COPY FROM ANOTHER VERSION, OR ONE CUT SHORT, IS REFUSED WHOLE', async () => {
  // A newer build's columns would load as confidently wrong answers about which record a name means, which is what
  // `DIRECTORY_VERSION` exists to stop. And a line that is not a row rolls back every row before it: half a tenant map
  // is a Directory where some names resolve and the rest are free to be claimed.
  const from = await populated();
  const lines = from.d.dump();

  const newer = fresh();
  const bumped = newer.d.load([lines[0]!.replace(/\d+$/u, '99'), ...lines.slice(1)]);
  assert.equal(refusalOf(bumped).code, 'FORMAT_NEWER_THAN_READER');
  assert.equal(count(newer.sql, 'dir_person'), 0);

  /* AN OLDER COPY TOO, because the steps that bring an old Directory forward run over a file on open and not over lines,
     so an older copy loaded here would be version 3 rows in a version 4 schema with nothing to say so. */
  const older = fresh();
  const lowered = older.d.load([lines[0]!.replace(/\d+$/u, '3'), ...lines.slice(1)]);
  assert.equal(refusalOf(lowered).code, 'FILE_MALFORMED');
  assert.match(refusalOf(lowered).fix, /version 3/u);
  assert.equal(count(older.sql, 'dir_person'), 0);

  const torn = fresh();
  const cut = torn.d.load([...lines.slice(0, -1), '{"id": "p_', ...lines.slice(-1)]);
  assert.equal(refusalOf(cut).code, 'FILE_MALFORMED');
  assert.equal(count(torn.sql, 'dir_person'), 0, 'rows before the torn line were kept');

  /* A ROW THAT PARSES AND THE SCHEMA REFUSES, as the copy's very last line: the forwarding digest twice. Every other
     row has been inserted by then, so this is the case where only the transaction stands between a refusal and a
     Directory holding everything but one address. */
  const doubled = fresh();
  const twice = doubled.d.load([...lines, lines.at(-1)!]);
  assert.equal(refusalOf(twice).code, 'FILE_MALFORMED');
  assert.match(refusalOf(twice).fix, new RegExp(`line ${String(lines.length + 1)}`, 'u'));
  assert.equal(count(doubled.sql, 'dir_person'), 0, 'the rows before the refused one were committed');

  const stranger = fresh();
  const alien = stranger.d.load([lines[0]!, '#table dir_session', '{"id_hash":"x","person":"p","expires":1,"rotated_at":1,"authed_at":1}']);
  assert.equal(refusalOf(alien).code, 'FILE_MALFORMED', 'a session was loaded because the copy named its table');
  assert.equal(count(stranger.sql, 'dir_session'), 0);
});

test('A COPY SAVED WITH A NEWLINE AT THE END STILL LOADS, as a .brainl does', async () => {
  // `take` joins the lines with no newline after the last, and an operator who opens the copy with `age -d` and saves
  // it has one more often than not; split on newlines, that is an empty last line. The first version refused the copy
  // there as "not a row of dir_inbound", on the day somebody is restoring a lost Directory. The record's own reader
  // skips a blank line (`packages/kernel/src/brainl.ts`), and this one now does the same.
  const from = await populated();
  const lines = from.d.dump();
  const to = fresh();
  const loaded = value<{ tables: number; rows: number }>(to.d.load([...lines, '']));
  assert.equal(loaded.tables, CARRIED.length);
  assert.deepEqual(to.d.resolve('halden'), { record: from.record, slug: 'halden' });
});

test('CLOSED BEFORE A CUTOFF IS EVERY RECORD CLOSED EARLIER, PAGED, AND NO OPEN ONE', () => {
  // The night's expiry of final copies asks this, and the two ways it goes wrong are an open record in the answer
  // (its copies would be deleted while it is alive) and a record closed after the cutoff (its final copy would go
  // before the days it is owed).
  const { d, clock } = fresh();
  value(d.person$('ada@example.com'));
  const early = value<{ record: string }>(d.provision({ slug: 'early', email: 'ada@example.com' })).record;
  const late = value<{ record: string }>(d.provision({ slug: 'late', email: 'ada@example.com' })).record;
  const open = value<{ record: string }>(d.provision({ slug: 'still-open', email: 'ada@example.com' })).record;
  value(d.close(early));
  clock.advance(10 * DAY);
  value(d.close(late));
  const cutoff = NOW + 5 * DAY;

  assert.deepEqual(d.closedBefore(cutoff).ids, [early]);
  const all = NOW + 20 * DAY;
  assert.deepEqual([...d.closedBefore(all).ids].sort(), [early, late].sort());
  assert.ok(!d.closedBefore(all).ids.includes(open));

  const first = d.closedBefore(all, undefined, 1);
  assert.equal(first.ids.length, 1);
  assert.ok(first.cursor !== undefined);
  const second = d.closedBefore(all, first.cursor, 1);
  assert.deepEqual([...first.ids, ...second.ids].sort(), [early, late].sort());
});
