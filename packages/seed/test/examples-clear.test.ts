/**
 * Clearing a founder's example rows (`kernel` `examples`, `clearExamples`): only rows that arrived as examples and that
 * nobody has touched since go, each as a `delete` the log keeps. An example somebody edited, or one a row of their own
 * points at, stays.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument, plantedRows } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_1', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function founder(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'northwind', name: 'Northwind', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'founder@example.test', name: 'Ada' } }).ok);
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    const pack = value<Pack>(await normalise(moduleDocument(u, m, { today: TODAY, holds, examples: true }), { kind: 'local' }));
    const diff = await plan(pack, stateOf(k));
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const pack = value<Pack>(await normalise(carriedDocument(u, TODAY, null, { examples: true }), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
  return k;
}

const exampleIn = (k: Kernel, register: string) =>
  value<{ rows: { id: string; seq: number | null; fields: Record<string, unknown> }[] }>(k.list({ register, limit: 50 })).rows.find((r) => Array.isArray(r.fields.tags) && r.fields.tags.includes('example'));

test('ONLY UNTOUCHED EXAMPLES ARE CLEARED: one linked to another example goes, one edited or pointed at by a real row stays', async () => {
  const k = await founder();
  const w = { actor: 'p_1' };
  const before = k.examples();
  assert.ok(before.untouched >= 5, `a founder record plants examples, got ${before.untouched}`);
  assert.equal(before.touched, 0);
  const othersBefore = before.others;

  /* Linking one example to another, as setting up does, leaves both untouched. */
  const project = exampleIn(k, 'things')!;
  const task = exampleIn(k, 'tasks')!;
  const decl = k.register('tasks') as unknown as { fields: { id: string; type: string; to?: string }[] };
  const link = decl.fields.find((f) => f.type === 'ref' && f.to === 'things');
  assert.ok(link, 'a task can name its project');
  value(k.update('tasks', task.id, { [link.id]: project.id }, w));
  assert.equal(k.examples().untouched, before.untouched);

  /* A real row naming the example project keeps it; an edited example is kept. */
  const mine = value<{ id: string }>(k.create('tasks', { what: 'My own task', state: 'open', [link.id]: project.id }, w));
  const track = exampleIn(k, 'tracks')!;
  /* A note on the write keeps it off the grace-window fold (`packages/kernel/src/index.ts` write): a
     bare correction in a row's first three minutes folds into its `create` line and reads as never touched, so an
     edit meant to be seen here carries the note a real edit would. */
  value(k.update('tracks', track.id, { name: 'Launch the yearly plan' }, { ...w, note: 'Renamed the track.' }));
  /* A real row somebody tagged example later is not an example. */
  const real = value<{ id: string }>(k.create('tracks', { name: 'Hire a designer', state: 'open' }, w));
  value(k.update('tracks', real.id, { tags: ['example'] }, w));

  const now = k.examples();
  assert.ok(now.others >= othersBefore + 1, 'a row of their own beside the examples is counted');
  assert.equal(now.touched, 3, 'the project a real task names, the edited track, and the real track tagged later');
  const out = value<{ cleared: number; kept: number }>(k.clearExamples(w));
  assert.equal(out.cleared, now.untouched);
  assert.equal(out.kept, 3);
  assert.equal(k.get(task.id), null, 'the untouched example task is gone');
  assert.ok(k.get(project.id), 'the example project a real task names stays');
  assert.ok(k.get(track.id), 'the edited example stays');
  assert.ok(k.get(real.id) && k.get(mine.id), 'real rows stay');
  assert.ok(k.get(task.id, { includeDeleted: true })?.deleted_at, 'deleted, not purged, so it can be restored');
  assert.deepEqual(k.examples(), { untouched: 0, touched: 3, registers: {}, others: 0 });
  /* Twice is the same answer. */
  assert.deepEqual(value(k.clearExamples(w)), { cleared: 0, kept: 3 });
});

/* THE RECORD'S OWN SEED PATH: `example` added to the tags a seed already carries (`packages/record` `exampleTag`). */
const recordHost = (k: Kernel): Host => ({
  ...hostFor(k),
  seed: (register, fields) => {
    const tags = Array.isArray(fields.tags) ? (fields.tags as unknown[]).map(String) : [];
    return k.create(register, { ...fields, tags: tags.includes('example') ? tags : [...tags, 'example'] }, { actor: 'p_1', cascade: false }) as never;
  },
});

/* A sentence forms the plan whatever `examples` says; without one the use case's own examples come only when asked. */
async function guideRecord(said: string | null, examples = false): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'my-podcast', name: 'My podcast', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'maker@example.test', name: 'Ada' } }).ok);
  const pack = value<Pack>(await normalise(carriedDocument(useCase('guide')!, TODAY, said, { examples }), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, recordHost(k), diff.planHash));
  return k;
}

test("A GUIDE'S PLAN FORMED FROM WHAT THE PERSON SAID IS NEVER OFFERED FOR CLEARING, while a guide's own demo examples are", async () => {
  const formed = await guideRecord('a podcast about local history');
  const milestones = value<{ rows: { fields: Record<string, unknown> }[] }>(formed.list({ register: 'milestones', limit: 50 })).rows;
  assert.ok(milestones.length > 0, 'the plan was formed');
  /* WHETHER THE SEED PATH ALSO MARKS IT `example` IS THE RECORD'S (`exampleTag`), and either way it is never cleared. */
  assert.ok(milestones.every((r) => (r.fields.tags as string[]).includes('formed')));
  assert.deepEqual(formed.examples(), { untouched: 0, touched: 0, registers: {}, others: 0 });
  assert.deepEqual(value(formed.clearExamples({ actor: 'p_1' })), { cleared: 0, kept: 0 });
  assert.equal(value<{ rows: unknown[] }>(formed.list({ register: 'milestones', limit: 50 })).rows.length, milestones.length, 'the plan is all still there');

  const bare = await guideRecord(null);
  assert.deepEqual(bare.examples(), { untouched: 0, touched: 0, registers: {}, others: 0 }, 'a guide set up without a sentence plants no examples unless asked');

  /* ASKED FOR ITS EXAMPLES, it plants what its pack carries, every one of them clearable: none since USE-A09, which made
     the general plan a formed one (`guide-kinds.ts`), so this follows the pack rather than a count. */
  const plain = await guideRecord(null, true);
  const demo = plain.examples();
  const carried = (useCaseDocument('guide', TODAY)?.seeds as unknown[] | undefined)?.length ?? 0;
  assert.equal(demo.untouched, carried, "a guide set up without a sentence asked for its examples has the use case's own to clear");
  assert.equal(value<{ cleared: number }>(plain.clearExamples({ actor: 'p_1' })).cleared, demo.untouched);
});

test("A FOUNDER'S EXAMPLES ARE LINKED INTO ONE PICTURE, and still clear together", async () => {
  const { linkExamples } = await import('../src/usecases/links.ts');
  const k = await founder();
  const before = k.examples();
  /* The ordinary write path, as `packages/record` `rowIo` hands it to an install. */
  const io = {
    rows: async (register: string) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register: string, seq: number, field: string, spoken: string | readonly string[]) =>
      k.update(register, `${register}#${seq}`, { [field]: spoken as never }, { actor: 'p_1', cascade: false }).ok,
  };
  const made = await linkExamples(io, 'founder');
  /* NO ACCOUNT SINCE FOUNDER 2.0.0: the organisations are People's, which names none (`ORGANISATIONS` in `people.ts`). */
  assert.equal(made, 3, 'the organisation names its project, and the number its project and organisation');
  const org = exampleIn(k, 'organisations')!;
  const point = exampleIn(k, 'datapoints')!;
  assert.equal(org.fields.accounts, undefined);
  assert.equal((org.fields.projects as unknown[]).length, 1);
  assert.ok(point.fields.thing && point.fields.organisation);
  assert.deepEqual(k.examples(), before, 'linking one example to another leaves every one untouched');
  assert.equal(value<{ cleared: number; kept: number }>(k.clearExamples({ actor: 'p_1' })).cleared, before.untouched);
  assert.deepEqual(k.examples(), { untouched: 0, touched: 0, registers: {}, others: 0 });
});

test('A ROW FORMED FROM WHAT THE PERSON SAID CARRIES formed AND NEVER example, and Clear the examples leaves it', async () => {
  const guide = useCase('guide')!;
  const plan = plantedRows(guide, TODAY, 'a podcast about local history');
  assert.ok(plan.rows.length > 0, 'the plan was formed');
  for (const row of plan.rows) {
    const tags = row.fields.tags as string[];
    assert.ok(tags.includes('formed'), `${row.register} carries formed`);
    assert.ok(!tags.includes('example'), `${row.register} is not an example`);
  }
  /* WRITTEN AS THE FIRST RUN WRITES THEM, after the pack with no rows of its own: as the person's own entries. */
  const k = await guideRecord(null);
  for (const row of plan.rows) value(k.create(row.register, row.fields as never, { actor: 'p_1' }));
  const planted = plan.rows.length;
  const count = () => ['milestones', 'steps', 'choices', 'resources'].reduce((n, r) => n + value<{ rows: unknown[] }>(k.list({ register: r, limit: 100 })).rows.length, 0);
  assert.equal(count(), planted);
  assert.equal(k.examples().untouched, 0, 'nothing formed is offered for clearing');
  assert.equal(value<{ cleared: number }>(k.clearExamples({ actor: 'p_1' })).cleared, 0);
  assert.equal(count(), planted, 'the plan is all still there');
});
