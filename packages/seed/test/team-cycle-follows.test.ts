/**
 * The team's burn-down fills itself (team 2.21.0): on a fresh team record with no agent at all, finishing a
 * ticket ticks the line that plans it, reopening it unticks the line, and each morning the record writes one cycle day
 * with how many planned lines are not ticked, and a second run that day writes none.
 *
 * THE SCRIPTS ARE THE PACK'S OWN, RUN AS A HOST RUNS THEM: each declaration's `source` imported as a module and handed
 * a `ctx` whose `list` is the kernel's own filter, and its writes handed back through `runActions`, as
 * `last-day.test.ts` runs Money's. So what is measured is Team's pack document as a use case installs it, the kernel's
 * rules and clock, and not a copy of them.
 *
 * RED FIRST: with `...TEAM_AUTOMATIONS` out of the pack's declarations, the line stays unticked and no day is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { TEAM, TEAM_AUTOMATIONS } from '../src/usecases/team.ts';

const DAY = 86_400_000;
const LEAD = { actor: 'p_1' };

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

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

const held = (k: Kernel): string[] =>
  (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

type Found = { id: string; seq: number; version: number; fields: Record<string, unknown> };
const shaped = (e: Entry): Found => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

/** The pack's source, run as a host's sandbox runs it: `list` through the kernel's filter, writes handed back. */
function sandbox(k: Kernel, now: () => number) {
  return async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: ({ op: 'update'; spoken: string; patch: unknown; version: number } | { op: 'create'; register: string; fields: unknown })[] = [];
    const ctx = {
      input: s.scripted.input,
      today: () => dayOf(now()),
      record: {
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
        get: async (id: string) => {
          const e = k.get(id);
          return e ? shaped(e) : null;
        },
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      write: (register: string, fields: unknown) => void writes.push({ op: 'create', register, fields }),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    await mod.default(ctx);
    return { writes: writes as never, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } };
  };
}

/** A fresh team record made the way onboarding makes one, with no examples and no agent, on a clock the test moves. */
async function teamRecord() {
  const u = useCase('team')!;
  const sql: NodeSql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'the-board', name: 'The Board', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const today = dayOf(NOW);
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today, holds }));
  }
  const carried = carriedDocument(u, today, null);
  assert.ok(carried, 'the team use case carries no pack');
  await put(k, carried);
  const run = sandbox(k, () => now);
  const execute = (async () => {
    throw new Error('the scripts fetch nothing');
  }) as never;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  /** The next morning: the clock moves past the rule's next turn, and the turn reaches its sandbox. */
  const morning = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key LIKE '%cycle_day_each_morning' AND state = 'pending'")?.due_at;
    assert.ok(due !== undefined, 'the morning rule holds no turn on the clock');
    now = Math.max(now, Date.parse(due)) + 60_000;
    await settle();
  };
  /** Later the same day, nothing on the clock due: the installed cycle day script run once more, its writes landed. */
  const again = async () => {
    now += 60 * 60_000;
    const decl = (k.declarations() as { id: string; body: unknown }[]).find((d) => d.id === 'script.cycle_day');
    assert.ok(decl, 'the record holds no cycle day script');
    const body = (typeof decl.body === 'string' ? JSON.parse(decl.body) : decl.body) as { source: string };
    const answer = await run({ scripted: { input: null, decl: { source: body.source } } } as never);
    const writes = ('writes' in answer ? answer.writes : []) as unknown as { op: string; register: string; fields: Record<string, unknown> }[];
    for (const w of writes) if (w.op === 'create') value(k.create(w.register, w.fields, { actor: 'script:cycle_day@v1' }));
    return writes.length;
  };
  const rows = (register: string) => value<{ rows: Entry[] }>(k.list({ register, limit: 200 })).rows;
  return { k, sql, settle, morning, again, rows, now: () => now };
}

test("Team's pack document carries its three rules and the two scripts they start, and nothing fetches or holds a key", () => {
  const decls = TEAM.pack.declarations as Record<string, unknown>[];
  for (const a of TEAM_AUTOMATIONS) assert.ok(decls.includes(a), `${String(a.rule ?? a.script)} is in no pack document`);
  const scripts = TEAM_AUTOMATIONS.filter((a) => typeof a.script === 'string');
  assert.deepEqual(scripts.map((s) => s.script), ['plan_follows_ticket', 'cycle_day']);
  for (const s of scripts) assert.deepEqual([s.pack, s.runs, s.egress, s.keys], ['usecase-team', { rule: true }, [], []]);
  const started = TEAM_AUTOMATIONS.flatMap((a) => (Array.isArray(a.steps) ? (a.steps as { script: { id: string } }[]).map((st) => st.script.id) : []));
  for (const id of started) assert.ok(scripts.some((s) => s.script === id), `a rule starts ${id}, which no script declares`);
});

test('on a record with no agent, finishing a ticket ticks its planned line, reopening unticks it, and the morning writes one cycle day', async () => {
  const r = await teamRecord();
  const cycle = value<Entry>(r.k.create('cycles', { name: `${PROJECTS[0]} cycle 1`, state: 'active', starts: dayOf(r.now()), ends: dayOf(r.now() + 13 * DAY) }, LEAD));
  const ticket = (what: string) => value<Entry>(r.k.create('tasks', { what, state: 'open' }, LEAD));
  const tickets = [ticket(`Draft ${PEOPLE[1]!.name}'s onboarding page`), ticket('Fix the sign-in redirect'), ticket('Write the release notes')];
  const planned = tickets.map((t, i) => value<Entry>(r.k.create('cycle_plan', { what: String(t.fields.what), task: t.id, cycle: cycle.id, points: i + 1 }, LEAD)));
  await r.settle();
  assert.ok(planned.every((p) => r.k.get(p.id)!.fields.done === false), 'a planned line started ticked');

  /* DONE TICKS IT, AND ONLY ITS OWN LINE. */
  value(r.k.update('tasks', tickets[0]!.id, { state: 'done' }, LEAD));
  await r.settle();
  assert.equal(r.k.get(planned[0]!.id)!.fields.done, true, 'finishing the ticket left its planned line unticked');
  assert.equal(r.k.get(planned[1]!.id)!.fields.done, false);

  /* REOPENED, IT IS UNTICKED. */
  value(r.k.update('tasks', tickets[0]!.id, { state: 'doing' }, LEAD));
  await r.settle();
  assert.equal(r.k.get(planned[0]!.id)!.fields.done, false, 'reopening the ticket left its planned line ticked');

  /* AN EDIT TO A TICKET'S WORDS MOVES NOTHING. */
  value(r.k.update('tasks', tickets[1]!.id, { state: 'done' }, LEAD));
  await r.settle();
  value(r.k.update('tasks', tickets[1]!.id, { what: 'Fix the sign-in redirect on mobile' }, LEAD));
  await r.settle();
  assert.equal(r.k.get(planned[1]!.id)!.fields.done, true);

  /* THE MORNING: one cycle day, with the two lines still open, written by nobody. */
  await r.morning();
  const days = r.rows('cycle_days');
  assert.equal(days.length, 1, JSON.stringify(days.map((d) => d.fields)));
  assert.deepEqual([days[0]!.fields.day, days[0]!.fields.open, days[0]!.fields.cycle], [dayOf(r.now()), 2, cycle.id]);

  /* AND A SECOND RUN THE SAME DAY WRITES NONE. */
  assert.equal(await r.again(), 0, 'a second run the same day wrote something');
  assert.equal(r.rows('cycle_days').length, 1, 'a second run the same day wrote a second cycle day');

  /* THE NEXT MORNING WRITES THE NEXT DAY. */
  value(r.k.update('tasks', tickets[2]!.id, { state: 'done' }, LEAD));
  await r.settle();
  await r.morning();
  const next = r.rows('cycle_days').map((d) => [d.fields.day, d.fields.open]).sort();
  assert.deepEqual(next.map((d) => d[1]), [2, 1]);
  r.sql.close();
});

test('a day a teammate already wrote for the cycle is kept, and the morning writes none beside it', async () => {
  const r = await teamRecord();
  const cycle = value<Entry>(r.k.create('cycles', { name: `${PROJECTS[1]} cycle 1`, state: 'active' }, LEAD));
  await r.settle();
  const due = r.sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key LIKE '%cycle_day_each_morning' AND state = 'pending'")!.due_at;
  value(r.k.create('cycle_days', { day: dayOf(Date.parse(due) + 60_000), open: 9, cycle: cycle.id }, LEAD));
  await r.morning();
  const days = r.rows('cycle_days');
  assert.deepEqual(days.map((d) => d.fields.open), [9]);
  r.sql.close();
});

test('no active cycle, no cycle day', async () => {
  const r = await teamRecord();
  value(r.k.create('cycles', { name: `${PROJECTS[2]} cycle`, state: 'planned' }, LEAD));
  await r.morning();
  assert.equal(r.rows('cycle_days').length, 0);
  r.sql.close();
});

test('a ticket planned after it was finished is ticked by the morning and not counted, and a line ticked by hand stays ticked', async () => {
  const r = await teamRecord();
  const cycle = value<Entry>(r.k.create('cycles', { name: `${PROJECTS[0]} cycle 2`, state: 'active' }, LEAD));
  const finished = value<Entry>(r.k.create('tasks', { what: 'Ship the export button', state: 'done' }, LEAD));
  const open = value<Entry>(r.k.create('tasks', { what: `Call ${PEOPLE[2]!.name} about the import`, state: 'open' }, LEAD));
  const late = value<Entry>(r.k.create('cycle_plan', { what: 'Ship the export button', task: finished.id, cycle: cycle.id }, LEAD));
  const byHand = value<Entry>(r.k.create('cycle_plan', { what: 'Call about the import', task: open.id, cycle: cycle.id, done: true }, LEAD));
  const loose = value<Entry>(r.k.create('cycle_plan', { what: 'Agree what goes in the next sprint', cycle: cycle.id }, LEAD));
  await r.settle();
  assert.equal(r.k.get(late.id)!.fields.done, false, 'a line planned after its ticket was done was ticked before the morning');
  await r.morning();
  assert.equal(r.k.get(late.id)!.fields.done, true, 'the morning left a done ticket planned and unticked');
  assert.equal(r.k.get(byHand.id)!.fields.done, true, 'the morning unticked a line somebody ticked by hand');
  assert.equal(r.k.get(loose.id)!.fields.done, false);
  assert.deepEqual(r.rows('cycle_days').map((d) => d.fields.open), [1]);
  r.sql.close();
});
