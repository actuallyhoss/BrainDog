/**
 * `versionFor` trusts what it remembered only while the log under it is the log it remembered.
 *
 * THE GUARD UNDER TEST is the line that decides whether a caller's remembered answer may be reused at all: the top of
 * the log has not fallen below the remembered top, and the event at the remembered top is still the one it was, read
 * back by id. `version-scoped-cost.test.ts` holds what the cache buys and what a row write, an access change and a
 * purge do to it, and every case there keeps the log it remembered. Nothing held this line. Without it, a caller whose
 * log was taken back underneath her would be answered her remembered line, which is no longer in the log, because every
 * line the cache reads above the remembered top is a row write it trusts, or there is none at all.
 *
 * THE LOG IS TAKEN BACK WITH SQL, which is the shape a restore leaves: the rows above a point are gone, and what is
 * written afterwards takes their rowids again, because `event` keeps SQLite's own rowid and a rowid after the largest
 * one left is the next one handed out. Each case compares the answer to the one a record that has remembered nothing
 * gives over the same database, which is the contract the cache has to keep.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const NOW = Date.UTC(2026, 8, 22, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/**
 * A record, and a member who reads Obligations and may only add to the Diary, so the owner's Diary rows are lines she is
 * not shown. She is not handed rowids, which is the only caller `versionFor` remembers anything for.
 */
async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_8', name: 'Mo', level: 'read', registers: { diary: 'append' } } as never, owner));
  const held = api.kernel.access('p_8')!;
  const mo: CallContext = { principal: { kind: 'person', id: 'p_8', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const at = async (ctx: CallContext): Promise<number> => value<{ version: number }>(await api.version(ctx)).version;
  /* THE SAME QUESTION ASKED OF A RECORD THAT HAS REMEMBERED NOTHING, over the same database. */
  const cold = async (ctx: CallContext): Promise<number> =>
    value<{ version: number }>(await (await createRecordApi({ sql, clock: fixedClock(NOW) })).version(ctx)).version;
  const obligation = async (what: string): Promise<void> => void value(await api.create({ register: 'obligations', fields: { what } }, owner));
  const diary = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, owner));
  };
  /* THE TOP OF THE LOG, which is what `versionFor` remembers beside her answer. */
  const top = (): number => Number(sql.one<{ v: number | null }>('SELECT MAX(rowid) AS v FROM event')?.v ?? 0);
  /* A RESTORE, AS IT LEAVES THE LOG: everything written after `rowid` is gone. */
  const takeBack = (rowid: number): void => sql.exec('DELETE FROM event WHERE rowid > ?', rowid);
  return { sql, mo, at, cold, obligation, diary, top, takeBack };
}

test('(1) A LOG TAKEN BACK BELOW THE TOP SHE WAS REMEMBERED AT IS WALKED AGAIN, and she is not answered a line that is gone', async () => {
  const { sql, mo, at, cold, obligation, top, takeBack } = await studio();
  await obligation('Invoice 41');
  const before = await at(mo);
  assert.equal(before, await cold(mo));
  const kept = top();

  await obligation('Invoice 42');
  const later = await at(mo);
  assert.notEqual(later, before, 'a new line she reads did not move her version, so this measures nothing');

  /* THE TOP IS NOW BELOW THE ONE SHE WAS REMEMBERED AT. Were the cache trusted here, nothing would lie above the
     remembered top to read, so the remembered answer would stand: the create of Invoice 42, a line the log no longer
     holds. */
  takeBack(kept);
  assert.equal(top(), kept);
  const now = await at(mo);
  assert.equal(now, await cold(mo), 'the remembered answer was handed back over a log that no longer holds its line');
  assert.equal(now, before, 'the log is back where it was before Invoice 42, and so is her newest line');
  sql.close();
});

test('(2) A LOG TAKEN BACK AND WRITTEN PAST THE SAME TOP AGAIN IS WALKED AGAIN, because the line at that top is another', async () => {
  const { sql, mo, at, cold, obligation, diary, top, takeBack } = await studio();
  await obligation('Invoice 41');
  const before = await at(mo);
  const kept = top();

  await obligation('Invoice 42');
  const later = await at(mo);
  assert.notEqual(later, before, 'a new line she reads did not move her version, so this measures nothing');
  const remembered = top();

  /* TAKEN BACK, AND THEN THE OWNER WRITES DIARY ROWS UNTIL THE LOG IS TALLER THAN IT WAS. Every line above the
     remembered top is a Diary row she may not read and a plain row write, which is exactly what the cache trusts; and
     the event now at the remembered top has the same rowid and another id. Only the id says the log is not the one she
     was answered over. */
  takeBack(kept);
  await diary(remembered - kept + 2);
  assert.ok(top() > remembered, 'the Diary did not write past the remembered top, so this measures the other case');

  const now = await at(mo);
  assert.equal(now, await cold(mo), 'the remembered answer was trusted over a log whose line at the remembered top is another');
  assert.equal(now, before, 'her newest line is Invoice 41 again, under Diary rows she may not read');
  sql.close();
});
