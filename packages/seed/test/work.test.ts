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

import { NOW, TASKS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';

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

test('WORK’S OVERVIEW AND BOARD OPEN ON THE SAMPLE WITH NO BLOCK REFUSED, and the figures count the sample’s rows', async () => {
  const k = await seeded();
  for (const slug of ['work', 'work-board']) for (const b of opened(k, slug).blocks) assert.deepEqual(b.refusals, [], `${slug} ${b.heading}`);

  const figures = Object.fromEntries((block(opened(k, 'work'), 'Right now').readings ?? []).map((r) => [r.metric, r.reading?.value]));
  assert.deepEqual(figures, {
    'open-tasks': TASKS.filter(live).length,
    'tasks-waiting': TASKS.filter((t) => t.state === 'review' || t.state === 'blocked').length,
    'tasks-due-7d': TASKS.filter((t) => live(t) && String(t.by) >= TODAY && String(t.by) < new Date(NOW + 8 * 86_400_000).toISOString().slice(0, 10)).length,
    'tasks-done-7d': TASKS.filter((t) => t.state === 'done' && String(t.done_on) > new Date(NOW - 8 * 86_400_000).toISOString().slice(0, 10)).length,
  });
  assert.ok(figures['tasks-waiting']! > 0, 'the sample shows a queue');
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

  /* HAND BACK: the agent finishes its part and it waits on a person, with the agent named as who changed it. */
  assert.ok(k.update('tasks', ref, { state: 'review', note: 'New key issued and the old one revoked. Check the deploy.' }, agent).ok);
  overview = opened(k, 'work');
  const queue = block(overview, 'Waiting on you');
  const at = queue.rows.findIndex((r) => r.fields.what === title);
  assert.ok(at >= 0, 'the handed-back task is not in the queue');
  assert.deepEqual([queue.changes?.[at]?.by, queue.changes?.[at]?.who], ['agent', 'agent:claude']);

  /* FINISH: a person checks it and marks it done on the day, and it leaves the queue for Done lately. */
  assert.ok(k.update('tasks', ref, { state: 'done', done_on: TODAY }, person).ok);
  overview = opened(k, 'work');
  assert.ok(!block(overview, 'Waiting on you').rows.some((r) => r.fields.what === title));
  assert.equal(block(overview, 'Done lately').rows[0]?.fields.what, title);
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
