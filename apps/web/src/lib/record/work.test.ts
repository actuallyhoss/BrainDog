/**
 * Work's pages in the two engines: the record's, over the sample installed into a real kernel, and this app's sample
 * engine, which draws the demo. They must name the same tasks in the same places and the same figures, or the demo
 * shows a Work page no real record would.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, TODAY, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { REGISTERS, columnHeading } from './api.ts';
import { page } from './fixtures/readers.ts';
import { TASKS } from './fixtures/sample.ts';
import { toSegments } from './blocks.ts';
import { relabelAll } from '../voice.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
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
  } as unknown as Sql;
}

const kernel = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

for (const slug of ['work', 'work-board'])
  test(`/p/${slug} DRAWS THE SAME TASKS, FIGURES AND WEEKS IN BOTH ENGINES`, async () => {
    const k = await kernel;
    const record = k.page(slug);
    assert.ok(record.ok, JSON.stringify(record));
    const demo = page(slug);
    assert.ok(demo, `the demo has no /p/${slug}`);
    assert.equal(demo.blocks.length, record.value.blocks.length);
    record.value.blocks.forEach((kb, i) => {
      const wb = demo.blocks[i]!;
      const at = `${slug}: ${String(kb.heading)}`;
      assert.deepEqual(kb.refusals, [], `${at}, the record: ${JSON.stringify(kb.refusals)}`);
      assert.deepEqual(wb.refusals, [], `${at}, the demo: ${wb.refusals.join('; ')}`);
      if (kb.kind === 'stat') {
        const figures = (kb.readings ?? []).map((r) => String(r.reading?.value));
        assert.deepEqual(wb.metrics?.map((m) => m.value), figures, at);
        return;
      }
      if (kb.kind === 'series') {
        assert.deepEqual(wb.bars, kb.bars, at);
        return;
      }
      if (kb.kind === 'bar') {
        assert.equal(wb.total, kb.matched, at);
        return;
      }
      assert.equal(wb.total, kb.matched, `${at}: how many matched`);
      /* A BOARD IS IN NO ORDER BUT ITS COLUMNS, which the drawing puts it in. */
      if (kb.kind === 'board') {
        assert.deepEqual(wb.entries.map((e) => String(e.fields.what)).sort(), kb.rows.map((r) => String(r.fields.what)).sort(), at);
        return;
      }
      assert.deepEqual(
        wb.entries.map((e) => e.fields.what),
        kb.rows.map((r) => r.fields.what),
        `${at}: the tasks, in order`,
      );
    });
  });

test('A COUNT BY WEEK IS DRAWN AS COUNTS, never in the home currency', () => {
  const series = page('work')!.blocks.find((b) => b.kind === 'series')!;
  const text = JSON.stringify(toSegments(series));
  assert.doesNotMatch(text, /£|GBP/u, text.slice(0, 300));
});

test('EACH CARD ON THE BOARD NAMES ITS OWN PROJECT once the cards are put in status order', () => {
  const board = page('work-board')!.blocks.find((b) => b.kind === 'board')!;
  const said = JSON.stringify(toSegments(board));
  /* Draft the September issue is Portage's, and sorting the cards used to hand it the project of another row. */
  assert.match(said, /Draft the September issue[^\]]*?Portage/u);
  assert.doesNotMatch(said, /Draft the September issue","Kiln/u);
});

test('TWO TASKS DUE ON ONE DAY ARE LISTED IN ONE ORDER BY BOTH ENGINES, newest first', async () => {
  const k = await kernel;
  const record = k.page('work');
  assert.ok(record.ok);
  const said = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.what));
  const kb = record.value.blocks.find((b) => b.heading === 'This week')!;
  const wb = page('work')!.blocks.find((b) => b.heading === 'This week')!;
  const pair = ['Check the September bank statement', 'Draft the September issue'];
  const days = new Set(kb.rows.filter((r) => pair.includes(String(r.fields.what))).map((r) => r.fields.by));
  assert.equal(days.size, 1, 'the sample keeps the two on one day');
  const order = (list: string[]) => list.filter((w) => pair.includes(w));
  assert.deepEqual(order(said(kb.rows)), pair, 'the record: the newer task first');
  assert.deepEqual(order(said(wb.entries)), order(said(kb.rows)), 'the sample agrees');
});

test('A TASK MADE DONE WITH NO DAY IS DATED TODAY BY BOTH ENGINES, and shows first under Done lately', async () => {
  const k = await kernel;
  const title = 'Send the specimen proofs to Kiln';
  const listed = k.list({ register: 'tasks', limit: 200 });
  assert.ok(listed.ok);
  assert.equal(listed.value.rows.find((r) => r.fields.what === title)?.fields.done_on, TODAY, 'the record');
  assert.equal(TASKS.find((t) => t.fields.what === title)?.fields.done_on, TODAY, 'the sample');
  const record = k.page('work');
  assert.ok(record.ok);
  const said = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.what));
  assert.equal(said(record.value.blocks.find((b) => b.heading === 'Done lately')!.rows)[0], title);
  assert.equal(said(page('work')!.blocks.find((b) => b.heading === 'Done lately')!.entries)[0], title);
});

test('OPEN DRAWS A LINE ON THE SAMPLE, worked back from the days tasks were finished', () => {
  const open = page('work')!.blocks.find((b) => b.kind === 'stat')!.metrics!.find((m) => m.label === 'Open')!;
  assert.ok(open.trend && open.trend.length === 56, 'eight weeks, a point a day');
  /* WORK KEPT FOR LATER IS NOT OPEN, on any day. */
  const live = TASKS.filter((t) => t.fields.state !== 'done' && t.fields.state !== 'dropped' && t.fields.state !== 'backlog').length;
  /* Yesterday the task finished today was still open. */
  assert.equal(open.trend.at(-1), live + TASKS.filter((t) => t.fields.done_on === TODAY).length);
  assert.ok(open.trend[0]! > open.trend.at(-1)!, 'more was open eight weeks ago, before the finished work was done');
});

test('A TASK COLUMN IS HEADED BY WHAT ONE ROW IS CALLED, in both engines, and a team whose tasks are Tickets reads Ticket', async () => {
  const k = await kernel;
  const record = k.page('work');
  assert.ok(record.ok);
  const heads = () => ({
    record: record.value.blocks.filter((b) => b.kind === 'table').map((b) => columnHeading('tasks', (b as { columns: { field: string; label?: string }[] }).columns[0]!)),
    demo: page('work')!.blocks.filter((b) => b.kind === 'table').map((b) => b.columns[0]!.label),
  });
  const plain = heads();
  assert.deepEqual(plain.record, plain.demo);
  assert.ok(plain.demo.length > 0 && plain.demo.every((h) => h === 'Task'), plain.demo.join(', '));
  relabelAll(REGISTERS, { tasks: 'Tickets', 'tasks:one': 'ticket' });
  try {
    const team = heads();
    assert.deepEqual(team.record, team.demo);
    assert.ok(team.demo.every((h) => h === 'Ticket'), team.demo.join(', '));
  } finally {
    relabelAll(REGISTERS, {});
  }
});

test('OPEN WORK BY PROJECT DRAWS NO BAR FOR TASKS WITH NO SIZE, so unsized work is not "No project 0 d"', () => {
  const bar = page('work')!.blocks.find((b) => b.heading === 'Open work by project')!;
  const said = (b: typeof bar) => JSON.stringify(toSegments(b));
  assert.match(said(bar), /No project/u, 'the sample sizes its tasks on no project');
  /* THE TASKS ON NO PROJECT LOSE THEIR SIZE: that row goes, and the sized ones stay. */
  const unsizedRest = { ...bar, matched: bar.matched.map((e) => (e.fields.thing ? e : { ...e, fields: { ...e.fields, effort: null } })) };
  assert.doesNotMatch(said(unsizedRest), /No project/u);
  assert.match(said(unsizedRest), /Kiln/u);
  /* NOTHING SIZED AT ALL: no bar, and no zero. */
  const unsized = { ...bar, matched: bar.matched.map((e) => ({ ...e, fields: { ...e.fields, effort: null } })) };
  assert.doesNotMatch(said(unsized), /No project|0 d/u, said(unsized).slice(0, 300));
});
