/**
 * Work's pages in the two engines: the record's, over the sample installed into a real kernel, and this app's sample
 * engine, which draws the demo. They must name the same tasks in the same places and the same figures, or the demo
 * shows a Work page no real record would.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { page } from './api.ts';
import { toSegments } from './blocks.ts';

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
  const kb = record.value.blocks.find((b) => b.heading === 'Due soon')!;
  const wb = page('work')!.blocks.find((b) => b.heading === 'Due soon')!;
  const pair = ['Check the September bank statement', 'Draft the September issue'];
  const days = new Set(kb.rows.filter((r) => pair.includes(String(r.fields.what))).map((r) => r.fields.by));
  assert.equal(days.size, 1, 'the sample keeps the two on one day');
  const order = (list: string[]) => list.filter((w) => pair.includes(w));
  assert.deepEqual(order(said(kb.rows)), pair, 'the record: the newer task first');
  assert.deepEqual(order(said(wb.entries)), order(said(kb.rows)), 'the sample agrees');
});
