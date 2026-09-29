/**
 * A colleague at `read` with no list held at a level of its own is handed no event rowid, because the gap between two of
 * her lines counts the owner's invitations.
 *
 * WHY. `readsEveryList` let her keep the rowid on the argument that she reads every list, and she does, but `lineOf`
 * hides more than lists: every `grant`, `access.*`, `share.*`, `member`, `person` and `vault_key` line goes to an owner
 * only. A probe read her two lines at rowids 3 and 7 with three `access.grant` lines between them and none of them
 * shown to her, so the gap was the number of people the owner had invited in the meantime. The question that decides
 * the rowid is the one the comment asked, and the only caller of whom it is true without walking the log is an owner.
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

/** Her first line, then `invites` colleagues invited by the owner, then her second line: the probe. */
async function between(invites: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 21, 12)) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_7', name: 'Rae', level: 'read' } as never, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  for (let i = 0; i < invites; i++) value(await api.invite({ person: `p_${20 + i}`, name: `Guest ${i}`, level: 'read' } as never, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`. */
  const held = api.kernel.access('p_7')!;
  const rae: CallContext = { principal: { kind: 'person', id: 'p_7', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { sql, api, rae };
}

test('(1) THE GAP BETWEEN TWO OF A READER\'S LINES IS NOT THE COUNT OF THE OWNER\'S INVITATIONS', async () => {
  for (const invites of [3, 1, 0]) {
    const { sql, api, rae } = await between(invites);
    assert.equal(rae.principal.kind === 'person' && rae.principal.level, 'read', 'the colleague this is about reads the record');
    assert.deepEqual(rae.levels ?? {}, {}, 'and holds no list at a level of its own');

    const page = value<Page>(await api.recentHistory({ limit: 200 } as never, rae));
    const mine = page.events.filter((e) => e.register === 'obligations');
    assert.equal(mine.length, 2, 'she reads both of her lines');
    assert.ok(!page.events.some((e) => /^access\./u.test(e.kind)), 'and is shown none of the invitations');
    const [newer, older] = mine;
    assert.ok(
      newer!.rowid === undefined && older!.rowid === undefined,
      `with ${invites} invited between them her two lines sat at rowids ${older!.rowid} and ${newer!.rowid}, gap ${newer!.rowid! - older!.rowid!}`,
    );

    const first = value<Page>(await api.recentHistory({ limit: 1 } as never, rae));
    assert.equal(first.cursor, `e.${first.events[0]!.id}`, 'a one-line page answered a rowid as its cursor');
    const news = value<News>(await api.whatsNew(undefined, rae));
    assert.equal(news.upTo, `e.${news.events[0]!.id}`, 'whatsNew answered a rowid as upTo');
    assert.ok(!JSON.stringify(news).includes('"rowid"'), 'whatsNew handed her a rowid');

    /* AND NO NUMBER IS TAKEN FROM HER, because stepping down the log one number at a time says which rowids she was shown. */
    const newest = sql.one<{ n: number }>('SELECT MAX(rowid) AS n FROM event')!.n;
    for (let n = 1; n <= newest; n++) assert.equal(((await api.recentHistory({ cursor: n, limit: 1 } as never, rae)) as Out).ok, false, `recentHistory took cursor ${n}`);
    sql.close();
  }
});

test('(2) THE OWNER, WHO IS SHOWN THE INVITATIONS, KEEPS THE ROWID', async () => {
  const { sql, api } = await between(3);
  const page = value<Page>(await api.recentHistory({ limit: 200 } as never, owner));
  assert.ok(page.events.filter((e) => /^access\./u.test(e.kind)).length >= 3, 'the owner reads his own invitations');
  assert.ok(page.events.every((e) => typeof e.rowid === 'number'), 'the owner lost the rowid');
  assert.equal(value<News>(await api.whatsNew(undefined, owner)).upTo, page.events[0]!.rowid);
  sql.close();
});

test('(3) AN OWNER HELD TO append ON ONE LIST IS HANDED NO ROWID, because the gap counts what that list hides from him', async () => {
  const { sql, api } = await between(0);
  const DIARY = { ...OBLIGATIONS, id: 'register.diary', body: { ...(OBLIGATIONS.body as object), id: 'diary', name: 'Diary' } as never };
  assert.ok((await api.kernel.install([DIARY])).ok);
  /* A SECOND OWNER HOLDS THE FIRST TO append ON DIARY, which is the "owner held to part of it" `members.ts` exists for. */
  value(await api.invite({ person: 'p_2', name: 'Kit', level: 'owner' } as never, owner));
  value(await api.invite({ person: 'p_1', name: 'Hal', level: 'owner', registers: { diary: 'append' } } as never, { principal: { kind: 'person', id: 'p_2', level: 'owner' } }));
  const held = api.kernel.access('p_1')!;
  const hal: CallContext = { principal: { kind: 'person', id: 'p_1', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.equal(held.level, 'owner', 'he is still an owner');
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 43' } }, hal));
  value(await api.create({ register: 'diary', fields: { what: 'Kit is leaving' } }, hal));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 44' } }, hal));
  const page = value<Page>(await api.recentHistory({ limit: 200 } as never, hal));
  assert.ok(!page.events.some((e) => e.register === 'diary'), 'append does not read, so the Diary line is not his');
  const [newer, older] = page.events.filter((e) => e.register === 'obligations');
  assert.ok(
    newer!.rowid === undefined && older!.rowid === undefined,
    `his two lines sat at rowids ${older!.rowid} and ${newer!.rowid}, over the Diary write he may not read`,
  );
  sql.close();
});
