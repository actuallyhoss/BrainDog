/**
 * The project brief as a pack: a one-line summary, the plan and what is in the way, laid on Portfolio's projects by
 * `extends` and drawn on a page of its own (`loop/research-legacy-keeps.md` section 2 and brief K3,
 * `loop/DIRECTION.md` section 24).
 *
 * THE THREE FIELDS WERE ONE NOTE. the old tool keeps `oneLiner`, `plan[]` and `blockers[]` on every project, and his record
 * at rev 966 held a one-liner on 25 of 26 projects and a blocker on 24. BrainDog's import had nowhere to put them and
 * wrote all three into `note` as markdown, so an agent asking "what is in the way on bake" read the whole note to find
 * one line. At HEAD `things` has no `summary`, and a write carrying one is `FIELD_UNKNOWN`; the first test holds that.
 *
 * A PACK AND NOT A FIELD IN `packages/seed`, because section 24 says the the old tool features are dynamic: data on the
 * record's primitives, never code in the shell that knows about him. Everything here is the pack file and the record's
 * own install path, `planPack` then `installPack`, the road a person takes from the app.
 *
 * ONE PAGE OVER EVERY PROJECT, NOT A SECTION ON EACH PROJECT'S PAGE, and that was measured rather than chosen. The brief
 * asked for a section on a project. A pack cannot lay a block on Portfolio's `project` page (`extends` lays fields and
 * values, nothing else), so the only way to draw it per project was a second template `for: things`, and two templates
 * over one list share one slug per row, first come first served. Measured with every first-party pack and the founder
 * use case, whose `project` page is the one he opens every day: a brief template installed after it got `/p/marrow-2`,
 * an address nobody would guess, and one installed BEFORE it took `/p/marrow` outright, moving the project page to
 * `marrow-2`. The slugs are claimed in the order the declaration rows were written, so which page owns a project's
 * address would turn on which was installed or updated last. So the brief is one page, `/p/briefs`, which is also the
 * shape the old tool's agent index has: one line per project, with what is in the way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; extends: { id: string; adds: string[] }[] };
type Field = { id: string; type: string; of?: string; label?: string };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./project-brief.pack.json', import.meta.url);
const brief = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** A fresh record holding Portfolio and nothing else, which is all the brief asks of one. */
async function portfolio(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 24, 12)) });
  said(await put(api, firstPartyDocument('portfolio')));
  return { api, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved, which for an additive pack is nothing. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

const fieldsOf = (api: Api): Field[] => {
  const d = api.kernel.declarations().find((x) => x.id === 'register.things')!;
  return (JSON.parse(d.body) as { fields: Field[] }).fields;
};

test('BEFORE THE PACK: Projects has no summary, plan or blockers, and a write carrying one is refused', async () => {
  const { api, close } = await portfolio();
  const ids = fieldsOf(api).map((f) => f.id);
  for (const id of ['summary', 'plan', 'blockers']) assert.ok(!ids.includes(id), `things already has ${id}`);
  const r = api.kernel.create('things', { name: 'Kiln', lane: 'earning', summary: 'A type foundry' }, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.code, 'FIELD_UNKNOWN');
  close();
});

test('the plan lays all three on Projects and asks nobody to press anything', async () => {
  const { api, close } = await portfolio();
  const diff = await planOf(api, brief());
  assert.deepEqual(diff.extends.map((e) => [e.id, e.adds]), [['register.things', ['summary', 'plan', 'blockers']]]);
  assert.deepEqual(diff.approve, [], 'an optional field is additive, and an additive change needs no approval');
  assert.deepEqual(diff.conflicts, []);
  close();
});

test('installed, the three fields are on Projects as declared, and a project holds a line, a plan and what is in the way', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const laid = fieldsOf(api).filter((f) => ['summary', 'plan', 'blockers'].includes(f.id));
  assert.deepEqual(
    laid.map((f) => [f.id, f.type, f.of ?? null, f.label]),
    [
      ['summary', 'text', null, 'One line'],
      ['plan', 'list', 'text', 'The plan'],
      ['blockers', 'list', 'text', 'In the way'],
    ],
  );
  const made = said<{ id: string }>(
    api.kernel.create(
      'things',
      { name: 'Kiln', lane: 'earning', summary: 'A type foundry', plan: ['Ship the variable axis', 'Raise the price'], blockers: ['The licence text'] },
      { actor: 'p_1' },
    ),
  );
  const row = api.kernel.get(made.id)!.fields;
  /* THE PLAN KEEPS ITS ORDER, because a plan is steps and the first one is what happens next. */
  assert.deepEqual([row.summary, row.plan, row.blockers], ['A type foundry', ['Ship the variable axis', 'Raise the price'], ['The licence text']]);
  close();
});

test('the Briefs page draws what is in the way, the one line and the plan, each over the projects that said it', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  for (const fields of [
    { name: 'Marrow', lane: 'earning', summary: 'A recipe book', plan: ['Print the second run'], blockers: ['The printer quote'] },
    { name: 'Tallow', lane: 'building', summary: 'Hand-poured candles' },
    { name: 'Ember', lane: 'parked', summary: 'A kiln timer', blockers: ['No buyer'] },
  ])
    said(api.kernel.create('things', fields, { actor: 'p_1' }));

  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'briefs'));
  const page = said<{ title: string; blocks: { heading: string; rows: { fields: Record<string, unknown> }[]; refusals: unknown[] }[] }>(
    await api.page({ slug: 'briefs' }, owner),
  );
  assert.equal(page.title, 'Briefs');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  const names = (heading: string): unknown[] => page.blocks.find((b) => b.heading === heading)!.rows.map((r) => r.fields.name);
  /* A PARKED PROJECT IS NOT IN PLAY, so its blocker is not in the way of anything he is working on. */
  assert.ok(names('In the way').includes('Marrow'));
  assert.ok(!names('In the way').includes('Tallow'), 'a project with nothing in the way was listed as blocked');
  assert.ok(!names('In the way').includes('Ember'), 'a parked project was listed as blocked');
  assert.ok(names('What each one is').includes('Tallow'));
  assert.deepEqual(names('The plan').filter((n) => n === 'Marrow' || n === 'Tallow'), ['Marrow']);
  close();
});

test('the one line is found by search, which is what an agent asking "which one is the candles" reaches for', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  said(api.kernel.create('things', { name: 'Tallow', lane: 'building', summary: 'Hand-poured candles' }, { actor: 'p_1' }));
  const found = said<{ hits: { register: string; title: string }[] }>(await api.search({ q: 'candles' }, owner));
  assert.deepEqual(found.hits.map((h) => [h.register, h.title]), [['things', 'Tallow']]);
  close();
});

test('on a record without Portfolio the plan is refused, naming the list and the module to install first', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 24, 12)) });
  const r = (await api.planPack({ doc: brief(), source: { kind: 'local' } } as never, owner)) as Out;
  assert.equal(r.ok, false);
  assert.match(`${r.refusal?.code} ${r.refusal?.fix}`, /portfolio/u);
  sql.close();
});

test('installing it twice changes nothing, and uninstalling it keeps every brief already written', async () => {
  const { api, close } = await portfolio();
  said(await put(api, brief()));
  const made = said<{ id: string }>(api.kernel.create('things', { name: 'Kiln', lane: 'earning', blockers: ['The licence text'] }, { actor: 'p_1' }));
  const again = await planOf(api, brief());
  assert.deepEqual(again.extends.map((e) => [e.id, e.adds]), [['register.things', []]]);
  said(await put(api, brief()));
  /* WHAT HE WROTE IS HIS, NOT THE PACK'S. Taking the pack away takes its page; the fields stay as the record's own. */
  said(await api.uninstallPack({ id: 'project-brief' } as never, owner));
  assert.deepEqual(api.kernel.get(made.id)!.fields.blockers, ['The licence text']);
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'briefs'));
  close();
});

test('the same file passes as an add-on somebody opens from disk', async () => {
  const file = said<{ pack: { manifest: { pack: string; extends?: unknown } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(file.pack.manifest.pack, 'project-brief');
  assert.deepEqual(Object.keys(file.pack.manifest.extends as object), ['register.things']);
});
