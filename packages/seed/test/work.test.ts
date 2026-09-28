/**
 * Work as a pack, on a real record: the figures its Overview leads with, the queue that waits on a person, and an
 * agent taking, splitting, handing back and finishing a task through the same write path an agent's tools use, with
 * the page saying who did each thing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, TASKS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

const block = (p: PageResult, heading: string) => {
  const b = p.blocks.find((x) => x.heading === heading);
  assert.ok(b, `${p.slug ?? 'the page'} has no ${heading}`);
  assert.deepEqual(b.refusals, [], `${heading}: ${JSON.stringify(b.refusals)}`);
  return b;
};

const TODAY = new Date(NOW).toISOString().slice(0, 10);
const live = (t: (typeof TASKS)[number]) => t.state !== 'done' && t.state !== 'dropped';
/** What Open counts: work in play that is not kept for later. */
const open = (t: (typeof TASKS)[number]) => live(t) && t.state !== 'backlog';

test('WORK’S OVERVIEW AND BOARD OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s rows', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  const figures = Object.fromEntries((block(opened(k, 'work'), 'Right now').readings ?? []).map((r) => [r.metric, r.reading?.value]));
  assert.deepEqual(figures, {
    'open-tasks': TASKS.filter(open).length,
    'tasks-waiting': TASKS.filter((t) => t.state === 'review' || t.state === 'blocked').length,
    'tasks-due-7d': TASKS.filter((t) => live(t) && String(t.by) >= TODAY && String(t.by) < new Date(NOW + 8 * 86_400_000).toISOString().slice(0, 10)).length,
    'tasks-done-7d': TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length,
  });
  assert.ok(figures['tasks-waiting']! > 0, 'the sample shows a queue');
});

/**
 * WORK'S OVERVIEW LEADS WITH WHAT TO DO, AS LISTS THAT TICK (`loop/research-modules-next.md` brief 3). It drew every
 * list as a `table`, so a task could be finished from the Board and from a project's page, which declares a `todo` over
 * the same register, and not from Work's own Overview: the tick the host already wires onto a `todo` row had nothing
 * on this page to land on.
 */
test('WORK’S OVERVIEW LEADS WITH WHAT IS DUE, AS LISTS THAT TICK, and no task in play on it is drawn where it cannot be ticked', async () => {
  const k = await seeded();
  const page = opened(k, 'work');
  const headings = page.blocks.map((b) => b.heading);
  /* THE CAPTURE LINE COMES FIRST (MOD-12), so a task is written down before anything is read. */
  assert.deepEqual(headings.slice(0, 4), ['What needs doing?', 'Right now', 'Today', 'This week'], headings.join(', '));

  /* PAST ITS DATE IS TODAY'S, because it is still the next thing to do. The sample's is four days late. */
  const today = block(page, 'Today');
  assert.equal(today.kind, 'todo');
  assert.ok(today.rows.some((r) => r.fields.what === 'Turn auto-renew back on for kilnfonts.example'), 'the late task is not under Today');

  /* NOT THE BAR, which reads every task in play to add up their effort and draws a project per bar, never a task. */
  const untickable = page.blocks
    .filter((b) => b.kind !== 'todo' && b.kind !== 'bar')
    .flatMap((b) => b.rows.filter((r) => typeof r.fields.what === 'string' && !['done', 'dropped'].includes(String(r.fields.state))).map((r) => `${b.heading}: ${String(r.fields.what)}`));
  assert.deepEqual(untickable, [], 'a task in play drawn in a block with no tick');
});

test('OPEN LEAVES OUT WORK KEPT FOR LATER AND SAYS IT BESIDE, and the sample board draws a Later column', async () => {
  const k = await seeded();
  const later = TASKS.filter((t) => t.state === 'backlog').length;
  assert.ok(later > 0, 'the sample keeps a task for later');
  assert.ok(TASKS.filter(live).length > TASKS.filter(open).length);
  const note = (block(opened(k, 'work'), 'Right now') as { cells?: { metric: string; note?: string }[] }).cells?.find((c) => c.metric === 'open-tasks')?.note;
  assert.ok(String(note).includes('{{tasks-later}} kept for later'),'Open says what is kept for later beside it');
  const read = k.metric(METRICS['tasks-later'] as never);
  assert.ok(read.ok, sayOf(read));
  assert.equal(read.value.value, later);
  assert.ok(block(opened(k, 'work-board'), 'By status').rows.some((r) => r.fields.state === 'backlog'), 'no Later column on the board');
});

test('THE BOARD HAS A COLUMN FOR WORK AN AGENT HANDED BACK, and progress is counted by the week work was finished', async () => {
  const k = await seeded();
  const board = block(opened(k, 'work-board'), 'By status');
  assert.ok(board.rows.some((r) => r.fields.state === 'review'));
  const series = block(opened(k, 'work'), 'Done, and due ahead');
  assert.equal(series.bars?.bucket, 'week');
  assert.equal(series.bars?.unit, null, 'counts, not money');
  const past = series.bars!.states.flatMap((s, i) => (s === '' ? [series.bars!.values[0]![i] ?? 0] : []));
  assert.ok(past.reduce((n, v) => n + (v ?? 0), 0) > 0, 'nothing finished in the weeks drawn');
});

test('AN AGENT TAKES A TASK, SPLITS IT, HANDS IT BACK AND A PERSON FINISHES IT, and the page says who did each', async () => {
  const k = await seeded();
  const agent = { actor: 'agent:claude' };
  const person = { actor: 'p_1' };
  const title = 'Rotate the Fenwick deploy key';
  const seq = TASKS.findIndex((t) => t.what === title) + 1;
  const ref = `tasks#${seq}`;

  /* TAKE: the agent sets itself on the task and starts it. */
  assert.ok(k.update('tasks', ref, { agent: 'claude', state: 'doing' }, agent).ok);
  let overview = opened(k, 'work');
  assert.ok(block(overview, 'With an agent').rows.some((r) => r.fields.what === title));

  /* SPLIT: two steps, each part of the task. */
  for (const what of ['Issue the new Fenwick key', 'Revoke the old Fenwick key'])
    assert.ok(k.create('tasks', { what, state: 'open', parent: ref, agent: 'claude', by: TODAY }, agent).ok);
  const all = k.list({ register: 'tasks', limit: 200 });
  assert.ok(all.ok);
  const parent = all.value.rows.find((r) => r.seq === seq)!;
  assert.equal(all.value.rows.filter((r) => r.fields.parent === parent.id).length, 2, 'both steps are part of the task');

  /* HAND BACK: the agent finishes its part and it waits on a person, with what the agent said as the reason.
     UNTIL WORK 1.6.0 THE QUEUE ALSO NAMED WHO CHANGED IT, in a Changed by column, and this asserted `agent:claude`
     there. The queue is a `todo` now so that it can be ticked, a `todo` draws the task and one detail, and the brief
     gives that detail to the note. Who handed it back is still on the row's history, not on this page. */
  assert.ok(k.update('tasks', ref, { state: 'review', note: 'New key issued and the old one revoked. Check the deploy.' }, agent).ok);
  overview = opened(k, 'work');
  const queue = block(overview, 'Waiting on you');
  const at = queue.rows.findIndex((r) => r.fields.what === title);
  assert.ok(at >= 0, 'the handed-back task is not in the queue');
  assert.equal(queue.rows[at]!.fields.note, 'New key issued and the old one revoked. Check the deploy.');

  /* FINISH: a person checks it and marks it done, the record dates it, and it leaves the queue for Done lately. */
  assert.ok(k.update('tasks', ref, { state: 'done' }, person).ok);
  assert.equal(k.get(ref)!.fields.done_on, TODAY, 'the record fills the day it was finished');
  overview = opened(k, 'work');
  assert.ok(!block(overview, 'Waiting on you').rows.some((r) => r.fields.what === title));
  assert.ok(block(overview, 'Done lately').rows.some((r) => r.fields.what === title));
  const done = (block(overview, 'Right now').readings ?? []).find((r) => r.metric === 'tasks-done-7d');
  assert.equal(done?.reading?.value, TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length + 1);
});

test('WORK NEEDS NO PEOPLE: who holds a task is a link, left out on a record without People', () => {
  const manifest = firstPartyManifest('work');
  assert.ok(!manifest.requires.includes('register.people'), manifest.requires.join(', '));
  assert.ok(manifest.links.includes('register.people'));
  const doc = firstPartyDocument('work', { holds: ['things', 'tasks', 'tracks', 'updates'] })!;
  const tasks = (doc.declarations as { register?: string; fields?: { id: string }[] }[]).find((d) => d.register === 'tasks')!;
  assert.ok(!tasks.fields!.some((f) => f.id === 'owner'));
  assert.ok(tasks.fields!.some((f) => f.id === 'agent'), 'the agent is the pack’s own field and stays');
});

test('WORK INSTALLS ALONE: a homework list with no Projects and no People, its pages open and a task is written', async () => {
  const { install, normalise, plan } = await import('@braindog/declare');
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.deepEqual(firstPartyManifest('work').requires, [], 'Work needs no other module');

  const doc = firstPartyDocument('work', { holds: ['tasks', 'tracks', 'updates'], seeds: [] })!;
  const packed = await normalise(doc, { kind: 'local' });
  assert.ok(packed.ok, sayOf(packed));
  const state = {
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations(),
    rows: k.census(),
  } as Parameters<typeof plan>[1];
  const diff = await plan(packed.value, state);
  const put = await install(
    packed.value,
    diff,
    {
      count: (register) => k.count(register),
      stage: (batch) => k.stageInstall(batch as never),
      transaction: (fn) => k.transaction(fn),
      reload: () => k.reload(),
      retire: (ids) => k.retire(ids),
      seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
      remember: (row) => k.rememberPack(row),
      forget: (id) => k.forgetPack(id),
      claimed: (pack) => k.packClaims(pack),
    },
    diff.planHash,
  );
  assert.ok(put.ok, sayOf(put));

  const tasks = (doc.declarations as { register?: string; fields?: { id: string }[] }[]).find((d) => d.register === 'tasks')!;
  assert.ok(!tasks.fields!.some((f) => f.id === 'thing' || f.id === 'owner'), 'no project and no owner on a record without them');

  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'open', by: TODAY }, { actor: 'p_1' }).ok);
  const overview = opened(k, 'work');
  for (const b of overview.blocks) assert.deepEqual(b.refusals, [], `work ${b.heading}`);
  assert.ok(!overview.blocks.some((b) => b.heading === 'Open work by project'), 'the bar by project is left out, not drawn empty');
  assert.ok(block(overview, 'Today').rows.some((r) => r.fields.what === 'Problem set 3'));
  for (const b of opened(k, 'work-board').blocks) assert.deepEqual(b.refusals, [], `work-board ${b.heading}`);
});

test('OPEN IS REMEMBERED EACH DAY, so its figure draws a line once the record has run a night', async () => {
  let now = NOW;
  const k = await openRecord(openSqlite(), { now: () => now });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const cell = () => (block(opened(k, 'work'), 'Right now').readings ?? []).find((r) => r.metric === 'open-tasks');
  assert.equal(cell()?.trend, undefined, 'no line is drawn before a snapshot has run');

  /* THE NEXT NIGHT: the snapshot armed at install runs, and yesterday's count is written. */
  now = NOW + 86_400_000;
  await k.drain();
  const trend = cell()?.trend;
  assert.ok(trend, 'Open has a line after the first night');
  assert.equal(trend!.at(-1), TASKS.filter(open).length, 'the last point is the day before, counted as it stood');
});
