/**
 * `boot` lists no run's page (scope 2026-10-24 A8, H17): on his record 908 of 990 pages were runs, 207 KB
 * of a 278 KB `boot` sent on every open and every move of the record, and by address alone 27 KB. `pagesByRow` names
 * the list, a run opens by its spoken id, and `pages`, the rail's and the palette's, holds none of them.
 * And the holding pen is held between reads, as the pages are, until the record or its use moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const RUNS = 40;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAY', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  for (let i = 1; i <= RUNS; i += 1) {
    const made = await api.create({ register: 'session', fields: { doing: `Mending the gate number ${i}`, state: 'done' } }, owner);
    assert.ok((made as { ok: boolean }).ok, JSON.stringify(made));
  }
  return { sql, api };
}

type BootSaid = { pages: { slug: string; about: { register: string; seq: number | null } | null }[]; rowPages?: unknown; pagesByRow?: string[] };

test("A RUN'S PAGE IS NOT IN boot AT ALL, and opens by the run's spoken id", async () => {
  const { sql, api } = await record();
  const out = await api.boot(owner as never);
  assert.ok(out.ok, JSON.stringify(out));
  const b = out.value as unknown as BootSaid;
  assert.equal(b.pages.filter((p) => p.about?.register === 'session').length, 0, 'a run page was still listed whole');
  assert.equal(b.rowPages, undefined, 'the runs were still listed by address');
  assert.ok(b.pagesByRow?.includes('session'), JSON.stringify(b.pagesByRow));
  /* EACH RUN OPENS AS THE PAGE THE RECORD RESOLVES FOR IT. The seed's own runs are among them. */
  const every = api.kernel.pages().filter((p) => p.about?.register === 'session');
  assert.ok(every.length >= RUNS);
  for (const p of [...every.slice(0, 2), ...every.slice(-3)]) {
    const read = (await api.page({ slug: `session#${p.about!.seq}` }, owner)) as { ok: boolean; value: { page: string; param?: { seq: number } } };
    assert.ok(read.ok, JSON.stringify(read).slice(0, 300));
    assert.equal(read.value.page, p.slug);
    assert.equal(read.value.param?.seq, p.about!.seq);
  }
  sql.close();
});

test('A PAGE WITH A PLACE IN THE RAIL IS STILL LISTED WHOLE, a project among them', async () => {
  const { sql, api } = await record();
  const b = ((await api.boot(owner as never)) as { value: BootSaid }).value;
  const projects = api.kernel.pages().filter((p) => p.about?.register === 'things');
  assert.ok(projects.length > 0, 'the seed has no project pages');
  for (const p of projects) assert.ok(b.pages.some((q) => q.slug === p.slug), `${p.slug} left boot`);
  sql.close();
});
