/**
 * A project's shape in its page's own answer (`page` with `shape`, scope 2026-10-24 A20): one call holds every part's
 * rows and figures, each the same answer its own method gives the same caller asked alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { SHAPE_FIGURES, SHAPE_LINKED, kpisDrawnOn, linkedListOf, workListOf, type ShapeAnswer } from '../src/project-shape.ts';
import { runsListOf } from '../src/today.ts';
import { installSeed } from '../../seed/src/index.ts';
import { NOW } from '../../seed/src/modules/base.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

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

type Paged = { param?: { register: string; seq: number }; blocks: { kind: string }[]; shape?: ShapeAnswer };

test("ONE PAGE CALL HOLDS EVERY PART: the row, what was said, what points here, its work, its runs, its key numbers and money", async () => {
  const { sql, api } = await record();
  const page = value<Paged>(await api.page({ slug: 'kiln', shape: true }, owner));
  assert.ok(page.blocks.some((b) => b.kind === 'project'), 'the seed declares the project page as parts of its shape');
  const shape = page.shape;
  assert.ok(shape, 'a project page asked with shape carries it');
  assert.equal(`${shape.register}#${shape.seq}`, `${page.param!.register}#${page.param!.seq}`);
  const { register, seq } = shape;
  const spoken = `${register}#${seq}`;
  const decls = [...api.kernel.registers()].map(([, d]) => d as never);

  assert.deepEqual(shape.row, value(await api.get({ register, seq, values: true }, owner)));
  assert.deepEqual(shape.history, value(await api.history({ register, seq }, owner)));
  assert.deepEqual(shape.links, value(await api.backlinks({ register, seq, limit: 24 } as never, owner)));

  const work = workListOf(decls, register);
  assert.ok(work && shape.work, 'the seed keeps work on its projects');
  assert.equal(shape.work.list, work.list);
  assert.deepEqual(shape.work.rows, value<{ rows: unknown[] }>(await api.list({ register: work.list, where: `${work.field} is ${spoken}`, limit: 500 } as never, owner)).rows);
  assert.ok(shape.work.rows.length > 0);

  const runs = runsListOf(decls, register);
  assert.ok(runs && shape.runs);
  assert.deepEqual(shape.runs.rows, value<{ rows: unknown[] }>(await api.list({ register: runs.list, where: `${runs.field} is ${spoken}`, limit: 40, order: [{ field: 'last_seen', dir: 'desc' }] } as never, owner)).rows);

  const kpis = value<{ blocks: { kpis?: unknown[] }[] }>(await api.previewPage({ body: { page: 'key-numbers', title: 'Key numbers', blocks: [{ kind: 'kpis', source: 'kpis', for: 'project', about: spoken }] } }, owner));
  assert.deepEqual(shape.kpis, kpis.blocks[0]!.kpis ?? null);

  const name = String((shape.row as { fields: Record<string, unknown> }).fields.name);
  for (const f of SHAPE_FIGURES) {
    const id = `${f}:${name}`;
    const alone = (await api.metric({ metric: id }, owner)) as { ok: boolean; value?: unknown };
    assert.deepEqual(shape.figures[id] ?? null, alone.ok ? alone.value : null, id);
  }
  assert.ok(Object.keys(shape.figures).length > 0, 'the money is asked by the project name');

  /* WHAT IT RUNS ON, ITS READINGS AND ITS REPEATING MONEY, each the answer `list` gives alone. */
  const alone = async (on: { list: string; field: string } | null, extra: Record<string, unknown>) =>
    on === null ? null : value<{ rows: unknown[] }>(await api.list({ register: on.list, where: `${on.field} is ${spoken}`, ...extra } as never, owner)).rows;
  const services = linkedListOf(decls, register, SHAPE_LINKED.services);
  assert.ok(services && shape.services, 'the seed keeps services on its projects');
  assert.deepEqual(shape.services.rows, await alone(services, { limit: 100 }));
  assert.ok(shape.services.rows.length > 0, 'the sample runs Kiln on a service');
  const readings = linkedListOf(decls, register, SHAPE_LINKED.readings);
  assert.deepEqual(shape.readings?.rows ?? null, await alone(readings, { limit: 2000, order: [{ field: 'at', dir: 'desc' }] }));
  const recurring = linkedListOf(decls, register, SHAPE_LINKED.recurring);
  assert.deepEqual(shape.recurring?.rows ?? null, await alone(recurring, { limit: 100 }));
  assert.ok(Array.isArray(shape.decided), 'what was decided about it is read');
  sql.close();
});

test('UNASKED, OR ON A PAGE THAT DRAWS NO PART, THE PAGE IS WHAT IT WAS', async () => {
  const { sql, api } = await record();
  const plain = value<Paged>(await api.page({ slug: 'kiln' }, owner));
  assert.equal(plain.shape, undefined, 'a caller that does not ask, an agent, is answered the page alone');
  const asked = value<Paged>(await api.page({ slug: 'kiln', shape: '1' }, owner));
  const { shape: _shape, ...rest } = asked;
  assert.deepEqual(rest, plain, 'the shape is beside the page and changes nothing of it');
  const money = value<Paged>(await api.page({ slug: 'money', shape: true }, owner));
  assert.equal(money.shape, undefined, 'a page about no project carries none');
  sql.close();
});

test('A MEMBER WHO MAY NOT READ THE WORK IS ANSWERED NO WORK, AS HER OWN READ OF IT IS', async () => {
  const { sql, api } = await record();
  const page = value<Paged>(await api.page({ slug: 'kiln', shape: true }, owner));
  const { register, seq } = page.shape!;
  const work = workListOf([...api.kernel.registers()].map(([, d]) => d as never), register)!;
  const member = { principal: { kind: 'person', id: 'p_2', level: null }, registers: [register], levels: { [register]: 'read' } } as CallContext;
  const theirs = await api.page({ slug: 'kiln', shape: true }, member);
  const shape = value<Paged>(theirs).shape;
  assert.ok(shape, 'she reads the project, so its page carries its shape');
  const alone = (await api.list({ register: work.list, where: `thing is ${register}#${seq}`, limit: 500 } as never, member)) as { ok: boolean };
  assert.equal(alone.ok, false, 'she may not read the work');
  assert.equal(shape.work, null, 'and the shape holds none of it');
  assert.deepEqual(shape.row, value(await api.get({ register, seq, values: true }, member)), 'the row is hers as her own read of it is');
  sql.close();
});

/* THE PAGE'S OWN BLOCK AND THE SHAPE DREW THE SAME KEY NUMBERS, each reading read twice in one call. */
test("THE SHAPE TAKES THE KEY NUMBERS THE PAGE'S OWN BLOCK DREW, and only a block that is this project's whole set", () => {
  const drawn = [{ kpi: 'k1', name: 'Revenue a month' }];
  const block = { kind: 'kpis', source: 'kpis', for: 'project', kpis: drawn, refusals: [] };
  assert.deepEqual(kpisDrawnOn([{ kind: 'note' }, block], 'things#1'), drawn);
  assert.notEqual(kpisDrawnOn([block], 'things#1'), drawn, 'the shape was handed the block\'s own array');
  assert.deepEqual(kpisDrawnOn([{ ...block, about: 'things#1' }], 'things#1'), drawn);
  /* Another project's, a cut set, Today's, a block not drawn, a refused one and a held shell are each asked for as before. */
  assert.equal(kpisDrawnOn([{ ...block, about: 'things#2' }], 'things#1'), null);
  assert.equal(kpisDrawnOn([{ ...block, limit: 3 }], 'things#1'), null);
  assert.equal(kpisDrawnOn([{ ...block, for: 'today' }], 'things#1'), null);
  assert.equal(kpisDrawnOn([{ ...block, drawn: false }], 'things#1'), null);
  assert.equal(kpisDrawnOn([{ ...block, refusals: [{ code: 'FORBIDDEN', fix: 'No.' }] }], 'things#1'), null);
  assert.equal(kpisDrawnOn([{ kind: 'kpis', source: 'kpis', for: 'project' }], 'things#1'), null);
  assert.equal(kpisDrawnOn([], 'things#1'), null);
});

test('A PAGE THAT DRAWS ITS KEY NUMBERS ANSWERS THE SHAPE THE SAME ONES, as the block alone answers them', async () => {
  const { api } = await record();
  const spoken = 'things#1';
  const page = value<{ blocks: { kind?: string; kpis?: unknown[] }[]; shape?: ShapeAnswer }>(await api.page({ slug: spoken, shape: '1' }, owner));
  const alone = value<{ blocks: { kpis?: unknown[] }[] }>(await api.previewPage({ body: { page: 'key-numbers', title: 'Key numbers', blocks: [{ kind: 'kpis', source: 'kpis', for: 'project', about: spoken }] } }, owner));
  assert.deepEqual(page.shape?.kpis ?? null, alone.blocks[0]!.kpis ?? null);
  const own = page.blocks.find((b) => b.kind === 'kpis');
  if (own?.kpis) assert.deepEqual(page.shape?.kpis, own.kpis);
});
