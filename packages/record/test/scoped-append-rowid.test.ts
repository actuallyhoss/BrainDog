/**
 * A member who reads the record but holds one list down to `append` pages the log the way a member invited to one list
 * does: no event rowid out, none taken in.
 *
 * WHY. `7acff83d` sent a rowid to whoever `wholeRecord` said read the whole record, and `wholeRecord` asked only
 * whether the caller's ceiling was `'*'`. Iris, invited at `read` with Diary held to `append`, has no ceiling, so she
 * was "whole record": `lineOf` hid Diary from her, since `append` does not read, and `shown` left the rowid on the
 * lines it did not hide. The probe read her two lines as 10 and 6 with the three Diary writes she cannot see sitting at
 * 7, 8 and 9. The question that decides the rowid is `lineOf`'s own: does she read every list.
 *
 * AND READING EVERY LIST WAS NOT ENOUGH EITHER. A bookkeeper at `read` with one list raised to `write` reads every
 * list, and this file said she kept the rowid as the owner does. `lineOf` keeps the owner's invitations from her, so
 * the gap between two of her lines counted them (measured in `reader-rowid-gap.test.ts`). Only an owner holds a rowid
 * now.
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

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Line = { rowid?: number; id: string; kind: string; register: string | null };
type Page = { events: Line[]; cursor: number | string | null };
type News = { events: Line[]; upTo: number | string | null };
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** One of hers, three of the diary's, one of hers again: the shape the probe measured. */
async function busy() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 5, 12)) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_8', name: 'Iris', level: 'read', registers: { diary: 'append' } } as never, owner));
  value(await api.invite({ person: 'p_7', name: 'Bea', level: 'read', registers: { obligations: 'write' } } as never, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  for (let i = 0; i < 3; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`, so the grant shape is the one a real sign-in carries. */
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  return { sql, api, iris: as('p_8'), bea: as('p_7') };
}

test('(1) A READER WITH ONE LIST HELD TO APPEND IS HANDED NO ROWID, on a page, in its cursor, or from whatsNew and markRead', async () => {
  const { sql, api, iris } = await busy();
  assert.equal(iris.principal.kind === 'person' && iris.principal.level, 'read', 'the member this is about reads the record');
  assert.equal(iris.registers, '*', 'and has no ceiling, which is what `wholeRecord` asked');

  const whole = value<Page>(await api.recentHistory({ limit: 200 } as never, iris));
  assert.ok(whole.events.some((e) => e.register === 'obligations'), 'she sees her own lines');
  assert.ok(!whole.events.some((e) => e.register === 'diary'), 'and none of the diary, which she may only add to');
  assert.ok(!whole.events.some((e) => 'rowid' in e), `her lines carry rowids: ${whole.events.map((e) => e.rowid).join(' ')}`);

  const first = value<Page>(await api.recentHistory({ limit: 1 } as never, iris));
  assert.equal(first.cursor, `e.${first.events[0]!.id}`, 'a one-line page answered a rowid as its cursor');

  const news = value<News>(await api.whatsNew(undefined, iris));
  assert.equal(news.upTo, `e.${news.events[0]!.id}`);
  assert.ok(!JSON.stringify(news).includes('"rowid"'), 'whatsNew handed her a rowid');
  assert.equal(value<{ upTo: unknown }>(await api.markRead(undefined, iris)).upTo, news.upTo);

  /* AND A NUMBER FROM HER IS NOT A CURSOR, because stepping one down the log says which rowids are hers. */
  const newest = sql.one<{ n: number }>('SELECT MAX(rowid) AS n FROM event')!.n;
  for (let n = 1; n <= newest; n++) {
    assert.equal(((await api.recentHistory({ cursor: n, limit: 1 } as never, iris)) as Out).ok, false, `recentHistory took cursor ${n}`);
    assert.equal(((await api.markRead({ upTo: n } as never, iris)) as Out).ok, false, `markRead took upTo ${n}`);
  }
  sql.close();
});

test('(2) A READER WHOSE HELD LIST STILL READS IS HANDED NO ROWID EITHER, and the owner keeps his', async () => {
  const { sql, api, bea } = await busy();
  const rowidOf = new Map(sql.all<{ rowid: number; id: string }>('SELECT rowid, id FROM event').map((e) => [e.id, Number(e.rowid)]));
  const whole = value<Page>(await api.recentHistory({ limit: 200 } as never, owner));
  assert.ok(whole.events.some((e) => e.register === 'diary'), 'the owner reads the diary');
  assert.deepEqual(whole.events.map((e) => e.rowid), whole.events.map((e) => rowidOf.get(e.id)), 'the owner lost the rowid');
  const [newest, second, third] = whole.events;
  assert.equal(value<News>(await api.whatsNew(undefined, owner)).upTo, newest!.rowid);
  assert.equal(value<Page>(await api.recentHistory({ cursor: second!.rowid, limit: 1 } as never, owner)).events[0]!.id, third!.id);

  /* BEA READS EVERY LIST AND IS STILL NOT SHOWN THE INVITATIONS, which are the owner's lines, so the gap between two of
     hers counted them. This asserted she kept the rowid, over its own note that she was not shown them. She pages on
     the cursors Iris pages on. */
  const hers = value<Page>(await api.recentHistory({ limit: 200 } as never, bea));
  assert.ok(hers.events.some((e) => e.register === 'diary'), 'Bea reads the diary');
  assert.ok(!hers.events.some((e) => 'rowid' in e), `her lines carry rowids: ${hers.events.map((e) => e.rowid).join(' ')}`);
  const news = value<News>(await api.whatsNew(undefined, bea));
  assert.equal(news.upTo, `e.${news.events[0]!.id}`);
  const first = value<Page>(await api.recentHistory({ limit: 1 } as never, bea));
  assert.equal(value<Page>(await api.recentHistory({ cursor: first.cursor!, limit: 1 } as never, bea)).events[0]!.id, hers.events[1]!.id, 'her own cursor does not page');
  assert.equal(((await api.recentHistory({ cursor: second!.rowid, limit: 1 } as never, bea)) as Out).ok, false, 'a rowid was taken from her');
  sql.close();
});
