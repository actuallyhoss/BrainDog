/**
 * Work's Waiting on you draws when each task falls due and which project it is on, under the reason it waits.
 *
 * THE PROJECT AND NOT WHO CHANGED IT LAST, SINCE the UI pass of 20 October (proj F10): every task on Work says its
 * project in the line under it, "7 Sep · Kiln", and who changed it last is on the task's own page.
 *
 * Commit c6e2a331 widened `todo` to four cells, the last two
 * drawn as one quiet line under the title, and said that Waiting on you got its due day back. It did not: the block
 * still declared two columns, `what` and `note`, so the page projected `title | detail |  | ` and the line under every
 * waiting task stayed empty. Measured by walking the seed's pages: `Waiting on you columns
 * ["what","note"]` beside `render todo kind: {"cells":4,"optional":2}`.
 *
 * WHAT IS DRAWN IS WHAT THE COLUMNS NAME, in order (`apps/web/src/lib/record/blocks.ts`, the projection from the
 * declaration), so the columns are the thing to hold. The rows and the kernel's `changes` are held too, because a
 * column the record cannot fill draws a blank line just as surely as a column nobody declared: the due day has to be
 * on every waiting task of the sample, and who changed it last has to come back for every row, with no refusal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { NOW, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
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

test('WAITING ON YOU DRAWS THE DUE DAY AND THE PROJECT, as the two facts under the reason it waits', async () => {
  const sql = openSqlite();
  const k: Kernel = await openRecord(sql, { now: () => NOW });
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const out = k.page('work');
  assert.ok(out.ok, sayOf(out));

  const waiting = out.value.blocks.find((b) => b.heading === 'Waiting on you');
  assert.ok(waiting, "Work's Overview has no block headed Waiting on you");
  assert.equal(waiting.kind, 'todo');
  assert.deepEqual(waiting.refusals, [], 'Waiting on you refused');

  /* THE TITLE, THE DETAIL, THEN THE TWO FACTS, because the third and fourth cells are the ones drawn as the quiet line. */
  const columns = (waiting.columns ?? []).map((c) => String(c.field));
  assert.deepEqual(columns, ['what', 'note', 'by', 'thing'], `Waiting on you draws ${columns.join(', ')}`);

  assert.ok(waiting.rows.length > 1, 'the sample needs waiting tasks for this to bite');
  const undated = waiting.rows.filter((r) => typeof r.fields.by !== 'string' || r.fields.by === '').map((r) => String(r.fields.what));
  assert.deepEqual(undated, [], 'a waiting task of the sample draws no due day');

  const placed = waiting.rows.filter((r) => r.fields.thing !== undefined && r.fields.thing !== null && r.fields.thing !== '');
  assert.ok(placed.length > 0, 'no waiting task of the sample says its project');
  sql.close();
});
