/**
 * The log as a member invited to one list pages it: no event rowid out, none taken in.
 *
 * `loop/research-history-cursor.md` measured three ways the rowid counted the events she was not shown, and none of
 * them was only the `rowid` on her line. A limit-1 page answered her line's rowid as its cursor; a whole-number cursor
 * she chose was a probe, since stepping it from 3 to 10 changed the answer at 4 and at 8 and so said which rowids were
 * hers; and `markRead` answered the rowid it walked to. Every case here is written against a record built the way the
 * host builds a member (`kernel.access` into a `CallContext`), on a log where hidden writes sit between two of hers.
 *
 * AND THE OWNER'S ANSWER DOES NOT MOVE. Whoever reads the whole record is told the rowid as before, because for them it
 * counts nothing they may not read, and `/audit`'s footer and `read.test.ts`'s arithmetic are true for them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };

type Line = { rowid?: number; id: string; kind: string; target: string | null; ts: string; settles?: string };
type Page = { events: Line[]; cursor: number | string | null };
type News = { events: Line[]; upTo: number | string | null; sinceCapped: boolean };
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { obligations: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  assert.equal(held.level, null, 'the member this file is about holds nothing on the record');
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { sql, clock, api, wren };
}

/** Hers, three of the diary's a minute later, hers again, and a question about her list asked and accepted. */
async function busy() {
  const r = await record();
  const { api, clock } = r;
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));
  for (let i = 0; i < 3; i++) value(await api.create({ register: 'diary', fields: { body: `Dinner ${i}` } }, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42', state: 'open' } }, owner));
  const asked = value<{ id: string }>(await api.propose({ question: 'File Invoice 43?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 43', state: 'open' }] } } as never, agent));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'Yes, for the proof.' } }, owner));
  const hidden = r.sql.one<{ id: string }>("SELECT id FROM event WHERE to_v LIKE '%Dinner 1%'")!.id;
  return { ...r, asked: asked.id, hidden };
}

/** Every page of the log for one caller at one size, following the cursor each page answered. */
async function pages(api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext, limit: number): Promise<Page[]> {
  const out: Page[] = [];
  let cursor: number | string | null = null;
  do {
    const page: Page = value<Page>(await api.recentHistory({ limit, ...(cursor === null ? {} : { cursor }) } as never, ctx));
    out.push(page);
    cursor = page.cursor;
  } while (cursor !== null && out.length < 100);
  assert.equal(cursor, null, 'the walk never reached the bottom');
  return out;
}

const refusalOf = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, `taken: ${JSON.stringify(x.value)}`);
  return x.refusal;
};

test('(1) HER CURSORS NAME LINES SHE WAS SHOWN, never a number, and they page the same lines the rowid paged', async () => {
  const { sql, api, wren } = await busy();
  const whole = value<Page>(await api.recentHistory({ limit: 200 } as never, wren));
  assert.equal(whole.cursor, null);
  assert.ok(whole.events.length >= 4, `the probe needs several of her lines, and has ${whole.events.length}`);
  for (const limit of [1, 2, 50]) {
    const walked = await pages(api, wren, limit);
    assert.deepEqual(walked.flatMap((p) => p.events.map((e) => e.id)), whole.events.map((e) => e.id), `limit ${limit}`);
    for (const p of walked) {
      assert.ok(p.cursor === null || (typeof p.cursor === 'string' && p.cursor === `e.${p.events.at(-1)!.id}`), `limit ${limit} answered cursor ${JSON.stringify(p.cursor)}`);
      assert.ok(!p.events.some((e) => 'rowid' in e), `limit ${limit} handed her a rowid`);
    }
  }
  sql.close();
});

test('(2) A WHOLE NUMBER FROM HER IS REFUSED, so stepping one down the log answers nothing at all', async () => {
  const { sql, api, wren } = await busy();
  const newest = sql.one<{ n: number }>('SELECT MAX(rowid) AS n FROM event')!.n;
  const answered: number[] = [];
  for (let n = 1; n <= newest + 2; n++) {
    const out = (await api.recentHistory({ cursor: n, limit: 1 } as never, wren)) as Out;
    if (out.ok) answered.push(n);
    else assert.equal(out.refusal?.at, 'cursor');
  }
  assert.deepEqual(answered, [], 'a numeric cursor was taken, and each answer says where one of her lines sits');
  for (let n = 1; n <= newest + 2; n++) assert.equal(((await api.whatsNew({ cursor: n } as never, wren)) as Out).ok, false, `whatsNew took cursor ${n}`);
  sql.close();
});

test('(3) `markRead` REFUSES HER A NUMBER, and an `e.` id marks and answers an `e.` id', async () => {
  const { sql, api, wren } = await busy();
  for (const upTo of [1, 3, 5, 8, 10]) assert.equal(refusalOf(await api.markRead({ upTo } as never, wren))?.at, 'upTo', `upTo ${upTo}`);
  const lines = value<Page>(await api.recentHistory(undefined, wren)).events;
  const older = lines.at(-1)!;
  const named = value<{ upTo: unknown; seen_at: string | null }>(await api.markRead({ upTo: `e.${older.id}` } as never, wren));
  assert.deepEqual(named, { upTo: `e.${older.id}`, seen_at: older.ts });
  const all = value<{ upTo: unknown; seen_at: string | null }>(await api.markRead(undefined, wren));
  assert.deepEqual(all, { upTo: `e.${lines[0]!.id}`, seen_at: lines[0]!.ts });
  sql.close();
});

test("(4) `boot` AND `whatsNew` NAME HER NEWEST LINE BY ITS ID, and carry no rowid", async () => {
  const { sql, api, wren } = await busy();
  const booted = value<{ whatsNew: News }>(await api.boot(wren)).whatsNew;
  assert.ok(booted.events.length > 0);
  assert.equal(booted.upTo, `e.${booted.events[0]!.id}`);
  assert.ok(!JSON.stringify(booted).includes('"rowid"'), 'boot handed her a rowid');
  const news = value<News>(await api.whatsNew(undefined, wren));
  assert.equal(news.upTo, `e.${news.events[0]!.id}`);
  assert.ok(!JSON.stringify(news).includes('"rowid"'), 'whatsNew handed her a rowid');
  /* AND WHAT IT ANSWERED GOES BACK IN, to mark it and to read from it. */
  assert.equal(value<{ upTo: unknown }>(await api.markRead({ upTo: news.upTo } as never, wren)).upTo, news.upTo);
  assert.deepEqual(value<News>(await api.whatsNew({ cursor: news.upTo } as never, wren)).events.map((e) => e.id), [news.events[0]!.id]);
  sql.close();
});

test('(5) AN UNKNOWN ID, AN ID SHE WAS NOT SHOWN, A NUMBER AND A FORGED SEAL ARE REFUSED IN THE SAME WORDS', async () => {
  const { sql, api, wren, hidden } = await busy();
  const wrong = [5, `e.${hidden}`, 'e.01M1RQ16G0Z4GD4PPRY48E3M42', 's.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'e.', '7', 'soon'];
  const history = await Promise.all(wrong.map(async (cursor) => refusalOf(await api.recentHistory({ cursor, limit: 1 } as never, wren))));
  const news = await Promise.all(wrong.map(async (cursor) => refusalOf(await api.whatsNew({ cursor } as never, wren))));
  const marks = await Promise.all(wrong.map(async (upTo) => refusalOf(await api.markRead({ upTo } as never, wren))));
  for (const [said, at] of [[history, 'cursor'], [news, 'cursor'], [marks, 'upTo']] as const) {
    assert.equal(new Set(said.map((r) => JSON.stringify(r))).size, 1, `the ${at} refusals differ, so one of them says which it was: ${JSON.stringify(said)}`);
    assert.equal(said[0]?.at, at);
    assert.equal(said[0]?.code, 'VALUE_MALFORMED');
  }
  sql.close();
});

test('(6) A `decide` LINE SAYS WHICH QUESTION IT SETTLED, so the resolve beside it folds by that and not by rowid - 1', async () => {
  const { sql, api, wren, asked } = await busy();
  for (const ctx of [owner, wren]) {
    const lines = value<Page>(await api.recentHistory(undefined, ctx)).events;
    const decide = lines.find((e) => e.kind === 'decide')!;
    const resolve = lines.find((e) => e.kind === 'resolve')!;
    assert.equal(decide.settles, asked);
    assert.equal(resolve.target, `suggestion:${decide.settles}`);
    assert.equal(resolve.ts, decide.ts);
    assert.ok(!lines.some((e) => e.kind !== 'decide' && 'settles' in e), 'settles on a line that settles nothing');
  }
  sql.close();
});

test("(7) THE OWNER'S ANSWERS ARE TODAY'S, rowids and whole-number cursors, with `settles` the one thing added", async () => {
  const { sql, api } = await busy();
  const log = sql.all<{ rowid: number; id: string }>('SELECT rowid, id FROM event ORDER BY rowid DESC').map((e) => ({ rowid: Number(e.rowid), id: e.id }));
  const KEYS = ['rowid', 'id', 'ts', 'actor', 'kind', 'target', 'target_kind', 'field', 'from', 'to', 'note', 'batch', 'register', 'seq', 'title'].sort();

  const whole = value<Page>(await api.recentHistory({ limit: 200 } as never, owner));
  assert.deepEqual(whole.events.map((e) => ({ rowid: e.rowid, id: e.id })), log);
  for (const e of whole.events) assert.deepEqual(Object.keys(e).filter((k) => k !== 'settles').sort(), KEYS, `${e.kind} carries other keys`);
  for (const p of await pages(api, owner, 3)) assert.ok(p.cursor === null || p.cursor === p.events.at(-1)!.rowid, `cursor ${JSON.stringify(p.cursor)}`);

  /* A DIGIT STRING IS THE SAME CURSOR, because a GET now brings it as the text it was sent (`host` no longer coerces). */
  const third = log[2]!.rowid;
  assert.deepEqual(value<Page>(await api.recentHistory({ cursor: String(third), limit: 2 } as never, owner)), value<Page>(await api.recentHistory({ cursor: third, limit: 2 } as never, owner)));
  assert.equal(refusalOf(await api.recentHistory({ cursor: 'soon' } as never, owner))?.fix, 'A cursor is the number of an event, a whole number from 1.');

  const news = value<News>(await api.whatsNew(undefined, owner));
  assert.equal(news.upTo, news.events[0]!.rowid);
  assert.deepEqual(value<News>(await api.whatsNew({ cursor: third } as never, owner)).events.map((e) => e.rowid), log.slice(0, 3).map((e) => e.rowid));
  const marked = value<{ upTo: unknown }>(await api.markRead(undefined, owner));
  assert.equal(marked.upTo, log[0]!.rowid);
  assert.equal(value<{ upTo: unknown }>(await api.markRead({ upTo: third } as never, owner)).upTo, third);
  sql.close();
});

test('(8) PAST THE WALK CAP HER CURSOR IS SEALED, the lines come back in order, and no two seals of one stop compare', async () => {
  const { sql, api, clock, wren } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Old', state: 'open' } }, owner));
  for (let i = 0; i < 5_200; i++) value(await api.create({ register: 'diary', fields: { body: `d${i}` } }, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'obligations', fields: { what: 'New', state: 'open' } }, owner));

  const walked = await pages(api, wren, 2);
  assert.deepEqual(walked.map((p) => p.events.length), [1, 1], 'the cap no longer cuts the first page short, so this measures nothing');
  const sealed = walked[0]!.cursor;
  assert.ok(typeof sealed === 'string' && sealed.startsWith('s.'), `the stop point went out as ${JSON.stringify(sealed)}`);
  assert.equal(walked[1]!.cursor, null);
  const titles = walked.flatMap((p) => p.events.map((e) => sql.one<{ to_v: string }>('SELECT to_v FROM event WHERE id = ?', e.id)!.to_v));
  assert.ok(titles[0]!.includes('New') && titles[1]!.includes('Old'), JSON.stringify(titles));

  const again = value<Page>(await api.recentHistory({ limit: 2 } as never, wren)).cursor;
  assert.ok(typeof again === 'string' && again.startsWith('s.'));
  assert.notEqual(again, sealed, 'the same stop point sealed twice reads the same, so she can compare them');

  /* A BYTE CHANGED IS REFUSED, and so is a seal from another instance, which is what a restart makes of it. */
  const flipped = `${sealed.slice(0, -2)}${sealed.at(-2) === 'A' ? 'B' : 'A'}${sealed.at(-1)}`;
  assert.equal(refusalOf(await api.recentHistory({ cursor: flipped, limit: 2 } as never, wren))?.at, 'cursor');
  const restarted = await createRecordApi({ sql, clock });
  assert.equal(refusalOf(await restarted.recentHistory({ cursor: sealed, limit: 2 } as never, wren))?.at, 'cursor');
  sql.close();
});
