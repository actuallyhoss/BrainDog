/**
 * `version()` for a caller who is not handed rowids costs the lines written since she last asked, not the whole log.
 *
 * `loop/research-batch-twenty-eight-audit.md` finding 2. `versionFor` walked the log down from the top until it met a
 * line `lineOf` shows her, with no cap and nothing remembered between calls, so a member whose newest line sat under a
 * busy list she may not read paid for every line above it on every call: 578.6 ms at 20,000 Diary rows and 2,650.4 ms
 * at 100,000, where the owner paid 0.2 ms. `apps/web/src/routes/+layout.ts` awaits it on a tab's first navigation.
 *
 * COUNTED IN ROWS AND NOT IN MILLISECONDS. The driver below counts every event row `eventsBefore` hands the record, which
 * is what the walk costs and what a slower CI machine does not change. The contract cases hold the remembered answer to
 * the one a cold walk gives on the same log, after every kind of write the cache treats differently.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Row } from '@braindog/ports';

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

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** How many Diary rows sit over her newest line. Enough that a walk of them is plain in the count, and quick to write. */
const DIARY_ROWS = 1_200;

async function studio() {
  const sql = openSqlite();
  /* EVERY EVENT ROW THE RECORD READS OFF THE LOG, which is the one query `eventsBefore` makes. */
  let examined = 0;
  const counted = {
    ...sql,
    all<T = Row>(text: string, ...params: Param[]): T[] {
      const rows = sql.all<T>(text, ...params);
      if (/FROM event WHERE rowid < \?/u.test(text)) examined += rows.length;
      return rows;
    },
  };
  const api = await createRecordApi({ sql: counted, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_8', name: 'Mo', level: 'read', registers: { diary: 'append' } } as never, owner));
  const invoice = value<{ seq: number }>(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const held = api.kernel.access('p_8')!;
  const mo: CallContext = { principal: { kind: 'person', id: 'p_8', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const at = async (ctx: CallContext): Promise<number> => value<{ version: number }>(await api.version(ctx)).version;
  /* THE SAME QUESTION ASKED OF A RECORD THAT HAS REMEMBERED NOTHING, over the same database. */
  const cold = async (ctx: CallContext): Promise<number> =>
    value<{ version: number }>(await (await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) })).version(ctx)).version;
  const cost = async (ctx: CallContext): Promise<{ version: number; rows: number }> => {
    examined = 0;
    const version = await at(ctx);
    return { version, rows: examined };
  };
  const diary = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, owner));
  };
  return { sql, api, mo, invoice: invoice.seq, at, cold, cost, diary };
}

test('(1) A MEMBER WHO ASKS AGAIN IS NOT WALKED DOWN EVERY DIARY ROW TO HER OWN LINE', async () => {
  const { sql, mo, cost, diary } = await studio();
  await diary(DIARY_ROWS);
  const first = await cost(mo);
  assert.ok(first.rows > DIARY_ROWS, `the first ask read ${first.rows} rows, so her line was not under the Diary and this measures nothing`);

  await diary(1);
  const again = await cost(mo);
  assert.equal(again.version, first.version, 'a Diary row she may not read moved her version');
  assert.ok(again.rows <= 10, `one Diary row written since she last asked, and her version read ${again.rows} rows of the log`);

  const idle = await cost(mo);
  assert.ok(idle.rows <= 10, `nothing written since she last asked, and her version read ${idle.rows} rows of the log`);
  sql.close();
});

test('(2) THE REMEMBERED ANSWER IS THE ONE A COLD WALK GIVES, after every kind of write', async () => {
  const { sql, api, mo, invoice, at, cold, diary } = await studio();
  await diary(20);
  const start = await at(mo);
  assert.equal(start, await cold(mo));

  await diary(3);
  assert.equal(await at(mo), start, 'Diary rows she may not read moved her version');
  assert.equal(await at(mo), await cold(mo));

  value(await api.update({ register: 'obligations', seq: invoice, patch: { what: 'Invoice 41, paid' } }, owner));
  const edited = await at(mo);
  assert.notEqual(edited, start, 'an edit to a line she reads did not move her version');
  assert.equal(edited, await cold(mo));

  /* NOT A ROW WRITE, so it may change what older lines show her, and she is walked again rather than trusted. */
  value(await api.invite({ person: 'p_20', name: 'Guest', level: 'read' } as never, owner));
  assert.equal(await at(mo), edited, 'an invitation she is shown none of moved her version');
  assert.equal(await at(mo), await cold(mo));

  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  const added = await at(mo);
  assert.notEqual(added, edited, 'a new line she reads did not move her version');
  assert.equal(added, await cold(mo));

  /* THE SAME PERSON WITH THE DIARY RAISED TO read IS ANOTHER CALLER, and is not handed what she was remembered at. The
     Diary row goes first, so the raised caller's newest line is one the held caller cannot read. */
  await diary(1);
  assert.equal(await at(mo), added, 'a Diary row she may not read moved her version');
  const raised: CallContext = { ...mo, levels: {} };
  const seen = await at(raised);
  assert.notEqual(seen, added, 'with the Diary readable her newest line is a Diary row, and she was answered the old one');
  assert.equal(seen, await cold(raised));
  assert.equal(await at(mo), added, 'asking as the raised caller moved what the held one is answered');

  /* A PURGE TAKES AWAY LINES SHE WAS SHOWN: `lineOf` finds no row behind any line about Invoice 42 once the sweep has
     removed it. It is not a row write, so she is walked again. Measured here, the sweep also writes a `purge` line of its
     own with no target, which a caller who reads the whole record is shown, so her number moves to that line either way. */
  value(await api.update({ register: 'obligations', seq: invoice + 1, patch: { deleted_at: '2026-06-01T00:00:00.000Z' } }, owner));
  const deleted = await at(mo);
  assert.notEqual(deleted, added, 'deleting a line she reads is a line she reads, and did not move her version');
  assert.ok(api.kernel.purge({ cutoffMs: Date.UTC(2100, 0, 1) }).rows >= 1);
  assert.equal(await at(mo), await cold(mo));
  sql.close();
});

test('(3) A PURGE SHE IS SHOWN NONE OF STILL TAKES AWAY HER NEWEST LINE, so she is walked again and not trusted', async () => {
  /* WHAT (2) COULD NOT REACH. Every caller in (2) reads the whole record, so the sweep's own untargeted `purge` line was
     hers and moved her number whatever the cache did: with `trusted` never set to false, (2) still passed. A token with a
     level and a ceiling of one list is shown neither `purge` line, one about a row that is gone and one about the record,
     so the only thing that moves her off the deleted invoice is the walk the purge forces. Measured: trusting the
     remembered answer here handed back the `delete` line's number where a cold walk gave the create of Invoice 41. */
  const { sql, api, at, cold } = await studio();
  const project: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'read' }, registers: ['obligations'] };
  const doomed = value<{ seq: number }>(await api.create({ register: 'obligations', fields: { what: 'Invoice 43' } }, owner));
  value(await api.update({ register: 'obligations', seq: doomed.seq, patch: { deleted_at: '2026-06-01T00:00:00.000Z' } }, owner));
  const deleted = await at(project);
  assert.equal(deleted, await cold(project));

  assert.ok(api.kernel.purge({ cutoffMs: Date.UTC(2100, 0, 1) }).rows >= 1);
  const swept = await at(project);
  assert.notEqual(swept, deleted, 'the line she was answered is about a row the sweep removed, and she was still answered it');
  assert.equal(swept, await cold(project));
  sql.close();
});
