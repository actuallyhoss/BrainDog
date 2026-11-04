/**
 * THE ROADMAP IS WORK'S TIMELINE NOW (work 1.20.0), and this pack is what a record that held it still has: nothing to
 * draw, and the page handed to Work (`hands`). Its carry-over on a record that held it is driven in
 * `packages/seed/test/merges-carry.test.ts`.
 *
 * WHAT FOLLOWS IS THE ORIGINAL ACCOUNT of why the page exists, kept because it is why Work has it.
 *
 * THE KIND EXISTED AND NO PAGE DREW IT. `roadmap` has been a block kind since the renderer's arithmetic landed, and the
 * record accepts it (`packages/kernel/src/declare.ts`), but no module, pack or use case declared a page with one, so a
 * person with dated tasks had a chart nobody could open. A roadmap belongs in the nav; the first test
 * below holds that at HEAD a record with Work installed answers no `roadmap` page at all.
 *
 * A PACK AND NOT A PAGE IN `packages/seed`, because a time axis over tasks is one way of working and not everybody's.
 * It lays nothing on Work's list: a roadmap reads the two fields every task
 * already carries, `by` the due day and `effort` how long, and the page is the whole of the pack.
 *
 * THE DRAG IS NOT THE PACK'S. A bar is dragged by the drawer (`packages/render/svelte/p/Roadmap.svelte`) and written by
 * the page (`apps/web/src/lib/record/roadmap-write.ts`), both over whatever fields a roadmap block's columns name. The
 * last test here reads this page's rows the way the drawer does, so a column order that drew nothing would fail here
 * and not first on somebody's screen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { DAY_SECONDS, roadmapPlan, roadmapRow } from '../../packages/render/src/roadmap.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[] };
type Answered = { kind: string; heading: string; refusals: unknown[]; rows: { fields: Record<string, unknown> }[]; columns?: { field: string }[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./roadmap.pack.json', import.meta.url);
const pack = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** 24 September 2026, noon: the day every due day below is counted from. */
const NOW = Date.UTC(2026, 8, 24, 12);

/**
 * A fresh record holding Work, and the two lists Work links a task to, which it refuses to install without: "Install
 * portfolio and people first" (`REGISTER_UNRESOLVED`, measured). A roadmap asks nothing of either.
 */
async function work(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'work']) said(await put(api, firstPartyDocument(id, { seeds: [] })));
  return { api, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved, which for a pack that only adds a page is nothing. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** Invented work, dated around the clock above: windows, a date with no effort, one done, one dropped, one with no day. */
function seed(api: Api): void {
  for (const fields of [
    { what: 'Cut the specimen page', state: 'doing', by: '2026-10-02', effort: 3 * DAY_SECONDS },
    { what: 'Glaze test, second firing', state: 'open', by: '2026-09-28', effort: 1.5 * DAY_SECONDS },
    { what: 'Kiln delivery', state: 'open', by: '2026-10-09' },
    { what: 'Price list for the winter fair', state: 'backlog', by: '2026-11-20', effort: 2 * DAY_SECONDS },
    { what: 'Order more clay', state: 'done', by: '2026-09-20', effort: 0.2 * DAY_SECONDS },
    { what: 'Someday: a second studio', state: 'open' },
    { what: 'Quote for a second kiln', state: 'dropped', by: '2026-10-01', effort: DAY_SECONDS },
  ])
    said(api.kernel.create('tasks', fields, { actor: 'p_1' }));
}

async function roadmapOf(api: Api): Promise<Answered> {
  const page = said<{ title: string; blocks: Answered[] }>(await api.page({ slug: 'roadmap' }, owner));
  assert.equal(page.title, 'Timeline');
  const block = page.blocks.find((b) => b.kind === 'roadmap');
  assert.ok(block, 'the Timeline page has no roadmap block');
  assert.deepEqual(block.refusals, [], `${block.heading} was refused`);
  return block;
}

test('WORK DRAWS THE TIMELINE ON ITS OWN: in the nav under Work, every task in play that has a due day, soonest first', async () => {
  const { api, close } = await work();
  seed(api);
  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'roadmap'), 'the Timeline page is not listed');
  const declared = api.kernel.declarations().find((d) => d.id === 'page.roadmap');
  assert.equal((JSON.parse(declared!.body) as { nav?: { section?: string } }).nav?.section, 'Work');
  const block = await roadmapOf(api);
  /* DONE OR DROPPED WORK AND WORK WITH NO DAY ARE NOT ON IT; the backlog is, because work kept for later that has a date
     is still work somebody has put on the calendar. */
  assert.deepEqual(
    block.rows.map((r) => r.fields.what),
    ['Glaze test, second firing', 'Cut the specimen page', 'Kiln delivery', 'Price list for the winter fair'],
  );
  close();
});

test('THE COLUMNS ARE THE ORDER THE KIND READS: title, due day, effort, which is what the drag writes back', async () => {
  const { api, close } = await work();
  seed(api);
  const block = await roadmapOf(api);
  assert.deepEqual((block.columns ?? []).map((c) => c.field), ['what', 'by', 'effort']);
  const rows = block.rows.map((r) =>
    roadmapRow(String(r.fields.what), String(r.fields.by), typeof r.fields.effort === 'number' ? `${r.fields.effort / DAY_SECONDS} d` : ''),
  );
  const plan = roadmapPlan(rows, '2026-09-24');
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual([plan.bars.length, plan.stems.length], [3, 1]);
  assert.deepEqual([plan.from, plan.to], ['2026-09-22', '2026-11-23']);
  close();
});

test('a task moved on the record moves on the timeline, because the page reads the list and holds no copy of it', async () => {
  const { api, close } = await work();
  seed(api);
  const kiln = api.kernel.get('tasks#3')!;
  said(api.kernel.update('tasks', 'tasks#3', { by: '2026-09-25' }, { actor: 'p_1', version: kiln.version }));
  assert.equal((await roadmapOf(api)).rows[0]!.fields.what, 'Kiln delivery');
  close();
});

test('THE OLD ID IS STILL INSTALLABLE, says it is part of Work, declares nothing and hands the page to Work', async () => {
  const file = pack() as { summary: string; declarations: unknown[]; hands: Record<string, string>; version: string; unlisted?: boolean };
  assert.match(file.summary, /^Now part of Work/u);
  assert.equal(file.version, '2.0.0');
  assert.deepEqual(file.declarations, []);
  assert.deepEqual(file.hands, { 'page.roadmap': 'work' });
  const { api, close } = await work();
  const diff = await planOf(api, pack());
  assert.deepEqual(diff.approve, []);
  assert.deepEqual(diff.conflicts, []);
  said(await put(api, pack()));
  assert.equal(((await roadmapOf(api)) as { heading: string }).heading, 'Tasks by due day', 'installing the retired add-on took the page away');
  close();
});

test('on a record without Work the plan says Work is needed first, and install is refused', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const planned = said<{ diff: { planHash: string; approve: unknown[]; requires: { packs: { id: string; ok: boolean }[] } } }>(
    await api.planPack({ doc: pack(), source: { kind: 'local' } } as never, owner),
  ).diff;
  assert.deepEqual(planned.requires.packs.filter((p) => !p.ok).map((p) => p.id), ['work']);
  const r = (await api.installPack({ doc: pack(), source: { kind: 'local' }, planHash: planned.planHash, approve: planned.approve } as never, owner)) as Out;
  assert.equal(r.ok, false);
  sql.close();
});

test('the same file passes as an add-on somebody opens from disk', async () => {
  const file = said<{ pack: { manifest: { pack: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(file.pack.manifest.pack, 'roadmap');
});
