/**
 * `boot` sends a run's page by its address alone (scope 2026-10-24 A8): on his record 908 of 990 pages were runs, 207 KB
 * of a 278 KB `boot` sent on every open and every move of the record. Each run's page is in `rowPages`, its row's number
 * and its slug by list, so a link to the run still opens it; `pages`, the rail's and the palette's, holds none of them.
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

type BootSaid = { pages: { slug: string; about: { register: string; seq: number | null } | null }[]; rowPages?: { register: string; rows: [number, string][] }[] };

test("A RUN'S PAGE IS IN rowPages BY ITS ADDRESS, and pages holds none of them", async () => {
  const { sql, api } = await record();
  const out = await api.boot(owner as never);
  assert.ok(out.ok, JSON.stringify(out));
  const b = out.value as unknown as BootSaid;
  assert.equal(b.pages.filter((p) => p.about?.register === 'session').length, 0, 'a run page was still listed whole');
  const runs = b.rowPages?.find((l) => l.register === 'session')?.rows ?? [];
  /* EACH ADDRESS IS THE ONE THE RECORD OPENS: the run's page, read by its slug. The seed's own runs are among them. */
  const every = api.kernel.pages().filter((p) => p.about?.register === 'session');
  assert.ok(runs.length >= RUNS);
  assert.equal(runs.length, every.length);
  for (const [seq, slug] of runs) assert.equal(every.find((p) => p.about?.seq === seq)?.slug, slug, `session#${seq}`);
  const read = await api.page({ slug: runs[0]![1] }, owner);
  assert.ok((read as { ok: boolean }).ok, JSON.stringify(read).slice(0, 300));
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
