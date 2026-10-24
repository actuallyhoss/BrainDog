/**
 * BrainDog draws unasked (§45 "Who designs"): Slash's daily look files at most one "I drew X. Keep it?" a day, about the
 * page or the project it is for, so the reserved slot shows it there; Keep writes what it drew, and a no is terminal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'drawn_as', type: 'enum', values: ['path', 'roadmap'] },
    ],
  } as never,
};

const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    state: 'state',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open', required: true },
      { id: 'project', type: 'ref', to: 'projects' },
      { id: 'due', type: 'day', deadline: true },
    ],
  } as never,
};

/* A LIST OF STEPS POINTING AT THE PROJECTS: each project's stages. */
const STAGES = {
  id: 'register.stages',
  kind: 'register' as const,
  body: {
    id: 'stages',
    name: 'Stages',
    title: 'name',
    steps: { of: 'project', done: 'done', order: 'order' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'projects', required: true },
      { id: 'done', type: 'bool', default: false },
      { id: 'order', type: 'int' },
    ],
  } as never,
};

const PAGE = {
  id: 'page.desk',
  kind: 'page' as const,
  body: { page: 'desk', title: 'Desk', requires: ['register.jobs'], blocks: [{ kind: 'table', source: 'register.jobs', columns: [{ field: 'what' }, { field: 'due' }], empty: 'No jobs.' }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS, STAGES, JOBS, PAGE]));
  value(api.kernel.create('projects', { name: 'Marsh' }, { actor: 'p_owner' }));
  /* SIX RELEASES ON A DAY AND THREE STAGES: Marsh is drawn both ways, its road and its roadmap, and its stages say the most. */
  for (let i = 1; i <= 6; i++) value(api.kernel.create('jobs', { what: `Release ${i}`, project: 'projects#1', due: `2026-11-0${i}` }, { actor: 'p_owner' }));
  for (const [i, name] of ['Art', 'Island', 'Launch'].entries()) value(api.kernel.create('stages', { name, project: 'projects#1', order: i }, { actor: 'p_owner' }));
  return { api, sql, day: (n: number) => clock.set(NOW + n * DAY) };
}

type Ticked = { ran: boolean; filed?: { id: string; question: string }[] };
const drew = (t: Ticked) => (t.filed ?? []).filter((f) => f.question.startsWith('I drew'));

test('ONE DRAWING A DAY, ABOUT ITS PROJECT, IN THE SLOT WITH KEEP IT, AND KEEP WRITES ITS PLAN', async () => {
  const { api, sql, day } = await record();
  const first = drew((await api.slashTick()) as Ticked);
  assert.deepEqual(
    first.map((f) => f.question),
    ["I drew Marsh's plan as a path of stages. Keep it?"],
  );
  /* THE SLOT READS IT AS A QUESTION ABOUT MARSH, with Keep it the one suggested answer. */
  const read = value<{ blocks: { queue?: { id: string; about?: string; cause?: string; options: { key: string; label: string; recommended: boolean }[] }[] }[] }>(
    await api.previewPage({ body: { page: 'slot', title: 'Suggestion', blocks: [{ kind: 'queue', source: 'governance.open', limit: 20 }] } } as never, owner),
  );
  const q = read.blocks[0]!.queue!.find((x) => x.id === first[0]!.id)!;
  assert.equal(q.about, 'projects#1');
  assert.equal(q.cause, 'drew:plan:projects#1:path');
  assert.deepEqual(
    q.options.filter((o) => o.recommended).map((o) => o.label),
    ['Keep it'],
  );
  /* NOT A SECOND ONE THE SAME DAY, NOR WHILE ONE WAITS. */
  assert.equal(drew((await api.slashTick()) as Ticked).length, 0);
  day(1);
  assert.equal(drew((await api.slashTick()) as Ticked).length, 0);
  value(await api.decide({ id: first[0]!.id, decide: { option: 'keep', reason: 'yes' } }, owner));
  const marsh = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'projects' }, owner)).rows[0]!;
  assert.equal(marsh.fields.drawn_as, 'path');
  sql.close();
});

test('THE NEXT DAY THE NEXT DRAWING, A PAGE’S CALENDAR, AND A NO IS NEVER ASKED AGAIN', async () => {
  const { api, sql, day } = await record();
  const plan = drew((await api.slashTick()) as Ticked)[0]!;
  value(await api.decide({ id: plan.id, decide: { option: 'away', reason: 'no' } }, owner));
  day(1);
  const page = drew((await api.slashTick()) as Ticked);
  assert.deepEqual(
    page.map((f) => f.question),
    ['I drew Jobs on Desk as a calendar. Keep it?'],
  );
  value(await api.decide({ id: page[0]!.id, decide: { option: 'reject', reason: 'not on this page' } }, owner));
  day(2);
  /* BOTH WERE ANSWERED NO, so neither is drawn again. */
  assert.equal(drew((await api.slashTick()) as Ticked).length, 0);
  sql.close();
});

test('KEEPING A PAGE’S CALENDAR WRITES THE BLOCK ON THAT PAGE', async () => {
  const { api, sql, day } = await record();
  const plan = drew((await api.slashTick()) as Ticked)[0]!;
  value(await api.decide({ id: plan.id, decide: { option: 'away', reason: 'no' } }, owner));
  day(1);
  const page = drew((await api.slashTick()) as Ticked)[0]!;
  value(await api.decide({ id: page.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const body = JSON.parse(sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'page.desk' AND superseded_at IS NULL")!.body) as { blocks: { kind: string }[] };
  assert.deepEqual(
    body.blocks.map((b) => b.kind),
    ['table', 'calendar'],
  );
  sql.close();
});

test('MARSH AND ENCORE ARE EACH OFFERED THEIR OWN PLAN, ONE A DAY, AND EACH KEEPS ITS OWN SHAPE', async () => {
  const { api, sql, day } = await record();
  /* ENCORE: ONE STAGE AND ITS RELEASES ON DAYS, so its plan is its roadmap where the plan of Marsh is its road. */
  value(api.kernel.create('projects', { name: 'Encore' }, { actor: 'p_owner' }));
  value(api.kernel.create('stages', { name: 'Payroll', project: 'projects#2', order: 0 }, { actor: 'p_owner' }));
  for (let i = 1; i <= 7; i++) value(api.kernel.create('jobs', { what: `Encore ${i}`, project: 'projects#2', due: `2026-12-0${i}` }, { actor: 'p_owner' }));

  const first = drew((await api.slashTick()) as Ticked);
  assert.deepEqual(
    first.map((f) => f.question),
    ["I drew Encore's plan as a roadmap. Keep it?"],
  );
  value(await api.decide({ id: first[0]!.id, decide: { option: 'keep', reason: 'yes' } }, owner));
  day(1);
  const second = drew((await api.slashTick()) as Ticked);
  assert.deepEqual(
    second.map((f) => f.question),
    ["I drew Marsh's plan as a path of stages. Keep it?"],
  );
  value(await api.decide({ id: second[0]!.id, decide: { option: 'keep', reason: 'yes' } }, owner));

  const kept = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'projects' }, owner)).rows.map((r) => [r.fields.name, r.fields.drawn_as]);
  assert.deepEqual(kept.sort(), [
    ['Encore', 'roadmap'],
    ['Marsh', 'path'],
  ]);
  /* KEPT, BOTH HOLD STILL: the next day draws no plan again, only the page's calendar. */
  day(2);
  assert.deepEqual(
    drew((await api.slashTick()) as Ticked).map((f) => f.question),
    ['I drew Jobs on Desk as a calendar. Keep it?'],
  );
  sql.close();
});

test('A PLAN KEPT AS ITS ROAD WITH NO STAGES LEFT IS REDRAWN AS WHAT IT HOLDS NOW, SAYING WHAT WAS KEPT', async () => {
  const { api, sql, day } = await record();
  /* KILN WAS KEPT AS ITS STAGES AND HAS NONE, only work on days, so its page draws no plan at all. */
  value(api.kernel.create('projects', { name: 'Kiln', drawn_as: 'path' }, { actor: 'p_owner' }));
  for (let i = 1; i <= 9; i++) value(api.kernel.create('jobs', { what: `Kiln ${i}`, project: 'projects#2', due: `2026-12-0${i}` }, { actor: 'p_owner' }));
  /* THE PLAN OF KILN IS THE STRONGER TODAY, nine things on days against three stages. */
  const kiln = drew((await api.slashTick()) as Ticked);
  assert.deepEqual(
    kiln.map((f) => f.question),
    ["I drew Kiln's plan as a roadmap. Keep it?"],
  );
  const q = sql.one<{ cause: string; body: string }>('SELECT cause, body FROM suggestion WHERE id = ?', kiln[0]!.id)!;
  assert.equal(q.cause, 'drew:plan:projects#2:from-path:roadmap');
  assert.match(JSON.stringify((JSON.parse(q.body) as { why: unknown }).why), /Kiln's plan was kept as its stages, and it has none now/u);
  value(await api.decide({ id: kiln[0]!.id, decide: { option: 'keep', reason: 'yes' } }, owner));
  const row = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'projects' }, owner)).rows.find((r) => r.fields.name === 'Kiln')!;
  assert.equal(row.fields.drawn_as, 'roadmap');
  /* AND THE ONE FOR MARSH COMES THE NEXT DAY. */
  day(1);
  assert.deepEqual(
    drew((await api.slashTick()) as Ticked).map((f) => f.question),
    ["I drew Marsh's plan as a path of stages. Keep it?"],
  );
  sql.close();
});
