/**
 * Today's tiles in one read (`today`, scope 2026-10-24 A12): the body as `previewPage` draws it, and every tile's part
 * beside it, each the same answer its own method gives the same caller asked alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { lateListsOf, runsListOf, type TodayAnswer } from '../src/today.ts';
import { installSeed } from '../../seed/src/index.ts';
import { NOW } from '../../seed/src/modules/base.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The parts of Today's body (`todayHome` in the app) the tiles read beside: the late work, the projects as cards. */
const BODY = {
  page: 'today',
  title: 'Today',
  blocks: [
    { kind: 'todo', heading: 'Late', source: 'register.tasks', where: 'state is not done or dropped, by before +1d', columns: [{ field: 'what' }, { field: 'by' }], limit: 8 },
    { kind: 'cards', key: 'projects', heading: 'Projects', source: 'register.things', columns: [{ field: 'name', as: 'title' }], limit: 500 },
  ],
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAT', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded).slice(0, 300));
  return { sql, api };
}

test('ONE CALL ANSWERS EVERY TILE: the page, what was handled, what is shared, and each card part, as each is asked alone', async () => {
  const { sql, api } = await record();
  const got = value<TodayAnswer>(await api.today({ body: BODY }, owner));

  assert.deepEqual(got.page, value(await api.previewPage({ body: BODY }, owner)));
  assert.deepEqual(got.handled, value(await api.handled({}, owner)));
  assert.deepEqual(got.shared, value(await api.sharedOut({}, owner)));

  assert.ok(got.cards, 'a body that draws the projects as cards has their parts');
  assert.equal(got.cards.register, 'things');
  /* THE RUNS, as `list` answers the runs that name a project, newest heard first. */
  const runs = runsListOf([...api.kernel.registers()].map(([, d]) => d as never), 'things');
  assert.ok(runs && got.cards.runs);
  assert.deepEqual(got.cards.runs.rows, value<{ rows: unknown[] }>(await api.list({ register: runs.list, where: `${runs.field} is set`, order: [{ field: 'last_seen', dir: 'desc' }], limit: 200 } as never, owner)).rows);
  /* THE KEY NUMBERS, as the cards' own body draws them. */
  const kpis = value<{ blocks: { kpis?: unknown[] }[] }>(await api.previewPage({ body: { page: 'key-numbers', title: 'Key numbers', blocks: [{ kind: 'kpis', source: 'kpis', for: 'cards', limit: 200 }] } }, owner));
  assert.deepEqual(got.cards.leads, kpis.blocks[0]!.kpis);
  /* AND THE DAY EACH PROJECT'S ROW LAST CHANGED, what a card with no run on it is quiet since. */
  const projects = value<{ rows: { seq: number; updated_at: string }[] }>(await api.list({ register: 'things', limit: 500 } as never, owner)).rows;
  assert.ok(projects.length > 0);
  assert.deepEqual(got.cards.moved, Object.fromEntries(projects.map((r) => [String(r.seq), r.updated_at.slice(0, 10)])));
  sql.close();
});

test('EACH PROJECT IS COUNTED ITS LATE WORK, one more for a task past its day that points at it', async () => {
  const { sql, api } = await record();
  const before = value<TodayAnswer>(await api.today({ body: BODY }, owner)).cards!.lates;
  const decls = [...api.kernel.registers()].map(([, d]) => d as never);
  assert.ok(lateListsOf(decls, 'things').some((l) => l.id === 'tasks'), 'the work list is read for late work');
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze the second batch', thing: 'things#1', by: '2026-08-20' } }, owner));
  /* A FIRST READ AFTER THE WRITE IS TODAY AS IT WAS LAST DRAWN, said `behind`; asked `fresh`, it is drawn now. */
  const first = value<TodayAnswer>(await api.today({ body: BODY }, owner));
  assert.equal(first.behind, true);
  assert.deepEqual(first.cards!.lates, before);
  const after = value<TodayAnswer>(await api.today({ body: BODY, fresh: true }, owner));
  assert.equal(after.behind, undefined);
  assert.equal(after.cards!.lates['1'] ?? 0, (before['1'] ?? 0) + 1);
  sql.close();
});

test('A RESTART KEEPS TODAY AS IT WAS LAST DRAWN beside the record: the first read after it is answered at once, behind', async () => {
  const sql = openSqlite();
  const store = new Map<string, unknown>();
  const kept = {
    get: async (k: string) => structuredClone(store.get(k)),
    put: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
    delete: async (k: string) => store.delete(k),
  };
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), kept });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAT', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await installSeed(api.kernel)).ok);
  const drawn = value<TodayAnswer>(await api.today({ body: BODY }, owner));
  /* The store is written behind the answer: waited for, up to two seconds, since one turn of the loop was not always
     enough on a busy machine and the test is about what is kept, not how soon. */
  for (let waited = 0; store.size < 2 && waited < 2_000; waited += 10) await new Promise((r) => setTimeout(r, 10));
  assert.ok(store.size >= 2, 'the drawing and its order are kept');

  /* THE OBJECT STARTS AGAIN over the same record and the same store, with nothing in memory. */
  const read: string[] = [];
  const again = await createRecordApi({ sql, clock: fixedClock(NOW), kept: { ...kept, get: async (k: string) => (read.push(k), kept.get(k)) } });
  const first = value<TodayAnswer>(await again.today({ body: BODY }, owner));
  assert.ok(read.some((k) => k.startsWith('today.kept.')), 'what memory did not hold is read from the store');
  /* At the same version and inside `HELD_MS`, the kept drawing is the answer as it stands. */
  assert.deepEqual(first, drawn);
  /* `fresh` never reads the store, and is drawn now. */
  const asked = read.length;
  assert.equal(value<TodayAnswer>(await again.today({ body: BODY, fresh: true }, owner)).behind, undefined);
  assert.equal(read.length, asked);

  /* ANOTHER READER'S DRAWING IS NOT HANDED OVER: a key is the reader and the body. */
  const other = await createRecordApi({ sql, clock: fixedClock(NOW), kept: { ...kept, get: async () => undefined } });
  assert.equal(value<TodayAnswer>(await other.today({ body: BODY }, owner)).behind, undefined);
  sql.close();
});

test('A BODY THAT DRAWS NO PROJECT CARDS asks nothing of them, and a body that is not one is refused', async () => {
  const { sql, api } = await record();
  const got = value<TodayAnswer>(await api.today({ body: { ...BODY, blocks: [BODY.blocks[0]] } }, owner));
  assert.equal(got.cards, null);
  const none = (await api.today({}, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(none.ok, false);
  assert.equal(none.refusal?.at, 'body');
  const stray = (await api.today({ body: BODY, also: true } as never, owner)) as { ok: boolean };
  assert.equal(stray.ok, false);
  sql.close();
});

test('OFFER FALSE LEAVES THE WIDGET OFFER OUT and draws the rest as before; an offer that is not a yes or no is refused', async () => {
  const { sql, api } = await record();
  const without = value<TodayAnswer>(await api.today({ body: BODY, offer: false, fresh: true }, owner));
  assert.equal(without.widget, undefined);
  const with_ = value<TodayAnswer>(await api.today({ body: BODY, fresh: true }, owner));
  assert.deepEqual(without.page, with_.page);
  assert.deepEqual(without.cards, with_.cards);
  const bad = (await api.today({ body: BODY, offer: 'no' } as never, owner)) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(bad.ok, false);
  assert.equal(bad.refusal?.at, 'offer');
  sql.close();
});

test('SOMEBODY HELD TO ONE LIST is answered every part as her own reads answer it, and none she may not read', async () => {
  const { sql, api } = await record();
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { things: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const got = value<TodayAnswer>(await api.today({ body: BODY }, wren));
  assert.deepEqual(got.page, value(await api.previewPage({ body: BODY }, wren)));
  /* SHE READS NO WORK AND NO MONEY, so no project has late work she is told of. */
  assert.deepEqual(got.cards?.lates, {});
  const shared = (await api.sharedOut({}, wren)) as { ok: boolean; value?: unknown };
  assert.deepEqual(got.shared, shared.ok ? shared.value : null);
  sql.close();
});
