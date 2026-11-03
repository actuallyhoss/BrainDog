/**
 * `arrived`: whether what shipped is what runs. An add-on one version behind its catalogue reads green
 * for two nights and red on the third, naming it and what turns it on, and green the night after it updates; an update
 * waiting on its question past two nights is red; the command's build more than two days behind the host's is red, a
 * checkout's says nothing; a cloud host with no model is red, a self-host says nothing. Filed through `fileRecordSigns`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { ARRIVED_BEHIND, ARRIVED_HOLDER, buildDayOf, fileRecordSigns, readArrivedSign, type RecordSignsDeps } from '../src/signs.ts';
import type { CatalogueOffer } from '../src/slash.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
/* Five past midnight UTC on 6 October: the record's tick, night one. */
const NIGHT = Date.UTC(2026, 9, 6, 0, 5);
const NO_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b|money-book|—/u;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NIGHT);
  const api = await createRecordApi({ sql, clock });
  return { sql, clock, api };
}

/** An add-on as an install leaves it: its id, version and the title a person reads. */
function install(sql: NodeSql, id: string, version: string, title: string): void {
  sql.exec(
    "INSERT OR REPLACE INTO pack (id, version, source, manifest, installed_at, checksum) VALUES (?, ?, 'kennel', ?, '2026-09-01T00:00:00.000Z', 'x')",
    id,
    version,
    JSON.stringify({ pack: id, version, title }),
  );
}

/** A catalogue that holds `money-book` at 1.1.0: an offer for each add-on held below it. */
const catalogue = (latest: Record<string, string>): NonNullable<RecordSignsDeps['offers']> => async (held) =>
  held
    .filter((h) => latest[h.id] !== undefined && latest[h.id] !== h.version)
    .map((h): CatalogueOffer => ({ id: h.id, title: 'Catalogue title', from: h.version, to: latest[h.id]!, body: {}, signedBy: null, installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true }));

const deps = (sql: NodeSql, more: Partial<RecordSignsDeps> = {}): RecordSignsDeps => ({ sql, briefing: () => null, ...more });

test('THREE NIGHTS BEHIND IS RED, named, and the night after the update is green', async () => {
  const { sql, clock, api } = await record();
  install(sql, 'money-book', '1.0.0', 'Money');
  const d = deps(sql, { offers: catalogue({ 'money-book': '1.1.0' }) });

  const one = await fileRecordSigns(api.kernel, d, clock.now());
  assert.deepEqual(one.refused, []);
  assert.equal(one.arrived.state, 'green', one.arrived.said);
  assert.equal(one.arrived.said, '1 plugin has had a newer version waiting for under 2 nights.');
  assert.deepEqual(one.arrived.facts, ['Money has had version 1.1.0 waiting since 6 October.']);

  clock.advance(DAY);
  assert.equal((await fileRecordSigns(api.kernel, d, clock.now())).arrived.state, 'green');

  clock.advance(DAY);
  const three = await fileRecordSigns(api.kernel, d, clock.now());
  assert.equal(three.arrived.state, 'red');
  assert.equal(three.arrived.value, 1);
  assert.equal(three.arrived.said, 'Money has had version 1.1.0 waiting since 6 October. Updating it on Plugins turns it on.');
  assert.doesNotMatch(three.arrived.said, NO_ID);
  const filed = api.kernel.signs();
  assert.ok(filed.ok);
  assert.equal(filed.value.signs.find((s) => s.sign === 'arrived')?.state, 'red', 'the kernel did not keep the filing');

  install(sql, 'money-book', '1.1.0', 'Money');
  clock.advance(DAY);
  const after = await fileRecordSigns(api.kernel, d, clock.now());
  assert.equal(after.arrived.state, 'green', after.arrived.said);
  assert.equal(after.arrived.said, 'The one plugin runs its newest version.');
  assert.deepEqual(api.kernel.prefsOf(ARRIVED_HOLDER)[ARRIVED_BEHIND], {});
});

test('A NEWER VERSION SEEN AGAIN keeps the night it was first seen behind, and a switched-off add-on is not asked about', async () => {
  const { sql, clock, api } = await record();
  install(sql, 'money-book', '1.0.0', 'Money');
  install(sql, 'people', '2.0.0', 'People');
  sql.exec("UPDATE pack SET disabled_at = '2026-09-02T00:00:00.000Z' WHERE id = 'people'");
  await readArrivedSign(api.kernel, { sql, offers: catalogue({ 'money-book': '1.1.0', people: '2.1.0' }) }, clock.now());
  clock.advance(2 * DAY);
  const r = await readArrivedSign(api.kernel, { sql, offers: catalogue({ 'money-book': '1.2.0', people: '2.1.0' }) }, clock.now());
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'Money has had version 1.2.0 waiting since 6 October. Updating it on Plugins turns it on.');
  assert.ok(!r.facts!.some((f) => f.includes('People')), 'a switched-off add-on was read');
});

test('AN UPDATE WAITING ON ITS QUESTION past two nights is red; one asked yesterday is not', async () => {
  const { sql, clock, api } = await record();
  install(sql, 'money-book', '1.0.0', 'Money');
  const ask = (id: string, askedAt: number) =>
    sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'pack', ?, 'open', 'slash', ?)",
      id,
      JSON.stringify({ install: 'money-book', doc: {} }),
      new Date(askedAt).toISOString(),
    );
  ask('SG1', clock.now() - DAY);
  assert.equal((await readArrivedSign(api.kernel, { sql }, clock.now())).state, 'none', 'a question alone is not enough to read green');
  sql.exec("DELETE FROM suggestion WHERE id = 'SG1'");
  ask('SG2', clock.now() - 3 * DAY);
  const r = await readArrivedSign(api.kernel, { sql, offers: catalogue({}) }, clock.now());
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The update to Money has waited on its question since 3 October. Answering it on Decide turns it on.');
});

test('THE COMMAND: more than two days behind the host is red, within two is green, a checkout says nothing', async () => {
  const { sql, clock, api } = await record();
  const mark = (build: string) =>
    sql.exec("INSERT OR REPLACE INTO door_mark (run, kind, at, n, build, client) VALUES ('r1', 'hello', ?, 1, ?, 'claude-code')", new Date(clock.now()).toISOString(), build);
  const read = (app: string) => readArrivedSign(api.kernel, { sql, build: { app, slash: true, host: 'self-host' } }, clock.now());
  mark('2026.10.01+abc1234');
  const behind = await read('2026.10.05+def5678');
  assert.equal(behind.state, 'red');
  assert.equal(behind.said, 'The BrainDog command last heard from runs the build of 1 October, and this host serves the build of 5 October. Running braindog update on that computer turns it on.');
  assert.equal((await read('2026.10.03+def5678')).said, "The command is within 2 days of this host's build.");
  assert.equal((await read('2026.10.01+abc1234')).said, "The command runs this host's build.");
  mark('dev+0000000');
  assert.equal((await read('2026.10.05+def5678')).state, 'none', 'a checkout of the command was judged');
  mark('2026.10.01+abc1234');
  assert.equal((await read('dev+0000000')).state, 'none', 'a checkout of the host was judged');
  assert.equal(buildDayOf('2026.10.09+1a2b3c4'), '2026-10-09');
});

test('THE MODEL: a cloud host with none bound is red, with one is green; a self-host and a checkout say nothing', async () => {
  const { sql, clock, api } = await record();
  const read = (slash: boolean, host: 'cloud' | 'self-host', app = '2026.10.05+def5678') => readArrivedSign(api.kernel, { sql, build: { app, slash, host } }, clock.now());
  const none = await read(false, 'cloud');
  assert.equal(none.state, 'red');
  assert.equal(none.said, "No model is set up on this host, so Slash cannot answer. It turns on once the host's operator binds one.");
  assert.equal((await read(true, 'cloud')).said, 'A model is set up.');
  assert.equal((await read(false, 'self-host')).state, 'none');
  for (const app of ['', 'dev+0000000']) assert.equal((await read(false, 'cloud', app)).state, 'none', `a cloud run from a checkout (${JSON.stringify(app)}) was judged`);
});

test('NONE ON AN EMPTY RECORD, and two faults at once are counted and both kept', async () => {
  const { sql, clock, api } = await record();
  const empty = await readArrivedSign(api.kernel, { sql }, clock.now());
  assert.equal(empty.state, 'none');
  assert.equal(empty.said, 'No plugin is installed and this host does not say which build it serves.');
  install(sql, 'money-book', '1.0.0', 'Money');
  await readArrivedSign(api.kernel, { sql, offers: catalogue({ 'money-book': '1.1.0' }) }, clock.now());
  clock.advance(2 * DAY);
  const two = await readArrivedSign(api.kernel, { sql, offers: catalogue({ 'money-book': '1.1.0' }), build: { app: '2026.10.05+def5678', slash: false, host: 'cloud' } }, clock.now());
  assert.equal(two.state, 'red');
  assert.equal(two.value, 2);
  assert.equal(two.said, '2 things that shipped have not arrived: Money and a model for Slash.');
  assert.equal(two.facts!.length, 2);
  for (const f of [two.said, ...two.facts!]) assert.doesNotMatch(f, NO_ID);
});

test('A DEV BUILD SAYS NOTHING: a checkout of the host, even on the cloud with no model and an older command, reads none', async () => {
  const { sql, clock, api } = await record();
  sql.exec("INSERT INTO door_mark (run, kind, at, n, build, client) VALUES ('r1', 'hello', ?, 1, '2026.09.01+abc1234', 'claude-code')", new Date(clock.now()).toISOString());
  const r = await readArrivedSign(api.kernel, { sql, build: { app: 'dev+0000000', slash: false, host: 'cloud' } }, clock.now());
  assert.deepEqual([r.state, r.value, r.said], ['none', null, 'This host runs a build from a checkout, so what shipped cannot be told from what runs.']);
});
