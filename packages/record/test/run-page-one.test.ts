/**
 * Opening one run's page reads that run, not every run (scope 2026-10-24 H18): a run's page is a template's page, and
 * reading one resolved every page of every template to find its own, a page filled for each of 908 runs on his record.
 *
 * WHAT HOLDS IT: the rows the record reads to answer one run's page do not grow with how many runs there are, and the
 * page read is the one every page resolved would have answered. The runs are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function record(runs: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAZ', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  for (let i = 1; i <= runs; i += 1) {
    const made = await api.create({ register: 'session', fields: { doing: `Mending the gate number ${i}`, state: 'done' } }, owner);
    assert.ok((made as { ok: boolean }).ok, JSON.stringify(made));
  }
  /* EVERY ROW THE DATABASE HANDS BACK, counted from here on. */
  let rows = 0;
  let statements = 0;
  const all = sql.all.bind(sql);
  const one = sql.one.bind(sql);
  sql.all = ((text: string, ...params: never[]) => {
    const got = all(text, ...params);
    statements += 1;
    rows += got.length;
    return got;
  }) as typeof sql.all;
  sql.one = ((text: string, ...params: never[]) => {
    const got = one(text, ...params);
    statements += 1;
    if (got !== undefined) rows += 1;
    return got;
  }) as typeof sql.one;
  const count = () => ({ rows, statements });
  const reset = () => {
    rows = 0;
    statements = 0;
  };
  return { sql, api, count, reset };
}

/** Each run's number and the address its page holds, as the kernel resolves them all. */
const runPages = (api: Awaited<ReturnType<typeof record>>['api']): [number, string][] =>
  api.kernel.pages().flatMap((p) => (p.about?.register === 'session' && p.about.seq !== null ? [[p.about.seq, p.slug] as [number, string]] : []));

async function oneRunPage(runs: number) {
  const r = await record(runs);
  await r.api.boot(owner as never);
  const [seq, slug] = runPages(r.api).find(([, s]) => s.startsWith('mending-the-gate-number-1'))!;
  r.reset();
  const read = await r.api.page({ slug: `session#${seq}` }, owner);
  const spent = r.count();
  return { r, seq, slug, read, spent };
}

test("ONE RUN'S PAGE READS ROWS THAT DO NOT GROW WITH THE RUNS", async () => {
  const few = await oneRunPage(10);
  const many = await oneRunPage(120);
  assert.ok((few.read as { ok: boolean }).ok, JSON.stringify(few.read).slice(0, 300));
  assert.ok((many.read as { ok: boolean }).ok, JSON.stringify(many.read).slice(0, 300));
  assert.ok(many.spent.rows - few.spent.rows < 20, `rows read grew from ${few.spent.rows} to ${many.spent.rows} with 110 more runs`);
  assert.ok(many.spent.statements <= few.spent.statements, `statements grew from ${few.spent.statements} to ${many.spent.statements}`);
  few.r.sql.close();
  many.r.sql.close();
});

test('THE PAGE READ BY ITS ROW IS THE PAGE EVERY PAGE RESOLVED ANSWERS, and two runs of one name keep their own', async () => {
  const { sql, api } = await record(3);
  for (const doing of ['Sweeping the yard', 'Sweeping the yard']) assert.ok(((await api.create({ register: 'session', fields: { doing, state: 'done' } }, owner)) as { ok: boolean }).ok);
  await api.boot(owner as never);
  const listed = runPages(api);
  const yard = listed.filter(([, s]) => s.startsWith('sweeping-the-yard'));
  assert.equal(yard.length, 2, JSON.stringify(listed));
  for (const [seq, slug] of [...yard, ...listed.slice(0, 2)]) {
    const read = (await api.page({ slug: `session#${seq}` }, owner)) as { ok: boolean; value: { page: string; param?: { seq: number }; blocks: unknown[] } };
    assert.ok(read.ok, JSON.stringify(read).slice(0, 300));
    const whole = api.kernel.page(slug);
    assert.ok(whole.ok);
    assert.equal(read.value.page, slug);
    assert.equal(read.value.param?.seq, seq, `${slug} is not session#${seq}'s page`);
    assert.equal(JSON.stringify(read.value.blocks), JSON.stringify(whole.value.blocks), `${slug} read by its row differs from the page resolved whole`);
  }
  sql.close();
});

test('A RENAMED RUN STILL OPENS BY ITS SPOKEN ID, at the address it holds now', async () => {
  const { sql, api } = await record(3);
  await api.boot(owner as never);
  const [seq] = runPages(api).at(-1)!;
  assert.ok(((await api.page({ slug: `session#${seq}` }, owner)) as { ok: boolean }).ok);
  const row = (await api.get({ spoken: `session#${seq}` }, owner)) as { ok: boolean; value: { version: number } };
  const moved = await api.update({ register: 'session', seq, patch: { doing: 'Painting the shed door' }, version: row.value.version } as never, owner);
  assert.ok((moved as { ok: boolean }).ok, JSON.stringify(moved).slice(0, 300));
  const after = (await api.page({ slug: `session#${seq}` }, owner)) as { ok: boolean; value: { page: string; param?: { seq: number } } };
  assert.ok(after.ok, JSON.stringify(after).slice(0, 300));
  assert.equal(after.value.page, 'painting-the-shed-door');
  assert.equal(after.value.param?.seq, seq);
  const none = (await api.page({ slug: 'session#99999' }, owner)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(none.refusal?.code, 'PAGE_UNKNOWN');
  sql.close();
});
