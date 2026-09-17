/**
 * Team board on Work's tasks (`usecases/team.ts`): a new team's record opens on tickets that are tasks, and a record that
 * installed Team 1.x with its own Tickets updates without losing a row, each ticket copied to a task with its cycle and
 * points on the cycle plan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument } from '../src/index.ts';
import { useCase, useCaseDocument } from '../src/usecases/index.ts';
import { dayOf, moduleDocument } from '../src/usecases/install.ts';
import { carryForward, type CarryIo } from '../src/usecases/links.ts';
import { EARLIER_TICKETS, TEAM } from '../src/usecases/team.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_owner' };

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
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
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

async function put(k: Kernel, doc: unknown): Promise<{ ok: boolean }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return install(pack, diff, hostFor(k), diff.planHash);
}

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice(9));

type Row = { id: string; seq: number | null; fields: Record<string, unknown> };
const rows = (k: Kernel, register: string): Row[] => value<{ rows: Row[] }>(k.list({ register, limit: 200 })).rows;

/** Team as 1.0.0 declared it: its cycles, its own Tickets, and a page over them. */
const TEAM_1 = {
  pack: 'usecase-team',
  version: '1.0.0',
  summary: 'Tickets with an owner and a status.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    TEAM.pack.declarations.find((d) => (d as { register?: string }).register === 'cycles'),
    { ...EARLIER_TICKETS, name: 'Tickets', one: 'ticket', holds: 'every piece of work the team has' },
    {
      page: 'board',
      title: 'Board',
      nav: { section: 'Board', order: 10 },
      requires: ['register.tickets'],
      blocks: [{ kind: 'board', heading: 'By status', span: 12, source: 'register.tickets', columns: [{ field: 'state' }, { field: 'what' }] }],
    },
  ],
};

test('A NEW TEAM IS NOT GIVEN A TICKETS LIST OF ITS OWN: its tickets are Work tasks, in its words', () => {
  const doc = useCaseDocument('team', TODAY)!;
  const lists = (doc.declarations as { register?: string }[]).flatMap((d) => (d.register ? [d.register] : []));
  assert.deepEqual(lists.sort(), ['cycle_plan', 'cycles']);
  assert.deepEqual(useCase('team')!.modules, ['portfolio', 'people', 'work']);
  assert.equal(useCase('team')!.labels.tasks, 'Tickets');
  /* EVERY FIELD A TICKET HAD IS SAID SOMEWHERE: on a task, or on the cycle plan. */
  type Decl = { register?: string; fields?: { id: string }[] };
  const task = new Set(((firstPartyDocument('work')!.declarations as Decl[]).find((d) => d.register === 'tasks')!.fields ?? []).map((f) => f.id));
  const planned = new Set(((doc.declarations as Decl[]).find((d) => d.register === 'cycle_plan')!.fields ?? []).map((f) => f.id));
  const onTask: Record<string, string> = { what: 'what', state: 'state', priority: 'priority', owner: 'owner', agent: 'agent', due: 'by', note: 'note' };
  for (const f of (EARLIER_TICKETS.fields as { id: string }[]).map((x) => x.id)) {
    if (f === 'tags') continue;
    if (f in onTask) assert.ok(task.has(onTask[f]!), `a ticket's ${f} has nowhere on a task`);
    else assert.ok(planned.has(f), `a ticket's ${f} has nowhere on the cycle plan`);
  }
});

test('A RECORD WITH TEAM 1.0.0 UPDATES TO TICKETS ON TASKS AND LOSES NOTHING', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const u = useCase('team')!;
  value(await put(k, moduleDocument(u, 'portfolio', { today: TODAY, holds: ['things'] })));
  value(await put(k, moduleDocument(u, 'people', { today: TODAY, holds: [...held(k), 'people'] })));
  value(await put(k, TEAM_1));

  const cycle = value<Row>(k.create('cycles', { name: 'Cycle 7', state: 'active' }, OWNER));
  const priya = value<Row>(k.create('people', { name: 'Priya Nair', role: 'collaborator' }, OWNER));
  value(k.create('tickets', { what: 'Ship the export', state: 'in_progress', priority: 'high', owner: priya.id, cycle: cycle.id, points: 3, due: '2026-09-10' }, OWNER));
  value(k.create('tickets', { what: 'Groom the backlog', state: 'backlog' }, OWNER));
  value(k.create('tickets', { what: 'Retire the old importer', state: 'done', agent: 'claude', cycle: cycle.id, points: 2 }, OWNER));

  /* WORK FIRST, as the update's modules name it. */
  value(await put(k, moduleDocument(u, 'work', { today: TODAY, holds: [...held(k), 'tasks', 'tracks', 'updates'] })));

  /* AN UPDATE THAT DROPPED THE LIST WOULD LEAVE THREE ROWS WITHOUT ONE, and is refused. */
  const bare = await put(k, useCaseDocument('team', TODAY));
  assert.equal(bare.ok, false, 'the record refuses to orphan the tickets');

  /* WITH THE LIST THE RECORD HOLDS KEPT, it goes in. */
  const examples = new Set(rows(k, 'tasks').map((t) => t.id));
  value(await put(k, useCaseDocument('team', TODAY, held(k))));
  assert.equal(k.count('tickets'), 3, 'every ticket is still there');

  const io: CarryIo = {
    rows: async (register) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, OWNER).ok,
    create: async (register, fields) => k.create(register, fields, OWNER).ok,
    clear: async (register, seq, field) => k.update(register, `${register}#${seq}`, { [field]: null }, OWNER).ok,
  };
  assert.equal(await carryForward(io, 'usecase-team', '1.0.0', TODAY), 3);
  assert.equal(await carryForward(io, 'usecase-team', '1.0.0', TODAY), 0, 'a second run copies nothing twice');
  assert.equal(await carryForward(io, 'usecase-team', '2.1.0', TODAY), 0, 'a record already on 2.1.0 moves nothing');

  const tasks = rows(k, 'tasks').filter((t) => !examples.has(t.id));
  assert.equal(tasks.length, 3);
  const by = (what: string) => tasks.find((t) => t.fields.what === what)!.fields;
  const shipped = by('Ship the export');
  assert.deepEqual([shipped.state, shipped.priority, shipped.owner, shipped.by], ['doing', 'high', priya.id, '2026-09-10']);
  assert.equal(by('Groom the backlog').state, 'backlog', 'a backlog ticket is still in the backlog');
  assert.equal(by('Retire the old importer').state, 'done');
  assert.equal(typeof by('Retire the old importer').done_on, 'string', 'a finished ticket is a finished task with its day');

  const planned = rows(k, 'cycle_plan').filter((p) => p.fields.what === 'Ship the export' || p.fields.what === 'Retire the old importer');
  assert.equal(planned.length, 2, 'the two tickets in a cycle are on the plan');
  const line = planned.find((p) => p.fields.what === 'Ship the export')!.fields;
  assert.deepEqual([line.cycle, line.points], [cycle.id, 3]);
  assert.equal(k.get(String(line.task))?.fields.what, 'Ship the export');

  type Page = { blocks: { heading?: string; refusals?: unknown[]; rows?: { fields: Record<string, unknown> }[] }[] };
  for (const slug of ['home-team', 'cycles', 'agent-work', 'work-board'])
    for (const b of value<Page>(k.page(slug)).blocks) assert.deepEqual(b.refusals ?? [], [], `${slug} ${b.heading}`);
  const board = value<Page>(k.page('work-board')).blocks;
  assert.ok(board.find((b) => b.heading === 'By status')!.rows!.some((r) => r.fields.what === 'Ship the export'));
  sql.close();
});

test('A RECORD THAT TOOK TEAM 2.0.0 PUTS ITS BACKLOG TICKETS BACK IN THE BACKLOG, and leaves one somebody moved since', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const u = useCase('team')!;
  value(await put(k, moduleDocument(u, 'portfolio', { today: TODAY, holds: ['things'] })));
  value(await put(k, moduleDocument(u, 'people', { today: TODAY, holds: [...held(k), 'people'] })));
  value(await put(k, TEAM_1));
  value(k.create('tickets', { what: 'Groom the backlog', state: 'backlog' }, OWNER));
  value(k.create('tickets', { what: 'Sketch the importer', state: 'backlog' }, OWNER));
  value(k.create('tickets', { what: 'Ship the export', state: 'to_do' }, OWNER));
  value(await put(k, moduleDocument(u, 'work', { today: TODAY, holds: [...held(k), 'tasks', 'tracks', 'updates'] })));
  value(await put(k, useCaseDocument('team', TODAY, held(k))));
  /* AS 2.0.0 COPIED THEM: every one To do. Then a person started one of the backlog tickets. */
  for (const what of ['Groom the backlog', 'Sketch the importer', 'Ship the export']) value(k.create('tasks', { what, state: 'open', priority: 'normal' }, OWNER));
  /* And somebody typed a To do task with a backlog ticket's title: it is not a copy, and it stays To do. */
  value(k.create('tasks', { what: 'Groom the backlog', state: 'open', note: 'Before the review' }, OWNER));
  const sketch = rows(k, 'tasks').find((t) => t.fields.what === 'Sketch the importer')!;
  value(k.update('tasks', `tasks#${sketch.seq}`, { state: 'doing' }, OWNER));

  const io: CarryIo = {
    rows: async (register) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, OWNER).ok,
    create: async (register, fields) => k.create(register, fields, OWNER).ok,
    clear: async (register, seq, field) => k.update(register, `${register}#${seq}`, { [field]: null }, OWNER).ok,
  };
  const before = k.count('tasks');
  assert.equal(await carryForward(io, 'usecase-team', '2.0.0', TODAY), 1);
  assert.equal(k.count('tasks'), before, 'no ticket is copied twice');
  const state = (what: string) => rows(k, 'tasks').find((t) => t.fields.what === what && t.fields.note !== 'Before the review')!.fields.state;
  assert.deepEqual([state('Groom the backlog'), state('Sketch the importer'), state('Ship the export')], ['backlog', 'doing', 'open']);
  assert.equal(rows(k, 'tasks').find((t) => t.fields.note === 'Before the review')!.fields.state, 'open', 'a typed task with the title was moved to the backlog');
  assert.equal(await carryForward(io, 'usecase-team', '2.0.0', TODAY), 0, 'a second run moves nothing');
  sql.close();
});
