/**
 * Each person's own Today (widgets plan §4.5, W8): a member arranges a Today of their own, kept as theirs, and the
 * record's Today stays the owner's. A record one person uses goes the way it always went.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, OWN_TODAY, type CallContext } from '../src/index.ts';
import type { TodayAnswer } from '../src/today.ts';
import { installSeed } from '../../seed/src/index.ts';
import { NOW } from '../../seed/src/modules/base.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'write' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_bo', level: 'write' } };

const BODY = {
  page: 'home',
  title: 'Today',
  board: true,
  blocks: [
    { kind: 'todo', key: 'late', size: 'large', heading: 'Late', source: 'register.tasks', where: 'state is not done or dropped, by before +1d', columns: [{ field: 'what' }], limit: 8 },
    { kind: 'cards', key: 'projects', size: 'full', heading: 'Projects', source: 'register.things', columns: [{ field: 'name', as: 'title' }], limit: 6 },
  ],
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const code = (r: unknown): string => ((r as { ok: boolean }).ok ? 'ok' : (r as { refusal: { code: string } }).refusal.code);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAT', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded).slice(0, 300));
  return { sql, api };
}

const keysOf = (got: TodayAnswer): string[] => ((got.page as { declared?: { blocks?: { key?: string }[] } }).declared?.blocks ?? []).map((b) => String(b.key));

test("A MEMBER'S EDIT IS THEIR OWN: the record's Today is untouched, and each is drawn their own", async () => {
  const { sql, api } = await record();
  value(await api.boardSteps({ page: 'home', steps: [{ size: 'late', to: 'wide' }], base: BODY }, owner));
  const ownerVersion = sql.one<{ v: number }>("SELECT max(version) AS v FROM declaration WHERE id = 'page.home'")!.v;

  /* Bo moves Projects first: kept as hers, from the owner's kept Today since she sent no base. */
  const wrote = value<{ version: number; before: unknown }>(await api.boardSteps({ page: 'home', steps: [{ move: 'projects', before: 'late' }] }, bo));
  assert.equal(wrote.version, 1);
  assert.equal(wrote.before, null);
  assert.equal(sql.one<{ v: number }>("SELECT max(version) AS v FROM declaration WHERE id = 'page.home'")!.v, ownerVersion, "a member's edit wrote the record's Today");

  assert.deepEqual(keysOf(value<TodayAnswer>(await api.today({ page: 'home' }, bo))), ['projects', 'late']);
  assert.deepEqual(keysOf(value<TodayAnswer>(await api.today({ page: 'home' }, owner))), ['late', 'projects']);

  /* Undo: her board put back as it was, which was none, so the record's Today again. */
  value(await api.boardSteps({ page: 'home', put: null }, bo));
  assert.deepEqual(keysOf(value<TodayAnswer>(await api.today({ page: 'home', fresh: true }, bo))), ['late', 'projects']);
  sql.close();
});

test('A MEMBER WITH NO KEPT TODAY STARTS FROM THE BODY THE SCREEN DREW, and boot lists Today for her without its body', async () => {
  const { sql, api } = await record();
  value(await api.boardSteps({ page: 'home', steps: [{ size: 'projects', to: 'large' }], base: BODY }, bo));
  assert.equal(sql.one("SELECT 1 AS y FROM declaration WHERE id = 'page.home'"), undefined, "a member's first edit kept the record's Today");
  const boot = value<{ pages: { slug: string }[]; home: string | null; me: { prefs?: Record<string, unknown> } }>(await api.boot(bo));
  assert.ok(boot.pages.some((p) => p.slug === 'home'));
  assert.equal(boot.home, 'home');
  assert.equal(Object.hasOwn(boot.me.prefs ?? {}, OWN_TODAY), false, 'her board rode every boot');
  /* The owner is told of no Today, since the record keeps none. */
  assert.equal(value<{ pages: { slug: string }[] }>(await api.boot(owner)).pages.some((p) => p.slug === 'home'), false);
  sql.close();
});

test('ONLY TODAY, ONLY A PERSON: a member is refused any other board, an agent is refused, and setPref cannot name a board', async () => {
  const { sql, api } = await record();
  assert.equal(code(await api.boardSteps({ page: 'money', steps: [{ size: 'late', to: 'wide' }], base: BODY }, bo)), 'LEVEL_REQUIRED');
  assert.notEqual(code(await api.boardSteps({ page: 'home', steps: [{ size: 'late', to: 'wide' }], base: BODY }, agent)), 'ok');
  assert.equal(code(await api.setPref({ key: OWN_TODAY, value: { version: 1, body: BODY } } as never, bo)), 'VALUE_MALFORMED');
  /* And the owner has no `put`: his Undo is the declaration's own. */
  assert.equal(code(await api.boardSteps({ page: 'home', put: null }, owner)), 'FIELD_UNKNOWN');
  sql.close();
});

test('ALONE, NOTHING CHANGES: the owner keeps the record\'s Today and no person keeps a board of their own', async () => {
  const { sql, api } = await record();
  value(await api.boardSteps({ page: 'home', steps: [{ size: 'late', to: 'wide' }], base: BODY }, owner));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM pref WHERE key = ?", OWN_TODAY)!.n, 0);
  assert.ok(sql.one("SELECT 1 AS y FROM declaration WHERE id = 'page.home' AND superseded_at IS NULL"));
  sql.close();
});

test("A PAGE OPEN IS COUNTED FOR THE RECORD AND FOR THE PERSON WHO OPENED IT, and a token's never as a person's", async () => {
  const { sql, api } = await record();
  const slug = api.kernel.pages()[0]!.slug;
  value(await api.page({ slug }, owner));
  value(await api.page({ slug }, owner));
  await api.page({ slug }, agent);
  assert.ok(sql.one<{ n: number }>("SELECT n FROM observation WHERE kind = 'page.render' AND subject = ?", slug)!.n >= 2);
  assert.equal(sql.one<{ n: number }>("SELECT n FROM observation_who WHERE kind = 'page.render' AND subject = ? AND who = 'p_1'", slug)!.n, 2);
  assert.equal(sql.one("SELECT 1 AS y FROM observation_who WHERE who = 'p_bo' OR who = 't_1'"), undefined);
  sql.close();
});
